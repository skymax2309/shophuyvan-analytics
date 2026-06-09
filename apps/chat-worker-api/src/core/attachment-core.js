import { cleanText, newChatId, normalizeAttachments, safeJsonStringify } from './message-normalize.js'

export function prepareAttachmentMetadata(input = {}, context = {}) {
  const name = cleanText(input.name || input.filename || 'attachment')
  const type = cleanText(input.type || input.kind || 'file').toLowerCase()
  const stamp = Date.now()
  const id = cleanText(input.id) || newChatId('att')
  const r2Key = cleanText(input.r2_key || input.storage_key || input.key) ||
    `${cleanText(context.channel || 'internal')}/${cleanText(context.shop_id || 'unknown')}/${stamp}-${name.replace(/[^\w.-]+/g, '_')}`
  return {
    id,
    type,
    name,
    mime_type: cleanText(input.mime_type || input.mimeType),
    size: Math.max(Number(input.size || 0) || 0, 0),
    r2_key: r2Key,
    url: cleanText(input.url),
    thumbnail_url: cleanText(input.thumbnail_url),
    source: cleanText(input.source || 'chat_core')
  }
}

export function prepareAttachments(inputs = [], context = {}) {
  return normalizeAttachments(inputs.map(item => prepareAttachmentMetadata(item, context)))
}

export function rawPayloadRef(input = {}, context = {}) {
  const existing = cleanText(input.raw_payload_ref || input.rawPayloadRef)
  if (existing) return existing
  const payload = input.raw_payload || input.rawPayload || input.payload
  if (!payload) return ''
  const channel = cleanText(context.channel || input.channel || 'internal')
  const shopId = cleanText(context.shop_id || input.shop_id || 'unknown')
  return `raw/${channel}/${shopId}/${Date.now()}-${newChatId('payload')}.json`
}

export async function storeRawPayloadIfPossible(env, payload, context = {}) {
  const ref = rawPayloadRef({ payload }, context)
  if (!ref || !env?.CHAT_FILES?.put) return ref
  // Payload lớn đi R2; D1 chỉ giữ khóa để debug có kiểm soát.
  await env.CHAT_FILES.put(ref, safeJsonStringify(payload, '{}'), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' }
  })
  return ref
}
