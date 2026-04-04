// ── SKU MANAGER ──────────────────────────────────────────────────────
// Requires: API (utils/api.js), fmt (utils/format.js), showToast (admin/main.js)

let allSkus = []
let bulkSkuData = []
let _currentSkuTab = "no-price"
let _groupMode = false

// 🌟 BIẾN PHÂN TRANG (MỚI THÊM)
let currentSkuPage = 1;
const SKU_PER_PAGE = 48; // Chỉ load 48 mã mỗi trang cho cực mượt

// ── LOAD / RENDER ─────────────────────────────────────────────────────
async function loadSkus() {
  try {
    const data = await fetch(API + "/api/products").then(r => r.json())
    allSkus = data
    window.allSkus = data // Bổ sung dòng này để đồng bộ dữ liệu sang tab Map SKU
    renderSkuTables()
  } catch (e) {
    document.getElementById("skuNoPriceTable").innerHTML =
      `<tr><td colspan="5" class="empty" style="color:#ef4444">❌ Lỗi: ${e.message}</td></tr>`
  }
}

function switchSkuTab(tab) {
  _currentSkuTab = tab
  document.querySelectorAll(".sku-tab-btn").forEach(b => {
    b.style.borderBottomColor = "transparent"
    b.style.color = "#888"
  })
  const colors = { "no-price": "#f59e0b", "partial": "#f97316", "has-price": "#16a34a", "groups": "#8b5cf6", "low-stock": "#d97706", "out-of-stock": "#dc2626" }
  const btn = document.getElementById("stab-" + tab)
  btn.style.borderBottomColor = colors[tab] || "#4f46e5"
  btn.style.color = "#333"
document.querySelectorAll("[id^='sku-tab-']").forEach(el => el.style.display = "none")
  document.getElementById("sku-tab-" + tab).style.display = ""
  
  // 🌟 Reset trang và vẽ lại bảng khi chuyển Tab
  currentSkuPage = 1;
  if (tab === "groups") {
      loadSkuGroups();
      const pag = document.getElementById("skuPaginationWrap");
      if(pag) pag.style.display = "none";
  } else {
      renderSkuTables();
      const pag = document.getElementById("skuPaginationWrap");
      if(pag) pag.style.display = "flex";
  }
}

