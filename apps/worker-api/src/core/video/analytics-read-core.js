import {
  cleanVideoText,
  ensureVideoAnalyticsTables,
  exactDateText,
  exactPeriodType,
  flattenMapEntries,
  mergeCountMaps,
  normalizeAudience,
  normalizeOverview,
  numberValue,
  parseJsonText
} from './analytics-schema-core.js'

export function aggregateOverview(rows = []) {
  const result = normalizeOverview({})
  for (const row of rows) {
    const overview = normalizeOverview(parseJsonText(row.overview_json, {}))
    for (const key of Object.keys(result.key_metric)) result.key_metric[key] += numberValue(overview.key_metric[key])
    for (const key of Object.keys(result.conversion)) result.conversion[key] += numberValue(overview.conversion[key])
    for (const key of Object.keys(result.engagement)) result.engagement[key] += numberValue(overview.engagement[key])
    if (!result.fetched_date_range && cleanVideoText(overview.fetched_date_range)) {
      result.fetched_date_range = cleanVideoText(overview.fetched_date_range)
    }
  }
  return result
}

export function hasOverviewSignals(overview = {}) {
  const normalized = normalizeOverview(overview)
  return [
    ...Object.values(normalized.key_metric || {}),
    ...Object.values(normalized.conversion || {}),
    ...Object.values(normalized.engagement || {})
  ].some(value => numberValue(value) > 0)
}

export function aggregateOverviewFromTrend(trendRows = []) {
  const result = normalizeOverview({})
  const keyMetricFields = [
    'placed_sales',
    'confirmed_sales',
    'placed_orders',
    'confirmed_orders',
    'placed_item_sold',
    'confirmed_item_sold',
    'total_viewers',
    'effective_views'
  ]
  const conversionFields = [
    'placed_buyers',
    'confirmed_buyers',
    'total_atc',
    'video_with_products',
    'placed_revenue_generating_videos',
    'confirmed_revenue_generating_videos'
  ]
  const engagementFields = ['total_views', 'total_likes', 'total_shares', 'total_comments', 'video_new_followers']
  let durationWeight = 0
  let durationTotal = 0
  const periods = []

  for (const row of trendRows || []) {
    const normalized = normalizeTrendRows([row])[0]
    if (!normalized) continue
    periods.push(normalized.data_period)
    for (const field of keyMetricFields) result.key_metric[field] += numberValue(normalized[field])
    for (const field of conversionFields) result.conversion[field] += numberValue(normalized[field])
    for (const field of engagementFields) {
      // Trường follower mới là chỉ số tăng mới, Shopee có lúc trả âm theo ngày nên không cộng âm lên KPI tổng.
      const value = field === 'video_new_followers'
        ? Math.max(0, numberValue(normalized[field]))
        : numberValue(normalized[field])
      result.engagement[field] += value
    }

    // Shopee đôi khi trả overview rỗng nhưng trend theo ngày vẫn có dữ liệu thật,
    // nên thời lượng xem trung bình được gom theo trọng số lượt xem để tránh cộng sai.
    const views = Math.max(numberValue(normalized.total_views), numberValue(normalized.total_viewers))
    if (views > 0 && numberValue(normalized.avg_view_duration) > 0) {
      durationWeight += views
      durationTotal += numberValue(normalized.avg_view_duration) * views
    }
  }

  result.key_metric.avg_view_duration = durationWeight > 0 ? durationTotal / durationWeight : 0
  result.conversion.ctr = result.key_metric.effective_views > 0
    ? (result.conversion.total_atc / result.key_metric.effective_views) * 100
    : 0
  result.conversion.placed_co_rate = result.key_metric.total_viewers > 0
    ? (result.conversion.placed_buyers / result.key_metric.total_viewers) * 100
    : 0
  result.conversion.confirmed_co_rate = result.key_metric.total_viewers > 0
    ? (result.conversion.confirmed_buyers / result.key_metric.total_viewers) * 100
    : 0
  result.conversion.placed_abs = result.conversion.placed_buyers > 0
    ? result.key_metric.placed_sales / result.conversion.placed_buyers
    : 0
  result.conversion.confirmed_abs = result.conversion.confirmed_buyers > 0
    ? result.key_metric.confirmed_sales / result.conversion.confirmed_buyers
    : 0
  const sortedPeriods = [...new Set(periods.filter(Boolean))].sort((left, right) => left.localeCompare(right))
  if (sortedPeriods.length) {
    result.fetched_date_range = `${sortedPeriods[0]} - ${sortedPeriods[sortedPeriods.length - 1]}`
  }
  return result
}

