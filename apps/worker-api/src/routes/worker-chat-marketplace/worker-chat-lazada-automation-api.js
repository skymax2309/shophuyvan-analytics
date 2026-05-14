// NEO: Backend worker chat sàn - nhóm lazada-automation-api. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function normalizeAutomationMediaItems(source) {
  const explicit = []
  for (const key of ['media_items', 'media', 'attachments', 'files', 'images', 'cards']) {
    if (Array.isArray(source?.[key])) explicit.push(...source[key])
  }
  const shallowSource = { ...(source || {}) }
  const rawPayload = shallowSource.raw_payload && typeof shallowSource.raw_payload === 'object'
    ? shallowSource.raw_payload
    : null
  // Raw payload của automation có URL endpoint nội bộ Shopee; không quét media từ URL đó để tránh biến text thành file.
  delete shallowSource.raw_payload
  if (explicit.length) return normalizeMediaItems(explicit)
  return normalizeMediaItems([
    ...explicit,
    ...collectMediaItems(shallowSource),
    ...collectChatCards(shallowSource),
    ...collectChatCards(rawPayload)
  ])
}

function normalizeAutomationChatMessage(row, fallback = {}) {
  const source = row?.message && typeof row.message === 'object' ? { ...row, ...row.message } : (row || {})
  const mediaItems = normalizeAutomationMediaItems(source)
  const rawContent = firstText(source, [
    ['content'],
    ['text'],
    ['message_text'],
    ['message'],
    ['body'],
    ['caption'],
    ['title']
  ]) || mediaMessageSummary(mediaItems)
  const content = cleanText(rawContent)
  const conversationId = firstText(source, [
    ['conversation_id'],
    ['conversationId'],
    ['session_id'],
    ['thread_id'],
    ['chat_id']
  ]) || fallback.conversation_id
  const senderType = normalizeAutomationSenderType(source, fallback)
  if (!conversationId || !content || isChatTestConversation(conversationId)) return null
  if (isAutomationNoiseContent(content, cleanText(fallback.platform || source.platform).toLowerCase(), {
    senderType,
    rawPayload: row || source
  })) return null

  const senderName = firstText(source, [
    ['sender_name'],
    ['from_name'],
    ['author_name'],
    ['name']
  ]) || (senderType === 'shop' ? (fallback.shop || 'Shop') : (fallback.buyer_name || 'Khách hàng'))
  const buyerId = firstText(source, [
    ['buyer_id'],
    ['customer_id'],
    ['user_id']
  ]) || fallback.buyer_id
  const buyerName = firstText(source, [
    ['buyer_name'],
    ['customer_name'],
    ['user_name']
  ]) || (senderType === 'buyer' ? senderName : fallback.buyer_name)
  const sentAt = normalizeApiChatTimestamp(firstText(source, [
    ['sent_at'],
    ['created_at'],
    ['timestamp'],
    ['created_timestamp'],
    ['send_time']
  ])) || currentVnIsoTimestamp()
  const messageType = inferMessageType(firstText(source, [['message_type'], ['msg_type'], ['type']]) || 'text', mediaItems)
  const rawPayload = {
    source: 'automation',
    connector: cleanText(fallback.connector || 'local_browser'),
    payload: row || {}
  }
  const message = {
    platform: fallback.platform,
    shop: fallback.shop,
    shop_id: fallback.shop_id,
    conversation_id: conversationId,
    buyer_id: buyerId,
    buyer_name: buyerName || buyerId || 'Khách hàng',
    message_id: firstText(source, [['message_id'], ['msg_id'], ['id']])
      || `automation-${simpleHash(`${fallback.platform}|${fallback.shop}|${conversationId}|${sentAt}|${senderType}|${content}|${JSON.stringify(mediaItems).slice(0, 200)}`)}`,
    sender_type: senderType,
    sender_name: senderName,
    sender_id: firstText(source, [['sender_id'], ['from_id'], ['author_id']]),
    message_type: messageType,
    content,
    media_items: mediaItems,
    raw_payload: safeJsonStringify(rawPayload, '{}'),
    sent_at: sentAt,
    delivery_status: cleanText(source.delivery_status || source.status),
    platform_response: '',
    source: 'automation'
  }
  if (cleanText(message.platform).toLowerCase() === 'tiktok') {
    const fingerprint = tiktokAutomationMessageFingerprint(message)
    if (fingerprint) {
      // TikTok browser fallback không có message_id ổn định, nên core tự khóa fingerprint
      // để cùng một bubble không bị tạo bản ghi mới ở mỗi lần mở thread.
      message.message_id = `automation-tiktok-${simpleHash(fingerprint)}`
      rawPayload.fingerprint = fingerprint
      message.raw_payload = safeJsonStringify(rawPayload, '{}')
    }
  }
  // Browser/local helper của Shopee đôi khi quét trúng FAQ nội bộ hoặc prompt hệ thống; bỏ tại đây để khỏi bẩn D1.
  if (classifyShopeeSystemNoiseMessage(message)) return null
  return message
}