window.renderSkuTables = function(page = null) {
  if (page !== null) currentSkuPage = page;

  const kw   = (document.getElementById("sku-search")?.value || "").toLowerCase().trim();
  const skus = allSkus; // Hiển thị 100% SKU

  const filtered = kw
    ? skus.filter(p =>
        (p.sku || "").toLowerCase().includes(kw) ||
        (p.product_name || "").toLowerCase().includes(kw)
      )
    : skus;

  const noPrice  = filtered.filter(p => !(p.cost_invoice || 0) && !(p.cost_real || 0));
  const partial  = filtered.filter(p => ((p.cost_invoice || 0) > 0) !== ((p.cost_real || 0) > 0));
  const hasPrice = filtered.filter(p => (p.cost_invoice || 0) > 0 && (p.cost_real || 0) > 0);
  // 🌟 Lọc kho
  const lowStock = filtered.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= (p.min_stock || 0));
  const outOfStock = filtered.filter(p => (p.stock || 0) <= 0);

  document.getElementById("skuCount").textContent       = skus.length;
  document.getElementById("skuNoPriceCount").textContent = noPrice.length;
  document.getElementById("skuPartialCount").textContent = partial.length;
  document.getElementById("skuHasPriceCount").textContent = hasPrice.length;
  if (document.getElementById("skuLowStockCount")) document.getElementById("skuLowStockCount").textContent = lowStock.length;
  if (document.getElementById("skuOutOfStockCount")) document.getElementById("skuOutOfStockCount").textContent = outOfStock.length;

  // 🌟 XÁC ĐỊNH DANH SÁCH ĐANG MỞ ĐỂ PHÂN TRANG
  let activeList = noPrice;
  if (_currentSkuTab === 'partial') activeList = partial;
  if (_currentSkuTab === 'has-price') activeList = hasPrice;
  if (_currentSkuTab === 'low-stock') activeList = lowStock;
  if (_currentSkuTab === 'out-of-stock') activeList = outOfStock;

  const totalItems = activeList.length;
  const totalPages = Math.ceil(totalItems / SKU_PER_PAGE) || 1;
  if (currentSkuPage > totalPages) currentSkuPage = 1;

  const startIndex = (currentSkuPage - 1) * SKU_PER_PAGE;
  const pagedNoPrice = noPrice.slice(startIndex, startIndex + SKU_PER_PAGE);
  const pagedPartial = partial.slice(startIndex, startIndex + SKU_PER_PAGE);
  const pagedHasPrice = hasPrice.slice(startIndex, startIndex + SKU_PER_PAGE);
  const pagedLowStock = lowStock.slice(startIndex, startIndex + SKU_PER_PAGE);
  const pagedOutOfStock = outOfStock.slice(startIndex, startIndex + SKU_PER_PAGE);

  const rowHtml = p => {
    const encodedName = encodeURIComponent(p.product_name || "");
    
    // Chặn đứng các trường hợp link là chữ undefined/null
    const validImg = p.image_url && p.image_url !== "undefined" && p.image_url !== "null" && p.image_url.trim() !== "";
    const imgUrl = validImg ? p.image_url.trim() : "https://placehold.co/60x60?text=No+Image";
    
    const stockQty = p.stock || 0;
    const minStock = p.min_stock !== undefined ? p.min_stock : 5; // Mặc định báo động < 5
    
    // 🌟 Tính mác Kho Hàng
    let stockBadge = '';
    if (stockQty <= 0) {
        stockBadge = `<span style="background:#fee2e2;color:#dc2626;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:bold;margin-top:6px;display:inline-block">🔴 Hết hàng</span>`;
    } else if (stockQty <= minStock) {
        stockBadge = `<span style="background:#fef3c7;color:#d97706;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:bold;margin-top:6px;display:inline-block">📉 Sắp hết (${stockQty}/${minStock})</span>`;
    } else {
        stockBadge = `<span style="background:#dcfce7;color:#16a34a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:bold;margin-top:6px;display:inline-block">📦 Tồn: ${stockQty}</span>`;
    }

    return `
      <div class="sku-card" id="skurow-${p.sku.replace(/[^a-zA-Z0-9]/g, "_")}">
        <div class="sku-card-header">
          <input type="checkbox" class="sku-chk product-checkbox" data-sku="${p.sku}" onchange="updateGroupHint(); if(typeof updateSkuBulkDeleteUI==='function') updateSkuBulkDeleteUI()" style="transform:scale(1.3); margin-top:4px;">
          <img src="${imgUrl}" class="sku-img" onerror="console.error('❌ [LỖI HIỂN THỊ ẢNH SKU: ${p.sku}] Không thể tải link:', '${imgUrl}'); this.src='https://placehold.co/60x60?text=Loi'">
          <div class="sku-info">
            <div class="sku-title" title="${escapeHtml(p.product_name || "")}">${escapeHtml(p.product_name || "—")}</div>
            <span class="sku-code">${p.sku}</span>
            <br>${stockBadge}
          </div>
        </div>
        <div class="sku-prices">
          <div class="sku-price-item">
            <span class="sku-price-label">Vốn Hóa Đơn</span>
            <span class="sku-price-val" style="color:#6d28d9">${fmt(p.cost_invoice)}</span>
          </div>
          <div class="sku-price-item" style="text-align:right">
            <span class="sku-price-label">Vốn Thực Tế</span>
            <span class="sku-price-val" style="color:#0369a1">${fmt(p.cost_real)}</span>
          </div>
        </div>
        <div class="sku-actions">
          <div>
            <button class="btn btn-edit" data-sku="${p.sku}" data-name="${encodedName}" data-cinv="${p.cost_invoice || 0}" data-creal="${p.cost_real || 0}" data-stock="${stockQty}" data-minstock="${minStock}" data-img="${imgUrl}" onclick="editSkuFromBtn(this)" style="padding:7px 12px; font-size:13px; font-weight:600; border-radius:6px; margin-right:6px;">✏️ Sửa</button>
          </div>
          <button class="btn btn-danger" onclick="deleteSku('${p.sku}')" style="padding:7px 12px; font-size:13px; border-radius:6px;">🗑️ Xóa</button>
        </div>
      </div>`
  }

  const empty = msg => `<div style="grid-column: 1 / -1; text-align:center; padding:40px; color:#888; background:white; border-radius:12px; border:1px dashed #cbd5e1;">${msg}</div>`

  document.getElementById("skuNoPriceTable").innerHTML  = pagedNoPrice.length  ? pagedNoPrice.map(rowHtml).join("")  : empty(kw ? "Không tìm thấy" : "🎉 Tất cả SKU đã có giá vốn!")
  document.getElementById("skuPartialTable").innerHTML  = pagedPartial.length  ? pagedPartial.map(rowHtml).join("")  : empty(kw ? "Không tìm thấy" : "✅ Không có SKU nào thiếu giá!")
  document.getElementById("skuHasPriceTable").innerHTML = pagedHasPrice.length ? pagedHasPrice.map(rowHtml).join("") : empty(kw ? "Không tìm thấy" : "Chưa có SKU nào đủ giá vốn")
  if (document.getElementById("skuLowStockTable")) document.getElementById("skuLowStockTable").innerHTML = pagedLowStock.length ? pagedLowStock.map(rowHtml).join("") : empty(kw ? "Không tìm thấy" : "✅ Kho an toàn, chưa có SKU nào sắp hết!")
  if (document.getElementById("skuOutOfStockTable")) document.getElementById("skuOutOfStockTable").innerHTML = pagedOutOfStock.length ? pagedOutOfStock.map(rowHtml).join("") : empty(kw ? "Không tìm thấy" : "🎉 Không có SKU nào bị hết hàng!")

  // GỌI HÀM VẼ PHÂN TRANG
  renderSkuPagination(totalItems, totalPages);
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

