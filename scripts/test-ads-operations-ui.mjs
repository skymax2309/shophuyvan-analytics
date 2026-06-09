import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sectionBetween(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert(startIndex >= 0 && endIndex > startIndex, `Không tìm được section ${start}.`)
  return source.slice(startIndex, endIndex)
}

const page = readFileSync('apps/fe/pages/ads.html', 'utf8')
const promotionPage = readFileSync('apps/fe/pages/promotions.html', 'utf8')
const loader = readFileSync('apps/fe/js/dashboard/ads.js', 'utf8')
const ui = readFileSync('apps/fe/js/dashboard/ads/ads-end-user-ui.js', 'utf8')
const promotionUi = existsSync('apps/fe/js/dashboard/promotions.js')
  ? readFileSync('apps/fe/js/dashboard/promotions.js', 'utf8')
  : [
      'apps/fe/js/dashboard/promotions-core.js',
      'apps/fe/js/dashboard/promotions-render.js',
      'apps/fe/js/dashboard/promotions-flash.js',
      'apps/fe/js/dashboard/promotions-cleanup.js',
      'apps/fe/js/dashboard/promotions-actions.js'
    ].filter(existsSync).map(path => readFileSync(path, 'utf8')).join('\n')
const css = readFileSync('apps/fe/css/ads/ads-page.css', 'utf8')
const dashboard = readFileSync('apps/worker-api/src/routes/ads/dashboard.js', 'utf8')
const metrics = readFileSync('apps/worker-api/src/routes/ads/dashboard-metrics.js', 'utf8')
const campaignCore = readFileSync('apps/worker-api/src/core/ads/campaign-guard-core.js', 'utf8')
const automationCron = readFileSync('apps/worker-api/src/cron/ads-automation.js', 'utf8')
const evaluationEngine = readFileSync('apps/worker-api/src/ads/evaluation-engine.js', 'utf8')
const automationExecutor = readFileSync('apps/worker-api/src/ads/automation-executor.js', 'utf8')
const workerIndex = readFileSync('apps/worker-api/src/index.js', 'utf8')
const wrangler = readFileSync('apps/worker-api/wrangler.toml', 'utf8')
const promotionBrowser = readFileSync('apps/worker-api/src/routes/discounts/common/promotion-browser.js', 'utf8')
const promotionRoute = readFileSync('apps/worker-api/src/routes/discounts/common/route-handler.js', 'utf8')

const oldAdsModules = readdirSync('apps/fe/js/dashboard/ads').filter(file => file !== 'ads-end-user-ui.js')
assert(oldAdsModules.length === 0, `Frontend ADS cũ phải được xoá, còn: ${oldAdsModules.join(', ')}`)

assert(loader.includes('ads-end-user-ui.js'), 'Loader ADS phải nạp UI người vận hành mới.')
assert(!loader.includes('ads-guard-core.js') && !loader.includes('ads-operations-ui.js'), 'Loader ADS không được nạp UI kỹ thuật cũ.')

for (const tab of ['Tổng quan', 'Cần xử lý', 'Cài đặt', 'Lịch sử']) {
  assert(page.includes(tab), `ADS page phải có tab ${tab}.`)
}
assert(!page.includes('Đồng bộ dữ liệu'), 'ADS page không được còn tab Đồng bộ dữ liệu.')
assert(!page.includes('data-ads-tab="sync"'), 'ADS page không được còn panel/tab sync riêng.')
assert(!page.includes('data-ads-tab="settings"'), 'ADS page không được còn tab Cài đặt.')
assert(!page.includes('Điều chỉnh ADS</button>') && !page.includes('Luật tự động ADS</button>'), 'ADS page phải đổi tab luật tự động thành Cài đặt.')
assert(!page.includes('Khuyến mãi & ADS'), 'ADS page không được còn tab quản lý khuyến mãi.')
assert(page.includes('promotions.html'), 'Sidebar ADS phải trỏ Khuyến mãi sàn sang trang riêng.')
assert(page.includes('ads-user-back-home') && page.includes('href="../"'), 'ADS page phải có nút quay về trang chủ.')
assert(promotionPage.includes('ads-user-back-home') && promotionPage.includes('href="../"'), 'Khuyến mãi sàn phải có nút quay về trang chủ.')

