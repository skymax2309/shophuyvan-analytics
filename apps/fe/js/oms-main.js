import { API } from './oms-api.js';
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
export function debounceLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => loadOrders(1), 400)
}

// ── SIDEBAR SWITCH ──────────────────────────────────────────────────
export function switchStatus(s) {
  currentStatus   = s === currentStatus && s !== 'ALL' ? 'ALL' : s
  currentType     = ''
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'))
  document.getElementById('tab-' + (currentStatus || 'ALL'))?.classList.add('active')
  loadOrders(1)
}

export function switchType(t) {
  currentType     = t === currentType ? '' : t
  currentStatus   = 'ALL'
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(el => el.classList.remove('active'))
  if (currentType) document.getElementById('tab-' + t)?.classList.add('active')
  else document.getElementById('tab-ALL')?.classList.add('active')
  loadOrders(1)
}

export function switchPlatform(p) {
  currentPlatform = p === currentPlatform ? '' : p
  currentStatus   = 'ALL'
  currentType     = ''
  document.querySelectorAll('.status-tab').forEach(el => el.classList.remove('active'))
  if (currentPlatform) document.getElementById('tab-' + p)?.classList.add('active')
  else document.getElementById('tab-ALL')?.classList.add('active')
  
  // 🌟 Liên hoàn cước: Lọc lại Dropdown Shop theo Sàn vừa chọn
  filterShopDropdown(currentPlatform)
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
export async function loadOrders(page = 1) {
  currentPage = page
  document.getElementById('omsTable').innerHTML =
    `<tr><td colspan="10"><div class="empty-state"><div class="icon" style="font-size:28px;margin-bottom:8px">⏳</div><p>Đang tải...</p></div></td></tr>`

  const params = new URLSearchParams({ page, limit: 50 })
  const from   = document.getElementById('f_from').value
  const to     = document.getElementById('f_to').value
  const shop     = document.getElementById('f_shop').value
  const pltFilter= document.getElementById('f_platform').value // Lấy giá trị Sàn
  const search   = document.getElementById('f_search').value.trim()
  const carrier  = document.getElementById('f_carrier').value
  const isExpress= document.getElementById('f_express').checked
  const dataStatus = document.getElementById('f_data_status').value

  if (from)   params.set('from', from)
  if (to)     params.set('to', to)
  if (dataStatus) params.set('data_status', dataStatus)
  if (shop)      params.set('shop', shop)
  if (search)    params.set('search', search)
  if (carrier)   params.set('carrier', carrier) // Truyền thẳng tham số carrier lên Server
  if (isExpress) params.set('express', '1')
  if (currentStatus && currentStatus !== 'ALL') params.set('oms_status', currentStatus)
  if (currentType)     params.set('order_type', currentType)
  
  // Nếu chọn Sàn ở Dropdown thì ưu tiên dùng nó
  if (pltFilter) {
      params.set('platform', pltFilter)
  } else if (currentPlatform) {
      params.set('platform', currentPlatform)
  }

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
  // 1. TIÊM CSS RESPONSIVE CHO MOBILE (Biến Bảng thành Thẻ Card)
  if (!document.getElementById('mobile-card-style')) {
    const style = document.createElement('style');
    style.id = 'mobile-card-style';
    style.innerHTML = `
      @media (max-width: 768px) {
        .table-wrap table { min-width: unset !important; width: 100%; display: block; }
        .table-wrap thead { display: none; }
        .table-wrap tbody, .table-wrap tr, .table-wrap td { display: block; width: 100%; }
        .table-wrap tr { background: var(--surface2); margin-bottom: 16px; border-radius: 12px; padding: 12px 16px; border: 1px solid var(--border); position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .table-wrap td { padding: 8px 0 !important; border-bottom: 1px dashed var(--border); display: flex; justify-content: space-between; align-items: center; text-align: right; }
        .table-wrap td:last-child { border-bottom: none; }
        .table-wrap td::before { content: attr(data-label); font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; margin-right: auto; padding-right: 15px; text-align: left; }
        
        /* Chỉnh riêng Cột Checkbox và Sản phẩm */
        .table-wrap td:nth-child(1) { border-bottom: none; position: absolute; top: 12px; left: 12px; width: auto; padding: 0 !important; }
        .table-wrap td:nth-child(1)::before { display: none; }
        .table-wrap td:nth-child(2) { flex-direction: column; align-items: flex-start; margin-top: 25px; text-align: left; }
        .table-wrap td:nth-child(2)::before { display: none; }
        .product-cell { width: 100%; margin-bottom: 8px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 8px; }
        .shop-cell { display: flex; flex-direction: column; align-items: flex-end; }
      }
    `;
    document.head.appendChild(style);
  }

  if (!omsCache.length) {
    document.getElementById('omsTable').innerHTML =
      `<tr><td colspan="10"><div class="empty-state"><div class="icon">🔍</div><p>Không có đơn hàng nào</p></div></td></tr>`
    return
  }

  document.getElementById('omsTable').innerHTML = omsCache.map(o => {
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

    // 2. VÒNG LẶP SẢN PHẨM: Xử lý hiển thị toàn bộ item trong đơn
    const items = o.items || []
    const totalQty = items.reduce((s, i) => s + (i.qty || 1), 0)
    
    const itemsHtml = items.map(item => {
      const imgSrc = item.image_url
      const imgHtml = imgSrc
        ? `<img class="product-img" src="${imgSrc}" alt="">`
        : `<div class="product-img-placeholder">📦</div>`
        
      return `
        <div class="product-cell">
          ${imgHtml}
          <div class="product-info">
            <div class="product-name" title="${item.product_name||'—'}">${(item.product_name||'—').substring(0,40)}</div>
            ${item.variation_name ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">Phân loại: ${item.variation_name}</div>` : ''}
            <div class="product-sku" style="margin-top:2px; color:var(--blue); display:flex; align-items:center; gap:5px;">
              ${item.sku || '<span style="color:var(--red)">Chưa Map SKU</span>'}
              ${(!item.sku || item.sku.includes('Chưa Map')) ? `<span onclick="openMapModal('${item.variation_name || item.product_name}', '${o.order_id}')" style="background:var(--accent); color:white; padding:1px 6px; border-radius:4px; font-size:10px; cursor:pointer; font-weight:bold; box-shadow: 0 0 5px var(--accent); animation: pulse 1.5s infinite;">➕ Map</span>` : ''}
              ${(item.sku && !item.sku.includes('Chưa Map') && (!item.cost_real || item.cost_real <= 0)) ? `<span onclick="openCostModal('${item.sku}')" style="background:var(--orange); color:white; padding:1px 6px; border-radius:4px; font-size:10px; cursor:pointer; font-weight:bold; box-shadow: 0 0 5px var(--orange); animation: pulse 1.5s infinite;">💲 Cập nhật Vốn</span>` : ''}
            </div>
            <div class="product-qty" style="margin-top:2px; font-weight: bold;">× ${item.qty || 1}</div>
          </div>
        </div>`
    }).join('')

// 2.5 LÔI CHI TIẾT CÁC LOẠI PHÍ TỪ SERVER RA (Luôn hiện kể cả 0đ)
    let feeBreakdown = '';
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí cố định:</span> <b>${fmt(o.fee_platform)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí thanh toán:</span> <b>${fmt(o.fee_payment)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Affiliate/Freeship:</span> <b>${fmt(o.fee_affiliate)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Quảng cáo:</span> <b>${fmt(o.fee_ads)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Dịch vụ:</span> <b>${fmt(o.fee_service)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí PiShip:</span> <b>${fmt(o.fee_piship)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Đóng gói:</span> <b>${fmt(o.fee_packaging)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Nhân công:</span> <b>${fmt(o.fee_labor)}</b></div>`;
    if (o.return_fee > 0) feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px;color:var(--red)"><span>Phí Hoàn/Phạt:</span> <b>${fmt(o.return_fee)}</b></div>`;

    const feeHtml = o.fee ? `
      <div style="position: relative; margin-top: 6px; display: inline-block; cursor: pointer; text-align: left;" 
           onmouseleave="this.querySelector('.fee-dropdown-box').style.display = 'none'"
           onclick="const box = this.querySelector('.fee-dropdown-box'); box.style.display = box.style.display === 'block' ? 'none' : 'block'">
        <div style="font-size:11px; color:var(--orange); display:inline-flex; align-items:center; gap:4px; background: rgba(249,115,22,0.1); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(249,115,22,0.2); font-weight: 600;">
           Tổng Phí: ${fmt(o.fee)} <span style="font-size:9px">▼</span>
        </div>
        <div class="fee-dropdown-box" style="display: none; position: absolute; top: 100%; right: 0; background: var(--surface2); border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; z-index: 50; width: max-content; box-shadow: 0 8px 24px rgba(0,0,0,0.6); font-size: 12px; color: var(--text); margin-top: 5px;">
           <div style="font-weight:bold; color:var(--muted); margin-bottom: 8px; border-bottom: 1px dashed var(--border); padding-bottom: 6px;">BẢNG KÊ CHI TIẾT PHÍ SÀN</div>
           ${feeBreakdown || '<div style="color:var(--muted)">Chưa có dữ liệu chi tiết</div>'}
        </div>
      </div>
    ` : '';

    // 3. RENDER DÒNG (Đã bổ sung data-label để Mobile tự nhận diện cột)
    return `<tr class="${o.order_type==='cancel'?'':''}${o.order_type==='return'?'':''}" id="row-${o.order_id}">
      <td data-label="Chọn"><input type="checkbox" class="oms-chk" data-id="${o.order_id}" onchange="onCheck()"></td>
      <td data-label="Mặt hàng">
        ${itemsHtml}
        ${items.length > 1 ? `<div style="font-size:11px; color:var(--accent); font-weight: 600; margin-top: 6px; padding-left: 4px;">Tổng cộng: ${totalQty} sản phẩm</div>` : ''}
      </td>
      <td data-label="Mã đơn hàng">
        <div class="order-id">${o.order_id}<span class="order-id-copy" onclick="copyText('${o.order_id}')">⎘</span></div>
        ${o.tracking_number ? `<div style="font-size:10px;color:var(--teal);margin-top:3px;font-family:'IBM Plex Mono',monospace">${o.tracking_number}</div>` : ''}
      </td>
      <td data-label="Sàn">${pltHtml}</td>
      <td data-label="Doanh thu">
        <div class="revenue rev-positive">${fmt(revenue)}</div>
        ${feeHtml}
      </td>
      <td data-label="Lãi thực">
        <div class="revenue ${profit>=0?'s-green':'s-red'}">${fmt(profit)}</div>
        <div style="font-size:10px;color:${o.cost_real > 0 ? 'var(--muted)' : 'var(--red)'};margin-top:2px;font-weight:600;">
           Vốn: ${fmt(o.cost_real || 0)}
        </div>
      </td>
      <td data-label="Sàn vận chuyển">
        <div style="font-weight: 600; font-size: 13px; color: var(--text); margin-bottom: 5px;">${o.shipping_carrier || 'Chưa rõ ĐVVC'}</div>
        ${renderShippingStatus(o.shipping_status || o.status)}
      </td>
      <td data-label="Kho (OMS)">
        <span class="oms-tag oms-${o.oms_status||'PENDING'}">
          <span class="dot"></span>${omsInfo.label}
        </span>
      </td>
      <td data-label="Loại">${typeHtml}</td>
      <td data-label="Thời gian">
        <div class="time-main">${fmtDate(o.order_date)}</div>
        <div class="time-cell" style="margin-top:2px">${o.order_date||'—'}</div>
      </td>
      <td data-label="Shop / KH">
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
  try {
    // Gọi thẳng API đếm tổng chuyên dụng thay vì đếm theo số dòng hiển thị
    const badges = await fetch(API + '/api/orders/badges').then(r => r.json());
    
    const keys = [
      'ALL', 'PENDING', 'CONFIRMED', 'PACKING', 'PACKED', 'HANDED_OVER', 'COMPLETED',
      'CANCELLED_TRANSIT', 'FAILED_DELIVERY', 'RETURN_REFUND',
      'normal', 'cancel', 'return', 'shopee', 'tiktok', 'lazada'
    ];
    
    keys.forEach(k => {
      const el = document.getElementById('cnt-' + k);
      // Hiển thị số, nếu không có thì mặc định là 0
      if (el) el.textContent = badges[k] || 0;
    });
  } catch (e) {
    console.error("Lỗi lấy dữ liệu đếm số tổng:", e);
  }
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
export function onCheck() {
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

export function toggleAllCheck(checked) {
  document.querySelectorAll('.oms-chk').forEach(c => c.checked = checked)
  onCheck()
}

function toggleAll() {
  allSelected = !allSelected
  toggleAllCheck(allSelected)
}

// ── ACTIONS ─────────────────────────────────────────────────────────
async function patchOmsStatus(ids, status) {
  await fetch(API + '/api/orders/bulk-oms-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: ids, oms_status: status })
  })
}

// ── QUY TRÌNH: XÁC NHẬN ĐƠN ────────────────────────────────────────
export async function markConfirmed() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Xác nhận ${ids.length} đơn hàng?`)) return
  await patchOmsStatus(ids, 'CONFIRMED')
  showToast(`✅ Đã xác nhận ${ids.length} đơn`)
  loadOrders(currentPage)
}

// ── QUY TRÌNH: CHUẨN BỊ HÀNG (in PDF → bảng soạn hàng → chuyển PACKING) ──
export async function markPrepare() {
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
export async function markPacked() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Xác nhận đã đóng gói xong ${ids.length} đơn?`)) return
  await patchOmsStatus(ids, 'PACKED')
  showToast(`📦 Đã đóng gói xong ${ids.length} đơn`)
  loadOrders(currentPage)
}

// ── QUY TRÌNH: GIAO CHO SHIPPER ────────────────────────────────────
export async function markHandedOver() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Xác nhận đã giao ${ids.length} đơn cho shipper?`)) return
  await patchOmsStatus(ids, 'HANDED_OVER')
  showToast(`🚚 Đã giao ${ids.length} đơn cho shipper`)
  loadOrders(currentPage)
}

