import { listMarketplaceShopCapabilities } from '../marketplace/shop-capability-core.js'
import {
  editShopeeAutoProductAds,
  editShopeeManualProductAds,
  editShopeeManualProductAdKeywords,
  fetchLazadaAdsAccountSignInfo,
  fetchLazadaAdsLatestSignInfo,
  updateLazadaAdsAdgroupBatch,
  updateLazadaAdsCampaign
} from '../../routes/api/index.js'

export const ADS_GUARD_CONFIRM_PHRASE = 'TOI_HIEU_DAY_LA_THAY_DOI_ADS_THAT'

function cleanAdsGuardText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function parseAdsGuardBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = cleanAdsGuardText(value).toLowerCase()
  if (!text) return fallback
  if (['1', 'true', 'yes', 'on', 'ok'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}

function safeAdsGuardJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function adsGuardNowIso() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  return now.toISOString().replace('T', ' ').slice(0, 19)
}

function adsGuardScopeLabel(scope) {
  if (scope === 'campaign') return 'Chiến dịch'
  if (scope === 'adgroup') return 'Nhóm quảng cáo'
  if (scope === 'keyword') return 'Từ khóa'
  return 'ADS'
}

function adsGuardTransportLabel(mode) {
  if (mode === 'api_sync') return 'API thật'
  if (mode === 'browser_sync') return 'Quét trình duyệt'
  if (mode === 'import_file_sync') return 'Import file'
  return 'Tham chiếu tay'
}

function adsGuardTransportGuide(row = {}) {
  const platform = cleanAdsGuardText(row.platform).toLowerCase()
  const mode = cleanAdsGuardText(row.capability_mode)
  if ((platform === 'shopee' || platform === 'lazada') && mode === 'api_active') {
    return 'Shop có API ADS. Hệ thống cho phép preview trước, ghi log đầy đủ, sau đó mới cho đẩy thật khi người vận hành xác nhận.'
  }
  if (mode === 'api_needs_auth') {
    return 'Shop đã có dấu hiệu cấu hình API nhưng token hoặc quyền ADS chưa sẵn sàng. Chỉ nên xem tham chiếu, chưa đẩy thật.'
  }
  if (platform === 'tiktok') {
    return 'TikTok hiện chưa có core ADS API hoàn chỉnh trong OMS. Tạm thời chỉ nên dùng tham chiếu tay hoặc quy trình browser có kiểm soát.'
  }
  return 'Shop chưa có API ADS. Chỉ nên tham chiếu tay, import file hoặc browser hỗ trợ có kiểm soát. Không đẩy thay đổi quảng cáo thật từ OMS.'
}

function normalizeAdsGuardStatusValue(value) {
  const text = cleanAdsGuardText(value).toLowerCase()
  if (!text) return ''
  if (['1', 'on', 'online', 'enable', 'enabled', 'start', 'resume'].includes(text)) return '1'
  if (['0', 'off', 'offline', 'disable', 'disabled', 'pause', 'stop'].includes(text)) return '0'
  return text
}

function normalizeAdsGuardScope(value) {
  const text = cleanAdsGuardText(value).toLowerCase()
  if (['campaign', 'adgroup', 'keyword'].includes(text)) return text
  return 'campaign'
}

function normalizeShopeeGuardRouteKey(value) {
  const text = cleanAdsGuardText(value).toLowerCase()
  if (['auto', 'auto_product_ads', 'shopee_auto'].includes(text)) return 'shopee_auto'
  return 'shopee_manual'
}

function normalizeLazadaBizCode(value) {
  const text = cleanAdsGuardText(value)
  if (!text) return 'sponsoredSearch'
  if (text === 'SD') return 'sponsoredSearch'
  return text
}

function parseAdsGuardKeywords(raw) {
  if (Array.isArray(raw)) return raw
  const text = cleanAdsGuardText(raw)
  if (!text) return []
  const parsed = safeAdsGuardJson(text, null)
  if (Array.isArray(parsed)) return parsed
  return []
}

