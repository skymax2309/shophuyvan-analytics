// NEO: Backend worker chat sàn - nhóm shopee-send-official. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function shopeeOrderCardContent(order = {}, orderId = '') {
  const safeOrderId = cleanText(order.order_id || order.order_sn || orderId).toUpperCase()
  const status = cleanText(order.shipping_status || order.oms_status || order.order_status)
  return {
    order_id: safeOrderId,
    order_sn: safeOrderId,
    nss_shipping_id: safeOrderId,
    order_status: status,
    status,
    buyer_name: cleanText(order.buyer_username || order.customer_name || order.buyer_name),
    receiver_name: cleanText(order.customer_name || order.buyer_username),
    tracking_number: cleanText(order.tracking_number),
    order_name: safeOrderId ? `Đơn hàng ${safeOrderId}` : 'Đơn hàng',
    item_count: Number(order.item_count || 1) || 1
  }
}

async function loadShopeeOrderContextForConversation(env, conversation = {}, shop = null, options = {}) {
  const directOrderId = cleanText(options.order_id || options.order_sn || options.orderId || options.orderSn)
  const orderId = directOrderId || await findOrderIdForConversation(env, conversation)
  if (!orderId) return null
  const aliases = [
    conversation.shop,
    conversation.shop_id,
    shop?.shop_name,
    shop?.user_name,
    shop?.api_shop_id
  ]
  const order = await loadOrderResolverOrderRow(env, 'shopee', aliases, orderId, {
    order_id: orderId,
    shop: cleanText(conversation.shop || shop?.shop_name),
    buyer_id: cleanText(conversation.buyer_id),
    buyer_username: cleanText(conversation.buyer_name)
  }).catch(() => ({ order_id: orderId }))
  return {
    ...(order || {}),
    order_id: cleanText(order?.order_id || orderId).toUpperCase()
  }
}

function shopeeTextWithOrderPayloadCandidates(toId, content, order = {}) {
  const orderContent = shopeeOrderCardContent(order, order.order_id)
  const orderId = cleanText(orderContent.order_sn || orderContent.order_id)
  if (!orderId) return []
  return [
    {
      strategy: 'text_content_order_sn',
      payload: {
        to_id: toId,
        message_type: 'text',
        content: { text: content, order_sn: orderId, order_id: orderId }
      }
    },
    {
      strategy: 'text_source_content_order',
      payload: {
        to_id: toId,
        message_type: 'text',
        content: { text: content },
        source_type: 'order',
        source_content: orderContent
      }
    }
  ]
}

async function retryShopeeTextWithOrderContext(env, shop, path, toId, content, order = {}) {
  const attempts = []
  for (const candidate of shopeeTextWithOrderPayloadCandidates(toId, content, order)) {
    const result = await callShopeeApiPath(env, shop, path, { method: 'POST', body: candidate.payload })
    attempts.push({ strategy: candidate.strategy, http_status: result.status, ...compactApiError(result.data) })
    if (result.ok) {
      return { ...result, path, payload: candidate.payload, shop, attempts, order_context: order }
    }
    const errorText = normalizeKeywordText(shopeeChatSendError(result))
    if (!/(first chat without order info|order information|param|parameter|required|missing|invalid|wrong|illegal|empty|source|content|order)/.test(errorText)) {
      break
    }
  }

  const orderContent = shopeeOrderCardContent(order, order.order_id)
  const orderId = cleanText(orderContent.order_sn || orderContent.order_id)
  if (!orderId) {
    return {
      ok: false,
      status: attempts[attempts.length - 1]?.http_status || 0,
      data: {
        error: 'missing_order_context',
        message: 'Shopee yêu cầu tin đầu tiên phải kèm thông tin đơn nhưng OMS chưa xác định được order_sn.',
        attempts
      },
      attempts
    }
  }

  // Khi Shopee chặn text đầu tiên, gửi thẻ đơn đúng ngữ cảnh trước rồi mới gửi lại nội dung khách cần.
  const orderPayload = {
    to_id: toId,
    message_type: 'order',
    content: orderContent
  }
  const orderResult = await callShopeeApiPath(env, shop, path, { method: 'POST', body: orderPayload })
  attempts.push({ strategy: 'order_card_bootstrap', http_status: orderResult.status, ...compactApiError(orderResult.data) })
  if (!orderResult.ok) {
    return {
      ok: false,
      status: orderResult.status,
      data: {
        error: 'send_order_context_failed',
        message: attempts.map(item => `${item.strategy}: ${item.error || item.message || item.http_status}`).join(' | '),
        attempts
      },
      attempts,
      path,
      payload: orderPayload,
      shop
    }
  }

  const textPayload = {
    to_id: toId,
    message_type: 'text',
    content: { text: content }
  }
  const textResult = await callShopeeApiPath(env, shop, path, { method: 'POST', body: textPayload })
  attempts.push({ strategy: 'text_after_order_card', http_status: textResult.status, ...compactApiError(textResult.data) })
  if (textResult.ok) {
    return {
      ...textResult,
      path,
      payload: textPayload,
      shop,
      attempts,
      order_context: order,
      bootstrap_order_payload: orderPayload,
      bootstrap_order_response: orderResult.data
    }
  }
  return {
    ok: false,
    status: textResult.status,
    data: {
      error: 'send_text_after_order_context_failed',
      message: attempts.map(item => `${item.strategy}: ${item.error || item.message || item.http_status}`).join(' | '),
      attempts,
      bootstrap_order_sent: true,
      bootstrap_order: compactApiError(orderResult.data)
    },
    attempts,
    path,
    payload: textPayload,
    shop,
    bootstrap_order_payload: orderPayload,
    bootstrap_order_response: orderResult.data
  }
}

