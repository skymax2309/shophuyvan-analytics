import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { applyOrderFeePhase1ToOrderRow } from '../apps/worker-api/src/core/orders/fee-phase1-core.js'
import { buildOrderLabelState, normalizeOrderListRowForCore, normalizeOrderReadModel } from '../apps/worker-api/src/core/orders/read-core.js'
import { buildOrderFinanceTaxonomy } from '../apps/worker-api/src/core/orders/finance-taxonomy-core.js'
import { buildTiktokSellerCenterRawData, normalizeTiktokSellerCenterDetailPayload } from '../apps/worker-api/src/core/orders/tiktok-seller-center-finance-core.js'
import { buildShopeeActionResult } from '../apps/worker-api/src/core/shopee/action-result-core.js'
import { evaluateManualDateScanRows } from '../apps/worker-api/src/routes/orders/manual-sync-backfill.js'
import { buildPromotionCorePreview, buildPromotionLivePayload, promotionWriteEndpointRule } from '../apps/worker-api/src/routes/products/marketplace-preview.js'

const repoFile = path => fileURLToPath(new URL(`../${path}`, import.meta.url))
const results = []
const pass = (case_id, detail = {}) => results.push({ case_id, status: 'pass', ...detail })

async function fetchJsonStrict(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`readback_not_json status=${response.status} content_type=${response.headers.get('content-type') || ''} body=${text.slice(0, 120)}`)
  }
  return { response, body }
}

function shopeeApiLabelCapability() {
  return {
    label_download_mode: 'api_document_generation_then_download',
    label_download_supported: true,
    label_download_read_only: true,
    label_download_requires_manual: false
  }
}

function normalizeShopeeOrder(row) {
  return normalizeOrderReadModel({
    platform: 'shopee',
    source_mode: 'api',
    shop: 'chihuy2309',
    raw_platform_status: 'READY_TO_SHIP',
    shipping_status: 'LOGISTICS_REQUEST_CREATED',
    shipping_carrier: 'SPX Express',
    fee_source: 'shopee.payment.get_escrow_detail',
    actual_income_available: true,
    ...shopeeApiLabelCapability(),
    ...row
  })
}

const shopeeTrackingNoLabel = normalizeShopeeOrder({
  order_id: 'SHOPEE-TRACKING-NO-LABEL',
  tracking_number: 'SPXVNTRACKED',
  tracking_core_tracking_number: 'SPXVNTRACKED',
  label_file_path: '',
  last_label_error: 'pending_document_generation'
})
assert.equal(shopeeTrackingNoLabel.tracking_sync_status, 'complete')
assert.match(shopeeTrackingNoLabel.label_sync_status, /pending_document_generation|pending_retry|not_ready|document_generating/)
assert.equal(shopeeTrackingNoLabel.operation_sync_status, 'waiting_label_file')
assert.equal(shopeeTrackingNoLabel.oms_processing_bucket, 'waiting_label')
assert.notEqual(shopeeTrackingNoLabel.left_nav_subgroup, 'Chưa Xử Lý')
pass('shopee_tracking_present_label_missing', {
  tracking_sync_status: shopeeTrackingNoLabel.tracking_sync_status,
  label_sync_status: shopeeTrackingNoLabel.label_sync_status,
  oms_processing_bucket: shopeeTrackingNoLabel.oms_processing_bucket,
  left_nav_subgroup: shopeeTrackingNoLabel.left_nav_subgroup
})

const shopeeNoTracking = normalizeShopeeOrder({
  order_id: 'SHOPEE-NO-TRACKING',
  tracking_number: '',
  tracking_core_tracking_number: '',
  label_file_path: '',
  last_label_error: 'pending_document_generation'
})
assert.equal(shopeeNoTracking.tracking_sync_status, 'missing')
assert.equal(shopeeNoTracking.operation_sync_status, 'pending_label')
assert.equal(shopeeNoTracking.oms_processing_bucket, 'unprocessed')
assert.equal(shopeeNoTracking.left_nav_subgroup, 'Chưa Xử Lý')
pass('shopee_tracking_missing_unprocessed', {
  tracking_sync_status: shopeeNoTracking.tracking_sync_status,
  oms_processing_bucket: shopeeNoTracking.oms_processing_bucket,
  left_nav_subgroup: shopeeNoTracking.left_nav_subgroup
})

const shopeeNoTrackingHtmlLabel = normalizeShopeeOrder({
  order_id: '26052234JG8TET',
  tracking_number: '',
  tracking_core_tracking_number: '',
  label_file_path: 'labels/26052234JG8TET.html',
  label_content_type: 'text/html'
})
assert.equal(shopeeNoTrackingHtmlLabel.tracking_sync_status, 'missing')
assert.equal(shopeeNoTrackingHtmlLabel.label_valid, false)
assert.equal(shopeeNoTrackingHtmlLabel.label_status, 'missing')
assert.notEqual(shopeeNoTrackingHtmlLabel.label_status, 'downloaded')
assert.equal(shopeeNoTrackingHtmlLabel.shipping_label_url, '')
pass('shopee_no_tracking_html_label_not_downloaded_26052234JG8TET', {
  tracking_sync_status: shopeeNoTrackingHtmlLabel.tracking_sync_status,
  label_status: shopeeNoTrackingHtmlLabel.label_status,
  label_valid: shopeeNoTrackingHtmlLabel.label_valid
})

