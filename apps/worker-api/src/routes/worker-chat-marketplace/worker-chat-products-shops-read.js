// NEO: Backend worker chat sàn - nhóm products-shops-read. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function resolveOrderConversation(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const platform = cleanText(body.platform).toLowerCase()
  const shop = cleanText(body.shop || body.shop_name || body.shop_id)
  const shopId = cleanText(body.shop_id || body.shop)
  const orderId = cleanText(body.order_id)
  const inputOrder = {
    shop,
    order_id: orderId,
    customer_name: cleanText(body.customer_name),
    customer_phone: cleanText(body.customer_phone),
    tracking_number: cleanText(body.tracking_number),
    oms_status: cleanText(body.oms_status),
    shipping_status: cleanText(body.shipping_status)
  }

  if (!platform || !shop) {
    return json({ error: 'Thiếu platform hoặc shop để mở hội thoại từ đơn hàng.' }, cors, 400)
  }
  if (!orderId && !inputOrder.customer_name && !inputOrder.customer_phone) {
    return json({ error: 'Thiếu dữ liệu đơn hàng để tìm hội thoại.' }, cors, 400)
  }

  const shopAliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const canonical = await loadCanonicalChatShops(env)
  const resolvedShop = await loadChatOrderSyncShop(env, platform, shop, shopId, shopAliases)
  let order = await loadOrderResolverOrderRow(env, platform, shopAliases, orderId, inputOrder)
  order = await enrichShopeeOrderBuyerIdentity(env, order, resolvedShop)
  const searchQuery = buildOrderChatSearchQuery(order)
  const prefill = buildOrderChatPrefill(order)

  let match = await findHardOrderConversationMatch(env, canonical, platform, shopAliases, order.order_id)
  let meta = orderConversationMatchMeta(CHAT_CONVERSATION_MATCH_NONE)
  if (match) {
    meta = orderConversationMatchMeta(CHAT_CONVERSATION_MATCH_HARD)
  } else {
    match = await findSoftOrderConversationMatch(env, canonical, platform, shopAliases, order)
    if (match) meta = orderConversationMatchMeta(CHAT_CONVERSATION_MATCH_SOFT)
  }

  const warning = match
    ? `${meta.warning}${match.match_reason ? ` ${match.match_reason}` : ''}`.trim()
    : meta.warning

  let conversation = match?.conversation || null
  let matchType = meta.match_type
  let matchLabel = meta.match_label
  let matchTone = meta.match_tone
  let matchReason = cleanText(match?.match_reason)
  let matchSource = cleanText(match?.match_source)
  let matchConfidence = Number(match?.match_confidence || 0)
  let finalWarning = warning

  if (conversation && cleanText(order.buyer_id) && !cleanText(conversation.buyer_id)) {
    conversation = compactChatResolverConversation(await updateConversationBuyerIdentity(env, conversation, {
      buyer_id: order.buyer_id,
      buyer_username: cleanText(order.buyer_username || order.customer_name)
    }))
  }

  if (!conversation) {
    conversation = await ensureOrderSeedConversation(env, canonical, platform, shop, shopId, shopAliases, order, resolvedShop)
    matchType = 'created'
    matchLabel = 'Đã tạo hội thoại mới'
    matchTone = 'muted'
    matchReason = 'Chưa có thread đã lưu nên OMS tạo hội thoại mới từ đơn hàng để shop xử lý ngay.'
    matchSource = 'order_seed'
    matchConfidence = 0
    finalWarning = orderSeedWarning(platform, cleanText(conversation?.transport))
  }

  return json({
    status: 'ok',
    found: Boolean(conversation?.id),
    match_type: matchType,
    match_label: matchLabel,
    match_tone: matchTone,
    warning: finalWarning,
    conversation,
    order,
    prefill,
    search_query: searchQuery,
    platform,
    shop,
    shop_filter_value: cleanText(resolvedShop?.api_shop_id || resolvedShop?.shop_name || resolvedShop?.user_name || shop),
    chat_transport: cleanText(conversation?.transport),
    match_reason: matchReason,
    match_source: matchSource,
    match_confidence: matchConfidence
  }, cors)
}

