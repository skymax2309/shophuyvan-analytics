const API = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const CHAT_URL = '/pages/chat-cskh.html'
const ORDER_URL = '/pages/oms-dashboard.html'
const recentNoticeTags = new Map()

function cleanText(value) {
  return String(value ?? '').trim()
}

function noticeKey(notice) {
  const data = notice?.options?.data || {}
  return cleanText(notice?.options?.tag || data.dedupe_key || `${notice?.title}|${notice?.options?.body}`)
}

function shouldSkipRecentNotice(notice) {
  const key = noticeKey(notice)
  if (!key) return false
  const now = Date.now()
  const previous = Number(recentNoticeTags.get(key) || 0)
  recentNoticeTags.set(key, now)
  for (const [itemKey, timestamp] of recentNoticeTags.entries()) {
    if (now - Number(timestamp || 0) > 10 * 60 * 1000) recentNoticeTags.delete(itemKey)
  }
  return previous && now - previous < 10 * 60 * 1000
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

function notificationFromEvent(item) {
  const event = item || {}
  const data = {
    ...(event.data && typeof event.data === 'object' ? event.data : {}),
    type: event.type || event.data?.type || 'chat',
    url: event.url || event.data?.url || (event.type === 'order' ? ORDER_URL : CHAT_URL)
  }
  const channel = event.channel_label || data.channel_label || event.channel || data.channel || ''
  const sender = event.sender_name || data.sender_name || event.customer_name || data.customer_name || ''
  const title = event.title || [channel, sender].filter(Boolean).join(' · ')
  const body = event.body || event.message_text || data.message_text
  return {
    title: title || (data.type === 'order' ? 'Cập nhật đơn hàng OMS' : 'Tin nhắn mới trên Chat/CSKH'),
    options: {
      body: body || (data.type === 'order' ? 'Có đơn hàng cần xử lý.' : 'Bạn có tin nhắn mới từ khách hàng.'),
      tag: event.tag || `shv-${data.type || 'notice'}-${event.id || Date.now()}`,
      renotify: false,
      badge: '/icons/shophuyvan-icon.svg',
      icon: '/icons/shophuyvan-icon.svg',
      data
    }
  }
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let notice = null
    try {
      const payload = event.data?.json?.()
      if (payload?.title || payload?.body || payload?.type) notice = notificationFromEvent(payload)
    } catch {}
    if (!notice || shouldSkipRecentNotice(notice)) return

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach(client => {
      client.postMessage({
        type: notice.options?.data?.type === 'order' ? 'order-push' : 'chat-push',
        data: notice.options?.data || {}
      })
    })
    await self.registration.showNotification(notice.title, notice.options)
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || CHAT_URL
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const target = new URL(targetUrl, self.location.origin)
    const existing = allClients.find(client => client.url.includes(target.pathname))
    if (existing) {
      await existing.focus()
      if (event.notification?.data?.type === 'order') {
        existing.postMessage({
          type: 'open-order',
          order_id: event.notification?.data?.order_id || '',
          order_ids: event.notification?.data?.order_ids || []
        })
      } else {
        existing.postMessage({
          type: 'open-chat',
          conversation_id: event.notification?.data?.conversation_id || '',
          id: event.notification?.data?.id || ''
        })
      }
      return
    }
    await self.clients.openWindow(targetUrl)
  })())
})
