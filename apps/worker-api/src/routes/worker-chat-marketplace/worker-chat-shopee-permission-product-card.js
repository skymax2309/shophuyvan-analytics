// NEO: Backend worker chat sàn - nhóm shopee-permission-product-card. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function uploadShopeeChatVideo(env, shop, file, mediaItem = {}) {
  const mimeType = cleanText(file?.type || mediaItem.mime_type || mediaItem.mimeType || 'video/mp4')
  const name = sanitizeStoragePart(file?.name || mediaItem.name || `shopee-chat-video.${chatMediaExtension(mimeType, 'mp4')}`, 'shopee-chat-video')
  const kind = mediaKindFromMime(mimeType, mediaItem.type)
  if (kind !== 'video') {
    return {
      ok: false,
      status: 0,
      data: { error: 'unsupported_shopee_media', message: 'File này không phải video nên không gửi qua SellerChat video.' }
    }
  }
  const bytes = file?.arrayBuffer
    ? new Uint8Array(await file.arrayBuffer())
    : (mediaItem.data_url || mediaItem.dataUrl ? dataUrlToBytes(mediaItem.data_url || mediaItem.dataUrl)?.bytes : null)
  if (!bytes?.byteLength) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_video_file', message: 'Thiếu dữ liệu video để upload lên Shopee Chat.' }
    }
  }
  const path = '/api/v2/sellerchat/upload_video'
  const attempts = []
  for (const fieldName of ['video', 'file', 'video_file']) {
    const formData = new FormData()
    formData.append(fieldName, new File([bytes], name, { type: mimeType || 'video/mp4' }))
    const result = await callShopeeApiPath(env, shop, path, { method: 'POST', formData })
    const info = shopeeChatUploadedVideoInfo(result.data)
    attempts.push({ field_name: fieldName, http_status: result.status, video_id_found: Boolean(info.video_upload_id || info.video_id || info.video_url), ...compactApiError(result.data) })
    if (result.ok && (info.video_upload_id || info.video_id || info.video_url)) {
      const uploadResult = (info.video_upload_id || info.video_id)
        ? await getShopeeChatVideoUploadResult(env, shop, info).catch(error => ({
          ok: false,
          status: 0,
          data: { error: 'video_result_probe_failed', message: errorMessage(error, 'Không kiểm tra được kết quả upload video Shopee Chat.') }
        }))
        : null
      const resultInfo = uploadResult?.video_info || {}
      return {
        ...result,
        path,
        field_name: fieldName,
        video_info: { ...info, ...resultInfo },
        upload_result: uploadResult,
        attempts
      }
    }
    const errorText = normalizeKeywordText(shopeeChatSendError(result))
    if (result.ok || !/(param|parameter|required|missing|invalid|wrong|illegal|empty|file|video)/.test(errorText)) break
  }
  return {
    ok: false,
    status: attempts[attempts.length - 1]?.http_status || 0,
    data: {
      error: 'shopee_upload_video_failed',
      message: `Shopee upload_video đã tới được endpoint nhưng chưa nhận schema upload hiện tại. Các kiểu đã thử: ${attempts.map(item => `${item.field_name}: ${item.error || item.message || item.http_status}`).join(' | ')}. Cần schema chi tiết nếu endpoint vẫn trả lỗi tham số.`,
      attempts
    },
    path,
    attempts
  }
}

function classifyShopeeChatProbe(result = {}) {
  const data = result.data || {}
  if (result.ok) return 'ok'
  const error = cleanText(data.error).toLowerCase()
  const message = cleanText(data.message || data.msg || data.debug_message).toLowerCase()
  const text = `${error} ${message}`.trim()
  if (/invalid access[_\s-]*token|access_token.*invalid|token.*expired|invalid token/.test(text)) return 'token_invalid'
  if (/api does not exist|api not found|invalid api|illegal api|path not found|method not allowed/.test(text)) return 'endpoint_not_found'
  if (/permission|not authorized|unauthorized|access denied|forbidden|not opened|not open|api package|error_auth|no auth/.test(text)) return 'permission_blocked'
  if (/param|parameter|required|missing|invalid|wrong|illegal|empty|not exist/.test(text)) return 'reachable_param_error'
  if (Number(result.status || 0) === 401 || Number(result.status || 0) === 403) return 'permission_blocked'
  return 'error'
}

