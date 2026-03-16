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
      if (url.pathname === "/api/recalc-cost" && request.method === "POST")
        return recalcCost(request, env, cors)
	if (url.pathname === "/api/update-cost-prices" && request.method === "POST")
        return updateCostPrices(request, env, cors)
	if (url.pathname === "/api/sku-map" && request.method === "GET")
        return getSkuMap(request, env, cors)
	if (url.pathname === "/api/sku-groups" && request.method === "GET")
        return getSkuGroups(request, env, cors)
      if (url.pathname === "/api/sku-groups" && request.method === "POST")
        return saveSkuGroup(request, env, cors)
      if (url.pathname === "/api/sku-groups/update-price" && request.method === "POST")
        return updateGroupPrice(request, env, cors)
      if (url.pathname === "/api/sku-groups/delete" && request.method === "POST")
        return deleteSkuGroup(request, env, cors)
      if (url.pathname === "/api/parse-invoice" && request.method === "POST")
        return parseInvoiceAI(request, env, cors)
      if (url.pathname === "/api/save-invoice" && request.method === "POST")
        return saveInvoice(request, env, cors)
      if (url.pathname === "/api/invoices")
        return listInvoices(request, env, cors)
      if (url.pathname === "/api/invoice-file")
        return getInvoiceFile(request, env, cors)

      // ── Doanh thu theo ngày ───────────────────────────────────────
      if (url.pathname === "/api/revenue-by-day")
        return revenueByDay(request, env, cors)

      // ── Lợi nhuận theo ngày ───────────────────────────────────────
      if (url.pathname === "/api/profit-by-day")
        return profitByDay(request, env, cors)

      // ── Top SKU ───────────────────────────────────────────────────
      if (url.pathname === "/api/top-sku")
        return topSku(request, env, cors)
	
	if (url.pathname === "/api/unique-skus")
        return uniqueSkus(request, env, cors)

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

      if (url.pathname === "/api/upload-report")
        return uploadReport(request, env, cors)

      if (url.pathname === "/api/reports")
        return getReports(request, env, cors)

      if (url.pathname.startsWith("/api/reports/") && request.method === "DELETE") {
        const id = url.pathname.replace("/api/reports/", "")
        const { r2_key } = await request.json()
        await env.DB.prepare(`DELETE FROM platform_reports WHERE id = ?`).bind(id).run()
        if (r2_key) await env.STORAGE.delete(r2_key)
        return Response.json({ status: "ok" }, { headers: cors })
      }

      if (url.pathname === "/api/report-file")
        return getReportFile(request, env, cors)

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

 // ── Phí Shopee ───────────────────────────────────────────────────
  const shopeeCommission = platform === "shopee" ? rev * pct(cfg, "shopee_platform_fee") : 0
  const shopeePayment    = platform === "shopee" ? rev * pct(cfg, "shopee_payment_fee")  : 0
  const shopeeAffiliate  = platform === "shopee" ? rev * pct(cfg, "shopee_affiliate")    : 0
  const shopeeAds        = platform === "shopee" ? rev * pct(cfg, "shopee_ads")          : 0

  // ── Phí TikTok ───────────────────────────────────────────────────
  const tiktokCommission   = platform === "tiktok" ? rev * pct(cfg, "tiktok_commission")     : 0
  const tiktokTransaction  = platform === "tiktok" ? rev * pct(cfg, "tiktok_transaction_fee"): 0
  const tiktokAffiliate    = platform === "tiktok" ? rev * pct(cfg, "tiktok_affiliate")      : 0
  const tiktokAds          = platform === "tiktok" ? rev * pct(cfg, "tiktok_ads")            : 0

  // ── Phí Lazada ───────────────────────────────────────────────────
  const lazadaCommission   = platform === "lazada" ? rev * pct(cfg, "lazada_commission")    : 0
  const lazadaHandling     = platform === "lazada" ? rev * pct(cfg, "lazada_handling_fee")  : 0
  const lazadaVat          = platform === "lazada" ? rev * pct(cfg, "lazada_vat")           : 0
  const lazadaPit          = platform === "lazada" ? rev * pct(cfg, "lazada_pit")           : 0
  const lazadaShippingDiff = platform === "lazada" ? rev * pct(cfg, "lazada_shipping_diff") : 0
  const lazadaAds          = platform === "lazada" ? rev * pct(cfg, "lazada_ads")           : 0

  // ── Phí cố định chung (per SKU) ──────────────────────────────────
  const packFee  = num(cfg, "packaging") * qty
  const opFee    = num(cfg, "operation") * qty
  const laborFee = num(cfg, "labor")     * qty

  // ── Phí per đơn — chỉ tính dòng đầu tiên ────────────────────────
  const isFirstSku = order.is_first_sku === true || order.is_first_sku === 1
  const notCancel  = order.order_type !== "cancel"

  // Shopee: PiShip + Service fee
  const pishipFee = (platform === "shopee" && isFirstSku && notCancel)
                      ? num(cfg, "shopee_piship") : 0
  const svcFee    = (platform === "shopee" && isFirstSku && notCancel)
                      ? num(cfg, "shopee_service_fee") : 0

  // TikTok: SFR + Handling fee
  const tiktokSfr      = (platform === "tiktok" && isFirstSku && notCancel)
                           ? num(cfg, "tiktok_sfr") : 0
  const tiktokHandling = (platform === "tiktok" && isFirstSku && notCancel)
                           ? num(cfg, "tiktok_handling_fee") : 0

  // ── Gộp tất cả phí ───────────────────────────────────────────────
  const platformFee  = shopeeCommission + tiktokCommission + lazadaCommission
  const paymentFee   = shopeePayment    + tiktokTransaction
  const affiliateFee = shopeeAffiliate  + tiktokAffiliate
  const adsFee       = shopeeAds        + tiktokAds        + lazadaAds

  const totalFee = platformFee + paymentFee + affiliateFee + adsFee
                 + lazadaHandling + lazadaVat + lazadaPit + lazadaShippingDiff
                 + packFee + opFee + laborFee
                 + pishipFee + svcFee
                 + tiktokSfr + tiktokHandling

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
    revenue:         rev,
    total_fee:       totalFee,
    cost_invoice:    costInvoice,
    cost_real:       costReal,
    profit_invoice:  profitInvoice,
    profit_real:     profitReal,
    tax_flat:        taxFlat,
    tax_income:      taxIncome,
    profit_after_tax: profitReal - taxFlat - taxIncome,
    // Chi tiết từng loại phí
    fee_platform:    platformFee,
    fee_payment:     paymentFee,
    fee_affiliate:   affiliateFee,
    fee_ads:         adsFee,
    fee_piship:      pishipFee + tiktokSfr,
    fee_service:     svcFee + tiktokHandling,
    fee_packaging:   packFee,
    fee_operation:   opFee,
    fee_labor:       laborFee,
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
      SELECT cost_key, cost_value, cost_type, cost_name, calc_type, platform, shop
      FROM cost_settings ORDER BY cost_key
    `).all()
    return Response.json(rows.results, { headers: cors })
  }

  if (request.method === "POST") {
    const items = await request.json()
    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO cost_settings (cost_key, cost_value, cost_type, cost_name, calc_type, platform, shop)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(cost_key) DO UPDATE SET
          cost_value = excluded.cost_value,
          cost_type  = excluded.cost_type,
          cost_name  = excluded.cost_name,
          calc_type  = excluded.calc_type,
          platform   = excluded.platform,
          shop       = excluded.shop
      `).bind(
        item.cost_key,
        item.cost_value,
        item.cost_type  || "fixed",
        item.cost_name  || "",
        item.calc_type  || "per_order",
        item.platform   || "",
        item.shop       || ""
      ).run()
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
      fee_platform:   p.fee_platform   || 0,
      fee_payment:    p.fee_payment    || 0,
      fee_affiliate:  p.fee_affiliate  || 0,
      fee_ads:        p.fee_ads        || 0,
      fee_piship:     p.fee_piship     || 0,
      fee_service:    p.fee_service    || 0,
      fee_packaging:  p.fee_packaging  || 0,
      fee_operation:  p.fee_operation  || 0,
      fee_labor:      p.fee_labor      || 0,
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
           order_date, created_at,
           fee_platform, fee_payment, fee_affiliate, fee_ads,
           fee_piship, fee_service, fee_packaging, fee_operation, fee_labor,
           is_first_sku)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(order_id, sku) DO UPDATE SET
          revenue        = excluded.revenue,
          fee            = excluded.fee,
          profit         = excluded.profit,
          profit_invoice = excluded.profit_invoice,
          profit_real    = excluded.profit_real,
          tax_flat       = excluded.tax_flat,
          tax_income     = excluded.tax_income,
          fee_platform   = excluded.fee_platform,
          fee_payment    = excluded.fee_payment,
          fee_affiliate  = excluded.fee_affiliate,
          fee_ads        = excluded.fee_ads,
          fee_piship     = excluded.fee_piship,
          fee_service    = excluded.fee_service,
          fee_packaging  = excluded.fee_packaging,
          fee_operation  = excluded.fee_operation,
          fee_labor      = excluded.fee_labor,
          order_date     = excluded.order_date
      `).bind(
        o.order_id, o.sku, o.product_name, o.shop, o.platform, o.order_type,
        o.qty, o.revenue, o.fee, o.profit,
        o.cost_invoice, o.cost_real,
        o.profit_invoice, o.profit_real,
        o.tax_flat, o.tax_income,
        o.cancel_reason, o.return_fee, o.raw_revenue,
        o.order_date,
        o.fee_platform || 0, o.fee_payment || 0, o.fee_affiliate || 0, o.fee_ads || 0,
        o.fee_piship   || 0, o.fee_service  || 0, o.fee_packaging || 0,
        o.fee_operation|| 0, o.fee_labor    || 0,
        o.is_first_sku ? 1 : 0
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


// ════════════════════════════════════════════════════════════════════
// DASHBOARD — Tổng quan (đếm unique order_id)
// ════════════════════════════════════════════════════════════════════
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
           qty, revenue, raw_revenue, cost_real, fee, profit_real,
           tax_flat, tax_income, order_type, cancel_reason, return_fee
    FROM orders
    WHERE ${conds.join(" AND ")}
    ORDER BY order_date DESC
    LIMIT ${parseInt(new URL(request.url).searchParams.get("limit") || "10000")}
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}

// ════════════════════════════════════════════════════════════════════
// UPLOAD REPORT — Lưu PDF/Excel báo cáo sàn vào R2 + parse số liệu
// POST multipart/form-data: file, platform, shop, report_type
// ════════════════════════════════════════════════════════════════════
async function uploadReport(request, env, cors) {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors })

  const formData    = await request.formData()
  const file        = formData.get("file")
  const platform    = formData.get("platform")    || "unknown"
  const shop        = formData.get("shop")        || ""
  const report_type = formData.get("report_type") || "income"

  if (!file)
    return Response.json({ error: "Thiếu file" }, { status: 400, headers: cors })

  // ── Đọc file bytes ───────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer()
  const bytes       = new Uint8Array(arrayBuffer)
  const fileName    = file.name

  // ── Xác định tháng từ tên file hoặc ngày hiện tại ────────────────
  const report_month = detectReportMonth(fileName)

  // ── Cấu trúc R2 key ─────────────────────────────────────────────
  // {year}-{month}/{report_type}/{platform}/{filename}
  // VD: 2026-02/Doanh Thu/Shopee/chihuy1984_20260201.pdf
  const folderType = {
    income:  "Doanh Thu",
    expense: "Chi Phí",
    orders:  "Đơn Hàng",
  }[report_type] || "Doanh Thu"

  const platformFolder = {
    shopee: "Shopee",
    tiktok: "TikTok",
    lazada: "Lazada",
  }[platform] || platform

  const r2Key = `${report_month}/${folderType}/${platformFolder}/${fileName}`

  // ── Upload lên R2 ────────────────────────────────────────────────
  await env.STORAGE.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { platform, shop, report_month, report_type }
  })

  // ── Parse số liệu từ nội dung file ───────────────────────────────
  let parsed = {}
  const ext = fileName.split(".").pop().toLowerCase()

  // Nếu client đã parse sẵn (TikTok Excel), dùng luôn
  const parsedJson = formData.get("parsed_json")
  if (parsedJson) {
    parsed = parseTiktokReport(JSON.parse(parsedJson))
  } else if (ext === "pdf") {
    const text = await extractPdfText(bytes)
    // Auto detect loại hóa đơn từ nội dung
    parsed = autoDetectAndParse(text, platform)
  }

  // ── Lưu vào D1 ───────────────────────────────────────────────────
  await env.DB.prepare(`
    INSERT INTO platform_reports
      (platform, shop, report_month, report_type, file_name, r2_key,
       gross_revenue, refund_amount, net_product_revenue,
       platform_subsidy, seller_voucher, co_funded_voucher,
       shipping_net,
       fee_commission, fee_payment, fee_service,
       fee_affiliate, fee_piship_sfr, fee_handling, fee_total,
       compensation,
       tax_vat, tax_pit, tax_total,
       total_payout, raw_data)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(platform, report_month, file_name) DO UPDATE SET
      r2_key              = excluded.r2_key,
      gross_revenue       = excluded.gross_revenue,
      refund_amount       = excluded.refund_amount,
      net_product_revenue = excluded.net_product_revenue,
      platform_subsidy    = excluded.platform_subsidy,
      seller_voucher      = excluded.seller_voucher,
      co_funded_voucher   = excluded.co_funded_voucher,
      shipping_net        = excluded.shipping_net,
      fee_commission      = excluded.fee_commission,
      fee_payment         = excluded.fee_payment,
      fee_service         = excluded.fee_service,
      fee_affiliate       = excluded.fee_affiliate,
      fee_piship_sfr      = excluded.fee_piship_sfr,
      fee_handling        = excluded.fee_handling,
      fee_total           = excluded.fee_total,
      compensation        = excluded.compensation,
      tax_vat             = excluded.tax_vat,
      tax_pit             = excluded.tax_pit,
      tax_total           = excluded.tax_total,
      total_payout        = excluded.total_payout,
      raw_data            = excluded.raw_data
  `).bind(
    platform, shop, report_month, report_type, fileName, r2Key,
    parsed.gross_revenue       || 0,
    parsed.refund_amount       || 0,
    parsed.net_product_revenue || 0,
    parsed.platform_subsidy    || 0,
    parsed.seller_voucher      || 0,
    parsed.co_funded_voucher   || 0,
    parsed.shipping_net        || 0,
    parsed.fee_commission      || 0,
    parsed.fee_payment         || 0,
    parsed.fee_service         || 0,
    parsed.fee_affiliate       || 0,
    parsed.fee_piship_sfr      || 0,
    parsed.fee_handling        || 0,
    parsed.fee_total           || 0,
    parsed.compensation        || 0,
    parsed.tax_vat             || 0,
    parsed.tax_pit             || 0,
    parsed.tax_total           || 0,
    parsed.total_payout        || 0,
    JSON.stringify(parsed)
  ).run()

  return Response.json({
    status: "ok",
    r2_key: r2Key,
    report_month,
    parsed
  }, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// GET REPORTS — Lấy danh sách báo cáo + số liệu đã parse
// ════════════════════════════════════════════════════════════════════
async function getReports(request, env, cors) {
  const url   = new URL(request.url)
  const month = url.searchParams.get("month") || null
  const platform = url.searchParams.get("platform") || null

  const conds  = ["1=1"]
  const params = []
  if (month)    { conds.push("report_month = ?"); params.push(month) }
  if (platform) { conds.push("platform = ?");     params.push(platform) }

  const rows = await env.DB.prepare(`
    SELECT * FROM platform_reports
    WHERE ${conds.join(" AND ")}
    ORDER BY report_month DESC, platform, report_type
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// GET REPORT FILE — Tải file gốc từ R2
// ════════════════════════════════════════════════════════════════════
async function getReportFile(request, env, cors) {
  const url = new URL(request.url)
  const key = url.searchParams.get("key")
  if (!key) return new Response("Missing key", { status: 400, headers: cors })

  const obj = await env.STORAGE.get(key)
  if (!obj) return new Response("File not found", { status: 404, headers: cors })

  const headers = {
    ...cors,
    "Content-Type":        obj.httpMetadata?.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${key.split("/").pop()}"`,
  }
  return new Response(obj.body, { headers })
}


