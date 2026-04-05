// ── VARIATION MANAGER (QUẢN LÝ MAP SKU ĐA SÀN) ──────────────────
let allVariations = [];
let currentVarPage = 1; // 🌟 Thêm biến phân trang
const VARS_PER_PAGE = 48; // 🌟 Chỉ load 48 thẻ mỗi trang cho mượt

// Hàm hỗ trợ chống lỗi ký tự đặc biệt làm gãy giao diện HTML
function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// 1. TẢI DỮ LIỆU & RÚT TRÍCH DANH SÁCH SÀN/SHOP
async function loadVariations() {
  const container = document.getElementById('var-list-wrapper') || document.getElementById('variationsTable');
  if (container) container.innerHTML = '<p style="text-align:center;color:#888;padding:40px">⏳ Đang tải dữ liệu đa sàn...</p>';
  try {
    allVariations = await fetch(API + '/api/sync-variations').then(r => r.json());
    
    if (!window.allSkus || window.allSkus.length === 0) {
      window.allSkus = await fetch(API + '/api/products').then(r => r.json());
    }

    updateShopDropdown();
    renderVariations();
    updateUnmappedBadge();
  } catch(e) {
    console.error("Lỗi tải dữ liệu:", e);
    const containerErr = document.getElementById('var-list-wrapper') || document.getElementById('variationsTable');
    if (containerErr) containerErr.innerHTML = `<p style="color:#ef4444;padding:20px;text-align:center;font-weight:bold;">❌ Lỗi kết nối Server: ${e.message}</p>`;
  }
}

window.updateShopDropdown = function() {
  const platformFilter = document.getElementById('var_filter_platform').value;
  const filteredShops = allVariations
    .filter(v => !platformFilter || v.platform === platformFilter)
    .map(v => v.shop)
    .filter(Boolean);
    
  const uniqueShops = [...new Set(filteredShops)];
  const shopSelect = document.getElementById('var_filter_shop');
  const currentShop = shopSelect.value;
  
  shopSelect.innerHTML = '<option value="">🛒 Tất cả Shop</option>' + 
                         uniqueShops.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  
  if (uniqueShops.includes(currentShop)) {
      shopSelect.value = currentShop;
  } else {
      shopSelect.value = "";
  }
}

function updateUnmappedBadge() {
  const n = allVariations.filter(v => v.map_status === 'UNMAPPED').length;
  const badge = document.getElementById('badge-unmapped');
  if(badge) {
    badge.textContent = n;
    badge.style.display = n > 0 ? '' : 'none';
  }
}