function renderSkuPagination(totalItems, totalPages) {
    let container = document.getElementById("skuPaginationWrap");
    if (!container) {
        container = document.createElement("div");
        container.id = "skuPaginationWrap";
        container.style.cssText = "display:flex; justify-content:center; align-items:center; gap:10px; margin-top:20px; width:100%; padding-bottom:20px;";
        // Đặt dưới cùng
        const parent = document.getElementById("skuNoPriceTable").parentElement.parentElement;
        parent.appendChild(container);
    }

    if (totalItems === 0 || totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <button onclick="renderSkuTables(${currentSkuPage - 1})" ${currentSkuPage === 1 ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; background:${currentSkuPage === 1 ? '#f8fafc' : 'white'}; color:${currentSkuPage === 1 ? '#cbd5e1' : '#333'}; cursor:${currentSkuPage === 1 ? 'not-allowed' : 'pointer'}; font-weight:bold;">‹ Trang trước</button>
        <span style="padding:8px 16px; background:#eff6ff; color:#2563eb; border-radius:8px; font-weight:bold; font-size:14px; border:1px solid #bfdbfe;">
            Trang ${currentSkuPage} / ${totalPages} (Tổng ${totalItems} SKU)
        </span>
        <button onclick="renderSkuTables(${currentSkuPage + 1})" ${currentSkuPage === totalPages ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; background:${currentSkuPage === totalPages ? '#f8fafc' : 'white'}; color:${currentSkuPage === totalPages ? '#cbd5e1' : '#333'}; cursor:${currentSkuPage === totalPages ? 'not-allowed' : 'pointer'}; font-weight:bold;">Trang sau ›</button>
    `;
}

// ── CRUD SKU ─────────────────────────────────────────────────────────
async function saveSku() {
  const sku  = document.getElementById("s_sku").value.trim()
  const name = document.getElementById("s_name").value.trim()
  const cinv = parseFloat(document.getElementById("s_cost_inv").value) || 0
  const creal = parseFloat(document.getElementById("s_cost_real").value) || 0
  const stock = parseInt(document.getElementById("s_stock").value) || 0
  const minStock = parseInt(document.getElementById("s_min_stock").value) || 0
  
  const fileInput = document.getElementById("s_img_file")
  let finalImg = document.getElementById("s_old_img").value

  if (!sku || !name) { showToast("⚠️ Nhập SKU và Tên sản phẩm!", true); return }

  const btn = document.getElementById("btnSaveSku");
  btn.innerHTML = "⏳ Đang lưu...";
  btn.disabled = true;

  try {
      // Nếu có chọn ảnh mới thì Upload trước
      if (fileInput.files.length > 0) {
          const file = fileInput.files[0];
          // 🌟 Bỏ chữ "products/" để tránh làm Server hiểu lầm đường dẫn
          const fileName = 'sku_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '');
          const uploadUrl = `${API}/api/upload?file=${fileName}&token=huyvan_secret_2026`;
          
          console.log("🚀 [UPLOAD DÒ MÌN] Đang gọi API Upload:", uploadUrl);
          const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file });
          
          if (!uploadRes.ok) {
              const errText = await uploadRes.text();
              console.error("❌ [UPLOAD LỖI] Server trả về:", errText);
              throw new Error("Lỗi upload ảnh lên server!");
          }
          finalImg = `${API}/api/file/${fileName}`;
          console.log("✅ [UPLOAD OK] Link ảnh đã tạo:", finalImg);
      }

      console.log("💾 [LƯU SKU DÒ MÌN] Payload gửi đi DB:", { sku, product_name: name, image_url: finalImg });
      await fetch(API + "/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, product_name: name, cost_invoice: cinv, cost_real: creal, image_url: finalImg, stock: stock, min_stock: minStock })
      })

      showToast("✅ Đã lưu SKU: " + sku)
      document.getElementById("s_sku").value = ""
      document.getElementById("s_name").value = ""
      document.getElementById("s_cost_inv").value = ""
      document.getElementById("s_cost_real").value = ""
      document.getElementById("s_img_file").value = ""
      document.getElementById("s_img_preview").src = "https://placehold.co/60x60?text=IMG"
      document.getElementById("s_old_img").value = ""
      
      loadSkus()
  } catch (e) {
      showToast("❌ Lỗi: " + e.message, true)
  } finally {
      btn.innerHTML = "💾 Lưu SKU";
      btn.disabled = false;
  }
}

function editSkuFromBtn(btn) {
  const sku   = btn.dataset.sku
  const name  = decodeURIComponent(btn.dataset.name)
  const cinv  = btn.dataset.cinv
  const creal = btn.dataset.creal
  const stock = btn.dataset.stock
  const minstock = btn.dataset.minstock
  const img   = btn.dataset.img
  editSku(sku, name, cinv, creal, stock, minstock, img)
}

function editSku(sku, name, cinv, creal, stock, minstock, img) {
  document.getElementById("s_sku").value      = sku
  document.getElementById("s_name").value     = name
  document.getElementById("s_cost_inv").value = cinv
  document.getElementById("s_cost_real").value = creal
  document.getElementById("s_stock").value    = stock || 0
  document.getElementById("s_min_stock").value = minstock || 5
  
// Gắn ảnh lên Preview
  const defaultImg = "https://placehold.co/60x60?text=IMG";
  const isValidImg = img && img !== "undefined" && img !== "null" && img.trim() !== "" && !img.includes('placehold');
  document.getElementById("s_old_img").value = isValidImg ? img : "";
  document.getElementById("s_img_preview").src = isValidImg ? img : defaultImg;
  document.getElementById("s_img_file").value = "";
  
  window.scrollTo({ top: 0, behavior: "smooth" })
  showToast("✏️ Đang chỉnh sửa SKU: " + sku)
}

async function deleteSku(sku) {
  if (!confirm("Xóa SKU " + sku + "?")) return
  await fetch(API + "/api/products/" + sku, { method: "DELETE" })
  showToast("🗑️ Đã xóa SKU: " + sku)
  loadSkus()
}

async function moveToCombo(sku) {
  if (!confirm(`Chuyển "${sku}" sang mục Combo?`)) return
  const p = allSkus.find(s => s.sku === sku)
  if (!p) return
  await fetch(API + "/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...p, is_combo: 1 })
  })
  showToast(`✅ Đã chuyển ${sku} sang Combo!`)
  loadSkus()
}

// ── BULK IMPORT ───────────────────────────────────────────────────────
async function importSkusFromOrders() {
  showToast("⏳ Đang tải danh sách SKU từ đơn hàng...")
  const allOrderSkus = await fetch(API + "/api/unique-skus").then(r => r.json())
  const existingSkus = new Set(allSkus.map(s => s.sku))
  bulkSkuData = allOrderSkus
    .filter(s => !existingSkus.has(s.sku))
    .map(s => ({ sku: s.sku, product_name: s.product_name || "" }))

  if (bulkSkuData.length === 0) {
    showToast("✅ Tất cả SKU đã được đồng bộ rồi!")
    return
  }

  document.getElementById("bulkCount").textContent = bulkSkuData.length
  document.getElementById("bulkCostTable").innerHTML = bulkSkuData.map((s, i) => `
    <tr>
      <td><code style="font-size:12px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${s.sku}</code></td>
      <td style="font-size:13px;color:#374151">${s.product_name || "—"}</td>
      <td>
        <div style="border:1.5px solid #e0e0e0;border-radius:7px;overflow:hidden;display:flex">
          <input type="number" id="bulk_inv_${i}" placeholder="0" step="100"
            style="border:none;outline:none;padding:7px 10px;font-size:13px;width:100%;background:transparent">
          <span style="padding:7px 10px;background:#f8f8f8;font-size:12px;color:#888;border-left:1px solid #e0e0e0">đ</span>
        </div>
      </td>
      <td>
        <div style="border:1.5px solid #e0e0e0;border-radius:7px;overflow:hidden;display:flex">
          <input type="number" id="bulk_real_${i}" placeholder="0" step="100"
            style="border:none;outline:none;padding:7px 10px;font-size:13px;width:100%;background:transparent">
          <span style="padding:7px 10px;background:#f8f8f8;font-size:12px;color:#888;border-left:1px solid #e0e0e0">đ</span>
        </div>
      </td>
    </tr>`).join("")

  document.getElementById("bulkCostPanel").style.display = "block"
  document.getElementById("bulkCostPanel").scrollIntoView({ behavior: "smooth" })
  showToast(`✅ Tìm thấy ${bulkSkuData.length} SKU mới — hãy điền giá vốn!`)
}

async function saveBulkCost() {
  if (bulkSkuData.length === 0) { showToast("⚠️ Không có SKU nào để lưu!", true); return }

  const items = bulkSkuData.map((s, i) => {
    const inv  = parseFloat(document.getElementById("bulk_inv_" + i)?.value)
    const real = parseFloat(document.getElementById("bulk_real_" + i)?.value)
    return {
      sku:          s.sku,
      product_name: s.product_name,
      cost_invoice: isNaN(inv)  ? 0 : inv,
      cost_real:    isNaN(real) ? 0 : real,
      is_combo:     0,
    }
  })

  const btnSave = document.querySelector("#bulkCostPanel .btn-primary")
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = "⏳ Đang lưu..." }

  let saved = 0, failed = 0
  for (const item of items) {
    try {
      const res = await fetch(API + "/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      })
      if (res.ok) saved++
      else failed++
    } catch (e) {
      failed++
      console.error("Lỗi lưu SKU", item.sku, e)
    }
  }

  if (failed > 0) {
    showToast(`⚠️ Lưu ${saved} SKU thành công, ${failed} SKU lỗi!`, true)
  } else {
    showToast(`✅ Đã lưu ${saved} SKU thành công!`)
  }

  document.getElementById("bulkCostPanel").style.display = "none"
  bulkSkuData = []
  loadSkus()
}

// ── NHÓM GIÁ VỐN ─────────────────────────────────────────────────────
function showGroupPanel() {
  _groupMode = true
  document.getElementById("btn-group-mode").style.display = "none"
  document.getElementById("btn-group-cancel").style.display = ""
  document.getElementById("group-select-hint").style.display = ""
  updateGroupHint()
}

function cancelGroupMode() {
  _groupMode = false
  document.getElementById("btn-group-mode").style.display = ""
  document.getElementById("btn-group-cancel").style.display = "none"
  document.getElementById("group-select-hint").style.display = "none"
  const ca = document.getElementById("group-create-area")
  if (ca) ca.style.display = "none"
  document.querySelectorAll(".sku-chk").forEach(c => c.checked = false)
}

function toggleAllCheck(type, checked) {
  // Bổ sung cấu hình cho 2 Tab Kho Hàng
  const map = { 
      "no": "skuNoPriceTable", 
      "partial": "skuPartialTable", 
      "has": "skuHasPriceTable",
      "low-stock": "skuLowStockTable",
      "out-of-stock": "skuOutOfStockTable"
  }
  const tbody = map[type] || "skuNoPriceTable"
  
  // Đánh dấu check tất cả
  document.querySelectorAll(`#${tbody} .sku-chk`).forEach(c => c.checked = checked)
  
  // Cập nhật giao diện
  updateGroupHint()
  if (typeof updateSkuBulkDeleteUI === 'function') updateSkuBulkDeleteUI() // 🌟 GỌI LỆNH BẬT NÚT XÓA TẠI ĐÂY
}

function updateGroupHint() {
  const selected = getSelectedSkus()
  const hint = document.getElementById("group-select-hint")
  if (!hint) return
  const ca = document.getElementById("group-create-area")
  const sl = document.getElementById("group-selected-list")
  if (selected.length > 0) {
    hint.textContent = `✓ Đã chọn ${selected.length} SKU`
    if (ca) ca.style.display = "block"
    if (sl) sl.textContent = "SKU: " + selected.join(", ")
  } else {
    hint.textContent = "Tích chọn các SKU cùng giá vốn"
    if (ca) ca.style.display = "none"
  }
}

function getSelectedSkus() {
  return [...document.querySelectorAll(".sku-chk:checked")].map(c => c.dataset.sku)
}

async function saveNewGroup() {
  const name = document.getElementById("group-name-input").value.trim()
  const inv  = parseFloat(document.getElementById("group-inv-input").value) || 0
  const real = parseFloat(document.getElementById("group-real-input").value) || 0
  const skus = getSelectedSkus()
  if (!name) { showToast("⚠️ Nhập tên nhóm!", true); return }
  if (!skus.length) { showToast("⚠️ Chọn ít nhất 1 SKU!", true); return }

  await fetch(API + "/api/sku-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_name: name, skus })
  })
  await fetch(API + "/api/sku-groups/update-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_name: name, cost_invoice: inv, cost_real: real })
  })

  showToast(`✅ Đã tạo nhóm "${name}" & cập nhật ${skus.length} SKU!`)
  document.getElementById("group-name-input").value = ""
  document.getElementById("group-inv-input").value  = ""
  document.getElementById("group-real-input").value = ""
  document.querySelectorAll(".sku-chk").forEach(c => c.checked = false)
  updateGroupHint()
  loadSkuGroups()
  loadSkus()
}

async function loadSkuGroups() {
  const el = document.getElementById("group-list-area")
  const [groups, products] = await Promise.all([
    fetch(API + "/api/sku-groups").then(r => r.json()),
    fetch(API + "/api/products").then(r => r.json())
  ])
  document.getElementById("skuGroupCount").textContent = groups.length

  let html = `
    <div style="margin-bottom:12px;background:#f5f3ff;border-radius:8px;padding:10px 14px;font-size:13px;color:#6d28d9">
      💡 Chuyển sang tab khác, tích chọn các SKU rồi bấm <b>🔗 Gộp nhóm giá</b> để tạo nhóm mới
    </div>`

  if (!groups.length) {
    el.innerHTML = html + `<div style="color:#aaa;text-align:center;padding:20px">Chưa có nhóm nào</div>`
    return
  }

  html += groups.map(g => {
    const skus     = (() => { try { return JSON.parse(g.skus) } catch { return [] } })()
    const firstSku = products.find(s => s.sku === skus[0])
    const inv      = firstSku?.cost_invoice || 0
    const real     = firstSku?.cost_real    || 0

    const skuTags = skus.map(sku => `
      <span style="display:inline-flex;align-items:center;gap:3px;background:#ede9fe;color:#6d28d9;
        padding:2px 8px;border-radius:12px;font-size:11px;font-family:monospace;margin:2px">
        ${sku}
        <button onclick="removeSkuFromGroup('${g.group_name}','${sku}')"
          style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:12px;padding:0;line-height:1">×</button>
      </span>`).join("")

    return `
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="font-weight:700;color:#6d28d9;font-size:14px;margin-bottom:6px">${g.group_name}</div>
            <div style="margin-bottom:8px">${skuTags}</div>
            <button onclick="addSkuToGroupUI('${g.group_name}')"
              style="padding:3px 10px;border:1px dashed #8b5cf6;background:none;color:#8b5cf6;border-radius:6px;font-size:12px;cursor:pointer">
              + Thêm SKU
            </button>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <div>
              <div style="font-size:11px;color:#888;margin-bottom:2px">Vốn HĐ</div>
              <input type="number" id="g-inv-${g.id}" value="${inv}"
                style="width:100px;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:13px">
            </div>
            <div>
              <div style="font-size:11px;color:#888;margin-bottom:2px">Vốn thực</div>
              <input type="number" id="g-real-${g.id}" value="${real}"
                style="width:100px;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:13px">
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-self:flex-end">
              <button onclick="updateGroupPriceUI('${g.group_name}',${g.id})"
                style="padding:6px 12px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">
                💾 Cập nhật giá
              </button>
              <button onclick="deleteGroup('${g.group_name}')"
                style="padding:6px 12px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">
                🗑️ Xóa nhóm
              </button>
            </div>
          </div>
        </div>
      </div>`
  }).join("")

  el.innerHTML = html
}

async function removeSkuFromGroup(groupName, sku) {
  const data = await fetch(API + "/api/sku-groups").then(r => r.json())
  const g    = data.find(x => x.group_name === groupName)
  if (!g) return
  const skus = JSON.parse(g.skus || "[]").filter(s => s !== sku)
  await fetch(API + "/api/sku-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_name: groupName, skus })
  })
  showToast(`✅ Đã xóa ${sku} khỏi nhóm`)
  loadSkuGroups()
}