for (const forbidden of ['Guard ADS', 'TopPicks', 'Chi tiết kỹ thuật']) {
  assert(!page.includes(forbidden), `ADS page không được render "${forbidden}".`)
}

assert(ui.includes('profit_after_ads'), 'UI phải đọc lãi sau ADS từ dữ liệu trả về.')
assert(!/profit_after_ads\s*=(?!=)/.test(ui), 'UI không được tự gán/tính profit_after_ads.')
assert(ui.includes('previewAdsAdjustment'), 'UI phải có bước xem trước thay đổi.')
assert(ui.includes('applyAdsAdjustment'), 'UI phải có bước xác nhận áp dụng.')
assert(ui.includes('apiPost') && ui.includes('confirm_text'), 'Live-write UI phải gửi qua POST có xác nhận.')
assert(ui.includes("if (action === 'change_budget') bodyData.budget"), 'UI chỉ gửi budget khi action là change_budget.')
assert(ui.includes("if (action === 'change_roas_target') bodyData.roas_target"), 'UI chỉ gửi ROAS khi action là change_roas_target.')
assert(ui.includes('runAdsSync'), 'UI phải có thao tác đồng bộ dữ liệu.')
assert(ui.includes('runAdsAutomationCheck'), 'Cài đặt ADS phải có nút chạy kiểm tra ngay.')
assert(ui.includes('emergencyStopAdsAutomation'), 'Cài đặt ADS phải có nút tắt khẩn cấp.')
assert(ui.includes('addAdsSchedule') && ui.includes('validateSchedules'), 'Cài đặt ADS phải thêm/xoá và validate khung giờ.')
assert(ui.includes('Không được lưu khung giờ trùng nhau'), 'Cài đặt ADS phải chặn khung giờ trùng.')
for (const label of ['Campaign tốt', 'Campaign trung bình', 'Campaign không hiệu quả', 'Thiếu dữ liệu', 'Giới hạn an toàn', 'Campaign đang bị tạm dừng', 'Nhật ký tự động gần nhất']) {
  assert(ui.includes(label), `Cài đặt ADS thiếu mục ${label}.`)
}
for (const key of ['good_roas', 'minimum_roas', 'max_campaign_daily_budget', 'max_shop_daily_budget']) {
  assert(ui.includes(key), `Cài đặt ADS phải lưu/readback ${key}.`)
}
assert(ui.includes('syncTodaySilently') && ui.includes('startRealtimeRefresh'), 'ADS UI phải tự làm mới và kéo số ngày hiện tại.')
assert(ui.includes('todayText()') && !ui.includes('todayText(-23)'), 'ADS mở trang phải mặc định ngày hiện tại, không mặc định 7/23 ngày.')
assert(ui.includes('Ngân sách tối đa mỗi campaign') && ui.includes('đ/ngày'), 'Ngân sách ADS phải ghi rõ là ngân sách theo ngày.')
assert(ui.includes('ads-user-toggle') && ui.includes('role="switch"'), 'Cài đặt bật/tắt phải dùng nút công tắc.')
assert(ui.includes('campaignThumb') && ui.includes('image_url'), 'Danh sách chiến dịch phải render ảnh sản phẩm khi Core có ảnh.')
assert(ui.includes('Sàn đã xác nhận thay đổi') && ui.includes('Sàn chưa xác nhận thay đổi'), 'UI phải phân biệt readback đúng và chưa đúng.')
assert(ui.includes('ads-user-mobile-list'), 'Mobile phải dùng card list.')
assert(ui.includes('function problemLabel') && ui.includes('function actionForRow'), 'ADS phải tách Vấn đề và Hành động thành hai phần rõ nghĩa.')
assert(ui.includes('Không hiệu quả') && ui.includes('ROAS thấp') && ui.includes('Thiếu doanh thu ADS'), 'ADS phải có nhãn vấn đề vận hành, không dùng nhãn giảm phần trăm mơ hồ.')
assert(ui.includes('Tạm dừng') && ui.includes('Giảm ngân sách') && ui.includes('Giữ ADS') && ui.includes('Kiểm giá vốn'), 'ADS phải có hành động rõ cạnh từng dòng.')
assert(!ui.includes('Giảm 30%'), 'ADS UI không được render badge "Giảm 30%" như vấn đề độc lập.')
assert(ui.includes('class="ads-num"'), 'ADS phải gắn class căn phải/tabular cho cột số.')
assert(ui.includes('<th>Sản phẩm</th><th>SKU</th><th>Shop</th><th class="ads-num">Tồn kho'), 'Bảng sản phẩm phải có cột số căn phải.')
assert(
  ui.includes('<th>Trạng thái</th><th>Hành động</th>') ||
  ui.includes('ads-product-status-stack'),
  'Bảng sản phẩm phải gộp trạng thái rõ và giữ hành động riêng.'
)
assert(ui.includes('ads-user-mini-metrics ads-num') && ui.includes('problemTone(row)') && ui.includes('actionButtons(row, true)'), 'Top SKU phải có số căn phải, vấn đề và hành động riêng.')
assert(/function helpIcon[\s\S]*?ads-help-icon/.test(ui), 'ADS main UI phải bật lại help icon có kiểm soát.')

