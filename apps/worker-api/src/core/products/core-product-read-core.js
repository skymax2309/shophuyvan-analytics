import { getCoreShopSummary, shopTermsFromCoreShop } from '../shared-data/shop-core-data.js'

function cleanCoreText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerCoreText(value) {
  return cleanCoreText(value).toLowerCase()
}

function numberCoreValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function numberCoreValueOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function firstCoreText(...values) {
  for (const value of values) {
    const text = cleanCoreText(value)
    if (text) return text
  }
  return ''
}

function parseCoreJson(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function parseCoreArray(value) {
  const parsed = parseCoreJson(value, [])
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') return Object.values(parsed)
  return []
}

async function tableExists(env, tableName) {
  const row = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).bind(tableName).first()
  return Boolean(row?.name)
}

async function tableColumnSet(env, tableName) {
  if (!await tableExists(env, tableName)) return new Set()
  const { results } = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all()
  return new Set((results || []).map(row => cleanCoreText(row.name)))
}

function sourceBadge(source, confidence = '') {
  const src = lowerCoreText(source)
  const conf = lowerCoreText(confidence)
  if (src.includes('api')) return 'API'
  if (src.includes('seller_center') || src.includes('snapshot') || src.includes('d1') || src.includes('product master') || conf === 'confirmed' || conf === 'snapshot' || conf === 'observed' || conf === 'observed_zero') return 'Snapshot'
  if (src.includes('cost') || src.includes('manual') || src.includes('import') || conf === 'fallback') return 'Fallback'
  if (src.includes('estimate') || conf === 'estimated') return 'Estimated'
  return 'Missing'
}

function sourceMeta(value, source, confidence, updatedAt) {
  return {
    value,
    source: source || 'missing',
    confidence: confidence || 'missing',
    updated_at: cleanCoreText(updatedAt),
    badge: sourceBadge(source, confidence)
  }
}

export async function getCoreProductBySku(env, sku) {
  const cleanSku = cleanCoreText(sku)
  if (!cleanSku) return null
  const currentCost = await tableExists(env, 'sku_current_cost_read_model')
    ? await env.DB.prepare(`
        SELECT *
        FROM sku_current_cost_read_model
        WHERE sku_id = ? OR internal_sku = ?
        LIMIT 1
      `).bind(cleanSku, cleanSku).first()
    : null
  const product = await tableExists(env, 'products')
    ? await env.DB.prepare(`SELECT * FROM products WHERE sku = ? LIMIT 1`).bind(cleanSku).first()
    : null
  const variation = await tableExists(env, 'product_variations')
    ? await env.DB.prepare(`
        SELECT *
        FROM product_variations
        WHERE platform_sku = ? OR internal_sku = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `).bind(cleanSku, cleanSku).first()
    : null
  if (!product && !variation) return null
  const source = product ? 'Product Master' : 'product_variations_snapshot'
  const confidence = product ? 'confirmed' : 'snapshot'
  return {
    platform_product_id: firstCoreText(variation?.platform_item_id),
    platform_variation_id: firstCoreText(variation?.model_id),
    sku: cleanSku,
    platform_sku: firstCoreText(variation?.platform_sku, cleanSku),
    name: firstCoreText(product?.product_name, variation?.product_name),
    variation_name: firstCoreText(variation?.variation_name, product?.product_name),
    image_url: firstCoreText(product?.image_url, variation?.image_url),
    price: sourceMeta(numberCoreValue(variation?.discount_price || variation?.price), variation ? 'product_variations_snapshot' : 'missing', variation ? 'snapshot' : 'missing', variation?.updated_at),
    stock: sourceMeta(numberCoreValue(product?.stock ?? variation?.stock), product ? 'Product Master' : 'product_variations_snapshot', confidence, firstCoreText(product?.updated_at, variation?.updated_at)),
    cost: currentCost
      ? sourceMeta(numberCoreValue(currentCost.current_cost), 'warehouse_purchase_core', currentCost.cost_status === 'cost_ready' ? 'confirmed' : 'missing', currentCost.last_cost_calculated_at)
      : sourceMeta(numberCoreValue(product?.cost_real || product?.cost_invoice), product ? 'Product Master reference_cost' : 'missing', product ? 'fallback' : 'missing', product?.updated_at),
    purchase_cost_core: currentCost ? {
      current_cost: numberCoreValueOrNull(currentCost.current_cost),
      current_cost_method: cleanCoreText(currentCost.current_cost_method || 'weighted_average_remaining_stock'),
      total_remaining_stock: numberCoreValue(currentCost.total_remaining_stock),
      batch_count: Number(currentCost.batch_count || 0),
      latest_import_date: cleanCoreText(currentCost.latest_import_date),
      latest_landed_cost_per_unit: numberCoreValueOrNull(currentCost.latest_landed_cost_per_unit),
      reference_cost: numberCoreValueOrNull(currentCost.reference_cost),
      cost_status: cleanCoreText(currentCost.cost_status || 'missing'),
      source: 'warehouse_purchase_core'
    } : null,
    source,
    confidence,
    badge: sourceBadge(source, confidence),
    updated_at: firstCoreText(product?.updated_at, variation?.updated_at)
  }
}

