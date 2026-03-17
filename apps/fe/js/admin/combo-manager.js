// ── COMBO MANAGER ────────────────────────────────────────────────────
// Requires: API, fmt, showToast, allSkus (sku-manager.js)

let comboRows = []

function addComboRow() {
  comboRows.push({ id: Date.now() })
  renderComboBuilder()
}

function removeComboRow(id) {
  comboRows = comboRows.filter(r => r.id !== id)
  renderComboBuilder()
}

function renderComboBuilder() {
  const builder = document.getElementById("comboItemsBuilder")
  if (comboRows.length === 0) {
    builder.innerHTML = `<div style="color:#aaa;font-size:13px">Chưa có thành phần. Nhấn "+ Thêm SKU thành phần"</div>`
    return
  }
  const skuList = allSkus.filter(s => !s.is_combo && !/combo/i.test(s.sku || ""))
  builder.innerHTML = comboRows.map(r => `
    <div class="combo-row" id="cr-${r.id}" style="align-items:flex-start;flex-direction:column;gap:4px">
      <div style="display:flex;gap:8px;width:100%;align-items:center">
        <div style="flex:1;position:relative">
          <input type="text" id="cr-search-${r.id}"
            placeholder="🔍 Gõ SKU hoặc tên để tìm..."
            oninput="filterComboSku(${r.id}, this.value)"
            autocomplete="off"
            style="width:100%;border:1px solid #c7d2fe;border-radius:6px;padding:6px 10px;font-size:13px;outline:none;box-sizing:border-box">
          <select id="cr-sku-${r.id}"
            style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:13px;margin-top:4px">
            <option value="">-- Chọn SKU --</option>
            ${skuList.map(s =>
              `<option value="${s.sku}">${s.sku} — ${s.product_name || ""}</option>`
            ).join("")}
          </select>
        </div>
        <input type="number" id="cr-qty-${r.id}" placeholder="SL" min="1" value="1"
          style="width:70px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:13px">
        <button class="btn btn-danger" onclick="removeComboRow(${r.id})">✕</button>
      </div>
    </div>`).join("")
}

function filterComboSku(rowId, keyword) {
  const sel     = document.getElementById(`cr-sku-${rowId}`)
  const cur     = sel.value
  const kw      = keyword.toLowerCase().trim()
  const skuList = allSkus.filter(s => !s.is_combo && !/combo/i.test(s.sku || ""))
  const filtered = kw
    ? skuList.filter(s =>
        (s.sku || "").toLowerCase().includes(kw) ||
        (s.product_name || "").toLowerCase().includes(kw)
      )
    : skuList
  sel.innerHTML = `<option value="">-- Chọn SKU --</option>` +
    filtered.map(s =>
      `<option value="${s.sku}" ${s.sku === cur ? "selected" : ""}>${s.sku} — ${s.product_name || ""}</option>`
    ).join("")
}

async function saveCombo() {
  const sku  = document.getElementById("c_sku").value.trim()
  const name = document.getElementById("c_name").value.trim()
  const qty  = parseInt(document.getElementById("c_qty").value) || 1

  if (!sku || !name) { showToast("⚠️ Nhập mã và tên combo!", true); return }
  if (comboRows.length === 0) { showToast("⚠️ Thêm ít nhất 1 SKU thành phần!", true); return }

  const items = comboRows.map(r => ({
    sku: document.getElementById("cr-sku-" + r.id)?.value || "",
    qty: parseInt(document.getElementById("cr-qty-" + r.id)?.value) || 1,
  })).filter(i => i.sku)

  if (items.length === 0) { showToast("⚠️ Chọn SKU cho các thành phần!", true); return }

  let cost_invoice = 0, cost_real = 0
  items.forEach(i => {
    const p = allSkus.find(s => s.sku === i.sku)
    if (p) {
      cost_invoice += (p.cost_invoice || 0) * i.qty
      cost_real    += (p.cost_real    || 0) * i.qty
    }
  })

  await fetch(API + "/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sku, product_name: name,
      cost_invoice, cost_real,
      is_combo: 1,
      combo_items: JSON.stringify(items),
      combo_qty: qty,
    })
  })

  showToast("✅ Đã lưu Combo: " + sku)
  document.getElementById("c_sku").value  = ""
  document.getElementById("c_name").value = ""
  comboRows = []
  renderComboBuilder()
  loadCombos()
}

