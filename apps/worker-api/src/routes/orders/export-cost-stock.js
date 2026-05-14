import { calcProfit, getCostSettings } from '../../utils/db.js'
import { getFilters } from '../../utils/filters.js'
import { buildProductLookup, loadOrderFeeMap, loadSkuResolutionMaps, resolveItemProduct } from './cost-resolution.js'
import { cleanOrderText } from './status-workflow.js'

export async function exportOrders(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const conds  = ["1=1"]
  const params = []
  if (filters.from)     { conds.push(`date(o.order_date) >= ?`); params.push(filters.from) }
  if (filters.to)       { conds.push(`date(o.order_date) <= ?`); params.push(filters.to) }
  if (filters.platform) { conds.push(`o.platform = ?`);          params.push(filters.platform) }
  if (filters.shop)     { conds.push(`o.shop = ?`);              params.push(filters.shop) }

  const urlObj = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(urlObj.searchParams.get("limit") || "200", 10) || 200, 1), 500);
  const page  = Math.max(parseInt(urlObj.searchParams.get("page") || "1", 10) || 1, 1);
  const offset = (page - 1) * limit;

  // Đếm tổng số đơn để FE tính số trang
  const countRes = await env.DB.prepare(`SELECT COUNT(*) as total FROM orders_v2 o WHERE ${conds.join(" AND ")}`).bind(...params).first();
  const total = countRes ? countRes.total : 0;

  // Join orders_v2 + order_items để có đủ thông tin từng SKU
  const rows = await env.DB.prepare(`
    SELECT
      o.order_date, o.platform, o.shop, o.order_id,
      oi.sku, oi.product_name, oi.qty,
      oi.revenue_line                                              AS revenue,
      oi.revenue_line                                              AS raw_revenue,
      oi.cost_real,
      -- Phân bổ phí % theo tỷ lệ doanh thu dòng / tổng đơn
      ROUND(o.fee_platform  * oi.revenue_line / NULLIF(o.revenue,0)) AS fee_platform,
      ROUND(o.fee_payment   * oi.revenue_line / NULLIF(o.revenue,0)) AS fee_payment,
      ROUND(o.fee_affiliate * oi.revenue_line / NULLIF(o.revenue,0)) AS fee_affiliate,
      ROUND(o.fee_ads       * oi.revenue_line / NULLIF(o.revenue,0)) AS fee_ads,
      -- Phí per-đơn chỉ tính cho item đầu tiên
      CASE WHEN oi.id = (
        SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id = o.order_id
      ) THEN o.fee_piship  ELSE 0 END AS fee_piship,
      CASE WHEN oi.id = (
        SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id = o.order_id
      ) THEN o.fee_service ELSE 0 END AS fee_service,
      CASE WHEN oi.id = (
        SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id = o.order_id
      ) THEN o.fee_packaging ELSE 0 END AS fee_packaging,
      -- Tổng phí dòng này
      ROUND(
        (o.fee_platform + o.fee_payment + o.fee_affiliate + o.fee_ads)
        * oi.revenue_line / NULLIF(o.revenue,0)
        + CASE WHEN oi.id = (SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id = o.order_id)
               THEN o.fee_piship + o.fee_service + o.fee_packaging ELSE 0 END
      )                                                            AS fee,
      -- Lãi dòng = lãi đơn × tỷ lệ doanh thu
      ROUND(o.profit_real * oi.revenue_line / NULLIF(o.revenue,0)) AS profit_real,
      ROUND(o.tax_flat    * oi.revenue_line / NULLIF(o.revenue,0)) AS tax_flat,
      ROUND(o.tax_income  * oi.revenue_line / NULLIF(o.revenue,0)) AS tax_income,
      o.order_type, o.cancel_reason, o.return_fee
    FROM orders_v2 o
    LEFT JOIN order_items oi ON oi.order_id = o.order_id
    WHERE ${conds.join(" AND ")}
    ORDER BY o.order_date DESC, o.order_id, oi.id
    LIMIT ${limit} OFFSET ${offset}
  `).bind(...params).all();

  return Response.json({
    data: rows.results,
    total: total,
    page: page,
    totalPages: Math.ceil(total / limit)
  }, { headers: cors });
}

