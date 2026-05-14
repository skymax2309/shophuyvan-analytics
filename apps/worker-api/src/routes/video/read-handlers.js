import { listMarketplaceShopCapabilities, summarizeMarketplaceCapabilities } from '../../core/marketplace-shop-capability-core.js'
import { ensureProductCatalogTables } from '../../core/product-catalog-core.js'
import { ensureShopeeVideoAuthColumns, getShopeeVideoAppFromRow, shopeeVideoShopId } from '../../core/shopee-video-auth-core.js'
import { ensureVideoAnalyticsTables, markMarketplaceVideosDeleted, readMarketplaceVideoDashboard, readMarketplaceVideoDetail, readMarketplaceVideoLibrary, saveMarketplaceVideoActionLog, saveMarketplaceVideoLibrary } from '../../core/video-analytics-core.js'
import { listVideoCatalogProducts } from '../../core/video/catalog-core.js'
import { safeVideoFileName } from './campaign-title.js'
import { fetchLazadaSignedMedia, lazadaVideoIdentityWarning, loadLazadaVideoShop, loadShopeeVideoShop, readLazadaVideoQuota, syncLazadaVideoDetail, uploadLazadaImageFile, uploadLazadaVideoFromBuffer } from './lazada-media.js'
import { callShopeeMediaSpaceForm, callShopeeVideoGet, isInvalidTokenMessage, shopeeVideoMissingUserMessage, videoShopLabel, videoUserId } from './shared-api-client.js'
import { cleanVideoText, defaultEndDate, exactDateText, exactPeriodType, json, LAZADA_VIDEO_GET_PATH, LAZADA_VIDEO_REMOVE_PATH, normalizeVideoCapability, numberValue, refreshShopeeVideoCapabilityRows, SHOPEE_MEDIA_SPACE_MAX_IMAGE_BYTES, SHOPEE_MEDIA_SPACE_MAX_VIDEO_BYTES, SHOPEE_MEDIA_SPACE_UPLOAD_IMAGE_PATH, SHOPEE_MEDIA_SPACE_VIDEO_PART_BYTES, SHOPEE_VIDEO_COVER_LIST_PATH, SHOPEE_VIDEO_LIST_PATH, shopeeMediaSpaceEndpointFlow, shopeeVideoMediaEndpointFlow, validVideoCoverImageUrl } from './shared-base.js'
import { syncShopeeVideoDashboardShop, syncShopeeVideoDetail, uploadShopeeMediaSpaceVideoFromBuffer } from './shopee-sync.js'

export async function handleVideoCapabilities(env, cors) {
  await ensureVideoAnalyticsTables(env)
  await ensureShopeeVideoAuthColumns(env)
  const secretRows = await listMarketplaceShopCapabilities(env, { includeSecrets: true, limit: 300 })
  const tokenRefresh = await refreshShopeeVideoCapabilityRows(env, secretRows)
  const rows = await listMarketplaceShopCapabilities(env, { limit: 300 })
  const refreshErrorByShop = new Map(tokenRefresh
    .filter(item => item.status === 'error')
    .map(item => [cleanVideoText(item.shop), cleanVideoText(item.message)]))
  const normalized = rows.map(row => normalizeVideoCapability({
    ...row,
    video_auto_refresh_error: refreshErrorByShop.get(videoShopLabel(row)) || ''
  }))
  return json({
    status: 'ok',
    summary: summarizeMarketplaceCapabilities(normalized),
    token_refresh: tokenRefresh,
    rows: normalized
  }, cors)
}

export async function handleVideoDashboard(request, env, cors) {
  await ensureVideoAnalyticsTables(env)
  const url = new URL(request.url)
  const platform = cleanVideoText(url.searchParams.get('platform') || 'shopee').toLowerCase()
  const shop = cleanVideoText(url.searchParams.get('shop'))
  const periodType = exactPeriodType(url.searchParams.get('period_type'))
  const endDate = exactDateText(url.searchParams.get('end_date')) || defaultEndDate()
  let dashboard
  try {
    dashboard = await readMarketplaceVideoDashboard(env, {
      platform,
      shop,
      period_type: periodType,
      end_date: endDate
    })
  } catch (error) {
    // Lỗi đọc snapshot phải trả JSON/CORS để frontend hiển thị được trạng thái thay vì treo tab video.
    return json({
      status: 'error',
      error: 'video_dashboard_read_failed',
      message: cleanVideoText(error?.message) || 'Không đọc được snapshot video dashboard.'
    }, cors, 500)
  }
  return json({ status: 'ok', ...dashboard }, cors)
}

