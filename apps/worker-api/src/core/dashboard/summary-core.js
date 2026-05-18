import { orderStatusKind, orderTypeFromStatus } from '../orders/status-core.js'

function moneyNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeDashboardOrderType(row = {}) {
  return orderTypeFromStatus({
    ...row,
    order_type: row.order_type || row.ledger_kind || 'normal',
    shipping_status: row.shipping_status || row.return_status || row.ledger_status || ''
  }, row.order_type || row.ledger_kind || 'normal')
}

function normalizeCancelReasonText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function vietnameseCancelReason(reason = '') {
  const raw = normalizeCancelReasonText(reason)
  if (!raw) return 'Không rõ lý do'
  const viRaw = raw.replace(/lí do/gi, 'lý do')
  const text = viRaw.toLowerCase()
  if (text.includes('hủy bởi người mua') && text.includes('thay đổi đơn')) return 'Khách hủy: Thay đổi đơn hàng'
  if (text.includes('hủy bởi người mua') && text.includes('lý do khác')) return 'Khách hủy: Lý do khác'
  if (text.includes('không còn nhu cầu')) return 'Khách hủy: Không còn nhu cầu'
  const rules = [
    [/modify|change.*order|edit.*order/, 'Khách muốn chỉnh sửa đơn'],
    [/others|other|change.*mind|buyer.*change/, 'Khác / khách đổi ý'],
    [/found.*cheap|cheaper|better price/, 'Khách tìm được giá rẻ hơn'],
    [/need.*input|need.*change.*address|wrong address|address/, 'Khách muốn đổi hoặc nhập lại địa chỉ'],
    [/out.*stock|stock/, 'Shop hết hàng'],
    [/seller.*cancel|seller request/, 'Shop hủy đơn'],
    [/buyer.*cancel|customer.*request|customer request/, 'Khách yêu cầu hủy'],
    [/payment|unpaid|pay/, 'Thanh toán không thành công'],
    [/failed|delivery failed|not.*receipt|not.*receive|cannot deliver/, 'Giao hàng không thành công'],
    [/duplicate/, 'Đơn trùng'],
    [/fraud|risk/, 'Đơn có rủi ro']
  ]
  const found = rules.find(([pattern]) => pattern.test(text))
  if (found) return found[1]
  return viRaw
}

