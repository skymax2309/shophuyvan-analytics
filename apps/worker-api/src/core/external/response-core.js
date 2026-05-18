export const EXTERNAL_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  SKU_NOT_FOUND: 'SKU_NOT_FOUND',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  RESERVATION_NOT_FOUND: 'RESERVATION_NOT_FOUND',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',
  RESERVATION_CANCELLED: 'RESERVATION_CANCELLED',
  RESERVATION_ALREADY_COMMITTED: 'RESERVATION_ALREADY_COMMITTED',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  DUPLICATE_SOURCE_ORDER: 'DUPLICATE_SOURCE_ORDER',
  WEBHOOK_SEND_FAILED: 'WEBHOOK_SEND_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
}

export class ExternalApiError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message)
    this.name = 'ExternalApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function cleanExternalText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function externalNumber(value, fallback = 0) {
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : fallback
}

export function externalInt(value, fallback = 0) {
  return Math.trunc(externalNumber(value, fallback))
}

export function externalJson(value, fallback = {}) {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function makeRequestId(request) {
  return cleanExternalText(request.headers.get('X-Request-Id')) || crypto.randomUUID()
}

export function withExternalHeaders(cors = {}, requestId = '') {
  return {
    ...cors,
    'Cache-Control': 'no-store',
    ...(requestId ? { 'X-Request-Id': requestId } : {})
  }
}

export function successResponse(data = {}, options = {}) {
  const body = {
    success: true,
    data,
    message: options.message || 'OK'
  }
  return Response.json(body, {
    status: options.status || 200,
    headers: withExternalHeaders(options.cors, options.requestId)
  })
}

export function paginatedResponse(data = [], pagination = {}, options = {}) {
  return Response.json({
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: pagination.totalPages
    }
  }, {
    status: options.status || 200,
    headers: withExternalHeaders(options.cors, options.requestId)
  })
}

export function errorResponse(error, options = {}) {
  const code = error?.code || EXTERNAL_ERROR_CODES.INTERNAL_ERROR
  const message = error?.message || 'Lỗi hệ thống'
  const details = error?.details && typeof error.details === 'object' ? error.details : {}
  return Response.json({
    success: false,
    error: { code, message, details }
  }, {
    status: error?.status || options.status || 500,
    headers: withExternalHeaders(options.cors, options.requestId)
  })
}

export async function parseExternalJsonBody(request) {
  try {
    return await request.json()
  } catch {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.VALIDATION_ERROR,
      'Body JSON không hợp lệ',
      400
    )
  }
}

