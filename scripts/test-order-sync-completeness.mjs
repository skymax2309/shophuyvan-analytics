import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildOrderLabelState, buildOrderModuleSyncState, buildOrderSyncCompleteness, normalizeOrderReadModel } from '../apps/worker-api/src/core/orders/read-core.js'
import { resolveOrderDataSource } from '../apps/worker-api/src/core/orders/order-data-source-resolver.js'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

const shopeeApiLabel = {
  label_download_mode: 'api_document_generation_then_download',
  label_download_supported: true,
  label_download_read_only: true,
  label_download_requires_manual: false
}

const apiReady = {
  platform: 'shopee',
  shop: 'chihuy2309',
  order_id: 'SYNC-OK',
  shipping_status: 'SHIPPED',
  tracking_number: 'SPXVN001',
  label_file_path: 'labels/SYNC-OK.pdf',
  fee_source: 'shopee.payment.get_escrow_detail',
  actual_income_available: true,
  ...shopeeApiLabel
}
assert.equal(buildOrderSyncCompleteness(apiReady, resolveOrderDataSource(apiReady), buildOrderLabelState(apiReady)).status, 'synced')

const labelError = {
  ...apiReady,
  order_id: 'SYNC-LABEL-ERR',
  label_file_path: '',
  last_label_error: 'pending_retry'
}
const labelErrorState = buildOrderLabelState(labelError)
const labelErrorCompleteness = buildOrderSyncCompleteness(labelError, resolveOrderDataSource(labelError), labelErrorState)
assert.equal(labelErrorCompleteness.status, 'missing_label')
assert.match(labelErrorCompleteness.label, /tem/i)

const labelGenerating = {
  ...apiReady,
  order_id: 'SYNC-LABEL-GENERATING',
  label_file_path: '',
  last_label_error: 'pending_document_generation'
}
const generatingCompleteness = buildOrderSyncCompleteness(labelGenerating, resolveOrderDataSource(labelGenerating), buildOrderLabelState(labelGenerating))
assert.equal(generatingCompleteness.label, 'Đang tạo chứng từ in')
assert.equal(generatingCompleteness.tone, 'warn')

const shopeeApiNoLabelNoTracking = normalizeOrderReadModel({
  platform: 'shopee',
  source_mode: 'api',
  shop: 'chihuy2309',
  order_id: 'SHOPEE-NO-LABEL-TRACKING',
  raw_platform_status: 'READY_TO_SHIP',
  shipping_status: 'LOGISTICS_REQUEST_CREATED',
  shipping_carrier: 'SPX Express',
  tracking_number: '',
  label_file_path: '',
  last_label_error: 'pending_document_generation',
  fee_source: 'shopee.payment.get_escrow_detail',
  actual_income_available: true,
  ...shopeeApiLabel
})
assert.equal(shopeeApiNoLabelNoTracking.oms_processing_bucket, 'unprocessed')
assert.equal(shopeeApiNoLabelNoTracking.operation_sync_status, 'pending_label')
assert.equal(shopeeApiNoLabelNoTracking.label_sync_status, 'pending_document_generation')
assert.equal(shopeeApiNoLabelNoTracking.tracking_sync_status, 'missing')
assert.equal(shopeeApiNoLabelNoTracking.left_nav_group, 'Chờ Xử Lý')
assert.equal(shopeeApiNoLabelNoTracking.left_nav_subgroup, 'Chưa Xử Lý')

const shopeeApiTrackingNoLabel = normalizeOrderReadModel({
  ...shopeeApiNoLabelNoTracking,
  order_id: 'SHOPEE-TRACKING-NO-LABEL',
  tracking_number: 'SPXVNTRACKED',
  tracking_core_tracking_number: 'SPXVNTRACKED'
})
assert.equal(shopeeApiTrackingNoLabel.tracking_sync_status, 'complete')
assert.equal(shopeeApiTrackingNoLabel.operation_sync_status, 'waiting_label_file')
assert.equal(shopeeApiTrackingNoLabel.oms_processing_bucket, 'waiting_label')
assert.equal(shopeeApiTrackingNoLabel.left_nav_subgroup, 'Chờ Tem In')

const missingFinance = {
  ...apiReady,
  order_id: 'SYNC-FINANCE',
  fee_source: '',
  actual_income_available: false,
  settlement_status: 'estimated_no_payment_sync'
}
const missingFinanceCompleteness = buildOrderSyncCompleteness(missingFinance, resolveOrderDataSource(missingFinance), buildOrderLabelState(missingFinance))
assert.equal(missingFinanceCompleteness.status, 'missing_finance')
assert.equal(missingFinanceCompleteness.label, 'Thiếu dữ liệu tài chính')

const trackingFromCore = {
  ...apiReady,
  order_id: 'SYNC-TRACKING-CORE',
  tracking_number: '',
  tracking_core_tracking_number: 'SPXVNCORE001',
  tracking_events_json: JSON.stringify([{ status: 'IN_TRANSIT', description: 'Đang giao' }])
}
const trackingCompleteness = buildOrderSyncCompleteness(trackingFromCore, resolveOrderDataSource(trackingFromCore), buildOrderLabelState(trackingFromCore))
assert.notEqual(trackingCompleteness.status, 'missing_tracking', 'Có tracking/timeline từ Tracking Core thì row không được báo thiếu tracking')

