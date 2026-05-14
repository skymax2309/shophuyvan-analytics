import { signHmacHex } from '../../utils/shopee-apps.js'
import {
  buildShopeeVideoRefreshBody,
  cleanShopeeVideoAuthText,
  ensureShopeeVideoAuthColumns,
  getShopeeVideoAppFromRow
} from '../../core/shopee-video-auth-core.js'

const SHOPEE_REFRESH_DAYS = 30

export async function loadShopeeVideoShop(env, { shopId, shopName }) {
  await ensureShopeeVideoAuthColumns(env)
  const selectColumns = `
    id, shop_name, user_name, api_shop_id, api_user_id,
    video_partner_id, video_partner_key, video_redirect_url,
    video_access_token, video_refresh_token, video_token_expire_at,
    video_api_shop_id, video_api_user_id, video_auth_subject_type,
    video_api_connected_at, video_api_refresh_expire_at, video_last_api_refresh_at,
    video_permission_status, video_permission_message, video_permission_tested_at
  `
  if (shopId) {
    return env.DB.prepare(`
      SELECT ${selectColumns}
      FROM shops
      WHERE id = ?
    `).bind(shopId).first()
  }

  if (shopName) {
    return env.DB.prepare(`
      SELECT ${selectColumns}
      FROM shops
      WHERE platform = 'shopee'
        AND (shop_name = ? OR user_name = ? OR api_shop_id = ? OR video_api_shop_id = ? OR video_api_user_id = ?)
      LIMIT 1
    `).bind(shopName, shopName, shopName, shopName, shopName).first()
  }

  return null
}

export async function refreshShopeeVideoTokenForShop(env, shop) {
  await ensureShopeeVideoAuthColumns(env)
  const current = shop?.video_partner_key ? shop : await loadShopeeVideoShop(env, { shopId: shop?.id, shopName: shop?.shop_name || shop?.user_name })
  if (!current?.video_refresh_token) {
    throw new Error('Shop chưa có refresh token riêng cho Shopee Video.')
  }

  const app = getShopeeVideoAppFromRow(current)
  if (!app) {
    throw new Error('Shop chưa lưu Partner ID/Key riêng cho Shopee Video.')
  }

  const path = '/api/v2/auth/access_token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const baseString = `${app.partnerId}${path}${timestamp}`
  const signHex = await signHmacHex(app.partnerKey, baseString)
  const shopeeUrl = `https://partner.shopeemobile.com${path}?partner_id=${app.partnerId}&timestamp=${timestamp}&sign=${signHex}`
  const tokenBody = buildShopeeVideoRefreshBody(current, app.partnerId)

  if (!tokenBody.shop_id && !tokenBody.user_id && !tokenBody.main_account_id) {
    throw new Error('Shop chưa có shop_id hoặc user_id video để làm mới token Shopee Video.')
  }

  const shopeeRes = await fetch(shopeeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokenBody)
  })
  const shopeeData = await shopeeRes.json()

  if (shopeeData.error || !shopeeData.access_token) {
    throw new Error(shopeeData.message || shopeeData.error || 'Shopee không trả access_token video khi làm mới.')
  }

  const expireSeconds = Number(shopeeData.expire_in || 14400)
  const nowIso = new Date().toISOString()
  const expireAt = new Date(Date.now() + expireSeconds * 1000).toISOString()
  const refreshExpireAt = new Date(Date.now() + SHOPEE_REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const refreshedUserId = cleanShopeeVideoAuthText(shopeeData.user_id) || cleanShopeeVideoAuthText(current.video_api_user_id)
  await env.DB.prepare(`
    UPDATE shops
    SET video_access_token = ?,
        video_refresh_token = ?,
        video_token_expire_at = ?,
        video_last_api_refresh_at = ?,
        video_api_refresh_expire_at = ?,
        video_api_user_id = CASE WHEN ? != '' THEN ? ELSE video_api_user_id END,
        video_auth_subject_type = CASE WHEN ? != '' THEN 'user' ELSE video_auth_subject_type END
    WHERE id = ?
  `).bind(
    shopeeData.access_token,
    shopeeData.refresh_token || current.video_refresh_token,
    expireAt,
    nowIso,
    refreshExpireAt,
    refreshedUserId,
    refreshedUserId,
    cleanShopeeVideoAuthText(shopeeData.user_id),
    current.id
  ).run()

  return {
    partnerId: app.partnerId,
    expireSeconds,
    video_access_token: shopeeData.access_token,
    video_refresh_token: shopeeData.refresh_token || current.video_refresh_token,
    video_token_expire_at: expireAt,
    video_last_api_refresh_at: nowIso,
    video_api_refresh_expire_at: refreshExpireAt,
    video_api_user_id: refreshedUserId,
    video_api_shop_id: cleanShopeeVideoAuthText(current.video_api_shop_id)
  }
}
