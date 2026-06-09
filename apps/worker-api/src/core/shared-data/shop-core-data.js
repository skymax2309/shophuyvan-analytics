import { listMarketplaceShopCapabilities } from '../marketplace/shop-capability-core.js'
import { listShopCoreProfiles } from '../shops/shopee-profile-core.js'

function cleanCoreText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerCoreText(value) {
  return cleanCoreText(value).toLowerCase()
}

async function tableExists(env, tableName) {
  const row = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).bind(tableName).first()
  return Boolean(row?.name)
}

async function tableColumnSet(env, tableName) {
  if (!await tableExists(env, tableName)) return new Set()
  const { results } = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all()
  return new Set((results || []).map(row => cleanCoreText(row.name)))
}

async function safeGroupCounts(env, tableName, whereSql = '1=1', params = []) {
  const columns = await tableColumnSet(env, tableName)
  if (!columns.size) return new Map()
  const lastCandidates = ['updated_at', 'created_at', 'snapshot_at', 'order_date']
    .filter(column => columns.has(column))
  const lastAtSql = lastCandidates.length ? `MAX(COALESCE(${lastCandidates.join(', ')}, ''))` : `''`
  const { results } = await env.DB.prepare(`
    SELECT LOWER(COALESCE(platform, '')) AS platform,
           COALESCE(shop, '') AS shop,
           COUNT(*) AS total,
           ${lastAtSql} AS last_at
    FROM ${tableName}
    WHERE ${whereSql}
    GROUP BY LOWER(COALESCE(platform, '')), COALESCE(shop, '')
  `).bind(...params).all()
  const map = new Map()
  for (const row of results || []) {
    map.set(shopCountKey(row.platform, row.shop), {
      total: Number(row.total || 0),
      last_at: cleanCoreText(row.last_at)
    })
  }
  return map
}

function firstCoreText(...values) {
  for (const value of values) {
    const text = cleanCoreText(value)
    if (text) return text
  }
  return ''
}

function isRawShopDisplayName(value, row = {}) {
  const text = cleanCoreText(value)
  if (!text) return true
  const lower = text.toLowerCase()
  const apiShopId = cleanCoreText(row.api_shop_id)
  return /^\d{6,}$/.test(text) ||
    /^(shopee|lazada)\s+\d+$/i.test(text) ||
    Boolean(apiShopId && text === apiShopId) ||
    Boolean(row.id && text === cleanCoreText(row.id)) ||
    lower === 'null' ||
    lower === 'undefined'
}

function maxIsoText(...values) {
  let best = ''
  let bestTime = 0
  for (const value of values) {
    const text = cleanCoreText(value)
    if (!text) continue
    const time = Date.parse(text.includes('T') ? text : text.replace(' ', 'T'))
    if (!Number.isFinite(time)) {
      if (!best) best = text
      continue
    }
    if (time >= bestTime) {
      bestTime = time
      best = text
    }
  }
  return best
}

function shopCountKey(platform, shop) {
  return `${lowerCoreText(platform)}|${lowerCoreText(shop)}`
}

function lookupShopCount(map, capability = {}) {
  const platform = lowerCoreText(capability.platform)
  for (const value of [capability.shop_name, capability.user_name, capability.api_shop_id, capability.id]) {
    const key = shopCountKey(platform, value)
    if (map.has(key)) return map.get(key)
  }
  return { total: 0, last_at: '' }
}

function sourceBadge(source, confidence = '') {
  const src = lowerCoreText(source)
  const conf = lowerCoreText(confidence)
  if (src.includes('api')) return 'API'
  if (src.includes('seller_center') || src.includes('snapshot') || src.includes('d1') || src.includes('product master') || conf === 'confirmed' || conf === 'snapshot' || conf === 'observed' || conf === 'observed_zero') return 'Snapshot'
  if (src.includes('cost') || src.includes('manual') || src.includes('import') || conf === 'fallback') return 'Fallback'
  if (src.includes('estimate') || conf === 'estimated') return 'Estimated'
  return 'Missing'
}

function profileKey(platform, shopId) {
  return `${lowerCoreText(platform)}|${cleanCoreText(shopId)}`
}

