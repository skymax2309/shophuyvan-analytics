import {
  cleanText,
  newChatId,
  normalizeAttachments,
  normalizeChatConversation,
  normalizeChatMessage,
  safeJsonParse
} from '../core/message-normalize.js'

function adapterError(code, message, extra = {}) {
  return { ok: false, error_code: code, error_message: message, ...extra }
}

function safeJsonObject(value, fallback = {}) {
  const parsed = safeJsonParse(value, fallback)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
}

function configuredPageTokens(env = {}) {
  return safeJsonObject(env.FACEBOOK_PAGE_TOKENS_JSON, {})
}

function defaultPageToken(env = {}) {
  return cleanText(env.FACEBOOK_PAGE_ACCESS_TOKEN)
}

function pageTokenFor(env = {}, shopId = '') {
  const key = cleanText(shopId)
  const tokens = configuredPageTokens(env)
  return cleanText(tokens[key] || tokens.default || defaultPageToken(env))
}

function hasSendToken(env = {}) {
  return Boolean(defaultPageToken(env) || Object.keys(configuredPageTokens(env)).length)
}

function hasWebhookConfig(env = {}) {
  return Boolean(cleanText(env.FACEBOOK_APP_SECRET) && cleanText(env.FACEBOOK_VERIFY_TOKEN))
}

function graphApiVersion(env = {}) {
  const version = cleanText(env.FACEBOOK_GRAPH_API_VERSION || 'v23.0').replace(/^\/+|\/+$/g, '')
  return /^v\d+\.\d+$/i.test(version) ? version : 'v23.0'
}

function graphUrl(env = {}, path = '') {
  const suffix = cleanText(path).replace(/^\/+/, '')
  return `https://graph.facebook.com/${graphApiVersion(env)}/${suffix}`
}

function timestampIso(value) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric).toISOString()
  return ''
}

function eventText(event = {}) {
  const message = event.message || {}
  const postback = event.postback || {}
  return cleanText(message.text || postback.title || postback.payload)
}

function eventAttachments(event = {}) {
  const rawAttachments = Array.isArray(event.message?.attachments) ? event.message.attachments : []
  return normalizeAttachments(rawAttachments.map((attachment = {}, index) => {
    const payload = attachment.payload || {}
    return {
      id: cleanText(attachment.id || payload.attachment_id) || `facebook_att_${index}`,
      type: cleanText(attachment.type || 'file'),
      name: cleanText(payload.name || payload.title),
      mime_type: cleanText(payload.mime_type),
      size: Number(payload.size || 0) || 0,
      url: cleanText(payload.url),
      thumbnail_url: cleanText(payload.preview_url || payload.thumbnail_url),
      source: 'facebook_webhook'
    }
  }))
}

function isEcho(event = {}, pageId = '') {
  return event.message?.is_echo === true || cleanText(event.sender?.id) === cleanText(pageId)
}

function customerIdFor(event = {}, pageId = '') {
  const senderId = cleanText(event.sender?.id)
  const recipientId = cleanText(event.recipient?.id)
  return senderId && senderId !== cleanText(pageId) ? senderId : recipientId
}

function messageIdFor(event = {}) {
  return cleanText(
    event.message?.mid ||
    event.postback?.mid ||
    event.message?.reply_to?.mid ||
    event.delivery?.mids?.[0] ||
    event.read?.watermark
  )
}

