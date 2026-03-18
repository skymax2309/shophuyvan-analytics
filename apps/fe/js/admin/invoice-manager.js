// ── INVOICE MANAGER ──────────────────────────────────────────────────
// Requires: API, fmt, showToast, allSkus (sku-manager.js)

let invFile   = null
let invParsed = []
let _allInvoices = []

function handleInvFile(file) {
  if (!file) return
  invFile = file
  document.getElementById("inv-filename").textContent  = "📄 " + file.name
  document.getElementById("inv-dropzone").style.borderColor = "#4f46e5"
}

async function uploadInvoice() {
  if (!invFile) { alert("Chọn file PDF trước!"); return }
  const btn = document.getElementById("inv-btn")
  const log = document.getElementById("inv-log")
  btn.disabled    = true
  btn.textContent = "⏳ Đang phân tích..."
  log.innerHTML   = "🤖 AI đang đọc hóa đơn..."

  try {
    const formData = new FormData()
    formData.append("file", invFile)
    const res  = await fetch(API + "/api/parse-invoice", { method: "POST", body: formData })
    const data = await res.json()
    if (!data.items || !data.items.length) {
      log.innerHTML = "❌ Không tìm thấy sản phẩm trong hóa đơn!"
      return
    }
    invParsed     = data
    log.innerHTML = `✅ Tìm thấy <b>${data.items.length}</b> sản phẩm | Nhà CC: <b>${data.supplier || "?"}</b> | Ngày: <b>${data.invoice_date || "?"}</b>`
    renderInvConfirm(data)
  } catch (e) {
    log.innerHTML = "❌ Lỗi: " + e.message
  } finally {
    btn.disabled    = false
    btn.textContent = "🤖 Phân tích bằng AI"
  }
}

async function renderInvConfirm(data) {
  const [skus, skuMapRows] = await Promise.all([
    fetch(API + "/api/products").then(r => r.json()),
    fetch(API + "/api/sku-map").then(r => r.json())
  ])
  window._invSkus = skus.filter(s => !s.is_combo)
  const skuMap = {}
  for (const m of skuMapRows) skuMap[m.invoice_name.trim()] = m.sku

  const tbody = document.getElementById("inv-items-table")
  tbody.innerHTML = data.items.map((item, i) => {
    const name        = (item.name || "").toLowerCase()
    const nameTrimmed = (item.name || "").trim()
    const mappedSku   = skuMap[nameTrimmed] || ""

    const scored = window._invSkus
      .map(s => ({ s, score: similarity(name, (s.product_name || "").toLowerCase()) }))
      .sort((a, b) => b.score - a.score)

    const topSuggestions = scored.filter(x => x.score > 0.15).slice(0, 8)
    const rest           = scored.filter(x => x.score <= 0.15)
    const bestScore      = topSuggestions[0]?.score || 0
    const autoSelected   = mappedSku || (bestScore > 0.4 ? topSuggestions[0].s.sku : "")
    const isMapped       = !!mappedSku

    const opts = `<option value="">-- Chọn SKU --</option>` +
      topSuggestions.map(x =>
        `<option value="${x.s.sku}" ${x.s.sku === autoSelected ? "selected" : ""}>
          ⭐ ${x.s.sku} — ${x.s.product_name}
        </option>`
      ).join("") +
      (topSuggestions.length ? `<option disabled>──────────────</option>` : "") +
      rest.map(x =>
        `<option value="${x.s.sku}">${x.s.sku} — ${x.s.product_name}</option>`
      ).join("")

    const mappedSkuInfo = mappedSku ? window._invSkus.find(s => s.sku === mappedSku) : null

    if (isMapped) {
      return `<tr style="border-bottom:1px solid #f3f4f6;background:#f5f3ff">
        <td style="padding:8px;max-width:220px;font-size:12px;color:#888">${item.name}</td>
        <td style="padding:8px;text-align:right">${item.qty}</td>
        <td style="padding:8px;text-align:right;color:#6d28d9;font-weight:600">${Number(item.unit_price).toLocaleString("vi-VN")}đ</td>
        <td style="padding:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <div>
              <span style="background:#ede9fe;color:#6d28d9;font-weight:700;padding:2px 8px;border-radius:6px;font-family:monospace;font-size:12px">${mappedSku}</span>
              <div style="font-size:12px;color:#333;margin-top:3px">${mappedSkuInfo?.product_name || ""}</div>
              <div style="font-size:11px;color:#4f46e5;margin-top:1px">🔗 Đã map sẵn</div>
            </div>
            <button onclick="unlockInvRow(${i})"
              style="padding:3px 8px;border:1px solid #e5e7eb;border-radius:6px;background:white;color:#888;font-size:11px;cursor:pointer;white-space:nowrap">
              ✏️ Đổi
            </button>
          </div>
          <input type="hidden" id="inv-sku-${i}" value="${mappedSku}">
        </td>
        <td style="padding:8px;text-align:center"><input type="checkbox" id="inv-skip-${i}"></td>
      </tr>`
    }

    return `<tr style="border-bottom:1px solid #f3f4f6" id="inv-row-${i}">
      <td style="padding:8px;max-width:220px;font-size:12px">${item.name}</td>
      <td style="padding:8px;text-align:right">${item.qty}</td>
      <td style="padding:8px;text-align:right;color:#6d28d9;font-weight:600">${Number(item.unit_price).toLocaleString("vi-VN")}đ</td>
      <td style="padding:8px">
        <input type="text" id="inv-search-${i}"
          placeholder="🔍 Gõ SKU hoặc tên để lọc..."
          oninput="filterSkuOptions(${i}, this.value)"
          style="width:100%;border:1px solid #c7d2fe;border-radius:6px;padding:5px 8px;font-size:12px;margin-bottom:5px;outline:none">
        <select id="inv-sku-${i}"
          style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px">
          ${opts}
        </select>
        ${autoSelected ? `<div style="font-size:11px;color:#16a34a;margin-top:2px">✅ Tự gợi ý: ${autoSelected}</div>` : ""}
      </td>
      <td style="padding:8px;text-align:center"><input type="checkbox" id="inv-skip-${i}"></td>
    </tr>`
  }).join("")

  document.getElementById("inv-confirm-card").style.display = "block"
}

