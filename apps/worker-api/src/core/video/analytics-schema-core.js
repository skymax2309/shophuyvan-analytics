/**
 * Core này gom toàn bộ dữ liệu Shopee Video về một nơi:
 * - Thư viện video hiện có của từng shop
 * - Danh sách sản phẩm gắn với video
 * - Snapshot dashboard theo kỳ
 * - Cache chi tiết từng video
 *
 * Mục tiêu là để UI, cron và route chỉ đọc/ghi qua core này,
 * tránh mỗi nơi tự parse JSON theo kiểu riêng rồi khó maintain.
 */

export function cleanVideoText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function parseJsonText(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function jsonText(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

export function compactJson(value, limit = 120000) {
  const text = jsonText(value, '{}')
  return text.length > limit ? text.slice(0, limit) : text
}

export function exactDateText(value) {
  const text = cleanVideoText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function exactPeriodType(value) {
  const text = cleanVideoText(value)
  const allow = new Set(['Day', 'Week', 'Month', 'Last7d', 'Last15d', 'Last30d'])
  return allow.has(text) ? text : 'Last7d'
}

export function buildMarketplaceVideoKey(input = {}) {
  return cleanVideoText(input.video_key || input.post_id || input.video_upload_id)
}

export function statusLabel(status) {
  const code = Number(status || 0)
  if (code === 200) return 'Bản nháp'
  if (code === 300) return 'Đã đăng'
  if (code === 400) return 'Đã xóa'
  if (code === 500) return 'Đặt lịch'
  if (code === 600) return 'Đặt lịch lỗi'
  return 'Không rõ'
}

export function mergeCountMaps(rows = []) {
  const merged = {}
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const [key, value] of Object.entries(row)) {
      merged[key] = numberValue(merged[key]) + numberValue(value)
    }
  }
  return merged
}

export function normalizeTrendRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      const period = cleanVideoText(row.data_period)
      return {
        data_period: period,
        placed_sales: numberValue(row.placed_sales),
        confirmed_sales: numberValue(row.confirmed_sales),
        placed_orders: numberValue(row.placed_orders),
        confirmed_orders: numberValue(row.confirmed_orders),
        placed_item_sold: numberValue(row.placed_item_sold),
        confirmed_item_sold: numberValue(row.confirmed_item_sold),
        total_viewers: numberValue(row.total_viewers),
        effective_views: numberValue(row.effective_views),
        avg_view_duration: numberValue(row.avg_view_duration),
        placed_buyers: numberValue(row.placed_buyers),
        confirmed_buyers: numberValue(row.confirmed_buyers),
        total_atc: numberValue(row.total_atc),
        ctr: numberValue(row.ctr),
        placed_co_rate: numberValue(row.placed_co_rate),
        confirmed_co_rate: numberValue(row.confirmed_co_rate),
        placed_abs: numberValue(row.placed_abs),
        confirmed_abs: numberValue(row.confirmed_abs),
        placed_gpm: numberValue(row.placed_gpm),
        confirmed_gpm: numberValue(row.confirmed_gpm),
        video_with_products: numberValue(row.video_with_products),
        placed_revenue_generating_videos: numberValue(row.placed_revenue_generating_videos),
        confirmed_revenue_generating_videos: numberValue(row.confirmed_revenue_generating_videos),
        total_views: numberValue(row.total_views),
        total_likes: numberValue(row.total_likes),
        total_shares: numberValue(row.total_shares),
        total_comments: numberValue(row.total_comments),
        video_new_followers: numberValue(row.video_new_followers)
      }
    })
    .filter(row => row.data_period)
}

export function normalizeVideoPerformanceRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    video_key: buildMarketplaceVideoKey(row),
    video_upload_id: cleanVideoText(row.video_upload_id),
    post_id: cleanVideoText(row.post_id),
    caption: cleanVideoText(row.caption),
    cover_image_url: cleanVideoText(row.cover_image_url),
    video_url: cleanVideoText(row.video_url),
    status: numberValue(row.status),
    status_label: statusLabel(row.status),
    duration: numberValue(row.duration),
    views: numberValue(row.views),
    likes: numberValue(row.likes),
    comments: numberValue(row.comments),
    shares: numberValue(row.shares),
    avg_views_duration: numberValue(row.avg_views_duration),
    completion_rate: numberValue(row.completion_rate),
    placed_orders: numberValue(row.placed_orders),
    confirmed_orders: numberValue(row.confirmed_orders),
    placed_sales: numberValue(row.placed_sales),
    confirmed_sales: numberValue(row.confirmed_sales),
    placed_item_sold: numberValue(row.placed_item_sold),
    confirmed_item_sold: numberValue(row.confirmed_item_sold),
    fetched_date_range: cleanVideoText(row.fetched_date_range),
    post_time: cleanVideoText(row.post_time)
  }))
}

