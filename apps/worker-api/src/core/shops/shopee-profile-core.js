export const SHOPEE_SHOP_READ_ENDPOINTS = [
  {
    id: 'shop_info',
    label: 'Thông tin shop',
    path: '/api/v2/shop/get_shop_info',
    source: 'get_shop_info'
  },
  {
    id: 'profile',
    label: 'Hồ sơ shop',
    path: '/api/v2/shop/get_profile',
    source: 'get_profile'
  },
  {
    id: 'warehouse_detail',
    label: 'Kho hàng',
    path: '/api/v2/shop/get_warehouse_detail',
    source: 'get_warehouse_detail'
  },
  {
    id: 'notification',
    label: 'Thông báo shop',
    path: '/api/v2/shop/get_shop_notification',
    source: 'get_shop_notification'
  },
  {
    id: 'authorised_reseller_brand',
    label: 'Brand reseller',
    path: '/api/v2/shop/get_authorised_reseller_brand',
    source: 'get_authorised_reseller_brand'
  },
  {
    id: 'br_shop_onboarding',
    label: 'Onboarding Brand Registry',
    path: '/api/v2/shop/get_br_shop_onboarding_info',
    source: 'get_br_shop_onboarding_info'
  },
  {
    id: 'holiday_mode',
    label: 'Chế độ nghỉ',
    path: '/api/v2/shop/get_shop_holiday_mode',
    source: 'get_shop_holiday_mode'
  }
]

export const SHOPEE_SHOP_WRITE_ENDPOINTS = [
  {
    id: 'update_profile',
    label: 'Cập nhật hồ sơ shop',
    path: '/api/v2/shop/update_profile',
    source: 'update_profile',
    guard: 'preview_admin_confirm_log'
  },
  {
    id: 'set_holiday_mode',
    label: 'Bật/tắt chế độ nghỉ',
    path: '/api/v2/shop/set_shop_holiday_mode',
    source: 'set_shop_holiday_mode',
    guard: 'preview_admin_confirm_log'
  }
]

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function firstText(source, keys) {
  if (!source || typeof source !== 'object') return ''
  for (const key of keys) {
    const value = cleanText(source[key])
    if (value) return value
  }
  return ''
}

function isRawShopDisplayName(value, shop = {}) {
  const text = cleanText(value)
  if (!text) return true
  const apiShopId = cleanText(shop.api_shop_id || shop.shop_id)
  return /^\d{6,}$/.test(text) ||
    /^(shopee|lazada)\s+\d+$/i.test(text) ||
    Boolean(apiShopId && text === apiShopId) ||
    Boolean(shop.id && text === cleanText(shop.id))
}

function endpointPayload(data = {}) {
  const payload = data.response || data.data || data.result || data
  return payload.response || payload.data || payload.result || payload
}

function profilePayloadFromRows(rows = [], id) {
  const row = rows.find(item => item.id === id && item.status === 'ok')
  return row ? endpointPayload(row.response || row.raw_response || row.data || {}) : {}
}

function profileRawFromRows(rows = []) {
  const raw = {}
  for (const row of rows || []) {
    raw[row.id || row.source || 'unknown'] = {
      status: row.status || '',
      source: row.source || '',
      endpoint: row.endpoint || '',
      response: row.response || null,
      summary: row.summary || ''
    }
  }
  return raw
}

function normalizeShopId(shop = {}, shopInfo = {}, profile = {}) {
  return cleanText(
    shop?.api_shop_id ||
    shopInfo.shop_id ||
    shopInfo.shopid ||
    profile.shop_id ||
    profile.shopid ||
    shop?.shop_id
  )
}

