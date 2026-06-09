import { moneyNumber } from './summary-core.js'

const CORE_VERSION = '2026-05-19-finance-taxonomy-guard'

function component(key, label, value, source, confidence = 'confirmed', note = '', category = 'marketplace_fee') {
  return {
    key,
    label,
    value: moneyNumber(value),
    source,
    confidence,
    note,
    category
  }
}

function sourceLabel(source) {
  if (source === 'api') return 'API'
  if (source === 'ads_snapshot') return 'ADS API'
  if (source === 'fallback') return 'Fallback'
  if (source === 'cost_setting') return 'Cost Setting'
  if (source === 'mixed') return 'API + fallback'
  return 'Core'
}

function sumComponents(components) {
  return components.reduce((sum, row) => sum + moneyNumber(row.value), 0)
}

function buildDashboardFinanceFeeCore({
  dashboardRow = {},
  feeBucketRow = {},
  breakdownRow = {},
  adsSnapshotRow = {}
} = {}) {
  const scopeOrders = moneyNumber(feeBucketRow.fee_scope_orders || dashboardRow.total_orders)
  const detailOrders = moneyNumber(feeBucketRow.fee_detail_orders)
  const fallbackOrders = Math.max(0, scopeOrders - detailOrders)
  const adsFeeFromDetail = moneyNumber(feeBucketRow.total_ads_fee ?? dashboardRow.total_ads_fee)
  const adsFeeFromSnapshot = moneyNumber(adsSnapshotRow.total_ads_fee)
  const adsFee = Math.max(adsFeeFromDetail, adsFeeFromSnapshot)
  const adsSource = adsFeeFromSnapshot > adsFeeFromDetail ? 'ads_snapshot' : (detailOrders ? 'api' : 'fallback')
  const componentSource = detailOrders ? (fallbackOrders ? 'mixed' : 'api') : 'fallback'
  const pishipApiFee = moneyNumber(feeBucketRow.total_piship_fee_api)
  const pishipCostSettingFee = moneyNumber(feeBucketRow.total_piship_fee_cost_setting)
  const pishipFee = pishipApiFee + pishipCostSettingFee || moneyNumber(feeBucketRow.total_piship_fee ?? dashboardRow.total_piship_fee)
  const pishipSource = pishipApiFee > 0
    ? (pishipCostSettingFee > 0 ? 'mixed' : 'api')
    : (pishipFee > 0 ? 'cost_setting' : 'fallback')

  const discountComponents = [
    component('shop_discount_amount', 'Giảm giá của shop', breakdownRow.total_discount_shop, componentSource, 'confirmed', 'Không thuộc Phí sàn.', 'revenue_adjustment'),
    component('platform_voucher_amount', 'Shopee Voucher / voucher sàn', breakdownRow.total_discount_shopee, componentSource, 'confirmed', 'Tổng voucher khách được giảm; không mặc định toàn bộ là shop chịu.', 'revenue_adjustment'),
    component('platform_funded_voucher_amount', 'Voucher phần sàn tài trợ', breakdownRow.total_platform_funded_voucher, componentSource, 'confirmed', 'Phần sàn tài trợ không trừ vào shop.', 'revenue_adjustment'),
    component('combo_discount_amount', 'Combo / khuyến mại khác', breakdownRow.total_discount_combo, componentSource, 'confirmed', 'Điều chỉnh doanh thu, không thuộc Phí sàn.', 'revenue_adjustment')
  ].filter(row => moneyNumber(row.value) > 0)

  const components = [
    component('seller_cofunded_voucher_amount', 'Voucher đồng tài trợ người bán chịu', breakdownRow.total_seller_cofunded_voucher, componentSource, 'confirmed', 'Nằm trong Tổng khấu trừ từ sàn khi có raw field.', 'settlement_deduction'),
    component('commission_fee', 'Phí cố định / hoa hồng', feeBucketRow.total_platform_fee ?? dashboardRow.total_platform_fee, componentSource, 'confirmed', '', 'marketplace_fee'),
    component('service_fee', 'Phí dịch vụ', feeBucketRow.total_service_fee ?? dashboardRow.total_service_fee, componentSource, 'confirmed', '', 'marketplace_fee'),
    component('payment_fee', 'Phí thanh toán', feeBucketRow.total_payment_fee ?? dashboardRow.total_payment_fee, componentSource, 'confirmed', '', 'marketplace_fee'),
    component('affiliate_fee', 'Tiếp thị liên kết', feeBucketRow.total_affiliate_fee ?? dashboardRow.total_affiliate_fee, componentSource, 'confirmed', '', 'marketplace_fee'),
    component('ads_fee', 'Phí ngoài sàn / ADS', adsFee, adsSource, 'confirmed', '', 'ops_ads_fee'),
    component('piship_fee', pishipSource === 'api' ? 'PiShip từ API Shopee' : 'PiShip / Cost setting', pishipFee, pishipSource, pishipSource === 'api' ? 'confirmed' : 'fallback', 'Phí vận hành ngoài ví, không phải Phí sàn.', 'ops_ads_fee'),
    component('handling_fee', 'Xử lý / fulfillment', feeBucketRow.total_handling_fee, detailOrders ? 'api' : 'fallback', 'confirmed', '', 'ops_ads_fee'),
    component('shipping_fee', 'Vận chuyển / logistics', feeBucketRow.total_shipping_fee, detailOrders ? 'api' : 'fallback', 'confirmed', '', 'ops_ads_fee'),
    component('tax_vat', 'Thuế VAT sàn khấu trừ', feeBucketRow.total_fee_tax_vat, detailOrders ? 'api' : 'fallback', 'confirmed', '', 'tax_deduction'),
    component('tax_pit', 'Thuế PIT sàn khấu trừ', feeBucketRow.total_fee_tax_pit, detailOrders ? 'api' : 'fallback', 'confirmed', '', 'tax_deduction'),
    component('fixed_fee', 'Đóng gói/labor từ đơn', dashboardRow.total_fixed_fee, 'cost_setting', 'fallback', '', 'ops_ads_fee')
  ]

  const bucketedTotal = sumComponents(components)
  const discountTotal = sumComponents(discountComponents)
  const legacyOrderFeeTotal = moneyNumber(dashboardRow.total_fee)
  // Nếu tổng phí legacy còn lẫn voucher, tách voucher khỏi phần khấu trừ để không trừ shop_discount hai lần.
  const legacyLooksBroad = discountTotal > 0 && legacyOrderFeeTotal >= bucketedTotal + discountTotal - 1
  const legacyDeductionTotal = legacyLooksBroad ? Math.max(0, legacyOrderFeeTotal - discountTotal) : legacyOrderFeeTotal
  const displayTotal = Math.max(bucketedTotal, legacyDeductionTotal)
  const unbucketedTotal = Math.max(0, legacyDeductionTotal - bucketedTotal)

  if (unbucketedTotal > 0) {
    components.push(component(
      'unbucketed_fee',
      'Khấu trừ còn thiếu bucket',
      unbucketedTotal,
      'fallback',
      'estimated',
      'Tổng khấu trừ legacy lớn hơn các bucket đã chuẩn hóa.',
      'unbucketed_deduction'
    ))
  }

  const byKey = [...components, ...discountComponents].reduce((map, row) => {
    map[row.key] = row
    return map
  }, {})

  const marketplaceFeeTotal = sumComponents(components.filter(row => row.category === 'marketplace_fee'))
  const taxDeductionTotal = sumComponents(components.filter(row => row.category === 'tax_deduction'))
  const opsAdsTotal = sumComponents(components.filter(row => row.category === 'ops_ads_fee'))
  const settlementDeductionTotal = sumComponents(components.filter(row => row.category === 'settlement_deduction'))
  const platformDeductionTotal = moneyNumber(marketplaceFeeTotal + taxDeductionTotal + settlementDeductionTotal)
  const normalizeComponent = (row, base = platformDeductionTotal) => ({
    ...row,
    source_label: sourceLabel(row.source),
    percent_of_total: base > 0 ? row.value / base : 0
  })

  const normalizedComponents = components
    .filter(row => row.category !== 'ops_ads_fee')
    .map(row => normalizeComponent(row, platformDeductionTotal))
  const normalizedOpsComponents = components
    .filter(row => row.category === 'ops_ads_fee')
    .map(row => normalizeComponent(row, opsAdsTotal))
  const normalizedDiscountComponents = discountComponents.map(row => ({
    ...normalizeComponent(row, moneyNumber(dashboardRow.total_revenue)),
    percent_of_total: moneyNumber(dashboardRow.total_revenue) > 0 ? row.value / moneyNumber(dashboardRow.total_revenue) : 0
  }))

  // Core này là nguồn taxonomy phí/doanh thu dùng chung; voucher shop chỉ là điều chỉnh doanh thu, không thuộc Phí sàn.
  return {
    version: CORE_VERSION,
    source: 'dashboard_finance_fee_core',
    confidence: detailOrders ? (fallbackOrders ? 'mixed' : 'confirmed') : 'fallback',
    scope_orders: scopeOrders,
    detail_orders: detailOrders,
    fallback_orders: fallbackOrders,
    totals: {
      display_total: platformDeductionTotal,
      bucketed_total: platformDeductionTotal,
      legacy_order_fee_total: legacyOrderFeeTotal,
      legacy_deduction_total: legacyDeductionTotal,
      legacy_contains_discount_guard: legacyLooksBroad,
      detail_fee_total: moneyNumber(feeBucketRow.total_fee_from_details),
      fee_without_detail_total: moneyNumber(feeBucketRow.total_fee_without_detail),
      unbucketed_total: unbucketedTotal,
      deduction_total: platformDeductionTotal,
      total_deductions: platformDeductionTotal,
      platform_deduction_total: platformDeductionTotal,
      marketplace_fee_total: marketplaceFeeTotal,
      tax_deduction_total: taxDeductionTotal,
      settlement_deduction_total: settlementDeductionTotal,
      ops_ads_fee_total: opsAdsTotal,
      discount_total: discountTotal,
      shop_discount_amount: moneyNumber(breakdownRow.total_discount_shop),
      platform_voucher_amount: moneyNumber(breakdownRow.total_discount_shopee),
      seller_cofunded_voucher_amount: moneyNumber(breakdownRow.total_seller_cofunded_voucher),
      platform_funded_voucher_amount: moneyNumber(breakdownRow.total_platform_funded_voucher),
      combo_discount_amount: moneyNumber(breakdownRow.total_discount_combo),
      commission_fee: moneyNumber(feeBucketRow.total_platform_fee ?? dashboardRow.total_platform_fee),
      service_fee: moneyNumber(feeBucketRow.total_service_fee ?? dashboardRow.total_service_fee),
      payment_fee: moneyNumber(feeBucketRow.total_payment_fee ?? dashboardRow.total_payment_fee),
      affiliate_fee: moneyNumber(feeBucketRow.total_affiliate_fee ?? dashboardRow.total_affiliate_fee),
      ads_fee: adsFee,
      piship_fee: pishipFee,
      piship_fee_api: pishipApiFee,
      piship_fee_cost_setting: pishipCostSettingFee,
      handling_fee: moneyNumber(feeBucketRow.total_handling_fee),
      shipping_fee: moneyNumber(feeBucketRow.total_shipping_fee),
      tax_vat: moneyNumber(feeBucketRow.total_fee_tax_vat),
      tax_pit: moneyNumber(feeBucketRow.total_fee_tax_pit),
      fixed_fee: moneyNumber(dashboardRow.total_fixed_fee),
      percent_basis: moneyNumber(dashboardRow.total_revenue),
      percent_basis_label: 'Người mua thanh toán'
    },
    components: normalizedComponents,
    ops_components: normalizedOpsComponents,
    discount_components: normalizedDiscountComponents,
    by_key: byKey,
    sources: {
      fee_detail: detailOrders > 0 ? 'order_fee_details' : 'orders_v2',
      discounts: detailOrders > 0 ? 'order_fee_details.raw_data' : 'orders_v2',
      ads: adsSource === 'ads_snapshot' ? 'marketplace_ads_campaign_snapshots' : 'order_fee_details/orders_v2'
    },
    summary: {
      source_label: detailOrders ? (fallbackOrders ? 'API + fallback' : 'API') : 'Fallback',
      note: detailOrders
        ? `Đã chuẩn hóa ${detailOrders}/${scopeOrders || detailOrders} đơn từ Finance/Payment/ADS core`
        : 'Chưa có dòng phí chi tiết từ Finance/Payment, dùng tổng phí fallback trong orders_v2'
    }
  }
}

