import {
  cleanText,
  normalizeAttachments,
  normalizeChatConversation,
  normalizeChatMessage,
  normalizeStringArray,
  safeJsonParse,
  safeJsonStringify,
  nowIso
} from './message-normalize.js'
import { diagnoseCapabilityIssue, resolveChatCapability } from './capability-core.js'
import { fillMissingCustomerNames } from './conversation-repair-core.js'
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from './ai-settings-defaults.js'
import { compactLegacyZaloBrowserAliases } from './zalo-legacy-dedupe-core.js'

const DEFAULT_SETTINGS = DEFAULT_AI_SETTINGS

function memoryStore(env) {
  if (!env.__CHAT_CORE_MEMORY) {
    env.__CHAT_CORE_MEMORY = {
      conversations: [],
      messages: [],
      settings: { ...DEFAULT_SETTINGS },
      ai_suggestions: [],
      ai_knowledge_base: []
    }
  }
  return env.__CHAT_CORE_MEMORY
}

function rowToConversation(row = {}, env = {}) {
  const conversation = normalizeChatConversation({
    ...row,
    tags: safeJsonParse(row.tags, []),
    ...resolveChatCapability(env, row)
  })
  return { ...conversation, sync_health: computeSyncHealth(row) }
}

function computeSyncHealth(row = {}) {
  if (cleanText(row.last_error_code)) return 'critical'
  const timestamp = Date.parse(cleanText(row.last_synced_at))
  if (!Number.isFinite(timestamp)) return 'unknown'
  const ageMinutes = Math.max((Date.now() - timestamp) / 60000, 0)
  if (ageMinutes > 30) return 'critical'
  if (ageMinutes >= 5) return 'stale'
  return 'ok'
}

function rowToMessage(row = {}) {
  return normalizeChatMessage({
    ...row,
    attachments: safeJsonParse(row.attachments, []),
    product_ids: safeJsonParse(row.product_ids, [])
  })
}

export async function ensureChatCoreTables(env) {
  if (!env?.DB) {
    memoryStore(env || {})
    return { mode: 'memory' }
  }
  if (env.__CHAT_CORE_TABLES_READY) return { mode: 'd1', cached: true }

  const statements = [
    `CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      shop_id TEXT DEFAULT '',
      shop_display_name TEXT DEFAULT '',
      shop_name_source TEXT DEFAULT '',
      shop_profile_source TEXT DEFAULT '',
      shop_name_missing INTEGER DEFAULT 0,
      customer_id TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      platform_conversation_id TEXT DEFAULT '',
      last_message_text TEXT DEFAULT '',
      last_message_at TEXT DEFAULT '',
      unread_count INTEGER DEFAULT 0,
      assigned_to TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'open',
      shop_chat_mode TEXT DEFAULT '',
      send_capability TEXT DEFAULT '',
      sync_capability TEXT DEFAULT '',
      last_synced_at TEXT DEFAULT '',
      last_success_at TEXT DEFAULT '',
      last_error_code TEXT DEFAULT '',
      last_error_message TEXT DEFAULT '',
      pulled_conversations INTEGER DEFAULT 0,
      pulled_messages INTEGER DEFAULT 0,
      saved_messages INTEGER DEFAULT 0,
      skipped_duplicates INTEGER DEFAULT 0,
      last_message_timestamp TEXT DEFAULT '',
      sync_cursor TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      shop_id TEXT DEFAULT '',
      conversation_id TEXT NOT NULL,
      customer_id TEXT DEFAULT '',
      sender_type TEXT DEFAULT '',
      sender_name TEXT DEFAULT '',
      text TEXT DEFAULT '',
      attachments TEXT DEFAULT '[]',
      status TEXT DEFAULT 'synced',
      platform_message_id TEXT DEFAULT '',
      client_temp_id TEXT DEFAULT '',
      reply_to_message_id TEXT DEFAULT '',
      order_id TEXT DEFAULT '',
      product_ids TEXT DEFAULT '[]',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      source TEXT DEFAULT '',
      raw_payload_ref TEXT DEFAULT '',
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS chat_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS ai_suggestions (
      id TEXT PRIMARY KEY,
      conversation_id TEXT DEFAULT '',
      message_id TEXT DEFAULT '',
      suggested_text TEXT DEFAULT '',
      prompt_context TEXT DEFAULT '{}',
      policy_status TEXT DEFAULT 'needs_review',
      user_feedback TEXT DEFAULT '',
      final_state TEXT DEFAULT 'draft',
      final_message_sent TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS ai_knowledge_base (
      id TEXT PRIMARY KEY,
      question TEXT DEFAULT '',
      answer TEXT DEFAULT '',
      channel TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      approved_by TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      use_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS chat_sync_state (
      channel TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      last_synced_at TEXT DEFAULT '',
      last_success_at TEXT DEFAULT '',
      last_error_code TEXT DEFAULT '',
      last_error_message TEXT DEFAULT '',
      pulled_conversations INTEGER DEFAULT 0,
      pulled_messages INTEGER DEFAULT 0,
      saved_messages INTEGER DEFAULT 0,
      skipped_duplicates INTEGER DEFAULT 0,
      sync_cursor TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      PRIMARY KEY(channel, shop_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_conversations_scope ON chat_conversations(channel, shop_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(conversation_id, created_at, id)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_platform_id ON chat_messages(channel, shop_id, platform_message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_client_temp ON chat_messages(channel, shop_id, client_temp_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_channel ON ai_knowledge_base(channel, shop_id)`
  ]

  for (const sql of statements) await env.DB.prepare(sql).run()
  await ensureConversationCapabilityColumns(env)
  env.__CHAT_CORE_TABLES_READY = true
  return { mode: 'd1' }
}

