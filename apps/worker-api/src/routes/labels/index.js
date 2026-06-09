import { getShopeeAppFromRow, signHmacHex } from '../../utils/shopee-apps.js'
import { buildOrderLabelState } from '../../core/orders/read-core.js'
import { listMarketplaceShopCapabilities } from '../../core/marketplace/shop-capability-core.js'

const LABEL_BACKFILL_DEFAULT_LIMIT = 8
const LABEL_BACKFILL_MAX_LIMIT = 50
const LABEL_BACKFILL_MAX_SUBREQUESTS = 32
const LABEL_SUBREQUEST_COST = {
  shopee: 8,
  lazada: 5,
  tiktok: 1
}
const SHOPEE_LABEL_ENDPOINTS = Object.freeze({
  orderDetail: '/api/v2/order/get_order_detail',
  documentParameter: '/api/v2/logistics/get_shipping_document_parameter',
  createDocument: '/api/v2/logistics/create_shipping_document',
  documentResult: '/api/v2/logistics/get_shipping_document_result',
  downloadDocument: '/api/v2/logistics/download_shipping_document'
})

export const SHOPEE_LABEL_DOCUMENT_GENERATION_FLOW = Object.freeze([
  SHOPEE_LABEL_ENDPOINTS.documentParameter,
  SHOPEE_LABEL_ENDPOINTS.createDocument,
  SHOPEE_LABEL_ENDPOINTS.documentResult,
  SHOPEE_LABEL_ENDPOINTS.downloadDocument
])

class LabelFlowError extends Error {
  constructor(code, publicMessage, technicalMessage = '', options = {}) {
    super(technicalMessage || publicMessage || code)
    this.name = 'LabelFlowError'
    this.code = code
    this.publicMessage = publicMessage || code
    this.technicalMessage = technicalMessage || publicMessage || code
    this.httpStatus = options.httpStatus || 500
    this.retryMinutes = options.retryMinutes || 0
  }
}

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function uniqueTexts(values = []) {
  return [...new Set(values.map(cleanText).filter(Boolean))]
}

function readArrayParam(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)
  return cleanText(value).split(',').map(cleanText).filter(Boolean)
}

function boolParam(value) {
  if (value === true) return true
  return ['1', 'true', 'yes', 'on'].includes(cleanText(value).toLowerCase())
}

function normalizeDateParam(value) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

async function ensureLabelRunnerJobsTable(env) {
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

function isLocalChromeRetryLabel(platform, shop, labelCapability = {}) {
  const key = cleanText(shop).toLowerCase()
  const mode = cleanText(labelCapability.label_download_mode).toLowerCase()
  return mode === 'local_chrome_retry_label'
    || (platform === 'tiktok' && key === '0909128999')
    || (platform === 'shopee' && key === 'khogiadungcona')
}

async function queueLocalLabelRetryJob(env, row, options = {}) {
  await ensureLabelRunnerJobsTable(env)
  const now = new Date()
  const platform = cleanText(row.platform).toLowerCase()
  const shop = cleanText(row.shop)
  const actionType = 'retry_label'
  const payload = {
    task_type: actionType,
    action_type: actionType,
    trigger: cleanText(options.trigger || 'label_retry_failed'),
    scope: ['label_pdf', 'label_status'],
    order_ids: [cleanText(row.order_id)].filter(Boolean),
    platform,
    shop,
    source: 'label_retry_route'
  }
  const result = await env.DB.prepare(`
    INSERT INTO jobs (user_id, shop_name, platform, month, year, status, scheduled_at, task_type, from_date, to_date, payload)
    VALUES ('admin', ?, ?, ?, ?, 'queued', NULL, ?, ?, ?, ?)
  `).bind(
    shop,
    platform,
    now.getMonth() + 1,
    now.getFullYear(),
    actionType,
    options.from || '',
    options.to || '',
    JSON.stringify(payload)
  ).run()
  const id = result?.meta?.last_row_id || result?.lastRowId || null
  return id ? { id, platform, shop, task_type: actionType, action_type: actionType } : null
}

function normalizeLabelStatusFilter(values = []) {
  const mapped = values.map(value => {
    const status = cleanText(value).toLowerCase()
    if (status === 'loi' || status === 'lỗi') return 'error'
    if (status === 'cho_thu_lai' || status === 'chờ thử lại') return 'pending_retry'
    if (status === 'co_the_tai' || status === 'có thể tải') return 'eligible'
    if (status === 'chua_tai' || status === 'chưa tải') return 'missing'
    if (status === 'da_tai' || status === 'đã tải') return 'downloaded'
    return status
  }).filter(Boolean)
  return [...new Set(mapped)]
}

function matchesLabelStatusFilter(status, filters = []) {
  const normalized = cleanText(status).toLowerCase()
  if (!filters.length) return true
  if (filters.includes(normalized)) return true
  if (filters.includes('pending_retry') && ['pending_document_generation', 'shopee_pdf_not_ready', 'lazada_batch_requeued'].includes(normalized)) return true
  if (filters.includes('error') && normalized === 'pending_retry') return true
  if (filters.includes('missing') && ['eligible', 'not_ready'].includes(normalized)) return true
  return false
}

function isRetryableLabelStatus(status) {
  return [
    'error',
    'pending_retry',
    'pending_document_generation',
    'shopee_pdf_not_ready',
    'lazada_batch_requeued'
  ].includes(cleanText(status).toLowerCase())
}

function buildRetryableLabelState(row, labelCapability) {
  return buildOrderLabelState({
    ...row,
    ...labelCapability,
    label_file_path: '',
    shipping_label_url: '',
    last_label_error: ''
  })
}

function contentTypeForKey(key) {
  const lower = cleanText(key).toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  return 'application/octet-stream'
}

function bytesHeadText(bytes, length = 2048) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return new TextDecoder().decode(view.slice(0, Math.min(length, view.byteLength || view.length)))
}

function bytesStartWithPdf(bytes) {
  return bytesHeadText(bytes, 5) === '%PDF-'
}

function looksLikeHtml(text) {
  const sample = String(text || '').trim().slice(0, 4096).toLowerCase()
  return sample.includes('<!doctype')
    || sample.includes('<html')
    || sample.includes('<body')
    || sample.includes('<table')
    || sample.includes('<div')
    || sample.includes('<style')
}

function looksLikeMaskedLazadaFile(text) {
  return /^P\*{20,}/.test(String(text || '').trim())
}

function validateLabelBytes(bytes, contentType = '', key = '', options = {}) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const text = bytesHeadText(view)
  if (bytesStartWithPdf(view)) return { ok: true, contentType: 'application/pdf' }
  // Shopee/API label Core chỉ nhận PDF. HTML cũ trong R2 phải bị đánh lỗi để retry tải lại tem thật.
  if (looksLikeHtml(text)) {
    return options.allowHtml
      ? { ok: true, contentType: 'text/html; charset=utf-8' }
      : { ok: false, error: 'invalid_html_label' }
  }
  if (looksLikeMaskedLazadaFile(text)) {
    return { ok: false, error: 'lazada_masked_document' }
  }
  const lowerType = cleanText(contentType).toLowerCase()
  const lowerKey = cleanText(key).toLowerCase()
  if (lowerType.includes('html') || lowerKey.endsWith('.html') || lowerKey.endsWith('.htm')) {
    return { ok: false, error: 'invalid_html_label' }
  }
  if (lowerType.includes('pdf') || lowerKey.endsWith('.pdf')) {
    return { ok: false, error: 'invalid_pdf_label' }
  }
  return { ok: false, error: 'invalid_label_file' }
}

