// NEO: Backend worker chat sàn - nhóm display-card-enrich. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function collectProductCardsForMessageCards(messages = []) {
  const found = []
  const seen = new Set()
  for (const message of messages || []) {
    for (const item of normalizeMediaItems(message.media_items, message.raw_payload)) {
      const itemId = chatProductIdFromCard(item)
      if (!itemId) continue
      const shopId = cleanText(item.shop_id)
      const key = `${shopId}|${itemId}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ item_id: itemId, shop_id: shopId })
    }
  }
  return found.slice(0, 20)
}

function compactChatProductVariationRows(rows = [], conversation = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return null
  const first = list.find(row => cleanText(row.image_url)) || list[0]
  const variations = list.map(row => ({
    variation_name: limitText(row.variation_name, 180),
    sku: limitText(row.platform_sku || row.internal_sku, 160),
    platform_sku: limitText(row.platform_sku, 160),
    internal_sku: limitText(row.internal_sku, 160),
    price: Number(row.price || 0) || 0,
    discount_price: Number(row.discount_price || 0) || 0,
    stock: Number(row.stock || 0) || 0,
    image_url: cleanText(row.image_url)
  }))
  const prices = priceSummaryFromVariations(variations)
  const itemId = cleanText(first.platform_item_id)
  const platform = cleanText(first.platform || conversation.platform).toLowerCase()
  const shopId = cleanText(conversation.shop_id)
  const images = [...new Set(list.map(row => cleanText(row.image_url)).filter(Boolean))].slice(0, 6)
  return {
    platform,
    shop: cleanText(first.shop || conversation.shop),
    shop_id: shopId,
    platform_item_id: itemId,
    product_url: platform === 'shopee' ? shopeeProductCardUrl(shopId, itemId) : '',
    product_name: limitText(first.product_name, 500),
    item_sku: limitText(first.platform_sku || first.internal_sku, 160),
    stock_total: variations.reduce((sum, item) => sum + Number(item.stock || 0), 0),
    price_min: prices.min,
    price_max: prices.max,
    images,
    image_url: chatProductPrimaryImage({ images, variations }),
    variations: variations.slice(0, 30),
    updated_at: cleanText(first.updated_at || first.created_at),
    source: 'product_variations'
  }
}

async function loadExactChatProductsForCards(env, conversation = {}, productCards = []) {
  const cards = Array.isArray(productCards) ? productCards : []
  const itemIds = [...new Set(cards.map(item => cleanText(item.item_id)).filter(Boolean))]
  if (!itemIds.length) return new Map()
  const platform = cleanText(conversation.platform).toLowerCase()
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const shopAliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const itemPlaceholders = itemIds.map(() => '?').join(',')
  const result = new Map()

  const rememberProduct = product => {
    const itemId = cleanText(product?.platform_item_id)
    if (!itemId) return
    const productShopId = cleanText(product.shop_id)
    result.set(itemId, product)
    if (productShopId) result.set(`${productShopId}|${itemId}`, product)
  }

  if (await tableExists(env, 'marketplace_product_knowledge')) {
    const aliasWhere = shopAliases.length ? `AND (shop IN (${shopAliases.map(() => '?').join(',')}) OR shop_id IN (${shopAliases.map(() => '?').join(',')}))` : ''
    const { results } = await env.DB.prepare(`
      SELECT id, platform, shop, shop_id, platform_item_id, product_name, description, video_url,
             images, category_id, brand_name, item_sku, weight, dimensions, attributes,
             logistics, variations, source, updated_at, created_at
      FROM marketplace_product_knowledge
      WHERE (? = '' OR lower(platform) = ?)
        AND platform_item_id IN (${itemPlaceholders})
        ${aliasWhere}
      ORDER BY datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
      LIMIT 80
    `).bind(platform, platform, ...itemIds, ...shopAliases, ...shopAliases).all()
    for (const row of results || []) rememberProduct(compactProductKnowledgeRow(row, true))
  }

  const missingIds = itemIds.filter(itemId => !result.has(itemId))
  if (missingIds.length && await tableExists(env, 'product_variations')) {
    const missingPlaceholders = missingIds.map(() => '?').join(',')
    const aliasWhere = shopAliases.length ? `AND shop IN (${shopAliases.map(() => '?').join(',')})` : ''
    const { results } = await env.DB.prepare(`
      SELECT id, platform, shop, platform_item_id, product_name, variation_name,
             platform_sku, internal_sku, image_url, price, discount_price, stock,
             map_status, updated_at, created_at
      FROM product_variations
      WHERE (? = '' OR lower(platform) = ?)
        AND platform_item_id IN (${missingPlaceholders})
        ${aliasWhere}
      ORDER BY platform_item_id ASC,
               CASE WHEN COALESCE(image_url, '') != '' THEN 0 ELSE 1 END,
               CASE WHEN COALESCE(stock, 0) > 0 THEN 0 ELSE 1 END,
               id ASC
      LIMIT 160
    `).bind(platform, platform, ...missingIds, ...shopAliases).all()
    const grouped = new Map()
    for (const row of results || []) {
      const itemId = cleanText(row.platform_item_id)
      if (!grouped.has(itemId)) grouped.set(itemId, [])
      grouped.get(itemId).push(row)
    }
    for (const rows of grouped.values()) rememberProduct(compactChatProductVariationRows(rows, conversation))
  }

  return result
}

async function enrichProductCardsForMessages(env, conversation, messages = []) {
  const productCards = collectProductCardsForMessageCards(messages)
  if (!productCards.length) return messages
  const productMap = await loadExactChatProductsForCards(env, conversation, productCards)
  if (!productMap.size) return messages
  return messages.map(message => {
    const mediaItems = normalizeMediaItems(message.media_items, message.raw_payload)
    const nextMedia = mediaItems.map(item => {
      const itemId = chatProductIdFromCard(item)
      const product = productMap.get(`${cleanText(item.shop_id)}|${itemId}`) || productMap.get(itemId)
      if (!itemId || !product) return item
      const image = chatProductPrimaryImage(product)
      return {
        ...item,
        url: product.product_url || item.url,
        thumbnail_url: image || item.thumbnail_url,
        name: product.product_name || item.name,
        product
      }
    })
    return { ...message, media_items: nextMedia }
  })
}

function collectOrderIdsForMessageCards(conversation, messages = []) {
  const found = new Set(extractChatOrderIds(conversation, messages))
  for (const message of messages || []) {
    for (const item of normalizeMediaItems(message.media_items, message.raw_payload)) {
      const orderId = chatOrderIdFromCard(item)
      if (orderId) found.add(orderId)
    }
  }
  return [...found].slice(0, 12)
}

async function loadExactChatOrdersForCards(env, conversation = {}, orderIds = []) {
  const safeOrderIds = [...new Set((orderIds || []).map(id => normalizeOrderIdCandidate(id, { allowNumeric: true })).filter(Boolean))]
  if (!safeOrderIds.length || !(await tableExists(env, 'orders_v2'))) return new Map()
  const platform = cleanText(conversation.platform).toLowerCase()
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const shopAliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const shopPlaceholders = shopAliases.length ? shopAliases.map(() => '?').join(',') : ''
  const orderPlaceholders = safeOrderIds.map(() => '?').join(',')
  const orderColumns = `
    id, order_id, platform, shop, order_date, revenue, net_revenue,
    discount_shop, discount_shopee, shipping_carrier, tracking_number,
    oms_status, shipping_status, customer_name, customer_phone, created_at
  `
  const baseWhere = `(? = '' OR lower(platform) = ?) AND (${shopAliases.length ? `shop IN (${shopPlaceholders})` : '1 = 1'})`
  const baseBind = [platform, platform, ...shopAliases]
  let orderRows = []
  if (shopAliases.length) {
    const { results } = await env.DB.prepare(`
      SELECT ${orderColumns}
      FROM orders_v2
      WHERE ${baseWhere}
        AND order_id IN (${orderPlaceholders})
      ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
      LIMIT 12
    `).bind(...baseBind, ...safeOrderIds).all()
    orderRows = results || []
  }
  if (!orderRows.length) {
    const { results } = await env.DB.prepare(`
      SELECT ${orderColumns}
      FROM orders_v2
      WHERE (? = '' OR lower(platform) = ?)
        AND order_id IN (${orderPlaceholders})
      ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
      LIMIT 12
    `).bind(platform, platform, ...safeOrderIds).all()
    orderRows = results || []
  }
  const orderIdsFound = orderRows.map(row => cleanText(row.order_id)).filter(Boolean)
  const itemMap = new Map()
  if (orderIdsFound.length && await tableExists(env, 'order_items')) {
    const itemPlaceholders = orderIdsFound.map(() => '?').join(',')
    const { results: itemRows } = await env.DB.prepare(`
      SELECT id, order_id, sku, product_name, qty, revenue_line, image_url, variation_name
      FROM order_items
      WHERE order_id IN (${itemPlaceholders})
      ORDER BY id ASC
    `).bind(...orderIdsFound).all()
    for (const item of itemRows || []) {
      const key = cleanText(item.order_id)
      if (!itemMap.has(key)) itemMap.set(key, [])
      itemMap.get(key).push(compactOrderItem(item))
    }
  }
  return new Map(orderRows.map(row => [cleanText(row.order_id), compactOrder(row, itemMap.get(cleanText(row.order_id)) || [])]))
}

async function enrichOrderCardsForMessages(env, conversation, messages = []) {
  const orderIds = collectOrderIdsForMessageCards(conversation, messages)
  if (!orderIds.length) return messages
  const orderMap = await loadExactChatOrdersForCards(env, conversation, orderIds)
  if (!orderMap.size) return messages
  return messages.map(message => {
    const mediaItems = normalizeMediaItems(message.media_items, message.raw_payload)
    const existingOrderIds = new Set(mediaItems.map(chatOrderIdFromCard).filter(Boolean))
    const nextMedia = mediaItems.map(item => {
      const orderId = chatOrderIdFromCard(item)
      return orderId && orderMap.has(orderId) ? { ...item, order: orderMap.get(orderId) } : item
    })
    const messageType = cleanText(message.message_type).toLowerCase()
    const canAddOrderCard = !messageType.includes('faq') && !messageType.includes('liveagent')
    for (const orderId of canAddOrderCard ? extractChatOrderIds(conversation, [message]) : []) {
      if (existingOrderIds.has(orderId) || !orderMap.has(orderId)) continue
      nextMedia.push({
        type: 'order',
        url: `/pages/oms-dashboard.html?focus_order=${encodeURIComponent(orderId)}`,
        name: `Đơn hàng ${orderId}`,
        order_sn: orderId,
        source: 'oms_order_match',
        order: orderMap.get(orderId)
      })
      existingOrderIds.add(orderId)
    }
    return { ...message, media_items: nextMedia }
  })
}

function summarizeChatConversations(rows, aliasToKey) {
  const platformMap = new Map()
  const seen = new Map()
  for (const row of rows || []) {
    const platform = cleanText(row.platform).toLowerCase()
    const shopKey = canonicalChatShopKeyForValues(platform, row.shop, row.shop_id, aliasToKey)
    const convKey = `${platform}|${shopKey || row.shop}|${row.conversation_id}`
    const unread = Number(row.unread_count || 0)
    const previous = seen.get(convKey)
    if (previous) {
      const summary = platformMap.get(platform)
      const nextUnread = Math.max(previous.unread, unread)
      summary.unread += nextUnread - previous.unread
      previous.unread = nextUnread
      continue
    }
    seen.set(convKey, { unread })
    const summary = platformMap.get(platform) || { platform, conversations: 0, unread: 0 }
    summary.conversations += 1
    summary.unread += unread
    platformMap.set(platform, summary)
  }
  return [...platformMap.values()]
}

function dedupeApiShopRows(rows = []) {
  const map = new Map()
  for (const row of rows || []) {
    const key = canonicalShopKeyForRecord(row)
    const current = map.get(key)
    if (!current) {
      map.set(key, row)
      continue
    }
    const currentScore = chatShopNameScore(current.shop_name || current.user_name, current.platform, current.api_shop_id)
    const nextScore = chatShopNameScore(row.shop_name || row.user_name, row.platform, row.api_shop_id)
    const currentToken = cleanText(current.chat_access_token || current.access_token)
    const nextToken = cleanText(row.chat_access_token || row.access_token)
    if (nextScore > currentScore || (!currentToken && nextToken)) map.set(key, row)
  }
  return [...map.values()]
}

Object.assign(globalThis, {
  collectProductCardsForMessageCards,
  compactChatProductVariationRows,
  loadExactChatProductsForCards,
  enrichProductCardsForMessages,
  collectOrderIdsForMessageCards,
  loadExactChatOrdersForCards,
  enrichOrderCardsForMessages,
  summarizeChatConversations,
  dedupeApiShopRows
})
