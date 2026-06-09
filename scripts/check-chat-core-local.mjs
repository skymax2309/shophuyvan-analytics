import { saveConversation, listConversations, listMessagesByConversation, markConversationRead } from '../apps/chat-worker-api/src/core/conversation-core.js'
import { pushBrowserHelperPayload } from '../apps/chat-worker-api/src/core/browser-helper-core.js'
import { mergeMessageIntoStore, mergeMessageList } from '../apps/chat-worker-api/src/core/message-merge.js'
import { sendChatMessage } from '../apps/chat-worker-api/src/core/send-core.js'
import { handleSyncRoute } from '../apps/chat-worker-api/src/routes/sync.js'

const env = {}
const now = new Date().toISOString()

const conversation = await saveConversation(env, {
  id: 'conv_test_internal',
  channel: 'internal',
  shop_id: 'test_shop',
  customer_id: 'test_customer',
  platform_conversation_id: 'platform_conv_test',
  last_message_text: 'Seed',
  last_message_at: now
})

const sent = await sendChatMessage(env, {
  channel: 'internal',
  shop_id: conversation.shop_id,
  conversation_id: conversation.id,
  customer_id: conversation.customer_id,
  text: 'Tin local phải chuyển sent',
  client_temp_id: 'tmp_internal_1'
})

if (!sent.ok || sent.message.status !== 'sent') {
  throw new Error('internal_send_not_sent')
}

const shopeeConversation = await saveConversation(env, {
  id: 'conv_test_shopee',
  channel: 'shopee',
  shop_id: 'test_shop',
  shop_display_name: 'Shop Test',
  customer_id: 'buyer_1',
  customer_name: 'Khách Test',
  platform_conversation_id: 'shopee_conv_1',
  last_message_text: 'Seed Shopee',
  last_message_at: now
})

const storedShopee = (await listConversations(env, { channel: 'shopee', q: 'Khách Test', limit: 5 }))[0]
if (storedShopee?.customer_name !== 'Khách Test') throw new Error('customer_name_not_preserved')
if (storedShopee?.shop_display_name !== 'Shop Test') throw new Error('shop_display_name_not_preserved')

const failed = await sendChatMessage(env, {
  channel: 'shopee',
  shop_id: shopeeConversation.shop_id,
  conversation_id: shopeeConversation.id,
  customer_id: shopeeConversation.customer_id,
  text: 'Tin sàn thiếu adapter phải failed',
  client_temp_id: 'tmp_shopee_1'
})

if (failed.ok || failed.message.status !== 'failed' || failed.error_code !== 'adapter_not_configured') {
  throw new Error('shopee_missing_adapter_not_failed')
}

await mergeMessageIntoStore(env, {
  ...failed.message,
  status: 'sent',
  platform_message_id: 'platform_msg_1',
  client_temp_id: 'tmp_shopee_1'
})

const messages = await listMessagesByConversation(env, shopeeConversation.id)
if (messages.length !== 1) throw new Error(`dedupe_failed_${messages.length}`)
if (messages[0].platform_message_id !== 'platform_msg_1') throw new Error('platform_message_id_not_merged')

const crossShopMerge = mergeMessageList([{
  id: 'msg_shop_a',
  channel: 'zalo',
  shop_id: 'zalo_shop_a',
  conversation_id: 'conv_a',
  sender_type: 'customer',
  text: 'Ok a',
  platform_message_id: 'zalo_local_same_visible_id',
  created_at: now
}], [{
  id: 'msg_shop_b',
  channel: 'zalo',
  shop_id: 'zalo_shop_b',
  conversation_id: 'conv_b',
  sender_type: 'customer',
  text: 'Ok a',
  platform_message_id: 'zalo_local_same_visible_id',
  created_at: now
}])
if (crossShopMerge.length !== 2) throw new Error('platform_message_id_must_not_merge_cross_shop')

const helperSyncResponse = await handleSyncRoute(new Request('https://local.test/api/chat/sync', {
  method: 'POST',
  body: JSON.stringify({ channel: 'tiktok', shop_id: 'manual_shop' })
}), env)
if (helperSyncResponse.status !== 200) throw new Error(`helper_sync_status_${helperSyncResponse.status}`)

