// NEO: Route khóa Chat legacy trên Worker chính. Chat/CSKH mới chạy ở apps/chat-worker-api.
import { ensureProductKnowledgeTables, saveProductKnowledgeBatch } from '../../core/products/product-knowledge-core.js'
import { orderStatusLabel as orderStatusLabelVi } from '../../core/orders/status-core.js'
import { handleShopeeChatBridge } from './shopee-bridge.js'
import { handleLazadaChatBridge } from './lazada-bridge.js'

const DEFAULT_CHAT_WORKER_API_BASE = 'https://shophuyvan-chat-api.zacha030596.workers.dev'

function json(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors
    }
  })
}

function disabledLegacyChatRoute(cors) {
  return json({
    status: 'gone',
    ok: false,
    error: 'legacy_chat_route_disabled',
    error_code: 'legacy_chat_route_disabled',
    message: 'Route Chat legacy trên Worker chính đã tắt. Chat/CSKH mới dùng Worker shophuyvan-chat-api và Core API /api/core/*.'
  }, cors, 410)
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function capitalizeLabel(value) {
  const text = cleanText(value)
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

function uniqueOrderRows(rows = []) {
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    const orderId = cleanText(row?.order_id)
    if (!orderId) continue
    map.set(orderId, row)
  }
  return [...map.values()]
}

function orderStatusLabel(row = {}) {
  const directLabel = cleanText(row.display_status_vi || row.status_label_vi || row.status_vi)
  if (directLabel) return directLabel
  const status = row.shipping_status || row.marketplace_status || row.status || row.fulfillment_status_core || row.oms_status || row.order_type || ''
  return capitalizeLabel(orderStatusLabelVi(status, 'Có cập nhật'))
}

function summarizeOrderPush(rows = [], reason = '') {
  const items = uniqueOrderRows(rows)
  const ids = items.map(row => cleanText(row.order_id)).filter(Boolean)
  const first = items[0] || {}
  const firstId = cleanText(first.order_id)
  const firstShop = cleanText(first.shop)
  const firstStatus = orderStatusLabel(first)
  const reasonKey = cleanText(reason).toLowerCase()
  const isNewOrder = reasonKey === 'new'
  const title = items.length > 1
    ? `OMS · ${items.length} đơn hàng`
    : `OMS · Đơn ${firstId || 'mới'}`
  const bodyBase = items.length > 1
    ? (isNewOrder ? `${items.length} đơn mới vừa vào hệ thống` : `${items.length} đơn vừa cập nhật trạng thái`)
    : (isNewOrder ? `${firstStatus} · có đơn mới` : firstStatus)
  const body = [bodyBase, firstShop && `shop ${firstShop}`].filter(Boolean).join(' · ')
  return {
    ids,
    firstId,
    payload: {
      type: 'order',
      title,
      body,
      channel: 'oms',
      channel_label: 'OMS',
      order_id: firstId,
      order_ids: ids,
      status: firstStatus,
      shop: firstShop,
      url: '/pages/oms-dashboard.html',
      tag: `oms-order-${reasonKey || 'changed'}-${ids.slice(0, 8).join('-') || Date.now()}`
    }
  }
}
function chatWorkerApiBase(env) {
  return cleanText(
    env?.SHOPHUYVAN_CHAT_API_BASE ||
    env?.CHAT_WORKER_API_BASE ||
    env?.CHAT_API_BASE ||
    DEFAULT_CHAT_WORKER_API_BASE
  ).replace(/\/+$/, '')
}

async function postOrderPushToChatWorker(env, payload = {}) {
  const base = chatWorkerApiBase(env)
  if (!base) return { ok: false, error: 'missing_chat_worker_api_base' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('order_push_timeout'), 15000)
  try {
    const response = await fetch(`${base}/api/chat/notifications/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
      signal: controller.signal
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: cleanText(data?.error_message || data?.message || data?.error || `http_${response.status}`)
      }
    }
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: cleanText(error?.message || error) || 'order_push_request_failed' }
  } finally {
    clearTimeout(timer)
  }
}

export { ensureProductKnowledgeTables, saveProductKnowledgeBatch }

export async function ensureChatTables() {
  return { disabled: true, reason: 'legacy_chat_tables_disabled' }
}

export async function notifyOrderSubscribers(env, rows = [], options = {}) {
  const items = uniqueOrderRows(rows)
  const total = items.length
  if (!total) return { sent: 0, total: 0, notified: 0, skipped: true, reason: 'no_order_rows' }
  if (options?.deliver_now === false) {
    return { sent: 0, total, notified: 0, skipped: true, reason: 'deliver_now_disabled' }
  }

  const summary = summarizeOrderPush(items, options?.reason || '')
  const pushed = await postOrderPushToChatWorker(env, summary.payload)
  if (!pushed.ok) {
    return {
      sent: 0,
      total,
      notified: 0,
      skipped: false,
      error: pushed.error || 'order_push_failed'
    }
  }

  const sent = Number(pushed?.data?.sent || 0) || 0
  const failed = Number(pushed?.data?.failed || 0) || 0
  return {
    sent,
    failed,
    total,
    notified: sent,
    skipped: false,
    channel: 'chat_worker_push',
    order_ids: summary.ids.slice(0, 20)
  }
}

export async function notifyChatSubscribers() {
  return { sent: 0, total: 0, skipped: true, disabled: true, reason: 'legacy_chat_notifications_disabled' }
}

export async function runChatAiAutoReplyBatch() {
  return { mode: 'disabled', processed: 0, disabled: true, reason: 'legacy_chat_auto_reply_disabled' }
}

export function extractChatMessageFromWebhook() {
  return null
}

export async function recordChatWebhook() {
  return { inserted: false, skipped: true, disabled: true, reason: 'legacy_chat_webhook_disabled' }
}

export async function handleChat(request, env, cors = {}) {
  const url = new URL(request.url)
  if (url.pathname === '/api/internal/chat-bridge/shopee' || url.pathname.startsWith('/api/internal/chat-bridge/shopee/')) {
    return handleShopeeChatBridge(request, env, cors)
  }
  if (url.pathname === '/api/internal/chat-bridge/lazada' || url.pathname.startsWith('/api/internal/chat-bridge/lazada/')) {
    return handleLazadaChatBridge(request, env, cors)
  }
  if (url.pathname === '/api/chat' || url.pathname.startsWith('/api/chat/')) return disabledLegacyChatRoute(cors)
  return json({ error: 'chat_route_not_found' }, cors, 404)
}

