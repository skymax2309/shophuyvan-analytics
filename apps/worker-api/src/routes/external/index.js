import {
  errorResponse,
  EXTERNAL_ERROR_CODES,
  ExternalApiError,
  makeRequestId,
  parseExternalJsonBody,
  successResponse,
  paginatedResponse
} from '../../core/external/response-core.js'
import { assertExternalApiAuth } from '../../core/external/security-core.js'
import { ensureExternalApiTables, logExternalApiAction } from '../../core/external/schema-core.js'
import {
  getExternalProductBySku,
  getExternalProductDetail,
  getExternalProductPrice,
  listExternalProducts
} from '../../core/external/product-core.js'
import {
  cancelExternalReservation,
  checkExternalInventory,
  commitExternalReservation,
  reserveExternalInventory
} from '../../core/external/inventory-core.js'
import {
  createExternalFacebookOrder,
  getExternalOrderById,
  getExternalOrderBySourceOrderId
} from '../../core/external/order-core.js'
import {
  FACEBOOK_CRM_WEBHOOK_EVENTS,
  listWebhookDeliveryLogs,
  sendWebhookOrThrow
} from '../../core/external/webhook-core.js'

function pathMatch(pathname, pattern) {
  const match = pathname.match(pattern)
  return match ? match.slice(1).map(decodeURIComponent) : null
}

async function logSuccess(env, request, requestId, action, metadata = {}) {
  const url = new URL(request.url)
  await logExternalApiAction(env, {
    action,
    method: request.method,
    path: url.pathname,
    requestId,
    source: 'facebook_crm',
    status: 'success',
    message: 'OK',
    metadata
  })
}

async function logFailure(env, request, requestId, action, error, metadata = {}) {
  const url = new URL(request.url)
  await logExternalApiAction(env, {
    action,
    method: request.method,
    path: url.pathname,
    requestId,
    source: 'facebook_crm',
    status: 'failed',
    errorCode: error?.code || EXTERNAL_ERROR_CODES.INTERNAL_ERROR,
    message: error?.message || 'Lỗi hệ thống',
    metadata
  })
}

function asyncWebhook(ctx, task) {
  if (ctx?.waitUntil) ctx.waitUntil(task.catch(error => console.error('[FACEBOOK_CRM_WEBHOOK]', error.message)))
  else task.catch(error => console.error('[FACEBOOK_CRM_WEBHOOK]', error.message))
}

async function sendInventoryWebhook(ctx, env, sku) {
  asyncWebhook(ctx, (async () => {
    const inventory = await checkExternalInventory(env, { sku, quantity: 1 })
    await sendWebhookOrThrow(env, 'inventory.updated', {
      sku: inventory.sku,
      productId: inventory.sku,
      stock: inventory.stock,
      availableStock: inventory.availableStock,
      reservedStock: inventory.reservedStock,
      updatedAt: new Date().toISOString()
    })
    if (inventory.availableStock <= 5) {
      await sendWebhookOrThrow(env, 'inventory.low_stock', {
        sku: inventory.sku,
        productId: inventory.sku,
        availableStock: inventory.availableStock,
        updatedAt: new Date().toISOString()
      })
    }
  })())
}

async function sendOrderCreatedWebhook(ctx, env, order) {
  asyncWebhook(ctx, sendWebhookOrThrow(env, 'order.created', {
    orderId: order.orderId,
    orderCode: order.orderCode,
    sourceOrderId: order.sourceOrderId || '',
    status: order.status,
    totalAmount: order.totalAmount,
    grandTotal: order.grandTotal,
    updatedAt: new Date().toISOString()
  }))
}

