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

const DISPLAY_STATUS_VI = {
  PENDING: 'Chờ xử lý',
  READY_TO_SHIP: 'Đã xử lý / sẵn sàng giao',
  WAIT_PICKUP: 'Chờ lấy hàng',
  SHIPPING: 'Đang giao',
  COMPLETED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  RETURN: 'Hoàn / trả',
  FAILED_DELIVERY: 'Giao thất bại',
  UNKNOWN: 'Lỗi / cần kiểm tra'
}

const TERMINAL_STATUS_CODES = new Set(['COMPLETED', 'CANCELLED', 'RETURN', 'FAILED_DELIVERY'])

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

function firstStatusText(...values) {
  for (const value of values) {
    const text = cleanStatusText(value)
    if (text) return text
  }
  return ''
}

function hasStatusSignal(key, patterns = []) {
  return patterns.some(pattern => pattern.test(key))
}

function coreStatusFromText(value) {
  const key = normalizeOrderStatusText(value)
  if (!key) return 'UNKNOWN'
  if (hasStatusSignal(key, [/FAILED_DELIVERY/, /DELIVERY_FAILED/, /LOGISTICS_LOST/, /LOST/, /GIAO KHONG THANH CONG/, /GIAO THAT BAI/])) {
    return 'FAILED_DELIVERY'
  }
  if (hasStatusSignal(key, [/RETURN/, /REFUND/, /TO_RETURN/, /HOAN/, /TRA HANG/])) return 'RETURN'
  if (hasStatusSignal(key, [/CANCEL/, /HUY/])) return 'CANCELLED'
  if (hasStatusSignal(key, [/COMPLETED/, /DELIVERED/, /RECEIVED/, /DA GIAO/, /GIAO THANH CONG/])) return 'COMPLETED'
  if (hasStatusSignal(key, [/SHIPPED/, /SHIPPING/, /TO_CONFIRM_RECEIVE/, /IN_TRANSIT/, /DANG GIAO/, /VAN CHUYEN/])) return 'SHIPPING'
  if (hasStatusSignal(key, [/LOGISTICS_PACKAGED/, /PROCESSED/, /ADVANCE_FULFILMENT/, /DA DONG GOI/, /PACKAGED/, /PACKED/])) {
    return 'READY_TO_SHIP'
  }
  if (hasStatusSignal(key, [/READY_TO_SHIP/, /PICKUP/, /LOGISTICS_REQUEST/, /LOGISTICS_PENDING/, /CHO LAY HANG/])) {
    return 'WAIT_PICKUP'
  }
  const pendingExact = new Set(['UNPAID', 'PENDING_PAYMENT', 'PENDING', 'PROCESSING', 'CONFIRMED', 'WAITING', 'NEW', 'IN_CANCEL'])
  if (pendingExact.has(key) || hasStatusSignal(key, [/CHO THANH TOAN/, /PENDING/, /PROCESS/, /CONFIRM/, /WAIT/, /CHO XU LY/, /DANG XU LY/, /IN_CANCEL/])) {
    return 'PENDING'
  }
  return 'UNKNOWN'
}

function fulfillmentStatusFromText(value, coreStatus) {
  const key = normalizeOrderStatusText(value)
  if (!key) return coreStatus || 'UNKNOWN'
  const aliases = [
    'LOGISTICS_PENDING_ARRANGE',
    'LOGISTICS_REQUEST_CREATED',
    'LOGISTICS_PACKAGED',
    'ADVANCE_FULFILMENT',
    'IN_CANCEL',
    'SHIPPED',
    'TO_CONFIRM_RECEIVE',
    'COMPLETED',
    'CANCELLED',
    'CANCELLED_TRANSIT',
    'RETURN_REFUND',
    'RETURN_COMPLAINT',
    'LOGISTICS_IN_RETURN',
    'LOGISTICS_RETURNED_BY_SHIPPER',
    'LOGISTICS_RETURN_PACKAGE_RECEIVED',
    'LOGISTICS_LOST',
    'FAILED_DELIVERY',
    'FAILED_DELIVERY_ATTEMPT',
    'READY_TO_SHIP',
    'PROCESSED',
    'UNPAID',
    'RETURN'
  ]
  const exact = aliases.find(alias => key === alias)
  if (exact) return exact
  if (coreStatus === 'READY_TO_SHIP') return 'LOGISTICS_PACKAGED'
  if (coreStatus === 'WAIT_PICKUP') return 'LOGISTICS_REQUEST_CREATED'
  if (coreStatus === 'SHIPPING') return 'SHIPPED'
  if (coreStatus === 'FAILED_DELIVERY') return 'FAILED_DELIVERY'
  return coreStatus || 'UNKNOWN'
}

