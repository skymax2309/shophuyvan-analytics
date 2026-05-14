// NEO: Frontend chat sàn - nhóm knowledge-order-sync-base. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
window.setChatTaskDraft = function() {
  appendChatReplyText('Dạ shop ghi nhận yêu cầu này và sẽ chuyển nhân viên xử lý ngay ạ.')
}

function chatShortText(value, length = 90) {
  const text = String(value || '').trim()
  return text.length > length ? `${text.slice(0, length - 3)}...` : text
}

// Chuẩn hóa tên hiển thị để dữ liệu cũ không còn hiện chung chung là "Khách hàng".
function chatIsGenericCustomerName(value) {
  const text = String(value || '').trim()
  if (!text) return true
  const normalized = text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return !normalized || ['khach hang', 'customer', 'buyer', 'nguoi mua', 'unknown'].includes(normalized)
}

function chatDisplayCustomerName(conversation, messages = []) {
  const direct = String(conversation?.buyer_name || '').trim()
  if (!chatIsGenericCustomerName(direct)) return direct
  const fromMessage = (messages || []).find(message => message.sender_type !== 'shop' && !chatIsGenericCustomerName(message.sender_name))
  if (fromMessage?.sender_name) return fromMessage.sender_name
  return conversation?.buyer_id || conversation?.conversation_id || 'Khách hàng'
}

function chatMessageSenderInfo(message, conversation) {
  const isShop = String(message?.sender_type || '').toLowerCase() === 'shop'
  const shopName = conversation?.shop || conversation?.shop_id || 'Shop'
  if (isShop) {
    return {
      side: 'shop',
      role: 'Shop trả lời',
      name: message?.sender_name && !chatIsGenericCustomerName(message.sender_name) ? message.sender_name : shopName
    }
  }
  return {
    side: 'buyer',
    role: 'Khách gửi',
    name: !chatIsGenericCustomerName(message?.sender_name) ? message.sender_name : chatDisplayCustomerName(conversation, [message])
  }
}

// Lấy câu hỏi gần nhất của khách để lưu thành cặp hỏi đáp đã duyệt cho AI.
function chatPreviousCustomerMessage(messages = [], index = 0) {
  for (let i = Number(index) - 1; i >= 0; i--) {
    const item = messages[i]
    if (String(item?.sender_type || '').toLowerCase() === 'shop') continue
    const content = String(item?.content || '').trim()
    if (content && !isChatNotice(content)) return content
  }
  return ''
}

function chatKnowledgeCategoryFromText(question = '', answer = '') {
  const text = `${question} ${answer}`.toLowerCase()
  if (/hỏa tốc|hoả tốc|instant|trong ngày|2h|2 giờ/.test(text)) return 'Hỏa tốc'
  if (/mã vận|vận đơn|đơn vị vận chuyển|giao không thành công|đang giao|chưa nhận/.test(text)) return 'Khiếu nại vận chuyển'
  if (/ship|giao|vận chuyển/.test(text)) return 'Vận chuyển'
  if (/đơn hàng|mã đơn|đặt hàng|đóng gói|trạng thái đơn/.test(text)) return 'Đơn hàng'
  if (/bảo hành|đổi trả|hoàn|trả hàng|lỗi/.test(text)) return 'Bảo hành/đổi trả'
  if (/giá|voucher|mã giảm|khuyến mại|khuyến mãi|sale/.test(text)) return 'Giá/voucher'
  if (/cách dùng|sử dụng|lưu ý|an toàn|cháy|hỏng|lắp/.test(text)) return 'Hướng dẫn sử dụng'
  if (/kích thước|size|chất liệu|công dụng|sử dụng|lắp/.test(text)) return 'Tư vấn sản phẩm'
  return 'CSKH chung'
}

const CHAT_KNOWLEDGE_CATEGORIES = [
  'CSKH chung',
  'Đơn hàng',
  'Vận chuyển',
  'Hỏa tốc',
  'Khiếu nại vận chuyển',
  'Giá/voucher',
  'Tư vấn sản phẩm',
  'Hướng dẫn sử dụng',
  'Lưu ý an toàn',
  'Bảo hành/đổi trả',
  'Hủy/hoàn',
  'Chào hỏi/cảm ơn',
  'Chính sách sàn'
]

// Danh mục cố định giúp mẫu AI được phân loại đồng nhất, tránh mỗi lần nhập một kiểu.
function normalizeChatKnowledgeCategory(value) {
  const category = String(value || '').trim()
  return CHAT_KNOWLEDGE_CATEGORIES.includes(category) ? category : 'CSKH chung'
}

function chatKnowledgeCategoryOptions(selected = 'CSKH chung') {
  const current = normalizeChatKnowledgeCategory(selected)
  return CHAT_KNOWLEDGE_CATEGORIES

    .map(category => `<option value="${chatEscape(category)}" ${category === current ? 'selected' : ''}>${chatEscape(category)}</option>`)
    .join('')
}

