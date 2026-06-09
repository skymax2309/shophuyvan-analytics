import { saveOrderTrackingCore } from '../logistics/tracking-core.js'
import { ensureSourceTables, round2 } from './analytics-shared-core.js'
import {
  cleanStatusAutomationText as cleanText,
  ensureOrderStatusAutomationColumns,
  extractShopeeSellerCenterDetailId,
  normalizeSellerCenterDetailUrl
} from './status-automation-core.js'
import { mapMarketplaceOrderStatus } from './status-core.js'
import {
  resolveOrderDataSource,
  SHOPEE_SELLER_CENTER_FALLBACK_SHOPS
} from './order-data-source-resolver.js'

export const SHOPEE_SELLER_CENTER_DETAIL_SOURCE = 'shopee_seller_center_detail'
export const SHOPEE_SELLER_CENTER_DETAIL_JOB = 'shopee_seller_detail'
const SHOPEE_NO_API_SHOPS = SHOPEE_SELLER_CENTER_FALLBACK_SHOPS

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? round2(number) : null
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value)
    if (number !== null) return number
  }
  return null
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

async function ensureJobsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      shop_name TEXT,
      platform TEXT,
      month INTEGER,
      year INTEGER,
      status TEXT DEFAULT 'queued',
      scheduled_at TEXT,
      task_type TEXT,
      from_date TEXT,
      to_date TEXT,
      payload TEXT,
      file_url TEXT,
      log_text TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      started_at TEXT,
      completed_at TEXT
    )
  `).run()
}

export function normalizeShopeeSellerCenterDetailPayload(payload = {}) {
  const detailUrl = normalizeSellerCenterDetailUrl(
    payload.seller_center_detail_url
    || payload.detail_url
    || payload.url
    || payload.raw_detail_url
    || ''
  )
  const detailId = firstText(
    payload.seller_center_detail_id,
    payload.seller_order_detail_id,
    payload.detail_id,
    extractShopeeSellerCenterDetailId(detailUrl)
  )
  const inputOrderSn = firstText(payload.order_sn, payload.order_id, payload.orderId, payload.order_no)
  const displayedOrderSn = firstText(
    payload.display_order_sn,
    payload.header_order_sn,
    payload.display_order_id,
    payload.displayed_order_id,
    inputOrderSn
  )
  const orderSn = inputOrderSn || displayedOrderSn
  if (!orderSn) return { ok: false, error: 'missing_order_sn' }
  if (inputOrderSn && displayedOrderSn && inputOrderSn !== displayedOrderSn) {
    return {
      ok: false,
      error: 'order_sn_mismatch',
      order_sn: inputOrderSn,
      display_order_sn: displayedOrderSn,
      seller_center_detail_url: detailUrl,
      seller_center_detail_id: detailId
    }
  }
  if (!detailUrl || !detailId) {
    return {
      ok: false,
      error: 'missing_verified_seller_center_detail_url',
      order_sn: orderSn,
      seller_center_detail_url: detailUrl,
      seller_center_detail_id: detailId
    }
  }

  const shipping = payload.shipping || payload.logistics || {}
  const fields = payload.fields || payload.payment || payload.finance || payload.amounts || payload
  const items = Array.isArray(payload.items) ? payload.items : []
  const tracking = firstText(
    payload.tracking_number,
    payload.tracking_no,
    payload.tracking,
    shipping.tracking_number,
    shipping.tracking_no,
    shipping.tracking
  )
  const logisticsProvider = firstText(
    payload.logistics_provider,
    payload.shipping_provider,
    payload.shipping_carrier,
    shipping.logistics_provider,
    shipping.shipping_provider,
    shipping.shipping_carrier
  )
  const rawStatus = firstText(
    payload.raw_platform_status,
    payload.status,
    payload.status_text,
    payload.display_status,
    shipping.shipping_status,
    shipping.logistics_status
  )
  const productAfterShopDiscount = firstNumber(
    fields.product_revenue_after_shop_discount,
    fields.product_selling_amount,
    fields.item_total_after_discount,
    fields['Tiền sản phẩm sau KM shop'],
    fields['Tổng tiền sản phẩm'],
    fields['Tổng doanh thu']
  )
  const buyerShippingPaid = firstNumber(
    fields.shipping_fee_buyer_paid,
    fields.buyer_shipping_paid,
    fields['Phí vận chuyển người mua trả']
  )
  const buyerTotalPaid = firstNumber(
    fields.buyer_total_paid,
    fields.gross_revenue,
    fields.total_amount,
    fields['Tổng thanh toán'],
    fields['Tổng doanh thu']
  )
  const actualIncome = firstNumber(
    fields.actual_income,
    fields.net_received_amount,
    fields.escrow_amount,
    fields['Thực nhận ví'],
    fields['Doanh thu đơn hàng ước tính']
  )
  const sellerCofundedVoucher = firstNumber(fields.seller_cofunded_voucher_amount, fields.seller_cofunded_voucher)
  const fixedFee = firstNumber(fields.fixed_fee, fields.commission_fee, fields.fee_commission)
  const serviceFee = firstNumber(fields.service_fee, fields.fee_service)
  const transactionFee = firstNumber(fields.transaction_fee, fields.payment_fee, fields.fee_payment)
  const shippingFeeEstimated = firstNumber(fields.shipping_fee_estimated, fields.shipping_fee_seller)
  const shippingSubsidyPlatform = firstNumber(fields.shipping_subsidy_platform, fields.platform_shipping_subsidy)
  const taxVat = firstNumber(fields.tax_vat, fields.vat_tax)
  const taxPit = firstNumber(fields.tax_pit, fields.pit_tax)
  const taxAmount = firstNumber(fields.tax_amount, fields.tax, fields['Thuế'])
  const hasMarketplaceFeeParts = [fixedFee, serviceFee, transactionFee].some(value => numberOrNull(value) !== null)
  const summedMarketplaceFee = hasMarketplaceFeeParts
    ? round2(Math.abs(fixedFee || 0) + Math.abs(serviceFee || 0) + Math.abs(transactionFee || 0))
    : null
  const marketplaceFeeTotal = firstNumber(
    fields.marketplace_fee_total,
    fields.platform_fee,
    fields['Phí sàn'],
    summedMarketplaceFee
  )
  const paymentSeen = [
    productAfterShopDiscount,
    buyerShippingPaid,
    buyerTotalPaid,
    actualIncome,
    fields.shop_discount_amount,
    fields.platform_voucher_amount,
    sellerCofundedVoucher,
    marketplaceFeeTotal,
    taxAmount,
    taxVat,
    taxPit
  ].some(value => numberOrNull(value) !== null)

  return {
    ok: true,
    order_sn: orderSn,
    display_order_sn: displayedOrderSn || orderSn,
    seller_center_detail_id: detailId,
    seller_order_detail_id: detailId,
    seller_center_detail_url: detailUrl,
    detail_url_source: firstText(payload.detail_url_source, payload.url_source) || 'shopee_seller_center_search',
    detail_url_verified_at: firstText(payload.detail_url_verified_at, payload.verified_at, payload.parsed_at) || new Date().toISOString(),
    shop: firstText(payload.shop, payload.shop_name, payload.account_name),
    raw_platform_status: rawStatus,
    display_status: rawStatus,
    tracking_number: tracking,
    logistics_provider: logisticsProvider,
    shipping_status_text: firstText(shipping.shipping_status, shipping.logistics_status),
    order_created_at: firstText(payload.order_created_at, payload.created_at, payload.order_date),
    parsed_at: firstText(payload.parsed_at) || new Date().toISOString(),
    items,
    payment_seen: paymentSeen,
    finance_detail_missing: !paymentSeen,
    finance: {
      product_original_amount: firstNumber(fields.product_original_amount, fields.original_amount, fields['Giá sản phẩm ban đầu']),
      product_revenue_after_shop_discount: productAfterShopDiscount,
      buyer_shipping_paid: buyerShippingPaid,
      buyer_total_paid: buyerTotalPaid,
      shop_discount_amount: firstNumber(fields.shop_discount_amount, fields.seller_discount, fields['Voucher shop']),
      platform_voucher_amount: firstNumber(fields.platform_voucher_amount, fields.platform_discount, fields['Voucher từ sàn']),
      seller_cofunded_voucher_amount: sellerCofundedVoucher,
      shipping_fee_estimated: shippingFeeEstimated,
      shipping_subsidy_platform: shippingSubsidyPlatform,
      fixed_fee: fixedFee,
      service_fee: serviceFee,
      transaction_fee: transactionFee,
      marketplace_fee_total: marketplaceFeeTotal,
      tax_amount: taxAmount,
      tax_vat: taxVat,
      tax_pit: taxPit,
      actual_income: actualIncome,
      finance_confidence: actualIncome !== null ? 'confirmed' : (paymentSeen ? 'estimated' : 'missing')
    },
    tracking_events: Array.isArray(payload.tracking_events || payload.trackingEvents)
      ? (payload.tracking_events || payload.trackingEvents)
      : [],
    tracking_source: firstText(payload.tracking_source, payload.trackingSource),
    raw_text_hash: cleanText(payload.raw_text_hash || payload.rawTextHash || ''),
    raw: payload
  }
}

export function buildShopeeSellerCenterRawData(detail = {}) {
  const finance = detail.finance || {}
  const netShippingFee = round2(Math.max(0, Math.abs(finance.shipping_fee_estimated || 0) - Math.abs(finance.shipping_subsidy_platform || 0)))
  return {
    source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    order_income: {
      order_selling_price: finance.product_revenue_after_shop_discount,
      buyer_paid_shipping_fee: finance.buyer_shipping_paid,
      buyer_total_amount: finance.buyer_total_paid,
      shopee_voucher: finance.platform_voucher_amount,
      voucher_from_seller: finance.seller_cofunded_voucher_amount,
      final_shipping_fee: netShippingFee ? -netShippingFee : null,
      escrow_amount: finance.actual_income,
      escrow_amount_after_adjustment: finance.actual_income
    },
    buyer_payment_info: {
      merchant_subtotal: finance.product_revenue_after_shop_discount,
      shipping_fee: finance.buyer_shipping_paid,
      shopee_voucher: finance.platform_voucher_amount,
      buyer_total_amount: finance.buyer_total_paid
    },
    shopee_seller_center_detail: {
      source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
      order_sn: detail.order_sn,
      seller_center_detail_id: detail.seller_center_detail_id,
      seller_center_detail_url: detail.seller_center_detail_url,
      display_status: detail.display_status,
      tracking_number: detail.tracking_number,
      logistics_provider: detail.logistics_provider,
      product_original_amount: finance.product_original_amount,
      product_revenue_after_shop_discount: finance.product_revenue_after_shop_discount,
      buyer_shipping_paid: finance.buyer_shipping_paid,
      buyer_total_paid: finance.buyer_total_paid,
      shop_discount_amount: finance.shop_discount_amount,
      platform_voucher_amount: finance.platform_voucher_amount,
      seller_cofunded_voucher_amount: finance.seller_cofunded_voucher_amount,
      shipping_fee_estimated: finance.shipping_fee_estimated,
      shipping_subsidy_platform: finance.shipping_subsidy_platform,
      fixed_fee: finance.fixed_fee,
      service_fee: finance.service_fee,
      transaction_fee: finance.transaction_fee,
      marketplace_fee_total: finance.marketplace_fee_total,
      tax_amount: finance.tax_amount,
      tax_vat: finance.tax_vat,
      tax_pit: finance.tax_pit,
      actual_income: finance.actual_income,
      finance_confidence: finance.finance_confidence,
      tracking_events: detail.tracking_events || [],
      tracking_source: detail.tracking_source || '',
      finance_detail_missing: detail.finance_detail_missing,
      parsed_at: detail.parsed_at,
      raw_text_hash: detail.raw_text_hash,
      mapping_vi: {
        product_revenue_after_shop_discount: 'Tiền sản phẩm sau KM shop',
        buyer_shipping_paid: 'Phí vận chuyển người mua trả',
        buyer_total_paid: 'Người mua thanh toán/Tổng doanh thu',
        actual_income: 'Thực nhận ví',
        marketplace_fee_total: 'Tổng khoản sàn thu'
      }
    }
  }
}

export async function listShopeeSellerCenterDetailEligibleOrders(env, options = {}) {
  await ensureOrderStatusAutomationColumns(env)
  const requestedOrderIds = []
  for (const key of ['order_id', 'orderId', 'order_sn', 'orderSn']) {
    const value = cleanText(options[key])
    if (value) requestedOrderIds.push(value)
  }
  if (Array.isArray(options.order_ids)) requestedOrderIds.push(...options.order_ids.map(cleanText).filter(Boolean))
  const uniqueRequested = [...new Set(requestedOrderIds)]
  const limit = Math.min(Math.max(Number(options.limit || 20) || 20, 1), 20)
  const scanLimit = uniqueRequested.length ? Math.max(uniqueRequested.length, limit) : Math.min(Math.max(limit * 8, 50), 200)
  const shop = cleanText(options.shop || options.shop_id).toLowerCase()
  const force = options.force === true || options.force === '1'
  const from = cleanText(options.from || options.from_date)
  const to = cleanText(options.to || options.to_date)
  const missingOnly = options.missing_only === true || options.missingOnly === true || options.missing_only === '1'
  const retryFailed = options.retry_failed === true || options.retryFailed === true || options.retry_failed === '1'
  const pendingSettlementOnly = options.pending_settlement_only === true || options.pendingSettlementOnly === true || options.pending_settlement_only === '1'
  const missingDetailUrlOnly = options.missing_detail_url_only === true || options.missingDetailUrlOnly === true || options.missing_detail_url_only === '1'
  const params = []
  const where = [`LOWER(COALESCE(o.platform, '')) = 'shopee'`]

  if (uniqueRequested.length) {
    where.push(`o.order_id IN (${uniqueRequested.map(() => '?').join(',')})`)
    params.push(...uniqueRequested)
  }
  if (shop) {
    where.push(`LOWER(COALESCE(o.shop, '')) = ?`)
    params.push(shop)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    where.push(`date(COALESCE(NULLIF(o.order_date, ''), NULLIF(o.source_updated_at, ''), NULLIF(o.oms_updated_at, ''))) >= date(?)`)
    params.push(from)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    where.push(`date(COALESCE(NULLIF(o.order_date, ''), NULLIF(o.source_updated_at, ''), NULLIF(o.oms_updated_at, ''))) <= date(?)`)
    params.push(to)
  }
  if (!uniqueRequested.length && !shop) {
    where.push(`LOWER(COALESCE(o.shop, '')) IN (${[...SHOPEE_NO_API_SHOPS].map(() => '?').join(',')})`)
    params.push(...SHOPEE_NO_API_SHOPS)
  }

  const rows = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.order_date,
      o.order_type,
      o.oms_status,
      o.shipping_status,
      o.shipping_carrier,
      o.tracking_number,
      o.source_mode,
      o.source_detail,
      o.source_updated_at,
      o.seller_center_detail_id,
      o.seller_center_detail_url,
      o.detail_url_source,
      o.detail_url_verified_at,
      o.last_status_sync_at,
      o.last_status_sync_error,
      COALESCE(item_stats.item_count, 0) AS item_count,
      f.source AS fee_source,
      f.updated_at AS fee_updated_at,
      COALESCE(ol.storage_key, '') AS label_file_path,
      COALESCE(ol.error, '') AS label_error
    FROM orders_v2 o
    LEFT JOIN (
      SELECT order_id, COUNT(*) AS item_count
      FROM order_items
      GROUP BY order_id
    ) item_stats ON item_stats.order_id = o.order_id
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN order_labels ol ON ol.order_id = o.order_id
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(COALESCE(NULLIF(o.order_date, ''), NULLIF(o.source_updated_at, ''), '1970-01-01')) DESC, o.order_id DESC
    LIMIT ?
  `).bind(...params, scanLimit).all()

  const now = Date.now()
  const freshMs = Math.max(Number(options.fresh_minutes || options.freshMinutes || 180) || 180, 15) * 60 * 1000
  const eligible = []
  for (const row of rows.results || []) {
    const sourceResolution = resolveOrderDataSource(row)
    if (!sourceResolution.seller_center_allowed) continue
    const syncMs = Date.parse(cleanText(row.last_status_sync_at).replace(' ', 'T'))
    const feeMs = Date.parse(cleanText(row.fee_updated_at).replace(' ', 'T'))
    const syncFresh = Number.isFinite(syncMs) && now - syncMs < freshMs
    const feeFresh = Number.isFinite(feeMs) && now - feeMs < freshMs
    const noApiShop = sourceResolution.seller_center_allowed
    const missingDetailUrl = !cleanText(row.seller_center_detail_url)
    const missingTracking = !cleanText(row.tracking_number)
    const missingItems = Number(row.item_count || 0) <= 0
    const missingFinance = cleanText(row.fee_source) !== SHOPEE_SELLER_CENTER_DETAIL_SOURCE
    const statusNeedsSync = !syncFresh && !['COMPLETED', 'CANCELLED', 'RETURN'].includes(cleanText(row.oms_status).toUpperCase())
    const missingLabel = !cleanText(row.label_file_path) && !cleanText(row.label_error)
    const failedBefore = cleanText(row.last_status_sync_error)
    let reason = ''
    if (force || uniqueRequested.includes(cleanText(row.order_id))) reason = 'requested'
    else if (!noApiShop) reason = ''
    else if (retryFailed && failedBefore) reason = 'retry_failed'
    else if (missingDetailUrl) reason = 'missing_seller_center_detail_url'
    else if (missingTracking) reason = 'missing_tracking'
    else if (missingItems) reason = 'missing_items'
    else if (missingFinance && !feeFresh) reason = 'missing_finance_detail'
    else if (statusNeedsSync) reason = 'status_stale_or_missing'
    else if (missingLabel && ['LOGISTICS_PACKAGED', 'LOGISTICS_REQUEST_CREATED', 'SHIPPED', 'TO_CONFIRM_RECEIVE'].includes(cleanText(row.shipping_status).toUpperCase())) reason = 'label_check_needed'
    if (!reason) continue
    if (missingOnly && !['missing_seller_center_detail_url', 'missing_tracking', 'missing_items', 'missing_finance_detail'].includes(reason)) continue
    if (missingDetailUrlOnly && reason !== 'missing_seller_center_detail_url') continue
    if (pendingSettlementOnly && !['missing_finance_detail', 'retry_failed'].includes(reason)) continue
    eligible.push({
      order_id: cleanText(row.order_id),
      order_sn: cleanText(row.order_id),
      platform: 'shopee',
      shop: cleanText(row.shop),
      order_date: cleanText(row.order_date),
      seller_center_detail_url: cleanText(row.seller_center_detail_url),
      seller_center_detail_id: cleanText(row.seller_center_detail_id),
      detail_url_source: cleanText(row.detail_url_source),
      detail_url_verified_at: cleanText(row.detail_url_verified_at),
      tracking_number: cleanText(row.tracking_number),
      reason,
      resolve_detail_url: missingDetailUrl,
      source_resolution: sourceResolution
    })
    if (eligible.length >= limit) break
  }

  return {
    status: 'ok',
    source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    scanned: rows.results?.length || 0,
    eligible_count: eligible.length,
    limit,
    orders: eligible
  }
}

