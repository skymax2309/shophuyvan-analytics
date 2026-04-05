// ── SKU MANAGER (STANDALONE VERSION - PARENT/CHILD) ────────────────────
// Requires: API (utils/api.js), fmt (utils/format.js), showToast (admin/main.js)

let allSkus = [];
let bulkSkuData = [];
let _currentSkuTab = "no-price";
let currentSkuPage = 1;
const SKU_PER_PAGE = 30; // Chứa 30 Nhóm Sản Phẩm mỗi trang

// 🌟 GỘP NHÓM CHA CON TỰ ĐỘNG (Đã bọc thép chống lỗi dữ liệu)
function buildSkuTree(flatData) {
    const tree = [];
    const parentMap = {};
    
    // Bước 1: Đăng ký tất cả sản phẩm Cha
    flatData.forEach(p => {
        if (p.is_parent == 1) { // Dùng == thay vì === để không kén dữ liệu
            p.children = [];
            parentMap[p.sku] = p;
            tree.push(p);
        }
    });
    
    // Bước 2: Gom con vào Cha, ai mồ côi thì đứng riêng
    flatData.forEach(p => {
        if (p.is_parent != 1) {
            if (p.parent_sku && parentMap[p.parent_sku]) {
                parentMap[p.parent_sku].children.push(p);
            } else {
                p.children = [];
                tree.push(p); 
            }
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
    
    // Đổ dữ liệu vào Datalist để gõ tìm kiếm nhanh lúc tạo Combo
    const datalist = document.getElementById('all-sku-datalist');
    if (datalist) {
        datalist.innerHTML = data.filter(s => !s.is_combo).map(s => `<option value="${escapeHtml(s.sku)}">${escapeHtml(s.sku)} - ${escapeHtml(s.product_name)}</option>`).join('');
    }

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
    const container = document.getElementById("skuPaginationWrap");
    if (!container) return;
    
    // Tự động bỏ tick "Chọn tất cả" khi nhảy trang
    const chkAll = document.getElementById("selectAllChk");
    if (chkAll) chkAll.checked = false;

    if (totalItems === 0 || totalPages <= 1) { container.innerHTML = ""; return; }
    container.innerHTML = `
        <button onclick="renderSkuTables(${currentSkuPage - 1})" ${currentSkuPage === 1 ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-weight:bold; background:${currentSkuPage === 1 ? '#f8fafc' : 'white'}; color:${currentSkuPage === 1 ? '#cbd5e1' : '#333'};">‹ Trang trước</button>
        <span style="padding:8px 16px; background:#eff6ff; color:#2563eb; border-radius:8px; font-weight:bold;">Trang ${currentSkuPage} / ${totalPages}</span>
        <button onclick="renderSkuTables(${currentSkuPage + 1})" ${currentSkuPage === totalPages ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-weight:bold; background:${currentSkuPage === totalPages ? '#f8fafc' : 'white'}; color:${currentSkuPage === totalPages ? '#cbd5e1' : '#333'};">Trang sau ›</button>
    `;
}

// ── LOGIC GIAO DIỆN COMBO ──────────────────────────────────────────
window.toggleComboUI = function(show) {
    document.getElementById('combo-ui-wrapper').style.display = show ? 'block' : 'none';
    if (show && document.getElementById('combo-items-list').children.length === 0) {
        addComboItemRow(); // Mặc định thêm sẵn 1 dòng
    }
}

window.addComboItemRow = function(sku = '', qty = 1) {
    const list = document.getElementById('combo-items-list');
    const row = document.createElement('div');
    row.className = 'combo-item-row';
    row.style.cssText = 'display:flex; gap:8px; align-items:center;';
    row.innerHTML = `
        <input type="text" class="combo-sku-input" list="all-sku-datalist" value="${escapeHtml(sku)}" placeholder="🔍 Tìm/Nhập mã SKU thành phần..." style="flex:1; border:1px solid #cbd5e1; border-radius:6px; padding:6px 10px; font-size:13px;">
        <span style="font-weight:bold; color:#64748b;">Số lượng: </span>
        <input type="number" class="combo-qty-input" value="${qty}" min="1" style="width:60px; border:1px solid #cbd5e1; border-radius:6px; padding:6px; font-size:13px; text-align:center;">
        <button onclick="this.parentElement.remove()" style="background:#fee2e2; color:#dc2626; border:none; border-radius:6px; padding:6px 10px; cursor:pointer; font-weight:bold;" title="Xóa dòng này">✕</button>
    `;
    list.appendChild(row);
}

// ── LOGIC NHÂN BẢN SKU ─────────────────────────────────────────────
window.duplicateSku = async function(originalSku) {
    const item = window.allSkus.find(s => s.sku === originalSku);
    if (!item) return showToast("❌ Không tìm thấy dữ liệu gốc!", true);

    const newSku = prompt(`Bạn đang Nhân bản sản phẩm [${originalSku}].\nVui lòng nhập Mã SKU MỚI cho bản sao này:`, originalSku + "_COPY");
    if (!newSku || newSku.trim() === "") return;
    
    if (window.allSkus.some(s => s.sku.toLowerCase() === newSku.toLowerCase().trim())) {
        return showToast("❌ Mã SKU này đã tồn tại! Vui lòng chọn mã khác.", true);
    }

    try {
        showToast("⏳ Đang xử lý nhân bản...");
        const payload = {
            sku: newSku.trim(),
            product_name: item.product_name + " (Bản sao)",
            description: item.description || "",
            video_url: item.video_url || "",
            cost_invoice: item.cost_invoice || 0,
            cost_real: item.cost_real || 0,
            image_url: item.image_url || "",
            stock: item.stock || 0,
            is_combo: item.is_combo || 0,
            combo_items: item.combo_items || null,
            combo_qty: item.combo_qty || 1
        };

        const res = await fetch(API + "/api/products", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast("✅ Đã nhân bản thành công mã: " + newSku);
            loadSkus();
        } else {
            showToast("❌ Lỗi lưu dữ liệu lên Server", true);
        }
    } catch (e) {
        showToast("❌ Lỗi: " + e.message, true);
    }
}

// ── CRUD SKU ─────────────────────────────────────────────────────────
async function saveSku() {
  const sku  = document.getElementById("s_sku").value.trim();
  const name = document.getElementById("s_name").value.trim();
  const desc = document.getElementById("s_desc") ? document.getElementById("s_desc").value.trim() : "";
  const video = document.getElementById("s_video_url") ? document.getElementById("s_video_url").value.trim() : "";
  const cinv = parseFloat(document.getElementById("s_cost_inv").value) || 0;
  const creal = parseFloat(document.getElementById("s_cost_real").value) || 0;
  const stock = parseInt(document.getElementById("s_stock").value) || 0;
  
  const fileInput = document.getElementById("s_img_file");
  let finalImg = document.getElementById("s_old_img").value;
  const applyAllCost = document.getElementById("s_apply_all_cost") ? document.getElementById("s_apply_all_cost").checked : false;

  if (!sku || !name) { showToast("⚠️ Nhập SKU và Tên sản phẩm!", true); return; }

  const btn = document.getElementById("btnSaveSku");
  btn.innerHTML = "⏳ Đang lưu..."; btn.disabled = true;

  try {
      if (fileInput.files.length > 0) {
          const file = fileInput.files[0];
          const fileName = 'sku_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '');
          const uploadRes = await fetch(`${API}/api/upload?file=${fileName}&token=huyvan_secret_2026`, { method: 'PUT', body: file });
          if (!uploadRes.ok) throw new Error("Lỗi upload ảnh lên server!");
          finalImg = `${API}/api/file/${fileName}`;
      }

// Bóc tách dữ liệu Combo từ giao diện
      const isCombo = document.getElementById('s_is_combo') ? document.getElementById('s_is_combo').checked : false;
      const comboItems = [];
      if (isCombo) {
          document.querySelectorAll('.combo-item-row').forEach(row => {
              let cSku = row.querySelector('.combo-sku-input').value.trim();
              if (cSku.includes(' - ')) cSku = cSku.split(' - ')[0].trim(); // Lọc lấy cái Mã đứng đầu
              const cQty = parseInt(row.querySelector('.combo-qty-input').value) || 1;
              if (cSku) comboItems.push({ sku: cSku, qty: cQty });
          });
          if (comboItems.length === 0) { throw new Error("Sản phẩm Combo cần ít nhất 1 SKU thành phần!"); }
      }

      await fetch(API + "/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            sku, product_name: name, description: desc, video_url: video, 
            cost_invoice: cinv, cost_real: creal, image_url: finalImg, stock: stock,
            is_combo: isCombo ? 1 : 0,
            combo_items: isCombo ? JSON.stringify(comboItems) : null
        })
      });

// LOGIC TỰ ĐỘNG ÁP DỤNG GIÁ VỐN CHO TẤT CẢ ANH EM CÙNG MÃ GỐC
      if (applyAllCost && window.allSkus) {
          console.log("⚡ [DÒ MÌN FRONTEND] Bắt đầu đồng bộ giá vốn. SKU Gốc đang sửa:", sku);
          const currentItem = window.allSkus.find(x => x.sku === sku);
          console.log("⚡ [DÒ MÌN FRONTEND] Thông tin Item hiện tại:", currentItem);
          if (currentItem) {
              const targetParentSku = currentItem.parent_sku ? currentItem.parent_sku : (currentItem.is_parent == 1 ? currentItem.sku : null);
              console.log("⚡ [DÒ MÌN FRONTEND] Mã Sản Phẩm Cha (Parent SKU) là:", targetParentSku);
              if (targetParentSku) {
                  const others = window.allSkus.filter(x => (x.parent_sku === targetParentSku || x.sku === targetParentSku) && x.sku !== sku);
                  console.log(`⚡ [DÒ MÌN FRONTEND] Tìm thấy ${others.length} phân loại anh em cần đồng bộ:`, others);
                  if (others.length > 0) showToast(`⏳ Đang cập nhật giá vốn cho ${others.length} phân loại khác...`);
                  for (const sibling of others) {
                      await fetch(API + "/api/products", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            sku: sibling.sku, 
                            product_name: sibling.product_name, 
                            description: sibling.description, 
                            video_url: sibling.video_url, 
                            cost_invoice: cinv, 
                            cost_real: creal,   
                            image_url: sibling.image_url, 
                            stock: sibling.stock 
                        })
                      });
                  }
              }
          }
      }

      showToast("✅ Đã lưu thành công!");
      if(document.getElementById("s_desc")) document.getElementById("s_desc").value = "";
      if(document.getElementById("s_video_url")) document.getElementById("s_video_url").value = "";
      if(document.getElementById("s_apply_all_cost")) document.getElementById("s_apply_all_cost").checked = false;
      loadSkus();
  } catch (e) {
      showToast("❌ Lỗi: " + e.message, true);
  } finally {
      btn.innerHTML = "💾 Lưu SKU"; btn.disabled = false;
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
  
  // Tái tạo lại Giao diện Combo
  const p = window.allSkus ? window.allSkus.find(s => s.sku === sku) : null;
  const isComboCb = document.getElementById('s_is_combo');
  const comboList = document.getElementById('combo-items-list');
  if (isComboCb && comboList) {
      isComboCb.checked = (p && p.is_combo == 1);
      toggleComboUI(isComboCb.checked);
      comboList.innerHTML = ''; // Xóa rác cũ
      if (isComboCb.checked && p && p.combo_items) {
          try {
              const items = JSON.parse(p.combo_items);
              items.forEach(i => addComboItemRow(i.sku, i.qty));
          } catch(e) {}
      }
  }
  
  const defaultImg = "https://placehold.co/60x60?text=IMG";
  const isValidImg = img && img !== "undefined" && img !== "null" && img.trim() !== "" && !img.includes('placehold');
  document.getElementById("s_old_img").value = isValidImg ? img : "";
  document.getElementById("s_img_preview").src = isValidImg ? img : defaultImg;
  document.getElementById("s_img_file").value = "";
  
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("✏️ Đang chỉnh sửa SKU: " + sku);
}

