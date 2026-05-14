// NEO: Backend worker chat sàn - nhóm context-panel. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function loadMarketplaceChatContext(env, conversation, messages = []) {
  const empty = {
    orders: [],
    soft_orders: [],
    reference_orders: [],
    order_context: {
      mode: 'manual_reference',
      source_label: 'Tham chiếu OMS',
      source_note: 'Shop này chưa có API đơn hàng. Tab Đơn hàng chỉ đọc dữ liệu OMS hiện có hoặc fallback riêng.',
      can_sync: 0,
      sync_reason: 'Shop này chưa có API đơn hàng.',
      sync_button_label: 'Chưa có API đơn hàng',
      latest_shop_sync_at: '',
      total_shop_orders: 0,
      hard_count: 0,
      soft_count: 0,
      reference_count: 0,
      match_state: 'none',
      match_state_label: 'Chưa khớp đơn',
      sync_recommended: 0,
      sync_key: ''
    },
    products: [],
    product_catalog_summary: { total_products: 0, loaded_from_api: false },
    product_catalog_index: [],
    product_catalog: [],
    product_advisories: [],
    vouchers: [],
    voucher_summary: null,
    notes: []
  }
  if (!conversation) return empty

  const platform = cleanText(conversation.platform).toLowerCase()
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const shopAliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const orderSyncShop = await loadChatOrderSyncShop(env, platform, shop, shopId, shopAliases)
  const orderSyncCapability = resolveChatOrderSyncCapability(orderSyncShop || { platform })
  const shopPlaceholders = shopAliases.length ? shopAliases.map(() => '?').join(',') : ''
  const baseBind = [platform, platform, ...shopAliases]
  const baseWhere = `(? = '' OR lower(platform) = ?) AND (${shopAliases.length ? `shop IN (${shopPlaceholders})` : '1 = 1'})`
  const notes = []
  let contextMessages = Array.isArray(messages) ? messages : []
  if (!contextMessages.length && cleanText(conversation.conversation_id) && await tableExists(env, 'marketplace_chat_messages')) {
    const messageShopWhere = shopAliases.length
      ? `(shop IN (${shopPlaceholders}) OR shop_id IN (${shopPlaceholders}))`
      : '1 = 1'
    const { results } = await env.DB.prepare(`
      SELECT content, raw_payload, media_items, sent_at, created_at
      FROM marketplace_chat_messages
      WHERE lower(platform) = ?
        AND conversation_id = ?
        AND ${messageShopWhere}
      ORDER BY datetime(COALESCE(NULLIF(sent_at, ''), created_at)) DESC, id DESC
      LIMIT 30
    `).bind(platform, conversation.conversation_id, ...shopAliases, ...shopAliases).all()
    contextMessages = results || []
  }
  const buyerLookup = buildBuyerOrderLookup(conversation, contextMessages)
  const chatOrderIds = extractChatOrderIds(conversation, contextMessages)
  let orders = []
  let softOrders = []
  let referenceOrders = []
  const orderContext = {
    mode: cleanText(orderSyncCapability.mode),
    source_label: cleanText(orderSyncCapability.source_label),
    source_note: cleanText(orderSyncCapability.source_note),
    can_sync: orderSyncCapability.can_sync ? 1 : 0,
    sync_reason: cleanText(orderSyncCapability.sync_reason),
    sync_button_label: cleanText(orderSyncCapability.sync_button_label),
    latest_shop_sync_at: '',
    total_shop_orders: 0,
    hard_count: 0,
    soft_count: 0,
    reference_count: 0,
    match_state: 'none',
    match_state_label: 'Chưa khớp đơn',
    sync_recommended: 0,
    sync_key: [platform, cleanText(orderSyncShop?.api_shop_id || shopId || shop)].filter(Boolean).join('|')
  }
  let products = []
  let productKnowledge = {
    product_catalog_summary: { total_products: 0, loaded_from_api: false },
    product_catalog_index: [],
    product_catalog: []
  }
  let productAdvisories = []
  let vouchers = []
  let voucherSummary = null

  if (await tableExists(env, 'orders_v2')) {
    const orderColumns = `
      id, order_id, platform, shop, order_date, revenue, net_revenue,
      discount_shop, discount_shopee, shipping_carrier, tracking_number,
      oms_status, shipping_status, customer_name, customer_phone, created_at,
      source_mode, source_detail, source_updated_at
    `
    const latestShopSync = await env.DB.prepare(`
      SELECT
        MAX(COALESCE(NULLIF(source_updated_at, ''), NULLIF(created_at, ''), NULLIF(order_date, ''))) AS latest_sync_at,
        COUNT(*) AS total_orders
      FROM orders_v2
      WHERE ${baseWhere}
    `).bind(...baseBind).first().catch(() => null)
    orderContext.latest_shop_sync_at = cleanText(latestShopSync?.latest_sync_at)
    orderContext.total_shop_orders = Number(latestShopSync?.total_orders || 0)

    let hardOrderRows = []
    let softOrderRows = []
    let referenceOrderRows = []
    let hardMatchReason = ''
    let softMatchReason = ''
    if (chatOrderIds.length) {
      const placeholders = chatOrderIds.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
        SELECT ${orderColumns}
        FROM orders_v2
        WHERE ${baseWhere}
          AND order_id IN (${placeholders})
        ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
        LIMIT 8
      `).bind(...baseBind, ...chatOrderIds).all()
      hardOrderRows = results || []
      if (!hardOrderRows.length) {
        const { results: byOrderOnly } = await env.DB.prepare(`
          SELECT ${orderColumns}
          FROM orders_v2
          WHERE (? = '' OR lower(platform) = ?)
            AND order_id IN (${placeholders})
          ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
          LIMIT 8
        `).bind(platform, platform, ...chatOrderIds).all()
        hardOrderRows = byOrderOnly || []
        if (hardOrderRows.length) {
          hardMatchReason = 'Khớp chắc theo mã đơn khách gửi trong chat; OMS đang lưu shop khác bí danh hội thoại.'
          notes.push('Đơn được khớp theo mã đơn khách gửi trong chat; shop trong OMS có thể khác bí danh hội thoại.')
        }
      } else {
        hardMatchReason = 'Khớp chắc theo mã đơn khách gửi trong chat hoặc thẻ đơn từ API chat.'
        notes.push('Đơn được khớp trực tiếp theo mã đơn khách gửi trong chat.')
      }
    }
    if (!hardOrderRows.length && (buyerLookup.names.length || buyerLookup.phones.length)) {
      // Khớp mềm chỉ chạy khi không có mã đơn/thẻ đơn chắc chắn để tránh lẫn đơn sai khách.
      const buyerClauses = []
      const buyerParams = []
      for (const name of buyerLookup.names) {
        buyerClauses.push('(LOWER(TRIM(customer_name)) = LOWER(TRIM(?)) OR LOWER(customer_name) LIKE LOWER(?))')
        buyerParams.push(name, `%${name}%`)
      }
      for (const phone of buyerLookup.phones) {
        buyerClauses.push(`REPLACE(REPLACE(REPLACE(COALESCE(customer_phone, ''), ' ', ''), '-', ''), '.', '') LIKE ?`)
        buyerParams.push(`%${phone}%`)
      }
      if (buyerClauses.length) {
        const { results } = await env.DB.prepare(`
          SELECT ${orderColumns}
          FROM orders_v2
          WHERE ${baseWhere}
            AND (${buyerClauses.join(' OR ')})
          ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
          LIMIT 4
        `).bind(...baseBind, ...buyerParams).all()
        softOrderRows = results || []
        if (softOrderRows.length) {
          softMatchReason = 'Khớp mềm theo tên hoặc số điện thoại khách trong OMS, cần kiểm tra lại trước khi trả lời.'
          notes.push('Tìm thấy đơn khớp mềm theo tên/số điện thoại khách trong OMS. Cần kiểm tra lại trước khi chèn trạng thái đơn vào câu trả lời.')
        }
      }
    }
    if (!hardOrderRows.length && !softOrderRows.length) {
      if (chatOrderIds.length) {
        notes.push(`Khách có mã đơn trong chat (${chatOrderIds.join(', ')}) nhưng OMS chưa tìm thấy đơn khớp chính xác.`)
      } else {
        notes.push('Chưa khớp được đơn hàng chính xác từ mã đơn hoặc thông tin khách trong chat; hệ thống chỉ hiển thị nhóm đơn tham chiếu cùng shop để CSKH kiểm tra, không gắn nhãn là đơn của khách.')
      }
      // Khi chưa khớp được khách, vẫn hiển thị nhóm tham chiếu cùng shop để đội CSKH biết dữ liệu OMS/API đang có gì,
      // nhưng không gắn nhãn là đơn của khách nhằm tránh trả lời nhầm.
      const { results: referenceRows } = await env.DB.prepare(`
        SELECT ${orderColumns}
        FROM orders_v2
        WHERE ${baseWhere}
        ORDER BY datetime(COALESCE(NULLIF(order_date, ''), created_at)) DESC, id DESC
        LIMIT 5
      `).bind(...baseBind).all()
      referenceOrderRows = referenceRows || []
      if (referenceOrderRows.length) {
        notes.push('Đơn hàng đang hiển thị thêm nhóm tham chiếu cùng shop; cần kiểm tra trước khi chèn vào câu trả lời.')
      }
    }

    const itemOrderIds = [...new Set([
      ...hardOrderRows.map(row => cleanText(row.order_id)),
      ...softOrderRows.map(row => cleanText(row.order_id)),
      ...referenceOrderRows.map(row => cleanText(row.order_id))
    ].filter(Boolean))]
    const itemMap = new Map()
    if (itemOrderIds.length && await tableExists(env, 'order_items')) {
      const placeholders = itemOrderIds.map(() => '?').join(',')
      const { results: itemRows } = await env.DB.prepare(`
        SELECT id, order_id, sku, product_name, qty, revenue_line, image_url, variation_name
        FROM order_items
        WHERE order_id IN (${placeholders})
        ORDER BY id ASC
      `).bind(...itemOrderIds).all()
      for (const item of itemRows || []) {
        const key = cleanText(item.order_id)
        if (!itemMap.has(key)) itemMap.set(key, [])
        itemMap.get(key).push(compactOrderItem(item))
      }
    }
    orders = hardOrderRows.map(row => compactChatOrderMatch(
      row,
      itemMap.get(cleanText(row.order_id)) || [],
      {
        match_type: CHAT_ORDER_MATCH_HARD,
        match_reason: hardMatchReason || 'Khớp chắc theo mã đơn khách gửi trong chat hoặc thẻ đơn API.',
        match_source: 'chat_order_id',
        match_confidence: 1
      }
    ))
    softOrders = softOrderRows.map(row => compactChatOrderMatch(
      row,
      itemMap.get(cleanText(row.order_id)) || [],
      {
        match_type: CHAT_ORDER_MATCH_SOFT,
        match_reason: softMatchReason || 'Khớp mềm theo tên hoặc số điện thoại khách trong OMS, cần kiểm tra lại.',
        match_source: 'buyer_name_phone',
        match_confidence: 0.62
      }
    ))

    referenceOrders = referenceOrderRows.map(row => ({
      ...compactChatOrderMatch(
        row,
        itemMap.get(cleanText(row.order_id)) || [],
        {
          match_type: CHAT_ORDER_MATCH_SOFT,
          match_reason: 'Đơn gần đây cùng shop, chỉ dùng để tham chiếu khi chưa khớp được khách trong hội thoại.',
          match_source: 'same_shop_reference',
          match_confidence: 0
        }
      ),
      match_type: 'reference',
      match_label: 'Đơn tham chiếu cùng shop',
      match_tone: 'muted'
    }))

    orderContext.hard_count = orders.length
    orderContext.soft_count = softOrders.length
    orderContext.reference_count = referenceOrders.length
    orderContext.match_state = orders.length ? CHAT_ORDER_MATCH_HARD : (softOrders.length ? CHAT_ORDER_MATCH_SOFT : 'none')
    orderContext.match_state_label = chatOrderMatchStateLabel(orderContext.hard_count, orderContext.soft_count)
    orderContext.sync_recommended = orderContext.can_sync
      && !orders.length
      && chatOrderSyncStale(orderContext.latest_shop_sync_at, 15)
      ? 1
      : 0
  }

  const orderSkus = [...new Set(orders.flatMap(order => order.items || [])
    .flatMap(item => [item.sku])
    .map(cleanText)
    .filter(Boolean))]

  productKnowledge = await loadProductKnowledgeForChat(env, conversation, contextMessages, orderSkus)
  if (productKnowledge.product_catalog_summary?.loaded_from_api) {
    notes.push(`AI chat đã nạp catalog sản phẩm API của shop: ${productKnowledge.product_catalog_summary.total_products || 0} sản phẩm, ${productKnowledge.product_catalog_summary.total_variations || 0} phân loại.`)
  }

  if (await tableExists(env, 'product_variations')) {
    if (orderSkus.length) {
      const placeholders = orderSkus.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
        SELECT id, platform, shop, platform_item_id, product_name, variation_name,
               platform_sku, internal_sku, image_url, price, discount_price, stock,
               map_status, updated_at, created_at
        FROM product_variations
        WHERE ${baseWhere}
          AND (platform_sku IN (${placeholders}) OR internal_sku IN (${placeholders}))
        ORDER BY CASE WHEN COALESCE(stock, 0) > 0 THEN 0 ELSE 1 END,
                 datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
        LIMIT 16
      `).bind(...baseBind, ...orderSkus, ...orderSkus).all()
      products = (results || []).map(compactProduct)
    }
    if (!products.length) {
      const { results } = await env.DB.prepare(`
        SELECT id, platform, shop, platform_item_id, product_name, variation_name,
               platform_sku, internal_sku, image_url, price, discount_price, stock,
               map_status, updated_at, created_at
        FROM product_variations
        WHERE ${baseWhere}
        ORDER BY CASE WHEN COALESCE(stock, 0) > 0 THEN 0 ELSE 1 END,
                 datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
        LIMIT 16
      `).bind(...baseBind).all()
      products = (results || []).map(compactProduct)
      if (products.length) notes.push('Sản phẩm đang lấy theo shop vì hội thoại chưa gắn trực tiếp SKU.')
    }
  } else if (await tableExists(env, 'products')) {
    if (orderSkus.length) {
      const placeholders = orderSkus.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
        SELECT sku, product_name, image_url, stock, created_at
        FROM products
        WHERE sku IN (${placeholders})
        ORDER BY stock DESC, sku ASC
        LIMIT 16
      `).bind(...orderSkus).all()
      products = (results || []).map(compactProduct)
    } else {
      const { results } = await env.DB.prepare(`
        SELECT sku, product_name, image_url, stock, created_at
        FROM products
        ORDER BY stock DESC, sku ASC
        LIMIT 16
      `).all()
      products = (results || []).map(compactProduct)
    }
  }

  productAdvisories = await loadProductAdvisoriesForChat(env, conversation, {
    orders,
    products,
    ...productKnowledge
  }, contextMessages)
  if (productAdvisories.length) {
    notes.push(`Hệ thống tìm thấy ${productAdvisories.length} lưu ý sản phẩm cần nhắc cho hội thoại này.`)
  }

  if (await tableExists(env, 'marketplace_webhook_events')) {
    const { results } = await env.DB.prepare(`
      SELECT id, platform, shop, shop_id, event_code, status, message, payload, processed_at
      FROM marketplace_webhook_events
      WHERE event_code IN ('item_promotion_push', 'promotion_update_push')
        AND ${baseWhere.replaceAll('shop = ?', 'shop = ?')}
      ORDER BY id DESC
      LIMIT 8
    `).bind(...baseBind).all()
    vouchers = (results || []).map(compactVoucherEvent)
  }

  if (await tableExists(env, 'platform_reports')) {
    voucherSummary = await env.DB.prepare(`
      SELECT SUM(COALESCE(seller_voucher, 0)) AS seller_voucher,
             SUM(COALESCE(co_funded_voucher, 0)) AS co_funded_voucher,
             MAX(report_month) AS latest_month
      FROM platform_reports
      WHERE ${baseWhere}
    `).bind(...baseBind).first().catch(() => null)
  }

  return {
    orders,
    soft_orders: softOrders,
    reference_orders: referenceOrders,
    order_context: orderContext,
    products,
    ...productKnowledge,
    product_advisories: productAdvisories,
    vouchers,
    voucher_summary: voucherSummary ? {
      seller_voucher: Number(voucherSummary.seller_voucher || 0),
      co_funded_voucher: Number(voucherSummary.co_funded_voucher || 0),
      latest_month: cleanText(voucherSummary.latest_month)
    } : null,
    notes
  }
}

async function loadChatAiContext(env, body) {
  const id = cleanText(body.id)
  const conversationId = cleanText(body.conversation_id)
  let conversation = null
  if (id) {
    conversation = await env.DB.prepare(`
      SELECT * FROM marketplace_chat_conversations WHERE id = ? LIMIT 1
    `).bind(id).first()
  } else if (conversationId) {
    conversation = await env.DB.prepare(`
      SELECT * FROM marketplace_chat_conversations WHERE conversation_id = ? LIMIT 1
    `).bind(conversationId).first()
  }

  let messages = Array.isArray(body.messages) ? body.messages : []
  if (conversation) {
    const { results } = await env.DB.prepare(`
      SELECT sender_type, sender_name, message_type, content, media_items, raw_payload, sent_at, created_at
      FROM marketplace_chat_messages
      WHERE platform = ? AND shop = ? AND conversation_id = ?
      ORDER BY datetime(COALESCE(NULLIF(sent_at, ''), created_at)) DESC, id DESC
      LIMIT 20
    `).bind(conversation.platform, conversation.shop, conversation.conversation_id).all()
    messages = (results || []).reverse()
  }

  const normalizedMessages = messages.map(msg => ({
    sender_type: cleanText(msg.sender_type),
    sender_name: cleanText(msg.sender_name),
    message_type: cleanText(msg.message_type),
    content: cleanText(msg.content || mediaMessageSummary(msg.media_items)).slice(0, 700),
    media_items: normalizeMediaItems(msg.media_items, msg.raw_payload).slice(0, 3),
    sent_at: cleanText(msg.sent_at || msg.created_at)
  })).filter(msg => msg.content || msg.media_items?.length).slice(-12)
  const customerMessage = cleanText(body.customer_message || body.current_message)
  const currentDraft = cleanText(body.current_draft)
  const productContext = cleanText(body.product_context)
  const contextMessages = [
    ...normalizedMessages,
    customerMessage ? { sender_type: 'customer', content: customerMessage, media_items: [] } : null,
    currentDraft ? { sender_type: 'staff_draft', content: currentDraft, media_items: [] } : null,
    productContext ? { sender_type: 'product_context', content: productContext, media_items: [] } : null
  ].filter(Boolean)
  const marketplaceContext = await loadMarketplaceChatContext(env, conversation, contextMessages)

  const aiContext = {
    conversation,
    platform: cleanText(body.platform || conversation?.platform).toLowerCase(),
    shop: cleanText(body.shop || conversation?.shop || conversation?.shop_id),
    customer_message: customerMessage,
    product_context: productContext,
    current_draft: currentDraft,
    marketplace_context: marketplaceContext,
    messages: normalizedMessages
  }
  aiContext.knowledge_context = await loadRelevantChatKnowledge(env, aiContext, 5)
  return aiContext
}

Object.assign(globalThis, {
  loadMarketplaceChatContext,
  loadChatAiContext
})
