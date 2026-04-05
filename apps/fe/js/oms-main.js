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


// ── CHECK ────────────────────────────────────────────────────────────
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

// ── QUY TRÌNH: XÓA HÀNG LOẠT (DỌN RÁC) ────────────────────────────────
export async function deleteErrorOrders() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`🚨 NGUY HIỂM: Xóa vĩnh viễn ${ids.length} đơn hàng khỏi Server? Hành động này không thể hoàn tác!`)) return;

  const btn = document.getElementById('btnDeleteOrders');
  if (btn) { btn.style.opacity = '0.7'; btn.disabled = true; }
  showToast('🗑️ Đang xóa dữ liệu...');

  try {
    const res = await fetch(API + '/api/orders/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ids: ids })
    });

    if (!res.ok) throw new Error("Lỗi khi xóa trên Server");
    
    showToast(`✅ Đã xóa sạch ${ids.length} đơn hàng!`);
    document.getElementById('chkAll').checked = false;
    toggleAllCheck(false);
    loadOrders(1);
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  } finally {
    if (btn) { btn.style.opacity = '1'; btn.disabled = false; }
  }
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


// ── QUY TRÌNH: CHUẨN BỊ HÀNG (Bắn lệnh In Phiếu Vận Chuyển → Chuyển PACKING) ──
export async function markPrepare() {
  const ids = getChecked()
  if (!ids.length) return

  // Bước 1: Gửi lệnh in Phiếu Vận Chuyển (PDF) lên Server cho Bot Python ở nhà lấy về xử lý
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
    showToast(`🖨️ Đã gửi lệnh chuẩn bị & in phiếu cho ${ids.length} đơn. Bot Python sẽ tự động xử lý!`, 4000)
  } catch(e) {
    showToast('❌ Lỗi gửi lệnh in: ' + e.message)
  }

  // (Đã xóa hàm showPickList() ở đây để không bị nhảy Popup gây nhầm lẫn nữa)

  // Bước 2: Chuyển trạng thái sang PACKING (Đang đóng gói)
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



// ── MODAL ─────────────────────────────────────────────────────────────


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


// Dùng hàm In từ file oms-pdf.js, truyền danh sách đơn được chọn vào
export async function printBatchLabels() {
  await printBatchLabelsCore(getChecked());
}

// Mở lại cổng xuất khẩu cho các file HTML gọi đến
export { fmt, fmtDate, showToast, copyText, closeModal };

// ── INIT ─────────────────────────────────────────────────────────────
loadShopList()