window.editParentSku = function(safeSku) {
    const sku = safeSku.replace(/_/g, " ").trim(); 
    const p = window.allSkus.find(s => s.sku.toLowerCase() === sku.toLowerCase() || s.sku.replace(/[^a-zA-Z0-9]/g, "_") === safeSku);
    if (!p) { showToast("❌ Không tìm thấy dữ liệu sản phẩm", true); return; }
    
    document.getElementById("s_sku").value = p.sku; 
    document.getElementById("s_name").value = p.product_name || "";
    if(document.getElementById("s_desc")) document.getElementById("s_desc").value = p.description || "";
    if(document.getElementById("s_video_url")) document.getElementById("s_video_url").value = p.video_url || "";
    document.getElementById("s_cost_inv").value = p.cost_invoice || 0; 
    document.getElementById("s_cost_real").value = p.cost_real || 0;
    document.getElementById("s_stock").value = p.stock || 0;

    // Tái tạo lại Giao diện Combo cho SP Cha
    const isComboCb = document.getElementById('s_is_combo');
    const comboList = document.getElementById('combo-items-list');
    if (isComboCb && comboList) {
        isComboCb.checked = (p.is_combo == 1);
        toggleComboUI(isComboCb.checked);
        comboList.innerHTML = ''; 
        if (isComboCb.checked && p.combo_items) {
            try {
                const items = JSON.parse(p.combo_items);
                items.forEach(i => addComboItemRow(i.sku, i.qty));
            } catch(e) {}
        }
    }
    
    const img = p.image_url;
    const isValidImg = img && img.trim() !== "" && !img.includes('placehold');
    document.getElementById("s_old_img").value = isValidImg ? img : "";
    document.getElementById("s_img_preview").src = isValidImg ? img : "https://placehold.co/60x60?text=IMG";
    
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("✏️ Đang chỉnh sửa Bài Đăng Gốc: " + p.sku);
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
  // Xuất Full toàn bộ cột
  let csv = "SKU,Tên sản phẩm,Mã SP Gốc (Parent),Vốn hóa đơn (đ),Vốn thực tế (đ),Tồn kho,Tồn kho an toàn,Là Combo (1/0),Thành phần Combo,Mô tả,Video,Hình ảnh\n";
  rows.forEach(p => {
    const safeSku  = `"${(p.sku || "").replace(/"/g, '""')}"`;
    const safeName = `"${(p.product_name || "").replace(/"/g, '""')}"`;
    const safeParent = `"${(p.parent_sku || "").replace(/"/g, '""')}"`;
    const safeDesc = `"${(p.description || "").replace(/"/g, '""')}"`;
    const safeVid = `"${(p.video_url || "").replace(/"/g, '""')}"`;
    const safeImg = `"${(p.image_url || "").replace(/"/g, '""')}"`;
    const safeComboItems = `"${(p.combo_items || "").replace(/"/g, '""')}"`;

    csv += `${safeSku},${safeName},${safeParent},${p.cost_invoice || 0},${p.cost_real || 0},${p.stock || 0},${p.min_stock || 0},${p.is_combo || 0},${safeComboItems},${safeDesc},${safeVid},${safeImg}\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `full-data-sku-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("✅ Đã xuất Full Data Excel!");
}

// TÍNH NĂNG MỚI: IMPORT BULK EXCEL (Cập nhật hàng loạt Data & Giá Vốn)
window.importBulkExcel = async function(input) {
    const file = input.files[0];
    if (!file) return;
    
    showToast("⏳ Đang đọc file Excel...");
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            
            if (rows.length === 0) throw new Error("File trống!");
            showToast(`🚀 Đang tải ${rows.length} dòng lên Server...`);
            
            // Tiền xử lý data để map đúng tên cột, hỗ trợ cả file cũ và file Full Data mới xuất
            const payload = rows.map(r => ({
                sku: r['SKU'] || r['sku'],
                product_name: r['Tên sản phẩm'] || r['product_name'],
                parent_sku: r['Mã SP Gốc (Parent)'] || r['parent_sku'] || null,
                cost_invoice: parseFloat(r['Vốn hóa đơn (đ)']) || 0,
                cost_real: parseFloat(r['Vốn thực tế (đ)']) || 0,
                stock: parseInt(r['Tồn kho']) || 0,
                min_stock: parseInt(r['Tồn kho an toàn']) || 5,
                is_combo: parseInt(r['Là Combo (1/0)']) || 0,
                combo_items: r['Thành phần Combo'] || null,
                description: r['Mô tả'] || "",
                video_url: r['Video'] || "",
                image_url: r['Hình ảnh'] || ""
            })).filter(r => r.sku);

            const res = await fetch(API + "/api/products/bulk-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: payload })
            });

            if (!res.ok) throw new Error("Lỗi lưu DB từ Server");
            
            showToast("✅ Đã Import File thành công!");
            input.value = ""; 
            loadSkus(); 
        } catch (err) {
            showToast("❌ Lỗi Import: " + err.message, true);
            input.value = "";
        }
    };
    reader.readAsArrayBuffer(file);
}