// 2. RENDER BẢNG & BỘ LỌC (GIAO DIỆN DẠNG DANH SÁCH CHUẨN SKU)
window.renderVariations = function(page = 1) {
  try {
      currentVarPage = page;
      const kw = (document.getElementById('var_search').value || '').toLowerCase();
      const platformFilter = document.getElementById('var_filter_platform').value;
      const shopFilter = document.getElementById('var_filter_shop').value;
      const statusFilter = document.getElementById('var_filter_status').value;

      const list = allVariations.filter(v => {
        const matchKw = !kw || (v.platform_sku || '').toLowerCase().includes(kw) || 
                               (v.product_name || '').toLowerCase().includes(kw) || 
                               (v.variation_name || '').toLowerCase().includes(kw) || 
                               (v.internal_sku || '').toLowerCase().includes(kw);
        const matchPlatform = !platformFilter || v.platform === platformFilter;
        const matchShop = !shopFilter || v.shop === shopFilter;
        const matchStatus = !statusFilter || v.map_status === statusFilter;
        return matchKw && matchPlatform && matchShop && matchStatus;
      });

      const container = document.getElementById('var-list-wrapper') || document.getElementById('variationsTable');
      const paginationWrap = document.getElementById('varPaginationWrap');

      if (!list.length) {
        if (container) container.innerHTML = '<p style="text-align:center;color:#888;padding:40px; border:1px dashed #cbd5e1; border-radius:8px; background:white;">🔍 Không tìm thấy sản phẩm nào phù hợp</p>';
        if (paginationWrap) paginationWrap.innerHTML = '';
        return;
      }

      const totalItems = list.length;
      const totalPages = Math.ceil(totalItems / VARS_PER_PAGE) || 1;
      const startIndex = (currentVarPage - 1) * VARS_PER_PAGE;
      const pagedList = list.slice(startIndex, startIndex + VARS_PER_PAGE);

      window.skuOptionsHtml = (window.allSkus || [])
        .filter(s => !s.is_combo)
        .map(s => `<option value="${escapeHtml(s.sku)}">${escapeHtml(s.sku)} — ${escapeHtml(s.product_name)}</option>`)
        .join('');

      const statusBadge = s => ({
        MAPPED:   '<span style="background:#dcfce7;color:#16a34a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">✅ Đã map</span>',
        UNMAPPED: '<span style="background:#fef3c7;color:#b45309;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">⚠️ Chưa map</span>',
        IGNORED:  '<span style="background:#f3f4f6;color:#9ca3af;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">🚫 Bỏ qua</span>',
      })[s] || s;

      const rows = pagedList.map(v => {
        let mappedHtml = '';
        if (v.map_status === 'MAPPED') {
          try {
            const items = JSON.parse(v.mapped_items || '[]');
            if (items.length > 0) {
              mappedHtml = items.map(i => `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:6px;color:#15803d;font-weight:600">${i.qty} x ${escapeHtml(i.sku)}</code>`).join(' + ');
            } else {
              mappedHtml = `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:6px;color:#15803d;font-weight:600">${escapeHtml(v.internal_sku)}</code>`;
            }
          } catch(e) {
            mappedHtml = `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:6px;color:#15803d;font-weight:600">${escapeHtml(v.internal_sku)}</code>`;
          }
        }
        
        const priceFormatted = v.price ? Number(v.price).toLocaleString('vi-VN') + 'đ' : '0đ';
        const discountFormatted = v.discount_price ? Number(v.discount_price).toLocaleString('vi-VN') + 'đ' : '0đ';
        const stockStr = v.stock !== null && v.stock !== undefined ? escapeHtml(v.stock) : '0';
          
        let displayImg = '';
        if (v.internal_sku) {
           const matchedSku = (window.allSkus || []).find(s => s.sku === v.internal_sku);
           if (matchedSku && (matchedSku.image_url || '').trim() !== '') displayImg = matchedSku.image_url.trim();
        }
        if (!displayImg) displayImg = (v.image_url || '').trim();
        if (!displayImg && v.internal_sku) {
           const sibling = allVariations.find(other => other.internal_sku === v.internal_sku && (other.image_url || '').trim() !== '');
           if (sibling) displayImg = sibling.image_url.trim();
        }
          
        return `
        <div style="display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #fff; transition: 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
            <div style="margin-right: 12px; display: flex; align-items: center;">
                <input type="checkbox" class="var-checkbox" data-id="${v.id}" onchange="updateVarBulkDeleteUI()" style="transform:scale(1.2); cursor:pointer;">
            </div>
            <img src="${displayImg || 'https://placehold.co/60x60?text=No+Img'}" style="width: 48px; height: 48px; border-radius: 6px; object-fit: cover; border: 1px solid #cbd5e1; margin-right: 16px;">
            <div style="flex: 2; min-width: 0;">
                <div style="font-weight: 700; color: #0f172a; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(v.product_name)}">${escapeHtml(v.product_name) || '—'}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">↳ Phân loại: <strong style="color:#0f172a">${escapeHtml(v.variation_name) || '—'}</strong></div>
                <div style="display:flex; gap:6px; margin-top:6px; align-items:center; flex-wrap:wrap;">
                    <span style="background:#f1f5f9;color:#475569;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;">🛒 ${escapeHtml(v.platform)} - ${escapeHtml(v.shop)}</span>
                    <span style="background:#e0e7ff;color:#4338ca;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">SKU Sàn: ${escapeHtml(v.platform_sku) || '—'}</span>
                    ${statusBadge(v.map_status)}
                </div>
            </div>
            <div style="flex: 1; text-align: center; font-size: 13px;">
                <div style="color: #64748b; font-size:11px; margin-bottom:4px;">Giá gốc</div>
                <strong style="color:#64748b; text-decoration: ${discountFormatted !== '0đ' && discountFormatted !== priceFormatted ? 'line-through' : 'none'};">${priceFormatted}</strong>
            </div>
            <div style="flex: 1; text-align: center; font-size: 13px;">
                <div style="color: #ef4444; font-size:11px; font-weight:bold; margin-bottom:4px;">Giá Khuyến Mãi</div>
                <strong style="color:#ef4444; font-size:14px;">${discountFormatted !== '0đ' ? discountFormatted : '—'}</strong>
            </div>
            <div style="flex: 1; text-align: center; font-size: 13px;">
                <div style="color: #64748b; font-size:11px; margin-bottom:4px;">Tồn kho</div>
                <strong style="color:#2563eb; font-size:15px;">📦 ${stockStr}</strong>
            </div>
            <div style="flex: 0 0 180px; display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                ${v.map_status === 'MAPPED' ? `
                    <div style="font-size:11px; margin-bottom:4px;">${mappedHtml}</div>
                    <div style="display:flex; gap:6px; width:100%;">
                        <button onclick="resetVarMap(${v.id})" style="flex:1; padding:6px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600">✕ Hủy Map</button>
                        <button onclick="openEditVarModal(${v.id})" style="flex:1; padding:6px; background:#fef3c7; color:#d97706; border:1px solid #fde047; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600">✏️ Sửa SP</button>
                    </div>
                ` : `
                    <button onclick="openQuickMapModal('${v.id}', '${escapeHtml(v.platform_sku)}')" style="width:100%; padding:6px 10px; background:#3b82f6; color:white; border:none; border-radius:6px; font-size:11px; cursor:pointer; font-weight:bold; box-shadow:0 1px 2px rgba(37,99,235,0.2);">🔗 MAP Nhanh</button>
                    <div style="display:flex; gap:6px; width:100%;">
                        <button onclick="ignoreVar(${v.id})" style="flex:1; padding:6px 0; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600">🚫 Bỏ qua</button>
                        <button onclick="openEditVarModal(${v.id})" style="flex:1; padding:6px 0; background:#f59e0b; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600">✏️ Sửa SP</button>
                    </div>
                `}
            </div>
        </div>`;
      }).join('');

      if (container) {
          container.innerHTML = `
            <datalist id="sku-datalist">${window.skuOptionsHtml}</datalist>
            <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; background:white; box-shadow:0 1px 3px rgba(0,0,0,0.05); margin-bottom: 20px;">
                ${rows}
            </div>
          `;
      }
        
      if (paginationWrap) {
          paginationWrap.innerHTML = `
            <button onclick="renderVariations(${currentVarPage - 1})" ${currentVarPage === 1 ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; background:${currentVarPage === 1 ? '#f8fafc' : 'white'}; color:${currentVarPage === 1 ? '#cbd5e1' : '#333'}; cursor:${currentVarPage === 1 ? 'not-allowed' : 'pointer'}; font-weight:bold;">‹ Trang trước</button>
            <span style="padding:8px 16px; background:#eff6ff; color:#2563eb; border-radius:8px; font-weight:bold; font-size:14px; border:1px solid #bfdbfe;">
                Trang ${currentVarPage} / ${totalPages} (Tổng ${totalItems} SP)
            </span>
            <button onclick="renderVariations(${currentVarPage + 1})" ${currentVarPage === totalPages ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; background:${currentVarPage === totalPages ? '#f8fafc' : 'white'}; color:${currentVarPage === totalPages ? '#cbd5e1' : '#333'}; cursor:${currentVarPage === totalPages ? 'not-allowed' : 'pointer'}; font-weight:bold;">Trang sau ›</button>
          `;
      }
        
      const titleEl = document.querySelector('#tab-variations .card-title');
      if (titleEl && !document.getElementById('btnAutoSyncOld')) {
          titleEl.innerHTML += ` <button id="btnAutoSyncOld" onclick="autoSyncOldUnmapped()" style="margin-left:12px; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; border-radius:8px; padding:6px 14px; font-size:12px; cursor:pointer; font-weight:bold; box-shadow:0 3px 6px rgba(16,185,129,0.3); transition:0.2s;" title="Biến toàn bộ mã Chưa Map thành SKU Nội bộ">⚡ Đẩy mã Chưa Map sang SKU Nội Bộ</button>`;
      }
        
      injectEditModalUI();
  } catch(err) {
      console.error("Lỗi khi render bảng:", err);
      const containerErr = document.getElementById('var-list-wrapper') || document.getElementById('variationsTable');
      if (containerErr) containerErr.innerHTML = `<p style="color:#ef4444;padding:20px;text-align:center;font-weight:bold;">❌ Lỗi vẽ giao diện: ${err.message}</p>`;
  }
}