for (const table of [
  'ads_campaigns',
  'ads_adgroups',
  'ads_product_links',
  'ads_daily_metrics',
  'ads_decision_read_model',
  'ads_write_capabilities',
  'ads_action_logs'
]) {
  assert(metrics.includes(table) || campaignCore.includes(table), `ADS Core phải có bảng ${table}.`)
}

assert(dashboard.includes('decision_cards'), 'ADS summary phải trả decision_cards cho UI vận hành.')
assert(dashboard.includes('sku_action_count'), 'ADS summary phải trả sku_action_count.')
assert(dashboard.includes('profit_after_ads'), 'ADS read data phải có profit_after_ads từ backend.')
assert(dashboard.includes('current_cost') && dashboard.includes('sku_current_cost_read_model'), 'ADS read data phải đọc current_cost từ Warehouse.')
assert(dashboard.includes('parseMappedSkuItems') && dashboard.includes('platform_item_id') && dashboard.includes('model_id'), 'ADS read data phải match Product Core bằng SKU, item_id/model_id và mapped_items.')
assert(dashboard.includes('marketplace_discount_items'), 'ADS read data phải đọc dữ liệu khuyến mãi.')
assert(campaignCore.includes('ads_action_logs'), 'Thao tác ADS phải ghi vào ads_action_logs.')
assert(campaignCore.includes('requires_readback'), 'Capability ADS phải khóa yêu cầu readback.')
assert(readFileSync('apps/worker-api/src/routes/ads/index.js', 'utf8').includes('/api/ads/automation/settings'), 'Worker phải có route lưu/readback luật tự động ADS.')
assert(readFileSync('apps/worker-api/src/routes/ads/index.js', 'utf8').includes('/api/ads/automation/emergency-stop'), 'Worker phải có route tắt khẩn cấp ADS.')
assert(readFileSync('apps/worker-api/src/routes/ads/index.js', 'utf8').includes('/api/ads/automation/pending-confirms'), 'Worker phải có route danh sách chờ duyệt ADS.')
assert(readFileSync('apps/worker-api/src/routes/ads/index.js', 'utf8').includes('/api/ads/automation/confirm-action'), 'Worker phải có route duyệt/từ chối action ADS.')
assert(readFileSync('apps/worker-api/src/routes/ads/index.js', 'utf8').includes('/api/ads/automation/last-run-summary'), 'Worker phải có route tóm tắt lần chạy ADS.')
assert(readFileSync('apps/worker-api/src/routes/ads/index.js', 'utf8').includes('/api/ads/automation/logs'), 'Worker phải có route log tự động ADS.')
assert(campaignCore.includes('enrichAdsGuardCampaignCatalogRows') && campaignCore.includes('image_url'), 'Catalog chiến dịch phải enrich ảnh và SKU từ Product Core.')
assert(workerIndex.includes('performance_date: adsToday') && workerIndex.includes('Keo campaign ADS realtime'), 'Worker cron phải kéo ADS ngày hiện tại theo chu kỳ.')
assert(wrangler.includes('"*/15 * * * *"'), 'Wrangler phải có cron ADS automation mỗi 15 phút.')
assert(workerIndex.includes('runAdsAutomationCron') && workerIndex.includes('ADS automation'), 'Worker scheduled phải gọi ADS automation cron.')
assert(automationCron.includes('outside_time_window') && automationCron.includes('emergency_stop_active') && automationCron.includes('automation_cron'), 'Cron ADS phải log skip theo khung giờ/tắt khẩn cấp.')
assert(evaluationEngine.includes('max_campaigns_per_run') && evaluationEngine.includes('requires_admin_confirm') && evaluationEngine.includes('Chưa có giá vốn'), 'Evaluation Engine phải có safety guard và phân loại thiếu dữ liệu.')
assert(automationExecutor.includes('dry_run') && automationExecutor.includes('pending_admin_confirm') && automationExecutor.includes('sàn_chưa_xác_nhận'), 'Executor phải có dry-run, chờ duyệt và readback mismatch.')
assert(automationExecutor.includes('platform_not_supported_yet') && automationExecutor.includes('read_only_platform'), 'Executor không được fake Lazada/TikTok.')