function productSearchKey(product = {}) {
  return [
    lowerCoreText(product.platform),
    lowerCoreText(product.shop),
    lowerCoreText(product.sku),
    lowerCoreText(product.platform_product_id),
    lowerCoreText(product.platform_variation_id)
  ].join('|')
}

function firstCoreImage(...values) {
  for (const value of values) {
    const text = cleanCoreText(value)
    if (text && !['undefined', 'null'].includes(text.toLowerCase())) return text
  }
  return ''
}

function compactKnowledgeVariation(row = {}) {
  const variations = parseCoreArray(row.variations)
  return variations.find(item => cleanCoreText(item?.sku || item?.platform_sku || item?.seller_sku)) || variations[0] || {}
}

function knowledgeStock(row = {}) {
  return parseCoreArray(row.variations).reduce((sum, item) => sum + numberCoreValue(item?.stock ?? item?.quantity), 0)
}

function knowledgePrice(row = {}) {
  const values = parseCoreArray(row.variations)
    .map(item => numberCoreValue(item?.discount_price || item?.special_price || item?.price || item?.original_price))
    .filter(value => value > 0)
  return values.length ? Math.min(...values) : 0
}

function normalizeProductSearchResult(row = {}, kind = 'product_master') {
  const knowledgeVariation = kind === 'knowledge' ? compactKnowledgeVariation(row) : {}
  const images = kind === 'knowledge' ? parseCoreArray(row.images) : []
  const sku = firstCoreText(row.sku, row.internal_sku, row.platform_sku, row.item_sku, knowledgeVariation.sku, knowledgeVariation.platform_sku)
  const source = kind === 'knowledge'
    ? 'Product Knowledge Core'
    : (row.product_sku ? 'Product Master + product_variations' : 'product_variations_snapshot')
  const confidence = kind === 'knowledge' ? 'snapshot' : (row.product_sku ? 'confirmed' : 'snapshot')
  return {
    platform_product_id: firstCoreText(row.platform_product_id, row.platform_item_id, row.item_id),
    platform_variation_id: firstCoreText(row.platform_variation_id, row.model_id, knowledgeVariation.model_id),
    sku,
    platform_sku: firstCoreText(row.platform_sku, row.item_sku, knowledgeVariation.sku, sku),
    name: firstCoreText(row.name, row.product_name, row.variation_product_name, row.variation_name),
    variation_name: firstCoreText(row.variation_name, knowledgeVariation.variation_name, knowledgeVariation.model_name, row.product_name),
    image_url: firstCoreImage(row.image_url, row.variation_image_url, images[0], knowledgeVariation.image_url),
    price: sourceMeta(
      kind === 'knowledge'
        ? knowledgePrice(row)
        : numberCoreValue(row.discount_price || row.price || row.original_price),
      kind === 'knowledge' ? 'marketplace_product_knowledge' : (row.platform_sku ? 'product_variations_snapshot' : 'Product Master'),
      confidence,
      row.updated_at
    ),
    stock: sourceMeta(
      kind === 'knowledge' ? knowledgeStock(row) : numberCoreValue(row.stock ?? row.variation_stock),
      kind === 'knowledge' ? 'marketplace_product_knowledge' : (row.product_sku ? 'Product Master' : 'product_variations_snapshot'),
      confidence,
      row.updated_at
    ),
    cost: sourceMeta(numberCoreValue(row.cost_real || row.cost_invoice), row.product_sku ? 'Product Master' : 'missing', row.product_sku ? 'confirmed' : 'missing', row.updated_at),
    platform: lowerCoreText(row.platform),
    shop: firstCoreText(row.shop, row.shop_id),
    shop_id: firstCoreText(row.shop_id, row.shop),
    source,
    confidence,
    badge: sourceBadge(source, confidence),
    updated_at: cleanCoreText(row.updated_at)
  }
}

