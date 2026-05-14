import {
  cleanText,
  costValue,
  findKey,
  foldText,
  hasFolded,
  toDate,
  toInt,
  toMoney
} from './shared.js'

function isBlankReturnStatus(value) {
  const folded = foldText(value)
  if (!folded) return true
  return [
    'khong',
    'khong co',
    'khong yeu cau',
    'khong ap dung',
    'chua co',
    'none',
    'no request',
    'not requested',
    'n/a',
    'na'
  ].includes(folded)
}

function isGenericReturnLabel(value) {
  const folded = foldText(value).replace(/\s*\/\s*/g, '/')
  return [
    'tra hang/hoan tien',
    'trang thai tra hang/hoan tien'
  ].includes(folded)
}

function isShopeeReturnStatus(value, row) {
  const status = cleanText(value)
  if (isBlankReturnStatus(status) || isGenericReturnLabel(status)) return false
  if (toMoney(findKey(row, 'Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)')) > 0) return true

  // NEO: Cột trả hàng Shopee chỉ được tính hoàn khi có trạng thái xử lý thật, không tính nhãn rỗng/generic khiến KPI Hoàn bị phình.
  return hasFolded(status, [
    'return_refund',
    'return/refund',
    'yeu cau tra hang',
    'dang tra hang',
    'da tra hang',
    'hoan tien thanh cong',
    'da hoan tien',
    'chap thuan',
    'khieu nai',
    'can xu ly khieu nai'
  ])
}

function isShopeeCancelStatus(orderStatus, cancelReason) {
  const status = foldText(orderStatus)
  const reason = foldText(cancelReason)
  return status === 'da huy' || status === 'da huy don' || !!reason
}

export function normalizeShopeeOrder(row, shop) {
  const orderId = cleanText(findKey(row, 'Mã đơn hàng'))
  if (!orderId) return null

  const orderStatus = cleanText(findKey(row, 'Trạng Thái Đơn Hàng'))
  const returnStatus = cleanText(findKey(row, 'Trạng thái Trả hàng/Hoàn tiền'))
  const cancelReason = cleanText(findKey(row, 'Lý do hủy'))
  const isCancel = isShopeeCancelStatus(orderStatus, cancelReason)
  const isReturn = isShopeeReturnStatus(returnStatus, row)

  let orderType = 'normal'
  if (isCancel) orderType = 'cancel'
  if (isReturn) orderType = 'return'

  const qty = toInt(findKey(row, 'Số lượng'))
  const totalSale = toMoney(findKey(row, 'Tổng giá bán (sản phẩm)'))
  const lineBuyerPaid = toMoney(findKey(row, 'Tổng số tiền Người mua thanh toán'))
  const orderTotal = toMoney(findKey(row, 'Tổng giá trị đơn hàng (VND)'))
    || toMoney(findKey(row, 'Tổng số tiền người mua thanh toán'))
  const rawRevenue = totalSale > 0 ? totalSale : lineBuyerPaid
  const lineRevenue = orderType === 'normal' ? rawRevenue : 0
  const shipped = !!cleanText(findKey(row, 'Ngày gửi hàng'))
  const failedDeliveryCancel = orderType === 'cancel' && hasFolded(cancelReason, [
    'giao that bai',
    'khong giao duoc',
    'failed delivery'
  ])

  return {
    platform: 'shopee',
    shop,
    order_id: orderId,
    order_status: orderStatus,
    shipping_provider: cleanText(findKey(row, 'Đơn vị vận chuyển')),
    order_date: toDate(findKey(row, 'Ngày đặt hàng')),
    shipped,
    product_name: cleanText(findKey(row, 'Tên sản phẩm')),
    sku: cleanText(findKey(row, 'SKU phân loại hàng')),
    qty,
    revenue: lineRevenue,
    raw_revenue: rawRevenue,
    // NEO: File đơn Shopee mới lặp tổng đơn trên từng dòng SKU; order phải dùng tổng này một lần để không đội doanh thu.
    order_total_revenue: orderTotal,
    shopee_voucher: toMoney(findKey(row, 'Mã giảm giá của Shopee')),
    shopee_subsidy: toMoney(findKey(row, 'Được Shopee trợ giá')),
    shop_discount: toMoney(findKey(row, 'Mã giảm giá của Shop')),
    combo_discount: toMoney(findKey(row, 'Giảm giá từ Combo của Shop')),
    return_amount: orderType === 'return' ? rawRevenue : 0,
    order_type: orderType,
    cancel_reason: orderType === 'cancel' ? (cancelReason || orderStatus) : (orderType === 'return' ? returnStatus : null),
    discount_shop: toMoney(findKey(row, 'Mã giảm giá của Shop')),
    discount_shopee: toMoney(findKey(row, 'Mã giảm giá của Shopee')),
    discount_combo: toMoney(findKey(row, 'Giảm giá từ Combo của Shop')),
    shipping_return_fee: toMoney(findKey(row, 'Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)')),
    return_fee: orderType === 'return'
      ? costValue('shopee_return_fee', 1620)
      : (failedDeliveryCancel ? costValue('shopee_failed_delivery_fee', 1620) : 0)
  }
}