function decodeBase64Bytes(value) {
  const raw = String(value || '').trim()
  const base64 = raw
    .replace(/^data:[^,]+,/i, '')
    .replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length < 32) return null
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function inferOrderIdFromLabelKey(key) {
  const name = cleanText(key).replace(/^labels\//i, '')
  return name.replace(/\.(pdf|html?)$/i, '')
}

function localRefreshRequest(orderId, body = {}) {
  return new Request(`https://worker.local/api/label/${encodeURIComponent(orderId)}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function responseJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function ensureOrderLabelsTable(env) {
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

async function getOrderRow(env, orderId) {
  return env.DB.prepare(`
    SELECT order_id, platform, shop, order_type, oms_status, shipping_status, shipping_carrier, tracking_number
    FROM orders_v2
    WHERE order_id = ?
    LIMIT 1
  `).bind(orderId).first()
}

async function findApiShop(env, platform, orderShop) {
  const shop = cleanText(orderShop)
  const rows = await env.DB.prepare(`
    SELECT id, shop_name, user_name, platform, api_shop_id, api_partner_id, api_partner_key,
           api_redirect_url, access_token, refresh_token
    FROM shops
    WHERE platform = ?
      AND access_token IS NOT NULL AND access_token != ''
      AND (
        shop_name = ?
        OR user_name = ?
        OR api_shop_id = ?
        OR ? = ''
      )
    ORDER BY CASE WHEN shop_name = ? OR user_name = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).bind(platform, shop, shop, shop, shop, shop, shop).all()
  return rows.results?.[0] || null
}

function labelCapabilityFallback(platform, message = '') {
  const key = cleanText(platform).toLowerCase()
  if (['shopee', 'lazada', 'tiktok'].includes(key)) {
    return {
      label_download_mode: 'manual_required',
      label_download_supported: false,
      label_download_source: key === 'tiktok' ? 'tiktok_no_official_label_api_in_core' : `${key}_manual_or_browser`,
      label_download_reason: message || 'Shop/sàn chưa có capability tải tem read-only đã xác minh.',
      label_download_read_only: false,
      label_download_requires_manual: true
    }
  }
  return {
    label_download_mode: 'not_supported',
    label_download_supported: false,
    label_download_source: 'unsupported_platform',
    label_download_reason: message || 'Sàn/shop này chưa hỗ trợ tải tem trong OMS.',
    label_download_read_only: false,
    label_download_requires_manual: false
  }
}

function labelShopMatch(row = {}, platform = '', shop = '') {
  const platformKey = cleanText(platform).toLowerCase()
  const shopKey = cleanText(shop).toLowerCase()
  if (!platformKey || !shopKey) return false
  if (cleanText(row.platform).toLowerCase() !== platformKey) return false
  return [row.shop_name, row.user_name, row.api_shop_id, row.id]
    .map(value => cleanText(value).toLowerCase())
    .filter(Boolean)
    .includes(shopKey)
}

function capabilityFields(row = {}) {
  return {
    label_download_mode: cleanText(row.label_download_mode || 'not_supported'),
    label_download_supported: row.label_download_supported === true || row.label_download_supported === 1 || row.label_download_supported === '1',
    label_download_source: cleanText(row.label_download_source),
    label_download_reason: cleanText(row.label_download_reason),
    label_download_read_only: row.label_download_read_only === true || row.label_download_read_only === 1 || row.label_download_read_only === '1',
    label_download_requires_manual: row.label_download_requires_manual === true || row.label_download_requires_manual === 1 || row.label_download_requires_manual === '1',
    label_document_generation_supported: row.label_document_generation_supported === true || row.label_document_generation_supported === 1 || row.label_document_generation_supported === '1',
    label_fulfillment_action_allowed: row.label_fulfillment_action_allowed === true || row.label_fulfillment_action_allowed === 1 || row.label_fulfillment_action_allowed === '1'
  }
}

function labelRefreshModeFromCapability(capability, platform = '') {
  const key = cleanText(platform).toLowerCase()
  if (capability.label_download_supported && capability.label_download_read_only && ['shopee', 'lazada'].includes(key)) return 'api'
  if (capability.label_download_requires_manual) return 'manual'
  return 'unsupported'
}

async function findLabelCapability(env, platform, shopName, rows = null) {
  const platformKey = cleanText(platform).toLowerCase()
  const shop = cleanText(shopName)
  if (!platformKey) return labelCapabilityFallback(platformKey)
  try {
    const capabilities = rows || await listMarketplaceShopCapabilities(env, {
      platform: platformKey,
      shop,
      limit: 50
    })
    const exact = (capabilities || []).find(row => labelShopMatch(row, platformKey, shop))
    const candidate = exact || (capabilities || []).find(row => cleanText(row.platform).toLowerCase() === platformKey)
    if (candidate) return capabilityFields(candidate)
  } catch (error) {
    return labelCapabilityFallback(platformKey, `Không đọc được marketplace_shop_capability_core: ${error.message || error}`)
  }
  return labelCapabilityFallback(platformKey)
}

function findLabelCapabilityFromRows(platform, shopName, rows = []) {
  const platformKey = cleanText(platform).toLowerCase()
  const shop = cleanText(shopName)
  const exact = (rows || []).find(row => labelShopMatch(row, platformKey, shop))
  const candidate = exact || (rows || []).find(row => cleanText(row.platform).toLowerCase() === platformKey)
  return candidate ? capabilityFields(candidate) : labelCapabilityFallback(platformKey)
}

export async function recordLabelFile(env, details) {
  const storageKey = cleanText(details.storageKey || details.storage_key)
  if (!storageKey.toLowerCase().startsWith('labels/')) return null
  const orderId = cleanText(details.orderId || inferOrderIdFromLabelKey(storageKey))
  if (!orderId) return null

  await ensureOrderLabelsTable(env)
  const order = await getOrderRow(env, orderId)
  const contentType = cleanText(details.contentType || details.content_type || contentTypeForKey(storageKey))
  const source = cleanText(details.source || 'upload')
  const sizeBytes = Number(details.sizeBytes || details.size_bytes || 0) || 0
  const error = cleanText(details.error || '')

  await env.DB.prepare(`
    INSERT INTO order_labels
      (order_id, platform, shop, storage_key, content_type, source, size_bytes, refreshed_at, last_checked_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'), ?)
    ON CONFLICT(order_id) DO UPDATE SET
      platform = COALESCE(NULLIF(excluded.platform, ''), order_labels.platform),
      shop = COALESCE(NULLIF(excluded.shop, ''), order_labels.shop),
      storage_key = excluded.storage_key,
      content_type = excluded.content_type,
      source = excluded.source,
      size_bytes = excluded.size_bytes,
      refreshed_at = datetime('now', '+7 hours'),
      last_checked_at = datetime('now', '+7 hours'),
      error = excluded.error
  `).bind(
    orderId,
    cleanText(details.platform || order?.platform),
    cleanText(details.shop || order?.shop),
    storageKey,
    contentType,
    source,
    sizeBytes,
    error
  ).run()

  return { order_id: orderId, storage_key: storageKey, content_type: contentType, source }
}

async function putLabel(env, orderId, bytes, storageKey, contentType, source) {
  const body = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes
  await env.STORAGE.put(storageKey, body, { httpMetadata: { contentType } })
  await recordLabelFile(env, {
    orderId,
    storageKey,
    contentType,
    source,
    sizeBytes: body.byteLength || bytes.byteLength || bytes.length || 0
  })
  return { order_id: orderId, storage_key: storageKey, content_type: contentType }
}

function classifyLabelRefreshError(error, platform = '') {
  const technical = cleanText(error?.technicalMessage || error?.message || error)
  const lower = technical.toLowerCase()
  if (error instanceof LabelFlowError) {
    return {
      code: error.code,
      publicMessage: error.publicMessage,
      technicalError: error.technicalMessage,
      httpStatus: error.httpStatus,
      retryMinutes: error.retryMinutes
    }
  }
  if (lower.includes('too many subrequests') || lower.includes('single worker invocation') || lower.includes('subrequest')) {
    return {
      code: platform === 'lazada' ? 'lazada_batch_requeued' : 'pending_retry',
      publicMessage: 'Batch tải tem quá lớn, hệ thống sẽ tự chia nhỏ và thử lại.',
      technicalError: technical,
      httpStatus: 202,
      retryMinutes: 10
    }
  }
  if (lower.includes('package should print first') || lower.includes('shipping_document_should_print_first')) {
    return {
      code: 'pending_document_generation',
      publicMessage: 'Chưa có file tem, hệ thống đang tạo chứng từ in và sẽ thử lại.',
      technicalError: technical,
      httpStatus: 202,
      retryMinutes: 10
    }
  }
  return {
    code: 'label_download_error',
    publicMessage: platform === 'lazada' ? 'Không tải được tem Lazada, xem chi tiết kỹ thuật.' : 'Không tải được tem, xem chi tiết kỹ thuật.',
    technicalError: technical,
    httpStatus: 500,
    retryMinutes: 15
  }
}

async function updateOrderLabelRetry(env, orderId, minutes = 10) {
  try {
    await env.DB.prepare(`
      UPDATE orders_v2
      SET next_retry_at = datetime('now', '+7 hours', ?)
      WHERE order_id = ?
    `).bind(`+${Math.max(Number(minutes || 10) || 10, 1)} minutes`, orderId).run()
  } catch {}
}

async function markLabelRetry(env, order = {}, normalized = {}) {
  const platform = cleanText(order.platform).toLowerCase()
  const orderId = cleanText(order.order_id)
  await recordLabelFile(env, {
    orderId,
    platform,
    shop: order.shop,
    storageKey: `labels/${orderId}.${platform === 'lazada' ? 'html' : 'pdf'}`,
    source: `api-retry:${normalized.code || 'pending_retry'}`,
    error: normalized.code || 'pending_retry'
  })
  await updateOrderLabelRetry(env, orderId, normalized.retryMinutes || 10)
}

async function lookupExistingLabel(env, orderId, preferredExt = 'pdf', options = {}) {
  const candidates = preferredExt === 'html'
    ? [`labels/${orderId}.html`, `labels/${orderId}.pdf`]
    : [`labels/${orderId}.pdf`, `labels/${orderId}.html`]

  for (const candidate of candidates) {
    const object = await env.STORAGE.get(candidate)
    if (object) {
      const contentType = object.httpMetadata?.contentType || contentTypeForKey(candidate)
      const bytes = await object.arrayBuffer()
      const validation = validateLabelBytes(bytes, contentType, candidate, options)
      if (!validation.ok) {
        await recordLabelFile(env, {
          orderId,
          storageKey: candidate,
          contentType,
          source: 'r2-check',
          sizeBytes: bytes.byteLength || 0,
          error: validation.error
        }).catch(() => null)
        continue
      }
      await recordLabelFile(env, {
        orderId,
        storageKey: candidate,
        contentType: validation.contentType || contentType,
        source: 'r2-check',
        sizeBytes: bytes.byteLength || 0
      })
      return { bytes, storageKey: candidate, contentType: validation.contentType || contentType }
    }
  }

  return null
}

export async function getOrderLabel(request, env, cors) {
  const url = new URL(request.url)
  const rawName = decodeURIComponent(url.pathname.replace('/api/label/', ''))
  const orderId = rawName.replace(/\.(pdf|html?)$/i, '')
  const preferredExt = rawName.toLowerCase().endsWith('.html') ? 'html' : 'pdf'
  const found = await lookupExistingLabel(env, orderId, preferredExt, { allowHtml: preferredExt === 'html' })

  if (!found) {
    await recordLabelFile(env, {
      orderId,
      storageKey: `labels/${orderId}.${preferredExt}`,
      contentType: contentTypeForKey(`labels/${orderId}.${preferredExt}`),
      source: 'view',
      error: 'not_found'
    }).catch(() => null)
    return new Response("<h2 style='font-family:sans-serif; text-align:center; color:#ef4444; margin-top:50px;'>Phieu in chua duoc tai len hoac don hang chua duoc xu ly.</h2>", {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors }
    })
  }

  const headers = new Headers(cors)
  const isHtml = found.storageKey.toLowerCase().endsWith('.html')
  headers.set('Content-Type', found.contentType || (isHtml ? 'text/html; charset=utf-8' : 'application/pdf'))
  headers.set('Content-Disposition', `inline; filename="${orderId}.${isHtml ? 'html' : 'pdf'}"`)
  return new Response(found.bytes, { headers })
}