function ensureChatKnowledgeModal() {
  let modal = chatEl('chatKnowledgeModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'chatKnowledgeModal'
  modal.className = 'chat-quick-modal chat-knowledge-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="chat-quick-backdrop" onclick="closeChatKnowledgeModal()"></div>
    <section class="chat-quick-dialog" role="dialog" aria-modal="true" aria-labelledby="chatKnowledgeTitle">
      <div class="chat-quick-head">
        <div>
          <strong id="chatKnowledgeTitle">Lưu mẫu AI</strong>
          <small>Chỉ lưu câu trả lời đã kiểm tra để AI tham khảo lần sau.</small>
        </div>
        <button type="button" class="chat-quick-close" onclick="closeChatKnowledgeModal()" aria-label="Đóng">×</button>
      </div>
      <div class="chat-quick-body">
        <label class="chat-field-label" for="chatKnowledgeQuestion">Khách hỏi</label>
        <textarea id="chatKnowledgeQuestion" class="chat-settings-textarea" rows="4"></textarea>
        <label class="chat-field-label" for="chatKnowledgeAnswer">Shop trả lời mẫu</label>
        <textarea id="chatKnowledgeAnswer" class="chat-settings-textarea" rows="5"></textarea>
        <div class="chat-knowledge-grid">
          <label>
            <span>Nhóm kiến thức</span>
            <select id="chatKnowledgeCategory" class="chat-settings-input">
              ${chatKnowledgeCategoryOptions('CSKH chung')}
            </select>
          </label>
          <label>
            <span>Ưu tiên</span>
            <input id="chatKnowledgePriority" class="chat-settings-input" type="number" min="-10" max="10" step="1" value="0">
          </label>
        </div>
        <div id="chatKnowledgeStatus" class="chat-settings-note">Mẫu lưu ở trạng thái đã duyệt và chỉ áp dụng cho shop đang chat.</div>
      </div>
      <div class="chat-quick-actions">
        <button type="button" class="chat-settings-save secondary" onclick="closeChatKnowledgeModal()">Đóng</button>
        <button type="button" class="chat-settings-save" id="chatKnowledgeSaveBtn" onclick="saveChatKnowledgeSample()">Lưu mẫu đã duyệt</button>
      </div>
    </section>
  `
  document.body.appendChild(modal)
  return modal
}

window.openChatKnowledgeModal = function(index) {
  const message = chatState.messages?.[Number(index)]
  if (!chatState.activeConversation || !message) return
  const question = chatPreviousCustomerMessage(chatState.messages, Number(index))
  const answer = String(message.content || '').trim()
  const modal = ensureChatKnowledgeModal()
  chatState.knowledgeSaveIndex = Number(index)
  const questionEl = chatEl('chatKnowledgeQuestion')
  const answerEl = chatEl('chatKnowledgeAnswer')
  const categoryEl = chatEl('chatKnowledgeCategory')
  const priorityEl = chatEl('chatKnowledgePriority')
  const status = chatEl('chatKnowledgeStatus')
  if (questionEl) questionEl.value = question
  if (answerEl) answerEl.value = answer
  if (categoryEl) categoryEl.value = normalizeChatKnowledgeCategory(chatKnowledgeCategoryFromText(question, answer))
  if (priorityEl) priorityEl.value = '0'
  if (status) status.textContent = question ? 'Kiểm tra lại nội dung trước khi lưu để tránh AI học sai.' : 'Chưa tìm thấy câu hỏi gần nhất của khách, bạn cần nhập thủ công.'
  modal.hidden = false
  document.body.classList.add('chat-quick-modal-open')
  setTimeout(() => (question ? answerEl : questionEl)?.focus(), 40)
}

window.closeChatKnowledgeModal = function() {
  const modal = chatEl('chatKnowledgeModal')
  if (modal) modal.hidden = true
  chatState.knowledgeSaveIndex = null
  document.body.classList.remove('chat-quick-modal-open')
}

window.saveChatKnowledgeSample = async function() {
  const btn = chatEl('chatKnowledgeSaveBtn')
  const status = chatEl('chatKnowledgeStatus')
  const question = String(chatEl('chatKnowledgeQuestion')?.value || '').trim()
  const answer = String(chatEl('chatKnowledgeAnswer')?.value || '').trim()
  if (!question || !answer) {
    if (status) status.textContent = 'Cần có đủ câu hỏi của khách và câu trả lời mẫu.'
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang lưu...'
  }
  try {
    const conversation = chatState.activeConversation || {}
    const message = chatState.messages?.[Number(chatState.knowledgeSaveIndex)] || {}
    const data = await chatFetch('/api/chat/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: conversation.platform || '',
        shop: conversation.shop || conversation.shop_id || '',
        conversation_id: conversation.id || conversation.conversation_id || '',
        question,
        answer,
        category: normalizeChatKnowledgeCategory(chatEl('chatKnowledgeCategory')?.value),
        priority: Number(chatEl('chatKnowledgePriority')?.value || 0),
        status: 'approved',
        source_type: 'staff_reply',
        source_message_id: message.message_id || ''
      })
    })
    if (status) status.textContent = 'Đã lưu mẫu đã duyệt cho AI.'
    chatState.knowledgeItems = [data.knowledge, ...chatState.knowledgeItems.filter(item => Number(item.id) !== Number(data.knowledge?.id))].filter(Boolean)
    renderChatSetup(chatState.setupData || {})
    setTimeout(() => window.closeChatKnowledgeModal(), 500)
  } catch (error) {
    if (status) status.textContent = `Không lưu được mẫu: ${chatErrorMessage(error)}`
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Lưu mẫu đã duyệt'
    }
  }
}

function chatOrderPanelOrders(context = chatState.context || {}) {
  return [
    ...(Array.isArray(context?.orders) ? context.orders : []),
    ...(Array.isArray(context?.soft_orders) ? context.soft_orders : [])
  ]
}

function chatOrderById(orderId) {
  const target = String(orderId || '').trim().toUpperCase()
  if (!target) return null
  return chatOrderPanelOrders().find(order => String(order.order_id || '').trim().toUpperCase() === target) || null
}

function resetChatOrderPanelState(options = {}) {
  chatState.orderPanelSyncing = false
  if (!options.keepStatus) chatState.orderPanelSyncStatus = ''
  chatState.orderLogisticsLoadingId = ''
  chatState.orderLogisticsById = new Map()
}

function chatOrderSyncCapability(conversation = chatState.activeConversation || {}, context = chatState.context || {}) {
  if (!conversation?.id && !conversation?.conversation_id) {
    return { canSync: false, tone: 'blocked', reason: 'Chọn hội thoại trước khi đồng bộ đơn hàng.', buttonLabel: 'Đồng bộ đơn' }
  }
  const meta = context?.order_context || {}
  const platform = String(conversation.platform || '').trim().toLowerCase()
  const shopValue = String(conversation.shop || conversation.shop_id || '').trim()
  const displayName = String(conversation.shop || conversation.shop_display_name || conversation.shop_id || '').trim() || 'shop đang chat'
  return {
    canSync: Boolean(Number(meta.can_sync || 0)),
    tone: Number(meta.can_sync || 0) ? 'api' : (String(meta.mode || '') === 'api_needs_auth' ? 'blocked' : 'muted'),
    reason: String(meta.sync_reason || meta.source_note || 'Shop này chưa có API đơn hàng.').trim(),
    sourceLabel: String(meta.source_label || 'Tham chiếu OMS').trim(),
    sourceNote: String(meta.source_note || '').trim(),
    latestSyncAt: String(meta.latest_shop_sync_at || '').trim(),
    syncRecommended: Boolean(Number(meta.sync_recommended || 0)),
    syncKey: String(meta.sync_key || `${platform}|${shopValue}`).trim(),
    buttonLabel: String(meta.sync_button_label || 'Đồng bộ đơn').trim(),
    platform,
    shopValue,
    displayName
  }
}

function renderChatOrderSyncHeaderAction(conversation = chatState.activeConversation || {}, context = chatState.context || {}) {
  const syncState = chatOrderSyncCapability(conversation, context)
  if (!syncState.canSync) return ''
  const latestSyncLabel = syncState.latestSyncAt
    ? (chatTime(syncState.latestSyncAt) || syncState.latestSyncAt)
    : ''
  const titleParts = [
    syncState.sourceLabel,
    syncState.sourceNote || syncState.reason,
    latestSyncLabel ? `Đồng bộ gần nhất: ${latestSyncLabel}` : ''
  ].filter(Boolean)
  // Đưa nút đồng bộ lên header để panel Đơn hàng chỉ còn dữ liệu vận hành, đồng thời tách nhãn mobile để không che tên khách.
  return `
    <button
      type="button"
      class="chat-thread-sync-btn"
      onclick="syncChatOrdersForConversation()"
      ${chatState.orderPanelSyncing ? 'disabled' : ''}
      title="${chatEscape(titleParts.join(' · '))}"
      aria-label="${chatEscape(chatState.orderPanelSyncing ? 'Đang đồng bộ đơn hàng' : syncState.buttonLabel)}"
    >
      <span class="chat-sync-label-full">${chatState.orderPanelSyncing ? 'Đang đồng bộ...' : chatEscape(syncState.buttonLabel)}</span>
      <span class="chat-sync-label-mobile">${chatState.orderPanelSyncing ? '...' : 'ĐB'}</span>
    </button>
  `
}
