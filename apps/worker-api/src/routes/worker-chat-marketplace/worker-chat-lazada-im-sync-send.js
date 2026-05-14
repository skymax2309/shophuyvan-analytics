// NEO: Backend worker chat sàn - nhóm lazada-im-sync-send. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function lazadaContentPayload(value) {
  if (value && typeof value === 'object') return value
  const text = cleanText(value)
  if (!text) return {}
  if (text.startsWith('{') || text.startsWith('[')) {
    const parsed = safeJsonParse(text, null)
    if (parsed && typeof parsed === 'object') return parsed
  }
  return { txt: text }
}

function lazadaSessionId(row = {}) {
  return firstText(row, [
    ['session_id'], ['sessionId'], ['conversation_id'], ['conversationId'], ['id']
  ])
}

function lazadaMessageText(payload = {}, row = {}) {
  return firstText(payload, [
    ['txt'], ['text'], ['message'], ['msg'], ['body'], ['content', 'txt'], ['content', 'text']
  ]) || firstText(row, [
    ['txt'], ['text'], ['message'], ['msg'], ['body'], ['message_text']
  ])
}

function normalizeLazadaApiChatMessage(row, fallback = {}) {
  const payload = lazadaContentPayload(row?.content || row?.message_content || row?.msg_content)
  const sessionId = lazadaSessionId(row) || fallback.conversation_id
  const templateId = firstText(row, [['template_id'], ['templateId'], ['message_template_id']])
  const itemId = firstText(payload, [['item_id'], ['itemId'], ['product_id'], ['productId']])
  const orderId = firstText(payload, [['order_id'], ['orderId'], ['order_sn'], ['orderSn']])
  const imageUrl = firstText(payload, [['img_url'], ['image_url'], ['image'], ['url'], ['pic_url']])
  const text = lazadaMessageText(payload, row)
  const mediaItems = []
  if (imageUrl && !itemId) {
    mediaItems.push({
      type: 'image',
      url: imageUrl,
      thumbnail_url: imageUrl,
      mime_type: '',
      name: 'Ảnh Lazada',
      size: 0,
      source: 'lazada_chat'
    })
  }
  if (itemId) {
    mediaItems.push({
      type: 'product',
      url: firstText(payload, [['item_url'], ['product_url'], ['url'], ['link']]),
      thumbnail_url: imageUrl,
      mime_type: '',
      name: firstText(payload, [['item_name'], ['product_name'], ['name'], ['title']]) || `Sản phẩm Lazada ${itemId}`,
      size: 0,
      item_id: itemId,
      shop_id: fallback.shop_id,
      source: 'lazada_chat_card'
    })
  }
  if (orderId) {
    mediaItems.push({
      type: 'order',
      url: `/pages/oms-dashboard.html?focus_order=${encodeURIComponent(orderId)}`,
      thumbnail_url: '',
      mime_type: '',
      name: `Đơn hàng ${orderId}`,
      size: 0,
      order_sn: orderId,
      source: 'lazada_chat_card'
    })
  }
  const content = text
    || (orderId ? `Khách gửi thẻ đơn hàng ${orderId}` : '')
    || (itemId ? `Khách gửi thẻ sản phẩm ${itemId}` : '')
    || (imageUrl ? 'Khách gửi hình ảnh' : '')
  const fromType = cleanText(firstText(row, [['from_account_type'], ['from_type'], ['sender_type'], ['account_type']])).toLowerCase()
  const senderType = fromType === '2' || fromType.includes('seller') || fromType.includes('shop')
    ? 'seller'
    : (fromType === '1' || fromType.includes('buyer') || fromType.includes('customer') ? 'buyer' : '')
  const generic = {
    ...row,
    session_id: sessionId,
    conversation_id: sessionId,
    message_id: firstText(row, [['message_id'], ['messageId'], ['msg_id'], ['id']]),
    content: { text: content },
    from_id: firstText(row, [['from_account_id'], ['from_id'], ['sender_id']]),
    to_id: firstText(row, [['to_account_id'], ['to_id'], ['receiver_id']]),
    from_user_name: firstText(row, [['from_account_name'], ['from_name'], ['sender_name']]),
    to_user_name: firstText(row, [['to_account_name'], ['to_name'], ['receiver_name']]),
    sender_type: senderType,
    message_type: templateId ? `template_${templateId}` : firstText(row, [['message_type'], ['msg_type'], ['type']]) || 'text',
    media_items: mediaItems,
    send_time: firstText(row, [['send_time'], ['sendTime'], ['timestamp'], ['created_at'], ['created_time']])
  }
  const message = normalizeApiChatMessage(generic, fallback)
  if (message && mediaItems.length) {
    message.media_items = normalizeMediaItems([...(message.media_items || []), ...mediaItems])
  }
  return message
}

function hasLazadaImPermissionError(attempts = []) {
  const text = attempts.map(item => [
    item.code,
    item.error,
    item.message
  ].map(cleanText).join(' ')).join(' ').toLowerCase()
  return /(permission|not opened|not open|not authorized|unauthorized|api package|illegal api|api not found|invalid api|isv.permission|isp.permission|access denied)/i.test(text)
}