export async function getLabelStatus(request, env, cors) {
  const url = new URL(request.url)
  const orderId = cleanText(url.searchParams.get('order_id') || url.searchParams.get('orderId'))
  await ensureOrderLabelsTable(env)

  if (orderId) {
    const label = await env.DB.prepare(`SELECT * FROM order_labels WHERE order_id = ?`).bind(orderId).first()
    const order = await getOrderRow(env, orderId)
    const platform = cleanText(label?.platform || order?.platform).toLowerCase()
    const shopName = cleanText(label?.shop || order?.shop)
    const labelCapability = await findLabelCapability(env, platform, shopName)
    const refreshMode = labelRefreshModeFromCapability(labelCapability, platform)
    const preferredExt = cleanText(url.searchParams.get('type')).toLowerCase() === 'html' ? 'html' : 'pdf'
    const found = await lookupExistingLabel(env, orderId, preferredExt, { allowHtml: platform === 'lazada' || preferredExt === 'html' })
    const labelState = buildOrderLabelState({
      ...(order || {}),
      order_id: orderId,
      platform,
      shop: shopName,
      label_file_path: found?.storageKey || label?.storage_key || '',
      last_label_download_at: label?.refreshed_at || '',
      last_label_error: found ? '' : (label?.error || 'not_found'),
      label_api_connected: refreshMode === 'api' ? 1 : 0,
      label_refresh_mode: refreshMode,
      ...labelCapability
    })
    return json({
      order_id: orderId,
      has_label: !!found,
      storage_key: found?.storageKey || label?.storage_key || '',
      content_type: found?.contentType || label?.content_type || '',
      platform,
      shop: shopName,
      api_connected: refreshMode === 'api',
      refresh_mode: refreshMode,
      label_eligible: labelState.label_eligible,
      label_status: labelState.label_status,
      label_reason: labelState.label_reason,
      label_download_mode: labelState.label_download_mode,
      label_download_supported: labelState.label_download_supported,
      label_download_source: labelState.label_download_source,
      label_download_reason: labelState.label_download_reason,
      label_download_read_only: labelState.label_download_read_only,
      label_download_requires_manual: labelState.label_download_requires_manual,
      shipping_label_url: labelState.shipping_label_url,
      label_file_path: labelState.label_file_path,
      last_label_download_at: labelState.last_label_download_at,
      last_label_error: labelState.last_label_error,
      refreshed_at: label?.refreshed_at || '',
      error: found ? '' : (label?.error || 'not_found')
    }, cors)
  }

  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 250)
  const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0)
  const status = cleanText(url.searchParams.get('status')).toLowerCase()
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  const q = cleanText(url.searchParams.get('q') || url.searchParams.get('search')).toLowerCase()
  const where = []
  const binds = []

  if (status === 'ok' || status === 'saved') where.push(`COALESCE(ol.error, '') = '' AND COALESCE(ol.storage_key, '') != ''`)
  if (status === 'error' || status === 'failed') where.push(`COALESCE(ol.error, '') != ''`)
  if (platform) {
    where.push(`LOWER(COALESCE(NULLIF(ol.platform, ''), o.platform, '')) = ?`)
    binds.push(platform)
  }
  if (q) {
    where.push(`(
      LOWER(COALESCE(ol.order_id, '')) LIKE ?
      OR LOWER(COALESCE(NULLIF(ol.shop, ''), o.shop, '')) LIKE ?
      OR LOWER(COALESCE(ol.storage_key, '')) LIKE ?
      OR LOWER(COALESCE(ol.error, '')) LIKE ?
    )`)
    const like = `%${q}%`
    binds.push(like, like, like, like)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // UI kho tem cần thống kê toàn kho và danh sách có lọc, nhưng không đọc R2 từng dòng để tránh vượt giới hạn Worker.
  const [summary, platforms, rows] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_labels,
        SUM(CASE WHEN COALESCE(error, '') = '' AND COALESCE(storage_key, '') != '' THEN 1 ELSE 0 END) AS ok_labels,
        SUM(CASE WHEN COALESCE(error, '') != '' THEN 1 ELSE 0 END) AS error_labels,
        MAX(refreshed_at) AS latest_refreshed
      FROM order_labels
    `).first(),
    env.DB.prepare(`
      SELECT platform,
             COUNT(*) AS total,
             SUM(CASE WHEN COALESCE(error, '') = '' AND COALESCE(storage_key, '') != '' THEN 1 ELSE 0 END) AS ok_labels,
             SUM(CASE WHEN COALESCE(error, '') != '' THEN 1 ELSE 0 END) AS error_labels
      FROM order_labels
      GROUP BY platform
      ORDER BY total DESC
    `).all(),
    env.DB.prepare(`
      SELECT
             ol.order_id,
             COALESCE(NULLIF(ol.platform, ''), o.platform, '') AS platform,
             COALESCE(NULLIF(ol.shop, ''), o.shop, '') AS shop,
             ol.storage_key, ol.content_type, ol.source, ol.size_bytes,
             ol.refreshed_at, ol.last_checked_at, ol.error,
             CASE WHEN COALESCE(ol.error, '') != '' THEN 'error'
                  WHEN COALESCE(ol.storage_key, '') != '' THEN 'downloaded'
                  ELSE 'not_ready' END AS label_status
             ,
             CASE WHEN EXISTS (
               SELECT 1
               FROM shops s
               WHERE LOWER(COALESCE(s.platform, '')) = LOWER(COALESCE(NULLIF(ol.platform, ''), o.platform, ''))
                 AND COALESCE(s.access_token, '') != ''
                 AND (
                   s.shop_name = COALESCE(NULLIF(ol.shop, ''), o.shop, '')
                   OR s.user_name = COALESCE(NULLIF(ol.shop, ''), o.shop, '')
                   OR CAST(s.api_shop_id AS TEXT) = COALESCE(NULLIF(ol.shop, ''), o.shop, '')
                 )
               LIMIT 1
             ) THEN 1 ELSE 0 END AS api_connected,
             CASE
               WHEN LOWER(COALESCE(NULLIF(ol.platform, ''), o.platform, '')) IN ('shopee', 'lazada')
                    AND EXISTS (
                      SELECT 1
                      FROM shops s
                      WHERE LOWER(COALESCE(s.platform, '')) = LOWER(COALESCE(NULLIF(ol.platform, ''), o.platform, ''))
                        AND COALESCE(s.access_token, '') != ''
                        AND (
                          s.shop_name = COALESCE(NULLIF(ol.shop, ''), o.shop, '')
                          OR s.user_name = COALESCE(NULLIF(ol.shop, ''), o.shop, '')
                          OR CAST(s.api_shop_id AS TEXT) = COALESCE(NULLIF(ol.shop, ''), o.shop, '')
                        )
                      LIMIT 1
                    )
                 THEN 'api'
               WHEN LOWER(COALESCE(NULLIF(ol.platform, ''), o.platform, '')) IN ('shopee', 'lazada', 'tiktok') THEN 'browser'
               ELSE 'manual'
             END AS refresh_mode
      FROM order_labels ol
      LEFT JOIN orders_v2 o ON o.order_id = ol.order_id
      ${whereSql}
      ORDER BY datetime(ol.refreshed_at) DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all()
  ])

  const capabilityRows = await listMarketplaceShopCapabilities(env, {
    platform: platform || '',
    limit: 500
  }).catch(() => [])
  const labelRows = (rows.results || []).map(row => {
    const rowPlatform = cleanText(row.platform).toLowerCase()
    const rowCapability = findLabelCapabilityFromRows(rowPlatform, row.shop, capabilityRows)
    const refreshMode = labelRefreshModeFromCapability(rowCapability, rowPlatform)
    return {
      ...row,
      api_connected: refreshMode === 'api' ? 1 : 0,
      refresh_mode: refreshMode,
      ...rowCapability
    }
  })

  return json({
    summary: {
      ...summary,
      platforms: platforms.results || []
    },
    labels: labelRows,
    filters: { status, platform, q, limit, offset }
  }, cors)
}

