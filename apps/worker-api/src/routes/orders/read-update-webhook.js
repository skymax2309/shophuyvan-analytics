import { customerRiskKeySql, customerRiskOrderFilterSql, ensureCustomerRiskTables } from '../../core/customer/risk-core.js'
import { buildLogisticsWatchFilterCondition } from '../../core/logistics/watch-core.js'
import { applyOrderFeePhase1ToOrderRow } from '../../core/orders/fee-phase1-core.js'
import { activePendingOrderWindowSql } from '../../core/orders/status-core.js'
import { buildOrderTransportSummary, ensureOrderTransportColumns } from '../../core/orders/transport-core.js'
import { ensureExternalApiTables } from '../../core/external/schema-core.js'
import { externalOrderStatusWebhookPayload } from '../../core/external/order-core.js'
import { sendFacebookCrmWebhook } from '../../core/external/webhook-core.js'
import { actualCarrierSql, ensureOrderFeeDetailsReadTable, feeRawNumberSql, getImportCarrier, getImportTracking, loadOrderFeePhase1Context, normalizeCarrierByTracking } from './cost-resolution.js'
import { refreshInventoryMovementsForOrders } from './export-cost-stock.js'
import { addCancelledWorkflowCondition, addReturnWorkflowCondition, cleanOrderText, ensureOrderReturnComplaintColumns, expandOmsStatusFilter, keepHigherPendingProgress, normalizeDisplayItemsForOrder, normalizeImportedWorkflowStatus, normalizeOmsStatusPair, normalizePlatform, orderTypeFromWorkflowStatus, shouldLimitActivePendingWindow } from './status-workflow.js'
function cleanYmdParam(value) {
  const text = cleanOrderText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function addDaysYmd(ymd, days = 1) {
  const [year, month, day] = String(ymd || '').split('-').map(Number)
  if (!year || !month || !day) return ymd
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export async function normalizeOrderWorkflowStatuses(request, env, cors) {
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') === '1'
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5000', 10) || 5000, 1), 20000)
  const orderId = cleanOrderText(url.searchParams.get('order_id'))
  const conds = ['1=1']
  const params = []
  if (orderId) {
    conds.push('order_id = ?')
    params.push(orderId)
  } else {
    conds.push(`(
      oms_status = 'PENDING'
      OR COALESCE(oms_status, '') NOT IN ('UNPAID', 'PENDING', 'SHIPPING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'RETURN')
      OR (oms_status = 'CANCELLED' AND COALESCE(order_type, '') != 'cancel')
      OR (oms_status = 'RETURN' AND COALESCE(order_type, '') != 'return')
      OR (shipping_status IN ('RETURN', 'RETURN_REFUND', 'RETURN_COMPLAINT', 'TO_RETURN', 'FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST') AND COALESCE(order_type, '') != 'return')
      OR (shipping_status IN ('CANCELLED', 'CANCELLED_TRANSIT') AND COALESCE(order_type, '') != 'cancel')
      OR (oms_status = 'COMPLETED' AND COALESCE(shipping_status, '') != 'COMPLETED')
      OR (oms_status = 'CANCELLED' AND COALESCE(shipping_status, '') != 'CANCELLED')
      OR (oms_status = 'RETURN' AND COALESCE(shipping_status, '') NOT IN ('RETURN', 'RETURN_REFUND', 'RETURN_COMPLAINT', 'TO_RETURN', 'FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST'))
      OR (oms_status IN ('SHIPPING', 'SHIPPED') AND COALESCE(shipping_status, '') NOT IN ('SHIPPED', 'TO_CONFIRM_RECEIVE'))
      OR shipping_status NOT IN (
        'UNPAID',
        'LOGISTICS_PENDING_ARRANGE',
        'LOGISTICS_REQUEST_CREATED',
        'LOGISTICS_PACKAGED',
        'ADVANCE_FULFILMENT',
        'IN_CANCEL',
        'SHIPPED',
        'TO_CONFIRM_RECEIVE',
        'COMPLETED',
        'CANCELLED',
        'RETURN',
        'RETURN_REFUND',
        'RETURN_COMPLAINT',
        'TO_RETURN',
        'LOGISTICS_IN_RETURN',
        'LOGISTICS_RETURNED_BY_SHIPPER',
        'LOGISTICS_RETURN_PACKAGE_RECEIVED',
        'LOGISTICS_LOST',
        'FAILED_DELIVERY',
        'FAILED_DELIVERY_ATTEMPT'
      )
    )`)
  }

  const { results } = await env.DB.prepare(`
    SELECT order_id, order_type, oms_status, shipping_status, tracking_number, shipping_carrier, cancel_reason
    FROM orders_v2
    WHERE ${conds.join(' AND ')}
    ORDER BY order_date DESC, order_id DESC
    LIMIT ?
  `).bind(...params, limit).all()

  const changes = []
  for (const row of results || []) {
    let next = normalizeImportedWorkflowStatus(row, row.shipping_status)
    next = keepHigherPendingProgress(row, next)
    const nextOrderType = orderTypeFromWorkflowStatus(next, row.order_type)
    const currentOms = cleanOrderText(row.oms_status) || 'PENDING'
    const currentShipping = cleanOrderText(row.shipping_status)
    const currentOrderType = cleanOrderText(row.order_type).toLowerCase() || 'normal'
    if (currentOms === next.oms && currentShipping === next.shipping && currentOrderType === nextOrderType) continue
    changes.push({
      order_id: row.order_id,
      from: { oms_status: currentOms, shipping_status: currentShipping, order_type: currentOrderType },
      to: { oms_status: next.oms, shipping_status: next.shipping, order_type: nextOrderType }
    })
  }

  if (!dryRun && changes.length) {
    const BATCH = 80
    for (let i = 0; i < changes.length; i += BATCH) {
      const chunk = changes.slice(i, i + BATCH)
      await env.DB.batch(chunk.map(change =>
        env.DB.prepare(`
          UPDATE orders_v2
          SET oms_status = ?, shipping_status = ?, order_type = ?, oms_updated_at = datetime('now', '+7 hours')
          WHERE order_id = ?
        `).bind(change.to.oms_status, change.to.shipping_status, change.to.order_type, change.order_id)
      ))
    }
    await refreshInventoryMovementsForOrders(env, changes.map(change => change.order_id)).catch(error => {
      console.error('[NORMALIZE_WORKFLOW] INVENTORY:', error.message)
    })
  }

  return Response.json({
    status: 'ok',
    dry_run: dryRun,
    scanned: results?.length || 0,
    updated: dryRun ? 0 : changes.length,
    would_update: changes.length,
    samples: changes.slice(0, 30)
  }, { headers: cors })
}

export async function getOrders(request, env, cors) {
  await ensureOrderReturnComplaintColumns(env)
  const url    = new URL(request.url)
  const from   = url.searchParams.get("from")
  const to     = url.searchParams.get("to")
  const plt    = url.searchParams.get("platform")
  const shop   = url.searchParams.get("shop")
  const type   = url.searchParams.get("order_type")
  const status = url.searchParams.get("oms_status")
  const search   = url.searchParams.get("search")
  const shipping = url.searchParams.get("shipping_status")
  const logisticsWatch = url.searchParams.get("logistics_watch")
  const customerRisk = url.searchParams.get("customer_risk")
  const includeStalePending = url.searchParams.get("include_stale") === "1"
  const express  = url.searchParams.get("express") // 🌟 Bổ sung Hỏa tốc
  const carrier  = url.searchParams.get("carrier") // 🌟 Bổ sung Lọc ĐVVC
  const dataStatus = url.searchParams.get("data_status") // 🌟 Bổ sung Lọc Khuyết Dữ Liệu
  const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10) || 1, 1)
  const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 1), 500)
  const offset = (page - 1) * limit

  const conds  = ["1=1"]
  const params = []

    const fromYmd = cleanYmdParam(from)
  const toYmd = cleanYmdParam(to)

  if (fromYmd) {
    conds.push(`o.order_date >= ?`)
    params.push(fromYmd)
  }

  if (toYmd) {
    conds.push(`o.order_date < ?`)
    params.push(addDaysYmd(toYmd, 1))
  }

  if (plt) {
    conds.push(`o.platform = ?`)
    params.push(plt)
  }

  if (shop) {
    conds.push(`o.shop = ?`)
    params.push(shop)
  }
  if (type) {
    // Lọc theo loại đơn dựa trên core trạng thái, nên đơn RETURN/CANCELLED từ API vẫn lọt đúng tab dù order_type cũ chưa sạch.
    const normalizedType = cleanOrderText(type).toLowerCase()
    if (normalizedType === 'cancel') {
      addCancelledWorkflowCondition(conds, params, 'o')
    } else if (normalizedType === 'return') {
      addReturnWorkflowCondition(conds, params, 'o')
    } else {
      conds.push(`(
        COALESCE(o.order_type, 'normal') = 'normal'
        AND COALESCE(o.oms_status, '') NOT IN ('CANCELLED', 'RETURN')
        AND COALESCE(o.shipping_status, '') NOT IN ('CANCELLED', 'CANCELLED_TRANSIT', 'RETURN', 'RETURN_REFUND', 'TO_RETURN', 'FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST')
      )`)
    }
  }
  if (status) {
    const requestedStatuses = cleanOrderText(status).split(',').map(item => item.trim().toUpperCase()).filter(Boolean)
    if (requestedStatuses.length === 1 && requestedStatuses[0] === 'RETURN') {
      // Tab Hoàn Hàng cần gom theo order_type + trạng thái hoàn thực tế, vì API sàn có thể giữ shipping_status là COMPLETED sau khi hàng hoàn đã về shop.
      addReturnWorkflowCondition(conds, params, 'o')
    } else if (requestedStatuses.length === 1 && requestedStatuses[0] === 'CANCELLED') {
      addCancelledWorkflowCondition(conds, params, 'o')
    } else {
      const statusArr = expandOmsStatusFilter(status)
      const marks = statusArr.map(() => '?').join(',')
      conds.push(`(o.oms_status IN (${marks}) OR o.shipping_status IN (${marks}))`)
      params.push(...statusArr, ...statusArr)
    }
  }
  if (search) {
    conds.push(`(o.order_id LIKE ? OR o.shop LIKE ? OR o.customer_name LIKE ? OR o.tracking_number LIKE ?)`)
    const q = `%${search}%`
    params.push(q, q, q, q)
  }
