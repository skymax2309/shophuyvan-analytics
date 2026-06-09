import { ensureShopeeVideoAuthColumns } from '../shops/shopee-video-auth-core.js'
import { ensureShopSyncDiagnosticsColumns } from '../../modules/api-sync/sync-diagnostics.js'

/**
 * Core này chuẩn hóa khả năng vận hành sản phẩm theo từng shop/sàn.
 * Mục tiêu là tách rõ luồng shop có API và shop không có API để các route/UI
 * không tự suy đoán rải rác ở nhiều nơi.
 */

function cleanCapabilityText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

const ORDER_SOURCE_MODES = {
  API_SYNC: 'api_sync',
  BROWSER_SYNC: 'browser_sync',
  IMPORT_FILE_SYNC: 'import_file_sync',
  MANUAL_REFERENCE: 'manual_reference'
}

function normalizeCapabilityOrderSourceMode(value) {
  const text = cleanCapabilityText(value).toLowerCase()
  if (Object.values(ORDER_SOURCE_MODES).includes(text)) return text
  if (text.includes('api')) return ORDER_SOURCE_MODES.API_SYNC
  if (text.includes('browser')) return ORDER_SOURCE_MODES.BROWSER_SYNC
  if (text.includes('import') || text.includes('file')) return ORDER_SOURCE_MODES.IMPORT_FILE_SYNC
  return ORDER_SOURCE_MODES.MANUAL_REFERENCE
}

function orderSourceModeLabel(mode) {
  if (mode === ORDER_SOURCE_MODES.API_SYNC) return 'API'
  if (mode === ORDER_SOURCE_MODES.BROWSER_SYNC) return 'Browser'
  if (mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC) return 'Import'
  return 'Manual'
}

function orderSourceModeGuide(mode) {
  // Nhãn này giúp vận hành phân biệt API thật với fallback, không tự suy đoán từ UI.
  if (mode === ORDER_SOURCE_MODES.API_SYNC) return 'Open Platform API'
  if (mode === ORDER_SOURCE_MODES.BROWSER_SYNC) return 'Browser/helper có log'
  if (mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC) return 'File import chuẩn hóa'
  return 'Tham chiếu tay có log'
}

function orderSourceModeRank(mode) {
  if (mode === ORDER_SOURCE_MODES.API_SYNC) return 400
  if (mode === ORDER_SOURCE_MODES.BROWSER_SYNC) return 300
  if (mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC) return 200
  return 100
}

function capabilityModeToOrderSourceMode(mode) {
  const text = cleanCapabilityText(mode).toLowerCase()
  if (text === 'api_active') return ORDER_SOURCE_MODES.API_SYNC
  if (text === 'browser_reference') return ORDER_SOURCE_MODES.BROWSER_SYNC
  if (text === 'import_reference') return ORDER_SOURCE_MODES.IMPORT_FILE_SYNC
  return ORDER_SOURCE_MODES.MANUAL_REFERENCE
}

const WORKER_CRON_ORDER_PLATFORMS = new Set(['shopee', 'lazada'])
const SHOP_CAPABILITY_CACHE_TTL_MS = 60 * 1000
const shopCapabilityListCache = new Map()

function cloneCapabilityRows(rows = []) {
  return rows.map(row => ({
    ...row,
    order_source_breakdown: Array.isArray(row.order_source_breakdown)
      ? row.order_source_breakdown.map(item => ({ ...item }))
      : []
  }))
}

function capabilityCacheKey(options = {}) {
  return JSON.stringify({
    platform: cleanCapabilityText(options.platform).toLowerCase(),
    shop: cleanCapabilityText(options.shop || options.search).toLowerCase(),
    limit: Math.min(Math.max(Number(options.limit || 200) || 200, 1), 500)
  })
}

function readCapabilityCache(key) {
  const cached = shopCapabilityListCache.get(key)
  if (!cached || cached.expiresAt <= Date.now()) {
    shopCapabilityListCache.delete(key)
    return null
  }
  return cloneCapabilityRows(cached.rows)
}

