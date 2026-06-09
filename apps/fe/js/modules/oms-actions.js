// ==========================================
// MODULE: QUẢN LÝ CÁC HÀNH ĐỘNG (ACTION LAYER)
// ==========================================
import { API } from '../oms-dashboard/oms-api.js';
import { showToast } from '../utils/helpers.js';
import { wakeRadarLocal } from './oms-radar-helper.js';

let reloadFn = null;
let getPageFn = null;
let clearCheckFn = null;
let getCacheFn = null; // Bổ sung kho chứa dữ liệu
let buyerCancelRowListenerReady = false;
export function initActions(loadOrdersCallback, getPageCallback, clearCheckCallback, getCacheCallback) {
  reloadFn = loadOrdersCallback;
  getPageFn = getPageCallback;
  clearCheckFn = clearCheckCallback;
  getCacheFn = getCacheCallback;
  if (!buyerCancelRowListenerReady) {
    buyerCancelRowListenerReady = true;
    document.addEventListener('click', async event => {
      const btn = event.target.closest('[data-buyer-cancel-decision][data-order-id]');
      if (!btn) return;
      event.preventDefault();
      btn.disabled = true;
      try {
        await decideBuyerCancellationForOrder(btn.dataset.orderId, btn.dataset.buyerCancelDecision);
      } finally {
        btn.disabled = false;
      }
    });
  }
}

// Helper nội bộ: Lấy danh sách ID đang chọn
function getChecked() {
  return [...document.querySelectorAll('.oms-chk:checked')].map(c => c.dataset.id);
}

function normalizePlatform(value) {
  return String(value || '').trim().toLowerCase();
}

function notifyStatusUpdated(ids, omsStatus, shippingStatus, message = '') {
  window.dispatchEvent(new CustomEvent('oms:status-updated', {
    detail: {
      order_ids: ids,
      oms_status: omsStatus,
      shipping_status: shippingStatus,
      message
    }
  }))
}

// Cập nhật trạng thái Kho (CHUẨN 2 TẦNG)
async function patchOmsStatus(ids, omsStatus, shippingStatus) {
  const res = await fetch(API + '/api/orders/bulk-oms-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: ids, oms_status: omsStatus, shipping_status: shippingStatus })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Không cập nhật được trạng thái OMS');
  }
  return data;
}

async function loadLabelStatus(orderId) {
  const res = await fetch(`${API}/api/labels/status?order_id=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error && data.error !== 'not_found') {
    return { order_id: orderId, has_label: false, error: data.error || 'Không kiểm tra được tem.' }
  }
  return data
}

async function ensureLabelsBeforePacked(ids) {
  const cache = Array.isArray(getCacheFn?.()) ? getCacheFn() : []
  const selected = ids.map(id => cache.find(order => String(order.order_id || '') === String(id)) || { order_id: id })
  const rowsNeedLabel = selected.filter(order => ['shopee', 'lazada', 'tiktok'].includes(normalizePlatform(order.platform)))
  if (!rowsNeedLabel.length) return true

  // Đơn sàn có tem vận chuyển phải có file thật trước khi chốt đóng gói để khiếu nại/video đóng gói có đủ bằng chứng.
  const statuses = await Promise.all(rowsNeedLabel.map(async order => ({
    ...order,
    ...(await loadLabelStatus(order.order_id))
  })))
  const missing = statuses.filter(row => !row.has_label)
  if (!missing.length) return true

  const supported = missing.filter(row => row.label_status === 'eligible' && row.label_download_supported && row.label_download_read_only)
  if (supported.length) {
    const response = await fetch(`${API}/api/label/backfill-eligible`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_ids: supported.map(row => row.order_id),
        trigger: 'oms_before_mark_packed',
        dry_run: false
      })
    })
    const data = await response.json().catch(() => ({}))
    if (data.downloaded) {
      showToast(`Đã tự tải ${data.downloaded} tem. Đang kiểm lại trước khi đóng gói.`, 5000)
    }
  }

  const after = await Promise.all(rowsNeedLabel.map(async order => ({
    ...order,
    ...(await loadLabelStatus(order.order_id))
  })))
  const stillMissing = after.filter(row => !row.has_label)
  if (!stillMissing.length) return true

  const sample = stillMissing.slice(0, 3).map(row => row.order_id).join(', ')
  const manual = stillMissing.filter(row => row.label_status === 'manual_required' || row.label_download_requires_manual)
  showToast(`Còn ${stillMissing.length} đơn chưa có tem đã lưu nên chưa chuyển Đã đóng gói. Mẫu: ${sample}. ${manual.length ? `${manual.length} đơn cần tải thủ công/chưa hỗ trợ.` : 'Backend đã thử tải tự động nhưng chưa có file hợp lệ.'}`, 9000)
  return false
}

function getSelectedGroups(ids) {
  const cache = Array.isArray(getCacheFn?.()) ? getCacheFn() : [];
  const byId = new Map(cache.map(o => [String(o.order_id), o]));
  const groups = new Map();

  ids.forEach(id => {
    const order = byId.get(String(id));
    if (!order?.shop || !order?.platform) {
      throw new Error(`Không xác định được shop/sàn của đơn ${id}`);
    }
    const platform = String(order.platform).toLowerCase();
    const shop = String(order.shop);
    const key = `${platform}||${shop}`;
    if (!groups.has(key)) groups.set(key, { platform, shop, order_ids: [] });
    groups.get(key).order_ids.push(id);
  });

  return [...groups.values()];
}

async function createPrintJob(group) {
  const now = new Date();
  const res = await fetch(API + '/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_type: 'print_label',
      payload: JSON.stringify({ order_ids: group.order_ids }),
      shop_name: group.shop,
      platform: group.platform,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Không tạo được job in phiếu cho shop ${group.shop}`);
  }
  return res.json().catch(() => ({}));
}

function jobsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  return [];
}

async function waitForBotJob(jobId, label) {
  if (!jobId) return;
  for (let i = 0; i < 90; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const payload = await fetch(API + '/api/jobs?mode=monitor').then(r => r.json()).catch(() => null);
    const job = jobsArray(payload).find(j => Number(j.id) === Number(jobId));
    if (!job) continue;

    const status = String(job.status || '').toLowerCase();
    if (status === 'completed') {
      showToast(`✅ ${label} đã xong, đang làm mới dashboard...`, 4000);
      if (reloadFn) reloadFn(1);
      return;
    }
    if (status === 'failed') {
      showToast(`❌ ${label} bị lỗi. Bạn xem log Radar để biết chi tiết.`, 5000);
      if (reloadFn) reloadFn(1);
      return;
    }
  }
  showToast(`⏳ ${label} vẫn đang chạy, dashboard sẽ tự làm mới khi có dữ liệu mới.`, 4000);
}

function watchBotJob(jobId, label) {
  waitForBotJob(jobId, label).catch(() => {});
}

async function wakeRadarForJob(taskType, jobId, label) {
  const wake = await wakeRadarLocal(taskType, jobId);
  if (wake?.ok) {
    const state = wake.radar_running ? 'đang chạy' : 'đang mở';
    showToast(`✅ Đã gửi lệnh ${label}. Radar Python ${state} và sẽ nhận job ngay.`, 5000);
    return true;
  }
  showToast(`✅ Đã gửi lệnh ${label}. Nếu Python chưa mở, Watchdog Windows sẽ bật trong tối đa 1 phút.`, 6000);
  return false;
}

// ── CÁC HÀNH ĐỘNG CHÍNH ──────────────────────────────────────────
export async function markConfirmed() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Xác nhận ${ids.length} đơn hàng?`)) return;
  await patchOmsStatus(ids, 'PENDING', 'LOGISTICS_REQUEST_CREATED');
  showToast(`✅ Đã xác nhận ${ids.length} đơn`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markPrepare() {
  const ids = getChecked();
  if (!ids.length) return;
  const groups = getSelectedGroups(ids);
  const groupText = groups.map(g => `${g.shop} (${g.order_ids.length})`).join(', ');
  if (!confirm(`Tạo lệnh chuẩn bị hàng + in PDF cho ${ids.length} đơn?\n\nShop: ${groupText}`)) return;

  const btn = document.getElementById('btnPrepare');
  if (btn) { btn.style.opacity = '0.7'; btn.disabled = true; }
  showToast('🖨️ Đang tạo lệnh in phiếu cho Bot...');

  try {
    const jobs = await Promise.all(groups.map(createPrintJob));
    if (jobs[0]?.id) await wakeRadarForJob('print_label', jobs[0].id, 'in phiếu');
    await patchOmsStatus(ids, 'PENDING', 'LOGISTICS_REQUEST_CREATED');
    showToast(`✅ Đã gửi ${groups.length} lệnh in phiếu cho Bot (${ids.length} đơn).`);
    if (clearCheckFn) clearCheckFn();
    if (reloadFn) reloadFn(getPageFn());
  } catch (e) {
    showToast('❌ Lỗi tạo lệnh in phiếu: ' + e.message);
  } finally {
    if (btn) { btn.style.opacity = '1'; btn.disabled = false; }
  }
}

export async function markPacked() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Xác nhận đã đóng gói xong ${ids.length} đơn?`)) return;
  try {
    if (!(await ensureLabelsBeforePacked(ids))) return;
    await patchOmsStatus(ids, 'PENDING', 'LOGISTICS_PACKAGED');
    notifyStatusUpdated(ids, 'PENDING', 'LOGISTICS_PACKAGED', 'Đã chuyển sang Đã đóng gói.');
    showToast(`📦 Đã đóng gói xong ${ids.length} đơn`);
    if (clearCheckFn) clearCheckFn();
    if (reloadFn) reloadFn(getPageFn());
  } catch (error) {
    showToast(`❌ Không chuyển được Đã đóng gói: ${error.message}`, 7000);
  }
}