export async function handleExternalApi(request, env, cors, ctx) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/external/')) return null

  const requestId = makeRequestId(request)
  await ensureExternalApiTables(env)

  let action = 'external.auth'
  try {
    assertExternalApiAuth(request, env)

    if (request.method === 'GET' && url.pathname === '/api/external/products') {
      action = 'products.list'
      const result = await listExternalProducts(env, url)
      await logSuccess(env, request, requestId, action, { total: result.pagination.total })
      return paginatedResponse(result.data, result.pagination, { cors, requestId })
    }

    let match = pathMatch(url.pathname, /^\/api\/external\/products\/sku\/([^/]+)\/price$/)
    if (request.method === 'GET' && match) {
      action = 'products.price'
      const data = await getExternalProductPrice(env, match[0])
      await logSuccess(env, request, requestId, action, { sku: data.sku })
      return successResponse(data, { cors, requestId })
    }

    match = pathMatch(url.pathname, /^\/api\/external\/products\/sku\/([^/]+)$/)
    if (request.method === 'GET' && match) {
      action = 'products.by_sku'
      const data = await getExternalProductBySku(env, match[0])
      await logSuccess(env, request, requestId, action, { sku: data.sku })
      return successResponse(data, { cors, requestId })
    }

    match = pathMatch(url.pathname, /^\/api\/external\/products\/([^/]+)$/)
    if (request.method === 'GET' && match) {
      action = 'products.detail'
      const data = await getExternalProductDetail(env, match[0])
      await logSuccess(env, request, requestId, action, { productId: data.id })
      return successResponse(data, { cors, requestId })
    }

    if (request.method === 'POST' && url.pathname === '/api/external/inventory/check') {
      action = 'inventory.check'
      const body = await parseExternalJsonBody(request)
      const data = await checkExternalInventory(env, body)
      await logSuccess(env, request, requestId, action, { sku: data.sku, canSell: data.canSell })
      return successResponse(data, { cors, requestId })
    }

    if (request.method === 'POST' && url.pathname === '/api/external/inventory/reserve') {
      action = 'inventory.reserve'
      const body = await parseExternalJsonBody(request)
      const data = await reserveExternalInventory(env, request, body)
      await logSuccess(env, request, requestId, action, { sku: data.sku, reservationId: data.reservationId })
      sendInventoryWebhook(ctx, env, data.sku)
      return successResponse(data, { cors, requestId })
    }

    match = pathMatch(url.pathname, /^\/api\/external\/inventory\/reservations\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && match) {
      action = 'inventory.reservation.cancel'
      const body = await parseExternalJsonBody(request)
      const data = await cancelExternalReservation(env, match[0], body)
      await logSuccess(env, request, requestId, action, { sku: data.sku, reservationId: data.reservationId })
      sendInventoryWebhook(ctx, env, data.sku)
      return successResponse(data, { cors, requestId })
    }

    match = pathMatch(url.pathname, /^\/api\/external\/inventory\/reservations\/([^/]+)\/commit$/)
    if (request.method === 'POST' && match) {
      action = 'inventory.reservation.commit'
      const body = await parseExternalJsonBody(request)
      const data = await commitExternalReservation(env, match[0], body)
      await logSuccess(env, request, requestId, action, { sku: data.sku, reservationId: data.reservationId })
      sendInventoryWebhook(ctx, env, data.sku)
      return successResponse(data, { cors, requestId })
    }

    if (request.method === 'POST' && url.pathname === '/api/external/orders/from-facebook') {
      action = 'orders.from_facebook'
      const body = await parseExternalJsonBody(request)
      const data = await createExternalFacebookOrder(env, body)
      await logSuccess(env, request, requestId, action, {
        orderId: data.orderId,
        sourceOrderId: body.sourceOrderId,
        idempotent: Boolean(data.idempotent)
      })
      if (!data.idempotent) {
        sendOrderCreatedWebhook(ctx, env, { ...data, sourceOrderId: body.sourceOrderId })
        for (const item of body.items || []) sendInventoryWebhook(ctx, env, item.sku)
      }
      return successResponse(data, { cors, requestId })
    }

    match = pathMatch(url.pathname, /^\/api\/external\/orders\/source\/([^/]+)$/)
    if (request.method === 'GET' && match) {
      action = 'orders.by_source'
      const data = await getExternalOrderBySourceOrderId(env, match[0])
      await logSuccess(env, request, requestId, action, { sourceOrderId: match[0] })
      return successResponse(data, { cors, requestId })
    }

    match = pathMatch(url.pathname, /^\/api\/external\/orders\/([^/]+)$/)
    if (request.method === 'GET' && match) {
      action = 'orders.detail'
      const data = await getExternalOrderById(env, match[0])
      await logSuccess(env, request, requestId, action, { orderId: match[0] })
      return successResponse(data, { cors, requestId })
    }

    if (request.method === 'POST' && url.pathname === '/api/external/webhook/test') {
      action = 'webhook.test'
      const body = await parseExternalJsonBody(request).catch(() => ({}))
      const event = FACEBOOK_CRM_WEBHOOK_EVENTS.includes(body.event) ? body.event : 'inventory.updated'
      const data = body.data || {
        sku: 'TEST-SKU',
        productId: 'TEST-SKU',
        stock: 100,
        availableStock: 90,
        reservedStock: 10,
        updatedAt: new Date().toISOString()
      }
      const result = await sendWebhookOrThrow(env, event, data, { eventId: body.eventId })
      await logSuccess(env, request, requestId, action, { event, eventId: result.eventId })
      return successResponse(result, { cors, requestId })
    }

    if (request.method === 'GET' && url.pathname === '/api/external/webhook/deliveries') {
      action = 'webhook.deliveries'
      const data = await listWebhookDeliveryLogs(env, url)
      await logSuccess(env, request, requestId, action, { count: data.length })
      return successResponse(data, { cors, requestId })
    }

    throw new ExternalApiError(EXTERNAL_ERROR_CODES.VALIDATION_ERROR, 'Endpoint External API không hợp lệ', 404, {
      path: url.pathname,
      method: request.method
    })
  } catch (error) {
    const finalError = error instanceof ExternalApiError
      ? error
      : new ExternalApiError(EXTERNAL_ERROR_CODES.INTERNAL_ERROR, 'Lỗi hệ thống', 500)
    await logFailure(env, request, requestId, action, finalError)
    return errorResponse(finalError, { cors, requestId })
  }
}
