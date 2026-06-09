const SECRET_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|partner[_-]?key|secret|sign|signature|authorization|cookie|hmac)/i

function maskText(value) {
  const text = String(value ?? '')
  if (!text) return ''
  if (text.length <= 8) return '***'
  return `${text.slice(0, 4)}***${text.slice(-4)}`
}

export function maskShopeeSecret(value) {
  if (value === undefined || value === null || value === '') return ''
  return maskText(value)
}

export function hasShopeeSecret(value) {
  return String(value ?? '').trim() ? 1 : 0
}

export function redactShopeeValue(value) {
  if (Array.isArray(value)) return value.map(redactShopeeValue)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? maskShopeeSecret(item) : redactShopeeValue(item)
  }
  return out
}

export function safeShopeeJson(value, limit = 20000) {
  try {
    return JSON.stringify(redactShopeeValue(value ?? {})).slice(0, limit)
  } catch {
    return '{}'
  }
}

export function summarizeShopeePayload(value = {}) {
  const data = value && typeof value === 'object' ? value : {}
  const summary = {
    keys: Object.keys(data).slice(0, 40),
    item_count: Array.isArray(data.item_list) ? data.item_list.length : 0,
    model_count: Array.isArray(data.model_list) ? data.model_list.length : 0,
    has_discount_id: data.discount_id ? 1 : 0,
    has_voucher_id: data.voucher_id ? 1 : 0,
    has_bundle_deal_id: data.bundle_deal_id ? 1 : 0,
    has_add_on_deal_id: data.add_on_deal_id ? 1 : 0,
    has_flash_sale_id: data.flash_sale_id ? 1 : 0
  }
  return redactShopeeValue(summary)
}
