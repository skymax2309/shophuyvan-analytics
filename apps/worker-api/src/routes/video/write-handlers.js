import { shopeeVideoShopId } from '../../core/shops/shopee-video-auth-core.js'
import { markMarketplaceVideosDeleted, patchMarketplaceVideoEditedCache, readMarketplaceVideoDetail, readMarketplaceVideoLibrary, saveMarketplaceVideoActionLog } from '../../core/video/analytics-core.js'
import { parseVideoItemRows } from './campaign-title.js'
import { assertShopeeVideoWriteSucceeded, buildEditVideoBody, loadShopeeVideoShop, resolveEditVideoCoverImageUrl } from './lazada-media.js'
import { callShopeeVideoPost, callShopeeVideoPostRaw, chunkVideoIds, fetchShopeeJson, shopeePublicUrlBuilder, uniqueTextList, videoUserId } from './shared-api-client.js'
import { cleanVideoText, defaultEndDate, exactDateText, exactPeriodType, json, numberValue, SHOPEE_MEDIA_GET_VIDEO_UPLOAD_RESULT_PATH, SHOPEE_VIDEO_DELETE_PATH, SHOPEE_VIDEO_EDIT_PATH, sleep } from './shared-base.js'
import { syncShopeeVideoDashboardShop, syncShopeeVideoDetail, uploadShopeeVideoFromBuffer } from './shopee-sync.js'

export async function resolveVideoUploadId(env, shop, payload = {}) {
  const videoUploadId = cleanVideoText(payload.video_upload_id || payload.videoUploadId)
  if (videoUploadId) return videoUploadId
  const postId = cleanVideoText(payload.post_id || payload.postId)
  if (!postId) return ''
  const detail = await syncShopeeVideoDetail(env, shop, { post_id: postId })
  return cleanVideoText(detail?.video_upload_id)
}

export function shopeeVideoRowIsPosted(row = {}) {
  const status = numberValue(row.status)
  const listType = cleanVideoText(row.list_type).toLowerCase()
  const postId = cleanVideoText(row.post_id || row.postId)
  if (status === 300 || listType === 'post') return true
  if (postId && status !== 200 && listType !== 'draft') return true
  return false
}

export async function resolveShopeeVideoEditEligibility(env, shopName, payload = {}, videoUploadId = '') {
  const inlineRow = {
    status: payload.status,
    list_type: payload.list_type || payload.listType,
    post_id: payload.post_id || payload.postId,
    video_upload_id: videoUploadId || payload.video_upload_id || payload.videoUploadId
  }
  if (shopeeVideoRowIsPosted(inlineRow)) {
    return {
      can_edit: false,
      reason: 'Shopee Video API chỉ cho sửa tiêu đề/cover/sản phẩm trước khi video được đăng. Video đã đăng cần xóa rồi đăng lại hoặc sửa trên Seller Center nếu sàn cho phép.'
    }
  }

  const library = await readMarketplaceVideoLibrary(env, {
    platform: 'shopee',
    shop: shopName,
    list_type: 'all',
    limit: 500
  }).catch(() => null)
  const row = (library?.rows || []).find(item =>
    (videoUploadId && cleanVideoText(item.video_upload_id) === videoUploadId) ||
    (cleanVideoText(inlineRow.post_id) && cleanVideoText(item.post_id) === cleanVideoText(inlineRow.post_id))
  )
  if (row && shopeeVideoRowIsPosted(row)) {
    return {
      can_edit: false,
      row,
      reason: 'Shopee Video API chỉ cho sửa thông tin bản nháp/chưa đăng. Video này đã ở trạng thái đã đăng nên OMS khóa lệnh sửa API để tránh lỗi.'
    }
  }
  return { can_edit: true, row: row || null }
}

