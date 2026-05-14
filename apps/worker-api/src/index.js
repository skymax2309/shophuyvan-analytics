
import { getFilters, buildWhere }        from './utils/filters.js'
import { getCostSettings, calcProfit }   from './utils/db.js'
import { handleProducts, handleCostSettings, handleVariations } from './routes/products.js'
import { autoRefreshShopeeTokens, handleShopsWarehouse } from './routes/shops.js'
import { exportOrders, recalcCost, cleanupOrderFeePhase1, importOrdersV2, normalizeOrderWorkflowStatuses, getOrders, getOrderFilterOptions, getOrderChanges, updateOmsStatus, normalizeOmsStatusPair } from './routes/orders.js'
import { dashboard, revenueByDay, profitByDay } from './routes/dashboard.js'
import { uniqueSkus, topSku, topProduct, topShop, topPlatform,
         cancelStats, priceCalc, topSkuFull } from './routes/dashboard-aux.js'
import { uploadReport, getReportSummary, getOperationCosts,
         getReports, getReportFile }     from './routes/reports.js'
import { createJob, getJobs, updateJob, deleteJob } from './routes/jobs.js'
import { handleBotSettings } from './routes/bot-settings.js'
import { getApiShops, handleApiOrderSync, handleApiStatusSync, handleApiProductSync, handleBuyerCancellationDecision, syncApiOrders, syncApiOrderStatuses, syncAdsCampaignSnapshots, syncLazadaReverseOrders, syncShopeeReturns } from './routes/api-sync.js'
import { getOrderLabel, getLabelStatus, refreshOrderLabel, recordLabelFile } from './routes/labels.js'
import { handleShopeeMarketplaceWebhook, handleLazadaMarketplaceWebhook, handleWebhookEventsStatus, handleWebhookSyncQueue, runMarketplacePushSyncQueueBatch } from './routes/marketplace-webhooks.js'
import { handleAdvancedApiFeatures } from './routes/api-features.js'
import { handleAdvancedModules } from './routes/api-modules.js'
import { handleChat, runChatAiAutoReplyBatch } from './routes/worker-chat-marketplace-route.js'
import { handleAds } from './routes/ads.js'
import { handleIncome } from './routes/income.js'
import { handleOrderAnalytics, rebuildOrderAnalytics } from './routes/order-analytics.js'
import { handleReturns } from './routes/returns.js'
import { handleReviews } from './routes/reviews.js'
import { handleTopPicks, syncShopeeTopPicks } from './routes/top-picks.js'
import { handleDiscounts, syncShopeeDiscounts, runPromotionDeepCacheBatch } from './routes/discounts.js'
import { handleOperations } from './routes/operations.js'
import { handleVideo, runVideoUploadQueueBatch } from './routes/video.js'
import { handleLogisticsWatch } from './routes/logistics-watch.js'
import { handleCustomerRisk } from './routes/customer-risk.js'
import { handleAdminAuth, getAdminUserFromRequest } from './routes/admin-auth.js'
import { buildPublicShopRows } from './core/shop-display-core.js'
import { parseInvoiceLocal, saveInvoice, listInvoices, getInvoiceFile,
         updateCostPrices, getSkuMap, getSkuGroups, saveSkuGroup,
         updateGroupPrice, deleteSkuGroup, deleteInvoice } from './routes/invoices.js'
import { handlePurchase } from './routes/purchase.js'
import {
  ACTIVE_PENDING_OPERATIONAL_STATUSES,
  ACTIVE_PENDING_ORDER_WINDOW_DAYS,
  isStaleOperationalPendingOrder,
  orderStatusParent,
  orderTypeFromStatus
} from './core/order-status-core.js'
import { handleAuth } from './handlers/auth.js' // Chèn Handler mới
		 