function buildAdsGuardReferenceId(prefix, entityId = '') {
  const safeEntity = cleanAdsGuardText(entityId).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'entity'
  return `${prefix}_${safeEntity}_${Date.now()}`
}

function extractAdsGuardRequestId(result = {}) {
  return cleanAdsGuardText(
    result.request_id ||
    result.requestId ||
    result.analyseTraceId ||
    result.trace_id ||
    result.traceId ||
    result.response?.request_id ||
    result.response?.analyseTraceId
  )
}

function extractAdsGuardErrorMessage(result = {}) {
  if (Array.isArray(result.errors) && result.errors.length) return result.errors.join('; ')
  return cleanAdsGuardText(result.message || result.error || result.warning || result.errorMsg)
}

function humanizeAdsGuardMessage(message, mode = 'preview') {
  const text = cleanAdsGuardText(message)
  if (!text) {
    return mode === 'preview'
      ? 'Đã dựng preview ADS guard.'
      : 'Đã gửi yêu cầu ADS guard.'
  }
  if (/^Dry-run only\./i.test(text) && /EDIT_SHOPEE_MANUAL_PRODUCT_ADS/i.test(text)) {
    return 'Đây là preview Shopee Manual Product Ads. Muốn đẩy thật thì bấm "Đẩy thật" và nhập đúng câu xác nhận.'
  }
  if (/^Dry-run only\./i.test(text) && /EDIT_SHOPEE_AUTO_PRODUCT_ADS/i.test(text)) {
    return 'Đây là preview Shopee Auto Product Ads. Muốn đẩy thật thì bấm "Đẩy thật" và nhập đúng câu xác nhận.'
  }
  if (/^Dry-run only\./i.test(text) && /EDIT_SHOPEE_AD_KEYWORDS/i.test(text)) {
    return 'Đây là preview sửa từ khóa Shopee. Muốn đẩy thật thì bấm "Đẩy thật" và nhập đúng câu xác nhận.'
  }
  return text
}

function compactAdsGuardJson(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? safeAdsGuardJson(fallback, {}))
  } catch {
    return fallback
  }
}

function mapAdsGuardCapability(row = {}) {
  const platform = cleanAdsGuardText(row.platform).toLowerCase()
  const transportMode = (platform === 'shopee' || platform === 'lazada') && row.capability_mode === 'api_active'
    ? 'api_sync'
    : row.capability_mode === 'browser_reference'
      ? 'browser_sync'
      : 'manual_reference'
  const supportsAdsGuard = transportMode === 'api_sync' && (platform === 'shopee' || platform === 'lazada')
  return {
    id: row.id || '',
    platform,
    shop: row.shop_name || row.user_name || row.api_shop_id || '',
    shop_name: row.shop_name || '',
    user_name: row.user_name || '',
    api_shop_id: row.api_shop_id || '',
    capability_mode: row.capability_mode || 'manual_reference',
    capability_badge: row.capability_badge || 'Tham chiếu tay',
    operator_guide: row.operator_guide || '',
    ads_transport_mode: transportMode,
    ads_transport_label: adsGuardTransportLabel(transportMode),
    ads_transport_guide: adsGuardTransportGuide(row),
    supports_ads_guard_preview: supportsAdsGuard ? 1 : 0,
    supports_ads_guard_apply: supportsAdsGuard ? 1 : 0,
    supports_ads_keyword_write: platform === 'shopee' && supportsAdsGuard ? 1 : 0,
    supports_ads_campaign_write: (platform === 'shopee' || platform === 'lazada') && supportsAdsGuard ? 1 : 0,
    supports_ads_adgroup_write: platform === 'lazada' && supportsAdsGuard ? 1 : 0,
    supports_ads_sign_check: platform === 'lazada' && supportsAdsGuard ? 1 : 0
  }
}

