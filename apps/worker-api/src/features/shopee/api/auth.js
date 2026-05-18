import { callShopeeApi, mapShopeeError, normalizeShopeeClientType, resolveShopeeClientConfig } from './baseClient.js'
import { signShopeeV2 } from './signature.js'
import { redactShopeeValue } from '../logs/shopeeLogMask.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function isShopeeAuthExpired(error) {
  const category = cleanText(error?.shopee?.category)
  const text = `${error?.message || ''} ${error?.shopee?.code || ''}`.toLowerCase()
  return category === 'auth_expired' ||
    text.includes('invalid_access_token') ||
    text.includes('access_token') ||
    text.includes('token expired')
}

export async function refreshShopeeAccessToken(config = {}) {
  const refreshToken = cleanText(config.refreshToken)
  const shopId = cleanText(config.shopId)
  const partnerId = cleanText(config.partnerId)
  const partnerKey = cleanText(config.partnerKey)
  if (!refreshToken || !shopId || !partnerId || !partnerKey) {
    throw Object.assign(new Error('Thiếu refresh_token/shop_id/partner để làm mới Shopee token.'), {
      shopee: { category: 'auth_expired', client_type: config.clientType || 'marketplace_client' }
    })
  }
  const path = '/api/v2/auth/access_token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = await signShopeeV2({ partnerKey, partnerId, path, timestamp })
  const baseUrl = cleanText(config.baseUrl) || 'https://partner.shopeemobile.com'
  const res = await fetch(`${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: Number(shopId),
      partner_id: Number(partnerId)
    })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error || !data.access_token) {
    const mapped = mapShopeeError(data, res.status)
    throw Object.assign(new Error(mapped.message || mapped.code || 'Shopee không trả access_token mới.'), {
      shopee: {
        ...mapped,
        client_type: config.clientType || 'marketplace_client',
        endpoint: path,
        raw_response: redactShopeeValue(data)
      }
    })
  }
  return {
    access_token: cleanText(data.access_token),
    refresh_token: cleanText(data.refresh_token || refreshToken),
    raw_response: redactShopeeValue(data)
  }
}

export async function callShopeeApiWithAutoRefresh(env, options = {}) {
  try {
    return await callShopeeApi(env, options)
  } catch (error) {
    if (!isShopeeAuthExpired(error)) throw error
    if (typeof options.refreshShopToken === 'function' && options.shopRow?.id) {
      const refreshed = await options.refreshShopToken(env, options.shopRow)
      const shopRow = {
        ...options.shopRow,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token
      }
      return callShopeeApi(env, {
        ...options,
        clientType: normalizeShopeeClientType(options.clientType),
        shopRow
      })
    }
    const config = resolveShopeeClientConfig(env, {
      ...options,
      clientType: normalizeShopeeClientType(options.clientType),
      shopRow: options.shopRow || {}
    })
    const refreshed = await refreshShopeeAccessToken(config)
    return callShopeeApi(env, {
      ...options,
      clientType: normalizeShopeeClientType(options.clientType),
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token
    })
  }
}
