import { calcProfit, getCostSettings } from '../../utils/db.js'
import {
  cleanExternalText,
  EXTERNAL_ERROR_CODES,
  externalInt,
  externalJson,
  externalNumber,
  ExternalApiError
} from './response-core.js'
import {
  buildDeductStockStatement,
  checkExternalInventory,
  loadReservationForOrder,
  stockDeductionParts
} from './inventory-core.js'
import { getExternalProductBySku, getExternalProductPrice, resolveExternalSku } from './product-core.js'

function jsonText(value) {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

function orderCode() {
  const now = new Date()
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '')
  const tail = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `DHFB${ymd}${tail}`
}

function compactPhone(value) {
  return cleanExternalText(value).replace(/[^\d+]/g, '')
}

function normalizeExternalStatus(row = {}) {
  const oms = cleanExternalText(row.oms_status) || 'PENDING'
  if (oms === 'PENDING') return 'new'
  if (oms === 'SHIPPING' || oms === 'SHIPPED') return 'shipping'
  if (oms === 'COMPLETED') return 'completed'
  if (oms === 'CANCELLED') return 'cancelled'
  if (oms === 'RETURN') return 'returned'
  return oms.toLowerCase()
}

async function loadOrderItems(env, orderId) {
  const { results } = await env.DB.prepare(`
    SELECT id, order_id, sku, product_name, qty, revenue_line, cost_real,
           cost_invoice, image_url, variation_name, original_price, sale_price,
           current_price, price_source, reservation_id
    FROM order_items
    WHERE order_id = ?
    ORDER BY id
  `).bind(orderId).all()
  return (results || []).map(item => ({
    sku: cleanExternalText(item.sku),
    productName: cleanExternalText(item.product_name),
    quantity: externalInt(item.qty),
    revenueLine: externalNumber(item.revenue_line),
    originalPrice: externalNumber(item.original_price),
    salePrice: externalNumber(item.sale_price),
    currentPrice: externalNumber(item.current_price),
    reservationId: cleanExternalText(item.reservation_id)
  }))
}

export async function publicExternalOrder(env, row = {}) {
  const items = await loadOrderItems(env, row.order_id)
  const shipping = externalJson(row.external_shipping_json, {})
  const payment = externalJson(row.external_payment_json, {})
  return {
    orderId: cleanExternalText(row.order_id),
    orderCode: cleanExternalText(row.order_id),
    source: cleanExternalText(row.external_source || row.platform),
    sourceOrderId: cleanExternalText(row.external_source_order_id),
    sourceConversationId: cleanExternalText(row.external_source_conversation_id),
    status: normalizeExternalStatus(row),
    omsStatus: cleanExternalText(row.oms_status),
    shippingStatus: cleanExternalText(row.shipping_status),
    trackingCode: cleanExternalText(row.tracking_number),
    customer: {
      name: cleanExternalText(row.customer_name),
      phone: cleanExternalText(row.customer_phone),
      facebookId: cleanExternalText(row.buyer_id)
    },
    items,
    shipping,
    payment,
    totalAmount: externalNumber(row.raw_revenue || row.revenue),
    shippingFee: externalNumber(shipping.shippingFee),
    grandTotal: externalNumber(row.revenue),
    updatedAt: cleanExternalText(row.oms_updated_at || row.source_updated_at || row.created_at)
  }
}

