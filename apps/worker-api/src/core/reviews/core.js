import { createReviewWorkspaceCore } from './workspace-core.js'
import { createReviewReplyActions } from './reply-actions-core.js'
function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerText(value) {
  return cleanText(value).toLowerCase()
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function integerFlag(value) {
  return value ? 1 : 0
}

function jsonText(value, fallback = '{}') {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string') {
    const text = cleanText(value)
    if (!text) return fallback
    try {
      JSON.parse(text)
      return text
    } catch {
      return JSON.stringify(text)
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function parseJson(value, fallback) {
  if (!value) return fallback
  let current = value
  for (let i = 0; i < 2; i++) {
    if (typeof current !== 'string') return current
    try {
      current = JSON.parse(current)
    } catch {
      return fallback
    }
  }
  return current
}

export function chunkArray(items = [], size = 10) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

export function toMarketplaceTime(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return ''
  const ms = raw > 9999999999 ? raw : raw * 1000
  try {
    return new Date(ms).toISOString()
  } catch {
    return ''
  }
}

export function reviewCorePeriod(options = {}) {
  const requestedDays = Math.max(1, Math.min(Number(options.days || 7) || 7, 7))
  const end = Number(options.end_time || options.endTime)
    ? Number(options.end_time || options.endTime)
    : Date.now()
  const start = Number(options.start_time || options.startTime)
    ? Number(options.start_time || options.startTime)
    : end - requestedDays * 24 * 60 * 60 * 1000
  return {
    days: requestedDays,
    start_time: start,
    end_time: Math.max(start + 1000, end)
  }
}

function buildReviewWindowPlan(options = {}) {
  const historyDays = Math.max(1, Math.min(Number(options.history_days || options.historyDays || options.days || 7) || 7, 84))
  const windowDays = Math.max(1, Math.min(Number(options.window_days || options.windowDays || 7) || 7, 7))
  const requestedWindows = Number(options.max_windows || options.maxWindows || Math.ceil(historyDays / windowDays))
  const maxWindows = Math.max(1, Math.min(Math.round(requestedWindows) || 1, 12))
  const endTime = Number(options.end_time || options.endTime)
    ? Number(options.end_time || options.endTime)
    : Date.now()
  const windows = []
  let cursorEnd = endTime
  let remainingDays = historyDays
  for (let index = 0; index < maxWindows && remainingDays > 0; index += 1) {
    const currentDays = Math.min(windowDays, remainingDays)
    const currentStart = cursorEnd - currentDays * 24 * 60 * 60 * 1000
    windows.push({
      index: index + 1,
      days: currentDays,
      start_time: currentStart,
      end_time: cursorEnd
    })
    cursorEnd = currentStart - 1000
    remainingDays -= currentDays
  }
  return {
    history_days: historyDays,
    window_days: windowDays,
    max_windows: maxWindows,
    windows
  }
}

function isUnknownReviewProductName(value) {
  const text = lowerText(value)
  return !text || text === 'sản phẩm chưa rõ'
}

export async function ensureReviewCoreTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      review_id TEXT NOT NULL,
      order_id TEXT DEFAULT '',
      platform_item_id TEXT DEFAULT '',
      model_id TEXT DEFAULT '',
      item_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      buyer_name TEXT DEFAULT '',
      rating_overall REAL DEFAULT 0,
      rating_product REAL DEFAULT 0,
      rating_seller REAL DEFAULT 0,
      rating_logistics REAL DEFAULT 0,
      review_text TEXT DEFAULT '',
      review_type TEXT DEFAULT '',
      review_status TEXT DEFAULT '',
      can_reply INTEGER DEFAULT 0,
      has_reply INTEGER DEFAULT 0,
      seller_reply TEXT DEFAULT '',
      is_negative INTEGER DEFAULT 0,
      has_media INTEGER DEFAULT 0,
      media_payload TEXT DEFAULT '{}',
      source TEXT DEFAULT 'api',
      raw_data TEXT DEFAULT '{}',
      reviewed_at TEXT DEFAULT '',
      replied_at TEXT DEFAULT '',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, review_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_reviews_shop
    ON marketplace_product_reviews(platform, shop, reviewed_at)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_reviews_attention
    ON marketplace_product_reviews(platform, shop, is_negative, can_reply, has_reply)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_review_action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      review_id TEXT DEFAULT '',
      action_type TEXT DEFAULT '',
      action_status TEXT DEFAULT 'preview_locked',
      request_payload TEXT DEFAULT '{}',
      preview_payload TEXT DEFAULT '{}',
      result_payload TEXT DEFAULT '{}',
      note TEXT DEFAULT '',
      sent_to_platform INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
}

function normalizeCommonReview(input = {}) {
  const rating = numberValue(input.rating_overall || input.rating_product)
  const reviewText = cleanText(input.review_text)
  const sellerReply = cleanText(input.seller_reply)
  return {
    platform: lowerText(input.platform),
    shop: cleanText(input.shop),
    shop_id: cleanText(input.shop_id),
    review_id: cleanText(input.review_id),
    order_id: cleanText(input.order_id),
    platform_item_id: cleanText(input.platform_item_id),
    model_id: cleanText(input.model_id),
    item_sku: cleanText(input.item_sku),
    product_name: cleanText(input.product_name),
    buyer_name: cleanText(input.buyer_name),
    rating_overall: rating,
    rating_product: numberValue(input.rating_product || rating),
    rating_seller: numberValue(input.rating_seller),
    rating_logistics: numberValue(input.rating_logistics),
    review_text: reviewText,
    review_type: cleanText(input.review_type),
    review_status: cleanText(input.review_status),
    can_reply: integerFlag(input.can_reply),
    has_reply: integerFlag(input.has_reply || sellerReply),
    seller_reply: sellerReply,
    is_negative: integerFlag(input.is_negative || (rating > 0 && rating <= 3)),
    has_media: integerFlag(input.has_media),
    media_payload: jsonText(input.media_payload || {}),
    source: cleanText(input.source || 'api'),
    raw_data: jsonText(input.raw_data || {}),
    reviewed_at: cleanText(input.reviewed_at),
    replied_at: cleanText(input.replied_at)
  }
}

export function normalizeShopeeReviewRow(row = {}, shop = {}) {
  const reply = row.comment_reply || row.cmt_reply || {}
  const sellerReply = cleanText(reply.reply || reply.comment || reply.content)
  const media = row.media || {}
  const imageList = Array.isArray(media.image_url_list) ? media.image_url_list : []
  const videoList = Array.isArray(media.video_url_list) ? media.video_url_list : []
  return normalizeCommonReview({
    platform: 'shopee',
    shop: shop.shop_name || shop.user_name || shop.api_shop_id,
    shop_id: shop.api_shop_id,
    review_id: row.comment_id,
    order_id: row.order_sn,
    platform_item_id: row.item_id,
    model_id: Array.isArray(row.model_id_list) ? row.model_id_list.join(',') : row.model_id,
    buyer_name: row.buyer_username,
    rating_overall: row.rating_star,
    rating_product: row.rating_star,
    review_text: row.comment,
    review_type: 'PRODUCT_REVIEW',
    review_status: row.hidden ? 'hidden' : cleanText(row.editable || 'visible'),
    can_reply: !sellerReply && !row.hidden,
    has_reply: !!sellerReply,
    seller_reply: sellerReply,
    has_media: imageList.length || videoList.length,
    media_payload: {
      image_url_list: imageList,
      video_url_list: videoList
    },
    raw_data: row,
    source: '/api/v2/product/get_comment',
    reviewed_at: toMarketplaceTime(row.create_time),
    replied_at: toMarketplaceTime(reply.create_time)
  })
}

export function normalizeLazadaReviewRow(row = {}, shop = {}, productMap = new Map()) {
  const reviewId = cleanText(row.id || row.review_id)
  const productId = cleanText(row.product_id || row.item_id)
  const product = productMap.get(productId) || {}
  const ratings = row.ratings || {}
  const sellerReply = cleanText(row.seller_reply)
  const images = Array.isArray(row.review_images) ? row.review_images : []
  const videos = Array.isArray(row.review_videos) ? row.review_videos : []
  return normalizeCommonReview({
    platform: 'lazada',
    shop: shop.shop_name || shop.user_name || shop.api_shop_id,
    shop_id: shop.api_shop_id || product.shop_id,
    review_id: reviewId,
    order_id: row.order_id,
    platform_item_id: productId,
    item_sku: product.item_sku,
    product_name: product.product_name,
    rating_overall: ratings.overall_rating || ratings.product_rating,
    rating_product: ratings.product_rating || ratings.overall_rating,
    rating_seller: ratings.seller_rating,
    rating_logistics: ratings.logistics_rating,
    review_text: row.review_content,
    review_type: row.review_type || 'PRODUCT_REVIEW',
    review_status: row.can_reply ? 'replyable' : 'read_only',
    can_reply: row.can_reply && !sellerReply,
    has_reply: !!sellerReply,
    seller_reply: sellerReply,
    has_media: images.length || videos.length,
    media_payload: {
      review_images: images,
      review_videos: videos
    },
    raw_data: row,
    source: '/review/seller/list/v2',
    reviewed_at: toMarketplaceTime(row.submit_time || row.create_time)
  })
}

function isReviewCatalogGap(row = {}) {
  if (!cleanText(row.platform_item_id)) return false
  return !cleanText(row.item_sku) || isUnknownReviewProductName(row.product_name) || !cleanText(row.shop_id)
}

function reviewCatalogStrictKey(platform, shop, itemId) {
  return `${lowerText(platform)}|${lowerText(shop)}|${cleanText(itemId)}`
}

function reviewCatalogShopIdKey(platform, shopId, itemId) {
  return `${lowerText(platform)}|${cleanText(shopId)}|${cleanText(itemId)}`
}

function reviewCatalogLooseKey(platform, itemId) {
  return `${lowerText(platform)}|${cleanText(itemId)}`
}

function splitReviewModelIds(value) {
  return [...new Set(cleanText(value).split(',').map(cleanText).filter(Boolean))]
}

function reviewKnowledgeModelKey(platform, shop, itemId, modelId) {
  return `${reviewCatalogStrictKey(platform, shop, itemId)}|${cleanText(modelId)}`
}

function buildReviewCatalogMaps(rows = []) {
  const byStrict = new Map()
  const byShopId = new Map()
  const looseCounts = new Map()
  const byLoose = new Map()
  for (const row of rows) {
    const itemId = cleanText(row.platform_item_id)
    if (!itemId) continue
    byStrict.set(reviewCatalogStrictKey(row.platform, row.shop, itemId), row)
    if (cleanText(row.shop_id)) byShopId.set(reviewCatalogShopIdKey(row.platform, row.shop_id, itemId), row)
    const looseKey = reviewCatalogLooseKey(row.platform, itemId)
    looseCounts.set(looseKey, numberValue(looseCounts.get(looseKey)) + 1)
    if (!byLoose.has(looseKey)) byLoose.set(looseKey, row)
  }
  return {
    byStrict,
    byShopId,
    byLoose,
    looseCounts
  }
}

function buildReviewKnowledgeMaps(rows = []) {
  const byModel = new Map()
  const bySingleSkuItem = new Map()
  for (const row of rows) {
    const itemId = cleanText(row.platform_item_id)
    if (!itemId) continue
    const itemKey = reviewCatalogStrictKey(row.platform, row.shop, itemId)
    const productName = cleanText(row.product_name)
    const shopId = cleanText(row.shop_id)
    const variations = parseJson(row.variations, [])
    const variationList = Array.isArray(variations) ? variations : []
    const uniqueSkuEntries = new Map()
    for (const variation of variationList) {
      const itemSku = cleanText(variation?.sku || variation?.platform_sku)
      const modelId = cleanText(variation?.model_id || variation?.modelId || variation?.id)
      if (!itemSku) continue
      const entry = {
        item_sku: itemSku,
        product_name: productName,
        shop_id: shopId
      }
      uniqueSkuEntries.set(lowerText(itemSku), entry)
      if (modelId) byModel.set(reviewKnowledgeModelKey(row.platform, row.shop, itemId, modelId), entry)
    }
    if (!uniqueSkuEntries.size && cleanText(row.item_sku)) {
      uniqueSkuEntries.set(lowerText(row.item_sku), {
        item_sku: cleanText(row.item_sku),
        product_name: productName,
        shop_id: shopId
      })
    }
    if (uniqueSkuEntries.size === 1) {
      bySingleSkuItem.set(itemKey, [...uniqueSkuEntries.values()][0])
    }
  }
  return {
    byModel,
    bySingleSkuItem
  }
}

function pickReviewCatalogMatch(row = {}, maps = {}) {
  const itemId = cleanText(row.platform_item_id)
  if (!itemId) return { match: null, match_mode: '' }
  const strict = maps.byStrict?.get(reviewCatalogStrictKey(row.platform, row.shop, itemId)) || null
  if (strict) return { match: strict, match_mode: 'exact_shop_item' }
  if (cleanText(row.shop_id)) {
    const byShopId = maps.byShopId?.get(reviewCatalogShopIdKey(row.platform, row.shop_id, itemId)) || null
    if (byShopId) return { match: byShopId, match_mode: 'shop_id_item' }
  }
  const looseKey = reviewCatalogLooseKey(row.platform, itemId)
  if (numberValue(maps.looseCounts?.get(looseKey)) === 1) {
    return { match: maps.byLoose?.get(looseKey) || null, match_mode: 'unique_item' }
  }
  return { match: null, match_mode: '' }
}

function pickReviewKnowledgeMatch(row = {}, maps = {}) {
  const itemId = cleanText(row.platform_item_id)
  if (!itemId) return { match: null, match_mode: '' }
  // Snapshot catalog chỉ có cấp item; muốn bù đúng SKU review phải ưu tiên variations theo model_id.
  for (const modelId of splitReviewModelIds(row.model_id)) {
    const byModel = maps.byModel?.get(reviewKnowledgeModelKey(row.platform, row.shop, itemId, modelId)) || null
    if (byModel) return { match: byModel, match_mode: 'knowledge_model' }
  }
  const singleSku = maps.bySingleSkuItem?.get(reviewCatalogStrictKey(row.platform, row.shop, itemId)) || null
  if (singleSku) return { match: singleSku, match_mode: 'knowledge_single_sku' }
  return { match: null, match_mode: '' }
}

export async function loadReviewProductCandidates(env, options = {}) {
  const platform = lowerText(options.platform || 'lazada')
  const shop = cleanText(options.shop)
  const limit = Math.max(1, Math.min(Number(options.item_limit || options.itemLimit || 20) || 20, 100))
  const params = [platform]
  let extra = ''
  if (shop) {
    extra = 'AND shop = ?'
    params.push(shop)
  }
  params.push(limit)
  try {
    const { results } = await env.DB.prepare(`
      SELECT platform, shop, shop_id, platform_item_id, item_sku, product_name,
             comment_count, rating_star, updated_at
      FROM marketplace_product_catalog_snapshots
      WHERE LOWER(platform) = ?
        AND COALESCE(platform_item_id, '') != ''
        ${extra}
      ORDER BY COALESCE(comment_count, 0) DESC,
               CASE WHEN COALESCE(rating_star, 0) > 0 THEN rating_star ELSE 999 END ASC,
               updated_at DESC
      LIMIT ?
    `).bind(...params).all()
    return results || []
  } catch {
    return []
  }
}

export async function saveReviewRows(env, rows = []) {
  const normalizedRows = rows.map(row => normalizeCommonReview(row)).filter(row => row.platform && row.review_id)
  if (!normalizedRows.length) return { saved: 0, inserted: 0, updated: 0 }
  await ensureReviewCoreTables(env)

  let inserted = 0
  let updated = 0
  for (let i = 0; i < normalizedRows.length; i += 40) {
    const chunk = normalizedRows.slice(i, i + 40)
    const updateResults = await env.DB.batch(chunk.map(row => env.DB.prepare(`
      UPDATE marketplace_product_reviews
      SET shop_id = ?,
          order_id = ?,
          platform_item_id = ?,
          model_id = ?,
          item_sku = ?,
          product_name = ?,
          buyer_name = ?,
          rating_overall = ?,
          rating_product = ?,
          rating_seller = ?,
          rating_logistics = ?,
          review_text = ?,
          review_type = ?,
          review_status = ?,
          can_reply = ?,
          has_reply = ?,
          seller_reply = ?,
          is_negative = ?,
          has_media = ?,
          media_payload = ?,
          source = ?,
          raw_data = ?,
          reviewed_at = ?,
          replied_at = ?,
          synced_at = datetime('now', '+7 hours'),
          updated_at = datetime('now', '+7 hours')
      WHERE platform = ?
        AND shop = ?
        AND review_id = ?
    `).bind(
      row.shop_id,
      row.order_id,
      row.platform_item_id,
      row.model_id,
      row.item_sku,
      row.product_name,
      row.buyer_name,
      row.rating_overall,
      row.rating_product,
      row.rating_seller,
      row.rating_logistics,
      row.review_text,
      row.review_type,
      row.review_status,
      row.can_reply,
      row.has_reply,
      row.seller_reply,
      row.is_negative,
      row.has_media,
      row.media_payload,
      row.source,
      row.raw_data,
      row.reviewed_at,
      row.replied_at,
      row.platform,
      row.shop,
      row.review_id
    )))
    const inserts = []
    updateResults.forEach((result, index) => {
      const changes = Number(result?.meta?.changes || 0)
      if (changes) updated += changes
      else inserts.push(chunk[index])
    })
    if (inserts.length) {
      await env.DB.batch(inserts.map(row => env.DB.prepare(`
        INSERT INTO marketplace_product_reviews (
          platform, shop, shop_id, review_id, order_id, platform_item_id, model_id,
          item_sku, product_name, buyer_name, rating_overall, rating_product,
          rating_seller, rating_logistics, review_text, review_type, review_status,
          can_reply, has_reply, seller_reply, is_negative, has_media, media_payload,
          source, raw_data, reviewed_at, replied_at, synced_at, created_at, updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'),datetime('now', '+7 hours'))
      `).bind(
        row.platform,
        row.shop,
        row.shop_id,
        row.review_id,
        row.order_id,
        row.platform_item_id,
        row.model_id,
        row.item_sku,
        row.product_name,
        row.buyer_name,
        row.rating_overall,
        row.rating_product,
        row.rating_seller,
        row.rating_logistics,
        row.review_text,
        row.review_type,
        row.review_status,
        row.can_reply,
        row.has_reply,
        row.seller_reply,
        row.is_negative,
        row.has_media,
        row.media_payload,
        row.source,
        row.raw_data,
        row.reviewed_at,
        row.replied_at
      )))
      inserted += inserts.length
    }
  }
  return { saved: normalizedRows.length, inserted, updated }
}

async function safeFirst(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql)
    return binds.length ? await statement.bind(...binds).first() : await statement.first()
  } catch {
    return null
  }
}

