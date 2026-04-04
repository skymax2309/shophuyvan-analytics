// ── SKU MANAGER (STANDALONE VERSION - PARENT/CHILD) ────────────────────
// Requires: API (utils/api.js), fmt (utils/format.js), showToast (admin/main.js)

let allSkus = [];
let bulkSkuData = [];
let _currentSkuTab = "no-price";
let currentSkuPage = 1;
const SKU_PER_PAGE = 30; // Chứa 30 Nhóm Sản Phẩm mỗi trang

// 🌟 GỘP NHÓM CHA CON TỰ ĐỘNG
function buildSkuTree(flatData) {
    const tree = [];
    const parentMap = {};
    
    // Bước 1: Lọc ra các sản phẩm gốc (Cha) hoặc sản phẩm độc lập
    flatData.forEach(p => {
        if (p.is_parent === 1) {
            p.children = [];
            parentMap[p.sku] = p;
            tree.push(p);
        } else if (!p.parent_sku) {
            p.children = [];
            tree.push(p); // Đứng độc lập như một Cha
        }
    });
    
    // Bước 2: Nhét các phân loại (Con) vào trong Cha tương ứng
    flatData.forEach(p => {
        if (p.is_parent !== 1 && p.parent_sku && parentMap[p.parent_sku]) {
            parentMap[p.parent_sku].children.push(p);
        }
    });
    return tree;
}

// 🌟 NÚT BẤM ẨN/HIỆN PHÂN LOẠI
window.toggleChildRow = function(safeSku) {
    const el = document.getElementById('vars-' + safeSku);
    const icon = document.getElementById('icon-' + safeSku);
    if (el.style.display === 'none') {
        el.style.display = 'block'; icon.style.transform = 'rotate(180deg)';
    } else {
        el.style.display = 'none'; icon.style.transform = 'rotate(0deg)';
    }
}

// Hàm chống lỗi HTML injection
function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

async function loadSkus() {
  try {
    const shops = await fetch(API + "/api/shops").then(r => r.json()).catch(() => []);
    window.totalShopCount = shops.length || 0;

    const data = await fetch(API + "/api/products").then(r => r.json());
    allSkus = data;
    window.allSkus = data;
    window.skuTree = buildSkuTree(data); // Tạo cây Cha - Con
    renderSkuTables();
  } catch (e) {
    const table = document.getElementById("skuNoPriceTable");
    if(table) table.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">❌ Lỗi: ${e.message}</div>`;
  }
}

function switchSkuTab(tab) {
  _currentSkuTab = tab;
  document.querySelectorAll(".sku-tab-btn").forEach(b => {
    b.style.borderBottomColor = "transparent";
    b.style.color = "#888";
  });
  const colors = { "no-price": "#f59e0b", "has-price": "#16a34a", "missing-map": "#ea580c" };
  const btn = document.getElementById("stab-" + tab);
  if(btn) {
    btn.style.borderBottomColor = colors[tab] || "#4f46e5";
    btn.style.color = "#333";
  }
  
  document.querySelectorAll(".sku-list-container").forEach(el => el.parentElement.style.display = "none");
  const targetTab = document.getElementById("sku-tab-" + tab);
  if (targetTab) targetTab.style.display = "block";
  
  currentSkuPage = 1;
  renderSkuTables();
}

