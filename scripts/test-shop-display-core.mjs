import assert from 'node:assert/strict'

import { buildPublicShopRows, isRawShopIdentity } from '../apps/worker-api/src/core/shops/display-core.js'

assert.equal(isRawShopIdentity('170044686', 'shopee'), true)
assert.equal(isRawShopIdentity('Shopee 166563639', 'shopee'), true)
assert.equal(isRawShopIdentity('0909128999', 'tiktok'), false)
assert.equal(isRawShopIdentity('chihuy1984', 'shopee'), false)

const rows = buildPublicShopRows(
  [
    { platform: 'shopee', shop_name: 'Shopee 166563639', user_name: '166563639', api_shop_id: '166563639' },
    { platform: 'shopee', shop_name: 'chihuy2309', user_name: '', api_shop_id: '166563639' },
    { platform: 'shopee', shop_name: 'Shopee 170044686', user_name: '170044686', api_shop_id: '170044686' },
    { platform: 'shopee', shop_name: 'khogiadungcona', user_name: 'khogiadungcona', api_shop_id: '' }
  ],
  [
    { platform: 'shopee', shop_name: 'Shopee 166563639' },
    { platform: 'shopee', shop_name: '170044686' },
    { platform: 'tiktok', shop_name: '0909128999' },
    { platform: 'shopee', shop_name: 'khogiadungcona' }
  ]
)

assert.deepEqual(rows, [
  { platform: 'shopee', shop_name: 'chihuy2309' },
  { platform: 'shopee', shop_name: 'khogiadungcona' },
  { platform: 'tiktok', shop_name: '0909128999' }
])
assert.equal(rows.some(row => /^Shopee\s+\d+$/i.test(row.shop_name)), false)
assert.equal(rows.some(row => row.platform !== 'tiktok' && /^\d{6,}$/.test(row.shop_name)), false)

console.log('shop display core guard tests passed')