async function safeAll(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql)
    const { results } = binds.length ? await statement.bind(...binds).all() : await statement.all()
    return results || []
  } catch {
    return []
  }
}

async function countReviewCatalogMappingGaps(env, options = {}) {
  const filters = [
    "COALESCE(platform_item_id, '') != ''",
    "(COALESCE(item_sku, '') = '' OR COALESCE(product_name, '') = '' OR LOWER(COALESCE(product_name, '')) = 'sản phẩm chưa rõ' OR COALESCE(shop_id, '') = '')"
  ]
  const params = []
  if (lowerText(options.platform)) {
    filters.push('LOWER(platform) = ?')
    params.push(lowerText(options.platform))
  }
  if (cleanText(options.shop)) {
    filters.push('shop = ?')
    params.push(cleanText(options.shop))
  }
  const row = await safeFirst(env, `
    SELECT COUNT(*) AS total
    FROM marketplace_product_reviews
    WHERE ${filters.join(' AND ')}
  `, params)
  return numberValue(row?.total)
}

async function listReviewCatalogGaps(env, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 10) || 10, 50))
  const filters = [
    "COALESCE(platform_item_id, '') != ''",
    "(COALESCE(item_sku, '') = '' OR COALESCE(product_name, '') = '' OR LOWER(COALESCE(product_name, '')) = 'sản phẩm chưa rõ' OR COALESCE(shop_id, '') = '')"
  ]
  const params = []
  if (lowerText(options.platform)) {
    filters.push('LOWER(platform) = ?')
    params.push(lowerText(options.platform))
  }
  if (cleanText(options.shop)) {
    filters.push('shop = ?')
    params.push(cleanText(options.shop))
  }
  const rows = await safeAll(env, `
    SELECT *
    FROM marketplace_product_reviews
    WHERE ${filters.join(' AND ')}
    ORDER BY COALESCE(NULLIF(reviewed_at, ''), updated_at) DESC, id DESC
    LIMIT ?
  `, [...params, limit])
  return rows.map(normalizeReviewOutput)
}

