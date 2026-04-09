window.unmappedVarsCache = [];
window.currentQuickMapSku = "";

window.openQuickMapModal = async function(sku) {
    window.currentQuickMapSku = sku;
    document.getElementById('quickMapTargetSku').textContent = sku;
    document.getElementById('quickMapModal').style.display = 'flex';
    document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px;">⏳ Đang tải mã sàn...</div>';
    try {
        const res = await fetch(API + "/api/sync-variations");
        window.unmappedVarsCache = await res.json(); renderQuickMapList();
    } catch(e) { document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; color:red;">❌ Lỗi tải dữ liệu.</div>'; }
}

window.closeQuickMapModal = function() { document.getElementById('quickMapModal').style.display = 'none'; }

window.renderQuickMapList = function() {
    const kw = document.getElementById('quickMapSearch').value.toLowerCase().trim();
    const filtered = window.unmappedVarsCache.filter(v => (v.platform_sku && v.platform_sku.toLowerCase().includes(kw)) || (v.product_name && v.product_name.toLowerCase().includes(kw)));
    const displayList = filtered.slice(0, 100);
    const listEl = document.getElementById('quickMapList');
    if (!displayList.length) return listEl.innerHTML = '<div style="text-align:center; padding:30px;">Không tìm thấy.</div>';
    
    listEl.innerHTML = displayList.map(v => `
        <div onclick="if(confirm('Map mã này vào ${window.currentQuickMapSku}?')) executeQuickMap(${v.id}, '${window.currentQuickMapSku}')" style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; background:white;">
            <img src="${v.image_url || 'https://placehold.co/60'}" style="width:45px; height:45px; border-radius:6px; object-fit:cover;">
            <div style="flex:1;"><div style="font-size:13px; font-weight:700;">${escapeHtml(v.product_name)}</div>
            <div style="font-size:11px; margin-top:4px;">🏷️ ${escapeHtml(v.platform_sku)}</div></div>
            <div style="color:#2563eb; font-weight:800; font-size:20px;">+</div>
        </div>`).join('');
}

window.executeQuickMap = async function(varId, internalSku) {
    try {
        document.getElementById('quickMapList').innerHTML = '<div style="text-align:center;">⏳ Đang nối mã...</div>';
        const res = await fetch(API + "/api/sync-variations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: varId, internal_sku: internalSku, mapped_items: JSON.stringify([{sku: internalSku, qty: 1}]) }) });
        if (res.ok) { showToast(`✅ Đã Map!`); closeQuickMapModal(); loadSkus(); } 
        else { showToast('❌ Lỗi khi Map!', true); renderQuickMapList(); }
    } catch(e) { showToast('❌ Lỗi mạng!', true); }
}

window.openProductDetail = function(parentSku) {
    const p = window.skuTree.find(s => s.sku === parentSku); if (!p) return;
    document.getElementById('pd-title').textContent = p.product_name || 'Không có tên';
    document.getElementById('pd-sku').textContent = p.sku;
    document.getElementById('pd-stock').textContent = (p.stock || 0) + (p.children ? p.children.reduce((sum, c) => sum + (c.stock || 0), 0) : 0);
    const mediaContainer = document.getElementById('pd-main-media');
    mediaContainer.innerHTML = `<img src="${p.image_url || 'https://placehold.co/400'}" style="width:100%; height:100%; object-fit:contain;">`;
    
    const varContainer = document.getElementById('pd-variations'); varContainer.innerHTML = '';
    if (p.children && p.children.length > 0) {
        p.children.forEach(c => {
            const btn = document.createElement('button'); btn.className = 'var-btn'; btn.style.cssText = "padding:8px; border:1px solid #cbd5e1; border-radius:4px; margin:2px; cursor:pointer;";
            btn.innerHTML = `<span>${escapeHtml(c.product_name)}</span>`;
            btn.onclick = () => { document.getElementById('pd-stock').textContent = c.stock || 0; document.getElementById('pd-price').textContent = Math.round(c.price || 0) + 'đ'; };
            varContainer.appendChild(btn);
        });
    }
    document.getElementById('productDetailModal').style.display = 'flex';
}

// =======================================================
// MODULE QUẢN LÝ GÓI COMBO
// =======================================================
window.currentComboSku = "";
window.currentComboItems = [];

window.openComboModal = function(sku) {
    window.currentComboSku = sku;
    const p = window.allSkus.find(s => s.sku === sku);
    if (!p) return;

    document.getElementById('comboTargetSku').textContent = sku;
    document.getElementById('comboTargetName').textContent = p.product_name || '';

    // Lấy dữ liệu combo cũ nếu có
    try { window.currentComboItems = JSON.parse(p.combo_items || '[]'); } 
    catch(e) { window.currentComboItems = []; }

    document.getElementById('comboModal').style.display = 'flex';
    document.getElementById('comboSearch').value = '';
    document.getElementById('comboSearchList').innerHTML = '';
    renderComboItems();
}

window.closeComboModal = function() {
    document.getElementById('comboModal').style.display = 'none';
}

window.renderComboItems = function() {
    const listEl = document.getElementById('comboSelectedList');
    if (window.currentComboItems.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-style:italic; border:1px dashed #cbd5e1; border-radius:8px;">Chưa có sản phẩm thành phần nào.<br>Hãy gõ tìm và thêm ở ô phía trên 👆</div>';
        return;
    }
    listEl.innerHTML = window.currentComboItems.map((item, index) => {
        const pInfo = window.allSkus.find(s => s.sku === item.sku) || { product_name: 'SP không tồn tại', image_url: 'https://placehold.co/40' };
        return `
        <div style="display:flex; align-items:center; gap:12px; padding:10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; margin-bottom:8px;">
            <img src="${pInfo.image_url}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; border:1px solid #cbd5e1;">
            <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:700; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(pInfo.product_name)}</div>
                <div style="font-size:11px; color:#64748b; font-family:monospace;">${escapeHtml(item.sku)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:11px; font-weight:800; color:#475569;">SỐ LƯỢNG:</span>
                <input type="number" value="${item.qty}" min="1" onchange="updateComboItemQty(${index}, this.value)" style="width:50px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:bold;">
                <button onclick="removeComboItem(${index})" style="background:#fee2e2; border:1px solid #fca5a5; border-radius:4px; color:#dc2626; padding:4px 8px; cursor:pointer;" title="Xóa">✕</button>
            </div>
        </div>`;
    }).join('');
}

window.searchComboProduct = function() {
    const kw = document.getElementById('comboSearch').value.toLowerCase().trim();
    const listEl = document.getElementById('comboSearchList');
    if (!kw) { listEl.innerHTML = ''; return; }

    // Tìm SP nội bộ (Bỏ qua chính nó và bỏ qua các combo khác để chống đệ quy)
    const filtered = window.allSkus.filter(s => s.is_combo != 1 && s.sku !== window.currentComboSku && ((s.sku && s.sku.toLowerCase().includes(kw)) || (s.product_name && s.product_name.toLowerCase().includes(kw))));
    const displayList = filtered.slice(0, 10); // Lấy 10 kết quả đầu

    if (!displayList.length) { listEl.innerHTML = '<div style="padding:10px; text-align:center; color:#94a3b8; font-size:12px;">Không tìm thấy mã nào phù hợp.</div>'; return; }

    listEl.innerHTML = displayList.map(s => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #f1f5f9; cursor:pointer;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" onclick="addComboItem('${s.sku}')">
            <div style="display:flex; align-items:center; gap:8px;">
                <img src="${s.image_url || 'https://placehold.co/30'}" style="width:30px; height:30px; border-radius:4px; object-fit:cover;">
                <div>
                    <div style="font-size:12px; font-weight:700; color:#0f172a;">${escapeHtml(s.product_name)}</div>
                    <div style="font-size:10px; color:#64748b;">${escapeHtml(s.sku)}</div>
                </div>
            </div>
            <span style="color:#7c3aed; font-weight:800; font-size:12px; background:#f3e8ff; padding:2px 6px; border-radius:4px;">+ THÊM</span>
        </div>`).join('');
}

window.addComboItem = function(sku) {
    const exists = window.currentComboItems.find(i => i.sku === sku);
    if (exists) { exists.qty++; } else { window.currentComboItems.push({ sku: sku, qty: 1 }); }
    document.getElementById('comboSearch').value = '';
    document.getElementById('comboSearchList').innerHTML = '';
    renderComboItems();
}

window.updateComboItemQty = function(index, val) {
    const q = parseInt(val) || 1;
    window.currentComboItems[index].qty = q > 0 ? q : 1;
    renderComboItems();
}

window.removeComboItem = function(index) {
    window.currentComboItems.splice(index, 1);
    renderComboItems();
}

window.saveComboData = async function() {
    const btn = document.getElementById('btnSaveCombo');
    btn.innerHTML = '⏳ Đang lưu...'; btn.disabled = true;

    try {
        const payload = window.allSkus.find(s => s.sku === window.currentComboSku);
        if (!payload) throw new Error("Không tìm thấy SKU gốc");
        
        // Đánh dấu là Combo nếu có cấu hình item
        payload.is_combo = window.currentComboItems.length > 0 ? 1 : 0;
        payload.combo_items = JSON.stringify(window.currentComboItems);

        const res = await fetch(API + '/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('✅ Đã lưu cấu hình Combo thành công!');
            closeComboModal();
            loadSkus(); // Tải lại bảng để nó nhảy màu Tím
        } else {
            showToast('❌ Lỗi khi lưu vào Database!', true);
        }
    } catch(e) {
        showToast('❌ Lỗi mạng: ' + e.message, true);
    } finally {
        btn.innerHTML = '💾 Lưu Cấu Hình'; btn.disabled = false;
    }
}