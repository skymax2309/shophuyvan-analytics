import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function walk(dir, predicate, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(path, predicate, files)
    } else if (predicate(path)) {
      files.push(path)
    }
  }
  return files
}

const skillPaths = [
  'skills/shophuyvan-ui-design-system-guard/SKILL.md',
  'C:/Users/Admin/.codex/skills/shophuyvan-ui-design-system-guard/SKILL.md'
]

for (const path of skillPaths) {
  assert(existsSync(path), `Thiếu skill UI Design System Guard: ${path}`)
  const text = read(path)
  assert(text.includes('ShopHuyVan UI Design System Guard'), `Skill thiếu tiêu đề chuẩn: ${path}`)
  assert(text.includes('desktop/tablet/mobile'), `Skill thiếu gate responsive: ${path}`)
  assert(text.includes('không lạm dụng icon chú thích') || text.includes('không lạm dụng tooltip'), `Skill phải khóa lạm dụng tooltip/icon chú thích: ${path}`)
  assert(text.includes('font-variant-numeric: tabular-nums'), `Skill phải bắt bảng số liệu dùng tabular numbers: ${path}`)
  assert(text.includes('Giảm 30%'), `Skill phải khóa badge hành động kiểu Giảm 30% đứng một mình: ${path}`)
  assert(!text.includes('TODO'), `Skill còn TODO: ${path}`)
}

const agents = read('AGENTS.md')
assert(agents.includes('shophuyvan-ui-design-system-guard'), 'AGENTS.md phải bắt buộc đọc skill UI Design System Guard.')
assert(agents.includes('không báo UI pass nếu chưa kiểm đủ desktop/tablet/mobile'), 'AGENTS.md phải khóa pass UI khi chưa kiểm đủ breakpoint.')

for (const path of ['docs/ui-design-system.md', 'docs/ui-production-checklist.md']) {
  assert(existsSync(path), `Thiếu tài liệu UI bắt buộc: ${path}`)
  const text = read(path)
  for (const phrase of ['desktop', 'tablet', 'mobile', 'dark theme', 'empty', 'error']) {
    assert(text.toLowerCase().includes(phrase), `${path} thiếu nội dung ${phrase}.`)
  }
  assert(text.includes('tabular') || text.includes('căn phải'), `${path} thiếu rule căn phải/tabular cho số liệu.`)
  assert(text.includes('Giảm 30%') || text.includes('badge'), `${path} thiếu rule badge vấn đề/hành động.`)
  assert(text.includes('tooltip') || text.includes('icon chú thích'), `${path} thiếu rule kiểm soát tooltip/icon chú thích.`)
}

const tokenPath = 'apps/fe/css/theme/shophuyvan-design-tokens.css'
assert(existsSync(tokenPath), 'Thiếu CSS token chung ShopHuyVan.')
const tokens = read(tokenPath)
for (const token of [
  '--shv-bg-page',
  '--shv-bg-panel',
  '--shv-bg-card',
  '--shv-border',
  '--shv-text-main',
  '--shv-text-muted',
  '--shv-primary',
  '--shv-success',
  '--shv-warning',
  '--shv-danger',
  '--shv-info',
  '--shv-radius-sm',
  '--shv-radius-md',
  '--shv-radius-lg',
  '--shv-space-xs',
  '--shv-space-sm',
  '--shv-space-md',
  '--shv-space-lg',
  '--shv-shadow-card'
]) {
  assert(tokens.includes(token), `Thiếu token ${token}.`)
}

const adsUiPath = 'apps/fe/js/dashboard/ads/ads-end-user-ui.js'
if (existsSync(adsUiPath)) {
  const adsUi = read(adsUiPath)
  assert(/function helpIcon[\s\S]*?ads-help-icon/.test(adsUi), 'ADS UI phải có help icon giới hạn cho chỉ số khó hiểu.')
  assert(!adsUi.includes('Giảm 30%'), 'ADS UI không được dùng badge "Giảm 30%" như vấn đề độc lập.')
  assert(adsUi.includes('function problemLabel') && adsUi.includes('function actionForRow'), 'ADS UI phải tách Vấn đề và Hành động.')
  assert(adsUi.includes('Không hiệu quả') && adsUi.includes('ROAS thấp') && adsUi.includes('Thiếu doanh thu ADS'), 'ADS UI thiếu nhãn vấn đề vận hành rõ nghĩa.')
  assert(adsUi.includes('Tạm dừng') && adsUi.includes('Giảm ngân sách') && adsUi.includes('Giữ ADS'), 'ADS UI thiếu action rõ cho từng dòng.')
  assert(adsUi.includes('class="ads-num"'), 'ADS UI phải gắn class số căn phải/tabular.')
  assert(adsUi.includes('<th>Sản phẩm</th><th>SKU</th><th>Shop</th><th class="ads-num">Tồn'), 'Bảng ADS phải có cột số căn phải.')
  assert(
    adsUi.includes('<th>Trạng thái</th><th>Hành động</th>') ||
      adsUi.includes('ads-product-status-stack'),
    'Bảng ADS phải gộp trạng thái rõ ràng và giữ cột hành động riêng.'
  )
}

