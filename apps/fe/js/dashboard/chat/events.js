import { chatApi, zaloHelperApi } from './api.js'
import { DEFAULT_AI_LEARNING_NOTES, DEFAULT_RESTRICTED_KEYWORDS } from './ai-defaults.js?v=chat-auto-send-20260603a'
import { insertOrderSummary, insertProductSummary, insertTextToComposer, openOrderTimeline, previewProductCard, searchProducts, sendOrderCard, sendProductCard } from './context.js?v=chat-auto-send-20260603a'
import { loadConversations, openConversation, saveChatSettings, syncChannel, syncConversation } from './data.js?v=chat-auto-send-20260603a'
import { toggleChatNotifications } from './notifications.js?v=chat-auto-send-20260603a'
import { renderAll, renderConversationList } from './render.js?v=chat-auto-send-20260603a'
import { activeCanWrite, isSocialLocalBridge, mergeMessages, optimisticMessage, setState, state } from './state.js?v=chat-auto-send-20260603a'
import { cancelAiAutoSend, scheduleAiAutoSend } from './auto-send.js?v=chat-auto-send-20260603a'
import { openModal, showToast } from './toast.js'

let searchTimer = null
let keywordTimer = null
let policyCheckSeq = 0
let pendingAttachments = []

export function bindEvents() {
  document.addEventListener('click', handleClick)
  document.addEventListener('input', handleInput)
  document.addEventListener('keydown', handleKeydown)
  document.getElementById('conversationList')?.addEventListener('scroll', renderConversationList)
}

function handleClick(event) {
  const target = event.target.closest('[data-conversation-id], [data-action], [data-filter], [data-detail-tab], [data-sync-channel], [data-quick-reply], [data-order-index], [data-product-index], [data-emoji-code]')
  if (!target) return
  if (target.dataset.conversationId) openConversation(target.dataset.conversationId).catch(error => showToast(error.message, 'error'))
  if (target.dataset.filter) {
    setState({ filter: target.dataset.filter })
    renderAll()
  }
  if (target.dataset.detailTab) {
    setState({ detailTab: target.dataset.detailTab })
    renderAll()
  }
  if (target.dataset.syncChannel) syncChannel(target.dataset.syncChannel)
  if (target.dataset.quickReply) insertTextToComposer(target.dataset.quickReply)
  if (target.dataset.emojiCode) insertEmojiOption(target)
  if (target.dataset.orderIndex && target.dataset.action === 'insert-order-summary') {
    insertOrderSummary(state.context.orders[Number(target.dataset.orderIndex)] || {})
  }
  if (target.dataset.orderIndex && target.dataset.action === 'send-order-card') {
    sendOrderCard(state.context.orders[Number(target.dataset.orderIndex)] || {})
  }
  if (target.dataset.orderIndex && target.dataset.action === 'open-order-timeline') {
    openOrderTimeline(state.context.orders[Number(target.dataset.orderIndex)] || {})
  }
  if (target.dataset.productIndex && target.dataset.action === 'insert-product-summary') {
    insertProductSummary(state.context.products[Number(target.dataset.productIndex)] || {})
  }
  if (target.dataset.productIndex && target.dataset.action === 'send-product-card') {
    sendProductCard(state.context.products[Number(target.dataset.productIndex)] || {})
  }
  if (target.dataset.productIndex && target.dataset.action === 'preview-product-card') {
    previewProductCard(state.context.products[Number(target.dataset.productIndex)] || {})
  }
  if (target.dataset.action) runAction(target.dataset.action, target)
}