export async function ensureShopCoreProfileTable(env) {
  if (!env?.DB) return
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS shop_core_profiles (
      platform TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      shop_display_name TEXT DEFAULT '',
      shop_name_source TEXT DEFAULT '',
      shop_profile_source TEXT DEFAULT '',
      source TEXT DEFAULT '',
      confidence TEXT DEFAULT '',
      shop_logo TEXT DEFAULT '',
      region TEXT DEFAULT '',
      status TEXT DEFAULT '',
      raw_profile TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      PRIMARY KEY (platform, shop_id)
    )
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_shop_core_profiles_platform_name
    ON shop_core_profiles(platform, shop_display_name)
  `).run()
}

export function normalizeShopProfile({ platform = 'shopee', shop = {}, rows = [], updatedAt = new Date().toISOString() } = {}) {
  const shopInfo = profilePayloadFromRows(rows, 'shop_info')
  const profile = profilePayloadFromRows(rows, 'profile')
  const shopId = normalizeShopId(shop, shopInfo, profile)
  const infoName = firstText(shopInfo, ['shop_name', 'shop_display_name', 'display_name', 'shopName'])
  const profileName = firstText(profile, ['shop_name', 'shop_display_name', 'display_name', 'shopName'])
  const rawDisplayName = firstText({ infoName, profileName }, ['infoName', 'profileName'])
  const displayName = isRawShopDisplayName(rawDisplayName, { ...shop, shop_id: shopId, api_shop_id: shopId }) ? '' : rawDisplayName
  const shopLogo = firstText(profile, ['shop_logo', 'logo', 'image_url']) || firstText(shopInfo, ['shop_logo', 'logo', 'image_url'])
  const region = firstText(shopInfo, ['region', 'country', 'area']) || firstText(profile, ['region', 'country', 'area'])
  const status = firstText(shopInfo, ['status', 'shop_status']) || firstText(profile, ['status', 'shop_status'])

  return {
    platform: cleanText(platform || 'shopee').toLowerCase(),
    shop_id: shopId,
    shop_display_name: displayName,
    shop_name_source: displayName ? 'shopee_shop_api' : 'missing',
    shop_profile_source: displayName ? 'api' : 'missing',
    source: displayName ? 'API' : 'Missing',
    confidence: displayName ? 'confirmed' : 'missing',
    shop_logo: shopLogo,
    region,
    status,
    raw_profile: profileRawFromRows(rows),
    updated_at: updatedAt
  }
}

export async function upsertShopCoreProfile(env, profile = {}) {
  if (!env?.DB) return profile
  const platform = cleanText(profile.platform || 'shopee').toLowerCase()
  const shopId = cleanText(profile.shop_id)
  if (!platform || !shopId) return profile
  await ensureShopCoreProfileTable(env)
  const updatedAt = cleanText(profile.updated_at) || new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO shop_core_profiles
      (platform, shop_id, shop_display_name, shop_name_source, shop_profile_source,
       source, confidence, shop_logo, region, status, raw_profile, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, shop_id) DO UPDATE SET
      shop_display_name = excluded.shop_display_name,
      shop_name_source = excluded.shop_name_source,
      shop_profile_source = excluded.shop_profile_source,
      source = excluded.source,
      confidence = excluded.confidence,
      shop_logo = excluded.shop_logo,
      region = excluded.region,
      status = excluded.status,
      raw_profile = excluded.raw_profile,
      updated_at = excluded.updated_at
  `).bind(
    platform,
    shopId,
    cleanText(profile.shop_display_name),
    cleanText(profile.shop_name_source),
    cleanText(profile.shop_profile_source),
    cleanText(profile.source),
    cleanText(profile.confidence),
    cleanText(profile.shop_logo),
    cleanText(profile.region),
    cleanText(profile.status),
    JSON.stringify(profile.raw_profile || {}),
    updatedAt,
    updatedAt
  ).run()

  const officialName = cleanText(profile.shop_display_name)
  if (platform === 'shopee' && officialName && !isRawShopDisplayName(officialName, { api_shop_id: shopId })) {
    // Chỉ bù tên cho dòng shop đang để số/raw synthetic, không ghi đè alias vận hành như chihuy1984.
    await env.DB.prepare(`
      UPDATE shops
      SET shop_name = ?
      WHERE LOWER(COALESCE(platform, '')) = 'shopee'
        AND COALESCE(api_shop_id, '') = ?
        AND (
          COALESCE(shop_name, '') = ''
          OR COALESCE(shop_name, '') = COALESCE(api_shop_id, '')
          OR LOWER(COALESCE(shop_name, '')) LIKE 'shopee %'
        )
    `).bind(officialName, shopId).run()
  }

  return {
    ...profile,
    platform,
    shop_id: shopId,
    updated_at: updatedAt
  }
}

