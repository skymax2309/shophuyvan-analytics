// NEO: Backend worker chat sàn - nhóm product-knowledge-normalize. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function normalizeKnowledgeVariations(product) {
  const variations = productArray(product.variations)
  return variations.map((variation, index) => {
    const sku = cleanText(variation?.sku || variation?.platform_sku || variation?.SellerSku || variation?.seller_sku || variation?.model_sku)
    const price = Number(variation?.price || variation?.original_price || 0) || 0
    const discountPrice = Number(variation?.discount_price || variation?.special_price || variation?.current_price || 0) || 0
    return {
      variation_name: cleanText(variation?.variation_name || variation?.model_name || variation?.name || variation?.ShopSku || variation?.shop_sku) || (index ? `Phan loai ${index + 1}` : 'Mac dinh'),
      sku,
      model_id: cleanText(variation?.model_id),
      price,
      discount_price: discountPrice,
      stock: Number(variation?.stock ?? variation?.quantity ?? variation?.available ?? 0) || 0,
      image_url: cleanText(variation?.variation_image || variation?.image_url || variation?.main_image),
      promotion_type: cleanText(variation?.promotion_type),
      promotion_id: cleanText(variation?.promotion_id),
      promotion_staging: cleanText(variation?.promotion_staging),
      promotion_price: Number(variation?.promotion_price || 0) || 0,
      promotion_start_time: Number(variation?.promotion_start_time || variation?.start_time || 0) || 0,
      promotion_end_time: Number(variation?.promotion_end_time || variation?.end_time || 0) || 0,
      promotion_reserved_stock: Number(variation?.promotion_reserved_stock || 0) || 0
    }
  }).filter(item => item.sku || item.variation_name)
}

function normalizePromotionSummary(product) {
  const rows = productArray(product.promotion_summary || product.promotions || product.promotion)
  const dedupe = new Map()
  for (const row of rows) {
    const promotionId = cleanText(row?.promotion_id)
    const modelId = cleanText(row?.model_id)
    const key = `${promotionId}|${modelId}|${cleanText(row?.promotion_type)}`
    if (!key.replace(/\|/g, '')) continue
    dedupe.set(key, {
      promotion_type: cleanText(row?.promotion_type),
      promotion_id: promotionId,
      model_id: modelId,
      promotion_staging: cleanText(row?.promotion_staging),
      start_time: Number(row?.start_time || 0) || 0,
      end_time: Number(row?.end_time || 0) || 0,
      promotion_price: Number(row?.promotion_price || row?.price || 0) || 0,
      total_reserved_stock: Number(row?.total_reserved_stock || 0) || 0
    })
  }
  return [...dedupe.values()]
}

function normalizeViolationSummary(product) {
  const rows = productArray(product.violation_summary || product.violations || product.violation_list)
  return rows.map(row => ({
    source_scope: cleanText(row?.source_scope || row?.scope || row?.source || 'status'),
    violation_type: cleanText(row?.violation_type),
    violation_reason: cleanText(row?.violation_reason),
    suggestion: limitText(row?.suggestion, 1000),
    fix_deadline_time: Number(row?.fix_deadline_time || 0) || 0,
    update_time: Number(row?.update_time || 0) || 0
  })).filter(row => row.violation_type || row.violation_reason || row.suggestion)
}

function normalizeSuggestedCategories(product) {
  const rows = productArray(product.suggested_categories || product.suggested_category)
  return rows.map(row => ({
    category_id: cleanText(row?.category_id),
    category_name: cleanText(row?.category_name || row?.display_name || row?.name)
  })).filter(row => row.category_id || row.category_name)
}