export function aggregateTrend(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const trendRows = normalizeTrendRows(parseJsonText(row.trend_json, []))
    for (const trendRow of trendRows) {
      const key = trendRow.data_period
      const current = map.get(key) || normalizeTrendRows([{ data_period: key }])[0]
      for (const [field, value] of Object.entries(trendRow)) {
        if (field === 'data_period') continue
        current[field] = numberValue(current[field]) + numberValue(value)
      }
      map.set(key, current)
    }
  }
  return [...map.values()].sort((left, right) => left.data_period.localeCompare(right.data_period))
}

export function aggregateAudience(rows = []) {
  const age = []
  const gender = []
  const location = []
  const identity = []
  const activity = []
  const content = []
  const shopping = []
  for (const row of rows) {
    const value = normalizeAudience(parseJsonText(row.demographics_json, {}))
    age.push(Object.fromEntries((value.age || []).map(entry => [entry.label, entry.value])))
    gender.push(Object.fromEntries((value.gender || []).map(entry => [entry.label, entry.value])))
    location.push(Object.fromEntries((value.location || []).map(entry => [entry.label, entry.value])))
    identity.push(Object.fromEntries((value.identity || []).map(entry => [entry.label, entry.value])))
    activity.push(Object.fromEntries((value.activity || []).map(entry => [entry.label, entry.value])))
    content.push(Object.fromEntries((value.content || []).map(entry => [entry.label, entry.value])))
    shopping.push(Object.fromEntries((value.shopping || []).map(entry => [entry.label, entry.value])))
  }
  return normalizeAudience({
    age: mergeCountMaps(age),
    gender: mergeCountMaps(gender),
    location: mergeCountMaps(location),
    identity: mergeCountMaps(identity),
    activity: mergeCountMaps(activity),
    content: mergeCountMaps(content),
    shopping: mergeCountMaps(shopping)
  })
}

export function mergeSortedRows(rows = [], keyField, limit = 10, scoreFields = []) {
  const map = new Map()
  for (const row of rows) {
    const key = cleanVideoText(row[keyField])
    if (!key) continue
    const current = map.get(key) || { ...row }
    for (const field of scoreFields) current[field] = numberValue(current[field]) + numberValue(row[field])
    if (!cleanVideoText(current.caption) && cleanVideoText(row.caption)) current.caption = cleanVideoText(row.caption)
    if (!cleanVideoText(current.item_name) && cleanVideoText(row.item_name)) current.item_name = cleanVideoText(row.item_name)
    if (!cleanVideoText(current.item_cover_image_url) && cleanVideoText(row.item_cover_image_url)) current.item_cover_image_url = cleanVideoText(row.item_cover_image_url)
    if (!cleanVideoText(current.cover_image_url) && cleanVideoText(row.cover_image_url)) current.cover_image_url = cleanVideoText(row.cover_image_url)
    map.set(key, current)
  }
  return [...map.values()]
    .sort((left, right) => {
      for (const field of scoreFields) {
        const diff = numberValue(right[field]) - numberValue(left[field])
        if (diff !== 0) return diff
      }
      return 0
    })
    .slice(0, limit)
}

