import { ensureOrderTransportColumns, resolveOrderSourceMeta } from '../../core/orders/transport-core.js'
import { recordImportedOrderSyncDiagnostics } from '../../modules/api-sync/sync-diagnostics.js'
import { calcProfit, getCostSettings } from '../../utils/db.js'
import { notifyOrderSubscribers } from '../marketplace-chat/index.js'
import { backfillEligibleLabels } from '../labels/index.js'
import { queueShopeeSellerCenterDetailAfterImport } from '../../core/orders/shopee-seller-center-detail-core.js'
import { queueTiktokSellerCenterFinanceAfterImport } from '../../core/orders/tiktok-seller-center-finance-core.js'
import { buildProductLookup, feeFieldsFromPayload, firstOrderText, getImportCarrier, getImportShippingStatus, getImportTracking, loadSkuResolutionMaps, normalizeCarrierByTracking, resolveItemProduct, skuLookupKeys } from './cost-resolution.js'
import { applyInventoryMovements, loadOrderPushRows, orderPushSignature } from './export-cost-stock.js'
import { cleanupDuplicateOrderItemsForOrders } from './order-items-dedupe.js'
import { cleanOrderText, compactOrderItemsByIdentity, dedupeIncomingItemsByOrder, ensureOrderBuyerIdentityColumns, normalizeImportedWorkflowStatus, orderTypeFromWorkflowStatus } from './status-workflow.js'

async function responseJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

