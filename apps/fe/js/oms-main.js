import { API, patchOmsStatus } from './oms-api.js';
import { ShopeeHandler } from './modules/handler-shopee.js';
import { TiktokHandler } from './modules/handler-tiktok.js';
import { LazadaHandler } from './modules/handler-lazada.js';

// Dán toàn bộ code logic (currentPage, loadOrders, renderTable...) vào đây.
// Trong hàm renderTable, chỗ pltHtml (dòng 683), bạn sửa thành:
// const handler = platform === 'shopee' ? ShopeeHandler : ...

// ── STATE ───────────────────────────────────────────────────────────
let currentPage    = 1
let currentStatus  = 'ALL'
let currentType    = ''
let currentPlatform= ''
let omsCache       = []
let totalOrders    = 0
let totalPages     = 1
let debounceTimer  = null
let allSelected    = false

// ── FORMAT ──────────────────────────────────────────────────────────
const fmt = n => Number(n||0).toLocaleString('vi-VN') + 'đ'
const fmtDate = s => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return s
  return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' })
}

// ── TOAST ───────────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), duration)
}

// ── DEBOUNCE ────────────────────────────────────────────────────────
function debounceLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => loadOrders(1), 400)
}

// ── SIDEBAR SWITCH ──────────────────────────────────────────────────
function switchStatus(s) {
  currentStatus   = s === currentStatus && s !== 'ALL' ? 'ALL' : s
  currentType     = ''
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'))
  document.getElementById('tab-' + (currentStatus || 'ALL'))?.classList.add('active')
  loadOrders(1)
}

function switchType(t) {
  currentType     = t === currentType ? '' : t
  currentStatus   = 'ALL'
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(el => el.classList.remove('active'))
  if (currentType) document.getElementById('tab-' + t)?.classList.add('active')
  else document.getElementById('tab-ALL')?.classList.add('active')
  loadOrders(1)
}

function switchPlatform(p) {
  currentPlatform = p === currentPlatform ? '' : p
  currentStatus   = 'ALL'
  currentType     = ''
  document.querySelectorAll('.status-tab').forEach(el => el.classList.remove('active'))
  if (currentPlatform) document.getElementById('tab-' + p)?.classList.add('active')
  else document.getElementById('tab-ALL')?.classList.add('active')
  loadOrders(1)
}

// ── SHIPPING STATUS ──────────────────────────────────────────────────
function renderShippingStatus(s) {
  const map = {
    'Chờ lấy hàng':  { color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: '📬' },
    'Chờ xác nhận':  { color: '#a78bfa', bg: 'rgba(167,139,250,.12)', icon: '🕐' },
    'Đang giao':      { color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  icon: '🚚' },
    'Đã giao':        { color: '#22c55e', bg: 'rgba(34,197,94,.12)',   icon: '✅' },
    'Đã hủy':         { color: '#ef4444', bg: 'rgba(239,68,68,.12)',   icon: '✗'  },
    'Hoàn hàng':      { color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '↩'  },
  }
  const info = map[s] || { color: 'var(--muted)', bg: 'var(--surface2)', icon: '—' }
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${info.bg};color:${info.color};border:1px solid ${info.color}33;white-space:nowrap">${info.icon} ${s||'Chưa rõ'}</span>`
}

// ── LOAD ORDERS ─────────────────────────────────────────────────────
async function loadOrders(page = 1) {
  currentPage = page
  document.getElementById('omsTable').innerHTML =
    `<tr><td colspan="10"><div class="empty-state"><div class="icon" style="font-size:28px;margin-bottom:8px">⏳</div><p>Đang tải...</p></div></td></tr>`

  const params = new URLSearchParams({ page, limit: 50 })
  const from   = document.getElementById('f_from').value
  const to     = document.getElementById('f_to').value
  const shop     = document.getElementById('f_shop').value
  const shipping = document.getElementById('f_shipping').value
  const search   = document.getElementById('f_search').value.trim()

  if (from)   params.set('from', from)
  if (to)     params.set('to', to)
  if (shop)   params.set('shop', shop)
  if (search)   params.set('search', search)
  if (shipping) params.set('shipping_status', shipping)
  if (currentStatus && currentStatus !== 'ALL') params.set('oms_status', currentStatus)
  if (currentType)     params.set('order_type', currentType)
  if (currentPlatform) params.set('platform', currentPlatform)

  try {
    const res = await fetch(API + '/api/orders?' + params).then(r => r.json())
    omsCache   = res.data || []
    totalOrders = res.total || 0
    totalPages  = res.totalPages || 1
    renderTable()
    renderSummary()
    renderPagination()
    updateBadges(res)
  } catch (e) {
    document.getElementById('omsTable').innerHTML =
      `<tr><td colspan="10"><div class="empty-state"><div class="icon">❌</div><p>Lỗi kết nối API: ${e.message}</p></div></td></tr>`
  }
}

