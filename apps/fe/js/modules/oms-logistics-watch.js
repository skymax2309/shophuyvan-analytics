import { API } from '../oms-dashboard/oms-api.js'
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
  return window.SHV_ORDER_STATUS_CORE?.label?.(order, '') ||
    order.display_status_vi ||
    'Lỗi / cần kiểm tra'
}

function isReturnOrder(row = {}) {
  const core = String(row.order_status_core || '').toUpperCase()
  const fulfillment = String(row.fulfillment_status_core || '').toUpperCase()
  return row.order_type === 'return' || core === 'RETURN' || core === 'FAILED_DELIVERY' || fulfillment.includes('RETURN') || fulfillment.includes('FAILED_DELIVERY')
}

function detailTrackingNumber(order = {}) {
  return String(
    order.tracking_number
    || state.detailResult?.tracking_number
    || state.detailResult?.data?.tracking_number
    || state.detailResult?.data?.order?.tracking_number
    || ''
  ).trim()
}

function detailProvider(order = {}) {
  return String(
    order.shipping_carrier
    || state.detailResult?.logistics_provider
    || state.detailResult?.data?.logistics_provider
    || state.detailResult?.data?.order?.shipping_carrier
    || ''
  ).trim()
}

function detailPaymentMethod(order = {}) {
  return String(
    state.detailResult?.payment_method
    || state.detailResult?.data?.payment_method
    || order.payment_method
    || ''
  ).trim()
}

function detailCustomerNote(order = {}) {
  return String(
    state.detailResult?.customer_note
    || state.detailResult?.data?.customer_note
    || order.customer_note
    || ''
  ).trim()
}

function trackingSourceLabel(source = '') {
  const text = String(source || '').toLowerCase()
  if (text.includes('shopee_open_platform')) return 'Shopee Open Platform'
  if (text.includes('lazada_open_platform')) return 'Lazada Open Platform'
  if (text.includes('tracking_core_cached')) return 'Tracking Core đã lưu'
  return source ? 'Nguồn dữ liệu vận chuyển' : ''
}

