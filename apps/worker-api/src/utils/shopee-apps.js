const DEFAULT_SHOPEE_APP = {
  partnerId: "",
  partnerKey: "",
  redirect: "https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/shopee/callback"
}

function clean(value) {
  return String(value || "").trim()
}

export function normalizeShopKey(value) {
  return clean(value).toLowerCase()
}

function normalizeAppConfig(raw) {
  if (!raw || typeof raw !== "object") return null
  const partnerId = clean(raw.partner_id || raw.partnerId || raw.pid)
  const partnerKey = clean(raw.partner_key || raw.partnerKey || raw.key)
  const redirect = clean(raw.redirect || raw.callback || raw.redirect_url || raw.redirectUrl || DEFAULT_SHOPEE_APP.redirect)
  if (!partnerId || !partnerKey) return null
  return { partnerId, partnerKey, redirect }
}

export function getShopeeAppFromRow(env, row, fallbackHint = "") {
  const fallback = getShopeeApp(env, row?.api_partner_id || fallbackHint)
  const partnerId = clean(row?.api_partner_id)
  const partnerKey = clean(row?.api_partner_key)
  if (!partnerId || !partnerKey) return fallback
  return {
    partnerId,
    partnerKey,
    redirect: clean(row?.api_redirect_url) || fallback.redirect
  }
}

function clientEnvApp(env, clientType) {
  const type = clean(clientType).toLowerCase()
  if (type === 'ads' || type === 'ads_client') {
    return normalizeAppConfig({
      partner_id: env.SHOPEE_ADS_PARTNER_ID,
      partner_key: env.SHOPEE_ADS_PARTNER_KEY,
      redirect: env.SHOPEE_ADS_REDIRECT_URL
    })
  }
  if (type === 'chat' || type === 'chat_client' || type === 'sellerchat') {
    return normalizeAppConfig({
      partner_id: env.SHOPEE_CHAT_PARTNER_ID || env.SHOPEE_MARKETPLACE_PARTNER_ID,
      partner_key: env.SHOPEE_CHAT_PARTNER_KEY || env.SHOPEE_MARKETPLACE_PARTNER_KEY,
      redirect: env.SHOPEE_CHAT_REDIRECT_URL || env.SHOPEE_MARKETPLACE_REDIRECT_URL
    })
  }
  return normalizeAppConfig({
    partner_id: env.SHOPEE_MARKETPLACE_PARTNER_ID,
    partner_key: env.SHOPEE_MARKETPLACE_PARTNER_KEY,
    redirect: env.SHOPEE_MARKETPLACE_REDIRECT_URL
  })
}

export function getShopeeAppFromRowForClient(env, row, clientType = 'marketplace_client', fallbackHint = "") {
  const separated = clientEnvApp(env, clientType)
  if (separated) return separated
  return getShopeeAppFromRow(env, row, fallbackHint)
}

export async function getShopeeAppForShop(env, db, shopOrPartnerId = "") {
  const hint = clean(shopOrPartnerId)
  if (!db || !hint) return getShopeeApp(env, hint)

  try {
    const row = await db.prepare(`
      SELECT shop_name, user_name, api_shop_id, api_partner_id, api_partner_key, api_redirect_url
      FROM shops
      WHERE platform = 'shopee'
        AND (shop_name = ? OR user_name = ? OR api_shop_id = ? OR api_partner_id = ?)
      ORDER BY CASE WHEN shop_name = ? OR user_name = ? THEN 0 ELSE 1 END
      LIMIT 1
    `).bind(hint, hint, hint, hint, hint, hint).first()

    return getShopeeAppFromRow(env, row, hint)
  } catch (error) {
    console.error("[SHOPEE_APPS] Cannot load shop app config:", error.message)
    return getShopeeApp(env, hint)
  }
}

export function parseShopeeApps(env) {
  const apps = {}
  const defaultFromEnv = normalizeAppConfig({
    partner_id: env.SHOPEE_PARTNER_ID,
    partner_key: env.SHOPEE_PARTNER_KEY,
    redirect: env.SHOPEE_REDIRECT
  })
  apps.default = defaultFromEnv || { ...DEFAULT_SHOPEE_APP }

  if (!env.SHOPEE_APPS_JSON) return apps

  try {
    const parsed = JSON.parse(env.SHOPEE_APPS_JSON)
    for (const [key, value] of Object.entries(parsed || {})) {
      const app = normalizeAppConfig(value)
      if (app) apps[normalizeShopKey(key)] = app
    }
  } catch (error) {
    console.error("[SHOPEE_APPS] Invalid SHOPEE_APPS_JSON:", error.message)
  }

  return apps
}

export function getShopeeApp(env, shopOrPartnerId = "") {
  const apps = parseShopeeApps(env)
  const key = normalizeShopKey(shopOrPartnerId)
  if (key && apps[key]) return apps[key]
  if (key) {
    const byPartner = Object.values(apps).find(app => app.partnerId === clean(shopOrPartnerId))
    if (byPartner) return byPartner
  }
  return apps.default
}

export function buildShopeeCallbackUrl(baseUrl, shopName = "") {
  const callback = new URL(baseUrl || DEFAULT_SHOPEE_APP.redirect)
  if (clean(shopName)) callback.searchParams.set("shop", clean(shopName))
  return callback.toString()
}

export async function signHmacHex(keyStr, message) {
  if (!clean(keyStr)) throw new Error("Missing Shopee partner_key. Configure SHOPEE_PARTNER_KEY or shop api_partner_key.")
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(keyStr), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("")
}
