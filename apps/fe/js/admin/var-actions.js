window.toggleAllVarCheck = function(checked) {
  document.querySelectorAll('.var-checkbox').forEach(cb => cb.checked = checked);
  updateVarBulkDeleteUI();
  if (typeof window.updateShipXanhButtonsUI === 'function') window.updateShipXanhButtonsUI();
}

window.updateVarBulkDeleteUI = function() {
  const count = document.querySelectorAll('.var-checkbox:checked').length;
  const btnBulk = document.getElementById('btnBulkDeleteVar');
  const countSpan = document.getElementById('selectedVarCount');
  if (!btnBulk || !countSpan) return;
  if (count > 0) { btnBulk.style.display = 'inline-flex'; countSpan.textContent = count; }
  else { btnBulk.style.display = 'none'; }
}

window.bulkDeleteVariations = async function() {
  const checked = document.querySelectorAll('.var-checkbox:checked');
  const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
  if (!ids.length) return;
  if (confirm(`Bạn có chắc chắn muốn xóa ${ids.length} sản phẩm này khỏi danh sách chờ map?`)) {
      try {
          const res = await fetch(API + '/api/sync-variations/bulk', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
          if (res.ok) { showToast(`✅ Đã xóa thành công ${ids.length} sản phẩm!`); loadVariations(); } 
          else { showToast('❌ Xóa thất bại!', true); }
      } catch (err) { showToast('❌ Lỗi kết nối: ' + err.message, true); }
  }
}

window.ignoreVar = async function(id) {
  await fetch(API + '/api/sync-variations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, internal_sku: '', map_status: 'IGNORED' }) });
  showToast('🚫 Đã bỏ qua variation này'); loadVariations();
}

window.resetVarMap = async function(id) {
  await fetch(API + '/api/sync-variations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, internal_sku: '', map_status: 'UNMAPPED' }) });
  showToast('↩ Đã reset map'); loadVariations();
}

window.copyToInternalSku = async function(id) {
    const v = window.allVariations.find(item => item.id == id); if (!v) return;
    const defaultSku = (v.platform_sku && String(v.platform_sku).trim() !== 'null' && String(v.platform_sku).trim() !== '') ? String(v.platform_sku).trim() : ('SKU_' + v.platform.toUpperCase() + '_' + v.id);
    const newSku = prompt("Xác nhận mã SKU Nội Bộ sẽ tạo mới trong kho:", defaultSku);
    if (!newSku || newSku.trim() === '') return;

    showToast("⏳ Đang copy về kho và Map tự động...", false);
    try {
        let fullName = v.product_name || '';
        if (v.variation_name && String(v.variation_name).trim() !== 'null' && String(v.variation_name).trim() !== '') fullName += ' - ' + v.variation_name;
        
        const resCreate = await fetch(API + "/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: newSku.trim(), product_name: fullName.trim(), cost_invoice: 0, cost_real: 0, image_url: v.image_url || '', stock: parseInt(v.stock) || 0 }) });
        if (!resCreate.ok) throw new Error("Mã SKU này đã tồn tại trong kho nội bộ! Vui lòng chọn mã khác.");

        const resMap = await fetch(API + '/api/sync-variations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: v.id, internal_sku: newSku.trim(), mapped_items: JSON.stringify([{sku: newSku.trim(), qty: 1}]) }) });
        if (!resMap.ok) throw new Error("Copy về kho thành công nhưng bị Lỗi khi Map!");

        showToast(`✅ Đã copy về kho và Map thành công mã: ${newSku.trim()}`); loadVariations();
        if (typeof window.loadSkus === 'function') window.loadSkus();
    } catch (err) { showToast("❌ Lỗi: " + err.message, true); }
}

window.autoSyncOldUnmapped = async function() {
   const unmapped = window.allVariations.filter(v => v.map_status === 'UNMAPPED' && v.platform_sku && v.platform_sku.length >= 2 && !v.platform_sku.toLowerCase().includes('chưa map') && !v.platform_sku.toLowerCase().includes('null'));
   if (unmapped.length === 0) return showToast("⚠️ Không có mã Chưa Map nào hợp lệ để đồng bộ!", true);
   if (!confirm(`Phát hiện ${unmapped.length} mã Chưa Map. Hệ thống sẽ tự động chuyển tất cả chúng thành SKU Nội bộ. Bạn có chắc chắn?`)) return;

   const btn = document.getElementById('btnAutoSyncOld');
   if (btn) { btn.textContent = "⏳ Đang đồng bộ..."; btn.disabled = true; }
   showToast("🚀 Đang đẩy dữ liệu lên Server, vui lòng đợi...");

   const payloadVariations = unmapped.map(v => ({ platform: v.platform, shop: v.shop, platform_item_id: v.platform_item_id, product_name: v.product_name, variation_name: v.variation_name, platform_sku: v.platform_sku, image_url: v.image_url, main_image: v.image_url, price: v.price, discount_price: v.discount_price, stock: v.stock }));

   try {
       const res = await fetch(API + '/api/sync-variations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variations: payloadVariations }) });
       if (!res.ok) throw new Error("Server từ chối yêu cầu");
       const result = await res.json();
       showToast(`✅ Đã đồng bộ thành công ${result.auto_mapped || unmapped.length} mã sang Kho SKU Nội bộ!`);
       loadVariations(); if (typeof loadSkus === 'function') loadSkus(); 
   } catch(e) { showToast("❌ Lỗi đồng bộ: " + e.message, true); } finally {
       if (btn) { btn.innerHTML = "⚡ Đẩy mã Chưa Map sang SKU Nội Bộ"; btn.disabled = false; }
   }
}

window.syncApiProductsFromDashboard = async function() {
  const btn = document.getElementById('btnSyncApiProducts');
  const oldText = btn ? btn.innerHTML : '';
  const platform = document.getElementById('var_filter_platform')?.value || '';
  const shop = document.getElementById('var_filter_shop')?.value || '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Đang đồng bộ...';
  }
  showToast('Đang kéo sản phẩm và tồn kho chuẩn từ các shop có API...');

  try {
    const res = await fetch(API + '/api/products/sync-api-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform,
        shop,
        limit: 180,
        ...(typeof getProductSyncOptions === 'function' ? getProductSyncOptions() : { includeOutOfStock: false })
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Server từ chối đồng bộ');

    const skipped = Number(data.skipped_out_of_stock || 0);
    const skippedVars = Number(data.skipped_zero_stock_variations || 0);
    const skippedText = skipped || skippedVars ? ` Bỏ qua ${skipped} sản phẩm hết hàng, ${skippedVars} phân loại hết hàng.` : '';
    showToast(`Đã đồng bộ ${data.synced_variations || 0} SKU từ ${data.shops?.length || 0} shop API.${skippedText}`);
    await loadVariations();
    if (typeof window.loadSkus === 'function') window.loadSkus();
  } catch (err) {
    showToast('Lỗi đồng bộ API: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }
}
