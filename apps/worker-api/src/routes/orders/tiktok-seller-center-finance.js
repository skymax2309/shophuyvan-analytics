import {
  listTiktokSellerCenterFinanceEligibleOrders,
  queueTiktokSellerCenterFinanceJobs,
  TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
  upsertTiktokSellerCenterFinanceDetail
} from '../../core/orders/tiktok-seller-center-finance-core.js'
import { rebuildOrderAnalytics } from '../order-analytics/index.js'
import { recordImportedOrderSyncDiagnostics } from '../../modules/api-sync/sync-diagnostics.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function tiktokDetailRequestId(prefix = 'tiktok-seller-detail') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function intParam(url, key, fallback = 20) {
  const number = Number(url.searchParams.get(key) || fallback)
  return Number.isFinite(number) ? number : fallback
}

async function rebuildTouchedOrders(env, touched = []) {
  const grouped = new Map()
  for (const row of touched || []) {
    const shop = cleanText(row.shop)
    const date = cleanText(row.order_date).slice(0, 10)
    if (!shop || !date) continue
    const key = `${shop}|${date}`
    grouped.set(key, { shop, date })
  }
  const results = []
  for (const item of grouped.values()) {
    const result = await rebuildOrderAnalytics(env, {
      platform: 'tiktok',
      shop: item.shop,
      from: item.date,
      to: item.date,
      sync_payment: false
    })
    results.push({ shop: item.shop, date: item.date, saved: result.saved, orders: result.orders, warnings: result.warnings || [] })
  }
  return results
}

async function diagnostic(env, url) {
  const orderId = cleanText(url.searchParams.get('order_id') || url.searchParams.get('order_no'))
  if (!orderId) return { status: 'error', error: 'missing_order_id' }
  const row = await env.DB.prepare(`
    SELECT
      o.order_id,
      o.platform,
      o.shop,
      o.revenue,
      o.raw_revenue,
      o.discount_shop,
      o.discount_shopee,
      o.source_mode,
      o.source_detail,
      o.source_updated_at,
      f.source AS fee_source,
      f.settlement,
      f.raw_data AS fee_raw_data,
      f.updated_at AS fee_updated_at,
      oa.revenue AS analytics_revenue,
      oa.actual_income AS analytics_actual_income,
      oa.actual_income_source,
      oa.net_profit,
      oa.warning,
      oa.source_json,
      oa.computed_at
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN order_analytics oa ON oa.order_sn = o.order_id
    WHERE o.order_id = ?
  `).bind(orderId).first()
  if (!row) return { status: 'error', error: 'order_not_found', order_id: orderId }
  let raw = {}
  let sourceJson = {}
  try { raw = JSON.parse(row.fee_raw_data || '{}') } catch {}
  try { sourceJson = JSON.parse(row.source_json || '{}') } catch {}
  const detail = raw.tiktok_seller_center_detail || {}
  const taxonomy = sourceJson.taxonomy || {}
  return {
    status: 'ok',
    order_id: row.order_id,
    platform: row.platform,
    shop: row.shop,
    orders_v2: {
      revenue: row.revenue,
      raw_revenue: row.raw_revenue,
      discount_shop: row.discount_shop,
      discount_shopee: row.discount_shopee,
      source_mode: row.source_mode,
      source_detail: row.source_detail,
      source_updated_at: row.source_updated_at
    },
    fee_detail: {
      source: row.fee_source,
      settlement: row.settlement,
      updated_at: row.fee_updated_at,
      tiktok_seller_center_detail: detail
    },
    analytics: {
      revenue: row.analytics_revenue,
      actual_income: row.analytics_actual_income,
      actual_income_source: row.actual_income_source,
      estimated_income: sourceJson.estimated_income ?? taxonomy.estimated_income ?? null,
      net_profit: row.net_profit,
      warning: row.warning,
      computed_at: row.computed_at,
      profit_basis: taxonomy.profit_basis,
      profit_status: taxonomy.profit_status,
      settlement_status: taxonomy.settlement_status,
      actual_income_available: taxonomy.actual_income_available,
      actual_income_settlement: taxonomy.actual_income_settlement,
      actual_income_value: sourceJson.actual_income_value ?? null,
      finance_confidence: taxonomy.finance_confidence
    }
  }
}