export async function handleVideoLibrary(request, env, cors) {
  const url = new URL(request.url)
  const platform = cleanVideoText(url.searchParams.get('platform') || 'shopee').toLowerCase()
  const shop = cleanVideoText(url.searchParams.get('shop'))
  const listType = cleanVideoText(url.searchParams.get('list_type') || 'all')
  const data = await readMarketplaceVideoLibrary(env, {
    platform,
    shop,
    list_type: listType,
    limit: url.searchParams.get('limit')
  })
  return json({ status: 'ok', ...data }, cors)
}

export async function handleShopeeMediaEndpoints(request, env, cors) {
  const url = new URL(request.url)
  const shopFilter = cleanVideoText(url.searchParams.get('shop'))
  const rows = await listMarketplaceShopCapabilities(env, {
    platform: 'shopee',
    shop: shopFilter,
    includeSecrets: true,
    limit: shopFilter ? 20 : 100
  })
  const tokenRefresh = await refreshShopeeVideoCapabilityRows(env, rows)
  const finalRows = tokenRefresh.length
    ? await listMarketplaceShopCapabilities(env, {
        platform: 'shopee',
        shop: shopFilter,
        includeSecrets: true,
        limit: shopFilter ? 20 : 100
      })
    : rows
  const normalized = finalRows.map(normalizeVideoCapability)
  return json({
    status: 'ok',
    platform: 'shopee',
    shop: shopFilter,
    token_refresh: tokenRefresh,
    summary: {
      shopee_shops: normalized.length,
      media_video_ready: normalized.filter(row => Number(row.supports_shopee_media_api) === 1).length,
      media_space_ready: normalized.filter(row => Number(row.supports_shopee_media_space_api) === 1).length
    },
    endpoint_groups: {
      media: {
        status: 'connected',
        api_type: 'Public',
        purpose: 'Upload video lên Shopee Video trước khi gọi Video API edit/post.',
        connected_routes: ['/api/video/upload', '/api/video/upload-queue/run'],
        endpoints: shopeeVideoMediaEndpointFlow()
      },
      media_space: {
        status: 'connected_with_guard',
        api_type: 'Shop',
        purpose: 'Upload ảnh/video sản phẩm để lấy image_id/video_upload_id cho module tạo/sửa bài đăng.',
        connected_routes: ['/api/video/shopee/media-space/image-upload', '/api/video/shopee/media-space/upload'],
        guard: 'Lệnh upload thật yêu cầu confirm_upload = XAC_NHAN_UPLOAD_MEDIA_SHOPEE.',
        endpoints: shopeeMediaSpaceEndpointFlow()
      }
    },
    rows: normalized.map(row => ({
      shop_name: cleanVideoText(row.shop_name || row.user_name || row.api_shop_id),
      api_shop_id: cleanVideoText(row.api_shop_id),
      video_api_user_id: cleanVideoText(row.video_api_user_id),
      video_sync_mode: cleanVideoText(row.video_sync_mode),
      video_ready: Number(row.video_ready) === 1 ? 1 : 0,
      supports_shopee_media_api: Number(row.supports_shopee_media_api) === 1 ? 1 : 0,
      supports_shopee_media_space_api: Number(row.supports_shopee_media_space_api) === 1 ? 1 : 0,
      media_note: cleanVideoText(row.shopee_media_operator_guide),
      media_space_note: cleanVideoText(row.shopee_media_space_operator_guide)
    }))
  }, cors)
}