async function sendShopeeChatOfficial(env, conversation, options = {}) {
  // Tất cả tin nhắn Shopee đi qua API chính thức để không tự dựng thẻ sản phẩm ngoài sàn.
  const shop = await loadShopeeChatShopForConversation(env, conversation)
  if (!shop) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_shopee_token', message: 'Shop Shopee chưa có token/API shop id để gửi chat chính thức.' }
    }
  }
  const toId = Number(conversation.buyer_id || 0)
  if (!Number.isFinite(toId) || toId <= 0) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_buyer_id', message: 'Shop có API nhưng hội thoại này chưa có buyer_id/to_id chính thức. OMS đã thử lấy buyer_user_id từ Order API và tìm thread SellerChat; nếu vẫn thiếu, cần đồng bộ lại đơn hoặc kiểm tra quyền order/get_order_detail.' }
    }
  }
  const path = '/api/v2/sellerchat/send_message'
  if (options.type === 'product') {
    const itemId = cleanText(options.item_id)
    if (!itemId || !Number.isFinite(Number(itemId))) {
      return {
        ok: false,
        status: 0,
        data: { error: 'missing_item_id', message: 'Thiếu item_id Shopee để gửi thẻ sản phẩm chính thức.' }
      }
    }
    const attempts = []
    for (const messageType of ['item', 'product']) {
      const payload = buildShopeeProductCardPayload(conversation, itemId, messageType)
      if (options.dry_run) return { ok: true, status: 200, dry_run: true, path, payload, shop }
      const result = await callShopeeApiPath(env, shop, path, { method: 'POST', body: payload })
      attempts.push({ message_type: messageType, http_status: result.status, ...compactApiError(result.data) })
      if (result.ok) return { ...result, path, payload, shop, attempts }
      const errorText = normalizeKeywordText(shopeeChatSendError(result))
      if (!/(message type|messagetype|message_type|type|param|parameter|invalid)/.test(errorText)) break
    }
    return {
      ok: false,
      status: attempts[attempts.length - 1]?.http_status || 0,
      data: {
        error: 'send_product_card_failed',
        message: attempts.map(item => `${item.message_type}: ${item.error || item.message || item.http_status}`).join(' | '),
        attempts
      }
    }
  }

  if (options.type === 'image') {
    const mediaItem = options.media_item || {}
    const directImageUrl = cleanText(options.direct_image_url || mediaItem.direct_image_url)
    if (options.dry_run) {
      const imageUrl = cleanText(options.image_url || directImageUrl || mediaItem.url || 'https://example.invalid/shopee-chat-image.jpg')
      const payload = {
        to_id: toId,
        message_type: 'image',
        content: { url: imageUrl }
      }
      return { ok: true, status: 200, dry_run: true, path, upload_path: '/api/v2/sellerchat/upload_image', payload, shop }
    }
    const upload = options.image_url
      ? { ok: true, image_url: cleanText(options.image_url), data: { response: { image_url: cleanText(options.image_url) } } }
      : await uploadShopeeChatImage(env, shop, options.file, mediaItem)
    const effectiveUpload = upload.ok
      ? upload
      : shopeeDirectMediaUploadFallback('image', directImageUrl, upload)
    if (!effectiveUpload?.ok) return { ...upload, shop }
    const attempts = []
    for (const contentKey of ['url', 'image_url']) {
      const payload = {
        to_id: toId,
        message_type: 'image',
        content: { [contentKey]: effectiveUpload.image_url }
      }
      const result = await callShopeeApiPath(env, shop, path, { method: 'POST', body: payload })
      attempts.push({ content_key: contentKey, http_status: result.status, ...compactApiError(result.data) })
      if (result.ok) return { ...result, path, payload, shop, upload: effectiveUpload, attempts }
      const errorText = normalizeKeywordText(shopeeChatSendError(result))
      if (!/(param|parameter|required|missing|invalid|wrong|illegal|empty|url|image)/.test(errorText)) break
    }
    return {
      ok: false,
      status: attempts[attempts.length - 1]?.http_status || 0,
      data: {
        error: 'send_image_failed',
        message: attempts.map(item => `${item.content_key}: ${item.error || item.message || item.http_status}`).join(' | '),
        attempts,
        upload: compactApiError(effectiveUpload.data),
        upload_error: compactApiError(upload.data),
        direct_url_fallback: Boolean(effectiveUpload.direct_url_fallback)
      },
      path,
      upload: effectiveUpload,
      attempts
    }
  }

  if (options.type === 'video') {
    const mediaItem = options.media_item || {}
    const directVideoUrl = cleanText(options.direct_video_url || mediaItem.direct_video_url)
    const directThumbUrl = cleanText(options.direct_thumb_url || mediaItem.direct_thumb_url || mediaItem.thumbnail_url)
    if (options.dry_run) {
      const payload = {
        to_id: toId,
        message_type: 'video',
        content: directVideoUrl
          ? { video_url: directVideoUrl, ...(directThumbUrl ? { thumb_url: directThumbUrl } : {}) }
          : { video_upload_id: cleanText(mediaItem.video_upload_id || mediaItem.video_id || 'uploaded_video_upload_id') }
      }
      return {
        ok: true,
        status: 200,
        dry_run: true,
        path,
        upload_path: '/api/v2/sellerchat/upload_video',
        result_path: '/api/v2/sellerchat/get_video_upload_result',
        payload,
        shop
      }
    }
    const upload = await uploadShopeeChatVideo(env, shop, options.file, mediaItem)
    const effectiveUpload = upload.ok
      ? upload
      : shopeeDirectMediaUploadFallback('video', directVideoUrl, upload, { thumb_url: directThumbUrl })
    if (!effectiveUpload?.ok) return { ...upload, shop }
    const info = effectiveUpload.video_info || {}
    const videoId = cleanText(info.video_upload_id || info.video_id)
    const videoUrl = cleanText(info.video_url || mediaItem.url)
    const thumbUrl = cleanText(info.thumb_url || mediaItem.thumbnail_url)
    const statusText = normalizeKeywordText(info.status)
    if (/(fail|failed|cancel|cancelled|reject|error)/.test(statusText)) {
      return {
        ok: false,
        status: effectiveUpload.status || 0,
        data: {
          error: 'shopee_video_upload_failed',
          message: `Shopee upload_video trả trạng thái lỗi: ${info.status}.`,
          upload: compactApiError(effectiveUpload.data)
        },
        upload: effectiveUpload
      }
    }
    const contentCandidates = [
      videoId ? { video_upload_id: videoId } : null,
      videoId ? { video_id: videoId } : null,
      videoUrl ? { video_url: videoUrl, ...(thumbUrl ? { thumb_url: thumbUrl } : {}) } : null,
      videoUrl ? { url: videoUrl, ...(thumbUrl ? { thumb_url: thumbUrl } : {}) } : null
    ].filter(Boolean)
    if (!contentCandidates.length) {
      return {
        ok: false,
        status: effectiveUpload.status || 0,
        data: {
          error: 'missing_uploaded_video_id',
          message: 'Shopee upload_video chưa trả video_upload_id/video_url để gửi tin video.',
          upload: compactApiError(effectiveUpload.data),
          upload_error: compactApiError(upload.data),
          direct_url_fallback: Boolean(effectiveUpload.direct_url_fallback)
        },
        upload: effectiveUpload
      }
    }
    const attempts = []
    for (const contentPayload of contentCandidates) {
      const payload = {
        to_id: toId,
        message_type: 'video',
        content: contentPayload
      }
      const result = await callShopeeApiPath(env, shop, path, { method: 'POST', body: payload })
      attempts.push({ content_keys: Object.keys(contentPayload), http_status: result.status, ...compactApiError(result.data) })
      if (result.ok) return { ...result, path, payload, shop, upload: effectiveUpload, attempts }
      const errorText = normalizeKeywordText(shopeeChatSendError(result))
      if (!/(param|parameter|required|missing|invalid|wrong|illegal|empty|video|upload|url|id)/.test(errorText)) break
    }
    return {
      ok: false,
      status: attempts[attempts.length - 1]?.http_status || 0,
      data: {
        error: 'send_video_failed',
        message: attempts.map(item => `${item.content_keys.join('+')}: ${item.error || item.message || item.http_status}`).join(' | '),
        attempts,
        upload: compactApiError(effectiveUpload.data),
        upload_error: compactApiError(upload.data),
        direct_url_fallback: Boolean(effectiveUpload.direct_url_fallback)
      },
      path,
      upload: effectiveUpload,
      attempts
    }
  }

  const content = cleanText(options.content).slice(0, 5000)
  if (!content) {
    return {
      ok: false,
      status: 0,
      data: { error: 'missing_text', message: 'Thiếu nội dung text để gửi qua Shopee.' }
    }
  }
  const payload = {
    to_id: toId,
    message_type: 'text',
    content: { text: content }
  }
  if (options.dry_run) return { ok: true, status: 200, dry_run: true, path, payload, shop }
  const result = await callShopeeApiPath(env, shop, path, { method: 'POST', body: payload })
  if (!result.ok && isShopeeFirstChatWithoutOrderInfo(result)) {
    const order = await loadShopeeOrderContextForConversation(env, conversation, shop, options)
    if (order?.order_id) {
      const retried = await retryShopeeTextWithOrderContext(env, shop, path, toId, content, order)
      return {
        ...retried,
        first_attempt: { http_status: result.status, ...compactApiError(result.data) },
        first_payload: payload
      }
    }
  }
  return { ...result, path, payload, shop }
}

