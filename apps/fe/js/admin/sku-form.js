window.recalcComboCost = function() {
    if (!document.getElementById('s_is_combo').checked) return;
    let totalInv = 0, totalReal = 0;
    let minStockMain = Infinity, minStockSub = Infinity;
    let hasValidItems = false;

    document.querySelectorAll('.combo-item-row').forEach(row => {
        let rawInput = row.querySelector('.combo-sku-input').value.trim();
        let cSku = rawInput;
        
        // Bóc tách đa dạng các loại dấu gạch ngang nếu chọn từ Datalist
        if (cSku.includes('—')) cSku = cSku.split('—')[0].trim();
        else if (cSku.includes(' - ')) cSku = cSku.split(' - ')[0].trim();
        
        const cQty = parseInt(row.querySelector('.combo-qty-input').value) || 1;
        
        if (rawInput && window.allSkus) {
            // NÂNG CẤP DÒ MÌN V2: Tìm kiếm đa điểm để tránh lỗi tồn kho về 0
            const item = window.allSkus.find(s => {
                const searchSku = cSku.toLowerCase();
                const searchName = rawInput.toLowerCase();
                return (s.sku && s.sku.toLowerCase() === searchSku) || 
                       (s.product_name && s.product_name.toLowerCase() === searchName) ||
                       (s.product_name && s.product_name.toLowerCase() === searchSku);
            });
            
            if (!item) {
                console.warn(`[COMBO WARNING] ⚠️ Không tìm thấy thành phần: "${rawInput}". Vui lòng kiểm tra lại SKU hoặc Tên trong danh sách sản phẩm.`);
            }
            
            console.log(`[COMBO LOG] 🔍 Đang dò chuỗi: "${rawInput}" | Tách mã: "${cSku}" -> Kết quả:`, item ? `✅ Bắt trúng! (Tồn Chính: ${item.stock_main}, Tồn Phụ: ${item.stock_sub})` : '❌ KHÔNG TÌM THẤY TRONG DB');

            if (item) { 
                hasValidItems = true;
                totalInv += (parseFloat(item.cost_invoice) || 0) * cQty; 
                totalReal += (parseFloat(item.cost_real) || 0) * cQty; 
                
                // Thuật toán Nút thắt cổ chai
                const availableMain = Math.floor((parseInt(item.stock_main) || 0) / cQty);
                const availableSub = Math.floor((parseInt(item.stock_sub) || 0) / cQty);
                
                if (availableMain < minStockMain) minStockMain = availableMain;
                if (availableSub < minStockSub) minStockSub = availableSub;
            }
        }
    });
    
    console.log(`[COMBO LOG] 📊 Tổng kết tính toán -> Hợp lệ: ${hasValidItems} | Tồn Combo Chính (Min): ${minStockMain} | Tồn Combo Phụ (Min): ${minStockSub}`);
    
    document.getElementById('s_cost_inv').value = totalInv; 
    document.getElementById('s_cost_real').value = totalReal;
    
    if (hasValidItems) {
        const finalMain = minStockMain === Infinity ? 0 : minStockMain;
        const finalSub = minStockSub === Infinity ? 0 : minStockSub;
        if(document.getElementById('s_stock_main')) document.getElementById('s_stock_main').value = finalMain;
        if(document.getElementById('s_stock_sub')) document.getElementById('s_stock_sub').value = finalSub;
        if(document.getElementById('s_stock')) document.getElementById('s_stock').value = finalMain + finalSub;
    } else {
        if(document.getElementById('s_stock_main')) document.getElementById('s_stock_main').value = 0;
        if(document.getElementById('s_stock_sub')) document.getElementById('s_stock_sub').value = 0;
        if(document.getElementById('s_stock')) document.getElementById('s_stock').value = 0;
    }
}

