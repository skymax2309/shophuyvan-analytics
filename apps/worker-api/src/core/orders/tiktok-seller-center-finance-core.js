import { saveOrderTrackingCore } from '../logistics/tracking-core.js'
import { cleanText, ensureSourceTables, round2 } from './analytics-shared-core.js'
import { mapMarketplaceOrderStatus } from './status-core.js'

export const TIKTOK_SELLER_CENTER_DETAIL_SOURCE = 'tiktok_seller_center_detail'
export const TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE = 'tiktok_seller_center_finance_transaction'
export const TIKTOK_SELLER_CENTER_DETAIL_JOB = 'tiktok_seller_detail_finance'

function numberOrNull(value) {
  if (value && typeof value === 'object' && 'value' in value) return numberOrNull(value.value)
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

function parseJsonSafe(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text && !text.includes('*')) return text
  }
  return ''
}

function moneyFieldMeta(fields = {}, key, value, source = TIKTOK_SELLER_CENTER_DETAIL_SOURCE, parsedAt = '') {
  const raw = fields?.field_meta?.[key] || fields?.__meta?.[key] || fields?.[key]
  const meta = raw && typeof raw === 'object' ? raw : {}
  const observedText = cleanText(meta.observed_text || meta.raw_label || meta.raw_text || meta.text)
  const hasValue = value !== null && value !== undefined
  return {
    value: hasValue ? round2(value) : null,
    source: cleanText(meta.source || source) || (hasValue ? source : ''),
    confidence: cleanText(meta.confidence) || (hasValue ? (Number(value) === 0 ? 'observed_zero' : 'observed') : 'missing'),
    observed_text: observedText,
    parsed_at: cleanText(meta.parsed_at || parsedAt)
  }
}

