import {
  isReverseFinanceClosed,
  normalizeReverseLedgerKind,
  normalizeReverseLifecycleStatus
} from '../orders/status-core.js'
import { normalizeBangkokDateTime, nowBangkokText } from '../orders/time-core.js'

function cleanReturnText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function returnNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function cleanLedgerYmd(value) {
  const text = cleanReturnText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function compactReturnJson(value, fallback = '[]') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback)).slice(0, 20000)
  } catch {
    return fallback
  }
}

function uniqueTexts(values = []) {
  return [...new Set((values || []).map(cleanReturnText).filter(Boolean))]
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanReturnText(value)
    if (text) return text
  }
  return ''
}

async function ensureReturnReverseLedgerColumns(env) {
  const info = await env.DB.prepare(`PRAGMA table_info(marketplace_return_reverse_ledger)`).all()
  const existing = new Set((info.results || []).map(row => cleanReturnText(row.name)))
  const columns = [
    ['source_detail', `TEXT DEFAULT ''`],
    ['source_updated_at', `TEXT DEFAULT ''`]
  ]
  for (const [name, definition] of columns) {
    if (existing.has(name)) continue
    await env.DB.prepare(`ALTER TABLE marketplace_return_reverse_ledger ADD COLUMN ${name} ${definition}`).run()
  }
}

export async function ensureReturnReverseLedgerTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_return_reverse_ledger (
      ledger_key TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      order_id TEXT DEFAULT '',
      reverse_id TEXT DEFAULT '',
      reverse_line_id TEXT DEFAULT '',
      request_type TEXT DEFAULT '',
      ledger_kind TEXT DEFAULT 'return',
      reverse_status TEXT DEFAULT '',
      line_status TEXT DEFAULT '',
      normalized_status TEXT DEFAULT '',
      reason_code TEXT DEFAULT '',
      reason_text TEXT DEFAULT '',
      refund_amount REAL DEFAULT 0,
      effective_refund_amount REAL DEFAULT 0,
      currency TEXT DEFAULT '',
      item_sku TEXT DEFAULT '',
      item_sku_list_json TEXT DEFAULT '[]',
      tracking_number TEXT DEFAULT '',
      logistics_status TEXT DEFAULT '',
      reverse_logistics_status TEXT DEFAULT '',
      receiver_address TEXT DEFAULT '',
      seller_dispute INTEGER DEFAULT 0,
      is_finance_closed INTEGER DEFAULT 0,
      source_mode TEXT DEFAULT 'api_sync',
      source_detail TEXT DEFAULT '',
      source_updated_at TEXT DEFAULT '',
      created_at_bangkok TEXT DEFAULT '',
      updated_at_bangkok TEXT DEFAULT '',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      detail_json TEXT DEFAULT '{}',
      history_json TEXT DEFAULT '[]',
      raw_data TEXT DEFAULT '{}'
    )
  `).run()
  await ensureReturnReverseLedgerColumns(env)
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_return_reverse_order
    ON marketplace_return_reverse_ledger(platform, order_id)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_return_reverse_shop
    ON marketplace_return_reverse_ledger(platform, shop, updated_at_bangkok)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_return_reverse_reverse
    ON marketplace_return_reverse_ledger(platform, reverse_id, reverse_line_id)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_return_reverse_lifecycle
    ON marketplace_return_reverse_ledger(platform, normalized_status, is_finance_closed)
  `).run()
}

