import { getShopeeVideoAppFromRow, shopeeVideoShopId } from '../../core/shopee-video-auth-core.js'
import { cleanupMarketplaceVideoLibraryBuckets, readMarketplaceVideoDetail, saveMarketplaceVideoActionLog, saveMarketplaceVideoDashboard, saveMarketplaceVideoDetail, saveMarketplaceVideoLibrary } from '../../core/video-analytics-core.js'
import { bufferMd5Hex, safeVideoFileName, validateVideoUploadDuration } from './campaign-title.js'
import { assertShopeeVideoWriteSucceeded, buildEditVideoBody } from './lazada-media.js'
import { buildVideoInsights, callShopeeMediaSpaceForm, callShopeeMediaSpaceGet, callShopeeMediaSpacePost, callShopeePublicForm, callShopeePublicPost, callShopeeVideoGet, callShopeeVideoPost, normalizeAudience, normalizeOverview, normalizeTopProductRows, normalizeTopVideoRows, normalizeTrendRows, normalizeVideoListRows, shopeeVideoIdentityWarning, videoShopLabel, videoUserId } from './shared-api-client.js'
import { cleanVideoText, defaultEndDate, exactDateText, exactPeriodType, numberValue, SHOPEE_MEDIA_COMPLETE_VIDEO_UPLOAD_PATH, SHOPEE_MEDIA_INIT_VIDEO_UPLOAD_PATH, SHOPEE_MEDIA_SPACE_COMPLETE_VIDEO_UPLOAD_PATH, SHOPEE_MEDIA_SPACE_GET_VIDEO_UPLOAD_RESULT_PATH, SHOPEE_MEDIA_SPACE_INIT_VIDEO_UPLOAD_PATH, SHOPEE_MEDIA_SPACE_MAX_VIDEO_BYTES, SHOPEE_MEDIA_SPACE_UPLOAD_VIDEO_PART_PATH, SHOPEE_MEDIA_SPACE_VIDEO_PART_BYTES, SHOPEE_MEDIA_UPLOAD_VIDEO_PART_PATH, SHOPEE_VIDEO_COVER_LIST_PATH, SHOPEE_VIDEO_DETAIL_AUDIENCE_PATH, SHOPEE_VIDEO_DETAIL_PATH, SHOPEE_VIDEO_DETAIL_PERFORMANCE_PATH, SHOPEE_VIDEO_DETAIL_PRODUCT_PATH, SHOPEE_VIDEO_DETAIL_TREND_PATH, SHOPEE_VIDEO_EDIT_PATH, SHOPEE_VIDEO_LIST_PATH, SHOPEE_VIDEO_OVERVIEW_PATH, SHOPEE_VIDEO_PERFORMANCE_LIST_PATH, SHOPEE_VIDEO_POST_PATH, SHOPEE_VIDEO_PRODUCT_PERFORMANCE_LIST_PATH, SHOPEE_VIDEO_TREND_PATH, SHOPEE_VIDEO_USER_DEMOGRAPHICS_PATH, shopeeMainApiReady, shopeeVideoMediaEndpointFlow, sleep, validVideoCoverImageUrl, validVideoCoverImageUrlsForVideo, VIDEO_DETAIL_TREND_METRICS, videoCoverImageUrlForVideo } from './shared-base.js'
import { pollVideoUploadResult } from './write-handlers.js'

