import { FINANCE_CORE_CALC_VERSION, FINANCE_CORE_SOURCE_MARKER, LAZADA_FINANCE_SOURCE } from './analytics-shared-core.js'

const PAYMENT_SOURCE = 'shopee.payment.get_income_detail'
const ESCROW_SOURCE = 'shopee.payment.get_escrow_detail'
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

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)
  return cleanText(value).split(',').map(cleanText).filter(Boolean)
}

function addDaysYmd(ymd, days = 1) {
  const [year, month, day] = String(ymd || '').split('-').map(Number)
  if (!year || !month || !day) return ymd
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
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
  const shops = cleanList(options.shops || options.shop)
  return {
    from: cleanYmd(options.from || options.date_from) || defaults.from,
    to: cleanYmd(options.to || options.date_to) || defaults.to,
    platform: cleanText(options.platform).toLowerCase(),
    shop: shops.length === 1 ? shops[0] : cleanText(options.shop),
    shops,
    limit: Math.min(Math.max(Number(options.limit || 80) || 80, 1), 500)
  }
}

function financeWhere(options, alias = 'oa') {
  const prefix = alias ? `${alias}.` : ''
  const conds = ['1=1']
  const params = []

  if (options.from) {
    conds.push(`${prefix}order_date >= ?`)
    params.push(options.from)
  }

  if (options.to) {
    conds.push(`${prefix}order_date < ?`)
    params.push(addDaysYmd(options.to, 1))
  }

  if (options.platform) {
    conds.push(`LOWER(COALESCE(${prefix}platform, '')) = ?`)
    params.push(options.platform)
  }

  const shops = Array.isArray(options.shops) && options.shops.length
    ? options.shops.map(cleanText).filter(Boolean)
    : (options.shop ? [cleanText(options.shop)] : [])
  if (shops.length > 1) {
    conds.push(`${prefix}shop IN (${shops.map(() => '?').join(',')})`)
    params.push(...shops)
  } else if (shops.length === 1) {
    conds.push(`${prefix}shop = ?`)
    params.push(shops[0])
  }

  return { where: `WHERE ${conds.join(' AND ')}`, params }
}

async function tableExists(env, name) {
  const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first()
  return Boolean(row)
}

function financeNormalOrderWhere(options, alias = 'o') {
  const prefix = alias ? `${alias}.` : ''
  const conds = [`${prefix}order_type = 'normal'`]
  const params = []

  if (options.from) {
    conds.push(`${prefix}order_date >= ?`)
    params.push(options.from)
  }

  if (options.to) {
    conds.push(`${prefix}order_date < ?`)
    params.push(addDaysYmd(options.to, 1))
  }

  if (options.platform) {
    conds.push(`LOWER(COALESCE(${prefix}platform, '')) = ?`)
    params.push(options.platform)
  }

  const shops = Array.isArray(options.shops) && options.shops.length
    ? options.shops.map(cleanText).filter(Boolean)
    : (options.shop ? [cleanText(options.shop)] : [])
  if (shops.length > 1) {
    conds.push(`${prefix}shop IN (${shops.map(() => '?').join(',')})`)
    params.push(...shops)
  } else if (shops.length === 1) {
    conds.push(`${prefix}shop = ?`)
    params.push(shops[0])
  }

  return { where: `WHERE ${conds.join(' AND ')}`, params }
}

function financeDailySnapshotWhere(options, alias = 's') {
  const prefix = alias ? `${alias}.` : ''
  const conds = ['1=1']
  const params = []

  if (options.from) {
    conds.push(`${prefix}snapshot_date >= ?`)
    params.push(options.from)
  }
  if (options.to) {
    conds.push(`${prefix}snapshot_date <= ?`)
    params.push(options.to)
  }
  if (options.platform) {
    conds.push(`LOWER(COALESCE(${prefix}platform, '')) = ?`)
    params.push(options.platform)
  }
  const shops = Array.isArray(options.shops) && options.shops.length
    ? options.shops.map(cleanText).filter(Boolean)
    : (options.shop ? [cleanText(options.shop)] : [])
  if (shops.length > 1) {
    conds.push(`${prefix}shop IN (${shops.map(() => '?').join(',')})`)
    params.push(...shops)
  } else if (shops.length === 1) {
    conds.push(`${prefix}shop = ?`)
    params.push(shops[0])
  }

  return { where: `WHERE ${conds.join(' AND ')}`, params }
}