async function loadCombos() {
  const data = await fetch(API + "/api/products").then(r => r.json())
  allSkus = data

  // Tự động đánh dấu is_combo=1 nếu SKU tên có "combo" chưa được đánh dấu
  const needMark = data.filter(p => !p.is_combo && /combo/i.test(p.sku || ""))
  if (needMark.length) {
    await Promise.all(needMark.map(p =>
      fetch(API + "/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, is_combo: 1 })
      })
    ))
    return loadCombos()
  }

  const combos = data.filter(p => p.is_combo)
  document.getElementById("comboCount").textContent = combos.length

  // Recalc vốn combo từ giá SKU gốc
  const recalcNeeded = []
  combos.forEach(p => {
    let items = []
    try { items = JSON.parse(p.combo_items || "[]") } catch (e) {}
    let ci = 0, cr = 0
    items.forEach(i => {
      const s = data.find(x => x.sku === i.sku)
      if (s) { ci += (s.cost_invoice || 0) * i.qty; cr += (s.cost_real || 0) * i.qty }
    })
    if (ci !== (p.cost_invoice || 0) || cr !== (p.cost_real || 0)) {
      p.cost_invoice = ci; p.cost_real = cr
      recalcNeeded.push({ sku: p.sku, cost_invoice: ci, cost_real: cr,
        product_name: p.product_name, is_combo: 1,
        combo_items: p.combo_items, combo_qty: p.combo_qty })
    }
  })

  if (recalcNeeded.length) {
    await Promise.all(recalcNeeded.map(c =>
      fetch(API + "/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c)
      })
    ))
  }

  document.getElementById("comboTable").innerHTML = combos.length === 0
    ? `<tr><td colspan="7" class="empty">Chưa có combo nào</td></tr>`
    : combos.map(p => {
        let items = []
        try { items = JSON.parse(p.combo_items || "[]") } catch (e) {}
        const itemsHtml = items.map(i => {
          const s    = data.find(x => x.sku === i.sku)
          const name = s?.product_name || i.sku
          return `<div style="font-size:11px;color:#555">${i.sku} ×${i.qty} <span style="color:#888">— ${name}</span></div>`
        }).join("")
        const changed = recalcNeeded.find(r => r.sku === p.sku)
        return `<tr>
          <td><code style="font-size:12px;background:#ede9fe;padding:2px 6px;border-radius:4px">${p.sku}</code></td>
          <td>${p.product_name}</td>
          <td style="text-align:center">${p.combo_qty || 1}</td>
          <td><div class="combo-items">${itemsHtml || "—"}</div></td>
          <td style="color:#6d28d9;font-weight:600">
            ${fmt(p.cost_invoice)}
            ${changed ? `<span style="font-size:10px;color:#f59e0b;display:block">🔄 đã cập nhật</span>` : ""}
          </td>
          <td style="color:#0369a1;font-weight:600">${fmt(p.cost_real)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-edit" onclick="editCombo('${p.sku}')">✏️</button>
            <button class="btn btn-danger" onclick="deleteSku('${p.sku}')" style="margin-left:4px">🗑️</button>
          </td>
        </tr>`
      }).join("")
}

function editCombo(sku) {
  const p = allSkus.find(s => s.sku === sku)
  if (!p) return
  let items = []
  try { items = JSON.parse(p.combo_items || "[]") } catch (e) {}

  document.getElementById("c_sku").value  = p.sku
  document.getElementById("c_name").value = p.product_name || ""
  document.getElementById("c_qty").value  = p.combo_qty || 1

  comboRows = items.map(i => ({ id: Date.now() + Math.random(), sku: i.sku, qty: i.qty }))
  renderComboBuilder()

  setTimeout(() => {
    comboRows.forEach((r, idx) => {
      const sel = document.getElementById("cr-sku-" + r.id)
      const inp = document.getElementById("cr-qty-" + r.id)
      if (sel) sel.value = items[idx]?.sku || ""
      if (inp) inp.value = items[idx]?.qty || 1
    })
  }, 50)

  showToast("✏️ Đang chỉnh sửa combo: " + sku)
  window.scrollTo({ top: 0, behavior: "smooth" })
}
