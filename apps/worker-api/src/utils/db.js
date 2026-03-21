// Lấy toàn bộ cost_settings thành object key→value
async function getCostSettings(env) {
  const rows = await env.DB.prepare(`SELECT cost_key, cost_value, cost_type FROM cost_settings`).all()
  const cfg = {}
  for (const r of rows.results) {
    cfg[r.cost_key] = { value: r.cost_value, type: r.cost_type }
  }
  return cfg
}

// Tính tất cả phí và lợi nhuận từ 1 order row + cost settings
function calcProfit(order, cfg) {
  const rev = order.revenue || 0
  const qty = order.qty     || 1

  const platform = order.platform || "unknown"

 // ── Phí Shopee ───────────────────────────────────────────────────
  const shopeeCommission = platform === "shopee" ? rev * pct(cfg, "shopee_platform_fee") : 0
  const shopeePayment    = platform === "shopee" ? rev * pct(cfg, "shopee_payment_fee")  : 0
  const shopeeAffiliate  = platform === "shopee" ? rev * pct(cfg, "shopee_affiliate")    : 0
  const shopeeAds        = platform === "shopee" ? rev * pct(cfg, "shopee_ads")          : 0

  // ── Phí TikTok ───────────────────────────────────────────────────
  // Ưu tiên dùng phí thực từ tiktok_order_fees (nếu có, được truyền vào order)
  // Fallback: tính theo % từ cost_settings
  const hasTiktokReal = platform === "tiktok" && order._fee_real === true
  const tiktokCommission  = platform === "tiktok"
    ? (hasTiktokReal ? (order._fee_commission || 0) : rev * pct(cfg, "tiktok_commission"))
    : 0
  const tiktokTransaction = platform === "tiktok"
    ? (hasTiktokReal ? (order._fee_payment    || 0) : rev * pct(cfg, "tiktok_transaction_fee"))
    : 0
  const tiktokAffiliate   = platform === "tiktok"
    ? (hasTiktokReal ? (order._fee_affiliate  || 0) : rev * pct(cfg, "tiktok_affiliate"))
    : 0
  const tiktokAds         = platform === "tiktok"
    ? (hasTiktokReal ? (order._fee_ads        || 0) : rev * pct(cfg, "tiktok_ads"))
    : 0

  // ── Phí Lazada ───────────────────────────────────────────────────
  const lazadaCommission   = platform === "lazada" ? rev * pct(cfg, "lazada_commission")    : 0
  const lazadaHandling     = platform === "lazada" ? rev * pct(cfg, "lazada_handling_fee")  : 0
  const lazadaVat          = platform === "lazada" ? rev * pct(cfg, "lazada_vat")           : 0
  const lazadaPit          = platform === "lazada" ? rev * pct(cfg, "lazada_pit")           : 0
  const lazadaShippingDiff = platform === "lazada" ? rev * pct(cfg, "lazada_shipping_diff") : 0
  const lazadaAds          = platform === "lazada" ? rev * pct(cfg, "lazada_ads")           : 0

// ── Phí per đơn — chỉ tính dòng đầu tiên ────────────────────────
  const isFirstSku = order.is_first_sku === true || order.is_first_sku === 1
  const notCancel  = order.order_type !== "cancel"

  // ── Phí cố định (per đơn, không nhân qty) ────────────────────────
  const packFee  = 0
  const opFee    = 0
  const laborFee = 0

  // Shopee: PiShip + Service fee
  const pishipFee = (platform === "shopee" && isFirstSku && notCancel)
                      ? num(cfg, "shopee_piship") : 0
  const svcFee    = (platform === "shopee" && isFirstSku && notCancel)
                      ? num(cfg, "shopee_service_fee") : 0

  // TikTok: SFR + Handling fee
  const tiktokSfr      = (platform === "tiktok" && isFirstSku && notCancel)
    ? (hasTiktokReal ? (order._fee_service || 0) : num(cfg, "tiktok_sfr"))
    : 0
  const tiktokHandling = (platform === "tiktok" && isFirstSku && notCancel)
    ? (hasTiktokReal ? (order._fee_handling || 0) : num(cfg, "tiktok_handling_fee"))
    : 0

  // Lazada: phí xử lý đơn hàng cố định per-order (từ cost settings)
  const lazadaServiceFee = (platform === "lazada" && isFirstSku && notCancel)
                           ? num(cfg, "lazada_service_fee") : 0

  // ── Gộp tất cả phí ───────────────────────────────────────────────
  const platformFee  = shopeeCommission + tiktokCommission + lazadaCommission
  const paymentFee   = shopeePayment    + tiktokTransaction
  const affiliateFee = shopeeAffiliate  + tiktokAffiliate
  const adsFee       = shopeeAds        + tiktokAds        + lazadaAds

const totalFee = platformFee + paymentFee + affiliateFee + adsFee
                 + lazadaHandling + lazadaVat + lazadaPit + lazadaShippingDiff
                 + packFee + opFee + laborFee
                 + pishipFee + svcFee
                 + tiktokSfr + tiktokHandling
                 + lazadaServiceFee

const costInvoice = (order.cost_invoice || 0) * qty
  const costReal    = (order.cost_real    || 0) * qty

  // Đơn hủy thông thường: không mất gì cả → toàn bộ = 0
  // Chỉ tính phí nếu là đơn hủy giao thất bại (có return_fee > 0)
  const isNormal       = order.order_type === 'normal'
  const isReturn       = order.order_type === 'return'
  const isCancel       = order.order_type === 'cancel'
  const isCancelWithFee = isCancel && (order.return_fee || 0) > 0

  if (isCancel && !isCancelWithFee) {
    // Hủy thông thường: không mất gì
    return {
      revenue: 0, total_fee: 0,
      cost_invoice: 0, cost_real: 0,
      profit_invoice: 0, profit_real: 0,
      tax_flat: 0, tax_income: 0,
      profit_after_tax: 0,
      fee_platform: 0, fee_payment: 0, fee_affiliate: 0, fee_ads: 0,
      fee_piship: 0, fee_service: 0,
      fee_packaging: 0, fee_operation: 0, fee_labor: 0,
    }
  }

  if (isCancelWithFee || isReturn) {
    // Hủy giao thất bại hoặc hoàn hàng: mất return_fee + phí đóng gói nếu đã gửi
    const fee  = order.return_fee || 0
    const pack = order.shipped ? packFee : 0
    const total = fee + pack
    return {
      revenue: 0, total_fee: total,
      cost_invoice: 0, cost_real: 0,
      profit_invoice: -total, profit_real: -total,
      tax_flat: 0, tax_income: 0,
      profit_after_tax: -total,
      fee_platform: 0, fee_payment: 0, fee_affiliate: 0, fee_ads: 0,
      fee_piship: fee, fee_service: 0,
      fee_packaging: pack, fee_operation: 0, fee_labor: 0,
    }
  }

  // Phí có hóa đơn (không gồm vận hành)
  const feeWithInvoice = totalFee - packFee - opFee - laborFee

  // Lãi HĐ = doanh thu - vốn HĐ - phí có HĐ
  const profitInvoice = rev - costInvoice - feeWithInvoice

  // Lãi Thực = doanh thu - vốn Thực - phí
  const profitReal = rev - costReal - totalFee

  // Thuế khoán 1.5% trên doanh thu
  const taxFlat = isNormal ? rev * 0.015 : 0

  // Thuế lợi nhuận 17% trên Lãi HĐ (chỉ khi lãi > 0)
  const taxIncome = (isNormal && profitInvoice > 0) ? profitInvoice * 0.17 : 0
  // Lưu ý: taxIncome tính trên profitInvoice đã loại phí vận hành

  return {
    revenue:         rev,
    total_fee:       totalFee,
    cost_invoice:    costInvoice,
    cost_real:       costReal,
    profit_invoice:  profitInvoice,
    profit_real:     profitReal,
    tax_flat:        taxFlat,
    tax_income:      taxIncome,
    profit_after_tax: profitReal - taxFlat - taxIncome,
    // Chi tiết từng loại phí
    fee_platform:    platformFee,
    fee_payment:     paymentFee,
    fee_affiliate:   affiliateFee,
    fee_ads:         adsFee,
    fee_piship:      pishipFee + tiktokSfr,
    fee_service:     svcFee + tiktokHandling + lazadaHandling + lazadaServiceFee,
    fee_packaging:   packFee,
    fee_operation:   opFee,
    fee_labor:       laborFee,
  }
}

function pct(cfg, key) {
  return cfg[key] ? (cfg[key].value / 100) : 0
}
function num(cfg, key) {
  return cfg[key] ? cfg[key].value : 0
}

export { getCostSettings, calcProfit, pct, num }