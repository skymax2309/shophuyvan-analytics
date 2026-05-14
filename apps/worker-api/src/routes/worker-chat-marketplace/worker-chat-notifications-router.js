// NEO: Backend worker chat sàn - nhóm notifications-router. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function notificationStatus(env, cors) {
  await ensureChatTables(env)
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM marketplace_push_subscriptions
    WHERE enabled = 1
  `).first()
  return json({
    status: 'ok',
    supported: Boolean(cleanText(env.CHAT_VAPID_PUBLIC_KEY)),
    vapid_public_key: cleanText(env.CHAT_VAPID_PUBLIC_KEY),
    subscribers: Number(row?.count || 0),
    note: 'iPhone cần mở OMS từ biểu tượng đã thêm vào Màn hình chính để nhận thông báo nền.'
  }, cors)
}

async function savePushSubscription(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const subscription = body.subscription || body
  const endpoint = cleanText(subscription.endpoint)
  const keys = subscription.keys || {}
  if (!endpoint || !cleanText(keys.p256dh) || !cleanText(keys.auth)) {
    return json({ error: 'Thiếu endpoint hoặc khóa push của thiết bị.' }, cors, 400)
  }
  await env.DB.prepare(`
    INSERT INTO marketplace_push_subscriptions
      (endpoint, p256dh, auth, platform, shop, user_agent, device_label,
       preview_enabled, sound_enabled, enabled, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      platform = excluded.platform,
      shop = excluded.shop,
      user_agent = excluded.user_agent,
      device_label = excluded.device_label,
      preview_enabled = excluded.preview_enabled,
      sound_enabled = excluded.sound_enabled,
      enabled = 1,
      last_error = '',
      updated_at = datetime('now', '+7 hours')
  `).bind(
    endpoint,
    cleanText(keys.p256dh),
    cleanText(keys.auth),
    cleanText(body.platform),
    cleanText(body.shop),
    cleanText(body.user_agent).slice(0, 300),
    cleanText(body.device_label || 'Thiết bị CSKH').slice(0, 120),
    body.preview_enabled === false || body.preview_enabled === 0 ? 0 : 1,
    body.sound_enabled === false || body.sound_enabled === 0 ? 0 : 1
  ).run()
  return notificationStatus(env, cors)
}

async function removePushSubscription(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const endpoint = cleanText(body.endpoint || body.subscription?.endpoint)
  if (!endpoint) return json({ error: 'Thiếu endpoint thiết bị cần tắt.' }, cors, 400)
  await env.DB.prepare(`
    UPDATE marketplace_push_subscriptions
    SET enabled = 0, updated_at = datetime('now', '+7 hours')
    WHERE endpoint = ?
  `).bind(endpoint).run()
  return json({ status: 'ok' }, cors)
}

async function testPushNotification(requestOrEnv, envOrCors, maybeCors) {
  const request = maybeCors ? requestOrEnv : null
  const env = maybeCors ? envOrCors : requestOrEnv
  const cors = maybeCors || envOrCors
  await ensureChatTables(env)
  if (request) {
    const body = await request.json().catch(() => ({}))
    const type = cleanText(body.type || 'chat').toLowerCase()
    const event = type === 'order'
      ? {
          event_type: 'order',
          title: 'Tin thử đơn hàng OMS',
          body: 'Thông báo đơn hàng trên iPhone đang hoạt động.',
          tag: `shv-order-test-${Date.now()}`,
          url: '/pages/oms-dashboard.html',
          dedupe_key: `test-order:${Date.now()}`,
          data: { type: 'order', order_id: '', order_ids: [], url: '/pages/oms-dashboard.html' }
        }
      : {
          event_type: 'chat',
          title: 'Tin thử chat OMS',
          body: 'Thông báo chat trên iPhone đang hoạt động.',
          tag: `shv-chat-test-${Date.now()}`,
          url: '/pages/profit-dashboard.html#chat',
          dedupe_key: `test-chat:${Date.now()}`,
          data: { type: 'chat', conversation_id: '', url: '/pages/profit-dashboard.html#chat' }
        }
    const queued = await queuePushEvent(env, event)
    const delivery = await sendPushToEnabledSubscribers(env, 20)
    return json({ status: 'ok', ...delivery, event_id: queued?.id || null, sample: event.body }, cors)
  }
  const fake = {
    platform: 'shopee',
    shop: 'test',
    shop_id: '',
    conversation_id: 'PUSH_TEST',
    content: 'Tin thử thông báo iPhone từ OMS',
    has_real_content: 1
  }
  const { results } = await env.DB.prepare(`
    SELECT id, endpoint
    FROM marketplace_push_subscriptions
    WHERE enabled = 1
    ORDER BY updated_at DESC, id DESC
    LIMIT 20
  `).all()
  let sent = 0
  const outcomes = await Promise.allSettled((results || []).map(item => sendWebPushPing(env, item)))
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled' && outcome.value?.ok) sent++
  }
  return json({ status: 'ok', sent, total: results?.length || 0, sample: fake.content }, cors)
}

async function handleChat(request, env, cors) {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/chat/settings') {
    return json({ status: 'ok', settings: await getChatSettings(env) }, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/settings') {
    return saveChatSettings(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/guard') {
    return guardChatReply(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/ai-draft') {
    return createChatAiDraft(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/auto-reply/run') {
    return runChatAiAutoReplyRoute(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/auto-reply/logs') {
    return listChatAiAutoReplyLogs(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/knowledge') {
    return listChatKnowledge(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/knowledge') {
    return saveChatKnowledge(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/product-advisories') {
    return listProductAdvisories(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/product-advisories') {
    return saveProductAdvisory(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/send') {
    try {
      return await sendChatReply(request, env, cors)
    } catch (error) {
      return json({ error: cleanText(error?.message || error) || 'Không gửi được tin nhắn.' }, cors, 500)
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/api-sync') {
    try {
      return await syncChatApi(request, env, cors)
    } catch (error) {
      return json({
        status: 'error',
        error: 'chat_api_sync_failed',
        message: errorMessage(error, 'Không kéo được nội dung chat qua API.')
      }, cors, 500)
    }
  }
  if ((request.method === 'POST' || request.method === 'GET') && url.pathname === '/api/chat/shopee-permission-probe') {
    try {
      return await probeShopeeChatPermissions(request, env, cors)
    } catch (error) {
      return json({
        status: 'error',
        error: 'shopee_chat_permission_probe_failed',
        message: errorMessage(error, 'Không probe được quyền Shopee SellerChat.')
      }, cors, 500)
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/automation-ingest') {
    try {
      return await ingestChatAutomationMessages(request, env, cors)
    } catch (error) {
      return json({
        status: 'error',
        error: 'chat_automation_ingest_failed',
        message: errorMessage(error, 'Không nhập được dữ liệu chat từ automation.')
      }, cors, 500)
    }
  }
  if ((request.method === 'POST' || request.method === 'GET') && url.pathname === '/api/chat/admin/cleanup-tiktok-duplicates') {
    try {
      return await cleanupTikTokAutomationDuplicates(request, env, cors)
    } catch (error) {
      return json({
        status: 'error',
        error: 'cleanup_tiktok_duplicates_failed',
        message: errorMessage(error, 'Không dọn được dữ liệu TikTok bị lặp.')
      }, cors, 500)
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/shops') {
    return listChatShops(env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/conversations') {
    const warm = url.searchParams.get('warm') === '1'
    if (warm) await backfillChatFromWebhookEvents(env, 100).catch(() => null)
    return listConversations(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/messages') {
    return listMessages(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/media') {
    return serveChatMedia(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/context') {
    return loadChatContextPanel(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/resolve-order-conversation') {
    return resolveOrderConversation(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/products') {
    return listChatProducts(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/rule-violations') {
    return listRuleViolations(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/sync') {
    try {
      const body = await request.json().catch(() => ({}))
      const result = await backfillChatFromWebhookEvents(env, body.limit || 500)
      return json({ status: 'ok', ...result }, cors)
    } catch (error) {
      return json({
        status: 'error',
        error: 'chat_webhook_sync_failed',
        message: errorMessage(error, 'Không đồng bộ được webhook chat.')
      }, cors, 500)
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/read') {
    return markRead(request, env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/notifications/status') {
    return notificationStatus(env, cors)
  }
  if (request.method === 'GET' && url.pathname === '/api/chat/notifications/latest') {
    return latestNotificationEvent(env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/notifications/subscribe') {
    return savePushSubscription(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/notifications/unsubscribe') {
    return removePushSubscription(request, env, cors)
  }
  if (request.method === 'POST' && url.pathname === '/api/chat/notifications/test') {
    return testPushNotification(request, env, cors)
  }
  return json({ error: 'Chat route not found' }, cors, 404)
}

Object.assign(globalThis, {
  notificationStatus,
  savePushSubscription,
  removePushSubscription,
  testPushNotification,
  handleChat
})
