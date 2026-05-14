import { orderStatusKind } from './order-status-core.js'
import { buildZeroRevenueReturnFinance } from './order-return-inference-core.js'
import { cleanText, ESTIMATE_SOURCE, ESCROW_SOURCE, INFERRED_RETURN_SOURCE, LAZADA_FINANCE_SOURCE, PAYMENT_SOURCE, num, round2 } from './order-analytics-shared-core.js'

function parseJsonSafe(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

export function estimateOrderFeeNoAds(order) {
  return round2(
    num(order.fee_platform) + num(order.fee_payment) + num(order.fee_affiliate) +
    num(order.fee_piship) + num(order.fee_service) + num(order.fee_packaging) +
    num(order.fee_operation) + num(order.fee_labor)
  )
}

export function extractShopeeFinanceInfo(order) {
  const raw = parseJsonSafe(order.fee_raw_data)
  const income = raw.order_income || raw.escrow_detail?.order_income || raw || {}
  const buyerPayment = income.buyer_payment_info || {}
  const refundAmount = round2(Math.max(
    Math.abs(num(income.seller_return_refund)),
    Math.abs(num(income.return_refund_amount)),
    Math.abs(num(income.refund_amount))
  ))
  const revenueBasis = round2(Math.max(
    num(income.order_selling_price),
    num(income.order_discounted_price),
    num(buyerPayment.merchant_subtotal),
    num(buyerPayment.order_amount)
  ))
  return {
    revenueBasis,
    refundAmount,
    returnOrderCount: Array.isArray(raw.return_order_sn_list) ? raw.return_order_sn_list.length : 0
  }
}

export function computeOrderRevenueBasis(order, orderItems, financeInfo = {}) {
  const itemRevenue = round2(orderItems.reduce((sum, item) => sum + num(item.revenue_line), 0))
  return round2(Math.max(num(order.revenue), itemRevenue, num(financeInfo.revenueBasis)))
}

export function resolvePlatformFees(order, revenueBasis, actualAmount) {
  const realFees = round2(num(order.real_total_fees))
  if (realFees > 0) return realFees
  const feeNoAds = estimateOrderFeeNoAds(order)
  if (feeNoAds > 0) return feeNoAds
  return Math.max(0, round2(num(revenueBasis) - num(actualAmount)))
}

export function buildReturnInfo(order, returnRow = {}, financeInfo = {}, revenueBasis = 0) {
  const inferred = financeInfo.inferredReturn || null
  const refundFromLedger = round2(num(returnRow.refund_amount))
  const refundFromFinance = round2(num(financeInfo.refundAmount))
  const refundAmount = round2(Math.max(refundFromLedger, refundFromFinance))
  const returnStatus = cleanText(returnRow.return_status) || cleanText(inferred?.returnStatus) || (refundFromFinance > 0 || num(financeInfo.returnOrderCount) > 0 ? 'RETURN_REFUND' : '')
  const refundReason = cleanText(returnRow.refund_reason) || cleanText(inferred?.refundReason) || (refundFromFinance > 0 ? 'Payment API đã trừ hoàn tiền.' : '')
  const financeAlreadyNetOfRefund = refundFromFinance > 0
  const isFullReturnRefund = Boolean(inferred) || (refundAmount > 0 && revenueBasis > 0 && refundAmount >= revenueBasis * 0.9)
  return {
    refundAmount,
    refundReason,
    returnStatus,
    refundFromLedger,
    refundFromFinance,
    inferredReturn: inferred,
    financeAlreadyNetOfRefund,
    isFullReturnRefund
  }
}

export function chooseActualIncome(order, revenueBasis, orderItems = []) {
  const inferred = buildZeroRevenueReturnFinance(order, orderItems)
  if (inferred) {
    return {
      amount: inferred.amount,
      source: INFERRED_RETURN_SOURCE,
      platformFees: inferred.platformFees,
      inferredReturn: inferred
    }
  }
  const existingSource = cleanText(order.existing_actual_income_source)
  if ([PAYMENT_SOURCE, LAZADA_FINANCE_SOURCE].includes(existingSource)) {
    return {
      amount: round2(order.existing_actual_income),
      source: existingSource,
      platformFees: resolvePlatformFees(order, revenueBasis, order.existing_actual_income)
    }
  }
  if (Number(order.has_fee_detail || 0) && cleanText(order.fee_source)) {
    const feeSource = cleanText(order.fee_source)
    return {
      amount: round2(order.settlement),
      source: feeSource === LAZADA_FINANCE_SOURCE ? LAZADA_FINANCE_SOURCE : ESCROW_SOURCE,
      platformFees: resolvePlatformFees(order, revenueBasis, order.settlement)
    }
  }
  const feeNoAds = estimateOrderFeeNoAds(order)
  return {
    amount: round2(num(revenueBasis) - feeNoAds),
    source: ESTIMATE_SOURCE,
    platformFees: feeNoAds
  }
}

export function isAdsCpoEligibleOrder(order, returnRow = {}) {
  const kind = orderStatusKind({
    order_type: order?.order_type,
    oms_status: order?.oms_status,
    shipping_status: order?.shipping_status,
    return_status: returnRow?.return_status
  }, returnRow?.return_status || '')
  if (['cancelled', 'return', 'failed'].includes(kind)) return false
  if (cleanText(returnRow?.return_status)) return false
  return true
}
