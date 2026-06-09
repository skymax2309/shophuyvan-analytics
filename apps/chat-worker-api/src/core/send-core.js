import { normalizeChatConversation, normalizeChatMessage, newChatId, nowIso, cleanText } from './message-normalize.js'
import { canSendLive, resolveChatCapability, unavailableSendState } from './capability-core.js'
import { getConversationById, getConversationByPlatform, saveConversation } from './conversation-core.js'
import { mergeMessageIntoStore } from './message-merge.js'
import * as shopeeAdapter from '../adapters/shopee.js'
import * as lazadaAdapter from '../adapters/lazada.js'
import * as tiktokAdapter from '../adapters/tiktok.js'
import * as facebookAdapter from '../adapters/facebook.js'
import * as zaloAdapter from '../adapters/zalo.js'
import { evaluateOutboundMessagePolicy } from './ai-policy-core.js'

const CHANNEL_ADAPTERS = {
  shopee: shopeeAdapter,
  lazada: lazadaAdapter,
  tiktok: tiktokAdapter,
  facebook: facebookAdapter,
  zalo: zaloAdapter
}

export function adapterForChannel(channel) {
  return CHANNEL_ADAPTERS[cleanText(channel).toLowerCase()] || null
}

async function resolveConversationForSend(env, input = {}) {
  const explicitId = cleanText(input.conversation_id || input.id)
  let conversation = explicitId ? await getConversationById(env, explicitId) : null
  if (!conversation) conversation = await getConversationByPlatform(env, input)
  if (conversation) return conversation

  const channel = cleanText(input.channel || input.platform).toLowerCase()
  const lazadaSession = cleanText(input.session_id || input.platform_conversation_id || (!/^(conv_|oms-order-|lazada-order-seed-)/.test(explicitId) ? explicitId : ''))
  const lazadaOrderId = cleanText(input.order_id || input.order_sn || input.platform_order_id || input.message?.order_id)
  if (channel === 'lazada' && !lazadaSession && !lazadaOrderId) {
    return {
      __send_error: true,
      ok: false,
      status: 'failed',
      error_code: 'buyer_session_mapping_missing',
      error_message: 'Đơn Lazada chưa map được session_id/conversation_id chính thức từ dữ liệu đồng bộ nên không tạo hội thoại rỗng.'
    }
  }

  const normalized = normalizeChatConversation({
    id: explicitId || (channel === 'lazada' && lazadaOrderId ? `lazada-order-seed-${lazadaOrderId}` : newChatId('conv')),
    channel: input.channel,
    shop_id: input.shop_id,
    customer_id: input.customer_id,
    platform_conversation_id: input.platform_conversation_id || lazadaSession || explicitId,
    status: 'open',
    ...resolveChatCapability(env, input)
  })
  return saveConversation(env, normalized)
}

function adapterFailureResult(errorCode, errorMessage) {
  return {
    ok: false,
    error_code: cleanText(errorCode || 'adapter_error'),
    error_message: cleanText(errorMessage || 'Adapter gửi tin lỗi.')
  }
}

async function sendViaAdapter(env, conversation, message, input = {}) {
  if (message.channel === 'internal') {
    return {
      ok: true,
      platform_message_id: message.platform_message_id || `internal_${message.id}`,
      raw: { mode: 'internal_only' }
    }
  }
  const adapter = adapterForChannel(message.channel)
  if (!adapter?.sendMessage) {
    return adapterFailureResult('adapter_not_implemented', `Kênh ${message.channel} chưa có adapter gửi tin.`)
  }
  return adapter.sendMessage(env, {
    conversation,
    message,
    text: message.text,
    attachments: message.attachments,
    client_temp_id: message.client_temp_id,
    raw_input: input
  })
}

