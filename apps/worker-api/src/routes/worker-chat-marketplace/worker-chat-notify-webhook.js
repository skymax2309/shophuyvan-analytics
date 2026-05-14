// NEO: Backend worker chat sàn - nhóm notify-webhook. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function legacyOrderNotificationBody(rows) {
  const row = Array.isArray(rows) ? rows[0] || {} : rows || {}
  const platform = cleanText(row.platform).toUpperCase() || 'OMS'
  const shop = cleanText(row.shop)
  const status = orderNotificationStatus(row)
  const carrier = cleanText(row.shipping_carrier)
  const tracking = cleanText(row.tracking_number)
  const parts = [
    platform,
    shop && `Shop ${shop}`,
    status && `Trạng thái ${status}`,
    carrier && `ĐVVC ${carrier}`,
    tracking && `Mã vận đơn ${tracking}`
  ].filter(Boolean)
  return parts.join(' - ') || 'Có đơn hàng cần xử lý.'
}

function orderNotificationMoney(row) {
  const amount = Number(row?.revenue || row?.total_amount || row?.payment_amount || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`
}

function orderNotificationLine(row, reason = '') {
  const orderId = cleanText(row.order_id || row.order_sn || row.orderId) || 'chưa rõ mã'
  const shop = cleanText(row.shop)
  const status = orderNotificationStatusLabel(row)
  const kind = orderKindLabel(orderNotificationKind(row, reason))
  const carrier = cleanText(row.shipping_carrier)
  const tracking = cleanText(row.tracking_number)
  const money = orderNotificationMoney(row)
  return [
    `${orderId}: ${kind}`,
    status,
    shop && `shop ${shop}`,
    carrier,
    tracking && `MVD ${tracking}`,
    money
  ].filter(Boolean).join(' - ')
}

function orderNotificationTitle(rows, reason = '') {
  const list = Array.isArray(rows) ? rows : []
  const countsText = orderNotificationCountText(orderNotificationCounts(list, reason))
  if (list.length > 1) return `OMS: ${list.length} đơn hàng - ${countsText || 'có cập nhật'}`
  const row = list[0] || {}
  const orderId = cleanText(row.order_id || row.order_sn || row.orderId)
  const kind = orderNotificationKind(row, reason)
  return `OMS: ${orderKindLabel(kind)} ${orderId || 'cần kiểm tra'}`
}

function orderNotificationBody(rows) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean)
  if (!list.length) return 'Có đơn hàng cần xử lý.'
  const countsText = orderNotificationCountText(orderNotificationCounts(list))
  const sample = list.slice(0, 3).map(row => orderNotificationLine(row)).join('; ')
  const more = list.length > 3 ? `; còn ${list.length - 3} đơn khác` : ''
  return [`Tổng ${list.length} đơn`, countsText, sample && `${sample}${more}`].filter(Boolean).join('. ')
}

async function notifyOrderSubscribers(env, rows = [], options = {}) {
  await ensureChatTables(env)
  const list = (Array.isArray(rows) ? rows : [rows])
    .filter(Boolean)
    .map(row => ({
      ...row,
      order_id: cleanText(row.order_id || row.order_sn || row.orderId),
      platform: cleanText(row.platform).toLowerCase(),
      shop: cleanText(row.shop),
      _push_reason: cleanText(row._push_reason || options.reason || '')
    }))
    .filter(row => row.order_id)
  if (!list.length) return { sent: 0, total: 0, skipped: true }
  const settings = await getChatSettings(env)
  if (!Number(settings.notify_enabled)) return { sent: 0, total: 0, skipped: true }

  const first = list[0]
  const reason = cleanText(options.reason || first._push_reason || 'changed')
  const keyedList = list.map(row => ({
    ...row,
    _push_dedupe_key: orderPushDedupeKey(row, row._push_reason || reason)
  }))
  const accepted = await reservePushDedupeKeys(env, keyedList.map(row => row._push_dedupe_key), 'order')
  const freshList = keyedList.filter(row => accepted.has(row._push_dedupe_key))
  if (!freshList.length) return { sent: 0, total: 0, notified: 0, skipped: true, duplicate: true }

  const freshFirst = freshList[0]
  const title = orderNotificationTitle(freshList, reason)
  const body = orderNotificationBody(freshList)
  const tag = freshList.length === 1
    ? `shv-order-${freshFirst.order_id}-${simpleHash(orderNotificationStatus(freshFirst))}`
    : `shv-orders-${simpleHash(freshList.map(row => row._push_dedupe_key).join('|'))}`
  const url = `/pages/oms-dashboard.html?focus_order=${encodeURIComponent(freshFirst.order_id)}`
  const queued = await queuePushEvent(env, {
    event_type: 'order',
    title,
    body,
    tag,
    url,
    dedupe_key: `order-batch:${simpleHash(freshList.map(row => row._push_dedupe_key).join('|'))}`,
    data: {
      type: 'order',
      reason,
      order_id: freshFirst.order_id,
      order_ids: freshList.map(row => row.order_id),
      platform: freshFirst.platform,
      shop: freshFirst.shop,
      status: orderNotificationStatus(freshFirst),
      status_label: orderNotificationStatusLabel(freshFirst),
      categories: orderNotificationCounts(freshList, reason),
      dedupe_keys: freshList.map(row => row._push_dedupe_key),
      url
    }
  })
  if (!queued || queued.duplicate) {
    return { sent: 0, total: 0, notified: 0, skipped: true, duplicate: true, event_id: queued?.id || null }
  }
  // Với các batch sync nền, chỉ cần đưa sự kiện vào hàng đợi để tránh vượt quota subrequest của Worker.
  if (options.deliver_now === false) {
    return { sent: 0, total: 0, notified: freshList.length, queued: true, event_id: queued.id }
  }
  const delivery = await sendPushToEnabledSubscribers(env)
  return { ...delivery, event_id: queued.id, notified: freshList.length }
}

async function latestNotificationEvent(env, cors) {
  await ensureChatTables(env)
  const row = await env.DB.prepare(`
    SELECT id, event_type, title, body, tag, url, dedupe_key, data, created_at
    FROM marketplace_push_events
    WHERE dedupe_key != ''
      AND datetime(created_at) >= datetime('now', '+7 hours', '-2 minutes')
    ORDER BY id DESC
    LIMIT 1
  `).first()
  return json({ status: 'ok', event: row ? pushEventFromRow(row) : null }, cors)
}

async function latestConversationForMessage(env, message) {
  if (!message?.platform || !message?.conversation_id) return null
  const shop = cleanText(message.shop)
  const shopId = cleanText(message.shop_id)
  return env.DB.prepare(`
    SELECT id, platform, shop, shop_id, conversation_id, buyer_id, buyer_name,
           last_message, last_message_at, unread_count, status, source, updated_at, created_at
    FROM marketplace_chat_conversations
    WHERE platform = ? AND conversation_id = ?
      AND (? = '' OR shop IN (?, ?) OR shop_id IN (?, ?))
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 1
  `).bind(message.platform, message.conversation_id, shop || shopId, shop, shopId, shop, shopId).first()
}

async function enrichChatConversationFromApi(env, message) {
  if (message?.platform !== 'shopee' || message?.has_real_content || isChatTestConversation(message?.conversation_id)) return null
  const shop = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id, access_token, token_expire_at,
           api_partner_id, api_partner_key, api_redirect_url
    FROM shops
    WHERE platform = 'shopee'
      AND access_token IS NOT NULL AND access_token != ''
      AND (api_shop_id = ? OR shop_name = ? OR user_name = ?)
    LIMIT 1
  `).bind(message.shop_id || '', message.shop || '', message.shop || '').first()
  if (!shop) return null
  return syncShopeeChatShop(env, shop, {
    limit: 10,
    diagnostic: false,
    conversation_id: message.conversation_id
  }).catch(() => null)
}