export async function uploadShopeeVideoFromBuffer(env, shop, payload = {}) {
  const identityWarning = shopeeVideoIdentityWarning(shop)
  if (identityWarning) throw new Error(identityWarning)

  const app = getShopeeVideoAppFromRow(shop)
  if (!app) throw new Error('Shop chưa lưu Partner ID/Key riêng cho Shopee Video.')
  const arrayBuffer = payload.arrayBuffer
  if (!arrayBuffer || typeof arrayBuffer.byteLength !== 'number') throw new Error('Thiếu dữ liệu file video để upload.')

  const shopName = videoShopLabel(shop)
  const fileName = safeVideoFileName(payload.fileName || 'video.mp4')
  const fileSize = arrayBuffer.byteLength
  const durationSeconds = validateVideoUploadDuration(payload.durationSeconds)
  const initData = await callShopeePublicPost(app, SHOPEE_MEDIA_INIT_VIDEO_UPLOAD_PATH, {
    business: 3,
    scene: 1,
    file_name: fileName,
    file_size: fileSize,
    duration: durationSeconds
  })
  const response = initData?.response || {}
  const videoUploadId = cleanVideoText(response.video_upload_id)
  const partSize = Math.max(1, numberValue(response.part_size))
  if (!videoUploadId || !partSize) throw new Error('Shopee không trả về video_upload_id hoặc part_size.')

  const bytes = new Uint8Array(arrayBuffer)
  let partSeq = 0
  for (let offset = 0; offset < bytes.length; offset += partSize) {
    const chunk = bytes.slice(offset, Math.min(offset + partSize, bytes.length))
    const formData = new FormData()
    formData.set('part_content', new File([chunk], `${fileName}.part${partSeq}`))
    await callShopeePublicForm(app, SHOPEE_MEDIA_UPLOAD_VIDEO_PART_PATH, {
      video_upload_id: videoUploadId,
      part_seq: partSeq,
      part_md5: bufferMd5Hex(chunk.buffer)
    }, formData)
    partSeq += 1
  }

  await callShopeePublicPost(app, SHOPEE_MEDIA_COMPLETE_VIDEO_UPLOAD_PATH, {
    video_upload_id: videoUploadId
  })
  const uploadResult = await pollVideoUploadResult(app, videoUploadId)
  const coverData = await callShopeeVideoGet(env, shop, SHOPEE_VIDEO_COVER_LIST_PATH, { video_upload_id: videoUploadId })
  const coverList = validVideoCoverImageUrlsForVideo(coverData?.response?.image_url_list, videoUploadId)
  const coverImageUrl = videoCoverImageUrlForVideo(payload.coverImageUrl, videoUploadId) ||
    coverList[0] ||
    videoCoverImageUrlForVideo(uploadResult?.video_info?.video_thumbnail_url, videoUploadId) ||
    validVideoCoverImageUrl(uploadResult?.video_info?.video_thumbnail_url)
  if (!coverImageUrl) throw new Error('Shopee chưa trả ảnh cover để đăng video.')

  const itemRows = Array.isArray(payload.itemRows) ? payload.itemRows : []
  const editBody = buildEditVideoBody({
    video_upload_id: videoUploadId,
    caption: cleanVideoText(payload.caption),
    cover_image_url: coverImageUrl,
    items: itemRows,
    allow_duet: numberValue(payload.allowDuet ?? 1) ? 1 : 0,
    allow_stitch: numberValue(payload.allowStitch ?? 1) ? 1 : 0,
    scheduled_post: 0
  })
  const editResult = await callShopeeVideoPost(env, shop, SHOPEE_VIDEO_EDIT_PATH, editBody)
  const editCheck = assertShopeeVideoWriteSucceeded(editResult, [videoUploadId], 'edit_video_info')
  const postResult = await callShopeeVideoPost(env, shop, SHOPEE_VIDEO_POST_PATH, {
    video_upload_id_list: [videoUploadId]
  })
  const postCheck = assertShopeeVideoWriteSucceeded(postResult, [videoUploadId], 'post_video')
  await syncShopeeVideoDashboardShop(env, shop, {
    period_type: 'Last7d',
    end_date: defaultEndDate()
  }).catch(() => null)
  const detail = await syncShopeeVideoDetail(env, shop, { video_upload_id: videoUploadId }).catch(() => null)

  const result = {
    video_upload_id: videoUploadId,
    media_endpoint_family: 'Media',
    media_endpoint_flow: shopeeVideoMediaEndpointFlow().map(item => item.path),
    cover_list: coverList,
    upload_result: uploadResult,
    edit_result: editResult,
    edit_check: editCheck,
    post_result: postResult,
    post_check: postCheck,
    detail
  }
  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: shopeeVideoShopId(shop),
    action_type: cleanVideoText(payload.actionType || 'upload_post_video'),
    action_status: 'ok',
    request_payload: {
      queue_id: cleanVideoText(payload.queueId),
      file_name: fileName,
      file_size: fileSize,
      duration_seconds: durationSeconds,
      caption: cleanVideoText(payload.caption),
      item_ids_json: itemRows,
      scheduled_at: cleanVideoText(payload.scheduledAt)
    },
    result_payload: result,
    note: cleanVideoText(payload.note || 'Tải và đăng video mới lên Shopee Video')
  })

  return result
}