async function productSearchShopTerms(env, platform, shopId) {
  const raw = cleanCoreText(shopId)
  if (!raw) return []
  const shop = await getCoreShopSummary(env, raw, { platform }).catch(() => null)
  return shopTermsFromCoreShop(shop, raw)
}

function escapeLikeValue(value) {
  return cleanCoreText(value).replace(/[\\%_]/g, char => `\\${char}`)
}

export function productSearchNeedles(query) {
  const clean = cleanCoreText(query).slice(0, 160)
  if (!clean) return []
  const tokens = [...clean.matchAll(/[\p{L}\p{N}_-]+/gu)]
    .map(match => match[0])
    .map(token => token.replace(/^-+|-+$/g, ''))
    .filter(Boolean)
  const usefulTokens = []
  for (const token of tokens) {
    const lower = lowerCoreText(token)
    const hasNumber = /\d/.test(token)
    const skuLike = hasNumber || /_/.test(token) || /-/.test(token) || /[A-Z]{2,}/.test(token)
    if (lower.length < 3 && !skuLike) continue
    if (['shop', 'giup', 'giupm', 'san', 'pham', 'hang', 'con', 'khong'].includes(lower)) continue
    usefulTokens.push(token)
  }
  const prioritized = [...new Set([
    ...usefulTokens.filter(token => /\d/.test(token)),
    ...usefulTokens
  ])].slice(0, 8)
  const numericNeedles = prioritized.filter(token => /\d/.test(token))
  if (numericNeedles.length && tokens.length > 1) {
    return [...new Set(numericNeedles.map(escapeLikeValue).filter(Boolean))]
  }
  if (clean.length <= 48 && tokens.length <= 6) prioritized.unshift(clean)
  return [...new Set(prioritized.map(escapeLikeValue).filter(Boolean))]
}

function appendProductSearchQueryWhere(conds, params, query, fields) {
  const needles = productSearchNeedles(query)
  if (!needles.length) return
  const groups = []
  for (const needle of needles) {
    const like = `%${lowerCoreText(needle)}%`
    groups.push(`(${fields.map(field => `LOWER(COALESCE(${field}, '')) LIKE ? ESCAPE '\\'`).join(' OR ')})`)
    params.push(...fields.map(() => like))
  }
  conds.push(`(${groups.join(' OR ')})`)
}

function productVariationScopeSql(platform, shopTerms, alias = 'v') {
  const conds = []
  const params = []
  if (platform) {
    conds.push(`LOWER(COALESCE(${alias}.platform, '')) = ?`)
    params.push(platform)
  }
  if (shopTerms.length) {
    conds.push(`COALESCE(${alias}.shop, '') IN (${shopTerms.map(() => '?').join(',')})`)
    params.push(...shopTerms)
  }
  return { conds, params }
}

