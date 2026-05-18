import { cleanExternalText, EXTERNAL_ERROR_CODES, ExternalApiError } from './response-core.js'

function extractBearerToken(request) {
  const auth = cleanExternalText(request.headers.get('Authorization'))
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? cleanExternalText(match[1]) : ''
}

function constantTimeEqual(left, right) {
  const a = cleanExternalText(left)
  const b = cleanExternalText(right)
  let diff = a.length === b.length ? 0 : 1
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function getExternalApiKeyFromRequest(request) {
  return cleanExternalText(request.headers.get('X-API-Key')) || extractBearerToken(request)
}

export function assertExternalApiAuth(request, env) {
  const configuredKey = cleanExternalText(env.API_KEY_FOR_FACEBOOK_CRM)
  if (!configuredKey) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.FORBIDDEN,
      'Chưa cấu hình API_KEY_FOR_FACEBOOK_CRM cho External API',
      403
    )
  }

  const providedKey = getExternalApiKeyFromRequest(request)
  if (!providedKey || !constantTimeEqual(providedKey, configuredKey)) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.UNAUTHORIZED,
      'API key không hợp lệ hoặc chưa được gửi',
      401
    )
  }
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256Hex(secret, rawBody) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return bytesToHex(signature)
}

export async function signWebhookPayload(secret, rawBody) {
  const cleanSecret = cleanExternalText(secret)
  if (!cleanSecret) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.FORBIDDEN,
      'Chưa cấu hình WEBHOOK_SECRET_FOR_FACEBOOK_CRM',
      403
    )
  }
  return `sha256=${await hmacSha256Hex(cleanSecret, rawBody)}`
}

export async function verifyWebhookSignature(secret, rawBody, signatureHeader) {
  const expected = await signWebhookPayload(secret, rawBody)
  return constantTimeEqual(expected, cleanExternalText(signatureHeader))
}

export function idempotencyKeyFromRequest(request) {
  return cleanExternalText(request.headers.get('Idempotency-Key'))
}

