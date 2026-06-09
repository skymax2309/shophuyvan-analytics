import { channelColorClass, healthTone, isManualOnly, isSocialLocalBridge, state } from './state.js?v=chat-auto-send-20260603a'
import { attachmentType, attachmentUrl, orderIdFromMessage, orderMatchesMessage, productIdsFromMessage, productMatchesMessage } from './message-context.js'
import { DETAIL_TABS, detailTitle, normalizeDetailTab, renderDetailBody } from './detail-panels.js?v=chat-auto-send-20260603a'
import { escapeHtml } from './toast.js'

const ITEM_HEIGHT = 76
const BUFFER = 5

function text(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function previewText(value, fallback = 'Ch\u01b0a c\u00f3 n\u1ed9i dung') {
  if (value && typeof value === 'object') {
    return text(value.text || value.message || value.content?.text || value.caption || value.type, fallback)
  }
  const plain = text(value, fallback)
  return plain === '[object Object]' ? fallback : plain
}

function displayCustomerName(conversation = {}) {
  return text(conversation.customer_name || conversation.buyer_name || conversation.display_name || 'Khách chưa rõ')
}

function displayShopName(conversation = {}) {
  return text(conversation.shop_display_name || conversation.shop_name || conversation.shop_id || 'Chưa rõ shop')
}

function rawCustomerId(conversation = {}) {
  return text(conversation.customer_id || conversation.buyer_id || conversation.to_id)
}

function initials(conversation = {}) {
  const raw = displayCustomerName(conversation) || 'KH'
  return raw.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function relativeTime(value) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return ''
  const diff = Math.max(Date.now() - time, 0)
  const minute = Math.floor(diff / 60000)
  if (minute < 1) return 'vừa xong'
  if (minute < 60) return `${minute}p`
  const hour = Math.floor(minute / 60)
  if (hour < 24) return `${hour}h`
  const day = Math.floor(hour / 24)
  if (day === 1) return 'hôm qua'
  return `${day} ngày`
}

function fullTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

function channelLabel(channel = '') {
  return {
    shopee: 'Shopee',
    lazada: 'Lazada',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    zalo: 'Zalo',
    internal: 'Nội bộ'
  }[String(channel).toLowerCase()] || 'Nội bộ'
}

function currency(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return number.toLocaleString('vi-VN') + 'đ'
}

function capabilityLabel(conversation = {}) {
  const sync = text(conversation.sync_capability).toLowerCase()
  const send = text(conversation.send_capability).toLowerCase()
  if (isSocialLocalBridge(conversation)) return 'Bridge local'
  if (sync === 'webhook') return 'Tự nhận realtime'
  if (sync === 'polling_api') return 'Tự kéo định kỳ'
  if (sync === 'browser_helper') return 'Helper trình duyệt'
  if (sync === 'manual_import') return 'Nhập tay'
  if (send === 'manual_only') return 'Gửi tay'
  return 'Chưa nối'
}

function sendLabel(conversation = {}) {
  const send = text(conversation.send_capability).toLowerCase()
  if (isSocialLocalBridge(conversation)) return 'Gửi qua helper local'
  if (send === 'official_api') return 'Gửi bằng API'
  if (send === 'bridge') return 'Gửi qua bridge'
  if (send === 'manual_only') return 'Lưu bản nháp'
  return 'Không gửi từ hệ thống'
}

function syncLabel(conversation = {}) {
  const sync = text(conversation.sync_capability).toLowerCase()
  if (isSocialLocalBridge(conversation)) return 'Helper local đang xử lý'
  if (sync === 'webhook') return 'Tin đến tức thời'
  if (sync === 'polling_api') return 'Tự đồng bộ'
  if (sync === 'browser_helper') return 'Cần helper chạy'
  if (sync === 'manual_import') return 'Nhập thủ công'
  return 'Chưa đồng bộ'
}

function healthLabel(health = '') {
  if (health === 'ok') return 'Ổn'
  if (health === 'stale') return 'Chậm sync'
  if (health === 'critical') return 'Cần xử lý'
  return 'Chưa rõ'
}

function productName(product = {}) {
  return text(product.name || product.product_name || product.item_name || product.title || product.sku || 'Sản phẩm')
}

function productSku(product = {}) {
  return text(product.sku || product.platform_sku || product.model_sku || product.item_sku)
}

function productImage(product = {}) {
  return text(product.image_url || product.image || product.thumbnail_url || product.cover_url)
}

export function filteredConversations() {
  const q = state.search.toLowerCase()
  return state.conversations.filter(item => {
    if (state.filter === 'unread' && Number(item.unread_count || 0) <= 0) return false
    if (state.filter === 'reply') {
      const needsReply = text(item.last_sender_type).toLowerCase() === 'customer' || Number(item.unread_count || 0) > 0
      if (!needsReply) return false
    }
    if (state.filter === 'issues' && !['stale', 'critical', 'unknown'].includes(item.sync_health)) return false
    if (!q) return true
    return `${displayCustomerName(item)} ${rawCustomerId(item)} ${item.platform_conversation_id} ${previewText(item.last_message_text, '')} ${displayShopName(item)} ${item.shop_id}`.toLowerCase().includes(q)
  })
}

export function renderConversationList() {
  const box = document.getElementById('conversationList')
  if (!box) return
  const rows = filteredConversations()
  const visibleHeight = box.clientHeight || 480
  const scrollTop = box.scrollTop || 0
  const start = Math.max(Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER, 0)
  const end = Math.min(Math.ceil((scrollTop + visibleHeight) / ITEM_HEIGHT) + BUFFER, rows.length)
  const slice = rows.slice(start, end)
  const html = slice.map((conversation, offset) => {
    const top = (start + offset) * ITEM_HEIGHT
    const unread = Number(conversation.unread_count || 0) > 0
    const tone = healthTone(conversation.sync_health)
    const healthClass = tone === 'danger' ? 'critical' : tone === 'warn' ? 'stale' : tone === 'ok' ? 'ok' : 'unknown'
    return `
      <article class="conversation-item ${conversation.id === state.activeId ? 'active' : ''} ${unread ? 'unread' : 'read'}" style="top:${top}px" data-conversation-id="${escapeHtml(conversation.id)}">
        <div class="avatar">${escapeHtml(initials(conversation))}<span class="channel-badge ${channelColorClass(conversation.channel)}"></span></div>
        <div class="conversation-main">
          <div class="conversation-title ${unread ? 'unread' : ''}">
            <span>${escapeHtml(displayCustomerName(conversation))}</span>
            <span class="shop-inline">| ${escapeHtml(displayShopName(conversation))}</span>
          </div>
          <div class="conversation-snippet">${highlight(previewText(conversation.last_message_text))}</div>
          <div class="conversation-meta">${escapeHtml(channelLabel(conversation.channel))}${rawCustomerId(conversation) ? ` · ${escapeHtml(rawCustomerId(conversation))}` : ''}</div>
        </div>
        <div class="conversation-side">
          <span class="mono">${escapeHtml(relativeTime(conversation.last_message_at || conversation.updated_at))}</span>
          <span class="health-dot health-${healthClass}" title="${escapeHtml(syncTooltip(conversation))}"></span>
          ${unread ? `<span class="status-pill danger unread-count-badge">Chưa đọc ${Number(conversation.unread_count)}</span>` : '<span class="conversation-read-state">Đã đọc</span>'}
        </div>
      </article>
    `
  }).join('')
  box.innerHTML = `<div class="conversation-spacer" style="height:${rows.length * ITEM_HEIGHT}px">${html}</div>`
}

function highlight(value = '') {
  const source = escapeHtml(value)
  const q = state.search.trim()
  if (!q) return source
  return source.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>')
}

function syncTooltip(conversation = {}) {
  if (conversation.sync_health === 'ok') return 'Đồng bộ ổn'
  if (conversation.sync_health === 'stale') return 'Chưa sync vài phút'
  if (conversation.sync_health === 'critical') return conversation.last_error_message || 'Đồng bộ cần xử lý'
  return 'Chưa có lần sync'
}

export function renderThreadHeader() {
  const box = document.getElementById('threadHeader')
  if (!box) return
  const conversation = state.activeConversation
  if (!conversation) {
    box.innerHTML = '<div><div class="thread-title">Chọn một hội thoại</div><div class="thread-subtitle">Danh sách bên trái đang đọc dữ liệu đã đồng bộ.</div></div>'
    return
  }
  box.innerHTML = `
    <div>
      <div class="thread-title">${escapeHtml(displayCustomerName(conversation))}</div>
      <div class="thread-subtitle">
        <span>${escapeHtml(channelLabel(conversation.channel))}</span>
        <span>${escapeHtml(displayShopName(conversation))}</span>
        ${rawCustomerId(conversation) ? `<span>${escapeHtml(rawCustomerId(conversation))}</span>` : ''}
        <span class="status-pill ${healthTone(conversation.sync_health)}">${escapeHtml(syncTooltip(conversation))}</span>
      </div>
    </div>
    <div class="thread-actions">
      <button class="chat-btn ghost" type="button" data-action="back-list">Danh sách</button>
      <button class="chat-btn ghost" type="button" data-action="toggle-detail">Chi tiết</button>
    </div>
  `
}

function messageStatus(message = {}) {
  const status = text(message.status).toLowerCase()
  if (status === 'sending') return 'Đang gửi'
  if (status === 'sent') return 'Đã gửi'
  if (status === 'synced') return 'Đã đồng bộ'
  if (status === 'failed') return 'Lỗi gửi'
  if (status === 'manual_pending') return 'Cần gửi tay'
  if (status === 'queued_for_browser_helper') return 'Chờ helper'
  return status || 'Đã lưu'
}

function normalizedKeyword(value) {
  return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function displaySenderType(message = {}) {
  const current = text(message.sender_type).toLowerCase()
  if (current === 'shop' || current === 'system' || current === 'ai') return current
  if (text(message.channel).toLowerCase() !== 'tiktok') return 'customer'
  const body = normalizedKeyword(message.text)
  if (
    body.includes('da het thoi gian cho cuoc tro chuyen') ||
    body.includes('hien thi doan chat da dong') ||
    body.includes('khach lau khong mua')
  ) return 'system'
  if (
    body.includes('ben shop') ||
    body.startsWith('da shop') ||
    body.includes('shop huy van') ||
    body.includes('cam on ban da dat hang') ||
    body.includes('hay xac nhan dia chi') ||
    body.includes('id don hang') ||
    body.includes('trang thai da') ||
    body.includes('da gui tep dinh kem')
  ) return 'shop'
  return 'customer'
}

function senderDisplay(message = {}, sender = displaySenderType(message)) {
  if (sender === 'shop') return { label: 'Shop', name: text(message.sender_name || state.activeConversation?.shop_display_name || state.activeConversation?.shop_id, 'Shop Huy Vân') }
  if (sender === 'system') return { label: 'Hệ thống', name: text(message.sender_name || 'TikTok') }
  return { label: 'Khách', name: text(message.sender_name || state.activeConversation?.customer_name, 'Khách') }
}

function findMessageOrder(message = {}) {
  return (state.context.orders || []).find(order => orderMatchesMessage(order, message)) || null
}

function findMessageProduct(message = {}) {
  return (state.context.products || []).find(product => productMatchesMessage(product, message)) || null
}

function renderMessageContext(message = {}) {
  const orderId = orderIdFromMessage(message)
  const productIds = productIdsFromMessage(message)
  const order = orderId ? findMessageOrder(message) : null
  const product = productIds.length ? findMessageProduct(message) : null
  const blocks = []
  if (orderId) blocks.push(renderInlineOrderCard(order, orderId))
  if (productIds.length) blocks.push(renderInlineProductCard(product, productIds[0]))
  return blocks.length ? `<div class="message-context-stack">${blocks.join('')}</div>` : ''
}

function renderInlineOrderCard(order, orderId) {
  const title = order?.order_sn || order?.platform_order_id || order?.order_id || order?.id || orderId
  const status = order?.status_label_vi || order?.display_status_vi || order?.workflow_status || order?.status || order?.raw_platform_status || (state.context.loading ? 'Đang tải đơn hàng' : 'Chưa tìm thấy đơn')
  const total = order?.total_amount || order?.buyer_total_amount || order?.amounts?.revenue?.value
  return `
    <button class="message-context-card" type="button" data-action="open-orders">
      <span class="context-icon">Đơn</span>
      <span class="context-copy">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(status)}${total ? ` · ${escapeHtml(currency(total))}` : ''}</small>
      </span>
    </button>
  `
}

function renderInlineProductCard(product, productId) {
  const image = productImage(product || {})
  const name = product ? productName(product) : productId
  const sku = product ? (productSku(product) || product.platform_item_id || product.item_id || productId) : (state.context.loading ? 'Đang tải sản phẩm' : 'Chưa tìm thấy sản phẩm')
  return `
    <button class="message-context-card product" type="button" data-action="open-products">
      <span class="context-thumb">${image ? `<img src="${escapeHtml(image)}" alt="">` : 'SP'}</span>
      <span class="context-copy">
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(sku)}</small>
      </span>
    </button>
  `
}

export function renderMessages() {
  const box = document.getElementById('messageThread')
  if (!box) return
  if (!state.activeConversation) {
    box.innerHTML = '<div class="empty-state">Chọn hội thoại để xem tin nhắn.</div>'
    return
  }
  if (!state.messages.length) {
    box.innerHTML = '<div class="empty-state">Hội thoại này chưa có tin nhắn.</div>'
    return
  }
  let day = ''
  box.innerHTML = state.messages.map(message => {
    const created = new Date(message.created_at || message.updated_at)
    const nextDay = Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString('vi-VN')
    const dateLine = nextDay && nextDay !== day ? (day = nextDay, `<div class="date-separator">${escapeHtml(nextDay)}</div>`) : ''
    const sender = displaySenderType(message)
    const senderInfo = senderDisplay(message, sender)
    const channelClass = channelColorClass(message.channel)
    return `
      ${dateLine}
      <div class="message-row ${sender}">
        <article class="message-bubble ${channelClass}">
          <div class="message-sender-label">
            <span>${escapeHtml(senderInfo.label)}</span>
            <b>${escapeHtml(senderInfo.name)}</b>
          </div>
          <div class="message-text">${escapeHtml(message.text || (message.attachments?.length ? 'Đã gửi tệp đính kèm' : ''))}</div>
          ${renderAttachments(message)}
          ${renderMessageContext(message)}
          <div class="message-meta">
            <span>${escapeHtml(fullTime(message.created_at))}</span>
            ${message.platform_message_id ? `<span> · ${escapeHtml(message.platform_message_id)}</span>` : ''}
            <span class="message-status"> · ${escapeHtml(messageStatus(message))}</span>
          </div>
          ${message.status === 'failed' ? `<div class="message-error">${escapeHtml(message.error_message || 'Không gửi được tin.')} <button class="chat-btn danger" type="button" data-action="retry-message" data-message-id="${escapeHtml(message.id)}">Thử lại</button></div>` : ''}
          ${message.status === 'manual_pending' ? '<div class="manual-banner">Cần gửi tay trên sàn. Nội dung đã lưu trong hệ thống.</div>' : ''}
        </article>
      </div>
    `
  }).join('')
  box.scrollTop = box.scrollHeight
}

function renderAttachments(message = {}) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  if (!attachments.length) return ''
  return `<div class="message-media-grid">${attachments.map(item => {
    const url = attachmentUrl(item)
    const type = attachmentType(item)
    if (!url) return `<div class="message-file-link">${escapeHtml(item.name || 'Tệp đính kèm')}</div>`
    if (type === 'image') {
      return `<a class="message-image-link" href="${escapeHtml(url)}" target="_blank" rel="noopener"><img class="message-image" src="${escapeHtml(url)}" alt="${escapeHtml(item.name || 'Hình ảnh khách gửi')}" loading="lazy"></a>`
    }
    if (type === 'video') {
      return `<video class="message-video" src="${escapeHtml(url)}" controls preload="metadata"></video>`
    }
    return `<a class="message-file-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(item.name || url)}</a>`
  }).join('')}</div>`
}

const EMOJI_OPTIONS = [
  ['🙂', '[happy]'],
  ['😄', '[veryhappy]'],
  ['😘', '[blowingkiss]'],
  ['😍', '[love]'],
  ['🙏', '[thanks]'],
  ['👌', '[ok]'],
  ['😕', '[confused]'],
  ['😢', '[sad]']
]

function renderEmojiPicker(conversation = {}) {
  if (!state.emojiPickerOpen) return ''
  const isLazada = String(conversation.channel || '').toLowerCase() === 'lazada'
  return `
    <div class="emoji-picker" role="listbox" aria-label="Chọn emoji">
      ${EMOJI_OPTIONS.map(([display, code]) => `
        <button class="emoji-option" type="button" data-action="insert-emoji-option" data-emoji-display="${escapeHtml(display)}" data-emoji-code="${escapeHtml(isLazada ? code : display)}" title="${escapeHtml(isLazada ? code : display)}">${escapeHtml(display)}</button>
      `).join('')}
    </div>
  `
}

function friendlyAiContextText(value = '') {
  return String(value || '')
    .replace(/Product Core|Order Core|Core|worker_unhandled_error|endpoint|route|context_builder_error/gi, 'dữ liệu kiểm chứng')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function aiContextEvidence() {
  const suggestion = state.aiSuggestion || {}
  const context = suggestion.prompt_context || {}
  const orderCount = Number(context.order_context_count || 0) || 0
  const productCount = Number(context.product_context_count || 0) || 0
  const warnings = Array.isArray(context.core_context_warnings) ? context.core_context_warnings : []
  const evidenceLines = Array.isArray(context.agent_evidence_lines) ? context.agent_evidence_lines : []
  const sourceLabels = Array.isArray(context.agent_source_labels) ? context.agent_source_labels : []
  const missingContext = Array.isArray(context.agent_missing_context) ? context.agent_missing_context : []
  const riskLabels = Array.isArray(context.agent_risk_labels) ? context.agent_risk_labels : []
  const intent = context.simple_intent?.intent || context.simple_intent || ''
  const mode = context.agent_mode === 'reviewed_auto_ready'
    ? 'Sẵn sàng duyệt trước khi tự gửi'
    : context.delivery_mode === 'auto_simple'
      ? 'Tự gửi chỉ khi đủ căn cứ'
      : 'Chờ nhân viên duyệt'
  const warningText = warnings[0]
    ? friendlyAiContextText(warnings[0])
    : ''
  const evidenceText = evidenceLines.length
    ? evidenceLines.map(friendlyAiContextText).join(' · ')
    : `${orderCount ? `${orderCount} đơn` : 'chưa có đơn'} · ${productCount ? `${productCount} sản phẩm` : 'chưa có sản phẩm'}`
  const sourceText = sourceLabels.length ? sourceLabels.map(friendlyAiContextText).join(' · ') : ''
  const missingText = missingContext.length ? missingContext.map(friendlyAiContextText).join(' · ') : ''
  const riskText = friendlyAiContextText(context.agent_handoff_reason || riskLabels[0] || warningText)
  if (!suggestion.id) return ''
  return `
    <section class="ai-suggestion-evidence" aria-label="Bằng chứng AI đã dùng">
      <div>
        <strong>AI đã soạn từ dữ liệu đã kiểm</strong>
        <span>${escapeHtml(mode)} · ${escapeHtml(evidenceText)}</span>
        ${sourceText ? `<small>Nguồn bật: ${escapeHtml(sourceText)}</small>` : ''}
        ${intent ? `<small>${escapeHtml(intent === 'order_status_simple' ? 'Câu hỏi đơn hàng đơn giản' : intent === 'product_info_simple' ? 'Câu hỏi sản phẩm đơn giản' : 'Cần nhân viên xem lại')}</small>` : ''}
        ${missingText ? `<small class="ai-evidence-warning">Thiếu: ${escapeHtml(missingText)}</small>` : ''}
        ${riskText ? `<small class="ai-evidence-warning">Cần duyệt: ${escapeHtml(riskText)}</small>` : ''}
      </div>
      <div class="ai-learning-actions">
        <button class="chat-btn ghost" type="button" data-action="ai-approve-learning">Gửi để AI học</button>
        <button class="chat-btn ghost" type="button" data-action="ai-reject-learning">Hủy học</button>
      </div>
    </section>
  `
}

function renderAiAutoSendCountdown() {
  const run = state.aiAutoSend
  if (!run) return ''
  const total = Math.max(Number(run.total_seconds || 0) || 1, 1)
  const left = Math.max(Number(run.seconds_left || 0) || 0, 0)
  const progress = Math.max(Math.min(((total - left) / total) * 100, 100), 0)
  const sending = run.status === 'sending'
  return `
    <section class="ai-auto-send-countdown" aria-live="assertive">
      <div class="ai-auto-send-copy">
        <strong>${sending ? 'AI đang gửi tin' : `AI sẽ tự gửi sau ${escapeHtml(left)} giây`}</strong>
        <span>${escapeHtml(run.reason || 'Bạn có thể hủy trước khi gửi.')}</span>
      </div>
      <div class="ai-auto-send-bar" aria-hidden="true"><i style="width:${progress}%"></i></div>
      <button class="chat-btn danger" type="button" data-action="cancel-ai-auto-send" ${sending ? 'disabled' : ''}>Hủy gửi</button>
    </section>
  `
}

export function renderComposer() {
  const box = document.getElementById('messageComposer')
  if (!box) return
  const conversation = state.activeConversation
  if (!conversation) {
    box.innerHTML = ''
    return
  }
  const disabled = String(conversation.send_capability || '').toLowerCase() === 'none'
  const manual = isManualOnly(conversation)
  const policyWarning = state.composerPolicyWarning
  box.innerHTML = `
    ${disabled ? '<div class="composer-warning">Shop này chưa có quyền gửi tin từ hệ thống.</div>' : ''}
    ${manual ? '<div class="composer-warning">Shop này cần gửi tay trên sàn. Nút gửi sẽ lưu bản nháp để nhân viên thao tác.</div>' : ''}
    ${aiContextEvidence()}
    ${renderAiAutoSendCountdown()}
    <textarea id="chatInput" class="composer-input" rows="1" ${disabled ? 'disabled' : ''} placeholder="${manual ? 'Nhập bản nháp phản hồi...' : 'Nhập tin nhắn cho khách...'}">${escapeHtml(state.composerText || '')}</textarea>
    <div id="restrictedKeywordWarning" class="composer-warning keyword-warning" ${policyWarning ? '' : 'hidden'}>${policyWarning ? `⚠️ ${escapeHtml(policyWarning.message)}` : ''}</div>
    ${renderEmojiPicker(conversation)}
    <div class="composer-shortcuts">
      <button class="shortcut-btn" type="button" data-action="insert-emoji" ${disabled ? 'disabled' : ''}>Emoji</button>
      <button class="shortcut-btn" type="button" data-action="open-quick-replies">Trả lời nhanh</button>
      <button class="shortcut-btn" type="button" data-action="open-orders">Đơn hàng</button>
      <button class="shortcut-btn" type="button" data-action="open-products">Sản phẩm</button>
      <button class="shortcut-btn" type="button" data-action="open-vouchers">Voucher</button>
    </div>
    <div class="composer-tools">
      <input id="chatAttachment" type="file" hidden multiple>
      <button class="chat-btn ghost" type="button" data-action="pick-file" ${disabled ? 'disabled' : ''}>Đính kèm</button>
      <div id="attachmentPreview" class="attachment-preview"></div>
      <div class="composer-actions">
        <button class="chat-btn ghost" type="button" data-action="ai-suggest" ${disabled ? 'disabled' : ''}>Gợi ý AI</button>
        <button class="chat-btn primary" type="button" data-action="send-message" ${disabled ? 'disabled' : ''}>${manual ? 'Lưu bản nháp' : 'Gửi'}</button>
      </div>
    </div>
  `
}

export function renderDetail() {
  const box = document.getElementById('conversationDetail')
  if (!box) return
  const conversation = state.activeConversation
  if (!conversation) {
    box.innerHTML = '<div class="detail-body"><div class="empty-state">Chưa chọn hội thoại.</div></div>'
    return
  }
  const activeTab = normalizeDetailTab(state.detailTab)
  state.detailTab = activeTab
  box.innerHTML = `
    <header class="detail-head">
      <button class="icon-btn detail-close" type="button" data-action="close-detail" aria-label="Đóng chi tiết">×</button>
      <strong>${escapeHtml(detailTitle(activeTab))}</strong>
    </header>
    <nav class="detail-tabs" aria-label="Chi tiết hội thoại">
      ${DETAIL_TABS.map(([id, label]) => `<button class="detail-tab ${activeTab === id ? 'active' : ''}" type="button" data-detail-tab="${id}">${escapeHtml(label)}</button>`).join('')}
    </nav>
    <section class="detail-body">${renderDetailBody(conversation)}</section>
  `
}


export function renderSyncBar() {
  const box = document.getElementById('syncStatusBar')
  if (!box) return
  const channels = ['shopee', 'lazada', 'tiktok', 'zalo']
  box.innerHTML = channels.map(channel => {
    const rows = state.conversations.filter(item => item.channel === channel)
    const critical = rows.some(item => item.sync_health === 'critical')
    const stale = rows.some(item => item.sync_health === 'stale' || item.sync_health === 'unknown')
    const tone = !rows.length ? 'warn' : critical ? 'danger' : stale ? 'warn' : 'ok'
    const label = !rows.length ? 'chưa có dữ liệu' : critical ? 'cần kiểm tra' : stale ? 'chưa mới' : 'đang ổn'
    const action = `<button type="button" data-sync-channel="${channel}">Sync</button>${channel === 'tiktok' && (critical || stale) ? '<button type="button" data-action="helper-guide">Hướng dẫn</button>' : ''}`
    return `
      <div class="sync-row">
        <strong>${escapeHtml(channelLabel(channel))}</strong>
        <span><i class="health-dot health-${tone === 'danger' ? 'critical' : tone === 'warn' ? 'stale' : 'ok'}"></i> ${label}</span>
        ${action}
      </div>
    `
  }).join('')
}

export function renderFilters() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === state.filter)
  })
}

export function renderAll() {
  const app = document.getElementById('chatApp')
  app?.classList.toggle('thread-open', Boolean(state.threadOpen))
  app?.classList.toggle('detail-open', Boolean(state.detailOpen))
  app?.classList.toggle('ai-settings-open', state.detailOpen && state.detailTab === 'ai')
  renderFilters()
  renderConversationList()
  renderThreadHeader()
  renderMessages()
  renderComposer()
  renderDetail()
  renderSyncBar()
  document.getElementById('realtimeBanner')?.toggleAttribute('hidden', state.realtime.status !== 'offline')
}

