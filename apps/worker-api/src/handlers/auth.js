import { buildShopeeCallbackUrl, getShopeeAppForShop, signHmacHex } from '../utils/shopee-apps.js'
import {
  DEFAULT_SHOPEE_VIDEO_CALLBACK,
  buildShopeeVideoCallbackUrl,
  cleanShopeeVideoAuthText,
  ensureShopeeVideoAuthColumns,
  getShopeeVideoAppFromRow
} from '../core/shopee-video-auth-core.js'

async function signHMAC(keyStr, message) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function firstShopeeAuthId(value) {
  const raw = Array.isArray(value) ? value.find(item => cleanText(item)) : value
  return cleanText(raw)
}

function buildShopeeVideoSuccessUrl(shopName = '') {
  const success = new URL(VIDEO_SUCCESS_URL)
  success.searchParams.set('api_status', 'success')
  success.searchParams.set('shopee_video', 'success')
  success.searchParams.set('apiSection', 'video')
  if (cleanText(shopName)) success.searchParams.set('apiShop', cleanText(shopName))
  return success.toString()
}

const SHOPEE = {
  PID: 2013730,
  KEY: 'shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d',
  REDIRECT: 'https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/shopee/callback'
}

const LAZADA_MAIN = {
  APP_KEY: '135731',
  SECRET: 'UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK',
  REDIRECT: 'https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/lazada/callback'
}

const LAZADA_CHAT_DEFAULT_REDIRECT = 'https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/lazada/chat/callback'
const OMS_SUCCESS_URL = 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?api_status=success'
const CHAT_SUCCESS_URL = 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-marketplace.html?api_status=success&lazada_chat=success'
const VIDEO_SUCCESS_URL = 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html'

function isShopeeCallbackPath(pathname) {
  return [
    '/channels/shopee/callback',
    '/channels/shopee/ads/callback',
    '/api/auth/shopee/callback',
    '/api/ads/shopee/callback'
  ].includes(pathname)
}

async function ensureShopeeIdentityColumns(env) {
  try {
    await env.DB.prepare(`ALTER TABLE shops ADD COLUMN api_user_id TEXT DEFAULT NULL`).run()
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('duplicate column name')) throw error
  }
}

async function addShopColumnIfMissing(env, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE shops ADD COLUMN ${definition}`).run()
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
  }
}

async function ensureLazadaChatColumns(env) {
  // Luồng Lazada chat dùng app riêng nên phải có bộ cột riêng, tránh ghi đè token order/product cũ.
  await addShopColumnIfMissing(env, "chat_access_token TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "chat_refresh_token TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "chat_token_expire_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "chat_api_connected_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "chat_api_refresh_expire_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "chat_last_api_refresh_at TEXT DEFAULT ''")
  await addShopColumnIfMissing(env, "chat_api_redirect_url TEXT DEFAULT ''")
}

function lazadaMainConfig(env) {
  return {
    label: 'Lazada API chính',
    mode: 'main',
    appKey: cleanText(env.LAZADA_APP_KEY || LAZADA_MAIN.APP_KEY),
    secret: cleanText(env.LAZADA_SECRET || LAZADA_MAIN.SECRET),
    redirect: cleanText(env.LAZADA_REDIRECT || LAZADA_MAIN.REDIRECT) || LAZADA_MAIN.REDIRECT,
    successUrl: OMS_SUCCESS_URL
  }
}

function lazadaChatConfig(env) {
  return {
    label: 'Lazada IM Chat',
    mode: 'chat',
    appKey: cleanText(env.LAZADA_CHAT_APP_KEY),
    secret: cleanText(env.LAZADA_CHAT_SECRET),
    redirect: cleanText(env.LAZADA_CHAT_REDIRECT || LAZADA_CHAT_DEFAULT_REDIRECT) || LAZADA_CHAT_DEFAULT_REDIRECT,
    successUrl: CHAT_SUCCESS_URL
  }
}

function lazadaConfigMissingFields(config) {
  const missing = []
  if (!cleanText(config?.appKey)) missing.push('app_key')
  if (!cleanText(config?.secret)) missing.push('secret')
  if (!cleanText(config?.redirect)) missing.push('redirect')
  return missing
}

function missingLazadaConfigResponse(config) {
  const missing = lazadaConfigMissingFields(config)
  return Response.json({
    error: 'missing_lazada_app_config',
    message: `${config.label} chưa đủ cấu hình để tạo link ủy quyền.`,
    missing_fields: missing,
    expected_callback: config.redirect || ''
  }, { status: 409 })
}

async function exchangeLazadaToken(config, code) {
  const apiPath = '/auth/token/create'
  const params = {
    app_key: config.appKey,
    timestamp: Date.now().toString(),
    sign_method: 'sha256',
    code
  }
  let signString = apiPath
  for (const key of Object.keys(params).sort()) {
    signString += `${key}${params[key]}`
  }
  const sign = (await signHMAC(config.secret, signString)).toUpperCase()
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    query.append(key, value)
  }
  query.append('sign', sign)
  const res = await fetch(`https://auth.lazada.com/rest${apiPath}?${query.toString()}`, { method: 'POST' })
  const rawText = await res.text().catch(() => '')
  let data = {}
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { message: rawText.slice(0, 500) }
    }
  }
  if (!res.ok) {
    throw new Error(cleanText(data?.message || data?.error) || `Lazada trả HTTP ${res.status} khi đổi token.`)
  }
  if (!data?.access_token) {
    throw new Error(cleanText(data?.message || data?.error) || 'Lazada không trả access_token.')
  }
  return data
}

