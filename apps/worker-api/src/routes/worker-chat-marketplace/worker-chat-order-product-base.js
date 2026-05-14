// NEO: Backend worker chat sàn - nhóm order-product-base. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function detectShopContactPolicyReply(message = '') {
  const normalized = normalizeKeywordText(message)
  if (!normalized) return ''

  const askTerms = ['xin', 'cho', 'gui', 'cung cap', 'co', 'lien he', 'ib', 'inbox', 'nhan']
  const shopTerms = ['shop', 'cua hang', 'ben minh', 'ben shop', 'showroom', 'kho']
  const channelTerms = ['zalo', 'facebook', 'messenger', 'telegram', 'whatsapp']
  const phoneTerms = ['sdt', 'so dien thoai', 'dien thoai', 'so dt', 'hotline', 'phone']
  const addressTerms = ['dia chi', 'address']
  const genericContactTerms = ['thong tin shop', 'thong tin lien he', 'lien he shop', 'cach lien he']
  const outsidePaymentTerms = ['chuyen khoan', 'so tai khoan', 'stk', 'ngan hang', 'momo', 'dat coc', 'thanh toan ngoai', 'giam rieng']

  const asksForChannel = hasNormalizedTerm(normalized, channelTerms)
    && (hasNormalizedTerm(normalized, askTerms) || hasNormalizedTerm(normalized, shopTerms))
  const asksForPhone = hasNormalizedTerm(normalized, phoneTerms)
    && (hasNormalizedTerm(normalized, askTerms) || hasNormalizedTerm(normalized, shopTerms))
  const asksForAddress = hasNormalizedTerm(normalized, addressTerms)
    && (
      hasNormalizedTerm(normalized, ['dia chi shop', 'dia chi cua hang', 'dia chi kho', 'dia chi showroom', 'qua shop', 'den shop', 'den cua hang'])
      || hasNormalizedTerm(normalized, shopTerms)
    )
  const asksGenericContact = hasNormalizedTerm(normalized, genericContactTerms)

  if (hasNormalizedTerm(normalized, outsidePaymentTerms)) {
    return CHAT_AI_SUPPORT_PAYMENT_POLICY_REPLY
  }
  if (asksForChannel || asksForPhone || asksForAddress || asksGenericContact) {
    // Trả lời cứng ở backend để dù AI, prompt hay fallback có đổi thì vẫn không lộ thông tin liên hệ trên sàn.
    return CHAT_SHOP_CONTACT_POLICY_REPLY
  }
  return ''
}