window.toggleComboUI = function(show) {
    document.getElementById('combo-ui-wrapper').style.display = show ? 'block' : 'none';
    const invInput = document.getElementById('s_cost_inv'); 
    const realInput = document.getElementById('s_cost_real');
    const stockMainInput = document.getElementById('s_stock_main');
    const stockSubInput = document.getElementById('s_stock_sub');
    
    if (show) {
        // Khóa luôn cả ô nhập giá và ô nhập tồn kho
        invInput.readOnly = true; invInput.style.background = '#f1f5f9';
        realInput.readOnly = true; realInput.style.background = '#f1f5f9';
        if (stockMainInput) { stockMainInput.readOnly = true; stockMainInput.style.background = '#f1f5f9'; }
        if (stockSubInput) { stockSubInput.readOnly = true; stockSubInput.style.background = '#f1f5f9'; }
        
        if (document.getElementById('combo-items-list').children.length === 0) addComboItemRow();
        recalcComboCost();
    } else {
        // Mở khóa khi bỏ tick Combo
        invInput.readOnly = false; invInput.style.background = 'white';
        realInput.readOnly = false; realInput.style.background = 'white';
        if (stockMainInput) { stockMainInput.readOnly = false; stockMainInput.style.background = 'white'; }
        if (stockSubInput) { stockSubInput.readOnly = false; stockSubInput.style.background = 'white'; }
    }
}

window.addComboItemRow = function(sku = '', qty = 1) {
    const list = document.getElementById('combo-items-list');
    const row = document.createElement('div'); row.className = 'combo-item-row'; row.style.cssText = 'display:flex; gap:8px; align-items:center;';
    row.innerHTML = `<input type="text" class="combo-sku-input" list="all-sku-datalist" value="${escapeHtml(sku)}" oninput="recalcComboCost()" onchange="recalcComboCost()" placeholder="🔍 Tìm/Nhập mã..." style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:6px 10px; font-size:13px;">
        <span style="font-weight:bold; color:#64748b;">SL: </span>
        <input type="number" class="combo-qty-input" value="${qty}" min="1" oninput="recalcComboCost()" onchange="recalcComboCost()" style="width:60px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; text-align:center;">
        <button onclick="this.parentElement.remove(); recalcComboCost();" style="background:#fee2e2; color:#dc2626; border:none; border-radius:6px; padding:6px 10px; cursor:pointer; font-weight:bold;">✕</button>`;
    list.appendChild(row);
}

window.makeCombo = function(sku, isParent) {
    if (isParent) editParentSku(sku); else {
        const btn = document.querySelector(`button.btn-edit[data-sku="${sku}"]`);
        if (btn) editSkuFromBtn(btn);
        else { const p = window.allSkus.find(s => s.sku === sku); if (p) editSku(p.sku, p.product_name, p.cost_invoice, p.cost_real, p.stock, p.image_url); }
    }
    setTimeout(() => { const cb = document.getElementById('s_is_combo'); if (cb && !cb.checked) { cb.checked = true; toggleComboUI(true); showToast("📦 Đã bật tính Giá Vốn Combo!"); } }, 100);
}

