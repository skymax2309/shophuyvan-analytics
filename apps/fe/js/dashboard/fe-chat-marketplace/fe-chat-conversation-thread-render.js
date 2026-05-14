// NEO: Frontend chat sàn - nhóm conversation-thread-render. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function renderChatConversations() {
  const list = chatEl('chatConversationList')
  const summary = chatEl('chatSummary')
  if (!list) return

  const unread = chatState.conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0)
  if (summary) summary.textContent = `${chatState.conversations.length.toLocaleString('vi-VN')} hội thoại · ${unread.toLocaleString('vi-VN')} chưa đọc`

  if (!chatState.conversations.length) {
    const syncStatus = chatState.lastApiSyncStatus
      ? `<div class="chat-empty-sync">${chatEscape(chatState.lastApiSyncStatus)}</div>`
      : ''
    list.innerHTML = `<div class="chat-empty">Chưa có hội thoại thật có nội dung. Các webhook test của sàn đã được ẩn để tránh nhầm với khách thật. Bấm “Đồng bộ nội dung API” để OMS thử kéo nội dung chat từ shop đã kết nối API.${syncStatus}</div>`
    chatState.activeConversation = null
    chatState.context = null
    renderChatThread(null, [])
    renderChatSetup(chatState.setupData || {})
    return
  }

  list.innerHTML = chatState.conversations.map(item => {
    const notice = isChatNotice(item.last_message)
    const hiddenNoise = chatIsSystemDisplayNoise({ platform: item.platform, content: item.last_message }, item)
    const platformLabel = chatPlatformLabel(item.platform)
    const hiddenPreview = String(item.platform || '').trim().toLowerCase() === 'shopee'
      ? 'Tin hệ thống Shopee đã ẩn; OMS chỉ giữ tin chat thật để CSKH theo dõi.'
      : 'Tin hệ thống TikTok đã ẩn; xem panel Đơn hàng.'
    const preview = hiddenNoise ? hiddenPreview : (item.last_message || 'Chưa có nội dung')
    const active = Number(item.id) === Number(chatState.activeId) ? 'active' : ''
    const customerName = chatDisplayCustomerName(item)
    const unreadBadge = Number(item.unread_count || 0)
      ? `<span class="chat-pill unread">${Number(item.unread_count).toLocaleString('vi-VN')} mới</span>`
      : ''
    return `
      <button class="chat-conversation ${active}" onclick="openChatConversation(${Number(item.id)})">
        <div class="chat-conversation-main">
          <div class="chat-conversation-name">${chatEscape(customerName)}</div>
          <div class="chat-conversation-time">${chatEscape(chatTime(item.last_message_at || item.updated_at))}</div>
        </div>
        <div class="chat-conversation-meta">${chatEscape(platformLabel)} · ${chatEscape(item.shop || item.shop_id || 'Chưa rõ shop')}</div>
        <div class="chat-conversation-preview ${notice || hiddenNoise ? 'notice' : ''}">${chatEscape(preview)}</div>
        <div class="chat-badges">
          <span class="chat-pill ${chatEscape(String(item.platform || '').toLowerCase())}">${chatEscape(platformLabel)}</span>
          ${unreadBadge}
          ${notice ? '<span class="chat-pill notice">Chưa có text</span>' : ''}
        </div>
      </button>
    `
  }).join('')
}

