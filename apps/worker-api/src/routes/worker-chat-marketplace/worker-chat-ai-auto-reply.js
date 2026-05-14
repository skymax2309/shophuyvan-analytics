// NEO: Backend worker chat sàn - nhóm ai-auto-reply. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function recordChatAiAutoReplyLog(env, input = {}) {
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_ai_auto_reply_logs
      (platform, shop, shop_id, conversation_id, source_message_id, source_message_row_id,
       source_message_at, mode, status, action, provider, reply, guard, send_response, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
  `).bind(
    cleanText(input.platform).toLowerCase(),
    cleanText(input.shop),
    cleanText(input.shop_id),
    cleanText(input.conversation_id),
    cleanText(input.source_message_id),
    Number(input.source_message_row_id || 0),
    cleanText(input.source_message_at),
    normalizeChatAutoReplyMode(input.mode, 'dry_run'),
    cleanText(input.status),
    cleanText(input.action),
    cleanText(input.provider),
    cleanText(input.reply).slice(0, 3000),
    safeJsonStringify(input.guard || {}, '{}').slice(0, 4000),
    safeJsonStringify(input.send_response || {}, '{}').slice(0, 4000),
    cleanText(input.error).slice(0, 1000)
  ).run()
}

async function loadChatAiAutoReplyCandidates(env, settings, options = {}) {
  const platforms = normalizeChatAutoReplyPlatforms(options.platforms || settings.ai_auto_reply_platforms)
  const shops = normalizeChatAutoReplyShops(options.shops ?? settings.ai_auto_reply_shops)
  const mode = normalizeChatAutoReplyMode(options.mode || settings.ai_auto_reply_mode, 'dry_run')
  const fetchLimit = Math.min(Math.max(Number(options.limit || settings.ai_auto_reply_limit || 3) || 3, 1), 10)
  const holdSeconds = Math.min(Math.max(Number(options.hold_seconds ?? settings.ai_auto_reply_hold_seconds ?? 20) || 0, 0), 600)
  const maxAgeHours = Math.min(Math.max(Number(options.max_age_hours ?? settings.ai_auto_reply_max_age_hours ?? 2) || 2, 1), 168)
  const platformWhere = platforms.map(() => '?').join(', ')
  if (mode === 'live' && !shops.length) {
    // Chế độ gửi thật phải có shop canary để không vô tình mở auto-reply cho toàn sàn.
    return []
  }
  const shopWhere = shops.length
    ? `AND (
        lower(COALESCE(c.shop, '')) IN (${shops.map(() => '?').join(', ')})
        OR lower(COALESCE(c.shop_id, '')) IN (${shops.map(() => '?').join(', ')})
      )`
    : ''
  const params = shops.length
    ? [...platforms, ...shops, ...shops]
    : platforms
  const holdModifier = `-${holdSeconds} seconds`
  const maxAgeModifier = `-${maxAgeHours} hours`
  const { results } = await env.DB.prepare(`
    SELECT
      c.id, c.platform, c.shop, c.shop_id, c.conversation_id, c.buyer_id, c.buyer_name,
      c.last_message, c.last_message_at, c.unread_count, c.status, c.source,
      c.canonical_conversation_id, c.identity_key, c.transport, c.scan_mode,
      c.ai_auto_locked_at, c.ai_auto_lock_reason,
      m.id AS message_row_id,
      m.message_id AS source_message_id,
      m.sender_type AS source_sender_type,
      m.content AS source_content,
      m.sent_at AS source_message_at
    FROM marketplace_chat_conversations c
    JOIN marketplace_chat_messages m
      ON m.platform = c.platform
      AND m.conversation_id = c.conversation_id
      AND (
        m.shop = c.shop
        OR m.shop_id = c.shop_id
        OR m.shop = c.shop_id
        OR m.shop_id = c.shop
      )
    WHERE lower(c.platform) IN (${platformWhere})
      ${shopWhere}
      AND c.conversation_id NOT LIKE 'CHAT_TEST%'
      AND COALESCE(c.ai_auto_locked_at, '') = ''
      AND lower(COALESCE(c.transport, '')) = 'api'
      AND lower(COALESCE(m.sender_type, '')) NOT IN ('shop', 'seller', 'staff', 'admin', 'agent')
      AND clean_text_placeholder IS NULL
    ORDER BY datetime(COALESCE(NULLIF(m.sent_at, ''), m.created_at)) DESC, m.id DESC
    LIMIT ?
  `.replace('AND clean_text_placeholder IS NULL', `
      AND m.id = (
        SELECT m2.id
        FROM marketplace_chat_messages m2
        WHERE m2.platform = c.platform
          AND m2.conversation_id = c.conversation_id
          AND (
            m2.shop = c.shop
            OR m2.shop_id = c.shop_id
            OR m2.shop = c.shop_id
            OR m2.shop_id = c.shop
          )
        ORDER BY datetime(COALESCE(NULLIF(m2.sent_at, ''), m2.created_at)) DESC, m2.id DESC
        LIMIT 1
      )
      AND datetime(COALESCE(NULLIF(m.sent_at, ''), m.created_at)) <= datetime('now', '+7 hours', ?)
      AND datetime(COALESCE(NULLIF(m.sent_at, ''), m.created_at)) >= datetime('now', '+7 hours', ?)
  `)).bind(...params, holdModifier, maxAgeModifier, fetchLimit * 3).all()

  const candidates = []
  for (const row of results || []) {
    if (!cleanText(row.source_content)) continue
    const sourceMessageId = chatAutoReplySourceMessageId(row)
    const candidate = {
      ...row,
      source_message_id: sourceMessageId
    }
    if (await hasChatAiAutoReplyLog(env, candidate, mode)) continue
    candidates.push(candidate)
    if (candidates.length >= fetchLimit) break
  }
  return candidates
}

async function sendChatAutoReplyContent(env, candidate, content, dryRun = false) {
  const request = new Request('https://worker.local/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: candidate.id,
      conversation_id: candidate.conversation_id,
      platform: candidate.platform,
      shop: candidate.shop,
      content,
      dry_run: dryRun
    })
  })
  const response = await sendChatReply(request, env, {})
  const data = await response.json().catch(() => ({}))
  return {
    ok: response.ok,
    status: response.status,
    data
  }
}

async function handleChatAutoReplyCandidate(env, settings, candidate, mode) {
  const dryRun = mode !== 'live'
  const baseLog = {
    platform: candidate.platform,
    shop: candidate.shop,
    shop_id: candidate.shop_id,
    conversation_id: candidate.conversation_id,
    source_message_id: candidate.source_message_id,
    source_message_row_id: candidate.message_row_id,
    source_message_at: candidate.source_message_at,
    mode
  }
  try {
    const draft = await buildChatAiDraftPayload(env, settings, {
      id: candidate.id,
      conversation_id: candidate.conversation_id,
      platform: candidate.platform,
      shop: candidate.shop,
      customer_message: candidate.source_content
    })
    const payload = draft.payload || {}
    if (payload.auto_send_allowed && payload.reply) {
      if (dryRun) {
        await recordChatAiAutoReplyLog(env, {
          ...baseLog,
          status: 'would_send',
          action: 'ai_reply',
          provider: payload.provider,
          reply: payload.reply,
          guard: payload.guard
        })
        return { status: 'would_send', conversation_id: candidate.conversation_id, provider: payload.provider }
      }
      const send = await sendChatAutoReplyContent(env, candidate, payload.reply, false)
      await recordChatAiAutoReplyLog(env, {
        ...baseLog,
        status: send.ok && send.data?.sent_to_platform ? 'sent' : 'failed',
        action: 'ai_reply',
        provider: payload.provider,
        reply: payload.reply,
        guard: payload.guard,
        send_response: send.data,
        error: send.ok ? '' : (send.data?.message || send.data?.error || `HTTP ${send.status}`)
      })
      return { status: send.ok && send.data?.sent_to_platform ? 'sent' : 'failed', conversation_id: candidate.conversation_id, provider: payload.provider, send: send.data }
    }

    const handoffGuard = combineChatGuards(
      assessChatContent(CHAT_AI_AUTO_REPLY_HOLD_REPLY, settings),
      assessAiPolicy(CHAT_AI_AUTO_REPLY_HOLD_REPLY, settings)
    )
    if (!Number(settings.ai_auto_reply_handoff_enabled) || !handoffGuard.allowed) {
      await recordChatAiAutoReplyLog(env, {
        ...baseLog,
        status: payload.blocked ? 'blocked' : 'needs_review',
        action: 'staff_review',
        provider: payload.provider,
        reply: payload.reply || '',
        guard: payload.guard || handoffGuard,
        error: payload.reason || (payload.warnings || []).join(' | ')
      })
      return { status: payload.blocked ? 'blocked' : 'needs_review', conversation_id: candidate.conversation_id, provider: payload.provider }
    }

    if (dryRun && official.ok) {
      await recordChatAiAutoReplyLog(env, {
        ...baseLog,
        status: 'would_handoff',
        action: 'handoff_reply',
        provider: payload.provider,
        reply: CHAT_AI_AUTO_REPLY_HOLD_REPLY,
        guard: handoffGuard
      })
      return { status: 'would_handoff', conversation_id: candidate.conversation_id, provider: payload.provider }
    }

    const handoffSend = await sendChatAutoReplyContent(env, candidate, CHAT_AI_AUTO_REPLY_HOLD_REPLY, false)
    await lockChatAiAutoForConversation(env, {
      platform: candidate.platform,
      shop: candidate.shop,
      conversation_id: candidate.conversation_id,
      reason: 'Auto-reply đã chuyển hội thoại sang nhân viên duyệt vì AI cần kiểm tra thêm hoặc có rủi ro chính sách.'
    })
    await recordChatAiAutoReplyLog(env, {
      ...baseLog,
      status: handoffSend.ok && handoffSend.data?.sent_to_platform ? 'handoff_sent' : 'failed',
      action: 'handoff_reply',
      provider: payload.provider,
      reply: CHAT_AI_AUTO_REPLY_HOLD_REPLY,
      guard: handoffGuard,
      send_response: handoffSend.data,
      error: handoffSend.ok ? '' : (handoffSend.data?.message || handoffSend.data?.error || `HTTP ${handoffSend.status}`)
    })
    return { status: handoffSend.ok && handoffSend.data?.sent_to_platform ? 'handoff_sent' : 'failed', conversation_id: candidate.conversation_id, provider: payload.provider, send: handoffSend.data }
  } catch (error) {
    await recordChatAiAutoReplyLog(env, {
      ...baseLog,
      status: 'failed',
      action: 'ai_reply',
      error: errorMessage(error, 'Auto-reply lỗi không xác định.')
    })
    return { status: 'failed', conversation_id: candidate.conversation_id, error: errorMessage(error, 'Auto-reply lỗi không xác định.') }
  }
}

async function runChatAiAutoReplyBatch(env, options = {}) {
  await ensureChatTables(env)
  const settings = await getChatSettings(env)
  const requestedMode = normalizeChatAutoReplyMode(options.mode || settings.ai_auto_reply_mode, settings.ai_auto_reply_mode)
  const mode = options.dry_run === true ? 'dry_run' : requestedMode
  if (!Number(settings.ai_enabled)) {
    return { status: 'disabled', reason: 'AI CSKH đang tắt.', processed: 0, results: [] }
  }
  if (mode === 'off' && !options.force) {
    return { status: 'disabled', reason: 'Auto-reply đang tắt.', processed: 0, results: [] }
  }
  const runSettings = {
    ...settings,
    ai_auto_reply_platforms: normalizeChatAutoReplyPlatforms(options.platforms || settings.ai_auto_reply_platforms),
    ai_auto_reply_shops: normalizeChatAutoReplyShops(options.shops ?? settings.ai_auto_reply_shops),
    ai_auto_reply_limit: Math.min(Math.max(Number(options.limit || settings.ai_auto_reply_limit) || 3, 1), 10),
    ai_auto_reply_hold_seconds: Math.min(Math.max(Number(options.hold_seconds ?? settings.ai_auto_reply_hold_seconds) || 0, 0), 600),
    ai_auto_reply_max_age_hours: Math.min(Math.max(Number(options.max_age_hours ?? settings.ai_auto_reply_max_age_hours) || 2, 1), 168)
  }
  if (mode === 'live' && !runSettings.ai_auto_reply_shops.length) {
    // Khóa an toàn lớp route/cron: live không có shop cụ thể thì coi như chưa được bật.
    return {
      status: 'disabled',
      reason: 'Auto-reply live cần khai báo shop canary cụ thể.',
      mode,
      dry_run: false,
      candidates: 0,
      processed: 0,
      results: []
    }
  }
  const candidates = await loadChatAiAutoReplyCandidates(env, runSettings, { ...options, mode })
  const results = []
  for (const candidate of candidates) {
    results.push(await handleChatAutoReplyCandidate(env, runSettings, candidate, mode))
  }
  return {
    status: 'ok',
    mode,
    dry_run: mode !== 'live',
    shops: runSettings.ai_auto_reply_shops,
    candidates: candidates.length,
    processed: results.length,
    results
  }
}

async function runChatAiAutoReplyRoute(request, env, cors) {
  const access = await requireChatAutomationAccess(request, env, cors)
  if (!access.allowed) return access.response
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
  const result = await runChatAiAutoReplyBatch(env, {
    mode: body.mode,
    dry_run: body.dry_run === true,
    force: body.force === true || body.dry_run === true,
    limit: body.limit,
    platforms: body.platforms,
    shops: body.shops || body.ai_auto_reply_shops,
    hold_seconds: body.hold_seconds,
    max_age_hours: body.max_age_hours
  })
  return json(result, cors)
}

async function listChatAiAutoReplyLogs(request, env, cors) {
  await ensureChatTables(env)
  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30) || 30, 1), 100)
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, conversation_id, source_message_id, source_message_at,
           mode, status, action, provider, reply, guard, send_response, error, created_at
    FROM marketplace_chat_ai_auto_reply_logs
    ORDER BY id DESC
    LIMIT ?
  `).bind(limit).all()
  return json({
    status: 'ok',
    logs: (results || []).map(row => ({
      ...row,
      guard: safeJsonParse(row.guard, {}),
      send_response: safeJsonParse(row.send_response, {})
    }))
  }, cors)
}

