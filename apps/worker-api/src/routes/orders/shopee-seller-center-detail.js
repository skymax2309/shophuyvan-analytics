import {
  listShopeeSellerCenterDetailEligibleOrders,
  queueShopeeSellerCenterDetailJobs,
  SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
  upsertShopeeSellerCenterDetail
} from '../../core/orders/shopee-seller-center-detail-core.js'
import { resolveOrderDataSource } from '../../core/orders/order-data-source-resolver.js'
import { recordImportedOrderSyncDiagnostics } from '../../modules/api-sync/sync-diagnostics.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function sellerDetailRequestId(prefix = 'shopee-seller-detail') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function intParam(url, key, fallback = 20) {
  const number = Number(url.searchParams.get(key) || fallback)
  return Number.isFinite(number) ? number : fallback
}

async function diagnostic(env, url) {
  const orderId = cleanText(url.searchParams.get('order_id') || url.searchParams.get('order_sn'))
  if (!orderId) return { status: 'error', error: 'missing_order_id' }
  const row = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.oms_status,
      o.shipping_status,
      o.shipping_carrier,
      o.tracking_number,
      o.source_mode,
      o.source_detail,
      o.source_url,
      o.source_updated_at,
      o.seller_center_detail_id,
      o.seller_center_detail_url,
      o.detail_url_source,
      o.detail_url_verified_at,
      o.last_status_sync_at,
      o.last_status_sync_status,
      o.last_status_sync_error,
      o.status_source,
      o.status_changed_at,
      o.status_touched_24h,
      o.status_changed_count,
      o.next_retry_at,
      f.source AS fee_source,
      f.raw_data AS fee_raw_data,
      f.updated_at AS fee_updated_at,
      COUNT(oi.id) AS item_count
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.order_id = ?
    GROUP BY o.order_id
  `).bind(orderId).first()
  if (!row) return { status: 'error', error: 'order_not_found', order_id: orderId }
  let raw = {}
  try { raw = JSON.parse(row.fee_raw_data || '{}') } catch {}
  return {
    status: 'ok',
    source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
    source_resolution: resolveOrderDataSource(row),
    order_id: row.order_id,
    platform: row.platform,
    shop: row.shop,
    order_status: {
      oms_status: row.oms_status,
      shipping_status: row.shipping_status,
      shipping_carrier: row.shipping_carrier,
      tracking_number: row.tracking_number,
      last_status_sync_at: row.last_status_sync_at,
      last_status_sync_status: row.last_status_sync_status,
      last_status_sync_error: row.last_status_sync_error,
      status_source: row.status_source,
      status_changed_at: row.status_changed_at,
      status_touched_24h: row.status_touched_24h,
      status_changed_count: row.status_changed_count,
      next_retry_at: row.next_retry_at
    },
    seller_center_detail: {
      seller_center_detail_id: row.seller_center_detail_id,
      seller_center_detail_url: row.seller_center_detail_url,
      source_url: row.source_url,
      detail_url_source: row.detail_url_source,
      detail_url_verified_at: row.detail_url_verified_at
    },
    item_count: Number(row.item_count || 0),
    finance: {
      source: row.fee_source,
      updated_at: row.fee_updated_at,
      detail: raw.shopee_seller_center_detail || {}
    }
  }
}

async function recordDetailErrors(env, errors = []) {
  const rows = []
  for (const item of errors.slice(0, 20)) {
    const orderId = cleanText(item.order_id || item.order_sn || item.orderNo)
    const error = cleanText(item.error || item.message || 'seller_center_detail_error').slice(0, 220)
    if (!orderId) continue
    const order = await env.DB.prepare(`
      SELECT order_id, platform, shop, source_mode, source_detail, status_source, detail_url_source, last_status_sync_error
      FROM orders_v2
      WHERE order_id = ?
      LIMIT 1
    `).bind(orderId).first()
    const sourceResolution = resolveOrderDataSource(order || { platform: 'shopee', shop: item.shop || item.shop_name })
    if (!sourceResolution.seller_center_allowed) {
      rows.push({
        order_id: orderId,
        error: 'source_mismatch_api_shop_not_seller_center',
        skipped: true,
        source_resolution: sourceResolution
      })
      continue
    }
    await env.DB.prepare(`
      UPDATE orders_v2
      SET
        last_status_sync_at = datetime('now', '+7 hours'),
        last_status_sync_status = 'error',
        last_status_sync_error = ?,
        status_source = ?,
        detail_url_source = CASE WHEN COALESCE(seller_center_detail_url, '') = '' THEN ? ELSE detail_url_source END,
        next_retry_at = datetime('now', '+7 hours', '+30 minutes')
      WHERE order_id = ?
    `).bind(
      error,
      SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
      error === 'seller_center_detail_url_not_found' ? 'seller_center_detail_url_not_found' : '',
      orderId
    ).run()
    rows.push({ order_id: orderId, error })
  }
  return rows
}

export async function handleShopeeSellerCenterDetail(request, env, cors) {
  const url = new URL(request.url)

  if (url.pathname.endsWith('/eligible') && request.method === 'GET') {
    const result = await listShopeeSellerCenterDetailEligibleOrders(env, {
      order_id: url.searchParams.get('order_id') || url.searchParams.get('order_sn'),
      shop: url.searchParams.get('shop') || url.searchParams.get('shop_id'),
      from: url.searchParams.get('from') || url.searchParams.get('from_date'),
      to: url.searchParams.get('to') || url.searchParams.get('to_date'),
      limit: intParam(url, 'limit', 20),
      force: url.searchParams.get('force') === '1',
      missing_only: url.searchParams.get('missing_only') === '1',
      retry_failed: url.searchParams.get('retry_failed') === '1',
      pending_settlement_only: url.searchParams.get('pending_settlement_only') === '1',
      missing_detail_url_only: url.searchParams.get('missing_detail_url_only') === '1'
    })
    return Response.json(result, { headers: cors })
  }

  if (url.pathname.endsWith('/queue') && request.method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const eligible = await listShopeeSellerCenterDetailEligibleOrders(env, {
      order_ids: Array.isArray(body.order_ids) ? body.order_ids : [],
      order_id: body.order_id || body.order_sn,
      shop: body.shop || body.shop_id,
      from: body.from || body.from_date,
      to: body.to || body.to_date,
      limit: Math.min(Number(body.limit || 20) || 20, 20),
      force: body.force === true,
      missing_only: body.missing_only === true,
      retry_failed: body.retry_failed === true,
      pending_settlement_only: body.pending_settlement_only === true,
      missing_detail_url_only: body.missing_detail_url_only === true
    })
    const queued = await queueShopeeSellerCenterDetailJobs(env, eligible.orders, {
      trigger: cleanText(body.trigger || 'manual_queue'),
      limit: eligible.limit
    })
    return Response.json({ ...eligible, ...queued }, { headers: cors })
  }

  if (url.pathname.endsWith('/backfill') && request.method === 'POST') {
    const requestId = request.headers.get('X-Request-Id') || sellerDetailRequestId()
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dry_run === true || body.dry_run === '1' || url.searchParams.get('dry_run') === '1'
    const details = Array.isArray(body.details)
      ? body.details
      : (body.detail ? [body.detail] : [body])
    const detailErrors = Array.isArray(body.errors) ? body.errors : []
    if (dryRun) {
      return Response.json({
        status: 'ok',
        dry_run: true,
        request_id: requestId,
        source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
        detail_count: details.length,
        error_count: detailErrors.length,
        message: 'Dry-run chỉ kiểm payload; chưa ghi Warehouse/Core.'
      }, { headers: { ...cors, 'X-Request-Id': requestId } })
    }

    const touched = []
    const errors = []
    for (const detail of details.slice(0, 20)) {
      const result = await upsertShopeeSellerCenterDetail(env, detail)
      if (result.status === 'ok' || result.status === 'partial_error') touched.push(result)
      else errors.push(result)
    }
    const recordedErrors = await recordDetailErrors(env, detailErrors)
    if (touched.length) {
      await recordImportedOrderSyncDiagnostics(env, touched.map(row => ({
        order_id: row.order_id,
        platform: 'shopee',
        shop: row.shop,
        source_mode: 'browser_sync'
      })), {
        source_mode: 'browser_sync',
        source_detail: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
        imported_orders: touched.length,
        source_updated_at: new Date().toISOString(),
        warnings: errors.length ? errors.map(error => ({ error: error.error || 'backfill_error' })) : []
      })
    }
    return Response.json({
      status: errors.length || recordedErrors.length ? (touched.length ? 'partial_error' : 'error') : 'ok',
      request_id: requestId,
      source: SHOPEE_SELLER_CENTER_DETAIL_SOURCE,
      touched_count: touched.length,
      error_count: errors.length + recordedErrors.length,
      touched,
      errors: [...errors, ...recordedErrors]
    }, { status: errors.length && !touched.length && !recordedErrors.length ? 400 : 200, headers: { ...cors, 'X-Request-Id': requestId } })
  }

  if (url.pathname.endsWith('/diagnostic') && request.method === 'GET') {
    return Response.json(await diagnostic(env, url), { headers: cors })
  }

  return Response.json({
    status: 'error',
    error: 'unsupported_shopee_seller_center_detail_route'
  }, { status: 404, headers: cors })
}
