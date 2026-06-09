import { cleanText, newChatId } from '../core/message-normalize.js'
import { normalizeMarketplaceWebhookPayload } from './webhook-normalize.js'

function adapterError(code, message) {
  return { ok: false, error_code: code, error_message: message }
}

function hasShopeeBridge(env = {}) {
  return Boolean(env.SHOPEE_CHAT_BRIDGE_URL && env.SHOPEE_CHAT_BRIDGE_SECRET)
}

function bridgeHeaders(env = {}) {
  const secret = cleanText(env.SHOPEE_CHAT_BRIDGE_SECRET)
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(secret ? { 'X-Chat-Bridge-Secret': secret } : {})
  }
}

function bridgeUrl(env = {}, path = '') {
  const base = cleanText(env.SHOPEE_CHAT_BRIDGE_URL).replace(/\/+$/, '')
  const suffix = `/${cleanText(path).replace(/^\/+/, '')}`
  return new URL(`${base}${suffix}`)
}

export function getCapabilities(env = {}) {
  const bridgeConfigured = hasShopeeBridge(env)
  return {
    channel: 'shopee',
    list_conversations: bridgeConfigured,
    list_messages: bridgeConfigured,
    send_message: bridgeConfigured,
    send_product_card: bridgeConfigured,
    send_order_card: bridgeConfigured,
    read_conversation: bridgeConfigured,
    attachments: false,
    mode: bridgeConfigured ? 'bridge_configured' : 'adapter_not_configured'
  }
}

export async function listConversations(env, options = {}) {
  if (!hasShopeeBridge(env)) {
    return adapterError('adapter_not_configured', 'Shopee adapter chưa có endpoint và secret cầu nối chính thức.')
  }
  const url = bridgeUrl(env, 'conversations')
  if (options.shop_id) url.searchParams.set('shop_id', options.shop_id)
  const res = await fetch(url, { headers: bridgeHeaders(env) })
  return res.ok ? res.json() : adapterError('shopee_bridge_error', `Shopee bridge HTTP ${res.status}`)
}

export async function listMessages(env, conversationId, options = {}) {
  if (!hasShopeeBridge(env)) {
    return adapterError('adapter_not_configured', 'Shopee adapter chưa có endpoint và secret cầu nối chính thức.')
  }
  const url = bridgeUrl(env, `conversations/${encodeURIComponent(conversationId)}/messages`)
  if (options.shop_id) url.searchParams.set('shop_id', options.shop_id)
  const res = await fetch(url, { headers: bridgeHeaders(env) })
  return res.ok ? res.json() : adapterError('shopee_bridge_error', `Shopee bridge HTTP ${res.status}`)
}

export async function pollInbox(env, options = {}) {
  if (!hasShopeeBridge(env)) {
    return adapterError('adapter_not_configured', 'Shopee adapter chưa có endpoint và secret cầu nối chính thức.')
  }
  const res = await fetch(bridgeUrl(env, 'sync'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify({
      shop: cleanText(options.shop),
      shop_id: cleanText(options.shop_id),
      conversation_id: cleanText(options.conversation_id),
      platform_conversation_id: cleanText(options.platform_conversation_id),
      customer_id: cleanText(options.customer_id),
      customer_name: cleanText(options.customer_name),
      last_message_text: cleanText(options.last_message_text),
      limit: Math.min(Math.max(Number(options.limit || 20) || 20, 1), 50),
      page_size: Math.min(Math.max(Number(options.page_size || 20) || 20, 1), 50),
      known_conversation_timestamps: options.known_conversation_timestamps || {},
      include_lost_push: options.include_lost_push === true || options.force_history === true || options.diagnostic === true,
      diagnostic: options.diagnostic === true,
      probe_list_variants: options.probe_list_variants === true,
      probe_names: Array.isArray(options.probe_names) ? options.probe_names : []
    })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      status: cleanText(data.status || 'failed'),
      capability: data.capability,
      error_code: cleanText(data.error_code || data.error || 'shopee_bridge_sync_error'),
      error_message: cleanText(data.error_message || data.message || `Shopee bridge sync HTTP ${res.status}`),
      pulled_conversations: Number(data.pulled_conversations || data.sync?.pulled_conversations || 0) || 0,
      pulled_messages: Number(data.pulled_messages || data.sync?.pulled_messages || 0) || 0
    }
  }
  return data
}

