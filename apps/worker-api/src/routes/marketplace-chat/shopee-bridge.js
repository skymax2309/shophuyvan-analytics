import { getShopeeAppFromRowForClient, signHmacHex } from '../../utils/shopee-apps.js'
import {
  buildShopeeChatDiagnostic,
  extractMessageRows,
  extractOneConversationRow,
  mergeConversationRows,
  normalizeShopeeConversation,
  normalizeShopeeMessage
} from './shopee-chat-normalize.js'
import { enrichRecentConversationRows } from './shopee-bridge-enrich.js'
import { fetchShopeeConversationListPages, probeShopeeConversationListVariants } from './shopee-bridge-list-probe.js'
import { enrichRowsWithOrderBuyerNames } from './shopee-bridge-order-enrich.js'
import { sameShopeeConversation, targetConversationFromBody } from './shopee-bridge-target.js'
import { fetchShopeeLostPushConversations } from './shopee-lost-push.js'
import { markShopeeBridgeConversationRead } from './shopee-bridge-read.js'
import { sendShopeeBridgeMessage, sendShopeeBridgeOrderCard, sendShopeeBridgeProductCard } from './shopee-bridge-send.js'

export function cleanText(value) {
  return String(value ?? '').trim()
}

export function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors
    }
  })
}