export function normalizeProductPerformanceRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    shop_id: cleanVideoText(row.shop_id),
    item_id: cleanVideoText(row.item_id),
    item_name: cleanVideoText(row.item_name),
    item_cover_image_url: cleanVideoText(row.item_cover_image_url),
    item_description: cleanVideoText(row.item_description),
    placed_orders: numberValue(row.placed_orders),
    confirmed_orders: numberValue(row.confirmed_orders),
    placed_sales: numberValue(row.placed_sales),
    confirmed_sales: numberValue(row.confirmed_sales),
    placed_unique_buyers: numberValue(row.placed_unique_buyers),
    confirmed_unique_buyers: numberValue(row.confirmed_unique_buyers),
    fetched_date_range: cleanVideoText(row.fetched_date_range)
  }))
}

export function normalizeOverview(input = {}) {
  const keyMetric = input.key_metric || {}
  const conversion = input.conversion || {}
  const engagement = input.engagement || {}
  return {
    fetched_date_range: cleanVideoText(input.fetched_date_range),
    key_metric: {
      placed_sales: numberValue(keyMetric.placed_sales),
      confirmed_sales: numberValue(keyMetric.confirmed_sales),
      placed_orders: numberValue(keyMetric.placed_orders),
      confirmed_orders: numberValue(keyMetric.confirmed_orders),
      placed_item_sold: numberValue(keyMetric.placed_item_sold),
      confirmed_item_sold: numberValue(keyMetric.confirmed_item_sold),
      total_viewers: numberValue(keyMetric.total_viewers),
      effective_views: numberValue(keyMetric.effective_views),
      avg_view_duration: numberValue(keyMetric.avg_view_duration)
    },
    conversion: {
      placed_buyers: numberValue(conversion.placed_buyers),
      confirmed_buyers: numberValue(conversion.confirmed_buyers),
      total_atc: numberValue(conversion.total_atc),
      ctr: numberValue(conversion.ctr),
      placed_co_rate: numberValue(conversion.placed_co_rate),
      confirmed_co_rate: numberValue(conversion.confirmed_co_rate),
      placed_abs: numberValue(conversion.placed_abs),
      confirmed_abs: numberValue(conversion.confirmed_abs),
      placed_gpm: numberValue(conversion.placed_gpm),
      confirmed_gpm: numberValue(conversion.confirmed_gpm),
      video_with_products: numberValue(conversion.video_with_products),
      placed_revenue_generating_videos: numberValue(conversion.placed_revenue_generating_videos),
      confirmed_revenue_generating_videos: numberValue(conversion.confirmed_revenue_generating_videos)
    },
    engagement: {
      total_views: numberValue(engagement.total_views),
      total_likes: numberValue(engagement.total_likes),
      total_shares: numberValue(engagement.total_shares),
      total_comments: numberValue(engagement.total_comments),
      video_new_followers: numberValue(engagement.video_new_followers)
    }
  }
}

export function flattenMapEntries(input = {}) {
  const entries = Object.entries(input || {})
  return entries
    .map(([label, value]) => ({ label: cleanVideoText(label), value: numberValue(value) }))
    .filter(entry => entry.label)
    .sort((left, right) => right.value - left.value)
}

export function normalizeAudience(input = {}) {
  return {
    age: flattenMapEntries(input.age),
    gender: flattenMapEntries(input.gender),
    location: flattenMapEntries(input.location).slice(0, 20),
    identity: flattenMapEntries(input.identity),
    activity: flattenMapEntries(input.activity),
    content: flattenMapEntries(input.content).slice(0, 20),
    shopping: flattenMapEntries(input.shopping).slice(0, 20)
  }
}

export async function ensureShopVideoIdentityColumn(env) {
  try {
    await env.DB.prepare(`ALTER TABLE shops ADD COLUMN api_user_id TEXT DEFAULT NULL`).run()
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('duplicate column name')) throw error
  }
}

async function ensureVideoTableColumn(env, table, column, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all().catch(() => ({ results: [] }))
  const exists = (info.results || []).some(row => cleanVideoText(row.name).toLowerCase() === column.toLowerCase())
  if (!exists) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
}

async function ensureVideoDashboardSnapshotColumns(env) {
  // Bảng dashboard video đã có dữ liệu cũ; bổ sung cột mới bằng migration nhẹ để route đọc không trả 500/CORS.
  const columns = [
    ['api_user_id', "TEXT DEFAULT ''"],
    ['fetched_date_range', "TEXT DEFAULT ''"],
    ['demographics_json', "TEXT DEFAULT '{}'"],
    ['top_video_json', "TEXT DEFAULT '[]'"],
    ['top_product_json', "TEXT DEFAULT '[]'"],
    ['product_insight_json', "TEXT DEFAULT '{}'"],
    ['warnings_json', "TEXT DEFAULT '[]'"],
    ['updated_at', "TEXT DEFAULT (datetime('now', '+7 hours'))"],
    ['created_at', "TEXT DEFAULT (datetime('now', '+7 hours'))"]
  ]
  for (const [column, definition] of columns) {
    await ensureVideoTableColumn(env, 'marketplace_video_dashboard_snapshots', column, definition)
  }
}

