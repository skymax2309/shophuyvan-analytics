import { ensureVideoAnalyticsTables } from './analytics-core.js'

function cleanVideoText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseJsonText(value, fallback) {
  if (!value) return fallback
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return fallback
  }
}

function buildMarketplaceProductUrl(platform, shopId, itemId) {
  const normalizedPlatform = cleanVideoText(platform).toLowerCase()
  const safeShopId = cleanVideoText(shopId)
  const safeItemId = cleanVideoText(itemId)
  if (normalizedPlatform === 'shopee' && safeShopId && safeItemId) {
    return `https://shopee.vn/product/${encodeURIComponent(safeShopId)}/${encodeURIComponent(safeItemId)}`
  }
  return ''
}

function normalizeCatalogVariations(value) {
  const parsed = parseJsonText(value, [])
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.models)) return parsed.models
  if (Array.isArray(parsed?.variations)) return parsed.variations
  return []
}

function pickVariationSku(variation = {}) {
  return cleanVideoText(variation.sku || variation.model_sku || variation.platform_sku || variation.seller_sku)
}

function pickVariationName(variation = {}) {
  return cleanVideoText(variation.variation_name || variation.model_name || variation.name || variation.option_name)
}

async function queryVideoCatalogProducts(env, options = {}) {
  const platform = cleanVideoText(options.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(options.shop)
  const query = cleanVideoText(options.query).toLowerCase()
  const limit = Math.min(Math.max(Number(options.limit || 12) || 12, 1), 50)
  const sqlParams = [platform, shop]
  const where = [
    'knowledge.platform = ?',
    'knowledge.shop = ?'
  ]
  if (query) {
    const likeQuery = `%${query}%`
    // NEO: Catalog video đa shop chỉ tìm trong đúng platform + shop; cấm fallback sang link/item shop khác.
    where.push(`(
      LOWER(COALESCE(knowledge.product_name, '')) LIKE ?
      OR LOWER(COALESCE(knowledge.item_sku, '')) LIKE ?
      OR LOWER(COALESCE(knowledge.platform_item_id, '')) LIKE ?
      OR LOWER(COALESCE(knowledge.variations, '')) LIKE ?
    )`)
    sqlParams.push(likeQuery, likeQuery, likeQuery, likeQuery)
  }
  const sql = `
    SELECT knowledge.platform, knowledge.shop, knowledge.shop_id, knowledge.platform_item_id, knowledge.product_name,
           knowledge.item_sku, knowledge.images, knowledge.variations, knowledge.raw_listing,
           COALESCE(snapshot.has_video, 0) AS has_video,
           snapshot.total_marketplace_stock AS stock, snapshot.price_min, snapshot.price_max
    FROM marketplace_product_knowledge AS knowledge
    LEFT JOIN marketplace_product_catalog_snapshots AS snapshot
      ON snapshot.platform = knowledge.platform
     AND snapshot.shop = knowledge.shop
     AND snapshot.platform_item_id = knowledge.platform_item_id
    WHERE ${where.join(' AND ')}
    ORDER BY knowledge.updated_at DESC
    LIMIT ${query ? 800 : 200}
  `
  const { results } = await env.DB.prepare(sql).bind(...sqlParams).all()
  const rows = []
  for (const row of results || []) {
    const name = cleanVideoText(row.product_name)
    const itemSku = cleanVideoText(row.item_sku)
    const itemId = cleanVideoText(row.platform_item_id)
    const variations = normalizeCatalogVariations(row.variations)
    const variationText = variations
      .map((variation) => `${pickVariationSku(variation)} ${pickVariationName(variation)} ${cleanVideoText(variation.model_id || variation.variation_id)}`)
      .join(' ')
    const haystack = `${name} ${itemSku} ${itemId} ${variationText}`.toLowerCase()
    if (query && !haystack.includes(query)) continue
    const matchedVariation = query
      ? variations.find((variation) => {
        const text = `${pickVariationSku(variation)} ${pickVariationName(variation)} ${cleanVideoText(variation.model_id || variation.variation_id)}`.toLowerCase()
        return text.includes(query)
      })
      : null
    const images = parseJsonText(row.images, [])
    const rawListing = parseJsonText(row.raw_listing, {})
    const shopId = cleanVideoText(row.shop_id)
    // NEO: Nếu catalog local helper có URL sản phẩm của chính shop thì ưu tiên dùng URL đó; không tự dựng link khi thiếu shop_id.
    const explicitProductUrl = cleanVideoText(rawListing.product_url || rawListing.shopee_product_url || rawListing.seller_center_url)
    rows.push({
      platform,
      shop: cleanVideoText(row.shop),
      shop_id: shopId,
      item_id: itemId,
      item_sku: itemSku,
      matched_sku: pickVariationSku(matchedVariation) || itemSku,
      matched_variation_name: pickVariationName(matchedVariation),
      product_name: name,
      image_url: cleanVideoText(images?.[0]),
      product_url: explicitProductUrl || buildMarketplaceProductUrl(platform, shopId, itemId),
      stock: numberValue(row.stock),
      price_min: numberValue(row.price_min),
      price_max: numberValue(row.price_max),
      variation_count: variations.length,
      has_video: numberValue(row.has_video) ? 1 : 0
    })
    if (rows.length >= limit) break
  }
  return rows
}

export async function listVideoCatalogProducts(env, options = {}) {
  await ensureVideoAnalyticsTables(env)
  return queryVideoCatalogProducts(env, options)
}
