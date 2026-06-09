// ════════════════════════════════════════════════════════════════════
// DASHBOARD — Tổng quan (đếm unique order_id)
// ════════════════════════════════════════════════════════════════════

import { getFilters, buildWhere } from '../../utils/filters.js'
import { ensureReturnReverseLedgerTable } from '../../core/returns/reverse-core.js'
import { moneyNumber, dashboardStatusAggregate } from '../../core/dashboard/summary-core.js'
import { applyDashboardFinanceFeeCoreToRow } from '../../core/dashboard/finance-fee-core.js'
import { loadOrderFinanceCore } from '../../core/orders/finance-core.js'
import { ensureOrderFeeDetailsReadTable, feeRawNumberSql } from '../orders/cost-resolution.js'
import { rebuildOrderAnalytics } from '../order-analytics/order-analytics-rebuild-core.js'

function buildAdsSnapshotWhere(filters) {
  const conds = [`COALESCE(spend, 0) > 0`]
  const params = []

  if (filters.from) {
    conds.push(`date(snapshot_date) >= ?`)
    params.push(filters.from)
  }
  if (filters.to) {
    conds.push(`date(snapshot_date) <= ?`)
    params.push(filters.to)
  }
  if (filters.platform) {
    conds.push(`platform = ?`)
    params.push(filters.platform)
  }
  if (filters.shops && filters.shops.length > 0) {
    const placeholders = filters.shops.map(() => '?').join(',')
    conds.push(`shop IN (${placeholders})`)
    filters.shops.forEach(shop => params.push(shop))
  } else if (filters.shop) {
    conds.push(`shop = ?`)
    params.push(filters.shop)
  }

  return { where: 'WHERE ' + conds.join(' AND '), params }
}

function buildAllOrderWhere(filters, prefix = '') {
  const { where, params } = buildWhere(filters, prefix)
  const normalClause = `${prefix}order_type = 'normal'`
  // Dashboard tổng hợp hủy/hoàn cần đọc cả đơn không còn normal, nhưng vẫn phải giữ alias khi query có JOIN.
  const allOrderWhere = where
    .replace(`WHERE ${normalClause} AND `, 'WHERE ')
    .replace(`WHERE ${normalClause}`, 'WHERE 1=1')
  return { where: allOrderWhere, params }
}

function financeOptionsFromFilters(filters = {}) {
  return {
    from: filters.from,
    to: filters.to,
    platform: filters.platform,
    shop: filters.shop,
    shops: filters.shops || []
  }
}

async function loadFreshOrderFinanceCore(env, filters = {}) {
  const options = financeOptionsFromFilters(filters)
  let financeCore = await loadOrderFinanceCore(env, options)
  const staleReasons = financeCore?.snapshot_health?.stale_reasons || []
  if (financeCore?.status === 'stale' && staleReasons.includes('missing_order_analytics_rows')) {
    // Khi import/API đã có đơn mới nhưng Finance Core thiếu row, rebuild ngay để dashboard không mất shop.
    const rebuild = await rebuildOrderAnalytics(env, { ...options, rebuild: true, sync_payment: false })
    financeCore = await loadOrderFinanceCore(env, options)
    financeCore.auto_rebuild = {
      status: rebuild?.status || '',
      saved: rebuild?.saved || 0,
      deleted_stale: rebuild?.deleted_stale || 0,
      warnings: rebuild?.warnings || []
    }
  }
  return financeCore
}

function mapFinanceCoreDay(row = {}) {
  const actualIncome = moneyNumber(row.actual_income)
  const platformFees = moneyNumber(row.platform_fees)
  const adsCost = moneyNumber(row.ads_cost_allocated)
  const refundDeduction = moneyNumber(row.refund_deduction)
  const financeFee = moneyNumber(platformFees + adsCost + refundDeduction)
  const netProfit = moneyNumber(row.net_profit)
  return {
    d: row.bucket,
    platform: row.platform || '',
    shop: row.shop || '',
    orders: moneyNumber(row.orders),
    revenue: moneyNumber(row.gross_revenue),
    actual_income: actualIncome,
    cost_invoice: moneyNumber(row.cost_of_goods),
    cost_real: moneyNumber(row.cost_of_goods),
    fee: financeFee,
    finance_core_fee: financeFee,
    platform_fees: platformFees,
    ads_cost_allocated: adsCost,
    return_refund: refundDeduction,
    tax_flat: 0,
    tax_income: 0,
    profit_invoice: netProfit,
    profit_real: netProfit,
    margin_pct: actualIncome ? moneyNumber(netProfit * 100 / actualIncome) : 0,
    finance_core_source: 'order_finance_core',
    source: 'order_analytics'
  }
}

