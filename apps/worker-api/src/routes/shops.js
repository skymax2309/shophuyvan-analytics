import { getShopeeAppForShop, signHmacHex } from '../utils/shopee-apps.js'
import { listMarketplaceShopCapabilities } from '../core/marketplace-shop-capability-core.js'
import {
  SHOPEE_SHOP_READ_ENDPOINTS,
  SHOPEE_SHOP_WRITE_ENDPOINTS,
  normalizeShopeeShopSnapshot,
  summarizeShopeeShopEndpoint
} from '../core/shopee-shop-profile-core.js'
import {
  DEFAULT_SHOPEE_VIDEO_CALLBACK,
  buildShopeeVideoRefreshBody,
  cleanShopeeVideoAuthText,
  ensureShopeeVideoAuthColumns,
  getShopeeVideoAppFromRow
} from '../core/shopee-video-auth-core.js'

const SHOPEE_REFRESH_DAYS = 30
const DEFAULT_SHOPEE_CALLBACK = 'https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/shopee/callback'
const LAZADA_APP_KEY = '135731'
const LAZADA_SECRET = 'UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function syntheticShopApiId(value) {
  const text = cleanText(value)
  const match = text.match(/^(shopee|lazada)\s+(\d+)$/i)
  if (match?.[2]) return match[2]
  return /^\d{6,}$/.test(text) ? text : ''
}

function isSyntheticShopName(value) {
  return /^(shopee|lazada)\s+\d+$/i.test(cleanText(value))
}

async function loadShopeeShop(env, { shopId, shopName }) {
  const selectColumns = `
    id, shop_name, user_name, api_shop_id, api_user_id, api_partner_id, api_partner_key,
    api_redirect_url, access_token, refresh_token, token_expire_at, api_refresh_expire_at
  `

  if (shopId) {
    return env.DB.prepare(`
      SELECT ${selectColumns}
      FROM shops
      WHERE id = ?
    `).bind(shopId).first()
  }

  const name = cleanText(shopName)
  if (name) {
    const apiShopId = syntheticShopApiId(name)

    return env.DB.prepare(`
      SELECT ${selectColumns}
      FROM shops
      WHERE platform = 'shopee'
        AND (
          shop_name = ?
          OR user_name = ?
          OR (? != '' AND api_shop_id = ?)
        )
      ORDER BY
        CASE WHEN shop_name = ? THEN 0 ELSE 1 END,
        CASE WHEN user_name = ? THEN 0 ELSE 1 END,
        CASE WHEN shop_name LIKE 'Shopee %' THEN 1 ELSE 0 END,
        id ASC
      LIMIT 1
    `).bind(name, name, apiShopId, apiShopId, name, name).first()
  }

  return null
}