function applyDashboardFinanceFeeCoreToRow(dashboardRow, context = {}) {
  const financeFeeCore = buildDashboardFinanceFeeCore({
    dashboardRow,
    ...context
  })
  const totals = financeFeeCore.totals || {}
  return {
    ...dashboardRow,
    finance_fee_core: financeFeeCore,
    total_fee: moneyNumber(totals.display_total),
    total_deduction: moneyNumber(totals.deduction_total),
    total_marketplace_fee: moneyNumber(totals.marketplace_fee_total),
    total_tax_deduction: moneyNumber(totals.tax_deduction_total),
    total_ops_ads_fee: moneyNumber(totals.ops_ads_fee_total),
    total_fee_core_bucketed: moneyNumber(totals.bucketed_total),
    total_fee_unbucketed: moneyNumber(totals.unbucketed_total),
    total_discount_shop: moneyNumber(totals.shop_discount_amount),
    total_discount_shopee: moneyNumber(totals.platform_voucher_amount),
    total_discount_combo: moneyNumber(totals.combo_discount_amount),
    total_platform_fee: moneyNumber(totals.commission_fee),
    total_service_fee: moneyNumber(totals.service_fee),
    total_payment_fee: moneyNumber(totals.payment_fee),
    total_affiliate_fee: moneyNumber(totals.affiliate_fee),
    total_ads_fee: moneyNumber(totals.ads_fee),
    total_piship_fee: moneyNumber(totals.piship_fee),
    total_handling_fee: moneyNumber(totals.handling_fee),
    total_shipping_fee: moneyNumber(totals.shipping_fee),
    total_fee_tax_vat: moneyNumber(totals.tax_vat),
    total_fee_tax_pit: moneyNumber(totals.tax_pit),
    total_fixed_fee: moneyNumber(totals.fixed_fee)
  }
}

export { buildDashboardFinanceFeeCore, applyDashboardFinanceFeeCoreToRow }