function addSkuToGroupUI(groupName) {
  const kw    = prompt(`Nhập SKU muốn thêm vào nhóm "${groupName}":`)
  if (!kw) return
  const found = allSkus.find(s => s.sku.toLowerCase() === kw.trim().toLowerCase())
  if (!found) { showToast("⚠️ Không tìm thấy SKU: " + kw, true); return }
  addSkuToGroup(groupName, found.sku)
}

async function addSkuToGroup(groupName, sku) {
  const data = await fetch(API + "/api/sku-groups").then(r => r.json())
  const g    = data.find(x => x.group_name === groupName)
  if (!g) return
  const skus = [...new Set([...JSON.parse(g.skus || "[]"), sku])]
  await fetch(API + "/api/sku-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_name: groupName, skus })
  })
  showToast(`✅ Đã thêm ${sku} vào nhóm`)
  loadSkuGroups()
}

async function updateGroupPriceUI(groupName, id) {
  const inv  = parseFloat(document.getElementById(`g-inv-${id}`).value) || 0
  const real = parseFloat(document.getElementById(`g-real-${id}`).value) || 0
  const res  = await fetch(API + "/api/sku-groups/update-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_name: groupName, cost_invoice: inv, cost_real: real })
  })
  const result = await res.json()
  showToast(`✅ Đã cập nhật giá cho ${result.updated} SKU trong nhóm!`)
  loadSkus()
}

