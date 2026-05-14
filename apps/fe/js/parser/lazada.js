import { cleanText, findKey, toDate, toMoney } from './shared.js'

export function normalizeLazadaOrder(row, shop) {
  const orderId = cleanText(findKey(row, 'orderNumber'))
  if (!orderId) return null

  const status = cleanText(findKey(row, 'status')).toLowerCase()
  let orderType = 'normal'
  if (status === 'canceled') orderType = 'cancel'
  if (status === 'returned' || status === 'package returned') orderType = 'return'

  const unitPrice = toMoney(findKey(row, 'unitPrice'))
  const paidPrice = toMoney(findKey(row, 'paidPrice'))
  const sellerDiscount = toMoney(findKey(row, 'sellerDiscountTotal'))
  const refundAmount = toMoney(findKey(row, 'refundAmount'))

  return {
    platform: 'lazada',
    shop,
    order_id: orderId,
    order_status: cleanText(findKey(row, 'status')),
    shipping_provider: cleanText(findKey(row, 'shippingProvider')),
    item_id: cleanText(findKey(row, 'orderItemId')),
    order_date: toDate(findKey(row, 'createTime')),
    product_name: cleanText(findKey(row, 'itemName')),
    sku: cleanText(findKey(row, 'sellerSku')),
    qty: 1,
    revenue: orderType === 'normal' ? unitPrice : 0,
    raw_revenue: unitPrice,
    paid_price: paidPrice,
    seller_discount: sellerDiscount,
    shopee_voucher: 0,
    shopee_subsidy: 0,
    shop_discount: sellerDiscount,
    combo_discount: 0,
    return_amount: orderType === 'return' ? (refundAmount || unitPrice) : 0,
    order_type: orderType,
    cancel_reason: orderType !== 'normal' ? status : null,
    return_fee: 0
  }
}
