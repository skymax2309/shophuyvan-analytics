import { listMarketplaceShopCapabilities } from '../../core/marketplace-shop-capability-core.js'

export function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

export function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function foldText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function parseLimit(value, fallback = 80, max = 500) {
  const limit = Number(value || fallback)
  if (!Number.isFinite(limit) || limit <= 0) return fallback
  return Math.max(1, Math.min(Math.round(limit), max))
}

export function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export async function safeFirst(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql)
    return binds.length ? await statement.bind(...binds).first() : await statement.first()
  } catch {
    return null
  }
}

export async function safeAll(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql)
    const { results } = binds.length ? await statement.bind(...binds).all() : await statement.all()
    return results || []
  } catch {
    return []
  }
}

export async function safeCount(env, sql, binds = []) {
  const row = await safeFirst(env, sql, binds)
  return safeNumber(row?.total ?? row?.count ?? row?.c)
}

export const EVENT_TITLES = {
  webchat_push: 'Tin nhắn mới từ sàn',
  item_promotion_push: 'Cập nhật khuyến mãi sản phẩm',
  promotion_update_push: 'Cập nhật chương trình marketing',
  return_updates_push: 'Cập nhật hoàn/trả',
  order_status_push: 'Cập nhật trạng thái đơn',
  order_trackingno_push: 'Cập nhật mã vận đơn',
  shipping_document_status_push: 'Cập nhật tem vận chuyển',
  booking_status_push: 'Cập nhật lịch lấy hàng',
  booking_trackingno_push: 'Cập nhật tracking lấy hàng',
  booking_shipping_document_status_push: 'Cập nhật tem lấy hàng',
  package_fulfillment_status_push: 'Cập nhật kiện hàng',
  courier_delivery_binding_status_push: 'Cập nhật liên kết vận chuyển',
  package_info_push: 'Cập nhật thông tin kiện hàng',
  reserved_stock_change_push: 'Cập nhật tồn kho giữ chỗ',
  item_price_update_push: 'Cập nhật giá sản phẩm',
  video_upload_push: 'Cập nhật video sản phẩm',
  video_upload_result_push: 'Kết quả tải video',
  violation_item_push: 'Cảnh báo vi phạm bài đăng',
  item_scheduled_publish_failed_push: 'Lỗi đăng lịch sản phẩm',
  brand_register_result: 'Kết quả đăng ký thương hiệu',
  shop_penalty_update_push: 'Cập nhật điểm phạt shop',
  shopee_updates: 'Thông báo Shopee',
  open_api_authorization_expiry: 'Cảnh báo token sắp hết hạn',
  shop_authorization_push: 'Shop cấp quyền API',
  shop_authorization_canceled_push: 'Shop hủy quyền API',
  fbs_sellable_stock: 'Cập nhật tồn FBS',
  fbs_br_invoice_error_push: 'Lỗi hóa đơn FBS',
  fbs_br_invoice_issued_push: 'Hóa đơn FBS đã phát hành',
  fbs_br_block_shop_push: 'FBS chặn shop',
  fbs_br_block_sku_push: 'FBS chặn SKU'
}

export const MARKETING_CODES = ['item_promotion_push', 'promotion_update_push']

export const PRODUCT_CODES = [
  'reserved_stock_change_push',
  'item_price_update_push',
  'video_upload_push',
  'video_upload_result_push',
  'violation_item_push',
  'item_scheduled_publish_failed_push',
  'brand_register_result'
]

export function normalizeEvent(row) {
  const payload = parseJson(row.payload, {})
  const eventCode = cleanText(row.event_code || payload?.push?.key)
  const entityId = cleanText(payload?.entity_id || payload?.body?.item_id || payload?.body?.promotion_id || payload?.body?.conversation_id)
  return {
    id: row.id,
    type: 'webhook',
    platform: cleanText(row.platform),
    shop: cleanText(row.shop || row.shop_id),
    title: EVENT_TITLES[eventCode] || eventCode || 'Sự kiện từ sàn',
    detail: cleanText(row.order_id)
      ? `Đơn ${cleanText(row.order_id)}`
      : (entityId ? `Mã liên quan ${entityId}` : cleanText(row.message || 'Đã nhận tín hiệu')),
    status: cleanText(row.status || 'ok'),
    time: cleanText(row.processed_at),
    event_code: eventCode,
    order_id: cleanText(row.order_id)
  }
}