async function notifyChatSubscribers(env, message) {
  await ensureChatTables(env)
  if (!message?.conversation_id || isChatTestConversation(message.conversation_id)) return { sent: 0, skipped: true }
  if (cleanText(message.sender_type).toLowerCase() === 'shop') return { sent: 0, skipped: true, own_message: true }
  const settings = await getChatSettings(env)
  if (!Number(settings.notify_enabled)) return { sent: 0, skipped: true }

  await enrichChatConversationFromApi(env, message)
  const latest = await latestConversationForMessage(env, message)
  const preview = cleanText(latest?.last_message || message.content)
  if (!preview || isChatNotice(preview)) return { sent: 0, skipped: true }

  const dedupeKey = chatPushDedupeKey(message, latest, preview)
  const accepted = await reservePushDedupeKeys(env, [dedupeKey], 'chat')
  if (!accepted.has(dedupeKey)) return { sent: 0, total: 0, skipped: true, duplicate: true }

  const buyer = cleanText(latest?.buyer_name || latest?.buyer_id || 'khách hàng')
  const platform = cleanText(latest?.platform || message.platform).toUpperCase() || 'OMS'
  const url = '/pages/profit-dashboard.html#chat'
  const queued = await queuePushEvent(env, {
    event_type: 'chat',
    title: `Tin nhắn mới từ ${buyer}`,
    body: `${platform} - ${preview}`.slice(0, 220),
    tag: `shv-chat-${latest?.conversation_id || message.conversation_id}-${simpleHash(preview)}`,
    url,
    dedupe_key: dedupeKey,
    data: {
      type: 'chat',
      id: latest?.id || '',
      conversation_id: latest?.conversation_id || message.conversation_id,
      platform: cleanText(latest?.platform || message.platform),
      shop: cleanText(latest?.shop || message.shop),
      dedupe_key: dedupeKey,
      url
    }
  })
  if (!queued || queued.duplicate) {
    return { sent: 0, total: 0, skipped: true, duplicate: true, event_id: queued?.id || null }
  }
  const delivery = await sendPushToEnabledSubscribers(env)
  return { ...delivery, event_id: queued.id }
}

