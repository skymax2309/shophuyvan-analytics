import {
  cleanExternalText,
  EXTERNAL_ERROR_CODES,
  externalInt,
  externalNumber,
  ExternalApiError
} from './response-core.js'
import { idempotencyKeyFromRequest } from './security-core.js'
import { expireOldReservations } from './schema-core.js'
import { getExternalProductBySku, resolveExternalSku } from './product-core.js'

function reservationCode() {
  const stamp = Date.now().toString(36).toUpperCase()
  const tail = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `RSV-${stamp}-${tail}`
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function publicReservation(row = {}) {
  return {
    reservationId: String(row.id),
    reservationCode: cleanExternalText(row.reservation_code),
    sku: cleanExternalText(row.sku),
    quantity: externalInt(row.quantity),
    status: cleanExternalText(row.status),
    expiresAt: cleanExternalText(row.expires_at)
  }
}

export async function checkExternalInventory(env, body = {}) {
  await expireOldReservations(env)
  const sku = await resolveExternalSku(env, body.sku)
  const quantity = Math.max(1, externalInt(body.quantity, 1))
  const product = await getExternalProductBySku(env, sku)
  const canSell = product.availableStock >= quantity
  return {
    sku,
    requestedQuantity: quantity,
    stock: product.stock,
    reservedStock: product.reservedStock,
    availableStock: product.availableStock,
    canSell,
    message: canSell ? 'Còn đủ hàng' : 'Không đủ tồn kho'
  }
}

async function findExistingReservation(env, body = {}, sku, idempotencyKey = '') {
  if (idempotencyKey) {
    const row = await env.DB.prepare(`
      SELECT *
      FROM inventory_reservations
      WHERE idempotency_key = ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(idempotencyKey).first()
    if (row) return row
  }

  const sourceConversationId = cleanExternalText(body.sourceConversationId)
  if (!sourceConversationId) return null
  return env.DB.prepare(`
    SELECT *
    FROM inventory_reservations
    WHERE sku = ?
      AND source = ?
      AND source_conversation_id = ?
      AND status = 'active'
      AND expires_at > ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(
    sku,
    cleanExternalText(body.source || 'facebook_crm') || 'facebook_crm',
    sourceConversationId,
    new Date().toISOString()
  ).first()
}

export async function reserveExternalInventory(env, request, body = {}) {
  await expireOldReservations(env)
  const sku = await resolveExternalSku(env, body.sku)
  const quantity = Math.max(1, externalInt(body.quantity, 1))
  const idempotencyKey = idempotencyKeyFromRequest(request)
  const existing = await findExistingReservation(env, body, sku, idempotencyKey)
  if (existing) return { ...publicReservation(existing), idempotent: true }

  const inventory = await checkExternalInventory(env, { sku, quantity })
  if (!inventory.canSell) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.INSUFFICIENT_STOCK,
      'Không đủ tồn kho để giữ hàng',
      409,
      inventory
    )
  }

  const expiresInMinutes = Math.min(Math.max(externalInt(body.expiresInMinutes, 30), 1), 1440)
  const now = new Date()
  const expiresAt = addMinutes(now, expiresInMinutes).toISOString()
  const code = reservationCode()
  await env.DB.prepare(`
    INSERT INTO inventory_reservations
      (reservation_code, sku, product_id, quantity, source, source_conversation_id,
       source_customer_id, status, expires_at, note, idempotency_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    code,
    sku,
    sku,
    quantity,
    cleanExternalText(body.source || 'facebook_crm') || 'facebook_crm',
    cleanExternalText(body.sourceConversationId),
    cleanExternalText(body.sourceCustomerId),
    expiresAt,
    cleanExternalText(body.note),
    idempotencyKey
  ).run()

  const row = await env.DB.prepare(`
    SELECT *
    FROM inventory_reservations
    WHERE reservation_code = ?
  `).bind(code).first()
  return publicReservation(row)
}

async function loadReservation(env, reservationId) {
  const id = cleanExternalText(reservationId)
  const row = await env.DB.prepare(`
    SELECT *
    FROM inventory_reservations
    WHERE id = ? OR reservation_code = ?
    LIMIT 1
  `).bind(id, id).first()
  if (!row) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.RESERVATION_NOT_FOUND,
      'Không tìm thấy phiếu giữ hàng',
      404,
      { reservationId: id }
    )
  }
  return row
}

export async function cancelExternalReservation(env, reservationId, body = {}) {
  await expireOldReservations(env)
  const row = await loadReservation(env, reservationId)
  const status = cleanExternalText(row.status)
  if (status === 'committed') {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.RESERVATION_ALREADY_COMMITTED,
      'Phiếu giữ hàng đã được commit, không thể hủy',
      409
    )
  }
  if (status === 'expired') {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.RESERVATION_EXPIRED,
      'Phiếu giữ hàng đã hết hạn',
      409
    )
  }
  if (status !== 'cancelled') {
    await env.DB.prepare(`
      UPDATE inventory_reservations
      SET status = 'cancelled',
          cancel_reason = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(cleanExternalText(body.reason), row.id).run()
  }
  const updated = await loadReservation(env, row.id)
  return publicReservation(updated)
}

async function stockRowForUpdate(env, sku) {
  const row = await env.DB.prepare(`
    SELECT sku, stock, stock_main, stock_sub
    FROM products
    WHERE sku = ?
  `).bind(sku).first()
  if (!row) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.SKU_NOT_FOUND, 'Không tìm thấy SKU để trừ tồn', 404, { sku })
  }
  return row
}

