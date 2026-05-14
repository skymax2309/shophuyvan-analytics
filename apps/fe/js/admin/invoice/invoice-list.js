async function loadInvoices() {
  const el = document.getElementById("inv-list")
  el.innerHTML = "Đang tải..."
  try {
    // Lấy đủ danh sách để bộ lọc trùng số hóa đơn không bỏ sót hóa đơn cũ ngoài 100 dòng mới nhất.
    _allInvoices = await fetch(API + "/api/invoices?all=1").then(r => r.json())
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

function normalizeInvoiceNo(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^\w./-]/g, "")
}

// Chuẩn hóa số hóa đơn trước khi đếm trùng để bắt được các bản lệch khoảng trắng hoặc chữ thường/chữ hoa.
function invoiceNoCountMap(rows = _allInvoices) {
  const counts = new Map()
  for (const inv of rows) {
    const key = normalizeInvoiceNo(inv.invoice_no)
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function isDuplicateInvoiceNo(inv, counts = invoiceNoCountMap()) {
  const key = normalizeInvoiceNo(inv.invoice_no)
  return !!key && (counts.get(key) || 0) > 1
}

function parsedInvoiceDuplicateCount(invoiceNo) {
  const key = normalizeInvoiceNo(invoiceNo)
  if (!key) return 0
  return invoiceNoCountMap(_allInvoices).get(key) || 0
}

function filterInvoices() {
  const kw       = document.getElementById("inv-filter-kw").value.toLowerCase()
  const month    = document.getElementById("inv-filter-month").value
  const mst      = document.getElementById("inv-filter-mst").value
  const dupMode  = document.getElementById("inv-filter-duplicate")?.value || ""
  const noCounts = invoiceNoCountMap(_allInvoices)

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
    const matchDup   = !dupMode || isDuplicateInvoiceNo(inv, noCounts)
    return matchKw && matchMonth && matchMst && matchDup
  })
  renderInvoiceList(filtered)
}

function renderInvoiceList(data) {
  const el      = document.getElementById("inv-list")
  const months  = [...new Set(_allInvoices.map(i => (i.invoice_date || "").slice(0, 7)))].sort().reverse()
  const mstList = [...new Set(_allInvoices.map(i => i.buyer).filter(Boolean))]
  const noCounts = invoiceNoCountMap(_allInvoices)
  const duplicateTotal = _allInvoices.filter(inv => isDuplicateInvoiceNo(inv, noCounts)).length

  // Giữ lại giá trị filter hiện tại nếu đang có
  const curKw    = document.getElementById("inv-filter-kw")?.value    || ""
  const curMonth = document.getElementById("inv-filter-month")?.value || ""
  const curMst   = document.getElementById("inv-filter-mst")?.value   || ""
  const curDup   = document.getElementById("inv-filter-duplicate")?.value || ""

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
      <select id="inv-filter-duplicate" onchange="filterInvoices()"
        style="border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:13px">
        <option value="">Tất cả số HĐ</option>
        <option value="duplicate" ${curDup === "duplicate" ? "selected" : ""}>Chỉ số HĐ trùng (${duplicateTotal})</option>
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
    <div class="invoice-table-wrap">
    <table class="invoice-list-table" style="width:100%;border-collapse:collapse;font-size:13px">
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
        const noKey = normalizeInvoiceNo(inv.invoice_no)
        const duplicateCount = noKey ? (noCounts.get(noKey) || 0) : 0
        const duplicateBadge = duplicateCount > 1
          ? `<span style="display:inline-block;margin-top:3px;background:#fef3c7;color:#92400e;border-radius:999px;padding:1px 6px;font-size:10px;font-family:Arial">Trùng ${duplicateCount}</span>`
          : ""
        const rowStyle = duplicateCount > 1
          ? "border-bottom:2px solid #e5e7eb;background:#fffbeb"
          : "border-bottom:2px solid #e5e7eb"

        return `<tr style="${rowStyle}">
          <td data-label="Nhà CC" style="padding:8px;max-width:180px;font-size:12px">${inv.supplier || "?"}</td>
          <td data-label="MST" style="padding:8px;font-size:12px;color:#555">${inv.buyer ? `<span style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px">${inv.buyer}</span>` : "—"}</td>
          <td data-label="Số HĐ" style="padding:8px;font-family:monospace">${inv.invoice_no || "?"}<br>${duplicateBadge}</td>
          <td data-label="Ngày" style="padding:8px">${inv.invoice_date || "?"}</td>
          <td data-label="Tổng tiền" style="padding:8px;text-align:right;color:#6d28d9;font-weight:600">${Number(inv.total_amount || 0).toLocaleString("vi-VN")}đ</td>
          <td data-label="Sản phẩm" style="padding:8px;min-width:280px">${itemsHtml}</td>
          <td data-label="Tải" style="padding:8px;white-space:nowrap;display:flex;gap:6px;align-items:center">
            <a href="${API}/api/invoice-file?key=${encodeURIComponent(inv.r2_key)}" target="_blank" style="color:#4f46e5;font-size:12px">⬇️ Tải</a>
            <button onclick="deleteInvoice(${inv.id},'${inv.r2_key}')"
              style="padding:3px 8px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">🗑️</button>
          </td>
        </tr>`
      }).join("")}</tbody>
    </table>
    </div>`
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
      await refreshInvoiceSkuCacheAfterSave()
    } catch (e) {
      alert("Lỗi: " + e.message)
    }
    div.remove()
  }
}
