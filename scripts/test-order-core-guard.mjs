import assert from 'node:assert/strict'

import {
  buildOrderLabelState,
  normalizeOrderListRowForCore,
  normalizeOrderReadModel,
  orderCoreSourceMeta
} from '../apps/worker-api/src/core/orders/read-core.js'
import { mapMarketplaceOrderStatus } from '../apps/worker-api/src/core/orders/status-core.js'

const pendingOrder = normalizeOrderReadModel({
  order_id: '260518QJM5HP6U',
  platform: 'Shopee',
  shop: 'chihuy1984',
  order_type: 'normal',
  oms_status: 'PENDING',
  shipping_status: 'LOGISTICS_PENDING_ARRANGE',
  source_mode: 'api_sync',
  source_updated_at: '2026-05-18 10:00:00',
  last_status_sync_at: '2026-05-18 10:05:00',
  status_source: 'shopee_open_platform_api'
})
assert.equal(pendingOrder.platform_order_id, '260518QJM5HP6U')
assert.equal(pendingOrder.platform, 'shopee')
assert.equal(pendingOrder.order_type, 'normal')
assert.equal(pendingOrder.status_parent, 'WAIT_PICKUP')
assert.equal(pendingOrder.raw_platform_status, 'LOGISTICS_PENDING_ARRANGE')
assert.equal(pendingOrder.order_status_core, 'WAIT_PICKUP')
assert.equal(pendingOrder.fulfillment_status_core, 'LOGISTICS_PENDING_ARRANGE')
assert.equal(pendingOrder.display_status_vi, 'Chờ lấy hàng')
assert.equal(pendingOrder.terminal_status, false)
assert.equal(pendingOrder.label_status, 'not_ready')
assert.equal(pendingOrder.badge, 'API')
assert.equal(pendingOrder.raw_source.order_table, 'orders_v2')
assert.ok(pendingOrder.status_label_vi)
assert.equal(pendingOrder.status_source, 'shopee_open_platform_api')
assert.equal(pendingOrder.order_status_detail.automation.last_status_sync_at, '2026-05-18 10:05:00')

const returnOrder = normalizeOrderReadModel({
  order_id: '260518RETURN01',
  order_type: 'normal',
  oms_status: 'PENDING',
  shipping_status: 'FAILED_DELIVERY',
  source_mode: 'orders_v2_snapshot'
})
assert.equal(returnOrder.order_type, 'return')
assert.equal(returnOrder.status_parent, 'FAILED_DELIVERY')
assert.equal(returnOrder.order_status_core, 'FAILED_DELIVERY')
assert.equal(returnOrder.display_status_vi, 'Giao thất bại')
assert.equal(returnOrder.status_kind, 'failed')
assert.equal(returnOrder.badge, 'Snapshot')

const completedReturnOrder = normalizeOrderReadModel({
  order_id: '260518RETURN45',
  platform: 'Shopee',
  shop: 'chihuy1984',
  order_type: 'return',
  oms_status: 'COMPLETED',
  shipping_status: 'COMPLETED',
  source_mode: 'orders_v2_snapshot'
})
assert.equal(completedReturnOrder.order_type, 'return')
assert.equal(completedReturnOrder.order_status_core, 'RETURN')
assert.equal(completedReturnOrder.display_status_vi, 'Hoàn / trả')
assert.equal(completedReturnOrder.terminal_status, true)
assert.match(completedReturnOrder.status_reason, /order_type=return/)

const cancelledOrder = normalizeOrderListRowForCore({
  order_id: '260518CANCEL01',
  order_type: 'normal',
  oms_status: 'CANCELLED',
  shipping_status: 'CANCELLED',
  revenue: 0
}, { itemTable: 'order_items' })
assert.equal(cancelledOrder.order_type, 'cancel')
assert.equal(cancelledOrder.status_parent, 'CANCELLED')
assert.equal(cancelledOrder.raw_source.item_table, 'order_items')

const feeSource = orderCoreSourceMeta({
  order_id: '260518FEE01',
  source_mode: '',
  order_date: '2026-05-18'
}, {
  source: 'shopee_payment_api',
  updated_at: '2026-05-18 12:00:00'
})
assert.equal(feeSource.badge, 'API')
assert.equal(feeSource.confidence, 'confirmed')

function normalizeMapped(platform, rawStatus, details = {}, extra = {}) {
  const mapped = mapMarketplaceOrderStatus(platform, rawStatus, details)
  return normalizeOrderReadModel({
    order_id: `${platform}-${rawStatus}`,
    platform,
    order_type: mapped.type,
    oms_status: mapped.oms,
    shipping_status: mapped.shipping,
    tracking_number: details.tracking || details.tracking_number || '',
    source_mode: 'api_sync',
    ...extra
  })
}