// Smoke test tĩnh: khóa các lỗi UI thường gặp trước khi kiểm pixel production.
const userFacingPages = [
  'apps/fe/pages/ads.html',
  'apps/fe/pages/promotions.html',
  'apps/fe/pages/oms-dashboard.html',
  'apps/fe/pages/admin-products.html',
  'apps/fe/pages/admin-purchase.html',
  'apps/fe/pages/chat-cskh.html',
  'apps/fe/pages/profit-dashboard.html',
  'apps/fe/pages/scan-qr.html'
].filter(existsSync)

const forbiddenVisibleTerms = [
  'Chi tiết kỹ thuật',
  'request_id',
  'raw log',
  'raw response',
  'payload',
  'endpoint',
  'read-model'
]

for (const path of userFacingPages) {
  const html = read(path)
  for (const term of forbiddenVisibleTerms) {
    assert(!html.includes(`>${term}<`) && !html.includes(`>${term}:`) && !html.includes(`aria-label="${term}"`), `${path} có text kỹ thuật người dùng cuối: ${term}`)
  }
}

const cssFiles = walk('apps/fe/css', path => path.endsWith('.css') && !path.includes(`${join('css', 'theme')}`))
const dynamicCardPattern = /\.(?:summary-card|kpi-card|stat-card|metric-card|info-card|data-card)[\w-]*[^{]*\{[^}]*\bheight\s*:\s*(?:[1-9]\d{1,3}px|[1-9]\d?rem)/gi
const scrollCardPattern = /\.(?:summary-card|kpi-card|stat-card|metric-card)[\w-]*[^{]*\{[^}]*overflow-y\s*:\s*(?:auto|scroll)/gi
const whiteDarkPattern = /background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white)\b/gi

for (const path of cssFiles) {
  const css = read(path)
  assert(!dynamicCardPattern.test(css), `${path} có card/summary/kpi đặt height cố định cho nội dung động.`)
  assert(!scrollCardPattern.test(css), `${path} có summary/kpi/stat dùng overflow-y scroll.`)
  const mustStayDark = path.endsWith(`${join('css', 'ads', 'ads-page.css')}`) || path.endsWith(`${join('css', 'oms-dashboard', 'oms-dashboard.css')}`)
  if (mustStayDark) {
    assert(!whiteDarkPattern.test(css), `${path} có nền trắng trong vùng dark theme, cần dùng token chung hoặc scoped exception.`)
  }
  if (path.endsWith(`${join('css', 'ads', 'ads-page.css')}`)) {
    assert(css.includes('.ads-num') && css.includes('font-variant-numeric:tabular-nums'), `${path} thiếu class số căn phải/tabular.`)
    assert(css.includes('.ads-user-task-grid{display:grid') && css.includes('overflow:visible'), `${path} không được để Việc cần làm hôm nay có scrollbar nội bộ.`)
    assert(css.includes('.ads-user-row-actions.compact'), `${path} thiếu layout action compact cho Top SKU.`)
  }
}

const interactionScripts = [
  'apps/fe/js/dashboard/ads/ads-end-user-ui.js',
  'apps/fe/js/dashboard/promotions-core.js',
  'apps/fe/js/dashboard/promotions-render.js',
  'apps/fe/js/dashboard/promotions-flash.js',
  'apps/fe/js/dashboard/promotions-cleanup.js',
  'apps/fe/js/dashboard/promotions-actions.js'
].filter(existsSync)

for (const path of interactionScripts) {
  const js = read(path)
  assert(/(Chưa có|Không có|trống|empty)/i.test(js), `${path} thiếu dấu hiệu empty state.`)
  assert(/(Đang tải|loading|loader)/i.test(js), `${path} thiếu dấu hiệu loading state.`)
  assert(/(Lỗi|Không tải|failed|error)/i.test(js), `${path} thiếu dấu hiệu error state.`)
}

console.log('UI design system guard smoke passed')
