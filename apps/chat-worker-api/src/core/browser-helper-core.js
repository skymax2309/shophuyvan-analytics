import {
  findStoredMessageByDedupe,
  listConversations,
  getChatSettings,
  saveChatSyncState,
  saveConversation,
  updateStoredMessage
} from './conversation-core.js'
import { cleanText, normalizeChatMessage, nowIso } from './message-normalize.js'
import { mergeMessageIntoStore } from './message-merge.js'
import { notifyNewChatMessages } from './push-notification-core.js'

function compactKey(value, fallback = 'unknown') {
  const text = cleanText(value).toLowerCase()
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (normalized || fallback).slice(0, 96)
}

function stableHash(value) {
  let hash = 0
  const text = cleanText(value)
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function browserHelperConversationId(channel, shop, platformConversationId) {
  return `conv_${compactKey(channel)}_${compactKey(shop)}_${compactKey(platformConversationId)}`
}

export function browserHelperMessageId(channel, shop, conversationId, message = {}) {
  const platformMessageId = cleanText(message.platform_message_id || message.message_id)
  const stable = platformMessageId || stableHash(`${conversationId}|${message.sender_type}|${message.content || message.text}|${message.sent_at}`)
  return `msg_${compactKey(channel)}_${compactKey(shop)}_${compactKey(stable)}`
}

function senderType(value) {
  const text = cleanText(value).toLowerCase()
  if (['buyer', 'customer', 'client', 'user'].includes(text)) return 'customer'
  if (['seller', 'shop', 'operator', 'admin'].includes(text)) return 'shop'
  if (text === 'ai') return 'ai'
  return 'system'
}

function normalizedKeyword(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function inferBrowserSenderType(channel, message = {}) {
  const base = senderType(message.sender_type)
  if (channel !== 'tiktok') return base
  const body = normalizedKeyword(message.content || message.text)
  if (!body) return base
  if (
    body.includes('da het thoi gian cho cuoc tro chuyen') ||
    body.includes('hien thi doan chat da dong') ||
    body.includes('khach lau khong mua')
  ) return 'system'
  if (
    body.includes('ben shop') ||
    body.startsWith('da shop') ||
    body.includes('shop huy van') ||
    body.includes('cam on ban da dat hang') ||
    body.includes('hay xac nhan dia chi') ||
    body.includes('id don hang') ||
    body.includes('trang thai da') ||
    body.includes('da gui tep dinh kem')
  ) return 'shop'
  return base
}

function latestMessage(messages = []) {
  return [...messages]
    .sort((a, b) => cleanText(a.sent_at || a.created_at).localeCompare(cleanText(b.sent_at || b.created_at)))
    .pop() || {}
}

function conversationCustomerName(conversation = {}, last = {}) {
  return cleanText(
    conversation.customer_name ||
    conversation.buyer_name ||
    conversation.sender_name ||
    last.customer_name ||
    last.buyer_name ||
    (senderType(last.sender_type) === 'customer' ? last.sender_name : '')
  )
}

function customerNameFromMessages(messages = []) {
  for (const message of messages) {
    const type = senderType(message.sender_type)
    const name = cleanText(message.customer_name || message.buyer_name || (type === 'customer' ? message.sender_name : ''))
    if (name) return name
  }
  return ''
}

function mediaItems(message = {}) {
  return Array.isArray(message.media_items)
    ? message.media_items
    : (Array.isArray(message.attachments) ? message.attachments : [])
}

function firstMediaText(message = {}, keys = []) {
  for (const item of mediaItems(message)) {
    if (!item || typeof item !== 'object') continue
    for (const key of keys) {
      const value = cleanText(item[key])
      if (value) return value
    }
  }
  return ''
}

function messageOrderId(message = {}) {
  const direct = cleanText(message.order_id || message.order_sn || firstMediaText(message, ['order_id', 'order_sn', 'platform_order_id']))
  if (direct) return direct
  const body = cleanText(message.content || message.text)
  const match = body.match(/(?:đơn\s*hàng|don\s*hang|mã\s*đơn|ma\s*don|order)\s*[:#-]?\s*([A-Z0-9-]{8,})/iu)
  return cleanText(match?.[1])
}

function messageProductIds(message = {}) {
  const ids = []
  for (const value of [
    message.product_id,
    message.platform_product_id,
    message.platform_item_id,
    message.item_id,
    firstMediaText(message, ['product_id', 'platform_product_id', 'platform_item_id', 'item_id'])
  ]) {
    const text = cleanText(value)
    if (text && !ids.includes(text)) ids.push(text)
  }
  return ids
}

export async function pushBrowserHelperPayload(env, body = {}, options = {}) {
  const channel = cleanText(body.channel || body.platform).toLowerCase()
  const shop = cleanText(body.shop_id || body.shop)
  const conversations = Array.isArray(body.conversations) ? body.conversations : []
  const stamp = nowIso()
  if (!channel || !shop) {
    return { ok: false, status: 400, error_code: 'channel_shop_required', error_message: 'Thiếu kênh hoặc shop.' }
  }
  if (body.dry_run === true) {
    return {
      ok: true,
      dry_run: true,
      accepted_conversations: conversations.length,
      accepted_messages: conversations.reduce((sum, item) => sum + (Array.isArray(item.messages) ? item.messages.length : 0), 0),
      saved_messages: 0,
      skipped_duplicates: 0,
      conversations_touched: 0,
      new_messages: []
    }
  }

  let savedMessages = 0
  let skippedDuplicates = 0
  let pulledMessages = 0
  let conversationsTouched = 0
  const newMessages = []

  for (const conversation of conversations) {
    const platformConversationId = cleanText(conversation.platform_conversation_id || conversation.conversation_id)
    if (!platformConversationId) continue
    const messages = Array.isArray(conversation.messages) ? conversation.messages : []
    pulledMessages += messages.length
    conversationsTouched += 1
    const last = latestMessage(messages)
    const convId = browserHelperConversationId(channel, shop, platformConversationId)
    await saveConversation(env, {
      id: convId,
      channel,
      shop_id: shop,
      platform_conversation_id: platformConversationId,
      customer_id: cleanText(conversation.customer_id || last.customer_id || last.buyer_id || last.sender_id),
      customer_name: conversationCustomerName(conversation, last) || customerNameFromMessages(messages),
      last_message_text: cleanText(last.content || last.text),
      last_message_at: cleanText(last.sent_at || last.created_at) || stamp,
      status: 'open',
      shop_chat_mode: 'browser_helper',
      send_capability: 'manual_only',
      sync_capability: 'browser_helper',
      last_synced_at: stamp,
      last_success_at: stamp,
      pulled_conversations: 1,
      pulled_messages: messages.length,
      updated_at: stamp
    })

    for (const message of messages) {
      const inferredSenderType = inferBrowserSenderType(channel, message)
      const normalized = normalizeChatMessage({
        id: browserHelperMessageId(channel, shop, convId, message),
        channel,
        shop_id: shop,
        conversation_id: convId,
        customer_id: cleanText(message.customer_id || message.buyer_id || message.sender_id),
        sender_type: inferredSenderType,
        sender_name: inferredSenderType === 'shop'
          ? (cleanText(message.sender_name) || shop)
          : (inferredSenderType === 'system' ? 'Hệ thống TikTok' : cleanText(message.sender_name || message.buyer_name)),
        text: cleanText(message.content || message.text),
        attachments: message.attachments || message.media_items || [],
        status: 'synced',
        platform_message_id: cleanText(message.platform_message_id || message.message_id),
        order_id: messageOrderId(message),
        product_ids: messageProductIds(message),
        created_at: cleanText(message.sent_at || message.created_at) || stamp,
        updated_at: stamp,
        source: cleanText(body.connector || options.source || 'local_browser')
      })
      if (!normalized.text && !normalized.attachments.length) continue
      const existing = await findStoredMessageByDedupe(env, normalized)
      if (existing) {
        skippedDuplicates += 1
        await updateStoredMessage(env, existing.id, normalized)
      } else {
        const result = await mergeMessageIntoStore(env, normalized)
        savedMessages += 1
        newMessages.push(result.message)
      }
    }
  }

  await saveChatSyncState(env, {
    channel,
    shop_id: shop,
    last_synced_at: stamp,
    last_success_at: stamp,
    pulled_conversations: conversations.length,
    pulled_messages: pulledMessages,
    saved_messages: savedMessages,
    skipped_duplicates: skippedDuplicates
  })

  const pushResult = await notifyNewChatMessages(env, newMessages).catch(error => ({
    ok: false,
    error_code: 'chat_push_failed',
    error_message: error?.message || String(error)
  }))

  return {
    ok: true,
    status: 'ok',
    accepted_conversations: conversations.length,
    pulled_messages: pulledMessages,
    saved_messages: savedMessages,
    skipped_duplicates: skippedDuplicates,
    conversations_touched: conversationsTouched,
    new_messages: newMessages,
    push_notifications: pushResult
  }
}

export async function listBrowserHelperPollTargets(env, filters = {}) {
  const shopId = cleanText(filters.shop_id || filters.shop)
  const channel = cleanText(filters.channel || filters.platform).toLowerCase()
  const rows = await listConversations(env, { shop_id: shopId, channel, limit: 200 }).catch(() => [])
  const staleBefore = Date.now() - await getBrowserHelperPollInterval(env)
  return (rows || [])
    .filter(row => row.sync_capability === 'browser_helper')
    .filter(row => !row.last_synced_at || Date.parse(row.last_synced_at) < staleBefore)
    .map(row => ({
      conversation_id: row.id,
      platform_conversation_id: row.platform_conversation_id,
      customer_id: row.customer_id,
      channel: row.channel,
      shop_id: row.shop_id,
      last_synced_at: row.last_synced_at || '',
      last_message_at: row.last_message_at || ''
    }))
}

// Đọc thời gian polling của browser helper từ settings để TikTok/no-API không bị trễ cứng 3 phút.
export async function getBrowserHelperPollInterval(env) {
  const settings = await getChatSettings(env).catch(() => ({}))
  const seconds = Number(settings.browser_helper_poll_seconds || settings.poll_interval_seconds || 45) || 45
  return Math.min(Math.max(seconds, 30), 300) * 1000
}
