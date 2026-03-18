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

  const orders = await env.DB.prepare(`
    SELECT * FROM orders ORDER BY order_id, sku
  `).all()

  // Tính lại is_first_sku đúng: mỗi order_id chỉ có 1 dòng đầu = true
  const seenOrders = new Set()
  const ordersWithFirstSku = orders.results.map(o => {
    const isFirst = !seenOrders.has(o.order_id)
    if (o.order_type !== "cancel") seenOrders.add(o.order_id)
    return { ...o, is_first_sku: isFirst ? 1 : 0 }
  })

  const BATCH = 50
  let updated = 0

  for (let i = 0; i < ordersWithFirstSku.length; i += BATCH) {
    const chunk = ordersWithFirstSku.slice(i, i + BATCH)
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
          return_fee     = ?,
          is_first_sku   = ?
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
        o.is_first_sku,
        o.order_id, o.sku
      )
    })
    await env.DB.batch(stmts)
    updated += chunk.length
  }

  return Response.json({ status: "ok", updated }, { headers: cors })
}

// ════════════════════════════════════════════════════════════════════
// IMPORT ORDERS V2 — lưu vào orders_v2 + order_items
// ════════════════════════════════════════════════════════════════════
async function importOrdersV2(request, env, cors) {
  const { orders, items } = await request.json()
  const cfg         = await getCostSettings(env)

  // 1. Lấy toàn bộ products 1 lần
  const productRows = await env.DB.prepare(`SELECT sku, cost_invoice, cost_real FROM products`).all()
  const productMap  = {}
  for (const p of productRows.results) productMap[p.sku] = p

  // 2. Tính profit cho từng ORDER (không phải từng SKU line)
  //    Dùng tổng revenue + vốn tổng hợp từ items
  const processedOrders = orders.map(o => {
    // Tính vốn tổng = sum(cost_real * qty) của tất cả items trong đơn
    const orderItems = items.filter(i => i.order_id === o.order_id)
    const totalCostReal    = orderItems.reduce((s, i) => {
      const p = productMap[i.sku] || { cost_real: 0, cost_invoice: 0 }
      return s + (p.cost_real * (i.qty || 1))
    }, 0)
    const totalCostInvoice = orderItems.reduce((s, i) => {
      const p = productMap[i.sku] || { cost_real: 0, cost_invoice: 0 }
      return s + (p.cost_invoice * (i.qty || 1))
    }, 0)

    // Tính profit dựa trên order tổng
    // is_first_sku = true vì đây là đơn tổng (phí per-đơn tính 1 lần)
    const orderForCalc = {
      ...o,
      cost_invoice: totalCostInvoice,
      cost_real:    totalCostReal,
      is_first_sku: 1,
    }
    const p = calcProfit(orderForCalc, cfg)

    // Tính lại return_fee
    let return_fee = o.return_fee || 0
    if (o.order_type === "return") {
      return_fee = o.platform === "tiktok"
        ? (cfg["tiktok_return_fee"]?.value    ?? 4620)
        : (cfg["shopee_return_fee"]?.value     ?? 1620)
    } else if (o.order_type === "cancel") {
      const isFailed = /giao hàng thất bại|không giao được|failed delivery/i.test(o.cancel_reason || "")
      if (isFailed) {
        return_fee = o.platform === "tiktok"
          ? (cfg["tiktok_failed_delivery_fee"]?.value ?? 1620)
          : (cfg["shopee_failed_delivery_fee"]?.value  ?? 1620)
      }
    }

    return {
      ...o,
      cost_invoice:   p.cost_invoice,
      cost_real:      p.cost_real,
      fee:            p.total_fee,
      profit_invoice: p.profit_invoice,
      profit_real:    p.profit_real,
      tax_flat:       p.tax_flat,
      tax_income:     p.tax_income,
      fee_platform:   p.fee_platform  || 0,
      fee_payment:    p.fee_payment   || 0,
      fee_affiliate:  p.fee_affiliate || 0,
      fee_ads:        p.fee_ads       || 0,
      fee_piship:     p.fee_piship    || 0,
      fee_service:    p.fee_service   || 0,
      fee_packaging:  p.fee_packaging || 0,
      fee_operation:  p.fee_operation || 0,
      fee_labor:      p.fee_labor     || 0,
      return_fee,
    }
  })

  // 3. Cập nhật cost_real cho items
  const processedItems = items.map(i => {
    const p = productMap[i.sku] || { cost_real: 0, cost_invoice: 0 }
    return {
      ...i,
      cost_real:    p.cost_real    * (i.qty || 1),
      cost_invoice: p.cost_invoice * (i.qty || 1),
    }
  })

  // 4. Batch insert orders_v2
  const BATCH = 50
  let importedOrders = 0, importedItems = 0, skipped = 0

  for (let i = 0; i < processedOrders.length; i += BATCH) {
    const chunk = processedOrders.slice(i, i + BATCH)
    const stmts = chunk.map(o => env.DB.prepare(`
      INSERT INTO orders_v2
        (order_id, platform, shop, order_date, order_type,
         revenue, raw_revenue, cost_invoice, cost_real,
         fee, profit_invoice, profit_real, tax_flat, tax_income,
         fee_platform, fee_payment, fee_affiliate, fee_ads,
         fee_piship, fee_service, fee_packaging, fee_operation, fee_labor,
         cancel_reason, return_fee, shipped)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET
        revenue       = excluded.revenue,
        raw_revenue   = excluded.raw_revenue,
        cost_invoice  = excluded.cost_invoice,
        cost_real     = excluded.cost_real,
        fee           = excluded.fee,
        profit_invoice= excluded.profit_invoice,
        profit_real   = excluded.profit_real,
        tax_flat      = excluded.tax_flat,
        tax_income    = excluded.tax_income,
        fee_platform  = excluded.fee_platform,
        fee_payment   = excluded.fee_payment,
        fee_affiliate = excluded.fee_affiliate,
        fee_ads       = excluded.fee_ads,
        fee_piship    = excluded.fee_piship,
        fee_service   = excluded.fee_service,
        fee_packaging = excluded.fee_packaging,
        fee_operation = excluded.fee_operation,
        fee_labor     = excluded.fee_labor,
        cancel_reason = excluded.cancel_reason,
        return_fee    = excluded.return_fee,
        shipped       = excluded.shipped,
        order_date    = excluded.order_date
    `).bind(
      o.order_id, o.platform, o.shop, o.order_date, o.order_type,
      o.revenue, o.raw_revenue, o.cost_invoice, o.cost_real,
      o.fee, o.profit_invoice, o.profit_real, o.tax_flat, o.tax_income,
      o.fee_platform, o.fee_payment, o.fee_affiliate, o.fee_ads,
      o.fee_piship, o.fee_service, o.fee_packaging, o.fee_operation, o.fee_labor,
      o.cancel_reason || null, o.return_fee || 0, o.shipped || 0
    ))
    try {
      await env.DB.batch(stmts)
      importedOrders += chunk.length
    } catch(e) {
      skipped += chunk.length
      console.log("Batch orders_v2 error:", e.message)
    }
  }

  // 5. Batch insert order_items
  // Xóa items cũ của các order này trước
  const orderIds = [...new Set(processedItems.map(i => i.order_id))]
  for (let i = 0; i < orderIds.length; i += BATCH) {
    const chunk = orderIds.slice(i, i + BATCH)
    const placeholders = chunk.map(() => "?").join(",")
    await env.DB.prepare(`DELETE FROM order_items WHERE order_id IN (${placeholders})`)
      .bind(...chunk).run()
  }

  for (let i = 0; i < processedItems.length; i += BATCH) {
    const chunk = processedItems.slice(i, i + BATCH)
    const stmts = chunk.map(item => env.DB.prepare(`
      INSERT INTO order_items (order_id, sku, product_name, qty, revenue_line, cost_real, cost_invoice)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      item.order_id, item.sku, item.product_name || "",
      item.qty || 1, item.revenue_line || 0,
      item.cost_real || 0, item.cost_invoice || 0
    ))
    try {
      await env.DB.batch(stmts)
      importedItems += chunk.length
    } catch(e) {
      console.log("Batch order_items error:", e.message)
    }
  }

  return Response.json({
    status: "ok",
    imported_orders: importedOrders,
    imported_items:  importedItems,
    skipped
  }, { headers: cors })
}

export { importOrders, exportOrders, recalcCost, importOrdersV2 }