function handleInput(event) {
  if (event.target.id === 'chatSearch') {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      setState({ search: event.target.value.trim() })
      // Tìm kiếm phải hỏi lại Chat Core để thấy hội thoại cũ theo nội dung chat hoặc mã đơn.
      loadConversations({ keepActive: true, notify: false }).catch(error => showToast(error.message, 'error'))
    }, 300)
  }
  if (event.target.id === 'chatInput') {
    setState({ composerText: event.target.value })
    if (state.aiAutoSend?.status === 'counting') cancelAiAutoSend('operator_edit')
    if (state.composerMeta && event.target.value.trim() !== state.composerMeta.display) setState({ composerMeta: null })
    clearTimeout(keywordTimer)
    keywordTimer = setTimeout(() => updateComposerPolicyWarningFromServer(event.target.value), 300)
    event.target.style.height = 'auto'
    event.target.style.height = `${Math.min(event.target.scrollHeight, 132)}px`
  }
  if (event.target.id === 'chatAttachment') {
    pendingAttachments = [...event.target.files].map(file => ({ name: file.name, size: file.size, type: 'file' }))
    document.getElementById('attachmentPreview').textContent = pendingAttachments.map(item => item.name).join(', ')
  }
  if (event.target.id === 'productSearch') {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => searchProducts(event.target.value.trim()), 400)
  }
  if (event.target.id === 'aiKeywordSearch') updateAiKeywordList()
  if (['aiProvider', 'aiModel', 'aiGeminiKeys', 'aiAnswerStyle', 'aiAutoReplyMinutes', 'aiLearningNotes', 'aiAllowAutoSend', 'aiRequireSafetyCheck', 'aiWriteInternalNote'].includes(event.target.id)) {
    markAiSettingsDirty()
  }
}

function normalizePolicyText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function restrictedKeywords() {
  const settings = state.aiSettings || {}
  const source = settings.restricted_keywords_public || settings.restricted_keywords || DEFAULT_RESTRICTED_KEYWORDS
  const list = Array.isArray(source) ? source : String(source || '').split(/[\n,;]/)
  return [...new Set(list.map(item => String(item || '').trim()).filter(Boolean))]
}

function checkRestrictedKeywords(text = '') {
  const body = normalizePolicyText(text)
  if (!body) return []
  return restrictedKeywords().filter(keyword => body.includes(normalizePolicyText(keyword)))
}

function policyWarning(blocked = []) {
  return blocked.length ? {
    blocked_terms: blocked,
    message: `Tin nhắn chứa nội dung bị cấm: ${blocked.slice(0, 5).join(', ')}. Vui lòng xóa trước khi gửi.`
  } : null
}

function skipsMarketplaceRestrictedPolicy(conversation = state.activeConversation) {
  return ['zalo', 'facebook'].includes(String(conversation?.channel || '').toLowerCase())
}

async function checkOutboundPolicy(text = '') {
  if (skipsMarketplaceRestrictedPolicy()) return { allowed: true, policy_status: 'allowed', skipped: true }
  if (!String(text || '').trim()) return { allowed: true }
  return chatApi('/api/chat/policy/check', {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 10000,
    body: JSON.stringify({
      text,
      channel: state.activeConversation?.channel || '',
      settings: {
        channel: state.activeConversation?.channel || '',
        restricted_keywords: restrictedKeywords()
      }
    })
  })
}

function applyComposerPolicyWarning(warning = null) {
  setState({ composerPolicyWarning: warning })
  const node = document.getElementById('restrictedKeywordWarning')
  if (node) {
    node.hidden = !warning
    node.textContent = warning ? `⚠️ ${warning.message}` : ''
  }
  return warning
}

function updateComposerPolicyWarning(text = state.composerText || '') {
  if (skipsMarketplaceRestrictedPolicy()) return applyComposerPolicyWarning(null)
  return applyComposerPolicyWarning(policyWarning(checkRestrictedKeywords(text)))
}

async function updateComposerPolicyWarningFromServer(text = state.composerText || '') {
  const seq = ++policyCheckSeq
  const localWarning = updateComposerPolicyWarning(text)
  if (localWarning || !String(text || '').trim()) return localWarning
  try {
    const result = await checkOutboundPolicy(text)
    if (seq !== policyCheckSeq || text !== (document.getElementById('chatInput')?.value || '')) return state.composerPolicyWarning
    const warning = result.allowed === false || result.policy_status === 'blocked'
      ? policyWarning(result.blocked_terms || [])
      : null
    return applyComposerPolicyWarning(warning)
  } catch (error) {
    console.error('[chat_policy_check_failed]', {
      error_code: error?.data?.error_code || 'policy_check_failed',
      error_message: error?.message || String(error)
    })
    return localWarning
  }
}

