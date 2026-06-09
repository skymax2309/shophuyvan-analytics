import { listBrowserHelperPollTargets, pushBrowserHelperPayload } from '../core/browser-helper-core.js'
import { cleanText } from '../core/message-normalize.js'
import { broadcastToWebSocket } from '../realtime/ws-server.js'
import { sendJson } from './settings.js'

function tokenBytes(value = '') {
  return new TextEncoder().encode(cleanText(value))
}

function timingSafeEqualText(left = '', right = '') {
  const a = tokenBytes(left)
  const b = tokenBytes(right)
  const length = Math.max(a.length, b.length, 1)
  let diff = a.length ^ b.length
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0)
  }
  return diff === 0
}

function requireHelperToken(request, env) {
  const configured = cleanText(env?.BROWSER_HELPER_SECRET)
  const received = cleanText(request.headers.get('X-Helper-Token'))
  if (configured.length < 32) {
    return { ok: false, status: 503, error_code: 'browser_helper_secret_not_configured', error_message: 'BROWSER_HELPER_SECRET phải có tối thiểu 32 ký tự.' }
  }
  if (!received || !timingSafeEqualText(received, configured)) {
    return { ok: false, status: 401, error_code: 'browser_helper_auth_failed', error_message: 'Token browser helper không hợp lệ.' }
  }
  return { ok: true }
}

export async function handleBrowserHelperRoute(request, env) {
  const auth = requireHelperToken(request, env)
  if (!auth.ok) return sendJson({ ok: false, error_code: auth.error_code, error_message: auth.error_message }, auth.status)

  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname.endsWith('/poll')) {
    const targets = await listBrowserHelperPollTargets(env, {
      shop_id: url.searchParams.get('shop_id'),
      channel: url.searchParams.get('channel')
    })
    return sendJson({ ok: true, conversations: targets, count: targets.length })
  }

  if (request.method !== 'POST' || !url.pathname.endsWith('/push')) {
    return sendJson({ ok: false, error_code: 'method_not_allowed', error_message: 'Browser helper chỉ hỗ trợ GET poll hoặc POST push.' }, 405)
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return sendJson({ ok: false, error_code: 'invalid_json', error_message: 'Payload browser helper không phải JSON hợp lệ.' }, 400)
  }
  const result = await pushBrowserHelperPayload(env, body, { source: 'browser_helper' })
  if (!result.ok) {
    return sendJson({
      ok: false,
      error_code: result.error_code || 'browser_helper_push_failed',
      error_message: result.error_message || 'Không ghi được dữ liệu browser helper.'
    }, result.status || 400)
  }
  for (const message of result.new_messages || []) {
    await broadcastToWebSocket(env, message)
  }
  return sendJson({
    ok: true,
    saved_messages: result.saved_messages,
    skipped_duplicates: result.skipped_duplicates,
    conversations_touched: result.conversations_touched,
    pulled_messages: result.pulled_messages
  })
}
