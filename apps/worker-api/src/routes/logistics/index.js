import { loadLogisticsWatch } from '../../core/logistics/watch-core.js'
import { readOrderTrackingCore, saveOrderTrackingCore } from '../../core/logistics/tracking-core.js'
import { ensureOrderTransportColumns } from '../../core/orders/transport-core.js'
import { resolveOrderDataSource } from '../../core/orders/order-data-source-resolver.js'
import { callLazadaWithShop, getApiShops } from '../api/index.js'
import { readShopeeOrderSignals } from '../operations/index.js'
import { firstText, trackingSummary } from '../operations/carrier-analytics.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function shopMatchesOrder(shop = {}, order = {}) {
  const local = cleanText(order.shop).toLowerCase()
  return [shop.shop_name, shop.user_name, shop.api_shop_id, shop.id]
    .map(value => cleanText(value).toLowerCase())
    .filter(Boolean)
    .includes(local)
}

async function loadOrder(env, orderId) {
  return env.DB.prepare(`
    SELECT order_id, platform, shop, order_date, order_type, oms_status, shipping_status,
           shipping_carrier, tracking_number, source_mode, source_detail, status_source,
           payment_method, payment_method_source, payment_time, payment_time_source,
           customer_name, customer_note, customer_note_source,
           seller_center_detail_url, detail_url_source, source_updated_at
    FROM orders_v2
    WHERE order_id = ?
    LIMIT 1
  `).bind(cleanText(orderId)).first()
}

async function findApiShopForOrder(env, order = {}) {
  const shops = await getApiShops(env, cleanText(order.platform).toLowerCase(), cleanText(order.shop), 20)
  return shops.find(shop => shopMatchesOrder(shop, order)) || shops[0] || null
}

function normalizeTimelineResponse(order, source, summary = {}, raw = {}, warning = '') {
  const events = Array.isArray(summary.events) ? summary.events : []
  return {
    status: events.length ? 'ok' : (warning ? 'warning' : 'empty'),
    order_id: order.order_id,
    platform: cleanText(order.platform).toLowerCase(),
    shop: order.shop,
    source,
    tracking_number: firstText(summary.tracking_number, order.tracking_number),
    logistics_provider: firstText(summary.carrier, order.shipping_carrier),
    tracking_status_core: firstText(summary.latest_status, summary.latest_description),
    payment_method: firstText(order.payment_method),
    payment_method_source: firstText(order.payment_method_source),
    payment_time: firstText(order.payment_time),
    payment_time_source: firstText(order.payment_time_source),
    customer_name: firstText(order.customer_name),
    customer_note: firstText(order.customer_note),
    customer_note_source: firstText(order.customer_note_source),
    tracking_events: events,
    events,
    message: events.length ? 'Đã đọc timeline vận chuyển.' : (warning || 'Chưa có lịch trình vận chuyển.'),
    raw_hint: warning ? '' : cleanText(raw?.error || raw?.message)
  }
}

function cachedTrackingResponse(order, cached = null, fallback = {}) {
  const events = Array.isArray(cached?.tracking_events) ? cached.tracking_events : []
  if (!events.length) return null
  return {
    status: 'ok',
    order_id: order.order_id,
    platform: cleanText(order.platform).toLowerCase(),
    shop: order.shop,
    source: cleanText(cached.tracking_source || cached.source || fallback.source) || 'tracking_core_cached',
    reason: 'tracking_core_cached',
    message: 'Đã đọc timeline vận chuyển từ Tracking Core.',
    tracking_number: firstText(cached.tracking_number, order.tracking_number),
    logistics_provider: firstText(cached.logistics_provider, order.shipping_carrier),
    tracking_status_core: firstText(cached.tracking_status_core),
    payment_method: firstText(order.payment_method),
    payment_method_source: firstText(order.payment_method_source),
    payment_time: firstText(order.payment_time),
    payment_time_source: firstText(order.payment_time_source),
    customer_name: firstText(order.customer_name),
    customer_note: firstText(order.customer_note),
    customer_note_source: firstText(order.customer_note_source),
    tracking_events: events,
    events
  }
}

function orderDetailEvidence(order = {}) {
  return {
    tracking_number: firstText(order.tracking_number),
    logistics_provider: firstText(order.shipping_carrier),
    payment_method: firstText(order.payment_method),
    payment_method_source: firstText(order.payment_method_source),
    payment_time: firstText(order.payment_time),
    payment_time_source: firstText(order.payment_time_source),
    customer_name: firstText(order.customer_name),
    customer_note: firstText(order.customer_note),
    customer_note_source: firstText(order.customer_note_source)
  }
}

