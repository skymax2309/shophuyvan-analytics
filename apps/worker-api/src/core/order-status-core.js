const ORDER_STATUS_LABELS = {
  UNPAID: 'chưa thanh toán',
  PENDING: 'chờ xử lý',
  READY_TO_SHIP: 'chờ chuẩn bị hàng',
  PROCESSED: 'đã xử lý',
  LOGISTICS_PENDING_ARRANGE: 'chờ lấy hàng',
  LOGISTICS_REQUEST_CREATED: 'đã tạo vận đơn',
  LOGISTICS_PACKAGED: 'đã đóng gói',
  SHIPPING: 'đang giao',
  SHIPPED: 'đang giao',
  TO_CONFIRM_RECEIVE: 'chờ khách nhận',
  COMPLETED: 'đã hoàn thành',
  CANCELLED: 'đã hủy',
  IN_CANCEL: 'khách yêu cầu hủy',
  TO_RETURN: 'trả hàng/hoàn tiền',
  RETURN: 'trả hàng/hoàn tiền',
  RETURN_REFUND: 'trả hàng/hoàn tiền',
  RETURN_COMPLAINT: 'đang khiếu nại hoàn/trả',
  LOGISTICS_IN_RETURN: 'đang hoàn hàng',
  LOGISTICS_RETURNED_BY_SHIPPER: 'đơn hoàn về shop',
  LOGISTICS_RETURN_PACKAGE_RECEIVED: 'shop đã nhận hàng hoàn',
  LOGISTICS_LOST: 'thất lạc hàng',
  FAILED_DELIVERY: 'giao không thành công',
  FAILED_DELIVERY_ATTEMPT: 'giao không thành công'
}

const ORDER_KIND_LABELS = {
  new: 'đơn mới',
  failed: 'giao không thành công',
  return: 'trả hàng/hoàn tiền',
  cancelled: 'đơn hủy',
  completed: 'hoàn thành',
  shipping: 'đang giao',
  changed: 'cập nhật trạng thái'
}

export const OMS_STATUS_ALIASES = {
  PENDING: ['PENDING', 'LOGISTICS_PENDING_ARRANGE', 'LOGISTICS_REQUEST_CREATED', 'LOGISTICS_PACKAGED', 'ADVANCE_FULFILMENT', 'IN_CANCEL'],
  SHIPPING: ['SHIPPING', 'SHIPPED', 'TO_CONFIRM_RECEIVE'],
  SHIPPED: ['SHIPPING', 'SHIPPED', 'TO_CONFIRM_RECEIVE'],
  CANCELLED: ['CANCELLED', 'CANCELLED_TRANSIT'],
  RETURN: ['RETURN', 'TO_RETURN', 'RETURN_REFUND', 'RETURN_COMPLAINT', 'LOGISTICS_IN_RETURN', 'LOGISTICS_RETURNED_BY_SHIPPER', 'LOGISTICS_RETURN_PACKAGE_RECEIVED', 'LOGISTICS_LOST', 'FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT']
}

export const CHILD_TO_PARENT_STATUS = {
  LOGISTICS_PENDING_ARRANGE: 'PENDING',
  READY_TO_SHIP: 'PENDING',
  confirmed: 'PENDING',
  PROCESSED: 'PENDING',
  LOGISTICS_REQUEST_CREATED: 'PENDING',
  LOGISTICS_PACKAGED: 'PENDING',
  ADVANCE_FULFILMENT: 'PENDING',
  SHIPPED: 'SHIPPING',
  TO_CONFIRM_RECEIVE: 'SHIPPING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  CANCELLED_TRANSIT: 'CANCELLED',
  IN_CANCEL: 'PENDING',
  TO_RETURN: 'RETURN',
  RETURN: 'RETURN',
  RETURN_REFUND: 'RETURN',
  RETURN_COMPLAINT: 'RETURN',
  LOGISTICS_IN_RETURN: 'RETURN',
  LOGISTICS_RETURNED_BY_SHIPPER: 'RETURN',
  LOGISTICS_RETURN_PACKAGE_RECEIVED: 'RETURN',
  LOGISTICS_LOST: 'RETURN',
  FAILED_DELIVERY: 'RETURN',
  FAILED_DELIVERY_ATTEMPT: 'RETURN'
}