export function summarizeFinanceSnapshotHealth(raw = {}) {
  const health = {
    current_calc_version: FINANCE_CORE_CALC_VERSION,
    source_marker: FINANCE_CORE_SOURCE_MARKER,
    analytics_rows: num(raw.analytics_rows),
    source_normal_orders: num(raw.source_normal_orders),
    missing_order_analytics_rows: num(raw.missing_order_analytics_rows),
    orphan_order_analytics_rows: num(raw.orphan_order_analytics_rows),
    invalid_source_json_rows: num(raw.invalid_source_json_rows),
    partial_sync_rows: num(raw.partial_sync_rows),
    missing_calc_version_rows: num(raw.missing_calc_version_rows),
    outdated_calc_version_rows: num(raw.outdated_calc_version_rows),
    revenue_formula_mismatch_orders: num(raw.revenue_formula_mismatch_orders),
    revenue_formula_mismatch_delta: roundMoney(raw.revenue_formula_mismatch_delta),
    daily_snapshot_rows: num(raw.daily_snapshot_rows),
    daily_snapshot_missing_calc_version_rows: num(raw.daily_snapshot_missing_calc_version_rows),
    daily_snapshot_outdated_calc_version_rows: num(raw.daily_snapshot_outdated_calc_version_rows)
  }
  const reasons = []
  if (health.missing_order_analytics_rows) reasons.push('missing_order_analytics_rows')
  if (health.orphan_order_analytics_rows) reasons.push('orphan_order_analytics_rows')
  if (health.invalid_source_json_rows) reasons.push('invalid_source_json_rows')
  if (health.partial_sync_rows) reasons.push('payment_sync_partial_requires_rebuild')
  if (health.missing_calc_version_rows) reasons.push('missing_calc_version')
  if (health.outdated_calc_version_rows) reasons.push('outdated_calc_version')
  if (health.revenue_formula_mismatch_orders) reasons.push('revenue_formula_mismatch')
  if (health.daily_snapshot_missing_calc_version_rows) reasons.push('daily_snapshot_missing_calc_version')
  if (health.daily_snapshot_outdated_calc_version_rows) reasons.push('daily_snapshot_outdated_calc_version')
  return {
    ...health,
    is_stale: reasons.length > 0,
    stale_reasons: reasons,
    action: reasons.length ? 'rebuild_order_analytics_without_live_payment_sync' : 'ok'
  }
}

