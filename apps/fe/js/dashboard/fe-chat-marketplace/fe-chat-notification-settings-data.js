// NEO: Frontend chat sàn - nhóm notification-settings-data. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function updateChatNotifyStatus(message, tone = 'muted') {
  const status = chatEl('chatNotifyStatus')
  if (status) status.textContent = message
  const pill = chatEl('chatNotifyPermissionState')
  if (!pill) return
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  pill.className = `chat-pill ${granted || tone === 'ok' ? 'api' : 'off'}`
  pill.textContent = granted ? 'Đã bật' : (tone === 'blocked' ? 'Chưa hỗ trợ' : 'Chưa bật')
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

async function registerChatServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.register('/sw.js')
  registration.update?.().catch(() => null)
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise(resolve => setTimeout(resolve, 2500))
  ])
  return registration
}

async function loadChatNotificationStatus() {
  try {
    chatState.notificationStatus = await chatFetch('/api/chat/notifications/status')
    return chatState.notificationStatus
  } catch (error) {
    chatState.notificationStatus = { supported: false, error: chatErrorMessage(error) }
    return chatState.notificationStatus
  }
}

function chatNotificationBody(item) {
  const settings = currentChatSettings()
  if (!Number(settings.notify_preview_enabled)) return 'Có tin nhắn mới cần tư vấn.'
  return String(item?.last_message || 'Có tin nhắn mới cần tư vấn.').slice(0, 180)
}

function playChatNoticeSound() {
  const settings = currentChatSettings()
  if (!Number(settings.notify_sound_enabled)) return
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = chatState.audioContext || new AudioContext()
    chatState.audioContext = ctx
    if (ctx.state === 'suspended') ctx.resume().catch(() => null)
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
    gain.connect(ctx.destination)
    for (const [index, frequency] of [880, 1175].entries()) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, now + index * 0.16)
      osc.connect(gain)
      osc.start(now + index * 0.16)
      osc.stop(now + index * 0.16 + 0.22)
    }
    chatState.audioUnlocked = true
  } catch {}
}

async function showChatBrowserNotification(item) {
  const settings = currentChatSettings()
  if (!Number(settings.notify_enabled)) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const key = chatNotificationKey(item)
  const title = `Tin nhắn mới từ ${item?.buyer_name || item?.buyer_id || 'khách hàng'}`
  const options = {
    body: chatNotificationBody(item),
    tag: `shv-chat-${chatSimpleHash(key)}`,
    renotify: false,
    silent: true,
    data: {
      // Thông báo đẩy mở thẳng trang chat sàn tách riêng để không quay lại dashboard tổng hợp.
      url: `/pages/chat-marketplace.html`,
      conversation_id: item?.conversation_id || '',
      id: item?.id || '',
      dedupe_key: key
    }
  }
  const registration = await navigator.serviceWorker?.ready?.catch(() => null)
  if (registration?.showNotification) {
    await registration.showNotification(title, options)
  } else {
    new Notification(title, options)
  }
}

function notifyForNewChatConversations(conversations, options = {}) {
  const settings = currentChatSettings()
  const keys = conversations.map(chatNotificationKey).filter(Boolean)
  if (!chatState.notifyBaselineReady || options.silent) {
    keys.forEach(key => chatState.notifiedKeys.add(key))
    chatState.notifyBaselineReady = true
    chatWriteNotifiedKeys()
    return
  }
  if (!Number(settings.notify_enabled)) {
    keys.forEach(key => chatState.notifiedKeys.add(key))
    chatWriteNotifiedKeys()
    return
  }
  const activeId = Number(chatState.activeId || 0)
  const fresh = conversations.filter(item => {
    const key = chatNotificationKey(item)
    if (!key || chatState.notifiedKeys.has(key)) return false
    if (Number(item.unread_count || 0) <= 0) return false
    if (Number(item.id) === activeId && !document.hidden) return false
    if (isChatNotice(item.last_message)) return false
    if (!String(item.last_message || '').trim()) return false
    return true
  }).slice(0, 3)
  keys.forEach(key => chatState.notifiedKeys.add(key))
  chatWriteNotifiedKeys()
  if (!fresh.length) return
  playChatNoticeSound()
  fresh.forEach(item => showChatBrowserNotification(item).catch(() => null))
}

