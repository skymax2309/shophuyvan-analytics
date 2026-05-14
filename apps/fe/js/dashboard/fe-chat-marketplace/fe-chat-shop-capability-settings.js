// NEO: Frontend chat sàn - nhóm shop-capability-settings. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function chatShopApiStatusText(shop = {}) {
  const capabilities = shop.capabilities || {}
  const transportLabel = capabilities.transport_label || (chatShopNeedsAutomation(shop) ? 'Chrome fallback' : 'API chính thức')
  if (String(shop.chat_transport || shop.transport || '').toLowerCase() === 'off') return 'Đang tắt đồng bộ chat'
  if (chatShopNeedsAutomation(shop)) return `${transportLabel} · không gắn nhãn realtime API`
  if (String(shop.platform || '').toLowerCase() === 'lazada') {
    const lazadaChat = chatLazadaChatApiState(shop)
    if (!lazadaChat.connected) return `${transportLabel} · Chat API chưa kết nối`
    if (lazadaChat.accessExpired) return `${transportLabel} · Chat API đã hết hạn`
    if (lazadaChat.expiringSoon) return `${transportLabel} · Chat API sắp hết hạn`
    return `${transportLabel} · Chat API đã kết nối`
  }
  return `${transportLabel} · token còn sống`
}

function chatCapabilityDocsLabel(shop = {}) {
  const state = String(shop.capabilities?.docs_state || '')
  if (state === 'official_public') return 'Có tài liệu chính thức'
  if (state === 'guarded_internal') return 'Đang chạy có guard'
  return 'Chưa có API chính thức'
}

function chatCapabilityPillClass(shop = {}) {
  if (String(shop.chat_transport || shop.transport || '').toLowerCase() === 'off') return 'off'
  if (String(shop.platform || '').toLowerCase() === 'lazada') {
    const lazadaChat = chatLazadaChatApiState(shop)
    return lazadaChat.connected && !lazadaChat.accessExpired && !lazadaChat.expiringSoon ? 'api' : 'warn'
  }
  return chatShopNeedsAutomation(shop) ? 'warn' : 'api'
}

/**
 * Lazada dùng app IM riêng nên phải nhìn token chat tách khỏi token API chính.
 * Hàm này gom trạng thái hết hạn/sắp hết hạn để mọi màn hình chat dùng cùng một cách diễn giải.
 */