export function normalizeDraft(row) {
  return {
    id: row.id,
    type: 'draft',
    platform: 'đa sàn',
    shop: '',
    title: cleanText(row.title || `Bản nháp #${row.id}`),
    detail: `Trạng thái ${cleanText(row.status || 'draft')}`,
    status: cleanText(row.status || 'draft'),
    time: cleanText(row.updated_at || row.created_at)
  }
}

export function normalizeVariation(row) {
  const price = safeNumber(row.discount_price || row.price)
  const stock = safeNumber(row.stock)
  return {
    id: row.id,
    type: 'stock_price',
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    title: cleanText(row.product_name || row.platform_sku || row.internal_sku || 'Bài đăng'),
    detail: `${cleanText(row.platform_sku || row.internal_sku || 'SKU chưa rõ')} - Giá ${price.toLocaleString('vi-VN')}đ - Tồn ${stock.toLocaleString('vi-VN')}`,
    status: cleanText(row.map_status || 'synced'),
    time: cleanText(row.updated_at)
  }
}

export function normalizeReturn(row) {
  return {
    id: row.order_id,
    type: 'return',
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    title: `Đơn ${cleanText(row.order_id)}`,
    detail: `${cleanText(row.order_type || row.oms_status || 'hoàn/trả')} - ${cleanText(row.shipping_status || 'chưa có trạng thái')}`,
    status: cleanText(row.oms_status || row.order_type || 'return'),
    time: cleanText(row.oms_updated_at || row.order_date)
  }
}

export function normalizeFinance(row) {
  const totalFees = safeNumber(row.total_fees)
  const settlement = safeNumber(row.settlement)
  const profit = safeNumber(row.profit_real)
  return {
    id: row.order_id,
    type: 'finance',
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    title: `Đối soát đơn ${cleanText(row.order_id)}`,
    detail: `Phí ${totalFees.toLocaleString('vi-VN')}đ - Quyết toán ${settlement.toLocaleString('vi-VN')}đ - Lãi ${profit.toLocaleString('vi-VN')}đ`,
    status: cleanText(row.source || 'api_fee'),
    time: cleanText(row.updated_at)
  }
}

export function formatMoney(value) {
  return `${Math.round(safeNumber(value)).toLocaleString('vi-VN')}đ`
}

export function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0%'
  return `${number.toFixed(number >= 10 ? 0 : 1)}%`
}