import { handlePrimaryWorkerRoutes } from './worker-router/primary-routes.js'
import { handleAutomationWorkerRoutes } from './worker-router/automation-routes.js'
import { handleDashboardWorkerRoutes } from './worker-router/dashboard-routes.js'
import { handleOrderWorkerRoutes } from './worker-router/order-routes.js'
import { handleFileWorkerRoutes } from './worker-router/file-routes.js'

const WORKER_ROUTE_DEPS = {
  handlePurchase,
  handleShopsWarehouse,
  handleProducts,
  handleVariations,
  handleCostSettings,
  importOrdersV2,
  handleApiOrderSync,
  handleApiStatusSync,
  handleApiProductSync,
  handleAdvancedApiFeatures,
  handleAdvancedModules,
  handleChat,
  handleVideo,
  handleAds,
  handleIncome,
  handleOrderAnalytics,
  handleReturns,
  handleReviews,
  handleTopPicks,
  handleDiscounts,
  handleOperations,
  handleLogisticsWatch,
  handleShopeeMarketplaceWebhook,
  handleLazadaMarketplaceWebhook,
  handleWebhookEventsStatus,
  handleWebhookSyncQueue,
  syncApiOrders,
  syncApiOrderStatuses,
  syncAdsCampaignSnapshots,
  syncLazadaReverseOrders,
  syncShopeeReturns,
  dashboard,
  revenueByDay,
  profitByDay,
  uniqueSkus,
  topSku,
  topSkuFull,
  topProduct,
  topShop,
  topPlatform,
  cancelStats,
  priceCalc,
  getCostSettings,
  calcProfit,
  getFilters,
  buildWhere,
  getApiShops,
  buildPublicShopRows,
  recalcCost,
  cleanupOrderFeePhase1,
  updateCostPrices,
  getSkuMap,
  getSkuGroups,
  saveSkuGroup,
  updateGroupPrice,
  deleteSkuGroup,
  deleteInvoice,
  parseInvoiceLocal,
  saveInvoice,
  listInvoices,
  getInvoiceFile,
  getOrders,
  getOrderFilterOptions,
  getOrderChanges,
  normalizeOrderWorkflowStatuses,
  handleBuyerCancellationDecision,
  updateOmsStatus,
  normalizeOmsStatusPair,
  handleCustomerRisk,
  uploadReport,
  getReports,
  getReportSummary,
  getOperationCosts,
  getReportFile,
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  handleBotSettings,
  getLabelStatus,
  refreshOrderLabel,
  getOrderLabel,
  recordLabelFile,
  getAdminUserFromRequest,
  cleanText,
  ensurePackingVideosTable,
  ensureOrderLabelsReadTable,
  handlePackingScanOrder,
  isValidLabelObject,
  ACTIVE_PENDING_OPERATIONAL_STATUSES,
  ACTIVE_PENDING_ORDER_WINDOW_DAYS,
  isStaleOperationalPendingOrder,
  orderStatusParent,
  orderTypeFromStatus
}

const REVIEWER_BLOCKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function isReviewerWriteRequest(request, url) {
  return url.pathname.startsWith('/api/') && REVIEWER_BLOCKED_METHODS.has(request.method)
}

async function blockReviewerWriteAccess(request, env, url, cors) {
  if (!isReviewerWriteRequest(request, url)) return null

  const user = await getAdminUserFromRequest(request, env)
  if (user?.role !== 'reviewer') return null

  return Response.json({
    ok: false,
    error: 'Tài khoản reviewer chỉ được xem dữ liệu, không được tạo/sửa/xóa/đồng bộ/gửi lên sàn.'
  }, {
    status: 403,
    headers: {
      ...cors,
      'Cache-Control': 'no-store'
    }
  })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

const PACKING_SCAN_FIELD_HINTS = new Set([
  'order_id',
  'orderid',
  'order_sn',
  'ordersn',
  'order_no',
  'orderno',
  'order_number',
  'ordernumber',
  'tracking_number',
  'trackingnumber',
  'tracking_no',
  'trackingno',
  'waybill',
  'waybill_no',
  'waybillno',
  'logistics_no',
  'logisticsno',
  'shipping_code',
  'shippingcode',
  'package_number',
  'packagenumber',
  'package_no',
  'packageno'
])

function isPackingScanToken(value) {
  const token = cleanText(value).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '')
  if (!token || token.length < 6 || token.length > 50) return false
  if (!/[0-9]/.test(token)) return false
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) return false
  return !/^(HTTPS?|WWW|SELLER|SHOPEE|LAZADA|TIKTOK|ORDER|TRACKING|WAYBILL|NUMBER)$/i.test(token)
}

