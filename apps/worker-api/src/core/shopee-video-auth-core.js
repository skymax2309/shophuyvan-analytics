export const DEFAULT_SHOPEE_VIDEO_CALLBACK = 'https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/shopee/video/callback'

export function cleanShopeeVideoAuthText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

async function addShopColumnIfMissing(env, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE shops ADD COLUMN ${definition}`).run()
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
  }
}

export async function ensureShopeeVideoAuthColumns(env) {
  // Shopee Video dùng app/token riêng để không làm lệch token đơn hàng, sản phẩm, ADS của API chính.
  await addShopColumnIfMissing(env, "video_partner_id TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_partner_key TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_redirect_url TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_access_token TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_refresh_token TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_token_expire_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_api_connected_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_api_refresh_expire_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_last_api_refresh_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_api_shop_id TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_api_user_id TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_auth_subject_type TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_permission_status TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_permission_message TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "video_permission_tested_at TEXT DEFAULT ''")
}

export function getShopeeVideoAppFromRow(row = {}) {
  const partnerId = cleanShopeeVideoAuthText(row.video_partner_id)
  const partnerKey = cleanShopeeVideoAuthText(row.video_partner_key)
  if (!partnerId || !partnerKey) return null
  return {
    partnerId,
    partnerKey,
    redirect: cleanShopeeVideoAuthText(row.video_redirect_url) || DEFAULT_SHOPEE_VIDEO_CALLBACK
  }
}

export function buildShopeeVideoCallbackUrl(baseUrl, shopName = '') {
  const callback = new URL(cleanShopeeVideoAuthText(baseUrl) || DEFAULT_SHOPEE_VIDEO_CALLBACK)
  if (cleanShopeeVideoAuthText(shopName)) callback.searchParams.set('shop', cleanShopeeVideoAuthText(shopName))
  return callback.toString()
}

export function parseShopeeVideoAuthDate(value) {
  const text = cleanShopeeVideoAuthText(value)
  if (!text) return null
  const normalized = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function isShopeeVideoTokenLive(row = {}) {
  const expiresAt = parseShopeeVideoAuthDate(row.video_token_expire_at)
  const hasAccessToken = Boolean(cleanShopeeVideoAuthText(row.video_access_token)) ||
    row.has_video_access_token === true ||
    row.has_video_access_token === 1 ||
    row.has_video_access_token === '1'
  return hasAccessToken &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
}

export function hasShopeeVideoRefreshToken(row = {}) {
  return Boolean(cleanShopeeVideoAuthText(row.video_refresh_token))
}

export function isShopeeVideoPermissionOk(row = {}) {
  return cleanShopeeVideoAuthText(row.video_permission_status).toLowerCase() === 'ok'
}

export function hasShopeeVideoAppConfig(row = {}) {
  return Boolean(cleanShopeeVideoAuthText(row.video_partner_id)) &&
    Boolean(cleanShopeeVideoAuthText(row.video_partner_key) || row.has_video_partner_key)
}

export function shopeeVideoUserId(row = {}) {
  const userId = cleanShopeeVideoAuthText(row.video_api_user_id)
  const shopId = cleanShopeeVideoAuthText(row.video_api_shop_id || row.api_shop_id)
  const subjectType = cleanShopeeVideoAuthText(row.video_auth_subject_type).toLowerCase()
  // Shopee Video là User API, nên không được dùng shop_id/shop token để ký thay user_id.
  if (!userId || subjectType === 'shop' || subjectType === 'main_account') return ''
  if (shopId && userId === shopId) return ''
  return userId
}

export function shopeeVideoShopId(row = {}) {
  return cleanShopeeVideoAuthText(row.video_api_shop_id || row.api_shop_id)
}

export function buildShopeeVideoRefreshBody(row = {}, partnerId) {
  const subjectType = cleanShopeeVideoAuthText(row.video_auth_subject_type)
  const shopId = cleanShopeeVideoAuthText(row.video_api_shop_id)
  const userId = cleanShopeeVideoAuthText(row.video_api_user_id)
  const body = {
    refresh_token: cleanShopeeVideoAuthText(row.video_refresh_token),
    partner_id: Number(partnerId)
  }
  if (subjectType === 'user' && userId) {
    body.user_id = Number(userId)
  } else if (subjectType === 'shop' && shopId) {
    body.shop_id = Number(shopId)
  } else if (userId) {
    body.user_id = Number(userId)
  } else if (shopId) {
    body.shop_id = Number(shopId)
  }
  return body
}