function buildShopeeUrl(app, path, accessToken, shopId) {
  return async function(params = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const baseString = `${app.partnerId}${path}${timestamp}${accessToken}${shopId}`
    const sign = await signHmacHex(app.partnerKey, baseString)
    const url = new URL(`https://partner.shopeemobile.com${path}`)
    url.searchParams.set('partner_id', app.partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('shop_id', String(shopId))
    url.searchParams.set('sign', sign)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}

function readShopeeError(data, fallback = '') {
  const result = data?.response?.result_list?.[0]
  return cleanText(
    result?.fail_message ||
    result?.fail_error ||
    data?.message ||
    data?.error ||
    fallback
  )
}

function shopeeOrderPayload(orderId, packageNumber = '', docType = '', trackingNumber = '') {
  const item = { order_sn: orderId }
  if (packageNumber) item.package_number = packageNumber
  if (docType) item.shipping_document_type = docType
  if (trackingNumber) item.tracking_number = trackingNumber
  return item
}

function assertShopeeLabelEndpointAllowed(path, guards = {}) {
  const safeRead = new Set([
    SHOPEE_LABEL_ENDPOINTS.orderDetail,
    SHOPEE_LABEL_ENDPOINTS.documentParameter,
    SHOPEE_LABEL_ENDPOINTS.downloadDocument
  ])
  const safeGeneration = new Set([
    SHOPEE_LABEL_ENDPOINTS.createDocument,
    SHOPEE_LABEL_ENDPOINTS.documentResult
  ])
  if (safeRead.has(path)) return
  if (safeGeneration.has(path) && guards.allowDocumentGenerate === true && guards.allowFulfillmentAction !== true) return
  throw new LabelFlowError(
    'shopee_label_endpoint_blocked',
    'Endpoint Shopee chưa được xác minh cho flow tải tem.',
    `Blocked Shopee label endpoint: ${path}`,
    { httpStatus: 409 }
  )
}

async function buildShopeeLabelUrl(app, shop, path, params = {}, guards = {}) {
  assertShopeeLabelEndpointAllowed(path, guards)
  return buildShopeeUrl(app, path, shop.access_token, shop.api_shop_id)(params)
}

async function postShopeeRaw(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const bytes = await res.arrayBuffer()
  const text = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.byteLength, 512)))
  let data = null
  try { data = JSON.parse(text) } catch {}
  return { res, bytes, text, data }
}

