window.unmappedVarsCache = [];
window.currentQuickMapSku = "";

window.openQuickMapModal = async function(varId, platformSku) {
    window.currentVarId = varId;
    document.getElementById('quickMapTargetSku').textContent = platformSku || varId;
    document.getElementById('quickMapSearch').value = '';
    document.getElementById('quickMapModal').style.display = 'flex';
    document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px; color:#888;">⏳ Đang tải danh sách SKU nội bộ...</div>';
    try {
        const res = await fetch(API + "/api/products").then(r => r.json());
        window.unmappedVarsCache = Array.isArray(res) ? res : (res.data || []);
        renderQuickMapList();
    } catch(e) { document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px; color:#ef4444;">❌ Lỗi tải dữ liệu.</div>'; }
}

window.closeQuickMapModal = function() { document.getElementById('quickMapModal').style.display = 'none'; }

window.renderQuickMapList = function() {
    const kw = document.getElementById('quickMapSearch').value.toLowerCase().trim();
    const listEl = document.getElementById('quickMapList');
    const filtered = window.unmappedVarsCache.filter(v =>
        (v.sku && v.sku.toLowerCase().includes(kw)) ||
        (v.product_name && v.product_name.toLowerCase().includes(kw))
    );
    const displayList = filtered.slice(0, 100);

    if (!displayList.length) return listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Không tìm thấy SKU nội bộ.</div>';

    listEl.innerHTML = displayList.map(p => `
        <div onclick="executeQuickMap(window.currentVarId, '${p.sku}')"
             style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; transition:all 0.2s; background:white;"
             onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='white'">
            <img src="${p.image_url || 'https://placehold.co/60'}" style="width:45px; height:45px; border-radius:6px; object-fit:cover;">
            <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.product_name)}</div>
                <div style="font-size:12px; margin-top:4px; font-family:monospace; font-weight:bold; color:#2563eb;">🏷️ ${escapeHtml(p.sku)}</div>
                <div style="font-size:11px; color:#64748b;">Tồn: ${p.stock || 0}</div>
            </div>
            <div style="color:#2563eb; font-weight:800; font-size:20px;">+</div>
        </div>`
    ).join('');
}

window.executeQuickMap = async function(varId, internalSku) {
    if (!confirm(`Map variation này → SKU nội bộ: ${internalSku}?`)) return;
    try {
        document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px; color:#2563eb; font-weight:bold;">⏳ Đang nối mã...</div>';
        const res = await fetch(API + "/api/sync-variations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: varId, internal_sku: internalSku, mapped_items: JSON.stringify([{sku: internalSku, qty: 1}]) }) });
        if (res.ok) { showToast(`✅ Đã Map!`); closeQuickMapModal(); loadVariations(); } 
        else { showToast('❌ Lỗi khi Map!', true); renderQuickMapList(); }
    } catch(e) { showToast('❌ Lỗi mạng!', true); }
}

window.injectEditModalUI = function() {
    if (document.getElementById('editVarModalWrap')) return;
    const modalHtml = `
    <div id="editVarModalWrap" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:white; width:500px; border-radius:12px; padding:24px; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e5e7eb; padding-bottom:12px; margin-bottom:16px;">
                <h3 style="margin:0; font-size:18px;">✏️ Sửa Phân Loại Sàn</h3>
                <button onclick="closeEditVarModal()" style="background:none; border:none; font-size:20px; cursor:pointer;">✕</button>
            </div>
            <input type="hidden" id="editVarId"> <input type="hidden" id="editVarOldImg">
            <div style="display:flex; flex-direction:column; gap:14px;">
                <div><label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Ảnh (Mới)</label>
                <div style="display:flex; align-items:center; gap:16px;"><img id="editVarImgPreview" style="width:64px; height:64px; border-radius:8px;"><input type="file" id="editVarImgFile" onchange="previewVarImage(event)" style="width:100%;"></div></div>
                <div><label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên phân loại</label><input type="text" id="editVarName" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1;"></div>
                <div style="display:flex; gap:12px;">
                    <div style="flex:1;"><label style="font-size:13px; font-weight:600; display:block;">Giá Gốc</label><input type="number" id="editVarPrice" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1;"></div>
                    <div style="flex:1;"><label style="font-size:13px; font-weight:600; color:#ef4444; display:block;">Giá KM</label><input type="number" id="editVarDiscountPrice" style="width:100%; padding:10px; border-radius:6px; border:1px solid #fca5a5;"></div>
                </div>
                <div><label style="font-size:13px; font-weight:600; display:block;">Tồn Kho Sàn</label><input type="number" id="editVarStock" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1;"></div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
                <button onclick="closeEditVarModal()" style="padding:10px 16px; background:#f1f5f9; border:none; border-radius:6px; cursor:pointer;">Hủy</button>
                <button onclick="saveEditVar()" id="btnSaveEditVar" style="padding:10px 16px; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer;">💾 Lưu</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.openEditVarModal = function(id) {
    const v = window.allVariations.find(item => item.id == id); if (!v) return;
    document.getElementById('editVarId').value = v.id; document.getElementById('editVarOldImg').value = v.image_url || '';
    document.getElementById('editVarImgPreview').src = v.image_url || 'https://placehold.co/60';
    document.getElementById('editVarName').value = v.variation_name || '';
    document.getElementById('editVarPrice').value = v.price || 0; document.getElementById('editVarDiscountPrice').value = v.discount_price || 0;
    document.getElementById('editVarStock').value = v.stock || 0; document.getElementById('editVarImgFile').value = ''; 
    document.getElementById('editVarModalWrap').style.display = 'flex';
}
window.closeEditVarModal = function() { document.getElementById('editVarModalWrap').style.display = 'none'; }
window.previewVarImage = function(e) { const file = e.target.files[0]; if (file) { const r = new FileReader(); r.onload = (ev) => document.getElementById('editVarImgPreview').src = ev.target.result; r.readAsDataURL(file); } }

window.saveEditVar = async function() {
    const btn = document.getElementById('btnSaveEditVar'); btn.innerHTML = '⏳...'; btn.disabled = true;
    try {
        const id = document.getElementById('editVarId').value;
        const fileInput = document.getElementById('editVarImgFile');
        let finalImageUrl = document.getElementById('editVarOldImg').value;
        if (fileInput.files.length > 0) {
            const fileName = 'img_' + Date.now() + '_' + fileInput.files[0].name.replace(/[^a-zA-Z0-9.]/g, '');
            const res = await fetch(`${API}/api/upload?file=${fileName}&token=huyvan_secret_2026`, { method: 'PUT', body: fileInput.files[0] });
            if (!res.ok) throw new Error("Lỗi upload ảnh");
            finalImageUrl = `${API}/api/file/${fileName}`;
        }
        const payload = { id, variation_name: document.getElementById('editVarName').value, price: parseFloat(document.getElementById('editVarPrice').value) || 0, discount_price: parseFloat(document.getElementById('editVarDiscountPrice').value) || 0, stock: parseInt(document.getElementById('editVarStock').value) || 0, image_url: finalImageUrl };
        const res = await fetch(`${API}/api/sync-variations/edit`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { closeEditVarModal(); showToast("✅ Cập nhật xong!"); loadVariations(); } else throw new Error("Lỗi Server");
    } catch (e) { showToast('❌ ' + e.message, true); } finally { btn.innerHTML = '💾 Lưu'; btn.disabled = false; }
}