import { shopeeVideoShopId } from '../../core/shopee-video-auth-core.js'
import { claimDueMarketplaceVideoUploadJobs, createMarketplaceVideoUploadQueue, getMarketplaceVideoUploadQueueJob, listMarketplaceVideoUploadQueue, saveMarketplaceVideoActionLog, updateMarketplaceVideoUploadQueueJob } from '../../core/video-analytics-core.js'
import { buildVideoCampaignR2Key, buildVideoMultiShopPreview, buildVideoQueueR2Key, localDateTimeText, newVideoQueueId, normalizeCampaignVideoKey, normalizeLocalDateTimeText, parseCampaignShopConfigs, parseVideoItemRows, safeVideoFileName, validateVideoUploadDuration } from './campaign-title.js'
import { loadShopeeVideoShop } from './lazada-media.js'
import { shopeeVideoIdentityWarning, videoUserId } from './shared-api-client.js'
import { cleanVideoText, json, numberValue, SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL } from './shared-base.js'
import { uploadShopeeVideoFromBuffer } from './shopee-sync.js'

export async function handleVideoMultiShopPreview(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const preview = await buildVideoMultiShopPreview(env, body)
  return json({
    status: 'ok',
    ...preview
  }, cors)
}

export async function handleVideoMultiShopQueue(request, env, cors) {
  const form = await request.formData()
  const file = form.get('file')
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ status: 'error', message: 'Thiếu file video gốc để tạo chiến dịch đa shop.' }, cors, 400)
  }
  const fileName = safeVideoFileName(file.name || 'campaign-video.mp4')
  const durationSeconds = validateVideoUploadDuration(form.get('duration_seconds'))
  const campaignVideoKey = normalizeCampaignVideoKey(form.get('campaign_video_key'), fileName)
  const campaignName = cleanVideoText(form.get('campaign_name')) || campaignVideoKey
  const preview = await buildVideoMultiShopPreview(env, {
    campaign_video_key: campaignVideoKey,
    campaign_name: campaignName,
    file_name: fileName,
    duration_seconds: durationSeconds,
    scheduled_at: form.get('default_scheduled_at'),
    shop_configs: parseCampaignShopConfigs(form.get('shop_configs_json'))
  })
  const readyRows = preview.rows.filter(row => row.can_queue)
  const manualRows = preview.rows.filter(row => row.enabled && row.manual_required)
  if (!readyRows.length && !manualRows.length) {
    return json({
      status: 'error',
      message: 'Chưa có shop nào đủ điều kiện để tạo lịch API hoặc ghi nhận luồng đăng tay. Hãy kiểm tra sản phẩm gắn kèm, tiêu đề và cảnh báo trùng video.',
      preview
    }, cors, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const r2Key = buildVideoCampaignR2Key(campaignVideoKey, fileName)
  await env.STORAGE.put(r2Key, arrayBuffer, {
    httpMetadata: {
      contentType: cleanVideoText(file.type) || 'video/mp4'
    },
    customMetadata: {
      campaign_video_key: campaignVideoKey,
      campaign_name: campaignName,
      source: 'dashboard_video_multi_shop'
    }
  })

  const queuedRows = []
  // Shop có API được đưa vào queue tự động; shop chưa API chỉ tạo log hướng dẫn đăng tay, tuyệt đối không giả lập là đã đồng bộ API.
  for (const row of readyRows) {
    const shop = await loadShopeeVideoShop(env, row.shop)
    const queueId = newVideoQueueId()
    const queueRow = await createMarketplaceVideoUploadQueue(env, {
      queue_id: queueId,
      platform: 'shopee',
      shop: row.shop,
      api_shop_id: shopeeVideoShopId(shop),
      api_user_id: videoUserId(shop),
      scheduled_at: row.scheduled_at,
      r2_key: r2Key,
      file_name: fileName,
      file_size: arrayBuffer.byteLength,
      file_type: cleanVideoText(file.type) || 'video/mp4',
      duration_seconds: durationSeconds,
      caption: row.caption,
      item_rows: row.item_rows,
      allow_duet: row.allow_duet,
      allow_stitch: row.allow_stitch,
      cover_image_url: '',
      max_attempts: 1,
      source: `dashboard_video_multi_shop:${campaignVideoKey}`
    })
    const updated = await updateMarketplaceVideoUploadQueueJob(env, queueRow.id, {
      result_payload: {
        campaign_video_key: campaignVideoKey,
        campaign_name: campaignName,
        shared_r2_key: true,
        duplicate: row.duplicate || null,
        created_from: 'multi_shop_campaign'
      }
    })
    queuedRows.push(updated)
  }

  const browserRows = []
  for (const row of manualRows) {
    const queueId = newVideoQueueId()
    const queueRow = await createMarketplaceVideoUploadQueue(env, {
      queue_id: queueId,
      platform: 'shopee',
      shop: row.shop,
      api_shop_id: '',
      api_user_id: '',
      scheduled_at: row.scheduled_at,
      r2_key: r2Key,
      file_name: fileName,
      file_size: arrayBuffer.byteLength,
      file_type: cleanVideoText(file.type) || 'video/mp4',
      duration_seconds: durationSeconds,
      caption: row.caption,
      item_rows: row.item_rows,
      allow_duet: row.allow_duet,
      allow_stitch: row.allow_stitch,
      cover_image_url: '',
      max_attempts: 1,
      source: `dashboard_video_multi_shop:${campaignVideoKey}`
    })
    const browserRow = await updateMarketplaceVideoUploadQueueJob(env, queueRow.id, {
      status: 'browser_upload_required',
      last_error: 'Shop chưa có Shopee Video API. Cần mở Chrome local để upload và dừng ở màn preview.',
      result_payload: {
        campaign_video_key: campaignVideoKey,
        campaign_name: campaignName,
        shared_r2_key: true,
        duplicate: row.duplicate || null,
        created_from: 'multi_shop_campaign_browser',
        manual_upload_url: SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL
      }
    })
    browserRows.push(browserRow)
    await saveMarketplaceVideoActionLog(env, {
      platform: 'shopee',
      shop: row.shop,
      api_shop_id: '',
      action_type: 'manual_upload_multi_shop_campaign',
      action_status: 'browser_upload_required',
      request_payload: {
        queue_id: queueId,
        campaign_video_key: campaignVideoKey,
        campaign_name: campaignName,
        file_name: fileName,
        duration_seconds: durationSeconds,
        caption: row.caption,
        item_rows: row.item_rows,
        scheduled_at: row.scheduled_at
      },
      result_payload: {
        queue_row: browserRow,
        source_r2_key: r2Key,
        manual_upload_url: SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL,
        duplicate: row.duplicate || null
      },
      note: 'Shop chưa có Shopee Video API nên tạo job Chrome local: tự mở Creator Center, upload file và dừng ở màn preview để người vận hành kiểm tra.'
    })
  }

  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: 'multi-shop',
    api_shop_id: '',
    action_type: 'queue_upload_multi_shop_campaign',
    action_status: readyRows.length ? 'queued' : 'manual_required',
    request_payload: {
      campaign_video_key: campaignVideoKey,
      campaign_name: campaignName,
      file_name: fileName,
      duration_seconds: durationSeconds,
      ready_shops: readyRows.map(row => row.shop),
      manual_shops: manualRows.map(row => row.shop)
    },
    result_payload: {
      queued_rows: queuedRows,
      manual_rows: browserRows,
      source_r2_key: r2Key
    },
    note: 'Tạo chiến dịch đăng video đa shop: shop có API đi queue riêng, shop chưa API tạo job Chrome local dừng ở preview.'
  })

  const manualMessage = manualRows.length
    ? ` ${manualRows.length} shop chưa API đã tạo job Chrome local, cần mở preview rồi tự xác nhận đăng.`
    : ''
  const finalPreview = await buildVideoMultiShopPreview(env, {
    campaign_video_key: campaignVideoKey,
    campaign_name: campaignName,
    file_name: fileName,
    duration_seconds: durationSeconds,
    scheduled_at: form.get('default_scheduled_at'),
    shop_configs: parseCampaignShopConfigs(form.get('shop_configs_json'))
  })
  return json({
    status: 'ok',
    message: `Đã tạo ${queuedRows.length} job API và ${browserRows.length} job Chrome local.${manualMessage} File gốc chỉ lưu một lần trong R2.`,
    campaign_video_key: campaignVideoKey,
    campaign_name: campaignName,
    rows: queuedRows,
    manual_rows: browserRows,
    manual_upload_url: SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL,
    preview: finalPreview
  }, cors)
}