export async function handleShopeeMediaSpaceImageUpload(request, env, cors) {
  const form = await request.formData()
  const dryRun = Number(form.get('dry_run') || 0) === 1
  if (dryRun) {
    return json({
      status: 'ok',
      dry_run: true,
      message: 'MediaSpace upload ảnh đã nối route nhưng chưa gửi file lên Shopee.',
      endpoint: SHOPEE_MEDIA_SPACE_UPLOAD_IMAGE_PATH,
      required_confirm_upload: 'XAC_NHAN_UPLOAD_MEDIA_SHOPEE',
      limits: {
        max_bytes: SHOPEE_MEDIA_SPACE_MAX_IMAGE_BYTES,
        accepted_formats: ['jpg', 'jpeg', 'png']
      }
    }, cors)
  }
  const shopName = cleanVideoText(form.get('shop'))
  const image = form.get('image') || form.get('file')
  if (!shopName || !image || typeof image.arrayBuffer !== 'function') {
    return json({ status: 'error', message: 'Thiếu shop hoặc file ảnh để upload MediaSpace.' }, cors, 400)
  }
  if (cleanVideoText(form.get('confirm_upload')) !== 'XAC_NHAN_UPLOAD_MEDIA_SHOPEE') {
    return json({ status: 'error', message: 'Upload MediaSpace là lệnh tạo media thật. Cần confirm_upload = XAC_NHAN_UPLOAD_MEDIA_SHOPEE.' }, cors, 400)
  }
  if (Number(image.size || 0) > SHOPEE_MEDIA_SPACE_MAX_IMAGE_BYTES) {
    return json({ status: 'error', message: 'Ảnh MediaSpace vượt quá giới hạn 10MB.' }, cors, 400)
  }
  const shop = await loadShopeeVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API để gọi MediaSpace.' }, cors, 404)
  const imageName = safeVideoFileName(image.name || 'product-image.jpg')
  const formData = new FormData()
  formData.set('image', new File([await image.arrayBuffer()], imageName, { type: cleanVideoText(image.type) || 'image/jpeg' }))
  const params = {}
  const scene = cleanVideoText(form.get('scene') || 'normal')
  const ratio = cleanVideoText(form.get('ratio'))
  if (scene) params.scene = scene
  if (ratio) params.ratio = ratio
  const data = await callShopeeMediaSpaceForm(env, shop, SHOPEE_MEDIA_SPACE_UPLOAD_IMAGE_PATH, params, formData)
  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: videoShopLabel(shop),
    api_shop_id: cleanVideoText(shop.api_shop_id),
    action_type: 'shopee_media_space_upload_image',
    action_status: 'ok',
    request_payload: {
      file_name: imageName,
      file_size: Number(image.size || 0),
      scene,
      ratio,
      endpoint_family: 'MediaSpace'
    },
    result_payload: data,
    note: 'Upload ảnh lên Shopee MediaSpace để lấy image_id/image_url cho module sản phẩm.'
  })
  return json({
    status: 'ok',
    message: 'Đã upload ảnh lên Shopee MediaSpace.',
    result: data
  }, cors)
}

export async function handleShopeeMediaSpaceVideoUpload(request, env, cors) {
  const form = await request.formData()
  const dryRun = Number(form.get('dry_run') || 0) === 1
  if (dryRun) {
    return json({
      status: 'ok',
      dry_run: true,
      message: 'MediaSpace upload video sản phẩm đã nối route nhưng chưa gửi file lên Shopee.',
      endpoint_flow: shopeeMediaSpaceEndpointFlow(),
      required_confirm_upload: 'XAC_NHAN_UPLOAD_MEDIA_SHOPEE',
      limits: {
        max_bytes: SHOPEE_MEDIA_SPACE_MAX_VIDEO_BYTES,
        part_bytes: SHOPEE_MEDIA_SPACE_VIDEO_PART_BYTES,
        duration_seconds: '10-60'
      }
    }, cors)
  }
  const shopName = cleanVideoText(form.get('shop'))
  const file = form.get('file')
  if (!shopName || !file || typeof file.arrayBuffer !== 'function') {
    return json({ status: 'error', message: 'Thiếu shop hoặc file video để upload Shopee MediaSpace.' }, cors, 400)
  }
  if (cleanVideoText(form.get('confirm_upload')) !== 'XAC_NHAN_UPLOAD_MEDIA_SHOPEE') {
    return json({ status: 'error', message: 'Upload MediaSpace là lệnh tạo media thật. Cần confirm_upload = XAC_NHAN_UPLOAD_MEDIA_SHOPEE.' }, cors, 400)
  }
  const shop = await loadShopeeVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API để gọi MediaSpace.' }, cors, 404)
  const result = await uploadShopeeMediaSpaceVideoFromBuffer(env, shop, {
    arrayBuffer: await file.arrayBuffer(),
    fileName: file.name || 'product-video.mp4',
    durationSeconds: form.get('duration_seconds')
  })
  return json({
    status: 'ok',
    message: 'Đã upload video lên Shopee MediaSpace. Video này mới là media sản phẩm, chưa tự gắn vào bài đăng.',
    ...result
  }, cors)
}

