function cleanText(value) {
  return String(value ?? '').trim()
}

function num(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

export function ymdFromTimestamp(seconds) {
  const n = Number(seconds || 0)
  if (!n) return ''
  return new Date(n * 1000).toISOString().slice(0, 10)
}

export function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function normalizeSearchText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function timestampMs(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !value) return 0
    return value > 100000000000 ? value : value * 1000
  }
  const text = cleanText(value)
  if (!text) return 0
  if (/^\d+(\.\d+)?$/.test(text)) return timestampMs(Number(text))
  const parsed = Date.parse(text.includes('T') ? text : text.replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : 0
}

function localDateTime(ms) {
  if (!ms) return ''
  return new Date(ms + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

function collectTrackingEvents(raw) {
  const root = raw?.response || raw || {}
  const candidates = [
    root.tracking_info,
    root.tracking_info_list,
    root.tracking_list,
    root.tracking_detail,
    root.logistics_info,
    root.logistics_info_list,
    root.list,
    Array.isArray(root) ? root : null
  ].filter(Boolean)
  const events = []
  const seen = new Set()
  const visit = item => {
    if (!item) return
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    if (typeof item !== 'object') return
    const description = firstText(
      item.description,
      item.message,
      item.content,
      item.detail,
      item.update_description,
      item.status_description,
      item.logistics_status,
      item.status
    )
    const status = firstText(
      item.status,
      item.logistics_status,
      item.status_code,
      item.status_description,
      item.description
    )
    const ms = timestampMs(firstText(
      item.update_time,
      item.event_time,
      item.time,
      item.ctime,
      item.create_time,
      item.logistics_create_time
    ))
    const location = firstText(item.location, item.station, item.city, item.state, item.province)
    if (description || status || ms || location) {
      const key = `${ms}|${status}|${description}|${location}`
      if (!seen.has(key)) {
        seen.add(key)
        events.push({
          timestamp: ms ? Math.round(ms / 1000) : 0,
          time: localDateTime(ms),
          status,
          description,
          location
        })
      }
    }
    for (const key of ['tracking_info', 'tracking_list', 'details', 'events', 'logistics_info']) {
      if (Array.isArray(item[key])) visit(item[key])
    }
  }
  candidates.forEach(visit)
  return events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}

export function trackingSummary(raw) {
  const root = raw?.response || raw || {}
  const events = collectTrackingEvents(raw)
  const latest = events[0] || {}
  const trackingNumber = firstText(
    root.tracking_number,
    root.tracking_no,
    root.waybill_no,
    root.logistics_tracking_number
  )
  const carrier = firstText(
    root.shipping_carrier,
    root.logistics_channel_name,
    root.logistics_channel,
    root.carrier
  )
  return {
    tracking_number: trackingNumber,
    carrier,
    latest_status: latest.status || firstText(root.logistics_status, root.status),
    latest_description: latest.description || firstText(root.description, root.message),
    latest_time: latest.time || '',
    latest_timestamp: latest.timestamp || 0,
    event_count: events.length,
    events: events.slice(0, 12)
  }
}

function statusTextForOrder(order, signal) {
  const summary = signal?.tracking_summary || {}
  return normalizeSearchText([
    order?.oms_status,
    order?.shipping_status,
    order?.cancel_reason,
    summary.latest_status,
    summary.latest_description,
    signal?.detail?.order_status
  ].join(' '))
}

function isDeliveredText(text) {
  return text.includes('completed') ||
    text.includes('delivered') ||
    text.includes('delivery done') ||
    text.includes('giao hang thanh cong') ||
    text.includes('da giao')
}

function isFailedDeliveryText(text) {
  return text.includes('failed_delivery') ||
    text.includes('delivery failed') ||
    text.includes('failed delivery') ||
    text.includes('giao khong thanh cong') ||
    text.includes('giao that bai') ||
    text.includes('khong thanh cong')
}

function isReturnText(text) {
  return text.includes('return') ||
    text.includes('refund') ||
    text.includes('tra hang') ||
    text.includes('hoan tien') ||
    text.includes('hoan hang')
}

export function buildCarrierAnalytics(orders = [], liveSignals = []) {
  const signals = new Map(liveSignals.map(row => [String(row.order_sn), row]))
  const groups = new Map()
  let fulfillmentMsTotal = 0
  let fulfillmentMsCount = 0

  const ensure = carrier => {
    const key = cleanText(carrier) || 'Chua xac dinh DVVC'
    if (!groups.has(key)) {
      groups.set(key, {
        carrier: key,
        orders: 0,
        with_tracking: 0,
        no_tracking: 0,
        delivered: 0,
        failed_delivery: 0,
        return_or_refund: 0,
        in_transit: 0,
        avg_fulfillment_hours: 0,
        fulfillment_samples: 0,
        latest_event: ''
      })
    }
    return groups.get(key)
  }

  for (const order of orders) {
    const signal = signals.get(String(order.order_id)) || {}
    const summary = signal.tracking_summary || {}
    const carrier = firstText(order.shipping_carrier, summary.carrier, signal.detail?.shipping_carrier)
    const row = ensure(carrier)
    const text = statusTextForOrder(order, signal)
    const tracking = firstText(order.tracking_number, summary.tracking_number, signal.tracking_number, signal.package_number)
    row.orders += 1
    if (tracking) row.with_tracking += 1
    else row.no_tracking += 1
    if (isFailedDeliveryText(text)) row.failed_delivery += 1
    else if (isReturnText(text)) row.return_or_refund += 1
    else if (isDeliveredText(text)) row.delivered += 1
    else if (tracking || text.includes('shipping') || text.includes('dang giao')) row.in_transit += 1

    if (!row.latest_event && (summary.latest_description || summary.latest_status)) {
      row.latest_event = firstText(summary.latest_description, summary.latest_status)
    }

    const orderMs = timestampMs(order.order_date)
    const firstEvent = (summary.events || []).slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))[0]
    const firstEventMs = timestampMs(firstEvent?.timestamp)
    if (orderMs && firstEventMs && firstEventMs >= orderMs) {
      const diff = firstEventMs - orderMs
      row.fulfillment_samples += 1
      row.avg_fulfillment_hours = ((row.avg_fulfillment_hours * (row.fulfillment_samples - 1)) + diff / 3600000) / row.fulfillment_samples
      fulfillmentMsTotal += diff
      fulfillmentMsCount += 1
    }
  }

  const carriers = [...groups.values()]
    .map(row => ({ ...row, avg_fulfillment_hours: Number(row.avg_fulfillment_hours.toFixed(2)) }))
    .sort((a, b) => b.orders - a.orders || a.carrier.localeCompare(b.carrier))

  return {
    carriers,
    summary: {
      failed_delivery: carriers.reduce((sum, row) => sum + row.failed_delivery, 0),
      return_or_refund: carriers.reduce((sum, row) => sum + row.return_or_refund, 0),
      delivered: carriers.reduce((sum, row) => sum + row.delivered, 0),
      avg_fulfillment_hours: fulfillmentMsCount ? Number((fulfillmentMsTotal / fulfillmentMsCount / 3600000).toFixed(2)) : 0,
      fulfillment_samples: fulfillmentMsCount
    }
  }
}
