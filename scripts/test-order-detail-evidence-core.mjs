import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(file, needle, label = needle) {
  const text = read(file)
  if (!text.includes(needle)) {
    throw new Error(`${file} missing ${label}`)
  }
}

function assertNotInOptionalFields(file, forbidden) {
  const text = read(file)
  const matches = [...text.matchAll(/response_optional_fields:\s*'([^']*)'/g)]
  for (const match of matches) {
    if (match[1].split(',').map(item => item.trim()).includes(forbidden)) {
      throw new Error(`${file} should not request ${forbidden} in response_optional_fields`)
    }
  }
}

// Kiểm tra khóa tĩnh để tránh tách nhầm nguồn API sang UI hoặc Seller Center fallback.
assertIncludes('apps/worker-api/src/core/orders/transport-core.js', "'payment_method'")
assertIncludes('apps/worker-api/src/core/orders/transport-core.js', "'payment_time'")
assertIncludes('apps/worker-api/src/core/orders/transport-core.js', "'customer_note'")
assertIncludes('apps/worker-api/src/routes/orders/import-orders-v2.js', 'payment_method_source')
assertIncludes('apps/worker-api/src/routes/orders/import-orders-v2.js', 'payment_time_source')
assertIncludes('apps/worker-api/src/routes/orders/import-orders-v2.js', 'customer_note_source')

assertIncludes('apps/worker-api/src/routes/api-sync/shopee/orders/sync.js', '/api/v2/logistics/get_tracking_info')
assertIncludes('apps/worker-api/src/routes/api-sync/shopee/orders/sync.js', 'shopeePaymentMethod')
assertIncludes('apps/worker-api/src/routes/api-sync/shopee/orders/sync.js', 'shopeeCustomerNote')
assertIncludes('apps/worker-api/src/routes/api-sync/shopee/orders/sync.js', 'shopee_open_platform:/api/v2/order/get_order_detail.payment_method')
assertIncludes('apps/worker-api/src/routes/api-sync/shopee/orders/sync.js', 'shopee_open_platform:/api/v2/order/get_order_detail.pay_time')
assertNotInOptionalFields('apps/worker-api/src/routes/api-sync/shopee/orders/sync.js', 'message_to_seller')

assertIncludes('apps/worker-api/src/routes/api-sync/lazada/orders/sync.js', '/logistic/order/trace')
assertIncludes('apps/worker-api/src/routes/api-sync/lazada/orders/sync.js', 'ofcPackageIdList')
assertIncludes('apps/worker-api/src/routes/api-sync/lazada/orders/sync.js', 'lazada_open_platform:/orders/get')
assertIncludes('apps/worker-api/src/routes/api-sync/lazada/orders/sync.js', 'lazada_open_platform:/logistic/order/trace')
assertIncludes('apps/worker-api/src/routes/api-sync/common/shop-auth.js', 'ofcPackageIdList')

assertIncludes('apps/worker-api/src/routes/operations/carrier-analytics.js', 'logistic_detail_info_list')
assertIncludes('apps/worker-api/src/routes/operations/carrier-analytics.js', 'package_detail_info_list')
assertIncludes('apps/worker-api/src/routes/logistics/index.js', 'handleTrackingDetail')
assertIncludes('apps/worker-api/src/worker-router/primary-routes.js', '/api/logistics-watch/detail')
assertIncludes('apps/worker-api/src/routes/logistics/index.js', 'payment_method')
assertIncludes('apps/worker-api/src/routes/logistics/index.js', 'payment_time')
assertIncludes('apps/worker-api/src/routes/logistics/index.js', 'customer_note')

assertIncludes('apps/fe/js/modules/oms-logistics-watch.js', 'Thanh toán')
assertIncludes('apps/fe/js/modules/oms-logistics-watch.js', 'Ghi chú khách')
assertIncludes('apps/fe/js/dashboard/chat/context.js', '/api/logistics-watch/detail')
assertIncludes('apps/fe/js/dashboard/chat/detail-panels.js', 'open-order-timeline')

console.log('order detail evidence core guard passed')
