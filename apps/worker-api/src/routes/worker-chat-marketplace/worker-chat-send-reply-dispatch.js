// NEO: Backend worker chat sàn - nhóm send-reply-dispatch. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function sendChatReply(request, env, cors) {
  await ensureChatTables(env)
  const parsed = await parseChatSendRequest(request)
  const body = parsed.body || {}
  let conversation = await getChatConversationForSend(env, body)
  if (!conversation) return json({ error: 'Không tìm thấy hội thoại cần gửi.' }, cors, 404)

  let content = cleanText(body.content || body.message)
  const sanitizedContent = sanitizeAiSupportReplyText(content)
  if (sanitizedContent.changed) content = sanitizedContent.text
  const requestedType = cleanText(body.message_type || body.type).toLowerCase()
  const productItemId = cleanText(body.product_item_id || body.item_id || body.platform_item_id || body.product_id)
  const productName = cleanText(body.related_product_name || body.product_name || body.item_name)
  const productUrl = cleanText(body.product_url || body.related_product_url)
  const dryRun = body.dry_run === true || body.preview_only === true
  const wantsProductCard = Boolean(productItemId && ['product', 'product_card', 'item', 'item_card'].includes(requestedType))
  const settings = await getChatSettings(env)
  if (content) {
    const guard = combineChatGuards(
      assessChatContent(content, settings),
      assessAiPolicy(content, settings)
    )
    if (!guard.allowed) {
      await recordChatPolicyViolation(env, {
        platform: conversation.platform,
        shop: conversation.shop,
        conversation_id: conversation.conversation_id,
        source: 'manual-send',
        provider: 'human',
        content,
        guard
      })
      return json({ status: 'blocked', ...guard }, cors, 400)
    }
  }

  const uploadFiles = [...(parsed.files || [])].slice(0, 6)
  const mediaItems = []
  const mediaUploads = []
  for (const file of uploadFiles) {
    const mediaItem = await storeChatMedia(env, file, conversation)
    mediaItems.push(mediaItem)
    mediaUploads.push({ file, media_item: mediaItem })
  }
  for (const item of (parsed.attachments || []).slice(0, 6 - mediaItems.length)) {
    if (item?.data_url || item?.dataUrl) {
      const mediaItem = await storeChatMedia(env, null, conversation, item)
      mediaItems.push(mediaItem)
      mediaUploads.push({ file: null, fallback: item, media_item: mediaItem })
    }
  }
  if (wantsProductCard && !content && !mediaItems.length) {
    const platform = cleanText(conversation.platform).toLowerCase()
    if (platform !== 'shopee') {
      return json({ error: 'Thẻ sản phẩm chính thức hiện chỉ hỗ trợ Shopee SellerChat API.' }, cors, 400)
    }
    conversation = await refreshShopeeConversationForOfficialSend(env, conversation)
    const official = await sendShopeeChatOfficial(env, conversation, {
      type: 'product',
      item_id: productItemId,
      dry_run: dryRun
    })
    if (dryRun && official.ok) {
      return json({
        status: 'ok',
        dry_run: true,
        sent_to_platform: false,
        delivery_status: 'dry_run',
        shopee_payload: official.payload,
        path: official.path
      }, cors)
    }
    if (!official.ok) {
      return json({
        status: 'error',
        sent_to_platform: false,
        delivery_status: 'platform_error',
        error: official.data?.error || 'shopee_send_failed',
        message: shopeeChatSendError(official) || 'Shopee từ chối gửi thẻ sản phẩm.'
      }, cors, 502)
    }
    const responseInfo = shopeeChatMessageResponse(official.data)
    const productMedia = [{
      type: 'product',
      url: productUrl || shopeeProductCardUrl(conversation.shop_id, productItemId),
      thumbnail_url: '',
      mime_type: '',
      name: productName || `Sản phẩm Shopee ${productItemId}`,
      size: 0,
      shop_id: conversation.shop_id,
      item_id: productItemId,
      source: 'shopee_official_send'
    }]
    const message = {
      platform: conversation.platform,
      shop: conversation.shop,
      shop_id: conversation.shop_id,
      // Shopee có thể trả conversation_id alias theo response; luôn bám hội thoại đang mở để không tách thread.
      conversation_id: conversation.conversation_id,
      buyer_id: conversation.buyer_id,
      buyer_name: conversation.buyer_name,
      message_id: responseInfo.message_id || `shopee-${simpleHash(`${conversation.id}|${Date.now()}|${productItemId}`)}`,
      sender_type: 'shop',
      sender_name: conversation.shop || 'Shop',
      sender_id: conversation.shop_id || '',
      message_type: responseInfo.message_type || 'product',
      content: `Shop gửi thẻ sản phẩm ${productItemId}`,
      media_items: productMedia,
      sent_at: normalizeApiChatTimestamp(responseInfo.created_timestamp) || new Date().toISOString(),
      delivery_status: 'sent_to_platform',
      platform_response: safeJsonStringify(official.data, '{}'),
      raw_payload: safeJsonStringify({
        source: 'oms_product_card_send',
        product_item_id: productItemId,
        shopee_payload: official.payload,
        shopee_response_conversation_id: cleanText(responseInfo.conversation_id)
      }, '{}')
    }
    await saveApiChatMessage(env, message)
    return json({
      status: 'ok',
      sent_to_platform: true,
      delivery_status: message.delivery_status,
      note: 'Đã gửi thẻ sản phẩm chính thức qua Shopee SellerChat API.',
      shopee: compactApiError(official.data),
      message
    }, cors)
  }

  if (mediaItems.length && cleanText(conversation.platform).toLowerCase() === 'shopee') {
    conversation = await refreshShopeeConversationForOfficialSend(env, conversation)
    const sentMessages = []
    const shopeeResults = []
    if (dryRun) {
      return json({
        status: 'ok',
        dry_run: true,
        sent_to_platform: false,
        delivery_status: 'dry_run',
        shopee_payloads: [
          content ? {
            type: 'text',
            path: '/api/v2/sellerchat/send_message',
            payload: { to_id: Number(conversation.buyer_id || 0), message_type: 'text', content: { text: content } }
          } : null,
          ...mediaItems.map(item => ({
            type: mediaKindFromMime(item.mime_type, item.type),
            upload_path: mediaKindFromMime(item.mime_type, item.type) === 'video' ? '/api/v2/sellerchat/upload_video' : '/api/v2/sellerchat/upload_image',
            result_path: mediaKindFromMime(item.mime_type, item.type) === 'video' ? '/api/v2/sellerchat/get_video_upload_result' : undefined,
            path: '/api/v2/sellerchat/send_message',
            payload: mediaKindFromMime(item.mime_type, item.type) === 'video'
              ? { to_id: Number(conversation.buyer_id || 0), message_type: 'video', content: item.url ? { video_url: absoluteChatMediaUrl(request, item) } : { video_upload_id: item.video_upload_id || item.video_id || 'uploaded_video_upload_id' } }
              : { to_id: Number(conversation.buyer_id || 0), message_type: 'image', content: { url: item.url ? absoluteChatMediaUrl(request, item) : 'uploaded_image_url' } }
          }))
        ].filter(Boolean)
      }, cors)
    }
    if (content) {
      const officialText = await sendShopeeChatOfficial(env, conversation, {
        type: 'text',
        content,
        dry_run: dryRun
      })
      if (!officialText.ok) {
        return json({
          status: 'error',
          sent_to_platform: false,
          delivery_status: 'platform_error',
          error: officialText.data?.error || 'shopee_send_failed',
          message: shopeeChatSendError(officialText) || 'Shopee từ chối gửi tin nhắn.'
        }, cors, 502)
      }
      const responseInfo = shopeeChatMessageResponse(officialText.data)
      const textMessage = {
        platform: conversation.platform,
        shop: conversation.shop,
        shop_id: conversation.shop_id,
        conversation_id: conversation.conversation_id,
        buyer_id: conversation.buyer_id,
        buyer_name: conversation.buyer_name,
        message_id: responseInfo.message_id || `shopee-${simpleHash(`${conversation.id}|${Date.now()}|${content}`)}`,
        sender_type: 'shop',
        sender_name: conversation.shop || 'Shop',
        sender_id: conversation.shop_id || '',
        message_type: responseInfo.message_type || 'text',
        content,
        media_items: [],
        sent_at: normalizeApiChatTimestamp(responseInfo.created_timestamp) || new Date().toISOString(),
        delivery_status: 'sent_to_platform',
        platform_response: safeJsonStringify(officialText.data, '{}'),
        raw_payload: safeJsonStringify({
          source: 'oms_text_send_with_media',
          content,
          shopee_payload: officialText.payload,
          shopee_response_conversation_id: cleanText(responseInfo.conversation_id)
        }, '{}')
      }
      await saveApiChatMessage(env, textMessage)
      sentMessages.push(textMessage)
      shopeeResults.push({ type: 'text', ...compactApiError(officialText.data) })
    }

    for (const upload of mediaUploads) {
      const mediaItem = { ...(upload.media_item || {}), ...(upload.fallback || {}) }
      const mediaKind = mediaKindFromMime(mediaItem.mime_type || upload.file?.type, mediaItem.type)
      const officialMedia = await sendShopeeChatOfficial(env, conversation, {
        type: mediaKind === 'video' ? 'video' : 'image',
        file: upload.file,
        media_item: mediaItem,
        direct_image_url: mediaKind === 'image' ? absoluteChatMediaUrl(request, mediaItem) : '',
        direct_video_url: mediaKind === 'video' ? absoluteChatMediaUrl(request, mediaItem) : '',
        direct_thumb_url: mediaKind === 'video' ? absoluteChatMediaUrl(request, mediaItem, 'thumbnail_url') : '',
        dry_run: dryRun
      })
      if (!officialMedia.ok) {
        return json({
          status: 'error',
          sent_to_platform: sentMessages.length > 0,
          delivery_status: sentMessages.length > 0 ? 'partial_platform_error' : 'platform_error',
          error: officialMedia.data?.error || (mediaKind === 'video' ? 'shopee_send_video_failed' : 'shopee_send_image_failed'),
          message: shopeeChatSendError(officialMedia) || (mediaKind === 'video' ? 'Shopee từ chối gửi video.' : 'Shopee từ chối gửi hình ảnh.'),
          sent_messages: sentMessages
        }, cors, 502)
      }
      const responseInfo = shopeeChatMessageResponse(officialMedia.data)
      const sentUrl = cleanText(
        officialMedia.upload?.image_url ||
        officialMedia.upload?.video_info?.video_url ||
        officialMedia.payload?.content?.url ||
        officialMedia.payload?.content?.video_url ||
        mediaItem.url
      )
      const sentMedia = [{
        ...upload.media_item,
        type: mediaKind === 'video' ? 'video' : 'image',
        url: sentUrl || upload.media_item?.url || '',
        thumbnail_url: cleanText(officialMedia.upload?.video_info?.thumb_url) || sentUrl || upload.media_item?.thumbnail_url || '',
        video_upload_id: cleanText(officialMedia.upload?.video_info?.video_upload_id || officialMedia.upload?.video_info?.video_id),
        source: 'shopee_official_send'
      }]
      const mediaMessage = {
        platform: conversation.platform,
        shop: conversation.shop,
        shop_id: conversation.shop_id,
        conversation_id: conversation.conversation_id,
        buyer_id: conversation.buyer_id,
        buyer_name: conversation.buyer_name,
        message_id: responseInfo.message_id || `shopee-media-${simpleHash(`${conversation.id}|${Date.now()}|${sentUrl}|${upload.media_item?.storage_key}`)}`,
        sender_type: 'shop',
        sender_name: conversation.shop || 'Shop',
        sender_id: conversation.shop_id || '',
        message_type: responseInfo.message_type || (mediaKind === 'video' ? 'video' : 'image'),
        content: mediaKind === 'video' ? 'Đã gửi video' : 'Đã gửi hình ảnh',
        media_items: sentMedia,
        sent_at: normalizeApiChatTimestamp(responseInfo.created_timestamp) || new Date().toISOString(),
        delivery_status: 'sent_to_platform',
        platform_response: safeJsonStringify(officialMedia.data, '{}'),
        raw_payload: safeJsonStringify({
          source: mediaKind === 'video' ? 'oms_video_send' : 'oms_image_send',
          shopee_upload: compactApiError(officialMedia.upload?.data),
          shopee_upload_result: compactApiError(officialMedia.upload?.upload_result?.data),
          shopee_payload: officialMedia.payload,
          local_media: upload.media_item,
          shopee_response_conversation_id: cleanText(responseInfo.conversation_id)
        }, '{}')
      }
      await saveApiChatMessage(env, mediaMessage)
      sentMessages.push(mediaMessage)
      shopeeResults.push({ type: mediaKind === 'video' ? 'video' : 'image', upload: compactApiError(officialMedia.upload?.data), upload_result: compactApiError(officialMedia.upload?.upload_result?.data), send: compactApiError(officialMedia.data) })
    }

    return json({
      status: 'ok',
      sent_to_platform: true,
      delivery_status: 'sent_to_platform',
      note: content ? 'Đã gửi text và media qua Shopee SellerChat API.' : 'Đã gửi media qua Shopee SellerChat API.',
      shopee: shopeeResults,
      messages: sentMessages
    }, cors)
  }
  if (!content && !mediaItems.length) return json({ error: 'Bạn cần nhập nội dung hoặc chọn ảnh/video để gửi.' }, cors, 400)

  if (content && !mediaItems.length && cleanText(conversation.platform).toLowerCase() === 'shopee') {
    conversation = await refreshShopeeConversationForOfficialSend(env, conversation)
    const official = await sendShopeeChatOfficial(env, conversation, {
      type: 'text',
      content,
      dry_run: dryRun
    })
    if (dryRun && official.ok) {
      return json({
        status: 'ok',
        dry_run: true,
        sent_to_platform: false,
        delivery_status: 'dry_run',
        shopee_payload: official.payload,
        path: official.path
      }, cors)
    }
    if (!official.ok) {
      return json({
        status: 'error',
        sent_to_platform: false,
        delivery_status: 'platform_error',
        error: official.data?.error || 'shopee_send_failed',
        message: shopeeChatSendError(official) || 'Shopee từ chối gửi tin nhắn.'
      }, cors, 502)
    }
    const responseInfo = shopeeChatMessageResponse(official.data)
    const message = {
      platform: conversation.platform,
      shop: conversation.shop,
      shop_id: conversation.shop_id,
      // Shopee có thể trả conversation_id alias theo response; luôn bám hội thoại đang mở để không tách thread.
      conversation_id: conversation.conversation_id,
      buyer_id: conversation.buyer_id,
      buyer_name: conversation.buyer_name,
      message_id: responseInfo.message_id || `shopee-${simpleHash(`${conversation.id}|${Date.now()}|${content}`)}`,
      sender_type: 'shop',
      sender_name: conversation.shop || 'Shop',
      sender_id: conversation.shop_id || '',
      message_type: responseInfo.message_type || 'text',
      content,
      media_items: [],
      sent_at: normalizeApiChatTimestamp(responseInfo.created_timestamp) || new Date().toISOString(),
      delivery_status: 'sent_to_platform',
      platform_response: safeJsonStringify(official.data, '{}'),
      raw_payload: safeJsonStringify({
        source: 'oms_text_send',
        content,
        shopee_payload: official.payload,
        shopee_response_conversation_id: cleanText(responseInfo.conversation_id)
      }, '{}')
    }
    await saveApiChatMessage(env, message)
    return json({
      status: 'ok',
      sent_to_platform: true,
      delivery_status: message.delivery_status,
      note: 'Đã gửi tin nhắn chính thức qua Shopee SellerChat API.',
      shopee: compactApiError(official.data),
      message
    }, cors)
  }

  if (content && !mediaItems.length && cleanText(conversation.platform).toLowerCase() === 'lazada') {
    const official = await sendLazadaChatOfficial(env, conversation, {
      content,
      dry_run: dryRun
    })
    if (dryRun) {
      return json({
        status: 'ok',
        dry_run: true,
        sent_to_platform: false,
        delivery_status: 'dry_run',
        lazada_payload: official.payload,
        path: official.path
      }, cors)
    }
    if (!official.ok) {
      return json({
        status: 'error',
        sent_to_platform: false,
        delivery_status: 'platform_error',
        error: official.data?.error || official.data?.code || 'lazada_send_failed',
        message: lazadaChatSendError(official) || 'Lazada từ chối gửi tin nhắn. Kiểm tra app đã có quyền In-house IM Chat chưa.'
      }, cors, 502)
    }
    const responseInfo = lazadaChatMessageResponse(official.data)
    const officialConversationId = cleanText(official.session_id || conversation.canonical_conversation_id || conversation.conversation_id)
    const message = {
      platform: conversation.platform,
      shop: conversation.shop,
      shop_id: conversation.shop_id,
      conversation_id: officialConversationId,
      canonical_conversation_id: officialConversationId,
      buyer_id: conversation.buyer_id,
      buyer_name: conversation.buyer_name,
      message_id: responseInfo.message_id || `lazada-${simpleHash(`${conversation.id}|${Date.now()}|${content}`)}`,
      sender_type: 'shop',
      sender_name: conversation.shop || 'Shop',
      sender_id: conversation.shop_id || '',
      message_type: responseInfo.message_type || 'text',
      content,
      media_items: [],
      sent_at: normalizeApiChatTimestamp(responseInfo.created_timestamp) || new Date().toISOString(),
      delivery_status: 'sent_to_platform',
      platform_response: safeJsonStringify(official.data, '{}'),
      raw_payload: safeJsonStringify({ source: 'oms_text_send', content, lazada_payload: official.payload }, '{}')
    }
    await saveApiChatMessage(env, message)
    return json({
      status: 'ok',
      sent_to_platform: true,
      delivery_status: message.delivery_status,
      note: 'Đã gửi tin nhắn chính thức qua Lazada IM API.',
      lazada: compactApiError(official.data),
      message
    }, cors)
  }

  const message = {
    platform: conversation.platform,
    shop: conversation.shop,
    shop_id: conversation.shop_id,
    conversation_id: conversation.conversation_id,
    buyer_id: conversation.buyer_id,
    buyer_name: conversation.buyer_name,
    message_id: `local-${simpleHash(`${conversation.id}|${Date.now()}|${content}|${mediaItems.map(item => item.storage_key).join('|')}`)}`,
    sender_type: 'shop',
    sender_name: conversation.shop || 'Shop',
    sender_id: conversation.shop_id || '',
    message_type: inferMessageType(content ? 'text' : '', mediaItems),
    content: content || mediaMessageSummary(mediaItems),
    media_items: mediaItems,
    sent_at: new Date().toISOString(),
    delivery_status: 'saved_to_oms',
    platform_response: safeJsonStringify({
      note: 'Media đã lưu vào OMS/R2. Cần cấu hình endpoint gửi chat media của sàn để đẩy tự động lên Shopee/Lazada.'
    }, '{}'),
    raw_payload: safeJsonStringify({ source: 'oms_manual_send', content, media_items: mediaItems }, '{}')
  }
  await saveApiChatMessage(env, message)
  return json({
    status: 'ok',
    sent_to_platform: false,
    delivery_status: message.delivery_status,
    note: 'Đã lưu ảnh/video vào OMS. Chưa báo gửi thành công lên sàn nếu chưa có endpoint gửi media của Shopee/Lazada.',
    message: {
      ...message,
      media_items: mediaItems
    }
  }, cors)
}

Object.assign(globalThis, {
  sendChatReply
})
