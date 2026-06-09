function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function compactJson(value, max = 60000) {
  const text = JSON.stringify(value ?? {})
  return text.length > max ? text.slice(0, max) : text
}

function lowerTrackingText(value) {
  return cleanText(value).toLowerCase()
}

function normalizeTrackingStatus(value) {
  const text = lowerTrackingText(value)
  if (!text) return ''
  if (text.includes('order_created') || text.includes('created') || text.includes('chờ lấy') || text.includes('cho lay')) return 'waiting_pickup'
  if (text.includes('picked_up') || text.includes('pickup') || text.includes('picked up') || text.includes('đã lấy') || text.includes('da lay')) return 'picked_up'
  if (text.includes('delivered') || text.includes('completed') || text.includes('giao hàng thành công') || text.includes('giao hang thanh cong')) return 'delivered'
  if (text.includes('cancel')) return 'canceled'
  if (text.includes('returning') || text.includes('to_return') || text.includes('in_return')) return 'returning'
  if (text.includes('returned') || text.includes('return')) return 'returned'
  if (text.includes('failed_delivery') || text.includes('delivery_failed') || text.includes('failed delivery') || text.includes('giao không thành công') || text.includes('giao khong thanh cong')) return 'delivery_failed'
  if (text.includes('transit') || text.includes('shipping') || text.includes('đang giao') || text.includes('dang giao')) return 'in_transit'
  return ''
}

function normalizeTrackingEvent(event = {}) {
  const rawEventCode = cleanText(event.event_code || event.status || event.raw_event_code)
  const statusCore = cleanText(event.status_core || normalizeTrackingStatus(rawEventCode || event.description))
  return {
    ...event,
    raw_event_code: rawEventCode,
    status_core: statusCore || cleanText(event.status_core),
    event_time: cleanText(event.event_time || event.time || event.created_at),
    event_timestamp: Number(event.event_timestamp || event.timestamp || 0) || 0
  }
}

export async function ensureOrderTrackingCore(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS order_tracking_core (
      order_id TEXT PRIMARY KEY,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      tracking_number TEXT DEFAULT '',
      logistics_provider TEXT DEFAULT '',
      tracking_status_core TEXT DEFAULT '',
      tracking_events TEXT DEFAULT '[]',
      tracking_source TEXT DEFAULT '',
      last_tracking_sync_at TEXT DEFAULT '',
      last_tracking_error TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}'
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_tracking_core_platform_shop ON order_tracking_core(platform, shop)`).run()
}

export async function saveOrderTrackingCore(env, payload = {}) {
  await ensureOrderTrackingCore(env)
  const events = (Array.isArray(payload.events) ? payload.events : []).map(normalizeTrackingEvent)
  const latestEvent = events[0] || {}
  const orderId = cleanText(payload.order_id || payload.orderId)
  if (!orderId) return null
  await env.DB.prepare(`
    INSERT INTO order_tracking_core (
      order_id, platform, shop, tracking_number, logistics_provider,
      tracking_status_core, tracking_events, tracking_source,
      last_tracking_sync_at, last_tracking_error, raw_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      platform = excluded.platform,
      shop = excluded.shop,
      tracking_number = excluded.tracking_number,
      logistics_provider = excluded.logistics_provider,
      tracking_status_core = excluded.tracking_status_core,
      tracking_events = excluded.tracking_events,
      tracking_source = excluded.tracking_source,
      last_tracking_sync_at = excluded.last_tracking_sync_at,
      last_tracking_error = excluded.last_tracking_error,
      raw_data = excluded.raw_data
  `).bind(
    orderId,
    cleanText(payload.platform),
    cleanText(payload.shop),
    cleanText(payload.tracking_number || payload.trackingNumber),
    cleanText(payload.logistics_provider || payload.carrier),
    cleanText(payload.tracking_status_core || payload.latest_status || latestEvent.status_core || latestEvent.raw_event_code),
    compactJson(events),
    cleanText(payload.tracking_source || payload.source),
    cleanText(payload.last_tracking_error || payload.error),
    compactJson(payload.raw_data || payload.raw || {})
  ).run()
  return {
    order_id: orderId,
    events,
    tracking_number: cleanText(payload.tracking_number || payload.trackingNumber),
    logistics_provider: cleanText(payload.logistics_provider || payload.carrier),
    tracking_status_core: cleanText(payload.tracking_status_core || payload.latest_status || latestEvent.status_core || latestEvent.raw_event_code),
    tracking_source: cleanText(payload.tracking_source || payload.source)
  }
}

export async function readOrderTrackingCore(env, orderId) {
  await ensureOrderTrackingCore(env)
  const row = await env.DB.prepare(`
    SELECT *
    FROM order_tracking_core
    WHERE order_id = ?
    LIMIT 1
  `).bind(cleanText(orderId)).first()
  if (!row) return null
  let events = []
  try { events = JSON.parse(row.tracking_events || '[]') } catch { events = [] }
  return { ...row, tracking_events: Array.isArray(events) ? events : [] }
}
