import { listMarketplaceShopCapabilities } from '../../core/marketplace/shop-capability-core.js'
import { ensureShopeeVideoAuthColumns } from '../../core/shops/shopee-video-auth-core.js'
import { readMarketplaceVideoDetail, readMarketplaceVideoLibrary, saveMarketplaceVideoActionLog, saveMarketplaceVideoDetail, saveMarketplaceVideoLibrary } from '../../core/video/analytics-core.js'
import { signLazada } from '../api/index.js'
import { refreshLazadaTokenForShop } from '../shops/index.js'
import { buildVideoTitleHashtags, ensureVideoTitleHashtags, safeVideoFileName, videoTitleAnchor } from './campaign-title.js'
import { callShopeeVideoGet, uniqueTextList, videoShopLabel } from './shared-api-client.js'
import { cleanVideoText, LAZADA_IMAGE_MAX_BYTES, LAZADA_IMAGE_UPLOAD_PATH, LAZADA_VIDEO_BLOCK_SIZE, LAZADA_VIDEO_COMMIT_PATH, LAZADA_VIDEO_CREATE_PATH, LAZADA_VIDEO_GET_PATH, LAZADA_VIDEO_MAX_BYTES, LAZADA_VIDEO_QUOTA_PATH, LAZADA_VIDEO_UPLOAD_BLOCK_PATH, numberValue, refreshShopeeVideoTokenIfNeeded, SHOPEE_VIDEO_COVER_LIST_PATH, SHOPEE_VIDEO_TITLE_MAX_CHARS, validVideoCoverImageUrl, validVideoCoverImageUrlsForVideo, videoCoverImageUrlForVideo } from './shared-base.js'

export function lazadaInvalidAccessTokenMessage(message) {
  const text = cleanVideoText(message).toLowerCase()
  return text.includes('access token is invalid') ||
    text.includes('access token is expired') ||
    text.includes('invalid or expired')
}

export function lazadaApiPayload(data = {}) {
  if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) return data.data
  if (data?.result && typeof data.result === 'object' && !Array.isArray(data.result)) return data.result
  return data || {}
}

export function lazadaResultField(data, ...names) {
  const payload = lazadaApiPayload(data)
  for (const name of names) {
    const value = cleanVideoText(payload?.[name] ?? data?.[name])
    if (value) return value
  }
  return ''
}

export function lazadaApiMessage(data = {}) {
  const payload = lazadaApiPayload(data)
  return cleanVideoText(
    data?.message ||
    data?.msg ||
    data?.error_message ||
    data?.errorMsg ||
    data?.sub_msg ||
    data?.sub_message ||
    payload?.result_message ||
    payload?.message ||
    payload?.msg ||
    payload?.error_message
  )
}

export function lazadaMediaOk(data = {}) {
  const payload = lazadaApiPayload(data)
  const code = cleanVideoText(data?.code)
  if (code && code !== '0') return false
  if (data?.success === false || payload?.success === false) return false
  return true
}

export function lazadaParams(params = {}) {
  const finalParams = {}
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue
    finalParams[key] = typeof value === 'string' ? value : String(value)
  }
  return finalParams
}

