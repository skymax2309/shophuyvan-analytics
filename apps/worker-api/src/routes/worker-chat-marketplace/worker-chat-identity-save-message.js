// NEO: Backend worker chat sàn - nhóm identity-save-message. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function shouldPreferIncomingOfficialCanonical(platform, incomingConversationId, canonicalConversationId) {
  const platformKey = cleanText(platform).toLowerCase()
  if (!isAutomationConversationId(canonicalConversationId)) return false
  if (platformKey === 'lazada') return isOfficialLazadaConversationId(incomingConversationId)
  if (platformKey === 'shopee') return isOfficialShopeeConversationId(incomingConversationId)
  return false
}

async function resolveLazadaOfficialConversationId(env, conversation) {
  const platform = cleanText(conversation?.platform).toLowerCase()
  if (platform !== 'lazada') return ''
  const shop = cleanText(conversation?.shop)
  const shopId = cleanText(conversation?.shop_id)
  const conversationId = cleanText(conversation?.conversation_id)
  const canonicalConversationId = cleanText(conversation?.canonical_conversation_id)
  if (isOfficialLazadaConversationId(canonicalConversationId)) return canonicalConversationId
  if (isOfficialLazadaConversationId(conversationId)) return conversationId
  if (!shop) return ''

  for (const aliasValue of [conversationId, canonicalConversationId].map(cleanText).filter(Boolean)) {
    const aliasRow = await env.DB.prepare(`
      SELECT canonical_conversation_id
      FROM chat_conversation_aliases
      WHERE lower(platform) = 'lazada'
        AND shop = ?
        AND alias_conversation_id = ?
        AND (? = '' OR shop_id = '' OR shop_id = ?)
      ORDER BY confidence DESC, updated_at DESC, id DESC
      LIMIT 1
    `).bind(shop, aliasValue, shopId, shopId).first().catch(() => null)
    const aliasCanonicalId = cleanText(aliasRow?.canonical_conversation_id)
    if (isOfficialLazadaConversationId(aliasCanonicalId)) return aliasCanonicalId
  }

  const identityKey = preferredChatIdentityKey(conversation)
  const buyerId = cleanText(conversation?.buyer_id)
  const buyerName = cleanText(conversation?.buyer_name)
  const where = []
  const params = []
  if (identityKey) {
    where.push('identity_key = ?')
    params.push(identityKey)
  }
  if (buyerId) {
    where.push('buyer_id = ?')
    params.push(buyerId)
  }
  if (isUsefulBuyerName(buyerName)) {
    where.push('lower(buyer_name) = lower(?)')
    params.push(buyerName)
  }
  if (!where.length) return ''

  const { results } = await env.DB.prepare(`
    SELECT conversation_id, canonical_conversation_id, last_message_at, updated_at, created_at
    FROM marketplace_chat_conversations
    WHERE lower(platform) = 'lazada'
      AND shop = ?
      AND (? = '' OR shop_id = '' OR shop_id = ?)
      AND conversation_id NOT LIKE 'CHAT_TEST%'
      AND conversation_id NOT LIKE 'automation-lazada-%'
      AND (${where.join(' OR ')})
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 10
  `).bind(shop, shopId, shopId, ...params).all().catch(() => ({ results: [] }))

  for (const row of results || []) {
    const officialConversationId = cleanText(row.canonical_conversation_id || row.conversation_id)
    if (isOfficialLazadaConversationId(officialConversationId)) return officialConversationId
    if (isOfficialLazadaConversationId(row.conversation_id)) return cleanText(row.conversation_id)
  }
  return ''
}

