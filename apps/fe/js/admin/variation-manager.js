// ── VARIATION MANAGER (QUẢN LÝ MAP SKU ĐA SÀN) ──────────────────
let allVariations = [];

// 1. TẢI DỮ LIỆU & RÚT TRÍCH DANH SÁCH SÀN/SHOP
async function loadVariations() {
  document.getElementById('variationsTable').innerHTML = '<p style="text-align:center;color:#888;padding:40px">⏳ Đang tải dữ liệu đa sàn...</p>';
  try {
    allVariations = await fetch(API + '/api/sync-variations').then(r => r.json());
    
    // Tự động kéo SKU nội bộ về nếu chưa có
    if (!window.allSkus || window.allSkus.length === 0) {
      window.allSkus = await fetch(API + '/api/products').then(r => r.json());
    }

    updateShopDropdown(); // Gọi hàm cập nhật danh sách Shop
    renderVariations();
    updateUnmappedBadge();
  } catch(e) {
    document.getElementById('variationsTable').innerHTML = `<p style="color:#ef4444;padding:20px">❌ Lỗi kết nối: ${e.message}</p>`;
  }
}

// HÀM MỚI: Cập nhật danh sách Shop dựa theo Sàn đang chọn
window.updateShopDropdown = function() {
  const platformFilter = document.getElementById('var_filter_platform').value;
  
  // Lọc ra các shop thuộc sàn đã chọn (hoặc lấy tất cả nếu không chọn sàn)
  const filteredShops = allVariations
    .filter(v => !platformFilter || v.platform === platformFilter)
    .map(v => v.shop)
    .filter(Boolean);
    
  const uniqueShops = [...new Set(filteredShops)];
  
  const shopSelect = document.getElementById('var_filter_shop');
  const currentShop = shopSelect.value;
  
  shopSelect.innerHTML = '<option value="">🛒 Tất cả Shop</option>' + 
                         uniqueShops.map(s => `<option value="${s}">${s}</option>`).join('');
  
  // Giữ lại shop đang chọn nếu nó vẫn hợp lệ
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

// 2. RENDER BẢNG & BỘ LỌC
function renderVariations() {
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

  if (!list.length) {
    document.getElementById('variationsTable').innerHTML = '<p style="text-align:center;color:#888;padding:40px">Không tìm thấy sản phẩm nào phù hợp</p>';
    return;
  }

  window.skuOptionsHtml = (window.allSkus || [])
    .filter(s => !s.is_combo)
    .map(s => `<option value="${s.sku}">${s.sku} — ${s.product_name || ''}</option>`)
    .join('');

  const statusBadge = s => ({
    MAPPED:   '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">✅ Đã map</span>',
    UNMAPPED: '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">⚠️ Chưa map</span>',
    IGNORED:  '<span style="background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">🚫 Bỏ qua</span>',
  })[s] || s;

  const rows = list.map(v => {
    let mappedHtml = '';
    if (v.map_status === 'MAPPED') {
      try {
        const items = JSON.parse(v.mapped_items || '[]');
        if (items.length > 0) {
          mappedHtml = items.map(i => `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:4px;color:#15803d">${i.qty} x ${i.sku}</code>`).join(' + ');
        } else {
          mappedHtml = `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:4px;color:#15803d">${v.internal_sku}</code>`;
        }
      } catch(e) {
        mappedHtml = `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:4px;color:#15803d">${v.internal_sku}</code>`;
      }
    }
    
    // Format Giá
    const priceFormatted = v.price ? v.price.toLocaleString('vi-VN') + 'đ' : '—';
    const stockStr = v.stock !== null && v.stock !== undefined ? v.stock : '—';
    
    return `
    <tr id="var-row-${v.id}">
      <td style="width:32px; text-align:center;">
        <input type="checkbox" class="var-checkbox" data-id="${v.id}" onchange="updateVarBulkDeleteUI()">
      </td>
      <td style="width:48px">
        ${v.image_url
          ? `<img src="${v.image_url}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb">`
          : `<div style="width:40px;height:40px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center">📦</div>`}
      </td>
      <td>
        <div style="font-weight:600;font-size:13px;color:#1e293b">${v.product_name || '—'}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${v.variation_name || '—'}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:1px;font-weight:600">[${v.platform ? v.platform.toUpperCase() : 'SÀN'}] ${v.shop || ''}</div>
      </td>
      <td><code style="font-size:11px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${v.platform_sku || '—'}</code></td>
      <td style="color:#ef4444; font-weight:600; font-size:12px;">${priceFormatted}</td>
      <td style="color:#2563eb; font-weight:600; font-size:12px; text-align:center;">${stockStr}</td>
      <td>${statusBadge(v.map_status)}</td>
      <td>
        ${v.map_status === 'MAPPED'
          ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
               ${mappedHtml}
               <button onclick="resetVarMap(${v.id})" style="padding:3px 8px;background:#fee2e2;color:#dc2626;border:none;border-radius:5px;font-size:11px;cursor:pointer">✕</button>
             </div>`
          : `<div style="display:flex;flex-direction:column;gap:6px;background:#f8fafc;padding:8px;border-radius:8px;border:1px dashed #cbd5e1">
               <div id="map-container-${v.id}" style="display:flex;flex-direction:column;gap:6px">
                 <div class="map-row" style="display:flex;gap:6px;align-items:center">
                   <input type="text" list="sku-datalist" class="map-sku-select" placeholder="🔍 Gõ tìm mã hoặc tên SKU..." style="border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px;width:180px">
                   <input type="number" class="map-qty-input" value="1" min="1" style="width:45px;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px" title="Số lượng">
                   <button onclick="window.addMapRow(${v.id})" style="padding:4px 8px;background:#10b981;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:bold" title="Thêm SKU thành phần">+</button>
                 </div>
               </div>
               <div style="display:flex;gap:6px;margin-top:4px">
                 <button onclick="saveVarMap(${v.id})" style="padding:5px 10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">💾 Lưu Map</button>
                 <button onclick="ignoreVar(${v.id})" style="padding:5px 10px;background:#f3f4f6;color:#6b7280;border:none;border-radius:6px;font-size:12px;cursor:pointer">🚫 Bỏ qua</button>
               </div>
             </div>`}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('variationsTable').innerHTML = `
    <datalist id="sku-datalist">${window.skuOptionsHtml}</datalist>
    <div style="overflow-x:auto">
      <table style="width:100%; border-collapse:collapse; text-align:left;">
        <thead><tr style="background:#f8fafc; border-bottom:2px solid #e5e7eb;">
          <th style="width:32px; text-align:center;"><input type="checkbox" onchange="toggleAllVarCheck(this.checked)"></th>
          <th>Ảnh</th>
          <th>Tên SP / Phân loại</th>
          <th>SKU Sàn</th>
          <th>Giá Sàn</th>
          <th style="text-align:center;">Tồn Kho</th>
          <th>Trạng thái</th>
          <th style="min-width:280px">Map SKU nội bộ</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// 3. LOGIC XÓA HÀNG LOẠT SẢN PHẨM SÀN LỖI
function toggleAllVarCheck(checked) {
  document.querySelectorAll('.var-checkbox').forEach(cb => cb.checked = checked);
  updateVarBulkDeleteUI();
}

function updateVarBulkDeleteUI() {
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

async function bulkDeleteVariations() {
  const checked = document.querySelectorAll('.var-checkbox:checked');
  const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
  
  if (!ids.length) return;
  if (confirm(`Bạn có chắc chắn muốn xóa ${ids.length} sản phẩm này khỏi danh sách chờ map?`)) {
      try {
          // Gọi API để xóa (Bạn cần tạo API này ở Worker Backend)
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

async function saveVarMap(id) {
  const container = document.getElementById('map-container-' + id);
  const rows = container.querySelectorAll('.map-row');
  const mapped_items = [];
  let first_sku = '';
  
  rows.forEach(row => {
      let sku = row.querySelector('.map-sku-select').value;
      
      // Tự động tách lấy mã SKU chuẩn xác nếu trình duyệt vô tình lấy cả tên sản phẩm
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

async function resetVarMap(id) {
  await fetch(API + '/api/sync-variations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, internal_sku: '', map_status: 'UNMAPPED' })
  });
  showToast('↩ Đã reset map');
  loadVariations();
}

async function ignoreVar(id) {
  await fetch(API + '/api/sync-variations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, internal_sku: '', map_status: 'IGNORED' })
  });
  showToast('🚫 Đã bỏ qua variation này');
  loadVariations();
}

// 5. HOOK CHUYỂN TAB 
const _origSwitchTab = window.switchTab;
window.switchTab = function(tab) {
  if(_origSwitchTab) _origSwitchTab(tab);
  if (tab === 'variations' && allVariations.length === 0) loadVariations();
}