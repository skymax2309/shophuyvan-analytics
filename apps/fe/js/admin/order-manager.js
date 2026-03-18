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

  const totalRev    = filtered.filter(o => o.order_type === "normal").reduce((s, o) => s + (o.revenue || 0), 0)
  const totalProfit = filtered.filter(o => o.order_type === "normal").reduce((s, o) => s + (o.profit_real || 0), 0)
  document.getElementById("orderSummary").innerHTML =
    `Hiển thị <b>${paged.length}</b> / <b>${total}</b> đơn &nbsp;|&nbsp;
     Doanh thu: <b style="color:#3b82f6">${fmt(totalRev)}</b> &nbsp;|&nbsp;
     Lãi thực: <b class="${totalProfit >= 0 ? "profit-pos" : "profit-neg"}">${fmt(totalProfit)}</b>`

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
