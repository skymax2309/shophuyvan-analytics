import { chatApi, coreApi } from './api.js'
import { insertTextToComposer } from './context.js?v=chat-auto-send-20260603a'
import { openConversation } from './data.js?v=chat-auto-send-20260603a'
import { renderAll } from './render.js?v=chat-auto-send-20260603a'
import { setState, state } from './state.js?v=chat-auto-send-20260603a'
import { showToast } from './toast.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function currentParams() {
  return new URL(window.location.href).searchParams
}

function deepLinkTarget() {
  const params = currentParams()
  const orderId = cleanText(params.get('order_id'))
  const customerId = cleanText(params.get('customer_id'))
  const conversationId = cleanText(params.get('conversation_id'))
  if (!orderId && !customerId && !conversationId) return null
  return {
    source: cleanText(params.get('source')),
    order_id: orderId,
    conversation_id: conversationId,
    channel: cleanText(params.get('channel') || params.get('platform') || 'shopee').toLowerCase(),
    shop_id: cleanText(params.get('shop_id')),
    shop_display_name: cleanText(params.get('shop_display_name')),
    customer_id: customerId,
    customer_name: cleanText(params.get('customer_name') || 'Khách theo đơn'),
    shop_chat_mode: cleanText(params.get('shop_chat_mode')),
    send_capability: cleanText(params.get('send_capability') || 'manual_only'),
    sync_capability: cleanText(params.get('sync_capability') || 'manual_import'),
    draft_source: cleanText(params.get('draft_source')),
    draft_text: cleanText(params.get('draft_text'))
  }
}

function sameCustomer(row = {}, target = {}) {
  if (target.conversation_id && row.id === target.conversation_id) return true
  if (target.conversation_id && row.platform_conversation_id === target.conversation_id) return true
  if (target.customer_id && cleanText(row.customer_id) === target.customer_id) return true
  if (target.customer_name && cleanText(row.customer_name).toLowerCase() === target.customer_name.toLowerCase()) return true
  return false
}

async function findTargetConversation(target) {
  if (target.conversation_id) return { id: target.conversation_id }
  const params = new URLSearchParams({ limit: '20' })
  if (target.channel) params.set('channel', target.channel)
  if (target.shop_id) params.set('shop_id', target.shop_id)
  if (target.customer_id) params.set('customer_id', target.customer_id)
  if (!target.customer_id && target.customer_name) params.set('q', target.customer_name)
  let data = await chatApi(`/api/chat/conversations?${params.toString()}`, {
    allowBusinessError: true,
    timeoutMs: 15000
  })
  let rows = Array.isArray(data.conversations) ? data.conversations : []
  if (!rows.length && target.shop_id && (target.customer_id || target.customer_name)) {
    params.delete('shop_id')
    data = await chatApi(`/api/chat/conversations?${params.toString()}`, {
      allowBusinessError: true,
      timeoutMs: 15000
    })
    rows = Array.isArray(data.conversations) ? data.conversations : []
  }
  return rows.find(row => sameCustomer(row, target)) || rows[0] || null
}

function virtualConversation(target) {
  const now = new Date().toISOString()
  return {
    id: `order-context-${target.order_id || target.customer_id || Date.now()}`,
    channel: target.channel || 'shopee',
    shop_id: target.shop_id,
    shop_display_name: target.shop_display_name,
    customer_id: target.customer_id,
    customer_name: target.customer_name || 'Khách theo đơn',
    order_id: target.order_id,
    platform_conversation_id: target.conversation_id || '',
    last_message_text: target.order_id ? `Mở từ đơn ${target.order_id}` : 'Mở từ OMS',
    last_message_at: now,
    updated_at: now,
    unread_count: 0,
    status: 'open',
    shop_chat_mode: target.shop_chat_mode || 'manual',
    send_capability: target.send_capability || 'manual_only',
    sync_capability: target.sync_capability || 'manual_import',
    source: 'oms_deep_link_context'
  }
}

async function loadConfirmationDraft(target) {
  if (target.draft_text) return target.draft_text
  if (!target.order_id || target.draft_source !== 'order_confirm') return ''
  const data = await coreApi(`/api/core/orders/${encodeURIComponent(target.order_id)}/chat-confirmation-template`, {
    allowBusinessError: true,
    timeoutMs: 15000
  })
  return data?.enabled && data?.draft_text ? cleanText(data.draft_text) : ''
}

function insertDraftWhenReady(text) {
  if (!text) return
  window.setTimeout(() => insertTextToComposer(text), 0)
}

export async function openInitialDeepLinkConversation() {
  const target = deepLinkTarget()
  if (!target) return false
  try {
    const [conversation, draftText] = await Promise.all([
      findTargetConversation(target),
      loadConfirmationDraft(target).catch(() => target.draft_text || '')
    ])
    if (conversation?.id) {
      try {
        await openConversation(conversation.id, { silent: true })
        if (target.order_id && state.activeConversation) {
          setState({ activeConversation: { ...state.activeConversation, order_id: target.order_id } })
          window.dispatchEvent(new CustomEvent('chat:conversation-opened', { detail: { conversation: state.activeConversation } }))
        }
        insertDraftWhenReady(draftText)
        return true
      } catch (error) {
        if (!target.order_id) throw error
      }
    }

    const virtual = virtualConversation(target)
    setState({
      conversations: [virtual, ...state.conversations.filter(item => item.id !== virtual.id)],
      activeId: virtual.id,
      activeConversation: virtual,
      messages: [],
      composerText: '',
      aiSuggestion: null,
      detailTab: 'orders',
      threadOpen: true,
      detailOpen: true
    })
    renderAll()
    window.dispatchEvent(new CustomEvent('chat:conversation-opened', { detail: { conversation: virtual } }))
    insertDraftWhenReady(draftText)
    return true
  } catch (error) {
    showToast(`Không mở được đúng hội thoại theo đơn: ${error.message || error}`, 'error')
    return false
  }
}

