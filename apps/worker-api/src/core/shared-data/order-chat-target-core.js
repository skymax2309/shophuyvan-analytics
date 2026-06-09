import { getCoreOrder } from './core-data-core.js'
import { getCoreShopSummary } from './shop-core-data.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function lowerText(value) {
  return cleanText(value).toLowerCase()
}

function isChatApiEnabled(shop = {}) {
  const mode = lowerText(shop.shop_chat_mode)
  const send = lowerText(shop.send_capability)
  const sync = lowerText(shop.sync_capability)
  return mode === 'api' && (
    ['official_api', 'bridge'].includes(send)
    || ['polling_api', 'webhook'].includes(sync)
  )
}

function unsupportedReason(platform, shop = null) {
  if (platform === 'tiktok') return 'TikTok cần mở chat thủ công/local helper; không xác nhận gửi tự động nếu chưa có API chính thức.'
  if (platform === 'lazada' && shop && !isChatApiEnabled(shop)) return 'Lazada Chat API thiếu token/quyền IM hoặc chưa bật bridge chính thức cho shop này.'
  if (platform === 'shopee' && shop && !isChatApiEnabled(shop)) return 'Shop chưa bật Chat API.'
  return 'Shop manual/import không hỗ trợ chat tự động.'
}

function isMaskedCustomer(value) {
  return cleanText(value).includes('*')
}

function lazadaConversationSession(row = {}) {
  return cleanText(row?.canonical_conversation_id || row?.conversation_id)
}

function lazadaConversationSource(row = {}) {
  const source = cleanText(row.source)
  const reason = cleanText(row.match_reason)
  return ['marketplace_chat_conversations', source, reason].filter(Boolean).join(':')
}

async function findLazadaConversationBySql(env, sql, binds = []) {
  if (!env?.DB) return null
  const row = await env.DB.prepare(sql).bind(...binds).first()
  const sessionId = lazadaConversationSession(row)
  if (!sessionId) return null
  return {
    ...row,
    session_id: sessionId,
    conversation_id: sessionId,
    source: lazadaConversationSource(row),
    confidence: cleanText(row.confidence || 'synced_chat_session')
  }
}

async function resolveLazadaSyncedConversation(env, order = {}, shopId = '', shopName = '') {
  if (!env?.DB) return null
  const orderId = cleanText(order.platform_order_id || order.order_id || order.id)
  const buyerId = cleanText(order.buyer_user_id || order.buyer_id || order.customer_id)
  const customerName = cleanText(order.buyer_name || order.customer_name)
  const scopedShopId = cleanText(shopId)
  const scopedShopName = cleanText(shopName || order.shop_name || order.shop)

  if (!scopedShopId && !scopedShopName) return null

  if (orderId) {
    const likeOrder = `%${orderId}%`
    const byOrderCard = await findLazadaConversationBySql(env, `
      SELECT conversation_id, canonical_conversation_id, buyer_id, buyer_name, source,
             'order_message_card' AS match_reason,
             'order_session_confirmed' AS confidence
      FROM marketplace_chat_conversations
      WHERE platform = 'lazada'
        AND (? = '' OR shop_id = ? OR shop = ?)
        AND (
          last_message LIKE ?
          OR conversation_id LIKE ?
          OR canonical_conversation_id LIKE ?
          OR identity_key LIKE ?
        )
      ORDER BY CASE WHEN canonical_conversation_id != '' THEN 0 ELSE 1 END,
               CASE WHEN source = 'api' THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 1
    `, [scopedShopId, scopedShopId, scopedShopName, likeOrder, likeOrder, likeOrder, likeOrder])
    if (byOrderCard) return byOrderCard
  }

  if (buyerId) {
    const byBuyer = await findLazadaConversationBySql(env, `
      SELECT conversation_id, canonical_conversation_id, buyer_id, buyer_name, source,
             'buyer_id_exact' AS match_reason,
             'buyer_session_confirmed' AS confidence
      FROM marketplace_chat_conversations
      WHERE platform = 'lazada'
        AND (? = '' OR shop_id = ? OR shop = ?)
        AND buyer_id = ?
      ORDER BY CASE WHEN canonical_conversation_id != '' THEN 0 ELSE 1 END,
               CASE WHEN source = 'api' THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 1
    `, [scopedShopId, scopedShopId, scopedShopName, buyerId])
    if (byBuyer) return byBuyer
  }

  if (customerName) {
    const { results } = await env.DB.prepare(`
      SELECT conversation_id, canonical_conversation_id, buyer_id, buyer_name, source,
             'buyer_name_unique' AS match_reason,
             'buyer_name_unique_sync' AS confidence
      FROM marketplace_chat_conversations
      WHERE platform = 'lazada'
        AND (? = '' OR shop_id = ? OR shop = ?)
        AND buyer_name = ?
        AND (canonical_conversation_id != '' OR conversation_id != '')
      ORDER BY CASE WHEN source = 'api' THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 2
    `).bind(scopedShopId, scopedShopId, scopedShopName, customerName).all()
    if ((results || []).length === 1) {
      const row = results[0]
      const resolved = lazadaConversationSession(row)
      if (resolved) {
        return {
          ...row,
          session_id: resolved,
          conversation_id: resolved,
          source: lazadaConversationSource(row),
          confidence: isMaskedCustomer(customerName) ? 'masked_buyer_name_unique' : 'buyer_name_unique_sync'
        }
      }
    }
  }

  return null
}