export async function handleTiktokSellerCenterFinance(request, env, cors) {
  const url = new URL(request.url)

  if (url.pathname.endsWith('/eligible') && request.method === 'GET') {
    const result = await listTiktokSellerCenterFinanceEligibleOrders(env, {
      order_id: url.searchParams.get('order_id') || url.searchParams.get('order_no'),
      shop: url.searchParams.get('shop') || url.searchParams.get('shop_id'),
      from: url.searchParams.get('from') || url.searchParams.get('from_date'),
      to: url.searchParams.get('to') || url.searchParams.get('to_date'),
      limit: intParam(url, 'limit', 20),
      force: url.searchParams.get('force') === '1',
      missing_only: url.searchParams.get('missing_only') === '1',
      retry_failed: url.searchParams.get('retry_failed') === '1',
      pending_settlement_only: url.searchParams.get('pending_settlement_only') === '1'
    })
    return Response.json(result, { headers: cors })
  }

  if (url.pathname.endsWith('/queue') && request.method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const eligible = await listTiktokSellerCenterFinanceEligibleOrders(env, {
      order_ids: Array.isArray(body.order_ids) ? body.order_ids : [],
      order_id: body.order_id || body.order_no,
      shop: body.shop || body.shop_id,
      from: body.from || body.from_date,
      to: body.to || body.to_date,
      limit: Math.min(Number(body.limit || 20) || 20, 20),
      force: body.force === true,
      missing_only: body.missing_only === true,
      retry_failed: body.retry_failed === true,
      pending_settlement_only: body.pending_settlement_only === true
    })
    const queued = await queueTiktokSellerCenterFinanceJobs(env, eligible.orders, {
      trigger: cleanText(body.trigger || 'manual_queue'),
      limit: eligible.limit
    })
    return Response.json({ ...eligible, ...queued }, { headers: cors })
  }

  if (url.pathname.endsWith('/backfill') && request.method === 'POST') {
    const requestId = request.headers.get('X-Request-Id') || tiktokDetailRequestId()
    const body = await request.json().catch(() => ({}))
    const details = Array.isArray(body.details)
      ? body.details
      : (body.detail ? [body.detail] : [body])
    const touched = []
    const errors = []
    for (const detail of details.slice(0, 20)) {
      const result = await upsertTiktokSellerCenterFinanceDetail(env, detail)
      if (result.status === 'ok') touched.push(result)
      else errors.push(result)
    }
    const rebuild = await rebuildTouchedOrders(env, touched)
    if (touched.length) {
      await recordImportedOrderSyncDiagnostics(env, touched.map(row => ({
        order_id: row.order_id,
        platform: 'tiktok',
        shop: row.shop,
        source_mode: 'browser_sync'
      })), {
        source_mode: 'browser_sync',
        source_detail: TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
        imported_orders: touched.length,
        source_updated_at: new Date().toISOString(),
        warnings: errors.length ? errors.map(error => ({ error: error.error || 'backfill_error' })) : []
      })
    }
    return Response.json({
      status: errors.length ? (touched.length ? 'partial_error' : 'error') : 'ok',
      request_id: requestId,
      source: TIKTOK_SELLER_CENTER_DETAIL_SOURCE,
      touched_count: touched.length,
      error_count: errors.length,
      touched,
      errors,
      rebuild
    }, { status: errors.length && !touched.length ? 400 : 200, headers: { ...cors, 'X-Request-Id': requestId } })
  }

  if (url.pathname.endsWith('/diagnostic') && request.method === 'GET') {
    return Response.json(await diagnostic(env, url), { headers: cors })
  }

  return Response.json({
    status: 'error',
    error: 'unsupported_tiktok_seller_center_finance_route'
  }, { status: 404, headers: cors })
}
