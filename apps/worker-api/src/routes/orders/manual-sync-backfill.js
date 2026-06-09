import {
  listShopeeSellerCenterDetailEligibleOrders,
  queueShopeeSellerCenterDetailJobs,
  SHOPEE_SELLER_CENTER_DETAIL_SOURCE
} from '../../core/orders/shopee-seller-center-detail-core.js'
import {
  listTiktokSellerCenterFinanceEligibleOrders,
  queueTiktokSellerCenterFinanceJobs,
  TIKTOK_SELLER_CENTER_DETAIL_SOURCE
} from '../../core/orders/tiktok-seller-center-finance-core.js'
import { resolveOrderDataSource } from '../../core/orders/order-data-source-resolver.js'
import { normalizeOrderListRowForCore } from '../../core/orders/read-core.js'
import { syncApiOrders } from '../api/index.js'

const TIKTOK_RUNNER_PROFILE = 'E:\\shophuyvan-python-automation\\profiles\\browser\\shophuyvan-runner-tiktok'
const SHOPEE_NO_API_RUNNER_PROFILE = 'E:\\shophuyvan-python-automation\\profiles\\browser\\HuyVan_Bot_Data_khogiadungcona'
const FORBIDDEN_USER_PROFILE_LABEL = 'shophuyvan-test (profile user, không dùng cho automation)'
const ACTION_PULL_ORDERS = 'pull_orders'
const ACTION_REFRESH_STATUS = 'refresh_status'
const ACTION_REFRESH_TRACKING = 'refresh_tracking'
const ACTION_SYNC_DETAIL = 'sync_detail'
const ACTION_SYNC_FINANCE = 'sync_finance'
const ACTION_RETRY_LABEL = 'retry_label'
const ACTION_SCAN_ALL_ERRORS = 'scan_all_errors'
const PULL_ORDER_SCOPE = ['order_list', 'basic_order', 'status', 'tracking', 'items']
// Cập nhật trạng thái chỉ đụng Order/Tracking Core, không đọc lại item/tiền để tránh đè Finance Core.
const REFRESH_STATUS_SCOPE = ['marketplace_status', 'shipping_status', 'oms_status', 'tracking_number', 'tracking_timeline']
const REFRESH_TRACKING_SCOPE = ['tracking', 'timeline', 'tracking_status']
const SYNC_DETAIL_SCOPE = ['status_detail', 'tracking_timeline', 'customer', 'items']
const SYNC_FINANCE_SCOPE = ['actual_income', 'estimated_income', 'profit_basis', 'temporary_fee']
const RETRY_LABEL_SCOPE = ['label_pdf', 'label_status']
const DATE_SCAN_FIELDS = new Set(['created_at', 'updated_at', 'status_updated_at', 'last_synced_at'])
const LABEL_RETRY_STATUSES = new Set(['pending_retry', 'document_generating', 'pending_document_generation', 'not_ready', 'failed', 'error', 'missing_file', 'shopee_pdf_not_ready', 'lazada_batch_requeued'])
const FINANCE_RESYNC_STATUSES = new Set(['missing', 'fallback_only', 'estimated_from_cost_setting', 'pending_settlement', 'pending_return_settlement', 'failed'])
const TRACKING_RESYNC_STATUSES = new Set(['missing', 'stale', 'failed'])
const TERMINAL_MARKETPLACE_STATUSES = new Set(['completed', 'delivered', 'cancelled', 'canceled', 'returned', 'return', 'refund', 'refunded'])

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function boolParam(value) {
  if (value === true) return true
  return ['1', 'true', 'yes', 'on'].includes(cleanText(value).toLowerCase())
}

function readList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)
  return cleanText(value).split(',').map(cleanText).filter(Boolean)
}

function normalizeActionType(value) {
  const action = cleanText(value).toLowerCase()
  if (action === ACTION_PULL_ORDERS || action === 'pull' || action === 'scrape_orders' || action === 'keodonmoi') return ACTION_PULL_ORDERS
  if (action === ACTION_REFRESH_STATUS || action === 'refresh' || action === 'sync_status' || action === 'capnhattrangthai') return ACTION_REFRESH_STATUS
  if (action === ACTION_REFRESH_TRACKING || action === 'tracking' || action === 'sync_tracking') return ACTION_REFRESH_TRACKING
  if (action === ACTION_SYNC_DETAIL || action === 'dongbochitiet') return ACTION_SYNC_DETAIL
  if (action === ACTION_SYNC_FINANCE || action === 'capnhattaichinh') return ACTION_SYNC_FINANCE
  if (action === ACTION_RETRY_LABEL || action === 'taitem') return ACTION_RETRY_LABEL
  if (action === ACTION_SCAN_ALL_ERRORS) return ACTION_SCAN_ALL_ERRORS
  return ''
}

function actionScope(actionType, requestedScope = []) {
  const base = actionType === ACTION_PULL_ORDERS
    ? PULL_ORDER_SCOPE
    : actionType === ACTION_REFRESH_STATUS
      ? REFRESH_STATUS_SCOPE
      : actionType === ACTION_REFRESH_TRACKING
        ? REFRESH_TRACKING_SCOPE
        : actionType === ACTION_SYNC_DETAIL
          ? SYNC_DETAIL_SCOPE
          : actionType === ACTION_SYNC_FINANCE
            ? SYNC_FINANCE_SCOPE
            : actionType === ACTION_SCAN_ALL_ERRORS
              ? [...RETRY_LABEL_SCOPE, ...SYNC_FINANCE_SCOPE, ...REFRESH_TRACKING_SCOPE, ...SYNC_DETAIL_SCOPE]
              : RETRY_LABEL_SCOPE
  const requested = requestedScope.map(item => cleanText(item).toLowerCase()).filter(Boolean)
  if (!requested.length) return base
  const allowed = new Set(base)
  return requested.filter(item => allowed.has(item))
}

function normalizeDate(value) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function normalizeDateField(value) {
  const text = cleanText(value).toLowerCase()
  return DATE_SCAN_FIELDS.has(text) ? text : ''
}

function defaultShopForPlatform(platform, shop) {
  const cleanShop = cleanText(shop)
  if (cleanShop) return cleanShop
  if (platform === 'tiktok') return '0909128999'
  if (platform === 'shopee') return 'khogiadungcona'
  if (platform === 'lazada') return 'kinhdoanhonlinegiasoc@gmail.com'
  return ''
}

