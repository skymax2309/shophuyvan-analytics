import { listMarketplaceShopCapabilities } from './marketplace-shop-capability-core.js'

export const LOGISTICS_EVENT_CODES = [
  'order_trackingno_push',
  'shipping_document_status_push',
  'booking_status_push',
  'booking_trackingno_push',
  'booking_shipping_document_status_push',
  'package_fulfillment_status_push',
  'courier_delivery_binding_status_push',
  'package_info_push'
]

export const LOGISTICS_ENDPOINT_COUNTS = {
  shopee: { logistics: 46, first_mile: 16 },
  lazada: { logistics_core: 56, fulfillment: 9, fbl: 49 }
}

const LOGISTICS_FILTERS = {
  missing_tracking: {
    label: 'Thiếu tracking',
    condition: alias => `COALESCE(${alias}.tracking_number, '') = ''`
  },
  packaged: {
    label: 'Đã đóng gói',
    condition: alias => `UPPER(COALESCE(${alias}.shipping_status, '')) = 'LOGISTICS_PACKAGED'`
  },
  ready_to_ship: {
    label: 'Chờ lấy hàng',
    condition: alias => `UPPER(COALESCE(${alias}.shipping_status, '')) IN ('READY_TO_SHIP','PROCESSED','LOGISTICS_PENDING_ARRANGE','LOGISTICS_REQUEST_CREATED')`
  },
  failed_delivery: {
    label: 'Giao lỗi',
    condition: alias => `UPPER(COALESCE(${alias}.shipping_status, '')) IN ('FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT')`
  },
  return_attention: {
    label: 'Hoàn/trả',
    condition: alias => `(UPPER(COALESCE(${alias}.shipping_status, '')) LIKE '%RETURN%' OR UPPER(COALESCE(${alias}.oms_status, '')) = 'RETURN')`
  },
  return_in_transit: {
    label: 'Đang hoàn về shop',
    condition: alias => `UPPER(COALESCE(${alias}.shipping_status, '')) IN ('TO_RETURN','RETURN','RETURN_REFUND','LOGISTICS_IN_RETURN')`
  },
  return_ready_receive: {
    label: 'Chờ quét nhận hoàn',
    condition: alias => `UPPER(COALESCE(${alias}.shipping_status, '')) = 'LOGISTICS_RETURNED_BY_SHIPPER'`
  },
  return_received: {
    label: 'Đã nhận hoàn',
    condition: alias => `UPPER(COALESCE(${alias}.shipping_status, '')) = 'LOGISTICS_RETURN_PACKAGE_RECEIVED'`
  },
  return_complaint: {
    label: 'Đang khiếu nại',
    condition: alias => `COALESCE(${alias}.return_complaint_status, '') NOT IN ('', 'closed', 'resolved', 'cancelled')`
  }
}

const ATTENTION_STATUSES = [
  'READY_TO_SHIP',
  'PROCESSED',
  'LOGISTICS_PENDING_ARRANGE',
  'LOGISTICS_REQUEST_CREATED',
  'LOGISTICS_PACKAGED',
  'FAILED_DELIVERY',
  'FAILED_DELIVERY_ATTEMPT',
  'TO_RETURN',
  'RETURN',
  'RETURN_REFUND',
  'LOGISTICS_IN_RETURN',
  'LOGISTICS_RETURNED_BY_SHIPPER',
  'LOGISTICS_RETURN_PACKAGE_RECEIVED',
  'LOGISTICS_LOST'
]

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function foldText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function parseLimit(value, fallback = 12, max = 80) {
  const limit = Number(value || fallback)
  if (!Number.isFinite(limit) || limit <= 0) return fallback
  return Math.max(1, Math.min(Math.round(limit), max))
}

async function safeFirst(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql)
    return binds.length ? await statement.bind(...binds).first() : await statement.first()
  } catch {
    return null
  }
}