const shopeeReadyLabel = normalizeMapped('shopee', 'PROCESSED', { tracking: 'SPXVN001' }, {
  label_api_connected: 1
})
assert.equal(shopeeReadyLabel.order_status_core, 'READY_TO_SHIP')
assert.equal(shopeeReadyLabel.fulfillment_status_core, 'LOGISTICS_PACKAGED')
assert.equal(shopeeReadyLabel.display_status_vi, 'Đã xử lý / sẵn sàng giao')
assert.equal(shopeeReadyLabel.label_eligible, true)
assert.equal(shopeeReadyLabel.label_status, 'eligible')

const shopeeSellerCenterShipping = normalizeMapped('shopee', 'Đã giao cho ĐVVC', { tracking: 'SPXVN067508201855' }, {
  label_api_connected: 1,
  status_source: 'shopee_seller_center_detail'
})
assert.equal(shopeeSellerCenterShipping.order_status_core, 'SHIPPING')
assert.equal(shopeeSellerCenterShipping.fulfillment_status_core, 'SHIPPED')
assert.equal(shopeeSellerCenterShipping.display_status_vi, 'Đang giao')
assert.equal(shopeeSellerCenterShipping.label_eligible, true)

const shopeeSellerCenterDelivered = normalizeMapped('shopee', 'ĐÃ GIAO', {
  logisticsStatus: 'ĐÃ GIAO',
  tracking: 'VN261240371119W'
}, {
  status_source: 'shopee_seller_center_detail'
})
assert.equal(shopeeSellerCenterDelivered.order_status_core, 'COMPLETED')
assert.equal(shopeeSellerCenterDelivered.fulfillment_status_core, 'COMPLETED')
assert.equal(shopeeSellerCenterDelivered.display_status_vi, 'Đã giao')

const shopeeSellerCenterWaitPickup = normalizeMapped('shopee', 'CHỜ LẤY HÀNG', {
  logisticsStatus: 'CHỜ LẤY HÀNG'
}, {
  status_source: 'shopee_seller_center_detail'
})
assert.equal(shopeeSellerCenterWaitPickup.order_status_core, 'WAIT_PICKUP')
assert.equal(shopeeSellerCenterWaitPickup.fulfillment_status_core, 'LOGISTICS_REQUEST_CREATED')
assert.equal(shopeeSellerCenterWaitPickup.display_status_vi, 'Chờ lấy hàng')

const tiktokShippingLabel = normalizeMapped('tiktok', 'SHIPPED', {}, {
  label_api_connected: 1
})
assert.equal(tiktokShippingLabel.order_status_core, 'SHIPPING')
assert.equal(tiktokShippingLabel.display_status_vi, 'Đang giao')
assert.equal(tiktokShippingLabel.label_eligible, false)
assert.equal(tiktokShippingLabel.label_status, 'manual_required')

const lazadaShippingLabel = normalizeMapped('lazada', 'shipped', {}, {
  label_api_connected: 1
})
assert.equal(lazadaShippingLabel.order_status_core, 'SHIPPING')
assert.equal(lazadaShippingLabel.display_status_vi, 'Đang giao')
assert.equal(lazadaShippingLabel.label_eligible, true)
assert.equal(lazadaShippingLabel.label_status, 'eligible')

const unknownStatus = normalizeMapped('shopee', 'NEW_STATUS_FROM_PLATFORM', {}, {
  label_api_connected: 1
})
assert.equal(unknownStatus.order_status_core, 'UNKNOWN')
assert.equal(unknownStatus.display_status_vi, 'Lỗi / cần kiểm tra')
assert.equal(unknownStatus.label_eligible, false)
assert.equal(unknownStatus.label_status, 'not_ready')

assert.equal(buildOrderLabelState({
  order_id: 'DL01',
  platform: 'shopee',
  shipping_status: 'LOGISTICS_PACKAGED',
  tracking_number: 'SPXVN-DL01',
  label_file_path: 'labels/DL01.pdf'
}).label_status, 'downloaded')
assert.equal(buildOrderLabelState({
  order_id: 'DL-NO-TRACKING',
  platform: 'shopee',
  shipping_status: 'LOGISTICS_PACKAGED',
  label_file_path: 'labels/DL-NO-TRACKING.pdf'
}).label_status, 'missing')
assert.equal(buildOrderLabelState({
  order_id: 'ERR01',
  platform: 'shopee',
  shipping_status: 'LOGISTICS_PACKAGED',
  last_label_error: 'api_error'
}).label_status, 'error')
assert.equal(buildOrderLabelState({
  order_id: 'NS01',
  platform: 'facebook',
  shipping_status: 'LOGISTICS_PACKAGED'
}).label_status, 'not_supported')
assert.equal(buildOrderLabelState({
  order_id: 'NR01',
  platform: 'shopee',
  shipping_status: 'PENDING',
  label_api_connected: 1
}).label_status, 'not_ready')
assert.equal(buildOrderLabelState({
  order_id: 'MR01',
  platform: 'shopee',
  shipping_status: 'LOGISTICS_PACKAGED',
  label_api_connected: 0
}).label_status, 'manual_required')
assert.equal(buildOrderLabelState({
  order_id: 'EL01',
  platform: 'lazada',
  shipping_status: 'SHIPPED',
  label_api_connected: 1
}).label_status, 'eligible')

console.log('order core guard tests passed')