async function ensureTableColumn(env, tableName, columnName, definition) {
  const tableInfo = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all()
  const exists = (tableInfo.results || []).some(row => row.name === columnName)
  if (!exists) {
    try {
      await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run()
    } catch (error) {
      // D1 có thể nhận hai request migration cùng lúc sau deploy; duplicate column lúc này là trạng thái đã đạt.
      if (/duplicate column name/i.test(String(error?.message || error))) return
      throw error
    }
  }
}

async function ensureConversationCapabilityColumns(env) {
  await ensureTableColumn(env, 'chat_conversations', 'shop_display_name', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'shop_name_source', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'shop_profile_source', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'shop_name_missing', 'INTEGER DEFAULT 0')
  await ensureTableColumn(env, 'chat_conversations', 'customer_name', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'shop_chat_mode', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'send_capability', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'sync_capability', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'last_synced_at', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'last_success_at', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'last_error_code', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'last_error_message', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'pulled_conversations', 'INTEGER DEFAULT 0')
  await ensureTableColumn(env, 'chat_conversations', 'pulled_messages', 'INTEGER DEFAULT 0')
  await ensureTableColumn(env, 'chat_conversations', 'saved_messages', 'INTEGER DEFAULT 0')
  await ensureTableColumn(env, 'chat_conversations', 'skipped_duplicates', 'INTEGER DEFAULT 0')
  await ensureTableColumn(env, 'chat_conversations', 'last_message_timestamp', "TEXT DEFAULT ''")
  await ensureTableColumn(env, 'chat_conversations', 'sync_cursor', "TEXT DEFAULT ''")
}

export async function getChatSettings(env) {
  await ensureChatCoreTables(env)
  if (!env?.DB) return { ...DEFAULT_SETTINGS, ...memoryStore(env).settings }
  const row = await env.DB.prepare('SELECT settings_json FROM chat_settings WHERE id = 1').first()
  return { ...DEFAULT_SETTINGS, ...safeJsonParse(row?.settings_json, {}) }
}

