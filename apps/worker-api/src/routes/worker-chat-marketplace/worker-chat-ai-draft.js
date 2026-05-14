// NEO: Backend worker chat sàn - nhóm ai-draft. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function requestGeminiChatDraft(env, settings, context) {
  const keys = getGeminiChatKeys(env)
  const fallback = makeLocalChatDraft(context)
  if (!keys.length) {
    return {
      provider: 'local-fallback',
      reply: fallback,
      warnings: ['Chưa cấu hình GEMINI_CHAT_API_KEY hoặc GEMINI_API_KEY_* nên đang dùng mẫu trả lời an toàn nội bộ.'],
      needs_review: 1
    }
  }

  // Thu gọn context riêng cho AI để giảm timeout nhưng vẫn giữ đúng dữ liệu cốt lõi.
  const compactMessages = (Array.isArray(context.messages) ? context.messages : []).slice(-8).map(item => ({
    sender_type: cleanText(item.sender_type).slice(0, 32),
    sender_name: cleanText(item.sender_name).slice(0, 80),
    message_type: cleanText(item.message_type).slice(0, 40),
    content: cleanText(item.content).slice(0, 360),
    media_summary: normalizeMediaItems(item.media_items, item.raw_payload).slice(0, 2).map(media => ({
      type: cleanText(media.type).slice(0, 24),
      alt: cleanText(media.alt || media.caption || '').slice(0, 120)
    })),
    sent_at: cleanText(item.sent_at).slice(0, 32)
  }))
  const compactKnowledge = (Array.isArray(context.knowledge_context) ? context.knowledge_context : []).slice(0, 2).map(item => ({
    id: Number(item.id || 0),
    title: cleanText(item.title).slice(0, 120),
    content: cleanText(item.content).slice(0, 280)
  }))
  const marketplace = context.marketplace_context || {}
  const compactOrders = (Array.isArray(marketplace.orders) ? marketplace.orders : []).slice(0, 3).map(order => ({
    order_id: cleanText(order.order_id).slice(0, 40),
    order_date: cleanText(order.order_date).slice(0, 32),
    oms_status: cleanText(order.oms_status).slice(0, 40),
    shipping_status: cleanText(order.shipping_status).slice(0, 40),
    customer_name: cleanText(order.customer_name).slice(0, 120),
    revenue: Number(order.revenue || 0),
    items: (Array.isArray(order.items) ? order.items : []).slice(0, 2).map(item => ({
      sku: cleanText(item.sku).slice(0, 80),
      product_name: cleanText(item.product_name).slice(0, 140),
      qty: Number(item.qty || 0)
    }))
  }))
  const compactCatalogIndex = (Array.isArray(marketplace.product_catalog_index) ? marketplace.product_catalog_index : []).slice(0, 12).map(item => ({
    item_id: cleanText(item.platform_item_id || item.item_id || item.id).slice(0, 48),
    sku: cleanText(item.item_sku || item.platform_sku || item.internal_sku).slice(0, 80),
    product_name: cleanText(item.product_name).slice(0, 140),
    variation_names: (Array.isArray(item.variation_names) ? item.variation_names : []).slice(0, 4).map(name => cleanText(name).slice(0, 80)),
    stock: Number(item.stock || item.total_stock || 0),
    price: Number(item.price || item.sale_price || 0),
    discount_price: Number(item.discount_price || 0)
  }))
  const compactCatalogDetail = (Array.isArray(marketplace.product_catalog) ? marketplace.product_catalog : []).slice(0, 6).map(item => ({
    item_id: cleanText(item.platform_item_id || item.item_id || item.id).slice(0, 48),
    sku: cleanText(item.item_sku || item.platform_sku || item.internal_sku).slice(0, 80),
    product_name: cleanText(item.product_name).slice(0, 140),
    description: cleanText(item.description).slice(0, 240),
    stock: Number(item.stock || item.total_stock || 0),
    price: Number(item.price || item.sale_price || 0),
    variation_names: (Array.isArray(item.variation_names) ? item.variation_names : []).slice(0, 5).map(name => cleanText(name).slice(0, 80))
  }))
  const compactAdvisories = (Array.isArray(marketplace.product_advisories) ? marketplace.product_advisories : []).slice(0, 5).map(item => ({
    id: Number(item.id || 0),
    severity: cleanText(item.severity).slice(0, 24),
    title: cleanText(item.title || item.trigger_value || item.related_product_name).slice(0, 120),
    message: cleanText(item.message).slice(0, 260),
    related_item_id: cleanText(item.related_item_id).slice(0, 48),
    related_product_name: cleanText(item.related_product_name).slice(0, 140)
  }))
  const compactProducts = (Array.isArray(marketplace.products) ? marketplace.products : []).slice(0, 8).map(item => ({
    sku: cleanText(item.platform_sku || item.internal_sku || item.sku).slice(0, 80),
    product_name: cleanText(item.product_name).slice(0, 140),
    variation_name: cleanText(item.variation_name).slice(0, 120),
    stock: Number(item.stock || 0),
    price: Number(item.price || item.discount_price || 0)
  }))
  const compactNotes = (Array.isArray(marketplace.notes) ? marketplace.notes : []).slice(0, 6).map(item => cleanText(item).slice(0, 180))
  const compactPromptPayload = {
    platform: context.platform,
    shop: context.shop,
    customer_message: cleanText(context.customer_message).slice(0, 800),
    product_context: cleanText(context.product_context).slice(0, 500),
    current_draft: cleanText(context.current_draft).slice(0, 500),
    marketplace_context: {
      orders: compactOrders,
      products: compactProducts,
      product_catalog_summary: {
        loaded_from_api: Number(marketplace.product_catalog_summary?.loaded_from_api || 0) === 1 || marketplace.product_catalog_summary?.loaded_from_api === true,
        total_products: Number(marketplace.product_catalog_summary?.total_products || 0),
        total_variations: Number(marketplace.product_catalog_summary?.total_variations || 0),
        in_stock_products: Number(marketplace.product_catalog_summary?.in_stock_products || 0),
        latest_synced_at: cleanText(marketplace.product_catalog_summary?.latest_synced_at).slice(0, 32)
      },
      product_catalog_index: compactCatalogIndex,
      product_catalog: compactCatalogDetail,
      product_advisories: compactAdvisories,
      voucher_summary: marketplace.voucher_summary ? {
        seller_voucher: Number(marketplace.voucher_summary.seller_voucher || 0),
        co_funded_voucher: Number(marketplace.voucher_summary.co_funded_voucher || 0),
        latest_month: cleanText(marketplace.voucher_summary.latest_month).slice(0, 12)
      } : null,
      notes: compactNotes
    },
    knowledge_context: compactKnowledge,
    messages: compactMessages
  }

  const prompt = [
    CHAT_AI_SUPPORT_SYSTEM_PROMPT,
    'Bạn là trợ lý CSKH cho shop bán hàng trên sàn.',
    'Nhiệm vụ: viết một bản nháp trả lời khách bằng tiếng Việt có dấu.',
    'Luật bắt buộc:',
    cleanText(settings.ai_rules || DEFAULT_CHAT_AI_RULES),
    'Luật chặn cứng phía hệ thống. Tuyệt đối không tạo câu trả lời khớp các mẫu này:',
    mergeRequiredChatAiForbiddenPatterns(settings.ai_forbidden_patterns || DEFAULT_CHAT_AI_FORBIDDEN_PATTERNS).join('\n'),
    'Các chủ đề nếu có nhắc tới thì phải đánh dấu needs_review=true:',
    normalizeRuleLineList(settings.ai_review_triggers || DEFAULT_CHAT_AI_REVIEW_TRIGGERS).join('\n'),
    'Giọng văn mong muốn:',
    cleanText(settings.ai_tone || 'Thân thiện, chuyên nghiệp, không hứa quá dữ liệu đang có'),
    'Tin nhắn khách đang cần trả lời nằm ở customer_message; nếu customer_message có nội dung thì ưu tiên trả lời đúng câu đó trước lịch sử cũ.',
    'Luật dữ liệu sản phẩm bắt buộc:',
    '- Trước khi tư vấn sản phẩm, phải đọc marketplace_context.product_catalog và marketplace_context.product_catalog_index.',
    '- product_catalog là dữ liệu chi tiết lấy từ API sản phẩm của đúng shop; product_catalog_index là danh mục SKU/tên/giá/tồn đã nạp để dò nhanh.',
    '- Chỉ tư vấn thông tin có trong catalog hoặc hội thoại/đơn hàng. Không tự bịa thông số, giá, tồn kho, bảo hành, chính sách, phụ kiện đi kèm.',
    '- Nếu khách hỏi sản phẩm không tìm thấy trong catalog hoặc dữ liệu còn thiếu, đặt needs_review=true và hỏi nhân viên/khách thêm thông tin thay vì khẳng định.',
    '- Tuyệt đối không nhắc giá vốn, lãi, cấu hình nội bộ, raw API hoặc chi phí shop cho khách.',
    'Lưu ý sản phẩm bắt buộc:',
    '- marketplace_context.product_advisories là các lưu ý đã được shop duyệt và đã khớp theo item/SKU/từ khóa sản phẩm trong đơn hoặc thẻ chat.',
    '- Nếu product_advisories có severity="required" hoặc "warning", phải đưa đúng ý chính của message vào bản nháp. Không làm nhẹ cảnh báo an toàn sử dụng.',
    '- Nếu advisory có related_item_id/related_product_name, chỉ nói shop sẽ gửi thẻ sản phẩm liên quan trên sàn; không tự bịa link ngoài sàn.',
    'Dữ liệu học đã duyệt từ shop:',
    '- knowledge_context là mẫu hỏi đáp đã được nhân viên duyệt để tham khảo cách trả lời.',
    '- Chỉ dùng knowledge_context khi phù hợp với câu khách đang hỏi; không dùng để thay thế giá, tồn kho, đơn hàng, voucher hoặc dữ liệu sản phẩm hiện tại.',
    '- Nếu knowledge_context mâu thuẫn với marketplace_context, luật cứng hoặc dữ liệu API hiện tại thì bỏ qua knowledge_context và đặt needs_review=true.',
    'Chỉ trả về JSON hợp lệ dạng {"reply":"","warnings":[],"needs_review":true}.',
    'Nếu thiếu dữ liệu để trả lời chắc chắn, needs_review phải là true và reply nên hỏi thêm thông tin.',
    JSON.stringify(compactPromptPayload)
  ].join('\n')

  let lastError = ''
  const orderedKeys = rotateGeminiChatKeys(keys).slice(0, Math.max(1, Math.min(keys.length, GEMINI_CHAT_MAX_ATTEMPTS)))
  const model = settings.ai_model || 'gemini-2.5-flash'
  for (let index = 0; index < orderedKeys.length; index += 1) {
    const key = orderedKeys[index]
    try {
      // Mỗi key có timeout riêng để key chậm không kéo chết toàn bộ luồng gợi ý AI.
      const aiAttempt = await requestGeminiGenerateContent(key, model, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35
        }
      })
      if (!aiAttempt.ok) {
        lastError = aiAttempt?.data?.error?.message || aiAttempt?.error?.message || 'gemini_error'
        continue
      }
      const aiData = aiAttempt.data || {}
      const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const parsed = JSON.parse(stripJsonFence(rawText))
      advanceGeminiChatKeyCursor(keys, index + 1)
      return {
        provider: 'gemini',
        reply: cleanText(parsed.reply || fallback),
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(cleanText).filter(Boolean).slice(0, 8) : [],
        needs_review: parsed.needs_review === false ? 0 : 1
      }
    } catch (error) {
      lastError = error.message
    }
  }
  advanceGeminiChatKeyCursor(keys, orderedKeys.length)

  return {
    provider: 'local-fallback',
    reply: fallback,
    warnings: [`AI chưa trả lời được (${lastError || 'gemini_unavailable'}). Đang dùng mẫu an toàn nội bộ.`],
    needs_review: 1
  }
}

