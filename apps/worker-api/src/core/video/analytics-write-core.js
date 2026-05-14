import {
  buildMarketplaceVideoKey,
  cleanVideoText,
  compactJson,
  ensureVideoAnalyticsTables,
  exactDateText,
  exactPeriodType,
  jsonText,
  normalizeAudience,
  normalizeOverview,
  normalizeProductPerformanceRows,
  normalizeTrendRows,
  normalizeVideoPerformanceRows,
  numberValue,
  parseJsonText
} from './analytics-schema-core.js'

export async function saveMarketplaceVideoLibrary(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(payload.platform).toLowerCase()
  const shop = cleanVideoText(payload.shop)
  const apiShopId = cleanVideoText(payload.api_shop_id)
  const apiUserId = cleanVideoText(payload.api_user_id)
  const listType = cleanVideoText(payload.list_type || 'post')
  const rows = Array.isArray(payload.rows) ? payload.rows : []
  if (!platform || !shop) return { saved_videos: 0, saved_links: 0 }

  const { results: variationRows } = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, internal_sku
    FROM product_variations
    WHERE platform = ? AND shop = ?
  `).bind(platform, shop).all()
  const internalSkuMap = buildInternalSkuMap(variationRows || [])

  let savedVideos = 0
  let savedLinks = 0
  const seenVideoKeys = new Set()

  for (const row of rows) {
    const videoKey = buildMarketplaceVideoKey(row)
    if (!videoKey) continue
    seenVideoKeys.add(videoKey)
    const itemList = Array.isArray(row.item_list) ? row.item_list : []
    await env.DB.prepare(`
      INSERT INTO marketplace_video_library (
        platform, shop, api_shop_id, api_user_id, video_key, video_upload_id, post_id,
        list_type, status, status_label, caption, cover_image_url, video_url, duration_ms,
        views, likes, comments, shares, has_performance, allow_duet, allow_stitch,
        scheduled_post, scheduled_post_time, post_time, update_time, item_count, raw_data,
        sync_source, synced_at, updated_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api',
        datetime('now', '+7 hours'), datetime('now', '+7 hours'), datetime('now', '+7 hours')
      )
      ON CONFLICT(platform, shop, video_key) DO UPDATE SET
        api_shop_id = excluded.api_shop_id,
        api_user_id = excluded.api_user_id,
        video_upload_id = excluded.video_upload_id,
        post_id = excluded.post_id,
        list_type = excluded.list_type,
        status = excluded.status,
        status_label = excluded.status_label,
        caption = excluded.caption,
        cover_image_url = excluded.cover_image_url,
        video_url = excluded.video_url,
        duration_ms = excluded.duration_ms,
        views = excluded.views,
        likes = excluded.likes,
        comments = excluded.comments,
        shares = excluded.shares,
        has_performance = excluded.has_performance,
        allow_duet = excluded.allow_duet,
        allow_stitch = excluded.allow_stitch,
        scheduled_post = excluded.scheduled_post,
        scheduled_post_time = excluded.scheduled_post_time,
        post_time = excluded.post_time,
        update_time = excluded.update_time,
        item_count = excluded.item_count,
        raw_data = excluded.raw_data,
        sync_source = excluded.sync_source,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at
    `).bind(
      platform,
      shop,
      apiShopId,
      apiUserId,
      videoKey,
      cleanVideoText(row.video_upload_id),
      cleanVideoText(row.post_id),
      listType,
      numberValue(row.status),
      cleanVideoText(row.status_label || statusLabel(row.status)),
      cleanVideoText(row.caption),
      cleanVideoText(row.cover_image_url),
      cleanVideoText(row.video_url),
      numberValue(row.duration),
      numberValue(row.views),
      numberValue(row.likes),
      numberValue(row.comments),
      numberValue(row.shares),
      numberValue(row.has_performance ? 1 : 0),
      numberValue(row.allow_info?.allow_duet ? 1 : 0),
      numberValue(row.allow_info?.allow_stitch ? 1 : 0),
      numberValue(row.scheduled_info?.scheduled_post ? 1 : 0),
      cleanVideoText(row.scheduled_info?.scheduled_post_time),
      cleanVideoText(row.post_time),
      cleanVideoText(row.update_time),
      itemList.length,
      compactJson(row)
    ).run()
    savedVideos += 1

    await env.DB.prepare(`
      DELETE FROM marketplace_video_item_links
      WHERE platform = ? AND shop = ? AND video_key = ?
    `).bind(platform, shop, videoKey).run()

    for (const item of itemList) {
      const itemId = cleanVideoText(item.item_id)
      if (!itemId) continue
      const mapKey = `${platform}|${shop}|${itemId}`
      const internalSkus = [...(internalSkuMap.get(mapKey) || new Set())]
      await env.DB.prepare(`
        INSERT INTO marketplace_video_item_links (
          platform, shop, api_shop_id, video_key, video_upload_id, post_id, item_id,
          item_name, custom_item_name, item_cover_image_url, min_price, max_price, stock,
          internal_sku, product_name, raw_data, synced_at, updated_at, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'),
          datetime('now', '+7 hours'), datetime('now', '+7 hours')
        )
      `).bind(
        platform,
        shop,
        apiShopId,
        videoKey,
        cleanVideoText(row.video_upload_id),
        cleanVideoText(row.post_id),
        itemId,
        cleanVideoText(item.item_name),
        cleanVideoText(item.custom_item_name),
        cleanVideoText(item.item_cover_image_url),
        numberValue(item.min_price),
        numberValue(item.max_price),
        numberValue(item.stock),
        internalSkus.join(', '),
        cleanVideoText(item.custom_item_name || item.item_name),
        compactJson(item)
      ).run()
      savedLinks += 1
    }
  }

  let prunedVideos = 0
  if (payload.prune_missing) {
    const keep = [...seenVideoKeys]
    if (keep.length) {
      const placeholders = keep.map(() => '?').join(', ')
      const pruneResult = await env.DB.prepare(`
        DELETE FROM marketplace_video_library
        WHERE platform = ? AND shop = ? AND list_type = ?
          AND video_key NOT IN (${placeholders})
      `).bind(platform, shop, listType, ...keep).run()
      prunedVideos = numberValue(pruneResult?.meta?.changes)
    } else {
      const pruneResult = await env.DB.prepare(`
        DELETE FROM marketplace_video_library
        WHERE platform = ? AND shop = ? AND list_type = ?
      `).bind(platform, shop, listType).run()
      prunedVideos = numberValue(pruneResult?.meta?.changes)
    }
  }

  return { saved_videos: savedVideos, saved_links: savedLinks, pruned_videos: prunedVideos }
}

export async function markMarketplaceVideosDeleted(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(payload.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(payload.shop)
  const postIds = [...new Set((Array.isArray(payload.post_ids) ? payload.post_ids : []).map(cleanVideoText).filter(Boolean))]
  const videoUploadIds = [...new Set((Array.isArray(payload.video_upload_ids) ? payload.video_upload_ids : []).map(cleanVideoText).filter(Boolean))]
  if (!platform || !shop || (!postIds.length && !videoUploadIds.length)) return { updated_videos: 0 }

  let updatedVideos = 0
  for (const postId of postIds) {
    const result = await env.DB.prepare(`
      UPDATE marketplace_video_library
      SET status = 400,
          status_label = 'Đã xóa',
          synced_at = datetime('now', '+7 hours'),
          updated_at = datetime('now', '+7 hours')
      WHERE platform = ? AND shop = ? AND post_id = ?
    `).bind(platform, shop, postId).run()
    updatedVideos += numberValue(result?.meta?.changes)
  }
  for (const videoUploadId of videoUploadIds) {
    const result = await env.DB.prepare(`
      UPDATE marketplace_video_library
      SET status = 400,
          status_label = 'Đã xóa',
          synced_at = datetime('now', '+7 hours'),
          updated_at = datetime('now', '+7 hours')
      WHERE platform = ? AND shop = ? AND video_upload_id = ?
    `).bind(platform, shop, videoUploadId).run()
    updatedVideos += numberValue(result?.meta?.changes)
  }

  return { updated_videos: updatedVideos }
}

export async function cleanupMarketplaceVideoLibraryBuckets(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(payload.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(payload.shop)
  if (!platform || !shop) return { removed_post_drafts: 0 }

  // Shopee đôi khi trả video nháp trong luồng list_type=post. Xóa bản cache sai bucket
  // để UI không hiểu nhầm nháp là video đã đăng; dòng draft chuẩn vẫn được lưu bằng video_upload_id.
  const result = await env.DB.prepare(`
    DELETE FROM marketplace_video_library
    WHERE platform = ?
      AND shop = ?
      AND list_type = 'post'
      AND status = 200
  `).bind(platform, shop).run()

  return { removed_post_drafts: numberValue(result?.meta?.changes) }
}

export async function saveMarketplaceVideoDashboard(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(payload.platform).toLowerCase()
  const shop = cleanVideoText(payload.shop)
  const apiShopId = cleanVideoText(payload.api_shop_id)
  const apiUserId = cleanVideoText(payload.api_user_id)
  const periodType = exactPeriodType(payload.period_type)
  const endDate = exactDateText(payload.end_date)
  if (!platform || !shop || !endDate) return null

  await env.DB.prepare(`
    INSERT INTO marketplace_video_dashboard_snapshots (
      platform, shop, api_shop_id, api_user_id, period_type, end_date,
      fetched_date_range, overview_json, trend_json, demographics_json,
      top_video_json, top_product_json, product_insight_json, warnings_json,
      synced_at, updated_at, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      datetime('now', '+7 hours'), datetime('now', '+7 hours'), datetime('now', '+7 hours')
    )
    ON CONFLICT(platform, shop, period_type, end_date) DO UPDATE SET
      api_shop_id = excluded.api_shop_id,
      api_user_id = excluded.api_user_id,
      fetched_date_range = excluded.fetched_date_range,
      overview_json = excluded.overview_json,
      trend_json = excluded.trend_json,
      demographics_json = excluded.demographics_json,
      top_video_json = excluded.top_video_json,
      top_product_json = excluded.top_product_json,
      product_insight_json = excluded.product_insight_json,
      warnings_json = excluded.warnings_json,
      synced_at = excluded.synced_at,
      updated_at = excluded.updated_at
  `).bind(
    platform,
    shop,
    apiShopId,
    apiUserId,
    periodType,
    endDate,
    cleanVideoText(payload.fetched_date_range),
    compactJson(normalizeOverview(payload.overview || {})),
    compactJson(normalizeTrendRows(payload.trend_rows || [])),
    compactJson(normalizeAudience(payload.demographics || {})),
    compactJson(normalizeVideoPerformanceRows(payload.top_video_rows || [])),
    compactJson(normalizeProductPerformanceRows(payload.top_product_rows || [])),
    compactJson(payload.product_insights || {}),
    compactJson(payload.warnings || [])
  ).run()

  return {
    platform,
    shop,
    period_type: periodType,
    end_date: endDate
  }
}

export async function saveMarketplaceVideoDetail(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(payload.platform).toLowerCase()
  const shop = cleanVideoText(payload.shop)
  const apiShopId = cleanVideoText(payload.api_shop_id)
  const apiUserId = cleanVideoText(payload.api_user_id)
  const videoKey = buildMarketplaceVideoKey(payload)
  if (!platform || !shop || !videoKey) return null

  await env.DB.prepare(`
    INSERT INTO marketplace_video_detail_snapshots (
      platform, shop, api_shop_id, api_user_id, video_key, video_upload_id, post_id,
      performance_json, metric_trend_json, audience_json, product_json, cover_list_json,
      warnings_json, synced_at, updated_at, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      datetime('now', '+7 hours'), datetime('now', '+7 hours'), datetime('now', '+7 hours')
    )
    ON CONFLICT(platform, shop, video_key) DO UPDATE SET
      api_shop_id = excluded.api_shop_id,
      api_user_id = excluded.api_user_id,
      video_upload_id = excluded.video_upload_id,
      post_id = excluded.post_id,
      performance_json = excluded.performance_json,
      metric_trend_json = excluded.metric_trend_json,
      audience_json = excluded.audience_json,
      product_json = excluded.product_json,
      cover_list_json = excluded.cover_list_json,
      warnings_json = excluded.warnings_json,
      synced_at = excluded.synced_at,
      updated_at = excluded.updated_at
  `).bind(
    platform,
    shop,
    apiShopId,
    apiUserId,
    videoKey,
    cleanVideoText(payload.video_upload_id),
    cleanVideoText(payload.post_id),
    compactJson(payload.performance || {}),
    compactJson(payload.metric_trend || {}),
    compactJson(normalizeAudience(payload.audience || {})),
    compactJson(payload.product_rows || []),
    compactJson(payload.cover_list || []),
    compactJson(payload.warnings || [])
  ).run()

  return { platform, shop, video_key: videoKey }
}

export async function patchMarketplaceVideoEditedCache(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(payload.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(payload.shop)
  const apiShopId = cleanVideoText(payload.api_shop_id)
  const videoKey = buildMarketplaceVideoKey(payload)
  const videoUploadId = cleanVideoText(payload.video_upload_id)
  const postId = cleanVideoText(payload.post_id)
  const caption = cleanVideoText(payload.caption)
  const coverImageUrl = cleanVideoText(payload.cover_image_url)
  const hasCaption = caption ? 1 : 0
  const hasCover = coverImageUrl ? 1 : 0
  const hasAllowDuet = payload.allow_duet === undefined || payload.allow_duet === null ? 0 : 1
  const hasAllowStitch = payload.allow_stitch === undefined || payload.allow_stitch === null ? 0 : 1
  const allowDuet = numberValue(payload.allow_duet) ? 1 : 0
  const allowStitch = numberValue(payload.allow_stitch) ? 1 : 0
  const hasItems = Array.isArray(payload.items)
  const itemRows = hasItems
    ? payload.items.map(item => ({
        item_id: cleanVideoText(item.item_id || item.itemId),
        item_name: cleanVideoText(item.item_name || item.itemName),
        custom_item_name: cleanVideoText(item.custom_item_name || item.customItemName || item.item_name || item.itemName),
        item_cover_image_url: cleanVideoText(item.item_cover_image_url || item.itemCoverImageUrl),
        min_price: numberValue(item.min_price || item.minPrice),
        max_price: numberValue(item.max_price || item.maxPrice),
        stock: numberValue(item.stock)
      })).filter(item => item.item_id)
    : []
  if (!platform || !shop || !videoKey) {
    return { patched: false, reason: 'missing_video_identity' }
  }

  // Sau lệnh sửa, API detail của Shopee có thể còn trả caption cũ trong vài giây.
  // Core vá lại cache theo payload đã được Shopee nhận để reload trang không hiện ngược dữ liệu cũ.
  const libraryResult = await env.DB.prepare(`
    UPDATE marketplace_video_library
    SET
      caption = CASE WHEN ? THEN ? ELSE caption END,
      cover_image_url = CASE WHEN ? THEN ? ELSE cover_image_url END,
      allow_duet = CASE WHEN ? THEN ? ELSE allow_duet END,
      allow_stitch = CASE WHEN ? THEN ? ELSE allow_stitch END,
      item_count = CASE WHEN ? THEN ? ELSE item_count END,
      updated_at = datetime('now', '+7 hours')
    WHERE platform = ? AND shop = ? AND video_key = ?
  `).bind(
    hasCaption,
    caption,
    hasCover,
    coverImageUrl,
    hasAllowDuet,
    allowDuet,
    hasAllowStitch,
    allowStitch,
    hasItems ? 1 : 0,
    itemRows.length,
    platform,
    shop,
    videoKey
  ).run()

  let savedLinks = 0
  if (hasItems) {
    await env.DB.prepare(`
      DELETE FROM marketplace_video_item_links
      WHERE platform = ? AND shop = ? AND video_key = ?
    `).bind(platform, shop, videoKey).run()

    const { results: variationRows } = await env.DB.prepare(`
      SELECT platform, shop, platform_item_id, internal_sku
      FROM product_variations
      WHERE platform = ? AND shop = ?
    `).bind(platform, shop).all()
    const internalSkuMap = buildInternalSkuMap(variationRows || [])

    for (const item of itemRows) {
      const mapKey = `${platform}|${shop}|${item.item_id}`
      const internalSkus = [...(internalSkuMap.get(mapKey) || new Set())]
      await env.DB.prepare(`
        INSERT INTO marketplace_video_item_links (
          platform, shop, api_shop_id, video_key, video_upload_id, post_id, item_id,
          item_name, custom_item_name, item_cover_image_url, min_price, max_price, stock,
          internal_sku, product_name, raw_data, synced_at, updated_at, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'),
          datetime('now', '+7 hours'), datetime('now', '+7 hours')
        )
      `).bind(
        platform,
        shop,
        apiShopId,
        videoKey,
        videoUploadId,
        postId,
        item.item_id,
        item.item_name,
        item.custom_item_name,
        item.item_cover_image_url,
        item.min_price,
        item.max_price,
        item.stock,
        internalSkus.join(', '),
        cleanVideoText(item.custom_item_name || item.item_name),
        compactJson(item)
      ).run()
      savedLinks += 1
    }
  }

  const detailRow = await env.DB.prepare(`
    SELECT performance_json, cover_list_json
    FROM marketplace_video_detail_snapshots
    WHERE platform = ? AND shop = ? AND video_key = ?
    LIMIT 1
  `).bind(platform, shop, videoKey).first()
  if (detailRow) {
    const performance = parseJsonText(detailRow.performance_json, {})
    const videoInfo = { ...(performance.video_info || {}) }
    if (hasCaption) videoInfo.caption = caption
    if (hasCover) videoInfo.cover_image_url = coverImageUrl
    performance.video_info = videoInfo

    let coverList = parseJsonText(detailRow.cover_list_json, [])
    if (!Array.isArray(coverList)) coverList = []
    if (hasCover) coverList = [coverImageUrl, ...coverList.filter(item => cleanVideoText(item) && cleanVideoText(item) !== coverImageUrl)]

    await env.DB.prepare(`
      UPDATE marketplace_video_detail_snapshots
      SET performance_json = ?, cover_list_json = ?, updated_at = datetime('now', '+7 hours')
      WHERE platform = ? AND shop = ? AND video_key = ?
    `).bind(
      compactJson(performance),
      compactJson(coverList),
      platform,
      shop,
      videoKey
    ).run()
  }

  return {
    patched: true,
    video_key: videoKey,
    updated_library: numberValue(libraryResult?.meta?.changes),
    saved_links: savedLinks
  }
}