export async function pollShopeeMediaSpaceVideoResult(env, shop, videoUploadId, maxRounds = 8) {
  for (let round = 0; round < maxRounds; round += 1) {
    const data = await callShopeeMediaSpaceGet(env, shop, SHOPEE_MEDIA_SPACE_GET_VIDEO_UPLOAD_RESULT_PATH, { video_upload_id: videoUploadId })
    const response = data?.response || {}
    const status = cleanVideoText(response.status)
    if (status === 'SUCCEEDED') return response
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(cleanVideoText(response.message || response.reason) || `MediaSpace xử lý video thất bại với trạng thái ${status}`)
    }
    if (round < maxRounds - 1) await sleep(1500)
  }
  throw new Error('Shopee MediaSpace vẫn chưa xử lý xong video. Hãy thử lại sau ít phút.')
}

export async function uploadShopeeMediaSpaceVideoFromBuffer(env, shop, payload = {}) {
  if (!shopeeMainApiReady(shop)) throw new Error('Shop chưa có API chính để gọi Shopee MediaSpace.')
  const arrayBuffer = payload.arrayBuffer
  if (!arrayBuffer || typeof arrayBuffer.byteLength !== 'number') throw new Error('Thiếu dữ liệu file video MediaSpace.')
  const fileSize = arrayBuffer.byteLength
  if (fileSize > SHOPEE_MEDIA_SPACE_MAX_VIDEO_BYTES) {
    throw new Error('Shopee MediaSpace chỉ nhận video tối đa 30MB cho luồng sản phẩm.')
  }
  const duration = numberValue(payload.durationSeconds)
  if (duration && (duration < 10 || duration > 60)) {
    throw new Error('Shopee MediaSpace video sản phẩm yêu cầu thời lượng từ 10 đến 60 giây.')
  }

  const fileName = safeVideoFileName(payload.fileName || 'product-video.mp4')
  const bytes = new Uint8Array(arrayBuffer)
  const fileMd5 = bufferMd5Hex(bytes)
  const initData = await callShopeeMediaSpacePost(env, shop, SHOPEE_MEDIA_SPACE_INIT_VIDEO_UPLOAD_PATH, {
    file_size: fileSize,
    file_md5: fileMd5
  })
  const videoUploadId = cleanVideoText(initData?.response?.video_upload_id)
  if (!videoUploadId) throw new Error('Shopee MediaSpace không trả video_upload_id.')

  const startAt = Date.now()
  const partSeqList = []
  for (let offset = 0; offset < bytes.length; offset += SHOPEE_MEDIA_SPACE_VIDEO_PART_BYTES) {
    const partSeq = partSeqList.length
    const chunk = bytes.slice(offset, Math.min(offset + SHOPEE_MEDIA_SPACE_VIDEO_PART_BYTES, bytes.length))
    const formData = new FormData()
    formData.set('part_content', new File([chunk], `${fileName}.part${partSeq}`))
    await callShopeeMediaSpaceForm(env, shop, SHOPEE_MEDIA_SPACE_UPLOAD_VIDEO_PART_PATH, {
      video_upload_id: videoUploadId,
      part_seq: partSeq,
      content_md5: bufferMd5Hex(chunk)
    }, formData)
    partSeqList.push(partSeq)
  }

  await callShopeeMediaSpacePost(env, shop, SHOPEE_MEDIA_SPACE_COMPLETE_VIDEO_UPLOAD_PATH, {
    video_upload_id: videoUploadId,
    part_seq_list: partSeqList,
    report_data: {
      upload_cost: Math.max(1, Date.now() - startAt)
    }
  })
  const uploadResult = await pollShopeeMediaSpaceVideoResult(env, shop, videoUploadId)
  const result = {
    video_upload_id: videoUploadId,
    file_md5: fileMd5,
    part_seq_list: partSeqList,
    upload_result: uploadResult
  }
  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: videoShopLabel(shop),
    api_shop_id: cleanVideoText(shop.api_shop_id),
    action_type: 'shopee_media_space_upload_video',
    action_status: 'ok',
    request_payload: {
      file_name: fileName,
      file_size: fileSize,
      duration_seconds: duration || '',
      endpoint_family: 'MediaSpace'
    },
    result_payload: result,
    note: 'Upload video sản phẩm lên Shopee MediaSpace; chưa tự gắn vào bài đăng nếu chưa qua module publish/update có preview.'
  })
  return result
}