function chatLazadaChatApiState(shop = {}) {
  const parseDate = value => {
    const text = String(value || '').trim()
    if (!text) return null
    const normalized = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`
    const timestamp = Date.parse(normalized)
    return Number.isFinite(timestamp) ? new Date(timestamp) : null
  }
  const platform = String(shop.platform || '').toLowerCase()
  const accessDate = parseDate(shop.chat_token_expire_at)
  const refreshDate = parseDate(shop.chat_api_refresh_expire_at)
  const connectedDate = parseDate(shop.chat_api_connected_at)
  const hasAccess = Number(shop.has_chat_access_token || 0) === 1
  const accessExpired = Boolean(accessDate && accessDate.getTime() <= Date.now())
  const remainingMs = accessDate ? accessDate.getTime() - Date.now() : NaN
  return {
    platform,
    connected: platform === 'lazada' && (hasAccess || Boolean(connectedDate)),
    accessDate,
    refreshDate,
    connectedDate,
    accessExpired,
    expiringSoon: Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 3 * 24 * 60 * 60 * 1000
  }
}

function chatLazadaChatStatusMeta(shop = {}) {
  const state = chatLazadaChatApiState(shop)
  if (!state.connected) {
    return {
      badgeClass: 'off',

      badgeText: 'Chưa kết nối Chat API',
      detail: 'Shop này đang có API chính nhưng chưa có token IM Chat riêng.',
      note: 'Bấm Kết nối lại Chat API để ủy quyền app chat Lazada.'
    }
  }
  if (state.accessExpired) {
    return {
      badgeClass: 'warn',
      badgeText: 'Chat API đã hết hạn',
      detail: state.accessDate ? `Hết hạn lúc ${chatTime(state.accessDate.toISOString())}.` : 'Token chat đã hết hạn.',
      note: 'Khóa đồng bộ chat mới cho tới khi gia hạn lại app chat.'
    }
  }
  if (state.expiringSoon) {
    return {
      badgeClass: 'warn',
      badgeText: 'Chat API sắp hết hạn',
      detail: state.accessDate ? `Token chat còn tới ${chatTime(state.accessDate.toISOString())}.` : 'Token chat sắp hết hạn.',
      note: 'Nên gia hạn sớm để tránh rơi về trạng thái khóa đồng bộ.'
    }
  }
  return {
    badgeClass: 'api',
    badgeText: 'Chat API đã kết nối',
    detail: state.accessDate ? `Token chat còn tới ${chatTime(state.accessDate.toISOString())}.` : 'Token chat đang hoạt động.',
    note: state.refreshDate ? `Mốc gia hạn chat: ${chatTime(state.refreshDate.toISOString())}.` : 'Có thể đồng bộ hội thoại Lazada ngay trong OMS.'
  }
}

function renderChatLazadaChatApiManager(shop = {}) {
  if (String(shop.platform || '').toLowerCase() !== 'lazada') return ''
  const meta = chatLazadaChatStatusMeta(shop)
  const state = chatLazadaChatApiState(shop)
  const canSync = state.connected && !state.accessExpired
  const disabledSync = canSync ? '' : 'disabled'
  const disabledClass = canSync ? 'api' : 'off'
  return `
    <div class="chat-capability-card">
      <div class="chat-capability-title">Lazada Chat API</div>
      <div class="chat-context-meta">
        <span class="chat-pill ${meta.badgeClass}">${chatEscape(meta.badgeText)}</span>
      </div>
      <div class="chat-context-muted" style="margin-top:8px;">${chatEscape(meta.detail)}</div>
      <div class="chat-context-muted">${chatEscape(meta.note)}</div>
      <div class="chat-context-actions" style="margin-top:10px;">
        <button type="button" onclick="reconnectLazadaChatApiFromSettings(${Number(shop.id || 0)})">Kết nối lại Chat API</button>
        <button type="button" class="${disabledClass}" ${disabledSync} onclick="syncLazadaChatApiFromSettings(${Number(shop.id || 0)})">Đồng bộ chat</button>
        ${meta.badgeClass === 'off' ? '' : `<button type="button" onclick="disconnectLazadaChatApiFromSettings(${Number(shop.id || 0)})">Ngắt chat</button>`}
      </div>
    </div>
  `
}

function chatShopeeProbeKey(shop = {}) {
  return String(shop.id || shop.api_shop_id || shop.shop_name || shop.user_name || '').trim()
}

function chatProbeSummaryLabel(summary = {}) {
  const ok = Number(summary.ok || 0)
  const reachable = Number(summary.reachable_param_error || 0)
  const permission = Number(summary.permission_blocked || 0)
  const missing = Number(summary.endpoint_not_found || 0)
  const token = Number(summary.token_invalid || 0)
  const parts = []
  if (ok) parts.push(`${ok} OK`)
  if (reachable) parts.push(`${reachable} endpoint tới được`)
  if (permission) parts.push(`${permission} thiếu quyền`)
  if (missing) parts.push(`${missing} không tồn tại`)
  if (token) parts.push(`${token} token lỗi`)
  return parts.join(' · ') || 'Chưa có kết quả'
}

function renderChatShopeePermissionProbeManager(shop = {}) {
  if (String(shop.platform || '').toLowerCase() !== 'shopee') return ''
  if (chatShopNeedsAutomation(shop)) return ''
  const key = chatShopeeProbeKey(shop)
  const probe = chatState.shopeeChatProbeByShop[key]
  const attempts = Array.isArray(probe?.attempts) ? probe.attempts : []
  const rows = attempts.slice(0, 6).map(item => `
    <div class="chat-context-muted">${chatEscape(item.stage || item.path || '')}: ${chatEscape(item.classification || item.status || '')}${item.message || item.error ? ` · ${chatEscape(item.message || item.error)}` : ''}</div>
  `).join('')
  return `
    <div class="chat-capability-card">
      <div class="chat-capability-title">Test quyền Shopee Chat</div>
      <div class="chat-context-meta">
        <span class="chat-pill ${probe?.status === 'ok' ? 'api' : (probe?.status === 'loading' ? 'warn' : 'off')}">${chatEscape(probe?.status === 'loading' ? 'Đang test' : (probe ? 'Đã test' : 'Chưa test'))}</span>
      </div>
      <div class="chat-context-muted" style="margin-top:8px;">${chatEscape(probe ? chatProbeSummaryLabel(probe.summary || {}) : 'Bấm test để gọi API thật bằng token shop, không gửi tin thật.')}</div>
      ${probe?.safe_note ? `<div class="chat-context-muted">${chatEscape(probe.safe_note)}</div>` : ''}
      ${rows}
      <div class="chat-context-actions" style="margin-top:10px;">
        <button type="button" class="api" onclick="testShopeeChatApiFromSettings(${Number(shop.id || 0)})">Test quyền Chat</button>
      </div>
    </div>
  `
}

function chatCapabilityListHtml(items = [], emptyText) {
  const rows = (Array.isArray(items) ? items : []).filter(Boolean)
  if (!rows.length) return `<div class="chat-context-muted">${chatEscape(emptyText)}</div>`
  return `<ul class="chat-capability-list">${rows.map(item => `<li>${chatEscape(item)}</li>`).join('')}</ul>`
}

function chatNormalizeShopValue(value) {
  return String(value || '').trim().toLowerCase()
}

function chatShopAliases(shop = {}) {
  const aliases = Array.isArray(shop.aliases) ? shop.aliases : []
  return [
    shop.api_shop_id,
    shop.shop_id,
    shop.display_name,
    shop.shop_name,
    shop.user_name,
    shop.shop,
    ...aliases
  ].map(value => String(value || '').trim()).filter(Boolean)
}

function chatFindShop(platform = '', shopValue = '') {
  const platformKey = String(platform || '').toLowerCase()
  const needle = chatNormalizeShopValue(shopValue)
  if (!platformKey && !needle) return null
  return (chatState.shops || []).find(shop => {
    const shopPlatform = String(shop.platform || '').toLowerCase()
    if (platformKey && shopPlatform !== platformKey) return false
    if (!needle) return true
    return chatShopAliases(shop).some(alias => chatNormalizeShopValue(alias) === needle)
  }) || null
}

function chatShopNeedsAutomation(shop = {}) {
  const platform = String(shop.platform || '').toLowerCase()
  const transport = String(shop.chat_transport || shop.transport || '').toLowerCase()
  // Lazada đã bỏ helper Chrome; kể cả dữ liệu cũ còn cờ browser thì UI cũng không được coi đó là fallback hợp lệ.
  if (platform === 'lazada') return false
  if (transport) return transport === 'browser'
  if (Number(shop.browser_required || 0)) return true
  const automationStatus = String(shop.automation_status || '').toLowerCase()
  if (['browser_required', 'fallback_recommended', 'api_unavailable', 'token_missing'].includes(automationStatus)) return true
  if (platform === 'tiktok') return true
  if (!Number(shop.has_access_token || 0)) return true
  return false
}

function chatResolveConversationShop(conversation = {}) {
  const platform = String(conversation.platform || '').toLowerCase()
  if (!platform) return null
  const candidates = [
    conversation.shop_id,
    conversation.shop,
    conversation.shop_display_name
  ].map(chatNormalizeShopValue).filter(Boolean)
  for (const candidate of candidates) {
    const found = chatFindShop(platform, candidate)
    if (found) return found
  }
  return null
}

function chatResolveConversationCapabilities(conversation = {}) {
  const shop = chatResolveConversationShop(conversation)
  return shop?.capabilities || null
}

function chatIsShopeeOrderSeedWithoutBuyerId(conversation = {}) {
  const platform = String(conversation.platform || '').toLowerCase()
  if (platform !== 'shopee') return false
  const conversationId = String(conversation.conversation_id || '').trim()
  const source = String(conversation.source || '').toLowerCase()
  const buyerId = String(conversation.buyer_id || '').trim()
  const seededFromOrder = source === 'oms_order_seed'
    || conversationId.startsWith('automation-shopee-seed-')
  return seededFromOrder && !buyerId
}

function chatConversationAllowsAutomationSend(conversation = {}) {
  const platform = String(conversation.platform || '').toLowerCase()
  if (!['shopee', 'tiktok'].includes(platform)) return false
  const conversationId = String(conversation.conversation_id || '').trim()
  if (platform === 'tiktok') return true
  const shop = chatResolveConversationShop(conversation)
  if (platform === 'shopee') {
    const orderSeedMissingBuyerId = chatIsShopeeOrderSeedWithoutBuyerId(conversation)
    // Shop API vẫn gửi bằng API trước. Riêng khung chat tạo từ đơn OMS chưa có buyer_id
    // thì cho fallback webchat sau khi API báo missing_buyer_id để vận hành không bị kẹt.
    if (!shop) return String(conversation.transport || '').toLowerCase() === 'api'
      ? orderSeedMissingBuyerId
      : conversationId.startsWith('automation-shopee-')
    if (!chatShopNeedsAutomation(shop)) return orderSeedMissingBuyerId
    return chatShopNeedsAutomation(shop) || conversationId.startsWith('automation-shopee-')
  }
  return false
}

function chatAutomationShopValue(shop = {}) {
  return shop.api_shop_id || shop.display_name || shop.shop_name || shop.user_name || chatShopAliases(shop)[0] || ''
}

function chatAutomationApiReadyShopeeAliases() {
  const blocked = new Set()
  ;(chatState.shops || []).forEach(shop => {
    if (chatShopNeedsAutomation(shop)) return
    chatShopAliases(shop).forEach(alias => blocked.add(alias))
  })
  return [...blocked]
}

function chatSettingsDefaults() {
  return {
    moderation_enabled: 1,
    blocked_keywords: [
      'zalo',
      'số điện thoại',
      'sdt',
      'facebook',
      'messenger',
      'telegram',
      'whatsapp',
      'momo',
      'chuyển khoản',
      'số tài khoản',
      'tài khoản ngân hàng',
      'mua ngoài sàn',
      'đặt ngoài sàn',
      'thanh toán ngoài',
      'đặt cọc',
      'link ngoài',
      'website riêng',
      'địa chỉ shop',
      'qua lấy trực tiếp'
    ],
    ai_enabled: 0,
    ai_provider: 'gemini',
    ai_model: 'gemini-2.5-flash',
    ai_tone: 'Thân thiện, chuyên nghiệp, trung tính, không hứa quá dữ liệu đang có',
    ai_rules: [
      'Chỉ trả lời bằng tiếng Việt có dấu, lịch sự, đúng trọng tâm, không dùng emoji.',
      'Không viết đúng tên sàn cụ thể trong câu trả lời gửi khách; nếu cần thì gọi chung là "sàn".',
      'Không rủ khách nhắn Zalo/Facebook/điện thoại, không cung cấp địa chỉ shop, không dẫn khách ra ngoài sàn.',
      'Không hướng dẫn thanh toán ngoài sàn, chuyển khoản riêng, đặt hàng ngoài sàn hoặc chia sẻ link ngoài.',
      'Không tự trả lời giá, khuyến mãi, voucher hoặc phí ship; chỉ hướng khách xem trực tiếp trên sàn.',
      'Không hứa chắc hoàn tiền, đổi trả hoặc bảo hành trong mọi trường hợp.',
      'Không dùng câu tuyệt đối như cam kết 100%, chắc chắn dùng được, không bao giờ lỗi.',
      'Không xin khách sửa, xóa, đổi hoặc để lại đánh giá.',
      ...REQUIRED_CHAT_AI_RULE_LINES,
      'Nếu thiếu dữ liệu hoặc có rủi ro chính sách, không tự gửi và để nhân viên xử lý.',
      'Giữ nguyên SKU, mã đơn và tên sản phẩm nếu có trong hội thoại; không tự lặp lại tên shop hoặc tên sàn.'
    ].join('\n'),
    ai_guard_mode: 'strict',
    ai_forbidden_patterns: REQUIRED_CHAT_AI_FORBIDDEN_PATTERNS.join('\n'),
    ai_review_triggers: [
      'bảo hành',
      'hoàn tiền',
      'đổi trả',
      'hủy đơn',
      'khiếu nại',
      'khách tức giận',
      'đơn giá trị cao',
      'khách hay hoàn hủy',
      'thiếu dữ liệu',
      'ngoài chính sách',
      'nghi lừa đảo',
      'đánh giá xấu',
      'cam kết',
      'chắc chắn',
      'còn hàng',
      'giá hiện tại',
      'khuyến mãi',
      'voucher',
      'mã giảm giá',
      'phí ship',
      'phí vận chuyển',
      'đấu dây',
      'lắp điện'
    ].join('\n'),
    ai_require_review: 0,
    ai_auto_reply_mode: 'off',
    ai_auto_reply_platforms: ['shopee'],
    ai_auto_reply_shops: [],
    ai_auto_reply_limit: 3,
    ai_auto_reply_hold_seconds: 20,
    ai_auto_reply_max_age_hours: 2,
    ai_auto_reply_handoff_enabled: 1,
    quick_replies: [
      { title: 'Shop kiểm tra', content: 'Dạ shop đang kiểm tra và phản hồi ngay ạ.' },
      { title: 'Kiểm tra trên sàn', content: 'Dạ shop ghi nhận thông tin và sẽ kiểm tra lại trên sàn trước khi chốt giúp mình ạ.' },
      { title: 'Kiểm tra sản phẩm', content: 'Dạ sản phẩm này shop sẽ đối chiếu lại tồn kho, giá và thông tin chi tiết rồi phản hồi mình sớm nhất ạ.' }
    ],
    notify_enabled: 1,
    notify_preview_enabled: 1,
    notify_sound_enabled: 1,
    notify_poll_seconds: 12
  }
}
