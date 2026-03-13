export default {
  async fetch(request, env) {

    const url = new URL(request.url)

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }

    if (request.method === "OPTIONS")
      return new Response("", { headers: cors })

    if (url.pathname === "/favicon.ico")
      return new Response("", { status: 204 })

    if (url.pathname === "/")
      return new Response("ShopHuyVan Profit API v2")

    try {

      // ── Products ──────────────────────────────────────────────────
      if (url.pathname === "/api/products")
        return handleProducts(request, env, cors)

      if (url.pathname.startsWith("/api/products/") && request.method === "DELETE") {
        const sku = decodeURIComponent(url.pathname.replace("/api/products/", ""))
        await env.DB.prepare(`DELETE FROM products WHERE sku = ?`).bind(sku).run()
        return Response.json({ status: "ok" }, { headers: cors })
      }

      // ── Cost Settings ─────────────────────────────────────────────
      if (url.pathname === "/api/cost-settings")
        return handleCostSettings(request, env, cors)

      // ── Import Orders ─────────────────────────────────────────────
      if (url.pathname === "/api/import-orders")
        return importOrders(request, env, cors)

      // ── Dashboard (tổng quan) ─────────────────────────────────────
      if (url.pathname === "/api/dashboard")
        return dashboard(request, env, cors)

      // ── Doanh thu theo ngày ───────────────────────────────────────
      if (url.pathname === "/api/revenue-by-day")
        return revenueByDay(request, env, cors)

      // ── Lợi nhuận theo ngày ───────────────────────────────────────
      if (url.pathname === "/api/profit-by-day")
        return profitByDay(request, env, cors)

      // ── Top SKU ───────────────────────────────────────────────────
      if (url.pathname === "/api/top-sku")
        return topSku(request, env, cors)

      // ── Top sản phẩm ──────────────────────────────────────────────
      if (url.pathname === "/api/top-product")
        return topProduct(request, env, cors)

      // ── Top shop ──────────────────────────────────────────────────
      if (url.pathname === "/api/top-shop")
        return topShop(request, env, cors)

      // ── Top sàn ───────────────────────────────────────────────────
      if (url.pathname === "/api/top-platform")
        return topPlatform(request, env, cors)

      // ── Thống kê hủy / hoàn ──────────────────────────────────────
      if (url.pathname === "/api/cancel-stats")
  return cancelStats(request, env, cors)

      if (url.pathname === "/api/export-orders")
        return exportOrders(request, env, cors)

      // ── Máy tính giá bán ─────────────────────────────────────────
      if (url.pathname === "/api/price-calc")
        return priceCalc(request, env, cors)

      return new Response("Not found", { status: 404, headers: cors })

    } catch (e) {
      return new Response(e.toString(), { status: 500, headers: cors })
    }
  }
}


// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

// Lấy filter từ query string: ?from=2026-01-01&to=2026-12-31&platform=tiktok&shop=ShopHuyVan
function getFilters(url) {
  return {
    from:     url.searchParams.get("from")     || null,
    to:       url.searchParams.get("to")       || null,
    platform: url.searchParams.get("platform") || null,
    shop:     url.searchParams.get("shop")     || null,
  }
}

// Build WHERE clause động từ filter
function buildWhere(filters, prefix = "") {
  const conds = [`${prefix}order_type = 'normal'`]
  const params = []

  if (filters.from) {
    conds.push(`date(${prefix}order_date) >= ?`)
    params.push(filters.from)
  }
  if (filters.to) {
    conds.push(`date(${prefix}order_date) <= ?`)
    params.push(filters.to)
  }
  if (filters.platform) {
    conds.push(`${prefix}platform = ?`)
    params.push(filters.platform)
  }
  if (filters.shop) {
    conds.push(`${prefix}shop = ?`)
    params.push(filters.shop)
  }

  return { where: "WHERE " + conds.join(" AND "), params }
}