export async function handleVideoUploadQueueCreate(request, env, cors) {
  const form = await request.formData()
  const shopName = cleanVideoText(form.get('shop'))
  const file = form.get('file')
  if (!shopName || !file || typeof file.arrayBuffer !== 'function') {
    return json({ status: 'error', message: 'Thiếu shop hoặc file video để tạo lịch upload.' }, cors, 400)
  }
  const shop = await loadShopeeVideoShop(env, shopName)
  if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
  const identityWarning = shopeeVideoIdentityWarning(shop)
  if (identityWarning) return json({ status: 'error', message: identityWarning }, cors, 400)

  const scheduledAt = normalizeLocalDateTimeText(form.get('scheduled_at'))
  if (!scheduledAt) {
    return json({ status: 'error', message: 'Thiếu giờ đăng. Hãy chọn đúng ngày giờ theo múi giờ Việt Nam.' }, cors, 400)
  }
  const minScheduledAt = localDateTimeText(5)
  if (scheduledAt < minScheduledAt) {
    return json({
      status: 'error',
      message: `Giờ đăng phải sau hiện tại ít nhất 5 phút. Mốc tối thiểu: ${minScheduledAt}.`
    }, cors, 400)
  }

  const durationSeconds = validateVideoUploadDuration(form.get('duration_seconds'))
  const queueId = newVideoQueueId()
  const fileName = safeVideoFileName(file.name || 'video.mp4')
  const arrayBuffer = await file.arrayBuffer()
  const r2Key = buildVideoQueueR2Key(queueId, fileName)
  await env.STORAGE.put(r2Key, arrayBuffer, {
    httpMetadata: {
      contentType: cleanVideoText(file.type) || 'video/mp4'
    },
    customMetadata: {
      queue_id: queueId,
      platform: 'shopee',
      shop: shopName
    }
  })

  const itemRows = parseVideoItemRows(form.get('item_ids_json'))
  const row = await createMarketplaceVideoUploadQueue(env, {
    queue_id: queueId,
    platform: 'shopee',
    shop: shopName,
    api_shop_id: shopeeVideoShopId(shop),
    api_user_id: videoUserId(shop),
    scheduled_at: scheduledAt,
    r2_key: r2Key,
    file_name: fileName,
    file_size: arrayBuffer.byteLength,
    file_type: cleanVideoText(file.type) || 'video/mp4',
    duration_seconds: durationSeconds,
    caption: form.get('caption'),
    item_rows: itemRows,
    allow_duet: numberValue(form.get('allow_duet') ?? 1) ? 1 : 0,
    allow_stitch: numberValue(form.get('allow_stitch') ?? 1) ? 1 : 0,
    cover_image_url: form.get('cover_image_url'),
    max_attempts: 1,
    source: 'dashboard_video_schedule'
  })

  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: shopName,
    api_shop_id: shopeeVideoShopId(shop),
    action_type: 'queue_upload_schedule',
    action_status: 'queued',
    request_payload: {
      queue_id: queueId,
      scheduled_at: scheduledAt,
      file_name: fileName,
      file_size: arrayBuffer.byteLength,
      duration_seconds: durationSeconds,
      caption: cleanVideoText(form.get('caption')),
      item_ids_json: itemRows
    },
    result_payload: row,
    note: 'Tạo lịch upload video theo giờ; cron chỉ đăng khi đến hạn và shop vẫn đủ quyền video'
  })

  return json({
    status: 'ok',
    message: 'Đã tạo lịch upload video. Job sẽ chạy khi đến giờ và chỉ áp dụng cho shop đang chọn.',
    row
  }, cors)
}

