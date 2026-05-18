import { buildShopeeSignedUrl } from './signature.js'
import { hasShopeeSecret, redactShopeeValue, summarizeShopeePayload } from '../logs/shopeeLogMask.js'

const DEFAULT_BASE_URL = 'https://partner.shopeemobile.com'
const CLIENT_LABELS = {
  ads_client: 'Shopee Ads API',
  marketplace_client: 'Shopee Marketplace/Marketing API',
  chat_client: 'Shopee Chat/Customer Service API'
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function boolEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(cleanText(value).toLowerCase())
}

export function normalizeShopeeClientType(value = '') {
  const text = cleanText(value).toLowerCase()
  if (text === 'ads' || text === 'ads_client' || text === 'shopee_ads') return 'ads_client'
  if (text === 'chat' || text === 'chat_client' || text === 'customer_service' || text === 'sellerchat' || text === 'shopee_chat') return 'chat_client'
  return 'marketplace_client'
}

export function clientTypeFromPath(path = '') {
  const safePath = cleanText(path)
  if (safePath.startsWith('/api/v2/ads/')) return 'ads_client'
  if (safePath.startsWith('/api/v2/sellerchat/')) return 'chat_client'
  return 'marketplace_client'
}

function envValue(env, ...keys) {
  for (const key of keys) {
    const value = cleanText(env?.[key])
    if (value) return value
  }
  return ''
}

function rowValue(row, ...keys) {
  for (const key of keys) {
    const value = cleanText(row?.[key])
    if (value) return value
  }
  return ''
}

function configFromEnv(env, clientType) {
  if (clientType === 'ads_client') {
    return {
      source: 'env_ads',
      partnerId: envValue(env, 'SHOPEE_ADS_PARTNER_ID'),
      partnerKey: envValue(env, 'SHOPEE_ADS_PARTNER_KEY'),
      shopId: envValue(env, 'SHOPEE_ADS_SHOP_ID'),
      accessToken: envValue(env, 'SHOPEE_ADS_ACCESS_TOKEN'),
      refreshToken: envValue(env, 'SHOPEE_ADS_REFRESH_TOKEN'),
      baseUrl: envValue(env, 'SHOPEE_ADS_API_BASE_URL', 'SHOPEE_API_BASE_URL') || DEFAULT_BASE_URL,
      redirectUrl: envValue(env, 'SHOPEE_ADS_REDIRECT_URL')
    }
  }
  if (clientType === 'chat_client') {
    return {
      source: 'env_chat',
      partnerId: envValue(env, 'SHOPEE_CHAT_PARTNER_ID', 'SHOPEE_MARKETPLACE_PARTNER_ID'),
      partnerKey: envValue(env, 'SHOPEE_CHAT_PARTNER_KEY', 'SHOPEE_MARKETPLACE_PARTNER_KEY'),
      shopId: envValue(env, 'SHOPEE_CHAT_SHOP_ID', 'SHOPEE_MARKETPLACE_SHOP_ID'),
      accessToken: envValue(env, 'SHOPEE_CHAT_ACCESS_TOKEN', 'SHOPEE_MARKETPLACE_ACCESS_TOKEN'),
      refreshToken: envValue(env, 'SHOPEE_CHAT_REFRESH_TOKEN', 'SHOPEE_MARKETPLACE_REFRESH_TOKEN'),
      baseUrl: envValue(env, 'SHOPEE_CHAT_API_BASE_URL', 'SHOPEE_MARKETPLACE_API_BASE_URL', 'SHOPEE_API_BASE_URL') || DEFAULT_BASE_URL,
      redirectUrl: envValue(env, 'SHOPEE_CHAT_REDIRECT_URL', 'SHOPEE_MARKETPLACE_REDIRECT_URL')
    }
  }
  return {
    source: 'env_marketplace',
    partnerId: envValue(env, 'SHOPEE_MARKETPLACE_PARTNER_ID'),
    partnerKey: envValue(env, 'SHOPEE_MARKETPLACE_PARTNER_KEY'),
    shopId: envValue(env, 'SHOPEE_MARKETPLACE_SHOP_ID'),
    accessToken: envValue(env, 'SHOPEE_MARKETPLACE_ACCESS_TOKEN'),
    refreshToken: envValue(env, 'SHOPEE_MARKETPLACE_REFRESH_TOKEN'),
    baseUrl: envValue(env, 'SHOPEE_MARKETPLACE_API_BASE_URL', 'SHOPEE_API_BASE_URL') || DEFAULT_BASE_URL,
    redirectUrl: envValue(env, 'SHOPEE_MARKETPLACE_REDIRECT_URL')
  }
}