window.duplicateSku = async function(originalSku) {
    const item = window.allSkus.find(s => s.sku === originalSku);
    if (!item) return showToast("❌ Không tìm thấy gốc!", true);
    const newSku = prompt(`Nhập Mã SKU MỚI cho bản sao này:`, originalSku + "_COPY");
    if (!newSku || newSku.trim() === "") return;
    try {
        showToast("⏳ Đang nhân bản...");
        const res = await fetch(API + "/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: newSku.trim(), product_name: item.product_name + " (Bản sao)", description: item.description || "", video_url: item.video_url || "", cost_invoice: item.cost_invoice || 0, cost_real: item.cost_real || 0, image_url: item.image_url || "", stock: item.stock || 0, is_combo: item.is_combo || 0, combo_items: item.combo_items || null }) });
        if (res.ok) { showToast("✅ Nhân bản thành công!"); loadSkus(); }
    } catch (e) { showToast("❌ Lỗi: " + e.message, true); }
}

window.saveSku = async function() {
  const sku = document.getElementById("s_sku").value.trim();
  const name = document.getElementById("s_name").value.trim();
  const cinv = parseFloat(document.getElementById("s_cost_inv").value) || 0;
  const creal = parseFloat(document.getElementById("s_cost_real").value) || 0;
const stock_main = parseInt(document.getElementById("s_stock_main").value) || 0;
  const stock_sub = parseInt(document.getElementById("s_stock_sub").value) || 0;
  const stock = stock_main + stock_sub;
  let finalImg = document.getElementById("s_old_img").value;
  const isCombo = document.getElementById('s_is_combo') ? document.getElementById('s_is_combo').checked : false;
  const applyAllCost = document.getElementById("s_apply_all_cost") ? document.getElementById("s_apply_all_cost").checked : false;
  if (!sku || !name) return showToast("⚠️ Nhập SKU và Tên!", true);

  const btn = document.getElementById("btnSaveSku"); btn.innerHTML = "⏳ Đang lưu..."; btn.disabled = true;
  try {
      const comboItems = [];
      if (isCombo) {
          document.querySelectorAll('.combo-item-row').forEach(row => {
              let cSku = row.querySelector('.combo-sku-input').value.trim();
              if (cSku.includes(' - ')) cSku = cSku.split(' - ')[0].trim();
              if (cSku) comboItems.push({ sku: cSku, qty: parseInt(row.querySelector('.combo-qty-input').value) || 1 });
          });
      }
      await fetch(API + "/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku, product_name: name, cost_invoice: cinv, cost_real: creal, image_url: finalImg, stock: stock, stock_main: stock_main, stock_sub: stock_sub, is_combo: isCombo ? 1 : 0, combo_items: isCombo ? JSON.stringify(comboItems) : null }) });

      if (applyAllCost && window.allSkus) {
          const currentItem = window.allSkus.find(x => x.sku === sku);
          if (currentItem) {
              const targetParentSku = currentItem.parent_sku ? currentItem.parent_sku : (currentItem.is_parent == 1 ? currentItem.sku : null);
              if (targetParentSku) {
                  const others = window.allSkus.filter(x => (x.parent_sku === targetParentSku || x.sku === targetParentSku) && x.sku !== sku);
                  for (const sibling of others) await fetch(API + "/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: sibling.sku, product_name: sibling.product_name, cost_invoice: cinv, cost_real: creal, image_url: sibling.image_url, stock: sibling.stock }) });
              }
          }
      }
      showToast("✅ Lưu thành công!"); loadSkus();
  } catch (e) { showToast("❌ Lỗi: " + e.message, true); } finally { btn.innerHTML = "💾 Lưu Sản phẩm"; btn.disabled = false; }
}

window.editSkuFromBtn = function(btn) { editSku(btn.dataset.sku, decodeURIComponent(btn.dataset.name), btn.dataset.cinv, btn.dataset.creal, btn.dataset.stock, btn.dataset.img); }

window.editSku = function(sku, name, cinv, creal, stock, img) {
  document.getElementById("s_sku").value = sku; document.getElementById("s_name").value = name;
document.getElementById("s_cost_inv").value = cinv; document.getElementById("s_cost_real").value = creal; document.getElementById("s_stock").value = stock || 0;
  const p = window.allSkus ? window.allSkus.find(s => s.sku === sku) : null;
  if(document.getElementById("s_stock_main")) document.getElementById("s_stock_main").value = (p ? p.stock_main : 0) || 0;
  if(document.getElementById("s_stock_sub")) document.getElementById("s_stock_sub").value = (p ? p.stock_sub : 0) || 0;
  const isComboCb = document.getElementById('s_is_combo');
  if (isComboCb) { isComboCb.checked = (p && p.is_combo == 1); toggleComboUI(isComboCb.checked); document.getElementById('combo-items-list').innerHTML = ''; if (isComboCb.checked && p && p.combo_items) JSON.parse(p.combo_items).forEach(i => addComboItemRow(i.sku, i.qty)); }
  if (typeof setFormMode === 'function') setFormMode('single', sku);
  window.scrollTo({ top: 0, behavior: "smooth" }); showToast("✏️ Đang sửa: " + sku);
}

window.editParentSku = function(safeSku) {
    const sku = safeSku.replace(/_/g, " ").trim(); 
    const p = window.allSkus.find(s => s.sku.toLowerCase() === sku.toLowerCase() || s.sku.replace(/[^a-zA-Z0-9]/g, "_") === safeSku);
    if (!p) return showToast("❌ Không tìm thấy dữ liệu", true);
    document.getElementById("s_sku").value = p.sku; document.getElementById("s_name").value = p.product_name || "";
    let cinv = p.cost_invoice || 0; let creal = p.cost_real || 0;
    if (cinv === 0 && creal === 0 && p.children && p.children.length > 0) { cinv = p.children[0].cost_invoice || 0; creal = p.children[0].cost_real || 0; }
document.getElementById("s_cost_inv").value = cinv; document.getElementById("s_cost_real").value = creal; document.getElementById("s_stock").value = p.stock || 0;
    if(document.getElementById("s_stock_main")) document.getElementById("s_stock_main").value = p.stock_main || 0;
    if(document.getElementById("s_stock_sub")) document.getElementById("s_stock_sub").value = p.stock_sub || 0;
    if (document.getElementById("s_apply_all_cost")) document.getElementById("s_apply_all_cost").checked = true;
    const isComboCb = document.getElementById('s_is_combo');
    if (isComboCb) { isComboCb.checked = (p.is_combo == 1); toggleComboUI(isComboCb.checked); document.getElementById('combo-items-list').innerHTML = ''; if (isComboCb.checked && p.combo_items) JSON.parse(p.combo_items).forEach(i => addComboItemRow(i.sku, i.qty)); }
    const hasChildren = p.children && p.children.length > 0;
    if (typeof setFormMode === 'function') setFormMode(hasChildren ? 'parent' : 'single', p.sku);
    window.scrollTo({ top: 0, behavior: "smooth" }); showToast("✏️ Đang sửa: " + p.sku);
}

window.deleteSku = async function(sku) { if (confirm("Xóa SKU " + sku + "?")) { await fetch(API + "/api/products/" + sku, { method: "DELETE" }); showToast("🗑️ Đã xóa"); loadSkus(); } }

// Tính năng sửa tồn kho trực tiếp tại dòng (Inline Edit)
window.inlineUpdateStock = async function(sku, value, type) {
    console.log(`[INLINE LOG] 🚀 Bắt đầu cập nhật SKU: ${sku} | Loại: ${type} | Giá trị: ${value}`);
    
    // Tìm sản phẩm trong bộ nhớ cache
    const item = window.allSkus.find(s => s.sku === sku);
    if (!item) {
        console.error(`[INLINE LOG] ❌ Không tìm thấy SKU ${sku} trong cache.`);
        return showToast("Lỗi: Không tìm thấy SKU", true);
    }

    // Chuẩn bị dữ liệu để gửi lên Server (Dò mìn dữ liệu cũ)
    let stock_main = type === 'main' ? parseInt(value) : (item.stock_main || 0);
    let stock_sub = type === 'sub' ? parseInt(value) : (item.stock_sub || 0);
    
    try {
        console.log(`[INLINE LOG] 🛠️ Đang gửi yêu cầu lên Server cho SKU ${sku}...`);
        
        const res = await fetch(API + "/api/products", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ 
                sku: item.sku, 
                product_name: item.product_name, 
                cost_invoice: item.cost_invoice || 0, 
                cost_real: item.cost_real || 0, 
                image_url: item.image_url || "", 
                stock: stock_main + stock_sub, 
                stock_main: stock_main, 
                stock_sub: stock_sub,
                is_combo: item.is_combo || 0,
                combo_items: item.combo_items || null
            }) 
        });

        if (res.ok) {
            console.log(`[INLINE LOG] ✅ Server báo thành công cho SKU ${sku}`);
            showToast(`✅ Đã cập nhật tồn ${type === 'main' ? 'chính' : 'phụ'}: ${sku}`);
            
            // Cập nhật lại cache tại chỗ để không cần load lại toàn bộ trang
            item.stock_main = stock_main;
            item.stock_sub = stock_sub;
            item.stock = stock_main + stock_sub;
            
            // Nếu là sản phẩm cha, cần tính toán lại tổng tồn hiển thị ở Card cha (tùy chọn)
            // loadSkus(); // Chỉ gọi nếu muốn đồng bộ toàn bộ giao diện ngay lập tức
        } else {
            const errText = await res.text();
            console.error(`[INLINE LOG] ❌ Lỗi Server: ${errText}`);
            showToast("❌ Lỗi Server khi lưu!", true);
        }
    } catch (e) {
        console.error(`[INLINE LOG] ❌ Lỗi kết nối: ${e.message}`);
        showToast("❌ Lỗi mạng, không thể lưu!", true);
    }
}