export async function getExternalOrderById(env, orderId) {
  const id = cleanExternalText(orderId)
  const row = await env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE order_id = ?
    LIMIT 1
  `).bind(id).first()
  if (!row) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', 404, { orderId: id })
  }
  return publicExternalOrder(env, row)
}

export async function getExternalOrderBySourceOrderId(env, sourceOrderId, source = 'facebook_crm') {
  const id = cleanExternalText(sourceOrderId)
  const row = await env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE external_source = ?
      AND external_source_order_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(cleanExternalText(source || 'facebook_crm') || 'facebook_crm', id).first()
  if (!row) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng theo sourceOrderId', 404, { sourceOrderId: id })
  }
  return publicExternalOrder(env, row)
}

async function existingOrderForSource(env, source, sourceOrderId) {
  if (!sourceOrderId) return null
  return env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE external_source = ?
      AND external_source_order_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(source, sourceOrderId).first()
}

async function prepareExternalOrderItems(env, items = []) {
  if (!Array.isArray(items) || !items.length) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.VALIDATION_ERROR, 'Đơn hàng phải có ít nhất một sản phẩm', 400)
  }

  const prepared = []
  const priceWarnings = []
  for (const rawItem of items) {
    const sku = await resolveExternalSku(env, rawItem.sku)
    const quantity = Math.max(1, externalInt(rawItem.quantity, 1))
    const product = await getExternalProductBySku(env, sku)
    const price = await getExternalProductPrice(env, sku)
    const clientPrice = externalNumber(rawItem.currentPrice ?? rawItem.price)
    if (clientPrice && price.currentPrice && Math.abs(clientPrice - price.currentPrice) >= 1) {
      priceWarnings.push({
        sku,
        sentPrice: clientPrice,
        currentPrice: price.currentPrice,
        action: 'used_product_master_price'
      })
    }

    const reservationId = cleanExternalText(rawItem.reservationId)
    let reservation = null
    if (reservationId) {
      reservation = await loadReservationForOrder(env, reservationId)
      if (cleanExternalText(reservation.sku) !== sku) {
        throw new ExternalApiError(EXTERNAL_ERROR_CODES.VALIDATION_ERROR, 'Phiếu giữ hàng không khớp SKU', 400, { sku, reservationId })
      }
      if (externalInt(reservation.quantity) < quantity) {
        throw new ExternalApiError(EXTERNAL_ERROR_CODES.INSUFFICIENT_STOCK, 'Số lượng giữ hàng nhỏ hơn số lượng đặt', 409, { sku, reservationId })
      }
    } else {
      const inventory = await checkExternalInventory(env, { sku, quantity })
      if (!inventory.canSell) {
        throw new ExternalApiError(EXTERNAL_ERROR_CODES.INSUFFICIENT_STOCK, 'Không đủ tồn kho để tạo đơn', 409, inventory)
      }
    }

    const currentPrice = price.currentPrice || clientPrice || 0
    const lineRevenue = currentPrice * quantity
    prepared.push({
      sku,
      productName: product.name,
      quantity,
      imageUrl: product.imageUrl,
      costReal: product.costPrice * quantity,
      costInvoice: product.costPrice * quantity,
      originalPrice: price.originalPrice,
      salePrice: price.salePrice,
      currentPrice,
      revenueLine: lineRevenue,
      reservation,
      reservationId
    })
  }

  return { items: prepared, priceWarnings }
}

async function productStockRows(env, items) {
  const rows = new Map()
  const skus = [...new Set(items.map(item => item.sku))]
  for (const sku of skus) {
    const row = await env.DB.prepare(`
      SELECT sku, stock, stock_main, stock_sub
      FROM products
      WHERE sku = ?
    `).bind(sku).first()
    if (!row) {
      throw new ExternalApiError(EXTERNAL_ERROR_CODES.SKU_NOT_FOUND, 'Không tìm thấy SKU để trừ tồn', 404, { sku })
    }
    rows.set(sku, row)
  }
  return rows
}

function movementStatements(env, orderId, items, stockRows) {
  const statements = []
  const qtyBySku = new Map()
  for (const item of items) {
    qtyBySku.set(item.sku, (qtyBySku.get(item.sku) || 0) + item.quantity)
  }
  for (const [sku, quantity] of qtyBySku.entries()) {
    const row = stockRows.get(sku)
    statements.push(buildDeductStockStatement(env, row, quantity))
    for (const part of stockDeductionParts(row, quantity)) {
      const key = `facebook|facebook_crm|${orderId}|${sku}|${part.warehouse}`
      statements.push(env.DB.prepare(`
        INSERT INTO inventory_movements
          (key, order_id, platform, shop, sku, warehouse_source, qty_delta, reason, order_status, updated_at)
        VALUES (?, ?, 'facebook', 'facebook_crm', ?, ?, ?, 'external_facebook_order', 'PENDING', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          qty_delta = excluded.qty_delta,
          order_status = excluded.order_status,
          updated_at = datetime('now')
      `).bind(key, orderId, sku, part.warehouse, -part.quantity))
    }
  }
  for (const item of items) {
    if (item.reservation) {
      statements.push(env.DB.prepare(`
        UPDATE inventory_reservations
        SET status = 'committed',
            committed_order_id = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(orderId, item.reservation.id))
    }
  }
  return statements
}

