import {
  extractOneConversationRow,
  normalizeShopeeConversation,
  shopeeConversationId
} from './shopee-chat-normalize.js'

function cleanText(value) {
  return String(value ?? '').trim()
}

function compactApiError(data = {}) {
  return {
    error: cleanText(data.error || data.error_code),
    message: cleanText(data.message || data.error_message || data.debug_message),
    request_id: cleanText(data.request_id || data.response?.request_id)
  }
}

function rowNeedsConversationDetail(row = {}, base = {}) {
  const customer = normalizeShopeeConversation(row, base)
  return Boolean(customer.conversation_id && (!customer.customer_name || !customer.last_message_text))
}

export async function enrichRecentConversationRows(options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : []
  const base = options.base || {}
  const attempts = Array.isArray(options.attempts) ? options.attempts : []
  const fetchConversationDetail = options.fetchConversationDetail
  const limit = Math.min(Math.max(Number(options.limit || 12) || 12, 0), 20)
  if (!limit || typeof fetchConversationDetail !== 'function') return rows

  const enriched = []
  let checked = 0
  for (const row of rows) {
    if (checked >= limit || !rowNeedsConversationDetail(row, base)) {
      enriched.push(row)
      continue
    }
    checked += 1
    const conversationId = shopeeConversationId(row)
    const result = await fetchConversationDetail(conversationId)
    attempts.push({
      path: '/api/v2/sellerchat/get_one_conversation',
      mode: 'recent_enrich',
      conversation_id: conversationId,
      http_status: result.status,
      ...compactApiError(result.data)
    })
    const detailRow = result.ok ? extractOneConversationRow(result.data) : null
    enriched.push(detailRow ? { ...row, ...detailRow, conversation_id: conversationId } : row)
  }
  return enriched
}