function reviewWhere(options = {}) {
  const params = []
  const parts = []
  const platform = lowerText(options.platform)
  const shop = cleanText(options.shop)
  if (platform) {
    parts.push('LOWER(platform) = ?')
    params.push(platform)
  }
  if (shop) {
    parts.push('shop = ?')
    params.push(shop)
  }
  return {
    where: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
    params
  }
}

function normalizeReviewOutput(row = {}) {
  return {
    ...row,
    platform: lowerText(row.platform),
    shop: cleanText(row.shop),
    shop_id: cleanText(row.shop_id),
    review_id: cleanText(row.review_id),
    order_id: cleanText(row.order_id),
    platform_item_id: cleanText(row.platform_item_id),
    item_sku: cleanText(row.item_sku),
    product_name: cleanText(row.product_name),
    buyer_name: cleanText(row.buyer_name),
    rating_overall: numberValue(row.rating_overall),
    rating_product: numberValue(row.rating_product),
    rating_seller: numberValue(row.rating_seller),
    rating_logistics: numberValue(row.rating_logistics),
    can_reply: numberValue(row.can_reply),
    has_reply: numberValue(row.has_reply),
    is_negative: numberValue(row.is_negative),
    has_media: numberValue(row.has_media),
    media_payload: parseJson(row.media_payload, {}),
    raw_data: parseJson(row.raw_data, {})
  }
}