function addPackingScanCandidate(list, seen, value) {
  const token = cleanText(value).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '')
  if (!isPackingScanToken(token)) return
  const key = token.toUpperCase()
  if (seen.has(key)) return
  seen.add(key)
  list.push(token)
}

function addPackingScanJsonValues(list, seen, value, depth = 0) {
  if (depth > 3 || value == null) return
  if (typeof value === 'string' || typeof value === 'number') {
    addPackingScanCandidate(list, seen, value)
    return
  }
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach(item => addPackingScanJsonValues(list, seen, item, depth + 1))
    return
  }
  if (typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = cleanText(key).replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (PACKING_SCAN_FIELD_HINTS.has(normalizedKey)) addPackingScanJsonValues(list, seen, child, depth + 1)
  }
}

function addPackingScanParams(list, seen, params) {
  for (const [key, value] of params.entries()) {
    const normalizedKey = cleanText(key).replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (PACKING_SCAN_FIELD_HINTS.has(normalizedKey)) addPackingScanCandidate(list, seen, value)
  }
}

function safeDecodeScanText(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function collectPackingScanCodes(value) {
  const raw = cleanText(value)
  if (!raw) return []
  const seen = new Set()
  const candidates = []
  const decoded = safeDecodeScanText(raw)
  const texts = [raw, decoded].filter((item, index, arr) => item && arr.indexOf(item) === index)

  for (const text of texts) {
    try {
      const parsedUrl = /^https?:\/\//i.test(text) ? new URL(text) : null
      if (parsedUrl) {
        addPackingScanParams(candidates, seen, parsedUrl.searchParams)
        parsedUrl.pathname.split(/[\/\s]+/).forEach(part => addPackingScanCandidate(candidates, seen, part))
      }
    } catch {}

    try {
      const params = new URLSearchParams(text.replace(/^[?#]/, ''))
      if ([...params.keys()].length) addPackingScanParams(candidates, seen, params)
    } catch {}

    if (/^[\[{]/.test(text.trim())) {
      try {
        addPackingScanJsonValues(candidates, seen, JSON.parse(text))
      } catch {}
    }

    const keyedPattern = /(?:order|tracking|waybill|logistics|package|shipping)[_\-\s]*(?:id|sn|no|number|code)?\s*[:=]\s*["']?([A-Za-z0-9._-]{6,50})/gi
    for (const match of text.matchAll(keyedPattern)) addPackingScanCandidate(candidates, seen, match[1])

    addPackingScanCandidate(candidates, seen, text)
    for (const match of text.matchAll(/[A-Za-z0-9][A-Za-z0-9._-]{5,49}/g)) {
      addPackingScanCandidate(candidates, seen, match[0])
    }
  }

  // QR của sàn thường là URL/JSON, còn mã vận đơn là Code128; gom ứng viên trước khi vào D1 để quét nhanh và không phụ thuộc format tem.
  return candidates.slice(0, 12)
}

function bytesHeadText(bytes, length = 2048) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return new TextDecoder().decode(view.slice(0, Math.min(length, view.byteLength || view.length)))
}

function isValidLabelObject(bytes, contentType = '', key = '') {
  const head = bytesHeadText(bytes)
  const type = cleanText(contentType).toLowerCase()
  const lowerKey = cleanText(key).toLowerCase()
  if (head.slice(0, 5) === '%PDF-') return { ok: true, kind: 'pdf', content_type: 'application/pdf' }
  const html = head.trim().toLowerCase()
  if (html.includes('<!doctype') || html.includes('<html') || html.includes('<body') || html.includes('<table')) {
    return { ok: true, kind: 'html', content_type: 'text/html; charset=utf-8' }
  }
  if (type.includes('pdf') || lowerKey.endsWith('.pdf')) return { ok: false, error: 'invalid_pdf_label' }
  if (type.includes('html') || lowerKey.endsWith('.html') || lowerKey.endsWith('.htm')) return { ok: false, error: 'invalid_html_label' }
  return { ok: false, error: 'invalid_label_file' }
}

async function ensurePackingVideosTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS packing_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      video_url TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_packing_videos_order ON packing_videos(order_id)`).run()
}

async function ensureOrderLabelsReadTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS order_labels (
      order_id TEXT PRIMARY KEY,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      storage_key TEXT NOT NULL,
      content_type TEXT DEFAULT '',
      source TEXT DEFAULT '',
      size_bytes INTEGER DEFAULT 0,
      refreshed_at TEXT DEFAULT (datetime('now', '+7 hours')),
      last_checked_at TEXT,
      error TEXT DEFAULT ''
    )
  `).run()
}

async function findOrderForPackingScan(env, code) {
  const scanCodes = collectPackingScanCodes(code)
  if (!scanCodes.length) return null
  const upperCodes = scanCodes.map(item => item.toUpperCase())
  const placeholders = upperCodes.map(() => '?').join(', ')
  return env.DB.prepare(`
    SELECT order_id, platform, shop, oms_status, shipping_status, tracking_number, shipping_carrier, oms_updated_at
    FROM orders_v2
    WHERE UPPER(TRIM(COALESCE(order_id, ''))) IN (${placeholders})
       OR UPPER(TRIM(COALESCE(tracking_number, ''))) IN (${placeholders})
    ORDER BY CASE
             WHEN UPPER(TRIM(COALESCE(order_id, ''))) = ? THEN 0
             WHEN UPPER(TRIM(COALESCE(tracking_number, ''))) = ? THEN 1
             ELSE 2
             END,
             datetime(COALESCE(NULLIF(oms_updated_at, ''), NULLIF(order_date, ''), '1970-01-01')) DESC
    LIMIT 1
  `).bind(...upperCodes, ...upperCodes, upperCodes[0], upperCodes[0]).first()
}

function numberForPacking(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

async function loadPackingOrderItems(env, orderId) {
  const id = cleanText(orderId)
  if (!id) {
    return { total_qty: 0, sku_count: 0, line_count: 0, items: [], speech_text: 'Chưa có dữ liệu sản phẩm.' }
  }

  const { results } = await env.DB.prepare(`
    SELECT DISTINCT sku, product_name, variation_name, qty, image_url
    FROM order_items
    WHERE order_id = ?
    ORDER BY id ASC
  `).bind(id).all().catch(() => ({ results: [] }))

  const items = (results || []).map(row => ({
    sku: cleanText(row.sku),
    product_name: cleanText(row.product_name),
    variation_name: cleanText(row.variation_name),
    qty: Math.max(numberForPacking(row.qty, 1), 0),
    image_url: cleanText(row.image_url)
  }))
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0)
  const uniqueKeys = new Set(items.map(item => cleanText(item.sku || item.variation_name || item.product_name)).filter(Boolean))
  const productNames = items
    .map(item => cleanText(item.product_name || item.variation_name || item.sku))
    .filter(Boolean)
    .slice(0, 3)

  // Trạm quay cần câu ngắn, đọc rõ số lượng để nhân viên đóng gói nghe ngay khi quét mã vận đơn.
  const speechText = totalQty > 0
    ? `Đơn này có ${totalQty} sản phẩm${uniqueKeys.size > 1 ? `, ${uniqueKeys.size} mã hàng` : ''}.`
    : 'Đơn này chưa có dữ liệu sản phẩm trong OMS.'

  return {
    total_qty: totalQty,
    sku_count: uniqueKeys.size,
    line_count: items.length,
    product_names: productNames,
    items: items.slice(0, 20),
    speech_text: speechText
  }
}

function isReturnRefundOrder(row = {}) {
  const text = [
    row.oms_status,
    row.shipping_status,
    row.order_type
  ].map(value => cleanText(value).toUpperCase()).join(' ')
  return text.includes('RETURN')
    || text.includes('REFUND')
    || text.includes('TO_RETURN')
    || text.includes('FAILED_DELIVERY')
}

async function labelStatusForPackingScan(env, orderId) {
  const id = cleanText(orderId)
  if (!id) return { has_label: false, valid: false, error: 'missing_order_id' }
  await ensureOrderLabelsReadTable(env)
  let label = null
  try {
    label = await env.DB.prepare(`SELECT * FROM order_labels WHERE order_id = ? LIMIT 1`).bind(id).first()
  } catch {}

  const candidates = [
    cleanText(label?.storage_key),
    `labels/${id}.pdf`,
    `labels/${id}.html`
  ].filter((value, index, arr) => value && arr.indexOf(value) === index)

  for (const key of candidates) {
    const object = await env.STORAGE.get(key)
    if (!object) continue
    const bytes = await object.arrayBuffer()
    const validation = isValidLabelObject(bytes, object.httpMetadata?.contentType, key)
    return {
      has_label: true,
      valid: validation.ok,
      storage_key: key,
      content_type: validation.content_type || object.httpMetadata?.contentType || '',
      error: validation.ok ? '' : validation.error
    }
  }

  return {
    has_label: false,
    valid: false,
    storage_key: cleanText(label?.storage_key),
    content_type: cleanText(label?.content_type),
    error: cleanText(label?.error) || 'not_found'
  }
}

async function handlePackingScanOrder(request, env, cors) {
  const url = new URL(request.url)
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
  const code = cleanText(body.code || body.scan_code || url.searchParams.get('code') || url.searchParams.get('scan_code'))
  const scanCandidates = collectPackingScanCodes(code)
  if (!code) return Response.json({ status: 'error', error: 'Thiếu mã đơn hoặc mã vận đơn.' }, { status: 400, headers: cors })

  await ensurePackingVideosTable(env)
  await ensureOrderLabelsReadTable(env)
  const order = await findOrderForPackingScan(env, code)
  const videoRows = await env.DB.prepare(`
    SELECT order_id, video_url, created_at
    FROM packing_videos
    WHERE order_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 5
  `).bind(order?.order_id || code).all().catch(() => ({ results: [] }))
  const videos = (videoRows.results || []).map(row => ({
    order_id: cleanText(row.order_id),
    video_url: cleanText(row.video_url),
    download_url: `/api/file/${encodeURIComponent(cleanText(row.video_url))}`,
    created_at: cleanText(row.created_at)
  }))
  const latestVideo = videos[0] || null
  const label = order ? await labelStatusForPackingScan(env, order.order_id) : { has_label: false, valid: false, error: 'order_not_found' }
  const itemSummary = order ? await loadPackingOrderItems(env, order.order_id) : { total_qty: 0, sku_count: 0, line_count: 0, items: [], speech_text: 'Không tìm thấy đơn trong OMS.' }
  const labelRequiredForPacking = cleanText(order?.platform).toLowerCase() === 'tiktok'
  const orderPayload = order ? {
    order_id: cleanText(order.order_id),
    platform: cleanText(order.platform),
    shop: cleanText(order.shop),
    oms_status: cleanText(order.oms_status),
    shipping_status: cleanText(order.shipping_status),
    tracking_number: cleanText(order.tracking_number),
    shipping_carrier: cleanText(order.shipping_carrier),
    is_return_refund: isReturnRefundOrder(order),
    total_qty: itemSummary.total_qty,
    sku_count: itemSummary.sku_count,
    item_count: itemSummary.line_count
  } : null
  const missing = []
  if (!latestVideo) missing.push('Chưa có video đóng gói để nộp khiếu nại.')
  if (!label.valid) missing.push('Tem tải về chưa hợp lệ hoặc chưa có trong kho R2.')
  // Gói bằng chứng này chỉ gom dữ liệu nội bộ để vận hành nộp khiếu nại, không tự gửi khiếu nại lên sàn.
  const evidence = {
    video_ready: !!latestVideo,
    label_ready: !!label.valid,
    label_required_for_packing: labelRequiredForPacking,
    can_mark_packed: !labelRequiredForPacking || !!label.valid,
    complaint_ready: !!latestVideo,
    complete_evidence: !!latestVideo && !!label.valid,
    videos,
    latest_video: latestVideo,
    label_url: label.valid && order ? `/api/label/${encodeURIComponent(order.order_id)}.pdf` : '',
    missing,
    advice: latestVideo
      ? (label.valid ? 'Đã có video đóng gói và tem hợp lệ để dùng khiếu nại.' : 'Đã có video đóng gói, cần kiểm tra hoặc tải lại tem nếu sàn yêu cầu.')
      : 'Đơn hoàn/trả chưa có video đóng gói, cần tìm video hoặc quay bổ sung trước khi khiếu nại.'
  }
  return Response.json({
    status: 'ok',
    found: !!order,
    code,
    scan_code: scanCandidates[0] || code,
    scan_candidates: scanCandidates,
    order: orderPayload,
    item_summary: itemSummary,
    speech_text: itemSummary.speech_text,
    label,
    videos,
    latest_video: latestVideo,
    evidence,
    advice: order
      ? (orderPayload.is_return_refund ? evidence.advice : (label.valid ? 'Tem hợp lệ, có thể đóng gói và quay video.' : (labelRequiredForPacking ? 'TikTok chưa có tem đã lưu. Cần tải lại tem trước khi chuyển sang Đã đóng gói.' : 'Chưa có tem hợp lệ. Cần tải/in lại tem trước khi đóng gói.')))
      : 'Không tìm thấy đơn trong OMS. Vẫn có thể lưu video làm bằng chứng, nhưng cần đồng bộ/import đơn trước khi chốt kho.'
  }, { headers: cors })
}

export default {
  // ── Tự động chạy mỗi 24h (Cron Trigger) ─────────────────
  async scheduled(event, env, ctx) {
    try {
      if (event.cron === "0 0 * * *") {
        // 1. Lấy dữ liệu từ các bảng cốt lõi (bạn có thể thêm orders, products nếu cần)
        const { results: users } = await env.DB.prepare("SELECT * FROM users").all()
        const { results: shops } = await env.DB.prepare("SELECT * FROM shops").all()
        const { results: jobs } = await env.DB.prepare("SELECT * FROM jobs").all()

        // 2. Đóng gói dữ liệu
        const backupData = JSON.stringify({
          timestamp: new Date().toISOString(),
          users,
          shops,
          jobs
        })

        // 3. Đặt tên file theo ngày và lưu vào R2
        const dateStr = new Date().toISOString().split('T')[0]
        const fileName = `backups/db-backup-${dateStr}.json`

        await env.STORAGE.put(fileName, backupData)
        console.log(`[CRON] Backup thành công: ${fileName}`)
      }
      const refreshed = await autoRefreshShopeeTokens(env)
      console.log(`[CRON] Tự động làm mới ${refreshed} token Shopee`)
      if (event.cron === "*/5 * * * *" || event.cron === "*/30 * * * *") {
        const minute = new Date(event.scheduledTime || Date.now()).getUTCMinutes()
        const realtimePlatforms = ['shopee', 'lazada']
        const platform = realtimePlatforms[Math.floor(minute / 5) % realtimePlatforms.length]
        // NEO: Cron realtime chỉ chạy một sàn mỗi lượt để không vượt quota subrequest; TikTok chưa có shop API nên không đưa vào polling API.
        const imported = await syncApiOrders(env, {}, {
          platform,
          days: platform === 'lazada' ? 30 : 7,
          limit: platform === 'lazada' ? 4 : 20,
          offset: 0,
          fetch_fees: '0',
          fetch_tracking: platform === 'shopee' ? '0' : '',
          statuses: 'PENDING,READY_TO_SHIP,PROCESSED,SHIPPED,COMPLETED,CANCELLED,IN_CANCEL'
        })
        console.log(`[CRON] Kéo đơn API ${platform}/all-shops: fetched=${imported.fetched}, imported=${imported.imported_orders}, status=${imported.status}`)
        const synced = await syncApiOrderStatuses(env, {
          platform,
          limit: platform === 'lazada' ? 4 : 30,
          offset: 0,
          days: 30
        })
        console.log(`[CRON] Đồng bộ trạng thái ${platform}/all-shops: checked=${synced.checked}, updated=${synced.updated}, status=${synced.status}`)
        if (minute % 30 === 0) {
          const ads = await syncAdsCampaignSnapshots(env, {
            days: 7,
            limit: 80
          })
          console.log(`[CRON] Keo campaign ADS: fetched=${ads.fetched_campaigns}, saved=${ads.saved}, warnings=${ads.warnings?.length || 0}`)
        }
        const promotionTasks = [
          'shopee_vouchers',
          'shopee_bundle',
          'shopee_add_on',
          'shopee_flash',
          'lazada_vouchers',
          'lazada_free_shipping',
          'lazada_flexicombo'
        ]
        const promotionTask = promotionTasks[Math.floor(minute / 5) % promotionTasks.length]
        const promotionPlatform = promotionTask.startsWith('lazada') ? 'lazada' : 'shopee'
        const promotionShops = await getApiShops(env, promotionPlatform)
        const promotionShop = promotionShops.length
          ? promotionShops[Math.floor(minute / 5) % promotionShops.length].shop_name
          : ''
        if (promotionShop) {
          // Cron chỉ chạy một lát cắt nhỏ mỗi lượt để cache promotion sâu dần mà không vượt quota subrequest.
          const promo = await runPromotionDeepCacheBatch(env, {
            task: promotionTask,
            shop: promotionShop,
            max_jobs: 1,
            shop_limit: 1
          })
          console.log(`[CRON] Promotion ${promotionTask}/${promotionShop}: jobs=${promo.selected_jobs}, available=${promo.available_jobs}`)
        }
        // Hàng đợi push chạy một việc nhỏ mỗi lát cắt để retry event lỗi mà không làm webhook bị chậm hoặc vượt quota Worker.
        const pushQueue = await runMarketplacePushSyncQueueBatch(env, {}, {
          max_jobs: 1,
          include_failed: false
        })
        if (pushQueue.selected_jobs) {
          console.log(`[CRON] Push queue incremental: jobs=${pushQueue.selected_jobs}, done=${pushQueue.done}, failed=${pushQueue.failed}`)
        }
        const chatAutoReply = await runChatAiAutoReplyBatch(env, {
          limit: 3
        })
        if (chatAutoReply.processed) {
          console.log(`[CRON] Chat AI auto-reply: mode=${chatAutoReply.mode}, processed=${chatAutoReply.processed}`)
        }
        // Hàng đợi video chỉ chạy job đã đến giờ, mỗi lát cắt tối đa một video để tránh đăng nhầm hàng loạt khi Shopee trả lỗi.
        const videoQueue = await runVideoUploadQueueBatch(env, {
          max_jobs: 1
        })
        if (videoQueue.selected_jobs) {
          console.log(`[CRON] Video upload queue: jobs=${videoQueue.selected_jobs}, done=${videoQueue.done}, failed=${videoQueue.failed}`)
        }
      }
      if (event.cron === "0 0 * * *") {
        const ads = await syncAdsCampaignSnapshots(env, {
          days: 30,
          limit: 150
        })
        console.log(`[CRON] Snapshot campaign ADS 30 ngay: fetched=${ads.fetched_campaigns}, saved=${ads.saved}, warnings=${ads.warnings?.length || 0}`)
        const returns = await syncShopeeReturns(env, {
          hours: 24,
          page_size: 100,
          max_pages: 10,
          include_detail: true
        })
        console.log(`[CRON] Returns Shopee 24h: fetched=${returns.fetched_returns}, saved=${returns.saved}, closed=${returns.closed_returns}, refund=${returns.refund_amount}`)
        const lazadaReverse = await syncLazadaReverseOrders(env, {
          days: 30,
          page_size: 80,
          max_pages: 4
        })
        console.log(`[CRON] Reverse Lazada 30 ngay: fetched=${lazadaReverse.fetched_returns}, ledger=${lazadaReverse.ledger_saved}, warnings=${lazadaReverse.warnings?.length || 0}`)
        const topPicks = await syncShopeeTopPicks(env, {
          shopLimit: 100
        })
        console.log(`[CRON] TopPicks Shopee: collections=${topPicks.total_collections}, active=${topPicks.active_collections}, saved=${topPicks.saved_collections}`)
        const discounts = await syncShopeeDiscounts(env, {
          discount_status: 'ongoing',
          include_detail: 1,
          shopLimit: 100
        })
        console.log(`[CRON] Discount Shopee: discounts=${discounts.total_discounts}, items=${discounts.total_items}, saved=${discounts.saved_discounts}`)
        const analytics = await rebuildOrderAnalytics(env, {
          days: 30,
          sync_payment: true,
          income_statuses: ['1', '2'],
          page_size: 30,
          shopLimit: 100
        })
        console.log(`[CRON] Order analytics 30 ngay: orders=${analytics.orders}, saved=${analytics.saved}, payment=${analytics.payment_sync?.saved || 0}`)
      }
    } catch (error) {
      console.error("[CRON] Lỗi khi backup D1:", error)
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopee-Signature, X-Lazada-Signature"
    }

    if (request.method === "OPTIONS")
      return new Response("", { headers: cors })

    if (url.pathname === "/favicon.ico")
      return new Response("", { status: 204 })

    if (url.pathname === "/")
      return new Response("ShopHuyVan Profit API v2")

    if (url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/")) {
      return handleAdminAuth(request, env, url, cors)
    }

    // ── Cổng VIP: Xử lý Ủy Quyền Shopee/Lazada ─────────────────
    if (url.pathname.startsWith("/api/auth/") || url.pathname.includes("/callback")) {
      return handleAuth(request, env, url)
    }

    const reviewerBlocked = await blockReviewerWriteAccess(request, env, url, cors)
    if (reviewerBlocked) return reviewerBlocked

    try {
	// ── Purchase Orders (Nhập hàng Chính ngạch) ───────────────────
      const workerRouteHandlers = [
        handlePrimaryWorkerRoutes,
        handleAutomationWorkerRoutes,
        handleDashboardWorkerRoutes,
        handleOrderWorkerRoutes,
        handleFileWorkerRoutes
      ]
      for (const workerRouteHandler of workerRouteHandlers) {
        const routeResponse = await workerRouteHandler(request, env, ctx, cors, url, WORKER_ROUTE_DEPS)
        if (routeResponse) return routeResponse
      }
      return new Response("Not found", { status: 404, headers: cors })

    } catch (e) {
      return new Response(e.toString(), { status: 500, headers: cors })
    }
  }
}