function dashboardStatusAggregate(rows = []) {
  const sets = {
    all: new Set(),
    normal: new Set(),
    completed: new Set(),
    shipping: new Set(),
    cancel: new Set(),
    return: new Set(),
    discountShop: new Set(),
    discountShopee: new Set(),
    discountCombo: new Set(),
    tiktokFailed: new Set(),
    tiktokReturn: new Set(),
    tiktokFreeCancel: new Set(),
    shopeeCancel: new Set(),
    shopeeFailed: new Set(),
    shopeeFreeCancel: new Set(),
    shopeeReturn: new Set(),
    lazadaCancel: new Set(),
    lazadaFailed: new Set(),
    lazadaFreeCancel: new Set(),
    lazadaReturn: new Set()
  }
  const totals = {
    total_return_fee: 0,
    total_tiktok_cancel_fee: 0,
    tiktok_failed_delivery_fee: 0,
    total_shopee_cancel_fee: 0,
    shopee_failed_delivery_fee: 0,
    shopee_return_fee: 0,
    total_lazada_cancel_fee: 0,
    lazada_failed_delivery_fee: 0,
    lazada_return_fee: 0,
    revenue_normal: 0,
    revenue_returned: 0,
    total_return_shipping: 0,
    total_discount_shop: 0,
    total_discount_shopee: 0,
    total_discount_combo: 0,
    total_shipping_return_fee: 0
  }
  const shopMap = new Map()

  for (const row of rows || []) {
    const orderId = String(row.order_id || '').trim()
    if (!orderId) continue
    const platform = String(row.platform || '').trim().toLowerCase()
    const shop = String(row.shop || '').trim()
    const type = normalizeDashboardOrderType(row)
    const statusKind = orderStatusKind({
      ...row,
      order_type: row.order_type || row.ledger_kind || '',
      return_status: row.return_status || row.ledger_status || ''
    }, row.cancel_reason || row.return_status || row.ledger_status || '')
    const returnFee = moneyNumber(row.return_fee)
    const revenue = moneyNumber(row.revenue)
    const rawRevenue = moneyNumber(row.raw_revenue || row.revenue)
    const cancelReason = String(row.cancel_reason || '').toLowerCase()
    const isFailedDelivery = statusKind === 'failed'
      || returnFee > 0
      || cancelReason.includes('thất bại')
      || cancelReason.includes('không giao được')
      || cancelReason.includes('failed')

    sets.all.add(orderId)
    if (type === 'cancel') sets.cancel.add(orderId)
    else if (type === 'return') sets.return.add(orderId)
    else sets.normal.add(orderId)
    if (type === 'normal' && statusKind === 'completed') sets.completed.add(orderId)
    if (type === 'normal' && statusKind === 'shipping') sets.shipping.add(orderId)

    if (moneyNumber(row.discount_shop) > 0) sets.discountShop.add(orderId)
    if (moneyNumber(row.discount_shopee) > 0) sets.discountShopee.add(orderId)
    if (moneyNumber(row.discount_combo) > 0) sets.discountCombo.add(orderId)
    totals.total_discount_shop += moneyNumber(row.discount_shop)
    totals.total_discount_shopee += moneyNumber(row.discount_shopee)
    totals.total_discount_combo += moneyNumber(row.discount_combo)
    totals.total_shipping_return_fee += moneyNumber(row.shipping_return_fee)

    if (type === 'normal') totals.revenue_normal += revenue
    if (type === 'return') {
      totals.revenue_returned += rawRevenue
      totals.total_return_fee += returnFee
      totals.total_return_shipping += returnFee
    }

    if (platform === 'tiktok') {
      if ((type === 'cancel' || type === 'return') && returnFee > 0) totals.total_tiktok_cancel_fee += returnFee
      if (type === 'return') sets.tiktokReturn.add(orderId)
      if (type === 'cancel' && isFailedDelivery) {
        sets.tiktokFailed.add(orderId)
        totals.tiktok_failed_delivery_fee += returnFee
      }
      if (type === 'cancel' && !isFailedDelivery) sets.tiktokFreeCancel.add(orderId)
    }
    if (platform === 'shopee') {
      if (type === 'cancel') sets.shopeeCancel.add(orderId)
      if ((type === 'cancel' || type === 'return') && returnFee > 0) totals.total_shopee_cancel_fee += returnFee
      if (type === 'cancel' && isFailedDelivery) {
        sets.shopeeFailed.add(orderId)
        totals.shopee_failed_delivery_fee += returnFee
      }
      if (type === 'cancel' && !isFailedDelivery) sets.shopeeFreeCancel.add(orderId)
      if (type === 'return') {
        sets.shopeeReturn.add(orderId)
        totals.shopee_return_fee += returnFee
      }
    }
    if (platform === 'lazada') {
      if (type === 'cancel') sets.lazadaCancel.add(orderId)
      if ((type === 'cancel' || type === 'return') && returnFee > 0) totals.total_lazada_cancel_fee += returnFee
      if (type === 'cancel' && isFailedDelivery) {
        sets.lazadaFailed.add(orderId)
        totals.lazada_failed_delivery_fee += returnFee
      }
      if (type === 'cancel' && !isFailedDelivery) sets.lazadaFreeCancel.add(orderId)
      if (type === 'return') {
        sets.lazadaReturn.add(orderId)
        totals.lazada_return_fee += returnFee
      }
    }

    if (!shopMap.has(shop)) {
      shopMap.set(shop, {
        shop,
        shop_orders: new Set(),
        shop_success_orders: new Set(),
        shop_completed_orders: new Set(),
        shop_shipping_orders: new Set(),
        shop_cancel_orders: new Set(),
        shop_return_orders: new Set(),
        shop_total_orders: new Set(),
        shop_revenue: 0
      })
    }
    const shopRow = shopMap.get(shop)
    shopRow.shop_total_orders.add(orderId)
    if (type === 'normal') {
      shopRow.shop_orders.add(orderId)
      shopRow.shop_success_orders.add(orderId)
      if (statusKind === 'completed') shopRow.shop_completed_orders.add(orderId)
      if (statusKind === 'shipping') shopRow.shop_shipping_orders.add(orderId)
      shopRow.shop_revenue += revenue
    } else if (type === 'cancel') {
      shopRow.shop_cancel_orders.add(orderId)
    } else if (type === 'return') {
      shopRow.shop_return_orders.add(orderId)
    }
  }

  return {
    cancel_orders: sets.cancel.size,
    return_orders: sets.return.size,
    total_all_orders: sets.all.size,
    ...totals,
    tiktok_failed_delivery_count: sets.tiktokFailed.size,
    tiktok_return_count: sets.tiktokReturn.size,
    tiktok_free_cancel_count: sets.tiktokFreeCancel.size,
    shopee_cancel_count: sets.shopeeCancel.size,
    shopee_failed_delivery_count: sets.shopeeFailed.size,
    shopee_free_cancel_count: sets.shopeeFreeCancel.size,
    shopee_return_count: sets.shopeeReturn.size,
    lazada_cancel_count: sets.lazadaCancel.size,
    lazada_failed_delivery_count: sets.lazadaFailed.size,
    lazada_free_cancel_count: sets.lazadaFreeCancel.size,
    lazada_return_count: sets.lazadaReturn.size,
    success_orders: sets.normal.size,
    completed_orders: sets.completed.size,
    shipping_orders: sets.shipping.size,
    cancel_orders_count: sets.cancel.size,
    return_orders_count: sets.return.size,
    orders_with_discount_shop: sets.discountShop.size,
    orders_with_discount_shopee: sets.discountShopee.size,
    orders_with_discount_combo: sets.discountCombo.size,
    shop_breakdown: Array.from(shopMap.values())
      .map(item => ({
        shop: item.shop,
        shop_orders: item.shop_orders.size,
        shop_success_orders: item.shop_success_orders.size,
        shop_completed_orders: item.shop_completed_orders.size,
        shop_shipping_orders: item.shop_shipping_orders.size,
        shop_cancel_orders: item.shop_cancel_orders.size,
        shop_return_orders: item.shop_return_orders.size,
        shop_total_orders: item.shop_total_orders.size,
        shop_revenue: item.shop_revenue
      }))
      .sort((a, b) => Number(b.shop_total_orders || 0) - Number(a.shop_total_orders || 0) || Number(b.shop_revenue || 0) - Number(a.shop_revenue || 0))
  }
}

export { moneyNumber, dashboardStatusAggregate, vietnameseCancelReason }
