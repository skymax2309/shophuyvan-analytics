import { normalizeChatMessage, nowIso } from './message-normalize.js'
import {
  findStoredMessageByDedupe,
  insertStoredMessage,
  touchConversationFromMessage,
  updateStoredMessage
} from './conversation-core.js'
import { forwardCustomerContactFromChatMessage } from './customer-contact-bridge-core.js'

export function messageDedupeKey(input = {}) {
  const message = normalizeChatMessage(input)
  if (message.platform_message_id) return `platform:${message.channel}:${message.shop_id}:${message.platform_message_id}`
  if (message.client_temp_id) return `client:${message.channel}:${message.shop_id}:${message.client_temp_id}`
  return `id:${message.id}`
}

function mergeMessageFields(existing = {}, incoming = {}) {
  const next = normalizeChatMessage({
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    platform_message_id: incoming.platform_message_id || existing.platform_message_id,
    client_temp_id: incoming.client_temp_id || existing.client_temp_id,
    created_at: existing.created_at || incoming.created_at,
    updated_at: nowIso()
  })
  // Readback từ sàn xác nhận lại tin đã gửi, không hạ trạng thái live send đang sent.
  if (existing.status === 'sent' && ['sending', 'synced'].includes(incoming.status)) {
    next.status = 'sent'
    next.shop_id = existing.shop_id || incoming.shop_id
    next.conversation_id = existing.conversation_id || incoming.conversation_id
    next.client_temp_id = existing.client_temp_id || incoming.client_temp_id
  }
  if (existing.status === 'failed' && incoming.status === 'sending') next.status = 'failed'
  return next
}

export function mergeMessageList(existingMessages = [], incomingMessages = []) {
  const byKey = new Map()
  const ordered = []
  for (const raw of existingMessages) {
    const message = normalizeChatMessage(raw)
    const key = messageDedupeKey(message)
    byKey.set(key, message)
    ordered.push(message)
  }
  for (const raw of incomingMessages) {
    const incoming = normalizeChatMessage(raw)
    const platformKey = incoming.platform_message_id ? `platform:${incoming.channel}:${incoming.shop_id}:${incoming.platform_message_id}` : ''
    const clientKey = incoming.client_temp_id ? `client:${incoming.channel}:${incoming.shop_id}:${incoming.client_temp_id}` : ''
    const existing = (platformKey && byKey.get(platformKey)) || (clientKey && byKey.get(clientKey))
    if (existing) {
      const merged = mergeMessageFields(existing, incoming)
      const index = ordered.findIndex(item => item.id === existing.id)
      if (index >= 0) ordered[index] = merged
      if (platformKey) byKey.set(platformKey, merged)
      if (clientKey) byKey.set(clientKey, merged)
    } else {
      ordered.push(incoming)
      byKey.set(messageDedupeKey(incoming), incoming)
    }
  }
  return ordered.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
}

export async function mergeMessageIntoStore(env, input = {}) {
  const incoming = normalizeChatMessage(input)
  const existing = await findStoredMessageByDedupe(env, incoming)
  const message = existing
    ? await updateStoredMessage(env, existing.id, mergeMessageFields(existing, incoming))
    : await insertStoredMessage(env, incoming)
  // Chỉ tin khách mới thực sự làm tăng số chưa đọc; readback trùng từ sàn không được ghi đè trạng thái nhân viên đã đọc.
  await touchConversationFromMessage(env, message, { incrementUnread: !existing })
  await forwardCustomerContactFromChatMessage(env, message).catch(() => null)
  return {
    action: existing ? 'merged' : 'created',
    message
  }
}