export async function sendChatMessage(env, input = {}) {
  const outboundText = cleanText(input.text || input.content || input.message)
  if (outboundText) {
    const policy = await evaluateOutboundMessagePolicy(env, outboundText)
    if (policy.ok === false) return policy
  }
  const conversation = await resolveConversationForSend(env, input)
  if (conversation?.__send_error) return conversation
  const capability = resolveChatCapability(env, { ...conversation, ...input })
  const clientTempId = cleanText(input.client_temp_id) || newChatId('tmp')
  const sending = normalizeChatMessage({
    ...input,
    id: cleanText(input.id) || newChatId('msg'),
    channel: input.channel || conversation.channel,
    shop_id: input.shop_id || conversation.shop_id,
    conversation_id: conversation.id,
    customer_id: input.customer_id || conversation.customer_id,
    sender_type: 'shop',
    sender_name: input.sender_name || 'Shop',
    text: input.text || input.content || input.message,
    client_temp_id: clientTempId,
    status: 'sending',
    source: input.source || 'manual',
    created_at: input.created_at || nowIso(),
    updated_at: nowIso()
  })

  // Lưu outbound trước khi gọi sàn để frontend luôn có message shop ngay lập tức.
  const saved = await mergeMessageIntoStore(env, sending)

  if (saved.message.channel !== 'internal' && !canSendLive(capability)) {
    const unavailable = unavailableSendState(capability)
    const pending = await mergeMessageIntoStore(env, {
      ...saved.message,
      status: unavailable.status,
      error_code: unavailable.error_code,
      error_message: unavailable.error_message,
      updated_at: nowIso()
    })
    return {
      ok: false,
      status: unavailable.status,
      saved_message: saved.message,
      message: pending.message,
      error_code: pending.message.error_code,
      error_message: pending.message.error_message,
      capability,
      adapter: {
        channel: saved.message.channel,
        ok: false
      }
    }
  }

  let adapterResult
  try {
    adapterResult = await sendViaAdapter(env, conversation, saved.message, input)
  } catch (error) {
    adapterResult = adapterFailureResult(error?.code || 'adapter_exception', error?.message || error)
  }

  if (adapterResult?.ok) {
    const sent = await mergeMessageIntoStore(env, {
      ...saved.message,
      status: 'sent',
      platform_message_id: cleanText(adapterResult.platform_message_id) || saved.message.platform_message_id,
      error_code: '',
      error_message: '',
      updated_at: nowIso()
    })
    return {
      ok: true,
      status: 'sent',
      saved_message: saved.message,
      message: sent.message,
      adapter: {
        channel: saved.message.channel,
        ok: true,
        platform_message_id: cleanText(adapterResult.platform_message_id)
      },
      capability
    }
  }

  const failed = await mergeMessageIntoStore(env, {
    ...saved.message,
    status: 'failed',
    error_code: cleanText(adapterResult?.error_code || adapterResult?.error || 'send_failed'),
    error_message: cleanText(adapterResult?.error_message || adapterResult?.message || 'Không gửi được tin nhắn qua adapter.'),
    updated_at: nowIso()
  })
  return {
    ok: false,
    status: 'failed',
    saved_message: saved.message,
    message: failed.message,
    error_code: failed.message.error_code,
    error_message: failed.message.error_message,
    capability,
    adapter: {
      channel: saved.message.channel,
      ok: false
    }
  }
}

export function listAdapterCapabilities(env = {}) {
  return {
    shopee: { ...shopeeAdapter.getCapabilities(env), ...resolveChatCapability(env, { channel: 'shopee' }) },
    lazada: { ...lazadaAdapter.getCapabilities(env), ...resolveChatCapability(env, { channel: 'lazada' }) },
    tiktok: { ...tiktokAdapter.getCapabilities(env), ...resolveChatCapability(env, { channel: 'tiktok' }) },
    facebook: { ...facebookAdapter.getCapabilities(env), ...resolveChatCapability(env, { channel: 'facebook' }) },
    zalo: { ...zaloAdapter.getCapabilities(env), ...resolveChatCapability(env, { channel: 'zalo' }) },
    internal: { channel: 'internal', send_message: true, mode: 'internal_only', ...resolveChatCapability(env, { channel: 'internal' }) }
  }
}
