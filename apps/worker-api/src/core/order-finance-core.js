const PAYMENT_SOURCE = 'shopee.payment.get_income_detail'
const ESCROW_SOURCE = 'shopee.payment.get_escrow_detail'
const LAZADA_FINANCE_SOURCE = 'lazada.finance.transaction.detail.get'
const ESTIMATE_SOURCE = 'orders_v2_estimate_no_ads'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function num(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function roundMoney(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100
}

function cleanYmd(value) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function dateYmd(date) {
  const shifted = new Date(date.getTime() + 7 * 3600 * 1000)
  const yyyy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function defaultRange(days = 30) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - Math.max(Number(days || 30) - 1, 0))
  return { from: dateYmd(from), to: dateYmd(to) }
}

export function parseOrderFinanceOptions(options = {}) {
  const defaults = defaultRange(options.days || 30)
  return {
    from: cleanYmd(options.from || options.date_from) || defaults.from,
    to: cleanYmd(options.to || options.date_to) || defaults.to,
    platform: cleanText(options.platform).toLowerCase(),
    shop: cleanText(options.shop),
    limit: Math.min(Math.max(Number(options.limit || 80) || 80, 1), 500)
  }
}

function financeWhere(options, alias = 'oa') {
  const prefix = alias ? `${alias}.` : ''
  const conds = ['1=1']
  const params = []
  if (options.from) { conds.push(`date(${prefix}order_date) >= ?`); params.push(options.from) }
  if (options.to) { conds.push(`date(${prefix}order_date) <= ?`); params.push(options.to) }
  if (options.platform) { conds.push(`LOWER(COALESCE(${prefix}platform, '')) = ?`); params.push(options.platform) }
  if (options.shop) { conds.push(`${prefix}shop = ?`); params.push(options.shop) }
  return { where: `WHERE ${conds.join(' AND ')}`, params }
}

async function tableExists(env, name) {
  const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first()
  return Boolean(row)
}

export async function ensureOrderFinanceCoreTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_order_finance_daily_snapshots (
      snapshot_key TEXT PRIMARY KEY,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      snapshot_date TEXT DEFAULT '',
      orders INTEGER DEFAULT 0,
      actual_income REAL DEFAULT 0,
      platform_fees REAL DEFAULT 0,
      cost_of_goods REAL DEFAULT 0,
      ads_cost_allocated REAL DEFAULT 0,
      refund_deduction REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      payment_api_orders INTEGER DEFAULT 0,
      escrow_orders INTEGER DEFAULT 0,
      estimated_orders INTEGER DEFAULT 0,
      loss_orders INTEGER DEFAULT 0,
      source_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_order_finance_daily_snapshots_date
    ON marketplace_order_finance_daily_snapshots(snapshot_date, platform, shop)
  `).run()
}

export async function rebuildOrderFinanceDailySnapshots(env, rawOptions = {}) {
  await ensureOrderFinanceCoreTables(env)
  const options = parseOrderFinanceOptions(rawOptions)
  if (!await tableExists(env, 'order_analytics')) {
    return { status: 'ok', saved: 0, skipped: true, message: 'Chưa có bảng order_analytics để tạo snapshot tài chính.' }
  }

  const filter = financeWhere(options, 'oa')
  const rows = await env.DB.prepare(`
    SELECT date(oa.order_date) AS snapshot_date,
           COALESCE(oa.platform, '') AS platform,
           COALESCE(oa.shop, '') AS shop,
           COUNT(*) AS orders,
           SUM(COALESCE(oa.actual_income, 0)) AS actual_income,
           SUM(COALESCE(oa.platform_fees, 0)) AS platform_fees,
           SUM(COALESCE(oa.cost_of_goods, 0)) AS cost_of_goods,
           SUM(COALESCE(oa.ads_cost_allocated, 0)) AS ads_cost_allocated,
           SUM(COALESCE(oa.refund_deduction, 0)) AS refund_deduction,
           SUM(COALESCE(oa.net_profit, 0)) AS net_profit,
           COUNT(CASE WHEN oa.actual_income_source IN (?, ?) THEN 1 END) AS payment_api_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS escrow_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS estimated_orders,
           COUNT(CASE WHEN oa.net_profit < 0 THEN 1 END) AS loss_orders
    FROM order_analytics oa
    ${filter.where}
    GROUP BY date(oa.order_date), COALESCE(oa.platform, ''), COALESCE(oa.shop, '')
    ORDER BY snapshot_date DESC
  `).bind(PAYMENT_SOURCE, LAZADA_FINANCE_SOURCE, ESCROW_SOURCE, ESTIMATE_SOURCE, ...filter.params).all()

  const stmts = []
  for (const row of rows.results || []) {
    const snapshotKey = [
      cleanText(row.snapshot_date),
      cleanText(row.platform).toLowerCase(),
      cleanText(row.shop).toLowerCase()
    ].join('|')
    if (!cleanText(row.snapshot_date) || !snapshotKey) continue
    // Snapshot D1 giúp báo cáo ngày/tháng đọc lại nhanh, không phải gọi API sàn cho từng lần mở dashboard.
    stmts.push(env.DB.prepare(`
      INSERT INTO marketplace_order_finance_daily_snapshots
        (snapshot_key, platform, shop, snapshot_date, orders, actual_income, platform_fees,
         cost_of_goods, ads_cost_allocated, refund_deduction, net_profit, payment_api_orders,
         escrow_orders, estimated_orders, loss_orders, source_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
      ON CONFLICT(snapshot_key) DO UPDATE SET
        orders = excluded.orders,
        actual_income = excluded.actual_income,
        platform_fees = excluded.platform_fees,
        cost_of_goods = excluded.cost_of_goods,
        ads_cost_allocated = excluded.ads_cost_allocated,
        refund_deduction = excluded.refund_deduction,
        net_profit = excluded.net_profit,
        payment_api_orders = excluded.payment_api_orders,
        escrow_orders = excluded.escrow_orders,
        estimated_orders = excluded.estimated_orders,
        loss_orders = excluded.loss_orders,
        source_json = excluded.source_json,
        updated_at = datetime('now', '+7 hours')
    `).bind(
      snapshotKey,
      cleanText(row.platform).toLowerCase(),
      cleanText(row.shop),
      cleanText(row.snapshot_date),
      num(row.orders),
      roundMoney(row.actual_income),
      roundMoney(row.platform_fees),
      roundMoney(row.cost_of_goods),
      roundMoney(row.ads_cost_allocated),
      roundMoney(row.refund_deduction),
      roundMoney(row.net_profit),
      num(row.payment_api_orders),
      num(row.escrow_orders),
      num(row.estimated_orders),
      num(row.loss_orders),
      JSON.stringify({
        source: 'order_analytics',
        payment_api: PAYMENT_SOURCE,
        lazada_finance_api: LAZADA_FINANCE_SOURCE,
        escrow_api: ESCROW_SOURCE,
        estimate: ESTIMATE_SOURCE
      })
    ))
  }

  for (let index = 0; index < stmts.length; index += 50) {
    await env.DB.batch(stmts.slice(index, index + 50))
  }

  return {
    status: 'ok',
    mode: 'order_finance_daily_snapshot',
    from: options.from,
    to: options.to,
    saved: stmts.length
  }
}

async function readFinanceSummary(env, options) {
  const filter = financeWhere(options, 'oa')
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS orders,
           SUM(COALESCE(oa.revenue, 0)) AS gross_revenue,
           SUM(COALESCE(oa.actual_income, 0)) AS actual_income,
           SUM(COALESCE(oa.platform_fees, 0)) AS platform_fees,
           SUM(COALESCE(oa.cost_of_goods, 0)) AS cost_of_goods,
           SUM(COALESCE(oa.ads_cost_allocated, 0)) AS ads_cost_allocated,
           SUM(COALESCE(oa.refund_deduction, 0)) AS refund_deduction,
           SUM(COALESCE(oa.net_profit, 0)) AS net_profit,
           COUNT(CASE WHEN oa.net_profit < 0 THEN 1 END) AS loss_orders,
           COUNT(CASE WHEN oa.actual_income_source IN (?, ?) THEN 1 END) AS payment_api_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS shopee_payment_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS lazada_finance_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS escrow_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS estimated_orders,
           COUNT(CASE WHEN COALESCE(oa.refund_deduction, 0) > 0 THEN 1 END) AS refund_orders
    FROM order_analytics oa
    ${filter.where}
  `).bind(PAYMENT_SOURCE, LAZADA_FINANCE_SOURCE, PAYMENT_SOURCE, LAZADA_FINANCE_SOURCE, ESCROW_SOURCE, ESTIMATE_SOURCE, ...filter.params).first()
  return row || {}
}

async function readGrouped(env, options, groupExpr, orderExpr, limit = 120) {
  const filter = financeWhere(options, 'oa')
  const rows = await env.DB.prepare(`
    SELECT ${groupExpr} AS bucket,
           COALESCE(oa.platform, '') AS platform,
           COALESCE(oa.shop, '') AS shop,
           COUNT(*) AS orders,
           SUM(COALESCE(oa.actual_income, 0)) AS actual_income,
           SUM(COALESCE(oa.platform_fees, 0)) AS platform_fees,
           SUM(COALESCE(oa.cost_of_goods, 0)) AS cost_of_goods,
           SUM(COALESCE(oa.ads_cost_allocated, 0)) AS ads_cost_allocated,
           SUM(COALESCE(oa.refund_deduction, 0)) AS refund_deduction,
           SUM(COALESCE(oa.net_profit, 0)) AS net_profit,
           COUNT(CASE WHEN oa.actual_income_source IN (?, ?) THEN 1 END) AS payment_api_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS escrow_orders,
           COUNT(CASE WHEN oa.actual_income_source = ? THEN 1 END) AS estimated_orders,
           COUNT(CASE WHEN oa.net_profit < 0 THEN 1 END) AS loss_orders
    FROM order_analytics oa
    ${filter.where}
    GROUP BY ${groupExpr}, COALESCE(oa.platform, ''), COALESCE(oa.shop, '')
    ORDER BY ${orderExpr}
    LIMIT ?
  `).bind(PAYMENT_SOURCE, LAZADA_FINANCE_SOURCE, ESCROW_SOURCE, ESTIMATE_SOURCE, ...filter.params, limit).all()
  return (rows.results || []).map(row => ({
    ...row,
    actual_income: roundMoney(row.actual_income),
    platform_fees: roundMoney(row.platform_fees),
    cost_of_goods: roundMoney(row.cost_of_goods),
    ads_cost_allocated: roundMoney(row.ads_cost_allocated),
    refund_deduction: roundMoney(row.refund_deduction),
    net_profit: roundMoney(row.net_profit)
  }))
}

