// NEO: Backend worker chat sàn - nhóm context-messages-panel. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function listMessages(request, env, cors) {
  await ensureChatTables(env)
  const canonical = await loadCanonicalChatShops(env)
  const url = new URL(request.url)
  const id = cleanText(url.searchParams.get('id'))
  const conversationId = cleanText(url.searchParams.get('conversation_id'))
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shop = cleanText(url.searchParams.get('shop'))
  let conversation = null

  if (id) {
    conversation = await env.DB.prepare(`
      SELECT * FROM marketplace_chat_conversations WHERE id = ? LIMIT 1
    `).bind(id).first()
  } else if (conversationId) {
    conversation = await env.DB.prepare(`
      SELECT * FROM marketplace_chat_conversations
      WHERE conversation_id = ?
        AND (? = '' OR platform = ?)
        AND (? = '' OR shop = ? OR shop_id = ?)
      LIMIT 1
    `).bind(conversationId, platform, platform, shop, shop, shop).first()
  }

  if (!conversation) {
    return json({ status: 'ok', conversation: null, messages: [] }, cors)
  }

  const canonicalConversation = canonicalizeChatConversationRow(conversation, canonical.aliasToKey, canonical.byKey)
  const aliasSet = new Set([
    conversation.shop,
    conversation.shop_id,
    canonicalConversation.shop,
    canonicalConversation.shop_id,
    ...(canonicalConversation.shop_aliases || [])
  ].map(cleanText).filter(Boolean))
  const aliases = [...aliasSet]
  if (!aliases.length) aliases.push(cleanText(conversation.shop || conversation.shop_id || '__unknown_shop__'))
  const placeholders = aliases.map(() => '?').join(', ')
  const { results: threadAliases } = await env.DB.prepare(`
    SELECT alias_conversation_id, canonical_conversation_id
    FROM chat_conversation_aliases
    WHERE lower(platform) = ?
      AND shop = ?
      AND (alias_conversation_id = ? OR canonical_conversation_id = ?)
  `).bind(
    cleanText(conversation.platform).toLowerCase(),
    cleanText(conversation.shop),
    cleanText(conversation.conversation_id),
    cleanText(conversation.conversation_id)
  ).all().catch(() => ({ results: [] }))
  const conversationIds = [...new Set([
    conversation.conversation_id,
    conversation.canonical_conversation_id,
    ...(threadAliases || []).flatMap(row => [row.alias_conversation_id, row.canonical_conversation_id])
  ].map(cleanText).filter(Boolean))]
  const conversationPlaceholders = conversationIds.map(() => '?').join(', ')
  const threadMessageSortEpochSql = `
    COALESCE(
      ${chatSqlEpochSeconds("NULLIF(sent_at, '')")},
      ${chatSqlEpochSeconds('created_at')},
      0
    )
  `
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, conversation_id, message_id, sender_type, sender_name,
           sender_id, message_type, content, media_items, raw_payload, sent_at, delivery_status, platform_response, created_at
    FROM marketplace_chat_messages
    WHERE platform = ? AND conversation_id IN (${conversationPlaceholders})
      AND (shop IN (${placeholders}) OR shop_id IN (${placeholders}))
    ORDER BY ${threadMessageSortEpochSql} ASC, id ASC
    LIMIT 300
  `).bind(conversation.platform, ...conversationIds, ...aliases, ...aliases).all()

  const seenMessages = new Set()
  const messages = []
  for (const row of results || []) {
    const key = cleanText(row.message_id)
      ? `${row.sender_type}|${row.message_id}`
      : `row-${row.id}`
    if (seenMessages.has(key)) continue
    seenMessages.add(key)
    const sender = inferChatMessageSender(row, canonicalConversation)
    messages.push({
      ...row,
      sender_type: sender.sender_type,
      sender_name: sender.sender_name,
      sender_id: sender.sender_id,
      media_items: normalizeMediaItems(row.media_items, row.raw_payload)
    })
  }
  const displayMessages = filterChatDisplayMessages(canonicalConversation, messages)
  const orderEnrichedMessages = await enrichOrderCardsForMessages(env, canonicalConversation, displayMessages)
  const enrichedMessages = await enrichProductCardsForMessages(env, canonicalConversation, orderEnrichedMessages)
  const displayConversation = { ...canonicalConversation }
  if (!isUsefulBuyerName(displayConversation.buyer_name)) {
    const buyerMessage = enrichedMessages.find(message => message.sender_type !== 'shop' && isUsefulBuyerName(message.sender_name))
    if (buyerMessage) displayConversation.buyer_name = buyerMessage.sender_name
  }

  return json({
    status: 'ok',
    conversation: displayConversation,
    messages: enrichedMessages
  }, cors)
}

async function loadChatMessagesForContext(env, conversation) {
  if (!conversation || !(await tableExists(env, 'marketplace_chat_messages'))) return []
  const canonical = await loadCanonicalChatShops(env)
  const canonicalConversation = canonicalizeChatConversationRow(conversation, canonical.aliasToKey, canonical.byKey)
  const aliasSet = new Set([
    conversation.shop,
    conversation.shop_id,
    canonicalConversation.shop,
    canonicalConversation.shop_id,
    ...(canonicalConversation.shop_aliases || [])
  ].map(cleanText).filter(Boolean))
  const aliases = [...aliasSet]
  if (!aliases.length) aliases.push(cleanText(conversation.shop || conversation.shop_id || '__unknown_shop__'))
  const placeholders = aliases.map(() => '?').join(', ')
  const { results: threadAliases } = await env.DB.prepare(`
    SELECT alias_conversation_id, canonical_conversation_id
    FROM chat_conversation_aliases
    WHERE lower(platform) = ?
      AND shop = ?
      AND (alias_conversation_id = ? OR canonical_conversation_id = ?)
  `).bind(
    cleanText(conversation.platform).toLowerCase(),
    cleanText(conversation.shop),
    cleanText(conversation.conversation_id),
    cleanText(conversation.conversation_id)
  ).all().catch(() => ({ results: [] }))
  const conversationIds = [...new Set([
    conversation.conversation_id,
    conversation.canonical_conversation_id,
    ...(threadAliases || []).flatMap(row => [row.alias_conversation_id, row.canonical_conversation_id])
  ].map(cleanText).filter(Boolean))]
  const conversationPlaceholders = conversationIds.map(() => '?').join(', ')
  const threadMessageSortEpochSql = `
    COALESCE(
      ${chatSqlEpochSeconds("NULLIF(sent_at, '')")},
      ${chatSqlEpochSeconds('created_at')},
      0
    )
  `
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, conversation_id, message_id, sender_type, sender_name,
           sender_id, message_type, content, media_items, raw_payload, sent_at, delivery_status, platform_response, created_at
    FROM marketplace_chat_messages
    WHERE platform = ? AND conversation_id IN (${conversationPlaceholders})
      AND (shop IN (${placeholders}) OR shop_id IN (${placeholders}))
    ORDER BY ${threadMessageSortEpochSql} DESC, id DESC
    LIMIT 300
  `).bind(conversation.platform, ...conversationIds, ...aliases, ...aliases).all()

  const messages = []
  const seenMessages = new Set()
  for (const row of results || []) {
    const key = cleanText(row.message_id)
      ? `${row.sender_type}|${row.message_id}`
      : `row-${row.id}`
    if (seenMessages.has(key)) continue
    seenMessages.add(key)
    const sender = inferChatMessageSender(row, canonicalConversation)
    messages.push({
      ...row,
      sender_type: sender.sender_type,
      sender_name: sender.sender_name,
      sender_id: sender.sender_id,
      media_items: normalizeMediaItems(row.media_items, row.raw_payload)
    })
  }
  // Panel đơn hàng phải khớp từ chính tin nhắn đã lọc, tránh lấy mã đơn từ text TikTok bị dính UI.
  const displayMessages = filterChatDisplayMessages(canonicalConversation, messages)
  const orderSignalMessages = messages.filter(hasChatOrderSignal)
  // Panel Đơn hàng dùng chung dữ liệu đã lọc để hiển thị, nhưng vẫn giữ các carrier có mã đơn/card đơn.
  // Cách này chặn rác TikTok khỏi bubble mà không làm mất khả năng khớp đơn trong OMS.
  return mergeChatContextMessages(displayMessages, orderSignalMessages).reverse()
}

