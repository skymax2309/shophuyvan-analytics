import assert from 'node:assert/strict'
import {
  extractTiktokOrderNoFromUrl,
  normalizeTiktokSellerCenterDetailPayload,
  buildTiktokSellerCenterRawData,
  listTiktokSellerCenterFinanceEligibleOrders,
  upsertTiktokSellerCenterFinanceDetail
} from '../apps/worker-api/src/core/orders/tiktok-seller-center-finance-core.js'
import { buildOrderFinanceTaxonomy } from '../apps/worker-api/src/core/orders/finance-taxonomy-core.js'
import { chooseActualIncome } from '../apps/worker-api/src/core/orders/analytics-finance-core.js'
import { buildOrderFeePhase1Snapshot } from '../apps/worker-api/src/core/orders/fee-phase1-core.js'

const ORDER_NO = '584098737148888997'
const detailUrl = `https://seller-vn.tiktok.com/order/detail?order_no=${ORDER_NO}&shop_region=VN`

assert.equal(extractTiktokOrderNoFromUrl(detailUrl), ORDER_NO)

const normalized = normalizeTiktokSellerCenterDetailPayload({
  url: detailUrl,
  header_order_no: ORDER_NO,
  fields: {
    'Tổng các mặt hàng trước khi giảm giá': 69000,
    'Giảm giá của người bán cho các mặt hàng': -24000,
    'Giảm giá của TikTok Shop cho các mặt hàng': 0,
    'Tổng các mặt hàng sau khi giảm giá': 45000,
    'Phí vận chuyển sau khi giảm giá': 35200,
    'Giảm phí vận chuyển của người bán': 0,
    'Giảm phí vận chuyển của TikTok Shop': 0,
    'Tổng cộng': 80200,
    'Số tiền bạn kiếm được': null
  },
  actual_income_available: false
})

assert.equal(normalized.ok, true)
assert.equal(normalized.product_original_amount, 69000)
assert.equal(normalized.seller_item_discount, 24000)
assert.equal(normalized.product_revenue_after_shop_discount, 45000)
assert.equal(normalized.buyer_shipping_paid, 35200)
assert.equal(normalized.gross_revenue, 80200)
assert.equal(normalized.actual_income, null)
assert.equal(normalized.settlement_status, 'pending_settlement')

const mismatch = normalizeTiktokSellerCenterDetailPayload({
  url: detailUrl,
  header_order_no: 'wrong',
  fields: {}
})
assert.equal(mismatch.ok, false)
assert.equal(mismatch.error, 'header_order_no_mismatch')

const rawData = buildTiktokSellerCenterRawData(normalized)
const order = {
  order_id: ORDER_NO,
  platform: 'tiktok',
  revenue: 80200,
  raw_revenue: 69000,
  source_mode: 'manual_reference',
  source_detail: 'tiktok_seller_center_detail',
  discount_shop: 24000,
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify(rawData),
  has_fee_detail: 1,
  cost_real: 0,
  fee_ads: 0,
  fee_piship: 0
}
const taxonomy = buildOrderFinanceTaxonomy(order, [{ order_id: ORDER_NO, revenue_line: 45000 }])
assert.equal(taxonomy.gross_revenue, 80200)
assert.equal(taxonomy.buyer_total_paid, 80200)
assert.equal(taxonomy.product_revenue_after_shop_discount, 45000)
assert.equal(taxonomy.buyer_shipping_paid, 35200)
assert.equal(taxonomy.actual_income_available, false)
assert.equal(taxonomy.actual_income_confidence, 'none')
assert.equal(taxonomy.actual_income, null)
assert.equal(taxonomy.estimated_income, 45000)
assert.equal(taxonomy.estimated_income_source, 'tiktok_estimated_fee')
assert.equal(taxonomy.actual_income_settlement, null)
assert.equal(taxonomy.profit_basis, 45000)
assert.equal(taxonomy.profit_status, 'estimated_pending_settlement')
const pendingSnapshot = buildOrderFeePhase1Snapshot(order)
assert.equal(pendingSnapshot.profit_label, 'Lãi tạm tính')
assert.equal(pendingSnapshot.estimated_income_source, 'tiktok_estimated_fee')
assert.equal(pendingSnapshot.actual_income_confidence, 'none')