export async function handleVideoUploadQueueList(request, env, cors) {
  const url = new URL(request.url)
  const data = await listMarketplaceVideoUploadQueue(env, {
    platform: url.searchParams.get('platform') || 'shopee',
    shop: url.searchParams.get('shop') || '',
    status: url.searchParams.get('status') || 'all',
    limit: url.searchParams.get('limit') || 40,
    includeResult: Number(url.searchParams.get('include_result') || 0) === 1
  })
  return json({
    status: 'ok',
    ...data,
    now_local: localDateTimeText()
  }, cors)
}

export async function handleVideoUploadQueueFile(request, env, cors) {
  const url = new URL(request.url)
  const queueId = cleanVideoText(url.searchParams.get('queue_id') || url.searchParams.get('id'))
  if (!queueId) return new Response('Thiếu mã job video.', { status: 400, headers: cors })
  const row = await getMarketplaceVideoUploadQueueJob(env, queueId, { includeResult: true })
  if (!row || !cleanVideoText(row.r2_key)) return new Response('Không tìm thấy file video nguồn.', { status: 404, headers: cors })
  const object = await env.STORAGE.get(row.r2_key)
  if (!object) return new Response('File video nguồn không còn trong R2.', { status: 404, headers: cors })
  const headers = new Headers(cors)
  headers.set('Content-Type', object.httpMetadata?.contentType || row.file_type || 'video/mp4')
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Content-Disposition', `attachment; filename="${safeVideoFileName(row.file_name || 'video.mp4')}"`)
  return new Response(object.body, { headers })
}

