import { cleanText, nowIso, safeJsonParse } from './message-normalize.js'
import { ensureChatCoreTables } from './conversation-core.js'

const PUSH_TIMEOUT_MS = 10000

function memoryStore(env) {
  if (!env.__CHAT_PUSH_MEMORY) env.__CHAT_PUSH_MEMORY = { subscriptions: [], dedupe: new Set() }
  return env.__CHAT_PUSH_MEMORY
}

function base64UrlToBytes(value) {
  const clean = cleanText(value).replace(/-/g, '+').replace(/_/g, '/')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cleanText(value)))
  return bytesToBase64Url(new Uint8Array(digest)).slice(0, 32)
}

async function ensurePushTables(env) {
  await ensureChatCoreTables(env)
  if (!env?.DB) return { mode: 'memory' }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_push_subscriptions (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT DEFAULT '',
      auth TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      last_error TEXT DEFAULT '',
      last_sent_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    )
  `).run()
  await ensurePushColumn(env, 'retry_count', 'INTEGER DEFAULT 0')
  await ensurePushColumn(env, 'last_retry_at', "TEXT DEFAULT ''")
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_push_dedupe (
      dedupe_key TEXT PRIMARY KEY,
      created_at TEXT DEFAULT ''
    )
  `).run()
  return { mode: 'd1' }
}

async function ensurePushColumn(env, columnName, definition) {
  try {
    const tableInfo = await env.DB.prepare('PRAGMA table_info(chat_push_subscriptions)').all()
    const exists = (tableInfo.results || []).some(row => row.name === columnName)
    if (!exists) await env.DB.prepare(`ALTER TABLE chat_push_subscriptions ADD COLUMN ${columnName} ${definition}`).run()
  } catch (error) {
    if (!/duplicate column name/i.test(String(error?.message || error))) throw error
  }
}

function normalizeSubscription(input = {}) {
  const subscription = input.subscription && typeof input.subscription === 'object' ? input.subscription : input
  const keys = subscription.keys || {}
  return {
    endpoint: cleanText(subscription.endpoint),
    p256dh: cleanText(keys.p256dh || subscription.p256dh),
    auth: cleanText(keys.auth || subscription.auth)
  }
}

export function vapidPublicKey(env) {
  return cleanText(env?.CHAT_VAPID_PUBLIC_KEY)
}

export async function savePushSubscription(env, body = {}, meta = {}) {
  await ensurePushTables(env)
  const sub = normalizeSubscription(body)
  if (!sub.endpoint) return { ok: false, error_code: 'missing_subscription_endpoint', error_message: 'Thiếu endpoint thông báo của trình duyệt.' }
  if (!sub.p256dh || !sub.auth) {
    return { ok: false, error_code: 'missing_push_keys', error_message: 'Thiet bi chua tra khoa push day du nen khong dang ky thong bao nen duoc.' }
  }
  const stamp = nowIso()
  const id = await shortHash(sub.endpoint)
  if (!env?.DB) {
    const store = memoryStore(env)
    const row = { id, ...sub, user_agent: cleanText(meta.user_agent), enabled: 1, last_error: '', retry_count: 0, last_retry_at: '', updated_at: stamp, created_at: stamp }
    const index = store.subscriptions.findIndex(item => item.endpoint === sub.endpoint)
    if (index >= 0) store.subscriptions[index] = { ...store.subscriptions[index], ...row, created_at: store.subscriptions[index].created_at || stamp }
    else store.subscriptions.push(row)
    return { ok: true, subscription_id: id, mode: 'memory' }
  }
  await env.DB.prepare(`
    INSERT INTO chat_push_subscriptions
      (id, endpoint, p256dh, auth, user_agent, enabled, last_error, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, 1, '', ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      enabled = 1,
      last_error = '',
      updated_at = excluded.updated_at
  `).bind(id, sub.endpoint, sub.p256dh, sub.auth, cleanText(meta.user_agent).slice(0, 300), stamp, stamp).run()
  return { ok: true, subscription_id: id, mode: 'd1' }
}

