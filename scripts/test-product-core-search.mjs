import assert from 'node:assert/strict'
import { productSearchNeedles } from '../apps/worker-api/src/core/products/core-product-read-core.js'

const longName = 'Ron PVC ch\u1eb7n khe h\u1edf Thanh cao su d\u00e1n ch\u00e2n c\u1eeda ch\u1ed1ng c\u00f4n tr\u00f9ng c\u00e1ch \u00e2m K75'
const needles = productSearchNeedles(longName)

assert.equal(needles.includes(longName), false)
assert.equal(needles.includes('K75'), true)
assert.ok(needles.length <= 8)
assert.ok(needles.every(item => item.length < 60))

const skuNeedles = productSearchNeedles('K75_MAUNAU5CM1M')
assert.equal(skuNeedles[0], 'K75\\_MAUNAU5CM1M')

const escaped = productSearchNeedles('SKU_50%')
assert.equal(escaped.includes('SKU\\_50\\%'), true)

console.log('product core search guard passed')