function summarizeShopeeChatProbeData(data = {}) {
  const response = data && typeof data.response === 'object' ? data.response : {}
  const arrays = findObjectArrays(response, ['conversation_list', 'message_list', 'messages', 'conversations', 'list', 'items'])
  const rowCount = arrays.sort((a, b) => b.length - a.length)[0]?.length || 0
  return {
    request_id: cleanText(data.request_id),
    response_keys: Object.keys(response || {}).slice(0, 20),
    row_count: rowCount
  }
}

function firstShopeeProbeConversationId(data = {}) {
  const rows = firstPreferredObjectArray(data, [
    ['response', 'conversation_list'],
    ['response', 'conversations'],
    ['conversation_list'],
    ['conversations'],
    ['data', 'conversation_list'],
    ['data', 'conversations']
  ], ['conversation_list', 'conversations', 'list', 'items'])
  for (const row of rows || []) {
    const conversationId = firstText(row, [
      ['conversation_id'], ['conversationId'], ['conversationid'], ['chat_id'], ['session_id']
    ])
    if (conversationId) return conversationId
  }
  return ''
}

async function loadShopeeChatProbeShop(env, shopFilter = '') {
  const filter = cleanText(shopFilter)
  const params = []
  const where = [
    "platform = 'shopee'",
    "access_token IS NOT NULL AND access_token != ''",
    "api_shop_id IS NOT NULL AND api_shop_id != ''"
  ]
  if (filter) {
    where.push('(CAST(id AS TEXT) = ? OR shop_name = ? OR user_name = ? OR api_shop_id = ?)')
    params.push(filter, filter, filter, filter)
  }
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop_name, user_name, api_shop_id, access_token, token_expire_at,
           api_partner_id, api_partner_key, api_redirect_url
    FROM shops
    WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN shop_name = ? OR user_name = ? OR api_shop_id = ? THEN 0 ELSE 1 END,
             CASE WHEN shop_name IS NOT NULL AND shop_name != '' THEN 0 ELSE 1 END,
             id DESC
    LIMIT 5
  `).bind(...params, filter, filter, filter).all()
  return dedupeApiShopRows(results || [])[0] || null
}

async function runShopeeChatPermissionProbeForShop(env, shop, options = {}) {
  const includeInvalidWriteProbe = options.include_invalid_write_probe !== false
  const explicitConversationId = cleanText(options.conversation_id)
  const attempts = []
  let conversationId = explicitConversationId

  const runProbe = async probe => {
    const skipped = probe.needs_conversation && !conversationId
    if (skipped) {
      const row = {
        stage: probe.stage,
        path: probe.path,
        method: probe.method || 'GET',
        safe_mode: probe.safe_mode || 'read_only',
        status: 'skipped',
        classification: 'missing_conversation_id',
        message: 'Chưa có conversation_id chính thức để probe endpoint này.'
      }
      attempts.push(row)
      return row
    }
    const params = typeof probe.params === 'function' ? probe.params(conversationId) : (probe.params || {})
    const body = typeof probe.body === 'function' ? probe.body(conversationId) : (probe.body || {})
    const result = await callShopeeApiPath(env, shop, probe.path, {
      method: probe.method || 'GET',
      params,
      body
    }).catch(error => ({
      ok: false,
      status: 0,
      data: { error: 'fetch_failed', message: errorMessage(error, 'Không gọi được Shopee API.') }
    }))
    const classification = classifyShopeeChatProbe(result)
    const row = {
      stage: probe.stage,
      path: probe.path,
      method: probe.method || 'GET',
      safe_mode: probe.safe_mode || 'read_only',
      ok: Boolean(result.ok),
      http_status: result.status,
      classification,
      ...compactApiError(result.data),
      summary: summarizeShopeeChatProbeData(result.data)
    }
    attempts.push(row)
    if (probe.stage === 'sellerchat_get_conversation_list' && result.ok && !conversationId) {
      conversationId = firstShopeeProbeConversationId(result.data)
      row.discovered_conversation_id = conversationId
    }
    return row
  }

  const readProbes = [
    { stage: 'auth_shop_info', path: '/api/v2/shop/get_shop_info', method: 'GET' },
    {
      stage: 'sellerchat_get_conversation_list',
      path: '/api/v2/sellerchat/get_conversation_list',
      method: 'GET',
      params: { direction: 'latest', type: 'all', page_size: 1 }
    },
    { stage: 'sellerchat_get_unread_conversation_count', path: '/api/v2/sellerchat/get_unread_conversation_count', method: 'GET' },
    {
      stage: 'sellerchat_get_message',
      path: '/api/v2/sellerchat/get_message',
      method: 'GET',
      needs_conversation: true,
      params: id => ({ conversation_id: id, page_size: 1, offset: '' })
    },
    {
      stage: 'sellerchat_get_one_conversation',
      path: '/api/v2/sellerchat/get_one_conversation',
      method: 'GET',
      needs_conversation: true,
      params: id => ({ conversation_id: id })
    },
    { stage: 'sellerchat_get_offer_toggle_status', path: '/api/v2/sellerchat/get_offer_toggle_status', method: 'GET' },
    { stage: 'sellerchat_get_offer_detail', path: '/api/v2/sellerchat/get_offer_detail', method: 'GET', params: { offer_id: 0 } }
  ]

  for (const probe of readProbes) await runProbe(probe)

  if (includeInvalidWriteProbe) {
    // Các probe ghi dùng payload trống/sai tham số để Shopee chỉ trả lỗi quyền hoặc lỗi tham số, không tạo tin nhắn hay thay đổi hội thoại thật.
    const invalidWriteProbes = [
      { stage: 'sellerchat_send_message_invalid_payload', path: '/api/v2/sellerchat/send_message', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_send' },
      { stage: 'sellerchat_send_autoreply_message_invalid_payload', path: '/api/v2/sellerchat/send_autoreply_message', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_send' },
      { stage: 'sellerchat_upload_image_invalid_payload', path: '/api/v2/sellerchat/upload_image', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_upload' },
      { stage: 'sellerchat_upload_video_invalid_payload', path: '/api/v2/sellerchat/upload_video', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_upload' },
      { stage: 'sellerchat_get_video_upload_result_invalid_payload', path: '/api/v2/sellerchat/get_video_upload_result', method: 'GET', params: {}, safe_mode: 'invalid_payload_no_state_change' },
      { stage: 'sellerchat_read_conversation_invalid_payload', path: '/api/v2/sellerchat/read_conversation', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_state_change' },
      { stage: 'sellerchat_unread_conversation_invalid_payload', path: '/api/v2/sellerchat/unread_conversation', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_state_change' },
      { stage: 'sellerchat_pin_conversation_invalid_payload', path: '/api/v2/sellerchat/pin_conversation', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_state_change' },
      { stage: 'sellerchat_unpin_conversation_invalid_payload', path: '/api/v2/sellerchat/unpin_conversation', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_state_change' },
      { stage: 'sellerchat_mute_conversation_invalid_payload', path: '/api/v2/sellerchat/mute_conversation', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_state_change' },
      { stage: 'sellerchat_unmute_conversation_invalid_payload', path: '/api/v2/sellerchat/unmute_conversation', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_state_change' },
      { stage: 'sellerchat_delete_conversation_invalid_payload', path: '/api/v2/sellerchat/delete_conversation', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_delete' },
      { stage: 'sellerchat_delete_message_invalid_payload', path: '/api/v2/sellerchat/delete_message', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_delete' },
      { stage: 'sellerchat_reply_offer_invalid_payload', path: '/api/v2/sellerchat/reply_offer', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_offer_action' },
      { stage: 'sellerchat_set_offer_toggle_status_invalid_payload', path: '/api/v2/sellerchat/set_offer_toggle_status', method: 'POST', body: {}, safe_mode: 'invalid_payload_no_offer_action' }
    ]
    for (const probe of invalidWriteProbes) await runProbe(probe)
  }

  if (options.include_sample_image_upload_probe) {
    const png = dataUrlToBytes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=')
    const file = {
      type: 'image/png',
      name: 'shopee-chat-probe.png',
      arrayBuffer: async () => png.bytes.buffer.slice(png.bytes.byteOffset, png.bytes.byteOffset + png.bytes.byteLength)
    }
    const upload = await uploadShopeeChatImage(env, shop, file, { type: 'image', mime_type: 'image/png', name: 'shopee-chat-probe.png' }).catch(error => ({
      ok: false,
      status: 0,
      data: { error: 'upload_probe_failed', message: errorMessage(error, 'Không upload được ảnh probe Shopee Chat.') }
    }))
    attempts.push({
      stage: 'sellerchat_upload_image_sample',
      path: '/api/v2/sellerchat/upload_image',
      method: 'POST',
      safe_mode: 'sample_upload_no_send',
      ok: Boolean(upload.ok),
      http_status: upload.status,
      classification: classifyShopeeChatProbe(upload),
      image_url_found: Boolean(upload.image_url),
      ...compactApiError(upload.data),
      summary: summarizeShopeeChatProbeData(upload.data)
    })
  }

  const counts = attempts.reduce((acc, item) => {
    const key = item.classification || item.status || 'unknown'
    acc[key] = Number(acc[key] || 0) + 1
    return acc
  }, {})
  return {
    status: 'ok',
    shop: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id),
    shop_id: cleanText(shop.api_shop_id),
    checked_at: new Date().toISOString(),
    invalid_write_probe: includeInvalidWriteProbe,
    safe_note: includeInvalidWriteProbe
      ? 'Endpoint ghi chỉ được gọi bằng payload trống/sai tham số để kiểm quyền; không gửi tin, không upload, không xóa, không đổi trạng thái hội thoại.'
      : 'Chỉ probe endpoint đọc, không gọi endpoint ghi.',
    discovered_conversation_id: conversationId,
    summary: counts,
    attempts
  }
}

async function probeShopeeChatPermissions(request, env, cors) {
  const admin = await requireAdminPermission(request, env, 'chat.reply')
  if (!admin.allowed) {
    return json({
      status: 'error',
      error: 'chat_probe_unauthorized',
      message: 'Thiếu phiên admin có quyền chat.reply để test quyền Shopee Chat API.'
    }, cors, 401)
  }
  const url = new URL(request.url)
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
  const shopFilter = cleanText(body.shop || body.shop_name || body.shop_id || url.searchParams.get('shop'))
  const shop = await loadShopeeChatProbeShop(env, shopFilter)
  if (!shop) {
    return json({
      status: 'error',
      error: 'shopee_api_shop_not_found',
      message: shopFilter
        ? `Không tìm thấy shop Shopee có token API khớp "${shopFilter}".`
        : 'Chưa có shop Shopee có token API để probe SellerChat.'
    }, cors, 404)
  }
  const result = await runShopeeChatPermissionProbeForShop(env, shop, {
    conversation_id: body.conversation_id || url.searchParams.get('conversation_id'),
    include_invalid_write_probe: body.include_invalid_write_probe !== false && url.searchParams.get('include_invalid_write_probe') !== '0',
    include_sample_image_upload_probe: body.include_sample_image_upload_probe === true || url.searchParams.get('include_sample_image_upload_probe') === '1'
  })
  return json(result, cors)
}

function buildShopeeProductCardPayload(conversation, itemId, messageType = 'item') {
  return {
    to_id: Number(conversation.buyer_id || 0),
    message_type: messageType,
    content: {
      item_id: Number(itemId)
    }
  }
}

function isShopeeFirstChatWithoutOrderInfo(result) {
  const text = normalizeKeywordText(`${result?.data?.error || ''} ${result?.data?.message || ''}`)
  return text.includes('first chat without order info')
    || (text.includes('no existing conversation') && text.includes('order information'))
    || (text.includes('must contain order information') && text.includes('users'))
}

Object.assign(globalThis, {
  uploadShopeeChatVideo,
  classifyShopeeChatProbe,
  summarizeShopeeChatProbeData,
  firstShopeeProbeConversationId,
  loadShopeeChatProbeShop,
  runShopeeChatPermissionProbeForShop,
  probeShopeeChatPermissions,
  buildShopeeProductCardPayload,
  isShopeeFirstChatWithoutOrderInfo
})