export async function markHandedOver() {
  const ids = getChecked();
  if (!ids.length) return;
  const cache = Array.isArray(getCacheFn?.()) ? getCacheFn() : [];
  const selected = cache.filter(order => ids.includes(String(order.order_id || '')));
  const blocked = selected.filter(order => {
    const oms = String(order.oms_status || '').toUpperCase();
    const ship = String(order.shipping_status || '').toUpperCase();
    return ['CANCELLED', 'RETURN', 'COMPLETED'].includes(oms)
      || ['CANCELLED', 'RETURN', 'RETURN_REFUND', 'FAILED_DELIVERY', 'COMPLETED'].includes(ship);
  });
  if (blocked.length) {
    showToast(`❌ Có ${blocked.length} đơn đã hủy/hoàn/đã giao, không thể bàn giao ĐVVC.`);
    return;
  }
  // Shop không có API không tự đổi hành trình sau đóng gói, nên bước này là xác nhận vận hành tay sau khi đã giao cho ĐVVC.
  if (!confirm(`Xác nhận đã bàn giao ${ids.length} đơn cho ĐVVC?\n\nSau thao tác, đơn sẽ chuyển sang tab Đang giao. Shop có API vẫn được đối soát lại ở lần đồng bộ sau; shop không API dùng đây là xác nhận tay.`)) return;
  await patchOmsStatus(ids, 'SHIPPING', 'SHIPPED');
  showToast(`🚚 Đã chuyển ${ids.length} đơn sang Đang giao`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

function getSelectedBuyerCancelOrders(ids) {
  const cache = Array.isArray(getCacheFn?.()) ? getCacheFn() : [];
  const selected = cache.filter(order => ids.includes(String(order.order_id || '')));
  const invalid = selected.filter(order => String(order.shipping_status || '').toUpperCase() !== 'IN_CANCEL');
  if (!selected.length) throw new Error('Chưa chọn đơn cần xử lý.');
  if (invalid.length) throw new Error(`Có ${invalid.length} đơn không ở trạng thái Khách yêu cầu hủy.`);
  return selected;
}

async function decideBuyerCancellationForIds(ids, operation) {
  if (!ids.length) return;
  const normalized = String(operation || '').toUpperCase() === 'REJECT' ? 'REJECT' : 'ACCEPT';
  let selected = [];
  try {
    selected = getSelectedBuyerCancelOrders(ids);
  } catch (error) {
    showToast('Không thể xử lý hủy: ' + error.message, 5000);
    return;
  }

  const unsupported = selected.filter(order => !['shopee', 'lazada'].includes(String(order.platform || '').toLowerCase()));
  if (unsupported.length) {
    showToast(`Có ${unsupported.length} đơn chưa có endpoint xác nhận hủy, cần xử lý tay trên sàn.`, 5000);
    return;
  }

  const label = normalized === 'ACCEPT' ? 'đồng ý hủy' : 'từ chối hủy';
  // Đây là thao tác ghi thật lên sàn nên bắt buộc xác nhận rõ trước khi gửi API.
  if (!confirm(`Xác nhận ${label} ${selected.length} đơn khách yêu cầu hủy?\n\nChỉ tiếp tục khi đã kiểm tra kiện hàng chưa bàn giao ĐVVC hoặc có thể xử lý theo quy định sàn.`)) return;

  const btnIds = ['btnAcceptBuyerCancel', 'btnRejectBuyerCancel'];
  btnIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = true;
  });
  showToast(`Đang gửi lệnh ${label} lên sàn...`, 5000);

  const results = [];
  for (const order of selected) {
    try {
      const response = await fetch(API + '/api/orders/buyer-cancellation/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: order.platform,
          shop: order.shop,
          order_id: order.order_id,
          operation: normalized,
          confirm_action: true
        })
      });
      const data = await response.json().catch(() => ({}));
      results.push({ ok: response.ok && data.status === 'ok', order_id: order.order_id, data });
    } catch (error) {
      results.push({ ok: false, order_id: order.order_id, data: { message: error.message } });
    }
  }

  const okCount = results.filter(item => item.ok).length;
  const failed = results.filter(item => !item.ok);
  if (failed.length) {
    const sample = failed.slice(0, 2).map(item => `${item.order_id}: ${item.data?.message || item.data?.error || 'lỗi không rõ'}`).join('; ');
    showToast(`Đã xử lý ${okCount}/${selected.length}. Lỗi: ${sample}`, 7000);
  } else {
    showToast(`Đã ${label} ${okCount} đơn.`, 5000);
  }
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function decideBuyerCancellation(operation) {
  await decideBuyerCancellationForIds(getChecked(), operation);
}