export const ACTIVE_PENDING_ORDER_WINDOW_DAYS = 30

export const ACTIVE_PENDING_OPERATIONAL_STATUSES = [
  'PENDING',
  'LOGISTICS_PENDING_ARRANGE',
  'READY_TO_SHIP',
  'CONFIRMED',
  'PROCESSED',
  'LOGISTICS_REQUEST_CREATED',
  'LOGISTICS_PACKAGED',
  'ADVANCE_FULFILMENT',
  'IN_CANCEL'
]

function cleanStatusText(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\u00a0/g, ' ').trim()
}

export function normalizeOrderStatusText(value) {
  return cleanStatusText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
}

export function isShopeeReturnEligibilityWindowText(value) {
  const key = normalizeOrderStatusText(value)
  if (!key) return false
  // NEO: Shopee ghi câu còn thời hạn gửi yêu cầu trả/hoàn sau khi khách đã nhận hàng; đây không phải trạng thái hoàn thật để tính KPI.
  return (
    /VAN CO THE GUI YEU CAU.*TRA HANG.*HOAN TIEN.*TOI NGAY/.test(key)
    || /CO THE GUI YEU CAU.*TRA HANG.*HOAN TIEN.*TOI NGAY/.test(key)
    || /CAN STILL (SUBMIT|SEND|FILE).*(RETURN|REFUND).*REQUEST.*(UNTIL|BY)/.test(key)
  )
}

export function getOrderStatusValue(row = {}, fallback = '') {
  if (!row || typeof row !== 'object') return cleanStatusText(row || fallback)
  return cleanStatusText(
    row.shipping_status
    || row.logistics_status
    || row.delivery_status
    || row.oms_status
    || row.status
    || row.order_status
    || row.order_type
    || fallback
  )
}

export function orderStatusLabel(value, fallback = 'chưa rõ trạng thái') {
  const raw = cleanStatusText(value)
  if (!raw) return fallback
  const key = normalizeOrderStatusText(raw)
  // Một nơi duy nhất đổi mã trạng thái sàn sang tiếng Việt để dashboard, chat và cron không lệch nhau.
  if (ORDER_STATUS_LABELS[key]) return ORDER_STATUS_LABELS[key]
  if (/RETURN|REFUND|TO_RETURN|HOAN|TRA HANG/.test(key)) return 'trả hàng/hoàn tiền'
  if (/FAILED_DELIVERY|DELIVERY_FAILED|LOST|GIAO KHONG THANH CONG/.test(key)) return 'giao không thành công'
  if (/CANCEL|HUY/.test(key)) return 'đã hủy'
  if (/COMPLETED|DELIVERED|RECEIVED|DA GIAO|GIAO THANH CONG/.test(key)) return 'đã hoàn thành'
  if (/SHIPPED|SHIPPING|TO_CONFIRM_RECEIVE|IN_TRANSIT|DANG GIAO|VAN CHUYEN/.test(key)) return 'đang giao'
  if (/READY|PICKUP|LOGISTICS_REQUEST|LOGISTICS_PENDING|PACKAGED|CHO LAY HANG/.test(key)) return 'chờ lấy hàng'
  if (/UNPAID|PENDING_PAYMENT|CHO THANH TOAN/.test(key)) return 'chưa thanh toán'
  if (/PENDING|PROCESS|CONFIRM|WAIT|NEW|CHO XU LY|DANG XU LY/.test(key)) return 'chờ xử lý'
  return raw || fallback
}

