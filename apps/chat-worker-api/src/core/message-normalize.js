export const CHAT_CHANNELS = new Set(['shopee', 'lazada', 'tiktok', 'facebook', 'zalo', 'internal'])
export const CHAT_SENDER_TYPES = new Set(['customer', 'shop', 'ai', 'system'])
export const CHAT_MESSAGE_STATUSES = new Set(['sending', 'sent', 'failed', 'synced', 'deleted', 'manual_pending', 'queued_for_browser_helper'])
export const SHOP_CHAT_MODES = new Set(['api', 'browser_helper', 'manual', 'disabled'])
export const SEND_CAPABILITIES = new Set(['official_api', 'bridge', 'manual_only', 'none'])
export const SYNC_CAPABILITIES = new Set(['webhook', 'polling_api', 'browser_helper', 'manual_import', 'none'])

const CP1252_REVERSE = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f]
])

export function repairMojibakeText(value) {
  const text = String(value ?? '')
  if (!/(?:\u00c3|\u00c4|\u00c5|\u00c6|\u00c2|\u00cc|\u00e1\u00ba|\u00e1\u00bb)/.test(text)) return text
  try {
    // Helper browser cũ từng gửi nhầm UTF-8 dưới dạng Windows-1252; sửa trước khi ghi vào Chat Core.
    const bytes = new Uint8Array([...text].map(character => {
      const code = character.codePointAt(0)
      if (code <= 255) return code
      if (CP1252_REVERSE.has(code)) return CP1252_REVERSE.get(code)
      throw new Error('unsupported_mojibake_character')
    }))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return text
  }
}

export function cleanText(value) {
  if (value === null || value === undefined) return ''
  if (value === 0) return '0'
  if (Array.isArray(value)) return value.map(item => cleanText(item)).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    return cleanText(
      value.text ??
      value.message ??
      value.content ??
      value.value ??
      value.name ??
      value.title ??
      value.label ??
      value.display_name ??
      value.display_value
    )
  }
  const plain = repairMojibakeText(value).replace(/\u00a0/g, ' ').trim()
  return plain === '[object Object]' ? '' : plain
}

export function nowIso() {
  return new Date().toISOString()
}

