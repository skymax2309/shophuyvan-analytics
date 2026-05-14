import { cleanText, costValue, findKey, hasFolded, toDate, toInt, toMoney } from './shared.js'

export function normalizeTiktokOrder(row, shop) {
  const orderId = cleanText(findKey(row, 'Order ID'))
  if (!orderId || orderId.length < 10 || !/^\d+$/.test(orderId)) return null

  const orderStatus = cleanText(findKey(row, 'Order Status'))
  const cancelType = cleanText(findKey(row, 'Cancelation/Return Type'))
  const cancelReason = cleanText(findKey(row, 'Cancel Reason'))

  let orderType = 'normal'
  if (orderStatus.toLowerCase() === 'cancelled' || orderStatus === 'Đã hủy' || cancelType === 'Cancel') orderType = 'cancel'
  if (cancelType === 'Return/Refund') orderType = 'return'

  const skuSubtotal = toMoney(findKey(row, 'SKU Subtotal After Discount'))
  const platformDiscount = toMoney(findKey(row, 'SKU Platform Discount'))
  const grossRevenue = skuSubtotal + platformDiscount
  const refundAmount = toMoney(findKey(row, 'Order Refund Amount'))
  const failedDelivery = hasFolded(cancelReason, ['giao goi hang that bai', 'failed delivery'])

  let returnFee = 0
  if (orderType === 'return') returnFee = costValue('tiktok_return_fee', 4620)
  else if (orderType === 'cancel' && failedDelivery) returnFee = costValue('tiktok_failed_delivery_fee', 1620)

  return {
    platform: 'tiktok',
    shop,
    order_id: orderId,
    order_status: orderStatus,
    shipping_provider: cleanText(findKey(row, 'Shipping Provider')),
    order_date: toDate(findKey(row, 'Created Time')),
    shipped: !!(cleanText(findKey(row, 'Tracking ID')) || cleanText(findKey(row, 'Shipped Time'))),
    product_name: cleanText(findKey(row, 'Product Name')),
    sku: cleanText(findKey(row, 'Seller SKU')),
    qty: toInt(findKey(row, 'Quantity')),
    revenue: orderType === 'normal' ? grossRevenue : 0,
    raw_revenue: grossRevenue,
    shopee_voucher: 0,
    shopee_subsidy: platformDiscount,
    shop_discount: 0,
    combo_discount: 0,
    return_amount: orderType === 'return' ? refundAmount || grossRevenue : 0,
    order_type: orderType,
    cancel_reason: cancelReason || cancelType || null,
    return_fee: returnFee
  }
}
