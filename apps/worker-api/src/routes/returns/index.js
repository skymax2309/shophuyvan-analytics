import {
  acceptShopeeReturnOffer,
  cancelShopeeReturnDispute,
  confirmShopeeReturn,
  disputeShopeeReturn,
  fetchShopeeReturnAvailableSolutions,
  fetchShopeeReturnDetail,
  fetchShopeeReturnDisputeReasons,
  fetchShopeeReturnList,
  fetchShopeeReturnShippingCarrier,
  offerShopeeReturn,
  fetchShopeeReverseTrackingInfo,
  queryShopeeReturnProof,
  fetchShopeeReturnProfitImpact,
  syncLazadaReverseOrders,
  syncShopeeReturns,
  uploadShopeeReturnProof,
  uploadShopeeReturnShippingProof
} from '../api/index.js'
import { loadReturnReverseLedgerSummary } from '../../core/returns/reverse-core.js'
import { createReturnComplaintHandlers } from './complaints.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na', 'chưa rõ', 'chua ro'].includes(lower)) return ''
  return text
}

function compactJson(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback)).slice(0, 16000)
  } catch {
    return fallback
  }
}

function isConfirmedMarketplaceAction(options = {}) {
  const value = options.confirm_action ?? options.confirmAction ?? options.execute_return_action ?? options.executeReturnAction
  if (value === true) return true
  const text = cleanText(value).toLowerCase()
  return ['true', '1', 'yes', 'confirm', 'execute', 'i_understand'].includes(text)
}

