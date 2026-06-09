import { DEFAULT_AI_LEARNING_NOTES, restrictedKeywordsText as defaultRestrictedKeywordsText } from './ai-defaults.js?v=chat-auto-send-20260603a'
import { state } from './state.js?v=chat-auto-send-20260603a'
import { escapeHtml } from './toast.js'

export const DETAIL_TABS = [
  ['orders', 'Đơn'],
  ['products', 'Sản phẩm'],
  ['voucher', 'Voucher'],
  ['ai', 'Cài đặt AI'],
  ['quick', 'Trả lời nhanh'],
  ['sync', 'Chẩn đoán']
]

const QUICK_REPLIES = [
  'Dạ Shop Huy Vân xin chào quý khách ạ!',
  'Dạ shop kiểm tra đơn và phản hồi mình ngay ạ.',
  'Dạ sản phẩm bên shop còn hàng, mình đặt giúp shop nhé.',
  'Dạ shop đã ghi nhận thông tin và sẽ xử lý sớm nhất ạ.',
  'Dạ mình cho shop xin mã đơn hàng để kiểm tra chính xác hơn ạ.'
]

function text(value, fallback = '') {
  if (value === 0) return '0'
  if (value === null || value === undefined) return fallback
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean).join(', ') || fallback
  if (typeof value === 'object') {
    return text(value.value ?? value.text ?? value.name ?? value.label ?? value.title ?? value.display_value, fallback)
  }
  const plain = String(value).replace(/\u00a0/g, ' ').trim()
  return plain && plain !== '[object Object]' ? plain : fallback
}

function valueAt(source = {}, key = '') {
  return key.split('.').reduce((item, part) => item?.[part], source)
}

function firstValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = valueAt(source, key)
    if (value === 0) return value
    const plain = text(value)
    if (plain) return value
  }
  return ''
}

function amountValue(value) {
  if (value && typeof value === 'object') return amountValue(value.value ?? value.amount ?? value.total)
  if (value === 0) return 0
  const plain = text(value)
  if (!plain) return ''
  const cleaned = plain.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : plain
}

function currency(value) {
  const amount = amountValue(value)
  if (amount === '') return ''
  if (typeof amount === 'string') return amount
  return `${amount.toLocaleString('vi-VN')}đ`
}

