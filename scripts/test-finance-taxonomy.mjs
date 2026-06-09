import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildDashboardFinanceFeeCore } from '../apps/worker-api/src/core/dashboard/finance-fee-core.js'
import {
  buildOrderFeeCapabilityLookup,
  buildOrderFeePhase1ProfitResult,
  buildOrderFeePhase1Snapshot
} from '../apps/worker-api/src/core/orders/fee-phase1-core.js'
import { buildOrderFinanceTaxonomy } from '../apps/worker-api/src/core/orders/finance-taxonomy-core.js'
import { chooseActualIncome } from '../apps/worker-api/src/core/orders/analytics-finance-core.js'
import { LAZADA_FINANCE_SOURCE } from '../apps/worker-api/src/core/orders/analytics-shared-core.js'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

const sampleOrder = {
  platform: 'shopee',
  shop: 'taxonomy-test',
  order_id: 'TAXONOMY-98000',
  qty: 1,
  raw_revenue: 98000,
  revenue: 69000,
  discount_shop: 29000,
  cost_real: 25000,
  cost_invoice: 25000,
  fee: 50975,
  profit_real: -6975,
  profit_invoice: -6975,
  fee_detail_seller_discount: 29000,
  fee_detail_commission: 21975
}

const snapshot = buildOrderFeePhase1Snapshot(sampleOrder)
assert.equal(snapshot.breakdown.totals.shop_discount, 29000, 'shop_discount phải nằm ở nhóm giảm giá riêng')
assert.equal(snapshot.breakdown.totals.marketplace_fee_total, 21975, 'marketplace_fee_total không được chứa voucher shop')
assert.equal(snapshot.breakdown.totals.total_deductions, 21975, 'tổng khấu trừ không được cộng shop_discount')
assert.equal(snapshot.fee_display_total, 21975, 'OMS phải hiển thị phí/khấu trừ không gồm shop_discount')
assert.equal(snapshot.profit_real_display, 22025, 'Lãi mẫu 98k/29k/69k phải là 22.025')

const profit = buildOrderFeePhase1ProfitResult(sampleOrder)
assert.equal(profit.total_fee, 21975, 'Profit basis buyer_paid không được trừ shop_discount lần nữa')
assert.equal(profit.profit_real, 22025, 'buyer_paid - cost - marketplace_fees = 22.025')

const dashboardCore = buildDashboardFinanceFeeCore({
  dashboardRow: {
    total_orders: 1,
    total_revenue: 69000,
    total_fee: 50975
  },
  feeBucketRow: {
    fee_scope_orders: 1,
    fee_detail_orders: 1,
    total_platform_fee: 21975
  },
  breakdownRow: {
    total_discount_shop: 29000,
    total_discount_shopee: 0,
    total_discount_combo: 0
  }
})
assert.equal(dashboardCore.totals.display_total, 21975, 'Dashboard tổng khấu trừ phải loại voucher shop khỏi legacy total')
assert.equal(dashboardCore.totals.marketplace_fee_total, 21975, 'Dashboard marketplace_fee_total chỉ là phí sàn')
assert.equal(dashboardCore.totals.shop_discount_amount, 29000, 'Dashboard vẫn giữ shop_discount ở taxonomy riêng')
assert.equal(dashboardCore.components.some(row => row.key === 'shop_discount_amount'), false, 'Card phí không được chứa voucher shop trong components')
assert.equal(dashboardCore.discount_components.some(row => row.key === 'shop_discount_amount'), true, 'Voucher shop phải hiện ở discount_components')