async function readBody(request) {
  if (request.method !== 'POST') return {}
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function pickOptions(url, body) {
  return {
    shop: body.shop || url.searchParams.get('shop'),
    platform: body.platform || url.searchParams.get('platform'),
    lifecycle: body.lifecycle || body.normalized_status || body.normalizedStatus || url.searchParams.get('lifecycle') || url.searchParams.get('normalized_status'),
    limit: body.limit || url.searchParams.get('limit'),
    shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
    page_no: body.page_no ?? body.pageNo ?? url.searchParams.get('page_no'),
    page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
    date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
    date_to: body.date_to || body.dateTo || url.searchParams.get('date_to'),
    time_field: body.time_field || body.timeField || url.searchParams.get('time_field'),
    create_time_from: body.create_time_from || body.createTimeFrom || url.searchParams.get('create_time_from'),
    create_time_to: body.create_time_to || body.createTimeTo || url.searchParams.get('create_time_to'),
    update_time_from: body.update_time_from || body.updateTimeFrom || url.searchParams.get('update_time_from'),
    update_time_to: body.update_time_to || body.updateTimeTo || url.searchParams.get('update_time_to'),
    status: body.status || url.searchParams.get('status'),
    negotiation_status: body.negotiation_status || body.negotiationStatus || url.searchParams.get('negotiation_status'),
    seller_proof_status: body.seller_proof_status || body.sellerProofStatus || url.searchParams.get('seller_proof_status'),
    seller_compensation_status: body.seller_compensation_status || body.sellerCompensationStatus || url.searchParams.get('seller_compensation_status'),
    return_sn: body.return_sn || body.returnSn || url.searchParams.get('return_sn'),
    scan_all_shops: body.scan_all_shops ?? body.scanAllShops ?? url.searchParams.get('scan_all_shops'),
    confirm_action: body.confirm_action ?? body.confirmAction ?? url.searchParams.get('confirm_action'),
    execute_return_action: body.execute_return_action ?? body.executeReturnAction ?? url.searchParams.get('execute_return_action'),
    email: body.email || url.searchParams.get('email'),
    dispute_reason_id: body.dispute_reason_id ?? body.disputeReasonId ?? url.searchParams.get('dispute_reason_id'),
    dispute_text_reason: body.dispute_text_reason ?? body.disputeTextReason ?? url.searchParams.get('dispute_text_reason'),
    image_list: body.image_list ?? body.imageList,
    proposed_solution: body.proposed_solution ?? body.proposedSolution ?? url.searchParams.get('proposed_solution'),
    proposed_adjusted_refund_amount: body.proposed_adjusted_refund_amount ?? body.proposedAdjustedRefundAmount ?? url.searchParams.get('proposed_adjusted_refund_amount'),
    photo: body.photo,
    description: body.description ?? url.searchParams.get('description'),
    reverse_logistics_carrier_id: body.reverse_logistics_carrier_id ?? body.reverseLogisticsCarrierId ?? url.searchParams.get('reverse_logistics_carrier_id'),
    reverse_logistics_carrier_name: body.reverse_logistics_carrier_name ?? body.reverseLogisticsCarrierName ?? url.searchParams.get('reverse_logistics_carrier_name'),
    tracking_number: body.tracking_number ?? body.trackingNumber ?? url.searchParams.get('tracking_number'),
    image_id_list: body.image_id_list ?? body.imageIdList,
    remarks: body.remarks ?? url.searchParams.get('remarks'),
    code: body.code || body.scan_code || body.scanCode || url.searchParams.get('code') || url.searchParams.get('scan_code'),
    operator: body.operator || body.operator_name || body.operatorName || url.searchParams.get('operator'),
    note: body.note || body.remarks || url.searchParams.get('note') || url.searchParams.get('remarks')
  }
}

async function addOrderColumnIfMissing(env, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE orders_v2 ADD COLUMN ${definition}`).run()
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
  }
}

async function ensureReturnReceiveSchema(env) {
  // Xác nhận nhận hàng hoàn là log kho nội bộ, tách khỏi API hoàn/trả của sàn để không ghi nhầm lên sàn.
  await addOrderColumnIfMissing(env, "return_received_at TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_received_by TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_received_note TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_complaint_status TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_complaint_updated_at TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_complaint_note TEXT DEFAULT ''")
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS packing_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      video_url TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_packing_videos_order ON packing_videos(order_id)`).run()
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
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS return_receive_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_code TEXT NOT NULL,
      order_id TEXT NOT NULL,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      tracking_number TEXT DEFAULT '',
      operator TEXT DEFAULT '',
      note TEXT DEFAULT '',
      result_status TEXT DEFAULT 'received',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_return_receive_scans_order ON return_receive_scans(order_id)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_return_receive_scans_code ON return_receive_scans(scan_code)`).run()
}

function returnLike(row = {}) {
  const text = [
    row.oms_status,
    row.shipping_status,
    row.order_type
  ].map(value => cleanText(value).toUpperCase()).join(' ')
  return text.includes('RETURN')
    || text.includes('REFUND')
    || text.includes('FAILED_DELIVERY')
    || text.includes('TO_RETURN')
    || text.includes('LOGISTICS_LOST')
}

function receivedLike(row = {}) {
  return cleanText(row.return_received_at)
    || cleanText(row.shipping_status).toUpperCase() === 'LOGISTICS_RETURN_PACKAGE_RECEIVED'
}

function returnOrderPayload(row = {}) {
  return {
    order_id: cleanText(row.order_id),
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    oms_status: cleanText(row.oms_status),
    shipping_status: cleanText(row.shipping_status),
    tracking_number: cleanText(row.tracking_number),
    shipping_carrier: cleanText(row.shipping_carrier),
    return_received_at: cleanText(row.return_received_at),
    return_received_by: cleanText(row.return_received_by),
    return_received_note: cleanText(row.return_received_note),
    packing_video_count: Number(row.packing_video_count || 0),
    latest_packing_video_url: cleanText(row.latest_packing_video_url),
    latest_packing_video_at: cleanText(row.latest_packing_video_at),
    label_storage_key: cleanText(row.label_storage_key),
    label_error: cleanText(row.label_error),
    evidence_ready: Number(row.packing_video_count || 0) > 0,
    evidence_complete: Number(row.packing_video_count || 0) > 0 && !!cleanText(row.label_storage_key) && !cleanText(row.label_error)
  }
}

async function findReturnOrderByScan(env, code) {
  const scanCode = cleanText(code)
  if (!scanCode) return null
  return env.DB.prepare(`
    SELECT order_id, platform, shop, oms_status, shipping_status, order_type,
           tracking_number, shipping_carrier, return_received_at, return_received_by, return_received_note
    FROM orders_v2
    WHERE order_id = ?
       OR UPPER(TRIM(COALESCE(tracking_number, ''))) = UPPER(TRIM(?))
    ORDER BY CASE WHEN order_id = ? THEN 0 ELSE 1 END,
             datetime(COALESCE(NULLIF(oms_updated_at, ''), NULLIF(order_date, ''), '1970-01-01')) DESC
    LIMIT 1
  `).bind(scanCode, scanCode, scanCode).first()
}

async function listReturnReceiveOrders(env, options = {}) {
  await ensureReturnReceiveSchema(env)
  const status = cleanText(options.status || options.lifecycle).toLowerCase()
  const search = cleanText(options.code || options.search)
  const limit = Math.max(1, Math.min(Number(options.limit || 80) || 80, 200))
  const clauses = [`(
    UPPER(COALESCE(oms_status, '')) = 'RETURN'
    OR LOWER(COALESCE(order_type, '')) = 'return'
    OR UPPER(COALESCE(shipping_status, '')) LIKE '%RETURN%'
    OR UPPER(COALESCE(shipping_status, '')) IN ('TO_RETURN','RETURN_REFUND','FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT','LOGISTICS_LOST')
  )`]
  const binds = []
  if (status === 'received') {
    clauses.push(`(COALESCE(return_received_at, '') != '' OR UPPER(COALESCE(shipping_status, '')) = 'LOGISTICS_RETURN_PACKAGE_RECEIVED')`)
  } else if (status === 'pending' || status === 'open') {
    clauses.push(`COALESCE(return_received_at, '') = ''`)
    clauses.push(`UPPER(COALESCE(shipping_status, '')) != 'LOGISTICS_RETURN_PACKAGE_RECEIVED'`)
  }
  if (search) {
    clauses.push(`(order_id LIKE ? OR tracking_number LIKE ?)`)
    binds.push(`%${search}%`, `%${search}%`)
  }
  const rowClauses = clauses.map(clause => clause
    .replace(/\boms_status\b/g, 'o.oms_status')
    .replace(/\border_type\b/g, 'o.order_type')
    .replace(/\bshipping_status\b/g, 'o.shipping_status')
    .replace(/\breturn_received_at\b/g, 'o.return_received_at')
    .replace(/\border_id\b/g, 'o.order_id')
    .replace(/\btracking_number\b/g, 'o.tracking_number'))

  const [summary, rows] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(return_received_at, '') = '' AND UPPER(COALESCE(shipping_status, '')) != 'LOGISTICS_RETURN_PACKAGE_RECEIVED' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN COALESCE(return_received_at, '') != '' OR UPPER(COALESCE(shipping_status, '')) = 'LOGISTICS_RETURN_PACKAGE_RECEIVED' THEN 1 ELSE 0 END) AS received
      FROM orders_v2
      WHERE ${clauses[0]}
    `).first(),
    env.DB.prepare(`
      SELECT o.order_id, o.platform, o.shop, o.oms_status, o.shipping_status, o.tracking_number, o.shipping_carrier,
             o.return_received_at, o.return_received_by, o.return_received_note,
             COALESCE(vid.packing_video_count, 0) AS packing_video_count,
             COALESCE(vid.latest_packing_video_url, '') AS latest_packing_video_url,
             COALESCE(vid.latest_packing_video_at, '') AS latest_packing_video_at,
             COALESCE(ol.storage_key, '') AS label_storage_key,
             COALESCE(ol.error, '') AS label_error
      FROM orders_v2 o
      LEFT JOIN (
        SELECT pv.order_id,
               pv.video_url AS latest_packing_video_url,
               pv.created_at AS latest_packing_video_at,
               (SELECT COUNT(*) FROM packing_videos cnt WHERE cnt.order_id = pv.order_id) AS packing_video_count
        FROM packing_videos pv
        WHERE pv.id = (
          SELECT pvi.id
          FROM packing_videos pvi
          WHERE pvi.order_id = pv.order_id
          ORDER BY datetime(pvi.created_at) DESC, pvi.id DESC
          LIMIT 1
        )
      ) vid ON vid.order_id = o.order_id
      LEFT JOIN order_labels ol ON ol.order_id = o.order_id
      WHERE ${rowClauses.join(' AND ')}
      ORDER BY
        CASE WHEN COALESCE(o.return_received_at, '') = '' THEN 0 ELSE 1 END,
        datetime(COALESCE(NULLIF(o.return_received_at, ''), NULLIF(o.oms_updated_at, ''), NULLIF(o.order_date, ''), '1970-01-01')) DESC,
        o.order_id DESC
      LIMIT ?
    `).bind(...binds, limit).all()
  ])

  return {
    status: 'ok',
    summary: {
      total: Number(summary?.total || 0),
      pending: Number(summary?.pending || 0),
      received: Number(summary?.received || 0)
    },
    rows: (rows.results || []).map(returnOrderPayload)
  }
}

