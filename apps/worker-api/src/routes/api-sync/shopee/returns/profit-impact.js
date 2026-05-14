export function installApiSyncShopeeReturnsProfitImpact(core) {
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const ensureReturnReverseLedgerTable = core.ensureReturnReverseLedgerTable
  const roundAds = (...args) => core.roundAds(...args)

  async function fetchShopeeReturnProfitImpact(env, options = {}) {
    await ensureReturnReverseLedgerTable(env)
    const from = cleanYmd(options.from || options.date_from || options.dateFrom)
    const to = cleanYmd(options.to || options.date_to || options.dateTo)
    const shop = cleanText(options.shop)
    const limit = Math.min(Math.max(Number(options.limit || 100) || 100, 1), 500)
    const orderConds = ["LOWER(COALESCE(o.platform, '')) = 'shopee'"]
    const params = []
    if (from) { orderConds.push('date(o.order_date) >= ?'); params.push(from) }
    if (to) { orderConds.push('date(o.order_date) <= ?'); params.push(to) }
    if (shop) { orderConds.push('o.shop = ?'); params.push(shop) }
    const where = orderConds.join(' AND ')

    const summary = await env.DB.prepare(`
      WITH closed_returns AS (
        SELECT order_id,
               SUM(COALESCE(effective_refund_amount, 0)) AS refund_amount,
               COUNT(*) AS return_count
        FROM marketplace_return_reverse_ledger
        WHERE LOWER(COALESCE(platform, '')) = 'shopee'
          AND is_finance_closed = 1
        GROUP BY order_id
      )
      SELECT
        COUNT(DISTINCT o.order_id) AS orders,
        COUNT(DISTINCT CASE WHEN r.order_id IS NOT NULL THEN o.order_id END) AS returned_orders,
        SUM(COALESCE(o.revenue, 0)) AS gross_revenue,
        SUM(COALESCE(r.refund_amount, 0)) AS refund_amount,
        SUM(COALESCE(o.profit_real, 0)) AS profit_real_before_returns,
        SUM(COALESCE(o.profit_real, 0) - COALESCE(r.refund_amount, 0)) AS net_profit_real,
        SUM(COALESCE(o.fee_ads, 0)) AS ads_spend_from_orders
      FROM orders_v2 o
      LEFT JOIN closed_returns r ON r.order_id = o.order_id
      WHERE ${where}
    `).bind(...params).first()

    const detailRows = await env.DB.prepare(`
      WITH closed_returns AS (
        SELECT order_id,
               SUM(COALESCE(effective_refund_amount, 0)) AS refund_amount,
               COUNT(*) AS return_count,
               GROUP_CONCAT(DISTINCT COALESCE(NULLIF(reason_text, ''), NULLIF(reason_code, ''), 'unknown')) AS return_reasons,
               MAX(COALESCE(updated_at_bangkok, created_at_bangkok, synced_at)) AS last_return_update_at
        FROM marketplace_return_reverse_ledger
        WHERE LOWER(COALESCE(platform, '')) = 'shopee'
          AND is_finance_closed = 1
        GROUP BY order_id
      )
      SELECT
        o.order_id AS order_sn,
        o.shop,
        o.order_date,
        o.revenue AS gross_revenue,
        o.fee_platform,
        o.fee_service,
        o.fee_payment,
        o.fee_ads,
        o.cost_real,
        o.cost_invoice,
        o.profit_real AS profit_real_before_returns,
        COALESCE(r.refund_amount, 0) AS refund_amount,
        COALESCE(o.profit_real, 0) - COALESCE(r.refund_amount, 0) AS net_profit_real,
        COALESCE(r.return_count, 0) AS return_count,
        COALESCE(r.return_reasons, '') AS return_reasons,
        COALESCE(r.last_return_update_at, '') AS last_return_update_at
      FROM orders_v2 o
      JOIN closed_returns r ON r.order_id = o.order_id
      WHERE ${where}
      ORDER BY r.last_return_update_at DESC, o.order_date DESC
      LIMIT ${limit}
    `).bind(...params).all()

    const skuRows = await env.DB.prepare(`
      WITH closed_returns AS (
        SELECT order_id,
               SUM(COALESCE(effective_refund_amount, 0)) AS refund_amount,
               GROUP_CONCAT(DISTINCT COALESCE(NULLIF(reason_text, ''), NULLIF(reason_code, ''), 'unknown')) AS return_reasons
        FROM marketplace_return_reverse_ledger
        WHERE LOWER(COALESCE(platform, '')) = 'shopee'
          AND is_finance_closed = 1
        GROUP BY order_id
      )
      SELECT
        COALESCE(NULLIF(oi.sku, ''), 'NO_SKU') AS sku,
        MAX(COALESCE(NULLIF(oi.product_name, ''), '')) AS product_name,
        COUNT(DISTINCT o.order_id) AS order_count,
        COUNT(DISTINCT CASE WHEN r.order_id IS NOT NULL THEN o.order_id END) AS return_orders,
        SUM(CASE
          WHEN r.order_id IS NULL THEN 0
          WHEN COALESCE(o.revenue, 0) > 0 THEN COALESCE(r.refund_amount, 0) * COALESCE(oi.revenue_line, 0) / o.revenue
          ELSE COALESCE(r.refund_amount, 0)
        END) AS allocated_refund_amount,
        GROUP_CONCAT(DISTINCT r.return_reasons) AS return_reasons
      FROM order_items oi
      JOIN orders_v2 o ON o.order_id = oi.order_id
      LEFT JOIN closed_returns r ON r.order_id = o.order_id
      WHERE ${where}
      GROUP BY COALESCE(NULLIF(oi.sku, ''), 'NO_SKU')
      HAVING return_orders > 0
      ORDER BY return_orders DESC, allocated_refund_amount DESC
      LIMIT ${limit}
    `).bind(...params).all()

    const skuImpact = (skuRows.results || []).map(row => {
      const orderCount = Number(row.order_count || 0)
      const returnOrders = Number(row.return_orders || 0)
      const returnRate = orderCount > 0 ? returnOrders / orderCount * 100 : 0
      return {
        ...row,
        allocated_refund_amount: roundAds(row.allocated_refund_amount),
        return_rate: roundAds(returnRate),
        ads_action: returnRate > 5 ? 'review_or_pause_ads' : 'monitor'
      }
    })

    return {
      status: 'ok',
      mode: 'shopee_returns_profit_impact',
      source: 'marketplace_return_reverse_ledger đã đóng joined với orders_v2/order_items',
      filters: { from, to, shop },
      summary: {
        orders: Number(summary?.orders || 0),
        returned_orders: Number(summary?.returned_orders || 0),
        return_rate: summary?.orders ? roundAds(Number(summary.returned_orders || 0) / Number(summary.orders || 1) * 100) : 0,
        gross_revenue: roundAds(summary?.gross_revenue),
        refund_amount: roundAds(summary?.refund_amount),
        profit_real_before_returns: roundAds(summary?.profit_real_before_returns),
        net_profit_real: roundAds(summary?.net_profit_real),
        ads_spend_from_orders: roundAds(summary?.ads_spend_from_orders)
      },
      orders: detailRows.results || [],
      sku_impact: skuImpact
    }
  }
  core.fetchShopeeReturnProfitImpact = fetchShopeeReturnProfitImpact
}