function normalizeProductKnowledgeInput(input = {}) {
  const platform = cleanText(input.platform).toLowerCase()
  const shop = cleanText(input.shop)
  const shopId = cleanText(input.shop_id || input.shopId || input.api_shop_id)
  const product = input.product || input
  const itemId = cleanText(product.item_id || product.itemId || product.platform_item_id || product.platform_itemId || product.id)
  if (!platform || !itemId) return null
  const images = normalizeKnowledgeImages(product)
  const variations = normalizeKnowledgeVariations(product)
  const promotionSummary = normalizePromotionSummary(product)
  const violationSummary = normalizeViolationSummary(product)
  const suggestedCategories = normalizeSuggestedCategories(product)
  return {
    platform,
    shop,
    shop_id: shopId,
    platform_item_id: itemId,
    product_name: limitText(product.product_name || product.item_name || product.name, 500),
    description: limitText(product.description || product.short_description || product.detail, 30000),
    video_url: limitText(product.video_url || product.video || product.videoUrl, 1000),
    images,
    category_id: limitText(product.category_id || product.primary_category || product.category, 500),
    brand_name: limitText(product.brand_name || product.brand || product.Brand, 500),
    item_sku: limitText(product.item_sku || product.seller_sku || product.SellerSku || variations[0]?.sku, 500),
    weight: limitText(product.weight || product.package_weight, 300),
    dimensions: product.dimensions || product.dimension || product.package_dimension || {},
    attributes: product.attributes || product.attribute_list || {},
    logistics: product.logistics || product.logistic_info || [],
    variations,
    promotion_summary: promotionSummary,
    violation_summary: violationSummary,
    suggested_categories: suggestedCategories,
    deboost: Number(product.deboost || 0) ? 1 : 0,
    raw_listing: product.raw_listing || product.raw || product,
    source: cleanText(input.source || product.source || 'api') || 'api'
  }
}

async function saveProductKnowledgeBatch(env, input = {}) {
  await ensureProductKnowledgeTables(env)
  const platform = cleanText(input.platform).toLowerCase()
  const shop = cleanText(input.shop)
  const shopId = cleanText(input.shop_id || input.shopId || input.api_shop_id)
  const source = cleanText(input.source || 'api') || 'api'
  const products = Array.isArray(input.products) ? input.products : []
  const stmts = []
  let skipped = 0

  for (const product of products) {
    const row = normalizeProductKnowledgeInput({ platform, shop, shop_id: shopId, source, product })
    if (!row) {
      skipped++
      continue
    }
    stmts.push(env.DB.prepare(`
      INSERT INTO marketplace_product_knowledge
        (platform, shop, shop_id, platform_item_id, product_name, description, video_url,
         images, category_id, brand_name, item_sku, weight, dimensions, attributes,
         logistics, variations, promotion_summary, violation_summary, suggested_categories, deboost,
         raw_listing, source, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
      ON CONFLICT(platform, shop, platform_item_id) DO UPDATE SET
        shop_id = CASE WHEN excluded.shop_id != '' THEN excluded.shop_id ELSE marketplace_product_knowledge.shop_id END,
        product_name = CASE WHEN excluded.product_name != '' THEN excluded.product_name ELSE marketplace_product_knowledge.product_name END,
        description = CASE WHEN excluded.description != '' THEN excluded.description ELSE marketplace_product_knowledge.description END,
        video_url = CASE WHEN excluded.video_url != '' THEN excluded.video_url ELSE marketplace_product_knowledge.video_url END,
        images = CASE WHEN excluded.images != '[]' THEN excluded.images ELSE marketplace_product_knowledge.images END,
        category_id = CASE WHEN excluded.category_id != '' THEN excluded.category_id ELSE marketplace_product_knowledge.category_id END,
        brand_name = CASE WHEN excluded.brand_name != '' THEN excluded.brand_name ELSE marketplace_product_knowledge.brand_name END,
        item_sku = CASE WHEN excluded.item_sku != '' THEN excluded.item_sku ELSE marketplace_product_knowledge.item_sku END,
        weight = CASE WHEN excluded.weight != '' THEN excluded.weight ELSE marketplace_product_knowledge.weight END,
        dimensions = CASE WHEN excluded.dimensions != '{}' THEN excluded.dimensions ELSE marketplace_product_knowledge.dimensions END,
        attributes = CASE WHEN excluded.attributes != '{}' AND excluded.attributes != '[]' THEN excluded.attributes ELSE marketplace_product_knowledge.attributes END,
        logistics = CASE WHEN excluded.logistics != '[]' THEN excluded.logistics ELSE marketplace_product_knowledge.logistics END,
        variations = CASE WHEN excluded.variations != '[]' THEN excluded.variations ELSE marketplace_product_knowledge.variations END,
        promotion_summary = excluded.promotion_summary,
        violation_summary = excluded.violation_summary,
        suggested_categories = excluded.suggested_categories,
        deboost = excluded.deboost,
        raw_listing = CASE WHEN excluded.raw_listing != '{}' THEN excluded.raw_listing ELSE marketplace_product_knowledge.raw_listing END,
        source = excluded.source,
        updated_at = datetime('now', '+7 hours')
    `).bind(
      row.platform,
      row.shop,
      row.shop_id,
      row.platform_item_id,
      row.product_name,
      row.description,
      row.video_url,
      safeJsonStringify(row.images, '[]'),
      row.category_id,
      row.brand_name,
      row.item_sku,
      row.weight,
      safeJsonStringify(row.dimensions, '{}'),
      safeJsonStringify(row.attributes, '{}'),
      safeJsonStringify(row.logistics, '[]'),
      safeJsonStringify(row.variations, '[]'),
      safeJsonStringify(row.promotion_summary, '[]'),
      safeJsonStringify(row.violation_summary, '[]'),
      safeJsonStringify(row.suggested_categories, '[]'),
      Number(row.deboost || 0) ? 1 : 0,
      limitText(safeJsonStringify(row.raw_listing, '{}'), 120000),
      row.source
    ))
  }

  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50))
  }

  return { saved: stmts.length, skipped }
}