function runnerPolicy(platform, limit) {
  if (platform === 'tiktok') {
    return {
      runner_state: 'queued_one_shot',
      mode: 'one_shot_batch',
      batch_limit: Math.min(Number(limit || 10) || 10, 10),
      watch: false,
      auto_pause_after_batch: true,
      local_runner_required: true,
      automation_allowed: true,
      chrome_profile_path: TIKTOK_RUNNER_PROFILE,
      chrome_profile: TIKTOK_RUNNER_PROFILE,
      forbidden_profile_policy: FORBIDDEN_USER_PROFILE_LABEL,
      runner_requires_login: false,
      local_helper: 'POST http://127.0.0.1:8765/report-run'
    }
  }
  return {
    runner_state: 'queued_one_shot',
    mode: 'seller_center_detail_batch',
    batch_limit: Math.min(Number(limit || 10) || 10, 20),
    watch: false,
    local_runner_required: true,
    automation_allowed: true,
    chrome_profile_path: SHOPEE_NO_API_RUNNER_PROFILE,
    chrome_profile: SHOPEE_NO_API_RUNNER_PROFILE,
    forbidden_profile_policy: FORBIDDEN_USER_PROFILE_LABEL,
    runner_requires_login: false,
    local_helper: 'POST http://127.0.0.1:8765/report-run'
  }
}

function apiShopBlockedPolicy(platform, shop) {
  return {
    runner_state: 'api_shop_chrome_blocked',
    mode: 'open_platform_api',
    platform,
    shop,
    source: 'Open Platform / Worker API',
    local_runner_required: false,
    automation_allowed: false,
    api_shop_chrome_blocked: true,
    runner_requires_login: false,
    chrome_profile_path: '',
    chrome_profile: '',
    local_helper: ''
  }
}

