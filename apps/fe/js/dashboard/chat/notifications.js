import { chatApi } from './api.js'
import { showToast } from './toast.js'

const STORAGE_KEY = 'shophuyvan.chat.notifications.enabled'

function notificationButton() {
  return document.querySelector('[data-action="toggle-notifications"]')
}

export function wantsChatNotifications() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function setWantsChatNotifications(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Trình duyệt riêng tư có thể khóa localStorage; công tắc vẫn cập nhật trong phiên hiện tại.
  }
}

export function chatNotificationState() {
  const supported = 'Notification' in window
  const permission = supported ? Notification.permission : 'unsupported'
  const enabled = wantsChatNotifications()
  return {
    supported,
    permission,
    enabled,
    active: supported && enabled && permission === 'granted',
    blocked: supported && permission === 'denied'
  }
}

export function updateNotificationToggle() {
  const button = notificationButton()
  if (!button) return
  const status = chatNotificationState()
  const label = !status.supported
    ? 'Không hỗ trợ'
    : status.blocked
      ? 'Bị chặn'
      : status.active
        ? 'Đang bật'
        : 'Đang tắt'
  button.classList.toggle('is-on', status.active)
  button.classList.toggle('is-blocked', status.blocked || !status.supported)
  button.setAttribute('aria-pressed', status.active ? 'true' : 'false')
  button.setAttribute('title', status.active
    ? 'Tắt thông báo Chat trên trình duyệt này'
    : 'Bật thông báo Chat trên trình duyệt này')
  button.innerHTML = `
    <span class="chat-switch-track" aria-hidden="true"><span class="chat-switch-knob"></span></span>
    <span class="chat-switch-text">Thông báo</span>
    <span class="chat-switch-state">${label}</span>
  `
}

export async function registerChatServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null)
  return navigator.serviceWorker.ready.catch(() => null)
}

function showIosInstallBannerIfNeeded() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)')?.matches
  const banner = document.getElementById('iosInstallBanner')
  if (!banner || !isIos || isStandalone) return
  const dismissedAt = Number(localStorage.getItem('shophuyvan.chat.ios-install-dismissed-at') || 0)
  const sevenDays = 7 * 24 * 3600000
  if (dismissedAt && Date.now() - dismissedAt < sevenDays) return
  banner.hidden = false
}

function requiresStandaloneIosPush() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '')
    && !(window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)')?.matches)
}

function base64UrlToUint8Array(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output
}

function subscriptionPayload(subscription) {
  if (!subscription) return null
  if (typeof subscription.toJSON === 'function') return subscription.toJSON()
  return {
    endpoint: subscription.endpoint,
    keys: {}
  }
}

async function savePushSubscription(registration) {
  if (!registration?.pushManager || !('PushManager' in window)) return { ok: false, skipped: true, reason: 'push_not_supported' }
  const status = await chatApi('/api/chat/notifications/status', { allowBusinessError: true, timeoutMs: 15000 })
  const publicKey = status?.vapid_public_key || ''
  if (!publicKey) return { ok: false, skipped: true, reason: 'missing_vapid_public_key' }
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey)
    })
  }
  return chatApi('/api/chat/notifications/subscribe', {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 20000,
    body: JSON.stringify({ subscription: subscriptionPayload(subscription), test: true })
  })
}

async function disablePushSubscription() {
  const registration = await registerChatServiceWorker()
  const subscription = await registration?.pushManager?.getSubscription?.()
  if (!subscription) return
  await chatApi('/api/chat/notifications/unsubscribe', {
    method: 'POST',
    allowBusinessError: true,
    timeoutMs: 15000,
    body: JSON.stringify({ subscription: subscriptionPayload(subscription) })
  }).catch(() => null)
  await subscription.unsubscribe().catch(() => null)
}

export async function toggleChatNotifications() {
  const current = chatNotificationState()
  if (!current.supported) {
    updateNotificationToggle()
    showToast('Trình duyệt này chưa hỗ trợ thông báo.', 'error')
    return current
  }
  if (current.active) {
    setWantsChatNotifications(false)
    await disablePushSubscription()
    updateNotificationToggle()
    showToast('Đã tắt thông báo Chat trên trình duyệt này.', 'ok')
    return chatNotificationState()
  }
  if (requiresStandaloneIosPush()) {
    setWantsChatNotifications(false)
    updateNotificationToggle()
    showIosInstallBannerIfNeeded()
    showToast('Tren iPhone, hay them Chat vao Man hinh chinh roi mo tu icon de bat thong bao.', 'error')
    return chatNotificationState()
  }
  await registerChatServiceWorker()
  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission().catch(() => Notification.permission)
    : Notification.permission
  if (permission !== 'granted') {
    setWantsChatNotifications(false)
    updateNotificationToggle()
    showToast('Thông báo đang bị chặn. Mở cài đặt trình duyệt cho trang này rồi cho phép thông báo.', 'error')
    return chatNotificationState()
  }
  setWantsChatNotifications(true)
  updateNotificationToggle()
  const registration = await registerChatServiceWorker()
  const pushResult = await savePushSubscription(registration).catch(error => ({
    ok: false,
    error_message: error?.message || String(error)
  }))
  await registration?.showNotification?.('ShopHuyVan Chat đã bật thông báo', {
    body: 'Khi Chat nhận tin khách mới, trình duyệt sẽ hiện thông báo.',
    tag: 'chat-notification-enabled',
    icon: '/icons/shophuyvan-icon.svg',
    badge: '/icons/shophuyvan-icon.svg',
    data: { type: 'chat', url: '/pages/chat-cskh.html' }
  })
  if (pushResult?.ok && pushResult?.test_push?.ok !== false) showToast('Đã bật thông báo Chat và đăng ký đẩy nền cho trình duyệt này.', 'ok')
  else if (pushResult?.ok) showToast(`Đã lưu thiết bị nhưng test push lỗi: ${pushResult?.test_push?.error || 'push_failed'}.`, 'error')
  else showToast('Đã bật thông báo khi trang Chat đang mở. Trình duyệt này chưa đăng ký được đẩy nền.', 'ok')
  return chatNotificationState()
}

export function shouldShowChatNotification() {
  const status = chatNotificationState()
  return status.active
}

export async function prepareChatNotifications() {
  updateNotificationToggle()
  showIosInstallBannerIfNeeded()
  if (shouldShowChatNotification()) await registerChatServiceWorker()
}
