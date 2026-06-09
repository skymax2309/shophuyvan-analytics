import {
  cleanText,
  newChatId,
  normalizeStringArray,
  nowIso,
  safeJsonParse,
  safeJsonStringify
} from './message-normalize.js'
import { ensureChatCoreTables, getConversationById, listMessagesByConversation } from './conversation-core.js'
import { sanitizeApprovedLearningPair } from './ai-learning-sanitize-core.js'

const KNOWLEDGE_STATUSES = new Set(['active', 'disabled'])

function memoryStore(env) {
  env.__CHAT_CORE_MEMORY = env.__CHAT_CORE_MEMORY || {}
  env.__CHAT_CORE_MEMORY.ai_knowledge_base = env.__CHAT_CORE_MEMORY.ai_knowledge_base || []
  env.__CHAT_CORE_MEMORY.ai_suggestions = env.__CHAT_CORE_MEMORY.ai_suggestions || []
  env.__CHAT_CORE_MEMORY.ai_learning_audit_logs = env.__CHAT_CORE_MEMORY.ai_learning_audit_logs || []
  return env.__CHAT_CORE_MEMORY
}

async function ensureColumn(env, tableName, columnName, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all()
  if ((info.results || []).some(row => row.name === columnName)) return
  try {
    await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run()
  } catch (error) {
    if (!/duplicate column name/i.test(String(error?.message || error))) throw error
  }
}

