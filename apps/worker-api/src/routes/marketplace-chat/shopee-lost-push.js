import { getShopeeAppFromRowForClient, signHmacHex } from '../../utils/shopee-apps.js'
import {
  normalizeShopeeConversation,
  normalizeShopeeMessage,
  shopeeConversationId
} from './shopee-chat-normalize.js'

const LOST_PUSH_PATH = '/api/v2/push/get_lost_push_message'

function cleanText(value) {
  return String(value ?? '').trim()
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function safeJson(value, fallback = {}) {
  if (isObject(value)) return value
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function valueAt(source, path) {
  const keys = Array.isArray(path) ? path : [path]
  let value = source
  for (const key of keys) value = value?.[key]
  return value
}

function firstText(source, paths = []) {
  for (const path of paths) {
    const text = cleanText(valueAt(source, path))
    if (text) return text
  }
  return ''
}

function compactHash(value) {
  const text = cleanText(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function pushTimestamp(push = {}, body = {}, data = {}) {
  return firstText(data, [
    'created_timestamp',
    'created_at',
    'send_time',
    'message_time',
    'timestamp',
    'update_time'
  ]) || firstText(body, ['timestamp', 'update_time']) || cleanText(push.timestamp)
}

function pushCode(push = {}, body = {}) {
  return Number(cleanText(push.code || body.code || body.event_code || body.message_type || 0))
}

function parsePushData(push = {}) {
  const parsed = safeJson(push.data, {})
  const nested = safeJson(parsed.data, parsed.data || {})
  return {
    body: isObject(parsed) ? parsed : {},
    data: isObject(nested) ? nested : {}
  }
}

function isWebchatPush(push = {}, body = {}) {
  const code = pushCode(push, body)
  const event = cleanText(body.event || body.event_code || body.message_type || body.type).toLowerCase()
  return code === 10 || event === 'webchat_push' || event.includes('webchat')
}

function buildLostPushRow(push = {}, base = {}) {
  const { body, data } = parsePushData(push)
  if (!isWebchatPush(push, body)) return null
  const message = isObject(data.message) ? data.message : data
  const conversationId = firstText(data, [
    'conversation_id',
    'conversationId',
    'chat_id',
    'session_id',
    ['message', 'conversation_id']
  ]) || firstText(message, ['conversation_id', 'conversationId', 'chat_id', 'session_id'])
  if (!conversationId) return null

  const fromId = firstText(message, ['from_id', 'from_user_id', ['sender', 'id']])
  const toId = firstText(message, ['to_id', 'to_user_id', ['receiver', 'id']])
  const customerId = fromId && fromId !== base.shop_id ? fromId : toId
  const timestamp = pushTimestamp(push, body, message)
  const messageId = firstText(message, ['message_id', 'msg_id', 'id']) ||
    `${conversationId}_${timestamp || push.timestamp || 'lost'}_${compactHash(JSON.stringify(message).slice(0, 1000))}`
  const content = isObject(message.content) ? message.content : (isObject(data.content) ? data.content : message.content)

  return {
    conversation: {
      conversation_id: conversationId,
      buyer_id: firstText(data, ['buyer_id', 'customer_id', 'to_id']) || customerId,
      buyer_name: firstText(data, ['buyer_name', 'customer_name', 'to_name', 'from_name', 'from_user_name']),
      last_message_content: content || firstText(message, ['text', 'message', 'content']),
      last_message_timestamp: timestamp,
      shop_id: base.shop_id
    },
    message: {
      ...message,
      conversation_id: conversationId,
      message_id: messageId,
      from_id: fromId,
      to_id: toId,
      from_shop_id: fromId === base.shop_id ? base.shop_id : '',
      sender_type: fromId === base.shop_id ? 'shop' : firstText(message, ['sender_type', 'from_type']),
      content,
      created_timestamp: timestamp,
      timestamp,
      source: 'shopee_lost_push'
    }
  }
}

async function signedPartnerUrl(env, shop, path) {
  const app = getShopeeAppFromRowForClient(env, shop, 'chat_client', shop?.api_partner_id || shop?.shop_name || shop?.api_shop_id)
  const partnerId = cleanText(app.partnerId)
  const partnerKey = cleanText(app.partnerKey)
  if (!partnerId || !partnerKey) throw new Error('missing_shopee_push_partner_credentials')
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = await signHmacHex(partnerKey, `${partnerId}${path}${timestamp}`)
  const url = new URL(`https://partner.shopeemobile.com${path}`)
  url.searchParams.set('partner_id', partnerId)
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', sign)
  return url.toString()
}

function lostPushDiagnostic(data = {}, rows = [], targetConversationId = '') {
  const response = data.response || {}
  const sample = rows[0] || {}
  const targetRows = rows.filter(row => shopeeConversationId(row.conversation) === cleanText(targetConversationId))
  return {
    endpoint_note: 'lost_push_read_only_not_confirmed',
    window_note: 'Shopee chỉ trả lost push chưa confirm trong khoảng 3 ngày gần hiện tại.',
    http_has_next_page: Boolean(response.has_next_page),
    last_message_id_present: Boolean(response.last_message_id),
    webchat_rows: rows.length,
    target_webchat_rows: targetRows.length,
    sample_conversation_id: shopeeConversationId(sample.conversation || {}),
    sample_message_id: cleanText(sample.message?.message_id),
    sample_timestamp: cleanText(sample.message?.timestamp || sample.message?.created_timestamp)
  }
}

export async function fetchShopeeLostPushConversations(env, shop, base = {}, options = {}) {
  try {
    const url = await signedPartnerUrl(env, shop, LOST_PUSH_PATH)
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
    const text = await res.text().catch(() => '')
    const data = safeJson(text, {})
    const pushList = Array.isArray(data.response?.push_message_list) ? data.response.push_message_list : []
    const rows = pushList
      .map(push => buildLostPushRow(push, base))
      .filter(Boolean)
    const byConversation = new Map()
    for (const row of rows) {
      const normalizedConversation = normalizeShopeeConversation(row.conversation, base, '')
      const normalizedMessage = normalizeShopeeMessage(row.message, normalizedConversation)
      const id = normalizedConversation.conversation_id
      const current = byConversation.get(id) || { ...normalizedConversation, messages: [] }
      current.messages.push({ ...normalizedMessage, source: 'shopee_lost_push' })
      if (!current.last_message_at || normalizedMessage.created_at > current.last_message_at) {
        current.last_message_text = normalizedMessage.text || current.last_message_text
        current.last_message_at = normalizedMessage.created_at || current.last_message_at
      }
      byConversation.set(id, current)
    }
    return {
      ok: res.ok && !cleanText(data.error),
      status: res.status,
      path: LOST_PUSH_PATH,
      request_id: cleanText(data.request_id),
      conversations: [...byConversation.values()],
      diagnostic: lostPushDiagnostic(data, rows, options.targetConversationId)
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      path: LOST_PUSH_PATH,
      error: cleanText(error?.message || error),
      conversations: [],
      diagnostic: { endpoint_note: 'lost_push_read_only_failed', error: cleanText(error?.message || error) }
    }
  }
}