export async function handleLazadaVideoQuota(request, env, cors) {
  const url = new URL(request.url)
  const shopName = cleanVideoText(url.searchParams.get('shop'))
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop Lazada để đọc quota video.' }, cors, 400)
  const shop = await loadLazadaVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Lazada API phù hợp.' }, cors, 404)
  const quota = await readLazadaVideoQuota(env, shop)
  return json({
    status: 'ok',
    shop: videoShopLabel(shop),
    api_shop_id: cleanVideoText(shop.api_shop_id),
    quota
  }, cors)
}

export async function handleLazadaVideoDetail(request, env, cors) {
  const url = new URL(request.url)
  const shopName = cleanVideoText(url.searchParams.get('shop'))
  const videoId = cleanVideoText(url.searchParams.get('video_id') || url.searchParams.get('videoId'))
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop Lazada để tra video.' }, cors, 400)
  if (!videoId) return json({ status: 'error', message: 'Thiếu video_id Lazada để tra Media Center.' }, cors, 400)
  const shop = await loadLazadaVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Lazada API phù hợp.' }, cors, 404)
  const detail = await syncLazadaVideoDetail(env, shop, { video_id: videoId })
  await saveMarketplaceVideoActionLog(env, {
    platform: 'lazada',
    shop: videoShopLabel(shop),
    api_shop_id: cleanVideoText(shop.api_shop_id),
    action_type: 'lazada_video_get',
    action_status: 'ok',
    request_payload: { endpoint: LAZADA_VIDEO_GET_PATH, video_id: videoId },
    result_payload: detail,
    note: 'Tra video_id Lazada Media Center và lưu cache core video'
  })
  return json({ status: 'ok', detail }, cors)
}

export async function handleLazadaImageUpload(request, env, cors) {
  const form = await request.formData().catch(() => null)
  if (!form) return json({ status: 'error', message: 'Payload upload ảnh Lazada không hợp lệ.' }, cors, 400)
  const shopName = cleanVideoText(form.get('shop'))
  const imageFile = form.get('image')
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop Lazada để upload ảnh cover.' }, cors, 400)
  const shop = await loadLazadaVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Lazada API phù hợp.' }, cors, 404)
  const result = await uploadLazadaImageFile(env, shop, imageFile)
  return json({
    status: 'ok',
    message: 'Đã upload ảnh cover Lazada. Dùng URL này để commit video.',
    shop: videoShopLabel(shop),
    result
  }, cors)
}

export async function handleLazadaVideoUpload(request, env, cors) {
  const form = await request.formData().catch(() => null)
  if (!form) return json({ status: 'error', message: 'Payload upload video Lazada không hợp lệ.' }, cors, 400)
  const shopName = cleanVideoText(form.get('shop'))
  const videoFile = form.get('file')
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop Lazada để upload video.' }, cors, 400)
  if (!videoFile || typeof videoFile.arrayBuffer !== 'function') {
    return json({ status: 'error', message: 'Thiếu file video Lazada.' }, cors, 400)
  }
  const shop = await loadLazadaVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Lazada API phù hợp.' }, cors, 404)
  const result = await uploadLazadaVideoFromBuffer(env, shop, {
    arrayBuffer: await videoFile.arrayBuffer(),
    fileName: videoFile.name || 'lazada-video.mp4',
    title: form.get('title'),
    coverUrl: form.get('cover_url') || form.get('coverUrl'),
    videoUsage: form.get('video_usage') || form.get('videoUsage')
  })
  return json({
    status: 'ok',
    message: 'Đã upload video Lazada vào Media Center. Kiểm tra trạng thái duyệt bằng video_id.',
    shop: videoShopLabel(shop),
    result
  }, cors)
}

