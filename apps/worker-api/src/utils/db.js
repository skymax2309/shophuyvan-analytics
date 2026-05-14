import { buildOrderFeePhase1ProfitResult } from '../core/order-fee-phase1-core.js'

// Lấy toàn bộ cost_settings thành object key→value để các route cũ dùng chung.
async function getCostSettings(env) {
  const rows = await env.DB.prepare(`SELECT cost_key, cost_value, cost_type FROM cost_settings`).all()
  const cfg = {}
  for (const r of rows.results) {
    cfg[r.cost_key] = { value: r.cost_value, type: r.cost_type }
  }
  return cfg
}

// Legacy helper vẫn giữ tên calcProfit để không phải đập rộng toàn repo,
// nhưng bên trong đã đọc chung source of truth phase 1.
function calcProfit(order, cfg) {
  return buildOrderFeePhase1ProfitResult(order, cfg)
}

function pct(cfg, key) {
  return cfg[key] ? (cfg[key].value / 100) : 0
}

function num(cfg, key) {
  return cfg[key] ? cfg[key].value : 0
}

export { getCostSettings, calcProfit, pct, num }