async function resolveChatCanonicalMessage(env, message) {
  const platform = cleanText(message?.platform).toLowerCase()
  const conversationId = cleanText(message?.conversation_id)
  const aliasCanonicalId = await loadAliasCanonicalConversation(env, message)
  if (aliasCanonicalId && !shouldPreferIncomingOfficialCanonical(platform, conversationId, aliasCanonicalId)) {
    await saveChatConversationAlias(env, message, aliasCanonicalId, 'alias_table', 0.98).catch(() => null)
    return { ...message, conversation_id: aliasCanonicalId, canonical_conversation_id: aliasCanonicalId }
  }

  const identityKey = chatIdentityKey(message)
  const shop = cleanText(message?.shop)
  const shopId = cleanText(message?.shop_id)
  if (!platform || !shop || !conversationId) {
    return { ...message, identity_key: identityKey, canonical_conversation_id: conversationId }
  }

  const buyerId = cleanText(message?.buyer_id)
  const buyerName = cleanText(message?.buyer_name)
  const buyerNameKey = normalizeKeywordText(buyerName)
  const canMatchName = buyerNameKey && !isGenericChatBuyerName(buyerName)

  const { results } = await env.DB.prepare(`
    SELECT conversation_id, buyer_id, buyer_name, identity_key, canonical_conversation_id,
           source, last_message_at, updated_at, created_at
    FROM marketplace_chat_conversations
    WHERE lower(platform) = ?
      AND shop = ?
      AND conversation_id != ?
      AND conversation_id NOT LIKE 'CHAT_TEST%'
      AND (? = '' OR shop_id = '' OR shop_id = ?)
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 30
  `).bind(platform, shop, conversationId, shopId, shopId).all().catch(() => ({ results: [] }))

  let matched = null
  for (const row of results || []) {
    const rowConversationId = cleanText(row.conversation_id)
    if (!rowConversationId) continue
    const rowIdentityKey = cleanText(row.identity_key)
    const rowBuyerId = cleanText(row.buyer_id)
    const rowBuyerNameKey = normalizeKeywordText(row.buyer_name)
    const sameBuyerId = buyerId && rowBuyerId && buyerId === rowBuyerId
    const sameIdentity = identityKey && rowIdentityKey && identityKey === rowIdentityKey
    const sameUsefulName = canMatchName && rowBuyerNameKey && rowBuyerNameKey === buyerNameKey
    if (sameBuyerId || sameIdentity || sameUsefulName) {
      matched = row
      break
    }
  }

  if (!matched) {
    return {
      ...message,
      identity_key: identityKey,
      canonical_conversation_id: cleanText(message?.canonical_conversation_id || conversationId)
    }
  }

  let canonicalId = cleanText(matched.canonical_conversation_id || matched.conversation_id)
  if (shouldPreferIncomingOfficialCanonical(platform, conversationId, canonicalId)) {
    const matchedConversationId = cleanText(matched.conversation_id)
    if (shouldAliasConversation(matchedConversationId, conversationId)) {
      await saveChatConversationAlias(env, {
        ...message,
        conversation_id: matchedConversationId,
        buyer_id: buyerId || cleanText(matched.buyer_id),
        buyer_name: buyerName || cleanText(matched.buyer_name),
        identity_key: cleanText(matched.identity_key)
      }, conversationId, `${platform}_official_preferred`, 0.98).catch(() => null)
      await env.DB.prepare(`
        UPDATE marketplace_chat_conversations
        SET canonical_conversation_id = ?,
            buyer_id = CASE WHEN ? != '' THEN ? ELSE buyer_id END,
            buyer_name = CASE WHEN ? != '' THEN ? ELSE buyer_name END,
            transport = CASE WHEN ? IN ('shopee', 'lazada') THEN 'api' ELSE transport END,
            scan_mode = CASE WHEN ? IN ('shopee', 'lazada') THEN 'api_direct' ELSE scan_mode END,
            updated_at = datetime('now', '+7 hours')
        WHERE lower(platform) = ?
          AND shop = ?
          AND conversation_id = ?
      `).bind(
        conversationId,
        buyerId, buyerId,
        buyerName, buyerName,
        platform,
        platform,
        platform,
        shop,
        matchedConversationId
      ).run().catch(() => null)
    }
    canonicalId = conversationId
  }
  if (!shouldAliasConversation(conversationId, canonicalId)) {
    return { ...message, identity_key: identityKey, canonical_conversation_id: canonicalId || conversationId }
  }

  // Core chỉ gộp hội thoại có dấu hiệu cùng khách, dữ liệu alias vẫn được giữ để truy vết thay vì xóa mất nguồn gốc.
  await saveChatConversationAlias(env, message, canonicalId, 'identity_match', buyerId ? 0.98 : 0.86).catch(() => null)
  return {
    ...message,
    conversation_id: canonicalId,
    canonical_conversation_id: canonicalId,
    identity_key: identityKey || cleanText(matched.identity_key)
  }
}