// 🌟 HÀM RENDER HTML (LẤY TỪ THẺ TEMPLATE)
function generateRowHtml(p) {
    const tplParent = document.getElementById('tpl-parent-card').innerHTML;
    const tplChild = document.getElementById('tpl-child-row').innerHTML;
    
    const safeSku = p.sku.replace(/[^a-zA-Z0-9]/g, "_");
    const validImg = p.image_url && p.image_url !== "undefined" && p.image_url !== "null" && p.image_url.trim() !== "";
    const imgUrl = validImg ? p.image_url.trim() : "https://placehold.co/60x60?text=No+Image";

    // Tính Badge Mapped cho Sản phẩm Cha
    const genBadge = (skuStr, mappedShops) => {
        const btnQuickMap = `<button onclick="openQuickMapModal('${skuStr}')" style="background:#eff6ff;color:#2563eb;border:1px dashed #93c5fd;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;margin-top:4px;">+ Map Shop</button>`;
        if (mappedShops) {
            const shops = mappedShops.split(',');
            return `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">` + 
                shops.map(s => `<span style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;padding:2px 6px;border-radius:4px;font-size:10px;">🏷️ ${s.trim()}</span>`).join('') + btnQuickMap + `</div>`;
        }
        return `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;"><span style="background:#fff7ed;color:#ea580c;border:1px solid #fdba74;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;">⚠️ Chưa Map Shop Nào</span>` + btnQuickMap + `</div>`;
    };

    const totalStock = (p.stock || 0) + (p.children ? p.children.reduce((sum, c) => sum + (c.stock || 0), 0) : 0);

    let html = tplParent;
    html = html.replace(/{{safe_sku}}/g, safeSku);
    html = html.replace(/{{sku}}/g, p.sku);
    html = html.replace(/{{name}}/g, escapeHtml(p.product_name || "Sản phẩm không tên"));
    html = html.replace(/{{image}}/g, imgUrl);
    html = html.replace(/{{mapped_badge}}/g, genBadge(p.sku, p.mapped_shops));
    html = html.replace(/{{total_stock}}/g, totalStock);

    if (p.children && p.children.length > 0) {
        const childrenHtml = p.children.map(c => {
            let ch = tplChild;
            ch = ch.replace(/{{c_sku}}/g, c.sku);
            ch = ch.replace(/{{c_name}}/g, escapeHtml(c.product_name || "Phân loại"));
            ch = ch.replace(/{{c_cost}}/g, Math.round(c.cost_real || 0).toLocaleString('vi-VN') + 'đ');
            ch = ch.replace(/{{c_stock}}/g, c.stock || 0);
            ch = ch.replace(/{{c_enc_name}}/g, encodeURIComponent(c.product_name || ""));
            ch = ch.replace(/{{c_raw_inv}}/g, c.cost_invoice || 0);
            ch = ch.replace(/{{c_raw_real}}/g, c.cost_real || 0);
            ch = ch.replace(/{{c_raw_stock}}/g, c.stock || 0);
            ch = ch.replace(/{{c_img}}/g, c.image_url || "");
            ch = ch.replace(/{{c_mapped_badge}}/g, genBadge(c.sku, c.mapped_shops));
            return ch;
        }).join('');
        html = html.replace(/{{children_list}}/g, childrenHtml);
        html = html.replace(/{{show_toggle}}/g, 'block');
    } else {
        html = html.replace(/{{children_list}}/g, '<div style="padding:12px 16px; color:#94a3b8; font-size:12px; font-style:italic;">Sản phẩm không có phân loại con (Đứng độc lập)</div>');
        html = html.replace(/{{show_toggle}}/g, 'none');
    }
    return html;
}