function resolveShopDisplay(row = {}, profile = {}) {
  const officialName = cleanCoreText(profile?.shop_display_name)
  if (officialName && !isRawShopDisplayName(officialName, row)) {
    return {
      shop_display_name: officialName,
      shop_name_source: cleanCoreText(profile.shop_name_source) || 'shopee_shop_api',
      shop_profile_source: cleanCoreText(profile.shop_profile_source) || 'api',
      shop_name_missing: false,
      profile_source: cleanCoreText(profile.source) || 'API',
      profile_confidence: cleanCoreText(profile.confidence) || 'confirmed',
      profile_updated_at: cleanCoreText(profile.updated_at),
      shop_logo: cleanCoreText(profile.shop_logo),
      shop_region: cleanCoreText(profile.region),
      shop_profile_status: cleanCoreText(profile.status)
    }
  }

  const alias = [row.shop_name, row.user_name].map(cleanCoreText).find(value => !isRawShopDisplayName(value, row))
  if (alias) {
    return {
      shop_display_name: alias,
      shop_name_source: row.capability_mode === 'api_active' ? 'configured_alias' : 'manual',
      shop_profile_source: row.capability_mode === 'api_active' ? 'shop_core_snapshot_missing' : 'manual',
      shop_name_missing: false,
      profile_source: row.capability_mode === 'api_active' ? 'Snapshot' : 'Fallback',
      profile_confidence: row.capability_mode === 'api_active' ? 'snapshot' : 'fallback',
      profile_updated_at: ''
    }
  }

  const identifier = firstCoreText(row.shop_name, row.user_name, row.api_shop_id, row.id)
  const fallbackName = identifier ? `${lowerCoreText(row.platform) || 'shop'} ${identifier}` : 'Shop chua dong bo ten'
  return {
    shop_display_name: fallbackName,
    shop_name_source: identifier ? 'shop_identifier_fallback' : 'missing',
    shop_profile_source: identifier ? 'operator_identifier' : 'missing',
    shop_name_missing: true,
    profile_source: identifier ? 'Identifier' : 'Missing',
    profile_confidence: identifier ? 'fallback' : 'missing',
    profile_updated_at: ''
  }
}

function chatCapabilityFromShop(row = {}) {
  const hasChatToken = Number(row.has_chat_access_token || 0) === 1
  if (hasChatToken) {
    return {
      shop_chat_mode: 'api',
      send_capability: 'official_api',
      sync_capability: row.realtime_active ? 'webhook' : 'polling_api'
    }
  }
  if (row.capability_mode === 'api_active' && Number(row.has_access_token || 0) === 1) {
    return {
      shop_chat_mode: 'api',
      send_capability: 'bridge',
      sync_capability: row.realtime_active ? 'webhook' : 'polling_api'
    }
  }
  return {
    shop_chat_mode: 'manual',
    send_capability: 'manual_only',
    sync_capability: 'manual_import'
  }
}

function productCapabilityFromShop(row = {}) {
  if (row.capability_mode === 'api_active' && row.supports_product_sync) return 'api_snapshot'
  if (row.capability_mode === 'api_needs_auth') return 'await_api_auth'
  return 'manual_import'
}

function orderCapabilityFromShop(row = {}) {
  if (row.capability_mode === 'api_active') return row.realtime_active ? 'webhook_plus_polling' : 'api_sync'
  if (row.capability_mode === 'api_needs_auth') return 'await_api_auth'
  return 'manual_import'
}

function financeCapabilityFromShop(row = {}) {
  if (row.capability_mode === 'api_active') return 'api_snapshot'
  if (row.capability_mode === 'api_needs_auth') return 'await_api_auth'
  return 'cost_setting'
}