// 3. LOGIC XÓA HÀNG LOẠT SẢN PHẨM SÀN LỖI
window.toggleAllVarCheck = function(checked) {
  document.querySelectorAll('.var-checkbox').forEach(cb => cb.checked = checked);
  updateVarBulkDeleteUI();
}

window.updateVarBulkDeleteUI = function() {
  const count = document.querySelectorAll('.var-checkbox:checked').length;
  const btnBulk = document.getElementById('btnBulkDeleteVar');
  const countSpan = document.getElementById('selectedVarCount');
  if (count > 0) {
      btnBulk.style.display = 'inline-block';
      countSpan.textContent = count;
  } else {
      btnBulk.style.display = 'none';
  }
}

window.bulkDeleteVariations = async function() {
  const checked = document.querySelectorAll('.var-checkbox:checked');
  const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
  
  if (!ids.length) return;
  if (confirm(`Bạn có chắc chắn muốn xóa ${ids.length} sản phẩm này khỏi danh sách chờ map?`)) {
      try {
          const res = await fetch(API + '/api/sync-variations/bulk', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids })
          });
          
          if (res.ok) {
              showToast(`✅ Đã xóa thành công ${ids.length} sản phẩm!`);
              loadVariations(); 
          } else {
              showToast('❌ Xóa thất bại!', true);
          }
      } catch (err) {
          showToast('❌ Lỗi kết nối: ' + err.message, true);
      }
  }
}

