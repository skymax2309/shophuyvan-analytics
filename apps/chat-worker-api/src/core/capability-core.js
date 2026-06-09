import {
  cleanText,
  normalizeChannel,
  normalizeSendCapability,
  normalizeShopChatMode,
  normalizeSyncCapability
} from './message-normalize.js'

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function minutesAgo(value) {
  const timestamp = Date.parse(cleanText(value))
  if (!Number.isFinite(timestamp)) return null
  return Math.max(Math.floor((Date.now() - timestamp) / 60000), 0)
}

function diagnostic(channel, rootCause, minutes, suggestedAction, recoverySteps = [], extra = {}) {
  return {
    channel,
    root_cause: rootCause,
    last_synced_minutes_ago: minutes,
    suggested_action: suggestedAction,
    recovery_steps: recoverySteps,
    ...extra
  }
}

export function diagnoseCapabilityIssue(env = {}, conversation = {}) {
  const channel = normalizeChannel(conversation.channel)
  const capability = resolveChatCapability(env, conversation)
  const lastSyncedMinutesAgo = minutesAgo(conversation.last_synced_at)
  const lastErrorCode = cleanText(conversation.last_error_code)
  const lastErrorMessage = cleanText(conversation.last_error_message)

  if (capability.sync_capability === 'webhook' && (lastSyncedMinutesAgo === null || lastSyncedMinutesAgo >= 10)) {
    return diagnostic(channel, 'webhook_stale', lastSyncedMinutesAgo, 'Kiểm tra webhook Shopee/Lazada và secret HMAC trong Cloudflare.', [
      'Mở Cloudflare Worker shophuyvan-chat-api.',
      'Kiểm tra secret webhook của đúng kênh.',
      'Gửi lại webhook test từ Open Platform.',
      'Chạy Sync ngay nếu webhook bị miss.'
    ], { capability })
  }
  if (capability.sync_capability === 'polling_api' && lastErrorCode) {
    return diagnostic(channel, 'polling_error', lastSyncedMinutesAgo, 'Kiểm tra bridge API, token và quyền chat của shop.', [
      'Mở log route /api/chat/sync.',
      'Kiểm tra token bridge còn hạn không.',
      'Chạy Sync ngay sau khi sửa quyền.'
    ], { capability, last_error_code: lastErrorCode, last_error_message: lastErrorMessage })
  }
  if (capability.sync_capability === 'browser_helper' && (lastSyncedMinutesAgo === null || lastSyncedMinutesAgo > 5)) {
    return diagnostic(channel, 'browser_helper_not_running', lastSyncedMinutesAgo, 'Kiểm tra script Python đang chạy trên máy nhân viên.', [
      'Mở terminal.',
      'cd E:\\shophuyvan-python-automation\\oms_python',
      'Chạy helper chat TikTok/manual theo cấu hình shop.',
      'Kiểm tra file chat_helper.log.'
    ], { capability })
  }
  if (capability.shop_chat_mode === 'manual' && Number(conversation.pulled_messages || conversation.saved_messages || 0) === 0) {
    return diagnostic(channel, 'manual_no_messages', lastSyncedMinutesAgo, 'Shop thủ công chưa có dữ liệu chat; cần import hoặc nhập tay trước.', [
      'Mở màn hình Chat CSKH.',
      'Chọn đúng kênh và shop.',
      'Import hội thoại hoặc tạo ghi chú nội bộ đầu tiên.'
    ], { capability })
  }
  return diagnostic(channel, 'healthy', lastSyncedMinutesAgo, 'Đồng bộ chat đang trong trạng thái chấp nhận được.', [], { capability })
}

