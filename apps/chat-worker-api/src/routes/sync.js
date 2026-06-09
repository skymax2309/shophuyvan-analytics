import { syncChatChannel } from '../core/sync-core.js'
import { sendJson } from './settings.js'

const BUSINESS_SYNC_STATES = new Set([
  'manual_required',
  'manual_pending',
  'manual_import_required',
  'browser_helper_required',
  'queued_for_browser_helper',
  'shop_api_not_configured'
])

function syncHttpStatus(result = {}) {
  if (result.ok) return 200
  const code = String(result.status || result.error_code || result.last_error_code || '').toLowerCase()
  if (BUSINESS_SYNC_STATES.has(code)) return 200
  if (code.includes('permission') || code.includes('token')) return 403
  if (code.includes('not_configured') || code.includes('not_implemented')) return 409
  return 502
}

export async function handleSyncRoute(request, env) {
  if (request.method !== 'POST') return null
  const body = await request.json().catch(() => ({}))
  const result = await syncChatChannel(env, body)
  return sendJson(result, syncHttpStatus(result))
}