if (shipping) { 
  // 🌟 Đã bọc thêm .map(s => s.trim()) để gọt sạch khoảng trắng thừa
  const shipArr = shipping.split(',').map(s => s.trim()).filter(Boolean)
  const hasComplaintTab = shipArr.includes('RETURN_COMPLAINT')
  const realShipArr = shipArr.filter(s => s !== 'RETURN_COMPLAINT')
  const shippingParts = []
  if (realShipArr.length) {
    const marks = realShipArr.map(() => '?').join(',')
    shippingParts.push(`o.shipping_status IN (${marks})`)
    params.push(...realShipArr)
  }
  if (hasComplaintTab) {
    shippingParts.push(`COALESCE(o.return_complaint_status, '') NOT IN ('', 'closed', 'resolved', 'cancelled')`)
  }
  if (shippingParts.length) conds.push(`(${shippingParts.join(' OR ')})`)
}

  const logisticsWatchCondition = buildLogisticsWatchFilterCondition(logisticsWatch, 'o')
  if (logisticsWatchCondition) {
    // Bộ lọc này phục vụ panel Theo dõi vận chuyển ngay trên OMS, không bắt vận hành mở Trung tâm API.
    conds.push(logisticsWatchCondition)
  }

  const customerRiskCondition = customerRiskOrderFilterSql(customerRisk, 'o')
  if (customerRiskCondition) {
    // Cảnh báo khách rủi ro chỉ lọc hồ sơ đã lưu trong D1, không tự chặn hoặc hủy đơn.
    conds.push(customerRiskCondition)
  }
  
  // 🌟 Lọc chuẩn ĐVVC (Dropdown)
  if (carrier) { 
    conds.push(`LOWER(${actualCarrierSql('o')}) LIKE LOWER(?)`);
    params.push(`%${carrier}%`); 
  }

  // 🌟 Lọc đơn Hỏa tốc (Quét từ khóa ĐVVC)
  if (express === "1") { 
    const carrierExpr = `LOWER(${actualCarrierSql('o')})`
    conds.push(`(${carrierExpr} LIKE '%ahamove%' OR ${carrierExpr} LIKE '%grab%' OR ${carrierExpr} LIKE '%bedelivery%' OR ${carrierExpr} LIKE '%instant%' OR ${carrierExpr} LIKE '%hỏa tốc%')`)
  }

  // 🌟 BỘ LỌC KHUYẾT DỮ LIỆU (QUAN TRỌNG)
  if (dataStatus === "unmapped") {
    // Tìm các đơn hàng có chứa item bị rỗng SKU hoặc có chữ "Chưa Map"
    conds.push(`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id AND (oi.sku IS NULL OR oi.sku = '' OR oi.sku LIKE '%Chưa Map%'))`)
  } else if (dataStatus === "no_cost") {
    // Tìm các đơn hàng có SKU đầy đủ nhưng cost_real = 0
    conds.push(`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id AND oi.sku IS NOT NULL AND oi.sku != '' AND oi.sku NOT LIKE '%Chưa Map%' AND (oi.cost_real IS NULL OR oi.cost_real <= 0))`)
  }

  if (!includeStalePending && !search && !from && !to && shouldLimitActivePendingWindow(status, shipping)) {
    // Tab thao tác PENDING chỉ nên hiện đơn còn trong cửa sổ vận hành; đơn cũ vẫn tìm được bằng mã đơn hoặc lọc ngày rõ ràng.
    conds.push(activePendingOrderWindowSql('o'))
  }

  const where = conds.join(" AND ")
  await ensureOrderFeeDetailsReadTable(env)
  await ensureCustomerRiskTables(env)

  // Đếm tổng để trả về totalPages
  const { results: countRows } = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM orders_v2 o WHERE ${where}
  `).bind(...params).all()
  const total = countRows[0]?.total || 0

  // Lấy orders_v2 phân trang
  const { results: orders } = await env.DB.prepare(`
    SELECT
      o.*,
      COALESCE(f.source, '') AS fee_source,
      COALESCE(cr.risk_key, '') AS customer_risk_key,
      COALESCE(cr.risk_level, '') AS customer_risk_level,
      COALESCE(cr.risk_label, '') AS customer_risk_label,
      COALESCE(cr.risk_reason, '') AS customer_risk_reason,
      COALESCE(cr.total_orders, 0) AS customer_risk_total_orders,
      COALESCE(cr.return_count, 0) AS customer_risk_return_count,
      COALESCE(cr.failed_delivery_count, 0) AS customer_risk_failed_delivery_count,
      COALESCE(cr.cancel_count, 0) AS customer_risk_cancel_count,
      COALESCE(cr.warning_event_count, 0) AS customer_risk_warning_event_count,
      COALESCE(cr.last_risk_order_at, '') AS customer_risk_last_order_at,
      COALESCE(f.updated_at, '') AS fee_synced_at,
      COALESCE(f.total_fees, 0) AS fee_api_total,
      f.settlement AS fee_detail_settlement,
      f.fee_commission AS fee_detail_commission,
      f.fee_payment AS fee_detail_payment,
      f.fee_service AS fee_detail_service,
      f.fee_affiliate AS fee_detail_affiliate,
      f.fee_piship AS fee_detail_piship,
      f.fee_handling AS fee_detail_handling,
      f.fee_ads AS fee_detail_ads,
      f.fee_shipping AS fee_detail_shipping,
      f.tax_vat AS fee_detail_tax_vat,
      f.tax_pit AS fee_detail_tax_pit,
      ${feeRawNumberSql('$.order_income.voucher_from_seller')} AS fee_detail_voucher_from_seller,
      ${feeRawNumberSql('$.order_income.seller_discount')} AS fee_detail_seller_discount,
      ${feeRawNumberSql('$.order_income.voucher_from_shopee')} AS fee_detail_voucher_from_shopee,
      ${feeRawNumberSql('$.order_income.shopee_discount')} AS fee_detail_shopee_discount,
      ${feeRawNumberSql('$.order_income.coins')} AS fee_detail_coins,
      CASE WHEN f.order_id IS NOT NULL
         AND (
           f.fee_commission IS NOT NULL OR f.fee_payment IS NOT NULL OR
           f.fee_service IS NOT NULL OR f.fee_affiliate IS NOT NULL OR
           f.fee_piship IS NOT NULL OR f.fee_handling IS NOT NULL OR
           f.fee_ads IS NOT NULL OR f.fee_shipping IS NOT NULL OR
           f.tax_vat IS NOT NULL OR f.tax_pit IS NOT NULL OR
           f.total_fees IS NOT NULL
         )
        THEN 1 ELSE 0 END AS fee_is_real
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN customer_risk_profiles cr ON cr.risk_key = ${customerRiskKeySql('o')}
    WHERE ${where}
    ORDER BY o.order_date DESC, o.order_id DESC
    LIMIT ${limit} OFFSET ${offset}
  `).bind(...params).all()

  // Lấy order_items của các đơn này
  const orderIds = orders.map(o => o.order_id)
  let items = []
  if (orderIds.length > 0) {
    const BATCH = 80
    for (let i = 0; i < orderIds.length; i += BATCH) {
      const chunk = orderIds.slice(i, i + BATCH)
      const placeholders = chunk.map(() => "?").join(",")
      const { results } = await env.DB.prepare(`
        SELECT
          oi.id,
          oi.order_id,
          oi.sku,
          oi.variation_name,
          oi.product_name,
          oi.qty,
          oi.revenue_line,
          oi.cost_real,
          oi.cost_invoice,
          COALESCE(NULLIF(oi.image_url, ''), p.image_url) AS image_url,
          p.sku AS db_sku_check
        FROM order_items oi
        LEFT JOIN products p ON p.sku = oi.sku
        WHERE oi.order_id IN (${placeholders})
      `).bind(...chunk).all()
      items.push(...results)
    }
  }

  // Gắn items vào từng order
  const itemsByOrder = {}
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
    itemsByOrder[item.order_id].push(item)
  }
  const phase1Context = await loadOrderFeePhase1Context(env)
  const data = orders.map(o => ({
    ...applyOrderFeePhase1ToOrderRow(o, phase1Context),
    items: normalizeDisplayItemsForOrder(o, itemsByOrder[o.order_id] || [])
  }))

  return Response.json({
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  }, { headers: cors })
}

export async function cleanupOrderFeePhase1(request, env, cors) {
  const url = new URL(request.url)
  let body = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const platform = normalizePlatform(body.platform || url.searchParams.get('platform'))
  const shop = cleanOrderText(body.shop || url.searchParams.get('shop'))
  const limit = Math.min(Math.max(Number(body.limit || url.searchParams.get('limit') || 50000) || 50000, 1), 100000)

  await ensureOrderFeeDetailsReadTable(env)

  const conds = ['1=1']
  const params = []
  if (platform) {
    conds.push(`LOWER(COALESCE(o.platform, '')) = ?`)
    params.push(platform)
  }
  if (shop) {
    conds.push(`o.shop = ?`)
    params.push(shop)
  }

  const { results } = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.order_type,
      o.revenue,
      o.fee,
      o.profit_real,
      o.profit_invoice,
      o.fee_packaging,
      o.fee_operation,
      o.fee_labor,
      o.return_fee,
      COALESCE(f.source, '') AS fee_source,
      f.fee_commission AS fee_detail_commission,
      f.fee_payment AS fee_detail_payment,
      f.fee_service AS fee_detail_service,
      f.fee_affiliate AS fee_detail_affiliate,
      f.fee_piship AS fee_detail_piship,
      f.fee_handling AS fee_detail_handling,
      f.fee_ads AS fee_detail_ads,
      f.fee_shipping AS fee_detail_shipping,
      f.tax_vat AS fee_detail_tax_vat,
      f.tax_pit AS fee_detail_tax_pit,
      ${feeRawNumberSql('$.order_income.voucher_from_seller')} AS fee_detail_voucher_from_seller,
      ${feeRawNumberSql('$.order_income.seller_discount')} AS fee_detail_seller_discount,
      ${feeRawNumberSql('$.order_income.voucher_from_shopee')} AS fee_detail_voucher_from_shopee,
      ${feeRawNumberSql('$.order_income.shopee_discount')} AS fee_detail_shopee_discount,
      ${feeRawNumberSql('$.order_income.coins')} AS fee_detail_coins
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    WHERE ${conds.join(' AND ')}
    ORDER BY datetime(COALESCE(o.order_date, '1970-01-01 00:00:00')) DESC, o.order_id DESC
    LIMIT ?
  `).bind(...params, limit).all()

  const phase1Context = await loadOrderFeePhase1Context(env)
  const updates = []
  const preview = []
  const modeStats = {
    api: 0,
    mixed: 0,
    estimate: 0
  }

  for (const row of results || []) {
    const patched = applyOrderFeePhase1ToOrderRow(row, phase1Context)
    const delta = Math.abs(Number(patched.fee_display_delta || 0))
    const status = cleanOrderText(patched.fee_display_status)
    if (status === 'api') modeStats.api += 1
    else if (status === 'mixed') modeStats.mixed += 1
    else modeStats.estimate += 1
    if (delta < 1) continue
    updates.push(env.DB.prepare(`
      UPDATE orders_v2
      SET fee = ?,
          profit_real = ?,
          profit_invoice = ?
      WHERE order_id = ?
    `).bind(
      patched.fee_display_total || 0,
      patched.profit_real || 0,
      patched.profit_invoice || 0,
      row.order_id
    ))
    if (preview.length < 20) {
      preview.push({
        order_id: row.order_id,
        platform: row.platform,
        shop: row.shop,
        fee_cu: Number(row.fee || 0),
        fee_moi: Number(patched.fee_display_total || 0),
        chenhlech: Number(patched.fee_display_delta || 0),
        nhan: patched.fee_display_badge
      })
    }
  }

  for (let i = 0; i < updates.length; i += 50) {
    await env.DB.batch(updates.slice(i, i + 50))
  }

  return Response.json({
    status: 'ok',
    mode: 'order_fee_phase1_cleanup',
    platform: platform || 'all',
    shop: shop || 'all',
    scanned: results?.length || 0,
    updated: updates.length,
    mode_stats: modeStats,
    preview
  }, { headers: cors })
}

