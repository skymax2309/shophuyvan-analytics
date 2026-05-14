// NEO: Backend worker chat sàn - nhóm api-sync-webpush. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function syncChatApi(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const url = new URL(request.url)
  let platform = cleanText(body.platform || url.searchParams.get('platform')).toLowerCase()
  let shopFilter = cleanText(body.shop || url.searchParams.get('shop'))
  const diagnostic = body.diagnostic === true || url.searchParams.get('diagnostic') === '1'
  const limit = Math.min(Math.max(Number(body.limit || url.searchParams.get('limit') || 50) || 50, 1), 100)
  const activeOnly = body.active_only === true || url.searchParams.get('active_only') === '1'
  const activeConversationId = cleanText(body.conversation_id || url.searchParams.get('conversation_id'))

  if (activeOnly && activeConversationId && (!platform || !shopFilter)) {
    const row = await env.DB.prepare(`
      SELECT platform, shop, shop_id, buyer_id, buyer_name
      FROM marketplace_chat_conversations
      WHERE conversation_id = ?
      ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
      LIMIT 1
    `).bind(activeConversationId).first().catch(() => null)
    platform = platform || cleanText(row?.platform).toLowerCase()
    shopFilter = shopFilter || cleanText(row?.shop_id || row?.shop)
    body.buyer_id = body.buyer_id || cleanText(row?.buyer_id)
    body.buyer_name = body.buyer_name || cleanText(row?.buyer_name)
  }

  const where = ["((platform = 'shopee' AND access_token IS NOT NULL AND access_token != '') OR (platform = 'lazada' AND ((access_token IS NOT NULL AND access_token != '') OR (chat_access_token IS NOT NULL AND chat_access_token != ''))))"]
  const params = []
  if (platform) {
    where.push('platform = ?')
    params.push(platform)
  } else {
    where.push("platform IN ('shopee', 'lazada')")
  }
  if (shopFilter) {
    where.push('(shop_name = ? OR user_name = ? OR api_shop_id = ?)')
    params.push(shopFilter, shopFilter, shopFilter)
  }
  const { results: shops } = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id,
           access_token, token_expire_at,
           chat_access_token, chat_refresh_token, chat_token_expire_at,
           chat_api_connected_at, chat_api_refresh_expire_at, chat_api_redirect_url,
           api_partner_id, api_partner_key, api_redirect_url
    FROM shops
    WHERE ${where.join(' AND ')}
    ORDER BY platform, shop_name
    LIMIT 20
  `).bind(...params).all()

  const apiShops = dedupeApiShopRows(shops || [])
  const results = []
  for (const shop of apiShops) {
    const transport = resolveChatTransportForShop(shop)
    if (transport.transport !== CHAT_TRANSPORT_API) {
      results.push({
        platform: shop.platform,
        shop: shop.shop_name || shop.user_name || shop.api_shop_id,
        status: 'skipped',
        transport: transport.transport,
        reason: transport.note
      })
      continue
    }
    if (shop.platform === 'shopee') {
      results.push(await syncShopeeChatShop(env, shop, {
        limit,
        diagnostic,
        conversation_id: activeConversationId,
        active_only: activeOnly,
        buyer_id: body.buyer_id,
        buyer_name: body.buyer_name
      }).catch(error => ({
        platform: 'shopee',
        shop: shop.shop_name,
        status: 'error',
        reason: error.message,
        pulled_messages: 0
      })))
    } else if (shop.platform === 'lazada') {
      results.push(await syncLazadaChatShop(env, {
        ...shop,
        access_token: shop.access_token || shop.chat_access_token
      }, {
        limit,
        diagnostic,
        conversation_id: activeConversationId,
        active_only: activeOnly
      }).catch(error => ({
        platform: 'lazada',
        shop: shop.shop_name,
        status: 'error',
        reason: error.message,
        pulled_messages: 0
      })))
    } else {
      results.push({
        platform: shop.platform,
        shop: shop.shop_name || shop.user_name || shop.api_shop_id,
        status: 'unsupported',
        reason: 'Sàn này có token API nhưng OMS chưa có endpoint chat chính thức để kéo nội dung.'
      })
    }
  }

  return json({
    status: 'ok',
    results,
    pulled_messages: results.reduce((sum, item) => sum + Number(item.pulled_messages || 0), 0),
    note: 'Webhook test CHAT_TEST đã được ẩn khỏi danh sách mặc định. Chỉ hội thoại thật có nội dung hoặc API sync thành công mới hiện lên.'
  }, cors)
}

function base64UrlToBytes(value) {
  const clean = cleanText(value).replace(/-/g, '+').replace(/_/g, '/')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function signVapidJwt(env, endpoint) {
  const publicKey = cleanText(env.CHAT_VAPID_PUBLIC_KEY)
  const privateKey = cleanText(env.CHAT_VAPID_PRIVATE_KEY)
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
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const aud = new URL(endpoint).origin
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: cleanText(env.CHAT_VAPID_SUBJECT) || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev'
  })))
  const unsigned = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  )
  return {
    publicKey,
    token: `${unsigned}.${bytesToBase64Url(signature)}`
  }
}

async function sendWebPushPing(env, subscription) {
  const endpoint = cleanText(subscription.endpoint)
  if (!endpoint) return { ok: false, status: 0, error: 'missing_endpoint' }
  const vapid = await signVapidJwt(env, endpoint)
  if (!vapid) return { ok: false, status: 0, error: 'missing_vapid' }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: '180',
      Urgency: 'high',
      Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`
    }
  })
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare(`
      UPDATE marketplace_push_subscriptions
      SET enabled = 0, last_error = ?, updated_at = datetime('now', '+7 hours')
      WHERE id = ?
    `).bind(`endpoint_dead_${res.status}`, subscription.id).run()
  } else if (!res.ok) {
    const errorText = cleanText(await res.text().catch(() => '')).slice(0, 300)
    await env.DB.prepare(`
      UPDATE marketplace_push_subscriptions
      SET last_error = ?, updated_at = datetime('now', '+7 hours')
      WHERE id = ?
    `).bind(`push_${res.status}: ${errorText}`, subscription.id).run()
  } else {
    await env.DB.prepare(`
      UPDATE marketplace_push_subscriptions
      SET last_error = '', last_sent_at = datetime('now', '+7 hours'), updated_at = datetime('now', '+7 hours')
      WHERE id = ?
    `).bind(subscription.id).run()
  }
  return { ok: res.ok, status: res.status }
}

