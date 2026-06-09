import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  extractShopeeSellerCenterDetailId,
  normalizeSellerCenterDetailUrl
} from '../apps/worker-api/src/core/orders/status-automation-core.js'
import {
  buildShopeeSellerCenterRawData,
  normalizeShopeeSellerCenterDetailPayload,
  SHOPEE_SELLER_CENTER_DETAIL_JOB,
  SHOPEE_SELLER_CENTER_DETAIL_SOURCE
} from '../apps/worker-api/src/core/orders/shopee-seller-center-detail-core.js'
import { buildOrderFinanceTaxonomy } from '../apps/worker-api/src/core/orders/finance-taxonomy-core.js'
import {
  resolveOrderDataSource,
  sellerCenterFallbackAllowed
} from '../apps/worker-api/src/core/orders/order-data-source-resolver.js'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

assert.equal(extractShopeeSellerCenterDetailId('260519RWS50TA2'), '')
assert.equal(normalizeSellerCenterDetailUrl('260519RWS50TA2'), '')
assert.equal(
  extractShopeeSellerCenterDetailId('https://banhang.shopee.vn/portal/sale/order/232855966247234'),
  '232855966247234'
)
assert.equal(
  normalizeSellerCenterDetailUrl('https://banhang.shopee.vn/portal/sale/order/232855966247234?x=1'),
  'https://banhang.shopee.vn/portal/sale/order/232855966247234'
)

const detail = normalizeShopeeSellerCenterDetailPayload({
  order_sn: '260519RWS50TA2',
  display_order_sn: '260519RWS50TA2',
  seller_center_detail_url: 'https://banhang.shopee.vn/portal/sale/order/232855966247234',
  status: 'Đã giao cho ĐVVC / đơn đang được giao tới người mua',
  tracking_number: 'SPXVN067508201855',
  logistics_provider: 'SPX Express',
  shop: 'khogiadungcona'
})
assert.equal(detail.ok, true)
assert.equal(detail.order_sn, '260519RWS50TA2')
assert.equal(detail.seller_center_detail_id, '232855966247234')
assert.equal(detail.seller_center_detail_url, 'https://banhang.shopee.vn/portal/sale/order/232855966247234')
assert.equal(detail.tracking_number, 'SPXVN067508201855')
assert.equal(detail.logistics_provider, 'SPX Express')
assert.equal(detail.source, undefined)
assert.equal(SHOPEE_SELLER_CENTER_DETAIL_SOURCE, 'shopee_seller_center_detail')
assert.equal(SHOPEE_SELLER_CENTER_DETAIL_JOB, 'shopee_seller_detail')
assert.equal(sellerCenterFallbackAllowed({ platform: 'shopee', shop: 'chihuy2309' }), false)
assert.equal(sellerCenterFallbackAllowed({ platform: 'shopee', shop: 'khogiadungcona' }), true)
assert.equal(resolveOrderDataSource({ platform: 'shopee', shop: 'chihuy2309', last_status_sync_error: 'seller_center_detail_url_not_found' }).source_label, 'API')

