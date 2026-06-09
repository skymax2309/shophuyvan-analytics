import { cleanText, newChatId } from './message-normalize.js'

export function normalizeCustomerIdentity(input = {}) {
  const channel = cleanText(input.channel || input.platform).toLowerCase() || 'internal'
  const shopId = cleanText(input.shop_id || input.shop)
  const platformId = cleanText(input.customer_id || input.buyer_id || input.user_id || input.sender_id)
  const name = cleanText(input.customer_name || input.buyer_name || input.sender_name || input.name)
  return {
    id: platformId || newChatId('customer'),
    channel,
    shop_id: shopId,
    platform_customer_id: platformId,
    name,
    tags: Array.isArray(input.tags) ? input.tags.map(cleanText).filter(Boolean) : []
  }
}
