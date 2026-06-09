import { chatApi, localHelperApi, zaloHelperApi } from './api.js'
import { isSocialLocalBridge, mergeMessages, setState, state } from './state.js?v=chat-auto-send-20260603a'
import { renderAll } from './render.js?v=chat-auto-send-20260603a'
import { registerChatServiceWorker, shouldShowChatNotification } from './notifications.js?v=chat-auto-send-20260603a'
import { showToast } from './toast.js'

let conversationSnapshotReady = false
const conversationSnapshot = new Map()

function text(value, fallback = '') {
  const plain = String(value ?? fallback).replace(/\u00a0/g, ' ').trim()
  return plain && plain !== '[object Object]' ? plain : fallback
}

function channelLabel(value) {
  const key = text(value).toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  if (key === 'zalo') return 'Zalo'
  if (key === 'facebook') return 'Facebook'
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Chat'
}

function snapshotKey(row = {}) {
  return `${row.id || row.platform_conversation_id || ''}`
}

function snapshotValue(row = {}) {
  return {
    unread: Number(row.unread_count || 0) || 0,
    last: text(row.last_message_at || row.updated_at || ''),
    message: text(row.last_message_text || ''),
    customer: text(row.customer_name || row.buyer_name || row.display_name || 'Tin nhắn mới')
  }
}

function detectNewCustomerMessages(rows = []) {
  const notices = []
  for (const row of rows) {
    const key = snapshotKey(row)
    if (!key) continue
    const current = snapshotValue(row)
    const previous = conversationSnapshot.get(key)
    if (conversationSnapshotReady && current.unread > 0) {
      const hasNewUnread = !previous || current.unread > previous.unread
      const hasNewLastMessage = previous && current.last && current.last !== previous.last
      if (hasNewUnread || hasNewLastMessage) notices.push({ ...current, id: key, row })
    }
    conversationSnapshot.set(key, current)
  }
  conversationSnapshotReady = true
  return notices
}

export async function loadConversations({ keepActive = true, notify = true } = {}) {
  setState({ loading: true })
  try {
    const params = new URLSearchParams({ limit: '200' })
    if (state.search) params.set('q', state.search)
    const data = await chatApi(`/api/chat/conversations?${params}`)
    const remoteConversations = Array.isArray(data.conversations) ? data.conversations : []
    // Giữ ngữ cảnh đơn vừa mở từ OMS nếu khách chưa có hội thoại lưu trong Chat Core.
    const orderContext = keepActive && state.activeConversation?.source === 'oms_deep_link_context'
      ? state.activeConversation
      : null
    const conversations = orderContext
      ? [orderContext, ...remoteConversations.filter(item => item.id !== orderContext.id)]
      : remoteConversations
    const notices = notify ? detectNewCustomerMessages(remoteConversations) : []
    const activeStillExists = keepActive && conversations.some(item => item.id === state.activeId)
    setState({
      conversations,
      activeId: activeStillExists ? state.activeId : '',
      activeConversation: activeStillExists ? conversations.find(item => item.id === state.activeId) : null,
      loading: false,
      threadOpen: activeStillExists ? state.threadOpen : false
    })
    for (const notice of notices.slice(0, 3)) notifyIncomingMessage({
      conversation_id: notice.id,
      text: notice.message,
      sender_type: 'customer',
      created_at: notice.last
    }, notice.row)
    if (!state.activeConversation && conversations[0]) await openConversation(conversations[0].id, { silent: true })
    renderAll()
  } catch (error) {
    setState({ loading: false })
    showToast(`Không tải được hội thoại: ${error.message}`, 'error')
  }
}

export async function loadChatSettings() {
  const data = await chatApi('/api/chat/settings', { allowBusinessError: true, timeoutMs: 15000 })
  if (data?.settings) setState({ aiSettings: { ...state.aiSettings, ...data.settings } })
  return data
}

export async function saveChatSettings(settings = {}) {
  const data = await chatApi('/api/chat/settings', {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 15000,
    body: JSON.stringify({ settings })
  })
  if (data?.settings) setState({ aiSettings: { ...state.aiSettings, ...data.settings } })
  return data
}