function shopeeShopApiUrl(app, path, accessToken, shopId) {
  return async function(params = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const baseString = `${app.partnerId}${path}${timestamp}${accessToken}${shopId}`
    const sign = await signHmacHex(app.partnerKey, baseString)
    const url = new URL(`https://partner.shopeemobile.com${path}`)
    url.searchParams.set('partner_id', app.partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('shop_id', String(shopId))
    url.searchParams.set('sign', sign)
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}

function shopeeAccessTokenInvalid(message) {
  const text = cleanText(message).toLowerCase()
  return text.includes('invalid_access_token') ||
    text.includes('invalid access_token') ||
    text.includes('invalid_acceess_token') ||
    text.includes('access_token is invalid')
}

async function fetchShopeeShopRead(env, shop, endpoint, params = {}, retry = true) {
  const app = await getShopeeAppForShop(env, env.DB, shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  const buildUrl = shopeeShopApiUrl(app, endpoint.path, shop.access_token, shop.api_shop_id)
  const url = await buildUrl(params)
  const res = await fetch(url, { method: 'GET' })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Shopee ${endpoint.source} trả phản hồi không phải JSON, HTTP ${res.status}`)
  }

  const message = data.message || data.msg || data.error || ''
  if ((!res.ok || data.error) && retry && shopeeAccessTokenInvalid(message) && shop.refresh_token && shop.api_shop_id && shop.id) {
    const refreshed = await refreshShopeeTokenForShop(env, shop)
    shop.access_token = refreshed.access_token
    shop.refresh_token = refreshed.refresh_token
    return fetchShopeeShopRead(env, shop, endpoint, params, false)
  }
  if (!res.ok || data.error) throw new Error(message || `Shopee ${endpoint.source} HTTP ${res.status}`)
  return data
}

async function readShopeeShopSnapshot(env, { shopName, shopId }) {
  const shop = await loadShopeeShop(env, { shopId, shopName })
  if (!shop) throw new Error('Không tìm thấy shop Shopee để đọc thông tin.')
  if (!cleanText(shop.api_shop_id) || !cleanText(shop.access_token)) {
    throw new Error('Shop Shopee chưa có Shop ID hoặc access token API.')
  }

  const rows = []
  const warnings = []
  for (const endpoint of SHOPEE_SHOP_READ_ENDPOINTS) {
    try {
      const data = await fetchShopeeShopRead(env, shop, endpoint)
      rows.push({
        id: endpoint.id,
        label: endpoint.label,
        source: endpoint.source,
        endpoint: endpoint.path,
        status: 'ok',
        summary: summarizeShopeeShopEndpoint(endpoint, data),
        response: data.response || data.data || data.result || data
      })
    } catch (error) {
      rows.push({
        id: endpoint.id,
        label: endpoint.label,
        source: endpoint.source,
        endpoint: endpoint.path,
        status: 'error',
        summary: error?.message || String(error)
      })
      warnings.push({ endpoint: endpoint.source, message: error?.message || String(error) })
    }
  }

  // Snapshot chỉ đọc gom các endpoint trong hình vào một response để UI vận hành kiểm tra nhanh,
  // còn endpoint ghi thật được trả về dưới dạng guard để không vô tình đổi hồ sơ hoặc chế độ nghỉ.
  return normalizeShopeeShopSnapshot({ shop, rows, warnings })
}

async function loadShopeeVideoShop(env, { shopId, shopName }) {
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

export async function refreshShopeeTokenForShop(env, shop) {
  if (!shop?.refresh_token || !shop?.api_shop_id) {
    throw new Error('Shop chưa có refresh token hoặc Shopee Shop ID')
  }

  const app = await getShopeeAppForShop(env, env.DB, shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  const partnerId = String(app.partnerId)
  const partnerKey = String(app.partnerKey)
  const path = '/api/v2/auth/access_token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const baseString = partnerId + path + timestamp
  const signHex = await signHmacHex(partnerKey, baseString)
  const shopeeUrl = `https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signHex}`

  const shopeeRes = await fetch(shopeeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: shop.refresh_token,
      partner_id: parseInt(partnerId),
      shop_id: parseInt(shop.api_shop_id)
    })
  })
  const shopeeData = await shopeeRes.json()

  if (shopeeData.error) {
    throw new Error(shopeeData.message || shopeeData.error)
  }

  const expireSeconds = Number(shopeeData.expire_in || 14400)
  const nowIso = new Date().toISOString()
  const expireAt = new Date(Date.now() + expireSeconds * 1000).toISOString()
  const refreshExpireAt = new Date(Date.now() + SHOPEE_REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare(`
    UPDATE shops
    SET access_token = ?,
        refresh_token = ?,
        api_partner_id = ?,
        api_redirect_url = ?,
        token_expire_at = ?,
        last_api_refresh_at = ?,
        api_refresh_expire_at = ?
    WHERE id = ?
  `).bind(
    shopeeData.access_token,
    shopeeData.refresh_token || shop.refresh_token,
    partnerId,
    app.redirect || DEFAULT_SHOPEE_CALLBACK,
    expireAt,
    nowIso,
    refreshExpireAt,
    shop.id
  ).run()

  return {
    partnerId,
    expireSeconds,
    access_token: shopeeData.access_token,
    refresh_token: shopeeData.refresh_token || shop.refresh_token,
    api_user_id: cleanText(shop.api_user_id),
    api_shop_id: cleanText(shop.api_shop_id)
  }
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

export async function refreshLazadaTokenForShop(env, shop) {
  if (!shop?.refresh_token) {
    throw new Error('Shop chưa có refresh token Lazada')
  }

  const apiPath = '/auth/token/refresh'
  const params = {
    app_key: LAZADA_APP_KEY,
    timestamp: Date.now().toString(),
    sign_method: 'sha256',
    refresh_token: shop.refresh_token
  }

  let signString = apiPath
  for (const key of Object.keys(params).sort()) {
    signString += `${key}${params[key]}`
  }
  const sign = (await signHmacHex(LAZADA_SECRET, signString)).toUpperCase()

  const formData = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value)
  }
  formData.append('sign', sign)

  const res = await fetch(`https://auth.lazada.com/rest${apiPath}?${formData.toString()}`, {
    method: 'POST'
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || `Lazada refresh token lỗi HTTP ${res.status}`)
  }
  if (!data?.access_token) {
    throw new Error(data?.message || data?.error || 'Lazada không trả access_token khi refresh')
  }

  const expireSeconds = Number(data.expires_in || 86400)
  const nowIso = new Date().toISOString()
  const expireAt = new Date(Date.now() + expireSeconds * 1000).toISOString()
  await env.DB.prepare(`
    UPDATE shops
    SET access_token = ?,
        refresh_token = ?,
        token_expire_at = ?,
        last_api_refresh_at = ?
    WHERE id = ?
  `).bind(
    data.access_token,
    data.refresh_token || shop.refresh_token,
    expireAt,
    nowIso,
    shop.id
  ).run()

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || shop.refresh_token,
    expireSeconds
  }
}

