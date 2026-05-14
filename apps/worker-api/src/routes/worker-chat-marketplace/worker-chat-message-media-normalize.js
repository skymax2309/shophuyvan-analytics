// NEO: Backend worker chat sàn - nhóm message-media-normalize. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function looksLikeMediaUrl(value, hint = '') {
  const url = cleanText(value)
  if (!url) return false
  const lower = url.toLowerCase().split('?')[0]
  if (/^data:(image|video|audio)\//.test(lower)) return true
  if (!/^https?:\/\//.test(lower) && !lower.startsWith('/api/chat/media')) return false
  if (/\.(jpe?g|png|gif|webp|bmp|heic|heif|mp4|mov|m4v|webm|avi|mkv|mp3|m4a|wav)$/i.test(lower)) return true
  return /(image|img|photo|picture|video|media|attachment|file|thumbnail|thumb|cover|url)/i.test(hint)
}

function shopeeProductCardUrl(shopId, itemId) {
  const shop = cleanText(shopId)
  const item = cleanText(itemId)
  if (!shop || !item) return ''
  return `https://shopee.vn/product/${encodeURIComponent(shop)}/${encodeURIComponent(item)}`
}

function collectChatCards(source, path = [], output = []) {
  if (!source || output.length >= 20) return output
  if (Array.isArray(source)) {
    for (const item of source) collectChatCards(item, path, output)
    return output
  }
  if (typeof source === 'string') {
    const text = cleanText(source)
    if ((text.startsWith('{') || text.startsWith('[')) && /(order|item|product|card|shop_id|order_sn)/i.test(text)) {
      collectChatCards(safeJsonParse(text, null), path, output)
    }
    return output
  }
  if (typeof source !== 'object') return output
  if (['source_content', 'quoted_msg'].includes(cleanText(path[path.length - 1]).toLowerCase())) return output

  const content = source.content && typeof source.content === 'object' ? source.content : source
  const sourceContent = source.source_content && typeof source.source_content === 'object' ? source.source_content : {}
  const messageType = firstText(source, [['message_type'], ['msg_type'], ['type']]).toLowerCase()
  const shopId = firstText(content, [['shop_id'], ['shopid'], ['shopId']])
    || firstText(sourceContent, [['shop_id'], ['shopid'], ['shopId']])
    || firstText(source, [['shop_id'], ['from_shop_id'], ['to_shop_id']])
  const itemId = firstText(content, [['item_id'], ['itemid'], ['itemId'], ['product_id'], ['productId']])
    || firstText(sourceContent, [['item_id'], ['itemid'], ['itemId'], ['product_id'], ['productId']])
  const rawOrderSn = firstText(content, [['order_sn'], ['ordersn'], ['order_id'], ['orderId']])
    || firstText(sourceContent, [['order_sn'], ['ordersn'], ['order_id'], ['orderId']])
  const cardSource = firstText(content, [['card_source'], ['source']]) || firstText(sourceContent, [['card_source'], ['source']])
  const orderSn = rawOrderSn && rawOrderSn !== '0' ? rawOrderSn : ''

  if (itemId || messageType.includes('item') || messageType.includes('product')) {
    const url = firstText(content, [['url'], ['item_url'], ['itemUrl'], ['product_url'], ['productUrl'], ['action_url'], ['actionUrl'], ['link']])
      || firstText(sourceContent, [['url'], ['item_url'], ['itemUrl'], ['product_url'], ['productUrl'], ['action_url'], ['actionUrl'], ['link']])
      || shopeeProductCardUrl(shopId, itemId)
    const key = `product:${itemId || url}`
    if ((url || shopId) && (itemId || url) && !output.some(item => item._card_key === key)) {
      output.push({
        type: 'product',
        url,
        thumbnail_url: firstText(content, [['image_url'], ['imageUrl'], ['icon_url'], ['iconUrl'], ['image'], ['thumb_url'], ['thumbUrl'], ['thumbnail_url'], ['thumbnailUrl']])
          || firstText(sourceContent, [['image_url'], ['imageUrl'], ['icon_url'], ['iconUrl'], ['image'], ['thumb_url'], ['thumbUrl'], ['thumbnail_url'], ['thumbnailUrl']]),
        mime_type: '',
        name: firstText(content, [['item_name'], ['product_name'], ['name'], ['title']])
          || firstText(sourceContent, [['item_name'], ['product_name'], ['name'], ['title']])
          || 'Sản phẩm sàn',
        size: 0,
        shop_id: shopId,
        item_id: itemId,
        card_source: cardSource,
        source: 'marketplace_chat_card',
        _card_key: key
      })
    }
  }

  const isOrderCardMessage = orderSn && !messageType.includes('faq') && !messageType.includes('liveagent')
  if (isOrderCardMessage || messageType.includes('order')) {
    const key = `order:${orderSn}`
    if (orderSn && !output.some(item => item._card_key === key)) {
      output.push({
        type: 'order',
        url: `/pages/oms-dashboard.html?focus_order=${encodeURIComponent(orderSn)}`,
        thumbnail_url: '',
        mime_type: '',
        name: `Đơn hàng ${orderSn}`,
        size: 0,
        shop_id: shopId,
        order_sn: orderSn,
        card_source: cardSource,
        source: 'shopee_chat_card',
        _card_key: key
      })
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object') collectChatCards(value, [...path, key], output)
  }
  return output
}

function collectMediaItems(source, path = [], output = []) {
  if (!source || output.length >= 20) return output
  if (Array.isArray(source)) {
    for (const item of source) collectMediaItems(item, path, output)
    return output
  }
  if (typeof source === 'string') {
    const text = cleanText(source)
    const hint = path.join('_')
    if ((text.startsWith('{') || text.startsWith('[')) && /(url|image|img|photo|video|media|attachment|file|thumbnail|thumb|cover)/i.test(text)) {
      collectMediaItems(safeJsonParse(text, null), path, output)
    } else if (looksLikeMediaUrl(text, hint)) {
      output.push({
        type: mediaKindFromMime('', hint),
        url: text,
        thumbnail_url: '',
        mime_type: '',
        name: '',
        size: 0
      })
    }
    return output
  }
  if (typeof source !== 'object') return output

  const keys = Object.keys(source)
  const hint = [...path, ...keys].join('_')
  const mime = firstText(source, [
    ['mime_type'], ['mimeType'], ['content_type'], ['contentType'], ['file_type'], ['fileType']
  ])
  const explicitType = firstText(source, [
    ['media_type'], ['mediaType'], ['message_type'], ['msg_type'], ['type'], ['file_type'], ['fileType']
  ])
  const name = firstText(source, [
    ['file_name'], ['fileName'], ['filename'], ['name'], ['title']
  ])
  const size = Number(firstText(source, [['size'], ['file_size'], ['fileSize']]) || 0) || 0
  const thumbnail = firstText(source, [
    ['thumbnail_url'], ['thumbnailUrl'], ['thumb_url'], ['thumbUrl'], ['cover_url'], ['coverUrl'], ['preview_url'], ['previewUrl']
  ])

  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string') {
      const text = cleanText(value)
      if ((text.startsWith('{') || text.startsWith('[')) && /(url|image|img|photo|video|media|attachment|file|thumbnail|thumb|cover)/i.test(text)) {
        collectMediaItems(safeJsonParse(text, null), [...path, key], output)
      }
      if (looksLikeMediaUrl(text, `${hint}_${key}`)) {
        const type = mediaKindFromMime(mime, [explicitType, key, hint].filter(Boolean).join('_'))
        const url = text
        if (!output.some(item => item.url === url)) {
          output.push({
            type,
            url,
            thumbnail_url: thumbnail && thumbnail !== url ? thumbnail : '',
            mime_type: mime,
            name,
            size
          })
        }
      }
    }
    if (value && typeof value === 'object') {
      const childPath = explicitType ? [...path, key, explicitType] : [...path, key]
      collectMediaItems(value, childPath, output)
    }
  }
  return output
}