export async function listShopeeVideoPages(env, shop, listType, options = {}) {
  const pageSize = Math.min(Math.max(Number(options.page_size || 20) || 20, 1), 20)
  const syncAll = Number(options.sync_all || options.syncAll || 0) === 1 || cleanVideoText(options.sync_scope) === 'all'
  const defaultMaxPages = syncAll ? 50 : 3
  const maxPages = Math.min(Math.max(Number(options.max_pages || defaultMaxPages) || defaultMaxPages, 1), 60)
  const startPage = Math.max(Number(options.start_page || options.startPage || 1) || 1, 1)
  const rows = []
  let pageNo = startPage
  let pagesFetched = 0
  let hasMore = false
  let totalCount = 0
  do {
    const data = await callShopeeVideoGet(env, shop, SHOPEE_VIDEO_LIST_PATH, {
      page_no: pageNo,
      page_size: pageSize,
      list_type: listType
    })
    const response = data?.response || {}
    const list = normalizeVideoListRows(response.list || [], listType === 1 ? 'draft' : 'post')
    rows.push(...list)
    pagesFetched += 1
    totalCount = numberValue(response.total_count || totalCount)
    hasMore = Boolean(response.has_more)
    pageNo += 1
  } while (hasMore && pagesFetched < maxPages)
  return {
    rows,
    start_page: startPage,
    next_page: pageNo,
    pages: pagesFetched,
    page_size: pageSize,
    total_count: totalCount,
    complete: !hasMore,
    has_more: hasMore
  }
}

