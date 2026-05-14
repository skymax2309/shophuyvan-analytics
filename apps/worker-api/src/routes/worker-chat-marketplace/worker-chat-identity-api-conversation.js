// NEO: Backend worker chat sàn - nhóm identity-api-conversation. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function apiMessageContentText(source) {
  const content = source?.content
  const sourceContent = source?.source_content && typeof source.source_content === 'object' ? source.source_content : {}
  const mediaItems = normalizeMediaItems([...collectMediaItems(source), ...collectChatCards(source)])
  const messageType = firstText(source, [['message_type'], ['msg_type'], ['type']]).toLowerCase()
  if (content && typeof content === 'object') {
    const text = cleanText(content.text || content.value || content.message)
    if (text) return text
    // Ưu tiên media theo message_type để ảnh/video có source_content item_id không bị hiểu nhầm là thẻ sản phẩm.
    if (messageType.includes('image') || cleanText(content.image_url || content.url)) return 'Đã gửi hình ảnh'
    if (messageType.includes('video') || cleanText(content.video_url)) return 'Đã gửi video'
    if (messageType.includes('sticker') || cleanText(content.sticker_id || content.sticker_package_id)) return 'Đã gửi sticker'
    if (messageType.includes('emoji') || cleanText(content.emoji_id || content.emoji_url)) return 'Đã gửi emoji'
    const orderSn = cleanText(content.order_sn || sourceContent.order_sn)
    if (orderSn) return `Đã gửi thẻ đơn hàng ${orderSn}`
    const itemId = cleanText(content.item_id || sourceContent.item_id)
    if (itemId) return `Đã gửi thẻ sản phẩm ${itemId}`
    const jsonText = cleanText(JSON.stringify(content))
    if (jsonText && jsonText !== '{}') return jsonText
  }
  const text = firstText(source, [
    ['content', 'text'],
    ['content', 'value'],
    ['message_content', 'text'],
    ['message', 'content'],
    ['message', 'text'],
    ['text'],
    ['content'],
    ['message_content'],
    ['msg_content'],
    ['body']
  ])
  return text || mediaMessageSummary(mediaItems)
}

