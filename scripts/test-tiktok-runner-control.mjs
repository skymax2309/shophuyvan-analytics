import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const repo = path.basename(cwd) === 'worker-api' && path.basename(path.dirname(cwd)) === 'apps'
  ? path.resolve(cwd, '../..')
  : cwd
const automationRoot = 'E:/shophuyvan-python-automation/oms_python'
const automationProfileRoot = 'E:\\shophuyvan-python-automation\\profiles\\browser'
const automationProfileRootJson = 'E:\\\\shophuyvan-python-automation\\\\profiles\\\\browser'
const controlPath = path.join(automationRoot, 'core/automation_safety/tiktok_runner_control.py')
const automationProfilesPath = path.join(automationRoot, 'core/automation_profiles.py')
const reportWorkerPath = path.join(automationRoot, 'features/reports/run_report_jobs.py')
const localHelperPath = path.join(automationRoot, 'features/local_helper/server.py')
const syncTabPath = path.join(automationRoot, 'ui/tabs/sync_order_tab.py')
const chatBrowserPath = path.join(automationRoot, 'features/chat/automation_browser.py')
const tiktokBackfillPath = path.join(automationRoot, 'platforms/tiktok/orders/dongbochitiet.py')
const shopeeBackfillPath = path.join(automationRoot, 'platforms/shopee/orders/dongbochitiet.py')
const tiktokReadOnlyPath = path.join(automationRoot, 'platforms/tiktok/orders/kiemtrareadonly.py')
const tiktokStatusDryRunPath = path.join(automationRoot, 'platforms/tiktok/orders/kiemtra.py')
const shopsDataPath = 'E:/shophuyvan-python-automation/data/shops.json'

