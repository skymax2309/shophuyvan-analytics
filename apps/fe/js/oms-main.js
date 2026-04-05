import { API } from './oms-api.js';
// NẠP LINH KIỆN ĐÃ CHIA NHỎ
import { fmt, fmtDate, showToast, copyText, closeModal } from './utils/helpers.js';
import { printBatchLabelsCore } from './modules/oms-pdf.js';
// BỔ SUNG CỤM MODULE POPUP NÀY
import { initModals, renderPickListModal } from './modules/oms-modals.js';
// THÊM DÒNG NÀY ĐỂ KÉO CÁC HÀM VẼ GIAO DIỆN VÀO:
import { renderShippingStatus, renderTable, renderSummary, updateBadges, renderPagination } from './modules/oms-render.js';

// Kích hoạt cầu nối: Báo cho Popup biết dùng hàm loadOrders để tải lại bảng
initModals(() => loadOrders(currentPage));

import { initActions } from './modules/oms-actions.js';
// Kích hoạt cầu nối Hành động
initActions(
  (page) => loadOrders(page),
  () => currentPage,
  () => { document.getElementById('chkAll').checked = false; toggleAllCheck(false); }
);

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
    
    // Ném dữ liệu sang cho File oms-render.js vẽ
    renderTable(omsCache);
    renderSummary(omsCache, totalOrders);
    renderPagination(currentPage, totalPages, totalOrders);
    updateBadges();
  } catch (e) {
    document.getElementById('omsTable').innerHTML =
      `<tr><td colspan="10"><div class="empty-state"><div class="icon">❌</div><p>Lỗi kết nối API: ${e.message}</p></div></td></tr>`
  }
}


// ── CHECK & GET IDS ──────────────────────────────────────────────────
export function toggleAllCheck(checked) {
  document.querySelectorAll('.oms-chk').forEach(c => c.checked = checked);
  onCheck();
}

export function getChecked() {
  return [...document.querySelectorAll('.oms-chk:checked')].map(c => c.dataset.id);
}

export function onCheck() {
  const checked = getChecked()
  const n = checked.length
  const selInfo = document.getElementById('selInfo')
  if (selInfo) selInfo.innerHTML = n > 0 ? `Đã chọn <span>${n}</span> đơn` : 'Chưa chọn đơn nào'
  const has = n > 0
  ;['btnConfirm','btnPrepare','btnPacked','btnHandedOver',
    'btnPickList','btnCancelTransit','btnFailed','btnReturn','btnDeleteOrders', 'btnBatchPrint'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.disabled = !has
  })
}


// Giữ lại hàm cũ để tương thích
async function markReady()   { await markPacked() }
async function markShipped() { await markHandedOver() }

// ── PICK LIST ────────────────────────────────────────────────────────
export function showPickList() {
  const ids = getChecked();
  if (!ids.length) return;
  const selected = omsCache.filter(o => ids.includes(o.order_id));
  
  // Ném toàn bộ dữ liệu thô sang file Modals để nó tự tính toán và vẽ Giao diện
  renderPickListModal(selected);
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


// Dùng hàm In từ file oms-pdf.js, truyền danh sách đơn được chọn vào
export async function printBatchLabels() {
  await printBatchLabelsCore(getChecked());
}

// Mở lại cổng xuất khẩu cho các file HTML gọi đến
export { fmt, fmtDate, showToast, copyText, closeModal };

// ── INIT ─────────────────────────────────────────────────────────────
loadShopList()