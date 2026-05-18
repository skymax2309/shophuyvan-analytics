import { fetchShopeeIncomeDetail } from '../api/index.js'

const topPicksAnalysisDeps = {
  ensureShopeeTopPicksTables: null,
  syncShopeeTopPicks: null
}

export function configureTopPicksAnalysisDeps(deps = {}) {
  topPicksAnalysisDeps.ensureShopeeTopPicksTables = deps.ensureShopeeTopPicksTables || topPicksAnalysisDeps.ensureShopeeTopPicksTables
  topPicksAnalysisDeps.syncShopeeTopPicks = deps.syncShopeeTopPicks || topPicksAnalysisDeps.syncShopeeTopPicks
}

async function ensureTopPicksTables(env) {
  if (typeof topPicksAnalysisDeps.ensureShopeeTopPicksTables !== 'function') {
    throw new Error('TopPicks analysis missing table initializer')
  }
  return topPicksAnalysisDeps.ensureShopeeTopPicksTables(env)
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function compactJson(value, limit = 30000) {
  const text = JSON.stringify(value ?? {})
  return text.length > limit ? text.slice(0, limit) : text
}

function num(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function round2(value) {
  return Math.round(num(value) * 100) / 100
}

function dateYmd(date) {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().slice(0, 10)
}

function parseYmd(value, fallback = '') {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function defaultRange(days = 7) {
  const end = new Date()
  const start = new Date(end.getTime() - Math.max(days - 1, 0) * 86400000)
  const from = dateYmd(start)
  const to = dateYmd(end)
  return { from, to, start: from, end: to }
}

function lower(value) {
  return cleanText(value).toLowerCase()
}

function sameShopFilterSql(shop, alias = 'shop') {
  const clean = cleanText(shop)
  if (!clean) return { sql: '', params: [] }
  return { sql: ' AND LOWER(' + alias + ') = LOWER(?)', params: [clean] }
}

async function loadTrackingRows(env) {
  await ensureTopPicksTables(env)
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, top_picks_id, tracking_code, voucher_code, note
    FROM marketplace_top_picks_tracking_tags
  `).all()
  const map = new Map()
  for (const row of results || []) {
    map.set(`${row.platform}|${row.shop}|${row.top_picks_id}`, row)
  }
  return map
}

function parseIdListJson(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.map(cleanText).filter(Boolean) : []
  } catch {
    return []
  }
}

async function loadTopPickCollectionsForAnalysis(env, options = {}) {
  await ensureTopPicksTables(env)
  const { from, to } = options
  const shopFilter = sameShopFilterSql(options.shop, 'shop')
  const snapshotRows = await env.DB.prepare(`
    SELECT platform, shop, api_shop_id, snapshot_date, top_picks_id, name, is_activated,
           item_count, item_ids_json, raw_data
    FROM marketplace_top_picks_snapshots
    WHERE platform = 'shopee'
      AND is_activated = 1
      AND snapshot_date BETWEEN ? AND ?
      ${shopFilter.sql}
    ORDER BY snapshot_date DESC, shop, name
  `).bind(from, to, ...shopFilter.params).all()

  const rows = snapshotRows.results || []
  if (rows.length) return rows.map(row => ({ ...row, item_ids: parseIdListJson(row.item_ids_json), source: 'snapshot' }))

  const currentRows = await env.DB.prepare(`
    SELECT platform, shop, api_shop_id, date('now', '+7 hours') AS snapshot_date,
           top_picks_id, name, is_activated, item_count, item_ids_json, raw_data
    FROM marketplace_top_picks_collections
    WHERE platform = 'shopee'
      AND is_activated = 1
      AND is_current = 1
      ${shopFilter.sql}
    ORDER BY shop, name
  `).bind(...shopFilter.params).all()
  return (currentRows.results || []).map(row => ({ ...row, item_ids: parseIdListJson(row.item_ids_json), source: 'current' }))
}

async function loadItemMaps(env) {
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, platform_sku, internal_sku, product_name
    FROM product_variations
    WHERE platform = 'shopee'
      AND COALESCE(platform_item_id, '') != ''
  `).all()
  const byItemId = new Map()
  const bySku = new Map()
  const byName = new Map()
  for (const row of results || []) {
    const itemId = cleanText(row.platform_item_id)
    const shop = cleanText(row.shop)
    if (itemId) byItemId.set(`${shop}|${itemId}`, row)
    for (const sku of [row.platform_sku, row.internal_sku].map(cleanText).filter(Boolean)) {
      bySku.set(`${shop}|${lower(sku)}`, row)
      bySku.set(lower(sku), row)
    }
    const name = lower(row.product_name)
    if (name) byName.set(`${shop}|${name}`, row)
  }
  return { byItemId, bySku, byName }
}

function safeJson(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function collectItemIds(value, out = new Set(), depth = 0) {
  if (!value || depth > 5) return out
  if (Array.isArray(value)) {
    for (const item of value) collectItemIds(item, out, depth + 1)
    return out
  }
  if (typeof value !== 'object') return out
  for (const [key, raw] of Object.entries(value)) {
    const k = key.toLowerCase()
    if ((k === 'item_id' || k === 'itemid' || k === 'product_id') && raw !== undefined) {
      const id = cleanText(raw)
      if (/^\d+$/.test(id)) out.add(id)
    } else if (k === 'item_id_list' && Array.isArray(raw)) {
      raw.map(cleanText).filter(Boolean).forEach(id => out.add(id))
    } else if (raw && typeof raw === 'object') {
      collectItemIds(raw, out, depth + 1)
    }
  }
  return out
}

function extractAdHourlyEntries(row) {
  const raw = safeJson(row.raw_data)
  const hourly = Array.isArray(raw.raw_hourly) ? raw.raw_hourly : []
  if (hourly.length) {
    return hourly.map(item => ({
      snapshot_date: cleanText(row.snapshot_date),
      hour: Math.max(0, Math.min(23, Math.round(num(item.hour)))),
      spend: round2(item.spend),
      revenue: round2(item.revenue),
      orders: Math.round(num(item.orders)),
      impressions: Math.round(num(item.impressions)),
      clicks: Math.round(num(item.clicks))
    }))
  }
  return [{
    snapshot_date: cleanText(row.snapshot_date),
    hour: -1,
    spend: round2(row.spend),
    revenue: round2(row.revenue),
    orders: Math.round(num(row.orders)),
    impressions: Math.round(num(row.impressions)),
    clicks: Math.round(num(row.clicks))
  }]
}

async function loadAdsCampaignRows(env, options = {}, itemMaps) {
  const shopFilter = sameShopFilterSql(options.shop, 'shop')
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, campaign_id, campaign_name, campaign_type, product_sku,
           product_name, spend, revenue, orders, impressions, clicks, snapshot_date, raw_data
    FROM marketplace_ads_campaign_snapshots
    WHERE platform = 'shopee'
      AND snapshot_date BETWEEN ? AND ?
      AND (COALESCE(spend, 0) > 0 OR COALESCE(clicks, 0) > 0)
      ${shopFilter.sql}
    ORDER BY snapshot_date DESC, spend DESC
    LIMIT ?
  `).bind(options.from, options.to, ...shopFilter.params, Math.min(Math.max(Number(options.limit || 300) || 300, 1), 1000)).all()

  return (results || []).map(row => {
    const raw = safeJson(row.raw_data)
    const itemIds = [...collectItemIds(raw)]
    const shop = cleanText(row.shop)
    const sku = cleanText(row.product_sku)
    const mapped = itemIds.map(itemId => itemMaps.byItemId.get(`${shop}|${itemId}`)).find(Boolean)
      || itemMaps.bySku.get(`${shop}|${lower(sku)}`)
      || itemMaps.bySku.get(lower(sku))
      || itemMaps.byName.get(`${shop}|${lower(row.product_name)}`)
    return {
      ...row,
      item_ids: itemIds,
      primary_sku: cleanText(mapped?.internal_sku || sku || mapped?.platform_sku),
      primary_platform_sku: cleanText(mapped?.platform_sku || sku),
      primary_product_name: cleanText(mapped?.product_name || row.product_name || row.campaign_name),
      hourly: extractAdHourlyEntries(row)
    }
  })
}

async function loadOrdersForAnalysis(env, options = {}, itemMaps) {
  const shopFilter = sameShopFilterSql(options.shop, 'o.shop')
  const { results } = await env.DB.prepare(`
    SELECT o.order_id, o.shop, o.order_date, o.revenue AS order_revenue,
           substr(o.order_date, 1, 10) AS order_day,
           CAST(substr(o.order_date, 12, 2) AS INTEGER) AS order_hour,
           oi.sku, oi.product_name, oi.qty, oi.revenue_line
    FROM orders_v2 o
    JOIN order_items oi ON oi.order_id = o.order_id
    WHERE o.platform = 'shopee'
      AND substr(o.order_date, 1, 10) BETWEEN ? AND ?
      ${shopFilter.sql}
  `).bind(options.from, options.to, ...shopFilter.params).all()

  const orders = new Map()
  for (const row of results || []) {
    const shop = cleanText(row.shop)
    const sku = cleanText(row.sku)
    const mapped = itemMaps.bySku.get(`${shop}|${lower(sku)}`)
      || itemMaps.bySku.get(lower(sku))
      || itemMaps.byName.get(`${shop}|${lower(row.product_name)}`)
    const item = {
      sku,
      product_name: cleanText(row.product_name),
      platform_item_id: cleanText(mapped?.platform_item_id),
      revenue_line: round2(row.revenue_line),
      qty: Number(row.qty || 0) || 0
    }
    const key = cleanText(row.order_id)
    if (!orders.has(key)) {
      orders.set(key, {
        order_id: key,
        shop,
        order_day: cleanText(row.order_day),
        order_hour: Number(row.order_hour || 0) || 0,
        order_revenue: round2(row.order_revenue),
        items: []
      })
    }
    orders.get(key).items.push(item)
  }
  return [...orders.values()]
}

function itemMatchesPrimary(item, ad) {
  const itemIdSet = new Set((ad.item_ids || []).map(cleanText).filter(Boolean))
  if (item.platform_item_id && itemIdSet.has(item.platform_item_id)) return true
  if (ad.primary_sku && lower(item.sku) === lower(ad.primary_sku)) return true
  if (ad.primary_platform_sku && lower(item.sku) === lower(ad.primary_platform_sku)) return true
  if (ad.primary_product_name && lower(item.product_name) === lower(ad.primary_product_name)) return true
  return false
}

function itemMatchesTopPick(item, collection, ad) {
  const topIds = new Set((collection.item_ids || []).map(cleanText).filter(Boolean))
  const adIds = new Set((ad.item_ids || []).map(cleanText).filter(Boolean))
  if (item.platform_item_id && topIds.has(item.platform_item_id) && !adIds.has(item.platform_item_id)) return true
  return false
}

function collectionContainsAd(collection, ad) {
  const topIds = new Set((collection.item_ids || []).map(cleanText).filter(Boolean))
  const adIds = (ad.item_ids || []).map(cleanText).filter(Boolean)
  return adIds.some(id => topIds.has(id))
}

function recommendationFor(rate, clicks, primaryOrders) {
  if (primaryOrders <= 0 && clicks > 0) return 'check_listing_or_tracking'
  if (rate >= 15) return 'keep_or_raise_ads_bid'
  if (rate >= 5) return 'monitor_and_ab_test'
  return 'replace_top_picks_items'
}

async function loadPaymentOrderSet(env, options = {}) {
  if (String(options.include_payment_detail ?? options.includePaymentDetail ?? '1') === '0') {
    return { orders: new Set(), rows: 0, status: 'skipped', warnings: [] }
  }
  const warnings = []
  const orders = new Set()
  for (const incomeStatus of ['1', '2']) {
    try {
      const result = await fetchShopeeIncomeDetail(env, {
        shop: options.shop,
        shopLimit: options.shopLimit || options.shop_limit || 50,
        income_status: incomeStatus,
        date_from: options.from,
        date_to: options.to,
        page_size: 100
      })
      for (const row of result.details || []) {
        const orderSn = cleanText(row.order_sn)
        if (orderSn) orders.add(orderSn)
      }
    } catch (error) {
      warnings.push({ stage: 'payment.get_income_detail', income_status: incomeStatus, message: error?.message || String(error) })
    }
  }
  return { orders, rows: orders.size, status: warnings.length ? 'partial' : 'ok', warnings }
}

export async function analyzeShopeeTopPicksAttachRate(env, options = {}) {
  const defaults = defaultRange(options.days || 7)
  const from = parseYmd(options.from || options.from_date, defaults.from)
  const to = parseYmd(options.to || options.to_date, defaults.to)
  await ensureTopPicksTables(env)

  if (String(options.sync ?? options.sync_first ?? options.syncFirst ?? '0') === '1') {
    if (typeof topPicksAnalysisDeps.syncShopeeTopPicks !== 'function') {
      throw new Error('TopPicks analysis missing sync handler')
    }
    await topPicksAnalysisDeps.syncShopeeTopPicks(env, {
      shop: options.shop,
      shopLimit: options.shopLimit || options.shop_limit || 50,
      snapshot_date: to
    })
  }

  const itemMaps = await loadItemMaps(env)
  const [collections, adsRows, orders, tracking, payment] = await Promise.all([
    loadTopPickCollectionsForAnalysis(env, { ...options, from, to }),
    loadAdsCampaignRows(env, { ...options, from, to }, itemMaps),
    loadOrdersForAnalysis(env, { ...options, from, to }, itemMaps),
    loadTrackingRows(env),
    loadPaymentOrderSet(env, { ...options, from, to })
  ])

  const ordersByShopDayHour = new Map()
  const ordersByShopDay = new Map()
  for (const order of orders) {
    const hourKey = `${order.shop}|${order.order_day}|${order.order_hour}`
    const dayKey = `${order.shop}|${order.order_day}`
    if (!ordersByShopDayHour.has(hourKey)) ordersByShopDayHour.set(hourKey, [])
    if (!ordersByShopDay.has(dayKey)) ordersByShopDay.set(dayKey, [])
    ordersByShopDayHour.get(hourKey).push(order)
    ordersByShopDay.get(dayKey).push(order)
  }

  const rows = []
  for (const ad of adsRows) {
    const matchedCollections = collections.filter(collection =>
      collection.shop === ad.shop && collectionContainsAd(collection, ad)
    )
    if (!matchedCollections.length) continue
    for (const collection of matchedCollections) {
      for (const hour of ad.hourly || []) {
        const orderBucket = hour.hour >= 0
          ? ordersByShopDayHour.get(`${ad.shop}|${hour.snapshot_date}|${hour.hour}`) || []
          : ordersByShopDay.get(`${ad.shop}|${hour.snapshot_date}`) || []
        const primaryOrders = []
        const attachOrders = []
        const attachSkuRevenue = new Map()
        for (const order of orderBucket) {
          const hasPrimary = order.items.some(item => itemMatchesPrimary(item, ad))
          if (!hasPrimary) continue
          primaryOrders.push(order)
          const attached = order.items.filter(item => itemMatchesTopPick(item, collection, ad))
          if (!attached.length) continue
          attachOrders.push(order)
          for (const item of attached) {
            const key = item.sku || item.platform_item_id || item.product_name
            const current = attachSkuRevenue.get(key) || { sku: key, product_name: item.product_name, qty: 0, revenue: 0 }
            current.qty += item.qty
            current.revenue += item.revenue_line
            attachSkuRevenue.set(key, current)
          }
        }
        const denominator = new Set(primaryOrders.map(order => order.order_id)).size
        const numerator = new Set(attachOrders.map(order => order.order_id)).size
        const attachRate = denominator ? round2(numerator / denominator * 100) : 0
        const trackingRow = tracking.get(`shopee|${collection.shop}|${collection.top_picks_id}`) || {}
        const paymentConfirmed = primaryOrders.filter(order => payment.orders.has(order.order_id)).length
        rows.push({
          date: hour.snapshot_date,
          hour: hour.hour,
          hour_label: hour.hour >= 0 ? hourLabel(hour.hour) : 'ca_ngay',
          shop: ad.shop,
          ads_campaign_id: ad.campaign_id,
          ads_campaign_name: ad.campaign_name,
          ads_product_sku: ad.primary_sku || ad.primary_platform_sku || '',
          ads_product_name: ad.primary_product_name,
          ads_item_ids: ad.item_ids,
          top_picks_id: collection.top_picks_id,
          top_picks_name: collection.name,
          tracking_code: cleanText(trackingRow.tracking_code),
          voucher_code: cleanText(trackingRow.voucher_code),
          top_picks_item_ids: collection.item_ids,
          ads_spend: round2(hour.spend),
          ads_clicks: Math.round(num(hour.clicks)),
          ads_impressions: Math.round(num(hour.impressions)),
          primary_order_count: denominator,
          attach_order_count: numerator,
          payment_confirmed_primary_orders: paymentConfirmed,
          attach_rate: attachRate,
          attach_revenue: round2([...attachSkuRevenue.values()].reduce((sum, item) => sum + item.revenue, 0)),
          attach_skus: [...attachSkuRevenue.values()].map(item => ({
            sku: item.sku,
            product_name: item.product_name,
            qty: item.qty,
            revenue: round2(item.revenue)
          })),
          recommendation: recommendationFor(attachRate, hour.clicks, denominator)
        })
      }
    }
  }

  rows.sort((a, b) =>
    (b.attach_revenue - a.attach_revenue) ||
    (b.attach_rate - a.attach_rate) ||
    (b.ads_spend - a.ads_spend)
  )

  const summary = rows.reduce((acc, row) => {
    acc.ads_spend += row.ads_spend
    acc.ads_clicks += row.ads_clicks
    acc.primary_orders += row.primary_order_count
    acc.attach_orders += row.attach_order_count
    acc.attach_revenue += row.attach_revenue
    if (row.recommendation === 'replace_top_picks_items') acc.low_attach_rows += 1
    if (row.recommendation === 'keep_or_raise_ads_bid') acc.high_attach_rows += 1
    return acc
  }, {
    ads_spend: 0,
    ads_clicks: 0,
    primary_orders: 0,
    attach_orders: 0,
    attach_revenue: 0,
    low_attach_rows: 0,
    high_attach_rows: 0
  })
  summary.ads_spend = round2(summary.ads_spend)
  summary.attach_revenue = round2(summary.attach_revenue)
  summary.attach_rate = summary.primary_orders ? round2(summary.attach_orders / summary.primary_orders * 100) : 0

  return {
    status: 'ok',
    mode: 'shopee_top_picks_attach_analysis',
    source: {
      top_picks: 'Shopee get_top_picks_list snapshots',
      ads: 'marketplace_ads_campaign_snapshots from Shopee Ads API',
      orders: 'orders_v2/order_items synced from marketplace API',
      payment: 'Shopee get_income_detail used to confirm income order_sn when available'
    },
    caveat: 'Shopee TopPicks API does not return direct order attribution. Attach rate is an indirect cross-sell analysis by active TopPicks item list, Ads campaign item, and same order/hour data.',
    filters: { from, to, shop: cleanText(options.shop) },
    top_picks: {
      active_collections: collections.length,
      source: collections[0]?.source || ''
    },
    cache: {
      mode: String(options.sync ?? options.sync_first ?? options.syncFirst ?? '0') === '1' ? 'sync_then_cache' : 'cache_only',
      note: 'Phân tích đọc từ cache TopPicks snapshot. Shopee TopPicks chưa có tham số delta nên chỉ gọi API khi bấm cập nhật cache.'
    },
    ads_campaigns: adsRows.length,
    orders: orders.length,
    payment_detail: {
      status: payment.status,
      confirmed_order_sns: payment.rows,
      warnings: payment.warnings
    },
    summary,
    rows: rows.slice(0, Math.min(Math.max(Number(options.limit || 80) || 80, 1), 300))
  }
}