function normalizeEvent(event = {}, entry = {}, env = {}) {
  const pageId = cleanText(entry.id || event.recipient?.id || event.page_id)
  const customerId = customerIdFor(event, pageId)
  if (!pageId || !customerId) return null

  const text = eventText(event)
  const attachments = eventAttachments(event)
  if (!text && attachments.length === 0) return null

  const platformMessageId = messageIdFor(event) || `${cleanText(event.timestamp)}_${cleanText(event.sender?.id)}_${cleanText(event.recipient?.id)}`
  const conversationId = `facebook_${pageId}_${customerId}`
  const createdAt = timestampIso(event.timestamp) || ''
  const senderType = isEcho(event, pageId) ? 'shop' : 'customer'

  const conversation = normalizeChatConversation({
    id: conversationId,
    channel: 'facebook',
    shop_id: pageId,
    customer_id: customerId,
    customer_name: cleanText(event.sender?.name || event.customer_name),
    platform_conversation_id: customerId,
    last_message_text: text || (attachments.length ? '[Attachment]' : ''),
    last_message_at: createdAt,
    shop_chat_mode: 'api',
    send_capability: pageTokenFor(env, pageId) ? 'official_api' : 'none',
    sync_capability: 'webhook',
    status: 'open'
  })

  const message = normalizeChatMessage({
    id: `facebook_${pageId}_${platformMessageId || newChatId('msg')}`,
    channel: 'facebook',
    shop_id: pageId,
    conversation_id: conversation.id,
    customer_id: customerId,
    sender_type: senderType,
    sender_name: senderType === 'shop' ? 'Facebook Page' : cleanText(event.sender?.name || event.customer_name || 'Facebook user'),
    text,
    attachments,
    platform_message_id: platformMessageId,
    created_at: createdAt,
    status: 'synced',
    source: 'facebook_webhook'
  })

  return { conversation, message }
}

export function getCapabilities(env = {}) {
  const sendConfigured = hasSendToken(env)
  const webhookConfigured = hasWebhookConfig(env)
  return {
    channel: 'facebook',
    list_conversations: false,
    list_messages: false,
    send_message: sendConfigured,
    attachments: false,
    webhook: webhookConfigured,
    mode: sendConfigured || webhookConfigured ? 'official_api_configured' : 'adapter_not_configured'
  }
}

export async function listConversations() {
  return adapterError('adapter_not_implemented', 'facebook_list_not_supported')
}

export async function listMessages() {
  return adapterError('adapter_not_implemented', 'facebook_message_pull_not_supported')
}

export async function sendMessage(env = {}, payload = {}) {
  const conversation = payload.conversation || {}
  const message = payload.message || {}
  const shopId = cleanText(conversation.shop_id || message.shop_id || payload.shop_id)
  const recipientId = cleanText(conversation.customer_id || message.customer_id || payload.customer_id || conversation.platform_conversation_id)
  const text = cleanText(payload.text || message.text)
  const token = pageTokenFor(env, shopId)

  if (!token) return adapterError('adapter_not_configured', 'facebook_page_token_missing')
  if (!recipientId) return adapterError('facebook_recipient_missing', 'facebook_recipient_missing')
  if (!text) return adapterError('facebook_text_missing', 'facebook_text_missing')
  if (Array.isArray(payload.attachments) && payload.attachments.length) {
    return adapterError('facebook_attachment_not_supported', 'facebook_attachment_send_not_supported')
  }

  const response = await fetch(graphUrl(env, 'me/messages'), {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: cleanText(payload.messaging_type || 'RESPONSE'),
      message: { text }
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) {
    return adapterError(
      cleanText(data.error?.code || data.error?.type || 'facebook_send_failed'),
      cleanText(data.error?.message || `facebook_graph_http_${response.status}`),
      { raw: data }
    )
  }
  return {
    ok: true,
    platform_message_id: cleanText(data.message_id) || newChatId('facebook_msg'),
    raw: data
  }
}

export function normalizeMessage(raw = {}) {
  return { ...raw, channel: 'facebook', source: raw.source || 'facebook_adapter' }
}

export function normalizeWebhookPayload(rawBody, env = {}) {
  const body = typeof rawBody === 'string' ? safeJsonParse(rawBody, {}) : (rawBody || {})
  const conversationsById = new Map()
  const messages = []
  const entries = Array.isArray(body.entry) ? body.entry : []

  for (const entry of entries) {
    const events = Array.isArray(entry.messaging) ? entry.messaging : []
    for (const event of events) {
      const normalized = normalizeEvent(event, entry, env)
      if (!normalized) continue
      conversationsById.set(normalized.conversation.id, normalized.conversation)
      messages.push(normalized.message)
    }
  }

  return {
    conversations: [...conversationsById.values()],
    messages
  }
}

export async function fetchAttachments() {
  return adapterError('adapter_not_implemented', 'facebook_attachment_fetch_not_supported')
}
