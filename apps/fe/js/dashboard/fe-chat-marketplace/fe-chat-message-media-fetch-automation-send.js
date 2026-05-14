// NEO: Frontend chat sàn - nhóm message-media-fetch-automation-send. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function chatNotificationKey(item) {
  return [
    chatKeyPart(item?.platform),
    chatKeyPart(item?.shop || item?.shop_id),
    chatKeyPart(item?.conversation_id || item?.id),
    chatKeyPart(item?.last_message_at),
    chatSimpleHash(item?.last_message || '')
  ].join('|')
}

function chatTime(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  // Luôn quy đổi hiển thị theo giờ Việt Nam để tránh lệch khi API trả UTC/Z.
  const normalized = text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text
  const numeric = Number(normalized)
  if (Number.isFinite(numeric)) {
    const ms = numeric > 1000000000000 ? numeric : numeric * 1000
    const date = new Date(ms)
    if (!Number.isNaN(date.getTime())) {
      const parts = CHAT_TIME_FORMATTER_VN.formatToParts(date)
      const day = parts.find(part => part.type === 'day')?.value || ''
      const month = parts.find(part => part.type === 'month')?.value || ''
      const hour = parts.find(part => part.type === 'hour')?.value || ''
      const minute = parts.find(part => part.type === 'minute')?.value || ''
      if (day && month && hour && minute) return `${day}/${month} ${hour}:${minute}`
    }
  }
  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    const parts = CHAT_TIME_FORMATTER_VN.formatToParts(parsed)
    const day = parts.find(part => part.type === 'day')?.value || ''
    const month = parts.find(part => part.type === 'month')?.value || ''
    const hour = parts.find(part => part.type === 'hour')?.value || ''
    const minute = parts.find(part => part.type === 'minute')?.value || ''
    if (day && month && hour && minute) return `${day}/${month} ${hour}:${minute}`
  }
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (m) return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`
  return text
}

function isChatNotice(text) {
  return String(text || '').includes('Webhook báo có tin nhắn mới nhưng chưa kèm nội dung')
}

function chatIsTikTokDisplayNoise(message, conversation = null) {
  const platform = String(message?.platform || conversation?.platform || '').trim().toLowerCase()
  const content = typeof message === 'string' ? message : message?.content
  if (platform !== 'tiktok' || !String(content || '').trim()) return false
  const normalized = chatNormalizeDisplayText(content)
  if (!normalized) return false
  const exact = new Set([
    'an bo loc',
    'an doan chat da dong',
    'hien thi doan chat da dong',
    'da chi dinh 8 chua chi dinh',
    'da chia se mot don hang',
    'da chia se mot don hang khach mua tiep'
  ])
  if (exact.has(normalized)) return true
  const uiMarkers = [
    'khach gan day',
    'cuoc tro chuyen da duoc chi dinh',
    'cuoc tro chuyen chua duoc chi dinh',
    'shop huy van da bat dau cuoc tro chuyen'
  ]
  if (uiMarkers.some(marker => normalized.includes(marker))) return true
  // Dữ liệu cũ từ TikTok có thể là innerText của cả khung chat. Ẩn ở UI để CSKH chỉ thấy tin thật và panel đơn hàng.
  if (normalized.includes('da chia se mot don hang') && normalized.includes('khach mua tiep')) return true
  // Card đơn TikTok phải nằm ở panel Đơn hàng, không hiển thị như tin nhắn dài trong luồng chat.
  const orderUiMarkers = [
    'da chia se mot don hang',
    'khach mua tiep',
    'id don hang',
    'id theo doi',
    'xac nhan don hang',
    'thong tin kho van',
    'trang thai don hang',
    'don hang lien quan'
  ]
  const orderUiHits = orderUiMarkers.reduce((count, marker) => count + (normalized.includes(marker) ? 1 : 0), 0)
  if (orderUiHits >= 2 && normalized.length > 80) return true
  if (normalized.includes('da chia se mot don hang') && /\b(?:hom qua|hom nay|\d{1,2}\s+\d{2})\b/.test(normalized) && normalized.length > 60) return true
  const repeatedTimeline = normalized.match(/\b(hom qua|hom nay)\s+shop huy van\b/g) || []
  return repeatedTimeline.length >= 2
}

function chatIsShopeeDisplayNoise(message, conversation = null) {
  const platform = String(message?.platform || conversation?.platform || '').trim().toLowerCase()
  const content = String(typeof message === 'string' ? message : message?.content || '').trim()
  const messageType = String(message?.message_type || '').trim().toLowerCase()
  if (platform !== 'shopee') return false
  if (messageType.includes('faq')) return true
  if (/^Shopee gom \d+ tin tự động trong phiên chat$/i.test(content)) return true
  if (!content) return false
  const normalized = chatNormalizeDisplayText(content)
  if (normalized === 'chat voi nguoi ban') return true
  if (content.includes('{placeholder}')) return true
  if (content.startsWith('{') && content.includes('"faq_id"') && content.includes('"intents"')) return true
  const reviewHints = ['danh gia', 'rate to earn', 'avalie', 'califica', 'beri ulasan', 'nilaikan']
  const rewardHints = ['shopee coin', 'shopee coins', 'koin shopee', 'monedas shopee', 'moedas shopee', ' xu']
  const hasReviewHint = reviewHints.some(item => normalized.includes(item))
  const hasRewardHint = rewardHints.some(item => normalized.includes(item) || content.toLowerCase().includes(item))
  return hasReviewHint && hasRewardHint
}

function chatIsSystemDisplayNoise(message, conversation = null) {
  return chatIsTikTokDisplayNoise(message, conversation) || chatIsShopeeDisplayNoise(message, conversation)
}

function chatParseMediaItems(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'object') return [value].filter(Boolean)
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function chatMediaKind(item = {}) {
  const raw = String(item.type || item.kind || item.message_type || item.mime_type || item.mime || '').toLowerCase()
  if (raw.includes('order')) return 'order'
  if (raw.includes('product') || raw.includes('item')) return 'product'
  if (raw.includes('sticker')) return 'image'
  if (raw.includes('video')) return 'video'
  if (raw.includes('image') || raw.includes('photo')) return 'image'
  const url = String(item.url || item.thumbnail_url || item.preview_url || item.media_url || item.file_url || '').toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif)(\?|$)/.test(url) || url.includes('/image') || url.includes('img.')) return 'image'
  if (/\.(mp4|mov|m4v|webm)(\?|$)/.test(url) || url.includes('/video')) return 'video'
  return 'file'
}

function chatMediaSrc(item = {}) {
  const url = String(item.url || item.thumbnail_url || item.preview_url || item.media_url || item.file_url || '').trim()
  if (!url) return ''
  if (/^(blob:|data:|https?:\/\/)/i.test(url)) return url
  if (url.startsWith('/api/')) return API + url
  if (url.startsWith('/pages/')) return url
  return url
}

function chatShortUrl(url = '') {
  try {
    const parsed = new URL(url, location.origin)
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '').slice(0, 80)
  } catch {
    return String(url || '').slice(0, 80)
  }
}

function renderChatLinkedText(value = '') {
  const text = String(value || '')
  const urlRe = /https?:\/\/[^\s<>"']+/gi
  let html = ''
  let last = 0
  for (const match of text.matchAll(urlRe)) {
    const url = match[0]
    const index = match.index || 0
    html += chatEscape(text.slice(last, index))
    html += `<a class="chat-message-link" href="${chatEscape(url)}" target="_blank" rel="noopener">${chatEscape(chatShortUrl(url))}</a>`
    last = index + url.length
  }
  html += chatEscape(text.slice(last))
  return html.replace(/\n/g, '<br>')
}

// Thẻ đơn hàng trong chat phải hiện chi tiết sản phẩm ngay, không bắt nhân viên mở màn khác để đoán.
function renderChatOrderCardItems(order = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  if (!items.length) return '<div class="chat-order-card-muted">Chưa có dòng sản phẩm trong OMS.</div>'
  return `
    <div class="chat-order-card-items">
      ${items.slice(0, 3).map(item => `
        <div class="chat-order-card-item">

          ${item.image_url ? `<img src="${chatEscape(item.image_url)}" alt="">` : '<span>SP</span>'}
          <div>
            <b>${chatEscape(chatShortText(item.product_name || item.sku || 'Sản phẩm', 82))}</b>
            <small>${chatEscape(item.variation_name || item.sku || 'chưa có SKU')} · SL ${Number(item.qty || 0).toLocaleString('vi-VN')}</small>
          </div>
        </div>
      `).join('')}
    </div>
  `
}

function renderChatOrderCardDetail(item = {}) {
  const orderSn = String(item.order_sn || item.order_id || '').trim()
  const order = item.order || chatOrderById(orderSn)
  if (!order?.order_id) return '<small>Chưa kéo được chi tiết đơn trong OMS.</small>'
  const statusLabel = chatOrderStatusLabel(chatOrderShippingStatus(order) || chatOrderMainStatus(order), 'Chưa cập nhật')
  return `
    <div class="chat-order-card-detail">
      <div class="chat-order-card-grid">
        <span>Khách</span><b>${chatEscape(order.customer_name || 'Chưa có tên')}</b>
        <span>Thanh toán</span><b>${chatEscape(chatMoney(order.revenue || order.net_revenue))}</b>
        <span>Trạng thái</span><b>${chatEscape(statusLabel)}</b>
        <span>Vận chuyển</span><b>${chatEscape(order.shipping_carrier || 'Chưa rõ')}</b>
        <span>Mã vận đơn</span><b>${chatEscape(order.tracking_number || 'Chưa có')}</b>
      </div>
      ${renderChatOrderCardItems(order)}
    </div>
  `
}

function chatFormatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function renderChatMediaItems(value, options = {}) {
  const items = chatParseMediaItems(value).filter(item => !(options.hideOrders && chatMediaKind(item) === 'order'))
  if (!items.length) return ''
  return `
    <div class="chat-message-media">
      ${items.map(item => {
        const src = chatMediaSrc(item)
        const kind = chatMediaKind(item)
        const name = chatEscape(item.name || item.file_name || (kind === 'video' ? 'Video' : kind === 'image' ? 'Ảnh' : 'Tệp đính kèm'))
        const size = chatFormatBytes(item.size)
        if (kind === 'product') {
          const itemIdRaw = String(item.item_id || item.product_id || item.platform_item_id || '').trim()
          const shopIdRaw = String(item.shop_id || '').trim()
          const product = item.product || chatProductById(itemIdRaw, shopIdRaw) || {}
          const productUrl = chatProductUrl(product) || item.url || src
          const imageUrl = chatProductImage(product) || item.thumbnail_url
          const platformLabel = chatPlatformLabel(product.platform || item.platform || chatState.activeConversation?.platform || '').trim()
          const title = product.product_name || item.name || `Sản phẩm ${platformLabel || 'sàn'}`
          const sku = chatProductSku(product)
          const priceText = product.platform_item_id || product.product_name ? chatProductPriceText(product) : ''
          const stock = product.platform_item_id || product.product_name ? chatProductStock(product) : null
          const variationCount = chatProductVariations(product).length
          const metaParts = [
            itemIdRaw ? `Item: ${itemIdRaw}` : 'Khách gửi thẻ sản phẩm',
            sku ? `SKU: ${sku}` : '',
            priceText && priceText !== '0 đ' ? `Giá: ${priceText}` : '',
            stock ? `Tồn: ${Number(stock).toLocaleString('vi-VN')}` : '',
            variationCount ? `${variationCount} phân loại` : '',
            shopIdRaw ? `Shop: ${shopIdRaw}` : ''
          ].filter(Boolean)
          return `
            <a class="chat-card-link product chat-product-card" href="${chatEscape(productUrl || '#')}" target="_blank" rel="noopener">
              ${imageUrl ? `<img src="${chatEscape(chatMediaSrc({ url: imageUrl }))}" alt="${chatEscape(title)}" loading="lazy">` : '<span class="chat-card-icon">SP</span>'}
              <span class="chat-product-card-main">
                <b>${chatEscape(title) || name || `Sản phẩm ${platformLabel || 'sàn'}`}</b>
                <small>${chatEscape(metaParts.join(' · '))}</small>
              </span>
            </a>
          `
        }
        if (kind === 'order') {
          const orderSn = chatEscape(item.order_sn || item.order_id || item.name || '')
          const orderArg = chatEscape(JSON.stringify(item.order_sn || item.order_id || item.name || ''))
          return `
            <button type="button" class="chat-card-link order" onclick="openChatOrderCard(${orderArg})">
              <span class="chat-card-icon">DH</span>
              <span>
                <b>${orderSn || 'Thẻ đơn hàng'}</b>
                <small>Khách gửi mã đơn hàng trong chat</small>
              </span>
              ${renderChatOrderCardDetail(item)}
            </button>
          `
        }
        if (!src) {
          return `<div class="chat-media-file"><span>${name}</span>${size ? `<small>${chatEscape(size)}</small>` : ''}</div>`
        }
        if (kind === 'image') {
          return `<a class="chat-media-link" href="${chatEscape(src)}" target="_blank" rel="noopener"><img class="chat-media-image" src="${chatEscape(src)}" alt="${name}" loading="lazy"></a>`
        }
        if (kind === 'video') {
          return `<video class="chat-media-video" src="${chatEscape(src)}" controls playsinline preload="metadata"></video>`
        }
        return `<a class="chat-media-file" href="${chatEscape(src)}" target="_blank" rel="noopener"><span>${name}</span>${size ? `<small>${chatEscape(size)}</small>` : ''}</a>`
      }).join('')}
    </div>
  `
}

function chatMessageHasVisibleContent(message, conversation) {
  if (!message || chatIsSystemDisplayNoise(message, conversation)) return false
  if (String(message.content || '').trim()) return true
  if (String(message.delivery_status || '').trim()) return true
  return chatParseMediaItems(message.media_items).some(item => chatMediaKind(item) !== 'order')
}

function abortChatRequest(controller) {
  if (!controller) return
  try { controller.abort('superseded') } catch { controller.abort() }
}

function makeChatAbort(key) {
  abortChatRequest(chatState[key])
  const controller = new AbortController()
  chatState[key] = controller
  return controller
}

function clearChatAbort(key, controller) {
  if (chatState[key] === controller) chatState[key] = null
}

async function chatFetch(path, options = {}) {
  const { timeoutMs = 15000, signal, ...rest } = options
  const method = String(rest.method || 'GET').toUpperCase()
  const controller = new AbortController()
  const activeSignal = controller.signal
  const forwardAbort = () => {
    try { controller.abort(signal?.reason || 'superseded') } catch { controller.abort() }
  }
  if (signal?.aborted) forwardAbort()
  else if (signal) signal.addEventListener('abort', forwardAbort, { once: true })
  const timer = setTimeout(() => {
    try { controller.abort('timeout') } catch { controller.abort() }
  }, Math.max(1000, Number(timeoutMs) || 15000))
  const fetchOptions = {
    cache: 'no-store',
    ...rest,
    signal: activeSignal
  }
  let res
  try {
    res = await fetch(API + path, fetchOptions)
  } catch (error) {
    const reason = activeSignal?.reason
    if (error?.name === 'AbortError') {
      const err = new Error(reason === 'superseded'
        ? 'Yêu cầu chat đã được thay bằng thao tác mới.'
        : 'Tải dữ liệu chat quá lâu, vui lòng thử lại hoặc bấm Làm mới tin nhắn.')
      err.isSuperseded = reason === 'superseded'
      err.isTimeout = reason !== 'superseded'
      throw err
    }
    if (method === 'GET' && !signal && !activeSignal?.aborted) {
      const retryController = new AbortController()
      const retryTimer = setTimeout(() => {
        try { retryController.abort('timeout') } catch { retryController.abort() }
      }, Math.max(1000, Number(timeoutMs) || 15000))
      try {
        res = await fetch(API + path, { ...rest, cache: 'no-store', signal: retryController.signal })
      } catch (retryError) {
        if (retryError?.name === 'AbortError') {
          const err = new Error('Tải dữ liệu chat quá lâu, vui lòng thử lại hoặc bấm Đồng bộ nội dung API.')
          err.isTimeout = true
          throw err
        }
        throw retryError
      } finally {
        clearTimeout(retryTimer)
      }
    } else {
      throw error
    }
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }
  const rawText = await res.text().catch(() => '')
  let data = {}
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { message: rawText.slice(0, 500) }
    }
  }
  if (!res.ok) {
    const err = new Error(chatErrorMessage(data, `Lỗi ${res.status}`))
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

function canUseChatAutomationHelper() {
  const host = window.location.hostname
  return window.location.protocol === 'file:'
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '[::1]'
    || host === 'shophuyvan-analytics.nghiemchihuy.workers.dev'
}

async function chatAutomationHelperFetch(path, body = {}) {
  if (!canUseChatAutomationHelper()) {
    throw new Error('Trình duyệt đang chặn gọi helper local. Mở OMS bằng domain chính hoặc localhost.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(10000, Number(body.process_timeout || 180) * 1000))
  const requestBody = {
    ...body,
    runtime_settings: {
      ...chatAutomationRuntimePayload(),
      ...(body.runtime_settings || body.runtimeSettings || {})
    }
  }
  try {
    const res = await fetch(`${CHAT_AUTOMATION_HELPER_URL}${path}`, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    const text = await res.text().catch(() => '')
    let data = {}
    if (text) {
      try { data = JSON.parse(text) } catch { data = { error: text } }
    }
    if (!res.ok) throw new Error(chatErrorMessage(data, `Helper local lỗi ${res.status}`))
    return data
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Helper local phản hồi quá lâu hoặc trình duyệt chặn kết nối localhost.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function chatIsMarketplaceAutomationFallbackError(error) {
  const data = error?.data || (error && typeof error === 'object' ? error : {})
  const message = [
    chatErrorMessage(error, ''),
    data.note,
    data.message,
    data.error,
    data.delivery_status
  ].filter(Boolean).join(' ').toLowerCase()
  return data.error === 'missing_shopee_token'
    || data.error === 'missing_buyer_id'
    || data.error === 'missing_lazada_token'
    || data.error === 'missing_session_id'
    || data.error === 'lazada_send_failed'
    || data.error === 'tiktok_send_not_supported'
    || data.sent_to_platform === false
    || data.delivery_status === 'saved_to_oms'
    || message.includes('chưa có token')
    || message.includes('chua co token')
    || message.includes('api shop id')
    || message.includes('in-house im chat')
    || message.includes('im api')
    || message.includes('chưa báo gửi thành công')
    || message.includes('chua bao gui thanh cong')
}

function chatAutomationSendBuyerName() {
  const name = chatDisplayCustomerName(chatState.activeConversation, chatState.messages)
  if (chatIsGenericCustomerName(name) || /^\d{8,}$/.test(String(name || '').trim())) return ''
  return String(name || '').trim()
}

function chatCanUseAutomationSend(error, content, options = {}) {
  const conversation = chatState.activeConversation || {}
  const platform = String(conversation.platform || '').toLowerCase()
  const conversationId = String(conversation.conversation_id || '').trim()
  const supported = ['shopee', 'tiktok'].includes(platform)
  const allowAutomationForConversation = chatConversationAllowsAutomationSend(conversation)
  const hasSafeConversationId = platform === 'shopee'
    ? Boolean(conversationId || chatAutomationSendBuyerName())
    : Boolean(conversationId || chatAutomationSendBuyerName())
  const canPreflight = options.preflight === true && platform === 'tiktok'
  return Boolean(
    content
    && !chatState.pendingMedia.length
    && supported
    && allowAutomationForConversation
    && hasSafeConversationId
    && (canPreflight || chatIsMarketplaceAutomationFallbackError(error))
    && chatAutomationSendBuyerName()
  )
}

async function sendChatReplyByAutomation(content) {
  const conversation = chatState.activeConversation || {}
  const platform = String(conversation.platform || 'shopee').toLowerCase()
  const buyerName = chatAutomationSendBuyerName()
  if (!buyerName) throw new Error(`Chưa xác định được tên khách trên danh sách ${chatPlatformLabel(platform)} nên không gửi automation để tránh nhầm hội thoại.`)
  const result = await chatAutomationHelperFetch('/chat-send', {
    platform,
    shop: conversation.shop || conversation.shop_id || '',
    conversation_id: conversation.conversation_id || '',
    buyer_name: buyerName,
    content,
    admin_token: localStorage.getItem(CHAT_ADMIN_TOKEN_KEY) || '',
    api: API,
    timeout: 35,
    login_timeout: 210,
    reuse_browser: true,
    process_timeout: 300
  })
  const script = result?.result || {}
  const first = Array.isArray(script.results) ? (script.results[0] || {}) : {}
  if (!result?.ok || script.status !== 'ok' || first.status !== 'ok') {
    const message = first.message || first.error || script.message || script.error || result.stderr || 'Automation local chưa gửi được tin nhắn.'
    throw new Error(chatHumanAutomationError(message) || message)
  }
  if (!script.sent_to_platform) {
    throw new Error(`Automation local chưa xác nhận ${chatPlatformLabel(platform)} đã nhận tin nhắn.`)
  }
  return script
}