// Lấy toàn bộ cost_settings thành object key→value
async function getCostSettings(env) {
  const rows = await env.DB.prepare(`SELECT cost_key, cost_value, cost_type FROM cost_settings`).all()
  const cfg = {}
  for (const r of rows.results) {
    cfg[r.cost_key] = { value: r.cost_value, type: r.cost_type }
  }
  return cfg
}

// Tính tất cả phí và lợi nhuận từ 1 order row + cost settings
function calcProfit(order, cfg) {
  const rev = order.revenue || 0
  const qty = order.qty     || 1

  const platform = order.platform || "unknown"

  // Phí % theo sàn (dạng: shopee_platform_fee, tiktok_platform_fee, lazada_platform_fee)
  const platformFee  = rev * pct(cfg, `${platform}_platform_fee`)
  const adsFee       = rev * pct(cfg, `${platform}_ads`)
  const affiliateFee = rev * pct(cfg, `${platform}_affiliate`)

  // Phí cố định chung
  const packFee      = num(cfg, "packaging")     * qty
  const opFee        = num(cfg, "operation")     * qty
  const laborFee     = num(cfg, "labor")         * qty

  const totalFee = platformFee + adsFee + affiliateFee + packFee + opFee + laborFee

  const costInvoice = (order.cost_invoice || 0) * qty
  const costReal    = (order.cost_real    || 0) * qty

  // Lãi HĐ = doanh thu - vốn HĐ - phí
  const profitInvoice = rev - costInvoice - totalFee

  // Lãi Thực = doanh thu - vốn Thực - phí
  const profitReal    = rev - costReal    - totalFee

  // Thuế khoán 1.5% trên doanh thu
  const taxFlat = rev * 0.015

  // Thuế lợi nhuận 17% trên Lãi HĐ (chỉ khi lãi > 0)
  const taxIncome = profitInvoice > 0 ? profitInvoice * 0.17 : 0

  return {
    revenue:        rev,
    total_fee:      totalFee,
    cost_invoice:   costInvoice,
    cost_real:      costReal,
    profit_invoice: profitInvoice,
    profit_real:    profitReal,
    tax_flat:       taxFlat,
    tax_income:     taxIncome,
    profit_after_tax: profitReal - taxFlat - taxIncome,
  }
}

function pct(cfg, key) {
  return cfg[key] ? (cfg[key].value / 100) : 0
}
function num(cfg, key) {
  return cfg[key] ? cfg[key].value : 0
}