export async function handleLazadaVideoRemove(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const shopName = cleanVideoText(body.shop)
  const videoId = cleanVideoText(body.video_id || body.videoId)
  const confirmText = cleanVideoText(body.confirm_remove || body.confirmRemove)
  const dryRun = numberValue(body.dry_run || body.dryRun) ? 1 : 0
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop Lazada để xóa video.' }, cors, 400)
  if (!videoId) return json({ status: 'error', message: 'Thiếu video_id Lazada để xóa.' }, cors, 400)
  const shop = await loadLazadaVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Lazada API phù hợp.' }, cors, 404)
  const identityWarning = lazadaVideoIdentityWarning(shop)
  if (identityWarning) return json({ status: 'error', message: identityWarning }, cors, 400)

  if (dryRun) {
    return json({
      status: 'ok',
      dry_run: 1,
      message: 'OMS sẽ gọi endpoint xóa video Lazada nếu gửi lệnh thật.',
      target: {
        endpoint: LAZADA_VIDEO_REMOVE_PATH,
        shop: videoShopLabel(shop),
        api_shop_id: cleanVideoText(shop.api_shop_id),
        video_id: videoId
      }
    }, cors)
  }

  if (confirmText !== 'XOA_VIDEO_LAZADA') {
    return json({ status: 'error', message: 'Lệnh xóa Lazada là thao tác thật. Hãy gửi confirm_remove = XOA_VIDEO_LAZADA.' }, cors, 400)
  }

  const result = await fetchLazadaSignedMedia(env, shop, LAZADA_VIDEO_REMOVE_PATH, { videoId }, { method: 'POST' })
  const cacheUpdate = await markMarketplaceVideosDeleted(env, {
    platform: 'lazada',
    shop: videoShopLabel(shop),
    video_upload_ids: [videoId],
    post_ids: [videoId]
  })
  if (!cacheUpdate.updated_videos) {
    await saveMarketplaceVideoLibrary(env, {
      platform: 'lazada',
      shop: videoShopLabel(shop),
      api_shop_id: cleanVideoText(shop.api_shop_id),
      api_user_id: cleanVideoText(shop.api_user_id),
      list_type: 'media',
      rows: [{
        video_key: videoId,
        video_upload_id: videoId,
        post_id: videoId,
        status: 400,
        status_label: 'Đã xóa',
        raw_data: result
      }]
    })
  }
  await saveMarketplaceVideoActionLog(env, {
    platform: 'lazada',
    shop: videoShopLabel(shop),
    api_shop_id: cleanVideoText(shop.api_shop_id),
    action_type: 'lazada_video_remove',
    action_status: 'ok',
    request_payload: { endpoint: LAZADA_VIDEO_REMOVE_PATH, video_id: videoId },
    result_payload: result,
    note: 'Xóa video Lazada Media Center sau khi có chuỗi xác nhận rõ ràng'
  })
  return json({ status: 'ok', message: 'Đã gửi lệnh xóa video Lazada.', result, cache_update: cacheUpdate }, cors)
}

export async function handleVideoCatalogItems(request, env, cors) {
  await ensureProductCatalogTables(env)
  const url = new URL(request.url)
  const rows = await listVideoCatalogProducts(env, {
    platform: url.searchParams.get('platform') || 'shopee',
    shop: url.searchParams.get('shop') || '',
    query: url.searchParams.get('query') || '',
    limit: url.searchParams.get('limit') || 12
  })
  return json({ status: 'ok', rows }, cors)
}

