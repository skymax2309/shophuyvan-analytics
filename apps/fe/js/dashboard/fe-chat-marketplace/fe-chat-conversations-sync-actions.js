// NEO: Frontend chat sàn - nhóm conversations-sync-actions. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
async function loadChatShops() {
  chatState.setupLoading = true
  chatState.setupError = ''
  renderChatSetup(chatState.setupData || {})
  try {
    // API shop chat có thể dính cold start ở production nên cho tải nền và nới timeout,
    // tránh trường hợp panel cấu hình chặn luôn danh sách hội thoại.
    const data = await chatFetch('/api/chat/shops', { timeoutMs: 22000 })
    chatState.shops = data.shops || []
    chatState.setupData = data
    chatState.setupLoaded = true
    populateChatShopOptions()
    renderChatSetup(data)
    return data
  } catch (error) {
    chatState.setupError = `Chưa tải được trạng thái shop chat: ${chatErrorMessage(error)}`
    renderChatSetup(chatState.setupData || {})
    throw error
  } finally {
    chatState.setupLoading = false
    renderChatSetup(chatState.setupData || {})
  }
}

function loadChatShopsInBackground() {
  if (chatState.setupLoadPromise) return chatState.setupLoadPromise
  let task = null
  // Tải capability shop riêng ở nền để chat list vẫn vào được ngay cả khi endpoint setup bị chậm.
  task = loadChatShops()
    .catch(error => {
      console.warn('[CHAT_SETUP_LOAD]', error)
      return null
    })
    .finally(() => {
      if (chatState.setupLoadPromise === task) chatState.setupLoadPromise = null
    })
  chatState.setupLoadPromise = task
  return task
}

window.loadChatConversations = async function(options = {}) {
  const requestId = ++chatState.conversationRequestSeq
  const controller = makeChatAbort('conversationAbort')
  const list = chatEl('chatConversationList')
  const previousListHtml = list?.innerHTML || ''
  setTimeout(() => {
    if (options.fromPoll && list && previousListHtml) list.innerHTML = previousListHtml
  }, 0)
  if (list && (!options.fromPoll || !chatState.conversations.length)) {
    list.innerHTML = '<div class="chat-empty">Đang tải chat...</div>'
  }
  try {
    populateChatShopOptions()
    const qs = currentChatFilters()
    const data = await chatFetch(`/api/chat/conversations?${qs}`, {
      signal: controller.signal,
      // Lần mở đầu có thể gặp cold start của Worker nên cho dư thời gian hơn polling nền.
      // Lần mở đầu có thể dính cold start Worker nên nới timeout rõ ràng hơn
      // để giảm lỗi giả kiểu "loading mãi rồi báo hỏng" khi dữ liệu vẫn đang về.
      timeoutMs: options.fromPoll ? 9000 : 25000
    })
    if (requestId !== chatState.conversationRequestSeq) return
    chatState.conversations = data.conversations || []
    notifyForNewChatConversations(chatState.conversations, options)
    const mobile = isChatMobileView()
    const activeStillVisible = chatState.conversations.some(item => Number(item.id) === Number(chatState.activeId))
    if (!activeStillVisible) {
      chatState.activeId = null
      chatState.activeConversation = null
      chatState.mobileThreadVisible = false
      chatState.mobileAttachOpen = false
      closeChatMobileContext()
    }
    const holdListForOrderJump = Boolean(chatState.pendingOrderJump && !chatState.pendingOrderJump?.conversation?.id && !chatState.activeId)
    if (!chatState.activeId && chatState.conversations.length && !mobile && !holdListForOrderJump) {
      chatState.activeId = Number(chatState.conversations[0].id)
    }
    renderChatConversations()
    const shouldReloadActive = chatState.activeId
      && (!mobile || chatState.mobileThreadVisible)
      && (!options.fromPoll || options.reloadActive)
    if (shouldReloadActive) {
      await openChatConversation(chatState.activeId, { silent: true })
    } else if (mobile && !chatState.activeId) {
      // Polling mobile chỉ làm mới danh sách; không được render thread rỗng khi CSKH đang đọc hội thoại,
      // nếu không màn hình sẽ tự bật về danh sách sau vài giây.
      renderChatThread(null, [])
    }
    syncChatMobileShell()
  } catch (error) {
    if (error?.isSuperseded) return
    if (options.fromPoll && list && previousListHtml) {
      list.innerHTML = previousListHtml
      return
    }
    if (list) list.innerHTML = `<div class="chat-error">Không tải được chat: ${chatEscape(chatErrorMessage(error))}</div>`
  } finally {
    clearChatAbort('conversationAbort', controller)
  }
}