function normalizeReviewProductRiskOutput(row = {}) {
  const adsSpend = numberValue(row.ads_spend_14d)
  const adsRevenue = numberValue(row.ads_revenue_14d)
  return {
    platform: lowerText(row.platform),
    shop: cleanText(row.shop),
    shop_id: cleanText(row.shop_id),
    platform_item_id: cleanText(row.platform_item_id),
    item_sku: cleanText(row.item_sku),
    product_name: cleanText(row.product_name || 'Sản phẩm chưa rõ'),
    negative_reviews: numberValue(row.negative_reviews),
    need_reply_reviews: numberValue(row.need_reply_reviews),
    min_rating: numberValue(row.min_rating),
    avg_rating: numberValue(row.avg_rating),
    latest_reviewed_at: cleanText(row.latest_reviewed_at),
    sample_review_text: cleanText(row.sample_review_text),
    ads_spend_14d: adsSpend,
    ads_revenue_14d: adsRevenue,
    ads_campaigns: numberValue(row.ads_campaigns),
    latest_ads_snapshot_date: cleanText(row.latest_ads_snapshot_date),
    ads_acos_14d: adsRevenue > 0 ? adsSpend / adsRevenue : 0,
    has_ads_risk: adsSpend > 0
  }
}

function normalizeReviewActionLogOutput(row = {}) {
  return {
    ...row,
    platform: lowerText(row.platform),
    shop: cleanText(row.shop),
    shop_id: cleanText(row.shop_id),
    review_id: cleanText(row.review_id),
    action_type: cleanText(row.action_type),
    action_status: cleanText(row.action_status),
    request_payload: parseJson(row.request_payload, {}),
    preview_payload: parseJson(row.preview_payload, {}),
    result_payload: parseJson(row.result_payload, {}),
    note: cleanText(row.note),
    sent_to_platform: numberValue(row.sent_to_platform),
    product_name: cleanText(row.product_name),
    item_sku: cleanText(row.item_sku),
    buyer_name: cleanText(row.buyer_name),
    rating_overall: numberValue(row.rating_overall),
    review_text: cleanText(row.review_text),
    seller_reply: cleanText(row.seller_reply)
  }
}

