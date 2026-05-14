// NEO: Backend worker chat sàn - nhóm display-conversation-enrich. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function dedupeChatConversations(rows, aliasToKey, byKey, limit = 50) {
  const map = new Map()
  for (const raw of rows || []) {
    const row = canonicalizeChatConversationRow(raw, aliasToKey, byKey)
    const platform = cleanText(row.platform).toLowerCase()
    const shopKey = row.canonical_shop_key || row.shop
    const buyerId = cleanText(row.buyer_id)
    const identityKey = preferredChatIdentityKey(row)
    const weakIdentity = isWeakChatConversationIdentity(row) && !allowLazadaNameIdentityBridge(row)
    const canonicalConversationId = cleanText(row.canonical_conversation_id || row.conversation_id)
    // Shopee thường phát sinh alias conversation_id (buyer_id/webchat-*), nên gộp theo buyer để không hiện hội thoại trùng.
    const key = identityKey && !weakIdentity
      ? `${platform}|${shopKey}|identity:${identityKey}`
      : platform === 'shopee' && buyerId
        ? `${platform}|${shopKey}|buyer:${buyerId}`
        : `${platform}|${shopKey}|conversation:${canonicalConversationId || row.conversation_id}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, row)
      continue
    }

    const existingAlias = platform === 'shopee' && isShopeeConversationAliasId(existing.conversation_id, existing.buyer_id)
    const incomingAlias = platform === 'shopee' && isShopeeConversationAliasId(row.conversation_id, row.buyer_id)
    const existingConversationId = cleanText(existing.conversation_id)
    const incomingConversationId = cleanText(row.conversation_id)
    const existingCanonicalId = cleanText(existing.canonical_conversation_id || existing.conversation_id)
    const incomingCanonicalId = canonicalConversationId
    const existingSource = cleanText(existing.source).toLowerCase()
    const incomingSource = cleanText(row.source).toLowerCase()
    const existingLazadaOfficialRow = platform === 'lazada' && isOfficialLazadaConversationId(existingConversationId)
    const incomingLazadaOfficialRow = platform === 'lazada' && isOfficialLazadaConversationId(incomingConversationId)
    const existingAutomation = isAutomationConversationId(cleanText(existing.canonical_conversation_id || existing.conversation_id))
    const incomingAutomation = isAutomationConversationId(canonicalConversationId)
    const existingEpoch = chatConversationEpoch(existing.customer_last_message_at || existing.last_message_at || existing.updated_at || existing.created_at)
    const incomingEpoch = chatConversationEpoch(row.customer_last_message_at || row.last_message_at || row.updated_at || row.created_at)
    let shouldReplace = false
    if (platform === 'lazada' && incomingSource === 'api' && existingSource === 'automation' && incomingCanonicalId && incomingCanonicalId === existingCanonicalId) {
      // Nếu chưa có session id chuẩn nhưng đã có row lấy từ API, vẫn phải ưu tiên row API hơn preview automation cũ.
      shouldReplace = true
    } else if (platform === 'lazada' && existingSource === 'api' && incomingSource === 'automation' && existingCanonicalId && existingCanonicalId === incomingCanonicalId) {
      shouldReplace = false
    } else if (incomingLazadaOfficialRow && !existingLazadaOfficialRow && incomingCanonicalId && incomingCanonicalId === existingCanonicalId) {
      // Với Lazada, nếu cùng một canonical session IM thì phải ưu tiên row mang session chính thức thay vì alias automation cũ.
      shouldReplace = true
    } else if (existingLazadaOfficialRow && !incomingLazadaOfficialRow && existingCanonicalId && existingCanonicalId === incomingCanonicalId) {
      shouldReplace = false
    } else if (!incomingAutomation && existingAutomation) {
      shouldReplace = true
    } else if (incomingAutomation && !existingAutomation) {
      shouldReplace = false
    } else if (!incomingAlias && existingAlias) {
      shouldReplace = true
    } else if (incomingAlias && !existingAlias) {
      shouldReplace = false
    } else {
      shouldReplace = incomingEpoch > existingEpoch
    }

    if (shouldReplace) {
      const mergedUnread = Math.max(Number(existing.unread_count || 0), Number(row.unread_count || 0))
      map.set(key, {
        ...existing,
        ...row,
        unread_count: mergedUnread
      })
      continue
    }

    existing.unread_count = Math.max(Number(existing.unread_count || 0), Number(row.unread_count || 0))
    if (!existing.last_message_at) existing.last_message_at = row.last_message_at
    if (!existing.customer_last_message_at) existing.customer_last_message_at = row.customer_last_message_at
    if (!existing.last_message) existing.last_message = row.last_message
    if (!existing.buyer_name) existing.buyer_name = row.buyer_name
  }
  const collapsed = [...map.values()]
  const lazadaCanonicalMap = new Map()
  for (const row of collapsed) {
    const platform = cleanText(row.platform).toLowerCase()
    const canonicalConversationId = cleanText(row.canonical_conversation_id || row.conversation_id)
    if (platform !== 'lazada' || !isOfficialLazadaConversationId(canonicalConversationId)) continue
    const key = `${platform}|${row.canonical_shop_key || row.shop}|canonical:${canonicalConversationId}`
    const existing = lazadaCanonicalMap.get(key)
    if (!existing) {
      lazadaCanonicalMap.set(key, row)
      continue
    }

    const existingConversationId = cleanText(existing.conversation_id)
    const incomingConversationId = cleanText(row.conversation_id)
    const existingOfficialRow = isOfficialLazadaConversationId(existingConversationId)
    const incomingOfficialRow = isOfficialLazadaConversationId(incomingConversationId)
    const existingSource = cleanText(existing.source).toLowerCase()
    const incomingSource = cleanText(row.source).toLowerCase()
    const existingEpoch = chatConversationEpoch(existing.customer_last_message_at || existing.last_message_at || existing.updated_at || existing.created_at)
    const incomingEpoch = chatConversationEpoch(row.customer_last_message_at || row.last_message_at || row.updated_at || row.created_at)

    let keepIncoming = false
    if (incomingOfficialRow && !existingOfficialRow) {
      // Cùng một session IM chính thức thì luôn ưu tiên dòng đang giữ session_id thật thay vì alias automation cũ.
      keepIncoming = true
    } else if (!incomingOfficialRow && existingOfficialRow) {
      keepIncoming = false
    } else if (incomingSource === 'api' && existingSource === 'automation') {
      keepIncoming = true
    } else if (incomingSource === 'automation' && existingSource === 'api') {
      keepIncoming = false
    } else {
      keepIncoming = incomingEpoch > existingEpoch
    }

    if (keepIncoming) {
      lazadaCanonicalMap.set(key, {
        ...existing,
        ...row,
        unread_count: Math.max(Number(existing.unread_count || 0), Number(row.unread_count || 0))
      })
      continue
    }

    existing.unread_count = Math.max(Number(existing.unread_count || 0), Number(row.unread_count || 0))
    if (!existing.last_message_at) existing.last_message_at = row.last_message_at
    if (!existing.customer_last_message_at) existing.customer_last_message_at = row.customer_last_message_at
    if (!existing.last_message) existing.last_message = row.last_message
    if (!existing.buyer_name) existing.buyer_name = row.buyer_name
  }

  const finalRows = []
  const emittedLazadaKeys = new Set()
  for (const row of collapsed) {
    const platform = cleanText(row.platform).toLowerCase()
    const canonicalConversationId = cleanText(row.canonical_conversation_id || row.conversation_id)
    const key = `${platform}|${row.canonical_shop_key || row.shop}|canonical:${canonicalConversationId}`
    if (platform === 'lazada' && isOfficialLazadaConversationId(canonicalConversationId) && lazadaCanonicalMap.has(key)) {
      if (emittedLazadaKeys.has(key)) continue
      emittedLazadaKeys.add(key)
      finalRows.push(lazadaCanonicalMap.get(key))
      continue
    }
    finalRows.push(row)
  }

  return finalRows.slice(0, limit)
}

function chatRawMessageSource(rawPayload) {
  const raw = safeJsonParse(rawPayload, null)
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const data = root?.data && typeof root.data === 'object' ? root.data : {}
  const chat = data?.content && typeof data.content === 'object' ? data.content : {}
  return { ...root, data, chat }
}

function inferChatMessageSender(row = {}, conversation = {}) {
  const source = chatRawMessageSource(row.raw_payload)
  const storedType = cleanText(row.sender_type).toLowerCase()
  const shopIds = new Set([
    conversation.shop_id,
    conversation.shop,
    row.shop_id,
    row.shop
  ].map(cleanText).filter(Boolean))
  const fromShopId = firstText(source, [
    ['chat', 'from_shop_id'],
    ['data', 'content', 'from_shop_id'],
    ['data', 'from_shop_id'],
    ['from_shop_id']
  ])
  const senderTypeRaw = firstText(source, [
    ['chat', 'sender_type'],
    ['chat', 'from_type'],
    ['data', 'sender_type'],
    ['sender_type'],
    ['from_type']
  ]).toLowerCase()
  // Dữ liệu API cũ có thể lưu nhầm tin shop thành buyer, nên khi đọc lại phải suy luận từ from_shop_id.
  const isShop = storedType === 'shop'
    || senderTypeRaw.includes('shop')
    || senderTypeRaw.includes('seller')
    || Boolean(fromShopId && shopIds.has(cleanText(fromShopId)))
  const fromName = firstText(source, [
    ['chat', 'from_user_name'],
    ['chat', 'from_name'],
    ['data', 'content', 'from_user_name'],
    ['data', 'content', 'from_name'],
    ['data', 'from_user_name'],
    ['data', 'from_name'],
    ['from_user_name'],
    ['from_name']
  ])
  const fromId = firstText(source, [
    ['chat', 'from_id'],
    ['data', 'content', 'from_id'],
    ['data', 'from_id'],
    ['from_id']
  ])
  if (isShop) {
    return {
      sender_type: 'shop',
      sender_name: fromName || cleanText(conversation.shop || row.shop || 'Shop'),
      sender_id: fromId || cleanText(row.sender_id)
    }
  }
  const storedName = cleanText(row.sender_name)
  const conversationName = cleanText(conversation.buyer_name)
  return {
    sender_type: storedType || 'buyer',
    sender_name: isUsefulBuyerName(storedName)
      ? storedName
      : (isUsefulBuyerName(conversationName) ? conversationName : (isUsefulBuyerName(fromName) ? fromName : 'Khách hàng')),
    sender_id: cleanText(row.sender_id || fromId)
  }
}

function shouldHideTikTokDisplayMessage(message = {}) {
  const platform = cleanText(message.platform).toLowerCase()
  if (platform !== 'tiktok') return false
  const senderType = cleanText(message.sender_type).toLowerCase()
  return isTikTokAutomationNoiseContent(message.content, {
    senderType,
    rawPayload: message.raw_payload
  })
}

function normalizeTikTokDisplayDedupKey(content = '') {
  let key = normalizeKeywordText(content)
  if (!key) return ''
  key = key
    .replace(/^\d{1,2} \d{1,2}(?: \d{2,4})?(?: \d{1,2} \d{2})?\s+/, '')
    .replace(/^shop huy van\s+/, '')
    .trim()
  return key
}

function filterChatDisplayMessages(conversation = {}, messages = []) {
  const platform = cleanText(conversation?.platform).toLowerCase()
  const list = Array.isArray(messages) ? messages : []
  if (platform === 'shopee') {
    // Shopee có nhiều row hệ thống (bundle, FAQ, prompt đánh giá) không phải nội dung CSKH thật.
    return list.filter(message => message && !classifyShopeeSystemNoiseMessage(message))
  }
  if (platform !== 'tiktok') return list
  const filtered = []
  let previous = null
  for (const message of list) {
    if (!message) continue
    if (shouldHideTikTokDisplayMessage(message)) continue
    const contentKey = normalizeTikTokDisplayDedupKey(message.content || '')
    const nowEpoch = chatConversationEpoch(message.sent_at || message.created_at)
    const prevEpoch = previous ? chatConversationEpoch(previous.sent_at || previous.created_at) : 0
    // Gộp tin trùng do automation quét lặp theo chu kỳ ngắn để luồng hội thoại dễ đọc.
    if (
      previous
      && contentKey
      && contentKey === normalizeTikTokDisplayDedupKey(previous.content || '')
      && nowEpoch > 0
      && prevEpoch > 0
      && Math.abs(nowEpoch - prevEpoch) <= 20 * 60 * 1000
    ) {
      continue
    }
    filtered.push(message)
    previous = message
  }
  return filtered
}

function hasChatOrderSignal(message = {}) {
  if (!message) return false
  if (extractChatOrderIds({}, [message]).length > 0) return true
  return normalizeMediaItems(message.media_items, message.raw_payload).some(item => chatOrderIdFromCard(item))
}

function mergeChatContextMessages(displayMessages = [], sourceMessages = []) {
  const merged = []
  const seen = new Set()
  for (const message of [...displayMessages, ...sourceMessages]) {
    if (!message) continue
    const key = cleanText(message.id)
      ? `row:${message.id}`
      : (cleanText(message.message_id)
        ? `msg:${message.sender_type || ''}:${message.message_id}`
        : `content:${message.sender_type || ''}:${message.sent_at || message.created_at || ''}:${normalizeTikTokDisplayDedupKey(message.content || '')}`)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(message)
  }
  return merged
}

async function enrichChatConversationDisplayNames(env, conversations = []) {
  const items = Array.isArray(conversations) ? conversations : []
  const needsName = items.filter(item => !isUsefulBuyerName(item.buyer_name))
  if (!needsName.length || !(await tableExists(env, 'marketplace_chat_messages'))) return items
  const ids = [...new Set(needsName.map(item => cleanText(item.conversation_id)).filter(Boolean))]
  if (!ids.length) return items
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, shop_id, conversation_id, sender_type, sender_name, sender_id, raw_payload, sent_at, created_at
    FROM marketplace_chat_messages
    WHERE conversation_id IN (${placeholders})
    ORDER BY datetime(COALESCE(NULLIF(sent_at, ''), created_at)) DESC, id DESC
    LIMIT 600
  `).bind(...ids).all()
  const byKey = new Map(items.map(item => [`${cleanText(item.platform).toLowerCase()}|${cleanText(item.conversation_id)}`, item]))
  for (const row of results || []) {
    const conversation = byKey.get(`${cleanText(row.platform).toLowerCase()}|${cleanText(row.conversation_id)}`)
    if (!conversation || isUsefulBuyerName(conversation.buyer_name)) continue
    const sender = inferChatMessageSender(row, conversation)
    if (sender.sender_type !== 'shop' && isUsefulBuyerName(sender.sender_name)) {
      conversation.buyer_name = sender.sender_name
    }
  }
  return items
}

function chatOrderIdFromCard(item = {}) {
  return normalizeOrderIdCandidate(item.order_sn || item.order_id || item.orderId || item.name, { allowNumeric: true })
}

function chatProductIdFromCard(item = {}) {
  return cleanText(item.item_id || item.itemId || item.product_id || item.productId || item.platform_item_id)
}

function chatProductPrimaryImage(product = {}) {
  const images = productArray(product.images)
  const variations = productArray(product.variations)
  return cleanText(images[0] || product.image_url || product.thumbnail_url || variations.find(item => cleanText(item.image_url))?.image_url)
}

Object.assign(globalThis, {
  dedupeChatConversations,
  chatRawMessageSource,
  inferChatMessageSender,
  shouldHideTikTokDisplayMessage,
  normalizeTikTokDisplayDedupKey,
  filterChatDisplayMessages,
  hasChatOrderSignal,
  mergeChatContextMessages,
  enrichChatConversationDisplayNames,
  chatOrderIdFromCard,
  chatProductIdFromCard,
  chatProductPrimaryImage
})