async function ensureJobsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      shop_name TEXT,
      platform TEXT,
      month INTEGER,
      year INTEGER,
      status TEXT DEFAULT 'queued',
      scheduled_at TEXT,
      task_type TEXT,
      from_date TEXT,
      to_date TEXT,
      payload TEXT,
      file_url TEXT,
      log_text TEXT,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      started_at TEXT,
      completed_at TEXT
    )
  `).run()
}

function sourceRouting(platform, shop) {
  const row = { platform, shop }
  const resolved = resolveOrderDataSource(row)
  return {
    platform,
    shop,
    source: resolved.source_label || resolved.source || '',
    source_detail: resolved.source_detail || '',
    seller_center_allowed: resolved.seller_center_allowed === true,
    api_connected: resolved.api_connected === true
  }
}

function parseJsonSafe(value, fallback = null) {
  if (value && typeof value === 'object') return value
  const text = cleanText(value)
  if (!text) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function dateOnly(value) {
  const text = cleanText(value)
  if (!text) return ''
  const match = text.match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : ''
}

function timestampValue(value) {
  const text = cleanText(value)
  if (!text) return 0
  const parsed = Date.parse(text.includes('T') ? text : text.replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : 0
}

function readDateFieldValue(row = {}, dateField = 'created_at') {
  if (dateField === 'created_at') {
    return row.created_at || row.order_date || row.source_created_at || row.source_updated_at || row.oms_updated_at
  }
  if (dateField === 'updated_at') {
    return row.updated_at || row.oms_updated_at || row.source_updated_at || row.order_date
  }
  if (dateField === 'status_updated_at') {
    return row.status_updated_at || row.status_changed_at || row.last_status_sync_at || row.source_updated_at || row.oms_updated_at || row.order_date
  }
  return row.last_synced_at || row.source_updated_at || row.last_finance_synced_at || row.last_tracking_synced_at || row.last_label_synced_at || row.last_status_sync_at || row.oms_updated_at || row.order_date
}

function inDateRange(row = {}, options = {}) {
  const dateField = normalizeDateField(options.date_field) || 'created_at'
  const value = dateOnly(readDateFieldValue(row, dateField))
  if (!value) return false
  const from = normalizeDate(options.from || options.from_date)
  const to = normalizeDate(options.to || options.to_date)
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

function trackingEventsFromRow(row = {}) {
  const rawEvents = row.tracking_events ?? row.events ?? row.tracking_core_events ?? row.tracking_events_json
  if (Array.isArray(rawEvents)) return rawEvents
  const parsed = parseJsonSafe(rawEvents, [])
  return Array.isArray(parsed) ? parsed : []
}

function hasRealValue(value) {
  return cleanText(value) !== ''
}

function hasRealTracking(row = {}, core = {}) {
  return hasRealValue(core.tracking_number || row.tracking_number || row.tracking_core_tracking_number || row.order_tracking_number)
}

function statusUpdatedAt(row = {}, core = {}) {
  return cleanText(row.status_updated_at || row.status_changed_at || row.last_status_sync_at || core.updated_at || row.source_updated_at || row.oms_updated_at)
}

function terminalOrder(row = {}, core = {}) {
  if (core.terminal_status === true) return true
  const raw = [
    row.marketplace_status,
    row.order_status_core,
    row.status_parent,
    row.oms_status,
    row.shipping_status,
    row.order_type,
    core.order_status_core,
    core.status_parent
  ].map(value => cleanText(value).toLowerCase()).filter(Boolean)
  return raw.some(value => TERMINAL_MARKETPLACE_STATUSES.has(value))
}

function actionPath(platform, shop, actionType) {
  const route = sourceRouting(platform, shop)
  if (route.api_connected || platform === 'lazada') {
    return 'Open Platform / Worker API -> Core'
  }
  const base = platform === 'tiktok'
    ? 'local_python_chrome:platforms/tiktok/orders'
    : 'local_python_chrome:platforms/shopee/orders'
  if (actionType === ACTION_RETRY_LABEL) return `${base}/taitem.py -> Label Core`
  if (actionType === ACTION_SYNC_FINANCE) return `${base}/capnhattaichinh.py -> Finance Core`
  if (actionType === ACTION_REFRESH_TRACKING || actionType === ACTION_REFRESH_STATUS) return `${base}/capnhattrangthai.py -> Tracking Core`
  if (actionType === ACTION_SYNC_DETAIL) return `${base}/dongbochitiet.py -> Order Core`
  return `${base}/run_report_jobs.py -> Core`
}

function sourceCoreForAction(actionType) {
  if (actionType === ACTION_PULL_ORDERS) return 'Order Core + Order Item Core + Status Core + Tracking Core + Finance Core'
  if (actionType === ACTION_RETRY_LABEL) return 'Order Core + Label Core + Tracking Core'
  if (actionType === ACTION_SYNC_FINANCE) return 'Order Core + Finance Core'
  if (actionType === ACTION_REFRESH_TRACKING || actionType === ACTION_REFRESH_STATUS) return 'Order Core + Tracking Core'
  if (actionType === ACTION_SYNC_DETAIL) return 'Order Core + Order Item Core + Customer Core'
  return 'Order Core + Label Core + Finance Core + Tracking Core + Order Item Core + Customer Core'
}

function labelQueuePayload(row = {}, core = {}, reason = '') {
  const tracking = cleanText(core.tracking_number || row.tracking_number || row.tracking_core_tracking_number)
  const labelStatus = cleanText(row.label_status || core.label_status || core.label_sync_status || (row.label_file_path ? 'complete' : 'missing')).toLowerCase()
  const filePath = cleanText(row.label_file_path || core.label_file_path)
  return {
    order_id: cleanText(core.order_id || row.order_id),
    label_needs_retry: true,
    label_status: labelStatus || 'missing',
    label_reason: cleanText(row.label_reason || core.label_reason || reason),
    label_error: cleanText(row.label_error || row.last_label_error || core.last_label_error),
    label_file_path: filePath || null,
    retry_count: Number(row.retry_count || row.label_retry_count || 0) || 0,
    max_retry: Number(row.max_retry || row.max_label_retry || 3) || 3,
    next_label_retry_at: cleanText(row.next_label_retry_at || row.next_retry_at),
    last_label_synced_at: cleanText(row.last_label_synced_at || row.last_label_download_at),
    label_source: cleanText(row.label_source || core.label_download_source || core.label_refresh_mode || 'Label Core'),
    raw_payload: parseJsonSafe(row.label_raw_payload, {
      order_id: cleanText(core.order_id || row.order_id),
      tracking_number: tracking,
      source_core: 'Label Core'
    })
  }
}

function financeQueuePayload(row = {}, core = {}, reason = '') {
  const rawPayload = parseJsonSafe(row.fee_raw_data || row.raw_payload, {
    order_id: cleanText(core.order_id || row.order_id),
    source_core: 'Finance Core'
  })
  return {
    order_id: cleanText(core.order_id || row.order_id),
    finance_needs_resync: true,
    finance_sync_status: cleanText(core.finance_sync_status || row.finance_sync_status || reason || 'missing'),
    finance_source: cleanText(core.finance_source || row.finance_source || row.fee_source || 'missing'),
    finance_confidence: cleanText(core.finance_confidence || row.finance_confidence || 'missing'),
    settlement_status: cleanText(row.settlement_status || core.settlement_status || row.profit_status || core.finance_sync_status),
    actual_income: numberOrNull(row.actual_income ?? row.actual_income_settlement ?? row.fee_detail_settlement),
    estimated_income: numberOrNull(row.estimated_income ?? row.settlement_total),
    settlement_total: numberOrNull(row.settlement_total ?? row.estimated_income),
    last_finance_synced_at: cleanText(row.last_finance_synced_at || row.fee_synced_at || row.fee_updated_at || row.source_updated_at),
    next_finance_retry_at: cleanText(row.next_finance_retry_at || row.next_retry_at),
    last_finance_error: cleanText(row.last_finance_error || row.finance_error || row.last_fee_error),
    raw_payload: rawPayload
  }
}

function trackingQueuePayload(row = {}, core = {}, reason = '') {
  const rawStatus = cleanText(row.tracking_sync_status || core.tracking_sync_status).toLowerCase()
  const retryStatus = reason === 'tracking_events_empty' || reason === 'tracking_stale_after_status_update'
    ? 'stale'
    : reason === 'tracking_number_missing'
      ? 'missing'
      : reason
  const trackingStatus = TRACKING_RESYNC_STATUSES.has(rawStatus) ? rawStatus : retryStatus
  return {
    order_id: cleanText(core.order_id || row.order_id),
    tracking_needs_resync: true,
    tracking_sync_status: cleanText(trackingStatus || 'missing'),
    tracking_number: cleanText(core.tracking_number || row.tracking_number || row.tracking_core_tracking_number) || null,
    carrier: cleanText(row.carrier || row.shipping_carrier || row.tracking_core_logistics_provider),
    events: trackingEventsFromRow(row),
    last_tracking_synced_at: cleanText(row.last_tracking_synced_at || row.tracking_last_sync_at || row.tracking_core_last_sync_at),
    next_tracking_retry_at: cleanText(row.next_tracking_retry_at || row.next_retry_at),
    last_tracking_error: cleanText(row.last_tracking_error || row.tracking_last_error || row.tracking_core_last_error),
    raw_payload: parseJsonSafe(row.tracking_raw_payload, {
      order_id: cleanText(core.order_id || row.order_id),
      source_core: 'Tracking Core'
    })
  }
}

function evaluateLabel(row = {}, core = {}) {
  const status = cleanText(row.label_status || core.label_status || core.label_sync_status).toLowerCase()
  const filePath = cleanText(row.label_file_path || core.label_file_path)
  const labelValid = core.label_valid === true || row.label_valid === true
  const reason = cleanText(row.label_reason || core.label_reason || row.last_label_error || core.last_label_error)
  const tracking = hasRealTracking(row, core)
  if (LABEL_RETRY_STATUSES.has(status)) return { eligible: true, reason: status || 'label_status_retry' }
  if ((!filePath || !labelValid) && tracking) return { eligible: true, reason: filePath ? 'label_file_invalid_with_tracking' : 'label_file_path_missing_with_tracking' }
  if (reason && /(retry|not_ready|failed|error|pending_retry|document_generating)/i.test(reason)) {
    return { eligible: true, reason: 'label_reason_retry' }
  }
  return { eligible: false, reason: tracking ? 'label_ready_or_not_requested' : 'tracking_number_missing' }
}

function evaluateFinance(row = {}, core = {}) {
  const status = cleanText(core.finance_sync_status || row.finance_sync_status).toLowerCase()
  const source = cleanText(core.finance_source || row.finance_source || row.fee_source).toLowerCase()
  const settlement = cleanText(row.settlement_status || core.settlement_status || row.profit_status || status).toLowerCase()
  const statusAt = timestampValue(statusUpdatedAt(row, core))
  const financeAt = timestampValue(row.last_finance_synced_at || row.fee_synced_at || row.fee_updated_at || row.source_updated_at)
  const terminal = terminalOrder(row, core)
  if (core.finance_needs_resync === true || row.finance_needs_resync === true) return { eligible: true, reason: status || 'finance_needs_resync' }
  if (FINANCE_RESYNC_STATUSES.has(status)) return { eligible: true, reason: status }
  if (source.includes('cost_setting') || source.includes('cost settings')) return { eligible: true, reason: 'cost_setting_fallback' }
  if (settlement === 'pending_settlement' || settlement === 'pending_return_settlement') return { eligible: true, reason: settlement }
  if (terminal && (!financeAt || (statusAt && financeAt < statusAt))) return { eligible: true, reason: 'terminal_finance_stale' }
  return { eligible: false, reason: status === 'complete' ? 'finance_confirmed' : 'finance_not_requested' }
}

function evaluateTracking(row = {}, core = {}) {
  const status = cleanText(row.tracking_sync_status || core.tracking_sync_status).toLowerCase()
  const events = trackingEventsFromRow(row)
  const tracking = hasRealTracking(row, core)
  const statusAt = timestampValue(statusUpdatedAt(row, core))
  const trackingAt = timestampValue(row.last_tracking_synced_at || row.tracking_last_sync_at || row.tracking_core_last_sync_at)
  if (TRACKING_RESYNC_STATUSES.has(status)) return { eligible: true, reason: status }
  if (!tracking && !terminalOrder(row, core)) return { eligible: true, reason: 'tracking_number_missing' }
  if (tracking && events.length === 0) return { eligible: true, reason: 'tracking_events_empty' }
  if (statusAt && (!trackingAt || trackingAt < statusAt)) return { eligible: true, reason: 'tracking_stale_after_status_update' }
  return { eligible: false, reason: tracking ? 'tracking_ready' : 'terminal_without_tracking_retry' }
}

function evaluateDetail(row = {}, core = {}) {
  const status = cleanText(core.detail_sync_status || row.detail_sync_status).toLowerCase()
  const hasCustomer = hasRealValue(row.customer_name || row.customer_phone || core.customer_name || core.customer_phone)
  const itemCount = Number(row.item_count || row.items_count || 0) || 0
  const hasDetail = hasRealValue(row.seller_center_detail_url || row.detail_url_verified_at || row.source_updated_at)
  if (['missing', 'manual_required', 'failed'].includes(status)) return { eligible: true, reason: status || 'detail_sync_status_missing' }
  if (!hasCustomer) return { eligible: true, reason: 'customer_core_missing' }
  if (itemCount <= 0) return { eligible: true, reason: 'order_item_core_missing' }
  if (!hasDetail && cleanText(row.source_mode).toLowerCase() !== 'api') return { eligible: true, reason: 'detail_core_missing' }
  return { eligible: false, reason: 'detail_ready' }
}

function selectedOrderSet(options = {}) {
  const selected = Array.isArray(options.selected_order_ids)
    ? options.selected_order_ids
    : readList(options.selected_order_ids || options.selectedOrderIds)
  return new Set(selected.map(cleanText).filter(Boolean))
}

export function evaluateManualDateScanRows(rows = [], options = {}) {
  const actionType = normalizeActionType(options.action_type)
  const platform = cleanText(options.platform).toLowerCase()
  const shop = defaultShopForPlatform(platform, options.shop)
  const dateField = normalizeDateField(options.date_field) || 'created_at'
  const selected = selectedOrderSet(options)
  const liveMode = options.dry_run === false
  const filteredRows = rows.filter(row => inDateRange(row, { ...options, date_field: dateField }))
  const labelQueue = []
  const financeQueue = []
  const trackingQueue = []
  const perOrder = []

  for (const row of filteredRows) {
    const core = normalizeOrderListRowForCore(row, {
      fee: {
        source: row.fee_source || row.finance_source,
        updated_at: row.fee_synced_at || row.last_finance_synced_at
      }
    })
    const orderId = cleanText(core.order_id || row.order_id)
    const checks = []
    if (actionType === ACTION_SCAN_ALL_ERRORS || actionType === ACTION_RETRY_LABEL) {
      const check = evaluateLabel(row, core)
      checks.push({ action: ACTION_RETRY_LABEL, check, queue: () => labelQueuePayload(row, core, check.reason) })
    }
    if (actionType === ACTION_SCAN_ALL_ERRORS || actionType === ACTION_SYNC_FINANCE) {
      const check = evaluateFinance(row, core)
      checks.push({ action: ACTION_SYNC_FINANCE, check, queue: () => financeQueuePayload(row, core, check.reason) })
    }
    if (actionType === ACTION_SCAN_ALL_ERRORS || actionType === ACTION_REFRESH_TRACKING) {
      const check = evaluateTracking(row, core)
      checks.push({ action: ACTION_REFRESH_TRACKING, check, queue: () => trackingQueuePayload(row, core, check.reason) })
    }
    if (actionType === ACTION_SCAN_ALL_ERRORS || actionType === ACTION_SYNC_DETAIL) {
      const check = evaluateDetail(row, core)
      checks.push({ action: ACTION_SYNC_DETAIL, check, queue: () => ({
        order_id: orderId,
        detail_needs_resync: true,
        detail_sync_status: cleanText(core.detail_sync_status || row.detail_sync_status || check.reason),
        raw_payload: parseJsonSafe(row.raw_payload, { order_id: orderId, source_core: 'Order Core' })
      }) })
    }
    if (actionType === ACTION_PULL_ORDERS) {
      checks.push({
        action: ACTION_PULL_ORDERS,
        check: { eligible: true, reason: 'manual_pull_orders_anchor' },
        queue: () => ({ order_id: orderId, pull_orders_anchor: true, source_core: 'Order Core' })
      })
    }
    if (actionType === ACTION_REFRESH_STATUS) {
      checks.push({
        action: ACTION_REFRESH_STATUS,
        check: { eligible: true, reason: 'manual_refresh_status_selected' },
        queue: () => ({ order_id: orderId, refresh_status: true, source_core: 'Order Core' })
      })
    }

    if (options.force && liveMode && selected.has(orderId)) {
      // Người vận hành đã chọn trực tiếp order_id và bật force thì vẫn phải queue runner để kiểm lại Core/readback.
      checks.forEach(item => {
        if (!item.check.eligible) item.check = { eligible: true, reason: 'force_selected_order' }
      })
    }
    const eligibleActions = checks.filter(item => item.check.eligible)
    const eligible = eligibleActions.length > 0
    if (eligible) {
      for (const item of eligibleActions) {
        const payload = item.queue()
        if (item.action === ACTION_RETRY_LABEL) labelQueue.push(payload)
        if (item.action === ACTION_SYNC_FINANCE) financeQueue.push(payload)
        if (item.action === ACTION_REFRESH_TRACKING) trackingQueue.push(payload)
      }
    }
    const firstAction = actionType === ACTION_SCAN_ALL_ERRORS
      ? eligibleActions.map(item => item.action).join(',') || 'none'
      : actionType
    const skipReason = eligible
      ? ''
      : (checks.map(item => item.check.reason).filter(Boolean).join('; ') || 'not_eligible')
    perOrder.push({
      order_id: orderId,
      action: firstAction,
      eligible,
      selected_for_live: liveMode && selected.has(orderId),
      skip_reason: skipReason,
      source_core: sourceCoreForAction(actionType),
      current_status: cleanText(core.display_status_vi || core.order_status_core || row.marketplace_status || row.oms_status || row.shipping_status),
      runner_api_path: actionPath(platform, shop, actionType === ACTION_SCAN_ALL_ERRORS ? firstAction.split(',')[0] : actionType),
      action_path: actionPath(platform, shop, actionType === ACTION_SCAN_ALL_ERRORS ? firstAction.split(',')[0] : actionType)
    })
  }

  const selectedEligible = perOrder.filter(row => row.eligible && (!liveMode || selected.has(row.order_id)))
  return {
    status: 'ok',
    date_scan: true,
    dry_run: options.dry_run !== false,
    action_type: actionType,
    platform,
    shop,
    from_date: normalizeDate(options.from || options.from_date),
    to_date: normalizeDate(options.to || options.to_date),
    date_field: dateField,
    limit: Number(options.limit || filteredRows.length || 0) || 0,
    total_orders_in_date_range: filteredRows.length,
    eligible_count: liveMode ? selectedEligible.length : perOrder.filter(row => row.eligible).length,
    skipped_count: filteredRows.length - (liveMode ? selectedEligible.length : perOrder.filter(row => row.eligible).length),
    selected_order_ids: [...selected],
    selected_eligible_order_ids: selectedEligible.map(row => row.order_id),
    per_order: perOrder,
    details: perOrder,
    label_retry_queue: labelQueue,
    finance_resync_queue: financeQueue,
    tracking_resync_queue: trackingQueue
  }
}

function normalizeBody(body = {}, url) {
  const platform = cleanText(body.platform || url.searchParams.get('platform')).toLowerCase()
  const shop = defaultShopForPlatform(platform, body.shop || body.shop_id || url.searchParams.get('shop') || url.searchParams.get('shop_id'))
  const from = normalizeDate(body.from || body.from_date || url.searchParams.get('from') || url.searchParams.get('from_date'))
  const to = normalizeDate(body.to || body.to_date || url.searchParams.get('to') || url.searchParams.get('to_date'))
  const date_field = normalizeDateField(body.date_field || body.dateField || url.searchParams.get('date_field') || url.searchParams.get('dateField'))
  const requestedLimit = Number(body.limit || url.searchParams.get('limit') || (platform === 'tiktok' ? 10 : 20)) || (platform === 'tiktok' ? 10 : 20)
  const action_type = normalizeActionType(body.action_type || body.actionType || url.searchParams.get('action_type') || url.searchParams.get('actionType'))
  const requestedScope = readList(body.sync_scope || body.scope || url.searchParams.get('sync_scope') || url.searchParams.get('scope'))
  const selected_order_ids = Array.isArray(body.selected_order_ids)
    ? body.selected_order_ids.map(cleanText).filter(Boolean)
    : readList(body.selected_order_ids || body.selectedOrderIds || url.searchParams.get('selected_order_ids') || url.searchParams.get('selectedOrderIds'))
  return {
    action_type,
    platform,
    shop,
    from,
    to,
    date_field,
    dry_run: boolParam(body.dry_run || url.searchParams.get('dry_run')),
    limit: platform === 'tiktok'
      ? Math.min(Math.max(requestedLimit, 1), 10)
      : Math.min(Math.max(requestedLimit, 1), 20),
    force: boolParam(body.force || url.searchParams.get('force')),
    sync_scope: action_type ? actionScope(action_type, requestedScope) : requestedScope,
    missing_only: boolParam(body.missing_only || url.searchParams.get('missing_only')),
    retry_failed: boolParam(body.retry_failed || url.searchParams.get('retry_failed')),
    pending_settlement_only: boolParam(body.pending_settlement_only || url.searchParams.get('pending_settlement_only')),
    missing_detail_url_only: boolParam(body.missing_detail_url_only || url.searchParams.get('missing_detail_url_only')),
    force_runner_smoke: boolParam(body.force_runner_smoke || body.forceRunnerSmoke || url.searchParams.get('force_runner_smoke')),
    order_id: cleanText(body.order_id || body.order_sn || body.order_no || url.searchParams.get('order_id') || url.searchParams.get('order_sn') || url.searchParams.get('order_no')),
    order_ids: Array.isArray(body.order_ids) ? body.order_ids.map(cleanText).filter(Boolean) : [],
    selected_order_ids
  }
}

function summarize(platform, options, eligible, queued = {}) {
  const orders = eligible.orders || []
  const policy = runnerPolicy(platform, options.limit)
  return {
    status: 'ok',
    dry_run: options.dry_run,
    action_type: options.action_type,
    action_scope: options.sync_scope,
    platform,
    shop: options.shop,
    from: options.from,
    to: options.to,
    source: platform === 'tiktok' ? TIKTOK_SELLER_CENTER_DETAIL_SOURCE : SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    sync_scope: options.sync_scope,
    scanned: eligible.scanned || 0,
    eligible: eligible.eligible_count || orders.length,
    queued: queued.queued_orders || 0,
    queued_jobs: queued.queued_jobs || 0,
    parsed: 0,
    updated: 0,
    skipped: queued.skipped_source_mismatch || 0,
    errors: [],
    manual_required: 0,
    local_runner_required: policy.local_runner_required,
    chrome_profile_path: policy.chrome_profile_path,
    api_shop_chrome_blocked: false,
    runner_requires_login: policy.runner_requires_login,
    runner_state: policy,
    next_retry_at: '',
    source_routing: sourceRouting(platform, options.shop),
    runner_smoke_fallback: eligible.runner_smoke_fallback === true,
    runner_smoke_reason: eligible.runner_smoke_reason || '',
    details: orders.map(row => ({
      order_id: row.order_id || row.order_sn || row.order_no,
      platform,
      shop: row.shop,
      reason: row.reason,
      seller_center_detail_url: row.seller_center_detail_url || row.detail_url || '',
      resolve_detail_url: row.resolve_detail_url === true,
      short_message: row.resolve_detail_url ? 'Chưa tìm được link chi tiết Seller Center.' : 'Chờ chạy batch.'
    })),
    jobs: queued.jobs || []
  }
}

async function queueRunnerJob(env, options = {}, actionType = ACTION_PULL_ORDERS) {
  await ensureJobsTable(env)
  const now = new Date()
  const taskType = actionType === ACTION_PULL_ORDERS || actionType === ACTION_REFRESH_STATUS || actionType === ACTION_REFRESH_TRACKING ? 'don_hang' : actionType
  const payload = {
    task_type: taskType,
    action_type: actionType,
    trigger: cleanText(options.trigger || actionType),
    scope: actionScope(actionType, options.sync_scope || []),
    shop: options.shop,
    platform: options.platform,
    from: options.from,
    to: options.to,
    date_field: options.date_field || '',
    limit: options.limit,
    order_ids: options.order_ids || (options.order_id ? [options.order_id] : []),
    selected_order_ids: options.selected_order_ids || [],
    source: options.platform === 'tiktok' ? TIKTOK_SELLER_CENTER_DETAIL_SOURCE : SHOPEE_SELLER_CENTER_DETAIL_SOURCE
  }
  const result = await env.DB.prepare(`
    INSERT INTO jobs (user_id, shop_name, platform, month, year, status, scheduled_at, task_type, from_date, to_date, payload)
    VALUES ('admin', ?, ?, ?, ?, 'queued', NULL, ?, ?, ?, ?)
  `).bind(
    options.shop,
    options.platform,
    now.getMonth() + 1,
    now.getFullYear(),
    taskType,
    options.from,
    options.to,
    JSON.stringify(payload)
  ).run()
  const id = result?.meta?.last_row_id || result?.lastRowId || null
  return {
    queued_jobs: id ? 1 : 0,
    queued_orders: 0,
    jobs: id ? [{ id, shop: options.shop, platform: options.platform, task_type: taskType, action_type: actionType }] : []
  }
}

function summarizeRunnerJob(platform, options, queued = {}, actionType = ACTION_PULL_ORDERS) {
  const actionLabels = {
    [ACTION_PULL_ORDERS]: 'kéo danh sách đơn mới',
    [ACTION_REFRESH_STATUS]: 'cập nhật trạng thái',
    [ACTION_REFRESH_TRACKING]: 'quét lại tracking',
    [ACTION_SYNC_DETAIL]: 'đồng bộ chi tiết',
    [ACTION_SYNC_FINANCE]: 'đồng bộ tài chính',
    [ACTION_RETRY_LABEL]: 'tải lại tem'
  }
  const actionLabel = actionLabels[actionType] || actionType
  const policy = runnerPolicy(platform, options.limit)
  return {
    status: 'ok',
    dry_run: options.dry_run,
    action_type: actionType,
    action_scope: actionScope(actionType, options.sync_scope || []),
    platform,
    shop: options.shop,
    from: options.from,
    to: options.to,
    source: platform === 'tiktok' ? TIKTOK_SELLER_CENTER_DETAIL_SOURCE : SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    scanned: 0,
    eligible: options.dry_run ? 1 : queued.queued_jobs || 0,
    queued: queued.queued_orders || 0,
    queued_jobs: queued.queued_jobs || 0,
    orders_scanned: 0,
    orders_created: 0,
    orders_updated: 0,
    orders_unchanged: 0,
    parsed_status: false,
    parsed_tracking: false,
    parsed_items: false,
    errors: [],
    manual_required: 0,
    local_runner_required: policy.local_runner_required,
    chrome_profile_path: policy.chrome_profile_path,
    api_shop_chrome_blocked: false,
    runner_requires_login: policy.runner_requires_login,
    runner_state: policy,
    source_routing: sourceRouting(platform, options.shop),
    message: options.dry_run
      ? `Dry-run ${actionType}: sẽ queue job ${actionLabel}, chưa chạy runner.`
      : `Đã queue job ${actionType}. PASS chỉ tính sau khi runner và OMS readback hoàn tất.`,
    details: [{
      order_id: '',
      platform,
      shop: options.shop,
      result: options.dry_run ? `dry_run_${actionType}` : `queued_${actionType}`,
      reason: actionType,
      short_message: `${actionLabel} sẽ đi qua file tính năng riêng rồi ghi về Warehouse/Core.`
    }],
    jobs: queued.jobs || []
  }
}

function dateFieldSql(dateField) {
  if (dateField === 'updated_at') {
    return `COALESCE(NULLIF(o.oms_updated_at, ''), NULLIF(o.source_updated_at, ''), NULLIF(o.order_date, ''))`
  }
  if (dateField === 'status_updated_at') {
    return `COALESCE(NULLIF(o.status_changed_at, ''), NULLIF(o.last_status_sync_at, ''), NULLIF(o.source_updated_at, ''), NULLIF(o.oms_updated_at, ''), NULLIF(o.order_date, ''))`
  }
  if (dateField === 'last_synced_at') {
    return `COALESCE(NULLIF(o.source_updated_at, ''), NULLIF(f.updated_at, ''), NULLIF(otc.last_tracking_sync_at, ''), NULLIF(ol.refreshed_at, ''), NULLIF(o.last_status_sync_at, ''), NULLIF(o.oms_updated_at, ''), NULLIF(o.order_date, ''))`
  }
  return `COALESCE(NULLIF(o.order_date, ''), NULLIF(o.source_updated_at, ''), NULLIF(o.oms_updated_at, ''))`
}

async function fetchManualDateScanRows(env, options = {}) {
  const dateField = normalizeDateField(options.date_field) || 'created_at'
  const dateExpr = dateFieldSql(dateField)
  const where = ['LOWER(COALESCE(o.platform, \'\')) = ?']
  const params = [options.platform]
  const directOrderIds = [
    options.order_id,
    ...(Array.isArray(options.order_ids) ? options.order_ids : []),
    ...(Array.isArray(options.selected_order_ids) ? options.selected_order_ids : [])
  ].map(cleanText).filter(Boolean)
  if (options.shop) {
    where.push('LOWER(COALESCE(o.shop, \'\')) = ?')
    params.push(cleanText(options.shop).toLowerCase())
  }
  if (directOrderIds.length) {
    // Chạy thủ công theo mã đơn phải ưu tiên đúng order_id đã chọn, không để limit/date scan bỏ sót đơn.
    where.push(`o.order_id IN (${directOrderIds.map(() => '?').join(',')})`)
    params.push(...directOrderIds)
  } else if (options.from) {
    where.push(`date(${dateExpr}) >= date(?)`)
    params.push(options.from)
  }
  if (!directOrderIds.length && options.to) {
    where.push(`date(${dateExpr}) <= date(?)`)
    params.push(options.to)
  }
  const whereSql = where.join(' AND ')
  const total = await env.DB.prepare(`
    SELECT COUNT(1) AS total
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN order_labels ol ON ol.order_id = o.order_id
    LEFT JOIN order_tracking_core otc ON otc.order_id = o.order_id
    WHERE ${whereSql}
  `).bind(...params).first()
  const rows = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.order_date,
      o.order_type,
      o.shipping_status,
      o.oms_status,
      o.source_mode,
      o.source_detail,
      o.source_updated_at,
      o.oms_updated_at,
      o.last_status_sync_at,
      o.last_status_sync_status,
      o.last_status_sync_error,
      o.status_changed_at,
      o.next_retry_at,
      o.tracking_number,
      o.shipping_carrier,
      o.customer_name,
      o.customer_phone,
      o.seller_center_detail_url,
      o.detail_url_verified_at,
      f.source AS fee_source,
      f.raw_data AS fee_raw_data,
      f.updated_at AS fee_synced_at,
      f.settlement AS actual_income_settlement,
      f.total_fees AS fee_api_total,
      f.fee_commission AS fee_detail_commission,
      f.fee_payment AS fee_detail_payment,
      f.fee_service AS fee_detail_service,
      f.fee_piship AS fee_detail_piship,
      ol.storage_key AS label_file_path,
      ol.content_type AS label_content_type,
      ol.refreshed_at AS last_label_synced_at,
      ol.error AS last_label_error,
      otc.tracking_number AS tracking_core_tracking_number,
      otc.logistics_provider AS tracking_core_logistics_provider,
      otc.tracking_events AS tracking_events,
      otc.tracking_source AS tracking_core_source,
      otc.last_tracking_sync_at AS tracking_last_sync_at,
      otc.last_tracking_error AS tracking_last_error,
      (
        SELECT COUNT(1)
        FROM order_items oi
        WHERE oi.order_id = o.order_id
      ) AS item_count,
      ${dateExpr} AS date_scan_value
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN order_labels ol ON ol.order_id = o.order_id
    LEFT JOIN order_tracking_core otc ON otc.order_id = o.order_id
    WHERE ${whereSql}
    ORDER BY date(${dateExpr}) DESC, o.order_id DESC
    LIMIT ?
  `).bind(...params, options.limit).all()
  return {
    total_orders_in_date_range: Number(total?.total || 0) || 0,
    rows: rows.results || []
  }
}