async function postShopeeJson(url, payload) {
  const raw = await postShopeeRaw(url, payload)
  const data = raw.data || {}
  const res = raw.res
  if (!res.ok || data.error) throw new Error(data.message || data.error || `Shopee HTTP ${res.status}`)
  return data
}

async function callShopeeLabelJson(app, shop, path, payload, guards = {}) {
  const url = await buildShopeeLabelUrl(app, shop, path, {}, guards)
  return postShopeeJson(url, payload)
}

async function callShopeeLabelRaw(app, shop, path, payload, guards = {}) {
  const url = await buildShopeeLabelUrl(app, shop, path, {}, guards)
  return postShopeeRaw(url, payload)
}

async function getShopeePackageNumber(app, shop, orderId, guards = {}) {
  try {
    const detailUrl = await buildShopeeLabelUrl(app, shop, SHOPEE_LABEL_ENDPOINTS.orderDetail, {
      order_sn_list: orderId,
      response_optional_fields: 'package_list,shipping_carrier,checkout_shipping_carrier'
    }, guards)
    const detail = await fetch(detailUrl).then(res => res.json())
    const order = detail?.response?.order_list?.[0] || {}
    return cleanText(order?.package_list?.[0]?.package_number)
  } catch {
    return ''
  }
}

async function getShopeePreferredDocumentType(app, shop, orderId, guards = {}) {
  const fallback = 'THERMAL_AIR_WAYBILL'
  try {
    const data = await callShopeeLabelJson(app, shop, SHOPEE_LABEL_ENDPOINTS.documentParameter, { order_list: [{ order_sn: orderId }] }, guards)
    const result = data?.response?.result_list?.[0] || {}
    const selectable = Array.isArray(result.selectable_shipping_document_type) ? result.selectable_shipping_document_type : []
    const suggested = cleanText(result.suggest_shipping_document_type)
    if (suggested) return suggested
    if (selectable.includes(fallback)) return fallback
    if (selectable.includes('NORMAL_AIR_WAYBILL')) return 'NORMAL_AIR_WAYBILL'
  } catch {}
  return fallback
}

async function downloadShopeeReadyPdf(app, shop, docTypes, orderVariants, guards = {}) {
  let lastMessage = ''
  for (const docType of docTypes) {
    for (const orderList of orderVariants) {
      const payload = { order_list: orderList, shipping_document_type: docType }
      const readyRaw = await callShopeeLabelRaw(app, shop, SHOPEE_LABEL_ENDPOINTS.downloadDocument, payload, guards)
      const readyHead = new TextDecoder().decode(readyRaw.bytes.slice(0, Math.min(readyRaw.bytes.byteLength, 16)))
      if (readyRaw.res.ok && readyHead.startsWith('%PDF')) {
        return { bytes: readyRaw.bytes, documentType: docType, orderList }
      }
      lastMessage = readShopeeError(readyRaw.data, readyRaw.text || `HTTP ${readyRaw.res.status}`)
    }
  }
  return { lastMessage }
}

async function createShopeeShippingDocument(app, shop, orderList, guards = {}) {
  const data = await callShopeeLabelJson(app, shop, SHOPEE_LABEL_ENDPOINTS.createDocument, { order_list: orderList }, guards)
  const result = data?.response?.result_list?.[0] || {}
  const error = cleanText(result.fail_error || result.fail_message || data.error || data.message)
  if (error) {
    throw new LabelFlowError('shopee_document_generation_failed', 'Sàn chưa tạo được chứng từ in, sẽ thử lại.', error, {
      httpStatus: 409,
      retryMinutes: 15
    })
  }
  return data
}

async function waitShopeeShippingDocumentReady(app, shop, orderList, guards = {}) {
  let lastStatus = ''
  let lastMessage = ''
  for (const delay of [0, 900, 1800]) {
    if (delay) await sleep(delay)
    const data = await callShopeeLabelJson(app, shop, SHOPEE_LABEL_ENDPOINTS.documentResult, { order_list: orderList }, guards)
    const result = data?.response?.result_list?.[0] || {}
    lastStatus = cleanText(result.status).toUpperCase()
    lastMessage = cleanText(result.fail_message || result.fail_error || data.message || data.error)
    if (lastStatus === 'READY') return { ready: true, status: lastStatus, message: lastMessage }
    if (lastStatus === 'FAILED' || result.fail_error) {
      throw new LabelFlowError('shopee_document_generation_failed', 'Sàn chưa tạo được chứng từ in, sẽ thử lại.', lastMessage || 'Shopee shipping document result failed', {
        httpStatus: 409,
        retryMinutes: 15
      })
    }
  }
  return { ready: false, status: lastStatus || 'PROCESSING', message: lastMessage }
}

async function downloadShopeePdf(app, shop, order) {
  const orderId = cleanText(order.order_id)
  const guards = { allowDocumentGenerate: true, allowFulfillmentAction: false }
  const packageNumber = await getShopeePackageNumber(app, shop, orderId, guards)
  const preferredType = await getShopeePreferredDocumentType(app, shop, orderId, guards)
  const docTypes = [preferredType, 'THERMAL_AIR_WAYBILL', 'NORMAL_AIR_WAYBILL'].filter((type, index, arr) => type && arr.indexOf(type) === index)
  const orderVariants = packageNumber
    ? [[shopeeOrderPayload(orderId, packageNumber)], [shopeeOrderPayload(orderId)]]
    : [[shopeeOrderPayload(orderId)]]

  const ready = await downloadShopeeReadyPdf(app, shop, docTypes, orderVariants, guards)
  if (ready.bytes) return { ...ready, document_generation: 'existing_ready_document' }

  let lastMessage = ready.lastMessage
  for (const docType of docTypes) {
    for (const variant of orderVariants) {
      const createOrderList = variant.map(item => shopeeOrderPayload(
        item.order_sn,
        item.package_number,
        docType,
        order.tracking_number
      ))
      try {
        await createShopeeShippingDocument(app, shop, createOrderList, guards)
        const state = await waitShopeeShippingDocumentReady(app, shop, createOrderList, guards)
        if (!state.ready) {
          throw new LabelFlowError(
            'pending_document_generation',
            'Chưa có file tem, hệ thống đang tạo chứng từ in và sẽ thử lại.',
            state.message || `Shopee document status ${state.status}`,
            { httpStatus: 202, retryMinutes: 10 }
          )
        }
        const downloadOrderList = variant.map(item => shopeeOrderPayload(item.order_sn, item.package_number))
        const generated = await downloadShopeeReadyPdf(app, shop, [docType], [downloadOrderList], guards)
        if (generated.bytes) return { ...generated, document_generation: 'create_shipping_document' }
        lastMessage = generated.lastMessage || lastMessage
      } catch (error) {
        if (error instanceof LabelFlowError && error.code === 'pending_document_generation') throw error
        lastMessage = error.technicalMessage || error.message || lastMessage
      }
    }
  }

  throw new LabelFlowError('shopee_pdf_not_ready', 'Sàn chưa trả file tem, sẽ thử lại.', lastMessage || 'Shopee shipping document is not ready', {
    httpStatus: 409,
    retryMinutes: 15
  })
}

async function refreshShopeeLabel(env, order, shop) {
  if (!shop?.api_shop_id) throw new Error('Shop Shopee chua co api_shop_id')
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
  const result = await downloadShopeePdf(app, shop, order)
  const saved = await putLabel(env, order.order_id, result.bytes, `labels/${order.order_id}.pdf`, 'application/pdf', `api-document-generation:${result.documentType}`)
  return {
    ...saved,
    document_type: result.documentType,
    document_generation: result.document_generation,
    safe_document_flow: SHOPEE_LABEL_DOCUMENT_GENERATION_FLOW
  }
}

