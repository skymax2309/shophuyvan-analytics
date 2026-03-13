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

// Đánh dấu dòng SKU đầu tiên của mỗi đơn để tính phí per-đơn
// is_first_sku = true  → tính phí PiShip + DV
// is_first_sku = false → không tính (tránh nhân đôi)
export function fillFirstSku(orders) {
  const seen = new Set()
  return orders.map(o => {
    const isFirst = !seen.has(o.order_id)
    if (o.order_type !== "cancel") seen.add(o.order_id)
    return { ...o, is_first_sku: isFirst }
  })
}

// Sau khi parse xong toàn bộ orders, gọi hàm này để điền sku_count
export function fillSkuCount(orders) {
  // Đếm số dòng SKU per order_id (chỉ đơn không hủy)
  const countMap = {}
  orders.forEach(o => {
    if (o.order_type !== "cancel") {
      countMap[o.order_id] = (countMap[o.order_id] || 0) + 1
    }
  })
  // Gán sku_count vào từng order
  return orders.map(o => ({
    ...o,
    sku_count: countMap[o.order_id] || 1
  }))
}


// ════════════════════════════════════════════════════════════════════
// SHOPEE
// ════════════════════════════════════════════════════════════════════
function _shopee(row, shop) {
  const order_id = _str(row["Mã đơn hàng"])
  if (!order_id) return null

  // ── Phân loại trạng thái theo logic chuẩn ──────────────────────
  const trang_thai_don   = _str(row["Trạng Thái Đơn Hàng"])
  const tra_hang_str     = _str(row["Trạng thái Trả hàng/Hoàn tiền"])
  const ly_do_huy        = _str(row["Lý do hủy"])

  // C. Đơn hủy: cột "Trạng Thái Đơn Hàng" = "Đã hủy" (exact)
  const is_cancel = trang_thai_don === "Đã hủy" || ly_do_huy !== ""

  // B. Đơn hoàn: cột "Trạng thái Trả hàng/Hoàn tiền" chứa các từ khóa
  const is_return = /hoàn tiền|trả hàng|chấp thuận/i.test(tra_hang_str)

  let order_type = "normal"
  if (is_cancel) order_type = "cancel"
  if (is_return) order_type = "return"   // return ưu tiên hơn cancel

  // ── Doanh thu thực tế (Net Revenue) theo công thức chuẩn ────────
  // [A] Tổng giá bán sản phẩm
  const A = _num(row["Tổng giá bán (sản phẩm)"])

  // [B] Voucher Shopee hoàn lại (Shopee trả thay khách)
  const B = _num(row["Mã giảm giá của Shopee"])

  // [C] Trợ giá từ Shopee = "Được Shopee trợ giá" × số lượng
  const shopee_subsidy = _num(row["Được Shopee trợ giá"])
  const qty            = _int(row["Số lượng"])
  const C = shopee_subsidy * qty

  // [D] Tiền hoàn (chỉ tính cho đơn return)
  const D = order_type === "return" ? A : 0

  // [AF] Mã giảm giá của Shop (trừ ra)
  const AF = _num(row["Mã giảm giá của Shop"])

  // [AK] Giảm giá từ Combo của Shop (trừ ra)
  const AK = _num(row["Giảm giá từ Combo của Shop"])

  // ── Net Revenue per dòng ─────────────────────────────────────────
  // Đơn thành công : A + B + C - AF - AK  (chưa trừ D, D tính tổng hợp)
  // Đơn hoàn       : lưu A vào return_amount để tổng hợp trừ sau
  // Đơn hủy        : 0 hoàn toàn
  const line_revenue = (order_type === "normal") ? (A + B + C - AF - AK) : 0
  const return_amount = (order_type === "return") ? A : 0   // [D] per dòng

  return {
    platform:         "shopee",
    shop,
    order_id,
    order_date:       _date(_str(row["Ngày đặt hàng"])),
    product_name:     _str(row["Tên sản phẩm"]),
    sku:              _str(row["SKU phân loại hàng"]),
    qty,
    revenue:          line_revenue,
    raw_revenue:      A,
    shopee_voucher:   B,
    shopee_subsidy:   C,
    shop_discount:    AF,
    combo_discount:   AK,
    return_amount,              // [D] — dùng để tổng hợp trừ ở index.html
    order_type,
    cancel_reason:    is_cancel ? (ly_do_huy || trang_thai_don) : null,
    return_fee:       order_type === "return"
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