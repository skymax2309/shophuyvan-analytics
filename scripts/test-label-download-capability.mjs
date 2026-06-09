import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildLabelDownloadCapability } from '../apps/worker-api/src/core/marketplace/shop-capability-core.js'
import { buildOrderLabelState } from '../apps/worker-api/src/core/orders/read-core.js'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

const shopeeApi = buildLabelDownloadCapability({
  platform: 'shopee',
  capability_mode: 'api_active',
  access_token_live: 1,
  refresh_token_live: 1,
  api_shop_id: '170044686'
})
assert.equal(shopeeApi.label_download_mode, 'api_document_generation_then_download')
assert.equal(shopeeApi.label_download_supported, true)
assert.equal(shopeeApi.label_download_read_only, true)
assert.equal(shopeeApi.label_download_requires_manual, false)
assert.equal(shopeeApi.label_download_source, 'shopee_open_platform:logistics.create_shipping_document>get_shipping_document_result>download_shipping_document')
assert.match(shopeeApi.label_download_reason, /create_shipping_document/)
assert.match(shopeeApi.label_download_reason, /không gọi endpoint đổi trạng thái/i)

const shopeeManual = buildLabelDownloadCapability({
  platform: 'shopee',
  capability_mode: 'manual_reference',
  api_shop_id: ''
})
assert.equal(shopeeManual.label_download_supported, false)
assert.equal(shopeeManual.label_download_requires_manual, true)
assert.equal(shopeeManual.label_download_mode, 'manual_required')

const shopeeNoApi = buildLabelDownloadCapability({
  platform: 'shopee',
  capability_mode: 'manual_reference',
  user_name: 'khogiadungcona'
})
assert.equal(shopeeNoApi.label_download_mode, 'local_chrome_retry_label')
assert.equal(shopeeNoApi.label_download_supported, true)
assert.equal(shopeeNoApi.label_download_read_only, true)
assert.equal(shopeeNoApi.label_download_requires_manual, false)

const lazadaApi = buildLabelDownloadCapability({
  platform: 'lazada',
  capability_mode: 'api_active',
  access_token_live: 1,
  refresh_token_live: 0,
  api_shop_id: 'lazada-shop'
})
assert.equal(lazadaApi.label_download_mode, 'api_print_awb_read_only')
assert.equal(lazadaApi.label_download_supported, true)
assert.equal(lazadaApi.label_download_read_only, true)
assert.equal(lazadaApi.label_download_source, 'lazada_fulfillment:order.package.document.get')

const tiktok = buildLabelDownloadCapability({
  platform: 'tiktok',
  capability_mode: 'api_active',
  access_token_live: 1,
  api_shop_id: '0909128999'
})
assert.equal(tiktok.label_download_mode, 'local_chrome_retry_label')
assert.equal(tiktok.label_download_supported, true)
assert.equal(tiktok.label_download_read_only, true)
assert.equal(tiktok.label_download_requires_manual, false)
assert.equal(tiktok.label_download_source, 'local_python_chrome:platforms/tiktok/orders/taitem.py')

const explicitBlocked = buildOrderLabelState({
  order_id: 'TT-01',
  platform: 'tiktok',
  shipping_status: 'SHIPPED',
  label_download_mode: tiktok.label_download_mode,
  label_download_supported: tiktok.label_download_supported,
  label_download_source: tiktok.label_download_source,
  label_download_reason: tiktok.label_download_reason,
  label_download_read_only: tiktok.label_download_read_only,
  label_download_requires_manual: tiktok.label_download_requires_manual
})
assert.equal(explicitBlocked.label_status, 'eligible')
assert.equal(explicitBlocked.label_download_supported, true)
assert.equal(explicitBlocked.label_download_read_only, true)
assert.match(explicitBlocked.label_reason, /Đơn đủ điều kiện/)

const explicitReady = buildOrderLabelState({
  order_id: 'SPX-01',
  platform: 'shopee',
  shipping_status: 'LOGISTICS_PACKAGED',
  tracking_number: 'SPXVN001',
  ...shopeeApi
})
assert.equal(explicitReady.label_status, 'eligible')
assert.equal(explicitReady.label_eligible, true)
assert.equal(explicitReady.label_download_read_only, true)

