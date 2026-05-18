import {
  cleanExternalText,
  EXTERNAL_ERROR_CODES,
  externalInt,
  externalJson,
  externalNumber,
  ExternalApiError
} from './response-core.js'
import { expireOldReservations } from './schema-core.js'

function firstImage(row = {}) {
  const direct = cleanExternalText(row.image_url)
  if (direct && !['undefined', 'null'].includes(direct.toLowerCase())) return direct
  const images = externalJson(row.images, [])
  return Array.isArray(images) ? cleanExternalText(images[0]) : ''
}

export function normalizePriceFields(row = {}) {
  const originalPrice = Math.max(
    externalNumber(row.original_price),
    externalNumber(row.price),
    externalNumber(row.variation_price)
  )
  const salePrice = Math.max(
    externalNumber(row.sale_price),
    externalNumber(row.discount_price),
    externalNumber(row.discount_price_max)
  )
  const currentPrice = salePrice > 0 ? salePrice : originalPrice
  const discountAmount = originalPrice > 0 && salePrice > 0 ? Math.max(0, originalPrice - salePrice) : 0
  const discountPercent = originalPrice > 0 && discountAmount > 0
    ? Math.round((discountAmount / originalPrice) * 10000) / 100
    : 0

  return {
    costPrice: Math.max(externalNumber(row.cost_real), externalNumber(row.cost_invoice), externalNumber(row.cost_price)),
    originalPrice,
    salePrice,
    currentPrice,
    discountAmount,
    discountPercent,
    currency: 'VND',
    priceUpdatedAt: cleanExternalText(row.price_updated_at || row.updated_at)
  }
}

function productStock(row = {}) {
  const main = externalNumber(row.stock_main)
  const sub = externalNumber(row.stock_sub)
  if (main || sub) return main + sub
  return externalNumber(row.stock)
}

function normalizeProductRow(row = {}) {
  const stock = productStock(row)
  const reservedStock = externalNumber(row.reserved_stock)
  const price = normalizePriceFields(row)
  return {
    id: cleanExternalText(row.sku),
    platform: cleanExternalText(row.platform),
    shopName: cleanExternalText(row.shop),
    sku: cleanExternalText(row.sku),
    name: cleanExternalText(row.product_name),
    category: cleanExternalText(row.category),
    description: cleanExternalText(row.description),
    ...price,
    imageUrl: firstImage(row),
    status: cleanExternalText(row.status) || 'active',
    stock,
    availableStock: Math.max(0, stock - reservedStock),
    reservedStock,
    updatedAt: cleanExternalText(row.updated_at || row.price_updated_at)
  }
}

