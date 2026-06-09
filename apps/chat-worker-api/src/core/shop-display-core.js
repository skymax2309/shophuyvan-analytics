const DEFAULT_CORE_API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const MISSING_SHOP_NAME = 'Shop chưa đồng bộ tên'

let shopCoreCache = {
  expires_at: 0,
  shops: []
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerText(value) {
  return cleanText(value).toLowerCase()
}

function coreApiBase(env = {}) {
  return cleanText(env.SHOP_CORE_API_BASE || env.SHOPHUYVAN_CORE_API_BASE || DEFAULT_CORE_API_BASE).replace(/\/+$/, '')
}

function isRawShopId(value) {
  return /^\d{6,}$/.test(cleanText(value))
}

function isRawShopDisplayName(value, conversation = {}) {
  const text = cleanText(value)
  if (!text) return true
  const rawShop = cleanText(conversation.shop_id)
  return isRawShopId(text) ||
    /^(shopee|lazada)\s+\d+$/i.test(text) ||
    Boolean(rawShop && text === rawShop)
}

function shopKey(platform, value) {
  return `${lowerText(platform || 'shopee')}|${cleanText(value)}`
}

async function fetchCoreShops(env, platform = 'shopee') {
  const now = Date.now()
  if (shopCoreCache.expires_at > now && shopCoreCache.shops.length) return shopCoreCache.shops
  const url = `${coreApiBase(env)}/api/core/shops?platform=${encodeURIComponent(platform)}&limit=500`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`core_shop_fetch_http_${res.status}`)
  const data = await res.json()
  const shops = Array.isArray(data?.shops) ? data.shops : []
  shopCoreCache = {
    expires_at: now + 60_000,
    shops
  }
  return shops
}

function buildShopIndex(shops = []) {
  const map = new Map()
  for (const shop of shops || []) {
    const platform = lowerText(shop.platform || 'shopee')
    for (const value of [
      shop.shop_id,
      shop.api_shop_id,
      shop.shop_name,
      shop.configured_alias,
      shop.user_name,
      shop.shop_display_name
    ]) {
      const key = shopKey(platform, value)
      if (key.endsWith('|')) continue
      if (!map.has(key)) map.set(key, shop)
    }
  }
  return map
}

function missingDisplay(conversation = {}) {
  const rawShop = cleanText(conversation.shop_id)
  if (lowerText(conversation.channel) === 'shopee' && isRawShopId(rawShop)) {
    return {
      ...conversation,
      shop_display_name: MISSING_SHOP_NAME,
      shop_name_source: 'missing',
      shop_name_missing: true
    }
  }
  return {
    ...conversation,
    shop_display_name: rawShop || MISSING_SHOP_NAME,
    shop_name_source: rawShop ? 'manual' : 'missing',
    shop_name_missing: !rawShop
  }
}

function mergeShopDisplay(conversation = {}, shop = null) {
  if (!shop) return missingDisplay(conversation)
  const displayName = cleanText(shop.shop_display_name)
  if (!displayName || shop.shop_name_missing || isRawShopDisplayName(displayName, conversation)) return missingDisplay(conversation)
  return {
    ...conversation,
    shop_display_name: displayName,
    shop_name_source: cleanText(shop.shop_name_source || 'shop_core'),
    shop_name_missing: false,
    shop_profile_source: cleanText(shop.shop_profile_source || shop.source || 'shop_core')
  }
}

export async function enrichConversationsWithShopDisplay(env, conversations = []) {
  const rows = Array.isArray(conversations) ? conversations : []
  const shopeeRows = rows.filter(item => lowerText(item.channel) === 'shopee')
  if (!shopeeRows.length) return rows
  try {
    // Chat Worker chỉ đọc Shop Core qua endpoint chung, không giữ tên shop riêng.
    const shops = await fetchCoreShops(env, 'shopee')
    const index = buildShopIndex(shops)
    return rows.map(item => {
      if (lowerText(item.channel) !== 'shopee') return item
      const shop = index.get(shopKey('shopee', item.shop_id)) || null
      return mergeShopDisplay(item, shop)
    })
  } catch (error) {
    return rows.map(item => lowerText(item.channel) === 'shopee' ? missingDisplay(item) : item)
  }
}
