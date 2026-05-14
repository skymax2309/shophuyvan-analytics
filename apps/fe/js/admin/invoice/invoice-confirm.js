async function renderInvConfirm(data) {
  const [skuResponse, skuMapRows] = await Promise.all([
    fetch(API + "/api/products").then(r => r.json()),
    fetch(API + "/api/sku-map").then(r => r.json())
  ])
  const skus = Array.isArray(skuResponse) ? skuResponse : (skuResponse.data || [])
  window._invSkus = skus.filter(s => !s.is_combo)
  const skuMapIndex = buildInvoiceSkuMap(Array.isArray(skuMapRows) ? skuMapRows : [])

  const tbody = document.getElementById("inv-items-table")
  tbody.innerHTML = data.items.map((item, i) => {
    const mappedSku   = findLearnedInvoiceSku(item.name || "", skuMapIndex)

    const scored = window._invSkus
      .map(s => ({ s, score: scoreInvoiceSku(item.name || "", s, item.unit_price) }))
      .sort((a, b) => b.score - a.score)

    const topSuggestions = scored.filter(x => x.score >= 0.12).slice(0, 8)
    const rest           = scored.filter(x => x.score < 0.12)
    const bestScore      = topSuggestions[0]?.score || 0
    const autoSelected   = mappedSku || (shouldAutoSelectInvoiceSku(scored) ? scored[0].s.sku : "")
    const isMapped       = !!mappedSku

    const opts = `<option value="">-- Chọn SKU --</option>` +
      topSuggestions.map(x => invoiceSkuOption(x, autoSelected, "⭐ ")).join("") +
      (topSuggestions.length ? `<option disabled>──────────────</option>` : "") +
      rest.map(x => invoiceSkuOption(x, autoSelected)).join("")

    const mappedSkuInfo = mappedSku ? window._invSkus.find(s => s.sku === mappedSku) : null
    const itemName = escapeInvoiceHtml(item.name || "")
    const mappedSkuSafe = escapeInvoiceHtml(mappedSku)
    const mappedProductName = escapeInvoiceHtml(mappedSkuInfo?.product_name || "")
    const autoHint = autoSelected && !isMapped
      ? `<div style="font-size:11px;color:#16a34a;margin-top:2px">✅ Tự chọn SKU: <b>${escapeInvoiceHtml(autoSelected)}</b> | Tin cậy ${Math.round(Math.min(bestScore, 1) * 100)}%</div>`
      : `<div style="font-size:11px;color:#b45309;margin-top:2px">Cần chọn SKU thủ công vì độ khớp còn thấp.</div>`

    if (isMapped) {
      return `<tr style="border-bottom:1px solid #f3f4f6;background:#f5f3ff">
        <td data-label="Tên SP" style="padding:8px;max-width:220px;font-size:12px;color:#888">${itemName}</td>
        <td data-label="SL" style="padding:8px;text-align:right">${item.qty}</td>
        <td data-label="Đơn giá" style="padding:8px;text-align:right;color:#6d28d9;font-weight:600">${Number(item.unit_price).toLocaleString("vi-VN")}đ</td>
        <td data-label="SKU" style="padding:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <div>
              <span style="background:#ede9fe;color:#6d28d9;font-weight:700;padding:2px 8px;border-radius:6px;font-family:monospace;font-size:12px">${mappedSkuSafe}</span>
              <div style="font-size:12px;color:#333;margin-top:3px">${mappedProductName}</div>
              <div style="font-size:11px;color:#4f46e5;margin-top:1px">🔗 Đã học từ hóa đơn trước</div>
            </div>
            <button onclick="unlockInvRow(${i})"
              style="padding:3px 8px;border:1px solid #e5e7eb;border-radius:6px;background:white;color:#888;font-size:11px;cursor:pointer;white-space:nowrap">
              ✏️ Đổi
            </button>
          </div>
          <input type="hidden" id="inv-sku-${i}" value="${mappedSkuSafe}">
        </td>
        <td data-label="Bỏ qua" style="padding:8px;text-align:center"><input type="checkbox" id="inv-skip-${i}"></td>
      </tr>`
    }

    return `<tr style="border-bottom:1px solid #f3f4f6" id="inv-row-${i}">
      <td data-label="Tên SP" style="padding:8px;max-width:220px;font-size:12px">${itemName}</td>
      <td data-label="SL" style="padding:8px;text-align:right">${item.qty}</td>
      <td data-label="Đơn giá" style="padding:8px;text-align:right;color:#6d28d9;font-weight:600">${Number(item.unit_price).toLocaleString("vi-VN")}đ</td>
      <td data-label="SKU" style="padding:8px">
        <input type="text" id="inv-search-${i}"
          placeholder="🔍 Gõ SKU hoặc tên để lọc..."
          oninput="filterSkuOptions(${i}, this.value)"
          style="width:100%;border:1px solid #c7d2fe;border-radius:6px;padding:5px 8px;font-size:12px;margin-bottom:5px;outline:none">
        <select id="inv-sku-${i}"
          style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px">
          ${opts}
        </select>
        ${autoHint}
      </td>
      <td data-label="Bỏ qua" style="padding:8px;text-align:center"><input type="checkbox" id="inv-skip-${i}"></td>
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
    skuList.map(s => {
      const sku = escapeInvoiceHtml(s.sku || "")
      const name = escapeInvoiceHtml(s.product_name || "Chưa có tên sản phẩm")
      return `<option value="${sku}" ${s.sku === hiddenSku ? "selected" : ""}>${sku} — ${name}</option>`
    }).join("")
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
  const kw       = normalizeInvoiceLookupText(keyword)
  const all      = window._invSkus || []
  const filtered = kw
    ? all.filter(s =>
        normalizeInvoiceLookupText(`${s.sku || ""} ${s.product_name || ""} ${expandSkuLookupWords(s.sku || "")}`).includes(kw)
      )
    : all
  sel.innerHTML = `<option value="">-- Chọn SKU --</option>` +
    filtered.map(s => {
      const sku = escapeInvoiceHtml(s.sku || "")
      const name = escapeInvoiceHtml(s.product_name || "Chưa có tên sản phẩm")
      return `<option value="${sku}" ${s.sku === cur ? "selected" : ""}>${sku} — ${name}</option>`
    }).join("")
}

function similarity(a, b) {
  const wa    = new Set(a.split(/\s+/).filter(Boolean))
  const wb    = new Set(b.split(/\s+/).filter(Boolean))
  const inter = [...wa].filter(w => wb.has(w)).length
  const union = new Set([...wa, ...wb]).size
  return union ? inter / union : 0
}

async function refreshInvoiceSkuCacheAfterSave() {
  const refreshTasks = []

  if (typeof loadInvoices === "function") {
    refreshTasks.push(Promise.resolve().then(() => loadInvoices()))
  }

  if (typeof window.loadSkus === "function") {
    refreshTasks.push(Promise.resolve().then(() => window.loadSkus()))
  } else {
    refreshTasks.push(
      fetch(API + "/api/products")
        .then(r => r.json())
        .then(data => {
          const rows = Array.isArray(data) ? data : (data?.data || [])
          window.allSkus = rows
          window._invSkus = rows.filter(s => !s.is_combo)
        })
    )
  }

  // Refresh phụ không được chặn luồng lưu hóa đơn; lỗi thật của thao tác lưu vẫn xử lý riêng ở caller.
  const results = await Promise.allSettled(refreshTasks)
  const failed = results.find(r => r.status === "rejected")
  if (failed) console.warn("Invoice refresh skipped:", failed.reason)
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
      await refreshInvoiceSkuCacheAfterSave()
    } else {
      alert("Lỗi: " + result.error)
    }
  } catch (e) {
    alert("Lỗi: " + e.message)
  }
}
