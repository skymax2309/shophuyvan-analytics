// NEO: Backend worker chat sàn - nhóm product-advisories. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function saveChatKnowledge(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id || 0)
  let platform = cleanText(body.platform).toLowerCase()
  let shop = cleanText(body.shop)
  if ((!platform || !shop) && body.conversation_id) {
    const conversation = await env.DB.prepare(`
      SELECT platform, shop, shop_id
      FROM marketplace_chat_conversations
      WHERE id = ? OR conversation_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(cleanText(body.conversation_id), cleanText(body.conversation_id)).first().catch(() => null)
    platform = platform || cleanText(conversation?.platform).toLowerCase()
    shop = shop || cleanText(conversation?.shop || conversation?.shop_id)
  }
  const category = cleanText(body.category || 'CSKH chung').slice(0, 120)
  const question = cleanText(body.question || body.user_query).slice(0, 1000)
  const answer = cleanText(body.answer || body.ai_response).slice(0, 1800)
  const status = normalizeKnowledgeStatus(body.status || 'approved', 'approved')
  if (!question || !answer) return json({ error: 'Cần có câu hỏi của khách và câu trả lời mẫu.' }, cors, 400)
  const normalizedQuestion = normalizeKeywordText(question)
  const keywords = chatKnowledgeKeywords(question, answer, category)
  const sourceType = cleanText(body.source_type || 'manual').slice(0, 80)
  const sourceMessageId = cleanText(body.source_message_id).slice(0, 160)
  const priority = Math.min(Math.max(Number(body.priority || 0) || 0, -10), 10)
  const expiresAt = cleanText(body.expires_at).slice(0, 80)
  const approvedBy = cleanText(body.approved_by || 'Admin').slice(0, 120)

  if (id) {
    await env.DB.prepare(`
      UPDATE chat_knowledge
      SET platform = ?, shop = ?, category = ?, question = ?, answer = ?,
          normalized_question = ?, keywords = ?, status = ?, source_type = ?,
          source_message_id = ?, priority = ?, expires_at = ?, approved_by = ?,
          updated_at = datetime('now', '+7 hours')
      WHERE id = ?
    `).bind(
      platform, shop, category, question, answer, normalizedQuestion,
      safeJsonStringify(keywords, '[]'), status, sourceType, sourceMessageId,
      priority, expiresAt, approvedBy, id
    ).run()
  } else {
    await env.DB.prepare(`
      INSERT INTO chat_knowledge
        (platform, shop, category, question, answer, normalized_question, keywords,
         status, source_type, source_message_id, priority, expires_at, approved_by,
         updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    `).bind(
      platform, shop, category, question, answer, normalizedQuestion,
      safeJsonStringify(keywords, '[]'), status, sourceType, sourceMessageId,
      priority, expiresAt, approvedBy
    ).run()
  }

  const saved = id
    ? await env.DB.prepare('SELECT * FROM chat_knowledge WHERE id = ? LIMIT 1').bind(id).first()
    : await env.DB.prepare('SELECT * FROM chat_knowledge ORDER BY id DESC LIMIT 1').first()
  return json({ status: 'ok', knowledge: compactChatKnowledgeRow(saved, true) }, cors)
}

function normalizeProductAdvisoryStatus(value, fallback = 'active') {
  const text = cleanText(value || fallback).toLowerCase()
  if (['active', 'paused', 'archived'].includes(text)) return text
  return fallback
}

function normalizeProductAdvisoryTrigger(value, fallback = 'keyword') {
  const text = cleanText(value || fallback).toLowerCase().replace(/[\s-]+/g, '_')
  if (['keyword', 'sku', 'item_id', 'category'].includes(text)) return text
  return fallback
}

function normalizeProductAdvisorySeverity(value, fallback = 'required') {
  const text = cleanText(value || fallback).toLowerCase()
  if (['info', 'warning', 'required'].includes(text)) return text
  return fallback
}

function compactProductAdvisoryRow(row = {}, match = null) {
  const relatedItemId = cleanText(row.related_item_id)
  const relatedUrl = cleanText(row.related_product_url)
  const platform = cleanText(row.platform).toLowerCase()
  const shopId = cleanText(row.shop_id)
  return {
    id: Number(row.id || 0),
    platform,
    shop: cleanText(row.shop),
    shop_id: shopId,
    trigger_type: normalizeProductAdvisoryTrigger(row.trigger_type),
    trigger_value: cleanText(row.trigger_value),
    trigger_keywords: productArray(row.trigger_keywords).map(cleanText).filter(Boolean),
    title: limitText(row.title, 160),
    message: limitText(row.message, 1800),
    related_item_id: relatedItemId,
    related_product_name: limitText(row.related_product_name, 220),
    related_product_url: relatedUrl || (platform === 'shopee' && shopId && relatedItemId ? shopeeProductCardUrl(shopId, relatedItemId) : ''),
    severity: normalizeProductAdvisorySeverity(row.severity),
    status: normalizeProductAdvisoryStatus(row.status),
    priority: Number(row.priority || 0),
    usage_count: Number(row.usage_count || 0),
    last_used_at: cleanText(row.last_used_at),
    approved_by: cleanText(row.approved_by),
    updated_at: cleanText(row.updated_at || row.created_at),
    created_at: cleanText(row.created_at),
    match: match ? {
      score: Number(match.score || 0),
      reason: cleanText(match.reason),
      product: match.product || null
    } : null
  }
}

function addProductAdvisorySignal(target, input = {}, source = '') {
  if (!input || typeof input !== 'object') return
  const itemId = cleanText(input.platform_item_id || input.item_id || input.itemId || input.product_id || input.productId)
  const sku = cleanText(input.item_sku || input.platform_sku || input.internal_sku || input.sku || input.model_sku || input.variation_sku)
  const name = cleanText(input.product_name || input.item_name || input.name || input.title || input.variation_name || input.model_name)
  const category = cleanText(input.category_id || input.category_name || input.category || input.primary_category)
  const url = cleanText(input.product_url || input.item_url || input.url || input.link)
  const imageUrl = cleanText(input.image_url || input.thumbnail_url || (Array.isArray(input.images) ? input.images[0] : ''))
  if (itemId) target.itemIds.add(itemId)
  if (sku) target.skus.add(sku)
  if (category) target.categories.add(category)
  const variations = productArray(input.variations)
  for (const variation of variations) {
    const variationSku = cleanText(variation.sku || variation.platform_sku || variation.model_sku)
    const variationName = cleanText(variation.variation_name || variation.model_name || variation.name)
    if (variationSku) target.skus.add(variationSku)
    if (variationName) target.texts.push(variationName)
  }
  const text = [itemId, sku, name, category, url, source].map(cleanText).filter(Boolean).join(' ')
  if (text) target.texts.push(text)
  if (itemId || sku || name) {
    target.products.push({
      item_id: itemId,
      sku,
      name,
      category,
      image_url: imageUrl,
      product_url: url,
      source: cleanText(source)
    })
  }
}

function collectProductAdvisorySignals(context = {}) {
  // Gom tín hiệu từ đơn hàng, thẻ sản phẩm và nội dung chat để rule không phụ thuộc một nguồn duy nhất.
  const target = {
    itemIds: new Set(),
    skus: new Set(),
    categories: new Set(),
    texts: [],
    products: []
  }
  const conversation = context.conversation || {}
  const marketplace = context.marketplace_context || context || {}
  target.texts.push(cleanText(conversation.last_message || conversation.buyer_name))
  for (const message of context.messages || []) {
    target.texts.push(cleanText(message.content || message.message))
    for (const item of normalizeMediaItems(message.media_items, message.raw_payload)) {
      addProductAdvisorySignal(target, {
        item_id: item.item_id,
        product_id: item.product_id,
        shop_id: item.shop_id,
        name: item.name,
        product_url: item.url,
        image_url: item.thumbnail_url,
        ...(item.product || {})
      }, 'chat_card')
    }
  }
  for (const order of marketplace.orders || []) {
    target.texts.push(cleanText(order.order_id || order.customer_name))
    for (const item of order.items || []) addProductAdvisorySignal(target, item, 'order_item')
  }
  for (const product of marketplace.products || []) addProductAdvisorySignal(target, product, 'matched_product')
  for (const product of marketplace.product_catalog || []) addProductAdvisorySignal(target, product, 'catalog_detail')
  for (const product of marketplace.product_catalog_index || []) addProductAdvisorySignal(target, product, 'catalog_index')
  return {
    itemIds: new Set([...target.itemIds].map(cleanText).filter(Boolean)),
    skus: new Set([...target.skus].map(cleanText).filter(Boolean)),
    normalizedSkus: new Set([...target.skus].map(normalizeKeywordText).filter(Boolean)),
    categories: new Set([...target.categories].map(normalizeKeywordText).filter(Boolean)),
    text: normalizeKeywordText([...target.texts, ...target.itemIds, ...target.skus, ...target.categories].join(' ')),
    products: target.products.slice(0, 30)
  }
}

function scoreProductAdvisoryRow(row, signals, platform = '', shopAliases = []) {
  const triggerType = normalizeProductAdvisoryTrigger(row.trigger_type)
  const triggerValue = cleanText(row.trigger_value)
  const normalizedTrigger = normalizeKeywordText(triggerValue)
  const rowPlatform = cleanText(row.platform).toLowerCase()
  const rowShop = cleanText(row.shop)
  const rowShopId = cleanText(row.shop_id)
  let score = Number(row.priority || 0)
  let reason = ''
  let matchedProduct = null
  if (!rowPlatform || rowPlatform === platform) score += 15
  if (!rowShop && !rowShopId) score += 6
  if ((rowShop && shopAliases.includes(rowShop)) || (rowShopId && shopAliases.includes(rowShopId))) score += 18

  if (triggerType === 'item_id') {
    if (signals.itemIds.has(triggerValue)) {
      score += 500
      reason = `Khớp item ${triggerValue}`
      matchedProduct = signals.products.find(item => cleanText(item.item_id) === triggerValue) || null
    }
  } else if (triggerType === 'sku') {
    const skuHit = signals.skus.has(triggerValue) || signals.normalizedSkus.has(normalizedTrigger)
    if (skuHit) {
      score += 420
      reason = `Khớp SKU ${triggerValue}`
      matchedProduct = signals.products.find(item => cleanText(item.sku) === triggerValue || normalizeKeywordText(item.sku) === normalizedTrigger) || null
    }
  } else if (triggerType === 'category') {
    if (normalizedTrigger && (signals.categories.has(normalizedTrigger) || signals.text.includes(normalizedTrigger))) {
      score += 260
      reason = `Khớp nhóm ${triggerValue}`
    }
  } else if (normalizedTrigger && signals.text.includes(normalizedTrigger)) {
    score += normalizedTrigger.length >= 8 ? 260 : 180
    reason = `Khớp từ khóa ${triggerValue}`
    matchedProduct = signals.products.find(item => normalizeKeywordText([item.name, item.sku, item.item_id].join(' ')).includes(normalizedTrigger)) || null
  }

  for (const keyword of productArray(row.trigger_keywords).map(normalizeKeywordText).filter(Boolean)) {
    if (signals.text.includes(keyword)) {
      score += keyword.length >= 8 ? 80 : 35
      if (!reason) reason = `Khớp từ khóa ${keyword}`
    }
  }
  if (normalizeProductAdvisorySeverity(row.severity) === 'required') score += 25
  return { score, reason, product: matchedProduct }
}

async function loadProductAdvisoriesForChat(env, conversation, marketplaceContext = {}, messages = [], limit = 8) {
  if (!conversation || !(await tableExists(env, 'chat_product_advisories'))) return []
  const platform = cleanText(conversation.platform).toLowerCase()
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const aliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const shopAliases = aliases.length ? aliases : [shop, shopId].map(cleanText).filter(Boolean)
  const shopPlaceholders = shopAliases.length ? shopAliases.map(() => '?').join(',') : ''
  const where = [
    "status = 'active'",
    platform ? "(platform = ? OR platform = ? OR platform = '')" : '1 = 1',
    shopAliases.length ? `(shop IN (${shopPlaceholders}) OR shop_id IN (${shopPlaceholders}) OR (shop = '' AND shop_id = ''))` : "(shop = '' AND shop_id = '')"
  ]
  const params = platform ? [platform, platform.toUpperCase(), ...shopAliases, ...shopAliases] : [...shopAliases, ...shopAliases]
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM chat_product_advisories
    WHERE ${where.join(' AND ')}
    ORDER BY priority DESC, datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT 400
  `).bind(...params).all()
  const signals = collectProductAdvisorySignals({
    conversation,
    messages,
    marketplace_context: marketplaceContext
  })
  const matched = (results || [])
    .map(row => ({ row, match: scoreProductAdvisoryRow(row, signals, platform, shopAliases) }))
    .filter(item => item.match.score >= 180 && item.match.reason)
    .sort((a, b) => b.match.score - a.match.score || Number(b.row.priority || 0) - Number(a.row.priority || 0))
    .slice(0, Math.min(Math.max(Number(limit) || 8, 1), 12))
  const rows = matched.map(item => compactProductAdvisoryRow(item.row, item.match))
  if (rows.length) {
    const ids = rows.map(row => row.id).filter(Boolean)
    const placeholders = ids.map(() => '?').join(',')
    env.DB.prepare(`
      UPDATE chat_product_advisories
      SET usage_count = COALESCE(usage_count, 0) + 1,
          last_used_at = datetime('now', '+7 hours')
      WHERE id IN (${placeholders})
    `).bind(...ids).run().catch(() => null)
  }
  return rows
}

async function listProductAdvisories(request, env, cors) {
  await ensureChatTables(env)
  const url = new URL(request.url)
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shop = cleanText(url.searchParams.get('shop'))
  const status = normalizeProductAdvisoryStatus(url.searchParams.get('status') || 'active', 'active')
  const query = normalizeKeywordText(url.searchParams.get('q') || '')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 80) || 80, 5), 200)
  const where = ['status = ?']
  const params = [status]
  if (platform) {
    where.push("(platform = ? OR platform = ? OR platform = '')")
    params.push(platform, platform.toUpperCase())
  }
  if (shop) {
    where.push("(shop = ? OR shop_id = ? OR (shop = '' AND shop_id = ''))")
    params.push(shop, shop)
  }
  if (query) {
    where.push('(lower(trigger_value) LIKE ? OR lower(title) LIKE ? OR lower(message) LIKE ? OR lower(related_product_name) LIKE ? OR lower(trigger_keywords) LIKE ?)')
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
  }
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM chat_product_advisories
    WHERE ${where.join(' AND ')}
    ORDER BY priority DESC, datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT ?
  `).bind(...params, limit).all()
  return json({
    status: 'ok',
    advisories: (results || []).map(row => compactProductAdvisoryRow(row))
  }, cors)
}

Object.assign(globalThis, {
  saveChatKnowledge,
  normalizeProductAdvisoryStatus,
  normalizeProductAdvisoryTrigger,
  normalizeProductAdvisorySeverity,
  compactProductAdvisoryRow,
  addProductAdvisorySignal,
  collectProductAdvisorySignals,
  scoreProductAdvisoryRow,
  loadProductAdvisoriesForChat,
  listProductAdvisories
})
