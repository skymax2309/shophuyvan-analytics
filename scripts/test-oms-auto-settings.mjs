import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))
const read = path => readFileSync(repoFile(path), 'utf8')

const manualRoute = read('apps/worker-api/src/routes/orders/manual-sync-backfill.js')
const botRoute = read('apps/worker-api/src/routes/bot/index.js')
const omsMain = read('apps/fe/js/oms-dashboard/oms-main.js')
const omsHtml = read('apps/fe/pages/oms-dashboard.html')
const botSettings = read('apps/fe/js/modules/oms-bot-settings.js')
const shopeeOps = read('apps/fe/js/modules/oms-shopee-ops.js')
const css = read('apps/fe/css/oms-dashboard/bot-settings.css')

assert.ok(manualRoute.includes('/report-run') || manualRoute.includes('local_helper'), 'Manual backfill must stay connected to local runner diagnostics')
assert.ok(manualRoute.includes('pull_orders'), 'Manual backfill route must support pull_orders for scheduler')
assert.ok(manualRoute.includes('refresh_status'), 'Manual backfill route must support refresh_status for scheduler')
assert.ok(manualRoute.includes('sync_detail'), 'Manual backfill route must support sync_detail for scheduler')
assert.ok(manualRoute.includes('sync_finance'), 'Manual backfill route must support sync_finance for scheduler')
assert.ok(manualRoute.includes('retry_label'), 'Manual backfill route must support retry_label for scheduler')
assert.ok(manualRoute.includes('Shop API dùng Open Platform'), 'API shops must stay blocked from Chrome fallback')

for (const key of ['auto_order_enabled', 'auto_status_enabled', 'auto_detail_enabled', 'auto_finance_enabled', 'auto_label_enabled']) {
  assert.ok(botRoute.includes(key), `Worker bot settings must persist ${key}`)
  assert.ok(botSettings.includes(key), `Auto modal must expose ${key}`)
}

for (const action of ['pull_orders', 'refresh_status', 'sync_detail', 'sync_finance', 'retry_label']) {
  assert.ok(botSettings.includes(action), `Auto modal must show ${action}`)
}

assert.ok(botSettings.includes('Cài đặt vận hành'), 'OMS settings modal should be the operation center')
assert.ok(botSettings.includes('Cài tự động'), 'OMS settings modal must separate automatic settings')
assert.ok(botSettings.includes('Chạy thủ công'), 'OMS settings modal must separate manual runs from automatic settings')
assert.ok(botSettings.includes('AUTO_ACTIONS'), 'Auto modal must use a unified action list')
assert.ok(botSettings.includes('detail_min_minutes'), 'Auto modal must configure detail interval')
assert.ok(botSettings.includes('finance_min_minutes'), 'Auto modal must configure finance interval')
assert.ok(botSettings.includes('label_min_minutes'), 'Auto modal must configure label interval')
assert.ok(css.includes('bot-action-grid'), 'Auto modal CSS must render action toggles compactly')

assert.ok(!omsHtml.includes('btnResyncPanel'), 'Legacy resync panel button must be removed from OMS')
assert.ok(!omsHtml.includes('Đồng bộ & tải lại'), 'Legacy resync panel label must be removed from OMS')
assert.ok(!omsMain.includes('oms-resync-panel'), 'OMS main must not import the removed resync panel')
assert.ok(!omsMain.includes('openResyncPanel'), 'OMS main must not expose the removed resync panel')
assert.ok(!existsSync(repoFile('apps/fe/js/modules/oms-resync-panel.js')), 'Removed resync panel JS must not exist')
assert.ok(!existsSync(repoFile('apps/fe/css/oms-dashboard/resync-panel.css')), 'Removed resync panel CSS must not exist')
assert.ok(!omsHtml.includes('triggerBotScrape()'), 'Kéo Đơn must not be a manual topbar action')
assert.ok(!omsHtml.includes('triggerBotStatus()'), 'Cập nhật trạng thái must not be a manual topbar action')
assert.ok(!omsHtml.includes('syncOrders()'), 'OMS must not expose manual syncOrders button')
assert.ok(!omsMain.includes('export async function syncOrders'), 'OMS main must remove manual syncOrders runtime')
assert.ok(!read('apps/fe/js/features/oms-dashboard/oms-dashboard-inline-1.js').includes('syncOrders'), 'OMS inline globals must not expose syncOrders')
assert.ok(!shopeeOps.includes('syncOrders()'), 'Shopee ops must route operators to Auto instead of manual syncOrders')
assert.ok(omsHtml.includes('openBotSettingsModal()'), 'Topbar Auto must open the automatic operation center')
assert.ok(omsHtml.includes('sidebar-settings-btn'), 'Sidebar must expose the operation settings button')
assert.ok(omsHtml.includes('refreshOrdersView()'), 'Topbar refresh must only refresh the current table')

console.log('test-oms-auto-settings: ok')