function existingProductFields(columns, fields) {
  return fields.filter(field => {
    const match = field.match(/^p\.([A-Za-z0-9_]+)$/)
    return !match || columns.has(match[1])
  })
}

async function searchProductMasterRows(env, options = {}) {
  if (!await tableExists(env, 'products')) return []
  const hasVariations = await tableExists(env, 'product_variations')
  const productColumns = await tableColumnSet(env, 'products')
  const productUpdatedAtSql = productColumns.has('updated_at') ? 'p.updated_at' : `''`
  const platform = lowerCoreText(options.platform)
  const shopTerms = options.shopTerms || []
  const limit = Math.min(Math.max(Number(options.limit || 30) || 30, 1), 80)
  const scope = hasVariations ? productVariationScopeSql(platform, shopTerms, 'v') : { conds: [], params: [] }
  const joinConds = ['v.internal_sku = p.sku', ...scope.conds]
  const where = []
  const params = [...scope.params]
  const searchFields = existingProductFields(productColumns, ['p.sku', 'p.product_name', 'p.description'])
  if (hasVariations) searchFields.push('v.platform_sku', 'v.product_name', 'v.variation_name', 'v.platform_item_id')
  appendProductSearchQueryWhere(where, params, options.query, searchFields)
  if (!where.length) return []
  if (!hasVariations) {
    const { results } = await env.DB.prepare(`
      SELECT
        p.sku AS product_sku,
        p.sku,
        p.product_name AS name,
        p.product_name,
        p.image_url,
        p.cost_real,
        p.cost_invoice,
        p.stock,
        ${productUpdatedAtSql} AS updated_at,
        '' AS platform,
        '' AS shop,
        '' AS platform_sku,
        '' AS platform_product_id,
        '' AS platform_variation_id,
        '' AS variation_product_name,
        '' AS variation_name,
        '' AS variation_image_url,
        0 AS price,
        0 AS discount_price,
        p.stock AS variation_stock
      FROM products p
      WHERE ${where.join(' AND ')}
      ORDER BY p.product_name COLLATE NOCASE, p.sku
      LIMIT ?
    `).bind(...params, limit).all()
    return (results || []).map(row => normalizeProductSearchResult(row, 'product_master'))
  }
  const { results } = await env.DB.prepare(`
    SELECT
      p.sku AS product_sku,
      p.sku,
      p.product_name AS name,
      p.product_name,
      p.image_url,
      p.cost_real,
      p.cost_invoice,
      p.stock,
      ${productUpdatedAtSql} AS updated_at,
      v.platform,
      v.shop,
      v.platform_sku,
      v.platform_item_id AS platform_product_id,
      v.model_id AS platform_variation_id,
      v.product_name AS variation_product_name,
      v.variation_name,
      v.image_url AS variation_image_url,
      v.price,
      v.discount_price,
      v.stock AS variation_stock
    FROM products p
    LEFT JOIN product_variations v ON ${joinConds.join(' AND ')}
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(v.updated_at, ${productUpdatedAtSql}, '') DESC, p.product_name COLLATE NOCASE, p.sku
    LIMIT ?
  `).bind(...params, limit).all()
  return (results || []).map(row => normalizeProductSearchResult(row, 'product_master'))
}