async function requireOutboundPolicyAllowed(text = '') {
  const localWarning = updateComposerPolicyWarning(text)
  if (localWarning) return localWarning
  const result = await checkOutboundPolicy(text)
  return result.allowed === false || result.policy_status === 'blocked'
    ? applyComposerPolicyWarning(policyWarning(result.blocked_terms || []))
    : applyComposerPolicyWarning(null)
}

function handleKeydown(event) {
  if (event.target.id === 'aiKeywordInput' && event.key === 'Enter') {
    event.preventDefault()
    addAiKeyword()
  }
  if (event.target.id === 'chatInput' && event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    sendMessage()
  }
  if (event.key === 'Escape') {
    setState({ detailOpen: false })
    renderAll()
  }
}

function runAction(action, node) {
  if (action === 'reload') loadConversations()
  if (action === 'sync-current-channel') syncChannel(state.activeConversation?.channel || 'shopee')
  if (action === 'sync-active') syncConversation()
  if (action === 'back-list') {
    setState({ threadOpen: false, detailOpen: false })
    renderAll()
  }
  if (action === 'toggle-detail') {
    setState({ detailOpen: !state.detailOpen })
    renderAll()
  }
  if (action === 'close-detail') {
    setState({ detailOpen: false })
    renderAll()
  }
  if (action === 'pick-file') document.getElementById('chatAttachment')?.click()
  if (action === 'open-orders') setState({ detailTab: 'orders', detailOpen: true })
  if (action === 'open-products') setState({ detailTab: 'products', detailOpen: true })
  if (action === 'open-vouchers') setState({ detailTab: 'voucher', detailOpen: true })
  if (action === 'open-quick-replies') setState({ detailTab: 'quick', detailOpen: true })
  if (action === 'refresh-products') searchProducts(document.getElementById('productSearch')?.value?.trim() || '')
  if (action === 'copy-order-id') copyOrderId(Number(node.dataset.orderIndex))
  if (action === 'insert-emoji') {
    setState({ emojiPickerOpen: !state.emojiPickerOpen })
    renderAll()
  }
  if (action === 'insert-emoji-option') insertEmojiOption(node)
  if (action === 'toggle-notifications') toggleChatNotifications()
  if (action === 'dismiss-ios-install') {
    localStorage.setItem('shophuyvan.chat.ios-install-dismissed-at', String(Date.now()))
    document.getElementById('iosInstallBanner')?.setAttribute('hidden', '')
  }
  if (action === 'send-message') sendMessage()
  if (action === 'cancel-ai-auto-send') cancelAiAutoSend('operator_cancel')
  if (action === 'ai-suggest') suggestAi()
  if (action === 'save-ai-settings') saveAiSettings()
  if (action === 'save-ai-gemini-keys') saveAiSettings('Đã lưu API Gemini.')
  if (action === 'save-ai-keywords') saveAiSettings('Đã lưu từ khóa hạn chế.')
  if (action === 'ai-add-keyword') addAiKeyword()
  if (action === 'ai-delete-keyword') deleteAiKeyword(node.dataset.keyword || '')
  if (action === 'focus-ai-keywords') document.getElementById('aiKeywordSearch')?.focus()
  if (action === 'load-default-ai-keywords') loadDefaultAiKeywords()
  if (action === 'load-default-ai-policy') loadDefaultAiPolicy()
  if (action === 'test-ai-settings') testAiSettings()
  if (action === 'use-ai') useAiSuggestion()
  if (action === 'ai-approve-learning') approveAiLearning()
  if (action === 'ai-reject-learning') rejectAiLearning()
  if (action === 'retry-message') retryMessage(node.dataset.messageId)
  if (action === 'helper-guide') showHelperGuide()
  if (['open-orders', 'open-products', 'open-vouchers', 'open-quick-replies'].includes(action)) renderAll()
}

