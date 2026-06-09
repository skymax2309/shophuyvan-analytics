import { cleanText, nowIso } from '../core/message-normalize.js'
import { sendJson } from '../routes/settings.js'

const QUEUE_TTL_MS = 5 * 60 * 1000
const QUEUE_LIMIT = 50
const HEARTBEAT_MS = 15000

function roomIdForShop(value) {
  return cleanText(value || 'unknown-shop') || 'unknown-shop'
}

function readRealtimeToken(request) {
  const url = new URL(request.url)
  const auth = cleanText(request.headers.get('Authorization'))
  if (auth.toLowerCase().startsWith('bearer ')) return cleanText(auth.slice(7))
  return cleanText(request.headers.get('X-Chat-Realtime-Token') || url.searchParams.get('token'))
}

function canAccessRealtimeRoom(request, env = {}) {
  const required = cleanText(env.CHAT_REALTIME_ACCESS_TOKEN)
  if (!required) return true
  return readRealtimeToken(request) === required
}

function safeSend(ws, payload) {
  try {
    ws.send(payload)
    return true
  } catch {
    return false
  }
}

export class ChatRealtimeRoom {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sessions = new Map()
    this.queue = []
  }

  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const body = await request.json().catch(() => ({}))
      return sendJson(await this.broadcast(body))
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return sendJson({ ok: false, error_code: 'websocket_upgrade_required' }, 426)
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    const sessionId = crypto.randomUUID()
    server.accept()
    this.sessions.set(sessionId, server)
    await this.ensureHeartbeat()

    server.addEventListener('close', () => this.sessions.delete(sessionId))
    server.addEventListener('error', () => this.sessions.delete(sessionId))
    server.addEventListener('message', event => {
      const data = String(event.data || '')
      if (data.includes('"type":"ack"')) {
        safeSend(server, JSON.stringify({ type: 'ack_received', ts: Date.now() }))
      }
    })

    safeSend(server, JSON.stringify({ type: 'connected', ts: Date.now() }))
    this.replayQueue(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  cleanupQueue() {
    const freshAfter = Date.now() - QUEUE_TTL_MS
    this.queue = this.queue.filter(item => Number(item.ts || 0) >= freshAfter).slice(-QUEUE_LIMIT)
  }

  enqueue(message) {
    this.cleanupQueue()
    this.queue.push({
      id: cleanText(message?.id || message?.platform_message_id) || crypto.randomUUID(),
      ts: Date.now(),
      message
    })
    this.queue = this.queue.slice(-QUEUE_LIMIT)
  }

  // Gửi lại các tin gần nhất cho client mới nối lại để giảm mất tin realtime.
  replayQueue(ws) {
    this.cleanupQueue()
    for (const item of this.queue) {
      safeSend(ws, JSON.stringify({ type: 'message_replay', message: item.message, ts: item.ts, replay: true }))
    }
  }

  async broadcast(message) {
    const payload = JSON.stringify({ type: 'message', message, ts: Date.now() })
    this.enqueue(message)
    let delivered = 0
    for (const [sessionId, ws] of this.sessions.entries()) {
      if (safeSend(ws, payload)) delivered += 1
      else this.sessions.delete(sessionId)
    }
    await this.ensureHeartbeat()
    return { ok: true, delivered, active_connections: this.sessions.size }
  }

  async alarm() {
    const payload = JSON.stringify({ type: 'ping', ts: Date.now() })
    this.cleanupQueue()
    for (const [sessionId, ws] of this.sessions.entries()) {
      if (!safeSend(ws, payload)) this.sessions.delete(sessionId)
    }
    if (this.sessions.size > 0) await this.ensureHeartbeat()
  }

  async ensureHeartbeat() {
    if (this.sessions.size > 0) {
      await this.state.storage.setAlarm(Date.now() + HEARTBEAT_MS)
    }
  }
}

export async function handleRealtimeConnectRoute(request, env) {
  const url = new URL(request.url)
  const shopId = roomIdForShop(url.searchParams.get('shop_id'))
  if (!shopId || shopId === 'unknown-shop') {
    return sendJson({ ok: false, error_code: 'shop_id_required', error_message: 'Thiếu shop_id để mở realtime.' }, 400)
  }
  if (!canAccessRealtimeRoom(request, env)) {
    return sendJson({ ok: false, error_code: 'realtime_auth_failed', error_message: 'Bạn chưa có quyền mở realtime shop này.' }, 401)
  }
  if (!env?.CHAT_REALTIME) {
    return sendJson({ ok: false, error_code: 'chat_realtime_not_configured', error_message: 'Realtime chưa được cấu hình Durable Object.' }, 503)
  }
  const id = env.CHAT_REALTIME.idFromName(shopId)
  return env.CHAT_REALTIME.get(id).fetch(request)
}

export async function broadcastToWebSocket(env, message = {}) {
  const shopId = roomIdForShop(message.shop_id || message.shop)
  if (!env?.CHAT_REALTIME) {
    return { ok: false, error_code: 'chat_realtime_not_configured' }
  }
  const id = env.CHAT_REALTIME.idFromName(shopId)
  const stub = env.CHAT_REALTIME.get(id)
  const response = await stub.fetch('https://chat-realtime-room/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...message, realtime_sent_at: nowIso() })
  })
  return response.json().catch(() => ({ ok: response.ok }))
}