window.renderSkuTables = function(page = null) {
  if (page !== null) currentSkuPage = page;
  const kw = (document.getElementById("sku-search")?.value || "").toLowerCase().trim();
  let tree = window.skuTree || [];

  // Tìm kiếm Cây (Tìm trúng Cha hoặc trúng Phân Loại Con đều hiện)
  let filtered = kw ? tree.filter(p => {
      const matchParent = p.sku.toLowerCase().includes(kw) || (p.product_name && p.product_name.toLowerCase().includes(kw));
      const matchChild = p.children && p.children.some(c => c.sku.toLowerCase().includes(kw) || (c.product_name && c.product_name.toLowerCase().includes(kw)));
      return matchParent || matchChild;
  }) : tree;

  const noPrice = filtered.filter(p => (!(p.cost_invoice || 0) && !(p.cost_real || 0)) || p.children.some(c => !(c.cost_invoice || 0) && !(c.cost_real || 0)));
  const hasPrice = filtered.filter(p => ((p.cost_invoice || 0) > 0 && (p.cost_real || 0) > 0) || p.children.some(c => (c.cost_invoice || 0) > 0 && (c.cost_real || 0) > 0));
  const missingMap = filtered.filter(p => {
      const noMapParent = !p.mapped_shops || p.mapped_shops.split(',').length < window.totalShopCount;
      const noMapChild = p.children.some(c => !c.mapped_shops || c.mapped_shops.split(',').length < window.totalShopCount);
      return noMapParent || noMapChild;
  });

  document.getElementById("skuCount").textContent = tree.length;
  if(document.getElementById("skuNoPriceCount")) document.getElementById("skuNoPriceCount").textContent = noPrice.length;
  if(document.getElementById("skuHasPriceCount")) document.getElementById("skuHasPriceCount").textContent = hasPrice.length;
  if(document.getElementById("skuMissingMapCount")) document.getElementById("skuMissingMapCount").textContent = missingMap.length;

  let activeList = noPrice;
  if (_currentSkuTab === 'has-price') activeList = hasPrice;
  if (_currentSkuTab === 'missing-map') activeList = missingMap;

  const totalItems = activeList.length;
  const totalPages = Math.ceil(totalItems / SKU_PER_PAGE) || 1;
  if (currentSkuPage > totalPages) currentSkuPage = 1;

  const startIndex = (currentSkuPage - 1) * SKU_PER_PAGE;
  const pagedData = activeList.slice(startIndex, startIndex + SKU_PER_PAGE);

  const empty = msg => `<div style="text-align:center; padding:40px; color:#888; background:white; border-radius:12px; border:1px dashed #cbd5e1;">${msg}</div>`;
  const containerId = _currentSkuTab === 'has-price' ? 'skuHasPriceTable' : (_currentSkuTab === 'missing-map' ? 'skuMissingMapTable' : 'skuNoPriceTable');
  const container = document.getElementById(containerId);
  
  if(container) {
      container.innerHTML = pagedData.length ? pagedData.map(generateRowHtml).join("") : empty("🎉 Không có sản phẩm nào ở mục này!");
  }
  renderSkuPagination(totalItems, totalPages);
}

function renderSkuPagination(totalItems, totalPages) {
    let container = document.getElementById("skuPaginationWrap");
    if (!container) {
        container = document.createElement("div");
        container.id = "skuPaginationWrap";
        container.style.cssText = "display:flex; justify-content:center; align-items:center; gap:10px; margin-top:20px; width:100%; padding-bottom:20px;";
        const activeTabEl = document.getElementById("sku-tab-" + _currentSkuTab);
        if(activeTabEl) activeTabEl.appendChild(container);
    }
    if (totalItems === 0 || totalPages <= 1) { container.innerHTML = ""; return; }
    container.innerHTML = `
        <button onclick="renderSkuTables(${currentSkuPage - 1})" ${currentSkuPage === 1 ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-weight:bold; background:${currentSkuPage === 1 ? '#f8fafc' : 'white'}; color:${currentSkuPage === 1 ? '#cbd5e1' : '#333'};">‹ Trang trước</button>
        <span style="padding:8px 16px; background:#eff6ff; color:#2563eb; border-radius:8px; font-weight:bold;">Trang ${currentSkuPage} / ${totalPages}</span>
        <button onclick="renderSkuTables(${currentSkuPage + 1})" ${currentSkuPage === totalPages ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-weight:bold; background:${currentSkuPage === totalPages ? '#f8fafc' : 'white'}; color:${currentSkuPage === totalPages ? '#cbd5e1' : '#333'};">Trang sau ›</button>
    `;
}