assert.equal(LAZADA_FINANCE_SOURCE, 'lazada.finance.transaction.details.get', 'Lazada Finance source phải khớp endpoint details/get chính thức')
const financeCoreSource = readFileSync(repoFile('apps/worker-api/src/core/orders/finance-core.js'), 'utf8')
const orderAnalyticsRebuildSource = readFileSync(repoFile('apps/worker-api/src/routes/order-analytics/order-analytics-rebuild-core.js'), 'utf8')
const omsFeeRenderSource = readFileSync(repoFile('apps/fe/js/modules/oms-fee-render.js'), 'utf8')
assert.ok(financeCoreSource.includes('LAZADA_FINANCE_SOURCE'), 'Finance Core phải dùng shared Lazada Finance source')
assert.equal(financeCoreSource.includes('lazada.finance.transaction.detail.get'), false, 'Finance Core không được dùng source Lazada singular sai endpoint')
assert.ok(orderAnalyticsRebuildSource.includes('/finance/transaction/details/get'), 'Order analytics rebuild phải ghi endpoint Lazada details/get')
assert.ok(omsFeeRenderSource.includes('Thực nhận tạm tính'), 'OMS popup TikTok phải hiển thị Thực nhận tạm tính khi chưa settlement')
assert.ok(omsFeeRenderSource.includes('Sẽ cập nhật lại khi quét được settlement thật từ TikTok'), 'OMS popup TikTok phải ghi rõ sẽ cập nhật khi có settlement thật')
assert.equal(omsFeeRenderSource.includes('Thực nhận ví: <b>${actualIncomeAvailable ?'), false, 'OMS không được gắn nhãn Thực nhận ví khi TikTok chưa settlement')
const lazadaCapabilityLookup = buildOrderFeeCapabilityLookup([{
  platform: 'lazada',
  shop_name: 'kinhdoanhonlinegiasoc@gmail.com',
  capability_mode: 'api_active'
}])
const lazadaMissingFinance = buildOrderFeePhase1Snapshot({
  platform: 'lazada',
  shop: 'kinhdoanhonlinegiasoc@gmail.com',
  order_id: 'LZD-MISSING-FINANCE',
  revenue: 100000,
  actual_income_available: false
}, {
  lazada_commission: { value: 8, type: 'percent' },
  lazada_payment_fee: { value: 2, type: 'percent' }
}, lazadaCapabilityLookup)
assert.equal(lazadaMissingFinance.breakdown.totals.estimate, 0, 'Lazada API không được dùng cost setting làm phí estimate chính khi thiếu Finance API')
assert.equal(lazadaMissingFinance.breakdown.badge_text, 'Thiếu dữ liệu Finance API', 'Lazada API thiếu quyền/dữ liệu phải hiện thiếu Finance API')

const lazadaMissingTaxonomy = buildOrderFinanceTaxonomy({
  platform: 'lazada',
  shop: 'kinhdoanhonlinegiasoc@gmail.com',
  order_id: 'LZD-TAX-MISSING',
  revenue: 149000,
  fee_detail_settlement: 120000,
  fee_source: 'lazada.orders.get+order.items.get'
})
assert.equal(lazadaMissingTaxonomy.actual_income_available, false, 'Lazada thiếu Finance API không được coi settlement/order estimate là actual_income confirmed')
assert.equal(lazadaMissingTaxonomy.finance_confidence, 'estimated', 'Lazada thiếu Finance API chỉ được là estimated')
assert.equal(chooseActualIncome({
  platform: 'lazada',
  shop: 'kinhdoanhonlinegiasoc@gmail.com',
  revenue: 149000
}, 149000).actualIncomeAvailable, false, 'chooseActualIncome Lazada thiếu Finance API phải trả trạng thái chưa confirmed')

const lazadaConfirmedTaxonomy = buildOrderFinanceTaxonomy({
  platform: 'lazada',
  shop: 'kinhdoanhonlinegiasoc@gmail.com',
  order_id: 'LZD-TAX-CONFIRMED',
  revenue: 149000,
  fee_detail_settlement: 120000,
  fee_source: LAZADA_FINANCE_SOURCE
})
assert.equal(lazadaConfirmedTaxonomy.actual_income_available, true, 'Lazada Finance API confirmed mới được gọi là actual_income')
assert.equal(lazadaConfirmedTaxonomy.finance_source, LAZADA_FINANCE_SOURCE, 'Lazada confirmed phải ghi đúng source Finance API')

