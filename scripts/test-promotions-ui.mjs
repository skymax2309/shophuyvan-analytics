import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Script } from 'node:vm'

function read(path) {
  return readFileSync(path, 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const htmlPath = 'apps/fe/pages/promotions.html'
assert(existsSync(htmlPath), 'Thiếu trang Khuyến mãi sàn.')
const html = read(htmlPath)

const expectedScripts = [
  '../js/dashboard/promotions-core.js?v=promotions-20260526g',
  '../js/dashboard/promotions-api.js?v=promotions-20260526g',
  '../js/dashboard/promotions-render.js?v=promotions-20260526g',
  '../js/dashboard/promotions-flash.js?v=promotions-20260526g',
  '../js/dashboard/promotions-cleanup.js?v=promotions-20260526g',
  '../js/dashboard/promotions-actions.js?v=promotions-20260526g'
]

let lastIndex = -1
for (const src of expectedScripts) {
  const index = html.indexOf(src)
  assert(index > lastIndex, `promotions.html thiếu hoặc sai thứ tự script: ${src}`)
  lastIndex = index
}

assert(!html.includes('promotions.js?v='), 'promotions.html còn load promotions.js cũ.')

const jsFiles = [
  'apps/fe/js/dashboard/promotions-core.js',
  'apps/fe/js/dashboard/promotions-api.js',
  'apps/fe/js/dashboard/promotions-render.js',
  'apps/fe/js/dashboard/promotions-flash.js',
  'apps/fe/js/dashboard/promotions-cleanup.js',
  'apps/fe/js/dashboard/promotions-actions.js'
]

for (const file of jsFiles) {
  assert(existsSync(file), `Thiếu file UI mới: ${file}`)
  const source = read(file)
  new Script(source, { filename: file })
  assert(!source.includes('window.confirm'), `${file} còn dùng window.confirm.`)
  assert(!/\bconfirm\s*\(/.test(source), `${file} còn gọi confirm trực tiếp.`)
  assert(!/\brawEsc\b/.test(source), `${file} còn rawEsc.`)
  assert(!/\bhelpIcon\b/.test(source), `${file} còn helpIcon.`)
  assert(!/TODO|stub|debugger|console\.log/.test(source), `${file} còn TODO/stub/debug.`)
}

const core = read('apps/fe/js/dashboard/promotions-core.js')
for (const label of [
  'Shopee Giảm giá',
  'Shopee Voucher',
  'Shopee Combo',
  'Shopee Mua kèm',
  'Shopee Flash Sale',
  'Lazada Voucher',
  'Lazada Freeship',
  'Lazada Flexicombo'
]) {
  assert(core.includes(label), `Thiếu module tiếng Việt: ${label}`)
}

assert(!core.includes('Shopee Bundle') && !core.includes('Shopee Add-On'), 'Còn label module tiếng Anh cũ.')
assert(/if \(value === null \|\| value === undefined \|\| value === ''\) return '-'/.test(core), 'money(null) chưa trả về dấu gạch.')
assert(/if \(n === 0\) return '0đ'/.test(core), 'money(0) chưa trả 0đ.')

const flash = read('apps/fe/js/dashboard/promotions-flash.js')
for (const fn of [
  'addFlashSchedule',
  'updateFlashSchedule',
  'toggleFlashSchedule',
  'removeFlashSchedule',
  'openProductPicker',
  'closeProductPicker',
  'renderProductPicker',
  'renderPickerItems',
  'filterProductPicker',
  'togglePickerProduct',
  'updatePickerProductPrice',
  'removeSelectedProduct',
  'editFlashProduct',
  'applyFlashProductEdit'
]) {
  assert(flash.includes(fn), `Thiếu hàm Flash Sale: ${fn}`)
}
assert(flash.includes('flash_${Date.now()}'), 'Khung giờ Flash Sale chưa dùng id string theo thời gian.')
assert(flash.includes('selectedProducts'), 'Flash Sale chưa lưu sản phẩm đã chọn theo luật.')

const css = read('apps/fe/css/dashboard/promotions-page.css')
assert(css.includes('.promo-drawer') && css.includes('@media (min-width:760px)'), 'CSS promotion thiếu drawer hoặc responsive tablet/desktop.')
assert(!/background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white)\b/i.test(css), 'CSS promotion còn nền trắng trong dark theme.')

console.log('Promotion UI static checks passed')