// ════════════════════════════════════════════════════════════════════
// HELPERS — Parse từng loại báo cáo
// ════════════════════════════════════════════════════════════════════

function detectReportMonth(filename) {
  // Pattern YYYY-MM (có dấu gạch)
  const m1 = filename.match(/(\d{4})-(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}`

  // Pattern YYYYMMDD (8 chữ số liền) — VD: 20260201
  const m2 = filename.match(/(\d{4})(\d{2})\d{2}/)
  if (m2) return `${m2[1]}-${m2[2]}`

  // Pattern YYYY_MM
  const m3 = filename.match(/(\d{4})_(\d{2})/)
  if (m3) return `${m3[1]}-${m3[2]}`

  // Fallback: tháng hiện tại
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

// Extract text từ PDF (dùng text decoder cơ bản — Worker không có pdf-parse)
// Cloudflare Worker có thể đọc text layer của PDF nếu không bị encrypt
async function extractPdfText(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    // Tìm các chuỗi text trong PDF (giữa BT...ET blocks)
    const matches = []
    const re = /\(([^)]{1,200})\)/g
    let m
    while ((m = re.exec(text)) !== null) {
      const s = m[1].replace(/\\n/g, "\n").replace(/\\r/g, "").trim()
      if (s.length > 1) matches.push(s)
    }
    return matches.join("\n")
  } catch {
    return ""
  }
}

async function extractExcelText(arrayBuffer) {
  // Trả về raw bytes để parse bên ngoài
  // Worker không có thư viện xlsx — dùng cách khác: client parse rồi gửi JSON
  return ""
}

// ── Detect loại hóa đơn + parse tương ứng ────────────────────────────
function autoDetectAndParse(text, platform) {
  // Shopee VAT Invoice (do Công ty TNHH Shopee xuất)
  if (text.includes("CÔNG TY TNHH SHOPEE") || text.includes("1K26TAC")) {
    return parseShopeeExpenseInvoice(text)
  }
  // TikTok Tax Invoice (do TikTok Pte. Ltd. xuất)
  if (text.includes("TIKTOK PTE") || text.includes("VNEC") || text.includes("Tokgistic")) {
    return parseTiktokExpenseInvoice(text)
  }
  // Lazada (do Công ty TNHH RECESS xuất)
  if (text.includes("RECESS") || text.includes("VN33W4TIY8") || text.includes("Lazada")) {
    return parseLazadaExpenseInvoice(text)
  }
  // Shopee doanh thu (báo cáo quyết toán)
  if (platform === "shopee") return parseShopeeReport(text)
  if (platform === "lazada") return parseLazadaReport(text)
  return {}
}

// Shopee VAT Invoice — hóa đơn chi phí (phí HH, phí giao dịch, PiShip, đấu thầu, rút tiền...)
function parseShopeeExpenseInvoice(text) {
  const findAmt = (label) => {
    const re = new RegExp(label + "[\\s\\S]{0,200}?([\\d\\.]+(?:\\.[\\d]+)?)[\\s]*(?=\\d{1,2}%|Cộng tiền)", "i")
    const m = text.match(re)
    if (m) return parseInt(m[1].replace(/\./g, "")) || 0
    return 0
  }

  // Tìm "Cộng tiền hàng (Sub total): X"
  const subMatch = text.match(/Cộng tiền hàng[^:]*:\s*([\d\.,]+)/)
  const vatMatch = text.match(/Tiền thuế GTGT[^:]*:\s*([\d\.,]+)/)
  const totalMatch = text.match(/Tổng cộng tiền thanh toán[^:]*:\s*([\d\.,]+)/)

  const sub   = subMatch  ? parseInt(subMatch[1].replace(/[\.]/g, "")) : 0
  const vat   = vatMatch  ? parseInt(vatMatch[1].replace(/[\.]/g, "")) : 0
  const total = totalMatch? parseInt(totalMatch[1].replace(/[\.]/g, "")): 0

  // Tìm từng dòng phí
  const commission  = findAmtLine(text, "Phí hoa hồng cố định")
  const transaction = findAmtLine(text, "Phí xử lý giao dịch")
  const service     = findAmtLine(text, "Phí dịch vụ ")
  const piship      = findAmtLine(text, "Phí dịch vụ PiShip")
  const ads         = findAmtLine(text, "Phí dịch vụ đấu thầu")
  const withdrawal  = findAmtLine(text, "Phí rút tiền")

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: 0,
    fee_commission:  commission || ads,
    fee_payment:     transaction,
    fee_service:     service,
    fee_affiliate:   0,
    fee_piship_sfr:  piship,
    fee_handling:    withdrawal,
    fee_total:       sub,
    compensation:    0,
    tax_vat:         vat,
    tax_pit:         0,
    tax_total:       vat,
    total_payout:    -total,   // âm vì đây là chi phí phải trả
  }
}

// TikTok Tax Invoice — hóa đơn chi phí platform + logistics
function parseTiktokExpenseInvoice(text) {
  const findAmt = (label) => {
    const re = new RegExp(label + "[^\\d]*([\\.\\d]+)[^\\d]*([\\.\\d]+)[^\\d]*([\\.\\d]+)")
    const m = text.match(re)
    // Cột 1: excl tax, cột 2: tax, cột 3: incl tax
    if (m) return parseInt(m[1].replace(/\./g, "")) || 0
    return 0
  }

  const subtotalMatch = text.match(/Subtotal \(excluding Tax\)[^\d]*([\d\.,]+)/)
  const taxMatch      = text.match(/Total Tax[^\d]*([\d\.,]+)/)
  const totalMatch    = text.match(/Total Amount[^\d]*([\d\.,]+)/)

  const sub   = subtotalMatch ? parseInt(subtotalMatch[1].replace(/[,\.]/g, "").slice(0,-3) + subtotalMatch[1].replace(/[,\.]/g,"").slice(-3)) : 0
  const tax   = taxMatch      ? parseInt(taxMatch[1].replace(/[,\.]/g,"").slice(0,-3)       + taxMatch[1].replace(/[,\.]/g,"").slice(-3))       : 0
  const total = totalMatch    ? parseInt(totalMatch[1].replace(/[,\.]/g,"").slice(0,-3)      + totalMatch[1].replace(/[,\.]/g,"").slice(-3))      : 0

  const isLogistics = text.includes("Tokgistic") || text.includes("Logistics fee") || text.includes("delivery shipping fee")
  const commission  = text.includes("commission fee") ? findAmt("TikTok Shop commission fee") : 0
  const transaction = text.includes("Transaction fee") ? findAmt("Transaction fee") : 0
  const sfr         = text.includes("SFR service fee") ? findAmt("SFR service fee") : 0
  const handling    = text.includes("Order Processing Fee") ? findAmt("Order Processing Fee") : 0
  const shipping    = isLogistics ? sub : 0

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: isLogistics ? -shipping : 0,
    fee_commission:  commission,
    fee_payment:     transaction,
    fee_service:     sfr,
    fee_affiliate:   0,
    fee_piship_sfr:  sfr,
    fee_handling:    handling,
    fee_total:       sub,
    compensation:    0,
    tax_vat:         tax,
    tax_pit:         0,
    tax_total:       tax,
    total_payout:    -total,
  }
}

// Lazada VAT Invoice (do RECESS xuất) — phí theo tuần
function parseLazadaExpenseInvoice(text) {
  text = text.normalize("NFC")
  const findLine = (label) => {
    const re = new RegExp(label + "[ \\t]{1,200}(\\d{1,3}(?:\\.\\d{3})+)")
    const m = text.match(re)
    if (!m) return 0
    return parseInt(m[1].replace(/\./g, "")) || 0
  }

  const subMatch   = text.match(/Cộng tiền hàng[^:]*:\s*([\d\.,]+)/)
  const vatMatch   = text.match(/Tiền thuế GTGT[^(VAT)]*:\s*([\d\.,]+)/)
  const totalMatch = text.match(/Tổng cộng tiền hàng[^:]*:\s*([\d\.,]+)/)

  const sub   = subMatch   ? parseInt(subMatch[1].replace(/\./g,""))   : 0
  const vat   = vatMatch   ? parseInt(vatMatch[1].replace(/\./g,""))   : 0
  const total = totalMatch ? parseInt(totalMatch[1].replace(/\./g,"")) : 0

  const handling   = findLine("Phí Xử lý đơn hàng")
  const shipping   = findLine("Phí Vận Chuyển")
  const commission = findLine("Phí Cố Định")

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net:    0,
    fee_commission:  commission,
    fee_payment:     shipping,
    fee_service:     0,
    fee_affiliate:   0,
    fee_piship_sfr:  0,
    fee_handling:    handling,
    fee_total:       total,
    compensation:    0,
    tax_vat:         vat,
    tax_pit:         0,
    tax_total:       vat,
    total_payout:    -total,
  }
}

function findAmtLine(text, label) {
  const re = new RegExp(label + "[\\s\\S]{0,100}?([\\d]{1,3}(?:\\.[\\d]{3})+)")
  const m = text.match(re)
  if (!m) return 0
  return parseInt(m[1].replace(/\./g, "")) || 0
}

// ── Parser Shopee PDF ────────────────────────────────────────────────
function parseShopeeReport(text) {
  const n = (pattern) => {
    const m = text.match(pattern)
    return m ? parseFloat(m[1].replace(/[,\.]/g, "").replace(/(\d+)$/, "$1")) : 0
  }

  // Tìm số sau label — cần xử lý format số VNĐ
  const findNum = (label) => {
    const re = new RegExp(label + "[\\s\\S]{0,50}?([\\d,\\.]+)")
    const m = text.match(re)
    if (!m) return 0
    return parseInt(m[1].replace(/[,.]/g, "").replace(/(\d+)$/, (s) => s)) || 0
  }

  const gross_revenue       = findNum("Giá sản phẩm")
  const refund_amount       = findNum("Số tiền hoàn lại")
  const platform_subsidy    = findNum("Sản phẩm được trợ giá từ Shopee")
  const co_funded_voucher   = findNum("Mã ưu đãi Đồng Tài Trợ do Người Bán chịu")
  const fee_commission      = findNum("Phí cố định")
  const fee_service         = findNum("Phí Dịch Vụ")
  const fee_payment         = findNum("Phí thanh toán")
  const fee_affiliate       = findNum("Phí hoa hồng Tiếp thị liên kết")
  const fee_piship_sfr      = findNum("Phí dịch vụ PiShip")
  const fee_total           = fee_commission + fee_service + fee_payment + fee_affiliate + fee_piship_sfr
  const tax_vat             = findNum("Thuế GTGT")
  const tax_pit             = findNum("Thuế TNCN")
  const tax_total           = tax_vat + tax_pit
  const total_payout        = findNum("Tổng thanh toán đã chuyển")
  const net_product_revenue = gross_revenue - refund_amount + platform_subsidy - co_funded_voucher

  return {
    gross_revenue, refund_amount, net_product_revenue,
    platform_subsidy, seller_voucher: 0, co_funded_voucher,
    shipping_net: 0,
    fee_commission, fee_payment, fee_service,
    fee_affiliate, fee_piship_sfr, fee_handling: 0, fee_total,
    compensation: 0,
    tax_vat, tax_pit, tax_total,
    total_payout,
  }
}

// ── Parser Lazada PDF ────────────────────────────────────────────────
function parseLazadaReport(text) {
  const findNum = (label) => {
    const re = new RegExp(label + "[\\s\\S]{0,80}?([\\d,\\.]+(?:\\.\\d{2})?)")
    const m = text.match(re)
    if (!m) return 0
    return parseFloat(m[1].replace(/,/g, "")) || 0
  }

  const gross_revenue  = findNum("Giá trị sản phẩm")
  const fee_commission = findNum("Phí cố định")
  const fee_handling   = findNum("Phí xử lý đơn hàng")
  const shipping_net   = findNum("Điều chỉnh phí vận chuyển chênh lệch")
  const compensation   = findNum("Bồi thường đơn hàng thất lạc")
  const tax_vat        = findNum("Thuế GTGT nhà bán hàng")
  const tax_pit        = findNum("Thuế TNCN nhà bán hàng")
  const tax_total      = tax_vat + tax_pit
  const fee_total      = fee_commission + fee_handling
  const total_payout   = findNum("Tổng thanh toán")

  return {
    gross_revenue, refund_amount: 0, net_product_revenue: gross_revenue,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: -shipping_net,
    fee_commission, fee_payment: 0, fee_service: 0,
    fee_affiliate: 0, fee_piship_sfr: 0, fee_handling, fee_total,
    compensation,
    tax_vat, tax_pit, tax_total,
    total_payout,
  }
}

// ── Parser TikTok (Excel đã được client convert sang JSON) ───────────
function parseTiktokReport(data) {
  // data là object JSON từ client parse Excel
  return {
    gross_revenue:       data.gross_revenue       || 0,
    refund_amount:       data.refund_amount        || 0,
    net_product_revenue: data.net_product_revenue  || 0,
    platform_subsidy:    data.platform_subsidy     || 0,
    seller_voucher:      0,
    co_funded_voucher:   0,
    shipping_net:        data.shipping_net         || 0,
    fee_commission:      data.fee_commission       || 0,
    fee_payment:         data.fee_payment          || 0,
    fee_service:         data.fee_service          || 0,
    fee_affiliate:       data.fee_affiliate        || 0,
    fee_piship_sfr:      data.fee_piship_sfr       || 0,
    fee_handling:        data.fee_handling         || 0,
    fee_total:           data.fee_total            || 0,
    compensation:        0,
    tax_vat:             data.tax_vat              || 0,
    tax_pit:             data.tax_pit              || 0,
    tax_total:           data.tax_total            || 0,
    total_payout:        data.total_payout         || 0,
  }
}

async function recalcCost(request, env, cors) {
  const cfg = await getCostSettings(env)
  const productRows = await env.DB.prepare(`SELECT sku, cost_invoice, cost_real FROM products`).all()
  const productMap = {}
  for (const p of productRows.results) productMap[p.sku] = p

  const orders = await env.DB.prepare(`SELECT * FROM orders`).all()
  const BATCH = 50
  let updated = 0

  for (let i = 0; i < orders.results.length; i += BATCH) {
    const chunk = orders.results.slice(i, i + BATCH)
    const stmts = chunk.map(o => {
      const product = productMap[o.sku] || { cost_invoice: 0, cost_real: 0 }
      const orderWithCost = { ...o, cost_invoice: product.cost_invoice, cost_real: product.cost_real }
      const p = calcProfit(orderWithCost, cfg)
      return env.DB.prepare(`
        UPDATE orders SET
          cost_invoice   = ?,
          cost_real      = ?,
          profit_invoice = ?,
          profit_real    = ?,
          fee            = ?,
          profit         = ?
        WHERE order_id = ? AND sku = ?
      `).bind(
        p.cost_invoice, p.cost_real,
        p.profit_invoice, p.profit_real,
        p.total_fee, p.profit_real,
        o.order_id, o.sku
      )
    })
    await env.DB.batch(stmts)
    updated += chunk.length
  }

  return Response.json({ status: "ok", updated }, { headers: cors })
}

// ════════════════════════════════════════════════════════════════════
// PARSE INVOICE bằng Claude AI
// ════════════════════════════════════════════════════════════════════
async function parseInvoiceAI(request, env, cors) {
  const formData = await request.formData()
  const file = formData.get("file")
  if (!file) return Response.json({ error: "No file" }, { status: 400, headers: cors })

  const bytes = await file.arrayBuffer()
  const base64 = (() => {
    const arr = new Uint8Array(bytes)
    let binary = ""
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i])
    return btoa(binary)
  })()

  const prompt = `Đây là hóa đơn mua hàng. Hãy trích xuất thông tin và trả về JSON duy nhất (không có text khác):
{
  "supplier": "tên nhà cung cấp",
  "buyer": "mã số thuế người mua hàng (Tax code của người mua, chỉ lấy dãy số liền, ví dụ: 079084002835 hoặc 0101243150)",
  "invoice_no": "số hóa đơn",
  "invoice_date": "ngày hóa đơn dạng YYYY-MM-DD",
  "total_amount": số tiền tổng thanh toán (số nguyên),
  "items": [
    {
      "name": "tên sản phẩm",
      "qty": số lượng (số nguyên),
      "unit": "đơn vị tính",
      "unit_price": đơn giá trước thuế (số nguyên),
      "amount": thành tiền trước thuế (số nguyên),
      "vat_rate": phần trăm thuế (số nguyên, vd: 8),
      "amount_after_vat": thành tiền sau thuế (số nguyên)
    }
  ]
}
Chỉ trả về JSON, không giải thích thêm.`

  // Rotation nhiều API key — thử lần lượt đến khi thành công
  const geminiKeys = [
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY_4,
    env.GEMINI_API_KEY_5,
  ].filter(Boolean) // bỏ qua key chưa set

  if (!geminiKeys.length) {
    return Response.json({ error: "Chưa cấu hình GEMINI_API_KEY" }, { status: 500, headers: cors })
  }

  let text = "{}"
  let lastError = ""

  for (const key of geminiKeys) {
    try {
      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: "application/pdf", data: base64 } },
                { text: prompt }
              ]
            }]
          })
        }
      )
      const aiData = await aiRes.json()

      // Kiểm tra lỗi quota/rate limit
      if (aiData.error) {
        const code = aiData.error.code || 0
        const msg  = aiData.error.message || ""
        if (code === 429 || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
          lastError = `429: ${msg}`
          continue
        }
        // Lỗi khác — trả về chi tiết để debug
        return Response.json({ error: msg, code, raw: aiData }, { status: 500, headers: cors })
      }

      text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
      break // thành công, thoát vòng lặp

    } catch(e) {
      lastError = e.message
      continue
    }
  }

  if (text === "{}") {
    return Response.json({ error: "Tất cả API key đều hết quota: " + lastError }, { status: 429, headers: cors })
  }
  try {
    const clean = text.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(clean)
    return Response.json(parsed, { headers: cors })
  } catch(e) {
    return Response.json({ error: "AI parse failed", raw: text }, { status: 500, headers: cors })
  }
}

async function saveInvoice(request, env, cors) {
  const formData = await request.formData()
  const file = formData.get("file")
  const dataStr = formData.get("data")
  if (!file || !dataStr) return Response.json({ error: "Missing data" }, { status: 400, headers: cors })

  const data = JSON.parse(dataStr)
  // Lấy buyer từ data (AI parse ra)
  const buyer = data.buyer || ""
  const bytes = await file.arrayBuffer()
  const r2Key = `invoices/${data.invoice_date || "unknown"}/${data.invoice_no || Date.now()}_${file.name}`

  // Lưu file lên R2
  await env.STORAGE.put(r2Key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { supplier: data.supplier || "", invoice_no: data.invoice_no || "" }
  })

  // Lưu vào DB
  await env.DB.prepare(`
   INSERT INTO purchase_invoices (supplier, buyer, invoice_no, invoice_date, total_amount, item_count, r2_key, items_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(invoice_no) DO UPDATE SET
      total_amount  = excluded.total_amount,
      buyer         = excluded.buyer,
      r2_key        = excluded.r2_key,
      items_json    = excluded.items_json
  `).bind(
    data.supplier || "", buyer, data.invoice_no || "", data.invoice_date || "",
    data.total_amount || 0, data.items.length, r2Key,
    JSON.stringify(data.items.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, sku: i.sku })))
  ).run()
  
  // Lưu mapping tên SP hóa đơn → SKU để lần sau tự nhận
  const mapStmts = data.items
    .filter(i => i.sku && i.name)
    .map(i => env.DB.prepare(`
      INSERT INTO invoice_sku_map (invoice_name, sku)
      VALUES (?, ?)
      ON CONFLICT(invoice_name) DO UPDATE SET sku = excluded.sku
    `).bind(i.name.trim(), i.sku))
  if (mapStmts.length) await env.DB.batch(mapStmts)

  // Lấy giá vốn hiện tại để so sánh
  const skuList = data.items.map(i => i.sku).filter(Boolean)
  let priceChanges = []
  let autoUpdated = 0

  if (skuList.length) {
    const existing = await env.DB.prepare(
      `SELECT sku, cost_invoice FROM products WHERE sku IN (${skuList.map(()=>"?").join(",")})`
    ).bind(...skuList).all()

    const existingMap = {}
    for (const p of existing.results) existingMap[p.sku] = p.cost_invoice

    const autoStmts = []
    for (const item of data.items) {
      if (!item.sku) continue
      const oldPrice = existingMap[item.sku]
      if (oldPrice === undefined) {
        // SKU chưa có giá → cập nhật luôn
        autoStmts.push(
          env.DB.prepare(`UPDATE products SET cost_invoice = ? WHERE sku = ?`)
            .bind(item.unit_price, item.sku)
        )
        autoUpdated++
      } else if (oldPrice !== item.unit_price) {
        // Giá thay đổi → báo để xác nhận
        priceChanges.push({
          sku: item.sku,
          name: item.name,
          old_price: oldPrice,
          new_price: item.unit_price
        })
      }
      // Giá không đổi → bỏ qua
    }
    if (autoStmts.length) await env.DB.batch(autoStmts)
  }

  return Response.json({
    status: "ok",
    updated: autoUpdated,
    price_changes: priceChanges  // danh sách SKU có giá thay đổi
  }, { headers: cors })
}

async function listInvoices(request, env, cors) {
  const rows = await env.DB.prepare(`
    SELECT * FROM purchase_invoices ORDER BY invoice_date DESC LIMIT 100
  `).all()
  return Response.json(rows.results, { headers: cors })
}

async function getInvoiceFile(request, env, cors) {
  const key = new URL(request.url).searchParams.get("key")
  if (!key) return new Response("Missing key", { status: 400, headers: cors })
  const obj = await env.STORAGE.get(key)
  if (!obj) return new Response("Not found", { status: 404, headers: cors })
  return new Response(obj.body, {
    headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${key.split("/").pop()}"` }
  })
}