// ── CHUẨN HÓA ĐƠN LỊCH SỬ ─────────────────────────────────────────
export async function archiveOldOrders() {
  if (!confirm("Hệ thống sẽ dựa vào 'Loại đơn' và 'Trạng thái vận chuyển' cũ để tự động phân loại hàng ngàn đơn hàng lịch sử về đúng các Tab: Hoàn thành, Hủy, Trả hàng.\n\nBạn có chắc chắn muốn chuẩn hóa?")) return;
  showToast('🔄 Đang chạy thuật toán phân loại dữ liệu...');
  try {
    await fetch(API + '/api/orders/archive-old', { method: 'POST' });
    showToast('✅ Đã chuẩn hóa dữ liệu thành công!');
    loadOrders(1);
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  }
}

// ── TÍNH LẠI GIÁ VỐN TOÀN HỆ THỐNG ─────────────────────────────────
export async function recalcAllCosts() {
  if (!confirm("Hệ thống sẽ tính toán lại toàn bộ Lãi/Lỗ của TẤT CẢ đơn hàng trong lịch sử dựa trên Giá vốn mới nhất mà bạn vừa nhập.\n\nBạn có chắc chắn muốn thực hiện?")) return;
  showToast('🔄 Đang quét Server và tính toán lại toàn bộ (có thể mất vài giây)...');
  try {
    // Gọi thẳng vào hàm recalcCost() bí mật trên file orders.js của Server
    const res = await fetch(API + '/api/orders/recalc-cost', { method: 'POST' }).then(r => r.json());
    showToast(`✅ Quá dữ! Đã cập nhật xong Lãi/Lỗ cho ${res.updated_v2 || 0} đơn hàng.`);
    loadOrders(currentPage);
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  }
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
export async function markCancelledTransit() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Đánh dấu ${ids.length} đơn bị hủy trong quá trình vận chuyển?`)) return
  await patchOmsStatus(ids, 'CANCELLED_TRANSIT')
  showToast(`✗ Đã đánh dấu ${ids.length} đơn hủy khi vận chuyển`)
  loadOrders(currentPage)
}

export async function markFailedDelivery() {
  const ids = getChecked()
  if (!ids.length) return
  if (!confirm(`Đánh dấu ${ids.length} đơn giao không thành công?`)) return
  await patchOmsStatus(ids, 'FAILED_DELIVERY')
  showToast(`⚠️ Đã đánh dấu ${ids.length} đơn giao thất bại`)
  loadOrders(currentPage)
}

export async function markReturnRefund() {
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
export function showPickList() {
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
export async function syncOrders() {
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
export function resetFilter() {
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
export function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('✅ Đã copy: ' + text))
}

// ── MODAL ─────────────────────────────────────────────────────────────
export function closeModal(id) {
  document.getElementById(id).classList.remove('open')
}
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open') })
})


// ── TRIGGER BOT CÀO ĐƠN TỪ XA (HỖ TRỢ MOBILE/WEB) ─────────────────────
export async function triggerBotScrape() {
  const btn = document.querySelector('button[onclick="triggerBotScrape()"]');
  if(btn) { btn.style.opacity = '0.7'; btn.disabled = true; }
  showToast('🔄 Đang gửi tín hiệu đánh thức Bot...');

  try {
    // Bắn một lệnh (Job) vào Server. Bot Python ở nhà sẽ lấy lệnh này để chạy.
    await fetch(API + '/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_type: 'scrape_orders',
        payload: JSON.stringify({ command: "start_scraping" }),
        shop_name: 'ALL',
        platform: 'ALL',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      })
    });
    showToast('✅ Đã phát lệnh! Bot Python ở nhà sẽ bắt đầu cào đơn mới.', 4000);
  } catch (e) {
    showToast('❌ Lỗi gửi tín hiệu: ' + e.message);
  } finally {
    if(btn) { btn.style.opacity = '1'; btn.disabled = false; }
  }
}

// ── LIÊN HOÀN SÀN -> SHOP ───────────────────────────────────────────
let globalShopList = [];
export async function loadShopList() {
  try {
    const data = await fetch(API + '/api/shops').then(r => r.json());
    globalShopList = data; // Lưu biến toàn cục
    filterShopDropdown('');
  } catch {}
}

export function filterShopDropdown(platform) {
  const sel = document.getElementById('f_shop');
  const currentVal = sel.value;
  let filtered = globalShopList;
  if (platform) {
    filtered = globalShopList.filter(s => (s.platform||'').toLowerCase() === platform.toLowerCase());
  }
  const uniqueShops = [...new Set(filtered.map(s => s.shop_name))].sort();
  sel.innerHTML = '<option value="">Tất cả shop</option>' + uniqueShops.map(s => `<option value="${s}">${s}</option>`).join('');
  if (uniqueShops.includes(currentVal)) sel.value = currentVal;
}

// ── QUICK MAP SKU CORE ─────────────────────────────────────────────
let mapSearchTimer = null;
export function openMapModal(rawName, orderId) {
  document.getElementById('mapTargetName').textContent = rawName || 'Sản phẩm lỗi tên';
  document.getElementById('mapTargetRawSku').value = rawName;
  document.getElementById('mapTargetOrderId').value = orderId;
  document.getElementById('mapSearchInput').value = '';
  document.getElementById('mapSkuResults').innerHTML = '<div style="padding:10px;color:var(--muted);text-align:center;">Gõ tên sản phẩm để tìm...</div>';
  document.getElementById('mapSkuModal').classList.add('open');
  document.getElementById('mapSearchInput').focus();
}

export function debounceSearchSku() {
  clearTimeout(mapSearchTimer);
  mapSearchTimer = setTimeout(searchDbSku, 400);
}

async function searchDbSku() {
  const keyword = document.getElementById('mapSearchInput').value.trim();
  const box = document.getElementById('mapSkuResults');
  if (keyword.length < 2) {
    box.innerHTML = '<div style="padding:10px;color:var(--muted);text-align:center;">Gõ thêm ký tự để tìm...</div>';
    return;
  }
  box.innerHTML = '<div style="padding:10px;text-align:center;">⏳ Đang tìm...</div>';
  try {
    const res = await fetch(`${API}/api/products?search=${encodeURIComponent(keyword)}`).then(r => r.json());
    if (!res.data || res.data.length === 0) {
      box.innerHTML = '<div style="padding:10px;color:var(--red);text-align:center;">Không tìm thấy SKU nào!</div>';
      return;
    }
    box.innerHTML = res.data.map(p => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px; border-bottom: 1px solid var(--border); cursor:pointer;" onclick="saveMapSku('${p.sku}')">
        <div style="display:flex; gap: 10px; align-items:center;">
          <img src="${p.image_url || ''}" style="width:30px; height:30px; border-radius:4px; background:var(--surface);">
          <div>
             <div style="color:var(--blue); font-weight:bold; font-size:12px;">${p.sku}</div>
             <div style="font-size:11px; color:var(--text);">${(p.product_name||'').substring(0,35)}</div>
          </div>
        </div>
        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;">Chốt</button>
      </div>
    `).join('');
  } catch (e) {
    box.innerHTML = '<div style="padding:10px;color:var(--red);text-align:center;">Lỗi mạng!</div>';
  }
}

