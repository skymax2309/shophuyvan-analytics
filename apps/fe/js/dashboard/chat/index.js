import { loadChatSettings, loadConversations, openConversation } from './data.js?v=chat-auto-send-20260603a'
import { loadConversationContext } from './context.js?v=chat-auto-send-20260603a'
import { openInitialDeepLinkConversation } from './deep-link.js?v=chat-auto-send-20260603a'
import { bindEvents } from './events.js?v=chat-auto-send-20260603a'
import { connectRealtime } from './realtime.js?v=chat-auto-send-20260603a'
import { prepareChatNotifications, updateNotificationToggle } from './notifications.js?v=chat-auto-send-20260603a'
import { renderAll } from './render.js?v=chat-auto-send-20260603a'
import { state } from './state.js?v=chat-auto-send-20260603a'
import { showToast } from './toast.js'

let pollTimer = null

async function init() {
  bindEvents()
  await prepareChatNotifications()
  await loadChatSettings().catch(error => console.warn('[chat_settings_load_failed]', error))
  renderAll()
  window.addEventListener('chat:conversation-opened', event => {
    const shopId = event.detail?.conversation?.shop_id
    if (shopId) connectRealtime(shopId)
    loadConversationContext(event.detail?.conversation).catch(error => {
      console.warn('[chat_context_load_failed]', error)
    })
  })
  await loadConversations({ keepActive: false, notify: false })
  const openedFromLink = await openInitialDeepLinkConversation()
  const first = state.conversations[0]
  if (!openedFromLink && first) {
    await openConversation(first.id, { silent: true })
    if (first.shop_id) connectRealtime(first.shop_id)
  }
  document.addEventListener('visibilitychange', () => {
    updateNotificationToggle()
    if (document.visibilityState === 'visible') loadConversations().catch(() => {})
  })
  const pollMs = Math.min(Math.max(Number(state.aiSettings?.poll_interval_seconds || 15) || 15, 10), 120) * 1000
  pollTimer = setInterval(() => loadConversations({ keepActive: true, notify: true }).catch(() => {}), pollMs)
}

window.ShopHuyVanChatOperational = {
  reload: loadConversations,
  openConversation,
  stopPolling: () => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init().catch(handleInitError))
} else {
  init().catch(handleInitError)
}

function handleInitError(error) {
  console.error('[chat_init_error]', {
    error_code: 'chat_ui_init_failed',
    error_message: error?.message || String(error)
  })
  showToast(`Không mở được Chat/CSKH: ${error?.message || error}`, 'error')
}

