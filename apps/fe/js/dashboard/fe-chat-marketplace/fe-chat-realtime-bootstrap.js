// NEO: Frontend chat sàn - nhóm realtime-bootstrap. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
async function autoSyncChatApiContent(options = {}) {
  if (chatState.apiSyncing) return { skipped: true, reason: 'syncing' }
  const seconds = Math.min(Math.max(chatNumber(currentChatSettings().notify_poll_seconds, 5), 5), 60)
  const minInterval = (options.activeOnly ? Math.max(18, seconds * 3) : Math.max(60, seconds * 6)) * 1000
  if (!options.force && Date.now() - Number(chatState.lastApiSyncAt || 0) < minInterval) {
    return { skipped: true, reason: 'throttled' }
  }
  chatState.apiSyncing = true
  try {
    const active = options.activeOnly ? chatState.activeConversation : null
    const platform = active?.platform || chatEl('chatPlatform')?.value || ''
    const shop = active?.shop_id || active?.shop || chatEl('chatShop')?.value || ''
    const payload = {
      platform,
      shop,
      limit: options.limit || 20
    }
    if (active?.conversation_id || chatState.activeConversation?.conversation_id) {
      payload.conversation_id = active?.conversation_id || chatState.activeConversation.conversation_id
    }
    if (options.activeOnly && payload.conversation_id) {
      payload.active_only = true
      payload.limit = Math.min(Number(payload.limit || 5) || 5, 10)
    }
    const result = await chatFetch('/api/chat/api-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: options.activeOnly ? 8000 : 16000
    })
    chatState.lastApiSyncAt = Date.now()
    const pulled = Number(result.pulled_messages || 0)
    chatState.lastApiSyncStatus = pulled
      ? `Đã tự kéo ${pulled} tin mới từ API.`
      : 'API chat đã kiểm tra, chưa có tin mới.'
    if (pulled && !options.quiet) {
      setChatGuardStatus(chatState.lastApiSyncStatus, 'ok')
    }
    return result
  } catch (error) {
    const message = chatErrorMessage(error, 'Không rõ lỗi từ server chat.')
    chatState.lastApiSyncAt = Date.now()
    chatState.lastApiSyncStatus = `Realtime chat API lỗi: ${message}`
    if (!options.quiet) console.warn('[CHAT_REALTIME_SYNC]', error)
    return { error: message, pulled_messages: 0 }
  } finally {
    chatState.apiSyncing = false
  }
}

async function autoSyncChatAutomationContent(options = {}) {
  if (!chatState.autoAutomationEnabled) return { skipped: true, reason: 'disabled', saved_messages: 0 }
  if (chatState.automationSyncing) return { skipped: true, reason: 'syncing', saved_messages: 0 }
  // Automation là luồng có thể mở Chrome nên dùng chu kỳ phút riêng, không dùng polling API theo giây.
  if (!chatState.nextAutomationSyncAt) chatScheduleNextAutomationRun(Date.now())
  if (!options.force && Date.now() < Number(chatState.nextAutomationSyncAt || 0)) {
    return { skipped: true, reason: 'throttled', saved_messages: 0 }
  }
  const result = await window.syncChatAutomationContent({
    quiet: options.quiet !== false,
    active: false,
    force: options.force === true,
    limit: options.limit || 5
  })
  chatScheduleNextAutomationRun(Date.now())
  return result
}

