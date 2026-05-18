function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function buildShopeeV2BaseString({ partnerId, path, timestamp, accessToken = '', shopId = '' } = {}) {
  const partner = cleanText(partnerId)
  const apiPath = cleanText(path)
  const time = cleanText(timestamp)
  const token = cleanText(accessToken)
  const shop = cleanText(shopId)
  if (!partner || !apiPath || !time) throw new Error('missing_signature_input')
  return token || shop ? `${partner}${apiPath}${time}${token}${shop}` : `${partner}${apiPath}${time}`
}

export async function signShopeeV2({ partnerKey, partnerId, path, timestamp, accessToken = '', shopId = '' } = {}) {
  const key = cleanText(partnerKey)
  if (!key) throw new Error('missing_partner_key')
  const baseString = buildShopeeV2BaseString({ partnerId, path, timestamp, accessToken, shopId })
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(baseString))
  return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildShopeeSignedUrl(config, path, params = {}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const accessToken = cleanText(config.accessToken)
  const shopId = cleanText(config.shopId)
  const sign = await signShopeeV2({
    partnerKey: config.partnerKey,
    partnerId: config.partnerId,
    path,
    timestamp,
    accessToken,
    shopId
  })
  const baseUrl = cleanText(config.baseUrl) || 'https://partner.shopeemobile.com'
  const url = new URL(`${baseUrl}${path}`)
  url.searchParams.set('partner_id', cleanText(config.partnerId))
  url.searchParams.set('timestamp', String(timestamp))
  if (accessToken) url.searchParams.set('access_token', accessToken)
  if (shopId) url.searchParams.set('shop_id', shopId)
  url.searchParams.set('sign', sign)
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}
