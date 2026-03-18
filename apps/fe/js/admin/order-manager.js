// ── ORDER MANAGER ────────────────────────────────────────────────────
// Requires: API, fmt, showToast

let allOrdersCache  = []
let currentOrderPage = 1
const PAGE_SIZE     = 50

async function loadOrders(page = 1) {
  currentOrderPage = page
  document.getElementById("ordersTable").innerHTML =
    `<tr><td colspan="13" class="empty">Đang tải...</td></tr>`

  const from   = document.getElementById("o_from").value
  const to     = document.getElementById("o_to").value
  const plt    = document.getElementById("o_platform").value
  const type   = document.getElementById("o_type").value
  const search = document.getElementById("o_search").value.trim().toLowerCase()

  const params = new URLSearchParams()
  if (from) params.set("from", from)
  if (to)   params.set("to", to)
  if (plt)  params.set("platform", plt)
  const qs = params.toString() ? "?" + params.toString() : ""

  const data = await fetch(API + "/api/export-orders" + qs).then(r => r.json())
  allOrdersCache = data

  let filtered = data
  if (type)   filtered = filtered.filter(o => o.order_type === type)
  if (search) filtered = filtered.filter(o =>
    (o.order_id    || "").toLowerCase().includes(search) ||
    (o.sku         || "").toLowerCase().includes(search) ||
    (o.product_name|| "").toLowerCase().includes(search) ||
    (o.shop        || "").toLowerCase().includes(search)
  )

  const total      = filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start      = (page - 1) * PAGE_SIZE
  const paged      = filtered.slice(start, start + PAGE_SIZE)

  const normalOrders = filtered.filter(o => o.order_type === "normal")
  const cancelOrders = filtered.filter(o => o.order_type === "cancel")
  const returnOrders = filtered.filter(o => o.order_type === "return")

  const totalRev        = normalOrders.reduce((s, o) => s + (o.revenue     || 0), 0)
  const totalProfit     = normalOrders.reduce((s, o) => s + (o.profit_real || 0), 0)
  const totalCancelFee  = cancelOrders.reduce((s, o) => s + (o.return_fee  || 0), 0)
  const totalReturnFee  = returnOrders.reduce((s, o) => s + (o.return_fee  || 0), 0)

  const uniqueCancel = [...new Set(cancelOrders.map(o => o.order_id))].length
  const uniqueReturn = [...new Set(returnOrders.map(o => o.order_id))].length

  document.getElementById("orderSummary").innerHTML =
    `Hiển thị <b>${paged.length}</b> / <b>${total}</b> đơn &nbsp;|&nbsp;
     Doanh thu: <b style="color:#3b82f6">${fmt(totalRev)}</b> &nbsp;|&nbsp;
     Lãi thực: <b class="${totalProfit >= 0 ? "profit-pos" : "profit-neg"}">${fmt(totalProfit)}</b>
     ${uniqueCancel > 0 ? `&nbsp;|&nbsp;
     ✗ Hủy: <b style="color:#ef4444">${uniqueCancel} đơn</b>
     ${totalCancelFee > 0 ? `(-<b style="color:#ef4444">${fmt(totalCancelFee)}</b>)` : ""}` : ""}
     ${uniqueReturn > 0 ? `&nbsp;|&nbsp;
     ↩ Hoàn: <b style="color:#f59e0b">${uniqueReturn} đơn</b>
     (-<b style="color:#f59e0b">${fmt(totalReturnFee)}</b>)` : ""}`

  if (paged.length === 0) {
    document.getElementById("ordersTable").innerHTML =
      `<tr><td colspan="13" class="empty">Không có đơn hàng nào</td></tr>`
    document.getElementById("orderPagination").innerHTML = ""
    return
  }

  document.getElementById("ordersTable").innerHTML = paged.map(o => renderOrderRow(o)).join("")

  if (totalPages <= 1) {
    document.getElementById("orderPagination").innerHTML = ""
    return
  }
  let pgHtml = `<button onclick="loadOrders(${page - 1})" ${page === 1 ? "disabled" : ""}>‹ Trước</button>`
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
      pgHtml += `<button onclick="loadOrders(${i})" class="${i === page ? "active" : ""}">${i}</button>`
    } else if (Math.abs(i - page) === 3) {
      pgHtml += `<span style="padding:0 4px;color:#aaa">...</span>`
    }
  }
  pgHtml += `<button onclick="loadOrders(${page + 1})" ${page === totalPages ? "disabled" : ""}>Sau ›</button>`
  document.getElementById("orderPagination").innerHTML = pgHtml
}

