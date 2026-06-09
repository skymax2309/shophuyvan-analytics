import { cleanText, normalizeChatConversation, normalizeChatMessage, nowIso } from './message-normalize.js'
import { canSyncViaApi, resolveChatCapability, unavailableSyncState } from './capability-core.js'
import { ensureChatCoreTables, getChatSettings, getConversationByPlatform, listConversations, saveChatSyncState, saveConversation } from './conversation-core.js'
import { mergeMessageIntoStore } from './message-merge.js'
import { adapterForChannel, sendChatMessage } from './send-core.js'
import { broadcastToWebSocket } from '../realtime/ws-server.js'
import { notifyNewChatMessages } from './push-notification-core.js'
import { approveAiSuggestion, buildKnowledgeJsonl } from './ai-knowledge-core.js'
import { suggestChatReply } from './ai-policy-core.js'

async function knownConversationTimestamps(env, channel, input = {}) {
  if (input.force_history === true || input.force === true || input.backfill === true) return {}
  const shopId = cleanText(input.shop_id || input.shop)
  if (env?.DB) {
    await ensureChatCoreTables(env)
    const result = await env.DB.prepare(`
      SELECT c.id, c.platform_conversation_id, c.last_message_timestamp,
             c.pulled_messages, c.saved_messages, COUNT(m.id) AS message_count
      FROM chat_conversations c
      LEFT JOIN chat_messages m ON m.conversation_id = c.id
      WHERE c.channel = ? AND (? = '' OR c.shop_id = ?)
      GROUP BY c.id
      LIMIT 500
    `).bind(channel, shopId, shopId).all()
    const map = {}
    for (const row of result.results || []) {
      const hasMessageHistory = Number(row.message_count || 0) > 0 || Number(row.pulled_messages || 0) > 0 || Number(row.saved_messages || 0) > 0
      const key = cleanText(row.platform_conversation_id || row.id)
      const timestamp = cleanText(row.last_message_timestamp)
      if (key && timestamp && hasMessageHistory) map[key] = timestamp
    }
    return map
  }
  const rows = await listConversations(env, { channel, shop_id: shopId, limit: 200 }).catch(() => [])
  const map = {}
  for (const row of rows || []) {
    const key = cleanText(row.platform_conversation_id || row.conversation_id || row.id)
    const timestamp = cleanText(row.last_message_timestamp)
    const hasMessageHistory = Number(row.pulled_messages || 0) > 0 || Number(row.saved_messages || 0) > 0
    if (key && timestamp && hasMessageHistory) map[key] = timestamp
  }
  return map
}

async function updateShopConversationsSyncState(env, channel, shopId, capability = {}, state = {}) {
  const shopKey = cleanText(shopId)
  if (!shopKey) return 0
  const rows = await listConversations(env, { channel, shop_id: shopKey, limit: 200 }).catch(() => [])
  let updated = 0
  for (const row of rows || []) {
    // Khi bridge báo shop chưa có API, cập nhật lại conversation cũ để UI không gắn nhãn API sai.
    await saveConversation(env, {
      ...row,
      ...capability,
      last_synced_at: state.last_synced_at,
      last_success_at: state.last_success_at,
      last_error_code: state.last_error_code,
      last_error_message: state.last_error_message,
      pulled_conversations: row.pulled_conversations,
      pulled_messages: row.pulled_messages,
      saved_messages: row.saved_messages,
      skipped_duplicates: row.skipped_duplicates,
      sync_cursor: state.sync_cursor,
      updated_at: state.last_synced_at || nowIso()
    })
    updated += 1
  }
  return updated
}

function usableCustomerName(message = {}, conversation = {}) {
  const name = cleanText(message.sender_name)
  if (!name || ['Khách', 'Shop', 'System'].includes(name)) return ''
  if (message.sender_type === 'shop') return ''
  const shopName = cleanText(conversation.shop_display_name || conversation.shop || conversation.shop_id).toLowerCase()
  if (shopName && name.toLowerCase() === shopName) return ''
  return name
}