const helperPush = await pushBrowserHelperPayload(env, {
  channel: 'tiktok',
  shop_id: '0909128999',
  conversations: [{
    platform_conversation_id: 'automation-tiktok-customer-a',
    messages: [{
      sender_type: 'shop',
      sender_name: 'Shop Huy Vân',
      buyer_name: 'Nguyen Van A',
      content: 'Trạng thái Đã giao',
      sent_at: now
    }, {
      sender_type: 'customer',
      sender_name: 'Nguyen Van A',
      buyer_name: 'Nguyen Van A',
      content: 'Đơn hàng 584128214410102531',
      media_items: [{ type: 'order', order_sn: '584128214410102531', item_id: '1730655569230465831', name: 'Đơn hàng 584128214410102531' }],
      sent_at: now
    }]
  }]
})
if (!helperPush.ok || helperPush.saved_messages !== 2) throw new Error('browser_helper_push_failed')
const helperConversations = await listConversations(env, { channel: 'tiktok', q: 'Nguyen Van A', limit: 5 })
const helperConversation = helperConversations.find(item => item.shop_id === '0909128999')
if (!helperConversation || helperConversation.customer_name !== 'Nguyen Van A') throw new Error('browser_helper_customer_name_missing')
const helperMessages = await listMessagesByConversation(env, helperConversation.id)
if (!helperMessages.some(item => item.order_id === '584128214410102531')) throw new Error('browser_helper_order_id_missing')
if (!helperMessages.some(item => (item.product_ids || []).includes('1730655569230465831'))) throw new Error('browser_helper_product_id_missing')

await saveConversation(env, {
  id: 'conv_read_lock',
  channel: 'shopee',
  shop_id: 'read_shop',
  customer_id: 'buyer_read',
  platform_conversation_id: 'conversation_read_lock'
})
const originalInbound = {
  id: 'msg_read_1',
  channel: 'shopee',
  shop_id: 'read_shop',
  conversation_id: 'conv_read_lock',
  customer_id: 'buyer_read',
  sender_type: 'customer',
  text: 'Tin khách cần đọc',
  platform_message_id: 'platform_read_1',
  status: 'synced',
  created_at: now
}
await mergeMessageIntoStore(env, originalInbound)
let readLockConversation = (await listConversations(env, { channel: 'shopee', shop_id: 'read_shop', limit: 5 }))[0]
if (readLockConversation.unread_count !== 1) throw new Error('new_customer_message_must_be_unread')
await markConversationRead(env, 'conv_read_lock')
await mergeMessageIntoStore(env, originalInbound)
await mergeMessageIntoStore(env, originalInbound)
readLockConversation = (await listConversations(env, { channel: 'shopee', shop_id: 'read_shop', limit: 5 }))[0]
if (readLockConversation.unread_count !== 0) throw new Error('duplicate_sync_must_not_restore_unread_after_read')
const duplicateSyncUnread = readLockConversation.unread_count
const newerShopAt = new Date(Date.parse(now) + 60_000).toISOString()
await mergeMessageIntoStore(env, {
  id: 'msg_read_shop_latest',
  channel: 'shopee',
  shop_id: 'read_shop',
  conversation_id: 'conv_read_lock',
  customer_id: 'buyer_read',
  sender_type: 'shop',
  text: 'Shop đã trả lời mới nhất',
  platform_message_id: 'platform_read_shop_latest',
  status: 'synced',
  created_at: newerShopAt
})
await mergeMessageIntoStore(env, originalInbound)
readLockConversation = (await listConversations(env, { channel: 'shopee', shop_id: 'read_shop', limit: 5 }))[0]
if (readLockConversation.last_message_text !== 'Shop đã trả lời mới nhất' || readLockConversation.last_message_at !== newerShopAt) {
  throw new Error('duplicate_history_must_not_replace_latest_message')
}
await mergeMessageIntoStore(env, {
  ...originalInbound,
  id: 'msg_read_2',
  platform_message_id: 'platform_read_2',
  text: 'Tin khách mới sau khi đã đọc',
  created_at: new Date(Date.parse(newerShopAt) + 60_000).toISOString()
})
readLockConversation = (await listConversations(env, { channel: 'shopee', shop_id: 'read_shop', limit: 5 }))[0]
if (readLockConversation.unread_count !== 1) throw new Error('new_inbound_after_read_must_restore_unread')

console.log(JSON.stringify({
  ok: true,
  internal_status: sent.message.status,
  shopee_failed_status: failed.message.status,
  shopee_error_code: failed.error_code,
  dedupe_messages: messages.length,
  cross_shop_platform_rows: crossShopMerge.length,
  helper_sync_status: helperSyncResponse.status,
  browser_helper_customer_name: helperConversation.customer_name,
  browser_helper_order_id: helperMessages.find(item => item.order_id)?.order_id,
  duplicate_sync_after_read_unread: duplicateSyncUnread,
  new_inbound_after_read_unread: readLockConversation.unread_count,
  latest_message_guard: readLockConversation.last_message_text
}, null, 2))