function renderChatThread(conversation, messages) {
  const header = chatEl('chatThreadHeader')
  const box = chatEl('chatMessages')
  if (!header || !box) return

  if (!conversation) {
    setChatReplyEnabled(false)
    chatState.context = null
    chatState.mobileThreadVisible = false
    chatState.mobileAttachOpen = false
    closeChatMobileContext()
    syncChatMobileShell()
    header.innerHTML = `
      <div>
        <strong>Chọn một cuộc trò chuyện</strong>
        <small>Nội dung tin nhắn sẽ hiện ở đây.</small>
      </div>
    `
    box.innerHTML = '<div class="chat-empty">Chưa chọn hội thoại.</div>'
    return
  }

  setChatReplyEnabled(true)
  const displayCustomerName = chatDisplayCustomerName(conversation, messages)
  const capabilities = chatResolveConversationCapabilities(conversation)
  const capabilitySummary = capabilities?.summary || ''
  const docsLabel = capabilities?.docs_state_label || ''
  const orderSyncActionHtml = renderChatOrderSyncHeaderAction(conversation, chatState.context || {})
  header.innerHTML = `
    <button class="chat-mobile-back" type="button" onclick="backToChatList()" aria-label="Quay lại">‹</button>
    <div class="chat-thread-title">
      <strong>${chatEscape(displayCustomerName)}</strong>
      <small>${chatEscape(chatPlatformLabel(conversation.platform))} · ${chatEscape(conversation.shop || conversation.shop_id || 'Chưa rõ shop')} · ${chatEscape(conversation.conversation_id)}</small>
      ${capabilitySummary ? `<small class="chat-thread-note">${chatEscape(capabilitySummary)}</small>` : ''}
    </div>
    <div class="chat-thread-badges">
      <span class="chat-pill ${chatEscape(String(conversation.platform || '').toLowerCase())}">${chatEscape(chatPlatformLabel(conversation.platform))}</span>
      ${docsLabel ? `<span class="chat-pill muted">${chatEscape(docsLabel)}</span>` : ''}
    </div>
    <div class="chat-thread-controls">
      ${orderSyncActionHtml}
      <div class="chat-thread-actions" aria-label="Thông tin nhanh">
        <button type="button" onclick="openChatMobileContext('orders')" aria-label="Đơn hàng">ĐH</button>
        <button type="button" onclick="openChatMobileContext('rules')" aria-label="Luật AI">AI</button>
      </div>
    </div>
  `

  const visibleMessages = (messages || [])
    .map((msg, originalIndex) => ({ msg, originalIndex }))
    .filter(item => chatMessageHasVisibleContent(item.msg, conversation))

  if (!visibleMessages.length) {
    box.innerHTML = '<div class="chat-empty">Hội thoại này hiện chỉ có tin hệ thống sàn hoặc placeholder đã bị ẩn. OMS chỉ hiển thị tin chat thật để đội CSKH kiểm tra lại nội dung đã trao đổi với khách.</div>'
    return
  }

  box.innerHTML = visibleMessages.map(({ msg, originalIndex }) => {
    const notice = msg.message_type === 'notice' || isChatNotice(msg.content)
    const sender = chatMessageSenderInfo(msg, conversation)
    const side = sender.side
    const mediaHtml = renderChatMediaItems(msg.media_items, { hideOrders: true })
    const textHtml = msg.content ? `<div class="chat-message-text">${renderChatLinkedText(msg.content || '')}</div>` : ''
    const deliveryHtml = msg.delivery_status ? `<div class="chat-delivery ${chatEscape(String(msg.delivery_status || '').toLowerCase())}">${chatEscape(msg.delivery_status === 'saved_to_oms' ? 'Đã lưu trong OMS, chờ nối API gửi media của sàn' : msg.delivery_status)}</div>` : ''
    const knowledgeActionHtml = side === 'shop' && msg.content && !notice
      ? `<div class="chat-message-actions"><button type="button" onclick="openChatKnowledgeModal(${originalIndex})">Lưu mẫu AI</button></div>`
      : ''
    return `
      <div class="chat-message ${side} ${notice ? 'notice' : ''}">
        <div class="chat-message-label">
          <span>${chatEscape(sender.role)}</span>
          <b>${chatEscape(sender.name)}</b>
          <time>${chatEscape(chatTime(msg.sent_at || msg.created_at))}</time>
        </div>
        <div class="chat-message-bubble">${textHtml}${mediaHtml}${deliveryHtml}${knowledgeActionHtml}</div>
      </div>
    `
  }).join('')
  box.scrollTop = box.scrollHeight
}