async function resolveAdsGuardShop(env, platform, shopFilter) {
  const rows = await listMarketplaceShopCapabilities(env, {
    platform,
    shop: shopFilter,
    includeSecrets: true,
    limit: 50
  })
  if (!rows.length) return null
  const needle = cleanAdsGuardText(shopFilter).toLowerCase()
  if (!needle) return rows[0]
  return rows.find(row =>
    [row.shop_name, row.user_name, row.api_shop_id]
      .map(cleanAdsGuardText)
      .map(value => value.toLowerCase())
      .includes(needle)
  ) || rows[0]
}

function buildAdsGuardBlockedResult(capability = {}, input = {}, reason = '') {
  const mapped = mapAdsGuardCapability(capability)
  return {
    status: 'blocked',
    mode: input.mode || 'preview',
    platform: input.platform || mapped.platform || '',
    shop: input.shop || mapped.shop || '',
    capability: mapped,
    scope: input.scope || 'campaign',
    scope_label: adsGuardScopeLabel(input.scope || 'campaign'),
    action: input.action || '',
    entity_id: input.entity_id || '',
    can_apply: false,
    request_payload: input.request_payload || {},
    endpoint: '',
    request_id: '',
    message: reason || mapped.ads_transport_guide || 'Shop này chưa sẵn sàng cho ADS guard.',
    warning: mapped.operator_guide || ''
  }
}

export async function ensureAdsCampaignGuardTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_ads_guard_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      capability_mode TEXT DEFAULT '',
      ads_transport_mode TEXT DEFAULT '',
      action_scope TEXT DEFAULT '',
      action_name TEXT DEFAULT '',
      route_key TEXT DEFAULT '',
      entity_id TEXT DEFAULT '',
      mode TEXT DEFAULT 'preview',
      status TEXT DEFAULT '',
      endpoint TEXT DEFAULT '',
      request_id TEXT DEFAULT '',
      request_payload TEXT DEFAULT '{}',
      response_payload TEXT DEFAULT '{}',
      error_message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_ads_guard_logs_lookup
    ON marketplace_ads_guard_logs(platform, shop, created_at DESC)
  `).run()
}

async function saveAdsCampaignGuardLog(env, entry = {}) {
  await ensureAdsCampaignGuardTable(env)
  const result = await env.DB.prepare(`
    INSERT INTO marketplace_ads_guard_logs (
      platform, shop, capability_mode, ads_transport_mode, action_scope, action_name,
      route_key, entity_id, mode, status, endpoint, request_id,
      request_payload, response_payload, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cleanAdsGuardText(entry.platform),
    cleanAdsGuardText(entry.shop),
    cleanAdsGuardText(entry.capability_mode),
    cleanAdsGuardText(entry.ads_transport_mode),
    cleanAdsGuardText(entry.action_scope),
    cleanAdsGuardText(entry.action_name),
    cleanAdsGuardText(entry.route_key),
    cleanAdsGuardText(entry.entity_id),
    cleanAdsGuardText(entry.mode || 'preview'),
    cleanAdsGuardText(entry.status),
    cleanAdsGuardText(entry.endpoint),
    cleanAdsGuardText(entry.request_id),
    compactAdsGuardJson(entry.request_payload, '{}'),
    compactAdsGuardJson(entry.response_payload, '{}'),
    cleanAdsGuardText(entry.error_message),
    cleanAdsGuardText(entry.created_at || adsGuardNowIso())
  ).run()
  return Number(result.meta?.last_row_id || 0)
}