window.saveMapSku = async function(internalSku) {
  const rawName = document.getElementById('mapTargetRawSku').value;
  document.getElementById('mapSkuResults').innerHTML = '<div style="padding:10px;text-align:center;color:var(--green);font-weight:bold;">🚀 Đang đẩy dữ liệu Map lên Server...</div>';
  try {
    // 🌟 ĐÃ SỬA: Đổi sang phương thức PATCH và gửi Object chuẩn (Không dùng Mảng)
    const payload = { platform_sku: rawName, internal_sku: internalSku };
    const response = await fetch(`${API}/api/sync-variations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    // Đọc phản hồi và in Log ra F12 (Console)
    const resData = await response.json();
    console.log("[QUICK MAP] Phản hồi từ Server:", resData);

    // Chặn đứng "Thành công ảo"
    if (!response.ok || resData.error) {
        throw new Error(resData.error || "Server từ chối lưu Map");
    }
    
    // Đỉnh cao: Truyền đúng SKU vừa map để Server CHỈ tính lại các đơn liên quan (Tránh sụp CPU)
    await fetch(`${API}/api/orders/recalc-cost`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: internalSku })
    });
    
    showToast(`✅ Đã Map thành công SKU: ${internalSku}`);
    closeModal('mapSkuModal');
    loadOrders(currentPage); // F5 lại bảng để hiện ảnh và giá vốn
  } catch (e) {
    showToast('❌ Lỗi lưu Map SKU: ' + e.message);
  }
}

// Bộc thép style cho nhịp đập nút Map
if(!document.getElementById('pulse-css')){
  const style = document.createElement('style');
  style.id = 'pulse-css';
  style.innerHTML = `@keyframes pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7); } 70% { transform: scale(1.05); box-shadow: 0 0 0 5px rgba(0, 255, 136, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 255, 136, 0); } }`;
  document.head.appendChild(style);
}

// ── QUICK UPDATE COST PRICE ──────────────────────────────────────────
export function openCostModal(sku) {
  document.getElementById('costTargetSku').textContent = sku;
  document.getElementById('costInvoiceInput').value = '';
  document.getElementById('costRealInput').value = '';
  document.getElementById('costPriceModal').classList.add('open');
  document.getElementById('costRealInput').focus();
}

export async function saveCostPrice() {
  const sku = document.getElementById('costTargetSku').textContent;
  const costInvoice = parseFloat(document.getElementById('costInvoiceInput').value) || 0;
  const costReal = parseFloat(document.getElementById('costRealInput').value) || 0;

  if (costReal <= 0) {
    showToast('⚠️ Vui lòng nhập Vốn Thực Tế lớn hơn 0!');
    return;
  }

  const btn = document.querySelector('#costPriceModal .btn-primary');
  btn.textContent = '⏳ Đang xử lý...';
  btn.disabled = true;

  try {
    // 1. Cập nhật thẳng vào bảng Products
    const payload = {
      sku: sku,
      cost_invoice: costInvoice,
      cost_real: costReal
    };
    
    const res = await fetch(`${API}/api/products`, {
      method: 'POST', // API cũ của bác dùng POST để upsert
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Server từ chối cập nhật sản phẩm");

    // 2. Kích hoạt tính lại giá vốn cho các đơn hàng chứa SKU này
    await fetch(`${API}/api/orders/recalc-cost`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: sku })
    });

    showToast(`✅ Đã cập nhật Giá Vốn cho mã: ${sku}`);
    closeModal('costPriceModal');
    loadOrders(currentPage);
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  } finally {
    btn.textContent = '💾 Lưu & Tính Lại Lãi/Lỗ';
    btn.disabled = false;
  }
}

// Gắn các hàm mới vào window để HTML gọi được
Object.assign(window, { openMapModal, debounceSearchSku, saveMapSku, openCostModal, saveCostPrice });
// ── INIT ─────────────────────────────────────────────────────────────
loadShopList()