const settlementEstimate = chooseActualIncome({ fee_platform: 21975, discount_shop: 29000 }, 69000)
assert.equal(settlementEstimate.platformFees, 21975, 'Finance Core estimate không lấy shop_discount làm platform fee')
assert.equal(settlementEstimate.amount - 25000, 22025, 'Settlement estimate không trừ lại phí đã nằm trong actual_income')

const orderS5 = {
  platform: 'shopee',
  shop: 'taxonomy-test',
  order_id: '260519S5GSW0AV',
  revenue: 72000,
  raw_revenue: 72000,
  cost_real: 25000,
  cost_invoice: 25000,
  fee_ads: 7200,
  fee_piship: 1620,
  fee_detail_commission: 6900,
  fee_detail_payment: 4320,
  fee_detail_service: 3000,
  fee_detail_tax_vat: 690,
  fee_detail_tax_pit: 345,
  fee_detail_settlement: 53745,
  fee_raw_data: JSON.stringify({
    order_income: {
      order_selling_price: 69000,
      order_discounted_price: 69000,
      buyer_paid_shipping_fee: 3000,
      final_shipping_fee: -3000,
      escrow_amount: 53745,
      escrow_amount_after_adjustment: 53745,
      seller_discount: 29000,
      order_seller_discount: 29000,
      voucher_from_seller: 0,
      voucher_from_shopee: 0
    },
    buyer_payment_info: {
      shipping_fee: 3000,
      buyer_total_amount: 72000,
      shopee_voucher: 0
    }
  })
}
const snapshotS5 = buildOrderFeePhase1Snapshot(orderS5)
assert.equal(snapshotS5.gross_revenue, 72000, '260519S5GSW0AV gross_revenue phải cộng phí ship khách trả')
assert.equal(snapshotS5.actual_income, 53745, '260519S5GSW0AV actual_income phải lấy settlement/API')
assert.equal(snapshotS5.profit_real_display, 19925, '260519S5GSW0AV profit = actual_income - cost - ADS - PiShip')
assert.equal(snapshotS5.piship_fee, 1620, '260519S5GSW0AV PiShip fallback từ Cost Setting khi API không có field')
assert.equal(snapshotS5.piship_fee_source_type, 'cost_setting', '260519S5GSW0AV PiShip phải ghi rõ fallback Cost Setting')
const snapshotS5FromCostSetting = buildOrderFeePhase1Snapshot(
  { ...orderS5, fee_ads: 0, fee_piship: 0 },
  {
    shopee_ads: { value: 10, type: 'percent' },
    shopee_piship: { value: 1620, type: 'fixed' }
  }
)
assert.equal(snapshotS5FromCostSetting.ads_fee_total, 7200, 'Finance Core phải bù ADS từ Cost Setting khi order chưa có field ADS')
assert.equal(snapshotS5FromCostSetting.piship_fee, 1620, 'Finance Core phải bù PiShip từ Cost Setting khi API không có field PiShip')
assert.equal(snapshotS5FromCostSetting.profit_real_display, 19925, 'Cost Setting fallback vẫn phải ra profit mẫu 19.925')

const tiktokLegacySfr = buildOrderFinanceTaxonomy({
  platform: 'tiktok',
  shop: '0909128999',
  order_id: 'TIKTOK-LEGACY-SFR-1620',
  revenue: 65000,
  source_detail: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify({
    tiktok_seller_center_detail: {
      source: 'tiktok_seller_center_detail',
      finance_source: 'tiktok_seller_center_detail',
      settlement_status: 'confirmed',
      actual_income_available: true,
      actual_income: 1620,
      product_revenue_after_shop_discount: 65000
    }
  })
})
assert.equal(tiktokLegacySfr.actual_income, null, 'TikTok legacy 1.620đ không được coi là actual_income')
assert.equal(tiktokLegacySfr.actual_income_available, false, 'TikTok legacy SFR phải pending settlement')
assert.equal(tiktokLegacySfr.sfr_service_fee, 1620, 'TikTok legacy 1.620đ phải map vào SFR service fee')
assert.equal(tiktokLegacySfr.tiktok_sfr_fee, 1620, 'TikTok legacy 1.620đ phải có alias tiktok_sfr_fee')
assert.equal(tiktokLegacySfr.finance_source, 'tiktok_seller_center_detail', 'TikTok Seller Center detail vẫn giữ source thật')