// ── CRUD SKU ─────────────────────────────────────────────────────────
async function saveSku() {
  const sku  = document.getElementById("s_sku").value.trim();
  const name = document.getElementById("s_name").value.trim();
  const cinv = parseFloat(document.getElementById("s_cost_inv").value) || 0;
  const creal = parseFloat(document.getElementById("s_cost_real").value) || 0;
  const stock = parseInt(document.getElementById("s_stock").value) || 0;
  const minStock = parseInt(document.getElementById("s_min_stock").value) || 0;
  
  const fileInput = document.getElementById("s_img_file");
  let finalImg = document.getElementById("s_old_img").value;

  if (!sku || !name) { showToast("⚠️ Nhập SKU và Tên sản phẩm!", true); return; }

  const btn = document.getElementById("btnSaveSku");
  btn.innerHTML = "⏳ Đang lưu...";
  btn.disabled = true;

  try {
      if (fileInput.files.length > 0) {
          const file = fileInput.files[0];
          const fileName = 'sku_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '');
          const uploadUrl = `${API}/api/upload?file=${fileName}&token=huyvan_secret_2026`;
          
          const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file });
          if (!uploadRes.ok) throw new Error("Lỗi upload ảnh lên server!");
          finalImg = `${API}/api/file/${fileName}`;
      }

      await fetch(API + "/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, product_name: name, cost_invoice: cinv, cost_real: creal, image_url: finalImg, stock: stock, min_stock: minStock })
      });

      showToast("✅ Đã lưu SKU: " + sku);
      document.getElementById("s_sku").value = "";
      document.getElementById("s_name").value = "";
      document.getElementById("s_cost_inv").value = "";
      document.getElementById("s_cost_real").value = "";
      document.getElementById("s_img_file").value = "";
      document.getElementById("s_img_preview").src = "https://placehold.co/60x60?text=IMG";
      document.getElementById("s_old_img").value = "";
      
      loadSkus();
  } catch (e) {
      showToast("❌ Lỗi: " + e.message, true);
  } finally {
      btn.innerHTML = "💾 Lưu SKU";
      btn.disabled = false;
  }
}

window.editSkuFromBtn = function(btn) {
  const sku   = btn.dataset.sku;
  const name  = decodeURIComponent(btn.dataset.name);
  const cinv  = btn.dataset.cinv;
  const creal = btn.dataset.creal;
  const stock = btn.dataset.stock;
  const img   = btn.dataset.img;
  editSku(sku, name, cinv, creal, stock, img);
}

function editSku(sku, name, cinv, creal, stock, img) {
  document.getElementById("s_sku").value = sku;
  document.getElementById("s_name").value = name;
  document.getElementById("s_cost_inv").value = cinv;
  document.getElementById("s_cost_real").value = creal;
  document.getElementById("s_stock").value = stock || 0;
  
  const defaultImg = "https://placehold.co/60x60?text=IMG";
  const isValidImg = img && img !== "undefined" && img !== "null" && img.trim() !== "" && !img.includes('placehold');
  document.getElementById("s_old_img").value = isValidImg ? img : "";
  document.getElementById("s_img_preview").src = isValidImg ? img : defaultImg;
  document.getElementById("s_img_file").value = "";
  
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("✏️ Đang chỉnh sửa SKU: " + sku);
}

async function deleteSku(sku) {
  if (!confirm("Xóa SKU " + sku + "?")) return;
  await fetch(API + "/api/products/" + sku, { method: "DELETE" });
  showToast("🗑️ Đã xóa SKU: " + sku);
  loadSkus();
}

// ── BULK IMPORT / EXPORT ───────────────────────────────────────────────
async function importSkusFromOrders() {
  showToast("⏳ Đang tải danh sách SKU từ đơn hàng...");
  try {
      const allOrderSkus = await fetch(API + "/api/unique-skus").then(r => r.json());
      const existingSkus = new Set(allSkus.map(s => s.sku));
      
      let importedCount = 0;
      for(const s of allOrderSkus) {
          if(!existingSkus.has(s.sku)) {
             await fetch(API + "/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sku: s.sku, product_name: s.product_name || s.sku, cost_invoice: 0, cost_real: 0, stock: 0 })
             });
             importedCount++;
          }
      }

      if (importedCount === 0) {
        showToast("✅ Tất cả SKU đã được đồng bộ rồi!");
      } else {
        showToast(`✅ Đã đồng bộ thành công ${importedCount} SKU mới!`);
        loadSkus();
      }
  } catch(e) {
      showToast("❌ Lỗi đồng bộ: " + e.message, true);
  }
}