const shopeeTrackingHtmlLabel = normalizeShopeeOrder({
  order_id: '2605212129FVB4',
  tracking_number: 'SPXVN068204398575',
  tracking_core_tracking_number: 'SPXVN068204398575',
  label_file_path: 'labels/2605212129FVB4.html',
  label_content_type: 'text/html'
})
assert.equal(shopeeTrackingHtmlLabel.tracking_sync_status, 'complete')
assert.equal(shopeeTrackingHtmlLabel.label_valid, false)
assert.equal(shopeeTrackingHtmlLabel.label_status, 'missing_file')
assert.equal(shopeeTrackingHtmlLabel.operation_sync_status, 'waiting_label_file')
assert.equal(shopeeTrackingHtmlLabel.oms_processing_bucket, 'waiting_label')
assert.equal(shopeeTrackingHtmlLabel.shipping_label_url, '')
pass('shopee_tracking_html_label_waiting_label_2605212129FVB4', {
  tracking_sync_status: shopeeTrackingHtmlLabel.tracking_sync_status,
  label_status: shopeeTrackingHtmlLabel.label_status,
  label_valid: shopeeTrackingHtmlLabel.label_valid,
  oms_processing_bucket: shopeeTrackingHtmlLabel.oms_processing_bucket
})

const shopeeLostFieldRaw = {
  order_income: {
    buyer_payment_method: 'ShopeePay',
    order_discounted_price: 78000,
    seller_discount: 12000,
    buyer_paid_shipping_fee: 16500,
    escrow_amount: 58020,
    escrow_amount_after_adjustment: 58020,
    voucher_from_seller: 0,
    voucher_from_shopee: 0
  },
  buyer_payment_info: {
    buyer_total_amount: 94500,
    shipping_fee: 16500,
    shopee_voucher: 0
  }
}
const shopeeLostFieldReadModel = normalizeOrderListRowForCore(applyOrderFeePhase1ToOrderRow({
  order_id: '2605211PH999WY',
  platform: 'shopee',
  shop: 'chihuy2309',
  revenue: 94500,
  fee_source: 'shopee.payment.get_escrow_detail',
  fee_raw_data: JSON.stringify(shopeeLostFieldRaw),
  payment_method: 'ShopeePay',
  payment_method_source: 'order_fee_details.raw_data',
  label_file_path: 'labels/2605211PH999WY.pdf',
  tracking_number: 'SPXVN2605211'
}))
assert.equal(shopeeLostFieldReadModel.payment_method_display, 'ShopeePay')
assert.equal(shopeeLostFieldReadModel.payment_method_source, 'order_fee_details.raw_data')
assert.equal(shopeeLostFieldReadModel.product_original_amount, 90000)
assert.match(shopeeLostFieldReadModel.product_original_amount_source, /derived|raw_data|Finance Core/)
assert.notEqual(shopeeLostFieldReadModel.finance_source, 'cost_setting_fallback')
pass('shopee_api_finance_lineage_2605211PH999WY', {
  payment_method_source: shopeeLostFieldReadModel.payment_method_source,
  product_original_amount: shopeeLostFieldReadModel.product_original_amount,
  product_original_amount_source: shopeeLostFieldReadModel.product_original_amount_source,
  finance_source: shopeeLostFieldReadModel.finance_source
})

const shopeeFinanceRegression = buildOrderFinanceTaxonomy({
  order_id: '260520VPM23704',
  platform: 'shopee',
  revenue: 85220,
  fee_source: 'shopee_seller_center_detail',
  fee_raw_data: JSON.stringify({
    order_income: {
      order_discounted_price: 99000,
      buyer_paid_shipping_fee: 8000,
      escrow_amount: 70030,
      escrow_amount_after_adjustment: 70030,
      voucher_from_seller: 6534
    },
    buyer_payment_info: {
      buyer_total_amount: 85220,
      shopee_voucher: -21780,
      shipping_fee: 8000
    }
  })
}, [{ order_id: '260520VPM23704', revenue_line: 99000 }])
assert.equal(shopeeFinanceRegression.actual_income, 70030)
assert.equal(shopeeFinanceRegression.product_revenue_after_shop_discount, 99000)
assert.equal(shopeeFinanceRegression.buyer_shipping_paid, 8000)
assert.equal(shopeeFinanceRegression.platform_voucher_total, 21780)
assert.equal(shopeeFinanceRegression.buyer_total_paid, 85220)
assert.equal(shopeeFinanceRegression.seller_cofunded_voucher_amount, 6534)
pass('shopee_finance_260520VPM23704', {
  actual_income: shopeeFinanceRegression.actual_income,
  product_after_discount: shopeeFinanceRegression.product_revenue_after_shop_discount,
  buyer_shipping_paid: shopeeFinanceRegression.buyer_shipping_paid,
  platform_voucher: shopeeFinanceRegression.platform_voucher_total,
  buyer_paid: shopeeFinanceRegression.buyer_total_paid,
  seller_cofunded_voucher: shopeeFinanceRegression.seller_cofunded_voucher_amount
})

