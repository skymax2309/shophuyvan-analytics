// ── SKU MANAGER ──────────────────────────────────────────────────────
// Requires: API (utils/api.js), fmt (utils/format.js), showToast (admin/main.js)

let allSkus = []
let bulkSkuData = []
let _currentSkuTab = "no-price"
let _groupMode = false

// ── LOAD / RENDER ─────────────────────────────────────────────────────
async function loadSkus() {
  try {
    const data = await fetch(API + "/api/products").then(r => r.json())
    allSkus = data
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
  const colors = { "no-price": "#f59e0b", "partial": "#f97316", "has-price": "#16a34a", "groups": "#8b5cf6" }
  const btn = document.getElementById("stab-" + tab)
  btn.style.borderBottomColor = colors[tab] || "#4f46e5"
  btn.style.color = "#333"
  document.querySelectorAll("[id^='sku-tab-']").forEach(el => el.style.display = "none")
  document.getElementById("sku-tab-" + tab).style.display = ""
  if (tab === "groups") loadSkuGroups()
}

function renderSkuTables() {
  const kw   = (document.getElementById("sku-search")?.value || "").toLowerCase().trim()
  const skus = allSkus.filter(p => !p.is_combo && !/combo/i.test(p.sku || ""))

  const filtered = kw
    ? skus.filter(p =>
        (p.sku || "").toLowerCase().includes(kw) ||
        (p.product_name || "").toLowerCase().includes(kw)
      )
    : skus

  const noPrice  = filtered.filter(p => !(p.cost_invoice || 0) && !(p.cost_real || 0))
  const partial  = filtered.filter(p => ((p.cost_invoice || 0) > 0) !== ((p.cost_real || 0) > 0))
  const hasPrice = filtered.filter(p => (p.cost_invoice || 0) > 0 && (p.cost_real || 0) > 0)

  document.getElementById("skuCount").textContent       = skus.length
  document.getElementById("skuNoPriceCount").textContent = noPrice.length
  document.getElementById("skuPartialCount").textContent = partial.length
  document.getElementById("skuHasPriceCount").textContent = hasPrice.length

  const rowHtml = p => {
  const encodedName = encodeURIComponent(p.product_name || "")
  const imgUrl = p.image_url || "https://placehold.co/40x40?text=No+Image"
  return `
    <tr id="skurow-${p.sku.replace(/[^a-zA-Z0-9]/g, "_")}">
      <td><input type="checkbox" class="sku-chk product-checkbox" data-sku="${p.sku}" onchange="updateGroupHint(); if(typeof updateSkuBulkDeleteUI==='function') updateSkuBulkDeleteUI()"></td>
      <td><img src="${imgUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb" onerror="this.src='https://placehold.co/40x40?text=Loi'"></td>
      <td><code style="font-size:12px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${p.sku}</code></td>
      <td style="font-size:13px">${p.product_name || "—"}</td>
      <td style="color:#6d28d9;font-weight:600">${fmt(p.cost_invoice)}</td>
      <td style="color:#0369a1;font-weight:600">${fmt(p.cost_real)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-edit"
          data-sku="${p.sku}"
          data-name="${encodedName}"
          data-cinv="${p.cost_invoice || 0}"
          data-creal="${p.cost_real || 0}"
          onclick="editSkuFromBtn(this)">✏️</button>
        <button onclick="moveToCombo('${p.sku}')"
          style="margin-left:4px;padding:4px 8px;background:#f59e0b;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px"
          title="Chuyển sang Combo">📦→</button>
        <button class="btn btn-danger" onclick="deleteSku('${p.sku}')" style="margin-left:4px">🗑️</button>
      </td>
    </tr>`
  }

  const empty = msg => `<tr><td colspan="7" class="empty">${msg}</td></tr>`

  document.getElementById("skuNoPriceTable").innerHTML  = noPrice.length  ? noPrice.map(rowHtml).join("")  : empty(kw ? "Không tìm thấy" : "🎉 Tất cả SKU đã có giá vốn!")
  document.getElementById("skuPartialTable").innerHTML  = partial.length  ? partial.map(rowHtml).join("")  : empty(kw ? "Không tìm thấy" : "✅ Không có SKU nào thiếu giá!")
  document.getElementById("skuHasPriceTable").innerHTML = hasPrice.length ? hasPrice.map(rowHtml).join("") : empty(kw ? "Không tìm thấy" : "Chưa có SKU nào đủ giá vốn")
}

// ── CRUD SKU ─────────────────────────────────────────────────────────
async function saveSku() {
  const sku  = document.getElementById("s_sku").value.trim()
  const name = document.getElementById("s_name").value.trim()
  const cinv = parseFloat(document.getElementById("s_cost_inv").value) || 0
  const creal = parseFloat(document.getElementById("s_cost_real").value) || 0

  if (!sku || !name) { showToast("⚠️ Nhập SKU và Tên sản phẩm!", true); return }

  await fetch(API + "/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku, product_name: name, cost_invoice: cinv, cost_real: creal })
  })

  showToast("✅ Đã lưu SKU: " + sku)
  document.getElementById("s_sku").value = ""
  document.getElementById("s_name").value = ""
  document.getElementById("s_cost_inv").value = ""
  document.getElementById("s_cost_real").value = ""
  loadSkus()
}

function editSkuFromBtn(btn) {
  const sku   = btn.dataset.sku
  const name  = decodeURIComponent(btn.dataset.name)
  const cinv  = btn.dataset.cinv
  const creal = btn.dataset.creal
  editSku(sku, name, cinv, creal)
}

function editSku(sku, name, cinv, creal) {
  document.getElementById("s_sku").value      = sku
  document.getElementById("s_name").value     = name
  document.getElementById("s_cost_inv").value = cinv
  document.getElementById("s_cost_real").value = creal
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
  const map = { no: "skuNoPriceTable", partial: "skuPartialTable", has: "skuHasPriceTable" }
  const tbody = map[type] || "skuNoPriceTable"
  document.querySelectorAll(`#${tbody} .sku-chk`).forEach(c => c.checked = checked)
  updateGroupHint()
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
  const rows = allSkus.filter(p => !p.is_combo && !/combo/i.test(p.sku || ""))
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