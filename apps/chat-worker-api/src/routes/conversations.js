import { getConversationById, getConversationSyncDiagnostic, listConversations, listMessagesByConversation, markConversationRead } from '../core/conversation-core.js'
import { enrichConversationsWithShopDisplay } from '../core/shop-display-core.js'
import { markConversationRead as markShopeeConversationRead } from '../adapters/shopee.js'
import { sendJson } from './settings.js'

export async function handleConversationsRoute(request, env, params = {}) {
  const url = new URL(request.url)
  if (request.method === 'GET' && params.id && params.sync_diagnostic) {
    const diagnostic = await getConversationSyncDiagnostic(env, params.id)
    if (!diagnostic) return sendJson({ ok: false, error: 'conversation_not_found' }, 404)
    return sendJson({ ok: true, diagnostic })
  }
  if (request.method === 'GET' && params.id && params.messages) {
    const conversation = await getConversationById(env, params.id)
    if (!conversation) return sendJson({ ok: false, error: 'conversation_not_found' }, 404)
    const messages = await listMessagesByConversation(env, params.id, { limit: url.searchParams.get('limit') || 100 })
    const [enriched] = await enrichConversationsWithShopDisplay(env, [conversation])
    return sendJson({ ok: true, conversation: enriched || conversation, messages })
  }
  if (request.method === 'POST' && params.id && params.read) {
    const conversation = await markConversationRead(env, params.id)
    if (!conversation) return sendJson({ ok: false, error: 'conversation_not_found' }, 404)
    const messages = await listMessagesByConversation(env, params.id, { limit: 20 })
    const lastReadMessage = [...messages].reverse().find(message => message.platform_message_id)
    let platform_read = { ok: false, skipped: true, reason: 'not_supported_channel' }
    if (String(conversation.channel || '').toLowerCase() === 'shopee') {
      platform_read = await markShopeeConversationRead(env, {
        conversation,
        last_read_message_id: lastReadMessage?.platform_message_id || ''
      })
    }
    const [enriched] = await enrichConversationsWithShopDisplay(env, [conversation])
    return sendJson({ ok: true, conversation: enriched || conversation, platform_read })
  }
  if (request.method !== 'GET') return null
  const conversations = await listConversations(env, {
    channel: url.searchParams.get('channel'),
    shop_id: url.searchParams.get('shop_id'),
    customer_id: url.searchParams.get('customer_id') || url.searchParams.get('buyer_id'),
    q: url.searchParams.get('q'),
    limit: url.searchParams.get('limit')
  })
  const enriched = await enrichConversationsWithShopDisplay(env, conversations)
  return sendJson({ ok: true, conversations: enriched })
}