function unlockInvRow(i) {
  const hiddenInput = document.getElementById(`inv-sku-${i}`)
  if (!hiddenInput) return
  const hiddenSku = hiddenInput.value || ""
  const skuList   = window._invSkus || []
  const opts = `<option value="">-- Chọn SKU --</option>` +
    skuList.map(s => `<option value="${s.sku}" ${s.sku === hiddenSku ? "selected" : ""}>${s.sku} — ${s.product_name}</option>`).join("")
  const td = hiddenInput.closest("td")
  td.innerHTML = `
    <input type="text" id="inv-search-${i}"
      placeholder="🔍 Gõ SKU hoặc tên để lọc..."
      oninput="filterSkuOptions(${i}, this.value)"
      style="width:100%;border:1px solid #c7d2fe;border-radius:6px;padding:5px 8px;font-size:12px;margin-bottom:5px;outline:none">
    <select id="inv-sku-${i}"
      style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px">
      ${opts}
    </select>`
  hiddenInput.closest("tr").style.background = ""
}

function filterSkuOptions(i, keyword) {
  const sel      = document.getElementById(`inv-sku-${i}`)
  const cur      = sel.value
  const kw       = keyword.toLowerCase().trim()
  const all      = window._invSkus || []
  const filtered = kw
    ? all.filter(s =>
        s.sku.toLowerCase().includes(kw) ||
        (s.product_name || "").toLowerCase().includes(kw)
      )
    : all
  sel.innerHTML = `<option value="">-- Chọn SKU --</option>` +
    filtered.map(s =>
      `<option value="${s.sku}" ${s.sku === cur ? "selected" : ""}>${s.sku} — ${s.product_name}</option>`
    ).join("")
}

function similarity(a, b) {
  const wa    = new Set(a.split(/\s+/).filter(Boolean))
  const wb    = new Set(b.split(/\s+/).filter(Boolean))
  const inter = [...wa].filter(w => wb.has(w)).length
  const union = new Set([...wa, ...wb]).size
  return union ? inter / union : 0
}