export async function autoRefreshShopeeTokens(env) {
  const { results } = await env.DB.prepare(`
    SELECT id, shop_name, user_name, api_shop_id, api_user_id, api_partner_id, api_partner_key,
           api_redirect_url, refresh_token, token_expire_at
    FROM shops
    WHERE platform = 'shopee'
      AND refresh_token IS NOT NULL AND refresh_token != ''
      AND api_shop_id IS NOT NULL AND api_shop_id != ''
      AND (
        token_expire_at IS NULL
        OR datetime(token_expire_at) <= datetime('now', '+30 minutes')
      )
    LIMIT 20
  `).all()

  let refreshed = 0
  for (const shop of results || []) {
    try {
      await refreshShopeeTokenForShop(env, shop)
      refreshed++
    } catch (error) {
      console.error(`[SHOPEE_REFRESH] ${shop.shop_name}: ${error.message}`)
    }
  }
  return refreshed
}

export async function handleShopsWarehouse(request, env, cors) {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname.endsWith('/shops-warehouse-list')) {
    const { results } = await env.DB.prepare(`
      SELECT id, shop_name, platform, COALESCE(warehouse_source, 'main') as warehouse_source,
             token_expire_at, api_shop_id, api_partner_id
      FROM shops
      ORDER BY platform, shop_name
    `).all()
    return json(results, cors)
  }

  if (request.method === 'POST' && url.pathname.endsWith('/update-shop-warehouse')) {
    const { shop_id, warehouse_source } = await request.json()
    await env.DB.prepare('UPDATE shops SET warehouse_source = ? WHERE id = ?')
      .bind(warehouse_source, shop_id).run()
    return json({ status: 'ok' }, cors)
  }

  if (request.method === 'GET' && url.pathname.endsWith('/api-configs')) {
    const rows = await listMarketplaceShopCapabilities(env, { limit: 300 })
    return json(rows.map(row => ({
      ...row,
      api_redirect_url: cleanText(row.api_redirect_url) || DEFAULT_SHOPEE_CALLBACK
    })), cors)
  }

  if (request.method === 'GET' && url.pathname.endsWith('/shopee-snapshot')) {
    try {
      const snapshot = await readShopeeShopSnapshot(env, {
        shopName: cleanText(url.searchParams.get('shop') || url.searchParams.get('shop_name')),
        shopId: cleanText(url.searchParams.get('shop_id') || url.searchParams.get('id'))
      })
      return json(snapshot, cors)
    } catch (error) {
      return json({ error: error.message || String(error) }, cors, 400)
    }
  }

  if (request.method === 'GET' && url.pathname.endsWith('/shopee-write-guards')) {
    return json({
      status: 'locked',
      mode: 'preview_admin_confirm_log',
      message: 'Các endpoint ghi Shopee Shop chỉ được mở sau khi có preview payload, quyền admin, log và xác nhận riêng.',
      endpoints: SHOPEE_SHOP_WRITE_ENDPOINTS
    }, cors)
  }

  if (request.method === 'POST' && url.pathname.endsWith('/shopee-app-config')) {
    try {
      const body = await request.json()
      const rawShopName = String(body.shop_name || body.shop || body.user_name || '').trim()
      const shopName = rawShopName
      const partnerId = String(body.partner_id || body.partnerId || '').trim()
      const partnerKey = String(body.partner_key || body.partnerKey || '').trim()
      const redirectUrl = String(body.redirect || body.redirect_url || DEFAULT_SHOPEE_CALLBACK).trim()

      if (!shopName || !partnerId) {
        return json({ error: 'Thiếu shop hoặc Partner ID' }, cors, 400)
      }

      const apiShopIdFromName = syntheticShopApiId(shopName)

      const existing = await env.DB.prepare(`
        SELECT id, shop_name, api_partner_id, api_partner_key
        FROM shops
        WHERE platform = 'shopee'
          AND (
            shop_name = ?
            OR user_name = ?
            OR (? != '' AND api_shop_id = ?)
          )
        ORDER BY
          CASE WHEN shop_name = ? THEN 0 ELSE 1 END,
          CASE WHEN user_name = ? THEN 0 ELSE 1 END,
          CASE WHEN shop_name LIKE 'Shopee %' THEN 1 ELSE 0 END,
          id ASC
        LIMIT 1
      `).bind(shopName, shopName, apiShopIdFromName, apiShopIdFromName, shopName, shopName).first()

      if (!existing && !partnerKey) {
        return json({ error: 'Shop mới cần nhập Partner Key' }, cors, 400)
      }

      if (existing) {
        const partnerChanged = existing.api_partner_id && existing.api_partner_id !== partnerId ? 1 : 0
        await env.DB.prepare(`
          UPDATE shops
          SET api_partner_id = ?,
              api_partner_key = CASE WHEN ? != '' THEN ? ELSE api_partner_key END,
              api_redirect_url = ?,
              api_shop_id = CASE WHEN ? THEN NULL ELSE api_shop_id END,
              access_token = CASE WHEN ? THEN NULL ELSE access_token END,
              refresh_token = CASE WHEN ? THEN NULL ELSE refresh_token END,
              token_expire_at = CASE WHEN ? THEN NULL ELSE token_expire_at END,
              api_connected_at = CASE WHEN ? THEN NULL ELSE api_connected_at END,
              api_refresh_expire_at = CASE WHEN ? THEN NULL ELSE api_refresh_expire_at END,
              last_api_refresh_at = CASE WHEN ? THEN NULL ELSE last_api_refresh_at END
          WHERE id = ?
        `).bind(
          partnerId,
          partnerKey,
          partnerKey,
          redirectUrl,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          existing.id
        ).run()
      } else {
        if (isSyntheticShopName(shopName)) {
  return json({
    error: 'Tên shop dạng Shopee <shop_id> là tên tạm. Hãy chọn hoặc tạo shop bằng tên thật trước khi lưu cấu hình API.',
    shop_name: shopName
  }, cors, 400)
}

await env.DB.prepare(`
  INSERT INTO shops (shop_name, platform, user_name, api_partner_id, api_partner_key, api_redirect_url)
  VALUES (?, 'shopee', ?, ?, ?, ?)
`).bind(shopName, shopName, partnerId, partnerKey, redirectUrl).run()
      }

      return json({
        status: 'ok',
        shop_name: shopName,
        partner_id: partnerId,
        connect_url: `${url.origin}/api/auth/shopee/url?shop=${encodeURIComponent(shopName)}`
      }, cors)
    } catch (e) {
      return json({ error: e.message }, cors, 500)
    }
  }

  if (request.method === 'POST' && url.pathname.endsWith('/shopee-video-app-config')) {
    try {
      await ensureShopeeVideoAuthColumns(env)
      const body = await request.json()
      const shopName = cleanShopeeVideoAuthText(body.shop_name || body.shop || body.user_name)
      const partnerId = cleanShopeeVideoAuthText(body.partner_id || body.partnerId)
      const partnerKey = cleanShopeeVideoAuthText(body.partner_key || body.partnerKey)
      const redirectUrl = cleanShopeeVideoAuthText(body.redirect || body.redirect_url || DEFAULT_SHOPEE_VIDEO_CALLBACK)

      if (!shopName || !partnerId) {
        return json({ error: 'Thiếu shop hoặc Partner ID Shopee Video.' }, cors, 400)
      }

      const existing = await env.DB.prepare(`
        SELECT id, video_partner_id, video_partner_key
        FROM shops
        WHERE platform = 'shopee' AND (shop_name = ? OR user_name = ?)
        LIMIT 1
      `).bind(shopName, shopName).first()

      if (!existing && !partnerKey) {
        return json({ error: 'Shop mới cần nhập Partner Key Shopee Video.' }, cors, 400)
      }

      if (existing) {
        const savedVideoKey = cleanShopeeVideoAuthText(existing.video_partner_key)
        const partnerChanged = cleanShopeeVideoAuthText(existing.video_partner_id) && existing.video_partner_id !== partnerId ? 1 : 0
        if (!savedVideoKey && !partnerKey) {
          return json({ error: 'Cần nhập Partner Key Shopee Video trong lần lưu cấu hình video đầu tiên.' }, cors, 400)
        }
        if (partnerChanged && !partnerKey) {
          return json({ error: 'Đổi Partner ID Shopee Video thì phải nhập lại Partner Key để tránh dùng nhầm key cũ.' }, cors, 400)
        }
        await env.DB.prepare(`
          UPDATE shops
          SET video_partner_id = ?,
              video_partner_key = CASE WHEN ? != '' THEN ? ELSE video_partner_key END,
              video_redirect_url = ?,
              video_access_token = CASE WHEN ? THEN '' ELSE video_access_token END,
              video_refresh_token = CASE WHEN ? THEN '' ELSE video_refresh_token END,
              video_token_expire_at = CASE WHEN ? THEN '' ELSE video_token_expire_at END,
              video_api_shop_id = CASE WHEN ? THEN '' ELSE video_api_shop_id END,
              video_api_user_id = CASE WHEN ? THEN '' ELSE video_api_user_id END,
              video_auth_subject_type = CASE WHEN ? THEN '' ELSE video_auth_subject_type END,
              video_api_connected_at = CASE WHEN ? THEN '' ELSE video_api_connected_at END,
              video_api_refresh_expire_at = CASE WHEN ? THEN '' ELSE video_api_refresh_expire_at END,
              video_last_api_refresh_at = CASE WHEN ? THEN '' ELSE video_last_api_refresh_at END,
              video_permission_status = CASE WHEN ? THEN 'untested' ELSE COALESCE(NULLIF(video_permission_status, ''), 'untested') END,
              video_permission_message = CASE WHEN ? THEN 'Đã đổi app Shopee Video, cần kết nối và test quyền lại.' ELSE video_permission_message END,
              video_permission_tested_at = CASE WHEN ? THEN '' ELSE video_permission_tested_at END
          WHERE id = ?
        `).bind(
          partnerId,
          partnerKey,
          partnerKey,
          redirectUrl,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          partnerChanged,
          existing.id
        ).run()
      } else {
        await env.DB.prepare(`
          INSERT INTO shops (
            shop_name, platform, user_name, video_partner_id, video_partner_key,
            video_redirect_url, video_permission_status, video_permission_message
          )
          VALUES (?, 'shopee', ?, ?, ?, ?, 'untested', 'Đã lưu app Shopee Video, cần kết nối và test quyền.')
        `).bind(shopName, shopName, partnerId, partnerKey, redirectUrl).run()
      }

      return json({
        status: 'ok',
        shop_name: shopName,
        partner_id: partnerId,
        connect_url: `${url.origin}/api/auth/shopee/video/url?shop=${encodeURIComponent(shopName)}`,
        test_url: `${url.origin}/api/video/test-permission`
      }, cors)
    } catch (e) {
      return json({ error: e.message }, cors, 500)
    }
  }

  if (request.method === 'POST' && url.pathname.endsWith('/disconnect-api')) {
    try {
      const body = await request.json()
      const shopId = body.shop_id || body.id || null
      const shopName = String(body.shop_name || body.shop || '').trim()

      if (!shopId && !shopName) {
        return json({ error: 'Thiếu shop cần ngắt kết nối' }, cors, 400)
      }

      const sql = `
        UPDATE shops
        SET api_shop_id = NULL,
            access_token = NULL,
            refresh_token = NULL,
            token_expire_at = NULL,
            api_connected_at = NULL,
            api_refresh_expire_at = NULL,
            last_api_refresh_at = NULL
        WHERE ${shopId ? 'id = ?' : "platform = 'shopee' AND (shop_name = ? OR user_name = ?)"}
      `
      const stmt = env.DB.prepare(sql)
      if (shopId) await stmt.bind(shopId).run()
      else await stmt.bind(shopName, shopName).run()

      return json({ status: 'ok', message: 'Đã ngắt kết nối API' }, cors)
    } catch (e) {
      return json({ error: e.message }, cors, 500)
    }
  }

  if (request.method === 'POST' && url.pathname.endsWith('/disconnect-video-api')) {
    try {
      await ensureShopeeVideoAuthColumns(env)
      const body = await request.json()
      const shopId = body.shop_id || body.id || null
      const shopName = cleanShopeeVideoAuthText(body.shop_name || body.shop)

      if (!shopId && !shopName) {
        return json({ error: 'Thiếu shop cần ngắt Shopee Video API.' }, cors, 400)
      }

      const sql = `
        UPDATE shops
        SET video_access_token = '',
            video_refresh_token = '',
            video_token_expire_at = '',
            video_api_shop_id = '',
            video_api_user_id = '',
            video_auth_subject_type = '',
            video_api_connected_at = '',
            video_api_refresh_expire_at = '',
            video_last_api_refresh_at = '',
            video_permission_status = 'untested',
            video_permission_message = 'Đã ngắt token Shopee Video. App ID/Key vẫn được giữ để kết nối lại.',
            video_permission_tested_at = ''
        WHERE ${shopId ? 'id = ?' : "platform = 'shopee' AND (shop_name = ? OR user_name = ?)"}
      `
      const stmt = env.DB.prepare(sql)
      if (shopId) await stmt.bind(shopId).run()
      else await stmt.bind(shopName, shopName).run()

      return json({ status: 'ok', message: 'Đã ngắt riêng Shopee Video API.' }, cors)
    } catch (e) {
      return json({ error: e.message }, cors, 500)
    }
  }

  if (request.method === 'POST' && url.pathname.endsWith('/disconnect-chat-api')) {
    try {
      const body = await request.json()
      const shopId = body.shop_id || body.id || null
      const shopName = String(body.shop_name || body.shop || '').trim()

      if (!shopId && !shopName) {
        return json({ error: 'Thiếu shop cần ngắt kết nối chat API' }, cors, 400)
      }

      /**
       * App chat Lazada đang tách riêng khỏi app đơn hàng/sản phẩm.
       * Vì vậy chỉ được xóa bộ token chat để người vận hành kết nối lại IM Chat,
       * không đụng vào access_token chính của Lazada API.
       */
      const sql = `
        UPDATE shops
        SET chat_access_token = NULL,
            chat_refresh_token = NULL,
            chat_token_expire_at = NULL,
            chat_api_connected_at = NULL,
            chat_api_refresh_expire_at = NULL,
            chat_last_api_refresh_at = NULL,
            chat_api_redirect_url = NULL
        WHERE ${shopId ? 'id = ?' : "platform = 'lazada' AND (shop_name = ? OR user_name = ?)"}
      `
      const stmt = env.DB.prepare(sql)
      if (shopId) await stmt.bind(shopId).run()
      else await stmt.bind(shopName, shopName).run()

      return json({ status: 'ok', message: 'Đã ngắt riêng Lazada Chat API' }, cors)
    } catch (e) {
      return json({ error: e.message }, cors, 500)
    }
  }

  if (request.method === 'POST' && url.pathname.endsWith('/force-refresh-token')) {
    try {
      const body = await request.json()
      const shopId = body.shop_id || body.id || null
      const shopName = String(body.shop_name || body.shop || '').trim()
      let shop = await loadShopeeShop(env, { shopId, shopName })

      if (!shop && body.refresh_token && body.api_shop_id) {
        shop = {
          id: shopId,
          shop_name: shopName,
          refresh_token: body.refresh_token,
          api_shop_id: body.api_shop_id,
          api_partner_id: body.partner_id || body.api_partner_id || null
        }
      }
      if (!shop) {
        return json({ error: 'Không tìm thấy shop để làm mới token' }, cors, 404)
      }

      const result = await refreshShopeeTokenForShop(env, shop)
      return json({
        status: 'ok',
        message: 'Đã làm mới token Shopee thành công',
        partner_id: result.partnerId,
        expire_seconds: result.expireSeconds
      }, cors)
    } catch (e) {
      return json({ error: e.message }, cors, 400)
    }
  }

  if (request.method === 'POST' && url.pathname.endsWith('/force-refresh-video-token')) {
    try {
      const body = await request.json()
      const shopId = body.shop_id || body.id || null
      const shopName = cleanShopeeVideoAuthText(body.shop_name || body.shop)
      const shop = await loadShopeeVideoShop(env, { shopId, shopName })

      if (!shop) {
        return json({ error: 'Không tìm thấy shop để làm mới token Shopee Video.' }, cors, 404)
      }

      const result = await refreshShopeeVideoTokenForShop(env, shop)
      return json({
        status: 'ok',
        message: 'Đã làm mới token Shopee Video thành công.',
        partner_id: result.partnerId,
        expire_seconds: result.expireSeconds
      }, cors)
    } catch (e) {
      return json({ error: e.message }, cors, 400)
    }
  }

  return json({ error: 'Shop route not found' }, cors, 404)
}