async function signLazada(env, path, accessToken, params = {}) {
  const appKey = cleanText(env.LAZADA_APP_KEY || env.LAZADA_APP_ID)
  const appSecret = cleanText(env.LAZADA_APP_SECRET || env.LAZADA_SECRET)
  if (!appKey || !appSecret) throw new Error('Lazada label signing env is missing')
  const base = {
    app_key: appKey,
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    access_token: accessToken,
    ...params
  }
  const signString = path + Object.keys(base).sort().map(key => `${key}${base[key]}`).join('')
  const sign = (await signHmacHex(appSecret, signString)).toUpperCase()
  return { ...base, sign }
}

async function callLazada(env, path, accessToken, params = {}, method = 'GET') {
  const finalParams = await signLazada(env, path, accessToken, params)
  const url = `https://api.lazada.vn/rest${path}?${new URLSearchParams(finalParams)}`
  const httpMethod = cleanText(method).toUpperCase() || 'GET'
  const res = httpMethod === 'POST'
    ? await fetch(`https://api.lazada.vn/rest${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify(finalParams)
      })
    : await fetch(url)
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Lazada API tra ve khong phai JSON: HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(data?.message || `Lazada API HTTP ${res.status}`)
  if (data.code && data.code !== '0') throw new Error(data.message || data.code)
  return data
}

async function putLazadaDocumentCandidate(env, orderId, value, contentTypeHint, source) {
  const file = cleanText(value)
  if (!file) return null

  if (/^https?:\/\//i.test(file)) {
    const res = await fetch(file)
    if (!res.ok) throw new Error(`Khong tai duoc file Lazada: HTTP ${res.status}`)
    const bytes = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || contentTypeHint || 'application/pdf'
    const validation = validateLabelBytes(bytes, contentType, file, { allowHtml: true })
    if (!validation.ok) throw new Error(`Lazada tra ve file tem khong hop le: ${validation.error}`)
    const ext = validation.contentType.includes('html') ? 'html' : 'pdf'
    return putLabel(env, orderId, bytes, `labels/${orderId}.${ext}`, validation.contentType, source)
  }

  if (looksLikeHtml(file)) {
    const bytes = new TextEncoder().encode(file)
    return putLabel(env, orderId, bytes, `labels/${orderId}.html`, 'text/html; charset=utf-8', source)
  }

  const decoded = decodeBase64Bytes(file)
  if (decoded) {
    const validation = validateLabelBytes(decoded, contentTypeHint, `labels/${orderId}.pdf`, { allowHtml: true })
    if (validation.ok) {
      const ext = validation.contentType.includes('html') ? 'html' : 'pdf'
      return putLabel(env, orderId, decoded, `labels/${orderId}.${ext}`, validation.contentType, source)
    }
    throw new Error(`Lazada tra ve file tem khong hop le: ${validation.error}`)
  }

  if (looksLikeMaskedLazadaFile(file)) {
    throw new Error('Lazada tra ve file tem dang bi che/khong hop le, can dung endpoint PrintAWB hoac in bang Seller Center')
  }

  return null
}

async function putLazadaDocumentFromResponse(env, orderId, data, source) {
  const payloads = [
    data?.result?.data,
    data?.data?.document,
    data?.data
  ].filter(value => value && typeof value === 'object')
  const errors = []

  for (const payload of payloads) {
    const contentTypeHint = cleanText(payload.mime_type || payload.content_type || payload.doc_type).toLowerCase().includes('pdf')
      ? 'application/pdf'
      : cleanText(payload.mime_type || payload.content_type)
    const candidates = [
      payload.pdf_url,
      payload.file
    ].map(cleanText).filter(Boolean)

    for (const candidate of candidates) {
      try {
        const result = await putLazadaDocumentCandidate(env, orderId, candidate, contentTypeHint, source)
        if (result) return result
      } catch (error) {
        errors.push(error.message)
      }
    }
  }

  const lazadaMessage = cleanText(data?.result?.error_msg || data?.message || data?.result?.error_code || data?.code)
  if (errors.length) throw new Error(errors.join(' | '))
  throw new Error(lazadaMessage || 'Lazada khong tra ve file tem')
}

async function refreshLazadaLabel(env, order, shop) {
  const itemData = await callLazada(env, '/order/items/get', shop.access_token, { order_id: order.order_id })
  const items = Array.isArray(itemData?.data) ? itemData.data : []
  const itemIds = items.map(item => cleanText(item.order_item_id)).filter(Boolean)
  if (!itemIds.length) throw new Error('Lazada khong tra ve order_item_id')

  const packageIds = uniqueTexts(items.map(item => item.package_id || item.ofc_package_id))
  let packageError = null
  if (packageIds.length) {
    try {
      const getDocumentReq = JSON.stringify({
        doc_type: 'PDF',
        print_item_list: false,
        packages: packageIds.slice(0, 20).map(packageId => ({ package_id: packageId }))
      })
      const packageDocData = await callLazada(env, '/order/package/document/get', shop.access_token, { getDocumentReq }, 'POST')
      return await putLazadaDocumentFromResponse(env, order.order_id, packageDocData, 'api-refresh:package-document')
    } catch (error) {
      packageError = error
    }
  }

  try {
    const docData = await callLazada(env, '/order/document/get', shop.access_token, {
      doc_type: 'shippingLabel',
      order_item_ids: `[${itemIds.join(',')}]`
    })
    return await putLazadaDocumentFromResponse(env, order.order_id, docData, 'api-refresh:order-document')
  } catch (error) {
    // Lazada đang có hai đời endpoint in tem; ghi rõ cả hai lỗi để vận hành biết phải kiểm tra package hay endpoint cũ.
    const messages = []
    if (packageError) messages.push(`package-document: ${packageError.message}`)
    messages.push(`order-document: ${error.message}`)
    throw new Error(`Lazada khong tai duoc tem hop le. ${messages.join(' | ')}`)
  }
}

async function readLabelRefreshOptions(request) {
  const url = new URL(request.url)
  const contentType = cleanText(request.headers.get('content-type')).toLowerCase()
  let body = {}
  if (contentType.includes('application/json')) {
    body = await request.json().catch(() => ({}))
  }
  const dryRun = ['1', 'true', 'yes'].includes(cleanText(url.searchParams.get('dry_run') || body.dry_run).toLowerCase())
  return { dryRun, body }
}

async function readLabelBackfillOptions(request) {
  const url = new URL(request.url)
  const contentType = cleanText(request.headers.get('content-type')).toLowerCase()
  let body = {}
  if (contentType.includes('application/json')) body = await request.json().catch(() => ({}))
  const dryRun = boolParam(url.searchParams.get('dry_run') || body.dry_run)
  const orderIds = Array.isArray(body.order_ids)
    ? body.order_ids.map(cleanText).filter(Boolean)
    : cleanText(body.order_id || url.searchParams.get('order_id')).split(',').map(cleanText).filter(Boolean)
  const labelStatuses = normalizeLabelStatusFilter([
    ...readArrayParam(body.label_status || body.label_statuses || url.searchParams.get('label_status')),
    ...readArrayParam(url.searchParams.get('label_statuses'))
  ])
  const retryEndpoint = url.pathname.endsWith('/retry-failed')
  const retryFailed = retryEndpoint
    || boolParam(body.retry_failed || url.searchParams.get('retry_failed'))
    || labelStatuses.some(status => isRetryableLabelStatus(status))
  const rawPlatform = cleanText(body.platform || url.searchParams.get('platform')).toLowerCase()
  const actionScope = readArrayParam(body.sync_scope || body.scope || url.searchParams.get('sync_scope') || url.searchParams.get('scope'))
  return {
    actionType: cleanText(body.action_type || body.actionType || url.searchParams.get('action_type') || 'retry_label') || 'retry_label',
    actionScope: actionScope.length ? actionScope : ['label_pdf', 'label_status'],
    dryRun,
    orderIds: [...new Set(orderIds)],
    platform: rawPlatform === 'all' ? '' : rawPlatform,
    shop: cleanText(body.shop || body.shop_id || url.searchParams.get('shop') || url.searchParams.get('shop_id')),
    from: normalizeDateParam(body.from || body.from_date || url.searchParams.get('from') || url.searchParams.get('from_date')),
    to: normalizeDateParam(body.to || body.to_date || url.searchParams.get('to') || url.searchParams.get('to_date')),
    labelStatuses: retryEndpoint && !labelStatuses.length
      ? ['error', 'pending_retry', 'pending_document_generation', 'eligible', 'missing']
      : labelStatuses,
    retryFailed,
    limit: Math.min(Math.max(Number(body.limit || url.searchParams.get('limit') || LABEL_BACKFILL_DEFAULT_LIMIT) || LABEL_BACKFILL_DEFAULT_LIMIT, 1), LABEL_BACKFILL_MAX_LIMIT),
    maxSubrequestsPerRun: Math.min(Math.max(Number(body.max_subrequests_per_run || url.searchParams.get('max_subrequests_per_run') || LABEL_BACKFILL_MAX_SUBREQUESTS) || LABEL_BACKFILL_MAX_SUBREQUESTS, 4), LABEL_BACKFILL_MAX_SUBREQUESTS),
    force: boolParam(body.force || url.searchParams.get('force')),
    trigger: cleanText(body.trigger || url.searchParams.get('trigger') || 'manual_backfill')
  }
}

async function loadLabelBackfillCandidates(env, options = {}) {
  await ensureOrderLabelsTable(env)
  const params = []
  const where = [`LOWER(COALESCE(o.platform, '')) IN ('shopee', 'lazada', 'tiktok')`]
  if (options.orderIds?.length) {
    where.push(`o.order_id IN (${options.orderIds.map(() => '?').join(',')})`)
    params.push(...options.orderIds)
  }
  if (options.platform) {
    where.push(`LOWER(COALESCE(o.platform, '')) = ?`)
    params.push(options.platform)
  }
  if (options.shop) {
    where.push(`LOWER(COALESCE(o.shop, '')) = LOWER(?)`)
    params.push(options.shop)
  }
  if (options.from) {
    where.push(`date(COALESCE(NULLIF(o.order_date, ''), NULLIF(o.oms_updated_at, ''), NULLIF(o.source_updated_at, ''))) >= date(?)`)
    params.push(options.from)
  }
  if (options.to) {
    where.push(`date(COALESCE(NULLIF(o.order_date, ''), NULLIF(o.oms_updated_at, ''), NULLIF(o.source_updated_at, ''))) <= date(?)`)
    params.push(options.to)
  }
  if (!options.force && !options.orderIds?.length) {
    const retryErrorFilter = options.retryFailed
      ? `OR COALESCE(ol.error, '') NOT IN ('', 'manual_required', 'label_download_blocked', 'not_supported')`
      : ''
    where.push(`(
      COALESCE(ol.storage_key, '') = ''
      OR COALESCE(ol.error, '') IN ('', 'not_found', 'pending_retry', 'lazada_batch_requeued', 'pending_document_generation', 'shopee_pdf_not_ready')
      ${retryErrorFilter}
    )`)
    where.push(`(
      COALESCE(o.next_retry_at, '') = ''
      OR datetime(o.next_retry_at) <= datetime('now', '+7 hours')
    )`)
  }
  return env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.order_type,
      o.oms_status,
      o.shipping_status,
      o.shipping_carrier,
      o.tracking_number,
      o.next_retry_at,
      COALESCE(ol.storage_key, '') AS label_file_path,
      COALESCE(ol.refreshed_at, '') AS last_label_download_at,
      COALESCE(ol.error, '') AS last_label_error
    FROM orders_v2 o
    LEFT JOIN order_labels ol ON ol.order_id = o.order_id
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(COALESCE(NULLIF(o.oms_updated_at, ''), NULLIF(o.order_date, ''), '1970-01-01')) DESC, o.order_id DESC
    LIMIT ?
  `).bind(...params, options.limit).all()
}