export function orderStatusKind(row = {}, reason = '') {
  const statusText = [
    reason,
    row?._push_reason,
    row?.order_type,
    row?.oms_status,
    row?.shipping_status,
    row?.logistics_status,
    row?.delivery_status,
    typeof row === 'string' ? row : ''
  ].map(cleanStatusText).join(' ')
  const key = normalizeOrderStatusText(statusText)
  if (/\bNEW\b/.test(key)) return 'new'
  if (/IN_CANCEL|KHACH YEU CAU HUY|YEU CAU HUY/.test(key)) return 'changed'
  if (/FAILED_DELIVERY|DELIVERY_FAILED|LOGISTICS_LOST|LOST|GIAO KHONG THANH CONG/.test(key)) return 'failed'
  if (/RETURN|REFUND|TO_RETURN|HOAN|TRA HANG/.test(key)) return 'return'
  if (/CANCEL|HUY/.test(key)) return 'cancelled'
  if (/COMPLETED|DELIVERED|RECEIVED|DA GIAO/.test(key)) return 'completed'
  if (/SHIPPING|SHIPPED|TO_CONFIRM_RECEIVE|IN_TRANSIT|DANG GIAO/.test(key)) return 'shipping'
  return 'changed'
}

export function orderTypeFromStatus(row = {}, fallback = 'normal') {
  // Chuẩn hóa một chỗ để Dashboard, OMS, import và cron cùng hiểu hủy/hoàn giống nhau.
  const statusOnly = typeof row === 'string'
    ? row
    : [
        row?.oms_status,
        row?.shipping_status,
        row?.logistics_status,
        row?.delivery_status
      ].map(cleanStatusText).filter(Boolean).join(' ')
  const statusKey = normalizeOrderStatusText(statusOnly)
  // IN_CANCEL là yêu cầu hủy đang chờ người bán xử lý, chưa được tính là đơn hủy thật.
  if (/IN_CANCEL|KHACH YEU CAU HUY|YEU CAU HUY/.test(statusKey)) return 'normal'
  if (/FAILED_DELIVERY|DELIVERY_FAILED|LOGISTICS_LOST|LOST|RETURN|REFUND|TO_RETURN|HOAN|TRA HANG/.test(statusKey)) return 'return'
  if (/CANCEL|HUY/.test(statusKey)) return 'cancel'
  const raw = cleanStatusText(row?.order_type || fallback).toLowerCase()
  return raw === 'cancel' || raw === 'return' ? raw : 'normal'
}

export function orderKindLabel(kind) {
  return ORDER_KIND_LABELS[cleanStatusText(kind)] || ORDER_KIND_LABELS.changed
}

export function orderStatusParent(value) {
  const raw = cleanStatusText(value)
  if (!raw) return ''
  const key = normalizeOrderStatusText(raw)
  return CHILD_TO_PARENT_STATUS[key] || key
}

export function isOperationalPendingStatus(omsStatus = '', shippingStatus = '') {
  // Cửa sổ này chỉ áp dụng cho các trạng thái đang cần thao tác đóng gói/xử lý, không đụng vào hoàn/hủy/lịch sử.
  const keys = [omsStatus, shippingStatus].map(normalizeOrderStatusText).filter(Boolean)
  if (!keys.length) return false
  return keys.some(key => (
    ACTIVE_PENDING_OPERATIONAL_STATUSES.includes(key)
    || CHILD_TO_PARENT_STATUS[key] === 'PENDING'
    || /CHUA XU LY|CHO XAC NHAN|CHO LAY HANG|DA XU LY|DA DONG GOI/.test(key)
  ))
}

export function isStaleOperationalPendingOrder(row = {}, maxAgeDays = ACTIVE_PENDING_ORDER_WINDOW_DAYS, now = new Date()) {
  if (!isOperationalPendingStatus(row?.oms_status, row?.shipping_status)) return false
  const rawDate = cleanStatusText(row?.order_date || row?.created_at)
  if (!rawDate) return false
  const orderTime = new Date(rawDate.includes('T') ? rawDate : `${rawDate.replace(' ', 'T')}+07:00`)
  if (Number.isNaN(orderTime.getTime())) return false
  const cutoff = new Date(now.getTime() - Math.max(1, Number(maxAgeDays) || ACTIVE_PENDING_ORDER_WINDOW_DAYS) * 86400000)
  return orderTime < cutoff
}