async function buildChatAiDraftPayload(env, settings, body = {}) {
  const context = await loadChatAiContext(env, body)
  if (chatAiAutoLocked(context.conversation)) {
    return {
      context,
      payload: {
      status: 'blocked',
      blocked: true,
      reply: '',
      reason: context.conversation.ai_auto_lock_reason || 'Hội thoại này đã khóa AI tự động vì từng có nội dung bị chặn bởi chính sách sàn.',
      warnings: ['Hội thoại đã khóa AI tự động. Nhân viên cần xử lý thủ công để tránh lặp lỗi chính sách.'],
      needs_review: 1
      },
      status: 400
    }
  }
  const forcedPolicyReply = detectShopContactPolicyReply(context.customer_message)
  if (forcedPolicyReply) {
    const forcedGuard = combineChatGuards(
      assessChatContent(forcedPolicyReply, settings),
      assessAiPolicy(forcedPolicyReply, settings)
    )
    return {
      context,
      payload: {
      status: 'ok',
      provider: 'policy-contact-block',
      reply: forcedPolicyReply,
      guard: forcedGuard,
      warnings: ['Hệ thống đã ép câu trả lời an toàn vì khách đang xin thông tin liên hệ của shop.'],
      auto_send_allowed: Number(settings.ai_require_review) ? 0 : 1,
      direct_knowledge: null,
      knowledge_used: [],
      advisories_used: [],
      needs_review: Number(settings.ai_require_review) ? 1 : 0
      }
    }
  }
  const directKnowledge = pickDirectApprovedKnowledgeReply(context)
  let result = directKnowledge
    ? {
      provider: 'knowledge-template',
      reply: directKnowledge.answer,
      warnings: [`Đã dùng mẫu AI đã duyệt #${directKnowledge.id}.`],
      needs_review: 0,
      direct_knowledge: directKnowledge
    }
    : await requestGeminiChatDraft(env, settings, context)
  const sanitizedDraft = sanitizeAiSupportReplyText(result.reply)
  if (sanitizedDraft.changed) {
    result = {
      ...result,
      reply: sanitizedDraft.text,
      warnings: [
        ...(result.warnings || []),
        'Hệ thống đã tự thay tên sàn cụ thể thành "sàn" trước khi kiểm tra và gửi.'
      ]
    }
  }
  let guard = combineChatGuards(
    assessChatContent(result.reply, settings),
    assessAiPolicy(result.reply, settings)
  )
  if (!guard.allowed) {
    await recordChatPolicyViolation(env, {
      platform: context.platform,
      shop: context.shop,
      conversation_id: context.conversation?.conversation_id || body.conversation_id,
      source: 'ai-draft',
      provider: result.provider,
      content: result.reply,
      guard
    })
    return {
      context,
      payload: {
      status: 'ok',
      provider: result.provider,
      reply: '',
      blocked: true,
      guard,
      warnings: [...(result.warnings || []), ...(guard.warnings || []), 'Bản nháp AI bị chặn bởi luật chat nên chưa đưa vào ô trả lời.'],
      needs_review: 1
      }
    }
  }

  const autoSendAllowed = guard.allowed
    && !Number(settings.ai_require_review)
    && !Number(result.needs_review || 0)
    && !Number(guard.needs_review || 0)
  return {
    context,
    payload: {
    status: 'ok',
    provider: result.provider,
    reply: result.reply,
    guard,
    warnings: [...(result.warnings || []), ...(guard.warnings || [])],
    auto_send_allowed: autoSendAllowed ? 1 : 0,
    direct_knowledge: result.direct_knowledge || null,
    knowledge_used: (context.knowledge_context || []).map(item => ({
      id: item.id,
      category: item.category,
      question: item.question,
      match_score: item.match_score
    })),
    advisories_used: (context.marketplace_context?.product_advisories || []).map(item => ({
      id: item.id,
      title: item.title,
      trigger_type: item.trigger_type,
      trigger_value: item.trigger_value,
      related_item_id: item.related_item_id
    })),
    needs_review: result.provider === 'knowledge-template'
      ? 0
      : (Number(settings.ai_require_review) ? 1 : (Number(result.needs_review || 0) || Number(guard.needs_review || 0)))
    }
  }
}