export function buildShopeeReturnLedgerRows(entry = {}) {
  const reverseId = cleanReturnText(entry.return_sn)
  if (!reverseId) return []
  const itemSkus = uniqueTexts((entry.items || []).flatMap(item => [
    item?.model_sku,
    item?.variation_sku,
    item?.item_sku,
    item?.seller_sku,
    item?.sku
  ]))
  const reverseStatus = firstText(entry.status, entry.reverse_logistic_status, entry.logistics_status)
  const lineStatus = firstText(entry.logistics_status, entry.reverse_logistic_status)
  const ledgerKind = normalizeReverseLedgerKind({
    platform: 'shopee',
    request_type: entry.return_refund_request_type || entry.return_solution,
    reverse_status: reverseStatus,
    line_status: lineStatus,
    reason_text: entry.text_reason || entry.reason
  })
  const financeClosed = isReverseFinanceClosed({
    platform: 'shopee',
    reverse_status: reverseStatus,
    line_status: lineStatus,
    request_type: entry.return_refund_request_type || entry.return_solution
  })
  const refundAmount = returnNumber(entry.refund_amount)
  return [{
    ledger_key: `shopee:${reverseId}`,
    platform: 'shopee',
    shop: cleanReturnText(entry.shop),
    api_shop_id: cleanReturnText(entry.api_shop_id),
    order_id: cleanReturnText(entry.order_sn),
    reverse_id: reverseId,
    reverse_line_id: '',
    request_type: firstText(entry.return_refund_request_type, entry.return_solution, entry.return_refund_type),
    ledger_kind: ledgerKind,
    reverse_status: reverseStatus,
    line_status: lineStatus,
    normalized_status: normalizeReverseLifecycleStatus('shopee', reverseStatus, lineStatus),
    reason_code: cleanReturnText(entry.reason),
    reason_text: firstText(entry.text_reason, entry.reassessed_request_reason, entry.reason),
    refund_amount: refundAmount,
    effective_refund_amount: financeClosed ? refundAmount : 0,
    currency: cleanReturnText(entry.currency || 'VND'),
    item_sku: itemSkus.length === 1 ? itemSkus[0] : '',
    item_sku_list_json: compactReturnJson(itemSkus, '[]'),
    tracking_number: cleanReturnText(entry.tracking_number),
    logistics_status: cleanReturnText(entry.logistics_status),
    reverse_logistics_status: cleanReturnText(entry.reverse_logistic_status),
    receiver_address: '',
    seller_dispute: cleanReturnText(entry.negotiation_status).toUpperCase().includes('DISPUTE') ? 1 : 0,
    is_finance_closed: financeClosed ? 1 : 0,
    source_mode: 'api_sync',
    source_detail: 'shopee.returns.get_return_list/get_return_detail',
    source_updated_at: normalizeBangkokDateTime(entry.update_time_at || entry.update_time),
    created_at_bangkok: normalizeBangkokDateTime(entry.create_time_at || entry.create_time),
    updated_at_bangkok: normalizeBangkokDateTime(entry.update_time_at || entry.update_time),
    synced_at: nowBangkokText(),
    detail_json: compactReturnJson({
      items: entry.items || [],
      images: entry.images || [],
      buyer_videos: entry.buyer_videos || []
    }, '{}'),
    history_json: '[]',
    raw_data: compactReturnJson(entry.raw || entry, '{}')
  }]
}

function matchLazadaDetailLine(detailLines = [], line = {}) {
  const reverseLineId = cleanReturnText(line.reverse_order_line_id)
  const tradeOrderLineId = cleanReturnText(line.trade_order_line_id)
  return detailLines.find(item => {
    return cleanReturnText(item.reverse_order_line_id) === reverseLineId
      || (tradeOrderLineId && cleanReturnText(item.trade_order_line_id) === tradeOrderLineId)
    })
}