async function syncWithInboxPolling(env, adapter, channel, input, capability) {
  const stamp = nowIso()
  const shopId = cleanText(input.shop_id || input.shop)
  const pollResult = await adapter.pollInbox(env, {
    ...input,
    channel,
    known_conversation_timestamps: await knownConversationTimestamps(env, channel, input)
  })
  if (!pollResult?.ok) {
    const errorState = {
      channel,
      shop_id: shopId,
      last_synced_at: stamp,
      last_error_code: cleanText(pollResult?.error_code || pollResult?.error || 'sync_failed'),
      last_error_message: cleanText(pollResult?.error_message || pollResult?.message || 'Sync chat thất bại.'),
      pulled_conversations: Number(pollResult?.pulled_conversations || 0) || 0,
      pulled_messages: Number(pollResult?.pulled_messages || 0) || 0,
      saved_messages: 0,
      skipped_duplicates: 0
    }
    await saveChatSyncState(env, errorState)
    await updateShopConversationsSyncState(env, channel, shopId, pollResult?.capability || capability, errorState)
    return {
      ok: false,
      channel,
      capability: pollResult?.capability || capability,
      status: pollResult?.status || 'failed',
      ...errorState
    }
  }

  const rawConversations = pollResult.conversations || pollResult.items || []
  let pulledMessages = 0
  let savedMessages = 0
  let skippedDuplicates = 0
  const results = []
  const newMessages = []
  for (const rawConversation of rawConversations.slice(0, Math.min(Number(input.limit || 20) || 20, 50))) {
    const normalizedConversation = adapter.normalizeConversation
      ? adapter.normalizeConversation(rawConversation, input)
      : rawConversation
    const existingConversation = await getConversationByPlatform(env, {
      channel,
      shop_id: normalizedConversation.shop_id || input.shop_id || input.shop,
      platform_conversation_id: normalizedConversation.platform_conversation_id || normalizedConversation.conversation_id
    }).catch(() => null)
    const conversation = await saveConversation(env, normalizeChatConversation({
      ...(existingConversation || {}),
      ...normalizedConversation,
      id: existingConversation?.id || normalizedConversation.id,
      channel,
      ...resolveChatCapability(env, { ...input, ...normalizedConversation, channel }),
      last_synced_at: stamp,
      last_success_at: stamp,
      last_error_code: '',
      last_error_message: '',
      updated_at: stamp
    }))
    const rawMessages = rawConversation.messages || []
    let conversationPulled = 0
    let conversationSaved = 0
    let conversationSkipped = 0
    let customerNameFromMessages = ''
    for (const rawMessage of rawMessages) {
      const adapterMessage = adapter.normalizeMessage(rawMessage)
      const normalized = normalizeChatMessage({
        ...adapterMessage,
        sender_name: adapterMessage.sender_name || (adapterMessage.sender_type === 'customer' ? conversation.customer_name : ''),
        channel,
        shop_id: conversation.shop_id,
        conversation_id: conversation.id,
        customer_id: conversation.customer_id,
        status: 'synced',
        source: `${channel}_polling_api`
      })
      if (!customerNameFromMessages) customerNameFromMessages = usableCustomerName(normalized, conversation)
      const result = await mergeMessageIntoStore(env, normalized)
      conversationPulled += 1
      if (result.action === 'created') {
        conversationSaved += 1
        newMessages.push(result.message)
      } else {
        conversationSkipped += 1
      }
    }
    pulledMessages += conversationPulled
    savedMessages += conversationSaved
    skippedDuplicates += conversationSkipped
    await saveConversation(env, {
      ...conversation,
      customer_name: conversation.customer_name || customerNameFromMessages,
      pulled_conversations: 1,
      pulled_messages: conversationPulled,
      saved_messages: conversationSaved,
      skipped_duplicates: conversationSkipped,
      last_synced_at: stamp,
      last_success_at: stamp,
      last_error_code: '',
      last_error_message: '',
      updated_at: stamp
    })
    results.push({
      conversation_id: conversation.id,
      platform_conversation_id: conversation.platform_conversation_id,
      pulled_messages: conversationPulled,
      saved_messages: conversationSaved,
      skipped_duplicates: conversationSkipped
    })
  }

  const syncState = {
    channel,
    shop_id: shopId || cleanText(rawConversations[0]?.shop_id || rawConversations[0]?.shop),
    last_synced_at: stamp,
    last_success_at: stamp,
    last_error_code: '',
    last_error_message: '',
    pulled_conversations: Number(pollResult.pulled_conversations ?? rawConversations.length) || 0,
    pulled_messages: pulledMessages,
    saved_messages: savedMessages,
    skipped_duplicates: skippedDuplicates,
    sync_cursor: cleanText(pollResult.sync_cursor),
    listed_conversations: Number(pollResult.listed_conversations || rawConversations.length || 0) || 0,
    skipped_unchanged_conversations: Number(pollResult.skipped_unchanged_conversations || 0) || 0
  }
  await saveChatSyncState(env, syncState)
  // Sync bridge là trạng thái theo shop; khi shop sync thành công phải xóa lỗi cũ trên các hội thoại cùng shop.
  await updateShopConversationsSyncState(env, channel, syncState.shop_id, capability, syncState)
  const pushResult = await notifyNewChatMessages(env, newMessages).catch(error => ({
    ok: false,
    error_code: 'chat_push_failed',
    error_message: error?.message || String(error)
  }))
  return {
    ok: true,
    status: 'synced',
    channel,
    capability,
    ...syncState,
    endpoint_paths: pollResult.endpoint_paths || [],
    attempts: pollResult.attempts || [],
    ...((input.diagnostic === true && pollResult.diagnostic) ? { diagnostic: pollResult.diagnostic } : {}),
    results,
    new_messages: newMessages,
    push_notifications: pushResult
  }
}

