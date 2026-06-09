import { ensureChatCoreTables } from './core/conversation-core.js'
import { CORS_HEADERS, sendJson, handleSettingsRoute } from './routes/settings.js'
import { handleConversationsRoute } from './routes/conversations.js'
import { handleMessagesRoute } from './routes/messages.js'
import { handleSendRoute } from './routes/send.js'
import { handleSyncRoute } from './routes/sync.js'
import { handleAiRoute } from './routes/ai.js'
import { handleAttachmentsRoute } from './routes/attachments.js'
import { handleProductCardsRoute } from './routes/product-cards.js'
import { handleOrderCardsRoute } from './routes/order-cards.js'
import { handleBrowserHelperRoute } from './routes/browser-helper.js'
import { handleWebhookIngestRoute } from './routes/webhook-ingest.js'
import { handleNotificationsRoute } from './routes/notifications.js'
import { handleCustomerContactsRoute } from './routes/customer-contacts.js'
import { scheduledSync } from './core/sync-core.js'
import { ChatRealtimeRoom, handleRealtimeConnectRoute } from './realtime/ws-server.js'

function routeParams(pathname) {
  const match = pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/messages$/)
  if (match) return { id: decodeURIComponent(match[1]), messages: true }
  const readMatch = pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/read$/)
  if (readMatch) return { id: decodeURIComponent(readMatch[1]), read: true }
  const diagnosticMatch = pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/sync-diagnostic$/)
  if (diagnosticMatch) return { id: decodeURIComponent(diagnosticMatch[1]), sync_diagnostic: true }
  const webhookMatch = pathname.match(/^\/api\/chat\/webhook\/([^/]+)$/)
  if (webhookMatch) return { webhook_channel: decodeURIComponent(webhookMatch[1]) }
  if (pathname === '/api/chat/settings/stats') return { settings_stats: true }
  if (pathname === '/api/chat/settings/reset') return { settings_reset: true }
  if (pathname === '/api/chat/settings/cleanup') return { settings_cleanup: true }
  if (pathname === '/api/chat/settings/export') return { settings_export: true }
  if (pathname === '/api/chat/ai/status') return { ai_status: true }
  if (pathname === '/api/chat/ai/knowledge') return { ai_knowledge: true }
  const knowledgeMatch = pathname.match(/^\/api\/chat\/ai\/knowledge\/([^/]+)$/)
  if (knowledgeMatch) return { ai_knowledge: true, id: decodeURIComponent(knowledgeMatch[1]) }
  if (pathname === '/api/chat/ai/learning-audit') return { ai_learning_audit: true }
  if (pathname === '/api/chat/ai/approve') return { ai_approve: true }
  if (pathname === '/api/chat/ai/reject') return { ai_reject: true }
  if (pathname === '/api/chat/ai/test') return { ai_test: true }
  if (pathname === '/api/chat/policy/check') return { policy_check: true }
  if (pathname === '/api/chat/notifications/status') return { notifications_status: true }
  if (pathname === '/api/chat/notifications/subscribe') return { notifications_subscribe: true }
  if (pathname === '/api/chat/notifications/unsubscribe') return { notifications_unsubscribe: true }
  if (pathname === '/api/chat/notifications/test') return { notifications_test: true }
  if (pathname === '/api/chat/customer-contacts/backfill') return { customer_contacts_backfill: true }
  return {}
}

async function dispatch(request, env, ctx) {
  const url = new URL(request.url)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  const params = routeParams(pathname)

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (pathname === '/health' || pathname === '/api/chat/health') {
    await ensureChatCoreTables(env)
    return sendJson({ ok: true, service: 'shophuyvan-chat-api', mode: env?.DB ? 'd1' : 'memory' })
  }
  if (pathname === '/api/chat/settings' || params.settings_stats || params.settings_reset || params.settings_cleanup || params.settings_export) {
    return handleSettingsRoute(request, env, {
      stats: params.settings_stats,
      reset: params.settings_reset,
      cleanup: params.settings_cleanup,
      export: params.settings_export
    })
  }
  if (pathname === '/api/chat/conversations' || params.messages || params.read || params.sync_diagnostic) return handleConversationsRoute(request, env, params)
  if (pathname === '/api/chat/messages') return handleMessagesRoute(request, env)
  if (pathname === '/api/chat/messages/send') return handleSendRoute(request, env)
  if (pathname === '/api/chat/product-cards/send') return handleProductCardsRoute(request, env)
  if (pathname === '/api/chat/order-cards/send') return handleOrderCardsRoute(request, env)
  if (pathname === '/api/chat/sync') return handleSyncRoute(request, env)
  if (params.webhook_channel) return handleWebhookIngestRoute(request, env, ctx, params.webhook_channel)
  if (pathname === '/api/chat/browser-helper/push' || pathname === '/api/chat/browser-helper/poll') return handleBrowserHelperRoute(request, env)
  if (params.notifications_status || params.notifications_subscribe || params.notifications_unsubscribe || params.notifications_test) return handleNotificationsRoute(request, env, {
    status: params.notifications_status,
    subscribe: params.notifications_subscribe,
    unsubscribe: params.notifications_unsubscribe,
    test: params.notifications_test
  })
  if (params.customer_contacts_backfill) return handleCustomerContactsRoute(request, env)
  if (pathname === '/api/chat/realtime/connect') return handleRealtimeConnectRoute(request, env)
  if (pathname === '/api/chat/ai/suggest' || params.ai_test || params.ai_status || params.ai_knowledge || params.ai_learning_audit || params.ai_approve || params.ai_reject || params.policy_check) {
    return handleAiRoute(request, env, {
      test: params.ai_test,
      status: params.ai_status,
      knowledge: params.ai_knowledge,
      learning_audit: params.ai_learning_audit,
      approve: params.ai_approve,
      reject: params.ai_reject,
      policy_check: params.policy_check,
      id: params.id
    })
  }
  if (pathname === '/api/chat/attachments') return handleAttachmentsRoute(request, env)

  return sendJson({ ok: false, error: 'not_found', path: pathname }, 404)
}

export default {
  async fetch(request, env = {}, ctx = {}) {
    try {
      return await dispatch(request, env, ctx)
    } catch (error) {
      return sendJson({
        ok: false,
        error: 'chat_worker_error',
        message: String(error?.message || error || 'unknown_error')
      }, 500)
    }
  },
  scheduled(event, env, ctx) {
    ctx.waitUntil(scheduledSync(env, event))
  }
}

export { ChatRealtimeRoom }