function dateText(value) {
  const raw = firstValue({ value }, ['value'])
  const plain = text(raw)
  if (!plain) return ''
  const number = Number(plain)
  const date = Number.isFinite(number) && plain.length >= 10
    ? new Date(plain.length === 10 ? number * 1000 : number)
    : new Date(plain)
  if (Number.isNaN(date.getTime())) return plain
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function orderId(order = {}) {
  return text(firstValue(order, ['order_sn', 'platform_order_id', 'order_id', 'id']), 'Đơn hàng')
}

function orderStatus(order = {}) {
  return text(firstValue(order, ['display_status_vi', 'status_label_vi', 'workflow_status', 'order_status_core', 'status', 'raw_platform_status']), 'Chưa rõ trạng thái')
}

function orderCreatedTime(order = {}) {
  return dateText(firstValue(order, ['created_at', 'create_time', 'order_time', 'placed_at', 'order_date', 'updated_at']))
}

function paymentAmount(order = {}) {
  return firstValue(order, [
    'buyer_total_amount',
    'total_amount',
    'payment.total',
    'payment.amount',
    'amounts.buyer_paid.value',
    'amounts.revenue.value',
    'final_total',
    'escrow_amount'
  ])
}

function paymentMethod(order = {}) {
  return text(firstValue(order, ['payment_method', 'payment_method_display', 'pay_method', 'payment.method', 'payment_method_title']), 'Chưa có')
}

function paymentTime(order = {}) {
  return dateText(firstValue(order, ['payment_time', 'pay_time', 'paid_at', 'payment.paid_at', 'payment.updated_at']))
}

function logisticsName(order = {}) {
  return text(firstValue(order, ['shipping_carrier', 'logistics_provider', 'tracking_core_logistics_provider', 'carrier', 'logistics_channel', 'logistics.channel_name', 'shipping_provider', 'delivery_option', 'shipping_method']), 'Chưa có')
}

function completeTime(order = {}) {
  return dateText(firstValue(order, ['completed_at', 'complete_time', 'delivered_at', 'delivery_time', 'tracking_delivered_at', 'ship_by_date']))
}

function productName(product = {}) {
  return text(firstValue(product, ['name', 'product_name', 'item_name', 'title', 'sku']), 'Sản phẩm')
}

function productVariation(product = {}) {
  return text(firstValue(product, ['variation_name', 'model_name', 'variation', 'classification', 'option_name', 'model_original_name']))
}

function productSku(product = {}) {
  return text(firstValue(product, ['sku', 'platform_sku', 'model_sku', 'item_sku', 'seller_sku']))
}

function productImage(product = {}) {
  return text(firstValue(product, ['image_url', 'image', 'thumbnail_url', 'cover_url', 'main_image', 'image_info.image_url']))
}

function productPrice(product = {}) {
  return firstValue(product, ['price', 'sale_price', 'current_price', 'final_price', 'original_price', 'item_price'])
}

function productStock(product = {}) {
  const raw = firstValue(product, ['stock', 'available_stock', 'stock_info', 'inventory', 'normal_stock', 'sellable_stock'])
  if (raw === '') return ''
  if (typeof raw === 'object') return text(raw.available ?? raw.normal_stock ?? raw.stock ?? raw.total ?? raw.sellable_stock)
  return text(raw)
}

function orderNotes(order = {}) {
  return [
    ['Ghi chú của người mua', firstValue(order, ['customer_note', 'buyer_note', 'message_to_seller', 'customer_note_display', 'note'])],
    ['Ghi chú người bán', firstValue(order, ['seller_note', 'seller_remark', 'seller_memo'])],
    ['Ghi chú đơn hàng OMS', firstValue(order, ['duoke_note', 'operator_note', 'staff_note', 'internal_note', 'oms_note'])]
  ]
}

export function normalizeDetailTab(tab) {
  return DETAIL_TABS.some(([id]) => id === tab) ? tab : 'orders'
}

export function detailTitle(tab) {
  return DETAIL_TABS.find(([id]) => id === normalizeDetailTab(tab))?.[1] || 'Đơn'
}

export function renderDetailBody(conversation = {}) {
  const tab = normalizeDetailTab(state.detailTab)
  if (tab === 'orders') return renderOrderPanel()
  if (tab === 'products') return renderProductPanel()
  if (tab === 'voucher') return renderVoucherPanel()
  if (tab === 'ai') return renderAiPanel()
  if (tab === 'quick') return renderQuickReplyPanel()
  return renderSyncPanel(conversation)
}

function renderOrderPanel() {
  const orders = state.context.orders || []
  if (state.context.loading) return '<div class="empty-state">Đang tải đơn hàng từ Order Core...</div>'
  if (!orders.length) return '<div class="empty-state">Chưa tìm thấy đơn hàng gắn với hội thoại này trong Order Core.</div>'
  return `<section class="detail-section">${orders.map((order, index) => renderOrderCard(order, index)).join('')}</section>`
}

function renderOrderCard(order = {}, index = 0) {
  const items = Array.isArray(order.items) ? order.items : []
  const total = paymentAmount(order)
  return `
    <article class="order-operational-card">
      <div class="order-card-top duoke-order-head">
        <span class="status-pill warn">${escapeHtml(orderStatus(order))}</span>
        <strong class="order-code">${escapeHtml(orderId(order))}</strong>
        <button class="icon-btn compact" type="button" title="Sao chép mã đơn" data-action="copy-order-id" data-order-index="${index}">⧉</button>
        <button class="icon-btn compact" type="button" title="Đồng bộ lại hội thoại" data-action="sync-active">↻</button>
        ${orderCreatedTime(order) ? `<small>${escapeHtml(orderCreatedTime(order))}</small>` : ''}
      </div>
      <div class="order-product-list">
        ${items.length ? items.slice(0, 8).map(renderOrderItem).join('') : '<div class="empty-state compact">Đơn chưa có dòng sản phẩm trong read-model.</div>'}
      </div>
      <div class="order-facts duoke-facts">
        <span>Số tiền thanh toán của người mua</span><strong>${escapeHtml(currency(total) || 'Chưa có')}</strong>
        <span>Phương thức thanh toán</span><strong>${escapeHtml(paymentMethod(order))}</strong>
        <span>Thời gian thanh toán</span><strong>${escapeHtml(paymentTime(order) || 'Chưa có')}</strong>
        <span>Đơn vị vận chuyển</span><strong>${escapeHtml(logisticsName(order))}</strong>
        <span>Thời gian hoàn thành</span><strong>${escapeHtml(completeTime(order) || 'Chưa có')}</strong>
        ${text(order.tracking_number) ? `<span>Mã vận đơn</span><strong class="mono">${escapeHtml(order.tracking_number)}</strong>` : ''}
      </div>
      <div class="order-note-box duoke-note-box">
        <strong>Ghi chú</strong>
        ${orderNotes(order).map(([label, value], noteIndex) => `
          <div class="note-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(text(value, noteIndex === 0 ? 'Không có' : '+'))}</strong>
          </div>
        `).join('')}
      </div>
      <div class="context-actions duoke-actions">
        <button class="chat-btn ghost" type="button" data-action="insert-order-summary" data-order-index="${index}">Hóa đơn</button>
        <button class="chat-btn ghost" type="button" data-action="open-order-timeline" data-order-index="${index}">Chi tiết</button>
        <button class="chat-btn primary" type="button" data-action="send-order-card" data-order-index="${index}">Gửi</button>
      </div>
    </article>
  `
}

function renderOrderItem(item = {}) {
  const image = productImage(item)
  const price = productPrice(item)
  const qty = item.quantity ?? item.qty ?? item.item_quantity ?? 1
  const variation = productVariation(item)
  return `
    <div class="order-product-row duoke-product-line">
      <div class="product-thumb">${image ? `<img src="${escapeHtml(image)}" alt="">` : '<span>SP</span>'}</div>
      <div>
        <strong>${escapeHtml(productName(item))}</strong>
        ${variation ? `<small>Phân loại: ${escapeHtml(variation)}</small>` : ''}
        <small>SKU: ${escapeHtml(productSku(item) || 'Chưa có SKU')}</small>
      </div>
      <div class="order-item-side">
        ${price !== '' ? `<strong>${escapeHtml(currency(price))}</strong>` : ''}
        <small>x ${escapeHtml(qty)}</small>
      </div>
    </div>
  `
}

function renderProductPanel() {
  const products = state.context.products || []
  return `
    <section class="detail-section">
      <div class="product-tool-row">
        <button class="chat-btn ghost" type="button">Tên/SKU</button>
        <input id="productSearch" value="${escapeHtml(state.context.productSearch || '')}" placeholder="Tìm tên sản phẩm, SKU">
        <button class="icon-btn" type="button" title="Làm mới sản phẩm" data-action="refresh-products">↻</button>
        <button class="icon-btn" type="button" title="Sắp xếp">☰</button>
      </div>
      ${state.context.productLoading ? '<div class="empty-state compact">Đang tìm sản phẩm...</div>' : ''}
      <div class="product-result-list duoke-product-list">
        ${products.length ? products.map((product, index) => renderProductCard(product, index)).join('') : '<div class="empty-state">Chưa có sản phẩm phù hợp. Nhập tên/SKU để tìm trong Product Core.</div>'}
      </div>
    </section>
  `
}

function renderProductCard(product = {}, index = 0) {
  const image = productImage(product)
  const price = productPrice(product)
  const stock = productStock(product)
  const recent = product.source === 'order' || Number(product.recent_inquiries || product.inquiry_count || 0) > 0
  return `
    <article class="product-context-card duoke-product-card">
      <div class="product-thumb">${image ? `<img src="${escapeHtml(image)}" alt="">` : '<span>SP</span>'}</div>
      <div class="product-context-main">
        <strong>${escapeHtml(productName(product))}</strong>
        <small>SKU: ${escapeHtml(productSku(product) || product.platform_product_id || product.item_id || 'Chưa có')}</small>
        ${price !== '' ? `<b class="product-price">${escapeHtml(currency(price))}</b>` : ''}
        <div class="tag-list">
          ${recent ? '<span class="tag warn">Recent inquiries</span>' : ''}
          ${stock ? `<span class="tag">Tồn ${escapeHtml(stock)}</span>` : ''}
        </div>
      </div>
      <div class="product-actions">
        <button class="icon-btn" type="button" data-action="preview-product-card" data-product-index="${index}" title="Kiểm tra gửi">↻</button>
        <button class="chat-btn primary" type="button" data-action="send-product-card" data-product-index="${index}">Gửi</button>
      </div>
    </article>
  `
}

function renderVoucherPanel() {
  const voucher = state.context.voucher
  if (state.context.loading) return '<div class="empty-state">Đang tải voucher...</div>'
  if (!voucher?.supported) return '<div class="empty-state">Kênh này chưa hỗ trợ voucher trong Chat.</div>'
  if (!voucher.active) return '<div class="empty-state">Không có voucher đang chạy để gửi.</div>'
  const programs = Array.isArray(voucher.programs) ? voucher.programs : []
  return `<section class="detail-section">${programs.map(program => `
    <article class="context-card">
      <strong>${escapeHtml(program.name || program.promotion_name || 'Voucher')}</strong>
      <span class="detail-muted">${escapeHtml(program.status || 'Đang chạy')}</span>
    </article>
  `).join('')}</section>`
}

function renderQuickReplyPanel() {
  return `<section class="detail-section">${QUICK_REPLIES.map(reply => `
    <button class="quick-reply" type="button" data-quick-reply="${escapeHtml(reply)}">
      <span>${escapeHtml(reply)}</span>
      <strong>Chèn</strong>
    </button>
  `).join('')}</section>`
}

function restrictedKeywordsText() {
  const keywords = state.aiSettings?.restricted_keywords
  return Array.isArray(keywords) && keywords.length ? keywords.join('\n') : defaultRestrictedKeywordsText(keywords)
}

function keywordList() {
  return restrictedKeywordsText().split(/\n+/).map(item => item.trim()).filter(Boolean)
}

function keywordSourceLabel(keyword = '') {
  const normalized = String(keyword || '').toLowerCase()
  if (normalized.includes('shopee')) return 'Shopee'
  if (normalized.includes('lazada')) return 'Lazada'
  if (normalized.includes('tiktok')) return 'TikTok'
  if (normalized.includes('zalo')) return 'Zalo'
  if (normalized.includes('facebook') || normalized.includes('messenger')) return 'Facebook'
  if (normalized.includes('web') || normalized.includes('link')) return 'Ngoài sàn'
  if (normalized.includes('sdt') || normalized.includes('điện thoại') || normalized.includes('hotline') || normalized.includes('phone')) return 'Liên hệ riêng'
  return 'Tất cả'
}

function renderKeywordManager() {
  const keywords = keywordList()
  return `
    <div class="ai-keyword-manager">
      <input id="aiRestrictedKeywords" type="hidden" value="${escapeHtml(keywords.join('\n'))}">
      <div class="ai-keyword-search">
        <span aria-hidden="true">⌕</span>
        <input id="aiKeywordSearch" type="search" placeholder="Tìm từ khóa..." autocomplete="off">
        <strong id="aiKeywordCount">${keywords.length} từ</strong>
      </div>
      <div class="ai-keyword-list" id="aiKeywordList">
        ${keywords.map(keyword => `
          <div class="ai-keyword-item" data-keyword-row="${escapeHtml(keyword)}">
            <span>
              <strong>${escapeHtml(keyword)}</strong>
              <small>${escapeHtml(keywordSourceLabel(keyword))}</small>
            </span>
            <button class="ai-keyword-delete" type="button" data-action="ai-delete-keyword" data-keyword="${escapeHtml(keyword)}" aria-label="Xóa từ khóa ${escapeHtml(keyword)}">×</button>
          </div>
        `).join('')}
      </div>
      <div class="ai-keyword-add">
        <input id="aiKeywordInput" placeholder="Thêm từ khóa mới..." autocomplete="off">
        <button type="button" data-action="ai-add-keyword">Thêm</button>
      </div>
    </div>
  `
}

function renderAiPanel() {
  const settings = state.aiSettings || {}
  const keyCount = Number(settings.gemini_api_key_count || 0) || 0
  const autoReplyMinutes = Number(settings.auto_reply_minutes || 5) || 5
  const answerStyle = settings.ai_answer_style || 'policy_friendly'
  const keyStatus = keyCount ? `Đã lưu ${keyCount} API Gemini` : 'Chưa lưu API Gemini'
  return `
    <section class="detail-section ai-settings-panel ai-settings-compact">
      <div class="ai-panel-summary">
        <div>
          <strong>Bộ nhớ và luật an toàn AI</strong>
          <p>Quản lý Gemini, chính sách sàn, từ khóa chặn và quyền tự gửi.</p>
        </div>
        <a class="chat-btn ghost" href="/settings.html" target="_blank" rel="noopener">Mở trang cài đặt</a>
        <span class="status-pill ${keyCount ? 'ok' : 'warn'}">${escapeHtml(keyStatus)}</span>
      </div>

      <div class="ai-settings-card">
        <div class="context-head">
          <strong>Kết nối AI</strong>
          <button class="chat-btn ghost" type="button" data-action="test-ai-settings">Kiểm tra Gemini</button>
        </div>
        <div class="ai-api-status-row">
          <div>
            <span>Google Gemini</span>
            <strong>${keyCount ? `Đang lưu ${keyCount} key` : 'Chưa có API key'}</strong>
          </div>
          <span class="status-pill ${keyCount ? 'ok' : 'warn'}">${keyCount ? 'Đã cấu hình' : 'Cần nhập key'}</span>
        </div>
        <label class="chat-field stacked">
          <span>Nhà cung cấp</span>
          <select id="aiProvider">
            <option value="fallback" ${settings.ai_provider !== 'gemini' ? 'selected' : ''}>Gợi ý nội bộ</option>
            <option value="gemini" ${settings.ai_provider === 'gemini' ? 'selected' : ''}>Gemini API</option>
          </select>
        </label>
        <label class="chat-field stacked">
          <span>Model Gemini</span>
          <input id="aiModel" value="${escapeHtml(settings.ai_model || 'gemini-2.5-flash')}" placeholder="gemini-2.5-flash">
        </label>
        <label class="chat-field stacked">
          <span>API Gemini xoay vòng</span>
          <textarea id="aiGeminiKeys" rows="5" spellcheck="false" placeholder="${keyCount ? `Đang lưu ${keyCount} API. Nhập 4-5 key mới, mỗi dòng một key, để thay bộ hiện tại.` : 'Mỗi dòng một API key. Tối đa 5 key để xoay vòng.'}"></textarea>
        </label>
        <div class="ai-api-key-actions">
          <button class="chat-btn primary" type="button" data-action="save-ai-gemini-keys">Lưu API Gemini</button>
          <span>Nhập mỗi key một dòng, tối đa 5 key để hệ thống xoay vòng khi hỗ trợ khách.</span>
        </div>
        <small class="detail-muted">Key đã lưu được ẩn. Nếu nhập key mới rồi lưu, hệ thống thay toàn bộ bộ key hiện tại.</small>
      </div>

      <div class="ai-settings-card">
        <div class="context-head">
          <strong>Mô hình và luật tự động</strong>
        </div>
        <div class="ai-rule-box">
          <span>Phong cách</span>
          <select id="aiAnswerStyle">
            <option value="policy_friendly" ${answerStyle === 'policy_friendly' ? 'selected' : ''}>Chính sách shop + thân thiện</option>
            <option value="short_order" ${answerStyle === 'short_order' ? 'selected' : ''}>Ngắn gọn theo đơn hàng</option>
            <option value="product_advisor" ${answerStyle === 'product_advisor' ? 'selected' : ''}>Tư vấn sản phẩm</option>
          </select>
        </div>
        <div class="ai-rule-box">
          <span>Gợi ý khi chưa trả lời sau</span>
          <input id="aiAutoReplyMinutes" type="number" min="1" max="60" value="${escapeHtml(autoReplyMinutes)}">
          <small>phút</small>
        </div>
        <div class="ai-rule-box">
          <span>Không gửi nếu chứa từ khóa nhạy cảm</span>
          <button class="chat-btn ghost" type="button" data-action="focus-ai-keywords">Xem danh sách</button>
        </div>
      </div>

      <div class="ai-settings-card">
        <div class="context-head">
          <strong>Quyền hạn AI</strong>
        </div>
        <label class="ai-toggle-row">
          <span>Cho phép tự gửi khi tin tưởng cao</span>
          <input id="aiAllowAutoSend" type="checkbox" ${settings.allow_auto_send ? 'checked' : ''}>
        </label>
        <label class="ai-toggle-row">
          <span>Vượt qua kiểm tra an toàn nội bộ</span>
          <input id="aiRequireSafetyCheck" type="checkbox" ${settings.require_safety_check !== false ? 'checked' : ''}>
        </label>
        <label class="ai-toggle-row">
          <span>Ghi chú nội bộ sau mỗi hội thoại</span>
          <input id="aiWriteInternalNote" type="checkbox" ${settings.write_internal_note ? 'checked' : ''}>
        </label>
      </div>

      <div class="ai-settings-card" id="aiKeywordSection">
        <div class="context-head">
          <strong>Từ khóa không được gửi</strong>
          <button class="chat-btn ghost" type="button" data-action="load-default-ai-keywords">Nạp mặc định</button>
        </div>
        ${renderKeywordManager()}
      </div>

      <div class="ai-settings-card ai-memory-card">
        <div class="context-head">
          <strong>Bộ nhớ kiến thức AI</strong>
          <button class="chat-btn ghost" type="button" data-action="load-default-ai-policy">Nạp chính sách sàn</button>
        </div>
        <textarea id="aiLearningNotes" rows="10" placeholder="Chính sách Shopee, Lazada, TikTok, cách xưng hô, sản phẩm cần ưu tiên, quy trình xử lý...">${escapeHtml(settings.ai_learning_notes || DEFAULT_AI_LEARNING_NOTES)}</textarea>
      </div>
      <div class="ai-settings-savebar">
        <span class="ai-save-state" id="aiSaveState">Cài đặt đang dùng cho gợi ý AI và tự gửi an toàn.</span>
        <button class="chat-btn primary" type="button" data-action="save-ai-settings">Lưu cài đặt AI</button>
      </div>
    </section>
  `
}

function renderSyncPanel(conversation = {}) {
  const diagnostic = state.diagnostics.get(conversation.id)
  const issue = diagnostic?.diagnostic || {}
  const steps = Array.isArray(issue.recovery_steps) ? issue.recovery_steps : []
  return `
    <section class="detail-section">
      <div class="diagnostic-card">
        <strong>${escapeHtml(conversation.last_error_message || 'Chẩn đoán đồng bộ')}</strong>
        <p class="detail-muted">${escapeHtml(issue.suggested_action || 'Chưa có chẩn đoán chi tiết.')}</p>
        <div class="recovery-list">
          ${steps.map(step => `<label class="recovery-item"><input type="checkbox"> <span>${escapeHtml(step)}</span></label>`).join('')}
        </div>
        <button class="chat-btn primary" type="button" data-action="sync-active">Sync ngay</button>
      </div>
    </section>
  `
}