async function ensureChatSetupSnapshot(options = {}) {
  const existingShops = Array.isArray(chatState.shops) ? chatState.shops : []
  const existingSetup = chatState.setupData?.setup || {}
  if (!options.force && existingShops.length && Object.keys(existingSetup).length) {
    return chatState.setupData || { shops: existingShops, setup: existingSetup }
  }
  const data = await chatFetch('/api/chat/shops', {
    timeoutMs: options.timeoutMs || 12000
  })
  chatState.shops = Array.isArray(data.shops) ? data.shops : []
  populateChatShopOptions()
  chatState.setupData = {
    ...(chatState.setupData || {}),
    ...data,
    shops: Array.isArray(data.shops) ? data.shops : existingShops,
    setup: data.setup || existingSetup || {}
  }
  return chatState.setupData
}

function setChatReplyEnabled(enabled) {
  ensureChatMediaControls()
  const text = chatEl('chatReplyText')
  const guardBtn = chatEl('chatGuardBtn')
  const sendBtn = chatEl('chatSendBtn')
  const aiBtn = chatEl('chatAiBtn')
  const mediaInput = chatEl('chatMediaInput')
  const cameraInput = chatEl('chatCameraInput')
  const mediaPick = chatEl('chatMediaPickBtn')
  const attachGrid = document.querySelector('.chat-mobile-attach-grid')
  const settings = currentChatSettings()
  if (text) {
    text.disabled = !enabled
    if (!enabled) text.value = ''
  }
  if (mediaInput) mediaInput.disabled = !enabled
  if (cameraInput) cameraInput.disabled = !enabled
  if (mediaPick) mediaPick.classList.toggle('disabled', !enabled)
  if (attachGrid) attachGrid.classList.toggle('disabled', !enabled)
  if (guardBtn) guardBtn.disabled = !enabled
  if (sendBtn) sendBtn.disabled = !enabled
  if (aiBtn) aiBtn.disabled = !enabled || !Number(settings.ai_enabled)
  if (!enabled) clearChatPendingMedia()
  updateChatMediaApiStatus()
  setChatGuardStatus(enabled
    ? 'Nhập nội dung để kiểm tra từ khóa trước khi gửi.'
    : 'Chọn hội thoại để soạn trả lời.', 'muted')
}

function chatMediaApiStatusText() {
  if (!chatState.activeConversation) return 'Ảnh/video API: chọn hội thoại để gửi.'
  if (chatState.pendingMedia.length) return `Đã chọn ${chatState.pendingMedia.length} file, bấm Gửi để thử đưa lên sàn.`
  return 'Ảnh/video API: thử gửi qua API, lỗi vẫn lưu OMS.'
}

function updateChatMediaApiStatus() {
  const status = chatEl('chatMediaApiStatus')
  if (!status) return
  const enabled = Boolean(chatState.activeConversation)
  status.classList.toggle('disabled', !enabled)
  status.classList.toggle('active', enabled && chatState.pendingMedia.length > 0)
  status.textContent = chatMediaApiStatusText()
}

function setChatGuardStatus(message, tone = 'muted') {
  const status = chatEl('chatReplyGuardStatus')
  if (!status) return
  status.className = `chat-guard-status ${tone}`
  status.textContent = message
}

