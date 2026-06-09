import { cleanText, LAZADA_FINANCE_SOURCE, num, round2 } from './analytics-shared-core.js'

export const FINANCE_TAXONOMY_VERSION = 'finance-taxonomy-final-core-settlement-v20260521'

function parseJsonSafe(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function isPresent(value) {
  return value !== null && value !== undefined && value !== ''
}

function numberOrUndefined(value) {
  if (!isPresent(value)) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrUndefined(value)
    if (number !== undefined) return number
  }
  return undefined
}

function firstPositive(...values) {
  for (const value of values) {
    const number = Math.abs(num(value))
    if (number > 0) return round2(number)
  }
  return 0
}

function absFirst(...values) {
  const number = firstNumber(...values)
  return number === undefined ? 0 : round2(Math.abs(number))
}

function sumPositive(...values) {
  return round2(values.reduce((sum, value) => sum + Math.abs(num(value)), 0))
}

function negativeAbs(value) {
  const number = numberOrUndefined(value)
  return number !== undefined && number < 0 ? round2(Math.abs(number)) : 0
}

function rawSource(raw, path) {
  const parts = path.split('.').filter(Boolean)
  let current = raw
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return ''
    current = current[part]
  }
  return isPresent(current) ? `order_fee_details.raw_data:$.${path}` : ''
}

function sourceMeta(value, source, confidence = 'confirmed') {
  const hasValue = value !== null && value !== undefined && Number.isFinite(Number(value))
  return {
    value: hasValue ? round2(value) : null,
    source: hasValue ? (source || 'missing') : 'missing',
    confidence: hasValue ? (confidence || (Number(value) === 0 ? 'observed_zero' : 'confirmed')) : 'missing'
  }
}

function sourceMetaFromField(field = {}, fallbackValue = null, fallbackSource = '', fallbackConfidence = '') {
  const value = field && typeof field === 'object' && 'value' in field ? field.value : fallbackValue
  const meta = sourceMeta(value, cleanText(field?.source) || fallbackSource, cleanText(field?.confidence) || fallbackConfidence)
  return {
    ...meta,
    observed_text: cleanText(field?.observed_text || field?.raw_label || ''),
    parsed_at: cleanText(field?.parsed_at || '')
  }
}

function rawRoots(order = {}) {
  const raw = parseJsonSafe(order.fee_raw_data || order.raw_data)
  const income = raw.order_income || raw.escrow_detail?.order_income || raw || {}
  const buyer = raw.buyer_payment_info || income.buyer_payment_info || raw.escrow_detail?.buyer_payment_info || {}
  return { raw, income, buyer }
}