export async function handleVideoPermissionTest(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const shopName = cleanVideoText(body.shop)
  if (!shopName) return json({ status: 'error', message: 'Thiếu shop để test quyền Shopee Video.' }, cors, 400)
  const shop = await loadShopeeVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee để test quyền video.' }, cors, 404)

  const setupWarning = !getShopeeVideoAppFromRow(shop)
    ? 'Shop chưa lưu Partner ID/Key riêng cho Shopee Video.'
    : !cleanVideoText(shop.video_access_token)
      ? 'Shop chưa có access token riêng cho Shopee Video. Hãy bấm Kết nối/Gia hạn video trước.'
      : !cleanVideoText(videoUserId(shop))
        ? shopeeVideoMissingUserMessage(shop)
        : ''
  if (setupWarning) {
    await env.DB.prepare(`
      UPDATE shops
      SET video_api_user_id = CASE
            WHEN video_auth_subject_type = 'shop' OR video_api_user_id = video_api_shop_id THEN ''
            ELSE video_api_user_id
          END,
          video_permission_status = 'error',
          video_permission_message = ?,
          video_permission_tested_at = datetime('now')
      WHERE id = ?
    `).bind(setupWarning, shop.id).run()
    await saveMarketplaceVideoActionLog(env, {
      platform: 'shopee',
      shop: videoShopLabel(shop),
      api_shop_id: shopeeVideoShopId(shop),
      action_type: 'test_video_permission',
      action_status: 'error',
      request_payload: { endpoint: SHOPEE_VIDEO_LIST_PATH, skipped: true },
      result_payload: { message: setupWarning },
      note: 'Chặn test quyền Shopee Video trước khi gọi sàn vì token chưa đúng loại User API'
    })
    return json({ status: 'error', message: setupWarning }, cors, 400)
  }

  // Test quyền bằng endpoint đọc an toàn, không tạo/sửa/xóa video thật trên sàn.
  try {
    const result = await callShopeeVideoGet(env, shop, SHOPEE_VIDEO_LIST_PATH, {
      page_no: 1,
      page_size: 1,
      list_type: 2
    })
    const message = 'Test quyền Shopee Video OK. Dashboard video đã được phép đồng bộ, tải, sửa và xóa theo API video riêng.'
    await env.DB.prepare(`
      UPDATE shops
      SET video_permission_status = 'ok',
          video_permission_message = ?,
          video_permission_tested_at = datetime('now')
      WHERE id = ?
    `).bind(message, shop.id).run()
    await saveMarketplaceVideoActionLog(env, {
      platform: 'shopee',
      shop: videoShopLabel(shop),
      api_shop_id: shopeeVideoShopId(shop),
      action_type: 'test_video_permission',
      action_status: 'ok',
      request_payload: { endpoint: SHOPEE_VIDEO_LIST_PATH, page_size: 1 },
      result_payload: result,
      note: 'Test quyền Shopee Video API bằng endpoint đọc danh sách video'
    })
    return json({ status: 'ok', message, result }, cors)
  } catch (error) {
    let message = cleanVideoText(error?.message) || 'Test quyền Shopee Video thất bại.'
    if (isInvalidTokenMessage(message)) {
      message = 'Shopee trả Invalid access_token cho Video API. Hãy bấm Kết nối/Gia hạn video lại để lấy đúng token user_id của app Video, sau đó test lại quyền.'
    }
    await env.DB.prepare(`
      UPDATE shops
      SET video_permission_status = 'error',
          video_permission_message = ?,
          video_permission_tested_at = datetime('now')
      WHERE id = ?
    `).bind(message, shop.id).run()
    await saveMarketplaceVideoActionLog(env, {
      platform: 'shopee',
      shop: videoShopLabel(shop),
      api_shop_id: shopeeVideoShopId(shop),
      action_type: 'test_video_permission',
      action_status: 'error',
      request_payload: { endpoint: SHOPEE_VIDEO_LIST_PATH, page_size: 1 },
      result_payload: { message },
      note: 'Test quyền Shopee Video API thất bại, dashboard video vẫn bị khóa'
    })
    return json({ status: 'error', message }, cors, 400)
  }
}

