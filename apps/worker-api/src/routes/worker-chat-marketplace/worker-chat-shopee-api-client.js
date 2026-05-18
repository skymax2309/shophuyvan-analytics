// NEO: Backend worker chat sàn - nhóm shopee-api-client. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function callShopeeApiPath(env, shop, path, options = {}) {
  const method = cleanText(options.method || 'GET').toUpperCase() || 'GET'
  const url = await shopeeSignedUrl(env, shop, path, options.params || {})()
  const fetchOptions = { method }
  if (method !== 'GET') {
    if (options.formData) {
      // FormData để Shopee tự nhận boundary khi upload ảnh chat; không set Content-Type thủ công.
      fetchOptions.body = options.formData
    } else {
      fetchOptions.headers = { 'Content-Type': 'application/json' }
      fetchOptions.body = JSON.stringify(options.body || {})
    }
  }
  const res = await fetch(url, fetchOptions)
  const rawText = await res.text().catch(() => '')
  let data = {}
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { message: rawText.slice(0, 500) }
    }
  }
  const ok = res.ok && !cleanText(data.error)
  if (!ok && !cleanText(data.error || data.message)) {
    data.message = `Shopee API ${path} trả HTTP ${res.status} nhưng không có nội dung lỗi.`
  }
  return { ok, status: res.status, data }
}