export async function getOrderFilterOptions(request, env, cors) {
  const url = new URL(request.url)
  const platform = normalizePlatform(url.searchParams.get("platform"))
  const shop = cleanOrderText(url.searchParams.get("shop"))
  await ensureOrderTransportColumns(env)
  const shopConds = ["o.shop IS NOT NULL", "TRIM(o.shop) != ''"]
  const shopParams = []
  const carrierConds = ["1=1"]
  const carrierParams = []

  if (platform) {
    shopConds.push(`LOWER(o.platform) = ?`)
    shopParams.push(platform)
    carrierConds.push(`LOWER(o.platform) = ?`)
    carrierParams.push(platform)
  }
  if (shop) {
    carrierConds.push(`LOWER(TRIM(o.shop)) = LOWER(TRIM(?))`)
    carrierParams.push(shop)
  }

  const shopWhere = shopConds.join(" AND ")
  const carrierWhere = carrierConds.join(" AND ")
  const carrierExpr = actualCarrierSql('o')
  const { results: shopRows } = await env.DB.prepare(`
    SELECT DISTINCT TRIM(o.shop) AS shop
    FROM orders_v2 o
    WHERE ${shopWhere}
    ORDER BY shop COLLATE NOCASE
    LIMIT 500
  `).bind(...shopParams).all()

  const { results: carrierRows } = await env.DB.prepare(`
    SELECT DISTINCT ${carrierExpr} AS carrier
    FROM orders_v2 o
    WHERE ${carrierWhere}
      AND ${carrierExpr} != ''
    ORDER BY carrier COLLATE NOCASE
    LIMIT 300
  `).bind(...carrierParams).all()

  const transportModes = await buildOrderTransportSummary(env, {
    platform,
    shop,
    limit: 200
  })

  return Response.json({
    shops: (shopRows || []).map(row => row.shop).filter(Boolean),
    carriers: (carrierRows || []).map(row => row.carrier).filter(Boolean),
    transport_modes: transportModes
  }, { headers: cors })
}