export async function handleVideoUploadQueueBrowserStatus(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const queueId = cleanVideoText(body.queue_id || body.id)
  const status = cleanVideoText(body.status)
  const allowed = new Set([
    'browser_upload_required',
    'browser_opening',
    'browser_uploading',
    'browser_preview_ready',
    'browser_login_required',
    'browser_error',
    'browser_posted'
  ])
  if (!queueId || !allowed.has(status)) {
    return json({ status: 'error', message: 'Thiếu mã job hoặc trạng thái Chrome local không hợp lệ.' }, cors, 400)
  }
  const current = await getMarketplaceVideoUploadQueueJob(env, queueId, { includeResult: true })
  if (!current) return json({ status: 'error', message: 'Không tìm thấy job video.' }, cors, 404)
  const resultPayload = {
    ...(current.result_payload || {}),
    ...(body.result_payload && typeof body.result_payload === 'object' ? body.result_payload : {}),
    browser_status_updated_at: localDateTimeText()
  }
  const updated = await updateMarketplaceVideoUploadQueueJob(env, current.id, {
    status,
    last_error: cleanVideoText(body.last_error || body.message),
    result_payload: resultPayload,
    started_at: status === 'browser_opening' ? localDateTimeText() : current.started_at,
    finished_at: status === 'browser_posted' ? localDateTimeText() : current.finished_at
  })
  await saveMarketplaceVideoActionLog(env, {
    platform: current.platform || 'shopee',
    shop: current.shop,
    api_shop_id: current.api_shop_id,
    action_type: 'browser_upload_video_preview',
    action_status: status,
    request_payload: body,
    result_payload: updated,
    note: 'Cập nhật trạng thái job đăng video bằng Chrome local cho shop chưa có Shopee Video API.'
  })
  return json({
    status: 'ok',
    message: status === 'browser_posted' ? 'Đã đánh dấu video đã đăng tay.' : 'Đã cập nhật trạng thái Chrome local cho job video.',
    row: updated
  }, cors)
}

