const SENSITIVE_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|partner[_-]?key|secret|sign|signature|authorization|cookie)/i

export function cleanShopeeActionText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function safeShopeeJson(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function redactShopeeDebug(value) {
  if (Array.isArray(value)) return value.map(item => redactShopeeDebug(item))
  if (!value || typeof value !== 'object') return value
  const output = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? '***' : redactShopeeDebug(item)
  }
  return output
}

export function compactShopeeDebug(value, limit = 30000) {
  try {
    return JSON.stringify(redactShopeeDebug(value ?? {})).slice(0, limit)
  } catch {
    return '{}'
  }
}

export function extractShopeeRequestId(value) {
  const data = safeShopeeJson(value, {})
  return cleanShopeeActionText(
    data.request_id ||
    data.requestId ||
    data.response?.request_id ||
    data.raw_response?.request_id ||
    data.raw_error?.request_id
  )
}

export function extractShopeeError(value) {
  const data = safeShopeeJson(value, {})
  const raw = data.raw_error || data
  const response = raw.response && typeof raw.response === 'object' ? raw.response : {}
  const responseErrors = []
  if (Array.isArray(response.error_list)) {
    for (const item of response.error_list) {
      responseErrors.push({
        error: cleanShopeeActionText(item.fail_error || item.error || item.code),
        message: cleanShopeeActionText(item.fail_message || item.message || item.msg),
        item_id: cleanShopeeActionText(item.item_id),
        model_id: cleanShopeeActionText(item.model_id)
      })
    }
  }
  return {
    code: cleanShopeeActionText(raw.error || raw.code || raw.error_code || response.error),
    message: cleanShopeeActionText(raw.message || raw.msg || response.message || response.msg),
    request_id: extractShopeeRequestId(raw),
    details: responseErrors.filter(item => item.error || item.message || item.item_id || item.model_id)
  }
}

export function shopeeResponseHasBusinessError(data = {}) {
  const error = extractShopeeError(data)
  if (error.code || error.message) return true
  const response = data?.response && typeof data.response === 'object' ? data.response : {}
  return Array.isArray(response.error_list) && response.error_list.length > 0
}

export function isShopeeInvalidAccessTokenMessage(message) {
  const text = cleanShopeeActionText(message).toLowerCase()
  return text.includes('invalid_access_token') ||
    text.includes('invalid access_token') ||
    text.includes('invalid_acceess_token') ||
    text.includes('access_token is invalid') ||
    text.includes('token expired')
}

export function buildShopeeActionResult(input = {}) {
  const rawResponse = input.raw_response || input.response || null
  const rawError = input.raw_error || null
  const error = rawError ? extractShopeeError(rawError) : extractShopeeError(rawResponse || {})
  const verified = input.verified === true
  const ok = input.ok === true && verified
  const payloadPreview = redactShopeeDebug(input.payload_preview || input.payload || {})
  const responsePreview = rawResponse ? redactShopeeDebug(rawResponse) : null
  const errorPreview = rawError ? redactShopeeDebug(rawError) : null
  return {
    ok,
    status: ok ? 'ok' : (input.status || 'error'),
    mode: input.mode || 'shopee_live_action',
    action: cleanShopeeActionText(input.action),
    endpoint: cleanShopeeActionText(input.endpoint),
    request_id: cleanShopeeActionText(input.request_id || error.request_id || extractShopeeRequestId(rawResponse || {})),
    shop_id: cleanShopeeActionText(input.shop_id || input.api_shop_id),
    api_shop_id: cleanShopeeActionText(input.api_shop_id || input.shop_id),
    shop: cleanShopeeActionText(input.shop),
    object_id: cleanShopeeActionText(input.object_id),
    payload_preview: payloadPreview,
    request_payload: payloadPreview,
    payload: payloadPreview,
    raw_error: errorPreview,
    raw_response: responsePreview,
    response: responsePreview,
    error_code: cleanShopeeActionText(input.error_code || error.code),
    message: cleanShopeeActionText(input.message || error.message),
    verified,
    verify_result: redactShopeeDebug(input.verify_result || null),
    sent_to_shopee: input.sent_to_shopee === true,
    applied: input.sent_to_shopee === true && ok,
    dry_run: input.dry_run === true
  }
}
