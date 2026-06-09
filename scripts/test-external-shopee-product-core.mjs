import assert from 'node:assert/strict'
import {
  getExternalShopeeFullProductByItemId,
  listExternalShopeeFullProducts,
  resolveShopeeApiShop
} from '../apps/worker-api/src/core/external/shopee-product-core.js'

function noop() {}

async function run() {
  assert.equal(typeof resolveShopeeApiShop, 'function')
  assert.equal(typeof listExternalShopeeFullProducts, 'function')
  assert.equal(typeof getExternalShopeeFullProductByItemId, 'function')
  console.log('ok external shopee product core exports')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