export async function listAdsCampaignGuardLogs(env, options = {}) {
  await ensureAdsCampaignGuardTable(env)
  const conds = []
  const params = []
  const platform = cleanAdsGuardText(options.platform).toLowerCase()
  const shop = cleanAdsGuardText(options.shop)
  if (platform) {
    conds.push('LOWER(platform) = ?')
    params.push(platform)
  }
  if (shop) {
    conds.push('LOWER(shop) = ?')
    params.push(shop.toLowerCase())
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const limit = Math.min(Math.max(Number(options.limit || 20) || 20, 1), 100)
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_ads_guard_logs
    ${where}
    ORDER BY id DESC
    LIMIT ${limit}
  `).bind(...params).all()
  return (results || []).map(row => ({
    ...row,
    request_payload: safeAdsGuardJson(row.request_payload, {}),
    response_payload: safeAdsGuardJson(row.response_payload, {})
  }))
}

export async function listAdsCampaignGuardCapabilities(env, options = {}) {
  const rows = await listMarketplaceShopCapabilities(env, {
    platform: options.platform,
    shop: options.shop,
    limit: options.limit || 100
  })
  return rows
    .filter(row => ['shopee', 'lazada', 'tiktok'].includes(cleanAdsGuardText(row.platform).toLowerCase()))
    .map(mapAdsGuardCapability)
}

export async function buildAdsCampaignGuardOverview(env, options = {}) {
  const capabilities = await listAdsCampaignGuardCapabilities(env, options)
  const logs = await listAdsCampaignGuardLogs(env, {
    platform: options.platform,
    shop: options.shop,
    limit: options.logLimit || options.log_limit || options.limit || 20
  })
  return {
    status: 'ok',
    summary: {
      total_shops: capabilities.length,
      api_ready_shops: capabilities.filter(item => item.ads_transport_mode === 'api_sync').length,
      browser_shops: capabilities.filter(item => item.ads_transport_mode === 'browser_sync').length,
      manual_shops: capabilities.filter(item => item.ads_transport_mode === 'manual_reference').length,
      shopee_api_shops: capabilities.filter(item => item.platform === 'shopee' && item.ads_transport_mode === 'api_sync').length,
      lazada_api_shops: capabilities.filter(item => item.platform === 'lazada' && item.ads_transport_mode === 'api_sync').length,
      tiktok_reference_shops: capabilities.filter(item => item.platform === 'tiktok').length
    },
    capabilities,
    logs
  }
}

function adsGuardRawData(value) {
  return safeAdsGuardJson(value, {})
}

function firstAdsGuardValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && cleanAdsGuardText(value) !== '') return value
  }
  return ''
}

function adsGuardCampaignMetric(row = {}) {
  const spend = Number(row.spend || 0)
  const revenue = Number(row.revenue || 0)
  const clicks = Number(row.clicks || 0)
  return {
    spend,
    revenue,
    clicks,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : Number(row.roas || 0),
    acos: revenue > 0 ? Math.round((spend / revenue) * 10000) / 100 : Number(row.acos || 0)
  }
}

function isAdsGuardSelectableCampaignId(value) {
  const id = cleanAdsGuardText(value)
  const lower = id.toLowerCase()
  if (!id) return false
  if (id.includes(':')) return false
  if (lower.startsWith('all_') || lower.startsWith('summary_') || lower.startsWith('shop_level_')) return false
  return true
}

export async function listAdsGuardCampaignCatalog(env, options = {}) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_ads_campaign_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      campaign_id TEXT DEFAULT '',
      campaign_name TEXT DEFAULT '',
      campaign_type TEXT DEFAULT '',
      product_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      spend REAL DEFAULT 0,
      revenue REAL DEFAULT 0,
      orders INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      ctr REAL DEFAULT 0,
      cpc REAL DEFAULT 0,
      cvr REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      acos REAL DEFAULT 0,
      status TEXT DEFAULT '',
      snapshot_date TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  const platform = cleanAdsGuardText(options.platform).toLowerCase()
  const shop = cleanAdsGuardText(options.shop)
  const limit = Math.min(Math.max(Number(options.limit || 150) || 150, 1), 500)
  const conds = []
  const params = []
  if (platform) {
    conds.push('LOWER(platform) = ?')
    params.push(platform)
  }
  if (shop) {
    conds.push('LOWER(shop) = LOWER(?)')
    params.push(shop)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, campaign_id, campaign_name, campaign_type, product_sku,
           product_name, status, raw_data,
           MAX(snapshot_date) AS latest_snapshot_date,
           MAX(updated_at) AS latest_updated_at,
           SUM(spend) AS spend,
           SUM(revenue) AS revenue,
           SUM(orders) AS orders,
           SUM(impressions) AS impressions,
           SUM(clicks) AS clicks,
           AVG(cpc) AS cpc,
           AVG(cvr) AS cvr,
           AVG(roas) AS roas,
           AVG(acos) AS acos
    FROM marketplace_ads_campaign_snapshots
    ${where}
    GROUP BY platform, shop, campaign_id, COALESCE(product_sku, '')
    ORDER BY latest_snapshot_date DESC, spend DESC, clicks DESC
    LIMIT ${limit}
  `).bind(...params).all()

  const rows = (results || []).map(row => {
    const raw = adsGuardRawData(row.raw_data)
    const adgroupId = cleanAdsGuardText(firstAdsGuardValue(raw, ['adgroup_id', 'ad_group_id', 'adgroupId', 'adGroupId']))
    const adgroupName = cleanAdsGuardText(firstAdsGuardValue(raw, ['adgroup_name', 'ad_group_name', 'adgroupName', 'adGroupName']))
    const budget = Number(firstAdsGuardValue(raw, ['daily_budget', 'budget', 'campaign_budget', 'total_budget']) || 0) || 0
    return {
      platform: cleanAdsGuardText(row.platform).toLowerCase(),
      shop: cleanAdsGuardText(row.shop),
      campaign_id: cleanAdsGuardText(row.campaign_id),
      campaign_name: cleanAdsGuardText(row.campaign_name || row.product_name || row.campaign_id),
      adgroup_id: adgroupId,
      adgroup_name: adgroupName,
      campaign_type: cleanAdsGuardText(row.campaign_type),
      product_sku: cleanAdsGuardText(row.product_sku),
      product_name: cleanAdsGuardText(row.product_name),
      status: cleanAdsGuardText(row.status),
      budget,
      latest_snapshot_date: cleanAdsGuardText(row.latest_snapshot_date),
      ...adsGuardCampaignMetric(row)
    }
  }).filter(row => isAdsGuardSelectableCampaignId(row.campaign_id))
  return {
    status: 'ok',
    mode: 'ads_guard_campaign_catalog',
    platform,
    shop,
    rows,
    empty_state: rows.length ? '' : 'Chưa có snapshot campaign ADS cho shop này. Bấm kéo ADS theo khoảng lọc trước khi preview thao tác.'
  }
}