async function searchVariationRows(env, options = {}) {
  if (!await tableExists(env, 'product_variations')) return []
  const productColumns = await tableColumnSet(env, 'products')
  const productUpdatedAtSql = productColumns.has('updated_at') ? 'p.updated_at' : `''`
  const platform = lowerCoreText(options.platform)
  const shopTerms = options.shopTerms || []
  const limit = Math.min(Math.max(Number(options.limit || 30) || 30, 1), 80)
  const scope = productVariationScopeSql(platform, shopTerms, 'v')
  const where = [...scope.conds]
  const params = [...scope.params]
  appendProductSearchQueryWhere(where, params, options.query, [
    'v.internal_sku',
    'v.platform_sku',
    'v.product_name',
    'v.variation_name',
    'v.platform_item_id',
    'p.product_name'
  ])
  if (!where.length) return []
  const { results } = await env.DB.prepare(`
    SELECT
      p.sku AS product_sku,
      COALESCE(NULLIF(v.internal_sku, ''), v.platform_sku) AS sku,
      COALESCE(NULLIF(p.product_name, ''), v.product_name) AS name,
      p.product_name,
      COALESCE(NULLIF(p.image_url, ''), v.image_url) AS image_url,
      p.cost_real,
      p.cost_invoice,
      COALESCE(p.stock, v.stock, 0) AS stock,
      COALESCE(v.updated_at, ${productUpdatedAtSql}, '') AS updated_at,
      v.platform,
      v.shop,
      v.platform_sku,
      v.platform_item_id AS platform_product_id,
      v.model_id AS platform_variation_id,
      v.product_name AS variation_product_name,
      v.variation_name,
      v.image_url AS variation_image_url,
      v.price,
      v.discount_price,
      v.stock AS variation_stock
    FROM product_variations v
    LEFT JOIN products p ON p.sku = v.internal_sku
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(v.updated_at, ${productUpdatedAtSql}, '') DESC, COALESCE(p.product_name, v.product_name) COLLATE NOCASE
    LIMIT ?
  `).bind(...params, limit).all()
  return (results || []).map(row => normalizeProductSearchResult(row, 'variation'))
}

async function searchKnowledgeRows(env, options = {}) {
  if (!await tableExists(env, 'marketplace_product_knowledge')) return []
  const platform = lowerCoreText(options.platform)
  const shopTerms = options.shopTerms || []
  const limit = Math.min(Math.max(Number(options.limit || 30) || 30, 1), 80)
  const where = []
  const params = []
  if (platform) {
    where.push('LOWER(COALESCE(platform, \'\')) = ?')
    params.push(platform)
  }
  if (shopTerms.length) {
    const placeholders = shopTerms.map(() => '?').join(',')
    where.push(`(COALESCE(shop, '') IN (${placeholders}) OR COALESCE(shop_id, '') IN (${placeholders}))`)
    params.push(...shopTerms, ...shopTerms)
  }
  appendProductSearchQueryWhere(where, params, options.query, [
    'product_name',
    'item_sku',
    'platform_item_id',
    'description',
    'brand_name',
    'variations'
  ])
  if (!where.length) return []
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, shop_id, platform_item_id, product_name, description,
           images, brand_name, item_sku, variations, source, updated_at
    FROM marketplace_product_knowledge
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT ?
  `).bind(...params, limit).all()
  return (results || []).map(row => normalizeProductSearchResult(row, 'knowledge'))
}

export async function searchCoreProducts(env, options = {}) {
  const query = cleanCoreText(options.query || options.search || options.q).slice(0, 160)
  if (!query) {
    return {
      products: [],
      total_products: 0,
      matched_products: 0,
      match_state: 'need_search_query',
      source: 'Product Master Core'
    }
  }
  const platform = lowerCoreText(options.platform || 'shopee')
  const shopTerms = await productSearchShopTerms(env, platform, options.shop_id || options.shop)
  const limit = Math.min(Math.max(Number(options.limit || 30) || 30, 1), 80)
  const rows = [
    ...await searchProductMasterRows(env, { query, platform, shopTerms, limit }),
    ...await searchVariationRows(env, { query, platform, shopTerms, limit }),
    ...await searchKnowledgeRows(env, { query, platform, shopTerms, limit })
  ]
  const deduped = new Map()
  for (const product of rows) {
    const key = productSearchKey(product)
    if (!deduped.has(key)) deduped.set(key, product)
  }
  const products = [...deduped.values()].slice(0, limit)
  return {
    products,
    total_products: products.length,
    matched_products: products.length,
    match_state: products.length ? 'matched_product_core' : 'no_product_match',
    source: 'Product Master Core + Product Knowledge Core',
    shop_terms: shopTerms,
    search_needles: productSearchNeedles(query)
  }
}
