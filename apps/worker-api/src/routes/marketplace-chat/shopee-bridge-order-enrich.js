import { normalizeShopeeConversation } from './shopee-chat-normalize.js'

function cleanText(value) {
  return String(value ?? '').trim()
}

function usableName(value = '', buyerId = '') {
  const name = cleanText(value)
  if (!name || name === cleanText(buyerId) || /^\d+$/.test(name)) return ''
  return name
}

async function loadBuyerNames(env, buyerIds = []) {
  const ids = [...new Set(buyerIds.map(cleanText).filter(Boolean))].slice(0, 30)
  if (!ids.length || !env?.DB) return new Map()
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT buyer_id,
           COALESCE(NULLIF(buyer_username, ''), NULLIF(customer_name, '')) AS buyer_name,
           MAX(COALESCE(order_date, created_at, updated_at, '')) AS latest_order_at
    FROM orders_v2
    WHERE platform = 'shopee'
      AND buyer_id IN (${placeholders})
    GROUP BY buyer_id
  `).bind(...ids).all()
  const map = new Map()
  for (const row of results || []) {
    const name = usableName(row.buyer_name, row.buyer_id)
    if (name) map.set(cleanText(row.buyer_id), name)
  }
  return map
}

export async function enrichRowsWithOrderBuyerNames(env, rows = [], base = {}) {
  const targets = []
  for (const row of rows) {
    const conversation = normalizeShopeeConversation(row, base)
    if (conversation.customer_id && !conversation.customer_name) targets.push(conversation.customer_id)
  }
  const names = await loadBuyerNames(env, targets)
  if (!names.size) return rows
  return rows.map(row => {
    const conversation = normalizeShopeeConversation(row, base)
    const name = names.get(conversation.customer_id)
    if (!name || conversation.customer_name) return row
    return {
      ...row,
      buyer_name: row.buyer_name || name,
      to_name: row.to_name || name,
      customer_name: row.customer_name || name
    }
  })
}