function normalizeAdsGuardInput(options = {}, mode = 'preview') {
  return {
    mode,
    platform: cleanAdsGuardText(options.platform).toLowerCase(),
    shop: cleanAdsGuardText(options.shop),
    scope: normalizeAdsGuardScope(options.scope || options.action_scope),
    action: cleanAdsGuardText(options.action || options.edit_action).toLowerCase(),
    route_key: cleanAdsGuardText(options.route_key || options.routeKey).toLowerCase(),
    entity_id: cleanAdsGuardText(options.entity_id || options.campaign_id || options.adgroup_id || options.entityId),
    campaign_name: cleanAdsGuardText(options.campaign_name || options.campaignName),
    start_date: cleanAdsGuardText(options.start_date || options.startDate),
    end_date: cleanAdsGuardText(options.end_date || options.endDate),
    budget: options.budget,
    roas_target: options.roas_target ?? options.roasTarget,
    enhanced_cpc: options.enhanced_cpc ?? options.enhancedCpc,
    status_value: normalizeAdsGuardStatusValue(options.status_value || options.statusValue || options.switch_status || options.switchStatus),
    selected_keywords: parseAdsGuardKeywords(options.selected_keywords || options.selectedKeywords || options.keywords_json || options.keywordsJson),
    biz_code: normalizeLazadaBizCode(options.biz_code || options.bizCode),
    confirm_text: cleanAdsGuardText(options.confirm_text || options.confirmText)
  }
}

