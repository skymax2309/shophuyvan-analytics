import { getFilters } from '../../utils/filters.js'
import { getCostSettings, calcProfit } from '../../utils/db.js'
import { orderStatusKind } from '../../core/orders/status-core.js'
import { vietnameseCancelReason } from '../../core/dashboard/summary-core.js'
import { loadOrderFinanceCore } from '../../core/orders/finance-core.js'
import { buildAnalyticsWhere, ensureSourceTables } from '../../core/orders/analytics-shared-core.js'
import { rebuildOrderAnalytics } from '../order-analytics/order-analytics-rebuild-core.js'

function analyticsOptionsFromFilters(filters = {}) {
  return {
    from: filters.from,
    to: filters.to,
    platform: filters.platform,
    shop: filters.shop,
    shops: filters.shops || []
  }
}

function cleanLimit(value, fallback = 20, max = 200) {
  return Math.min(Math.max(Number(value || fallback) || fallback, 1), max)
}

async function ensureFreshAnalyticsForDashboard(env, options = {}) {
  const financeCore = await loadOrderFinanceCore(env, options)
  const staleReasons = financeCore?.snapshot_health?.stale_reasons || []
  if (financeCore?.status === 'stale' && staleReasons.includes('missing_order_analytics_rows')) {
    // Top chart phải nối lại Finance Core khi đơn mới đã có trong Warehouse nhưng order_analytics thiếu shop.
    await rebuildOrderAnalytics(env, { ...options, rebuild: true, sync_payment: false })
  }
}

const itemFinanceRatioSql = `
  CASE
    WHEN COALESCE(oa.revenue, 0) > 0 AND COALESCE(oi.revenue_line, 0) > 0
      THEN COALESCE(oi.revenue_line, 0) * 1.0 / COALESCE(oa.revenue, 0)
    ELSE 1.0 / COALESCE(NULLIF(ic.item_count, 0), 1)
  END
`

async function uniqueSkus(request, env, cors) {
  const rows = await env.DB.prepare(`
    SELECT
      sku,
      product_name,
      MAX(order_date) AS last_order_date
    FROM order_items oi
    JOIN orders_v2 o ON oi.order_id = o.order_id
    WHERE oi.sku IS NOT NULL AND oi.sku != ''
      AND o.order_type != 'cancel'
    GROUP BY oi.sku
    ORDER BY oi.sku
  `).all()

  return Response.json(rows.results, { headers: cors })
}

async function topSku(request, env, cors) {
  // Các chart doanh thu/lãi đọc Finance Core để không tái tính từ orders_v2 theo nhánh riêng.
  await ensureSourceTables(env)
  const filters = getFilters(new URL(request.url))
  await ensureFreshAnalyticsForDashboard(env, analyticsOptionsFromFilters(filters))
  const filter = buildAnalyticsWhere(analyticsOptionsFromFilters(filters), 'oa')
  const limit = cleanLimit(new URL(request.url).searchParams.get("limit"))

  const rows = await env.DB.prepare(`
    WITH item_counts AS (
      SELECT order_id, COUNT(*) AS item_count
      FROM order_items
      GROUP BY order_id
    )
    SELECT
      COALESCE(NULLIF(oi.sku, ''), '(no sku)') AS sku,
      SUM(COALESCE(oi.qty, 0)) AS total_qty,
      SUM(COALESCE(oa.revenue, 0) * (${itemFinanceRatioSql})) AS total_revenue,
      SUM(COALESCE(oa.net_profit, 0) * (${itemFinanceRatioSql})) AS total_profit,
      COUNT(DISTINCT oa.order_sn) AS total_orders
    FROM order_analytics oa
    JOIN order_items oi ON oi.order_id = oa.order_sn
    LEFT JOIN item_counts ic ON ic.order_id = oa.order_sn
    ${filter.where}
    GROUP BY COALESCE(NULLIF(oi.sku, ''), '(no sku)')
    ORDER BY total_revenue DESC
    LIMIT ?
  `).bind(...filter.params, limit).all()

  return Response.json(rows.results, { headers: cors })
}