const financeCase = normalizeShopeeSellerCenterDetailPayload({
  order_sn: '260520VPM23704',
  display_order_sn: '260520VPM23704',
  seller_center_detail_url: 'https://banhang.shopee.vn/portal/sale/order/232986368285700',
  status: 'Đã giao cho ĐVVC',
  tracking_number: 'SPXVN061855241865',
  logistics_provider: 'SPX Express',
  shop: 'khogiadungcona',
  fields: {
    product_revenue_after_shop_discount: 99000,
    shipping_fee_buyer_paid: 8000,
    platform_voucher_amount: 21780,
    buyer_total_paid: 85220,
    seller_cofunded_voucher_amount: 6534,
    fixed_fee: 12021,
    service_fee: 3000,
    transaction_fee: 6028,
    shipping_fee_estimated: 37600,
    shipping_subsidy_platform: 29600,
    tax_amount: 1387,
    tax_vat: 925,
    tax_pit: 462,
    actual_income: 70030
  },
  tracking_events: [{
    event_time: '14:04 21/05/2026',
    event_status: 'Đơn vị vận chuyển lấy hàng thành công',
    event_text: 'Đơn vị vận chuyển lấy hàng thành công',
    source: 'shopee_seller_center_tracking_expanded'
  }],
  tracking_source: 'shopee_seller_center_tracking_expanded'
})
assert.equal(financeCase.ok, true)
assert.equal(financeCase.finance.product_revenue_after_shop_discount, 99000)
assert.equal(financeCase.finance.buyer_shipping_paid, 8000)
assert.equal(financeCase.finance.platform_voucher_amount, 21780)
assert.equal(financeCase.finance.buyer_total_paid, 85220)
assert.equal(financeCase.finance.seller_cofunded_voucher_amount, 6534)
assert.equal(financeCase.finance.actual_income, 70030)
assert.equal(financeCase.tracking_events.length, 1)
const financeRaw = buildShopeeSellerCenterRawData(financeCase)
const financeTaxonomy = buildOrderFinanceTaxonomy({
  order_id: '260520VPM23704',
  platform: 'shopee',
  revenue: 85220,
  raw_revenue: 99000,
  buyer_shipping_paid: 8000,
  fee_source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
  fee_raw_data: JSON.stringify(financeRaw),
  fee_detail_commission: 12021,
  fee_detail_service: 3000,
  fee_detail_payment: 6028,
  fee_detail_shipping: 8000,
  fee_detail_tax_vat: 925,
  fee_detail_tax_pit: 462,
  fee_detail_settlement: 70030,
  settlement: 70030
}, [{ order_id: '260520VPM23704', revenue_line: 99000 }])
assert.equal(financeTaxonomy.product_revenue_after_shop_discount, 99000)
assert.equal(financeTaxonomy.buyer_shipping_paid, 8000)
assert.equal(financeTaxonomy.platform_voucher_total, 21780)
assert.equal(financeTaxonomy.buyer_total_paid, 85220)
assert.equal(financeTaxonomy.seller_cofunded_voucher_amount, 6534)
assert.equal(financeTaxonomy.marketplace_fee_total, 21049)
assert.equal(financeTaxonomy.tax_total, 1387)
assert.equal(financeTaxonomy.actual_income, 70030)
assert.equal(financeTaxonomy.actual_income_available, true)

const mismatch = normalizeShopeeSellerCenterDetailPayload({
  order_sn: '260519RWS50TA2',
  display_order_sn: '260519WRONG',
  seller_center_detail_url: 'https://banhang.shopee.vn/portal/sale/order/232855966247234'
})
assert.equal(mismatch.ok, false)
assert.equal(mismatch.error, 'order_sn_mismatch')

const missingUrl = normalizeShopeeSellerCenterDetailPayload({
  order_sn: '260519RWS50TA2'
})
assert.equal(missingUrl.ok, false)
assert.equal(missingUrl.error, 'missing_verified_seller_center_detail_url')

const workerCore = readFileSync(repoFile('apps/worker-api/src/core/orders/shopee-seller-center-detail-core.js'), 'utf8')
assert.ok(workerCore.includes('status_touched_24h'), 'Status sync diagnostic phải ghi status_touched_24h')
assert.ok(workerCore.includes('status_changed_count'), 'Status sync diagnostic phải ghi status_changed_count')
assert.ok(workerCore.includes('browser_sync'), 'Seller Center fallback phải ghi source_mode browser_sync')

const workerRoute = readFileSync(repoFile('apps/worker-api/src/routes/orders/shopee-seller-center-detail.js'), 'utf8')
assert.ok(workerRoute.includes('seller_center_detail_url_not_found'), 'Route phải ghi diagnostic khi Seller Center search không ra URL')
assert.ok(workerRoute.includes('last_status_sync_error'), 'Route phải ghi lỗi status sync gần nhất')

const pythonParser = readFileSync('E:/shophuyvan-python-automation/oms_python/platforms/shopee/orders/parser_chitiet.py', 'utf8')
assert.ok(pythonParser.includes('resolve_detail_url_by_search'), 'Parser phải resolve URL bằng search khi chỉ có mã đơn')
assert.ok(!pythonParser.includes('/portal/sale/order/{order_sn}'), 'Không được tự dựng URL detail từ order_sn')

console.log('shopee seller detail core guard passed')