export async function listShopCoreProfiles(env, options = {}) {
  if (!env?.DB) return []
  await ensureShopCoreProfileTable(env)
  const platform = cleanText(options.platform || 'shopee').toLowerCase()
  const ids = [...new Set((options.shopIds || []).map(cleanText).filter(Boolean))]
  const binds = [platform]
  let where = 'platform = ?'
  if (ids.length) {
    where += ` AND shop_id IN (${ids.map(() => '?').join(',')})`
    binds.push(...ids)
  }
  const { results } = await env.DB.prepare(`
    SELECT platform, shop_id, shop_display_name, shop_name_source, shop_profile_source,
           source, confidence, shop_logo, region, status, updated_at
    FROM shop_core_profiles
    WHERE ${where}
  `).bind(...binds).all()
  return results || []
}

function countValue(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function summarizeShopeeShopEndpoint(endpoint, data = {}) {
  const payload = data.response || data
  const result = payload.response || payload.data || payload.result || payload
  if (endpoint.id === 'shop_info') {
    return firstText(result, ['shop_name', 'shopName', 'shop_description', 'description']) || 'Đã đọc thông tin shop.'
  }
  if (endpoint.id === 'profile') {
    return firstText(result, ['shop_name', 'shopName', 'description', 'shop_description']) || 'Đã đọc hồ sơ shop.'
  }
  if (endpoint.id === 'warehouse_detail') {
    const total = countValue(result.warehouse_list || result.warehouses || result.warehouse)
    return total ? `${total.toLocaleString('vi-VN')} kho/nguồn giao hàng` : 'Đã đọc cấu hình kho.'
  }
  if (endpoint.id === 'notification') {
    const total = countValue(result.notification_list || result.notifications || result)
    return total ? `${total.toLocaleString('vi-VN')} nhóm thông báo` : 'Đã đọc cấu hình thông báo.'
  }
  if (endpoint.id === 'authorised_reseller_brand') {
    const total = countValue(result.brand_list || result.brands || result.authorised_reseller_brand_list)
    return total ? `${total.toLocaleString('vi-VN')} brand được ủy quyền` : 'Không thấy brand được trả về hoặc shop không thuộc nhóm này.'
  }
  if (endpoint.id === 'br_shop_onboarding') {
    return firstText(result, ['status', 'onboarding_status', 'shop_status']) || 'Đã đọc trạng thái Brand Registry.'
  }
  if (endpoint.id === 'holiday_mode') {
    const raw = result.holiday_mode ?? result.is_holiday_mode ?? result.enable_holiday_mode
    if (raw === true || raw === 1 || raw === 'true') return 'Đang bật chế độ nghỉ.'
    if (raw === false || raw === 0 || raw === 'false') return 'Đang tắt chế độ nghỉ.'
    return 'Đã đọc trạng thái chế độ nghỉ.'
  }
  return 'Đã đọc dữ liệu từ Shopee.'
}

export function normalizeShopeeShopSnapshot({ shop, rows = [], warnings = [] }) {
  const success = rows.filter(row => row.status === 'ok').length
  const failed = rows.filter(row => row.status !== 'ok').length
  return {
    status: failed ? 'partial_error' : 'ok',
    platform: 'shopee',
    shop: cleanText(shop?.shop_name || shop?.user_name || shop?.api_shop_id),
    api_shop_id: cleanText(shop?.api_shop_id),
    fetched_at: new Date().toISOString(),
    mode: 'read_only_snapshot',
    source_note: 'Đọc trực tiếp từ Shopee Shop API; hai endpoint ghi vẫn khóa preview/xác nhận trước khi gọi thật.',
    success,
    failed,
    endpoints: rows,
    write_guards: SHOPEE_SHOP_WRITE_ENDPOINTS,
    warnings
  }
}
