import { fetchShopeeAdsBalances, fetchShopeeAdsToggleInfo } from '../api/index.js'
import { parseMappedSkuItems } from '../../core/products/sku-identity-core.js'
import {
  aggregateCampaignRows,
  buildAdsShopStatusRows,
  campaignDailyRows,
  campaignProductRows,
  campaignShopRows,
  campaignSnapshotType,
  cleanText,
  ensureRealAdsTables,
  listAdsShops,
  loadAffiliateSnapshots,
  loadCampaignSnapshots,
  loadOpenCampaignSnapshots,
  safeNumber,
  round2,
  summarizeAffiliateRows,
  summarizeCampaignRows,
  summarizeOpenCampaignRows
} from './dashboard-metrics.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function adsLower(value) {
  return cleanText(value).toLowerCase()
}

function adsDateNowText() {
  return new Date().toISOString()
}

async function adsTableExists(env, tableName) {
  try {
    const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).bind(tableName).first()
    return Boolean(row?.name)
  } catch {
    return false
  }
}

async function adsTableColumnSet(env, tableName) {
  try {
    const { results } = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all()
    return new Set((results || []).map(row => cleanText(row.name)))
  } catch {
    return new Set()
  }
}

function adsSafeJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function adsJsonValues(value, keys = []) {
  const found = []
  const keySet = new Set(keys)
  const walk = item => {
    if (item === null || item === undefined) return
    if (Array.isArray(item)) {
      item.forEach(walk)
      return
    }
    if (typeof item !== 'object') return
    for (const [key, child] of Object.entries(item)) {
      if (keySet.has(key)) found.push(child)
      walk(child)
    }
  }
  walk(value)
  return found.flatMap(item => Array.isArray(item) ? item : [item]).map(cleanText).filter(Boolean)
}

function adsSkuKeys(row = {}) {
  const raw = adsSafeJson(row.raw_data, {})
  return [
    row.sku,
    row.seller_sku,
    row.internal_sku,
    row.product_sku,
    row.campaign_id,
    row.item_id,
    row.model_id,
    ...adsJsonValues(raw, [
      'seller_sku', 'sellerSku', 'sku', 'product_sku', 'productSku', 'shopSku', 'itemSku',
      'item_id', 'itemId', 'product_id', 'productId', 'platform_item_id',
      'item_id_list', 'itemIdList', 'model_id', 'modelId', 'model_id_list', 'modelIdList',
      'variation_id', 'variationId'
    ])
  ].map(cleanText).filter(Boolean)
}

function adsProductNameKeys(row = {}) {
  const raw = adsSafeJson(row.raw_data, {})
  return [
    row.product_name,
    row.campaign_name,
    row.adgroup_name,
    ...adsJsonValues(raw, ['product_name', 'productName', 'item_name', 'itemName', 'ad_name', 'adName', 'campaign_name', 'campaignName'])
  ].map(value => adsLower(value)).filter(Boolean)
}

function adsNameSearchTerms(names = []) {
  const terms = new Set()
  for (const name of names) {
    const text = cleanText(name).toLowerCase()
    if (!text) continue
    const noSuffix = text.replace(/\s*\[[^\]]+\]\s*$/g, '').trim()
    for (const value of [text, noSuffix]) {
      if (value.length < 12) continue
      terms.add(value.slice(0, 24))
      const words = value.split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
      if (words.length >= 12) terms.add(words)
    }
  }
  return [...terms]
}

function adsProductCodeTerms(values = []) {
  const terms = new Set()
  for (const value of values) {
    const text = cleanText(value).toUpperCase()
    for (const match of text.matchAll(/\b[KH]\d{2,5}\b/g)) {
      terms.add(match[0])
    }
  }
  return [...terms]
}

function adsChunk(values = [], size = 40) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function adsMappedSkus(product = {}) {
  return parseMappedSkuItems(product.mapped_items, product.internal_sku)
    .map(item => cleanText(item.sku))
    .filter(Boolean)
}

function adsProductMatchScore(product = {}, row = {}) {
  const keys = new Set(adsSkuKeys(row).map(adsLower))
  const names = new Set(adsProductNameKeys(row))
  let score = 0
  if (keys.has(adsLower(product.platform_sku))) score += 60
  if (keys.has(adsLower(product.internal_sku))) score += 45
  if (keys.has(adsLower(product.platform_item_id))) score += 70
  if (keys.has(adsLower(product.model_id))) score += 55
  if (adsMappedSkus(product).some(sku => keys.has(adsLower(sku)))) score += 65
  if (adsLower(product.platform) && adsLower(row.platform) === adsLower(product.platform)) score += 10
  if (adsLower(product.shop) && adsLower(row.shop) === adsLower(product.shop)) score += 10
  if (adsLower(product.product_name) && adsLower(product.product_name) === adsLower(row.product_name)) score += 12
  if (adsLower(product.product_name) && names.has(adsLower(product.product_name))) score += 38
  if (adsLower(product.variation_name) && names.has(adsLower(product.variation_name))) score += 28
  if (adsLower(row.product_name) && adsLower(product.product_name).includes(adsLower(row.product_name))) score += 35
  if (adsLower(product.product_name) && adsLower(row.product_name).includes(adsLower(product.product_name))) score += 35
  const rowCodes = new Set(adsProductCodeTerms([row.product_name, row.campaign_name, row.product_sku]))
  const productCodes = new Set(adsProductCodeTerms([product.product_name, product.variation_name, product.internal_sku, product.platform_sku]))
  if ([...rowCodes].some(code => productCodes.has(code))) score += 42
  if (safeNumber(product.stock) > 0) score += 2
  return score
}

function adsBestProduct(productRows, row) {
  let best = null
  let bestScore = 0
  for (const product of productRows) {
    const score = adsProductMatchScore(product, row)
    if (score > bestScore) {
      best = product
      bestScore = score
    }
  }
  return bestScore >= 45 ? best : null
}

