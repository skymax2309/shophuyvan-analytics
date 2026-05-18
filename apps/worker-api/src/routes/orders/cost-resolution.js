import { listMarketplaceShopCapabilities } from '../../core/marketplace/shop-capability-core.js'
import { buildOrderFeePhase1Context } from '../../core/orders/fee-phase1-core.js'
import { getCostSettings } from '../../utils/db.js'
import { cleanOrderText } from './status-workflow.js'

export function firstOrderText(...values) {
  for (const value of values) {
    const text = cleanOrderText(value)
    if (text) return text
  }
  return ''
}

export function cleanCarrierName(value) {
  let text = firstOrderText(value)
  if (!text) return ''
  text = text.replace(/^pickup\s*:\s*/i, '')
  text = text.split(',')[0].trim()
  return text
}

export function inferCarrierFromTracking(value) {
  const tracking = cleanOrderText(value).toUpperCase()
  if (!tracking) return ''
  if (tracking.startsWith('BEST')) return 'BEST Express'
  if (tracking.startsWith('JNT') || tracking.startsWith('JT')) return 'J&T Express'
  if (tracking.startsWith('LMP') || tracking.startsWith('LEX')) return 'LEX VN'
  if (tracking.startsWith('AHM')) return 'AhaMove'
  if (tracking.startsWith('SPX')) return 'SPX Express'
  return ''
}

export function normalizeCarrierByTracking(carrier, tracking) {
  const inferred = inferCarrierFromTracking(tracking)
  return inferred || cleanCarrierName(carrier)
}

export function actualCarrierSql(alias = 'o') {
  const raw = `TRIM(COALESCE(${alias}.shipping_carrier, ''))`
  const base = `TRIM(CASE WHEN INSTR(${raw}, ',') > 0 THEN SUBSTR(${raw}, 1, INSTR(${raw}, ',') - 1) ELSE ${raw} END)`
  const lowerBase = `LOWER(${base})`
  const tracking = `UPPER(TRIM(COALESCE(${alias}.tracking_number, '')))`
  return `CASE
    WHEN ${lowerBase} LIKE '%spx%' AND (${lowerBase} LIKE '%trong ngày%' OR ${lowerBase} LIKE '%giao trong ngày%') THEN 'SPX Express - Trong Ngày'
    WHEN ${lowerBase} LIKE '%spx%' AND (${lowerBase} LIKE '%instant%' OR ${lowerBase} LIKE '%hỏa tốc%' OR ${lowerBase} LIKE '%hoa toc%') THEN 'SPX Instant'
    WHEN ${lowerBase} LIKE '%spx%' THEN 'SPX Express'
    WHEN ${lowerBase} LIKE '%j&t%' OR ${lowerBase} LIKE '%jnt%' THEN 'J&T Express'
    WHEN ${lowerBase} LIKE '%giao hàng nhanh%' OR ${lowerBase} = 'ghn' THEN 'Giao Hàng Nhanh'
    WHEN ${lowerBase} LIKE '%giao hàng tiết kiệm%' OR ${lowerBase} = 'ghtk' THEN 'Giao Hàng Tiết Kiệm'
    WHEN ${lowerBase} LIKE '%best%' THEN 'BEST Express'
    WHEN ${lowerBase} LIKE '%ahamove%' THEN 'AhaMove'
    WHEN ${lowerBase} LIKE '%grab%' THEN 'GrabExpress'
    WHEN ${lowerBase} LIKE '%bedelivery%' THEN 'BeDelivery'
    WHEN ${lowerBase} LIKE '%lex%' OR ${lowerBase} LIKE '%lazada express%' THEN 'LEX VN'
    WHEN ${lowerBase} LIKE '%ninja%' THEN 'Ninja Van'
    WHEN ${lowerBase} LIKE '%viettel%' THEN 'Viettel Post'
    WHEN ${lowerBase} IN ('nhanh','standard') THEN 'SPX Express - Nhanh'
    WHEN ${lowerBase} LIKE '%trong ngày%' THEN 'SPX Express - Trong Ngày'
    WHEN ${lowerBase} LIKE '%hỏa tốc%' OR ${lowerBase} LIKE '%hoa toc%' OR ${lowerBase} = 'instant' THEN 'SPX Instant'
    WHEN ${tracking} LIKE 'SPX%' THEN 'SPX Express'
    WHEN ${tracking} LIKE 'JNT%' OR ${tracking} LIKE 'JT%' THEN 'J&T Express'
    WHEN ${tracking} LIKE 'LMP%' OR ${tracking} LIKE 'LEX%' THEN 'LEX VN'
    WHEN ${tracking} LIKE 'BEST%' THEN 'BEST Express'
    WHEN ${tracking} LIKE 'AHM%' THEN 'AhaMove'
    WHEN ${base} != ''
      AND ${lowerBase} NOT IN ('null','undefined','none','-','--','unknown','n/a','na','chua ro','chưa rõ')
      AND ${base} NOT GLOB '*[0-9]*' THEN ${base}
    ELSE ''
  END`
}

