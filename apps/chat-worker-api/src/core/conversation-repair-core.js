import { cleanText, nowIso } from './message-normalize.js'

export async function fillMissingCustomerNames(env, rows = []) {
  const missing = rows.filter(row => !cleanText(row.customer_name))
  if (!missing.length || !env?.DB) return rows
  const placeholders = missing.map(() => '?').join(',')
  const result = await env.DB.prepare(`
    SELECT conversation_id, sender_name
    FROM chat_messages
    WHERE conversation_id IN (${placeholders})
      AND LOWER(sender_type) = 'customer'
      AND sender_name != ''
    ORDER BY COALESCE(created_at, updated_at, id) ASC
  `).bind(...missing.map(row => row.id)).all()
  const nameByConversation = new Map()
  for (const message of result.results || []) {
    if (!nameByConversation.has(message.conversation_id)) {
      nameByConversation.set(message.conversation_id, cleanText(message.sender_name))
    }
  }
  const stamp = nowIso()
  for (const row of missing) {
    const name = nameByConversation.get(row.id)
    if (!name) continue
    // Bù tên khách từ message đã đồng bộ để Core không còn hiển thị "Khách chưa rõ" cho dữ liệu cũ.
    row.customer_name = name
    await env.DB.prepare(`
      UPDATE chat_conversations
      SET customer_name = ?, updated_at = ?
      WHERE id = ? AND customer_name = ''
    `).bind(name, stamp, row.id).run()
  }
  return rows
}
