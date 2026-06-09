self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  event.waitUntil(Promise.resolve().then(() => {
    const channel = data.channel_label || data.channel || ''
    const sender = data.sender_name || data.customer_name || ''
    const title = data.title || [channel, sender].filter(Boolean).join(' · ') || 'Shop Huy Vân Chat'
    const conversationId = data.conversation_id || ''
    const url = data.url || (conversationId
      ? `/pages/chat-cskh.html?conversation_id=${encodeURIComponent(conversationId)}`
      : '/pages/chat-cskh.html')
    return self.registration.showNotification(title, {
      body: data.body || data.message_text || 'Bạn có tin nhắn mới từ khách hàng.',
      icon: '/icons/shophuyvan-icon.svg',
      badge: '/icons/shophuyvan-icon.svg',
      tag: data.tag || conversationId || 'chat-notification',
      renotify: true,
      data: { ...data, url, conversation_id: conversationId, type: data.type || 'chat' }
    })
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/pages/chat-cskh.html'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) return client.focus()
        }
        if (clients.openWindow) return clients.openWindow(url)
        return null
      })
  )
})

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(clients.claim()))
