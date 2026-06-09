/**
 * Core phase 1 cho phí đơn hàng:
 * - Khóa cách hiển thị OMS theo hướng API-first.
 * - Tách rõ giảm giá shop khỏi phí sàn để không trừ voucher shop hai lần khi doanh thu đã là buyer paid.
 * - Phase 2 gom luôn calcProfit legacy về chung source of truth này để route cũ không tái sinh dữ liệu pha trộn.
 */
import { buildOrderFinanceTaxonomy } from './finance-taxonomy-core.js'
import {
  absMoney,
  buildTerminalOrderFinanceOverride,
  capabilityIdentity,
  cleanFeePhaseText,
  fallbackBucketsFromCostSettings,
  hasColumnValue,
  money,
  pishipCostSettingSource,
  roundMoney
} from './fee-phase1-support-core.js'

function apiBucketValue(order = {}, column, code) {
  if (hasColumnValue(order?.[column])) return absMoney(order[column])
  const legacyColumn = code.startsWith('tax_') ? `_${code}` : `_${code}`
  if (hasColumnValue(order?.[legacyColumn])) return absMoney(order[legacyColumn])
  return undefined
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
  const taxonomy = buildOrderFinanceTaxonomy(order)
  const rows = []
  const affiliateFromApi = optionalApiValue(order, 'fee_detail_affiliate')
  const adsFromApi = optionalApiValue(order, 'fee_detail_ads')

  if (taxonomy.shop_discount_amount > 0) {
    rows.push(comparisonRow(
      'Giảm giá shop tự cài',
      taxonomy.shop_discount_amount,
      'core',
      'discount_shop',
      'Chỉ dùng để giải thích giá sau khuyến mãi shop, không thuộc Tổng khấu trừ.'
    ))
  }

  if (taxonomy.platform_voucher_total > 0) {
    rows.push(comparisonRow(
      'Shopee Voucher / voucher sàn',
      taxonomy.platform_voucher_total,
      taxonomy.fields?.platform_voucher_total?.source === 'missing' ? 'missing' : 'api',
      'platform_voucher_total',
      'Tổng voucher khách được giảm; chỉ phần người bán đồng tài trợ mới là khoản shop chịu.'
    ))
  }

  if (taxonomy.seller_cofunded_voucher_amount > 0) {
    rows.push(comparisonRow(
      'Voucher đồng tài trợ người bán chịu',
      taxonomy.seller_cofunded_voucher_amount,
      taxonomy.seller_cofunded_voucher_confidence === 'confirmed' ? 'api' : 'missing',
      'seller_cofunded_voucher_amount',
      taxonomy.seller_cofunded_voucher_source || 'Chưa có field raw xác nhận phần người bán chịu.'
    ))
  }

  if (taxonomy.platform_funded_voucher_amount > 0) {
    rows.push(comparisonRow(
      'Voucher phần sàn tài trợ',
      taxonomy.platform_funded_voucher_amount,
      taxonomy.platform_funded_voucher_confidence === 'confirmed' ? 'api' : 'derived',
      'platform_funded_voucher_amount',
      taxonomy.platform_funded_voucher_confidence === 'confirmed'
        ? taxonomy.platform_funded_voucher_source
        : 'Tính từ platform_voucher_total - seller_cofunded_voucher_amount; không trừ vào shop.'
    ))
  }

  if (affiliateFromApi !== undefined || fallback.fee_affiliate > 0) {
    rows.push(comparisonRow(
      'Phí hoa hồng Tiếp thị liên kết',
      affiliateFromApi,
      affiliateFromApi !== undefined ? 'api' : 'missing',
      'fee_affiliate',
      affiliateFromApi !== undefined ? 'Shopee Payment get_escrow_detail: order_ams_commission_fee.' : `Chưa có API, cost setting đang ước tính ${roundMoney(fallback.fee_affiliate).toLocaleString('vi-VN')}đ.`
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
  const taxonomy = buildOrderFinanceTaxonomy(order)
  const rows = []

  pushWhenPositive(
    rows,
    'Giảm giá shop tự cài',
    taxonomy.shop_discount_amount,
    'core',
    'discount_shop'
  )
  pushWhenPositive(
    rows,
    'Shopee Voucher / voucher sàn',
    taxonomy.platform_voucher_total,
    taxonomy.platform_voucher_total > 0 ? 'api' : 'missing',
    'platform_voucher_total'
  )
  pushWhenPositive(rows, 'Phần sàn tài trợ', taxonomy.platform_funded_voucher_amount, taxonomy.platform_funded_voucher_confidence === 'confirmed' ? 'api' : 'derived', 'platform_funded_voucher_amount')

  return rows
}

const API_PLATFORM_COLUMNS = [
  ['fee_detail_commission', 'Hoa hồng / phí sàn', 'fee_commission'],
  ['fee_detail_payment', 'Phí thanh toán', 'fee_payment'],
  ['fee_detail_affiliate', 'Phí hoa hồng Tiếp thị liên kết', 'fee_affiliate'],
  ['fee_detail_service', 'Phí dịch vụ', 'fee_service'],
  ['fee_detail_handling', 'Phí xử lý / fulfillment', 'fee_handling']
]

const API_TAX_COLUMNS = [
  ['fee_detail_tax_vat', 'Thuế GTGT khấu trừ', 'tax_vat'],
  ['fee_detail_tax_pit', 'Thuế TNCN khấu trừ', 'tax_pit']
]

const ESTIMATE_LABELS = {
  fee_commission: 'Ước tính hoa hồng / phí sàn',
  fee_payment: 'Ước tính phí thanh toán',
  fee_affiliate: 'Ước tính phí hoa hồng Tiếp thị liên kết',
  fee_ads: 'Ước tính phí quảng cáo',
  fee_piship: 'Ước tính phí PiShip / bảo vệ',
  fee_service: 'Ước tính phí dịch vụ',
  fee_handling: 'Ước tính phí xử lý / fulfillment',
  fee_shipping: 'Ước tính phí vận chuyển / logistics',
  tax_vat: 'Ước tính thuế GTGT khấu trừ',
  tax_pit: 'Ước tính thuế TNCN khấu trừ'
}

function buildBreakdownGroups(order = {}, cfg = {}, capability = null) {
  const baseTaxonomy = buildOrderFinanceTaxonomy(order)
  const platform = cleanFeePhaseText(order.platform).toLowerCase()
  const baseFinanceSource = cleanFeePhaseText(baseTaxonomy.finance_source).toLowerCase()
  const isTiktokSellerCenterFinanceSource = platform === 'tiktok' && baseFinanceSource.includes('tiktok_seller_center')
  const discountRows = []
  const apiRows = []
  const taxRows = []
  const settlementRows = []
  const internalRows = []
  const estimateRows = []
  const rawFallback = fallbackBucketsFromCostSettings(order, cfg)
  const fallback = isTiktokSellerCenterFinanceSource
    ? {
        fee_commission: 0, fee_payment: 0, fee_affiliate: 0,
        fee_ads: rawFallback.fee_ads,
        fee_piship: rawFallback.fee_piship,
        fee_service: 0, fee_handling: 0, fee_shipping: 0,
        tax_vat: 0, tax_pit: 0
      }
    : rawFallback
  const pishipCostSource = pishipCostSettingSource(platform)
  const fallbackPiship = baseTaxonomy.piship_fee > 0 ? 0 : fallback.fee_piship
  const taxonomy = {
    ...baseTaxonomy,
    ads_fee_total: baseTaxonomy.ads_fee_total > 0 ? baseTaxonomy.ads_fee_total : fallback.fee_ads,
    piship_fee: baseTaxonomy.piship_fee > 0 ? baseTaxonomy.piship_fee : fallback.fee_piship,
    piship_fee_source: baseTaxonomy.piship_fee > 0 ? baseTaxonomy.piship_fee_source : (fallback.fee_piship > 0 ? pishipCostSource : baseTaxonomy.piship_fee_source),
    piship_fee_source_type: baseTaxonomy.piship_fee > 0 ? baseTaxonomy.piship_fee_source_type : (fallback.fee_piship > 0 ? 'cost_setting' : baseTaxonomy.piship_fee_source_type),
    piship_fee_confidence: baseTaxonomy.piship_fee > 0 ? baseTaxonomy.piship_fee_confidence : (fallback.fee_piship > 0 ? 'fallback' : baseTaxonomy.piship_fee_confidence),
    ops_cost_setting_total: roundMoney((baseTaxonomy.ops_cost_setting_total || 0) + fallbackPiship),
    fields: {
      ...(baseTaxonomy.fields || {}),
      piship_fee: baseTaxonomy.piship_fee > 0
        ? baseTaxonomy.fields?.piship_fee
        : {
            value: roundMoney(fallback.fee_piship),
            source: fallback.fee_piship > 0 ? pishipCostSource : 'missing',
            confidence: fallback.fee_piship > 0 ? 'fallback' : 'missing'
          }
    }
  }

  const capabilityMode = cleanFeePhaseText(capability?.capability_mode)
  const supportsApiFeePlatform = ['shopee', 'lazada'].includes(platform)
  const isTiktokSellerCenterFinance = platform === 'tiktok'
    && cleanFeePhaseText(taxonomy.finance_source).toLowerCase().includes('tiktok_seller_center')
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
  const isApiShop = (supportsApiFeePlatform && (capabilityMode === 'api_active' || hasAnyApiDetail || hasAnyApiDiscount))
    || isTiktokSellerCenterFinance
  const marketplaceFeeSource = isTiktokSellerCenterFinance ? 'seller_center' : 'api'
  discountRows.push(...buildDiscountRows(order))

  for (const [column, label, code] of API_PLATFORM_COLUMNS) {
    const apiValue = apiBucketValue(order, column, code)
    if (isApiShop && apiValue !== undefined) {
      pushWhenPositive(apiRows, label, apiValue, marketplaceFeeSource, code)
    } else if (!isApiShop && fallback[code] > 0) {
      pushWhenPositive(estimateRows, ESTIMATE_LABELS[code], fallback[code], 'estimate', code)
    }
  }

  for (const [column, label, code] of API_TAX_COLUMNS) {
    const apiValue = apiBucketValue(order, column, code)
    if (isApiShop && apiValue !== undefined) {
      pushWhenPositive(taxRows, label, apiValue, marketplaceFeeSource, code)
    } else if (!isApiShop && fallback[code] > 0) {
      pushWhenPositive(estimateRows, ESTIMATE_LABELS[code], fallback[code], 'estimate', code)
    }
  }

  pushWhenPositive(settlementRows, 'Voucher đồng tài trợ người bán chịu', taxonomy.seller_cofunded_voucher_amount, taxonomy.seller_cofunded_voucher_confidence === 'confirmed' ? 'api' : 'missing', 'seller_cofunded_voucher_amount')
  pushWhenPositive(settlementRows, 'Điều chỉnh vận chuyển/settlement', taxonomy.settlement_adjustment_total, 'api', 'settlement_adjustment')
  pushWhenPositive(internalRows, 'ADS ngoài ví', taxonomy.ads_fee_total, taxonomy.ads_fee_total > 0 ? 'cost_setting' : 'missing', 'fee_ads')
  if (taxonomy.piship_fee_source_type !== 'api') {
    pushWhenPositive(
      internalRows,
      'PiShip / Cost setting',
      taxonomy.piship_fee,
      taxonomy.piship_fee > 0 ? 'cost_setting' : 'missing',
      'fee_piship'
    )
  }
  pushWhenPositive(internalRows, 'Phí đóng gói nội bộ', order.fee_packaging, 'internal', 'fee_packaging')
  pushWhenPositive(internalRows, 'Phí vận hành nội bộ', order.fee_operation, 'internal', 'fee_operation')
  pushWhenPositive(internalRows, 'Phí nhân công nội bộ', order.fee_labor, 'internal', 'fee_labor')
  pushWhenPositive(internalRows, 'Phí hoàn / phạt ngoài API', order.return_fee, 'internal', 'return_fee')

  return {
    is_api_shop: isApiShop ? 1 : 0,
    is_tiktok_seller_center_finance: isTiktokSellerCenterFinance ? 1 : 0,
    capability_mode: capabilityMode || 'manual_reference',
    comparisons: buildApiComparisonRows(order, fallback),
    groups: [
      { key: 'discounts', label: 'Giải thích giá/voucher', rows: discountRows },
      { key: 'settlement_deduction', label: 'Khấu trừ settlement', rows: settlementRows },
      { key: 'api_fee', label: isTiktokSellerCenterFinance ? 'Phí sàn từ TikTok Seller Center' : 'Phí sàn từ API', rows: apiRows },
      { key: 'api_tax', label: isTiktokSellerCenterFinance ? 'Thuế/khấu trừ từ TikTok Seller Center' : 'Thuế/khấu trừ từ API', rows: taxRows },
      { key: 'internal', label: 'Phí vận hành / Cost setting', rows: internalRows },
      { key: 'estimate', label: 'Ước tính còn thiếu', rows: estimateRows }
    ],
    taxonomy
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
  const settlementDeductionTotal = groups.find(group => group.key === 'settlement_deduction')?.total || 0
  const apiFeeTotal = groups.find(group => group.key === 'api_fee')?.total || 0
  const apiTaxTotal = groups.find(group => group.key === 'api_tax')?.total || 0
  const internalTotal = groups.find(group => group.key === 'internal')?.total || 0
  const estimateTotal = groups.find(group => group.key === 'estimate')?.total || 0
  const taxonomy = breakdown.taxonomy || buildOrderFinanceTaxonomy(order)
  const totalDeductions = breakdown.is_tiktok_seller_center_finance
    ? roundMoney(taxonomy.platform_deduction_total)
    : roundMoney(settlementDeductionTotal + apiFeeTotal + apiTaxTotal + estimateTotal)
  const broadDeductionView = roundMoney(discountTotal + totalDeductions)
  const legacyTotal = roundMoney(order.fee)
  const delta = roundMoney(totalDeductions - legacyTotal)
  const legacyProfitReal = money(order.profit_real)
  const legacyProfitInvoice = money(order.profit_invoice)
  const profitBasis = roundMoney(taxonomy.profit_basis ?? taxonomy.actual_income)
  const actualIncomeAvailable = taxonomy.actual_income_available !== false
  const actualIncomeAmount = actualIncomeAvailable ? roundMoney(taxonomy.actual_income) : null
  const estimatedIncomeAmount = !actualIncomeAvailable ? roundMoney(taxonomy.estimated_income ?? profitBasis) : 0
  const profitIncomeAmount = actualIncomeAvailable ? actualIncomeAmount : estimatedIncomeAmount
  const profitLabel = actualIncomeAvailable ? 'Lãi thực' : 'Lãi tạm tính'

  let badgeText = 'Khấu trừ cost setting'
  let badgeTone = 'estimate'
  let note = 'Shop chưa có API phí sàn. OMS chỉ lấy khấu trừ vận hành/cost setting, không cộng voucher shop vào phí.'
  if (breakdown.is_tiktok_seller_center_finance) {
    badgeText = 'Khấu trừ TikTok đã quét'
    badgeTone = 'api'
    note = 'OMS đang ưu tiên phí và thuế đã quét từ TikTok Seller Center. ADS ngoài ví và PiShip lấy từ cost setting chỉ để trừ lợi nhuận, không cộng vào Tổng khấu trừ. Settlement chưa quyết toán vẫn chỉ hiển thị lãi tạm tính.'
  } else if (breakdown.is_api_shop) {
    if (estimateTotal > 0) {
      badgeText = 'Khấu trừ API + ước tính'
      badgeTone = 'mixed'
      note = 'Shop có API nhưng còn thiếu một số bucket khấu trừ thật. OMS lấy phần thiếu từ cost setting và không cộng giảm giá shop tự cài vào phí.'
    } else {
      badgeText = 'Khấu trừ API thật'
      badgeTone = 'api'
      note = 'OMS đang ưu tiên phí/khấu trừ thật từ API cho shop này; giảm giá shop tự cài chỉ dùng để giải thích giá.'
    }
  }

  if (breakdown.is_api_shop && cleanFeePhaseText(order.platform).toLowerCase() === 'lazada' && !actualIncomeAvailable) {
    badgeText = 'Thiếu dữ liệu Finance API'
    badgeTone = 'mixed'
    note = 'Shop Lazada có Order API nhưng chưa có actual_income/settlement confirmed từ Lazada Finance API. OMS chỉ hiển thị lãi tạm tính, không gọi là lãi thực.'
  } else if (!breakdown.is_tiktok_seller_center_finance && breakdown.is_api_shop && apiFeeTotal <= 0 && apiTaxTotal <= 0 && settlementDeductionTotal <= 0 && !actualIncomeAvailable) {
    badgeText = 'Thiếu dữ liệu Finance API'
    badgeTone = 'mixed'
    note = 'Shop có API. Doanh thu lấy từ Order API; phí/settlement cần endpoint Finance chính thức hoặc quyền Finance. OMS không dùng cost setting làm nguồn phí chính cho shop API.'
  }

  if (Math.abs(delta) >= 1) {
    const deltaText = `${delta > 0 ? '+' : ''}${delta.toLocaleString('vi-VN')}đ`
    note += ` Dữ liệu cũ trong orders_v2 đang lệch ${deltaText}, OMS đang ưu tiên taxonomy Finance Core.`
  }

  const snapshot = {
    capability,
    breakdown: {
      ...breakdown,
      groups,
      totals: {
        discounts: discountTotal,
        settlement_deduction: settlementDeductionTotal,
        shop_discount: sumRowsByCodes(groups.find(group => group.key === 'discounts')?.rows || [], ['discount_shop']),
        platform_voucher: taxonomy.platform_voucher_total,
        platform_voucher_total: taxonomy.platform_voucher_total,
        seller_cofunded_voucher_amount: taxonomy.seller_cofunded_voucher_amount,
        platform_funded_voucher_amount: taxonomy.platform_funded_voucher_amount,
        product_original_amount: taxonomy.product_original_amount,
        product_revenue_after_shop_discount: taxonomy.product_revenue_after_shop_discount,
        buyer_shipping_paid: taxonomy.buyer_shipping_paid,
        buyer_total_paid: taxonomy.buyer_total_paid,
        actual_income: actualIncomeAmount,
        estimated_income: estimatedIncomeAmount,
        estimated_income_source: taxonomy.estimated_income_source,
        actual_income_settlement: taxonomy.actual_income_settlement,
        actual_income_available: actualIncomeAvailable,
        actual_income_confidence: taxonomy.actual_income_confidence,
        profit_basis: profitBasis,
        profit_status: taxonomy.profit_status,
        profit_label: profitLabel,
        settlement_status: taxonomy.settlement_status,
        marketplace_fee_total: apiFeeTotal,
        api_fee: apiFeeTotal,
        api_tax: apiTaxTotal,
        internal: internalTotal,
        estimate: estimateTotal,
        ads_fee_total: taxonomy.ads_fee_total,
        piship_fee: taxonomy.piship_fee,
        piship_fee_source: taxonomy.piship_fee_source,
        piship_fee_source_type: taxonomy.piship_fee_source_type,
        piship_fee_confidence: taxonomy.piship_fee_confidence,
        sfr_service_fee: taxonomy.sfr_service_fee,
        ops_cost_setting_total: taxonomy.ops_cost_setting_total,
        ops_cost_setting_other: taxonomy.ops_cost_setting_other,
        total_deductions: totalDeductions,
        broad_deduction_view: broadDeductionView,
        total: totalDeductions,
        percent_basis_label: 'Người mua thanh toán'
      },
      taxonomy,
      badge_text: badgeText,
      badge_tone: badgeTone,
      note,
      legacy_total: legacyTotal,
      legacy_delta: delta
    },
    fee_display_total: totalDeductions,
    profit_real_display: roundMoney(profitIncomeAmount - money(order.cost_real) - taxonomy.ads_fee_total - taxonomy.piship_fee - taxonomy.ops_cost_setting_other),
    profit_invoice_display: roundMoney(profitIncomeAmount - money(order.cost_invoice) - taxonomy.ads_fee_total - taxonomy.piship_fee - taxonomy.ops_cost_setting_other),
    gross_revenue: taxonomy.gross_revenue,
    product_original_amount: taxonomy.product_original_amount,
    product_revenue_after_shop_discount: taxonomy.product_revenue_after_shop_discount,
    buyer_shipping_paid: taxonomy.buyer_shipping_paid,
    buyer_total_paid: taxonomy.buyer_total_paid,
    platform_voucher_total: taxonomy.platform_voucher_total,
    seller_cofunded_voucher_amount: taxonomy.seller_cofunded_voucher_amount,
    platform_funded_voucher_amount: taxonomy.platform_funded_voucher_amount,
    actual_income: actualIncomeAmount,
    estimated_income: estimatedIncomeAmount,
    estimated_income_source: taxonomy.estimated_income_source,
    actual_income_settlement: taxonomy.actual_income_settlement,
    actual_income_available: actualIncomeAvailable,
    actual_income_confidence: taxonomy.actual_income_confidence,
    profit_basis: profitBasis,
    profit_status: taxonomy.profit_status,
    profit_label: profitLabel,
    settlement_status: taxonomy.settlement_status,
    marketplace_fee_total: taxonomy.marketplace_fee_total,
    tax_total: taxonomy.tax_total,
    ads_fee_total: taxonomy.ads_fee_total,
    piship_fee: taxonomy.piship_fee,
    piship_fee_source: taxonomy.piship_fee_source,
    piship_fee_source_type: taxonomy.piship_fee_source_type,
    piship_fee_confidence: taxonomy.piship_fee_confidence,
    sfr_service_fee: taxonomy.sfr_service_fee,
    ops_cost_setting_total: taxonomy.ops_cost_setting_total,
    legacy_delta: delta
  }

  const terminalOverride = buildTerminalOrderFinanceOverride(order, snapshot)
  if (!terminalOverride) return snapshot

  return {
    ...snapshot,
    ...terminalOverride.fields,
    breakdown: {
      ...snapshot.breakdown,
      totals: {
        ...snapshot.breakdown.totals,
        ...terminalOverride.totals
      },
      badge_text: terminalOverride.badge_text,
      badge_tone: terminalOverride.badge_tone,
      note: terminalOverride.note,
      legacy_delta: 0
    }
  }
}

export function applyOrderFeePhase1ToOrderRow(order = {}, phase1Context = {}) {
  const snapshot = buildOrderFeePhase1Snapshot(order, phase1Context.cfg || {}, phase1Context.capabilityLookup || new Map())
  return {
    ...order,
    legacy_fee: Number(order.fee || 0),
    legacy_profit_real: Number(order.profit_real || 0),
    legacy_profit_invoice: Number(order.profit_invoice || 0),
    revenue: snapshot.gross_revenue,
    gross_revenue: snapshot.gross_revenue,
    product_original_amount: snapshot.product_original_amount,
    product_revenue_after_shop_discount: snapshot.product_revenue_after_shop_discount,
    buyer_shipping_paid: snapshot.buyer_shipping_paid,
    buyer_total_paid: snapshot.buyer_total_paid,
    platform_voucher_total: snapshot.platform_voucher_total,
    seller_cofunded_voucher_amount: snapshot.seller_cofunded_voucher_amount,
    platform_funded_voucher_amount: snapshot.platform_funded_voucher_amount,
    actual_income: snapshot.actual_income,
    estimated_income: snapshot.estimated_income,
    estimated_income_source: snapshot.estimated_income_source,
    actual_income_settlement: snapshot.actual_income_settlement,
    actual_income_available: snapshot.actual_income_available,
    actual_income_confidence: snapshot.actual_income_confidence,
    profit_basis: snapshot.profit_basis,
    profit_status: snapshot.profit_status,
    profit_label: snapshot.profit_label,
    settlement_status: snapshot.settlement_status,
    marketplace_fee_total: snapshot.marketplace_fee_total,
    tax_total: snapshot.tax_total,
    ads_fee_total: snapshot.ads_fee_total,
    piship_fee: snapshot.piship_fee,
    piship_fee_source: snapshot.piship_fee_source,
    piship_fee_source_type: snapshot.piship_fee_source_type,
    piship_fee_confidence: snapshot.piship_fee_confidence,
    sfr_service_fee: snapshot.sfr_service_fee,
    ops_cost_setting_total: snapshot.ops_cost_setting_total,
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
  const taxonomy = snapshot.breakdown?.taxonomy || buildOrderFinanceTaxonomy(order)
  const groups = snapshot.breakdown?.groups || []
  const groupRows = groups.flatMap(group => Array.isArray(group?.rows) ? group.rows : [])
  const totalFee = roundMoney(snapshot.fee_display_total || 0)
  const qty = Math.max(Number(order.qty || 1) || 1, 1)
  const revenue = roundMoney(taxonomy.gross_revenue || order.revenue || 0)
  const costInvoice = roundMoney(money(order.cost_invoice || 0) * qty)
  const costReal = roundMoney(money(order.cost_real || 0) * qty)
  const feePackaging = absMoney(order.fee_packaging)
  const feeOperation = absMoney(order.fee_operation)
  const feeLabor = absMoney(order.fee_labor)
  const returnFee = absMoney(order.return_fee)

  const feePlatform = sumRowsByCodes(groupRows, ['fee_commission'])
  const feePayment = sumRowsByCodes(groupRows, ['fee_payment'])
  const feeAffiliate = sumRowsByCodes(groupRows, ['fee_affiliate'])
  const feeAds = sumRowsByCodes(groupRows, ['fee_ads'])
  const feePiship = sumRowsByCodes(groupRows, ['fee_piship', 'fee_shipping'])
  const feeService = sumRowsByCodes(groupRows, ['fee_service', 'fee_handling', 'tax_vat', 'tax_pit'])

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

  const opsOther = roundMoney(taxonomy.ops_cost_setting_other || feePackaging + feeOperation + feeLabor)
  const actualIncome = roundMoney(taxonomy.actual_income ?? taxonomy.estimated_income ?? (revenue - totalFee))
  const profitInvoice = roundMoney(actualIncome - costInvoice - feeAds - feePiship - opsOther)
  const profitReal = roundMoney(actualIncome - costReal - feeAds - feePiship - opsOther)
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