export function shopIdentityKeys(row = {}) {
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

export function buildApiShopKeySet(capabilities = []) {
  const keys = new Set()
  for (const shop of capabilities || []) {
    if (shop.capability_mode !== 'api_active') continue
    for (const key of shopIdentityKeys(shop)) keys.add(key)
  }
  return keys
}

export function isApiShopRow(row = {}, apiKeys = new Set()) {
  if (foldText(row.source_mode) === 'api_sync') return true
  const platform = foldText(row.platform)
  return [row.shop, row.shop_name, row.user_name, row.api_shop_id]
    .map(value => foldText(value))
    .filter(Boolean)
    .some(value => apiKeys.has(`${platform}:${value}`))
}

export function workspaceMetric(label, value, tone = '') {
  return { label, value: String(value ?? '0'), tone }
}

export function workspaceRow(row = {}) {
  return {
    title: cleanText(row.title),
    meta: cleanText(row.meta),
    detail: cleanText(row.detail),
    status: cleanText(row.status || 'ok'),
    time: cleanText(row.time)
  }
}

export const ORDER_PHASE1_ACTIVE_WHERE = `(
  UPPER(COALESCE(oms_status, '')) IN ('PENDING', 'RETURN')
  OR UPPER(COALESCE(shipping_status, '')) IN (
    'IN_CANCEL',
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
  )
)`

export const ORDER_PHASE2_CANDIDATE_WHERE = `(
  UPPER(COALESCE(shipping_status, '')) IN (
    'IN_CANCEL',
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
  )
  OR (
    UPPER(COALESCE(oms_status, '')) IN ('PENDING', 'SHIPPING', 'RETURN')
    AND COALESCE(tracking_number, '') = ''
  )
)`

export const ORDER_PHASE2_SHIP_STATUSES = new Set([
  'READY_TO_SHIP',
  'PROCESSED',
  'LOGISTICS_PENDING_ARRANGE',
  'LOGISTICS_REQUEST_CREATED'
])

export function orderPhase1Label(row = {}) {
  const shipping = cleanText(row.shipping_status).toUpperCase()
  const oms = cleanText(row.oms_status).toUpperCase()
  if (shipping === 'IN_CANCEL') return 'Khách yêu cầu hủy, cần xác nhận'
  if (shipping === 'LOGISTICS_PACKAGED') return 'Đã đóng gói, chờ quét trạng thái hoặc bàn giao'
  if (['FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT'].includes(shipping)) return 'Giao không thành công, cần kiểm tra'
  if (['TO_RETURN', 'RETURN', 'RETURN_REFUND', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST'].includes(shipping) || oms === 'RETURN') return 'Hoàn/trả, cần đối soát'
  if (shipping === 'LOGISTICS_REQUEST_CREATED' || shipping === 'PROCESSED') return 'Đã xử lý, chờ lấy hàng'
  return 'Chờ xử lý'
}

export function orderPhase2ActionLabel(row = {}, hasApi = false) {
  const platform = cleanText(row.platform).toLowerCase()
  const shipping = cleanText(row.shipping_status).toUpperCase()
  const missingTracking = !cleanText(row.tracking_number)
  if (!hasApi) return 'Shop không API: xử lý bằng quét trình duyệt/import/thao tác tay'
  if (platform === 'lazada') return 'Lazada: phase 2 chỉ đọc/đối soát, lệnh ghi đang khóa chờ guard riêng'
  if (shipping === 'IN_CANCEL') return 'Shopee: chờ chọn Đồng ý hủy hoặc Từ chối hủy ở guard OMS'
  if (ORDER_PHASE2_SHIP_STATUSES.has(shipping)) return 'Shopee: có thể preview dry-run ship_order'
  if (shipping === 'LOGISTICS_PACKAGED') return 'Shopee: đã đóng gói, ưu tiên quét tracking/trạng thái'
  if (missingTracking) return 'Shopee: cần đọc tracking/logistics trước khi xử lý tiếp'
  if (['FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT'].includes(shipping)) return 'Shopee: giao không thành công, cần kiểm tra tracking'
  if (['TO_RETURN', 'RETURN', 'RETURN_REFUND', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST'].includes(shipping)) return 'Shopee: hoàn/trả, chuyển sang đối soát return'
  return 'Shopee: chờ đối soát trạng thái mới'
}

export function orderPhase2SqlScope(options = {}) {
  const clauses = [`LOWER(COALESCE(platform, '')) IN ('shopee', 'lazada')`, ORDER_PHASE2_CANDIDATE_WHERE]
  const binds = []
  const platform = cleanText(options.platform).toLowerCase()
  const shop = cleanText(options.shop)
  if (platform && ['shopee', 'lazada'].includes(platform)) {
    clauses.push(`LOWER(COALESCE(platform, '')) = ?`)
    binds.push(platform)
  }
  if (shop) {
    clauses.push(`LOWER(COALESCE(shop, '')) = LOWER(?)`)
    binds.push(shop)
  }
  return { where: clauses.map(clause => `(${clause})`).join(' AND '), binds }
}

export async function loadOrderPhase2Workspace(env, limit) {
  const scope = orderPhase2SqlScope()
  const [byShop, recentOrders, capabilities] = await Promise.all([
    safeAll(env, `
      SELECT platform, shop,
             COUNT(*) AS total,
             SUM(CASE WHEN LOWER(COALESCE(platform, '')) = 'shopee'
                        AND UPPER(COALESCE(shipping_status, '')) IN ('READY_TO_SHIP','PROCESSED','LOGISTICS_PENDING_ARRANGE','LOGISTICS_REQUEST_CREATED')
                 THEN 1 ELSE 0 END) AS ship_ready,
             SUM(CASE WHEN UPPER(COALESCE(shipping_status, '')) = 'IN_CANCEL' THEN 1 ELSE 0 END) AS buyer_cancel,
             SUM(CASE WHEN COALESCE(tracking_number, '') = '' THEN 1 ELSE 0 END) AS missing_tracking,
             SUM(CASE WHEN LOWER(COALESCE(source_mode, '')) = 'api_sync' THEN 1 ELSE 0 END) AS api_rows
      FROM orders_v2
      WHERE ${scope.where}
      GROUP BY platform, shop
      ORDER BY ship_ready DESC, buyer_cancel DESC, missing_tracking DESC, total DESC
      LIMIT 12
    `, scope.binds),
    safeAll(env, `
      SELECT order_id, platform, shop, source_mode, oms_status, shipping_status,
             tracking_number, shipping_carrier, customer_name, revenue, order_date, oms_updated_at
      FROM orders_v2
      WHERE ${scope.where}
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(platform, '')) = 'shopee'
            AND UPPER(COALESCE(shipping_status, '')) IN ('READY_TO_SHIP','PROCESSED','LOGISTICS_PENDING_ARRANGE','LOGISTICS_REQUEST_CREATED') THEN 0
          WHEN UPPER(COALESCE(shipping_status, '')) = 'IN_CANCEL' THEN 1
          WHEN COALESCE(tracking_number, '') = '' THEN 2
          WHEN LOWER(COALESCE(source_mode, '')) != 'api_sync' THEN 3
          ELSE 4
        END,
        datetime(COALESCE(NULLIF(oms_updated_at, ''), NULLIF(order_date, ''), '1970-01-01')) DESC,
        order_id DESC
      LIMIT ?
    `, [...scope.binds, Math.max(limit, 12)]),
    listMarketplaceShopCapabilities(env, { platform: '', limit: 300 })
  ])

  const apiKeys = buildApiShopKeySet(capabilities)
  let shipReady = 0
  let buyerCancel = 0
  let missingTracking = 0
  let manualOnly = 0
  const breakdown = byShop.map(row => {
    const hasApi = isApiShopRow(row, apiKeys) || safeNumber(row.api_rows) > 0
    if (hasApi && cleanText(row.platform).toLowerCase() === 'shopee') shipReady += safeNumber(row.ship_ready)
    if (hasApi) {
      buyerCancel += safeNumber(row.buyer_cancel)
      missingTracking += safeNumber(row.missing_tracking)
    } else {
      manualOnly += safeNumber(row.total)
    }
    return workspaceRow({
      title: `${cleanText(row.platform)} · ${cleanText(row.shop || 'Chưa rõ shop')}`,
      meta: hasApi ? 'Có API' : 'Không API',
      detail: `Sẵn sàng dry-run ${safeNumber(row.ship_ready).toLocaleString('vi-VN')} · Hủy chờ chọn ${safeNumber(row.buyer_cancel).toLocaleString('vi-VN')} · Thiếu tracking ${safeNumber(row.missing_tracking).toLocaleString('vi-VN')} · Tổng ${safeNumber(row.total).toLocaleString('vi-VN')}`,
      status: hasApi ? 'ok' : 'warning'
    })
  })

  const rows = recentOrders.map(row => {
    const hasApi = isApiShopRow(row, apiKeys)
    return workspaceRow({
      title: `Đơn ${row.order_id}`,
      meta: `${cleanText(row.platform)} · ${cleanText(row.shop)} · ${hasApi ? 'Shop có API' : 'Shop không API'}`,
      detail: `${orderPhase2ActionLabel(row, hasApi)} · ${cleanText(row.shipping_status || row.oms_status || 'chưa rõ trạng thái')} · ${cleanText(row.tracking_number || 'Chưa có tracking')}`,
      status: hasApi ? 'ok' : 'warning',
      time: row.oms_updated_at || row.order_date
    })
  })

  return {
    id: 'order_phase2',
    group: 'Đơn hàng',
    title: 'Order API phase 2: thao tác có guard',
    status: 'module_ready_write_guard',
    summary: 'Chuẩn bị bước thao tác an toàn sau phase 1: phân loại đơn có thể dry-run Shopee ship_order/mass_ship_order, đơn hủy cần người vận hành chọn hướng, Lazada và shop không API được tách riêng để không thao tác nhầm.',
    metrics: [
      workspaceMetric('Sẵn sàng dry-run ship', shipReady.toLocaleString('vi-VN'), shipReady ? 'warning' : 'ok'),
      workspaceMetric('Hủy cần chọn hướng', buyerCancel.toLocaleString('vi-VN'), buyerCancel ? 'warning' : 'ok'),
      workspaceMetric('Thiếu tracking API', missingTracking.toLocaleString('vi-VN'), missingTracking ? 'warning' : 'ok'),
      workspaceMetric('Shop không API', manualOnly.toLocaleString('vi-VN'), manualOnly ? 'warning' : 'ok')
    ],
    breakdown,
    rows,
    actions: [
      { type: 'api', action: 'preview_order_phase2', label: 'Preview dry-run phase 2' }
    ]
  }
}

export async function loadOrderPhase1Workspace(env, limit) {
  const [summary, byShop, recentOrders, capabilities] = await Promise.all([
    safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN UPPER(COALESCE(shipping_status, '')) = 'IN_CANCEL' THEN 1 ELSE 0 END) AS buyer_cancel,
             SUM(CASE WHEN UPPER(COALESCE(shipping_status, '')) = 'LOGISTICS_PACKAGED' THEN 1 ELSE 0 END) AS packaged,
             SUM(CASE WHEN UPPER(COALESCE(oms_status, '')) = 'PENDING' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN UPPER(COALESCE(oms_status, '')) = 'RETURN'
                       OR UPPER(COALESCE(shipping_status, '')) IN ('FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT','TO_RETURN','RETURN','RETURN_REFUND','LOGISTICS_IN_RETURN','LOGISTICS_RETURNED_BY_SHIPPER','LOGISTICS_RETURN_PACKAGE_RECEIVED','LOGISTICS_LOST')
                 THEN 1 ELSE 0 END) AS reverse_attention,
             SUM(CASE WHEN UPPER(COALESCE(oms_status, '')) IN ('PENDING','SHIPPING')
                       AND COALESCE(tracking_number, '') = ''
                 THEN 1 ELSE 0 END) AS missing_tracking,
             SUM(CASE WHEN LOWER(COALESCE(source_mode, '')) = 'api_sync' THEN 1 ELSE 0 END) AS api_rows
      FROM orders_v2
      WHERE LOWER(COALESCE(platform, '')) IN ('shopee', 'lazada')
        AND ${ORDER_PHASE1_ACTIVE_WHERE}
    `),
    safeAll(env, `
      SELECT platform, shop,
             COUNT(*) AS total,
             SUM(CASE WHEN UPPER(COALESCE(shipping_status, '')) = 'IN_CANCEL' THEN 1 ELSE 0 END) AS buyer_cancel,
             SUM(CASE WHEN UPPER(COALESCE(shipping_status, '')) = 'LOGISTICS_PACKAGED' THEN 1 ELSE 0 END) AS packaged,
             SUM(CASE WHEN UPPER(COALESCE(oms_status, '')) = 'RETURN'
                       OR UPPER(COALESCE(shipping_status, '')) IN ('FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT','TO_RETURN','RETURN','RETURN_REFUND','LOGISTICS_IN_RETURN','LOGISTICS_RETURNED_BY_SHIPPER','LOGISTICS_RETURN_PACKAGE_RECEIVED','LOGISTICS_LOST')
                 THEN 1 ELSE 0 END) AS reverse_attention,
             SUM(CASE WHEN LOWER(COALESCE(source_mode, '')) = 'api_sync' THEN 1 ELSE 0 END) AS api_rows
      FROM orders_v2
      WHERE LOWER(COALESCE(platform, '')) IN ('shopee', 'lazada')
        AND ${ORDER_PHASE1_ACTIVE_WHERE}
      GROUP BY platform, shop
      ORDER BY buyer_cancel DESC, packaged DESC, reverse_attention DESC, total DESC
      LIMIT 8
    `),
    safeAll(env, `
      SELECT order_id, platform, shop, source_mode, oms_status, shipping_status,
             tracking_number, shipping_carrier, customer_name, revenue, order_date, oms_updated_at
      FROM orders_v2
      WHERE LOWER(COALESCE(platform, '')) IN ('shopee', 'lazada')
        AND ${ORDER_PHASE1_ACTIVE_WHERE}
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(shipping_status, '')) = 'IN_CANCEL' THEN 0
          WHEN UPPER(COALESCE(shipping_status, '')) = 'LOGISTICS_PACKAGED' THEN 1
          WHEN UPPER(COALESCE(oms_status, '')) = 'RETURN'
            OR UPPER(COALESCE(shipping_status, '')) IN ('FAILED_DELIVERY','FAILED_DELIVERY_ATTEMPT','TO_RETURN','RETURN','RETURN_REFUND','LOGISTICS_IN_RETURN','LOGISTICS_RETURNED_BY_SHIPPER','LOGISTICS_RETURN_PACKAGE_RECEIVED','LOGISTICS_LOST') THEN 2
          WHEN LOWER(COALESCE(source_mode, '')) != 'api_sync' THEN 3
          ELSE 4
        END,
        datetime(COALESCE(NULLIF(oms_updated_at, ''), NULLIF(order_date, ''), '1970-01-01')) DESC,
        order_id DESC
      LIMIT ?
    `, [limit]),
    listMarketplaceShopCapabilities(env, { platform: '', limit: 300 })
  ])

  const apiKeys = buildApiShopKeySet(capabilities)
  const rows = recentOrders.map(row => {
    const apiMode = isApiShopRow(row, apiKeys) ? 'Shop có API' : 'Shop không API'
    return workspaceRow({
      title: `Đơn ${row.order_id}`,
      meta: `${cleanText(row.platform)} · ${cleanText(row.shop)} · ${apiMode}`,
      detail: `${orderPhase1Label(row)} · ${cleanText(row.shipping_carrier || 'Chưa rõ DVVC')} · ${cleanText(row.tracking_number || 'Chưa có tracking')}`,
      status: cleanText(row.shipping_status || row.oms_status || 'order'),
      time: row.oms_updated_at || row.order_date
    })
  })

  const breakdown = byShop.map(row => {
    const apiMode = isApiShopRow(row, apiKeys) || safeNumber(row.api_rows) > 0 ? 'Có API' : 'Không API'
    return workspaceRow({
      title: `${cleanText(row.platform)} · ${cleanText(row.shop || 'Chưa rõ shop')}`,
      meta: apiMode,
      detail: `Cần xử lý ${safeNumber(row.total).toLocaleString('vi-VN')} đơn · Hủy chờ xác nhận ${safeNumber(row.buyer_cancel).toLocaleString('vi-VN')} · Đóng gói ${safeNumber(row.packaged).toLocaleString('vi-VN')} · Hoàn/trả ${safeNumber(row.reverse_attention).toLocaleString('vi-VN')}`,
      status: apiMode === 'Có API' ? 'ok' : 'warning',
      time: ''
    })
  })

  return {
    id: 'order_phase1',
    group: 'Đơn hàng',
    title: 'Order API phase 1: đồng bộ và việc cần xử lý',
    status: 'module_ready_read',
    summary: 'Gom Shopee/Lazada vào một khu đọc dữ liệu thật từ OMS/API, tách shop có API và shop không API, ưu tiên đơn khách yêu cầu hủy, đã đóng gói, thiếu tracking và hoàn/trả.',
    metrics: [
      workspaceMetric('Đơn cần theo dõi', safeNumber(summary?.total).toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Khách yêu cầu hủy', safeNumber(summary?.buyer_cancel).toLocaleString('vi-VN'), safeNumber(summary?.buyer_cancel) ? 'warning' : 'ok'),
      workspaceMetric('Đã đóng gói', safeNumber(summary?.packaged).toLocaleString('vi-VN'), safeNumber(summary?.packaged) ? 'warning' : 'ok'),
      workspaceMetric('Thiếu tracking', safeNumber(summary?.missing_tracking).toLocaleString('vi-VN'), safeNumber(summary?.missing_tracking) ? 'warning' : 'ok')
    ],
    breakdown,
    rows,
    actions: [
      { type: 'api', action: 'refresh_order_phase1', label: 'Làm mới order phase 1' }
    ]
  }
}