const tiktokFinanceNormalized = normalizeTiktokSellerCenterDetailPayload({
  url: 'https://seller-vn.tiktok.com/finance/transactions?orderOrSkuId=584123080227784403',
  header_order_no: '584123080227784403',
  finance_source: 'tiktok_seller_center_finance_transaction',
  fields: {
    product_revenue_after_shop_discount: 89000,
    estimated_fee_total: 21245,
    transaction_fee: 5340,
    commission_fee: 11570,
    handling_fee: 3000,
    tax_vat: 890,
    tax_pit: 445,
    settlement_total: 67755,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
const tiktokFinanceTaxonomy = buildOrderFinanceTaxonomy({
  order_id: '584123080227784403',
  platform: 'tiktok',
  revenue: 89000,
  fee_source: 'tiktok_seller_center_finance_transaction',
  fee_raw_data: JSON.stringify(buildTiktokSellerCenterRawData(tiktokFinanceNormalized)),
  fee_detail_settlement: 1620
}, [{ order_id: '584123080227784403', revenue_line: 89000 }])
assert.equal(tiktokFinanceTaxonomy.finance_source, 'tiktok_seller_center_finance_transaction')
assert.equal(tiktokFinanceTaxonomy.estimated_income, 67755)
assert.equal(tiktokFinanceTaxonomy.actual_income, null)
assert.equal(tiktokFinanceTaxonomy.ops_cost_setting_total, 0)
assert.equal(tiktokFinanceTaxonomy.sfr_service_fee, 1620)
pass('tiktok_finance_584123080227784403', {
  finance_source: tiktokFinanceTaxonomy.finance_source,
  estimated_income: tiktokFinanceTaxonomy.estimated_income,
  actual_income: tiktokFinanceTaxonomy.actual_income,
  sfr_service_fee: tiktokFinanceTaxonomy.sfr_service_fee
})

const observedZero = normalizeTiktokSellerCenterDetailPayload({
  url: 'https://seller-vn.tiktok.com/finance/transactions?orderOrSkuId=584123080227784403',
  header_order_no: '584123080227784403',
  finance_source: 'tiktok_seller_center_finance_transaction',
  fields: {
    product_revenue_after_shop_discount: 89000,
    buyer_shipping_paid: 0,
    settlement_total: 67755,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
assert.equal(observedZero.buyer_shipping_paid, 0)
assert.equal(observedZero.field_meta.buyer_shipping_paid.confidence, 'observed_zero')
pass('tiktok_observed_zero_shipping', {
  buyer_shipping_paid: observedZero.buyer_shipping_paid,
  confidence: observedZero.field_meta.buyer_shipping_paid.confidence,
  source: observedZero.field_meta.buyer_shipping_paid.source
})

const missingMoney = buildOrderFinanceTaxonomy({
  order_id: 'MISSING-MONEY',
  platform: 'tiktok',
  revenue: 89000,
  fee_source: 'tiktok_seller_center_finance_transaction',
  fee_raw_data: JSON.stringify(buildTiktokSellerCenterRawData(observedZero))
}, [{ order_id: 'MISSING-MONEY', revenue_line: 89000 }])
const omsFeeRenderSource = readFileSync(repoFile('apps/fe/js/modules/oms-fee-render.js'), 'utf8')
assert.equal(missingMoney.product_original_amount, null)
assert.equal(missingMoney.fields.product_original_amount.value, null)
assert.ok(omsFeeRenderSource.includes('Chưa có dữ liệu'))
pass('missing_money_field', {
  product_original_amount: missingMoney.product_original_amount,
  source: missingMoney.fields.product_original_amount.source,
  ui_label: 'Chưa có dữ liệu'
})

const tiktokSellerBreakdown584117 = normalizeTiktokSellerCenterDetailPayload({
  url: 'https://seller-vn.tiktok.com/finance/transactions?orderOrSkuId=584117718394898329',
  header_order_no: '584117718394898329',
  finance_source: 'tiktok_seller_center_detail',
  payment_method: 'COD',
  fields: {
    product_original_amount: 65000,
    product_revenue_after_shop_discount: 65000,
    buyer_shipping_paid: 0,
    gross_revenue: 65000,
    buyer_total_paid: 65000,
    sfr_service_fee: 1620,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
const tiktokSellerRaw584117 = buildTiktokSellerCenterRawData(tiktokSellerBreakdown584117)
const tiktokSellerTaxonomy584117 = buildOrderFinanceTaxonomy({
  order_id: '584117718394898329',
  platform: 'tiktok',
  revenue: 65000,
  raw_revenue: 65000,
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify(tiktokSellerRaw584117),
  payment_method: 'COD',
  fee_piship: 1620
}, [{ order_id: '584117718394898329', revenue_line: 65000 }])
const tiktokSellerRead584117 = normalizeOrderListRowForCore(applyOrderFeePhase1ToOrderRow({
  order_id: '584117718394898329',
  platform: 'tiktok',
  shop: '0909128999',
  revenue: 65000,
  raw_revenue: 65000,
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify(tiktokSellerRaw584117),
  payment_method: 'COD',
  payment_method_source: 'order_fee_details.raw_data',
  fee_piship: 1620
}, [{ order_id: '584117718394898329', revenue_line: 65000 }]))
assert.equal(tiktokSellerRead584117.payment_method_display, 'COD')
assert.equal(tiktokSellerRead584117.product_original_amount, 65000)
assert.equal(tiktokSellerTaxonomy584117.product_revenue_after_shop_discount, 65000)
assert.equal(tiktokSellerTaxonomy584117.buyer_shipping_paid, 0)
assert.equal(tiktokSellerTaxonomy584117.estimated_income, 63380)
assert.equal(tiktokSellerTaxonomy584117.actual_income, null)
assert.equal(tiktokSellerTaxonomy584117.sfr_service_fee, 1620)
assert.equal(tiktokSellerTaxonomy584117.piship_fee, 1620)
assert.equal(tiktokSellerTaxonomy584117.ops_cost_setting_total, 1620)
assert.equal(tiktokSellerTaxonomy584117.finance_source, 'tiktok_seller_center_detail')
assert.ok(omsFeeRenderSource.includes("feePanelRow('Phí SFR'"))
assert.ok(!omsFeeRenderSource.includes('Shop chưa có API phí sàn'))
pass('tiktok_seller_center_breakdown_584117718394898329', {
  payment_method: tiktokSellerRead584117.payment_method_display,
  product_original_amount: tiktokSellerRead584117.product_original_amount,
  product_after_discount: tiktokSellerTaxonomy584117.product_revenue_after_shop_discount,
  buyer_shipping_paid: tiktokSellerTaxonomy584117.buyer_shipping_paid,
  estimated_income: tiktokSellerTaxonomy584117.estimated_income,
  actual_income: tiktokSellerTaxonomy584117.actual_income,
  sfr_service_fee: tiktokSellerTaxonomy584117.sfr_service_fee,
  piship_fee: tiktokSellerTaxonomy584117.piship_fee,
  finance_source: tiktokSellerTaxonomy584117.finance_source
})

const tiktokSellerBreakdown584116 = normalizeTiktokSellerCenterDetailPayload({
  url: 'https://seller-vn.tiktok.com/finance/transactions?orderOrSkuId=584116980455670898',
  header_order_no: '584116980455670898',
  finance_source: 'tiktok_seller_center_detail',
  payment_method: 'COD',
  fields: {
    product_original_amount: 75000,
    product_revenue_after_shop_discount: 75000,
    buyer_shipping_paid: 0,
    gross_revenue: 75000,
    buyer_total_paid: 75000,
    transaction_fee: 5340,
    commission_fee: 11570,
    handling_fee: 3000,
    tax_vat: 890,
    tax_pit: 445,
    sfr_service_fee: 1620,
    estimated_income: 52135,
    actual_income: null
  },
  actual_income_available: false,
  settlement_status: 'pending_settlement'
})
const tiktokSellerRaw584116 = buildTiktokSellerCenterRawData(tiktokSellerBreakdown584116)
const tiktokSellerRead584116 = normalizeOrderListRowForCore(applyOrderFeePhase1ToOrderRow({
  order_id: '584116980455670898',
  platform: 'tiktok',
  shop: '0909128999',
  revenue: 75000,
  raw_revenue: 75000,
  fee_source: 'tiktok_seller_center_detail',
  fee_raw_data: JSON.stringify(tiktokSellerRaw584116),
  payment_method: 'COD',
  payment_method_source: 'order_fee_details.raw_data',
  fee_detail_commission: 11570,
  fee_detail_payment: 5340,
  fee_detail_handling: 3000,
  fee_detail_tax_vat: 890,
  fee_detail_tax_pit: 445,
  fee_piship: 1620
}, [{ order_id: '584116980455670898', revenue_line: 75000 }]))
const tiktokSellerTaxonomy584116 = tiktokSellerRead584116.fee_breakdown.taxonomy
const tiktok584116ApiFeeRows = tiktokSellerRead584116.fee_breakdown.groups
  .find(group => group.key === 'api_fee')?.rows || []
const tiktok584116TaxRows = tiktokSellerRead584116.fee_breakdown.groups
  .find(group => group.key === 'api_tax')?.rows || []
assert.equal(tiktokSellerRead584116.payment_method_display, 'COD')
assert.equal(tiktokSellerRead584116.product_original_amount, 75000)
assert.equal(tiktokSellerTaxonomy584116.buyer_shipping_paid, 0)
assert.equal(tiktokSellerTaxonomy584116.estimated_income, 52135)
assert.equal(tiktokSellerTaxonomy584116.actual_income, null)
assert.equal(tiktokSellerTaxonomy584116.sfr_service_fee, 1620)
assert.equal(tiktokSellerTaxonomy584116.piship_fee, 1620)
assert.equal(tiktokSellerTaxonomy584116.ops_cost_setting_total, 1620)
assert.ok(tiktok584116ApiFeeRows.some(row => row.code === 'fee_payment' && row.amount === 5340))
assert.ok(tiktok584116ApiFeeRows.some(row => row.code === 'fee_commission' && row.amount === 11570))
assert.ok(tiktok584116ApiFeeRows.some(row => row.code === 'fee_handling' && row.amount === 3000))
assert.ok(tiktok584116TaxRows.some(row => row.code === 'tax_vat' && row.amount === 890))
assert.ok(tiktok584116TaxRows.some(row => row.code === 'tax_pit' && row.amount === 445))
pass('tiktok_seller_center_breakdown_584116980455670898', {
  payment_method: tiktokSellerRead584116.payment_method_display,
  product_original_amount: tiktokSellerRead584116.product_original_amount,
  buyer_shipping_paid: tiktokSellerTaxonomy584116.buyer_shipping_paid,
  estimated_income: tiktokSellerTaxonomy584116.estimated_income,
  actual_income: tiktokSellerTaxonomy584116.actual_income,
  api_fee_rows: tiktok584116ApiFeeRows.map(row => row.code),
  api_tax_rows: tiktok584116TaxRows.map(row => row.code),
  sfr_service_fee: tiktokSellerTaxonomy584116.sfr_service_fee,
  piship_fee: tiktokSellerTaxonomy584116.piship_fee
})

const manualDateRows = [
  {
    order_id: 'DATE-LABEL-001',
    platform: 'tiktok',
    shop: '0909128999',
    order_date: '2026-05-21 09:00:00',
    created_at: '2026-05-21 09:00:00',
    oms_status: 'READY_TO_SHIP',
    shipping_status: 'LOGISTICS_REQUEST_CREATED',
    tracking_number: 'TT123',
    tracking_core_tracking_number: 'TT123',
    label_status: 'pending_retry',
    label_file_path: '',
    label_reason: 'pending_retry',
    tracking_events: '[{"status":"created"}]',
    source_mode: 'browser_sync',
    source_updated_at: '2026-05-21 10:00:00',
    fee_source: 'tiktok_seller_center_detail',
    fee_raw_data: JSON.stringify(tiktokSellerRaw584117),
    fee_synced_at: '2026-05-21 10:00:00',
    item_count: 1,
    customer_name: 'Khach'
  },
  {
    order_id: 'DATE-FINANCE-COST',
    platform: 'tiktok',
    shop: '0909128999',
    order_date: '2026-05-21 09:30:00',
    created_at: '2026-05-21 09:30:00',
    oms_status: 'DELIVERED',
    shipping_status: 'DELIVERED',
    tracking_number: 'TT124',
    tracking_events: '[{"status":"delivered"}]',
    finance_source: 'cost_setting_fallback',
    fee_source: 'cost_setting_fallback',
    finance_sync_status: 'fallback_only',
    item_count: 1,
    customer_name: 'Khach'
  },
  {
    order_id: 'DATE-FINANCE-TERMINAL',
    platform: 'tiktok',
    shop: '0909128999',
    order_date: '2026-05-21 10:00:00',
    created_at: '2026-05-21 10:00:00',
    marketplace_status: 'completed',
    oms_status: 'COMPLETED',
    shipping_status: 'DELIVERED',
    status_changed_at: '2026-05-21 20:00:00',
    fee_synced_at: '2026-05-21 08:00:00',
    fee_source: 'tiktok_seller_center_detail',
    fee_raw_data: JSON.stringify(tiktokSellerRaw584117),
    tracking_number: 'TT125',
    tracking_events: '[{"status":"delivered"}]',
    item_count: 1,
    customer_name: 'Khach'
  },
  {
    order_id: 'DATE-TRACKING-EMPTY',
    platform: 'tiktok',
    shop: '0909128999',
    order_date: '2026-05-21 11:00:00',
    created_at: '2026-05-21 11:00:00',
    oms_status: 'SHIPPED',
    shipping_status: 'SHIPPED',
    tracking_number: 'TT126',
    tracking_events: '[]',
    item_count: 1,
    customer_name: 'Khach'
  },
  {
    order_id: 'DATE-NO-FLAG',
    platform: 'tiktok',
    shop: '0909128999',
    order_date: '2026-05-21 12:00:00',
    created_at: '2026-05-21 12:00:00',
    oms_status: 'DELIVERED',
    shipping_status: 'DELIVERED',
    tracking_number: 'TT127',
    tracking_events: '[{"status":"delivered"}]',
    label_file_path: 'labels/DATE-NO-FLAG.pdf',
    fee_source: 'tiktok_seller_center_detail',
    fee_raw_data: JSON.stringify(buildTiktokSellerCenterRawData({
      ...tiktokSellerBreakdown584117,
      actual_income: 63380,
      actual_income_available: true,
      settlement_status: 'confirmed',
      finance_confidence: 'confirmed'
    })),
    fee_synced_at: '2026-05-21 13:00:00',
    item_count: 1,
    customer_name: 'Khach'
  }
]
const labelQueuePreview = evaluateManualDateScanRows(manualDateRows, {
  platform: 'tiktok',
  shop: '0909128999',
  action_type: 'retry_label',
  from_date: '2026-05-21',
  to_date: '2026-05-21',
  date_field: 'created_at',
  dry_run: true,
  limit: 10
})
assert.equal(labelQueuePreview.total_orders_in_date_range, manualDateRows.length)
assert.ok(labelQueuePreview.label_retry_queue.some(row => row.order_id === 'DATE-LABEL-001'))
assert.ok(labelQueuePreview.per_order.some(row => row.order_id === 'DATE-NO-FLAG'))
pass('label_retry_queue_date_scan', {
  total_orders_in_date_range: labelQueuePreview.total_orders_in_date_range,
  eligible_count: labelQueuePreview.eligible_count,
  source_core: labelQueuePreview.per_order[0]?.source_core
})

const financeQueuePreview = evaluateManualDateScanRows(manualDateRows, {
  platform: 'tiktok',
  shop: '0909128999',
  action_type: 'sync_finance',
  from_date: '2026-05-21',
  to_date: '2026-05-21',
  date_field: 'created_at',
  dry_run: true,
  limit: 10
})
assert.ok(financeQueuePreview.finance_resync_queue.some(row => row.order_id === 'DATE-FINANCE-COST' && row.finance_source === 'cost_setting_fallback'))
assert.ok(financeQueuePreview.finance_resync_queue.some(row => row.order_id === 'DATE-FINANCE-TERMINAL'))
pass('finance_resync_queue_and_terminal_finance', {
  eligible_count: financeQueuePreview.eligible_count,
  queued_orders: financeQueuePreview.finance_resync_queue.map(row => row.order_id)
})

const trackingQueuePreview = evaluateManualDateScanRows(manualDateRows, {
  platform: 'tiktok',
  shop: '0909128999',
  action_type: 'refresh_tracking',
  from_date: '2026-05-21',
  to_date: '2026-05-21',
  date_field: 'created_at',
  dry_run: true,
  limit: 10
})
assert.ok(trackingQueuePreview.tracking_resync_queue.some(row => row.order_id === 'DATE-TRACKING-EMPTY' && row.tracking_number === 'TT126'))
pass('tracking_resync_queue_events_empty', {
  eligible_count: trackingQueuePreview.eligible_count,
  queued_orders: trackingQueuePreview.tracking_resync_queue.map(row => row.order_id)
})

const dryRunContract = evaluateManualDateScanRows(manualDateRows, {
  platform: 'tiktok',
  shop: '0909128999',
  action_type: 'scan_all_errors',
  from_date: '2026-05-21',
  to_date: '2026-05-21',
  date_field: 'created_at',
  dry_run: true,
  limit: 10
})
assert.ok(Number.isInteger(dryRunContract.total_orders_in_date_range))
assert.ok(Number.isInteger(dryRunContract.eligible_count))
assert.ok(Number.isInteger(dryRunContract.skipped_count))
assert.ok(dryRunContract.per_order.every(row => 'skip_reason' in row && row.source_core && row.current_status && row.runner_api_path))
pass('manual_date_scan_dry_run_contract', {
  total_orders_in_date_range: dryRunContract.total_orders_in_date_range,
  eligible_count: dryRunContract.eligible_count,
  skipped_count: dryRunContract.skipped_count
})

const liveSelectedContract = evaluateManualDateScanRows(manualDateRows, {
  platform: 'tiktok',
  shop: '0909128999',
  action_type: 'sync_finance',
  from_date: '2026-05-21',
  to_date: '2026-05-21',
  date_field: 'created_at',
  dry_run: false,
  selected_order_ids: ['DATE-FINANCE-COST'],
  limit: 10
})
assert.deepEqual(liveSelectedContract.selected_eligible_order_ids, ['DATE-FINANCE-COST'])
assert.equal(liveSelectedContract.eligible_count, 1)
pass('manual_date_scan_live_selected_only', {
  selected_eligible_order_ids: liveSelectedContract.selected_eligible_order_ids,
  eligible_count: liveSelectedContract.eligible_count
})

const botSettingsSource = readFileSync(repoFile('apps/fe/js/modules/oms-bot-settings.js'), 'utf8')
const omsDashboardHtml = readFileSync(repoFile('apps/fe/pages/oms-dashboard.html'), 'utf8')
const omsLayoutCss = readFileSync(repoFile('apps/fe/css/oms-dashboard/layout-api.css'), 'utf8')
const logisticsWatchSource = readFileSync(repoFile('apps/fe/js/modules/oms-logistics-watch.js'), 'utf8')
const jobsRouteSource = readFileSync(repoFile('apps/worker-api/src/routes/jobs/index.js'), 'utf8')
const manualSyncSource = readFileSync(repoFile('apps/worker-api/src/routes/orders/manual-sync-backfill.js'), 'utf8')
const omsRenderSource = readFileSync(repoFile('apps/fe/js/modules/oms-render.js'), 'utf8')
const tiktokParserSource = readFileSync('E:/shophuyvan-python-automation/oms_python/platforms/tiktok/orders/parser_chitiet.py', 'utf8')
assert.ok(botSettingsSource.includes('botDateScanField'))
assert.ok(botSettingsSource.includes('selected_order_ids'))
assert.ok(botSettingsSource.includes("apiCacheBustPath('/api/orders/manual-sync/backfill')"))
assert.ok(botSettingsSource.includes('dateRangeScanPayload(true)'))
assert.ok(!botSettingsSource.includes('.filter(row => row.eligible)'))
assert.ok(botSettingsSource.includes('pull_orders'))
const manualActionBlock = botSettingsSource.match(/const DATE_SCAN_ACTIONS = \[([\s\S]*?)\];/)
assert.ok(manualActionBlock)
assert.ok(manualActionBlock[1].includes("value: 'pull_orders'"))
assert.ok(botSettingsSource.includes('fetchCoreShops'))
assert.ok(botSettingsSource.includes("'/api/orders/sync-api-orders'"))
assert.ok(botSettingsSource.includes('Cài tự động'))
assert.ok(botSettingsSource.includes('Chạy thủ công'))
assert.ok(botSettingsSource.includes('refreshDateRangeJobStatus'))
assert.ok(botSettingsSource.includes('copyDateRangeScanLog'))
assert.ok(omsDashboardHtml.includes('sidebar-settings-btn'))
assert.ok(omsDashboardHtml.includes('Cài đặt vận hành'))
assert.ok(omsDashboardHtml.includes('btnPullAllCoreShops'))
assert.ok(omsDashboardHtml.includes('Kéo đơn toàn bộ shop'))
assert.ok(omsLayoutCss.includes('.sidebar-ops-settings'))
assert.ok(logisticsWatchSource.includes("order.label_valid === true && ['LOGISTICS_PACKAGED', 'ADVANCE_FULFILMENT'].includes(fulfillment)"))
assert.ok(logisticsWatchSource.includes("{ label: 'Có mã vận đơn', done: !!tracking"))
assert.ok(omsRenderSource.includes("o.label_valid === true && o.label_status === 'downloaded'"))
assert.ok(tiktokParserSource.includes('"don hang"'))
assert.ok(tiktokParserSource.includes('if not event_time:'))
assert.ok(tiktokParserSource.includes('finance_transactions_xem_chi_tiet'))
pass('manual_settings_ui_payload_only', {
  endpoint: '/api/orders/manual-sync/backfill',
  date_field_control: true,
  selected_order_ids: true,
  operations_settings_button: true,
  auto_tab: true,
  manual_tab: true,
  core_shop_select: true,
  pull_all_button: true,
  manual_pull_orders_dropdown: true
})

assert.ok(jobsRouteSource.includes("status = 'runner_timeout'"))
assert.ok(jobsRouteSource.includes("status IN ('pending','queued','picked','browser_launch_requested','browser_launched','login_checking','running','processing')"))
assert.ok(jobsRouteSource.includes("'completed_no_change','failed','runner_timeout','runner_requires_login'"))
assert.ok(manualSyncSource.includes('PASS chỉ tính sau khi runner và OMS readback hoàn tất'))
pass('automation_pipeline_queued_running_not_pass', {
  runner_timeout: true,
  terminal_requires_readback: true,
  queued_running_not_pass: true
})

const readUpdateSource = readFileSync(repoFile('apps/worker-api/src/routes/orders/read-update-webhook.js'), 'utf8')
assert.ok(readUpdateSource.includes('show_update_cost_button: !hasCost'))
assert.ok(readUpdateSource.includes('show_update_mapping_button: !hasProductCore && !hasCost'))
assert.ok(readUpdateSource.includes("const hasTrackingMissingTab = allShipUpper.includes('TRACKING_MISSING')"))
assert.ok(omsRenderSource.includes('const showMapButton = item.show_update_mapping_button === true'))
assert.ok(!omsRenderSource.includes('Number(item.unit_cost || item.item_cost_total || item.cogs_total || item.cost_real || 0)'))
pass('cost_button_core_rule', { expected: 'unit_cost/item_cost_total/cogs_total present -> show_update_cost_button=false' })

const costVariationSource = readFileSync(repoFile('apps/worker-api/src/routes/products/cost-variations-handler.js'), 'utf8')
const costResolutionSource = readFileSync(repoFile('apps/worker-api/src/routes/orders/cost-resolution.js'), 'utf8')
assert.ok(costVariationSource.includes('ON CONFLICT(platform, shop, platform_sku)'))
assert.ok(costVariationSource.includes('product_variations.map_status = \'MAPPED\''))
assert.ok(costResolutionSource.includes('platform, shop, platform_sku, internal_sku, mapped_items'))
assert.ok(readUpdateSource.includes("mapping_status: hasProductCore ? 'mapped' : (hasCost ? 'combo_mapped' : 'unmapped')"))
pass('combo_map_persistence', { expected: 'saved combo map stays combo_mapped after read-core/F5' })

const { response: chatTargetResponse, body: chatTarget } = await fetchJsonStrict(
  'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/core/orders/528845557532322/chat-target'
)
assert.equal(chatTargetResponse.status, 200)
assert.equal(chatTarget.chat_target?.chat_open_status, 'not_connected')
assert.equal(chatTarget.chat_target?.manual_required, true)
assert.equal(chatTarget.chat_target?.reason, 'lazada_conversation_not_found')
pass('lazada_chat_target_safe_response', {
  http_status: chatTargetResponse.status,
  chat_open_status: chatTarget.chat_target?.chat_open_status,
  manual_required: chatTarget.chat_target?.manual_required,
  reason: chatTarget.chat_target?.reason
})

const runReportJobsSource = readFileSync('E:/shophuyvan-python-automation/oms_python/features/reports/run_report_jobs.py', 'utf8')
const tiktokRetryLabelSource = readFileSync('E:/shophuyvan-python-automation/oms_python/platforms/tiktok/orders/taitem.py', 'utf8')
assert.ok(runReportJobsSource.includes('ACTION_RETRY_LABEL = "retry_label"'))
assert.ok(runReportJobsSource.includes('wrong_action_type_for_retry_label'))
assert.ok(tiktokRetryLabelSource.includes('"action_type": "retry_label"'))
assert.ok(tiktokRetryLabelSource.includes('tiktok_label_not_saved_before_packed') || readUpdateSource.includes('tiktok_label_not_saved_before_packed'))
const tiktokLabelState = buildOrderLabelState({
  order_id: '584123080227784403',
  platform: 'tiktok',
  shipping_status: 'SHIPPED',
  last_label_error: 'tiktok_label_not_saved_before_packed',
  label_download_mode: 'local_chrome_retry_label',
  label_download_supported: true,
  label_download_read_only: true,
  label_download_requires_manual: false,
  label_download_source: 'local_python_chrome:platforms/tiktok/orders/taitem.py'
})
assert.ok(['manual_required', 'not_ready'].includes(tiktokLabelState.label_status))
assert.equal(tiktokLabelState.label_reason, 'tiktok_label_not_saved_before_packed')
pass('tiktok_retry_label_not_ready', {
  label_status: tiktokLabelState.label_status,
  label_reason: tiktokLabelState.label_reason,
  source: tiktokLabelState.label_download_source
})

const promotionReady = buildPromotionCorePreview(
  'shopee',
  'chihuy1984',
  { platform_sku: 'SKU_READY', platform_item_id: '1001', model_id: '2002', internal_sku: 'INT_READY', price: 120000, discount_price: 99000 },
  { module: 'discount', program_id: 'D100', item_id: '1001', model_id: '2002', sku: 'SKU_READY', promotion_price: 99000, original_price: 120000, status: 'ongoing', mapping_source: 'marketplace_discount_items' },
  97000,
  { internal_sku: 'INT_READY', guard_price: 90000, enforce_cost_guard: true }
)
assert.equal(promotionReady.status, 'ready')
assert.equal(promotionReady.discount_id, 'D100')
assert.equal(promotionReady.item_id, '1001')
assert.equal(promotionReady.model_id, '2002')
assert.equal(promotionReady.endpoint, '/api/v2/discount/update_discount_item')
assert.deepEqual(buildPromotionLivePayload(promotionReady), {
  discount_id: 'D100',
  item_list: [{
    item_id: 1001,
    model_list: [{ model_id: 2002, model_promotion_price: 97000, promotion_price: 97000 }]
  }]
})

const promotionMissingMapping = buildPromotionCorePreview('shopee', 'chihuy1984', { platform_sku: 'SKU_MISSING' }, null, 97000)
assert.equal(promotionMissingMapping.status, 'blocked')
assert.equal(promotionMissingMapping.block_reason, 'missing_discount_mapping')

const promotionBundle = buildPromotionCorePreview(
  'shopee',
  'chihuy1984',
  { platform_sku: 'SKU_BUNDLE', platform_item_id: '1001', model_id: '2002' },
  { module: 'bundle_deal', program_id: 'B100', item_id: '1001', model_id: '2002', promotion_price: 99000, status: 'ongoing' },
  97000
)
assert.equal(promotionBundle.status, 'blocked')
assert.equal(promotionBundle.block_reason, 'bundle_deal_not_discount_item')

const promotionNoAllowlist = buildPromotionCorePreview(
  'shopee',
  'chihuy1984',
  { platform_sku: 'SKU_VOUCHER', platform_item_id: '1001', model_id: '2002' },
  { module: 'voucher', program_id: 'V100', item_id: '1001', model_id: '2002', promotion_price: 99000, status: 'ongoing' },
  97000
)
assert.equal(promotionNoAllowlist.status, 'blocked')
assert.ok(promotionNoAllowlist.block_reasons.includes('promotion_write_endpoint_not_allowlisted'))

const marketplacePreviewSource = readFileSync(repoFile('apps/worker-api/src/routes/products/marketplace-preview.js'), 'utf8')
const catalogPreviewSource = readFileSync(repoFile('apps/fe/js/admin/shops/catalog-preview.js'), 'utf8')
assert.ok(marketplacePreviewSource.includes("const proposedStock = actionType === 'update_stock'"))
assert.ok(catalogPreviewSource.includes('const proposedStockLine = isPromotionPriceFlow'))
assert.ok(catalogPreviewSource.includes('applyCatalogPromotionLive'))
assert.equal(promotionWriteEndpointRule('shopee', 'discount')?.endpoint, '/api/v2/discount/update_discount_item')
assert.equal(promotionWriteEndpointRule('shopee', 'discount')?.requires_admin_confirm, true)

const shopeeWriteSuccess = buildShopeeActionResult({
  ok: true,
  status: 'ok',
  action: 'update_discount_item',
  endpoint: '/api/v2/discount/update_discount_item',
  verified: true,
  sent_to_shopee: true,
  write_status: 'success',
  promotion_sync_status: 'synced',
  write_source: 'shopee_open_platform',
  readback_source: 'shopee_open_platform'
})
assert.equal(shopeeWriteSuccess.ok, true)
assert.equal(shopeeWriteSuccess.status, 'ok')
assert.equal(shopeeWriteSuccess.write_status, 'success')

const shopeeWriteMismatch = buildShopeeActionResult({
  ok: true,
  status: 'readback_mismatch',
  action: 'update_discount_item',
  endpoint: '/api/v2/discount/update_discount_item',
  verified: false,
  sent_to_shopee: true,
  write_status: 'readback_mismatch',
  promotion_sync_status: 'readback_mismatch'
})
assert.equal(shopeeWriteMismatch.ok, false)
assert.equal(shopeeWriteMismatch.status, 'readback_mismatch')
assert.equal(shopeeWriteMismatch.write_status, 'readback_mismatch')
pass('promotion_core_shopee_discount_live_write_lock', {
  ready_status: promotionReady.status,
  missing_mapping: promotionMissingMapping.block_reason,
  bundle_deal: promotionBundle.block_reason,
  allowlist_endpoint: promotionWriteEndpointRule('shopee', 'discount')?.endpoint,
  no_stock_proposal_in_price_flow: true,
  success_status: shopeeWriteSuccess.write_status,
  mismatch_status: shopeeWriteMismatch.status
})

console.log(JSON.stringify({ ok: true, cases: results }, null, 2))