async function ensureAiKnowledgeSchema(env) {
  await ensureChatCoreTables(env)
  if (!env?.DB || env.__CHAT_AI_KNOWLEDGE_SCHEMA_READY) return
  const columns = [
    ['intent', "TEXT DEFAULT ''"],
    ['source_tags', "TEXT DEFAULT '[]'"],
    ['status', "TEXT DEFAULT 'active'"],
    ['suggestion_id', "TEXT DEFAULT ''"],
    ['conversation_id', "TEXT DEFAULT ''"],
    ['source_message_id', "TEXT DEFAULT ''"],
    ['dedupe_key', "TEXT DEFAULT ''"],
    ['pii_redacted_count', 'INTEGER DEFAULT 0'],
    ['sanitization_summary', "TEXT DEFAULT '[]'"],
    ['disabled_at', "TEXT DEFAULT ''"],
    ['disabled_by', "TEXT DEFAULT ''"]
  ]
  for (const [name, definition] of columns) {
    await ensureColumn(env, 'ai_knowledge_base', name, definition)
  }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_learning_audit_logs (
      id TEXT PRIMARY KEY,
      knowledge_id TEXT DEFAULT '',
      action TEXT DEFAULT '',
      source TEXT DEFAULT '',
      actor TEXT DEFAULT '',
      channel TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      suggestion_id TEXT DEFAULT '',
      conversation_id TEXT DEFAULT '',
      source_message_id TEXT DEFAULT '',
      question_preview TEXT DEFAULT '',
      answer_preview TEXT DEFAULT '',
      pii_redacted_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT ''
    )
  `).run()
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_knowledge_status ON ai_knowledge_base(status, updated_at)').run()
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_knowledge_dedupe ON ai_knowledge_base(dedupe_key) WHERE dedupe_key <> ''").run().catch(() => null)
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_learning_audit_created ON ai_learning_audit_logs(created_at)').run()
  env.__CHAT_AI_KNOWLEDGE_SCHEMA_READY = true
}

function uniqueStrings(value = []) {
  return [...new Set(normalizeStringArray(value))]
}

function normalizeStatus(value = 'active') {
  const status = cleanText(value).toLowerCase()
  return KNOWLEDGE_STATUSES.has(status) ? status : 'active'
}

function normalizeDedupeText(value = '') {
  return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

async function buildDedupeKey(entry = {}) {
  const source = [
    normalizeDedupeText(entry.channel),
    normalizeDedupeText(entry.shop_id),
    normalizeDedupeText(entry.intent),
    normalizeDedupeText(entry.question),
    normalizeDedupeText(entry.answer)
  ].join('|')
  try {
    const bytes = new TextEncoder().encode(source)
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return source.slice(0, 500)
  }
}

function entryFromStorage(row = {}) {
  return {
    ...row,
    source_tags: uniqueStrings(row.source_tags),
    sanitization_summary: uniqueStrings(row.sanitization_summary),
    status: normalizeStatus(row.status),
    pii_redacted_count: Math.max(Number(row.pii_redacted_count || 0) || 0, 0),
    use_count: Math.max(Number(row.use_count || 0) || 0, 0)
  }
}

function normalizeEntry(input = {}, pair = {}) {
  const stamp = nowIso()
  const status = normalizeStatus(input.status)
  return {
    id: cleanText(input.id) || newChatId('kb'),
    question: cleanText(pair.question),
    answer: cleanText(pair.answer),
    channel: cleanText(input.channel),
    shop_id: cleanText(input.shop_id),
    source: cleanText(input.source || 'manual'),
    approved_by: cleanText(input.approved_by || 'staff'),
    approved_at: cleanText(input.approved_at) || stamp,
    use_count: Math.max(Number(input.use_count || 0) || 0, 0),
    intent: cleanText(input.intent),
    source_tags: uniqueStrings(input.source_tags),
    status,
    suggestion_id: cleanText(input.suggestion_id),
    conversation_id: cleanText(input.conversation_id),
    source_message_id: cleanText(input.source_message_id),
    dedupe_key: cleanText(input.dedupe_key),
    pii_redacted_count: Math.max(Number(pair.pii_redacted_count || 0) || 0, 0),
    sanitization_summary: uniqueStrings(pair.redactions),
    disabled_at: status === 'disabled' ? cleanText(input.disabled_at) || stamp : '',
    disabled_by: status === 'disabled' ? cleanText(input.disabled_by || input.approved_by || 'staff') : '',
    created_at: cleanText(input.created_at) || stamp,
    updated_at: cleanText(input.updated_at) || stamp
  }
}

function auditPreview(value = '') {
  return cleanText(value).slice(0, 240)
}

async function recordLearningAudit(env, input = {}) {
  await ensureAiKnowledgeSchema(env)
  const row = {
    id: newChatId('learn_audit'),
    knowledge_id: cleanText(input.knowledge_id),
    action: cleanText(input.action || 'knowledge_updated'),
    source: cleanText(input.source),
    actor: cleanText(input.actor || 'staff'),
    channel: cleanText(input.channel),
    shop_id: cleanText(input.shop_id),
    suggestion_id: cleanText(input.suggestion_id),
    conversation_id: cleanText(input.conversation_id),
    source_message_id: cleanText(input.source_message_id),
    question_preview: auditPreview(input.question_preview),
    answer_preview: auditPreview(input.answer_preview),
    pii_redacted_count: Math.max(Number(input.pii_redacted_count || 0) || 0, 0),
    created_at: nowIso()
  }
  if (!env?.DB) {
    memoryStore(env).ai_learning_audit_logs.push(row)
    return row
  }
  await env.DB.prepare(`
    INSERT INTO ai_learning_audit_logs
      (id, knowledge_id, action, source, actor, channel, shop_id, suggestion_id,
       conversation_id, source_message_id, question_preview, answer_preview,
       pii_redacted_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    row.id,
    row.knowledge_id,
    row.action,
    row.source,
    row.actor,
    row.channel,
    row.shop_id,
    row.suggestion_id,
    row.conversation_id,
    row.source_message_id,
    row.question_preview,
    row.answer_preview,
    row.pii_redacted_count,
    row.created_at
  ).run()
  return row
}