export async function disablePushSubscription(env, body = {}) {
  await ensurePushTables(env)
  const sub = normalizeSubscription(body)
  if (!sub.endpoint) return { ok: true, disabled: 0 }
  if (!env?.DB) {
    const store = memoryStore(env)
    for (const item of store.subscriptions) if (item.endpoint === sub.endpoint) item.enabled = 0
    return { ok: true, disabled: 1 }
  }
  const result = await env.DB.prepare(`
    UPDATE chat_push_subscriptions
    SET enabled = 0, updated_at = ?
    WHERE endpoint = ?
  `).bind(nowIso(), sub.endpoint).run()
  return { ok: true, disabled: Number(result?.meta?.changes || 0) || 0 }
}

async function signVapidJwt(env, endpoint) {
  const publicKey = vapidPublicKey(env)
  const privateKey = cleanText(env?.CHAT_VAPID_PRIVATE_KEY)
  if (!publicKey || !privateKey) return null
  const publicBytes = base64UrlToBytes(publicKey)
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) return null
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
    d: privateKey,
    ext: true
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const aud = new URL(endpoint).origin
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: cleanText(env?.CHAT_VAPID_SUBJECT) || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev'
  })))
  const unsigned = `${header}.${payload}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  return { publicKey, token: `${unsigned}.${bytesToBase64Url(signature)}` }
}

async function updatePushResult(env, row, result = {}) {
  if (!env?.DB || !cleanText(row?.id)) return
  const stamp = nowIso()
  if (result.dead) {
    await env.DB.prepare('UPDATE chat_push_subscriptions SET enabled = 0, last_error = ?, retry_count = ?, last_retry_at = ?, updated_at = ? WHERE id = ?')
      .bind(result.error || 'endpoint_dead', Number(result.retry_count || 0), stamp, stamp, row.id).run()
  } else if (result.ok) {
    await env.DB.prepare('UPDATE chat_push_subscriptions SET last_error = \'\', retry_count = 0, last_retry_at = \'\', last_sent_at = ?, updated_at = ? WHERE id = ?')
      .bind(stamp, stamp, row.id).run()
  } else {
    await env.DB.prepare('UPDATE chat_push_subscriptions SET last_error = ?, retry_count = ?, last_retry_at = ?, updated_at = ? WHERE id = ?')
      .bind(result.error || 'push_failed', Number(result.retry_count || 0), stamp, stamp, row.id).run()
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('push_timeout'), PUSH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function postWebPush(endpoint, vapid) {
  const headers = {
    TTL: '180',
    Urgency: 'high',
    Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`
  }
  return fetchWithTimeout(endpoint, { method: 'POST', headers })
    .catch(error => ({ ok: false, status: 0, text: async () => String(error?.message || error) }))
}

function textBytes(value) {
  return new TextEncoder().encode(String(value ?? ''))
}

function concatBytes(...chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function uint32Be(value) {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, Number(value) || 0, false)
  return bytes
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes))
}

function defaultTestPushPayload() {
  return {
    type: 'chat',
    title: 'Shopee · Khách thử thông báo',
    body: 'Tin nhắn test: shop kiểm tra thông báo đã hiện đủ nội dung.',
    channel: 'shopee',
    channel_label: 'Shopee',
    sender_name: 'Khách thử thông báo',
    message_text: 'Tin nhắn test: shop kiểm tra thông báo đã hiện đủ nội dung.',
    url: '/pages/chat-cskh.html'
  }
}

export async function encryptWebPushPayload(subscription = {}, payload = {}) {
  const sub = normalizeSubscription(subscription)
  const userPublicKey = base64UrlToBytes(sub.p256dh)
  const authSecret = base64UrlToBytes(sub.auth)
  if (userPublicKey.length !== 65 || !authSecret.length) return null

  const payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload || {})
  const payloadBytes = textBytes(payloadText).slice(0, 3072)
  const appServerKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const importedUserKey = await crypto.subtle.importKey('raw', userPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  const appServerPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', appServerKeys.publicKey))
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: importedUserKey }, appServerKeys.privateKey, 256))

  const prkKey = await hmacSha256(authSecret, sharedSecret)
  const ikm = await hmacSha256(prkKey, concatBytes(textBytes('WebPush: info\0'), userPublicKey, appServerPublicKey, new Uint8Array([1])))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmacSha256(salt, ikm)
  const cek = (await hmacSha256(prk, textBytes('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16)
  const nonce = (await hmacSha256(prk, textBytes('Content-Encoding: nonce\0\x01'))).slice(0, 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const recordSize = 4096
  const plaintext = concatBytes(payloadBytes, new Uint8Array([2]))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext))

  return {
    body: concatBytes(salt, uint32Be(recordSize), new Uint8Array([appServerPublicKey.length]), appServerPublicKey, ciphertext),
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream'
    }
  }
}

