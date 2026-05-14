// NEO: Frontend chat sàn - nhóm context-media-guard-send. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
async function loadChatConversationContext(id) {
  const requestId = ++chatState.contextRequestSeq
  const controller = makeChatAbort('contextAbort')
  chatState.context = null
  renderChatSetup(chatState.setupData || {})
  try {
    const data = await chatFetch(`/api/chat/context?id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
      timeoutMs: 12000
    })
    if (requestId !== chatState.contextRequestSeq || Number(chatState.activeId) !== Number(id)) return
    chatState.context = data.context || { orders: [], soft_orders: [], products: [], vouchers: [], notes: [] }
  } catch (error) {
    if (error?.isSuperseded) return
    chatState.context = { orders: [], soft_orders: [], products: [], vouchers: [], notes: [`Không tải được ngữ cảnh chat: ${chatErrorMessage(error)}`] }
  } finally {
    clearChatAbort('contextAbort', controller)
  }
  renderChatSetup(chatState.setupData || {})
  if (chatState.activeConversation) renderChatThread(chatState.activeConversation, chatState.messages || [])
  const productModal = chatEl('chatProductModal')
  if (productModal && !productModal.hidden) renderChatProductModal()
  if (chatState.activeConversation && Number(chatState.activeId) === Number(id)) {
    maybeAutoSyncChatOrders(chatState.context || {}).catch(() => null)
  }
}

function renderGuardResult(data) {
  if (!data) return
  if (data.allowed) {
    const warnings = (data.warnings || []).filter(Boolean).join(' ')
    setChatGuardStatus(`${data.reason || 'Nội dung qua kiểm duyệt.'}${warnings ? ` ${warnings}` : ''}`, data.needs_review ? 'muted' : 'ok')
    return
  }
  setChatGuardStatus(data.reason || 'Nội dung bị chặn, chưa thể gửi.', 'blocked')
}

window.onChatMediaSelected = function(event) {
  const files = Array.from(event?.target?.files || [])
  const accepted = []
  const rejected = []
  for (const file of files) {
    const mime = String(file.type || '').toLowerCase()
    const name = String(file.name || '')
    const isImage = mime.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|gif|webp)$/i.test(name)
    const isVideo = mime.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(name)
    const type = isVideo ? 'video' : isImage ? 'image' : ''
    const maxBytes = type === 'video' ? 80 * 1024 * 1024 : 15 * 1024 * 1024
    if (!type) {
      rejected.push(`${name || 'file'}: chỉ nhận ảnh hoặc video`)
      continue
    }
    if (file.size > maxBytes) {
      rejected.push(`${name || 'file'}: vượt ${type === 'video' ? '80MB' : '15MB'}`)
      continue
    }
    accepted.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: name || (type === 'video' ? 'video' : 'image'),
      size: file.size,
      type,
      mime_type: file.type || '',
      preview_url: URL.createObjectURL(file)
    })
  }
  const nextMedia = [...chatState.pendingMedia, ...accepted]
  const keptMedia = nextMedia.slice(0, 6)
  nextMedia.slice(6).forEach(item => {
    if (item.preview_url) URL.revokeObjectURL(item.preview_url)
  })
  chatState.pendingMedia = keptMedia
  renderChatPendingMedia()
  updateChatMediaApiStatus()
  if (event?.target) event.target.value = ''
  if (rejected.length) setChatGuardStatus(rejected.join('. '), 'blocked')
  else if (chatState.pendingMedia.length) setChatGuardStatus(`Đã chọn ${chatState.pendingMedia.length} ảnh/video, hệ thống sẽ thử gửi lên sàn qua API.`, 'muted')
}

window.removeChatMedia = function(id) {
  const item = chatState.pendingMedia.find(media => media.id === id)
  if (item?.preview_url) URL.revokeObjectURL(item.preview_url)
  chatState.pendingMedia = chatState.pendingMedia.filter(media => media.id !== id)
  renderChatPendingMedia()
  window.onChatReplyInput()
}

window.validateChatReplyContent = async function(options = {}) {
  let text = chatEl('chatReplyText')?.value?.trim() || ''
  if (!text) {
    if (chatState.pendingMedia.length) {
      setChatGuardStatus(`Đã chọn ${chatState.pendingMedia.length} ảnh/video. Có thể gửi riêng; hệ thống vẫn lưu OMS để đối chiếu nếu sàn từ chối media.`, 'muted')
      return { allowed: true, media_only: true }
    }
    setChatGuardStatus('Bạn chưa nhập nội dung trả lời hoặc chọn ảnh/video.', 'blocked')
    return { allowed: false }
  }
  if (!options.quiet) setChatGuardStatus('Đang kiểm tra nội dung...', 'muted')
  try {
    const data = await chatFetch('/api/chat/guard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text,
        platform: chatState.activeConversation?.platform || '',
        shop: chatState.activeConversation?.shop || '',
        conversation_id: chatState.activeConversation?.conversation_id || ''
      })
    })
    renderGuardResult(data)
    if (data.sanitized_changed && data.sanitized_content && chatEl('chatReplyText')) {
      chatEl('chatReplyText').value = data.sanitized_content
      setChatGuardStatus('Hệ thống đã tự thay tên sàn cụ thể thành "sàn" trước khi gửi.', data.allowed ? 'ok' : 'blocked')
    }
    return data
  } catch (error) {
    const message = chatErrorMessage(error)
    setChatGuardStatus(`Không kiểm tra được nội dung: ${message}`, 'blocked')
    return { allowed: false, error: message }
  }
}

window.onChatReplyInput = function() {
  clearTimeout(chatState.guardTimer)
  let text = chatEl('chatReplyText')?.value?.trim() || ''
  if (!text && chatState.pendingMedia.length) {
    setChatGuardStatus(`Đã chọn ${chatState.pendingMedia.length} ảnh/video. Có thể gửi kèm hướng dẫn hoặc gửi riêng qua API sàn.`, 'muted')
    return
  }
  setChatGuardStatus('Đang chờ kiểm tra nội dung...', 'muted')
  chatState.guardTimer = setTimeout(() => {
    window.validateChatReplyContent({ quiet: true }).catch(() => null)
  }, 450)
}

window.generateChatAiReply = async function() {
  if (!chatState.activeConversation) {
    alert('Bạn cần chọn một hội thoại trước.')
    return
  }
  const settings = currentChatSettings()
  if (!Number(settings.ai_enabled)) {
    setChatGuardStatus('AI CSKH đang tắt trong Thiết lập chat.', 'blocked')
    return
  }
  const btn = chatEl('chatAiBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'AI đang viết...'
  }
  setChatGuardStatus('AI đang tạo bản nháp an toàn...', 'muted')
  try {
    const data = await chatFetch('/api/chat/ai-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: chatState.activeConversation.id,
        conversation_id: chatState.activeConversation.conversation_id,
        platform: chatState.activeConversation.platform,
        shop: chatState.activeConversation.shop,
        customer_message: chatPreviousCustomerMessage(chatState.messages, chatState.messages.length),
        current_draft: chatEl('chatReplyText')?.value || ''
      }),
      // Cho AI thêm thời gian xoay key Gemini nếu key đầu chậm hoặc timeout.
      timeoutMs: 40000
    })
    if (data.blocked) {
      const reason = data.guard?.reason || 'Bản nháp AI bị chặn bởi bộ lọc.'
      setChatGuardStatus(reason, 'blocked')
      return
    }
    if (chatEl('chatReplyText')) chatEl('chatReplyText').value = data.reply || ''
    if (data.auto_send_allowed && data.reply) {
      const item = data.direct_knowledge || {}
      setChatGuardStatus(`Mẫu AI đã duyệt khớp chắc${item.id ? ` #${item.id}` : ''}, đang gửi luôn qua luồng gửi chính thức.`, 'ok')
      await window.sendChatReply({ skipPreflight: true, source: 'knowledge-template' })
      return
    }
    const review = Number(data.needs_review) ? ' Cần nhân viên duyệt lại trước khi gửi.' : ''
    const knowledgeNote = Array.isArray(data.knowledge_used) && data.knowledge_used.length
      ? ` Đã tham khảo ${data.knowledge_used.length.toLocaleString('vi-VN')} mẫu AI đã duyệt.`
      : ''
    const advisoryNote = Array.isArray(data.advisories_used) && data.advisories_used.length
      ? ` Đã chèn ${data.advisories_used.length.toLocaleString('vi-VN')} lưu ý sản phẩm.`
      : ''
    const providerNote = String(data.provider || '').startsWith('local-fallback')
      ? ' Gemini chưa phản hồi kịp nên hệ thống đang dùng mẫu an toàn nội bộ.'
      : ''
    setChatGuardStatus(`AI đã tạo bản nháp và qua bộ lọc.${providerNote}${knowledgeNote}${advisoryNote}${review}`, String(data.provider || '').startsWith('local-fallback') ? 'muted' : 'ok')
  } catch (error) {
    setChatGuardStatus(`Không tạo được gợi ý AI: ${chatErrorMessage(error)}`, 'blocked')
  } finally {
    if (btn) {
      btn.disabled = !Number(currentChatSettings().ai_enabled)
      btn.textContent = oldText || 'AI gợi ý'
    }
  }
}

window.sendChatReply = async function(options = {}) {
  if (!chatState.activeConversation) {
    alert('Bạn cần chọn một hội thoại trước.')
    return false
  }
  let text = chatEl('chatReplyText')?.value?.trim() || ''
  if (!text && !chatState.pendingMedia.length) {
    setChatGuardStatus('Bạn chưa nhập nội dung hoặc chọn ảnh/video.', 'blocked')
    return false
  }
  if (!options.skipPreflight) {
    const result = await window.validateChatReplyContent({ quiet: true })
    if (!result.allowed) return false
    text = chatEl('chatReplyText')?.value?.trim() || text
  }
  const btn = chatEl('chatSendBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang gửi...'
  }
  setChatGuardStatus('Đang lưu/gửi tin nhắn...', 'muted')
  try {
    const payload = {
      id: chatState.activeConversation.id || '',
      conversation_id: chatState.activeConversation.conversation_id || '',
      platform: chatState.activeConversation.platform || '',
      shop: chatState.activeConversation.shop || '',
      content: text
    }
    if (chatCanUseAutomationSend({ data: { error: 'tiktok_send_not_supported' } }, text, { preflight: true })) {
      setChatGuardStatus('TikTok Shop chưa có endpoint gửi chat chính thức trong OMS, đang gửi text bằng automation local...', 'muted')
      await sendChatReplyByAutomation(text)
      if (chatEl('chatReplyText')) chatEl('chatReplyText').value = ''
      clearChatPendingMedia()
      await openChatConversation(chatState.activeConversation.id, { silent: true })
      setChatGuardStatus('Đã gửi bằng automation local qua TikTok Shop và lưu lại OMS.', 'ok')
      return true
    }
    let data
    let res = { ok: true, status: 200 }
    if (chatState.pendingMedia.length) {
      const form = new FormData()
      Object.entries(payload).forEach(([key, value]) => form.append(key, value))
      chatState.pendingMedia.forEach(item => form.append('files', item.file, item.name))
      res = await fetch(API + '/api/chat/send', {
        method: 'POST',
        body: form,
        cache: 'no-store',
        mode: 'cors'
      })
      data = await res.json().catch(() => ({}))
    } else {
      data = await chatFetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)

      })
    }
    if (!res.ok) throw new Error(chatErrorMessage(data, `Lỗi ${res.status}`))
    if (!data.sent_to_platform && chatCanUseAutomationSend(data, text)) {
      setChatGuardStatus('API chưa xác nhận gửi lên sàn, đang chuyển sang automation local...', 'muted')
      await sendChatReplyByAutomation(text)
      if (chatEl('chatReplyText')) chatEl('chatReplyText').value = ''
      clearChatPendingMedia()
      await openChatConversation(chatState.activeConversation.id, { silent: true })
      setChatGuardStatus(`Đã gửi bằng automation local qua ${chatPlatformLabel(chatState.activeConversation.platform)} và lưu lại OMS.`, 'ok')
      return true
    }
    if (chatEl('chatReplyText')) chatEl('chatReplyText').value = ''
    clearChatPendingMedia()
    await openChatConversation(chatState.activeConversation.id, { silent: true })
    setChatGuardStatus(data.sent_to_platform
      ? 'Đã gửi lên sàn.'
      : (data.note || 'Đã lưu trong OMS, chưa xác nhận gửi lên sàn.'), data.sent_to_platform ? 'ok' : 'muted')
    return true
  } catch (error) {
    if (chatCanUseAutomationSend(error, text)) {
      const fallbackMessage = chatIsShopeeOrderSeedWithoutBuyerId(chatState.activeConversation)
        ? 'API Shopee chưa có buyer_id cho đơn này, đang gửi bằng trình duyệt theo tên khách...'
        : `API chính thức chưa gửi được, đang gửi text bằng automation local qua ${chatPlatformLabel(chatState.activeConversation.platform)}...`
      setChatGuardStatus(fallbackMessage, 'muted')
      try {
        await sendChatReplyByAutomation(text)
        if (chatEl('chatReplyText')) chatEl('chatReplyText').value = ''
        clearChatPendingMedia()
        await openChatConversation(chatState.activeConversation.id, { silent: true })
        setChatGuardStatus(`Đã gửi bằng automation local qua ${chatPlatformLabel(chatState.activeConversation.platform)} và lưu lại OMS.`, 'ok')
        return true
      } catch (automationError) {
        setChatGuardStatus(`Không gửi được bằng API hoặc automation: ${chatErrorMessage(automationError)}`, 'blocked')
        return false
      }
    }
    setChatGuardStatus(`Không gửi được: ${chatErrorMessage(error)}`, 'blocked')
    return false
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Gửi'
    }
  }
}