async function tableExists(env, tableName) {
  const cacheKey = cleanText(tableName).toLowerCase()
  const cached = chatTableExistsCache.get(cacheKey)
  if (cached && (Date.now() - cached.at) < CHAT_TABLE_EXISTS_CACHE_MS) return cached.exists
  try {
    const row = await env.DB.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1
    `).bind(tableName).first()
    const exists = Boolean(row?.name)
    if (cacheKey) chatTableExistsCache.set(cacheKey, { exists, at: Date.now() })
    return exists
  } catch {
    return false
  }
}

function compactOrderItem(row) {
  const cleanVisibleText = value => cleanText(value)
    .replace(/\s*\/\/\s*NEO:[^\r\n]*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return {
    id: Number(row.id || 0),
    order_id: cleanText(row.order_id),
    sku: cleanText(row.sku),
    product_name: cleanVisibleText(row.product_name),
    variation_name: cleanVisibleText(row.variation_name),
    qty: Number(row.qty || 0),
    revenue_line: Number(row.revenue_line || 0),
    image_url: cleanText(row.image_url)
  }
}

function compactOrder(row, items = []) {
  return {
    id: Number(row.id || 0),
    order_id: cleanText(row.order_id),
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    order_date: cleanText(row.order_date),
    revenue: Number(row.revenue || row.net_revenue || 0),
    net_revenue: Number(row.net_revenue || 0),
    discount_shop: Number(row.discount_shop || 0),
    discount_shopee: Number(row.discount_shopee || 0),
    shipping_carrier: cleanText(row.shipping_carrier),
    tracking_number: cleanText(row.tracking_number),
    oms_status: cleanText(row.oms_status),
    shipping_status: cleanText(row.shipping_status),
    customer_name: cleanText(row.customer_name),
    customer_phone: cleanText(row.customer_phone),
    created_at: cleanText(row.created_at),
    items
  }
}

function compactChatOrderMatch(row, items = [], options = {}) {
  const match = chatOrderMatchMeta(options.match_type || CHAT_ORDER_MATCH_HARD)
  return {
    ...compactOrder(row, items),
    ...match,
    match_reason: cleanText(options.match_reason),
    match_source: cleanText(options.match_source),
    match_confidence: Number(options.match_confidence || 0)
  }
}

function normalizeOrderIdCandidate(value, options = {}) {
  const text = cleanText(value).toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (text.length < 8 || text.length > 32) return ''
  if (/^\d+$/.test(text)) {
    return options.allowNumeric && text.length >= 12 ? text : ''
  }
  if (!/[0-9]/.test(text) || !/[A-Z]/.test(text)) return ''
  return text
}

function addOrderIdCandidate(target, value, options = {}) {
  const orderId = normalizeOrderIdCandidate(value, options)
  if (orderId) target.add(orderId)
}

function isOrderIdKey(key) {
  const cleanKey = cleanText(key).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!cleanKey) return false
  if (/^(ordersn|orderid|orderno|ordernumber|shopordersn|orders)$/.test(cleanKey)) return true
  return cleanKey.includes('order') && /(sn|id|no|number|list|ids)/.test(cleanKey)
}

function collectOrderIdsFromObject(value, target, depth = 0, forceCandidate = false) {
  if (!value || typeof value !== 'object' || depth > 5) return
  if (Array.isArray(value)) {
    value.slice(0, 30).forEach(item => {
      if (forceCandidate && (typeof item === 'string' || typeof item === 'number')) {
        addOrderIdCandidate(target, item, { allowNumeric: true })
      } else {
        collectOrderIdsFromObject(item, target, depth + 1, forceCandidate)
      }
    })
    return
  }
  for (const [key, raw] of Object.entries(value)) {
    const orderKey = isOrderIdKey(key)
    if (orderKey && (typeof raw === 'string' || typeof raw === 'number')) {
      addOrderIdCandidate(target, raw, { allowNumeric: true })
    }
    if (raw && typeof raw === 'object') {
      collectOrderIdsFromObject(raw, target, depth + 1, forceCandidate || orderKey)
    }
  }
}

function extractChatOrderIds(conversation, messages = []) {
  const found = new Set()
  const texts = [
    conversation?.last_message,
    ...(Array.isArray(messages) ? messages.flatMap(msg => [
      msg?.content,
      msg?.message,
      msg?.raw_payload
    ]) : [])
  ].map(cleanText).filter(Boolean)

  for (const raw of texts) {
    const parsed = safeJsonParse(raw, null)
    if (parsed && typeof parsed === 'object') {
      collectOrderIdsFromObject(parsed, found)
      continue
    }
    const upper = raw.toUpperCase()
    const hasOrderHint = /ORDER|ORDER_SN|ORDER_ID|DON HANG|ĐƠN HÀNG|MA DON|MÃ ĐƠN|THẺ ĐƠN/i.test(raw)
    const hinted = upper.match(/(?:ORDER(?:[_\s-]*(?:SN|ID|NO|NUMBER))?|DON\s*HANG|MA\s*DON|MÃ\s*ĐƠN|ĐƠN\s*HÀNG|THẺ\s*ĐƠN)[^0-9A-Z]{0,20}([0-9A-Z]{8,32})/gi) || []
    for (const hit of hinted) {
      const match = hit.toUpperCase().match(/([0-9]{6}[0-9A-Z]{6,24}|\d{12,32}|[0-9A-Z]{10,32})$/)
      if (match) addOrderIdCandidate(found, match[1], { allowNumeric: true })
    }
    const matches = upper.match(/\b(?:[0-9]{6}[0-9A-Z]{6,24}|\d{12,32})\b/g) || []
    for (const match of matches) {
      if (hasOrderHint || /^[0-9]{6}[0-9A-Z]{6,24}$/.test(match)) {
        addOrderIdCandidate(found, match, { allowNumeric: true })
      }
    }
  }

  for (const msg of Array.isArray(messages) ? messages : []) {
    collectOrderIdsFromObject(msg, found)
    const mediaItems = safeJsonParse(msg?.media_items, null)
    if (mediaItems && typeof mediaItems === 'object') collectOrderIdsFromObject(mediaItems, found)
    const rawPayload = safeJsonParse(msg?.raw_payload, null)
    if (rawPayload && typeof rawPayload === 'object') collectOrderIdsFromObject(rawPayload, found)
  }

  return [...found].slice(0, 12)
}

function normalizePhoneDigits(value) {
  const digits = cleanText(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`
  return digits
}

function isUsefulBuyerName(value) {
  const text = cleanText(value)
  const normalized = normalizeKeywordText(text)
  if (text.length < 4 || text.length > 80) return false
  if (!/[a-zA-ZÀ-ỹ]/.test(text)) return false
  if (/^\d+$/.test(text)) return false
  if (/^(khach hang|customer|buyer|nguoi mua|shopee user|lazada user|webchat|unknown)$/i.test(normalized)) return false
  if (/^webchat[-_\d]+$/i.test(normalized)) return false
  return true
}

function chatSqlBuyerNameMergeExpression() {
  return `
    CASE
      WHEN excluded.buyer_name != ''
        AND lower(trim(excluded.buyer_name)) NOT IN ('khách hàng', 'khach hang', 'customer', 'buyer', 'người mua', 'nguoi mua', 'unknown')
      THEN excluded.buyer_name
      ELSE marketplace_chat_conversations.buyer_name
    END
  `
}

function buildBuyerOrderLookup(conversation, messages = []) {
  const buyerName = cleanText(conversation?.buyer_name)
  const buyerId = cleanText(conversation?.buyer_id)
  const names = []
  const phones = []
  if (isUsefulBuyerName(buyerName)) names.push(buyerName)
  // Một số hội thoại API vẫn có lúc lưu buyer_name thành buyer_id số.
  // Khi đó phải nhìn lại tin nhắn thật trong thread để lấy đúng tên khách trước khi khớp đơn OMS.
  for (const message of Array.isArray(messages) ? messages : []) {
    if (cleanText(message?.sender_type).toLowerCase() === 'shop') continue
    const senderName = cleanText(message?.sender_name)
    if (isUsefulBuyerName(senderName)) names.push(senderName)
    const senderId = cleanText(message?.sender_id)
    const senderPhone = normalizePhoneDigits(senderId || senderName)
    if (
      (senderPhone.startsWith('0') && senderPhone.length >= 10 && senderPhone.length <= 11)
      || (senderPhone.startsWith('84') && senderPhone.length >= 11 && senderPhone.length <= 12)
    ) {
      phones.push(senderPhone)
    }
  }
  for (const value of [buyerName, buyerId]) {
    const phone = normalizePhoneDigits(value)
    if ((phone.startsWith('0') && phone.length >= 10 && phone.length <= 11) || (phone.startsWith('84') && phone.length >= 11 && phone.length <= 12)) {
      phones.push(phone)
    }
  }
  return {
    names: [...new Set(names)],
    phones: [...new Set(phones)]
  }
}

async function loadChatOrderSyncShop(env, platform, shop, shopId, shopAliases = []) {
  const normalizedPlatform = cleanText(platform).toLowerCase()
  if (!normalizedPlatform) return null
  const aliases = [...new Set([shop, shopId, ...shopAliases].map(value => cleanText(value).toLowerCase()).filter(Boolean))]
  if (!aliases.length) return null
  const placeholders = aliases.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id, api_partner_id, api_partner_key,
           access_token, refresh_token,
           CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 1 ELSE 0 END AS has_access_token,
           CASE WHEN refresh_token IS NOT NULL AND refresh_token != '' THEN 1 ELSE 0 END AS has_refresh_token,
           token_expire_at, api_connected_at, api_refresh_expire_at
    FROM shops
    WHERE lower(platform) = ?
      AND (
        lower(COALESCE(shop_name, '')) IN (${placeholders})
        OR lower(COALESCE(user_name, '')) IN (${placeholders})
        OR lower(COALESCE(api_shop_id, '')) IN (${placeholders})
      )
    ORDER BY id DESC
    LIMIT 1
  `).bind(normalizedPlatform, ...aliases, ...aliases, ...aliases).all().catch(() => ({ results: [] }))
  return results?.[0] || null
}

function compactProduct(row) {
  return {
    id: Number(row.id || 0),
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    platform_item_id: cleanText(row.platform_item_id),
    product_name: cleanText(row.product_name),
    variation_name: cleanText(row.variation_name),
    platform_sku: cleanText(row.platform_sku || row.sku),
    internal_sku: cleanText(row.internal_sku || row.sku),
    image_url: cleanText(row.image_url),
    price: Number(row.price || row.discount_price || 0),
    discount_price: Number(row.discount_price || 0),
    stock: Number(row.stock || 0),
    map_status: cleanText(row.map_status),
    updated_at: cleanText(row.updated_at || row.created_at)
  }
}

function productArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value, [])
    return Array.isArray(parsed) ? parsed : []
  }
  return []
}

function productObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value, {})
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }
  return {}
}

function productTextFrom(value, fields = []) {
  for (const field of fields) {
    const text = cleanText(value?.[field])
    if (text) return text
  }
  return ''
}

function normalizeKnowledgeImages(product) {
  const direct = productArray(product.images)
  const fallback = [product.image_url, product.main_image, product.variation_image]
  return [...direct, ...fallback]
    .map(cleanText)
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 16)
}

Object.assign(globalThis, {
  detectShopContactPolicyReply,
  tableExists,
  compactOrderItem,
  compactOrder,
  compactChatOrderMatch,
  normalizeOrderIdCandidate,
  addOrderIdCandidate,
  isOrderIdKey,
  collectOrderIdsFromObject,
  extractChatOrderIds,
  normalizePhoneDigits,
  isUsefulBuyerName,
  chatSqlBuyerNameMergeExpression,
  buildBuyerOrderLookup,
  loadChatOrderSyncShop,
  compactProduct,
  productArray,
  productObject,
  productTextFrom,
  normalizeKnowledgeImages
})