// 4. CÁC HÀM MAP SKU & THÊM DÒNG
window.addMapRow = function(id) {
  const container = document.getElementById('map-container-' + id);
  const row = document.createElement('div');
  row.className = 'map-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  row.innerHTML = `
     <input type="text" list="sku-datalist" class="map-sku-select" placeholder="🔍 Gõ tìm mã hoặc tên SKU..." style="border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px;width:180px">
     <input type="number" class="map-qty-input" value="1" min="1" style="width:45px;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px" title="Số lượng">
     <button onclick="this.parentElement.remove()" style="padding:4px 8px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:bold" title="Xóa dòng này">✕</button>
  `;
  container.appendChild(row);
}

window.saveVarMap = async function(id) {
  const container = document.getElementById('map-container-' + id);
  const rows = container.querySelectorAll('.map-row');
  const mapped_items = [];
  let first_sku = '';
  
  rows.forEach(row => {
      let sku = row.querySelector('.map-sku-select').value;
      if (sku.includes(' — ')) {
          sku = sku.split(' — ')[0].trim();
      }
      const qty = parseInt(row.querySelector('.map-qty-input').value) || 1;
      if (sku) {
          mapped_items.push({ sku, qty });
          if (!first_sku) first_sku = sku;
      }
  });

  if (mapped_items.length === 0) { showToast('⚠️ Chọn ít nhất 1 SKU nội bộ!', true); return; }
  
  await fetch(API + '/api/sync-variations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, internal_sku: first_sku, mapped_items: JSON.stringify(mapped_items) })
  });
  showToast('✅ Đã map SKU & Số lượng!');
  loadVariations();
}

window.resetVarMap = async function(id) {
  await fetch(API + '/api/sync-variations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, internal_sku: '', map_status: 'UNMAPPED' })
  });
  showToast('↩ Đã reset map');
  loadVariations();
}

window.ignoreVar = async function(id) {
  await fetch(API + '/api/sync-variations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, internal_sku: '', map_status: 'IGNORED' })
  });
  showToast('🚫 Đã bỏ qua variation này');
  loadVariations();
}

// 🌟 TÍNH NĂNG MỚI: TỰ ĐỘNG BIẾN TOÀN BỘ MÃ CŨ THÀNH SKU NỘI BỘ
window.autoSyncOldUnmapped = async function() {
   // Lọc ra các mã Chưa Map hợp lệ (có mã sàn, không chứa chữ Chưa Map)
   const unmapped = allVariations.filter(v => v.map_status === 'UNMAPPED' && v.platform_sku && v.platform_sku.length >= 2 && !v.platform_sku.toLowerCase().includes('chưa map') && !v.platform_sku.toLowerCase().includes('null'));
   
   if (unmapped.length === 0) {
       return showToast("⚠️ Không có mã Chưa Map nào hợp lệ để đồng bộ!", true);
   }
   
   if (!confirm(`Phát hiện ${unmapped.length} mã Chưa Map. Hệ thống sẽ tự động chuyển tất cả chúng thành SKU Nội bộ (Giống như khi Bot cào đơn mới). Bạn có chắc chắn?`)) return;

   const btn = document.getElementById('btnAutoSyncOld');
   if (btn) { btn.textContent = "⏳ Đang đồng bộ..."; btn.disabled = true; }
   showToast("🚀 Đang đẩy dữ liệu lên Server, vui lòng đợi...");

   // Đóng gói lại thành cấu trúc mảng variations y hệt như Bot Python gửi lên
   const payloadVariations = unmapped.map(v => ({
       platform: v.platform,
       shop: v.shop,
       platform_item_id: v.platform_item_id,
       product_name: v.product_name,
       variation_name: v.variation_name,
       platform_sku: v.platform_sku,
       image_url: v.image_url,
       main_image: v.image_url, // Dùng tạm ảnh biến thể làm ảnh chính
       price: v.price,
       discount_price: v.discount_price,
       stock: v.stock
   }));

   try {
       // Tái sử dụng lại API POST /api/sync-variations (API này đã có trí tuệ nhân tạo Tự sinh mã)
       const res = await fetch(API + '/api/sync-variations', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ variations: payloadVariations })
       });
       
       if (!res.ok) throw new Error("Server từ chối yêu cầu");
       
       const result = await res.json();
       showToast(`✅ Quá dữ! Đã đồng bộ thành công ${result.auto_mapped || unmapped.length} mã sang Kho SKU Nội bộ!`);
       
       // Load lại dữ liệu 2 bảng
       loadVariations(); 
       if (typeof loadSkus === 'function') loadSkus(); 
   } catch(e) {
       showToast("❌ Lỗi đồng bộ: " + e.message, true);
   } finally {
       if (btn) { btn.innerHTML = "⚡ Đẩy mã Chưa Map sang SKU Nội Bộ"; btn.disabled = false; }
   }
}

// 5. HOOK CHUYỂN TAB 
const _origSwitchTab = window.switchTab;
window.switchTab = function(tab) {
  if(_origSwitchTab) _origSwitchTab(tab);
  if (tab === 'variations' && allVariations.length === 0) loadVariations();
}

// =========================================================================
// GIAO DIỆN & LOGIC CHỈNH SỬA PHÂN LOẠI (UPDATE ẢNH MÁY TÍNH, GIÁ, TỒN)
// =========================================================================

function injectEditModalUI() {
    if (document.getElementById('editVarModalWrap')) return;
    
    const modalHtml = `
    <div id="editVarModalWrap" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:white; width:500px; border-radius:12px; padding:24px; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e5e7eb; padding-bottom:12px; margin-bottom:16px;">
                <h3 style="margin:0; font-size:18px; color:#1e293b;">✏️ Sửa Thông Tin Phân Loại</h3>
                <button onclick="closeEditVarModal()" style="background:none; border:none; font-size:20px; cursor:pointer; color:#9ca3af;">✕</button>
            </div>
            
            <input type="hidden" id="editVarId">
            <input type="hidden" id="editVarOldImg">
            
            <div style="display:flex; flex-direction:column; gap:14px;">
                <div>
                    <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:6px;">Hình ảnh phân loại (Từ máy tính)</label>
                    <div style="display:flex; align-items:center; gap:16px;">
                        <img id="editVarImgPreview" src="" style="width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid #e5e7eb; background:#f8fafc;">
                        <input type="file" id="editVarImgFile" accept="image/*" onchange="previewVarImage(event)" 
                               style="font-size:13px; color:#64748b; background:#f1f5f9; padding:8px; border-radius:6px; width:100%; cursor:pointer;">
                    </div>
                </div>
                
                <div>
                    <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:6px;">Tên phân loại</label>
                    <input type="text" id="editVarName" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:14px; box-sizing:border-box;">
                </div>
                
                <div style="display:flex; gap:12px;">
                    <div style="flex:1;">
                        <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:6px;">Giá Gốc (đ)</label>
                        <input type="number" id="editVarPrice" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:14px; box-sizing:border-box;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:13px; font-weight:600; color:#ef4444; display:block; margin-bottom:6px;">Giá Khuyến Mại (đ)</label>
                        <input type="number" id="editVarDiscountPrice" style="width:100%; border:1px solid #fca5a5; border-radius:6px; padding:10px; font-size:14px; box-sizing:border-box; background:#fef2f2;">
                    </div>
                </div>
                <div>
                    <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:6px;">Tồn Kho</label>
                    <input type="number" id="editVarStock" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:14px; box-sizing:border-box;">
                </div>
            </div>
            
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
                <button onclick="closeEditVarModal()" style="padding:10px 16px; background:#f1f5f9; color:#475569; border:none; border-radius:6px; font-weight:600; cursor:pointer;">Hủy bỏ</button>
                <button onclick="saveEditVar()" id="btnSaveEditVar" style="padding:10px 16px; background:#2563eb; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer;">💾 Lưu Thay Đổi</button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.openEditVarModal = function(id) {
    const v = allVariations.find(item => item.id == id);
    if (!v) return;
    
    document.getElementById('editVarId').value = v.id;
    document.getElementById('editVarOldImg').value = v.image_url || '';
    document.getElementById('editVarImgPreview').src = v.image_url || 'https://via.placeholder.com/150?text=No+Image';
    document.getElementById('editVarName').value = v.variation_name || '';
    document.getElementById('editVarPrice').value = v.price || 0;
    document.getElementById('editVarDiscountPrice').value = v.discount_price || 0;
    document.getElementById('editVarStock').value = v.stock || 0;
    document.getElementById('editVarImgFile').value = ''; 
    
    document.getElementById('editVarModalWrap').style.display = 'flex';
}

window.closeEditVarModal = function() {
    document.getElementById('editVarModalWrap').style.display = 'none';
}

window.previewVarImage = function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { document.getElementById('editVarImgPreview').src = e.target.result; }
        reader.readAsDataURL(file);
    }
}