async function getKnowledgeEntry(env, id) {
  const target = cleanText(id)
  if (!target) return null
  if (!env?.DB) {
    const row = memoryStore(env).ai_knowledge_base.find(item => item.id === target)
    return row ? entryFromStorage(row) : null
  }
  const row = await env.DB.prepare('SELECT * FROM ai_knowledge_base WHERE id = ?').bind(target).first()
  return row ? entryFromStorage(row) : null
}

async function findDuplicateEntry(env, entry) {
  if (!env?.DB) {
    const row = memoryStore(env).ai_knowledge_base.find(item =>
      (entry.dedupe_key && cleanText(item.dedupe_key) === entry.dedupe_key) ||
      cleanText(item.question) === entry.question &&
      cleanText(item.answer) === entry.answer &&
      cleanText(item.channel) === entry.channel &&
      cleanText(item.shop_id) === entry.shop_id
    )
    return row ? entryFromStorage(row) : null
  }
  const row = await env.DB.prepare(`
    SELECT * FROM ai_knowledge_base
    WHERE (dedupe_key <> '' AND dedupe_key = ?)
      OR (question = ? AND answer = ? AND channel = ? AND shop_id = ?)
    LIMIT 1
  `).bind(entry.dedupe_key, entry.question, entry.answer, entry.channel, entry.shop_id).first()
  return row ? entryFromStorage(row) : null
}

async function persistKnowledgeEntry(env, entry) {
  if (!env?.DB) {
    const store = memoryStore(env)
    const index = store.ai_knowledge_base.findIndex(item => item.id === entry.id)
    if (index >= 0) store.ai_knowledge_base[index] = { ...store.ai_knowledge_base[index], ...entry }
    else store.ai_knowledge_base.push(entry)
    return
  }
  await env.DB.prepare(`
    INSERT INTO ai_knowledge_base
      (id, question, answer, channel, shop_id, source, approved_by, approved_at,
       use_count, intent, source_tags, status, suggestion_id, conversation_id,
       source_message_id, dedupe_key, pii_redacted_count, sanitization_summary, disabled_at,
       disabled_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      question = excluded.question,
      answer = excluded.answer,
      channel = excluded.channel,
      shop_id = excluded.shop_id,
      source = excluded.source,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      intent = excluded.intent,
      source_tags = excluded.source_tags,
      status = excluded.status,
      suggestion_id = excluded.suggestion_id,
      conversation_id = excluded.conversation_id,
      source_message_id = excluded.source_message_id,
      dedupe_key = excluded.dedupe_key,
      pii_redacted_count = excluded.pii_redacted_count,
      sanitization_summary = excluded.sanitization_summary,
      disabled_at = excluded.disabled_at,
      disabled_by = excluded.disabled_by,
      updated_at = excluded.updated_at
  `).bind(
    entry.id,
    entry.question,
    entry.answer,
    entry.channel,
    entry.shop_id,
    entry.source,
    entry.approved_by,
    entry.approved_at,
    entry.use_count,
    entry.intent,
    safeJsonStringify(entry.source_tags, '[]'),
    entry.status,
    entry.suggestion_id,
    entry.conversation_id,
    entry.source_message_id,
    entry.dedupe_key,
    entry.pii_redacted_count,
    safeJsonStringify(entry.sanitization_summary, '[]'),
    entry.disabled_at,
    entry.disabled_by,
    entry.created_at,
    entry.updated_at
  ).run()
}

