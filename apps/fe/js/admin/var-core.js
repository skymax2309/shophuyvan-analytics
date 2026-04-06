window.allVariations = [];
window.currentVarPage = 1;
window.VARS_PER_PAGE = 48;

window.escapeHtml = function(unsafe) {
    return (unsafe || '').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.loadVariations = async function() {
  const container = document.getElementById('var-list-wrapper') || document.getElementById('variationsTable');
  if (container) container.innerHTML = '<p style="text-align:center;color:#888;padding:40px">⏳ Đang tải dữ liệu đa sàn...</p>';
  try {
    window.allVariations = await fetch(API + '/api/sync-variations').then(r => r.json());
    if (!window.allSkus || window.allSkus.length === 0) window.allSkus = await fetch(API + '/api/products').then(r => r.json());
    updateShopDropdown(); renderVariations(); updateUnmappedBadge();
  } catch(e) {
    if (container) container.innerHTML = `<p style="color:#ef4444;padding:20px;text-align:center;font-weight:bold;">❌ Lỗi kết nối Server: ${e.message}</p>`;
  }
}

window.updateShopDropdown = function() {
  const platformFilter = document.getElementById('var_filter_platform').value;
  const filteredShops = window.allVariations.filter(v => !platformFilter || v.platform === platformFilter).map(v => v.shop).filter(Boolean);
  const uniqueShops = [...new Set(filteredShops)];
  const shopSelect = document.getElementById('var_filter_shop');
  const currentShop = shopSelect.value;
  shopSelect.innerHTML = '<option value="">🛒 Tất cả Shop</option>' + uniqueShops.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  shopSelect.value = uniqueShops.includes(currentShop) ? currentShop : "";
}

window.updateUnmappedBadge = function() {
  const n = window.allVariations.filter(v => v.map_status === 'UNMAPPED').length;
  const badge = document.getElementById('badge-unmapped');
  if(badge) { badge.textContent = n; badge.style.display = n > 0 ? '' : 'none'; }
}

window.renderVariations = function(page = 1) {
  try {
      window.currentVarPage = page;
      const kw = (document.getElementById('var_search').value || '').toLowerCase();
      const platformFilter = document.getElementById('var_filter_platform').value;
      const shopFilter = document.getElementById('var_filter_shop').value;
      const statusFilter = document.getElementById('var_filter_status').value;

      const list = window.allVariations.filter(v => {
        const matchKw = !kw || (v.platform_sku || '').toLowerCase().includes(kw) || (v.product_name || '').toLowerCase().includes(kw) || (v.variation_name || '').toLowerCase().includes(kw) || (v.internal_sku || '').toLowerCase().includes(kw);
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

      const groupedList = []; const groupMap = new Map();
      list.forEach(v => {
          const keyId = (v.platform_item_id || v.product_name || '').toString().replace(/[^a-zA-Z0-9]/g, '');
          const key = `${v.platform}_${v.shop}_${keyId}`;
          if (!groupMap.has(key)) {
              const parentObj = { key: key, platform: v.platform, shop: v.shop, product_name: v.product_name, image_url: v.image_url, total_stock: 0, variations: [] };
              groupMap.set(key, parentObj); groupedList.push(parentObj);
          }
          const parent = groupMap.get(key);
          parent.total_stock += (parseInt(v.stock) || 0); parent.variations.push(v);
      });

      const totalItems = groupedList.length; const VAR_GROUPS_PER_PAGE = 20; 
      const totalPages = Math.ceil(totalItems / VAR_GROUPS_PER_PAGE) || 1;
      const startIndex = (window.currentVarPage - 1) * VAR_GROUPS_PER_PAGE;
      const pagedGroups = groupedList.slice(startIndex, startIndex + VAR_GROUPS_PER_PAGE);

      window.skuOptionsHtml = (window.allSkus || []).filter(s => !s.is_combo).map(s => `<option value="${escapeHtml(s.sku)}">${escapeHtml(s.sku)} — ${escapeHtml(s.product_name)}</option>`).join('');

      const statusBadge = s => ({
        MAPPED:   '<span style="background:#dcfce7;color:#16a34a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">✅ Đã map</span>',
        UNMAPPED: '<span style="background:#fef3c7;color:#b45309;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">⚠️ Chưa map</span>',
        IGNORED:  '<span style="background:#f3f4f6;color:#9ca3af;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">🚫 Bỏ qua</span>',
      })[s] || s;

      const rows = pagedGroups.map(parent => {
          const childHtml = parent.variations.map(v => {
              let mappedHtml = '';
              if (v.map_status === 'MAPPED') {
                try {
                  const items = JSON.parse(v.mapped_items || '[]');
                  mappedHtml = items.length > 0 ? items.map(i => `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:6px;color:#15803d;font-weight:600">${i.qty} x ${escapeHtml(i.sku)}</code>`).join(' + ') : `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:6px;color:#15803d;font-weight:600">${escapeHtml(v.internal_sku)}</code>`;
                } catch(e) { mappedHtml = `<code style="font-size:12px;background:#dcfce7;padding:3px 8px;border-radius:6px;color:#15803d;font-weight:600">${escapeHtml(v.internal_sku)}</code>`; }
              }
              const priceFormatted = v.price ? Number(v.price).toLocaleString('vi-VN') + 'đ' : '0đ';
              const discountFormatted = v.discount_price ? Number(v.discount_price).toLocaleString('vi-VN') + 'đ' : '0đ';
              const stockStr = v.stock !== null && v.stock !== undefined ? escapeHtml(v.stock) : '0';
                
              return `
              <div style="display: flex; align-items: center; padding: 10px 16px 10px 60px; border-bottom: 1px solid #f1f5f9; background: #fff; transition: 0.2s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='#fff'">
                  <div style="margin-right: 12px; display: flex; align-items: center;" onclick="event.stopPropagation()">
                      <input type="checkbox" class="var-checkbox" data-id="${v.id}" onchange="updateVarBulkDeleteUI()" style="transform:scale(1.1); cursor:pointer;">
                  </div>
                  <div style="flex: 2; min-width: 0;">
                      <div style="font-size: 13px; font-weight: 600; color: #334155;">↳ ${escapeHtml(v.variation_name) || 'Mặc định'}</div>
                      <div style="font-size: 11px; color: #94a3b8; font-family: monospace; margin-top: 2px;">Mã Sàn: ${escapeHtml(v.platform_sku) || '—'}</div>
                      <div style="margin-top:4px;">${statusBadge(v.map_status)}</div>
                  </div>
                  <div style="flex: 1; text-align: center; font-size: 13px;">
                      <div style="color: #64748b; font-size:11px; margin-bottom:4px;">Giá gốc</div>
                      <strong style="color:#64748b; text-decoration: ${discountFormatted !== '0đ' && discountFormatted !== priceFormatted ? 'line-through' : 'none'};">${priceFormatted}</strong>
                  </div>
                  <div style="flex: 1; text-align: center; font-size: 13px;">
                      <div style="color: #ef4444; font-size:11px; font-weight:bold; margin-bottom:4px;">Giá KM</div>
                      <strong style="color:#ef4444; font-size:13px;">${discountFormatted !== '0đ' ? discountFormatted : '—'}</strong>
                  </div>
                  <div style="flex: 1; text-align: center; font-size: 13px;">
                      <div style="color: #64748b; font-size:11px; margin-bottom:4px;">Tồn kho</div>
                      <strong style="color:#2563eb; font-size:14px;">📦 ${stockStr}</strong>
                  </div>
                  <div style="flex: 0 0 160px; display:flex; flex-direction:column; gap:6px; align-items:flex-end;" onclick="event.stopPropagation()">
                          ${v.map_status === 'MAPPED' ? `
                          <div style="font-size:11px; margin-bottom:4px;">${mappedHtml}</div>
                          <div style="display:flex; gap:6px; width:100%;">
                              <button onclick="resetVarMap(${v.id})" style="flex:1; padding:4px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600">✕ Hủy Map</button>
                              <button onclick="openEditVarModal(${v.id})" style="flex:1; padding:4px; background:#fef3c7; color:#d97706; border:1px solid #fde047; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600">✏️ Sửa SP</button>
                          </div>
                      ` : `
                          <div style="display:flex; gap:6px; width:100%; margin-bottom:4px;">
                              <button onclick="openQuickMapModal('${v.id}', '${escapeHtml(v.platform_sku)}')" style="flex:1; padding:4px 0; background:#3b82f6; color:white; border:none; border-radius:6px; font-size:10px; cursor:pointer; font-weight:bold;">🔗 Map</button>
                              <button onclick="copyToInternalSku(${v.id})" style="flex:1; padding:4px 0; background:#10b981; color:white; border:none; border-radius:6px; font-size:10px; cursor:pointer; font-weight:bold;" title="Tạo SKU nội bộ và Map tự động">➕ Copy NB</button>
                          </div>
                          <div style="display:flex; gap:6px; width:100%;">
                              <button onclick="ignoreVar(${v.id})" style="flex:1; padding:4px 0; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:4px; font-size:10px; cursor:pointer; font-weight:600">🚫 Bỏ qua</button>
                              <button onclick="openEditVarModal(${v.id})" style="flex:1; padding:4px 0; background:#f59e0b; color:white; border:none; border-radius:4px; font-size:10px; cursor:pointer; font-weight:600">✏️ Sửa SP</button>
                          </div>
                      `}
                  </div>
              </div>`;
          }).join('');

          return `
          <div style="border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
              <div style="display: flex; align-items: center; padding: 12px 16px; background: #f8fafc; cursor: pointer; transition: 0.2s;" onclick="toggleVarGroup('${parent.key}')" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                  <img src="${parent.image_url || 'https://placehold.co/60x60?text=No+Img'}" style="width: 48px; height: 48px; border-radius: 6px; object-fit: cover; border: 1px solid #cbd5e1; margin-right: 16px;">
                  <div style="flex: 2; min-width: 0;">
                      <div style="font-weight: 700; color: #0f172a; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(parent.product_name)}">${escapeHtml(parent.product_name) || 'Sản phẩm không tên'}</div>
                      <div style="display:flex; gap:6px; margin-top:6px; align-items:center; flex-wrap:wrap;">
                          <span style="background:#f1f5f9;color:#475569;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;">🛒 ${escapeHtml(parent.platform)} - ${escapeHtml(parent.shop)}</span>
                          <span style="background:#e0e7ff;color:#4338ca;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">${parent.variations.length} Phân loại</span>
                      </div>
                  </div>
                  <div style="flex: 1; text-align: center; font-size: 13px;">
                      <span style="color: #64748b;">Tổng Tồn Kho:</span> <span style="font-weight: 700; color: #16a34a; font-size: 15px;">${parent.total_stock}</span>
                  </div>
                  <div style="flex: 0 0 40px; text-align: right; color: #64748b;">
                      <span id="icon-${parent.key}" style="font-size: 12px; transition: transform 0.3s; display: inline-block;">▼</span>
                  </div>
              </div>
              <div id="vars-${parent.key}" style="display: none; border-top: 1px dashed #e2e8f0;">
                  ${childHtml}
              </div>
          </div>`;
      }).join('');

      if (container) container.innerHTML = `<datalist id="sku-datalist">${window.skuOptionsHtml}</datalist><div style="margin-bottom: 20px;">${rows}</div>`;
        
      if (paginationWrap) {
          paginationWrap.innerHTML = `
            <button onclick="renderVariations(${window.currentVarPage - 1})" ${window.currentVarPage === 1 ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; background:${window.currentVarPage === 1 ? '#f8fafc' : 'white'}; color:${window.currentVarPage === 1 ? '#cbd5e1' : '#333'}; cursor:${window.currentVarPage === 1 ? 'not-allowed' : 'pointer'}; font-weight:bold;">‹ Trang trước</button>
            <span style="padding:8px 16px; background:#eff6ff; color:#2563eb; border-radius:8px; font-weight:bold; font-size:14px; border:1px solid #bfdbfe;">Trang ${window.currentVarPage} / ${totalPages} (Tổng ${totalItems} SP)</span>
            <button onclick="renderVariations(${window.currentVarPage + 1})" ${window.currentVarPage === totalPages ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; background:${window.currentVarPage === totalPages ? '#f8fafc' : 'white'}; color:${window.currentVarPage === totalPages ? '#cbd5e1' : '#333'}; cursor:${window.currentVarPage === totalPages ? 'not-allowed' : 'pointer'}; font-weight:bold;">Trang sau ›</button>
          `;
      }
        
      const titleEl = document.querySelector('#tab-variations .card-title');
      if (titleEl && !document.getElementById('btnAutoSyncOld')) {
          titleEl.innerHTML += ` <button id="btnAutoSyncOld" onclick="autoSyncOldUnmapped()" style="margin-left:12px; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; border-radius:8px; padding:6px 14px; font-size:12px; cursor:pointer; font-weight:bold; box-shadow:0 3px 6px rgba(16,185,129,0.3); transition:0.2s;" title="Biến toàn bộ mã Chưa Map thành SKU Nội bộ">⚡ Đẩy mã Chưa Map sang SKU Nội Bộ</button>`;
      }
      if(typeof window.injectEditModalUI === 'function') window.injectEditModalUI();
  } catch(err) {
      console.error("Lỗi khi render bảng:", err);
  }
}

window.toggleVarGroup = function(key) {
    const el = document.getElementById('vars-' + key); const icon = document.getElementById('icon-' + key);
    if (el.style.display === 'none') { el.style.display = 'block'; if (icon) icon.style.transform = 'rotate(180deg)'; } 
    else { el.style.display = 'none'; if (icon) icon.style.transform = 'rotate(0deg)'; }
}

const _origSwitchTab = window.switchTab;
window.switchTab = function(tab) {
  if(_origSwitchTab) _origSwitchTab(tab);
  if (tab === 'variations' && (!window.allVariations || window.allVariations.length === 0)) window.loadVariations();
  if (tab === 'shops' && typeof window.loadShopWarehouses === 'function') window.loadShopWarehouses();
}