export async function openConversation(id, { silent = false } = {}) {
  const data = await chatApi(`/api/chat/conversations/${encodeURIComponent(id)}/messages?limit=120`)
  const conversation = data.conversation || state.conversations.find(item => item.id === id)
  const conversations = state.conversations.map(item => item.id === id ? { ...item, unread_count: 0 } : item)
  if (conversation) conversationSnapshot.set(snapshotKey(conversation), { ...snapshotValue(conversation), unread: 0 })
  setState({
    conversations,
    activeId: id,
    activeConversation: conversation ? { ...conversation, unread_count: 0 } : conversation,
    messages: Array.isArray(data.messages) ? data.messages : [],
    composerText: state.activeId === id ? state.composerText : '',
    aiSuggestion: null,
    detailTab: ['orders', 'products', 'voucher', 'ai', 'quick', 'sync'].includes(state.detailTab) ? state.detailTab : 'orders',
    threadOpen: silent ? state.threadOpen : true
  })
  renderAll()
  window.dispatchEvent(new CustomEvent('chat:conversation-opened', { detail: { conversation } }))
  markConversationRead(id).catch(error => console.warn('[chat_mark_read_failed]', error))
  loadDiagnostic(id).catch(() => {})
}

async function markConversationRead(id) {
  const result = await chatApi(`/api/chat/conversations/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 30000
  })
  if (result?.conversation) {
    setState({
      conversations: state.conversations.map(item => item.id === id ? { ...item, ...result.conversation, unread_count: 0 } : item),
      activeConversation: state.activeId === id ? { ...state.activeConversation, ...result.conversation, unread_count: 0 } : state.activeConversation
    })
    renderAll()
  }
}

export async function loadDiagnostic(id = state.activeId) {
  if (!id) return
  const data = await chatApi(`/api/chat/conversations/${encodeURIComponent(id)}/sync-diagnostic`)
  state.diagnostics.set(id, data.diagnostic)
  renderAll()
}

function canSyncViaApi(conversation = {}) {
  return ['polling_api', 'webhook'].includes(String(conversation.sync_capability || '').toLowerCase())
}

function canSyncViaBrowserHelper(conversation = {}) {
  return String(conversation.sync_capability || '').toLowerCase() === 'browser_helper'
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function automationWindowSettings(platform = '') {
  const settings = state.aiSettings || {}
  const preset = String(settings.automation_browser_preset || 'compact')
  const fallbackLeft = String(platform).toLowerCase() === 'shopee' ? 630 : 0
  return {
    browser_preset: ['compact', 'top_left', 'top_right', 'desktop', 'custom'].includes(preset) ? preset : 'compact',
    browser_width: clampNumber(settings.automation_browser_width, 300, 1600, 620),
    browser_height: clampNumber(settings.automation_browser_height, 320, 1000, 480),
    browser_left: clampNumber(settings.automation_browser_left, 0, 2400, fallbackLeft),
    browser_top: clampNumber(settings.automation_browser_top, 0, 1400, 0),
    browser_minimized: false,
    browser_hidden: false,
    expand_browser_viewport: preset === 'desktop'
  }
}

function syncSuccessMessage(result = {}) {
  const helperResult = result.result && typeof result.result === 'object' ? result.result : {}
  const scanned = Number(result.pulled_conversations || result.listed_conversations || result.conversations || helperResult.shops_checked || 0) || 0
  const pulled = Number(result.pulled_messages || helperResult.accepted_messages || 0) || 0
  const saved = Number(result.saved_messages || helperResult.saved_messages || 0) || 0
  if (scanned || pulled || saved) return `Đã quét ${scanned} hội thoại, đọc ${pulled} tin, lưu ${saved} tin mới.`
  return 'Đã gọi đồng bộ hội thoại.'
}

function syncBusinessMessage(result = {}) {
  return result.last_error_message || result.error_message || result.message || 'Shop này cần helper/import tay, không gọi API tự động.'
}

function syncRequestBody(conversation = {}) {
  return {
    channel: conversation.channel,
    shop_id: conversation.shop_id,
    conversation_id: conversation.id,
    platform_conversation_id: conversation.platform_conversation_id,
    customer_id: conversation.customer_id,
    customer_name: conversation.customer_name,
    last_message_text: conversation.last_message_text,
    limit: 50,
    page_size: 50,
    force_history: true
  }
}

async function postSync(conversation = {}) {
  return chatApi('/api/chat/sync', {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 90000,
    body: JSON.stringify(syncRequestBody(conversation))
  })
}

async function postBrowserHelperSync(conversation = {}) {
  const platform = conversation.channel || conversation.platform || ''
  const shop = conversation.shop_id || conversation.shop || ''
  return localHelperApi('/chat-sync', {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 330000,
    body: JSON.stringify({
      platform,
      shop,
      max_shops: 1,
      limit: 5,
      scan_mode: 'browser_thread_detail',
      ...automationWindowSettings(platform),
      reuse_browser: true,
      api: chatApiBaseForHelper(),
      process_timeout: 300
    })
  })
}

async function postZaloHistorySync(conversation = {}, { accountWide = false } = {}) {
  return zaloHelperApi('/api/shophuyvan-chat/sync-history', {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 180000,
    body: JSON.stringify({
      shop_id: conversation.shop_id,
      conversation_id: accountWide ? '' : conversation.id,
      platform_conversation_id: accountWide ? '' : (conversation.platform_conversation_id || conversation.customer_id),
      customer_id: accountWide ? '' : conversation.customer_id,
      customer_name: accountWide ? '' : conversation.customer_name,
      limit: accountWide ? 20 : 1,
      deep: true
    })
  })
}

function chatApiBaseForHelper() {
  return (window.SHOPHUYVAN_CHAT_API_BASE || 'https://shophuyvan-chat-api.zacha030596.workers.dev').replace(/\/+$/, '')
}

export async function syncConversation(conversation = state.activeConversation, { silent = false, refresh = true } = {}) {
  if (!conversation || state.syncBusy) return
  setState({ syncBusy: true })
  renderAll()
  try {
    const result = isSocialLocalBridge(conversation)
      ? await postZaloHistorySync(conversation)
      : canSyncViaBrowserHelper(conversation)
      ? await postBrowserHelperSync(conversation)
      : await postSync(conversation)
    if (result?.ok === false) {
      if (!silent) showToast(syncBusinessMessage(result), 'error')
    } else if (!silent) {
      showToast(syncSuccessMessage(result), 'ok')
    }
    if (refresh) {
      await loadConversations()
      if (state.activeId) await openConversation(state.activeId, { silent: true })
    }
  } catch (error) {
    if (!silent) showToast(`Sync lỗi: ${error.message}`, 'error')
  } finally {
    setState({ syncBusy: false })
    renderAll()
  }
}

export async function syncChannel(channel) {
  if (state.syncBusy) return
  if (String(channel || '').toLowerCase() === 'zalo') {
    const zaloRows = state.conversations.filter(item => item.channel === 'zalo' && isSocialLocalBridge(item))
    if (!zaloRows.length) return showToast('Chưa có hội thoại Zalo để đồng bộ.', 'error')
    const targets = new Map()
    for (const row of zaloRows) {
      const key = `${row.channel}:${row.shop_id || row.shop || row.id}`
      if (!targets.has(key)) targets.set(key, row)
    }
    if (state.activeConversation?.channel === 'zalo' && isSocialLocalBridge(state.activeConversation)) {
      targets.set(`zalo:${state.activeConversation.shop_id || state.activeConversation.shop || state.activeConversation.id}`, state.activeConversation)
    }
    setState({ syncBusy: true })
    renderAll()
    try {
      let scanned = 0
      let pulled = 0
      let saved = 0
      let failed = 0
      for (const target of targets.values()) {
        const result = await postZaloHistorySync(target, { accountWide: true }).catch(error => ({ ok: false, error_message: error.message }))
        if (result?.ok === false) {
          failed += 1
          continue
        }
        scanned += Number(result.conversations_scanned || 0) || 0
        pulled += Number(result.messages_synced || 0) || 0
        saved += Number(result.saved_messages || 0) || 0
        failed += Array.isArray(result.errors) ? result.errors.length : 0
      }
      await loadConversations()
      if (state.activeId) await openConversation(state.activeId, { silent: true })
      const suffix = failed ? `, ${failed} mục cần kiểm tra` : ''
      showToast(`Đã đồng bộ Zalo: ${scanned} hội thoại, đọc ${pulled} tin, lưu ${saved} tin mới${suffix}.`, failed ? 'error' : 'ok')
    } catch (error) {
      showToast(`Sync Zalo lỗi: ${error.message}`, 'error')
    } finally {
      setState({ syncBusy: false })
      renderAll()
    }
    return
  }
  const rows = state.conversations.filter(item => item.channel === channel && (canSyncViaApi(item) || canSyncViaBrowserHelper(item)))
  if (!rows.length) return showToast('Chưa có hội thoại thuộc kênh này.', 'error')
  const targets = new Map()
  for (const row of rows) {
    const key = `${row.channel}:${row.shop_id || row.shop || row.id}`
    if (!targets.has(key)) targets.set(key, row)
  }
  if (state.activeConversation?.channel === channel && (canSyncViaApi(state.activeConversation) || canSyncViaBrowserHelper(state.activeConversation))) {
    targets.set(`${channel}:${state.activeConversation.shop_id || state.activeConversation.shop || state.activeConversation.id}`, state.activeConversation)
  }
  setState({ syncBusy: true })
  renderAll()
  try {
    let scanned = 0
    let pulled = 0
    let saved = 0
    let failed = 0
    for (const target of targets.values()) {
      const result = await (canSyncViaBrowserHelper(target) ? postBrowserHelperSync(target) : postSync(target))
        .catch(error => ({ ok: false, error_message: error.message }))
      if (result?.ok === false) {
        failed += 1
        continue
      }
      const helperResult = result.result && typeof result.result === 'object' ? result.result : {}
      scanned += Number(result.pulled_conversations || result.listed_conversations || helperResult.shops_checked || helperResult.accepted_conversations || 0) || 0
      pulled += Number(result.pulled_messages || helperResult.accepted_messages || 0) || 0
      saved += Number(result.saved_messages || helperResult.saved_messages || 0) || 0
    }
    await loadConversations()
    if (state.activeId) await openConversation(state.activeId, { silent: true })
    const suffix = failed ? `, ${failed} shop lỗi` : ''
    showToast(`Đã quét ${targets.size} shop, ${scanned} hội thoại, đọc ${pulled} tin, lưu ${saved} tin mới${suffix}.`, failed ? 'error' : 'ok')
  } catch (error) {
    showToast(`Sync lỗi: ${error.message}`, 'error')
  } finally {
    setState({ syncBusy: false })
    renderAll()
  }
}

export function mergeRealtimeMessage(message) {
  if (!message) return
  if (message.conversation_id === state.activeId) {
    setState({ messages: mergeMessages(state.messages, [message]) })
  }
  const shouldNotify = message.sender_type === 'customer' && (message.conversation_id !== state.activeId || document.visibilityState !== 'visible')
  if (shouldNotify) notifyIncomingMessage(message)
  const conversations = state.conversations.map(item => {
    if (item.id !== message.conversation_id) return item
    return {
      ...item,
      last_message_text: message.text || item.last_message_text,
      last_message_at: message.created_at || item.last_message_at,
      unread_count: message.sender_type === 'customer' ? Number(item.unread_count || 0) + 1 : item.unread_count
    }
  })
  setState({ conversations })
  renderAll()
}

function notifyIncomingMessage(message = {}, rowOverride = null) {
  const row = rowOverride || state.conversations.find(item => item.id === message.conversation_id) || {}
  const sender = text(message.sender_name || row.customer_name || row.buyer_name || row.display_name, 'Khách hàng')
  const label = channelLabel(message.channel || row.channel)
  const title = `${label} · ${sender}`
  const body = text(message.text || message.content || row.last_message_text, 'Khách vừa nhắn tin.')
  const data = {
    type: 'chat',
    url: '/pages/chat-cskh.html',
    conversation_id: message.conversation_id,
    id: message.conversation_id,
    channel: row.channel || message.channel || '',
    channel_label: label,
    sender_name: sender,
    message_text: body
  }
  showToast(`${title}: ${body}`.slice(0, 160), 'ok')
  navigator.vibrate?.(120)
  document.title = 'Tin mới - Chat/CSKH sàn'
  if (shouldShowChatNotification()) {
    registerChatServiceWorker()
      .then(registration => registration?.showNotification?.(title, {
        body,
        tag: `chat-${message.conversation_id}`,
        badge: '/icons/shophuyvan-icon.svg',
        icon: '/icons/shophuyvan-icon.svg',
        data
      }) || new Notification(title, { body, data }))
      .catch(() => new Notification(title, { body, data }))
  }
}