export function buildLazadaReverseLedgerRows({
  shop = {},
  reverseRows = [],
  reverseDetails = new Map(),
  reverseHistories = new Map(),
  reverseFblRows = new Map()
} = {}) {
  const rows = []
  for (const reverseRow of reverseRows || []) {
    const reverseId = cleanReturnText(reverseRow.reverse_order_id)
    const detail = reverseDetails.get(reverseId) || {}
    const detailLines = Array.isArray(detail.reverseOrderLineDTOList)
      ? detail.reverseOrderLineDTOList
      : Array.isArray(detail.reverse_order_lines)
        ? detail.reverse_order_lines
        : []
    const listLines = Array.isArray(reverseRow.reverse_order_lines) ? reverseRow.reverse_order_lines : []
    // Một số phản hồi Lazada chỉ trả line ở endpoint detail; vẫn phải ghi ledger để Profit không bỏ sót hoàn tiền.
    const lines = listLines.length ? listLines : (detailLines.length ? detailLines : [reverseRow])
    const fblData = reverseFblRows.get(cleanReturnText(reverseRow.trade_order_id)) || null
    for (const line of lines) {
      const detailLine = matchLazadaDetailLine(detailLines, line) || {}
      const reverseLineId = cleanReturnText(line.reverse_order_line_id || detailLine.reverse_order_line_id)
      if (!reverseLineId && !reverseId) continue
      const reverseStatus = firstText(detailLine.reverse_status, line.reverse_status, detail.reverse_status)
      const lineStatus = firstText(detailLine.ofc_status, line.ofc_status, detail.ofc_status)
      const requestType = firstText(detailLine.request_type, line.request_type, detail.request_type, reverseRow.request_type)
      const financeClosed = isReverseFinanceClosed({
        platform: 'lazada',
        reverse_status: reverseStatus,
        line_status: lineStatus,
        request_type: requestType
      })
      const itemSku = firstText(
        line.seller_sku_id,
        detailLine.seller_sku_id,
        line.product?.product_sku,
        detailLine.productDTO?.sku,
        line.platform_sku_id,
        detailLine.platform_sku_id
      )
      const historyRows = reverseHistories.get(reverseLineId) || []
      const refundAmount = returnNumber(firstText(detailLine.refund_amount, line.refund_amount, detail.refund_amount, reverseRow.refund_amount))
      rows.push({
        ledger_key: `lazada:${reverseId}:${reverseLineId || 'header'}`,
        platform: 'lazada',
        shop: cleanReturnText(shop.shop_name || shop.user_name || shop.shop),
        api_shop_id: cleanReturnText(shop.api_shop_id),
        order_id: cleanReturnText(firstText(detailLine.trade_order_id, line.trade_order_id, detail.trade_order_id, reverseRow.trade_order_id)),
        reverse_id: reverseId,
        reverse_line_id: reverseLineId,
        request_type: requestType,
        ledger_kind: normalizeReverseLedgerKind({
          platform: 'lazada',
          request_type: requestType,
          reverse_status: reverseStatus,
          line_status: lineStatus,
          reason_text: firstText(detailLine.reason_text, line.reason_text)
        }),
        reverse_status: reverseStatus,
        line_status: lineStatus,
        normalized_status: normalizeReverseLifecycleStatus('lazada', reverseStatus, lineStatus),
        reason_code: cleanReturnText(firstText(detailLine.reason_code, line.reason_code)),
        reason_text: firstText(detailLine.reason_text, line.reason_text),
        refund_amount: refundAmount,
        effective_refund_amount: financeClosed ? refundAmount : 0,
        currency: 'VND',
        item_sku: itemSku,
        item_sku_list_json: compactReturnJson(uniqueTexts([itemSku]), '[]'),
        tracking_number: firstText(detailLine.tracking_number, line.tracking_number),
        logistics_status: lineStatus,
        reverse_logistics_status: reverseStatus,
        receiver_address: firstText(detailLine.receiver_address, line.receiver_address),
        seller_dispute: String(firstText(detailLine.is_dispute, line.is_dispute)).toLowerCase() === 'true' ? 1 : 0,
        is_finance_closed: financeClosed ? 1 : 0,
        source_mode: 'api_sync',
        source_detail: 'lazada.reverse.getreverseordersforseller/detail/history',
        source_updated_at: normalizeBangkokDateTime(firstText(detailLine.return_order_line_gmt_modified, line.return_order_line_gmt_modified)),
        created_at_bangkok: normalizeBangkokDateTime(firstText(detailLine.return_order_line_gmt_create, line.return_order_line_gmt_create, detail.trade_order_gmt_create)),
        updated_at_bangkok: normalizeBangkokDateTime(firstText(detailLine.return_order_line_gmt_modified, line.return_order_line_gmt_modified)),
        synced_at: nowBangkokText(),
        detail_json: compactReturnJson({
          reverse_detail: detail,
          reverse_line: detailLine,
          fbl: fblData
        }, '{}'),
        history_json: compactReturnJson(historyRows, '[]'),
        raw_data: compactReturnJson({ reverse: reverseRow, line }, '{}')
      })
    }
  }
  return rows
}