function markChatConversationReadInState(id) {
  const targetId = Number(id)
  if (!Number.isFinite(targetId)) return
  chatState.conversations = (chatState.conversations || []).map(item => {
    if (Number(item.id) !== targetId) return item
    return {
      ...item,
      unread_count: 0,
      status: 'read'
    }
  })
  if (chatState.activeConversation && Number(chatState.activeConversation.id) === targetId) {
    chatState.activeConversation = {
      ...chatState.activeConversation,
      unread_count: 0,
      status: 'read'
    }
  }
}

window.openChatConversation = async function(id, options = {}) {
  const requestId = ++chatState.messageRequestSeq
  const controller = makeChatAbort('messageAbort')
  const nextId = Number(id)
  const previousId = Number(chatState.activeId || 0)
  chatState.activeId = nextId
  // Chỉ reset khi đổi sang hội thoại khác thật sự; poll làm mới cùng hội thoại không được xóa ô tìm kiếm của CSKH.
  if (previousId !== nextId) {
    resetChatProductPanelState()
    resetChatOrderPanelState()
  }
  if (isChatMobileView()) {
    chatState.mobileThreadVisible = true
    chatState.mobileAttachOpen = false
    syncChatMobileShell()
  }
  renderChatConversations()
  const box = chatEl('chatMessages')
  if (box && !options.silent) box.innerHTML = '<div class="chat-empty">Đang tải nội dung...</div>'
  try {
    const data = await chatFetch(`/api/chat/messages?id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
      // Luồng mở hội thoại còn enrich đơn/sản phẩm nên nới timeout để tránh báo lỗi giả.
      timeoutMs: 12000
    })
    if (requestId !== chatState.messageRequestSeq || Number(chatState.activeId) !== Number(id)) return
    chatState.activeConversation = data.conversation
    chatState.messages = data.messages || []
    renderChatThread(chatState.activeConversation, chatState.messages)
    syncChatMobileShell()
    if (data.conversation) loadChatConversationContext(id).catch(() => null)
  if (data.conversation && chatState.activeSettingsTab === 'advisories') window.loadChatProductAdvisories({ silent: true }).catch(() => null)
    const readResult = await chatFetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      timeoutMs: 5000
    }).catch(() => null)
    markChatConversationReadInState(id)
    renderChatConversations()
    if (readResult?.remote_note && !['ok', 'local_only'].includes(String(readResult.remote_status || '').toLowerCase())) {
      setChatGuardStatus(readResult.remote_note, 'muted')
    }
  } catch (error) {
    if (error?.isSuperseded) return
    if (box) box.innerHTML = `<div class="chat-error">Không tải được nội dung chat: ${chatEscape(chatErrorMessage(error))}</div>`
  } finally {
    clearChatAbort('messageAbort', controller)
  }
}

window.refreshChatNow = async function() {
  const btn = chatEl('chatRefreshNowBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang làm mới...'
  }
  setChatGuardStatus('Đang làm mới tin nhắn API; nếu hội thoại thuộc shop fallback sẽ gọi helper Chrome có kiểm soát.', 'muted')
  try {
    const result = await autoSyncChatApiContent({ force: true, quiet: true, limit: 20 })
    const pulled = Number(result?.pulled_messages || 0)
    const plan = chatAutomationPlan({ active: true })
    let automationSaved = 0
    if (!plan.useApi && plan.targets?.length) {
      const automationResult = await window.syncChatAutomationContent({
        quiet: true,
        active: true,
        force: true,
        limit: 3,
        skipButton: true
      })
      automationSaved = Number(automationResult?.saved_messages || 0)
    }
    const totalNew = pulled + automationSaved
    await window.loadChatConversations({ fromPoll: true, silent: totalNew <= 0, skipApiSync: true, reloadActive: true })
    setChatGuardStatus(totalNew
      ? `Đã kéo ${totalNew.toLocaleString('vi-VN')} tin mới từ API/helper.`
      : 'Đã làm mới hội thoại đang mở. Chưa thấy tin mới từ API/helper.', totalNew ? 'ok' : 'muted')
  } catch (error) {
    setChatGuardStatus(`Không làm mới được tin nhắn: ${chatErrorMessage(error)}`, 'blocked')
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false
        btn.textContent = oldText || 'Làm mới tin nhắn'
      }
    }, 900)
  }
}

window.syncChatConversations = async function() {
  const btn = chatEl('chatSyncBtn') || chatEl('chatWebhookSyncBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang đồng bộ...'
  }
  try {
    const result = await chatFetch('/api/chat/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 500 })
    })
    if (btn) btn.textContent = `Đã nhập ${Number(result.inserted || 0).toLocaleString('vi-VN')} tin`
    await window.loadChatConversations({ silent: false, skipApiSync: true, reloadActive: true })
  } catch (error) {
    const message = chatErrorMessage(error, 'Không rõ lỗi từ server chat.')
    setChatGuardStatus(`Không đồng bộ được webhook chat: ${message}`, 'blocked')
    if (btn) btn.textContent = 'Lỗi đồng bộ'
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false
        btn.textContent = oldText || 'Đồng bộ webhook'
      }
    }, 1200)
  }
}

window.syncChatApiContent = async function(options = {}) {
  const btn = chatEl('chatApiSyncBtn')
  const oldText = btn?.textContent || ''
  const quiet = Boolean(options.quiet)
  if (btn && !quiet) {
    btn.disabled = true
    btn.textContent = 'Đang kéo nội dung...'
  }
  try {
    const platform = options.platform ?? chatEl('chatPlatform')?.value ?? ''
    const shop = options.shop ?? chatEl('chatShop')?.value ?? ''
    const result = await chatFetch('/api/chat/api-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, shop, limit: 12 }),
      timeoutMs: 45000
    })
    const pulled = Number(result.pulled_messages || 0)
    chatState.lastApiSyncAt = Date.now()
    chatState.lastApiSyncStatus = pulled ? `Đã kéo ${pulled} tin mới từ API.` : 'API chat chưa có tin mới.'
    if (btn && !quiet) btn.textContent = pulled ? `Đã kéo ${pulled} tin` : 'Chưa có tin mới'
    await window.loadChatConversations({ silent: quiet, skipApiSync: true, reloadActive: pulled > 0 || !quiet })
    if (!pulled && result.results?.length) {
      const reason = result.results.map(item => `${chatPlatformLabel(item.platform)} ${item.shop || ''}: ${chatSyncResultReason(item)}`).join('\n')
      const hasHardError = result.results.some(chatSyncResultIsHardError)
      chatState.lastApiSyncStatus = `Đã kiểm tra API chat, chưa có tin mới. ${reason}`
      if (!quiet) setChatGuardStatus(chatState.lastApiSyncStatus, hasHardError ? 'blocked' : 'muted')
      if (!chatState.conversations.length) renderChatConversations()
    }
    return result
  } catch (error) {
    const message = chatErrorMessage(error, 'Không rõ lỗi từ server chat.')
    chatState.lastApiSyncStatus = `Không kéo được nội dung chat qua API: ${message}`
    if (!quiet) setChatGuardStatus(chatState.lastApiSyncStatus, 'blocked')
    if (btn && !quiet) btn.textContent = 'Lỗi API chat'
    return { error: message, pulled_messages: 0 }
  } finally {
    setTimeout(() => {
      if (btn && !quiet) {
        btn.disabled = false
        btn.textContent = oldText || 'Đồng bộ nội dung API'
      }
    }, 1400)
  }
}

async function runChatAutomationTargets(path, targets, baseBody = {}) {
  const aggregate = {
    results: [],
    shops_checked: 0,
    accepted_messages: 0,
    saved_messages: 0,
    ready_shops: 0,
    login_required: 0
  }
  for (const target of targets) {
    const result = await chatAutomationHelperFetch(path, {
      ...baseBody,
      platform: target.platform || '',
      shop: target.shop || '',
      max_shops: target.max_shops || (target.shop ? 1 : 5),
      scan_mode: target.scan_mode || '',
      exclude_shops: target.exclude_shops || []
    })
    // Helper trả lỗi qua JSON vẫn phải dừng để giao diện không báo nhầm là đã chạy xong.
    if (result?.ok === false || result?.error) {
      throw new Error(chatErrorMessage(result, 'Helper local trả lỗi.'))
    }
    const data = result.result || {}
    if (data?.ok === false || data?.error) {
      throw new Error(chatErrorMessage(data, 'Helper local trả lỗi.'))
    }
    aggregate.shops_checked += Number(data.shops_checked || 0)
    aggregate.accepted_messages += Number(data.accepted_messages || 0)
    aggregate.saved_messages += Number(data.saved_messages || 0)
    aggregate.ready_shops += Number(data.ready_shops || 0)
    aggregate.login_required += Number(data.login_required || 0)
    if (Array.isArray(data.results)) aggregate.results.push(...data.results)
  }
  return aggregate
}

window.syncChatAutomationContent = async function(options = {}) {
  const btn = options.skipButton ? null : chatEl('chatAutomationSyncBtn')
  const oldText = btn?.textContent || ''
  const quiet = Boolean(options.quiet)
  const plan = chatAutomationPlan(options)
  if (plan.useApi) {
    if (!quiet) setChatGuardStatus(`${plan.reason} Đang đồng bộ bằng API chính thức.`, 'muted')
    return window.syncChatApiContent({ platform: plan.platform, shop: plan.shop, quiet })
  }
  const targets = Array.isArray(plan.targets) ? plan.targets.filter(Boolean) : []
  if (!targets.length) {
    if (!quiet) setChatGuardStatus(plan.reason || 'Không có shop nào cần chạy automation.', 'muted')
    return { skipped: true, saved_messages: 0 }
  }
  if (chatState.automationSyncing) return { skipped: true, reason: 'syncing', saved_messages: 0 }
  const token = localStorage.getItem(CHAT_ADMIN_TOKEN_KEY) || ''
  if (!token) {
    if (!quiet) setChatGuardStatus('Bạn cần đăng nhập OMS để helper local đẩy chat automation vào core.', 'blocked')
    return { skipped: true, reason: 'missing_admin_token', saved_messages: 0 }
  }
  chatState.automationSyncing = true
  if (btn && !quiet) {
    btn.disabled = true
    btn.textContent = 'Đang chạy automation...'
  }
  if (!quiet) setChatGuardStatus(`${plan.reason} Đang gọi helper local để kéo tin nhắn automation.`, 'muted')
  try {
    const data = await runChatAutomationTargets('/chat-sync', targets, {
      admin_token: token,
      api: API,
      limit: options.limit || 5,
      timeout: 35,
      login_timeout: 210,
      reuse_browser: true,
      process_timeout: 300
    })

    const saved = Number(data.saved_messages || 0)
    const accepted = Number(data.accepted_messages || 0)
    const checked = Number(data.shops_checked || 0)
    const blocked = (data.results || []).filter(item => item.status === 'login_required')
    if (btn && !quiet) btn.textContent = saved ? `Đã nhập ${saved} tin` : 'Chưa có tin mới'
    chatState.lastAutomationSyncAt = Date.now()
    chatState.lastApiSyncStatus = saved
      ? `Automation đã nhập ${saved.toLocaleString('vi-VN')} tin mới.`
      : `Automation đã kiểm tra ${checked.toLocaleString('vi-VN')} shop, đọc được ${accepted.toLocaleString('vi-VN')} tin nhưng chưa có tin mới.`
    if (blocked.length) {
      chatState.lastApiSyncStatus += ` ${blocked.map(item => `${chatPlatformLabel(item.platform)} ${item.shop}: cần mở profile và đăng nhập sàn trước.`).join(' ')}`
    }
    if (!quiet || saved) setChatGuardStatus(chatState.lastApiSyncStatus, saved ? 'ok' : (blocked.length ? 'blocked' : 'muted'))
    await window.loadChatConversations({ silent: quiet && !saved, skipApiSync: true, reloadActive: saved > 0 || !quiet })
    if (!chatState.conversations.length) renderChatConversations()
    return data
  } catch (error) {
    const message = chatErrorMessage(error, 'Không gọi được helper local.')
      chatState.lastApiSyncStatus = `Không chạy được automation chat: ${message}. Hãy mở E:/shophuyvan-python-automation/oms_python/features/local_helper/server.py trên máy này rồi thử lại.`
    if (!quiet) setChatGuardStatus(chatState.lastApiSyncStatus, 'blocked')
    if (btn && !quiet) btn.textContent = 'Lỗi automation'
    if (!chatState.conversations.length) renderChatConversations()
    return { error: message, saved_messages: 0 }
  } finally {
    chatState.automationSyncing = false
    setTimeout(() => {
      if (btn && !quiet) {
        btn.disabled = false
        btn.textContent = oldText || 'Đồng bộ automation'
      }
    }, 1800)
  }
}

window.warmChatAutomationBrowsers = async function() {
  const btn = chatEl('chatWarmBrowserBtn')
  const oldText = btn?.textContent || ''
  const plan = chatAutomationPlan()
  if (plan.useApi) {
    setChatGuardStatus(`${plan.reason} Không mở trình duyệt chờ cho shop đã có API.`, 'muted')
    return
  }
  const targets = Array.isArray(plan.targets) ? plan.targets.filter(Boolean) : []
  if (!targets.length) {
    setChatGuardStatus(plan.reason || 'Không có shop fallback nào cần mở trình duyệt chờ.', 'muted')
    return
  }
  const token = localStorage.getItem(CHAT_ADMIN_TOKEN_KEY) || ''
  if (!token) {
    setChatGuardStatus('Bạn cần đăng nhập OMS để mở sẵn trình duyệt automation.', 'blocked')
    return
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang mở...'
  }
  setChatGuardStatus(`${plan.reason} Đang mở sẵn Chrome theo profile shop fallback.`, 'muted')
  try {
    const data = await runChatAutomationTargets('/chat-warm', targets, {
      admin_token: token,
      api: API,
      timeout: 45,
      login_timeout: 210,
      process_timeout: 300
    })
    const ready = Number(data.ready_shops || 0)
    const loginRequired = Number(data.login_required || 0)
    if (btn) btn.textContent = ready ? `Đã mở ${ready} shop` : 'Cần đăng nhập'
    const status = ready
      ? `Đã mở sẵn ${ready.toLocaleString('vi-VN')} trình duyệt shop. Các lần đồng bộ/gửi sau sẽ dùng lại profile đang chờ.`
      : `Đã mở Chrome nhưng còn ${loginRequired.toLocaleString('vi-VN')} shop cần đăng nhập trên sàn.`
    setChatGuardStatus(status, ready ? 'ok' : 'blocked')
  } catch (error) {
    const message = chatErrorMessage(error, 'Không mở được trình duyệt chờ.')
      setChatGuardStatus(`Không mở được trình duyệt automation: ${message}. Hãy chạy E:/shophuyvan-python-automation/oms_python/features/local_helper/server.py rồi thử lại.`, 'blocked')
    if (btn) btn.textContent = 'Lỗi mở'
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false
        btn.textContent = oldText || 'Mở sẵn trình duyệt'
      }
    }, 1800)
  }
}