export function normalizePushPayload(payload = {}) {
  const raw = payload && typeof payload === 'object' ? payload : {}
  const nested = raw.data && typeof raw.data === 'object' ? raw.data : {}
  const type = cleanText(raw.type || nested.type || 'chat') || 'chat'
  const isOrder = type === 'order'
  const channel = cleanText(raw.channel || nested.channel || (isOrder ? 'oms' : 'chat'))
  const channelLabelText = cleanText(raw.channel_label || nested.channel_label || (isOrder ? 'OMS' : channelLabel(channel)))
  const senderName = cleanText(raw.sender_name || nested.sender_name || raw.customer_name || nested.customer_name)
  const conversationId = cleanText(raw.conversation_id || nested.conversation_id)
  const id = cleanText(raw.id || nested.id)
  const orderId = cleanText(raw.order_id || nested.order_id)
  const orderIds = [...new Set([
    ...((Array.isArray(raw.order_ids) ? raw.order_ids : []).map(cleanText)),
    ...((Array.isArray(nested.order_ids) ? nested.order_ids : []).map(cleanText)),
    orderId
  ].filter(Boolean))].slice(0, 20)
  const body = cleanText(raw.body || nested.body || raw.message_text || nested.message_text || (isOrder
    ? 'Co don hang can xu ly.'
    : 'Ban co tin nhan moi tu khach hang.'))
  const url = cleanText(raw.url || nested.url || (isOrder
    ? '/pages/oms-dashboard.html'
    : (conversationId ? `/pages/chat-cskh.html?conversation_id=${encodeURIComponent(conversationId)}` : '/pages/chat-cskh.html')))
  const title = cleanText(raw.title || nested.title || (isOrder
    ? `OMS · ${orderId || 'Cap nhat don hang'}`
    : `${channelLabelText || 'Chat'}${senderName ? ` · ${senderName}` : ''}`))
  const tag = cleanText(raw.tag || nested.tag || `${type}-${orderId || conversationId || id || Date.now()}`)
  return {
    type,
    title,
    body,
    channel,
    channel_label: channelLabelText,
    sender_name: senderName,
    message_text: cleanText(raw.message_text || nested.message_text || body),
    conversation_id: conversationId,
    id,
    order_id: orderId,
    order_ids: orderIds,
    url,
    tag,
    data: {
      type,
      url,
      channel,
      channel_label: channelLabelText,
      sender_name: senderName,
      message_text: cleanText(raw.message_text || nested.message_text || body),
      conversation_id: conversationId,
      id,
      order_id: orderId,
      order_ids: orderIds
    }
  }
}

async function postWebPushPayload(endpoint, vapid, subscription = {}, payload = null) {
  let encrypted = null
  const normalizedPayload = payload ? normalizePushPayload(payload) : null
  if (normalizedPayload) encrypted = await encryptWebPushPayload(subscription, normalizedPayload)
  if (payload && !encrypted) {
    return { ok: false, status: 0, text: async () => 'missing_push_keys' }
  }
  const headers = {
    TTL: '180',
    Urgency: 'high',
    Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`,
    ...(encrypted?.headers || {})
  }
  return fetchWithTimeout(endpoint, { method: 'POST', headers, body: encrypted?.body })
    .catch(error => ({ ok: false, status: 0, text: async () => String(error?.message || error) }))
}

export async function sendWebPushPing(env, subscription = {}, payload = defaultTestPushPayload()) {
  const endpoint = cleanText(subscription.endpoint)
  if (!endpoint) return { ok: false, error: 'missing_endpoint' }
  const vapid = await signVapidJwt(env, endpoint)
  if (!vapid) return { ok: false, error: 'missing_vapid' }
  let response = null
  let errorText = ''
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await postWebPushPayload(endpoint, vapid, subscription, payload)
    if (response.ok) break
    errorText = cleanText(await response.text().catch(() => '')).slice(0, 240)
    if (attempt < 3) await sleep(attempt === 1 ? 5000 : 10000)
  }
  const status = Number(response?.status || 0)
  const dead = (status === 404 || status === 410) && response?.ok !== true
  const retryCount = response?.ok ? 0 : 3
  const result = {
    ok: response?.ok === true,
    status,
    dead,
    retry_count: retryCount,
    error: response?.ok ? '' : `push_${status}: ${errorText}`
  }
  await updatePushResult(env, subscription, result)
  return result
}

async function listEnabledSubscriptions(env, limit = 200) {
  await ensurePushTables(env)
  if (!env?.DB) return memoryStore(env).subscriptions.filter(item => item.enabled).slice(0, limit)
  const result = await env.DB.prepare(`
    SELECT id, endpoint, p256dh, auth
    FROM chat_push_subscriptions
    WHERE enabled = 1
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).bind(Math.min(Math.max(Number(limit) || 200, 1), 500)).all()
  return result.results || []
}

