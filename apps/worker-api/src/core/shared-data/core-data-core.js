import { normalizeOrderReadModel } from '../orders/read-core.js'
import { getCoreShopSummary, shopTermsFromCoreShop } from './shop-core-data.js'

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

async function tableExists(env, tableName) {
  const row = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).bind(tableName).first()
  return Boolean(row?.name)
}

async function ensureOrderCoreReadColumns(env) {
  if (!await tableExists(env, 'orders_v2')) return
  const columns = [
    ['buyer_id', `TEXT DEFAULT ''`],
    ['buyer_username', `TEXT DEFAULT ''`],
    ['source_mode', `TEXT DEFAULT ''`],
    ['source_detail', `TEXT DEFAULT ''`],
    ['source_updated_at', `TEXT DEFAULT ''`],
    ['payment_method', `TEXT DEFAULT ''`],
    ['payment_method_source', `TEXT DEFAULT ''`],
    ['payment_time', `TEXT DEFAULT ''`],
    ['payment_time_source', `TEXT DEFAULT ''`],
    ['customer_note', `TEXT DEFAULT ''`],
    ['customer_note_source', `TEXT DEFAULT ''`]
  ]
  for (const [name, definition] of columns) {
    try {
      // Các cột này là metadata đọc chung để Chat/OMS không phải đoán từ raw text.
      await env.DB.prepare(`ALTER TABLE orders_v2 ADD COLUMN ${name} ${definition}`).run()
    } catch (error) {
      const message = String(error?.message || '').toLowerCase()
      if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
    }
  }
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

function feeSourceFromDetail(fee = {}, fallbackSource = '') {
  return firstCoreText(fee.source, fallbackSource, 'missing')
}

function firstCoreNumberOrNull(...values) {
  for (const value of values) {
    const number = numberCoreValueOrNull(value)
    if (number !== null) return number
  }
  return null
}

function financeRawDetail(fee = {}) {
  const raw = parseCoreJson(fee.raw_data, {}) || {}
  return {
    raw,
    income: raw.order_income || {},
    detail: raw.tiktok_seller_center_detail || {},
    payment: raw.buyer_payment_info || {},
    fieldMeta: raw.tiktok_seller_center_detail?.field_meta || raw.field_meta || {}
  }
}

function financeFieldMeta(fieldMeta = {}, key, fallbackSource = '') {
  const meta = fieldMeta[key] || {}
  return {
    source: firstCoreText(meta.source, fallbackSource),
    confidence: firstCoreText(meta.confidence)
  }
}

function sourceMetaFromRaw(value, source, confidence, updatedAt) {
  const isMissing = value === null || value === undefined || value === ''
  return sourceMeta(
    isMissing ? null : value,
    isMissing ? 'missing' : source,
    isMissing ? 'missing' : confidence,
    updatedAt
  )
}

function buildFinanceCore(order = {}, fee = {}) {
  const feeSource = feeSourceFromDetail(fee)
  const feeUpdatedAt = firstCoreText(fee.updated_at, order.oms_updated_at, order.order_date)
  const rawFinance = financeRawDetail(fee)
  const detail = rawFinance.detail
  const income = rawFinance.income
  const payment = rawFinance.payment
  const fieldMeta = rawFinance.fieldMeta
  const productOriginal = firstCoreNumberOrNull(
    order.product_original_amount,
    order.original_product_amount,
    detail.product_original_amount,
    income.product_original_amount
  )
  const productOriginalMeta = financeFieldMeta(fieldMeta, 'product_original_amount', feeSource || 'order_fee_details.raw_data')
  const buyerShippingPaid = firstCoreNumberOrNull(
    order.shipping_fee_buyer_paid,
    order.buyer_shipping_paid,
    detail.buyer_shipping_paid,
    income.buyer_paid_shipping_fee,
    payment.shipping_fee
  )
  const buyerShippingMeta = financeFieldMeta(fieldMeta, 'buyer_shipping_paid', feeSource || 'order_fee_details.raw_data')
  const platformShippingSubsidy = firstCoreNumberOrNull(
    order.platform_shipping_subsidy,
    detail.platform_shipping_discount,
    income.tiktok_platform_shipping_discount
  )
  const estimatedIncome = firstCoreNumberOrNull(detail.estimated_income, detail.settlement_total, income.estimated_settlement_total)
  const actualIncomeAvailable = detail.actual_income_available === true
  const actualIncome = actualIncomeAvailable ? firstCoreNumberOrNull(detail.actual_income, fee.settlement) : null
  const taxAmount = numberCoreValue(fee.tax_vat) + numberCoreValue(fee.tax_pit)
  return {
    product_original_amount: sourceMetaFromRaw(
      productOriginal,
      productOriginalMeta.source || feeSource || 'order_fee_details.raw_data',
      productOriginalMeta.confidence || 'observed',
      feeUpdatedAt
    ),
    product_selling_amount: sourceMeta(numberCoreValue(order.revenue), firstCoreText(order.source_mode, 'orders_v2_snapshot'), 'snapshot', order.oms_updated_at || order.order_date),
    shop_discount_amount: sourceMeta(numberCoreValue(order.discount_shop) + numberCoreValue(order.discount_combo), firstCoreText(order.source_mode, 'orders_v2_snapshot'), 'snapshot', order.oms_updated_at || order.order_date),
    platform_voucher_amount: sourceMeta(numberCoreValue(order.discount_shopee), firstCoreText(order.source_mode, 'orders_v2_snapshot'), 'snapshot', order.oms_updated_at || order.order_date),
    shop_voucher_amount: sourceMeta(numberCoreValue(order.discount_shop), firstCoreText(order.source_mode, 'orders_v2_snapshot'), 'snapshot', order.oms_updated_at || order.order_date),
    shipping_fee_buyer_paid: sourceMetaFromRaw(
      buyerShippingPaid,
      buyerShippingMeta.source || feeSource || 'order_fee_details.raw_data',
      buyerShippingMeta.confidence || (buyerShippingPaid === 0 ? 'observed_zero' : 'observed'),
      feeUpdatedAt
    ),
    shipping_fee_actual: sourceMeta(numberCoreValue(fee.fee_shipping), feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt),
    platform_shipping_subsidy: sourceMetaFromRaw(platformShippingSubsidy, feeSource || 'order_fee_details.raw_data', 'observed', feeUpdatedAt),
    commission_fee: sourceMeta(numberCoreValue(fee.fee_commission), feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt),
    service_fee: sourceMeta(numberCoreValue(fee.fee_service), feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt),
    handling_fee: sourceMeta(numberCoreValue(fee.fee_handling), feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt),
    transaction_fee: sourceMeta(numberCoreValue(fee.fee_payment), feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt),
    affiliate_fee: sourceMeta(numberCoreValue(fee.fee_affiliate), feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt),
    tax_amount: sourceMeta(taxAmount, feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt),
    gross_profit: sourceMeta(numberCoreValue(order.profit_invoice), firstCoreText(order.source_mode, 'orders_v2_snapshot'), 'snapshot', order.oms_updated_at || order.order_date),
    net_profit: sourceMeta(numberCoreValue(order.profit_real), firstCoreText(order.source_mode, 'orders_v2_snapshot'), 'snapshot', order.oms_updated_at || order.order_date),
    actual_income_amount: sourceMetaFromRaw(actualIncome, feeSource, actualIncomeAvailable ? 'confirmed' : 'missing', feeUpdatedAt),
    estimated_income_amount: sourceMetaFromRaw(estimatedIncome, feeSource || 'order_fee_details.raw_data', 'estimated', feeUpdatedAt),
    settlement_status: firstCoreText(detail.settlement_status, actualIncomeAvailable ? 'settled' : 'pending_settlement'),
    net_received_amount: actualIncomeAvailable
      ? sourceMetaFromRaw(actualIncome, feeSource, 'confirmed', feeUpdatedAt)
      : sourceMetaFromRaw(estimatedIncome, feeSource || 'order_fee_details.raw_data', 'estimated_pending_settlement', feeUpdatedAt),
    total_fee_amount: sourceMeta(numberCoreValue(fee.total_fees), feeSource, feeSource ? 'confirmed' : 'missing', feeUpdatedAt)
  }
}

function normalizeOrderItem(item = {}, product = null, variation = null) {
  const sku = firstCoreText(item.sku, variation?.internal_sku, variation?.platform_sku)
  const source = variation ? 'Product Master + product_variations' : (product ? 'Product Master' : 'order_items_snapshot')
  return {
    sku,
    platform_product_id: firstCoreText(variation?.platform_item_id),
    platform_variation_id: firstCoreText(variation?.model_id),
    platform: lowerCoreText(variation?.platform),
    shop: firstCoreText(variation?.shop),
    shop_id: firstCoreText(variation?.shop),
    platform_sku: firstCoreText(variation?.platform_sku, item.platform_sku, sku),
    product_name: firstCoreText(item.product_name, product?.product_name, variation?.product_name),
    variation_name: firstCoreText(item.variation_name, variation?.variation_name, product?.product_name),
    image_url: firstCoreText(item.image_url, product?.image_url, variation?.image_url),
    qty: numberCoreValue(item.qty),
    price: numberCoreValue(variation?.discount_price || variation?.price || item.price),
    stock: numberCoreValue(product?.stock ?? variation?.stock),
    cost: numberCoreValue(product?.cost_real || product?.cost_invoice || item.cost_real || item.cost_invoice),
    source,
    confidence: variation || product ? 'snapshot' : 'fallback',
    badge: sourceBadge(source, variation || product ? 'snapshot' : 'fallback'),
    updated_at: firstCoreText(variation?.updated_at, product?.updated_at, item.updated_at)
  }
}

async function loadProductsBySkus(env, skus = []) {
  const cleanSkus = [...new Set(skus.map(cleanCoreText).filter(Boolean))]
  const products = new Map()
  const variations = new Map()
  if (!cleanSkus.length) return { products, variations }

  if (await tableExists(env, 'products')) {
    for (let i = 0; i < cleanSkus.length; i += 40) {
      const chunk = cleanSkus.slice(i, i + 40)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
        SELECT *
        FROM products
        WHERE sku IN (${placeholders})
      `).bind(...chunk).all()
      for (const row of results || []) products.set(cleanCoreText(row.sku), row)
    }
  }

  if (await tableExists(env, 'product_variations')) {
    for (let i = 0; i < cleanSkus.length; i += 40) {
      const chunk = cleanSkus.slice(i, i + 40)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
        SELECT *
        FROM product_variations
        WHERE platform_sku IN (${placeholders})
           OR internal_sku IN (${placeholders})
      `).bind(...chunk, ...chunk).all()
      for (const row of results || []) {
        for (const key of [row.platform_sku, row.internal_sku]) {
          const sku = cleanCoreText(key)
          if (sku && !variations.has(sku)) variations.set(sku, row)
        }
      }
    }
  }

  return { products, variations }
}

