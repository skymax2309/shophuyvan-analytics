// NEO: Backend worker chat sàn - nhóm order-resolve-seed. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function refreshShopeeConversationBuyerFromOrder(env, conversation = {}) {
  if (cleanText(conversation?.platform).toLowerCase() !== 'shopee') return conversation
  if (cleanText(conversation?.buyer_id)) return conversation
  const orderId = await findOrderIdForConversation(env, conversation)
  if (!orderId) return conversation
  const shop = await loadShopeeChatShopForConversation(env, conversation)
  if (!shop) return conversation
  const identity = await fetchShopeeOrderBuyerIdentity(env, shop, orderId)
  if (!identity?.buyer_id) return conversation
  return updateConversationBuyerIdentity(env, conversation, identity)
}

async function loadOrderResolverOrderRow(env, platform, shopAliases = [], orderId = '', fallbackOrder = {}) {
  const normalizedOrderId = cleanText(orderId)
  if (!normalizedOrderId || !(await tableExists(env, 'orders_v2'))) {
    return {
      platform: cleanText(platform).toLowerCase(),
      shop: cleanText(fallbackOrder.shop),
      order_id: normalizedOrderId,
      buyer_id: cleanText(fallbackOrder.buyer_id),
      buyer_username: cleanText(fallbackOrder.buyer_username),
      customer_name: cleanText(fallbackOrder.customer_name),
      customer_phone: cleanText(fallbackOrder.customer_phone),
      tracking_number: cleanText(fallbackOrder.tracking_number),
      oms_status: cleanText(fallbackOrder.oms_status),
      shipping_status: cleanText(fallbackOrder.shipping_status)
    }
  }
  await ensureOrderBuyerIdentityColumns(env)
  const aliasList = [...new Set(shopAliases.map(value => cleanText(value).toLowerCase()).filter(Boolean))]
  const aliasPlaceholders = aliasList.length ? aliasList.map(() => '?').join(',') : ''
  const byShop = aliasList.length
    ? await env.DB.prepare(`
      SELECT order_id, platform, shop, buyer_id, buyer_username, customer_name, customer_phone, tracking_number, oms_status, shipping_status
      FROM orders_v2
      WHERE lower(platform) = ?
        AND lower(order_id) = lower(?)
        AND lower(COALESCE(shop, '')) IN (${aliasPlaceholders})
      ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
      LIMIT 1
    `).bind(cleanText(platform).toLowerCase(), normalizedOrderId, ...aliasList).first().catch(() => null)
    : null
  const row = byShop || await env.DB.prepare(`
    SELECT order_id, platform, shop, buyer_id, buyer_username, customer_name, customer_phone, tracking_number, oms_status, shipping_status
    FROM orders_v2
    WHERE lower(platform) = ?
      AND lower(order_id) = lower(?)
    ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
    LIMIT 1
  `).bind(cleanText(platform).toLowerCase(), normalizedOrderId).first().catch(() => null)

  return {
    platform: cleanText(row?.platform || platform).toLowerCase(),
    shop: cleanText(row?.shop || fallbackOrder.shop),
    order_id: cleanText(row?.order_id || normalizedOrderId),
    buyer_id: cleanText(row?.buyer_id || fallbackOrder.buyer_id),
    buyer_username: cleanText(row?.buyer_username || fallbackOrder.buyer_username),
    customer_name: cleanText(row?.customer_name || fallbackOrder.customer_name),
    customer_phone: cleanText(row?.customer_phone || fallbackOrder.customer_phone),
    tracking_number: cleanText(row?.tracking_number || fallbackOrder.tracking_number),
    oms_status: cleanText(row?.oms_status || fallbackOrder.oms_status),
    shipping_status: cleanText(row?.shipping_status || fallbackOrder.shipping_status)
  }
}