async function refreshChatRealtime(options = {}) {
  if (!chatState.loaded && !options.force) return
  const apiResult = await autoSyncChatApiContent({
    quiet: true,
    limit: chatState.activeConversation?.conversation_id ? 5 : 20,
    force: options.force === true,
    activeOnly: Boolean(chatState.activeConversation?.conversation_id)
  })
  const automationResult = await autoSyncChatAutomationContent({
    quiet: true,
    limit: chatState.activeConversation?.conversation_id ? 3 : 5,
    force: options.force === true
  })
  const changed = Number(apiResult?.pulled_messages || 0) + Number(automationResult?.saved_messages || 0)
  const shouldReloadActive = Boolean(chatState.activeId && chatState.activeConversation)
  if (automationResult?.error && options.force) {
    setChatGuardStatus(`Tự động chat fallback chưa chạy được: ${chatErrorMessage(automationResult)}. Kiểm tra helper local nếu shop không có API.`, 'blocked')
  }
  await window.loadChatConversations({
    fromPoll: true,
    silent: !changed,
    skipApiSync: true,
    reloadActive: changed > 0 || shouldReloadActive
  })
}

async function loadChatDashboard(skipAutoOpen = false) {
  if (!chatState.pendingOrderJump) chatState.pendingOrderJump = chatConsumePendingOrderJump()
  applyPendingOrderJumpFilters()
  // Tải settings và capability song song để giảm thời gian chờ trang chat khi mở lần đầu.
  // Settings vẫn tải đầu tiên vì polling và guard phụ thuộc vào đó,
  // còn capability shop chuyển sang tải nền để không khóa danh sách hội thoại.
  loadChatShopsInBackground().catch(() => null)
  await loadChatSettings()
  if (!skipAutoOpen) chatState.activeId = chatState.activeId || null
  await window.loadChatConversations({ silent: !chatState.loaded || skipAutoOpen })
  await handlePendingOrderChatJump()
  loadChatNotificationStatus().catch(() => null)
  registerChatServiceWorker().catch(() => null)
  syncChatAutoAutomationButton()
  chatState.loaded = true
  startChatPolling()
  setTimeout(() => {
    autoSyncChatApiContent({ force: true, quiet: true, limit: 5 })
      .then(result => {
        return window.loadChatConversations({
          fromPoll: true,
          silent: Number(result?.pulled_messages || 0) <= 0,
          skipApiSync: true,
          reloadActive: true
        })
      })
      .catch(() => null)
  }, 2500)
  setTimeout(() => {
    if (!chatState.autoAutomationEnabled) return
    autoSyncChatAutomationContent({ force: true, quiet: true, limit: 3 })
      .then(result => {
        if (Number(result?.saved_messages || 0) > 0) {
          return window.loadChatConversations({ fromPoll: true, silent: false, skipApiSync: true, reloadActive: true })
        }
        return null
      })
      .catch(error => setChatGuardStatus(`Chưa chạy được tự động chat cho shop không API: ${chatErrorMessage(error)}`, 'blocked'))
  }, 6500)
}

function startChatPolling() {
  if (chatState.polling) return
  const seconds = Math.min(Math.max(chatNumber(currentChatSettings().notify_poll_seconds, 8), 5), 60)
  chatState.polling = setInterval(() => {
    if (!chatState.loaded) return
    refreshChatRealtime().catch(() => null)
  }, seconds * 1000)
}

function restartChatPolling() {
  if (chatState.polling) {
    clearInterval(chatState.polling)
    chatState.polling = null
  }
  startChatPolling()
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data || {}
    if (data.type !== 'open-chat') return
    // Hỗ trợ cả dashboard cũ (#chat) và trang chat sàn tách riêng.
    if (typeof showTab === 'function') {
      showTab('chat')
    } else if (!String(window.location.pathname || '').endsWith('/chat-marketplace.html')) {
      window.location.href = '/pages/chat-marketplace.html'
      return
    }
    if (data.id) {
      openChatConversation(data.id).catch(() => null)
    } else {
      loadChatDashboard(true).catch(() => null)
    }
  })
}

window.addEventListener('resize', () => {
  if (!isChatMobileView()) closeChatMobileContext()
  syncChatMobileShell()
})

window.addEventListener('focus', () => {
  if (!chatState.loaded) return
  refreshChatRealtime({ force: true }).catch(() => null)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !chatState.loaded) return
  refreshChatRealtime({ force: true }).catch(() => null)
})

window.loadChat = loadChatDashboard