function insertEmojiOption(node) {
  const display = node.dataset.emojiDisplay || node.dataset.emojiCode || '🙂'
  const code = node.dataset.emojiCode || display
  const isLazada = String(state.activeConversation?.channel || '').toLowerCase() === 'lazada'
  insertTextToComposer(display)
  setState({
    emojiPickerOpen: false,
    composerMeta: isLazada && /^\[[a-z0-9_ -]+\]$/i.test(code)
      ? { message_type: 'emoji', template_id: 4, emoji_code: code, display }
      : null
  })
  renderAll()
}

function currentAiSettingsFromForm() {
  const geminiKeysInput = document.getElementById('aiGeminiKeys')?.value?.trim() || ''
  const settings = {
    ...state.aiSettings,
    ai_provider: document.getElementById('aiProvider')?.value || state.aiSettings.ai_provider || 'fallback',
    ai_model: document.getElementById('aiModel')?.value?.trim() || state.aiSettings.ai_model || 'gemini-2.5-flash',
    ai_answer_style: document.getElementById('aiAnswerStyle')?.value || state.aiSettings.ai_answer_style || 'policy_friendly',
    auto_reply_minutes: Math.min(Math.max(Number(document.getElementById('aiAutoReplyMinutes')?.value || state.aiSettings.auto_reply_minutes || 5), 1), 60),
    ai_learning_notes: document.getElementById('aiLearningNotes')?.value?.trim() || state.aiSettings.ai_learning_notes || DEFAULT_AI_LEARNING_NOTES,
    restricted_keywords: (document.getElementById('aiRestrictedKeywords')?.value || DEFAULT_RESTRICTED_KEYWORDS.join('\n')).split(/\n+/).map(item => item.trim()).filter(Boolean),
    allow_auto_send: document.getElementById('aiAllowAutoSend')?.checked === true,
    require_safety_check: document.getElementById('aiRequireSafetyCheck')?.checked !== false,
    write_internal_note: document.getElementById('aiWriteInternalNote')?.checked === true
  }
  if (geminiKeysInput) settings.gemini_api_keys_input = geminiKeysInput
  return settings
}

function aiKeywordItems() {
  const value = document.getElementById('aiRestrictedKeywords')?.value || DEFAULT_RESTRICTED_KEYWORDS.join('\n')
  return [...new Set(value.split(/\n+/).map(item => item.trim()).filter(Boolean))]
}

function setAiKeywordItems(items = []) {
  const box = document.getElementById('aiRestrictedKeywords')
  if (box) box.value = [...new Set(items.map(item => item.trim()).filter(Boolean))].join('\n')
  markAiSettingsDirty()
  updateAiKeywordList()
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

function escapeMarkup(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char])
}

function updateAiKeywordList() {
  const list = document.getElementById('aiKeywordList')
  if (!list) return
  const filter = (document.getElementById('aiKeywordSearch')?.value || '').trim().toLowerCase()
  const keywords = aiKeywordItems()
  const visible = keywords.filter(keyword => keyword.toLowerCase().includes(filter))
  const counter = document.getElementById('aiKeywordCount')
  if (counter) counter.textContent = `${keywords.length} từ`
  if (!visible.length) {
    list.innerHTML = '<div class="ai-keyword-empty">Không tìm thấy từ khóa</div>'
    return
  }
  list.innerHTML = visible.map(keyword => `
    <div class="ai-keyword-item" data-keyword-row="${escapeMarkup(keyword)}">
      <span>
        <strong>${escapeMarkup(keyword)}</strong>
        <small>${escapeMarkup(keywordSourceLabel(keyword))}</small>
      </span>
      <button class="ai-keyword-delete" type="button" data-action="ai-delete-keyword" data-keyword="${escapeMarkup(keyword)}" aria-label="Xóa từ khóa ${escapeMarkup(keyword)}">×</button>
    </div>
  `).join('')
}