function configFromShopRow(env, row, clientType) {
  return {
    source: 'db_shop_legacy_unclassified',
    partnerId: rowValue(row, 'api_partner_id', 'partner_id') || envValue(env, 'SHOPEE_PARTNER_ID'),
    partnerKey: rowValue(row, 'api_partner_key', 'partner_key') || envValue(env, 'SHOPEE_PARTNER_KEY'),
    shopId: rowValue(row, 'api_shop_id', 'shop_id'),
    accessToken: rowValue(row, 'access_token'),
    refreshToken: rowValue(row, 'refresh_token'),
    baseUrl: envValue(env, clientType === 'ads_client' ? 'SHOPEE_ADS_API_BASE_URL' : (clientType === 'chat_client' ? 'SHOPEE_CHAT_API_BASE_URL' : 'SHOPEE_MARKETPLACE_API_BASE_URL'), 'SHOPEE_API_BASE_URL') || DEFAULT_BASE_URL,
    redirectUrl: rowValue(row, 'api_redirect_url') || envValue(env, clientType === 'ads_client' ? 'SHOPEE_ADS_REDIRECT_URL' : (clientType === 'chat_client' ? 'SHOPEE_CHAT_REDIRECT_URL' : 'SHOPEE_MARKETPLACE_REDIRECT_URL'), 'SHOPEE_REDIRECT')
  }
}

export function resolveShopeeClientConfig(env, options = {}) {
  const clientType = normalizeShopeeClientType(options.clientType)
  const envConfig = configFromEnv(env, clientType)
  const rowConfig = configFromShopRow(env, options.shopRow || {}, clientType)
  const envReady = envConfig.partnerId && envConfig.partnerKey
  const config = envReady
    ? {
        ...envConfig,
        shopId: envConfig.shopId || rowConfig.shopId,
        accessToken: envConfig.accessToken || rowConfig.accessToken,
        refreshToken: envConfig.refreshToken || rowConfig.refreshToken,
        redirectUrl: envConfig.redirectUrl || rowConfig.redirectUrl
      }
    : rowConfig
  const finalConfig = {
    ...config,
    shopId: cleanText(options.shopId) || config.shopId,
    accessToken: cleanText(options.accessToken) || config.accessToken,
    refreshToken: cleanText(options.refreshToken) || config.refreshToken
  }
  return {
    ...finalConfig,
    clientType,
    label: CLIENT_LABELS[clientType],
    env: cleanText(env?.SHOPEE_ENV || 'live').toLowerCase() || 'live',
    liveWriteEnabled: boolEnv(env?.SHOPEE_LIVE_WRITE_ENABLED),
    configured: hasShopeeSecret(finalConfig.partnerId) && hasShopeeSecret(finalConfig.partnerKey),
    hasShopId: hasShopeeSecret(finalConfig.shopId),
    hasAccessToken: hasShopeeSecret(finalConfig.accessToken),
    hasRefreshToken: hasShopeeSecret(finalConfig.refreshToken),
    usingSeparatedEnv: envReady ? 1 : 0,
    usingLegacyDbConfig: envReady ? 0 : 1
  }
}