async function listChatProducts(request, env, cors) {
  await ensureChatTables(env)
  const url = new URL(request.url)
  const id = cleanText(url.searchParams.get('id'))
  const conversationId = cleanText(url.searchParams.get('conversation_id'))
  const platformFilter = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shopFilter = cleanText(url.searchParams.get('shop'))
  const query = cleanText(url.searchParams.get('q')).slice(0, 160)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 120) || 120, 1), 250)
  const offset = Math.max(Number(url.searchParams.get('offset') || 0) || 0, 0)
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
    `).bind(conversationId, platformFilter, platformFilter, shopFilter, shopFilter, shopFilter).first()
  }

  if (!conversation || !(await tableExists(env, 'marketplace_product_knowledge'))) {
    return json({
      status: 'ok',
      conversation,
      products: [],
      total_products: 0,
      matched_products: 0,
      limit,
      offset,
      has_more: false
    }, cors)
  }

  const platform = cleanText(conversation.platform).toLowerCase()
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const aliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const aliasPlaceholders = aliases.length ? aliases.map(() => '?').join(',') : ''
  const baseWhere = [
    '(? = \'\' OR lower(platform) = ?)',
    aliases.length ? `(shop IN (${aliasPlaceholders}) OR shop_id IN (${aliasPlaceholders}))` : '1 = 1'
  ].join(' AND ')
  const baseParams = [platform, platform, ...aliases, ...aliases]
  const searchWhere = query
    ? ` AND (
        lower(product_name) LIKE ?
        OR lower(item_sku) LIKE ?
        OR lower(platform_item_id) LIKE ?
        OR lower(description) LIKE ?
        OR lower(brand_name) LIKE ?
        OR lower(variations) LIKE ?
      )`
    : ''
  const q = `%${query.toLowerCase()}%`
  const searchParams = query ? [q, q, q, q, q, q] : []

  const totalRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM marketplace_product_knowledge
    WHERE ${baseWhere}
  `).bind(...baseParams).first()

  const matchedRow = query
    ? await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM marketplace_product_knowledge
      WHERE ${baseWhere}${searchWhere}
    `).bind(...baseParams, ...searchParams).first()
    : totalRow

  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, platform_item_id, product_name, description, video_url,
           images, category_id, brand_name, item_sku, weight, dimensions, attributes,
           logistics, variations, source, updated_at, created_at
    FROM marketplace_product_knowledge
    WHERE ${baseWhere}${searchWhere}
    ORDER BY datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(...baseParams, ...searchParams, limit, offset).all()

  const products = (results || []).map(row => compactProductKnowledgeRow(row, true))
  const matched = Number(matchedRow?.count || products.length || 0)

  return json({
    status: 'ok',
    conversation: {
      id: conversation.id,
      platform: conversation.platform,
      shop: conversation.shop,
      shop_id: conversation.shop_id,
      conversation_id: conversation.conversation_id
    },
    products,
    total_products: Number(totalRow?.count || 0),
    matched_products: matched,
    limit,
    offset,
    has_more: offset + products.length < matched
  }, cors)
}

async function listRuleViolations(request, env, cors) {
  await ensureChatTables(env)
  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20) || 20, 1), 100)
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, conversation_id, source, provider, content, violations, created_at
    FROM marketplace_chat_rule_violations
    ORDER BY id DESC
    LIMIT ?
  `).bind(limit).all()
  return json({
    status: 'ok',
    violations: (results || []).map(row => ({
      ...row,
      violations: safeJsonParse(row.violations, [])
    }))
  }, cors)
}

function buildChatCapabilitySetupSummary(items = []) {
  const total = items.length
  const apiReady = items.filter(item => String(item.transport || '').toLowerCase() === CHAT_TRANSPORT_API).length
  const browserFallback = items.filter(item => Number(item.browser_required || 0)).length
  const lazadaMarkReadReady = items.filter(item => item.capabilities?.official_mark_read_supported).length
  const shopeeGuarded = items.filter(item => item.capabilities?.docs_state === 'guarded_internal').length
  return {
    total_shops: total,
    api_ready: apiReady,
    browser_fallback: browserFallback,
    lazada_mark_read_ready: lazadaMarkReadReady,
    shopee_guarded: shopeeGuarded,
    api_shop_can: [
      'Kéo hội thoại và tin nhắn bằng API khi token và quyền còn sống.',
      'Gửi text chính thức lên sàn mà không phải mở Chrome.'
    ],
    non_api_shop_limitations: [
      'Chỉ quét ngoài hoặc mở sâu có kiểm soát qua Chrome, không gắn nhãn realtime API.',
      'Không xác nhận được mọi trạng thái đã đọc, thu hồi hoặc gửi media bằng API.'
    ]
  }
}

