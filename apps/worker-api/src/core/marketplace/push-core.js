import { listMarketplaceShopCapabilities, summarizeMarketplaceCapabilities } from './shop-capability-core.js'
import {
  classifyMarketplacePush,
  countBy,
  coverageRows,
  ensureMarketplacePushCoreTables,
  indexRecentPushRows,
  listMarketplacePushSyncQueue,
  markMarketplacePushSyncQueue,
  queueMarketplacePushSync,
  readShopeePushConfigs,
  subscriptionRowFromCoverage,
  takeMarketplacePushSyncJobs,
  webhookCallbackUrl
} from './push-subscriptions-core.js'
export {
  classifyMarketplacePush,
  ensureMarketplacePushCoreTables,
  listMarketplacePushSyncQueue,
  markMarketplacePushSyncQueue,
  queueMarketplacePushSync,
  takeMarketplacePushSyncJobs
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function num(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
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

function queueKeyForPush(event) {
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
  const stableParts = [
    cleanText(event.platform).toLowerCase(),
    cleanText(event.shop_id || event.shop),
    cleanText(event.event_code),
    cleanText(event.order_id || event.entity_id),
    payloadTime,
    compactHash(JSON.stringify(payload).slice(0, 4000))
  ]
  return stableParts.join('|')
}

function normalizeQueueRow(row = {}, options = {}) {
  if (!row) return null
  const payload = parseJson(row.payload, {})
  const result = parseJson(row.result, {})
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
    result
  }
  if (options.includePayload) normalized.payload = payload
  return normalized
}

export async function loadMarketplacePushSubscriptions(env, options = {}) {
  await ensureMarketplacePushCoreTables(env)
  const probe = options.probe === true || options.probe === '1'
  const callbacks = {
    shopee: webhookCallbackUrl(env, 'shopee'),
    lazada: webhookCallbackUrl(env, 'lazada')
  }
  const warnings = []
  let capabilities = []
  try {
    // includeSecrets chỉ dùng nội bộ để ký API read-only, response luôn loại bỏ partner_key/token.
    capabilities = await listMarketplaceShopCapabilities(env, { includeSecrets: probe, limit: 500 })
  } catch (error) {
    warnings.push({ stage: 'shop_capabilities', message: cleanText(error?.message || error) })
  }

  const recent = await env.DB.prepare(`
    SELECT platform,
           COALESCE(NULLIF(event_code, ''), 'unknown') AS event_code,
           COALESCE(NULLIF(event_group, ''), 'unknown') AS event_group,
           COALESCE(NULLIF(status, ''), 'unknown') AS status,
           COUNT(*) AS total,
           MAX(processed_at) AS last_seen_at
    FROM marketplace_webhook_events
    WHERE processed_at >= datetime('now', '-30 days')
    GROUP BY platform, COALESCE(NULLIF(event_code, ''), 'unknown'), COALESCE(NULLIF(event_group, ''), 'unknown'), COALESCE(NULLIF(status, ''), 'unknown')
    ORDER BY platform, event_group, event_code
  `).all()

  const shopeeConfigs = probe ? await readShopeePushConfigs(env, capabilities) : []
  const seen = indexRecentPushRows(recent.results || [])
  const rows = coverageRows().map(row => subscriptionRowFromCoverage(row, seen, shopeeConfigs, callbacks))
  const statusCounts = countBy(rows, 'subscription_status')
  const configCounts = countBy(rows, 'config_status')
  const capabilitySummary = summarizeMarketplaceCapabilities(capabilities)

  return {
    status: 'ok',
    mode: 'marketplace_push_subscriptions',
    probe,
    callbacks,
    source: 'marketplace_webhook_events + Shopee /api/v2/push/get_app_push_config khi probe=1',
    summary: {
      total_events: rows.length,
      observed_recent: num(statusCounts['đã nhận push thật trong 30 ngày']),
      shopee_api_on_callback_ok: num(configCounts.api_on_callback_ok),
      shopee_api_partial_callback_ok: num(configCounts.api_partial_callback_ok),
      shopee_api_off: num(configCounts.api_off),
      console_check_required: rows.filter(row => /Console|LazOP|đối chiếu|cần kiểm/i.test(row.subscription_status)).length,
      api_probe_failed: num(configCounts.api_probe_failed),
      capability: capabilitySummary
    },
    shopee_push_config: shopeeConfigs.map(item => ({
      ok: item.ok,
      partner_id: item.partner_id,
      shop_count: item.shop_count,
      callback_url: item.callback_url,
      live_push_status: item.live_push_status,
      suspended_time: item.suspended_time,
      blocked_shop_id_count: item.blocked_shop_id_count,
      push_config_on_list: item.push_config_on_list,
      push_config_off_list: item.push_config_off_list,
      error: item.error
    })),
    subscriptions: rows,
    warnings,
    shop_api: 'Shop có API dùng Push chính thức: Shopee đọc/bật app push config bằng endpoint Push; Lazada phải verify callback và subscribe message type trong LazOP Message Service.',
    shop_no_api: 'Shop không có API không có push chính thức. Luồng fallback vẫn là browser/import/manual có log, không gắn nhãn realtime API.',
    safety: 'API này mới đọc cấu hình và đối chiếu callback. Chưa tự gọi Shopee set_app_push_config để tránh đổi cấu hình app nếu chưa xác nhận.',
    next_step: 'Bật các event Shopee đang api_off bằng /api/v2/push/set_app_push_config sau khi xác nhận callback, rồi vào LazOP Message Service subscribe order/reverse/product/stock/video/auth/review/IM cho callback Lazada.'
  }
}

export async function loadMarketplacePushCore(env, options = {}) {
  await ensureMarketplacePushCoreTables(env)
  const limit = Math.min(Math.max(Number(options.limit || 50) || 50, 1), 200)
  const recent = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, event_code, event_group, action_taken, entity_id,
           order_id, status, verified, received_mode, message, processed_at
    FROM marketplace_webhook_events
    ORDER BY id DESC
    LIMIT ?
  `).bind(limit).all()

  const summary = await env.DB.prepare(`
    SELECT platform,
           COALESCE(NULLIF(event_group, ''), 'unknown') AS event_group,
           status,
           COUNT(*) AS total,
           SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS verified_total,
           MAX(processed_at) AS last_processed_at
    FROM marketplace_webhook_events
    WHERE processed_at >= datetime('now', '-30 days')
    GROUP BY platform, COALESCE(NULLIF(event_group, ''), 'unknown'), status
    ORDER BY platform, event_group, status
  `).all()

  const coverage = coverageRows()
  const queue = await listMarketplacePushSyncQueue(env, { limit: Math.min(limit, 30) })
  const coverageSummary = coverage.reduce((acc, row) => {
    acc[row.coverage_status] = (acc[row.coverage_status] || 0) + 1
    return acc
  }, {})

  const result = {
    status: 'ok',
    mode: 'marketplace_push_core',
    source: 'marketplace_webhook_events',
    summary: {
      coverage_total: coverage.length,
      done: num(coverageSummary['đã xong']),
      doing: num(coverageSummary['đang làm dở']),
      pending: num(coverageSummary['chưa làm']),
      recent_groups: summary.results || [],
      sync_queue: queue.summary
    },
    coverage,
    recent: recent.results || [],
    sync_queue: queue.rows,
    shop_api: 'Shop có API nhận push tại /api/webhooks/shopee và /api/webhooks/lazada, sau đó core phân nhóm để sync đơn/sản phẩm/label/chat an toàn.',
    shop_no_api: 'Shop không có API không nhận push chính thức; fallback bằng browser/import/manual và không gắn nhãn realtime API.',
    next_step: 'Đăng ký/subscription đầy đủ trên Open Platform cho các event còn thiếu quyền/app rồi nối return/product push vào incremental sync sâu hơn.'
  }
  if (options.includeSubscriptions) {
    result.subscription_status = await loadMarketplacePushSubscriptions(env, { probe: options.probe })
  }
  return result
}