export function newChatId(prefix = 'chat') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}_${random}`
}

export function normalizeChannel(value) {
  const channel = cleanText(value).toLowerCase()
  return CHAT_CHANNELS.has(channel) ? channel : 'internal'
}

export function normalizeSenderType(value) {
  const senderType = cleanText(value).toLowerCase()
  return CHAT_SENDER_TYPES.has(senderType) ? senderType : 'system'
}

export function normalizeMessageStatus(value, fallback = 'synced') {
  const status = cleanText(value).toLowerCase()
  return CHAT_MESSAGE_STATUSES.has(status) ? status : fallback
}

export function normalizeShopChatMode(value, fallback = 'disabled') {
  const mode = cleanText(value).toLowerCase()
  return SHOP_CHAT_MODES.has(mode) ? mode : fallback
}

export function normalizeSendCapability(value, fallback = 'none') {
  const capability = cleanText(value).toLowerCase()
  return SEND_CAPABILITIES.has(capability) ? capability : fallback
}

export function normalizeSyncCapability(value, fallback = 'none') {
  const capability = cleanText(value).toLowerCase()
  return SYNC_CAPABILITIES.has(capability) ? capability : fallback
}

export function safeJsonParse(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export function safeJsonStringify(value, fallback = '[]') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

export function normalizeStringArray(value) {
  const raw = Array.isArray(value) ? value : safeJsonParse(value, [])
  return (Array.isArray(raw) ? raw : [])
    .map(item => cleanText(item))
    .filter(Boolean)
}

export function normalizeAttachments(value) {
  const raw = Array.isArray(value) ? value : safeJsonParse(value, [])
  return (Array.isArray(raw) ? raw : [])
    .filter(Boolean)
    .slice(0, 12)
    .map(item => ({
      id: cleanText(item.id) || newChatId('att'),
      type: cleanText(item.type || item.kind || 'file').toLowerCase(),
      name: cleanText(item.name || item.filename),
      mime_type: cleanText(item.mime_type || item.mimeType || item.type_mime),
      size: Math.max(Number(item.size || 0) || 0, 0),
      r2_key: cleanText(item.r2_key || item.storage_key || item.key),
      url: cleanText(item.url),
      thumbnail_url: cleanText(item.thumbnail_url || item.thumb_url),
      source: cleanText(item.source || 'chat_core')
    }))
}

export function normalizeChatConversation(input = {}, fallback = {}) {
  const stamp = cleanText(input.updated_at || fallback.updated_at) || nowIso()
  const pulledConversations = Math.max(Number(input.pulled_conversations ?? fallback.pulled_conversations ?? 0) || 0, 0)
  const pulledMessages = Math.max(Number(input.pulled_messages ?? fallback.pulled_messages ?? 0) || 0, 0)
  const savedMessages = Math.max(Number(input.saved_messages ?? fallback.saved_messages ?? 0) || 0, 0)
  const skippedDuplicates = Math.max(Number(input.skipped_duplicates ?? fallback.skipped_duplicates ?? 0) || 0, 0)
  return {
    id: cleanText(input.id || fallback.id) || newChatId('conv'),
    channel: normalizeChannel(input.channel || input.platform || fallback.channel || fallback.platform),
    shop_id: cleanText(input.shop_id || input.shop || fallback.shop_id || fallback.shop),
    shop_display_name: cleanText(input.shop_display_name || fallback.shop_display_name),
    shop_name_source: cleanText(input.shop_name_source || fallback.shop_name_source),
    shop_profile_source: cleanText(input.shop_profile_source || fallback.shop_profile_source),
    shop_name_missing: Boolean(input.shop_name_missing ?? fallback.shop_name_missing ?? false),
    customer_id: cleanText(input.customer_id || input.buyer_id || input.sender_id || fallback.customer_id || fallback.buyer_id),
    customer_name: cleanText(input.customer_name || input.buyer_name || input.sender_name || input.to_name || input.display_name || input.nickname || input.user_name || fallback.customer_name || fallback.buyer_name || fallback.display_name || fallback.nickname),
    platform_conversation_id: cleanText(input.platform_conversation_id || input.conversation_id || fallback.platform_conversation_id || fallback.conversation_id),
    last_message_text: cleanText(input.last_message_text || input.last_message || fallback.last_message_text || fallback.last_message),
    last_message_at: cleanText(input.last_message_at || fallback.last_message_at || stamp),
    unread_count: Math.max(Number(input.unread_count ?? fallback.unread_count ?? 0) || 0, 0),
    assigned_to: cleanText(input.assigned_to || fallback.assigned_to),
    tags: normalizeStringArray(input.tags ?? fallback.tags),
    status: cleanText(input.status || fallback.status || 'open').toLowerCase(),
    shop_chat_mode: normalizeShopChatMode(input.shop_chat_mode ?? fallback.shop_chat_mode, 'disabled'),
    send_capability: normalizeSendCapability(input.send_capability ?? fallback.send_capability, 'none'),
    sync_capability: normalizeSyncCapability(input.sync_capability ?? fallback.sync_capability, 'none'),
    last_synced_at: cleanText(input.last_synced_at || fallback.last_synced_at),
    last_success_at: cleanText(input.last_success_at || fallback.last_success_at),
    last_error_code: cleanText(input.last_error_code || fallback.last_error_code),
    last_error_message: cleanText(input.last_error_message || fallback.last_error_message),
    pulled_conversations: pulledConversations,
    pulled_messages: pulledMessages,
    saved_messages: savedMessages,
    skipped_duplicates: skippedDuplicates,
    last_message_timestamp: cleanText(input.last_message_timestamp || fallback.last_message_timestamp),
    sync_cursor: cleanText(input.sync_cursor || fallback.sync_cursor),
    updated_at: stamp,
    created_at: cleanText(input.created_at || fallback.created_at) || stamp
  }
}

export function normalizeChatMessage(input = {}, fallback = {}) {
  const createdAt = cleanText(input.created_at || input.sent_at || fallback.created_at || fallback.sent_at) || nowIso()
  const updatedAt = cleanText(input.updated_at || fallback.updated_at) || nowIso()
  const channel = normalizeChannel(input.channel || input.platform || fallback.channel || fallback.platform)
  const text = cleanText(input.text ?? input.content ?? input.message ?? fallback.text ?? fallback.content)
  return {
    id: cleanText(input.id || fallback.id) || newChatId('msg'),
    channel,
    shop_id: cleanText(input.shop_id || input.shop || fallback.shop_id || fallback.shop),
    conversation_id: cleanText(input.conversation_id || fallback.conversation_id),
    customer_id: cleanText(input.customer_id || input.buyer_id || input.sender_id || fallback.customer_id || fallback.buyer_id),
    sender_type: normalizeSenderType(input.sender_type || fallback.sender_type),
    sender_name: cleanText(input.sender_name || fallback.sender_name),
    text,
    attachments: normalizeAttachments(input.attachments ?? input.media_items ?? fallback.attachments ?? fallback.media_items),
    status: normalizeMessageStatus(input.status || input.delivery_status || fallback.status, 'synced'),
    platform_message_id: cleanText(input.platform_message_id || input.message_id || fallback.platform_message_id || fallback.message_id),
    client_temp_id: cleanText(input.client_temp_id || fallback.client_temp_id),
    reply_to_message_id: cleanText(input.reply_to_message_id || fallback.reply_to_message_id),
    order_id: cleanText(input.order_id || input.order_sn || fallback.order_id || fallback.order_sn),
    product_ids: normalizeStringArray(input.product_ids ?? input.product_id ?? fallback.product_ids),
    created_at: createdAt,
    updated_at: updatedAt,
    source: cleanText(input.source || fallback.source || 'api'),
    raw_payload_ref: cleanText(input.raw_payload_ref || fallback.raw_payload_ref),
    error_code: cleanText(input.error_code || fallback.error_code),
    error_message: cleanText(input.error_message || fallback.error_message)
  }
}