window.saveEditVar = async function() {
    const btn = document.getElementById('btnSaveEditVar');
    btn.innerHTML = '⏳ Đang lưu...';
    btn.disabled = true;

    try {
        const id = document.getElementById('editVarId').value;
        const fileInput = document.getElementById('editVarImgFile');
        let finalImageUrl = document.getElementById('editVarOldImg').value;

if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = 'img_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '');
            
            const uploadUrl = `${API}/api/upload?file=${fileName}&token=huyvan_secret_2026`;
            const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file });
            
            if (!uploadRes.ok) throw new Error("Tải ảnh lên hệ thống thất bại!");
            
            finalImageUrl = `${API}/api/file/${fileName}`;
        }

        const payload = {
            id: id,
            variation_name: document.getElementById('editVarName').value,
            price: parseFloat(document.getElementById('editVarPrice').value) || 0,
            discount_price: parseFloat(document.getElementById('editVarDiscountPrice').value) || 0,
            stock: parseInt(document.getElementById('editVarStock').value) || 0,
            image_url: finalImageUrl
        };

        const res = await fetch(`${API}/api/sync-variations/edit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeEditVarModal();
            showToast("✅ Đã cập nhật Phân loại thành công!");
            loadVariations();
        } else {
            throw new Error("Lỗi lưu dữ liệu lên Server");
        }
    } catch (error) {
        alert('Lỗi: ' + error.message);
    } finally {
        btn.innerHTML = '💾 Lưu Thay Đổi';
        btn.disabled = false;
    }
}