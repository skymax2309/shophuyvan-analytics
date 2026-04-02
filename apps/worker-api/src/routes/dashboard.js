// ════════════════════════════════════════════════════════════════════
// DASHBOARD — Tổng quan (đếm unique order_id)
// ════════════════════════════════════════════════════════════════════

import { getFilters, buildWhere } from '../utils/filters.js'
import { getCostSettings, calcProfit } from '../utils/db.js'


async function dashboard(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  // Dùng orders_v2 — mỗi dòng = 1 đơn hàng (đúng hơn)
  const whereV2        = where.replace(/\borders\b/g, "orders_v2")
  const whereV2NoType  = whereV2.replace("order_type = 'normal' AND ", "").replace("WHERE order_type = 'normal'", "WHERE 1=1")

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
    FROM orders_v2
    ${whereV2}
  `).bind(...params).first()

const cancelRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END) AS cancel_orders,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END) AS return_orders,
      COUNT(DISTINCT order_id) AS total_all_orders,
      SUM(CASE WHEN order_type='return' THEN return_fee ELSE 0 END) AS total_return_fee,

      -- TikTok
      SUM(CASE WHEN platform='tiktok' AND (order_type='cancel' OR order_type='return') AND return_fee > 0 THEN return_fee ELSE 0 END) AS total_tiktok_cancel_fee,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='cancel' AND (return_fee > 0 OR cancel_reason LIKE '%thất bại%' OR cancel_reason LIKE '%không giao được%') THEN order_id END) AS tiktok_failed_delivery_count,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='return' THEN order_id END) AS tiktok_return_count,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='cancel' AND return_fee = 0 AND cancel_reason NOT LIKE '%thất bại%' AND cancel_reason NOT LIKE '%không giao được%' THEN order_id END) AS tiktok_free_cancel_count,
      SUM(CASE WHEN platform='tiktok' AND order_type='cancel' AND (return_fee > 0 OR cancel_reason LIKE '%thất bại%' OR cancel_reason LIKE '%không giao được%') THEN return_fee ELSE 0 END) AS tiktok_failed_delivery_fee,

      -- Shopee
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='cancel' THEN order_id END) AS shopee_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='cancel' AND return_fee > 0 THEN order_id END) AS shopee_failed_delivery_count,
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='cancel' AND return_fee = 0 THEN order_id END) AS shopee_free_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='return' THEN order_id END) AS shopee_return_count,
      SUM(CASE WHEN platform='shopee' AND (order_type='cancel' OR order_type='return') AND return_fee > 0 THEN return_fee ELSE 0 END) AS total_shopee_cancel_fee,
      SUM(CASE WHEN platform='shopee' AND order_type='cancel' AND return_fee > 0 THEN return_fee ELSE 0 END) AS shopee_failed_delivery_fee,
      SUM(CASE WHEN platform='shopee' AND order_type='return' THEN return_fee ELSE 0 END) AS shopee_return_fee,

      -- Lazada
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='cancel' THEN order_id END) AS lazada_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='cancel' AND return_fee > 0 THEN order_id END) AS lazada_failed_delivery_count,
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='cancel' AND return_fee = 0 THEN order_id END) AS lazada_free_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='return' THEN order_id END) AS lazada_return_count,
      SUM(CASE WHEN platform='lazada' AND (order_type='cancel' OR order_type='return') AND return_fee > 0 THEN return_fee ELSE 0 END) AS total_lazada_cancel_fee,
      SUM(CASE WHEN platform='lazada' AND order_type='cancel' AND return_fee > 0 THEN return_fee ELSE 0 END) AS lazada_failed_delivery_fee,
      SUM(CASE WHEN platform='lazada' AND order_type='return' THEN return_fee ELSE 0 END) AS lazada_return_fee
    FROM orders_v2
    ${whereV2NoType}
  `).bind(...params).first()

  const breakdownRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN order_type='normal' THEN order_id END)  AS success_orders,
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END)  AS cancel_orders_count,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END)  AS return_orders_count,
      SUM(CASE WHEN order_type='normal' THEN revenue    ELSE 0 END)    AS revenue_normal,
      SUM(CASE WHEN order_type='return' THEN raw_revenue ELSE 0 END)   AS revenue_returned,
      SUM(CASE WHEN order_type='return' THEN return_fee  ELSE 0 END)   AS total_return_shipping,

      -- Chỉ số giảm giá mới
      SUM(COALESCE(discount_shop, 0))                                   AS total_discount_shop,
      SUM(COALESCE(discount_shopee, 0))                                 AS total_discount_shopee,
      SUM(COALESCE(discount_combo, 0))                                  AS total_discount_combo,
      SUM(COALESCE(shipping_return_fee, 0))                             AS total_shipping_return_fee,
      COUNT(DISTINCT CASE WHEN COALESCE(discount_shop,0) > 0 THEN order_id END)   AS orders_with_discount_shop,
      COUNT(DISTINCT CASE WHEN COALESCE(discount_shopee,0) > 0 THEN order_id END) AS orders_with_discount_shopee,
      COUNT(DISTINCT CASE WHEN COALESCE(discount_combo,0) > 0 THEN order_id END)  AS orders_with_discount_combo
    FROM orders_v2
    ${whereV2NoType}
  `).bind(...params).first()

  // Bổ sung query gom nhóm chi tiết theo từng shop để hiển thị tooltip
  const shopBreakdownRow = await env.DB.prepare(`
    SELECT
      shop,
      COUNT(DISTINCT order_id) AS shop_orders,
      SUM(revenue) AS shop_revenue
    FROM orders_v2
    ${whereV2}
    GROUP BY shop
    ORDER BY shop_revenue DESC
  `).bind(...params).all()

  return Response.json({ ...row, ...cancelRow, ...breakdownRow, shop_breakdown: shopBreakdownRow.results }, { headers: cors })
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
    FROM orders_v2
    ${where}
    GROUP BY d
    ORDER BY d
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// PROFIT BY DAY
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
    FROM orders_v2
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
    FROM order_items oi
    JOIN orders_v2 o ON oi.order_id = o.order_id
    WHERE oi.sku IS NOT NULL AND oi.sku != ''
      AND o.order_type != 'cancel'
    GROUP BY oi.sku
    ORDER BY oi.sku
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


// ════════════════════════════════════════════════════════════════════
// TOP PRODUCT (by product_name)
// ════════════════════════════════════════════════════════════════════
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
    FROM orders_v2
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
    FROM orders_v2
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
    fee_platform:    p.fee_platform   || 0,
    fee_payment:     p.fee_payment    || 0,
    fee_affiliate:   p.fee_affiliate  || 0,
    fee_ads:         p.fee_ads        || 0,
    fee_piship:      p.fee_piship     || 0,
    fee_service:     p.fee_service    || 0,
  }, { headers: cors })
}

// ════════════════════════════════════════════════════════════════════
// TOP SKU FULL — Toàn bộ SKU, sort theo số lượng bán
// Hỗ trợ filter: platform, shop, from, to
// ════════════════════════════════════════════════════════════════════
async function topSkuFull(request, env, cors) {
  const url     = new URL(request.url)
  const from     = url.searchParams.get("from")     || ""
  const to       = url.searchParams.get("to")       || ""
  const platform = url.searchParams.get("platform") || ""
  const shop     = url.searchParams.get("shop")     || ""
  const sortBy   = url.searchParams.get("sort")     || "qty"  // qty | revenue | profit

  const conds  = ["o.order_type = 'normal'"]
  const params = []
  if (from)     { conds.push("date(o.order_date) >= ?"); params.push(from) }
  if (to)       { conds.push("date(o.order_date) <= ?"); params.push(to) }
  if (platform) { conds.push("o.platform = ?");          params.push(platform) }
  if (shop)     { conds.push("o.shop = ?");              params.push(shop) }
  const where = "WHERE " + conds.join(" AND ")

  const orderCol = sortBy === "revenue" ? "total_revenue"
                 : sortBy === "profit"  ? "total_profit"
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

export { dashboard, revenueByDay, profitByDay, uniqueSkus,
         topSku, topProduct, topShop, topPlatform, cancelStats, priceCalc, topSkuFull }