function reviewActionWhere(options = {}) {
  const params = []
  const parts = []
  const platform = lowerText(options.platform)
  const shop = cleanText(options.shop)
  const reviewId = cleanText(options.review_id || options.reviewId)
  const status = cleanText(options.status)
  if (platform) {
    parts.push('LOWER(l.platform) = ?')
    params.push(platform)
  }
  if (shop) {
    parts.push('l.shop = ?')
    params.push(shop)
  }
  if (reviewId) {
    parts.push('l.review_id = ?')
    params.push(reviewId)
  }
  if (status) {
    parts.push('l.action_status = ?')
    params.push(status)
  }
  return {
    where: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
    params
  }
}

export async function loadReviewActionLogs(env, options = {}) {
  await ensureReviewCoreTables(env)
  const limit = Math.max(1, Math.min(Number(options.limit || 30) || 30, 100))
  const { where, params } = reviewActionWhere(options)
  const rows = await safeAll(env, `
    SELECT l.*,
           r.product_name,
           r.item_sku,
           r.buyer_name,
           r.rating_overall,
           r.review_text,
           r.seller_reply
    FROM marketplace_review_action_logs l
    LEFT JOIN marketplace_product_reviews r
      ON LOWER(r.platform) = LOWER(l.platform)
     AND r.shop = l.shop
     AND r.review_id = l.review_id
    ${where}
    ORDER BY l.id DESC
    LIMIT ?
  `, [...params, limit])
  const summaryRows = await safeAll(env, `
    SELECT action_status, COUNT(*) AS total
    FROM marketplace_review_action_logs l
    ${where}
    GROUP BY action_status
  `, params)
  return {
    status: 'ok',
    mode: 'review_action_queue',
    summary: summaryRows.reduce((accumulator, row) => {
      accumulator[cleanText(row.action_status) || 'unknown'] = numberValue(row.total)
      return accumulator
    }, {}),
    rows: rows.map(normalizeReviewActionLogOutput),
    safety: {
      live_send_locked: true,
      note: 'Hàng đợi này lưu preview, duyệt nội bộ và log kết quả. Gửi thật lên sàn chỉ mở khi bật khóa live có kiểm soát.'
    }
  }
}

const reviewWorkspaceCore = createReviewWorkspaceCore({
  ensureReviewCoreTables,
  lowerText,
  cleanText,
  safeAll,
  safeFirst,
  buildReviewCatalogMaps,
  buildReviewKnowledgeMaps,
  pickReviewCatalogMatch,
  pickReviewKnowledgeMatch,
  isUnknownReviewProductName,
  numberValue,
  listReviewCatalogGaps,
  countReviewCatalogMappingGaps,
  normalizeReviewProductRiskOutput,
  reviewWhere,
  normalizeReviewOutput
});

export const repairReviewCatalogMapping = reviewWorkspaceCore.repairReviewCatalogMapping;
export const loadReviewProductRisk = reviewWorkspaceCore.loadReviewProductRisk;
export const loadReviewCore = reviewWorkspaceCore.loadReviewCore;

const reviewReplyActions = createReviewReplyActions({
  ensureReviewCoreTables,
  cleanText,
  lowerText,
  numberValue
});

export const createReviewReplySuggestion = reviewReplyActions.createReviewReplySuggestion;
export const createReviewReplyPreview = reviewReplyActions.createReviewReplyPreview;
export const updateReviewReplyAction = reviewReplyActions.updateReviewReplyAction;