export async function handleVideoEdit(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const shopName = cleanVideoText(body.shop)
  let shop = null
  try {
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop để sửa video.' }, cors, 400)
  shop = await loadShopeeVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
  const finalVideoUploadId = await resolveVideoUploadId(env, shop, body)
  const eligibility = await resolveShopeeVideoEditEligibility(env, shopName, body, finalVideoUploadId)
  if (!eligibility.can_edit) {
    return json({
      status: Number(body.dry_run || 0) === 1 ? 'blocked' : 'error',
      dry_run: Number(body.dry_run || 0) === 1,
      can_edit: false,
      message: eligibility.reason,
      endpoint: SHOPEE_VIDEO_EDIT_PATH
    }, cors, Number(body.dry_run || 0) === 1 ? 200 : 400)
  }
  const coverImageUrl = await resolveEditVideoCoverImageUrl(env, shop, body, finalVideoUploadId)
  const editBody = buildEditVideoBody({
    ...body,
    video_upload_id: finalVideoUploadId,
    cover_image_url: coverImageUrl
  })
  if (Number(body.dry_run || 0) === 1) {
    return json({
      status: 'ok',
      dry_run: true,
      can_edit: true,
      endpoint: SHOPEE_VIDEO_EDIT_PATH,
      edit_body: editBody
    }, cors)
  }
  const result = await callShopeeVideoPost(env, shop, SHOPEE_VIDEO_EDIT_PATH, editBody)
  const writeCheck = assertShopeeVideoWriteSucceeded(result, [finalVideoUploadId], 'edit_video_info')
  const detail = await syncShopeeVideoDetail(env, shop, {
    video_upload_id: finalVideoUploadId,
    post_id: body.post_id
  }).catch(() => null)
  const editVideoInfo = editBody.video_upload_list?.[0] || {}
  const cachePatch = await patchMarketplaceVideoEditedCache(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: shopeeVideoShopId(shop),
    api_user_id: videoUserId(shop),
    video_upload_id: finalVideoUploadId,
    post_id: cleanVideoText(detail?.post_id || body.post_id),
    caption: editVideoInfo.caption,
    cover_image_url: editVideoInfo.cover_image_url,
    items: Array.isArray(body.items) ? body.items : editVideoInfo.item_info,
    allow_duet: editVideoInfo.allow_info?.allow_duet ? 1 : 0,
    allow_stitch: editVideoInfo.allow_info?.allow_stitch ? 1 : 0
  }).catch(error => ({ patched: false, error: cleanVideoText(error?.message) }))
  const patchedDetail = await readMarketplaceVideoDetail(env, {
    platform: 'shopee',
    shop: shopName,
    video_upload_id: finalVideoUploadId,
    post_id: cleanVideoText(detail?.post_id || body.post_id)
  }).catch(() => detail)

  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: shopeeVideoShopId(shop),
    action_type: 'edit_video_info',
    action_status: 'ok',
    request_payload: body,
    result_payload: { result, write_check: writeCheck, detail: patchedDetail || detail, cache_patch: cachePatch },
    note: 'Sửa tiêu đề, cover, sản phẩm liên kết và thông tin video Shopee'
  })

  return json({
    status: 'ok',
    message: 'Đã gửi lệnh sửa thông tin video lên Shopee.',
    result,
    write_check: writeCheck,
    detail: patchedDetail || detail
  }, cors)
  } catch (error) {
    const message = cleanVideoText(error?.message) || 'Không sửa được thông tin video.'
    if (shopName) {
      await saveMarketplaceVideoActionLog(env, {
        platform: 'shopee',
        shop: shopName,
        api_shop_id: shop ? shopeeVideoShopId(shop) : '',
        action_type: 'edit_video_info',
        action_status: 'error',
        request_payload: body,
        result_payload: { error: message },
        note: 'Sửa video lỗi, trả JSON về UI để người vận hành thấy nguyên nhân thay vì lỗi fetch chung.'
      }).catch(() => null)
    }
    return json({
      status: 'error',
      message: `Không sửa được video: ${message}`
    }, cors, 400)
  }
}

export function deleteConfirmAccepted(body = {}) {
  const confirmText = cleanVideoText(body.confirm_delete || body.confirmDelete).toUpperCase()
  return Boolean(body.confirmed === true || confirmText === 'XOA VIDEO' || confirmText === 'XÓA VIDEO')
}