async function loadChatThreadConversationIds(env, conversation) {
  const platform = cleanText(conversation?.platform).toLowerCase()
  const shop = cleanText(conversation?.shop)
  const shopId = cleanText(conversation?.shop_id)
  const conversationId = cleanText(conversation?.conversation_id)
  const canonicalConversationId = cleanText(conversation?.canonical_conversation_id)
  if (!platform || !shop || (!conversationId && !canonicalConversationId)) {
    return [...new Set([conversationId, canonicalConversationId].map(cleanText).filter(Boolean))]
  }
  const aliases = [...new Set([conversationId, canonicalConversationId].map(cleanText).filter(Boolean))]
  const placeholders = aliases.map(() => '?').join(', ')
  if (!placeholders) return aliases
  const { results } = await env.DB.prepare(`
    SELECT alias_conversation_id, canonical_conversation_id
    FROM chat_conversation_aliases
    WHERE lower(platform) = ?
      AND shop = ?
      AND (? = '' OR shop_id = '' OR shop_id = ?)
      AND (
        alias_conversation_id IN (${placeholders})
        OR canonical_conversation_id IN (${placeholders})
      )
  `).bind(platform, shop, shopId, shopId, ...aliases, ...aliases).all().catch(() => ({ results: [] }))
  return [...new Set([
    ...aliases,
    ...(results || []).flatMap(row => [row.alias_conversation_id, row.canonical_conversation_id])
  ].map(cleanText).filter(Boolean))]
}

async function latestChatMessageIdForConversation(env, conversation) {
  const platform = cleanText(conversation?.platform).toLowerCase()
  const shop = cleanText(conversation?.shop)
  const shopId = cleanText(conversation?.shop_id)
  const conversationIds = await loadChatThreadConversationIds(env, conversation)
  if (!platform || !conversationIds.length) return ''
  const placeholders = conversationIds.map(() => '?').join(', ')
  const row = await env.DB.prepare(`
    SELECT message_id
    FROM marketplace_chat_messages
    WHERE lower(platform) = ?
      AND conversation_id IN (${placeholders})
      AND message_id IS NOT NULL AND message_id != ''
      AND (shop = ? OR shop_id = ? OR shop = ? OR shop_id = ?)
    ORDER BY id DESC
    LIMIT 1
  `).bind(platform, ...conversationIds, shop, shopId, shopId, shop).first().catch(() => null)
  return cleanText(row?.message_id)
}

// Lazada có endpoint chính thức để đánh dấu đã đọc; gọi tại đây để OMS và trạng thái trên sàn bám cùng một lõi.

async function markMarketplaceConversationRead(env, conversation) {
  const platform = cleanText(conversation?.platform).toLowerCase()
  if (platform !== 'lazada') {
    return {
      remote_status: 'local_only',
      remote_note: 'Sàn này hiện mới đánh dấu đã đọc trong OMS; chưa bật gọi đọc chính thức trên sàn.'
    }
  }
  const shop = await loadLazadaChatShopForConversation(env, conversation)
  if (!shop) {
    return {
      remote_status: 'missing_shop_token',
      remote_note: 'Shop Lazada chưa có token API còn sống để gọi đánh dấu đã đọc.'
    }
  }
  const sessionId = await resolveLazadaOfficialConversationId(env, conversation)
  const lastReadMessageId = await latestChatMessageIdForConversation(env, {
    ...conversation,
    conversation_id: sessionId || cleanText(conversation?.conversation_id),
    canonical_conversation_id: sessionId || cleanText(conversation?.canonical_conversation_id)
  })
  if (!sessionId || !lastReadMessageId) {
    return {
      remote_status: 'missing_message_id',
      remote_note: 'Hội thoại Lazada chưa đủ session_id hoặc message_id để gọi session/read.'
    }
  }
  const result = await callLazadaChatPath(env, shop, '/im/session/read', {
    session_id: sessionId,
    last_read_message_id: lastReadMessageId
  }, { method: 'POST' }).catch(error => ({
    ok: false,
    status: 0,
    data: { error: 'read_failed', message: errorMessage(error, 'Không gọi được Lazada IM session/read.') }
  }))
  if (!result.ok) {
    return {
      remote_status: 'platform_error',
      remote_note: lazadaChatSendError(result) || 'Lazada IM từ chối đánh dấu đã đọc.',
      remote_error: compactApiError(result.data)
    }
  }
  return {
    remote_status: 'ok',
    remote_note: 'Đã đánh dấu đã đọc trên Lazada IM API.',
    remote_result: compactApiError(result.data)
  }
}

Object.assign(globalThis, {
  resolveOrderConversation,
  listChatProducts,
  listRuleViolations,
  buildChatCapabilitySetupSummary,
  loadChatThreadConversationIds,
  latestChatMessageIdForConversation,
  markMarketplaceConversationRead
})