export function defaultChatCapability(env = {}, channelValue = '') {
  const channel = normalizeChannel(channelValue)
  if (channel === 'internal') {
    return {
      shop_chat_mode: 'manual',
      send_capability: 'manual_only',
      sync_capability: 'manual_import'
    }
  }
  if (channel === 'shopee' && env?.SHOPEE_CHAT_OFFICIAL_API_ENABLED === 'true') {
    return {
      shop_chat_mode: 'api',
      send_capability: 'official_api',
      sync_capability: 'polling_api'
    }
  }
  if (channel === 'shopee' && env?.SHOPEE_CHAT_BRIDGE_URL && env?.SHOPEE_CHAT_BRIDGE_SECRET) {
    return {
      shop_chat_mode: 'api',
      send_capability: 'bridge',
      sync_capability: 'polling_api'
    }
  }
  if (channel === 'lazada' && env?.LAZADA_CHAT_BRIDGE_URL && (env?.LAZADA_CHAT_BRIDGE_SECRET || env?.SHOPEE_CHAT_BRIDGE_SECRET)) {
    return {
      shop_chat_mode: 'api',
      send_capability: 'bridge',
      sync_capability: 'polling_api'
    }
  }
  if (channel === 'tiktok') {
    return {
      shop_chat_mode: 'browser_helper',
      send_capability: 'manual_only',
      sync_capability: 'browser_helper'
    }
  }
  return {
    shop_chat_mode: 'disabled',
    send_capability: 'none',
    sync_capability: 'none'
  }
}

export function resolveChatCapability(env = {}, input = {}, fallback = {}) {
  const channel = normalizeChannel(input.channel || input.platform || fallback.channel || fallback.platform)
  const defaults = defaultChatCapability(env, channel)
  return {
    shop_chat_mode: normalizeShopChatMode(firstText(input.shop_chat_mode, fallback.shop_chat_mode), defaults.shop_chat_mode),
    send_capability: normalizeSendCapability(firstText(input.send_capability, fallback.send_capability), defaults.send_capability),
    sync_capability: normalizeSyncCapability(firstText(input.sync_capability, fallback.sync_capability), defaults.sync_capability)
  }
}

export function canSendLive(capability = {}) {
  const sendCapability = normalizeSendCapability(capability.send_capability, 'none')
  return sendCapability === 'official_api' || sendCapability === 'bridge'
}

export function canSyncViaApi(capability = {}) {
  const syncCapability = normalizeSyncCapability(capability.sync_capability, 'none')
  return syncCapability === 'webhook' || syncCapability === 'polling_api'
}

export function unavailableSendState(capability = {}) {
  const mode = normalizeShopChatMode(capability.shop_chat_mode, 'disabled')
  const sendCapability = normalizeSendCapability(capability.send_capability, 'none')
  const syncCapability = normalizeSyncCapability(capability.sync_capability, 'none')
  if (sendCapability === 'manual_only' || mode === 'manual') {
    return {
      status: 'manual_pending',
      error_code: 'manual_send_required',
      error_message: 'Shop đang ở chế độ gửi tay; tin đã lưu nội bộ và cần nhân viên gửi trên sàn.'
    }
  }
  if (mode === 'browser_helper' || syncCapability === 'browser_helper') {
    return {
      status: 'queued_for_browser_helper',
      error_code: 'browser_helper_required',
      error_message: 'Shop đang dùng trình duyệt hỗ trợ; tin đã xếp hàng cho helper, chưa xác nhận đã gửi lên sàn.'
    }
  }
  return {
    status: 'failed',
    error_code: 'adapter_not_configured',
    error_message: 'Shop chưa cấu hình gửi tin qua API hoặc bridge an toàn.'
  }
}

export function unavailableSyncState(capability = {}) {
  const mode = normalizeShopChatMode(capability.shop_chat_mode, 'disabled')
  const syncCapability = normalizeSyncCapability(capability.sync_capability, 'none')
  if (mode === 'browser_helper' || syncCapability === 'browser_helper') {
    return {
      status: 'queued_for_browser_helper',
      error_code: 'browser_helper_required',
      error_message: 'Shop đang dùng trình duyệt hỗ trợ; chưa sync bằng API chính thức.'
    }
  }
  if (mode === 'manual' || syncCapability === 'manual_import') {
    return {
      status: 'manual_pending',
      error_code: 'manual_import_required',
      error_message: 'Shop chỉ hỗ trợ import/lưu tay; chưa có sync API chính thức.'
    }
  }
  return {
    status: 'failed',
    error_code: 'adapter_not_configured',
    error_message: 'Shop chưa cấu hình sync chat qua webhook, polling API hoặc helper.'
  }
}