export async function syncShopeeVideoDashboardShop(env, shop, options = {}) {
  const shopName = videoShopLabel(shop)
  const videoApiShopId = shopeeVideoShopId(shop)
  const videoApiUserId = videoUserId(shop)
  const result = {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: videoApiShopId,
    api_user_id: videoApiUserId,
    ok: false,
    saved_library: 0,
    saved_dashboard: 0,
    warnings: []
  }
  const identityWarning = shopeeVideoIdentityWarning(shop)
  if (identityWarning) {
    result.warnings.push({ stage: 'identity', message: identityWarning })
    return result
  }

  const periodType = exactPeriodType(options.period_type)
  const endDate = exactDateText(options.end_date) || defaultEndDate()
  const listScope = cleanVideoText(options.list_scope || options.list_type || 'all')
  const syncDraftList = listScope === 'all' || listScope === 'draft'
  const syncPostList = listScope === 'all' || listScope === 'post'
  const draftScan = syncDraftList
    ? await listShopeeVideoPages(env, shop, 1, options).catch(error => {
      result.warnings.push({ stage: 'get_video_list_draft', message: error.message })
      return { rows: [], pages: 0, total_count: 0, complete: false, has_more: false }
    })
    : { rows: [], pages: 0, total_count: 0, complete: true, has_more: false }
  const postScan = syncPostList
    ? await listShopeeVideoPages(env, shop, 2, options).catch(error => {
      result.warnings.push({ stage: 'get_video_list_post', message: error.message })
      return { rows: [], pages: 0, total_count: 0, complete: false, has_more: false }
    })
    : { rows: [], pages: 0, total_count: 0, complete: true, has_more: false }
  const draftRows = draftScan.rows || []
  const rawPostRows = postScan.rows || []
  const postRows = rawPostRows.filter(row => numberValue(row.status) === 300)
  const postDraftRows = rawPostRows.filter(row => numberValue(row.status) === 200)
  result.library_scan = {
    draft: {
      rows: draftRows.length,
      pages: numberValue(draftScan.pages),
      start_page: numberValue(draftScan.start_page),
      next_page: numberValue(draftScan.next_page),
      total_count: numberValue(draftScan.total_count),
      complete: Boolean(draftScan.complete),
      has_more: Boolean(draftScan.has_more)
    },
    post: {
      rows: rawPostRows.length,
      saved_rows: postRows.length,
      draft_rows_skipped: postDraftRows.length,
      pages: numberValue(postScan.pages),
      start_page: numberValue(postScan.start_page),
      next_page: numberValue(postScan.next_page),
      total_count: numberValue(postScan.total_count),
      complete: Boolean(postScan.complete),
      has_more: Boolean(postScan.has_more)
    }
  }
  if (postDraftRows.length) {
    result.warnings.push({
      stage: 'get_video_list_post_has_draft_rows',
      message: `Shopee trả ${postDraftRows.length} video nháp trong danh sách đã đăng; OMS đã tách sang tab Bản nháp để tránh xoá/đếm nhầm.`
    })
  }
  if (syncDraftList && !draftScan.complete) {
    result.warnings.push({ stage: 'get_video_list_draft_partial', message: 'Chưa quét hết bản nháp Shopee Video; OMS giữ cache cũ để không mất dữ liệu.' })
  }
  if (syncPostList && !postScan.complete) {
    result.warnings.push({ stage: 'get_video_list_post_partial', message: 'Chưa quét hết video đã đăng Shopee; bấm Tải lại toàn bộ Shopee để quét tiếp các trang cũ.' })
  }
  const saveDraft = syncDraftList ? await saveMarketplaceVideoLibrary(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: videoApiShopId,
    api_user_id: videoApiUserId,
    list_type: 'draft',
    rows: draftRows,
    prune_missing: Boolean(draftScan.complete) && numberValue(draftScan.start_page || 1) === 1
  }) : { saved_videos: 0, saved_links: 0, pruned_videos: 0 }
  const savePost = syncPostList ? await saveMarketplaceVideoLibrary(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: videoApiShopId,
    api_user_id: videoApiUserId,
    list_type: 'post',
    rows: postRows,
    prune_missing: Boolean(postScan.complete) && numberValue(postScan.start_page || 1) === 1
  }) : { saved_videos: 0, saved_links: 0, pruned_videos: 0 }
  const cleanupResult = syncPostList
    ? await cleanupMarketplaceVideoLibraryBuckets(env, { platform: 'shopee', shop: shopName })
    : { removed_post_drafts: 0 }
  result.saved_draft_library = numberValue(saveDraft.saved_videos)
  result.saved_post_library = numberValue(savePost.saved_videos)
  result.saved_library = numberValue(saveDraft.saved_videos) + numberValue(savePost.saved_videos)
  result.pruned_library = numberValue(saveDraft.pruned_videos) + numberValue(savePost.pruned_videos)
  result.cleanup_library = cleanupResult

  if (Number(options.library_only || options.libraryOnly || 0) === 1) {
    result.ok = result.saved_library > 0 || syncDraftList || syncPostList
    return result
  }

  const [overviewData, trendData, demographicsData, topVideoData, topProductData] = await Promise.all([
    callShopeeVideoGet(env, shop, SHOPEE_VIDEO_OVERVIEW_PATH, { period_type: periodType, end_date: endDate }).catch(error => ({ __error: error.message })),
    callShopeeVideoGet(env, shop, SHOPEE_VIDEO_TREND_PATH, { period_type: periodType, end_date: endDate }).catch(error => ({ __error: error.message })),
    callShopeeVideoGet(env, shop, SHOPEE_VIDEO_USER_DEMOGRAPHICS_PATH, {}).catch(error => ({ __error: error.message })),
    callShopeeVideoGet(env, shop, SHOPEE_VIDEO_PERFORMANCE_LIST_PATH, {
      page_no: 1,
      page_size: Math.min(Math.max(Number(options.top_video_limit || 20) || 20, 1), 20),
      period_type: periodType,
      end_date: endDate,
      order_by: cleanVideoText(options.video_order_by || 'Views'),
      sort: cleanVideoText(options.video_sort || 'desc') || 'desc'
    }).catch(error => ({ __error: error.message })),
    callShopeeVideoGet(env, shop, SHOPEE_VIDEO_PRODUCT_PERFORMANCE_LIST_PATH, {
      page_no: 1,
      page_size: Math.min(Math.max(Number(options.top_product_limit || 20) || 20, 1), 20),
      period_type: periodType,
      end_date: endDate,
      order_by: cleanVideoText(options.product_order_by || 'PlacedSales'),
      sort: cleanVideoText(options.product_sort || 'desc') || 'desc'
    }).catch(error => ({ __error: error.message }))
  ])

  for (const [stage, data] of [
    ['get_overview_performance', overviewData],
    ['get_metric_trend', trendData],
    ['get_user_demographics', demographicsData],
    ['get_video_performance_list', topVideoData],
    ['get_prodcut_performance_list', topProductData]
  ]) {
    if (data?.__error) result.warnings.push({ stage, message: data.__error })
  }

  const topVideoRows = normalizeTopVideoRows(topVideoData?.response?.list || [])
  const topProductRows = normalizeTopProductRows(topProductData?.response?.list || [])
  const productInsights = {
    ...buildVideoInsights(topVideoRows)
  }

  await saveMarketplaceVideoDashboard(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: videoApiShopId,
    api_user_id: videoApiUserId,
    period_type: periodType,
    end_date: endDate,
    fetched_date_range: cleanVideoText(overviewData?.response?.fetched_date_range || topVideoRows?.[0]?.fetched_date_range || topProductRows?.[0]?.fetched_date_range),
    overview: normalizeOverview(overviewData?.response || {}),
    trend_rows: normalizeTrendRows(trendData?.response?.video_total_metric_list || []),
    demographics: normalizeAudience(demographicsData?.response || {}),
    top_video_rows: topVideoRows,
    top_product_rows: topProductRows,
    product_insights: productInsights,
    warnings: result.warnings
  })
  result.saved_dashboard = 1
  result.ok = result.saved_library > 0 || result.saved_dashboard > 0
  return result
}

