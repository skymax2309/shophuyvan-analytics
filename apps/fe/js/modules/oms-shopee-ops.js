import { API } from '../oms-dashboard/oms-api.js'
import { showToast } from '../utils/helpers.js'

let opsState = null

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function jsString(value = '') {
  return JSON.stringify(String(value ?? ''))
}

function money(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

async function apiJson(path, options = {}) {
  const res = await fetch(API + path, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error || data.status === 'error') {
    throw new Error(data.message || data.error || `HTTP ${res.status}`)
  }
  return data
}

function ensureOpsStyles() {
  if (document.getElementById('shopeeOpsStyles')) return
  const style = document.createElement('style')
  style.id = 'shopeeOpsStyles'
  style.textContent = `
    .shopee-ops-modal {
      width: min(1280px, calc(100vw - 16px));
      max-height: 94vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .shopee-ops-body {
      overflow: auto;
      padding: 12px;
      display: grid;
      gap: 12px;
    }
    .shopee-ops-controls,
    .shopee-ops-kpis,
    .shopee-ops-grid,
    .shopee-ops-actionbar {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .shopee-ops-controls select,
    .shopee-ops-controls input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface2);
      color: var(--text);
      padding: 9px 10px;
      outline: none;
    }
    .shopee-ops-btn {
      border: 1px solid #2563eb;
      border-radius: 8px;
      background: #2563eb;
      color: #fff;
      cursor: pointer;
      font-weight: 800;
      min-height: 36px;
      padding: 8px 12px;
      white-space: nowrap;
    }
    .shopee-ops-btn.secondary {
      background: rgba(37, 99, 235, .14);
      color: #bfdbfe;
    }
    .shopee-ops-btn.warning {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, .14);
      color: #fbbf24;
    }
    .shopee-ops-btn.danger {
      border-color: #ef4444;
      background: rgba(239, 68, 68, .14);
      color: #fecaca;
    }
    .shopee-ops-kpi,
    .shopee-ops-panel {
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, .34);
      border-radius: 8px;
      padding: 10px;
      min-width: 0;
    }
    .shopee-ops-kpi span,
    .shopee-ops-note,
    .shopee-ops-muted {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .shopee-ops-kpi b {
      color: var(--text);
      display: block;
      font-size: 20px;
      margin-top: 4px;
    }
    .shopee-ops-panel h4 {
      color: var(--text);
      font-size: 14px;
      margin-bottom: 8px;
    }
    .shopee-ops-table-wrap {
      overflow-x: auto;
    }
    .shopee-ops-table {
      min-width: 1100px;
      width: 100%;
      border-collapse: collapse;
    }
    .shopee-ops-table.compact {
      min-width: 560px;
    }
    .shopee-ops-table th,
    .shopee-ops-table td {
      border-bottom: 1px solid rgba(148, 163, 184, .16);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      font-size: 12px;
    }
    .shopee-ops-table th {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 11px;
    }
    .shopee-ops-pill {
      display: inline-flex;
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 800;
      background: rgba(37, 99, 235, .16);
      color: #bfdbfe;
      margin: 2px 4px 2px 0;
    }
    .shopee-ops-pill.warn {
      background: rgba(245, 158, 11, .16);
      color: #fbbf24;
    }
    .shopee-ops-pill.bad {
      background: rgba(239, 68, 68, .16);
      color: #fecaca;
    }
    .shopee-ops-pill.good {
      background: rgba(34, 197, 94, .16);
      color: #bbf7d0;
    }
    .shopee-ops-timeline {
      display: grid;
      gap: 4px;
      max-width: 280px;
    }
    .shopee-ops-warnings {
      border: 1px solid rgba(245, 158, 11, .45);
      background: rgba(245, 158, 11, .08);
      color: #fbbf24;
      border-radius: 8px;
      padding: 10px;
      font-size: 12px;
      line-height: 1.45;
    }
    .shopee-ops-json {
      white-space: pre-wrap;
      max-height: 240px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: rgba(15, 23, 42, .46);
      color: var(--muted);
      font-size: 11px;
    }
    @media (min-width: 760px) {
      .shopee-ops-controls {
        grid-template-columns: 180px 180px 180px minmax(220px, 1fr) auto auto;
        align-items: center;
      }
      .shopee-ops-actionbar {
        grid-template-columns: repeat(4, max-content);
        align-items: center;
      }
      .shopee-ops-kpis {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }
      .shopee-ops-grid {
        grid-template-columns: minmax(0, 1.6fr) minmax(340px, .9fr);
      }
    }
  `
  document.head.appendChild(style)
}

function ensureOpsModal() {
  ensureOpsStyles()
  if (document.getElementById('shopeeOpsModal')) return
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.id = 'shopeeOpsModal'
  modal.innerHTML = `
    <div class="modal shopee-ops-modal">
      <div class="modal-header">
        <div class="modal-title">Vận hành Logistics Shopee API</div>
        <button class="modal-close" onclick="closeShopeeOps()">×</button>
      </div>
      <div class="shopee-ops-body">
        <div class="shopee-ops-controls">
          <select id="shopeeOpsStatus">
            <option value="PENDING">Đơn chờ xử lý</option>
            <option value="SHIPPING">Đơn đang giao</option>
            <option value="RETURN">Đơn hoàn/trả hàng</option>
            <option value="ALL">Tất cả trạng thái</option>
          </select>
          <select id="shopeeOpsLive">
            <option value="1">Kiểm tra API thật</option>
            <option value="0">Chỉ dữ liệu local</option>
          </select>
          <select id="shopeeOpsInvoice">
            <option value="0">Không kiểm tra hóa đơn</option>
            <option value="1">Kiểm tra hóa đơn</option>
          </select>
          <input id="shopeeOpsSearch" placeholder="Tìm mã đơn, khách, tracking...">
          <button class="shopee-ops-btn" onclick="loadShopeeOps()">Tải dữ liệu</button>
          <button class="shopee-ops-btn secondary" onclick="openBotSettings()">Tự động vận hành</button>
        </div>
        <div class="shopee-ops-actionbar">
          <button class="shopee-ops-btn warning" onclick="dryRunShopeeMassShip()">Dry-run xử lý loạt</button>
          <button class="shopee-ops-btn secondary" onclick="loadShopeeAddressList()">Lấy địa chỉ kho</button>
          <button class="shopee-ops-btn secondary" onclick="loadShopeeOps()">Làm mới tracking</button>
        </div>
        <div id="shopeeOpsAddressPanel"></div>
        <div id="shopeeOpsContent">
          <div class="shopee-ops-muted">Đang tải...</div>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(modal)
}

function warningRows(data) {
  const warnings = [
    ...(data.warnings || []),
    ...((data.live_signals || []).flatMap(row => (row.warnings || []).map(item => ({ ...item, order_sn: row.order_sn }))))
  ]
  if (!warnings.length) return ''
  return `
    <div class="shopee-ops-warnings">
      ${warnings.slice(0, 10).map(item => {
        const prefix = item.order_sn ? `${item.order_sn}: ` : ''
        const endpoint = item.endpoint ? `${item.endpoint} - ` : ''
        return `<div>${escapeHtml(prefix + endpoint + (item.message || item.error || String(item)))}</div>`
      }).join('')}
      ${warnings.length > 10 ? `<div>+${warnings.length - 10} cảnh báo khác</div>` : ''}
    </div>
  `
}

function signalMap(data) {
  return new Map((data.live_signals || []).map(row => [String(row.order_sn), row]))
}

function renderTracking(signal = {}, order = {}) {
  const summary = signal.tracking_summary || {}
  if (!signal.order_sn) {
    return `<div class="shopee-ops-muted">Chưa kiểm tra live.</div>`
  }
  const tracking = order.tracking_number || signal.tracking_number || summary.tracking_number || signal.package_number || ''
  const latest = summary.latest_description || summary.latest_status || ''
  return `
    <div><b>${escapeHtml(tracking || 'Chưa có tracking')}</b></div>
    <div class="shopee-ops-muted">${escapeHtml(latest || 'Shopee chưa trả timeline')}</div>
    ${summary.latest_time ? `<div class="shopee-ops-muted">${escapeHtml(summary.latest_time)}</div>` : ''}
    ${summary.event_count ? `<span class="shopee-ops-pill good">${summary.event_count} mốc vận chuyển</span>` : '<span class="shopee-ops-pill warn">0 mốc vận chuyển</span>'}
  `
}

function renderCarrierPanel(data) {
  const rows = data.carrier_performance || []
  return `
    <div class="shopee-ops-panel">
      <h4>Hiệu suất đơn vị vận chuyển</h4>
      <div class="shopee-ops-table-wrap">
        <table class="shopee-ops-table compact">
          <thead>
            <tr>
              <th>ĐVVC</th>
              <th>Đơn</th>
              <th>Tracking</th>
              <th>Giao lỗi</th>
              <th>TB xử lý</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td><b>${escapeHtml(row.carrier)}</b><div class="shopee-ops-muted">${escapeHtml(row.latest_event || '')}</div></td>
                <td>${number(row.orders)}</td>
                <td>${number(row.with_tracking)} / ${number(row.orders)}</td>
                <td>${number(row.failed_delivery)}</td>
                <td>${row.fulfillment_samples ? `${number(row.avg_fulfillment_hours, 1)} giờ` : 'Chưa đủ dữ liệu'}</td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="shopee-ops-muted">Chưa có dữ liệu vận chuyển.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `
}

function renderPickList(pickList = []) {
  return `
    <div class="shopee-ops-panel">
      <h4>Pick list tập trung</h4>
      <div class="shopee-ops-table-wrap">
        <table class="shopee-ops-table compact">
          <thead><tr><th>SKU / sản phẩm</th><th>SL</th><th>Đơn</th></tr></thead>
          <tbody>
            ${pickList.slice(0, 40).map(item => `
              <tr>
                <td><b>${escapeHtml(item.sku || item.variation_name || item.product_name || '')}</b><div class="shopee-ops-muted">${escapeHtml(item.product_name || '')}</div></td>
                <td>${number(item.qty)}</td>
                <td>${number(item.orders)}</td>
              </tr>
            `).join('') || '<tr><td colspan="3" class="shopee-ops-muted">Chưa có pick list.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `
}

function renderOps(data) {
  opsState = data
  const box = document.getElementById('shopeeOpsContent')
  if (!box) return
  if (data.error) {
    box.innerHTML = `<div class="shopee-ops-warnings">Không tải được vận hành Shopee: ${escapeHtml(data.error)}</div>`
    return
  }
  const summary = data.summary || {}
  const signals = signalMap(data)
  const orders = data.orders || []
  const pickList = data.pick_list || []
  box.innerHTML = `
    <div class="shopee-ops-note">
      Chế độ an toàn: hệ thống chỉ gửi thật lên Shopee khi có <b>execute=true</b> và chuỗi xác nhận riêng.
      Các nút gọi ship/ship loạt/đổi kho trong màn này mặc định chỉ dry-run để tránh thao tác nhầm trên đơn thật.
    </div>
    <div class="shopee-ops-kpis">
      <div class="shopee-ops-kpi"><span>Đơn trong bộ lọc</span><b>${number(summary.orders)}</b></div>
      <div class="shopee-ops-kpi"><span>Chưa có tracking</span><b>${number(summary.no_tracking)}</b></div>
      <div class="shopee-ops-kpi"><span>Giao không thành công</span><b>${number(summary.failed_delivery)}</b></div>
      <div class="shopee-ops-kpi"><span>Hoàn / hoàn tiền</span><b>${number(summary.return_or_refund)}</b></div>
      <div class="shopee-ops-kpi"><span>API đã kiểm</span><b>${number(summary.live_checked)}</b></div>
      <div class="shopee-ops-kpi"><span>TB xử lý kho</span><b>${summary.avg_fulfillment_hours ? `${number(summary.avg_fulfillment_hours, 1)}h` : '0h'}</b></div>
    </div>
    ${warningRows(data)}
    <div class="shopee-ops-grid">
      <div class="shopee-ops-panel">
        <h4>Đơn và tracking realtime</h4>
        <div class="shopee-ops-table-wrap">
          <table class="shopee-ops-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Shop / khách</th>
                <th>Trạng thái</th>
                <th>Vận chuyển</th>
                <th>Tracking API</th>
                <th>API / tem</th>
                <th>Thao tác an toàn</th>
              </tr>
            </thead>
            <tbody>
              ${orders.slice(0, 30).map(order => {
                const signal = signals.get(String(order.order_id)) || {}
                const sp = signal.shipping_parameter
                const pd = signal.package_detail
                const invoice = signal.buyer_invoice_info
                const orderId = jsString(order.order_id)
                return `
                  <tr>
                    <td><b>${escapeHtml(order.order_id)}</b><div class="shopee-ops-muted">${escapeHtml(order.order_date || '')} · ${money(order.revenue)}</div></td>
                    <td><b>${escapeHtml(order.shop || '')}</b><div class="shopee-ops-muted">${escapeHtml(order.customer_name || '')}</div></td>
                    <td>
                      <span class="shopee-ops-pill">${escapeHtml(order.oms_status || '')}</span>
                      <div class="shopee-ops-muted">${escapeHtml(order.shipping_status || '')}</div>
                    </td>
                    <td>
                      <b>${escapeHtml(order.shipping_carrier || signal.tracking_summary?.carrier || signal.detail?.shipping_carrier || '')}</b>
                      <div class="shopee-ops-muted">Mã kiện: ${escapeHtml(signal.package_number || 'Chưa có')}</div>
                    </td>
                    <td>${renderTracking(signal, order)}</td>
                    <td>
                      <div>${sp ? 'Có shipping parameter' : 'Chưa có shipping parameter'}</div>
                      <div>${pd ? 'Có package detail' : (signal.package_number ? 'Có mã kiện' : 'Chưa có mã kiện')}</div>
                      <div>${invoice ? 'Có thông tin hóa đơn' : 'Chưa kiểm tra hóa đơn'}</div>
                    </td>
                    <td>
                      <button class="shopee-ops-btn secondary" onclick="checkShopeeOpsOrder(${orderId})">Kiểm tra tracking</button>
                      <button class="shopee-ops-btn secondary" onclick="refreshShopeeOpsLabel(${orderId})">Tải tem read-only</button>
                      <button class="shopee-ops-btn secondary" onclick="viewShopeeOpsLabel(${orderId})">Xem tem</button>
                      <button class="shopee-ops-btn warning" onclick="dryRunShopeeShip(${orderId})">Dry-run gọi ship</button>
                    </td>
                  </tr>
                `
              }).join('') || '<tr><td colspan="7" class="shopee-ops-muted">Không có đơn trong bộ lọc.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div style="display:grid; gap:12px;">
        ${renderCarrierPanel(data)}
        ${renderPickList(pickList)}
      </div>
    </div>
  `
}

export async function loadShopeeOps() {
  ensureOpsModal()
  const box = document.getElementById('shopeeOpsContent')
  if (box) box.innerHTML = '<div class="shopee-ops-muted">Đang tải dữ liệu vận hành Shopee...</div>'
  const qs = new URLSearchParams()
  qs.set('status', document.getElementById('shopeeOpsStatus')?.value || 'PENDING')
  qs.set('live', document.getElementById('shopeeOpsLive')?.value || '1')
  qs.set('include_tracking', '1')
  qs.set('include_invoice', document.getElementById('shopeeOpsInvoice')?.value || '0')
  qs.set('limit', '30')
  qs.set('live_limit', '10')
  const search = document.getElementById('shopeeOpsSearch')?.value || ''
  const shop = document.getElementById('f_shop')?.value || ''
  if (search) qs.set('search', search)
  if (shop) qs.set('shop', shop)
  try {
    const data = await apiJson('/api/operations/shopee/workbench?' + qs.toString())
    renderOps(data)
  } catch (error) {
    renderOps({ error: error.message })
  }
}

export function openShopeeOps() {
  ensureOpsModal()
  document.getElementById('shopeeOpsModal')?.classList.add('open')
  loadShopeeOps()
}

export function closeShopeeOps() {
  document.getElementById('shopeeOpsModal')?.classList.remove('open')
}

export async function checkShopeeOpsOrder(orderSn) {
  try {
    await apiJson('/api/operations/shopee/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_tracking_info', order_sn: orderSn })
    })
    showToast('Đã gọi get_tracking_info thật cho đơn ' + orderSn)
    await loadShopeeOps()
  } catch (error) {
    showToast('Lỗi kiểm tra tracking Shopee: ' + error.message)
  }
}