export async function sendMessage(env, payload = {}) {
  if (!hasShopeeBridge(env)) {
    return adapterError('adapter_not_configured', 'Shopee adapter chưa được cấu hình endpoint và secret gửi chính thức.')
  }
  const res = await fetch(bridgeUrl(env, 'messages/send'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return adapterError(cleanText(data.error_code || data.error || 'shopee_send_failed'), cleanText(data.error_message || data.message || `Shopee bridge HTTP ${res.status}`))
  }
  if (data.dry_run === true) {
    return adapterError('dry_run_not_sent', 'Shopee bridge đang ở dry-run nên chưa gửi tin thật lên sàn.')
  }
  return {
    ok: true,
    platform_message_id: cleanText(data.platform_message_id || data.message_id) || newChatId('shopee_msg'),
    raw: data
  }
}

export async function sendProductCard(env, payload = {}) {
  if (!hasShopeeBridge(env)) {
    return adapterError('adapter_not_configured', 'Shopee adapter chưa được cấu hình bridge gửi thẻ sản phẩm.')
  }
  const res = await fetch(bridgeUrl(env, 'messages/product-card'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return adapterError(cleanText(data.error_code || data.error || 'shopee_product_card_failed'), cleanText(data.error_message || data.message || `Shopee bridge product card HTTP ${res.status}`))
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
    platform_message_id: cleanText(data.platform_message_id || data.message_id) || newChatId('shopee_product_card'),
    raw: data
  }
}

export async function sendOrderCard(env, payload = {}) {
  if (!hasShopeeBridge(env)) {
    return adapterError('adapter_not_configured', 'Shopee adapter chưa được cấu hình bridge gửi thẻ đơn hàng.')
  }
  const res = await fetch(bridgeUrl(env, 'messages/order-card'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return adapterError(cleanText(data.error_code || data.error || 'shopee_order_card_failed'), cleanText(data.error_message || data.message || `Shopee bridge order card HTTP ${res.status}`))
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
    platform_message_id: cleanText(data.platform_message_id || data.message_id) || newChatId('shopee_order_card'),
    raw: data
  }
}

export async function markConversationRead(env, payload = {}) {
  if (!hasShopeeBridge(env)) {
    return adapterError('adapter_not_configured', 'Shopee adapter chưa được cấu hình bridge đánh dấu đã đọc.')
  }
  const res = await fetch(bridgeUrl(env, 'conversations/read'), {
    method: 'POST',
    headers: bridgeHeaders(env),
    body: JSON.stringify(payload)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return adapterError(cleanText(data.error_code || data.error || 'shopee_read_conversation_failed'), cleanText(data.error_message || data.message || `Shopee bridge read HTTP ${res.status}`))
  }
  return { ok: true, raw: data }
}

export function normalizeMessage(raw = {}) {
  const sender = cleanText(raw.sender_type || raw.sender || '').toLowerCase()
  const senderType = sender === 'buyer' || sender === 'customer' ? 'customer' : (sender === 'shop' || sender === 'seller' ? 'shop' : sender)
  return {
    ...raw,
    channel: 'shopee',
    sender_type: senderType || raw.sender_type,
    platform_message_id: raw.platform_message_id || raw.message_id,
    text: raw.text || raw.content?.text || raw.content || '',
    source: raw.source || 'shopee_adapter'
  }
}

export function normalizeConversation(raw = {}) {
  const platformConversationId = cleanText(raw.platform_conversation_id || raw.conversation_id)
  const shopId = cleanText(raw.shop_id || raw.shop)
  return {
    ...raw,
    id: cleanText(raw.id) || `shopee_${shopId || 'shop'}_${platformConversationId || newChatId('conversation')}`,
    channel: 'shopee',
    shop_id: shopId,
    customer_id: cleanText(raw.customer_id || raw.buyer_id || raw.to_id),
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
  return normalizeMarketplaceWebhookPayload('shopee', rawBody, options)
}

export async function fetchAttachments() {
  return adapterError('adapter_not_implemented', 'Shopee attachment fetch chưa được nối trong chat worker mới.')
}