function normalizeApiChatMessage(row, fallback = {}) {
  const source = row?.message && typeof row.message === 'object' ? { ...row, ...row.message } : (row || {})
  const mediaItems = normalizeMediaItems([...collectMediaItems(source), ...collectChatCards(source)])
  const content = apiMessageContentText(source)
  const fromId = firstText(source, [['from_id'], ['sender_id'], ['sender', 'id']])
  const toId = firstText(source, [['to_id'], ['receiver_id'], ['receiver', 'id']])
  const fromName = firstText(source, [['from_user_name'], ['from_name'], ['sender_name'], ['sender', 'name']])
  const toName = firstText(source, [['to_user_name'], ['to_name'], ['receiver_name'], ['receiver', 'name']])
  const fromShopId = firstText(source, [['from_shop_id'], ['sender_shop_id'], ['sender', 'shop_id']])
  const shopIds = new Set([fallback.shop_id, fallback.shop].map(cleanText).filter(Boolean))
  const senderTypeRaw = firstText(source, [
    ['sender_type'],
    ['from_type'],
    ['sender', 'type']
  ]).toLowerCase()
  // Shopee IM API không luôn trả sender_type, nên phải so from_shop_id với shop đang đồng bộ để phân biệt tin shop.
  const isShop = senderTypeRaw.includes('seller')
    || senderTypeRaw.includes('shop')
    || source.is_sent_by_merchant === true
    || Boolean(fromShopId && shopIds.has(cleanText(fromShopId)))
  const explicitConversationId = firstText(source, [
    ['conversation_id'],
    ['conversationId'],
    ['conversationid'],
    ['chat_id'],
    ['session_id']
  ])
  const fallbackConversationId = cleanText(fallback.conversation_id)
  const platform = cleanText(fallback.platform).toLowerCase()
  // Ưu tiên conversation_id thật từ API hoặc fallback từ danh sách hội thoại;
  // chỉ dùng participant id khi API không trả conversation_id để tránh tách nhầm thread.
  const participantFallbackId = isShop
    ? (toId || fallback.buyer_id || '')
    : (fromId || fallback.buyer_id || '')
  let conversationId = explicitConversationId || fallbackConversationId || participantFallbackId
  if (
    platform === 'shopee'
    && fallbackConversationId
    && !isShopeeConversationAliasId(fallbackConversationId, fallback.buyer_id)
    && isShopeeConversationAliasId(conversationId, fallback.buyer_id)
  ) {
    conversationId = fallbackConversationId
  }
  if (!conversationId || !content || isChatTestConversation(conversationId)) return null
  const messageType = inferMessageType(firstText(source, [['message_type'], ['msg_type'], ['type']]) || 'text', mediaItems)

  const buyerId = isShop
    ? (toId || fallback.buyer_id || '')
    : (firstText(source, [['buyer_id'], ['user_id'], ['from_id'], ['sender_id']]) || fromId || fallback.buyer_id || '')
  const buyerName = isShop
    ? (toName || fallback.buyer_name || '')
    : (firstText(source, [['buyer_name'], ['user_name'], ['from_user_name'], ['from_name'], ['sender_name'], ['sender', 'name']]) || fallback.buyer_name || '')
  const message = {
    platform: fallback.platform,
    shop: fallback.shop,
    shop_id: fallback.shop_id,
    conversation_id: conversationId,
    buyer_id: buyerId,
    buyer_name: buyerName || buyerId || 'Khách hàng',
    message_id: firstText(source, [['message_id'], ['msg_id'], ['id']]) || `api-${simpleHash(`${fallback.platform}|${fallback.shop}|${conversationId}|${content}|${JSON.stringify(source).slice(0, 200)}`)}`,
    sender_type: isShop ? 'shop' : (senderTypeRaw || 'buyer'),
    sender_name: fromName || (isShop ? (fallback.shop || 'Shop') : (buyerName || 'Khách hàng')),
    sender_id: fromId,
    message_type: messageType,
    content,
    media_items: mediaItems,
    has_real_content: 1,
    sent_at: normalizeApiChatTimestamp(firstText(source, [['sent_at'], ['created_at'], ['timestamp'], ['created_timestamp'], ['create_time'], ['send_time']])) || currentVnIsoTimestamp(),
    raw_payload: JSON.stringify(row || {})
  }
  // Chặn cụm FAQ/bundle/review prompt ngay tại lõi sync để OMS chỉ lưu tin khách hoặc tin shop thật.
  if (classifyShopeeSystemNoiseMessage(message)) return null
  return message
}

function apiConversationLastMessageText(source = {}) {
  const mediaItems = normalizeMediaItems([...collectMediaItems(source), ...collectChatCards(source)])
  const text = firstText(source, [
    ['latest_message_content'],
    ['last_message_content'],
    ['latest_message'],
    ['last_message'],
    ['summary'],
    ['preview'],
    ['content', 'text'],
    ['message', 'content'],
    ['message', 'text']
  ])
  return text || mediaMessageSummary(mediaItems)
}

function normalizeShopeeApiConversation(row, fallback = {}) {
  const source = row?.conversation && typeof row.conversation === 'object' ? { ...row, ...row.conversation } : (row || {})
  const conversationId = firstText(source, [
    ['conversation_id'],
    ['conversationId'],
    ['conversationid'],
    ['chat_id'],
    ['session_id']
  ])
  if (!conversationId || isChatTestConversation(conversationId)) return null
  const buyerId = firstText(source, [
    ['to_id'],
    ['buyer_id'],
    ['user_id'],
    ['oppside_user_id'],
    ['recipient_id'],
    ['receiver_id'],
    ['user', 'id'],
    ['buyer', 'id']
  ])
  const buyerName = firstText(source, [
    ['to_name'],
    ['buyer_name'],
    ['user_name'],
    ['username'],
    ['recipient_name'],
    ['receiver_name'],
    ['title'],
    ['user', 'name'],
    ['buyer', 'name']
  ])
  const lastMessageAt = normalizeApiChatTimestamp(firstText(source, [
    ['latest_message_time'],
    ['last_message_time'],
    ['last_message_timestamp'],
    ['last_message', 'timestamp'],
    ['last_message', 'created_timestamp'],
    ['update_time'],
    ['updated_at'],
    ['timestamp']
  ])) || currentVnIsoTimestamp()
  return {
    platform: 'shopee',
    shop: fallback.shop,
    shop_id: fallback.shop_id,
    conversation_id: conversationId,
    buyer_id: buyerId,
    buyer_name: buyerName || buyerId || '',
    last_message: limitText(apiConversationLastMessageText(source), 1000),
    last_message_at: lastMessageAt,
    unread_count: Number(firstText(source, [['unread_count'], ['unread'], ['unread_num']]) || 0) || 0,
    status: 'open',
    source: 'api',
    raw_payload: safeJsonStringify(row || {}, '{}')
  }
}

