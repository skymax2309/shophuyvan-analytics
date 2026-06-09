import { sendOrderCard } from '../core/order-card-core.js'
import { sendJson } from './settings.js'

export async function handleOrderCardsRoute(request, env) {
  if (request.method !== 'POST') return null
  const body = await request.json().catch(() => ({}))
  if (!body.conversation_id && !body.id) {
    return sendJson({
      ok: false,
      error: 'missing_conversation_id',
      message: 'Thiếu conversation_id để gửi thẻ đơn hàng.'
    }, 400)
  }
  const result = await sendOrderCard(env, body)
  const status = result.ok || result.dry_run ? 200 : (result.error_code === 'conversation_not_found' ? 404 : 409)
  return sendJson(result, status)
}