// ── RENDER TABLE ────────────────────────────────────────────────────
function renderTable() {
  if (!omsCache.length) {
    document.getElementById('omsTable').innerHTML =
      `<tr><td colspan="10"><div class="empty-state"><div class="icon">🔍</div><p>Không có đơn hàng nào</p></div></td></tr>`
    return
  }

  document.getElementById('omsTable').innerHTML = omsCache.map(o => {
    // Tìm chỗ hiển thị product-name và sửa lại:
<div class="product-name" title="${firstItem.product_name || firstItem.item_name || 'Không có tên'}">
    ${(firstItem.product_name || firstItem.item_name || '—').substring(0,40)}
</div>
<div class="product-sku">SKU: ${firstItem.sku || firstItem.item_sku || '—'}</div>
    const profit   = o.profit_real || 0
    const revenue  = o.revenue || 0

    // Platform tag
    const pltHtml = {
      shopee:  `<span class="plt-tag plt-shopee">🛍 Shopee</span>`,
      tiktok:  `<span class="plt-tag plt-tiktok">🎵 TikTok</span>`,
      lazada:  `<span class="plt-tag plt-lazada">🛒 Lazada</span>`,
    }[o.platform] || `<span class="plt-tag">${o.platform||'—'}</span>`

    // OMS status
    const omsInfo = {
      PENDING:           { icon: '🕐', label: 'Chờ xác nhận' },
      CONFIRMED:         { icon: '✅', label: 'Đã xác nhận' },
      PACKING:           { icon: '🗂️', label: 'Đang đóng gói' },
      PACKED:            { icon: '📦', label: 'Đã đóng gói' },
      HANDED_OVER:       { icon: '🚚', label: 'Giao shipper' },
      COMPLETED:         { icon: '🏆', label: 'Hoàn thành' },
      CANCELLED_TRANSIT: { icon: '✗',  label: 'Hủy vận chuyển' },
      FAILED_DELIVERY:   { icon: '⚠️', label: 'Giao thất bại' },
      RETURN_REFUND:     { icon: '↩',  label: 'Trả hàng' },
    }[o.oms_status] || { icon: '🕐', label: o.oms_status || 'PENDING' }

    // Order type
    const typeHtml = {
      normal: `<span class="type-normal">✓ Thành công</span>`,
      cancel: `<span class="type-cancel">✗ Hủy</span>`,
      return: `<span class="type-return">↩ Hoàn</span>`,
    }[o.order_type] || `<span>${o.order_type}</span>`

    // Image
    const imgSrc = firstItem.image_url
    const imgHtml = imgSrc
      ? `<img class="product-img" src="${imgSrc}" alt="">`
      : `<div class="product-img-placeholder">📦</div>`

    // Multi-item indicator
    const moreItems = items.length > 1
      ? `<div style="font-size:10px;color:var(--accent);margin-top:2px">+${items.length-1} SP khác</div>`
      : ''

    return `<tr class="${o.order_type==='cancel'?'':''}${o.order_type==='return'?'':''}" id="row-${uid}">
      <td><input type="checkbox" class="oms-chk" data-id="${o.order_id}" onchange="onCheck()"></td>
      <td>
        <div class="product-cell">
          ${imgHtml}
          <div class="product-info">
            <div class="product-name" title="${firstItem.product_name||'—'}">${(firstItem.product_name||'—').substring(0,40)}</div>
            <div class="product-sku">${firstItem.sku||'—'}</div>
            <div class="product-qty">× ${totalQty} sp${moreItems?'':''}</div>
            ${moreItems}
          </div>
        </div>
      </td>
      <td>
        <div class="order-id">${o.order_id}<span class="order-id-copy" onclick="copyText('${o.order_id}')">⎘</span></div>
        ${o.tracking_number ? `<div style="font-size:10px;color:var(--teal);margin-top:3px;font-family:'IBM Plex Mono',monospace">${o.tracking_number}</div>` : ''}
      </td>
      <td>${pltHtml}</td>
      <td>
        <div class="revenue rev-positive">${fmt(revenue)}</div>
        ${o.fee ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">Phí: ${fmt(o.fee)}</div>` : ''}
      </td>
      <td>
        <div class="revenue ${profit>=0?'s-green':'s-red'}">${fmt(profit)}</div>
      </td>
      <td>
        ${renderShippingStatus(o.shipping_status)}
      </td>
      <td>
        <span class="oms-tag oms-${o.oms_status||'PENDING'}">
          <span class="dot"></span>${omsInfo.label}
        </span>
      </td>
      <td>${typeHtml}</td>
      <td>
        <div class="time-main">${fmtDate(o.order_date)}</div>
        <div class="time-cell" style="margin-top:2px">${o.order_date||'—'}</div>
      </td>
      <td>
        <div class="shop-cell">
          <div class="shop-name" title="${o.shop||'—'}">${o.shop||'—'}</div>
          ${o.customer_name ? `<div class="shop-customer">👤 ${o.customer_name}</div>` : ''}
        </div>
      </td>
    </tr>`
  }).join('')
}

// ── RENDER SUMMARY ──────────────────────────────────────────────────
function renderSummary() {
  const normals  = omsCache.filter(o => o.order_type === 'normal')
  const cancels  = omsCache.filter(o => o.order_type === 'cancel')
  const returns  = omsCache.filter(o => o.order_type === 'return')
  const totalRev = normals.reduce((s,o) => s+(o.revenue||0), 0)
  const totalPro = normals.reduce((s,o) => s+(o.profit_real||0), 0)

  document.getElementById('summaryBar').innerHTML = `
    <span>Tổng <b>${totalOrders}</b> đơn &nbsp;|&nbsp; Trang này: <b>${omsCache.length}</b></span>
    <span>Doanh thu: <b class="s-blue">${fmt(totalRev)}</b></span>
    <span>Lãi thực: <b class="${totalPro>=0?'s-green':'s-red'}">${fmt(totalPro)}</b></span>
    ${cancels.length ? `<span>✗ Hủy: <b class="s-red">${cancels.length}</b></span>` : ''}
    ${returns.length ? `<span>↩ Hoàn: <b class="s-yellow">${returns.length}</b></span>` : ''}
  `
}

// ── UPDATE BADGES ───────────────────────────────────────────────────
async function updateBadges(res) {
  // Lấy counts riêng cho badges — gọi thêm API không filter
  try {
    const all = await fetch(API + '/api/orders?limit=1').then(r => r.json())
    document.getElementById('cnt-ALL').textContent = all.total || 0
  } catch {}

  // Count từ cache hiện tại
  const cnt = {
    PENDING:0, CONFIRMED:0, PACKING:0, PACKED:0, HANDED_OVER:0, COMPLETED:0,
    CANCELLED_TRANSIT:0, FAILED_DELIVERY:0, RETURN_REFUND:0,
    normal:0, cancel:0, return:0, shopee:0, tiktok:0, lazada:0
  }
  omsCache.forEach(o => {
    const s = o.oms_status || 'PENDING'
    if (cnt[s] !== undefined) cnt[s]++
    if (cnt[o.order_type] !== undefined) cnt[o.order_type]++
    if (cnt[o.platform] !== undefined) cnt[o.platform]++
  })
  Object.entries(cnt).forEach(([k,v]) => {
    const el = document.getElementById('cnt-'+k)
    if (el) el.textContent = v
  })
}

// ── PAGINATION ──────────────────────────────────────────────────────
function renderPagination() {
  document.getElementById('pagInfo').textContent =
    `Trang ${currentPage} / ${totalPages} — ${totalOrders} đơn`

  let html = `<button class="pag-btn" onclick="loadOrders(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`
  for (let i = 1; i <= totalPages; i++) {
    if (i===1 || i===totalPages || Math.abs(i-currentPage)<=2)
      html += `<button class="pag-btn ${i===currentPage?'active':''}" onclick="loadOrders(${i})">${i}</button>`
    else if (Math.abs(i-currentPage)===3)
      html += `<span style="padding:0 4px;color:var(--muted)">…</span>`
  }
  html += `<button class="pag-btn" onclick="loadOrders(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`
  document.getElementById('pagBtns').innerHTML = html
}

// ── CHECK ────────────────────────────────────────────────────────────
function onCheck() {
  const checked = getChecked()
  const n = checked.length
  document.getElementById('selInfo').innerHTML =
    n > 0 ? `Đã chọn <span>${n}</span> đơn` : 'Chưa chọn đơn nào'
  const has = n > 0
  ;['btnConfirm','btnPrepare','btnPacked','btnHandedOver',
    'btnPickList','btnCancelTransit','btnFailed','btnReturn'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.disabled = !has
  })
}