function compactKnowledgeAttributes(value, limit = 16) {
  const source = productObject(value)
  const arraySource = Array.isArray(value) ? value : (Array.isArray(safeJsonParse(value, null)) ? safeJsonParse(value, []) : null)
  const rows = arraySource || Object.entries(source).map(([name, val]) => ({ name, value: val }))
  return rows.map(item => {
    const name = cleanText(item?.attribute_name || item?.name || item?.key || item?.attribute_id)
    const val = cleanText(item?.value || item?.attribute_value || item?.value_name || item?.values || item?.val)
    if (!name && !val) return null
    return { name: limitText(name, 120), value: limitText(val, 240) }
  }).filter(Boolean).slice(0, limit)
}

function priceSummaryFromVariations(variations) {
  const prices = variations
    .map(item => Number(item.discount_price || item.price || 0) || 0)
    .filter(price => price > 0)
  return {
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0
  }
}

function productKnowledgeUrl(row) {
  const raw = productObject(row.raw_listing)
  const direct = firstText(row, ['product_url', 'item_url', 'url', 'link', 'permalink'])
    || firstText(raw, ['product_url', 'item_url', 'url', 'Url', 'link', 'permalink', 'productUrl'])
  if (/^https?:\/\//i.test(direct)) return direct
  const platform = cleanText(row.platform).toLowerCase()
  const shopId = cleanText(row.shop_id)
  const itemId = cleanText(row.platform_item_id)
  if (platform === 'shopee' && shopId && itemId) {
    return `https://shopee.vn/product/${encodeURIComponent(shopId)}/${encodeURIComponent(itemId)}`
  }
  return ''
}

function compactProductKnowledgeRow(row, detail = true) {
  const variations = productArray(row.variations).map(item => ({
    variation_name: limitText(item.variation_name || item.name, 100),
    sku: limitText(item.sku || item.platform_sku, 100),
    price: Number(item.price || 0) || 0,
    discount_price: Number(item.discount_price || 0) || 0,
    stock: Number(item.stock || 0) || 0,
    image_url: cleanText(item.image_url || item.variation_image)
  }))
  const images = productArray(row.images).map(cleanText).filter(Boolean).slice(0, detail ? 1 : 2)
  const stockTotal = variations.reduce((sum, item) => sum + Number(item.stock || 0), 0)
  const prices = priceSummaryFromVariations(variations)
  const base = {
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    shop_id: cleanText(row.shop_id),
    platform_item_id: cleanText(row.platform_item_id),
    product_url: productKnowledgeUrl(row),
    product_name: limitText(row.product_name, detail ? 180 : 220),
    brand_name: limitText(row.brand_name, 160),
    category_id: limitText(row.category_id, 160),
    item_sku: limitText(row.item_sku, 160),
    stock_total: stockTotal,
    price_min: prices.min,
    price_max: prices.max,
    images,
    updated_at: cleanText(row.updated_at || row.created_at),
    source: cleanText(row.source || 'api')
  }
  if (!detail) return base
  return {
    ...base,
    // Payload chat phải gọn để Chrome không rơi vào lỗi mạng khi mở hội thoại nhiều sản phẩm.
    description: limitText(row.description, 160),
    video_url: cleanText(row.video_url),
    images,
    variations: variations.slice(0, 5)
  }
}

function extractProductKnowledgeTerms(conversation, messages = [], orderSkus = []) {
  const text = [
    conversation?.buyer_name,
    conversation?.last_message,
    ...messages.map(msg => `${msg.content || ''} ${mediaMessageSummary(msg.media_items)}`),
    ...orderSkus
  ].map(cleanText).join(' ')
  const normalized = normalizeKeywordText(text)
  const terms = normalized.split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && !/^\d{1,2}$/.test(item))
  return [...new Set([...terms, ...orderSkus.map(normalizeKeywordText).filter(Boolean)])].slice(0, 80)
}

