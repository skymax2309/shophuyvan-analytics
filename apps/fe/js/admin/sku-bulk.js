window.exportSkuExcel = function() {
  let csv = "SKU,Tên sản phẩm,Mã SP Gốc (Parent),Vốn hóa đơn (đ),Vốn thực tế (đ),Tồn kho,Tồn kho an toàn,Là Combo (1/0),Thành phần Combo\n";
  window.allSkus.forEach(p => {
    csv += `"${(p.sku||"")}", "${(p.product_name||"")}", "${(p.parent_sku||"")}", ${p.cost_invoice||0}, ${p.cost_real||0}, ${p.stock||0}, ${p.min_stock||0}, ${p.is_combo||0}, "${(p.combo_items||"").replace(/"/g, '""')}"\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `full-data-sku.csv`; a.click(); showToast("✅ Đã xuất Excel!");
}

window.importBulkExcel = async function(input) {
    const file = input.files[0]; if (!file) return; showToast("⏳ Đang đọc Excel...");
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, {type: 'array'});
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (rows.length === 0) throw new Error("File trống!");
            const payload = rows.map(r => ({
                sku: String(r['SKU'] || r['sku'] || '').trim(), product_name: r['Tên sản phẩm'] || "", parent_sku: r['Mã SP Gốc (Parent)'] || null,
                cost_invoice: parseFloat(r['Vốn hóa đơn (đ)']) || 0, cost_real: parseFloat(r['Vốn thực tế (đ)']) || 0, stock: parseInt(r['Tồn kho']) || 0, is_combo: parseInt(r['Là Combo (1/0)']) || 0, combo_items: r['Thành phần Combo'] || null
            })).filter(r => r.sku !== '');
            const res = await fetch(API + "/api/products/bulk-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: payload }) });
            if (!res.ok) throw new Error(await res.text());
            showToast("✅ Đã Import thành công!"); input.value = ""; loadSkus(); 
        } catch (err) { showToast("❌ Lỗi Import: " + err.message, true); input.value = ""; }
    };
    reader.readAsArrayBuffer(file);
}

window.updateSkuBulkDeleteUI = function() {
    const count = document.querySelectorAll('.sku-chk:checked').length;
    const show = count > 0 ? 'inline-block' : 'none';
    if (document.getElementById('btnBulkDeleteSku')) document.getElementById('btnBulkDeleteSku').style.display = show;
    if (document.getElementById('btnBulkGroupParent')) document.getElementById('btnBulkGroupParent').style.display = show;
    if (document.getElementById('btnBulkUngroup')) document.getElementById('btnBulkUngroup').style.display = show;
}

window.promptGroupParent = async function() {
    const skus = Array.from(document.querySelectorAll('.sku-chk:checked')).map(cb => cb.dataset.sku); if (!skus.length) return;
    const parentSku = prompt(`Nhập mã Sản Phẩm GỐC (Cha):`); if (!parentSku) return;
    const parentName = prompt(`Nhập tên chung:`, "Sản phẩm " + parentSku);
    try {
        const res = await fetch(API + '/api/products/group-parent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_sku: parentSku.trim(), parent_name: parentName, child_skus: skus }) });
        if (res.ok) { showToast(`✅ Đã gộp thành công!`); loadSkus(); }
    } catch (e) { showToast('❌ Lỗi gộp: ' + e.message, true); }
}

window.bulkUngroup = async function() {
    const skus = Array.from(document.querySelectorAll('.sku-chk:checked')).map(cb => cb.dataset.sku); if (!skus.length) return;
    if (!confirm(`Tách ${skus.length} mã ra?`)) return;
    try {
        const res = await fetch(API + '/api/products/ungroup-parent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child_skus: skus }) });
        if (res.ok) { showToast(`✅ Đã tách!`); loadSkus(); }
    } catch (e) { showToast('❌ Lỗi tách: ' + e.message, true); }
}

window.bulkDeleteSkus = async function() {
    const skus = Array.from(document.querySelectorAll('.sku-chk:checked')).map(cb => cb.dataset.sku); if (!skus.length) return;
    if (!confirm(`XÓA VĨNH VIỄN ${skus.length} SKU?`)) return;
    try {
        const res = await fetch(API + '/api/products/bulk', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skus }) });
        if (res.ok) { showToast(`✅ Đã xóa ${skus.length} SKU!`); loadSkus(); }
    } catch (e) { showToast('❌ Lỗi xóa: ' + e.message, true); }
}

window.toggleAllCheck = function(checked) {
    const containerId = window._currentSkuTab === 'combo' ? 'skuComboTable' : (window._currentSkuTab === 'has-price' ? 'skuHasPriceTable' : (window._currentSkuTab === 'missing-map' ? 'skuMissingMapTable' : 'skuNoPriceTable'));
    document.querySelectorAll(`#${containerId} .sku-chk`).forEach(c => c.checked = checked); updateSkuBulkDeleteUI();
}