function webhookChatContentText(source, mediaItems = []) {
  const direct = firstText(source, [
    ['chat', 'content', 'text'],
    ['chat', 'content', 'message'],
    ['chat', 'content', 'value'],
    ['chat', 'content', 'body'],
    ['chat', 'text'],
    ['chat', 'message'],
    ['data', 'message', 'content'],
    ['data', 'message', 'text'],
    ['data', 'message', 'message'],
    ['data', 'message', 'message_content'],
    ['data', 'message', 'body'],
    ['data', 'msg', 'content'],
    ['data', 'msg', 'text'],
    ['data', 'msg', 'message'],
    ['data', 'messages', 0, 'content'],
    ['data', 'messages', 0, 'text'],
    ['data', 'messages', 0, 'message'],
    ['data', 'msg_content'],
    ['data', 'text'],
    ['data', 'message_content'],
    ['data', 'message_body'],
    ['content', 'text'],
    ['content', 'message'],
    'text',
    'message',
    'msg_content',
    'message_content',
    'message_body'
  ])
  if (direct) return direct

  const orderSn = firstText(source, [
    ['chat', 'content', 'order_sn'],
    ['chat', 'source_content', 'order_sn'],
    ['data', 'content', 'content', 'order_sn'],
    ['data', 'content', 'source_content', 'order_sn'],
    ['data', 'source_content', 'order_sn']
  ])
  if (orderSn) return `Khách gửi thẻ đơn hàng ${orderSn}`

  const itemId = firstText(source, [
    ['chat', 'content', 'item_id'],
    ['chat', 'source_content', 'item_id'],
    ['data', 'content', 'content', 'item_id'],
    ['data', 'content', 'source_content', 'item_id'],
    ['data', 'source_content', 'item_id']
  ])
  if (itemId) return `Khách gửi thẻ sản phẩm ${itemId}`

  const type = firstText(source, [
    ['chat', 'message_type'],
    ['data', 'message_type'],
    ['message_type'],
    ['msg_type'],
    'type'
  ]).toLowerCase()
  const bundled = productArray(valueAt(source, ['chat', 'content', 'messages']))
  if (type.includes('bundle') && bundled.length) {
    return `Shopee gom ${bundled.length} tin tự động trong phiên chat`
  }
  if (type.includes('faq')) return 'Khách yêu cầu chat với người bán'

  return mediaMessageSummary(mediaItems)
}

function shouldSkipWebhookChatEvent(source) {
  const pushType = firstText(source, [['data', 'type'], 'type']).toLowerCase()
  if (pushType !== 'notification') return false
  const notificationType = firstText(source, [
    ['chat', 'type'],
    ['data', 'content', 'type']
  ]).toLowerCase()
  return ['mark_as_replied', 'mark_as_unreplied', 'read', 'typing'].includes(notificationType)
}

Object.assign(globalThis, {
  legacyOrderNotificationBody,
  orderNotificationMoney,
  orderNotificationLine,
  orderNotificationTitle,
  orderNotificationBody,
  notifyOrderSubscribers,
  latestNotificationEvent,
  latestConversationForMessage,
  enrichChatConversationFromApi,
  notifyChatSubscribers,
  webhookChatContentText,
  shouldSkipWebhookChatEvent
})