export async function resolveCoreOrderChatTarget(env, orderId) {
  const order = await getCoreOrder(env, orderId)
  if (!order) return null

  const platform = lowerText(order.platform || 'shopee')
  const shop = await getCoreShopSummary(env, order.shop_id || order.shop_name || '', { platform })
  const shopId = cleanText(shop?.shop_id || order.shop_id || order.shop_name)
  let customerId = cleanText(order.buyer_user_id || order.buyer_id || order.buyer_name)
  const customerName = cleanText(order.buyer_name)
  const enabled = ['shopee', 'lazada'].includes(platform) && isChatApiEnabled(shop)
  const lazadaSynced = platform === 'lazada' && enabled
    ? await resolveLazadaSyncedConversation(env, order, shopId, shop?.shop_display_name || order.shop_name)
    : null
  if (platform === 'lazada' && lazadaSynced?.buyer_id) customerId = cleanText(lazadaSynced.buyer_id)
  const missingFields = []
  if (!shopId) missingFields.push('shop_id_missing')
  if (!customerId || (platform === 'lazada' && isMaskedCustomer(customerId))) missingFields.push('buyer_id_missing')
  if (platform === 'lazada' && !lazadaSynced?.conversation_id) missingFields.push('conversation_id_missing')
  const browserHelperCandidate = !enabled && ['tiktok', 'shopee'].includes(platform) && Boolean(shopId || customerName || customerId)
  const lazadaConversationMissing = platform === 'lazada' && enabled && !lazadaSynced?.conversation_id
  const manualRequired = lazadaConversationMissing || (!enabled && !browserHelperCandidate) || missingFields.length > 0
  const chatOpenStatus = lazadaConversationMissing
    ? 'not_connected'
    : ((enabled || browserHelperCandidate) && missingFields.length === 0 ? 'ready' : 'manual_required')
  const reasonCode = lazadaConversationMissing
    ? 'lazada_conversation_not_found'
    : (enabled ? '' : 'chat_api_not_enabled')
  const reason = enabled
    ? (customerId
      ? (platform === 'lazada'
        ? (lazadaSynced?.conversation_id ? 'Mở Chat Lazada theo session đã đồng bộ.' : 'Chưa nối được đơn với session Lazada đã đồng bộ.')
        : 'Mở Chat mới theo khách và đơn hàng.')
      : 'Chưa có hội thoại. Chat mới sẽ mở theo mã đơn để xem tab Đơn/Sản phẩm liên quan.')
    : unsupportedReason(platform, shop)

  return {
    source: lazadaSynced?.source || 'Order Core + Shop Core',
    confidence: lazadaSynced?.confidence || (enabled && shopId ? 'core_shop_confirmed' : 'missing_or_unsupported'),
    order_id: cleanText(order.platform_order_id || orderId),
    platform,
    channel: platform,
    shop_id: shopId,
    shop_display_name: cleanText(shop?.shop_display_name || order.shop_name || shopId),
    customer_id: customerId,
    customer_name: customerName,
    buyer_id: cleanText(lazadaSynced?.buyer_id || order.buyer_user_id || order.buyer_id),
    session_id: cleanText(lazadaSynced?.session_id),
    conversation_id: cleanText(lazadaSynced?.conversation_id),
    conversation_resolution: lazadaSynced?.conversation_id ? 'lazada_synced_session' : (enabled ? 'chat_worker_lookup' : (browserHelperCandidate ? 'browser_helper_queue' : 'unsupported')),
    open_chat_allowed: enabled || browserHelperCandidate,
    chat_open_status: chatOpenStatus,
    manual_required: manualRequired,
    missing_fields: missingFields,
    reason_code: reasonCode,
    reason: lazadaConversationMissing ? reasonCode : reason,
    shop_chat_mode: browserHelperCandidate ? 'browser_helper' : cleanText(shop?.shop_chat_mode),
    send_capability: browserHelperCandidate ? 'manual_only' : cleanText(shop?.send_capability),
    sync_capability: browserHelperCandidate ? 'browser_helper' : cleanText(shop?.sync_capability),
    order,
    shop_core: shop || null
  }
}
