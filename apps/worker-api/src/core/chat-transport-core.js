export const CHAT_TRANSPORT_API = 'api'
export const CHAT_TRANSPORT_BROWSER = 'browser'
export const CHAT_TRANSPORT_OFF = 'off'

const CHAT_PLATFORM_CAPABILITIES = {
  shopee: {
    api_chat_supported: true,
    api_worker: 'api_chat_worker',
    browser_worker: 'browser_chat_worker',
    note: 'Shopee có SellerChat hoặc Webchat đang chạy trong hệ thống nên ưu tiên API khi token còn sống.'
  },
  lazada: {
    api_chat_supported: true,
    api_worker: 'api_chat_worker',
    browser_worker: '',
    note: 'Lazada chat đã chốt dùng IM API chính thức; không còn dùng Chrome automation để tránh lệch session.'
  },
  tiktok: {
    api_chat_supported: false,
    api_worker: '',
    browser_worker: 'browser_chat_worker',
    note: 'TikTok hiện chưa có endpoint chat chính thức trong hệ thống nên cần Chrome cho phần chat.'
  }
}

export function cleanChatTransportText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value).replace(/\u00a0/g, ' ').trim()
}

export function normalizeChatPlatform(value) {
  return cleanChatTransportText(value).toLowerCase()
}