function read(file) {
  if (!existsSync(file)) throw new Error(`missing file: ${file}`)
  return readFileSync(file, 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const control = read(controlPath)
const automationProfiles = read(automationProfilesPath)
const reportWorker = read(reportWorkerPath)
const localHelper = read(localHelperPath)
const syncTab = read(syncTabPath)
const chatBrowser = read(chatBrowserPath)
const tiktokBackfill = read(tiktokBackfillPath)
const shopeeBackfill = read(shopeeBackfillPath)
const tiktokReadOnly = read(tiktokReadOnlyPath)
const tiktokStatusDryRun = read(tiktokStatusDryRunPath)
const shopsData = read(shopsDataPath)

for (const [name, source] of [
  ['report worker', reportWorker],
  ['local helper', localHelper],
  ['sync order tab', syncTab],
  ['chat automation browser', chatBrowser],
  ['tiktok seller detail backfill', tiktokBackfill],
  ['shopee seller detail backfill', shopeeBackfill],
]) {
  assert(!/taskkill\s+.*chrome\.exe/i.test(source), `${name} must not taskkill chrome.exe`)
  assert(!/Get-CimInstance\s+Win32_Process[\s\S]{0,260}Stop-Process/i.test(source), `${name} must not stop Chrome by process scan`)
}

assert(control.includes('LOCK_FILE'), 'TikTok runner control must have lock file')
assert(control.includes('HEARTBEAT_FILE'), 'TikTok runner control must have heartbeat file')
assert(control.includes('PAUSE_FILE'), 'TikTok runner control must have pause file')
assert(control.includes('STOP_FILE'), 'TikTok runner control must have stop file')
assert(control.includes('MAX_RETRY_PER_ORDER = 3'), 'TikTok runner must cap retries per order')
assert(control.includes('BASE_BACKOFF_SECONDS'), 'TikTok runner must define backoff')
assert(control.includes('COOLDOWN_SECONDS'), 'TikTok runner must define cooldown')
assert(control.includes('close_locked_browser_pids'), 'TikTok runner stop must close only locked browser pids')
assert(control.includes('browser_pids') && control.includes('process_command_line'), 'TikTok stop must verify locked browser pid command line')
assert(control.includes('runner_state') && control.includes('chrome_profile') && control.includes('heartbeat'), 'TikTok status must expose runner_state/chrome_profile/heartbeat')
assert(control.includes('allow_run'), 'TikTok resume must require explicit allow_run before clearing pause')
assert(control.includes('paused_requires_login'), 'TikTok login-required state must pause the runner')

assert(reportWorker.includes('tiktok_runner_control.acquire_lock'), 'Report worker must acquire TikTok runner lock')
assert(reportWorker.includes('tiktok_runner_control.is_paused'), 'Report worker must honor TikTok pause')
assert(reportWorker.includes('tiktok_runner_control.retry_gate'), 'Report worker must honor TikTok retry/backoff')
assert(reportWorker.includes('tiktok_runner_control.record_browser_pids'), 'Report worker must record Chrome PIDs')
assert(reportWorker.includes('runner_requires_login'), 'Report worker must surface runner_requires_login')
assert(reportWorker.includes('profile_for_job'), 'Report worker must resolve Chrome profiles from the shared automation profile map')
assert(reportWorker.includes('acquire_job_locks'), 'Report worker must acquire profile/action/order locks')
assert(reportWorker.includes('ensure_default_pause_after_loop'), 'Report worker must default TikTok runner to pause after restart')
assert(reportWorker.includes('one_shot_batch_completed'), 'One-shot report worker must pause TikTok runner after batch')
assert(automationProfiles.includes(automationProfileRoot), 'Automation profile map must use the fixed profile root')
assert(automationProfiles.includes('HuyVan_Bot_Data_khogiadungcona'), 'Automation profile map must include Shopee no-API khogiadungcona')
assert(automationProfiles.includes('api_shop_no_chrome'), 'API shops must be marked no Chrome automation')
assert(automationProfiles.includes('source="local_browser"'), 'Local fallback profiles must carry source=local_browser')
assert(automationProfiles.includes('source="api"'), 'API shop profiles must carry source=api')
assert(automationProfiles.includes('HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc'), 'Lazada manual-check profile must use the standard shop-specific folder')

assert(localHelper.includes('/tiktok-runner/status'), 'Local helper must expose TikTok runner status')
assert(localHelper.includes('/tiktok-runner/pause'), 'Local helper must expose TikTok runner pause')
assert(localHelper.includes('/tiktok-runner/resume'), 'Local helper must expose TikTok runner resume')
assert(localHelper.includes('/tiktok-runner/stop'), 'Local helper must expose TikTok runner stop')
assert(localHelper.includes('allow_run'), 'Local helper resume must not clear pause without explicit allow_run')

assert(syncTab.includes('tiktok_runner_control.acquire_lock'), 'Radar/manual TikTok flow must acquire runner lock')
assert(syncTab.includes('tiktok_runner_control.runner_profile_dir'), 'Radar/manual TikTok flow must use dedicated profile')
assert(!syncTab.includes('TikTokOrderProcessor'), 'Radar/manual flow must not call TikTok process/arrange label helper')
assert(read('E:/shophuyvan-python-automation/oms_python/ui/tabs/oms_radar_tab.py').includes('legacy_print_label_disabled'), 'Radar print-label legacy flow must be disabled in favor of retry_label')
assert(chatBrowser.includes('Không kill Chrome'), 'Shared browser helper must document no generic Chrome kill')
assert(tiktokBackfill.includes('profile_for_tiktok_runner'), 'TikTok seller detail CLI must resolve profile from the shared map')
assert(!tiktokBackfill.includes('shophuyvan-test'), 'TikTok seller detail CLI must not use user profile')
assert(!shopeeBackfill.includes('shophuyvan-test'), 'Shopee seller detail CLI must not use user profile')
assert(shopeeBackfill.includes('profile_for_shopee_no_api_runner'), 'Shopee seller detail CLI must resolve mapped no-API profile from the shared map')
for (const [name, source] of [
  ['TikTok readonly check', tiktokReadOnly],
  ['TikTok status dry-run', tiktokStatusDryRun],
]) {
  assert(source.includes('tiktok_runner_control.runner_profile_dir'), `${name} must use the shared TikTok runner profile resolver`)
  assert(!source.includes('HuyVan_Bot_Data_TikTok'), `${name} must not use the old uncontrolled TikTok profile`)
  assert(!source.includes('shophuyvan-test'), `${name} must not use the user Chrome profile`)
}
assert(shopsData.includes('shophuyvan-runner-tiktok'), 'shops data must use the dedicated TikTok runner profile')
assert(shopsData.includes(automationProfileRootJson), 'shops data must use the fixed automation profile root')
assert(shopsData.includes('HuyVan_Bot_Data_lazada_kinhdoanhonlinegiasoc'), 'shops data must use the standard Lazada manual-check profile')
assert(!shopsData.includes('HuyVan_Bot_Data_TikTok'), 'shops data must not use the old uncontrolled TikTok profile')
assert(!shopsData.includes('shophuyvan-test'), 'shops data must not use the user Chrome profile')

const adminActions = read(path.join(repo, 'apps/fe/js/admin/shops/shop-api-actions.js'))
const adminRender = read(path.join(repo, 'apps/fe/js/admin/shops/shop-status-render.js'))
assert(adminActions.includes('tiktok_runner_state'), 'Admin actions must merge TikTok runner diagnostic')
assert(adminActions.includes('controlTikTokRunner'), 'Admin must expose TikTok runner controls')
assert(adminActions.includes('allow_run'), 'Admin resume control must stay control-only by default')
assert(!adminActions.includes('ensure_report_worker=1'), 'Admin diagnostic must not autostart report_worker while reading runner health')
assert(adminRender.includes('TikTok automation'), 'Admin renderer must show TikTok automation diagnostic')
assert(adminRender.includes('Runner type'), 'Admin renderer must show runner type')
assert(adminRender.includes('Cần đăng nhập TikTok Seller Center cho profile automation'), 'Admin renderer must show login-required message')

console.log('test-tiktok-runner-control: ok')