window.testChatNoticeSound = function() {
  playChatNoticeSound()
  updateChatNotifyStatus('Đã phát âm thử. Nếu iPhone đang im lặng hoặc giảm âm lượng, hãy bật chuông/âm lượng thông báo.', 'ok')
}

window.enableChatIphoneNotifications = async function() {
  const settings = collectChatSettings()
  chatState.settings = { ...currentChatSettings(), ...settings }
  updateChatNotifyStatus('Đang xin quyền thông báo trên thiết bị...', 'muted')
  playChatNoticeSound()
  try {
    if (typeof Notification === 'undefined') {
      updateChatNotifyStatus('Trình duyệt này chưa hỗ trợ thông báo web.', 'blocked')
      return
    }
    const config = await loadChatNotificationStatus()
    if (!config.supported || !config.vapid_public_key) {
      updateChatNotifyStatus('Máy chủ chưa có khóa Web Push. OMS vẫn báo âm khi dashboard đang mở.', 'blocked')
      return
    }
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
    if (permission !== 'granted') {
      updateChatNotifyStatus('Bạn chưa cấp quyền thông báo cho OMS trên thiết bị này.', 'blocked')
      return
    }
    const registration = await registerChatServiceWorker()
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapid_public_key)
    })
    const platform = chatEl('chatPlatform')?.value || ''
    const shop = chatEl('chatShop')?.value || ''
    await chatFetch('/api/chat/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        platform,
        shop,
        preview_enabled: settings.notify_preview_enabled,
        sound_enabled: settings.notify_sound_enabled,
        device_label: /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'iPhone/iPad CSKH' : 'Thiết bị CSKH',
        user_agent: navigator.userAgent
      })
    })
    updateChatNotifyStatus('Đã bật thông báo. iPhone sẽ hiện preview khi OMS nhận tin mới và app đã được thêm vào Màn hình chính.', 'ok')
  } catch (error) {
    updateChatNotifyStatus(`Chưa bật được thông báo: ${chatErrorMessage(error)}`, 'blocked')
  }
}

window.saveChatSettings = async function() {
  const btn = chatEl('chatSettingsSaveBtn')
  const status = chatEl('chatSettingsSaveStatus')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang lưu...'
  }
  if (status) status.textContent = ''
  try {
    const data = await chatFetch('/api/chat/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectChatSettings())
    })
    chatState.settings = data.settings || chatSettingsDefaults()
    renderChatSetup(chatState.setupData || {})
    setChatReplyEnabled(Boolean(chatState.activeConversation))
    restartChatPolling()
    const savedStatus = chatEl('chatSettingsSaveStatus')
    if (savedStatus) savedStatus.textContent = 'Đã lưu thiết lập chat.'
  } catch (error) {
    if (status) status.textContent = `Không lưu được: ${chatErrorMessage(error)}`
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false
        btn.textContent = oldText || 'Lưu thiết lập chat'
      }
    }, 800)
  }
}

async function ensureChatSettingsTabData(tab) {
  const safeTab = chatNormalizeSettingsTab(tab)
  if (safeTab === 'rules') {
    await ensureChatSetupSnapshot().catch(() => null)
    await window.loadChatRuleViolations({ silent: true }).catch(() => null)
    await window.loadChatAutoReplyLogs({ silent: true }).catch(() => null)
  }
  if (safeTab === 'ai-auto') {
    await loadChatShopAutoSettings({ force: true }).catch(() => null)
    await loadGhnAutoOrders({ limit: 30 }).catch(() => null)
  }
  if (safeTab === 'knowledge') {
    await window.loadChatKnowledge({ silent: true }).catch(() => null)
  }
  if (safeTab === 'advisories') {
    await window.loadChatProductAdvisories({ silent: true }).catch(() => null)
  }
}

