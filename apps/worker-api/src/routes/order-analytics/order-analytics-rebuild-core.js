import { fetchShopeeEscrowDetail, fetchShopeeIncomeDetail, syncLazadaFinanceTransactions } from '../api-sync.js'
import { buildReturnInfo, chooseActualIncome, computeOrderRevenueBasis, extractShopeeFinanceInfo, isAdsCpoEligibleOrder } from '../../core/order-analytics-finance-core.js'
import { buildZeroRevenueReturnFinance } from '../../core/order-return-inference-core.js'
import { loadReturnReverseOrderMap } from '../../core/return-reverse-core.js'
import { rebuildOrderFinanceDailySnapshots } from '../../core/order-finance-core.js'
import { buildOrderWhere, cleanText, ensureOrderAnalyticsTable, ensureSourceTables, ESTIMATE_SOURCE, ESCROW_SOURCE, INFERRED_RETURN_SOURCE, LAZADA_FINANCE_SOURCE, PAYMENT_SOURCE, mapKey, normalizeSku, num, round2, tableExists } from '../../core/order-analytics-shared-core.js'

async function loadShopeeOrdersForEscrowSync(env, options = {}) {
  const filter = buildOrderWhere({ ...options, platform: 'shopee' }, 'o')
  const limit = Math.min(Math.max(Number(options.escrow_limit || options.limit || 120) || 120, 1), 300)
  const rows = await env.DB.prepare(`
    SELECT COALESCE(o.shop, '') AS shop, o.order_id
    FROM orders_v2 o
    ${filter.where}
    ORDER BY date(o.order_date) DESC, o.order_id DESC
    LIMIT ?
  `).bind(...filter.params, limit).all()
  return rows.results || []
}

async function syncShopeeEscrowFeeDetails(env, options = {}) {
  const rows = await loadShopeeOrdersForEscrowSync(env, options)
  const grouped = new Map()
  for (const row of rows) {
    const shop = cleanText(row.shop)
    const orderId = cleanText(row.order_id)
    if (!shop || !orderId) continue
    if (!grouped.has(shop)) grouped.set(shop, [])
    grouped.get(shop).push(orderId)
  }
  let batches = 0
  let savedFeeDetails = 0
  let totalRows = 0
  const warnings = []
  for (const [shop, orderIds] of grouped.entries()) {
    for (let i = 0; i < orderIds.length; i += 50) {
      const chunk = orderIds.slice(i, i + 50)
      const result = await fetchShopeeEscrowDetail(env, {
        shop,
        order_sn_list: chunk.join(','),
        save_details: true
      })
      batches += 1
      totalRows += Number(result.total_rows || 0)
      savedFeeDetails += Number(result.saved_fee_details || 0)
      if (result.status !== 'ok') {
        warnings.push(result.message || result.error || `escrow_sync_failed:${shop}`)
      }
    }
  }
  return {
    requested_orders: rows.length,
    shop_count: grouped.size,
    batches,
    total_rows: totalRows,
    saved_fee_details: savedFeeDetails,
    warnings
  }
}