function exportSkuExcel() {
  const rows = allSkus;
  let csv = "SKU,Tên sản phẩm,Vốn hóa đơn (đ),Vốn thực tế (đ)\n";
  rows.forEach(p => {
    const safeSku  = `"${(p.sku          || "").replace(/"/g, '""')}"`;
    const safeName = `"${(p.product_name || "").replace(/"/g, '""')}"`;
    csv += `${safeSku},${safeName},${p.cost_invoice || 0},${p.cost_real || 0}\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `gia-von-sku-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("✅ Đã tải file Excel!");
}

// ── LOGIC XÓA HÀNG LOẠT VÀ XÓA SẠCH KHO ─────────────────────────────
window.updateSkuBulkDeleteUI = function() {
    const count = document.querySelectorAll('.sku-chk:checked').length;
    const btnBulk = document.getElementById('btnBulkDeleteSku');
    const countSpan = document.getElementById('selectedSkuCount');
    if (btnBulk && countSpan) {
        btnBulk.style.display = count > 0 ? 'inline-block' : 'none';
        countSpan.textContent = count;
    }
}

window.bulkDeleteSkus = async function() {
    const checked = document.querySelectorAll('.sku-chk:checked');
    const skus = Array.from(checked).map(cb => cb.dataset.sku);
    
    if (!skus.length) return;
    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN ${skus.length} SKU này khỏi kho?`)) return;
    
    try {
        const res = await fetch(API + '/api/products/bulk', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus })
        });
        if (res.ok) {
            showToast(`✅ Đã xóa thành công ${skus.length} SKU!`);
            loadSkus();
        }
    } catch (e) {
        showToast('❌ Lỗi xóa: ' + e.message, true);
    }
}

// ── LOGIC MAP NHANH (QUICK MAP) ─────────────────────────────────────────────
let unmappedVarsCache = [];
let currentQuickMapSku = "";

window.openQuickMapModal = async function(sku) {
    currentQuickMapSku = sku;
    document.getElementById('quickMapTargetSku').textContent = sku;
    document.getElementById('quickMapSearch').value = '';
    document.getElementById('quickMapModal').style.display = 'flex';
    document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px; color:#888;">⏳ Đang tải mã mồ côi từ máy chủ...</div>';
    
    try {
        const res = await fetch(API + "/api/sync-variations?map_status=UNMAPPED");
        unmappedVarsCache = await res.json();
        renderQuickMapList();
    } catch(e) {
        document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px; color:#ef4444;">❌ Lỗi tải dữ liệu. Hãy kiểm tra kết nối.</div>';
    }
}

window.closeQuickMapModal = function() {
    document.getElementById('quickMapModal').style.display = 'none';
}

window.renderQuickMapList = function() {
    const kw = document.getElementById('quickMapSearch').value.toLowerCase().trim();
    const listEl = document.getElementById('quickMapList');
    
    const filtered = unmappedVarsCache.filter(v => 
        (v.platform_sku && v.platform_sku.toLowerCase().includes(kw)) || 
        (v.product_name && v.product_name.toLowerCase().includes(kw)) ||
        (v.variation_name && v.variation_name.toLowerCase().includes(kw))
    );

    if (!filtered.length) {
        listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Không tìm thấy mã sàn nào phù hợp.</div>';
        return;
    }

    listEl.innerHTML = filtered.map(v => `
        <div onclick="executeQuickMap(${v.id}, '${currentQuickMapSku}')" style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; transition:all 0.2s; background:white;" onmouseover="this.style.borderColor='#3b82f6'; this.style.background='#eff6ff'; this.style.transform='translateX(4px)'" onmouseout="this.style.borderColor='#e2e8f0'; this.style.background='white'; this.style.transform='translateX(0)'">
            <img src="${v.image_url || 'https://placehold.co/60x60?text=No+Img'}" style="width:45px; height:45px; border-radius:6px; object-fit:cover; border:1px solid #e2e8f0;">
            <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(v.product_name)} ${v.variation_name ? '- ' + escapeHtml(v.variation_name) : ''}</div>
                <div style="font-size:11px; color:#64748b; margin-top:4px; display:flex; gap:6px; align-items:center;">
                    <span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:bold; color:#475569;">${(v.platform || '').toUpperCase()}</span>
                    <span>🏪 ${escapeHtml(v.shop || 'Không rõ')}</span>
                    <span style="font-family:monospace; font-weight:bold;">🏷️ ${escapeHtml(v.platform_sku || 'Không có mã')}</span>
                </div>
            </div>
            <div style="color:#2563eb; font-weight:800; font-size:20px; padding:0 10px;">+</div>
        </div>
    `).join('');
}

window.executeQuickMap = async function(varId, internalSku) {
    try {
        document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px; color:#2563eb; font-weight:bold;">⏳ Đang nối mã...</div>';
        
        const res = await fetch(API + "/api/sync-variations/edit", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: varId,
                internal_sku: internalSku,
                mapped_items: JSON.stringify([{sku: internalSku, qty: 1}])
            })
        });
        
        if (res.ok) {
            showToast(`✅ Đã Map mã sàn vào SKU: ${internalSku}`);
            closeQuickMapModal();
            loadSkus(); // Reload lại bảng SKU ngoài để hiện luôn Tag shop mới
        } else {
            showToast('❌ Lỗi khi Map!', true);
            renderQuickMapList(); 
        }
    } catch(e) {
        showToast('❌ Lỗi mạng: ' + e.message, true);
    }
}

window.toggleAllCheck = function(type, checked) {
  const map = { 
      "no": "skuNoPriceTable", 
      "has": "skuHasPriceTable",
      "missing-map": "skuMissingMapTable"
  }
  const tbody = map[type] || "skuNoPriceTable";
  document.querySelectorAll(`#${tbody} .sku-chk`).forEach(c => c.checked = checked);
  updateSkuBulkDeleteUI();
}

// Hàm bổ trợ để JSON Upload
async function uploadProductJson(file) {
  if (!file) return;
  const btn = document.querySelector('button[onclick="document.getElementById(\'json-file-input\').click()"]');
  const originalText = btn.textContent;
  btn.textContent = "⏳ Đang xử lý...";
  btn.disabled = true;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const products = Array.isArray(data) ? data : (data.items || []);
    
    if (!products.length) {
      showToast("⚠️ File JSON trống hoặc không đúng định dạng!", true);
      return;
    }

    let updatedCount = 0;
    const existingSkus = new Map(allSkus.map(s => [s.sku.toLowerCase(), s]));

    for (const p of products) {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      let skuToMap = null;
      let imgToMap = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : "";

      for (const v of variants) {
        if (v.sku && existingSkus.has(v.sku.toLowerCase())) {
          skuToMap = v.sku;
          break;
        }
      }

      if (!skuToMap && p.sku && existingSkus.has(p.sku.toLowerCase())) {
        skuToMap = p.sku;
      }

      if (skuToMap) {
        const currentData = existingSkus.get(skuToMap.toLowerCase());
        if (imgToMap && currentData.image_url !== imgToMap) {
          await fetch(API + "/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              sku: currentData.sku, 
              product_name: currentData.product_name,
              cost_invoice: currentData.cost_invoice,
              cost_real: currentData.cost_real,
              image_url: imgToMap 
            })
          });
          updatedCount++;
        }
      }
    }

    showToast(`✅ Đã cập nhật ảnh cho ${updatedCount} SKU!`);
    loadSkus();
  } catch (e) {
    console.error("Lỗi đọc file JSON", e);
    showToast("❌ Lỗi khi đọc file JSON!", true);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    document.getElementById('json-file-input').value = "";
  }
}