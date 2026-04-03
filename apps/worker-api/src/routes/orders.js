// ════════════════════════════════════════════════════════════════════
// IMPORT ORDERS
// - Lưu từng dòng (mỗi SKU 1 dòng)
// - Tính profit ngay khi import dựa trên cost_settings hiện tại
// ════════════════════════════════════════════════════════════════════
import { getCostSettings, calcProfit } from '../utils/db.js'
import { getFilters } from '../utils/filters.js'


async function exportOrders(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const conds  = ["1=1"]
  const params = []
  if (filters.from)     { conds.push(`date(o.order_date) >= ?`); params.push(filters.from) }
  if (filters.to)       { conds.push(`date(o.order_date) <= ?`); params.push(filters.to) }
  if (filters.platform) { conds.push(`o.platform = ?`);          params.push(filters.platform) }
  if (filters.shop)     { conds.push(`o.shop = ?`);              params.push(filters.shop) }

  const urlObj = new URL(request.url);
  const limit = parseInt(urlObj.searchParams.get("limit") || "50");
  const page  = parseInt(urlObj.searchParams.get("page") || "1");
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

async function recalcCost(request, env, cors) {
  const cfg = await getCostSettings(env)
  const productRows = await env.DB.prepare(`SELECT sku, cost_invoice, cost_real FROM products`).all()
  const productMap = {}
  for (const p of productRows.results) productMap[p.sku] = p

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

  let updatedV2 = 0
  for (let i = 0; i < ordersV2.results.length; i += 50) {
    const chunk = ordersV2.results.slice(i, i + 50)
    const stmts = chunk.map(o => {
      const orderItems       = itemsByOrder[o.order_id] || []
      const totalCostReal    = orderItems.reduce((s, item) => {
        const p = productMap[item.sku] || { cost_real: 0, cost_invoice: 0 }
        return s + p.cost_real * (item.qty || 1)
      }, 0)
      const totalCostInvoice = orderItems.reduce((s, item) => {
        const p = productMap[item.sku] || { cost_real: 0, cost_invoice: 0 }
        return s + p.cost_invoice * (item.qty || 1)
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

      const tiktokFee = o.platform === 'tiktok' ? tiktokFeeMap[o.order_id] : null
    const orderForCalc = {
      ...o,
      cost_invoice:    totalCostInvoice,
      cost_real:       totalCostReal,
      is_first_sku:    1,
      return_fee,
      _fee_real:       !!tiktokFee,
      _fee_commission: tiktokFee?.fee_commission || 0,
      _fee_payment:    tiktokFee?.fee_payment    || 0,
      _fee_service:    tiktokFee?.fee_service    || 0,
      _fee_affiliate:  tiktokFee?.fee_affiliate  || 0,
      _fee_ads:        tiktokFee?.fee_ads        || 0,
      _fee_handling:   tiktokFee?.fee_handling   || 0,
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
    const p = productMap[item.sku] || { cost_real: 0, cost_invoice: 0 }
    itemStmts.push(
      env.DB.prepare(`UPDATE order_items SET cost_real=?, cost_invoice=? WHERE id=?`)
        .bind(p.cost_real * (item.qty||1), p.cost_invoice * (item.qty||1), item.id)
    )
  }
  for (let i = 0; i < itemStmts.length; i += 50) {
    await env.DB.batch(itemStmts.slice(i, i + 50))
  }

  return Response.json({ status: "ok", updated, updated_v2: updatedV2 }, { headers: cors })
}

// ════════════════════════════════════════════════════════════════════
// IMPORT ORDERS V2 — lưu vào orders_v2 + order_items
// ════════════════════════════════════════════════════════════════════
async function importOrdersV2(request, env, cors) {
  const payload = await request.json()
  const { orders, items } = payload
  
  // --- [QUY TẮC 14] LOG SERVER ĐỂ BẮT BỆNH ---
  console.log(`[IMPORT_V2] 📥 Nhận payload: ${orders?.length || 0} đơn hàng, ${items?.length || 0} sản phẩm`);
  if (items && items.length > 0) {
      console.log(`[IMPORT_V2] 📦 Dữ liệu SP mẫu đầu tiên:`, JSON.stringify(items[0]));
  } else {
      console.log(`[IMPORT_V2] ⚠️ CẢNH BÁO: Không nhận được mảng items nào từ Bot gửi lên!`);
  }

  const cfg = await getCostSettings(env)

  const productRows = await env.DB.prepare(`SELECT sku, cost_invoice, cost_real FROM products`).all()
  const productMap = {}
  for (const p of productRows.results) productMap[p.sku] = p

  // 1. DỊCH SẢN PHẨM & MAP SKU TRƯỚC ĐỂ TÌM GIÁ VỐN
  const varRows = await env.DB.prepare(`SELECT platform_sku, internal_sku, image_url, variation_name FROM product_variations WHERE map_status='MAPPED'`).all()
  const varMap = {}
  for (const v of varRows.results) {
    if (v.platform_sku) varMap[v.platform_sku.toLowerCase()] = v
    if (v.variation_name) varMap[v.variation_name.toLowerCase()] = v
  }
  
  // 🌟 Đọc thêm "Sổ tay" bí kíp (sku_alias) do chức năng Map Nhanh vừa tạo ra
  const aliasRows = await env.DB.prepare(`SELECT platform_sku, internal_sku FROM sku_alias`).all()
  const aliasMap = {}
  for (const a of aliasRows.results) {
    if (a.platform_sku) aliasMap[a.platform_sku.toLowerCase()] = a.internal_sku
  }

  const processedItems = items.map(i => {
    const rawSku = (i.sku || '').toLowerCase()
    const cleanVar = (i.clean_variation || '').toLowerCase()
    const rawVariation = (i.variation_name || '').toLowerCase()
    const rawName = (i.product_name || '').toLowerCase()
    
    // Lưới quét 4 tầng: sku (trong ngoặc) -> clean_variation (phân loại sạch) -> variation_name (bản gốc dính mã) -> product_name
    const mapped = varMap[rawSku] || varMap[cleanVar] || varMap[rawVariation] || varMap[rawName] || null
    const finalSku = mapped?.internal_sku || aliasMap[rawSku] || aliasMap[cleanVar] || aliasMap[rawVariation] || aliasMap[rawName] || i.sku || ''
    
    // 🌟 GẮN GIÁ VỐN TỰ ĐỘNG TỪ KHO
    // Tra mã finalSku trong kho (productMap), nếu không có thì mặc định vốn = 0
    const prod = productMap[finalSku] || { cost_real: 0, cost_invoice: 0 }
    const itemQty = i.qty || 1
    
    return { 
      ...i, 
      sku: finalSku,
      cost_real: prod.cost_real * itemQty,       // Vốn thực tế = Vốn 1 SP * Số lượng
      cost_invoice: prod.cost_invoice * itemQty  // Vốn hóa đơn = Vốn 1 SP * Số lượng
    }
  })

  // 2. TÍNH LỢI NHUẬN DỰA TRÊN SẢN PHẨM ĐÃ CÓ GIÁ VỐN
  const processedOrders = orders.map(o => {
    const orderItems = processedItems.filter(i => i.order_id === o.order_id)
    const totalCostReal = orderItems.reduce((s, i) => s + i.cost_real, 0)
    const totalCostInvoice = orderItems.reduce((s, i) => s + i.cost_invoice, 0)

    let return_fee = o.return_fee || 0
    if (o.order_type === "return") {
      return_fee = o.platform === "tiktok" ? (cfg["tiktok_return_fee"]?.value ?? 4620) : (cfg["shopee_return_fee"]?.value ?? 1620)
    } else if (o.order_type === "cancel" && /giao.*thất bại|không giao được|failed delivery/i.test(o.cancel_reason || "")) {
      return_fee = o.platform === "tiktok" ? (cfg["tiktok_failed_delivery_fee"]?.value ?? 1620) : (cfg["shopee_failed_delivery_fee"]?.value ?? 1620)
    }

    const p = calcProfit({ ...o, cost_invoice: totalCostInvoice, cost_real: totalCostReal, is_first_sku: 1, return_fee }, cfg)
    return { ...o, cost_invoice: p.cost_invoice, cost_real: p.cost_real, fee: p.total_fee, profit_invoice: p.profit_invoice, profit_real: p.profit_real, tax_flat: p.tax_flat, tax_income: p.tax_income, fee_platform: p.fee_platform || 0, fee_payment: p.fee_payment || 0, fee_affiliate: p.fee_affiliate || 0, fee_ads: p.fee_ads || 0, fee_piship: p.fee_piship || 0, fee_service: p.fee_service || 0, fee_packaging: p.fee_packaging || 0, fee_operation: p.fee_operation || 0, fee_labor: p.fee_labor || 0, return_fee }
  })

  const BATCH = 50
  let importedOrders = 0, importedItems = 0, skipped = 0

  for (let i = 0; i < processedOrders.length; i += BATCH) {
    const chunk = processedOrders.slice(i, i + BATCH)
    const stmts = chunk.map(o => env.DB.prepare(`
      INSERT INTO orders_v2
        (order_id, platform, shop, order_date, order_type, revenue, raw_revenue, cost_invoice, cost_real, fee, profit_invoice, profit_real, tax_flat, tax_income, fee_platform, fee_payment, fee_affiliate, fee_ads, fee_piship, fee_service, fee_packaging, fee_operation, fee_labor, cancel_reason, return_fee, shipped, discount_shop, discount_shopee, discount_combo, shipping_return_fee, shipping_status, shipping_carrier, tracking_number, customer_name, oms_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET
        order_date = CASE WHEN excluded.order_date != '' AND excluded.order_date IS NOT NULL THEN excluded.order_date ELSE orders_v2.order_date END,
        platform=excluded.platform, shop=excluded.shop, order_type=excluded.order_type, revenue=excluded.revenue, raw_revenue=excluded.raw_revenue, cost_invoice=excluded.cost_invoice, cost_real=excluded.cost_real, fee=excluded.fee, profit_invoice=excluded.profit_invoice, profit_real=excluded.profit_real, tax_flat=excluded.tax_flat, tax_income=excluded.tax_income, fee_platform=excluded.fee_platform, fee_payment=excluded.fee_payment, fee_affiliate=excluded.fee_affiliate, fee_ads=excluded.fee_ads, fee_piship=excluded.fee_piship, fee_service=excluded.fee_service, fee_packaging=excluded.fee_packaging, fee_operation=excluded.fee_operation, fee_labor=excluded.fee_labor, cancel_reason=excluded.cancel_reason, return_fee=excluded.return_fee, shipped=excluded.shipped, discount_shop=excluded.discount_shop, discount_shopee=excluded.discount_shopee, discount_combo=excluded.discount_combo, shipping_return_fee=excluded.shipping_return_fee, shipping_status=excluded.shipping_status, shipping_carrier=excluded.shipping_carrier, tracking_number=excluded.tracking_number, customer_name=excluded.customer_name,
        oms_status = CASE WHEN excluded.oms_status = 'PENDING' THEN orders_v2.oms_status ELSE excluded.oms_status END
    `).bind(
      o.order_id ?? null, o.platform ?? '', o.shop ?? '', o.order_date ?? null, o.order_type ?? 'normal', o.revenue ?? 0, o.raw_revenue ?? 0, o.cost_invoice ?? 0, o.cost_real ?? 0, o.fee ?? 0, o.profit_invoice ?? 0, o.profit_real ?? 0, o.tax_flat ?? 0, o.tax_income ?? 0, o.fee_platform ?? 0, o.fee_payment ?? 0, o.fee_affiliate ?? 0, o.fee_ads ?? 0, o.fee_piship ?? 0, o.fee_service ?? 0, o.fee_packaging ?? 0, o.fee_operation ?? 0, o.fee_labor ?? 0, o.cancel_reason ?? null, o.return_fee ?? 0, o.shipped ?? 0, o.discount_shop ?? 0, o.discount_shopee ?? 0, o.discount_combo ?? 0, o.shipping_return_fee ?? 0, o.shipping_status ?? '', o.shipping_carrier ?? '', o.tracking_number ?? '', o.customer_name ?? '', o.oms_status ?? 'PENDING'
    ))
    try { await env.DB.batch(stmts); importedOrders += chunk.length } catch(e) { skipped += chunk.length }
  }

  const orderIds = [...new Set(processedItems.map(i => i.order_id))]
  for (let i = 0; i < orderIds.length; i += BATCH) {
    const chunk = orderIds.slice(i, i + BATCH)
    const placeholders = chunk.map(() => "?").join(",")
    await env.DB.prepare(`DELETE FROM order_items WHERE order_id IN (${placeholders})`).bind(...chunk).run()
  }

  for (let i = 0; i < processedItems.length; i += BATCH) {
    const chunk = processedItems.slice(i, i + BATCH)
    const stmts = chunk.map(item => env.DB.prepare(`
      INSERT INTO order_items (order_id, sku, variation_name, product_name, qty, revenue_line, cost_real, cost_invoice, image_url)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      item.order_id, item.sku, item.variation_name || "", item.product_name || "", item.qty || 1, item.revenue_line || 0, item.cost_real || 0, item.cost_invoice || 0, item.image_url || ""
    ))
    try { 
        await env.DB.batch(stmts); 
        importedItems += chunk.length 
    } catch(e) { 
        console.error(`[IMPORT_V2] ❌ LỖI INSERT SẢN PHẨM VÀO DB:`, e.message);
    }
  }

  return Response.json({ status: "ok", imported_orders: importedOrders, imported_items: importedItems, skipped }, { headers: cors })
}

async function getOrders(request, env, cors) {
  const url    = new URL(request.url)
  const from   = url.searchParams.get("from")
  const to     = url.searchParams.get("to")
  const plt    = url.searchParams.get("platform")
  const shop   = url.searchParams.get("shop")
  const type   = url.searchParams.get("order_type")
  const status = url.searchParams.get("oms_status")
  const search   = url.searchParams.get("search")
  const shipping = url.searchParams.get("shipping_status")
  const express  = url.searchParams.get("express") // 🌟 Bổ sung Hỏa tốc
  const carrier  = url.searchParams.get("carrier") // 🌟 Bổ sung Lọc ĐVVC
  const dataStatus = url.searchParams.get("data_status") // 🌟 Bổ sung Lọc Khuyết Dữ Liệu
  const page   = parseInt(url.searchParams.get("page") || "1")
  const limit  = parseInt(url.searchParams.get("limit") || "50")
  const offset = (page - 1) * limit

  const conds  = ["1=1"]
  const params = []

  if (from)   { conds.push(`date(o.order_date) >= ?`); params.push(from) }
  if (to)     { conds.push(`date(o.order_date) <= ?`); params.push(to) }
  if (plt)    { conds.push(`o.platform = ?`);          params.push(plt) }
  if (shop)   { conds.push(`o.shop = ?`);              params.push(shop) }
  if (type)   { conds.push(`o.order_type = ?`);        params.push(type) }
  if (status) { conds.push(`o.oms_status = ?`);        params.push(status) }
  if (search) {
    conds.push(`(o.order_id LIKE ? OR o.shop LIKE ? OR o.customer_name LIKE ? OR o.tracking_number LIKE ?)`)
    const q = `%${search}%`
    params.push(q, q, q, q)
  }
if (shipping) { conds.push(`o.shipping_status = ?`); params.push(shipping) }
  
  // 🌟 Lọc chuẩn ĐVVC (Dropdown)
  if (carrier) { 
    conds.push(`o.shipping_carrier LIKE ?`); 
    params.push(`%${carrier}%`); 
  }

  // 🌟 Lọc đơn Hỏa tốc (Quét từ khóa ĐVVC)
  if (express === "1") { 
    conds.push(`(o.shipping_carrier LIKE '%Ahamove%' OR o.shipping_carrier LIKE '%Grab%' OR o.shipping_carrier LIKE '%BeDelivery%' OR o.shipping_carrier LIKE '%Instant%' OR o.shipping_carrier LIKE '%Hỏa Tốc%')`) 
  }

  // 🌟 BỘ LỌC KHUYẾT DỮ LIỆU (QUAN TRỌNG)
  if (dataStatus === "unmapped") {
    // Tìm các đơn hàng có chứa item bị rỗng SKU hoặc có chữ "Chưa Map"
    conds.push(`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id AND (oi.sku IS NULL OR oi.sku = '' OR oi.sku LIKE '%Chưa Map%'))`)
  } else if (dataStatus === "no_cost") {
    // Tìm các đơn hàng có SKU đầy đủ nhưng cost_real = 0
    conds.push(`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id AND oi.sku IS NOT NULL AND oi.sku != '' AND oi.sku NOT LIKE '%Chưa Map%' AND (oi.cost_real IS NULL OR oi.cost_real <= 0))`)
  }

  const where = conds.join(" AND ")

  // Đếm tổng để trả về totalPages
  const { results: countRows } = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM orders_v2 o WHERE ${where}
  `).bind(...params).all()
  const total = countRows[0]?.total || 0

  // Lấy orders_v2 phân trang
  const { results: orders } = await env.DB.prepare(`
    SELECT o.* FROM orders_v2 o
    WHERE ${where}
    ORDER BY o.order_date DESC, o.order_id DESC
    LIMIT ${limit} OFFSET ${offset}
  `).bind(...params).all()

  // Lấy order_items của các đơn này
  const orderIds = orders.map(o => o.order_id)
  let items = []
  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => "?").join(",")
    const { results } = await env.DB.prepare(`
      SELECT oi.*, COALESCE(NULLIF(oi.image_url, ''), p.image_url) AS image_url
      FROM order_items oi
      LEFT JOIN products p ON p.sku = oi.sku
      WHERE oi.order_id IN (${placeholders})
    `).bind(...orderIds).all()
    items = results
  }

  // Gắn items vào từng order
  const itemsByOrder = {}
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
    itemsByOrder[item.order_id].push(item)
  }
  const data = orders.map(o => ({ ...o, items: itemsByOrder[o.order_id] || [] }))

  return Response.json({
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  }, { headers: cors })
}

async function updateOmsStatus(request, env, cors, orderId) {
  const body = await request.json()
  const { oms_status } = body

  const VALID = [
    'PENDING',          // Chờ xác nhận
    'CONFIRMED',        // Đã xác nhận
    'PACKING',          // Đang đóng gói
    'PACKED',           // Đã đóng gói
    'HANDED_OVER',      // Đã giao cho shipper
    'COMPLETED',        // Hoàn thành (shipper giao thành công)
    'CANCELLED_TRANSIT',// Hủy trong quá trình vận chuyển
    'FAILED_DELIVERY',  // Giao khách không thành công
    'RETURN_REFUND',    // Trả hàng hoàn tiền
  ]
  if (!VALID.includes(oms_status))
    return Response.json({ error: 'Invalid status' }, { status: 400, headers: cors })

  await env.DB.prepare(`
    UPDATE orders_v2 SET oms_status = ?, oms_updated_at = datetime('now', '+7 hours')
    WHERE order_id = ?
  `).bind(oms_status, orderId).run()
  return Response.json({ status: "ok" }, { headers: cors })
}

export { exportOrders, recalcCost, importOrdersV2, getOrders, updateOmsStatus }