async function loadChatTransportShopForAutomation(env, platform, shop, shopId) {
  const platformKey = cleanText(platform).toLowerCase()
  const shopValue = cleanText(shop)
  const shopIdValue = cleanText(shopId)
  if (!platformKey || (!shopValue && !shopIdValue)) return null
  const where = ['platform = ?']
  const params = [platformKey]
  if (shopIdValue && shopValue) {
    where.push('(api_shop_id = ? OR shop_name = ? OR user_name = ?)')
    params.push(shopIdValue, shopValue, shopValue)
  } else if (shopIdValue) {
    where.push('api_shop_id = ?')
    params.push(shopIdValue)
  } else {
    where.push('(shop_name = ? OR user_name = ? OR api_shop_id = ?)')
    params.push(shopValue, shopValue, shopValue)
  }
  return await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id, access_token, chat_access_token,
           CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 1 ELSE 0 END AS has_access_token,
           CASE WHEN chat_access_token IS NOT NULL AND chat_access_token != '' THEN 1 ELSE 0 END AS has_chat_access_token,
           token_expire_at, chat_token_expire_at, api_connected_at, api_refresh_expire_at, chat_api_connected_at, chat_api_refresh_expire_at
    FROM shops
    WHERE ${where.join(' AND ')}
    ORDER BY id DESC
    LIMIT 1
  `).bind(...params).first().catch(() => null)
}

async function ingestChatAutomationMessages(request, env, cors) {
  const access = await requireChatAutomationAccess(request, env, cors)
  if (!access.allowed) return access.response
  await ensureChatTables(env)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return json({ status: 'error', error: 'invalid_payload', message: 'Payload automation không hợp lệ.' }, cors, 400)
  }

  const platform = cleanText(body.platform || body.marketplace || body.channel).toLowerCase()
  const shop = cleanText(body.shop || body.shop_name || body.seller_name || body.account || body.username)
  const shopId = cleanText(body.shop_id || body.shopId || body.seller_id || body.account_id || body.api_shop_id)
  if (!platform || !shop) {
    return json({
      status: 'error',
      error: 'missing_shop',
      message: 'Automation cần gửi platform và shop để OMS ghép đúng cửa hàng.'
    }, cors, 400)
  }
  if (platform === 'lazada') {
    return json({
      status: 'blocked',
      error: 'lazada_automation_removed',
      message: 'Lazada đã bỏ luồng Chrome automation. Chỉ nhận session và tin nhắn từ IM API chính thức để tránh lệch session.'
    }, cors, 409)
  }

  const transportShop = await loadChatTransportShopForAutomation(env, platform, shop, shopId)
  const transport = resolveChatTransportForShop(transportShop || {
    platform,
    shop_name: shop,
    api_shop_id: shopId,
    has_access_token: 0
  })
  const allowApiShopBrowser = body.allow_api_shop_browser === true || body.allowApiShopBrowser === true
  if (transport.transport === CHAT_TRANSPORT_API && !allowApiShopBrowser) {
    return json({
      status: 'blocked',
      error: 'api_shop_uses_api_chat',
      transport: transport.transport,
      worker: transport.worker,
      message: 'Shop có API chat đang dùng api_chat_worker, không nhập dữ liệu Chrome automation để tránh tách trùng hội thoại.',
      note: transport.note
    }, cors, 409)
  }
  const scanPolicy = resolveChatScanPolicy({ platform, shop, shop_id: shopId, transport: transport.transport })

  let conversations = Array.isArray(body.conversations) ? body.conversations : []
  if (!conversations.length && body.conversation && typeof body.conversation === 'object') conversations = [body.conversation]
  if (!conversations.length && Array.isArray(body.messages)) conversations = [{ ...body, messages: body.messages }]
  if (!conversations.length) {
    return json({ status: 'error', error: 'missing_messages', message: 'Chưa có hội thoại hoặc tin nhắn để nhập vào OMS.' }, cors, 400)
  }

  const dryRun = body.dry_run === true || body.dryRun === true
  const connector = cleanText(body.connector || body.source || 'local_browser')
  let receivedMessages = 0
  let acceptedMessages = 0
  let skippedMessages = 0
  let savedMessages = 0
  const samples = []

  for (const conversation of conversations.slice(0, 100)) {
    const conversationId = cleanText(conversation?.conversation_id || conversation?.conversationId || conversation?.session_id || conversation?.thread_id || conversation?.chat_id)
    const fallback = {
      platform,
      shop,
      shop_id: shopId || cleanText(conversation?.shop_id || conversation?.shopId),
      conversation_id: conversationId,
      buyer_id: cleanText(conversation?.buyer_id || conversation?.customer_id || conversation?.user_id),
      buyer_name: cleanText(conversation?.buyer_name || conversation?.customer_name || conversation?.user_name || conversation?.name),
      connector
    }
    const messages = automationMessagesFromConversation(conversation)
    const normalizedMessages = []
    for (const item of messages.slice(0, 500)) {
      if (receivedMessages >= 1000) break
      receivedMessages += 1
      const message = normalizeAutomationChatMessage(item, fallback)
      if (!message) {
        skippedMessages += 1
        continue
      }
      normalizedMessages.push(message)
    }
    const dedupedBatch = platform === 'tiktok'
      ? dedupeTikTokAutomationMessages(normalizedMessages)
      : { messages: normalizedMessages, skipped: 0 }
    skippedMessages += Number(dedupedBatch.skipped || 0)
    for (const message of dedupedBatch.messages) {
      acceptedMessages += 1
      if (samples.length < 5) {
        samples.push({
          platform: message.platform,
          shop: message.shop,
          conversation_id: message.conversation_id,
          sender_type: message.sender_type,
          content: limitText(message.content, 160),
          sent_at: message.sent_at
        })
      }
      if (!dryRun && await saveApiChatMessage(env, message)) savedMessages += 1
    }
    if (!dryRun && platform === 'tiktok' && conversationId) {
      await cleanupTikTokAutomationConversation(env, {
        platform,
        shop,
        shop_id: fallback.shop_id,
        conversation_id: conversationId
      }, 'automation').catch(() => null)
    }
  }

  return json({
    status: 'ok',
    source: access.source,
    dry_run: dryRun,
    connector,
    transport: transport.transport,
    scan_policy: scanPolicy,
    received_conversations: conversations.length,
    received_messages: receivedMessages,
    accepted_messages: acceptedMessages,
    skipped_messages: skippedMessages,
    saved_messages: dryRun ? 0 : savedMessages,
    sample: samples
  }, cors)
}

async function cleanupTikTokAutomationDuplicates(request, env, cors) {
  const admin = await requireAdminPermission(request, env, 'chat.reply')
  if (!admin.allowed) return admin.response

  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
  const url = new URL(request.url)
  const shop = cleanText(body.shop || body.shop_name || url.searchParams.get('shop'))
  const limit = Math.max(1, Math.min(500, Number(body.limit || url.searchParams.get('limit') || 200) || 200))
  const where = [`lower(platform) = 'tiktok'`]
  const params = []
  if (shop) {
    where.push('shop = ?')
    params.push(shop)
  }
  const { results } = await env.DB.prepare(`
    SELECT shop, conversation_id
    FROM marketplace_chat_conversations
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT ?
  `).bind(...params, limit).all().catch(() => ({ results: [] }))

  let deleted = 0
  let affected = 0
  for (const row of results || []) {
    const outcome = await cleanupTikTokAutomationConversation(env, {
      platform: 'tiktok',
      shop: cleanText(row?.shop),
      conversation_id: cleanText(row?.conversation_id)
    }, 'automation').catch(() => ({ deleted: 0 }))
    const count = Number(outcome?.deleted || 0)
    deleted += count
    if (count > 0) affected += 1
  }

  return json({
    status: 'ok',
    scanned: Array.isArray(results) ? results.length : 0,
    affected_conversations: affected,
    deleted_messages: deleted,
    shop: shop || ''
  }, cors)
}

function lazadaAppKey(env) {
  return cleanText(env.LAZADA_CHAT_APP_KEY)
}

function lazadaAppSecret(env) {
  return cleanText(env.LAZADA_CHAT_SECRET)
}

function lazadaApiHost(env) {
  return cleanText(env.LAZADA_API_HOST || 'https://api.lazada.vn').replace(/\/+$/, '')
}

function lazadaChatAccessToken(shop = {}) {
  return cleanText(shop.chat_access_token)
}

function hasLazadaChatAppConfig(env) {
  return Boolean(lazadaAppKey(env) && lazadaAppSecret(env))
}

async function signLazadaChatParams(env, path, accessToken, params = {}) {
  const base = {
    app_key: lazadaAppKey(env),
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    access_token: cleanText(accessToken),
    ...params
  }
  Object.keys(base).forEach(key => {
    if (base[key] === undefined || base[key] === null || base[key] === '') delete base[key]
  })
  const signString = path + Object.keys(base).sort().map(key => `${key}${base[key]}`).join('')
  const sign = (await signHmacHex(lazadaAppSecret(env), signString)).toUpperCase()
  return { ...base, sign }
}

async function callLazadaChatPath(env, shop, path, params = {}, options = {}) {
  if (!hasLazadaChatAppConfig(env)) {
    return {
      ok: false,
      status: 0,
      data: {
        error: 'missing_chat_app_config',
        message: 'Worker chưa có LAZADA_CHAT_APP_KEY hoặc LAZADA_CHAT_SECRET nên chưa gọi được Lazada IM app riêng.'
      }
    }
  }
  const accessToken = lazadaChatAccessToken(shop)
  if (!accessToken) {
    return {
      ok: false,
      status: 0,
      data: {
        error: 'missing_chat_token',
        message: 'Shop Lazada chưa có chat_access_token từ app IM Chat riêng.'
      }
    }
  }
  const finalParams = await signLazadaChatParams(env, path, accessToken, params)
  const url = `${lazadaApiHost(env)}/rest${path}?${new URLSearchParams(finalParams)}`
  const method = cleanText(options.method || 'GET').toUpperCase() || 'GET'
  const res = await fetch(url, { method })
  const rawText = await res.text().catch(() => '')
  let data = {}
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { message: rawText.slice(0, 500) }
    }
  }
  const code = cleanText(data.code)
  const envelope = lazadaChatMessageResponse(data)
  const errorCode = cleanText(envelope.err_code)
  const errorMessage = cleanText(envelope.err_message)
  const looksLikeErrorMessage = /error|failed|invalid|denied|not allow|not opened|not authorized|illegal|exception/i.test(errorMessage.toLowerCase())
  const ok = res.ok
    && (!code || code === '0')
    && envelope.success !== false
    && (!errorCode || errorCode === '0')
    && !looksLikeErrorMessage
  if (!ok && !cleanText(data.error || data.message)) {
    data.message = `Lazada IM ${path} trả HTTP ${res.status} nhưng không có nội dung lỗi.`
  }
  return { ok, status: res.status, data }
}

Object.assign(globalThis, {
  normalizeAutomationMediaItems,
  normalizeAutomationChatMessage,
  loadChatTransportShopForAutomation,
  ingestChatAutomationMessages,
  cleanupTikTokAutomationDuplicates,
  lazadaAppKey,
  lazadaAppSecret,
  lazadaApiHost,
  lazadaChatAccessToken,
  hasLazadaChatAppConfig,
  signLazadaChatParams,
  callLazadaChatPath
})