// ── LOGIC XÓA HÀNG LOẠT VÀ GỘP NHÓM ─────────────────────────────
window.updateSkuBulkDeleteUI = function() {
    const count = document.querySelectorAll('.sku-chk:checked').length;
    const btnBulk = document.getElementById('btnBulkDeleteSku');
    const countSpan = document.getElementById('selectedSkuCount');
    const btnGroup = document.getElementById('btnBulkGroupParent');
    const btnUngroup = document.getElementById('btnBulkUngroup');
    const groupCountSpan = document.getElementById('selectedGroupCount');

    if (btnBulk) btnBulk.style.display = count > 0 ? 'inline-block' : 'none';
    if (btnGroup) btnGroup.style.display = count > 0 ? 'inline-block' : 'none';
    if (btnUngroup) btnUngroup.style.display = count > 0 ? 'inline-block' : 'none';
    
    if(countSpan) countSpan.textContent = count;
    if(groupCountSpan) groupCountSpan.textContent = count;
}

window.promptGroupParent = async function() {
    const checked = document.querySelectorAll('.sku-chk:checked');
    const skus = Array.from(checked).map(cb => cb.dataset.sku);
    if (!skus.length) return;

    const parentSku = prompt(`Bạn đang gộp ${skus.length} mã phân loại.\nNhập mã Sản Phẩm GỐC (Cha) (VD: CONLAN2IN1_K177):`);
    if (!parentSku) return;

    const parentName = prompt(`Nhập tên chung cho Sản Phẩm Gốc này:`, "Sản phẩm " + parentSku);

    try {
        const res = await fetch(API + '/api/products/group-parent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_sku: parentSku.trim(), parent_name: parentName, child_skus: skus })
        });
        if (res.ok) {
            showToast(`✅ Đã gộp thành công ${skus.length} phân loại!`);
            document.querySelectorAll('.sku-chk').forEach(c => c.checked = false);
            updateSkuBulkDeleteUI();
            loadSkus();
        }
    } catch (e) {
        showToast('❌ Lỗi gộp: ' + e.message, true);
    }
}