function ensureChatMediaControls() {
  const replyBox = document.querySelector('.chat-reply-box')
  if (!replyBox) return
  let actions = replyBox.querySelector('.chat-reply-actions')
  if (!actions) {
    actions = document.createElement('div')
    actions.className = 'chat-reply-actions'
    replyBox.appendChild(actions)
  }
  let preview = chatEl('chatMediaPreview')
  if (!preview) {
    preview = document.createElement('div')
    preview.id = 'chatMediaPreview'
    preview.className = 'chat-media-preview'
    preview.hidden = true
    const guard = chatEl('chatReplyGuardStatus')
    replyBox.insertBefore(preview, guard || actions)
  }
  let mediaStatus = chatEl('chatMediaApiStatus')
  if (!mediaStatus) {
    mediaStatus = document.createElement('div')
    mediaStatus.id = 'chatMediaApiStatus'
    mediaStatus.className = 'chat-media-api-status disabled'
    // Dòng trạng thái ngắn giúp CSKH biết media đang đi qua API, nhất là trên mobile nơi guard bị nén.
    mediaStatus.textContent = 'Ảnh/video API: chọn hội thoại để gửi.'
    replyBox.insertBefore(mediaStatus, preview)
  }
  let input = chatEl('chatMediaInput')
  if (!input) {
    input = document.createElement('input')
    input.id = 'chatMediaInput'
    input.className = 'chat-hidden-file'
    input.type = 'file'
    input.accept = 'image/*,video/*'
    input.multiple = true
    input.disabled = true
    input.onchange = event => window.onChatMediaSelected(event)
  }
  let pick = chatEl('chatMediaPickBtn')
  if (!pick) {
    pick = document.createElement('label')
    pick.id = 'chatMediaPickBtn'
    pick.className = 'chat-media-pick disabled'
    pick.htmlFor = 'chatMediaInput'
    pick.textContent = 'Ảnh/video API'
  } else {
    pick.textContent = 'Ảnh/video API'
  }
  if (pick.parentElement !== actions) actions.insertBefore(pick, actions.firstChild)
  if (input.parentElement !== actions) actions.insertBefore(input, pick.nextSibling)
  let cameraInput = chatEl('chatCameraInput')
  if (!cameraInput) {
    cameraInput = document.createElement('input')
    cameraInput.id = 'chatCameraInput'
    cameraInput.className = 'chat-hidden-file'
    cameraInput.type = 'file'
    cameraInput.accept = 'image/*,video/*'
    cameraInput.setAttribute('capture', 'environment')
    cameraInput.disabled = true
    cameraInput.onchange = event => window.onChatMediaSelected(event)
  }
  if (cameraInput.parentElement !== actions) actions.insertBefore(cameraInput, input.nextSibling)
}

function renderChatPendingMedia() {
  ensureChatMediaControls()
  const box = chatEl('chatMediaPreview')
  if (!box) return
  if (!chatState.pendingMedia.length) {
    box.innerHTML = ''
    box.hidden = true
    updateChatMediaApiStatus()
    return
  }
  box.hidden = false
  box.innerHTML = chatState.pendingMedia.map(item => {
    const size = chatFormatBytes(item.size)
    const label = `${item.name}${size ? ` · ${size}` : ''}`
    const thumb = item.type === 'video'
      ? `<video class="chat-media-preview-thumb" src="${chatEscape(item.preview_url)}" muted playsinline preload="metadata"></video>`
      : `<img class="chat-media-preview-thumb" src="${chatEscape(item.preview_url)}" alt="${chatEscape(item.name)}">`
    return `
      <div class="chat-media-preview-item">
        ${thumb}
        <span>${chatEscape(label)}</span>
        <button type="button" class="chat-media-remove" aria-label="Bỏ file" onclick="removeChatMedia('${chatEscape(item.id)}')">×</button>
      </div>
    `
  }).join('')
}

function clearChatPendingMedia() {

  for (const item of chatState.pendingMedia) {
    if (item.preview_url) URL.revokeObjectURL(item.preview_url)
  }
  chatState.pendingMedia = []
  renderChatPendingMedia()
  updateChatMediaApiStatus()
}