export async function queueShopeeSellerCenterDetailJobs(env, orders = [], options = {}) {
  const inputRows = (orders || [])
    .map(order => ({
      order_id: cleanText(order.order_id || order.order_sn),
      shop: cleanText(order.shop || order.shop_name || order.user_name),
      detail_url: cleanText(order.seller_center_detail_url || order.detail_url),
      reason: cleanText(order.reason),
      resolve_detail_url: order.resolve_detail_url === true || !cleanText(order.seller_center_detail_url || order.detail_url)
    }))
    .filter(row => row.order_id && row.shop)
  const rows = inputRows.filter(row => resolveOrderDataSource({ platform: 'shopee', shop: row.shop }).seller_center_allowed)
  const skippedSourceMismatch = inputRows.length - rows.length
  if (!rows.length) return { queued_jobs: 0, queued_orders: 0, skipped_source_mismatch: skippedSourceMismatch, jobs: [] }

  await ensureJobsTable(env)
  const grouped = new Map()
  for (const row of rows.slice(0, Math.min(Number(options.limit || 20) || 20, 20))) {
    if (!grouped.has(row.shop)) grouped.set(row.shop, [])
    grouped.get(row.shop).push(row)
  }

  const now = new Date()
  const jobs = []
  for (const [shop, shopRows] of grouped.entries()) {
    const payload = {
      task_type: SHOPEE_SELLER_CENTER_DETAIL_JOB,
      action_type: cleanText(options.action_type || options.actionType || 'sync_detail') || 'sync_detail',
      trigger: cleanText(options.trigger || 'manual'),
      scope: Array.isArray(options.scope) ? options.scope.map(cleanText).filter(Boolean) : [],
      order_ids: shopRows.map(row => row.order_id),
      orders: shopRows.map(row => ({
        order_sn: row.order_id,
        seller_center_detail_url: row.detail_url,
        reason: row.reason,
        resolve_detail_url: row.resolve_detail_url
      })),
      resolve_detail_url: shopRows.some(row => row.resolve_detail_url),
      limit: Math.min(shopRows.length, 20),
      source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE
    }
    const result = await env.DB.prepare(`
      INSERT INTO jobs (user_id, shop_name, platform, month, year, status, scheduled_at, task_type, from_date, to_date, payload)
      VALUES ('admin', ?, 'shopee', ?, ?, 'queued', NULL, ?, NULL, NULL, ?)
    `).bind(
      shop,
      now.getMonth() + 1,
      now.getFullYear(),
      SHOPEE_SELLER_CENTER_DETAIL_JOB,
      JSON.stringify(payload)
    ).run()
    jobs.push({
      id: result?.meta?.last_row_id || result?.lastRowId || null,
      shop,
      order_ids: shopRows.map(row => row.order_id),
      task_type: SHOPEE_SELLER_CENTER_DETAIL_JOB,
      action_type: payload.action_type
    })
  }

  return {
    queued_jobs: jobs.length,
    queued_orders: rows.length,
    skipped_source_mismatch: skippedSourceMismatch,
    jobs
  }
}

