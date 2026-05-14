const RETURN_STATUSES = [
  'RETURN',
  'RETURN_REFUND',
  'RETURN_COMPLAINT',
  'TO_RETURN',
  'LOGISTICS_IN_RETURN',
  'LOGISTICS_RETURNED_BY_SHIPPER',
  'LOGISTICS_RETURN_PACKAGE_RECEIVED',
  'LOGISTICS_LOST'
]

const FAILED_DELIVERY_STATUSES = ['FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT']
const CANCEL_STATUSES = ['CANCELLED', 'CANCELLED_TRANSIT']

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function normalizePlatform(value) {
  return cleanText(value).toLowerCase()
}

function marks(values) {
  return values.map(value => `'${value}'`).join(',')
}

export function customerRiskKeySql(alias = 'o') {
  return `LOWER(COALESCE(${alias}.platform, '')) || '|' || LOWER(TRIM(COALESCE(${alias}.shop, ''))) || '|name:' || LOWER(TRIM(COALESCE(${alias}.customer_name, '')))`
}

function validCustomerSql(alias = 'o') {
  return `TRIM(COALESCE(${alias}.customer_name, '')) != ''
    AND LOWER(TRIM(COALESCE(${alias}.customer_name, ''))) NOT IN ('unknown','khach','khách','khach shopee','khách shopee','khach lazada','khách lazada','khach tiktok','khách tiktok')`
}

function returnConditionSql(alias = 'o') {
  return `(LOWER(COALESCE(${alias}.order_type, '')) = 'return'
    OR UPPER(COALESCE(${alias}.oms_status, '')) = 'RETURN'
    OR UPPER(COALESCE(${alias}.shipping_status, '')) IN (${marks(RETURN_STATUSES)})
    OR UPPER(COALESCE(${alias}.shipping_status, '')) LIKE '%RETURN%')`
}

function failedDeliveryConditionSql(alias = 'o') {
  return `(UPPER(COALESCE(${alias}.shipping_status, '')) IN (${marks(FAILED_DELIVERY_STATUSES)})
    OR LOWER(COALESCE(${alias}.cancel_reason, '')) LIKE '%giao%thất%bại%'
    OR LOWER(COALESCE(${alias}.cancel_reason, '')) LIKE '%không nhận%')`
}

function cancelConditionSql(alias = 'o') {
  return `(LOWER(COALESCE(${alias}.order_type, '')) = 'cancel'
    OR UPPER(COALESCE(${alias}.oms_status, '')) = 'CANCELLED'
    OR UPPER(COALESCE(${alias}.shipping_status, '')) IN (${marks(CANCEL_STATUSES)}))`
}

function scopeWhere(options = {}, alias = 'o') {
  const clauses = [validCustomerSql(alias)]
  const binds = []
  const platform = normalizePlatform(options.platform)
  const shop = cleanText(options.shop)
  if (platform) {
    clauses.push(`LOWER(COALESCE(${alias}.platform, '')) = ?`)
    binds.push(platform)
  }
  if (shop) {
    clauses.push(`LOWER(TRIM(COALESCE(${alias}.shop, ''))) = LOWER(TRIM(?))`)
    binds.push(shop)
  }
  return { where: clauses.map(item => `(${item})`).join(' AND '), binds }
}

async function deleteScopedRiskRows(env, options = {}) {
  const clauses = []
  const binds = []
  const platform = normalizePlatform(options.platform)
  const shop = cleanText(options.shop)
  if (platform) {
    clauses.push('platform = ?')
    binds.push(platform)
  }
  if (shop) {
    clauses.push('LOWER(TRIM(shop)) = LOWER(TRIM(?))')
    binds.push(shop)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  await env.DB.prepare(`DELETE FROM customer_risk_profiles ${where}`).bind(...binds).run()
  await env.DB.prepare(`DELETE FROM customer_risk_events ${where}`).bind(...binds).run()
}

export async function ensureCustomerRiskTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_risk_profiles (
      risk_key TEXT PRIMARY KEY,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      identity_type TEXT DEFAULT 'name',
      total_orders INTEGER DEFAULT 0,
      return_count INTEGER DEFAULT 0,
      failed_delivery_count INTEGER DEFAULT 0,
      cancel_count INTEGER DEFAULT 0,
      risk_order_count INTEGER DEFAULT 0,
      warning_event_count INTEGER DEFAULT 0,
      risk_score INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'normal',
      risk_label TEXT DEFAULT '',
      risk_reason TEXT DEFAULT '',
      first_order_at TEXT DEFAULT '',
      last_order_at TEXT DEFAULT '',
      last_risk_order_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS customer_risk_events (
      order_id TEXT PRIMARY KEY,
      risk_key TEXT NOT NULL,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      risk_type TEXT DEFAULT '',
      risk_reason TEXT DEFAULT '',
      order_date TEXT DEFAULT '',
      oms_status TEXT DEFAULT '',
      shipping_status TEXT DEFAULT '',
      tracking_number TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    )
  `).run()

  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_risk_profiles_level ON customer_risk_profiles(risk_level, risk_score DESC)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_risk_profiles_scope ON customer_risk_profiles(platform, shop)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_risk_events_key ON customer_risk_events(risk_key, order_date DESC)`).run()
}

