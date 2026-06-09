import { evaluateOutboundMessagePolicy, getAiStatus, suggestChatReply, testGeminiConnection } from '../core/ai-policy-core.js'
import {
  approveAiSuggestion,
  deleteKnowledgeEntry,
  listKnowledgeEntries,
  listLearningAuditLogs,
  rejectAiSuggestion,
  saveKnowledgeEntry,
  updateKnowledgeEntry
} from '../core/ai-knowledge-core.js'
import { sendJson } from './settings.js'

export async function handleAiRoute(request, env, params = {}) {
  if (params.status && request.method === 'GET') return sendJson(await getAiStatus(env))
  if (params.learning_audit && request.method === 'GET') {
    const url = new URL(request.url)
    const entries = await listLearningAuditLogs(env, {
      channel: url.searchParams.get('channel') || '',
      shop_id: url.searchParams.get('shop_id') || '',
      limit: url.searchParams.get('limit') || 50
    })
    return sendJson({ ok: true, entries })
  }
  if (params.knowledge && request.method === 'GET') {
    const url = new URL(request.url)
    const entries = await listKnowledgeEntries(env, {
      channel: url.searchParams.get('channel') || '',
      shop_id: url.searchParams.get('shop_id') || '',
      status: url.searchParams.get('status') || '',
      search: url.searchParams.get('search') || '',
      include_disabled: url.searchParams.get('include_disabled') || '',
      limit: url.searchParams.get('limit') || 50
    })
    return sendJson({ ok: true, entries })
  }
  if (params.knowledge && params.id && request.method === 'DELETE') {
    const result = await deleteKnowledgeEntry(env, params.id, 'operator')
    return sendJson(result, result.ok ? 200 : 400)
  }
  if (params.knowledge && params.id && request.method === 'PATCH') {
    const body = await request.json().catch(() => ({}))
    const result = await updateKnowledgeEntry(env, params.id, body.entry || body)
    return sendJson(result, result.ok ? 200 : 400)
  }
  if (request.method !== 'POST') return null
  const body = await request.json().catch(() => ({}))
  if (params.policy_check) {
    const policy = await evaluateOutboundMessagePolicy(env, body.text || body.content || body.message || '', {
      ...(body.settings || {}),
      channel: body.channel || body.settings?.channel || ''
    })
    return sendJson({
      ...policy,
      ok: true,
      allowed: policy.ok !== false
    })
  }
  if (params.knowledge) {
    const result = await saveKnowledgeEntry(env, body.entry || body)
    return sendJson(result, result.ok ? 200 : 400)
  }
  if (params.approve) {
    const result = await approveAiSuggestion(env, body)
    return sendJson(result, result.ok ? 200 : 400)
  }
  if (params.reject) {
    const result = await rejectAiSuggestion(env, body)
    return sendJson(result, result.ok ? 200 : 400)
  }
  if (params.test) {
    const result = await testGeminiConnection(env, body)
    return sendJson(result, result.ok ? 200 : 409)
  }
  const result = await suggestChatReply(env, body)
  return sendJson(result)
}