function normalizeMediaItems(value, rawPayload = '') {
  const parsed = Array.isArray(value)
    ? value
    : safeJsonParse(cleanText(value), [])
  const sourceItems = Array.isArray(parsed) ? parsed : []
  const items = sourceItems.map(item => {
    const url = cleanText(item?.url || item?.media_url || item?.file_url)
    const storageKey = cleanText(item?.storage_key || item?.key)
    return {
      type: mediaKindFromMime(item?.mime_type || item?.mimeType, item?.type || item?.media_type),
      url: url || (storageKey ? `/api/chat/media?key=${encodeURIComponent(storageKey)}` : ''),
      thumbnail_url: cleanText(item?.thumbnail_url || item?.thumbnailUrl || item?.preview_url || item?.previewUrl),
      mime_type: cleanText(item?.mime_type || item?.mimeType || item?.content_type || item?.contentType),
      name: cleanText(item?.name || item?.file_name || item?.fileName),
      size: Number(item?.size || item?.file_size || item?.fileSize || 0) || 0,
      storage_key: storageKey,
      source: cleanText(item?.source),
      shop_id: cleanText(item?.shop_id || item?.shopId),
      item_id: cleanText(item?.item_id || item?.itemId || item?.product_id || item?.productId),
      order_sn: cleanText(item?.order_sn || item?.ordersn || item?.order_id || item?.orderId),
      card_source: cleanText(item?.card_source || item?.cardSource),
      product: item?.product && typeof item.product === 'object' ? item.product : undefined,
      order: item?.order && typeof item.order === 'object' ? item.order : undefined
    }
  }).filter(item => item.url || item.storage_key || item.order_sn || item.item_id)

  if (rawPayload) {
    const raw = safeJsonParse(rawPayload, {})
    const rawSource = raw?.message && typeof raw.message === 'object' ? { ...raw, ...raw.message } : raw
    const rawType = firstText(rawSource, [['message_type'], ['msg_type'], ['type']]).toLowerCase()
    let mediaSource = rawSource
    let cardSource = rawSource
    if (rawSource?.source === 'automation' && rawSource.payload && typeof rawSource.payload === 'object') {
      mediaSource = { ...rawSource.payload }
      cardSource = rawSource.payload.raw_payload && typeof rawSource.payload.raw_payload === 'object'
        ? rawSource.payload.raw_payload
        : mediaSource
      // Payload automation chứa URL endpoint nội bộ của sàn; không quét nhánh đó như file/hình ảnh.
      delete mediaSource.raw_payload
    }
    if (!items.length) items.push(...collectMediaItems(mediaSource))
    items.push(...collectChatCards(mediaSource))
    if (cardSource !== mediaSource) items.push(...collectChatCards(cardSource))
    if (rawType) {
      for (const item of items) {
        if (item.type === 'file' && ['image', 'video', 'sticker'].some(type => rawType.includes(type))) {
          item.type = rawType.includes('video') ? 'video' : 'image'
        }
      }
    }
  }

  const seen = new Set()
  return items.filter(item => {
    const key = item.order_sn
      ? `order:${item.order_sn}`
      : (item.item_id ? `product:${item.shop_id || ''}:${item.item_id}` : (item._card_key || item.url || item.storage_key || `${item.type}:${item.name}`))
    if (!key || seen.has(key)) return false
    seen.add(key)
    delete item._card_key
    return true
  }).slice(0, 12)
}