function applyOrderFinanceCoreSummary(row = {}, orderFinanceCore = null) {
  const summary = orderFinanceCore?.summary || {}
  if (orderFinanceCore?.status !== 'ok' || !Object.prototype.hasOwnProperty.call(summary, 'orders')) {
    const isStale = orderFinanceCore?.status === 'stale'
    return {
      ...row,
      dashboard_finance_source: isStale ? 'finance_core_stale_orders_v2_fallback' : 'orders_v2_legacy_fallback',
      dashboard_finance_confidence: isStale ? 'stale_fallback' : 'fallback',
      dashboard_finance_warning: orderFinanceCore?.warning || orderFinanceCore?.error || ''
    }
  }
  const platformFees = moneyNumber(summary.platform_fees)
  const adsCost = moneyNumber(summary.ads_cost_allocated)
  const refundDeduction = moneyNumber(summary.refund_deduction)
  // Dashboard giữ hoàn/trả thành dòng riêng để frontend không trừ hai lần khi render phí.
  return {
    ...row,
    total_revenue: moneyNumber(summary.gross_revenue),
    total_cost_invoice: moneyNumber(summary.cost_of_goods),
    total_cost_real: moneyNumber(summary.cost_of_goods),
    total_fee: moneyNumber(platformFees + adsCost),
    total_fee_from_orders: moneyNumber(platformFees + adsCost),
    total_return_refund: refundDeduction,
    total_profit_invoice: moneyNumber(summary.net_profit),
    total_profit_real: moneyNumber(summary.net_profit),
    total_profit_invoice_before_returns: moneyNumber(summary.net_profit + refundDeduction),
    total_profit_real_before_returns: moneyNumber(summary.net_profit + refundDeduction),
    total_platform_fee: platformFees,
    total_ads_fee: Math.max(moneyNumber(row.total_ads_fee), adsCost),
    dashboard_finance_source: 'order_finance_core',
    dashboard_finance_confidence: moneyNumber(summary.estimated_orders) ? 'mixed' : 'confirmed'
  }
}

function shopBreakdownKey(row = {}) {
  return `${String(row.platform || '').toLowerCase()}::${String(row.shop || '')}`
}