async function loadChatContextPanel(request, env, cors) {
  await ensureChatTables(env)
  const url = new URL(request.url)
  const id = cleanText(url.searchParams.get('id'))
  const conversationId = cleanText(url.searchParams.get('conversation_id'))
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shop = cleanText(url.searchParams.get('shop'))
  let conversation = null

  if (id) {
    conversation = await env.DB.prepare(`
      SELECT * FROM marketplace_chat_conversations WHERE id = ? LIMIT 1
    `).bind(id).first()
  } else if (conversationId) {
    conversation = await env.DB.prepare(`
      SELECT * FROM marketplace_chat_conversations
      WHERE conversation_id = ?
        AND (? = '' OR platform = ?)
        AND (? = '' OR shop = ? OR shop_id = ?)
      LIMIT 1
    `).bind(conversationId, platform, platform, shop, shop, shop).first()
  }

  if (!conversation) {
    return json({
      status: 'ok',
      conversation: null,
      context: await loadMarketplaceChatContext(env, null)
    }, cors)
  }

  const contextMessages = await loadChatMessagesForContext(env, conversation)
  if (!isUsefulBuyerName(conversation?.buyer_name)) {
    // Ưu tiên tên khách thật từ message mới nhất để UI chat và core khớp đơn nhìn cùng một nguồn.
    const buyerMessage = contextMessages.find(item => cleanText(item?.sender_type).toLowerCase() !== 'shop' && isUsefulBuyerName(item?.sender_name))
    if (buyerMessage) conversation = { ...conversation, buyer_name: cleanText(buyerMessage.sender_name) }
  }
  return json({
    status: 'ok',
    conversation,
    context: await loadMarketplaceChatContext(env, conversation, contextMessages)
  }, cors)
}

