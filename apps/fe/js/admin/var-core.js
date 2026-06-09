window.allVariations = [];
window.currentVarPage = 1;
window.VARS_PER_PAGE = 48;

window.escapeHtml = function(unsafe) {
  return (unsafe || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

function formatVnd(value) {
  const number = Number(value || 0);
  return number ? number.toLocaleString('vi-VN') + 'đ' : '0đ';
}

function statusBadge(status) {
  const badges = {
    MAPPED: '<span class="variation-chip" style="background:#dcfce7;color:#16a34a;">Đã liên kết</span>',
    UNMAPPED: '<span class="variation-chip" style="background:#fef3c7;color:#b45309;">Chưa liên kết</span>',
    IGNORED: '<span class="variation-chip" style="background:#f3f4f6;color:#64748b;">Bỏ qua</span>'
  };
  return badges[status] || escapeHtml(status || '');
}

function selectedVariationIds() {
  return Array.from(document.querySelectorAll('.var-checkbox:checked'))
    .map(cb => Number(cb.getAttribute('data-id')))
    .filter(Number.isFinite);
}
window.getSelectedVariationIds = selectedVariationIds;

window.loadVariations = async function() {
  const container = document.getElementById('var-list-wrapper') || document.getElementById('variationsTable');
  if (container) container.innerHTML = '<p style="text-align:center;color:#64748b;padding:32px">Đang tải dữ liệu đa sàn...</p>';

  try {
    const variationPromise = fetch(API + '/api/sync-variations?t=' + Date.now()).then(r => r.json());
    const skuPromise = (!window.allSkus || window.allSkus.length === 0)
      ? fetch(API + '/api/products?t=' + Date.now()).then(r => r.json())
      : Promise.resolve(window.allSkus);
    const [variationRows, skuRows] = await Promise.all([variationPromise, skuPromise]);
    window.allVariations = variationRows;
    window.allSkus = skuRows;
    updateShopDropdown();
    renderVariations();
    updateUnmappedBadge();
  } catch (e) {
    if (container) container.innerHTML = `<p style="color:#ef4444;padding:20px;text-align:center;font-weight:bold;">Lỗi kết nối Server: ${escapeHtml(e.message)}</p>`;
  }
};

window.updateShopDropdown = function() {
  const platformFilter = document.getElementById('var_filter_platform')?.value || '';
  const shopSelect = document.getElementById('var_filter_shop');
  if (!shopSelect) return;

  const filteredShops = window.allVariations
    .filter(v => !platformFilter || v.platform === platformFilter)
    .map(v => v.shop)
    .filter(Boolean);
  const uniqueShops = [...new Set(filteredShops)];
  const currentShop = shopSelect.value;

  shopSelect.innerHTML = '<option value="">Tất cả shop</option>' +
    uniqueShops.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  shopSelect.value = uniqueShops.includes(currentShop) ? currentShop : '';
};

window.updateUnmappedBadge = function() {
  const n = window.allVariations.filter(v => v.map_status === 'UNMAPPED').length;
  const badge = document.getElementById('badge-unmapped');
  if (badge) {
    badge.textContent = n;
    badge.style.display = n > 0 ? '' : 'none';
  }
};

window.renderVariations = function(page = 1) {
  try {
    window.currentVarPage = page;
    const kw = (document.getElementById('var_search')?.value || '').toLowerCase().trim();
    const platformFilter = document.getElementById('var_filter_platform')?.value || '';
    const shopFilter = document.getElementById('var_filter_shop')?.value || '';
    const statusFilter = document.getElementById('var_filter_status')?.value || '';

    const list = (window.allVariations || []).filter(v => {
      const matchKw = !kw ||
        (v.platform_sku || '').toLowerCase().includes(kw) ||
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
      if (container) container.innerHTML = '<div class="variation-empty">Không tìm thấy sản phẩm phù hợp.</div>';
      if (paginationWrap) paginationWrap.innerHTML = '';
      return;
    }

    const groupedList = [];
    const groupMap = new Map();
    list.forEach(v => {
      const keyId = (v.platform_item_id || v.product_name || '').toString().replace(/[^a-zA-Z0-9]/g, '');
      const key = `${v.platform}_${v.shop}_${keyId}`;
      if (!groupMap.has(key)) {
        const parentObj = {
          key,
          platform: v.platform,
          shop: v.shop,
          product_name: v.product_name,
          platform_item_id: v.platform_item_id,
          item_sku: v.item_sku || v.platform_sku,
          image_url: v.image_url,
          total_stock: 0,
          variations: []
        };
        groupMap.set(key, parentObj);
        groupedList.push(parentObj);
      }
      const parent = groupMap.get(key);
      parent.total_stock += Number(v.stock || 0);
      parent.variations.push(v);
    });

    const groupsPerPage = 20;
    const totalItems = groupedList.length;
    const totalPages = Math.ceil(totalItems / groupsPerPage) || 1;
    if (window.currentVarPage > totalPages) window.currentVarPage = totalPages;
    const startIndex = (window.currentVarPage - 1) * groupsPerPage;
    const pagedGroups = groupedList.slice(startIndex, startIndex + groupsPerPage);

    window.skuOptionsHtml = (window.allSkus || [])
      .filter(s => !s.is_combo)
      .map(s => `<option value="${escapeHtml(s.sku)}">${escapeHtml(s.sku)} - ${escapeHtml(s.product_name)}</option>`)
      .join('');

    const rows = pagedGroups.map(parent => {
      const childHtml = parent.variations.map(v => {
        let mappedHtml = '';
        if (v.map_status === 'MAPPED') {
          try {
            const items = JSON.parse(v.mapped_items || '[]');
            mappedHtml = items.length > 0
              ? items.map(i => `<code style="font-size:11px;background:#dcfce7;padding:3px 7px;border-radius:6px;color:#15803d;font-weight:700">${escapeHtml(i.qty)} x ${escapeHtml(i.sku)}</code>`).join(' + ')
              : `<code style="font-size:11px;background:#dcfce7;padding:3px 7px;border-radius:6px;color:#15803d;font-weight:700">${escapeHtml(v.internal_sku)}</code>`;
          } catch (e) {
            mappedHtml = `<code style="font-size:11px;background:#dcfce7;padding:3px 7px;border-radius:6px;color:#15803d;font-weight:700">${escapeHtml(v.internal_sku)}</code>`;
          }
        }

        const priceFormatted = formatVnd(v.price);
        const discountFormatted = formatVnd(v.discount_price);
        const hasDiscount = discountFormatted !== '0đ' && discountFormatted !== priceFormatted;
        const stockStr = v.stock !== null && v.stock !== undefined ? escapeHtml(v.stock) : '0';

        return `
          <div class="variation-child-row">
            <div onclick="event.stopPropagation()">
              <input type="checkbox" class="var-checkbox" data-id="${v.id}" onchange="updateVarBulkDeleteUI(); updateShipXanhButtonsUI();" style="transform:scale(1.08);cursor:pointer;">
            </div>
            <div>
              <div class="variation-name">${escapeHtml(v.variation_name) || 'Mặc định'}</div>
              <div class="variation-code">Mã sàn: ${escapeHtml(v.platform_sku) || '-'}</div>
              <div style="margin-top:5px;">${statusBadge(v.map_status)}</div>
            </div>
            <div class="variation-metric">
              <span class="label">Giá gốc</span>
              <strong style="color:#64748b;text-decoration:${hasDiscount ? 'line-through' : 'none'};">${priceFormatted}</strong>
            </div>
            <div class="variation-metric">
              <span class="label" style="color:#ef4444;">Giá KM</span>
              <strong style="color:#ef4444;">${discountFormatted !== '0đ' ? discountFormatted : '-'}</strong>
            </div>
            <div class="variation-metric">
              <span class="label">Tồn kho</span>
              <strong style="color:#2563eb;">${stockStr}</strong>
            </div>
            <div class="variation-actions" onclick="event.stopPropagation()">
              ${v.map_status === 'MAPPED' ? `
                <div style="font-size:11px;margin-bottom:2px;">${mappedHtml}</div>
                <div class="variation-actions-row">
                  <button onclick="resetVarMap(${v.id})" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5;">Hủy map</button>
                  <button onclick="openEditVarModal(${v.id})" style="background:#fef3c7;color:#d97706;border-color:#fde047;">Sửa</button>
                </div>
              ` : `
                <div class="variation-actions-row">
                  <button onclick="openQuickMapModal('${v.id}', '${escapeHtml(v.platform_sku)}')" style="background:#3b82f6;color:white;">Map</button>
                  <button onclick="copyToInternalSku(${v.id})" style="background:#10b981;color:white;">Copy NB</button>
                </div>
                <div class="variation-actions-row">
                  <button onclick="ignoreVar(${v.id})" style="background:#f1f5f9;color:#475569;border-color:#cbd5e1;">Bỏ qua</button>
                  <button onclick="openEditVarModal(${v.id})" style="background:#f59e0b;color:white;">Sửa</button>
                </div>
              `}
            </div>
          </div>`;
      }).join('');

      return `
        <div class="variation-card">
          <div class="variation-parent-row" onclick="toggleVarGroup('${parent.key}')">
            <img src="${parent.image_url || 'https://placehold.co/60x60?text=No+Img'}" style="width:48px;height:48px;border-radius:6px;object-fit:cover;border:1px solid #cbd5e1;background:#f8fafc;">
            <div style="min-width:0;">
              <div style="font-weight:800;color:#0f172a;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(parent.product_name)}">${escapeHtml(parent.product_name) || 'Sản phẩm không tên'}</div>
              <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap;">
                <span class="variation-chip" style="background:#f1f5f9;color:#475569;text-transform:uppercase;">${escapeHtml(parent.platform)} - ${escapeHtml(parent.shop)}</span>
                <span class="variation-chip" style="background:#e0e7ff;color:#4338ca;">${parent.variations.length} phân loại</span>
              </div>
            </div>
            <div class="variation-stock-summary">
              Tổng tồn
              <strong>${parent.total_stock}</strong>
            </div>
            <div style="text-align:right;color:#64748b;">
              <span id="icon-${parent.key}" style="font-size:12px;transition:transform 0.3s;display:inline-block;">▼</span>
            </div>
          </div>
          <div id="vars-${parent.key}" style="display:none;border-top:1px solid #e2e8f0;">
            ${childHtml}
          </div>
        </div>`;
    }).join('');

    if (container) {
      container.innerHTML = `<datalist id="sku-datalist">${window.skuOptionsHtml}</datalist>${rows}`;
    }

    if (paginationWrap) {
      paginationWrap.innerHTML = `
        <button class="btn-outline" onclick="renderVariations(${window.currentVarPage - 1})" ${window.currentVarPage === 1 ? 'disabled' : ''}>Trang trước</button>
        <span style="padding:8px 14px;background:#eff6ff;color:#2563eb;border-radius:8px;font-weight:700;font-size:13px;border:1px solid #bfdbfe;">Trang ${window.currentVarPage} / ${totalPages} - ${totalItems} sản phẩm</span>
        <button class="btn-outline" onclick="renderVariations(${window.currentVarPage + 1})" ${window.currentVarPage === totalPages ? 'disabled' : ''}>Trang sau</button>
      `;
    }

    if (typeof window.injectEditModalUI === 'function') window.injectEditModalUI();
  } catch (err) {
    console.error('Lỗi render bảng variation:', err);
  }
};

window.toggleVarGroup = function(key) {
  const el = document.getElementById('vars-' + key);
  const icon = document.getElementById('icon-' + key);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  if (icon) icon.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
};

const _origSwitchTab = window.switchTab;
window.switchTab = function(tab) {
  if (_origSwitchTab) _origSwitchTab(tab);
  if (tab === 'variations' && (!window.allVariations || window.allVariations.length === 0)) window.loadVariations();
  if (tab === 'shops' && typeof window.loadShopWarehouses === 'function') window.loadShopWarehouses();
};

window.switchShipXanhTab = function(status, btnElement) {
  document.querySelectorAll('.shipxanh-tab').forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  const statusInput = document.getElementById('var_filter_status');
  if (statusInput) statusInput.value = status;
  window.renderVariations(1);
  const btnCopy = document.getElementById('btnBulkCopyToWarehouse');
  if (btnCopy) btnCopy.style.display = 'none';
};

window.updateShipXanhButtonsUI = function() {
  const count = selectedVariationIds().length;
  const btnCopy = document.getElementById('btnBulkCopyToWarehouse');
  const countSpan = document.getElementById('selectedCopyCount');
  if (btnCopy) btnCopy.style.display = count > 0 ? 'inline-flex' : 'none';
  if (countSpan) countSpan.textContent = count;
};

document.addEventListener('change', function(e) {
  const target = e.target;
  if ((target && target.classList && target.classList.contains('var-checkbox')) || target?.id === 'selectAllVarChk') {
    setTimeout(window.updateShipXanhButtonsUI, 50);
  }
});

window.copySelectedToWarehouse = async function() {
  const ids = selectedVariationIds();
  if (!ids.length) return;
  if (!confirm(`Tạo SKU nội bộ và sao chép ${ids.length} sản phẩm này về Kho Tổng?`)) return;

  const btn = document.getElementById('btnBulkCopyToWarehouse');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = 'Đang xử lý...';
    btn.disabled = true;
  }

  try {
    const res = await fetch(API + '/api/sync-variations?action=copy-to-warehouse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      showToast(`Đã tạo ${data.copied} SKU nội bộ mới.`);
      document.querySelectorAll('.var-checkbox:checked').forEach(cb => { cb.checked = false; });
      await loadVariations();
    } else {
      showToast('Lỗi: ' + (data.error || 'Server từ chối'), true);
    }
  } catch (err) {
    showToast('Lỗi mạng: ' + err.message, true);
  } finally {
    if (btn) {
      btn.innerHTML = oldText;
      btn.disabled = false;
    }
  }
};