function localJsonRequest(path, body = {}) {
  return new Request(`https://worker.local${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function importRequestId() {
  return `import-orders-v2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function importOrdersV2(request, env, cors) {
  const url = new URL(request.url)
  const requestId = request.headers.get('X-Request-Id') || importRequestId()
  await ensureOrderTransportColumns(env)
  await ensureOrderBuyerIdentityColumns(env)
  const payload = await request.json()
  const importMode = cleanOrderText(payload.mode || payload.scrape_mode || payload.scrapeMode || url.searchParams.get('mode')).toLowerCase()
  // Radar quét hành trình chỉ cập nhật trạng thái, nên bỏ các bước tốn CPU như push realtime và trừ kho.
  const statusOnly = payload.status_only === true
    || url.searchParams.get('status_only') === '1'
    || ['status_only', 'status', 'journey', 'auto_status'].includes(importMode)
  const suppressPush = payload.suppress_push === true || url.searchParams.get('suppress_push') === '1' || statusOnly
  const skipInventory = payload.skip_inventory === true || url.searchParams.get('skip_inventory') === '1' || statusOnly
  const { orders, items } = payload
  const orderRows = Array.isArray(orders) ? orders : []
  const itemRows = dedupeIncomingItemsByOrder(Array.isArray(items) ? items : [], orderRows)
  const sourceMeta = await resolveOrderSourceMeta(env, payload, orderRows)
  
  // --- [QUY TẮC 14] LOG SERVER ĐỂ BẮT BỆNH ---
  console.log(`[IMPORT_V2] 📥 Nhận payload: ${orderRows.length} đơn hàng, ${items?.length || 0} sản phẩm`);
  if ((items?.length || 0) !== itemRows.length) {
      console.log(`[IMPORT_V2] 🧹 Đã bỏ ${items.length - itemRows.length} dòng sản phẩm lặp do tổng item vượt tổng tiền đơn.`);
  }
  if (itemRows.length > 0) {
      console.log(`[IMPORT_V2] 📦 Dữ liệu SP mẫu đầu tiên:`, JSON.stringify(itemRows[0]));
  } else {
      console.log(`[IMPORT_V2] ⚠️ CẢNH BÁO: Không nhận được mảng items nào từ Bot gửi lên!`);
  }

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

  // 1. DỊCH SẢN PHẨM & MAP SKU TRƯỚC ĐỂ TÌM GIÁ VỐN
  const productLookup = buildProductLookup(productRows)
  const { varMap, aliasMap } = await loadSkuResolutionMaps(env)

  const rawProcessedItems = itemRows.map(i => {
    const keys = skuLookupKeys(i)
    const mapped = keys.map(key => varMap[key]).find(Boolean)
    const aliasSku = keys.map(key => aliasMap[key]).find(Boolean)
    const finalSku = mapped?.internal_sku || aliasSku || i.sku || ''
    const prod = resolveItemProduct(productLookup, i, varMap, aliasMap)
    const itemQty = i.qty || 1
    const finalImage = firstOrderText(i.image_url, mapped?.image_url, prod.image_url)

    return {
      ...i,
      sku: finalSku,
      image_url: finalImage,
      cost_real: Number(prod.cost_real || 0) * itemQty,
      cost_invoice: Number(prod.cost_invoice || 0) * itemQty
    }
  })
  // Luồng status_only chỉ được cập nhật trạng thái/tracking; không ghi đè tài chính hoặc dòng hàng đã được Finance Core xác nhận.
  const processedItems = statusOnly ? [] : compactOrderItemsByIdentity(rawProcessedItems)

  // 2. TÍNH LỢI NHUẬN DỰA TRÊN SẢN PHẨM ĐÃ CÓ GIÁ VỐN
  const processedOrders = orderRows.map(o => {
    const orderItems = processedItems.filter(i => i.order_id === o.order_id)
    const totalCostReal = orderItems.reduce((s, i) => s + i.cost_real, 0)
    const totalCostInvoice = orderItems.reduce((s, i) => s + i.cost_invoice, 0)

    let return_fee = o.return_fee || 0
    if (o.order_type === "return") {
      return_fee = o.platform === "tiktok" ? (cfg["tiktok_return_fee"]?.value ?? 4620) : (cfg["shopee_return_fee"]?.value ?? 1620)
    } else if (o.order_type === "cancel" && /giao.*thất bại|không giao được|failed delivery/i.test(o.cancel_reason || "")) {
      return_fee = o.platform === "tiktok" ? (cfg["tiktok_failed_delivery_fee"]?.value ?? 1620) : (cfg["shopee_failed_delivery_fee"]?.value ?? 1620)
    }

    const realFee = feeFieldsFromPayload(o)
    const p = calcProfit({ ...o, cost_invoice: totalCostInvoice, cost_real: totalCostReal, is_first_sku: 1, return_fee, ...realFee }, cfg)
    const workflowStatus = normalizeImportedWorkflowStatus(o, getImportShippingStatus(o))
    const workflowOrderType = orderTypeFromWorkflowStatus(workflowStatus, o.order_type)
    return { ...o, order_type: workflowOrderType, cost_invoice: p.cost_invoice, cost_real: p.cost_real, fee: p.total_fee, profit_invoice: p.profit_invoice, profit_real: p.profit_real, tax_flat: p.tax_flat, tax_income: p.tax_income, fee_platform: p.fee_platform || 0, fee_payment: p.fee_payment || 0, fee_affiliate: p.fee_affiliate || 0, fee_ads: p.fee_ads || 0, fee_piship: p.fee_piship || 0, fee_service: p.fee_service || 0, fee_packaging: p.fee_packaging || 0, fee_operation: p.fee_operation || 0, fee_labor: p.fee_labor || 0, return_fee, oms_status: workflowStatus.oms, shipping_status: workflowStatus.shipping }
  })

  const importOrderIds = [...new Set(processedOrders.map(o => cleanOrderText(o.order_id)).filter(Boolean))]
  const pushBeforeRows = suppressPush ? [] : await loadOrderPushRows(env, importOrderIds).catch(error => {
    console.error("[IMPORT_V2] ORDER_PUSH_BEFORE:", error.message)
    return []
  })
  const pushBefore = new Map(pushBeforeRows.map(row => [cleanOrderText(row.order_id), orderPushSignature(row)]))

  const BATCH = 50
  let importedOrders = 0, importedItems = 0, skipped = 0

  async function updateOrderPaymentEvidence(chunk = []) {
    const stmts = chunk
      .filter(o => cleanOrderText(o.payment_time || o.paymentTime || o.pay_time || o.paid_at))
      .map(o => {
        const paymentTime = cleanOrderText(o.payment_time || o.paymentTime || o.pay_time || o.paid_at)
        const paymentTimeSource = cleanOrderText(o.payment_time_source || o.paymentTimeSource || (paymentTime ? 'Order Core import payload' : ''))
        return env.DB.prepare(`
          UPDATE orders_v2
          SET payment_time = CASE WHEN ? != '' THEN ? ELSE payment_time END,
              payment_time_source = CASE WHEN ? != '' THEN ? ELSE payment_time_source END
          WHERE order_id = ?
        `).bind(paymentTime, paymentTime, paymentTimeSource, paymentTimeSource, o.order_id ?? '')
      })
    if (stmts.length) await env.DB.batch(stmts)
  }

  for (let i = 0; i < processedOrders.length; i += BATCH) {
    const chunk = processedOrders.slice(i, i + BATCH)
    const stmts = chunk.map(o => {
      const rawShippingStatus = getImportShippingStatus(o)
      const trackingNumber = getImportTracking(o)
      const shippingCarrier = normalizeCarrierByTracking(getImportCarrier(o), trackingNumber)
      const workflowStatus = normalizeImportedWorkflowStatus(o, rawShippingStatus)
      const shippingStatus = workflowStatus.shipping
      const omsStatus = workflowStatus.oms
      const orderType = orderTypeFromWorkflowStatus(workflowStatus, o.order_type)
      const sourceMode = cleanOrderText(o.source_mode || o.sourceMode || sourceMeta.source_mode || '')
      const sourceDetail = cleanOrderText(o.source_detail || o.sourceDetail || sourceMeta.source_detail || '')
      const sourceUpdatedAt = cleanOrderText(o.source_updated_at || o.sourceUpdatedAt || sourceMeta.source_updated_at || '')
      const moneyValue = value => statusOnly ? null : (value ?? 0)
      const financeUpdate = column => statusOnly ? `orders_v2.${column}` : `excluded.${column}`

      return env.DB.prepare(`
        INSERT INTO orders_v2
          (order_id, platform, shop, order_date, order_type, revenue, raw_revenue, cost_invoice, cost_real, fee, profit_invoice, profit_real, tax_flat, tax_income, fee_platform, fee_payment, fee_affiliate, fee_ads, fee_piship, fee_service, fee_packaging, fee_operation, fee_labor, cancel_reason, return_fee, shipped, discount_shop, discount_shopee, discount_combo, shipping_return_fee, shipping_status, shipping_carrier, tracking_number, customer_name, buyer_id, buyer_username, payment_method, payment_method_source, customer_note, customer_note_source, oms_status, source_mode, source_detail, source_updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(order_id) DO UPDATE SET
          order_date = CASE WHEN excluded.order_date != '' AND excluded.order_date IS NOT NULL THEN excluded.order_date ELSE orders_v2.order_date END,
          platform = excluded.platform,
          shop = excluded.shop,
          order_type = CASE
            WHEN excluded.order_type IN ('cancel', 'return') THEN excluded.order_type
            WHEN excluded.oms_status = 'PENDING' AND orders_v2.order_type IN ('cancel', 'return') THEN orders_v2.order_type
            ELSE excluded.order_type
          END,
          revenue = ${financeUpdate('revenue')},
          raw_revenue = ${financeUpdate('raw_revenue')},
          cost_invoice = ${financeUpdate('cost_invoice')},
          cost_real = ${financeUpdate('cost_real')},
          fee = ${financeUpdate('fee')},
          profit_invoice = ${financeUpdate('profit_invoice')},
          profit_real = ${financeUpdate('profit_real')},
          tax_flat = ${financeUpdate('tax_flat')},
          tax_income = ${financeUpdate('tax_income')},
          fee_platform = ${financeUpdate('fee_platform')},
          fee_payment = ${financeUpdate('fee_payment')},
          fee_affiliate = ${financeUpdate('fee_affiliate')},
          fee_ads = ${financeUpdate('fee_ads')},
          fee_piship = ${financeUpdate('fee_piship')},
          fee_service = ${financeUpdate('fee_service')},
          fee_packaging = ${financeUpdate('fee_packaging')},
          fee_operation = ${financeUpdate('fee_operation')},
          fee_labor = ${financeUpdate('fee_labor')},
          cancel_reason = excluded.cancel_reason,
          return_fee = ${financeUpdate('return_fee')},
          shipped = excluded.shipped,
          discount_shop = ${financeUpdate('discount_shop')},
          discount_shopee = ${financeUpdate('discount_shopee')},
          discount_combo = ${financeUpdate('discount_combo')},
          shipping_return_fee = ${financeUpdate('shipping_return_fee')},
          tracking_number = CASE WHEN excluded.tracking_number != '' THEN excluded.tracking_number ELSE orders_v2.tracking_number END,
          customer_name = excluded.customer_name,
          buyer_id = CASE WHEN excluded.buyer_id != '' THEN excluded.buyer_id ELSE orders_v2.buyer_id END,
          buyer_username = CASE WHEN excluded.buyer_username != '' THEN excluded.buyer_username ELSE orders_v2.buyer_username END,
          payment_method = CASE WHEN excluded.payment_method != '' THEN excluded.payment_method ELSE orders_v2.payment_method END,
          payment_method_source = CASE WHEN excluded.payment_method_source != '' THEN excluded.payment_method_source ELSE orders_v2.payment_method_source END,
          customer_note = CASE WHEN excluded.customer_note != '' THEN excluded.customer_note ELSE orders_v2.customer_note END,
          customer_note_source = CASE WHEN excluded.customer_note_source != '' THEN excluded.customer_note_source ELSE orders_v2.customer_note_source END,
          shipping_status = CASE
            WHEN orders_v2.oms_status = 'PENDING'
             AND orders_v2.shipping_status = 'LOGISTICS_PACKAGED'
             AND excluded.shipping_status IN ('', 'LOGISTICS_PENDING_ARRANGE', 'READY_TO_SHIP', 'LOGISTICS_REQUEST_CREATED', 'PROCESSED') THEN orders_v2.shipping_status
            WHEN orders_v2.oms_status = 'PENDING'
             AND orders_v2.shipping_status = 'LOGISTICS_REQUEST_CREATED'
             AND excluded.shipping_status IN ('', 'LOGISTICS_PENDING_ARRANGE', 'READY_TO_SHIP') THEN orders_v2.shipping_status
            WHEN excluded.shipping_status IN ('', 'LOGISTICS_PENDING_ARRANGE')
             AND orders_v2.oms_status = 'COMPLETED' THEN 'COMPLETED'
            WHEN excluded.shipping_status IN ('', 'LOGISTICS_PENDING_ARRANGE')
             AND orders_v2.oms_status = 'CANCELLED' THEN 'CANCELLED'
            WHEN excluded.shipping_status IN ('', 'LOGISTICS_PENDING_ARRANGE')
             AND orders_v2.oms_status = 'RETURN' THEN CASE
                WHEN orders_v2.shipping_status IN ('RETURN', 'RETURN_REFUND', 'FAILED_DELIVERY', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST') THEN orders_v2.shipping_status
                ELSE 'RETURN'
              END
            WHEN excluded.shipping_status IN ('', 'LOGISTICS_PENDING_ARRANGE')
             AND orders_v2.oms_status IN ('SHIPPING', 'SHIPPED') THEN CASE
                WHEN orders_v2.shipping_status IN ('SHIPPED', 'TO_CONFIRM_RECEIVE') THEN orders_v2.shipping_status
                ELSE 'SHIPPED'
              END
            WHEN excluded.shipping_status IN ('', 'LOGISTICS_PENDING_ARRANGE')
             AND orders_v2.oms_status NOT IN ('', 'PENDING') THEN orders_v2.shipping_status
            WHEN excluded.shipping_status != '' THEN excluded.shipping_status
            ELSE orders_v2.shipping_status
          END,
          shipping_carrier = CASE WHEN excluded.shipping_carrier != '' THEN excluded.shipping_carrier ELSE orders_v2.shipping_carrier END,
          source_mode = CASE WHEN excluded.source_mode != '' THEN excluded.source_mode ELSE orders_v2.source_mode END,
          source_detail = CASE WHEN excluded.source_detail != '' THEN excluded.source_detail ELSE orders_v2.source_detail END,
          source_updated_at = CASE WHEN excluded.source_updated_at != '' THEN excluded.source_updated_at ELSE orders_v2.source_updated_at END,
          oms_status = CASE
            WHEN excluded.oms_status = 'PENDING'
             AND orders_v2.oms_status NOT IN ('', 'PENDING') THEN orders_v2.oms_status
            ELSE excluded.oms_status
          END,
          oms_updated_at = CASE
            WHEN (
              excluded.shipping_status NOT IN ('', 'LOGISTICS_PENDING_ARRANGE')
              AND COALESCE(orders_v2.shipping_status, '') != excluded.shipping_status
            ) OR (
              excluded.oms_status != ''
              AND NOT (excluded.oms_status = 'PENDING' AND orders_v2.oms_status NOT IN ('', 'PENDING'))
              AND COALESCE(orders_v2.oms_status, '') != excluded.oms_status
            ) OR (
              excluded.tracking_number != ''
              AND COALESCE(orders_v2.tracking_number, '') != excluded.tracking_number
            ) OR (
              excluded.shipping_carrier != ''
              AND COALESCE(orders_v2.shipping_carrier, '') != excluded.shipping_carrier
            ) THEN datetime('now', '+7 hours')
            ELSE orders_v2.oms_updated_at
          END
      `).bind(
        o.order_id ?? null, o.platform ?? '', o.shop ?? '', o.order_date ?? null, orderType, moneyValue(o.revenue), moneyValue(o.raw_revenue), moneyValue(o.cost_invoice), moneyValue(o.cost_real), moneyValue(o.fee), moneyValue(o.profit_invoice), moneyValue(o.profit_real), moneyValue(o.tax_flat), moneyValue(o.tax_income), moneyValue(o.fee_platform), moneyValue(o.fee_payment), moneyValue(o.fee_affiliate), moneyValue(o.fee_ads), moneyValue(o.fee_piship), moneyValue(o.fee_service), moneyValue(o.fee_packaging), moneyValue(o.fee_operation), moneyValue(o.fee_labor), o.cancel_reason ?? null, moneyValue(o.return_fee), o.shipped ?? 0, moneyValue(o.discount_shop), moneyValue(o.discount_shopee), moneyValue(o.discount_combo), moneyValue(o.shipping_return_fee), shippingStatus, shippingCarrier, trackingNumber, o.customer_name ?? '', o.buyer_id ?? '', o.buyer_username ?? '', o.payment_method ?? '', o.payment_method_source ?? '', o.customer_note ?? '', o.customer_note_source ?? '', omsStatus, sourceMode, sourceDetail, sourceUpdatedAt
      )
    })
    try { 
      await env.DB.batch(stmts); 
      await updateOrderPaymentEvidence(chunk);
      importedOrders += chunk.length;
    } catch(e) { 
      console.error("[IMPORT_V2] ❌ LỖI BATCH ORDERS_V2:", e.message);
      return Response.json({ error: "LỖI DB D1 (Orders): " + e.message }, { status: 500, headers: cors });
    }
  }

  const orderIds = [...new Set(processedItems.map(i => i.order_id))]
  if (!statusOnly) {
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
          importedItems += chunk.length;
      } catch(e) {
          console.error("[IMPORT_V2] ❌ LỖI INSERT SẢN PHẨM:", e.message);
          return Response.json({ error: "LỖI DB D1 (Items): " + e.message }, { status: 500, headers: cors });
      }
    }
  }

  let orderItemDedupe = {
    checked_orders: orderIds.length,
    duplicate_groups_before: 0,
    duplicate_extra_rows_before: 0,
    deleted_rows: 0,
    duplicate_groups_after: 0,
    duplicate_extra_rows_after: 0
  }
  try {
    if (!statusOnly) {
      orderItemDedupe = await cleanupDuplicateOrderItemsForOrders(env, orderIds)
      importedItems = Math.max(0, importedItems - Number(orderItemDedupe.deleted_rows || 0))
      if (orderItemDedupe.deleted_rows) {
        console.log(`[IMPORT_V2] 🧹 Dọn ${orderItemDedupe.deleted_rows} dòng order_items trùng tuyệt đối sau import.`)
      }
    } else {
      orderItemDedupe.status_only_skipped = true
    }
  } catch (e) {
    console.error("[IMPORT_V2] ❌ LỖI DEDUPE ORDER_ITEMS:", e.message)
    return Response.json({ error: "LỖI DB D1 (Order Items Dedupe): " + e.message }, { status: 500, headers: cors })
  }

  let inventory = skipInventory ? { adjusted: 0, restored: 0, skipped: true } : { adjusted: 0, restored: 0 }
  if (!skipInventory) {
    try {
      inventory = await applyInventoryMovements(env, processedOrders, processedItems)
    } catch (e) {
      console.error("[IMPORT_V2] INVENTORY_MOVEMENTS:", e.message)
    }
  }

  let orderPush = suppressPush
    ? { sent: 0, total: 0, notified: 0, suppressed: true }
    : { sent: 0, total: 0, notified: 0 }
  try {
    if (!suppressPush) {
      const pushAfterRows = await loadOrderPushRows(env, importOrderIds)
      const changedRows = []
      for (const row of pushAfterRows) {
        const id = cleanOrderText(row.order_id)
        const before = pushBefore.get(id)
        const after = orderPushSignature(row)
        if (!before) changedRows.push({ ...row, _push_reason: 'new' })
        else if (before !== after) changedRows.push({ ...row, _push_reason: 'changed' })
      }
      if (changedRows.length) {
        orderPush = await notifyOrderSubscribers(env, changedRows, {
          reason: changedRows.some(row => row._push_reason === 'new') ? 'new' : 'changed'
        })
      }
    }
  } catch (e) {
    console.error("[IMPORT_V2] ORDER_PUSH:", e.message)
    orderPush = { sent: 0, total: 0, notified: 0, error: e.message }
  }

  let syncDiagnostics = { updated_shops: 0, shops: [] }
  try {
    syncDiagnostics = await recordImportedOrderSyncDiagnostics(env, processedOrders, {
      ...sourceMeta,
      imported_orders: importedOrders,
      imported_items: importedItems,
      warnings: [],
      source_updated_at: sourceMeta.source_updated_at
    })
  } catch (e) {
    console.error("[IMPORT_V2] ORDER_SYNC_DIAGNOSTIC:", e.message)
    syncDiagnostics = { updated_shops: 0, shops: [], error: e.message }
  }

  let tiktokSellerDetailQueue = { eligible_count: 0, queued_jobs: 0, queued_orders: 0, orders: [] }
  try {
    tiktokSellerDetailQueue = await queueTiktokSellerCenterFinanceAfterImport(env, processedOrders, {
      trigger: statusOnly ? 'after_status_sync' : 'after_order_import',
      limit: 20
    })
  } catch (e) {
    console.error("[IMPORT_V2] TIKTOK_SELLER_DETAIL_QUEUE:", e.message)
    tiktokSellerDetailQueue = { eligible_count: 0, queued_jobs: 0, queued_orders: 0, orders: [], error: e.message }
  }

  let shopeeSellerDetailQueue = { eligible_count: 0, queued_jobs: 0, queued_orders: 0, orders: [] }
  try {
    shopeeSellerDetailQueue = await queueShopeeSellerCenterDetailAfterImport(env, processedOrders, {
      trigger: statusOnly ? 'after_status_sync' : 'after_order_import',
      limit: 20
    })
  } catch (e) {
    console.error("[IMPORT_V2] SHOPEE_SELLER_DETAIL_QUEUE:", e.message)
    shopeeSellerDetailQueue = { eligible_count: 0, queued_jobs: 0, queued_orders: 0, orders: [], error: e.message }
  }

  let labelBackfill = { scanned: 0, eligible: 0, downloaded: 0, manual_required: 0, skipped: 0 }
  try {
    const labelResponse = await backfillEligibleLabels(localJsonRequest('/api/label/backfill-eligible', {
      order_ids: importOrderIds,
      limit: Math.min(importOrderIds.length || 20, 50),
      trigger: statusOnly ? 'after_status_sync' : 'after_order_import',
      dry_run: false
    }), env, cors)
    labelBackfill = await responseJsonSafe(labelResponse)
  } catch (e) {
    console.error("[IMPORT_V2] LABEL_BACKFILL:", e.message)
    labelBackfill = { scanned: importOrderIds.length, eligible: 0, downloaded: 0, manual_required: 0, skipped: 0, error: e.message }
  }

  return Response.json({
    status: "ok",
    request_id: requestId,
    imported_orders: importedOrders,
    imported_items: importedItems,
    skipped,
    mode: importMode || 'full',
    status_only: statusOnly,
    status_only_finance_safe: statusOnly,
    inventory_adjusted: inventory.adjusted,
    inventory_restored: inventory.restored,
    inventory_skipped: Boolean(inventory.skipped),
    order_item_dedupe: orderItemDedupe,
    sync_diagnostics: syncDiagnostics,
    tiktok_seller_detail_queue: tiktokSellerDetailQueue,
    shopee_seller_detail_queue: shopeeSellerDetailQueue,
    label_backfill: labelBackfill,
    order_push: orderPush
  }, { headers: { ...cors, 'X-Request-Id': requestId } })
}