export function shopeeVideoDeleteTargets(body = {}) {
  const videos = Array.isArray(body.videos) ? body.videos : []
  const postIds = []
  const videoUploadIds = []

  if (videos.length) {
    for (const row of videos) {
      const postId = cleanVideoText(row.post_id || row.postId)
      const videoUploadId = cleanVideoText(row.video_upload_id || row.videoUploadId)
      const listType = cleanVideoText(row.list_type).toLowerCase()
      const status = numberValue(row.status)
      const isDraft = status === 200 || listType === 'draft'
      const isPosted = status === 300 || listType === 'post'
      if (postId && isPosted) {
        postIds.push(postId)
      } else if (videoUploadId && isDraft) {
        videoUploadIds.push(videoUploadId)
      } else if (postId) {
        postIds.push(postId)
      } else if (videoUploadId) {
        videoUploadIds.push(videoUploadId)
      }
    }
  } else {
    postIds.push(...(Array.isArray(body.post_id_list) ? body.post_id_list : [body.post_id || body.postId]))
    videoUploadIds.push(...(Array.isArray(body.video_upload_id_list) ? body.video_upload_id_list : [body.video_upload_id || body.videoUploadId]))
  }

  return {
    post_ids: uniqueTextList(postIds),
    video_upload_ids: uniqueTextList(videoUploadIds)
  }
}

export function normalizeShopeeDeleteResult(data = {}, deleteKind = '') {
  const response = data.response || {}
  const successes = (Array.isArray(response.success_list) ? response.success_list : []).map(row => ({
    post_id: cleanVideoText(row.success_post_id),
    video_upload_id: cleanVideoText(row.success_video_upload_id),
    kind: deleteKind
  }))
  const failures = (Array.isArray(response.failure_list) ? response.failure_list : []).map(row => ({
    post_id: cleanVideoText(row.fail_post_id),
    video_upload_id: cleanVideoText(row.fail_video_upload_id),
    reason: cleanVideoText(row.failed_reason || data.message || data.error),
    kind: deleteKind
  }))
  return { successes, failures }
}

export async function deleteShopeeVideosByChunks(env, shop, targets = {}) {
  const batches = []
  const successes = []
  const failures = []
  for (const postIds of chunkVideoIds(targets.post_ids || [], 5)) {
    const data = await callShopeeVideoPostRaw(env, shop, SHOPEE_VIDEO_DELETE_PATH, { post_id_list: postIds })
    const normalized = normalizeShopeeDeleteResult(data, 'post')
    batches.push({ kind: 'post', ids: postIds, result: data })
    successes.push(...normalized.successes)
    failures.push(...normalized.failures)
    if (data.error && !normalized.failures.length) {
      failures.push(...postIds.map(postId => ({ post_id: postId, video_upload_id: '', kind: 'post', reason: cleanVideoText(data.message || data.error) })))
    }
  }
  for (const videoUploadIds of chunkVideoIds(targets.video_upload_ids || [], 5)) {
    const data = await callShopeeVideoPostRaw(env, shop, SHOPEE_VIDEO_DELETE_PATH, { video_upload_id_list: videoUploadIds })
    const normalized = normalizeShopeeDeleteResult(data, 'draft')
    batches.push({ kind: 'draft', ids: videoUploadIds, result: data })
    successes.push(...normalized.successes)
    failures.push(...normalized.failures)
    if (data.error && !normalized.failures.length) {
      failures.push(...videoUploadIds.map(videoUploadId => ({ post_id: '', video_upload_id: videoUploadId, kind: 'draft', reason: cleanVideoText(data.message || data.error) })))
    }
  }
  return { batches, successes, failures }
}