function renderOrderRow(o) {
  const typeClass = o.order_type === "normal" ? "tag-normal" : o.order_type === "cancel" ? "tag-cancel" : "tag-return"
  const typeLabel = o.order_type === "normal" ? "✓ Thành công" : o.order_type === "cancel" ? "✗ Hủy" : "↩ Hoàn"
  const pltClass  = "tag-" + (o.platform || "shopee")
  return `<tr style="${(o.profit_real || 0) < 0 ? "background:#fff1f2" : ""}">
    <td style="white-space:nowrap">${o.order_date || "—"}</td>
    <td><span class="${pltClass}">${(o.platform || "").toUpperCase()}</span></td>
    <td style="font-size:12px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.shop || "—"}</td>
    <td style="font-size:11px;font-family:monospace">${o.order_id || "—"}</td>
    <td><code style="font-size:11px">${o.sku || "—"}</code></td>
    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${o.product_name || ""}">${o.product_name || "—"}</td>
    <td style="text-align:center">${o.qty || 1}</td>
    <td style="text-align:right;color:#3b82f6;font-weight:600">${fmt(o.revenue)}</td>
    <td style="text-align:right;color:#6d28d9">${fmt(o.cost_real)}</td>
    <td style="text-align:right;color:#f59e0b;font-size:11px">${fmt(o.fee_platform)}</td>
    <td style="text-align:right;color:#f59e0b;font-size:11px">${fmt(o.fee_payment)}</td>
    <td style="text-align:right;color:#f59e0b;font-size:11px">${fmt(o.fee_affiliate)}</td>
    <td style="text-align:right;color:#f59e0b;font-size:11px">${fmt(o.fee_ads)}</td>
    <td style="text-align:right;color:#f59e0b;font-size:11px">${fmt(o.fee_piship)}</td>
    <td style="text-align:right;color:#f59e0b;font-size:11px">${fmt(o.fee_service)}</td>
    <td style="text-align:right;color:#f59e0b;font-weight:600">${fmt(o.fee)}</td>
    <td style="text-align:right;color:#ef4444;font-size:11px">${fmt(o.tax_flat)}</td>
    <td style="text-align:right;color:#ef4444;font-size:11px">${fmt(o.tax_income)}</td>
    <td style="text-align:right;font-weight:700" class="${(o.profit_real || 0) >= 0 ? "profit-pos" : "profit-neg"}">${fmt(o.profit_real)}</td>
    <td><span class="${typeClass}">${typeLabel}</span></td>
  </tr>`
}

let lossOrdersCache = []
let currentLossPage = 1

async function loadLossOrders(page = 1) {
  currentLossPage = page
  document.getElementById("lossTable").innerHTML =
    `<tr><td colspan="20" class="empty">Đang tải...</td></tr>`

  const from = document.getElementById("l_from").value
  const to   = document.getElementById("l_to").value
  const plt  = document.getElementById("l_platform").value

  const params = new URLSearchParams()
  if (from) params.set("from", from)
  if (to)   params.set("to", to)
  if (plt)  params.set("platform", plt)
  const qs = params.toString() ? "?" + params.toString() : ""

  const data = await fetch(API + "/api/export-orders" + qs).then(r => r.json())
  lossOrdersCache = data.filter(o => o.order_type === "normal" && (o.profit_real || 0) < 0)

  const total      = lossOrdersCache.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start      = (page - 1) * PAGE_SIZE
  const paged      = lossOrdersCache.slice(start, start + PAGE_SIZE)

  const totalLoss = lossOrdersCache.reduce((s, o) => s + (o.profit_real || 0), 0)
  document.getElementById("lossSummary").innerHTML =
    `Tìm thấy <b style="color:#ef4444">${total}</b> đơn âm tiền &nbsp;|&nbsp;
     Tổng lỗ: <b class="profit-neg">${fmt(totalLoss)}</b>`

  if (paged.length === 0) {
    document.getElementById("lossTable").innerHTML =
      `<tr><td colspan="20" class="empty">🎉 Không có đơn nào bị âm tiền!</td></tr>`
    document.getElementById("lossPagination").innerHTML = ""
    return
  }

  document.getElementById("lossTable").innerHTML = paged.map(o => renderOrderRow(o)).join("")

  if (totalPages <= 1) { document.getElementById("lossPagination").innerHTML = ""; return }
  let pgHtml = `<button onclick="loadLossOrders(${page - 1})" ${page === 1 ? "disabled" : ""}>‹ Trước</button>`
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2)
      pgHtml += `<button onclick="loadLossOrders(${i})" class="${i === page ? "active" : ""}">${i}</button>`
    else if (Math.abs(i - page) === 3)
      pgHtml += `<span style="padding:0 4px;color:#aaa">...</span>`
  }
  pgHtml += `<button onclick="loadLossOrders(${page + 1})" ${page === totalPages ? "disabled" : ""}>Sau ›</button>`
  document.getElementById("lossPagination").innerHTML = pgHtml
}