function compactChatResolverConversation(row = {}) {
  return {
    id: Number(row.id || 0),
    platform: cleanText(row.platform).toLowerCase(),
    shop: cleanText(row.shop),
    shop_id: cleanText(row.shop_id),
    conversation_id: cleanText(row.conversation_id),
    canonical_conversation_id: cleanText(row.canonical_conversation_id || row.conversation_id),
    buyer_id: cleanText(row.buyer_id),
    buyer_name: cleanText(row.buyer_name),
    transport: cleanText(row.transport),
    source: cleanText(row.source),
    unread_count: Number(row.unread_count || 0),
    last_message_at: cleanText(row.last_message_at),
    last_message: cleanText(row.last_message)
  }
}

async function ensureOrderBuyerIdentityColumns(env) {
  if (!(await tableExists(env, 'orders_v2'))) return false
  const columns = [
    ['buyer_id', `TEXT DEFAULT ''`],
    ['buyer_username', `TEXT DEFAULT ''`]
  ]
  for (const [name, definition] of columns) {
    try {
      await env.DB.prepare(`ALTER TABLE orders_v2 ADD COLUMN ${name} ${definition}`).run()
    } catch (error) {
      const message = String(error?.message || '').toLowerCase()
      if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
    }
  }
  return true
}

function shopeeOrderBuyerIdentityFromDetail(detail = {}) {
  return {
    buyer_id: cleanText(detail.buyer_user_id || detail.buyer_id || detail.user_id),
    buyer_username: cleanText(detail.buyer_username || detail.buyer_user_name || detail.username)
  }
}

async function updateOrderBuyerIdentity(env, orderId, identity = {}) {
  const buyerId = cleanText(identity.buyer_id)
  const buyerUsername = cleanText(identity.buyer_username)
  if (!orderId || (!buyerId && !buyerUsername)) return
  if (!await ensureOrderBuyerIdentityColumns(env)) return
  await env.DB.prepare(`
    UPDATE orders_v2
    SET buyer_id = CASE WHEN ? != '' THEN ? ELSE buyer_id END,
        buyer_username = CASE WHEN ? != '' THEN ? ELSE buyer_username END
    WHERE order_id = ?
  `).bind(buyerId, buyerId, buyerUsername, buyerUsername, cleanText(orderId)).run().catch(() => null)
}