export async function createExternalFacebookOrder(env, body = {}) {
  const source = cleanExternalText(body.source || 'facebook_crm') || 'facebook_crm'
  const sourceOrderId = cleanExternalText(body.sourceOrderId)
  if (!sourceOrderId) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.VALIDATION_ERROR, 'Thiếu sourceOrderId', 400)
  }

  const existing = await existingOrderForSource(env, source, sourceOrderId)
  if (existing) {
    return {
      ...(await publicExternalOrder(env, existing)),
      inventoryStatus: 'already_committed',
      idempotent: true
    }
  }

  const customer = body.customer && typeof body.customer === 'object' ? body.customer : {}
  const shipping = body.shipping && typeof body.shipping === 'object' ? body.shipping : {}
  const payment = body.payment && typeof body.payment === 'object' ? body.payment : {}
  const { items, priceWarnings } = await prepareExternalOrderItems(env, body.items)
  const stockRows = await productStockRows(env, items)
  const orderId = orderCode()
  const totalAmount = items.reduce((sum, item) => sum + item.revenueLine, 0)
  const shippingFee = externalNumber(shipping.shippingFee)
  const grandTotal = totalAmount + shippingFee
  const totalCostReal = items.reduce((sum, item) => sum + item.costReal, 0)
  const totalCostInvoice = items.reduce((sum, item) => sum + item.costInvoice, 0)
  const cfg = await getCostSettings(env)
  const profit = calcProfit({
    revenue: grandTotal,
    raw_revenue: totalAmount,
    cost_real: totalCostReal,
    cost_invoice: totalCostInvoice,
    fee: 0,
    is_first_sku: 1
  }, cfg)

  const orderDate = new Date().toISOString()
  const orderInsert = env.DB.prepare(`
    INSERT INTO orders_v2
      (order_id, platform, shop, order_date, order_type, revenue, raw_revenue,
       cost_invoice, cost_real, fee, profit_invoice, profit_real, tax_flat, tax_income,
       fee_platform, fee_payment, fee_affiliate, fee_ads, fee_piship, fee_service,
       fee_packaging, fee_operation, fee_labor, shipped, customer_name, customer_phone,
       buyer_id, buyer_username, oms_status, shipping_status, net_revenue,
       source_mode, source_detail, source_updated_at, external_source,
       external_source_order_id, external_source_conversation_id, external_source_page_id,
       external_customer_json, external_shipping_json, external_payment_json,
       external_order_payload, external_price_warnings)
    VALUES (?, 'facebook', 'facebook_crm', ?, 'normal', ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'PENDING', 'LOGISTICS_PENDING_ARRANGE', ?,
            'external_api', 'facebook_crm', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderId,
    orderDate,
    grandTotal,
    totalAmount,
    totalCostInvoice,
    totalCostReal,
    profit.total_fee || 0,
    profit.profit_invoice || 0,
    profit.profit_real || 0,
    profit.tax_flat || 0,
    profit.tax_income || 0,
    profit.fee_platform || 0,
    profit.fee_payment || 0,
    profit.fee_affiliate || 0,
    profit.fee_ads || 0,
    profit.fee_piship || 0,
    profit.fee_service || 0,
    profit.fee_packaging || 0,
    profit.fee_operation || 0,
    profit.fee_labor || 0,
    cleanExternalText(customer.name),
    compactPhone(customer.phone),
    cleanExternalText(customer.facebookId),
    cleanExternalText(customer.facebookId),
    totalAmount,
    orderDate,
    source,
    sourceOrderId,
    cleanExternalText(body.sourceConversationId),
    cleanExternalText(body.sourcePageId),
    jsonText(customer),
    jsonText(shipping),
    jsonText(payment),
    jsonText(body),
    jsonText(priceWarnings)
  )

  const itemStatements = items.map(item => env.DB.prepare(`
    INSERT INTO order_items
      (order_id, sku, product_name, qty, revenue_line, cost_real, cost_invoice,
       image_url, variation_name, original_price, sale_price, current_price,
       price_source, reservation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'product_master', ?)
  `).bind(
    orderId,
    item.sku,
    item.productName,
    item.quantity,
    item.revenueLine,
    item.costReal,
    item.costInvoice,
    item.imageUrl,
    item.productName,
    item.originalPrice,
    item.salePrice,
    item.currentPrice,
    item.reservationId
  ))

  // Batch này giữ nguyên tắc Order Master: tạo đơn, trừ tồn và commit giữ hàng cùng một giao dịch D1.
  await env.DB.batch([
    orderInsert,
    ...itemStatements,
    ...movementStatements(env, orderId, items, stockRows)
  ])

  return {
    orderId,
    orderCode: orderId,
    status: 'new',
    totalAmount,
    shippingFee,
    grandTotal,
    inventoryStatus: 'committed',
    warnings: priceWarnings
  }
}

export function externalOrderStatusWebhookPayload(before = {}, after = {}) {
  return {
    orderId: cleanExternalText(after.order_id),
    orderCode: cleanExternalText(after.order_id),
    sourceOrderId: cleanExternalText(after.external_source_order_id),
    oldStatus: normalizeExternalStatus(before),
    newStatus: normalizeExternalStatus(after),
    trackingCode: cleanExternalText(after.tracking_number),
    updatedAt: new Date().toISOString()
  }
}