export async function saveChatSettings(env, settings = {}) {
  await ensureChatCoreTables(env)
  const current = await getChatSettings(env)
  const normalized = normalizeAiSettings(current, settings)
  const next = {
    ...normalized,
    allow_auto_send: normalized.allow_auto_send === true,
    force_history: Object.prototype.hasOwnProperty.call(settings, 'force_history')
      ? settings.force_history === true
      : current.force_history === true
  }
  const stamp = nowIso()
  if (!env?.DB) {
    memoryStore(env).settings = next
    return next
  }
  await env.DB.prepare(`
    INSERT INTO chat_settings (id, settings_json, updated_at, created_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
  `).bind(safeJsonStringify(next, '{}'), stamp, stamp).run()
  return next
}

export async function saveConversation(env, input = {}) {
  await ensureChatCoreTables(env)
  const conversation = normalizeChatConversation({
    ...input,
    ...resolveChatCapability(env, input)
  })
  if (!env?.DB) {
    const store = memoryStore(env)
    const index = store.conversations.findIndex(item => item.id === conversation.id)
    if (index >= 0) store.conversations[index] = { ...store.conversations[index], ...conversation }
    else store.conversations.push(conversation)
    return conversation
  }
  await env.DB.prepare(`
    INSERT INTO chat_conversations
      (id, channel, shop_id, shop_display_name, shop_name_source, shop_profile_source, shop_name_missing,
       customer_id, customer_name, platform_conversation_id, last_message_text, last_message_at,
       unread_count, assigned_to, tags, status, shop_chat_mode, send_capability, sync_capability,
       last_synced_at, last_success_at, last_error_code, last_error_message,
       pulled_conversations, pulled_messages, saved_messages, skipped_duplicates,
       last_message_timestamp, sync_cursor, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      channel = excluded.channel,
      shop_id = excluded.shop_id,
      shop_display_name = CASE WHEN excluded.shop_display_name != '' THEN excluded.shop_display_name ELSE chat_conversations.shop_display_name END,
      shop_name_source = CASE WHEN excluded.shop_name_source != '' THEN excluded.shop_name_source ELSE chat_conversations.shop_name_source END,
      shop_profile_source = CASE WHEN excluded.shop_profile_source != '' THEN excluded.shop_profile_source ELSE chat_conversations.shop_profile_source END,
      shop_name_missing = excluded.shop_name_missing,
      customer_id = excluded.customer_id,
      customer_name = CASE WHEN excluded.customer_name != '' THEN excluded.customer_name ELSE chat_conversations.customer_name END,
      platform_conversation_id = excluded.platform_conversation_id,
      last_message_text = excluded.last_message_text,
      last_message_at = excluded.last_message_at,
      unread_count = excluded.unread_count,
      assigned_to = excluded.assigned_to,
      tags = excluded.tags,
      status = excluded.status,
      shop_chat_mode = excluded.shop_chat_mode,
      send_capability = excluded.send_capability,
      sync_capability = excluded.sync_capability,
      last_synced_at = CASE WHEN excluded.last_synced_at != '' THEN excluded.last_synced_at ELSE chat_conversations.last_synced_at END,
      last_success_at = CASE WHEN excluded.last_success_at != '' THEN excluded.last_success_at ELSE chat_conversations.last_success_at END,
      last_error_code = excluded.last_error_code,
      last_error_message = excluded.last_error_message,
      pulled_conversations = excluded.pulled_conversations,
      pulled_messages = excluded.pulled_messages,
      saved_messages = excluded.saved_messages,
      skipped_duplicates = excluded.skipped_duplicates,
      last_message_timestamp = CASE WHEN excluded.last_message_timestamp != '' THEN excluded.last_message_timestamp ELSE chat_conversations.last_message_timestamp END,
      sync_cursor = CASE WHEN excluded.sync_cursor != '' THEN excluded.sync_cursor ELSE chat_conversations.sync_cursor END,
      updated_at = excluded.updated_at
  `).bind(
    conversation.id,
    conversation.channel,
    conversation.shop_id,
    conversation.shop_display_name,
    conversation.shop_name_source,
    conversation.shop_profile_source,
    conversation.shop_name_missing ? 1 : 0,
    conversation.customer_id,
    conversation.customer_name,
    conversation.platform_conversation_id,
    conversation.last_message_text,
    conversation.last_message_at,
    conversation.unread_count,
    conversation.assigned_to,
    safeJsonStringify(conversation.tags, '[]'),
    conversation.status,
    conversation.shop_chat_mode,
    conversation.send_capability,
    conversation.sync_capability,
    conversation.last_synced_at,
    conversation.last_success_at,
    conversation.last_error_code,
    conversation.last_error_message,
    conversation.pulled_conversations,
    conversation.pulled_messages,
    conversation.saved_messages,
    conversation.skipped_duplicates,
    conversation.last_message_timestamp,
    conversation.sync_cursor,
    conversation.updated_at,
    conversation.created_at
  ).run()
  return conversation
}