function isRecentApiChatMessage(message, minutes = 30) {
  const value = cleanText(message?.sent_at || message?.created_at)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return true
  return Date.now() - timestamp <= Math.max(1, Number(minutes) || 30) * 60 * 1000
}

async function backfillChatConversationIdentityCore(env) {
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, conversation_id, buyer_id, buyer_name,
           identity_key, canonical_conversation_id, source, updated_at, created_at
    FROM marketplace_chat_conversations
    WHERE conversation_id NOT LIKE 'CHAT_TEST%'
    ORDER BY id DESC
    LIMIT 1000
  `).all().catch(() => ({ results: [] }))

  const groups = new Map()
  for (const row of results || []) {
    const identityKey = preferredChatIdentityKey(row)
    const canonicalId = cleanText(row.canonical_conversation_id || row.conversation_id)
    if (identityKey || canonicalId !== cleanText(row.canonical_conversation_id)) {
      await env.DB.prepare(`
        UPDATE marketplace_chat_conversations
        SET identity_key = CASE WHEN ? != '' THEN ? ELSE identity_key END,
            canonical_conversation_id = CASE WHEN ? != '' THEN ? ELSE canonical_conversation_id END,
            updated_at = updated_at
        WHERE id = ?
      `).bind(identityKey, identityKey, canonicalId, canonicalId, row.id).run().catch(() => null)
    }
    if (!identityKey || (isWeakChatConversationIdentity(row) && !allowLazadaNameIdentityBridge(row))) continue
    const list = groups.get(identityKey) || []
    list.push({ ...row, identity_key: identityKey, canonical_conversation_id: canonicalId })
    groups.set(identityKey, list)
  }

  for (const rows of groups.values()) {
    if (rows.length < 2) continue
    const ranked = [...rows].sort((a, b) => {
      const score = item =>
        (isAutomationConversationId(item.conversation_id) ? 0 : 100)
        + (cleanText(item.source).toLowerCase() === 'automation' ? 0 : 40)
        + (cleanText(item.buyer_id) ? 20 : 0)
        + Number(item.id || 0) / 1000000
      return score(b) - score(a)
    })
    const canonical = ranked[0]
    const canonicalId = cleanText(canonical.canonical_conversation_id || canonical.conversation_id)
    for (const alias of ranked.slice(1)) {
      if (!shouldAliasConversation(alias.conversation_id, canonicalId)) continue
      // Migration nhẹ cho dữ liệu cũ: lưu alias để UI đọc về hội thoại chính, không xóa hội thoại automation/browser cũ.
      await saveChatConversationAlias(env, alias, canonicalId, 'identity_backfill', 0.82).catch(() => null)
      await env.DB.prepare(`
        UPDATE marketplace_chat_conversations
        SET canonical_conversation_id = ?,
            identity_key = CASE WHEN identity_key = '' THEN ? ELSE identity_key END
        WHERE id = ?
      `).bind(canonicalId, cleanText(alias.identity_key), alias.id).run().catch(() => null)
    }
  }
}

async function runChatIdentityBackfill(env, options = {}) {
  const force = options.force === true
  const freshEnough = chatIdentityBackfillAt
    && (Date.now() - chatIdentityBackfillAt) < CHAT_IDENTITY_BACKFILL_CACHE_MS
  if (!force && freshEnough) return
  if (!force && chatIdentityBackfillPromise) return chatIdentityBackfillPromise

  chatIdentityBackfillPromise = (async () => {
    try {
      await backfillChatConversationIdentityCore(env)
      chatIdentityBackfillAt = Date.now()
    } finally {
      chatIdentityBackfillPromise = null
    }
  })()
  return chatIdentityBackfillPromise
}

async function saveChatConversationAlias(env, message, canonicalConversationId, reason = 'identity_core', confidence = 0.9) {
  const platform = cleanText(message?.platform).toLowerCase()
  const aliasConversationId = cleanText(message?.conversation_id)
  const canonicalId = cleanText(canonicalConversationId)
  if (!shouldAliasConversation(aliasConversationId, canonicalId)) return false
  if (
    isAutomationConversationId(canonicalId)
    && (
      (platform === 'lazada' && isOfficialLazadaConversationId(aliasConversationId))
      || (platform === 'shopee' && isOfficialShopeeConversationId(aliasConversationId))
    )
  ) {
    // Không được phép lưu session IM chính thức của Lazada làm alias cho conversation automation cũ.
    return false
  }
  const aliasKey = chatIdentityKey({ ...message, conversation_id: aliasConversationId })
  await env.DB.prepare(`
    INSERT INTO chat_conversation_aliases
      (platform, shop, shop_id, alias_conversation_id, canonical_conversation_id,
       alias_key, alias_source, confidence, reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, alias_conversation_id, canonical_conversation_id) DO UPDATE SET
      shop_id = CASE WHEN excluded.shop_id != '' THEN excluded.shop_id ELSE chat_conversation_aliases.shop_id END,
      alias_key = CASE WHEN excluded.alias_key != '' THEN excluded.alias_key ELSE chat_conversation_aliases.alias_key END,
      alias_source = excluded.alias_source,
      confidence = MAX(chat_conversation_aliases.confidence, excluded.confidence),
      reason = excluded.reason,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    platform,
    cleanText(message?.shop),
    cleanText(message?.shop_id),
    aliasConversationId,
    canonicalId,
    aliasKey,
    cleanText(message?.source || 'chat_core'),
    Number(confidence || 0),
    cleanText(reason)
  ).run()
  return true
}