function appendProductFilters(url, where, params) {
  const search = cleanExternalText(url.searchParams.get('search'))
  const status = cleanExternalText(url.searchParams.get('status'))
  const updatedSince = cleanExternalText(url.searchParams.get('updatedSince'))

  if (search) {
    where.push(`(p.sku LIKE ? OR p.product_name LIKE ? OR p.description LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (status && status !== 'all') {
    if (status === 'active') where.push(`COALESCE(p.is_parent, 0) IN (0, 1)`)
    else where.push(`0=1`)
  }
  if (updatedSince) {
    where.push(`COALESCE(v.updated_at, '') >= ?`)
    params.push(updatedSince)
  }
}

export async function listExternalProducts(env, url) {
  await expireOldReservations(env)
  const page = Math.max(externalInt(url.searchParams.get('page'), 1), 1)
  const limit = Math.min(Math.max(externalInt(url.searchParams.get('limit'), 50), 1), 200)
  const offset = (page - 1) * limit
  const where = ['1=1']
  const params = []
  appendProductFilters(url, where, params)

  const whereSql = where.join(' AND ')
  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM products p
    LEFT JOIN (
      SELECT internal_sku, MAX(updated_at) AS updated_at
      FROM product_variations
      WHERE COALESCE(internal_sku, '') != ''
      GROUP BY internal_sku
    ) v ON v.internal_sku = p.sku
    WHERE ${whereSql}
  `).bind(...params).first()

  const { results } = await env.DB.prepare(`
    WITH variation_summary AS (
      SELECT
        internal_sku,
        MIN(NULLIF(platform, '')) AS platform,
        MIN(NULLIF(shop, '')) AS shop,
        MAX(price) AS original_price,
        MAX(discount_price) AS sale_price,
        MAX(updated_at) AS updated_at,
        MAX(NULLIF(image_url, '')) AS variation_image_url
      FROM product_variations
      WHERE COALESCE(internal_sku, '') != ''
      GROUP BY internal_sku
    ),
    active_reservations AS (
      SELECT sku, SUM(quantity) AS reserved_stock
      FROM inventory_reservations
      WHERE status = 'active'
      GROUP BY sku
    )
    SELECT
      p.sku,
      p.product_name,
      p.description,
      p.images,
      COALESCE(NULLIF(p.image_url, ''), v.variation_image_url, '') AS image_url,
      p.cost_invoice,
      p.cost_real,
      p.stock,
      p.stock_main,
      p.stock_sub,
      COALESCE(v.platform, '') AS platform,
      COALESCE(v.shop, '') AS shop,
      COALESCE(v.original_price, 0) AS original_price,
      COALESCE(v.sale_price, 0) AS sale_price,
      COALESCE(v.updated_at, '') AS price_updated_at,
      COALESCE(v.updated_at, '') AS updated_at,
      COALESCE(r.reserved_stock, 0) AS reserved_stock,
      'active' AS status,
      '' AS category
    FROM products p
    LEFT JOIN variation_summary v ON v.internal_sku = p.sku
    LEFT JOIN active_reservations r ON r.sku = p.sku
    WHERE ${whereSql}
    ORDER BY COALESCE(v.updated_at, '') DESC, p.product_name COLLATE NOCASE, p.sku
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all()

  const total = externalInt(countRow?.total)
  return {
    data: (results || []).map(normalizeProductRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  }
}

export async function resolveExternalSku(env, sku) {
  const cleanSku = cleanExternalText(sku)
  if (!cleanSku) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.VALIDATION_ERROR, 'Thiếu SKU', 400)
  }
  const product = await env.DB.prepare(`
    SELECT sku
    FROM products
    WHERE sku = ?
  `).bind(cleanSku).first()
  if (product?.sku) return cleanExternalText(product.sku)

  const variation = await env.DB.prepare(`
    SELECT internal_sku, platform_sku
    FROM product_variations
    WHERE platform_sku = ? OR internal_sku = ?
    ORDER BY CASE WHEN COALESCE(internal_sku, '') != '' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(cleanSku, cleanSku).first()
  const internalSku = cleanExternalText(variation?.internal_sku)
  if (internalSku) return internalSku

  throw new ExternalApiError(EXTERNAL_ERROR_CODES.SKU_NOT_FOUND, 'Không tìm thấy SKU trong Product Master', 404, { sku: cleanSku })
}

export async function getExternalProductBySku(env, sku) {
  await expireOldReservations(env)
  const internalSku = await resolveExternalSku(env, sku)
  const row = await env.DB.prepare(`
    WITH variation_summary AS (
      SELECT
        internal_sku,
        MIN(NULLIF(platform, '')) AS platform,
        MIN(NULLIF(shop, '')) AS shop,
        MAX(price) AS original_price,
        MAX(discount_price) AS sale_price,
        MAX(updated_at) AS updated_at,
        MAX(NULLIF(image_url, '')) AS variation_image_url
      FROM product_variations
      WHERE internal_sku = ?
      GROUP BY internal_sku
    ),
    active_reservations AS (
      SELECT sku, SUM(quantity) AS reserved_stock
      FROM inventory_reservations
      WHERE status = 'active' AND sku = ?
      GROUP BY sku
    )
    SELECT
      p.sku,
      p.product_name,
      p.description,
      p.images,
      COALESCE(NULLIF(p.image_url, ''), v.variation_image_url, '') AS image_url,
      p.cost_invoice,
      p.cost_real,
      p.stock,
      p.stock_main,
      p.stock_sub,
      COALESCE(v.platform, '') AS platform,
      COALESCE(v.shop, '') AS shop,
      COALESCE(v.original_price, 0) AS original_price,
      COALESCE(v.sale_price, 0) AS sale_price,
      COALESCE(v.updated_at, '') AS price_updated_at,
      COALESCE(v.updated_at, '') AS updated_at,
      COALESCE(r.reserved_stock, 0) AS reserved_stock,
      'active' AS status,
      '' AS category
    FROM products p
    LEFT JOIN variation_summary v ON v.internal_sku = p.sku
    LEFT JOIN active_reservations r ON r.sku = p.sku
    WHERE p.sku = ?
  `).bind(internalSku, internalSku, internalSku).first()

  if (!row) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm', 404, { sku: internalSku })
  }
  return normalizeProductRow(row)
}

export async function getExternalProductDetail(env, id) {
  const product = await getExternalProductBySku(env, id)
  const childRows = await env.DB.prepare(`
    SELECT sku
    FROM products
    WHERE parent_sku = ?
    ORDER BY product_name COLLATE NOCASE, sku
  `).bind(product.sku).all()
  const variantSkus = (childRows.results || []).map(row => cleanExternalText(row.sku)).filter(Boolean)
  if (!variantSkus.length) variantSkus.push(product.sku)

  const variants = []
  for (const sku of variantSkus.slice(0, 200)) {
    const variant = await getExternalProductBySku(env, sku)
    variants.push({
      variantId: variant.sku,
      sku: variant.sku,
      variantName: variant.name,
      costPrice: variant.costPrice,
      originalPrice: variant.originalPrice,
      salePrice: variant.salePrice,
      currentPrice: variant.currentPrice,
      discountAmount: variant.discountAmount,
      discountPercent: variant.discountPercent,
      currency: variant.currency,
      stock: variant.stock,
      availableStock: variant.availableStock,
      reservedStock: variant.reservedStock,
      priceUpdatedAt: variant.priceUpdatedAt
    })
  }

  return {
    ...product,
    variants
  }
}

export async function getExternalProductPrice(env, sku) {
  const product = await getExternalProductBySku(env, sku)
  return {
    sku: product.sku,
    productId: product.id,
    variantId: product.sku,
    name: product.name,
    costPrice: product.costPrice,
    originalPrice: product.originalPrice,
    salePrice: product.salePrice,
    currentPrice: product.currentPrice,
    discountAmount: product.discountAmount,
    discountPercent: product.discountPercent,
    currency: product.currency,
    priceUpdatedAt: product.priceUpdatedAt
  }
}