export function customerRiskOrderFilterSql(filter, alias = 'o') {
  const key = customerRiskKeySql(alias)
  const value = cleanText(filter).toLowerCase()
  if (!value) return ''
  const base = `EXISTS (SELECT 1 FROM customer_risk_profiles cr WHERE cr.risk_key = ${key}`
  if (value === 'high') return `${base} AND cr.risk_level = 'high')`
  if (value === 'warning') return `${base} AND cr.risk_level IN ('medium','high'))`
  if (value === 'watch') return `${base} AND cr.risk_level IN ('watch','medium','high'))`
  if (value === 'return') return `${base} AND cr.return_count >= 2)`
  if (value === 'failed_delivery') return `${base} AND cr.failed_delivery_count >= 1 AND cr.warning_event_count >= 2)`
  return ''
}

export async function rebuildCustomerRiskProfiles(env, options = {}) {
  await ensureCustomerRiskTables(env)
  const scope = scopeWhere(options, 'o')
  const returnSql = returnConditionSql('o')
  const failedSql = failedDeliveryConditionSql('o')
  const cancelSql = cancelConditionSql('o')
  const riskSql = `(${returnSql} OR ${failedSql} OR ${cancelSql})`
  const keySql = customerRiskKeySql('o')

  await deleteScopedRiskRows(env, options)

  await env.DB.prepare(`
    INSERT OR REPLACE INTO customer_risk_events (
      order_id, risk_key, platform, shop, customer_name, risk_type, risk_reason,
      order_date, oms_status, shipping_status, tracking_number, updated_at
    )
    SELECT
      o.order_id,
      ${keySql},
      LOWER(COALESCE(o.platform, '')),
      COALESCE(o.shop, ''),
      COALESCE(o.customer_name, ''),
      CASE
        WHEN ${failedSql} THEN 'failed_delivery'
        WHEN ${returnSql} THEN 'return'
        WHEN ${cancelSql} THEN 'cancel'
        ELSE 'risk'
      END,
      CASE
        WHEN ${failedSql} THEN 'Giao thất bại hoặc khách không nhận'
        WHEN ${returnSql} THEN 'Khách có đơn hoàn/trả'
        WHEN ${cancelSql} THEN 'Khách có đơn hủy'
        ELSE 'Có lịch sử cần lưu ý'
      END,
      COALESCE(o.order_date, ''),
      COALESCE(o.oms_status, ''),
      COALESCE(o.shipping_status, ''),
      COALESCE(o.tracking_number, ''),
      datetime('now', '+7 hours')
    FROM orders_v2 o
    WHERE ${scope.where}
      AND ${riskSql}
      AND COALESCE(o.order_id, '') != ''
  `).bind(...scope.binds).run()

  await env.DB.prepare(`
    INSERT OR REPLACE INTO customer_risk_profiles (
      risk_key, platform, shop, customer_name, identity_type,
      total_orders, return_count, failed_delivery_count, cancel_count,
      risk_order_count, warning_event_count, risk_score, risk_level, risk_label, risk_reason,
      first_order_at, last_order_at, last_risk_order_at, updated_at
    )
    SELECT
      risk_key,
      platform,
      shop,
      customer_name,
      'name',
      total_orders,
      return_count,
      failed_delivery_count,
      cancel_count,
      risk_order_count,
      warning_event_count,
      (warning_event_count * 10) + (cancel_count * 2) AS risk_score,
      CASE
        WHEN warning_event_count >= 3 OR (total_orders >= 3 AND warning_event_count >= 2 AND (warning_event_count * 1.0 / total_orders) >= 0.4) THEN 'high'
        WHEN warning_event_count >= 2 THEN 'medium'
        WHEN warning_event_count = 1 OR cancel_count >= 2 THEN 'watch'
        ELSE 'normal'
      END AS risk_level,
      CASE
        WHEN warning_event_count >= 3 OR (total_orders >= 3 AND warning_event_count >= 2 AND (warning_event_count * 1.0 / total_orders) >= 0.4) THEN 'Khách rủi ro cao'
        WHEN warning_event_count >= 2 THEN 'Khách hay hoàn/không nhận'
        WHEN warning_event_count = 1 OR cancel_count >= 2 THEN 'Cần lưu ý'
        ELSE ''
      END AS risk_label,
      CASE
        WHEN failed_delivery_count >= return_count AND failed_delivery_count > 0 THEN 'Có nhiều đơn giao thất bại hoặc không nhận hàng'
        WHEN return_count > 0 THEN 'Có lịch sử hoàn/trả hàng'
        WHEN cancel_count > 0 THEN 'Có lịch sử hủy đơn'
        ELSE ''
      END AS risk_reason,
      first_order_at,
      last_order_at,
      last_risk_order_at,
      datetime('now', '+7 hours')
    FROM (
      SELECT
        ${keySql} AS risk_key,
        LOWER(COALESCE(o.platform, '')) AS platform,
        COALESCE(o.shop, '') AS shop,
        MAX(COALESCE(o.customer_name, '')) AS customer_name,
        COUNT(DISTINCT o.order_id) AS total_orders,
        SUM(CASE WHEN ${returnSql} THEN 1 ELSE 0 END) AS return_count,
        SUM(CASE WHEN ${failedSql} THEN 1 ELSE 0 END) AS failed_delivery_count,
        SUM(CASE WHEN ${cancelSql} THEN 1 ELSE 0 END) AS cancel_count,
        SUM(CASE WHEN ${riskSql} THEN 1 ELSE 0 END) AS risk_order_count,
        SUM(CASE WHEN (${returnSql} OR ${failedSql}) THEN 1 ELSE 0 END) AS warning_event_count,
        MIN(COALESCE(o.order_date, '')) AS first_order_at,
        MAX(COALESCE(o.order_date, '')) AS last_order_at,
        MAX(CASE WHEN ${riskSql} THEN COALESCE(o.order_date, '') ELSE '' END) AS last_risk_order_at
      FROM orders_v2 o
      WHERE ${scope.where}
      GROUP BY ${keySql}, LOWER(COALESCE(o.platform, '')), LOWER(TRIM(COALESCE(o.shop, '')))
    )
    WHERE risk_order_count > 0
  `).bind(...scope.binds).run()

  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_profiles,
      SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) AS high_profiles,
      SUM(CASE WHEN risk_level = 'medium' THEN 1 ELSE 0 END) AS medium_profiles,
      SUM(CASE WHEN risk_level = 'watch' THEN 1 ELSE 0 END) AS watch_profiles,
      SUM(risk_order_count) AS risk_orders
    FROM customer_risk_profiles
  `).first()

  return {
    status: 'ok',
    mode: 'customer_risk_rebuild',
    platform: normalizePlatform(options.platform) || 'all',
    shop: cleanText(options.shop) || 'all',
    total_profiles: Number(summary?.total_profiles || 0),
    high_profiles: Number(summary?.high_profiles || 0),
    medium_profiles: Number(summary?.medium_profiles || 0),
    watch_profiles: Number(summary?.watch_profiles || 0),
    risk_orders: Number(summary?.risk_orders || 0)
  }
}

export async function listCustomerRiskProfiles(env, options = {}) {
  await ensureCustomerRiskTables(env)
  const clauses = ['1=1']
  const binds = []
  const platform = normalizePlatform(options.platform)
  const shop = cleanText(options.shop)
  const level = cleanText(options.level).toLowerCase()
  const search = cleanText(options.search)
  const limit = Math.min(Math.max(parseInt(options.limit || '80', 10) || 80, 1), 300)
  if (platform) {
    clauses.push('platform = ?')
    binds.push(platform)
  }
  if (shop) {
    clauses.push('LOWER(TRIM(shop)) = LOWER(TRIM(?))')
    binds.push(shop)
  }
  if (level === 'warning') {
    clauses.push("risk_level IN ('medium','high')")
  } else if (['high', 'medium', 'watch'].includes(level)) {
    clauses.push('risk_level = ?')
    binds.push(level)
  }
  if (search) {
    clauses.push('(customer_name LIKE ? OR shop LIKE ? OR risk_reason LIKE ?)')
    const q = `%${search}%`
    binds.push(q, q, q)
  }

  const { results } = await env.DB.prepare(`
    SELECT *
    FROM customer_risk_profiles
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE risk_level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'watch' THEN 3 ELSE 4 END,
      risk_score DESC,
      datetime(COALESCE(last_risk_order_at, '1970-01-01 00:00:00')) DESC
    LIMIT ?
  `).bind(...binds, limit).all()

  return {
    status: 'ok',
    mode: 'customer_risk_profiles',
    data: results || [],
    total: results?.length || 0
  }
}

export async function listCustomerRiskEvents(env, options = {}) {
  await ensureCustomerRiskTables(env)
  const riskKey = cleanText(options.risk_key)
  const limit = Math.min(Math.max(parseInt(options.limit || '30', 10) || 30, 1), 100)
  if (!riskKey) return { status: 'ok', mode: 'customer_risk_events', data: [], total: 0 }
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM customer_risk_events
    WHERE risk_key = ?
    ORDER BY datetime(COALESCE(order_date, '1970-01-01 00:00:00')) DESC
    LIMIT ?
  `).bind(riskKey, limit).all()
  return {
    status: 'ok',
    mode: 'customer_risk_events',
    risk_key: riskKey,
    data: results || [],
    total: results?.length || 0
  }
}