async function previewOrApplyShopeeCampaign(env, input, applyMode) {
  const routeKey = normalizeShopeeGuardRouteKey(input.route_key)
  const action = input.action || 'pause'
  const base = {
    shop: input.shop,
    campaign_id: input.entity_id,
    edit_action: action,
    budget: input.budget,
    start_date: input.start_date,
    end_date: input.end_date,
    roas_target: input.roas_target,
    enhanced_cpc: input.enhanced_cpc,
    reference_id: buildAdsGuardReferenceId(routeKey, input.entity_id),
    apply: applyMode,
    safe_mode: ['change_budget', 'change_roas_target', 'change_duration', 'change_enhanced_cpc'].includes(action) ? false : true
  }
  if (routeKey === 'shopee_auto') {
    return {
      route_key: routeKey,
      endpoint: '/api/v2/ads/edit_auto_product_ads',
      response: await editShopeeAutoProductAds(env, {
        ...base,
        confirm_apply: applyMode ? 'EDIT_SHOPEE_AUTO_PRODUCT_ADS' : ''
      })
    }
  }
  return {
    route_key: routeKey,
    endpoint: '/api/v2/ads/edit_manual_product_ads',
    response: await editShopeeManualProductAds(env, {
      ...base,
      confirm_apply: applyMode ? 'EDIT_SHOPEE_MANUAL_PRODUCT_ADS' : ''
    })
  }
}

async function previewOrApplyShopeeKeywords(env, input, applyMode) {
  return {
    route_key: 'shopee_keyword',
    endpoint: '/api/v2/ads/edit_manual_product_ad_keywords',
    response: await editShopeeManualProductAdKeywords(env, {
      shop: input.shop,
      campaign_id: input.entity_id,
      selected_keywords: input.selected_keywords,
      reference_id: buildAdsGuardReferenceId('shopee_keyword', input.entity_id),
      apply: applyMode,
      confirm_apply: applyMode ? 'EDIT_SHOPEE_AD_KEYWORDS' : ''
    })
  }
}

async function previewOrApplyLazadaCampaign(env, input, applyMode) {
  return {
    route_key: 'lazada_campaign',
    endpoint: '/sponsor/solutions/campaign/updateCampaign',
    response: await updateLazadaAdsCampaign(env, {
      shop: input.shop,
      campaign_id: input.entity_id,
      campaign_name: input.campaign_name,
      start_date: input.start_date,
      end_date: input.end_date,
      budget: input.budget,
      switch_status: input.status_value,
      biz_code: input.biz_code,
      apply: applyMode,
      confirm_apply: applyMode ? 'UPDATE_LAZADA_ADS_CAMPAIGN' : ''
    })
  }
}

async function previewOrApplyLazadaAdgroup(env, input, applyMode) {
  return {
    route_key: 'lazada_adgroup',
    endpoint: '/sponsor/solutions/adgroup/updateAdgroupBatch',
    response: await updateLazadaAdsAdgroupBatch(env, {
      shop: input.shop,
      adgroup_id: input.entity_id,
      switch_status: input.status_value,
      biz_code: input.biz_code,
      apply: applyMode,
      confirm_apply: applyMode ? 'UPDATE_LAZADA_ADS_ADGROUP' : ''
    })
  }
}

function buildLazadaSignWarning(accountInfo = {}, latestInfo = {}) {
  const currentMessage = extractAdsGuardErrorMessage(accountInfo)
  const latestMessage = extractAdsGuardErrorMessage(latestInfo)
  return cleanAdsGuardText([currentMessage, latestMessage].filter(Boolean).join(' | '))
}