export async function saveReturnReverseLedgerRows(env, rows = []) {
  const ledgerRows = (rows || []).filter(row => cleanReturnText(row.ledger_key))
  if (!ledgerRows.length) return 0
  await ensureReturnReverseLedgerTable(env)
  let saved = 0
  for (let i = 0; i < ledgerRows.length; i += 50) {
    const chunk = ledgerRows.slice(i, i + 50)
    await env.DB.batch(chunk.map(row => env.DB.prepare(`
      INSERT INTO marketplace_return_reverse_ledger (
        ledger_key, platform, shop, api_shop_id, order_id, reverse_id, reverse_line_id,
        request_type, ledger_kind, reverse_status, line_status, normalized_status,
        reason_code, reason_text, refund_amount, effective_refund_amount, currency,
        item_sku, item_sku_list_json, tracking_number, logistics_status,
        reverse_logistics_status, receiver_address, seller_dispute, is_finance_closed,
        source_mode, source_detail, source_updated_at,
        created_at_bangkok, updated_at_bangkok, synced_at,
        detail_json, history_json, raw_data
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(ledger_key) DO UPDATE SET
        platform = excluded.platform,
        shop = excluded.shop,
        api_shop_id = excluded.api_shop_id,
        order_id = excluded.order_id,
        reverse_id = excluded.reverse_id,
        reverse_line_id = excluded.reverse_line_id,
        request_type = excluded.request_type,
        ledger_kind = excluded.ledger_kind,
        reverse_status = excluded.reverse_status,
        line_status = excluded.line_status,
        normalized_status = excluded.normalized_status,
        reason_code = excluded.reason_code,
        reason_text = excluded.reason_text,
        refund_amount = excluded.refund_amount,
        effective_refund_amount = excluded.effective_refund_amount,
        currency = excluded.currency,
        item_sku = excluded.item_sku,
        item_sku_list_json = excluded.item_sku_list_json,
        tracking_number = excluded.tracking_number,
        logistics_status = excluded.logistics_status,
        reverse_logistics_status = excluded.reverse_logistics_status,
        receiver_address = excluded.receiver_address,
        seller_dispute = excluded.seller_dispute,
        is_finance_closed = excluded.is_finance_closed,
        source_mode = excluded.source_mode,
        source_detail = excluded.source_detail,
        source_updated_at = excluded.source_updated_at,
        created_at_bangkok = excluded.created_at_bangkok,
        updated_at_bangkok = excluded.updated_at_bangkok,
        synced_at = excluded.synced_at,
        detail_json = excluded.detail_json,
        history_json = excluded.history_json,
        raw_data = excluded.raw_data
    `).bind(
      row.ledger_key,
      row.platform || '',
      row.shop || '',
      row.api_shop_id || '',
      row.order_id || '',
      row.reverse_id || '',
      row.reverse_line_id || '',
      row.request_type || '',
      row.ledger_kind || 'return',
      row.reverse_status || '',
      row.line_status || '',
      row.normalized_status || '',
      row.reason_code || '',
      row.reason_text || '',
      returnNumber(row.refund_amount),
      returnNumber(row.effective_refund_amount),
      row.currency || '',
      row.item_sku || '',
      row.item_sku_list_json || '[]',
      row.tracking_number || '',
      row.logistics_status || '',
      row.reverse_logistics_status || '',
      row.receiver_address || '',
      Number(row.seller_dispute || 0) || 0,
      Number(row.is_finance_closed || 0) || 0,
      row.source_mode || 'api_sync',
      row.source_detail || '',
      row.source_updated_at || '',
      row.created_at_bangkok || '',
      row.updated_at_bangkok || '',
      row.synced_at || nowBangkokText(),
      row.detail_json || '{}',
      row.history_json || '[]',
      row.raw_data || '{}'
    )))
    saved += chunk.length
  }
  return saved
}