async function loadOrderLabelCore(env, order = {}) {
  const orderId = cleanCoreText(order.order_id)
  let label = null
  if (orderId && await tableExists(env, 'order_labels')) {
    label = await env.DB.prepare(`
      SELECT storage_key, content_type, refreshed_at, last_checked_at, error
      FROM order_labels
      WHERE order_id = ?
      LIMIT 1
    `).bind(orderId).first().catch(() => null)
  }

  const platform = lowerCoreText(order.platform)
  let apiConnected = 0
  if (['shopee', 'lazada'].includes(platform) && await tableExists(env, 'shops')) {
    const shop = cleanCoreText(order.shop)
    const apiShop = await env.DB.prepare(`
      SELECT id
      FROM shops
      WHERE LOWER(COALESCE(platform, '')) = ?
        AND COALESCE(access_token, '') != ''
        AND (
          shop_name = ?
          OR user_name = ?
          OR CAST(api_shop_id AS TEXT) = ?
        )
      LIMIT 1
    `).bind(platform, shop, shop, shop).first().catch(() => null)
    apiConnected = apiShop ? 1 : 0
  }

  return {
    label_file_path: cleanCoreText(label?.storage_key),
    label_content_type: cleanCoreText(label?.content_type),
    last_label_download_at: cleanCoreText(label?.refreshed_at),
    last_label_error: cleanCoreText(label?.error),
    label_api_connected: apiConnected,
    label_refresh_mode: apiConnected ? 'api' : (platform === 'tiktok' ? 'browser' : 'manual')
  }
}