export async function queueShopeeSellerCenterDetailAfterImport(env, processedOrders = [], options = {}) {
  const shopeeOrderIds = [...new Set((processedOrders || [])
    .filter(order => cleanText(order.platform).toLowerCase() === 'shopee')
    .filter(order => resolveOrderDataSource({
      platform: 'shopee',
      shop: order.shop,
      source_mode: order.source_mode || order.sourceMode
    }).seller_center_allowed)
    .map(order => cleanText(order.order_id))
    .filter(Boolean))]
  if (!shopeeOrderIds.length) return { eligible_count: 0, queued_jobs: 0, queued_orders: 0, orders: [] }

  const eligible = await listShopeeSellerCenterDetailEligibleOrders(env, {
    order_ids: shopeeOrderIds,
    limit: Math.min(Number(options.limit || 20) || 20, 20),
    force: options.force
  })
  const queued = await queueShopeeSellerCenterDetailJobs(env, eligible.orders, {
    trigger: options.trigger || 'after_order_import',
    limit: eligible.limit
  })
  return {
    ...eligible,
    ...queued,
    trigger: options.trigger || 'after_order_import'
  }
}

async function maybeReplaceShopeeDetailItems(env, orderId, items = [], options = {}) {
  if (!items.length) return { inserted_items: 0, skipped_items: 0 }
  const current = await env.DB.prepare(`SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?`).bind(orderId).first()
  if (Number(current?.count || 0) > 0 && options.replace_items !== true) {
    return { inserted_items: 0, skipped_items: items.length, reason: 'existing_items_preserved' }
  }
  await env.DB.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(orderId).run()
  const stmts = items.slice(0, 80).map(item => env.DB.prepare(`
    INSERT INTO order_items (order_id, sku, variation_name, product_name, qty, revenue_line, cost_real, cost_invoice, image_url)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).bind(
    orderId,
    firstText(item.sku, item.variation_sku, item.model_sku),
    firstText(item.variation_name, item.model_name, item.classification),
    firstText(item.product_name, item.name, item.title),
    Math.max(Number(item.qty || item.quantity || 1) || 1, 1),
    Number(item.revenue_line || item.line_total || item.total || item.price || 0) || 0,
    firstText(item.image_url, item.image)
  ))
  if (stmts.length) await env.DB.batch(stmts)
  return { inserted_items: stmts.length, skipped_items: 0 }
}

async function maybeUpsertShopeeFinance(env, order, detail = {}) {
  const finance = detail.finance || {}
  const rawData = buildShopeeSellerCenterRawData(detail)
  if (detail.finance_detail_missing) return { finance_status: 'missing', finance_detail_missing: true }
  const currentRaw = parseJsonSafe(order.existing_fee_raw_data)
  const currentSource = cleanText(order.existing_fee_source)
  const currentConfirmed = firstText(currentRaw?.shopee_seller_center_detail?.finance_confidence, currentSource).includes('confirmed')
  if (currentConfirmed && finance.finance_confidence !== 'confirmed') {
    return { finance_status: 'preserved_confirmed', finance_detail_missing: false }
  }
  const feeCommission = Math.abs(finance.fixed_fee || finance.marketplace_fee_total || 0)
  const feePayment = Math.abs(finance.transaction_fee || 0)
  const feeService = Math.abs(finance.service_fee || 0)
  const feeShipping = round2(Math.max(0, Math.abs(finance.shipping_fee_estimated || 0) - Math.abs(finance.shipping_subsidy_platform || 0)))
  const taxVat = Math.abs(finance.tax_vat || 0)
  const taxPit = Math.abs(finance.tax_pit || 0)
  const taxFallback = !taxVat && !taxPit ? Math.abs(finance.tax_amount || 0) : 0
  const totalFees = round2(feeCommission + feePayment + feeService + feeShipping + taxVat + taxPit + taxFallback)
  await ensureSourceTables(env)
  await env.DB.prepare(`
    INSERT INTO order_fee_details (
      order_id, platform, shop, source,
      fee_commission, fee_payment, fee_service, fee_affiliate, fee_piship, fee_handling,
      fee_ads, fee_shipping, tax_vat, tax_pit, total_fees, settlement, raw_data, updated_at
    )
    VALUES (?, 'shopee', ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
    ON CONFLICT(order_id) DO UPDATE SET
      platform = 'shopee',
      shop = excluded.shop,
      source = excluded.source,
      fee_commission = excluded.fee_commission,
      fee_payment = excluded.fee_payment,
      fee_service = excluded.fee_service,
      fee_shipping = excluded.fee_shipping,
      tax_vat = excluded.tax_vat,
      tax_pit = excluded.tax_pit,
      total_fees = excluded.total_fees,
      settlement = excluded.settlement,
      raw_data = excluded.raw_data,
      updated_at = excluded.updated_at
  `).bind(
    detail.order_sn,
    cleanText(order.shop),
    SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    feeCommission,
    feePayment,
    feeService,
    feeShipping,
    taxVat || taxFallback,
    taxPit,
    totalFees,
    finance.actual_income,
    JSON.stringify(rawData)
  ).run()
  return { finance_status: finance.finance_confidence || 'estimated', finance_detail_missing: false }
}

export async function upsertShopeeSellerCenterDetail(env, payload = {}) {
  await ensureOrderStatusAutomationColumns(env)
  const normalized = normalizeShopeeSellerCenterDetailPayload(payload)
  if (!normalized.ok) return { status: 'error', ...normalized }

  const order = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.order_date,
      o.oms_status,
      o.shipping_status,
      o.tracking_number,
      o.shipping_carrier,
      f.source AS existing_fee_source,
      f.raw_data AS existing_fee_raw_data
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    WHERE o.order_id = ?
  `).bind(normalized.order_sn).first()
  if (!order) return { status: 'error', error: 'order_not_found', order_sn: normalized.order_sn }
  if (cleanText(order.platform).toLowerCase() !== 'shopee') {
    return { status: 'error', error: 'not_shopee_order', order_sn: normalized.order_sn, platform: cleanText(order.platform) }
  }
  const sourceResolution = resolveOrderDataSource(order)
  if (!sourceResolution.seller_center_allowed) {
    return {
      status: 'error',
      error: 'source_mismatch_api_shop_not_seller_center',
      order_sn: normalized.order_sn,
      shop: cleanText(order.shop),
      source_resolution: sourceResolution
    }
  }

  const mapped = mapMarketplaceOrderStatus('shopee', normalized.raw_platform_status, {
    tracking: normalized.tracking_number,
    logisticsStatus: normalized.shipping_status_text
  })
  const unknownStatus = cleanText(mapped.reason).includes('Raw status chưa có') || cleanText(mapped.shipping).toUpperCase() === 'UNKNOWN'
  const statusChanged = [order.oms_status, order.shipping_status]
    .map(cleanText)
    .join('|') !== [mapped.oms, mapped.shipping].map(cleanText).join('|')
  const nextStatusError = unknownStatus ? 'unknown_status' : ''

  await env.DB.prepare(`
    UPDATE orders_v2
    SET
      oms_status = ?,
      shipping_status = ?,
      order_type = ?,
      shipping_carrier = CASE WHEN ? != '' THEN ? ELSE shipping_carrier END,
      tracking_number = CASE WHEN ? != '' THEN ? ELSE tracking_number END,
      source_mode = 'browser_sync',
      source_detail = ?,
      source_url = ?,
      raw_detail_url = ?,
      source_updated_at = datetime('now', '+7 hours'),
      seller_center_detail_id = ?,
      seller_center_detail_url = ?,
      seller_order_detail_id = ?,
      detail_url_source = ?,
      detail_url_verified_at = ?,
      last_status_sync_at = datetime('now', '+7 hours'),
      last_status_sync_status = ?,
      last_status_sync_error = ?,
      status_source = ?,
      status_changed_at = CASE WHEN ? THEN datetime('now', '+7 hours') ELSE status_changed_at END,
      status_touched_24h = 1,
      status_changed_count = COALESCE(status_changed_count, 0) + ?,
      next_retry_at = '',
      oms_updated_at = CASE WHEN ? THEN datetime('now', '+7 hours') ELSE oms_updated_at END
    WHERE order_id = ?
  `).bind(
    mapped.oms,
    mapped.shipping,
    mapped.type,
    normalized.logistics_provider,
    normalized.logistics_provider,
    normalized.tracking_number,
    normalized.tracking_number,
    SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    normalized.seller_center_detail_url,
    normalized.seller_center_detail_url,
    normalized.seller_center_detail_id,
    normalized.seller_center_detail_url,
    normalized.seller_order_detail_id,
    normalized.detail_url_source,
    normalized.detail_url_verified_at,
    unknownStatus ? 'unknown_status' : 'ok',
    nextStatusError,
    SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    statusChanged ? 1 : 0,
    statusChanged ? 1 : 0,
    statusChanged ? 1 : 0,
    normalized.order_sn
  ).run()

  const items = await maybeReplaceShopeeDetailItems(env, normalized.order_sn, normalized.items, {
    replace_items: payload.replace_items === true || payload.replaceItems === true
  })
  const finance = await maybeUpsertShopeeFinance(env, order, normalized)
  let trackingCore = null
  if ((normalized.tracking_events || []).length || normalized.tracking_number || normalized.logistics_provider) {
    trackingCore = await saveOrderTrackingCore(env, {
      order_id: normalized.order_sn,
      platform: 'shopee',
      shop: cleanText(order.shop),
      tracking_number: normalized.tracking_number,
      logistics_provider: normalized.logistics_provider,
      events: normalized.tracking_events || [],
      tracking_source: normalized.tracking_source || SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
      raw_data: {
        seller_center_detail_url: normalized.seller_center_detail_url,
        seller_center_detail_id: normalized.seller_center_detail_id
      }
    })
  }

  return {
    status: unknownStatus ? 'partial_error' : 'ok',
    source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    order_id: normalized.order_sn,
    order_sn: normalized.order_sn,
    shop: cleanText(order.shop),
    seller_center_detail_id: normalized.seller_center_detail_id,
    seller_center_detail_url: normalized.seller_center_detail_url,
    detail_url_source: normalized.detail_url_source,
    detail_url_verified_at: normalized.detail_url_verified_at,
    raw_platform_status: normalized.raw_platform_status,
    oms_status: mapped.oms,
    shipping_status: mapped.shipping,
    status_changed: statusChanged,
    tracking_number: normalized.tracking_number,
    logistics_provider: normalized.logistics_provider,
    tracking_events_count: (normalized.tracking_events || []).length,
    tracking_core: trackingCore,
    ...items,
    ...finance,
    error: nextStatusError
  }
}
