import { getShopeeAppFromRow, signHmacHex } from '../../utils/shopee-apps.js'
import { getApiShops } from '../api-sync.js'
import { buildCarrierAnalytics, firstText, trackingSummary, ymdFromTimestamp } from './carrier-analytics.js'

const SHOPEE_ORDER_DETAIL_PATH = '/api/v2/order/get_order_detail'
const SHOPEE_ORDER_LIST_PATH = '/api/v2/order/get_order_list'
const SHOPEE_SHIPMENT_LIST_PATH = '/api/v2/order/get_shipment_list'
const SHOPEE_SET_NOTE_PATH = '/api/v2/order/set_note'
const SHOPEE_HANDLE_BUYER_CANCELLATION_PATH = '/api/v2/order/handle_buyer_cancellation'
const SHOPEE_BUYER_INVOICE_INFO_PATH = '/api/v2/order/get_buyer_invoice_info'
const SHOPEE_UPLOAD_INVOICE_DOC_PATH = '/api/v2/order/upload_invoice_doc'
const SHOPEE_GET_SHIPPING_PARAMETER_PATH = '/api/v2/logistics/get_shipping_parameter'
const SHOPEE_SHIP_ORDER_PATH = '/api/v2/logistics/ship_order'
const SHOPEE_MASS_SHIP_ORDER_PATH = '/api/v2/logistics/mass_ship_order'
const SHOPEE_GET_PACKAGE_DETAIL_PATH = '/api/v2/logistics/get_package_detail'
const SHOPEE_SPLIT_ORDER_PATH = '/api/v2/logistics/split_order'
const SHOPEE_GET_TRACKING_NUMBER_PATH = '/api/v2/logistics/get_tracking_number'
const SHOPEE_GET_TRACKING_INFO_PATH = '/api/v2/logistics/get_tracking_info'
const SHOPEE_GET_ADDRESS_LIST_PATH = '/api/v2/logistics/get_address_list'
const SHOPEE_SET_ADDRESS_CONFIG_PATH = '/api/v2/logistics/set_address_config'
const SHOPEE_UPDATE_OPERATING_HOURS_PATH = '/api/v2/logistics/update_operating_hours'

const OPERATIONS_CONFIRM_TEXT = 'TOI_HIEU_DAY_LA_THAO_TAC_VAN_HANH_SHOPEE'

const READ_ACTIONS = {
  get_order_list: { endpoint: SHOPEE_ORDER_LIST_PATH, method: 'GET' },
  get_order_detail: { endpoint: SHOPEE_ORDER_DETAIL_PATH, method: 'GET' },
  get_shipment_list: { endpoint: SHOPEE_SHIPMENT_LIST_PATH, method: 'GET' },
  get_shipping_parameter: { endpoint: SHOPEE_GET_SHIPPING_PARAMETER_PATH, method: 'GET' },
  get_package_detail: { endpoint: SHOPEE_GET_PACKAGE_DETAIL_PATH, method: 'GET' },
  get_tracking_number: { endpoint: SHOPEE_GET_TRACKING_NUMBER_PATH, method: 'GET' },
  get_tracking_info: { endpoint: SHOPEE_GET_TRACKING_INFO_PATH, method: 'GET' },
  get_address_list: { endpoint: SHOPEE_GET_ADDRESS_LIST_PATH, method: 'GET' },
  get_buyer_invoice_info: { endpoint: SHOPEE_BUYER_INVOICE_INFO_PATH, method: 'GET' }
}

const WRITE_ACTIONS = {
  ship_order: { endpoint: SHOPEE_SHIP_ORDER_PATH, method: 'POST' },
  mass_ship_order: { endpoint: SHOPEE_MASS_SHIP_ORDER_PATH, method: 'POST' },
  split_order: { endpoint: SHOPEE_SPLIT_ORDER_PATH, method: 'POST' },
  set_address_config: { endpoint: SHOPEE_SET_ADDRESS_CONFIG_PATH, method: 'POST' },
  update_operating_hours: { endpoint: SHOPEE_UPDATE_OPERATING_HOURS_PATH, method: 'POST' },
  handle_buyer_cancellation: { endpoint: SHOPEE_HANDLE_BUYER_CANCELLATION_PATH, method: 'POST' },
  set_note: { endpoint: SHOPEE_SET_NOTE_PATH, method: 'POST' },
  upload_invoice_doc: { endpoint: SHOPEE_UPLOAD_INVOICE_DOC_PATH, method: 'POST' }
}

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na'].includes(lower)) return ''
  return text
}

