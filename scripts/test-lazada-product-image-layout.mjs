import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))
const read = path => readFileSync(repoFile(path), 'utf8')

const lazadaSync = read('apps/worker-api/src/routes/api-sync/lazada/orders/sync.js')
const orderRead = read('apps/worker-api/src/routes/orders/read-update-webhook.js')
const omsRender = read('apps/fe/js/modules/oms-render.js')
const ordersCss = read('apps/fe/css/oms-dashboard/orders-table.css')

assert.ok(lazadaSync.includes('normalizeLazadaItemImage'), 'Lazada order item sync must normalize item image URLs from API fields')
assert.ok(lazadaSync.includes('product_main_image'), 'Lazada item image mapping must read product_main_image')
assert.ok(lazadaSync.includes('sku_image'), 'Lazada item image mapping must read sku_image')
assert.ok(
  orderRead.includes("NULLIF(TRIM(oi.image_url), '')")
    && orderRead.includes("NULLIF(TRIM(p.image_url), '')")
    && orderRead.includes('product_variations v'),
  'Order read model must fall back to Product Core image'
)
assert.ok(omsRender.includes('product-img-placeholder'), 'OMS must render a controlled missing-image placeholder')
assert.ok(!omsRender.includes('<div class="product-img-placeholder">📦</div>'), 'Missing product images must not use the old large emoji placeholder')
assert.ok(ordersCss.includes('width: 32px; height: 32px;'), 'Missing image placeholder must stay compact')

console.log('lazada product image layout guard passed')
