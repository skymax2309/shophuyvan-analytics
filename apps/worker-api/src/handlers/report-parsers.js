// ════════════════════════════════════════════════════════════════════
// HELPERS — Parse từng loại báo cáo
// ════════════════════════════════════════════════════════════════════

function detectReportMonth(filename) {
  // Pattern YYYY-MM (có dấu gạch)
  const m1 = filename.match(/(\d{4})-(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}`

  // Pattern YYYYMMDD (8 chữ số liền) — VD: 20260201
  const m2 = filename.match(/(\d{4})(\d{2})\d{2}/)
  if (m2) return `${m2[1]}-${m2[2]}`

  // Pattern YYYY_MM
  const m3 = filename.match(/(\d{4})_(\d{2})/)
  if (m3) return `${m3[1]}-${m3[2]}`

  // Fallback: tháng hiện tại
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

// Extract text từ PDF (dùng text decoder cơ bản — Worker không có pdf-parse)
// Cloudflare Worker có thể đọc text layer của PDF nếu không bị encrypt
async function extractPdfText(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    // Tìm các chuỗi text trong PDF (giữa BT...ET blocks)
    const matches = []
    const re = /\(([^)]{1,200})\)/g
    let m
    while ((m = re.exec(text)) !== null) {
      const s = m[1].replace(/\\n/g, "\n").replace(/\\r/g, "").trim()
      if (s.length > 1) matches.push(s)
    }
    return matches.join("\n")
  } catch {
    return ""
  }
}

async function extractExcelText(arrayBuffer) {
  // Trả về raw bytes để parse bên ngoài
  // Worker không có thư viện xlsx — dùng cách khác: client parse rồi gửi JSON
  return ""
}

// ── Detect loại hóa đơn + parse tương ứng ────────────────────────────
function autoDetectAndParse(text, platform, reportType) {
  console.log("[autoDetectAndParse] platform:", platform, "reportType:", reportType,
    "hasShopee:", text.includes("CÔNG TY TNHH SHOPEE"),
    "has1K26TAC:", text.includes("1K26TAC"),
    "hasDauThau:", text.includes("đấu thầu"),
    "textLen:", text.length)

  // Shopee VAT Invoice (do Công ty TNHH Shopee xuất)
  if (text.includes("CÔNG TY TNHH SHOPEE") || text.includes("1K26TAC")) {
    console.log("[autoDetectAndParse] → parseShopeeExpenseInvoice")
    return parseShopeeExpenseInvoice(text)
  }
  // Fallback theo reportType từ tên file (phi-dau-thau, phi-san, phi-rut-tien)
  if (reportType && reportType.startsWith("phi-") && platform === "shopee") {
    console.log("[autoDetectAndParse] → parseShopeeExpenseInvoice (by reportType fallback)")
    return parseShopeeExpenseInvoice(text)
  }
  // TikTok Tax Invoice
  if (text.includes("TIKTOK PTE") || text.includes("VNEC") || text.includes("Tokgistic")) {
    return parseTiktokExpenseInvoice(text)
  }
  // Lazada
  if (text.includes("RECESS") || text.includes("VN33W4TIY8") || text.includes("Lazada")) {
    return parseLazadaExpenseInvoice(text)
  }
  // Shopee doanh thu
  if (platform === "shopee") return parseShopeeReport(text)
  if (platform === "lazada") return parseLazadaReport(text)
  return {}
}

// Shopee VAT Invoice — hóa đơn chi phí (phí HH, phí giao dịch, PiShip, đấu thầu, rút tiền...)
function parseShopeeExpenseInvoice(text) {
  const findAmt = (label) => {
    const re = new RegExp(label + "[\\s\\S]{0,200}?([\\d\\.]+(?:\\.[\\d]+)?)[\\s]*(?=\\d{1,2}%|Cộng tiền)", "i")
    const m = text.match(re)
    if (m) return parseInt(m[1].replace(/\./g, "")) || 0
    return 0
  }

  // Tìm "Cộng tiền hàng (Sub total): X"
  const subMatch = text.match(/Cộng tiền hàng[^:]*:\s*([\d\.,]+)/)
  const vatMatch = text.match(/Tiền thuế GTGT[^:]*:\s*([\d\.,]+)/)
  const totalMatch = text.match(/Tổng cộng tiền thanh toán[^:]*:\s*([\d\.,]+)/)

  const sub   = subMatch  ? parseInt(subMatch[1].replace(/[\.]/g, "")) : 0
  const vat   = vatMatch  ? parseInt(vatMatch[1].replace(/[\.]/g, "")) : 0
  const total = totalMatch? parseInt(totalMatch[1].replace(/[\.]/g, "")): 0

  // Tìm từng dòng phí
  const commission  = findAmtLine(text, "Phí hoa hồng cố định")
  const transaction = findAmtLine(text, "Phí xử lý giao dịch")
  const service     = findAmtLine(text, "Phí dịch vụ ")
  const piship      = findAmtLine(text, "Phí dịch vụ PiShip")
  const ads         = findAmtLine(text, "Phí dịch vụ đấu thầu")
  const withdrawal  = findAmtLine(text, "Phí rút tiền")

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: 0,
    fee_commission:  commission,
    fee_payment:     transaction,
    fee_service:     service,
    fee_affiliate:   0,
    fee_piship_sfr:  piship,
    fee_handling:    withdrawal,
    fee_ads:         ads,
    fee_total:       sub > 0 ? sub : (commission + transaction + service + piship + ads + withdrawal),
    compensation:    0,
    tax_vat:         vat,
    tax_pit:         0,
    tax_total:       vat,
    total_payout:    -total,
  }
}

// TikTok Tax Invoice — hóa đơn chi phí platform + logistics
function parseTiktokExpenseInvoice(text) {
  const findAmt = (label) => {
    const re = new RegExp(label + "[^\\d]*([\\.\\d]+)[^\\d]*([\\.\\d]+)[^\\d]*([\\.\\d]+)")
    const m = text.match(re)
    // Cột 1: excl tax, cột 2: tax, cột 3: incl tax
    if (m) return parseInt(m[1].replace(/\./g, "")) || 0
    return 0
  }

  const subtotalMatch = text.match(/Subtotal \(excluding Tax\)[^\d]*([\d\.,]+)/)
  const taxMatch      = text.match(/Total Tax[^\d]*([\d\.,]+)/)
  const totalMatch    = text.match(/Total Amount[^\d]*([\d\.,]+)/)

  const sub   = subtotalMatch ? parseInt(subtotalMatch[1].replace(/[,\.]/g, "").slice(0,-3) + subtotalMatch[1].replace(/[,\.]/g,"").slice(-3)) : 0
  const tax   = taxMatch      ? parseInt(taxMatch[1].replace(/[,\.]/g,"").slice(0,-3)       + taxMatch[1].replace(/[,\.]/g,"").slice(-3))       : 0
  const total = totalMatch    ? parseInt(totalMatch[1].replace(/[,\.]/g,"").slice(0,-3)      + totalMatch[1].replace(/[,\.]/g,"").slice(-3))      : 0

  const isLogistics = text.includes("Tokgistic") || text.includes("Logistics fee") || text.includes("delivery shipping fee")
  const commission  = text.includes("commission fee") ? findAmt("TikTok Shop commission fee") : 0
  const transaction = text.includes("Transaction fee") ? findAmt("Transaction fee") : 0
  const sfr         = text.includes("SFR service fee") ? findAmt("SFR service fee") : 0
  const handling    = text.includes("Order Processing Fee") ? findAmt("Order Processing Fee") : 0
  const shipping    = isLogistics ? sub : 0

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: isLogistics ? -shipping : 0,
    fee_commission:  commission,
    fee_payment:     transaction,
    fee_service:     sfr,
    fee_affiliate:   0,
    fee_piship_sfr:  sfr,
    fee_handling:    handling,
    fee_total:       sub,
    compensation:    0,
    tax_vat:         tax,
    tax_pit:         0,
    tax_total:       tax,
    total_payout:    -total,
  }
}

// Lazada VAT Invoice (do RECESS xuất) — phí theo tuần
function parseLazadaExpenseInvoice(text) {
  text = text.normalize("NFC")
  const findLine = (label) => {
    const re = new RegExp(label + "[ \\t]{1,200}(\\d{1,3}(?:\\.\\d{3})+)")
    const m = text.match(re)
    if (!m) return 0
    return parseInt(m[1].replace(/\./g, "")) || 0
  }

  const subMatch   = text.match(/Cộng tiền hàng[^:]*:\s*([\d\.,]+)/)
  const vatMatch   = text.match(/Tiền thuế GTGT[^(VAT)]*:\s*([\d\.,]+)/)
  const totalMatch = text.match(/Tổng cộng tiền hàng[^:]*:\s*([\d\.,]+)/)

  const sub   = subMatch   ? parseInt(subMatch[1].replace(/\./g,""))   : 0
  const vat   = vatMatch   ? parseInt(vatMatch[1].replace(/\./g,""))   : 0
  const total = totalMatch ? parseInt(totalMatch[1].replace(/\./g,"")) : 0

  const handling   = findLine("Phí Xử lý đơn hàng")
  const shipping   = findLine("Phí Vận Chuyển")
  const commission = findLine("Phí Cố Định")

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net:    0,
    fee_commission:  commission,
    fee_payment:     shipping,
    fee_service:     0,
    fee_affiliate:   0,
    fee_piship_sfr:  0,
    fee_handling:    handling,
    fee_total:       total,
    compensation:    0,
    tax_vat:         vat,
    tax_pit:         0,
    tax_total:       vat,
    total_payout:    -total,
  }
}

function findAmtLine(text, label) {
  const re = new RegExp(label + "[\\s\\S]{0,100}?([\\d]{1,3}(?:\\.[\\d]{3})+)")
  const m = text.match(re)
  if (!m) return 0
  return parseInt(m[1].replace(/\./g, "")) || 0
}

// ── Parser Shopee PDF ────────────────────────────────────────────────
function parseShopeeReport(text) {
  const n = (pattern) => {
    const m = text.match(pattern)
    return m ? parseFloat(m[1].replace(/[,\.]/g, "").replace(/(\d+)$/, "$1")) : 0
  }

  // Tìm số sau label — cần xử lý format số VNĐ
  const findNum = (label) => {
    const re = new RegExp(label + "[\\s\\S]{0,50}?([\\d,\\.]+)")
    const m = text.match(re)
    if (!m) return 0
    return parseInt(m[1].replace(/[,.]/g, "").replace(/(\d+)$/, (s) => s)) || 0
  }

  const gross_revenue       = findNum("Giá sản phẩm")
  const refund_amount       = findNum("Số tiền hoàn lại")
  const platform_subsidy    = findNum("Sản phẩm được trợ giá từ Shopee")
  const co_funded_voucher   = findNum("Mã ưu đãi Đồng Tài Trợ do Người Bán chịu")
  const fee_commission      = findNum("Phí cố định")
  const fee_service         = findNum("Phí Dịch Vụ")
  const fee_payment         = findNum("Phí thanh toán")
  const fee_affiliate       = findNum("Phí hoa hồng Tiếp thị liên kết")
  const fee_piship_sfr      = findNum("Phí dịch vụ PiShip")
  const fee_handling        = 0
  const fee_ads             = 0
  const fee_total           = fee_commission + fee_service + fee_payment + fee_affiliate + fee_piship_sfr
  const tax_vat             = findNum("Thuế GTGT")
  const tax_pit             = findNum("Thuế TNCN")
  const tax_total           = tax_vat + tax_pit
  const total_payout        = findNum("Tổng thanh toán đã chuyển")
  const net_product_revenue = gross_revenue - refund_amount + platform_subsidy - co_funded_voucher

  return {
    gross_revenue, refund_amount, net_product_revenue,
    platform_subsidy, seller_voucher: 0, co_funded_voucher,
    shipping_net: 0,
    fee_commission, fee_payment, fee_service,
       fee_affiliate, fee_piship_sfr, fee_handling, fee_ads, fee_total,
    compensation: 0,
    tax_vat, tax_pit, tax_total,
    total_payout,
  }
}

// ── Parser Lazada PDF ────────────────────────────────────────────────
function parseLazadaReport(text) {
  const findNum = (label) => {
    const re = new RegExp(label + "[\\s\\S]{0,80}?([\\d,\\.]+(?:\\.\\d{2})?)")
    const m = text.match(re)
    if (!m) return 0
    return parseFloat(m[1].replace(/,/g, "")) || 0
  }

  const gross_revenue  = findNum("Giá trị sản phẩm")
  const fee_commission = findNum("Phí cố định")
  const fee_handling   = findNum("Phí xử lý đơn hàng")
  const shipping_net   = findNum("Điều chỉnh phí vận chuyển chênh lệch")
  const compensation   = findNum("Bồi thường đơn hàng thất lạc")
  const tax_vat        = findNum("Thuế GTGT nhà bán hàng")
  const tax_pit        = findNum("Thuế TNCN nhà bán hàng")
  const tax_total      = tax_vat + tax_pit
  const fee_total      = fee_commission + fee_handling
  const total_payout   = findNum("Tổng thanh toán")

  return {
    gross_revenue, refund_amount: 0, net_product_revenue: gross_revenue,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: -shipping_net,
    fee_commission, fee_payment: 0, fee_service: 0,
    fee_affiliate: 0, fee_piship_sfr: 0, fee_handling, fee_total,
    compensation,
    tax_vat, tax_pit, tax_total,
    total_payout,
  }
}

// ── Parser TikTok (Excel đã được client convert sang JSON) ───────────
function parseTiktokReport(data) {
  // data là object JSON từ client parse Excel
  return {
    gross_revenue:       data.gross_revenue       || 0,
    refund_amount:       data.refund_amount        || 0,
    net_product_revenue: data.net_product_revenue  || 0,
    platform_subsidy:    data.platform_subsidy     || 0,
    seller_voucher:      0,
    co_funded_voucher:   0,
    shipping_net:        data.shipping_net         || 0,
    fee_commission:      data.fee_commission       || 0,
    fee_payment:         data.fee_payment          || 0,
    fee_service:         data.fee_service          || 0,
    fee_affiliate:       data.fee_affiliate        || 0,
    fee_piship_sfr:      data.fee_piship_sfr       || 0,
    fee_handling:        data.fee_handling         || 0,
    fee_total:           data.fee_total            || 0,
    compensation:        0,
    tax_vat:             data.tax_vat              || 0,
    tax_pit:             data.tax_pit              || 0,
    tax_total:           data.tax_total            || 0,
    total_payout:        data.total_payout         || 0,
  }
}

export { detectReportMonth, extractPdfText, autoDetectAndParse,
         parseShopeeReport, parseLazadaReport, parseTiktokReport,
         parseShopeeExpenseInvoice, parseTiktokExpenseInvoice,
         parseLazadaExpenseInvoice, findAmtLine }