export async function handleVideoDelete(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const shopName = cleanVideoText(body.shop)
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop để xóa video.' }, cors, 400)
  const shop = await loadShopeeVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
  const targets = shopeeVideoDeleteTargets(body)
  const targetCount = targets.post_ids.length + targets.video_upload_ids.length
  if (!targetCount) return json({ status: 'error', message: 'Thiếu post_id hoặc video_upload_id để xóa.' }, cors, 400)
  if (targetCount > 100) return json({ status: 'error', message: 'Mỗi lần chỉ nên xóa tối đa 100 video để dễ đối soát log.' }, cors, 400)
  if (Number(body.dry_run || 0) === 1) {
    return json({
      status: 'ok',
      dry_run: true,
      message: `OMS sẽ xóa ${targetCount} video Shopee nếu gửi lệnh thật.`,
      targets
    }, cors)
  }
  if (!deleteConfirmAccepted(body)) {
    return json({
      status: 'error',
      message: 'Cần xác nhận trên giao diện trước khi gửi lệnh xóa video thật lên Shopee.'
    }, cors, 400)
  }

  const result = await deleteShopeeVideosByChunks(env, shop, targets)
  const successPostIds = uniqueTextList(result.successes.map(row => row.post_id))
  const successUploadIds = uniqueTextList(result.successes.map(row => row.video_upload_id))
  const markResult = await markMarketplaceVideosDeleted(env, {
    platform: 'shopee',
    shop: shopName,
    post_ids: successPostIds,
    video_upload_ids: successUploadIds
  })
  const shouldRefreshAfterDelete = Number(body.refresh_after_delete ?? 1) !== 0
  const refreshResult = shouldRefreshAfterDelete
    ? await syncShopeeVideoDashboardShop(env, shop, {
      period_type: exactPeriodType(body.period_type),
      end_date: exactDateText(body.end_date) || defaultEndDate(),
      sync_all: 1,
      library_only: 1,
      max_pages: body.max_pages || 10
    }).catch(error => ({ ok: false, warnings: [{ stage: 'refresh_after_delete', message: error.message }] }))
    : { skipped: true, reason: 'frontend_batch_will_refresh_on_last_chunk' }
  const actionStatus = result.failures.length ? (result.successes.length ? 'warning' : 'error') : 'ok'

  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: shopeeVideoShopId(shop),
    action_type: 'delete_video',
    action_status: actionStatus,
    request_payload: body,
    result_payload: { ...result, mark_result: markResult, refresh_result: refreshResult },
    note: `Xóa ${targetCount} video Shopee theo lô tối đa 5 video/lần`
  })

  return json({
    status: actionStatus === 'error' ? 'error' : 'ok',
    message: result.failures.length
      ? `Đã xóa ${result.successes.length}/${targetCount} video; ${result.failures.length} video lỗi cần kiểm tra lại.`
      : `Đã gửi lệnh xóa ${result.successes.length} video lên Shopee.`,
    deleted_count: result.successes.length,
    failed_count: result.failures.length,
    result: { ...result, mark_result: markResult, refresh_result: refreshResult }
  }, cors)
}

export async function pollVideoUploadResult(app, videoUploadId, maxRounds = 8) {
  const buildUrl = shopeePublicUrlBuilder(app, SHOPEE_MEDIA_GET_VIDEO_UPLOAD_RESULT_PATH)
  for (let round = 0; round < maxRounds; round += 1) {
    const data = await fetchShopeeJson(buildUrl, { video_upload_id: videoUploadId })
    const response = data?.response || {}
    const status = cleanVideoText(response.status)
    if (status === 'SUCCEEDED') return response
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(cleanVideoText(response.reason) || `Tải video thất bại với trạng thái ${status}`)
    }
    if (round < maxRounds - 1) await sleep(1500)
  }
  throw new Error('Shopee vẫn chưa xử lý xong video. Hãy thử lại sau ít phút.')
}

export async function handleVideoUpload(request, env, cors) {
  const form = await request.formData()
  const shopName = cleanVideoText(form.get('shop'))
  const file = form.get('file')
  if (!shopName || !file || typeof file.arrayBuffer !== 'function') {
    return json({ status: 'error', message: 'Thiếu shop hoặc file video.' }, cors, 400)
  }
  const shop = await loadShopeeVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
  const result = await uploadShopeeVideoFromBuffer(env, shop, {
    arrayBuffer: await file.arrayBuffer(),
    fileName: file.name || 'video.mp4',
    durationSeconds: form.get('duration_seconds'),
    caption: form.get('caption'),
    itemRows: parseVideoItemRows(form.get('item_ids_json')),
    allowDuet: form.get('allow_duet') ?? 1,
    allowStitch: form.get('allow_stitch') ?? 1,
    coverImageUrl: form.get('cover_image_url'),
    actionType: 'upload_post_video',
    note: 'Tải và đăng video mới lên Shopee Video'
  })
  return json({
    status: 'ok',
    message: 'Đã tải và đăng video mới lên Shopee.',
    ...result
  }, cors)
}
