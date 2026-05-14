import { ensureShopeeVideoAuthColumns } from './shopee-video-auth-core.js'
import { ensureShopSyncDiagnosticsColumns } from '../modules/api-sync/sync-diagnostics.js'

/**
 * Core này chuẩn hóa khả năng vận hành sản phẩm theo từng shop/sàn.
 * Mục tiêu là tách rõ luồng shop có API và shop không có API để các route/UI
 * không tự suy đoán rải rác ở nhiều nơi.
 */

function cleanCapabilityText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

async function ensureMarketplaceCapabilityColumns(env) {
  try {
    await env.DB.prepare(`ALTER TABLE shops ADD COLUMN api_user_id TEXT DEFAULT NULL`).run()
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('duplicate column name')) throw error
  }
  await ensureShopeeVideoAuthColumns(env)
  await ensureShopSyncDiagnosticsColumns(env)
}

async function queryMarketplaceShopRows(env, options = {}) {
  const includeSecrets = options.includeSecrets === true
  const secretColumns = includeSecrets
    ? `,
           access_token,
           refresh_token,
           api_partner_key,
           video_partner_key,
           video_access_token,
           video_refresh_token,
           chat_access_token,
           chat_refresh_token`
    : ''
  const { results } = await env.DB.prepare(`
    SELECT id, shop_name, user_name, platform, api_shop_id, api_user_id, api_partner_id, api_redirect_url,
           video_partner_id, video_redirect_url, video_api_shop_id, video_api_user_id,
           video_auth_subject_type, video_token_expire_at, video_api_connected_at,
           video_api_refresh_expire_at, video_last_api_refresh_at,
           video_permission_status, video_permission_message, video_permission_tested_at,
           COALESCE(warehouse_source, 'main') AS warehouse_source,
           CASE WHEN api_partner_key IS NOT NULL AND api_partner_key != '' THEN 1 ELSE 0 END AS has_partner_key,
           CASE WHEN video_partner_key IS NOT NULL AND video_partner_key != '' THEN 1 ELSE 0 END AS has_video_partner_key,
           CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 1 ELSE 0 END AS has_access_token,
           CASE WHEN refresh_token IS NOT NULL AND refresh_token != '' THEN 1 ELSE 0 END AS has_refresh_token,
           CASE WHEN video_access_token IS NOT NULL AND video_access_token != '' THEN 1 ELSE 0 END AS has_video_access_token,
           CASE WHEN video_refresh_token IS NOT NULL AND video_refresh_token != '' THEN 1 ELSE 0 END AS has_video_refresh_token,
           CASE WHEN chat_access_token IS NOT NULL AND chat_access_token != '' THEN 1 ELSE 0 END AS has_chat_access_token,
           CASE WHEN chat_refresh_token IS NOT NULL AND chat_refresh_token != '' THEN 1 ELSE 0 END AS has_chat_refresh_token,
           token_expire_at, api_connected_at, api_refresh_expire_at, last_api_refresh_at,
           chat_token_expire_at, chat_api_connected_at, chat_api_refresh_expire_at, chat_last_api_refresh_at,
           last_order_sync_at, last_order_sync_status, last_order_sync_error,
           last_order_status_sync_at, last_order_status_sync_status, last_order_status_sync_error,
           last_webhook_event_at, last_webhook_event_status, last_webhook_event_error
           ${secretColumns}
    FROM shops
    WHERE LOWER(COALESCE(platform, '')) IN ('shopee', 'lazada', 'tiktok')
    ORDER BY platform, shop_name, id
  `).all()
  return results || []
}

function truthyCapabilityFlag(value) {
  return value === true || value === 1 || value === '1'
}