async function fetchShopeeOrderBuyerIdentity(env, shop, orderId) {
  const safeOrderId = cleanText(orderId)
  if (!safeOrderId || !shop?.access_token || !cleanText(shop.api_shop_id)) return null
  const result = await callShopeeApiPath(env, shop, '/api/v2/order/get_order_detail', {
    method: 'GET',
    params: {
      order_sn_list: safeOrderId,
      request_order_status_pending: true,
      response_optional_fields: 'buyer_user_id,buyer_username,recipient_address'
    }
  }).catch(error => ({
    ok: false,
    data: { error: 'order_detail_failed', message: errorMessage(error, 'Không gọi được order/get_order_detail.') }
  }))
  if (!result.ok) return null
  const detail = result.data?.response?.order_list?.[0] || {}
  const identity = shopeeOrderBuyerIdentityFromDetail(detail)
  if (!identity.buyer_id && !identity.buyer_username) return null
  await updateOrderBuyerIdentity(env, safeOrderId, identity)
  return { ...identity, source: '/api/v2/order/get_order_detail' }
}

async function enrichShopeeOrderBuyerIdentity(env, order = {}, resolvedShop = null) {
  if (cleanText(order.platform).toLowerCase() !== 'shopee' || cleanText(order.buyer_id)) return order
  const identity = await fetchShopeeOrderBuyerIdentity(env, resolvedShop || {}, order.order_id)
  if (!identity?.buyer_id && !identity?.buyer_username) return order
  return {
    ...order,
    buyer_id: cleanText(identity.buyer_id || order.buyer_id),
    buyer_username: cleanText(identity.buyer_username || order.buyer_username)
  }
}

function extractShopeeOrderIdFromText(value = '') {
  return cleanText(value).toUpperCase().match(/\b\d{6}[A-Z0-9]{6,24}\b/)?.[0] || ''
}

async function findOrderIdForConversation(env, conversation = {}) {
  const direct = extractShopeeOrderIdFromText(`${conversation.last_message || ''} ${conversation.conversation_id || ''}`)
  if (direct) return direct
  if (!await tableExists(env, 'marketplace_chat_messages')) return ''
  const row = await env.DB.prepare(`
    SELECT content, raw_payload
    FROM marketplace_chat_messages
    WHERE lower(platform) = 'shopee'
      AND conversation_id = ?
      AND (content LIKE '%đơn%' OR content LIKE '%don%' OR raw_payload LIKE '%order%')
    ORDER BY datetime(COALESCE(NULLIF(sent_at, ''), created_at)) DESC, id DESC
    LIMIT 1
  `).bind(cleanText(conversation.conversation_id)).first().catch(() => null)
  return extractShopeeOrderIdFromText(`${row?.content || ''} ${row?.raw_payload || ''}`)
}

async function updateConversationBuyerIdentity(env, conversation = {}, identity = {}) {
  const buyerId = cleanText(identity.buyer_id)
  const buyerUsername = cleanText(identity.buyer_username || identity.buyer_name)
  if (!conversation?.id || !buyerId) return conversation
  const buyerName = cleanText(conversation.buyer_name || buyerUsername)
  const identityKey = preferredChatIdentityKey({ ...conversation, buyer_id: buyerId, buyer_name: buyerName })
  await env.DB.prepare(`
    UPDATE marketplace_chat_conversations
    SET buyer_id = ?,
        buyer_name = CASE WHEN COALESCE(buyer_name, '') = '' AND ? != '' THEN ? ELSE buyer_name END,
        identity_key = CASE WHEN ? != '' THEN ? ELSE identity_key END,
        transport = 'api',
        scan_mode = 'api_direct',
        updated_at = datetime('now', '+7 hours')
    WHERE id = ?
  `).bind(buyerId, buyerUsername, buyerUsername, identityKey, identityKey, conversation.id).run().catch(() => null)
  return {
    ...conversation,
    buyer_id: buyerId,
    buyer_name: buyerName,
    identity_key: identityKey,
    transport: 'api',
    scan_mode: 'api_direct'
  }
}

Object.assign(globalThis, {
  listMessages,
  loadChatMessagesForContext,
  loadChatContextPanel,
  compactChatResolverConversation,
  ensureOrderBuyerIdentityColumns,
  shopeeOrderBuyerIdentityFromDetail,
  updateOrderBuyerIdentity,
  fetchShopeeOrderBuyerIdentity,
  enrichShopeeOrderBuyerIdentity,
  extractShopeeOrderIdFromText,
  findOrderIdForConversation,
  updateConversationBuyerIdentity
})
