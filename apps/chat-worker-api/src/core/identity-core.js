import { cleanText } from './message-normalize.js'

export function conversationIdentityKey(input = {}) {
  const channel = cleanText(input.channel || input.platform).toLowerCase()
  const shopId = cleanText(input.shop_id || input.shop)
  const platformConversationId = cleanText(input.platform_conversation_id || input.conversation_id)
  const customerId = cleanText(input.customer_id || input.buyer_id || input.sender_id)
  return [channel, shopId, platformConversationId || customerId].filter(Boolean).join(':')
}

export function canMergeConversationIdentity(a = {}, b = {}) {
  const aKey = conversationIdentityKey(a)
  const bKey = conversationIdentityKey(b)
  return Boolean(aKey && bKey && aKey === bKey)
}