async function loadLazadaChatShopForConversation(env, conversation) {
  if (cleanText(conversation?.platform).toLowerCase() !== 'lazada') return null
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const aliases = await resolveProductContextShopAliases(env, 'lazada', shop, shopId)
  const values = [...new Set([shop, shopId, ...aliases].map(cleanText).filter(Boolean))]
  if (!values.length) return null
  const placeholders = values.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id,
           access_token, token_expire_at,
           chat_access_token, chat_refresh_token, chat_token_expire_at,
           chat_api_connected_at, chat_api_refresh_expire_at, chat_api_redirect_url,
           api_partner_id, api_partner_key, api_redirect_url
    FROM shops
    WHERE platform = 'lazada'
      AND chat_access_token IS NOT NULL AND chat_access_token != ''
      AND (shop_name IN (${placeholders}) OR user_name IN (${placeholders}) OR api_shop_id IN (${placeholders}))
    ORDER BY CASE WHEN api_shop_id = ? THEN 0 ELSE 1 END,
             CASE WHEN shop_name = ? OR user_name = ? THEN 0 ELSE 1 END,
             id DESC
    LIMIT 5
  `).bind(...values, ...values, ...values, shopId, shop, shop).all()
  return dedupeApiShopRows(results || [])[0] || null
}

function lazadaChatSendError(result) {
  const envelope = lazadaChatMessageResponse(result?.data || {})
  return cleanText(envelope.err_message || result?.data?.message || result?.data?.error || envelope.err_code || result?.data?.code || result?.status)
}

function lazadaChatMessageResponse(data = {}) {
  const response = (data.data && typeof data.data === 'object' ? data.data : null)
    || (data.result && typeof data.result === 'object' ? data.result : null)
    || (data.response && typeof data.response === 'object' ? data.response : null)
    || {}
  return {
    success: response.success === false ? false : (data.success === false ? false : true),
    err_code: cleanText(response.err_code || response.errCode || data.err_code || data.errCode),
    err_message: cleanText(response.err_message || response.errMessage || data.err_message || data.errMessage),
    message_id: cleanText(response.message_id || response.messageId || response.msg_id || data.request_id),
    message_type: cleanText(response.template_id || response.templateId || response.message_type),
    created_timestamp: response.current_time || response.currentTime || response.send_time || response.timestamp || '',
    raw: data
  }
}

async function sendLazadaChatOfficial(env, conversation, options = {}) {
  // Lazada IM dùng session_id; chỉ gửi text khi đã có quyền In-house IM Chat để tránh lưu nhầm là đã gửi lên sàn.
  const shop = await loadLazadaChatShopForConversation(env, conversation)
  if (!shop) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_lazada_token', message: 'Shop Lazada chưa có token API để gửi chat chính thức.' }
    }
  }
  const sessionId = await resolveLazadaOfficialConversationId(env, conversation)
  if (!sessionId) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_session_id', message: 'Hội thoại Lazada chưa có session_id nên chưa gửi được qua IM API.' }
    }
  }
  const content = cleanText(options.content)
  if (!content) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_text', message: 'Thiếu nội dung text để gửi qua Lazada IM.' }
    }
  }
  const path = '/im/message/send'
  const payload = { session_id: sessionId, template_id: 1, txt: content }
  if (options.dry_run) return { ok: true, status: 200, dry_run: true, path, payload, shop }
  const result = await callLazadaChatPath(env, shop, path, payload, { method: 'POST' })
  return { ...result, path, payload, shop, session_id: sessionId }
}

async function syncLazadaChatShop(env, shop, options = {}) {
  const diagnostic = options.diagnostic === true
  const attempts = []
  const requestedLimit = Math.min(Math.max(Number(options.limit || 20) || 20, 1), 100)
  const targetBuyerName = cleanText(options.buyer_name || options.buyerName)
  const targetBuyerKey = normalizeKeywordText(targetBuyerName)
  const conversationLimit = targetBuyerKey
    ? Math.min(Math.max(requestedLimit, 50), 100)
    : (options.active_only ? Math.min(requestedLimit, 10) : Math.min(requestedLimit, 50))
  const base = {
    platform: 'lazada',
    shop: shop.shop_name || shop.user_name || shop.api_shop_id,
    shop_id: cleanText(shop.api_shop_id)
  }
  shop.access_token = shop.access_token || lazadaChatAccessToken(shop)
  if (!shop.access_token) {
    return { ...base, status: 'skipped', reason: 'Shop Lazada chưa có token API.', pulled_messages: 0, attempts }
  }

  if (!hasLazadaChatAppConfig(env)) {
    return {
      ...base,
      status: 'config_missing',
      reason: 'Worker chưa có LAZADA_CHAT_APP_KEY hoặc LAZADA_CHAT_SECRET nên chưa gọi được app chat Lazada riêng.',
      pulled_messages: 0,
      attempts
    }
  }
  if (!lazadaChatAccessToken(shop)) {
    return {
      ...base,
      status: 'chat_token_missing',
      reason: 'Shop Lazada chưa ủy quyền app IM Chat riêng nên chưa có chat_access_token để kéo hội thoại.',
      pulled_messages: 0,
      attempts
    }
  }
  let sessionRows = []
  let sessionIds = []
  const sessionStartTime = lazadaSessionListStartTime(options.session_days || 30)
  if (options.active_only && options.conversation_id && !isChatTestConversation(options.conversation_id)) {
    sessionIds = [cleanText(options.conversation_id)]
  } else {
    // Lazada IM dùng session_id thay cho conversation_id; API này bắt buộc có start_time nên luôn truyền cửa sổ gần đây để tránh lỗi thiếu tham số trên production.
    const sessionParamSets = [
      { page_size: conversationLimit, page_no: 1, start_time: sessionStartTime },
      { pageSize: conversationLimit, pageNo: 1, start_time: sessionStartTime },
      { limit: conversationLimit, offset: 0, start_time: sessionStartTime }
    ]
    for (const params of sessionParamSets) {
      const result = await callLazadaChatPath(env, shop, '/im/session/list', params)
        .catch(error => ({ ok: false, status: 0, data: { error: 'fetch_failed', message: error.message } }))
      attempts.push({ path: '/im/session/list', params, ...compactApiError(result.data), http_status: result.status })
      if (!result.ok) continue
      const rows = firstObjectArray(result.data, ['session_list', 'sessions', 'sessionList', 'list', 'items', 'data', 'result'])
      sessionRows = rows
      sessionIds = rows.map(lazadaSessionId).filter(id => id && !isChatTestConversation(id))
      break
    }
  }

  if (!options.active_only && options.conversation_id && !isChatTestConversation(options.conversation_id)) {
    sessionIds.unshift(cleanText(options.conversation_id))
  }
  sessionIds = [...new Set(sessionIds)].slice(0, conversationLimit)

  let pulledMessages = 0
  let workingMessagePath = ''
  await mapWithConcurrency(sessionIds, options.active_only ? 1 : 4, async sessionId => {
    const sessionRow = sessionRows.find(row => lazadaSessionId(row) === cleanText(sessionId)) || {}
    const messageFallback = {
      ...base,
      conversation_id: sessionId,
      buyer_id: firstText(sessionRow, [['buyer_id'], ['buyerId'], ['to_account_id'], ['from_account_id'], ['user_account_id']]),
      buyer_name: firstText(sessionRow, [['buyer_name'], ['buyerName'], ['title'], ['user_name'], ['account_name']])
    }
    const messageParamSets = [
      { session_id: sessionId, page_size: options.active_only ? Math.min(requestedLimit, 20) : 20, start_time: sessionStartTime },
      { sessionId: sessionId, pageSize: options.active_only ? Math.min(requestedLimit, 20) : 20, start_time: sessionStartTime },
      { session_id: sessionId, limit: options.active_only ? Math.min(requestedLimit, 20) : 20, start_time: sessionStartTime }
    ]
    for (const params of messageParamSets) {
      const result = await callLazadaChatPath(env, shop, '/im/message/list', params)
        .catch(error => ({ ok: false, status: 0, data: { error: 'fetch_failed', message: error.message } }))
      attempts.push(diagnostic
        ? { path: '/im/message/list', session_id: sessionId, params, ...compactApiError(result.data), http_status: result.status }
        : { path: '/im/message/list', session_id: sessionId, ...compactApiError(result.data), http_status: result.status })
      if (!result.ok) continue
      const rows = firstObjectArray(result.data, ['message_list', 'messages', 'messageList', 'list', 'items', 'data', 'result'])
      let saved = 0
      for (const row of rows) {
        const message = normalizeLazadaApiChatMessage(row, messageFallback)
        if (!message) continue
        if (await saveApiChatMessage(env, message)) saved++
      }
      pulledMessages += saved
      workingMessagePath = '/im/message/list'
      break
    }
  })

  const lastError = attempts.filter(item => item.code || item.error || item.message).slice(-1)[0] || null
  const permissionRequired = hasLazadaImPermissionError(attempts)
  return {
    ...base,
    status: pulledMessages
      ? 'ok'
      : (permissionRequired ? 'permission_required' : (sessionIds.length ? 'no_messages' : 'no_conversation')),
    reason: permissionRequired
      ? 'Shop Lazada đã có token API, nhưng app Lazada hiện tại chưa được cấp quyền In-house IM Chat cho các endpoint /im/session/list và /im/message/list.'
      : '',
    pulled_conversations: sessionIds.length,
    pulled_messages: pulledMessages,
    working_message_path: workingMessagePath,
    last_error: lastError,
    attempts: diagnostic ? attempts : attempts.slice(-6)
  }
}

Object.assign(globalThis, {
  lazadaContentPayload,
  lazadaSessionId,
  lazadaMessageText,
  normalizeLazadaApiChatMessage,
  hasLazadaImPermissionError,
  loadLazadaChatShopForConversation,
  lazadaChatSendError,
  lazadaChatMessageResponse,
  sendLazadaChatOfficial,
  syncLazadaChatShop
})