async function reserveDedupe(env, key) {
  const clean = cleanText(key).slice(0, 500)
  if (!clean) return false
  await ensurePushTables(env)
  if (!env?.DB) {
    const store = memoryStore(env)
    if (store.dedupe.has(clean)) return false
    store.dedupe.add(clean)
    return true
  }
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_push_dedupe (dedupe_key, created_at)
    VALUES (?, ?)
  `).bind(clean, nowIso()).run()
  return Number(result?.meta?.changes || 0) > 0
}

export async function sendPushToEnabledSubscribers(env, options = {}) {
  const rows = await listEnabledSubscriptions(env, options.limit || 200)
  const payload = normalizePushPayload(options.payload || defaultTestPushPayload())
  let sent = 0
  let failed = 0
  const outcomes = await Promise.allSettled(rows.map(row => sendWebPushPing(env, row, payload)))
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled' && outcome.value?.ok) sent += 1
    else failed += 1
  }
  return { ok: true, sent, failed, total: rows.length }
}

function channelLabel(channel) {
  const key = cleanText(channel).toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  if (key === 'zalo') return 'Zalo'
  if (key === 'facebook') return 'Facebook'
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Chat'
}

function clipText(value, limit = 180) {
  const text = cleanText(value).replace(/\s+/g, ' ')
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`
}

export function buildChatPushPayload(messages = []) {
  const rows = (Array.isArray(messages) ? messages : [messages]).filter(Boolean)
  const message = rows[rows.length - 1] || {}
  const label = channelLabel(message.channel)
  const senderName = cleanText(message.sender_name || message.customer_name || message.customer_id) || 'Khách hàng'
  const messageText = clipText(message.text || message.content || message.message || message.last_message_text || 'Khách vừa gửi tin nhắn mới.')
  const conversationId = cleanText(message.conversation_id)
  const url = conversationId
    ? `/pages/chat-cskh.html?conversation_id=${encodeURIComponent(conversationId)}`
    : '/pages/chat-cskh.html'
  return {
    type: 'chat',
    title: `${label} · ${senderName}`,
    body: messageText,
    channel: cleanText(message.channel),
    channel_label: label,
    sender_name: senderName,
    message_text: messageText,
    conversation_id: conversationId,
    id: cleanText(message.id),
    url,
    tag: `chat-${cleanText(message.channel) || 'channel'}-${conversationId || cleanText(message.id) || Date.now()}`
  }
}

export async function notifyNewChatMessages(env, messages = []) {
  const rows = (Array.isArray(messages) ? messages : [messages]).filter(item => item?.sender_type === 'customer')
  if (!rows.length) return { ok: true, skipped: true, reason: 'no_customer_message' }
  const key = rows.map(item => item.platform_message_id || item.id || `${item.conversation_id}:${item.created_at}`).filter(Boolean).join('|')
  if (!(await reserveDedupe(env, `chat:${key}`))) return { ok: true, skipped: true, reason: 'duplicate_push' }
  return sendPushToEnabledSubscribers(env, { payload: buildChatPushPayload(rows) })
}

export async function notificationStatus(env) {
  await ensurePushTables(env)
  if (!env?.DB) {
    return { ok: true, vapid_public_key: vapidPublicKey(env), subscriptions: memoryStore(env).subscriptions.filter(item => item.enabled).length }
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS total FROM chat_push_subscriptions WHERE enabled = 1').first()
  return { ok: true, vapid_public_key: vapidPublicKey(env), subscriptions: Number(row?.total || 0) || 0 }
}

export function parseSubscriptionPayload(body = {}) {
  return normalizeSubscription(safeJsonParse(JSON.stringify(body), {}))
}