export async function syncOrderAnalyticsIncome(env, options = {}) {
  await ensureOrderAnalyticsTable(env)
  const statuses = (options.income_statuses?.length ? options.income_statuses : ['1', '2'])
    .filter(status => ['0', '1', '2'].includes(String(status)))
  const shopFilters = options.shops?.length ? options.shops : [options.shop || '']
  const shopeeResults = []
  let shopeeEscrowResult = null
  let lazadaResult = null
  let saved = 0
  const warnings = []
  const platform = cleanText(options.platform).toLowerCase()
  const shouldSyncShopee = !platform || platform === 'shopee'
  const shouldSyncLazada = !platform || platform === 'lazada'

  if (shouldSyncShopee) {
    for (const incomeStatus of statuses) {
      for (const shopFilter of shopFilters) {
        const result = await fetchShopeeIncomeDetail(env, {
          shop: shopFilter,
          shopLimit: options.shopLimit || 100,
          income_status: incomeStatus,
          date_from: options.from,
          date_to: options.to,
          page_size: options.page_size || 30
        })
        shopeeResults.push(result)
        const details = result.details || []
        if (details.length >= (options.page_size || 30)) {
          warnings.push(`Income status ${incomeStatus}${shopFilter ? ` shop ${shopFilter}` : ''} co the con trang tiep theo; can sync tiep cursor neu muon day du hon.`)
        }
        for (let i = 0; i < details.length; i += 40) {
          const chunk = details.slice(i, i + 40).filter(row => cleanText(row.order_sn))
          if (!chunk.length) continue
          await env.DB.batch(chunk.map(row => env.DB.prepare(`
            INSERT INTO order_analytics (
              order_sn, platform, shop, actual_income, actual_income_source,
              income_status, income_synced_at, source_json, computed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), ?, datetime('now', '+7 hours'))
            ON CONFLICT(order_sn) DO UPDATE SET
              platform = CASE WHEN excluded.platform != '' THEN excluded.platform ELSE order_analytics.platform END,
              shop = CASE WHEN excluded.shop != '' THEN excluded.shop ELSE order_analytics.shop END,
              actual_income = excluded.actual_income,
              actual_income_source = excluded.actual_income_source,
              income_status = excluded.income_status,
              income_synced_at = excluded.income_synced_at,
              source_json = excluded.source_json,
              computed_at = excluded.computed_at
          `).bind(
            cleanText(row.order_sn),
            'shopee',
            cleanText(row.shop),
            round2(row.amount),
            PAYMENT_SOURCE,
            cleanText(row.income_status),
            JSON.stringify({ payment_detail: row }).slice(0, 12000)
          )))
          saved += chunk.length
        }
      }
    }
    shopeeEscrowResult = await syncShopeeEscrowFeeDetails(env, options)
    saved += Number(shopeeEscrowResult.saved_fee_details || 0)
    warnings.push(...(shopeeEscrowResult.warnings || []))
  }

  if (shouldSyncLazada) {
    // Lazada Finance không ghi trực tiếp order_analytics tại đây; adapter lưu vào order_fee_details,
    // sau đó rebuild sẽ lấy settlement thật để giữ một core tài chính dùng chung cho mọi màn hình.
    lazadaResult = await syncLazadaFinanceTransactions(env, {
      shop: options.shop,
      shopLimit: options.shopLimit || options.shop_limit || 100,
      date_from: options.from,
      date_to: options.to,
      page_size: options.page_size || 100,
      max_pages: options.max_pages || options.maxPages || 1
    })
    saved += Number(lazadaResult.saved_fee_details || 0)
    warnings.push(...(lazadaResult.warnings || []).map(item => item.message || item.error || String(item)))
  }

  return {
    status: 'ok',
    mode: 'sync_marketplace_finance_to_order_analytics',
    endpoint: {
      shopee: shouldSyncShopee ? '/api/v2/payment/get_income_detail' : '',
      lazada: shouldSyncLazada ? '/finance/transaction/detail/get' : ''
    },
    saved,
    total_rows: shopeeResults.reduce((sum, item) => sum + Number(item.total_rows || 0), 0) + Number(lazadaResult?.fetched_transactions || 0),
    statuses,
    warnings,
    shopee: {
      shop_count: shopeeResults.reduce((sum, item) => sum + Number(item.shop_count || 0), 0),
      ok_count: shopeeResults.reduce((sum, item) => sum + Number(item.ok_count || 0), 0),
      total_rows: shopeeResults.reduce((sum, item) => sum + Number(item.total_rows || 0), 0),
      results: shopeeResults,
      escrow_sync: shopeeEscrowResult
    },
    lazada: lazadaResult
  }
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function collectItemIdsFromAdRaw(raw) {
  const ids = new Set()
  const add = value => {
    const text = cleanText(value)
    if (/^\d+$/.test(text)) ids.add(text)
  }
  const scan = value => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(scan)
      return
    }
    if (Array.isArray(value.item_id_list)) value.item_id_list.forEach(add)
    if (Array.isArray(value.item_ids)) value.item_ids.forEach(add)
    if (value.item_id) add(value.item_id)
    if (value.itemId) add(value.itemId)
    for (const key of ['setting_summary', 'raw_setting', 'common_info', 'auto_product_ads_info', 'raw_metric']) {
      if (value[key]) scan(value[key])
    }
  }
  scan(raw)
  return [...ids]
}

