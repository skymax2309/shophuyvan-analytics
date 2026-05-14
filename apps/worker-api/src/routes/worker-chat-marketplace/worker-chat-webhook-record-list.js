// NEO: Backend worker chat sàn - nhóm webhook-record-list. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function extractChatMessageFromWebhook({ platform, shop, shop_id, event_code, body, processed_at }) {
  const raw = rootBody(body)
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : {}
  // Shopee webchat_push bọc message thật trong data.content, nên đưa ra nhánh chat để parser dùng chung.
  const chat = data?.content && typeof data.content === 'object' ? data.content : {}
  const source = { ...raw, data, chat }
  if (shouldSkipWebhookChatEvent(source)) return null

  const webhookShopId = cleanText(shop_id || firstText(source, [
    ['chat', 'to_shop_id'],
    ['chat', 'shop_id'],
    ['data', 'shop_id'],
    'shop_id'
  ]))
  const fromShopId = firstText(source, [['chat', 'from_shop_id'], ['data', 'from_shop_id'], 'from_shop_id'])
  const senderTypeRaw = firstText(source, [
    ['chat', 'sender_type'],
    ['chat', 'from_type'],
    ['data', 'sender_type'],
    ['data', 'message', 'sender_type'],
    ['data', 'sender', 'type'],
    'sender_type'
  ]).toLowerCase()
  const senderType = senderTypeRaw.includes('seller') || senderTypeRaw.includes('shop') || (fromShopId && webhookShopId && fromShopId === webhookShopId)
    ? 'shop'
    : (senderTypeRaw || 'buyer')
  const fromId = firstText(source, [['chat', 'from_id'], ['data', 'from_id'], ['data', 'message', 'from_id'], 'from_id'])
  const toId = firstText(source, [['chat', 'to_id'], ['data', 'to_id'], ['data', 'message', 'to_id'], 'to_id'])
  const fromName = firstText(source, [['chat', 'from_user_name'], ['chat', 'from_name'], ['data', 'from_user_name'], ['data', 'from_name'], ['data', 'message', 'from_name'], 'from_user_name', 'from_name'])
  const toName = firstText(source, [['chat', 'to_user_name'], ['chat', 'to_name'], ['data', 'to_user_name'], ['data', 'to_name'], 'to_user_name', 'to_name'])
  const conversationId = firstText(source, [
    ['chat', 'conversation_id'],
    ['chat', 'conversationId'],
    ['chat', 'conversationid'],
    ['data', 'conversation_id'],
    ['data', 'conversationId'],
    ['data', 'conversationid'],
    ['data', 'content', 'conversation_id'],
    ['data', 'thread_id'],
    ['data', 'session_id'],
    ['data', 'message', 'conversation_id'],
    ['data', 'message', 'conversationId'],
    ['data', 'msg', 'conversation_id'],
    ['data', 'messages', 0, 'conversation_id'],
    ['message', 'conversation_id'],
    ['messages', 0, 'conversation_id'],
    'conversation_id',
    'conversationId',
    'conversationid',
    'thread_id',
    'session_id'
  ])

  const buyerId = firstText(source, [
    ['chat', 'buyer_id'],
    ['chat', 'user_id'],
    ['data', 'buyer_id'],
    ['data', 'buyerId'],
    ['data', 'user_id'],
    ['data', 'from_id'],
    ['data', 'sender_id'],
    ['data', 'message', 'from_id'],
    ['data', 'message', 'sender_id'],
    ['data', 'sender', 'id'],
    'buyer_id',
    'user_id',
    'from_id',
    'sender_id'
  ]) || (senderType === 'shop' ? toId : fromId)

  const buyerName = firstText(source, [
    ['chat', 'buyer_name'],
    ['chat', 'user_name'],
    ['chat', 'from_user_name'],
    ['data', 'buyer_name'],
    ['data', 'user_name'],
    ['data', 'nickname'],
    ['data', 'from_name'],
    ['data', 'sender_name'],
    ['data', 'sender', 'name'],
    ['data', 'message', 'from_name'],
    'buyer_name',
    'user_name',
    'nickname',
    'from_name',
    'sender_name'
  ]) || (senderType === 'shop' ? toName : fromName)

  const mediaItems = normalizeMediaItems([...collectMediaItems(source), ...collectChatCards(source)])
  const content = webhookChatContentText(source, mediaItems)
  const messageType = inferMessageType(firstText(source, [
    ['chat', 'message_type'],
    ['chat', 'msg_type'],
    ['chat', 'type'],
    ['data', 'message_type'],
    ['data', 'msg_type'],
    ['data', 'content', 'message_type'],
    ['data', 'message', 'type'],
    ['data', 'messages', 0, 'type'],
    'message_type',
    'msg_type',
    'type'
  ]) || (content ? 'text' : 'notice'), mediaItems)
  const rawSentAt = firstText(source, [
    ['chat', 'sent_at'],
    ['chat', 'created_at'],
    ['chat', 'created_timestamp'],
    ['chat', 'timestamp'],
    ['data', 'sent_at'],
    ['data', 'created_at'],
    ['data', 'timestamp'],
    ['data', 'content', 'created_timestamp'],
    ['data', 'message', 'sent_at'],
    ['data', 'message', 'created_at'],
    ['data', 'message', 'timestamp'],
    ['data', 'messages', 0, 'sent_at'],
    ['data', 'messages', 0, 'created_at'],
    'sent_at',
    'created_at',
    'timestamp'
  ]) || cleanText(processed_at)
  const sentAt = normalizeApiChatTimestamp(rawSentAt) || cleanText(processed_at)

  const safeConversationId = conversationId || buyerId || `webchat-${cleanText(shop_id || shop || platform) || 'unknown'}`
  const fallbackContent = 'Webhook báo có tin nhắn mới nhưng chưa kèm nội dung. Cần quyền Chat/Webchat API để tải đầy đủ nội dung cuộc trò chuyện.'
  const finalContent = content || mediaMessageSummary(mediaItems) || fallbackContent
  const messageId = firstText(source, [
    ['chat', 'message_id'],
    ['chat', 'msg_id'],
    ['data', 'message_id'],
    ['data', 'msg_id'],
    ['data', 'content', 'message_id'],
    ['data', 'message', 'message_id'],
    ['data', 'message', 'msg_id'],
    ['data', 'messages', 0, 'message_id'],
    'message_id',
    'msg_id'
  ]) || `webhook-${simpleHash(`${platform}|${shop}|${safeConversationId}|${sentAt}|${finalContent}|${JSON.stringify(raw).slice(0, 500)}`)}`

  return {
    platform: cleanText(platform).toLowerCase(),
    shop: cleanText(shop),
    shop_id: webhookShopId,
    event_code: cleanText(event_code),
    conversation_id: safeConversationId,
    buyer_id: buyerId,
    buyer_name: buyerName || buyerId || 'Khách hàng',
    message_id: messageId,
    sender_type: senderType,
    sender_name: senderType === 'shop' ? (fromName || cleanText(shop)) : (buyerName || 'Khách hàng'),
    sender_id: senderType === 'shop' ? fromId : buyerId,
    message_type: messageType,
    content: finalContent,
    media_items: mediaItems,
    has_real_content: content || mediaItems.length ? 1 : 0,
    sent_at: sentAt,
    raw_payload: JSON.stringify(raw || {})
  }
}