function getChecked() {
  return [...document.querySelectorAll('.oms-chk:checked')].map(c => c.dataset.id)
}

function toggleAllCheck(checked) {
  document.querySelectorAll('.oms-chk').forEach(c => c.checked = checked)
  onCheck()
}

function toggleAll() {
  allSelected = !allSelected
  toggleAllCheck(allSelected)
}

// ── ACTIONS ─────────────────────────────────────────────────────────
// ── BULK STATUS HELPER ───────────────────────────────────────────────
async function patchOmsStatus(ids, status) {
  await fetch(API + '/api/orders/bulk-oms-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: ids, oms_status: status })
  })
}

// ── QUY TRÌNH: XÁC NHẬN ĐƠN ────────────────────────────────────────
async function markConfirmed() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Xác nhận ${ids.length} đơn hàng?`)) return
  await patchOmsStatus(ids, 'CONFIRMED')
  showToast(`✅ Đã xác nhận ${ids.length} đơn`)
  loadOrders(currentPage)
}

// ── QUY TRÌNH: CHUẨN BỊ HÀNG (in PDF → bảng soạn hàng → chuyển PACKING) ──
async function markPrepare() {
  const ids = getChecked()
  if (!ids.length) return

  // Bước 1: Gửi lệnh in PDF lên bot
  try {
    await fetch(API + '/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_type: 'print_label',
        payload:   JSON.stringify({ order_ids: ids }),
        shop_name: '', platform: '',
        month: new Date().getMonth()+1, year: new Date().getFullYear(),
      })
    })
    showToast(`🖨️ Đã gửi lệnh in ${ids.length} đơn. Bot sẽ in trong vài phút.`, 3000)
  } catch(e) {
    showToast('❌ Lỗi gửi lệnh in: ' + e.message)
  }

  // Bước 2: Hiện bảng soạn hàng
  showPickList()

  // Bước 3: Chuyển trạng thái sang PACKING
  await patchOmsStatus(ids, 'PACKING')
  loadOrders(currentPage)
}

// ── QUY TRÌNH: ĐÃ ĐÓNG GÓI XONG ───────────────────────────────────
async function markPacked() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Xác nhận đã đóng gói xong ${ids.length} đơn?`)) return
  await patchOmsStatus(ids, 'PACKED')
  showToast(`📦 Đã đóng gói xong ${ids.length} đơn`)
  loadOrders(currentPage)
}

