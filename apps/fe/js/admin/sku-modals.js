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