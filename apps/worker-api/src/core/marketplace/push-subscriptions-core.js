import { getShopeeAppFromRow, signHmacHex } from '../../utils/shopee-apps.js'

function cleanText(value) {
  return String(value ?? '').trim()
}

function num(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

async function ensureColumn(env, table, column, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
  const exists = (info.results || []).some(row => cleanText(row.name).toLowerCase() === column.toLowerCase())
  if (!exists) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function compactHash(value) {
  const text = cleanText(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

const MARKETPLACE_PUSH_SYNC_ACTIONS = new Set([
  'sync_order',
  'sync_order_label',
  'sync_return_order',
  'sync_products',
  'record_chat_signal'
])

function pushQueuePriority(action, eventGroup) {
  const actionKey = cleanText(action)
  const groupKey = cleanText(eventGroup)
  if (actionKey === 'sync_order_label') return 5
  if (actionKey === 'sync_order') return 10
  if (actionKey === 'sync_return_order') return 12
  if (groupKey === 'authorization') return 20
  if (actionKey === 'sync_products') return 30
  if (actionKey === 'record_chat_signal') return 40
  return 90
}

function queueKeyForPush(event = {}) {
  const payload = event.payload || {}
  const payloadBody = payload.body || payload.data || payload
  const payloadTime = cleanText(
    payloadBody.update_time ||
    payloadBody.updated_at ||
    payloadBody.event_time ||
    payloadBody.timestamp ||
    payloadBody.create_time ||
    payloadBody.message_time
  )
  return [
    cleanText(event.platform).toLowerCase(),
    cleanText(event.shop_id || event.shop),
    cleanText(event.event_code),
    cleanText(event.order_id || event.entity_id),
    payloadTime,
    compactHash(JSON.stringify(payload).slice(0, 4000))
  ].join('|')
}

function normalizeQueueRow(row = {}, options = {}) {
  if (!row) return null
  const normalized = {
    id: row.id,
    queue_key: cleanText(row.queue_key),
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    shop_id: cleanText(row.shop_id),
    event_code: cleanText(row.event_code),
    event_group: cleanText(row.event_group),
    action_taken: cleanText(row.action_taken),
    entity_id: cleanText(row.entity_id),
    order_id: cleanText(row.order_id),
    status: cleanText(row.status),
    priority: num(row.priority),
    attempts: num(row.attempts),
    last_error: cleanText(row.last_error),
    run_after: cleanText(row.run_after),
    created_at: cleanText(row.created_at),
    updated_at: cleanText(row.updated_at),
    processed_at: cleanText(row.processed_at),
    result: parseJson(row.result, {})
  }
  if (options.includePayload) normalized.payload = parseJson(row.payload, {})
  return normalized
}

const SHOPEE_PUSH_COVERAGE = {
  shop_authorization_push: { group: 'authorization', action: 'log', status: 'đã xong' },
  shop_authorization_canceled_push: { group: 'authorization', action: 'log', status: 'đã xong' },
  order_status_push: { group: 'order', action: 'sync_order', status: 'đã xong' },
  order_trackingno_push: { group: 'order', action: 'sync_order', status: 'đã xong' },
  return_updates_push: { group: 'return', action: 'sync_return_order', status: 'đang làm dở' },
  shipping_document_status_push: { group: 'label', action: 'sync_order_label', status: 'đã xong' },
  booking_status_push: { group: 'logistics', action: 'sync_order', status: 'đã xong' },
  booking_trackingno_push: { group: 'logistics', action: 'sync_order', status: 'đã xong' },
  booking_shipping_document_status_push: { group: 'label', action: 'sync_order_label', status: 'đã xong' },
  package_fulfillment_status_push: { group: 'fulfillment', action: 'sync_order', status: 'đã xong' },
  package_info_push: { group: 'fulfillment', action: 'sync_order', status: 'đã xong' },
  reserved_stock_change_push: { group: 'stock', action: 'sync_products', status: 'đang làm dở' },
  item_price_update_push: { group: 'price', action: 'sync_products', status: 'đang làm dở' },
  violation_item_push: { group: 'product_health', action: 'sync_products', status: 'đang làm dở' },
  item_scheduled_publish_failed_push: { group: 'product_health', action: 'sync_products', status: 'đang làm dở' },
  webchat_push: { group: 'chat', action: 'record_chat_signal', status: 'đang làm dở' },
  item_promotion_push: { group: 'promotion', action: 'log', status: 'chưa làm' },
  promotion_update_push: { group: 'promotion', action: 'log', status: 'chưa làm' },
  video_upload_push: { group: 'video', action: 'sync_products', status: 'đang làm dở' },
  video_upload_result_push: { group: 'video', action: 'sync_products', status: 'đang làm dở' },
  shop_penalty_update_push: { group: 'shop_health', action: 'log', status: 'chưa làm' },
  open_api_authorization_expiry: { group: 'authorization', action: 'log', status: 'đã xong' },
  fbs_sellable_stock: { group: 'fbs_stock', action: 'sync_products', status: 'chưa làm' },
  fbs_br_invoice_error_push: { group: 'fbs_invoice', action: 'log', status: 'chưa làm' },
  fbs_br_invoice_issued_push: { group: 'fbs_invoice', action: 'log', status: 'chưa làm' },
  fbs_br_block_shop_push: { group: 'fbs_health', action: 'log', status: 'chưa làm' },
  fbs_br_block_sku_push: { group: 'fbs_health', action: 'sync_products', status: 'chưa làm' }
}

const SHOPEE_NUMERIC_EVENT_MAP = {
  1: 'shop_authorization_push',
  2: 'shop_authorization_canceled_push',
  3: 'order_status_push',
  4: 'order_trackingno_push',
  7: 'item_promotion_push',
  8: 'reserved_stock_change_push',
  9: 'promotion_update_push',
  10: 'webchat_push',
  11: 'video_upload_push',
  12: 'open_api_authorization_expiry',
  15: 'shipping_document_status_push',
  16: 'violation_item_push',
  22: 'item_price_update_push',
  23: 'booking_status_push',
  24: 'booking_trackingno_push',
  25: 'booking_shipping_document_status_push',
  27: 'item_scheduled_publish_failed_push',
  28: 'shop_penalty_update_push',
  29: 'return_updates_push',
  30: 'package_fulfillment_status_push',
  31: 'fbs_br_invoice_issued_push',
  33: 'fbs_br_invoice_error_push',
  34: 'fbs_br_block_shop_push',
  35: 'fbs_br_block_sku_push',
  36: 'fbs_sellable_stock',
  38: 'video_upload_result_push',
  47: 'package_info_push'
}

const SHOPEE_EVENT_NUMERIC_BY_KEY = Object.entries(SHOPEE_NUMERIC_EVENT_MAP).reduce((accumulator, [code, key]) => {
  accumulator[key] = Number(code)
  return accumulator
}, {})

const SHOPEE_APP_PUSH_CONFIG_CODES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
const SHOPEE_PUSH_GET_APP_CONFIG_PATH = '/api/v2/push/get_app_push_config'
const DEFAULT_MARKETPLACE_PUSH_PUBLIC_URL = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'

function lazadaCoverageForEvent(eventCode) {
  const code = cleanText(eventCode).toLowerCase()
  if (/return|reverse|refund/.test(code)) return { key: code, group: 'return', action: 'sync_return_order', status: 'đang làm dở' }
  if (/order|trade/.test(code)) return { key: code, group: 'order', action: 'sync_order', status: 'đã xong' }
  if (/shipping|logistic|fulfillment|package|document|label/.test(code)) return { key: code, group: 'logistics', action: 'sync_order_label', status: 'đã xong' }
  if (/product|item|sku|stock|price/.test(code)) return { key: code, group: 'product', action: 'sync_products', status: 'đang làm dở' }
  if (/chat|message|conversation|im/.test(code)) return { key: code, group: 'chat', action: 'record_chat_signal', status: 'đang làm dở' }
  if (/auth|token|seller/.test(code)) return { key: code, group: 'authorization', action: 'log', status: 'đã xong' }
  return { key: code || 'unknown_push', group: 'unknown', action: 'log', status: 'chưa làm' }
}

export function classifyMarketplacePush(platform, eventCode, payload = {}) {
  const platformKey = cleanText(platform).toLowerCase()
  const rawCode = cleanText(eventCode || payload?.event_code || payload?.code || payload?.type)
  if (platformKey === 'shopee') {
    const numericKey = SHOPEE_NUMERIC_EVENT_MAP[Number(rawCode)]
    const key = numericKey || rawCode
    const meta = SHOPEE_PUSH_COVERAGE[key] || { group: 'unknown', action: 'log', status: 'chưa làm' }
    return { platform: platformKey, key: key || 'unknown_push', event_group: meta.group, action_taken: meta.action, coverage_status: meta.status }
  }
  if (platformKey === 'lazada') {
    const meta = lazadaCoverageForEvent(rawCode)
    return { platform: platformKey, key: meta.key, event_group: meta.group, action_taken: meta.action, coverage_status: meta.status }
  }
  return { platform: platformKey, key: rawCode || 'unknown_push', event_group: 'unknown', action_taken: 'log', coverage_status: 'chưa làm' }
}

export async function ensureMarketplacePushCoreTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      event_code TEXT DEFAULT '',
      event_group TEXT DEFAULT '',
      action_taken TEXT DEFAULT '',
      entity_id TEXT DEFAULT '',
      order_id TEXT DEFAULT '',
      status TEXT DEFAULT '',
      verified INTEGER DEFAULT 0,
      received_mode TEXT DEFAULT 'push',
      message TEXT DEFAULT '',
      payload TEXT DEFAULT '',
      processed_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await ensureColumn(env, 'marketplace_webhook_events', 'event_group', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_webhook_events', 'action_taken', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_webhook_events', 'entity_id', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_webhook_events', 'received_mode', "TEXT DEFAULT 'push'")
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_core
    ON marketplace_webhook_events(platform, event_group, event_code, processed_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_push_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_key TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      event_code TEXT DEFAULT '',
      event_group TEXT DEFAULT '',
      action_taken TEXT DEFAULT '',
      entity_id TEXT DEFAULT '',
      order_id TEXT DEFAULT '',
      payload TEXT DEFAULT '',
      status TEXT DEFAULT 'queued',
      priority INTEGER DEFAULT 50,
      attempts INTEGER DEFAULT 0,
      last_error TEXT DEFAULT '',
      result TEXT DEFAULT '',
      run_after TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      processed_at TEXT DEFAULT ''
    )
  `).run()
  await ensureColumn(env, 'marketplace_push_sync_queue', 'shop_id', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'event_group', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'action_taken', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'entity_id', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'order_id', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'payload', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'status', "TEXT DEFAULT 'queued'")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'priority', "INTEGER DEFAULT 50")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'attempts', "INTEGER DEFAULT 0")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'last_error', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'result', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'run_after', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'created_at', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'updated_at', "TEXT DEFAULT ''")
  await ensureColumn(env, 'marketplace_push_sync_queue', 'processed_at', "TEXT DEFAULT ''")
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_push_sync_queue_status
    ON marketplace_push_sync_queue(status, priority, run_after, id)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_push_sync_queue_scope
    ON marketplace_push_sync_queue(platform, shop, event_group, updated_at)
  `).run()
}

export async function queueMarketplacePushSync(env, event = {}) {
  await ensureMarketplacePushCoreTables(env)
  const platform = cleanText(event.platform).toLowerCase()
  const classified = classifyMarketplacePush(platform, event.event_code, event.payload?.body || event.payload || {})
  const eventCode = cleanText(classified.key || event.event_code || 'unknown_push')
  const eventGroup = cleanText(event.event_group || classified.event_group)
  const action = cleanText(event.action_taken || classified.action_taken)
  const status = MARKETPLACE_PUSH_SYNC_ACTIONS.has(action) ? 'queued' : 'log_only'
  const priority = pushQueuePriority(action, eventGroup)
  const payloadText = JSON.stringify(event.payload || {})
  const queueKey = cleanText(event.queue_key) || queueKeyForPush({
    ...event,
    platform,
    event_code: eventCode,
    payload: event.payload || {}
  })

  await env.DB.prepare(`
    INSERT INTO marketplace_push_sync_queue
      (queue_key, platform, shop, shop_id, event_code, event_group, action_taken,
       entity_id, order_id, payload, status, priority, run_after, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(queue_key) DO UPDATE SET
      shop = excluded.shop,
      shop_id = excluded.shop_id,
      event_group = excluded.event_group,
      action_taken = excluded.action_taken,
      entity_id = excluded.entity_id,
      order_id = excluded.order_id,
      payload = excluded.payload,
      status = CASE
        WHEN marketplace_push_sync_queue.status IN ('done', 'processing', 'log_only') THEN marketplace_push_sync_queue.status
        ELSE excluded.status
      END,
      priority = excluded.priority,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    queueKey,
    platform,
    cleanText(event.shop),
    cleanText(event.shop_id),
    eventCode,
    eventGroup,
    action,
    cleanText(event.entity_id),
    cleanText(event.order_id),
    payloadText,
    status,
    priority
  ).run()

  const row = await env.DB.prepare(`
    SELECT *
    FROM marketplace_push_sync_queue
    WHERE queue_key = ?
    LIMIT 1
  `).bind(queueKey).first()
  return normalizeQueueRow(row, { includePayload: true })
}

export async function markMarketplacePushSyncQueue(env, queueIdOrKey, update = {}) {
  await ensureMarketplacePushCoreTables(env)
  const id = Number(queueIdOrKey)
  const key = cleanText(queueIdOrKey)
  const status = cleanText(update.status || 'queued')
  const attemptsIncrement = update.incrementAttempt ? 1 : 0
  const finished = ['done', 'failed', 'skipped', 'log_only'].includes(status) ? status : ''
  const resultText = JSON.stringify(update.result || {})
  const lastError = cleanText(update.last_error || update.error || '')

  await env.DB.prepare(`
    UPDATE marketplace_push_sync_queue
    SET status = ?,
        attempts = attempts + ?,
        last_error = ?,
        result = ?,
        updated_at = datetime('now', '+7 hours'),
        processed_at = CASE WHEN ? != '' THEN datetime('now', '+7 hours') ELSE processed_at END
    WHERE id = ? OR queue_key = ?
  `).bind(status, attemptsIncrement, lastError, resultText, finished, Number.isFinite(id) ? id : -1, key).run()

  const row = await env.DB.prepare(`
    SELECT *
    FROM marketplace_push_sync_queue
    WHERE id = ? OR queue_key = ?
    LIMIT 1
  `).bind(Number.isFinite(id) ? id : -1, key).first()
  return normalizeQueueRow(row, { includePayload: true })
}

export async function listMarketplacePushSyncQueue(env, options = {}) {
  await ensureMarketplacePushCoreTables(env)
  const limit = Math.min(Math.max(Number(options.limit || 50) || 50, 1), 200)
  const statusFilter = cleanText(options.status).toLowerCase()
  const where = []
  const binds = []
  if (statusFilter) {
    where.push('LOWER(status) = ?')
    binds.push(statusFilter)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { results: rows } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_push_sync_queue
    ${whereSql}
    ORDER BY
      CASE status
        WHEN 'queued' THEN 0
        WHEN 'processing' THEN 1
        WHEN 'failed' THEN 2
        WHEN 'done' THEN 3
        ELSE 4
      END,
      priority ASC,
      id DESC
    LIMIT ?
  `).bind(...binds, limit).all()

  const { results: summaryRows } = await env.DB.prepare(`
    SELECT status, COUNT(*) AS total, MAX(updated_at) AS last_updated_at
    FROM marketplace_push_sync_queue
    GROUP BY status
    ORDER BY status
  `).all()
  const summary = (summaryRows || []).reduce((accumulator, row) => {
    accumulator[cleanText(row.status || 'unknown')] = num(row.total)
    return accumulator
  }, {})

  return {
    status: 'ok',
    mode: 'marketplace_push_sync_queue',
    summary: {
      queued: num(summary.queued),
      processing: num(summary.processing),
      done: num(summary.done),
      failed: num(summary.failed),
      skipped: num(summary.skipped),
      log_only: num(summary.log_only),
      by_status: summaryRows || []
    },
    rows: (rows || []).map(row => normalizeQueueRow(row, { includePayload: options.includePayload === true })),
    shop_api: 'Shop có API nhận push rồi đưa vào hàng đợi sync incremental nội bộ; queue chỉ gọi API đọc/sync lại đơn, hoàn/trả, label, sản phẩm hoặc chat.',
    shop_no_api: 'Shop không có API không có push chính thức; fallback vẫn là browser/import/manual có log.',
    safety: 'Queue này không ghi cấu hình push hoặc gửi lệnh chỉnh giá/tồn lên sàn. Mọi thao tác ghi vẫn tách qua guard riêng.'
  }
}

export async function takeMarketplacePushSyncJobs(env, options = {}) {
  await ensureMarketplacePushCoreTables(env)
  const limit = Math.min(Math.max(Number(options.limit || options.max_jobs || 3) || 3, 1), 10)
  const includeFailed = options.include_failed === true || options.includeFailed === true || options.include_failed === '1'
  const statuses = includeFailed ? ['queued', 'failed'] : ['queued']
  const placeholders = statuses.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_push_sync_queue
    WHERE status IN (${placeholders})
      AND COALESCE(run_after, '') <= datetime('now', '+7 hours')
    ORDER BY priority ASC, id ASC
    LIMIT ?
  `).bind(...statuses, limit).all()
  return (results || []).map(row => normalizeQueueRow(row, { includePayload: true }))
}

export function coverageRows() {
  const shopee = Object.entries(SHOPEE_PUSH_COVERAGE).map(([eventCode, meta]) => ({
    platform: 'shopee',
    event_code: eventCode,
    event_id: SHOPEE_EVENT_NUMERIC_BY_KEY[eventCode] || null,
    event_group: meta.group,
    action_taken: meta.action,
    coverage_status: meta.status,
    subscription_mode: SHOPEE_APP_PUSH_CONFIG_CODES.has(SHOPEE_EVENT_NUMERIC_BY_KEY[eventCode])
      ? 'shopee_push_config_api'
      : 'open_platform_console_or_docs_check'
  }))
  const lazada = [
    ['order', 'order', 'sync_order', 'đã xong'],
    ['reverse/return/refund', 'return', 'sync_return_order', 'đang làm dở'],
    ['shipping/logistic/document', 'logistics', 'sync_order_label', 'đã xong'],
    ['product/sku/stock/price', 'product', 'sync_products', 'đang làm dở'],
    ['chat/message/conversation', 'chat', 'record_chat_signal', 'đang làm dở'],
    ['auth/token/seller', 'authorization', 'log', 'đã xong']
  ].map(([eventCode, group, action, status]) => ({
    platform: 'lazada',
    event_code: eventCode,
    event_id: null,
    event_group: group,
    action_taken: action,
    coverage_status: status,
    subscription_mode: 'lazop_message_service_console'
  }))
  return [...shopee, ...lazada]
}

function publicBaseUrl(env) {
  const raw = cleanText(env?.MARKETPLACE_PUSH_PUBLIC_URL || env?.WORKER_PUBLIC_URL || env?.API_PUBLIC_BASE_URL || env?.API_BASE_URL)
  return (raw || DEFAULT_MARKETPLACE_PUSH_PUBLIC_URL).replace(/\/+$/, '')
}

export function webhookCallbackUrl(env, platform) {
  return new URL(`/api/webhooks/${platform}`, `${publicBaseUrl(env)}/`).toString()
}

function normalizeComparableUrl(value) {
  const text = cleanText(value)
  if (!text) return ''
  try {
    const url = new URL(text)
    url.hash = ''
    return url.toString().replace(/\/+$/, '').toLowerCase()
  } catch {
    return text.replace(/\/+$/, '').toLowerCase()
  }
}

function sameCallbackUrl(actual, expected) {
  return normalizeComparableUrl(actual) === normalizeComparableUrl(expected)
}

function splitIntList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => Number(item)).filter(Number.isFinite)
}

async function signShopeePartnerUrl(app, path) {
  const timestamp = Math.floor(Date.now() / 1000)
  const baseString = `${app.partnerId}${path}${timestamp}`
  const sign = await signHmacHex(app.partnerKey, baseString)
  const url = new URL(`https://partner.shopeemobile.com${path}`)
  url.searchParams.set('partner_id', app.partnerId)
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', sign)
  return url.toString()
}

async function fetchShopeePartnerJson(app, path) {
  const url = await signShopeePartnerUrl(app, path)
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Shopee Push API trả phản hồi không phải JSON, HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee Push API HTTP ${res.status}`)
  if (data.error) throw new Error(data.message || data.msg || data.error)
  return data
}

function distinctShopeeApps(env, capabilities = []) {
  const apps = new Map()
  for (const row of capabilities) {
    if (cleanText(row.platform).toLowerCase() !== 'shopee') continue
    const app = getShopeeAppFromRow(env, row, row.api_partner_id || row.shop_name || row.user_name)
    if (!cleanText(app?.partnerId) || !cleanText(app?.partnerKey)) continue
    const key = cleanText(app.partnerId)
    const existing = apps.get(key) || { partner_id: key, app, shops: [] }
    existing.shops.push(cleanText(row.shop_name || row.user_name || row.api_shop_id || row.id))
    apps.set(key, existing)
  }
  return [...apps.values()]
}

export async function readShopeePushConfigs(env, capabilities = []) {
  const apps = distinctShopeeApps(env, capabilities)
  const configs = []
  for (const item of apps) {
    try {
      const data = await fetchShopeePartnerJson(item.app, SHOPEE_PUSH_GET_APP_CONFIG_PATH)
      const response = data.response || {}
      configs.push({
        ok: true,
        partner_id: item.partner_id,
        shop_count: item.shops.length,
        callback_url: cleanText(response.callback_url),
        live_push_status: cleanText(response.live_push_status),
        suspended_time: cleanText(response.suspended_time),
        blocked_shop_id_count: splitIntList(response.blocked_shop_id).length,
        push_config_on_list: splitIntList(response.push_config_on_list),
        push_config_off_list: splitIntList(response.push_config_off_list)
      })
    } catch (error) {
      configs.push({
        ok: false,
        partner_id: item.partner_id,
        shop_count: item.shops.length,
        error: cleanText(error?.message || error)
      })
    }
  }
  return configs
}

export function indexRecentPushRows(rows = []) {
  const exact = new Map()
  const group = new Map()
  for (const row of rows) {
    const platform = cleanText(row.platform).toLowerCase()
    const eventCode = cleanText(row.event_code).toLowerCase()
    const eventGroup = cleanText(row.event_group).toLowerCase()
    const normalized = {
      total: num(row.total),
      last_seen_at: cleanText(row.last_seen_at),
      status: cleanText(row.status)
    }
    if (platform && eventCode) exact.set(`${platform}|${eventCode}`, normalized)
    if (platform && eventGroup) {
      const key = `${platform}|${eventGroup}`
      const previous = group.get(key)
      if (!previous || normalized.last_seen_at > previous.last_seen_at) group.set(key, normalized)
    }
  }
  return { exact, group }
}

function shopeeSubscriptionStatus(row, configs, expectedCallbackUrl) {
  const eventId = Number(row.event_id || 0)
  if (!eventId) {
    return {
      subscription_status: 'cần đối chiếu tài liệu',
      config_status: 'missing_event_id',
      blocker: 'Chưa có mã event Shopee để kiểm tự động.'
    }
  }
  const checked = configs.filter(item => item.ok)
  if (!checked.length) {
    return {
      subscription_status: configs.length ? 'chưa đọc được cấu hình API' : 'chưa có app Shopee để kiểm',
      config_status: configs.length ? 'api_probe_failed' : 'missing_shopee_app',
      blocker: configs.length ? 'Không đọc được /api/v2/push/get_app_push_config.' : 'Chưa có shop/app Shopee API đang hoạt động.'
    }
  }
  const enabled = checked.filter(item => item.push_config_on_list.includes(eventId))
  const disabled = checked.filter(item => item.push_config_off_list.includes(eventId))
  if (enabled.length) {
    const callbackOk = enabled.some(item => sameCallbackUrl(item.callback_url, expectedCallbackUrl))
    if (disabled.length) {
      return {
        subscription_status: callbackOk ? 'bật một phần theo Shopee Push API' : 'bật một phần nhưng callback khác cấu hình OMS',
        config_status: callbackOk ? 'api_partial_callback_ok' : 'api_partial_callback_mismatch',
        blocker: callbackOk
          ? 'Một số app partner vẫn để event này trong push_config_off_list; cần bật đồng nhất nếu các shop đó cũng cần realtime.'
          : `Một số app đã bật nhưng callback chưa khớp ${expectedCallbackUrl}.`
      }
    }
    return {
      subscription_status: callbackOk ? 'đã bật theo Shopee Push API' : 'đã bật nhưng callback khác cấu hình OMS',
      config_status: callbackOk ? 'api_on_callback_ok' : 'api_on_callback_mismatch',
      blocker: callbackOk ? '' : `Callback cần là ${expectedCallbackUrl}.`
    }
  }
  if (disabled.length) {
    return {
      subscription_status: 'chưa bật theo Shopee Push API',
      config_status: 'api_off',
      blocker: 'Event nằm trong push_config_off_list; cần bật bằng /api/v2/push/set_app_push_config sau khi xác nhận callback.'
    }
  }
  if (!SHOPEE_APP_PUSH_CONFIG_CODES.has(eventId)) {
    return {
      subscription_status: 'cần kiểm trong Open Platform Console',
      config_status: 'not_reported_by_get_app_push_config',
      blocker: 'Event mới không xuất hiện trong on/off list của API; cần kiểm console hoặc tài liệu mới hơn trước khi kết luận.'
    }
  }
  return {
    subscription_status: 'chưa thấy trong cấu hình Shopee Push API',
    config_status: 'api_unknown',
    blocker: 'Không nằm trong danh sách on/off trả về từ Shopee.'
  }
}

export function subscriptionRowFromCoverage(row, seen, shopeeConfigs, callbacks) {
  const exactSeen = seen.exact.get(`${row.platform}|${cleanText(row.event_code).toLowerCase()}`)
  const groupSeen = seen.group.get(`${row.platform}|${cleanText(row.event_group).toLowerCase()}`)
  const last = exactSeen || (row.platform === 'lazada' ? groupSeen : null)
  if (last) {
    return {
      ...row,
      callback_url: callbacks[row.platform],
      subscription_status: 'đã nhận push thật trong 30 ngày',
      config_status: 'observed_recent_webhook',
      observed_total: last.total,
      last_seen_at: last.last_seen_at,
      blocker: ''
    }
  }
  if (row.platform === 'shopee') {
    return {
      ...row,
      callback_url: callbacks.shopee,
      observed_total: 0,
      last_seen_at: '',
      ...shopeeSubscriptionStatus(row, shopeeConfigs, callbacks.shopee)
    }
  }
  return {
    ...row,
    callback_url: callbacks.lazada,
    observed_total: 0,
    last_seen_at: '',
    subscription_status: 'cần kiểm LazOP Message Service',
    config_status: 'console_subscription_required',
    blocker: 'Lazada Push Mechanism dùng Message Service/console để verify callback và subscribe message type; OMS chỉ có thể xác nhận callback đã nhận 200.'
  }
}

export function countBy(rows = [], field) {
  return rows.reduce((accumulator, row) => {
    const key = cleanText(row[field] || 'unknown')
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})
}