function mediaMessageSummary(mediaItems = []) {
  const items = normalizeMediaItems(mediaItems)
  if (!items.length) return ''
  const images = items.filter(item => item.type === 'image').length
  const videos = items.filter(item => item.type === 'video').length
  const files = items.length - images - videos
  const parts = []
  if (images) parts.push(`${images} hình ảnh`)
  if (videos) parts.push(`${videos} video`)
  if (files) parts.push(`${files} file`)
  return `Đã gửi ${parts.join(', ')}`
}

function inferMessageType(type, mediaItems = []) {
  const cleanType = cleanText(type).toLowerCase()
  const items = normalizeMediaItems(mediaItems)
  if (!items.length) return cleanType || 'text'
  if (items.some(item => item.type === 'video')) return cleanType && cleanType !== 'text' ? cleanType : 'video'
  if (items.some(item => item.type === 'image')) return cleanType && cleanType !== 'text' ? cleanType : 'image'
  const cardOnly = items.every(item => ['product', 'order', 'voucher'].includes(cleanText(item.type).toLowerCase()))
  if (cardOnly) {
    if (cleanType && cleanType !== 'text') return cleanType
    return cleanType || cleanText(items[0]?.type) || 'text'
  }
  return cleanType && cleanType !== 'text' ? cleanType : 'file'
}

