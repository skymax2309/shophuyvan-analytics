import { getShopeeAppFromRow, signHmacHex } from '../../utils/shopee-apps.js'

const LAZADA_APP_KEY = '135731'
const LAZADA_SECRET = 'UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK'

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

function validateLabelBytes(bytes, contentType = '', key = '') {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const text = bytesHeadText(view)
  if (bytesStartWithPdf(view)) return { ok: true, contentType: 'application/pdf' }
  if (looksLikeHtml(text)) return { ok: true, contentType: 'text/html; charset=utf-8' }
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
    SELECT order_id, platform, shop, shipping_status, shipping_carrier, tracking_number
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

async function lookupExistingLabel(env, orderId, preferredExt = 'pdf') {
  const candidates = preferredExt === 'html'
    ? [`labels/${orderId}.html`, `labels/${orderId}.pdf`]
    : [`labels/${orderId}.pdf`, `labels/${orderId}.html`]

  for (const candidate of candidates) {
    const object = await env.STORAGE.get(candidate)
    if (object) {
      const contentType = object.httpMetadata?.contentType || contentTypeForKey(candidate)
      const bytes = await object.arrayBuffer()
      const validation = validateLabelBytes(bytes, contentType, candidate)
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
  const found = await lookupExistingLabel(env, orderId, preferredExt)

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
    const apiShop = ['shopee', 'lazada'].includes(platform)
      ? await findApiShop(env, platform, shopName)
      : null
    const preferredExt = cleanText(url.searchParams.get('type')).toLowerCase() === 'html' ? 'html' : 'pdf'
    const found = await lookupExistingLabel(env, orderId, preferredExt)
    return json({
      order_id: orderId,
      has_label: !!found,
      storage_key: found?.storageKey || label?.storage_key || '',
      content_type: found?.contentType || label?.content_type || '',
      platform,
      shop: shopName,
      api_connected: !!apiShop,
      refresh_mode: apiShop ? 'api' : (platform ? 'browser' : 'manual'),
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
                  WHEN COALESCE(ol.storage_key, '') != '' THEN 'ok'
                  ELSE 'missing' END AS label_status
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

  return json({
    summary: {
      ...summary,
      platforms: platforms.results || []
    },
    labels: rows.results || [],
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

async function getShopeePackageNumber(app, shop, orderId) {
  try {
    const detailUrl = await buildShopeeUrl(app, '/api/v2/order/get_order_detail', shop.access_token, shop.api_shop_id)({
      order_sn_list: orderId,
      response_optional_fields: 'package_list,shipping_carrier,checkout_shipping_carrier'
    })
    const detail = await fetch(detailUrl).then(res => res.json())
    const order = detail?.response?.order_list?.[0] || {}
    return cleanText(order?.package_list?.[0]?.package_number)
  } catch {
    return ''
  }
}

async function getShopeePreferredDocumentType(app, shop, orderId) {
  const fallback = 'THERMAL_AIR_WAYBILL'
  try {
    const url = await buildShopeeUrl(app, '/api/v2/logistics/get_shipping_document_parameter', shop.access_token, shop.api_shop_id)()
    const data = await postShopeeJson(url, { order_list: [{ order_sn: orderId }] })
    const result = data?.response?.result_list?.[0] || {}
    const selectable = Array.isArray(result.selectable_shipping_document_type) ? result.selectable_shipping_document_type : []
    const suggested = cleanText(result.suggest_shipping_document_type)
    if (suggested) return suggested
    if (selectable.includes(fallback)) return fallback
    if (selectable.includes('NORMAL_AIR_WAYBILL')) return 'NORMAL_AIR_WAYBILL'
  } catch {}
  return fallback
}

async function downloadShopeePdf(app, shop, orderId) {
  const packageNumber = await getShopeePackageNumber(app, shop, orderId)
  const preferredType = await getShopeePreferredDocumentType(app, shop, orderId)
  const docTypes = [preferredType, 'THERMAL_AIR_WAYBILL', 'NORMAL_AIR_WAYBILL'].filter((type, index, arr) => type && arr.indexOf(type) === index)
  const orderVariants = packageNumber
    ? [[{ order_sn: orderId, package_number: packageNumber }], [{ order_sn: orderId }]]
    : [[{ order_sn: orderId }]]
  let lastMessage = ''

  for (const docType of docTypes) {
    for (const orderList of orderVariants) {
      const payload = { order_list: orderList, shipping_document_type: docType }
      const downloadUrl = await buildShopeeUrl(app, '/api/v2/logistics/download_shipping_document', shop.access_token, shop.api_shop_id)()
      const readyRaw = await postShopeeRaw(downloadUrl, payload)
      const readyHead = new TextDecoder().decode(readyRaw.bytes.slice(0, Math.min(readyRaw.bytes.byteLength, 16)))
      if (readyRaw.res.ok && readyHead.startsWith('%PDF')) {
        return { bytes: readyRaw.bytes, documentType: docType }
      }
      lastMessage = readShopeeError(readyRaw.data, readyRaw.text || `HTTP ${readyRaw.res.status}`)

      const createUrl = await buildShopeeUrl(app, '/api/v2/logistics/create_shipping_document', shop.access_token, shop.api_shop_id)()
      const createRaw = await postShopeeRaw(createUrl, payload)
      if (createRaw.data?.error) lastMessage = readShopeeError(createRaw.data, createRaw.text)

      for (let retry = 0; retry < 2; retry++) {
        const resultUrl = await buildShopeeUrl(app, '/api/v2/logistics/get_shipping_document_result', shop.access_token, shop.api_shop_id)()
        const resultRaw = await postShopeeRaw(resultUrl, payload)
        const status = cleanText(resultRaw.data?.response?.result_list?.[0]?.status).toUpperCase()
        if (status && status !== 'READY') {
          lastMessage = status
          await sleep(1500)
          continue
        }

        const downloadRaw = await postShopeeRaw(downloadUrl, payload)
        const first = new TextDecoder().decode(downloadRaw.bytes.slice(0, Math.min(downloadRaw.bytes.byteLength, 16)))
        if (downloadRaw.res.ok && first.startsWith('%PDF')) {
          return { bytes: downloadRaw.bytes, documentType: docType }
        }

        lastMessage = readShopeeError(downloadRaw.data, downloadRaw.text || `HTTP ${downloadRaw.res.status}`)
        if (lastMessage.toLowerCase().includes('should_print_first')) break
        await sleep(1500)
      }
    }
  }

  throw new Error(`Shopee chua tra ve PDF: ${lastMessage}`)
}

async function refreshShopeeLabel(env, order, shop) {
  if (!shop?.api_shop_id) throw new Error('Shop Shopee chua co api_shop_id')
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
  const result = await downloadShopeePdf(app, shop, order.order_id)
  return putLabel(env, order.order_id, result.bytes, `labels/${order.order_id}.pdf`, 'application/pdf', `api-refresh:${result.documentType}`)
}

async function signLazada(path, accessToken, params = {}) {
  const base = {
    app_key: LAZADA_APP_KEY,
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    access_token: accessToken,
    ...params
  }
  const signString = path + Object.keys(base).sort().map(key => `${key}${base[key]}`).join('')
  const sign = (await signHmacHex(LAZADA_SECRET, signString)).toUpperCase()
  return { ...base, sign }
}

async function callLazada(path, accessToken, params = {}, method = 'GET') {
  const finalParams = await signLazada(path, accessToken, params)
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
    const validation = validateLabelBytes(bytes, contentType, file)
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
    const validation = validateLabelBytes(decoded, contentTypeHint, `labels/${orderId}.pdf`)
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
  const itemData = await callLazada('/order/items/get', shop.access_token, { order_id: order.order_id })
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
      const packageDocData = await callLazada('/order/package/document/get', shop.access_token, { getDocumentReq }, 'POST')
      return await putLazadaDocumentFromResponse(env, order.order_id, packageDocData, 'api-refresh:package-document')
    } catch (error) {
      packageError = error
    }
  }

  try {
    const docData = await callLazada('/order/document/get', shop.access_token, {
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

export async function refreshOrderLabel(request, env, cors, orderId) {
  const cleanOrderId = cleanText(orderId)
  if (!cleanOrderId) return json({ error: 'Missing order_id' }, cors, 400)

  await ensureOrderLabelsTable(env)
  const order = await getOrderRow(env, cleanOrderId)
  if (!order) return json({ error: 'Order not found' }, cors, 404)

  const platform = cleanText(order.platform).toLowerCase()
  if (!['shopee', 'lazada'].includes(platform)) {
    return json({ error: 'San nay chua ho tro tai lai tem bang API', platform }, cors, 400)
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
    return json({ error: 'Shop chua co token API hoac token da ngat ket noi', platform, shop: order.shop }, cors, 400)
  }

  try {
    const result = platform === 'shopee'
      ? await refreshShopeeLabel(env, order, shop)
      : await refreshLazadaLabel(env, order, shop)
    return json({ status: 'ok', ...result }, cors)
  } catch (error) {
    await recordLabelFile(env, {
      orderId: cleanOrderId,
      platform,
      shop: order.shop,
      storageKey: `labels/${cleanOrderId}.${platform === 'lazada' ? 'html' : 'pdf'}`,
      source: 'api-refresh',
      error: error.message
    })
    return json({ error: error.message, platform, shop: order.shop }, cors, 500)
  }
}
