// NEO: Frontend chat sàn - nhóm settings-quick-replies. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function currentChatSettings() {
  return { ...chatSettingsDefaults(), ...(chatState.settings || {}) }
}

function chatChecked(value) {
  return Number(value) ? 'checked' : ''
}

function chatSelected(value, expected) {
  return String(value || '') === String(expected || '') ? 'selected' : ''
}

function chatNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function chatRuleLines(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(/[\n;]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function mergeRequiredChatAiForbiddenPatterns(value) {
  const merged = [...REQUIRED_CHAT_AI_FORBIDDEN_PATTERNS, ...chatRuleLines(value)]
  return [...new Set(merged.map(item => String(item || '').trim()).filter(Boolean))]
}

function mergeRequiredChatAiRules(value) {
  // Luật này luôn phải hiện trong ô cấu hình để đội vận hành kiểm tra đúng câu từ chối liên hệ trên sàn.
  const merged = [...REQUIRED_CHAT_AI_RULE_LINES, ...chatRuleLines(value)]
  return [...new Set(merged.map(item => String(item || '').trim()).filter(Boolean))].join('\n')
}

function normalizeChatQuickReplies(value) {
  const source = Array.isArray(value) ? value : []
  const seen = new Set()
  const items = []
  for (const raw of source) {
    const content = String(typeof raw === 'object' ? (raw.content || raw.text || raw.message || raw.value || '') : raw || '').trim()
    if (!content) continue
    const key = content.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    const title = String(typeof raw === 'object' ? raw.title || '' : '').trim() || content.split('\n')[0].slice(0, 80)
    items.push({ title: title.slice(0, 80), content: content.slice(0, 1200) })
  }
  return items.slice(0, 80)
}

function chatQuickReplies() {
  const saved = normalizeChatQuickReplies(currentChatSettings().quick_replies)
  return saved.length ? saved : normalizeChatQuickReplies(chatSettingsDefaults().quick_replies)
}

function parseQuickReplyEditor(value) {
  return String(value || '')
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => ({ title: item.split('\n')[0].slice(0, 80), content: item.slice(0, 1200) }))
}

function chatMoney(value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n === 0) return '0 đ'
  return `${n.toLocaleString('vi-VN')} đ`
}

function isChatMobileView() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
}

function syncChatMobileShell() {
  const open = Boolean(chatState.mobileThreadVisible && chatState.activeId)
  document.body.classList.toggle('chat-mobile-thread-open', open)
  document.body.classList.toggle('chat-mobile-attachments-open', Boolean(open && chatState.mobileAttachOpen))
}

function closeChatMobileContext() {
  document.body.classList.remove('chat-mobile-context-open')
}

function closeChatMobileAttachments() {
  chatState.mobileAttachOpen = false
  syncChatMobileShell()
}

function appendChatReplyText(text) {
  const box = chatEl('chatReplyText')
  if (!box || box.disabled) return
  const current = box.value.trim()
  box.value = current ? `${current}\n${text}` : text
  box.focus()
  window.onChatReplyInput()
}

window.backToChatList = function() {
  chatState.mobileThreadVisible = false
  chatState.mobileAttachOpen = false
  closeChatMobileContext()
  syncChatMobileShell()
  renderChatConversations()
}

window.openChatMobileContext = function(tab = 'orders') {
  if (!chatState.activeConversation) return
  if (tab === 'products') {
    window.openChatProductModal()
    return
  }
  chatState.activeSideTab = chatNormalizeContextTab(tab)
  renderChatSetup(chatState.setupData || {})
  document.body.classList.add('chat-mobile-context-open')
}

window.closeChatMobileContext = closeChatMobileContext

window.toggleChatMobileAttachments = function() {
  if (!chatState.activeId) return
  chatState.mobileAttachOpen = !chatState.mobileAttachOpen
  syncChatMobileShell()
}

window.focusChatReply = function() {
  chatEl('chatReplyText')?.focus()
}