export async function backfillEligibleLabels(request, env, cors) {
  const options = await readLabelBackfillOptions(request)
  const rows = await loadLabelBackfillCandidates(env, options)
  const capabilityRows = await listMarketplaceShopCapabilities(env, {
    platform: options.platform || '',
    limit: 500
  }).catch(() => [])
  const summary = {
    status: 'ok',
    dry_run: options.dryRun,
    action_type: options.actionType,
    action_scope: options.actionScope,
    trigger: options.trigger,
    scanned: rows.results?.length || 0,
    eligible: 0,
    downloaded: 0,
    queued: 0,
    queued_jobs: 0,
    jobs: [],
    manual_required: 0,
    not_ready: 0,
    not_supported: 0,
    requeued: 0,
    pending_retry: 0,
    already_downloaded: 0,
    skipped: 0,
    errors: 0,
    error_details: [],
    skipped_details: [],
    max_subrequests_per_run: options.maxSubrequestsPerRun,
    estimated_subrequests_used: 0,
    next_cursor: '',
    next_retry_at: '',
    filters: {
      from: options.from,
      to: options.to,
      platform: options.platform || 'all',
      shop: options.shop,
      label_status: options.labelStatuses,
      force: options.force
    },
    details: []
  }
  let estimatedSubrequests = 0

  for (const row of rows.results || []) {
    const platform = cleanText(row.platform).toLowerCase()
    const labelCapability = await findLabelCapability(env, platform, row.shop, capabilityRows)
    const previousLabelState = buildOrderLabelState({
      ...row,
      ...labelCapability
    })
    const canForceRedownload = options.force && previousLabelState.label_status === 'downloaded'
    const canRetryPreviousError = options.retryFailed && isRetryableLabelStatus(previousLabelState.label_status)
    const labelState = canRetryPreviousError || canForceRedownload
      ? buildRetryableLabelState(row, labelCapability)
      : previousLabelState
    const detail = {
      order_id: row.order_id,
      platform,
      shop: row.shop,
      label_status: labelState.label_status,
      label_previous_status: previousLabelState.label_status,
      label_reason: labelState.label_reason,
      label_download_mode: labelState.label_download_mode,
      retry_from_status: (canRetryPreviousError || canForceRedownload) ? previousLabelState.label_status : ''
    }

    if (!matchesLabelStatusFilter(previousLabelState.label_status, options.labelStatuses)
      && !matchesLabelStatusFilter(labelState.label_status, options.labelStatuses)) {
      summary.skipped += 1
      summary.skipped_details.push({
        ...detail,
        skipped: true,
        skipped_reason: 'status_filter',
        message: 'Không khớp bộ lọc trạng thái tem.'
      })
      continue
    }

    if (previousLabelState.label_status === 'downloaded' && !options.force) {
      summary.already_downloaded += 1
      summary.skipped += 1
      summary.skipped_details.push({
        ...detail,
        label_status: previousLabelState.label_status,
        skipped: true,
        skipped_reason: 'already_downloaded',
        message: 'Đã có tem, không chạy lại khi chưa bật force.'
      })
      continue
    }
    if (labelState.label_status === 'manual_required') {
      summary.manual_required += 1
      if (!options.dryRun) {
        const manualError = platform === 'tiktok' ? 'tiktok_label_not_saved_before_packed' : 'manual_required'
        await recordLabelFile(env, {
          orderId: row.order_id,
          platform,
          shop: row.shop,
          storageKey: '',
          source: `auto-label:${options.trigger}`,
          error: manualError
        }).catch(() => null)
      }
      summary.skipped += 1
      summary.skipped_details.push({ ...detail, skipped: true, skipped_reason: 'manual_required', message: 'Cần tải thủ công.' })
      continue
    }
    if (labelState.label_status === 'not_supported') {
      summary.not_supported += 1
      summary.skipped += 1
      summary.skipped_details.push({ ...detail, skipped: true, skipped_reason: 'not_supported', message: 'Shop/sàn không hỗ trợ tải tem.' })
      continue
    }
    if (labelState.label_status !== 'eligible') {
      summary.not_ready += 1
      summary.skipped += 1
      summary.skipped_details.push({ ...detail, skipped: true, skipped_reason: labelState.label_status || 'not_ready', message: 'Đơn chưa đủ điều kiện tải tem.' })
      continue
    }

    summary.eligible += 1
    if (options.dryRun) {
      summary.details.push({ ...detail, dry_run: true })
      continue
    }

    if (isLocalChromeRetryLabel(platform, row.shop, labelCapability)) {
      const job = await queueLocalLabelRetryJob(env, row, options)
      if (job) {
        summary.queued += 1
        summary.queued_jobs += 1
        summary.jobs.push(job)
        summary.details.push({
          ...detail,
          result: 'queued_retry_label',
          action_type: 'retry_label',
          message: 'Đã queue job tải lại tem bằng Chrome automation cố định; PASS chỉ tính sau khi runner tải PDF và OMS readback.'
        })
      } else {
        summary.errors += 1
        summary.error_details.push({ order_id: row.order_id, error: 'queue_retry_label_failed' })
        summary.details.push({ ...detail, result: 'error', error: 'queue_retry_label_failed' })
      }
      continue
    }

    const estimatedCost = LABEL_SUBREQUEST_COST[platform] || 3
    if (estimatedSubrequests + estimatedCost > options.maxSubrequestsPerRun) {
      const normalized = {
        code: platform === 'lazada' ? 'lazada_batch_requeued' : 'pending_retry',
        retryMinutes: 10
      }
      await markLabelRetry(env, row, normalized)
      summary.requeued += 1
      summary.pending_retry += 1
      summary.next_retry_at = row.next_retry_at || ''
      summary.next_cursor = row.order_id
      summary.details.push({
        ...detail,
        result: 'pending_retry',
        error: normalized.code,
        message: 'Batch tải tem quá lớn, hệ thống sẽ tự chia nhỏ và thử lại.'
      })
      break
    }
    estimatedSubrequests += estimatedCost
    summary.estimated_subrequests_used = estimatedSubrequests

    const response = await refreshOrderLabel(localRefreshRequest(row.order_id, {
      trigger: options.trigger,
      dry_run: false
    }), env, cors, row.order_id)
    const payload = await responseJsonSafe(response)
    if (response.ok && payload.status === 'ok') {
      summary.downloaded += 1
      summary.details.push({ ...detail, result: 'downloaded', storage_key: payload.storage_key })
    } else if (['pending_retry', 'pending_document_generation', 'lazada_batch_requeued', 'shopee_pdf_not_ready'].includes(cleanText(payload.error))) {
      summary.requeued += 1
      summary.pending_retry += 1
      if (payload.next_retry_at) summary.next_retry_at = payload.next_retry_at
      summary.details.push({ ...detail, result: 'pending_retry', error: payload.error, message: payload.message })
    } else {
      summary.errors += 1
      const error = payload.error || payload.message || `HTTP ${response.status}`
      summary.error_details.push({ order_id: row.order_id, error })
      summary.details.push({ ...detail, result: 'error', error })
    }
  }

  return json(summary, cors, summary.errors && !summary.downloaded ? 207 : 200)
}

