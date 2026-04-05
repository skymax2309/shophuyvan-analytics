// ==========================================
// MODULE: QUẢN LÝ CÁC CỬA SỔ POPUP (MODALS)
// ==========================================
import { API } from '../oms-api.js';
import { showToast, closeModal } from '../utils/helpers.js';

// Biến lưu trữ hàm load lại bảng từ file main
let reloadTableFn = null;

export function initModals(reloadFn) {
  reloadTableFn = reloadFn;
}

// ── 1. BẢNG NHẶT HÀNG (PICK LIST) ───────────────────────────────────
export function renderPickListModal(selectedOrders) {
  const skuMap = new Map();

  for (const o of selectedOrders) {
    for (const item of (o.items || [])) {
      const key = item.sku || item.variation_name || item.product_name || '—';
      if (!skuMap.has(key)) {
         skuMap.set(key, { 
           sku: item.sku, 
           variation: item.variation_name || item.product_name, 
           qty: 0, 
           img: item.image_url 
         });
      }
      skuMap.get(key).qty += (item.qty || 1);
    }
  }

  const rows = [...skuMap.values()].sort((a,b) => b.qty - a.qty);
  const totalQty = rows.reduce((s,r) => s+r.qty, 0);

  document.getElementById('pickListContent').innerHTML = `
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px; text-align: center;">
      <b>${selectedOrders.length}</b> đơn — Cần nhặt tổng cộng <b style="color:var(--red); font-size: 16px;">${totalQty}</b> sản phẩm
    </div>
    <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; max-height: 60vh; overflow-y: auto; padding-bottom: 10px;">
    <table class="picklist-table" style="width: 100%; min-width: 480px; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid var(--border); text-align: left;">
          <th style="width:50px; padding-bottom: 8px;">Ảnh</th>
          <th style="padding-bottom: 8px;">Mã SKU</th>
          <th style="padding-bottom: 8px;">Phân loại</th>
          <th style="width:80px; text-align:center; padding-bottom: 8px; color: var(--accent);">Số lượng</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
        <tr style="border-bottom: 1px dashed var(--border);">
          <td style="padding: 8px 0;">${r.img
            ? `<img src="${r.img}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
            : `<div style="width:44px;height:44px;background:var(--surface2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px">📦</div>`}
          </td>
          <td style="font-family:'IBM Plex Mono',monospace; font-size:13px; color:var(--blue); font-weight: bold; padding: 8px;">${r.sku||'—'}</td>
          <td style="font-size:12px; color:var(--text); padding: 8px; line-height: 1.4;">${r.variation||'—'}</td>
          <td style="text-align:center; padding: 8px;">
            <span style="display:inline-block; background: rgba(239, 68, 68, 0.1); color: var(--red); font-size: 18px; font-weight: bold; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);">${r.qty}</span>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;

  document.getElementById('pickListModal').classList.add('open');
}

// ── 2. QUICK MAP SKU CORE ─────────────────────────────────────────────
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

export async function saveMapSku(internalSku) {
  const rawName = document.getElementById('mapTargetRawSku').value;
  document.getElementById('mapSkuResults').innerHTML = '<div style="padding:10px;text-align:center;color:var(--green);font-weight:bold;">🚀 Đang đẩy dữ liệu Map lên Server...</div>';
  try {
    const payload = { platform_sku: rawName, internal_sku: internalSku };
    const response = await fetch(`${API}/api/sync-variations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const resData = await response.json();
    if (!response.ok || resData.error) throw new Error(resData.error || "Server từ chối lưu Map");
    
    await fetch(`${API}/api/orders/recalc-cost`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: internalSku })
    });
    
    showToast(`✅ Đã Map thành công SKU: ${internalSku}`);
    closeModal('mapSkuModal');
    if (reloadTableFn) reloadTableFn(); // Bắn lệnh về file main để F5 lại bảng
  } catch (e) {
    showToast('❌ Lỗi lưu Map SKU: ' + e.message);
  }
}

// ── 3. QUICK UPDATE COST PRICE ──────────────────────────────────────────
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
    const payload = { sku: sku, cost_invoice: costInvoice, cost_real: costReal };
    const res = await fetch(`${API}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Server từ chối cập nhật sản phẩm");

    await fetch(`${API}/api/orders/recalc-cost`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: sku })
    });

    showToast(`✅ Đã cập nhật Giá Vốn cho mã: ${sku}`);
    closeModal('costPriceModal');
    if (reloadTableFn) reloadTableFn(); // Bắn lệnh về file main để F5 lại bảng
  } catch (e) {
    showToast('❌ Lỗi: ' + e.message);
  } finally {
    btn.textContent = '💾 Lưu & Tính Lại Lãi/Lỗ';
    btn.disabled = false;
  }
}

// Cấp quyền ra toàn cầu để các nút bấm trên HTML có thể gọi được
Object.assign(window, { openMapModal, debounceSearchSku, saveMapSku, openCostModal, saveCostPrice });