// ── QUY TRÌNH: GIAO CHO SHIPPER ────────────────────────────────────
async function markHandedOver() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Xác nhận đã giao ${ids.length} đơn cho shipper?`)) return
  await patchOmsStatus(ids, 'HANDED_OVER')
  showToast(`🚚 Đã giao ${ids.length} đơn cho shipper`)
  loadOrders(currentPage)
}

// ── QUY TRÌNH: HOÀN THÀNH ──────────────────────────────────────────
async function markCompleted() {
  const ids = getChecked()
  if (!ids.length) return
  await patchOmsStatus(ids, 'COMPLETED')
  showToast(`🏆 Hoàn thành ${ids.length} đơn`)
  loadOrders(currentPage)
}

// ── ĐÁNH DẤU CÁC TRẠNG THÁI VẤN ĐỀ ─────────────────────────────────
async function markCancelledTransit() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Đánh dấu ${ids.length} đơn bị hủy trong quá trình vận chuyển?`)) return
  await patchOmsStatus(ids, 'CANCELLED_TRANSIT')
  showToast(`✗ Đã đánh dấu ${ids.length} đơn hủy khi vận chuyển`)
  loadOrders(currentPage)
}

async function markFailedDelivery() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Đánh dấu ${ids.length} đơn giao không thành công?`)) return
  await patchOmsStatus(ids, 'FAILED_DELIVERY')
  showToast(`⚠️ Đã đánh dấu ${ids.length} đơn giao thất bại`)
  loadOrders(currentPage)
}

async function markReturnRefund() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Đánh dấu ${ids.length} đơn trả hàng hoàn tiền?`)) return
  await patchOmsStatus(ids, 'RETURN_REFUND')
  showToast(`↩ Đã đánh dấu ${ids.length} đơn trả hàng`)
  loadOrders(currentPage)
}