function normalizeVietnamDateTime(value = '') {
  const text = cleanText(value)
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return text
  const [, d, m, y, hh = '00', mm = '00', ss = '00'] = match
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${mm}:${ss}`
}

function normalizeViText(value = '') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isInvalidTiktokCarrier(value = '') {
  const text = normalizeViText(value)
  return ['cach giao hang', 'phuong thuc van chuyen', 'van chuyen qua nen tang'].includes(text)
}

function tiktokTrackingText(events = []) {
  return (events || [])
    .map(event => [
      event?.status,
      event?.title,
      event?.description,
      event?.message,
      event?.raw_text,
      event?.time,
      event?.datetime
    ].map(cleanText).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' | ')
}

function hasTiktokCarrierMovement(events = []) {
  const text = normalizeViText(tiktokTrackingText(events))
  if (!text) return false
  if (/(da giao hang|giao hang thanh cong|da huy|hoan hang|tra hang)/.test(text)) return false
  return /(dang trung chuyen|trung tam khai thac|da den trung tam|da roi trung tam|don vi van chuyen da tiep nhan|hang chuyen phat dang tren duong|lay kien hang|da lay hang|da ban giao|buu cuc|in transit|picked up|pickup)/.test(text)
}

function promoteTiktokStatusFromTracking(mapped = {}, detail = {}) {
  const oms = cleanText(mapped.oms).toUpperCase()
  const shipping = cleanText(mapped.shipping).toUpperCase()
  if (['DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED'].includes(oms)) return mapped
  if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(shipping)) return mapped
  if (!hasTiktokCarrierMovement(detail.tracking_events || [])) return mapped
  // Tracking Core có event ĐVVC thật nên không giữ đơn ở "đã xử lý/sẵn sàng giao".
  return {
    ...mapped,
    oms: 'SHIPPING',
    shipping: 'SHIPPED',
    type: cleanText(mapped.type) || 'normal',
    reason: 'Tracking Core có event vận chuyển từ ĐVVC'
  }
}

async function addColumnIfMissing(env, table, column, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
  }
}

async function ensureTiktokSellerDetailOrderColumns(env) {
  const columns = [
    ['customer_phone', "TEXT DEFAULT ''"],
    ['seller_center_detail_url', "TEXT DEFAULT ''"],
    ['detail_url_source', "TEXT DEFAULT ''"],
    ['detail_url_verified_at', "TEXT DEFAULT ''"],
    ['last_status_sync_at', "TEXT DEFAULT ''"],
    ['last_status_sync_status', "TEXT DEFAULT ''"],
    ['last_status_sync_error', "TEXT DEFAULT ''"],
    ['status_source', "TEXT DEFAULT ''"],
    ['status_changed_at', "TEXT DEFAULT ''"],
    ['status_touched_24h', 'INTEGER DEFAULT 0'],
    ['status_changed_count', 'INTEGER DEFAULT 0'],
    ['next_retry_at', "TEXT DEFAULT ''"]
  ]
  for (const [column, definition] of columns) {
    await addColumnIfMissing(env, 'orders_v2', column, definition)
  }
}

function confirmedTiktokSellerIncomeFromRaw(rawData, settlement) {
  const raw = typeof rawData === 'string' ? parseJsonSafe(rawData) : (rawData || {})
  const detail = raw.tiktok_seller_center_detail || {}
  const actualIncome = firstNumber(detail.actual_income, settlement)
  const confirmed = detail.actual_income_available === true
    && cleanText(detail.finance_confidence) === 'confirmed'
    && actualIncome !== null
  return confirmed ? actualIncome : null
}

function hasPositive(value) {
  return Number(value || 0) > 0
}

export function extractTiktokOrderNoFromUrl(value = '') {
  const text = cleanText(value)
  if (!text) return ''
  try {
    const url = new URL(text)
    return cleanText(url.searchParams.get('order_no') || url.searchParams.get('order_id') || url.searchParams.get('orderOrSkuId') || url.searchParams.get('order_or_sku_id'))
  } catch {
    const match = text.match(/(?:order_no|order_id|orderOrSkuId|order_or_sku_id)=([^&\s]+)/i)
    return cleanText(match?.[1] || text)
  }
}

export function normalizeTiktokSellerCenterDetailPayload(payload = {}) {
  const urlOrderNo = extractTiktokOrderNoFromUrl(payload.url || payload.detail_url || payload.detailUrl)
  const inputOrderNo = cleanText(payload.order_no || payload.orderNo || payload.order_id || payload.orderId || urlOrderNo)
  const headerOrderNo = cleanText(payload.header_order_no || payload.headerOrderNo || payload.display_order_no || payload.displayOrderNo || inputOrderNo)
  const orderNo = inputOrderNo || urlOrderNo || headerOrderNo
  if (!orderNo) {
    return { ok: false, error: 'missing_order_no' }
  }
  if (urlOrderNo && urlOrderNo !== orderNo) {
    return { ok: false, error: 'url_order_no_mismatch', order_no: orderNo, url_order_no: urlOrderNo }
  }
  if (headerOrderNo && headerOrderNo !== orderNo) {
    return { ok: false, error: 'header_order_no_mismatch', order_no: orderNo, header_order_no: headerOrderNo }
  }

  const fields = payload.fields || payload.amounts || payload.money || payload
  if (payload.field_meta && fields && typeof fields === 'object') fields.field_meta = payload.field_meta
  const parsedAt = cleanText(payload.parsed_at || payload.parsedAt) || new Date().toISOString()
  const payloadFinanceSource = firstText(payload.finance_source, payload.financeSource)
  const payloadDetailUrl = cleanText(payload.url || payload.detail_url || payload.detailUrl)
  const financeTransactionPayload = payloadFinanceSource === TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE
    || payloadDetailUrl.includes('/finance/transactions')
  let productOriginalAmount = firstNumber(
    fields.product_original_amount,
    fields.total_items_before_discount,
    fields.item_total_before_discount,
    fields['Tổng các mặt hàng trước khi giảm giá'],
    fields['Tổng (các) mặt hàng trước khi giảm giá']
  )
  const sellerItemDiscountRaw = firstNumber(
    fields.seller_item_discount,
    fields.seller_discount,
    fields.shop_discount_amount,
    fields['Giảm giá của người bán cho các mặt hàng']
  )
  const sellerItemDiscount = Math.abs(sellerItemDiscountRaw || 0)
  const platformItemDiscountRaw = firstNumber(
    fields.platform_item_discount,
    fields.tiktok_item_discount,
    fields.platform_discount_amount,
    fields['Giảm giá của TikTok Shop cho các mặt hàng']
  )
  const platformItemDiscount = Math.abs(platformItemDiscountRaw || 0)
  const productAfterShopDiscount = firstNumber(
    fields.product_revenue_after_shop_discount,
    fields.total_items_after_discount,
    fields.item_total_after_discount,
    fields.estimated_revenue,
    fields['Tổng các mặt hàng sau khi giảm giá'],
    fields['Tổng (các) mặt hàng sau khi giảm giá']
  )
  if (
    productOriginalAmount === null
    && productAfterShopDiscount !== null
    && !financeTransactionPayload
    && (sellerItemDiscountRaw !== null || platformItemDiscountRaw !== null)
  ) {
    productOriginalAmount = round2(productAfterShopDiscount + sellerItemDiscount + platformItemDiscount)
  }
  let buyerShippingPaid = firstNumber(
    fields.buyer_shipping_paid,
    fields.shipping_fee_after_discount,
    fields['Phí vận chuyển sau khi giảm giá']
  )
  const paymentMethod = firstText(
    payload.payment_method,
    payload.paymentMethod,
    payload.buyer_payment_method,
    payload.buyerPaymentMethod,
    fields.payment_method,
    fields.paymentMethod,
    fields.buyer_payment_method,
    fields.buyerPaymentMethod,
    fields['Phương thức thanh toán']
  )
  const sellerShippingDiscount = Math.abs(firstNumber(
    fields.seller_shipping_discount,
    fields['Giảm phí vận chuyển của người bán']
  ) || 0)
  const platformShippingDiscount = Math.abs(firstNumber(
    fields.platform_shipping_discount,
    fields.tiktok_shipping_discount,
    fields['Giảm phí vận chuyển của TikTok Shop']
  ) || 0)
  const grossRevenue = firstNumber(
    fields.gross_revenue,
    fields.buyer_total_paid,
    fields.total_amount,
    fields['Tổng cộng']
  )
  if (
    buyerShippingPaid === null
    && grossRevenue !== null
    && productAfterShopDiscount !== null
    && !financeTransactionPayload
    && grossRevenue >= productAfterShopDiscount
  ) {
    buyerShippingPaid = round2(grossRevenue - productAfterShopDiscount)
  }
  const actualIncome = firstNumber(
    fields.actual_income,
    fields.earned_amount,
    fields.seller_income,
    fields['Số tiền bạn kiếm được']
  )
  const settlementTotal = firstNumber(
    fields.settlement_total,
    fields.estimated_settlement_total,
    fields['Tổng số tiền quyết toán']
  )
  const estimatedIncome = firstNumber(
    fields.estimated_income,
    settlementTotal,
    fields.estimated_seller_income,
    fields['Thu nhập ước tính']
  )
  const estimatedFeeTotal = firstNumber(fields.estimated_fee_total, fields.total_estimated_fee, fields['Phí ước tính'])
  const transactionFee = firstNumber(fields.transaction_fee, fields.payment_fee, fields['Phí giao dịch ước tính'])
  const commissionFee = firstNumber(fields.commission_fee, fields.platform_commission_fee, fields['Phí hoa hồng của TikTok Shop'])
  const sellerShippingFee = firstNumber(fields.seller_shipping_fee, fields.shipping_fee_seller, fields['Phí vận chuyển ước tính của người bán'])
  const handlingFee = firstNumber(fields.handling_fee, fields.order_handling_fee, fields['Phí xử lý đơn hàng'])
  const taxVat = firstNumber(fields.tax_vat, fields.vat_tax, fields['Thuế GTGT do TikTok Shop khấu trừ'])
  const taxPit = firstNumber(fields.tax_pit, fields.pit_tax, fields['Thuế TNCN do TikTok Shop khấu trừ'])
  const sfrServiceFee = firstNumber(fields.sfr_service_fee, fields.service_fee_sfr, fields['Phí dịch vụ SFR ước tính'])
  const incomeUnavailable = payload.income_unavailable === true
    || payload.actual_income_available === false
    || fields.actual_income_available === false
    || cleanText(payload.settlement_status || fields.settlement_status).toLowerCase().includes('pending')
  const actualIncomeLooksLikeSfr = actualIncome !== null
    && sfrServiceFee !== null
    && Math.abs(actualIncome) === Math.abs(sfrServiceFee)
    && !financeTransactionPayload
  const actualAvailable = actualIncome !== null && !incomeUnavailable && !actualIncomeLooksLikeSfr
  const customer = payload.customer || payload.customer_detail || {}
  const items = Array.isArray(payload.items) ? payload.items : []
  const trackingEvents = Array.isArray(payload.tracking_events || payload.trackingEvents)
    ? (payload.tracking_events || payload.trackingEvents)
    : []
  const trackingNumber = firstText(
    payload.tracking_number,
    payload.tracking_no,
    payload.tracking,
    customer.tracking_number
  )
  const shippingCarrier = firstText(
    payload.shipping_carrier,
    payload.logistics_provider,
    payload.shipping_provider,
    payload.carrier
  )
  const rawPlatformStatus = firstText(
    payload.raw_platform_status,
    payload.status,
    payload.status_text,
    payload.display_status
  )

  return {
    ok: true,
    order_no: orderNo,
    url_order_no: urlOrderNo,
    header_order_no: headerOrderNo,
    detail_url: cleanText(payload.url || payload.detail_url || payload.detailUrl) || `https://seller-vn.tiktok.com/order/detail?order_no=${encodeURIComponent(orderNo)}&shop_region=VN`,
    shop_region: cleanText(payload.shop_region || payload.shopRegion || 'VN') || 'VN',
    product_original_amount: productOriginalAmount,
    seller_item_discount: sellerItemDiscount,
    platform_item_discount: platformItemDiscount,
    product_revenue_after_shop_discount: productAfterShopDiscount,
    buyer_shipping_paid: buyerShippingPaid,
    payment_method: paymentMethod,
    seller_shipping_discount: sellerShippingDiscount,
    platform_shipping_discount: platformShippingDiscount,
    gross_revenue: grossRevenue,
    buyer_total_paid: grossRevenue,
    actual_income: actualAvailable ? actualIncome : null,
    settlement_total: settlementTotal,
    estimated_income: estimatedIncome,
    estimated_fee_total: estimatedFeeTotal,
    transaction_fee: transactionFee,
    commission_fee: commissionFee,
    seller_shipping_fee: sellerShippingFee,
    handling_fee: handlingFee,
    tax_vat: taxVat,
    tax_pit: taxPit,
    sfr_service_fee: sfrServiceFee,
    actual_income_available: actualAvailable,
    settlement_status: actualAvailable ? 'confirmed' : 'pending_settlement',
    finance_confidence: actualAvailable ? 'confirmed' : 'estimated',
    finance_source: payloadFinanceSource || (settlementTotal !== null ? TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE : TIKTOK_SELLER_CENTER_DETAIL_SOURCE),
    finance_transaction_url: cleanText(payload.finance_transaction_url || payload.financeTransactionUrl),
    finance_detail_source: cleanText(payload.finance_detail_source || payload.financeDetailSource),
    shop: firstText(payload.shop, payload.shop_name, payload.shopName),
    order_created_at: firstText(payload.order_created_at, payload.created_at, payload.createdAt),
    raw_platform_status: rawPlatformStatus,
    display_status: firstText(payload.display_status, rawPlatformStatus),
    tracking_number: trackingNumber,
    shipping_carrier: shippingCarrier,
    customer_name: firstText(payload.customer_name, customer.customer_name_revealed, customer.customer_name),
    customer_phone: firstText(payload.customer_phone, customer.customer_phone),
    shipping_address: firstText(payload.shipping_address, customer.shipping_address),
    customer_revealed: customer.customer_revealed === true || Boolean(firstText(payload.customer_name, customer.customer_name_revealed, customer.customer_phone, customer.shipping_address)),
    items,
    tracking_events: trackingEvents,
    tracking_source: cleanText(payload.tracking_source || payload.trackingSource),
    parsed_at: parsedAt,
    field_meta: {
      product_original_amount: moneyFieldMeta(fields, 'product_original_amount', productOriginalAmount, TIKTOK_SELLER_CENTER_DETAIL_SOURCE, parsedAt),
      product_revenue_after_shop_discount: moneyFieldMeta(fields, 'product_revenue_after_shop_discount', productAfterShopDiscount, TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE, parsedAt),
      buyer_shipping_paid: moneyFieldMeta(fields, 'buyer_shipping_paid', buyerShippingPaid, TIKTOK_SELLER_CENTER_DETAIL_SOURCE, parsedAt),
      settlement_total: moneyFieldMeta(fields, 'settlement_total', settlementTotal, TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE, parsedAt),
      estimated_income: moneyFieldMeta(fields, 'estimated_income', estimatedIncome, TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE, parsedAt),
      actual_income: moneyFieldMeta(fields, 'actual_income', actualIncome, TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE, parsedAt),
      sfr_service_fee: moneyFieldMeta(fields, 'sfr_service_fee', sfrServiceFee, TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE, parsedAt)
    },
    raw_text_hash: cleanText(payload.raw_text_hash || payload.rawTextHash || ''),
    order_detail_raw_text_hash: cleanText(payload.order_detail_raw_text_hash || payload.orderDetailRawTextHash || ''),
    finance_raw_text_hash: cleanText(payload.finance_raw_text_hash || payload.financeRawTextHash || '')
  }
}

