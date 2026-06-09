import { callShopeeChatApi, cleanText, compactApiError, json, loadShopeeBridgeShop } from './shopee-bridge.js'

export async function markShopeeBridgeConversationRead(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const conversation = body.conversation && typeof body.conversation === 'object' ? body.conversation : body
  const loaded = await loadShopeeBridgeShop(env, conversation)
  if (loaded.error_code) return json({ ok: false, success: false, error_code: loaded.error_code, error_message: loaded.error_message }, cors, 400)

  const conversationId = cleanText(
    body.conversation_id ||
    body.platform_conversation_id ||
    conversation.platform_conversation_id ||
    conversation.conversation_id ||
    conversation.id ||
    ''
  )
  if (!/^\d+$/.test(conversationId)) {
    return json({
      ok: false,
      success: false,
      error_code: 'missing_conversation_id',
      error_message: 'Thiếu conversation_id chính thức để đánh dấu Shopee Chat đã đọc.'
    }, cors, 400)
  }
  const lastReadMessageId = cleanText(body.last_read_message_id || conversation.last_read_message_id || conversation.last_message_id || '')
  if (!lastReadMessageId) {
    return json({
      ok: false,
      success: false,
      error_code: 'missing_last_read_message_id',
      error_message: 'Thiếu last_read_message_id để đánh dấu Shopee Chat đã đọc.'
    }, cors, 400)
  }

  const attempts = []
  const payloads = [
    { conversation_id: conversationId, last_read_message_id: lastReadMessageId },
    { conversation_id: conversationId, message_id: lastReadMessageId },
    { conversation_id: conversationId, last_read_msg_id: lastReadMessageId },
    {
      rawBody: `{"conversation_id":${conversationId},"last_read_message_id":${lastReadMessageId}}`,
      keys: ['conversation_id:number64', 'last_read_message_id:number64']
    }
  ]
  let result = null
  for (const payload of payloads) {
    result = await callShopeeChatApi(env, loaded.shop, '/api/v2/sellerchat/read_conversation', {
      method: 'POST',
      body: payload.rawBody ? undefined : payload,
      rawBody: payload.rawBody
    })
    attempts.push({ keys: payload.keys || Object.keys(payload), status: result.status, error: cleanText(result.data?.error), message: cleanText(result.data?.message || result.data?.debug_message) })
    if (result.ok) break
    if (cleanText(result.data?.error) !== 'param_error') break
  }
  if (!result.ok) {
    return json({
      ok: false,
      success: false,
      status: 'failed',
      error_code: cleanText(result.data?.error || 'shopee_read_conversation_failed'),
      error_message: cleanText(result.data?.message || result.data?.debug_message || 'Shopee từ chối đánh dấu hội thoại đã đọc.'),
      raw: { status: result.status, shopee: compactApiError(result.data), attempts }
    }, cors, result.status ? 502 : 400)
  }
  return json({
    ok: true,
    success: true,
    status: 'read',
    endpoint_path: '/api/v2/sellerchat/read_conversation',
    platform_conversation_id: conversationId,
    raw: { status: result.status, request_id: cleanText(result.data?.request_id), response: result.data?.response || {}, attempts }
  }, cors)
}