window.bulkUngroup = async function() {
    const checked = document.querySelectorAll('.sku-chk:checked');
    const skus = Array.from(checked).map(cb => cb.dataset.sku);
    if (!skus.length) return;
    if (!confirm(`Tách ${skus.length} mã này ra đứng độc lập?`)) return;

    try {
        const res = await fetch(API + '/api/products/ungroup-parent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ child_skus: skus })
        });
        if (res.ok) {
            showToast(`✅ Đã tách thành công!`);
            document.querySelectorAll('.sku-chk').forEach(c => c.checked = false);
            updateSkuBulkDeleteUI();
            loadSkus();
        }
    } catch (e) {
        showToast('❌ Lỗi tách: ' + e.message, true);
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
    document.getElementById('quickMapList').innerHTML = '<div style="text-align:center; padding:30px; color:#888;">⏳ Đang tải toàn bộ dữ liệu mã sàn...</div>';
    
    try {
        // Gọi API lấy toàn bộ mã (Không chặn UNMAPPED nữa)
        const res = await fetch(API + "/api/sync-variations");
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
    
    // Tìm kiếm mở rộng (Bao gồm cả việc gõ tên SKU nội bộ mà mã đó đang Map)
    const filtered = unmappedVarsCache.filter(v => 
        (v.platform_sku && v.platform_sku.toLowerCase().includes(kw)) || 
        (v.product_name && v.product_name.toLowerCase().includes(kw)) ||
        (v.variation_name && v.variation_name.toLowerCase().includes(kw)) ||
        (v.internal_sku && v.internal_sku.toLowerCase().includes(kw))
    );

    // Giới hạn 100 kết quả để giao diện không bị treo nếu kho quá nhiều SP
    const displayList = filtered.slice(0, 100);

    if (!displayList.length) {
        listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Không tìm thấy mã sàn nào phù hợp.</div>';
        return;
    }

    listEl.innerHTML = displayList.map(v => {
        const statusTag = v.map_status === 'MAPPED' 
            ? `<span style="background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px; font-weight:bold;">✅ Đã map với: ${escapeHtml(v.internal_sku)}</span>`
            : `<span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-weight:bold;">⚠️ Chưa map</span>`;

        return `
        <div onclick="if(confirm('Chắc chắn muốn Map mã sàn này vào ${currentQuickMapSku}?${v.map_status === 'MAPPED' ? '\\n\\n⚠️ CẢNH BÁO: Mã này hiện ĐANG ĐƯỢC MAP với [' + v.internal_sku + ']. Nếu tiếp tục, kết nối cũ sẽ bị Ghi Đè!' : ''}')) executeQuickMap(${v.id}, '${currentQuickMapSku}')" style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; transition:all 0.2s; background:white;" onmouseover="this.style.borderColor='#3b82f6'; this.style.background='#eff6ff'; this.style.transform='translateX(4px)'" onmouseout="this.style.borderColor='#e2e8f0'; this.style.background='white'; this.style.transform='translateX(0)'">
            <img src="${v.image_url || 'https://placehold.co/60x60?text=No+Img'}" style="width:45px; height:45px; border-radius:6px; object-fit:cover; border:1px solid #e2e8f0;">
            <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(v.product_name)} ${v.variation_name ? '- ' + escapeHtml(v.variation_name) : ''}</div>
                <div style="font-size:11px; color:#64748b; margin-top:4px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:bold; color:#475569;">${(v.platform || '').toUpperCase()}</span>
                    <span>🏪 ${escapeHtml(v.shop || 'Không rõ')}</span>
                    <span style="font-family:monospace; font-weight:bold;">🏷️ ${escapeHtml(v.platform_sku || 'Không có mã')}</span>
                    ${statusTag}
                </div>
            </div>
            <div style="color:#2563eb; font-weight:800; font-size:20px; padding:0 10px;">+</div>
        </div>`
    }).join('');
    
    if (filtered.length > 100) {
        listEl.innerHTML += `<div style="text-align:center; padding:10px; color:#64748b; font-size:12px;">Và ${filtered.length - 100} kết quả khác... Hãy gõ thêm từ khóa để tìm chính xác.</div>`;
    }
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
            loadSkus(); 
        } else {
            showToast('❌ Lỗi khi Map!', true);
            renderQuickMapList(); 
        }
    } catch(e) {
        showToast('❌ Lỗi mạng: ' + e.message, true);
    }
}