export async function syncChatChannel(env, input = {}) {
  const channel = cleanText(input.channel).toLowerCase()
  const capability = resolveChatCapability(env, { ...input, channel })
  if (!canSyncViaApi(capability)) {
    const unavailable = unavailableSyncState(capability)
    return {
      ok: false,
      channel,
      capability,
      ...unavailable
    }
  }
  const adapter = adapterForChannel(channel)
  if (!adapter) {
    return { ok: false, channel, capability, error_code: 'adapter_not_implemented', error_message: `Kênh ${channel || 'trống'} chưa có adapter sync.` }
  }

  if (typeof adapter.pollInbox === 'function') {
    return syncWithInboxPolling(env, adapter, channel, input, capability)
  }

  const conversationsResult = await adapter.listConversations(env, input)
  if (!conversationsResult?.ok && conversationsResult?.error_code) return conversationsResult

  const rawConversations = conversationsResult.conversations || conversationsResult.items || []
  const results = []
  const newMessages = []
  for (const rawConversation of rawConversations.slice(0, Math.min(Number(input.limit || 20) || 20, 50))) {
    const conversation = await saveConversation(env, normalizeChatConversation({
      ...rawConversation,
      channel,
      ...resolveChatCapability(env, { ...input, ...rawConversation, channel }),
      updated_at: nowIso()
    }))
    const messagesResult = await adapter.listMessages(env, conversation.platform_conversation_id || conversation.id, {
      ...input,
      conversation
    })
    const rawMessages = messagesResult?.messages || messagesResult?.items || []
    let merged = 0
    for (const rawMessage of rawMessages) {
      const normalized = normalizeChatMessage({
        ...adapter.normalizeMessage(rawMessage),
        channel,
        shop_id: conversation.shop_id,
        conversation_id: conversation.id,
        customer_id: conversation.customer_id,
        status: 'synced',
        source: `${channel}_sync`
      })
      const result = await mergeMessageIntoStore(env, normalized)
      if (result.action === 'created') newMessages.push(result.message)
      merged += 1
    }
    results.push({ conversation_id: conversation.id, merged_messages: merged })
  }
  const pushResult = await notifyNewChatMessages(env, newMessages).catch(error => ({
    ok: false,
    error_code: 'chat_push_failed',
    error_message: error?.message || String(error)
  }))
  return {
    ok: true,
    status: 'synced',
    channel,
    capability,
    conversations: results.length,
    results,
    new_messages: newMessages,
    push_notifications: pushResult
  }
}

// Kích hoạt đồng bộ ngay khi webhook báo có biến động, không chờ cron.
export async function triggerImmediateSync(env, channel, shopId, options = {}) {
  const targetChannel = cleanText(channel).toLowerCase()
  const targetShop = cleanText(shopId || options.shop_id || options.shop)
  if (!targetChannel || !targetShop) return { ok: false, error_code: 'channel_shop_required' }
  try {
    const result = await syncChatChannel(env, {
      channel: targetChannel,
      shop_id: targetShop,
      limit: Math.min(Math.max(Number(options.limit || 20) || 20, 10), 50),
      trigger: 'webhook_immediate'
    })
    for (const message of result?.new_messages || []) {
      await broadcastToWebSocket(env, message).catch(() => null)
    }
    return result
  } catch (error) {
    console.error(JSON.stringify({
      error_code: 'immediate_sync_failed',
      channel: targetChannel,
      shop_id: targetShop,
      error_message: String(error?.message || error)
    }))
    return { ok: false, error_code: 'immediate_sync_failed', error_message: String(error?.message || error) }
  }
}

function syncGroupKey(row = {}) {
  return `${cleanText(row.channel).toLowerCase()}::${cleanText(row.shop_id || row.shop)}`
}