function writeCapabilityCache(key, rows = []) {
  shopCapabilityListCache.set(key, {
    expiresAt: Date.now() + SHOP_CAPABILITY_CACHE_TTL_MS,
    rows: cloneCapabilityRows(rows)
  })
}

export function nextWorkerCronSyncAt(now = new Date(), intervalMinutes = 5) {
  const date = now instanceof Date ? now : new Date(now)
  const timestamp = Number.isFinite(date.getTime()) ? date.getTime() : Date.now()
  const intervalMs = Math.max(1, Number(intervalMinutes) || 5) * 60 * 1000
  return new Date(Math.ceil((timestamp + 1) / intervalMs) * intervalMs).toISOString()
}

export function buildOrderRunnerDiagnostic(row = {}) {
  const platform = cleanCapabilityText(row.platform).toLowerCase()
  const capabilityMode = cleanCapabilityText(row.capability_mode).toLowerCase()
  const sourceMode = normalizeCapabilityOrderSourceMode(
    row.order_sync_mode || row.order_source_mode || capabilityModeToOrderSourceMode(capabilityMode)
  )
  const isApiRunner = capabilityMode === 'api_active' || sourceMode === ORDER_SOURCE_MODES.API_SYNC

  if (isApiRunner && WORKER_CRON_ORDER_PLATFORMS.has(platform)) {
    const nextSyncAt = nextWorkerCronSyncAt()
    return {
      order_runner_type: 'worker_cron_api',
      order_runner_name: 'Cloudflare Cron syncApiOrders/syncApiOrderStatuses',
      order_runner_schedule: '*/5 * * * *',
      order_runner_scope: 'shopee,lazada',
      order_runner_running_source: 'apps/worker-api/src/index.js scheduled handler + wrangler.toml',
      order_runner_configured: 1,
      order_runner_running: 1,
      order_runner_status: 'scheduled',
      order_runner_status_label: 'Cron API đã cấu hình',
      order_runner_missing_message: '',
      api_realtime_enabled: 1,
      cron_source: 'cloudflare_scheduled_handler',
      next_sync_at: nextSyncAt,
      next_order_sync_at: nextSyncAt,
      next_status_sync_at: nextSyncAt
    }
  }

  if (platform === 'tiktok') {
    return {
      order_runner_type: 'local_tiktok_automation_runner',
      order_runner_name: 'TikTok Seller Center runner có lock/pause/heartbeat',
      order_runner_schedule: 'local helper /tiktok-runner/*, poll 60s, cooldown/backoff theo lock',
      order_runner_scope: 'tiktok_manual_status,tiktok_seller_detail_finance_jobs',
      order_runner_running_source: 'local_helper_health',
      order_runner_configured: 1,
      order_runner_running: '',
      order_runner_status: 'needs_local_health',
      order_runner_status_label: 'Cần kiểm tra TikTok runner local',
      order_runner_missing_message: 'TikTok runner phải dùng profile automation riêng, không dùng profile user.'
    }
  }

  if (sourceMode === ORDER_SOURCE_MODES.BROWSER_SYNC) {
    return {
      order_runner_type: 'local_radar_browser',
      order_runner_name: 'Local Radar helper',
      order_runner_schedule: 'Radar local nhận job browser/helper khi có lệnh',
      order_runner_scope: 'browser_sync_jobs',
      order_runner_running_source: 'local_helper_health',
      order_runner_configured: 1,
      order_runner_running: '',
      order_runner_status: 'needs_local_health',
      order_runner_status_label: 'Cần kiểm tra Radar local',
      order_runner_missing_message: 'Chưa có runner tự động nếu Radar local không chạy.'
    }
  }

  return {
    order_runner_type: sourceMode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC
      ? 'local_report_worker'
      : 'manual_import_or_report_worker',
    order_runner_name: sourceMode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC
      ? 'Local report_worker import đơn'
      : 'Manual import / Local report_worker',
    order_runner_schedule: 'run_report_jobs.py --watch, poll 60s khi helper local bật; manual import chỉ chạy khi người vận hành/import job tạo lệnh',
    order_runner_scope: 'manual,import,browser_fallback_jobs',
    order_runner_running_source: 'local_helper_health',
    order_runner_configured: 1,
    order_runner_running: '',
    order_runner_status: 'needs_local_health',
    order_runner_status_label: 'Cần kiểm tra report_worker local',
    order_runner_missing_message: 'Chưa có runner tự động nếu report_worker local không chạy.'
  }
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

async function loadRecentOrderSourceSummary(env, options = {}) {
  const platformFilter = cleanCapabilityText(options.platform).toLowerCase()
  const conds = [`COALESCE(NULLIF(source_updated_at, ''), NULLIF(oms_updated_at, ''), NULLIF(order_date, '')) IS NOT NULL`]
  const binds = []
  if (platformFilter) {
    conds.push(`LOWER(COALESCE(platform, '')) = ?`)
    binds.push(platformFilter)
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT LOWER(COALESCE(platform, '')) AS platform,
             TRIM(COALESCE(shop, '')) AS shop,
             COALESCE(NULLIF(source_mode, ''), '${ORDER_SOURCE_MODES.MANUAL_REFERENCE}') AS source_mode,
             MAX(COALESCE(NULLIF(source_updated_at, ''), NULLIF(oms_updated_at, ''), NULLIF(order_date, ''))) AS last_source_at,
             COUNT(*) AS total_orders_7d,
             SUM(CASE
               WHEN datetime(COALESCE(NULLIF(source_updated_at, ''), NULLIF(oms_updated_at, ''), NULLIF(order_date, ''))) >= datetime('now', '+7 hours', '-1 day')
               THEN 1 ELSE 0
             END) AS touched_24h
      FROM orders_v2
      WHERE ${conds.join(' AND ')}
        AND datetime(COALESCE(NULLIF(source_updated_at, ''), NULLIF(oms_updated_at, ''), NULLIF(order_date, ''))) >= datetime('now', '+7 hours', '-7 days')
      GROUP BY LOWER(COALESCE(platform, '')), TRIM(COALESCE(shop, '')), COALESCE(NULLIF(source_mode, ''), '${ORDER_SOURCE_MODES.MANUAL_REFERENCE}')
    `).bind(...binds).all()

    const summary = new Map()
    for (const row of results || []) {
      const platform = cleanCapabilityText(row.platform).toLowerCase()
      const shop = cleanCapabilityText(row.shop)
      if (!platform || !shop) continue
      const key = `${platform}|${shop.toLowerCase()}`
      if (!summary.has(key)) summary.set(key, [])
      summary.get(key).push({
        source_mode: normalizeCapabilityOrderSourceMode(row.source_mode),
        last_source_at: cleanCapabilityText(row.last_source_at),
        total_orders_7d: Number(row.total_orders_7d || 0) || 0,
        touched_24h: Number(row.touched_24h || 0) || 0
      })
    }
    return summary
  } catch (error) {
    console.warn('[SHOP_CAPABILITY_ORDER_SOURCE]', error?.message || String(error))
    return new Map()
  }
}

function shopAliasKeys(row = {}) {
  const platform = cleanCapabilityText(row.platform).toLowerCase()
  return [...new Set([row.shop_name, row.user_name, row.api_shop_id]
    .map(value => cleanCapabilityText(value).toLowerCase())
    .filter(Boolean)
    .map(value => `${platform}|${value}`))]
}

function attachOrderSourceSummary(row, orderSourceSummary) {
  const modeSummary = new Map()
  for (const key of shopAliasKeys(row)) {
    for (const item of orderSourceSummary.get(key) || []) {
      const mode = normalizeCapabilityOrderSourceMode(item.source_mode)
      const current = modeSummary.get(mode) || {
        source_mode: mode,
        last_source_at: '',
        total_orders_7d: 0,
        touched_24h: 0
      }
      current.total_orders_7d += Number(item.total_orders_7d || 0) || 0
      current.touched_24h += Number(item.touched_24h || 0) || 0
      if (String(item.last_source_at || '').localeCompare(String(current.last_source_at || '')) > 0) {
        current.last_source_at = item.last_source_at || ''
      }
      modeSummary.set(mode, current)
    }
  }

  const fallbackMode = capabilityModeToOrderSourceMode(row.capability_mode)
  const preferredMode = row.capability_mode === 'api_active'
    ? (modeSummary.has(ORDER_SOURCE_MODES.API_SYNC) ? ORDER_SOURCE_MODES.API_SYNC : fallbackMode)
    : [...modeSummary.values()]
        .sort((a, b) =>
          orderSourceModeRank(b.source_mode) - orderSourceModeRank(a.source_mode)
          || String(b.last_source_at || '').localeCompare(String(a.last_source_at || ''))
        )[0]?.source_mode || fallbackMode
  const selected = modeSummary.get(preferredMode) || null
  const breakdown = [...modeSummary.values()].sort((a, b) =>
    orderSourceModeRank(b.source_mode) - orderSourceModeRank(a.source_mode)
    || String(b.last_source_at || '').localeCompare(String(a.last_source_at || ''))
  )

  const sourceFields = {
    ...row,
    order_sync_mode: preferredMode,
    order_source_mode: preferredMode,
    order_sync_mode_label: orderSourceModeLabel(preferredMode),
    order_source_mode_label: orderSourceModeLabel(preferredMode),
    order_sync_source_label: orderSourceModeGuide(preferredMode),
    order_source_guide: orderSourceModeGuide(preferredMode),
    last_order_source_at: selected?.last_source_at || '',
    last_order_source_orders_7d: breakdown.reduce((sum, item) => sum + Number(item.total_orders_7d || 0), 0),
    last_order_source_touched_24h: breakdown.reduce((sum, item) => sum + Number(item.touched_24h || 0), 0),
    order_source_breakdown: breakdown
  }
  return {
    ...sourceFields,
    ...buildOrderRunnerDiagnostic(sourceFields)
  }
}

async function loadShopOperationDiagnosticSummary(env, options = {}) {
  const platformFilter = cleanCapabilityText(options.platform).toLowerCase()
  const statusWhere = [`LOWER(COALESCE(platform, '')) IN ('shopee', 'lazada', 'tiktok')`]
  const labelWhere = [`LOWER(COALESCE(o.platform, '')) IN ('shopee', 'lazada', 'tiktok')`]
  const statusBinds = []
  const labelBinds = []
  if (platformFilter) {
    statusWhere.push(`LOWER(COALESCE(platform, '')) = ?`)
    labelWhere.push(`LOWER(COALESCE(o.platform, '')) = ?`)
    statusBinds.push(platformFilter)
    labelBinds.push(platformFilter)
  }

  const summary = new Map()
  const merge = (row = {}) => {
    const platform = cleanCapabilityText(row.platform).toLowerCase()
    const shop = cleanCapabilityText(row.shop)
    if (!platform || !shop) return
    const key = `${platform}|${shop.toLowerCase()}`
    summary.set(key, { ...(summary.get(key) || {}), ...row, platform, shop })
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT LOWER(COALESCE(platform, '')) AS platform,
             TRIM(COALESCE(shop, '')) AS shop,
             MAX(COALESCE(last_status_sync_at, '')) AS status_runner_last_run_at,
             MAX(COALESCE(last_status_sync_status, '')) AS status_runner_last_status,
             MAX(COALESCE(last_status_sync_error, '')) AS status_runner_last_error,
             SUM(CASE WHEN COALESCE(last_status_sync_status, '') = 'error' THEN 1 ELSE 0 END) AS status_runner_error_count,
             SUM(CASE WHEN COALESCE(next_retry_at, '') != '' THEN 1 ELSE 0 END) AS pending_next_retry_count,
             MAX(CASE WHEN COALESCE(status_source, '') = 'shopee_seller_center_detail' THEN COALESCE(last_status_sync_at, '') ELSE '' END) AS detail_parser_last_run_at,
             MAX(CASE WHEN COALESCE(status_source, '') = 'shopee_seller_center_detail' THEN COALESCE(last_status_sync_status, '') ELSE '' END) AS detail_parser_last_status,
             MAX(CASE WHEN COALESCE(status_source, '') = 'shopee_seller_center_detail' THEN COALESCE(last_status_sync_error, '') ELSE '' END) AS detail_parser_last_error,
             SUM(CASE WHEN COALESCE(status_source, '') = 'shopee_seller_center_detail' THEN 1 ELSE 0 END) AS detail_parser_touched_count
      FROM orders_v2
      WHERE ${statusWhere.join(' AND ')}
      GROUP BY LOWER(COALESCE(platform, '')), TRIM(COALESCE(shop, ''))
    `).bind(...statusBinds).all()
    for (const row of results || []) merge(row)
  } catch (error) {
    console.warn('[SHOP_OPERATION_STATUS_DIAGNOSTIC]', error?.message || String(error))
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT LOWER(COALESCE(o.platform, '')) AS platform,
             TRIM(COALESCE(o.shop, '')) AS shop,
             MAX(COALESCE(ol.refreshed_at, '')) AS label_runner_last_run_at,
             MAX(COALESCE(ol.error, '')) AS label_runner_last_error,
             SUM(CASE WHEN COALESCE(ol.error, '') = 'manual_required' THEN 1 ELSE 0 END) AS label_manual_required_count,
             SUM(CASE WHEN COALESCE(ol.error, '') NOT IN ('', 'not_found', 'manual_required') THEN 1 ELSE 0 END) AS label_runner_error_count
      FROM orders_v2 o
      LEFT JOIN order_labels ol ON ol.order_id = o.order_id
      WHERE ${labelWhere.join(' AND ')}
      GROUP BY LOWER(COALESCE(o.platform, '')), TRIM(COALESCE(o.shop, ''))
    `).bind(...labelBinds).all()
    for (const row of results || []) merge(row)
  } catch (error) {
    console.warn('[SHOP_OPERATION_LABEL_DIAGNOSTIC]', error?.message || String(error))
  }

  return summary
}

function attachShopOperationDiagnostics(row, diagnosticSummary) {
  const merged = {}
  for (const key of shopAliasKeys(row)) Object.assign(merged, diagnosticSummary.get(key) || {})
  const labelErrorCount = Number(merged.label_runner_error_count || 0) || 0
  const manualRequiredCount = Number(merged.label_manual_required_count || 0) || 0
  const detailError = cleanCapabilityText(merged.detail_parser_last_error)
  return {
    ...row,
    status_runner_last_run_at: cleanCapabilityText(merged.status_runner_last_run_at),
    status_runner_last_status: cleanCapabilityText(merged.status_runner_last_status),
    status_runner_last_error: cleanCapabilityText(merged.status_runner_last_error),
    status_runner_error_count: Number(merged.status_runner_error_count || 0) || 0,
    pending_next_retry_count: Number(merged.pending_next_retry_count || 0) || 0,
    detail_parser_last_run_at: cleanCapabilityText(merged.detail_parser_last_run_at),
    detail_parser_last_status: detailError ? 'error' : cleanCapabilityText(merged.detail_parser_last_status),
    detail_parser_last_error: detailError,
    detail_parser_touched_count: Number(merged.detail_parser_touched_count || 0) || 0,
    label_runner_last_run_at: cleanCapabilityText(merged.label_runner_last_run_at),
    label_runner_last_status: labelErrorCount ? 'error' : (manualRequiredCount ? 'manual_required' : (merged.label_runner_last_run_at ? 'ok' : '')),
    label_runner_last_error: cleanCapabilityText(merged.label_runner_last_error),
    label_manual_required_count: manualRequiredCount,
    label_runner_error_count: labelErrorCount
  }
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

export function buildLabelDownloadCapability(row = {}) {
  const platform = cleanCapabilityText(row.platform).toLowerCase()
  const mode = cleanCapabilityText(row.capability_mode).toLowerCase()
  const shopKey = cleanCapabilityText(row.user_name || row.shop_name || row.api_shop_id).toLowerCase()
  const accessLive = truthyCapabilityFlag(row.access_token_live)
  const refreshLive = truthyCapabilityFlag(row.refresh_token_live)
  const hasApiShopId = Boolean(cleanCapabilityText(row.api_shop_id))
  const hasAnyApiConfig = truthyCapabilityFlag(row.has_any_api_config)
    || truthyCapabilityFlag(row.has_access_token)
    || truthyCapabilityFlag(row.has_refresh_token)
    || hasApiShopId
  const apiActive = mode === 'api_active'

  if (platform === 'shopee') {
    if (apiActive && accessLive && refreshLive && hasApiShopId) {
      return {
        label_download_mode: 'api_document_generation_then_download',
        label_download_supported: true,
        label_download_source: 'shopee_open_platform:logistics.create_shipping_document>get_shipping_document_result>download_shipping_document',
        label_download_reason: 'Dùng flow chứng từ in chính thức: create_shipping_document, get_shipping_document_result READY rồi download_shipping_document. Đây là tạo file in/waybill, không gọi endpoint đổi trạng thái giao hàng.',
        label_download_read_only: true,
        label_download_requires_manual: false,
        label_document_generation_supported: true,
        label_fulfillment_action_allowed: false
      }
    }
    if (shopKey === 'khogiadungcona') {
      return {
        label_download_mode: 'local_chrome_retry_label',
        label_download_supported: true,
        label_download_source: 'local_python_chrome:platforms/shopee/orders/taitem.py',
        label_download_reason: 'Shop Shopee no-API dùng Chrome automation profile cố định để tải lại tem đã có; không gọi ship_order, arrange, confirm hoặc cancel.',
        label_download_read_only: true,
        label_download_requires_manual: false,
        label_document_generation_supported: false,
        label_fulfillment_action_allowed: false
      }
    }
    return {
      label_download_mode: 'manual_required',
      label_download_supported: false,
      label_download_source: hasAnyApiConfig ? 'shopee_api_token_not_ready' : 'shopee_manual_or_browser',
      label_download_reason: hasAnyApiConfig
        ? 'Shop Shopee có cấu hình API nhưng token/quyền chưa đủ để bật tải tem read-only.'
        : 'Shop Shopee chưa có API tải tem an toàn; cần tải thủ công/helper có kiểm soát, không gọi API giả.',
      label_download_read_only: false,
      label_download_requires_manual: true
    }
  }

  if (platform === 'lazada') {
    if (apiActive && accessLive && hasApiShopId) {
      return {
        label_download_mode: 'api_print_awb_read_only',
        label_download_supported: true,
        label_download_source: 'lazada_fulfillment:order.package.document.get',
        label_download_reason: 'Dùng PrintAWB/package document API để đọc file AWB/tem. Không gọi RTS, arrange, cancel hoặc thao tác logistics ghi.',
        label_download_read_only: true,
        label_download_requires_manual: false
      }
    }
    return {
      label_download_mode: 'manual_required',
      label_download_supported: false,
      label_download_source: hasAnyApiConfig ? 'lazada_api_token_not_ready' : 'lazada_manual',
      label_download_reason: hasAnyApiConfig
        ? 'Shop Lazada có cấu hình API nhưng token/quyền chưa đủ để bật PrintAWB read-only.'
        : 'Shop Lazada chưa có API tải tem an toàn; cần xử lý thủ công/import có log.',
      label_download_read_only: false,
      label_download_requires_manual: true
    }
  }

  if (platform === 'tiktok') {
    if (!shopKey || shopKey === '0909128999') {
      return {
        label_download_mode: 'local_chrome_retry_label',
        label_download_supported: true,
        label_download_source: 'local_python_chrome:platforms/tiktok/orders/taitem.py',
        label_download_reason: 'TikTok no-API dùng Chrome automation profile cố định để tải lại tem đã có; nếu đơn còn nút sắp xếp vận chuyển thì bỏ qua.',
        label_download_read_only: true,
        label_download_requires_manual: false,
        label_document_generation_supported: false,
        label_fulfillment_action_allowed: false
      }
    }
    return {
      label_download_mode: 'manual_required',
      label_download_supported: false,
      label_download_source: 'tiktok_profile_unmapped',
      label_download_reason: 'TikTok chưa có profile automation đã map cho shop này.',
      label_download_read_only: false,
      label_download_requires_manual: true
    }
  }

  return {
    label_download_mode: 'not_supported',
    label_download_supported: false,
    label_download_source: 'unsupported_platform',
    label_download_reason: 'Sàn/shop này chưa có helper tải tem được kiểm chứng trong Core.',
    label_download_read_only: false,
    label_download_requires_manual: false
  }
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
  const labelDownloadCapability = buildLabelDownloadCapability({
    ...row,
    platform,
    capability_mode: mode,
    access_token_live: accessLive ? 1 : 0,
    refresh_token_live: refreshLive ? 1 : 0,
    has_access_token: hasAccessToken ? 1 : 0,
    has_refresh_token: hasRefreshToken ? 1 : 0,
    has_any_api_config: hasAnyApiConfig ? 1 : 0
  })

  return {
    ...row,
    capability_identity: makeCapabilityIdentity(row),
    capability_mode: mode,
    product_sync_mode: supportsProductSync ? 'api_snapshot' : syncStrategy,
    has_any_api_config: hasAnyApiConfig ? 1 : 0,
    access_token_live: accessLive ? 1 : 0,
    refresh_token_live: refreshLive ? 1 : 0,
    has_order_api_token: platform === 'tiktok' ? 0 : (mode === 'api_active' ? 1 : 0),
    order_api_available: platform === 'tiktok' ? 0 : (mode === 'api_active' ? 1 : 0),
    order_api_note: platform === 'tiktok'
      ? 'TikTok chưa có API order/token trong OMS; không polling API.'
      : (mode === 'api_active' ? 'Shop có Order API đang dùng cho cron nền.' : 'Shop chưa có Order API hợp lệ.'),
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
    ...labelDownloadCapability,
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
  const platformFilter = cleanCapabilityText(options.platform).toLowerCase()
  const needle = cleanCapabilityText(options.shop || options.search)
  const limit = Math.min(Math.max(Number(options.limit || 200) || 200, 1), 500)
  const allowCache = options.includeSecrets !== true && options.fresh !== true && options.noCache !== true
  const cacheKey = allowCache ? capabilityCacheKey({ platform: platformFilter, shop: needle, limit }) : ''
  const cachedRows = cacheKey ? readCapabilityCache(cacheKey) : null
  if (cachedRows) return cachedRows

  await ensureMarketplaceCapabilityColumns(env)
  const results = await queryMarketplaceShopRows(env, options)
  const orderSourceSummary = await loadRecentOrderSourceSummary(env, { platform: platformFilter })
  const operationDiagnosticSummary = await loadShopOperationDiagnosticSummary(env, { platform: platformFilter })

  const deduped = new Map()
  for (const raw of results || []) {
    const platform = cleanCapabilityText(raw.platform).toLowerCase()
    if (platformFilter && platform !== platformFilter) continue
    const row = attachShopOperationDiagnostics(attachOrderSourceSummary(buildMarketplaceCapability({
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
    }), orderSourceSummary), operationDiagnosticSummary)
    if (!matchShopFilter(row, needle)) continue
    const key = row.capability_identity
    const existing = deduped.get(key)
    const currentPreferred = row.capability_mode === 'api_active' || Boolean(row.shop_name && !/^Shopee\s+\d+$/i.test(row.shop_name))
    if (!existing || currentPreferred) deduped.set(key, row)
  }

  const rows = [...deduped.values()].slice(0, limit)
  if (cacheKey) writeCapabilityCache(cacheKey, rows)
  return rows
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
