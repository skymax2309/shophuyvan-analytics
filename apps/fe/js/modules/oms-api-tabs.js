import { API } from '../oms-api.js'
import { fmt, showToast as defaultToast } from '../utils/helpers.js'

const ORDER_POLL_MS = 3000
const MODULE_POLL_MS = 15000
const ROW_LIMIT = 120

const tabs = [
  { id: 'realtime', label: 'Realtime đơn' },
  { id: 'finance', label: 'Phí & lãi' },
  { id: 'returns', label: 'Hoàn/trả' },
  { id: 'chat', label: 'Chat/CSKH' },
  { id: 'ads', label: 'ADS/Marketing' }
]

const state = {
  activeTab: 'realtime',
  modules: null,
  recentOrders: [],
  visibleOrders: [],
  totalVisibleOrders: 0,
  signatures: null,
  lastOrderCheckAt: '',
  lastModuleCheckAt: '',
  lastChangeAt: '',
  lastChanges: [],
  orderTimer: null,
  moduleTimer: null,
  isPollingOrders: false,
  isPollingModules: false,
  loadOrders: null,
  toast: defaultToast
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function money(value) {
  return fmt(Number(value || 0))
}

function clean(value) {
  return String(value ?? '').trim()
}

function statusLabel(order = {}) {
  return clean(order.shipping_status) || clean(order.oms_status) || 'Chưa rõ'
}

function orderSignature(order = {}) {
  return [
    order.order_id,
    order.platform,
    order.shop,
    order.oms_status,
    order.shipping_status,
    order.shipping_carrier,
    order.tracking_number,
    Number(order.revenue || 0),
    Number(order.fee || 0),
    Number(order.profit_real || 0),
    Number(order.return_fee || 0)
  ].join('|')
}

function describeOrderChange(previous, current) {
  if (!previous) return 'Đơn mới'
  const changes = []
  if (clean(previous.oms_status) !== clean(current.oms_status)) changes.push('trạng thái OMS')
  if (clean(previous.shipping_status) !== clean(current.shipping_status)) changes.push('trạng thái vận chuyển')
  if (clean(previous.tracking_number) !== clean(current.tracking_number)) changes.push('tracking')
  if (Number(previous.fee || 0) !== Number(current.fee || 0)) changes.push('phí')
  if (Number(previous.profit_real || 0) !== Number(current.profit_real || 0)) changes.push('lãi thực')
  return changes.length ? `Đổi ${changes.join(', ')}` : 'Có cập nhật'
}

function isSafeToRefreshTable() {
  return document.visibilityState === 'visible' && !document.querySelector('.oms-chk:checked')
}

function renderTabs() {
  const host = document.getElementById('apiDashboardTabs')
  if (!host) return
  host.innerHTML = tabs.map(tab => `
    <button type="button"
      class="api-dashboard-tab ${state.activeTab === tab.id ? 'active' : ''}"
      onclick="switchApiDashboardTab('${tab.id}')">
      ${escapeHtml(tab.label)}
    </button>
  `).join('')
  const active = host.querySelector('.api-dashboard-tab.active')
  active?.scrollIntoView({ block: 'nearest', inline: 'center' })
}

function metric(label, value, tone = '') {
  return `
    <div class="api-dashboard-metric ${tone ? `is-${tone}` : ''}">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(value)}</b>
    </div>
  `
}

function renderOrderRows(rows = state.recentOrders.slice(0, 10)) {
  if (!rows.length) return `<div class="api-dashboard-empty">Chưa có đơn gần đây để theo dõi realtime.</div>`
  return rows.slice(0, 10).map(order => `
    <div class="api-dashboard-row">
      <div>
        <b>${escapeHtml(order.order_id || 'Chưa rõ mã đơn')}</b>
        <span>${escapeHtml(clean(order.platform).toUpperCase() || 'SÀN')} · ${escapeHtml(order.shop || 'Chưa rõ shop')}</span>
      </div>
      <div>
        <b>${escapeHtml(statusLabel(order))}</b>
        <span>${escapeHtml(order.tracking_number || order.shipping_carrier || 'Chưa có tracking')}</span>
      </div>
      <div>
        <b>${money(order.profit_real)}</b>
        <span>Phí ${money(order.fee)}</span>
      </div>
    </div>
  `).join('')
}

function renderChangeRows() {
  if (!state.lastChanges.length) return ''
  return `
    <div class="api-dashboard-change-list">
      ${state.lastChanges.slice(0, 5).map(change => `
        <div class="api-dashboard-change">
          <b>${escapeHtml(change.order.order_id)}</b>
          <span>${escapeHtml(change.reason)} · ${escapeHtml(statusLabel(change.order))}</span>
        </div>
      `).join('')}
    </div>
  `
}

function workspaceById(id) {
  return (state.modules?.workspaces || []).find(workspace => workspace.id === id) || null
}

function renderWorkspaceRows(rows = []) {
  if (!rows.length) return `<div class="api-dashboard-empty">Chưa có dữ liệu chi tiết.</div>`
  return rows.slice(0, 8).map(row => `
    <div class="api-dashboard-row">
      <div>
        <b>${escapeHtml(row.title || 'Dữ liệu mới')}</b>
        <span>${escapeHtml(row.meta || row.time || '')}</span>
      </div>
      <div class="api-dashboard-row-wide">
        <span>${escapeHtml(row.detail || '')}</span>
      </div>
      <div>
        <span>${escapeHtml(row.status || '')}</span>
      </div>
    </div>
  `).join('')
}

function actionButton(action, label) {
  return `
    <button type="button" class="api-dashboard-action" onclick="runApiDashboardAction('${action}')">
      ${escapeHtml(label)}
    </button>
  `
}

function renderWorkspaceTab(id, emptyTitle, action, actionLabel) {
  const workspace = workspaceById(id)
  if (!workspace) {
    return `<div class="api-dashboard-empty">${escapeHtml(emptyTitle)}</div>`
  }

  return `
    <div class="api-dashboard-head">
      <div>
        <span>${escapeHtml(workspace.group || '')}</span>
        <h3>${escapeHtml(workspace.title || emptyTitle)}</h3>
      </div>
      ${actionButton(action, actionLabel)}
    </div>
    <div class="api-dashboard-metrics">
      ${(workspace.metrics || []).map(item => metric(item.label, item.value, item.tone)).join('')}
    </div>
    <div class="api-dashboard-split">
      <div>
        <div class="api-dashboard-subtitle">Theo shop / nhóm dữ liệu</div>
        ${renderWorkspaceRows(workspace.breakdown || [])}
      </div>
      <div>
        <div class="api-dashboard-subtitle">Dữ liệu mới nhất</div>
        ${renderWorkspaceRows(workspace.rows || [])}
      </div>
    </div>
  `
}

function renderRealtimeTab() {
  const counters = state.modules?.counters || {}
  const changedText = state.lastChangeAt ? state.lastChangeAt : 'Chưa có thay đổi mới'
  return `
    <div class="api-dashboard-head">
      <div>
        <span class="api-live-pill"><i></i> Đang tự theo dõi mỗi ${ORDER_POLL_MS / 1000} giây</span>
        <h3>Đơn hàng, tracking, phí và lãi thực realtime</h3>
      </div>
      <button type="button" class="api-dashboard-action" onclick="loadApiDashboardNow()">Kiểm tra ngay</button>
    </div>
    <div class="api-dashboard-metrics">
      ${metric('Shop có API', Number(counters.api_shops || 0).toLocaleString('vi-VN'), 'ok')}
      ${metric('Đơn đang theo dõi', Number(state.recentOrders.length || 0).toLocaleString('vi-VN'), 'ok')}
      ${metric('Đơn có phí API', Number(counters.fee_details || 0).toLocaleString('vi-VN'), 'warning')}
      ${metric('Lần đổi gần nhất', changedText, state.lastChangeAt ? 'ok' : '')}
    </div>
    ${renderChangeRows()}
    <div class="api-dashboard-subtitle">Đơn gần đây đang được soi realtime</div>
    ${renderOrderRows()}
  `
}

function renderPanel() {
  const panel = document.getElementById('apiDashboardPanel')
  if (!panel) return
  renderTabs()
  if (state.activeTab === 'finance') {
    panel.innerHTML = renderWorkspaceTab('finance_reconcile', 'Đối soát phí và lãi thực', 'refresh_finance', 'Cập nhật phí/lãi')
    return
  }
  if (state.activeTab === 'returns') {
    panel.innerHTML = renderWorkspaceTab('returns_claims', 'Theo dõi hoàn/trả/khiếu nại', 'refresh_returns', 'Cập nhật hoàn/trả')
    return
  }
  if (state.activeTab === 'chat') {
    panel.innerHTML = renderWorkspaceTab('chat_reviews', 'Chat, đánh giá và hiệu suất shop', 'refresh_customer_care', 'Làm mới CSKH')
    return
  }
  if (state.activeTab === 'ads') {
    panel.innerHTML = renderWorkspaceTab('marketing', 'ADS, voucher, freeship, flash sale', 'refresh_marketing', 'Làm mới marketing')
    return
  }
  panel.innerHTML = renderRealtimeTab()
}

async function fetchRecentOrders() {
  const response = await fetch(`${API}/api/orders/changes?limit=${ROW_LIMIT}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Không tải được đơn realtime')
  const payload = await response.json()
  return Array.isArray(payload.data) ? payload.data : []
}

function snapshotMap(rows) {
  return Object.fromEntries(rows.map(order => [String(order.order_id), { order, signature: orderSignature(order) }]))
}

export async function pollApiDashboardOrders({ silent = false } = {}) {
  if (state.isPollingOrders) return
  state.isPollingOrders = true
  try {
    const rows = await fetchRecentOrders()
    const next = snapshotMap(rows)
    const changes = []
    if (state.signatures) {
      for (const [id, current] of Object.entries(next)) {
        const previous = state.signatures[id]
        if (!previous) {
          changes.push({ order: current.order, reason: 'Đơn mới' })
        } else if (previous.signature !== current.signature) {
          changes.push({ order: current.order, reason: describeOrderChange(previous.order, current.order) })
        }
      }
    }

    state.recentOrders = rows
    state.signatures = next
    state.lastOrderCheckAt = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    if (changes.length) {
      state.lastChanges = changes
      state.lastChangeAt = state.lastOrderCheckAt
      if (!silent && isSafeToRefreshTable() && typeof state.loadOrders === 'function') {
        await state.loadOrders()
      }
    }
    renderPanel()
  } catch (error) {
    console.warn('[API_DASHBOARD_REALTIME]', error)
  } finally {
    state.isPollingOrders = false
  }
}

export async function loadApiDashboardTabs({ silent = false } = {}) {
  if (state.isPollingModules) return
  state.isPollingModules = true
  try {
    const response = await fetch(`${API}/api/advanced/modules?limit=8`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Không tải được module API')
    state.modules = await response.json()
    state.lastModuleCheckAt = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    renderPanel()
  } catch (error) {
    if (!silent) state.toast(`Không tải được dữ liệu API: ${error.message}`, 5000)
  } finally {
    state.isPollingModules = false
  }
}

export async function loadApiDashboardNow() {
  await Promise.all([
    pollApiDashboardOrders({ silent: true }),
    loadApiDashboardTabs({ silent: true })
  ])
}

export async function runApiDashboardAction(action) {
  const label = tabs.find(tab => tab.id === state.activeTab)?.label || 'API'
  state.toast(`Đang chạy ${label.toLowerCase()}...`)
  try {
    const response = await fetch(`${API}/api/advanced/modules/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, limit: 80 })
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Thao tác API lỗi')
    state.toast(payload.message || 'Đã cập nhật dữ liệu API.')
    await loadApiDashboardNow()
    if (typeof state.loadOrders === 'function') await state.loadOrders()
  } catch (error) {
    state.toast(`Lỗi API: ${error.message}`, 7000)
  }
}

export function switchApiDashboardTab(tab) {
  if (!tabs.some(item => item.id === tab)) return
  state.activeTab = tab
  renderPanel()
}

export function updateApiDashboardVisibleOrders(rows = [], total = 0) {
  state.visibleOrders = Array.isArray(rows) ? rows : []
  state.totalVisibleOrders = total || 0
}

export function initApiDashboardTabs(options = {}) {
  state.loadOrders = options.loadOrders || null
  state.toast = options.showToast || defaultToast
  window.switchApiDashboardTab = switchApiDashboardTab
  window.runApiDashboardAction = runApiDashboardAction
  window.loadApiDashboardNow = loadApiDashboardNow
  window.updateApiDashboardVisibleOrders = updateApiDashboardVisibleOrders
  renderPanel()
  loadApiDashboardNow()
  if (!state.orderTimer) {
    state.orderTimer = setInterval(() => {
      const hidden = document.visibilityState !== 'visible'
      pollApiDashboardOrders({ silent: hidden })
    }, ORDER_POLL_MS)
  }
  if (!state.moduleTimer) {
    state.moduleTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadApiDashboardTabs({ silent: true })
    }, MODULE_POLL_MS)
  }
}