async function createChatAiDraft(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const settings = await getChatSettings(env)
  if (!Number(settings.ai_enabled)) {
    return json({ error: 'AI CSKH đang tắt trong Thiết lập chat.' }, cors, 400)
  }

  const result = await buildChatAiDraftPayload(env, settings, body)
  return json(result.payload, cors, result.status || 200)
}

function chatAutoReplySourceMessageId(row = {}) {
  return cleanText(row.source_message_id || row.message_id) || `row:${Number(row.message_row_id || row.id || 0)}`
}

async function hasChatAiAutoReplyLog(env, row, mode) {
  const sourceMessageId = chatAutoReplySourceMessageId(row)
  const existing = await env.DB.prepare(`
    SELECT id, status
    FROM marketplace_chat_ai_auto_reply_logs
    WHERE lower(platform) = lower(?)
      AND shop = ?
      AND conversation_id = ?
      AND source_message_id = ?
      AND mode = ?
      AND status IN ('sent', 'handoff_sent', 'would_send', 'would_handoff', 'blocked', 'needs_review', 'skipped')
    ORDER BY id DESC
    LIMIT 1
  `).bind(
    cleanText(row.platform).toLowerCase(),
    cleanText(row.shop),
    cleanText(row.conversation_id),
    sourceMessageId,
    mode
  ).first().catch(() => null)
  return Boolean(existing)
}

Object.assign(globalThis, {
  requestGeminiChatDraft,
  buildChatAiDraftPayload,
  createChatAiDraft,
  chatAutoReplySourceMessageId,
  hasChatAiAutoReplyLog
})
