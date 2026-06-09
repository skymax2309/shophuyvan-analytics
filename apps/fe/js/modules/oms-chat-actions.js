import { API } from '../oms-dashboard/oms-api.js'
import { showToast } from '../utils/helpers.js'
import { initOrderConfirmSettings } from './oms-order-confirm-settings.js?v=order-confirm-20260527b'

const CHAT_PAGE_PATH = '/pages/chat-cskh.html'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function chatPageUrl(target = {}) {
  const params = new URLSearchParams()
  params.set('source', 'oms')
  params.set('context_tab', 'orders')
  for (const [key, value] of [
    ['order_id', target.order_id],
    ['conversation_id', target.conversation_id],
    ['platform', target.platform || target.channel],
    ['channel', target.channel || target.platform],
    ['shop_id', target.shop_id],
    ['shop_display_name', target.shop_display_name],
    ['customer_id', target.customer_id],
    ['customer_name', target.customer_name],
    ['shop_chat_mode', target.shop_chat_mode],
    ['send_capability', target.send_capability],
    ['sync_capability', target.sync_capability],
    ['draft_source', target.draft_source],
    ['draft_text', target.draft_text],
    ['reason', target.reason]
  ]) {
    const text = cleanText(value)
    if (text) params.set(key, text)
  }
  return `${CHAT_PAGE_PATH}?${params.toString()}`
}

async function loadOrderConfirmDraft(orderId) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${API}/api/core/orders/${encodeURIComponent(orderId)}/chat-confirmation-template`, {
        method: 'GET',
        cache: 'no-store'
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data.ok !== false) {
        if (!data.enabled || !data.draft_text) return {}
        return {
          draft_source: 'order_confirm',
          draft_text: data.draft_text
        }
      }
    } catch (error) {
      if (attempt === 1) throw error
    }
    // Thử lại một lần khi kết nối Core bị gián đoạn ngắn lúc chuyển màn hình.
    await new Promise(resolve => window.setTimeout(resolve, 250))
  }
  return {}
}

async function resolveOrderChatTarget(orderId) {
  const response = await fetch(`${API}/api/core/orders/${encodeURIComponent(orderId)}/chat-target`, {
    method: 'GET',
    cache: 'no-store'
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || data.error || 'Không resolve được Chat target từ Order Core.')
  }
  return data.chat_target || data.target || data
}

async function openCustomerChatFromOrder(orderId, button) {
  const cleanOrderId = cleanText(orderId)
  if (!cleanOrderId) return
  const oldText = button?.textContent || ''
  if (button) {
    button.disabled = true
    button.textContent = 'Đang mở...'
  }
  try {
    const target = await resolveOrderChatTarget(cleanOrderId)
    if (!target.open_chat_allowed) {
      showToast(target.reason || 'Đơn này chưa hỗ trợ mở Chat tự động.', 6000)
      return
    }
    if (target.reason && target.reason !== 'Mở Chat mới theo khách và đơn hàng.') {
      showToast(target.reason, 5000)
    }
    const draft = await loadOrderConfirmDraft(cleanOrderId).catch(() => ({}))
    window.location.href = chatPageUrl({ ...target, ...draft })
  } catch (error) {
    showToast(`Không mở được Chat mới: ${error.message || error}`, 6000)
  } finally {
    if (button) {
      button.disabled = false
      button.textContent = oldText || 'Nhắn khách'
    }
  }
}

export function initOmsCustomerChatActions() {
  initOrderConfirmSettings()
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-open-customer-chat]')
    if (!button) return
    event.preventDefault()
    openCustomerChatFromOrder(button.dataset.openCustomerChat, button)
  })
}