async function runManualDateScan(env, options = {}) {
  const fetched = await fetchManualDateScanRows(env, options)
  const result = evaluateManualDateScanRows(fetched.rows, {
    ...options,
    dry_run: options.dry_run,
    date_field: options.date_field
  })
  result.total_orders_in_date_range = fetched.total_orders_in_date_range
  result.scanned = fetched.rows.length
  if (options.dry_run) return result
  const selected = selectedOrderSet(options)
  const selectedEligibleIds = result.per_order
    .filter(row => row.eligible && selected.has(row.order_id))
    .map(row => row.order_id)
  if (!selectedEligibleIds.length) {
    return {
      ...result,
      status: 'error',
      error: 'selected_order_ids_not_eligible',
      message: 'Live run chỉ nhận order_id nằm trong dry-run eligible list.'
    }
  }
  const queued = await queueRunnerJob(env, {
    ...options,
    order_ids: selectedEligibleIds,
    trigger: 'manual_date_scan'
  }, options.action_type)
  return {
    ...result,
    selected_eligible_order_ids: selectedEligibleIds,
    queued_jobs: queued.queued_jobs || 0,
    queued_orders: selectedEligibleIds.length,
    jobs: queued.jobs || [],
    result_status: queued.queued_jobs ? 'queued' : 'not_queued',
    core_readback: {
      selected_order_ids: selectedEligibleIds,
      source_core: sourceCoreForAction(options.action_type)
    }
  }
}