async function recordChatWebhook(env, event, options = {}) {
  if (!options.skipEnsure) await ensureChatTables(env)
  let message = extractChatMessageFromWebhook(event)
  if (!message || !message.platform || !message.conversation_id) return { inserted: false, skipped: true }

  // Shopee webhook đôi khi chỉ trả buyer_id thay vì conversation_id thật -> remap để không sinh thêm hội thoại rác.
  message = await remapShopeeAliasConversation(env, message)
  const isAliasOnly = isShopeeConversationAliasId(message.conversation_id, message.buyer_id)
  if (cleanText(message.platform).toLowerCase() === 'shopee' && isAliasOnly && cleanText(message.sender_type).toLowerCase() === 'shop') {
    return { inserted: false, skipped_alias: true, message }
  }

  const shopeeNoise = classifyShopeeSystemNoiseMessage(message)
  if (shopeeNoise === 'bundle_summary') {
    const backfill = await enrichChatConversationFromApi(env, { ...message, has_real_content: 0 }).catch(() => null)
    return { inserted: false, skipped_system_noise: shopeeNoise, backfill, message }
  }
  if (shopeeNoise) {
    return { inserted: false, skipped_system_noise: shopeeNoise, message }
  }

  message = { ...message, source: 'webhook' }
  const inserted = await saveApiChatMessage(env, message)
  if (!inserted) return { inserted: false, skipped_duplicate: true, message }

  if (inserted) {
    await notifyChatSubscribers(env, message).catch(error => {
      console.error('[CHAT_PUSH]', error?.message || error)
    })
  }

  return { inserted, message }
}