async function deleteGroup(groupName) {
  if (!confirm(`Xóa nhóm "${groupName}"? (Giá vốn SKU không đổi)`)) return
  await fetch(API + "/api/sku-groups/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_name: groupName })
  })
  showToast(`✅ Đã xóa nhóm "${groupName}"`)
  loadSkuGroups()
}


function exportSkuExcel() {
  const rows = allSkus; // 🌟 Xóa lệnh lọc để Excel tải đủ 100% SKU
  let csv = "SKU,Tên sản phẩm,Vốn hóa đơn (đ),Vốn thực tế (đ)\n"
  rows.forEach(p => {
    const safeSku  = `"${(p.sku          || "").replace(/"/g, '""')}"`
    const safeName = `"${(p.product_name || "").replace(/"/g, '""')}"`
    csv += `${safeSku},${safeName},${p.cost_invoice || 0},${p.cost_real || 0}\n`
  })
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `gia-von-sku-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  showToast("✅ Đã tải file Excel!")
}

// ── UPLOAD JSON MAP SKU ───────────────────────────────────────────────
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
      // Tìm SKU ở mốc variants
      const variants = Array.isArray(p.variants) ? p.variants : [];
      let skuToMap = null;
      let imgToMap = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : "";

      for (const v of variants) {
        if (v.sku && existingSkus.has(v.sku.toLowerCase())) {
          skuToMap = v.sku;
          break; // Tìm thấy SKU đầu tiên khớp thì lấy
        }
      }

      // Nếu không có variant sku, thử dùng sku của product
      if (!skuToMap && p.sku && existingSkus.has(p.sku.toLowerCase())) {
        skuToMap = p.sku;
      }

      if (skuToMap) {
        const currentData = existingSkus.get(skuToMap.toLowerCase());
        // Chỉ gọi API update nếu có ảnh mới
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
    loadSkus(); // Reload lại bảng
  } catch (e) {
    console.error("Lỗi đọc file JSON", e);
    showToast("❌ Lỗi khi đọc file JSON!", true);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    document.getElementById('json-file-input').value = "";
  }
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