async function findHardOrderConversationMatch(env, canonical, platform, shopAliases = [], orderId = '') {
  const normalizedOrderId = cleanText(orderId).toUpperCase()
  if (!normalizedOrderId) return null
  const aliases = [...new Set(shopAliases.map(value => cleanText(value)).filter(Boolean))]
  if (!aliases.length) return null
  const loweredAliases = aliases.map(value => value.toLowerCase())
  const aliasPlaceholders = loweredAliases.map(() => '?').join(', ')
  const likeParam = `%${normalizedOrderId}%`
  const candidateRows = []
  const seenConversationKeys = new Set()

  if (await tableExists(env, 'marketplace_chat_messages')) {
    const { results: messageHits } = await env.DB.prepare(`
      SELECT DISTINCT c.*
      FROM marketplace_chat_messages m
      INNER JOIN marketplace_chat_conversations c
        ON c.platform = m.platform
       AND c.conversation_id = m.conversation_id
       AND (
         c.shop = m.shop
         OR c.shop_id = m.shop_id
         OR c.shop = m.shop_id
         OR c.shop_id = m.shop
       )
      WHERE lower(m.platform) = ?
        AND (lower(COALESCE(m.shop, '')) IN (${aliasPlaceholders}) OR lower(COALESCE(m.shop_id, '')) IN (${aliasPlaceholders}))
        AND (
          upper(COALESCE(m.content, '')) LIKE ?
          OR upper(COALESCE(m.raw_payload, '')) LIKE ?
        )
      ORDER BY datetime(COALESCE(NULLIF(c.last_message_at, ''), c.updated_at, c.created_at)) DESC, c.id DESC
      LIMIT 12
    `).bind(cleanText(platform).toLowerCase(), ...loweredAliases, ...loweredAliases, likeParam, likeParam).all().catch(() => ({ results: [] }))
    for (const row of messageHits || []) {
      const key = `${row.id || ''}|${cleanText(row.conversation_id)}`
      if (seenConversationKeys.has(key)) continue
      seenConversationKeys.add(key)
      candidateRows.push(row)
    }
  }

  const { results: lastMessageHits } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_chat_conversations
    WHERE lower(platform) = ?
      AND (lower(COALESCE(shop, '')) IN (${aliasPlaceholders}) OR lower(COALESCE(shop_id, '')) IN (${aliasPlaceholders}))
      AND upper(COALESCE(last_message, '')) LIKE ?
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 12
  `).bind(cleanText(platform).toLowerCase(), ...loweredAliases, ...loweredAliases, likeParam).all().catch(() => ({ results: [] }))
  for (const row of lastMessageHits || []) {
    const key = `${row.id || ''}|${cleanText(row.conversation_id)}`
    if (seenConversationKeys.has(key)) continue
    seenConversationKeys.add(key)
    candidateRows.push(row)
  }

  const candidates = dedupeChatConversations(candidateRows, canonical.aliasToKey, canonical.byKey, 12)
  for (const candidate of candidates) {
    const messages = await loadChatMessagesForContext(env, candidate)
    const orderIds = extractChatOrderIds(candidate, messages)
    if (orderIds.includes(normalizedOrderId)) {
      return {
        conversation: compactChatResolverConversation(candidate),
        match_reason: 'Khớp chắc theo mã đơn xuất hiện trong hội thoại đã lưu.',
        match_source: 'order_id',
        match_confidence: 1
      }
    }
  }
  return null
}

async function findSoftOrderConversationMatch(env, canonical, platform, shopAliases = [], order = {}) {
  const normalizedName = cleanText(order.customer_name)
  const normalizedPhone = normalizeOrderResolverPhone(order.customer_phone)
  if (!normalizedName && !normalizedPhone) return null
  const aliases = [...new Set(shopAliases.map(value => cleanText(value)).filter(Boolean))]
  if (!aliases.length) return null
  const loweredAliases = aliases.map(value => value.toLowerCase())
  const aliasPlaceholders = loweredAliases.map(() => '?').join(', ')
  const clauses = []
  const params = [cleanText(platform).toLowerCase(), ...loweredAliases, ...loweredAliases]

  if (normalizedName) {
    clauses.push(`(lower(trim(COALESCE(buyer_name, ''))) = lower(trim(?)) OR lower(COALESCE(buyer_name, '')) LIKE lower(?))`)
    params.push(normalizedName, `%${normalizedName}%`)
  }
  if (normalizedPhone) {
    clauses.push(`
      REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(buyer_id, ''), ' ', ''), '-', ''), '.', ''), '+', '') LIKE ?
    `)
    params.push(`%${normalizedPhone}%`)
  }
  if (!clauses.length) return null

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_chat_conversations
    WHERE lower(platform) = ?
      AND (lower(COALESCE(shop, '')) IN (${aliasPlaceholders}) OR lower(COALESCE(shop_id, '')) IN (${aliasPlaceholders}))
      AND (${clauses.join(' OR ')})
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 12
  `).bind(...params).all().catch(() => ({ results: [] }))

  const candidates = dedupeChatConversations(results || [], canonical.aliasToKey, canonical.byKey, 12)
  const scored = candidates.map(candidate => {
    const score = scoreSoftOrderConversationMatch(candidate, order)
    return {
      candidate,
      ...score
    }
  }).filter(item => item.score >= 0.55)
    .sort((a, b) => b.score - a.score || Number(b.candidate.unread_count || 0) - Number(a.candidate.unread_count || 0))

  if (!scored.length) return null
  return {
    conversation: compactChatResolverConversation(scored[0].candidate),
    match_reason: scored[0].reasons.join('. ') || 'Khớp mềm theo tên hoặc số điện thoại khách trong OMS.',
    match_source: 'buyer_name_phone',
    match_confidence: Number(scored[0].score.toFixed(2))
  }
}