export async function recalcCost(request, env, cors) {
  const cfg = await getCostSettings(env)
// Lấy thêm cột combo_items chứa chuỗi JSON
  const productRows = await env.DB.prepare(`SELECT sku, product_name, image_url, cost_invoice, cost_real, stock, stock_main, stock_sub, is_combo, combo_items FROM products`).all()
  const productMap = {}
  for (const p of productRows.results) productMap[p.sku] = p

  // TÍNH LẠI GIÁ VỐN CHO SẢN PHẨM COMBO TỪ CHUỖI JSON
  for (const p of productRows.results) {
    if (p.is_combo === 1 && p.combo_items) {
      try {
        const components = JSON.parse(p.combo_items);
        if (components.length > 0) {
          let comboCostReal = 0;
          let comboCostInvoice = 0;
          for (const comp of components) {
            // Trong JSON của bạn, key là 'sku' và 'qty'
            const compData = productMap[comp.sku] || { cost_real: 0, cost_invoice: 0 };
            comboCostReal += (compData.cost_real * (comp.qty || 1));
            comboCostInvoice += (compData.cost_invoice * (comp.qty || 1));
          }
          productMap[p.sku].cost_real = comboCostReal;
          productMap[p.sku].cost_invoice = comboCostInvoice;
        }
      } catch(e) {
        // Bỏ qua nếu lỗi parse JSON để không sập API
        console.error("Lỗi parse combo_items cho SKU:", p.sku);
      }
    }
  }

  const productLookup = buildProductLookup(productRows)
  const { varMap, aliasMap } = await loadSkuResolutionMaps(env)

const BATCH = 50
  let updated = 0

  // ── Nhận tín hiệu khoanh vùng từ Client ──────────────────────────
  let targetSku = null;
  try {
    const body = await request.json();
    if (body && body.sku) targetSku = body.sku;
  } catch(e) {} // Bỏ qua nếu Client không gửi body

  // ── Recalc bảng mới (orders_v2) TỐI ƯU HÓA ───────────────────────
  let ordersV2;
  let itemsAll;

  if (targetSku) {
    console.log(`[RECALC_COST] ⚡ Tối ưu: Chỉ tính lại các đơn chứa SKU [${targetSku}]`);
    ordersV2 = await env.DB.prepare(`SELECT * FROM orders_v2 WHERE order_id IN (SELECT order_id FROM order_items WHERE sku = ?)`).bind(targetSku).all();
    itemsAll = await env.DB.prepare(`SELECT * FROM order_items WHERE order_id IN (SELECT order_id FROM order_items WHERE sku = ?)`).bind(targetSku).all();
  } else {
    console.log(`[RECALC_COST] ⚠️ Chạy Full: Tính lại TOÀN BỘ đơn hàng trong hệ thống...`);
    ordersV2 = await env.DB.prepare(`SELECT * FROM orders_v2`).all();
    itemsAll = await env.DB.prepare(`SELECT * FROM order_items`).all();
  }

  // Group items theo order_id
  const itemsByOrder = {}
  for (const item of itemsAll.results) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
    itemsByOrder[item.order_id].push(item)
  }

  // Build tiktokFeeMap từ bảng tiktok_fees (nếu có)
  let tiktokFeeMap = {}
  try {
    const tiktokFees = await env.DB.prepare(`SELECT * FROM tiktok_order_fees`).all()
    for (const row of tiktokFees.results) {
      tiktokFeeMap[row.order_id] = row
    }
  } catch(e) {
    // Bảng chưa tồn tại hoặc không có dữ liệu — bỏ qua
    tiktokFeeMap = {}
  }

  const realFeeMap = await loadOrderFeeMap(env)

  let updatedV2 = 0
  for (let i = 0; i < ordersV2.results.length; i += 50) {
    const chunk = ordersV2.results.slice(i, i + 50)
    const stmts = chunk.map(o => {
      const orderItems       = itemsByOrder[o.order_id] || []
      const totalCostReal    = orderItems.reduce((s, item) => {
        const p = resolveItemProduct(productLookup, item, varMap, aliasMap)
        return s + Number(p.cost_real || 0) * (item.qty || 1)
      }, 0)
      const totalCostInvoice = orderItems.reduce((s, item) => {
        const p = resolveItemProduct(productLookup, item, varMap, aliasMap)
        return s + Number(p.cost_invoice || 0) * (item.qty || 1)
      }, 0)

      // Tính return_fee TRƯỚC calcProfit
      let return_fee = o.return_fee || 0
      if (o.order_type === "return") {
        return_fee = o.platform === "tiktok"
          ? (cfg["tiktok_return_fee"]?.value    ?? 4620)
          : (cfg["shopee_return_fee"]?.value     ?? 1620)
      } else if (o.order_type === "cancel") {
        const isFailed = /giao.*thất bại|không giao được|failed delivery/i.test(o.cancel_reason || "")
        if (isFailed) {
          return_fee = o.platform === "tiktok"
            ? (cfg["tiktok_failed_delivery_fee"]?.value ?? 1620)
            : (cfg["shopee_failed_delivery_fee"]?.value  ?? 1620)
        }
      }

      const realFee = realFeeMap[o.order_id] || {}
    const orderForCalc = {
      ...o,
      cost_invoice:    totalCostInvoice,
      cost_real:       totalCostReal,
      is_first_sku:    1,
      return_fee,
      ...realFee,
    }
    const p = calcProfit(orderForCalc, cfg)

      return env.DB.prepare(`
        UPDATE orders_v2 SET
          cost_invoice   = ?, cost_real      = ?,
          profit_invoice = ?, profit_real    = ?,
          fee            = ?, tax_flat       = ?,
          tax_income     = ?, fee_platform   = ?,
          fee_payment    = ?, fee_affiliate  = ?,
          fee_ads        = ?, fee_piship     = ?,
          fee_service    = ?, fee_packaging  = ?,
          fee_operation  = ?, fee_labor      = ?,
          return_fee     = ?
        WHERE order_id = ?
      `).bind(
        p.cost_invoice,  p.cost_real,
        p.profit_invoice, p.profit_real,
        p.total_fee,      p.tax_flat,
        p.tax_income,     p.fee_platform  || 0,
        p.fee_payment  || 0, p.fee_affiliate || 0,
        p.fee_ads      || 0, p.fee_piship    || 0,
        p.fee_service  || 0, p.fee_packaging || 0,
        p.fee_operation|| 0, p.fee_labor     || 0,
        return_fee,
        o.order_id
      )
    })
    await env.DB.batch(stmts)
    updatedV2 += chunk.length
  }

  // Cập nhật cost trong order_items
  const itemStmts = []
  for (const item of itemsAll.results) {
    const p = resolveItemProduct(productLookup, item, varMap, aliasMap)
    itemStmts.push(
      env.DB.prepare(`UPDATE order_items SET cost_real=?, cost_invoice=? WHERE id=?`)
        .bind(Number(p.cost_real || 0) * (item.qty||1), Number(p.cost_invoice || 0) * (item.qty||1), item.id)
    )
  }
  for (let i = 0; i < itemStmts.length; i += 50) {
    await env.DB.batch(itemStmts.slice(i, i + 50))
  }

  return Response.json({ status: "ok", updated, updated_v2: updatedV2 }, { headers: cors })
}