function addAiKeyword() {
  const input = document.getElementById('aiKeywordInput')
  const value = input?.value?.trim()
  if (!value) return
  const keywords = aiKeywordItems()
  if (keywords.some(item => item.toLowerCase() === value.toLowerCase())) {
    showToast('Từ khóa này đã có trong danh sách.', 'error')
    return
  }
  if (input) input.value = ''
  setAiKeywordItems([...keywords, value])
}

function deleteAiKeyword(keyword = '') {
  if (!keyword) return
  setAiKeywordItems(aiKeywordItems().filter(item => item !== keyword))
}

function markAiSettingsDirty() {
  document.querySelector('.ai-settings-savebar')?.classList.add('is-dirty')
  const label = document.getElementById('aiSaveState')
  if (label) label.textContent = 'Có thay đổi chưa lưu.'
}

function loadDefaultAiKeywords() {
  const box = document.getElementById('aiRestrictedKeywords')
  if (box) box.value = DEFAULT_RESTRICTED_KEYWORDS.join('\n')
  updateAiKeywordList()
  markAiSettingsDirty()
  showToast('Đã nạp bộ từ khóa mặc định. Bấm Lưu cài đặt AI để áp dụng.', 'ok')
}

function loadDefaultAiPolicy() {
  const box = document.getElementById('aiLearningNotes')
  if (box) box.value = DEFAULT_AI_LEARNING_NOTES
  markAiSettingsDirty()
  showToast('Đã nạp chính sách sàn vào bộ nhớ AI. Bấm Lưu cài đặt AI để áp dụng.', 'ok')
}

async function saveAiSettings(successMessage = 'Đã lưu cài đặt AI.') {
  try {
    const settings = currentAiSettingsFromForm()
    await saveChatSettings(settings)
    if (settings.gemini_api_keys_input) {
      const keyCount = settings.gemini_api_keys_input.split(/\n+/).map(item => item.trim()).filter(Boolean).length
      setState({ aiSettings: { ...state.aiSettings, gemini_api_key_count: keyCount } })
    }
    const geminiInput = document.getElementById('aiGeminiKeys')
    if (geminiInput) geminiInput.value = ''
    document.querySelector('.ai-settings-savebar')?.classList.remove('is-dirty')
    const label = document.getElementById('aiSaveState')
    if (label) label.textContent = successMessage
    showToast(successMessage, 'ok')
  } catch (error) {
    showToast(`Không lưu được cài đặt AI: ${error.message}`, 'error')
  }
}

async function testAiSettings() {
  try {
    const result = await chatApi('/api/chat/ai/test', {
      method: 'POST',
      allowBusinessError: true,
      body: JSON.stringify(currentAiSettingsFromForm())
    })
    showToast(result.ok ? 'Gemini đã sẵn sàng.' : (result.error_message || 'Gemini chưa sẵn sàng.'), result.ok ? 'ok' : 'error')
  } catch (error) {
    showToast(`Kiểm tra Gemini lỗi: ${error.message}`, 'error')
  }
}

async function copyOrderId(index) {
  const order = state.context.orders[Number(index)] || {}
  const id = order.order_sn || order.platform_order_id || order.order_id || order.id || ''
  if (!id) return showToast('Đơn này chưa có mã để sao chép.', 'error')
  try {
    await navigator.clipboard?.writeText(String(id))
    showToast('Đã sao chép mã đơn.', 'ok')
  } catch {
    insertTextToComposer(String(id))
    showToast('Không truy cập clipboard, đã chèn mã đơn vào ô chat.', 'ok')
  }
}

function activeOrderIdForSend() {
  const conversation = state.activeConversation || {}
  const panelOrder = Array.isArray(state.context.orders) ? state.context.orders[0] : null
  // Ưu tiên mã đơn đang hiển thị ở panel Đơn để Shopee/Lazada nhận đúng ngữ cảnh chat chủ động.
  return conversation.order_id ||
    conversation.order_sn ||
    conversation.platform_order_id ||
    panelOrder?.order_sn ||
    panelOrder?.platform_order_id ||
    panelOrder?.order_id ||
    panelOrder?.id ||
    ''
}