export async function saveChatSyncState(env, input = {}) {
  await ensureChatCoreTables(env)
  const channel = cleanText(input.channel || input.platform).toLowerCase()
  const shopId = cleanText(input.shop_id || input.shop)
  if (!channel || !shopId) return null
  const stamp = cleanText(input.updated_at) || nowIso()
  const state = {
    channel,
    shop_id: shopId,
    last_synced_at: cleanText(input.last_synced_at) || stamp,
    last_success_at: cleanText(input.last_success_at),
    last_error_code: cleanText(input.last_error_code || input.error_code),
    last_error_message: cleanText(input.last_error_message || input.error_message),
    pulled_conversations: Math.max(Number(input.pulled_conversations || 0) || 0, 0),
    pulled_messages: Math.max(Number(input.pulled_messages || 0) || 0, 0),
    saved_messages: Math.max(Number(input.saved_messages || 0) || 0, 0),
    skipped_duplicates: Math.max(Number(input.skipped_duplicates || 0) || 0, 0),
    sync_cursor: cleanText(input.sync_cursor),
    updated_at: stamp,
    created_at: cleanText(input.created_at) || stamp
  }
  if (!env?.DB) {
    memoryStore(env).sync_state = memoryStore(env).sync_state || []
    const index = memoryStore(env).sync_state.findIndex(item => item.channel === channel && item.shop_id === shopId)
    if (index >= 0) memoryStore(env).sync_state[index] = { ...memoryStore(env).sync_state[index], ...state }
    else memoryStore(env).sync_state.push(state)
    return state
  }
  await env.DB.prepare(`
    INSERT INTO chat_sync_state
      (channel, shop_id, last_synced_at, last_success_at, last_error_code, last_error_message,
       pulled_conversations, pulled_messages, saved_messages, skipped_duplicates, sync_cursor, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel, shop_id) DO UPDATE SET
      last_synced_at = excluded.last_synced_at,
      last_success_at = CASE WHEN excluded.last_success_at != '' THEN excluded.last_success_at ELSE chat_sync_state.last_success_at END,
      last_error_code = excluded.last_error_code,
      last_error_message = excluded.last_error_message,
      pulled_conversations = excluded.pulled_conversations,
      pulled_messages = excluded.pulled_messages,
      saved_messages = excluded.saved_messages,
      skipped_duplicates = excluded.skipped_duplicates,
      sync_cursor = CASE WHEN excluded.sync_cursor != '' THEN excluded.sync_cursor ELSE chat_sync_state.sync_cursor END,
      updated_at = excluded.updated_at
  `).bind(
    state.channel,
    state.shop_id,
    state.last_synced_at,
    state.last_success_at,
    state.last_error_code,
    state.last_error_message,
    state.pulled_conversations,
    state.pulled_messages,
    state.saved_messages,
    state.skipped_duplicates,
    state.sync_cursor,
    state.updated_at,
    state.created_at
  ).run()
  return state
}