function shopeeSignedUrl(env, shop, path, params = {}) {
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  return async () => {
    const partnerId = String(app.partnerId)
    const timestamp = Math.floor(Date.now() / 1000)
    const shopId = String(shop.api_shop_id || shop.shop_id || '')
    const accessToken = String(shop.access_token || '')
    const baseString = partnerId + path + timestamp + accessToken + shopId
    const sign = await signHmacHex(app.partnerKey, baseString)
    const url = new URL(`https://partner.shopeemobile.com${path}`)
    url.searchParams.set('partner_id', partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('shop_id', shopId)
    url.searchParams.set('sign', sign)
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}

async function callShopeeChatPath(env, shop, path, params = {}) {
  const url = await shopeeSignedUrl(env, shop, path, params)()
  const res = await fetch(url, { method: 'GET' })
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
    data.message = `Shopee Chat ${path} trả HTTP ${res.status} nhưng không có nội dung lỗi.`
  }
  return { ok, status: res.status, data }
}

Object.assign(globalThis, {
  recordChatAiAutoReplyLog,
  loadChatAiAutoReplyCandidates,
  sendChatAutoReplyContent,
  handleChatAutoReplyCandidate,
  runChatAiAutoReplyBatch,
  runChatAiAutoReplyRoute,
  listChatAiAutoReplyLogs,
  shopeeSignedUrl,
  callShopeeChatPath
})