export async function ensureInventoryMovementTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      platform TEXT,
      shop TEXT,
      sku TEXT NOT NULL,
      warehouse_source TEXT NOT NULL DEFAULT 'main',
      qty_delta INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      order_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements(sku, warehouse_source)`).run()
}

export function stockImpactsInventory(order) {
  const oms = String(order?.oms_status || '').toUpperCase()
  const shipping = String(order?.shipping_status || '').toUpperCase()
  const type = String(order?.order_type || '').toLowerCase()
  if (oms === 'CANCELLED' || shipping === 'CANCELLED' || type === 'cancel') return false
  if (oms === 'UNPAID' || shipping === 'UNPAID') return false
  return ['PENDING', 'SHIPPING', 'SHIPPED', 'COMPLETED', 'RETURN'].includes(oms) ||
    ['LOGISTICS_PENDING_ARRANGE', 'LOGISTICS_REQUEST_CREATED', 'LOGISTICS_PACKAGED', 'SHIPPED', 'COMPLETED', 'RETURN', 'RETURN_REFUND', 'FAILED_DELIVERY'].includes(shipping)
}

export async function loadShopInventoryContext(env) {
  const apiShopKeys = new Set()
  const warehouseByShop = new Map()
  try {
    const { results } = await env.DB.prepare(`
      SELECT platform, shop_name, user_name, api_shop_id,
             COALESCE(warehouse_source, 'main') AS warehouse_source,
             access_token
      FROM shops
    `).all()
    for (const shop of results || []) {
      const platform = cleanOrderText(shop.platform).toLowerCase()
      const warehouse = shop.warehouse_source === 'sub' ? 'sub' : 'main'
      for (const value of [shop.shop_name, shop.user_name, shop.api_shop_id]) {
        const identity = cleanOrderText(value).toLowerCase()
        if (!platform || !identity) continue
        const key = `${platform}|${identity}`
        warehouseByShop.set(key, warehouse)
        if (cleanOrderText(shop.access_token)) apiShopKeys.add(key)
      }
    }
  } catch (error) {
    console.error('[INVENTORY_CONTEXT]', error.message)
  }
  return { apiShopKeys, warehouseByShop }
}

export function orderShopKey(order) {
  return `${String(order?.platform || '').toLowerCase()}|${cleanOrderText(order?.shop).toLowerCase()}`
}

export function isApiManagedOrder(order, apiShopKeys) {
  return apiShopKeys.has(orderShopKey(order))
}

export async function adjustProductStock(env, sku, warehouse, diff) {
  if (!sku || !diff) return
  if (warehouse === 'sub') {
    await env.DB.prepare(`
      UPDATE products
      SET stock_sub = IFNULL(stock_sub, 0) + ?,
          stock = IFNULL(stock_main, 0) + IFNULL(stock_sub, 0) + ?
      WHERE sku = ?
    `).bind(diff, diff, sku).run()
    return
  }
  await env.DB.prepare(`
    UPDATE products
    SET stock_main = IFNULL(stock_main, 0) + ?,
        stock = IFNULL(stock_main, 0) + ? + IFNULL(stock_sub, 0)
    WHERE sku = ?
  `).bind(diff, diff, sku).run()
}

export async function applyInventoryMovements(env, processedOrders, processedItems) {
  await ensureInventoryMovementTables(env)
  const ordersById = new Map(processedOrders.map(order => [String(order.order_id), order]))
  const orderIds = [...ordersById.keys()].filter(Boolean)
  if (!orderIds.length) return { adjusted: 0, restored: 0 }

  const { apiShopKeys, warehouseByShop } = await loadShopInventoryContext(env)
  const desired = new Map()

  for (const item of processedItems) {
    const orderId = String(item.order_id || '')
    const order = ordersById.get(orderId)
    const sku = cleanOrderText(item.sku)
    if (!order || !sku || isApiManagedOrder(order, apiShopKeys) || !stockImpactsInventory(order)) continue

    const shopKey = orderShopKey(order)
    const warehouse = warehouseByShop.get(shopKey) || 'main'
    const qty = Math.max(1, Number(item.qty || 1) || 1)
    const key = `${String(order.platform || '').toLowerCase()}|${cleanOrderText(order.shop)}|${orderId}|${sku}|${warehouse}`
    const previous = desired.get(key)
    const qtyDelta = -qty
    if (previous) previous.qty_delta += qtyDelta
    else desired.set(key, {
      key,
      order_id: orderId,
      platform: String(order.platform || '').toLowerCase(),
      shop: cleanOrderText(order.shop),
      sku,
      warehouse_source: warehouse,
      qty_delta: qtyDelta,
      reason: 'order_import',
      order_status: cleanOrderText(order.oms_status || order.shipping_status)
    })
  }

  const placeholders = orderIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT key, order_id, sku, warehouse_source, qty_delta
    FROM inventory_movements
    WHERE order_id IN (${placeholders})
  `).bind(...orderIds).all()
  const existing = new Map((results || []).map(row => [row.key, row]))

  let adjusted = 0
  let restored = 0

  for (const movement of desired.values()) {
    const old = existing.get(movement.key)
    const oldQty = Number(old?.qty_delta || 0)
    const diff = movement.qty_delta - oldQty
    if (diff) {
      await adjustProductStock(env, movement.sku, movement.warehouse_source, diff)
      if (diff < 0) adjusted += Math.abs(diff)
      else restored += diff
    }
    await env.DB.prepare(`
      INSERT INTO inventory_movements
        (key, order_id, platform, shop, sku, warehouse_source, qty_delta, reason, order_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        qty_delta = excluded.qty_delta,
        order_status = excluded.order_status,
        updated_at = datetime('now')
    `).bind(
      movement.key,
      movement.order_id,
      movement.platform,
      movement.shop,
      movement.sku,
      movement.warehouse_source,
      movement.qty_delta,
      movement.reason,
      movement.order_status
    ).run()
  }

  for (const [key, movement] of existing.entries()) {
    if (desired.has(key)) continue
    const qty = Number(movement.qty_delta || 0)
    if (qty) {
      await adjustProductStock(env, movement.sku, movement.warehouse_source || 'main', -qty)
      if (qty < 0) restored += Math.abs(qty)
    }
    await env.DB.prepare(`DELETE FROM inventory_movements WHERE key = ?`).bind(key).run()
  }

  return { adjusted, restored }
}