async function topProduct(request, env, cors) {
  await ensureSourceTables(env)
  const filters = getFilters(new URL(request.url))
  await ensureFreshAnalyticsForDashboard(env, analyticsOptionsFromFilters(filters))
  const filter = buildAnalyticsWhere(analyticsOptionsFromFilters(filters), 'oa')
  const limit = cleanLimit(new URL(request.url).searchParams.get("limit"))

  const rows = await env.DB.prepare(`
    WITH item_counts AS (
      SELECT order_id, COUNT(*) AS item_count
      FROM order_items
      GROUP BY order_id
    )
    SELECT
      COALESCE(NULLIF(oi.product_name, ''), '(chưa có tên sản phẩm)') AS product_name,
      SUM(COALESCE(oi.qty, 0)) AS total_qty,
      SUM(COALESCE(oa.revenue, 0) * (${itemFinanceRatioSql})) AS total_revenue,
      SUM(COALESCE(oa.net_profit, 0) * (${itemFinanceRatioSql})) AS total_profit,
      COUNT(DISTINCT oa.order_sn) AS total_orders
    FROM order_analytics oa
    JOIN order_items oi ON oi.order_id = oa.order_sn
    LEFT JOIN item_counts ic ON ic.order_id = oa.order_sn
    ${filter.where}
    GROUP BY COALESCE(NULLIF(oi.product_name, ''), '(chưa có tên sản phẩm)')
    ORDER BY total_revenue DESC
    LIMIT ?
  `).bind(...filter.params, limit).all()

  return Response.json(rows.results, { headers: cors })
}

async function topShop(request, env, cors) {
  await ensureSourceTables(env)
  const filters = getFilters(new URL(request.url))
  await ensureFreshAnalyticsForDashboard(env, analyticsOptionsFromFilters(filters))
  const filter = buildAnalyticsWhere(analyticsOptionsFromFilters(filters), 'oa')

  const rows = await env.DB.prepare(`
    SELECT
      COALESCE(oa.shop, '') AS shop,
      COALESCE(oa.platform, '') AS platform,
      SUM(COALESCE(oa.revenue, 0)) AS total_revenue,
      SUM(COALESCE(oa.net_profit, 0)) AS total_profit,
      COUNT(DISTINCT oa.order_sn) AS total_orders
    FROM order_analytics oa
    ${filter.where}
    GROUP BY COALESCE(oa.shop, ''), COALESCE(oa.platform, '')
    ORDER BY total_revenue DESC
  `).bind(...filter.params).all()

  return Response.json(rows.results, { headers: cors })
}

async function topPlatform(request, env, cors) {
  await ensureSourceTables(env)
  const filters = getFilters(new URL(request.url))
  await ensureFreshAnalyticsForDashboard(env, analyticsOptionsFromFilters(filters))
  const filter = buildAnalyticsWhere(analyticsOptionsFromFilters(filters), 'oa')

  const rows = await env.DB.prepare(`
    SELECT
      COALESCE(oa.platform, '') AS platform,
      SUM(COALESCE(oa.revenue, 0)) AS total_revenue,
      SUM(COALESCE(oa.net_profit, 0)) AS total_profit,
      COUNT(DISTINCT oa.order_sn) AS total_orders,
      SUM(COALESCE(oa.qty_total, 0)) AS total_qty
    FROM order_analytics oa
    ${filter.where}
    GROUP BY COALESCE(oa.platform, '')
    ORDER BY total_revenue DESC
  `).bind(...filter.params).all()

  return Response.json(rows.results, { headers: cors })
}

async function cancelStats(request, env, cors) {
  const url = new URL(request.url)
  const filters = getFilters(url)

  const conds = ["1=1"]
  const params = []
  if (filters.from) { conds.push(`date(order_date) >= ?`); params.push(filters.from) }
  if (filters.to) { conds.push(`date(order_date) <= ?`); params.push(filters.to) }
  if (filters.platform) { conds.push(`platform = ?`); params.push(filters.platform) }
  if (filters.shops && filters.shops.length > 0) {
    const placeholders = filters.shops.map(() => '?').join(',')
    conds.push(`shop IN (${placeholders})`)
    filters.shops.forEach(shop => params.push(shop))
  } else if (filters.shop) {
    conds.push(`shop = ?`)
    params.push(filters.shop)
  }
  const where = "WHERE " + conds.join(" AND ")

  const rows = await env.DB.prepare(`
    SELECT
      order_id,
      order_type,
      platform,
      COALESCE(raw_revenue, revenue, 0) AS raw_revenue,
      cancel_reason,
      oms_status,
      shipping_status
    FROM orders_v2
    ${where}
  `).bind(...params).all()

  const grouped = new Map()
  for (const row of rows.results || []) {
    const kind = orderStatusKind(row, row.cancel_reason || '')
    const normalizedType = kind === 'cancelled' ? 'cancel'
      : (kind === 'return' || kind === 'failed') ? 'return'
      : (row.order_type || 'normal')
    const reasonVi = vietnameseCancelReason(row.cancel_reason || '')
    const key = [normalizedType, row.platform || '', reasonVi].join('|')
    if (!grouped.has(key)) {
      grouped.set(key, {
        order_type: normalizedType,
        platform: row.platform || '',
        total_orders: 0,
        total_revenue: 0,
        cancel_reason: row.cancel_reason || '',
        cancel_reason_vi: reasonVi,
        _seen: new Set()
      })
    }
    const item = grouped.get(key)
    if (item._seen.has(row.order_id)) continue
    item._seen.add(row.order_id)
    item.total_orders += 1
    item.total_revenue += Number(row.raw_revenue || 0)
  }

  // Dashboard thống kê hủy/hoàn dựa trên core trạng thái, không phụ thuộc order_type có được import đúng hay chưa.
  const result = [...grouped.values()]
    .map(({ _seen, ...item }) => item)
    .sort((a, b) => Number(b.total_orders || 0) - Number(a.total_orders || 0))

  return Response.json(result, { headers: cors })
}