async function updateCostPrices(request, env, cors) {
  const items = await request.json()
  if (!items?.length) return Response.json({ updated: 0 }, { headers: cors })
  const stmts = items.map(item =>
    env.DB.prepare(`UPDATE products SET cost_invoice = ? WHERE sku = ?`)
      .bind(item.new_price, item.sku)
  )
  await env.DB.batch(stmts)
  return Response.json({ status: "ok", updated: items.length }, { headers: cors })
}

async function getSkuMap(request, env, cors) {
  const rows = await env.DB.prepare(`SELECT invoice_name, sku FROM invoice_sku_map`).all()
  return Response.json(rows.results, { headers: cors })
}

async function getSkuGroups(request, env, cors) {
  const rows = await env.DB.prepare(`SELECT * FROM sku_groups ORDER BY group_name`).all()
  return Response.json(rows.results, { headers: cors })
}

async function saveSkuGroup(request, env, cors) {
  const { group_name, skus } = await request.json()
  if (!group_name || !skus?.length)
    return Response.json({ error: "Missing data" }, { status: 400, headers: cors })
  await env.DB.prepare(`
    INSERT INTO sku_groups (group_name, skus) VALUES (?, ?)
    ON CONFLICT(group_name) DO UPDATE SET skus = excluded.skus
  `).bind(group_name, JSON.stringify(skus)).run()
  return Response.json({ status: "ok" }, { headers: cors })
}

async function updateGroupPrice(request, env, cors) {
  const { group_name, cost_invoice, cost_real } = await request.json()
  if (!group_name) return Response.json({ error: "Missing group_name" }, { status: 400, headers: cors })
  const row = await env.DB.prepare(`SELECT skus FROM sku_groups WHERE group_name = ?`).bind(group_name).first()
  if (!row) return Response.json({ error: "Group not found" }, { status: 404, headers: cors })
  const skus = JSON.parse(row.skus || "[]")
  if (!skus.length) return Response.json({ status: "ok", updated: 0 }, { headers: cors })
  const stmts = skus.map(sku =>
    env.DB.prepare(`UPDATE products SET cost_invoice = ?, cost_real = ? WHERE sku = ?`)
      .bind(cost_invoice, cost_real, sku)
  )
  await env.DB.batch(stmts)
  return Response.json({ status: "ok", updated: skus.length }, { headers: cors })
}

async function deleteSkuGroup(request, env, cors) {
  const { group_name } = await request.json()
  await env.DB.prepare(`DELETE FROM sku_groups WHERE group_name = ?`).bind(group_name).run()
  return Response.json({ status: "ok" }, { headers: cors })
}

function parseTiktokExcel(text) { return {} }