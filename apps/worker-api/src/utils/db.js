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
  const tiktokCommission   = platform === "tiktok" ? rev * pct(cfg, "tiktok_commission")     : 0
  const tiktokTransaction  = platform === "tiktok" ? rev * pct(cfg, "tiktok_transaction_fee"): 0
  const tiktokAffiliate    = platform === "tiktok" ? rev * pct(cfg, "tiktok_affiliate")      : 0
  const tiktokAds          = platform === "tiktok" ? rev * pct(cfg, "tiktok_ads")            : 0

  // ── Phí Lazada ───────────────────────────────────────────────────
  const lazadaCommission   = platform === "lazada" ? rev * pct(cfg, "lazada_commission")    : 0
  const lazadaHandling     = platform === "lazada" ? rev * pct(cfg, "lazada_handling_fee")  : 0
  const lazadaVat          = platform === "lazada" ? rev * pct(cfg, "lazada_vat")           : 0
  const lazadaPit          = platform === "lazada" ? rev * pct(cfg, "lazada_pit")           : 0
  const lazadaShippingDiff = platform === "lazada" ? rev * pct(cfg, "lazada_shipping_diff") : 0
  const lazadaAds          = platform === "lazada" ? rev * pct(cfg, "lazada_ads")           : 0

  // ── Phí cố định chung (per SKU) ──────────────────────────────────
  const packFee  = num(cfg, "packaging") * qty
  const opFee    = num(cfg, "operation") * qty
  const laborFee = num(cfg, "labor")     * qty

  // ── Phí per đơn — chỉ tính dòng đầu tiên ────────────────────────
  const isFirstSku = order.is_first_sku === true || order.is_first_sku === 1
  const notCancel  = order.order_type !== "cancel"

  // Shopee: PiShip + Service fee
  const pishipFee = (platform === "shopee" && isFirstSku && notCancel)
                      ? num(cfg, "shopee_piship") : 0
  const svcFee    = (platform === "shopee" && isFirstSku && notCancel)
                      ? num(cfg, "shopee_service_fee") : 0

  // TikTok: SFR + Handling fee
  const tiktokSfr      = (platform === "tiktok" && isFirstSku && notCancel)
                           ? num(cfg, "tiktok_sfr") : 0
  const tiktokHandling = (platform === "tiktok" && isFirstSku && notCancel)
                           ? num(cfg, "tiktok_handling_fee") : 0

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

  const costInvoice = (order.cost_invoice || 0) * qty
  const costReal    = (order.cost_real    || 0) * qty

  // Phí có hóa đơn (không gồm vận hành)
  const feeWithInvoice = totalFee - packFee - opFee - laborFee

  // Lãi HĐ = doanh thu - vốn HĐ - phí có HĐ (không trừ phí vận hành)
  const profitInvoice = rev - costInvoice - feeWithInvoice

  // Lãi Thực = doanh thu - vốn Thực - phí
  const profitReal    = rev - costReal    - totalFee

  // Thuế khoán 1.5% trên doanh thu
  const taxFlat = (order.order_type === 'normal') ? rev * 0.015 : 0

  // Thuế lợi nhuận 17% trên Lãi HĐ (chỉ khi lãi > 0)
  const taxIncome = (order.order_type === 'normal' && profitInvoice > 0) ? profitInvoice * 0.17 : 0
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
    fee_service:     svcFee + tiktokHandling,
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