export function buildDeductStockStatement(env, row, quantity) {
  const sku = cleanExternalText(row.sku)
  const qty = Math.max(1, externalInt(quantity, 1))
  const main = externalNumber(row.stock_main)
  const sub = externalNumber(row.stock_sub)
  const stock = main || sub ? main + sub : externalNumber(row.stock)
  if (stock < qty) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.INSUFFICIENT_STOCK,
      'Không đủ tồn kho để trừ hàng',
      409,
      { sku, stock, requestedQuantity: qty }
    )
  }

  if (main || sub) {
    const nextMain = Math.max(0, main - qty)
    const remaining = Math.max(0, qty - main)
    const nextSub = Math.max(0, sub - remaining)
    return env.DB.prepare(`
      UPDATE products
      SET stock_main = ?,
          stock_sub = ?,
          stock = ?
      WHERE sku = ?
    `).bind(nextMain, nextSub, nextMain + nextSub, sku)
  }

  return env.DB.prepare(`
    UPDATE products
    SET stock = IFNULL(stock, 0) - ?
    WHERE sku = ? AND IFNULL(stock, 0) >= ?
  `).bind(qty, sku, qty)
}

export function stockDeductionParts(row, quantity) {
  const qty = Math.max(1, externalInt(quantity, 1))
  const main = externalNumber(row.stock_main)
  const sub = externalNumber(row.stock_sub)
  if (main || sub) {
    const mainQty = Math.min(main, qty)
    const subQty = Math.max(0, qty - mainQty)
    return [
      ...(mainQty ? [{ warehouse: 'main', quantity: mainQty }] : []),
      ...(subQty ? [{ warehouse: 'sub', quantity: subQty }] : [])
    ]
  }
  return [{ warehouse: 'main', quantity: qty }]
}

export async function deductExternalStock(env, sku, quantity) {
  const row = await stockRowForUpdate(env, sku)
  await buildDeductStockStatement(env, row, quantity).run()
}

export async function commitExternalReservation(env, reservationId, body = {}) {
  await expireOldReservations(env)
  const row = await loadReservation(env, reservationId)
  const orderId = cleanExternalText(body.orderId)
  const status = cleanExternalText(row.status)

  if (status === 'committed') {
    if (!orderId || cleanExternalText(row.committed_order_id) === orderId) {
      return { ...publicReservation(row), orderId: cleanExternalText(row.committed_order_id), idempotent: true }
    }
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.RESERVATION_ALREADY_COMMITTED,
      'Phiếu giữ hàng đã được commit cho đơn khác',
      409
    )
  }
  if (status === 'cancelled') {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.RESERVATION_CANCELLED, 'Phiếu giữ hàng đã bị hủy', 409)
  }
  if (status === 'expired') {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.RESERVATION_EXPIRED, 'Phiếu giữ hàng đã hết hạn', 409)
  }

  const productRow = await stockRowForUpdate(env, row.sku)
  await env.DB.batch([
    buildDeductStockStatement(env, productRow, row.quantity),
    env.DB.prepare(`
      UPDATE inventory_reservations
      SET status = 'committed',
          committed_order_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(orderId, row.id)
  ])

  const updated = await loadReservation(env, row.id)
  return { ...publicReservation(updated), orderId }
}

export async function loadReservationForOrder(env, reservationId) {
  const row = await loadReservation(env, reservationId)
  const status = cleanExternalText(row.status)
  if (status === 'cancelled') {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.RESERVATION_CANCELLED, 'Phiếu giữ hàng đã bị hủy', 409)
  }
  if (status === 'expired' || (status === 'active' && cleanExternalText(row.expires_at) <= new Date().toISOString())) {
    await expireOldReservations(env)
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.RESERVATION_EXPIRED, 'Phiếu giữ hàng đã hết hạn', 409)
  }
  if (status === 'committed') {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.RESERVATION_ALREADY_COMMITTED, 'Phiếu giữ hàng đã được commit', 409)
  }
  return row
}