const apiShopStaleSellerCenter = {
  ...apiReady,
  order_id: 'SYNC-STALE-SC',
  source_mode: 'browser_sync',
  last_status_sync_error: 'seller_center_detail_url_not_found'
}
const staleCompleteness = buildOrderSyncCompleteness(apiShopStaleSellerCenter, resolveOrderDataSource(apiShopStaleSellerCenter), buildOrderLabelState(apiShopStaleSellerCenter))
assert.notEqual(staleCompleteness.status, 'error', 'Lỗi Seller Center cũ trên shop API phải bị bỏ qua khỏi completeness')
assert.notEqual(staleCompleteness.status, 'seller_center_detail_missing', 'Shop API không được quay lại Seller Center fallback')

const tiktokPending = {
  platform: 'tiktok',
  shop: '0909128999',
  order_id: 'TT-PENDING',
  shipping_status: 'SHIPPED',
  tracking_number: 'TT123',
  settlement_status: 'pending_settlement',
  actual_income_available: false,
  label_file_path: 'labels/TT-PENDING.pdf'
}
const tiktokCompleteness = buildOrderSyncCompleteness(tiktokPending, resolveOrderDataSource(tiktokPending), buildOrderLabelState(tiktokPending))
assert.equal(tiktokCompleteness.status, 'pending_settlement')
assert.equal(buildOrderModuleSyncState(tiktokPending).finance_sync_status, 'pending_settlement')
assert.equal(buildOrderModuleSyncState(tiktokPending).finance_needs_resync, true)

const tiktokFinanceTransactionPending = {
  ...tiktokPending,
  order_id: 'TT-FINANCE-TX-PENDING',
  finance_source: 'tiktok_seller_center_finance_transaction',
  estimated_income: 67755,
  settlement_status: 'pending_settlement'
}
assert.equal(buildOrderModuleSyncState(tiktokFinanceTransactionPending).finance_sync_status, 'pending_settlement')
assert.equal(buildOrderModuleSyncState(tiktokFinanceTransactionPending).finance_needs_resync, true)

const tiktokCostSetting = {
  platform: 'tiktok',
  shop: '0909128999',
  order_id: 'TT-COST-SETTING',
  shipping_status: 'COMPLETED',
  tracking_number: 'TT-COST',
  fee_display_badge: 'Khấu trừ cost setting',
  finance_source: 'cost_setting_fallback',
  estimated_income_source: 'cost_setting_estimate',
  actual_income_available: false,
  label_file_path: 'labels/TT-COST-SETTING.pdf'
}
const tiktokCostSettingModel = normalizeOrderReadModel(tiktokCostSetting)
assert.equal(tiktokCostSettingModel.finance_sync_status, 'fallback_only')
assert.equal(tiktokCostSettingModel.finance_needs_resync, true)
assert.equal(tiktokCostSettingModel.order_sync_completeness.status, 'missing_finance')
assert.equal(tiktokCostSettingModel.operation_sync_status, 'complete')
assert.equal(tiktokCompleteness.label, 'Chờ ví TikTok')

const noApiShopeeMissingDetail = {
  platform: 'shopee',
  shop: 'khogiadungcona',
  order_id: 'SC-MISSING',
  shipping_status: 'SHIPPED',
  tracking_number: 'SPXVN002',
  seller_center_detail_url: ''
}
const sellerCenterCompleteness = buildOrderSyncCompleteness(noApiShopeeMissingDetail, resolveOrderDataSource(noApiShopeeMissingDetail), buildOrderLabelState(noApiShopeeMissingDetail))
assert.equal(sellerCenterCompleteness.status, 'seller_center_detail_missing')
assert.equal(sellerCenterCompleteness.label, 'Cần đồng bộ Seller Center')

const readRouteSource = readFileSync(repoFile('apps/worker-api/src/routes/orders/read-update-webhook.js'), 'utf8')
assert.ok(readRouteSource.includes('const { fee_raw_data, ...coreRowForOms } = coreRow'), '/api/orders phải cắt raw Payment payload khỏi response OMS')
assert.ok(readRouteSource.includes('LIMIT ${limit} OFFSET ${offset}'), '/api/orders vẫn giữ limit/page nhưng không trả raw payload nặng')

const omsMainSource = readFileSync(repoFile('apps/fe/js/oms-dashboard/oms-main.js'), 'utf8')
const omsRenderSource = readFileSync(repoFile('apps/fe/js/modules/oms-render.js'), 'utf8')
assert.ok(omsMainSource.includes('oms_last_good_orders_state'), 'OMS phải lưu last-good orders để fetch lỗi không reset bảng/counts về 0')
assert.ok(omsMainSource.includes('Đang giữ dữ liệu lần trước'), 'OMS fetch lỗi phải hiện banner giữ dữ liệu lần trước')
assert.ok(omsRenderSource.includes('oms_last_good_badges'), 'OMS phải lưu last-good badges để sidebar không reset về 0 khi badges fetch lỗi')

console.log('order sync completeness guard passed')