function daysFromRange(from = '', to = '') {
  const start = normalizeDate(from)
  const end = normalizeDate(to)
  if (!start || !end) return 3
  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 3
  const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  return Math.max(1, Math.min(diffDays, 30))
}

async function runApiPullOrders(env, cors, options = {}, routing = {}) {
  const apiResult = await syncApiOrders(env, cors, {
    platform: options.platform,
    shop: options.shop,
    days: daysFromRange(options.from, options.to),
    limit: Math.max(1, Math.min(Number(options.limit || 40) || 40, 100)),
    fetch_fees: false,
    fetch_tracking: options.platform === 'lazada',
    suppress_push: true
  })
  const errors = Array.isArray(apiResult.errors) ? apiResult.errors : []
  const status = errors.length ? 'failed' : 'completed'
  return {
    status: errors.length ? 'error' : 'ok',
    dry_run: false,
    date_scan: true,
    action_type: ACTION_PULL_ORDERS,
    platform: options.platform,
    shop: options.shop,
    from_date: options.from,
    to_date: options.to,
    date_field: options.date_field,
    selected_order_ids: options.selected_order_ids,
    selected_eligible_order_ids: options.selected_order_ids,
    result_status: status,
    api_path: '/api/orders/sync-api-orders',
    runner_api_path: 'Open Platform / Worker API -> Core',
    source_routing: routing,
    total_orders_in_date_range: options.selected_order_ids.length,
    eligible_count: options.selected_order_ids.length,
    skipped_count: 0,
    fetched: Number(apiResult.fetched || 0) || 0,
    imported_orders: Number(apiResult.imported_orders || 0) || 0,
    imported_items: Number(apiResult.imported_items || 0) || 0,
    updated: (apiResult.shops || []).reduce((sum, row) => sum + (Number(row.updated || 0) || 0), 0),
    errors,
    jobs: [],
    core_readback: {
      source_core: sourceCoreForAction(ACTION_PULL_ORDERS),
      fetched: Number(apiResult.fetched || 0) || 0,
      imported_orders: Number(apiResult.imported_orders || 0) || 0,
      imported_items: Number(apiResult.imported_items || 0) || 0,
      api_status: apiResult.status
    },
    api_result: apiResult,
    message: errors.length
      ? 'Open Platform/API pull_orders kết thúc lỗi; không dùng Chrome fallback cho shop API.'
      : 'Open Platform/API pull_orders đã chạy xong và ghi về Core.'
  }
}