export async function loadReturnReverseOrderMap(env, options = {}) {
  await ensureReturnReverseLedgerTable(env)
  const conds = [`TRIM(COALESCE(order_id, '')) != ''`]
  const params = []
  const platform = cleanReturnText(options.platform).toLowerCase()
  if (platform) {
    conds.push(`LOWER(COALESCE(platform, '')) = ?`)
    params.push(platform)
  }
  const rows = await env.DB.prepare(`
    SELECT platform,
           order_id,
           SUM(COALESCE(effective_refund_amount, 0)) AS refund_amount,
           GROUP_CONCAT(DISTINCT COALESCE(NULLIF(reason_text, ''), NULLIF(reason_code, ''), 'return')) AS refund_reason,
           GROUP_CONCAT(DISTINCT COALESCE(NULLIF(reverse_status, ''), NULLIF(line_status, ''), normalized_status, '')) AS return_status,
           GROUP_CONCAT(DISTINCT COALESCE(NULLIF(ledger_kind, ''), 'return')) AS ledger_kind,
           MAX(CASE WHEN is_finance_closed = 1 THEN 1 ELSE 0 END) AS has_finance_closed,
           MAX(COALESCE(updated_at_bangkok, created_at_bangkok, synced_at)) AS last_updated
    FROM marketplace_return_reverse_ledger
    WHERE ${conds.join(' AND ')}
    GROUP BY platform, order_id
  `).bind(...params).all()
  return new Map((rows.results || []).map(row => [
    `${cleanReturnText(row.platform).toLowerCase()}|${cleanReturnText(row.order_id)}`,
    row
  ]))
}

function buildLedgerFilter(options = {}, alias = '') {
  const prefix = alias ? `${alias}.` : ''
  const conds = [`1=1`]
  const params = []
  const platform = cleanReturnText(options.platform).toLowerCase()
  const shop = cleanReturnText(options.shop)
  const lifecycle = cleanReturnText(options.lifecycle || options.normalized_status).toLowerCase()
  const from = cleanLedgerYmd(options.from || options.date_from || options.dateFrom)
  const to = cleanLedgerYmd(options.to || options.date_to || options.dateTo)
  const updatedExpr = `date(COALESCE(NULLIF(${prefix}updated_at_bangkok, ''), NULLIF(${prefix}created_at_bangkok, ''), ${prefix}synced_at))`
  if (platform) {
    conds.push(`LOWER(COALESCE(${prefix}platform, '')) = ?`)
    params.push(platform)
  }
  if (shop) {
    conds.push(`${prefix}shop = ?`)
    params.push(shop)
  }
  if (lifecycle) {
    conds.push(`LOWER(COALESCE(${prefix}normalized_status, '')) = ?`)
    params.push(lifecycle)
  }
  if (from) {
    conds.push(`${updatedExpr} >= ?`)
    params.push(from)
  }
  if (to) {
    conds.push(`${updatedExpr} <= ?`)
    params.push(to)
  }
  return { where: conds.join(' AND '), params }
}