export async function handleVideoUploadQueueCancel(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const queueId = cleanVideoText(body.queue_id || body.id)
  if (!queueId) return json({ status: 'error', message: 'Thiếu mã lịch upload video để hủy.' }, cors, 400)
  const row = await getMarketplaceVideoUploadQueueJob(env, queueId, { includeResult: true })
  if (!row) return json({ status: 'error', message: 'Không tìm thấy lịch upload video.' }, cors, 404)
  if (['processing', 'done'].includes(row.status)) {
    return json({ status: 'error', message: 'Job đang chạy hoặc đã hoàn tất nên không thể hủy.' }, cors, 400)
  }
  const updated = await updateMarketplaceVideoUploadQueueJob(env, row.id, {
    status: 'cancelled',
    last_error: cleanVideoText(body.reason) || 'Người vận hành hủy lịch upload.',
    result_payload: {
      cancelled_at: localDateTimeText(),
      previous_status: row.status
    },
    finished_at: localDateTimeText()
  })
  if (cleanVideoText(row.r2_key)) {
    const usage = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM marketplace_video_upload_queue
      WHERE r2_key = ? AND id <> ?
    `).bind(row.r2_key, row.id).first()
    // Chiến dịch đa shop dùng chung một file R2 cho nhiều job, nên chỉ xóa file khi không còn job nào tham chiếu.
    if (!numberValue(usage?.count)) {
      await env.STORAGE.delete(row.r2_key).catch(() => null)
    }
  }
  await saveMarketplaceVideoActionLog(env, {
    platform: 'shopee',
    shop: row.shop,
    api_shop_id: row.api_shop_id,
    action_type: 'queue_upload_cancel',
    action_status: 'cancelled',
    request_payload: body,
    result_payload: updated,
    note: 'Hủy lịch upload video trước khi cron đăng thật'
  })
  return json({
    status: 'ok',
    message: 'Đã hủy lịch upload video.',
    row: updated
  }, cors)
}

export async function runVideoUploadQueueBatch(env, options = {}) {
  const maxJobs = Math.min(Math.max(Number(options.max_jobs || 1) || 1, 1), 3)
  const claimed = await claimDueMarketplaceVideoUploadJobs(env, {
    platform: 'shopee',
    limit: maxJobs
  })
  const result = {
    status: 'ok',
    selected_jobs: claimed.length,
    done: 0,
    failed: 0,
    rows: []
  }

  for (const job of claimed) {
    try {
      const shop = await loadShopeeVideoShop(env, job.shop)
      if (!shop) throw new Error('Không tìm thấy shop Shopee API cho lịch upload.')
      const object = await env.STORAGE.get(job.r2_key)
      if (!object) throw new Error('Không tìm thấy file video nguồn trong R2.')
      const uploadResult = await uploadShopeeVideoFromBuffer(env, shop, {
        arrayBuffer: await object.arrayBuffer(),
        fileName: job.file_name,
        durationSeconds: job.duration_seconds,
        caption: job.caption,
        itemRows: job.item_rows,
        allowDuet: job.allow_duet,
        allowStitch: job.allow_stitch,
        coverImageUrl: job.cover_image_url,
        actionType: 'auto_upload_post_video',
        queueId: job.queue_id,
        scheduledAt: job.scheduled_at,
        note: 'Cron upload video theo lịch đã duyệt'
      })
      const updated = await updateMarketplaceVideoUploadQueueJob(env, job.id, {
        status: 'done',
        result_payload: uploadResult,
        last_error: '',
        finished_at: localDateTimeText()
      })
      result.done += 1
      result.rows.push(updated)
    } catch (error) {
      const message = cleanVideoText(error?.message) || 'Upload video theo lịch thất bại.'
      const updated = await updateMarketplaceVideoUploadQueueJob(env, job.id, {
        status: 'error',
        last_error: message,
        result_payload: { message },
        finished_at: localDateTimeText()
      })
      await saveMarketplaceVideoActionLog(env, {
        platform: 'shopee',
        shop: job.shop,
        api_shop_id: job.api_shop_id,
        action_type: 'auto_upload_post_video',
        action_status: 'error',
        request_payload: {
          queue_id: job.queue_id,
          scheduled_at: job.scheduled_at,
          file_name: job.file_name
        },
        result_payload: { message },
        note: 'Cron upload video theo lịch bị lỗi và dừng ở job hiện tại'
      })
      result.failed += 1
      result.rows.push(updated)
    }
  }
  return result
}

export async function handleVideoUploadQueueRun(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  if (Number(body.dry_run || 0) === 1) {
    const queue = await listMarketplaceVideoUploadQueue(env, {
      platform: 'shopee',
      shop: body.shop || '',
      status: 'queued',
      limit: body.limit || 30
    })
    const nowLocal = localDateTimeText()
    const dueRows = (queue.rows || []).filter(row => cleanVideoText(row.scheduled_at) <= nowLocal)
    return json({
      status: 'ok',
      dry_run: true,
      now_local: nowLocal,
      selected_jobs: dueRows.length,
      rows: dueRows
    }, cors)
  }
  const result = await runVideoUploadQueueBatch(env, {
    max_jobs: body.max_jobs || 1
  })
  return json(result, cors)
}