async function safeAll(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql)
    const { results } = binds.length ? await statement.bind(...binds).all() : await statement.all()
    return results || []
  } catch {
    return []
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

async function ensureReturnReceiveColumns(env) {
  // Cột nhận hoàn là xác nhận nội bộ kho, không thay thế trạng thái chính thức từ sàn.
  await addOrderColumnIfMissing(env, "return_received_at TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_received_by TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_received_note TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_complaint_status TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_complaint_updated_at TEXT DEFAULT ''")
  await addOrderColumnIfMissing(env, "return_complaint_note TEXT DEFAULT ''")
}

function shopIdentityKeys(row = {}) {
  const platform = foldText(row.platform)
  return [
    row.shop,
    row.shop_name,
    row.user_name,
    row.api_shop_id,
    row.api_user_id,
    row.display_name
  ]
    .map(value => foldText(value))
    .filter(Boolean)
    .map(value => `${platform}:${value}`)
}

function buildApiShopKeySet(capabilities = []) {
  const keys = new Set()
  for (const shop of capabilities || []) {
    if (shop.capability_mode !== 'api_active') continue
    for (const key of shopIdentityKeys(shop)) keys.add(key)
  }
  return keys
}

function isApiShopRow(row = {}, apiKeys = new Set()) {
  if (foldText(row.source_mode) === 'api_sync') return true
  const platform = foldText(row.platform)
  return [row.shop, row.shop_name, row.user_name, row.api_shop_id]
    .map(value => foldText(value))
    .filter(Boolean)
    .some(value => apiKeys.has(`${platform}:${value}`))
}

function buildLogisticsWatchOnlyFilterCondition(filter, alias = 'o') {
  const key = cleanText(filter).toLowerCase()
  return LOGISTICS_FILTERS[key]?.condition(alias) || ''
}

function attentionCondition(alias = 'o') {
  const marks = ATTENTION_STATUSES.map(status => `'${status}'`).join(',')
  return `(
    COALESCE(${alias}.tracking_number, '') = ''
    OR UPPER(COALESCE(${alias}.shipping_status, '')) IN (${marks})
  )`
}

export function buildLogisticsWatchFilterCondition(filter, alias = 'o') {
  const filterCondition = buildLogisticsWatchOnlyFilterCondition(filter, alias)
  if (!filterCondition) return ''
  return `(
    LOWER(COALESCE(${alias}.platform, '')) IN ('shopee','lazada')
    AND ${attentionCondition(alias)}
    AND ${filterCondition}
  )`
}

function buildScope(options = {}) {
  const clauses = [`LOWER(COALESCE(o.platform, '')) IN ('shopee','lazada')`, attentionCondition('o')]
  const binds = []
  const platform = cleanText(options.platform).toLowerCase()
  const shop = cleanText(options.shop)
  const filterCondition = buildLogisticsWatchOnlyFilterCondition(options.filter, 'o')
  if (platform && ['shopee', 'lazada'].includes(platform)) {
    clauses.push(`LOWER(COALESCE(o.platform, '')) = ?`)
    binds.push(platform)
  }
  if (shop) {
    clauses.push(`LOWER(TRIM(COALESCE(o.shop, ''))) = LOWER(TRIM(?))`)
    binds.push(shop)
  }
  if (filterCondition) clauses.push(filterCondition)
  return { where: clauses.map(clause => `(${clause})`).join(' AND '), binds }
}

function logisticsAdvice(row = {}, hasApi = false) {
  const platform = cleanText(row.platform).toLowerCase()
  const shipping = cleanText(row.shipping_status).toUpperCase()
  if (!hasApi) return 'Shop không API: quét trình duyệt, import file hoặc xử lý tay.'
  if (platform === 'lazada') {
    if (!cleanText(row.tracking_number)) return 'Đọc trace/AWB từ Lazada API trước khi xử lý tiếp.'
    if (shipping.includes('RETURN') || shipping.includes('FAILED')) return 'Đối soát trace Lazada trước khi mở thao tác EPIS.'
    return 'Theo dõi trace, AWB và trạng thái giao của Lazada.'
  }
  if (!cleanText(row.tracking_number)) return 'Đọc tracking Shopee trước khi xử lý tiếp.'
  if (shipping === 'LOGISTICS_PACKAGED') return 'Kiểm tra tem, tracking và trạng thái lấy hàng.'
  if (shipping.includes('RETURN') || shipping.includes('FAILED')) return 'Chuyển sang đối soát hoàn/trả và giao lỗi.'
  return 'Theo dõi logistics, không gửi lệnh ghi nếu chưa qua guard.'
}

function normalizeOrder(row = {}, apiKeys = new Set()) {
  const hasApi = isApiShopRow(row, apiKeys)
  return {
    order_id: cleanText(row.order_id),
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    source_mode: cleanText(row.source_mode),
    api_mode: hasApi ? 'api' : 'manual',
    oms_status: cleanText(row.oms_status),
    shipping_status: cleanText(row.shipping_status),
    shipping_carrier: cleanText(row.shipping_carrier),
    tracking_number: cleanText(row.tracking_number),
    return_received_at: cleanText(row.return_received_at),
    return_received_by: cleanText(row.return_received_by),
    return_complaint_status: cleanText(row.return_complaint_status),
    return_complaint_updated_at: cleanText(row.return_complaint_updated_at),
    order_date: cleanText(row.order_date),
    updated_at: cleanText(row.oms_updated_at || row.order_date),
    advice: logisticsAdvice(row, hasApi)
  }
}

export async function loadLogisticsWatch(env, options = {}) {
  await ensureReturnReceiveColumns(env)
  const limit = parseLimit(options.limit, 12, 80)
  const scope = buildScope(options)
  const eventPlaceholders = LOGISTICS_EVENT_CODES.map(() => '?').join(',')

  const [
    summary,
    byShop,
    rows,
    pushSummary,
    capabilities
  ] = await Promise.all([
    safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN COALESCE(o.tracking_number, '') = '' THEN 1 ELSE 0 END) AS missing_tracking,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_PACKAGED' THEN 1 ELSE 0 END) AS packaged,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) IN ('READY_TO_SHIP','PROCESSED','LOGISTICS_PENDING_ARRANGE','LOGISTICS_REQUEST_CREATED') THEN 1 ELSE 0 END) AS ready_to_ship,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) IN ('FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT') THEN 1 ELSE 0 END) AS failed_delivery,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) LIKE '%RETURN%' OR UPPER(COALESCE(o.oms_status, '')) = 'RETURN' THEN 1 ELSE 0 END) AS return_attention,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) IN ('TO_RETURN','RETURN','RETURN_REFUND','LOGISTICS_IN_RETURN') THEN 1 ELSE 0 END) AS return_in_transit,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_RETURNED_BY_SHIPPER' THEN 1 ELSE 0 END) AS return_ready_receive,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_RETURN_PACKAGE_RECEIVED' OR COALESCE(o.return_received_at, '') != '' THEN 1 ELSE 0 END) AS return_received,
             SUM(CASE WHEN COALESCE(o.return_complaint_status, '') NOT IN ('', 'closed', 'resolved', 'cancelled') THEN 1 ELSE 0 END) AS return_complaint,
             SUM(CASE WHEN LOWER(COALESCE(o.source_mode, '')) = 'api_sync' THEN 1 ELSE 0 END) AS api_rows
      FROM orders_v2 o
      WHERE ${scope.where}
    `, scope.binds),
    safeAll(env, `
      SELECT o.platform, o.shop,
             COUNT(*) AS total,
             SUM(CASE WHEN COALESCE(o.tracking_number, '') = '' THEN 1 ELSE 0 END) AS missing_tracking,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_PACKAGED' THEN 1 ELSE 0 END) AS packaged,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) IN ('FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT') THEN 1 ELSE 0 END) AS failed_delivery,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) LIKE '%RETURN%' OR UPPER(COALESCE(o.oms_status, '')) = 'RETURN' THEN 1 ELSE 0 END) AS return_attention,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) IN ('TO_RETURN','RETURN','RETURN_REFUND','LOGISTICS_IN_RETURN') THEN 1 ELSE 0 END) AS return_in_transit,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_RETURNED_BY_SHIPPER' THEN 1 ELSE 0 END) AS return_ready_receive,
             SUM(CASE WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_RETURN_PACKAGE_RECEIVED' OR COALESCE(o.return_received_at, '') != '' THEN 1 ELSE 0 END) AS return_received,
             SUM(CASE WHEN COALESCE(o.return_complaint_status, '') NOT IN ('', 'closed', 'resolved', 'cancelled') THEN 1 ELSE 0 END) AS return_complaint,
             SUM(CASE WHEN LOWER(COALESCE(o.source_mode, '')) = 'api_sync' THEN 1 ELSE 0 END) AS api_rows
      FROM orders_v2 o
      WHERE ${scope.where}
      GROUP BY o.platform, o.shop
      ORDER BY missing_tracking DESC, packaged DESC, failed_delivery DESC, total DESC
      LIMIT 10
    `, scope.binds),
    safeAll(env, `
      SELECT o.order_id, o.platform, o.shop, o.source_mode, o.oms_status, o.shipping_status,
             o.tracking_number, o.shipping_carrier, o.order_date, o.oms_updated_at,
             o.return_received_at, o.return_received_by, o.return_complaint_status, o.return_complaint_updated_at
      FROM orders_v2 o
      WHERE ${scope.where}
      ORDER BY
        CASE
          WHEN COALESCE(o.tracking_number, '') = '' THEN 0
          WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_PACKAGED' THEN 1
          WHEN UPPER(COALESCE(o.shipping_status, '')) IN ('FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT') THEN 2
          WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_RETURNED_BY_SHIPPER' THEN 3
          WHEN UPPER(COALESCE(o.shipping_status, '')) IN ('TO_RETURN','RETURN','RETURN_REFUND','LOGISTICS_IN_RETURN') THEN 4
          WHEN UPPER(COALESCE(o.shipping_status, '')) = 'LOGISTICS_RETURN_PACKAGE_RECEIVED' THEN 5
          ELSE 6
        END,
        datetime(COALESCE(NULLIF(o.oms_updated_at, ''), NULLIF(o.order_date, ''), '1970-01-01')) DESC,
        o.order_id DESC
      LIMIT ?
    `, [...scope.binds, limit]),
    safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_events
      FROM marketplace_webhook_events
      WHERE event_code IN (${eventPlaceholders})
    `, LOGISTICS_EVENT_CODES),
    listMarketplaceShopCapabilities(env, { platform: '', limit: 300 })
  ])

  const apiKeys = buildApiShopKeySet(capabilities)
  let apiOrders = 0
  let manualOrders = 0
  const shops = byShop.map(row => {
    const hasApi = isApiShopRow(row, apiKeys) || safeNumber(row.api_rows) > 0
    const total = safeNumber(row.total)
    if (hasApi) apiOrders += total
    else manualOrders += total
    return {
      platform: cleanText(row.platform),
      shop: cleanText(row.shop),
      api_mode: hasApi ? 'api' : 'manual',
      total,
      missing_tracking: safeNumber(row.missing_tracking),
      packaged: safeNumber(row.packaged),
      failed_delivery: safeNumber(row.failed_delivery),
      return_attention: safeNumber(row.return_attention),
      return_in_transit: safeNumber(row.return_in_transit),
      return_ready_receive: safeNumber(row.return_ready_receive),
      return_received: safeNumber(row.return_received),
      return_complaint: safeNumber(row.return_complaint)
    }
  })

  const cards = [
    { id: 'missing_tracking', label: 'Thiếu tracking', value: safeNumber(summary?.missing_tracking), tone: 'warning' },
    { id: 'packaged', label: 'Đã đóng gói', value: safeNumber(summary?.packaged), tone: 'warning' },
    { id: 'ready_to_ship', label: 'Chờ lấy hàng', value: safeNumber(summary?.ready_to_ship), tone: 'ok' },
    { id: 'failed_delivery', label: 'Giao lỗi', value: safeNumber(summary?.failed_delivery), tone: 'danger' },
    { id: 'return_in_transit', label: 'Đang hoàn về shop', value: safeNumber(summary?.return_in_transit), tone: 'warning' },
    { id: 'return_ready_receive', label: 'Chờ quét nhận hoàn', value: safeNumber(summary?.return_ready_receive), tone: 'danger' },
    { id: 'return_received', label: 'Đã nhận hoàn', value: safeNumber(summary?.return_received), tone: 'ok' },
    { id: 'return_complaint', label: 'Đang khiếu nại', value: safeNumber(summary?.return_complaint), tone: 'danger' },
    { id: 'return_attention', label: 'Hoàn/trả tất cả', value: safeNumber(summary?.return_attention), tone: 'warning' }
  ]

  return {
    status: 'ok',
    filter: cleanText(options.filter).toLowerCase(),
    summary: {
      total: safeNumber(summary?.total),
      api_orders: apiOrders,
      manual_orders: manualOrders,
      push_events: safeNumber(pushSummary?.total),
      shopee_endpoint_count: LOGISTICS_ENDPOINT_COUNTS.shopee.logistics + LOGISTICS_ENDPOINT_COUNTS.shopee.first_mile,
      lazada_endpoint_count: LOGISTICS_ENDPOINT_COUNTS.lazada.logistics_core
    },
    cards,
    shops,
    orders: rows.map(row => normalizeOrder(row, apiKeys)),
    endpoint_notes: [
      'Shopee đã có nền tracking, package detail, tem và dry-run ship; bước tiếp theo phù hợp là batch tem/job và FirstMile.',
      'Lazada nên mở trước trace + AWB/document read-only; EPIS consign/RTS/cancel phải có guard riêng.',
      'Shop không API chỉ là dữ liệu tham chiếu để quét trình duyệt/import/thao tác tay, không ghi là đồng bộ API.'
    ]
  }
}