export function displayStatusViForCore(coreStatus) {
  return DISPLAY_STATUS_VI[cleanStatusText(coreStatus).toUpperCase()] || DISPLAY_STATUS_VI.UNKNOWN
}

export function normalizeOrderStatusCore(row = {}, fallback = '') {
  const rawPlatformStatus = getOrderStatusValue(row, fallback)
  const normalizedType = orderTypeFromStatus(row, row?.order_type || 'normal')
  const rawCoreStatus = coreStatusFromText(rawPlatformStatus)
  const statusKind = orderStatusKind({ ...row, order_type: normalizedType }, row?.cancel_reason || '')
  let orderStatusCore = rawCoreStatus
  let labelReason = ''

  // order_type là kết quả Core/return ledger đã chuẩn hóa; khi sàn vẫn để COMPLETED, read model phải ưu tiên loại đơn hoàn.
  if (normalizedType === 'return' && rawCoreStatus !== 'FAILED_DELIVERY') {
    if (rawCoreStatus === 'COMPLETED') labelReason = 'order_type=return nên không hiển thị như đơn đã giao.'
    orderStatusCore = 'RETURN'
  } else if (normalizedType === 'cancel') {
    orderStatusCore = 'CANCELLED'
  } else if (statusKind === 'failed') {
    orderStatusCore = 'FAILED_DELIVERY'
  }

  const fulfillmentStatusCore = fulfillmentStatusFromText(rawPlatformStatus, orderStatusCore)
  const unknown = orderStatusCore === 'UNKNOWN'
  return {
    raw_platform_status: rawPlatformStatus,
    order_status_core: orderStatusCore,
    fulfillment_status_core: unknown ? 'UNKNOWN' : fulfillmentStatusCore,
    display_status_vi: displayStatusViForCore(orderStatusCore),
    order_type: normalizedType,
    status_kind: statusKind,
    terminal_status: TERMINAL_STATUS_CODES.has(orderStatusCore),
    status_parent: orderStatusCore,
    status_reason: labelReason || (unknown ? 'Raw status chưa có trong Order Status Core.' : '')
  }
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

export function mapMarketplaceOrderStatus(platform = '', rawStatus = '', details = {}) {
  const platformKey = cleanStatusText(platform).toLowerCase()
  const status = cleanStatusText(rawStatus).toUpperCase()
  const statusKey = normalizeOrderStatusText(rawStatus)
  const packageStatus = firstStatusText(details.packageStatus, details.package_status, details.logisticsStatus, details.logistics_status)
  const logistics = packageStatus.toUpperCase()
  const logisticsLower = packageStatus.toLowerCase()
  const logisticsKey = normalizeOrderStatusText(packageStatus)
  const tracking = firstStatusText(details.tracking, details.tracking_number, details.trackingNo, details.tracking_no)
  const hasTracking = Boolean(tracking)

  if (platformKey === 'tiktok') {
    const tiktokTextKey = `${statusKey} ${logisticsKey}`
    const isCancelled = /DA HUY|CANCELLED|CANCELED/.test(tiktokTextKey)
    const isFailedDelivery = /GIAO KHONG THANH CONG|GIAO THAT BAI|LOST BY 3PL|FAILED_DELIVERY/.test(tiktokTextKey)
    const isReturn = /TRA HANG|HOAN HANG|RETURN|REFUND|HUY & TRA HANG/.test(tiktokTextKey)
    const isCompleted = /NGUOI MUA XAC NHAN|DA GIAO|COMPLETED|DA HOAN TAT|HOAN TAT|HOAN THANH|DA HOAN THANH/.test(tiktokTextKey)
    const isShipping = /DANG GIAO|DA VAN CHUYEN|SHIPPED|DA GUI|DANG TRUNG CHUYEN|IN_TRANSIT/.test(tiktokTextKey)
    const isPrepared = /DANG CHO LAY HANG|CHO LAY HANG|DA CHUAN BI|CHO BAN GIAO|DA XU LY|PROCESSED/.test(tiktokTextKey)
    const isPending = /CHO XAC NHAN|READY_TO_SHIP|CHO DONG GOI|CHUA XU LY|DANG CHO VAN CHUYEN|CAN XU LY/.test(tiktokTextKey)

    if (isFailedDelivery) return { oms: 'RETURN', shipping: 'FAILED_DELIVERY', type: 'return', reason: 'Giao hàng thất bại' }
    if (isCancelled) return { oms: 'CANCELLED', shipping: 'CANCELLED', type: 'cancel', reason: 'Đã hủy' }
    if (isReturn) return { oms: 'RETURN', shipping: 'RETURN', type: 'return', reason: 'Trả hàng/Hoàn tiền' }
    if (isCompleted) return { oms: 'COMPLETED', shipping: 'COMPLETED', type: 'normal' }
    if (isShipping) return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
    if (isPrepared) return { oms: 'PENDING', shipping: hasTracking ? 'LOGISTICS_PACKAGED' : 'LOGISTICS_REQUEST_CREATED', type: 'normal' }
    if (isPending) return { oms: 'PENDING', shipping: 'LOGISTICS_PENDING_ARRANGE', type: 'normal' }
  }

  if (platformKey === 'shopee') {
    const shopeeTextKey = `${statusKey} ${logisticsKey}`
    const isCarrierHandoff = /DA GIAO CHO (DVVC|DON VI VAN CHUYEN)|DANG DUOC GIAO TOI NGUOI MUA|DON HANG DA ROI BUU CUC/.test(shopeeTextKey)
    const isCompleted = status === 'COMPLETED' ||
      /LOGISTICS_DELIVERY_DONE|COMPLETED|DELIVERED|RECEIVED|DA GIAO|GIAO THANH CONG|GIAO HANG THANH CONG/.test(shopeeTextKey) ||
      logistics.includes('LOGISTICS_DELIVERY_DONE') ||
      logistics.includes('DELIVERED') ||
      logisticsLower.includes('đã giao') ||
      logisticsLower.includes('da giao')
    const isBuyerCancelRequest = status === 'IN_CANCEL' ||
      logistics.includes('IN_CANCEL') ||
      logisticsLower.includes('khách yêu cầu hủy') ||
      logisticsLower.includes('khach yeu cau huy') ||
      logisticsLower.includes('yêu cầu hủy') ||
      logisticsLower.includes('yeu cau huy') ||
      logisticsLower.includes('yeu cau bi huy')
    const isCancelled = status === 'CANCELLED' ||
      logistics.includes('CANCELED') ||
      logistics.includes('CANCELLED') ||
      logisticsLower.includes('đã hủy') ||
      logisticsLower.includes('đã huỷ') ||
      logisticsLower.includes('da huy') ||
      logisticsLower.includes('yêu cầu bị hủy') ||
      logisticsLower.includes('yeu cau bi huy')
    const explicitReturnStatus = ['TO_RETURN', 'RETURN', 'RETURN_REFUND'].includes(status)
    const logisticsReturnSignal = logistics.includes('RETURN') ||
      logistics.includes('REFUND') ||
      logisticsLower.includes('trả hàng') ||
      logisticsLower.includes('tra hang') ||
      logisticsLower.includes('hoàn tiền') ||
      logisticsLower.includes('hoan tien') ||
      logisticsLower.includes('khiếu nại') ||
      logisticsLower.includes('khieu nai')
    const isReturnLike = explicitReturnStatus || (!isCompleted && logisticsReturnSignal)
    const isFailedDelivery = status === 'FAILED_DELIVERY' ||
      status === 'FAILED_DELIVERY_ATTEMPT' ||
      logistics.includes('FAILED') ||
      logisticsLower.includes('giao hàng không thành công') ||
      logisticsLower.includes('giao hang khong thanh cong') ||
      logisticsLower.includes('giao không thành công') ||
      logisticsLower.includes('giao khong thanh cong')

    if (isFailedDelivery) return { oms: 'RETURN', shipping: 'FAILED_DELIVERY', type: 'return', reason: 'Giao hàng thất bại' }
    if (isBuyerCancelRequest) return { oms: 'PENDING', shipping: 'IN_CANCEL', type: 'normal', reason: 'Khách yêu cầu hủy, cần xác nhận' }
    if (isCancelled) return { oms: 'CANCELLED', shipping: 'CANCELLED', type: 'cancel', reason: 'Đã hủy' }
    if (isCarrierHandoff) return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal', reason: 'Đã giao cho ĐVVC' }
    if (isCompleted) return { oms: 'COMPLETED', shipping: 'COMPLETED', type: 'normal' }
    if (isReturnLike) {
      return {
        oms: 'RETURN',
        shipping: explicitReturnStatus || logistics.includes('REFUND') ? 'RETURN_REFUND' : 'RETURN',
        type: 'return',
        reason: 'Trả hàng/Hoàn tiền'
      }
    }
    if (/DANG GIAO|DANG VAN CHUYEN|DANG TRUNG CHUYEN|IN_TRANSIT|SHIPPING|SHIPPED/.test(shopeeTextKey)) {
      return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
    }
    if (/CHO LAY HANG|DANG CHO LAY HANG|CHO DON VI VAN CHUYEN LAY HANG|CHO VAN CHUYEN|DA XU LY|DA DONG GOI|READY_TO_SHIP|PROCESSED|PACKED|PACKAGED/.test(shopeeTextKey)) {
      return hasTracking
        ? { oms: 'PENDING', shipping: 'LOGISTICS_PACKAGED', type: 'normal' }
        : { oms: 'PENDING', shipping: 'LOGISTICS_REQUEST_CREATED', type: 'normal' }
    }
    if (status === 'SHIPPED') return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
    if (status === 'TO_CONFIRM_RECEIVE') return { oms: 'SHIPPING', shipping: 'TO_CONFIRM_RECEIVE', type: 'normal' }
    if (logistics.includes('PICKUP_DONE') || logistics.includes('DELIVERY')) return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
    if (status === 'PROCESSED') {
      return hasTracking
        ? { oms: 'PENDING', shipping: 'LOGISTICS_PACKAGED', type: 'normal' }
        : { oms: 'PENDING', shipping: 'LOGISTICS_REQUEST_CREATED', type: 'normal' }
    }
    if (status === 'READY_TO_SHIP') {
      return hasTracking
        ? { oms: 'PENDING', shipping: 'LOGISTICS_PACKAGED', type: 'normal' }
        : { oms: 'PENDING', shipping: 'LOGISTICS_PENDING_ARRANGE', type: 'normal' }
    }
    if (status === 'TO_RETURN') return { oms: 'RETURN', shipping: 'RETURN_REFUND', type: 'return' }
  }

  if (platformKey === 'lazada') {
    const raw = status.toLowerCase()
    if (['delivered', 'completed'].includes(raw)) return { oms: 'COMPLETED', shipping: 'COMPLETED', type: 'normal' }
    if (['shipped', 'shipping', 'in_transit'].includes(raw)) return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
    if (['canceled', 'cancelled'].includes(raw)) return { oms: 'CANCELLED', shipping: 'CANCELLED', type: 'cancel' }
    if (['returned', 'return'].includes(raw)) return { oms: 'RETURN', shipping: 'RETURN', type: 'return' }
    if (['failed', 'failed_delivery'].includes(raw)) return { oms: 'SHIPPING', shipping: 'FAILED_DELIVERY_ATTEMPT', type: 'normal', reason: 'Lazada giao không thành công, chờ xử lý tiếp' }
    if (['ready_to_ship', 'packed', 'repacked', 'pending', 'unpaid', 'topack', 'to_pack', 'toship', 'to_ship'].includes(raw)) {
      return { oms: 'PENDING', shipping: 'LOGISTICS_PENDING_ARRANGE', type: 'normal' }
    }
  }

  if (['COMPLETED', 'DELIVERED'].includes(status)) return { oms: 'COMPLETED', shipping: 'COMPLETED', type: 'normal' }
  if (['SHIPPED', 'SHIPPING', 'IN_TRANSIT'].includes(status)) return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
  if (['TO_CONFIRM_RECEIVE'].includes(status)) return { oms: 'SHIPPING', shipping: 'TO_CONFIRM_RECEIVE', type: 'normal' }
  if (['READY_TO_SHIP'].includes(status)) {
    return hasTracking
      ? { oms: 'PENDING', shipping: 'LOGISTICS_PACKAGED', type: 'normal' }
      : { oms: 'PENDING', shipping: 'LOGISTICS_PENDING_ARRANGE', type: 'normal' }
  }
  if (['PROCESSED', 'PACKED', 'PACKAGED'].includes(status)) {
    return hasTracking
      ? { oms: 'PENDING', shipping: 'LOGISTICS_PACKAGED', type: 'normal' }
      : { oms: 'PENDING', shipping: 'LOGISTICS_REQUEST_CREATED', type: 'normal' }
  }
  if (['IN_CANCEL'].includes(status)) return { oms: 'PENDING', shipping: 'IN_CANCEL', type: 'normal', reason: 'Khách yêu cầu hủy, cần xác nhận' }
  if (['CANCELLED', 'CANCELED'].includes(status)) return { oms: 'CANCELLED', shipping: 'CANCELLED', type: 'cancel' }
  if (['TO_RETURN', 'RETURN', 'RETURN_REFUND'].includes(status)) return { oms: 'RETURN', shipping: status === 'TO_RETURN' ? 'RETURN_REFUND' : status, type: 'return' }
  if (['FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT'].includes(status)) return { oms: 'RETURN', shipping: 'FAILED_DELIVERY', type: 'return', reason: 'Giao hàng thất bại' }
  if (['UNPAID'].includes(status)) return { oms: 'UNPAID', shipping: 'UNPAID', type: 'normal' }
  if (['PENDING', 'READY', ''].includes(status)) return { oms: 'PENDING', shipping: 'LOGISTICS_PENDING_ARRANGE', type: 'normal' }

  // Không đoán trạng thái lạ: giữ mã raw trong shipping_status để read model đánh dấu cần kiểm tra.
  return { oms: 'PENDING', shipping: status || 'UNKNOWN', type: 'normal', reason: 'Raw status chưa có trong Order Status Core' }
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
