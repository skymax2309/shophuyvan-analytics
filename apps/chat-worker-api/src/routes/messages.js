import { getConversationById, listMessagesByConversation } from '../core/conversation-core.js'
import { sendJson } from './settings.js'

export async function handleMessagesRoute(request, env) {
  if (request.method !== 'GET') return null
  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversation_id') || url.searchParams.get('id')
  const conversation = await getConversationById(env, conversationId)
  if (!conversation) return sendJson({ ok: false, error: 'conversation_not_found' }, 404)
  const messages = await listMessagesByConversation(env, conversationId, { limit: url.searchParams.get('limit') || 100 })
  return sendJson({ ok: true, conversation, messages })
}
