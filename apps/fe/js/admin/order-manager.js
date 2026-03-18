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
  const shop   = document.getElementById("o_shop").value
  const type   = document.getElementById("o_type").value
  const search = document.getElementById("o_search").value.trim().toLowerCase()

  const params = new URLSearchParams()
  if (from) params.set("from", from)
  if (to)   params.set("to", to)
  if (plt)  params.set("platform", plt)
  if (shop) params.set("shop", shop)
  const qs = params.toString() ? "?" + params.toString() : ""

const rawData = await fetch(API + "/api/export-orders" + qs).then(r => r.json())
  allOrdersCache = rawData

  // ── Gom theo order_id → mỗi đơn 1 dòng, items là mảng SKU ──────
  const orderMap = new Map()
  for (const row of rawData) {
    if (!orderMap.has(row.order_id)) {
      orderMap.set(row.order_id, {
        order_id:     row.order_id,
        order_date:   row.order_date,
        platform:     row.platform,
        shop:         row.shop,
        order_type:   row.order_type,
        cancel_reason:row.cancel_reason,
        return_fee:   row.return_fee   || 0,
        revenue:      0, cost_real: 0, fee: 0,
        profit_real:  0, tax_flat:  0, tax_income: 0,
        fee_platform: 0, fee_payment: 0, fee_affiliate: 0,
        fee_ads: 0, fee_piship: 0, fee_service: 0,
        items: []
      })
    }
    const ord = orderMap.get(row.order_id)
    // Cộng dồn tổng đơn
    ord.revenue      += row.revenue      || 0
    ord.cost_real    += row.cost_real    || 0
    ord.fee          += row.fee          || 0
    ord.profit_real  += row.profit_real  || 0
    ord.tax_flat     += row.tax_flat     || 0
    ord.tax_income   += row.tax_income   || 0
    ord.fee_platform += row.fee_platform || 0
    ord.fee_payment  += row.fee_payment  || 0
    ord.fee_affiliate+= row.fee_affiliate|| 0
    ord.fee_ads      += row.fee_ads      || 0
    ord.fee_piship   += row.fee_piship   || 0
    ord.fee_service  += row.fee_service  || 0
    // Lưu item
    if (row.sku) ord.items.push({
      sku: row.sku, product_name: row.product_name,
      qty: row.qty, revenue: row.revenue, cost_real: row.cost_real,
      fee: row.fee, profit_real: row.profit_real
    })
  }

  let grouped = [...orderMap.values()]

  // ── Filter ───────────────────────────────────────────────────────
  if (type)   grouped = grouped.filter(o => o.order_type === type)
  if (shop)   grouped = grouped.filter(o => o.shop === shop)
  if (search) grouped = grouped.filter(o =>
    (o.order_id || "").toLowerCase().includes(search) ||
    (o.shop     || "").toLowerCase().includes(search) ||
    o.items.some(i =>
      (i.sku          || "").toLowerCase().includes(search) ||
      (i.product_name || "").toLowerCase().includes(search)
    )
  )

  const total      = grouped.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start      = (page - 1) * PAGE_SIZE
  const paged      = grouped.slice(start, start + PAGE_SIZE)

  const normalOrders = grouped.filter(o => o.order_type === "normal")
  const cancelOrders = grouped.filter(o => o.order_type === "cancel")
  const returnOrders = grouped.filter(o => o.order_type === "return")

  const totalRev       = normalOrders.reduce((s, o) => s + (o.revenue     || 0), 0)
  const totalProfit    = normalOrders.reduce((s, o) => s + (o.profit_real || 0), 0)
  const totalCancelFee = cancelOrders.reduce((s, o) => s + (o.return_fee  || 0), 0)
  const totalReturnFee = returnOrders.reduce((s, o) => s + (o.return_fee  || 0), 0)

  document.getElementById("orderSummary").innerHTML =
    `Hiển thị <b>${paged.length}</b> / <b>${total}</b> đơn &nbsp;|&nbsp;
     Doanh thu: <b style="color:#3b82f6">${fmt(totalRev)}</b> &nbsp;|&nbsp;
     Lãi thực: <b class="${totalProfit >= 0 ? "profit-pos" : "profit-neg"}">${fmt(totalProfit)}</b>
     ${cancelOrders.length > 0 ? `&nbsp;|&nbsp;
     ✗ Hủy: <b style="color:#ef4444">${cancelOrders.length} đơn</b>
     ${totalCancelFee > 0 ? `(-<b style="color:#ef4444">${fmt(totalCancelFee)}</b>)` : ""}` : ""}
     ${returnOrders.length > 0 ? `&nbsp;|&nbsp;
     ↩ Hoàn: <b style="color:#f59e0b">${returnOrders.length} đơn</b>
     (-<b style="color:#f59e0b">${fmt(totalReturnFee)}</b>)` : ""}`

  if (paged.length === 0) {
    document.getElementById("ordersTable").innerHTML =
      `<tr><td colspan="13" class="empty">Không có đơn hàng nào</td></tr>`
    document.getElementById("orderPagination").innerHTML = ""
    return
  }

  document.getElementById("ordersTable").innerHTML = paged.map(o => renderGroupedOrderRow(o)).join("")

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

