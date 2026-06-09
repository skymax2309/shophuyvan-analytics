import { shopeeConversationId } from './shopee-chat-normalize.js'

function cleanText(value) {
  return String(value ?? '').trim()
}

export function targetConversationFromBody(body = {}, base = {}) {
  const explicitConversationId = cleanText(
    body.platform_conversation_id ||
    body.target_conversation_id ||
    body.shopee_conversation_id
  )
  const fallbackConversationId = cleanText(body.conversation_id)
  const conversationId = explicitConversationId || (/^\d{12,}$/.test(fallbackConversationId) ? fallbackConversationId : '')
  if (!conversationId) return null
  return {
    conversation_id: conversationId,
    to_id: cleanText(body.customer_id || body.buyer_id || body.to_id),
    buyer_id: cleanText(body.customer_id || body.buyer_id || body.to_id),
    to_name: cleanText(body.customer_name || body.buyer_name || body.to_name),
    buyer_name: cleanText(body.customer_name || body.buyer_name || body.to_name),
    last_message: cleanText(body.last_message_text || body.last_message),
    shop_id: base.shop_id
  }
}

export function sameShopeeConversation(row = {}, conversationId = '') {
  const current = shopeeConversationId(row)
  return Boolean(cleanText(conversationId) && cleanText(current) === cleanText(conversationId))
}