export async function handleManualOrderBackfill(request, env, cors) {
  const url = new URL(request.url)
  if (request.method !== 'POST') {
    return Response.json({ status: 'error', error: 'method_not_allowed' }, { status: 405, headers: cors })
  }
  const body = await request.json().catch(() => ({}))
  const options = normalizeBody(body, url)
  if (
    options.action_type === ACTION_REFRESH_STATUS
    && !options.force
    && !options.missing_only
    && !options.retry_failed
    && !options.pending_settlement_only
    && !options.missing_detail_url_only
  ) {
    // Khi operator bấm Cập nhật trạng thái mà không giới hạn "chỉ đơn thiếu dữ liệu",
    // route phải queue refresh thật cho batch đang chọn thay vì chỉ trả completed_no_change.
    options.force = true
  }
  if (!options.action_type) {
    return Response.json({
      status: 'error',
      error: 'action_type_required',
      message: 'Cần truyền action_type=pull_orders, refresh_status, refresh_tracking, sync_detail, sync_finance, retry_label hoặc scan_all_errors.'
    }, { status: 400, headers: cors })
  }
  if (!['tiktok', 'shopee', 'lazada'].includes(options.platform)) {
    return Response.json({ status: 'error', error: 'unsupported_platform', message: 'Chỉ hỗ trợ TikTok, Shopee no-API hoặc trả diagnostic API cho Lazada.' }, { status: 400, headers: cors })
  }
  if ((!options.from || !options.to) && !options.order_id && !options.order_ids.length) {
    return Response.json({
      status: 'error',
      error: 'date_range_required',
      message: 'Cần chọn khoảng ngày hoặc mã đơn cụ thể để tránh quét toàn bộ đơn.'
    }, { status: 400, headers: cors })
  }

  const routing = sourceRouting(options.platform, options.shop)
  const rawDateField = cleanText(body.date_field || body.dateField || url.searchParams.get('date_field') || url.searchParams.get('dateField'))
  if (rawDateField && !options.date_field) {
    return Response.json({
      status: 'error',
      error: 'invalid_date_field',
      allowed: [...DATE_SCAN_FIELDS]
    }, { status: 400, headers: cors })
  }
  const dateScanMode = Boolean(options.date_field || options.action_type === ACTION_REFRESH_TRACKING || options.action_type === ACTION_SCAN_ALL_ERRORS)
  if (dateScanMode) {
    if (!options.date_field) {
      return Response.json({
        status: 'error',
        error: 'date_field_required',
        allowed: [...DATE_SCAN_FIELDS]
      }, { status: 400, headers: cors })
    }
    if (options.action_type === ACTION_SCAN_ALL_ERRORS && !options.dry_run) {
      return Response.json({
        status: 'error',
        error: 'scan_all_errors_dry_run_only',
        message: 'scan_all_errors chỉ trả preview tổng hợp, không chạy live.'
      }, { status: 400, headers: cors })
    }
    if (!options.dry_run && !options.selected_order_ids.length) {
      return Response.json({
        status: 'error',
        error: 'selected_order_ids_required',
        message: 'Live run chỉ nhận danh sách order_id đã chọn từ dry-run.'
      }, { status: 400, headers: cors })
    }
    if (!options.dry_run && options.action_type === ACTION_PULL_ORDERS && ((options.platform === 'shopee' && !routing.seller_center_allowed) || options.platform === 'lazada')) {
      const result = await runApiPullOrders(env, cors, options, routing)
      return Response.json(result, { status: result.status === 'error' ? 502 : 200, headers: cors })
    }
    if (!options.dry_run && ((options.platform === 'shopee' && !routing.seller_center_allowed) || options.platform === 'lazada')) {
      return Response.json({
        status: 'error',
        error: 'api_shop_live_requires_open_platform_job',
        message: 'Shop API không chạy Chrome/Seller Center fallback; live phải đi Open Platform job riêng.',
        source_routing: routing
      }, { status: 400, headers: cors })
    }
    const result = await runManualDateScan(env, options)
    const httpStatus = result.status === 'error' ? 400 : 200
    return Response.json(result, { status: httpStatus, headers: cors })
  }

  if ((options.platform === 'shopee' && !routing.seller_center_allowed) || options.platform === 'lazada') {
    const policy = apiShopBlockedPolicy(options.platform, options.shop)
    return Response.json({
      status: 'ok',
      dry_run: options.dry_run,
      action_type: options.action_type,
      action_scope: options.sync_scope,
      platform: options.platform,
      shop: options.shop,
      scanned: 0,
      eligible: 0,
      queued: 0,
      skipped: 1,
      errors: [],
      manual_required: 0,
      source: 'Open Platform / Worker API',
      local_runner_required: false,
      chrome_profile_path: '',
      api_shop_chrome_blocked: true,
      runner_requires_login: false,
      source_routing: routing,
      runner_state: policy,
      message: 'Shop API dùng Open Platform, không đưa sang Seller Center fallback.'
    }, { headers: cors })
  }

  if ([ACTION_PULL_ORDERS, ACTION_REFRESH_STATUS, ACTION_RETRY_LABEL].includes(options.action_type)) {
    const queued = options.dry_run
      ? { queued_jobs: 0, queued_orders: 0, dry_run: true, jobs: [] }
      : await queueRunnerJob(env, { ...options, trigger: options.action_type }, options.action_type)
    return Response.json(summarizeRunnerJob(options.platform, options, queued, options.action_type), { headers: cors })
  }

  if (options.platform === 'tiktok') {
    let eligible = await listTiktokSellerCenterFinanceEligibleOrders(env, options)
    if (!eligible.eligible_count && options.force_runner_smoke && !options.dry_run) {
      // Khi bấm Web/Radar phải có bằng chứng runner thật, nên lấy 1 đơn mới nhất đúng shop để smoke runner.
      eligible = await listTiktokSellerCenterFinanceEligibleOrders(env, {
        ...options,
        from: '',
        to: '',
        order_id: '',
        order_ids: [],
        force: true,
        limit: 1,
        missing_only: false,
        pending_settlement_only: false
      })
      eligible.runner_smoke_fallback = true
      eligible.runner_smoke_reason = 'no_eligible_order_in_requested_window'
    }
    const queued = options.dry_run
      ? { queued_jobs: 0, queued_orders: 0, dry_run: true, jobs: [] }
      : await queueTiktokSellerCenterFinanceJobs(env, eligible.orders || [], {
        trigger: options.action_type,
        action_type: options.action_type,
        scope: options.sync_scope,
        limit: options.limit
      })
    return Response.json(summarize('tiktok', options, eligible, queued), { headers: cors })
  }

  let eligible = await listShopeeSellerCenterDetailEligibleOrders(env, options)
  if (!eligible.eligible_count && options.force_runner_smoke && !options.dry_run) {
    // Khi thiếu đơn eligible trong ngày, vẫn queue 1 đơn thật từ Core để chứng minh Chrome/Seller Center chạy.
    eligible = await listShopeeSellerCenterDetailEligibleOrders(env, {
      ...options,
      from: '',
      to: '',
      order_id: '',
      order_ids: [],
      force: true,
      limit: 1,
      missing_only: false,
      pending_settlement_only: false,
      missing_detail_url_only: false
    })
    eligible.runner_smoke_fallback = true
    eligible.runner_smoke_reason = 'no_eligible_order_in_requested_window'
  }
  const queued = options.dry_run
    ? { queued_jobs: 0, queued_orders: 0, dry_run: true, jobs: [] }
    : await queueShopeeSellerCenterDetailJobs(env, eligible.orders || [], {
      trigger: options.action_type,
      action_type: options.action_type,
      scope: options.sync_scope,
      limit: options.limit
    })
  return Response.json(summarize('shopee', options, eligible, queued), { headers: cors })
}