function buildOrderSeedConversationId(platform, order = {}, resolvedShop = {}) {
  const normalizedPlatform = cleanText(platform).toLowerCase()
  const shopKey = cleanText(resolvedShop?.api_shop_id || resolvedShop?.shop_name || resolvedShop?.user_name || order.shop)
  const buyerKey = normalizeOrderResolverPhone(order.customer_phone)
    || normalizeKeywordText(order.customer_name)
    || cleanText(order.order_id)
    || String(Date.now())
  const suffix = simpleHash(`${normalizedPlatform}|${shopKey}|${buyerKey}`)
  if (normalizedPlatform === 'shopee') return `automation-shopee-seed-${suffix}`
  if (normalizedPlatform === 'tiktok') return `automation-tiktok-seed-${suffix}`
  if (normalizedPlatform === 'lazada') return `lazada-order-seed-${suffix}`
  return `order-seed-${normalizedPlatform}-${suffix}`
}

function orderSeedTransport(platform, resolvedShop = {}) {
  const normalizedPlatform = cleanText(platform).toLowerCase()
  // Khi chưa có thread thật, Shopee/TikTok phải seed theo browser để luồng gửi có thể
  // Shop Shopee có API vẫn giữ nhãn API; chỉ shop chưa API mới dùng seed browser.
  if (normalizedPlatform === 'shopee') {
    const transport = resolveChatTransportForShop(resolvedShop).transport
    return transport === CHAT_TRANSPORT_API ? CHAT_TRANSPORT_API : CHAT_TRANSPORT_BROWSER
  }
  if (normalizedPlatform === 'tiktok') return CHAT_TRANSPORT_BROWSER
  return cleanText(resolveChatTransportForShop(resolvedShop).transport || CHAT_TRANSPORT_OFF)
}

function orderSeedWarning(platform, transport) {
  const normalizedPlatform = cleanText(platform).toLowerCase()
  if (normalizedPlatform === 'shopee') {
    return 'Chưa có hội thoại đã lưu. OMS đã tạo hội thoại mới từ đơn hàng; shop Shopee có API sẽ thử tìm thread chính thức để lấy buyer_id trước khi gửi. Nếu chưa có thread, cần endpoint mở thread từ order_sn.'
  }
  if (normalizedPlatform === 'tiktok') {
    return 'Chưa có hội thoại đã lưu. OMS đã tạo hội thoại mới từ đơn hàng; TikTok sẽ dùng automation local để nhắn khách.'
  }
  if (normalizedPlatform === 'lazada') {
    return transport === CHAT_TRANSPORT_API
      ? 'Chưa có hội thoại đã lưu. OMS đã tạo khung chat mới từ đơn hàng; Lazada chỉ gửi được khi app IM mở được session chính thức.'
      : 'Chưa có hội thoại đã lưu. OMS đã tạo khung chat mới từ đơn hàng; shop Lazada này chưa sẵn sàng gửi chat chính thức.'
  }
  return 'Chưa có hội thoại đã lưu. OMS đã tạo hội thoại mới từ đơn hàng để shop tiếp tục xử lý khách.'
}

