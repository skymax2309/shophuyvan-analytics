// =====================================================================
// parser.js
// Nguyên tắc: Excel raw → chuẩn hóa toàn bộ → JSON sạch → Worker → D1
// Output của normalizeOrder luôn đảm bảo:
//   - order_date  : YYYY-MM-DD
//   - revenue     : số nguyên (VNĐ)
//   - qty         : số nguyên
//   - sku         : string trim
//   - order_id    : string trim
//   - order_type  : "normal" | "cancel" | "return"
//   - platform    : "shopee" | "tiktok" | "lazada"
//   - shop        : string (từ tên file)
// =====================================================================


// ── 1. ĐỌC META TỪ TÊN FILE ─────────────────────────────────────────
export function parseFileMeta(filename) {
  const name  = filename.replace(/\.xlsx$/i, "")
  const parts = name.split("_")
  let platform = "unknown"
  let shop     = parts[0] || "unknown"

  for (const p of parts) {
    const l = p.toLowerCase()
    if (l === "shopee") { platform = "shopee"; break }
    if (l === "tiktok") { platform = "tiktok"; break }
    if (l === "lazada") { platform = "lazada"; break }
  }

  return { platform, shop }
}


// ── 2. DETECT PLATFORM (fallback) ───────────────────────────────────
export function detectPlatform(row) {
  if (row["Mã đơn hàng"])  return "shopee"
  if (row["Order ID"])     return "tiktok"
  if (row["orderNumber"])  return "lazada"
  return "unknown"
}


// ── 3. NORMALIZE ORDER ───────────────────────────────────────────────
export function normalizeOrder(row, meta = {}) {
  const platform = meta.platform || detectPlatform(row)
  const shop     = meta.shop     || "unknown"

  if (platform === "shopee") return _shopee(row, shop)
  if (platform === "tiktok") return _tiktok(row, shop)
  if (platform === "lazada") return _lazada(row, shop)
  return null
}


// ════════════════════════════════════════════════════════════════════
// SHOPEE
// ════════════════════════════════════════════════════════════════════
function _shopee(row, shop) {
  const order_id = _str(row["Mã đơn hàng"])
  if (!order_id) return null

  const ly_do_huy = _str(row["Lý do hủy"])
  const tra_hang  = _str(row["Trạng thái Trả hàng/Hoàn tiền"])

  let order_type = "normal"
  if (ly_do_huy)                               order_type = "cancel"
  if (tra_hang === "Đã Chấp Thuận Yêu Cầu")   order_type = "return"

  const raw_revenue = _num(row["Tổng giá bán (sản phẩm)"])

  return {
    platform:      "shopee",
    shop,
    order_id,
    order_date:    _date(_str(row["Ngày đặt hàng"])),
    product_name:  _str(row["Tên sản phẩm"]),
    sku:           _str(row["SKU phân loại hàng"]),
    qty:           _int(row["Số lượng"]),
    revenue:       order_type === "normal" ? raw_revenue : 0,
    raw_revenue,
    order_type,
    cancel_reason: ly_do_huy || null,
    return_fee:    order_type === "return"
                     ? _num(row["Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)"])
                     : 0,
  }
}


// ════════════════════════════════════════════════════════════════════
// TIKTOK
// ════════════════════════════════════════════════════════════════════
function _tiktok(row, shop) {
  const order_id = _str(row["Order ID"])

  // Bỏ qua dòng mô tả (row 1 của file TikTok)
  if (!order_id || order_id.length < 10 || !/^\d+$/.test(order_id)) return null

  const cancel_type = _str(row["Cancelation/Return Type"])

  let order_type = "normal"
  if (cancel_type === "Cancel")        order_type = "cancel"
  if (cancel_type === "Return/Refund") order_type = "return"

  const raw_revenue = _num(row["Order Amount"])

  return {
    platform:      "tiktok",
    shop,
    order_id,
    order_date:    _date(_str(row["Created Time"])),
    product_name:  _str(row["Product Name"]),
    sku:           _str(row["Seller SKU"]),
    qty:           _int(row["Quantity"]),
    revenue:       order_type === "normal" ? raw_revenue : 0,
    raw_revenue,
    order_type,
    cancel_reason: cancel_type || null,
    return_fee:    0,
  }
}


// ════════════════════════════════════════════════════════════════════
// LAZADA
// ════════════════════════════════════════════════════════════════════
function _lazada(row, shop) {
  const order_id = _str(row["orderNumber"])
  if (!order_id) return null

  const status = _str(row["status"]).toLowerCase()

  let order_type = "normal"
  if (status === "canceled")          order_type = "cancel"
  if (status === "package returned")  order_type = "return"

  const raw_revenue = _num(row["unitPrice"])

  return {
    platform:      "lazada",
    shop,
    order_id,
    item_id:       _str(row["orderItemId"]),
    order_date:    _date(_str(row["createTime"])),
    product_name:  _str(row["itemName"]),
    sku:           _str(row["sellerSku"]),
    qty:           1,
    revenue:       order_type === "normal" ? raw_revenue : 0,
    raw_revenue,
    order_type,
    cancel_reason: order_type !== "normal" ? status : null,
    return_fee:    0,
  }
}


// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

// String sạch
function _str(val) {
  if (val === null || val === undefined) return ""
  return String(val).trim()
}

// Số thực → làm tròn VNĐ nguyên
function _num(val) {
  if (val === null || val === undefined) return 0
  const n = Number(String(val).replace(/[,\s]/g, ""))
  return isNaN(n) ? 0 : Math.round(n)
}

// Số nguyên, tối thiểu 1
function _int(val) {
  return Math.max(1, Math.floor(_num(val)))
}

// Ngày → YYYY-MM-DD
// Hỗ trợ:
//   DD/MM/YYYY hoặc DD/MM/YYYY HH:MM:SS  (Shopee, TikTok)
//   DD Mon YYYY HH:MM                     (Lazada: "28 Feb 2026 23:30")
//   YYYY-MM-DD                            (ISO, giữ nguyên)
function _date(val) {
  if (!val) return ""

  // DD/MM/YYYY...
  const m1 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`

  // DD Mon YYYY... (Lazada)
  const MONTHS = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"
  }
  const m2 = val.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
  if (m2) return `${m2[3]}-${MONTHS[m2[2].toLowerCase()]||"01"}-${m2[1].padStart(2,"0")}`

  // YYYY-MM-DD
  const m3 = val.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m3) return m3[1]

  return ""
}