async function priceCalc(request, env, cors) {
  const { sku, sell_price, platform } = await request.json()

  const product = await env.DB.prepare(`
    SELECT cost_invoice, cost_real, product_name FROM products WHERE sku = ?
  `).bind(sku).first()

  if (!product) {
    return Response.json({ error: "SKU không tìm thấy" }, { status: 404, headers: cors })
  }

  const cfg = await getCostSettings(env)

  const p = calcProfit({
    revenue: sell_price,
    qty: 1,
    platform: platform || "tiktok",
    cost_invoice: product.cost_invoice,
    cost_real: product.cost_real,
  }, cfg)

  return Response.json({
    sku,
    product_name: product.product_name,
    sell_price,
    cost_invoice: product.cost_invoice,
    cost_real: product.cost_real,
    total_fee: p.total_fee,
    profit_invoice: p.profit_invoice,
    profit_real: p.profit_real,
    tax_flat: p.tax_flat,
    tax_income: p.tax_income,
    profit_after_tax: p.profit_after_tax,
    is_loss: p.profit_real < 0,
    fee_platform: p.fee_platform || 0,
    fee_payment: p.fee_payment || 0,
    fee_affiliate: p.fee_affiliate || 0,
    fee_ads: p.fee_ads || 0,
    fee_piship: p.fee_piship || 0,
    fee_service: p.fee_service || 0,
  }, { headers: cors })
}

async function topSkuFull(request, env, cors) {
  await ensureSourceTables(env)
  const url = new URL(request.url)
  const filters = getFilters(url)
  await ensureFreshAnalyticsForDashboard(env, analyticsOptionsFromFilters(filters))
  const filter = buildAnalyticsWhere(analyticsOptionsFromFilters(filters), 'oa')
  const sortBy = url.searchParams.get("sort") || "qty"

  const orderCol = sortBy === "revenue" ? "total_revenue"
    : sortBy === "profit" ? "total_profit"
    : "total_qty"

  const rows = await env.DB.prepare(`
    WITH item_counts AS (
      SELECT order_id, COUNT(*) AS item_count
      FROM order_items
      GROUP BY order_id
    )
    SELECT
      COALESCE(NULLIF(oi.sku, ''), '(no sku)') AS sku,
      MAX(COALESCE(oi.product_name, '')) AS product_name,
      SUM(COALESCE(oi.qty, 0)) AS total_qty,
      SUM(COALESCE(oa.revenue, 0) * (${itemFinanceRatioSql})) AS total_revenue,
      SUM(COALESCE(oa.net_profit, 0) * (${itemFinanceRatioSql})) AS total_profit,
      COUNT(DISTINCT oa.order_sn) AS total_orders,
      GROUP_CONCAT(DISTINCT oa.platform) AS platforms,
      GROUP_CONCAT(DISTINCT oa.shop) AS shops
    FROM order_items oi
    JOIN order_analytics oa ON oa.order_sn = oi.order_id
    LEFT JOIN item_counts ic ON ic.order_id = oa.order_sn
    ${filter.where}
    GROUP BY COALESCE(NULLIF(oi.sku, ''), '(no sku)')
    ORDER BY ${orderCol} DESC
  `).bind(...filter.params).all()

  return Response.json(rows.results, { headers: cors })
}

export { uniqueSkus, topSku, topProduct, topShop, topPlatform, cancelStats, priceCalc, topSkuFull }