export async function decideBuyerCancellationForOrder(orderId, operation) {
  const id = String(orderId || '').trim();
  if (!id) return;
  await decideBuyerCancellationForIds([id], operation);
}

export async function markCancelledTransit() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Đánh dấu ${ids.length} đơn bị hủy trong quá trình vận chuyển?`)) return;
  await patchOmsStatus(ids, 'CANCELLED', 'CANCELLED');
  showToast(`✗ Đã đánh dấu ${ids.length} đơn hủy khi vận chuyển`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markFailedDelivery() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Đánh dấu ${ids.length} đơn giao không thành công?`)) return;
  await patchOmsStatus(ids, 'RETURN', 'FAILED_DELIVERY');
  showToast(`⚠️ Đã đánh dấu ${ids.length} đơn giao thất bại`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function markReturnRefund() {
  const ids = getChecked();
  if (!ids.length) return;
  if (!confirm(`Đánh dấu ${ids.length} đơn trả hàng hoàn tiền?`)) return;
  await patchOmsStatus(ids, 'RETURN', 'RETURN');
  showToast(`↩ Đã đánh dấu ${ids.length} đơn trả hàng`);
  if (clearCheckFn) clearCheckFn();
  if (reloadFn) reloadFn(getPageFn());
}

export async function triggerBotUploadInventory() {
  if (!confirm("⚠️ CẢNH BÁO NGUY HIỂM: Hành động này sẽ ép tồn kho trên các sàn (Shopee, TikTok, Lazada) bằng với số lượng hiện tại trên Web OMS.\n\nNếu Web OMS chưa chuẩn, bạn sẽ bị phạt vì bán vượt (Overselling). Bạn có chắc chắn muốn đẩy dữ liệu?")) return;
  
  const btn = document.querySelector('button[onclick="triggerBotUploadInventory()"]');
  if(btn) { btn.style.opacity = '0.7'; btn.disabled = true; }
  showToast('🔄 Đang gửi tín hiệu yêu cầu Bot tải file Excel lên các Sàn...');

  try {
    await fetch(API + '/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_type: 'push_inventory', // Mã lệnh Đẩy Tồn Kho
        payload: JSON.stringify({ command: "upload_excel_all_shops" }),
        shop_name: 'ALL',
        platform: 'ALL',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      })
    });
    showToast('✅ Đã phát lệnh thành công! Bot Python ở nhà đang rải file Excel...', 5000);
  } catch (e) {
    showToast('❌ Lỗi gửi tín hiệu: ' + e.message);
  } finally {
    if(btn) { btn.style.opacity = '1'; btn.disabled = false; }
  }
}

// Nhớ xuất hàm ra window ở dòng dưới cùng của file nhé:
// Object.assign(window, { ..., triggerBotUploadInventory });

 Object.assign(window, {
  markConfirmed, markPrepare, markPacked, markHandedOver,
  decideBuyerCancellation, markCancelledTransit, markFailedDelivery, markReturnRefund,
  triggerBotUploadInventory
});
