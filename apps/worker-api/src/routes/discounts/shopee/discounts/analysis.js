export function installDiscountsShopeeDiscountsAnalysis(core) {
  const cleanText = (...args) => core.cleanText(...args)
  const defaultRange = (...args) => core.defaultRange(...args)
  const discountPercent = (...args) => core.discountPercent(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const num = (...args) => core.num(...args)
  const parseYmd = (...args) => core.parseYmd(...args)
  const round2 = (...args) => core.round2(...args)
  const sameShopFilterSql = (...args) => core.sameShopFilterSql(...args)
  const syncShopeeDiscounts = (...args) => core.syncShopeeDiscounts(...args)

  function extractItemIdsDeep(value, set = new Set(), depth = 0) {
    if (depth > 8 || value === null || value === undefined) return set
    if (Array.isArray(value)) {
      for (const item of value) extractItemIdsDeep(item, set, depth + 1)
      return set
    }
    if (typeof value !== 'object') return set
    for (const [key, raw] of Object.entries(value)) {
      const k = cleanText(key).toLowerCase()
      if (k === 'item_id' || k === 'itemid') {
        const id = cleanText(raw)
        if (/^\d+$/.test(id)) set.add(id)
      } else if ((k === 'item_id_list' || k === 'item_ids') && Array.isArray(raw)) {
        for (const item of raw) {
          const id = cleanText(item)
          if (/^\d+$/.test(id)) set.add(id)
        }
      }
      extractItemIdsDeep(raw, set, depth + 1)
    }
    return set
  }
  core.extractItemIdsDeep = extractItemIdsDeep

  function parseJson(value, fallback = {}) {
    try {
      return value ? JSON.parse(value) : fallback
    } catch {
      return fallback
    }
  }
  core.parseJson = parseJson

  async function loadProductVariationMaps(env) {
    const { results } = await env.DB.prepare(`
      SELECT v.platform, v.shop, v.platform_item_id, v.platform_sku, v.internal_sku,
             v.product_name, v.variation_name, v.price, v.discount_price, v.stock,
             p.cost_real, p.cost_invoice
      FROM product_variations v
      LEFT JOIN products p ON p.sku = v.internal_sku
      WHERE v.platform = 'shopee'
        AND COALESCE(v.platform_item_id, '') != ''
    `).all()
    const byItemId = new Map()
    const bySku = new Map()
    for (const row of results || []) {
      const itemId = cleanText(row.platform_item_id)
      if (itemId) {
        if (!byItemId.has(itemId)) byItemId.set(itemId, [])
        byItemId.get(itemId).push(row)
      }
      for (const sku of [row.platform_sku, row.internal_sku].map(cleanText).filter(Boolean)) bySku.set(sku.toLowerCase(), row)
    }
    return { rows: results || [], byItemId, bySku }
  }
  core.loadProductVariationMaps = loadProductVariationMaps

  async function loadDiscountItems(env, options) {
    await ensureShopeeDiscountTables(env)
    const shopFilter = sameShopFilterSql(options.shop, 'i.shop')
    const status = cleanText(options.status || options.discount_status || 'ongoing').toLowerCase()
    const statusSql = status && status !== 'all'
      ? ' AND LOWER(i.status) = ?'
      : " AND LOWER(i.status) IN ('ongoing','upcoming')"
    const params = status && status !== 'all' ? [status] : []
    const { results } = await env.DB.prepare(`
      SELECT i.*, d.start_time, d.end_time, d.source
      FROM marketplace_discount_items i
      JOIN marketplace_discounts d
        ON d.platform = i.platform
       AND d.api_shop_id = i.api_shop_id
       AND d.discount_id = i.discount_id
      WHERE i.platform = 'shopee'
        AND d.is_current = 1
        ${statusSql}
        ${shopFilter.sql}
      ORDER BY d.start_time DESC, i.discount_id, i.item_name
      LIMIT ?
    `).bind(...params, ...shopFilter.params, Math.min(Math.max(Number(options.limit || 300) || 300, 1), 2500)).all()
    return results || []
  }
  core.loadDiscountItems = loadDiscountItems

  function groupDiscountItemsForAnalysis(items = []) {
    const groups = new Map()
    for (const item of items) {
      const itemId = cleanText(item.item_id)
      const modelId = cleanText(item.model_id)
      const key = `${cleanText(item.shop)}|${cleanText(item.api_shop_id)}|${cleanText(item.discount_id)}|${itemId || modelId}`
      if (!groups.has(key)) {
        groups.set(key, {
          ...item,
          item_id: itemId,
          model_id: '',
          model_name: '',
          normal_stock: 0,
          promotion_stock: 0,
          original_price: 0,
          promotion_price: 0,
          discount_percent: 0,
          _models: new Set(),
          _original_prices: [],
          _promotion_prices: [],
          _discount_percents: []
        })
      }
      const group = groups.get(key)
      group.normal_stock += Math.max(0, num(item.normal_stock))
      group.promotion_stock += Math.max(0, num(item.promotion_stock))
      if (num(item.original_price) > 0) group._original_prices.push(num(item.original_price))
      if (num(item.promotion_price) > 0) group._promotion_prices.push(num(item.promotion_price))
      if (num(item.discount_percent) > 0) group._discount_percents.push(num(item.discount_percent))
      const label = cleanText(item.model_name || item.model_id)
      if (label) group._models.add(label)
    }
    return [...groups.values()].map(group => {
      const modelCount = group._models.size
      const originalPrices = group._original_prices
      const promotionPrices = group._promotion_prices
      const discountPercents = group._discount_percents
      group.original_price = originalPrices.length ? Math.max(...originalPrices) : num(group.original_price)
      group.promotion_price = promotionPrices.length ? Math.min(...promotionPrices) : num(group.promotion_price)
      group.discount_percent = discountPercents.length ? Math.max(...discountPercents) : discountPercent(group.original_price, group.promotion_price)
      group.model_label = modelCount > 1 ? `${modelCount} phân loại` : ([...group._models][0] || '')
      group.model_count = modelCount
      delete group._models
      delete group._original_prices
      delete group._promotion_prices
      delete group._discount_percents
      return group
    })
  }
  core.groupDiscountItemsForAnalysis = groupDiscountItemsForAnalysis

  async function loadAdsCampaigns(env, options) {
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
      LIMIT 2000
    `).bind(options.from, options.to, ...shopFilter.params).all()
    return results || []
  }
  core.loadAdsCampaigns = loadAdsCampaigns

  async function loadOrderLines(env, options) {
    const shopFilter = sameShopFilterSql(options.shop, 'o.shop')
    const { results } = await env.DB.prepare(`
      SELECT o.platform, o.shop, o.order_id, o.order_date,
             oi.sku, oi.product_name, oi.qty, oi.revenue_line
      FROM orders_v2 o
      JOIN order_items oi ON oi.order_id = o.order_id
      WHERE o.platform = 'shopee'
        AND substr(o.order_date, 1, 10) BETWEEN ? AND ?
        ${shopFilter.sql}
    `).bind(options.from, options.to, ...shopFilter.params).all()
    return results || []
  }
  core.loadOrderLines = loadOrderLines

  function adsMatchesDiscountItem(campaign, item, productMaps) {
    const itemIds = extractItemIdsDeep(parseJson(campaign.raw_data, {}))
    if (itemIds.has(cleanText(item.item_id))) return true
    const variations = variationsForDiscountItem(productMaps, item)
    const skuSet = new Set()
    for (const v of variations) {
      if (cleanText(v.platform_sku)) skuSet.add(cleanText(v.platform_sku).toLowerCase())
      if (cleanText(v.internal_sku)) skuSet.add(cleanText(v.internal_sku).toLowerCase())
    }
    const campaignSku = cleanText(campaign.product_sku).toLowerCase()
    return campaignSku && skuSet.has(campaignSku)
  }
  core.adsMatchesDiscountItem = adsMatchesDiscountItem

  function normalizeCompareText(value) {
    return cleanText(value).toLowerCase().replace(/\s+/g, ' ')
  }
  core.normalizeCompareText = normalizeCompareText

  function variationsForDiscountItem(productMaps, item) {
    const variations = productMaps.byItemId.get(cleanText(item.item_id)) || []
    const modelName = normalizeCompareText(item.model_name)
    if (!modelName) return variations
    const exact = variations.filter(v => normalizeCompareText(v.variation_name) === modelName)
    if (exact.length) return exact
    const loose = variations.filter(v => {
      const name = normalizeCompareText(v.variation_name)
      return name && (name.includes(modelName) || modelName.includes(name))
    })
    return loose.length ? loose : variations
  }
  core.variationsForDiscountItem = variationsForDiscountItem

  function orderMatchesDiscountItem(orderLine, item, productMaps) {
    const sku = cleanText(orderLine.sku).toLowerCase()
    if (!sku) return false
    const variations = variationsForDiscountItem(productMaps, item)
    return variations.some(v => cleanText(v.platform_sku).toLowerCase() === sku || cleanText(v.internal_sku).toLowerCase() === sku)
  }
  core.orderMatchesDiscountItem = orderMatchesDiscountItem

  function inventoryRecommendation(row, thresholds) {
    if (row.stock <= thresholds.lowStock) return 'reduce_or_end_discount'
    if (row.stock >= thresholds.highStock && row.discount_percent < thresholds.maxDiscountPercent && row.ads_clicks > 0) return 'increase_discount_review'
    if (row.ads_spend > 0 && row.orders === 0) return 'check_price_listing_or_ads_target'
    if (row.margin_after_discount <= thresholds.minMarginValue) return 'protect_price_floor'
    if (row.discount_percent >= thresholds.maxDiscountPercent) return 'do_not_increase_discount'
    return 'monitor'
  }
  core.inventoryRecommendation = inventoryRecommendation

  async function analyzeShopeeDiscounts(env, options = {}) {
    const defaults = defaultRange(options.days || 7)
    const from = parseYmd(options.from || options.date_from || options.dateFrom, defaults.from)
    const to = parseYmd(options.to || options.date_to || options.dateTo, defaults.to)
    const thresholds = {
      lowStock: Math.max(0, Number(options.low_stock || options.lowStock || 10) || 10),
      highStock: Math.max(1, Number(options.high_stock || options.highStock || 100) || 100),
      maxDiscountPercent: Math.max(1, Number(options.max_discount_percent || options.maxDiscountPercent || 30) || 30),
      minMarginValue: Number(options.min_margin_value || options.minMarginValue || 0) || 0
    }

    if (String(options.sync ?? options.sync_first ?? options.syncFirst ?? '0') === '1') {
      await syncShopeeDiscounts(env, {
        shop: options.shop,
        discount_status: options.discount_status || options.status || 'ongoing',
        include_detail: 1,
        shop_limit: options.shop_limit || 100
      })
    }

    const [discountItems, productMaps, adsCampaigns, orderLines] = await Promise.all([
      loadDiscountItems(env, { ...options, from, to }),
      loadProductVariationMaps(env),
      loadAdsCampaigns(env, { ...options, from, to }),
      loadOrderLines(env, { ...options, from, to })
    ])
    const analysisItems = groupDiscountItemsForAnalysis(discountItems)

    const rows = []
    for (const item of analysisItems) {
      const variations = variationsForDiscountItem(productMaps, item)
      const stockFromVariations = variations.reduce((sum, v) => sum + Math.max(0, Number(v.stock || 0) || 0), 0)
      const stock = stockFromVariations || Math.max(0, Number(item.normal_stock || 0) || 0)
      const costCandidates = variations.map(v => Number(v.cost_real || v.cost_invoice || 0) || 0).filter(Boolean)
      const avgCost = costCandidates.length ? costCandidates.reduce((sum, v) => sum + v, 0) / costCandidates.length : 0
      const matchedAds = adsCampaigns.filter(campaign => adsMatchesDiscountItem(campaign, item, productMaps))
      const matchedOrders = orderLines.filter(orderLine => orderMatchesDiscountItem(orderLine, item, productMaps))
      const adsSpend = round2(matchedAds.reduce((sum, row) => sum + num(row.spend), 0))
      const adsClicks = Math.round(matchedAds.reduce((sum, row) => sum + num(row.clicks), 0))
      const revenue = round2(matchedOrders.reduce((sum, row) => sum + num(row.revenue_line), 0))
      const qty = Math.round(matchedOrders.reduce((sum, row) => sum + num(row.qty), 0))
      const orders = new Set(matchedOrders.map(row => cleanText(row.order_id)).filter(Boolean)).size
      const promotionPrice = round2(item.promotion_price)
      const originalPrice = round2(item.original_price)
      const marginAfterDiscount = round2(promotionPrice - avgCost)
      const row = {
        platform: 'shopee',
        shop: item.shop,
        api_shop_id: item.api_shop_id,
        discount_id: item.discount_id,
        discount_name: item.discount_name,
        status: item.status,
        start_time: Number(item.start_time || 0) || 0,
        end_time: Number(item.end_time || 0) || 0,
        item_id: item.item_id,
        item_name: item.item_name,
        model_id: item.model_id,
        model_name: item.model_label || item.model_name,
        model_count: item.model_count || 0,
        sku: cleanText(variations[0]?.internal_sku || variations[0]?.platform_sku),
        stock,
        normal_stock_api: Math.round(num(item.normal_stock)),
        promotion_stock_api: Math.round(num(item.promotion_stock)),
        original_price: originalPrice,
        promotion_price: promotionPrice,
        discount_percent: round2(item.discount_percent),
        avg_cost: round2(avgCost),
        margin_after_discount: marginAfterDiscount,
        ads_spend: adsSpend,
        ads_clicks: adsClicks,
        ads_campaigns: matchedAds.length,
        orders,
        qty,
        revenue,
        roas_after_discount: round2(adsSpend ? revenue / adsSpend : 0),
        recommendation: ''
      }
      row.recommendation = inventoryRecommendation(row, thresholds)
      rows.push(row)
    }

    rows.sort((a, b) => {
      const rank = {
        reduce_or_end_discount: 1,
        protect_price_floor: 2,
        check_price_listing_or_ads_target: 3,
        increase_discount_review: 4,
        do_not_increase_discount: 5,
        monitor: 6
      }
      return (rank[a.recommendation] || 9) - (rank[b.recommendation] || 9) ||
        b.ads_spend - a.ads_spend ||
        b.stock - a.stock
    })

    const summary = rows.reduce((acc, row) => {
      acc.items += 1
      acc.ads_spend += row.ads_spend
      acc.ads_clicks += row.ads_clicks
      acc.orders += row.orders
      acc.revenue += row.revenue
      if (row.stock <= thresholds.lowStock) acc.low_stock += 1
      if (row.stock >= thresholds.highStock) acc.high_stock += 1
      if (row.recommendation === 'reduce_or_end_discount') acc.reduce_or_end += 1
      if (row.recommendation === 'increase_discount_review') acc.increase_review += 1
      if (row.recommendation === 'protect_price_floor') acc.protect_floor += 1
      return acc
    }, { items: 0, ads_spend: 0, ads_clicks: 0, orders: 0, revenue: 0, low_stock: 0, high_stock: 0, reduce_or_end: 0, increase_review: 0, protect_floor: 0 })
    summary.ads_spend = round2(summary.ads_spend)
    summary.revenue = round2(summary.revenue)

    return {
      status: 'ok',
      mode: 'shopee_discount_ads_inventory_analysis',
      source: {
        discounts: 'Shopee get_discount_list/get_discount snapshots',
        ads: 'marketplace_ads_campaign_snapshots from Shopee Ads API',
        inventory: 'product_variations synced from marketplace API',
        orders: 'orders_v2/order_items synced from marketplace API'
      },
      caveat: 'Shopee Discount API cho biet chuong trinh va gia khuyen mai, khong tu quy attribution ADS. Phan tich nay doi soat bang item_id/SKU, ADS snapshot, ton kho va order lines.',
      filters: { from, to, shop: cleanText(options.shop), status: cleanText(options.status || options.discount_status || 'ongoing') || 'ongoing' },
      thresholds,
      cache: {
        mode: String(options.sync ?? options.sync_first ?? options.syncFirst ?? '0') === '1' ? 'sync_then_cache' : 'cache_only',
        note: 'Phân tích đọc từ bảng cache marketplace_discounts/marketplace_discount_items. Nút cập nhật cache mới gọi Shopee API.'
      },
      discount_items: discountItems.length,
      analysis_items: analysisItems.length,
      ads_campaigns: adsCampaigns.length,
      order_lines: orderLines.length,
      summary,
      rows: rows.slice(0, Math.min(Math.max(Number(options.limit || 120) || 120, 1), 2500))
    }
  }
  core.analyzeShopeeDiscounts = analyzeShopeeDiscounts
}
