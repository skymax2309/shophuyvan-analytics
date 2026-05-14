import { orderStatusKind } from './order-status-core.js'
import { cleanText, ESTIMATE_SOURCE, INFERRED_RETURN_SOURCE, num, round2 } from './order-analytics-shared-core.js'

export function platformReturnFeeFallback(platform) {
  const key = cleanText(platform).toLowerCase()
  if (key === 'shopee') return 1620
  return 0
}

export function isZeroRevenueReturnLikeOrder(order = {}, orderItems = []) {
  const platform = cleanText(order.platform).toLowerCase()
  if (platform !== 'shopee') return false
  if (cleanText(order.order_type).toLowerCase() === 'return') return false
  if (cleanText(order.order_type).toLowerCase() === 'cancel') return false
  if (Number(order.has_fee_detail || 0) > 0) return false
  const existingSource = cleanText(order.existing_actual_income_source)
  if (existingSource && existingSource !== ESTIMATE_SOURCE && existingSource !== INFERRED_RETURN_SOURCE) return false

  const statusKind = orderStatusKind(order, '')
  if (statusKind === 'cancelled' || statusKind === 'failed') return false

  const revenue = round2(num(order.revenue))
  const rawRevenue = round2(num(order.raw_revenue))
  const itemRevenue = round2((orderItems || []).reduce((sum, item) => sum + num(item.revenue_line), 0))
  const cost = round2(num(order.cost_real) || (orderItems || []).reduce((sum, item) => sum + num(item.cost_real), 0))
  return revenue === 0 && itemRevenue === 0 && rawRevenue > 0 && cost > 0
}

export function buildZeroRevenueReturnFinance(order = {}, orderItems = []) {
  if (!isZeroRevenueReturnLikeOrder(order, orderItems)) return null
  const returnFee = platformReturnFeeFallback(order.platform)
  if (returnFee <= 0) return null
  // NEO: Đơn Shopee đã hoàn toàn bộ có doanh thu import bằng 0 thì không được trừ giá vốn lần hai; chỉ giữ phí dịch vụ hoàn/trả còn lại.
  return {
    amount: -returnFee,
    platformFees: returnFee,
    returnFee,
    refundReason: 'Suy luận hoàn/trả từ đơn Shopee doanh thu 0 nhưng vẫn có giá trị gốc.',
    returnStatus: 'RETURN_REFUND',
    source: 'orders_v2_zero_revenue_return_fee'
  }
}
