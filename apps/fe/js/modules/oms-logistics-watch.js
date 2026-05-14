import { API } from '../oms-api.js'
import { wakeRadarLocal } from './oms-radar-helper.js'
import { createReturnScanner } from './oms-logistics-return-scanner.js'

const state = {
  orderMap: new Map(),
  activeOrder: null,
  detailResult: null,
  boundDocumentEvents: false,
  scanner: {
    open: false,
    reader: null,
    inFlight: false,
    lastCode: '',
    lastAt: 0,
    expectedCode: '',
    status: 'Đưa mã đơn hoàn/mã vận đơn vào khung quét.',
    tone: 'info',
    rows: []
  }
}

function el(id) {
  return document.getElementById(id)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

function platformLabel(platform) {
  const key = String(platform || '').toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  return platform || 'Sàn'
}

function statusText(order = {}) {
  const raw = String(order.shipping_status || order.oms_status || '').toUpperCase()
  const map = {
    LOGISTICS_PENDING_ARRANGE: 'Chưa xử lý',
    READY_TO_SHIP: 'Chờ lấy hàng',
    LOGISTICS_REQUEST_CREATED: 'Đã xử lý',
    LOGISTICS_PACKAGED: 'Đã đóng gói',
    FAILED_DELIVERY: 'Giao thất bại',
    FAILED_DELIVERY_ATTEMPT: 'Giao lỗi',
    LOGISTICS_IN_RETURN: 'Đang hoàn về shop',
    LOGISTICS_RETURNED_BY_SHIPPER: 'Chờ quét nhận hoàn',
    LOGISTICS_RETURN_PACKAGE_RECEIVED: 'Đã nhận hoàn',
    RETURN_REFUND: 'Hoàn/trả',
    RETURN: 'Hoàn/trả',
    COMPLETED: 'Đã giao',
    CANCELLED: 'Đã hủy'
  }
  return map[raw] || order.shipping_status || order.oms_status || 'Chưa rõ trạng thái'
}

function isReturnOrder(row = {}) {
  const text = `${row.order_type || ''} ${row.oms_status || ''} ${row.shipping_status || ''}`.toUpperCase()
  return text.includes('RETURN') || text.includes('REFUND') || text.includes('FAILED_DELIVERY') || text.includes('TO_RETURN')
}

function buildOrderTimeline(order = {}) {
  const shipping = String(order.shipping_status || '').toUpperCase()
  const oms = String(order.oms_status || '').toUpperCase()
  const shipped = ['SHIPPING', 'SHIPPED', 'COMPLETED', 'TO_CONFIRM_RECEIVE'].includes(oms)
  const steps = [
    { label: 'Tạo đơn', done: true, note: order.order_date || order.created_at || '' },
    { label: 'Có mã vận đơn', done: !!String(order.tracking_number || '').trim(), note: order.tracking_number || 'Chưa có mã vận đơn' },
    { label: 'Đã đóng gói', done: shipping === 'LOGISTICS_PACKAGED' || shipped, note: order.shipping_carrier || 'Chưa rõ đơn vị vận chuyển' },
    { label: statusText(order), done: true, note: order.oms_updated_at || order.updated_at || '' }
  ]
  if (isReturnOrder(order)) {
    steps.push({
      label: order.return_received_at ? 'Đã nhận hoàn' : 'Chờ nhận hoàn',
      done: !!order.return_received_at,
      note: order.return_received_at || 'Quét mã hoàn khi hàng về shop'
    })
  }
  if (String(order.return_complaint_status || '').trim()) {
    steps.push({ label: 'Khiếu nại', done: true, note: order.return_complaint_status })
  }
  return steps
}

function renderOrderTimeline(order = {}) {
  return `
    <div class="logistics-detail-timeline">
      ${buildOrderTimeline(order).map(step => `
        <div class="logistics-detail-step ${step.done ? 'done' : ''}">
          <i></i>
          <div>
            <b>${escapeHtml(step.label)}</b>
            ${step.note ? `<span>${escapeHtml(step.note)}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>`
}

function renderDetailLinks(result = {}) {
  const links = [
    result.link,
    ...(result.links || [])
  ].filter(Boolean)
  if (!links.length) return ''
  return `<div class="logistics-detail-links">${links.map(link => `
    <a href="${escapeHtml(link.href)}" target="_blank" rel="noopener"${link.download ? ' download' : ''}>${escapeHtml(link.label)}</a>
  `).join('')}</div>`
}

function renderDetailResult() {
  if (!state.detailResult) return ''
  const tone = state.detailResult.tone || 'info'
  const rows = (state.detailResult.rows || [])
    .map(row => `<span>${escapeHtml(row)}</span>`)
    .join('')
  const buttons = (state.detailResult.buttons || [])
    .map(button => `<button type="button" ${button.attr || ''}>${escapeHtml(button.label || '')}</button>`)
    .join('')
  return `
    <div class="logistics-detail-result ${tone}">
      <b>${escapeHtml(state.detailResult.title || '')}</b>
      ${rows}
      ${buttons ? `<div class="logistics-detail-result-actions">${buttons}</div>` : ''}
      ${renderDetailLinks(state.detailResult)}
    </div>`
}

function renderOrderDrawer() {
  const order = state.activeOrder
  let root = el('logisticsOrderDrawer')
  if (!order) {
    root?.remove()
    return
  }
  if (!root) {
    root = document.createElement('div')
    root.id = 'logisticsOrderDrawer'
    document.body.appendChild(root)
  }
  const code = escapeHtml(order.order_id || '')
  const returnOrder = isReturnOrder(order)
  root.innerHTML = `
    <div class="logistics-detail-backdrop" data-logistics-close="1"></div>
    <aside class="logistics-detail-panel" role="dialog" aria-modal="true" aria-label="Hành trình đơn hàng">
      <div class="logistics-detail-head">
        <div>
          <span>Hành trình đơn hàng</span>
          <h3>${code || 'Chưa rõ mã đơn'}</h3>
        </div>
        <button type="button" data-logistics-close="1" aria-label="Đóng">×</button>
      </div>
      <div class="logistics-detail-summary">
        <div><small>Sàn / shop</small><b>${platformLabel(order.platform)} · ${escapeHtml(order.shop || 'Chưa rõ shop')}</b></div>
        <div><small>ĐVVC</small><b>${escapeHtml(order.shipping_carrier || 'Chưa rõ ĐVVC')}</b></div>
        <div><small>Mã vận đơn</small><b>${escapeHtml(order.tracking_number || 'Chưa có tracking')}</b></div>
        <div><small>Trạng thái</small><b>${escapeHtml(statusText(order))}</b></div>
      </div>
      ${renderOrderTimeline(order)}
      <div class="logistics-detail-actions">
        <button type="button" data-label-check="${code}">Kiểm tra tem</button>
        ${String(order.shipping_status || '').toUpperCase() !== 'LOGISTICS_PACKAGED' ? `<button type="button" data-mark-packed-detail="${code}">Đánh dấu đã đóng gói</button>` : ''}
        <button type="button" data-packing-video="${code}">Tìm video đóng gói</button>
        <button type="button" data-complaint-evidence="${code}">Bằng chứng khiếu nại</button>
        ${returnOrder && !order.return_received_at ? `<button type="button" class="danger" data-return-camera-scan="${code}">Quét mã nhận hoàn</button>` : ''}
        ${returnOrder && !order.return_received_at ? `<button type="button" class="danger" data-return-receive="${code}">Nhận hoàn thủ công</button>` : ''}
        ${returnOrder ? `<button type="button" class="danger" data-return-complaint="${code}">Gửi khiếu nại</button>` : ''}
      </div>
      ${renderDetailResult()}
      <div class="logistics-detail-note">
        Shop có API dùng dữ liệu sàn làm nguồn chuẩn. Shop không API chỉ dùng dòng này để kiểm tra tem, video và thao tác nội bộ.
      </div>
    </aside>`
}

function rememberOrderFromResult(data = {}) {
  const order = data.order || data.data?.order
  if (!order?.order_id) return
  const key = String(order.order_id)
  const current = state.orderMap.get(key) || state.activeOrder || {}
  const merged = { ...current, ...order }
  state.orderMap.set(key, merged)
  if (merged.tracking_number) state.orderMap.set(String(merged.tracking_number), merged)
  if (state.activeOrder && String(state.activeOrder.order_id || '') === key) {
    state.activeOrder = merged
  }
}

function setDetailResult(result) {
  state.detailResult = result
  rememberOrderFromResult(result?.data || {})
  renderOrderDrawer()
}

function labelProblemText(label = {}) {
  const error = String(label.error || '').trim()
  if (!error || error === 'not_found') return 'Chưa có tem đã lưu trong kho. Bấm Tải lại tem rồi thử lại.'
  if (error === 'missing_api_token') return 'Shop chưa có API tem, cần Chrome helper tải lại tem từ Seller Center.'
  return `Lý do: ${error}`
}

async function loadLabelStatus(orderId) {
  const response = await fetch(`${API}/api/labels/status?order_id=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Không kiểm tra được trạng thái tem.')
  return data
}

async function createLabelRefreshJob(row = {}) {
  const platform = String(row.platform || '').trim().toLowerCase()
  const shop = String(row.shop || '').trim()
  const orderId = String(row.order_id || '').trim()
  if (!platform || !shop || !orderId) throw new Error('Thiếu shop/sàn để tạo lệnh tải lại tem.')
  const now = new Date()
  const response = await fetch(`${API}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_type: 'refresh_label',
      shop_name: shop,
      platform,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      payload: JSON.stringify({
        order_ids: [orderId],
        download_only: true,
        source: 'order_drawer_refresh'
      })
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) throw new Error(data.error || 'Không tạo được job tải lại tem.')
  return data
}

async function refreshLabelFromDrawer(orderId) {
  try {
    const status = await loadLabelStatus(orderId)
    const platform = String(status.platform || state.activeOrder?.platform || '').trim().toLowerCase()
    if ((status.api_connected || status.refresh_mode === 'api') && ['shopee', 'lazada'].includes(platform)) {
      const response = await fetch(`${API}/api/label/${encodeURIComponent(orderId)}/refresh`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.error) throw new Error(data.error || 'Không tải lại được tem bằng API.')
      setDetailResult({
        tone: 'success',
        title: `Đã tải lại tem cho đơn ${orderId}`,
        rows: ['Tem đã lưu vào kho R2. Có thể bấm Đã đóng gói lại.'],
        link: { href: `${API}/api/label/${encodeURIComponent(orderId)}.pdf`, label: 'Mở tem' }
      })
      return
    }

    const job = await createLabelRefreshJob({
      ...status,
      platform: status.platform || state.activeOrder?.platform,
      shop: status.shop || state.activeOrder?.shop,
      order_id: orderId
    })
    if (job?.id) await wakeRadarLocal('refresh_label', job.id)
    setDetailResult({
      tone: 'warning',
      title: `Đã gửi lệnh tải lại tem cho đơn ${orderId}`,
      rows: [
        `${status.platform || state.activeOrder?.platform || 'Sàn'} · ${status.shop || state.activeOrder?.shop || 'shop chưa rõ'}`,
        'Chrome helper sẽ tải lại tem và lưu vào kho. Khi job xong, bấm Kiểm tra tem hoặc Đã đóng gói lại.'
      ]
    })
  } catch (error) {
    setDetailResult({ tone: 'danger', title: 'Không gửi được lệnh tải lại tem.', rows: [error.message] })
  }
}

function applyLocalStatusUpdate(detail = {}) {
  const ids = (detail.order_ids || detail.orderIds || []).map(id => String(id || '')).filter(Boolean)
  if (!ids.length) return
  const nowText = new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ')
  ids.forEach(id => {
    const current = state.orderMap.get(id) || window.__omsOrdersById?.[id] || {}
    const updated = {
      ...current,
      order_id: current.order_id || id,
      oms_status: detail.oms_status || current.oms_status,
      shipping_status: detail.shipping_status || current.shipping_status,
      oms_updated_at: detail.updated_at || nowText
    }
    state.orderMap.set(id, updated)
    if (updated.tracking_number) state.orderMap.set(String(updated.tracking_number), updated)
    if (state.activeOrder && String(state.activeOrder.order_id || '') === id) {
      state.activeOrder = updated
      state.detailResult = {
        tone: 'success',
        title: detail.message || `Đã cập nhật trạng thái ${statusText(updated)}`,
        rows: ['Trạng thái đã cập nhật trong OMS. Kiểm tem/video là bước kiểm tra riêng, không phải lỗi chuyển trạng thái.']
      }
      renderOrderDrawer()
    }
  })
}

async function markPackedFromDrawer(orderId) {
  try {
    const order = state.activeOrder || state.orderMap.get(String(orderId)) || {}
    const platform = String(order.platform || '').trim().toLowerCase()
    if (platform === 'tiktok') {
      const status = await loadLabelStatus(orderId)
      if (!status.has_label) {
        setDetailResult({
          tone: 'warning',
          title: 'TikTok cần tải lại tem trước khi đóng gói',
          rows: [
            `${status.shop || order.shop || 'Shop TikTok'} · đơn ${orderId}`,
            labelProblemText(status),
            'Sau khi helper tải xong tem, bấm Đã đóng gói lại.'
          ],
          buttons: [{ label: 'Tải lại tem', attr: `data-label-refresh-detail="${escapeHtml(orderId)}"` }]
        })
        return
      }
    }
    const response = await fetch(`${API}/api/orders/bulk-oms-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ids: [orderId], oms_status: 'PENDING', shipping_status: 'LOGISTICS_PACKAGED' })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(data.error || 'Không cập nhật được trạng thái.')
    applyLocalStatusUpdate({
      order_ids: [orderId],
      oms_status: 'PENDING',
      shipping_status: 'LOGISTICS_PACKAGED',
      message: 'Đã chuyển sang Đã đóng gói.'
    })
  } catch (error) {
    setDetailResult({ tone: 'danger', title: 'Không chuyển được Đã đóng gói.', rows: [error.message] })
  }
}

const {
  readScanCode,
  fetchPackingScan,
  checkLabel,
  confirmReturnReceived,
  openReturnScanCamera,
  closeReturnScanCamera
} = createReturnScanner({
  API,
  state,
  el,
  escapeHtml,
  labelProblemText,
  setDetailResult
});

async function findPackingVideo(code) {
  const scanCode = readScanCode(code)
  if (!scanCode) return setDetailResult({ tone: 'warning', title: 'Chưa có mã để tìm video.' })
  try {
    const data = await fetchPackingScan(scanCode)
    const video = data.latest_video
    setDetailResult({
      tone: video ? 'success' : 'warning',
      title: video ? `Đã có video đóng gói cho ${video.order_id}` : 'Chưa có video đóng gói cho mã này.',
      rows: [
        data.found ? `${data.order.platform || ''} · ${data.order.shop || ''}` : 'OMS chưa tìm thấy đơn theo mã này.',
        video?.created_at ? `Quay lúc: ${video.created_at}` : 'Chưa thấy file video trong kho.'
      ].filter(Boolean),
      link: video?.video_url ? { href: `${API}/api/file/${encodeURIComponent(video.video_url)}`, label: 'Mở video' } : null,
      data
    })
  } catch (error) {
    setDetailResult({ tone: 'danger', title: 'Không tìm được video đóng gói.', rows: [error.message] })
  }
}

async function findComplaintEvidence(code) {
  const scanCode = readScanCode(code)
  if (!scanCode) return setDetailResult({ tone: 'warning', title: 'Chưa có mã để tìm bằng chứng khiếu nại.' })
  try {
    const data = await fetchPackingScan(scanCode)
    const evidence = data.evidence || {}
    const video = evidence.latest_video || data.latest_video
    const orderId = data.order?.order_id || scanCode
    const missing = Array.isArray(evidence.missing) ? evidence.missing : []
    setDetailResult({
      tone: evidence.complete_evidence ? 'success' : evidence.video_ready ? 'warning' : 'danger',
      title: evidence.video_ready ? `Đã có video khiếu nại cho ${orderId}` : `Thiếu video khiếu nại cho ${orderId}`,
      rows: [
        data.found ? `${data.order.platform || ''} · ${data.order.shop || ''} · ${data.order.shipping_status || data.order.oms_status || ''}` : 'OMS chưa tìm thấy đơn theo mã này.',
        video?.created_at ? `Video đóng gói gần nhất: ${video.created_at}` : 'Video đóng gói: chưa có.',
        data.label?.valid ? 'Tem tải về: hợp lệ.' : `Tem tải về: chưa hợp lệ${data.label?.error ? ` (${data.label.error})` : ''}.`,
        evidence.complete_evidence ? 'Bằng chứng đủ để tải video + tem đối chiếu khi khiếu nại.' : '',
        ...missing
      ].filter(Boolean),
      links: [
        video?.video_url ? { href: `${API}/api/file/${encodeURIComponent(video.video_url)}`, label: 'Tải video khiếu nại', download: true } : null,
        data.label?.valid ? { href: `${API}/api/label/${encodeURIComponent(orderId)}.pdf`, label: 'Mở tem' } : null
      ].filter(Boolean),
      data
    })
  } catch (error) {
    setDetailResult({ tone: 'danger', title: 'Không lấy được bằng chứng khiếu nại.', rows: [error.message] })
  }
}

async function submitReturnComplaint(code) {
  const scanCode = readScanCode(code)
  if (!scanCode) return setDetailResult({ tone: 'warning', title: 'Chưa có mã để gửi khiếu nại.' })
  if (!window.confirm(`Gửi video đóng gói làm chứng cứ khiếu nại cho mã ${scanCode}?`)) return
  try {
    const response = await fetch(`${API}/api/returns/complaints/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: scanCode, confirm_action: true })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(data.message || data.error || 'Không gửi được khiếu nại.')
    const video = data.evidence?.latest_video || null
    setDetailResult({
      tone: data.sent_to_marketplace ? 'success' : 'warning',
      title: data.message || 'Đã tạo hồ sơ khiếu nại.',
      rows: [
        data.order?.order_id ? `Đơn: ${data.order.order_id}` : '',
        data.complaint_status ? `Trạng thái: ${data.complaint_status === 'marketplace_processing' ? 'Sàn đang xử lý' : data.complaint_status}` : '',
        data.reference?.return_sn ? `Mã hoàn Shopee: ${data.reference.return_sn}` : '',
        data.upload_result?.request_id ? `Request ID: ${data.upload_result.request_id}` : ''
      ].filter(Boolean),
      links: [
        video?.video_url ? { href: `${API}/api/file/${encodeURIComponent(video.video_url)}`, label: 'Tải video đã gửi', download: true } : null
      ].filter(Boolean),
      data
    })
  } catch (error) {
    setDetailResult({ tone: 'danger', title: 'Không gửi được khiếu nại.', rows: [error.message] })
  }
}

export function setLogisticsOrders(orders = []) {
  state.orderMap = new Map()
  ;(orders || []).forEach(order => {
    if (order?.order_id) state.orderMap.set(String(order.order_id), order)
    if (order?.tracking_number) state.orderMap.set(String(order.tracking_number), order)
  })
  const activeId = String(state.activeOrder?.order_id || '')
  if (activeId && state.orderMap.has(activeId)) {
    state.activeOrder = { ...state.activeOrder, ...state.orderMap.get(activeId) }
    renderOrderDrawer()
  }
}

function openOrderLogistics(orderId) {
  const key = String(orderId || '')
  const order = state.orderMap.get(key) || window.__omsOrdersById?.[key]
  state.activeOrder = order || { order_id: key, shipping_status: '', shipping_carrier: '', tracking_number: '' }
  state.detailResult = null
  renderOrderDrawer()
}

function closeOrderLogistics() {
  state.activeOrder = null
  state.detailResult = null
  renderOrderDrawer()
}

function ensureOrderDrawerForCode(code) {
  if (state.activeOrder) return
  if (code) openOrderLogistics(code)
}

function bindDocumentEvents() {
  if (state.boundDocumentEvents) return
  state.boundDocumentEvents = true
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-logistics-detail],[data-logistics-close],[data-label-check],[data-label-refresh-detail],[data-mark-packed-detail],[data-return-receive],[data-return-camera-scan],[data-return-scan-close],[data-packing-video],[data-complaint-evidence],[data-return-complaint]')
    if (!target) return
    if (target.matches('[data-logistics-detail]')) {
      event.preventDefault()
      openOrderLogistics(target.dataset.logisticsDetail)
      return
    }
    if (target.matches('[data-logistics-close]')) {
      event.preventDefault()
      closeOrderLogistics()
      return
    }
    if (target.matches('[data-return-scan-close]')) {
      event.preventDefault()
      closeReturnScanCamera()
      return
    }
    if (target.matches('[data-label-check]')) {
      event.preventDefault()
      const code = target.dataset.labelCheck
      ensureOrderDrawerForCode(code)
      checkLabel(code)
      return
    }
    if (target.matches('[data-label-refresh-detail]')) {
      event.preventDefault()
      const code = target.dataset.labelRefreshDetail
      ensureOrderDrawerForCode(code)
      refreshLabelFromDrawer(code)
      return
    }
    if (target.matches('[data-mark-packed-detail]')) {
      event.preventDefault()
      const code = target.dataset.markPackedDetail
      ensureOrderDrawerForCode(code)
      markPackedFromDrawer(code)
      return
    }
    if (target.matches('[data-return-receive]')) {
      event.preventDefault()
      const code = target.dataset.returnReceive
      ensureOrderDrawerForCode(code)
      confirmReturnReceived(code)
      return
    }
    if (target.matches('[data-return-camera-scan]')) {
      event.preventDefault()
      const code = target.dataset.returnCameraScan
      ensureOrderDrawerForCode(code)
      openReturnScanCamera(code)
      return
    }
    if (target.matches('[data-packing-video]')) {
      event.preventDefault()
      const code = target.dataset.packingVideo
      ensureOrderDrawerForCode(code)
      findPackingVideo(code)
      return
    }
    if (target.matches('[data-complaint-evidence]')) {
      event.preventDefault()
      const code = target.dataset.complaintEvidence
      ensureOrderDrawerForCode(code)
      findComplaintEvidence(code)
      return
    }
    if (target.matches('[data-return-complaint]')) {
      event.preventDefault()
      const code = target.dataset.returnComplaint
      ensureOrderDrawerForCode(code)
      submitReturnComplaint(code)
    }
  })
}

export function initLogisticsWatch() {
  bindDocumentEvents()
  window.addEventListener('oms:status-updated', event => applyLocalStatusUpdate(event.detail || {}))
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (state.scanner.open) closeReturnScanCamera()
      else closeOrderLogistics()
    }
  })
}