async function confirmInvoice() {
  const items = invParsed.items.map((item, i) => {
    const sku  = document.getElementById(`inv-sku-${i}`)?.value || ""
    const skip = document.getElementById(`inv-skip-${i}`)?.checked
    return { ...item, sku, skip }
  }).filter(x => !x.skip && x.sku)

  if (!items.length) { alert("Chưa chọn SKU nào!"); return }

  const payload = {
    supplier:     invParsed.supplier,
    buyer:        invParsed.buyer || "",
    invoice_no:   invParsed.invoice_no,
    invoice_date: invParsed.invoice_date,
    total_amount: invParsed.total_amount,
    items
  }

  try {
    const formData = new FormData()
    formData.append("file", invFile)
    formData.append("data", JSON.stringify(payload))
    const res    = await fetch(API + "/api/save-invoice", { method: "POST", body: formData })
    const result = await res.json()
    if (result.status === "ok") {
      if (result.price_changes && result.price_changes.length > 0) {
        showPriceChangeConfirm(result.price_changes)
      } else {
        showToast(`✅ Đã lưu hóa đơn & cập nhật ${result.updated} SKU!`)
      }
      document.getElementById("inv-confirm-card").style.display = "none"
      document.getElementById("inv-log").innerHTML = ""
      invFile = null
      document.getElementById("inv-filename").textContent = "Hỗ trợ hóa đơn từ mọi nhà cung cấp"
      loadInvoices()
      loadSkus()
    } else {
      alert("Lỗi: " + result.error)
    }
  } catch (e) {
    alert("Lỗi: " + e.message)
  }
}

async function loadInvoices() {
  const el = document.getElementById("inv-list")
  el.innerHTML = "Đang tải..."
  try {
    _allInvoices = await fetch(API + "/api/invoices").then(r => r.json())
    renderInvoiceList(_allInvoices)
  } catch (e) {
    el.innerHTML = "❌ " + e.message
  }
}

