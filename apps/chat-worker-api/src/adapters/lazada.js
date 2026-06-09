import { cleanText, newChatId } from '../core/message-normalize.js'
import { normalizeMarketplaceWebhookPayload } from './webhook-normalize.js'

function adapterError(code, message) {
  return { ok: false, error_code: code, error_message: message }
}

function bridgeSecret(env = {}) {
  return cleanText(env.LAZADA_CHAT_BRIDGE_SECRET || env.SHOPEE_CHAT_BRIDGE_SECRET)
}

function hasLazadaBridge(env = {}) {
  return Boolean(env.LAZADA_CHAT_BRIDGE_URL && bridgeSecret(env))
}

function bridgeHeaders(env = {}) {
  const secret = bridgeSecret(env)
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(secret ? { 'X-Chat-Bridge-Secret': secret } : {})
  }
}

function bridgeUrl(env = {}, path = '') {
  const base = cleanText(env.LAZADA_CHAT_BRIDGE_URL).replace(/\/+$/, '')
  const suffix = `/${cleanText(path).replace(/^\/+/, '')}`
  return new URL(`${base}${suffix}`)
}

export function getCapabilities(env = {}) {
  const bridgeConfigured = hasLazadaBridge(env)
  return {
    channel: 'lazada',
    list_conversations: bridgeConfigured,
    list_messages: bridgeConfigured,
    send_message: bridgeConfigured,
    send_product_card: bridgeConfigured,
    send_order_card: bridgeConfigured,
    send_voucher_card: bridgeConfigured,
    attachments: false,
    mode: bridgeConfigured ? 'bridge_configured' : 'adapter_not_configured'
  }
}

export async function listConversations(env, options = {}) {
  if (!hasLazadaBridge(env)) {
    return adapterError('adapter_not_configured', 'Lazada adapter chưa có endpoint và secret cầu nối chính thức.')
  }
  const url = bridgeUrl(env, 'conversations')
  if (options.shop_id) url.searchParams.set('shop_id', options.shop_id)
  const res = await fetch(url, { headers: bridgeHeaders(env) })
  return res.ok ? res.json() : adapterError('lazada_bridge_error', `Lazada bridge HTTP ${res.status}`)
}

export async function listMessages(env, conversationId, options = {}) {
  if (!hasLazadaBridge(env)) {
    return adapterError('adapter_not_configured', 'Lazada adapter chưa có endpoint và secret cầu nối chính thức.')
  }
  const url = bridgeUrl(env, `conversations/${encodeURIComponent(conversationId)}/messages`)
  if (options.shop_id) url.searchParams.set('shop_id', options.shop_id)
  const res = await fetch(url, { headers: bridgeHeaders(env) })
  return res.ok ? res.json() : adapterError('lazada_bridge_error', `Lazada bridge HTTP ${res.status}`)
}

export async function pollInbox(env, options = {}) {
  if (!hasLazadaBridge(env)) {
    return adapterError('adapter_not_configured', 'Lazada adapter chưa có endpoint và secret cầu nối chính thức.')
  }
  const res = await fetch(bridgeUrl(env, 'sync'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify({
      shop: cleanText(options.shop),
      shop_id: cleanText(options.shop_id),
      limit: Math.min(Math.max(Number(options.limit || 20) || 20, 1), 100),
      page_size: Math.min(Math.max(Number(options.page_size || 20) || 20, 1), 50),
      days: Math.min(Math.max(Number(options.days || 0) || 0, 0), 730) || undefined,
      force_history: options.force_history === true || options.force === true,
      page_count: Math.min(Math.max(Number(options.page_count || options.session_page_count || 1) || 1, 1), 10),
      session_page_count: Math.min(Math.max(Number(options.session_page_count || options.page_count || 1) || 1, 1), 10),
      message_page_count: Math.min(Math.max(Number(options.message_page_count || options.message_pages || 0) || 0, 0), 8) || undefined,
      target_conversation_id: cleanText(options.target_conversation_id || options.platform_conversation_id || options.session_id),
      platform_conversation_id: cleanText(options.platform_conversation_id),
      known_conversation_timestamps: options.known_conversation_timestamps || {}
    })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      status: cleanText(data.status || 'failed'),
      capability: data.capability,
      error_code: cleanText(data.error_code || data.error || 'lazada_bridge_sync_error'),
      error_message: cleanText(data.error_message || data.message || `Lazada bridge sync HTTP ${res.status}`),
      pulled_conversations: Number(data.pulled_conversations || data.sync?.pulled_conversations || 0) || 0,
      pulled_messages: Number(data.pulled_messages || data.sync?.pulled_messages || 0) || 0
    }
  }
  return data
}

