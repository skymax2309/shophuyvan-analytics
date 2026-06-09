import { DEFAULT_AI_LEARNING_NOTES, DEFAULT_RESTRICTED_KEYWORDS } from './ai-defaults.js?v=chat-auto-send-20260603a'

export const state = {
  conversations: [],
  messages: [],
  activeId: '',
  activeConversation: null,
  filter: 'all',
  search: '',
  detailTab: 'orders',
  loading: true,
  sending: false,
  threadOpen: false,
  detailOpen: false,
  composerText: '',
  composerMeta: null,
  composerPolicyWarning: null,
  emojiPickerOpen: false,
  aiSettings: {
    ai_provider: 'gemini',
    ai_status: 'unconfigured',
    ai_model: 'gemini-2.5-flash',
    ai_answer_style: 'policy_friendly',
    auto_reply_minutes: 5,
    ai_learning_notes: DEFAULT_AI_LEARNING_NOTES,
    restricted_keywords: DEFAULT_RESTRICTED_KEYWORDS,
    gemini_api_key_count: 0,
    automation_browser_preset: 'compact',
    automation_browser_width: 620,
    automation_browser_height: 480,
    automation_browser_left: 0,
    automation_browser_top: 0,
    automation_browser_hidden: false,
    allow_auto_send: false,
    require_safety_check: true,
    write_internal_note: false
  },
  realtime: { status: 'idle', retry: 0 },
  aiSuggestion: null,
  aiAutoSend: null,
  diagnostics: new Map(),
  context: {
    loading: false,
    error: '',
    orders: [],
    products: [],
    productSearch: '',
    productLoading: false,
    voucher: null
  },
  syncBusy: false,
  virtual: { start: 0, end: 0 }
}

export function setState(patch = {}) {
  Object.assign(state, patch)
  return state
}

export function channelColorClass(channel = '') {
  const value = String(channel || 'internal').toLowerCase()
  if (['shopee', 'lazada', 'tiktok', 'facebook', 'zalo'].includes(value)) return `ch-${value}`
  return 'ch-internal'
}

export function healthTone(health = '') {
  if (health === 'ok') return 'ok'
  if (health === 'stale') return 'warn'
  if (health === 'critical') return 'danger'
  return ''
}

export function createTempId(prefix = 'tmp') {
  const random = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}_${random}`
}

function messageKey(message = {}) {
  if (message.platform_message_id) return `platform:${message.channel}:${message.shop_id}:${message.platform_message_id}`
  if (message.client_temp_id) return `client:${message.channel}:${message.shop_id}:${message.client_temp_id}`
  return `id:${message.id}`
}

export function mergeMessages(current = [], incoming = []) {
  const list = [...current]
  const byKey = new Map(list.map(item => [messageKey(item), item]))
  for (const raw of incoming) {
    const platformKey = raw.platform_message_id ? `platform:${raw.channel}:${raw.shop_id}:${raw.platform_message_id}` : ''
    const clientKey = raw.client_temp_id ? `client:${raw.channel}:${raw.shop_id}:${raw.client_temp_id}` : ''
    const existing = (platformKey && byKey.get(platformKey)) || (clientKey && byKey.get(clientKey)) || byKey.get(messageKey(raw))
    if (existing) {
      const merged = {
        ...existing,
        ...raw,
        id: existing.id || raw.id,
        client_temp_id: raw.client_temp_id || existing.client_temp_id,
        platform_message_id: raw.platform_message_id || existing.platform_message_id,
        created_at: existing.created_at || raw.created_at
      }
      const index = list.findIndex(item => item.id === existing.id)
      if (index >= 0) list[index] = merged
      byKey.set(messageKey(merged), merged)
    } else {
      list.push(raw)
      byKey.set(messageKey(raw), raw)
    }
  }
  return list.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

export function activeCanWrite(conversation = state.activeConversation) {
  const send = String(conversation?.send_capability || '').toLowerCase()
  if (isSocialLocalBridge(conversation)) return true
  return send === 'official_api' || send === 'bridge' || send === 'manual_only'
}

export function isSocialLocalBridge(conversation = state.activeConversation) {
  const channel = String(conversation?.channel || '').toLowerCase()
  const sync = String(conversation?.sync_capability || '').toLowerCase()
  return channel === 'zalo' && sync === 'browser_helper'
}

export function isManualOnly(conversation = state.activeConversation) {
  if (isSocialLocalBridge(conversation)) return false
  return String(conversation?.send_capability || '').toLowerCase() === 'manual_only'
}

export function optimisticMessage(text, attachments = []) {
  const conversation = state.activeConversation
  const now = new Date().toISOString()
  return {
    id: createTempId('msg'),
    channel: conversation.channel,
    shop_id: conversation.shop_id,
    conversation_id: conversation.id,
    customer_id: conversation.customer_id,
    sender_type: 'shop',
    sender_name: 'Shop',
    text,
    attachments,
    status: isManualOnly(conversation) ? 'manual_pending' : 'sending',
    client_temp_id: createTempId('client'),
    platform_message_id: '',
    created_at: now,
    updated_at: now,
    source: 'frontend_optimistic'
  }
}

