// =====================================================================
// parser.js — Chuẩn hóa đơn hàng từ Shopee, TikTok, Lazada
// =====================================================================

// Đọc tên sàn và tên shop từ tên file
// Ví dụ: "KHOGIADUNGHUYVAN_Shopee_T02.xlsx" → platform=shopee, shop=KHOGIADUNGHUYVAN
// Ví dụ: "ShopHuyVan_Tiktok_T02.xlsx"       → platform=tiktok, shop=ShopHuyVan
export function parseFileMeta(filename) {
  const name = filename.replace(/\.xlsx$/i, "")
  const parts = name.split("_")

  let platform = "unknown"
  let shop = parts[0] || "unknown"

  for (const p of parts) {
    const lower = p.toLowerCase()
    if (lower === "shopee")  { platform = "shopee";  break }
    if (lower === "tiktok")  { platform = "tiktok";  break }
    if (lower === "lazada")  { platform = "lazada";  break }
  }

  return { platform, shop }
}


// Phát hiện nền tảng từ header của row (fallback nếu không đọc được tên file)
export function detectPlatform(row) {
  if (row["Mã đơn hàng"])  return "shopee"
  if (row["Order ID"])     return "tiktok"
  if (row["orderNumber"])  return "lazada"
  return "unknown"
}


// =====================================================================
// normalizeOrder
// Trả về object chuẩn, hoặc null nếu không parse được
//
// Trạng thái trả về (order_type):
//   "normal"   — đơn thường, tính doanh thu
//   "cancel"   — đơn hủy, LOẠI khỏi doanh thu
//   "return"   — trả hàng / hoàn tiền, LOẠI khỏi doanh thu, tính chi phí trả hàng
// =====================================================================
export function normalizeOrder(row, meta = {}) {
  const platform = meta.platform || detectPlatform(row)
  const shop     = meta.shop     || "unknown"

  if (platform === "shopee") return _parseShopee(row, shop)
  if (platform === "tiktok") return _parseTiktok(row, shop)
  if (platform === "lazada") return _parseLazada(row, shop)

  return null
}


// ---------------------------------------------------------------------
// SHOPEE
// Hủy   : cột "Lý do hủy" có nội dung
// Trả   : cột "Trạng thái Trả hàng/Hoàn tiền" === "Đã Chấp Thuận Yêu Cầu"
// ---------------------------------------------------------------------
function _parseShopee(row, shop) {
  const order_id     = _str(row["Mã đơn hàng"])
  const order_date   = _str(row["Ngày đặt hàng"])
  const product_name = _str(row["Tên sản phẩm"])
  const sku          = _str(row["SKU phân loại hàng"])
  const qty          = _num(row["Số lượng"])
  const revenue      = _num(row["Tổng giá bán (sản phẩm)"])
  const ly_do_huy    = _str(row["Lý do hủy"])
  const tra_hang     = _str(row["Trạng thái Trả hàng/Hoàn tiền"])
  const phi_tra_hang = _num(row["Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)"])

  if (!order_id) return null

  let order_type = "normal"
  if (ly_do_huy)                               order_type = "cancel"
  if (tra_hang === "Đã Chấp Thuận Yêu Cầu")   order_type = "return"

  return {
    platform:     "shopee",
    shop,
    order_date,
    order_id,
    product_name,
    sku,
    qty,
    revenue:      order_type === "normal" ? revenue : 0,
    order_type,
    cancel_reason: ly_do_huy || null,
    return_fee:   order_type === "return" ? phi_tra_hang : 0,
    raw_revenue:  revenue,
  }
}


// ---------------------------------------------------------------------
// TIKTOK
// Lưu ý: File TikTok có ROW 1 là dòng mô tả cột → lọc bằng cách
//        kiểm tra Order ID là chuỗi số (không phải chữ mô tả)
//
// Hủy   : Cancelation/Return Type === "Cancel"
// Trả   : Cancelation/Return Type === "Return/Refund"
// ---------------------------------------------------------------------
function _parseTiktok(row, shop) {
  const order_id = _str(row["Order ID"])

  // Bỏ qua dòng mô tả (row 1 của file TikTok)
  if (!order_id || order_id.toLowerCase().includes("order") || order_id.length < 10) return null

  const order_date    = _str(row["Created Time"])
  const product_name  = _str(row["Product Name"])
  const sku           = _str(row["Seller SKU"])
  const qty           = _num(row["Quantity"])
  const revenue       = _num(row["Order Amount"])
  const cancel_type   = _str(row["Cancelation/Return Type"])

  let order_type = "normal"
  if (cancel_type === "Cancel")        order_type = "cancel"
  if (cancel_type === "Return/Refund") order_type = "return"

  return {
    platform:     "tiktok",
    shop,
    order_date,
    order_id,
    product_name,
    sku,
    qty,
    revenue:      order_type === "normal" ? revenue : 0,
    order_type,
    cancel_reason: cancel_type || null,
    return_fee:   0,
    raw_revenue:  revenue,
  }
}


// ---------------------------------------------------------------------
// LAZADA
// Lưu ý: Lazada không có cột số lượng riêng → mặc định qty = 1
//        Mỗi dòng là 1 item (orderItemId), nhiều dòng có thể cùng orderNumber
//
// Hủy   : status === "canceled"
// Trả   : status === "Package Returned"
// ---------------------------------------------------------------------
function _parseLazada(row, shop) {
  const order_id     = _str(row["orderNumber"])
  const item_id      = _str(row["orderItemId"])
  const order_date   = _str(row["createTime"])
  const product_name = _str(row["itemName"])
  const sku          = _str(row["sellerSku"])
  const revenue      = _num(row["unitPrice"])
  const status       = _str(row["status"])

  if (!order_id) return null

  let order_type = "normal"
  if (status === "canceled")          order_type = "cancel"
  if (status === "Package Returned")  order_type = "return"

  return {
    platform:     "lazada",
    shop,
    order_date,
    order_id,
    item_id,
    product_name,
    sku,
    qty:          1,
    revenue:      order_type === "normal" ? revenue : 0,
    order_type,
    cancel_reason: order_type !== "normal" ? status : null,
    return_fee:   0,
    raw_revenue:  revenue,
  }
}


// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function _str(val) {
  if (val === null || val === undefined) return ""
  return String(val).trim()
}

function _num(val) {
  if (val === null || val === undefined) return 0
  const n = Number(String(val).replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}