function collectChatSettings() {
  const current = currentChatSettings()
  return {
    moderation_enabled: chatEl('chatModerationEnabled') ? (chatEl('chatModerationEnabled').checked ? 1 : 0) : Number(current.moderation_enabled || 0),
    blocked_keywords: chatEl('chatBlockedKeywords')
      ? (chatEl('chatBlockedKeywords').value || '').split(/[\n,;]/).map(item => item.trim()).filter(Boolean)
      : (current.blocked_keywords || []),
    ai_enabled: chatEl('chatAiEnabled') ? (chatEl('chatAiEnabled').checked ? 1 : 0) : Number(current.ai_enabled || 0),
    ai_provider: chatEl('chatAiProvider')?.value || current.ai_provider || 'gemini',
    ai_model: chatEl('chatAiModel')?.value?.trim() || current.ai_model || 'gemini-2.5-flash',
    ai_tone: chatEl('chatAiTone')?.value?.trim() || current.ai_tone || '',
    ai_rules: mergeRequiredChatAiRules(chatEl('chatAiRules')?.value?.trim() || current.ai_rules || ''),
    ai_guard_mode: chatEl('chatAiGuardMode')?.value || current.ai_guard_mode || 'strict',
    ai_forbidden_patterns: chatEl('chatAiForbiddenPatterns')
      ? mergeRequiredChatAiForbiddenPatterns(chatEl('chatAiForbiddenPatterns').value)
      : mergeRequiredChatAiForbiddenPatterns(current.ai_forbidden_patterns),
    ai_review_triggers: chatEl('chatAiReviewTriggers')
      ? chatRuleLines(chatEl('chatAiReviewTriggers').value)
      : chatRuleLines(current.ai_review_triggers),
    ai_require_review: chatEl('chatAiRequireReview') ? (chatEl('chatAiRequireReview').checked ? 1 : 0) : Number(current.ai_require_review || 0),
    ai_auto_reply_mode: chatEl('chatAiAutoReplyMode')?.value || current.ai_auto_reply_mode || 'off',
    ai_auto_reply_platforms: [
      chatEl('chatAiAutoReplyShopee')?.checked ? 'shopee' : '',
      chatEl('chatAiAutoReplyLazada')?.checked ? 'lazada' : ''
    ].filter(Boolean),
    ai_auto_reply_shops: chatEl('chatAiAutoReplyShops')
      ? chatRuleLines(chatEl('chatAiAutoReplyShops').value).map(item => item.toLowerCase())
      : chatRuleLines(current.ai_auto_reply_shops).map(item => item.toLowerCase()),
    ai_auto_reply_limit: chatEl('chatAiAutoReplyLimit')
      ? Math.min(Math.max(chatNumber(chatEl('chatAiAutoReplyLimit').value, 3), 1), 10)
      : Math.min(Math.max(chatNumber(current.ai_auto_reply_limit, 3), 1), 10),
    ai_auto_reply_hold_seconds: chatEl('chatAiAutoReplyHoldSeconds')
      ? Math.min(Math.max(chatNumber(chatEl('chatAiAutoReplyHoldSeconds').value, 20), 0), 600)
      : Math.min(Math.max(chatNumber(current.ai_auto_reply_hold_seconds, 20), 0), 600),
    ai_auto_reply_max_age_hours: chatEl('chatAiAutoReplyMaxAgeHours')
      ? Math.min(Math.max(chatNumber(chatEl('chatAiAutoReplyMaxAgeHours').value, 2), 1), 168)
      : Math.min(Math.max(chatNumber(current.ai_auto_reply_max_age_hours, 2), 1), 168),
    ai_auto_reply_handoff_enabled: chatEl('chatAiAutoReplyHandoff') ? (chatEl('chatAiAutoReplyHandoff').checked ? 1 : 0) : Number(current.ai_auto_reply_handoff_enabled ?? 1),
    quick_replies: normalizeChatQuickReplies(current.quick_replies || []),
    notify_enabled: chatEl('chatNotifyEnabled') ? (chatEl('chatNotifyEnabled').checked ? 1 : 0) : Number(current.notify_enabled || 0),
    notify_preview_enabled: chatEl('chatNotifyPreviewEnabled') ? (chatEl('chatNotifyPreviewEnabled').checked ? 1 : 0) : Number(current.notify_preview_enabled || 0),
    notify_sound_enabled: chatEl('chatNotifySoundEnabled') ? (chatEl('chatNotifySoundEnabled').checked ? 1 : 0) : Number(current.notify_sound_enabled || 0),
    notify_poll_seconds: chatEl('chatNotifyPollSeconds')
      ? Math.min(Math.max(chatNumber(chatEl('chatNotifyPollSeconds').value, 8), 5), 60)
      : Math.min(Math.max(chatNumber(current.notify_poll_seconds, 8), 5), 60)
  }
}

async function loadChatSettings() {
  try {
    const data = await chatFetch('/api/chat/settings')
    chatState.settings = {
      ...chatSettingsDefaults(),
      ...(data.settings || {}),
      ai_rules: mergeRequiredChatAiRules(data.settings?.ai_rules || chatSettingsDefaults().ai_rules),
      ai_forbidden_patterns: mergeRequiredChatAiForbiddenPatterns(data.settings?.ai_forbidden_patterns || chatSettingsDefaults().ai_forbidden_patterns)
    }
  } catch (error) {
    chatState.settings = chatSettingsDefaults()
  }
}
