import { cleanExternalText, EXTERNAL_ERROR_CODES, ExternalApiError } from './response-core.js'
import { signWebhookPayload } from './security-core.js'
import { logExternalApiAction } from './schema-core.js'

export const FACEBOOK_CRM_WEBHOOK_EVENTS = [
  'product.created',
  'product.updated',
  'product.price_updated',
  'product.inactive',
  'inventory.updated',
  'inventory.low_stock',
  'order.created',
  'order.status_changed',
  'order.cancelled',
  'order.completed',
  'order.returned'
]

export function webhookEventId(prefix = 'evt') {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

function limitResponseBody(text = '') {
  const value = cleanExternalText(text)
  return value.length > 2000 ? `${value.slice(0, 2000)}...` : value
}

async function recordWebhookDelivery(env, row = {}) {
  await env.DB.prepare(`
    INSERT INTO webhook_delivery_logs
      (event_type, event_id, target_url, payload, signature, status,
       response_status, response_body, retry_count, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    cleanExternalText(row.eventType),
    cleanExternalText(row.eventId),
    cleanExternalText(row.targetUrl),
    cleanExternalText(row.payload),
    cleanExternalText(row.signature),
    cleanExternalText(row.status || 'failed'),
    Number(row.responseStatus || 0) || 0,
    limitResponseBody(row.responseBody),
    Number(row.retryCount || 0) || 0,
    limitResponseBody(row.lastError)
  ).run()
}

export async function sendFacebookCrmWebhook(env, eventType, data = {}, options = {}) {
  const targetUrl = cleanExternalText(env.FACEBOOK_CRM_WEBHOOK_URL)
  const event = cleanExternalText(eventType)
  const eventId = cleanExternalText(options.eventId) || webhookEventId(event.replace(/[^a-z0-9]+/gi, '_') || 'evt')
  const createdAt = new Date().toISOString()
  const payloadObject = {
    event,
    eventId,
    createdAt,
    data
  }
  const rawBody = JSON.stringify(payloadObject)
  let signature = ''

  try {
    signature = await signWebhookPayload(env.WEBHOOK_SECRET_FOR_FACEBOOK_CRM, rawBody)
  } catch (error) {
    await recordWebhookDelivery(env, {
      eventType: event,
      eventId,
      targetUrl,
      payload: rawBody,
      status: 'failed',
      lastError: error.message
    })
    await logExternalApiAction(env, {
      action: 'webhook.failed',
      method: 'POST',
      path: targetUrl,
      requestId: eventId,
      source: 'facebook_crm',
      status: 'failed',
      errorCode: EXTERNAL_ERROR_CODES.WEBHOOK_SEND_FAILED,
      message: 'Thiếu cấu hình ký webhook',
      metadata: { event }
    })
    return { ok: false, eventId, error: error.message }
  }

  if (!targetUrl) {
    const message = 'Chưa cấu hình FACEBOOK_CRM_WEBHOOK_URL'
    await recordWebhookDelivery(env, {
      eventType: event,
      eventId,
      targetUrl,
      payload: rawBody,
      signature,
      status: 'failed',
      lastError: message
    })
    return { ok: false, eventId, error: message }
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
    'X-Webhook-Id': eventId,
    'X-Webhook-Timestamp': createdAt,
    'X-Webhook-Signature': signature
  }

  let responseStatus = 0
  let responseBody = ''
  let lastError = ''
  let success = false
  let attempts = 0

  for (attempts = 1; attempts <= 3; attempts += 1) {
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: rawBody
      })
      responseStatus = response.status
      responseBody = await response.text().catch(() => '')
      if (response.ok) {
        success = true
        break
      }
      lastError = `Webhook HTTP ${response.status}`
    } catch (error) {
      lastError = error?.message || 'Webhook fetch failed'
    }

    await logExternalApiAction(env, {
      action: 'webhook.retry',
      method: 'POST',
      path: targetUrl,
      requestId: eventId,
      source: 'facebook_crm',
      status: 'retry',
      errorCode: EXTERNAL_ERROR_CODES.WEBHOOK_SEND_FAILED,
      message: lastError,
      metadata: { event, attempt: attempts }
    })
  }

  await recordWebhookDelivery(env, {
    eventType: event,
    eventId,
    targetUrl,
    payload: rawBody,
    signature,
    status: success ? 'success' : 'failed',
    responseStatus,
    responseBody,
    retryCount: Math.max(0, attempts - 1),
    lastError
  })

  await logExternalApiAction(env, {
    action: success ? 'webhook.sent' : 'webhook.failed',
    method: 'POST',
    path: targetUrl,
    requestId: eventId,
    source: 'facebook_crm',
    status: success ? 'success' : 'failed',
    errorCode: success ? '' : EXTERNAL_ERROR_CODES.WEBHOOK_SEND_FAILED,
    message: success ? 'Đã gửi webhook Facebook CRM' : lastError,
    metadata: { event, responseStatus }
  })

  return {
    ok: success,
    eventId,
    event,
    responseStatus,
    retryCount: Math.max(0, attempts - 1),
    error: success ? '' : lastError
  }
}

export async function sendWebhookOrThrow(env, eventType, data = {}, options = {}) {
  const result = await sendFacebookCrmWebhook(env, eventType, data, options)
  if (!result.ok) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.WEBHOOK_SEND_FAILED,
      'Gửi webhook sang Facebook CRM thất bại',
      502,
      result
    )
  }
  return result
}

export async function listWebhookDeliveryLogs(env, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50) || 50, 1), 200)
  const status = cleanExternalText(url.searchParams.get('status'))
  const eventType = cleanExternalText(url.searchParams.get('eventType'))
  const conds = ['1=1']
  const params = []
  if (status) {
    conds.push('status = ?')
    params.push(status)
  }
  if (eventType) {
    conds.push('event_type = ?')
    params.push(eventType)
  }
  const { results } = await env.DB.prepare(`
    SELECT id, event_type, event_id, target_url, status, response_status,
           retry_count, last_error, created_at, updated_at
    FROM webhook_delivery_logs
    WHERE ${conds.join(' AND ')}
    ORDER BY id DESC
    LIMIT ?
  `).bind(...params, limit).all()
  return results || []
}

