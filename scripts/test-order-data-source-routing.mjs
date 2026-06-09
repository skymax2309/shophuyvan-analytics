import assert from 'node:assert/strict'

import {
  resolveOrderDataSource,
  sellerCenterFallbackAllowed
} from '../apps/worker-api/src/core/orders/order-data-source-resolver.js'

for (const shop of ['chihuy1984', 'chihuy2309', 'phambich2312', 'kinhdoanhonlinegiasoc@gmail.com']) {
  const resolved = resolveOrderDataSource({
    platform: 'shopee',
    shop,
    source_mode: 'browser_sync',
    last_status_sync_error: 'seller_center_detail_url_not_found'
  })
  assert.equal(resolved.source_priority, 'official_api_first', `${shop} phải ưu tiên Shopee Open Platform`)
  assert.equal(resolved.source_label, 'API')
  assert.equal(resolved.seller_center_allowed, false)
  assert.equal(resolved.docs_checked, true)
  assert.equal(resolved.source_mismatch, 'api_shop_routed_to_seller_center')
  assert.equal(sellerCenterFallbackAllowed({ platform: 'shopee', shop }), false)
}

const shopeeManual = resolveOrderDataSource({ platform: 'shopee', shop: 'khogiadungcona' })
assert.equal(shopeeManual.source_priority, 'seller_center_fallback')
assert.equal(shopeeManual.source_label, 'Seller Center')
assert.equal(shopeeManual.seller_center_allowed, true)

const tiktok = resolveOrderDataSource({ platform: 'tiktok', shop: '0909128999' })
assert.equal(tiktok.source_priority, 'tiktok_seller_center_or_manual')
assert.equal(tiktok.source_label, 'Manual')
assert.equal(tiktok.fallback_allowed, true)

const lazada = resolveOrderDataSource({ platform: 'lazada', shop: 'kinhdoanhonlinegiasoc@gmail.com' })
assert.equal(lazada.source_priority, 'official_api_first')
assert.equal(lazada.source_label, 'API')
assert.equal(lazada.seller_center_allowed, false)

console.log('order data source routing guard passed')