export function buildTiktokSellerCenterRawData(detail = {}) {
  const actualAvailable = detail.actual_income_available === true
  const paymentMethod = firstText(detail.payment_method, detail.buyer_payment_method)
  const orderIncome = {
    order_selling_price: detail.product_revenue_after_shop_discount,
    order_discounted_price: detail.product_revenue_after_shop_discount,
    buyer_paid_shipping_fee: detail.buyer_shipping_paid,
    payment_method: paymentMethod,
    buyer_payment_method: paymentMethod,
    buyer_total_amount: detail.buyer_total_paid,
    seller_discount: detail.seller_item_discount,
    tiktok_platform_item_discount: detail.platform_item_discount,
    tiktok_seller_shipping_discount: detail.seller_shipping_discount,
    tiktok_platform_shipping_discount: detail.platform_shipping_discount
  }
  if (actualAvailable) {
    orderIncome.escrow_amount = detail.actual_income
    orderIncome.escrow_amount_after_adjustment = detail.actual_income
  }
  if (!actualAvailable && detail.settlement_total !== null && detail.settlement_total !== undefined) {
    orderIncome.estimated_settlement_total = detail.settlement_total
  }
  if (detail.seller_shipping_fee !== null && detail.seller_shipping_fee !== undefined) {
    orderIncome.final_shipping_fee = -Math.abs(detail.seller_shipping_fee || 0)
  }

  return {
    source: TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    finance_source: detail.finance_source || TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    order_income: orderIncome,
    payment_method: paymentMethod,
    buyer_payment_info: {
      payment_method: paymentMethod,
      buyer_payment_method: paymentMethod,
      merchant_subtotal: detail.product_revenue_after_shop_discount,
      shipping_fee: detail.buyer_shipping_paid,
      buyer_total_amount: detail.buyer_total_paid,
      tiktok_platform_item_discount: detail.platform_item_discount
    },
    tiktok_seller_center_detail: {
      source: TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
      order_no: detail.order_no,
      detail_url: detail.detail_url,
      shop_region: detail.shop_region || 'VN',
      product_original_amount: detail.product_original_amount,
      seller_item_discount: detail.seller_item_discount,
      platform_item_discount: detail.platform_item_discount,
      product_revenue_after_shop_discount: detail.product_revenue_after_shop_discount,
      buyer_shipping_paid: detail.buyer_shipping_paid,
      payment_method: paymentMethod,
      seller_shipping_discount: detail.seller_shipping_discount,
      platform_shipping_discount: detail.platform_shipping_discount,
      gross_revenue: detail.gross_revenue,
      buyer_total_paid: detail.buyer_total_paid,
      actual_income: actualAvailable ? detail.actual_income : null,
      settlement_total: detail.settlement_total,
      estimated_income: detail.estimated_income,
      estimated_fee_total: detail.estimated_fee_total,
      transaction_fee: detail.transaction_fee,
      commission_fee: detail.commission_fee,
      seller_shipping_fee: detail.seller_shipping_fee,
      handling_fee: detail.handling_fee,
      tax_vat: detail.tax_vat,
      tax_pit: detail.tax_pit,
      sfr_service_fee: detail.sfr_service_fee,
      actual_income_available: actualAvailable,
      settlement_status: detail.settlement_status,
      finance_confidence: detail.finance_confidence,
      finance_source: detail.finance_source,
      finance_transaction_url: detail.finance_transaction_url,
      finance_detail_source: detail.finance_detail_source,
      raw_platform_status: detail.raw_platform_status,
      display_status: detail.display_status,
      tracking_number: detail.tracking_number,
      shipping_carrier: detail.shipping_carrier,
      customer_name: detail.customer_name,
      customer_phone: detail.customer_phone,
      shipping_address: detail.shipping_address,
      customer_revealed: detail.customer_revealed,
      items: detail.items || [],
      tracking_events: detail.tracking_events || [],
      tracking_source: detail.tracking_source || '',
      field_meta: detail.field_meta || {},
      profit_basis_when_pending: detail.product_revenue_after_shop_discount,
      parsed_at: detail.parsed_at,
      raw_text_hash: detail.raw_text_hash,
      order_detail_raw_text_hash: detail.order_detail_raw_text_hash,
      finance_raw_text_hash: detail.finance_raw_text_hash,
      mapping_vi: {
        product_original_amount: 'Giá sản phẩm ban đầu',
        seller_item_discount: 'Giảm giá shop tự cài',
        platform_item_discount: 'TikTok tài trợ sản phẩm',
        product_revenue_after_shop_discount: 'Tiền sản phẩm sau KM shop',
        buyer_shipping_paid: 'Phí vận chuyển người mua trả',
        gross_revenue: 'Tổng doanh thu báo cáo / Người mua thanh toán',
        actual_income: 'Thực nhận ví',
        settlement_total: 'Tổng số tiền quyết toán dự kiến'
      },
      profit_rule: 'Nếu chưa có Thực nhận ví, lãi tạm tính lấy Tiền sản phẩm sau KM shop làm basis; không cộng phí vận chuyển người mua trả.'
    }
  }
}

