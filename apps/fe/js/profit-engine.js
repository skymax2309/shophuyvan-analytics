// =====================================================================
// profit-engine.js — Tính lợi nhuận phía client (dùng trong dashboard)
// =====================================================================

export function calculateProfit(order, cfg) {
  const rev = order.revenue || 0
  const qty = order.qty     || 1
  const platform = order.platform || "unknown"

  const platformFee  = rev * pct(cfg, `${platform}_platform_fee`)
  const adsFee       = rev * pct(cfg, `${platform}_ads`)
  const affiliateFee = rev * pct(cfg, `${platform}_affiliate`)
  const packFee      = num(cfg, "packaging") * qty
  const opFee        = num(cfg, "operation") * qty
  const laborFee     = num(cfg, "labor")     * qty

  const totalFee = platformFee + adsFee + affiliateFee + packFee + opFee + laborFee

  const costInvoice   = (order.cost_invoice || 0) * qty
  const costReal      = (order.cost_real    || 0) * qty

  const profitInvoice = rev - costInvoice - totalFee
  const profitReal    = rev - costReal    - totalFee

  const taxFlat       = rev * 0.015
  const taxIncome     = profitInvoice > 0 ? profitInvoice * 0.17 : 0
  const profitAfterTax = profitReal - taxFlat - taxIncome

  return {
    revenue:          rev,
    total_fee:        totalFee,
    cost_invoice:     costInvoice,
    cost_real:        costReal,
    profit_invoice:   profitInvoice,
    profit_real:      profitReal,
    tax_flat:         taxFlat,
    tax_income:       taxIncome,
    profit_after_tax: profitAfterTax,
    margin_real:      rev > 0 ? (profitReal / rev * 100).toFixed(1) : 0,
    is_loss:          profitReal < 0,
  }
}

function pct(cfg, key) {
  const item = cfg.find ? cfg.find(c => c.cost_key === key) : cfg[key]
  if (!item) return 0
  const val = item.cost_value ?? item.value ?? 0
  return val / 100
}

function num(cfg, key) {
  const item = cfg.find ? cfg.find(c => c.cost_key === key) : cfg[key]
  if (!item) return 0
  return item.cost_value ?? item.value ?? 0
}