export async function syncShopeeVideoDetail(env, shop, options = {}) {
  const shopName = videoShopLabel(shop)
  const videoApiShopId = shopeeVideoShopId(shop)
  const videoApiUserId = videoUserId(shop)
  const videoUploadId = cleanVideoText(options.video_upload_id)
  const postId = cleanVideoText(options.post_id)
  if (!videoUploadId && !postId) throw new Error('Thiếu video_upload_id hoặc post_id để lấy chi tiết video.')
  const identityWarning = shopeeVideoIdentityWarning(shop)
  if (identityWarning) throw new Error(identityWarning)

  // Shopee Video detail chỉ cho chọn một khóa tra cứu. Dòng đã đăng thường có post_id,
  // còn video mới upload hoặc draft có thể chỉ có video_upload_id.
  const detailLookup = postId
    ? { post_id: postId }
    : { video_upload_id: videoUploadId }
  const detailData = await callShopeeVideoGet(env, shop, SHOPEE_VIDEO_DETAIL_PATH, detailLookup)
  const detail = detailData?.response || {}
  const finalVideoUploadId = cleanVideoText(detail.video_upload_id || videoUploadId)
  const finalPostId = cleanVideoText(detail.post_id || postId)

  const [performanceData, audienceData, coverData] = await Promise.all([
    finalPostId
      ? callShopeeVideoGet(env, shop, SHOPEE_VIDEO_DETAIL_PERFORMANCE_PATH, { post_id: finalPostId }).catch(error => ({ __error: error.message }))
      : Promise.resolve({}),
    finalPostId
      ? callShopeeVideoGet(env, shop, SHOPEE_VIDEO_DETAIL_AUDIENCE_PATH, { post_id: finalPostId }).catch(error => ({ __error: error.message }))
      : Promise.resolve({}),
    finalVideoUploadId
      ? callShopeeVideoGet(env, shop, SHOPEE_VIDEO_COVER_LIST_PATH, { video_upload_id: finalVideoUploadId }).catch(error => ({ __error: error.message }))
      : Promise.resolve({})
  ])

  const metricTrend = {}
  const warnings = []
  for (const metricName of VIDEO_DETAIL_TREND_METRICS) {
    if (!finalPostId) break
    try {
      const data = await callShopeeVideoGet(env, shop, SHOPEE_VIDEO_DETAIL_TREND_PATH, {
        post_id: finalPostId,
        metric_name: metricName
      })
      metricTrend[metricName] = data?.response?.metric_trend || {}
    } catch (error) {
      warnings.push({ stage: `get_video_detail_metric_trend:${metricName}`, message: error.message })
    }
  }

  let productRows = []
  if (finalPostId) {
    try {
      const productData = await callShopeeVideoGet(env, shop, SHOPEE_VIDEO_DETAIL_PRODUCT_PATH, {
        page_no: 1,
        page_size: 20,
        post_id: finalPostId
      })
      productRows = Array.isArray(productData?.response?.list) ? productData.response.list : []
    } catch (error) {
      warnings.push({ stage: 'get_video_detail_product_performance', message: error.message })
    }
  }

  for (const [stage, data] of [
    ['get_video_detail_performance', performanceData],
    ['get_video_detail_audience_distribution', audienceData],
    ['get_cover_list', coverData]
  ]) {
    if (data?.__error) warnings.push({ stage, message: data.__error })
  }

  await saveMarketplaceVideoDetail(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: videoApiShopId,
    api_user_id: videoApiUserId,
    video_upload_id: finalVideoUploadId,
    post_id: finalPostId,
    performance: {
      video_info: performanceData?.response?.video_info || detail,
      video_performance: performanceData?.response?.video_performance || {}
    },
    metric_trend: metricTrend,
    audience: audienceData?.response || {},
    product_rows: productRows,
    cover_list: Array.isArray(coverData?.response?.image_url_list) ? coverData.response.image_url_list.map(validVideoCoverImageUrl).filter(Boolean) : [],
    warnings
  })

  return readMarketplaceVideoDetail(env, {
    platform: 'shopee',
    shop: shopName,
    video_upload_id: finalVideoUploadId,
    post_id: finalPostId
  })
}