// Giữ lại hàm cũ để tương thích
async function markReady()   { await markPacked() }
async function markShipped() { await markHandedOver() }

// ── PICK LIST ────────────────────────────────────────────────────────
function showPickList() {
  const ids      = getChecked()
  if (!ids.length) return
  const selected = omsCache.filter(o => ids.includes(o.order_id))
  const skuMap   = new Map()

  for (const o of selected) {
    for (const item of (o.items || [])) {
      const key = item.sku || item.product_name || '—'
      if (!skuMap.has(key)) skuMap.set(key, { sku: item.sku, name: item.product_name, qty: 0, img: item.image_url })
      skuMap.get(key).qty += (item.qty || 1)
    }
  }

  const rows = [...skuMap.values()].sort((a,b) => b.qty - a.qty)
  const totalQty = rows.reduce((s,r) => s+r.qty, 0)

  document.getElementById('pickListContent').innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px">
      <b style="color:var(--text)">${selected.length}</b> đơn —
      cần nhặt tổng cộng <b style="color:var(--accent)">${totalQty}</b> sản phẩm
    </div>
    <table class="picklist-table">
      <thead><tr>
        <th style="width:52px">Ảnh</th>
        <th>SKU</th>
        <th>Tên sản phẩm</th>
        <th style="width:80px;text-align:center">SL cần nhặt</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.img
            ? `<img src="${r.img}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
            : `<div style="width:38px;height:38px;background:var(--surface2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px">📦</div>`}
          </td>
          <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted)">${r.sku||'—'}</td>
          <td style="font-size:12px;color:var(--text)">${r.name||'—'}</td>
          <td class="picklist-qty">${r.qty}</td>
        </tr>`).join('')}
      </tbody>
    </table>`

  document.getElementById('pickListModal').classList.add('open')
}

// ── PRINT LABEL ──────────────────────────────────────────────────────
async function printLabel() {
  const ids = getChecked()
  if (!ids.length) return
  try {
    await fetch(API + '/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_type: 'print_label',
        payload:   JSON.stringify({ order_ids: ids }),
        shop_name: '',
        platform:  '',
        month:     new Date().getMonth() + 1,
        year:      new Date().getFullYear(),
      })
    })
    showToast(`🖨️ Đã gửi lệnh in tem cho ${ids.length} đơn. Bot sẽ xử lý trong vài phút.`, 3500)
  } catch (e) {
    showToast('❌ Lỗi gửi lệnh in tem: ' + e.message)
  }
}

// ── SYNC (trigger Bot) ───────────────────────────────────────────────
async function syncOrders() {
  const btn  = document.querySelector('.btn-sync')
  const icon = document.getElementById('syncIcon')
  btn.classList.add('spinning')
  btn.disabled = true
  showToast('🔄 Đang đồng bộ dữ liệu...')
  await loadOrders(1)
  btn.classList.remove('spinning')
  btn.disabled = false
  const now = new Date().toLocaleTimeString('vi-VN')
  document.getElementById('lastSync').textContent = `Cập nhật lúc ${now}`
  showToast('✅ Đồng bộ xong!')
}

// ── RESET FILTER ─────────────────────────────────────────────────────
function resetFilter() {
  document.getElementById('f_from').value     = ''
  document.getElementById('f_to').value       = ''
  document.getElementById('f_shop').value     = ''
  document.getElementById('f_search').value   = ''
  document.getElementById('f_shipping').value = ''
  currentStatus   = 'ALL'
  currentType     = ''
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'))
  document.getElementById('tab-ALL').classList.add('active')
  loadOrders(1)
}

// ── COPY ─────────────────────────────────────────────────────────────
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('✅ Đã copy: ' + text))
}

// ── MODAL ─────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open')
}
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open') })
})

// ── LOAD SHOPS for filter ────────────────────────────────────────────
async function loadShopList() {
  try {
    const data = await fetch(API + '/api/top-shop').then(r => r.json())
    const sel  = document.getElementById('f_shop')
    const shops = [...new Set(data.map(s => s.shop))].sort()
    sel.innerHTML = '<option value="">Tất cả shop</option>' +
      shops.map(s => `<option value="${s}">${s}</option>`).join('')
  } catch {}
}

// ── INIT ─────────────────────────────────────────────────────────────
loadShopList()