export async function handleVideoSync(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const shopFilter = cleanVideoText(body.shop)
  const periodType = exactPeriodType(body.period_type)
  const endDate = exactDateText(body.end_date) || defaultEndDate()
  const shops = shopFilter
    ? (await listMarketplaceShopCapabilities(env, { platform: 'shopee', shop: shopFilter, includeSecrets: true, limit: 10 }))
      .filter(shop => cleanVideoText(shop.shop_name || shop.shop || shop.user_name || shop.video_api_shop_id || shop.api_shop_id))
    : await listMarketplaceShopCapabilities(env, { platform: 'shopee', includeSecrets: true, limit: 30 })

  if (!shops.length) {
    return json({
      status: 'warning',
      platform: 'shopee',
      message: shopFilter
        ? `Không tìm thấy shop Shopee API phù hợp với "${shopFilter}".`
        : 'Chưa có shop Shopee API sẵn sàng cho Shopee Video.',
      note: 'Shop không có API hoặc chưa đủ quyền Shopee Video sẽ không vào luồng đồng bộ này.'
    }, cors)
  }

  const results = []
  for (const shop of shops) {
    const row = await syncShopeeVideoDashboardShop(env, shop, {
      ...body,
      period_type: periodType,
      end_date: endDate
    })
    results.push(row)
  }

  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: shopFilter || 'Tất cả shop Shopee API',
    api_shop_id: '',
    action_type: 'sync_dashboard',
    action_status: results.some(item => item.ok) ? 'ok' : 'warning',
    request_payload: body,
    result_payload: results,
    note: 'Đồng bộ thư viện video và dashboard Shopee Video'
  })

  return json({
    status: 'ok',
    platform: 'shopee',
    period_type: periodType,
    end_date: endDate,
    shop_count: results.length,
    ok_count: results.filter(item => item.ok).length,
    saved_library: results.reduce((sum, item) => sum + numberValue(item.saved_library), 0),
    saved_dashboard: results.reduce((sum, item) => sum + numberValue(item.saved_dashboard), 0),
    shops: results
  }, cors)
}

export async function handleVideoDetail(request, env, cors) {
  const url = new URL(request.url)
  const platform = cleanVideoText(url.searchParams.get('platform') || 'shopee').toLowerCase()
  const shop = cleanVideoText(url.searchParams.get('shop'))
  const refresh = Number(url.searchParams.get('refresh') || 0) === 1
  const videoUploadId = cleanVideoText(url.searchParams.get('video_upload_id'))
  const postId = cleanVideoText(url.searchParams.get('post_id'))
  try {
    if (platform !== 'shopee') {
      return json({ status: 'error', message: 'Hiện tại OMS mới hỗ trợ chi tiết Shopee Video.' }, cors, 400)
    }
    let detail = null
    if (refresh) {
      const videoShop = await loadShopeeVideoShop(env, shop)
      if (!videoShop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
      detail = await syncShopeeVideoDetail(env, videoShop, { video_upload_id: videoUploadId, post_id: postId })
    } else {
      detail = await readMarketplaceVideoDetail(env, {
        platform,
        shop,
        video_upload_id: videoUploadId,
        post_id: postId
      })
    }
    if (!detail) return json({ status: 'error', message: 'Chưa có cache chi tiết video. Hãy bấm làm mới chi tiết trước.' }, cors, 404)
    return json({ status: 'ok', detail }, cors)
  } catch (error) {
    // Route detail thường được gọi ngay sau lệnh lưu video. Nếu Shopee hoặc D1 lỗi,
    // vẫn phải trả JSON/CORS để UI không rơi về lỗi mơ hồ "Failed to fetch".
    const message = cleanVideoText(error?.message) || 'Không tải được chi tiết video từ Shopee.'
    return json({
      status: 'error',
      message: `Không tải được chi tiết video: ${message}`,
      stage: refresh ? 'refresh_video_detail' : 'read_video_detail_cache',
      video_upload_id: videoUploadId,
      post_id: postId
    }, cors, 400)
  }
}

export async function handleVideoCoverList(request, env, cors) {
  const url = new URL(request.url)
  const shop = cleanVideoText(url.searchParams.get('shop'))
  const videoUploadId = cleanVideoText(url.searchParams.get('video_upload_id'))
  if (!shop || !videoUploadId) return json({ status: 'error', message: 'Thiếu shop hoặc video_upload_id.' }, cors, 400)
  const videoShop = await loadShopeeVideoShop(env, shop)
  if (!videoShop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
  const data = await callShopeeVideoGet(env, videoShop, SHOPEE_VIDEO_COVER_LIST_PATH, { video_upload_id: videoUploadId })
  const imageList = Array.isArray(data?.response?.image_url_list) ? data.response.image_url_list.map(validVideoCoverImageUrl).filter(Boolean) : []
  return json({
    status: 'ok',
    shop,
    video_upload_id: videoUploadId,
    rows: imageList
  }, cors)
}