async function saveApiChatConversationMetadata(env, conversation) {
  const prepared = {
    ...conversation,
    source: cleanText(conversation.source) || 'api'
  }
  const aliasAwareConversation = await resolveChatCanonicalMessage(env, prepared).catch(() => prepared)
  const identityKey = preferredChatIdentityKey(aliasAwareConversation)
  const canonicalConversationId = cleanText(aliasAwareConversation.canonical_conversation_id || aliasAwareConversation.conversation_id)
  const transportPlan = resolveChatTransportForShop({
    platform: aliasAwareConversation.platform,
    shop: aliasAwareConversation.shop,
    shop_id: aliasAwareConversation.shop_id,
    transport: 'api',
    has_access_token: 1
  })
  const scanPolicy = resolveChatScanPolicy({
    ...aliasAwareConversation,
    transport: transportPlan.transport
  })
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_conversations
      (platform, shop, shop_id, conversation_id, buyer_id, buyer_name, last_message,
        last_message_at, unread_count, status, source, canonical_conversation_id, identity_key,
        transport, scan_mode, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, conversation_id) DO UPDATE SET
      shop_id = CASE WHEN excluded.shop_id != '' THEN excluded.shop_id ELSE marketplace_chat_conversations.shop_id END,
      buyer_id = CASE WHEN excluded.buyer_id != '' THEN excluded.buyer_id ELSE marketplace_chat_conversations.buyer_id END,
      buyer_name = ${chatSqlBuyerNameMergeExpression()},
      canonical_conversation_id = CASE WHEN excluded.canonical_conversation_id != '' THEN excluded.canonical_conversation_id ELSE marketplace_chat_conversations.canonical_conversation_id END,
      identity_key = CASE WHEN excluded.identity_key != '' THEN excluded.identity_key ELSE marketplace_chat_conversations.identity_key END,
      transport = 'api',
      scan_mode = 'api_direct',
      last_message = CASE WHEN excluded.last_message != '' THEN excluded.last_message ELSE marketplace_chat_conversations.last_message END,
      last_message_at = CASE WHEN excluded.last_message_at != '' THEN excluded.last_message_at ELSE marketplace_chat_conversations.last_message_at END,
      unread_count = MAX(COALESCE(marketplace_chat_conversations.unread_count, 0), COALESCE(excluded.unread_count, 0)),
      source = 'api',
      updated_at = datetime('now', '+7 hours')
  `).bind(
    aliasAwareConversation.platform,
    aliasAwareConversation.shop,
    aliasAwareConversation.shop_id,
    aliasAwareConversation.conversation_id,
    aliasAwareConversation.buyer_id,
    aliasAwareConversation.buyer_name,
    cleanText(aliasAwareConversation.last_message),
    cleanText(aliasAwareConversation.last_message_at),
    Number(aliasAwareConversation.unread_count || 0) || 0,
    cleanText(aliasAwareConversation.status || 'open'),
    'api',
    canonicalConversationId,
    identityKey,
    transportPlan.transport,
    scanPolicy.mode
  ).run()
  return aliasAwareConversation
}

async function saveApiChatMessage(env, message) {
  // Chuẩn hóa conversation_id trước khi lưu để tránh tách nhầm thread Shopee theo buyer_id/webchat-*.
  const aliasAwareMessage = await resolveChatCanonicalMessage(env, message).catch(() => message)
  const normalizedMessage = await remapShopeeAliasConversation(env, aliasAwareMessage).catch(() => aliasAwareMessage)
  const source = cleanText(normalizedMessage.source) || 'api'
  const identityKey = preferredChatIdentityKey(normalizedMessage)
  const canonicalConversationId = cleanText(normalizedMessage.canonical_conversation_id || normalizedMessage.conversation_id)
  const transportPlan = resolveChatTransportForShop({
    platform: normalizedMessage.platform,
    shop: normalizedMessage.shop,
    shop_id: normalizedMessage.shop_id,
    transport: source === 'automation' ? 'browser' : 'api'
  })
  const scanPolicy = resolveChatScanPolicy({
    ...normalizedMessage,
    transport: transportPlan.transport
  })
  const insertedMessage = await env.DB.prepare(`
    INSERT OR IGNORE INTO marketplace_chat_messages
      (platform, shop, shop_id, conversation_id, message_id, sender_type, sender_name, sender_id,
       message_type, content, media_items, raw_payload, sent_at, delivery_status, platform_response, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
  `).bind(
    normalizedMessage.platform,
    normalizedMessage.shop,
    normalizedMessage.shop_id,
    normalizedMessage.conversation_id,
    normalizedMessage.message_id,
    normalizedMessage.sender_type,
    normalizedMessage.sender_name,
    normalizedMessage.sender_id,
    normalizedMessage.message_type,
    normalizedMessage.content || mediaMessageSummary(normalizedMessage.media_items),
    safeJsonStringify(normalizeMediaItems(normalizedMessage.media_items)),
    normalizedMessage.raw_payload,
    normalizedMessage.sent_at,
    cleanText(normalizedMessage.delivery_status),
    cleanText(normalizedMessage.platform_response || '')
  ).run()
  const inserted = Number(insertedMessage?.meta?.changes || 0) > 0
  const unreadDelta = inserted
    && cleanText(normalizedMessage.sender_type).toLowerCase() !== 'shop'
    && isRecentApiChatMessage(normalizedMessage)
    ? 1
    : 0
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_conversations
      (platform, shop, shop_id, conversation_id, buyer_id, buyer_name, last_message,
        last_message_at, unread_count, status, source, canonical_conversation_id, identity_key,
        transport, scan_mode, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, conversation_id) DO UPDATE SET
      shop_id = excluded.shop_id,
      buyer_id = CASE WHEN excluded.buyer_id != '' THEN excluded.buyer_id ELSE marketplace_chat_conversations.buyer_id END,
      buyer_name = ${chatSqlBuyerNameMergeExpression()},
      canonical_conversation_id = CASE WHEN excluded.canonical_conversation_id != '' THEN excluded.canonical_conversation_id ELSE marketplace_chat_conversations.canonical_conversation_id END,
      identity_key = CASE WHEN excluded.identity_key != '' THEN excluded.identity_key ELSE marketplace_chat_conversations.identity_key END,
      transport = CASE WHEN excluded.transport != '' THEN excluded.transport ELSE marketplace_chat_conversations.transport END,
      scan_mode = CASE WHEN excluded.scan_mode != '' THEN excluded.scan_mode ELSE marketplace_chat_conversations.scan_mode END,
      last_message = CASE
        WHEN marketplace_chat_conversations.last_message LIKE 'Webhook%' THEN excluded.last_message
        WHEN datetime(COALESCE(NULLIF(excluded.last_message_at, ''), excluded.updated_at)) >= datetime(COALESCE(NULLIF(marketplace_chat_conversations.last_message_at, ''), marketplace_chat_conversations.updated_at, marketplace_chat_conversations.created_at)) THEN excluded.last_message
        ELSE marketplace_chat_conversations.last_message
      END,
      last_message_at = CASE
        WHEN marketplace_chat_conversations.last_message LIKE 'Webhook%' THEN excluded.last_message_at
        WHEN datetime(COALESCE(NULLIF(excluded.last_message_at, ''), excluded.updated_at)) >= datetime(COALESCE(NULLIF(marketplace_chat_conversations.last_message_at, ''), marketplace_chat_conversations.updated_at, marketplace_chat_conversations.created_at)) THEN excluded.last_message_at
        ELSE marketplace_chat_conversations.last_message_at
      END,
      unread_count = marketplace_chat_conversations.unread_count + ?,
      source = ?,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    normalizedMessage.platform,
    normalizedMessage.shop,
    normalizedMessage.shop_id,
    normalizedMessage.conversation_id,
    normalizedMessage.buyer_id,
    normalizedMessage.buyer_name,
    normalizedMessage.content,
    normalizedMessage.sent_at,
    unreadDelta,
    source,
    canonicalConversationId,
    identityKey,
    transportPlan.transport,
    scanPolicy.mode,
    unreadDelta,
    source
  ).run()
  await cleanupAutomationPreviewConversation(env, normalizedMessage, source).catch(() => null)
  await cleanupLazadaOfficialConversations(env, normalizedMessage).catch(() => null)
  await cleanupShopeeAliasConversations(env, normalizedMessage).catch(() => null)
  await collapseShopeeBuyerConversations(env, normalizedMessage).catch(() => null)
  return inserted
}

function isShopeeConversationAliasId(conversationId, buyerId) {
  const conversation = cleanText(conversationId)
  const buyer = cleanText(buyerId)
  if (!conversation) return false
  return Boolean((buyer && conversation === buyer) || conversation.startsWith('webchat-'))
}

Object.assign(globalThis, {
  shouldPreferIncomingOfficialCanonical,
  resolveLazadaOfficialConversationId,
  resolveChatCanonicalMessage,
  saveApiChatConversationMetadata,
  saveApiChatMessage,
  isShopeeConversationAliasId
})
