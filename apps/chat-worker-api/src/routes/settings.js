import { getChatSettings, saveChatSettings } from '../core/conversation-core.js'
import { listAdapterCapabilities } from '../core/send-core.js'
import { DEFAULT_AI_SETTINGS, publicChatSettings } from '../core/ai-settings-defaults.js'
import { buildKnowledgeJsonl, listKnowledgeEntries } from '../core/ai-knowledge-core.js'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Helper-Token, X-Shopee-Signature, X-Lazada-Hmac-Sha256',
  'Cache-Control': 'no-store'
}

export function sendJson(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      ...CORS_HEADERS,
      ...headers
    }
  })
}

async function countTable(env, tableName) {
  if (!env?.DB) return 0
  try {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${tableName}`).first()
    return Number(row?.total || 0)
  } catch {
    return 0
  }
}

async function listSyncStates(env) {
  if (!env?.DB) return []
  try {
    const result = await env.DB.prepare('SELECT * FROM chat_sync_state ORDER BY updated_at DESC LIMIT 20').all()
    return result.results || []
  } catch {
    return []
  }
}

// Tổng hợp số liệu vận hành cho trang Cài đặt Chat.
async function settingsStats(env) {
  const knowledge = await listKnowledgeEntries(env, { include_disabled: true, limit: 10000 }).catch(() => [])
  const activeKnowledge = knowledge.filter(item => item.status !== 'disabled').length
  const disabledKnowledge = knowledge.filter(item => item.status === 'disabled').length
  return {
    ok: true,
    conversations_total: await countTable(env, 'chat_conversations'),
    messages_total: await countTable(env, 'chat_messages'),
    ai_suggestions_total: await countTable(env, 'ai_suggestions'),
    knowledge_entries: knowledge.length ? activeKnowledge : await countTable(env, 'ai_knowledge_base'),
    knowledge_entries_active: activeKnowledge,
    knowledge_entries_disabled: disabledKnowledge,
    push_subscriptions_active: env?.DB ? await countTable(env, 'chat_push_subscriptions WHERE enabled = 1') : 0,
    sync_states: await listSyncStates(env)
  }
}

// Dọn dữ liệu phụ trợ cũ, không đụng conversation/message chính.
async function cleanupSettingsData(env) {
  if (!env?.DB) return { ok: true, deleted_push_subscriptions: 0, deleted_dedupe: 0 }
  let pushDeleted = 0
  let dedupeDeleted = 0
  try {
    const push = await env.DB.prepare('DELETE FROM chat_push_subscriptions WHERE enabled = 0').run()
    pushDeleted = Number(push.meta?.changes || 0)
  } catch {}
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600000).toISOString()
    const dedupe = await env.DB.prepare('DELETE FROM chat_push_dedupe WHERE created_at < ?').bind(cutoff).run()
    dedupeDeleted = Number(dedupe.meta?.changes || 0)
  } catch {}
  return { ok: true, deleted_push_subscriptions: pushDeleted, deleted_dedupe: dedupeDeleted }
}

// Xuất knowledge base hiện tại lên R2 để AI có lịch sử học an toàn.
async function exportKnowledge(env) {
  if (!env?.CHAT_FILES) return { ok: false, error: 'r2_not_configured' }
  const date = new Date().toISOString().slice(0, 10)
  const key = `ai-exports/knowledge-${date}.jsonl`
  const body = await buildKnowledgeJsonl(env)
  await env.CHAT_FILES.put(key, body, {
    httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' },
    customMetadata: { expires_at: String(Date.now() + 180 * 24 * 3600000) }
  })
  return { ok: true, key, bytes: body.length }
}

export async function handleSettingsRoute(request, env, params = {}) {
  if (params.stats && request.method === 'GET') return sendJson(await settingsStats(env))
  if (params.reset && request.method === 'POST') {
    const body = await request.json().catch(() => ({}))
    if (body.confirm !== 'XAC NHAN') return sendJson({ ok: false, error: 'confirm_required' }, 400)
    return sendJson({ ok: true, settings: publicChatSettings(await saveChatSettings(env, DEFAULT_AI_SETTINGS)) })
  }
  if (params.cleanup && request.method === 'POST') return sendJson(await cleanupSettingsData(env))
  if (params.export && request.method === 'POST') return sendJson(await exportKnowledge(env))
  if (request.method === 'GET') {
    return sendJson({
      ok: true,
      settings: publicChatSettings(await getChatSettings(env)),
      capabilities: listAdapterCapabilities(env)
    })
  }
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}))
    return sendJson({ ok: true, settings: publicChatSettings(await saveChatSettings(env, body.settings || body)) })
  }
  return null
}