async function loadAliasCanonicalConversation(env, message) {
  const platform = cleanText(message?.platform).toLowerCase()
  const shop = cleanText(message?.shop)
  const shopId = cleanText(message?.shop_id)
  const conversationId = cleanText(message?.conversation_id)
  if (!platform || !shop || !conversationId) return ''
  const row = await env.DB.prepare(`
    SELECT canonical_conversation_id
    FROM chat_conversation_aliases
    WHERE lower(platform) = ?
      AND shop = ?
      AND alias_conversation_id = ?
      AND (? = '' OR shop_id = '' OR shop_id = ?)
    ORDER BY confidence DESC, updated_at DESC, id DESC
    LIMIT 1
  `).bind(platform, shop, conversationId, shopId, shopId).first().catch(() => null)
  return cleanText(row?.canonical_conversation_id)
}

function isOfficialLazadaConversationId(value) {
  const text = cleanText(value)
  return Boolean(text && !isAutomationConversationId(text) && !isChatTestConversation(text))
}

function isOfficialShopeeConversationId(value) {
  const text = cleanText(value)
  return Boolean(text && /^\d{6,}$/.test(text) && !isAutomationConversationId(text) && !isChatTestConversation(text))
}

function allowLazadaNameIdentityBridge(row = {}) {
  const platform = cleanText(row?.platform).toLowerCase()
  const buyerId = cleanText(row?.buyer_id || row?.customer_id || row?.user_id)
  const buyerName = cleanText(row?.buyer_name || row?.customer_name || row?.name)
  const identityKey = cleanText(chatIdentityKey(row) || row?.identity_key)
  return platform === 'lazada'
    && !buyerId
    && identityKey.includes('|name:')
    && !isGenericChatBuyerName(buyerName)
}

function preferredChatIdentityKey(row = {}) {
  return cleanText(chatIdentityKey(row) || row?.identity_key)
}

Object.assign(globalThis, {
  apiMessageContentText,
  normalizeApiChatMessage,
  apiConversationLastMessageText,
  normalizeShopeeApiConversation,
  isRecentApiChatMessage,
  backfillChatConversationIdentityCore,
  runChatIdentityBackfill,
  saveChatConversationAlias,
  loadAliasCanonicalConversation,
  isOfficialLazadaConversationId,
  isOfficialShopeeConversationId,
  allowLazadaNameIdentityBridge,
  preferredChatIdentityKey
})
