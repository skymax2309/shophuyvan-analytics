import { API } from '../oms-dashboard/oms-api.js';
import { showToast } from '../utils/helpers.js';

const SETTINGS_KEY = `oms_notify_settings:${API}`;
const SNAPSHOT_KEY = `oms_notify_snapshot:${API}`;
const NOTIFIED_KEY = `oms_notify_sent_keys:${API}`;
const POLL_MS = 5000;
const RECENT_LIMIT = 120;
const NOTIFIED_LIMIT = 500;

const DEFAULT_SETTINGS = {
  enabled: true,
  soundEnabled: true,
  browserEnabled: true,
  volume: 0.65
};

const CHAT_PUSH_API = (window.SHOPHUYVAN_CHAT_API_BASE || 'https://shophuyvan-chat-api.zacha030596.workers.dev').replace(/\/+$/, '');

let settings = loadSettings();
let audioContext = null;
let checkTimer = null;
let checking = false;
let refreshCurrentView = null;
let notifiedKeys = new Set(readJson(NOTIFIED_KEY, []));

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
}

function saveSettings() {
  writeJson(SETTINGS_KEY, settings);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeOrder(order) {
  const id = cleanText(order.order_id);
  const row = {
    id,
    status: cleanText(order.oms_status),
    shipping: cleanText(order.shipping_status || order.status),
    displayStatusVi: cleanText(order.display_status_vi || order.status_label_vi),
    statusLabelVi: cleanText(order.status_label_vi || order.display_status_vi),
    tracking: cleanText(order.tracking_number),
    carrier: cleanText(order.shipping_carrier),
    type: cleanText(order.order_type),
    platform: cleanText(order.platform),
    shop: cleanText(order.shop),
    orderDate: cleanText(order.order_date),
    fee: Number(order.fee || 0),
    profit: Number(order.profit_real || 0),
    revenue: Number(order.revenue || 0),
    seenAt: Date.now()
  };
  row.signature = [
    row.status,
    row.shipping,
    row.displayStatusVi,
    row.statusLabelVi,
    row.tracking,
    row.carrier,
    row.type
  ].join('|');
  return row;
}

function labelStatus(row) {
  return row.displayStatusVi || row.statusLabelVi || row.shipping || row.status || 'Chưa rõ';
}

function orderStatusLabel(row) {
  const directLabel = cleanText(row.displayStatusVi || row.statusLabelVi);
  if (directLabel) return directLabel;
  const raw = cleanText(row.shipping || row.status || row.type);
  const key = raw.toUpperCase();
  const labels = {
    UNPAID: 'Chưa thanh toán',
    PENDING: 'Chờ xử lý',
    READY_TO_SHIP: 'Chờ chuẩn bị hàng',
    PROCESSED: 'Đã xử lý',
    LOGISTICS_PENDING_ARRANGE: 'Chờ lấy hàng',
    LOGISTICS_REQUEST_CREATED: 'Đã tạo vận đơn',
    LOGISTICS_PACKAGED: 'Đã đóng gói',
    SHIPPING: 'Đang giao',
    SHIPPED: 'Đang giao',
    TO_CONFIRM_RECEIVE: 'Chờ khách nhận',
    COMPLETED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy',
    IN_CANCEL: 'Đang hủy',
    TO_RETURN: 'Trả hàng/hoàn tiền',
    RETURN: 'Trả hàng/hoàn tiền',
    RETURN_REFUND: 'Trả hàng/hoàn tiền',
    LOGISTICS_IN_RETURN: 'Đang hoàn hàng',
    LOGISTICS_RETURNED_BY_SHIPPER: 'Đơn hoàn về shop',
    LOGISTICS_RETURN_PACKAGE_RECEIVED: 'Shop đã nhận hàng hoàn',
    LOGISTICS_LOST: 'Thất lạc hàng',
    FAILED_DELIVERY: 'Giao không thành công'
  };
  return labels[key] || raw || 'Chưa rõ trạng thái';
}

function orderChangeKind(row, previous = null) {
  const text = [
    previous ? 'changed' : 'new',
    row.type,
    row.status,
    row.shipping
  ].map(cleanText).join(' ').toUpperCase();
  if (!previous) return 'new';
  if (text.includes('FAILED_DELIVERY')) return 'failed';
  if (text.includes('RETURN') || text.includes('REFUND') || text.includes('TO_RETURN')) return 'return';
  if (text.includes('CANCEL')) return 'cancelled';
  if (text.includes('COMPLETED')) return 'completed';
  if (text.includes('SHIPPING') || text.includes('SHIPPED') || text.includes('TO_CONFIRM_RECEIVE')) return 'shipping';
  return 'changed';
}

function orderKindLabel(kind) {
  return {
    new: 'đơn mới',
    failed: 'giao không thành công',
    return: 'trả hàng/hoàn tiền',
    cancelled: 'đơn hủy',
    completed: 'hoàn thành',
    shipping: 'đang giao',
    changed: 'cập nhật trạng thái'
  }[kind] || 'cập nhật trạng thái';
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}

function orderChangeLine(change) {
  const row = change.current || change;
  const kind = orderKindLabel(change.kind || orderChangeKind(row, change.previous));
  const previousStatus = change.previous ? orderStatusLabel(change.previous) : '';
  const status = orderStatusLabel(row);
  const statusPart = previousStatus && previousStatus !== status
    ? `${previousStatus} -> ${status}`
    : status;
  return [
    `${row.id}: ${kind}`,
    statusPart,
    row.shop && `shop ${row.shop}`,
    row.carrier,
    row.tracking && `MVD ${row.tracking}`,
    formatMoney(row.revenue)
  ].filter(Boolean).join(' - ');
}

function loadSnapshot() {
  const snapshot = readJson(SNAPSHOT_KEY, null);
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

function saveSnapshot(rows, previous = {}) {
  const merged = { ...previous };
  for (const row of rows) merged[row.id] = row;

  const next = Object.fromEntries(
    Object.entries(merged)
      .sort((a, b) => (b[1].seenAt || 0) - (a[1].seenAt || 0))
      .slice(0, 500)
  );
  writeJson(SNAPSHOT_KEY, next);
}

function saveNotifiedKeys() {
  const keys = [...notifiedKeys].slice(-NOTIFIED_LIMIT);
  notifiedKeys = new Set(keys);
  writeJson(NOTIFIED_KEY, keys);
}

async function fetchRecentOrders() {
  const params = new URLSearchParams({
    limit: String(RECENT_LIMIT)
  });
  const response = await fetch(`${API}/api/orders/changes?${params.toString()}`, {
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Không tải được dữ liệu đơn mới');
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor();
  return audioContext;
}

async function playNotificationSound(kind = 'change') {
  if (!settings.enabled || !settings.soundEnabled || settings.volume <= 0) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') await ctx.resume();

  const start = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0.001, settings.volume * 0.12), start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
  gain.connect(ctx.destination);

  const notes = kind === 'new' ? [880, 1175] : [660, 990];
  notes.forEach((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start + index * 0.16);
    osc.connect(gain);
    osc.start(start + index * 0.16);
    osc.stop(start + index * 0.16 + 0.18);
  });
  return true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function isStandaloneMode() {
  return window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)')?.matches;
}

function requiresStandaloneIosPush() {
  return isIosDevice() && !isStandaloneMode();
}

function base64UrlToUint8Array(value) {
  const padded = String(value || '') + '='.repeat((4 - (String(value || '').length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

function subscriptionPayload(subscription) {
  if (!subscription) return null;
  if (typeof subscription.toJSON === 'function') return subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: {} };
}

async function chatPushApi(path, options = {}) {
  const response = await fetch(`${CHAT_PUSH_API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(cleanText(data.error_message || data.message || data.error || `http_${response.status}`));
  }
  return data;
}

async function requestBrowserPermission({ prompt = false } = {}) {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  if (!prompt) return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function registerOmsServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function serviceWorkerRegistration() {
  return registerOmsServiceWorker();
}

async function ensureOmsPushSubscription({ test = false } = {}) {
  if (!('PushManager' in window)) return { ok: false, skipped: true, reason: 'push_not_supported' };
  const registration = await registerOmsServiceWorker();
  if (!registration?.pushManager) return { ok: false, skipped: true, reason: 'service_worker_not_ready' };
  const status = await chatPushApi('/api/chat/notifications/status');
  const publicKey = cleanText(status?.vapid_public_key);
  if (!publicKey) return { ok: false, skipped: true, reason: 'missing_vapid_public_key' };
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey)
    });
  }
  const payload = subscriptionPayload(subscription);
  const result = await chatPushApi('/api/chat/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: payload, test })
  });
  return { ...result, subscription: payload };
}

async function disableOmsPushSubscription() {
  const registration = await registerOmsServiceWorker();
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) return { ok: true, disabled: 0 };
  await chatPushApi('/api/chat/notifications/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: subscriptionPayload(subscription) })
  }).catch(() => null);
  await subscription.unsubscribe().catch(() => null);
  return { ok: true, disabled: 1 };
}

async function sendOmsPushTest(subscription = null) {
  const payload = {
    type: 'order',
    title: 'OMS · Thu thong bao don hang',
    body: 'Kiem tra thong bao ngoai man hinh cho thiet bi nay.',
    channel: 'oms',
    channel_label: 'OMS',
    order_id: 'TEST',
    order_ids: ['TEST'],
    url: '/pages/oms-dashboard.html',
    tag: `oms-order-test-${Date.now()}`
  };
  return chatPushApi('/api/chat/notifications/test', {
    method: 'POST',
    body: JSON.stringify(subscription?.endpoint ? { subscription, payload } : { payload })
  });
}

async function sendBrowserNotification(title, body) {
  if (!settings.enabled || !settings.browserEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const options = {
      body,
      tag: `oms-order-change-${simpleHash(`${title}|${body}`)}`,
      renotify: false,
      silent: true,
      badge: '/icons/shophuyvan-icon.svg',
      icon: '/icons/shophuyvan-icon.svg',
      data: { type: 'order', url: '/pages/oms-dashboard.html' }
    };
    const registration = await serviceWorkerRegistration();
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch {}
}

function legacySummarizeChanges(newOrders, changedOrders) {
  const parts = [];
  if (newOrders.length) parts.push(`${newOrders.length} đơn mới`);
  if (changedOrders.length) parts.push(`${changedOrders.length} đơn đổi trạng thái`);

  const sample = [...newOrders, ...changedOrders.map(c => c.current)].slice(0, 3);
  const detail = sample.map(row => `${row.id} (${labelStatus(row)})`).join(', ');
  return {
    title: parts.join(' và '),
    body: detail ? `Mẫu: ${detail}` : 'Dashboard có dữ liệu đơn hàng mới.'
  };
}

function simpleHash(value) {
  let hash = 0;
  const input = String(value ?? '').trim();
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function changeNotifyKey(newOrders, changedOrders) {
  return [...newOrders, ...changedOrders.map(change => change.current)]
    .map(row => `${row.id}:${row.signature}`)
    .sort()
    .join('|');
}

function summarizeChanges(newOrders, changedOrders) {
  const changes = [
    ...newOrders.map(row => ({ current: row, kind: 'new' })),
    ...changedOrders.map(change => ({
      ...change,
      kind: orderChangeKind(change.current, change.previous)
    }))
  ];
  const counts = {};
  changes.forEach(change => {
    counts[change.kind] = (counts[change.kind] || 0) + 1;
  });
  const countText = ['new', 'failed', 'return', 'cancelled', 'shipping', 'completed', 'changed']
    .filter(kind => counts[kind])
    .map(kind => `${counts[kind]} ${orderKindLabel(kind)}`)
    .join(', ');
  const sample = changes.slice(0, 4).map(orderChangeLine).join('; ');
  const more = changes.length > 4 ? `; còn ${changes.length - 4} đơn khác` : '';
  return {
    title: `OMS: ${changes.length} đơn hàng - ${countText || 'có cập nhật'}`,
    body: [`Tổng cập nhật: ${changes.length} đơn`, sample && `${sample}${more}`].filter(Boolean).join('. ')
  };
}

function notifyChanges(newOrders, changedOrders) {
  if (!settings.enabled) return;
  const key = changeNotifyKey(newOrders, changedOrders);
  if (!key || notifiedKeys.has(key)) return;
  notifiedKeys.add(key);
  saveNotifiedKeys();
  const summary = summarizeChanges(newOrders, changedOrders);
  window.__omsRealtimeUpdatedIds = [...newOrders, ...changedOrders.map(c => c.current)].map(row => row.id);
  window.__omsRealtimeUpdatedAt = Date.now();
  showToast(`${summary.title}. ${summary.body}`, 8000);
  sendBrowserNotification(summary.title, summary.body).catch(() => {});
  playNotificationSound(newOrders.length ? 'new' : 'change').catch(() => {});
  if (document.visibilityState === 'visible' && typeof refreshCurrentView === 'function') {
    refreshCurrentView();
  }
}

export async function checkOrderNotifications({ silent = false } = {}) {
  if (checking) return;
  checking = true;
  try {
    const rows = (await fetchRecentOrders()).map(normalizeOrder).filter(row => row.id);
    const previous = loadSnapshot();

    if (!previous) {
      saveSnapshot(rows);
      return;
    }

    const newOrders = [];
    const changedOrders = [];
    for (const row of rows) {
      const old = previous[row.id];
      if (!old) {
        newOrders.push(row);
      } else if (old.signature !== row.signature) {
        changedOrders.push({ previous: old, current: row });
      }
    }

    saveSnapshot(rows, previous);
    if (!silent && (newOrders.length || changedOrders.length)) {
      notifyChanges(newOrders, changedOrders);
    }
  } catch (error) {
    console.warn('[OMS_NOTIFY]', error);
  } finally {
    checking = false;
  }
}

function audioStateText() {
  if (!settings.enabled) return 'Tắt thông báo';
  if (!settings.soundEnabled || settings.volume <= 0) return 'Âm thanh tắt';
  if (audioContext?.state === 'running') return 'Âm thanh bật';
  return 'Chạm để bật âm';
}

function renderControls() {
  const host = document.getElementById('notifyControls');
  if (!host) return;

  host.innerHTML = `
    <button type="button" class="notify-toggle ${settings.enabled ? 'is-on' : ''}" id="notifyToggle" title="Bật/tắt thông báo đơn hàng">
      <span class="notify-dot"></span>
      <span id="notifyStateText">${audioStateText()}</span>
    </button>
    <label class="notify-volume" title="Âm lượng thông báo">
      <span>Âm lượng</span>
      <input type="range" id="notifyVolume" min="0" max="100" step="5" value="${Math.round(settings.volume * 100)}">
      <b id="notifyVolumeText">${Math.round(settings.volume * 100)}%</b>
    </label>
    <button type="button" class="notify-test" id="notifyTest" title="Thử âm thanh thông báo">Thử</button>
  `;

  document.getElementById('notifyToggle')?.addEventListener('click', async () => {
    const nextEnabled = !settings.enabled;
    if (!nextEnabled) {
      settings.enabled = false;
      saveSettings();
      renderControls();
      await disableOmsPushSubscription().catch(() => null);
      showToast('Da tat thong bao don hang tren thiet bi nay.', 4000);
      return;
    }
    if (requiresStandaloneIosPush()) {
      settings.enabled = false;
      saveSettings();
      renderControls();
      showToast('iPhone chi nhan push khi OMS duoc mo tu icon Add to Home Screen.', 6500);
      return;
    }
    const granted = await requestBrowserPermission({ prompt: true });
    settings.enabled = granted;
    settings.browserEnabled = granted;
    let pushResult = null;
    if (granted) {
      pushResult = await ensureOmsPushSubscription({ test: true }).catch(error => ({
        ok: false,
        error_message: error?.message || String(error)
      }));
      await playNotificationSound('change');
    }
    saveSettings();
    renderControls();
    if (!granted) {
      showToast('Trinh duyet chua cap quyen thong bao cho OMS.', 5000);
      return;
    }
    if (pushResult?.ok && pushResult?.test_push?.ok !== false) {
      showToast('Da bat thong bao don hang va dang ky day nen cho thiet bi nay.', 5000);
      return;
    }
    if (pushResult?.ok) {
      showToast(`Da luu thiet bi nhung test push loi: ${cleanText(pushResult?.test_push?.error || 'push_failed')}`, 7000);
      return;
    }
    showToast(`Da bat am thanh, nhung chua dang ky duoc day nen: ${cleanText(pushResult?.error_message || pushResult?.error || 'push_failed')}`, 7000);
  });

  document.getElementById('notifyVolume')?.addEventListener('input', event => {
    settings.volume = Number(event.target.value || 0) / 100;
    settings.soundEnabled = settings.volume > 0;
    saveSettings();
    document.getElementById('notifyVolumeText').textContent = `${Math.round(settings.volume * 100)}%`;
    document.getElementById('notifyStateText').textContent = audioStateText();
  });

  document.getElementById('notifyTest')?.addEventListener('click', async () => {
    if (requiresStandaloneIosPush()) {
      showToast('iPhone can mo OMS tu icon Add to Home Screen moi test duoc push nen.', 6500);
      return;
    }
    settings.enabled = true;
    settings.soundEnabled = settings.volume > 0;
    settings.browserEnabled = true;
    const granted = await requestBrowserPermission({ prompt: true });
    if (!granted) {
      settings.browserEnabled = false;
      saveSettings();
      renderControls();
      showToast('Trinh duyet chua cap quyen thong bao cho OMS.', 5000);
      return;
    }
    const played = await playNotificationSound('new');
    const pushResult = await ensureOmsPushSubscription({ test: false }).catch(error => ({
      ok: false,
      error_message: error?.message || String(error)
    }));
    const testResult = pushResult?.ok
      ? await sendOmsPushTest(pushResult.subscription).catch(error => ({
        ok: false,
        error: error?.message || String(error)
      }))
      : null;
    saveSettings();
    renderControls();
    if (testResult?.ok) {
      showToast('Da gui thu push den thiet bi nay. Neu dang dung iPhone, hay khoa man hinh hoac ve man hinh chinh de xem banner.', 8000);
      return;
    }
    if (pushResult?.ok === false) {
      showToast(`Chua dang ky duoc push nen: ${cleanText(pushResult?.error_message || pushResult?.error || 'push_failed')}`, 7000);
      return;
    }
    showToast(
      played
        ? `Da bat am thanh, nhung test push loi: ${cleanText(testResult?.error || 'push_failed')}`
        : 'Trinh duyet chua cho phat am thanh. Hay cham nut Thu lai.',
      7000
    );
  });
}

function unlockAudioOnFirstTouch() {
  const unlock = async () => {
    if (!settings.enabled || !settings.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      renderControls();
    } catch {}
  };
  document.addEventListener('pointerdown', unlock, { once: true, passive: true });
  document.addEventListener('keydown', unlock, { once: true });
}

export function initOmsNotifications(options = {}) {
  refreshCurrentView = options.refreshCurrentView || null;
  registerOmsServiceWorker().catch(() => {});
  if (settings.enabled && settings.browserEnabled && Notification.permission === 'granted' && !requiresStandaloneIosPush()) {
    ensureOmsPushSubscription({ test: false }).catch(() => {});
  }
  renderControls();
  unlockAudioOnFirstTouch();
  checkOrderNotifications({ silent: true });
  if (!checkTimer) {
    checkTimer = setInterval(() => checkOrderNotifications(), POLL_MS);
  }
}