for (const moduleName of [
  'Shopee Discount',
  'Shopee Voucher',
  'Shopee Bundle',
  'Shopee Add-On',
  'Shopee Flash Sale',
  'Lazada Voucher',
  'Lazada Freeship',
  'Lazada Flexicombo'
]) {
  assert(promotionUi.includes(moduleName), `Khuyến mãi sàn phải có module ${moduleName}.`)
}
for (const removedMenu of ['Tổng quan khuyến mãi', 'Đồng bộ khuyến mãi', 'Nhật ký thao tác khuyến mãi', 'Cài đặt khuyến mãi']) {
  assert(!promotionPage.includes(removedMenu) && !promotionUi.includes(removedMenu), `Khuyến mãi sàn không được giữ menu rối "${removedMenu}".`)
}
assert(promotionPage.includes('value="not_expired"') && !promotionPage.includes('value="expired"'), 'Bộ lọc chính Khuyến mãi sàn phải mặc định ẩn chương trình đã kết thúc.')
assert(!promotionUi.includes('showShopeeFlashSaleAuto'), 'Khuyến mãi sàn không được thêm tab Shopee Flash Sale tự động riêng.')
assert(promotionUi.includes("CREATE_ONLY_MODULE_KEYS") && promotionUi.includes("'shopee-voucher'") && promotionUi.includes("'shopee-bundle'") && promotionUi.includes("'shopee-addon'") && promotionUi.includes("'shopee-flash'"), 'Shopee Voucher/Bundle/Add-On/Flash Sale phải là module chỉ tạo chương trình.')
assert(/function moduleToolbar[\s\S]*?isCreateOnlyModule\(mod\)[\s\S]*?Tạo chương trình[\s\S]*?function/.test(promotionUi), 'Toolbar module create-only không được render Làm mới/Đồng bộ từ sàn.')
assert(/async function syncPromotionModule[\s\S]*?isCreateOnlyModule\(mod\)[\s\S]*?return/.test(promotionUi), 'Code sync thủ công phải bị chặn cho Shopee Voucher/Bundle/Add-On/Flash Sale.')
assert(/function moduleItemSection[\s\S]*?isCreateOnlyModule\(mod\)[\s\S]*?return ''/.test(promotionUi), 'Shopee Voucher/Bundle/Add-On/Flash Sale không được render bảng SKU cũ.')
assert(promotionUi.includes('Luật tự động Flash Sale'), 'Module Shopee Flash Sale phải chứa luật tự động Flash Sale trong cùng màn.')
assert(promotionUi.includes('addFlashSchedule') && promotionUi.includes('removeFlashSchedule'), 'Flash Sale tự động phải thêm/xoá khung giờ.')
assert(promotionUi.includes('addFlashProduct') && promotionUi.includes('Danh sách sản phẩm chạy Flash Sale'), 'Flash Sale tự động phải có add/list sản phẩm.')
assert(promotionUi.includes('saveFlashAutoSettings') && promotionUi.includes('/api/discounts/automation/settings'), 'Flash Sale auto must save and read back rules from backend.')
assert(promotionUi.includes('/api/discounts/automation/run-now'), 'Flash Sale auto must run backend check before live-write.')
assert(promotionUi.includes('Không thêm nếu thiếu giá gốc') || promotionUi.includes('Không thêm nếu thiếu giá gốc, thiếu tồn kho'), 'Flash Sale tự động phải có điều kiện thiếu giá/tồn.')
assert(promotionUi.includes('Nhật ký Flash Sale tự động'), 'Flash Sale tự động phải có nhật ký.')
assert(promotionUi.includes('Dọn chương trình cũ'), 'Khuyến mãi sàn phải có mục dọn chương trình cũ.')
assert(promotionUi.includes('Không xoá dữ liệu nội bộ để giả vờ đã xoá'), 'Dọn chương trình cũ không được xoá dữ liệu nội bộ giả.')
assert(promotionUi.includes('cleanupPromotionAction') && promotionUi.includes('/api/discounts/cleanup/action'), 'Dọn chương trình cũ phải đi qua backend live-write có guard capability.')
assert(promotionUi.includes('cleanupLiveActions'), 'Nút dọn chương trình cũ chỉ được render theo endpoint/capability.')
assert(promotionUi.includes('Chưa có dữ liệu') && promotionUi.includes('trong khoảng ngày này'), 'Mỗi module phải có empty state riêng theo tên module.')
assert(promotionUi.includes('promotion-module-read-model'), 'UI khuyến mãi phải đọc read-model module từ backend.')
assert(promotionUi.includes('liveWritePromotionCurrentPrice') && promotionUi.includes('Áp dụng lại giá'), 'Shopee Discount phải có thao tác live-write an toàn từ màn Khuyến mãi sàn.')
assert(promotionUi.includes('result.verified === true'), 'Live-write khuyến mãi phải chờ readback đúng trước khi báo thành công.')
assert(/function helpIcon[\s\S]*?return ''/.test(promotionUi), 'Promotion UI must not keep broad question-mark helper icons in the operator screen.')
assert(promotionBrowser.includes('getPromotionModuleReadModel'), 'Backend phải có Promotion module read-model.')
assert(promotionBrowser.includes('EXPIRED_PROMOTION_STATUSES') && promotionBrowser.includes('not_expired'), 'Read-model Khuyến mãi phải lọc ẩn chương trình hết hiệu lực theo mặc định.')
assert(promotionBrowser.includes('INNER JOIN marketplace_promotion_programs p') && promotionBrowser.includes('SELECT i.*'), 'Read-model item chương trình phải join chương trình cha còn hiệu lực, không trả item mồ côi của chương trình cũ.')
assert(promotionRoute.includes('/api/discounts/promotion-module-read-model'), 'Route Promotion module read-model phải được expose.')
assert(promotionRoute.includes('discounts_route_failed'), 'Route Promotion phải trả JSON lỗi có CORS thay vì để UI báo load fail mơ hồ.')
assert(promotionBrowser.includes('marketplace_discounts'), 'Read-model phải đọc Shopee Discount Core.')
assert(promotionBrowser.includes('marketplace_vouchers'), 'Read-model phải đọc Voucher Core.')
assert(promotionBrowser.includes('marketplace_promotion_programs'), 'Read-model phải đọc Promotion Program Core.')

