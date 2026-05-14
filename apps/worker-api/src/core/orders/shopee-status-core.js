function cleanText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na', 'chưa rõ', 'chua ro'].includes(lower)) return ''
  return text
}

function firstPackage(order) {
  const packages = Array.isArray(order?.package_list) ? order.package_list : []
  if (packages[0] && typeof packages[0] === 'object') return packages[0]
  return {}
}

function uniqueTexts(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))]
}

export function collectShopeePackageStatus(order, pkg = firstPackage(order)) {
  // NEO: Không trộn return_status phụ của Shopee vào logistics chung; trường phụ này có thể là nhãn tham chiếu và đã từng làm đơn COMPLETED bị đếm thành Hoàn.
  return uniqueTexts([
    order?.order_status,
    order?.status,
    order?.status_description,
    order?.cancel_reason,
    order?.buyer_cancel_reason,
    pkg?.logistics_status,
    pkg?.package_status,
    pkg?.shipping_status,
    pkg?.status,
    pkg?.status_description,
    pkg?.cancel_reason
  ]).join(' ')
}

export function mapShopeeStatus(rawStatus, packageStatus = '', tracking = '') {
  const status = cleanText(rawStatus).toUpperCase()
  const logisticsText = cleanText(packageStatus)
  const logistics = logisticsText.toUpperCase()
  const logisticsLower = logisticsText.toLowerCase()
  const hasTracking = !!cleanText(tracking)
  const isCompleted = status === 'COMPLETED' ||
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

  if (isFailedDelivery) {
    return { oms: 'RETURN', shipping: 'FAILED_DELIVERY', type: 'return', reason: 'Giao hàng thất bại' }
  }
  if (isBuyerCancelRequest) {
    return { oms: 'PENDING', shipping: 'IN_CANCEL', type: 'normal', reason: 'Khách yêu cầu hủy, cần xác nhận' }
  }
  if (isCancelled) {
    return { oms: 'CANCELLED', shipping: 'CANCELLED', type: 'cancel', reason: 'Đã hủy' }
  }
  if (isCompleted) {
    return { oms: 'COMPLETED', shipping: 'COMPLETED', type: 'normal' }
  }
  if (isReturnLike) {
    return {
      oms: 'RETURN',
      shipping: explicitReturnStatus || logistics.includes('REFUND') ? 'RETURN_REFUND' : 'RETURN',
      type: 'return',
      reason: 'Trả hàng/Hoàn tiền'
    }
  }
  if (status === 'SHIPPED') return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
  if (status === 'TO_CONFIRM_RECEIVE') return { oms: 'SHIPPING', shipping: 'TO_CONFIRM_RECEIVE', type: 'normal' }
  if (logistics.includes('PICKUP_DONE') || logistics.includes('DELIVERY')) {
    return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }
  }
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
  return { oms: 'PENDING', shipping: 'LOGISTICS_PENDING_ARRANGE', type: 'normal' }
}