async function loadShopeeChatShopForConversation(env, conversation) {
  if (cleanText(conversation?.platform).toLowerCase() !== 'shopee') return null
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const aliases = await resolveProductContextShopAliases(env, 'shopee', shop, shopId)
  const values = [...new Set([shop, shopId, ...aliases].map(cleanText).filter(Boolean))]
  if (!values.length) return null
  const placeholders = values.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id, access_token, refresh_token,
           chat_access_token, chat_refresh_token, token_expire_at, chat_token_expire_at,
           api_partner_id, api_partner_key, api_redirect_url, chat_api_redirect_url
    FROM shops
    WHERE platform = 'shopee'
      AND access_token IS NOT NULL AND access_token != ''
      AND (shop_name IN (${placeholders}) OR user_name IN (${placeholders}) OR api_shop_id IN (${placeholders}))
    ORDER BY CASE WHEN api_shop_id = ? THEN 0 ELSE 1 END,
             CASE WHEN shop_name = ? OR user_name = ? THEN 0 ELSE 1 END,
             id DESC
    LIMIT 5
  `).bind(...values, ...values, ...values, shopId, shop, shop).all()
  return dedupeApiShopRows(results || [])[0] || null
}

function shopeeChatSendError(result) {
  return cleanText(result?.data?.message || result?.data?.error || result?.data?.debug_message || result?.status)
}

function shopeeChatMessageResponse(data = {}) {
  const response = data.response && typeof data.response === 'object' ? data.response : {}
  return {
    message_id: cleanText(response.message_id || response.request_id || data.request_id),
    message_type: cleanText(response.message_type),
    conversation_id: cleanText(response.conversation_id),
    created_timestamp: response.created_timestamp || response.create_time || response.timestamp || '',
    raw: data
  }
}

function firstUrlDeep(source, preferredKeys = []) {
  const seen = new Set()
  const keys = preferredKeys.map(cleanText).filter(Boolean)
  const visit = value => {
    if (!value || seen.has(value)) return ''
    if (typeof value === 'string') {
      const text = cleanText(value)
      return /^https?:\/\//i.test(text) || text.startsWith('/api/chat/media') ? text : ''
    }
    if (typeof value !== 'object') return ''
    seen.add(value)
    for (const key of keys) {
      const found = visit(value[key])
      if (found) return found
    }
    for (const [key, child] of Object.entries(value)) {
      if (/url|image|media|file|thumb/i.test(key)) {
        const found = visit(child)
        if (found) return found
      }
    }
    for (const child of Object.values(value)) {
      const found = visit(child)
      if (found) return found
    }
    return ''
  }
  return visit(source)
}

function shopeeChatUploadedImageUrl(data = {}) {
  const response = data?.response && typeof data.response === 'object' ? data.response : data
  return firstUrlDeep(response, [
    'image_url',
    'url',
    'image',
    'image_info',
    'file_url',
    'media_url'
  ])
}

function firstTextDeep(source, preferredKeys = []) {
  const seen = new Set()
  const keys = preferredKeys.map(key => cleanText(key).toLowerCase()).filter(Boolean)
  const visit = (value, matchedKey = false) => {
    if (!value || seen.has(value)) return ''
    if (typeof value === 'string' || typeof value === 'number') return matchedKey ? cleanText(value) : ''
    if (typeof value !== 'object') return ''
    seen.add(value)
    for (const key of keys) {
      const direct = cleanText(value[key])
      if (direct) return direct
    }
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = cleanText(key).toLowerCase()
      if (keys.some(item => normalizedKey === item || normalizedKey.endsWith(item))) {
        const found = visit(child, true)
        if (found) return found
      }
    }
    for (const child of Object.values(value)) {
      const found = visit(child, false)
      if (found) return found
    }
    return ''
  }
  return visit(source, false)
}

function shopeeChatUploadedVideoInfo(data = {}) {
  const response = data?.response && typeof data.response === 'object' ? data.response : data
  const videoUploadId = firstTextDeep(response, [
    'video_upload_id',
    'upload_id',
    'video_id',
    'vid'
  ])
  return {
    video_upload_id: videoUploadId,
    video_id: firstTextDeep(response, ['video_id', 'vid']) || videoUploadId,
    video_url: firstUrlDeep(response, ['video_url', 'url', 'media_url', 'play_url', 'file_url']),
    thumb_url: firstUrlDeep(response, ['thumb_url', 'thumbnail_url', 'cover_url', 'cover_image_url', 'image_url']),
    status: firstTextDeep(response, ['status', 'upload_status', 'state', 'result_status'])
  }
}

function shopeeChatFileBlob(file, mediaItem = {}) {
  const mimeType = cleanText(file?.type || mediaItem.mime_type || mediaItem.mimeType || 'image/jpeg')
  const name = sanitizeStoragePart(file?.name || mediaItem.name || `shopee-chat-image.${chatMediaExtension(mimeType)}`, 'shopee-chat-image')
  return { mimeType, name }
}

async function uploadShopeeChatImage(env, shop, file, mediaItem = {}) {
  const { mimeType, name } = shopeeChatFileBlob(file, mediaItem)
  const kind = mediaKindFromMime(mimeType, mediaItem.type)
  if (kind !== 'image') {
    return {
      ok: false,
      status: 0,
      data: { error: 'unsupported_shopee_media', message: 'Shopee SellerChat API hiện chỉ xác nhận upload ảnh, chưa có upload video trong reference local.' }
    }
  }
  const bytes = file?.arrayBuffer
    ? new Uint8Array(await file.arrayBuffer())
    : (mediaItem.data_url || mediaItem.dataUrl ? dataUrlToBytes(mediaItem.data_url || mediaItem.dataUrl)?.bytes : null)
  if (!bytes?.byteLength) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_image_file', message: 'Thiếu dữ liệu ảnh để upload lên Shopee Chat.' }
    }
  }
  const path = '/api/v2/sellerchat/upload_image'
  const attempts = []
  for (const fieldName of ['image', 'file', 'image_file', 'images', 'upload_image']) {
    const formData = new FormData()
    formData.append(fieldName, new File([bytes], name, { type: mimeType || 'image/jpeg' }))
    const result = await callShopeeApiPath(env, shop, path, { method: 'POST', formData })
    const imageUrl = shopeeChatUploadedImageUrl(result.data)
    attempts.push({ field_name: fieldName, http_status: result.status, image_url_found: Boolean(imageUrl), ...compactApiError(result.data) })
    if (result.ok && imageUrl) return { ...result, path, field_name: fieldName, image_url: imageUrl, attempts }
    const errorText = normalizeKeywordText(shopeeChatSendError(result))
    if (result.ok || !/(param|parameter|required|missing|invalid|wrong|illegal|empty|file|image)/.test(errorText)) break
  }
  const base64 = bytesToBase64(bytes)
  const jsonBodies = [
    { label: 'json_image_base64', body: { image: base64 } },
    { label: 'json_image_data_url', body: { image: `data:${mimeType || 'image/png'};base64,${base64}` } },
    { label: 'json_file_base64', body: { file: base64, file_name: name } },
    { label: 'json_image_file_base64', body: { image_file: base64, file_name: name } },
    { label: 'json_image_object', body: { image: { data: base64, file_name: name, mime_type: mimeType || 'image/png' } } }
  ]
  for (const attempt of jsonBodies) {
    const result = await callShopeeApiPath(env, shop, path, { method: 'POST', body: attempt.body })
    const imageUrl = shopeeChatUploadedImageUrl(result.data)
    attempts.push({ field_name: attempt.label, http_status: result.status, image_url_found: Boolean(imageUrl), ...compactApiError(result.data) })
    if (result.ok && imageUrl) return { ...result, path, field_name: attempt.label, image_url: imageUrl, attempts }
    const errorText = normalizeKeywordText(shopeeChatSendError(result))
    if (result.ok || !/(param|parameter|required|missing|invalid|wrong|illegal|empty|file|image|base64)/.test(errorText)) break
  }
  return {
    ok: false,
    status: attempts[attempts.length - 1]?.http_status || 0,
    data: {
      error: 'shopee_upload_image_failed',
      message: `Shopee upload_image đã tới được endpoint nhưng chưa nhận schema upload hiện tại. Các kiểu đã thử đều trả lỗi tham số: ${attempts.map(item => `${item.field_name}: ${item.error || item.message || item.http_status}`).join(' | ')}. Cần mở được request schema chính thức của v2.sellerchat.upload_image trước khi bật gửi ảnh thật.`,
      attempts
    },
    path,
    attempts
  }
}

function shopeeDirectMediaUploadFallback(kind, url, upstream = null, extra = {}) {
  const mediaUrl = cleanText(url)
  if (!mediaUrl) return null
  const data = {
    error: '',
    message: 'Shopee upload media chưa nhận schema, OMS thử gửi bằng URL media công khai của file vừa chọn.',
    warning: 'direct_media_url_fallback',
    response: kind === 'video'
      ? { video_url: mediaUrl, thumb_url: cleanText(extra.thumb_url || extra.thumbnail_url) }
      : { image_url: mediaUrl }
  }
  return {
    ok: true,
    status: 200,
    data,
    direct_url_fallback: true,
    upload_error: upstream,
    image_url: kind === 'image' ? mediaUrl : '',
    video_info: kind === 'video'
      ? {
        video_url: mediaUrl,
        thumb_url: cleanText(extra.thumb_url || extra.thumbnail_url),
        status: 'DIRECT_URL_FALLBACK'
      }
      : {}
  }
}

async function getShopeeChatVideoUploadResult(env, shop, uploadInfo = {}) {
  const videoUploadId = cleanText(uploadInfo.video_upload_id || uploadInfo.video_id || uploadInfo.upload_id)
  if (!videoUploadId) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_video_upload_id', message: 'Thiếu video_upload_id để kiểm tra kết quả upload video Shopee Chat.' }
    }
  }
  const path = '/api/v2/sellerchat/get_video_upload_result'
  const attempts = []
  for (const params of [
    { video_upload_id: videoUploadId },
    { video_id: videoUploadId },
    { upload_id: videoUploadId }
  ]) {
    const result = await callShopeeApiPath(env, shop, path, { method: 'GET', params })
    const info = shopeeChatUploadedVideoInfo(result.data)
    attempts.push({ params, http_status: result.status, video_id_found: Boolean(info.video_upload_id || info.video_id || info.video_url), ...compactApiError(result.data) })
    if (result.ok && (info.video_upload_id || info.video_id || info.video_url || info.status)) {
      return { ...result, path, params, video_info: { ...uploadInfo, ...info }, attempts }
    }
    const errorText = normalizeKeywordText(shopeeChatSendError(result))
    if (!/(param|parameter|required|missing|invalid|wrong|illegal|empty|video|upload|id)/.test(errorText)) break
  }
  for (const body of [
    { video_upload_id: videoUploadId },
    { video_id: videoUploadId },
    { upload_id: videoUploadId }
  ]) {
    const result = await callShopeeApiPath(env, shop, path, { method: 'POST', body })
    const info = shopeeChatUploadedVideoInfo(result.data)
    attempts.push({ body, http_status: result.status, video_id_found: Boolean(info.video_upload_id || info.video_id || info.video_url), ...compactApiError(result.data) })
    if (result.ok && (info.video_upload_id || info.video_id || info.video_url || info.status)) {
      return { ...result, path, body, video_info: { ...uploadInfo, ...info }, attempts }
    }
    const errorText = normalizeKeywordText(shopeeChatSendError(result))
    if (!/(param|parameter|required|missing|invalid|wrong|illegal|empty|video|upload|id)/.test(errorText)) break
  }
  return {
    ok: false,
    status: attempts[attempts.length - 1]?.http_status || 0,
    data: {
      error: 'shopee_get_video_upload_result_failed',
      message: `Shopee get_video_upload_result chưa nhận schema hiện tại: ${attempts.map(item => `${JSON.stringify(item.params || item.body)}: ${item.error || item.message || item.http_status}`).join(' | ')}`,
      attempts
    },
    path,
    attempts
  }
}

Object.assign(globalThis, {
  callShopeeApiPath,
  loadShopeeChatShopForConversation,
  shopeeChatSendError,
  shopeeChatMessageResponse,
  firstUrlDeep,
  shopeeChatUploadedImageUrl,
  firstTextDeep,
  shopeeChatUploadedVideoInfo,
  shopeeChatFileBlob,
  uploadShopeeChatImage,
  shopeeDirectMediaUploadFallback,
  getShopeeChatVideoUploadResult
})
