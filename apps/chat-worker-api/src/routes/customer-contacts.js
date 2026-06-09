import { backfillCustomerContactsFromChat } from '../core/customer-contact-bridge-core.js'
import { sendJson } from './settings.js'

export async function handleCustomerContactsRoute(request, env) {
  if (request.method !== 'POST') {
    return sendJson({
      ok: false,
      error_code: 'method_not_allowed',
      error_message: 'Chỉ hỗ trợ POST để đồng bộ thông tin khách từ chat.'
    }, 405)
  }
  const body = await request.json().catch(() => ({}))
  return sendJson(await backfillCustomerContactsFromChat(env, body))
}