async function handleTrackingDetail(request, env, cors) {
  const url = new URL(request.url)
  const orderId = cleanText(url.searchParams.get('order_id') || url.searchParams.get('order_sn'))
  if (!orderId) return json({ error: 'missing_order_id', message: 'Thiếu mã đơn.' }, cors, 400)

  await ensureOrderTransportColumns(env)
  const order = await loadOrder(env, orderId)
  if (!order) return json({ error: 'order_not_found', message: 'Không tìm thấy đơn trong Warehouse/Core.' }, cors, 404)

  const resolved = resolveOrderDataSource(order)
  const platform = cleanText(order.platform).toLowerCase()
  const cached = await readOrderTrackingCore(env, orderId).catch(() => null)
  if (resolved.source_priority !== 'official_api_first') {
    const sellerCenter = resolved.seller_center_allowed === true
    const cachedResponse = cachedTrackingResponse(order, cached, resolved)
    if (cachedResponse) return json(cachedResponse, cors)
    return json({
      status: 'warning',
      order_id: orderId,
      platform,
      shop: order.shop,
      ...orderDetailEvidence(order),
      source: resolved.source,
      reason: sellerCenter ? 'seller_center_detail_required' : 'tracking_not_available',
      message: sellerCenter ? 'Cần đồng bộ Seller Center để lấy timeline.' : 'Chưa có timeline tự động cho nguồn này.',
      tracking_events: cached?.tracking_events || [],
      events: cached?.tracking_events || []
    }, cors)
  }

  const shop = await findApiShopForOrder(env, order)
  if (!shop?.access_token) {
    const cachedResponse = cachedTrackingResponse(order, cached, { source: 'tracking_core_cached' })
    if (cachedResponse) return json({
      ...cachedResponse,
      status: 'warning',
      reason: 'api_permission_missing',
      message: 'Thiếu token/quyền API tracking; đang giữ timeline đã lưu trong Tracking Core.'
    }, cors)
    return json({
      status: 'warning',
      order_id: orderId,
      platform,
      shop: order.shop,
      ...orderDetailEvidence(order),
      reason: 'api_permission_missing',
      message: 'Thiếu token/quyền API tracking.',
      tracking_events: cached?.tracking_events || [],
      events: cached?.tracking_events || []
    }, cors)
  }

  try {
    if (platform === 'shopee') {
      const signals = await readShopeeOrderSignals(env, shop, order, { include_tracking: '1', include_invoice: '0', include_package_detail: '0' })
      const summary = signals.tracking_summary || trackingSummary(signals.tracking_info)
      const response = normalizeTimelineResponse(order, 'shopee_open_platform:/api/v2/logistics/get_tracking_info', summary, signals)
      await saveOrderTrackingCore(env, {
        ...response,
        tracking_source: response.source,
        raw_data: signals
      }).catch(() => null)
      return json(response, cors)
    }

    if (platform === 'lazada') {
      const itemsData = await callLazadaWithShop(env, shop, '/order/items/get', { order_id: orderId })
      const items = Array.isArray(itemsData?.data) ? itemsData.data : (Array.isArray(itemsData?.data?.items) ? itemsData.data.items : [])
      const packageIds = [...new Set(items.map(item => firstText(item.ofc_package_id, item.ofcPackageId, item.package_id, item.package_number)).filter(Boolean))]
      if (!packageIds.length) {
        const cachedResponse = cachedTrackingResponse(order, cached, { source: 'lazada_tracking_core_cached' })
        if (cachedResponse) return json({
          ...cachedResponse,
          status: 'warning',
          reason: 'tracking_package_missing',
          message: 'Chưa có mã package Lazada mới; đang giữ timeline đã lưu trong Tracking Core.'
        }, cors)
        return json({
          status: 'warning',
          order_id: orderId,
          platform,
          shop: order.shop,
          ...orderDetailEvidence(order),
          reason: 'tracking_package_missing',
          message: 'Chưa có mã package Lazada để đọc timeline.',
          tracking_events: cached?.tracking_events || [],
          events: cached?.tracking_events || []
        }, cors)
      }
      const trace = await callLazadaWithShop(env, shop, '/logistic/order/trace', {
        order_id: orderId,
        locale: 'vi_VN',
        ofcPackageIdList: JSON.stringify(packageIds)
      })
      const summary = trackingSummary(trace)
      const response = normalizeTimelineResponse(order, 'lazada_open_platform:/logistic/order/trace', summary, trace)
      await saveOrderTrackingCore(env, {
        ...response,
        tracking_source: response.source,
        raw_data: trace
      }).catch(() => null)
      return json(response, cors)
    }
  } catch (error) {
    const cachedResponse = cachedTrackingResponse(order, cached, { source: `${platform}_tracking_core_cached` })
    if (cachedResponse) return json({
      ...cachedResponse,
      status: 'warning',
      reason: 'api_permission_missing',
      message: 'API tracking lỗi hoặc thiếu quyền; đang giữ timeline đã lưu trong Tracking Core.',
      technical_error: error.message || String(error)
    }, cors)
    return json({
      status: 'warning',
      order_id: orderId,
      platform,
      shop: order.shop,
      ...orderDetailEvidence(order),
      reason: 'api_permission_missing',
      message: 'Thiếu quyền API tracking hoặc sàn chưa trả timeline.',
      technical_error: error.message || String(error),
      tracking_events: cached?.tracking_events || [],
      events: cached?.tracking_events || []
    }, cors)
  }

  const cachedResponse = cachedTrackingResponse(order, cached, { source: `${platform}_tracking_core_cached` })
  if (cachedResponse) return json(cachedResponse, cors)

  return json({
    status: 'warning',
    order_id: orderId,
    platform,
    shop: order.shop,
    ...orderDetailEvidence(order),
    reason: 'tracking_not_available',
    message: 'Chưa có lịch trình vận chuyển cho sàn này.',
    tracking_events: cached?.tracking_events || [],
    events: cached?.tracking_events || []
  }, cors)
}

export async function handleLogisticsWatch(request, env, cors) {
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed', message: 'Phương thức không được hỗ trợ.' }, cors, 405)
  }
  const url = new URL(request.url)
  if (url.pathname.endsWith('/detail')) {
    return handleTrackingDetail(request, env, cors)
  }
  const result = await loadLogisticsWatch(env, {
    platform: cleanText(url.searchParams.get('platform')).toLowerCase(),
    shop: cleanText(url.searchParams.get('shop')),
    filter: cleanText(url.searchParams.get('filter')).toLowerCase(),
    limit: url.searchParams.get('limit')
  })
  return json(result, cors)
}