async function loadAdsProductRows(env, productRows) {
  if (!productRows.length || !await adsTableExists(env, 'product_variations')) return []
  const columns = await adsTableColumnSet(env, 'product_variations')
  const platforms = [...new Set(productRows.map(row => adsLower(row.platform)).filter(Boolean))]
  const shops = [...new Set(productRows.map(row => cleanText(row.shop)).filter(Boolean))]
  const skus = [...new Set(productRows.flatMap(adsSkuKeys).map(adsLower).filter(Boolean))]
  const names = adsNameSearchTerms(productRows.flatMap(adsProductNameKeys))
  const productCodes = adsProductCodeTerms(productRows.flatMap(row => [row.product_name, row.campaign_name, row.product_sku, row.sku]))
  const conds = []
  const params = []
  const matchConds = []
  const matchParams = []
  if (skus.length) {
    const skuConds = [
      `LOWER(COALESCE(platform_sku, '')) IN (${skus.map(() => '?').join(',')})`,
      `LOWER(COALESCE(internal_sku, '')) IN (${skus.map(() => '?').join(',')})`
    ]
    matchParams.push(...skus, ...skus)
    if (columns.has('platform_item_id')) {
      skuConds.push(`LOWER(COALESCE(platform_item_id, '')) IN (${skus.map(() => '?').join(',')})`)
      matchParams.push(...skus)
    }
    if (columns.has('model_id')) {
      skuConds.push(`LOWER(COALESCE(model_id, '')) IN (${skus.map(() => '?').join(',')})`)
      matchParams.push(...skus)
    }
    if (columns.has('mapped_items')) {
      const mappedSkus = skus.slice(0, 20)
      skuConds.push(`(${mappedSkus.map(() => `LOWER(COALESCE(mapped_items, '')) LIKE ?`).join(' OR ')})`)
      matchParams.push(...mappedSkus.map(sku => `%${sku}%`))
    }
    matchConds.push(`(${skuConds.join(' OR ')})`)
  }
  if (names.length) {
    const nameConds = names.slice(0, 20).map(() => `LOWER(COALESCE(product_name, '')) LIKE ?`)
    if (columns.has('variation_name')) nameConds.push(...names.slice(0, 20).map(() => `LOWER(COALESCE(variation_name, '')) LIKE ?`))
    matchConds.push(`(${nameConds.join(' OR ')})`)
    matchParams.push(...names.slice(0, 20).map(name => `%${name.slice(0, 60)}%`))
    if (columns.has('variation_name')) matchParams.push(...names.slice(0, 20).map(name => `%${name.slice(0, 60)}%`))
  }
  if (productCodes.length) {
    const codeTerms = productCodes.slice(0, 30)
    const codeConds = [
      ...codeTerms.map(() => `UPPER(COALESCE(product_name, '')) LIKE ?`),
      ...codeTerms.map(() => `UPPER(COALESCE(platform_sku, '')) LIKE ?`),
      ...codeTerms.map(() => `UPPER(COALESCE(internal_sku, '')) LIKE ?`)
    ]
    if (columns.has('variation_name')) codeConds.push(...codeTerms.map(() => `UPPER(COALESCE(variation_name, '')) LIKE ?`))
    matchConds.push(`(${codeConds.join(' OR ')})`)
    matchParams.push(...codeTerms.map(code => `%${code}%`))
    matchParams.push(...codeTerms.map(code => `%${code}%`))
    matchParams.push(...codeTerms.map(code => `%${code}%`))
    if (columns.has('variation_name')) matchParams.push(...codeTerms.map(code => `%${code}%`))
  }
  if (matchConds.length) {
    conds.push(`(${matchConds.join(' OR ')})`)
    params.push(...matchParams)
  } else {
    // Không khóa cứng shop/sàn khi đã thiếu khóa sản phẩm; dữ liệu Product Core cũ có thể dùng alias shop khác.
    if (platforms.length) {
      conds.push(`LOWER(COALESCE(platform, '')) IN (${platforms.map(() => '?').join(',')})`)
      params.push(...platforms)
    }
    if (shops.length) {
      conds.push(`COALESCE(shop, '') IN (${shops.map(() => '?').join(',')})`)
      params.push(...shops)
    }
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const optionalSelect = [
    columns.has('platform_item_id') ? 'platform_item_id' : `'' AS platform_item_id`,
    columns.has('model_id') ? 'model_id' : `'' AS model_id`,
    columns.has('mapped_items') ? 'mapped_items' : `'' AS mapped_items`
  ].join(', ')
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, ${optionalSelect}, platform_sku, internal_sku, product_name, variation_name,
           image_url, price, discount_price, stock, map_status, updated_at
    FROM product_variations
    ${where}
    ORDER BY updated_at DESC
    LIMIT 1000
  `).bind(...params).all()
  return results || []
}

async function loadAdsProductFallbackRows(env, productRows) {
  if (!productRows.length || !await adsTableExists(env, 'product_variations')) return []
  const columns = await adsTableColumnSet(env, 'product_variations')
  const itemIds = [...new Set(productRows.flatMap(row => {
    const raw = adsSafeJson(row.raw_data, {})
    return adsJsonValues(raw, ['item_id', 'itemId', 'platform_item_id', 'item_id_list', 'itemIdList', 'product_id', 'productId'])
  }).map(cleanText).filter(Boolean))].slice(0, 80)
  const productCodes = adsProductCodeTerms(productRows.flatMap(row => [row.product_name, row.campaign_name, row.product_sku, row.sku])).slice(0, 40)
  if (!itemIds.length && !productCodes.length) return []
  const optionalSelect = [
    columns.has('platform_item_id') ? 'platform_item_id' : `'' AS platform_item_id`,
    columns.has('model_id') ? 'model_id' : `'' AS model_id`,
    columns.has('mapped_items') ? 'mapped_items' : `'' AS mapped_items`
  ].join(', ')
  const selects = []
  if (itemIds.length && columns.has('platform_item_id')) {
    const { results } = await env.DB.prepare(`
      SELECT id, platform, shop, ${optionalSelect}, platform_sku, internal_sku, product_name, variation_name,
             image_url, price, discount_price, stock, map_status, updated_at
      FROM product_variations
      WHERE platform_item_id IN (${itemIds.map(() => '?').join(',')})
      ORDER BY updated_at DESC
      LIMIT 500
    `).bind(...itemIds).all()
    selects.push(...(results || []))
  }
  if (productCodes.length) {
    const fields = ['product_name', 'platform_sku', 'internal_sku']
    if (columns.has('variation_name')) fields.push('variation_name')
    const codeConds = fields.flatMap(field => productCodes.map(() => `UPPER(COALESCE(${field}, '')) LIKE ?`))
    const codeParams = fields.flatMap(() => productCodes.map(code => `%${code}%`))
    const { results } = await env.DB.prepare(`
      SELECT id, platform, shop, ${optionalSelect}, platform_sku, internal_sku, product_name, variation_name,
             image_url, price, discount_price, stock, map_status, updated_at
      FROM product_variations
      WHERE ${codeConds.join(' OR ')}
      ORDER BY updated_at DESC
      LIMIT 500
    `).bind(...codeParams).all()
    selects.push(...(results || []))
  }
  const seen = new Set()
  return selects.filter(row => {
    const key = [row.id, row.platform_item_id, row.internal_sku, row.platform_sku].map(cleanText).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function loadAdsCostRows(env, productRows, matchedProducts) {
  const skus = [...new Set([
    ...productRows.flatMap(adsSkuKeys),
    ...matchedProducts.flatMap(row => [row?.internal_sku, row?.platform_sku, ...adsMappedSkus(row)])
  ].map(cleanText).filter(Boolean))]
  if (!skus.length) return new Map()
  const map = new Map()
  if (await adsTableExists(env, 'sku_current_cost_read_model')) {
    // Chia batch để màn hình tổng hợp nhiều shop không mất toàn bộ giá vốn do vượt giới hạn bind D1.
    for (const skuChunk of adsChunk(skus)) {
      const chunkPlaceholders = skuChunk.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
          SELECT sku_id, internal_sku, current_cost, current_cost_method, total_remaining_stock,
                 batch_count, latest_import_date, cost_status, source, last_cost_calculated_at
          FROM sku_current_cost_read_model
          WHERE sku_id IN (${chunkPlaceholders}) OR internal_sku IN (${chunkPlaceholders})
        `).bind(...skuChunk, ...skuChunk).all()
      for (const row of results || []) {
        for (const key of [row.sku_id, row.internal_sku].map(cleanText).filter(Boolean)) {
          map.set(adsLower(key), row)
        }
      }
    }
  }
  if (await adsTableExists(env, 'products')) {
    const productColumns = await adsTableColumnSet(env, 'products')
    const productStockSelect = productColumns.has('stock') ? 'stock' : 'NULL AS stock'
    const productUpdatedAtSelect = productColumns.has('updated_at') ? 'updated_at' : `'' AS updated_at`
    for (const skuChunk of adsChunk(skus)) {
      const chunkPlaceholders = skuChunk.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
          SELECT sku, cost_real, cost_invoice, ${productStockSelect}, ${productUpdatedAtSelect}
          FROM products
          WHERE sku IN (${chunkPlaceholders})
        `).bind(...skuChunk).all()
      for (const row of results || []) {
        const key = cleanText(row.sku)
        const referenceCost = safeNumber(row.cost_real || row.cost_invoice)
        if (!key || !referenceCost || map.has(adsLower(key))) continue
        map.set(adsLower(key), {
          sku_id: key,
          internal_sku: key,
          current_cost: referenceCost,
          current_cost_method: 'product_master_reference_cost',
          total_remaining_stock: row.stock,
          batch_count: 0,
          latest_import_date: '',
          cost_status: 'reference_cost',
          source: 'product_master_reference_cost',
          last_cost_calculated_at: cleanText(row.updated_at)
        })
      }
    }
  }
  return map
}

async function loadAdsFinanceRows(env, url) {
  if (!await adsTableExists(env, 'order_analytics') || !await adsTableExists(env, 'order_items')) return new Map()
  const conds = []
  const params = []
  const from = cleanText(url.searchParams.get('from'))
  const to = cleanText(url.searchParams.get('to'))
  const platform = adsLower(url.searchParams.get('platform'))
  const shop = cleanText(url.searchParams.get('shop'))
  if (from) {
    conds.push('date(oa.order_date) >= date(?)')
    params.push(from)
  }
  if (to) {
    conds.push('date(oa.order_date) <= date(?)')
    params.push(to)
  }
  if (platform) {
    conds.push('LOWER(COALESCE(oa.platform, "")) = ?')
    params.push(platform)
  }
  if (shop) {
    conds.push('COALESCE(oa.shop, "") = ?')
    params.push(shop)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(`
    WITH item_counts AS (
      SELECT order_id, COUNT(*) AS item_count
      FROM order_items
      GROUP BY order_id
    )
    SELECT
      COALESCE(NULLIF(oi.sku, ''), '(no sku)') AS sku,
      SUM(COALESCE(oi.revenue_line, 0)) AS gross_revenue,
      SUM(COALESCE(oa.actual_income, 0) *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS actual_income,
      SUM(COALESCE(oa.net_profit, 0) *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS profit_after_ads,
      SUM((COALESCE(oa.net_profit, 0) + COALESCE(oa.ads_cost_allocated, 0)) *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS profit_before_ads,
      SUM(COALESCE(oa.ads_cost_allocated, 0) *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS finance_ads_cost,
      MAX(COALESCE(oa.actual_income_source, '')) AS finance_source
    FROM order_analytics oa
    JOIN order_items oi ON oi.order_id = oa.order_sn
    LEFT JOIN item_counts ic ON ic.order_id = oa.order_sn
    ${where}
    GROUP BY COALESCE(NULLIF(oi.sku, ''), '(no sku)')
    LIMIT 1000
  `).bind(...params).all()
  const map = new Map()
  for (const row of results || []) {
    map.set(adsLower(row.sku), row)
  }
  return map
}

async function loadAdsPromotionRows(env, productRows) {
  if (!await adsTableExists(env, 'marketplace_discount_items')) return new Map()
  const shops = [...new Set(productRows.map(row => cleanText(row.shop)).filter(Boolean))]
  const names = [...new Set(productRows.map(row => cleanText(row.product_name)).filter(Boolean))]
  if (!shops.length && !names.length) return new Map()
  const conds = []
  const params = []
  if (shops.length) {
    conds.push(`COALESCE(shop, '') IN (${shops.map(() => '?').join(',')})`)
    params.push(...shops)
  }
  if (names.length) {
    conds.push(`COALESCE(item_name, '') IN (${names.map(() => '?').join(',')})`)
    params.push(...names)
  }
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, discount_id, status, item_id, item_name, model_id, model_name,
           original_price, promotion_price, promotion_stock, promotion_sync_status,
           source, synced_at, updated_at
    FROM marketplace_discount_items
    WHERE ${conds.join(' OR ')}
    ORDER BY updated_at DESC
    LIMIT 1000
  `).bind(...params).all()
  const map = new Map()
  for (const row of results || []) {
    for (const key of [row.item_name, row.model_name].map(adsLower).filter(Boolean)) {
      if (!map.has(key)) map.set(key, row)
    }
  }
  return map
}

function adsDecisionForRow(row = {}) {
  const badges = []
  const spend = safeNumber(row.spend ?? row.ads_spend)
  const revenue = safeNumber(row.ads_revenue ?? row.revenue)
  const profit = row.profit_after_ads === null || row.profit_after_ads === undefined ? null : safeNumber(row.profit_after_ads)
  const stock = row.available_stock === null || row.available_stock === undefined ? null : safeNumber(row.available_stock)
  const costMissing = row.current_cost === null || row.current_cost === undefined || row.cost_status === 'missing'
  if (!spend) badges.push({ code: 'ads_not_synced', label: 'Chưa kéo ADS', tone: 'info' })
  if (costMissing) badges.push({ code: 'missing_cost', label: 'Thiếu giá vốn', tone: 'missing' })
  if (stock === null) badges.push({ code: 'missing_stock', label: 'Thiếu tồn kho', tone: 'missing' })
  if (spend > 0 && revenue <= 0) badges.push({ code: 'missing_ads_revenue', label: 'Thiếu doanh thu ADS', tone: 'missing' })
  if (row.ads_sync_status && row.ads_sync_status !== 'synced') badges.push({ code: 'ads_sync_error', label: 'Dữ liệu lỗi', tone: 'danger' })

  if (costMissing) {
    return { recommendation: 'missing_cost', recommendation_label: 'Thiếu giá vốn', recommendation_tone: 'missing', recommendation_reason: 'Warehouse Core chưa có current_cost cho SKU này.', data_badges: badges }
  }
  if (stock !== null && stock <= 20) {
    return { recommendation: 'low_stock', recommendation_label: 'Sắp hết hàng', recommendation_tone: 'warning', recommendation_reason: 'Tồn khả dụng trong Warehouse/Product Core thấp.', data_badges: badges }
  }
  if (profit !== null && profit < 0) {
    return { recommendation: 'need_stop', recommendation_label: 'Tắt ADS', recommendation_tone: 'danger', recommendation_reason: 'Finance Core trả lãi sau ADS âm.', data_badges: badges }
  }
  if (spend > 0 && (safeNumber(row.roas) < 3 || safeNumber(row.acos) > 25)) {
    return { recommendation: 'need_reduce', recommendation_label: 'Giảm 30%', recommendation_tone: 'warning', recommendation_reason: 'ADS Core trả ROAS thấp hoặc ACOS cao trong khoảng lọc.', data_badges: badges }
  }
  if (spend > 0 && safeNumber(row.roas) >= 5 && (profit === null || profit > 0)) {
    return { recommendation: 'keep_ads', recommendation_label: 'Giữ ADS', recommendation_tone: 'good', recommendation_reason: 'ADS Core trả ROAS tốt và Finance Core không âm lãi.', data_badges: badges }
  }
  return { recommendation: 'insufficient_data', recommendation_label: 'Không đủ dữ liệu', recommendation_tone: 'neutral', recommendation_reason: 'Read-model chưa đủ tín hiệu để quyết định.', data_badges: badges }
}

async function enrichAdsDecisionRows(env, url, productPerformance) {
  const productCoreRows = [
    ...await loadAdsProductRows(env, productPerformance).catch(() => []),
    ...await loadAdsProductFallbackRows(env, productPerformance).catch(() => [])
  ]
  const matchedProducts = productPerformance.map(row => adsBestProduct(productCoreRows, row)).filter(Boolean)
  const costMap = await loadAdsCostRows(env, productPerformance, matchedProducts).catch(() => new Map())
  const financeMap = await loadAdsFinanceRows(env, url).catch(() => new Map())
  const promotionMap = await loadAdsPromotionRows(env, productPerformance).catch(() => new Map())

  return productPerformance.map(row => {
    const product = adsBestProduct(productCoreRows, row) || {}
    const mappedSku = adsMappedSkus(product)[0] || ''
    const cost = costMap.get(adsLower(product.internal_sku)) || costMap.get(adsLower(mappedSku)) || costMap.get(adsLower(row.sku)) || {}
    const finance = financeMap.get(adsLower(product.internal_sku)) || financeMap.get(adsLower(product.platform_sku)) || financeMap.get(adsLower(row.sku)) || {}
    const promotion = promotionMap.get(adsLower(product.product_name || row.product_name)) || {}
    const currentCost = cost.current_cost === null || cost.current_cost === undefined ? null : round2(cost.current_cost)
    const stock = product.stock === null || product.stock === undefined || product.stock === '' ? null : safeNumber(product.stock)
    const profitAfterAds = finance.profit_after_ads === null || finance.profit_after_ads === undefined
      ? null
      : round2(finance.profit_after_ads)
    const base = {
      ...row,
      sku_id: cleanText(product.internal_sku || mappedSku || row.sku),
      seller_sku: cleanText(product.platform_sku || row.sku),
      internal_sku: cleanText(product.internal_sku || mappedSku || row.sku),
      platform_item_id: cleanText(product.platform_item_id || row.item_id),
      model_id: cleanText(product.model_id || row.model_id),
      product_name: cleanText(product.product_name || row.product_name),
      variation_name: cleanText(product.variation_name),
      image_url: cleanText(product.image_url),
      product_status: cleanText(product.map_status || 'product_core'),
      current_stock: stock,
      available_stock: stock,
      current_cost: currentCost,
      cost_status: cleanText(cost.cost_status || (currentCost === null ? 'missing' : 'ok')),
      latest_import_date: cleanText(cost.latest_import_date),
      gross_revenue: round2(finance.gross_revenue || row.revenue),
      actual_income: finance.actual_income === null || finance.actual_income === undefined ? null : round2(finance.actual_income),
      estimated_income: finance.estimated_income === null || finance.estimated_income === undefined ? null : round2(finance.estimated_income),
      profit_before_ads: finance.profit_before_ads === null || finance.profit_before_ads === undefined ? null : round2(finance.profit_before_ads),
      profit_after_ads: profitAfterAds,
      profit_status: profitAfterAds === null ? 'missing' : (profitAfterAds < 0 ? 'negative' : 'ok'),
      current_price: round2(product.price),
      current_promotion_price: round2(promotion.promotion_price || product.discount_price),
      promotion_status: cleanText(promotion.status || (safeNumber(product.discount_price) > 0 ? 'active' : 'missing')),
      discount_id: cleanText(promotion.discount_id),
      promotion_source: promotion.discount_id ? 'marketplace_discount_items' : (safeNumber(product.discount_price) > 0 ? 'product_core.discount_price' : ''),
      ads_sync_status: row.ads_sync_status || 'synced',
      ads_source: row.source || 'ads_api_campaign_snapshots',
      last_ads_synced_at: row.updated_at || adsDateNowText(),
      finance_source: cleanText(finance.finance_source || 'order_analytics'),
      warehouse_source: cleanText(cost.source || 'warehouse_purchase_core'),
      product_source: 'product_variations',
      ads_revenue: row.revenue
    }
    return { ...base, ...adsDecisionForRow(base) }
  })
}

function summarizeAdsDecisions(rows) {
  const summary = {
    need_stop: 0,
    need_reduce: 0,
    negative_profit: 0,
    missing_cost: 0,
    low_stock: 0,
    insufficient_data: 0,
    keep_ads: 0,
    sku_action_count: 0
  }
  for (const row of rows || []) {
    if (summary[row.recommendation] !== undefined) summary[row.recommendation] += 1
    if (row.profit_after_ads !== null && row.profit_after_ads < 0) summary.negative_profit += 1
    if (row.recommendation !== 'keep_ads') summary.sku_action_count += 1
  }
  return summary
}

function adsPublicDecisionRow(row = {}) {
  const { raw_data, ...publicRow } = row
  return publicRow
}

function adsPublicCampaignRow(row = {}) {
  const { raw_data, raw_setting, raw_metric, ...publicRow } = row
  return publicRow
}

function adsHasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function adsNullableNumber(value) {
  if (!adsHasValue(value)) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function adsRowItemIds(row = {}) {
  const raw = adsSafeJson(row.raw_data, {})
  return [
    row.item_id,
    row.platform_item_id,
    ...adsJsonValues(raw, ['item_id', 'itemId', 'platform_item_id', 'item_id_list', 'itemIdList', 'product_id', 'productId'])
  ].map(cleanText).filter(Boolean)
}

function adsRowModelIds(row = {}) {
  const raw = adsSafeJson(row.raw_data, {})
  return [
    row.model_id,
    ...adsJsonValues(raw, ['model_id', 'modelId', 'model_id_list', 'modelIdList', 'variation_id', 'variationId'])
  ].map(cleanText).filter(Boolean)
}

async function loadLightweightProductReferences(env, rows = []) {
  if (!rows.length || !await adsTableExists(env, 'product_variations')) return []
  const hasProducts = await adsTableExists(env, 'products')
  const hasCostReadModel = await adsTableExists(env, 'sku_current_cost_read_model')
  const itemIds = [...new Set(rows.flatMap(adsRowItemIds).filter(Boolean))]
  const skuKeys = [...new Set(rows.flatMap(adsSkuKeys).filter(Boolean))]
  if (!itemIds.length && !skuKeys.length) return []
  const refs = []
  const selectProductFields = hasProducts
    ? 'p.sku AS product_sku, p.cost_real, p.cost_invoice, p.image_url AS product_image_url'
    : "'' AS product_sku, NULL AS cost_real, NULL AS cost_invoice, '' AS product_image_url"
  const selectCostFields = hasCostReadModel
    ? 'c.current_cost, c.current_cost_method, c.cost_status, c.source AS cost_source, c.latest_import_date'
    : 'NULL AS current_cost, NULL AS current_cost_method, NULL AS cost_status, NULL AS cost_source, NULL AS latest_import_date'
  const productJoin = hasProducts ? 'LEFT JOIN products p ON p.sku = v.internal_sku' : ''
  const costJoin = hasCostReadModel ? 'LEFT JOIN sku_current_cost_read_model c ON c.sku_id = v.internal_sku OR c.internal_sku = v.internal_sku' : ''
  for (const chunk of adsChunk(itemIds, 60)) {
    const placeholders = chunk.map(() => '?').join(',')
    const { results } = await env.DB.prepare(`
      SELECT v.platform, v.shop, v.platform_item_id, v.model_id, v.platform_sku, v.internal_sku,
             v.product_name, v.variation_name, v.image_url, v.stock, v.map_status,
             ${selectProductFields}, ${selectCostFields}
      FROM product_variations v
      ${productJoin}
      ${costJoin}
      WHERE v.platform_item_id IN (${placeholders})
      LIMIT 1500
    `).bind(...chunk).all()
    refs.push(...(results || []))
  }
  for (const chunk of adsChunk(skuKeys, 60)) {
    const placeholders = chunk.map(() => '?').join(',')
    const { results } = await env.DB.prepare(`
      SELECT v.platform, v.shop, v.platform_item_id, v.model_id, v.platform_sku, v.internal_sku,
             v.product_name, v.variation_name, v.image_url, v.stock, v.map_status,
             ${selectProductFields}, ${selectCostFields}
      FROM product_variations v
      ${productJoin}
      ${costJoin}
      WHERE v.platform_sku IN (${placeholders}) OR v.internal_sku IN (${placeholders})
      LIMIT 1500
    `).bind(...chunk, ...chunk).all()
    refs.push(...(results || []))
  }
  const seen = new Set()
  return refs.filter(row => {
    const key = [row.platform, row.shop, row.platform_item_id, row.model_id, row.platform_sku, row.internal_sku].map(cleanText).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function adsReferenceCost(row = {}) {
  const currentCost = adsNullableNumber(row.current_cost)
  if (currentCost !== null) return { value: currentCost, source: cleanText(row.cost_source || 'warehouse_purchase_core'), status: cleanText(row.cost_status || 'ok') }
  const realCost = adsNullableNumber(row.cost_real)
  if (realCost !== null) return { value: realCost, source: 'product_master_reference_cost', status: 'reference_cost' }
  const invoiceCost = adsNullableNumber(row.cost_invoice)
  if (invoiceCost !== null) return { value: invoiceCost, source: 'product_master_reference_cost', status: 'reference_cost' }
  return { value: null, source: '', status: 'missing' }
}

function adsProductReferenceForRow(row = {}, references = []) {
  const itemIds = new Set(adsRowItemIds(row).map(adsLower))
  const modelIds = new Set(adsRowModelIds(row).map(adsLower))
  const skuKeys = new Set(adsSkuKeys(row).map(adsLower))
  const rowPlatform = adsLower(row.platform)
  const rowShop = adsLower(row.shop)
  let matches = references.filter(ref => {
    const itemMatch = itemIds.has(adsLower(ref.platform_item_id))
    const skuMatch = [ref.platform_sku, ref.internal_sku].some(value => skuKeys.has(adsLower(value)))
    if (!itemMatch && !skuMatch) return false
    if (rowPlatform && adsLower(ref.platform) && adsLower(ref.platform) !== rowPlatform) return false
    if (rowShop && adsLower(ref.shop) && adsLower(ref.shop) !== rowShop) return false
    return true
  })
  if (!matches.length) return null
  const modelMatches = matches.filter(ref => modelIds.has(adsLower(ref.model_id)))
  if (modelMatches.length) matches = modelMatches
  const costs = matches.map(ref => ({ ref, cost: adsReferenceCost(ref), stock: adsNullableNumber(ref.stock) })).filter(item => item.cost.value !== null)
  const weightedStock = costs.reduce((sum, item) => sum + Math.max(adsNullableNumber(item.stock) || 0, 0), 0)
  const costValue = costs.length
    ? (weightedStock > 0
        ? costs.reduce((sum, item) => sum + item.cost.value * Math.max(adsNullableNumber(item.stock) || 0, 0), 0) / weightedStock
        : costs.reduce((sum, item) => sum + item.cost.value, 0) / costs.length)
    : null
  const first = matches[0] || {}
  const skuList = [...new Set(matches.map(ref => cleanText(ref.internal_sku || ref.platform_sku)).filter(Boolean))]
  const stockValues = matches.map(ref => adsNullableNumber(ref.stock)).filter(value => value !== null)
  const hasWarehouseCost = costs.some(item => item.cost.source === 'warehouse_purchase_core')
  const source = hasWarehouseCost ? 'warehouse_purchase_core' : (costValue !== null ? 'product_master_reference_cost' : '')
  return {
    sku_id: skuList[0] || cleanText(row.sku || row.product_sku || row.campaign_id),
    seller_sku: cleanText(first.platform_sku || skuList[0] || row.sku || row.product_sku),
    internal_sku: skuList[0] || cleanText(row.sku || row.product_sku || row.campaign_id),
    platform_item_id: cleanText(first.platform_item_id || adsRowItemIds(row)[0]),
    model_id: cleanText(first.model_id || adsRowModelIds(row)[0]),
    product_name: cleanText(first.product_name || row.product_name),
    variation_name: cleanText(matches.length === 1 ? first.variation_name : ''),
    image_url: cleanText(first.image_url || first.product_image_url),
    current_stock: stockValues.length ? stockValues.reduce((sum, value) => sum + value, 0) : null,
    available_stock: stockValues.length ? stockValues.reduce((sum, value) => sum + value, 0) : null,
    current_cost: costValue === null ? null : round2(costValue),
    cost_status: costValue === null ? 'missing' : (hasWarehouseCost ? cleanText(costs.find(item => item.cost.source === 'warehouse_purchase_core')?.cost.status || 'ok') : 'reference_cost'),
    latest_import_date: cleanText(costs.find(item => item.ref.latest_import_date)?.ref.latest_import_date),
    warehouse_source: source,
    product_source: 'product_variations',
    product_status: cleanText(first.map_status || 'product_core'),
    matched_variation_count: matches.length
  }
}

function lightweightAdsDecisionRows(rows = []) {
  return rows.map(row => lightweightAdsDecisionRow(row))
}

function lightweightAdsDecisionRow(row = {}, reference = null) {
  // Giữ đường tải mặc định nhẹ để Worker không quá tải; field thiếu phải giữ null/missing, không tự vá số liệu.
  const base = {
    ...row,
    sku_id: cleanText(row.sku || row.product_sku || row.campaign_id),
    seller_sku: cleanText(row.sku || row.product_sku),
    internal_sku: cleanText(row.sku || row.product_sku),
    platform_item_id: '',
    model_id: '',
    available_stock: null,
    current_stock: null,
    current_cost: null,
    cost_status: 'missing',
    latest_import_date: '',
    gross_revenue: round2(row.revenue),
    actual_income: null,
    estimated_income: null,
    profit_before_ads: null,
    profit_after_ads: null,
    profit_status: 'missing',
    current_price: null,
    current_promotion_price: null,
    promotion_status: 'missing',
    ads_sync_status: 'synced',
    ads_source: row.source || 'ads_api_campaign_snapshots',
    ads_revenue: row.revenue,
    finance_source: '',
    warehouse_source: '',
    product_source: 'ads_api_campaign_snapshots',
    ...(reference || {})
  }
  return { ...base, ...adsDecisionForRow(base) }
}

async function lightweightAdsDecisionRowsWithProductCore(env, rows = []) {
  const references = await loadLightweightProductReferences(env, rows).catch(error => {
    console.error('[ADS_DASHBOARD] lightweight product reference failed:', error?.message || error)
    return []
  })
  return rows.map(row => lightweightAdsDecisionRow(row, adsProductReferenceForRow(row, references)))
}

async function handleAdsDashboardInner(request, env, cors) {
  const url = new URL(request.url)
      await ensureRealAdsTables(env)
    
      const limit = url.searchParams.get('limit') || 40
      const requestFilter = {
        from: cleanText(url.searchParams.get('from')),
        to: cleanText(url.searchParams.get('to')),
        platform: cleanText(url.searchParams.get('platform')).toLowerCase(),
        shop: cleanText(url.searchParams.get('shop'))
      }
    
      const includeLiveAccountStatus = url.searchParams.get('include_live_account_status') === '1'
      const balancePromise = !includeLiveAccountStatus || (requestFilter.platform && requestFilter.platform !== 'shopee')
        ? Promise.resolve({ shops: [], ok_count: 0, total_balance: 0 })
        : fetchShopeeAdsBalances(env, {
            shop: requestFilter.shop,
            shopLimit: Math.min(Number(url.searchParams.get('account_shop_limit') || 10) || 10, 20)
          }).catch(error => ({
            shops: [],
            ok_count: 0,
            total_balance: 0,
            error: error?.message || String(error)
          }))
    
      const toggleInfoPromise = !includeLiveAccountStatus || (requestFilter.platform && requestFilter.platform !== 'shopee')
        ? Promise.resolve({ shops: [], ok_count: 0 })
        : fetchShopeeAdsToggleInfo(env, {
            shop: requestFilter.shop,
            shopLimit: Math.min(Number(url.searchParams.get('account_shop_limit') || 10) || 10, 20)
          }).catch(error => ({
            shops: [],
            ok_count: 0,
            error: error?.message || String(error)
          }))
    
      const [
        shops,
        campaignSnapshots,
        shopeeBalances,
        shopeeToggleInfo,
        affiliatePerformance,
        openCampaignPerformance
      ] = await Promise.all([
        listAdsShops(env),
        loadCampaignSnapshots(env, url),
        balancePromise,
        toggleInfoPromise,
        loadAffiliateSnapshots(env, url).catch(error => {
          console.error('[ADS_AFFILIATE] load failed:', error.message)
          return []
        }),
        loadOpenCampaignSnapshots(env, url).catch(error => {
          console.error('[ADS_OPEN_CAMPAIGN] load failed:', error.message)
          return []
        })
      ])
    
      const shopLookup = new Map()
      for (const shop of shops) {
        for (const name of [shop.shop_name, shop.user_name, shop.api_shop_id, ...(shop.aliases || [])].map(cleanText).filter(Boolean)) {
          shopLookup.set(`${cleanText(shop.platform).toLowerCase()}|${name.toLowerCase()}`, shop)
        }
      }
      const canonicalCampaignSnapshots = campaignSnapshots.map(row => {
        const key = `${cleanText(row.platform).toLowerCase()}|${cleanText(row.shop).toLowerCase()}`
        const matched = shopLookup.get(key)
        return matched ? { ...row, shop: matched.shop_name || row.shop } : row
      })
      const aggregateSnapshots = aggregateCampaignRows(canonicalCampaignSnapshots)
    
      const summary = summarizeCampaignRows(aggregateSnapshots)
      const daily = campaignDailyRows(aggregateSnapshots)
      const shopPerformance = campaignShopRows(aggregateSnapshots)
      const baseProductPerformance = campaignProductRows(canonicalCampaignSnapshots, limit)
      const includeCoreDecisionEnrichment = url.searchParams.get('include_core_decision_enrichment') === '1'
      const productPerformance = includeCoreDecisionEnrichment
        ? await enrichAdsDecisionRows(env, url, baseProductPerformance).catch(error => {
            console.error('[ADS_DASHBOARD] core decision enrichment failed:', error?.message || error)
            return lightweightAdsDecisionRowsWithProductCore(env, baseProductPerformance)
          })
        : await lightweightAdsDecisionRowsWithProductCore(env, baseProductPerformance)
      const publicProductPerformance = productPerformance.map(adsPublicDecisionRow)
      const decisionSummary = summarizeAdsDecisions(publicProductPerformance)
      const runningShops = shopPerformance.map(row => {
        const key = `${cleanText(row.platform).toLowerCase()}|${cleanText(row.shop).toLowerCase()}`
        const matched = shopLookup.get(key)
        return matched || {
          id: '',
          shop_name: row.shop,
          platform: row.platform,
          user_name: row.shop,
          api_shop_id: '',
          has_access_token: 1
        }
      })
      const platformMatches = shop => !requestFilter.platform || cleanText(shop.platform).toLowerCase() === requestFilter.platform
      const shopMatches = shop => {
        if (!requestFilter.shop) return true
        const needle = requestFilter.shop.toLowerCase()
        return [shop.shop_name, shop.user_name, shop.api_shop_id, ...(shop.aliases || [])]
          .map(value => cleanText(value).toLowerCase())
          .some(value => value === needle)
      }
      const apiShops = shops.filter(shop => Number(shop.has_access_token) && platformMatches(shop) && shopMatches(shop))
      const shopStatusRows = buildAdsShopStatusRows(
        apiShops,
        shopPerformance,
        canonicalCampaignSnapshots,
        shopeeBalances.shops || [],
        shopeeToggleInfo.shops || []
      )
      const hasRealAdsData = aggregateSnapshots.length > 0 && safeNumber(summary.ads_spend) > 0
      const affiliateSummary = summarizeAffiliateRows(affiliatePerformance)
      const openCampaignSummary = summarizeOpenCampaignRows(openCampaignPerformance)
    
      return json({
        status: 'ok',
        has_real_ads_data: hasRealAdsData,
        mode: 'strict_campaign_api_only',
        empty_reason: hasRealAdsData
          ? ''
          : 'Chưa có snapshot campaign ADS thực từ Ads API trong khoảng lọc. Dashboard không dùng cost setting, orders_v2.fee_ads hoặc report fallback để dựng số liệu.',
        source: {
          realtime_campaign_api: campaignSnapshots.length ? 'marketplace_ads_campaign_snapshots' : 'Chưa có snapshot campaign thực từ Ads API',
          realtime_order_fee_api: 'Không dùng order_fee_details.fee_ads để dựng dashboard ADS',
          reports: 'Không dùng platform_reports để dựng dashboard ADS realtime',
          cost_settings: 'Tuyệt đối không dùng cost setting/orders_v2.fee_ads để tính KPI ADS'
        },
        filters: {
          from: requestFilter.from,
          to: requestFilter.to,
          platform: requestFilter.platform,
          shop: requestFilter.shop
        },
        shops: shopStatusRows,
        running_shops: runningShops,
        api_shops: apiShops,
        ads_shop_status: shopStatusRows,
        diagnostics: {
          api_shop_count: apiShops.length,
          running_ads_shop_count: runningShops.length,
          connected_ads_shop_count: shopStatusRows.length,
          campaign_snapshot_count: aggregateSnapshots.length,
          raw_campaign_snapshot_count: canonicalCampaignSnapshots.length,
          product_campaign_snapshot_count: canonicalCampaignSnapshots.filter(row => campaignSnapshotType(row) === 'product_campaign').length,
          shop_level_snapshot_count: canonicalCampaignSnapshots.filter(row => campaignSnapshotType(row) === 'shop_level').length,
          shopee_ads_balance_ok_count: Number(shopeeBalances.ok_count || 0),
          shopee_ads_balance_total: safeNumber(shopeeBalances.total_balance),
          shopee_ads_toggle_ok_count: Number(shopeeToggleInfo.ok_count || 0),
          live_account_status_loaded: includeLiveAccountStatus,
          core_decision_enrichment_loaded: includeCoreDecisionEnrichment,
          affiliate_snapshot_count: affiliatePerformance.length,
          open_campaign_snapshot_count: openCampaignPerformance.length,
          strict_note: 'KPI chỉ cộng snapshot Ads API có spend > 0; danh sách shop vẫn hiện toàn bộ shop API theo bộ lọc để thấy shop nào chưa phát sinh campaign/spend.'
        },
        decision_summary: decisionSummary,
        decision_cards: [
          { key: 'need_stop', label: 'Cần dừng ADS', count: decisionSummary.need_stop, description: 'Lãi sau ADS âm hoặc ROAS rất thấp' },
          { key: 'need_reduce', label: 'Cần giảm ADS', count: decisionSummary.need_reduce, description: 'ROAS thấp hoặc ACOS cao' },
          { key: 'negative_profit', label: 'Lãi âm', count: decisionSummary.negative_profit, description: 'Finance Core trả lãi sau ADS < 0' },
          { key: 'missing_cost', label: 'Thiếu giá vốn', count: decisionSummary.missing_cost, description: 'Warehouse Core chưa có current_cost' },
          { key: 'low_stock', label: 'Sắp hết hàng', count: decisionSummary.low_stock, description: 'Tồn khả dụng thấp' }
        ],
        ads_balances: shopeeBalances.shops || [],
        ads_toggle_info: shopeeToggleInfo.shops || [],
        affiliate_summary: affiliateSummary,
        affiliate_performance: affiliatePerformance.slice(0, 80),
        open_campaign_summary: openCampaignSummary,
        open_campaign_performance: openCampaignPerformance.slice(0, 80),
        summary: {
          ...summary,
          sku_action_count: decisionSummary.sku_action_count,
          decision_summary: decisionSummary
        },
        daily,
        shop_performance: shopPerformance,
        product_performance: publicProductPerformance,
        reports: [],
        marketing_signals: [],
        campaigns: canonicalCampaignSnapshots.slice(0, 120).map(adsPublicCampaignRow)
      }, cors)
}

export async function handleAdsDashboard(request, env, cors) {
  try {
    return await handleAdsDashboardInner(request, env, cors)
  } catch (error) {
    console.error('[ADS_DASHBOARD] load failed:', error?.stack || error?.message || error)
    return json({
      status: 'error',
      error_code: 'ads_dashboard_load_failed',
      message: 'Không tải được dữ liệu ADS. Vui lòng bấm Làm mới. Nếu vẫn lỗi, kiểm tra kết nối hoặc đăng nhập lại.',
      technical_message: error?.message || String(error)
    }, cors, 500)
  }
}