export async function getOrderChanges(request, env, cors) {
  const url = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "150", 10), 20), 500)
  const { results } = await env.DB.prepare(`
    SELECT
      order_id,
      platform,
      shop,
      order_date,
      order_type,
      oms_status,
      shipping_status,
      shipping_carrier,
      tracking_number,
      customer_name,
      revenue,
      fee,
      fee_platform,
      fee_payment,
      fee_affiliate,
      fee_ads,
      fee_piship,
      fee_service,
      fee_packaging,
      fee_labor,
      return_fee,
      profit_real,
      cost_real,
      oms_updated_at
    FROM orders_v2
    ORDER BY oms_updated_at DESC, order_date DESC, order_id DESC
    LIMIT ?
  `).bind(limit).all()

  return Response.json({
    data: results || [],
    total: results?.length || 0
  }, { headers: cors })
}

export async function updateOmsStatus(request, env, cors, orderId, ctx) {
  const body = await request.json()
  // 🌟 Đã mở cửa nhận thêm Mã Vận Đơn (Tracking)
  const { oms_status, shipping_status, tracking_number } = body
  const normalized = normalizeOmsStatusPair(oms_status, shipping_status)

  if (!normalized.oms && !normalized.shipping && !tracking_number) {
    return Response.json({ error: 'Thiếu dữ liệu trạng thái!' }, { status: 400, headers: cors })
  }

  await ensureExternalApiTables(env)
  const beforeOrder = await env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE order_id = ?
  `).bind(orderId).first()

  const sets = []
  const params = []
  if (normalized.oms) {
    sets.push('oms_status = ?')
    params.push(normalized.oms)
  }
  if (normalized.shipping) {
    sets.push('shipping_status = ?')
    params.push(normalized.shipping)
  }
  if (normalized.oms || normalized.shipping) {
    // Khi đổi trạng thái ở OMS, cập nhật luôn order_type để Dashboard hủy/hoàn không bị lệch số.
    sets.push('order_type = ?')
    params.push(orderTypeFromWorkflowStatus(normalized, 'normal'))
  }
  if (tracking_number) {
    sets.push('tracking_number = ?')
    params.push(tracking_number)
  }
  sets.push("oms_updated_at = datetime('now', '+7 hours')")
  params.push(orderId)

  await env.DB.prepare(`
    UPDATE orders_v2
    SET ${sets.join(', ')}
    WHERE order_id = ?
  `).bind(...params).run()

  try {
    await refreshInventoryMovementsForOrders(env, [orderId])
  } catch (e) {
    console.error("[UPDATE_OMS_INVENTORY]", e.message)
  }
  try {
    const afterOrder = await env.DB.prepare(`
      SELECT *
      FROM orders_v2
      WHERE order_id = ?
    `).bind(orderId).first()
    if (beforeOrder?.external_source_order_id && afterOrder) {
      const payload = externalOrderStatusWebhookPayload(beforeOrder, afterOrder)
      const task = sendFacebookCrmWebhook(env, 'order.status_changed', payload)
      if (ctx?.waitUntil) ctx.waitUntil(task)
      else await task
    }
  } catch (e) {
    console.error("[UPDATE_OMS_EXTERNAL_WEBHOOK]", e.message)
  }
  return Response.json({ status: "ok" }, { headers: cors })
}
