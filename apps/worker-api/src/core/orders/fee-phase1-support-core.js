export function cleanFeePhaseText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function foldFeePhaseText(value) {
  return cleanFeePhaseText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, match => match === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function money(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

export function absMoney(value) {
  return Math.abs(money(value))
}

export function roundMoney(value) {
  return Math.round((money(value) + Number.EPSILON) * 100) / 100
}

export function hasColumnValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function pct(cfg, key) {
  const value = Number(cfg?.[key]?.value || 0)
  return Number.isFinite(value) ? value / 100 : 0
}

function fixed(cfg, key) {
  const value = Number(cfg?.[key]?.value || 0)
  return Number.isFinite(value) ? value : 0
}

export function capabilityIdentity(platform, value) {
  const text = cleanFeePhaseText(value).toLowerCase()
  return platform && text ? `${platform}|${text}` : ''
}

export function fallbackBucketsFromCostSettings(order = {}, cfg = {}) {
  const revenue = absMoney(order.revenue)
  const platform = cleanFeePhaseText(order.platform).toLowerCase()
  const orderType = cleanFeePhaseText(order.order_type).toLowerCase()
  const isReturnLike = orderType === 'cancel' || orderType === 'return'
  const isFirstSku = order.is_first_sku === true || order.is_first_sku === 1 || order.is_first_sku === '1' || order.is_first_sku === undefined

  const result = {
    fee_commission: 0,
    fee_payment: 0,
    fee_affiliate: 0,
    fee_ads: 0,
    fee_piship: 0,
    fee_service: 0,
    fee_handling: 0,
    fee_shipping: 0,
    tax_vat: 0,
    tax_pit: 0
  }

  // Đơn huỷ/hoàn chỉ giữ chi phí nội bộ và phí hoàn/phạt đang có; không ước tính thêm phí sàn.
  if (isReturnLike) return result

  if (platform === 'shopee') {
    result.fee_commission = roundMoney(revenue * pct(cfg, 'shopee_platform_fee'))
    result.fee_payment = roundMoney(revenue * pct(cfg, 'shopee_payment_fee'))
    result.fee_affiliate = roundMoney(revenue * pct(cfg, 'shopee_affiliate'))
    result.fee_ads = roundMoney(revenue * pct(cfg, 'shopee_ads'))
    if (isFirstSku) {
      result.fee_piship = roundMoney(fixed(cfg, 'shopee_piship'))
      result.fee_service = roundMoney(fixed(cfg, 'shopee_service_fee'))
    }
    return result
  }

  if (platform === 'lazada') {
    result.fee_commission = roundMoney(revenue * pct(cfg, 'lazada_commission'))
    result.fee_payment = roundMoney(revenue * pct(cfg, 'lazada_payment_fee'))
    result.fee_affiliate = roundMoney(revenue * pct(cfg, 'lazada_affiliate'))
    result.fee_ads = roundMoney(revenue * pct(cfg, 'lazada_ads'))
    result.fee_handling = roundMoney(revenue * pct(cfg, 'lazada_handling_fee'))
    result.fee_shipping = roundMoney(revenue * pct(cfg, 'lazada_shipping_diff'))
    result.tax_vat = roundMoney(revenue * pct(cfg, 'lazada_vat'))
    result.tax_pit = roundMoney(revenue * pct(cfg, 'lazada_pit'))
    if (isFirstSku) result.fee_service = roundMoney(fixed(cfg, 'lazada_service_fee'))
    return result
  }

  if (platform === 'tiktok') {
    result.fee_commission = roundMoney(revenue * pct(cfg, 'tiktok_commission'))
    result.fee_payment = roundMoney(revenue * pct(cfg, 'tiktok_transaction_fee'))
    result.fee_affiliate = roundMoney(revenue * pct(cfg, 'tiktok_affiliate'))
    result.fee_ads = roundMoney(revenue * pct(cfg, 'tiktok_ads'))
    if (isFirstSku) {
      result.fee_piship = roundMoney(fixed(cfg, 'tiktok_sfr'))
      result.fee_service = roundMoney(fixed(cfg, 'tiktok_handling_fee'))
    }
    return result
  }

  return result
}

export function pishipCostSettingSource(platform) {
  return cleanFeePhaseText(platform).toLowerCase() === 'tiktok'
    ? 'cost_settings.tiktok_sfr'
    : 'cost_settings.shopee_piship'
}

export function buildTerminalOrderFinanceOverride(order = {}, snapshot = {}) {
  const orderType = foldFeePhaseText(order.order_type)
  const statusText = [
    orderType,
    order.oms_status,
    order.shipping_status,
    order.order_status,
    order.fulfillment_status,
    order.status,
    order.return_status,
    order.refund_status,
    order.cancel_reason
  ].map(foldFeePhaseText).filter(Boolean).join(' ')

  const isCancel = orderType === 'cancel' || statusText.includes('cancelled') || statusText.includes('canceled') || statusText.includes('da huy')
  const isReturn = orderType === 'return' || statusText.includes('return') || statusText.includes('refund') || statusText.includes('tra hang') || statusText.includes('hoan tien') || statusText.includes('hoan hang')
  if (!isCancel && !isReturn) return null

  const returnFee = roundMoney(absMoney(order.return_fee) + absMoney(order.shipping_return_fee))
  const guardedFee = isReturn || returnFee > 0 ? returnFee : 0
  const guardedProfit = guardedFee > 0 ? roundMoney(-guardedFee) : 0
  const state = isCancel ? 'canceled_excluded' : 'return_pending'
  const label = isCancel ? 'Không tính' : 'Chờ hoàn/trả'
  const badgeText = isCancel ? 'Đơn hủy - không tính lãi' : 'Hoàn/trả đang xử lý'
  const note = isCancel
    ? 'Đơn đã hủy không được cộng doanh thu hoặc lãi như đơn thành công.'
    : 'Đơn hoàn/trả chưa có settlement confirmed nên OMS không hiển thị lãi xanh.'

  return {
    fields: {
      order_value_reference: snapshot.gross_revenue,
      gross_revenue: 0,
      product_revenue_after_shop_discount: 0,
      buyer_shipping_paid: 0,
      buyer_total_paid: 0,
      actual_income: isCancel ? 0 : null,
      estimated_income: 0,
      estimated_income_source: 'terminal_status_guard',
      actual_income_settlement: null,
      actual_income_available: isCancel,
      actual_income_confidence: isCancel ? 'excluded' : 'none',
      profit_basis: 0,
      profit_status: state,
      profit_label: label,
      settlement_status: state,
      fee_display_total: guardedFee,
      profit_real_display: guardedProfit,
      profit_invoice_display: guardedProfit,
      legacy_delta: 0
    },
    totals: {
      actual_income: isCancel ? 0 : null,
      estimated_income: 0,
      estimated_income_source: 'terminal_status_guard',
      actual_income_settlement: null,
      actual_income_available: isCancel,
      actual_income_confidence: isCancel ? 'excluded' : 'none',
      profit_basis: 0,
      profit_status: state,
      profit_label: label,
      settlement_status: state,
      total_deductions: guardedFee,
      broad_deduction_view: guardedFee,
      total: guardedFee
    },
    badge_text: badgeText,
    badge_tone: isCancel ? 'excluded' : 'mixed',
    note
  }
}