function mergeShopBreakdownWithFinanceCore(statusRows = [], orderFinanceCore = null) {
  const rowsByShop = new Map()
  ;(Array.isArray(statusRows) ? statusRows : []).forEach(row => {
    const key = shopBreakdownKey(row)
    if (!key.endsWith('::')) {
      rowsByShop.set(key, {
        ...row,
        shop_import_revenue: moneyNumber(row.shop_revenue),
        shop_revenue_source: 'orders_v2_status_core',
        shop_finance_confidence: 'fallback'
      })
    }
  })

  if (orderFinanceCore?.status !== 'ok') {
    return Array.from(rowsByShop.values())
      .sort((a, b) =>
        Number(b.shop_total_orders || 0) - Number(a.shop_total_orders || 0) ||
        Number(b.shop_revenue || 0) - Number(a.shop_revenue || 0)
      )
  }

  ;(Array.isArray(orderFinanceCore?.by_shop) ? orderFinanceCore.by_shop : []).forEach(row => {
    const key = shopBreakdownKey(row)
    if (key.endsWith('::')) return
    const base = rowsByShop.get(key) || {
      platform: row.platform,
      shop: row.shop,
      shop_orders: moneyNumber(row.orders),
      shop_success_orders: moneyNumber(row.orders),
      shop_completed_orders: 0,
      shop_shipping_orders: 0,
      shop_cancel_orders: 0,
      shop_return_orders: 0,
      shop_total_orders: moneyNumber(row.orders),
      shop_import_revenue: 0
    }
    // Chi tiết doanh thu trong thẻ KPI phải dùng cùng Finance Core với tổng, tránh lệch do đọc orders_v2 legacy.
    rowsByShop.set(key, {
      ...base,
      platform: row.platform || base.platform,
      shop: row.shop || base.shop,
      shop_orders: moneyNumber(base.shop_orders || row.orders),
      shop_success_orders: moneyNumber(base.shop_success_orders || row.orders),
      shop_total_orders: moneyNumber(base.shop_total_orders || row.orders),
      shop_revenue: moneyNumber(row.gross_revenue),
      shop_actual_income: moneyNumber(row.actual_income),
      shop_platform_fees: moneyNumber(row.platform_fees),
      shop_estimated_orders: moneyNumber(row.estimated_orders),
      shop_escrow_orders: moneyNumber(row.escrow_orders),
      shop_payment_api_orders: moneyNumber(row.payment_api_orders),
      shop_revenue_source: 'order_finance_core',
      shop_finance_confidence: moneyNumber(row.estimated_orders) ? 'mixed' : 'confirmed'
    })
  })

  return Array.from(rowsByShop.values())
    .sort((a, b) =>
      Number(b.shop_total_orders || 0) - Number(a.shop_total_orders || 0) ||
      Number(b.shop_revenue || 0) - Number(a.shop_revenue || 0)
    )
}