function resetLossFilter() {
  document.getElementById("l_from").value     = ""
  document.getElementById("l_to").value       = ""
  document.getElementById("l_platform").value = ""
  loadLossOrders(1)
}

// ── IMPORT FILE INLINE ───────────────────────────────────────────────
function toggleImportPanel() {
  const panel = document.getElementById("importPanel")
  panel.style.display = panel.style.display === "none" ? "block" : "none"
}

async function importFileInline() {
  const fileInput = document.getElementById("inlineFileInput")
  const log       = document.getElementById("importLog")
  const file      = fileInput.files[0]
  if (!file) { showToast("⚠️ Chọn file trước!", true); return }

  log.innerHTML = "⏳ Đang đọc file..."

  try {
    // Dùng XLSX từ CDN (đã load trong admin-products.html)
    const data     = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet    = workbook.Sheets[workbook.SheetNames[0]]
    const rows     = XLSX.utils.sheet_to_json(sheet)

    // Import parser động
    const { normalizeOrder, parseFileMeta, fillFirstSku, mergeOrderLines, loadCostConfig } =
      await import("../js/parser.js")

    await loadCostConfig(API)
    const meta      = parseFileMeta(file.name)
    const rawOrders = []
    rows.forEach(r => {
      const o = normalizeOrder(r, meta)
      if (o) rawOrders.push(o)
    })
    const merged = mergeOrderLines(rawOrders)
    const orders = fillFirstSku(merged)

    log.innerHTML = `📦 Đọc được ${orders.length} dòng, đang upload...`

    const res    = await fetch(API + "/api/import-orders", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(orders)
    })
    const result = await res.json()

    log.innerHTML = `✅ Import thành công — ${result.imported} dòng! Đang tải lại...`
    showToast("✅ Import thành công!")
    fileInput.value = ""
    setTimeout(() => loadOrders(1), 800)

  } catch(e) {
    log.innerHTML = `❌ Lỗi: ${e.message}`
    console.error(e)
  }
}

// ── RECALC COST INLINE ───────────────────────────────────────────────
async function recalcCostInline() {
  const btn = event.target
  btn.disabled    = true
  btn.textContent = "⏳ Đang cập nhật..."

  try {
    const res    = await fetch(API + "/api/recalc-cost", { method: "POST" })
    const result = await res.json()
    showToast(`✅ Đã cập nhật ${result.updated} đơn!`)
    loadOrders(currentOrderPage)
  } catch(e) {
    showToast("❌ Lỗi: " + e.message, true)
  }

  btn.disabled    = false
  btn.textContent = "🔄 Cập nhật vốn"
}

function resetOrderFilter() {
  document.getElementById("o_from").value     = ""
  document.getElementById("o_to").value       = ""
  document.getElementById("o_platform").value = ""
  document.getElementById("o_type").value     = ""
  document.getElementById("o_search").value   = ""
  loadOrders(1)
}