async function backfillChatFromWebhookEvents(env, limit = 200) {
  await ensureChatTables(env)
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000)
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, event_code, payload, processed_at
    FROM marketplace_webhook_events
    WHERE lower(event_code) LIKE '%chat%'
       OR lower(event_code) LIKE '%message%'
       OR lower(event_code) LIKE '%conversation%'
    ORDER BY id DESC
    LIMIT ?
  `).bind(safeLimit).all()

  let scanned = 0
  let inserted = 0
  for (const row of results || []) {
    scanned++
    const payload = safeJsonParse(row.payload, {})
    const outcome = await recordChatWebhook(env, {
      platform: row.platform,
      shop: row.shop,
      shop_id: row.shop_id,
      event_code: row.event_code,
      body: payload?.body || payload,
      processed_at: row.processed_at
    }, { skipEnsure: true }).catch(error => ({ error: error.message }))
    if (outcome?.inserted) inserted++
  }
  return { scanned, inserted }
}

async function enrichTikTokConversationPreviews(env, conversations = []) {
  const list = Array.isArray(conversations) ? conversations : []
  const ids = [...new Set(
    list
      .filter(item => cleanText(item?.platform).toLowerCase() === 'tiktok')
      .map(item => cleanText(item?.conversation_id))
      .filter(Boolean)
  )]
  if (!ids.length) return list
  const placeholders = ids.map(() => '?').join(', ')
  const sql = `
    SELECT conversation_id, sender_type, content, sent_at, created_at, raw_payload, id
    FROM marketplace_chat_messages
    WHERE lower(platform) = 'tiktok'
      AND conversation_id IN (${placeholders})
    ORDER BY conversation_id ASC,
      COALESCE(
        ${chatSqlEpochSeconds("NULLIF(sent_at, '')")},
        ${chatSqlEpochSeconds('created_at')},
        0
      ) DESC,
      id DESC
    LIMIT ?
  `
  const { results } = await env.DB.prepare(sql).bind(...ids, Math.min(ids.length * 80, 4000)).all()
  const bestByConversation = new Map()
  for (const row of results || []) {
    const conversationId = cleanText(row.conversation_id)
    if (!conversationId || bestByConversation.has(conversationId)) continue
    if (isTikTokAutomationNoiseContent(row.content, {
      senderType: cleanText(row.sender_type).toLowerCase(),
      rawPayload: row.raw_payload
    })) {
      continue
    }
    bestByConversation.set(conversationId, {
      content: cleanText(row.content),
      sent_at: cleanText(row.sent_at || row.created_at)
    })
  }
  for (const conversation of list) {
    if (cleanText(conversation.platform).toLowerCase() !== 'tiktok') continue
    const candidate = bestByConversation.get(cleanText(conversation.conversation_id))
    if (candidate?.content) {
      conversation.last_message = candidate.content
      if (candidate.sent_at) conversation.last_message_at = candidate.sent_at
      continue
    }
    if (isTikTokAutomationNoiseContent(conversation.last_message, { senderType: 'shop' })) {
      // Nếu hội thoại chỉ còn dữ liệu hệ thống TikTok, hiển thị preview trung tính để tránh gây rối.
      conversation.last_message = 'Tin nhắn TikTok đã ẩn nội dung hệ thống'
    }
  }
  return list
}

async function listConversations(request, env, cors) {
  await ensureChatTables(env)
  const canonical = await loadCanonicalChatShops(env)
  const url = new URL(request.url)
  const where = []
  const params = []
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shop = cleanText(url.searchParams.get('shop'))
  const q = cleanText(url.searchParams.get('q'))
  const status = cleanText(url.searchParams.get('status'))
  const includeTests = url.searchParams.get('include_tests') === '1'
  const includeSummary = url.searchParams.get('include_summary') === '1'
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50) || 50, 1), 100)

  if (platform) {
    where.push('platform = ?')
    params.push(platform)
  }
  if (shop) {
    const aliases = new Set([shop])
    for (const item of canonical.items) {
      if (platform && item.platform !== platform) continue
      const itemAliases = [item.api_shop_id, item.display_name, item.shop_name, ...(item.aliases || [])]
      if (itemAliases.some(alias => normalizeChatShopAlias(alias) === normalizeChatShopAlias(shop))) {
        itemAliases.map(cleanText).filter(Boolean).forEach(alias => aliases.add(alias))
      }
    }
    const aliasValues = [...aliases]
    const placeholders = aliasValues.map(() => '?').join(', ')
    where.push(`(shop IN (${placeholders}) OR shop_id IN (${placeholders}))`)
    params.push(...aliasValues, ...aliasValues)
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (q) {
    where.push('(buyer_name LIKE ? OR buyer_id LIKE ? OR conversation_id LIKE ? OR last_message LIKE ? OR shop LIKE ? OR shop_id LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (!includeTests) {
    where.push("conversation_id NOT LIKE 'CHAT_TEST%'")
  }

  const fetchLimit = Math.min(limit * 3, 300)
  const customerMessageEpochSql = chatSqlEpochSeconds("COALESCE(NULLIF(m.sent_at, ''), m.created_at)")
  const conversationSortEpochSql = `
    COALESCE(
      ${chatSqlEpochSeconds('customer_last_message_at')},
      ${chatSqlEpochSeconds('c.last_message_at')},
      ${chatSqlEpochSeconds('c.updated_at')},
      ${chatSqlEpochSeconds('c.created_at')},
      0
    )
  `
  const sql = `
    SELECT
      c.id, c.platform, c.shop, c.shop_id, c.conversation_id, c.buyer_id, c.buyer_name,
      c.last_message, c.last_message_at, c.unread_count, c.status, c.source,
      c.canonical_conversation_id, c.identity_key, c.transport, c.scan_mode,
      c.updated_at, c.created_at,
      (
        SELECT MAX(datetime(${customerMessageEpochSql}, 'unixepoch'))
        FROM marketplace_chat_messages m
        WHERE m.platform = c.platform
          AND m.conversation_id = c.conversation_id
          AND (
            m.shop = c.shop
            OR m.shop_id = c.shop_id
            OR m.shop = c.shop_id
            OR m.shop_id = c.shop
          )
          AND lower(COALESCE(m.sender_type, '')) NOT IN ('shop', 'seller', 'staff', 'admin', 'agent')
      ) AS customer_last_message_at,
      (
        SELECT m.content
        FROM marketplace_chat_messages m
        WHERE m.platform = c.platform
          AND m.conversation_id = c.conversation_id
          AND (
            m.shop = c.shop
            OR m.shop_id = c.shop_id
            OR m.shop = c.shop_id
            OR m.shop_id = c.shop
          )
          AND lower(COALESCE(m.sender_type, '')) NOT IN ('shop', 'seller', 'staff', 'admin', 'agent')
        ORDER BY ${customerMessageEpochSql} DESC, m.id DESC
        LIMIT 1
      ) AS customer_last_message
    FROM marketplace_chat_conversations c
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    -- Ưu tiên sắp xếp theo thời điểm khách nhắn gần nhất để tránh tin shop đẩy hội thoại lên sai vị trí.
    ORDER BY ${conversationSortEpochSql} DESC, c.id DESC
    LIMIT ?
  `
  const { results } = await env.DB.prepare(sql).bind(...params, fetchLimit).all()
  let conversations = await enrichChatConversationDisplayNames(
    env,
    dedupeChatConversations(results || [], canonical.aliasToKey, canonical.byKey, limit)
  )
  conversations = await enrichTikTokConversationPreviews(env, conversations)
  let summary = null
  if (includeSummary) {
    const summaryWhere = includeTests ? '' : "WHERE conversation_id NOT LIKE 'CHAT_TEST%'"
    const { results: summaryRows } = await env.DB.prepare(`
      SELECT platform, shop, shop_id, conversation_id, unread_count
      FROM marketplace_chat_conversations
      ${summaryWhere}
      ORDER BY id DESC
      LIMIT 5000
    `).all()
    summary = summarizeChatConversations(summaryRows || [], canonical.aliasToKey)
  }
  return json({
    status: 'ok',
    conversations,
    summary
  }, cors)
}

Object.assign(globalThis, {
  extractChatMessageFromWebhook,
  recordChatWebhook,
  backfillChatFromWebhookEvents,
  enrichTikTokConversationPreviews,
  listConversations
})
