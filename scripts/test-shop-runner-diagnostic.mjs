import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildOrderRunnerDiagnostic } from '../apps/worker-api/src/core/marketplace/shop-capability-core.js'

const shopeeApi = buildOrderRunnerDiagnostic({
  platform: 'shopee',
  capability_mode: 'api_active',
  order_sync_mode: 'api_sync'
})
assert.equal(shopeeApi.order_runner_type, 'worker_cron_api')
assert.equal(shopeeApi.order_runner_running_source, 'apps/worker-api/src/index.js scheduled handler + wrangler.toml')
assert.equal(shopeeApi.order_runner_running, 1)
assert.equal(shopeeApi.order_runner_schedule, '*/5 * * * *')

const lazadaApi = buildOrderRunnerDiagnostic({
  platform: 'lazada',
  capability_mode: 'api_active',
  order_sync_mode: 'api_sync'
})
assert.equal(lazadaApi.order_runner_type, 'worker_cron_api')
assert.equal(lazadaApi.order_runner_scope, 'shopee,lazada')

const tiktokManual = buildOrderRunnerDiagnostic({
  platform: 'tiktok',
  capability_mode: 'manual_reference',
  order_sync_mode: 'manual_reference'
})
assert.equal(tiktokManual.order_runner_type, 'local_tiktok_automation_runner')
assert.equal(tiktokManual.order_runner_running_source, 'local_helper_health')
assert.match(tiktokManual.order_runner_missing_message, /profile automation riêng/)

const browserFallback = buildOrderRunnerDiagnostic({
  platform: 'shopee',
  capability_mode: 'browser_reference',
  order_sync_mode: 'browser_sync'
})
assert.equal(browserFallback.order_runner_type, 'local_radar_browser')
assert.equal(browserFallback.order_runner_running_source, 'local_helper_health')

const manualFallback = buildOrderRunnerDiagnostic({
  platform: 'shopee',
  capability_mode: 'manual_reference',
  order_sync_mode: 'import_file_sync'
})
assert.equal(manualFallback.order_runner_type, 'local_report_worker')
assert.equal(manualFallback.order_runner_running_source, 'local_helper_health')

const adminRenderer = readFile('../apps/fe/js/admin/shops/shop-status-render.js')
assert.match(adminRenderer, /Detail parser/, 'Admin phải hiện diagnostic detail parser')
assert.match(adminRenderer, /Tem vận chuyển/, 'Admin phải hiện diagnostic label runner')
assert.match(adminRenderer, /manual_required/, 'Admin phải hiện số đơn cần tải tem thủ công')
assert.match(adminRenderer, /TikTok automation/, 'Admin phải hiện diagnostic TikTok runner')

console.log('shop runner diagnostic guard passed')

function readFile(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}