export function activePendingOrderWindowSql(alias = 'o', maxAgeDays = ACTIVE_PENDING_ORDER_WINDOW_DAYS) {
  const safeAlias = String(alias || 'o').replace(/[^A-Za-z0-9_]/g, '') || 'o'
  const days = Math.max(1, Number.parseInt(maxAgeDays, 10) || ACTIVE_PENDING_ORDER_WINDOW_DAYS)
  return `date(${safeAlias}.order_date) >= date('now', '-${days} days')`
}

export function expandOrderStatusFilter(status) {
  const parts = cleanStatusText(status).split(',').map(item => item.trim()).filter(Boolean)
  const values = parts.flatMap(item => OMS_STATUS_ALIASES[normalizeOrderStatusText(item)] || [item])
  return [...new Set(values)]
}

export function normalizeOrderStatusPair(omsStatus, shippingStatus) {
  const oms = cleanStatusText(omsStatus)
  const shipping = cleanStatusText(shippingStatus)
  if (!oms) return { oms: '', shipping }
  const parent = orderStatusParent(oms)
  if (shipping) return { oms: parent || oms, shipping }
  if (parent && parent !== oms) return { oms: parent, shipping: oms }
  return { oms, shipping: '' }
}

export function orderStatusUiClass(value) {
  const kind = typeof value === 'string' ? orderStatusKind(value) : orderStatusKind(value || {})
  if (kind === 'completed') return 'ok'
  if (kind === 'return' || kind === 'cancelled' || kind === 'failed') return 'bad'
  if (kind === 'shipping') return 'ship'
  return 'wait'
}

export function normalizeReverseLifecycleStatus(platform = '', ...values) {
  const platformKey = cleanStatusText(platform).toLowerCase()
  const text = values.map(cleanStatusText).join(' ')
  const key = normalizeOrderStatusText(text)
  if (!key) return 'open'
  if (/REJECT|DENY|DECLINED|DISPUTE|ESCALAT|NEGOTIATION/.test(key)) return 'dispute'
  if (/CANCEL|VOID|ABORT|REVOKE|RETURN_CANCELED/.test(key)) return 'cancelled'
  if (/CLOSED|COMPLETE|COMPLETED|FINISH|FINISHED|SUCCESS|APPROVED|REFUND_SUCCESS|RETURN_SUCCESS/.test(key)) return 'closed'
  if (platformKey === 'shopee' && /PROCESSING|PENDING|REQUEST|WAIT|IN_RETURN|TO_RETURN|RETURN_REFUND/.test(key)) return 'open'
  if (platformKey === 'lazada' && /REQUEST_INITIATE|INITIAL|PENDING|PROCESS|WAIT|PICK_UP|PICKUP|IN_TRANSIT/.test(key)) return 'open'
  return 'open'
}

export function normalizeReverseLedgerKind(entry = {}, fallback = 'return') {
  const requestType = cleanStatusText(entry.request_type || entry.requestType)
  const statusText = [
    requestType,
    entry.reverse_status,
    entry.line_status,
    entry.reason_text,
    entry.reason_code
  ].map(cleanStatusText).join(' ')
  const key = normalizeOrderStatusText(statusText)
  if (/FAILED_DELIVERY|DELIVERY_FAILED|LOGISTICS_LOST/.test(key)) return 'failed'
  if (/CANCEL|ONLY_CANCEL/.test(key)) return 'cancel'
  if (/ONLY_REFUND|REFUND_ONLY|REFUND/.test(key)) return 'return'
  if (/RETURN|RTM|RTP|REVERSE/.test(key)) return 'return'
  return fallback
}

export function isReverseFinanceClosed(entry = {}) {
  const lifecycle = normalizeReverseLifecycleStatus(
    entry.platform,
    entry.reverse_status,
    entry.line_status,
    entry.request_type
  )
  if (lifecycle !== 'closed') return false
  const key = normalizeOrderStatusText([
    entry.reverse_status,
    entry.line_status,
    entry.request_type
  ].map(cleanStatusText).join(' '))
  if (/RETURN_CANCELED|CANCEL/.test(key) && !/REFUND/.test(key)) return false
  return true
}