export async function ensureVideoAnalyticsTables(env) {
  await ensureShopVideoIdentityColumn(env)

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_video_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      api_user_id TEXT DEFAULT '',
      video_key TEXT NOT NULL,
      video_upload_id TEXT DEFAULT '',
      post_id TEXT DEFAULT '',
      list_type TEXT DEFAULT 'post',
      status INTEGER DEFAULT 0,
      status_label TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      cover_image_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      duration_ms INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      has_performance INTEGER DEFAULT 0,
      allow_duet INTEGER DEFAULT 1,
      allow_stitch INTEGER DEFAULT 1,
      scheduled_post INTEGER DEFAULT 0,
      scheduled_post_time TEXT DEFAULT '',
      post_time TEXT DEFAULT '',
      update_time TEXT DEFAULT '',
      item_count INTEGER DEFAULT 0,
      raw_data TEXT DEFAULT '{}',
      sync_source TEXT DEFAULT 'api',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, video_key)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_video_library_lookup
    ON marketplace_video_library(platform, shop, status, updated_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_video_item_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      video_key TEXT NOT NULL,
      video_upload_id TEXT DEFAULT '',
      post_id TEXT DEFAULT '',
      item_id TEXT DEFAULT '',
      item_name TEXT DEFAULT '',
      custom_item_name TEXT DEFAULT '',
      item_cover_image_url TEXT DEFAULT '',
      min_price REAL DEFAULT 0,
      max_price REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      internal_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, video_key, item_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_video_item_links_lookup
    ON marketplace_video_item_links(platform, shop, item_id, internal_sku)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_video_dashboard_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      api_user_id TEXT DEFAULT '',
      period_type TEXT DEFAULT 'Last7d',
      end_date TEXT DEFAULT '',
      fetched_date_range TEXT DEFAULT '',
      overview_json TEXT DEFAULT '{}',
      trend_json TEXT DEFAULT '[]',
      demographics_json TEXT DEFAULT '{}',
      top_video_json TEXT DEFAULT '[]',
      top_product_json TEXT DEFAULT '[]',
      product_insight_json TEXT DEFAULT '{}',
      warnings_json TEXT DEFAULT '[]',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, period_type, end_date)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_video_dashboard_snapshots_lookup
    ON marketplace_video_dashboard_snapshots(platform, shop, period_type, end_date)
  `).run()
  await ensureVideoDashboardSnapshotColumns(env)

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_video_detail_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      api_user_id TEXT DEFAULT '',
      video_key TEXT NOT NULL,
      video_upload_id TEXT DEFAULT '',
      post_id TEXT DEFAULT '',
      performance_json TEXT DEFAULT '{}',
      metric_trend_json TEXT DEFAULT '{}',
      audience_json TEXT DEFAULT '{}',
      product_json TEXT DEFAULT '[]',
      cover_list_json TEXT DEFAULT '[]',
      warnings_json TEXT DEFAULT '[]',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, video_key)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_video_detail_snapshots_lookup
    ON marketplace_video_detail_snapshots(platform, shop, post_id, video_upload_id)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_video_action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      action_type TEXT DEFAULT '',
      action_status TEXT DEFAULT '',
      request_payload TEXT DEFAULT '{}',
      result_payload TEXT DEFAULT '{}',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_video_action_logs_lookup
    ON marketplace_video_action_logs(platform, shop, action_type, created_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_video_upload_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id TEXT UNIQUE NOT NULL,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      api_user_id TEXT DEFAULT '',
      status TEXT DEFAULT 'queued',
      scheduled_at TEXT DEFAULT '',
      r2_key TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      file_type TEXT DEFAULT '',
      duration_seconds INTEGER DEFAULT 0,
      caption TEXT DEFAULT '',
      item_ids_json TEXT DEFAULT '[]',
      allow_duet INTEGER DEFAULT 1,
      allow_stitch INTEGER DEFAULT 1,
      cover_image_url TEXT DEFAULT '',
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 1,
      last_error TEXT DEFAULT '',
      result_payload TEXT DEFAULT '{}',
      source TEXT DEFAULT 'dashboard_video',
      started_at TEXT DEFAULT '',
      finished_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_video_upload_queue_due
    ON marketplace_video_upload_queue(platform, status, scheduled_at, id)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_video_upload_queue_shop
    ON marketplace_video_upload_queue(platform, shop, status, updated_at)
  `).run()
}

export function buildInternalSkuMap(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const platform = cleanVideoText(row.platform).toLowerCase()
    const shop = cleanVideoText(row.shop)
    const itemId = cleanVideoText(row.platform_item_id)
    if (!platform || !shop || !itemId) continue
    const key = `${platform}|${shop}|${itemId}`
    const current = map.get(key) || new Set()
    const internalSku = cleanVideoText(row.internal_sku)
    if (internalSku) current.add(internalSku)
    map.set(key, current)
  }
  return map
}