export async function getConversationById(env, id) {
  await ensureChatCoreTables(env)
  const target = cleanText(id)
  if (!target) return null
  if (!env?.DB) {
    const row = memoryStore(env).conversations.find(item => item.id === target) || null
    return row ? rowToConversation(row, env) : null
  }
  const row = await env.DB.prepare('SELECT * FROM chat_conversations WHERE id = ? LIMIT 1').bind(target).first()
  return row ? rowToConversation(row, env) : null
}

export async function getConversationByPlatform(env, input = {}) {
  await ensureChatCoreTables(env)
  const channel = cleanText(input.channel || input.platform).toLowerCase()
  const shopId = cleanText(input.shop_id || input.shop)
  const platformConversationId = cleanText(input.platform_conversation_id || input.conversation_id)
  if (!channel || !platformConversationId) return null
  if (!env?.DB) {
    return memoryStore(env).conversations.find(item =>
      item.channel === channel &&
      item.shop_id === shopId &&
      item.platform_conversation_id === platformConversationId
    ) || null
  }
  const row = await env.DB.prepare(`
    SELECT * FROM chat_conversations
    WHERE channel = ? AND shop_id = ? AND platform_conversation_id = ?
    LIMIT 1
  `).bind(channel, shopId, platformConversationId).first()
  return row ? rowToConversation(row, env) : null
}

