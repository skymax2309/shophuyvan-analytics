import { sendChatMessage } from '../core/send-core.js'
import { sendJson } from './settings.js'

export async function handleSendRoute(request, env) {
  if (request.method !== 'POST') return null
  const body = await request.json().catch(() => ({}))
  if (!body.text && !body.content && !body.message && !Array.isArray(body.attachments)) {
    return sendJson({ ok: false, error: 'empty_message', message: 'Bạn cần nhập nội dung hoặc attachment.' }, 400)
  }
  const result = await sendChatMessage(env, body)
  return sendJson(result, 200)
}