export async function dryRunShopeeShip(orderSn) {
  try {
    const data = await apiJson('/api/operations/shopee/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ship_order', payload: { order_sn: orderSn } })
    })
    if (data.error) throw new Error(data.message || data.error)
    if (!data.dry_run) throw new Error('Phản hồi không phải dry-run, đã chặn trên frontend.')
    showToast('Dry-run ship_order OK. Chưa gửi thao tác lên Shopee.')
  } catch (error) {
    showToast('Lỗi dry-run ship_order: ' + error.message)
  }
}

export async function dryRunShopeeMassShip() {
  try {
    const orders = (opsState?.orders || []).slice(0, 20).map(order => ({ order_sn: order.order_id }))
    if (!orders.length) {
      showToast('Không có đơn để dry-run xử lý loạt.')
      return
    }
    const data = await apiJson('/api/operations/shopee/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mass_ship_order', payload: { order_list: orders } })
    })
    if (data.error) throw new Error(data.message || data.error)
    if (!data.dry_run) throw new Error('Phản hồi không phải dry-run, đã chặn trên frontend.')
    showToast(`Dry-run mass_ship_order OK cho ${orders.length} đơn. Chưa gửi lên Shopee.`)
  } catch (error) {
    showToast('Lỗi dry-run xử lý loạt: ' + error.message)
  }
}