function platformConversationId(conversation = {}) {
  return conversation.platform_conversation_id ||
    conversation.customer_id ||
    conversation.buyer_id ||
    conversation.to_id ||
    conversation.id ||
    ''
}

async function sendViaZaloLocalBridge(conversation = {}, draft = {}, text = '') {
  if (String(conversation.channel || '').toLowerCase() !== 'zalo') {
    throw new Error('Kênh social này chưa có local bridge gửi tin.')
  }
  return zaloHelperApi('/api/shophuyvan-chat/send', {
    method: 'POST',
    allowBusinessError: true,
    body: JSON.stringify({
      text,
      client_temp_id: draft.client_temp_id,
      conversation_id: conversation.id,
      platform_conversation_id: platformConversationId(conversation),
      customer_id: conversation.customer_id,
      customer_name: conversation.customer_name || conversation.display_name || '',
      shop_id: conversation.shop_id,
      channel: conversation.channel
    })
  })
}

async function sendMessage(options = {}) {
  const input = document.getElementById('chatInput')
  const text = input?.value.trim() || ''
  if (!state.activeConversation || (!text && !pendingAttachments.length)) return
  if (!activeCanWrite()) return showToast('Hội thoại này chưa có quyền gửi tin.', 'error')
  if (state.aiAutoSend?.status === 'counting' && options.source !== 'ai_auto_countdown') {
    cancelAiAutoSend('operator_send_now', { silent: true })
  }
  const warning = await requireOutboundPolicyAllowed(text)
  if (warning) {
    input?.focus()
    renderAll()
    showToast(warning.message, 'error')
    return
  }

  const draft = optimisticMessage(text, pendingAttachments)
  const composerMeta = state.composerMeta || null
  setState({ messages: mergeMessages(state.messages, [draft]), sending: true })
  input.value = ''
  pendingAttachments = []
  setState({ composerText: '', composerMeta: null, composerPolicyWarning: null, emojiPickerOpen: false })
  renderAll()

  try {
    const result = isSocialLocalBridge(state.activeConversation)
      ? await sendViaZaloLocalBridge(state.activeConversation, draft, text)
      : await chatApi('/api/chat/messages/send', {
        method: 'POST',
        allowBusinessError: true,
        body: JSON.stringify({
          ...draft,
          text,
          attachments: draft.attachments,
          conversation_id: state.activeConversation.id,
          channel: state.activeConversation.channel,
          shop_id: state.activeConversation.shop_id,
          order_id: activeOrderIdForSend(),
          ...(composerMeta || {})
        })
      })
    const saved = result.message || result.saved_message
    if (saved) setState({ messages: mergeMessages(state.messages, [saved]) })
    if (result.ok === false && !['manual_pending', 'queued_for_browser_helper'].includes(result.status)) {
      setState({
        messages: state.messages.map(item => item.id === draft.id ? {
          ...item,
          status: 'failed',
          error_message: result.error_message || 'Không gửi được tin nhắn.'
        } : item)
      })
      showToast(result.error_message || 'Không gửi được tin nhắn.', 'error')
    } else {
      showToast(result.ok === false ? 'Đã lưu bản nháp, cần gửi tay trên sàn.' : 'Đã gửi tin nhắn.', 'ok')
      if (result.ok !== false) rememberAiReply(text, result.message || result.saved_message)
    }
  } catch (error) {
    setState({
      messages: state.messages.map(item => item.id === draft.id ? {
        ...item,
        status: 'failed',
        error_message: error.message
      } : item)
    })
    showToast(`Gửi lỗi: ${error.message}`, 'error')
  } finally {
    setState({ sending: false })
    renderAll()
  }
}