export function firstPackage(order) {
  const packages = Array.isArray(order?.package_list) ? order.package_list : []
  if (packages[0] && typeof packages[0] === 'object') return packages[0]
  if (order?.package && typeof order.package === 'object') return order.package
  return {}
}

export function getImportShippingStatus(order) {
  return firstOrderText(order.shipping_status, order.order_status, order.status)
}

export function getImportCarrier(order) {
  const pkg = firstPackage(order)
  return cleanCarrierName(firstOrderText(
    order.shipping_carrier,
    order.shipping_provider,
    order.shipment_provider,
    order.logistics_provider,
    order.delivery_provider,
    order.shipping_provider_type,
    order.delivery_type,
    order.delivery_option,
    pkg.shipping_carrier,
    pkg.shipping_provider,
    pkg.shipment_provider,
    pkg.logistics_channel_name
  ))
}

export function getImportTracking(order) {
  const pkg = firstPackage(order)
  return firstOrderText(
    order.tracking_number,
    order.tracking_no,
    order.tracking_code,
    order.package_number,
    order.package_id,
    pkg.tracking_number,
    pkg.tracking_no,
    pkg.tracking_code,
    pkg.package_number,
    pkg.package_id
  )
}

export const REAL_FEE_COLUMN_MAP = {
  fee_commission: '_fee_commission',
  fee_payment: '_fee_payment',
  fee_service: '_fee_service',
  fee_affiliate: '_fee_affiliate',
  fee_piship: '_fee_piship',
  fee_handling: '_fee_handling',
  fee_ads: '_fee_ads',
  fee_shipping: '_fee_shipping',
  tax_vat: '_tax_vat',
  tax_pit: '_tax_pit'
}

export function feeValue(value) {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? Math.abs(number) : undefined
}

export function feeRawNumberSql(path, alias = 'f') {
  // Raw escrow/finance trong D1 có thể là JSON rỗng hoặc thiếu field, nên luôn kiểm tra json_valid trước khi bóc số.
  return `CASE WHEN ${alias}.order_id IS NOT NULL AND json_valid(${alias}.raw_data) AND json_type(${alias}.raw_data, '${path}') IS NOT NULL THEN ABS(CAST(COALESCE(json_extract(${alias}.raw_data, '${path}'), 0) AS REAL)) ELSE NULL END`
}

export function feeFieldsFromRow(row) {
  const fields = {}
  let hasFee = false
  for (const [column, key] of Object.entries(REAL_FEE_COLUMN_MAP)) {
    const value = feeValue(row?.[column])
    if (value !== undefined) {
      fields[key] = value
      hasFee = true
    }
  }
  if (hasFee) fields._fee_real = true
  return fields
}

export function feeFieldsFromPayload(order) {
  const fields = {}
  let hasFee = order?._fee_real === true || order?._fee_real === 1 || order?.fee_real === true || order?.fee_real === 1
  for (const [column, key] of Object.entries(REAL_FEE_COLUMN_MAP)) {
    const sourceKey = Object.prototype.hasOwnProperty.call(order || {}, key) ? key : column
    const value = feeValue(order?.[sourceKey])
    if (value !== undefined) {
      fields[key] = value
      hasFee = true
    }
  }
  if (hasFee) fields._fee_real = true
  return fields
}

