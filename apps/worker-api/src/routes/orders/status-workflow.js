import { expandOrderStatusFilter, isOperationalPendingStatus, isShopeeReturnEligibilityWindowText, normalizeOrderStatusPair as normalizeCoreOrderStatusPair, orderTypeFromStatus } from '../../core/order-status-core.js'

export function expandOmsStatusFilter(status) {
  // Dùng core chung để filter RETURN/CANCELLED không lệch giữa OMS, Dashboard và cron.
  return expandOrderStatusFilter(status)
}

export function normalizeOmsStatusPair(omsStatus, shippingStatus) {
  return normalizeCoreOrderStatusPair(omsStatus, shippingStatus)
}

export function orderTypeFromWorkflowStatus(workflowStatus = {}, fallback = 'normal') {
  // Import, sửa tay và normalize lịch sử đều đi qua core này để không lệch giữa order_type và OMS status.
  return orderTypeFromStatus({
    order_type: fallback,
    oms_status: workflowStatus.oms || workflowStatus.oms_status || '',
    shipping_status: workflowStatus.shipping || workflowStatus.shipping_status || ''
  }, fallback)
}

export function cleanOrderText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na', 'chưa rõ', 'chua ro'].includes(lower)) return ''
  return text
}

export async function addOrdersColumnIfMissing(env, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE orders_v2 ADD COLUMN ${definition}`).run()
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
  }
}

export async function ensureOrderReturnComplaintColumns(env) {
  // Tab "Đang khiếu nại" chỉ lọc trạng thái hồ sơ nội bộ, không đổi trạng thái vận chuyển thật của sàn.
  await addOrdersColumnIfMissing(env, "return_complaint_status TEXT DEFAULT ''")
  await addOrdersColumnIfMissing(env, "return_complaint_updated_at TEXT DEFAULT ''")
  await addOrdersColumnIfMissing(env, "return_complaint_note TEXT DEFAULT ''")
}

export async function ensureOrderBuyerIdentityColumns(env) {
  // Shopee Order API trả buyer_user_id; lưu vào đơn để chat API dùng làm to_id chuẩn khi nhắn từ OMS.
  await addOrdersColumnIfMissing(env, "buyer_id TEXT DEFAULT ''")
  await addOrdersColumnIfMissing(env, "buyer_username TEXT DEFAULT ''")
}

export function foldOrderStatusText(value) {
  return cleanOrderText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, match => match === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function statusHas(text, keywords) {
  return keywords.some(keyword => text.includes(keyword))
}

export const PENDING_CHILD_RANK = {
  LOGISTICS_PENDING_ARRANGE: 1,
  READY_TO_SHIP: 1,
  confirmed: 1,
  LOGISTICS_REQUEST_CREATED: 2,
  PROCESSED: 2,
  LOGISTICS_PACKAGED: 3,
  ADVANCE_FULFILMENT: 3
}

export const RETURN_WORKFLOW_SHIP_STATUSES = [
  'RETURN',
  'RETURN_REFUND',
  'RETURN_COMPLAINT',
  'TO_RETURN',
  'FAILED_DELIVERY',
  'FAILED_DELIVERY_ATTEMPT',
  'LOGISTICS_IN_RETURN',
  'LOGISTICS_RETURNED_BY_SHIPPER',
  'LOGISTICS_RETURN_PACKAGE_RECEIVED',
  'LOGISTICS_LOST'
]

export const CANCEL_WORKFLOW_SHIP_STATUSES = ['CANCELLED', 'CANCELLED_TRANSIT']

export function addReturnWorkflowCondition(conds, params, alias = 'o') {
  const marks = RETURN_WORKFLOW_SHIP_STATUSES.map(() => '?').join(',')
  conds.push(`(
    ${alias}.order_type = 'return'
    OR ${alias}.oms_status = 'RETURN'
    OR ${alias}.shipping_status IN (${marks})
  )`)
  params.push(...RETURN_WORKFLOW_SHIP_STATUSES)
}

export function addCancelledWorkflowCondition(conds, params, alias = 'o') {
  const marks = CANCEL_WORKFLOW_SHIP_STATUSES.map(() => '?').join(',')
  conds.push(`(
    ${alias}.order_type = 'cancel'
    OR ${alias}.oms_status = 'CANCELLED'
    OR ${alias}.shipping_status IN (${marks})
  )`)
  params.push(...CANCEL_WORKFLOW_SHIP_STATUSES)
}

export function shouldLimitActivePendingWindow(status = '', shipping = '') {
  const statusArr = status ? expandOmsStatusFilter(status) : []
  const shippingArr = cleanOrderText(shipping).split(',').map(item => item.trim()).filter(Boolean)
  return [...statusArr, ...shippingArr].some(value => (
    isOperationalPendingStatus(value, '')
    || isOperationalPendingStatus('', value)
  ))
}

export function keepHigherPendingProgress(existing = {}, next = {}) {
  const oldOms = cleanOrderText(existing.oms_status || '').toUpperCase()
  const oldShip = cleanOrderText(existing.shipping_status || '')
  if (oldOms !== 'PENDING' || next.oms !== 'PENDING') return next
  const oldRank = PENDING_CHILD_RANK[oldShip] || 0
  const nextRank = PENDING_CHILD_RANK[next.shipping] || 0
  if (oldRank > nextRank) return { ...next, shipping: oldShip }
  return next
}

export function normalizeImportedWorkflowStatus(order = {}, rawShippingStatus = '') {
  const rawOms = cleanOrderText(order.oms_status)
  const rawShip = cleanOrderText(rawShippingStatus)
  const type = foldOrderStatusText(order.order_type)
  const returnSignalText = value => isShopeeReturnEligibilityWindowText(value) ? '' : value
  const folded = [
    rawShip,
    order.order_status,
    order.status,
    order.fulfillment_status,
    order.logistics_status,
    order.cancel_reason,
    order.return_status,
    order.refund_status
  ].map(foldOrderStatusText).filter(Boolean).join(' ')
  const upper = [
    rawOms,
    rawShip,
    order.order_status,
    order.status,
    order.fulfillment_status,
    order.logistics_status
  ].map(value => cleanOrderText(value).toUpperCase()).filter(Boolean).join(' ')
  const returnFolded = [
    returnSignalText(rawShip),
    returnSignalText(order.order_status),
    returnSignalText(order.status),
    returnSignalText(order.fulfillment_status),
    returnSignalText(order.logistics_status),
    order.cancel_reason,
    order.return_status,
    order.refund_status
  ].map(foldOrderStatusText).filter(Boolean).join(' ')
  const returnUpper = [
    rawOms,
    returnSignalText(rawShip),
    returnSignalText(order.order_status),
    returnSignalText(order.status),
    returnSignalText(order.fulfillment_status),
    returnSignalText(order.logistics_status)
  ].map(value => cleanOrderText(value).toUpperCase()).filter(Boolean).join(' ')

  const buyerCancelPending = statusHas(upper, ['IN_CANCEL']) ||
    statusHas(folded, ['khach yeu cau huy', 'yeu cau huy', 'dang huy'])
  // Yêu cầu hủy của khách cần người bán xác nhận, chưa được tính là đơn đã hủy.
  if (buyerCancelPending) return { oms: 'PENDING', shipping: 'IN_CANCEL' }

  const cancelled = statusHas(upper, ['CANCELLED', 'CANCELED', 'CANCELLED_TRANSIT']) ||
    statusHas(folded, ['da huy', 'huy don', 'cancelled', 'canceled', 'cancel '])
  if (type === 'cancel' || cancelled) return { oms: 'CANCELLED', shipping: 'CANCELLED' }

  const failedDelivery = statusHas(upper, ['FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT']) ||
    statusHas(folded, [
    'failed_delivery',
    'failed delivery',
    'giao that bai',
    'giao hang that bai',
    'giao khong thanh cong',
    'khong giao duoc',
    'delivery failed',
    'unsuccessful delivery'
  ])
  if (failedDelivery) return { oms: 'RETURN', shipping: 'FAILED_DELIVERY' }

  const returnLike = statusHas(returnUpper, ['RETURN', 'RETURN_REFUND', 'RETURN_COMPLAINT', 'TO_RETURN', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST']) ||
    statusHas(returnFolded, ['return_refund', 'tra hang', 'hoan tien', 'hoan hang', 'package returned', 'refund'])
  if (type === 'return' || returnLike) {
    const detail = ['RETURN_COMPLAINT', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_IN_RETURN', 'LOGISTICS_LOST', 'FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT', 'RETURN_REFUND', 'TO_RETURN', 'RETURN']
      .find(status => returnUpper.includes(status))
    if (detail) return { oms: 'RETURN', shipping: detail === 'TO_RETURN' ? 'RETURN_REFUND' : detail }
    const refundLike = statusHas(returnFolded, ['refund', 'hoan tien', 'return_refund'])
    return { oms: 'RETURN', shipping: refundLike ? 'RETURN_REFUND' : 'RETURN' }
  }

  const shipping = statusHas(upper, ['SHIPPED', 'TO_CONFIRM_RECEIVE']) ||
    // Bot quét trạng thái có thể đọc được câu "đã giao cho vận chuyển"; đây là kiện đã rời kho, không phải khách đã nhận hàng.
    statusHas(folded, ['dang giao', 'dang van chuyen', 'da van chuyen', 'da giao cho van chuyen', 'da giao cho dvvc', 'da gui', 'in transit', 'shipped'])
  if (shipping) return { oms: 'SHIPPING', shipping: upper.includes('TO_CONFIRM_RECEIVE') ? 'TO_CONFIRM_RECEIVE' : 'SHIPPED' }

  const completed = statusHas(upper, ['COMPLETED']) ||
    statusHas(folded, ['nguoi mua xac nhan', 'da nhan duoc hang', 'delivery done', 'delivered', 'completed', 'hoan thanh', 'da giao'])
  if (completed) return { oms: 'COMPLETED', shipping: 'COMPLETED' }

  const packaged = statusHas(upper, ['LOGISTICS_PACKAGED', 'ADVANCE_FULFILMENT']) ||
    statusHas(folded, ['da dong goi', 'dong goi xong', 'packed', 'packaged'])
  if (packaged) return { oms: 'PENDING', shipping: upper.includes('ADVANCE_FULFILMENT') ? 'ADVANCE_FULFILMENT' : 'LOGISTICS_PACKAGED' }

  const processed = statusHas(upper, ['LOGISTICS_REQUEST_CREATED', 'PROCESSED']) ||
    statusHas(folded, ['cho lay hang', 'cho giao hang', 'cho ban giao', 'da xu ly', 'da chuan bi', 'awaiting collection', 'waiting pickup', 'ready for pickup', 'processing'])
  if (processed) return { oms: 'PENDING', shipping: 'LOGISTICS_REQUEST_CREATED' }

  const unpaid = statusHas(upper, ['UNPAID']) || statusHas(folded, ['cho thanh toan', 'unpaid'])
  if (unpaid) return { oms: 'UNPAID', shipping: 'UNPAID' }

  const pending = statusHas(upper, ['LOGISTICS_PENDING_ARRANGE', 'READY_TO_SHIP']) ||
    statusHas(folded, ['cho xac nhan', 'chua xu ly', 'can gui', 'cho dong goi', 'pending', 'ready_to_ship'])
  if (pending || !rawOms) return { oms: 'PENDING', shipping: 'LOGISTICS_PENDING_ARRANGE' }

  const pair = normalizeOmsStatusPair(rawOms, rawShip)
  return {
    oms: pair.oms || 'PENDING',
    shipping: pair.shipping || rawShip || 'LOGISTICS_PENDING_ARRANGE'
  }
}

export function normalizePlatform(value) {
  return cleanOrderText(value).toLowerCase()
}

export function orderNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

export function orderItemIdentityKey(item = {}) {
  return [
    cleanOrderText(item.order_id),
    cleanOrderText(item.sku),
    cleanOrderText(item.variation_name),
    cleanOrderText(item.product_name),
    cleanOrderText(item.image_url)
  ].join('\u001f')
}

export function orderItemExactKey(item = {}) {
  return [
    orderItemIdentityKey(item),
    orderNumber(item.qty || 1),
    orderNumber(item.revenue_line),
    orderNumber(item.cost_real),
    orderNumber(item.cost_invoice)
  ].join('\u001f')
}

export function itemRevenueSum(items = []) {
  return items.reduce((sum, item) => sum + Math.abs(orderNumber(item.revenue_line)), 0)
}

export function orderRevenueValue(order = {}) {
  return Math.abs(orderNumber(order.revenue || order.raw_revenue))
}

export function isLikelyDuplicateItemOvercount(order, items = []) {
  const orderRevenue = orderRevenueValue(order)
  if (!orderRevenue) return false
  return itemRevenueSum(items) > Math.max(orderRevenue + 1000, orderRevenue * 1.5)
}

export function dedupeIncomingItemsByOrder(rawItems = [], orders = []) {
  const orderById = new Map((orders || []).map(order => [cleanOrderText(order.order_id), order]))
  const itemsByOrder = new Map()
  for (const item of rawItems || []) {
    const orderId = cleanOrderText(item?.order_id)
    if (!orderId) continue
    if (!itemsByOrder.has(orderId)) itemsByOrder.set(orderId, [])
    itemsByOrder.get(orderId).push(item)
  }

  const normalized = []
  for (const [orderId, orderItems] of itemsByOrder.entries()) {
    const order = orderById.get(orderId) || {}
    if (!isLikelyDuplicateItemOvercount(order, orderItems)) {
      normalized.push(...orderItems)
      continue
    }

    const seenExact = new Set()
    for (const item of orderItems) {
      const key = orderItemExactKey(item)
      if (seenExact.has(key)) continue
      seenExact.add(key)
      normalized.push(item)
    }
  }

  return normalized
}

export function normalizeDisplayItemsForOrder(order = {}, orderItems = []) {
  const items = Array.isArray(orderItems) ? orderItems : []
  if (items.length < 2) return items

  if (isLikelyDuplicateItemOvercount(order, items)) {
    const seenExact = new Set()
    return items.filter(item => {
      const key = orderItemExactKey(item)
      if (seenExact.has(key)) return false
      seenExact.add(key)
      return true
    })
  }

  const grouped = new Map()
  for (const item of items) {
    const key = orderItemIdentityKey(item)
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, { ...item })
      continue
    }
    current.qty = orderNumber(current.qty || 1) + orderNumber(item.qty || 1)
    current.revenue_line = orderNumber(current.revenue_line) + orderNumber(item.revenue_line)
    current.cost_real = orderNumber(current.cost_real) + orderNumber(item.cost_real)
    current.cost_invoice = orderNumber(current.cost_invoice) + orderNumber(item.cost_invoice)
    current.db_sku_check = current.db_sku_check || item.db_sku_check
    if (!current.image_url && item.image_url) current.image_url = item.image_url
  }
  return [...grouped.values()]
}

export function compactOrderItemsByIdentity(items = []) {
  const grouped = new Map()
  for (const item of items || []) {
    const key = orderItemIdentityKey(item)
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, { ...item })
      continue
    }

    // Gộp dòng cùng SKU trong cùng đơn để D1 không phình dòng lặp nhưng vẫn giữ nguyên tổng tiền và giá vốn.
    current.qty = orderNumber(current.qty || 1) + orderNumber(item.qty || 1)
    current.revenue_line = orderNumber(current.revenue_line) + orderNumber(item.revenue_line)
    current.cost_real = orderNumber(current.cost_real) + orderNumber(item.cost_real)
    current.cost_invoice = orderNumber(current.cost_invoice) + orderNumber(item.cost_invoice)
    if (!current.image_url && item.image_url) current.image_url = item.image_url
  }
  return [...grouped.values()]
}
