import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  extractVietnamPhoneFromChatText,
  marketplaceContactFromChatEvent,
  marketplaceContactFromLazadaOrder,
  normalizeVietnamPhone
} from '../apps/worker-api/src/core/customer/contacts-core.js'

assert.equal(normalizeVietnamPhone('(+84)098 761 8905'), '0987618905')
assert.equal(normalizeVietnamPhone('+84987618905'), '0987618905')

const contact = marketplaceContactFromLazadaOrder(
  { shop_name: 'kinhdoanhonlinegiasoc@gmail.com' },
  {
    order_id: '528922543424254',
    customer_first_name: 'Nguyen Van A',
    payment_method: 'COD',
    created_at: '2026-05-27 10:00:00',
    price: '120000',
    address_shipping: {
      first_name: 'Nguyen Van A',
      phone: '+84987618905',
      address1: 'So 1 Duong A',
      address2: 'Phuong B',
      address3: 'Quan C',
      address4: 'Ho Chi Minh',
      country: 'VN'
    }
  }
)

assert.equal(contact.platform, 'lazada')
assert.equal(contact.source_order_id, '528922543424254')
assert.equal(contact.phone_normalized, '0987618905')
assert.equal(contact.recipient_name, 'Nguyen Van A')
assert.match(contact.address_text, /So 1 Duong A/)

assert.equal(extractVietnamPhoneFromChatText('SĐT +84 912 345 678'), '0912345678')

const chatContact = marketplaceContactFromChatEvent({
  channel: 'zalo',
  shop_id: 'zalo_shop_huy_van_0909128999',
  conversation_id: 'conv_zalo_1',
  customer_id: 'zalo_user_1',
  sender_name: 'Nguyen Van B',
  platform_message_id: 'zalo_msg_1',
  text: 'Tên: Nguyen Van B\nSĐT: 0912 345 678\nĐịa chỉ: 12 Đường A, Phường B, Quận C, TP HCM',
  sent_at: '2026-06-03T03:00:00.000Z'
})

assert.equal(chatContact.platform, 'zalo')
assert.equal(chatContact.shop, 'zalo_shop_huy_van_0909128999')
assert.equal(chatContact.contact_key, 'zalo|zalo_shop_huy_van_0909128999|buyer:zalo_user_1|phone:0912345678')
assert.equal(chatContact.phone_normalized, '0912345678')
assert.equal(chatContact.recipient_name, 'Nguyen Van B')
assert.match(chatContact.address_text, /Đường A/)
assert.equal(chatContact.consent_status, 'unknown')
assert.equal(chatContact.contact_status, 'not_contacted')

const mojibakeChatContact = marketplaceContactFromChatEvent({
  channel: 'zalo',
  shop_id: 'zalo_nghiem_chi_huy_0848881111',
  customer_id: 'zalo_user_2',
  sender_name: 'SiÃªu Thá» Äiá»n MÃ¡y Tháº¯ng Háº±ng',
  text: 'SÄT: 0983771346\nÄá»a chá»: sá» 66 phá» Ba ThÃ¡ thÃ´n PhÃ¹ YÃªn xÃ£ á»©ng ThiÃªn HÃ  Ná»i'
})
assert.equal(mojibakeChatContact.phone_normalized, '0983771346')
assert.match(mojibakeChatContact.recipient_name, /Siêu Thị/)
assert.match(mojibakeChatContact.address_text, /số 66/)
assert.doesNotMatch(mojibakeChatContact.address_text, /Ã|áº|Ä/)

const contactsCore = readFileSync('apps/worker-api/src/core/customer/contacts-core.js', 'utf8')
assert.match(
  contactsCore,
  /CREATE TABLE IF NOT EXISTS marketplace_customer_contact_orders/,
  'Customer Core phải lưu dấu từng đơn đã nhập cho mỗi contact để rebuild không cộng trùng.'
)
assert.doesNotMatch(
  contactsCore,
  /DELETE FROM marketplace_customer_contacts/,
  'Customer rebuild không được xóa bảng contact cũ trước khi ghi dữ liệu mới.'
)
assert.match(
  contactsCore,
  /ON CONFLICT\(contact_key\) DO UPDATE SET/,
  'Customer Core phải upsert/merge contact thay vì replace dữ liệu cũ.'
)

console.log('customer contacts core ok')
