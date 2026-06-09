import { signHmacHex } from '../../utils/shopee-apps.js'
import { saveProductKnowledgeBatch } from '../../core/products/product-knowledge-core.js'
import { collectLazadaMessageRows, collectLazadaSessionRows } from './lazada-bridge-paging.js'
import { normalizeLazadaMessagePayload } from './lazada-message-normalize.js'

function cleanText(value) {
  return String(value ?? '').trim()
}

function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors
    }
  })
}

function firstText(source, paths = []) {
  for (const path of paths) {
    const keys = Array.isArray(path) ? path : [path]
    let value = source
    for (const key of keys) value = value?.[key]
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function firstUsefulText(source, paths = [], base = {}) {
  const blocked = new Set([
    cleanText(base.shop_id),
    cleanText(base.shop),
    cleanText(base.seller_id),
    cleanText(base.customer_id),
    cleanText(base.buyer_id)
  ].filter(Boolean).map(item => item.toLowerCase()))
  for (const path of paths) {
    const text = firstText(source, [path])
    const normalized = text.toLowerCase()
    if (!text || blocked.has(normalized)) continue
    if (/^\d{6,}$/.test(text)) continue
    return text
  }
  return ''
}

function firstArray(source, paths = []) {
  for (const path of paths) {
    const keys = Array.isArray(path) ? path : [path]
    let value = source
    for (const key of keys) value = value?.[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function firstObject(source, paths = []) {
  for (const path of paths) {
    const keys = Array.isArray(path) ? path : [path]
    let value = source
    for (const key of keys) value = value?.[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  }
  return {}
}

function parseJsonLoose(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  let text = cleanText(value)
  if (!text) return null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = text.trim()
    if (!candidate || !/^[{["]/.test(candidate)) return attempt ? text : null
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'string') {
        text = parsed
        continue
      }
      return parsed
    } catch {
      const unescaped = candidate
        .replace(/\\"/g, '"')
        .replace(/\\\\n/g, '\n')
        .replace(/\\\\r/g, '\r')
      if (unescaped === candidate) return attempt ? text : null
      text = unescaped
    }
  }
  return null
}

function collectActionText(content = {}) {
  const parts = []
  const add = value => {
    const text = localizedText(value)
    if (text && !parts.includes(text)) parts.push(text)
  }
  add(content.actionTxt)
  for (let index = 1; index <= 12; index += 1) add(content[`action${index}Txt`])
  return parts.join(' · ')
}

function localizedText(value) {
  const parsed = parseJsonLoose(value)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return firstText(parsed, ['vi', 'en', 'text', 'txt', 'message', 'title', 'value', 'content'])
  }
  return cleanText(parsed || value)
}

function lazadaContentText(value) {
  const parsed = parseJsonLoose(value)
  const content = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : value
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const rawText = firstText(content, ['txt', 'text', 'message', 'content', 'summary', 'title', 'display_text', 'body'])
    const text = localizedText(rawText)
    if (text) return text
    const actionText = collectActionText(content)
    if (actionText) return actionText
  }
  return typeof content === 'string' ? cleanText(content) : ''
}

function compactApiError(data = {}) {
  return {
    error: cleanText(data.error || data.code || data.error_code),
    message: cleanText(data.message || data.error_message || data.error_msg || data.sub_msg),
    request_id: cleanText(data.request_id || data.requestId)
  }
}

function normalizeLazadaTimestamp(value) {
  const text = cleanText(value)
  if (!text) return ''
  const number = Number(text)
  if (Number.isFinite(number) && number > 0) {
    const ms = number > 1e11 ? number : number * 1000
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function lazadaRawTimestamp(row = {}) {
  return firstText(row, [
    'last_message_time',
    'last_message_timestamp',
    'gmt_modified',
    'modified_time',
    'send_time',
    'timestamp'
  ])
}

function messageText(row = {}) {
  return normalizeLazadaMessagePayload(row).text
}

function messageMedia(row = {}) {
  return normalizeLazadaMessagePayload(row).attachments
}

function moneyNumber(value) {
  const cleaned = cleanText(value).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : 0
}

function lazadaProductKnowledgeFromMessage(row = {}) {
  const content = parseJsonLoose(row.content)
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null
  const itemId = firstText(content, ['item_id', 'itemId', 'product_id', 'productId'])
  if (!itemId) return null
  const title = localizedText(firstText(content, ['title', 'product_name', 'item_name', 'txt'])) || itemId
  const image = firstText(content, ['iconUrl', 'icon_url', 'imgUrl', 'img_url', 'image_url', 'url'])
  const price = moneyNumber(firstText(content, ['price', 'voucherPrice', ['newProduct', 'voucherPrice']]))
  const skuId = firstText(content, ['skuId', 'sku_id'])
  return {
    item_id: itemId,
    product_name: title,
    images: image ? [image] : [],
    item_sku: skuId || itemId,
    raw_listing: content,
    variations: [{
      variation_name: 'Mặc định',
      sku: skuId || itemId,
      model_id: skuId,
      price,
      discount_price: price,
      stock: 0,
      image_url: image
    }]
  }
}

function conversationNeedsDetail(conversation = {}, base = {}) {
  const customerName = cleanText(conversation.customer_name)
  const lastMessage = cleanText(conversation.last_message_text)
  if (!customerName) return true
  if (/^\d{6,}$/.test(customerName)) return true
  if (cleanText(base.shop_id) && customerName === cleanText(base.shop_id)) return true
  return !lastMessage || /\\?"txt\\?"|action\d+Code|\{/.test(lastMessage)
}

function normalizeBridgeConversation(row = {}, base = {}, syncCursor = '') {
  const sessionId = firstText(row, ['session_id', 'conversation_id', 'chat_id', 'id'])
  const buyerId = firstText(row, ['buyer_id', 'user_id', 'customer_id', 'to_id'])
  const buyerName = firstUsefulText(row, [
    'buyer_name',
    'user_name',
    'nickname',
    'customer_name',
    'display_name',
    'session_title',
    'title',
    ['buyer', 'name'],
    ['buyer', 'nickname'],
    ['user', 'name'],
    ['user', 'nickname']
  ], { ...base, buyer_id: buyerId, customer_id: buyerId })
  const rawTimestamp = lazadaRawTimestamp(row)
  const lastMessage = messageText(row)
  return {
    id: `lazada_${base.shop_id || 'shop'}_${sessionId || buyerId}`,
    channel: 'lazada',
    platform: 'lazada',
    shop: base.shop,
    shop_id: base.shop_id,
    conversation_id: sessionId,
    session_id: sessionId,
    platform_conversation_id: sessionId,
    buyer_id: buyerId,
    customer_id: buyerId,
    buyer_name: buyerName,
    customer_name: buyerName,
    last_message: lastMessage,
    last_message_text: lastMessage,
    last_message_at: normalizeLazadaTimestamp(rawTimestamp),
    last_message_timestamp: rawTimestamp,
    unread_count: Math.max(Number(firstText(row, ['unread_count', 'unread', 'unread_num']) || 0) || 0, 0),
    sync_cursor: syncCursor,
    messages: []
  }
}

function normalizeBridgeMessage(row = {}, fallback = {}) {
  const messageId = firstText(row, ['message_id', 'msg_id', 'id', 'request_id'])
  const senderRaw = firstText(row, ['sender_type', 'from_type', 'sender_role', 'from_account_type', ['sender', 'type']]).toLowerCase()
  const fromId = firstText(row, ['from_id', 'sender_id', 'user_id', 'from_account_id'])
  const senderType = senderRaw.includes('seller') || senderRaw.includes('shop') || senderRaw === '2' || (fromId && fromId === fallback.shop_id)
    ? 'shop'
    : 'customer'
  const rawTimestamp = firstText(row, ['send_time', 'created_at', 'timestamp', 'sent_at'])
  const normalizedPayload = normalizeLazadaMessagePayload(row)
  const text = normalizedPayload.text
  const mediaItems = normalizedPayload.attachments
  const content = normalizedPayload.content || row
  return {
    channel: 'lazada',
    platform: 'lazada',
    shop: fallback.shop,
    shop_id: fallback.shop_id,
    conversation_id: fallback.conversation_id,
    session_id: fallback.conversation_id,
    platform_conversation_id: fallback.conversation_id,
    buyer_id: fallback.buyer_id,
    customer_id: fallback.buyer_id,
    message_id: messageId,
    platform_message_id: messageId,
    sender_type: senderType,
    sender_name: senderType === 'shop'
      ? cleanText(fallback.shop) || 'Shop'
      : firstUsefulText(row, ['from_name', 'sender_name', 'buyer_name', 'user_name', 'nickname', 'display_name'], fallback),
    message_type: normalizedPayload.message_type || (mediaItems.length ? 'image' : 'text'),
    content: text,
    text,
    media_items: mediaItems,
    attachments: mediaItems,
    order_id: normalizedPayload.order_id,
    product_ids: normalizedPayload.product_ids,
    sent_at: normalizeLazadaTimestamp(rawTimestamp),
    created_at: normalizeLazadaTimestamp(rawTimestamp),
    source: 'lazada_im_bridge'
  }
}

function bridgeSecretFromRequest(request) {
  const headerSecret = cleanText(request.headers.get('X-Chat-Bridge-Secret') || request.headers.get('X-Lazada-Chat-Bridge-Secret'))
  if (headerSecret) return headerSecret
  const auth = cleanText(request.headers.get('Authorization'))
  return /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : ''
}

function safeEqual(left, right) {
  const a = cleanText(left)
  const b = cleanText(right)
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

function verifyBridgeAuth(request, env, cors) {
  const expected = cleanText(env.CHAT_BRIDGE_INTERNAL_SECRET)
  if (!expected) {
    return json({ ok: false, success: false, error_code: 'bridge_secret_not_configured', error_message: 'Worker chính chưa cấu hình CHAT_BRIDGE_INTERNAL_SECRET.' }, cors, 503)
  }
  if (!safeEqual(bridgeSecretFromRequest(request), expected)) {
    return json({ ok: false, success: false, error_code: 'bridge_unauthorized', error_message: 'Thiếu hoặc sai secret nội bộ của Lazada chat bridge.' }, cors, 401)
  }
  return null
}

async function loadLazadaBridgeShop(env, input = {}) {
  const shop = cleanText(input.shop || input.shop_name || input.user_name)
  const shopId = cleanText(input.shop_id || input.api_shop_id || input.seller_id)
  const values = [...new Set([shop, shopId].filter(Boolean))]
  if (!values.length) return { error_code: 'missing_shop', error_message: 'Thiếu shop/shop_id để chọn shop Lazada.' }
  const placeholders = values.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id, access_token, refresh_token,
           chat_access_token, chat_refresh_token, token_expire_at, chat_token_expire_at,
           api_partner_id, api_partner_key, api_redirect_url, chat_api_redirect_url
    FROM shops
    WHERE platform = 'lazada'
      AND (CAST(id AS TEXT) IN (${placeholders}) OR shop_name IN (${placeholders}) OR user_name IN (${placeholders}) OR api_shop_id IN (${placeholders}))
    ORDER BY CASE WHEN api_shop_id = ? THEN 0 ELSE 1 END,
             CASE WHEN shop_name = ? OR user_name = ? THEN 0 ELSE 1 END,
             CASE WHEN chat_access_token IS NOT NULL AND chat_access_token != '' THEN 0 ELSE 1 END,
             id DESC
    LIMIT 1
  `).bind(...values, ...values, ...values, ...values, shopId, shop, shop).all()
  const row = (results || [])[0] || null
  if (!row) return { error_code: 'shop_not_found', error_message: 'Không tìm thấy shop Lazada tương ứng.' }
  return { shop: row }
}

function lazadaChatCredentials(env = {}, shop = {}) {
  const appKey = cleanText(env.LAZADA_CHAT_APP_KEY || env.LAZADA_APP_KEY || shop.api_partner_id || '135731')
  const secret = cleanText(env.LAZADA_CHAT_SECRET || env.LAZADA_SECRET || shop.api_partner_key)
  const accessToken = cleanText(env.LAZADA_CHAT_ACCESS_TOKEN || shop.chat_access_token || shop.access_token)
  return { appKey, secret, accessToken }
}

async function signLazadaChat(env, shop, path, params = {}) {
  const { appKey, secret, accessToken } = lazadaChatCredentials(env, shop)
  if (!appKey || !secret) throw new Error('missing_lazada_chat_app_secret')
  if (!accessToken) throw new Error('token_scope_missing')
  const base = {
    app_key: appKey,
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    access_token: accessToken,
    ...params
  }
  const signString = path + Object.keys(base).sort().map(key => `${key}${base[key]}`).join('')
  const sign = (await signHmacHex(secret, signString)).toUpperCase()
  return { ...base, sign }
}

async function callLazadaChatPath(env, shop, path, params = {}, method = 'GET') {
  const httpMethod = cleanText(method || 'GET').toUpperCase() || 'GET'
  try {
    const finalParams = await signLazadaChat(env, shop, path, params)
    const url = `https://api.lazada.vn/rest${path}`
    const res = httpMethod === 'POST'
      ? await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json;charset=utf-8' },
          body: JSON.stringify(finalParams)
        })
      : await fetch(`${url}?${new URLSearchParams(finalParams)}`)
    const data = await res.json().catch(() => ({}))
    const code = cleanText(data.code || data.error_code)
    const ok = res.ok && (!code || code === '0')
    return { ok, status: res.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: { code: cleanText(error?.message || error) || 'lazada_chat_api_failed', message: cleanText(error?.message || error) } }
  }
}

async function fetchLazadaSessionDetail(env, shop, sessionId) {
  const result = await callLazadaChatPath(env, shop, '/im/session/get', { session_id: sessionId })
  const detail = result.ok
    ? firstObject(result.data, [
        ['data', 'session'],
        ['data', 'session_info'],
        ['data'],
        ['result', 'session'],
        ['result']
      ])
    : {}
  return { ...result, detail }
}

function conversationUnchanged(conversationId, row = {}, known = {}) {
  const key = cleanText(conversationId)
  const current = lazadaRawTimestamp(row)
  return Boolean(key && current && cleanText(known[key]) === current)
}

async function syncLazadaBridgeInbox(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const loaded = await loadLazadaBridgeShop(env, body)
  if (loaded.error_code) {
    return json({ ok: false, success: false, status: 'skipped', error_code: loaded.error_code, error_message: loaded.error_message, pulled_conversations: 0, pulled_messages: 0 }, cors, loaded.error_code === 'missing_shop' ? 400 : 404)
  }
  const shop = loaded.shop
  const creds = lazadaChatCredentials(env, shop)
  if (!creds.accessToken) {
    return json({
      ok: false,
      success: false,
      status: 'failed',
      capability: { shop_chat_mode: 'api', send_capability: 'bridge', sync_capability: 'polling_api' },
      error_code: 'token_scope_missing',
      error_message: 'Shop Lazada thiếu chat_access_token/access_token có quyền IM.',
      endpoint_paths: ['/im/session/list', '/im/session/get', '/im/message/list'],
      pulled_conversations: 0,
      pulled_messages: 0
    }, cors, 409)
  }
  const sessionBatch = await collectLazadaSessionRows({
    body,
    callPath: (path, params) => callLazadaChatPath(env, shop, path, params),
    firstArray,
    cleanText,
    compactApiError
  })
  const listResult = { status: sessionBatch.status || 0, data: {} }
  if (!sessionBatch.ok) {
    const apiError = compactApiError(sessionBatch.data)
    return json({ ok: false, success: false, status: 'failed', error_code: apiError.error || 'lazada_session_list_failed', error_message: apiError.message || 'Không đọc được danh sách hội thoại Lazada.', attempts: [{ path: '/im/session/list', http_status: listResult.status, ...apiError }] }, cors, 502)
  }

  const rawRows = sessionBatch.rows
  const syncCursor = sessionBatch.syncCursor
  const targetSessionId = cleanText(body.target_conversation_id || body.platform_conversation_id || body.session_id)
  const base = {
    shop: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id),
    shop_id: cleanText(shop.api_shop_id || shop.id)
  }
  const known = body.force_history === true || body.force_history === 'true' || body.force === true || body.force === 'true'
    ? {}
    : body.known_conversation_timestamps && typeof body.known_conversation_timestamps === 'object'
    ? body.known_conversation_timestamps
    : {}
  const conversations = []
  let pulledMessages = 0
  let skippedUnchangedConversations = 0
  const productKnowledge = []
  const attempts = [...sessionBatch.attempts]

  for (const row of rawRows) {
    let sessionRow = row
    let conversation = normalizeBridgeConversation(sessionRow, base, syncCursor)
    if (!conversation.conversation_id) continue
    if (conversationNeedsDetail(conversation, base)) {
      const detailResult = await fetchLazadaSessionDetail(env, shop, conversation.conversation_id)
      attempts.push({ path: '/im/session/get', session_id: conversation.conversation_id, http_status: detailResult.status, ...compactApiError(detailResult.data) })
      if (detailResult.ok && Object.keys(detailResult.detail || {}).length) {
        sessionRow = { ...row, ...detailResult.detail }
        conversation = normalizeBridgeConversation(sessionRow, base, syncCursor)
      }
    }
    if (conversationUnchanged(conversation.conversation_id, sessionRow, known)) {
      skippedUnchangedConversations += 1
      continue
    }
    const messageBatch = await collectLazadaMessageRows({
      body,
      sessionId: conversation.conversation_id,
      isTarget: targetSessionId && conversation.conversation_id === targetSessionId,
      callPath: (path, params) => callLazadaChatPath(env, shop, path, params),
      firstArray,
      cleanText,
      compactApiError
    })
    attempts.push(...messageBatch.attempts)
    const rawMessages = messageBatch.rows
    if (rawMessages.length) {
      for (const rawMessage of rawMessages) {
        const product = lazadaProductKnowledgeFromMessage(rawMessage)
        if (product) productKnowledge.push(product)
      }
      const messages = rawMessages.map(message => normalizeBridgeMessage(message, conversation)).filter(message => message.message_id || message.text || message.attachments?.length)
      pulledMessages += messages.length
      conversation.messages = messages
    }
    if (!conversation.customer_name) {
      const customerFromMessages = (conversation.messages || [])
        .map(message => message.sender_type === 'customer' ? cleanText(message.sender_name) : '')
        .find(Boolean)
      if (customerFromMessages) {
        conversation.customer_name = customerFromMessages
        conversation.buyer_name = customerFromMessages
      }
    }
    conversations.push(conversation)
  }

  let savedProductKnowledge = 0
  if (productKnowledge.length) {
    const uniqueProducts = new Map()
    for (const product of productKnowledge) uniqueProducts.set(cleanText(product.item_id), product)
    const result = await saveProductKnowledgeBatch(env, {
      platform: 'lazada',
      shop: base.shop,
      shop_id: base.shop_id,
      source: 'lazada_im_message',
      products: [...uniqueProducts.values()]
    }).catch(error => ({ saved: 0, error_message: cleanText(error?.message || error) }))
    savedProductKnowledge = Number(result.saved || 0) || 0
  }

  return json({
    ok: true,
    success: true,
    status: conversations.length || skippedUnchangedConversations ? 'ok' : 'no_conversation',
    capability: { shop_chat_mode: 'api', send_capability: 'bridge', sync_capability: 'polling_api' },
    endpoint_paths: ['/im/session/list', '/im/session/get', '/im/message/list'],
    shop: base.shop,
    shop_id: base.shop_id,
    pulled_conversations: conversations.length,
    listed_conversations: sessionBatch.listedConversations || rawRows.length,
    pulled_messages: pulledMessages,
    skipped_unchanged_conversations: skippedUnchangedConversations,
    skipped_duplicates: 0,
    saved_messages: 0,
    saved_product_knowledge: savedProductKnowledge,
    sync_cursor: syncCursor,
    conversations,
    attempts: attempts.slice(-8)
  }, cors)
}

async function sendLazadaBridgeMessage(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const conversation = body.conversation && typeof body.conversation === 'object' ? body.conversation : {}
  const loaded = await loadLazadaBridgeShop(env, conversation.shop_id ? conversation : body)
  if (loaded.error_code) return json({ ok: false, success: false, error_code: loaded.error_code, error_message: loaded.error_message }, cors, 400)
  const text = cleanText(body.text || body.content || body.message?.text || body.message?.content).slice(0, 5000)
  let sessionId = cleanText(body.session_id || body.conversation_id || conversation.session_id || conversation.platform_conversation_id || conversation.conversation_id)
  const templateId = Number(body.template_id || body.templateId || 1) || 1
  const itemId = cleanText(body.item_id || body.itemId || body.product_item_id || body.platform_item_id || body.platform_product_id)
  const orderId = cleanText(body.order_id || body.orderId || body.order_sn || body.platform_order_id)
  const promotionId = cleanText(body.promotion_id || body.promotionId)
  const imgUrl = cleanText(body.img_url || body.imgUrl || body.image_url || body.url)
  const videoId = cleanText(body.video_id || body.videoId)
  if (templateId === 1 && !text) return json({ ok: false, success: false, error_code: 'missing_text', error_message: 'Thiếu nội dung text để gửi Lazada live.' }, cors, 400)
  if (templateId === 3 && !imgUrl) return json({ ok: false, success: false, error_code: 'missing_image_url', error_message: 'Thiếu ảnh để gửi Lazada picture message.' }, cors, 400)
  if (templateId === 10006 && !itemId) return json({ ok: false, success: false, error_code: 'missing_item_id', error_message: 'Thiếu item_id để gửi thẻ sản phẩm Lazada.' }, cors, 400)
  if (templateId === 10007 && !orderId) return json({ ok: false, success: false, error_code: 'missing_order_id', error_message: 'Thiếu order_id để gửi thẻ đơn hàng Lazada.' }, cors, 400)
  if (templateId === 10008 && !promotionId) return json({ ok: false, success: false, error_code: 'missing_promotion_id', error_message: 'Thiếu promotion_id để gửi voucher Lazada.' }, cors, 400)
  if (templateId === 6 && !videoId) return json({ ok: false, success: false, error_code: 'missing_video_id', error_message: 'Thiếu video_id để gửi video Lazada.' }, cors, 400)
  if (!sessionId && orderId) {
    const opened = await callLazadaChatPath(env, loaded.shop, '/im/session/open', { order_id: orderId }, 'POST')
    if (opened.ok) {
      const openedData = opened.data?.data && typeof opened.data.data === 'object' ? opened.data.data : opened.data
      sessionId = cleanText(openedData?.session_id || openedData?.sessionId)
    }
  }
  if (!sessionId) return json({ ok: false, success: false, error_code: 'missing_session_id', error_message: 'Hội thoại Lazada chưa có session_id chính thức nên bridge không gửi live.' }, cors, 400)
  if (templateId === 1 && Array.isArray(body.attachments) && body.attachments.length) {
    return json({ ok: false, success: false, error_code: 'attachment_bridge_not_ready', error_message: 'Lazada bridge nội bộ hiện chỉ bật text live; attachment chưa được gửi lên sàn.' }, cors, 400)
  }
  if (body.dry_run === true) {
    return json({
      ok: true,
      success: true,
      dry_run: true,
      status: 'dry_run',
      request: { session_id: sessionId, template_id: templateId, txt: text, item_id: itemId, order_id: orderId, promotion_id: promotionId, img_url: imgUrl }
    }, cors)
  }
  const params = {
    session_id: sessionId,
    template_id: templateId,
    ...(text ? { txt: text } : {}),
    ...(imgUrl ? { img_url: imgUrl } : {}),
    ...(itemId ? { item_id: itemId } : {}),
    ...(orderId ? { order_id: orderId } : {}),
    ...(promotionId ? { promotion_id: promotionId } : {}),
    ...(videoId ? { video_id: videoId } : {}),
    ...(body.width ? { width: Number(body.width) || body.width } : {}),
    ...(body.height ? { height: Number(body.height) || body.height } : {})
  }
  const result = await callLazadaChatPath(env, loaded.shop, '/im/message/send', {
    ...params
  }, 'POST')
  if (!result.ok) {
    const apiError = compactApiError(result.data)
    const errorCode = apiError.error === 'token_scope_missing' ? 'token_scope_missing' : (apiError.error || 'lazada_send_failed')
    return json({
      ok: false,
      success: false,
      status: 'failed',
      error_code: errorCode,
      error_message: apiError.message || 'Lazada Chat API từ chối gửi tin nhắn.',
      raw: { status: result.status, lazada: apiError }
    }, cors, result.status ? 502 : 400)
  }
  const response = result.data?.data && typeof result.data.data === 'object' ? result.data.data : {}
  return json({
    ok: true,
    success: true,
    status: 'sent',
    platform_message_id: cleanText(response.message_id || response.msg_id || result.data?.request_id),
    sent_at: normalizeLazadaTimestamp(response.send_time || response.timestamp) || new Date().toISOString(),
    raw: { status: result.status, request_id: cleanText(result.data?.request_id), response }
  }, cors)
}

function disabledBridgeRead(cors) {
  return json({
    ok: false,
    success: false,
    error_code: 'legacy_bridge_read_disabled',
    error_message: 'Bridge đọc list/message cũ đã tắt; Chat Worker mới phải đọc dữ liệu đã lưu trong Chat Core.'
  }, cors, 410)
}

export async function handleLazadaChatBridge(request, env, cors = {}) {
  const url = new URL(request.url)
  const base = '/api/internal/chat-bridge/lazada'
  if (request.method === 'GET' && (url.pathname === `${base}/conversations` || url.pathname.startsWith(`${base}/conversations/`))) {
    return disabledBridgeRead(cors)
  }
  const unauthorized = verifyBridgeAuth(request, env, cors)
  if (unauthorized) return unauthorized
  if (request.method === 'POST' && url.pathname === `${base}/sync`) return syncLazadaBridgeInbox(request, env, cors)
  if (request.method === 'POST' && url.pathname === `${base}/messages/send`) return sendLazadaBridgeMessage(request, env, cors)
  return json({ ok: false, success: false, error_code: 'bridge_route_not_found', error_message: 'Lazada chat bridge không có route này.' }, cors, 404)
}