async function ensureOrderSeedConversation(env, canonical, platform, shop, shopId, shopAliases = [], order = {}, resolvedShop = null) {
  const normalizedPlatform = cleanText(platform).toLowerCase()
  const aliases = [...new Set(shopAliases.map(value => cleanText(value).toLowerCase()).filter(Boolean))]
  const conversationId = buildOrderSeedConversationId(normalizedPlatform, order, resolvedShop || {})
  const transport = orderSeedTransport(normalizedPlatform, resolvedShop || {})
  if (aliases.length) {
    const placeholders = aliases.map(() => '?').join(', ')
    const existing = await env.DB.prepare(`
      SELECT *
      FROM marketplace_chat_conversations
      WHERE lower(platform) = ?
        AND conversation_id = ?
        AND (lower(COALESCE(shop, '')) IN (${placeholders}) OR lower(COALESCE(shop_id, '')) IN (${placeholders}))
      ORDER BY id DESC
      LIMIT 1
    `).bind(normalizedPlatform, conversationId, ...aliases, ...aliases).first().catch(() => null)
    if (existing) {
      const buyerId = cleanText(order.buyer_id)
      if (buyerId && !cleanText(existing.buyer_id)) {
        return compactChatResolverConversation(await updateConversationBuyerIdentity(env, existing, {
          buyer_id: buyerId,
          buyer_username: cleanText(order.buyer_username || order.customer_name)
        }))
      }
      return compactChatResolverConversation(existing)
    }
  }

  const canonicalKey = canonicalChatShopKeyForValues(normalizedPlatform, shop, shopId, canonical.aliasToKey)
  const canonicalShop = canonical.byKey.get(canonicalKey)
  const displayShop = cleanText(canonicalShop?.display_name || canonicalShop?.shop_name || resolvedShop?.shop_name || resolvedShop?.user_name || shop)
  const normalizedShopId = cleanText(canonicalShop?.api_shop_id || resolvedShop?.api_shop_id || shopId || shop)
  const buyerName = cleanText(order.customer_name || order.buyer_username || 'Khách hàng')
  const buyerId = cleanText(order.buyer_id)
  const nowText = currentVnIsoTimestamp()
  const previewText = cleanText(order.order_id)
    ? `Tạo từ OMS cho đơn ${cleanText(order.order_id)} để nhắn khách.`
    : 'Tạo từ OMS để nhắn khách theo đơn hàng.'
  const scanMode = resolveChatScanPolicy({
    platform: normalizedPlatform,
    shop: displayShop,
    shop_id: normalizedShopId,
    transport
  }).mode
  const seedConversation = {
    platform: normalizedPlatform,
    shop: displayShop,
    shop_id: normalizedShopId,
    conversation_id: conversationId,
    canonical_conversation_id: conversationId,
    buyer_id: buyerId,
    buyer_name: buyerName,
    last_message: previewText,
    last_message_at: nowText,
    unread_count: 0,
    status: 'open',
    source: 'oms_order_seed',
    transport,
    scan_mode: scanMode
  }
  const identityKey = preferredChatIdentityKey(seedConversation)
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_conversations
      (platform, shop, shop_id, conversation_id, buyer_id, buyer_name, last_message,
        last_message_at, unread_count, status, source, canonical_conversation_id, identity_key,
        transport, scan_mode, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'open', ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, conversation_id) DO UPDATE SET
      shop_id = excluded.shop_id,
      buyer_id = CASE WHEN excluded.buyer_id != '' THEN excluded.buyer_id ELSE marketplace_chat_conversations.buyer_id END,
      buyer_name = CASE WHEN excluded.buyer_name != '' THEN excluded.buyer_name ELSE marketplace_chat_conversations.buyer_name END,
      last_message = excluded.last_message,
      last_message_at = excluded.last_message_at,
      source = excluded.source,
      canonical_conversation_id = excluded.canonical_conversation_id,
      identity_key = CASE WHEN excluded.identity_key != '' THEN excluded.identity_key ELSE marketplace_chat_conversations.identity_key END,
      transport = excluded.transport,
      scan_mode = excluded.scan_mode,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    seedConversation.platform,
    seedConversation.shop,
    seedConversation.shop_id,
    seedConversation.conversation_id,
    seedConversation.buyer_id,
    seedConversation.buyer_name,
    seedConversation.last_message,
    seedConversation.last_message_at,
    seedConversation.source,
    seedConversation.canonical_conversation_id,
    identityKey,
    seedConversation.transport,
    seedConversation.scan_mode
  ).run()
  const row = await env.DB.prepare(`
    SELECT *
    FROM marketplace_chat_conversations
    WHERE platform = ? AND shop = ? AND conversation_id = ?
    LIMIT 1
  `).bind(seedConversation.platform, seedConversation.shop, seedConversation.conversation_id).first().catch(() => null)
  return compactChatResolverConversation(row || seedConversation)
}

Object.assign(globalThis, {
  refreshShopeeConversationBuyerFromOrder,
  loadOrderResolverOrderRow,
  findHardOrderConversationMatch,
  findSoftOrderConversationMatch,
  buildOrderSeedConversationId,
  orderSeedTransport,
  orderSeedWarning,
  ensureOrderSeedConversation
})