async function dashboard(request, env, cors) {
  await ensureReturnReverseLedgerTable(env)
  await ensureOrderFeeDetailsReadTable(env)
  const filters = getFilters(new URL(request.url))
  let orderFinanceCore = null
  try {
    orderFinanceCore = await loadFreshOrderFinanceCore(env, filters)
  } catch (err) {
    // Dashboard không được tự tính lại thay Finance Core khi core lỗi; trả metadata lỗi để UI/debug nhìn rõ.
    orderFinanceCore = { status: 'error', error: err?.message || String(err), summary: {} }
  }
  const { where: whereAlias, params: aliasParams } = buildWhere(filters, 'o.')
  const { where: whereAllOrders, params: allOrderParams } = buildAllOrderWhere(filters)
  const { where: whereAliasAllOrders, params: aliasAllOrderParams } = buildAllOrderWhere(filters, 'o.')

  const row = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT o.order_id)   AS total_orders,
      SUM(o.revenue)               AS total_revenue,
      SUM(o.fee)                   AS total_fee,
      SUM(o.cost_invoice)          AS total_cost_invoice,
      SUM(o.cost_real)             AS total_cost_real,
      SUM(o.profit_invoice)        AS total_profit_invoice_before_returns,
      SUM(o.profit_real)           AS total_profit_real_before_returns,
      SUM(o.profit_invoice - COALESCE(r.refund_amount, 0)) AS total_profit_invoice,
      SUM(o.profit_real - COALESCE(r.refund_amount, 0))    AS total_profit_real,
      SUM(COALESCE(r.refund_amount, 0)) AS total_return_refund,
      COUNT(DISTINCT CASE WHEN r.order_id IS NOT NULL THEN o.order_id END) AS api_return_orders,
      SUM(o.tax_flat)              AS total_tax_flat,
      SUM(o.tax_income)            AS total_tax_income,
      SUM(o.tax_flat + o.tax_income) AS total_tax,
      SUM(o.fee_platform)          AS total_platform_fee,
      SUM(o.fee_payment)           AS total_payment_fee,
      SUM(o.fee_affiliate)         AS total_affiliate_fee,
      SUM(o.fee_ads)               AS total_ads_fee,
      SUM(o.fee_piship)            AS total_piship_fee,
      SUM(o.fee_service)           AS total_service_fee,
      SUM(o.fee_packaging + o.fee_operation + o.fee_labor) AS total_fixed_fee
    FROM orders_v2 o
    LEFT JOIN (
      SELECT LOWER(COALESCE(platform, '')) AS platform,
             order_id,
             SUM(COALESCE(effective_refund_amount, 0)) AS refund_amount
      FROM marketplace_return_reverse_ledger
      WHERE is_finance_closed = 1
      GROUP BY LOWER(COALESCE(platform, '')), order_id
    ) r ON r.platform = LOWER(COALESCE(o.platform, '')) AND r.order_id = o.order_id
    ${whereAlias}
  `).bind(...aliasParams).first()

  let feeBucketRow = {}
  try {
    feeBucketRow = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT o.order_id) AS fee_scope_orders,
        COUNT(DISTINCT CASE WHEN f.order_id IS NOT NULL THEN o.order_id END) AS fee_detail_orders,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_commission, 0) ELSE COALESCE(o.fee_platform, 0) END) AS total_platform_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_payment, 0) ELSE COALESCE(o.fee_payment, 0) END) AS total_payment_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_service, 0) ELSE COALESCE(o.fee_service, 0) END) AS total_service_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_affiliate, 0) ELSE COALESCE(o.fee_affiliate, 0) END) AS total_affiliate_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_ads, 0) ELSE COALESCE(o.fee_ads, 0) END) AS total_ads_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_piship, 0) ELSE COALESCE(o.fee_piship, 0) END) AS total_piship_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_piship, 0) ELSE 0 END) AS total_piship_fee_api,
        SUM(CASE WHEN f.order_id IS NULL THEN COALESCE(o.fee_piship, 0) ELSE 0 END) AS total_piship_fee_cost_setting,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_handling, 0) ELSE 0 END) AS total_handling_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.fee_shipping, 0) ELSE 0 END) AS total_shipping_fee,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.tax_vat, 0) ELSE 0 END) AS total_fee_tax_vat,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN COALESCE(f.tax_pit, 0) ELSE 0 END) AS total_fee_tax_pit,
        SUM(CASE WHEN f.order_id IS NOT NULL THEN
          COALESCE(NULLIF(f.total_fees, 0),
            COALESCE(f.fee_commission, 0) + COALESCE(f.fee_payment, 0) + COALESCE(f.fee_service, 0) +
            COALESCE(f.fee_affiliate, 0) + COALESCE(f.fee_ads, 0) + COALESCE(f.fee_piship, 0) +
            COALESCE(f.fee_handling, 0) + COALESCE(f.fee_shipping, 0) + COALESCE(f.tax_vat, 0) +
            COALESCE(f.tax_pit, 0)
          )
        ELSE 0 END) AS total_fee_from_details,
        SUM(CASE WHEN f.order_id IS NULL THEN COALESCE(o.fee, 0) ELSE 0 END) AS total_fee_without_detail
      FROM orders_v2 o
      LEFT JOIN (
        SELECT
          LOWER(COALESCE(platform, '')) AS platform_key,
          order_id,
          SUM(COALESCE(fee_commission, 0)) AS fee_commission,
          SUM(COALESCE(fee_payment, 0)) AS fee_payment,
          SUM(COALESCE(fee_service, 0)) AS fee_service,
          SUM(COALESCE(fee_affiliate, 0)) AS fee_affiliate,
          SUM(COALESCE(fee_ads, 0)) AS fee_ads,
          SUM(COALESCE(fee_piship, 0)) AS fee_piship,
          SUM(COALESCE(fee_handling, 0)) AS fee_handling,
          SUM(COALESCE(fee_shipping, 0)) AS fee_shipping,
          SUM(COALESCE(tax_vat, 0)) AS tax_vat,
          SUM(COALESCE(tax_pit, 0)) AS tax_pit,
          SUM(COALESCE(total_fees, 0)) AS total_fees
        FROM order_fee_details
        GROUP BY LOWER(COALESCE(platform, '')), order_id
      ) f ON f.platform_key = LOWER(COALESCE(o.platform, '')) AND f.order_id = o.order_id
      ${whereAlias}
    `).bind(...aliasParams).first() || {}
  } catch (err) {
    // Nếu bảng chi tiết phí chưa sẵn sàng, Dashboard vẫn dùng tổng phí trong orders_v2 để không làm sai lợi nhuận.
    console.warn('Không gom được order_fee_details cho Dashboard:', err?.message || err)
  }

  let adsSnapshotRow = {}
  try {
    const adsWhere = buildAdsSnapshotWhere(filters)
    adsSnapshotRow = await env.DB.prepare(`
      SELECT
        COUNT(*) AS ads_snapshot_rows,
        SUM(COALESCE(spend, 0)) AS total_ads_fee
      FROM marketplace_ads_campaign_snapshots
      ${adsWhere.where}
    `).bind(...adsWhere.params).first() || {}
  } catch (err) {
    // ADS là nguồn chi phí bổ sung; lỗi đọc snapshot không được làm hỏng Dashboard chính.
    console.warn('Không gom được ADS snapshot cho Dashboard:', err?.message || err)
  }

  const dashboardRow = { ...row }
  const feeBucketKeys = [
    'total_platform_fee',
    'total_payment_fee',
    'total_service_fee',
    'total_affiliate_fee',
    'total_ads_fee',
    'total_piship_fee',
    'total_piship_fee_api',
    'total_piship_fee_cost_setting',
    'total_handling_fee',
    'total_shipping_fee',
    'total_fee_tax_vat',
    'total_fee_tax_pit'
  ]
  feeBucketKeys.forEach(key => {
    dashboardRow[key] = moneyNumber(feeBucketRow[key] ?? dashboardRow[key])
  })
  dashboardRow.total_ads_fee = Math.max(moneyNumber(dashboardRow.total_ads_fee), moneyNumber(adsSnapshotRow.total_ads_fee))
  dashboardRow.total_ads_snapshot_rows = moneyNumber(adsSnapshotRow.ads_snapshot_rows)
  dashboardRow.total_fee_from_orders = moneyNumber(row?.total_fee)
  dashboardRow.total_fee_from_details = moneyNumber(feeBucketRow.total_fee_from_details)
  dashboardRow.total_fee_without_detail = moneyNumber(feeBucketRow.total_fee_without_detail)
  dashboardRow.total_fee_detail_orders = moneyNumber(feeBucketRow.fee_detail_orders)
  dashboardRow.total_fee_scope_orders = moneyNumber(feeBucketRow.fee_scope_orders)

const cancelRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END) AS cancel_orders,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END) AS return_orders,
      COUNT(DISTINCT order_id) AS total_all_orders,
      SUM(CASE WHEN order_type='return' THEN return_fee ELSE 0 END) AS total_return_fee,

      -- TikTok
      SUM(CASE WHEN platform='tiktok' AND (order_type='cancel' OR order_type='return') AND return_fee > 0 THEN return_fee ELSE 0 END) AS total_tiktok_cancel_fee,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='cancel' AND (return_fee > 0 OR cancel_reason LIKE '%thất bại%' OR cancel_reason LIKE '%không giao được%') THEN order_id END) AS tiktok_failed_delivery_count,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='return' THEN order_id END) AS tiktok_return_count,
      COUNT(DISTINCT CASE WHEN platform='tiktok' AND order_type='cancel' AND return_fee = 0 AND cancel_reason NOT LIKE '%thất bại%' AND cancel_reason NOT LIKE '%không giao được%' THEN order_id END) AS tiktok_free_cancel_count,
      SUM(CASE WHEN platform='tiktok' AND order_type='cancel' AND (return_fee > 0 OR cancel_reason LIKE '%thất bại%' OR cancel_reason LIKE '%không giao được%') THEN return_fee ELSE 0 END) AS tiktok_failed_delivery_fee,

      -- Shopee
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='cancel' THEN order_id END) AS shopee_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='cancel' AND return_fee > 0 THEN order_id END) AS shopee_failed_delivery_count,
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='cancel' AND return_fee = 0 THEN order_id END) AS shopee_free_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='shopee' AND order_type='return' THEN order_id END) AS shopee_return_count,
      SUM(CASE WHEN platform='shopee' AND (order_type='cancel' OR order_type='return') AND return_fee > 0 THEN return_fee ELSE 0 END) AS total_shopee_cancel_fee,
      SUM(CASE WHEN platform='shopee' AND order_type='cancel' AND return_fee > 0 THEN return_fee ELSE 0 END) AS shopee_failed_delivery_fee,
      SUM(CASE WHEN platform='shopee' AND order_type='return' THEN return_fee ELSE 0 END) AS shopee_return_fee,

      -- Lazada
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='cancel' THEN order_id END) AS lazada_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='cancel' AND return_fee > 0 THEN order_id END) AS lazada_failed_delivery_count,
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='cancel' AND return_fee = 0 THEN order_id END) AS lazada_free_cancel_count,
      COUNT(DISTINCT CASE WHEN platform='lazada' AND order_type='return' THEN order_id END) AS lazada_return_count,
      SUM(CASE WHEN platform='lazada' AND (order_type='cancel' OR order_type='return') AND return_fee > 0 THEN return_fee ELSE 0 END) AS total_lazada_cancel_fee,
      SUM(CASE WHEN platform='lazada' AND order_type='cancel' AND return_fee > 0 THEN return_fee ELSE 0 END) AS lazada_failed_delivery_fee,
      SUM(CASE WHEN platform='lazada' AND order_type='return' THEN return_fee ELSE 0 END) AS lazada_return_fee
    FROM orders_v2
    ${whereAllOrders}
  `).bind(...allOrderParams).first()

  const apiShopDiscountSql = `COALESCE(f.seller_discount, 0)`
  const apiSellerCofundSql = `COALESCE(f.voucher_from_seller, 0)`
  const apiPlatformFundedSql = `(COALESCE(f.voucher_from_shopee, 0) + COALESCE(f.shopee_discount, 0) + COALESCE(f.coins, 0))`
  const apiPlatformVoucherTotalSql = `(${apiSellerCofundSql} + ${apiPlatformFundedSql})`
  const shopDiscountSql = `(CASE WHEN f.voucher_from_seller IS NOT NULL OR f.seller_discount IS NOT NULL THEN ${apiShopDiscountSql} ELSE COALESCE(o.discount_shop, 0) END)`
  const sellerCofundSql = `(CASE WHEN f.voucher_from_seller IS NOT NULL THEN ${apiSellerCofundSql} ELSE 0 END)`
  const platformFundedSql = `(CASE WHEN f.voucher_from_shopee IS NOT NULL OR f.shopee_discount IS NOT NULL OR f.coins IS NOT NULL THEN ${apiPlatformFundedSql} ELSE COALESCE(o.discount_shopee, 0) END)`
  const platformDiscountSql = `(CASE WHEN f.voucher_from_seller IS NOT NULL OR f.voucher_from_shopee IS NOT NULL OR f.shopee_discount IS NOT NULL OR f.coins IS NOT NULL THEN ${apiPlatformVoucherTotalSql} ELSE COALESCE(o.discount_shopee, 0) END)`

  const breakdownRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN o.order_type='normal' THEN o.order_id END)  AS success_orders,
      COUNT(DISTINCT CASE WHEN o.order_type='cancel' THEN o.order_id END)  AS cancel_orders_count,
      COUNT(DISTINCT CASE WHEN o.order_type='return' THEN o.order_id END)  AS return_orders_count,
      SUM(CASE WHEN o.order_type='normal' THEN o.revenue    ELSE 0 END)    AS revenue_normal,
      SUM(CASE WHEN o.order_type='return' THEN o.raw_revenue ELSE 0 END)   AS revenue_returned,
      SUM(CASE WHEN o.order_type='return' THEN o.return_fee  ELSE 0 END)   AS total_return_shipping,

      -- Chỉ số giảm giá mới
      SUM(${shopDiscountSql})                                           AS total_discount_shop,
      SUM(${platformDiscountSql})                                       AS total_discount_shopee,
      SUM(${sellerCofundSql})                                           AS total_seller_cofunded_voucher,
      SUM(${platformFundedSql})                                         AS total_platform_funded_voucher,
      SUM(COALESCE(o.discount_combo, 0))                                AS total_discount_combo,
      SUM(COALESCE(o.shipping_return_fee, 0))                           AS total_shipping_return_fee,
      COUNT(DISTINCT CASE WHEN ${shopDiscountSql} > 0 THEN o.order_id END) AS orders_with_discount_shop,
      COUNT(DISTINCT CASE WHEN ${platformDiscountSql} > 0 THEN o.order_id END) AS orders_with_discount_shopee,
      COUNT(DISTINCT CASE WHEN COALESCE(o.discount_combo,0) > 0 THEN o.order_id END) AS orders_with_discount_combo
    FROM orders_v2 o
    LEFT JOIN (
      SELECT
        LOWER(COALESCE(platform, '')) AS platform_key,
        order_id,
        SUM(${feeRawNumberSql('$.order_income.voucher_from_seller', 'ofd')}) AS voucher_from_seller,
        SUM(${feeRawNumberSql('$.order_income.seller_discount', 'ofd')}) AS seller_discount,
        SUM(${feeRawNumberSql('$.order_income.voucher_from_shopee', 'ofd')}) AS voucher_from_shopee,
        SUM(${feeRawNumberSql('$.order_income.shopee_discount', 'ofd')}) AS shopee_discount,
        SUM(${feeRawNumberSql('$.order_income.coins', 'ofd')}) AS coins
      FROM order_fee_details ofd
      GROUP BY LOWER(COALESCE(platform, '')), order_id
    ) f ON f.platform_key = LOWER(COALESCE(o.platform, '')) AND f.order_id = o.order_id
    ${whereAliasAllOrders}
  `).bind(...aliasAllOrderParams).first()

  // Bổ sung query gom nhóm chi tiết theo từng shop để hiển thị tooltip.
  // Query này cần cả đơn hủy/hoàn để người dùng thấy đủ tổng đơn theo shop.
  const shopBreakdownRow = await env.DB.prepare(`
    SELECT
      shop,
      COUNT(DISTINCT CASE WHEN order_type='normal' THEN order_id END) AS shop_orders,
      COUNT(DISTINCT CASE WHEN order_type='normal' THEN order_id END) AS shop_success_orders,
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END) AS shop_cancel_orders,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END) AS shop_return_orders,
      COUNT(DISTINCT order_id) AS shop_total_orders,
      SUM(CASE WHEN order_type='normal' THEN revenue ELSE 0 END) AS shop_revenue
    FROM orders_v2
    ${whereAllOrders}
    GROUP BY shop
    ORDER BY shop_total_orders DESC, shop_revenue DESC
  `).bind(...allOrderParams).all()

  const statusRows = await env.DB.prepare(`
    SELECT o.order_id, o.platform, o.shop, o.order_type, o.revenue, o.raw_revenue, o.return_fee,
        cancel_reason, oms_status, shipping_status,
        '' AS logistics_status, '' AS delivery_status,
           discount_shop, discount_shopee, discount_combo, shipping_return_fee,
           COALESCE(r.ledger_kind, '') AS ledger_kind,
           COALESCE(r.return_status, '') AS return_status,
           COALESCE(r.return_status, '') AS ledger_status
    FROM orders_v2 o
    LEFT JOIN (
      SELECT LOWER(COALESCE(platform, '')) AS platform,
             order_id,
             GROUP_CONCAT(DISTINCT COALESCE(NULLIF(ledger_kind, ''), 'return')) AS ledger_kind,
             GROUP_CONCAT(DISTINCT COALESCE(NULLIF(reverse_status, ''), NULLIF(line_status, ''), normalized_status, '')) AS return_status
      FROM marketplace_return_reverse_ledger
      GROUP BY LOWER(COALESCE(platform, '')), order_id
    ) r ON r.platform = LOWER(COALESCE(o.platform, '')) AND r.order_id = o.order_id
    ${whereAliasAllOrders}
  `).bind(...aliasAllOrderParams).all()
  // Dashboard hủy/hoàn dùng core trạng thái chung thay vì chỉ nhìn order_type thô.
  // Nhờ vậy đơn API đã cập nhật CANCELLED/RETURN/FAILED_DELIVERY vẫn hiện đúng dù file import cũ chưa set order_type.
  const statusSummary = dashboardStatusAggregate(statusRows.results || [])
  const shopBreakdown = mergeShopBreakdownWithFinanceCore(statusSummary.shop_breakdown || [], orderFinanceCore)
  const dashboardFinanceRow = applyOrderFinanceCoreSummary(dashboardRow, orderFinanceCore)
  const financeDashboardRow = applyDashboardFinanceFeeCoreToRow(
    {
      ...dashboardFinanceRow,
      total_discount_shop: moneyNumber(breakdownRow?.total_discount_shop),
      total_discount_shopee: moneyNumber(breakdownRow?.total_discount_shopee),
      total_seller_cofunded_voucher: moneyNumber(breakdownRow?.total_seller_cofunded_voucher),
      total_platform_funded_voucher: moneyNumber(breakdownRow?.total_platform_funded_voucher),
      total_discount_combo: moneyNumber(breakdownRow?.total_discount_combo)
    },
    { feeBucketRow, breakdownRow, adsSnapshotRow }
  )
  const responseRow = {
    ...financeDashboardRow,
    ...cancelRow,
    ...breakdownRow,
    ...statusSummary,
    // Các field giảm giá phải ưu tiên raw_data đã chuẩn hóa, không để statusSummary từ orders_v2 ghi đè lại.
    total_discount_shop: moneyNumber(breakdownRow?.total_discount_shop),
    total_discount_shopee: moneyNumber(breakdownRow?.total_discount_shopee),
    total_seller_cofunded_voucher: moneyNumber(breakdownRow?.total_seller_cofunded_voucher),
    total_platform_funded_voucher: moneyNumber(breakdownRow?.total_platform_funded_voucher),
    total_discount_combo: moneyNumber(breakdownRow?.total_discount_combo),
    orders_with_discount_shop: moneyNumber(breakdownRow?.orders_with_discount_shop),
    orders_with_discount_shopee: moneyNumber(breakdownRow?.orders_with_discount_shopee),
    orders_with_discount_combo: moneyNumber(breakdownRow?.orders_with_discount_combo),
    total_import_revenue: moneyNumber(breakdownRow?.revenue_normal),
    total_finance_core_revenue: moneyNumber(orderFinanceCore?.summary?.gross_revenue),
    total_actual_income: moneyNumber(orderFinanceCore?.summary?.actual_income),
    shop_breakdown: shopBreakdown,
    finance_fee_core: financeDashboardRow.finance_fee_core,
    order_finance_core: orderFinanceCore ? {
      status: orderFinanceCore.status,
      mode: orderFinanceCore.mode,
      source: orderFinanceCore.source,
      summary: orderFinanceCore.summary || {},
      warning: orderFinanceCore.warning || '',
      error: orderFinanceCore.error || ''
    } : null
  }

  return Response.json(responseRow, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// REVENUE BY DAY
// ════════════════════════════════════════════════════════════════════
async function revenueByDay(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const financeCore = await loadFreshOrderFinanceCore(env, filters)
  const rows = (financeCore.by_day || []).map(row => ({
    d: row.bucket,
    platform: row.platform || '',
    shop: row.shop || '',
    revenue: moneyNumber(row.gross_revenue),
    actual_income: moneyNumber(row.actual_income),
    orders: moneyNumber(row.orders),
    finance_core_source: 'order_finance_core',
    source: 'order_analytics'
  })).sort((a, b) => String(a.d).localeCompare(String(b.d)))

  return Response.json(rows, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// PROFIT BY DAY
async function profitByDay(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const financeCore = await loadFreshOrderFinanceCore(env, filters)
  const rows = (financeCore.by_day || [])
    .map(mapFinanceCoreDay)
    .sort((a, b) => String(a.d).localeCompare(String(b.d)))

  return Response.json(rows, { headers: cors })
}

export { dashboard, revenueByDay, profitByDay, mergeShopBreakdownWithFinanceCore }
