import { ensureReturnReverseLedgerTable } from '../returns/reverse-core.js'

export const PAYMENT_SOURCE = 'shopee.payment.get_income_detail'
export const ESCROW_SOURCE = 'shopee.payment.get_escrow_detail'
export const LAZADA_FINANCE_SOURCE = 'lazada.finance.transaction.details.get'
export const ESTIMATE_SOURCE = 'orders_v2_estimate_no_ads'
export const INFERRED_RETURN_SOURCE = 'orders_v2_zero_revenue_return_fee'
export const FINANCE_CORE_CALC_VERSION = 'finance-core-tiktok-detail-basis-v20260519'
export const FINANCE_CORE_SOURCE_MARKER = 'order_analytics.finance_core'

export function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function cleanDate(value) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function addDaysYmd(ymd, days = 1) {
  const [year, month, day] = String(ymd || '').split('-').map(Number)
  if (!year || !month || !day) return ymd
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function dateYmd(date) {
  // NEO: Chuẩn ngày báo cáo theo múi giờ vận hành Việt Nam, tránh lệch ngày khi Worker chạy UTC.
  const shifted = new Date(date.getTime() + 7 * 3600 * 1000)
  const yyyy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function defaultRange(days = 1) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - Math.max(Number(days || 1) - 1, 0))
  return { from: dateYmd(from), to: dateYmd(to) }
}

export function num(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100
}

export function normalizeSku(value) {
  return cleanText(value).toUpperCase()
}

export function mapKey(...parts) {
  return parts.map(part => cleanText(part).toLowerCase()).join('|')
}

export function splitList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)
  return cleanText(value).split(',').map(cleanText).filter(Boolean)
}

export function buildAnalyticsWhere(options, alias = 'oa') {
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
    conds.push(`${prefix}platform = ?`)
    params.push(options.platform)
  }

  const shops = options.shops?.length ? options.shops : (options.shop ? [options.shop] : [])
  if (shops.length) {
    conds.push(`${prefix}shop IN (${shops.map(() => '?').join(',')})`)
    params.push(...shops)
  }

  return { where: `WHERE ${conds.join(' AND ')}`, params }
}

export function buildOrderWhere(options, alias = 'o') {
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
    conds.push(`${prefix}platform = ?`)
    params.push(options.platform)
  }

  const shops = options.shops?.length ? options.shops : (options.shop ? [options.shop] : [])
  if (shops.length) {
    conds.push(`${prefix}shop IN (${shops.map(() => '?').join(',')})`)
    params.push(...shops)
  }

  return { where: `WHERE ${conds.join(' AND ')}`, params }
}

export async function tableExists(env, name) {
  const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first()
  return !!row
}

export async function ensureOrderAnalyticsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS order_analytics (
      order_sn TEXT PRIMARY KEY,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      order_date TEXT DEFAULT '',
      order_hour INTEGER DEFAULT 0,
      customer_name TEXT DEFAULT '',
      oms_status TEXT DEFAULT '',
      shipping_status TEXT DEFAULT '',
      revenue REAL DEFAULT 0,
      actual_income REAL DEFAULT 0,
      actual_income_source TEXT DEFAULT '',
      income_status TEXT DEFAULT '',
      income_synced_at TEXT DEFAULT '',
      platform_fees REAL DEFAULT 0,
      cost_of_goods REAL DEFAULT 0,
      ads_cost_allocated REAL DEFAULT 0,
      ads_cpo REAL DEFAULT 0,
      ads_cpo_basis TEXT DEFAULT '',
      ads_cpo_denominator INTEGER DEFAULT 0,
      ads_cpo_total_spend REAL DEFAULT 0,
      ads_allocation_method TEXT DEFAULT '',
      refund_deduction REAL DEFAULT 0,
      refund_reason TEXT DEFAULT '',
      return_status TEXT DEFAULT '',
      net_profit REAL DEFAULT 0,
      margin_pct REAL DEFAULT 0,
      sku_count INTEGER DEFAULT 0,
      qty_total REAL DEFAULT 0,
      warning TEXT DEFAULT '',
      source_json TEXT DEFAULT '{}',
      computed_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_analytics_date ON order_analytics(order_date)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_analytics_shop ON order_analytics(platform, shop)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_analytics_profit ON order_analytics(net_profit)`).run()
  await ensureColumn(env, 'order_analytics', 'ads_cpo', 'REAL DEFAULT 0')
  await ensureColumn(env, 'order_analytics', 'ads_cpo_basis', "TEXT DEFAULT ''")
  await ensureColumn(env, 'order_analytics', 'ads_cpo_denominator', 'INTEGER DEFAULT 0')
  await ensureColumn(env, 'order_analytics', 'ads_cpo_total_spend', 'REAL DEFAULT 0')
}

async function ensureColumn(env, table, column, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
  const exists = (info.results || []).some(row => cleanText(row.name) === column)
  if (!exists) {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  }
}

export async function ensureSourceTables(env) {
  await ensureOrderAnalyticsTable(env)
  await ensureReturnReverseLedgerTable(env)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS order_fee_details (
      order_id TEXT PRIMARY KEY,
      platform TEXT,
      shop TEXT,
      source TEXT,
      fee_commission REAL,
      fee_payment REAL,
      fee_service REAL,
      fee_affiliate REAL,
      fee_piship REAL,
      fee_handling REAL,
      fee_ads REAL,
      fee_shipping REAL,
      tax_vat REAL,
      tax_pit REAL,
      total_fees REAL,
      settlement REAL,
      raw_data TEXT,
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_ads_campaign_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      campaign_id TEXT DEFAULT '',
      campaign_name TEXT DEFAULT '',
      campaign_type TEXT DEFAULT '',
      product_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      spend REAL DEFAULT 0,
      revenue REAL DEFAULT 0,
      orders INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      ctr REAL DEFAULT 0,
      cpc REAL DEFAULT 0,
      cvr REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      acos REAL DEFAULT 0,
      status TEXT DEFAULT '',
      snapshot_date TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_ads_hourly_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      snapshot_date TEXT DEFAULT '',
      hour INTEGER DEFAULT 0,
      spend REAL DEFAULT 0,
      revenue REAL DEFAULT 0,
      orders INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      ctr REAL DEFAULT 0,
      cpc REAL DEFAULT 0,
      cvr REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      raw_data TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
}
