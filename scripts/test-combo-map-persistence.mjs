import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

const variationRoute = readFileSync(repoFile('apps/worker-api/src/routes/products/cost-variations-handler.js'), 'utf8')
assert.ok(variationRoute.includes('quickPlatform') && variationRoute.includes('quickShop'), 'Quick map must persist with platform/shop scope')
assert.ok(variationRoute.includes('ON CONFLICT(platform, shop, platform_sku)'), 'Quick map must upsert product_variations by scoped unique key')
assert.ok(variationRoute.includes("product_variations.map_status = 'MAPPED' THEN product_variations.internal_sku"), 'Catalog sync must preserve existing MAPPED internal_sku')
assert.ok(variationRoute.includes("product_variations.map_status = 'MAPPED' THEN product_variations.mapped_items"), 'Catalog sync must preserve existing MAPPED combo components')

const orderRoute = readFileSync(repoFile('apps/worker-api/src/routes/orders/read-update-webhook.js'), 'utf8')
assert.ok(orderRoute.includes('show_update_cost_button: !hasCost'), 'Order read model must suppress update-cost button when any valid cost exists')
assert.ok(orderRoute.includes("mapping_status: hasProductCore ? 'mapped' : (hasCost ? 'combo_mapped' : 'unmapped')"), 'Order read model must expose combo_mapped for cost snapshots without product_core')

const omsRender = readFileSync(repoFile('apps/fe/js/modules/oms-render.js'), 'utf8')
assert.ok(omsRender.includes('show_update_cost_button === true'), 'OMS must render cost button only from Core show_update_cost_button')
assert.ok(omsRender.includes('openMapModal(JSON.parse(decodeURIComponent'), 'OMS quick map must send structured item context')

const costResolution = readFileSync(repoFile('apps/worker-api/src/routes/orders/cost-resolution.js'), 'utf8')
assert.ok(costResolution.includes('`${platform}|${shop}|${key}`'), 'Cost resolution must prefer platform/shop scoped combo map keys')

console.log('combo map persistence guard passed')