window.setChatSettingsTab = async function(tab, options = {}) {
  chatState.activeSettingsTab = chatNormalizeSettingsTab(tab)
  if (!options.skipOpen) {
    const modal = ensureChatAutomationSettingsModal()
    modal.hidden = false
    document.body.classList.add('chat-quick-modal-open')
  }
  renderChatAutomationSettingsModal()
  await ensureChatSettingsTabData(chatState.activeSettingsTab)
  renderChatAutomationSettingsModal()
}

window.setChatSideTab = async function(tab) {
  const normalized = String(tab || '').trim().toLowerCase()
  if (CHAT_SETTINGS_TABS.has(normalized)) {
    await window.openChatAutomationSettings(normalized)
    return
  }
  chatState.activeSideTab = chatNormalizeContextTab(normalized)
  renderChatSetup(chatState.setupData || {})
}

async function persistChatSettingsPatch(patch = {}) {
  const next = { ...currentChatSettings(), ...patch }
  const data = await chatFetch('/api/chat/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next)
  })
  chatState.settings = data.settings || next
  renderChatSetup(chatState.setupData || {})
  setChatReplyEnabled(Boolean(chatState.activeConversation))
  return chatState.settings
}

window.filterChatKeywordTable = function(value) {
  chatState.keywordQuery = String(value || '')
  renderChatSetup(chatState.setupData || {})
  const input = chatEl('chatKeywordSearch')
  if (input) {
    input.focus()
    const end = input.value.length
    input.setSelectionRange(end, end)
  }
}

window.addChatBlockedKeyword = async function() {
  const input = chatEl('chatNewKeyword')
  const keyword = input?.value?.trim() || ''
  if (!keyword) return
  const settings = currentChatSettings()
  const existing = new Set((settings.blocked_keywords || []).map(item => String(item).toLowerCase()))
  if (existing.has(keyword.toLowerCase())) {
    if (input) input.value = ''
    return
  }
  await persistChatSettingsPatch({
    blocked_keywords: [...(settings.blocked_keywords || []), keyword]
  })
}

window.removeChatBlockedKeyword = async function(index) {
  const settings = currentChatSettings()
  const next = (settings.blocked_keywords || []).filter((_, i) => i !== Number(index))
  await persistChatSettingsPatch({ blocked_keywords: next })
}

window.loadChatRuleViolations = async function(options = {}) {
  try {
    const data = await chatFetch('/api/chat/rule-violations?limit=30')
    chatState.ruleViolations = data.violations || []
    renderChatSetup(chatState.setupData || {})
  } catch (error) {
    if (!options.silent) setChatGuardStatus(`Không tải được log AI vi phạm: ${chatErrorMessage(error)}`, 'blocked')
  }
}

window.filterChatKnowledge = function(value) {
  chatState.knowledgeQuery = String(value || '')
  renderChatSetup(chatState.setupData || {})
  const input = chatEl('chatKnowledgeSearch')
  if (input) {
    input.focus()
    const end = input.value.length
    input.setSelectionRange(end, end)
  }
}

window.loadChatKnowledge = async function(options = {}) {
  const conversation = chatState.activeConversation || {}
  const params = new URLSearchParams()
  params.set('status', 'approved')
  params.set('limit', '40')
  if (conversation.platform) params.set('platform', conversation.platform)
  if (conversation.shop || conversation.shop_id) params.set('shop', conversation.shop || conversation.shop_id)
  if (chatState.knowledgeQuery) params.set('q', chatState.knowledgeQuery)
  chatState.knowledgeLoading = true
  renderChatSetup(chatState.setupData || {})
  try {
    const data = await chatFetch(`/api/chat/knowledge?${params}`)
    chatState.knowledgeItems = data.knowledge || []
  } catch (error) {
    if (!options.silent) setChatGuardStatus(`Không tải được mẫu AI: ${chatErrorMessage(error)}`, 'blocked')
  } finally {
    chatState.knowledgeLoading = false
    renderChatSetup(chatState.setupData || {})
  }
}