async function downloadAllInvoicesZip() {
  const btn = document.getElementById("btn-download-all-inv")
  btn.disabled = true
  btn.textContent = "⏳ Đang tải danh sách..."

  try {
    // Lấy toàn bộ hóa đơn
    const all = await fetch(API + "/api/invoices?all=1").then(r => r.json())
    if (!all.length) { alert("Không có hóa đơn nào!"); return }

    // Cần thư viện JSZip — load động nếu chưa có
    if (!window.JSZip) {
      await new Promise((res, rej) => {
        const s = document.createElement("script")
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
        s.onload = res; s.onerror = rej
        document.head.appendChild(s)
      })
    }

    const zip = new window.JSZip()
    let done = 0

    for (const inv of all) {
      if (!inv.r2_key) { done++; continue }

      // Tên folder theo tháng: "2026-02", "2026-01", ...
      const month  = (inv.invoice_date || "unknown").slice(0, 7)
      const folder = zip.folder(month)

      // Tên file: "CTY_VINH_PHAT_HĐ440_2026-02-07.pdf"
      const supplier = (inv.supplier || "NhaCungCap")
        .replace(/[^a-zA-Z0-9À-ỹ\s]/g, "").trim()
        .replace(/\s+/g, "_").slice(0, 30)
      const invoiceNo = (inv.invoice_no || "unknown").replace(/[/\\:*?"<>|]/g, "-")
      const fileName  = `${supplier}_HD${invoiceNo}_${inv.invoice_date || "unknown"}.pdf`

      btn.textContent = `⏳ Đang tải ${++done}/${all.length}...`

      try {
        const res  = await fetch(API + "/api/invoice-file?key=" + encodeURIComponent(inv.r2_key))
        const blob = await res.blob()
        folder.file(fileName, blob)
      } catch (e) {
        console.warn("Bỏ qua:", inv.r2_key, e.message)
      }
    }

    btn.textContent = "⏳ Đang đóng gói ZIP..."
    const zipBlob = await zip.generateAsync({ type: "blob" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(zipBlob)
    a.download = `hoa-don-${new Date().toISOString().slice(0,10)}.zip`
    a.click()

    showToast(`✅ Đã tải ${all.length} hóa đơn, chia ${[...new Set(all.map(i => (i.invoice_date||"").slice(0,7)))].length} tháng!`)
  } catch (e) {
    alert("Lỗi: " + e.message)
  } finally {
    btn.disabled = false
    btn.textContent = "📦 Tải tất cả PDF (theo tháng)"
  }
}

async function deleteInvoice(id, r2Key) {
  if (!confirm("Xóa hóa đơn này? File PDF cũng sẽ bị xóa.")) return
  await fetch(API + "/api/invoices/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, r2_key: r2Key })
  })
  showToast("✅ Đã xóa hóa đơn!")
  loadInvoices()
}

function filterInvoices() {
  const kw    = document.getElementById("inv-filter-kw").value.toLowerCase()
  const month = document.getElementById("inv-filter-month").value
  const mst   = document.getElementById("inv-filter-mst").value

  const filtered = _allInvoices.filter(inv => {
    const items     = (() => { try { return JSON.parse(inv.items_json || "[]") } catch { return [] } })()
    const itemsText = items.map(it => `${it.sku || ""} ${it.name || ""}`).join(" ").toLowerCase()
    const matchKw   = !kw ||
      (inv.supplier || "").toLowerCase().includes(kw) ||
      (inv.buyer || "").toLowerCase().includes(kw) ||
      (inv.invoice_no || "").toLowerCase().includes(kw) ||
      itemsText.includes(kw)
    const matchMonth = !month || (inv.invoice_date || "").startsWith(month)
    const matchMst   = !mst   || inv.buyer === mst
    return matchKw && matchMonth && matchMst
  })
  renderInvoiceList(filtered)
}

function renderInvoiceList(data) {
  const el      = document.getElementById("inv-list")
  const months  = [...new Set(_allInvoices.map(i => (i.invoice_date || "").slice(0, 7)))].sort().reverse()
  const mstList = [...new Set(_allInvoices.map(i => i.buyer).filter(Boolean))]

  // Giữ lại giá trị filter hiện tại nếu đang có
  const curKw    = document.getElementById("inv-filter-kw")?.value    || ""
  const curMonth = document.getElementById("inv-filter-month")?.value || ""
  const curMst   = document.getElementById("inv-filter-mst")?.value   || ""

  const filterHtml = `
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <input id="inv-filter-kw" type="text"
        placeholder="🔍 Tìm nhà CC / số HĐ / tên SP / SKU..."
        oninput="filterInvoices()"
        value="${curKw.replace(/"/g,'&quot;')}"
        style="flex:1;min-width:200px;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:13px">
      <select id="inv-filter-month" onchange="filterInvoices()"
        style="border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:13px">
        <option value="">Tất cả tháng</option>
        ${months.map(m => `<option value="${m}" ${m === curMonth ? "selected" : ""}>${m}</option>`).join("")}
      </select>
    </div>
    <div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <span style="font-size:12px;color:#888;white-space:nowrap">MST người mua:</span>
      <button onclick="document.getElementById('inv-filter-mst').value='';filterInvoices();document.querySelectorAll('.mst-btn').forEach(b=>b.style.background='white')"
        style="padding:4px 10px;border-radius:20px;border:1px solid #4f46e5;background:#4f46e5;color:white;font-size:12px;cursor:pointer">
        Tất cả
      </button>
      ${mstList.map(mst => `
        <button class="mst-btn" onclick="
          const cur=document.getElementById('inv-filter-mst').value;
          document.getElementById('inv-filter-mst').value=cur==='${mst}'?'':'${mst}';
          document.querySelectorAll('.mst-btn').forEach(b=>b.style.background='white');
          if(cur!=='${mst}')this.style.background='#ede9fe';
          filterInvoices()"
          style="padding:4px 10px;border-radius:20px;border:1px solid #6d28d9;background:white;color:#6d28d9;font-size:12px;cursor:pointer;font-family:monospace">
          ${mst}
        </button>`).join("")}
      ${!mstList.length ? `<span style="font-size:11px;color:#aaa;font-style:italic">Chưa có dữ liệu MST — upload lại hóa đơn để cập nhật</span>` : ""}
      <input type="hidden" id="inv-filter-mst" value="${curMst}">
    </div>`

  if (!data.length) {
    el.innerHTML = filterHtml + '<div style="color:#aaa;text-align:center;padding:20px">Không tìm thấy hóa đơn nào</div>'
    return
  }

  el.innerHTML = filterHtml + `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:8px;text-align:left">Nhà CC</th>
        <th style="padding:8px;text-align:left">MST người mua</th>
        <th style="padding:8px;text-align:left">Số HĐ</th>
        <th style="padding:8px;text-align:left">Ngày</th>
        <th style="padding:8px;text-align:right">Tổng tiền</th>
        <th style="padding:8px;text-align:left;min-width:320px">Sản phẩm & SKU</th>
        <th style="padding:8px">Tải</th>
      </tr></thead>
      <tbody>${data.map(inv => {
        const items     = (() => { try { return JSON.parse(inv.items_json || "[]") } catch { return [] } })()
        const itemsHtml = items.length
          ? items.map(it => `
              <div style="padding:3px 0;border-bottom:1px dashed #f0f0f0;font-size:11px;display:flex;justify-content:space-between;gap:8px">
                <div style="flex:1">
                  ${it.sku
                    ? `<span style="background:#ede9fe;color:#6d28d9;font-weight:700;padding:1px 5px;border-radius:4px;font-family:monospace">${it.sku}</span> `
                    : `<span style="color:#ef4444;font-size:10px">⚠️ chưa map</span> `}
                  <span style="color:#555">${it.name || "?"}</span>
                </div>
                <div style="color:#888;white-space:nowrap">SL: ${it.qty} | ${Number(it.unit_price || 0).toLocaleString("vi-VN")}đ</div>
              </div>`).join("")
          : `<span style="color:#aaa;font-size:11px">Chưa có dữ liệu</span>`

        return `<tr style="border-bottom:2px solid #e5e7eb">
          <td style="padding:8px;max-width:180px;font-size:12px">${inv.supplier || "?"}</td>
          <td style="padding:8px;font-size:12px;color:#555">${inv.buyer ? `<span style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px">${inv.buyer}</span>` : "—"}</td>
          <td style="padding:8px;font-family:monospace">${inv.invoice_no || "?"}</td>
          <td style="padding:8px">${inv.invoice_date || "?"}</td>
          <td style="padding:8px;text-align:right;color:#6d28d9;font-weight:600">${Number(inv.total_amount || 0).toLocaleString("vi-VN")}đ</td>
          <td style="padding:8px;min-width:280px">${itemsHtml}</td>
          <td style="padding:8px;white-space:nowrap;display:flex;gap:6px;align-items:center">
            <a href="${API}/api/invoice-file?key=${encodeURIComponent(inv.r2_key)}" target="_blank" style="color:#4f46e5;font-size:12px">⬇️ Tải</a>
            <button onclick="deleteInvoice(${inv.id},'${inv.r2_key}')"
              style="padding:3px 8px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">🗑️</button>
          </td>
        </tr>`
      }).join("")}</tbody>
    </table>`
}

async function showPriceChangeConfirm(changes) {
  const div = document.createElement("div")
  div.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center"
  div.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;max-width:540px;width:90%;max-height:80vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">⚠️ Phát hiện thay đổi giá vốn</div>
      <div style="font-size:12px;color:#888;margin-bottom:16px">Xác nhận để cập nhật giá vốn mới vào hệ thống</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#fef3c7">
          <th style="padding:8px;text-align:left">SKU</th>
          <th style="padding:8px;text-align:right">Giá cũ</th>
          <th style="padding:8px;text-align:right">Giá mới</th>
          <th style="padding:8px;text-align:right">Chênh lệch</th>
          <th style="padding:8px;text-align:center">Cập nhật</th>
        </tr></thead>
        <tbody>${changes.map((c, i) => `
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:8px">
              <div style="font-weight:600;color:#4f46e5">${c.sku}</div>
              <div style="font-size:11px;color:#888">${c.name || ""}</div>
            </td>
            <td style="padding:8px;text-align:right;color:#888">${Number(c.old_price).toLocaleString("vi-VN")}đ</td>
            <td style="padding:8px;text-align:right;font-weight:600;color:#16a34a">${Number(c.new_price).toLocaleString("vi-VN")}đ</td>
            <td style="padding:8px;text-align:right;color:${c.new_price > c.old_price ? "#ef4444" : "#16a34a"}">
              ${c.new_price > c.old_price ? "+" : ""}${Number(c.new_price - c.old_price).toLocaleString("vi-VN")}đ
            </td>
            <td style="padding:8px;text-align:center"><input type="checkbox" id="pc-${i}" checked></td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="pc-confirm-btn"
          style="background:#16a34a;color:white;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-weight:600;flex:1">
          ✅ Xác nhận cập nhật
        </button>
        <button onclick="this.closest('div[style*=fixed]').remove()"
          style="background:#e5e7eb;color:#333;border:none;border-radius:8px;padding:10px 16px;cursor:pointer">
          Bỏ qua
        </button>
      </div>
    </div>`
  document.body.appendChild(div)

  document.getElementById("pc-confirm-btn").onclick = async () => {
    const selected = changes.filter((c, i) => document.getElementById(`pc-${i}`)?.checked)
    if (!selected.length) { div.remove(); return }
    try {
      const res    = await fetch(API + "/api/update-cost-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected)
      })
      const result = await res.json()
      showToast(`✅ Đã cập nhật ${result.updated} giá vốn thay đổi!`)
      loadSkus()
    } catch (e) {
      alert("Lỗi: " + e.message)
    }
    div.remove()
  }
}