async function rememberAiReply(sentText = '', sentMessage = null) {
  const suggestion = state.aiSuggestion || {}
  const text = String(sentText || '').trim()
  if (!suggestion.id || !text || !sentMessage?.id || sentMessage.status !== 'sent') return
  const latestCustomer = [...(state.messages || [])].reverse().find(item => item.sender_type === 'customer')
  try {
    const result = await chatApi('/api/chat/ai/approve', {
      method: 'POST',
      allowBusinessError: true,
      body: JSON.stringify({
        suggestion_id: suggestion.id,
        approved_answer: text,
        approved_message_id: sentMessage.id,
        question: latestCustomer?.text || '',
        save_to_knowledge: true,
        approved_by: 'operator'
      })
    })
    if (result.ok !== false) setState({ aiSuggestion: null })
  } catch (error) {
    console.error('[chat_ai_learning_failed]', {
      error_code: error?.data?.error || 'ai_learning_failed',
      error_message: error?.message || String(error)
    })
  }
}

async function approveAiLearning() {
  showToast('AI chỉ học sau khi nhân viên gửi tin thành công. Bấm Gửi để lưu câu trả lời tốt.', 'ok')
}

async function rejectAiLearning() {
  const suggestion = state.aiSuggestion || {}
  if (!suggestion.id) return showToast('Chưa có gợi ý AI để hủy học.', 'error')
  try {
    const result = await chatApi('/api/chat/ai/reject', {
      method: 'POST',
      allowBusinessError: true,
      body: JSON.stringify({
        suggestion_id: suggestion.id,
        reason: 'operator_rejected_learning'
      })
    })
    if (result.ok === false) throw new Error(result.error_message || result.message || 'Không hủy được câu học.')
    setState({ aiSuggestion: null })
    renderAll()
    showToast('Đã hủy học gợi ý này.', 'ok')
  } catch (error) {
    showToast(`Không hủy học được: ${error.message}`, 'error')
  }
}

async function retryMessage(id) {
  const message = state.messages.find(item => item.id === id)
  if (!message) return
  document.getElementById('chatInput').value = message.text || ''
  setState({ composerText: message.text || '' })
  await sendMessage()
}

async function suggestAi() {
  if (!state.activeConversation) return
  try {
    const data = await chatApi('/api/chat/ai/suggest', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: state.activeConversation.id, messages: state.messages.slice(-12) })
    })
    const suggestion = data.suggestion || data
    setState({ aiSuggestion: suggestion })
    if (suggestion?.policy_status === 'blocked') {
      renderAll()
      showToast('AI đã chặn gợi ý này, cần nhân viên tự xử lý.', 'error')
    } else if (suggestion?.suggested_text) {
      insertTextToComposer(suggestion.suggested_text)
      renderAll()
      const scheduled = scheduleAiAutoSend(data, sendMessage)
      if (!scheduled) {
        showToast(suggestion.prompt_context?.agent_handoff_required
          ? 'Đã chèn gợi ý AI. Cần đọc căn cứ trước khi gửi.'
          : 'Đã chèn gợi ý AI vào khung chat.', 'ok')
      }
    } else {
      showToast('AI chưa trả về nội dung để chèn.', 'error')
    }
  } catch (error) {
    showToast(`AI chưa gợi ý được: ${error.message}`, 'error')
  }
}

function useAiSuggestion() {
  const input = document.getElementById('chatInput')
  const suggestion = state.aiSuggestion?.suggested_text || ''
  if (input && suggestion) {
    input.value = suggestion
    input.focus()
  }
}

export function showHelperGuide() {
  openModal({
    title: 'Cần mở helper TikTok/manual',
    body: `
      <div class="detail-grid">
        <p class="detail-muted">Helper chưa sẵn sàng. Mở đúng profile trình duyệt của shop rồi bấm Sync lại.</p>
        <p class="detail-muted">Nếu vẫn chưa chạy, kiểm tra bảng điều khiển automation local để xem trạng thái đăng nhập và lịch quét.</p>
      </div>
    `
  })
}