export function publicShopeeClientConfig(config = {}) {
  return redactShopeeValue({
    client_type: config.clientType,
    label: config.label,
    source: config.source,
    env: config.env,
    base_url: config.baseUrl,
    redirect_url: config.redirectUrl,
    configured: config.configured ? 1 : 0,
    has_partner_id: hasShopeeSecret(config.partnerId),
    has_partner_key: hasShopeeSecret(config.partnerKey),
    has_shop_id: hasShopeeSecret(config.shopId),
    has_access_token: hasShopeeSecret(config.accessToken),
    has_refresh_token: hasShopeeSecret(config.refreshToken),
    using_separated_env: config.usingSeparatedEnv ? 1 : 0,
    using_legacy_db_config: config.usingLegacyDbConfig ? 1 : 0,
    live_write_enabled: config.liveWriteEnabled ? 1 : 0
  })
}

export function mapShopeeError(data = {}, httpStatus = 0) {
  const code = cleanText(data.error || data.error_code || data.code || data.response?.error)
  const message = cleanText(data.message || data.msg || data.response?.message || data.response?.msg)
  const text = `${code} ${message}`.toLowerCase()
  let category = 'shopee_api_error'
  if (httpStatus === 429 || text.includes('rate')) category = 'rate_limited'
  else if (text.includes('permission') || text.includes('forbidden') || text.includes('no permission') || text.includes('not allowed')) category = 'permission_error'
  else if (text.includes('invalid_access_token') || text.includes('access_token') || text.includes('token expired')) category = 'auth_expired'
  else if (text.includes('wrong_sign') || text.includes('signature') || text.includes('sign')) category = 'invalid_signature'
  else if (text.includes('param') || text.includes('invalid')) category = 'invalid_payload'
  else if (text.includes('unsupported') || text.includes('not support')) category = 'unsupported_api'
  return { category, code, message, request_id: cleanText(data.request_id), http_status: httpStatus }
}

export function assertShopeeLiveWriteAllowed(env, clientType = 'marketplace_client') {
  if (boolEnv(env?.SHOPEE_LIVE_WRITE_ENABLED)) return null
  return {
    status: 'error',
    error: 'live_write_disabled',
    category: 'live_write_disabled',
    client_type: clientType,
    sent_to_shopee: false,
    verified: false,
    message: 'SHOPEE_LIVE_WRITE_ENABLED=false nên hệ thống chặn lệnh ghi thật lên Shopee.'
  }
}

export async function callShopeeApi(env, options = {}) {
  const clientType = normalizeShopeeClientType(options.clientType || clientTypeFromPath(options.path))
  const config = resolveShopeeClientConfig(env, { ...options, clientType })
  const path = cleanText(options.path)
  const method = cleanText(options.method || 'GET').toUpperCase() || 'GET'
  const started = Date.now()
  if (!config.configured) throw Object.assign(new Error(`${clientType} chưa có partner_id/partner_key.`), { shopee: { category: 'missing_config', client_type: clientType } })
  if (!path) throw Object.assign(new Error('Thiếu Shopee endpoint path.'), { shopee: { category: 'invalid_payload', client_type: clientType } })
  const url = await buildShopeeSignedUrl(config, path, options.params || {})
  const init = method === 'POST'
    ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body || {}) }
    : { method }
  const res = await fetch(url.toString(), init)
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw_text: text }
  }
  const log = {
    timestamp: new Date().toISOString(),
    client_type: clientType,
    endpoint: path,
    method,
    shop_id: config.shopId,
    payload_summary: summarizeShopeePayload(options.body || options.params || {}),
    http_status: res.status,
    request_id: cleanText(data?.request_id),
    duration_ms: Date.now() - started
  }
  if (!res.ok || data.error) {
    const mapped = mapShopeeError(data, res.status)
    throw Object.assign(new Error(mapped.message || mapped.code || `Shopee API HTTP ${res.status}`), {
      shopee: {
        ...mapped,
        client_type: clientType,
        endpoint: path,
        raw_response: redactShopeeValue(data),
        log
      }
    })
  }
  return {
    ok: true,
    client_type: clientType,
    endpoint: path,
    http_status: res.status,
    request_id: cleanText(data?.request_id),
    raw_response: redactShopeeValue(data),
    response: data?.response || {},
    log
  }
}