function buildOrderTimeline(order = {}) {
  const tracking = detailTrackingNumber(order)
  const fulfillment = String(order.fulfillment_status_core || '').toUpperCase()
  const hasPackingEvidence = order.label_valid === true && ['LOGISTICS_PACKAGED', 'ADVANCE_FULFILMENT'].includes(fulfillment)
  const steps = [
    { label: 'Tạo đơn', done: true, note: order.order_date || order.created_at || '' },
    { label: 'Có mã vận đơn', done: !!tracking, note: tracking || 'Chưa có mã vận đơn' },
    { label: 'Đã đóng gói', done: hasPackingEvidence, note: hasPackingEvidence ? (order.shipping_carrier || 'Có tem hợp lệ') : 'Chưa có nguồn đóng gói thật' },
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

const TRACKING_STATUS_LABELS = {
  ORDER_CREATED: 'Đơn đã tạo',
  CREATED: 'Đơn đã tạo',
  PICKED_UP: 'Đơn vị vận chuyển đã lấy hàng',
  IN_TRANSIT: 'Đơn hàng đang trung chuyển',
  DELIVERING: 'Đơn hàng đang giao',
  DELIVERED: 'Giao hàng thành công',
  RETURN_INITIATED: 'Đang hoàn hàng',
  RETURNED: 'Trả hàng thành công',
  FAILED_DELIVERY: 'Giao hàng không thành công',
  CANCELLED: 'Đơn đã hủy'
}

function isRawTrackingStatus(value) {
  const text = String(value || '').trim()
  return /^[A-Z][A-Z0-9_]{2,}$/.test(text)
}

function trackingStatusLabel(status) {
  const key = String(status || '').trim().toUpperCase()
  return TRACKING_STATUS_LABELS[key] || ''
}

function trackingEventTitle(event = {}) {
  const candidates = [
    event.event_text,
    event.status_text,
    event.status_label_vi,
    event.description,
    event.message,
    event.title
  ]
  for (const value of candidates) {
    const text = String(value || '').trim()
    if (text && !isRawTrackingStatus(text)) return text
  }
  return trackingStatusLabel(event.status) || 'Cập nhật vận chuyển'
}

function renderOrderTimeline(order = {}) {
  const apiEvents = Array.isArray(state.detailResult?.tracking_events)
    ? state.detailResult.tracking_events
    : (Array.isArray(state.detailResult?.events) ? state.detailResult.events : [])
  const visibleEvents = normalizeTrackingTimelineEvents(apiEvents)
  if (visibleEvents.length) {
    return `
      <div class="logistics-detail-timeline">
        ${visibleEvents.map(event => {
          const status = String(event.status || event.description || 'Cập nhật vận chuyển').trim()
          const description = String(event.description || '').trim()
          const displayStatus = trackingEventTitle(event)
          const time = String(event.event_time || event.time || '').trim()
          const location = String(event.location || '').trim()
          const detailParts = [time]
          if (description && description !== displayStatus && !isRawTrackingStatus(description)) detailParts.push(description)
          if (location) detailParts.push(location)
          return `
            <div class="logistics-detail-step done">
              <i></i>
              <div>
                <b>${escapeHtml(displayStatus)}</b>
                ${detailParts.length ? `<span>${escapeHtml(detailParts.join(' · '))}</span>` : ''}
              </div>
            </div>`
        }).join('')}
      </div>`
  }
  return `
    <div class="logistics-detail-source-note">Timeline vận hành nội bộ</div>
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

function normalizeTrackingTimelineEvents(events = []) {
  const rows = Array.isArray(events) ? events : []
  const hasCarrierEvent = rows.some(event => {
    const status = String(event?.status || '').trim().toUpperCase()
    return status && !['ORDER_CREATED', 'CREATED'].includes(status)
  })
  const seen = new Set()
  return rows.filter(event => {
    const status = String(event?.status || '').trim().toUpperCase()
    const description = String(event?.description || '').trim().toLowerCase()
    const time = String(event?.event_time || event?.time || '').trim()
    const location = String(event?.location || '').trim().toLowerCase()
    const isCreatedNoise = ['ORDER_CREATED', 'CREATED'].includes(status)
      && (hasCarrierEvent || description.includes('đang lấy hàng') || description.includes('chuẩn bị hàng'))
    if (isCreatedNoise) return false
    const key = [status, description, time, location].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function loadTrackingTimeline(orderId) {
  const code = String(orderId || '').trim()
  if (!code) return
  setDetailResult({ tone: 'info', title: 'Đang đọc timeline vận chuyển...', rows: ['OMS đang đọc nguồn tracking read-only nếu shop có API.'] })
  try {
    const response = await fetch(`${API}/api/logistics-watch/detail?order_id=${encodeURIComponent(code)}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    const events = Array.isArray(data.tracking_events) ? data.tracking_events : (Array.isArray(data.events) ? data.events : [])
    const tone = events.length ? 'success' : 'warning'
    const title = events.length ? 'Đã có timeline vận chuyển' : (data.message || 'Chưa có lịch trình vận chuyển')
    setDetailResult({
      tone,
      title,
      rows: [
        trackingSourceLabel(data.source) ? `Nguồn: ${trackingSourceLabel(data.source)}` : '',
        data.tracking_number ? `Tracking: ${data.tracking_number}` : '',
        data.logistics_provider ? `ĐVVC: ${data.logistics_provider}` : '',
        data.payment_method ? `Thanh toán: ${data.payment_method}` : '',
        data.customer_note ? `Ghi chú khách: ${data.customer_note}` : '',
        !events.length && data.reason ? `Lý do: ${data.reason}` : ''
      ].filter(Boolean),
      tracking_events: events,
      events,
      tracking_number: data.tracking_number || '',
      logistics_provider: data.logistics_provider || '',
      payment_method: data.payment_method || '',
      customer_note: data.customer_note || '',
      data
    })
  } catch (error) {
    setDetailResult({ tone: 'warning', title: 'Chưa đọc được timeline vận chuyển', rows: [error.message] })
  }
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
  const trackingNumber = detailTrackingNumber(order)
  const provider = detailProvider(order)
  const paymentMethod = detailPaymentMethod(order)
  const customerNote = detailCustomerNote(order)
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
        <div><small>ĐVVC</small><b>${escapeHtml(provider || 'Chưa rõ ĐVVC')}</b></div>
        <div><small>Mã vận đơn</small><b>${escapeHtml(trackingNumber || 'Chưa có tracking')}</b></div>
        <div><small>Trạng thái</small><b>${escapeHtml(statusText(order))}</b></div>
        <div><small>Thanh toán</small><b>${escapeHtml(paymentMethod || 'Chưa có dữ liệu')}</b></div>
        <div><small>Ghi chú khách</small><b>${escapeHtml(customerNote || 'Không có ghi chú')}</b></div>
      </div>
      ${renderOrderTimeline(order)}
      <div class="logistics-detail-actions">
        <button type="button" data-label-check="${code}">Kiểm tra tem</button>
        ${String(order.fulfillment_status_core || '').toUpperCase() !== 'LOGISTICS_PACKAGED' ? `<button type="button" data-mark-packed-detail="${code}">Đánh dấu đã đóng gói</button>` : ''}
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
  const topLevelOrder = data.order || data.data?.order
  const order = topLevelOrder
  if (!order?.order_id) return
  const key = String(order.order_id)
  const current = state.orderMap.get(key) || state.activeOrder || {}
  const merged = {
    ...current,
    ...order,
    tracking_number: order.tracking_number || data.tracking_number || data.data?.tracking_number || current.tracking_number,
    shipping_carrier: order.shipping_carrier || data.logistics_provider || data.data?.logistics_provider || current.shipping_carrier
  }
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
  const reason = String(label.label_download_reason || '').trim()
  if (reason) return reason
  if (!error || error === 'not_found') return 'Chưa có tem đã lưu trong kho. Chỉ tải lại được khi shop có capability read-only.'
  if (error === 'missing_api_token') return 'Shop chưa có API tem, cần tải thủ công từ Seller Center.'
  return `Lý do: ${error}`
}

async function loadLabelStatus(orderId) {
  const response = await fetch(`${API}/api/labels/status?order_id=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Không kiểm tra được trạng thái tem.')
  return data
}

function canDownloadLabel(status = {}) {
  return status.label_status === 'eligible'
    && status.label_download_supported === true
    && status.label_download_read_only === true
    && status.label_download_requires_manual !== true
}

async function refreshLabelFromDrawer(orderId) {
  try {
    const status = await loadLabelStatus(orderId)
    if (!canDownloadLabel(status)) {
      setDetailResult({
        tone: 'warning',
        title: `Chưa đủ điều kiện tải tem cho đơn ${orderId}`,
        rows: [
          `${status.platform || state.activeOrder?.platform || 'Sàn'} · ${status.shop || state.activeOrder?.shop || 'shop chưa rõ'}`,
          labelProblemText(status),
          'OMS chưa tạo job helper hoặc tải tem hàng loạt trong lượt này.'
        ]
      })
      return
    }

    const response = await fetch(`${API}/api/label/${encodeURIComponent(orderId)}/refresh`, { method: 'POST' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(data.message || data.error || 'Không tải lại được tem read-only.')
    setDetailResult({
      tone: 'success',
      title: `Đã tải lại tem read-only cho đơn ${orderId}`,
      rows: ['Tem đã lưu vào kho R2. Không có thao tác xác nhận đơn hoặc sắp xếp vận chuyển.'],
      link: { href: `${API}/api/label/${encodeURIComponent(orderId)}.pdf`, label: 'Mở tem' }
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
            'TikTok chưa bật tải tem tự động; xử lý tem thủ công rồi kiểm lại.'
          ]
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
        data.found ? `${data.order.platform || ''} · ${data.order.shop || ''} · ${statusText(data.order)}` : 'OMS chưa tìm thấy đơn theo mã này.',
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
  loadTrackingTimeline(key)
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
