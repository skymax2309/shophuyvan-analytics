// ==========================================
// MODULE: QUẢN LÝ CÁC HÀNH ĐỘNG (ACTION LAYER)
// ==========================================
import { API } from '../oms-api.js';
import { showToast } from '../utils/helpers.js';

let reloadFn = null;
let getPageFn = null;
let clearCheckFn = null;

// Cầu nối nhận các hàm tiện ích từ file main truyền sang
export function initActions(loadOrdersCallback, getPageCallback, clearCheckCallback) {
  reloadFn = loadOrdersCallback;
  getPageFn = getPageCallback;
  clearCheckFn = clearCheckCallback;
}

// Helper nội bộ: Lấy danh sách ID đang chọn
function getChecked() {
  return [...document.querySelectorAll('.oms-chk:checked')].map(c => c.dataset.id);
}

// Cập nhật trạng thái Kho
async function patchOmsStatus(ids, status) {
  await fetch(API + '/api/orders/bulk-oms-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: ids, oms_status: status })
  });
}

// ── CÁC HÀNH ĐỘNG CHÍNH ──────────────────────────────────────────
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
    if (clearCheckFn) clearCheckFn();
    if (reloadFn) reloadFn(1);
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  } finally {
    if (btn) { btn.style.opacity = '1'; btn.disabled = false; }
  }
}

export async function markConfirmed() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Xác nhận ${ids.length} đơn hàng?`)) return;
  await patchOmsStatus(ids, 'CONFIRMED');
  showToast(`✅ Đã xác nhận ${ids.length} đơn`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markPrepare() {
  const ids = getChecked();
  if (!ids.length) return;

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
    });
    showToast(`🖨️ Đã giao việc cho Bot! Khi nào Bot tải xong phiếu in, đơn sẽ tự động nhảy sang Tab "Đang đóng gói".`, 6000);
  } catch(e) {
    showToast('❌ Lỗi gửi lệnh in: ' + e.message);
  }
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markPacked() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Xác nhận đã đóng gói xong ${ids.length} đơn?`)) return;
  await patchOmsStatus(ids, 'PACKED');
  showToast(`📦 Đã đóng gói xong ${ids.length} đơn`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markHandedOver() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Xác nhận đã giao ${ids.length} đơn cho shipper?`)) return;
  await patchOmsStatus(ids, 'HANDED_OVER');
  showToast(`🚚 Đã giao ${ids.length} đơn cho shipper`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markCancelledTransit() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Đánh dấu ${ids.length} đơn bị hủy trong quá trình vận chuyển?`)) return;
  await patchOmsStatus(ids, 'CANCELLED_TRANSIT');
  showToast(`✗ Đã đánh dấu ${ids.length} đơn hủy khi vận chuyển`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markFailedDelivery() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Đánh dấu ${ids.length} đơn giao không thành công?`)) return;
  await patchOmsStatus(ids, 'FAILED_DELIVERY');
  showToast(`⚠️ Đã đánh dấu ${ids.length} đơn giao thất bại`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markReturnRefund() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Đánh dấu ${ids.length} đơn trả hàng hoàn tiền?`)) return;
  await patchOmsStatus(ids, 'RETURN_REFUND');
  showToast(`↩ Đã đánh dấu ${ids.length} đơn trả hàng`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function archiveOldOrders() {
  if (!confirm("Hệ thống sẽ dựa vào 'Loại đơn' và 'Trạng thái vận chuyển' cũ để tự động phân loại hàng ngàn đơn hàng lịch sử về đúng các Tab: Hoàn thành, Hủy, Trả hàng.\\n\\nBạn có chắc chắn muốn chuẩn hóa?")) return;
  showToast('🔄 Đang chạy thuật toán phân loại dữ liệu...');
  try {
    await fetch(API + '/api/orders/archive-old', { method: 'POST' });
    showToast('✅ Đã chuẩn hóa dữ liệu thành công!');
    if (reloadFn) reloadFn(1);
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  }
}

export async function recalcAllCosts() {
  if (!confirm("Hệ thống sẽ tính toán lại toàn bộ Lãi/Lỗ của TẤT CẢ đơn hàng trong lịch sử dựa trên Giá vốn mới nhất mà bạn vừa nhập.\\n\\nBạn có chắc chắn muốn thực hiện?")) return;
  showToast('🔄 Đang quét Server và tính toán lại toàn bộ (có thể mất vài giây)...');
  try {
    const res = await fetch(API + '/api/orders/recalc-cost', { method: 'POST' }).then(r => r.json());
    showToast(`✅ Quá dữ! Đã cập nhật xong Lãi/Lỗ cho ${res.updated_v2 || 0} đơn hàng.`);
    if (reloadFn) reloadFn(getPageFn());
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  }
}

export async function triggerBotScrape() {
  const btn = document.querySelector('button[onclick="triggerBotScrape()"]');
  if(btn) { btn.style.opacity = '0.7'; btn.disabled = true; }
  showToast('🔄 Đang gửi tín hiệu đánh thức Bot...');

  try {
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

// Bơm thẳng các hàm này ra Window để các nút bấm (onclick) trên HTML gọi được
Object.assign(window, {
  deleteErrorOrders, markConfirmed, markPrepare, markPacked, markHandedOver,
  markCancelledTransit, markFailedDelivery, markReturnRefund,
  archiveOldOrders, recalcAllCosts, triggerBotScrape
});