// ════════════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════════════
async function handleProducts(request, env, cors) {

  if (request.method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT * FROM products ORDER BY sku
    `).all()
    return Response.json(rows.results, { headers: cors })
  }

  if (request.method === "POST") {
    const b = await request.json()
    await env.DB.prepare(`
      INSERT INTO products (sku, product_name, cost_invoice, cost_real, is_combo, combo_items, combo_qty)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(sku) DO UPDATE SET
        product_name = excluded.product_name,
        cost_invoice = excluded.cost_invoice,
        cost_real    = excluded.cost_real,
        is_combo     = excluded.is_combo,
        combo_items  = excluded.combo_items,
        combo_qty    = excluded.combo_qty
    `).bind(
      b.sku, b.product_name, b.cost_invoice, b.cost_real,
      b.is_combo || 0, b.combo_items || null, b.combo_qty || 1
    ).run()
    return Response.json({ status: "ok" }, { headers: cors })
  }
}


// ════════════════════════════════════════════════════════════════════
// COST SETTINGS
// Lưu dạng key-value: cost_key, cost_value, cost_type ('pct'|'fixed')
// Ví dụ: shopee_platform_fee / 10 / pct
//        tiktok_ads / 5 / pct
//        packaging / 3000 / fixed
// ════════════════════════════════════════════════════════════════════
async function handleCostSettings(request, env, cors) {

  if (request.method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT cost_key, cost_value, cost_type FROM cost_settings ORDER BY cost_key
    `).all()
    return Response.json(rows.results, { headers: cors })
  }

  if (request.method === "POST") {
    const items = await request.json() // array of {cost_key, cost_value, cost_type}
    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO cost_settings (cost_key, cost_value, cost_type)
        VALUES (?,?,?)
        ON CONFLICT(cost_key) DO UPDATE SET
          cost_value = excluded.cost_value,
          cost_type  = excluded.cost_type
      `).bind(item.cost_key, item.cost_value, item.cost_type).run()
    }
    return Response.json({ status: "ok" }, { headers: cors })
  }
}


// ════════════════════════════════════════════════════════════════════
// IMPORT ORDERS
// - Lưu từng dòng (mỗi SKU 1 dòng)
// - Tính profit ngay khi import dựa trên cost_settings hiện tại
// ════════════════════════════════════════════════════════════════════
async function importOrders(request, env, cors) {

  const orders = await request.json()
  const cfg    = await getCostSettings(env)

  // 1. Lấy toàn bộ products 1 lần duy nhất
  const productRows = await env.DB.prepare(`SELECT sku, cost_invoice, cost_real FROM products`).all()
  const productMap  = {}
  for (const p of productRows.results) {
    productMap[p.sku] = p
  }

  // 2. Tính profit cho từng order (không query DB trong loop)
  const processed = orders.map(o => {
    const product = productMap[o.sku] || { cost_invoice: 0, cost_real: 0 }
    const orderWithCost = { ...o, cost_invoice: product.cost_invoice, cost_real: product.cost_real }
    const p = calcProfit(orderWithCost, cfg)
    return {
      order_id:       o.order_id,
      sku:            o.sku,
      product_name:   o.product_name   || "",
      shop:           o.shop           || "",
      platform:       o.platform       || "",
      order_type:     o.order_type     || "normal",
      qty:            o.qty            || 1,
      revenue:        o.revenue        || 0,
      fee:            p.total_fee,
      profit:         p.profit_real,
      cost_invoice:   p.cost_invoice,
      cost_real:      p.cost_real,
      profit_invoice: p.profit_invoice,
      profit_real:    p.profit_real,
      tax_flat:       p.tax_flat,
      tax_income:     p.tax_income,
      cancel_reason:  o.cancel_reason  || null,
      return_fee:     o.return_fee     || 0,
      raw_revenue:    o.raw_revenue    || 0,
      order_date:     o.order_date     || "",
    }
  })

  // 3. Batch insert — mỗi batch 50 dòng
  const BATCH = 50
  let imported = 0
  let skipped  = 0

  for (let i = 0; i < processed.length; i += BATCH) {
    const chunk = processed.slice(i, i + BATCH)
    const stmts = chunk.map(o =>
      env.DB.prepare(`
        INSERT INTO orders
          (order_id, sku, product_name, shop, platform, order_type,
           qty, revenue, fee, profit,
           cost_invoice, cost_real,
           profit_invoice, profit_real,
           tax_flat, tax_income,
           cancel_reason, return_fee, raw_revenue,
           order_date, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(order_id, sku) DO UPDATE SET
          revenue        = excluded.revenue,
          fee            = excluded.fee,
          profit         = excluded.profit,
          profit_invoice = excluded.profit_invoice,
          profit_real    = excluded.profit_real,
          tax_flat       = excluded.tax_flat,
          tax_income     = excluded.tax_income,
          order_date     = excluded.order_date
      `).bind(
        o.order_id, o.sku, o.product_name, o.shop, o.platform, o.order_type,
        o.qty, o.revenue, o.fee, o.profit,
        o.cost_invoice, o.cost_real,
        o.profit_invoice, o.profit_real,
        o.tax_flat, o.tax_income,
        o.cancel_reason, o.return_fee, o.raw_revenue,
        o.order_date
      )
    )

    try {
      await env.DB.batch(stmts)
      imported += chunk.length
    } catch(e) {
      skipped += chunk.length
      console.log("Batch error:", e.message)
    }
  }

  return Response.json({ status: "ok", imported, skipped }, { headers: cors })
}

    const orderWithCost = {
      ...o,
      cost_invoice: product?.cost_invoice || 0,
      cost_real:    product?.cost_real    || 0,
    }

    const p = calcProfit(orderWithCost, cfg)

    try {
      await env.DB.prepare(`
        INSERT INTO orders
          (order_id, sku, product_name, shop, platform, order_type,
           qty, revenue, fee, profit,
           cost_invoice, cost_real,
           profit_invoice, profit_real,
           tax_flat, tax_income,
           cancel_reason, return_fee,
           order_date, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(order_id, sku) DO UPDATE SET
          revenue        = excluded.revenue,
          fee            = excluded.fee,
          profit         = excluded.profit,
          profit_invoice = excluded.profit_invoice,
          profit_real    = excluded.profit_real,
          tax_flat       = excluded.tax_flat,
          tax_income     = excluded.tax_income
      `).bind(
        o.order_id,
        o.sku,
        o.product_name   || "",
        o.shop           || "",
        o.platform       || "",
        o.order_type     || "normal",
        o.qty            || 1,
        o.revenue        || 0,
        p.total_fee,
        p.profit_real,
        p.cost_invoice,
        p.cost_real,
        p.profit_invoice,
        p.profit_real,
        p.tax_flat,
        p.tax_income,
        o.cancel_reason  || null,
        o.return_fee     || 0,
        o.order_date     || "",
      ).run()
      imported++
    } catch (e) {
      skipped++
      console.log("Skip row:", e.message)
    }
  }

  return Response.json({ status: "ok", imported, skipped }, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// DASHBOARD — Tổng quan (đếm unique order_id)
// ════════════════════════════════════════════════════════════════════
async function dashboard(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const row = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT order_id)  AS total_orders,
      SUM(revenue)              AS total_revenue,
      SUM(fee)                  AS total_fee,
      SUM(cost_invoice)         AS total_cost_invoice,
      SUM(cost_real)            AS total_cost_real,
      SUM(profit_invoice)       AS total_profit_invoice,
      SUM(profit_real)          AS total_profit_real,
      SUM(tax_flat)             AS total_tax_flat,
      SUM(tax_income)           AS total_tax_income,
      SUM(tax_flat + tax_income) AS total_tax
    FROM orders
    ${where}
  `).bind(...params).first()

  // Thống kê hủy/hoàn (không lọc order_type)
  const cancelRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END) AS cancel_orders,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END) AS return_orders,
      COUNT(DISTINCT order_id) AS total_all_orders,
      SUM(CASE WHEN order_type='return' THEN return_fee ELSE 0 END) AS total_return_fee
    FROM orders
    ${where.replace("order_type = 'normal' AND ", "").replace("WHERE order_type = 'normal'", "WHERE 1=1")}
  `).bind(...params).first()

  return Response.json({ ...row, ...cancelRow }, { headers: cors })
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

async function exportOrders(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const conds = ["1=1"]
  const params = []
  if (filters.from)     { conds.push(`date(order_date) >= ?`); params.push(filters.from) }
  if (filters.to)       { conds.push(`date(order_date) <= ?`); params.push(filters.to) }
  if (filters.platform) { conds.push(`platform = ?`);          params.push(filters.platform) }
  if (filters.shop)     { conds.push(`shop = ?`);              params.push(filters.shop) }

  const rows = await env.DB.prepare(`
    SELECT order_date, platform, shop, order_id, sku, product_name,
           qty, revenue, cost_real, fee, profit_real, order_type
    FROM orders
    WHERE ${conds.join(" AND ")}
    ORDER BY order_date DESC
    LIMIT 10000
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}