const tiktokOutsideWalletSnapshot = buildOrderFeePhase1Snapshot({
  platform: 'tiktok',
  shop: '0909128999',
  order_id: 'TIKTOK-OUTSIDE-WALLET-COST-SETTING',
  revenue: 65000,
  fee_source: 'tiktok_seller_center_detail',
  fee_detail_settlement: 1620,
  fee_raw_data: JSON.stringify({
    source: 'tiktok_seller_center_detail',
    tiktok_seller_center_detail: {
      source: 'tiktok_seller_center_detail',
      finance_source: 'tiktok_seller_center_detail',
      actual_income_available: false,
      settlement_status: 'pending_settlement',
      product_revenue_after_shop_discount: 65000,
      estimated_income: 63380,
      sfr_service_fee: 1620
    }
  })
}, {
  tiktok_ads: { value: 10, type: 'pct' },
  tiktok_sfr: { value: 2008, type: 'fixed' }
})
assert.equal(tiktokOutsideWalletSnapshot.breakdown.totals.total_deductions, 1620, 'TikTok Tổng khấu trừ chỉ gồm phí/thuế Seller Center đã quét')
assert.equal(tiktokOutsideWalletSnapshot.breakdown.totals.internal, 8508, 'TikTok ADS ngoài ví và PiShip phải vào nhóm vận hành/cost setting')
assert.equal(tiktokOutsideWalletSnapshot.ads_fee_total, 6500, 'TikTok ADS ngoài ví lấy từ cost setting theo doanh thu')
assert.equal(tiktokOutsideWalletSnapshot.piship_fee, 2008, 'TikTok PiShip lấy từ cost setting khi Seller Center không có dòng ngoài ví')
assert.equal(tiktokOutsideWalletSnapshot.profit_real_display, 54872, 'TikTok lãi tạm tính phải trừ ADS ngoài ví và PiShip cost setting')

const orderS77Raw = {
  order_income: {
    order_selling_price: 260900,
    order_discounted_price: 260900,
    voucher_from_seller: 12524,
    voucher_from_shopee: 29220,
    shipping_seller_protection_fee_amount: 1620,
    escrow_amount: 192838,
    escrow_amount_after_adjustment: 192838,
    seller_voucher_code: ['SVIPDDV0105M300C250']
  },
  buyer_payment_info: {
    merchant_subtotal: 260900,
    buyer_total_amount: 219156,
    shopee_voucher: -41744
  }
}
const orderS77 = {
  platform: 'shopee',
  shop: 'taxonomy-test',
  order_id: '260519S77FX1U9',
  revenue: 219156,
  raw_revenue: 219156,
  cost_real: 0,
  cost_invoice: 0,
  fee_detail_commission: 32289,
  fee_detail_payment: 14903,
  fee_detail_service: 3000,
  fee_detail_tax_vat: 2484,
  fee_detail_tax_pit: 1242,
  fee_detail_piship: 1620,
  fee_detail_settlement: 192838,
  fee_raw_data: JSON.stringify(orderS77Raw)
}
const taxonomyS77 = buildOrderFinanceTaxonomy(orderS77)
const snapshotS77 = buildOrderFeePhase1Snapshot(orderS77)
assert.equal(taxonomyS77.gross_revenue, 260900, '260519S77FX1U9 gross_revenue phải là tổng sản phẩm trước voucher sàn')
assert.equal(taxonomyS77.platform_voucher_total, 41744, '260519S77FX1U9 platform_voucher_total lấy từ buyer_payment_info.shopee_voucher')
assert.equal(taxonomyS77.seller_cofunded_voucher_amount, 12524, '260519S77FX1U9 seller cofund lấy từ raw order_income.voucher_from_seller')
assert.equal(taxonomyS77.platform_funded_voucher_amount, 29220, '260519S77FX1U9 platform funded lấy từ raw order_income.voucher_from_shopee')
assert.equal(taxonomyS77.platform_funded_voucher_confidence, 'confirmed', '260519S77FX1U9 platform funded là raw field, không phải bịa')
assert.equal(taxonomyS77.actual_income, 194458, '260519S77FX1U9 actual_income phải cộng ngược PiShip API ra khỏi settlement')
assert.equal(taxonomyS77.piship_fee, 1620, '260519S77FX1U9 PiShip lấy từ API/raw')
assert.equal(taxonomyS77.piship_fee_source_type, 'api', '260519S77FX1U9 PiShip API phải thắng Cost Setting')
assert.equal(snapshotS77.breakdown.totals.settlement_deduction, 12524, 'seller cofunded voucher phải nằm trong Tổng khấu trừ')
assert.equal(snapshotS77.breakdown.totals.total_deductions, 66442, 'Tổng khấu trừ không được cộng platform funded voucher hoặc PiShip ngoài ví')
assert.equal(snapshotS77.profit_real_display, 192838, 'Profit dùng actual_income không được trừ lại seller cofunded voucher')