export async function fetchLazadaSignedMedia(env, shop, path, params = {}, options = {}, retry = true) {
  if (!cleanVideoText(shop?.access_token)) throw new Error('Shop Lazada chưa có access token để gọi Media Center API.')
  try {
    const finalParams = await signLazada(path, shop.access_token, lazadaParams(params))
    const url = `https://api.lazada.vn/rest${path}?${new URLSearchParams(finalParams)}`
    const init = { method: cleanVideoText(options.method || 'GET') || 'GET' }
    if (options.formData) init.body = options.formData
    const response = await fetch(url, init)
    const text = await response.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Lazada API trả phản hồi không phải JSON, HTTP ${response.status}`)
    }
    if (!response.ok) throw new Error(lazadaApiMessage(data) || `Lazada API HTTP ${response.status}`)
    if (!lazadaMediaOk(data)) throw new Error(lazadaApiMessage(data) || cleanVideoText(data?.code) || 'Lazada Media Center trả lỗi.')
    return data
  } catch (error) {
    if (
      retry &&
      lazadaInvalidAccessTokenMessage(error?.message) &&
      cleanVideoText(shop?.refresh_token) &&
      shop?.id
    ) {
      try {
        const refreshed = await refreshLazadaTokenForShop(env, shop)
        shop.access_token = refreshed.access_token
        shop.refresh_token = refreshed.refresh_token
        return fetchLazadaSignedMedia(env, shop, path, params, options, false)
      } catch (refreshError) {
        throw new Error(`Token Lazada của shop ${videoShopLabel(shop) || 'chưa rõ'} không còn hợp lệ. Hệ thống đã thử gia hạn nhưng chưa gọi được Media Center: ${cleanVideoText(refreshError?.message || error?.message)}`)
      }
    }
    throw error
  }
}

export async function callLazadaMediaRead(env, shop, path, params = {}) {
  return fetchLazadaSignedMedia(env, shop, path, params, { method: 'GET' })
}

export function lazadaVideoIdentityWarning(shop = {}) {
  const platform = cleanVideoText(shop.platform).toLowerCase()
  if (platform !== 'lazada') return 'Shop được chọn không phải Lazada.'
  if (!cleanVideoText(shop.access_token)) return 'Shop Lazada chưa có token API. Hãy kết nối/gia hạn Lazada API trước khi dùng Media Center.'
  return ''
}

export function lazadaVideoStateLabel(value) {
  const state = cleanVideoText(value).toUpperCase()
  if (state === 'READY_FOR_TRANSCODE') return 'Chờ xử lý video'
  if (state === 'TRANSCODING') return 'Đang xử lý video'
  if (state === 'TRANSCODE_FAILED') return 'Xử lý video lỗi'
  if (state === 'READY_FOR_AUDIT') return 'Chờ duyệt'
  if (state === 'AUDIT_FAILED') return 'Duyệt không đạt'
  if (state === 'AUDIT_SUCCESS') return 'Đã duyệt'
  if (state === 'DELETED') return 'Đã xóa'
  return state || 'Không rõ'
}

export function lazadaVideoStatusCode(value) {
  const state = cleanVideoText(value).toUpperCase()
  if (state === 'AUDIT_SUCCESS') return 300
  if (state === 'DELETED') return 400
  if (state === 'TRANSCODE_FAILED' || state === 'AUDIT_FAILED') return 600
  return 200
}

export function normalizeLazadaVideoDetail(data = {}, requestedVideoId = '') {
  const payload = lazadaApiPayload(data)
  const videoId = cleanVideoText(payload.video_id || payload.videoId || requestedVideoId)
  const state = cleanVideoText(payload.state || payload.status)
  return {
    video_id: videoId,
    state,
    state_label: lazadaVideoStateLabel(state),
    status: lazadaVideoStatusCode(state),
    title: cleanVideoText(payload.title),
    cover_url: validVideoCoverImageUrl(payload.cover_url || payload.coverUrl),
    video_url: validVideoCoverImageUrl(payload.video_url || payload.videoUrl),
    raw_response: data
  }
}

export async function loadLazadaVideoShop(env, shopName) {
  const shops = await listMarketplaceShopCapabilities(env, {
    platform: 'lazada',
    shop: shopName,
    includeSecrets: true,
    limit: 50
  })
  return shops.find(row => cleanVideoText(row.shop_name || row.shop || row.user_name) === cleanVideoText(shopName)) ||
    shops.find(row => cleanVideoText(row.shop_name || row.shop || row.user_name || row.api_shop_id).toLowerCase() === cleanVideoText(shopName).toLowerCase()) ||
    shops[0] ||
    null
}

export async function syncLazadaVideoDetail(env, shop, options = {}) {
  const identityWarning = lazadaVideoIdentityWarning(shop)
  if (identityWarning) throw new Error(identityWarning)
  const shopName = videoShopLabel(shop)
  const videoId = cleanVideoText(options.video_id || options.videoId || options.video_upload_id || options.post_id)
  if (!videoId) throw new Error('Thiếu video_id Lazada để tra Media Center.')
  const data = await callLazadaMediaRead(env, shop, LAZADA_VIDEO_GET_PATH, { videoId })
  const video = normalizeLazadaVideoDetail(data, videoId)
  if (!video.video_id) throw new Error('Lazada không trả video_id hợp lệ.')

  await saveMarketplaceVideoLibrary(env, {
    platform: 'lazada',
    shop: shopName,
    api_shop_id: cleanVideoText(shop.api_shop_id),
    api_user_id: cleanVideoText(shop.api_user_id),
    list_type: 'media',
    rows: [{
      video_key: video.video_id,
      video_upload_id: video.video_id,
      post_id: video.video_id,
      status: video.status,
      status_label: video.state_label,
      caption: video.title,
      cover_image_url: video.cover_url,
      video_url: video.video_url,
      has_performance: 0,
      raw_data: data
    }]
  })
  await saveMarketplaceVideoDetail(env, {
    platform: 'lazada',
    shop: shopName,
    api_shop_id: cleanVideoText(shop.api_shop_id),
    api_user_id: cleanVideoText(shop.api_user_id),
    video_key: video.video_id,
    video_upload_id: video.video_id,
    post_id: video.video_id,
    performance: {
      video_info: video,
      source_note: 'Lazada Media Center chỉ trả trạng thái/media; chưa có analytics/list đồng cấp Shopee Video trong endpoint đã rà.'
    },
    metric_trend: {},
    audience: {},
    product_rows: [],
    cover_list: video.cover_url ? [video.cover_url] : [],
    warnings: video.status === 600 ? [{ stage: 'lazada_media_state', message: video.state_label }] : []
  })

  const detail = await readMarketplaceVideoDetail(env, {
    platform: 'lazada',
    shop: shopName,
    video_key: video.video_id
  })
  return { ...detail, video, raw_response: data }
}

export async function readLazadaVideoQuota(env, shop) {
  const identityWarning = lazadaVideoIdentityWarning(shop)
  if (identityWarning) throw new Error(identityWarning)
  const data = await callLazadaMediaRead(env, shop, LAZADA_VIDEO_QUOTA_PATH, {})
  const payload = lazadaApiPayload(data)
  const capacitySize = numberValue(payload.capacity_size || payload.capacitySize)
  const usedSize = numberValue(payload.used_size || payload.usedSize)
  const quota = {
    capacity_size: capacitySize,
    used_size: usedSize,
    remaining_size: Math.max(0, capacitySize - usedSize),
    raw_response: data
  }
  await saveMarketplaceVideoActionLog(env, {
    platform: 'lazada',
    shop: videoShopLabel(shop),
    api_shop_id: cleanVideoText(shop.api_shop_id),
    action_type: 'lazada_video_quota_get',
    action_status: 'ok',
    request_payload: { endpoint: LAZADA_VIDEO_QUOTA_PATH },
    result_payload: quota,
    note: 'Đọc quota Lazada Media Center bằng endpoint an toàn'
  })
  return quota
}

export async function uploadLazadaImageFile(env, shop, imageFile) {
  const identityWarning = lazadaVideoIdentityWarning(shop)
  if (identityWarning) throw new Error(identityWarning)
  if (!imageFile || typeof imageFile.arrayBuffer !== 'function') throw new Error('Thiếu file ảnh cover Lazada.')
  const imageName = safeVideoFileName(imageFile.name || 'cover.jpg')
  const imageType = cleanVideoText(imageFile.type || 'image/jpeg')
  if (!/^image\/(jpe?g|png)$/i.test(imageType)) throw new Error('Lazada chỉ nhận ảnh JPG hoặc PNG cho cover.')
  if (numberValue(imageFile.size) > LAZADA_IMAGE_MAX_BYTES) throw new Error('Ảnh cover Lazada tối đa 1 MB theo tài liệu Media Center.')

  const formData = new FormData()
  formData.set('image', new File([await imageFile.arrayBuffer()], imageName, { type: imageType }))
  const data = await fetchLazadaSignedMedia(env, shop, LAZADA_IMAGE_UPLOAD_PATH, {}, {
    method: 'POST',
    formData
  })
  const payload = lazadaApiPayload(data)
  const image = payload?.image || payload
  const imageUrl = validVideoCoverImageUrl(image?.url || payload?.url)
  if (!imageUrl) throw new Error('Lazada upload ảnh thành công nhưng chưa trả URL ảnh hợp lệ.')

  const result = {
    image_url: imageUrl,
    hash_code: cleanVideoText(image?.hash_code || image?.hashCode),
    raw_response: data
  }
  await saveMarketplaceVideoActionLog(env, {
    platform: 'lazada',
    shop: videoShopLabel(shop),
    api_shop_id: cleanVideoText(shop.api_shop_id),
    action_type: 'lazada_image_upload',
    action_status: 'ok',
    request_payload: { endpoint: LAZADA_IMAGE_UPLOAD_PATH, file_name: imageName, file_size: imageFile.size },
    result_payload: result,
    note: 'Upload ảnh cover Lazada qua Media Center để dùng trước khi commit video'
  })
  return result
}

export function normalizeLazadaVideoUsage(value) {
  const usage = cleanVideoText(value || 'pro_main_video')
  return usage === 'im' ? 'im' : 'pro_main_video'
}

export async function uploadLazadaVideoFromBuffer(env, shop, payload = {}) {
  const identityWarning = lazadaVideoIdentityWarning(shop)
  if (identityWarning) throw new Error(identityWarning)
  const arrayBuffer = payload.arrayBuffer
  if (!arrayBuffer || typeof arrayBuffer.byteLength !== 'number') throw new Error('Thiếu dữ liệu file video Lazada.')
  if (arrayBuffer.byteLength <= 0) throw new Error('File video Lazada đang rỗng.')
  if (arrayBuffer.byteLength > LAZADA_VIDEO_MAX_BYTES) throw new Error('Lazada Media Center chỉ nhận video nhỏ hơn 100 MB.')
  const title = cleanVideoText(payload.title)
  if (!title) throw new Error('Thiếu tiêu đề video Lazada.')
  const coverUrl = validVideoCoverImageUrl(payload.coverUrl || payload.cover_url)
  if (!coverUrl) throw new Error('Thiếu URL ảnh cover Lazada hợp lệ. Hãy upload ảnh cover trước rồi dùng URL trả về.')
  const shopName = videoShopLabel(shop)
  const fileName = safeVideoFileName(payload.fileName || 'lazada-video.mp4')
  const fileSize = arrayBuffer.byteLength
  const videoUsage = normalizeLazadaVideoUsage(payload.videoUsage || payload.video_usage)

  // Lazada yêu cầu upload theo block: init -> upload từng block -> commit.
  // Ghi rõ từng bước để khi API lỗi có thể xem log và chạy lại từ đầu, không gộp mơ hồ với Shopee.
  const initData = await fetchLazadaSignedMedia(env, shop, LAZADA_VIDEO_CREATE_PATH, {
    fileName,
    fileBytes: fileSize
  }, { method: 'POST' })
  const uploadId = lazadaResultField(initData, 'upload_id', 'uploadId')
  if (!uploadId) throw new Error('Lazada không trả uploadId khi khởi tạo upload video.')

  const bytes = new Uint8Array(arrayBuffer)
  const blockCount = Math.max(1, Math.ceil(bytes.length / LAZADA_VIDEO_BLOCK_SIZE))
  const parts = []
  for (let blockNo = 0; blockNo < blockCount; blockNo += 1) {
    const start = blockNo * LAZADA_VIDEO_BLOCK_SIZE
    const chunk = bytes.slice(start, Math.min(start + LAZADA_VIDEO_BLOCK_SIZE, bytes.length))
    const formData = new FormData()
    formData.set('file', new File([chunk], `${fileName}.part${blockNo}`, { type: 'application/octet-stream' }))
    const uploadData = await fetchLazadaSignedMedia(env, shop, LAZADA_VIDEO_UPLOAD_BLOCK_PATH, {
      uploadId,
      blockNo,
      blockCount
    }, {
      method: 'POST',
      formData
    })
    const eTag = lazadaResultField(uploadData, 'e_tag', 'eTag', 'etag')
    if (!eTag) throw new Error(`Lazada không trả eTag cho block ${blockNo + 1}/${blockCount}.`)
    parts.push({ partNumber: blockNo + 1, eTag })
  }

  const commitData = await fetchLazadaSignedMedia(env, shop, LAZADA_VIDEO_COMMIT_PATH, {
    uploadId,
    parts: JSON.stringify(parts),
    title,
    coverUrl,
    videoUsage
  }, { method: 'POST' })
  const videoId = lazadaResultField(commitData, 'video_id', 'videoId')
  if (!videoId) throw new Error('Lazada upload xong nhưng chưa trả video_id.')
  const detail = await syncLazadaVideoDetail(env, shop, { video_id: videoId }).catch(error => ({
    warning: error?.message || String(error)
  }))

  const result = {
    upload_id: uploadId,
    video_id: videoId,
    block_count: blockCount,
    video_usage: videoUsage,
    commit_result: commitData,
    detail
  }
  await saveMarketplaceVideoActionLog(env, {
    platform: 'lazada',
    shop: shopName,
    api_shop_id: cleanVideoText(shop.api_shop_id),
    action_type: 'lazada_video_upload',
    action_status: 'ok',
    request_payload: {
      endpoint_flow: [LAZADA_VIDEO_CREATE_PATH, LAZADA_VIDEO_UPLOAD_BLOCK_PATH, LAZADA_VIDEO_COMMIT_PATH],
      file_name: fileName,
      file_size: fileSize,
      title,
      cover_url: coverUrl,
      video_usage: videoUsage,
      block_count: blockCount
    },
    result_payload: result,
    note: 'Upload video Lazada Media Center bằng block API; chưa gắn vào sản phẩm cho tới khi người vận hành dùng video_id ở luồng sản phẩm.'
  })
  return result
}

export function normalizeLinkedItemsPayload(items) {
  const rows = Array.isArray(items) ? items : []
  return rows
    .map(item => ({
      item_id: Number(item.item_id || item.itemId || 0),
      custom_item_name: cleanVideoText(item.custom_item_name || item.customItemName)
    }))
    .filter(item => Number.isFinite(item.item_id) && item.item_id > 0)
    .slice(0, 6)
}

export function buildEditVideoBody(input = {}) {
  const videoUploadId = cleanVideoText(input.video_upload_id || input.videoUploadId)
  const coverImageUrl = validVideoCoverImageUrl(input.cover_image_url || input.coverImageUrl)
  if (!videoUploadId) throw new Error('Thiếu video_upload_id để sửa thông tin video.')
  if (!coverImageUrl) throw new Error('Ảnh cover Shopee đang không hợp lệ. Hãy bấm Làm mới chi tiết rồi lưu lại.')
  const scheduledPost = Number(input.scheduled_post || input.scheduledPost) === 1
  const scheduledPostTime = cleanVideoText(input.scheduled_post_time || input.scheduledPostTime)
  const rawCaption = cleanVideoText(input.caption)
  const captionAnchor = videoTitleAnchor({ ...input, caption: rawCaption })
  // Backend vẫn chuẩn hóa hashtag bắt buộc để các lệnh sửa gửi từ UI cũ hoặc helper không làm mất dấu tìm kiếm của shop.
  const caption = rawCaption
    ? ensureVideoTitleHashtags(rawCaption, SHOPEE_VIDEO_TITLE_MAX_CHARS, buildVideoTitleHashtags({ ...input, caption: rawCaption }, captionAnchor))
    : ''
  return {
    video_upload_list: [{
      video_upload_id: videoUploadId,
      caption,
      cover_image_url: coverImageUrl,
      item_info: normalizeLinkedItemsPayload(input.items),
      allow_info: {
        allow_duet: Number(input.allow_duet ?? input.allowDuet ?? 1) === 1,
        allow_stitch: Number(input.allow_stitch ?? input.allowStitch ?? 1) === 1
      },
      scheduled_info: {
        scheduled_post: scheduledPost,
        scheduled_post_time: scheduledPost ? Number(scheduledPostTime) || undefined : undefined
      }
    }]
  }
}

export function normalizeShopeeVideoWriteResult(data = {}, kind = '') {
  const response = data.response || {}
  const rawSuccesses = Array.isArray(response.success_list) ? response.success_list : []
  const rawFailures = Array.isArray(response.failure_list) ? response.failure_list : []
  const successes = rawSuccesses.map(row => {
    if (typeof row === 'string') return { video_upload_id: cleanVideoText(row), post_id: '', kind }
    return {
      video_upload_id: cleanVideoText(row.success_video_upload_id || row.video_upload_id),
      post_id: cleanVideoText(row.post_id || row.success_post_id),
      kind
    }
  }).filter(row => row.video_upload_id || row.post_id)
  const failures = rawFailures.map(row => ({
    video_upload_id: cleanVideoText(row.fail_video_upload_id || row.video_upload_id),
    post_id: cleanVideoText(row.fail_post_id || row.post_id),
    reason: cleanVideoText(row.failed_reason || data.message || data.error) || 'Shopee trả failure_list nhưng không kèm lý do.',
    kind
  })).filter(row => row.video_upload_id || row.post_id || row.reason)
  return { successes, failures }
}

export function assertShopeeVideoWriteSucceeded(data = {}, expectedVideoIds = [], kind = '') {
  const normalized = normalizeShopeeVideoWriteResult(data, kind)
  if (normalized.failures.length) {
    const reason = normalized.failures
      .map(row => cleanVideoText(row.reason))
      .filter(Boolean)
      .slice(0, 3)
      .join('; ')
    throw new Error(reason || `Shopee báo lỗi khi xử lý ${kind}.`)
  }
  const expected = uniqueTextList(expectedVideoIds)
  if (expected.length) {
    const successIds = new Set(normalized.successes.map(row => cleanVideoText(row.video_upload_id)).filter(Boolean))
    const missing = expected.filter(id => !successIds.has(id))
    if (missing.length) {
      throw new Error(`Shopee chưa xác nhận thành công cho ${missing.length} video ở bước ${kind}.`)
    }
  }
  return normalized
}

export async function resolveEditVideoCoverImageUrl(env, shop, payload = {}, videoUploadId = '') {
  const providedCover = videoCoverImageUrlForVideo(payload.cover_image_url || payload.coverImageUrl, videoUploadId)

  const shopName = cleanVideoText(payload.shop || shop?.shop_name || shop?.shop || shop?.user_name)
  const postId = cleanVideoText(payload.post_id || payload.postId)

  const cachedDetail = shopName && videoUploadId
    ? await readMarketplaceVideoDetail(env, {
        platform: 'shopee',
        shop: shopName,
        video_upload_id: videoUploadId,
        post_id: postId
      }).catch(() => null)
    : null
  const detailCovers = validVideoCoverImageUrlsForVideo(cachedDetail?.cover_list, videoUploadId)
  if (providedCover && detailCovers.includes(providedCover)) return providedCover
  if (detailCovers[0]) return detailCovers[0]

  if (videoUploadId) {
    // Khi sửa liên tiếp nhiều video, UI có thể còn giữ cover của video trước.
    // Shopee sẽ báo "cover 0 is illegal" nếu cover không thuộc video_upload_id đang sửa,
    // nên backend luôn lấy lại danh sách cover theo đúng video hiện tại trước khi gửi lệnh thật.
    const coverData = await callShopeeVideoGet(env, shop, SHOPEE_VIDEO_COVER_LIST_PATH, {
      video_upload_id: videoUploadId
    }).catch(() => null)
    const apiCovers = validVideoCoverImageUrlsForVideo(coverData?.response?.image_url_list, videoUploadId)
    if (providedCover && apiCovers.includes(providedCover)) return providedCover
    if (apiCovers[0]) return apiCovers[0]
  }

  const library = shopName
    ? await readMarketplaceVideoLibrary(env, {
        platform: 'shopee',
        shop: shopName,
        limit: 300
      }).catch(() => null)
    : null
  const libraryRow = (library?.rows || []).find(row =>
    (videoUploadId && cleanVideoText(row.video_upload_id) === videoUploadId) ||
    (postId && cleanVideoText(row.post_id) === postId)
  )
  const libraryCover = videoCoverImageUrlForVideo(libraryRow?.cover_image_url, videoUploadId)
  if (libraryCover) return libraryCover

  return providedCover
}

export async function loadShopeeVideoShop(env, shopName) {
  await ensureShopeeVideoAuthColumns(env)
  const shops = await listMarketplaceShopCapabilities(env, {
    platform: 'shopee',
    shop: shopName,
    includeSecrets: true,
    limit: 50
  })
  const shop = shops.find(row => cleanVideoText(row.shop_name || row.shop || row.user_name) === cleanVideoText(shopName)) ||
    shops.find(row => cleanVideoText(row.shop_name || row.shop || row.user_name || row.video_api_shop_id || row.api_shop_id).toLowerCase() === cleanVideoText(shopName).toLowerCase()) ||
    shops[0] ||
    null
  if (shop) await refreshShopeeVideoTokenIfNeeded(env, shop)
  return shop
}