async function readMissingPaymentRows(env, options) {
  const filter = financeWhere(options, 'oa')
  const rows = await env.DB.prepare(`
    SELECT oa.order_sn, oa.platform, oa.shop, oa.order_date, oa.actual_income_source,
           oa.actual_income, oa.net_profit, oa.warning
    FROM order_analytics oa
    ${filter.where}
      AND (oa.actual_income_source = ? OR COALESCE(oa.actual_income_source, '') = '')
    ORDER BY date(oa.order_date) DESC, oa.order_sn DESC
    LIMIT ?
  `).bind(...filter.params, ESTIMATE_SOURCE, options.limit).all()
  return rows.results || []
}

export async function loadOrderFinanceCore(env, rawOptions = {}) {
  await ensureOrderFinanceCoreTables(env)
  const options = parseOrderFinanceOptions(rawOptions)
  if (!await tableExists(env, 'order_analytics')) {
    return {
      status: 'ok',
      mode: 'order_finance_core',
      source: 'order_analytics',
      summary: {},
      by_day: [],
      by_month: [],
      by_shop: [],
      missing_payment_rows: [],
      warning: 'Chưa có bảng order_analytics. Cần chạy rebuild trước khi đọc order_finance_core.'
    }
  }

  const [summary, byDay, byMonth, byShop, missingPaymentRows, snapshotCount] = await Promise.all([
    readFinanceSummary(env, options),
    readGrouped(env, options, 'date(oa.order_date)', 'bucket DESC, net_profit ASC', 120),
    readGrouped(env, options, "substr(oa.order_date, 1, 7)", 'bucket DESC, net_profit ASC', 36),
    readGrouped(env, options, "COALESCE(oa.shop, '')", 'net_profit ASC', 120),
    readMissingPaymentRows(env, options),
    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM marketplace_order_finance_daily_snapshots
      WHERE snapshot_date BETWEEN ? AND ?
    `).bind(options.from, options.to).first()
  ])

  const orders = num(summary.orders)
  return {
    status: 'ok',
    mode: 'order_finance_core',
    source: 'order_analytics + order_fee_details + marketplace_return_reverse_ledger + marketplace_ads_*',
    filters: options,
    summary: {
      orders,
      gross_revenue: roundMoney(summary.gross_revenue),
      actual_income: roundMoney(summary.actual_income),
      platform_fees: roundMoney(summary.platform_fees),
      cost_of_goods: roundMoney(summary.cost_of_goods),
      ads_cost_allocated: roundMoney(summary.ads_cost_allocated),
      refund_deduction: roundMoney(summary.refund_deduction),
      net_profit: roundMoney(summary.net_profit),
      margin_pct: orders && num(summary.actual_income) ? roundMoney(num(summary.net_profit) * 100 / num(summary.actual_income)) : 0,
      payment_api_orders: num(summary.payment_api_orders),
      shopee_payment_orders: num(summary.shopee_payment_orders),
      lazada_finance_orders: num(summary.lazada_finance_orders),
      escrow_orders: num(summary.escrow_orders),
      estimated_orders: num(summary.estimated_orders),
      refund_orders: num(summary.refund_orders),
      loss_orders: num(summary.loss_orders),
      daily_snapshots: num(snapshotCount?.total)
    },
    by_day: byDay,
    by_month: byMonth,
    by_shop: byShop,
    missing_payment_rows: missingPaymentRows,
    source_policy: {
      api_shop: 'Shop có API ưu tiên Shopee Payment và Lazada Finance/LazPay thật, lưu snapshot D1 rồi báo cáo ngày/tháng chỉ đọc lại core.',
      non_api_shop: 'Shop không có API chỉ đọc import_file_sync/browser_sync/manual_reference và phải hiện rõ là dữ liệu tham chiếu.',
      tax_note: 'Báo cáo thuế cần dùng statement/payout chính thức; không dùng ước tính để chốt thuế.'
    },
    next_step: 'Đối soát payout/statement theo kỳ và ghi rõ shop/app nào bị chặn quyền Finance nếu Lazada trả lỗi.'
  }
}