const shopeeNotReady = buildOrderLabelState({
  order_id: 'SPX-02',
  platform: 'shopee',
  shipping_status: 'LOGISTICS_PENDING_ARRANGE',
  ...shopeeApi
})
assert.equal(shopeeNotReady.label_status, 'not_ready')
assert.equal(shopeeNotReady.label_eligible, false)

const labelsRoute = readFileSync(repoFile('apps/worker-api/src/routes/labels/index.js'), 'utf8')
assert.ok(labelsRoute.includes('/api/v2/logistics/create_shipping_document'), 'Route Shopee API phải có endpoint tạo chứng từ in chính thức')
assert.ok(labelsRoute.includes('/api/v2/logistics/get_shipping_document_result'), 'Route Shopee API phải poll trạng thái chứng từ in chính thức')
assert.ok(labelsRoute.includes('allowDocumentGenerate: true'), 'Flow tạo chứng từ in phải có guard allowDocumentGenerate')
assert.ok(labelsRoute.includes('allowFulfillmentAction: false'), 'Flow tải tem phải khóa fulfillment action')
assert.ok(!labelsRoute.includes('allowCreate'), 'Route chuẩn không được để lại cờ mở nhánh create_shipping_document')
assert.ok(!labelsRoute.includes('/api/v2/logistics/ship_order'), 'Route tải tem không được gọi ship_order')
assert.ok(labelsRoute.includes('options.dryRun'), 'Route refresh tem phải hỗ trợ dry-run capability')
assert.ok(labelsRoute.includes('label_download_order_not_eligible'), 'Route chuẩn phải chặn đơn chưa đủ trạng thái tải tem')
assert.ok(labelsRoute.includes('backfillEligibleLabels'), 'Phải có runner backfill tự tải tem eligible')
assert.ok(labelsRoute.includes('retry-failed'), 'Phải có route retry tem lỗi theo ngày/shop/sàn')
assert.ok(labelsRoute.includes('labelStatuses'), 'Backfill tem phải nhận bộ lọc trạng thái tem')
assert.ok(labelsRoute.includes('retry_from_status'), 'Backfill tem phải trace trạng thái lỗi trước khi retry')
assert.ok(labelsRoute.includes('queueLocalLabelRetryJob'), 'Backfill tem no-API phải queue retry_label cho runner Chrome cố định')
assert.ok(labelsRoute.includes('skipped_details'), 'Backfill tem phải tách dòng bị bỏ qua khỏi bảng đủ điều kiện')
assert.ok(labelsRoute.includes('already_downloaded'), 'Backfill tem phải đếm riêng đơn đã tải tem')
assert.ok(labelsRoute.includes("skipped_reason: 'already_downloaded'"), 'Downloaded không được nằm trong bảng chính khi force=false')
assert.ok(labelsRoute.includes('LABEL_BACKFILL_MAX_LIMIT = 50'), 'Backfill tem phải cho phép batch 10/20/50 ở UI')
assert.ok(labelsRoute.includes('auto-label:'), 'Runner backfill phải ghi nguồn auto-label khi manual_required')
assert.ok(labelsRoute.includes('LABEL_BACKFILL_MAX_SUBREQUESTS'), 'Backfill tải tem phải có guard giới hạn subrequest')
assert.equal(existsSync(repoFile('apps/fe/js/modules/handler-shopee.js')), false, 'Không giữ helper Shopee tự dựng Seller Center URL từ id/order_sn')

const fileRoutes = readFileSync(repoFile('apps/worker-api/src/worker-router/file-routes.js'), 'utf8')
assert.ok(fileRoutes.includes('/api/labels/refresh/'), 'Legacy route phải còn guard 410')
assert.ok(fileRoutes.includes('legacy_label_refresh_route_disabled'), 'Legacy route phải trả mã lỗi 410 rõ ràng')
assert.ok(fileRoutes.includes('/api/label/backfill-eligible'), 'Route backfill eligible phải được đăng ký')
assert.ok(fileRoutes.includes('/api/label/retry-failed'), 'Route retry tem lỗi phải được đăng ký')

const orderRoutes = readFileSync(repoFile('apps/worker-api/src/worker-router/order-routes.js'), 'utf8')
assert.ok(orderRoutes.includes('refreshOrderLabel'), 'Bulk packed phải gọi route tải tem read-only khi đủ điều kiện')
assert.ok(!orderRoutes.includes('chưa tự tải tem thật'), 'Không được để trạng thái auto label chỉ dry-run')

console.log('label download capability guard passed')