async function normalizeCoreOrder(env, order = {}) {
  const orderId = cleanCoreText(order.order_id)
  let items = []
  if (await tableExists(env, 'order_items')) {
    const result = await env.DB.prepare(`
      SELECT *
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
    `).bind(orderId).all()
    items = result.results || []
  }
  const fee = await tableExists(env, 'order_fee_details')
    ? await env.DB.prepare(`
        SELECT *
        FROM order_fee_details
        WHERE order_id = ?
        LIMIT 1
      `).bind(orderId).first().catch(() => null)
    : null
  const skuList = (items || []).map(item => item.sku)
  const productMaps = await loadProductsBySkus(env, skuList)
  const normalizedItems = (items || []).map(item => {
    const sku = cleanCoreText(item.sku)
    return normalizeOrderItem(item, productMaps.products.get(sku), productMaps.variations.get(sku))
  })
  const labelCore = await loadOrderLabelCore(env, order)
  const orderCore = normalizeOrderReadModel({ ...order, ...labelCore }, {
    fee,
    itemTable: items.length ? 'order_items' : '',
    feeTable: fee ? 'order_fee_details' : ''
  })
  const source = orderCore.source
  const updatedAt = orderCore.updated_at
  const confidence = orderCore.confidence

  return {
    order_id: orderCore.order_id || orderId,
    platform_order_id: orderCore.platform_order_id || orderId,
    shop_id: orderCore.shop_id,
    shop_name: cleanCoreText(order.shop),
    platform: orderCore.platform,
    buyer_name: orderCore.buyer_name,
    buyer_user_id: orderCore.buyer_user_id,
    order_type: orderCore.order_type,
    raw_platform_status: orderCore.raw_platform_status,
    status_raw: orderCore.status_raw,
    display_status_vi: orderCore.display_status_vi,
    status_label_vi: orderCore.status_label_vi,
    status_kind: orderCore.status_kind,
    status_parent: orderCore.status_parent,
    order_status_core: orderCore.order_status_core,
    order_status_detail: orderCore.order_status_detail,
    fulfillment_status_core: orderCore.fulfillment_status_core,
    terminal_status: orderCore.terminal_status,
    label_eligible: orderCore.label_eligible,
    label_status: orderCore.label_status,
    label_reason: orderCore.label_reason,
    shipping_label_url: orderCore.shipping_label_url,
    label_file_path: orderCore.label_file_path,
    last_label_download_at: orderCore.last_label_download_at,
    last_label_error: orderCore.last_label_error,
    payment_status: orderCore.payment_status,
    payment_method: orderCore.payment_method,
    payment_method_display: orderCore.payment_method_display,
    payment_method_source: orderCore.payment_method_source,
    payment_time: orderCore.payment_time,
    payment_time_display: orderCore.payment_time_display,
    payment_time_source: orderCore.payment_time_source,
    shipping_status: orderCore.shipping_status,
    shipping_carrier: cleanCoreText(order.shipping_carrier || orderCore.tracking_core_logistics_provider),
    logistics_provider: cleanCoreText(order.shipping_carrier || orderCore.tracking_core_logistics_provider),
    tracking_number: orderCore.tracking_number,
    customer_note: cleanCoreText(order.customer_note),
    customer_note_source: cleanCoreText(order.customer_note_source),
    items: normalizedItems,
    amounts: {
      revenue: sourceMeta(numberCoreValue(order.revenue), source, confidence, updatedAt),
      fee: sourceMeta(numberCoreValue(order.fee), firstCoreText(fee?.source, source), fee ? 'confirmed' : confidence, firstCoreText(fee?.updated_at, updatedAt)),
      profit_real: sourceMeta(numberCoreValue(order.profit_real), source, confidence, updatedAt),
      profit_invoice: sourceMeta(numberCoreValue(order.profit_invoice), source, confidence, updatedAt)
    },
    finance_core: buildFinanceCore(order, fee || {}),
    source,
    confidence,
    badge: sourceBadge(source, confidence),
    updated_at: updatedAt,
    raw_source: orderCore.raw_source
  }
}