export async function loadOrderFeeMap(env) {
  const feeMap = {}
  try {
    const rows = await env.DB.prepare(`SELECT * FROM order_fee_details`).all()
    for (const row of rows.results || []) {
      const fields = feeFieldsFromRow(row)
      if (fields._fee_real) feeMap[row.order_id] = fields
    }
  } catch (e) {
    // Table is created lazily by API sync, so older DBs can continue without it.
  }

  try {
    const tiktokFees = await env.DB.prepare(`SELECT * FROM tiktok_order_fees`).all()
    for (const row of tiktokFees.results || []) {
      const fields = feeFieldsFromRow(row)
      if (fields._fee_real) feeMap[row.order_id] = { ...(feeMap[row.order_id] || {}), ...fields, _fee_real: true }
    }
  } catch (e) {
    // Legacy TikTok fee table may not exist.
  }

  return feeMap
}

export async function ensureOrderFeeDetailsReadTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS order_fee_details (
      order_id TEXT PRIMARY KEY,
      platform TEXT,
      shop TEXT,
      source TEXT,
      fee_commission REAL,
      fee_payment REAL,
      fee_service REAL,
      fee_affiliate REAL,
      fee_piship REAL,
      fee_handling REAL,
      fee_ads REAL,
      fee_shipping REAL,
      tax_vat REAL,
      tax_pit REAL,
      total_fees REAL,
      settlement REAL,
      raw_data TEXT,
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
}

export async function loadOrderFeePhase1Context(env) {
  const [cfg, capabilities] = await Promise.all([
    getCostSettings(env),
    listMarketplaceShopCapabilities(env, { limit: 500 })
  ])
  return buildOrderFeePhase1Context(cfg, capabilities)
}