export async function sendMessage(env, payload = {}) {
  if (!hasLazadaBridge(env)) {
    return adapterError('adapter_not_configured', 'Lazada adapter chưa được cấu hình endpoint và secret gửi chính thức.')
  }
  const rawInput = payload.raw_input && typeof payload.raw_input === 'object' ? payload.raw_input : {}
  const emojiCode = cleanText(rawInput.emoji_code || rawInput.txt)
  const templateId = Number(rawInput.template_id || (rawInput.message_type === 'emoji' && emojiCode ? 4 : 1)) || 1
  const res = await fetch(bridgeUrl(env, 'messages/send'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify({
      ...payload,
      template_id: templateId,
      text: templateId === 4 && emojiCode ? emojiCode : payload.text
    })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return adapterError(cleanText(data.error_code || data.error || 'lazada_send_failed'), cleanText(data.error_message || data.message || `Lazada bridge HTTP ${res.status}`))
  }
  if (data.dry_run === true) {
    return adapterError('dry_run_not_sent', 'Lazada bridge đang ở dry-run nên chưa gửi tin thật lên sàn.')
  }
  return {
    ok: true,
    platform_message_id: cleanText(data.platform_message_id || data.message_id) || newChatId('lazada_msg'),
    raw: data
  }
}

async function sendTemplateMessage(env, payload = {}, fallbackId = 'lazada_msg') {
  if (!hasLazadaBridge(env)) {
    return adapterError('adapter_not_configured', 'Lazada adapter chưa được cấu hình endpoint và secret gửi chính thức.')
  }
  const res = await fetch(bridgeUrl(env, 'messages/send'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return adapterError(cleanText(data.error_code || data.error || 'lazada_template_send_failed'), cleanText(data.error_message || data.message || `Lazada bridge HTTP ${res.status}`))
  }
  if (data.dry_run === true) {
    return {
      ok: true,
      dry_run: true,
      sent_to_platform: false,
      raw: data
    }
  }
  return {
    ok: true,
    platform_message_id: cleanText(data.platform_message_id || data.message_id) || newChatId(fallbackId),
    raw: data
  }
}

export async function sendProductCard(env, payload = {}) {
  const product = payload.product && typeof payload.product === 'object' ? payload.product : {}
  const itemId = cleanText(payload.product_item_id || payload.item_id || product.platform_product_id || product.platform_item_id || product.item_id)
  return sendTemplateMessage(env, {
    ...payload,
    template_id: 10006,
    item_id: itemId
  }, 'lazada_product_card')
}

export async function sendOrderCard(env, payload = {}) {
  const order = payload.order && typeof payload.order === 'object' ? payload.order : {}
  const orderId = cleanText(payload.order_id || payload.order_sn || order.order_id || order.order_sn || order.platform_order_id || order.id)
  return sendTemplateMessage(env, {
    ...payload,
    template_id: 10007,
    order_id: orderId
  }, 'lazada_order_card')
}

export function normalizeMessage(raw = {}) {
  const sender = cleanText(raw.sender_type || raw.sender || '').toLowerCase()
  const senderType = sender === 'buyer' || sender === 'customer' ? 'customer' : (sender === 'shop' || sender === 'seller' ? 'shop' : sender)
  return {
    ...raw,
    channel: 'lazada',
    sender_type: senderType || raw.sender_type,
    platform_message_id: raw.platform_message_id || raw.message_id,
    text: cleanText(raw.text || raw.content?.text || raw.content || raw.message || raw.body),
    source: raw.source || 'lazada_adapter'
  }
}

export function normalizeConversation(raw = {}) {
  const platformConversationId = cleanText(raw.platform_conversation_id || raw.conversation_id || raw.session_id)
  const shopId = cleanText(raw.shop_id || raw.shop)
  return {
    ...raw,
    id: cleanText(raw.id) || `lazada_${shopId || 'shop'}_${platformConversationId || newChatId('conversation')}`,
    channel: 'lazada',
    shop_id: shopId,
    customer_id: cleanText(raw.customer_id || raw.buyer_id || raw.to_id),
    customer_name: cleanText(raw.customer_name || raw.buyer_name || raw.user_name || raw.nickname || raw.display_name),
    platform_conversation_id: platformConversationId,
    last_message_text: cleanText(raw.last_message_text || raw.last_message),
    last_message_at: cleanText(raw.last_message_at || raw.updated_at),
    shop_chat_mode: 'api',
    send_capability: 'bridge',
    sync_capability: 'polling_api',
    last_message_timestamp: cleanText(raw.last_message_timestamp),
    sync_cursor: cleanText(raw.sync_cursor)
  }
}

export function normalizeWebhookPayload(rawBody, env = {}, options = {}) {
  return normalizeMarketplaceWebhookPayload('lazada', rawBody, options)
}

export async function fetchAttachments() {
  return adapterError('adapter_not_implemented', 'Lazada attachment fetch chưa được nối trong chat worker mới.')
}