// Lưu bản nháp AI để nhân viên có thể duyệt, sửa hoặc đưa vào kho học.
export async function saveAiSuggestion(env, suggestion = {}) {
  await ensureChatCoreTables(env)
  const stamp = nowIso()
  const row = {
    id: cleanText(suggestion.id) || newChatId('ai'),
    conversation_id: cleanText(suggestion.conversation_id),
    message_id: cleanText(suggestion.message_id),
    suggested_text: cleanText(suggestion.suggested_text),
    prompt_context: suggestion.prompt_context || {},
    policy_status: cleanText(suggestion.policy_status || 'needs_review'),
    user_feedback: cleanText(suggestion.user_feedback),
    final_state: cleanText(suggestion.final_state || 'draft'),
    final_message_sent: cleanText(suggestion.final_message_sent),
    created_at: cleanText(suggestion.created_at) || stamp,
    updated_at: cleanText(suggestion.updated_at) || stamp
  }
  if (!env?.DB) {
    memoryStore(env).ai_suggestions.push(row)
    return row
  }
  try {
    await env.DB.prepare(`
      INSERT INTO ai_suggestions
        (id, conversation_id, message_id, suggested_text, prompt_context, policy_status,
         user_feedback, final_state, final_message_sent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.id,
      row.conversation_id,
      row.message_id,
      row.suggested_text,
      safeJsonStringify(row.prompt_context, '{}'),
      row.policy_status,
      row.user_feedback,
      row.final_state,
      row.final_message_sent,
      row.created_at,
      row.updated_at
    ).run()
    return row
  } catch (error) {
    return {
      ...row,
      policy_status: 'needs_review',
      error_code: 'ai_suggestion_save_failed',
      error_message: String(error?.message || error)
    }
  }
}

// Chỉ lưu câu trả lời đã duyệt sau khi loại bỏ dữ liệu riêng của khách.
export async function saveKnowledgeEntry(env, input = {}) {
  await ensureAiKnowledgeSchema(env)
  const pair = sanitizeApprovedLearningPair(input)
  if (!pair.ok) return { ok: false, error: pair.error || 'knowledge_sanitize_failed' }
  let entry = normalizeEntry(input, pair)
  entry.dedupe_key = await buildDedupeKey(entry)
  try {
    const duplicate = input.id ? null : await findDuplicateEntry(env, entry)
    if (duplicate) {
      entry = {
        ...duplicate,
        ...entry,
        id: duplicate.id,
        created_at: duplicate.created_at,
        use_count: duplicate.use_count,
        source_tags: uniqueStrings([...duplicate.source_tags, ...entry.source_tags]),
        pii_redacted_count: Math.max(duplicate.pii_redacted_count, entry.pii_redacted_count),
        sanitization_summary: uniqueStrings([...duplicate.sanitization_summary, ...entry.sanitization_summary])
      }
    }
    await persistKnowledgeEntry(env, entry)
    const action = cleanText(input._audit_action) ||
      (duplicate
        ? 'approved_learning_deduplicated'
        : entry.source === 'feedback_loop' ? 'approved_learning_saved' : 'knowledge_created')
    await recordLearningAudit(env, {
      knowledge_id: entry.id,
      action,
      source: entry.source,
      actor: entry.approved_by,
      channel: entry.channel,
      shop_id: entry.shop_id,
      suggestion_id: entry.suggestion_id,
      conversation_id: entry.conversation_id,
      source_message_id: entry.source_message_id,
      question_preview: entry.question,
      answer_preview: entry.answer,
      pii_redacted_count: entry.pii_redacted_count
    })
    return { ok: true, entry, deduplicated: Boolean(duplicate) }
  } catch (error) {
    return { ok: false, error: 'knowledge_save_failed', message: String(error?.message || error) }
  }
}

// Lấy ví dụ đang hoạt động cho prompt; Settings có thể yêu cầu cả mục đã vô hiệu hóa.
export async function listKnowledgeEntries(env, filters = {}) {
  await ensureAiKnowledgeSchema(env)
  const channel = cleanText(filters.channel)
  const shopId = cleanText(filters.shop_id)
  const search = cleanText(filters.search).toLowerCase()
  const includeDisabled = filters.include_disabled === true || cleanText(filters.include_disabled) === 'true'
  const status = cleanText(filters.status) ? normalizeStatus(filters.status) : (includeDisabled ? '' : 'active')
  const limit = Math.min(Math.max(Number(filters.limit || 50) || 50, 1), 10000)
  if (!env?.DB) {
    return memoryStore(env).ai_knowledge_base
      .map(entryFromStorage)
      .filter(item => (!channel || item.channel === channel) && (!shopId || item.shop_id === shopId))
      .filter(item => !status || item.status === status)
      .filter(item => !search || `${item.question} ${item.answer} ${item.intent}`.toLowerCase().includes(search))
      .sort((a, b) => Number(b.use_count || 0) - Number(a.use_count || 0) || String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, limit)
  }
  try {
    const clauses = []
    const binds = []
    if (channel) {
      clauses.push('channel = ?')
      binds.push(channel)
    }
    if (shopId) {
      clauses.push('shop_id = ?')
      binds.push(shopId)
    }
    if (status) {
      clauses.push("COALESCE(NULLIF(status, ''), 'active') = ?")
      binds.push(status)
    }
    if (search) {
      clauses.push('(LOWER(question) LIKE ? OR LOWER(answer) LIKE ? OR LOWER(intent) LIKE ?)')
      binds.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const result = await env.DB.prepare(`
      SELECT * FROM ai_knowledge_base
      ${where}
      ORDER BY use_count DESC, updated_at DESC
      LIMIT ?
    `).bind(...binds, limit).all()
    return (result.results || []).map(entryFromStorage)
  } catch {
    return []
  }
}

export async function updateKnowledgeEntry(env, id, input = {}) {
  await ensureAiKnowledgeSchema(env)
  const current = await getKnowledgeEntry(env, id)
  if (!current) return { ok: false, error: 'knowledge_not_found' }
  const nextStatus = input.status === undefined ? current.status : normalizeStatus(input.status)
  const contentChanged = input.question !== undefined || input.answer !== undefined
  const statusChanged = nextStatus !== current.status
  const action = contentChanged
    ? 'knowledge_updated'
    : nextStatus === 'disabled' ? 'knowledge_disabled' : statusChanged ? 'knowledge_enabled' : 'knowledge_updated'
  if (!contentChanged) {
    const entry = {
      ...current,
      status: nextStatus,
      disabled_at: nextStatus === 'disabled' ? current.disabled_at || nowIso() : '',
      disabled_by: nextStatus === 'disabled' ? cleanText(input.approved_by || input.disabled_by || 'staff') : '',
      approved_by: cleanText(input.approved_by || current.approved_by || 'staff'),
      updated_at: nowIso()
    }
    await persistKnowledgeEntry(env, entry)
    await recordLearningAudit(env, {
      knowledge_id: entry.id,
      action,
      source: entry.source,
      actor: entry.approved_by,
      channel: entry.channel,
      shop_id: entry.shop_id,
      suggestion_id: entry.suggestion_id,
      conversation_id: entry.conversation_id,
      source_message_id: entry.source_message_id,
      question_preview: entry.question,
      answer_preview: entry.answer,
      pii_redacted_count: entry.pii_redacted_count
    })
    return { ok: true, entry, deduplicated: false }
  }
  return saveKnowledgeEntry(env, {
    ...current,
    ...input,
    id: current.id,
    question: input.question === undefined ? current.question : input.question,
    answer: input.answer === undefined ? current.answer : input.answer,
    status: nextStatus,
    disabled_at: nextStatus === 'disabled' ? current.disabled_at || nowIso() : '',
    disabled_by: nextStatus === 'disabled' ? cleanText(input.approved_by || input.disabled_by || 'staff') : '',
    approved_by: cleanText(input.approved_by || current.approved_by || 'staff'),
    updated_at: nowIso(),
    _audit_action: action
  })
}

export async function deleteKnowledgeEntry(env, id, actor = 'staff') {
  await ensureAiKnowledgeSchema(env)
  const target = cleanText(id)
  if (!target) return { ok: false, error: 'id_required' }
  const current = await getKnowledgeEntry(env, target)
  if (!current) return { ok: false, error: 'knowledge_not_found' }
  try {
    await recordLearningAudit(env, {
      knowledge_id: target,
      action: 'knowledge_deleted',
      source: current.source,
      actor,
      channel: current.channel,
      shop_id: current.shop_id,
      suggestion_id: current.suggestion_id,
      conversation_id: current.conversation_id,
      source_message_id: current.source_message_id,
      question_preview: current.question,
      answer_preview: current.answer,
      pii_redacted_count: current.pii_redacted_count
    })
    if (!env?.DB) {
      const store = memoryStore(env)
      store.ai_knowledge_base = store.ai_knowledge_base.filter(item => item.id !== target)
    } else {
      await env.DB.prepare('DELETE FROM ai_knowledge_base WHERE id = ?').bind(target).run()
    }
    return { ok: true, id: target }
  } catch (error) {
    return { ok: false, error: 'knowledge_delete_failed', message: String(error?.message || error) }
  }
}

export async function listLearningAuditLogs(env, filters = {}) {
  await ensureAiKnowledgeSchema(env)
  const channel = cleanText(filters.channel)
  const shopId = cleanText(filters.shop_id)
  const limit = Math.min(Math.max(Number(filters.limit || 50) || 50, 1), 200)
  if (!env?.DB) {
    return memoryStore(env).ai_learning_audit_logs
      .filter(item => (!channel || item.channel === channel) && (!shopId || item.shop_id === shopId))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit)
  }
  const clauses = []
  const binds = []
  if (channel) {
    clauses.push('channel = ?')
    binds.push(channel)
  }
  if (shopId) {
    clauses.push('shop_id = ?')
    binds.push(shopId)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const result = await env.DB.prepare(`
    SELECT * FROM ai_learning_audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all()
  return result.results || []
}

export async function incrementKnowledgeUseCount(env, id) {
  await ensureAiKnowledgeSchema(env)
  const target = cleanText(id)
  if (!target) return { ok: false, error: 'id_required' }
  if (!env?.DB) {
    const item = memoryStore(env).ai_knowledge_base.find(row => row.id === target)
    if (item) item.use_count = Number(item.use_count || 0) + 1
    return { ok: true, id: target }
  }
  try {
    await env.DB.prepare(`
      UPDATE ai_knowledge_base
      SET use_count = COALESCE(use_count, 0) + 1, updated_at = ?
      WHERE id = ?
    `).bind(nowIso(), target).run()
    return { ok: true, id: target }
  } catch {
    return { ok: false, error: 'knowledge_increment_failed' }
  }
}

export async function approveAiSuggestion(env, input = {}) {
  await ensureAiKnowledgeSchema(env)
  const suggestionId = cleanText(input.suggestion_id)
  const approvedAnswer = cleanText(input.approved_answer)
  if (!suggestionId || !approvedAnswer) return { ok: false, error: 'suggestion_and_answer_required' }
  const stamp = nowIso()
  let suggestion = null
  if (!env?.DB) {
    const store = memoryStore(env)
    const index = store.ai_suggestions.findIndex(item => item.id === suggestionId)
    if (index >= 0) {
      store.ai_suggestions[index] = {
        ...store.ai_suggestions[index],
        final_state: 'approved',
        final_message_sent: approvedAnswer,
        user_feedback: cleanText(input.approved_by || 'staff'),
        updated_at: stamp
      }
      suggestion = store.ai_suggestions[index]
    }
  } else {
    try {
      await env.DB.prepare(`
        UPDATE ai_suggestions
        SET final_state = 'approved', final_message_sent = ?, user_feedback = ?, updated_at = ?
        WHERE id = ?
      `).bind(approvedAnswer, cleanText(input.approved_by || 'staff'), stamp, suggestionId).run()
      suggestion = await env.DB.prepare('SELECT * FROM ai_suggestions WHERE id = ?').bind(suggestionId).first()
    } catch (error) {
      return { ok: false, error: 'suggestion_approve_failed', message: String(error?.message || error) }
    }
  }

  let knowledgeResult = null
  if (input.save_to_knowledge === true && suggestion) {
    const conversation = await getConversationById(env, suggestion.conversation_id).catch(() => null)
    const messages = suggestion.conversation_id
      ? await listMessagesByConversation(env, suggestion.conversation_id, { limit: 20 }).catch(() => [])
      : []
    const sourceCustomer = messages.find(item => item.id === suggestion.message_id && item.sender_type === 'customer')
    const approvedMessageId = cleanText(input.approved_message_id)
    const approvedMessage = messages.find(item =>
      item.id === approvedMessageId &&
      item.sender_type === 'shop' &&
      item.status === 'sent'
    )
    if (!sourceCustomer || !approvedMessage) {
      return {
        ok: true,
        suggestion,
        knowledge: null,
        knowledge_error: !sourceCustomer ? 'source_customer_message_not_found' : 'approved_message_sent_required'
      }
    }
    const promptContext = safeJsonParse(suggestion.prompt_context, {})
    const sourceTags = uniqueStrings(promptContext.agent_source_labels)
    knowledgeResult = await saveKnowledgeEntry(env, {
      question: cleanText(sourceCustomer.text),
      answer: cleanText(approvedMessage.text || approvedAnswer),
      channel: cleanText(input.channel || conversation?.channel),
      shop_id: cleanText(input.shop_id || conversation?.shop_id),
      source: 'feedback_loop',
      approved_by: cleanText(input.approved_by || 'staff'),
      intent: cleanText(promptContext.simple_intent?.intent),
      source_tags: sourceTags.length ? sourceTags : ['Câu trả lời đã duyệt'],
      suggestion_id: suggestionId,
      conversation_id: cleanText(suggestion.conversation_id),
      source_message_id: cleanText(suggestion.message_id),
      private_values: [
        { value: conversation?.customer_name, type: 'customer_name' },
        { value: conversation?.customer_id, type: 'customer_id' },
        { value: sourceCustomer?.sender_name, type: 'customer_name' },
        { value: sourceCustomer?.customer_id, type: 'customer_id' }
      ]
    })
  }
  return {
    ok: true,
    suggestion,
    knowledge: knowledgeResult?.entry || null,
    knowledge_error: knowledgeResult?.ok === false ? knowledgeResult.error : ''
  }
}

export async function rejectAiSuggestion(env, input = {}) {
  await ensureChatCoreTables(env)
  const suggestionId = cleanText(input.suggestion_id || input.id)
  if (!suggestionId) return { ok: false, error: 'suggestion_required' }
  const stamp = nowIso()
  const feedback = cleanText(input.reason || input.user_feedback || 'rejected_by_operator')
  if (!env?.DB) {
    const store = memoryStore(env)
    const index = store.ai_suggestions.findIndex(item => item.id === suggestionId)
    if (index >= 0) {
      store.ai_suggestions[index] = {
        ...store.ai_suggestions[index],
        final_state: 'rejected',
        user_feedback: feedback,
        updated_at: stamp
      }
      return { ok: true, suggestion: store.ai_suggestions[index] }
    }
    return { ok: true, suggestion: null }
  }
  try {
    await env.DB.prepare(`
      UPDATE ai_suggestions
      SET final_state = 'rejected', user_feedback = ?, updated_at = ?
      WHERE id = ?
    `).bind(feedback, stamp, suggestionId).run()
    const suggestion = await env.DB.prepare('SELECT * FROM ai_suggestions WHERE id = ?').bind(suggestionId).first()
    return { ok: true, suggestion }
  } catch (error) {
    return { ok: false, error: 'suggestion_reject_failed', message: String(error?.message || error) }
  }
}

export async function buildKnowledgeJsonl(env) {
  const entries = await listKnowledgeEntries(env, { limit: 10000 })
  return entries.map(item => safeJsonStringify(item, '{}')).join('\n')
}
