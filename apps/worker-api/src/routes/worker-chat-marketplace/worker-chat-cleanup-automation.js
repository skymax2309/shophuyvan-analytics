// NEO: Backend worker chat sàn - nhóm cleanup-automation. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function cleanupShopeeAliasConversations(env, message) {
  const platform = cleanText(message?.platform).toLowerCase()
  const shop = cleanText(message?.shop)
  const buyerId = cleanText(message?.buyer_id)
  const canonicalConversationId = cleanText(message?.conversation_id)
  if (platform !== 'shopee' || !shop || !buyerId || !canonicalConversationId) return
  if (isShopeeConversationAliasId(canonicalConversationId, buyerId)) return

  const { results: aliasRows } = await env.DB.prepare(`
    SELECT conversation_id, unread_count
    FROM marketplace_chat_conversations
    WHERE lower(platform) = ?
      AND shop = ?
      AND buyer_id = ?
      AND conversation_id != ?
      AND (conversation_id = ? OR conversation_id LIKE 'webchat-%')
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 10
  `).bind(platform, shop, buyerId, canonicalConversationId, buyerId).all()

  if (!Array.isArray(aliasRows) || !aliasRows.length) return

  let mergedUnread = 0
  for (const row of aliasRows) {
    const aliasConversationId = cleanText(row?.conversation_id)
    if (!aliasConversationId || aliasConversationId === canonicalConversationId) continue
    mergedUnread += Number(row?.unread_count || 0)
    await saveChatConversationAlias(env, { ...message, conversation_id: aliasConversationId }, canonicalConversationId, 'shopee_alias_cleanup', 0.98).catch(() => null)
    // Gom toàn bộ tin nhắn alias về conversation_id chuẩn để không tách đôi thread cùng 1 khách.
    await env.DB.prepare(`
      INSERT OR IGNORE INTO marketplace_chat_messages
        (platform, shop, shop_id, conversation_id, message_id, sender_type, sender_name, sender_id,
         message_type, content, raw_payload, sent_at, created_at, media_items, delivery_status, platform_response)
      SELECT
        platform, shop, shop_id, ?, message_id, sender_type, sender_name, sender_id,
        message_type, content, raw_payload, sent_at, created_at, media_items, delivery_status, platform_response
      FROM marketplace_chat_messages
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(canonicalConversationId, platform, shop, aliasConversationId).run()
    await env.DB.prepare(`
      DELETE FROM marketplace_chat_messages
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(platform, shop, aliasConversationId).run()
    await env.DB.prepare(`
      DELETE FROM marketplace_chat_conversations
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(platform, shop, aliasConversationId).run()
  }

  if (mergedUnread > 0) {
    await env.DB.prepare(`
      UPDATE marketplace_chat_conversations
      SET unread_count = COALESCE(unread_count, 0) + ?,
          updated_at = datetime('now', '+7 hours')
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(mergedUnread, platform, shop, canonicalConversationId).run()
  }
}

async function collapseShopeeBuyerConversations(env, message) {
  const platform = cleanText(message?.platform).toLowerCase()
  const shop = cleanText(message?.shop)
  const buyerId = cleanText(message?.buyer_id)
  const canonicalConversationId = cleanText(message?.conversation_id)
  const senderType = cleanText(message?.sender_type).toLowerCase()
  if (platform !== 'shopee' || !shop || !buyerId || !canonicalConversationId) return
  if (senderType !== 'shop') return

  const { results: duplicates } = await env.DB.prepare(`
    SELECT conversation_id, unread_count
    FROM marketplace_chat_conversations
    WHERE lower(platform) = ?
      AND shop = ?
      AND buyer_id = ?
      AND conversation_id != ?
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 20
  `).bind(platform, shop, buyerId, canonicalConversationId).all()

  if (!Array.isArray(duplicates) || !duplicates.length) return

  let mergedUnread = 0
  for (const row of duplicates) {
    const duplicateConversationId = cleanText(row?.conversation_id)
    if (!duplicateConversationId || duplicateConversationId === canonicalConversationId) continue
    mergedUnread += Number(row?.unread_count || 0)
    // Gom toàn bộ hội thoại cùng buyer_id về một conversation_id chuẩn để Shopee không tách đôi thread.
    await env.DB.prepare(`
      INSERT OR IGNORE INTO marketplace_chat_messages
        (platform, shop, shop_id, conversation_id, message_id, sender_type, sender_name, sender_id,
         message_type, content, raw_payload, sent_at, created_at, media_items, delivery_status, platform_response)
      SELECT
        platform, shop, shop_id, ?, message_id, sender_type, sender_name, sender_id,
        message_type, content, raw_payload, sent_at, created_at, media_items, delivery_status, platform_response
      FROM marketplace_chat_messages
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(canonicalConversationId, platform, shop, duplicateConversationId).run()
    await env.DB.prepare(`
      DELETE FROM marketplace_chat_messages
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(platform, shop, duplicateConversationId).run()
    await env.DB.prepare(`
      DELETE FROM marketplace_chat_conversations
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(platform, shop, duplicateConversationId).run()
  }

  if (mergedUnread > 0) {
    await env.DB.prepare(`
      UPDATE marketplace_chat_conversations
      SET unread_count = COALESCE(unread_count, 0) + ?,
          updated_at = datetime('now', '+7 hours')
      WHERE lower(platform) = ?
        AND shop = ?
        AND conversation_id = ?
    `).bind(mergedUnread, platform, shop, canonicalConversationId).run()
  }
}

async function remapShopeeAliasConversation(env, message) {
  const platform = cleanText(message?.platform).toLowerCase()
  const shop = cleanText(message?.shop)
  const buyerId = cleanText(message?.buyer_id)
  const conversationId = cleanText(message?.conversation_id)
  if (platform !== 'shopee' || !shop || !buyerId || !conversationId) return message
  if (!isShopeeConversationAliasId(conversationId, buyerId)) return message

  const mapped = await env.DB.prepare(`
    SELECT conversation_id, buyer_name
    FROM marketplace_chat_conversations
    WHERE lower(platform) = ?
      AND shop = ?
      AND buyer_id = ?
      AND conversation_id != ?
      AND conversation_id != ?
      AND conversation_id NOT LIKE 'webchat-%'
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 1
  `).bind(platform, shop, buyerId, conversationId, buyerId).first().catch(() => null)

  if (!mapped?.conversation_id) return message
  return {
    ...message,
    conversation_id: cleanText(mapped.conversation_id),
    buyer_name: cleanText(message.buyer_name || mapped.buyer_name || buyerId || 'Khách hàng')
  }
}

async function cleanupAutomationPreviewConversation(env, message, source) {
  const platform = cleanText(message.platform).toLowerCase()
  const shop = cleanText(message.shop)
  const conversationId = cleanText(message.conversation_id)
  const buyerName = cleanText(message.buyer_name)
  if (source !== 'automation' || !platform || !shop || !isUsefulBuyerName(buyerName)) return
  if (conversationId.startsWith(`automation-${platform}-`)) return
  const previewPattern = `automation-${platform}-%`
  // Khi đã có conversation_id thật từ sàn, xóa bản preview DOM cũ để danh sách không bị trùng khách.
  await env.DB.prepare(`
    DELETE FROM marketplace_chat_messages
    WHERE platform = ? AND shop = ?
      AND conversation_id IN (
        SELECT conversation_id
        FROM marketplace_chat_conversations
        WHERE platform = ? AND shop = ? AND buyer_name = ? AND conversation_id LIKE ?
      )
  `).bind(platform, shop, platform, shop, buyerName, previewPattern).run()
  await env.DB.prepare(`
    DELETE FROM marketplace_chat_conversations
    WHERE platform = ? AND shop = ? AND buyer_name = ? AND conversation_id LIKE ?
  `).bind(platform, shop, buyerName, previewPattern).run()
}

async function refreshChatConversationSnapshot(env, platform, shop, conversationId) {
  const latest = await env.DB.prepare(`
    SELECT content, sent_at
    FROM marketplace_chat_messages
    WHERE lower(platform) = ?
      AND shop = ?
      AND conversation_id = ?
    ORDER BY datetime(COALESCE(NULLIF(sent_at, ''), created_at)) DESC, id DESC
    LIMIT 1
  `).bind(cleanText(platform).toLowerCase(), cleanText(shop), cleanText(conversationId)).first().catch(() => null)
  if (!latest) return
  await env.DB.prepare(`
    UPDATE marketplace_chat_conversations
    SET last_message = ?,
        last_message_at = ?,
        updated_at = datetime('now', '+7 hours')
    WHERE lower(platform) = ?
      AND shop = ?
      AND conversation_id = ?
  `).bind(
    cleanText(latest.content),
    cleanText(latest.sent_at),
    cleanText(platform).toLowerCase(),
    cleanText(shop),
    cleanText(conversationId)
  ).run().catch(() => null)
}

async function cleanupTikTokAutomationConversation(env, message, source) {
  const platform = cleanText(message?.platform).toLowerCase()
  const shop = cleanText(message?.shop)
  const conversationId = cleanText(message?.conversation_id)
  if (source !== 'automation' || platform !== 'tiktok' || !shop || !conversationId) return { deleted: 0 }

  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, conversation_id, message_id, sender_type, sender_name,
           message_type, content, media_items, raw_payload, sent_at, created_at
    FROM marketplace_chat_messages
    WHERE lower(platform) = 'tiktok'
      AND shop = ?
      AND conversation_id = ?
    ORDER BY datetime(COALESCE(NULLIF(sent_at, ''), created_at)) ASC, id ASC
  `).bind(shop, conversationId).all().catch(() => ({ results: [] }))

  if (!Array.isArray(results) || results.length < 2) return { deleted: 0 }

  const hasThreadSource = results.some(row => tiktokAutomationSourcePriority(row) >= 3)
  const winners = new Map()
  const deleteIds = []
  for (const row of results) {
    const sourcePriority = tiktokAutomationSourcePriority(row)
    if (hasThreadSource && sourcePriority === 1) {
      deleteIds.push(Number(row.id || 0))
      continue
    }
    const fingerprint = tiktokAutomationMessageFingerprint(row)
    if (!fingerprint) continue
    const existing = winners.get(fingerprint)
    if (!existing) {
      winners.set(fingerprint, row)
      continue
    }
    if (sourcePriority > tiktokAutomationSourcePriority(existing)) {
      deleteIds.push(Number(existing.id || 0))
      winners.set(fingerprint, row)
    } else {
      deleteIds.push(Number(row.id || 0))
    }
  }

  const uniqueDeleteIds = [...new Set(deleteIds.filter(id => Number.isFinite(id) && id > 0))]
  if (!uniqueDeleteIds.length) return { deleted: 0 }

  const placeholders = uniqueDeleteIds.map(() => '?').join(',')
  await env.DB.prepare(`
    DELETE FROM marketplace_chat_messages
    WHERE id IN (${placeholders})
  `).bind(...uniqueDeleteIds).run()
  await refreshChatConversationSnapshot(env, platform, shop, conversationId)
  return { deleted: uniqueDeleteIds.length }
}

async function cleanupLazadaOfficialConversations(env, message) {
  const platform = cleanText(message?.platform).toLowerCase()
  const shop = cleanText(message?.shop)
  const shopId = cleanText(message?.shop_id)
  const officialConversationId = cleanText(message?.canonical_conversation_id || message?.conversation_id)
  if (platform !== 'lazada' || !shop || !isOfficialLazadaConversationId(officialConversationId)) return

  const identityKey = preferredChatIdentityKey(message)
  const buyerId = cleanText(message?.buyer_id)
  const buyerName = cleanText(message?.buyer_name)
  const where = ['conversation_id = ?', 'canonical_conversation_id = ?']
  const params = [officialConversationId, officialConversationId]
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

  // Khi IM API đã trả session thật, mọi session automation Lazada cũ chỉ còn vai trò alias để send/read luôn bám session chính thức.
  const { results } = await env.DB.prepare(`
    SELECT id, conversation_id, canonical_conversation_id, identity_key
    FROM marketplace_chat_conversations
    WHERE lower(platform) = 'lazada'
      AND shop = ?
      AND (? = '' OR shop_id = '' OR shop_id = ?)
      AND conversation_id NOT LIKE 'CHAT_TEST%'
      AND (${where.join(' OR ')})
    ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC, id DESC
    LIMIT 30
  `).bind(shop, shopId, shopId, ...params).all().catch(() => ({ results: [] }))

  await env.DB.prepare(`
    DELETE FROM chat_conversation_aliases
    WHERE lower(platform) = 'lazada'
      AND shop = ?
      AND alias_conversation_id = ?
      AND canonical_conversation_id LIKE 'automation-lazada-%'
  `).bind(shop, officialConversationId).run().catch(() => null)

  for (const row of results || []) {
    const rowConversationId = cleanText(row?.conversation_id)
    if (!rowConversationId) continue
    if (shouldAliasConversation(rowConversationId, officialConversationId)) {
      await saveChatConversationAlias(env, {
        ...message,
        conversation_id: rowConversationId,
        identity_key: cleanText(row?.identity_key || identityKey)
      }, officialConversationId, 'lazada_official_session', 0.99).catch(() => null)
    }
    await env.DB.prepare(`
      UPDATE marketplace_chat_conversations
      SET canonical_conversation_id = ?,
          identity_key = CASE WHEN identity_key = '' AND ? != '' THEN ? ELSE identity_key END
      WHERE id = ?
    `).bind(officialConversationId, identityKey, identityKey, row.id).run().catch(() => null)
  }
}

async function requireChatAutomationAccess(request, env, cors) {
  const expected = cleanText(env.CHAT_AUTOMATION_TOKEN || env.OMS_CHAT_AUTOMATION_TOKEN || 'huyvan_secret_2026')
  const provided = cleanText(request.headers.get('x-oms-automation-token') || request.headers.get('x-chat-automation-token'))
  if (expected && provided && provided === expected) {
    return { allowed: true, source: 'automation_token' }
  }
  const admin = await requireAdminPermission(request, env, 'chat.reply')
  if (admin.allowed) return { allowed: true, source: 'admin', user: admin.user }
  return {
    allowed: false,
    response: json({
      status: 'error',
      error: 'chat_automation_unauthorized',
      message: expected
        ? 'Thiếu phiên admin hoặc token automation để đẩy dữ liệu chat vào OMS.'
        : 'Thiếu phiên admin có quyền trả lời chat để đẩy dữ liệu automation vào OMS.'
    }, cors, 401)
  }
}

function automationMessagesFromConversation(conversation) {
  if (Array.isArray(conversation?.messages)) return conversation.messages
  if (Array.isArray(conversation?.items)) return conversation.items
  if (conversation?.message && typeof conversation.message === 'object') return [conversation.message]
  if (conversation?.content || conversation?.text || conversation?.message) return [conversation]
  return []
}

function normalizeAutomationSenderType(source, fallback = {}) {
  const raw = firstText(source, [
    ['sender_type'],
    ['from_type'],
    ['author_type'],
    ['direction']
  ]).toLowerCase()
  if (raw.includes('shop') || raw.includes('seller') || raw.includes('merchant') || raw.includes('out')) return 'shop'
  if (raw.includes('buyer') || raw.includes('customer') || raw.includes('user') || raw.includes('in')) return 'buyer'
  if (source?.is_shop === true || source?.is_from_shop === true || source?.from_shop === true) return 'shop'
  if (source?.is_customer === true || source?.is_buyer === true) return 'buyer'
  return cleanText(fallback.sender_type || 'buyer').toLowerCase() === 'shop' ? 'shop' : 'buyer'
}

Object.assign(globalThis, {
  cleanupShopeeAliasConversations,
  collapseShopeeBuyerConversations,
  remapShopeeAliasConversation,
  cleanupAutomationPreviewConversation,
  refreshChatConversationSnapshot,
  cleanupTikTokAutomationConversation,
  cleanupLazadaOfficialConversations,
  requireChatAutomationAccess,
  automationMessagesFromConversation,
  normalizeAutomationSenderType
})
