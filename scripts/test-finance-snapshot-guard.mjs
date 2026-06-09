import assert from 'node:assert/strict'

import { summarizeFinanceSnapshotHealth } from '../apps/worker-api/src/core/orders/finance-core.js'
import { FINANCE_CORE_CALC_VERSION } from '../apps/worker-api/src/core/orders/analytics-shared-core.js'
import { mergeShopBreakdownWithFinanceCore } from '../apps/worker-api/src/routes/dashboard/index.js'

function moneySum(rows, field) {
  return Math.round(rows.reduce((sum, row) => sum + Number(row[field] || 0), 0))
}

const shopStatusRows20260518 = [
  { platform: 'shopee', shop: 'chihuy1984', shop_total_orders: 36, shop_success_orders: 33, shop_cancel_orders: 3, shop_revenue: 3393409 },
  { platform: 'shopee', shop: '0909128999', shop_total_orders: 13, shop_success_orders: 13, shop_cancel_orders: 0, shop_revenue: 1330000 },
  { platform: 'shopee', shop: 'chihuy2309', shop_total_orders: 11, shop_success_orders: 10, shop_cancel_orders: 1, shop_revenue: 961340 },
  { platform: 'shopee', shop: 'phambich2312', shop_total_orders: 6, shop_success_orders: 6, shop_cancel_orders: 0, shop_revenue: 929394 },
  { platform: 'shopee', shop: 'kinhdoanhonlinegiasoc@gmail.com', shop_total_orders: 4, shop_success_orders: 4, shop_cancel_orders: 0, shop_revenue: 338000 },
  { platform: 'manual', shop: 'khogiadungcona', shop_total_orders: 1, shop_success_orders: 1, shop_cancel_orders: 0, shop_revenue: 58500 }
]

const financeCoreByShop20260518 = [
  { platform: 'shopee', shop: 'chihuy1984', orders: 33, gross_revenue: 3680824, actual_income: 2814146, estimated_orders: 19 },
  { platform: 'shopee', shop: '0909128999', orders: 13, gross_revenue: 1330000, actual_income: 1330000, estimated_orders: 0 },
  { platform: 'shopee', shop: 'chihuy2309', orders: 10, gross_revenue: 1104900, actual_income: 818164, estimated_orders: 0 },
  { platform: 'shopee', shop: 'phambich2312', orders: 6, gross_revenue: 1002000, actual_income: 769704, estimated_orders: 0 },
  { platform: 'shopee', shop: 'kinhdoanhonlinegiasoc@gmail.com', orders: 4, gross_revenue: 338000, actual_income: 338000, estimated_orders: 0 },
  { platform: 'manual', shop: 'khogiadungcona', orders: 1, gross_revenue: 58500, actual_income: 58500, estimated_orders: 0 }
]

const healthy = summarizeFinanceSnapshotHealth({
  analytics_rows: 68,
  source_normal_orders: 68,
  daily_snapshot_rows: 6
})
assert.equal(healthy.current_calc_version, FINANCE_CORE_CALC_VERSION)
assert.equal(healthy.is_stale, false)

const missingVersion = summarizeFinanceSnapshotHealth({
  analytics_rows: 68,
  source_normal_orders: 68,
  missing_calc_version_rows: 68
})
assert.equal(missingVersion.is_stale, true)
assert.ok(missingVersion.stale_reasons.includes('missing_calc_version'))

const formulaMismatch = summarizeFinanceSnapshotHealth({
  analytics_rows: 68,
  source_normal_orders: 68,
  revenue_formula_mismatch_orders: 3,
  revenue_formula_mismatch_delta: 6443876
})
assert.equal(formulaMismatch.is_stale, true)
assert.ok(formulaMismatch.stale_reasons.includes('revenue_formula_mismatch'))

const mergedFromCore = mergeShopBreakdownWithFinanceCore(shopStatusRows20260518, {
  status: 'ok',
  by_shop: financeCoreByShop20260518
})
assert.equal(moneySum(mergedFromCore, 'shop_revenue'), 7514224)
assert.notEqual(moneySum(mergedFromCore, 'shop_revenue'), 13994100)
assert.equal(mergedFromCore.find(row => row.shop === 'chihuy1984')?.shop_import_revenue, 3393409)
assert.equal(mergedFromCore.find(row => row.shop === 'chihuy1984')?.shop_revenue_source, 'order_finance_core')

const mergedFromFallback = mergeShopBreakdownWithFinanceCore(shopStatusRows20260518, {
  status: 'stale',
  by_shop: [
    { platform: 'shopee', shop: 'chihuy1984', orders: 32, gross_revenue: 10124700 },
    { platform: 'shopee', shop: '0909128999', orders: 13, gross_revenue: 1330000 },
    { platform: 'shopee', shop: 'chihuy2309', orders: 11, gross_revenue: 1140900 },
    { platform: 'shopee', shop: 'phambich2312', orders: 6, gross_revenue: 1002000 },
    { platform: 'shopee', shop: 'kinhdoanhonlinegiasoc@gmail.com', orders: 4, gross_revenue: 338000 },
    { platform: 'manual', shop: 'khogiadungcona', orders: 1, gross_revenue: 58500 }
  ]
})
assert.equal(moneySum(mergedFromFallback, 'shop_revenue'), 7010643)
assert.notEqual(moneySum(mergedFromFallback, 'shop_revenue'), 13994100)
assert.equal(mergedFromFallback.find(row => row.shop === 'chihuy1984')?.shop_revenue_source, 'orders_v2_status_core')

console.log('finance snapshot guard tests passed')