function coreShopFromCapability(row = {}, counts = {}, profiles = new Map()) {
  const chat = chatCapabilityFromShop(row)
  const orders = lookupShopCount(counts.orders, row)
  const products = lookupShopCount(counts.products, row)
  const productSnapshots = lookupShopCount(counts.productSnapshots, row)
  const fees = lookupShopCount(counts.fees, row)
  const apiActive = row.capability_mode === 'api_active'
  const profile = profiles.get(profileKey(row.platform, row.api_shop_id)) || profiles.get(profileKey(row.platform, row.id)) || null
  const display = resolveShopDisplay(row, profile)
  const lastSyncAt = maxIsoText(
    row.last_order_sync_at,
    row.last_order_status_sync_at,
    row.last_webhook_event_at,
    orders.last_at,
    products.last_at,
    productSnapshots.last_at,
    fees.last_at
  )
  const lastErrorMessage = firstCoreText(
    row.last_order_sync_error,
    row.last_order_status_sync_error,
    row.last_webhook_event_error
  )
  const source = display.profile_source === 'API'
    ? 'API'
    : (apiActive ? 'Shop Core snapshot' : 'manual/import/fallback')
  const confidence = display.profile_confidence === 'confirmed'
    ? 'confirmed'
    : (apiActive ? 'snapshot' : 'fallback')

  return {
    shop_id: firstCoreText(row.api_shop_id, row.shop_name, row.user_name, row.id),
    platform: lowerCoreText(row.platform),
    shop_name: firstCoreText(row.shop_name, row.user_name, row.api_shop_id, row.id),
    user_name: firstCoreText(row.user_name),
    configured_alias: [row.shop_name, row.user_name].map(cleanCoreText).find(value => !isRawShopDisplayName(value, row)) || '',
    api_shop_id: cleanCoreText(row.api_shop_id),
    shop_display_name: display.shop_display_name,
    shop_name_source: display.shop_name_source,
    shop_profile_source: display.shop_profile_source,
    shop_name_missing: display.shop_name_missing,
    shop_logo: display.shop_logo || '',
    shop_region: display.shop_region || '',
    shop_profile_status: display.shop_profile_status || '',
    shop_profile_updated_at: display.profile_updated_at || '',
    api_status: row.capability_mode || 'manual_reference',
    api_capability: apiActive ? 'official_api' : (row.capability_mode === 'api_needs_auth' ? 'await_api_auth' : 'manual_reference'),
    ...chat,
    product_sync_capability: productCapabilityFromShop(row),
    order_sync_capability: orderCapabilityFromShop(row),
    finance_sync_capability: financeCapabilityFromShop(row),
    label_download_mode: row.label_download_mode || 'not_supported',
    label_download_supported: row.label_download_supported === true,
    label_download_source: row.label_download_source || '',
    label_download_reason: row.label_download_reason || '',
    label_download_read_only: row.label_download_read_only === true,
    label_download_requires_manual: row.label_download_requires_manual === true,
    last_sync_at: lastSyncAt,
    last_error_code: lastErrorMessage ? (row.last_order_sync_status || row.last_order_status_sync_status || row.last_webhook_event_status || 'sync_error') : '',
    last_error_message: lastErrorMessage,
    source,
    confidence,
    badge: sourceBadge(source, confidence),
    operator_badge: row.capability_badge || (apiActive ? 'Co API' : 'Shop chua co API'),
    operator_note: row.operator_guide || '',
    counts: {
      orders: orders.total,
      product_variations: products.total,
      product_snapshots: productSnapshots.total,
      fee_snapshots: fees.total
    }
  }
}

async function loadCoreShopCounts(env) {
  const orders = await safeGroupCounts(env, 'orders_v2')
  const products = await safeGroupCounts(env, 'product_variations')
  const productSnapshots = await safeGroupCounts(env, 'marketplace_product_catalog_snapshots')
  const fees = await safeGroupCounts(env, 'order_fee_details')
  return { orders, products, productSnapshots, fees }
}

async function loadCoreShopProfiles(env, rows = [], platform = 'shopee') {
  const shopIds = rows.map(row => cleanCoreText(row.api_shop_id || row.id)).filter(Boolean)
  const profiles = await listShopCoreProfiles(env, { platform, shopIds })
  const map = new Map()
  for (const profile of profiles || []) {
    map.set(profileKey(profile.platform, profile.shop_id), profile)
  }
  return map
}

export function shopTermsFromCoreShop(shop = {}, fallback = '') {
  return [...new Set([
    shop?.shop_id,
    shop?.shop_name,
    shop?.configured_alias,
    shop?.user_name,
    shop?.api_shop_id,
    fallback
  ].map(cleanCoreText).filter(Boolean))]
}

export async function listCoreShops(env, options = {}) {
  const platform = lowerCoreText(options.platform || 'shopee')
  const rows = await listMarketplaceShopCapabilities(env, {
    platform,
    shop: options.shop || options.search,
    limit: options.limit || 200
  })
  const counts = await loadCoreShopCounts(env)
  const profiles = await loadCoreShopProfiles(env, rows, platform)
  return rows.map(row => coreShopFromCapability(row, counts, profiles))
}

export async function getCoreShopSummary(env, shopId, options = {}) {
  const shops = await listCoreShops(env, {
    platform: options.platform || 'shopee',
    shop: shopId,
    limit: 200
  })
  const needle = lowerCoreText(shopId)
  const exact = shops.find(shop => [
    shop.shop_id,
    shop.shop_name,
    shop.shop_display_name,
    shop.configured_alias,
    shop.user_name,
    shop.api_shop_id
  ].map(lowerCoreText).includes(needle)) || shops[0] || null
  return exact
}
