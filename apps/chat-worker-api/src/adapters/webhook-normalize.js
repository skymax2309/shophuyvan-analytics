import { cleanText, newChatId, normalizeChatConversation, normalizeChatMessage, safeJsonParse } from '../core/message-normalize.js'

function parsePayload(rawBody) {
  if (rawBody && typeof rawBody === 'object') return rawBody
  return safeJsonParse(cleanText(rawBody), {})
}

function arrayFrom(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') return [value]
  }
  return []
}

function senderType(value) {
  const text = cleanText(value).toLowerCase()
  if (['buyer', 'customer', 'client', 'user'].includes(text)) return 'customer'
  if (['seller', 'shop', 'operator', 'admin'].includes(text)) return 'shop'
  if (text === 'ai') return 'ai'
  return 'system'
}

function lastMessage(messages = []) {
  return [...messages]
    .sort((a, b) => cleanText(a.sent_at || a.created_at || a.timestamp).localeCompare(cleanText(b.sent_at || b.created_at || b.timestamp)))
    .pop() || {}
}

function platformConversationId(raw = {}) {
  return cleanText(raw.platform_conversation_id || raw.conversation_id || raw.session_id || raw.thread_id || raw.chat_id)
}

function platformMessageId(raw = {}) {
  return cleanText(raw.platform_message_id || raw.message_id || raw.msg_id || raw.id)
}

export function normalizeMarketplaceWebhookPayload(channel, rawBody, options = {}) {
  const body = parsePayload(rawBody)
  const data = body.data && typeof body.data === 'object' ? body.data : {}
  const rawConversations = arrayFrom(body.conversations, data.conversations, body.conversation, data.conversation)
  const rawMessages = arrayFrom(body.messages, data.messages, body.message, data.message, body.msg, data.msg)
  const conversationsById = new Map()
  const messages = []

  for (const rawConversation of rawConversations) {
    const nestedMessages = arrayFrom(rawConversation.messages, rawConversation.items)
    const last = lastMessage(nestedMessages)
    const platformId = platformConversationId(rawConversation) || platformConversationId(last)
    if (!platformId) continue
    const shopId = cleanText(rawConversation.shop_id || rawConversation.shop || body.shop_id || data.shop_id || options.shop_id)
    const conversation = normalizeChatConversation({
      ...rawConversation,
      id: cleanText(rawConversation.id) || `${channel}_${shopId || 'shop'}_${platformId}`,
      channel,
      shop_id: shopId,
      customer_id: cleanText(rawConversation.customer_id || rawConversation.buyer_id || last.customer_id || last.sender_id),
      platform_conversation_id: platformId,
      last_message_text: cleanText(rawConversation.last_message_text || last.text || last.content),
      last_message_at: cleanText(rawConversation.last_message_at || last.sent_at || last.created_at || last.timestamp),
      shop_chat_mode: 'api',
      send_capability: 'bridge',
      sync_capability: 'webhook'
    })
    conversationsById.set(conversation.platform_conversation_id, conversation)
    for (const message of nestedMessages) rawMessages.push({ ...message, conversation_id: platformId, shop_id: shopId })
  }

  for (const rawMessage of rawMessages) {
    const platformConversation = platformConversationId(rawMessage)
    if (!platformConversation) continue
    const shopId = cleanText(rawMessage.shop_id || rawMessage.shop || body.shop_id || data.shop_id || options.shop_id)
    const conversation = conversationsById.get(platformConversation) || normalizeChatConversation({
      id: `${channel}_${shopId || 'shop'}_${platformConversation}`,
      channel,
      shop_id: shopId,
      customer_id: cleanText(rawMessage.customer_id || rawMessage.buyer_id || rawMessage.sender_id),
      platform_conversation_id: platformConversation,
      last_message_text: cleanText(rawMessage.text || rawMessage.content),
      last_message_at: cleanText(rawMessage.sent_at || rawMessage.created_at || rawMessage.timestamp),
      shop_chat_mode: 'api',
      send_capability: 'bridge',
      sync_capability: 'webhook'
    })
    conversationsById.set(conversation.platform_conversation_id, conversation)
    messages.push(normalizeChatMessage({
      ...rawMessage,
      id: cleanText(rawMessage.id) || `${channel}_${platformMessageId(rawMessage) || newChatId('webhook_msg')}`,
      channel,
      shop_id: shopId,
      conversation_id: conversation.id,
      customer_id: cleanText(rawMessage.customer_id || rawMessage.buyer_id || rawMessage.sender_id || conversation.customer_id),
      sender_type: senderType(rawMessage.sender_type || rawMessage.sender || rawMessage.from_type),
      text: cleanText(rawMessage.text || rawMessage.content?.text || rawMessage.content || rawMessage.message),
      platform_message_id: platformMessageId(rawMessage),
      created_at: cleanText(rawMessage.sent_at || rawMessage.created_at || rawMessage.timestamp),
      source: `${channel}_webhook`
    }))
  }

  return {
    conversations: [...conversationsById.values()],
    messages
  }
}