async function findLazadaShop(env, sellerId, accountEmail) {
  const sellerValue = cleanText(sellerId)
  const accountValue = cleanText(accountEmail)
  const clauses = []
  const params = []
  if (sellerValue) {
    clauses.push('api_shop_id = ?')
    params.push(sellerValue)
  }
  if (accountValue) {
    clauses.push('user_name = ?')
    params.push(accountValue)
    clauses.push('shop_name = ?')
    params.push(`Lazada ${accountValue}`)
  }
  if (!params.length) return null
  return env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id
    FROM shops
    WHERE platform = 'lazada' AND (${clauses.join(' OR ')})
    ORDER BY CASE WHEN api_shop_id = ? THEN 0 ELSE 1 END,
             CASE WHEN user_name = ? THEN 0 ELSE 1 END,
             id DESC
    LIMIT 1
  `).bind(...params, sellerValue, accountValue).first().catch(() => null)
}

async function saveLazadaMainToken(env, payload) {
  const {
    sellerId,
    accountEmail,
    accessToken,
    refreshToken,
    expireAt,
    refreshExpireAt,
    redirect
  } = payload
  const existing = await findLazadaShop(env, sellerId, accountEmail)
  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE shops
      SET api_shop_id = ?,
          user_name = COALESCE(NULLIF(user_name, ''), ?),
          shop_name = COALESCE(NULLIF(shop_name, ''), ?),
          access_token = ?,
          refresh_token = ?,
          token_expire_at = ?,
          api_redirect_url = ?,
          api_connected_at = datetime('now'),
          api_refresh_expire_at = ?,
          last_api_refresh_at = datetime('now')
      WHERE id = ?
    `).bind(
      sellerId,
      accountEmail,
      `Lazada ${accountEmail}`,
      accessToken,
      refreshToken,
      expireAt,
      redirect,
      refreshExpireAt,
      existing.id
    ).run()
    return existing.id
  }

  const result = await env.DB.prepare(`
    INSERT INTO shops (
      shop_name,
      platform,
      user_name,
      api_shop_id,
      access_token,
      refresh_token,
      token_expire_at,
      api_redirect_url,
      api_connected_at,
      api_refresh_expire_at,
      last_api_refresh_at
    )
    VALUES (?, 'lazada', ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
  `).bind(
    `Lazada ${accountEmail}`,
    accountEmail,
    sellerId,
    accessToken,
    refreshToken,
    expireAt,
    redirect,
    refreshExpireAt
  ).run()
  return result?.meta?.last_row_id || null
}

