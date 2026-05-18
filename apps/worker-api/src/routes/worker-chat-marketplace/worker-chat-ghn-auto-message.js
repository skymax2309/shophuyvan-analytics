// NEO: Backend worker chat sàn - tự nhắn đơn GHN qua Shopee Chat khi đủ quyền và đã bật theo shop.
import {
  GHN_NOTICE_DEFAULT_TEMPLATE,
  GHN_NOTICE_MESSAGE_TYPE,
  isGhnAutoOrderEligible,
  isGhnCarrier,
  normalizeGhnCarrierText,
  renderGhnNoticeMessage,
  validateGhnTemplate
} from '../../core/chat/ghn-auto-message-core.js'

async function hasSentGhnNotice(env, order = {}) {
  const row = await env.DB.prepare(`
    SELECT id, send_status, sent_at
    FROM marketplace_chat_ghn_message_logs
    WHERE platform = 'shopee'
      AND order_sn = ?
      AND message_type = ?
      AND send_status = 'sent'
    LIMIT 1
  `).bind(cleanText(order.order_id || order.order_sn), GHN_NOTICE_MESSAGE_TYPE).first().catch(() => null)
  return Boolean(row?.id)
}

async function listGhnCandidateOrders(env, options = {}) {
  await ensureChatTables(env)
  if (!(await tableExists(env, 'orders_v2'))) return []
  const limit = Math.min(Math.max(Number(options.limit || 30) || 30, 1), 100)
  const shop = cleanText(options.shop)
  const orderSn = cleanText(options.order_sn || options.orderId)
  const where = ["lower(platform) = 'shopee'"]
  const params = []
  if (shop) {
    where.push('(shop = ? OR order_id = ?)')
    params.push(shop, shop)
  }
  if (orderSn) {
    where.push('order_id = ?')
    params.push(orderSn)
  }
  where.push(`(
    lower(COALESCE(shipping_carrier, '')) LIKE '%ghn%'
    OR lower(COALESCE(shipping_carrier, '')) LIKE '%giao hàng nhanh%'
    OR lower(COALESCE(shipping_carrier, '')) LIKE '%giao hang nhanh%'
  )`)
  const { results } = await env.DB.prepare(`
    SELECT order_id, platform, shop, buyer_id, buyer_username, customer_name,
           oms_status, shipping_status, shipping_carrier, tracking_number, source_updated_at, order_date
    FROM orders_v2
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(COALESCE(NULLIF(source_updated_at, ''), order_date, '1970-01-01')) DESC
    LIMIT ?
  `).bind(...params, limit).all()
  const rows = []
  for (const row of results || []) {
    const eligibility = isGhnAutoOrderEligible(row)
    rows.push({
      ...row,
      order_sn: cleanText(row.order_id),
      eligible: eligibility.ok ? 1 : 0,
      skipped_reason: eligibility.reason,
      already_sent: await hasSentGhnNotice(env, row) ? 1 : 0
    })
  }
  return rows
}

