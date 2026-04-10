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
  () => { document.getElementById('chkAll').checked = false; toggleAllCheck(false); },
  () => omsCache
);

// ── STATE ───────────────────────────────────────────────────────────
let currentPage    = 1
let currentStatus  = 'ALL'
let currentSubStatus = '' // 🌟 Thêm biến quản lý trạng thái phụ (shipping_status)
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
  if (currentSubStatus) params.set('shipping_status', currentSubStatus) // 🌟 Gửi trạng thái phụ lên Server
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
  ;['btnPrepare','btnPacked',
    'btnPickList','btnCancelTransit','btnFailed','btnReturn','btnDeleteOrders', 'btnBatchPrint'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.disabled = !has
  })
}


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

// [CORE LOGIC] CHUYỂN ĐỔI TAB 2 TẦNG (TÍCH HỢP ĐỒNG BỘ DESKTOP & MOBILE)
window.switchMainTab = function(mainStatus) {
    console.log(`[OMS LOG] 👆 Chuyển Tab Tầng 1: ${mainStatus}`);
    currentStatus = mainStatus;
    currentSubStatus = ''; // 🌟 Reset tab phụ mỗi khi chuyển tab chính

    // Dọn dẹp Menu Cây trên Desktop
    document.querySelectorAll('.sidebar-sub-menu').forEach(el => el.remove());

    // Cập nhật UI Tab Tầng 1
    document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById('tab-' + mainStatus);
    if(activeTab) activeTab.classList.add('active');

    const subConfig = {
        'PENDING': [
            { id: '', label: 'Tất Cả' },
            { id: 'Chờ xác nhận', label: 'Chờ Xác Nhận (Bot)' },
            { id: 'Chờ thanh toán', label: 'Chờ Thanh Toán (Bot)' },
            { id: 'LOGISTICS_PENDING_ARRANGE', label: 'Chưa Xử Lý (API)' },
            { id: 'LOGISTICS_REQUEST_CREATED', label: 'Đã Xử Lý (API)' },
            { id: 'LOGISTICS_PACKAGED', label: 'Đã Đóng Gói (API)' },
            { id: 'ADVANCE_FULFILMENT', label: 'Gói Sẵn Giao Nhanh' }
        ],
        'RETURN': [
            { id: '', label: 'Tất Cả' },
            { id: 'LOGISTICS_IN_RETURN', label: 'Đang Hoàn' },
            { id: 'LOGISTICS_RETURNED_BY_SHIPPER', label: 'Shipper Đã Trả' },
            { id: 'LOGISTICS_RETURN_PACKAGE_RECEIVED', label: 'Đã Nhận Đơn Hoàn' },
            { id: 'LOGISTICS_LOST', label: 'Thất Lạc' }
        ]
    };

    const subBar = document.getElementById('sub-tabs-bar'); // Vùng chứa Tầng 2 trên Mobile

    if (subConfig[mainStatus]) {
        // 1. Sinh Tầng 2 dạng "Thò Thụt" cho Máy tính
        if (activeTab) {
            const subMenu = document.createElement('div');
            subMenu.className = 'sidebar-sub-menu';
            subMenu.innerHTML = subConfig[mainStatus].map((s, index) => 
                `<div class="sub-tab ${index===0?'active':''}" data-sub="${s.id}" onclick="switchSubTab('${s.id}')">
                    <span class="sub-tab-dot"></span>${s.label}
                 </div>`
            ).join('');
            activeTab.insertAdjacentElement('afterend', subMenu);
        }

        // 2. Sinh Tầng 2 dạng "Thanh Vuốt Ngang" cho Điện thoại
        if (subBar) {
            subBar.style.display = 'flex';
            subBar.innerHTML = subConfig[mainStatus].map((s, index) => 
                `<div class="sub-tab ${index===0?'active':''}" data-sub="${s.id}" onclick="switchSubTab('${s.id}')">${s.label}</div>`
            ).join('');
        }

        currentSubStatus = subConfig[mainStatus][0].id; // 🌟 Gán vào biến phụ, KHÔNG ĐƯỢC GHI ĐÈ biến chính
    } else {
        if (subBar) subBar.style.display = 'none';
    }

    loadOrders(1);
};

window.switchSubTab = function(subStatus) {
    console.log(`[OMS LOG] 👆 Chọn Tab con: ${subStatus}`);
    currentSubStatus = subStatus; // 🌟 Gán vào biến phụ
    // Đồng bộ highlight cho cả Desktop và Mobile cùng lúc
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`.sub-tab[data-sub="${subStatus}"]`).forEach(t => t.classList.add('active'));
    loadOrders(1);
};

// ── INIT ─────────────────────────────────────────────────────────────
loadShopList()