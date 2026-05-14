import { getFilters, buildWhere } from '../utils/filters.js'
import { getCostSettings, calcProfit } from '../utils/db.js'
import { orderStatusKind } from '../core/order-status-core.js'
import { vietnameseCancelReason } from '../core/dashboard-summary-core.js'

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
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)
  const limit = new URL(request.url).searchParams.get("limit") || 20

  const rows = await env.DB.prepare(`
    SELECT
      oi.sku,
      SUM(oi.qty)                    AS total_qty,
      SUM(oi.revenue_line)           AS total_revenue,
      SUM(o.profit_real * oi.revenue_line / NULLIF(o.revenue,0)) AS total_profit,
      COUNT(DISTINCT oi.order_id)    AS total_orders
    FROM order_items oi
    JOIN orders_v2 o ON oi.order_id = o.order_id
    ${where.replace("WHERE", "WHERE o.order_type='normal' AND").replace("orders_v2","o")}
    GROUP BY oi.sku
    ORDER BY total_revenue DESC
    LIMIT ${limit}
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}

async function topProduct(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)
  const limit = new URL(request.url).searchParams.get("limit") || 20

  const rows = await env.DB.prepare(`
    SELECT
      oi.product_name,
      SUM(oi.qty)                    AS total_qty,
      SUM(oi.revenue_line)           AS total_revenue,
      SUM(o.profit_real * oi.revenue_line / NULLIF(o.revenue,0)) AS total_profit,
      COUNT(DISTINCT oi.order_id)    AS total_orders
    FROM order_items oi
    JOIN orders_v2 o ON oi.order_id = o.order_id
    ${where.replace("WHERE", "WHERE o.order_type='normal' AND").replace("orders_v2","o")}
    GROUP BY oi.product_name
    ORDER BY total_revenue DESC
    LIMIT ${limit}
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}

async function topShop(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const rows = await env.DB.prepare(`
    SELECT
      shop,
      platform,
      SUM(revenue)             AS total_revenue,
      SUM(profit_real)         AS total_profit,
      COUNT(DISTINCT order_id) AS total_orders
    FROM orders_v2
    ${where}
    GROUP BY shop, platform
    ORDER BY total_revenue DESC
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}

async function topPlatform(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const rows = await env.DB.prepare(`
    SELECT
      o.platform,
      SUM(o.revenue)             AS total_revenue,
      SUM(o.profit_real)         AS total_profit,
      COUNT(DISTINCT o.order_id) AS total_orders,
      SUM(oi.qty)                AS total_qty
    FROM orders_v2 o
    LEFT JOIN order_items oi ON oi.order_id = o.order_id
    ${where.replace("order_id","o.order_id").replace("order_date","o.order_date").replace("platform","o.platform").replace("shop","o.shop")}
    GROUP BY o.platform
    ORDER BY total_revenue DESC
  `).bind(...params).all()

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
  const url = new URL(request.url)
  const from = url.searchParams.get("from") || ""
  const to = url.searchParams.get("to") || ""
  const platform = url.searchParams.get("platform") || ""
  const shop = url.searchParams.get("shop") || ""
  const sortBy = url.searchParams.get("sort") || "qty"

  const conds = ["o.order_type = 'normal'"]
  const params = []
  if (from) { conds.push("date(o.order_date) >= ?"); params.push(from) }
  if (to) { conds.push("date(o.order_date) <= ?"); params.push(to) }
  if (platform) { conds.push("o.platform = ?"); params.push(platform) }
  if (shop) { conds.push("o.shop = ?"); params.push(shop) }
  const where = "WHERE " + conds.join(" AND ")

  const orderCol = sortBy === "revenue" ? "total_revenue"
    : sortBy === "profit" ? "total_profit"
    : "total_qty"

  const rows = await env.DB.prepare(`
    SELECT
      oi.sku,
      oi.product_name,
      SUM(oi.qty)                                                          AS total_qty,
      SUM(oi.revenue_line)                                                 AS total_revenue,
      SUM(o.profit_real * oi.revenue_line / NULLIF(o.revenue, 0))         AS total_profit,
      COUNT(DISTINCT oi.order_id)                                          AS total_orders,
      GROUP_CONCAT(DISTINCT o.platform)                                    AS platforms,
      GROUP_CONCAT(DISTINCT o.shop)                                        AS shops
    FROM order_items oi
    JOIN orders_v2 o ON oi.order_id = o.order_id
    ${where}
    GROUP BY oi.sku
    ORDER BY ${orderCol} DESC
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}

export { uniqueSkus, topSku, topProduct, topShop, topPlatform, cancelStats, priceCalc, topSkuFull }