function pushEventFromRow(row) {
  if (!row) return null
  const data = safeJsonParse(row.data, {})
  return {
    id: row.id,
    type: cleanText(row.event_type || data.type || 'chat'),
    title: cleanText(row.title),
    body: cleanText(row.body),
    tag: cleanText(row.tag),
    url: cleanText(row.url || data.url || '/pages/profit-dashboard.html#chat'),
    dedupe_key: cleanText(row.dedupe_key || data.dedupe_key),
    data: typeof data === 'object' && data ? data : {},
    created_at: cleanText(row.created_at)
  }
}

function pushKeyPart(value, fallback = '_') {
  const text = cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return text || fallback
}

function orderPushDedupeKey(row = {}, reason = 'changed') {
  return [
    'order',
    pushKeyPart(reason),
    pushKeyPart(row.platform),
    pushKeyPart(row.shop || row.shop_id),
    pushKeyPart(row.order_id || row.order_sn || row.orderId),
    pushKeyPart(row.order_type),
    pushKeyPart(orderNotificationStatus(row)),
    pushKeyPart(row.shipping_carrier),
    pushKeyPart(row.tracking_number)
  ].join(':').slice(0, 500)
}

function chatPushDedupeKey(message = {}, latest = {}, preview = '') {
  const timeBucket = Math.floor(Date.now() / (10 * 60 * 1000))
  return [
    'chat',
    pushKeyPart(latest.platform || message.platform),
    pushKeyPart(latest.shop || latest.shop_id || message.shop || message.shop_id),
    pushKeyPart(latest.conversation_id || message.conversation_id),
    pushKeyPart(message.sender_type || latest.sender_type || 'buyer'),
    pushKeyPart(message.sender_id || latest.buyer_id || message.buyer_id),
    `bucket-${timeBucket}`,
    simpleHash(preview)
  ].join(':').slice(0, 500)
}