function num(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function compactJson(value, max = 50000) {
  const text = JSON.stringify(value ?? {})
  return text.length > max ? text.slice(0, max) : text
}

function signedShopeeUrl(app, path, accessToken, shopId) {
  return async (params = {}) => {
    const timestamp = Math.floor(Date.now() / 1000)
    const partnerId = String(app.partnerId || '')
    const sid = String(shopId || '')
    const token = String(accessToken || '')
    const base = `${partnerId}${path}${timestamp}${token}${sid}`
    const sign = await signHmacHex(app.partnerKey, base)
    const url = new URL(`https://partner.shopeemobile.com${path}`)
    url.searchParams.set('partner_id', partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('access_token', token)
    url.searchParams.set('shop_id', sid)
    url.searchParams.set('sign', sign)
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}

async function fetchShopeeJson(buildUrl, params = {}) {
  const url = await buildUrl(params)
  const res = await fetch(url)
  const text = await res.text()
  let data = {}
  try { data = JSON.parse(text) } catch { data = { raw_text: text } }
  if (!res.ok || data.error) throw new Error(data.message || data.error || `Shopee HTTP ${res.status}`)
  return data
}

async function postShopeeJson(buildUrl, params = {}, body = {}) {
  const url = await buildUrl(params)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const text = await res.text()
  let data = {}
  try { data = JSON.parse(text) } catch { data = { raw_text: text } }
  if (!res.ok || data.error) throw new Error(data.message || data.error || `Shopee HTTP ${res.status}`)
  return data
}

async function ensureShopeeOperationTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS shopee_operation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      order_sn TEXT DEFAULT '',
      action TEXT DEFAULT '',
      endpoint TEXT DEFAULT '',
      payload TEXT DEFAULT '{}',
      dry_run INTEGER DEFAULT 1,
      sent_to_shopee INTEGER DEFAULT 0,
      response TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_shopee_operation_actions_order
    ON shopee_operation_actions(order_sn, action, created_at)
  `).run()
}

async function saveOperationAction(env, row) {
  await ensureShopeeOperationTables(env)
  await env.DB.prepare(`
    INSERT INTO shopee_operation_actions (
      shop, api_shop_id, order_sn, action, endpoint, payload, dry_run, sent_to_shopee, response, created_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
  `).bind(
    row.shop || '',
    row.api_shop_id || '',
    row.order_sn || '',
    row.action || '',
    row.endpoint || '',
    compactJson(row.payload || {}, 50000),
    row.dry_run ? 1 : 0,
    row.sent_to_shopee ? 1 : 0,
    compactJson(row.response || row.result || {}, 50000)
  ).run()
}

async function loadLocalOperationOrders(env, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 20) || 20, 1), 80)
  const shop = cleanText(options.shop)
  const status = cleanText(options.status || 'PENDING').toUpperCase()
  const search = cleanText(options.search)
  const conds = ["LOWER(o.platform) = 'shopee'"]
  const params = []
  if (shop) {
    conds.push('(o.shop = ? OR o.shop LIKE ?)')
    params.push(shop, `%${shop}%`)
  }
  if (status && status !== 'ALL') {
    conds.push('(UPPER(COALESCE(o.oms_status, "")) = ? OR UPPER(COALESCE(o.shipping_status, "")) = ?)')
    params.push(status, status)
  }
  if (search) {
    conds.push('(o.order_id LIKE ? OR o.customer_name LIKE ? OR o.tracking_number LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  const where = conds.join(' AND ')
  const orders = await env.DB.prepare(`
    SELECT o.order_id, o.shop, o.order_date, o.revenue, o.oms_status, o.shipping_status,
           o.shipping_carrier, o.tracking_number, o.customer_name, o.cancel_reason,
           COUNT(oi.id) AS line_count,
           SUM(COALESCE(oi.qty, 0)) AS qty_total
    FROM orders_v2 o
    LEFT JOIN order_items oi ON oi.order_id = o.order_id
    WHERE ${where}
    GROUP BY o.order_id
    ORDER BY datetime(COALESCE(o.oms_updated_at, o.order_date)) DESC, o.order_id DESC
    LIMIT ?
  `).bind(...params, limit).all()

  const rows = orders.results || []
  if (!rows.length) return []
  const ids = rows.map(row => row.order_id)
  const marks = ids.map(() => '?').join(',')
  const items = await env.DB.prepare(`
    SELECT order_id, sku, variation_name, product_name, qty, revenue_line, cost_real
    FROM order_items
    WHERE order_id IN (${marks})
    ORDER BY order_id, id
  `).bind(...ids).all()
  const byOrder = new Map()
  for (const item of items.results || []) {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, [])
    byOrder.get(item.order_id).push(item)
  }

  return rows.map(row => ({
    ...row,
    items: byOrder.get(row.order_id) || []
  }))
}

function buildPickList(orders = []) {
  const bySku = new Map()
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = cleanText(item.sku || item.variation_name || item.product_name) || 'UNKNOWN'
      if (!bySku.has(key)) {
        bySku.set(key, {
          sku: cleanText(item.sku),
          product_name: cleanText(item.product_name),
          variation_name: cleanText(item.variation_name),
          qty: 0,
          orders: 0,
          order_sns: []
        })
      }
      const row = bySku.get(key)
      row.qty += num(item.qty)
      if (!row.order_sns.includes(order.order_id)) {
        row.order_sns.push(order.order_id)
        row.orders += 1
      }
    }
  }
  return [...bySku.values()].sort((a, b) => b.qty - a.qty || a.product_name.localeCompare(b.product_name))
}

function shopeeShopForLocalOrder(shops = [], order = {}) {
  const localShop = cleanText(order.shop).toLowerCase()
  return shops.find(shop => {
    const names = [shop.shop_name, shop.user_name, shop.api_shop_id].map(value => cleanText(value).toLowerCase()).filter(Boolean)
    return names.includes(localShop)
  }) || shops[0]
}

async function readShopeeOrderSignals(env, shop, order, options = {}) {
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
  const detailUrl = signedShopeeUrl(app, SHOPEE_ORDER_DETAIL_PATH, shop.access_token, shop.api_shop_id)
  const shippingUrl = signedShopeeUrl(app, SHOPEE_GET_SHIPPING_PARAMETER_PATH, shop.access_token, shop.api_shop_id)
  const packageUrl = signedShopeeUrl(app, SHOPEE_GET_PACKAGE_DETAIL_PATH, shop.access_token, shop.api_shop_id)
  const trackingNumberUrl = signedShopeeUrl(app, SHOPEE_GET_TRACKING_NUMBER_PATH, shop.access_token, shop.api_shop_id)
  const trackingInfoUrl = signedShopeeUrl(app, SHOPEE_GET_TRACKING_INFO_PATH, shop.access_token, shop.api_shop_id)
  const invoiceUrl = signedShopeeUrl(app, SHOPEE_BUYER_INVOICE_INFO_PATH, shop.access_token, shop.api_shop_id)
  const signals = {
    order_sn: order.order_id,
    shop: shop.shop_name || order.shop,
    api_shop_id: String(shop.api_shop_id || ''),
    detail: null,
    shipping_parameter: null,
    package_detail: null,
    tracking_number: '',
    tracking_info: null,
    tracking_summary: null,
    buyer_invoice_info: null,
    package_number: '',
    warnings: []
  }
  try {
    const detail = await fetchShopeeJson(detailUrl, {
      order_sn_list: order.order_id,
      response_optional_fields: 'buyer_user_id,recipient_address,item_list,package_list,shipping_carrier,checkout_shipping_carrier,order_status,pay_time,ship_by_date,note'
    })
    const detailOrder = detail?.response?.order_list?.[0] || {}
    signals.detail = {
      order_status: detailOrder.order_status || '',
      shipping_carrier: detailOrder.shipping_carrier || detailOrder.checkout_shipping_carrier || '',
      item_count: Array.isArray(detailOrder.item_list) ? detailOrder.item_list.length : 0,
      package_count: Array.isArray(detailOrder.package_list) ? detailOrder.package_list.length : 0,
      create_date: ymdFromTimestamp(detailOrder.create_time),
      pay_date: ymdFromTimestamp(detailOrder.pay_time),
      ship_by_date: ymdFromTimestamp(detailOrder.ship_by_date)
    }
    signals.package_number = cleanText(detailOrder.package_list?.[0]?.package_number)
  } catch (error) {
    signals.warnings.push({ endpoint: SHOPEE_ORDER_DETAIL_PATH, message: error.message })
  }

  try {
    const data = await fetchShopeeJson(shippingUrl, { order_sn: order.order_id })
    signals.shipping_parameter = data?.response || data
  } catch (error) {
    signals.warnings.push({ endpoint: SHOPEE_GET_SHIPPING_PARAMETER_PATH, message: error.message })
  }

  const includePackageDetail = String(options.include_package_detail ?? options.includePackageDetail ?? '0') === '1'
  if (signals.package_number && includePackageDetail) {
    try {
      const data = await fetchShopeeJson(packageUrl, { order_sn: order.order_id, package_number: signals.package_number })
      signals.package_detail = data?.response || data
    } catch (error) {
      signals.warnings.push({ endpoint: SHOPEE_GET_PACKAGE_DETAIL_PATH, message: error.message })
    }
  }

  if (signals.package_number && !cleanText(order.tracking_number)) {
    try {
      const data = await fetchShopeeJson(trackingNumberUrl, { order_sn: order.order_id, package_number: signals.package_number })
      signals.tracking_number = firstText(data?.response?.tracking_number, data?.response?.tracking_no, data?.tracking_number)
    } catch (error) {
      signals.warnings.push({ endpoint: SHOPEE_GET_TRACKING_NUMBER_PATH, message: error.message })
    }
  } else {
    signals.tracking_number = cleanText(order.tracking_number)
  }

  if (String(options.include_tracking ?? options.includeTracking ?? '1') !== '0') {
    try {
      const params = { order_sn: order.order_id }
      if (signals.package_number) params.package_number = signals.package_number
      const data = await fetchShopeeJson(trackingInfoUrl, params)
      signals.tracking_info = data?.response || data
      signals.tracking_summary = trackingSummary(data)
      if (!signals.tracking_number) signals.tracking_number = signals.tracking_summary.tracking_number || ''
    } catch (error) {
      signals.warnings.push({ endpoint: SHOPEE_GET_TRACKING_INFO_PATH, message: error.message })
    }
  }

  if (String(options.include_invoice ?? options.includeInvoice ?? '1') !== '0') {
    try {
      const data = await fetchShopeeJson(invoiceUrl, { order_sn: order.order_id })
      signals.buyer_invoice_info = data?.response || data
    } catch (error) {
      signals.warnings.push({ endpoint: SHOPEE_BUYER_INVOICE_INFO_PATH, message: error.message })
    }
  }

  return signals
}

export async function getShopeeOperationsWorkbench(env, options = {}) {
  const localOrders = await loadLocalOperationOrders(env, options)
  const apiShops = await getApiShops(env, 'shopee', options.shop || '', 100)
  const live = String(options.live || options.realtime || '0') === '1'
  const liveLimit = Math.min(Math.max(Number(options.live_limit || options.liveLimit || 8) || 8, 0), 20)
  const liveSignals = []
  const warnings = []

  if (live && apiShops.length) {
    for (const order of localOrders.slice(0, liveLimit)) {
      const shop = shopeeShopForLocalOrder(apiShops, order)
      if (!shop?.api_shop_id || !shop?.access_token) {
        warnings.push({ order_sn: order.order_id, message: 'Shop chưa có token Shopee API.' })
        continue
      }
      try {
        liveSignals.push(await readShopeeOrderSignals(env, shop, order, options))
      } catch (error) {
        warnings.push({ order_sn: order.order_id, message: error.message })
      }
    }
  }

  const pickList = buildPickList(localOrders)
  const logisticsAnalytics = buildCarrierAnalytics(localOrders, liveSignals)
  const liveSignalByOrder = new Map(liveSignals.map(row => [String(row.order_sn), row]))
  const hasTracking = order => {
    const signal = liveSignalByOrder.get(String(order.order_id)) || {}
    return !!firstText(order.tracking_number, signal.tracking_number, signal.tracking_summary?.tracking_number, signal.package_number)
  }
  const summary = {
    orders: localOrders.length,
    lines: localOrders.reduce((sum, row) => sum + num(row.line_count), 0),
    qty: localOrders.reduce((sum, row) => sum + num(row.qty_total), 0),
    no_tracking: localOrders.filter(row => !hasTracking(row)).length,
    with_tracking: localOrders.filter(row => hasTracking(row)).length,
    delivered: logisticsAnalytics.summary.delivered,
    failed_delivery: logisticsAnalytics.summary.failed_delivery,
    return_or_refund: logisticsAnalytics.summary.return_or_refund,
    avg_fulfillment_hours: logisticsAnalytics.summary.avg_fulfillment_hours,
    live_checked: liveSignals.length,
    warning_count: warnings.length + liveSignals.reduce((sum, row) => sum + (row.warnings?.length || 0), 0)
  }

  return {
    status: 'ok',
    mode: 'shopee_operations_workbench',
    source: {
      local_orders: 'orders_v2/order_items',
      realtime: live ? 'Shopee order/logistics/invoice API' : 'off'
    },
    safe_mode: 'write actions are dry-run unless execute=true and confirmation text is provided',
    confirmation_required_for_write: OPERATIONS_CONFIRM_TEXT,
    filters: {
      shop: cleanText(options.shop),
      status: cleanText(options.status || 'PENDING').toUpperCase(),
      live
    },
    summary,
    shops: apiShops.map(shop => ({
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      has_token: Boolean(shop.access_token)
    })),
    orders: localOrders,
    pick_list: pickList,
    carrier_performance: logisticsAnalytics.carriers,
    logistics_insights: logisticsAnalytics.summary,
    live_signals: liveSignals,
    warnings
  }
}

function actionConfig(action) {
  return READ_ACTIONS[action] || WRITE_ACTIONS[action] || null
}

function normalizeActionPayload(options = {}) {
  const payload = options.payload && typeof options.payload === 'object' ? { ...options.payload } : {}
  for (const key of [
    'order_sn', 'order_sn_list', 'package_number', 'cursor', 'page_no', 'page_size',
    'time_from', 'time_to', 'address_id', 'logistics_channel_id', 'pickup_time_id'
  ]) {
    if (options[key] !== undefined && options[key] !== null && options[key] !== '') payload[key] = options[key]
  }
  return payload
}

async function findOperationShop(env, options = {}) {
  const shops = await getApiShops(env, 'shopee', options.shop || '', 100)
  if (!shops.length) return null
  const apiShopId = cleanText(options.api_shop_id)
  if (apiShopId) {
    return shops.find(shop => cleanText(shop.api_shop_id) === apiShopId) || null
  }
  const orderSn = cleanText(options.order_sn || options.payload?.order_sn)
  if (orderSn) {
    const local = await env.DB.prepare(`
      SELECT shop FROM orders_v2 WHERE LOWER(platform) = 'shopee' AND order_id = ? LIMIT 1
    `).bind(orderSn).first()
    if (local?.shop) {
      const match = shopeeShopForLocalOrder(shops, local)
      if (match) return match
    }
  }
  return shops[0]
}

export async function executeShopeeOperation(env, options = {}) {
  const action = cleanText(options.action).toLowerCase()
  const cfg = actionConfig(action)
  if (!cfg) {
    return {
      status: 'error',
      mode: 'shopee_operation_action',
      error: 'invalid_action',
      allowed_read_actions: Object.keys(READ_ACTIONS),
      allowed_write_actions: Object.keys(WRITE_ACTIONS)
    }
  }
  const payload = normalizeActionPayload(options)
  const isWrite = Boolean(WRITE_ACTIONS[action])
  const dryRun = isWrite && !(options.execute === true || String(options.execute).toLowerCase() === 'true')
  const confirmed = cleanText(options.confirm) === OPERATIONS_CONFIRM_TEXT
  const orderSn = cleanText(payload.order_sn || options.order_sn)

  if (isWrite && (dryRun || !confirmed)) {
    const result = {
      status: 'ok',
      mode: 'shopee_operation_action',
      endpoint: cfg.endpoint,
      action,
      order_sn: orderSn,
      payload,
      dry_run: true,
      sent_to_shopee: false,
      confirmation_required: OPERATIONS_CONFIRM_TEXT,
      message: 'Dry-run only. Chưa gửi thao tác vận hành lên Shopee.'
    }
    await saveOperationAction(env, result)
    return result
  }

  const shop = await findOperationShop(env, { ...options, payload, order_sn: orderSn })
  if (!shop?.api_shop_id || !shop?.access_token) {
    return { status: 'error', mode: 'shopee_operation_action', endpoint: cfg.endpoint, action, error: 'shop_token_not_found', dry_run: isWrite, sent_to_shopee: false }
  }

  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
  const buildUrl = signedShopeeUrl(app, cfg.endpoint, shop.access_token, shop.api_shop_id)
  let response
  try {
    response = cfg.method === 'POST'
      ? await postShopeeJson(buildUrl, {}, payload)
      : await fetchShopeeJson(buildUrl, payload)
  } catch (error) {
    const result = {
      status: 'error',
      mode: 'shopee_operation_action',
      endpoint: cfg.endpoint,
      action,
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      order_sn: orderSn,
      payload,
      dry_run: false,
      sent_to_shopee: isWrite,
      error: 'shopee_api_error',
      message: error.message
    }
    await saveOperationAction(env, result)
    return result
  }

  const result = {
    status: 'ok',
    mode: 'shopee_operation_action',
    endpoint: cfg.endpoint,
    action,
    shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
    api_shop_id: String(shop.api_shop_id || ''),
    order_sn: orderSn,
    payload,
    dry_run: false,
    sent_to_shopee: isWrite,
    response
  }
  await saveOperationAction(env, result)
  return result
}

export async function handleOperations(request, env, cors) {
  const url = new URL(request.url)
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

  if (url.pathname === '/api/operations/shopee/workbench') {
    const result = await getShopeeOperationsWorkbench(env, {
      shop: body.shop || url.searchParams.get('shop'),
      status: body.status || url.searchParams.get('status') || 'PENDING',
      search: body.search || url.searchParams.get('search'),
      limit: body.limit || url.searchParams.get('limit') || 20,
      live: body.live ?? body.realtime ?? url.searchParams.get('live') ?? url.searchParams.get('realtime') ?? 0,
      live_limit: body.live_limit || body.liveLimit || url.searchParams.get('live_limit'),
      include_tracking: body.include_tracking ?? body.includeTracking ?? url.searchParams.get('include_tracking'),
      include_invoice: body.include_invoice ?? body.includeInvoice ?? url.searchParams.get('include_invoice'),
      include_package_detail: body.include_package_detail ?? body.includePackageDetail ?? url.searchParams.get('include_package_detail')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/operations/shopee/action') {
    const result = await executeShopeeOperation(env, {
      ...Object.fromEntries(url.searchParams.entries()),
      ...body
    })
    return json(result, cors)
  }

  return json({ error: 'not_found', message: 'Unknown operations endpoint' }, cors, 404)
}