export async function loadReturnReverseLedgerSummary(env, options = {}) {
  await ensureReturnReverseLedgerTable(env)
  const limit = Math.min(Math.max(Number(options.limit || 20) || 20, 1), 200)
  const { where, params } = buildLedgerFilter(options)
  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS ledger_rows,
      COUNT(DISTINCT CASE WHEN TRIM(COALESCE(order_id, '')) != '' THEN LOWER(COALESCE(platform, '')) || '|' || order_id END) AS affected_orders,
      COUNT(DISTINCT CASE WHEN is_finance_closed = 1 AND TRIM(COALESCE(order_id, '')) != '' THEN LOWER(COALESCE(platform, '')) || '|' || order_id END) AS closed_orders,
      SUM(COALESCE(refund_amount, 0)) AS refund_amount,
      SUM(COALESCE(effective_refund_amount, 0)) AS effective_refund_amount,
      SUM(CASE WHEN normalized_status = 'open' THEN 1 ELSE 0 END) AS open_rows,
      SUM(CASE WHEN normalized_status = 'closed' THEN 1 ELSE 0 END) AS closed_rows,
      SUM(CASE WHEN normalized_status = 'dispute' THEN 1 ELSE 0 END) AS dispute_rows,
      SUM(CASE WHEN normalized_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_rows,
      MAX(COALESCE(NULLIF(updated_at_bangkok, ''), NULLIF(created_at_bangkok, ''), synced_at)) AS last_updated
    FROM marketplace_return_reverse_ledger
    WHERE ${where}
  `).bind(...params).first()

  const byPlatform = await env.DB.prepare(`
    SELECT
      platform,
      COUNT(*) AS ledger_rows,
      COUNT(DISTINCT CASE WHEN TRIM(COALESCE(order_id, '')) != '' THEN order_id END) AS affected_orders,
      SUM(COALESCE(effective_refund_amount, 0)) AS effective_refund_amount,
      SUM(CASE WHEN is_finance_closed = 1 THEN 1 ELSE 0 END) AS closed_rows,
      MAX(COALESCE(NULLIF(updated_at_bangkok, ''), NULLIF(created_at_bangkok, ''), synced_at)) AS last_updated
    FROM marketplace_return_reverse_ledger
    WHERE ${where}
    GROUP BY platform
    ORDER BY effective_refund_amount DESC, ledger_rows DESC
  `).bind(...params).all()

  const byShop = await env.DB.prepare(`
    SELECT
      platform,
      shop,
      COUNT(*) AS ledger_rows,
      COUNT(DISTINCT CASE WHEN TRIM(COALESCE(order_id, '')) != '' THEN order_id END) AS affected_orders,
      SUM(COALESCE(effective_refund_amount, 0)) AS effective_refund_amount,
      SUM(CASE WHEN is_finance_closed = 1 THEN 1 ELSE 0 END) AS closed_rows,
      MAX(COALESCE(NULLIF(updated_at_bangkok, ''), NULLIF(created_at_bangkok, ''), synced_at)) AS last_updated
    FROM marketplace_return_reverse_ledger
    WHERE ${where}
    GROUP BY platform, shop
    ORDER BY effective_refund_amount DESC, ledger_rows DESC
    LIMIT 60
  `).bind(...params).all()

  const recent = await env.DB.prepare(`
    SELECT
      ledger_key,
      platform,
      shop,
      api_shop_id,
      order_id,
      reverse_id,
      reverse_line_id,
      request_type,
      ledger_kind,
      normalized_status,
      reverse_status,
      line_status,
      reason_code,
      reason_text,
      refund_amount,
      effective_refund_amount,
      item_sku,
      tracking_number,
      seller_dispute,
      is_finance_closed,
      source_mode,
      source_detail,
      source_updated_at,
      COALESCE(NULLIF(updated_at_bangkok, ''), NULLIF(created_at_bangkok, ''), synced_at) AS last_updated
    FROM marketplace_return_reverse_ledger
    WHERE ${where}
    ORDER BY COALESCE(NULLIF(updated_at_bangkok, ''), NULLIF(created_at_bangkok, ''), synced_at) DESC
    LIMIT ${limit}
  `).bind(...params).all()

  return {
    status: 'ok',
    mode: 'return_reverse_ledger_summary',
    source: 'marketplace_return_reverse_ledger',
    note: 'Ledger hoàn/trả là nguồn chung cho Dashboard, Profit và Order Analytics. Chỉ dòng is_finance_closed=1 mới được trừ vào lãi ròng.',
    filters: {
      platform: cleanReturnText(options.platform).toLowerCase(),
      shop: cleanReturnText(options.shop),
      lifecycle: cleanReturnText(options.lifecycle || options.normalized_status).toLowerCase(),
      from: cleanLedgerYmd(options.from || options.date_from || options.dateFrom),
      to: cleanLedgerYmd(options.to || options.date_to || options.dateTo),
      limit
    },
    summary: {
      ledger_rows: Number(summary?.ledger_rows || 0),
      affected_orders: Number(summary?.affected_orders || 0),
      closed_orders: Number(summary?.closed_orders || 0),
      refund_amount: returnNumber(summary?.refund_amount),
      effective_refund_amount: returnNumber(summary?.effective_refund_amount),
      open_rows: Number(summary?.open_rows || 0),
      closed_rows: Number(summary?.closed_rows || 0),
      dispute_rows: Number(summary?.dispute_rows || 0),
      cancelled_rows: Number(summary?.cancelled_rows || 0),
      last_updated: cleanReturnText(summary?.last_updated)
    },
    by_platform: byPlatform.results || [],
    by_shop: byShop.results || [],
    recent: recent.results || []
  }
}
