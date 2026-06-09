import { callShopeeChatApi, cleanText, compactApiError, json, loadShopeeBridgeShop } from './shopee-bridge.js'

function shopeeChatErrorText(data = {}) {
  return cleanText([
    data.error,
    data.error_code,
    data.message,
    data.error_message,
    data.debug_message
  ].filter(Boolean).join(' ')).toLowerCase()
}

function isMissingFirstChatOrderInfo(data = {}) {
  const text = shopeeChatErrorText(data)
  return text.includes('first_chat_without_order_info') ||
    text.includes('must contain order information') ||
    text.includes('no existing conversation') ||
    text.includes('order information between 2 users')
}

function shouldRetryShopeeSendVariant(data = {}) {
  const text = shopeeChatErrorText(data)
  return isMissingFirstChatOrderInfo(data) ||
    /param|parameter|invalid|content|message.?type|order_sn|source/.test(text)
}

function normalizeShopeeTimestamp(value) {
  const text = cleanText(value)
  if (!text) return ''
  const number = Number(text)
  if (Number.isFinite(number) && number > 0) {
    const ms = number > 1e17
      ? Math.floor(number / 1e6)
      : (number > 1e14 ? Math.floor(number / 1e3) : (number > 1e11 ? number : number * 1000))
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function shopeeTextMessagePayload(toId, text, orderSn = '') {
  return {
    to_id: toId,
    message_type: 'text',
    content: {
      text,
      ...(orderSn ? { order_sn: orderSn } : {})
    }
  }
}

function shopeeOrderMessagePayload(toId, orderSn) {
  return {
    to_id: toId,
    message_type: 'order',
    content: { order_sn: orderSn }
  }
}

function buildShopeeProductCardPayload(conversation = {}, itemId, messageType = 'item') {
  return {
    to_id: Number(conversation.buyer_id || conversation.customer_id || conversation.to_id || 0),
    message_type: messageType,
    content: {
      item_id: Number(itemId)
    }
  }
}

export async function sendShopeeBridgeMessage(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const loaded = await loadShopeeBridgeShop(env, body.conversation || body)
  if (loaded.error_code) return json({ ok: false, success: false, error_code: loaded.error_code, error_message: loaded.error_message }, cors, 400)
  const text = cleanText(body.text || body.content || body.message?.text || body.message?.content).slice(0, 5000)
  const conversation = body.conversation && typeof body.conversation === 'object' ? body.conversation : {}
  const toId = Number(body.to_id || body.buyer_id || conversation.buyer_id || conversation.customer_id || 0)
  const orderSn = cleanText(body.order_id || body.order_sn || body.raw_input?.order_id || body.raw_input?.order_sn || conversation.order_id || conversation.order_sn)
  if (!text) return json({ ok: false, success: false, error_code: 'missing_text', error_message: 'Thiếu nội dung text để gửi Shopee live.' }, cors, 400)
  if (!Number.isFinite(toId) || toId <= 0) {
    return json({ ok: false, success: false, error_code: 'missing_buyer_id', error_message: 'Thiếu buyer_id/to_id.' }, cors, 400)
  }
  if (Array.isArray(body.attachments) && body.attachments.length) {
    return json({ ok: false, success: false, error_code: 'attachment_bridge_not_ready', error_message: 'Shopee bridge nội bộ hiện chỉ bật text live; attachment chưa được gửi lên sàn.' }, cors, 400)
  }

  const attempts = []
  const sendPayload = async (payload, label) => {
    const current = await callShopeeChatApi(env, loaded.shop, '/api/v2/sellerchat/send_message', {
      method: 'POST',
      body: payload
    })
    attempts.push({
      label,
      message_type: payload.message_type,
      has_order_sn: Boolean(payload.content?.order_sn || payload.source_content?.order_sn),
      http_status: current.status,
      ...compactApiError(current.data)
    })
    return current
  }

  // Shopee yêu cầu order_sn nằm trong content khi shop chủ động nhắn khách chưa có hội thoại.
  const basePayload = shopeeTextMessagePayload(toId, text, orderSn)
  let result = await sendPayload(basePayload, orderSn ? 'text_with_order_sn' : 'text')
  if (!result.ok && orderSn && shouldRetryShopeeSendVariant(result.data)) {
    result = await sendPayload({
      ...shopeeTextMessagePayload(toId, text),
      source_type: 'order',
      source_content: { order_sn: orderSn }
    }, 'text_with_source_content')
  }
  if (!result.ok && orderSn && isMissingFirstChatOrderInfo(result.data)) {
    const orderResult = await sendPayload(shopeeOrderMessagePayload(toId, orderSn), 'order_card_seed')
    if (orderResult.ok) {
      result = await sendPayload(shopeeTextMessagePayload(toId, text), 'text_after_order_card')
    }
  }
  if (!result.ok) {
    return json({
      ok: false,
      success: false,
      status: 'failed',
      error_code: cleanText(result.data?.error || 'shopee_send_failed'),
      error_message: cleanText(result.data?.message || result.data?.debug_message || 'Shopee từ chối gửi tin nhắn.'),
      raw: { status: result.status, shopee: compactApiError(result.data), attempts }
    }, cors, result.status ? 502 : 400)
  }
  const response = result.data?.response && typeof result.data.response === 'object' ? result.data.response : {}
  const createdTimestamp = response.created_timestamp || response.create_time || response.timestamp
  return json({
    ok: true,
    success: true,
    status: 'sent',
    platform_message_id: cleanText(response.message_id || result.data?.message_id || result.data?.request_id),
    sent_at: normalizeShopeeTimestamp(createdTimestamp) || new Date().toISOString(),
    raw: { status: result.status, request_id: cleanText(result.data?.request_id), response, attempts }
  }, cors)
}

export async function sendShopeeBridgeProductCard(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const conversation = body.conversation && typeof body.conversation === 'object' ? body.conversation : {}
  const product = body.product && typeof body.product === 'object' ? body.product : {}
  const loaded = await loadShopeeBridgeShop(env, conversation.shop_id ? conversation : body)
  if (loaded.error_code) return json({ ok: false, success: false, error_code: loaded.error_code, error_message: loaded.error_message }, cors, 400)

  const itemId = cleanText(body.product_item_id || body.item_id || product.platform_product_id || product.platform_item_id)
  const toId = Number(body.to_id || body.buyer_id || conversation.buyer_id || conversation.customer_id || 0)
  if (!itemId || !Number.isFinite(Number(itemId)) || Number(itemId) <= 0) {
    return json({ ok: false, success: false, error_code: 'missing_product_item_id', error_message: 'Thiếu item_id Shopee.' }, cors, 400)
  }
  if (!Number.isFinite(toId) || toId <= 0) {
    return json({ ok: false, success: false, error_code: 'missing_buyer_id', error_message: 'Thiếu buyer_id/to_id chính thức.' }, cors, 400)
  }

  const attempts = []
  for (const messageType of ['item', 'product']) {
    const payload = buildShopeeProductCardPayload({ ...conversation, buyer_id: toId }, itemId, messageType)
    if (body.dry_run === true) {
      attempts.push({ message_type: messageType, dry_run: true, payload })
      continue
    }
    const result = await callShopeeChatApi(env, loaded.shop, '/api/v2/sellerchat/send_message', {
      method: 'POST',
      body: payload
    })
    attempts.push({ message_type: messageType, http_status: result.status, ...compactApiError(result.data) })
    if (result.ok) {
      const response = result.data?.response && typeof result.data.response === 'object' ? result.data.response : {}
      const createdTimestamp = response.created_timestamp || response.create_time || response.timestamp
      return json({
        ok: true,
        success: true,
        status: 'sent',
        message_type: messageType,
        product_item_id: itemId,
        platform_message_id: cleanText(response.message_id || result.data?.message_id || result.data?.request_id),
        sent_at: normalizeShopeeTimestamp(createdTimestamp) || new Date().toISOString(),
        raw: { status: result.status, request_id: cleanText(result.data?.request_id), response }
      }, cors)
    }
    const errorText = `${attempts[attempts.length - 1]?.error || ''} ${attempts[attempts.length - 1]?.message || ''}`.toLowerCase()
    if (!/(message type|messagetype|message_type|type|param|parameter|invalid|item|product)/.test(errorText)) break
  }

  if (body.dry_run === true) {
    return json({
      ok: true,
      success: true,
      dry_run: true,
      sent_to_platform: false,
      status: 'dry_run',
      product_item_id: itemId,
      endpoint_path: '/api/v2/sellerchat/send_message',
      attempts
    }, cors)
  }

  return json({
    ok: false,
    success: false,
    status: 'failed',
    error_code: 'send_product_card_failed',
    error_message: attempts.map(item => `${item.message_type}: ${item.error || item.message || item.http_status}`).join(' | ') || 'Shopee không nhận thẻ sản phẩm.',
    product_item_id: itemId,
    attempts
  }, cors, 502)
}

export async function sendShopeeBridgeOrderCard(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const conversation = body.conversation && typeof body.conversation === 'object' ? body.conversation : {}
  const order = body.order && typeof body.order === 'object' ? body.order : {}
  const loaded = await loadShopeeBridgeShop(env, conversation.shop_id ? conversation : body)
  if (loaded.error_code) return json({ ok: false, success: false, error_code: loaded.error_code, error_message: loaded.error_message }, cors, 400)

  const toId = Number(body.to_id || body.buyer_id || conversation.buyer_id || conversation.customer_id || 0)
  const orderSn = cleanText(body.order_id || body.order_sn || order.order_sn || order.platform_order_id || order.order_id || order.id)
  if (!Number.isFinite(toId) || toId <= 0) {
    return json({ ok: false, success: false, error_code: 'missing_buyer_id', error_message: 'Thiếu buyer_id/to_id chính thức.' }, cors, 400)
  }
  if (!orderSn) {
    return json({ ok: false, success: false, error_code: 'missing_order_sn', error_message: 'Thiếu order_sn Shopee để gửi thẻ đơn hàng.' }, cors, 400)
  }

  const payload = shopeeOrderMessagePayload(toId, orderSn)
  if (body.dry_run === true) {
    return json({
      ok: true,
      success: true,
      dry_run: true,
      sent_to_platform: false,
      status: 'dry_run',
      order_id: orderSn,
      endpoint_path: '/api/v2/sellerchat/send_message',
      payload
    }, cors)
  }

  const result = await callShopeeChatApi(env, loaded.shop, '/api/v2/sellerchat/send_message', {
    method: 'POST',
    body: payload
  })
  if (!result.ok) {
    return json({
      ok: false,
      success: false,
      status: 'failed',
      error_code: cleanText(result.data?.error || 'send_order_card_failed'),
      error_message: cleanText(result.data?.message || result.data?.debug_message || 'Shopee không nhận thẻ đơn hàng.'),
      order_id: orderSn,
      raw: { status: result.status, shopee: compactApiError(result.data) }
    }, cors, 502)
  }

  const response = result.data?.response && typeof result.data.response === 'object' ? result.data.response : {}
  const createdTimestamp = response.created_timestamp || response.create_time || response.timestamp
  return json({
    ok: true,
    success: true,
    status: 'sent',
    order_id: orderSn,
    platform_message_id: cleanText(response.message_id || result.data?.message_id || result.data?.request_id),
    sent_at: normalizeShopeeTimestamp(createdTimestamp) || new Date().toISOString(),
    raw: { status: result.status, request_id: cleanText(result.data?.request_id), response }
  }, cors)
}
