import { canSendLive, resolveChatCapability, unavailableSendState } from './capability-core.js'
import { getConversationById } from './conversation-core.js'
import { mergeMessageIntoStore } from './message-merge.js'
import { cleanText, newChatId, normalizeChannel, nowIso } from './message-normalize.js'
import { adapterForChannel } from './send-core.js'

const DEFAULT_CORE_API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function coreApiBase(env = {}) {
  return cleanText(env.SHOP_CORE_API_BASE || env.CORE_API_BASE || env.SHOPHUYVAN_CORE_API_BASE || DEFAULT_CORE_API_BASE).replace(/\/+$/, '')
}

async function fetchCoreOrder(env, orderId) {
  const id = cleanText(orderId)
  if (!id) return null
  const res = await fetch(`${coreApiBase(env)}/api/core/orders/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 0, cacheEverything: false }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) return null
  return data.order || null
}

function orderId(order = {}, input = {}) {
  return firstText(input.order_id, input.order_sn, input.platform_order_id, order.order_id, order.order_sn, order.platform_order_id, order.id)
}

function orderName(order = {}, input = {}) {
  return firstText(input.order_name, order.order_id, order.order_sn, order.platform_order_id, 'đơn hàng')
}

function orderCardSupport(env, conversation = {}, input = {}) {
  const channel = normalizeChannel(conversation.channel || input.channel)
  const capability = resolveChatCapability(env, { ...conversation, ...input })
  const adapter = adapterForChannel(channel)
  const adapterCapabilities = adapter?.getCapabilities?.(env) || {}
  if (!['shopee', 'lazada'].includes(channel)) {
    return { supported: false, channel, capability, error_code: 'order_card_not_supported', reason: 'Kênh này chưa có API gửi thẻ đơn hàng trong Chat Worker.' }
  }
  if (!canSendLive(capability)) {
    const unavailable = unavailableSendState(capability)
    return { supported: false, channel, capability, error_code: unavailable.error_code, reason: unavailable.error_message }
  }
  if (!adapter?.sendOrderCard || !adapterCapabilities.send_order_card) {
    return { supported: false, channel, capability, error_code: 'adapter_not_configured', reason: 'Bridge kênh này chưa cấu hình gửi thẻ đơn hàng.' }
  }
  return { supported: true, channel, capability, adapter }
}

export async function sendOrderCard(env, input = {}) {
  const conversationId = cleanText(input.conversation_id || input.id)
  const conversation = conversationId ? await getConversationById(env, conversationId) : null
  if (!conversation) {
    return { ok: false, status: 'failed', error_code: 'conversation_not_found', error_message: 'Không tìm thấy hội thoại trong Chat Core để gửi thẻ đơn hàng.' }
  }

  const inputOrder = input.order && typeof input.order === 'object' ? input.order : {}
  const id = orderId(inputOrder, input)
  const verifiedOrder = await fetchCoreOrder(env, id)
  if (!verifiedOrder) {
    return { ok: false, status: 'failed', error_code: 'order_core_not_found', error_message: 'Không tìm thấy mã đơn này trong Order Core.' }
  }

  const support = orderCardSupport(env, conversation, input)
  if (!support.supported) {
    return { ok: false, status: 'unsupported', error_code: support.error_code, error_message: support.reason, capability: support.capability, order: verifiedOrder }
  }

  if (input.dry_run === true) {
    const dryRunResult = await support.adapter.sendOrderCard(env, {
      conversation,
      order: verifiedOrder,
      order_id: orderId(verifiedOrder, input),
      dry_run: true
    })
    return {
      ok: Boolean(dryRunResult.ok),
      dry_run: true,
      sent_to_platform: false,
      status: dryRunResult.ok ? 'dry_run' : 'failed',
      error_code: dryRunResult.error_code || '',
      error_message: dryRunResult.error_message || '',
      capability: support.capability,
      order: verifiedOrder,
      adapter: dryRunResult.raw || null
    }
  }

  const stamp = nowIso()
  const sending = {
    id: cleanText(input.id) || newChatId('msg'),
    channel: support.channel,
    shop_id: conversation.shop_id,
    conversation_id: conversation.id,
    customer_id: conversation.customer_id,
    sender_type: 'shop',
    sender_name: input.sender_name || 'Shop',
    text: `Shop gửi thẻ đơn hàng ${orderName(verifiedOrder, input)}`,
    status: 'sending',
    client_temp_id: cleanText(input.client_temp_id) || newChatId('tmp'),
    order_id: orderId(verifiedOrder, input),
    source: 'order_card',
    created_at: stamp,
    updated_at: stamp
  }
  const saved = await mergeMessageIntoStore(env, sending)

  let adapterResult
  try {
    adapterResult = await support.adapter.sendOrderCard(env, {
      conversation,
      order: verifiedOrder,
      order_id: sending.order_id,
      dry_run: false
    })
  } catch (error) {
    adapterResult = { ok: false, error_code: 'adapter_exception', error_message: cleanText(error?.message || error) }
  }

  if (!adapterResult?.ok) {
    const failed = await mergeMessageIntoStore(env, {
      ...saved.message,
      status: 'failed',
      error_code: adapterResult?.error_code || 'order_card_failed',
      error_message: adapterResult?.error_message || 'Không gửi được thẻ đơn hàng qua adapter.',
      updated_at: nowIso()
    })
    return { ok: false, status: 'failed', message: failed.message, saved_message: saved.message, error_code: failed.message.error_code, error_message: failed.message.error_message, capability: support.capability, order: verifiedOrder }
  }

  const sent = await mergeMessageIntoStore(env, {
    ...saved.message,
    status: 'sent',
    platform_message_id: cleanText(adapterResult.platform_message_id) || saved.message.platform_message_id,
    error_code: '',
    error_message: '',
    updated_at: nowIso()
  })
  return {
    ok: true,
    status: 'sent',
    sent_to_platform: true,
    message: sent.message,
    saved_message: saved.message,
    capability: support.capability,
    order: verifiedOrder,
    adapter: {
      channel: support.channel,
      ok: true,
      platform_message_id: cleanText(adapterResult.platform_message_id)
    }
  }
}