const returnComplaintHandlers = createReturnComplaintHandlers({
  ensureReturnReceiveSchema,
  cleanText,
  compactJson,
  isConfirmedMarketplaceAction,
  returnLike,
  returnOrderPayload,
  findReturnOrderByScan,
  uploadShopeeReturnProof,
  queryShopeeReturnProof,
  fetchShopeeReturnDetail
});

const loadReturnComplaintEvidence = returnComplaintHandlers.loadReturnComplaintEvidence;
const listReturnComplaintCases = returnComplaintHandlers.listReturnComplaintCases;
const startReturnComplaint = returnComplaintHandlers.startReturnComplaint;
const refreshReturnComplaint = returnComplaintHandlers.refreshReturnComplaint;

async function receiveReturnByScan(env, options = {}) {
  await ensureReturnReceiveSchema(env)
  const scanCode = cleanText(options.code)
  if (!scanCode) return { status: 'error', error: 'Thiếu mã đơn hoặc mã vận đơn để quét nhận hoàn.' }
  const row = await findReturnOrderByScan(env, scanCode)
  if (!row) return { status: 'error', error: 'Không tìm thấy đơn theo mã vừa quét.', not_found: true }
  if (!returnLike(row)) {
    return {
      status: 'blocked',
      error: 'Đơn này chưa nằm trong luồng hoàn/trả hoặc giao lỗi, không tự xác nhận nhận hoàn.',
      order: returnOrderPayload(row)
    }
  }

  const operator = cleanText(options.operator) || 'Kho'
  const note = cleanText(options.note)
  const alreadyReceived = !!receivedLike(row)
  if (!alreadyReceived) {
    await env.DB.prepare(`
      UPDATE orders_v2
      SET oms_status = 'RETURN',
          order_type = 'return',
          shipping_status = 'LOGISTICS_RETURN_PACKAGE_RECEIVED',
          return_received_at = datetime('now', '+7 hours'),
          return_received_by = ?,
          return_received_note = ?,
          oms_updated_at = datetime('now', '+7 hours')
      WHERE order_id = ?
    `).bind(operator, note, row.order_id).run()
  }

  await env.DB.prepare(`
    INSERT INTO return_receive_scans
      (scan_code, order_id, platform, shop, tracking_number, operator, note, result_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    scanCode,
    row.order_id,
    row.platform || '',
    row.shop || '',
    row.tracking_number || '',
    operator,
    note,
    alreadyReceived ? 'already_received' : 'received'
  ).run()

  const updated = await findReturnOrderByScan(env, row.order_id)
  const evidence = await loadReturnComplaintEvidence(env, { code: row.order_id }).catch(() => null)
  return {
    status: 'ok',
    already_received: alreadyReceived,
    order: returnOrderPayload(updated || row),
    evidence: evidence?.status === 'ok' ? evidence : null,
    message: alreadyReceived ? 'Đơn này đã được xác nhận nhận hoàn trước đó.' : 'Đã xác nhận hàng hoàn về kho.'
  }
}

export async function handleReturns(request, env, cors) {
  const url = new URL(request.url)
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
  const body = await readBody(request)
  const options = pickOptions(url, body)

  if (url.pathname === '/api/returns/receive' ||
      url.pathname === '/api/returns/receive/list') {
    const result = await listReturnReceiveOrders(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/evidence' ||
      url.pathname === '/api/returns/complaint-evidence') {
    const result = await loadReturnComplaintEvidence(env, options)
    return json(result, cors, result.status === 'error' ? 404 : result.status === 'blocked' ? 409 : 200)
  }

  if (url.pathname === '/api/returns/complaints' ||
      url.pathname === '/api/returns/complaints/list') {
    const result = await listReturnComplaintCases(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && (
      url.pathname === '/api/returns/complaints/start' ||
      url.pathname === '/api/returns/complaints/submit')) {
    const result = await startReturnComplaint(env, options, url.origin)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && (
      url.pathname === '/api/returns/complaints/refresh' ||
      url.pathname === '/api/returns/complaints/check')) {
    const result = await refreshReturnComplaint(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && (
      url.pathname === '/api/returns/receive-scan' ||
      url.pathname === '/api/returns/receive/scan')) {
    const result = await receiveReturnByScan(env, options)
    return json(result, cors, result.status === 'error' ? 404 : result.status === 'blocked' ? 409 : 200)
  }

  if (url.pathname === '/api/returns' ||
      url.pathname === '/api/returns/shopee' ||
      url.pathname === '/api/returns/shopee/list' ||
      url.pathname === '/api/returns/shopee/get-return-list') {
    const result = await fetchShopeeReturnList(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/detail' ||
      url.pathname === '/api/returns/shopee/get-return-detail') {
    const result = await fetchShopeeReturnDetail(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/sync') {
    const result = await syncShopeeReturns(env, {
      ...options,
      hours: body.hours || body.last_hours || url.searchParams.get('hours') || url.searchParams.get('last_hours'),
      max_pages: body.max_pages || body.maxPages || url.searchParams.get('max_pages'),
      include_detail: body.include_detail ?? body.includeDetail ?? url.searchParams.get('include_detail')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/ledger' ||
      url.pathname === '/api/returns/summary') {
    const result = await loadReturnReverseLedgerSummary(env, {
      ...options,
      from: body.from || body.date_from || body.dateFrom || url.searchParams.get('from') || url.searchParams.get('date_from'),
      to: body.to || body.date_to || body.dateTo || url.searchParams.get('to') || url.searchParams.get('date_to')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/lazada/sync') {
    const result = await syncLazadaReverseOrders(env, {
      ...options,
      from: body.from || body.date_from || body.dateFrom || url.searchParams.get('from') || url.searchParams.get('date_from'),
      to: body.to || body.date_to || body.dateTo || url.searchParams.get('to') || url.searchParams.get('date_to'),
      days: body.days || url.searchParams.get('days'),
      max_pages: body.max_pages || body.maxPages || url.searchParams.get('max_pages'),
      include_fbl: body.include_fbl ?? body.includeFbl ?? url.searchParams.get('include_fbl'),
      include_detail: body.include_detail ?? body.includeDetail ?? url.searchParams.get('include_detail'),
      include_history: body.include_history ?? body.includeHistory ?? url.searchParams.get('include_history'),
      history_pages: body.history_pages || body.historyPages || url.searchParams.get('history_pages')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/impact' ||
      url.pathname === '/api/returns/shopee/profit-impact') {
    const result = await fetchShopeeReturnProfitImpact(env, {
      ...options,
      from: body.from || url.searchParams.get('from'),
      to: body.to || url.searchParams.get('to'),
      limit: body.limit || url.searchParams.get('limit')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/reverse-tracking' ||
      url.pathname === '/api/returns/shopee/get-reverse-tracking-info') {
    const result = await fetchShopeeReverseTrackingInfo(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/dispute-reasons' ||
      url.pathname === '/api/returns/shopee/get-return-dispute-reason') {
    const result = await fetchShopeeReturnDisputeReasons(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/available-solutions' ||
      url.pathname === '/api/returns/shopee/get-available-solutions') {
    const result = await fetchShopeeReturnAvailableSolutions(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/shipping-carrier' ||
      url.pathname === '/api/returns/shopee/get-shipping-carrier') {
    const result = await fetchShopeeReturnShippingCarrier(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/returns/shopee/proof' ||
      url.pathname === '/api/returns/shopee/query-proof') {
    const result = await queryShopeeReturnProof(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/api/returns/shopee/confirm') {
    const result = await confirmShopeeReturn(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/api/returns/shopee/offer') {
    const result = await offerShopeeReturn(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/api/returns/shopee/accept-offer') {
    const result = await acceptShopeeReturnOffer(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/api/returns/shopee/dispute') {
    const result = await disputeShopeeReturn(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/api/returns/shopee/cancel-dispute') {
    const result = await cancelShopeeReturnDispute(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/api/returns/shopee/upload-proof') {
    const result = await uploadShopeeReturnProof(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (request.method === 'POST' && url.pathname === '/api/returns/shopee/upload-shipping-proof') {
    const result = await uploadShopeeReturnShippingProof(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  return json({
    status: 'ok',
    module: 'returns',
    note: 'Core hoàn/trả đã tách riêng cho Shopee Returns và Lazada Reverse. Shop có API đi luồng API thật; shop không có API phải đi browser_sync, import_file_sync hoặc manual_reference. Các KPI tài chính chỉ nên dùng dữ liệu API hoặc file chuẩn hóa đã kiểm tra.',
    endpoints: [
      '/api/returns/shopee/list',
      '/api/returns/shopee/sync',
      '/api/returns/lazada/sync',
      '/api/returns/shopee/impact',
      '/api/returns/shopee/detail?return_sn=...',
      '/api/returns/shopee/reverse-tracking?return_sn=...',
      '/api/returns/shopee/dispute-reasons?return_sn=...',
      '/api/returns/shopee/available-solutions?return_sn=...',
      '/api/returns/shopee/shipping-carrier?return_sn=...',
      '/api/returns/shopee/proof?return_sn=...',
      'POST /api/returns/shopee/confirm',
      'POST /api/returns/shopee/offer',
      'POST /api/returns/shopee/accept-offer',
      'POST /api/returns/shopee/dispute',
      'POST /api/returns/shopee/cancel-dispute',
      'POST /api/returns/shopee/upload-proof',
      'POST /api/returns/shopee/upload-shipping-proof'
    ]
  }, cors)
}
