export function installDiscountsCommonPromotionSkuDetail(core) {
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const defaultRange = (...args) => core.defaultRange(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const findPromotionItemForPreview = (...args) => core.findPromotionItemForPreview(...args)
  const limitNumber = (...args) => core.limitNumber(...args)
  const num = (...args) => core.num(...args)
  const parseJson = (...args) => core.parseJson(...args)
  const round2 = (...args) => core.round2(...args)
  const tableColumns = (...args) => core.tableColumns(...args)
  const tableExists = (...args) => core.tableExists(...args)

  function promotionIdValues(row = {}) {
    return [...new Set([
      row.item_id,
      row.platform_item_id,
      row.sku,
      row.sku_id,
      row.model_id,
      row.internal_sku,
      row.platform_sku
    ].map(cleanText).filter(Boolean))]
  }
  core.promotionIdValues = promotionIdValues

  function rankPromotionVariation(row = {}, variation = {}) {
    let score = 0
    if (cleanText(row.item_id) && cleanText(variation.platform_item_id) === cleanText(row.item_id)) score += 40
    if (cleanText(row.model_id) && cleanText(variation.model_id) === cleanText(row.model_id)) score += 30
    if (cleanText(row.sku) && cleanText(variation.platform_sku).toLowerCase() === cleanText(row.sku).toLowerCase()) score += 25
    if (cleanText(row.sku_id) && cleanText(variation.platform_sku).toLowerCase() === cleanText(row.sku_id).toLowerCase()) score += 18
    if (cleanText(row.sku) && cleanText(variation.internal_sku).toLowerCase() === cleanText(row.sku).toLowerCase()) score += 12
    if (cleanText(variation.discount_price) && num(variation.discount_price) > 0) score += 4
    if (cleanText(variation.price) && num(variation.price) > 0) score += 4
    if (cleanText(variation.stock) && num(variation.stock) > 0) score += 2
    return score
  }
  core.rankPromotionVariation = rankPromotionVariation

  async function findPromotionVariation(env, row = {}) {
    if (!await tableExists(env, 'product_variations')) return null
    const columns = await tableColumns(env, 'product_variations')
    const platform = cleanText(row.platform).toLowerCase()
    const shop = cleanText(row.shop)
    const values = promotionIdValues(row)
    const filters = []
    const params = []
    if (columns.has('platform') && platform) {
      filters.push('LOWER(platform) = ?')
      params.push(platform)
    }
    if (columns.has('shop') && shop) {
      filters.push('shop = ?')
      params.push(shop)
    }
    const orFilters = []
    const orParams = []
    const fieldValues = {
      platform_item_id: [row.item_id, row.platform_item_id],
      model_id: [row.model_id],
      platform_sku: [row.sku, row.sku_id, row.model_id],
      internal_sku: [row.sku, row.sku_id]
    }
    for (const [field, candidates] of Object.entries(fieldValues)) {
      if (!columns.has(field)) continue
      const cleanCandidates = [...new Set((candidates || []).map(cleanText).filter(Boolean))]
      for (const value of cleanCandidates) {
        orFilters.push(`LOWER(COALESCE(${field}, '')) = ?`)
        orParams.push(value.toLowerCase())
      }
    }
    if (!orFilters.length && values.length && columns.has('platform_sku')) {
      for (const value of values) {
        orFilters.push("LOWER(COALESCE(platform_sku, '')) = ?")
        orParams.push(value.toLowerCase())
      }
    }
    if (!orFilters.length) return null
    const where = [...filters, `(${orFilters.join(' OR ')})`].join(' AND ')
    const orderBy = columns.has('updated_at') ? 'updated_at DESC' : columns.has('id') ? 'id DESC' : 'rowid DESC'
    const { results } = await env.DB.prepare(`
      SELECT *
      FROM product_variations
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT 20
    `).bind(...params, ...orParams).all()
    const rows = results || []
    if (!rows.length) return null
    rows.sort((a, b) => rankPromotionVariation(row, b) - rankPromotionVariation(row, a))
    return rows[0]
  }
  core.findPromotionVariation = findPromotionVariation

  function mappedInternalSkus(variation = {}) {
    const skus = [cleanText(variation.internal_sku)]
    const mapped = parseJson(variation.mapped_items, [])
    if (Array.isArray(mapped)) {
      for (const item of mapped) skus.push(cleanText(item?.sku || item?.internal_sku || item))
    }
    return [...new Set(skus.filter(Boolean))]
  }
  core.mappedInternalSkus = mappedInternalSkus

  async function loadPromotionProductCost(env, variation = {}) {
    if (!variation || !await tableExists(env, 'products')) return null
    const skus = mappedInternalSkus(variation)
    if (!skus.length) return null
    const placeholders = skus.map(() => '?').join(',')
    const row = await env.DB.prepare(`
      SELECT sku, product_name, cost_real, cost_invoice, stock, stock_main, stock_sub
      FROM products
      WHERE sku IN (${placeholders})
      ORDER BY CASE WHEN COALESCE(cost_real, 0) > 0 THEN 0 ELSE 1 END
      LIMIT 1
    `).bind(...skus).first().catch(() => null)
    return row || null
  }
  core.loadPromotionProductCost = loadPromotionProductCost

  async function loadPromotionAdsSummary(env, row = {}, variation = {}, options = {}) {
    if (!await tableExists(env, 'marketplace_ads_campaign_snapshots')) return { campaigns: 0, spend: 0, revenue: 0, orders: 0, clicks: 0, latest_snapshot_date: '', source: 'no_ads_table' }
    const values = [...new Set([
      cleanText(row.sku),
      cleanText(row.sku_id),
      cleanText(variation?.platform_sku),
      cleanText(variation?.internal_sku)
    ].filter(Boolean).map(value => value.toLowerCase()))]
    if (!values.length) return { campaigns: 0, spend: 0, revenue: 0, orders: 0, clicks: 0, latest_snapshot_date: '', source: 'missing_sku_match' }
    const days = limitNumber(options.days, 30, 1, 365)
    const range = defaultRange(days)
    const marks = values.map(() => '?').join(',')
    const rowData = await env.DB.prepare(`
      SELECT COUNT(DISTINCT campaign_id) AS campaigns,
             SUM(COALESCE(spend, 0)) AS spend,
             SUM(COALESCE(revenue, 0)) AS revenue,
             SUM(COALESCE(orders, 0)) AS orders,
             SUM(COALESCE(clicks, 0)) AS clicks,
             MAX(snapshot_date) AS latest_snapshot_date
      FROM marketplace_ads_campaign_snapshots
      WHERE LOWER(COALESCE(platform, '')) = ?
        AND shop = ?
        AND snapshot_date BETWEEN ? AND ?
        AND LOWER(COALESCE(product_sku, '')) IN (${marks})
    `).bind(cleanText(row.platform).toLowerCase(), cleanText(row.shop), range.from, range.to, ...values).first().catch(() => null)
    return {
      campaigns: Math.round(num(rowData?.campaigns)),
      spend: round2(rowData?.spend),
      revenue: round2(rowData?.revenue),
      orders: Math.round(num(rowData?.orders)),
      clicks: Math.round(num(rowData?.clicks)),
      latest_snapshot_date: cleanText(rowData?.latest_snapshot_date),
      source: 'marketplace_ads_campaign_snapshots',
      date_from: range.from,
      date_to: range.to
    }
  }
  core.loadPromotionAdsSummary = loadPromotionAdsSummary

  async function loadPromotionOrderSummary(env, row = {}, variation = {}, options = {}) {
    if (!await tableExists(env, 'order_items') || !await tableExists(env, 'orders_v2')) return { orders: 0, qty: 0, revenue: 0, cost: 0, latest_order_date: '', source: 'missing_order_tables' }
    const values = [...new Set([
      cleanText(row.sku),
      cleanText(row.sku_id),
      cleanText(variation?.platform_sku),
      cleanText(variation?.internal_sku)
    ].filter(Boolean).map(value => value.toLowerCase()))]
    if (!values.length) return { orders: 0, qty: 0, revenue: 0, cost: 0, latest_order_date: '', source: 'missing_sku_match' }
    const days = limitNumber(options.days, 30, 1, 365)
    const range = defaultRange(days)
    const marks = values.map(() => '?').join(',')
    const rowData = await env.DB.prepare(`
      SELECT COUNT(DISTINCT o.order_id) AS orders,
             SUM(COALESCE(oi.qty, 0)) AS qty,
             SUM(COALESCE(oi.revenue_line, 0)) AS revenue,
             SUM(COALESCE(oi.cost_real, 0)) AS cost,
             MAX(o.order_date) AS latest_order_date
      FROM order_items oi
      JOIN orders_v2 o ON o.order_id = oi.order_id
      WHERE LOWER(COALESCE(o.platform, '')) = ?
        AND o.shop = ?
        AND date(o.order_date) BETWEEN ? AND ?
        AND LOWER(COALESCE(oi.sku, '')) IN (${marks})
    `).bind(cleanText(row.platform).toLowerCase(), cleanText(row.shop), range.from, range.to, ...values).first().catch(() => null)
    return {
      orders: Math.round(num(rowData?.orders)),
      qty: round2(rowData?.qty),
      revenue: round2(rowData?.revenue),
      cost: round2(rowData?.cost),
      latest_order_date: cleanText(rowData?.latest_order_date),
      source: 'orders_v2/order_items',
      date_from: range.from,
      date_to: range.to
    }
  }
  core.loadPromotionOrderSummary = loadPromotionOrderSummary

  function applyVariationFallback(row = {}, variation = {}) {
    const warnings = []
    const originalPrice = round2(row.original_price || variation?.price)
    const promotionPrice = round2(row.promotion_price || variation?.discount_price)
    const stock = Math.round(num(row.stock || row.campaign_stock || variation?.stock))
    if (!originalPrice) warnings.push('Thiếu giá gốc trong cache và product_variations.')
    if (!promotionPrice) warnings.push('Thiếu giá khuyến mãi trong cache; cần nhập giá mục tiêu khi preview.')
    if (!stock) warnings.push('Tồn đang bằng 0 hoặc chưa map được tồn thật.')
    return {
      ...row,
      sku: cleanText(row.sku || variation?.platform_sku || variation?.internal_sku),
      item_name: cleanText(row.item_name || variation?.product_name),
      model_name: cleanText(row.model_name || variation?.variation_name),
      model_id: cleanText(row.model_id || variation?.model_id),
      original_price: originalPrice,
      promotion_price: promotionPrice,
      stock,
      price_source: cleanText(row.price_source || (variation ? 'product_variations' : 'promotion_cache')),
      enrichment_warnings: warnings
    }
  }
  core.applyVariationFallback = applyVariationFallback

  async function getPromotionSkuDetail(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const inputRow = options.row && typeof options.row === 'object' ? options.row : {}
    const cachedRow = await findPromotionItemForPreview(env, options)
    const baseRow = { ...cachedRow, ...inputRow }
    if (!baseRow || (!baseRow.item_id && !baseRow.sku_id && !baseRow.sku && !baseRow.program_id)) {
      return { status: 'error', error: 'promotion_item_not_found', message: 'Không tìm thấy SKU/item khuyến mãi trong cache.' }
    }
    const row = {
      ...baseRow,
      platform: cleanText(options.platform || baseRow.platform).toLowerCase(),
      module: cleanText(options.module || baseRow.module).toLowerCase(),
      shop: cleanText(options.shop || baseRow.shop)
    }
    const variation = await findPromotionVariation(env, row)
    const enriched = applyVariationFallback(row, variation || {})
    const [productCost, ads, orders] = await Promise.all([
      loadPromotionProductCost(env, variation || {}),
      loadPromotionAdsSummary(env, enriched, variation || {}, options),
      loadPromotionOrderSummary(env, enriched, variation || {}, options)
    ])
    const costBase = round2(productCost?.cost_real || productCost?.cost_invoice || (orders.qty ? orders.cost / orders.qty : 0))
    const targetPrice = round2(options.target_promotion_price || options.targetPrice || enriched.promotion_price)
    const unitMargin = targetPrice && costBase ? round2(targetPrice - costBase) : 0
    const netAfterAds = round2(orders.revenue - orders.cost - ads.spend)
    const warnings = [...(enriched.enrichment_warnings || [])]
    if (!variation) warnings.push('Chưa map được item khuyến mãi sang product_variations.')
    if (!costBase) warnings.push('Chưa có giá vốn nên chưa đủ điều kiện duyệt apply thật.')
    if (targetPrice && costBase && targetPrice <= costBase) warnings.push('Giá mục tiêu không cao hơn giá vốn.')
    return {
      status: 'ok',
      mode: 'promotion_sku_detail',
      source: {
        promotion: 'marketplace_promotion_items',
        inventory: variation ? 'product_variations' : 'not_mapped',
        ads: ads.source,
        orders: orders.source,
        cost: productCost ? 'products' : (orders.cost ? 'order_items_cost_real' : 'missing')
      },
      promotion_item: {
        ...enriched,
        raw: parseJson(enriched.raw_data, {}),
        raw_data: undefined
      },
      inventory: variation ? {
        platform_item_id: cleanText(variation.platform_item_id),
        platform_sku: cleanText(variation.platform_sku),
        internal_sku: cleanText(variation.internal_sku),
        product_name: cleanText(variation.product_name),
        variation_name: cleanText(variation.variation_name),
        price: round2(variation.price),
        discount_price: round2(variation.discount_price),
        stock: Math.round(num(variation.stock)),
        map_status: cleanText(variation.map_status)
      } : null,
      product_cost: productCost ? {
        sku: cleanText(productCost.sku),
        product_name: cleanText(productCost.product_name),
        cost_real: round2(productCost.cost_real),
        cost_invoice: round2(productCost.cost_invoice),
        stock: Math.round(num(productCost.stock || productCost.stock_main || productCost.stock_sub))
      } : null,
      ads,
      orders,
      profit_check: {
        target_price: targetPrice,
        cost_base: costBase,
        unit_margin_after_target: unitMargin,
        net_after_ads_30d: netAfterAds,
        safe_to_queue: Boolean(targetPrice > 0 && (!costBase || targetPrice > costBase))
      },
      warnings
    }
  }
  core.getPromotionSkuDetail = getPromotionSkuDetail

  async function repairPromotionItemPriceGaps(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const limit = limitNumber(options.limit, 60, 1, 300)
    const filters = ['(COALESCE(original_price, 0) <= 0 OR COALESCE(promotion_price, 0) <= 0 OR COALESCE(stock, 0) <= 0 OR COALESCE(sku, "") = "" OR COALESCE(item_name, "") = "")']
    const params = []
    for (const [field, value] of [
      ['platform', cleanText(options.platform).toLowerCase()],
      ['module', cleanText(options.module).toLowerCase()],
      ['shop', cleanText(options.shop)],
      ['program_id', cleanText(options.program_id || options.programId)]
    ]) {
      if (!value) continue
      filters.push(field === 'platform' || field === 'module' ? `LOWER(${field}) = ?` : `${field} = ?`)
      params.push(value)
    }
    const { results } = await env.DB.prepare(`
      SELECT *
      FROM marketplace_promotion_items
      WHERE ${filters.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(...params, limit).all()
    const rows = results || []
    let matched = 0
    let updated = 0
    let partial = 0
    const misses = []
    const examples = []
    for (const row of rows) {
      const variation = await findPromotionVariation(env, row)
      if (!variation) {
        misses.push({ id: row.id, item_id: row.item_id, sku: row.sku, reason: 'not_mapped_to_product_variations' })
        continue
      }
      matched += 1
      const next = applyVariationFallback(row, variation)
      const warnings = next.enrichment_warnings || []
      if (warnings.length) partial += 1
      const hasChange = [
        ['original_price', next.original_price],
        ['promotion_price', next.promotion_price],
        ['stock', next.stock],
        ['sku', next.sku],
        ['item_name', next.item_name],
        ['model_name', next.model_name],
        ['model_id', next.model_id]
      ].some(([key, value]) => cleanText(row[key]) !== cleanText(value))
      if (!hasChange) continue
      await env.DB.prepare(`
        UPDATE marketplace_promotion_items
        SET sku = COALESCE(NULLIF(?, ''), sku),
            item_name = COALESCE(NULLIF(?, ''), item_name),
            model_name = COALESCE(NULLIF(?, ''), model_name),
            model_id = COALESCE(NULLIF(?, ''), model_id),
            original_price = CASE WHEN ? > 0 THEN ? ELSE original_price END,
            promotion_price = CASE WHEN ? > 0 THEN ? ELSE promotion_price END,
            stock = CASE WHEN ? > 0 THEN ? ELSE stock END,
            price_source = 'product_variations',
            enrichment_status = ?,
            enrichment_warnings = ?,
            updated_at = datetime('now', '+7 hours')
        WHERE id = ?
      `).bind(
        next.sku, next.item_name, next.model_name, next.model_id,
        next.original_price, next.original_price,
        next.promotion_price, next.promotion_price,
        next.stock, next.stock,
        warnings.length ? 'partial_price_map' : 'price_stock_mapped',
        compactJson(warnings, 4000),
        row.id
      ).run()
      updated += 1
      if (examples.length < 8) {
        examples.push({
          id: row.id,
          platform: row.platform,
          shop: row.shop,
          module: row.module,
          item_id: row.item_id,
          sku: next.sku,
          original_price: next.original_price,
          promotion_price: next.promotion_price,
          stock: next.stock,
          warnings
        })
      }
    }
    return {
      status: 'ok',
      mode: 'promotion_price_gap_repair',
      source: 'marketplace_promotion_items + product_variations',
      scanned: rows.length,
      matched,
      updated,
      partial,
      missed: misses.length,
      misses: misses.slice(0, 12),
      examples,
      safety: 'Chỉ làm sạch cache D1 nội bộ, không gửi lệnh sửa giá/tồn lên sàn.'
    }
  }
  core.repairPromotionItemPriceGaps = repairPromotionItemPriceGaps
}