async function listScheduledSyncCandidates(env, staleBeforeIso) {
  await ensureChatCoreTables(env)
  if (!env?.DB) {
    return listConversations(env, { limit: 200 })
  }
  const result = await env.DB.prepare(`
    SELECT DISTINCT channel, shop_id
    FROM chat_conversations
    WHERE sync_capability IN ('polling_api', 'webhook')
      AND (last_synced_at IS NULL OR last_synced_at = '' OR last_synced_at < ?)
      AND channel != ''
      AND shop_id != ''
    ORDER BY channel ASC, shop_id ASC
    LIMIT 500
  `).bind(staleBeforeIso).all()
  return result.results || []
}

async function listAutoReplyCandidates(env, settings = {}) {
  if (!backendAutoReplyGuardState(env, settings).enabled || !env?.DB) return []
  await ensureChatCoreTables(env)
  const minutes = Math.min(Math.max(Number(settings.auto_reply_minutes || 5) || 5, 1), 60)
  const cutoff = new Date(Date.now() - minutes * 60000).toISOString()
  const result = await env.DB.prepare(`
    SELECT c.*
    FROM chat_conversations c
    WHERE c.status = 'open'
      AND c.send_capability IN ('official_api', 'bridge')
      AND c.last_message_at IS NOT NULL
      AND c.last_message_at != ''
      AND c.last_message_at <= ?
      AND (
        SELECT m.sender_type
        FROM chat_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) = 'customer'
      AND NOT EXISTS (
        SELECT 1
        FROM ai_suggestions s
        WHERE s.conversation_id = c.id
          AND s.created_at >= c.last_message_at
          AND s.final_state IN ('draft', 'approved', 'auto_sent')
      )
    ORDER BY c.last_message_at ASC
    LIMIT 10
  `).bind(cutoff).all()
  return result.results || []
}

export function backendAutoReplyGuardState(env = {}, settings = {}) {
  const allowAutoSend = settings.allow_auto_send === true
  if (!allowAutoSend) return { enabled: false, reason: 'auto_send_disabled' }
  const agentMode = cleanText(settings.chat_ai_agent_config?.mode || settings.ai_mode).toLowerCase()
  if (agentMode !== 'auto_send_guarded') {
    return { enabled: false, reason: 'auto_send_requires_guarded_agent_mode' }
  }
  const runtimeFlag = cleanText(env.CHAT_AI_BACKEND_AUTO_SEND || env.CHAT_AI_BACKEND_AUTO_REPLY).toLowerCase()
  if (!['1', 'true', 'enabled'].includes(runtimeFlag)) {
    return { enabled: false, reason: 'auto_send_requires_ui_countdown' }
  }
  return { enabled: true, reason: 'backend_auto_send_explicitly_enabled' }
}

export async function runAutoReplyQueue(env, settings = {}) {
  const guard = backendAutoReplyGuardState(env, settings)
  if (!guard.enabled) {
    return { ok: true, enabled: false, reason: guard.reason, candidates: 0, sent: 0, skipped: 0, failed: 0 }
  }
  const rows = await listAutoReplyCandidates(env, settings)
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const row of rows) {
    const suggestion = await suggestChatReply(env, { conversation_id: row.id }).catch(error => ({
      ok: false,
      error_message: String(error?.message || error)
    }))
    const text = cleanText(suggestion?.suggestion?.suggested_text)
    if (!suggestion?.auto_send || !text || suggestion?.policy?.policy_status !== 'approved') {
      skipped += 1
      continue
    }
    const result = await sendChatMessage(env, {
      conversation_id: row.id,
      channel: row.channel,
      shop_id: row.shop_id,
      text,
      source: 'ai_auto_reply'
    }).catch(error => ({
      ok: false,
      error_message: String(error?.message || error)
    }))
    if (result?.ok) {
      sent += 1
      await approveAiSuggestion(env, {
        suggestion_id: suggestion.suggestion?.id,
        approved_answer: text,
        approved_by: 'ai_auto_reply',
        save_to_knowledge: false
      }).catch(() => null)
      if (result.message) await broadcastToWebSocket(env, result.message).catch(() => null)
    } else {
      failed += 1
      console.error(JSON.stringify({
        error_code: 'chat_auto_reply_failed',
        conversation_id: row.id,
        error_message: cleanText(result?.error_message || result?.error_code)
      }))
    }
  }
  return { ok: true, enabled: true, candidates: rows.length, sent, skipped, failed }
}