export function buildProductInsightsFromRows(libraryRows = [], linkRows = [], topVideoRows = []) {
  const skuMap = new Map()
  for (const link of linkRows) {
    const label = cleanVideoText(link.internal_sku || link.item_id)
    if (!label) continue
    const current = skuMap.get(label) || {
      internal_sku: cleanVideoText(link.internal_sku),
      item_id: cleanVideoText(link.item_id),
      item_name: cleanVideoText(link.item_name),
      video_count: 0,
      shops: new Set()
    }
    current.video_count += 1
    if (cleanVideoText(link.shop)) current.shops.add(cleanVideoText(link.shop))
    skuMap.set(label, current)
  }
  const sku_with_video_rows = [...skuMap.values()]
    .map(item => ({
      internal_sku: item.internal_sku,
      item_id: item.item_id,
      item_name: item.item_name,
      video_count: item.video_count,
      shops: [...item.shops]
    }))
    .sort((left, right) => right.video_count - left.video_count)
    .slice(0, 10)

  const video_view_no_order_rows = topVideoRows
    .filter(row => numberValue(row.views) > 0 && numberValue(row.placed_orders) <= 0)
    .sort((left, right) => numberValue(right.views) - numberValue(left.views))
    .slice(0, 10)

  const video_boost_rows = topVideoRows
    .filter(row => numberValue(row.placed_orders) > 0 || numberValue(row.placed_sales) > 0)
    .sort((left, right) => {
      const salesDiff = numberValue(right.placed_sales) - numberValue(left.placed_sales)
      if (salesDiff !== 0) return salesDiff
      return numberValue(right.placed_orders) - numberValue(left.placed_orders)
    })
    .slice(0, 10)

  return {
    sku_with_video_rows,
    video_view_no_order_rows,
    video_boost_rows,
    library_video_count: libraryRows.length,
    linked_item_count: linkRows.length
  }
}

export function groupVideoLibraryRows(libraryRows = [], linkRows = [], detailRows = []) {
  const linkMap = new Map()
  for (const row of linkRows) {
    const key = `${cleanVideoText(row.platform)}|${cleanVideoText(row.shop)}|${cleanVideoText(row.video_key)}`
    const list = linkMap.get(key) || []
    list.push({
      item_id: cleanVideoText(row.item_id),
      item_name: cleanVideoText(row.item_name),
      custom_item_name: cleanVideoText(row.custom_item_name),
      item_cover_image_url: cleanVideoText(row.item_cover_image_url),
      min_price: numberValue(row.min_price),
      max_price: numberValue(row.max_price),
      stock: numberValue(row.stock),
      internal_sku: cleanVideoText(row.internal_sku),
      product_name: cleanVideoText(row.product_name)
    })
    linkMap.set(key, list)
  }

  const detailMap = new Map()
  for (const row of detailRows) {
    const key = `${cleanVideoText(row.platform)}|${cleanVideoText(row.shop)}|${cleanVideoText(row.video_key)}`
    detailMap.set(key, {
      performance: parseJsonText(row.performance_json, {}),
      metric_trend: parseJsonText(row.metric_trend_json, {}),
      audience: normalizeAudience(parseJsonText(row.audience_json, {})),
      product_rows: parseJsonText(row.product_json, []),
      cover_list: parseJsonText(row.cover_list_json, []),
      warnings: parseJsonText(row.warnings_json, [])
    })
  }

  return libraryRows.map(row => {
    const key = `${cleanVideoText(row.platform)}|${cleanVideoText(row.shop)}|${cleanVideoText(row.video_key)}`
    return {
      platform: cleanVideoText(row.platform),
      shop: cleanVideoText(row.shop),
      api_shop_id: cleanVideoText(row.api_shop_id),
      api_user_id: cleanVideoText(row.api_user_id),
      video_key: cleanVideoText(row.video_key),
      video_upload_id: cleanVideoText(row.video_upload_id),
      post_id: cleanVideoText(row.post_id),
      list_type: cleanVideoText(row.list_type),
      status: numberValue(row.status),
      status_label: cleanVideoText(row.status_label),
      caption: cleanVideoText(row.caption),
      cover_image_url: cleanVideoText(row.cover_image_url),
      video_url: cleanVideoText(row.video_url),
      duration_ms: numberValue(row.duration_ms),
      views: numberValue(row.views),
      likes: numberValue(row.likes),
      comments: numberValue(row.comments),
      shares: numberValue(row.shares),
      has_performance: numberValue(row.has_performance) ? 1 : 0,
      allow_duet: numberValue(row.allow_duet) ? 1 : 0,
      allow_stitch: numberValue(row.allow_stitch) ? 1 : 0,
      scheduled_post: numberValue(row.scheduled_post) ? 1 : 0,
      scheduled_post_time: cleanVideoText(row.scheduled_post_time),
      post_time: cleanVideoText(row.post_time),
      update_time: cleanVideoText(row.update_time),
      item_count: numberValue(row.item_count),
      raw_data: parseJsonText(row.raw_data, {}),
      synced_at: cleanVideoText(row.synced_at),
      links: linkMap.get(key) || [],
      detail_cache: detailMap.get(key) || null
    }
  })
}