export async function getCoreOrder(env, orderId) {
  await ensureOrderCoreReadColumns(env)
  if (!await tableExists(env, 'orders_v2')) return null
  const id = cleanCoreText(orderId)
  if (!id) return null
  const order = await env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE order_id = ?
    LIMIT 1
  `).bind(id).first()
  if (!order) return null
  return normalizeCoreOrder(env, order)
}

function conversationOrderIds(searchParams) {
  const values = [
    searchParams.get('order_id'),
    searchParams.get('order_ids'),
    searchParams.get('platform_order_id')
  ].join(',')
  return [...new Set(values.split(',').map(cleanCoreText).filter(Boolean))].slice(0, 20)
}

export async function getCoreOrdersByConversation(env, conversationId, searchParams = new URLSearchParams()) {
  await ensureOrderCoreReadColumns(env)
  if (!await tableExists(env, 'orders_v2')) {
    return { orders: [], match_state: 'missing_orders_table' }
  }
  const platform = lowerCoreText(searchParams.get('platform') || searchParams.get('channel') || 'shopee')
  const rawShop = cleanCoreText(searchParams.get('shop_id') || searchParams.get('shop'))
  const customerId = cleanCoreText(searchParams.get('customer_id') || searchParams.get('buyer_id') || searchParams.get('buyer_username'))
  const orderIds = conversationOrderIds(searchParams)
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 5) || 5, 1), 20)
  const shopCore = rawShop ? await getCoreShopSummary(env, rawShop, { platform }) : null
  const shopTerms = shopTermsFromCoreShop(shopCore, rawShop)
  const conds = [`LOWER(COALESCE(platform, '')) = ?`]
  const params = [platform]

  if (shopTerms.length) {
    const placeholders = shopTerms.map(() => '?').join(',')
    conds.push(`COALESCE(shop, '') IN (${placeholders})`)
    params.push(...shopTerms)
  }

  const identityParts = []
  if (orderIds.length) {
    const placeholders = orderIds.map(() => '?').join(',')
    identityParts.push(`order_id IN (${placeholders})`)
    params.push(...orderIds)
  }
  if (customerId) {
    identityParts.push(`(
      COALESCE(buyer_id, '') = ?
      OR COALESCE(buyer_username, '') = ?
      OR COALESCE(customer_name, '') = ?
      OR COALESCE(customer_name, '') LIKE ?
    )`)
    params.push(customerId, customerId, customerId, `%${customerId}%`)
  }

  if (!identityParts.length) {
    return {
      orders: [],
      shop_core: shopCore,
      match_state: shopCore?.api_status === 'api_active' ? 'need_order_or_buyer_identity' : 'manual_reference_only',
      note: shopCore?.api_status === 'api_active'
        ? 'Chưa có mã đơn hoặc buyer_id để nối chắc chắn hội thoại với Order Core.'
        : 'Shop chưa có API; chỉ đọc dữ liệu manual/import nếu đã có mã đơn rõ ràng.'
    }
  }

  conds.push(`(${identityParts.join(' OR ')})`)
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE ${conds.join(' AND ')}
    ORDER BY datetime(COALESCE(order_date, oms_updated_at, source_updated_at, '1970-01-01')) DESC, order_id DESC
    LIMIT ?
  `).bind(...params, limit).all()
  const orders = []
  for (const row of results || []) {
    orders.push(await normalizeCoreOrder(env, row))
  }
  return {
    orders,
    shop_core: shopCore,
    match_state: orders.length ? 'matched_order_core' : 'no_order_match',
    source: 'Order Core',
    conversation_id: cleanCoreText(conversationId)
  }
}