const actual = chooseActualIncome(order, 80200, [{ order_id: ORDER_NO, revenue_line: 45000 }])
assert.equal(actual.source, 'orders_v2_estimate_no_ads')
assert.equal(actual.amount, null)
assert.equal(actual.estimatedAmount, 45000)
assert.equal(actual.taxonomy.profit_basis_source, 'tiktok_seller_center_detail.product_revenue_after_shop_discount')

const FINANCE_ORDER_NO = '584123080227784403'
const financeTransactionUrl = `https://seller-vn.tiktok.com/finance/transactions?billsId=0&orderOrSkuId=${FINANCE_ORDER_NO}&shop_region=VN&tab=to_settle_tab`
const financeTransactionNormalized = normalizeTiktokSellerCenterDetailPayload({
  url: financeTransactionUrl,
  header_order_no: FINANCE_ORDER_NO,
  finance_source: 'tiktok_seller_center_finance_transaction',
  fields: {
    product_revenue_after_shop_discount: 89000,
    gross_revenue: 89000,
    estimated_fee_total: 21245,
    transaction_fee: 5340,
    commission_fee: 11570,
    seller_shipping_fee: 0,
    handling_fee: 3000,
    tax_vat: 890,
    tax_pit: 445,
    settlement_total: 67755,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
assert.equal(financeTransactionNormalized.ok, true)
assert.equal(financeTransactionNormalized.actual_income, null)
assert.equal(financeTransactionNormalized.actual_income_available, false)
assert.equal(financeTransactionNormalized.settlement_total, 67755)
assert.equal(financeTransactionNormalized.estimated_income, 67755)
assert.equal(financeTransactionNormalized.finance_source, 'tiktok_seller_center_finance_transaction')
assert.equal(financeTransactionNormalized.field_meta.buyer_shipping_paid.value, null)
assert.equal(financeTransactionNormalized.field_meta.buyer_shipping_paid.confidence, 'missing')
const financeTransactionRaw = buildTiktokSellerCenterRawData(financeTransactionNormalized)
const financeTransactionTaxonomy = buildOrderFinanceTaxonomy({
  order_id: FINANCE_ORDER_NO,
  platform: 'tiktok',
  revenue: 89000,
  raw_revenue: 89000,
  source_detail: 'tiktok_seller_center_detail',
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify(financeTransactionRaw),
  has_fee_detail: 1,
  cost_real: 0,
  fee_ads: 8900,
  fee_piship: 2008
}, [{ order_id: FINANCE_ORDER_NO, revenue_line: 89000 }])
assert.equal(financeTransactionTaxonomy.actual_income_available, false)
assert.equal(financeTransactionTaxonomy.actual_income, null)
assert.equal(financeTransactionTaxonomy.estimated_income, 67755)
assert.equal(financeTransactionTaxonomy.marketplace_fee_total, 19910)
assert.equal(financeTransactionTaxonomy.tax_total, 1335)
assert.equal(financeTransactionTaxonomy.platform_deduction_total, 21245)
assert.equal(financeTransactionTaxonomy.ads_fee_total, 8900)
assert.equal(financeTransactionTaxonomy.piship_fee, 2008)
assert.equal(financeTransactionTaxonomy.ops_cost_setting_total, 2008)
assert.equal(financeTransactionTaxonomy.finance_source, 'tiktok_seller_center_finance_transaction')
assert.equal(financeTransactionTaxonomy.finance_confidence, 'estimated')
const financeTransactionSnapshot = buildOrderFeePhase1Snapshot({
  order_id: FINANCE_ORDER_NO,
  platform: 'tiktok',
  revenue: 89000,
  raw_revenue: 89000,
  fee_source: 'tiktok_seller_center_finance_transaction',
  fee_detail_commission: 11570,
  fee_detail_payment: 5340,
  fee_detail_handling: 3000,
  fee_detail_tax_vat: 890,
  fee_detail_tax_pit: 445,
  fee_raw_data: JSON.stringify(financeTransactionRaw),
  has_fee_detail: 1,
  cost_real: 0
}, {
  tiktok_ads: { value: 10, type: 'pct' },
  tiktok_sfr: { value: 2008, type: 'fixed' }
})
assert.equal(financeTransactionSnapshot.breakdown.badge_text, 'Khấu trừ TikTok đã quét')
assert.equal(financeTransactionSnapshot.breakdown.totals.api_fee, 19910)
assert.equal(financeTransactionSnapshot.breakdown.totals.api_tax, 1335)
assert.equal(financeTransactionSnapshot.breakdown.totals.estimate, 0)
assert.equal(financeTransactionSnapshot.breakdown.totals.internal, 10908)
assert.equal(financeTransactionSnapshot.breakdown.totals.ads_fee_total, 8900)
assert.equal(financeTransactionSnapshot.breakdown.is_tiktok_seller_center_finance, 1)
assert.equal(financeTransactionSnapshot.breakdown.totals.piship_fee, 2008)
assert.equal(financeTransactionSnapshot.breakdown.totals.total_deductions, 21245)
assert.equal(financeTransactionSnapshot.profit_real_display, 56847)
const financeTransactionDuplicateTax = buildOrderFinanceTaxonomy({
  order_id: FINANCE_ORDER_NO,
  platform: 'tiktok',
  revenue: 89000,
  fee_source: 'tiktok_seller_center_finance_transaction',
  fee_raw_data: JSON.stringify(financeTransactionRaw),
  fee_detail_tax_vat: 890,
  fee_detail_tax_pit: 445,
  tax_vat: 890,
  tax_pit: 445
}, [{ order_id: FINANCE_ORDER_NO, revenue_line: 89000 }])
assert.equal(financeTransactionDuplicateTax.tax_total, 1335)

const observedZeroShipping = normalizeTiktokSellerCenterDetailPayload({
  url: financeTransactionUrl,
  header_order_no: FINANCE_ORDER_NO,
  finance_source: 'tiktok_seller_center_finance_transaction',
  fields: {
    product_revenue_after_shop_discount: 89000,
    buyer_shipping_paid: 0,
    settlement_total: 67755,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
assert.equal(observedZeroShipping.buyer_shipping_paid, 0)
assert.equal(observedZeroShipping.field_meta.buyer_shipping_paid.confidence, 'observed_zero')

const missingOriginalRaw = buildTiktokSellerCenterRawData(observedZeroShipping)
const missingOriginalTaxonomy = buildOrderFinanceTaxonomy({
  order_id: FINANCE_ORDER_NO,
  platform: 'tiktok',
  revenue: 89000,
  fee_source: 'tiktok_seller_center_finance_transaction',
  fee_raw_data: JSON.stringify(missingOriginalRaw),
  cost_real: 0
}, [{ order_id: FINANCE_ORDER_NO, revenue_line: 89000 }])
assert.equal(missingOriginalTaxonomy.product_original_amount, null)
assert.equal(missingOriginalTaxonomy.fields.product_original_amount.value, null)
assert.equal(missingOriginalTaxonomy.buyer_shipping_paid, 0)
assert.equal(missingOriginalTaxonomy.fields.buyer_shipping_paid.confidence, 'observed_zero')

const sfrOnlyNormalized = normalizeTiktokSellerCenterDetailPayload({
  url: financeTransactionUrl,
  header_order_no: FINANCE_ORDER_NO,
  finance_source: 'tiktok_seller_center_finance_transaction',
  fields: {
    product_revenue_after_shop_discount: 65000,
    settlement_total: 63380,
    sfr_service_fee: 1620,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
const sfrTaxonomy = buildOrderFinanceTaxonomy({
  order_id: FINANCE_ORDER_NO,
  platform: 'tiktok',
  revenue: 65000,
  fee_source: 'tiktok_seller_center_finance_transaction',
  fee_raw_data: JSON.stringify(buildTiktokSellerCenterRawData(sfrOnlyNormalized)),
  fee_detail_settlement: 1620
}, [{ order_id: FINANCE_ORDER_NO, revenue_line: 65000 }])
assert.equal(sfrTaxonomy.actual_income, null)
assert.equal(sfrTaxonomy.sfr_service_fee, 1620)

const legacySellerCenterDetailTaxonomy = buildOrderFinanceTaxonomy({
  order_id: '584117718394898329',
  platform: 'tiktok',
  revenue: 65000,
  source_detail: 'tiktok_seller_center_detail',
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify({ source: 'tiktok_seller_center_detail' }),
  fee_detail_settlement: 1620,
  fee_ads: 6500,
  fee_piship: 2008
}, [{ order_id: '584117718394898329', revenue_line: 65000 }])
assert.equal(legacySellerCenterDetailTaxonomy.finance_source, 'tiktok_seller_center_detail')
assert.equal(legacySellerCenterDetailTaxonomy.actual_income, null)
assert.equal(legacySellerCenterDetailTaxonomy.actual_income_available, false)
assert.equal(legacySellerCenterDetailTaxonomy.sfr_service_fee, 1620)
assert.equal(legacySellerCenterDetailTaxonomy.ads_fee_total, 6500)
assert.equal(legacySellerCenterDetailTaxonomy.ops_cost_setting_total, 2008)
assert.equal(legacySellerCenterDetailTaxonomy.piship_fee, 2008)
const legacySellerCenterDetailSnapshot = buildOrderFeePhase1Snapshot({
  order_id: '584117718394898329',
  platform: 'tiktok',
  revenue: 65000,
  source_detail: 'tiktok_seller_center_detail',
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify({ source: 'tiktok_seller_center_detail' }),
  fee_detail_settlement: 1620,
  fee_ads: 6500,
  fee_piship: 2008
})
assert.equal(legacySellerCenterDetailSnapshot.breakdown.badge_text, 'Khấu trừ TikTok đã quét')
assert.equal(legacySellerCenterDetailSnapshot.breakdown.totals.estimate, 0)
assert.equal(legacySellerCenterDetailSnapshot.breakdown.totals.internal, 8508)
assert.equal(legacySellerCenterDetailSnapshot.breakdown.totals.total_deductions, 1620)
assert.equal(legacySellerCenterDetailSnapshot.profit_real_display, 54872)
assert.equal(legacySellerCenterDetailSnapshot.actual_income, null)

const normalizedAvailable = normalizeTiktokSellerCenterDetailPayload({
  url: detailUrl,
  header_order_no: ORDER_NO,
  fields: {
    'Tổng các mặt hàng trước khi giảm giá': 69000,
    'Giảm giá của người bán cho các mặt hàng': -24000,
    'Tổng các mặt hàng sau khi giảm giá': 45000,
    'Phí vận chuyển sau khi giảm giá': 35200,
    'Tổng cộng': 80200,
    'Số tiền bạn kiếm được': 62200
  }
})
const actualRawData = buildTiktokSellerCenterRawData(normalizedAvailable)
const actualOrder = {
  ...order,
  fee_raw_data: JSON.stringify(actualRawData),
  settlement: 62200,
  fee_detail_settlement: 62200
}
const actualTaxonomy = buildOrderFinanceTaxonomy(actualOrder, [{ order_id: ORDER_NO, revenue_line: 45000 }])
assert.equal(actualTaxonomy.actual_income_available, true)
assert.equal(actualTaxonomy.actual_income_confidence, 'confirmed')
assert.equal(actualTaxonomy.actual_income, 62200)
assert.equal(actualTaxonomy.actual_income_settlement, 62200)
assert.equal(actualTaxonomy.settlement_status, 'confirmed')
assert.equal(actualTaxonomy.profit_status, 'actual_income_confirmed')
assert.equal(buildOrderFeePhase1Snapshot(actualOrder).profit_label, 'Lãi thực')
const actualIncome = chooseActualIncome(actualOrder, 80200, [{ order_id: ORDER_NO, revenue_line: 45000 }])
assert.equal(actualIncome.source, 'tiktok_seller_center_detail')
assert.equal(actualIncome.amount, 62200)

const manualEstimate = chooseActualIncome({
  order_id: ORDER_NO,
  platform: 'tiktok',
  source_mode: 'manual_reference',
  revenue: 80200,
  raw_revenue: 69000,
  fee_platform: 10426,
  fee_payment: 4010,
  fee_affiliate: 4010,
  fee_service: 3000,
  fee_ads: 8020,
  fee_piship: 2008
}, 80200, [{ order_id: ORDER_NO, revenue_line: 45000 }])
assert.equal(manualEstimate.source, 'orders_v2_estimate_no_ads')
assert.equal(manualEstimate.amount, null)
assert.equal(manualEstimate.estimatedAmount, 58754)
assert.equal(manualEstimate.actualIncomeAvailable, false)

const legacyEstimateRaw = buildTiktokSellerCenterRawData(normalized)
legacyEstimateRaw.order_income.escrow_amount = 45000
legacyEstimateRaw.order_income.escrow_amount_after_adjustment = 45000
legacyEstimateRaw.tiktok_seller_center_detail.actual_income = null
legacyEstimateRaw.tiktok_seller_center_detail.actual_income_available = false
legacyEstimateRaw.tiktok_seller_center_detail.settlement_status = 'pending_settlement'
legacyEstimateRaw.tiktok_seller_center_detail.finance_confidence = 'estimated'
const legacyEstimateOrder = {
  ...order,
  fee_raw_data: JSON.stringify(legacyEstimateRaw),
  settlement: 45000,
  fee_detail_settlement: 45000
}
const legacyEstimateTaxonomy = buildOrderFinanceTaxonomy(legacyEstimateOrder, [{ order_id: ORDER_NO, revenue_line: 45000 }])
assert.equal(legacyEstimateTaxonomy.actual_income_available, false)
assert.equal(legacyEstimateTaxonomy.actual_income, null)
assert.equal(legacyEstimateTaxonomy.actual_income_settlement, null)
assert.equal(legacyEstimateTaxonomy.profit_status, 'estimated_pending_settlement')
const legacyEstimateIncome = chooseActualIncome(legacyEstimateOrder, 80200, [{ order_id: ORDER_NO, revenue_line: 45000 }])
assert.equal(legacyEstimateIncome.amount, null)
assert.equal(legacyEstimateIncome.estimatedAmount, 45000)

function makeFakeEnv(rows = []) {
  const state = {
    rows,
    orders: new Map(rows.map(row => [row.order_id, {
      order_id: row.order_id,
      platform: row.platform,
      shop: row.shop,
      order_date: row.order_date,
      revenue: row.revenue || 0,
      raw_revenue: row.raw_revenue || 0,
      discount_shop: row.discount_shop || 0,
      discount_shopee: row.discount_shopee || 0
    }])),
    fees: new Map(rows.map(row => [row.order_id, {
      source: row.fee_source,
      settlement: row.settlement,
      raw_data: row.fee_raw_data,
      updated_at: row.fee_updated_at
    }]))
  }
  const prepare = sql => ({
    bind: (...args) => makeStatement(sql, args),
    all: () => makeStatement(sql, []).all(),
    first: () => makeStatement(sql, []).first(),
    run: () => makeStatement(sql, []).run()
  })
  const makeStatement = (sql, args) => ({
    async all() {
      if (sql.includes('FROM orders_v2 o') && sql.includes('LEFT JOIN order_fee_details f') && sql.includes('ORDER BY date(o.order_date)')) {
        return { results: state.rows }
      }
      if (sql.includes('PRAGMA table_info')) return { results: [{ name: 'ads_cpo' }, { name: 'ads_cpo_basis' }, { name: 'ads_cpo_denominator' }, { name: 'ads_cpo_total_spend' }] }
      return { results: [] }
    },
    async first() {
      if (sql.includes('FROM orders_v2 o') && sql.includes('WHERE o.order_id = ?')) {
        const order = state.orders.get(args[0])
        if (!order) return null
        const fee = state.fees.get(args[0]) || {}
        return {
          ...order,
          existing_fee_raw_data: fee.raw_data,
          existing_settlement: fee.settlement
        }
      }
      return null
    },
    async run() {
      if (sql.includes('INSERT INTO order_fee_details')) {
        const orderId = args[0]
        const shop = args[1]
        const source = args[2]
        const settlement = args[args.length - 2]
        const rawData = args[args.length - 1]
        state.fees.set(orderId, { shop, source, settlement, raw_data: rawData, updated_at: 'now' })
      }
      if (sql.includes('UPDATE orders_v2')) {
        const orderId = args[args.length - 1]
        const orderRow = state.orders.get(orderId)
        if (orderRow) {
          orderRow.revenue = args[0]
          orderRow.raw_revenue = args[2]
          orderRow.discount_shop = args[4]
          orderRow.discount_shopee = args[5]
          orderRow.source_detail = args[6]
        }
      }
      return { meta: { changes: 1, last_row_id: 1 } }
    }
  })
  return { DB: { prepare }, state }
}

const oldPendingIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
const pendingEnv = makeFakeEnv([{
  order_id: ORDER_NO,
  platform: 'tiktok',
  shop: '0909128999',
  order_date: '2026-05-19',
  order_type: 'normal',
  source_mode: 'browser_sync',
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify(rawData),
  fee_updated_at: oldPendingIso
}])
const eligible = await listTiktokSellerCenterFinanceEligibleOrders(pendingEnv, { limit: 999 })
assert.equal(eligible.limit, 20)
assert.equal(eligible.eligible_count, 1)
assert.equal(eligible.orders[0].settlement_status, 'pending_settlement')
assert.equal(eligible.orders[0].reason, 'pending_settlement_refresh')

const preserveEnv = makeFakeEnv([{
  order_id: ORDER_NO,
  platform: 'tiktok',
  shop: '0909128999',
  order_date: '2026-05-19',
  order_type: 'normal',
  source_mode: 'browser_sync',
  fee_source: 'tiktok_seller_center_detail',
  settlement: 62200,
  fee_raw_data: JSON.stringify(actualRawData),
  fee_updated_at: oldPendingIso
}])
const preserveResult = await upsertTiktokSellerCenterFinanceDetail(preserveEnv, {
  url: detailUrl,
  header_order_no: ORDER_NO,
  fields: {
    'Tổng các mặt hàng trước khi giảm giá': 69000,
    'Giảm giá của người bán cho các mặt hàng': -24000,
    'Tổng các mặt hàng sau khi giảm giá': 45000,
    'Phí vận chuyển sau khi giảm giá': 35200,
    'Tổng cộng': 80200,
    'Số tiền bạn kiếm được': null
  },
  actual_income_available: false
})
const preservedRaw = JSON.parse(preserveEnv.state.fees.get(ORDER_NO).raw_data)
assert.equal(preserveResult.actual_income_preserved, true)
assert.equal(preserveResult.actual_income, 62200)
assert.equal(preserveResult.settlement_status, 'confirmed')
assert.equal(preservedRaw.tiktok_seller_center_detail.actual_income_available, true)
assert.equal(preservedRaw.tiktok_seller_center_detail.actual_income, 62200)

const pendingTransactionEnv = makeFakeEnv([{
  order_id: FINANCE_ORDER_NO,
  platform: 'tiktok',
  shop: '0909128999',
  order_date: '2026-05-21',
  order_type: 'normal',
  source_mode: 'browser_sync',
  fee_source: 'tiktok_seller_center_detail',
  settlement: 1620,
  fee_raw_data: JSON.stringify(actualRawData),
  fee_updated_at: oldPendingIso
}])
const pendingTransactionResult = await upsertTiktokSellerCenterFinanceDetail(pendingTransactionEnv, {
  url: financeTransactionUrl,
  header_order_no: FINANCE_ORDER_NO,
  finance_source: 'tiktok_seller_center_finance_transaction',
  fields: {
    product_revenue_after_shop_discount: 89000,
    gross_revenue: 89000,
    estimated_fee_total: 21245,
    transaction_fee: 5340,
    commission_fee: 11570,
    seller_shipping_fee: 0,
    handling_fee: 3000,
    tax_vat: 890,
    tax_pit: 445,
    settlement_total: 67755,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
const pendingTransactionFee = pendingTransactionEnv.state.fees.get(FINANCE_ORDER_NO)
const pendingTransactionRaw = JSON.parse(pendingTransactionFee.raw_data)
assert.equal(pendingTransactionResult.actual_income_preserved, false)
assert.equal(pendingTransactionResult.actual_income, null)
assert.equal(pendingTransactionResult.estimated_income, 67755)
assert.equal(pendingTransactionResult.settlement_status, 'pending_settlement')
assert.equal(pendingTransactionFee.source, 'tiktok_seller_center_finance_transaction')
assert.equal(pendingTransactionFee.settlement, null)
assert.equal(pendingTransactionRaw.tiktok_seller_center_detail.actual_income_available, false)
assert.equal(pendingTransactionRaw.tiktok_seller_center_detail.settlement_total, 67755)

console.log('test-tiktok-seller-center-finance: ok')