export async function scheduledSync(env, event = {}) {
  const settings = await getChatSettings(env).catch(() => ({}))
  const pollSeconds = Math.min(Math.max(Number(settings.poll_interval_seconds || 120) || 120, 15), 300)
  const staleBefore = Date.now() - pollSeconds * 1000
  const staleBeforeIso = new Date(staleBefore).toISOString()
  const rows = await listScheduledSyncCandidates(env, staleBeforeIso).catch(error => {
    console.error(JSON.stringify({
      error_code: 'scheduled_sync_list_failed',
      error_message: String(error?.message || error)
    }))
    return []
  })
  const groups = new Map()
  for (const row of rows || []) {
    if (row.sync_capability && !['polling_api', 'webhook'].includes(row.sync_capability)) continue
    if (row.last_synced_at && Date.parse(row.last_synced_at) >= staleBefore) continue
    const key = syncGroupKey(row)
    if (!key.includes('::') || key.endsWith('::')) continue
    if (!groups.has(key)) {
      groups.set(key, {
        channel: cleanText(row.channel).toLowerCase(),
        shop_id: cleanText(row.shop_id || row.shop),
        limit: 50
      })
    }
  }

  const settled = await Promise.allSettled([...groups.values()].map(group => syncChatChannel(env, group)))
  let synced_groups = 0
  let failed_groups = 0
  let broadcast_messages = 0
  for (const item of settled) {
    if (item.status !== 'fulfilled' || item.value?.ok === false) {
      failed_groups += 1
      console.error(JSON.stringify({
        error_code: 'scheduled_sync_group_failed',
        error_message: item.status === 'rejected' ? String(item.reason?.message || item.reason) : cleanText(item.value?.error_message || item.value?.error_code)
      }))
      continue
    }
    synced_groups += 1
    for (const message of item.value.new_messages || []) {
      const result = await broadcastToWebSocket(env, message)
      if (result.ok) broadcast_messages += 1
    }
  }
  const maintenance = await runScheduledMaintenance(env, event).catch(error => ({
    ok: false,
    error_code: 'scheduled_maintenance_failed',
    error_message: String(error?.message || error)
  }))
  const auto_reply = await runAutoReplyQueue(env, settings).catch(error => ({
    ok: false,
    error_code: 'scheduled_auto_reply_failed',
    error_message: String(error?.message || error)
  }))
  return {
    ok: true,
    trigger: event?.cron || 'manual',
    candidate_groups: groups.size,
    synced_groups,
    failed_groups,
    broadcast_messages,
    maintenance,
    auto_reply
  }
}

function vietnamNow() {
  return new Date(Date.now() + 7 * 3600000)
}

// Xuất knowledge base hàng tuần để giữ lịch sử học AI trên R2.
export async function exportKnowledgeBaseToR2(env) {
  if (!env?.CHAT_FILES) return { ok: false, error_code: 'r2_not_configured' }
  const date = new Date().toISOString().slice(0, 10)
  const key = `ai-exports/knowledge-${date}.jsonl`
  const body = await buildKnowledgeJsonl(env)
  await env.CHAT_FILES.put(key, body, {
    httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' },
    customMetadata: { expires_at: String(Date.now() + 180 * 24 * 3600000) }
  })
  console.log(JSON.stringify({ event: 'ai_knowledge_exported', key, bytes: body.length }))
  return { ok: true, key, bytes: body.length }
}

// Xóa object R2 đã quá hạn theo customMetadata.expires_at.
export async function cleanupR2OldFiles(env) {
  if (!env?.CHAT_FILES) return { ok: false, error_code: 'r2_not_configured' }
  const prefixes = ['raw/', 'attachments/', 'ai-exports/', 'conversation-exports/']
  const deleted = {}
  for (const prefix of prefixes) {
    deleted[prefix] = 0
    let cursor
    do {
      const listed = await env.CHAT_FILES.list({ prefix, cursor, limit: 1000 })
      cursor = listed.cursor
      for (const object of listed.objects || []) {
        const expiresAt = Number(object.customMetadata?.expires_at || 0)
        if (expiresAt && expiresAt < Date.now()) {
          await env.CHAT_FILES.delete(object.key)
          deleted[prefix] += 1
        }
      }
    } while (cursor)
  }
  console.log(JSON.stringify({ event: 'chat_r2_cleanup', deleted }))
  return { ok: true, deleted }
}

async function runScheduledMaintenance(env, event = {}) {
  const now = vietnamNow()
  const jobs = {}
  if (now.getUTCDay() === 1) {
    jobs.ai_export = await exportKnowledgeBaseToR2(env).catch(error => ({
      ok: false,
      error_code: 'ai_export_failed',
      error_message: String(error?.message || error)
    }))
  }
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()
  if (hour === 3 && minute <= 30) {
    jobs.r2_cleanup = await cleanupR2OldFiles(env).catch(error => ({
      ok: false,
      error_code: 'r2_cleanup_failed',
      error_message: String(error?.message || error)
    }))
  }
  return { ok: true, trigger: event?.cron || 'manual', jobs }
}