export function lookupKey(value) {
  return cleanOrderText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compactKey(value) {
  return lookupKey(value).replace(/[^a-z0-9]+/g, '')
}

export function productCostScore(product) {
  if (!product) return -1
  return (Number(product.cost_real || 0) > 0 ? 4 : 0)
    + (Number(product.cost_invoice || 0) > 0 ? 2 : 0)
    + (Number(product.stock || product.stock_main || product.stock_sub || 0) > 0 ? 1 : 0)
}

export function setBestLookup(map, key, product) {
  if (!key || !product) return
  const current = map.get(key)
  if (!current || productCostScore(product) > productCostScore(current)) map.set(key, product)
}

export function buildProductLookup(productRows) {
  const bySku = {}
  const lookup = new Map()
  const compact = new Map()
  const byName = new Map()

  for (const product of productRows.results || []) {
    if (product.sku) bySku[product.sku] = product
    setBestLookup(lookup, lookupKey(product.sku), product)
    setBestLookup(compact, compactKey(product.sku), product)
    setBestLookup(byName, lookupKey(product.product_name), product)
    setBestLookup(byName, compactKey(product.product_name), product)
  }

  return { bySku, lookup, compact, byName }
}

export function resolveProductFromText(productLookup, value) {
  const text = cleanOrderText(value)
  if (!text) return null
  const exact = productLookup.bySku[text]
  const candidates = [
    exact,
    productLookup.lookup.get(lookupKey(text)),
    productLookup.compact.get(compactKey(text)),
    productLookup.byName.get(lookupKey(text)),
    productLookup.byName.get(compactKey(text))
  ].filter(Boolean)
  if (!candidates.length) return null
  return candidates.reduce((best, product) =>
    productCostScore(product) > productCostScore(best) ? product : best
  )
}

export function resolveCompositeProduct(productLookup, sku, qty) {
  const product = resolveProductFromText(productLookup, sku)
  if (!product) return null
  const amount = Math.max(1, Number(qty || 1) || 1)
  return {
    sku,
    image_url: product.image_url || '',
    cost_real: Number(product.cost_real || 0) * amount,
    cost_invoice: Number(product.cost_invoice || 0) * amount
  }
}

export function resolveMappedItemsProduct(productLookup, mapped) {
  if (!mapped?.mapped_items) return null
  try {
    const components = JSON.parse(mapped.mapped_items)
    if (!Array.isArray(components) || !components.length) return null
    let costReal = 0
    let costInvoice = 0
    let imageUrl = ''
    for (const component of components) {
      const product = resolveProductFromText(productLookup, component.sku)
      if (!product) continue
      const qty = Math.max(1, Number(component.qty || 1) || 1)
      costReal += Number(product.cost_real || 0) * qty
      costInvoice += Number(product.cost_invoice || 0) * qty
      if (!imageUrl && product.image_url) imageUrl = product.image_url
    }
    if (costReal <= 0 && costInvoice <= 0) return null
    return {
      sku: mapped.internal_sku || mapped.platform_sku || '',
      image_url: mapped.image_url || imageUrl,
      cost_real: costReal,
      cost_invoice: costInvoice
    }
  } catch (e) {
    return null
  }
}

export function resolveKnownLegacyCost(productLookup, candidates) {
  const compactText = compactKey(candidates.join(' '))
  const tuiSizes = [
    { size: '40x60', sku: '1TUI4060' },
    { size: '50x70', sku: '1TUI5070' },
    { size: '60x80', sku: '1TUI6080' },
    { size: '80x100', sku: '1TUI80100' }
  ]
  if (compactText.includes('2tui') || compactText.includes('combo2tui')) {
    for (const item of tuiSizes) {
      if (compactText.includes(item.size)) return resolveCompositeProduct(productLookup, item.sku, 2)
    }
  }

  if (compactText.includes('cuonxam') && compactText.includes('35cm') && compactText.includes('2m')) {
    return resolveProductFromText(productLookup, 'xam_3_5cm_x_2mH185')
      || resolveProductFromText(productLookup, 'XAM_3,5CMX2MK185')
  }
  if (compactText.includes('cuonnau') && compactText.includes('35cm') && compactText.includes('2m')) {
    return resolveProductFromText(productLookup, 'NAU 3,5CM_X_2MH185')
      || resolveProductFromText(productLookup, 'NAU_3,5CMX2MK185')
  }
  return null
}

export function skuLookupKeys(item) {
  return [
    item?.sku,
    item?.clean_variation,
    item?.variation_name,
    item?.product_name
  ].map(v => lookupKey(v)).filter(Boolean)
}

export function resolveItemProduct(productLookup, item, varMap = {}, aliasMap = {}) {
  const keys = skuLookupKeys(item)
  const mapped = keys.map(key => varMap[key]).find(Boolean)
  const aliasSku = keys.map(key => aliasMap[key]).find(Boolean)
  const mappedItemsProduct = resolveMappedItemsProduct(productLookup, mapped)
  if (mappedItemsProduct) return mappedItemsProduct
  const candidates = [
    aliasSku,
    mapped?.internal_sku,
    item?.sku,
    item?.clean_variation,
    item?.variation_name,
    mapped?.variation_name,
    item?.product_name
  ].filter(Boolean)

  for (const candidate of candidates) {
    const product = resolveProductFromText(productLookup, candidate)
    if (product) return product
  }
  return resolveKnownLegacyCost(productLookup, candidates) || { cost_real: 0, cost_invoice: 0, image_url: '' }
}

export async function loadSkuResolutionMaps(env) {
  const varRows = await env.DB.prepare(`SELECT platform_sku, internal_sku, mapped_items, image_url, variation_name FROM product_variations WHERE map_status='MAPPED'`).all()
  const varMap = {}
  for (const v of varRows.results || []) {
    if (v.platform_sku) varMap[lookupKey(v.platform_sku)] = v
    if (v.variation_name) varMap[lookupKey(v.variation_name)] = v
  }

  const aliasRows = await env.DB.prepare(`SELECT platform_sku, internal_sku FROM sku_alias`).all()
  const aliasMap = {}
  for (const a of aliasRows.results || []) {
    if (a.platform_sku) aliasMap[lookupKey(a.platform_sku)] = a.internal_sku
  }
  return { varMap, aliasMap }
}
