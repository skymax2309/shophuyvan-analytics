import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildOrderRunnerDiagnostic, nextWorkerCronSyncAt } from '../apps/worker-api/src/core/marketplace/shop-capability-core.js'

const cwd = process.cwd()
const repo = path.basename(cwd) === 'worker-api' && path.basename(path.dirname(cwd)) === 'apps'
  ? path.resolve(cwd, '../..')
  : cwd

const next = nextWorkerCronSyncAt(new Date('2026-05-20T10:02:03.000Z'))
assert.equal(next, '2026-05-20T10:05:00.000Z', 'Worker cron next_sync_at phải tính theo lát cắt 5 phút')

const apiRunner = buildOrderRunnerDiagnostic({
  platform: 'shopee',
  capability_mode: 'api_active',
  order_sync_mode: 'api_sync'
})
assert.equal(apiRunner.order_runner_type, 'worker_cron_api')
assert.equal(apiRunner.api_realtime_enabled, 1)
assert.equal(apiRunner.cron_source, 'cloudflare_scheduled_handler')
assert.ok(apiRunner.next_sync_at, 'API shop phải có next_sync_at')

const botRoute = read('apps/worker-api/src/routes/bot/index.js')
assert.match(botRoute, /auto_order_enabled/, 'Backend settings phải lưu auto_order_enabled')
assert.match(botRoute, /auto_status_enabled/, 'Backend settings phải lưu auto_status_enabled')
assert.match(botRoute, /auto_chat_enabled/, 'Backend settings phải lưu auto_chat_enabled cho lịch Chat no-API')

const workerIndex = read('apps/worker-api/src/index.js')
assert.match(workerIndex, /syncApiOrders\(env,[\s\S]*syncApiOrderStatuses\(env/, 'scheduled handler phải gọi kéo đơn và cập nhật trạng thái API')
assert.match(workerIndex, /platform === 'lazada' \? 2 : 20/, 'Cron API phải chạy batch nhỏ, không quét rộng')
assert.match(workerIndex, /fetch_trace:[\s\S]*platform === 'lazada' \? '0' : ''/, 'Cron Lazada phải tắt trace sâu để không vượt subrequest limit')
assert.match(workerIndex, /suppress_push:\s*true/, 'Cron API không được gửi push live khi chỉ đồng bộ nền')
assert.match(workerIndex, /Bỏ qua Chrome fallback no-API trong Worker cron/, 'Worker cron không được tự queue Chrome fallback cho shop no-API')
assert.match(workerIndex, /sync_payment:\s*false/, 'Cron lượt này không được sync Payment live')

const helper = read('E:/shophuyvan-python-automation/oms_python/features/local_helper/server.py')
assert.match(helper, /SCHEDULER_STATUS_FILE/, 'Local helper phải đọc status scheduler')
assert.match(helper, /SCHEDULER_WAKE_FILE/, 'Local helper phải có wake file cho scheduler')
assert.match(helper, /immediate_check_result/, 'Wake now phải trả immediate_check_result')
assert.match(helper, /last_order_run_at/, 'Helper health phải expose last_order_run_at')
assert.match(helper, /next_status_run_at/, 'Helper health phải expose next_status_run_at')
assert.match(helper, /auto_chat_enabled/, 'Helper config phải lưu auto_chat_enabled cho chat no-API')
assert.match(helper, /last_chat_run_at/, 'Helper health phải expose last_chat_run_at')
assert.match(helper, /next_chat_run_at/, 'Helper health phải expose next_chat_run_at')

const radarTab = read('E:/shophuyvan-python-automation/oms_python/ui/tabs/oms_radar_tab.py')
assert.match(radarTab, /API_SYNC_SHOPS/, 'Radar phải có danh sách shop API để không quét Chrome')
assert.match(radarTab, /last_order_result/, 'Radar scheduler phải ghi kết quả kéo đơn')
assert.match(radarTab, /last_status_result/, 'Radar scheduler phải ghi kết quả trạng thái')
assert.match(radarTab, /outside_active_window/, 'Radar phải ghi reason ngoài khung giờ')
assert.match(radarTab, /manual-sync\/backfill/, 'Radar auto phải queue route backfill có filter, không cào rộng trực tiếp')
assert.match(radarTab, /action_type/, 'Radar auto phải truyền action_type rõ cho từng flow')
assert.match(radarTab, /pull_orders/, 'Radar auto kéo đơn phải dùng action_type=pull_orders')
assert.match(radarTab, /refresh_status/, 'Radar auto cập nhật trạng thái phải dùng action_type=refresh_status')
assert.match(radarTab, /sync_chat/, 'Radar auto phải có action_type=sync_chat cho Chat no-API')
assert.match(radarTab, /_run_auto_chat_cycle/, 'Radar scheduler phải có chu kỳ Chat no-API riêng')
assert.match(radarTab, /\/chat-sync/, 'Radar Chat no-API phải gọi local helper /chat-sync')
assert.doesNotMatch(radarTab, /playwright_order_job\(shop_data, action\)/, 'Radar auto không được gọi trực tiếp legacy playwright_order_job không filter')
assert.match(radarTab, /tiktok_auto_background_disabled_manual_one_shot_only/, 'TikTok auto nền không được loop')
assert.match(radarTab, /Worker\/Cron\/Webhook sẽ đồng bộ nền/, 'Radar log phải nói rõ shop API đi Worker/Cron/Webhook')

const ui = read('apps/fe/js/modules/oms-bot-settings.js')
assert.match(ui, /AUTO_ACTIONS/, 'Modal phai render scheduler theo danh sach action tu dong')
assert.match(ui, /scheduler\[`last_\$\{id\}_run_at`\]/, 'Modal phai render last_*_run_at theo tung action')
assert.match(ui, /scheduler\[`next_\$\{id\}_run_at`\]/, 'Modal phai render next_*_run_at theo tung action')
for (const action of ['pull_orders', 'refresh_status', 'sync_detail', 'sync_finance', 'retry_label']) {
  assert.match(ui, new RegExp(action), `Modal phai co action_type=${action}`)
}
assert.match(ui, /Chưa từng chạy từ khi bật auto/, 'Modal phải nói rõ khi chưa từng chạy')
assert.match(ui, /last_api_sync/, 'Modal phải render API sync diagnostic')

console.log('test-oms-auto-scheduler: ok')

function read(path) {
  const target = /^[A-Za-z]:[\\/]/.test(path) ? path : `${repo}/${path}`
  return readFileSync(target, 'utf8')
}
