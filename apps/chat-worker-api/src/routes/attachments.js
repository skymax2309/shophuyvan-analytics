import { prepareAttachments } from '../core/attachment-core.js'
import { sendJson } from './settings.js'

export async function handleAttachmentsRoute(request) {
  if (request.method !== 'POST') return null
  const body = await request.json().catch(() => ({}))
  const attachments = prepareAttachments(body.attachments || [], body)
  return sendJson({ ok: true, attachments })
}