function ensureChatQuickReplyModal() {
  let modal = chatEl('chatQuickReplyModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'chatQuickReplyModal'

  modal.className = 'chat-quick-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="chat-quick-backdrop" onclick="closeChatQuickReplyModal()"></div>
    <section class="chat-quick-dialog" role="dialog" aria-modal="true" aria-labelledby="chatQuickReplyTitle">
      <div class="chat-quick-head">
        <div>
          <strong id="chatQuickReplyTitle">Trả lời nhanh</strong>
          <small>Chọn câu để chèn vào ô trả lời hoặc chỉnh danh sách câu mẫu.</small>
        </div>
        <button type="button" class="chat-quick-close" onclick="closeChatQuickReplyModal()" aria-label="Đóng">×</button>
      </div>
      <div class="chat-quick-body">
        <div id="chatQuickReplyList" class="chat-quick-list"></div>
        <label class="chat-field-label" for="chatQuickReplyEditor">Cài câu trả lời nhanh</label>
        <textarea id="chatQuickReplyEditor" class="chat-settings-textarea" rows="8" placeholder="Mỗi câu cách nhau bằng một dòng trống."></textarea>
        <div id="chatQuickReplyStatus" class="chat-settings-note">Mỗi câu cách nhau bằng một dòng trống. Khi cần dùng, bấm Chèn.</div>
      </div>
      <div class="chat-quick-actions">
        <button type="button" class="chat-settings-save secondary" onclick="closeChatQuickReplyModal()">Đóng</button>
        <button type="button" class="chat-settings-save" id="chatQuickReplySaveBtn" onclick="saveChatQuickReplies()">Lưu câu mẫu</button>
      </div>
    </section>
  `
  document.body.appendChild(modal)
  return modal
}

function renderChatQuickReplyModal() {
  const replies = chatQuickReplies()
  const list = chatEl('chatQuickReplyList')
  const editor = chatEl('chatQuickReplyEditor')
  if (editor) editor.value = replies.map(item => item.content).join('\n\n')
  if (!list) return
  list.innerHTML = replies.length
    ? replies.map((item, index) => `
      <div class="chat-quick-item">
        <button type="button" onclick="insertChatQuickReply(${index})">
          <span>${chatEscape(chatShortText(item.title || item.content, 48))}</span>
          <small>${chatEscape(chatShortText(item.content, 120))}</small>
        </button>
      </div>
    `).join('')
    : '<div class="chat-empty">Chưa có câu trả lời nhanh. Nhập câu mẫu bên dưới rồi bấm Lưu.</div>'
}

window.openChatQuickReplyModal = function() {
  const modal = ensureChatQuickReplyModal()
  renderChatQuickReplyModal()
  modal.hidden = false
  document.body.classList.add('chat-quick-modal-open')
}

window.closeChatQuickReplyModal = function() {
  const modal = chatEl('chatQuickReplyModal')
  if (modal) modal.hidden = true
  document.body.classList.remove('chat-quick-modal-open')
}

window.insertChatQuickReply = function(index) {
  if (index === undefined || index === null || index === '') {
    window.openChatQuickReplyModal()
    return
  }
  const reply = chatQuickReplies()[Number(index)]
  if (!reply?.content) return
  appendChatReplyText(reply.content)
  window.closeChatQuickReplyModal()
}

window.saveChatQuickReplies = async function() {
  const btn = chatEl('chatQuickReplySaveBtn')
  const status = chatEl('chatQuickReplyStatus')
  const oldText = btn?.textContent || ''
  const replies = normalizeChatQuickReplies(parseQuickReplyEditor(chatEl('chatQuickReplyEditor')?.value || ''))
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang lưu...'
  }
  if (status) status.textContent = ''
  try {
    await persistChatSettingsPatch({ quick_replies: replies })
    renderChatQuickReplyModal()
    const savedStatus = chatEl('chatQuickReplyStatus')
    if (savedStatus) savedStatus.textContent = `Đã lưu ${replies.length.toLocaleString('vi-VN')} câu trả lời nhanh.`
  } catch (error) {
    if (status) status.textContent = `Không lưu được: ${chatErrorMessage(error)}`
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Lưu câu mẫu'
    }
  }
}
