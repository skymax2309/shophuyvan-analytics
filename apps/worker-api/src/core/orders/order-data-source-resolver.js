function cleanSourceText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerSourceText(value) {
  return cleanSourceText(value).toLowerCase()
}

export const SHOPEE_OFFICIAL_API_SHOPS = new Set([
  'chihuy1984',
  'chihuy2309',
  'phambich2312',
  'kinhdoanhonlinegiasoc@gmail.com'
])

export const LAZADA_OFFICIAL_API_SHOPS = new Set([
  'kinhdoanhonlinegiasoc@gmail.com'
])

export const SHOPEE_SELLER_CENTER_FALLBACK_SHOPS = new Set([
  'khogiadungcona'
])

export const TIKTOK_MANUAL_SHOPS = new Set([
  '0909128999'
])

function hasSellerCenterSource(row = {}) {
  return [
    row.source,
    row.source_mode,
    row.source_detail,
    row.status_source,
    row.detail_url_source,
    row.last_status_sync_error
  ].map(lowerSourceText).join('|').includes('seller_center')
}

export function resolveOrderDataSource(order = {}) {
  const platform = lowerSourceText(order.platform)
  const shop = lowerSourceText(order.shop || order.shop_name || order.user_name || order.api_shop_id)

  if (platform === 'shopee' && SHOPEE_OFFICIAL_API_SHOPS.has(shop)) {
    return {
      platform,
      shop,
      source_priority: 'official_api_first',
      source: 'shopee_open_platform',
      source_mode: 'api_sync',
      status_source: 'shopee_open_platform',
      source_label: 'API',
      seller_center_allowed: false,
      docs_checked: true,
      api_missing_reason: '',
      source_mismatch: hasSellerCenterSource(order) ? 'api_shop_routed_to_seller_center' : '',
      fallback_allowed: false
    }
  }

  if (platform === 'lazada' && LAZADA_OFFICIAL_API_SHOPS.has(shop)) {
    return {
      platform,
      shop,
      source_priority: 'official_api_first',
      source: 'lazada_open_platform',
      source_mode: 'api_sync',
      status_source: 'lazada_open_platform',
      source_label: 'API',
      seller_center_allowed: false,
      docs_checked: true,
      api_missing_reason: '',
      source_mismatch: hasSellerCenterSource(order) ? 'api_shop_routed_to_seller_center' : '',
      fallback_allowed: false
    }
  }

  if (platform === 'shopee' && SHOPEE_SELLER_CENTER_FALLBACK_SHOPS.has(shop)) {
    return {
      platform,
      shop,
      source_priority: 'seller_center_fallback',
      source: 'shopee_seller_center_detail',
      source_mode: 'browser_sync',
      status_source: 'shopee_seller_center_detail',
      source_label: 'Seller Center',
      seller_center_allowed: true,
      docs_checked: true,
      api_missing_reason: 'shop_no_official_api',
      source_mismatch: '',
      fallback_allowed: true
    }
  }

  if (platform === 'tiktok') {
    return {
      platform,
      shop,
      source_priority: 'tiktok_seller_center_or_manual',
      source: 'tiktok_manual_or_local_helper',
      source_mode: 'manual_reference',
      status_source: 'tiktok_manual_or_local_helper',
      source_label: 'Manual',
      seller_center_allowed: true,
      docs_checked: true,
      api_missing_reason: 'tiktok_api_not_enabled_in_order_core',
      source_mismatch: '',
      fallback_allowed: true
    }
  }

  return {
    platform,
    shop,
    source_priority: cleanSourceText(order.source_priority || 'warehouse_snapshot'),
    source: cleanSourceText(order.source || order.source_mode || order.source_detail || 'orders_v2_snapshot'),
    source_mode: cleanSourceText(order.source_mode || ''),
    status_source: cleanSourceText(order.status_source || order.source_detail || order.source_mode || ''),
    source_label: 'Manual',
    seller_center_allowed: false,
    docs_checked: false,
    api_missing_reason: '',
    source_mismatch: '',
    fallback_allowed: false
  }
}

export function isOfficialApiOrderShop(order = {}) {
  return resolveOrderDataSource(order).source_priority === 'official_api_first'
}

export function sellerCenterFallbackAllowed(order = {}) {
  return resolveOrderDataSource(order).seller_center_allowed === true
}
