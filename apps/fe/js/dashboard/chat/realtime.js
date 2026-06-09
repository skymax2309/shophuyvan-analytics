import { chatApiBase } from './api.js'
import { loadConversations, mergeRealtimeMessage } from './data.js?v=chat-auto-send-20260603a'
import { setState, state } from './state.js?v=chat-auto-send-20260603a'
import { renderAll } from './render.js?v=chat-auto-send-20260603a'

let socket = null
let reconnectTimer = null
let fallbackPollTimer = null
let activeShop = ''
let socketGeneration = 0

function wsUrl(shopId) {
  const base = chatApiBase().replace(/^http/, 'ws')
  return `${base}/api/chat/realtime/connect?shop_id=${encodeURIComponent(shopId)}`
}

export function connectRealtime(shopId) {
  if (!shopId) return
  if (shopId === activeShop && socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) return
  activeShop = shopId
  const generation = ++socketGeneration
  if (socket) socket.close()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  setState({ realtime: { status: 'connecting', retry: state.realtime.retry || 0 } })
  renderAll()

  socket = new WebSocket(wsUrl(shopId))
  socket.addEventListener('open', () => {
    stopFallbackPolling()
    setState({ realtime: { status: 'online', retry: 0 } })
    renderAll()
  })
  socket.addEventListener('message', event => {
    const payload = JSON.parse(event.data || '{}')
    if (payload.type === 'message' || payload.type === 'message_replay') mergeRealtimeMessage(payload.message)
    if (payload.type === 'ping') loadConversations({ keepActive: true }).catch(() => {})
  })
  socket.addEventListener('close', () => scheduleReconnect(generation))
  socket.addEventListener('error', () => scheduleReconnect(generation))
}

function scheduleReconnect(generation) {
  if (generation !== socketGeneration) return
  if (!activeShop) return
  const retry = Math.min((state.realtime.retry || 0) + 1, 6)
  const delay = Math.min(2000 * (2 ** (retry - 1)), 30000)
  setState({ realtime: { status: 'offline', retry } })
  renderAll()
  if (retry >= 3) startFallbackPolling()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => connectRealtime(activeShop), delay)
}

function startFallbackPolling() {
  if (fallbackPollTimer) return
  fallbackPollTimer = setInterval(() => {
    loadConversations({ keepActive: true, notify: true }).catch(() => {})
  }, 15000)
}

function stopFallbackPolling() {
  if (fallbackPollTimer) clearInterval(fallbackPollTimer)
  fallbackPollTimer = null
}