export async function readMarketplaceVideoDashboard(env, options = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(options.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(options.shop)
  const periodType = exactPeriodType(options.period_type)
  const endDate = exactDateText(options.end_date)
  const args = [platform, periodType, endDate]
  let sql = `
    SELECT platform, shop, api_shop_id, api_user_id, period_type, end_date, fetched_date_range,
           overview_json, trend_json, demographics_json, top_video_json, top_product_json,
           product_insight_json, warnings_json, synced_at
    FROM marketplace_video_dashboard_snapshots
    WHERE platform = ? AND period_type = ? AND end_date = ?
  `
  if (shop) {
    sql += ' AND shop = ?'
    args.push(shop)
  }
  sql += ' ORDER BY shop ASC'
  const { results: snapshotRows } = await env.DB.prepare(sql).bind(...args).all()

  const library = await readMarketplaceVideoLibrary(env, { platform, shop, limit: 500 })
  const trend_rows = aggregateTrend(snapshotRows || [])
  const snapshotOverview = aggregateOverview(snapshotRows || [])
  const overview = hasOverviewSignals(snapshotOverview) || !trend_rows.length
    ? snapshotOverview
    : aggregateOverviewFromTrend(trend_rows)
  const overview_source = hasOverviewSignals(snapshotOverview) || !trend_rows.length ? 'overview' : 'trend_fallback'
  const top_video_rows = mergeSortedRows(
    (snapshotRows || []).flatMap(row => normalizeVideoPerformanceRows(parseJsonText(row.top_video_json, []))),
    'video_key',
    12,
    ['placed_sales', 'placed_orders', 'views']
  )
  const top_product_rows = mergeSortedRows(
    (snapshotRows || []).flatMap(row => normalizeProductPerformanceRows(parseJsonText(row.top_product_json, []))),
    'item_id',
    12,
    ['placed_sales', 'placed_orders', 'confirmed_sales']
  )
  const demographics = aggregateAudience(snapshotRows || [])
  const product_insights = buildProductInsightsFromRows(library.rows, library.link_rows, top_video_rows)
  const warnings = (snapshotRows || []).flatMap(row => {
    const list = parseJsonText(row.warnings_json, [])
    return Array.isArray(list) ? list.map(item => ({ shop: cleanVideoText(row.shop), message: cleanVideoText(item?.message || item) })).filter(item => item.message) : []
  })

  return {
    platform,
    shop,
    period_type: periodType,
    end_date: endDate,
    cached_shop_count: (snapshotRows || []).length,
    synced_at: cleanVideoText(snapshotRows?.[0]?.synced_at),
    overview,
    overview_source,
    trend_rows,
    top_video_rows,
    top_product_rows,
    demographics,
    product_insights,
    warnings,
    library: library.rows
  }
}

export async function readMarketplaceVideoLibrary(env, options = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(options.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(options.shop)
  const listType = cleanVideoText(options.list_type)
  const limit = Math.min(Math.max(Number(options.limit || 100) || 100, 1), 500)
  const args = [platform]
  let sql = `
    SELECT platform, shop, api_shop_id, api_user_id, video_key, video_upload_id, post_id, list_type,
           status, status_label, caption, cover_image_url, video_url, duration_ms, views, likes,
           comments, shares, has_performance, allow_duet, allow_stitch, scheduled_post,
           scheduled_post_time, post_time, update_time, item_count, raw_data, synced_at
    FROM marketplace_video_library
    WHERE platform = ?
  `
  if (shop) {
    sql += ' AND shop = ?'
    args.push(shop)
  }
  if (listType && listType !== 'all') {
    sql += ' AND list_type = ?'
    args.push(listType)
  }
  sql += ' ORDER BY CASE WHEN status = 300 THEN 0 WHEN status = 200 THEN 1 ELSE 2 END, update_time DESC, synced_at DESC LIMIT ?'
  args.push(limit)
  const { results: libraryRows } = await env.DB.prepare(sql).bind(...args).all()

  const linkArgs = [platform]
  let linkSql = `
    SELECT platform, shop, video_key, item_id, item_name, custom_item_name, item_cover_image_url,
           min_price, max_price, stock, internal_sku, product_name
    FROM marketplace_video_item_links
    WHERE platform = ?
  `
  if (shop) {
    linkSql += ' AND shop = ?'
    linkArgs.push(shop)
  }
  const { results: linkRows } = await env.DB.prepare(linkSql).bind(...linkArgs).all()

  const detailArgs = [platform]
  let detailSql = `
    SELECT platform, shop, video_key, performance_json, metric_trend_json, audience_json,
           product_json, cover_list_json, warnings_json
    FROM marketplace_video_detail_snapshots
    WHERE platform = ?
  `
  if (shop) {
    detailSql += ' AND shop = ?'
    detailArgs.push(shop)
  }
  const { results: detailRows } = await env.DB.prepare(detailSql).bind(...detailArgs).all()
  return {
    rows: groupVideoLibraryRows(libraryRows || [], linkRows || [], detailRows || []),
    link_rows: (linkRows || []).map(row => ({
      platform: cleanVideoText(row.platform),
      shop: cleanVideoText(row.shop),
      video_key: cleanVideoText(row.video_key),
      item_id: cleanVideoText(row.item_id),
      item_name: cleanVideoText(row.item_name),
      custom_item_name: cleanVideoText(row.custom_item_name),
      item_cover_image_url: cleanVideoText(row.item_cover_image_url),
      min_price: numberValue(row.min_price),
      max_price: numberValue(row.max_price),
      stock: numberValue(row.stock),
      internal_sku: cleanVideoText(row.internal_sku),
      product_name: cleanVideoText(row.product_name)
    }))
  }
}

export async function readMarketplaceVideoDetail(env, options = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(options.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(options.shop)
  const videoKey = buildMarketplaceVideoKey(options)
  if (!platform || !shop || !videoKey) return null
  const row = await env.DB.prepare(`
    SELECT platform, shop, api_shop_id, api_user_id, video_key, video_upload_id, post_id,
           performance_json, metric_trend_json, audience_json, product_json, cover_list_json,
           warnings_json, synced_at
    FROM marketplace_video_detail_snapshots
    WHERE platform = ? AND shop = ? AND video_key = ?
    LIMIT 1
  `).bind(platform, shop, videoKey).first()
  if (!row) return null
  return {
    platform: cleanVideoText(row.platform),
    shop: cleanVideoText(row.shop),
    api_shop_id: cleanVideoText(row.api_shop_id),
    api_user_id: cleanVideoText(row.api_user_id),
    video_key: cleanVideoText(row.video_key),
    video_upload_id: cleanVideoText(row.video_upload_id),
    post_id: cleanVideoText(row.post_id),
    performance: parseJsonText(row.performance_json, {}),
    metric_trend: parseJsonText(row.metric_trend_json, {}),
    audience: normalizeAudience(parseJsonText(row.audience_json, {})),
    product_rows: parseJsonText(row.product_json, []),
    cover_list: parseJsonText(row.cover_list_json, []),
    warnings: parseJsonText(row.warnings_json, []),
    synced_at: cleanVideoText(row.synced_at)
  }
}
