import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { assertShopeeLiveWriteAllowed, mapShopeeError, resolveShopeeClientConfig } from '../apps/worker-api/src/features/shopee/api/baseClient.js'
import { buildShopeeV2BaseString, signShopeeV2 } from '../apps/worker-api/src/features/shopee/api/signature.js'
import { isShopeeAuthExpired } from '../apps/worker-api/src/features/shopee/api/auth.js'
import { maskShopeeSecret, redactShopeeValue } from '../apps/worker-api/src/features/shopee/logs/shopeeLogMask.js'
import { validateShopeeDiscountItemPayload } from '../apps/worker-api/src/features/shopee/api/discount.js'
import { validateShopeeVoucherPayload } from '../apps/worker-api/src/features/shopee/api/voucher.js'
import { validateShopeeBundlePayload } from '../apps/worker-api/src/features/shopee/api/bundleDeal.js'
import { validateShopeeAddOnPayload } from '../apps/worker-api/src/features/shopee/api/addOnDeal.js'
import { validateShopeeFlashSalePayload } from '../apps/worker-api/src/features/shopee/api/flashSale.js'
import { buildShopeeChatTextPayload } from '../apps/worker-api/src/features/shopee/api/chatClient.js'

const env = {
  SHOPEE_ENV: 'live',
  SHOPEE_LIVE_WRITE_ENABLED: 'false',
  SHOPEE_ADS_PARTNER_ID: '1111',
  SHOPEE_ADS_PARTNER_KEY: 'ads_partner_secret_1234',
  SHOPEE_ADS_SHOP_ID: '2222',
  SHOPEE_MARKETPLACE_PARTNER_ID: '3333',
  SHOPEE_MARKETPLACE_PARTNER_KEY: 'marketplace_secret_1234',
  SHOPEE_MARKETPLACE_SHOP_ID: '4444',
  SHOPEE_CHAT_PARTNER_ID: '5555',
  SHOPEE_CHAT_PARTNER_KEY: 'chat_secret_1234',
  SHOPEE_CHAT_SHOP_ID: '6666'
}

const baseString = buildShopeeV2BaseString({
  partnerId: '3333',
  path: '/api/v2/product/get_item_list',
  timestamp: 1710000000,
  accessToken: 'token1234',
  shopId: '4444'
})
assert.equal(baseString, '3333/api/v2/product/get_item_list1710000000token12344444')

const expectedSign = createHmac('sha256', 'marketplace_secret_1234').update(baseString).digest('hex')
const actualSign = await signShopeeV2({
  partnerKey: 'marketplace_secret_1234',
  partnerId: '3333',
  path: '/api/v2/product/get_item_list',
  timestamp: 1710000000,
  accessToken: 'token1234',
  shopId: '4444'
})
assert.equal(actualSign, expectedSign)

assert.equal(maskShopeeSecret('abcd1234wxyz'), 'abcd***wxyz')
assert.deepEqual(redactShopeeValue({ access_token: 'abcd1234wxyz', nested: { partner_key: 'secret1234abcd' } }), {
  access_token: 'abcd***wxyz',
  nested: { partner_key: 'secr***abcd' }
})

assert.equal(resolveShopeeClientConfig(env, { clientType: 'ads_client' }).partnerId, '1111')
assert.equal(resolveShopeeClientConfig(env, { clientType: 'marketplace_client' }).partnerId, '3333')
assert.equal(resolveShopeeClientConfig(env, { clientType: 'chat_client' }).partnerId, '5555')
assert.equal(assertShopeeLiveWriteAllowed(env, 'marketplace_client').error, 'live_write_disabled')
assert.equal(assertShopeeLiveWriteAllowed({ ...env, SHOPEE_LIVE_WRITE_ENABLED: 'true' }, 'marketplace_client'), null)

assert.equal(mapShopeeError({ error: 'no_permission', message: 'no permission to call API' }, 200).category, 'permission_error')
assert.equal(mapShopeeError({ error: 'wrong_sign', message: 'signature mismatch' }, 200).category, 'invalid_signature')
assert.equal(mapShopeeError({ message: 'rate limit exceeded' }, 429).category, 'rate_limited')
assert.equal(isShopeeAuthExpired({ shopee: { category: 'auth_expired' } }), true)

assert.ok(validateShopeeDiscountItemPayload({}).includes('discount_id is required'))
assert.ok(validateShopeeDiscountItemPayload({
  discount_id: 'd1',
  item_list: [{ item_id: 1, model_list: [{ promotion_price: 10 }] }]
}).some(error => error.includes('model_id is required')))
assert.equal(validateShopeeDiscountItemPayload({
  discount_id: 'd1',
  item_list: [{ item_id: 1, model_list: [{ model_id: 2, promotion_price: 10 }] }]
}).length, 0)

assert.ok(validateShopeeVoucherPayload('update', {}).includes('voucher_id is required'))
assert.ok(validateShopeeBundlePayload('update_item', { bundle_deal_id: 'b1' }).includes('item_list is required'))
assert.ok(validateShopeeAddOnPayload('add_main_item', { add_on_deal_id: 'a1' }).includes('item_list is required'))
assert.ok(validateShopeeFlashSalePayload('create', {}).includes('timeslot_id is required from get_time_slot_id'))
assert.ok(validateShopeeFlashSalePayload('update_items', { flash_sale_id: 'f1' }).includes('item_list is required'))
assert.deepEqual(buildShopeeChatTextPayload({ buyer_id: '123', text: 'Dạ shop hỗ trợ mình ạ.' }), {
  to_id: 123,
  message_type: 'text',
  content: { text: 'Dạ shop hỗ trợ mình ạ.' }
})

console.log('Shopee API core tests passed')