function exportOrders() {
  if (allOrdersCache.length === 0) { showToast("⚠️ Chưa có dữ liệu để xuất!", true); return }
  const rows = [
    ["Ngày","Sàn","Shop","Mã đơn","SKU","Tên SP","SL","Doanh thu","Vốn thực","Phí","Lãi thực","Loại đơn"],
    ...allOrdersCache.map(o => [
      o.order_date, o.platform, o.shop, o.order_id, o.sku, o.product_name,
      o.qty, o.revenue, o.cost_real, o.fee, o.profit_real, o.order_type
    ])
  ]
  const csv  = rows.map(r => r.map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const a    = document.createElement("a")
  a.href     = URL.createObjectURL(blob)
  a.download = "orders_" + new Date().toISOString().slice(0, 10) + ".csv"
  a.click()
  showToast("✅ Đã xuất CSV!")
}

function toggleTaxExport() {
  const panel = document.getElementById("taxExportPanel")
  panel.style.display = panel.style.display === "none" ? "block" : "none"
  if (panel.style.display === "block") _loadTaxShops()
}

async function _loadTaxShops() {
  try {
    const shops = await fetch(API + "/api/top-shop").then(r => r.json())
    const names = [...new Set(shops.map(s => s.shop))].sort()
    const sel   = document.getElementById("tax_shop")
    sel.innerHTML = '<option value="">Tất cả shop</option>'
      + names.map(s => `<option value="${s}">${s}</option>`).join("")
  } catch(e) {}
}

async function exportTaxReport(format = 'csv') {
  const platform = document.getElementById("tax_platform").value
  const shop     = document.getElementById("tax_shop").value
  const month    = document.getElementById("tax_month").value
  const year     = document.getElementById("tax_year").value

  const info = document.getElementById("taxExportInfo")
  info.textContent = "⏳ Đang tải dữ liệu..."

  // Build query params
  const params = new URLSearchParams()
  if (platform) params.set("platform", platform)
  if (shop)     params.set("shop", shop)
  if (year && month) {
    params.set("from", `${year}-${month}-01`)
    const lastDay = new Date(+year, +month, 0).getDate()
    params.set("to", `${year}-${month}-${lastDay}`)
  } else if (year) {
    params.set("from", `${year}-01-01`)
    params.set("to",   `${year}-12-31`)
  }
  const qs = params.toString() ? "?" + params.toString() : ""

const data = await fetch(API + "/api/export-orders" + qs).then(r => r.json())
  const normal = data.filter(o => o.order_type === "normal")

  if (normal.length === 0) {
    info.textContent = "⚠️ Không có đơn thành công nào trong khoảng thời gian này."
    return
  }

  // Tổng hợp theo tháng
  const byMonth = {}
  for (const o of normal) {
    const m = (o.order_date || "").substring(0, 7)
    if (!byMonth[m]) byMonth[m] = { revenue: 0, tax_flat: 0, tax_income: 0, orders: 0 }
    byMonth[m].revenue    += o.revenue    || 0
    byMonth[m].tax_flat   += o.tax_flat   || 0
    byMonth[m].tax_income += o.tax_income || 0
    byMonth[m].orders++
  }

  const totalTax = normal.reduce((s, o) => s + (o.tax_flat || 0) + (o.tax_income || 0), 0)

  // Tên file
  const parts = ["quyet-toan-thue"]
  if (platform) parts.push(platform)
  if (shop)     parts.push(shop.replace(/\s+/g, "-"))
  if (year)     parts.push(year)
  if (month)    parts.push("T" + month)
  const fileName = parts.join("_")

  // ── Header bảng tổng hợp & chi tiết ──────────────────────────────
  const summaryHeader = ["Tháng","Số đơn","Doanh thu","Thuế khoán (1.5%)","Thuế LN (17%)","Tổng thuế"]
  const summaryData   = Object.entries(byMonth).sort().map(([m, v]) => [
    m, v.orders, v.revenue, v.tax_flat, v.tax_income, v.tax_flat + v.tax_income
  ])
  const summaryTotal  = [
    "TỔNG CỘNG", normal.length,
    normal.reduce((s,o) => s+(o.revenue||0), 0),
    normal.reduce((s,o) => s+(o.tax_flat||0), 0),
    normal.reduce((s,o) => s+(o.tax_income||0), 0),
    totalTax
  ]

  const detailHeader = ["Tháng","Ngày","Sàn","Shop","Mã đơn","SKU","Tên SP","SL","Doanh thu","Vốn thực","Tổng phí","Lãi thực","Thuế khoán","Thuế LN","Tổng thuế"]
  const detailData   = normal.map(o => [
    (o.order_date||"").substring(0,7), o.order_date, o.platform, o.shop,
    o.order_id, o.sku, o.product_name, o.qty,
    o.revenue, o.cost_real, o.fee, o.profit_real,
    o.tax_flat||0, o.tax_income||0, (o.tax_flat||0)+(o.tax_income||0)
  ])

  // ── XUẤT THEO ĐỊNH DẠNG ───────────────────────────────────────────
  if (format === 'csv') {
    const rows = [
      ["=== TỔNG HỢP THEO THÁNG ==="],
      summaryHeader, ...summaryData, summaryTotal,
      [], ["=== CHI TIẾT TỪNG ĐƠN ==="],
      detailHeader, ...detailData
    ]
    const csv  = rows.map(r => r.map(v => `"${(v||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n")
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8" })
    const a    = document.createElement("a")
    a.href     = URL.createObjectURL(blob)
    a.download = fileName + ".csv"
    a.click()

  } else if (format === 'excel') {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Tổng hợp
    const ws1Data = [summaryHeader, ...summaryData, summaryTotal]
    const ws1     = XLSX.utils.aoa_to_sheet(ws1Data)
    ws1["!cols"]  = [10,10,18,18,16,18].map(w => ({ wch: w }))
    // Tô màu dòng tổng (thủ công qua style)
    XLSX.utils.book_append_sheet(wb, ws1, "Tổng hợp thuế")

    // Sheet 2: Chi tiết
    const ws2Data = [detailHeader, ...detailData]
    const ws2     = XLSX.utils.aoa_to_sheet(ws2Data)
    ws2["!cols"]  = [10,12,10,16,20,20,30,6,14,14,12,12,14,12,12].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết đơn hàng")

    XLSX.writeFile(wb, fileName + ".xlsx")

  } else if (format === 'pdf') {
    const { jsPDF } = window.jspdf
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

    const fmtN = n => Number(n||0).toLocaleString("vi-VN")
    const period = [
      platform ? platform.toUpperCase() : "Tất cả sàn",
      shop || "Tất cả shop",
      year ? (month ? `Tháng ${month}/${year}` : `Năm ${year}`) : "Tất cả thời gian"
    ].join(" | ")

    // Tiêu đề
    doc.setFontSize(14)
    doc.text("BÁO CÁO QUYẾT TOÁN THUẾ", 148, 14, { align: "center" })
    doc.setFontSize(9)
    doc.text(period, 148, 20, { align: "center" })
    doc.text(`Xuất ngày: ${new Date().toLocaleDateString("vi-VN")}`, 148, 25, { align: "center" })

    // Bảng 1: Tổng hợp
    doc.setFontSize(10)
    doc.text("TỔNG HỢP THEO THÁNG", 14, 32)
    doc.autoTable({
      startY: 35,
      head:   [summaryHeader],
      body:   [...summaryData, summaryTotal],
      theme:  "grid",
      styles: { fontSize: 8, halign: "right" },
      headStyles:  { fillColor: [124,58,237], textColor: 255, halign: "center" },
      columnStyles: { 0: { halign: "center" } },
      didParseCell: (d) => {
        if (d.row.index === summaryData.length) {
          d.cell.styles.fontStyle = "bold"
          d.cell.styles.fillColor = [240, 235, 255]
        }
      },
      margin: { left: 14, right: 14 }
    })

    // Bảng 2: Chi tiết
    const y2 = doc.lastAutoTable.finalY + 8
    doc.setFontSize(10)
    doc.text("CHI TIẾT TỪNG ĐƠN HÀNG", 14, y2)
    doc.autoTable({
      startY: y2 + 3,
      head:   [detailHeader],
      body:   detailData,
      theme:  "striped",
      styles: { fontSize: 7, halign: "right", overflow: "ellipsize" },
      headStyles: { fillColor: [37,99,235], textColor: 255, halign: "center", fontSize: 7 },
      columnStyles: {
        0: { halign:"center", cellWidth:12 },
        1: { halign:"center", cellWidth:14 },
        2: { halign:"center", cellWidth:12 },
        3: { cellWidth:22 },
        4: { cellWidth:24 },
        5: { cellWidth:22 },
        6: { cellWidth:30 },
        7: { halign:"center", cellWidth:8 },
      },
      margin: { left: 14, right: 14 }
    })

    doc.save(fileName + ".pdf")
  }

  info.textContent = `✅ Đã xuất ${normal.length} đơn | Tổng thuế: ${Number(totalTax).toLocaleString("vi-VN")}đ`
}