export async function refreshOrderLabel(request, env, cors, orderId) {
  const cleanOrderId = cleanText(orderId)
  if (!cleanOrderId) return json({ error: 'Missing order_id' }, cors, 400)
  const options = await readLabelRefreshOptions(request)

  await ensureOrderLabelsTable(env)
  const order = await getOrderRow(env, cleanOrderId)
  if (!order) return json({ error: 'Order not found' }, cors, 404)

  const platform = cleanText(order.platform).toLowerCase()
  const labelCapability = await findLabelCapability(env, platform, order.shop)
  const refreshMode = labelRefreshModeFromCapability(labelCapability, platform)
  const routeLabelState = buildOrderLabelState({
    ...order,
    ...labelCapability
  })
  const basePayload = {
    order_id: cleanOrderId,
    platform,
    shop: order.shop,
    label_status: routeLabelState.label_status,
    label_reason: routeLabelState.label_reason,
    refresh_mode: refreshMode,
    api_connected: refreshMode === 'api',
    dry_run: options.dryRun,
    ...labelCapability
  }

  const orderEligible = routeLabelState.label_status === 'eligible'
  if (options.dryRun) {
    return json({
      status: labelCapability.label_download_supported && labelCapability.label_download_read_only && orderEligible ? 'ok' : 'blocked',
      ...basePayload,
      message: !orderEligible
        ? (routeLabelState.label_reason || 'Đơn chưa đủ điều kiện tải tem.')
        : (labelCapability.label_download_reason || 'Dry-run capability tải tem.')
    }, cors, labelCapability.label_download_supported && orderEligible ? 200 : 409)
  }

  if (!['shopee', 'lazada'].includes(platform)) {
    return json({ error: 'label_download_not_supported', ...basePayload }, cors, 409)
  }

  if (!labelCapability.label_download_supported || !labelCapability.label_download_read_only || labelCapability.label_download_requires_manual) {
    await recordLabelFile(env, {
      orderId: cleanOrderId,
      platform,
      shop: order.shop,
      storageKey: `labels/${cleanOrderId}.${platform === 'lazada' ? 'html' : 'pdf'}`,
      source: 'capability-guard',
      error: labelCapability.label_download_mode || 'label_download_blocked'
    })
    return json({
      error: 'label_download_capability_blocked',
      ...basePayload,
      message: labelCapability.label_download_reason || 'Shop/sàn chưa đủ capability tải tem read-only.'
    }, cors, 409)
  }

  if (!orderEligible) {
    return json({
      error: 'label_download_order_not_eligible',
      ...basePayload,
      message: routeLabelState.label_reason || 'Đơn chưa đủ điều kiện tải tem.'
    }, cors, 409)
  }

  const shop = await findApiShop(env, platform, order.shop)
  if (!shop) {
    await recordLabelFile(env, {
      orderId: cleanOrderId,
      platform,
      shop: order.shop,
      storageKey: `labels/${cleanOrderId}.${platform === 'lazada' ? 'html' : 'pdf'}`,
      source: 'api-refresh',
      error: 'missing_api_token'
    })
    return json({ error: 'missing_api_token', ...basePayload, message: 'Shop chua co token API hoac token da ngat ket noi' }, cors, 400)
  }

  try {
    const result = platform === 'shopee'
      ? await refreshShopeeLabel(env, order, shop)
      : await refreshLazadaLabel(env, order, shop)
    return json({ status: 'ok', ...basePayload, ...result }, cors)
  } catch (error) {
    const normalized = classifyLabelRefreshError(error, platform)
    await markLabelRetry(env, order, normalized)
    return json({
      error: normalized.code,
      ...basePayload,
      label_status: normalized.code === 'pending_document_generation' ? 'pending_document_generation' : 'pending_retry',
      message: normalized.publicMessage,
      technical_error: normalized.technicalError,
      next_retry_minutes: normalized.retryMinutes
    }, cors, normalized.httpStatus)
  }
}
