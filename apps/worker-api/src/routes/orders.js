// ════════════════════════════════════════════════════════════════════
// IMPORT ORDERS
// - Lưu từng dòng (mỗi SKU 1 dòng)
// - Tính profit ngay khi import dựa trên cost_settings hiện tại
// ════════════════════════════════════════════════════════════════════
import { getCostSettings, calcProfit } from '../utils/db.js'
import { getFilters } from '../utils/filters.js'

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
          qty            = excluded.qty,
          product_name   = excluded.product_name,
          revenue        = excluded.revenue,
          raw_revenue    = excluded.raw_revenue,
          cost_invoice   = excluded.cost_invoice,
          cost_real      = excluded.cost_real,
          fee            = excluded.fee,
          profit         = excluded.profit,
          profit_invoice = excluded.profit_invoice,
          profit_real    = excluded.profit_real,
          tax_flat       = excluded.tax_flat,
          tax_income     = excluded.tax_income,
          return_fee     = excluded.return_fee,
          cancel_reason  = excluded.cancel_reason,
          fee_platform   = excluded.fee_platform,
          fee_payment    = excluded.fee_payment,
          fee_affiliate  = excluded.fee_affiliate,
          fee_ads        = excluded.fee_ads,
          fee_piship     = excluded.fee_piship,
          fee_service    = excluded.fee_service,
          fee_packaging  = excluded.fee_packaging,
          fee_operation  = excluded.fee_operation,
          fee_labor      = excluded.fee_labor,
          order_date     = excluded.order_date,
          is_first_sku   = excluded.is_first_sku
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
           tax_flat, tax_income, order_type, cancel_reason, return_fee,
           fee_platform, fee_payment, fee_affiliate, fee_ads,
           fee_piship, fee_service, fee_packaging, fee_operation, fee_labor
    FROM orders
    WHERE ${conds.join(" AND ")}
    ORDER BY order_date DESC
    LIMIT ${parseInt(new URL(request.url).searchParams.get("limit") || "10000")}
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
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

      // Tính lại return_fee từ cost_settings
      let return_fee = o.return_fee || 0
      if (o.order_type === "return") {
        return_fee = o.platform === "tiktok"
          ? (cfg["tiktok_return_fee"]?.value          ?? 4620)
          : (cfg["shopee_return_fee"]?.value           ?? 1620)
      } else if (o.order_type === "cancel") {
        const isFailed = /giao hàng thất bại|không giao được|failed delivery/i.test(o.cancel_reason || "")
        if (isFailed) {
          return_fee = o.platform === "tiktok"
            ? (cfg["tiktok_failed_delivery_fee"]?.value ?? 1620)
            : (cfg["shopee_failed_delivery_fee"]?.value  ?? 1620)
        }
      }

      return env.DB.prepare(`
        UPDATE orders SET
          cost_invoice   = ?,
          cost_real      = ?,
          profit_invoice = ?,
          profit_real    = ?,
          fee            = ?,
          profit         = ?,
          tax_flat       = ?,
          tax_income     = ?,
          fee_platform   = ?,
          fee_payment    = ?,
          fee_affiliate  = ?,
          fee_ads        = ?,
          fee_piship     = ?,
          fee_service    = ?,
          fee_packaging  = ?,
          fee_operation  = ?,
          fee_labor      = ?,
          return_fee     = ?
        WHERE order_id = ? AND sku = ?
      `).bind(
        p.cost_invoice, p.cost_real,
        p.profit_invoice, p.profit_real,
        p.total_fee, p.profit_real,
        p.tax_flat, p.tax_income,
        p.fee_platform  || 0,
        p.fee_payment   || 0,
        p.fee_affiliate || 0,
        p.fee_ads       || 0,
        p.fee_piship    || 0,
        p.fee_service   || 0,
        p.fee_packaging || 0,
        p.fee_operation || 0,
        p.fee_labor     || 0,
        return_fee,
        o.order_id, o.sku
      )
    })
    await env.DB.batch(stmts)
    updated += chunk.length
  }

  return Response.json({ status: "ok", updated }, { headers: cors })
}

export { importOrders, exportOrders, recalcCost }