export const CHAT_ORDER_MATCH_HARD = 'hard'
export const CHAT_ORDER_MATCH_SOFT = 'soft'

function cleanChatOrderContextText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function truthyChatOrderFlag(value) {
  return value === true || value === 1 || value === '1'
}

function parseChatOrderTimestamp(value) {
  const text = cleanChatOrderContextText(value)
  if (!text) return 0
  const numeric = Number(text)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1000000000000 ? numeric : numeric * 1000
  }
  const parsed = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasLiveToken(row = {}, field = 'token_expire_at') {
  const expiresAt = parseChatOrderTimestamp(row[field])
  if (!expiresAt) return true
  return expiresAt > Date.now() + 60 * 1000
}

// Core này tách riêng khả năng sync đơn hàng của shop để tab Đơn hàng, chat và các route sau này
// không tự suy đoán khác nhau về chuyện shop nào được phép kéo API.
export function resolveChatOrderSyncCapability(row = {}) {
  const platform = cleanChatOrderContextText(row.platform).toLowerCase()
  const hasAccessToken = truthyChatOrderFlag(row.has_access_token) || Boolean(cleanChatOrderContextText(row.access_token))
  const hasRefreshToken = truthyChatOrderFlag(row.has_refresh_token) || Boolean(cleanChatOrderContextText(row.refresh_token))
  const hasApiShopId = Boolean(cleanChatOrderContextText(row.api_shop_id))
  const hasAnyApiConfig = hasAccessToken
    || hasRefreshToken
    || hasApiShopId
    || Boolean(cleanChatOrderContextText(row.api_partner_id))
    || Boolean(cleanChatOrderContextText(row.api_partner_key))
  const accessLive = hasAccessToken && hasLiveToken(row, 'token_expire_at')
  const refreshLive = hasRefreshToken && hasLiveToken(row, 'api_refresh_expire_at')

  if (['shopee', 'lazada'].includes(platform) && hasApiShopId && accessLive && (platform === 'lazada' || refreshLive)) {
    return {
      mode: 'api_active',
      can_sync: true,
      source_label: 'Đơn hàng API',
      source_note: 'Shop có API đơn hàng. Hệ thống ưu tiên sync nền incremental theo đúng sàn và shop này.',
      sync_reason: '',
      sync_button_label: 'Đồng bộ đơn hàng'
    }
  }

  if (['shopee', 'lazada'].includes(platform) && hasAnyApiConfig) {
    return {
      mode: 'api_needs_auth',
      can_sync: false,
      source_label: 'Cần kết nối API',
      source_note: 'Shop đã có cấu hình API nhưng token đơn hàng chưa sẵn sàng. Cần kết nối hoặc gia hạn lại trước khi kéo đơn mới.',
      sync_reason: 'Shop này cần kết nối hoặc gia hạn API đơn hàng trước khi đồng bộ.',
      sync_button_label: 'Cần kết nối API'
    }
  }

  return {
    mode: 'manual_reference',
    can_sync: false,
    source_label: 'Tham chiếu OMS',
    source_note: 'Shop này chưa có API đơn hàng. Tab Đơn hàng chỉ đọc dữ liệu OMS hiện có hoặc fallback riêng.',
    sync_reason: 'Shop này chưa có API đơn hàng.',
    sync_button_label: 'Chưa có API đơn hàng'
  }
}

export function chatOrderMatchMeta(matchType) {
  if (matchType === CHAT_ORDER_MATCH_HARD) {
    return {
      match_type: CHAT_ORDER_MATCH_HARD,
      match_label: 'Đơn khớp chắc',
      match_tone: 'api'
    }
  }
  return {
    match_type: CHAT_ORDER_MATCH_SOFT,
    match_label: 'Đơn khớp mềm, cần kiểm tra',
    match_tone: 'warn'
  }
}

export function chatOrderMatchStateLabel(hardCount = 0, softCount = 0) {
  if (Number(hardCount || 0) > 0) return 'Đơn khớp chắc'
  if (Number(softCount || 0) > 0) return 'Đơn khớp mềm, cần kiểm tra'
  return 'Chưa khớp đơn'
}

export function chatOrderSyncStale(latestSyncAt, staleMinutes = 15) {
  const latest = parseChatOrderTimestamp(latestSyncAt)
  if (!latest) return true
  return Date.now() - latest >= staleMinutes * 60 * 1000
}
