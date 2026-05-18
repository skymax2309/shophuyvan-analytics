import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_CHAT_ENDPOINTS = {
  conversationList: '/api/v2/sellerchat/get_conversation_list',
  unreadConversationCount: '/api/v2/sellerchat/get_unread_conversation_count',
  messageList: '/api/v2/sellerchat/get_message',
  oneConversation: '/api/v2/sellerchat/get_one_conversation',
  sendMessage: '/api/v2/sellerchat/send_message',
  sendAutoReplyMessage: '/api/v2/sellerchat/send_autoreply_message',
  readConversation: '/api/v2/sellerchat/read_conversation',
  uploadImage: '/api/v2/sellerchat/upload_image',
  uploadVideo: '/api/v2/sellerchat/upload_video',
  videoUploadResult: '/api/v2/sellerchat/get_video_upload_result'
}

export function buildShopeeChatTextPayload(input = {}) {
  const toId = Number(input.to_id || input.toId || input.buyer_id || 0)
  const text = String(input.text || input.content || '').trim()
  if (!toId) throw Object.assign(new Error('Thiếu to_id/buyer_id để gửi Shopee Chat.'), { code: 'invalid_payload' })
  if (!text) throw Object.assign(new Error('Thiếu nội dung tin nhắn Shopee Chat.'), { code: 'invalid_payload' })
  return { to_id: toId, message_type: 'text', content: { text } }
}

export async function getShopeeChatConversationList(env, options = {}) {
  return callShopeeApiWithAutoRefresh(env, {
    ...options,
    clientType: 'chat_client',
    path: SHOPEE_CHAT_ENDPOINTS.conversationList,
    params: {
      direction: options.direction || 'latest',
      type: options.type || 'all',
      page_size: Math.min(Math.max(Number(options.page_size || 1) || 1, 1), 50),
      ...(options.offset ? { offset: options.offset } : {})
    }
  })
}

export async function sendShopeeChatText(env, options = {}) {
  return callShopeeApiWithAutoRefresh(env, {
    ...options,
    clientType: 'chat_client',
    path: SHOPEE_CHAT_ENDPOINTS.sendMessage,
    method: 'POST',
    body: buildShopeeChatTextPayload(options)
  })
}