async function saveLazadaChatToken(env, payload) {
  await ensureLazadaChatColumns(env)
  const {
    sellerId,
    accountEmail,
    accessToken,
    refreshToken,
    expireAt,
    refreshExpireAt,
    redirect
  } = payload
  const existing = await findLazadaShop(env, sellerId, accountEmail)
  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE shops
      SET api_shop_id = ?,
          user_name = COALESCE(NULLIF(user_name, ''), ?),
          shop_name = COALESCE(NULLIF(shop_name, ''), ?),
          chat_access_token = ?,
          chat_refresh_token = ?,
          chat_token_expire_at = ?,
          chat_api_redirect_url = ?,
          chat_api_connected_at = datetime('now'),
          chat_api_refresh_expire_at = ?,
          chat_last_api_refresh_at = datetime('now')
      WHERE id = ?
    `).bind(
      sellerId,
      accountEmail,
      `Lazada ${accountEmail}`,
      accessToken,
      refreshToken,
      expireAt,
      redirect,
      refreshExpireAt,
      existing.id
    ).run()
    return existing.id
  }

  const result = await env.DB.prepare(`
    INSERT INTO shops (
      shop_name,
      platform,
      user_name,
      api_shop_id,
      chat_access_token,
      chat_refresh_token,
      chat_token_expire_at,
      chat_api_redirect_url,
      chat_api_connected_at,
      chat_api_refresh_expire_at,
      chat_last_api_refresh_at
    )
    VALUES (?, 'lazada', ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
  `).bind(
    `Lazada ${accountEmail}`,
    accountEmail,
    sellerId,
    accessToken,
    refreshToken,
    expireAt,
    redirect,
    refreshExpireAt
  ).run()
  return result?.meta?.last_row_id || null
}

async function handleLazadaCallback(env, url, config) {
  const missing = lazadaConfigMissingFields(config)
  if (missing.length) return missingLazadaConfigResponse(config)

  const code = cleanText(url.searchParams.get('code'))
  if (!code) {
    return new Response(`Thiếu mã code từ ${config.label}`, { status: 400 })
  }

  try {
    const data = await exchangeLazadaToken(config, code)
    const sellerId = cleanText(data?.country_user_info?.[0]?.seller_id || data?.seller_id || data?.account_platform_id || data?.account)
    const accountEmail = cleanText(data?.account || data?.country_user_info?.[0]?.seller_email || sellerId)
    const expireSeconds = Number(data.expires_in || 86400)
    const refreshExpireSeconds = Number(data.refresh_expires_in || 30 * 24 * 60 * 60)
    const expireAt = new Date(Date.now() + expireSeconds * 1000).toISOString()
    const refreshExpireAt = new Date(Date.now() + refreshExpireSeconds * 1000).toISOString()
    const payload = {
      sellerId,
      accountEmail,
      accessToken: data.access_token,
      refreshToken: cleanText(data.refresh_token),
      expireAt,
      refreshExpireAt,
      redirect: config.redirect
    }

    if (config.mode === 'chat') {
      await saveLazadaChatToken(env, payload)
    } else {
      await saveLazadaMainToken(env, payload)
    }

    return Response.redirect(config.successUrl, 302)
  } catch (error) {
    console.error(`[AUTH-LOG] ${config.label} callback lỗi:`, error?.stack || error)
    return new Response(`Lỗi ${config.label}: ${cleanText(error?.message) || 'Không rõ nguyên nhân'}`, { status: 500 })
  }
}

async function loadShopeeVideoAuthShop(env, hint = '') {
  await ensureShopeeVideoAuthColumns(env)
  const value = cleanShopeeVideoAuthText(hint)
  if (!value) return null
  return env.DB.prepare(`
    SELECT id, shop_name, user_name, api_shop_id,
           video_partner_id, video_partner_key, video_redirect_url,
           video_api_shop_id, video_api_user_id, video_auth_subject_type
    FROM shops
    WHERE platform = 'shopee'
      AND (shop_name = ? OR user_name = ? OR api_shop_id = ? OR video_api_shop_id = ? OR video_api_user_id = ?)
    ORDER BY CASE WHEN shop_name = ? OR user_name = ? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `).bind(value, value, value, value, value, value, value).first()
}

function missingShopeeVideoConfigResponse(shopName = '') {
  return Response.json({
    error: 'missing_shopee_video_app_config',
    message: 'Shop chưa lưu Partner ID/Key riêng cho Shopee Video.',
    shop: cleanShopeeVideoAuthText(shopName),
    expected_callback: DEFAULT_SHOPEE_VIDEO_CALLBACK
  }, { status: 409 })
}

async function handleShopeeVideoCallback(env, url) {
  await ensureShopeeVideoAuthColumns(env)
  const code = cleanText(url.searchParams.get('code'))
  const shopId = cleanText(url.searchParams.get('shop_id'))
  const mainAccountId = cleanText(url.searchParams.get('main_account_id'))
  const localShop = cleanText(url.searchParams.get('shop'))

  if (!code || (!shopId && !mainAccountId)) {
    return Response.json({
      error: 'Missing Shopee Video code or shop_id/main_account_id',
      shop_id: shopId,
      main_account_id: mainAccountId
    }, { status: 400 })
  }

  const appRow = await loadShopeeVideoAuthShop(env, localShop || shopId || mainAccountId)
  const app = getShopeeVideoAppFromRow(appRow)
  if (!app) return missingShopeeVideoConfigResponse(localShop || shopId || mainAccountId)

  const path = '/api/v2/auth/token/get'
  const timestamp = Math.floor(Date.now() / 1000)
  const baseString = `${app.partnerId}${path}${timestamp}`
  const sign = await signHmacHex(app.partnerKey, baseString)
  const tokenBody = { code, partner_id: Number(app.partnerId) }
  if (shopId) tokenBody.shop_id = Number(shopId)
  if (mainAccountId) tokenBody.main_account_id = Number(mainAccountId)

  const res = await fetch(`https://partner.shopeemobile.com${path}?partner_id=${app.partnerId}&timestamp=${timestamp}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokenBody)
  })
  const data = await res.json()

  if (!data.access_token) {
    return Response.json({ error: 'Lỗi đổi token Shopee Video', detail: data }, { status: 400 })
  }

  const expireAt = new Date(Date.now() + Number(data.expire_in || 14400) * 1000).toISOString()
  const refreshExpireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const refreshToken = cleanText(data.refresh_token)
  const returnedShopId = firstShopeeAuthId(data.shop_id || data.shop_id_list) || shopId
  const returnedUserId = firstShopeeAuthId(data.user_id || data.user_id_list)
  const videoUserId = returnedUserId
  const subjectType = returnedUserId ? 'user' : (returnedShopId ? 'shop' : 'main_account')
  const permissionStatus = returnedUserId ? 'untested' : 'needs_user_id'
  const permissionMessage = returnedUserId
    ? 'Đã kết nối Shopee Video API. Cần bấm Test quyền video trước khi đồng bộ.'
    : 'Đã kết nối token Shopee Video nhưng Shopee chưa trả user_id. Video API là User API, cần kết nối bằng tài khoản có quyền video/user rồi test lại.'
  let existing = appRow

  if (!existing?.id) {
    existing = await env.DB.prepare(`
      SELECT id FROM shops
      WHERE platform = 'shopee'
        AND (api_shop_id = ? OR user_name = ? OR shop_name = ?)
      ORDER BY id DESC
      LIMIT 1
    `).bind(shopId || mainAccountId, localShop || mainAccountId || shopId, localShop || '').first()
  }

  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE shops
      SET video_api_shop_id = ?,
          video_api_user_id = ?,
          video_auth_subject_type = ?,
          video_partner_id = ?,
          video_redirect_url = ?,
          video_access_token = ?,
          video_refresh_token = ?,
          video_token_expire_at = ?,
          video_api_connected_at = datetime('now'),
          video_api_refresh_expire_at = ?,
          video_last_api_refresh_at = datetime('now'),
          video_permission_status = ?,
          video_permission_message = ?,
          video_permission_tested_at = ''
      WHERE id = ?
    `).bind(
      returnedShopId,
      videoUserId,
      subjectType,
      app.partnerId,
      app.redirect,
      data.access_token,
      refreshToken,
      expireAt,
      refreshExpireAt,
      permissionStatus,
      permissionMessage,
      existing.id
    ).run()
  } else {
    const accountId = returnedUserId || returnedShopId || mainAccountId
    await env.DB.prepare(`
      INSERT INTO shops (
        shop_name,
        platform,
        user_name,
        video_api_shop_id,
        video_api_user_id,
        video_auth_subject_type,
        video_partner_id,
        video_redirect_url,
        video_access_token,
        video_refresh_token,
        video_token_expire_at,
        video_api_connected_at,
        video_api_refresh_expire_at,
        video_last_api_refresh_at,
        video_permission_status,
        video_permission_message
      )
      VALUES (?, 'shopee', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'), ?, ?)
    `).bind(
      localShop || `Shopee Video ${accountId}`,
      localShop || accountId,
      returnedShopId,
      videoUserId,
      subjectType,
      app.partnerId,
      app.redirect,
      data.access_token,
      refreshToken,
      expireAt,
      refreshExpireAt,
      permissionStatus,
      permissionMessage
    ).run()
  }

  return Response.redirect(buildShopeeVideoSuccessUrl(localShop || appRow?.shop_name || appRow?.user_name || returnedShopId || returnedUserId), 302)
}

export async function handleAuth(request, env, url) {
  console.log(`[AUTH-LOG] Đang xử lý route: ${url.pathname}`)

  if (url.pathname === '/api/auth/shopee/video/url') {
    await ensureShopeeVideoAuthColumns(env)
    const path = '/api/v2/shop/auth_partner'
    const timestamp = Math.floor(Date.now() / 1000)
    const localShop = cleanText(url.searchParams.get('shop'))
    const row = await loadShopeeVideoAuthShop(env, localShop)
    const app = getShopeeVideoAppFromRow(row)
    if (!app) return missingShopeeVideoConfigResponse(localShop)
    const baseString = `${app.partnerId}${path}${timestamp}`
    const sign = await signHmacHex(app.partnerKey, baseString)
    const callbackUrl = buildShopeeVideoCallbackUrl(app.redirect, localShop)
    const redirectUrl = `https://partner.shopeemobile.com${path}?partner_id=${app.partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(callbackUrl)}`
    return Response.redirect(redirectUrl, 302)
  }

  if (url.pathname === '/api/auth/shopee/url') {
    const path = '/api/v2/shop/auth_partner'
    const timestamp = Math.floor(Date.now() / 1000)
    const localShop = cleanText(url.searchParams.get('shop'))
    const app = await getShopeeAppForShop(env, env.DB, localShop)
    const partnerId = String(app.partnerId).trim()
    const partnerKey = String(app.partnerKey).trim()
    const baseString = `${partnerId}${path}${timestamp}`
    const sign = await signHmacHex(partnerKey, baseString)
    const callbackUrl = buildShopeeCallbackUrl(app.redirect, localShop)
    const redirectUrl = `https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(callbackUrl)}`
    return Response.redirect(redirectUrl, 302)
  }

  if (url.pathname === '/api/auth/lazada/url') {
    const config = lazadaMainConfig(env)
    if (lazadaConfigMissingFields(config).length) return missingLazadaConfigResponse(config)
    const redirectUrl = `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(config.redirect)}&client_id=${encodeURIComponent(config.appKey)}`
    return Response.redirect(redirectUrl, 302)
  }

  if (url.pathname === '/api/auth/lazada/chat/url') {
    const config = lazadaChatConfig(env)
    if (lazadaConfigMissingFields(config).length) return missingLazadaConfigResponse(config)
    const redirectUrl = `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(config.redirect)}&client_id=${encodeURIComponent(config.appKey)}`
    return Response.redirect(redirectUrl, 302)
  }

  if (url.pathname === '/channels/shopee/video/callback') {
    return handleShopeeVideoCallback(env, url)
  }

  if (isShopeeCallbackPath(url.pathname)) {
    await ensureShopeeIdentityColumns(env)
    const code = cleanText(url.searchParams.get('code'))
    const shopId = cleanText(url.searchParams.get('shop_id'))
    const mainAccountId = cleanText(url.searchParams.get('main_account_id'))
    const accountId = shopId || mainAccountId
    const localShop = cleanText(url.searchParams.get('shop'))

    if (!code || !accountId) {
      return Response.json({ error: 'Missing Shopee code or shop_id/main_account_id', shop_id: shopId, main_account_id: mainAccountId }, { status: 400 })
    }

    const path = '/api/v2/auth/token/get'
    const timestamp = Math.floor(Date.now() / 1000)
    const app = await getShopeeAppForShop(env, env.DB, localShop || accountId)
    const partnerId = String(app.partnerId).trim()
    const partnerKey = String(app.partnerKey).trim()
    const baseString = `${partnerId}${path}${timestamp}`
    const sign = await signHmacHex(partnerKey, baseString)
    const tokenBody = { code, partner_id: Number(partnerId) }
    if (shopId) tokenBody.shop_id = Number(shopId)
    if (mainAccountId) tokenBody.main_account_id = Number(mainAccountId)

    const res = await fetch(`https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenBody)
    })
    const data = await res.json()

    if (!data.access_token) {
      return Response.json({ error: 'Lỗi đúc token Shopee', detail: data })
    }

    const expireAt = new Date(Date.now() + Number(data.expire_in || 14400) * 1000).toISOString()
    const refreshExpireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    let existing = null
    if (localShop) {
      existing = await env.DB.prepare(`
        SELECT id FROM shops
        WHERE platform = 'shopee' AND (shop_name = ? OR user_name = ?)
      `).bind(localShop, localShop).first()
    }
    if (!existing) {
      existing = await env.DB.prepare(`
        SELECT id FROM shops
        WHERE platform = 'shopee' AND (api_shop_id = ? OR user_name = ?)
        ORDER BY CASE WHEN shop_name LIKE 'Shopee %' AND (user_name = api_shop_id OR user_name = ?) THEN 1 ELSE 0 END, id
        LIMIT 1
      `).bind(accountId, accountId, accountId).first()
    }

    if (existing?.id) {
      await env.DB.prepare(`
        UPDATE shops
        SET api_shop_id = ?,
            api_user_id = ?,
            api_partner_id = ?,
            api_redirect_url = ?,
            access_token = ?,
            refresh_token = ?,
            token_expire_at = ?,
            api_connected_at = datetime('now'),
            api_refresh_expire_at = ?,
            last_api_refresh_at = datetime('now')
        WHERE id = ?
      `).bind(
        accountId,
        mainAccountId || accountId,
        partnerId,
        app.redirect,
        data.access_token,
        data.refresh_token,
        expireAt,
        refreshExpireAt,
        existing.id
      ).run()
    } else {
      await env.DB.prepare(`
        INSERT INTO shops (
          shop_name,
          platform,
          user_name,
          api_shop_id,
          api_user_id,
          api_partner_id,
          api_redirect_url,
          access_token,
          refresh_token,
          token_expire_at,
          api_connected_at,
          api_refresh_expire_at,
          last_api_refresh_at
        )
        VALUES (?, 'shopee', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
      `).bind(
        `Shopee ${accountId}`,
        accountId,
        accountId,
        mainAccountId || accountId,
        partnerId,
        app.redirect,
        data.access_token,
        data.refresh_token,
        expireAt,
        refreshExpireAt
      ).run()
    }

    const successUrl = url.pathname.includes('/ads/') || url.searchParams.get('target') === 'ads'
      ? 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/profit-dashboard.html?api_status=success#ads'
      : OMS_SUCCESS_URL
    return Response.redirect(successUrl, 302)
  }

  if (url.pathname === '/channels/lazada/callback') {
    return handleLazadaCallback(env, url, lazadaMainConfig(env))
  }

  if (url.pathname === '/channels/lazada/chat/callback') {
    return handleLazadaCallback(env, url, lazadaChatConfig(env))
  }

  return new Response('Auth Route Not Found', { status: 404 })
}