async function reservePushDedupeKeys(env, keys = [], eventType = 'chat') {
  const uniqueKeys = [...new Set((keys || []).map(cleanText).filter(Boolean))]
  const accepted = new Set()
  for (const key of uniqueKeys) {
    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO marketplace_push_dedupe
        (dedupe_key, event_type, created_at)
      VALUES (?, ?, datetime('now', '+7 hours'))
    `).bind(key, eventType).run()
    if (Number(result?.meta?.changes || 0) > 0) accepted.add(key)
  }
  await env.DB.prepare(`
    DELETE FROM marketplace_push_dedupe
    WHERE event_type = 'chat'
      AND datetime(created_at) < datetime('now', '+7 hours', '-14 days')
  `).run().catch(() => null)
  return accepted
}

async function hasRecentPushEvent(env, eventType = 'chat', seconds = 120) {
  const safeSeconds = Math.min(Math.max(Number(seconds) || 120, 30), 600)
  const row = await env.DB.prepare(`
    SELECT id
    FROM marketplace_push_events
    WHERE event_type = ?
      AND dedupe_key != ''
      AND datetime(created_at) >= datetime('now', '+7 hours', ?)
    ORDER BY id DESC
    LIMIT 1
  `).bind(cleanText(eventType || 'chat'), `-${safeSeconds} seconds`).first()
  return Boolean(row?.id)
}

async function queuePushEvent(env, event) {
  await ensureChatTables(env)
  const data = {
    ...(event.data && typeof event.data === 'object' ? event.data : {}),
    type: cleanText(event.event_type || event.type || event.data?.type || 'chat'),
    url: cleanText(event.url || event.data?.url || '')
  }
  const title = cleanText(event.title).slice(0, 160)
  const body = cleanText(event.body).slice(0, 260)
  const dedupeKey = cleanText(event.dedupe_key || event.dedupeKey || data.dedupe_key).slice(0, 500)
  if (!title && !body) return null
  if (dedupeKey) {
    const existing = await env.DB.prepare(`
      SELECT id
      FROM marketplace_push_events
      WHERE dedupe_key = ?
      LIMIT 1
    `).bind(dedupeKey).first()
    if (existing?.id) return { id: existing.id, duplicate: true, dedupe_key: dedupeKey }
  }
  const result = await env.DB.prepare(`
    INSERT INTO marketplace_push_events
      (event_type, title, body, tag, url, dedupe_key, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
  `).bind(
    data.type || 'chat',
    title,
    body,
    cleanText(event.tag).slice(0, 160),
    data.url || cleanText(event.url),
    dedupeKey,
    JSON.stringify(data).slice(0, 4000)
  ).run()
  await env.DB.prepare(`
    DELETE FROM marketplace_push_events
    WHERE id NOT IN (
      SELECT id FROM marketplace_push_events
      ORDER BY id DESC
      LIMIT 300
    )
  `).run().catch(() => null)
  return { id: result.meta?.last_row_id || null, duplicate: false, dedupe_key: dedupeKey }
}

async function sendPushToEnabledSubscribers(env, limit = 200) {
  const { results } = await env.DB.prepare(`
    SELECT id, endpoint
    FROM marketplace_push_subscriptions
    WHERE enabled = 1
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).bind(limit).all()
  let sent = 0
  const outcomes = await Promise.allSettled((results || []).map(item => sendWebPushPing(env, item)))
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled' && outcome.value?.ok) sent++
  }
  return { sent, total: results?.length || 0 }
}

function orderNotificationStatus(row) {
  return getOrderStatusValue(row, 'PENDING')
}

function orderNotificationStatusLabel(row) {
  return coreOrderStatusLabel(orderNotificationStatus(row), 'chưa rõ trạng thái')
}

function orderNotificationKind(row, reason = '') {
  return orderStatusKind(row, reason)
}

function orderKindLabel(kind) {
  return coreOrderKindLabel(kind)
}

function orderNotificationCounts(rows, reason = '') {
  const counts = {}
  for (const row of rows || []) {
    const kind = orderNotificationKind(row, reason)
    counts[kind] = (counts[kind] || 0) + 1
  }
  return counts
}

function orderNotificationCountText(counts) {
  const order = ['new', 'failed', 'return', 'cancelled', 'shipping', 'completed', 'changed']
  return order
    .filter(kind => counts[kind])
    .map(kind => `${counts[kind]} ${orderKindLabel(kind)}`)
    .join(', ')
}

function legacyOrderNotificationTitle(rows, reason = '') {
  const list = Array.isArray(rows) ? rows : []
  const isNew = reason === 'new' || list.some(row => row._push_reason === 'new')
  if (list.length > 1) return `${list.length} đơn hàng ${isNew ? 'mới' : 'vừa cập nhật'} trên OMS`
  const row = list[0] || {}
  const orderId = cleanText(row.order_id || row.order_sn || row.orderId)
  return isNew ? `Đơn mới ${orderId || 'trên OMS'}` : `Cập nhật đơn ${orderId || 'trên OMS'}`
}

Object.assign(globalThis, {
  syncChatApi,
  base64UrlToBytes,
  bytesToBase64Url,
  signVapidJwt,
  sendWebPushPing,
  pushEventFromRow,
  pushKeyPart,
  orderPushDedupeKey,
  chatPushDedupeKey,
  reservePushDedupeKeys,
  hasRecentPushEvent,
  queuePushEvent,
  sendPushToEnabledSubscribers,
  orderNotificationStatus,
  orderNotificationStatusLabel,
  orderNotificationKind,
  orderKindLabel,
  orderNotificationCounts,
  orderNotificationCountText,
  legacyOrderNotificationTitle
})
