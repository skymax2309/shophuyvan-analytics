/**
 * Core phase 1 cho phí đơn hàng:
 * - Khóa cách hiển thị OMS theo hướng API-first.
 * - Tách rõ 4 nhóm: phí sàn từ API, thuế/khấu trừ từ API, chi phí nội bộ, ước tính còn thiếu.
 * - Phase 2 gom luôn calcProfit legacy về chung source of truth này để route cũ không tái sinh dữ liệu pha trộn.
 */

function cleanFeePhaseText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function money(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function absMoney(value) {
  return Math.abs(money(value))
}

function roundMoney(value) {
  return Math.round((money(value) + Number.EPSILON) * 100) / 100
}

function hasColumnValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function apiBucketValue(order = {}, column, code) {
  if (hasColumnValue(order?.[column])) return absMoney(order[column])
  const legacyColumn = code.startsWith('tax_') ? `_${code}` : `_${code}`
  if (hasColumnValue(order?.[legacyColumn])) return absMoney(order[legacyColumn])
  return undefined
}

function pct(cfg, key) {
  const value = Number(cfg?.[key]?.value || 0)
  return Number.isFinite(value) ? value / 100 : 0
}

function fixed(cfg, key) {
  const value = Number(cfg?.[key]?.value || 0)
  return Number.isFinite(value) ? value : 0
}

function capabilityIdentity(platform, value) {
  const text = cleanFeePhaseText(value).toLowerCase()
  return platform && text ? `${platform}|${text}` : ''
}

export function buildOrderFeeCapabilityLookup(rows = []) {
  const map = new Map()
  for (const row of rows || []) {
    const platform = cleanFeePhaseText(row.platform).toLowerCase()
    for (const value of [row.shop_name, row.user_name, row.api_shop_id]) {
      const key = capabilityIdentity(platform, value)
      if (key) map.set(key, row)
    }
  }
  return map
}

export function buildOrderFeePhase1Context(cfg = {}, capabilities = []) {
  return {
    cfg,
    capabilityLookup: buildOrderFeeCapabilityLookup(capabilities)
  }
}

function resolveOrderCapability(order = {}, capabilityLookup = new Map()) {
  const platform = cleanFeePhaseText(order.platform).toLowerCase()
  for (const value of [order.shop, order.user_name, order.api_shop_id]) {
    const key = capabilityIdentity(platform, value)
    if (key && capabilityLookup.has(key)) return capabilityLookup.get(key)
  }
  return null
}

function fallbackBucketsFromCostSettings(order = {}, cfg = {}) {
  const revenue = absMoney(order.revenue)
  const platform = cleanFeePhaseText(order.platform).toLowerCase()
  const orderType = cleanFeePhaseText(order.order_type).toLowerCase()
  const isReturnLike = orderType === 'cancel' || orderType === 'return'
  const isFirstSku = order.is_first_sku === true || order.is_first_sku === 1 || order.is_first_sku === '1' || order.is_first_sku === undefined

  const result = {
    fee_commission: 0,
    fee_payment: 0,
    fee_affiliate: 0,
    fee_ads: 0,
    fee_piship: 0,
    fee_service: 0,
    fee_handling: 0,
    fee_shipping: 0,
    tax_vat: 0,
    tax_pit: 0
  }

  // Đơn huỷ/hoàn chỉ giữ chi phí nội bộ và phí hoàn/phạt đang có; không ước tính thêm phí sàn.
  if (isReturnLike) return result

  if (platform === 'shopee') {
    result.fee_commission = roundMoney(revenue * pct(cfg, 'shopee_platform_fee'))
    result.fee_payment = roundMoney(revenue * pct(cfg, 'shopee_payment_fee'))
    result.fee_affiliate = roundMoney(revenue * pct(cfg, 'shopee_affiliate'))
    result.fee_ads = roundMoney(revenue * pct(cfg, 'shopee_ads'))
    if (isFirstSku) {
      result.fee_piship = roundMoney(fixed(cfg, 'shopee_piship'))
      result.fee_service = roundMoney(fixed(cfg, 'shopee_service_fee'))
    }
    return result
  }

  if (platform === 'lazada') {
    result.fee_commission = roundMoney(revenue * pct(cfg, 'lazada_commission'))
    result.fee_payment = roundMoney(revenue * pct(cfg, 'lazada_payment_fee'))
    result.fee_affiliate = roundMoney(revenue * pct(cfg, 'lazada_affiliate'))
    result.fee_ads = roundMoney(revenue * pct(cfg, 'lazada_ads'))
    result.fee_handling = roundMoney(revenue * pct(cfg, 'lazada_handling_fee'))
    result.fee_shipping = roundMoney(revenue * pct(cfg, 'lazada_shipping_diff'))
    result.tax_vat = roundMoney(revenue * pct(cfg, 'lazada_vat'))
    result.tax_pit = roundMoney(revenue * pct(cfg, 'lazada_pit'))
    if (isFirstSku) result.fee_service = roundMoney(fixed(cfg, 'lazada_service_fee'))
    return result
  }

  if (platform === 'tiktok') {
    result.fee_commission = roundMoney(revenue * pct(cfg, 'tiktok_commission'))
    result.fee_payment = roundMoney(revenue * pct(cfg, 'tiktok_transaction_fee'))
    result.fee_affiliate = roundMoney(revenue * pct(cfg, 'tiktok_affiliate'))
    result.fee_ads = roundMoney(revenue * pct(cfg, 'tiktok_ads'))
    if (isFirstSku) {
      result.fee_piship = roundMoney(fixed(cfg, 'tiktok_sfr'))
      result.fee_service = roundMoney(fixed(cfg, 'tiktok_handling_fee'))
    }
    return result
  }

  return result
}

function feeRow(label, amount, source, code) {
  return {
    code,
    label,
    amount: roundMoney(amount),
    source
  }
}

function pushWhenPositive(rows, label, amount, source, code) {
  const value = roundMoney(amount)
  if (value <= 0) return
  rows.push(feeRow(label, value, source, code))
}

function optionalApiValue(order = {}, column) {
  if (!hasColumnValue(order?.[column])) return undefined
  return absMoney(order[column])
}

function sumOptionalApiValues(order = {}, columns = []) {
  let found = false
  let total = 0
  for (const column of columns) {
    const value = optionalApiValue(order, column)
    if (value === undefined) continue
    found = true
    total += value
  }
  return found ? roundMoney(total) : undefined
}

function comparisonRow(label, amount, source, code, note = '') {
  return {
    code,
    label,
    amount: amount === undefined ? null : roundMoney(amount),
    source,
    note
  }
}

function buildApiComparisonRows(order = {}, fallback = {}) {
  const rows = []
  const shopDiscountFromApi = sumOptionalApiValues(order, ['fee_detail_voucher_from_seller', 'fee_detail_seller_discount'])
  const platformDiscountFromApi = sumOptionalApiValues(order, ['fee_detail_voucher_from_shopee', 'fee_detail_shopee_discount', 'fee_detail_coins'])
  const shopDiscountFromOrder = roundMoney(absMoney(order.discount_shop) + absMoney(order.discount_combo))
  const platformDiscountFromOrder = absMoney(order.discount_shopee)
  const affiliateFromApi = optionalApiValue(order, 'fee_detail_affiliate')
  const adsFromApi = optionalApiValue(order, 'fee_detail_ads')

  if (shopDiscountFromApi !== undefined || shopDiscountFromOrder > 0) {
    rows.push(comparisonRow(
      'Voucher/giảm giá shop',
      shopDiscountFromApi !== undefined ? shopDiscountFromApi : shopDiscountFromOrder,
      shopDiscountFromApi !== undefined ? 'api' : 'order',
      'discount_shop',
      shopDiscountFromApi !== undefined ? 'Bóc từ escrow/finance API.' : 'Chưa có bucket API riêng, đang đọc từ orders_v2.'
    ))
  }

  if (platformDiscountFromApi !== undefined || platformDiscountFromOrder > 0) {
    rows.push(comparisonRow(
      'Sàn hỗ trợ khách',
      platformDiscountFromApi !== undefined ? platformDiscountFromApi : platformDiscountFromOrder,
      platformDiscountFromApi !== undefined ? 'api' : 'order',
      'discount_platform',
      platformDiscountFromApi !== undefined ? 'Voucher sàn, Shopee discount và xu từ escrow API.' : 'Chưa có raw escrow, đang đọc từ orders_v2.'
    ))
  }

  if (affiliateFromApi !== undefined || fallback.fee_affiliate > 0) {
    rows.push(comparisonRow(
      'Phí TTLK từ API',
      affiliateFromApi,
      affiliateFromApi !== undefined ? 'api' : 'missing',
      'fee_affiliate',
      affiliateFromApi !== undefined ? 'Dòng phí affiliate/freeship đã sync từ API.' : `Chưa có API, cost setting đang ước tính ${roundMoney(fallback.fee_affiliate).toLocaleString('vi-VN')}đ.`
    ))
  }

  if (adsFromApi !== undefined || fallback.fee_ads > 0) {
    rows.push(comparisonRow(
      'Phí ADS từ API',
      adsFromApi,
      adsFromApi !== undefined ? 'api' : 'missing',
      'fee_ads',
      adsFromApi !== undefined ? 'Dòng phí quảng cáo đã sync từ Payment/Finance API.' : `Chưa có API, cost setting đang ước tính ${roundMoney(fallback.fee_ads).toLocaleString('vi-VN')}đ.`
    ))
  }

  return rows
}

function buildDiscountRows(order = {}) {
  const rows = []
  const shopDiscountFromApi = sumOptionalApiValues(order, ['fee_detail_voucher_from_seller', 'fee_detail_seller_discount'])
  const platformDiscountFromApi = sumOptionalApiValues(order, ['fee_detail_voucher_from_shopee', 'fee_detail_shopee_discount', 'fee_detail_coins'])
  const shopDiscountFromOrder = roundMoney(absMoney(order.discount_shop) + absMoney(order.discount_combo))
  const platformDiscountFromOrder = absMoney(order.discount_shopee)

  pushWhenPositive(
    rows,
    'Voucher/giảm giá shop',
    shopDiscountFromApi !== undefined ? shopDiscountFromApi : shopDiscountFromOrder,
    shopDiscountFromApi !== undefined ? 'api' : 'order',
    'discount_shop'
  )
  pushWhenPositive(
    rows,
    'Sàn hỗ trợ khách',
    platformDiscountFromApi !== undefined ? platformDiscountFromApi : platformDiscountFromOrder,
    platformDiscountFromApi !== undefined ? 'api' : 'order',
    'discount_platform'
  )

  return rows
}

const API_PLATFORM_COLUMNS = [
  ['fee_detail_commission', 'Hoa hồng / phí sàn', 'fee_commission'],
  ['fee_detail_payment', 'Phí thanh toán', 'fee_payment'],
  ['fee_detail_affiliate', 'Phí Affiliate / freeship', 'fee_affiliate'],
  ['fee_detail_ads', 'Phí quảng cáo', 'fee_ads'],
  ['fee_detail_piship', 'Phí PiShip / bảo vệ', 'fee_piship'],
  ['fee_detail_service', 'Phí dịch vụ', 'fee_service'],
  ['fee_detail_handling', 'Phí xử lý / fulfillment', 'fee_handling'],
  ['fee_detail_shipping', 'Phí vận chuyển / logistics', 'fee_shipping']
]

const API_TAX_COLUMNS = [
  ['fee_detail_tax_vat', 'Thuế GTGT khấu trừ', 'tax_vat'],
  ['fee_detail_tax_pit', 'Thuế TNCN khấu trừ', 'tax_pit']
]

const ESTIMATE_LABELS = {
  fee_commission: 'Ước tính hoa hồng / phí sàn',
  fee_payment: 'Ước tính phí thanh toán',
  fee_affiliate: 'Ước tính phí Affiliate / freeship',
  fee_ads: 'Ước tính phí quảng cáo',
  fee_piship: 'Ước tính phí PiShip / bảo vệ',
  fee_service: 'Ước tính phí dịch vụ',
  fee_handling: 'Ước tính phí xử lý / fulfillment',
  fee_shipping: 'Ước tính phí vận chuyển / logistics',
  tax_vat: 'Ước tính thuế GTGT khấu trừ',
  tax_pit: 'Ước tính thuế TNCN khấu trừ'
}

function buildBreakdownGroups(order = {}, cfg = {}, capability = null) {
  const discountRows = []
  const apiRows = []
  const taxRows = []
  const internalRows = []
  const estimateRows = []
  const fallback = fallbackBucketsFromCostSettings(order, cfg)

  const platform = cleanFeePhaseText(order.platform).toLowerCase()
  const capabilityMode = cleanFeePhaseText(capability?.capability_mode)
  const supportsApiFeePlatform = ['shopee', 'lazada'].includes(platform)
  const hasAnyApiDetail = [...API_PLATFORM_COLUMNS, ...API_TAX_COLUMNS]
    .some(([column, , code]) => apiBucketValue(order, column, code) !== undefined)
  const hasAnyApiDiscount = [
    'fee_detail_voucher_from_seller',
    'fee_detail_seller_discount',
    'fee_detail_voucher_from_shopee',
    'fee_detail_shopee_discount',
    'fee_detail_coins'
  ].some(column => optionalApiValue(order, column) !== undefined)
  // Nếu đơn đã có bucket phí thật lưu sẵn trong D1 thì vẫn phải ưu tiên API,
  // kể cả khi bảng capability của shop chưa refresh kịp. Nếu không OMS sẽ
  // rơi ngược về cost setting và tái sinh lỗi pha trộn phase cũ.
  const isApiShop = supportsApiFeePlatform && (capabilityMode === 'api_active' || hasAnyApiDetail || hasAnyApiDiscount)
  discountRows.push(...buildDiscountRows(order))

  for (const [column, label, code] of API_PLATFORM_COLUMNS) {
    const apiValue = apiBucketValue(order, column, code)
    if (isApiShop && apiValue !== undefined) {
      pushWhenPositive(apiRows, label, apiValue, 'api', code)
    } else if ((!isApiShop || apiValue === undefined) && fallback[code] > 0) {
      pushWhenPositive(estimateRows, ESTIMATE_LABELS[code], fallback[code], 'estimate', code)
    }
  }

  for (const [column, label, code] of API_TAX_COLUMNS) {
    const apiValue = apiBucketValue(order, column, code)
    if (isApiShop && apiValue !== undefined) {
      pushWhenPositive(taxRows, label, apiValue, 'api', code)
    } else if ((!isApiShop || apiValue === undefined) && fallback[code] > 0) {
      pushWhenPositive(estimateRows, ESTIMATE_LABELS[code], fallback[code], 'estimate', code)
    }
  }

  pushWhenPositive(internalRows, 'Phí đóng gói nội bộ', order.fee_packaging, 'internal', 'fee_packaging')
  pushWhenPositive(internalRows, 'Phí vận hành nội bộ', order.fee_operation, 'internal', 'fee_operation')
  pushWhenPositive(internalRows, 'Phí nhân công nội bộ', order.fee_labor, 'internal', 'fee_labor')
  pushWhenPositive(internalRows, 'Phí hoàn / phạt ngoài API', order.return_fee, 'internal', 'return_fee')

  return {
    is_api_shop: isApiShop ? 1 : 0,
    capability_mode: capabilityMode || 'manual_reference',
    comparisons: buildApiComparisonRows(order, fallback),
    groups: [
      { key: 'discounts', label: 'Giảm giá/voucher đã trừ', rows: discountRows },
      { key: 'api_fee', label: 'Phí sàn từ API', rows: apiRows },
      { key: 'api_tax', label: 'Thuế/khấu trừ từ API', rows: taxRows },
      { key: 'internal', label: 'Chi phí nội bộ', rows: internalRows },
      { key: 'estimate', label: 'Ước tính còn thiếu', rows: estimateRows }
    ]
  }
}

function sumRows(rows = []) {
  return roundMoney((rows || []).reduce((sum, row) => sum + money(row.amount), 0))
}

export function buildOrderFeePhase1Snapshot(order = {}, cfg = {}, capabilityLookup = new Map()) {
  const capability = resolveOrderCapability(order, capabilityLookup)
  const breakdown = buildBreakdownGroups(order, cfg, capability)
  const groups = breakdown.groups.map(group => ({
    ...group,
    total: sumRows(group.rows)
  }))

  const discountTotal = groups.find(group => group.key === 'discounts')?.total || 0
  const apiFeeTotal = groups.find(group => group.key === 'api_fee')?.total || 0
  const apiTaxTotal = groups.find(group => group.key === 'api_tax')?.total || 0
  const internalTotal = groups.find(group => group.key === 'internal')?.total || 0
  const estimateTotal = groups.find(group => group.key === 'estimate')?.total || 0
  const total = roundMoney(discountTotal + apiFeeTotal + apiTaxTotal + internalTotal + estimateTotal)
  const legacyTotal = roundMoney(order.fee)
  const delta = roundMoney(total - legacyTotal)
  const legacyProfitReal = money(order.profit_real)
  const legacyProfitInvoice = money(order.profit_invoice)

  let badgeText = 'Phí cost setting'
  let badgeTone = 'estimate'
  let note = 'Shop chưa có API phí sàn. OMS đang lấy toàn bộ phí từ cost setting.'
  if (breakdown.is_api_shop) {
    if (estimateTotal > 0) {
      badgeText = 'Phí API + ước tính'
      badgeTone = 'mixed'
      note = 'Shop có API nhưng còn thiếu một số bucket phí thật. OMS đang lấy phần thiếu từ cost setting.'
    } else {
      badgeText = 'Phí API thật'
      badgeTone = 'api'
      note = 'OMS đang ưu tiên phí thật từ API cho shop này.'
    }
  }

  if (Math.abs(delta) >= 1) {
    const deltaText = `${delta > 0 ? '+' : ''}${delta.toLocaleString('vi-VN')}đ`
    note += ` Dữ liệu cũ trong orders_v2 đang lệch ${deltaText}, OMS đang ưu tiên breakdown phase 1.`
  }

  return {
    capability,
    breakdown: {
      ...breakdown,
      groups,
      totals: {
        discounts: discountTotal,
        api_fee: apiFeeTotal,
        api_tax: apiTaxTotal,
        internal: internalTotal,
        estimate: estimateTotal,
        total
      },
      badge_text: badgeText,
      badge_tone: badgeTone,
      note,
      legacy_total: legacyTotal,
      legacy_delta: delta
    },
    fee_display_total: total,
    profit_real_display: roundMoney(legacyProfitReal - delta),
    profit_invoice_display: roundMoney(legacyProfitInvoice - delta),
    legacy_delta: delta
  }
}

export function applyOrderFeePhase1ToOrderRow(order = {}, phase1Context = {}) {
  const snapshot = buildOrderFeePhase1Snapshot(order, phase1Context.cfg || {}, phase1Context.capabilityLookup || new Map())
  return {
    ...order,
    legacy_fee: Number(order.fee || 0),
    legacy_profit_real: Number(order.profit_real || 0),
    legacy_profit_invoice: Number(order.profit_invoice || 0),
    fee: snapshot.fee_display_total,
    profit_real: snapshot.profit_real_display,
    profit_invoice: snapshot.profit_invoice_display,
    fee_breakdown: snapshot.breakdown,
    fee_display_total: snapshot.fee_display_total,
    fee_display_status: snapshot.breakdown.badge_tone,
    fee_display_badge: snapshot.breakdown.badge_text,
    fee_display_note: snapshot.breakdown.note,
    fee_display_delta: snapshot.legacy_delta,
    fee_api_shop: snapshot.breakdown.is_api_shop
  }
}

function sumRowsByCodes(rows = [], codes = []) {
  const allow = new Set(codes)
  return roundMoney((rows || []).reduce((sum, row) => (
    allow.has(cleanFeePhaseText(row?.code)) ? sum + money(row?.amount) : sum
  ), 0))
}

export function buildOrderFeePhase1ProfitResult(order = {}, cfg = {}, capabilityLookup = new Map()) {
  const snapshot = buildOrderFeePhase1Snapshot(order, cfg, capabilityLookup)
  const groups = snapshot.breakdown?.groups || []
  const totalFee = roundMoney(snapshot.fee_display_total || 0)
  const qty = Math.max(Number(order.qty || 1) || 1, 1)
  const revenue = roundMoney(money(order.revenue || 0))
  const costInvoice = roundMoney(money(order.cost_invoice || 0) * qty)
  const costReal = roundMoney(money(order.cost_real || 0) * qty)
  const feePackaging = absMoney(order.fee_packaging)
  const feeOperation = absMoney(order.fee_operation)
  const feeLabor = absMoney(order.fee_labor)
  const returnFee = absMoney(order.return_fee)

  const feePlatform = sumRowsByCodes(groups, ['fee_commission'])
  const feePayment = sumRowsByCodes(groups, ['fee_payment'])
  const feeAffiliate = sumRowsByCodes(groups, ['fee_affiliate'])
  const feeAds = sumRowsByCodes(groups, ['fee_ads'])
  const feePiship = sumRowsByCodes(groups, ['fee_piship', 'fee_shipping'])
  const feeService = sumRowsByCodes(groups, ['fee_service', 'fee_handling', 'tax_vat', 'tax_pit'])

  const orderType = cleanFeePhaseText(order.order_type).toLowerCase()
  const isNormal = orderType === 'normal'
  const isReturn = orderType === 'return'
  const isCancel = orderType === 'cancel'
  const isCancelWithFee = isCancel && returnFee > 0

  // Đơn hủy thông thường không được tái sinh phí ảo từ cost setting.
  if (isCancel && !isCancelWithFee) {
    return {
      revenue: 0,
      total_fee: 0,
      cost_invoice: 0,
      cost_real: 0,
      profit_invoice: 0,
      profit_real: 0,
      tax_flat: 0,
      tax_income: 0,
      profit_after_tax: 0,
      fee_platform: 0,
      fee_payment: 0,
      fee_affiliate: 0,
      fee_ads: 0,
      fee_piship: 0,
      fee_service: 0,
      fee_packaging: 0,
      fee_operation: 0,
      fee_labor: 0
    }
  }

  if (isCancelWithFee || isReturn) {
    const pack = order.shipped ? feePackaging : 0
    const total = roundMoney(returnFee + pack)
    return {
      revenue: 0,
      total_fee: total,
      cost_invoice: 0,
      cost_real: 0,
      profit_invoice: -total,
      profit_real: -total,
      tax_flat: 0,
      tax_income: 0,
      profit_after_tax: -total,
      fee_platform: 0,
      fee_payment: 0,
      fee_affiliate: 0,
      fee_ads: 0,
      fee_piship: returnFee,
      fee_service: 0,
      fee_packaging: pack,
      fee_operation: 0,
      fee_labor: 0
    }
  }

  const feeWithInvoice = roundMoney(totalFee - feePackaging - feeOperation - feeLabor)
  const profitInvoice = roundMoney(revenue - costInvoice - feeWithInvoice)
  const profitReal = roundMoney(revenue - costReal - totalFee)
  const taxFlat = roundMoney(isNormal ? revenue * 0.015 : 0)
  const taxIncome = roundMoney(isNormal && profitInvoice > 0 ? profitInvoice * 0.17 : 0)

  return {
    revenue,
    total_fee: totalFee,
    cost_invoice: costInvoice,
    cost_real: costReal,
    profit_invoice: profitInvoice,
    profit_real: profitReal,
    tax_flat: taxFlat,
    tax_income: taxIncome,
    profit_after_tax: roundMoney(profitReal - taxFlat - taxIncome),
    fee_platform: feePlatform,
    fee_payment: feePayment,
    fee_affiliate: feeAffiliate,
    fee_ads: feeAds,
    fee_piship: feePiship,
    fee_service: feeService,
    fee_packaging: feePackaging,
    fee_operation: feeOperation,
    fee_labor: feeLabor
  }
}