export async function refreshShopeeOpsLabel(orderSn) {
  const ok = window.confirm(`Tải tem vận chuyển read-only từ Shopee cho đơn ${orderSn}? OMS chỉ tải document đã sẵn sàng, không gọi create_shipping_document, ship_order hoặc sắp xếp vận chuyển.`)
  if (!ok) return
  try {
    const data = await apiJson(`/api/label/${encodeURIComponent(orderSn)}/refresh`, { method: 'POST' })
    showToast(`Đã tải tem read-only ${orderSn}: ${data.content_type || data.storage_key || 'OK'}`)
  } catch (error) {
    showToast('Lỗi tải tem read-only: ' + error.message)
  }
}

export function viewShopeeOpsLabel(orderSn) {
  window.open(`${API}/api/label/${encodeURIComponent(orderSn)}`, '_blank', 'noopener,noreferrer')
}

export async function loadShopeeAddressList() {
  const panel = document.getElementById('shopeeOpsAddressPanel')
  if (panel) panel.innerHTML = '<div class="shopee-ops-muted">Đang lấy danh sách địa chỉ kho từ Shopee...</div>'
  try {
    const data = await apiJson('/api/operations/shopee/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_address_list' })
    })
    if (panel) {
      panel.innerHTML = `
        <div class="shopee-ops-panel">
          <h4>Địa chỉ kho Shopee API</h4>
          <div class="shopee-ops-muted">Dữ liệu đọc thật từ get_address_list. Đổi kho lấy hàng vẫn là thao tác write và cần xác nhận riêng.</div>
          <pre class="shopee-ops-json">${escapeHtml(JSON.stringify(data.response || data, null, 2))}</pre>
        </div>
      `
    }
    showToast('Đã gọi get_address_list thật.')
  } catch (error) {
    if (panel) panel.innerHTML = `<div class="shopee-ops-warnings">Không lấy được địa chỉ kho: ${escapeHtml(error.message)}</div>`
    showToast('Lỗi lấy địa chỉ kho: ' + error.message)
  }
}

Object.assign(window, {
  closeShopeeOps,
  loadShopeeOps,
  checkShopeeOpsOrder,
  dryRunShopeeShip,
  dryRunShopeeMassShip,
  refreshShopeeOpsLabel,
  viewShopeeOpsLabel,
  loadShopeeAddressList
})