function renderGroupedOrderRow(o) {
  const typeClass = o.order_type === "normal" ? "tag-normal" : o.order_type === "cancel" ? "tag-cancel" : "tag-return"
  const typeLabel = o.order_type === "normal" ? "✓ Thành công" : o.order_type === "cancel" ? "✗ Hủy" : "↩ Hoàn"
  const pltClass  = "tag-" + (o.platform || "shopee")
  const hasItems  = o.items && o.items.length > 1
  const uid       = o.order_id.replace(/[^a-z0-9]/gi, "")

  // Dòng đơn hàng chính
  const mainRow = `<tr style="${(o.profit_real||0)<0?'background:#fff1f2':''}" ${hasItems ? `style="cursor:pointer" onclick="toggleOrderItems('${uid}')"` : ""}>
    <td style="white-space:nowrap">
      ${hasItems ? `<span id="expand_${uid}" style="color:#6b7280;margin-right:4px;font-size:10px">▶</span>` : ""}
      ${o.order_date || "—"}
    </td>
    <td><span class="${pltClass}">${(o.platform||"").toUpperCase()}</span></td>
    <td style="font-size:12px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.shop||"—"}</td>
    <td style="font-size:11px;font-family:monospace">${o.order_id||"—"}</td>
    <td style="text-align:center;color:#6b7280;font-size:12px">${o.items.length} SKU</td>
    <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">
      ${o.items.map(i => i.product_name||"").filter(Boolean).join(", ").substring(0,50) || "—"}
    </td>
    <td style="text-align:center">${o.items.reduce((s,i)=>s+(i.qty||1),0)}</td>
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
    <td style="text-align:right;font-weight:700" class="${(o.profit_real||0)>=0?'profit-pos':'profit-neg'}">${fmt(o.profit_real)}</td>
    <td><span class="${typeClass}">${typeLabel}</span></td>
  </tr>`

  // Các dòng SKU expand (ẩn mặc định)
  const itemRows = hasItems ? `<tr id="items_${uid}" style="display:none">
    <td colspan="20" style="padding:0;background:#f8fafc">
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead><tr style="background:#e2e8f0">
          <td style="padding:4px 8px;color:#64748b">SKU</td>
          <td style="padding:4px 8px;color:#64748b">Tên SP</td>
          <td style="padding:4px 8px;color:#64748b;text-align:center">SL</td>
          <td style="padding:4px 8px;color:#64748b;text-align:right">Doanh thu</td>
          <td style="padding:4px 8px;color:#64748b;text-align:right">Vốn thực</td>
          <td style="padding:4px 8px;color:#64748b;text-align:right">Phí</td>
          <td style="padding:4px 8px;color:#64748b;text-align:right">Lãi thực</td>
        </tr></thead>
        <tbody>
          ${o.items.map(i => `<tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:4px 8px;font-family:monospace">${i.sku||"—"}</td>
            <td style="padding:4px 8px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.product_name||"—"}</td>
            <td style="padding:4px 8px;text-align:center">${i.qty||1}</td>
            <td style="padding:4px 8px;text-align:right;color:#3b82f6">${fmt(i.revenue)}</td>
            <td style="padding:4px 8px;text-align:right;color:#6d28d9">${fmt(i.cost_real)}</td>
            <td style="padding:4px 8px;text-align:right;color:#f59e0b">${fmt(i.fee)}</td>
            <td style="padding:4px 8px;text-align:right" class="${(i.profit_real||0)>=0?'profit-pos':'profit-neg'}">${fmt(i.profit_real)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </td>
  </tr>` : ""

  return mainRow + itemRows
}

function toggleOrderItems(uid) {
  const row    = document.getElementById("items_" + uid)
  const icon   = document.getElementById("expand_" + uid)
  if (!row) return
  const isOpen = row.style.display !== "none"
  row.style.display  = isOpen ? "none" : "table-row"
  if (icon) icon.textContent = isOpen ? "▶" : "▼"
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
async function toggleImportPanel() {
  const panel = document.getElementById("importPanel")
  panel.style.display = panel.style.display === "none" ? "block" : "none"
  if (panel.style.display === "block") {
    try {
      const shops = await fetch(API + "/api/top-shop").then(r => r.json())
      const names = [...new Set(shops.map(s => s.shop))].sort()
      const sel   = document.getElementById("inlineShopSelect")
      sel.innerHTML = '<option value="">-- Chọn shop (nếu Shopee) --</option>'
        + names.map(s => `<option value="${s}">${s}</option>`).join("")
    } catch(e) {}
  }
}

async function importFileInline() {
  const fileInput = document.getElementById("inlineFileInput")
  const log       = document.getElementById("importLog")
  const file      = fileInput.files[0]
  if (!file) { showToast("⚠️ Chọn file trước!", true); return }

  log.innerHTML = "⏳ Đang đọc file..."

  try {
    // Detect platform từ tên file
    const nameParts = file.name.replace(/\.xlsx$/i, "").split("_")
    let platform = "unknown"
    for (const p of nameParts) {
      const l = p.toLowerCase()
      if (l === "shopee") { platform = "shopee"; break }
      if (l === "tiktok") { platform = "tiktok"; break }
      if (l === "lazada") { platform = "lazada"; break }
    }

    // Lấy shop từ dropdown (ưu tiên) hoặc tên file (fallback)
    const shopSel = document.getElementById("inlineShopSelect")
    const shop    = (shopSel?.value) ? shopSel.value : (nameParts[0] || "unknown")
    if (!shopSel?.value) {
      log.innerHTML = `⚠️ Chưa chọn shop! Dùng tên từ file: <b>${nameParts[0] || "unknown"}</b>. Tiếp tục sau 2 giây...`
      await new Promise(r => setTimeout(r, 2000))
    }


    // Đọc Excel
    const data     = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet    = workbook.Sheets[workbook.SheetNames[0]]
    const rows     = XLSX.utils.sheet_to_json(sheet)

    log.innerHTML = `📖 Đọc được ${rows.length} dòng từ file, đang xử lý...`

    // Gửi thẳng lên server dưới dạng raw rows + meta
    // Server sẽ normalize qua worker (không cần parser ở client)
    // Thay vào đó dùng iframe ẩn redirect sang index.html để parse
    // → Cách đơn giản nhất: tạo FormData gửi file lên 1 endpoint mới

    // Vì không thể import module, gửi raw JSON rows lên API
    // và để worker tự normalize theo platform
    const payload = rows.map(r => {
      // Shopee
      if (platform === "shopee") {
        const orderId = String(r["Mã đơn hàng"] || "").trim()
        if (!orderId) return null
        const trangThai = String(r["Trạng Thái Đơn Hàng"] || "").trim()
        const lyDoHuy   = String(r["Lý do hủy"] || "").trim()
        const traHang   = String(r["Trạng thái Trả hàng/Hoàn tiền"] || "").trim()
        const isCancel  = trangThai === "Đã hủy" || lyDoHuy !== ""
        const isReturn  = /hoàn tiền|trả hàng|chấp thuận/i.test(traHang)
        let order_type  = isCancel ? "cancel" : (isReturn ? "return" : "normal")
        const A         = Number(r["Tổng giá bán (sản phẩm)"] || 0)
        const A_order   = Number(r["Tổng giá trị đơn hàng (VND)"] || 0)
        const ratio     = A_order > 0 ? A / A_order : 1
        const B         = Math.round(Number(r["Mã giảm giá của Shopee"] || 0) * ratio)
        const AF        = Math.round(Number(r["Mã giảm giá của Shop"] || 0) * ratio)
        const AK        = Math.round(Number(r["Giảm giá từ Combo của Shop"] || 0) * ratio)
        const qty       = Math.max(1, Math.floor(Number(r["Số lượng"] || 1)))
        const dateRaw   = String(r["Ngày đặt hàng"] || "")
        const dm = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        const order_date = dm ? `${dm[3]}-${dm[2].padStart(2,"0")}-${dm[1].padStart(2,"0")}` : ""
        const shipped   = !!String(r["Ngày gửi hàng"] || "").trim()
        return {
          platform, shop, order_id: orderId, order_type, qty,
          revenue:       order_type === "normal" ? (A + B - AF - AK) : 0,
          raw_revenue:   A,
          shopee_voucher: B, shop_discount: AF, combo_discount: AK,
          sku:           String(r["SKU phân loại hàng"] || "").trim(),
          product_name:  String(r["Tên sản phẩm"] || "").trim(),
          order_date, shipped,
          return_amount: order_type === "return" ? A : 0,
          cancel_reason: (isCancel && !isReturn) ? (lyDoHuy || trangThai) : null,
          return_fee:    order_type === "return" ? 1620 : (
            order_type === "cancel" && /giao hàng thất bại|failed/i.test(lyDoHuy) ? 1620 : 0
          ),
        }
      }
      // TikTok
      if (platform === "tiktok") {
        const orderId = String(r["Order ID"] || "").trim()
        if (!orderId || orderId.length < 10 || !/^\d+$/.test(orderId)) return null
        const status     = String(r["Order Status"] || "").toLowerCase()
        const cancelType = String(r["Cancelation/Return Type"] || "")
        let order_type   = "normal"
        if (status === "cancelled" || cancelType === "Cancel") order_type = "cancel"
        if (cancelType === "Return/Refund") order_type = "return"
        const subtotal   = Number(r["SKU Subtotal After Discount"] || 0)
        const platDisc   = Number(r["SKU Platform Discount"] || 0)
        const revenue    = order_type === "normal" ? subtotal + platDisc : 0
        const cancelReason = String(r["Cancel Reason"] || cancelType || "")
        const isFailed   = /giao gói hàng thất bại|failed delivery/i.test(cancelReason)
        const dateRaw    = String(r["Created Time"] || "")
        const dm2 = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        const order_date = dm2 ? `${dm2[3]}-${dm2[2].padStart(2,"0")}-${dm2[1].padStart(2,"0")}` : ""
        const shipped    = !!String(r["Tracking ID"] || r["Shipped Time"] || "").trim()
        return {
          platform, shop,
          order_id:      orderId,
          order_type,
          qty:           Math.max(1, Math.floor(Number(r["Quantity"] || 1))),
          revenue,
          raw_revenue:   subtotal + platDisc,
          sku:           String(r["Seller SKU"] || "").trim(),
          product_name:  String(r["Product Name"] || "").trim(),
          order_date, shipped,
          return_amount: order_type === "return" ? (Number(r["Order Refund Amount"] || 0) || revenue) : 0,
          cancel_reason: cancelReason || null,
          return_fee:    order_type === "return" ? 4620 : (order_type === "cancel" && isFailed ? 1620 : 0),
          shopee_voucher: 0, shop_discount: 0, combo_discount: 0,
        }
      }
      return null
    }).filter(Boolean)

    // Gộp dòng trùng order_id + sku
    const map = new Map()
    for (const o of payload) {
      const key = o.order_id + "||" + o.sku
      if (!map.has(key)) { map.set(key, { ...o }) }
      else {
        const e = map.get(key)
        e.qty           = (e.qty || 0) + (o.qty || 0)
        e.revenue       = (e.revenue || 0) + (o.revenue || 0)
        e.raw_revenue   = (e.raw_revenue || 0) + (o.raw_revenue || 0)
        e.return_amount = (e.return_amount || 0) + (o.return_amount || 0)
        e.shopee_voucher= (e.shopee_voucher || 0) + (o.shopee_voucher || 0)
        e.shop_discount = (e.shop_discount || 0) + (o.shop_discount || 0)
        e.combo_discount= (e.combo_discount || 0) + (o.combo_discount || 0)
      }
    }

    // fillFirstSku
    const seen = new Set()
    const orders = [...map.values()].map(o => {
      const isFirst = !seen.has(o.order_id)
      if (o.order_type !== "cancel") seen.add(o.order_id)
      return { ...o, is_first_sku: isFirst }
    })

    log.innerHTML = `📦 ${orders.length} dòng sau xử lý, đang upload...`

    const res    = await fetch(API + "/api/import-orders", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(orders)
    })
    const result = await res.json()

    log.innerHTML = `✅ Import thành công — ${result.imported} dòng!`
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

async function populateOrderShops() {
  const plt = document.getElementById("o_platform").value
  const sel = document.getElementById("o_shop")
  try {
    const shops = await fetch(API + "/api/top-shop" + (plt ? `?platform=${plt}` : "")).then(r => r.json())
    const names = [...new Set(shops.map(s => s.shop))].filter(Boolean).sort()
    sel.innerHTML = '<option value="">Tất cả shop</option>'
      + names.map(s => `<option value="${s}">${s}</option>`).join("")
  } catch(e) {
    sel.innerHTML = '<option value="">Tất cả shop</option>'
  }
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