function parseCapabilityDate(value) {
  const text = cleanCapabilityText(value)
  if (!text) return null
  const normalized = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function isTokenLive(timestamp) {
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

function makeCapabilityIdentity(row = {}) {
  const platform = cleanCapabilityText(row.platform).toLowerCase()
  const apiShopId = cleanCapabilityText(row.api_shop_id)
  const shopName = cleanCapabilityText(row.shop_name || row.shop || row.user_name || row.id)
  return apiShopId ? `${platform}:${apiShopId}` : `${platform}:${shopName.toLowerCase()}`
}

function shopeeCapabilityGuide(mode) {
  if (mode === 'api_active') {
    return 'Shop có API đang hoạt động. Hệ thống ưu tiên đồng bộ catalog, SKU, tồn sàn, giá và audit trực tiếp từ Open Platform.'
  }
  if (mode === 'api_needs_auth') {
    return 'Shop đã có cấu hình App nhưng token chưa dùng được. Cần kết nối hoặc gia hạn API trước khi đồng bộ bài đăng thật.'
  }
  return 'Shop chưa có API. Chỉ nên dùng dữ liệu nội bộ, map SKU, import file hoặc kiểm tra tay. Không gắn nhãn đồng bộ API cho shop này.'
}

function lazadaCapabilityGuide(mode) {
  if (mode === 'api_active') {
    return 'Shop có API đang hoạt động. Hệ thống ưu tiên đồng bộ catalog, SKU, giá và tồn sàn từ Lazada Open Platform.'
  }
  if (mode === 'api_needs_auth') {
    return 'Shop đã có dấu hiệu cấu hình API nhưng token chưa sẵn sàng. Cần kết nối hoặc gia hạn lại Lazada API trước khi đồng bộ.'
  }
  return 'Shop chưa có API. Chỉ nên dùng dữ liệu tham chiếu, file import hoặc thao tác tay có log. Không tự động đồng bộ bài đăng từ Lazada API.'
}

function tiktokCapabilityGuide() {
  return 'TikTok hiện chưa có core sản phẩm API hoàn chỉnh trong OMS. Tạm thời chỉ nên đi theo luồng tham chiếu, import file hoặc browser hỗ trợ có kiểm soát.'
}

function buildCapabilityMetadata(platform) {
  if (platform === 'shopee') {
    return {
      supports_product_catalog_api: true,
      supports_price_write_api: true,
      supports_stock_write_api: true,
      supports_listing_write_api: true,
      supports_model_write_api: true,
      supports_listing_audit: true,
      supports_comment_api: true,
      supports_boost_api: true,
      supports_category_recommend_api: true,
      supports_attribute_recommend_api: true,
      supports_violation_api: true,
      supports_video_library_api: true,
      supports_video_analytics_api: true,
      supports_video_write_api: true
    }
  }
  if (platform === 'lazada') {
    return {
      supports_product_catalog_api: true,
      supports_price_write_api: true,
      supports_stock_write_api: true,
      supports_listing_write_api: true,
      supports_model_write_api: true,
      supports_listing_audit: true,
      supports_comment_api: true,
      supports_boost_api: false,
      supports_category_recommend_api: false,
      supports_attribute_recommend_api: false,
      supports_violation_api: false,
      supports_video_library_api: true,
      supports_video_analytics_api: false,
      supports_video_write_api: true
    }
  }
  return {
    supports_product_catalog_api: false,
    supports_price_write_api: false,
    supports_stock_write_api: false,
    supports_listing_write_api: false,
    supports_model_write_api: false,
    supports_listing_audit: false,
    supports_comment_api: false,
    supports_boost_api: false,
    supports_category_recommend_api: false,
    supports_attribute_recommend_api: false,
    supports_violation_api: false,
    supports_video_library_api: false,
    supports_video_analytics_api: false,
    supports_video_write_api: false
  }
}

function buildMarketplaceCapability(row = {}) {
  const platform = cleanCapabilityText(row.platform).toLowerCase()
  const accessAt = parseCapabilityDate(row.token_expire_at)
  const refreshAt = parseCapabilityDate(row.api_refresh_expire_at)
  const hasAccessToken = truthyCapabilityFlag(row.has_access_token)
  const hasRefreshToken = truthyCapabilityFlag(row.has_refresh_token)
  const hasPartnerKey = truthyCapabilityFlag(row.has_partner_key)
  const hasApiShopId = Boolean(cleanCapabilityText(row.api_shop_id))
  const hasAnyApiConfig = hasPartnerKey || hasAccessToken || hasRefreshToken || hasApiShopId || Boolean(cleanCapabilityText(row.api_partner_id))
  const accessLive = hasAccessToken && isTokenLive(accessAt)
  const refreshLive = hasRefreshToken && (!Number.isFinite(refreshAt) || isTokenLive(refreshAt))
  const lastWebhookAt = cleanCapabilityText(row.last_webhook_event_at)
  const realtimeActive = Boolean(lastWebhookAt && parseCapabilityDate(lastWebhookAt))

  let mode = 'manual_reference'
  let syncStrategy = 'manual_reference'
  let operatorGuide = 'Shop chưa có luồng sản phẩm API.'

  if (platform === 'shopee') {
    if (accessLive && refreshLive && hasApiShopId) {
      mode = 'api_active'
      syncStrategy = 'api_snapshot'
    } else if (hasAnyApiConfig) {
      mode = 'api_needs_auth'
      syncStrategy = 'await_api_auth'
    }
    operatorGuide = shopeeCapabilityGuide(mode)
  } else if (platform === 'lazada') {
    if (accessLive && hasApiShopId) {
      mode = 'api_active'
      syncStrategy = 'api_snapshot'
    } else if (hasAnyApiConfig) {
      mode = 'api_needs_auth'
      syncStrategy = 'await_api_auth'
    }
    operatorGuide = lazadaCapabilityGuide(mode)
  } else if (platform === 'tiktok') {
    mode = hasAnyApiConfig ? 'browser_reference' : 'manual_reference'
    syncStrategy = mode === 'browser_reference' ? 'browser_reference' : 'manual_reference'
    operatorGuide = tiktokCapabilityGuide()
  }

  const metadata = buildCapabilityMetadata(platform)
  const supportsProductSync = metadata.supports_product_catalog_api && mode === 'api_active'
  const supportsWritePreview = metadata.supports_price_write_api || metadata.supports_stock_write_api

  return {
    ...row,
    capability_identity: makeCapabilityIdentity(row),
    capability_mode: mode,
    product_sync_mode: supportsProductSync ? 'api_snapshot' : syncStrategy,
    has_any_api_config: hasAnyApiConfig ? 1 : 0,
    access_token_live: accessLive ? 1 : 0,
    refresh_token_live: refreshLive ? 1 : 0,
    token_status: accessLive ? 'valid' : (hasAccessToken ? 'expired_or_unknown' : 'missing'),
    refresh_token_status: refreshLive ? 'valid' : (hasRefreshToken ? 'expired' : 'missing'),
    last_order_sync_at: cleanCapabilityText(row.last_order_sync_at),
    last_order_sync_status: cleanCapabilityText(row.last_order_sync_status),
    last_order_sync_error: cleanCapabilityText(row.last_order_sync_error),
    last_order_status_sync_at: cleanCapabilityText(row.last_order_status_sync_at),
    last_order_status_sync_status: cleanCapabilityText(row.last_order_status_sync_status),
    last_order_status_sync_error: cleanCapabilityText(row.last_order_status_sync_error),
    last_webhook_event_at: lastWebhookAt,
    last_webhook_event_status: cleanCapabilityText(row.last_webhook_event_status),
    last_webhook_event_error: cleanCapabilityText(row.last_webhook_event_error),
    realtime_mode: realtimeActive ? 'webhook_plus_polling' : (mode === 'api_active' ? 'fallback_polling' : 'manual_or_browser'),
    realtime_active: realtimeActive ? 1 : 0,
    supports_product_sync: supportsProductSync ? 1 : 0,
    supports_browser_reference: mode === 'browser_reference' ? 1 : 0,
    supports_manual_reference: ['manual_reference', 'browser_reference', 'api_needs_auth'].includes(mode) ? 1 : 0,
    supports_write_preview: supportsWritePreview ? 1 : 0,
    operator_guide: operatorGuide,
    capability_badge: mode === 'api_active'
      ? 'Có API'
      : mode === 'api_needs_auth'
        ? 'Cần kết nối API'
        : mode === 'browser_reference'
          ? 'Browser hỗ trợ'
          : 'Tham chiếu tay',
    ...metadata
  }
}

function matchShopFilter(row, needle) {
  if (!needle) return true
  const search = needle.toLowerCase()
  return [
    row.shop_name,
    row.user_name,
    row.api_shop_id,
    row.platform
  ].some(value => cleanCapabilityText(value).toLowerCase().includes(search))
}

export async function listMarketplaceShopCapabilities(env, options = {}) {
  await ensureMarketplaceCapabilityColumns(env)
  const platformFilter = cleanCapabilityText(options.platform).toLowerCase()
  const needle = cleanCapabilityText(options.shop || options.search)
  const limit = Math.min(Math.max(Number(options.limit || 200) || 200, 1), 500)
  const results = await queryMarketplaceShopRows(env, options)

  const deduped = new Map()
  for (const raw of results || []) {
    const platform = cleanCapabilityText(raw.platform).toLowerCase()
    if (platformFilter && platform !== platformFilter) continue
    const row = buildMarketplaceCapability({
      ...raw,
      shop_name: cleanCapabilityText(raw.shop_name),
      user_name: cleanCapabilityText(raw.user_name),
      api_shop_id: cleanCapabilityText(raw.api_shop_id),
      api_user_id: cleanCapabilityText(raw.api_user_id),
      video_partner_id: cleanCapabilityText(raw.video_partner_id),
      video_redirect_url: cleanCapabilityText(raw.video_redirect_url),
      video_api_shop_id: cleanCapabilityText(raw.video_api_shop_id),
      video_api_user_id: cleanCapabilityText(raw.video_api_user_id),
      video_auth_subject_type: cleanCapabilityText(raw.video_auth_subject_type),
      video_permission_status: cleanCapabilityText(raw.video_permission_status),
      video_permission_message: cleanCapabilityText(raw.video_permission_message),
      video_permission_tested_at: cleanCapabilityText(raw.video_permission_tested_at),
      platform
    })
    if (!matchShopFilter(row, needle)) continue
    const key = row.capability_identity
    const existing = deduped.get(key)
    const currentPreferred = row.capability_mode === 'api_active' || Boolean(row.shop_name && !/^Shopee\s+\d+$/i.test(row.shop_name))
    if (!existing || currentPreferred) deduped.set(key, row)
  }

  return [...deduped.values()].slice(0, limit)
}

export async function listApiCapableShops(env, options = {}) {
  const platform = cleanCapabilityText(options.platform).toLowerCase()
  const rows = await listMarketplaceShopCapabilities(env, {
    platform,
    shop: options.shop,
    limit: options.limit || options.maxShops || 200
  })
  return rows.filter(row => row.capability_mode === 'api_active' && row.supports_product_sync)
}

export async function listApiCapableShopCredentials(env, options = {}) {
  const platform = cleanCapabilityText(options.platform).toLowerCase()
  const rows = await listMarketplaceShopCapabilities(env, {
    ...options,
    platform,
    includeSecrets: true,
    limit: options.limit || options.maxShops || 200
  })
  return rows.filter(row => row.capability_mode === 'api_active' && row.supports_product_sync)
}

export async function listMarketplaceApiIdentityKeys(env, options = {}) {
  const rows = await listMarketplaceShopCapabilities(env, options)
  const keys = new Set()
  for (const row of rows) {
    if (!row.supports_product_sync) continue
    const platform = cleanCapabilityText(row.platform).toLowerCase()
    for (const value of [row.shop_name, row.user_name, row.api_shop_id]) {
      const key = cleanCapabilityText(value).toLowerCase()
      if (platform && key) keys.add(`${platform}|${key}`)
    }
  }
  return keys
}

export function summarizeMarketplaceCapabilities(rows = []) {
  return rows.reduce((accumulator, row) => {
    accumulator.total_shops += 1
    accumulator[`${row.platform}_shops`] = (accumulator[`${row.platform}_shops`] || 0) + 1
    if (row.capability_mode === 'api_active') accumulator.api_active_shops += 1
    if (row.capability_mode === 'api_needs_auth') accumulator.api_needs_auth_shops += 1
    if (row.capability_mode === 'manual_reference') accumulator.manual_reference_shops += 1
    if (row.capability_mode === 'browser_reference') accumulator.browser_reference_shops += 1
    return accumulator
  }, {
    total_shops: 0,
    api_active_shops: 0,
    api_needs_auth_shops: 0,
    manual_reference_shops: 0,
    browser_reference_shops: 0,
    shopee_shops: 0,
    lazada_shops: 0,
    tiktok_shops: 0
  })
}