function scoreKnowledgeRow(row, terms = [], orderSkus = []) {
  const variations = productArray(row.variations)
  const searchText = normalizeKeywordText([
    row.product_name,
    row.description,
    row.brand_name,
    row.item_sku,
    row.platform_item_id,
    variations.map(item => `${item.sku || ''} ${item.variation_name || ''}`).join(' ')
  ].join(' '))
  let score = 0
  for (const sku of orderSkus) {
    const key = normalizeKeywordText(sku)
    if (key && searchText.includes(key)) score += 80
  }
  for (const term of terms) {
    if (!term) continue
    if (searchText.includes(term)) score += term.length >= 5 ? 8 : 3
  }
  const stockTotal = variations.reduce((sum, item) => sum + Number(item.stock || 0), 0)
  if (stockTotal > 0) score += 10
  if (cleanText(row.description)) score += 4
  if (productArray(row.images).length) score += 2
  return score
}

async function resolveProductContextShopAliases(env, platform, shop, shopId) {
  const aliases = new Set([shop, shopId].map(cleanText).filter(Boolean))
  try {
    const canonical = await loadCanonicalChatShops(env)
    const key = canonicalChatShopKeyForValues(platform, shop, shopId, canonical.aliasToKey)
    const item = canonical.byKey.get(key)
    if (item) {
      ;[item.shop_name, item.display_name, item.user_name, item.api_shop_id, ...(item.aliases || [])]
        .map(cleanText)
        .filter(Boolean)
        .forEach(alias => aliases.add(alias))
    }
  } catch {}
  return [...aliases]
}

Object.assign(globalThis, {
  normalizeKnowledgeVariations,
  normalizePromotionSummary,
  normalizeViolationSummary,
  normalizeSuggestedCategories,
  normalizeProductKnowledgeInput,
  saveProductKnowledgeBatch,
  compactKnowledgeAttributes,
  priceSummaryFromVariations,
  productKnowledgeUrl,
  compactProductKnowledgeRow,
  extractProductKnowledgeTerms,
  scoreKnowledgeRow,
  resolveProductContextShopAliases
})