export async function listConversations(env, filters = {}) {
  await ensureChatCoreTables(env)
  const channel = cleanText(filters.channel).toLowerCase()
  const shopId = cleanText(filters.shop_id || filters.shop)
  const customerId = cleanText(filters.customer_id || filters.buyer_id)
  const q = cleanText(filters.q || filters.search).toLowerCase()
  const limit = Math.min(Math.max(Number(filters.limit || 50) || 50, 1), 200)
  if (!env?.DB) {
    return memoryStore(env).conversations
      .filter(item => !channel || item.channel === channel)
      .filter(item => !shopId || item.shop_id === shopId)
      .filter(item => !customerId || cleanText(item.customer_id) === customerId)
      .filter(item => !q || `${item.customer_name} ${item.customer_id} ${item.shop_display_name} ${item.platform_conversation_id} ${item.last_message_text}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.last_message_at || b.updated_at).localeCompare(String(a.last_message_at || a.updated_at)))
      .slice(0, limit)
      .map(item => rowToConversation(item, env))
  }

  const where = []
  const binds = []
  if (channel) {
    where.push('channel = ?')
    binds.push(channel)
  }
  if (shopId) {
    where.push('shop_id = ?')
    binds.push(shopId)
  }
  if (customerId) {
    where.push('customer_id = ?')
    binds.push(customerId)
  }
  if (q) {
    where.push(`(
      LOWER(customer_name) LIKE ? OR LOWER(customer_id) LIKE ? OR LOWER(shop_display_name) LIKE ?
      OR LOWER(platform_conversation_id) LIKE ? OR LOWER(last_message_text) LIKE ?
      OR EXISTS (
        SELECT 1 FROM chat_messages
        WHERE chat_messages.conversation_id = chat_conversations.id
          AND (LOWER(text) LIKE ? OR LOWER(order_id) LIKE ? OR LOWER(attachments) LIKE ?)
      )
    )`)
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  binds.push(limit)
  const sql = `
    SELECT * FROM chat_conversations
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC
    LIMIT ?
  `
  const result = await env.DB.prepare(sql).bind(...binds).all()
  const rows = await fillMissingCustomerNames(env, result.results || [])
  return rows.map(row => rowToConversation(row, env))
}

export async function findStoredMessageByDedupe(env, input = {}) {
  await ensureChatCoreTables(env)
  const message = normalizeChatMessage(input)
  if (!env?.DB) {
    const rows = memoryStore(env).messages
    if (message.platform_message_id) {
      const found = rows.find(item => item.channel === message.channel && item.shop_id === message.shop_id && item.platform_message_id === message.platform_message_id)
      if (found) return found
    }
    if (message.client_temp_id) {
      const found = rows.find(item => item.channel === message.channel && item.shop_id === message.shop_id && item.client_temp_id === message.client_temp_id)
      if (found) return found
    }
    return rows.find(item => item.id === message.id) || null
  }
  if (message.platform_message_id) {
    const row = await env.DB.prepare(`
      SELECT * FROM chat_messages
      WHERE channel = ? AND shop_id = ? AND platform_message_id = ?
      ORDER BY CASE WHEN status = 'sent' THEN 0 ELSE 1 END,
               CASE WHEN client_temp_id != '' THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 1
    `).bind(message.channel, message.shop_id, message.platform_message_id).first()
    if (row) return rowToMessage(row)
  }
  if (message.client_temp_id) {
    const row = await env.DB.prepare(`
      SELECT * FROM chat_messages
      WHERE channel = ? AND shop_id = ? AND client_temp_id = ?
      LIMIT 1
    `).bind(message.channel, message.shop_id, message.client_temp_id).first()
    if (row) return rowToMessage(row)
  }
  const row = await env.DB.prepare('SELECT * FROM chat_messages WHERE id = ? LIMIT 1').bind(message.id).first()
  return row ? rowToMessage(row) : null
}

export async function insertStoredMessage(env, input = {}) {
  await ensureChatCoreTables(env)
  const message = normalizeChatMessage(input)
  if (!env?.DB) {
    const store = memoryStore(env)
    const index = store.messages.findIndex(item => item.id === message.id)
    if (index >= 0) store.messages[index] = message
    else store.messages.push(message)
    return message
  }
  await env.DB.prepare(`
    INSERT INTO chat_messages
      (id, channel, shop_id, conversation_id, customer_id, sender_type, sender_name, text, attachments,
       status, platform_message_id, client_temp_id, reply_to_message_id, order_id, product_ids,
       created_at, updated_at, source, raw_payload_ref, error_code, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    message.id,
    message.channel,
    message.shop_id,
    message.conversation_id,
    message.customer_id,
    message.sender_type,
    message.sender_name,
    message.text,
    safeJsonStringify(message.attachments, '[]'),
    message.status,
    message.platform_message_id,
    message.client_temp_id,
    message.reply_to_message_id,
    message.order_id,
    safeJsonStringify(message.product_ids, '[]'),
    message.created_at,
    message.updated_at,
    message.source,
    message.raw_payload_ref,
    message.error_code,
    message.error_message
  ).run()
  return message
}

export async function updateStoredMessage(env, id, input = {}) {
  await ensureChatCoreTables(env)
  const existing = await getMessageById(env, id)
  const message = normalizeChatMessage({ ...existing, ...input, id })
  if (!env?.DB) {
    const store = memoryStore(env)
    const index = store.messages.findIndex(item => item.id === id)
    if (index >= 0) store.messages[index] = message
    else store.messages.push(message)
    return message
  }
  await env.DB.prepare(`
    UPDATE chat_messages SET
      channel = ?, shop_id = ?, conversation_id = ?, customer_id = ?, sender_type = ?, sender_name = ?,
      text = ?, attachments = ?, status = ?, platform_message_id = ?, client_temp_id = ?,
      reply_to_message_id = ?, order_id = ?, product_ids = ?, created_at = ?, updated_at = ?,
      source = ?, raw_payload_ref = ?, error_code = ?, error_message = ?
    WHERE id = ?
  `).bind(
    message.channel,
    message.shop_id,
    message.conversation_id,
    message.customer_id,
    message.sender_type,
    message.sender_name,
    message.text,
    safeJsonStringify(normalizeAttachments(message.attachments), '[]'),
    message.status,
    message.platform_message_id,
    message.client_temp_id,
    message.reply_to_message_id,
    message.order_id,
    safeJsonStringify(normalizeStringArray(message.product_ids), '[]'),
    message.created_at,
    message.updated_at,
    message.source,
    message.raw_payload_ref,
    message.error_code,
    message.error_message,
    id
  ).run()
  return message
}

export async function getMessageById(env, id) {
  await ensureChatCoreTables(env)
  const target = cleanText(id)
  if (!target) return null
  if (!env?.DB) return memoryStore(env).messages.find(item => item.id === target) || null
  const row = await env.DB.prepare('SELECT * FROM chat_messages WHERE id = ? LIMIT 1').bind(target).first()
  return row ? rowToMessage(row) : null
}

export async function listMessagesByConversation(env, conversationId, options = {}) {
  await ensureChatCoreTables(env)
  const id = cleanText(conversationId)
  const limit = Math.min(Math.max(Number(options.limit || 100) || 100, 1), 300)
  if (!id) return []
  if (!env?.DB) {
    return compactLegacyZaloBrowserAliases(memoryStore(env).messages
      .filter(item => item.conversation_id === id)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))))
      .slice(-limit)
  }
  const queryLimit = Math.min(Math.max(limit * 4, limit), 1000)
  const result = await env.DB.prepare(`
    SELECT * FROM chat_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(id, queryLimit).all()
  return compactLegacyZaloBrowserAliases((result.results || []).map(rowToMessage)).slice(-limit)
}

export async function getConversationSyncDiagnostic(env, conversationId) {
  const conversation = await getConversationById(env, conversationId)
  if (!conversation) return null
  return {
    conversation_id: conversation.id,
    sync_health: conversation.sync_health || computeSyncHealth(conversation),
    diagnostic: diagnoseCapabilityIssue(env, conversation),
    capability: resolveChatCapability(env, conversation),
    last_synced_at: conversation.last_synced_at,
    last_error_code: conversation.last_error_code,
    last_error_message: conversation.last_error_message
  }
}

export async function markConversationRead(env, conversationId) {
  const conversation = await getConversationById(env, conversationId)
  if (!conversation) return null
  return saveConversation(env, {
    ...conversation,
    unread_count: 0,
    updated_at: nowIso()
  })
}

export async function touchConversationFromMessage(env, messageInput = {}, options = {}) {
  const message = normalizeChatMessage(messageInput)
  const current = await getConversationById(env, message.conversation_id)
  const base = current || normalizeChatConversation({
    id: message.conversation_id,
    channel: message.channel,
    shop_id: message.shop_id,
    customer_id: message.customer_id,
    platform_conversation_id: message.conversation_id,
    status: 'open'
  })
  // Tin cũ được kéo lại khi đồng bộ chỉ cập nhật nội dung hiển thị, không được làm sống lại badge chưa đọc.
  const unreadDelta = options.incrementUnread !== false && message.sender_type === 'customer' && message.status !== 'deleted' ? 1 : 0
  const messageTime = Date.parse(cleanText(message.created_at))
  const currentLastTime = Date.parse(cleanText(base.last_message_at))
  // Bridge có thể trả lịch sử không theo thứ tự; tin cũ không được ghi đè phần xem trước mới nhất.
  const updatesLastMessage = !cleanText(base.last_message_at) ||
    !Number.isFinite(currentLastTime) ||
    (Number.isFinite(messageTime) && messageTime >= currentLastTime)
  return saveConversation(env, {
    ...base,
    last_message_text: updatesLastMessage
      ? (message.text || (message.attachments?.length ? 'Đã gửi tệp đính kèm' : base.last_message_text))
      : base.last_message_text,
    last_message_at: updatesLastMessage ? (message.created_at || nowIso()) : base.last_message_at,
    unread_count: Math.max(Number(base.unread_count || 0) + unreadDelta, 0),
    updated_at: nowIso()
  })
}