export function normalizeChatShopKey(value) {
  return cleanChatTransportText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9@._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function chatPlatformCapability(platform) {
  const key = normalizeChatPlatform(platform)
  return CHAT_PLATFORM_CAPABILITIES[key] || {
    api_chat_supported: false,
    api_worker: '',
    browser_worker: 'browser_chat_worker',
    note: 'Sàn này chưa có core chat API, chỉ chạy Chrome khi được cấu hình fallback.'
  }
}

function booleanLike(value) {
  const text = cleanChatTransportText(value).toLowerCase()
  return value === true || value === 1 || ['1', 'true', 'yes', 'on', 'browser_required'].includes(text)
}

function chatAccessToken(row = {}) {
  const platform = normalizeChatPlatform(row.platform)
  // Lazada chat dùng app IM riêng nên chỉ lấy token chat riêng làm nguồn chuẩn.
  if (platform === 'lazada') return cleanChatTransportText(row.chat_access_token)
  return cleanChatTransportText(row.chat_access_token || row.access_token)
}

function tokenExpiresAt(row = {}) {
  const platform = normalizeChatPlatform(row.platform)
  const raw = platform === 'lazada'
    ? cleanChatTransportText(row.chat_token_expire_at || row.chat_access_token_expire_at || row.expires_at || row.expire_at)
    : cleanChatTransportText(row.token_expire_at || row.chat_token_expire_at || row.access_token_expire_at || row.expires_at || row.expire_at)
  if (!raw) return 0
  const numberValue = Number(raw)
  if (Number.isFinite(numberValue) && numberValue > 0) {
    return numberValue > 1000000000000 ? numberValue : numberValue * 1000
  }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function hasLiveChatApiToken(row = {}, now = Date.now()) {
  const platform = normalizeChatPlatform(row.platform)
  const token = chatAccessToken(row)
  if (platform === 'lazada' && !token && !Number(row.has_chat_access_token || 0)) return false
  if (platform !== 'lazada' && !token && !Number(row.has_access_token || 0) && !Number(row.has_chat_access_token || 0)) return false
  const expiresAt = tokenExpiresAt(row)
  // Một số shop cũ không lưu hạn token; nếu có token nhưng thiếu hạn thì vẫn ưu tiên thử API trước.
  if (!expiresAt) return true
  return expiresAt > now + 60 * 1000
}

function readManualTransportMode(row = {}) {
  const mode = cleanChatTransportText(row.chat_transport || row.chat_transport_mode || row.transport_mode || row.transport).toLowerCase()
  if (['api', 'browser', 'off'].includes(mode)) return mode
  if (booleanLike(row.browser_required) || booleanLike(row.chat_browser_required)) return CHAT_TRANSPORT_BROWSER
  if (booleanLike(row.chat_disabled) || booleanLike(row.chat_off)) return CHAT_TRANSPORT_OFF
  return ''
}

function apiUnavailable(row = {}) {
  const status = cleanChatTransportText(row.chat_api_status || row.api_chat_status || row.im_permission_status).toLowerCase()
  if (booleanLike(row.api_unavailable) || booleanLike(row.chat_api_unavailable)) return true
  return [
    'api_unavailable',
    'token_expired',
    'permission_missing',
    'missing_permission',
    'needs_browser',
    'browser_required'
  ].includes(status)
}

export function resolveChatTransportForShop(row = {}, options = {}) {
  const platform = normalizeChatPlatform(row.platform || options.platform)
  const shop = cleanChatTransportText(row.shop_name || row.display_name || row.user_name || row.shop || row.api_shop_id || options.shop)
  const capability = chatPlatformCapability(platform)
  const manualMode = readManualTransportMode(row)
  const tokenLive = hasLiveChatApiToken(row, options.now || Date.now())
  const apiSupported = Boolean(capability.api_chat_supported || row.api_chat_supported || row.chat_api_supported)
  const unavailable = apiUnavailable(row)

  if (manualMode === CHAT_TRANSPORT_OFF) {
    return {
      platform,
      shop,
      transport: CHAT_TRANSPORT_OFF,
      worker: 'none',
      api_available: false,
      api_token_live: tokenLive,
      api_chat_supported: apiSupported,
      browser_required: false,
      reason_code: 'chat_off',
      note: 'Shop đang tắt đồng bộ chat trong cấu hình core.'
    }
  }

  if (manualMode === CHAT_TRANSPORT_BROWSER) {
    // Lazada đã bỏ hẳn helper Chrome; nếu còn cờ browser cũ trong DB thì ép về OFF để không ai hiểu nhầm là còn fallback hợp lệ.
    if (platform === 'lazada') {
      return {
        platform,
        shop,
        transport: CHAT_TRANSPORT_OFF,
        worker: capability.api_worker || 'api_chat_worker',
        api_available: false,
        api_token_live: tokenLive,
        api_chat_supported: apiSupported,
        browser_required: false,
        reason_code: 'lazada_browser_flag_legacy',
        note: 'Shop Lazada còn cờ browser cũ trong dữ liệu. Hệ thống đã tự khóa luồng Chrome và chỉ chờ IM API chính thức.'
      }
    }
    return {
      platform,
      shop,
      transport: CHAT_TRANSPORT_BROWSER,
      worker: capability.browser_worker,
      api_available: false,
      api_token_live: tokenLive,
      api_chat_supported: apiSupported,
      browser_required: true,
      reason_code: 'browser_required',
      note: 'Shop được đánh dấu browser_required nên chỉ mở Chrome khi đồng bộ chat.'
    }
  }

  if (manualMode === CHAT_TRANSPORT_API || (apiSupported && tokenLive && !unavailable)) {
    return {
      platform,
      shop,
      transport: CHAT_TRANSPORT_API,
      worker: capability.api_worker || 'api_chat_worker',
      api_available: true,
      api_token_live: tokenLive,
      api_chat_supported: apiSupported,
      browser_required: false,
      reason_code: 'api_ready',
      note: 'Shop có API chat và token còn sống: ưu tiên API, không mở Chrome tự động.'
    }
  }

  if (!apiSupported) {
    return {
      platform,
      shop,
      transport: CHAT_TRANSPORT_BROWSER,
      worker: capability.browser_worker,
      api_available: false,
      api_token_live: tokenLive,
      api_chat_supported: false,
      browser_required: true,
      reason_code: 'chat_api_not_supported',
      note: capability.note
    }
  }

  if (platform === 'lazada') {
    return {
      platform,
      shop,
      transport: CHAT_TRANSPORT_OFF,
      worker: capability.api_worker || 'api_chat_worker',
      api_available: false,
      api_token_live: tokenLive,
      api_chat_supported: apiSupported,
      browser_required: false,
      reason_code: unavailable ? 'api_unavailable' : 'token_missing',
      // Lazada đã bỏ automation local nên thiếu token/quyền thì chỉ khóa sync mới, không cho fallback Chrome nữa.
      note: unavailable
        ? 'Lazada IM API đang lỗi hoặc thiếu quyền. Hệ thống chỉ giữ dữ liệu đã lưu, không dùng Chrome fallback.'
        : 'Shop Lazada chưa có chat_access_token từ app IM. Hệ thống khóa sync mới cho tới khi authorize lại app chat.'
    }
  }

  return {
    platform,
    shop,
    transport: CHAT_TRANSPORT_BROWSER,
    worker: capability.browser_worker,
    api_available: false,
    api_token_live: tokenLive,
    api_chat_supported: apiSupported,
    browser_required: true,
    reason_code: unavailable ? 'api_unavailable' : 'token_missing',
    note: unavailable
      ? 'API chat của shop đang lỗi hoặc thiếu quyền, chỉ khi đó mới dùng Chrome fallback.'
      : 'Shop chưa có token API chat còn sống nên cần Chrome fallback nếu muốn đồng bộ chat.'
  }
}

export function isBrowserChatTransport(row = {}) {
  return resolveChatTransportForShop(row).transport === CHAT_TRANSPORT_BROWSER
}

export function isApiChatTransport(row = {}) {
  return resolveChatTransportForShop(row).transport === CHAT_TRANSPORT_API
}

export function chatTransportGuide() {
  return {
    title: 'Luồng đồng bộ chat đã chốt',
    items: [
      'Shop có API: ưu tiên API, không mở Chrome tự động.',
      'Shop không API: chỉ Shopee hoặc TikTok mới dùng Chrome fallback; Lazada không còn fallback local.',
      'Shop fallback: quét ngoài để tiết kiệm tài nguyên; chỉ mở sâu khi cần xác minh khách hoặc tin mới.',
      'Hội thoại nghi trùng sẽ được gộp về một khách chính, không xóa dữ liệu gốc.'
    ]
  }
}

function capabilitySummaryLabel(platform, transport) {
  if (transport.transport === CHAT_TRANSPORT_API) {
    if (platform === 'lazada') return 'Đang ưu tiên Lazada IM API, không mở Chrome tự động.'
    if (platform === 'shopee') return 'Đang ưu tiên SellerChat hoặc Webchat trong hệ thống, nhưng vẫn giữ guard vì tài liệu public chưa đủ.'
    return 'Đang ưu tiên API chính thức của sàn.'
  }
  if (platform === 'tiktok') return 'TikTok hiện chưa có chat API chính thức trong hệ thống nên cần Chrome hoặc tham chiếu tay.'
  if (platform === 'lazada') return 'Lazada chat chỉ chạy IM API chính thức; thiếu token hoặc quyền thì khóa sync mới.'
  return 'Shop này đang đi luồng Chrome fallback hoặc thao tác tay vì chưa đủ API chat.'
}

function capabilityDocsState(platform, transport) {
  if (transport.transport === CHAT_TRANSPORT_API && platform === 'lazada') return 'official_public'
  if (transport.transport === CHAT_TRANSPORT_API && platform === 'shopee') return 'guarded_internal'
  if (platform === 'tiktok') return 'browser_only'
  return transport.transport === CHAT_TRANSPORT_API ? 'official_public' : 'browser_only'
}

function capabilityFeatureLists(platform, transport) {
  const apiFeatures = []
  const fallbackFeatures = []
  const pendingFeatures = []

  if (transport.transport === CHAT_TRANSPORT_API) {
    if (platform === 'lazada') {
      apiFeatures.push(
        'Kéo danh sách hội thoại và tin nhắn qua IM API.',
        'Gửi tin nhắn text chính thức qua Lazada IM API.',
        'Đánh dấu đã đọc trên sàn khi mở hội thoại trong OMS.'
      )
      pendingFeatures.push(
        'Thẻ đơn, thẻ sản phẩm, voucher, ảnh hoặc video chưa mở hết trên giao diện OMS.',
        'Thu hồi tin và mở hội thoại từ order_id mới dừng ở mức tài liệu hoặc capability, chưa bật nút thao tác.'
      )
    } else if (platform === 'shopee') {
      apiFeatures.push(
        'Kéo hội thoại và tin nhắn qua SellerChat hoặc Webchat đang có trong hệ thống.',
        'Gửi text chính thức lên Shopee.',
        'Gửi thẻ sản phẩm chính thức qua Shopee khi item_id đã khớp.'
      )
      pendingFeatures.push(
        'Đánh dấu đã đọc, thu hồi tin và media chat chưa có tài liệu public đủ rõ nên vẫn giữ guard.',
        'Tính năng mới trên Shopee chat chỉ nên mở thêm khi có endpoint chính thức hoặc quyền đã xác minh.'
      )
    } else {
      apiFeatures.push('Shop này đang có API chat sẵn sàng.')
      pendingFeatures.push('Cần rà thêm tài liệu chi tiết để mở hết tính năng.')
    }
  } else {
    fallbackFeatures.push(
      'Quét danh sách ngoài để biết hội thoại nào mới hoặc đổi preview.',
      'Chỉ mở sâu khi cần xác minh khách mới, khách nghi trùng hoặc hội thoại thiếu định danh.',
      'Có thể dùng automation local hoặc tham chiếu tay để lưu về cùng core chat.'
    )
    pendingFeatures.push(
      'Không có trạng thái đã đọc chính thức trên sàn.',
      'Không xác nhận được mọi trạng thái gửi hoặc thu hồi tin bằng API.'
    )
    if (platform === 'lazada') {
      fallbackFeatures.length = 0
      fallbackFeatures.push('Lazada đã bỏ automation local; chỉ xem dữ liệu đã lưu cho tới khi app IM có token và quyền đầy đủ.')
      pendingFeatures.length = 0
      pendingFeatures.push(
        'Cần authorize lại app IM Chat nếu token hết hạn hoặc quyền bị thu hồi.',
        'Không đồng bộ mới, không gửi và không đánh dấu đã đọc nếu IM API chưa sẵn sàng.'
      )
    }
  }

  return { apiFeatures, fallbackFeatures, pendingFeatures }
}

// Trả về ma trận capability chuẩn để mọi route và giao diện đọc chung một lõi dữ liệu.
export function buildChatCapabilityMatrix(row = {}, transport = resolveChatTransportForShop(row)) {
  const platform = normalizeChatPlatform(row.platform || transport.platform)
  const docsState = capabilityDocsState(platform, transport)
  const { apiFeatures, fallbackFeatures, pendingFeatures } = capabilityFeatureLists(platform, transport)
  return {
    transport: transport.transport,
    transport_label: transport.transport === CHAT_TRANSPORT_API
      ? 'API chính thức'
      : transport.transport === CHAT_TRANSPORT_BROWSER
        ? 'Chrome fallback'
        : 'Đang tắt',
    summary: capabilitySummaryLabel(platform, transport),
    docs_state: docsState,
    docs_state_label: docsState === 'official_public'
      ? 'Có tài liệu chính thức'
      : docsState === 'guarded_internal'
        ? 'Đang chạy có guard'
        : 'Chưa có API chính thức',
    official_send_text_supported: transport.transport === CHAT_TRANSPORT_API && ['shopee', 'lazada'].includes(platform),
    official_product_card_supported: transport.transport === CHAT_TRANSPORT_API && platform === 'shopee',
    official_mark_read_supported: transport.transport === CHAT_TRANSPORT_API && platform === 'lazada',
    official_recall_supported: transport.transport === CHAT_TRANSPORT_API && platform === 'lazada',
    official_open_session_supported: transport.transport === CHAT_TRANSPORT_API && platform === 'lazada',
    api_features: apiFeatures,
    fallback_features: fallbackFeatures,
    pending_features: pendingFeatures
  }
}
