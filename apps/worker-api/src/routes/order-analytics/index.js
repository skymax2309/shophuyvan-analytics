import { loadOrderFinanceCore } from '../../core/order-finance-core.js'
import { buildAnalyticsWhere, cleanDate, cleanText, defaultRange, ensureSourceTables, ESCROW_SOURCE, ESTIMATE_SOURCE, LAZADA_FINANCE_SOURCE, PAYMENT_SOURCE, splitList } from '../../core/order-analytics-shared-core.js'
import { rebuildOrderAnalytics, syncOrderAnalyticsIncome } from './order-analytics-rebuild-core.js'

export { rebuildOrderAnalytics, syncOrderAnalyticsIncome } from './order-analytics-rebuild-core.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

async function readBody(request) {
  if (request.method !== 'POST') return {}
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function parseOptions(url, body = {}) {
  const defaults = defaultRange(Number(body.days || url.searchParams.get('days') || 1))
  const shops = [
    ...url.searchParams.getAll('shop'),
    ...splitList(body.shop || body.shops)
  ].map(cleanText).filter(Boolean)
  return {
    from: cleanDate(body.from || body.date_from || url.searchParams.get('from') || url.searchParams.get('date_from')) || defaults.from,
    to: cleanDate(body.to || body.date_to || url.searchParams.get('to') || url.searchParams.get('date_to')) || defaults.to,
    platform: cleanText(body.platform || url.searchParams.get('platform')).toLowerCase(),
    shops: [...new Set(shops)],
    shop: cleanText(body.shop || url.searchParams.get('shop')),
    limit: Math.min(Math.max(Number(body.limit || url.searchParams.get('limit') || 100) || 100, 1), 500),
    rebuild: ['1', 'true', 'yes'].includes(cleanText(body.rebuild ?? url.searchParams.get('rebuild')).toLowerCase()),
    sync_payment: ['1', 'true', 'yes'].includes(cleanText(body.sync_payment ?? body.syncPayment ?? url.searchParams.get('sync_payment') ?? url.searchParams.get('syncPayment')).toLowerCase()),
    income_statuses: splitList(body.income_statuses || body.incomeStatuses || body.income_status || url.searchParams.get('income_statuses') || url.searchParams.get('income_status') || '1,2'),
    page_size: Math.min(Math.max(Number(body.page_size || body.pageSize || url.searchParams.get('page_size') || 30) || 30, 1), 100),
    shopLimit: Math.min(Math.max(Number(body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit') || 100) || 100, 1), 200)
  }
}

async function loadRows(env, options) {
  const filter = buildAnalyticsWhere(options, 'oa')
  const rows = await env.DB.prepare(`
    SELECT *
    FROM order_analytics oa
    ${filter.where}
    ORDER BY date(oa.order_date) DESC, oa.net_profit ASC, oa.order_sn DESC
    LIMIT ?
  `).bind(...filter.params, options.limit).all()
  return rows.results || []
}

async function loadSummary(env, options) {
  const filter = buildAnalyticsWhere(options, 'oa')
  const row = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(COALESCE(revenue, 0)) AS revenue,
      SUM(COALESCE(actual_income, 0)) AS actual_income,
      SUM(COALESCE(platform_fees, 0)) AS platform_fees,
      SUM(COALESCE(cost_of_goods, 0)) AS cost_of_goods,
      SUM(COALESCE(ads_cost_allocated, 0)) AS ads_cost_allocated,
      AVG(CASE WHEN COALESCE(ads_cost_allocated, 0) > 0 THEN COALESCE(ads_cpo, ads_cost_allocated) END) AS avg_cpo,
      MAX(COALESCE(ads_cpo, 0)) AS max_cpo,
      SUM(COALESCE(refund_deduction, 0)) AS refund_deduction,
      SUM(COALESCE(net_profit, 0)) AS net_profit,
      COUNT(CASE WHEN net_profit < 0 THEN 1 END) AS loss_orders,
      COUNT(CASE WHEN actual_income_source IN (?, ?) THEN 1 END) AS payment_api_orders,
      COUNT(CASE WHEN actual_income_source = ? THEN 1 END) AS shopee_payment_orders,
      COUNT(CASE WHEN actual_income_source = ? THEN 1 END) AS lazada_finance_orders,
      COUNT(CASE WHEN actual_income_source = ? THEN 1 END) AS escrow_orders,
      COUNT(CASE WHEN COALESCE(ads_cost_allocated, 0) > 0 THEN 1 END) AS ads_allocated_orders,
      COUNT(CASE WHEN COALESCE(refund_deduction, 0) > 0 THEN 1 END) AS returned_orders
    FROM order_analytics oa
    ${filter.where}
  `).bind(PAYMENT_SOURCE, LAZADA_FINANCE_SOURCE, PAYMENT_SOURCE, LAZADA_FINANCE_SOURCE, ESCROW_SOURCE, ...filter.params).first()
  return row || {}
}

async function loadShopSummary(env, options) {
  const filter = buildAnalyticsWhere(options, 'oa')
  const rows = await env.DB.prepare(`
    SELECT platform, shop,
           COUNT(*) AS orders,
           SUM(COALESCE(actual_income, 0)) AS actual_income,
           SUM(COALESCE(ads_cost_allocated, 0)) AS ads_cost,
           AVG(CASE WHEN COALESCE(ads_cost_allocated, 0) > 0 THEN COALESCE(ads_cpo, ads_cost_allocated) END) AS avg_cpo,
           SUM(COALESCE(refund_deduction, 0)) AS refund,
           SUM(COALESCE(net_profit, 0)) AS net_profit,
           COUNT(CASE WHEN net_profit < 0 THEN 1 END) AS loss_orders
    FROM order_analytics oa
    ${filter.where}
    GROUP BY platform, shop
    ORDER BY net_profit ASC
    LIMIT 50
  `).bind(...filter.params).all()
  return rows.results || []
}

async function loadTopSkus(env, options) {
  const filter = buildAnalyticsWhere(options, 'oa')
  const rows = await env.DB.prepare(`
    WITH item_counts AS (
      SELECT order_id, COUNT(*) AS item_count
      FROM order_items
      GROUP BY order_id
    )
    SELECT
      COALESCE(NULLIF(oi.sku, ''), '(no sku)') AS sku,
      MAX(COALESCE(oi.product_name, '')) AS product_name,
      MAX(COALESCE(NULLIF(oi.image_url, ''), '')) AS image_url,
      SUM(COALESCE(oi.qty, 0)) AS qty,
      COUNT(DISTINCT oa.order_sn) AS orders,
      SUM(COALESCE(oi.revenue_line, 0)) AS revenue,
      SUM(COALESCE(oi.cost_real, 0)) AS cost_real,
      CASE
        WHEN SUM(COALESCE(oi.qty, 0)) > 0 THEN SUM(COALESCE(oi.cost_real, 0)) / SUM(COALESCE(oi.qty, 0))
        ELSE 0
      END AS avg_cost,
      SUM(COALESCE(oa.ads_cost_allocated, 0) *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS ads_cost,
      SUM(COALESCE(oa.refund_deduction, 0) *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS refund,
      SUM(COALESCE(oa.net_profit, 0) *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS net_profit,
      COUNT(DISTINCT CASE WHEN COALESCE(oa.net_profit, 0) < 0 THEN oa.order_sn END) AS loss_orders,
      SUM(CASE WHEN COALESCE(oa.net_profit, 0) < 0 THEN COALESCE(oa.net_profit, 0) ELSE 0 END *
        CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
      ) AS loss_amount,
      COUNT(DISTINCT CASE WHEN oa.oms_status = 'COMPLETED' THEN oa.order_sn END) AS completed_orders,
      COUNT(DISTINCT CASE WHEN COALESCE(oa.ads_cost_allocated, 0) > 0 THEN oa.order_sn END) AS ads_orders,
      CASE
        WHEN COUNT(DISTINCT oa.order_sn) > 0 THEN
          SUM(COALESCE(oa.ads_cost_allocated, 0) *
            CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
          ) / COUNT(DISTINCT oa.order_sn)
        ELSE 0
      END AS cpo,
      CASE
        WHEN SUM(COALESCE(oa.net_profit, 0) *
          CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
        ) < 0 THEN 'loss_pause_ads_review'
        WHEN SUM(COALESCE(oa.ads_cost_allocated, 0) *
          CASE WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue ELSE 1.0 / NULLIF(ic.item_count, 0) END
        ) > 0 THEN 'ads_running_watch_cpo'
        ELSE 'no_real_ads_spend'
      END AS ads_status
    FROM order_analytics oa
    JOIN order_items oi ON oi.order_id = oa.order_sn
    LEFT JOIN item_counts ic ON ic.order_id = oa.order_sn
    ${filter.where}
    GROUP BY COALESCE(NULLIF(oi.sku, ''), '(no sku)')
    ORDER BY net_profit ASC
    LIMIT 30
  `).bind(...filter.params).all()
  return rows.results || []
}

async function loadLossOrderItems(env, options) {
  const filter = buildAnalyticsWhere(options, 'oa')
  const limit = Math.min(Math.max(Number(options.limit || 120) || 120, 1), 200)
  // Tách chi tiết đơn âm tiền theo dòng hàng để người vận hành nhìn được SKU, giá vốn, CPO và hoàn tiền gây âm.
  const rows = await env.DB.prepare(`
    WITH item_counts AS (
      SELECT order_id, COUNT(*) AS item_count
      FROM order_items
      GROUP BY order_id
    ),
    loss_items AS (
      SELECT
        oa.order_sn,
        oa.platform,
        oa.shop,
        oa.order_date,
        oa.actual_income,
        oa.actual_income_source,
        oa.platform_fees,
        oa.cost_of_goods,
        oa.ads_cost_allocated,
        oa.ads_cpo,
        oa.ads_allocation_method,
        oa.ads_cpo_basis,
        oa.refund_deduction,
        oa.net_profit,
        oa.margin_pct,
        oa.oms_status,
        oa.shipping_status,
        oa.warning,
        COALESCE(NULLIF(oi.sku, ''), '(chưa có SKU)') AS sku,
        COALESCE(NULLIF(oi.product_name, ''), '(chưa có tên sản phẩm)') AS product_name,
        COALESCE(oi.image_url, '') AS image_url,
        COALESCE(oi.qty, 0) AS qty,
        COALESCE(oi.revenue_line, 0) AS revenue_line,
        COALESCE(oi.cost_real, 0) AS cost_real,
        CASE
          WHEN COALESCE(oa.revenue, 0) > 0 THEN COALESCE(oi.revenue_line, 0) / oa.revenue
          ELSE COALESCE(1.0 / NULLIF(ic.item_count, 0), 1)
        END AS item_ratio
      FROM order_analytics oa
      LEFT JOIN order_items oi ON oi.order_id = oa.order_sn
      LEFT JOIN item_counts ic ON ic.order_id = oa.order_sn
      ${filter.where}
        AND COALESCE(oa.net_profit, 0) < 0
    )
    SELECT
      *,
      COALESCE(ads_cost_allocated, 0) * item_ratio AS item_ads_cost,
      COALESCE(refund_deduction, 0) * item_ratio AS item_refund,
      COALESCE(net_profit, 0) * item_ratio AS item_net_profit
    FROM loss_items
    ORDER BY COALESCE(net_profit, 0) ASC, date(order_date) DESC, COALESCE(revenue_line, 0) DESC
    LIMIT ?
  `).bind(...filter.params, limit).all()
  return rows.results || []
}

export async function loadOrderAnalytics(env, options = {}) {
  await ensureSourceTables(env)
  let rebuild = null
  if (options.rebuild || options.sync_payment) {
    rebuild = await rebuildOrderAnalytics(env, options)
  }
  let rows = await loadRows(env, options)
  if (!rows.length && !rebuild) {
    rebuild = await rebuildOrderAnalytics(env, options)
    rows = await loadRows(env, options)
  }
  const [summary, shop_summary, top_skus, loss_order_items, finance_core] = await Promise.all([
    loadSummary(env, options),
    loadShopSummary(env, options),
    loadTopSkus(env, options),
    loadLossOrderItems(env, options),
    loadOrderFinanceCore(env, options)
  ])
  return {
    status: 'ok',
    mode: 'order_analytics',
    from: options.from,
    to: options.to,
    summary,
    rows,
    shop_summary,
    top_skus,
    loss_order_items,
    finance_core,
    rebuild,
    source: {
      payment_actual: 'Shopee /api/v2/payment/get_income_detail và Lazada /finance/transaction/detail/get -> order_analytics.actual_income',
      payment_escrow: 'order_fee_details.settlement từ Shopee Escrow hoặc Lazada Finance khi dòng payment chi tiết chưa ghi trực tiếp vào order_analytics',
      estimate: 'orders_v2 fee estimate without fee_ads only when Payment API row is missing',
      ads: 'CPO = real Ads API spend / eligible SKU or shop orders. Source: marketplace_ads_campaign_snapshots/marketplace_ads_hourly_snapshots only; no cost setting and no orders_v2.fee_ads',
      returns: 'Ledger hoàn/trả đã đóng từ Shopee Returns API và Lazada Reverse API',
      cogs: 'orders_v2/order_items cost_real from internal product cost'
    }
  }
}

export async function handleOrderAnalytics(request, env, cors) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
  const url = new URL(request.url)
  const body = await readBody(request)
  const options = parseOptions(url, body)

  if (url.pathname === '/api/order-analytics/payment-sync') {
    const result = await syncOrderAnalyticsIncome(env, options)
    return json(result, cors)
  }

  if (url.pathname === '/api/order-analytics/rebuild') {
    const result = await rebuildOrderAnalytics(env, { ...options, rebuild: true })
    return json(result, cors)
  }

  if (url.pathname === '/api/order-analytics/finance-core') {
    await ensureSourceTables(env)
    const result = await loadOrderFinanceCore(env, options)
    return json(result, cors)
  }

  if (url.pathname === '/api/order-analytics' || url.pathname.startsWith('/api/order-analytics/')) {
    const result = await loadOrderAnalytics(env, options)
    return json(result, cors)
  }

  return json({ error: 'Not found' }, cors, 404)
}