export function compactApiError(data = {}) {
  return {
    error: cleanText(data.error || data.error_code),
    message: cleanText(data.message || data.error_message || data.debug_message),
    request_id: cleanText(data.request_id || data.response?.request_id)
  }
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

function normalizeShopeeTimestamp(value) {
  const text = cleanText(value)
  if (!text) return ''
  const number = Number(text)
  if (Number.isFinite(number) && number > 0) {
    const ms = number > 1e17
      ? Math.floor(number / 1e6)
      : (number > 1e14 ? Math.floor(number / 1e3) : (number > 1e11 ? number : number * 1000))
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function shopeeRawTimestamp(row = {}) {
  return firstText(row, [
    'last_message_timestamp',
    'latest_message_timestamp',
    'last_message_time',
    'updated_timestamp',
    'updated_at',
    'created_timestamp',
    'created_at',
    'timestamp'
  ])
}

function normalizeBridgeMessage(row = {}, fallback = {}) {
  const messageId = firstText(row, ['message_id', 'msg_id', 'id', 'request_id'])
  const fromShopId = firstText(row, ['from_shop_id', 'shop_id'])
  const senderTypeRaw = firstText(row, ['sender_type', 'from_type', ['sender', 'type']]).toLowerCase()
  const senderType = senderTypeRaw.includes('seller') || senderTypeRaw.includes('shop') || (fromShopId && fromShopId === fallback.shop_id)
    ? 'shop'
    : 'customer'
  const rawTimestamp = firstText(row, ['created_timestamp', 'created_at', 'timestamp', 'sent_at', 'send_time'])
  const senderName = senderType === 'shop'
    ? cleanText(fallback.shop)
    : firstText(row, ['from_name', 'sender_name', 'buyer_name', 'to_name'])
  return {
    channel: 'shopee',
    platform: 'shopee',
    shop: fallback.shop,
    shop_id: fallback.shop_id,
    conversation_id: fallback.conversation_id,
    platform_conversation_id: fallback.conversation_id,
    buyer_id: fallback.buyer_id,
    customer_id: fallback.buyer_id,
    message_id: messageId,
    platform_message_id: messageId,
    sender_type: senderType,
    sender_name: senderName || (senderType === 'shop' ? 'Shop' : 'KhÃ¡ch'),
    message_type: firstText(row, ['message_type', 'msg_type', 'type']) || 'text',
    content: messageText(row),
    text: messageText(row),
    media_items: [],
    attachments: [],
    sent_at: normalizeShopeeTimestamp(rawTimestamp),
    created_at: normalizeShopeeTimestamp(rawTimestamp),
    source: 'shopee_sellerchat_bridge'
  }
}

function bridgeSecretFromRequest(request) {
  const headerSecret = cleanText(request.headers.get('X-Chat-Bridge-Secret') || request.headers.get('X-Shopee-Chat-Bridge-Secret'))
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
    return json({ ok: false, success: false, error_code: 'bridge_secret_not_configured', error_message: 'Worker chÃ­nh chÆ°a cáº¥u hÃ¬nh CHAT_BRIDGE_INTERNAL_SECRET.' }, cors, 503)
  }
  if (!safeEqual(bridgeSecretFromRequest(request), expected)) {
    return json({ ok: false, success: false, error_code: 'bridge_unauthorized', error_message: 'Thiáº¿u hoáº·c sai secret ná»™i bá»™ cá»§a Shopee chat bridge.' }, cors, 401)
  }
  return null
}

export async function loadShopeeBridgeShop(env, input = {}) {
  const shop = cleanText(input.shop || input.shop_name || input.user_name)
  const shopId = cleanText(input.shop_id || input.api_shop_id || input.seller_id)
  const values = [...new Set([shop, shopId].filter(Boolean))]
  if (!values.length) return { error_code: 'missing_shop', error_message: 'Thiáº¿u shop/shop_id Ä‘á»ƒ chá»n shop Shopee.' }
  const placeholders = values.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id, access_token, refresh_token,
           chat_access_token, chat_refresh_token, token_expire_at, chat_token_expire_at,
           api_partner_id, api_partner_key, api_redirect_url, chat_api_redirect_url
    FROM shops
    WHERE platform = 'shopee'
      AND (CAST(id AS TEXT) IN (${placeholders}) OR shop_name IN (${placeholders}) OR user_name IN (${placeholders}) OR api_shop_id IN (${placeholders}))
    ORDER BY CASE WHEN api_shop_id = ? THEN 0 ELSE 1 END,
             CASE WHEN shop_name = ? OR user_name = ? THEN 0 ELSE 1 END,
             CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 0 ELSE 1 END,
             id DESC
    LIMIT 1
  `).bind(...values, ...values, ...values, ...values, shopId, shop, shop).all()
  const row = (results || [])[0] || null
  if (!row) return { error_code: 'shop_not_found', error_message: 'KhÃ´ng tÃ¬m tháº¥y shop Shopee tÆ°Æ¡ng á»©ng.' }
  return { shop: row }
}

async function shopeeSignedUrl(env, shop, path, params = {}) {
  const app = getShopeeAppFromRowForClient(env, shop, 'chat_client', shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  const partnerId = cleanText(app.partnerId)
  const partnerKey = cleanText(app.partnerKey)
  const timestamp = Math.floor(Date.now() / 1000)
  const shopId = cleanText(env.SHOPEE_CHAT_SHOP_ID || shop.api_shop_id || shop.shop_id)
  const accessToken = cleanText(env.SHOPEE_CHAT_ACCESS_TOKEN || shop.chat_access_token || shop.access_token)
  if (!partnerId || !partnerKey || !shopId || !accessToken) throw new Error('missing_shopee_chat_credentials')
  const sign = await signHmacHex(partnerKey, `${partnerId}${path}${timestamp}${accessToken}${shopId}`)
  const url = new URL(`https://partner.shopeemobile.com${path}`)
  url.searchParams.set('partner_id', partnerId)
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('shop_id', shopId)
  url.searchParams.set('sign', sign)
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export async function callShopeeChatApi(env, shop, path, options = {}) {
  const method = cleanText(options.method || 'GET').toUpperCase() || 'GET'
  try {
    const url = await shopeeSignedUrl(env, shop, path, options.params || {})
    const fetchOptions = { method }
    if (method !== 'GET') {
      fetchOptions.headers = { 'Content-Type': 'application/json' }
      fetchOptions.body = options.rawBody || JSON.stringify(options.body || {})
    }
    const res = await fetch(url, fetchOptions)
    const rawText = await res.text().catch(() => '')
    let data = {}
    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch {
        data = { message: rawText.slice(0, 500) }
      }
    }
    const ok = res.ok && !cleanText(data.error)
    return { ok, status: res.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: { error: cleanText(error?.message || error) || 'shopee_chat_api_failed' } }
  }
}

function extractSyncCursor(data = {}) {
  return firstText(data, [
    ['response', 'next_cursor'],
    ['response', 'cursor'],
    'next_cursor',
    'cursor'
  ])
}

function extractMessageNextOffset(data = {}) {
  return firstText(data, [
    ['response', 'page_result', 'next_offset'],
    ['response', 'page_result', 'offset'],
    ['response', 'page_result', 'next_cursor'],
    ['response', 'page_result', 'cursor'],
    ['response', 'page_result', 'next_page_token'],
    ['response', 'next_offset'],
    ['response', 'offset'],
    ['response', 'next_cursor'],
    ['response', 'cursor'],
    'next_offset',
    'offset',
    'next_cursor',
    'cursor'
  ])
}

function messagePageHasMore(data = {}) {
  const value = data?.response?.page_result?.has_next_page ??
    data?.response?.page_result?.has_more ??
    data?.response?.page_result?.more ??
    data?.response?.has_next_page ??
    data?.response?.has_more ??
    data?.response?.more
  return value === true || value === 1 || value === '1' || cleanText(value).toLowerCase() === 'true'
}

function messagePageHasExplicitMoreFlag(data = {}) {
  const value = data?.response?.page_result?.has_next_page ??
    data?.response?.page_result?.has_more ??
    data?.response?.page_result?.more ??
    data?.response?.has_next_page ??
    data?.response?.has_more ??
    data?.response?.more
  return value !== undefined && value !== null && cleanText(value) !== ''
}

async function fetchShopeeConversationMessages(env, shop, conversationId, pageSize, options = {}) {
  const rows = []
  const attempts = []
  const maxPages = Math.min(Math.max(Number(options.maxPages || 3) || 3, 1), 5)
  const seenMessageIds = new Set()
  let offset = ''
  let lastData = null
  for (let page = 0; page < maxPages; page += 1) {
    const result = await callShopeeChatApi(env, shop, '/api/v2/sellerchat/get_message', {
      params: { conversation_id: conversationId, page_size: pageSize, offset }
    })
    attempts.push({ path: '/api/v2/sellerchat/get_message', conversation_id: conversationId, page: page + 1, http_status: result.status, ...compactApiError(result.data) })
    if (!result.ok) break
    lastData = result.data
    const pageRows = extractMessageRows(result.data)
    const newRows = pageRows.filter(row => {
      const key = firstText(row, ['message_id', 'msg_id', 'id'])
      if (!key) return true
      if (seenMessageIds.has(key)) return false
      seenMessageIds.add(key)
      return true
    })
    if (page > 0 && !newRows.length) break
    rows.push(...newRows)
    const nextOffset = extractMessageNextOffset(result.data)
    if (!nextOffset || nextOffset === offset) break
    if (messagePageHasExplicitMoreFlag(result.data) && !messagePageHasMore(result.data)) break
    offset = nextOffset
  }
  return { rows, attempts, lastData }
}

function conversationUnchanged(conversationId, row = {}, known = {}) {
  const key = cleanText(conversationId)
  const current = shopeeRawTimestamp(row)
  return Boolean(key && current && cleanText(known[key]) === current)
}

function mergeLostPushConversations(conversations = [], lostConversations = []) {
  const byId = new Map()
  for (const conversation of conversations) {
    if (conversation?.conversation_id) byId.set(conversation.conversation_id, conversation)
  }
  for (const lost of lostConversations) {
    if (!lost?.conversation_id) continue
    const current = byId.get(lost.conversation_id)
    if (!current) {
      conversations.push(lost)
      byId.set(lost.conversation_id, lost)
      continue
    }
    const seen = new Set((current.messages || []).map(item => cleanText(item.message_id || item.platform_message_id)))
    const extraMessages = (lost.messages || []).filter(item => {
      const key = cleanText(item.message_id || item.platform_message_id)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    current.messages = [...(current.messages || []), ...extraMessages]
    if (lost.last_message_at && (!current.last_message_at || lost.last_message_at > current.last_message_at)) {
      current.last_message_at = lost.last_message_at
      current.last_message_text = lost.last_message_text || current.last_message_text
      current.last_message = lost.last_message_text || current.last_message
    }
  }
  return conversations
}

async function syncShopeeBridgeInbox(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const loaded = await loadShopeeBridgeShop(env, body)
  if (loaded.error_code) {
    return json({ ok: false, success: false, status: 'skipped', error_code: loaded.error_code, error_message: loaded.error_message, pulled_conversations: 0, pulled_messages: 0 }, cors, loaded.error_code === 'missing_shop' ? 400 : 404)
  }
  const shop = loaded.shop
  if (!cleanText(shop.api_shop_id) || !cleanText(shop.access_token || shop.chat_access_token)) {
    return json({
      ok: false,
      success: false,
      status: 'manual_required',
      capability: { shop_chat_mode: 'manual', send_capability: 'manual_only', sync_capability: 'manual_import' },
      error_code: 'shop_api_not_configured',
      error_message: 'Shop Shopee nÃ y chÆ°a cÃ³ token/API shop id nÃªn khÃ´ng gá»i SellerChat API.',
      pulled_conversations: 0,
      pulled_messages: 0
    }, cors, 409)
  }
  const limit = Math.min(Math.max(Number(body.limit || 20) || 20, 1), 50)
  const pageSize = Math.min(Math.max(Number(body.page_size || 20) || 20, 1), 50)
  const maxConversationsPerRun = Math.min(limit, 45)
  const listPages = await fetchShopeeConversationListPages({
    callShopeeChatApi: (currentShop, path, options) => callShopeeChatApi(env, currentShop, path, options),
    shop,
    params: { direction: 'older', type: 'all' },
    pageSize: maxConversationsPerRun,
    limit: maxConversationsPerRun,
    maxPages: 3
  })
  const listResult = listPages.lastData || {}
  if (!listPages.rows.length && listPages.attempts.some(item => item.error)) {
    const failed = listPages.attempts.find(item => item.error) || {}
    return json({ ok: false, success: false, status: 'failed', error_code: cleanText(failed.error || 'shopee_conversation_list_failed'), error_message: cleanText(failed.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c danh sÃ¡ch há»™i thoáº¡i Shopee.'), attempts: listPages.attempts }, cors, 502)
  }
  let rawRows = listPages.rows.slice(0, maxConversationsPerRun)
  const syncCursor = extractSyncCursor(listResult)
  const base = {
    shop: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id),
    shop_id: cleanText(shop.api_shop_id)
  }
  const attempts = listPages.attempts.length
    ? listPages.attempts
    : [{ path: '/api/v2/sellerchat/get_conversation_list', http_status: 0 }]
  rawRows = await enrichRecentConversationRows({
    rows: rawRows,
    base,
    attempts,
    limit: body.recent_detail_limit ?? body.enrich_recent_limit ?? 6,
    fetchConversationDetail: conversationId => callShopeeChatApi(env, shop, '/api/v2/sellerchat/get_one_conversation', {
      params: { conversation_id: conversationId }
    })
  })
  rawRows = await enrichRowsWithOrderBuyerNames(env, rawRows, base)
  const targetConversation = targetConversationFromBody(body, base)
  const targetConversationRequested = Boolean(targetConversation?.conversation_id)
  let oneConversationResult = null
  let oneConversationRow = null
  if (targetConversationRequested) {
    oneConversationResult = await callShopeeChatApi(env, shop, '/api/v2/sellerchat/get_one_conversation', {
      params: { conversation_id: targetConversation.conversation_id }
    })
    oneConversationRow = oneConversationResult.ok ? extractOneConversationRow(oneConversationResult.data) : null
    const preferredTarget = oneConversationRow
      ? { ...targetConversation, ...oneConversationRow, conversation_id: targetConversation.conversation_id }
      : targetConversation
    if (!rawRows.some(row => sameShopeeConversation(row, targetConversation.conversation_id)) && oneConversationRow) {
      rawRows = mergeConversationRows(rawRows, preferredTarget)
    } else if (oneConversationRow) {
      rawRows = rawRows.map(row => sameShopeeConversation(row, targetConversation.conversation_id) ? { ...row, ...oneConversationRow } : row)
    }
    rawRows = rawRows.slice(0, maxConversationsPerRun + 1)
  }
  const known = body.known_conversation_timestamps && typeof body.known_conversation_timestamps === 'object'
    ? body.known_conversation_timestamps
    : {}
  const conversations = []
  let pulledMessages = 0
  let skippedUnchangedConversations = 0
  let skippedMessageFetches = 0
  let messageFetches = 0
  const maxMessageFetches = Math.min(Math.max(Number(body.max_message_fetches || 18) || 18, 1), 30)
  if (oneConversationResult) attempts.push({ path: '/api/v2/sellerchat/get_one_conversation', conversation_id: targetConversation.conversation_id, http_status: oneConversationResult.status, ...compactApiError(oneConversationResult.data) })
  let diagnosticMessageData = null
  let diagnosticMessageRows = []
  let lostPushResult = null
  let conversationListProbe = null

  for (const row of rawRows) {
    const conversation = normalizeShopeeConversation(row, base, syncCursor)
    if (!conversation.conversation_id) continue
    const isTargetConversation = targetConversationRequested && conversation.conversation_id === targetConversation.conversation_id
    if (!isTargetConversation && conversationUnchanged(conversation.conversation_id, row, known)) {
      skippedUnchangedConversations += 1
      continue
    }
    if (!isTargetConversation && messageFetches >= maxMessageFetches) {
      skippedMessageFetches += 1
      conversations.push(conversation)
      continue
    }
    messageFetches += 1
    const messagesResult = await fetchShopeeConversationMessages(env, shop, conversation.conversation_id, pageSize, { maxPages: isTargetConversation ? 5 : 2 })
    attempts.push(...messagesResult.attempts)
    if (messagesResult.rows.length || messagesResult.lastData) {
      const messageRows = messagesResult.rows
      if ((body.diagnostic === true || body.diagnostic === 'true') && (!diagnosticMessageData || isTargetConversation)) {
        diagnosticMessageData = messagesResult.lastData
        diagnosticMessageRows = messageRows
      }
      const messages = messageRows
        .map(message => normalizeShopeeMessage(message, conversation))
        .filter(message => message.message_id || message.text)
      pulledMessages += messages.length
      conversation.messages = messages
    }
    conversations.push(conversation)
  }

  const includeLostPush = body.include_lost_push === true || body.include_lost_push === 'true' || body.force_history === true || body.diagnostic === true || body.diagnostic === 'true'
  if (includeLostPush) {
    lostPushResult = await fetchShopeeLostPushConversations(env, shop, base, {
      targetConversationId: targetConversation?.conversation_id || ''
    })
    attempts.push({
      path: '/api/v2/push/get_lost_push_message',
      http_status: lostPushResult.status,
      request_id: lostPushResult.request_id || '',
      error: lostPushResult.error || ''
    })
    const beforeMessages = conversations.reduce((sum, item) => sum + (item.messages || []).length, 0)
    mergeLostPushConversations(conversations, lostPushResult.conversations || [])
    const afterMessages = conversations.reduce((sum, item) => sum + (item.messages || []).length, 0)
    pulledMessages += Math.max(afterMessages - beforeMessages, 0)
  }

  if ((body.diagnostic === true || body.diagnostic === 'true') && (body.probe_list_variants === true || body.probe_list_variants === 'true')) {
    conversationListProbe = await probeShopeeConversationListVariants({
      callShopeeChatApi: (currentShop, path, options) => callShopeeChatApi(env, currentShop, path, options),
      shop,
      pageSize,
      names: Array.isArray(body.probe_names) ? body.probe_names : []
    })
  }

  return json({
    ok: true,
    success: true,
    status: conversations.length || skippedUnchangedConversations ? 'ok' : 'no_conversation',
    capability: { shop_chat_mode: 'api', send_capability: 'bridge', sync_capability: 'polling_api' },
    endpoint_paths: [
      '/api/v2/sellerchat/get_conversation_list',
      ...(oneConversationResult ? ['/api/v2/sellerchat/get_one_conversation'] : []),
      '/api/v2/sellerchat/get_message',
      ...(lostPushResult ? ['/api/v2/push/get_lost_push_message'] : [])
    ],
    shop: base.shop,
    shop_id: base.shop_id,
    pulled_conversations: conversations.length,
    listed_conversations: rawRows.length,
    target_conversation_requested: targetConversationRequested,
    target_conversation_id: targetConversation?.conversation_id || '',
    pulled_messages: pulledMessages,
    skipped_unchanged_conversations: skippedUnchangedConversations,
    skipped_message_fetches: skippedMessageFetches,
    skipped_duplicates: 0,
    saved_messages: 0,
    sync_cursor: syncCursor,
    conversations,
    attempts: attempts.slice(-8),
    ...((body.diagnostic === true || body.diagnostic === 'true') ? {
      diagnostic: {
        ...buildShopeeChatDiagnostic({
        listData: listResult,
        rawRows,
        oneConversationStatus: oneConversationResult?.status || 0,
        oneConversationRow,
        messageData: diagnosticMessageData,
        messageRows: diagnosticMessageRows
        }),
        lost_push: lostPushResult?.diagnostic || null,
        conversation_list_probe: conversationListProbe
      }
    } : {})
  }, cors)
}

function disabledBridgeRead(cors) {
  return json({
    ok: false,
    success: false,
    error_code: 'legacy_bridge_read_disabled',
    error_message: 'Bridge Ä‘á»c list/message cÅ© Ä‘Ã£ táº¯t; Chat Worker má»›i pháº£i Ä‘á»c dá»¯ liá»‡u Ä‘Ã£ lÆ°u trong Chat Core.'
  }, cors, 410)
}

export async function handleShopeeChatBridge(request, env, cors = {}) {
  const url = new URL(request.url)
  const base = '/api/internal/chat-bridge/shopee'
  if (request.method === 'GET' && (url.pathname === `${base}/conversations` || url.pathname.startsWith(`${base}/conversations/`))) {
    return disabledBridgeRead(cors)
  }
  const unauthorized = verifyBridgeAuth(request, env, cors)
  if (unauthorized) return unauthorized
  if (request.method === 'POST' && url.pathname === `${base}/sync`) return syncShopeeBridgeInbox(request, env, cors)
  if (request.method === 'POST' && url.pathname === `${base}/messages/send`) return sendShopeeBridgeMessage(request, env, cors)
  if (request.method === 'POST' && url.pathname === `${base}/messages/product-card`) return sendShopeeBridgeProductCard(request, env, cors)
  if (request.method === 'POST' && url.pathname === `${base}/messages/order-card`) return sendShopeeBridgeOrderCard(request, env, cors)
  if (request.method === 'POST' && url.pathname === `${base}/conversations/read`) return markShopeeBridgeConversationRead(request, env, cors)
  return json({ ok: false, success: false, error_code: 'bridge_route_not_found', error_message: 'Shopee chat bridge khÃ´ng cÃ³ route nÃ y.' }, cors, 404)
}