async function findOrCreateGhnConversation(env, order = {}) {
  const aliases = [order.shop, order.shop_id].map(cleanText).filter(Boolean)
  const buyerId = cleanText(order.buyer_id)
  if (buyerId && aliases.length) {
    const placeholders = aliases.map(() => '?').join(', ')
    const row = await env.DB.prepare(`
      SELECT *
      FROM marketplace_chat_conversations
      WHERE lower(platform) = 'shopee'
        AND buyer_id = ?
        AND (shop IN (${placeholders}) OR shop_id IN (${placeholders}))
      ORDER BY datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC
      LIMIT 1
    `).bind(buyerId, ...aliases, ...aliases).first().catch(() => null)
    if (row) return row
  }
  const conversationId = `order-shopee-${cleanText(order.shop || 'shop')}-${cleanText(order.order_id || order.order_sn)}`
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_conversations
      (platform, shop, shop_id, conversation_id, buyer_id, buyer_name, last_message,
       last_message_at, unread_count, status, source, canonical_conversation_id, transport, scan_mode, updated_at, created_at)
    VALUES ('shopee', ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), 0, 'open', 'ghn_auto_seed', ?, 'api', 'api_direct', datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, conversation_id) DO UPDATE SET
      buyer_id = CASE WHEN excluded.buyer_id != '' THEN excluded.buyer_id ELSE marketplace_chat_conversations.buyer_id END,
      buyer_name = CASE WHEN excluded.buyer_name != '' THEN excluded.buyer_name ELSE marketplace_chat_conversations.buyer_name END,
      transport = 'api',
      scan_mode = 'api_direct',
      updated_at = datetime('now', '+7 hours')
  `).bind(
    cleanText(order.shop),
    cleanText(order.shop_id || order.shop),
    conversationId,
    buyerId,
    cleanText(order.customer_name || order.buyer_username || 'Khách hàng'),
    `Chuẩn bị nhắn GHN cho đơn ${cleanText(order.order_id || order.order_sn)}`,
    conversationId
  ).run()
  return env.DB.prepare(`
    SELECT *
    FROM marketplace_chat_conversations
    WHERE platform = 'shopee' AND shop = ? AND conversation_id = ?
    LIMIT 1
  `).bind(cleanText(order.shop), conversationId).first()
}

async function saveGhnNoticeLog(env, order = {}, input = {}) {
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_ghn_message_logs
      (order_sn, shop_id, shop_name, platform, carrier, logistics_channel_id, package_number,
       tracking_number, message_type, message_template_id, message_text, send_status,
       shopee_message_id, shopee_response_code, shopee_response_message, error_code, error_message,
       raw_response_masked, sent_at, created_at)
    VALUES (?, ?, ?, 'shopee', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop_id, order_sn, message_type) DO UPDATE SET
      carrier = excluded.carrier,
      tracking_number = excluded.tracking_number,
      message_text = excluded.message_text,
      send_status = excluded.send_status,
      shopee_message_id = excluded.shopee_message_id,
      shopee_response_code = excluded.shopee_response_code,
      shopee_response_message = excluded.shopee_response_message,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      raw_response_masked = excluded.raw_response_masked,
      sent_at = excluded.sent_at
  `).bind(
    cleanText(order.order_id || order.order_sn),
    cleanText(order.shop_id || order.shop),
    cleanText(order.shop),
    cleanText(order.shipping_carrier),
    cleanText(order.logistics_channel_id),
    cleanText(order.package_number),
    cleanText(order.tracking_number),
    GHN_NOTICE_MESSAGE_TYPE,
    cleanText(input.message_template_id || 'default_ghn_notice'),
    cleanText(input.message_text),
    cleanText(input.send_status),
    cleanText(input.shopee_message_id),
    cleanText(input.shopee_response_code),
    cleanText(input.shopee_response_message),
    cleanText(input.error_code),
    cleanText(input.error_message),
    safeJsonStringify(input.raw_response_masked || {}, '{}').slice(0, 4000),
    cleanText(input.sent_at)
  ).run()
}

