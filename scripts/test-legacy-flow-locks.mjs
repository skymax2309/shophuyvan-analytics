import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function readRepo(path) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function collectFiles(root, exts = new Set(['.js', '.mjs', '.py'])) {
  if (!existsSync(root)) return []
  const out = []
  for (const name of readdirSync(root)) {
    const full = join(root, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(name)) continue
      out.push(...collectFiles(full, exts))
    } else if (exts.has(extname(name))) {
      out.push(full)
    }
  }
  return out
}

const fileRoutes = readRepo('apps/worker-api/src/worker-router/file-routes.js')
assert.match(fileRoutes, /\/api\/labels\/refresh\//, 'Legacy label refresh route phải còn wrapper')
assert.match(fileRoutes, /legacy_label_refresh_route_disabled/, 'Legacy label refresh route phải trả lỗi rõ')
assert.match(fileRoutes, /status:\s*410/, 'Legacy label refresh route phải trả 410')

const frontendFiles = collectFiles(join(repoRoot, 'apps/fe/js'))
for (const file of frontendFiles) {
  const text = readFileSync(file, 'utf8')
  assert.ok(
    !text.includes('/api/labels/refresh'),
    `${relative(repoRoot, file)} không được gọi route legacy /api/labels/refresh`
  )
}

const labelRoute = readRepo('apps/worker-api/src/routes/labels/index.js')
for (const forbidden of [
  '/api/v2/logistics/ship_order',
  'allowCreate'
]) {
  assert.ok(!labelRoute.includes(forbidden), `Worker label route không được chứa ${forbidden}`)
}
assert.ok(labelRoute.includes('/api/v2/logistics/create_shipping_document'), 'Shopee label route được dùng create_shipping_document cho chứng từ in')
assert.ok(labelRoute.includes('/api/v2/logistics/get_shipping_document_result'), 'Shopee label route được poll get_shipping_document_result cho chứng từ in')
assert.ok(labelRoute.includes('allowDocumentGenerate: true'), 'Tạo chứng từ in phải nằm sau guard allowDocumentGenerate')
assert.ok(labelRoute.includes('allowFulfillmentAction: false'), 'Flow tải tem phải khóa fulfillment action')

const statusAndDetailFiles = [
  'apps/worker-api/src/core/orders/status-automation-core.js',
  'apps/worker-api/src/core/orders/shopee-seller-center-detail-core.js',
  'apps/worker-api/src/routes/orders/shopee-seller-center-detail.js'
]
for (const path of statusAndDetailFiles) {
  const text = readRepo(path)
  assert.ok(!/\/api\/v2\/logistics\/(create_shipping_document|get_shipping_document_result|ship_order|arrange|cancel|confirm)/i.test(text), `${path} không được gọi marketplace action nguy hiểm`)
}

const pythonShopeeProcess = 'E:/shophuyvan-python-automation/oms_python/platforms/shopee/orders/taitem.py'
if (existsSync(pythonShopeeProcess)) {
  const text = readFileSync(pythonShopeeProcess, 'utf8')
  assert.ok(!text.includes('/api/v2/logistics/create_shipping_document'), 'Python Shopee helper không được tạo shipping document')
  assert.ok(!text.includes('/api/v2/logistics/get_shipping_document_result'), 'Python Shopee helper không được poll document tạo mới')
  assert.ok(!text.includes('/api/v2/logistics/ship_order'), 'Python Shopee helper không được ship_order trong flow label cleanup')
  assert.match(text, /PREPARE_BUTTON_SELECTORS\s*=\s*\[\]/, 'Python Shopee helper phải khóa selector Chuẩn bị/Sắp xếp')
  assert.match(text, /CONFIRM_BUTTON_SELECTORS\s*=\s*\[\]/, 'Python Shopee helper phải khóa selector Xác nhận')
}

for (const path of [
  'E:/shophuyvan-python-automation/oms_python/ui/tabs/oms_radar_tab.py',
  'E:/shophuyvan-python-automation/oms_python/ui/tabs/sync_order_tab.py'
]) {
  if (!existsSync(path)) continue
  const text = readFileSync(path, 'utf8')
  assert.match(text, /legacy_refresh_label_disabled/, `${path} phải từ chối job refresh_label legacy`)
}

console.log('legacy flow locks guard passed')