assert(css.includes('@media (min-width:760px)'), 'CSS phải có tablet layout.')
assert(css.includes('@media (min-width:1180px)'), 'CSS phải có desktop layout.')
assert(css.includes('max-width:min(1480px,100%)'), 'Desktop phải có giới hạn chiều rộng ổn định theo container.')
assert(css.includes('overflow-x:hidden'), 'Trang ADS không được tràn ngang body.')
assert(css.includes('promo-module-grid'), 'CSS phải có layout module Khuyến mãi sàn.')
assert(css.includes('promo-summary-grid'), 'CSS phải có summary Khuyến mãi sàn responsive.')
assert(css.includes('.ads-num') && css.includes('font-variant-numeric:tabular-nums'), 'CSS phải có class số căn phải dùng tabular numbers.')
assert(css.includes('.ads-user-task-grid{display:grid') && css.includes('overflow:visible'), 'Việc cần làm hôm nay không được dùng scrollbar nội bộ.')
assert(css.includes('.ads-user-row-actions.compact'), 'Top SKU phải có action gọn trong cột riêng.')

const helpText = [
  sectionBetween(promotionUi, 'const PROMOTION_HELP_ITEMS =', '  function el(id)')
].join('\n')
for (const forbidden of ['endpoint', 'payload', 'request_id', 'Core', 'cache', 'guard', 'JSON']) {
  assert(!helpText.includes(forbidden), `Popover chú thích không được render từ kỹ thuật "${forbidden}".`)
}

console.log('ADS end-user UI contract passed')