function shopeeBundleSummaryText(content = '') {
  return /^Shopee gom \d+ tin tự động trong phiên chat$/i.test(cleanText(content))
}

function parseShopeeFaqSuggestionContent(content = '') {
  const parsed = productObject(content)
  if (!parsed || Array.isArray(parsed)) return null
  const intents = Array.isArray(parsed.intents) ? parsed.intents : []
  const opening = cleanText(parsed.opening)
  const hasFaqShape = Object.prototype.hasOwnProperty.call(parsed, 'faq_id')
    || Object.prototype.hasOwnProperty.call(parsed, 'disable_seller_chat_button')
    || intents.length > 0
  if (!hasFaqShape) return null
  return {
    opening,
    intents,
    intent_titles: intents
      .map(item => cleanText(item?.text || item?.title || item?.content))
      .filter(Boolean)
  }
}

function isShopeeReviewPromptNoiseText(content = '', rawPayload = null) {
  const text = cleanText(content)
  if (!text) return false
  const lowerText = text.toLowerCase()
  if (lowerText.includes('{placeholder}')) return true
  const payload = rawPayload && typeof rawPayload === 'object'
    ? rawPayload
    : safeJsonParse(cleanText(rawPayload), null)
  const normalized = normalizeKeywordText(text)
  if (!normalized) return false
  const reviewHints = [
    'danh gia',
    'viet review',
    'rate to earn',
    'avalie',
    'califica',
    'beri ulasan',
    'nilaikan',
    '留下评价',
    '留下評價',
    'เขียนรีวิว'
  ]
  const rewardHints = [
    'shopee coin',
    'shopee coins',
    'koin shopee',
    'monedas shopee',
    'moedas shopee',
    '虾币',
    '蝦幣',
    ' xu'
  ]
  const hasReviewHint = reviewHints.some(item => lowerText.includes(item) || normalized.includes(item))
  const hasRewardHint = rewardHints.some(item => lowerText.includes(item) || text.includes(item))
  if (hasReviewHint && hasRewardHint) return true
  // Shopee đôi khi trả row chỉ có language + text cho cụm gợi ý đa ngôn ngữ, không phải tin khách thật.
  if (payload && typeof payload === 'object') {
    const payloadKeys = Object.keys(payload).sort().join('|')
    if (payloadKeys === 'language|text' && hasRewardHint) return true
  }
  return false
}

function classifyShopeeSystemNoiseMessage(message = {}) {
  const platform = cleanText(message.platform).toLowerCase()
  if (platform !== 'shopee') return ''
  const messageType = cleanText(message.message_type).toLowerCase()
  const content = cleanText(message.content)
  const rawPayload = message.raw_payload && typeof message.raw_payload === 'object'
    ? message.raw_payload
    : safeJsonParse(cleanText(message.raw_payload), null)
  const normalized = normalizeKeywordText(content)
  if (
    messageType.includes('faq')
    || parseShopeeFaqSuggestionContent(content)
    || (normalized === 'chat voi nguoi ban' && cleanText(message.sender_type).toLowerCase() !== 'shop')
  ) return 'faq_suggestion'
  // Shopee bắn bundle chỉ để báo có cụm tin mới; OMS phải kéo lại tin thật thay vì lưu câu tóm tắt giả.
  if (messageType === 'bundle_message' || shopeeBundleSummaryText(content)) return 'bundle_summary'
  if (isShopeeReviewPromptNoiseText(content, rawPayload)) return 'review_prompt'
  return ''
}

Object.assign(globalThis, {
  looksLikeMediaUrl,
  shopeeProductCardUrl,
  collectChatCards,
  collectMediaItems,
  normalizeMediaItems,
  mediaMessageSummary,
  inferMessageType,
  shopeeBundleSummaryText,
  parseShopeeFaqSuggestionContent,
  isShopeeReviewPromptNoiseText,
  classifyShopeeSystemNoiseMessage
})
