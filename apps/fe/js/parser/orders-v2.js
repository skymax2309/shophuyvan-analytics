import { tagOrderType } from './shared.js'

export function mergeOrderLines(orders) {
  const map = new Map()
  for (const order of orders) {
    const key = `${order.order_id}||${order.sku}`
    if (!map.has(key)) {
      map.set(key, { ...order })
      continue
    }

    const existing = map.get(key)
    existing.qty = (existing.qty || 0) + (order.qty || 0)
    existing.revenue = (existing.revenue || 0) + (order.revenue || 0)
    existing.raw_revenue = (existing.raw_revenue || 0) + (order.raw_revenue || 0)
    existing.order_total_revenue = existing.order_total_revenue || order.order_total_revenue || 0
    existing.return_amount = (existing.return_amount || 0) + (order.return_amount || 0)
    existing.shopee_voucher = (existing.shopee_voucher || 0) + (order.shopee_voucher || 0)
    existing.shopee_subsidy = (existing.shopee_subsidy || 0) + (order.shopee_subsidy || 0)
    existing.shop_discount = (existing.shop_discount || 0) + (order.shop_discount || 0)
    existing.combo_discount = (existing.combo_discount || 0) + (order.combo_discount || 0)
    existing.order_type = tagOrderType(existing.order_type, order.order_type)
  }
  return [...map.values()]
}

export function fillFirstSku(orders) {
  const seen = new Set()
  return orders.map(order => {
    const isFirst = !seen.has(order.order_id)
    if (order.order_type !== 'cancel') seen.add(order.order_id)
    return { ...order, is_first_sku: isFirst }
  })
}

function mergeOrderType(existing, next) {
  existing.order_type = tagOrderType(existing.order_type, next.order_type)
  if (existing.order_type === 'return') {
    existing.cancel_reason = next.cancel_reason || existing.cancel_reason
    existing.return_fee = existing.return_fee || next.return_fee || 0
  }
  if (existing.order_type === 'cancel') {
    existing.cancel_reason = existing.cancel_reason || next.cancel_reason || null
    existing.return_fee = existing.return_fee || next.return_fee || 0
  }
}

function orderLevelRevenue(order) {
  return order.order_total_revenue || order.revenue || 0
}

function orderLevelRawRevenue(order) {
  return order.order_total_revenue || order.raw_revenue || 0
}

export function buildOrdersV2(flatOrders) {
  const ordersMap = new Map()
  const items = []

  // NEO: Core này gom dòng SKU thành schema orders_v2; mọi thay đổi import phải đi qua đây để Dashboard và Worker không lệch số.
  for (const order of flatOrders) {
    if (order.sku) {
      items.push({
        order_id: order.order_id,
        sku: order.sku,
        product_name: order.product_name || '',
        qty: order.qty || 1,
        revenue_line: order.revenue || 0,
        cost_real: 0,
        cost_invoice: 0
      })
    }

    if (!ordersMap.has(order.order_id)) {
      ordersMap.set(order.order_id, {
        order_id: order.order_id,
        platform: order.platform || '',
        shop: order.shop || '',
        order_status: order.order_status || '',
        shipping_provider: order.shipping_provider || '',
        order_date: order.order_date || '',
        order_type: order.order_type || 'normal',
        revenue: order.order_type === 'normal' ? orderLevelRevenue(order) : 0,
        raw_revenue: orderLevelRawRevenue(order),
        order_total_revenue: order.order_total_revenue || 0,
        cancel_reason: order.cancel_reason || null,
        return_fee: order.return_fee || 0,
        shipped: order.shipped ? 1 : 0,
        discount_shop: order.discount_shop || 0,
        discount_shopee: order.discount_shopee || 0,
        discount_combo: order.discount_combo || 0,
        shipping_return_fee: order.shipping_return_fee || 0,
        cost_invoice: 0,
        cost_real: 0,
        fee: 0,
        profit_invoice: 0,
        profit_real: 0,
        tax_flat: 0,
        tax_income: 0,
        fee_platform: 0,
        fee_payment: 0,
        fee_affiliate: 0,
        fee_ads: 0,
        fee_piship: 0,
        fee_service: 0,
        fee_packaging: 0,
        fee_operation: 0,
        fee_labor: 0
      })
      continue
    }

    const existing = ordersMap.get(order.order_id)
    if (order.order_total_revenue || existing.order_total_revenue) {
      existing.order_total_revenue = existing.order_total_revenue || order.order_total_revenue || 0
      existing.revenue = existing.order_type === 'normal' ? existing.order_total_revenue : 0
      existing.raw_revenue = existing.order_total_revenue
    } else {
      existing.revenue += order.revenue || 0
      existing.raw_revenue += order.raw_revenue || 0
    }
    existing.discount_shop += order.discount_shop || 0
    existing.discount_shopee += order.discount_shopee || 0
    existing.discount_combo += order.discount_combo || 0
    existing.shipping_return_fee += order.shipping_return_fee || 0
    mergeOrderType(existing, order)
    if (existing.order_total_revenue) {
      existing.revenue = existing.order_type === 'normal' ? existing.order_total_revenue : 0
      existing.raw_revenue = existing.order_total_revenue
    }
  }

  return { orders: [...ordersMap.values()], items }
}