async function loadItemSkuMap(env) {
  const map = new Map()
  if (!await tableExists(env, 'product_variations')) return map
  const rows = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, platform_sku, internal_sku
    FROM product_variations
    WHERE COALESCE(platform_item_id, '') != ''
  `).all()
  for (const row of rows.results || []) {
    const sku = normalizeSku(row.internal_sku || row.platform_sku)
    if (!sku) continue
    map.set(mapKey(row.platform, row.shop, row.platform_item_id), sku)
  }
  return map
}

function resolveAdsSku(row, itemSkuMap) {
  const direct = normalizeSku(row.product_sku)
  if (direct) return direct
  const itemIds = collectItemIdsFromAdRaw(parseJsonSafe(row.raw_data))
  if (itemIds.length !== 1) return ''
  return itemSkuMap.get(mapKey(row.platform, row.shop, itemIds[0])) || ''
}

async function loadOrdersForAnalytics(env, options) {
  const filter = buildOrderWhere(options, 'o')
  const orders = await env.DB.prepare(`
    SELECT
      o.order_id,
      LOWER(COALESCE(o.platform, '')) AS platform,
      COALESCE(o.shop, '') AS shop,
      COALESCE(o.order_type, '') AS order_type,
      substr(COALESCE(o.order_date, ''), 1, 10) AS order_date,
      CAST(strftime('%H', COALESCE(NULLIF(o.order_date, ''), o.created_at)) AS INTEGER) AS order_hour,
      COALESCE(o.customer_name, '') AS customer_name,
      COALESCE(o.oms_status, '') AS oms_status,
      COALESCE(o.shipping_status, '') AS shipping_status,
      COALESCE(o.revenue, 0) AS revenue,
      COALESCE(o.raw_revenue, 0) AS raw_revenue,
      COALESCE(o.cost_real, 0) AS cost_real,
      COALESCE(o.cost_invoice, 0) AS cost_invoice,
      COALESCE(o.fee, 0) AS fee,
      COALESCE(o.fee_platform, 0) AS fee_platform,
      COALESCE(o.fee_payment, 0) AS fee_payment,
      COALESCE(o.fee_affiliate, 0) AS fee_affiliate,
      COALESCE(o.fee_piship, 0) AS fee_piship,
      COALESCE(o.fee_service, 0) AS fee_service,
      COALESCE(o.fee_packaging, 0) AS fee_packaging,
      COALESCE(o.fee_operation, 0) AS fee_operation,
      COALESCE(o.fee_labor, 0) AS fee_labor,
      COALESCE(f.total_fees, 0) AS real_total_fees,
      COALESCE(f.settlement, 0) AS settlement,
      COALESCE(f.source, '') AS fee_source,
      COALESCE(f.raw_data, '') AS fee_raw_data,
      CASE WHEN f.order_id IS NOT NULL THEN 1 ELSE 0 END AS has_fee_detail,
      COALESCE(a.actual_income, 0) AS existing_actual_income,
      COALESCE(a.actual_income_source, '') AS existing_actual_income_source,
      COALESCE(a.income_status, '') AS income_status,
      COALESCE(a.income_synced_at, '') AS income_synced_at
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN order_analytics a ON a.order_sn = o.order_id
    ${filter.where}
    ORDER BY date(o.order_date) DESC, o.order_id DESC
    LIMIT 3000
  `).bind(...filter.params).all()
  return orders.results || []
}

async function loadOrderItems(env, options) {
  const filter = buildOrderWhere(options, 'o')
  const rows = await env.DB.prepare(`
    SELECT
      oi.order_id,
      COALESCE(oi.sku, '') AS sku,
      COALESCE(oi.product_name, '') AS product_name,
      COALESCE(oi.qty, 0) AS qty,
      COALESCE(oi.revenue_line, 0) AS revenue_line,
      COALESCE(oi.cost_real, 0) AS cost_real,
      COALESCE(oi.cost_invoice, 0) AS cost_invoice,
      LOWER(COALESCE(o.platform, '')) AS platform,
      COALESCE(o.shop, '') AS shop,
      substr(COALESCE(o.order_date, ''), 1, 10) AS order_date,
      CAST(strftime('%H', COALESCE(NULLIF(o.order_date, ''), o.created_at)) AS INTEGER) AS order_hour
    FROM order_items oi
    JOIN orders_v2 o ON o.order_id = oi.order_id
    ${filter.where}
  `).bind(...filter.params).all()
  return rows.results || []
}

async function loadReturns(env) {
  return loadReturnReverseOrderMap(env)
}

async function loadAdsSpend(env, options, itemSkuMap) {
  const conds = [`snapshot_date BETWEEN ? AND ?`, `COALESCE(spend, 0) > 0`]
  const params = [options.from, options.to]
  if (options.platform) { conds.push(`platform = ?`); params.push(options.platform) }
  const shops = options.shops?.length ? options.shops : (options.shop ? [options.shop] : [])
  if (shops.length) {
    conds.push(`shop IN (${shops.map(() => '?').join(',')})`)
    params.push(...shops)
  }

  const dailyRows = await env.DB.prepare(`
    SELECT platform, shop, snapshot_date, product_sku, product_name, campaign_id, campaign_name, campaign_type,
           spend, raw_data
    FROM marketplace_ads_campaign_snapshots
    WHERE ${conds.join(' AND ')}
  `).bind(...params).all()

  const hourlyRows = await env.DB.prepare(`
    SELECT platform, shop, snapshot_date, hour, SUM(COALESCE(spend, 0)) AS spend
    FROM marketplace_ads_hourly_snapshots
    WHERE ${conds.join(' AND ')}
    GROUP BY platform, shop, snapshot_date, hour
  `).bind(...params).all()

  const productSpend = new Map()
  const shopDailySpend = new Map()
  const shopHourlySpend = new Map()
  const productDays = new Set()
  let realDailySnapshots = 0
  let realHourlySnapshots = 0

  for (const row of dailyRows.results || []) {
    const spend = num(row.spend)
    if (spend <= 0) continue
    realDailySnapshots++
    const sku = resolveAdsSku(row, itemSkuMap)
    const dayKey = mapKey(row.platform, row.shop, row.snapshot_date)
    if (sku) {
      const key = mapKey(row.platform, row.shop, row.snapshot_date, sku)
      productSpend.set(key, round2((productSpend.get(key) || 0) + spend))
      productDays.add(dayKey)
    } else {
      shopDailySpend.set(dayKey, round2((shopDailySpend.get(dayKey) || 0) + spend))
    }
  }

  for (const row of hourlyRows.results || []) {
    const spend = num(row.spend)
    if (spend <= 0) continue
    realHourlySnapshots++
    const key = mapKey(row.platform, row.shop, row.snapshot_date, String(Number(row.hour || 0)))
    shopHourlySpend.set(key, round2((shopHourlySpend.get(key) || 0) + spend))
  }

  return { productSpend, shopDailySpend, shopHourlySpend, productDays, realDailySnapshots, realHourlySnapshots }
}

function allocateAdsForOrder(order, items, maps) {
  if (!maps.eligibleOrders.has(cleanText(order.order_id))) {
    return {
      amount: 0,
      method: 'ads_cpo_reallocated_order_not_successful',
      basis: 'excluded_cancel_return_or_failed',
      denominator: 0,
      totalSpend: 0,
      components: []
    }
  }
  const dayKey = mapKey(order.platform, order.shop, order.order_date)
  let amount = 0
  let method = ''
  let basis = ''
  let denominator = 0
  let totalSpend = 0
  const components = []
  if (maps.ads.productDays.has(dayKey)) {
    const orderSkus = [...new Set(items.map(item => normalizeSku(item.sku)).filter(Boolean))]
    for (const sku of orderSkus) {
      if (!sku) continue
      const key = mapKey(order.platform, order.shop, order.order_date, sku)
      const totalOrders = maps.skuOrderCount.get(key) || 0
      const spend = maps.ads.productSpend.get(key) || 0
      if (spend > 0 && totalOrders > 0) {
        const cpo = spend / totalOrders
        amount += cpo
        totalSpend += spend
        denominator += totalOrders
        components.push({ sku, spend: round2(spend), orders: totalOrders, cpo: round2(cpo) })
      }
    }
    method = amount > 0 ? 'ads_api_product_sku_daily' : 'ads_api_product_day_no_matching_sku'
    basis = amount > 0 ? 'sku_daily_orders' : 'product_day_no_matching_sku'
  } else {
    const hourKey = mapKey(order.platform, order.shop, order.order_date, String(Number(order.order_hour || 0)))
    const hourSpend = maps.ads.shopHourlySpend.get(hourKey) || 0
    const hourOrders = maps.shopHourOrders.get(hourKey) || 0
    if (hourSpend > 0 && hourOrders > 0) {
      amount = hourSpend / hourOrders
      method = 'ads_api_shop_hourly'
      basis = 'shop_hour_orders'
      denominator = hourOrders
      totalSpend = hourSpend
    } else {
      const dailySpend = maps.ads.shopDailySpend.get(dayKey) || 0
      const dailyOrders = maps.shopDayOrders.get(dayKey) || 0
      if (dailySpend > 0 && dailyOrders > 0) {
        amount = dailySpend / dailyOrders
        method = 'ads_api_shop_daily'
        basis = 'shop_day_orders'
        denominator = dailyOrders
        totalSpend = dailySpend
      }
    }
  }
  return {
    amount: round2(amount),
    method,
    basis: basis || 'no_real_ads_spend_for_order',
    denominator,
    totalSpend: round2(totalSpend),
    components
  }
}

export async function rebuildOrderAnalytics(env, options = {}) {
  await ensureSourceTables(env)
  const warnings = []
  let paymentSync = null
  if (options.sync_payment) {
    paymentSync = await syncOrderAnalyticsIncome(env, options)
    warnings.push(...(paymentSync.warnings || []))
  }

  const orders = await loadOrdersForAnalytics(env, options)
  const items = await loadOrderItems(env, options)
  const returnsMap = await loadReturns(env)
  const itemSkuMap = await loadItemSkuMap(env)
  const ads = await loadAdsSpend(env, options, itemSkuMap)

  const byOrder = new Map()
  const skuOrderCount = new Map()
  const shopDayOrders = new Map()
  const shopHourOrders = new Map()
  const eligibleOrders = new Set()
  const financeInfoMap = new Map()
  const returnInfoMap = new Map()

  for (const item of items) {
    const id = cleanText(item.order_id)
    if (!byOrder.has(id)) byOrder.set(id, [])
    byOrder.get(id).push(item)
  }

  for (const order of orders) {
    const orderId = cleanText(order.order_id)
    const orderItems = byOrder.get(orderId) || []
    const inferredReturn = buildZeroRevenueReturnFinance(order, orderItems)
    const financeInfo = { ...extractShopeeFinanceInfo(order), inferredReturn }
    const revenueBasis = computeOrderRevenueBasis(order, orderItems, financeInfo)
    const returnRow = returnsMap.get(`${cleanText(order.platform).toLowerCase()}|${orderId}`) || {}
    const returnInfo = buildReturnInfo(order, returnRow, financeInfo, revenueBasis)
    financeInfoMap.set(orderId, { ...financeInfo, revenueBasis })
    returnInfoMap.set(orderId, returnInfo)
    if (!isAdsCpoEligibleOrder(order, returnInfo)) continue
    eligibleOrders.add(orderId)
    const dayKey = mapKey(order.platform, order.shop, order.order_date)
    const hourKey = mapKey(order.platform, order.shop, order.order_date, String(Number(order.order_hour || 0)))
    shopDayOrders.set(dayKey, (shopDayOrders.get(dayKey) || 0) + 1)
    shopHourOrders.set(hourKey, (shopHourOrders.get(hourKey) || 0) + 1)
    const orderSkus = [...new Set(orderItems.map(item => normalizeSku(item.sku)).filter(Boolean))]
    for (const sku of orderSkus) {
      const key = mapKey(order.platform, order.shop, order.order_date, sku)
      skuOrderCount.set(key, (skuOrderCount.get(key) || 0) + 1)
    }
  }

  const maps = { ads, skuOrderCount, shopDayOrders, shopHourOrders, eligibleOrders }
  const rows = []
  for (const order of orders) {
    const orderId = cleanText(order.order_id)
    const orderItems = byOrder.get(orderId) || []
    const financeInfo = financeInfoMap.get(orderId) || {}
    const revenueBasis = round2(num(financeInfo.revenueBasis) || computeOrderRevenueBasis(order, orderItems, financeInfo))
    const actual = chooseActualIncome(order, revenueBasis, orderItems)
    const returnInfo = returnInfoMap.get(orderId) || buildReturnInfo(order)
    // NEO: Đơn hoàn/trả toàn phần không còn doanh thu giữ lại nên không phân bổ thêm CPO ADS vào lãi ròng.
    const adsCost = returnInfo.isFullReturnRefund
      ? { amount: 0, method: 'return_refund_no_ads_allocation', basis: 'full_return_refund', denominator: 0, totalSpend: 0, components: [] }
      : allocateAdsForOrder(order, orderItems, maps)
    const rawCostOfGoods = round2(num(order.cost_real) || orderItems.reduce((sum, item) => sum + num(item.cost_real), 0))
    const costOfGoods = returnInfo.isFullReturnRefund ? 0 : rawCostOfGoods
    const refund = round2(returnInfo.refundAmount)
    const refundInNet = returnInfo.financeAlreadyNetOfRefund ? 0 : refund
    const netProfit = round2(actual.amount - costOfGoods - adsCost.amount - refundInNet)
    const marginPct = actual.amount > 0 ? round2(netProfit / actual.amount * 100) : 0
    const warningParts = []
    if (netProfit < 0) warningParts.push('loss')
    if (actual.source === ESTIMATE_SOURCE) warningParts.push('payment_api_missing')
    if (actual.source === INFERRED_RETURN_SOURCE) warningParts.push('zero_revenue_return_inferred')
    if (refund > 0) warningParts.push('return_closed')
    if (returnInfo.refundFromFinance > 0) warningParts.push('finance_return_refund')
    if (returnInfo.isFullReturnRefund) warningParts.push('cogs_released_return_refund')
    rows.push({
      order_sn: orderId,
      platform: cleanText(order.platform),
      shop: cleanText(order.shop),
      order_date: cleanText(order.order_date),
      order_hour: Number(order.order_hour || 0),
      customer_name: cleanText(order.customer_name),
      oms_status: cleanText(order.oms_status),
      shipping_status: cleanText(order.shipping_status),
      revenue: revenueBasis,
      actual_income: round2(actual.amount),
      actual_income_source: actual.source,
      income_status: cleanText(order.income_status),
      income_synced_at: cleanText(order.income_synced_at),
      platform_fees: round2(actual.platformFees),
      cost_of_goods: costOfGoods,
      ads_cost_allocated: adsCost.amount,
      ads_cpo: adsCost.amount,
      ads_cpo_basis: adsCost.basis || '',
      ads_cpo_denominator: Number(adsCost.denominator || 0),
      ads_cpo_total_spend: round2(adsCost.totalSpend || 0),
      ads_allocation_method: adsCost.method || 'no_real_ads_spend_for_order',
      refund_deduction: refund,
      refund_reason: cleanText(returnInfo.refundReason),
      return_status: cleanText(returnInfo.returnStatus),
      net_profit: netProfit,
      margin_pct: marginPct,
      sku_count: new Set(orderItems.map(item => normalizeSku(item.sku)).filter(Boolean)).size || orderItems.length,
      qty_total: round2(orderItems.reduce((sum, item) => sum + num(item.qty), 0)),
      warning: warningParts.join(','),
      source_json: JSON.stringify({
        actual_income_source: actual.source,
        revenue_basis: revenueBasis,
        finance_refund_amount: round2(returnInfo.refundFromFinance || 0),
        refund_in_net: refundInNet,
        payment_api_already_net_of_refund: Boolean(returnInfo.financeAlreadyNetOfRefund),
        ads_source: 'marketplace_ads_campaign_snapshots/marketplace_ads_hourly_snapshots',
        ads_allocation_method: adsCost.method || 'none',
        ads_cpo_basis: adsCost.basis || 'none',
        ads_cpo_denominator: Number(adsCost.denominator || 0),
        ads_cpo_total_spend: round2(adsCost.totalSpend || 0),
        ads_cpo_components: adsCost.components || [],
        returns_source: returnInfo.refundFromLedger > 0 && returnInfo.refundFromFinance > 0
          ? 'marketplace_return_reverse_ledger + shopee_payment_escrow'
          : returnInfo.refundFromLedger > 0
            ? 'marketplace_return_reverse_ledger closed'
            : returnInfo.refundFromFinance > 0
              ? 'shopee_payment_escrow_detail'
              : returnInfo.inferredReturn
                ? 'orders_v2_zero_revenue_return_fee'
              : 'none',
        items: orderItems.slice(0, 20).map(item => ({
          sku: item.sku,
          product_name: item.product_name,
          qty: item.qty,
          revenue_line: item.revenue_line,
          cost_real: item.cost_real
        }))
      }).slice(0, 12000)
    })
  }

  let saved = 0
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40)
    await env.DB.batch(chunk.map(row => env.DB.prepare(`
      INSERT INTO order_analytics (
        order_sn, platform, shop, order_date, order_hour, customer_name,
        oms_status, shipping_status, revenue, actual_income, actual_income_source,
        income_status, income_synced_at, platform_fees, cost_of_goods,
        ads_cost_allocated, ads_cpo, ads_cpo_basis, ads_cpo_denominator,
        ads_cpo_total_spend, ads_allocation_method, refund_deduction,
        refund_reason, return_status, net_profit, margin_pct, sku_count,
        qty_total, warning, source_json, computed_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
      ON CONFLICT(order_sn) DO UPDATE SET
        platform = excluded.platform,
        shop = excluded.shop,
        order_date = excluded.order_date,
        order_hour = excluded.order_hour,
        customer_name = excluded.customer_name,
        oms_status = excluded.oms_status,
        shipping_status = excluded.shipping_status,
        revenue = excluded.revenue,
        actual_income = excluded.actual_income,
        actual_income_source = excluded.actual_income_source,
        income_status = excluded.income_status,
        income_synced_at = excluded.income_synced_at,
        platform_fees = excluded.platform_fees,
        cost_of_goods = excluded.cost_of_goods,
        ads_cost_allocated = excluded.ads_cost_allocated,
        ads_cpo = excluded.ads_cpo,
        ads_cpo_basis = excluded.ads_cpo_basis,
        ads_cpo_denominator = excluded.ads_cpo_denominator,
        ads_cpo_total_spend = excluded.ads_cpo_total_spend,
        ads_allocation_method = excluded.ads_allocation_method,
        refund_deduction = excluded.refund_deduction,
        refund_reason = excluded.refund_reason,
        return_status = excluded.return_status,
        net_profit = excluded.net_profit,
        margin_pct = excluded.margin_pct,
        sku_count = excluded.sku_count,
        qty_total = excluded.qty_total,
        warning = excluded.warning,
        source_json = excluded.source_json,
        computed_at = excluded.computed_at
    `).bind(
      row.order_sn, row.platform, row.shop, row.order_date, row.order_hour,
      row.customer_name, row.oms_status, row.shipping_status, row.revenue,
      row.actual_income, row.actual_income_source, row.income_status,
      row.income_synced_at, row.platform_fees, row.cost_of_goods,
      row.ads_cost_allocated, row.ads_cpo, row.ads_cpo_basis, row.ads_cpo_denominator,
      row.ads_cpo_total_spend, row.ads_allocation_method, row.refund_deduction,
      row.refund_reason, row.return_status, row.net_profit, row.margin_pct,
      row.sku_count, row.qty_total, row.warning, row.source_json
    )))
    saved += chunk.length
  }

  let financeSnapshot = null
  try {
    financeSnapshot = await rebuildOrderFinanceDailySnapshots(env, options)
  } catch (error) {
    warnings.push(`order_finance_daily_snapshot_failed: ${error.message}`)
  }

  return {
    status: 'ok',
    mode: 'rebuild_order_analytics',
    from: options.from,
    to: options.to,
    orders: rows.length,
    saved,
    payment_sync: paymentSync ? {
      saved: paymentSync.saved,
      total_rows: paymentSync.total_rows,
      statuses: paymentSync.statuses
    } : null,
    finance_snapshot: financeSnapshot,
    real_ads_snapshots: {
      daily: ads.realDailySnapshots,
      hourly: ads.realHourlySnapshots,
      product_sku_days: ads.productDays.size
    },
    warnings
  }
}