const returnedWithPositiveSettlement = buildOrderFeePhase1Snapshot({
  platform: 'shopee',
  shop: 'chihuy1984',
  order_id: 'RETURN-POSITIVE-SETTLEMENT',
  order_type: 'return',
  oms_status: 'RETURN',
  shipping_status: 'FAILED_DELIVERY',
  revenue: 65000,
  cost_real: 25000,
  cost_invoice: 25000,
  fee_detail_settlement: 52000,
  fee_source: 'shopee.payment.get_income_detail'
})
assert.equal(returnedWithPositiveSettlement.profit_status, 'return_pending', 'Đơn hoàn/trả không được giữ actual_income_confirmed để hiện lãi xanh')
assert.equal(returnedWithPositiveSettlement.profit_label, 'Chờ hoàn/trả', 'Đơn hoàn/trả phải hiện trạng thái chờ hoàn/trả')
assert.equal(returnedWithPositiveSettlement.profit_real_display, 0, 'Đơn hoàn/trả chưa có phí hoàn confirmed không được hiện lãi dương')

const kpiCards = readFileSync(repoFile('apps/fe/js/dashboard/kpi-card-render.js'), 'utf8')
assert.equal(kpiCards.includes('Tổng Phí Sàn'), false, 'Profit Dashboard không dùng nhãn Tổng Phí Sàn cho bucket rộng')
assert.equal(kpiCards.includes('Voucher của shop'), false, 'Card phí không được nhét Voucher của shop vào Phí sàn')
assert.ok(kpiCards.includes('Điều chỉnh doanh thu (không thuộc Phí sàn)'), 'Dashboard phải tách nhóm voucher khỏi phí sàn')

const omsRender = readFileSync(repoFile('apps/fe/js/modules/oms-render.js'), 'utf8')
const omsFeeRender = readFileSync(repoFile('apps/fe/js/modules/oms-fee-render.js'), 'utf8')
const rebuildCore = readFileSync(repoFile('apps/worker-api/src/routes/order-analytics/order-analytics-rebuild-core.js'), 'utf8')
assert.equal(omsRender.includes('onmouseleave'), false, 'OMS fee popup không được hover-only')
assert.ok(omsRender.includes('data-oms-fee-order'), 'OMS fee popup phải có state theo order')
assert.ok(omsRender.includes('hasFinancePanelData'), 'OMS phải render popup phí cho Lazada/TikTok cả khi khấu trừ tạm tính bằng 0')
assert.ok(omsFeeRender.includes('% tính trên'), 'OMS popup phải ghi rõ basis phần trăm')
assert.ok(omsFeeRender.includes('syncOmsFeePopupAfterRender'), 'OMS re-render phải sync popup đang mở')
assert.ok(rebuildCore.includes('COALESCE(o.fee_ads, 0) AS fee_ads'), 'Finance rebuild phải load ADS theo đơn để profit không rơi về phân bổ ADS sai')

console.log('finance taxonomy guard passed')