export async function refreshInventoryMovementsForOrders(env, orderIds) {
  const ids = [...new Set((orderIds || []).map(String).filter(Boolean))]
  if (!ids.length) return { adjusted: 0, restored: 0 }
  const placeholders = ids.map(() => '?').join(',')
  const orders = await env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE order_id IN (${placeholders})
  `).bind(...ids).all()
  const items = await env.DB.prepare(`
    SELECT *
    FROM order_items
    WHERE order_id IN (${placeholders})
  `).bind(...ids).all()
  return applyInventoryMovements(env, orders.results || [], items.results || [])
}

export function orderPushSignature(row = {}) {
  return [
    cleanOrderText(row.platform).toLowerCase(),
    cleanOrderText(row.shop).toLowerCase(),
    cleanOrderText(row.order_type).toLowerCase(),
    cleanOrderText(row.oms_status),
    cleanOrderText(row.shipping_status),
    cleanOrderText(row.shipping_carrier),
    cleanOrderText(row.tracking_number)
  ].join('|')
}

export async function loadOrderPushRows(env, orderIds) {
  const ids = [...new Set((orderIds || []).map(cleanOrderText).filter(Boolean))]
  if (!ids.length) return []
  const rows = []
  const BATCH = 80
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const placeholders = chunk.map(() => '?').join(',')
    const { results } = await env.DB.prepare(`
      SELECT order_id, platform, shop, order_date, order_type, revenue,
             oms_status, shipping_status, shipping_carrier, tracking_number,
             oms_updated_at
      FROM orders_v2
      WHERE order_id IN (${placeholders})
    `).bind(...chunk).all()
    rows.push(...(results || []))
  }
  return rows
}