async function maybeReplaceTiktokDetailItems(env, orderId, items = [], options = {}) {
  const rows = Array.isArray(items) ? items.filter(item => firstText(item.sku, item.product_name, item.name, item.title)) : []
  if (!rows.length) return { inserted_items: 0, skipped_items: 0 }
  if (options.replace_items === false) {
    return { inserted_items: 0, skipped_items: rows.length, reason: 'replace_items_disabled' }
  }
  await env.DB.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(orderId).run()
  const stmts = rows.slice(0, 80).map(item => env.DB.prepare(`
    INSERT INTO order_items (order_id, sku, variation_name, product_name, qty, revenue_line, cost_real, cost_invoice, image_url)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).bind(
    orderId,
    firstText(item.sku, item.variation_sku, item.model_sku),
    firstText(item.variation_name, item.variation, item.model_name, item.classification),
    firstText(item.product_name, item.name, item.title),
    Math.max(Number(item.qty || item.quantity || 1) || 1, 1),
    Number(item.revenue_line || item.line_total || item.total || item.price || 0) || 0,
    firstText(item.image_url, item.image)
  ))
  if (stmts.length) await env.DB.batch(stmts)
  return { inserted_items: stmts.length, skipped_items: 0 }
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

export async function listTiktokSellerCenterFinanceEligibleOrders(env, options = {}) {
  await ensureSourceTables(env)
  const requestedOrderIds = []
  for (const key of ['order_id', 'orderId', 'order_no', 'orderNo']) {
    const value = cleanText(options[key])
    if (value) requestedOrderIds.push(value)
  }
  if (Array.isArray(options.order_ids)) {
    requestedOrderIds.push(...options.order_ids.map(cleanText).filter(Boolean))
  }
  const uniqueRequested = [...new Set(requestedOrderIds)]
  const limit = Math.min(Math.max(Number(options.limit || 20) || 20, 1), 20)
  const scanLimit = uniqueRequested.length ? Math.max(uniqueRequested.length, limit) : Math.min(Math.max(limit * 8, 50), 200)
  const shop = cleanText(options.shop || options.shop_id).toLowerCase()
  const from = cleanText(options.from || options.from_date)
  const to = cleanText(options.to || options.to_date)
  const missingOnly = options.missing_only === true || options.missingOnly === true || options.missing_only === '1'
  const retryFailed = options.retry_failed === true || options.retryFailed === true || options.retry_failed === '1'
  const pendingSettlementOnly = options.pending_settlement_only === true || options.pendingSettlementOnly === true || options.pending_settlement_only === '1'
  const params = []
  const where = [`LOWER(COALESCE(o.platform, '')) = 'tiktok'`]
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
  const rows = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.order_date,
      o.order_type,
      o.shipping_status,
      o.oms_status,
      o.source_mode,
      o.source_detail,
      o.source_updated_at,
      o.last_status_sync_at,
      o.last_status_sync_error,
      o.next_retry_at,
      f.source AS fee_source,
      f.raw_data AS fee_raw_data,
      f.updated_at AS fee_updated_at
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    WHERE ${where.join(' AND ')}
    ORDER BY date(o.order_date) DESC, o.order_id DESC
    LIMIT ?
  `).bind(...params, scanLimit).all()

  const now = Date.now()
  const freshMs = Math.max(Number(options.fresh_minutes || options.freshMinutes || 180) || 180, 15) * 60 * 1000
  const force = options.force === true || options.force === '1'
  const eligible = []
  for (const row of rows.results || []) {
    const raw = parseJsonSafe(row.fee_raw_data)
    const detail = raw.tiktok_seller_center_detail || {}
    const feeSource = cleanText(row.fee_source)
    const updatedAt = Date.parse(cleanText(row.fee_updated_at).replace(' ', 'T'))
    const isFresh = Number.isFinite(updatedAt) && now - updatedAt < freshMs
    const actualConfirmed = detail.actual_income_available === true && cleanText(detail.finance_confidence) === 'confirmed'
    const missingCoreAmounts = !hasPositive(detail.gross_revenue)
      || !hasPositive(detail.product_revenue_after_shop_discount)
      || detail.buyer_shipping_paid === undefined
    const pendingSettlement = detail.actual_income_available !== true
      || ['pending_settlement', 'income_unavailable', 'estimated'].includes(cleanText(detail.settlement_status || detail.finance_confidence))
    const sourceMode = cleanText(row.source_mode).toLowerCase()
    const sourceNeedsBackfill = ['manual_reference', 'import_file_sync', 'browser_sync', ''].includes(sourceMode)
    const cancelled = ['cancel', 'cancelled'].includes(cleanText(row.order_type).toLowerCase())
      || ['CANCELLED'].includes(cleanText(row.oms_status).toUpperCase())
    const failedBefore = cleanText(row.last_status_sync_error)

    let reason = ''
    if (force || uniqueRequested.includes(cleanText(row.order_id))) reason = 'requested'
    else if (cancelled && actualConfirmed && isFresh) reason = ''
    else if (retryFailed && failedBefore) reason = 'retry_failed'
    else if (feeSource !== TIKTOK_SELLER_CENTER_DETAIL_SOURCE) reason = 'missing_tiktok_seller_center_detail'
    else if (missingCoreAmounts) reason = 'missing_revenue_components'
    else if (pendingSettlement && !isFresh) reason = 'pending_settlement_refresh'
    else if (sourceNeedsBackfill && pendingSettlement) reason = 'source_needs_seller_detail'

    if (!reason) continue
    if (missingOnly && !['missing_tiktok_seller_center_detail', 'missing_revenue_components'].includes(reason)) continue
    if (pendingSettlementOnly && !['pending_settlement_refresh', 'source_needs_seller_detail', 'retry_failed'].includes(reason)) continue
    eligible.push({
      order_id: cleanText(row.order_id),
      order_no: cleanText(row.order_id),
      platform: 'tiktok',
      shop: cleanText(row.shop),
      order_date: cleanText(row.order_date),
      detail_url: `https://seller-vn.tiktok.com/order/detail?order_no=${encodeURIComponent(cleanText(row.order_id))}&shop_region=VN`,
      reason,
      settlement_status: cleanText(detail.settlement_status) || 'unknown',
      finance_confidence: cleanText(detail.finance_confidence) || 'missing',
      fee_updated_at: cleanText(row.fee_updated_at)
    })
    if (eligible.length >= limit) break
  }

  return {
    status: 'ok',
    source: TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    scanned: rows.results?.length || 0,
    eligible_count: eligible.length,
    limit,
    orders: eligible
  }
}

export async function upsertTiktokSellerCenterFinanceDetail(env, payload = {}) {
  await ensureSourceTables(env)
  await ensureTiktokSellerDetailOrderColumns(env)
  const normalized = normalizeTiktokSellerCenterDetailPayload(payload)
  if (!normalized.ok) {
    return { status: 'error', ...normalized }
  }
  let order = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.order_date,
      o.oms_status,
      o.shipping_status,
      o.shipping_carrier,
      f.raw_data AS existing_fee_raw_data,
      f.settlement AS existing_settlement
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    WHERE o.order_id = ?
  `).bind(normalized.order_no).first()
  if (!order) {
    const mappedForNewOrderBase = normalized.raw_platform_status
      ? mapMarketplaceOrderStatus('tiktok', normalized.raw_platform_status, {
          tracking: normalized.tracking_number,
          logisticsStatus: normalized.display_status
        })
      : { oms: 'PENDING', shipping: 'LOGISTICS_REQUEST_CREATED', type: '' }
    const mappedForNewOrder = promoteTiktokStatusFromTracking(mappedForNewOrderBase, normalized)
    const orderDate = normalizeVietnamDateTime(normalized.order_created_at || normalized.parsed_at)
    await env.DB.prepare(`
      INSERT INTO orders_v2
        (order_id, platform, shop, order_date, order_type, revenue, raw_revenue, cost_invoice, cost_real, fee, profit_invoice, profit_real, tax_flat, tax_income, fee_platform, fee_payment, fee_affiliate, fee_ads, fee_piship, fee_service, fee_packaging, fee_operation, fee_labor, cancel_reason, return_fee, shipped, discount_shop, discount_shopee, discount_combo, shipping_return_fee, shipping_status, shipping_carrier, tracking_number, customer_name, buyer_id, buyer_username, oms_status, source_mode, source_detail, source_updated_at)
      VALUES (?, 'tiktok', ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', 0, 0, ?, ?, 0, 0, ?, ?, ?, ?, '', '', ?, 'browser_sync', ?, datetime('now', '+7 hours'))
    `).bind(
      normalized.order_no,
      normalized.shop || '0909128999',
      orderDate,
      cleanText(mappedForNewOrder.type),
      normalized.gross_revenue || normalized.product_revenue_after_shop_discount || 0,
      normalized.product_original_amount || normalized.product_revenue_after_shop_discount || normalized.gross_revenue || 0,
      normalized.seller_item_discount || 0,
      normalized.platform_item_discount || 0,
      cleanText(mappedForNewOrder.shipping),
      normalized.shipping_carrier,
      normalized.tracking_number,
      normalized.customer_name,
      cleanText(mappedForNewOrder.oms),
      TIKTOK_SELLER_CENTER_DETAIL_SOURCE
    ).run()
    order = await env.DB.prepare(`
      SELECT
        o.order_id,
        o.platform,
        o.shop,
        o.order_date,
        o.oms_status,
        o.shipping_status,
        o.shipping_carrier,
        f.raw_data AS existing_fee_raw_data,
        f.settlement AS existing_settlement
      FROM orders_v2 o
      LEFT JOIN order_fee_details f ON f.order_id = o.order_id
      WHERE o.order_id = ?
    `).bind(normalized.order_no).first()
  }
  if (!order) {
    return { status: 'error', error: 'order_not_found_after_insert', order_no: normalized.order_no }
  }
  if (cleanText(order.platform).toLowerCase() !== 'tiktok') {
    return { status: 'error', error: 'not_tiktok_order', order_no: normalized.order_no, platform: cleanText(order.platform) }
  }

  const pendingFinanceTransaction = normalized.actual_income_available !== true
    && normalized.settlement_total !== null
    && normalized.settlement_total !== undefined
    && cleanText(normalized.finance_source) === TIKTOK_SELLER_CENTER_FINANCE_TRANSACTION_SOURCE
  // Finance transaction "Sẽ quyết toán" là nguồn mới hơn order detail, không được giữ SFR cũ như actual_income.
  const previousConfirmedIncome = !normalized.actual_income_available && !pendingFinanceTransaction
    ? confirmedTiktokSellerIncomeFromRaw(order.existing_fee_raw_data, order.existing_settlement)
    : null
  const finalDetail = previousConfirmedIncome !== null
    ? {
        ...normalized,
        actual_income: previousConfirmedIncome,
        actual_income_available: true,
        settlement_status: 'confirmed',
        finance_confidence: 'confirmed',
        preserved_confirmed_actual_income: true
      }
    : normalized
  const rawData = buildTiktokSellerCenterRawData(finalDetail)
  const settlement = finalDetail.actual_income_available ? finalDetail.actual_income : null
  const feeCommission = Math.abs(finalDetail.commission_fee || 0)
  const feePayment = Math.abs(finalDetail.transaction_fee || 0)
  const feeHandling = Math.abs(finalDetail.handling_fee || 0)
  const feeShipping = Math.abs(finalDetail.seller_shipping_fee || 0)
  const feeService = Math.abs(finalDetail.sfr_service_fee || 0)
  const feePiship = 0
  const taxVat = Math.abs(finalDetail.tax_vat || 0)
  const taxPit = Math.abs(finalDetail.tax_pit || 0)
  const totalFees = round2(feeCommission + feePayment + feeService + feeHandling + feeShipping + taxVat + taxPit)
  const mappedBase = finalDetail.raw_platform_status
    ? mapMarketplaceOrderStatus('tiktok', finalDetail.raw_platform_status, {
        tracking: finalDetail.tracking_number,
        logisticsStatus: finalDetail.display_status
      })
    : { oms: cleanText(order.oms_status), shipping: cleanText(order.shipping_status), type: '' }
  const mapped = promoteTiktokStatusFromTracking(mappedBase, finalDetail)
  const unknownStatus = cleanText(mapped.reason).includes('Raw status chưa có') || cleanText(mapped.shipping).toUpperCase() === 'UNKNOWN'
  const statusChanged = [order.oms_status, order.shipping_status].map(cleanText).join('|') !== [mapped.oms, mapped.shipping].map(cleanText).join('|')
  const clearInvalidCarrier = !finalDetail.shipping_carrier && isInvalidTiktokCarrier(order.shipping_carrier)
  await env.DB.prepare(`
    INSERT INTO order_fee_details (
      order_id, platform, shop, source,
      fee_commission, fee_payment, fee_service, fee_affiliate, fee_piship, fee_handling,
      fee_ads, fee_shipping, tax_vat, tax_pit, total_fees, settlement, raw_data, updated_at
    )
    VALUES (?, 'tiktok', ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
    ON CONFLICT(order_id) DO UPDATE SET
      platform = 'tiktok',
      shop = excluded.shop,
      source = excluded.source,
      fee_commission = excluded.fee_commission,
      fee_payment = excluded.fee_payment,
      fee_service = excluded.fee_service,
      fee_piship = excluded.fee_piship,
      fee_handling = excluded.fee_handling,
      fee_shipping = excluded.fee_shipping,
      tax_vat = excluded.tax_vat,
      tax_pit = excluded.tax_pit,
      total_fees = excluded.total_fees,
      settlement = excluded.settlement,
      raw_data = excluded.raw_data,
      updated_at = excluded.updated_at
  `).bind(
    normalized.order_no,
    cleanText(order.shop),
    cleanText(finalDetail.finance_source) || TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    feeCommission,
    feePayment,
    feeService,
    feePiship,
    feeHandling,
    feeShipping,
    taxVat,
    taxPit,
    totalFees,
    settlement,
    JSON.stringify(rawData)
  ).run()

  await env.DB.prepare(`
    UPDATE orders_v2
    SET
      oms_status = CASE WHEN ? != '' THEN ? ELSE oms_status END,
      shipping_status = CASE WHEN ? != '' THEN ? ELSE shipping_status END,
      order_type = CASE WHEN ? != '' THEN ? ELSE order_type END,
      shipping_carrier = CASE WHEN ? != '' THEN ? WHEN ? THEN '' ELSE shipping_carrier END,
      tracking_number = CASE WHEN ? != '' THEN ? ELSE tracking_number END,
      customer_name = CASE WHEN ? != '' THEN ? ELSE customer_name END,
      customer_phone = CASE WHEN ? != '' THEN ? ELSE customer_phone END,
      revenue = CASE WHEN ? > 0 THEN ? ELSE revenue END,
      raw_revenue = CASE WHEN ? > 0 THEN ? ELSE raw_revenue END,
      discount_shop = ?,
      discount_shopee = ?,
      seller_center_detail_url = ?,
      detail_url_source = ?,
      detail_url_verified_at = datetime('now', '+7 hours'),
      last_status_sync_at = datetime('now', '+7 hours'),
      last_status_sync_status = ?,
      last_status_sync_error = ?,
      status_source = ?,
      status_changed_at = CASE WHEN ? THEN datetime('now', '+7 hours') ELSE status_changed_at END,
      status_touched_24h = 1,
      status_changed_count = COALESCE(status_changed_count, 0) + ?,
      next_retry_at = '',
      source_detail = ?,
      source_updated_at = datetime('now', '+7 hours')
    WHERE order_id = ?
  `).bind(
    cleanText(mapped.oms),
    cleanText(mapped.oms),
    cleanText(mapped.shipping),
    cleanText(mapped.shipping),
    cleanText(mapped.type),
    cleanText(mapped.type),
    finalDetail.shipping_carrier,
    finalDetail.shipping_carrier,
    clearInvalidCarrier ? 1 : 0,
    finalDetail.tracking_number,
    finalDetail.tracking_number,
    finalDetail.customer_name,
    finalDetail.customer_name,
    finalDetail.customer_phone,
    finalDetail.customer_phone,
    finalDetail.gross_revenue || 0,
    finalDetail.gross_revenue || 0,
    finalDetail.product_original_amount || 0,
    finalDetail.product_original_amount || 0,
    finalDetail.seller_item_discount || 0,
    finalDetail.platform_item_discount || 0,
    finalDetail.detail_url || `https://seller-vn.tiktok.com/order/detail?order_no=${encodeURIComponent(finalDetail.order_no)}&shop_region=VN`,
    finalDetail.finance_detail_source || TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    unknownStatus ? 'unknown_status' : 'ok',
    unknownStatus ? 'status_parse_failed' : '',
    TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    statusChanged ? 1 : 0,
    statusChanged ? 1 : 0,
    TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    finalDetail.order_no
  ).run()

  const items = await maybeReplaceTiktokDetailItems(env, finalDetail.order_no, finalDetail.items, {
    replace_items: payload.replace_items !== false && payload.replaceItems !== false
  })
  let trackingCore = null
  if ((finalDetail.tracking_events || []).length || finalDetail.tracking_number || finalDetail.shipping_carrier) {
    trackingCore = await saveOrderTrackingCore(env, {
      order_id: finalDetail.order_no,
      platform: 'tiktok',
      shop: cleanText(order.shop),
      tracking_number: finalDetail.tracking_number,
      logistics_provider: finalDetail.shipping_carrier,
      events: finalDetail.tracking_events || [],
      tracking_source: finalDetail.tracking_source || 'tiktok_seller_center_detail',
      raw_data: {
        finance_transaction_url: finalDetail.finance_transaction_url,
        order_detail_url: finalDetail.detail_url,
        shipping_address: finalDetail.shipping_address
      }
    })
  }

  return {
    status: unknownStatus ? 'partial_error' : 'ok',
    order_id: finalDetail.order_no,
    shop: cleanText(order.shop),
    order_date: cleanText(order.order_date),
    source: TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
    raw_platform_status: finalDetail.raw_platform_status,
    oms_status: cleanText(mapped.oms),
    shipping_status: cleanText(mapped.shipping),
    status_changed: statusChanged,
    tracking_number: finalDetail.tracking_number,
    logistics_provider: finalDetail.shipping_carrier,
    tracking_events_count: (finalDetail.tracking_events || []).length,
    customer_name_updated: Boolean(finalDetail.customer_name),
    customer_phone_updated: Boolean(finalDetail.customer_phone),
    shipping_address_available: Boolean(finalDetail.shipping_address),
    ...items,
    tracking_core: trackingCore,
    gross_revenue: finalDetail.gross_revenue,
    buyer_total_paid: finalDetail.buyer_total_paid,
    product_revenue_after_shop_discount: finalDetail.product_revenue_after_shop_discount,
    buyer_shipping_paid: finalDetail.buyer_shipping_paid,
    actual_income: finalDetail.actual_income_available ? finalDetail.actual_income : null,
    settlement_total: finalDetail.settlement_total,
    estimated_income: finalDetail.estimated_income,
    estimated_fee_total: finalDetail.estimated_fee_total,
    marketplace_fee_total: round2(feeCommission + feePayment + feeHandling),
    tax_total: round2(taxVat + taxPit),
    seller_shipping_fee: feeShipping,
    sfr_service_fee: feeService,
    actual_income_available: finalDetail.actual_income_available,
    actual_income_preserved: previousConfirmedIncome !== null,
    settlement_status: finalDetail.settlement_status,
    finance_confidence: finalDetail.finance_confidence,
    finance_transaction_url: finalDetail.finance_transaction_url,
    finance_detail_source: finalDetail.finance_detail_source,
    profit_basis: finalDetail.actual_income_available ? finalDetail.actual_income : finalDetail.product_revenue_after_shop_discount,
    error: unknownStatus ? 'status_parse_failed' : ''
  }
}

export async function queueTiktokSellerCenterFinanceJobs(env, orders = [], options = {}) {
  const rows = (orders || [])
    .map(order => ({
      order_id: cleanText(order.order_id || order.order_no || order.orderNo),
      shop: cleanText(order.shop || order.shop_name || order.user_name)
    }))
    .filter(row => row.order_id && row.shop)
  if (!rows.length) return { queued_jobs: 0, queued_orders: 0, jobs: [] }

  await ensureJobsTable(env)
  const grouped = new Map()
  for (const row of rows.slice(0, Math.min(Number(options.limit || 20) || 20, 20))) {
    if (!grouped.has(row.shop)) grouped.set(row.shop, [])
    grouped.get(row.shop).push(row.order_id)
  }

  const now = new Date()
  const jobs = []
  for (const [shop, orderIds] of grouped.entries()) {
    const payload = {
      task_type: TIKTOK_SELLER_CENTER_DETAIL_JOB,
      action_type: cleanText(options.action_type || options.actionType || 'sync_finance') || 'sync_finance',
      trigger: cleanText(options.trigger || 'manual'),
      scope: Array.isArray(options.scope) ? options.scope.map(cleanText).filter(Boolean) : [],
      order_ids: orderIds,
      limit: Math.min(orderIds.length, 20),
      source: TIKTOK_SELLER_CENTER_DETAIL_SOURCE
    }
    const result = await env.DB.prepare(`
      INSERT INTO jobs (user_id, shop_name, platform, month, year, status, scheduled_at, task_type, from_date, to_date, payload)
      VALUES ('admin', ?, 'tiktok', ?, ?, 'queued', NULL, ?, NULL, NULL, ?)
    `).bind(
      shop,
      now.getMonth() + 1,
      now.getFullYear(),
      TIKTOK_SELLER_CENTER_DETAIL_JOB,
      JSON.stringify(payload)
    ).run()
    jobs.push({
      id: result?.meta?.last_row_id || result?.lastRowId || null,
      shop,
      order_ids: orderIds,
      task_type: TIKTOK_SELLER_CENTER_DETAIL_JOB,
      action_type: payload.action_type
    })
  }

  return {
    queued_jobs: jobs.length,
    queued_orders: rows.length,
    jobs
  }
}

export async function queueTiktokSellerCenterFinanceAfterImport(env, processedOrders = [], options = {}) {
  const tiktokOrderIds = [...new Set((processedOrders || [])
    .filter(order => cleanText(order.platform).toLowerCase() === 'tiktok')
    .map(order => cleanText(order.order_id))
    .filter(Boolean))]
  if (!tiktokOrderIds.length) return { eligible_count: 0, queued_jobs: 0, queued_orders: 0, orders: [] }

  const eligible = await listTiktokSellerCenterFinanceEligibleOrders(env, {
    order_ids: tiktokOrderIds,
    limit: Math.min(Number(options.limit || 20) || 20, 20),
    force: options.force
  })
  const queued = await queueTiktokSellerCenterFinanceJobs(env, eligible.orders, {
    trigger: options.trigger || 'after_order_import',
    limit: eligible.limit
  })
  return {
    ...eligible,
    ...queued,
    trigger: options.trigger || 'after_order_import'
  }
}