export async function runAdsCampaignGuard(env, options = {}) {
  await ensureAdsCampaignGuardTable(env)
  const mode = cleanAdsGuardText(options.mode).toLowerCase() === 'apply' ? 'apply' : 'preview'
  const input = normalizeAdsGuardInput(options, mode)
  if (!input.platform || !input.shop) {
    const result = {
      status: 'error',
      mode,
      platform: input.platform,
      shop: input.shop,
      scope: input.scope,
      action: input.action,
      entity_id: input.entity_id,
      can_apply: false,
      endpoint: '',
      request_id: '',
      request_payload: input,
      message: 'Thiếu platform hoặc shop để chạy ADS guard.'
    }
    result.log_id = await saveAdsCampaignGuardLog(env, {
      platform: input.platform,
      shop: input.shop,
      capability_mode: 'unknown',
      ads_transport_mode: 'manual_reference',
      action_scope: input.scope,
      action_name: input.action,
      route_key: input.route_key,
      entity_id: input.entity_id,
      mode,
      status: result.status,
      endpoint: '',
      request_id: '',
      request_payload: input,
      response_payload: result,
      error_message: result.message
    })
    return result
  }

  const capabilityRow = await resolveAdsGuardShop(env, input.platform, input.shop)
  if (!capabilityRow) {
    const result = buildAdsGuardBlockedResult({}, input, 'Không tìm thấy shop trong cấu hình ADS hiện có.')
    result.log_id = await saveAdsCampaignGuardLog(env, {
      platform: input.platform,
      shop: input.shop,
      capability_mode: 'missing_shop',
      ads_transport_mode: 'manual_reference',
      action_scope: input.scope,
      action_name: input.action,
      route_key: input.route_key,
      entity_id: input.entity_id,
      mode,
      status: result.status,
      endpoint: '',
      request_payload: input,
      response_payload: result,
      error_message: result.message
    })
    return result
  }

  const capability = mapAdsGuardCapability(capabilityRow)
  if (capability.ads_transport_mode !== 'api_sync' || !capability.supports_ads_guard_preview) {
    const result = buildAdsGuardBlockedResult(capabilityRow, input, capability.ads_transport_guide)
    result.log_id = await saveAdsCampaignGuardLog(env, {
      platform: capability.platform,
      shop: capability.shop,
      capability_mode: capability.capability_mode,
      ads_transport_mode: capability.ads_transport_mode,
      action_scope: input.scope,
      action_name: input.action,
      route_key: input.route_key,
      entity_id: input.entity_id,
      mode,
      status: result.status,
      endpoint: '',
      request_payload: input,
      response_payload: result,
      error_message: result.message
    })
    return result
  }

  if (mode === 'apply' && input.confirm_text !== ADS_GUARD_CONFIRM_PHRASE) {
    const result = {
      status: 'error',
      mode,
      platform: capability.platform,
      shop: capability.shop,
      capability,
      scope: input.scope,
      action: input.action,
      entity_id: input.entity_id,
      can_apply: false,
      endpoint: '',
      request_id: '',
      request_payload: input,
      message: `Thiếu câu xác nhận đúng. Hãy nhập chính xác: ${ADS_GUARD_CONFIRM_PHRASE}`
    }
    result.log_id = await saveAdsCampaignGuardLog(env, {
      platform: capability.platform,
      shop: capability.shop,
      capability_mode: capability.capability_mode,
      ads_transport_mode: capability.ads_transport_mode,
      action_scope: input.scope,
      action_name: input.action,
      route_key: input.route_key,
      entity_id: input.entity_id,
      mode,
      status: result.status,
      endpoint: '',
      request_payload: input,
      response_payload: result,
      error_message: result.message
    })
    return result
  }

  let routeResult = null
  let lazadaSignInfo = null
  let lazadaLatestSignInfo = null

  if (capability.platform === 'shopee' && input.scope === 'keyword') {
    routeResult = await previewOrApplyShopeeKeywords(env, input, mode === 'apply')
  } else if (capability.platform === 'shopee') {
    routeResult = await previewOrApplyShopeeCampaign(env, input, mode === 'apply')
  } else if (capability.platform === 'lazada' && input.scope === 'adgroup') {
    lazadaSignInfo = await fetchLazadaAdsAccountSignInfo(env, { shop: input.shop })
    lazadaLatestSignInfo = await fetchLazadaAdsLatestSignInfo(env, { shop: input.shop })
    routeResult = await previewOrApplyLazadaAdgroup(env, input, mode === 'apply')
  } else if (capability.platform === 'lazada') {
    lazadaSignInfo = await fetchLazadaAdsAccountSignInfo(env, { shop: input.shop })
    lazadaLatestSignInfo = await fetchLazadaAdsLatestSignInfo(env, { shop: input.shop })
    routeResult = await previewOrApplyLazadaCampaign(env, input, mode === 'apply')
  } else {
    const result = buildAdsGuardBlockedResult(capabilityRow, input, capability.ads_transport_guide)
    result.log_id = await saveAdsCampaignGuardLog(env, {
      platform: capability.platform,
      shop: capability.shop,
      capability_mode: capability.capability_mode,
      ads_transport_mode: capability.ads_transport_mode,
      action_scope: input.scope,
      action_name: input.action,
      route_key: input.route_key,
      entity_id: input.entity_id,
      mode,
      status: result.status,
      endpoint: '',
      request_payload: input,
      response_payload: result,
      error_message: result.message
    })
    return result
  }

  const response = routeResult?.response || {}
  const requestId = extractAdsGuardRequestId(response)
  const errorMessage = extractAdsGuardErrorMessage(response)
  const result = {
    status: cleanAdsGuardText(response.status) || (errorMessage ? 'error' : 'ok'),
    mode,
    platform: capability.platform,
    shop: capability.shop,
    capability,
    scope: input.scope,
    scope_label: adsGuardScopeLabel(input.scope),
    action: input.action,
    entity_id: input.entity_id,
    route_key: routeResult?.route_key || input.route_key,
    can_apply: mode === 'preview' && capability.supports_ads_guard_apply === 1 && response.status !== 'error',
    endpoint: routeResult?.endpoint || '',
    request_id: requestId,
    request_payload: response.request_payload || input,
    preview_only: response.dry_run !== false,
    applied: response.applied === true,
    message: humanizeAdsGuardMessage(
      response.note || response.message || response.warning || '',
      mode
    ),
    warning: cleanAdsGuardText(response.warning),
    errors: Array.isArray(response.errors) ? response.errors : [],
    response
  }

  if (lazadaSignInfo || lazadaLatestSignInfo) {
    result.lazada_sign = {
      current: lazadaSignInfo,
      latest: lazadaLatestSignInfo,
      warning: buildLazadaSignWarning(lazadaSignInfo || {}, lazadaLatestSignInfo || {})
    }
  }

  result.log_id = await saveAdsCampaignGuardLog(env, {
    platform: capability.platform,
    shop: capability.shop,
    capability_mode: capability.capability_mode,
    ads_transport_mode: capability.ads_transport_mode,
    action_scope: input.scope,
    action_name: input.action,
    route_key: routeResult?.route_key || input.route_key,
    entity_id: input.entity_id,
    mode,
    status: result.status,
    endpoint: result.endpoint,
    request_id: requestId,
    request_payload: result.request_payload,
    response_payload: {
      status: result.status,
      message: result.message,
      warning: result.warning,
      errors: result.errors,
      request_id: result.request_id,
      preview_only: result.preview_only,
      applied: result.applied,
      lazada_sign: result.lazada_sign || null
    },
    error_message: errorMessage
  })
  return result
}
