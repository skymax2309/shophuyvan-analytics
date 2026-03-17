// ════════════════════════════════════════════════════════════════════
// DASHBOARD — Tổng quan (đếm unique order_id)
// ════════════════════════════════════════════════════════════════════

import { getFilters, buildWhere } from '../utils/filters.js'
import { getCostSettings, calcProfit } from '../utils/db.js'


async function dashboard(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const row = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT order_id)   AS total_orders,
      SUM(revenue)               AS total_revenue,
      SUM(fee)                   AS total_fee,
      SUM(cost_invoice)          AS total_cost_invoice,
      SUM(cost_real)             AS total_cost_real,
      SUM(profit_invoice)        AS total_profit_invoice,
      SUM(profit_real)           AS total_profit_real,
      SUM(tax_flat)              AS total_tax_flat,
      SUM(tax_income)            AS total_tax_income,
      SUM(tax_flat + tax_income) AS total_tax,
      SUM(fee_platform)          AS total_platform_fee,
      SUM(fee_payment)           AS total_payment_fee,
      SUM(fee_affiliate)         AS total_affiliate_fee,
      SUM(fee_ads)               AS total_ads_fee,
      SUM(fee_piship)            AS total_piship_fee,
      SUM(fee_service)           AS total_service_fee,
      SUM(fee_packaging + fee_operation + fee_labor) AS total_fixed_fee
    FROM orders
    ${where}
  `).bind(...params).first()

  // Thống kê hủy/hoàn (không lọc order_type)
  const cancelRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END) AS cancel_orders,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END) AS return_orders,
      COUNT(DISTINCT order_id) AS total_all_orders,
      SUM(CASE WHEN order_type='return' THEN return_fee ELSE 0 END) AS total_return_fee,
      SUM(CASE WHEN platform='tiktok' AND (order_type='cancel' OR order_type='return') AND return_fee > 0 THEN return_fee ELSE 0 END) AS total_tiktok_cancel_fee,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='cancel' AND return_fee = 1620 THEN order_id END) AS tiktok_failed_delivery_count,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='return' THEN order_id END) AS tiktok_return_count,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='cancel' AND return_fee = 0 THEN order_id END) AS tiktok_free_cancel_count
    FROM orders
    ${where.replace("order_type = 'normal' AND ", "").replace("WHERE order_type = 'normal'", "WHERE 1=1")}
  `).bind(...params).first()

  // Thống kê chi tiết breakdown doanh thu (dùng cho báo cáo)
  const breakdownRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN order_type='normal' THEN order_id END)  AS success_orders,
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END)  AS cancel_orders_count,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END)  AS return_orders_count,
      SUM(CASE WHEN order_type='normal' THEN revenue    ELSE 0 END)    AS revenue_normal,
      SUM(CASE WHEN order_type='return' THEN raw_revenue ELSE 0 END)   AS revenue_returned,
      SUM(CASE WHEN order_type='return' THEN return_fee  ELSE 0 END)   AS total_return_shipping
    FROM orders
    ${where.replace("order_type = 'normal' AND ", "").replace("WHERE order_type = 'normal'", "WHERE 1=1")}
  `).bind(...params).first()

  return Response.json({ ...row, ...cancelRow, ...breakdownRow }, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// REVENUE BY DAY
// ════════════════════════════════════════════════════════════════════
async function revenueByDay(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const rows = await env.DB.prepare(`
    SELECT
      date(order_date) AS d,
      SUM(revenue)     AS revenue,
      COUNT(DISTINCT order_id) AS orders
    FROM orders
    ${where}
    GROUP BY d
    ORDER BY d
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// PROFIT BY DAY
// ════════════════════════════════════════════════════════════════════
async function profitByDay(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const rows = await env.DB.prepare(`
    SELECT
      date(order_date)     AS d,
      SUM(profit_invoice)  AS profit_invoice,
      SUM(profit_real)     AS profit_real,
      SUM(tax_flat)        AS tax_flat,
      SUM(tax_income)      AS tax_income
    FROM orders
    ${where}
    GROUP BY d
    ORDER BY d
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}

// ════════════════════════════════════════════════════════════════════
// UNIQUE SKUS — danh sách SKU + tên SP duy nhất từ orders
// Dùng cho: đồng bộ SKU, dropdown chọn SKU
// ════════════════════════════════════════════════════════════════════
async function uniqueSkus(request, env, cors) {
  const rows = await env.DB.prepare(`
    SELECT
      sku,
      product_name,
      MAX(order_date) AS last_order_date
    FROM orders
    WHERE sku IS NOT NULL AND sku != ''
      AND order_type != 'cancel'
    GROUP BY sku
    ORDER BY sku
  `).all()

  return Response.json(rows.results, { headers: cors })
}

// ════════════════════════════════════════════════════════════════════
// TOP SKU
// ════════════════════════════════════════════════════════════════════
async function topSku(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)
  const limit = new URL(request.url).searchParams.get("limit") || 20

  const rows = await env.DB.prepare(`
    SELECT
      sku,
      SUM(qty)                 AS total_qty,
      SUM(revenue)             AS total_revenue,
      SUM(profit_real)         AS total_profit,
      COUNT(DISTINCT order_id) AS total_orders
    FROM orders
    ${where}
    GROUP BY sku
    ORDER BY total_revenue DESC
    LIMIT ${limit}
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// TOP PRODUCT (by product_name)
// ════════════════════════════════════════════════════════════════════
async function topProduct(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)
  const limit = new URL(request.url).searchParams.get("limit") || 20

  const rows = await env.DB.prepare(`
    SELECT
      product_name,
      SUM(qty)                 AS total_qty,
      SUM(revenue)             AS total_revenue,
      SUM(profit_real)         AS total_profit,
      COUNT(DISTINCT order_id) AS total_orders
    FROM orders
    ${where}
    GROUP BY product_name
    ORDER BY total_revenue DESC
    LIMIT ${limit}
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// TOP SHOP
// ════════════════════════════════════════════════════════════════════
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
    FROM orders
    ${where}
    GROUP BY shop, platform
    ORDER BY total_revenue DESC
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// TOP PLATFORM
// ════════════════════════════════════════════════════════════════════
async function topPlatform(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const rows = await env.DB.prepare(`
    SELECT
      platform,
      SUM(revenue)             AS total_revenue,
      SUM(profit_real)         AS total_profit,
      COUNT(DISTINCT order_id) AS total_orders,
      SUM(qty)                 AS total_qty
    FROM orders
    ${where}
    GROUP BY platform
    ORDER BY total_revenue DESC
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// CANCEL / RETURN STATS
// ════════════════════════════════════════════════════════════════════
async function cancelStats(request, env, cors) {
  const url = new URL(request.url)
  const filters = getFilters(url)

  // Build WHERE không có filter order_type
  const conds = ["1=1"]
  const params = []
  if (filters.from)     { conds.push(`date(order_date) >= ?`); params.push(filters.from) }
  if (filters.to)       { conds.push(`date(order_date) <= ?`); params.push(filters.to) }
  if (filters.platform) { conds.push(`platform = ?`);          params.push(filters.platform) }
  if (filters.shop)     { conds.push(`shop = ?`);              params.push(filters.shop) }
  const where = "WHERE " + conds.join(" AND ")

  const rows = await env.DB.prepare(`
    SELECT
      order_type,
      platform,
      COUNT(DISTINCT order_id) AS total_orders,
      SUM(raw_revenue)         AS total_revenue,
      cancel_reason
    FROM orders
    ${where}
    GROUP BY order_type, platform, cancel_reason
    ORDER BY total_orders DESC
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// PRICE CALCULATOR
// POST { sku, sell_price, platform }
// ════════════════════════════════════════════════════════════════════
async function priceCalc(request, env, cors) {
  const { sku, sell_price, platform } = await request.json()

  const product = await env.DB.prepare(`
    SELECT cost_invoice, cost_real, product_name FROM products WHERE sku = ?
  `).bind(sku).first()

  if (!product) {
    return Response.json({ error: "SKU không tìm thấy" }, { status: 404, headers: cors })
  }

  const cfg = await getCostSettings(env)

  const orderSim = {
    revenue:       sell_price,
    qty:           1,
    platform:      platform || "tiktok",
    cost_invoice:  product.cost_invoice,
    cost_real:     product.cost_real,
  }

  const p = calcProfit(orderSim, cfg)

  return Response.json({
    sku,
    product_name:    product.product_name,
    sell_price,
    cost_invoice:    product.cost_invoice,
    cost_real:       product.cost_real,
    total_fee:       p.total_fee,
    profit_invoice:  p.profit_invoice,
    profit_real:     p.profit_real,
    tax_flat:        p.tax_flat,
    tax_income:      p.tax_income,
    profit_after_tax: p.profit_after_tax,
    is_loss:         p.profit_real < 0,
  }, { headers: cors })
}

export { dashboard, revenueByDay, profitByDay, uniqueSkus,
         topSku, topProduct, topShop, topPlatform, cancelStats, priceCalc }