async function readFinanceSnapshotHealth(env, options) {
  const hasOrders = await tableExists(env, 'orders_v2')
  const hasItems = await tableExists(env, 'order_items')
  const hasFees = await tableExists(env, 'order_fee_details')
  const hasAnalytics = await tableExists(env, 'order_analytics')
  const hasDailySnapshots = await tableExists(env, 'marketplace_order_finance_daily_snapshots')
  if (!hasAnalytics || !hasOrders) {
    return summarizeFinanceSnapshotHealth({
      missing_order_analytics_rows: hasOrders && !hasAnalytics ? 1 : 0,
      source_normal_orders: 0
    })
  }

  const analyticsFilter = financeWhere(options, 'oa')
  const sourceFilter = financeNormalOrderWhere(options, 'o')
  const snapshotFilter = financeDailySnapshotWhere(options, 's')

  const analyticsRow = await env.DB.prepare(`
    SELECT COUNT(*) AS analytics_rows,
           COUNT(CASE WHEN NOT json_valid(COALESCE(oa.source_json, '')) THEN 1 END) AS invalid_source_json_rows,
           COUNT(CASE
             WHEN json_valid(COALESCE(oa.source_json, '')) THEN
               CASE WHEN COALESCE(json_extract(oa.source_json, '$.source_marker'), '') = 'order_analytics.payment_sync_partial' THEN 1 END
           END) AS partial_sync_rows,
           COUNT(CASE
             WHEN NOT json_valid(COALESCE(oa.source_json, '')) THEN 1
             WHEN COALESCE(json_extract(oa.source_json, '$.calc_version'), '') = '' THEN 1
           END) AS missing_calc_version_rows,
           COUNT(CASE
             WHEN json_valid(COALESCE(oa.source_json, '')) THEN
               CASE
                 WHEN COALESCE(json_extract(oa.source_json, '$.calc_version'), '') != ''
                  AND COALESCE(json_extract(oa.source_json, '$.calc_version'), '') != ?
                 THEN 1
               END
           END) AS outdated_calc_version_rows
    FROM order_analytics oa
    ${analyticsFilter.where}
  `).bind(FINANCE_CORE_CALC_VERSION, ...analyticsFilter.params).first()

  const itemRevenueCte = hasItems
    ? `item_revenue AS (
        SELECT order_id, SUM(COALESCE(revenue_line, 0)) AS item_revenue
        FROM order_items
        GROUP BY order_id
      )`
    : `item_revenue AS (SELECT '' AS order_id, 0 AS item_revenue WHERE 0)`
  const feeRevenueCte = hasFees
    ? `fee_revenue AS (
        SELECT order_id,
               MAX(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN max(
                 COALESCE(CAST(json_extract(raw_data, '$.order_income.order_selling_price') AS REAL), 0) +
                   COALESCE(CAST(json_extract(raw_data, '$.order_income.buyer_paid_shipping_fee') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.order_selling_price') AS REAL), 0) +
                   COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.buyer_paid_shipping_fee') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_income.order_selling_price') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.order_selling_price') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_selling_price') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_income.order_discounted_price') AS REAL), 0) +
                   COALESCE(CAST(json_extract(raw_data, '$.order_income.buyer_paid_shipping_fee') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.order_discounted_price') AS REAL), 0) +
                   COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.buyer_paid_shipping_fee') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_income.order_discounted_price') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.order_discounted_price') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_discounted_price') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_income.buyer_payment_info.merchant_subtotal') AS REAL), 0) +
                   COALESCE(CAST(json_extract(raw_data, '$.order_income.buyer_payment_info.shipping_fee') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.buyer_payment_info.merchant_subtotal') AS REAL), 0) +
                   COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.buyer_payment_info.shipping_fee') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.buyer_payment_info.merchant_subtotal') AS REAL), 0) +
                   COALESCE(CAST(json_extract(raw_data, '$.buyer_payment_info.shipping_fee') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_income.buyer_payment_info.merchant_subtotal') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.buyer_payment_info.merchant_subtotal') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.buyer_payment_info.merchant_subtotal') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.order_income.buyer_payment_info.order_amount') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.escrow_detail.order_income.buyer_payment_info.order_amount') AS REAL), 0),
                 COALESCE(CAST(json_extract(raw_data, '$.buyer_payment_info.order_amount') AS REAL), 0)
               ) ELSE 0 END) AS finance_revenue_basis
        FROM order_fee_details
        GROUP BY order_id
      )`
    : `fee_revenue AS (SELECT '' AS order_id, 0 AS finance_revenue_basis WHERE 0)`

  const formulaRow = await env.DB.prepare(`
    WITH ${itemRevenueCte}, ${feeRevenueCte}, expected_orders AS (
      SELECT o.order_id,
             max(
               COALESCE(o.revenue, 0),
               COALESCE(ir.item_revenue, 0),
               COALESCE(fr.finance_revenue_basis, 0)
             ) AS expected_revenue,
             COALESCE(oa.revenue, 0) AS analytics_revenue,
             oa.order_sn AS analytics_order_sn
      FROM orders_v2 o
      LEFT JOIN order_analytics oa ON oa.order_sn = o.order_id
      LEFT JOIN item_revenue ir ON ir.order_id = o.order_id
      LEFT JOIN fee_revenue fr ON fr.order_id = o.order_id
      ${sourceFilter.where}
    )
    SELECT COUNT(*) AS source_normal_orders,
           COUNT(CASE WHEN analytics_order_sn IS NULL THEN 1 END) AS missing_order_analytics_rows,
           COUNT(CASE WHEN analytics_order_sn IS NOT NULL AND ABS(analytics_revenue - expected_revenue) > 0.5 THEN 1 END) AS revenue_formula_mismatch_orders,
           SUM(CASE WHEN analytics_order_sn IS NOT NULL AND ABS(analytics_revenue - expected_revenue) > 0.5 THEN ABS(analytics_revenue - expected_revenue) ELSE 0 END) AS revenue_formula_mismatch_delta
    FROM expected_orders
  `).bind(...sourceFilter.params).first()

  const orphanRow = await env.DB.prepare(`
    SELECT COUNT(*) AS orphan_order_analytics_rows
    FROM order_analytics oa
    LEFT JOIN orders_v2 o ON o.order_id = oa.order_sn
    ${analyticsFilter.where}
      AND (o.order_id IS NULL OR COALESCE(o.order_type, '') != 'normal')
  `).bind(...analyticsFilter.params).first()

  let dailyRow = {}
  if (hasDailySnapshots) {
    dailyRow = await env.DB.prepare(`
      SELECT COUNT(*) AS daily_snapshot_rows,
             COUNT(CASE
               WHEN NOT json_valid(COALESCE(s.source_json, '')) THEN 1
               WHEN COALESCE(json_extract(s.source_json, '$.calc_version'), '') = '' THEN 1
             END) AS daily_snapshot_missing_calc_version_rows,
             COUNT(CASE
               WHEN json_valid(COALESCE(s.source_json, '')) THEN
                 CASE
                   WHEN COALESCE(json_extract(s.source_json, '$.calc_version'), '') != ''
                    AND COALESCE(json_extract(s.source_json, '$.calc_version'), '') != ?
                   THEN 1
                 END
             END) AS daily_snapshot_outdated_calc_version_rows
      FROM marketplace_order_finance_daily_snapshots s
      ${snapshotFilter.where}
    `).bind(FINANCE_CORE_CALC_VERSION, ...snapshotFilter.params).first()
  }

  return summarizeFinanceSnapshotHealth({
    ...analyticsRow,
    ...formulaRow,
    ...orphanRow,
    ...dailyRow
  })
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
           SUM(COALESCE(oa.revenue, 0)) AS gross_revenue,
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
        source_marker: 'marketplace_order_finance_daily_snapshot',
        calc_version: FINANCE_CORE_CALC_VERSION,
        source: 'order_analytics',
        source_calc_marker: FINANCE_CORE_SOURCE_MARKER,
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
           SUM(COALESCE(oa.revenue, 0)) AS gross_revenue,
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
    gross_revenue: roundMoney(row.gross_revenue),
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
    ORDER BY oa.order_date DESC, oa.order_sn DESC
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

  let snapshotHealth
  try {
    snapshotHealth = await readFinanceSnapshotHealth(env, options)
  } catch (error) {
    snapshotHealth = {
      current_calc_version: FINANCE_CORE_CALC_VERSION,
      source_marker: FINANCE_CORE_SOURCE_MARKER,
      is_stale: true,
      stale_reasons: ['snapshot_health_check_failed'],
      action: 'rebuild_order_analytics_without_live_payment_sync',
      error: error?.message || String(error)
    }
  }

  const orders = num(summary.orders)
  const isStale = Boolean(snapshotHealth?.is_stale)
  return {
    status: isStale ? 'stale' : 'ok',
    mode: 'order_finance_core',
    source: 'order_analytics + order_fee_details + marketplace_return_reverse_ledger + marketplace_ads_*',
    calc_version: FINANCE_CORE_CALC_VERSION,
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
    stale_snapshot: isStale,
    snapshot_health: snapshotHealth,
    warning: isStale ? `Finance snapshot stale: ${(snapshotHealth?.stale_reasons || []).join(', ')}` : '',
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