async function processGhnNoticeOrder(env, order = {}, options = {}) {
  const dryRun = options.dry_run !== false
  const messageText = renderGhnNoticeMessage(order, options.template)
  const templateCheck = validateGhnTemplate(messageText)
  if (!templateCheck.ok) return { order_sn: order.order_sn, status: 'failed_validation', ...templateCheck }
  const eligibility = isGhnAutoOrderEligible(order)
  if (!eligibility.ok) return { order_sn: order.order_sn, status: 'skipped', reason: eligibility.reason }
  if (await hasSentGhnNotice(env, order)) return { order_sn: order.order_sn, status: 'skipped', reason: 'duplicate_auto_message' }
  const setting = await loadChatShopAutoSetting(env, 'shopee', order.shop, order.shop_id || order.shop)
  if (!setting?.ghn_auto_message_enabled) return { order_sn: order.order_sn, status: 'skipped', reason: 'shop_ghn_disabled' }
  if (setting.chat_api_status !== 'connected') return { order_sn: order.order_sn, status: 'skipped', reason: 'chat_permission_missing' }
  if (dryRun) return { order_sn: order.order_sn, status: 'would_send', dry_run: true, message_text: messageText }
  if (!boolEnvFlag(env.SHOPEE_AUTO_CHAT_GHN_ENABLED)) {
    return { order_sn: order.order_sn, status: 'blocked', reason: 'global_ghn_disabled' }
  }
  const conversation = await findOrCreateGhnConversation(env, order)
  if (!conversation?.id || !cleanText(conversation.buyer_id)) {
    await saveGhnNoticeLog(env, order, { message_text: messageText, send_status: 'failed', error_code: 'missing_conversation', error_message: 'Chưa có buyer_id/to_id để gửi Shopee Chat.' })
    return { order_sn: order.order_sn, status: 'failed', reason: 'missing_conversation' }
  }
  const request = new Request('https://worker.local/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: conversation.id, content: messageText, dry_run: false })
  })
  const response = await sendChatReply(request, env, {})
  const data = await response.json().catch(() => ({}))
  const sent = response.ok && data.sent_to_platform
  await saveGhnNoticeLog(env, order, {
    message_text: messageText,
    send_status: sent ? 'sent' : 'failed',
    shopee_message_id: cleanText(data.message?.message_id || data.shopee?.message_id),
    shopee_response_code: cleanText(data.error || data.shopee?.error),
    shopee_response_message: cleanText(data.message || data.shopee?.message),
    error_code: sent ? '' : cleanText(data.error || 'shopee_chat_send_failed'),
    error_message: sent ? '' : cleanText(data.message || 'Shopee Chat từ chối gửi tin GHN.'),
    raw_response_masked: data,
    sent_at: sent ? new Date().toISOString() : ''
  })
  return { order_sn: order.order_sn, status: sent ? 'sent' : 'failed', sent_to_platform: sent, response: data }
}

async function listGhnAutoMessageOrders(request, env, cors) {
  const url = new URL(request.url)
  const rows = await listGhnCandidateOrders(env, {
    shop: url.searchParams.get('shop'),
    order_sn: url.searchParams.get('order_sn') || url.searchParams.get('orderSn'),
    limit: url.searchParams.get('limit')
  })
  return json({ status: 'ok', rows }, cors)
}

async function runGhnAutoMessageBatch(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const dryRun = body.dry_run !== false
  if (!dryRun && body.confirm !== 'SEND_GHN_NOTICE') {
    return json({ status: 'error', error: 'missing_confirm', message: 'Gửi thật GHN cần confirm SEND_GHN_NOTICE.' }, cors, 400)
  }
  const rows = await listGhnCandidateOrders(env, { shop: body.shop, order_sn: body.order_sn || body.orderSn, limit: body.limit || 10 })
  const results = []
  for (const row of rows.slice(0, Math.min(Math.max(Number(body.limit || 10) || 10, 1), 30))) {
    results.push(await processGhnNoticeOrder(env, row, { dry_run: dryRun, template: body.template }))
  }
  return json({
    status: 'ok',
    dry_run: dryRun,
    processed: results.length,
    sent: results.filter(item => item.status === 'sent').length,
    failed: results.filter(item => item.status === 'failed' || item.status === 'blocked').length,
    skipped: results.filter(item => item.status === 'skipped').length,
    results
  }, cors)
}

Object.assign(globalThis, {
  GHN_NOTICE_DEFAULT_TEMPLATE,
  normalizeGhnCarrierText,
  isGhnCarrier,
  validateGhnTemplate,
  renderGhnNoticeMessage,
  isGhnAutoOrderEligible,
  listGhnAutoMessageOrders,
  runGhnAutoMessageBatch
})