export function buildOrderFinanceTaxonomy(order = {}, orderItems = []) {
  const { raw, income, buyer } = rawRoots(order)
  const platform = cleanText(order.platform).toLowerCase()
  const feeSource = cleanText(order.fee_source || raw.source || raw.finance_source || raw.source_endpoint)
  const isLazadaPlatform = platform === 'lazada'
  const isLazadaFinanceConfirmed = !isLazadaPlatform || feeSource === LAZADA_FINANCE_SOURCE
  const tiktokDetail = raw.tiktok_seller_center_detail || {}
  const tiktokFieldMeta = tiktokDetail.field_meta || raw.field_meta || {}
  const sellerCenterSourceText = [
    feeSource,
    order.source_detail,
    order.source_mode,
    order.finance_source,
    order.actual_income_source,
    order.estimated_income_source,
    order.fee_display_badge,
    raw.source,
    raw.finance_source,
    tiktokDetail.source,
    tiktokDetail.finance_source
  ].map(value => cleanText(value).toLowerCase()).join('|')
  const isTiktokSellerDetail = platform === 'tiktok' && sellerCenterSourceText.includes('tiktok_seller_center')
  const isTiktokPlatform = platform === 'tiktok'
  const tiktokIncomeUnavailable = isTiktokSellerDetail && tiktokDetail.actual_income_available === false
  const tiktokActualIncomeSourceText = [
    tiktokDetail.finance_source,
    tiktokDetail.actual_income_source,
    tiktokDetail.settlement_status
  ].map(value => cleanText(value).toLowerCase()).join('|')
  const tiktokActualIncomeHasConfirmedSource =
    tiktokActualIncomeSourceText.includes('wallet')
    || tiktokActualIncomeSourceText.includes('confirmed')
    || (
      tiktokActualIncomeSourceText.includes('settlement')
      && !tiktokActualIncomeSourceText.includes('pending')
      && !tiktokActualIncomeSourceText.includes('to_settle')
    )
  const tiktokActualIncomeSourceConfirmed = isTiktokSellerDetail
    && tiktokDetail.actual_income_available === true
    && firstNumber(tiktokDetail.actual_income) !== undefined
    && tiktokActualIncomeHasConfirmedSource
  const itemRevenue = round2((orderItems || []).reduce((sum, item) => sum + num(item.revenue_line), 0))
  const buyerShippingPaidRaw = firstNumber(
    order.buyer_shipping_paid,
    order.shipping_fee_buyer_paid,
    tiktokDetail.buyer_shipping_paid,
    income.buyer_paid_shipping_fee,
    buyer.shipping_fee
  )
  const buyerShippingPaid = buyerShippingPaidRaw === undefined ? null : round2(Math.abs(buyerShippingPaidRaw))
  const buyerShippingPaidSource = rawSource(raw, 'order_income.buyer_paid_shipping_fee')
    || rawSource(raw, 'buyer_payment_info.shipping_fee')
    || (firstNumber(order.buyer_shipping_paid, order.shipping_fee_buyer_paid) !== undefined ? 'orders_v2.buyer_shipping_paid' : '')

  const buyerVoucherTotal = absFirst(
    order.platform_voucher_total,
    buyer.shopee_voucher,
    income.shopee_voucher,
    income.buyer_payment_info?.shopee_voucher
  )
  const sellerCofundedVoucher = absFirst(
    order.seller_cofunded_voucher_amount,
    order.fee_detail_voucher_from_seller,
    income.voucher_from_seller
  )
  const platformFundedVoucherRaw = absFirst(
    order.platform_funded_voucher_amount,
    order.fee_detail_voucher_from_shopee,
    income.voucher_from_shopee
  )
  const platformVoucherTotal = firstPositive(
    buyerVoucherTotal,
    sellerCofundedVoucher + platformFundedVoucherRaw,
    order.discount_shopee
  )
  const platformFundedVoucher = platformFundedVoucherRaw > 0
    ? platformFundedVoucherRaw
    : (platformVoucherTotal > 0 && sellerCofundedVoucher > 0
      ? round2(Math.max(0, platformVoucherTotal - sellerCofundedVoucher))
      : 0)

  const shopDiscount = firstPositive(
    order.shop_discount_amount,
    tiktokDetail.seller_item_discount,
    income.seller_discount,
    income.order_seller_discount,
    order.fee_detail_seller_discount,
    sumPositive(order.discount_shop, order.discount_combo)
  )
  const buyerTotalRaw = firstPositive(
    order.buyer_total_paid,
    tiktokDetail.buyer_total_paid,
    tiktokDetail.gross_revenue,
    buyer.buyer_total_amount,
    income.buyer_total_amount,
    buyer.order_amount
  )
  const calculatedProductFromBuyer = buyerTotalRaw > 0
    ? round2(Math.max(0, buyerTotalRaw + platformVoucherTotal - buyerShippingPaid))
    : 0
  const productRevenueAfterShopDiscount = firstPositive(
    order.product_revenue_after_shop_discount,
    tiktokDetail.product_revenue_after_shop_discount,
    income.order_discounted_price,
    income.order_selling_price,
    buyer.merchant_subtotal,
    itemRevenue,
    calculatedProductFromBuyer,
    buyerShippingPaid > 0 ? round2(Math.max(0, num(order.revenue) - buyerShippingPaid + platformVoucherTotal)) : 0,
    order.revenue
  )
  const productOriginalRaw = firstNumber(
    order.product_original_amount,
    order.original_product_amount,
    income.original_product_amount,
    income.product_original_amount,
    income.original_item_price,
    buyer.original_product_amount,
    tiktokDetail.product_original_amount
  )
  const productOriginalDerived = productOriginalRaw === undefined && productRevenueAfterShopDiscount > 0 && shopDiscount > 0
    ? round2(productRevenueAfterShopDiscount + shopDiscount)
    : undefined
  const productOriginalAmount = productOriginalRaw === undefined
    ? (productOriginalDerived === undefined ? null : productOriginalDerived)
    : round2(Math.abs(productOriginalRaw))
  const productOriginalSource = rawSource(raw, 'order_income.original_product_amount')
    || rawSource(raw, 'order_income.product_original_amount')
    || rawSource(raw, 'order_income.original_item_price')
    || rawSource(raw, 'buyer_payment_info.original_product_amount')
    || (firstNumber(order.product_original_amount, order.original_product_amount) !== undefined ? 'orders_v2.product_original_amount' : '')
    || (productOriginalDerived !== undefined ? 'derived:product_revenue_after_shop_discount+shop_discount_amount' : '')
  const grossRevenue = firstPositive(
    order.gross_revenue,
    tiktokDetail.gross_revenue,
    round2(productRevenueAfterShopDiscount + buyerShippingPaid),
    num(order.revenue) + platformVoucherTotal,
    itemRevenue
  )
  const tiktokActualIncomeCandidate = firstPositive(tiktokDetail.actual_income)
  const tiktokActualIncomeLooksLikeSfr = isTiktokSellerDetail
    && tiktokActualIncomeCandidate > 0
    && tiktokActualIncomeCandidate <= Math.min(10000, Math.max(0, grossRevenue * 0.2))
    && (
      firstPositive(tiktokDetail.settlement_total, tiktokDetail.estimated_income, income.estimated_settlement_total) <= 0
      || firstPositive(tiktokDetail.sfr_service_fee) === tiktokActualIncomeCandidate
    )
  const tiktokActualIncomeConfirmed = tiktokActualIncomeSourceConfirmed && !tiktokActualIncomeLooksLikeSfr
  const buyerTotalPaid = firstPositive(
    buyerTotalRaw,
    round2(grossRevenue - platformVoucherTotal),
    order.revenue
  )

  const commissionFee = absFirst(order.fee_detail_commission, order.fee_commission, order.fee_platform, tiktokDetail.commission_fee)
  const paymentFee = absFirst(order.fee_detail_payment, order.fee_payment, tiktokDetail.transaction_fee)
  const serviceFee = absFirst(order.fee_detail_service, order.fee_service)
  const affiliateFee = absFirst(order.fee_detail_affiliate, order.fee_affiliate)
  const handlingFee = absFirst(order.fee_detail_handling, order.fee_handling, tiktokDetail.handling_fee)
  const marketplaceFeeTotal = sumPositive(commissionFee, paymentFee, serviceFee, affiliateFee, handlingFee)
  const taxVatComponent = firstPositive(order.fee_detail_tax_vat, order.tax_vat, tiktokDetail.tax_vat)
  const taxPitComponent = firstPositive(order.fee_detail_tax_pit, order.tax_pit, tiktokDetail.tax_pit)
  const taxTotal = sumPositive(taxVatComponent, taxPitComponent)
  const settlementAdjustmentTotal = sumPositive(
    negativeAbs(income.final_shipping_fee),
    negativeAbs(income.adjustment_amount),
    absFirst(order.fee_detail_shipping, order.fee_shipping)
  )

  const pishipRawInSettlement = firstPositive(
    income.shipping_seller_protection_fee_amount,
    income.delivery_seller_protection_fee_premium_amount,
    income.delivery_seller_protection_fee_premium_amount_after_adjustment
  )
  const legacyTiktokSettlementCandidate = firstPositive(tiktokDetail.actual_income, order.fee_detail_settlement, order.actual_income_settlement)
  const legacyTiktokSfrServiceFee = isTiktokSellerDetail
    && !tiktokActualIncomeConfirmed
    && legacyTiktokSettlementCandidate > 0
    && legacyTiktokSettlementCandidate <= Math.min(10000, Math.max(0, grossRevenue * 0.2))
    ? legacyTiktokSettlementCandidate
    : 0
  const tiktokSfrServiceFee = firstPositive(tiktokDetail.sfr_service_fee, legacyTiktokSfrServiceFee)
  const tiktokSfrServiceFeeSource = rawSource(raw, 'tiktok_seller_center_detail.sfr_service_fee')
    || (legacyTiktokSfrServiceFee > 0 ? 'tiktok_seller_center_detail.actual_income_legacy_sfr' : '')
  const apiPishipFee = isTiktokSellerDetail ? 0 : firstPositive(order.fee_detail_piship, pishipRawInSettlement)
  // TikTok Seller Center đã có fee line riêng cho phí sàn; PiShip cost setting
  // chỉ được trừ ở tab lợi nhuận, không cộng vào khấu trừ/fee sàn đã quét.
  const costSettingPishipFee = firstPositive(order.piship_fee, order.fee_piship)
  const pishipFee = apiPishipFee > 0 ? apiPishipFee : costSettingPishipFee
  const pishipRawSource = rawSource(raw, 'order_income.shipping_seller_protection_fee_amount')
    || rawSource(raw, 'order_income.delivery_seller_protection_fee_premium_amount')
    || rawSource(raw, 'order_income.delivery_seller_protection_fee_premium_amount_after_adjustment')
  const pishipSource = apiPishipFee > 0
    ? (pishipRawSource || 'order_fee_details.fee_piship')
    : (costSettingPishipFee > 0 ? 'orders_v2.fee_piship/cost_setting' : '')
  // ADS ngoài ví thuộc chi phí vận hành/cost setting, tách khỏi phí sàn TikTok.
  const adsFeeTotal = firstPositive(order.ads_fee_total, order.fee_ads, order.fee_detail_ads)
  const opsCostSettingOther = isTiktokSellerDetail ? 0 : sumPositive(order.fee_packaging, order.fee_operation, order.fee_labor)
  const opsCostSettingTotal = round2(pishipFee + opsCostSettingOther)
  const platformDeductionTotal = round2(sellerCofundedVoucher + marketplaceFeeTotal + taxTotal + settlementAdjustmentTotal + tiktokSfrServiceFee)
  // TikTok Seller Center chỉ được coi là Thực nhận ví khi detail xác nhận có
  // "Số tiền bạn kiếm được"; số ước tính cũ trong raw/settlement không được
  // nâng cấp thành actual_income.
  const rawEscrow = isTiktokSellerDetail
    ? (tiktokActualIncomeConfirmed ? firstNumber(tiktokDetail.actual_income) : undefined)
    : (!isLazadaFinanceConfirmed
      ? undefined
      : firstNumber(income.escrow_amount_after_adjustment, income.escrow_amount, order.fee_detail_settlement, order.settlement))
  const actualIncomeAvailable = rawEscrow !== undefined
  const tiktokDetailUsesSfrEstimate = isTiktokSellerDetail
    && cleanText(tiktokDetail.finance_source) !== 'tiktok_seller_center_finance_transaction'
    && tiktokSfrServiceFee > 0
  const tiktokEstimatedIncome = tiktokDetailUsesSfrEstimate
    ? 0
    : firstPositive(tiktokDetail.estimated_income, tiktokDetail.settlement_total, income.estimated_settlement_total)
  const pendingProfitBasis = isTiktokSellerDetail && !actualIncomeAvailable && productRevenueAfterShopDiscount > 0
    ? productRevenueAfterShopDiscount
    : grossRevenue
  const estimatedIncome = actualIncomeAvailable
    ? null
    : (isTiktokSellerDetail && tiktokEstimatedIncome > 0
      ? tiktokEstimatedIncome
      : round2(Math.max(0, pendingProfitBasis - platformDeductionTotal)))
  const actualIncome = actualIncomeAvailable
    ? round2(rawEscrow + apiPishipFee)
    : (isTiktokPlatform ? null : estimatedIncome)
  const actualIncomeSettlement = actualIncomeAvailable ? actualIncome : null
  const settlementStatus = actualIncomeAvailable
    ? 'confirmed'
    : (isTiktokSellerDetail ? 'pending_settlement' : (isLazadaPlatform ? 'missing_lazada_finance_api' : 'estimated_no_payment_sync'))
  const profitStatus = actualIncomeAvailable
    ? 'actual_income_confirmed'
    : (isTiktokSellerDetail ? 'estimated_pending_settlement' : 'estimated')
  const profitBasis = actualIncomeAvailable ? actualIncome : pendingProfitBasis
  const estimatedIncomeSource = actualIncomeAvailable
    ? ''
    : (isTiktokSellerDetail
      ? (tiktokEstimatedIncome > 0
        ? (cleanText(tiktokDetail.finance_source) || 'tiktok_seller_center_finance_transaction')
        : 'tiktok_estimated_fee')
      : (isTiktokPlatform
        ? 'cost_setting_estimate'
        : (isLazadaPlatform ? 'missing:lazada_finance_api_order_estimate' : 'orders_v2_estimate_no_ads')))
  const actualIncomeConfidence = actualIncomeAvailable ? 'confirmed' : 'none'

  const platformFundedSource = platformFundedVoucherRaw > 0
    ? rawSource(raw, 'order_income.voucher_from_shopee')
    : (platformFundedVoucher > 0 ? 'derived:platform_voucher_total-seller_cofunded_voucher_amount' : '')
  const sellerCofundSource = rawSource(raw, 'order_income.voucher_from_seller')
    || (sellerCofundedVoucher > 0 ? 'order_fee_details.fee_detail_voucher_from_seller' : '')
  const platformVoucherSource = rawSource(raw, 'buyer_payment_info.shopee_voucher')
    || (platformVoucherTotal > 0 ? 'seller_cofunded_voucher_amount+platform_funded_voucher_amount' : '')

  return {
    version: FINANCE_TAXONOMY_VERSION,
    gross_revenue: grossRevenue,
    product_original_amount: productOriginalAmount,
    product_revenue_after_shop_discount: productRevenueAfterShopDiscount,
    buyer_shipping_paid: buyerShippingPaid,
    buyer_total_paid: buyerTotalPaid,
    shop_discount_amount: shopDiscount,
    platform_voucher_total: platformVoucherTotal,
    seller_cofunded_voucher_amount: sellerCofundedVoucher,
    platform_funded_voucher_amount: platformFundedVoucher,
    platform_funded_voucher_source: platformFundedSource,
    platform_funded_voucher_confidence: platformFundedVoucherRaw > 0 ? 'confirmed' : (platformFundedVoucher > 0 ? 'derived' : 'missing'),
    seller_cofunded_voucher_source: sellerCofundSource,
    seller_cofunded_voucher_confidence: sellerCofundedVoucher > 0 && sellerCofundSource ? 'confirmed' : 'missing',
    actual_income: actualIncome,
    estimated_income: estimatedIncome,
    estimated_income_source: estimatedIncomeSource,
    actual_income_settlement: actualIncomeSettlement,
    actual_income_available: actualIncomeAvailable,
    actual_income_confidence: actualIncomeConfidence,
    actual_income_source: rawEscrow !== undefined && !isTiktokSellerDetail
      ? (rawSource(raw, 'order_income.escrow_amount_after_adjustment') || rawSource(raw, 'order_income.escrow_amount') || 'order_fee_details.settlement')
      : (tiktokActualIncomeConfirmed ? 'tiktok_seller_center_detail' : (isTiktokPlatform ? 'missing:tiktok_seller_center_income_unavailable' : (isLazadaPlatform ? 'missing:lazada_finance_api' : 'derived:gross_revenue-platform_deductions'))),
    profit_basis: profitBasis,
    profit_basis_source: actualIncomeAvailable
      ? 'actual_income_settlement'
      : (isTiktokSellerDetail ? 'tiktok_seller_center_detail.product_revenue_after_shop_discount' : 'gross_revenue'),
    profit_status: profitStatus,
    settlement_status: settlementStatus,
    marketplace_fee_total: marketplaceFeeTotal,
    tax_total: taxTotal,
    settlement_adjustment_total: settlementAdjustmentTotal,
    ads_fee_total: adsFeeTotal,
    piship_fee: pishipFee,
    piship_fee_source: pishipSource,
    piship_fee_source_type: apiPishipFee > 0 ? 'api' : (costSettingPishipFee > 0 ? 'cost_setting' : 'missing'),
    piship_fee_confidence: apiPishipFee > 0 ? 'confirmed' : (costSettingPishipFee > 0 ? 'fallback' : 'missing'),
    sfr_service_fee: tiktokSfrServiceFee,
    tiktok_sfr_fee: tiktokSfrServiceFee,
    ops_cost_setting_total: opsCostSettingTotal,
    ops_cost_setting_other: opsCostSettingOther,
    platform_deduction_total: platformDeductionTotal,
    total_shop_deduction_from_platform: platformDeductionTotal,
    finance_source: rawEscrow !== undefined && !isTiktokSellerDetail ? (isLazadaPlatform ? LAZADA_FINANCE_SOURCE : 'order_fee_details.raw_data') : (isTiktokSellerDetail ? (cleanText(tiktokDetail.finance_source) || feeSource || 'tiktok_seller_center_detail') : (isLazadaPlatform ? 'missing:lazada_finance_api' : 'orders_v2_estimate_no_ads')),
    finance_confidence: rawEscrow !== undefined ? 'confirmed' : (isTiktokSellerDetail ? 'estimated' : (sellerCofundedVoucher > 0 ? 'mixed' : 'estimated')),
    fields: {
      gross_revenue: sourceMeta(grossRevenue, productRevenueAfterShopDiscount > 0 ? 'finance_taxonomy_core' : 'missing', productRevenueAfterShopDiscount > 0 ? 'confirmed' : 'missing'),
      product_original_amount: sourceMetaFromField(tiktokFieldMeta.product_original_amount, productOriginalAmount, productOriginalSource || (isTiktokSellerDetail && productOriginalAmount !== null ? 'tiktok_seller_center_detail' : ''), productOriginalAmount === 0 ? 'observed_zero' : (productOriginalAmount !== null ? (productOriginalDerived !== undefined ? 'derived' : 'observed') : 'missing')),
      product_revenue_after_shop_discount: sourceMetaFromField(tiktokFieldMeta.product_revenue_after_shop_discount, productRevenueAfterShopDiscount, isTiktokSellerDetail ? 'tiktok_seller_center_finance_transaction' : 'finance_taxonomy_core', productRevenueAfterShopDiscount === 0 ? 'observed_zero' : 'confirmed'),
      buyer_shipping_paid: sourceMetaFromField(tiktokFieldMeta.buyer_shipping_paid, buyerShippingPaid, buyerShippingPaidSource || (isTiktokSellerDetail && buyerShippingPaid !== null ? 'tiktok_seller_center_detail' : ''), buyerShippingPaid === 0 ? 'observed_zero' : (buyerShippingPaid !== null ? 'observed' : 'missing')),
      platform_voucher_total: sourceMeta(platformVoucherTotal, platformVoucherSource, platformVoucherSource ? 'confirmed' : 'missing'),
      seller_cofunded_voucher_amount: sourceMeta(sellerCofundedVoucher, sellerCofundSource, sellerCofundSource ? 'confirmed' : 'missing'),
      platform_funded_voucher_amount: sourceMeta(platformFundedVoucher, platformFundedSource, platformFundedVoucherRaw > 0 ? 'confirmed' : 'derived'),
      actual_income: sourceMeta(actualIncome, rawEscrow !== undefined && !isTiktokSellerDetail ? 'order_fee_details.raw_data' : (tiktokActualIncomeConfirmed ? 'tiktok_seller_center_detail' : 'missing'), actualIncomeConfidence),
      estimated_income: sourceMeta(estimatedIncome, actualIncomeAvailable ? 'missing' : estimatedIncomeSource, actualIncomeAvailable ? 'missing' : 'estimated'),
      actual_income_settlement: sourceMeta(actualIncomeSettlement, rawEscrow !== undefined && !isTiktokSellerDetail ? 'order_fee_details.raw_data' : (tiktokActualIncomeConfirmed ? 'tiktok_seller_center_detail' : 'missing'), rawEscrow !== undefined ? 'confirmed' : 'missing'),
      piship_fee: sourceMeta(pishipFee, pishipSource, apiPishipFee > 0 ? 'confirmed' : 'fallback'),
      sfr_service_fee: sourceMeta(tiktokSfrServiceFee, tiktokSfrServiceFeeSource, tiktokSfrServiceFee > 0 ? 'estimated' : 'missing')
    }
  }
}
