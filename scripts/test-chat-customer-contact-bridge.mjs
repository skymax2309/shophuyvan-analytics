import assert from 'node:assert/strict'
import {
  buildCustomerContactEvent,
  forwardCustomerContactFromChatMessage,
  shouldForwardCustomerContactMessage
} from '../apps/chat-worker-api/src/core/customer-contact-bridge-core.js'

const customerMessage = {
  id: 'msg_zalo_contact_1',
  channel: 'zalo',
  shop_id: 'zalo_shop_huy_van_0909128999',
  conversation_id: 'conv_zalo_contact_1',
  customer_id: 'zalo_customer_1',
  sender_type: 'customer',
  sender_name: 'Nguyen Van B',
  text: 'Tên: Nguyen Van B\nSĐT: 0912 345 678\nĐịa chỉ: 12 Đường A, Phường B, Quận C, TP HCM',
  platform_message_id: 'zalo_msg_contact_1',
  created_at: '2026-06-03T03:00:00.000Z',
  source: 'local_browser'
}

assert.equal(shouldForwardCustomerContactMessage(customerMessage), true)
assert.equal(shouldForwardCustomerContactMessage({ ...customerMessage, sender_type: 'shop' }), false)
assert.equal(shouldForwardCustomerContactMessage({ ...customerMessage, channel: 'internal' }), false)

const promoNoiseMessage = {
  ...customerMessage,
  id: 'msg_zalo_promo_noise',
  text: 'DEAL KHỦNG TRAO TAY - NHẬN NGAY QUÀ TẶNG CỰC CHẤT TẠI STORE DETAILING. Ưu đãi giảm giá 30% cho dịch vụ chăm sóc xe chuyên nghiệp, hotline 0908 094 790, chương trình áp dụng trong hôm nay.'
}
assert.equal(shouldForwardCustomerContactMessage(promoNoiseMessage), false)
assert.equal(
  shouldForwardCustomerContactMessage({
    ...customerMessage,
    id: 'msg_zalo_business_phone_noise',
    text: 'Sửa chữa điện thoại Thuận Phát Mobile nhận thay màn hình, ép kính, thay pin, hỗ trợ khách hàng qua 0937 970 101 mỗi ngày.'
  }),
  false
)
assert.equal(
  shouldForwardCustomerContactMessage({
    ...customerMessage,
    id: 'msg_zalo_business_broadcast_with_sdt',
    sender_name: 'Sửa chữa điện thoại - Thuận Phát Mobile',
    text: 'Công ty sửa chữa ĐTDĐ THUẬN PHÁT MOBILE Sđt: 0937970101 Xin chân thành cám ơn và rất Hân hạnh được phục vụ Quý Khách Chi nhánh 3: 118 Nguyễn Sơn, P. Phú Thọ Hòa, Q. Tân Phú, HCM.'
  }),
  false
)
assert.equal(
  shouldForwardCustomerContactMessage({
    ...customerMessage,
    id: 'msg_zalo_wrong_conversation_address',
    sender_name: 'COOP FOOD',
    text: 'Địa chỉ số 66 phố Ba Thá thôn Phù Yên xã ứng Thiên Hà Nội 0983771346 điện máy Thắng hằng'
  }),
  false
)
assert.equal(
  shouldForwardCustomerContactMessage({
    ...customerMessage,
    id: 'msg_zalo_matching_sender_address',
    sender_name: 'Siêu Thị Điện Máy Thắng Hằng',
    text: 'Địa chỉ số 66 phố Ba Thá thôn Phù Yên xã ứng Thiên Hà Nội 0983771346 điện máy Thắng hằng'
  }),
  true
)

const event = buildCustomerContactEvent(customerMessage)
assert.equal(event.channel, 'zalo')
assert.equal(event.shop_id, 'zalo_shop_huy_van_0909128999')
assert.equal(event.customer_id, 'zalo_customer_1')
assert.equal(event.sender_name, 'Nguyen Van B')

let captured = null
const env = {
  SHOP_CORE_API_BASE: 'https://core.example.test',
  CUSTOMER_CONTACT_BRIDGE_SECRET: 'secret-test',
  CORE_FETCH: async (url, options) => {
    captured = { url, options }
    return {
      ok: true,
      status: 200,
      async json() {
        return { status: 'ok', upserted: 1, skipped: 0 }
      }
    }
  }
}

const result = await forwardCustomerContactFromChatMessage(env, customerMessage)
assert.equal(result.ok, true)
assert.equal(result.status, 'forwarded')
assert.equal(captured.url, 'https://core.example.test/api/customers/marketplace/chat-ingest')
assert.equal(captured.options.headers['X-Chat-Bridge-Secret'], 'secret-test')
assert.equal(JSON.parse(captured.options.body).event.platform_message_id, 'zalo_msg_contact_1')

const skipped = await forwardCustomerContactFromChatMessage(env, { ...customerMessage, text: 'Ok a' })
assert.equal(skipped.status, 'skipped')

console.log('chat customer contact bridge ok')
