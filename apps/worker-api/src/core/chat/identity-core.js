function cleanText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value).replace(/\u00a0/g, ' ').trim()
}

export function normalizeChatIdentityText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9@._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isAutomationConversationId(value) {
  const text = cleanText(value).toLowerCase()
  return text.startsWith('automation-') || text.startsWith('browser-') || text.startsWith('preview-')
}

export function isGenericChatBuyerName(value) {
  const normalized = normalizeChatIdentityText(value)
  if (!normalized) return true
  if (/^\d{1,4}$/.test(normalized)) return true
  return [
    'khach hang',
    'khach hang moi',
    'customer',
    'buyer',
    'user',
    'third party user',
    'third-party-user',
    'nguoi ban',
    'chat voi nguoi ban',
    'lazada',
    'shopee',
    'tiktok'
  ].includes(normalized)
}

export function chatIdentityKey(row = {}) {
  const platform = normalizeChatIdentityText(row.platform)
  const shop = cleanText(row.shop_id || row.api_shop_id)
    ? `id:${cleanText(row.shop_id || row.api_shop_id)}`
    : `shop:${normalizeChatIdentityText(row.shop || row.shop_name || row.display_name)}`
  const buyerId = cleanText(row.buyer_id || row.customer_id || row.user_id)
  if (platform && shop && buyerId) return `${platform}|${shop}|buyer:${buyerId}`
  const buyerName = normalizeChatIdentityText(row.buyer_name || row.customer_name || row.name)
  if (platform && shop && buyerName && !isGenericChatBuyerName(buyerName)) return `${platform}|${shop}|name:${buyerName}`
  const conversationId = cleanText(row.conversation_id || row.conversationId || row.thread_id || row.session_id || row.chat_id)
  if (platform && shop && conversationId) return `${platform}|${shop}|conversation:${conversationId}`
  return ''
}

export function isWeakChatConversationIdentity(row = {}) {
  const conversationId = cleanText(row.conversation_id || row.conversationId)
  const buyerId = cleanText(row.buyer_id || row.customer_id || row.user_id)
  const buyerName = cleanText(row.buyer_name || row.customer_name || row.name)
  if (!conversationId) return true
  if (isAutomationConversationId(conversationId) && !buyerId) return true
  return !buyerId && isGenericChatBuyerName(buyerName)
}

export function shouldAliasConversation(aliasConversationId, canonicalConversationId) {
  const alias = cleanText(aliasConversationId)
  const canonical = cleanText(canonicalConversationId)
  return Boolean(alias && canonical && alias !== canonical)
}