window.toggleAllCheck = function(checked) {
    // Tự động tìm bảng đang mở theo Tab hiện tại
    const containerId = _currentSkuTab === 'has-price' ? 'skuHasPriceTable' : (_currentSkuTab === 'missing-map' ? 'skuMissingMapTable' : 'skuNoPriceTable');
    
    // Chọn/Bỏ chọn toàn bộ SKU có trên mặt trang
    document.querySelectorAll(`#${containerId} .sku-chk`).forEach(c => c.checked = checked);
    if(typeof updateSkuBulkDeleteUI === 'function') updateSkuBulkDeleteUI();
}

// ── LOGIC POPUP CHI TIẾT SẢN PHẨM CHUẨN SHOPEE ─────────────────────────
window.openProductDetail = function(parentSku) {
    const p = window.skuTree.find(s => s.sku === parentSku);
    if (!p) return;

    document.getElementById('pd-title').textContent = p.product_name || 'Không có tên';
    document.getElementById('pd-sku').textContent = p.sku;
    document.getElementById('pd-desc').textContent = p.description || 'Chưa có mô tả chi tiết.';
    
    const totalStock = (p.stock || 0) + (p.children ? p.children.reduce((sum, c) => sum + (c.stock || 0), 0) : 0);
    document.getElementById('pd-stock').textContent = totalStock;
    document.getElementById('pd-price').textContent = p.children && p.children.length > 0 ? "Bấm chọn phân loại để xem giá" : "Giá chưa đồng bộ"; 

    let images = [];
    try { images = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch(e) { images = []; }
    if (p.image_url && !images.includes(p.image_url)) images.unshift(p.image_url);
    
    const mediaContainer = document.getElementById('pd-main-media');
    const galleryContainer = document.getElementById('pd-gallery');
    galleryContainer.innerHTML = '';

    const setMainMedia = (url, isVideo = false) => {
        if (isVideo) {
            mediaContainer.innerHTML = `<video controls autoplay style="width:100%; height:100%; object-fit:contain;"><source src="${url}" type="video/mp4"></video>`;
        } else {
            mediaContainer.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`;
        }
    };

    if (p.video_url) {
        galleryContainer.innerHTML += `<div onclick="setMainMedia('${p.video_url}', true)" style="width:60px; height:60px; border-radius:6px; border:2px solid #e2e8f0; cursor:pointer; background:#000; position:relative; display:flex; align-items:center; justify-content:center;"><span style="color:white; font-size:24px;">▶</span></div>`;
        setMainMedia(p.video_url, true);
    } else if (images.length > 0) {
        setMainMedia(images[0]);
    } else {
        setMainMedia('https://placehold.co/400x400?text=No+Image');
    }

    images.forEach(img => {
        if(!img) return;
        galleryContainer.innerHTML += `<img onclick="setMainMedia('${img}')" src="${img}" style="width:60px; height:60px; border-radius:6px; border:2px solid transparent; cursor:pointer; object-fit:cover;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='transparent'">`;
    });

    const varContainer = document.getElementById('pd-variations');
    varContainer.innerHTML = '';
    
    if (p.children && p.children.length > 0) {
        p.children.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'var-btn';
            btn.style.cssText = "padding:8px 16px; background:white; border:1px solid #cbd5e1; border-radius:4px; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px; transition:0.2s;";
            
            if (c.image_url) btn.innerHTML = `<img src="${c.image_url}" style="width:24px; height:24px; border-radius:4px; object-fit:cover;">`;
            btn.innerHTML += `<span>${escapeHtml(c.product_name)}</span>`;

            btn.onclick = () => {
                document.querySelectorAll('.var-btn').forEach(b => { b.style.borderColor = '#cbd5e1'; b.style.color = '#333'; b.style.background = 'white'; });
                btn.style.borderColor = '#ee4d2d'; btn.style.color = '#ee4d2d'; btn.style.background = '#fff4f4';
                if(c.image_url) setMainMedia(c.image_url);
                document.getElementById('pd-stock').textContent = c.stock || 0;
                document.getElementById('pd-sku').textContent = c.sku;
                document.getElementById('pd-price').textContent = Math.round(c.price || 0).toLocaleString('vi-VN') + 'đ';
            };
            varContainer.appendChild(btn);
        });
    } else {
        varContainer.innerHTML = '<span style="color:#94a3b8; font-size:13px; font-style:italic;">Sản phẩm không có phân loại</span>';
    }

    document.getElementById('productDetailModal').style.display = 'flex';
}