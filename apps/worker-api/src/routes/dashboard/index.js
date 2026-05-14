// ════════════════════════════════════════════════════════════════════
// DASHBOARD — Tổng quan (đếm unique order_id)
// ════════════════════════════════════════════════════════════════════

import { getFilters, buildWhere } from '../../utils/filters.js'
import { ensureReturnReverseLedgerTable } from '../../core/return-reverse-core.js'
import { moneyNumber, dashboardStatusAggregate } from '../../core/dashboard-summary-core.js'

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

async function dashboard(request, env, cors) {
  await ensureReturnReverseLedgerTable(env)
  const filters = getFilters(new URL(request.url))
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

  const breakdownRow = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN order_type='normal' THEN order_id END)  AS success_orders,
      COUNT(DISTINCT CASE WHEN order_type='cancel' THEN order_id END)  AS cancel_orders_count,
      COUNT(DISTINCT CASE WHEN order_type='return' THEN order_id END)  AS return_orders_count,
      SUM(CASE WHEN order_type='normal' THEN revenue    ELSE 0 END)    AS revenue_normal,
      SUM(CASE WHEN order_type='return' THEN raw_revenue ELSE 0 END)   AS revenue_returned,
      SUM(CASE WHEN order_type='return' THEN return_fee  ELSE 0 END)   AS total_return_shipping,

      -- Chỉ số giảm giá mới
      SUM(COALESCE(discount_shop, 0))                                   AS total_discount_shop,
      SUM(COALESCE(discount_shopee, 0))                                 AS total_discount_shopee,
      SUM(COALESCE(discount_combo, 0))                                  AS total_discount_combo,
      SUM(COALESCE(shipping_return_fee, 0))                             AS total_shipping_return_fee,
      COUNT(DISTINCT CASE WHEN COALESCE(discount_shop,0) > 0 THEN order_id END)   AS orders_with_discount_shop,
      COUNT(DISTINCT CASE WHEN COALESCE(discount_shopee,0) > 0 THEN order_id END) AS orders_with_discount_shopee,
      COUNT(DISTINCT CASE WHEN COALESCE(discount_combo,0) > 0 THEN order_id END)  AS orders_with_discount_combo
    FROM orders_v2
    ${whereAllOrders}
  `).bind(...allOrderParams).first()

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

  return Response.json({ ...dashboardRow, ...cancelRow, ...breakdownRow, ...statusSummary }, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// REVENUE BY DAY
// ════════════════════════════════════════════════════════════════════
async function revenueByDay(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters)

  const rows = await env.DB.prepare(`
    SELECT
      date(order_date) AS d,
      SUM(revenue)     AS revenue,
      COUNT(DISTINCT order_id) AS orders
    FROM orders_v2
    ${where}
    GROUP BY d
    ORDER BY d
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// PROFIT BY DAY
async function profitByDay(request, env, cors) {
  await ensureReturnReverseLedgerTable(env)
  const filters = getFilters(new URL(request.url))
  const { where, params } = buildWhere(filters, 'o.')

  const rows = await env.DB.prepare(`
    SELECT
      date(o.order_date)     AS d,
      COUNT(DISTINCT o.order_id) AS orders,
      SUM(o.revenue)         AS revenue,
      SUM(o.cost_invoice)    AS cost_invoice,
      SUM(o.cost_real)       AS cost_real,
      SUM(o.fee)             AS fee,
      SUM(o.profit_invoice - COALESCE(r.refund_amount, 0)) AS profit_invoice,
      SUM(o.profit_real - COALESCE(r.refund_amount, 0))    AS profit_real,
      SUM(COALESCE(r.refund_amount, 0)) AS return_refund,
      SUM(o.tax_flat)        AS tax_flat,
      SUM(o.tax_income)      AS tax_income
    FROM orders_v2 o
    LEFT JOIN (
      SELECT LOWER(COALESCE(platform, '')) AS platform,
             order_id,
             SUM(COALESCE(effective_refund_amount, 0)) AS refund_amount
      FROM marketplace_return_reverse_ledger
      WHERE is_finance_closed = 1
      GROUP BY LOWER(COALESCE(platform, '')), order_id
    ) r ON r.platform = LOWER(COALESCE(o.platform, '')) AND r.order_id = o.order_id
    ${where}
    GROUP BY d
    ORDER BY d
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}

export { dashboard, revenueByDay, profitByDay }