function compactApiError(data) {
  return {
    code: cleanText(data?.code),
    error: cleanText(data?.error),
    message: cleanText(data?.message),
    request_id: cleanText(data?.request_id)
  }
}

function findObjectArrays(source, names, output = []) {
  if (!source || typeof source !== 'object') return output
  if (Array.isArray(source)) {
    if (source.some(item => item && typeof item === 'object')) output.push(source)
    for (const item of source) findObjectArrays(item, names, output)
    return output
  }
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value) && names.includes(key)) output.push(value)
    if (value && typeof value === 'object') findObjectArrays(value, names, output)
  }
  return output
}

function firstObjectArray(source, names) {
  const arrays = findObjectArrays(source, names)
  return arrays.sort((a, b) => b.length - a.length)[0] || []
}

function firstPreferredObjectArray(source, paths = [], fallbackNames = []) {
  for (const path of paths) {
    const value = valueAt(source, path)
    if (Array.isArray(value) && value.some(item => item && typeof item === 'object')) {
      return value
    }
  }
  return fallbackNames.length ? firstObjectArray(source, fallbackNames) : []
}

Object.assign(globalThis, {
  shopeeOrderCardContent,
  loadShopeeOrderContextForConversation,
  shopeeTextWithOrderPayloadCandidates,
  retryShopeeTextWithOrderContext,
  sendShopeeChatOfficial,
  compactApiError,
  findObjectArrays,
  firstObjectArray,
  firstPreferredObjectArray
})
