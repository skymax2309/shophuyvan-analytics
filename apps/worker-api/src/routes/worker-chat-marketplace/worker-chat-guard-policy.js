// NEO: Backend worker chat sàn - nhóm guard-policy. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function saveProductAdvisory(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id || 0)
  const status = normalizeProductAdvisoryStatus(body.status || (body.archive ? 'archived' : 'active'), 'active')
  const platform = cleanText(body.platform).toLowerCase()
  const shop = cleanText(body.shop)
  const shopId = cleanText(body.shop_id || body.shopId)
  const triggerType = normalizeProductAdvisoryTrigger(body.trigger_type || body.triggerType)
  const triggerValue = cleanText(body.trigger_value || body.triggerValue).slice(0, 240)
  const title = cleanText(body.title).slice(0, 160)
  const message = cleanText(body.message).slice(0, 1800)
  const relatedItemId = cleanText(body.related_item_id || body.relatedItemId || body.item_id).slice(0, 80)
  const relatedProductName = cleanText(body.related_product_name || body.relatedProductName).slice(0, 220)
  const relatedProductUrl = cleanText(body.related_product_url || body.relatedProductUrl || body.product_url).slice(0, 700)
  const severity = normalizeProductAdvisorySeverity(body.severity || 'required')
  const priority = Math.min(Math.max(Number(body.priority ?? 50) || 50, 0), 100)
  const approvedBy = cleanText(body.approved_by || 'Admin').slice(0, 120)
  const triggerKeywords = normalizeKeywordList(body.trigger_keywords || body.triggerKeywords || [triggerValue, title, relatedProductName])
  if (status !== 'archived' && (!triggerValue || !message)) {
    return json({ error: 'Cần nhập điều kiện khớp sản phẩm và nội dung lưu ý.' }, cors, 400)
  }
  if (id) {
    await env.DB.prepare(`
      UPDATE chat_product_advisories
      SET platform = ?, shop = ?, shop_id = ?, trigger_type = ?, trigger_value = ?,
          trigger_keywords = ?, title = ?, message = ?, related_item_id = ?,
          related_product_name = ?, related_product_url = ?, severity = ?, status = ?,
          priority = ?, approved_by = ?, updated_at = datetime('now', '+7 hours')
      WHERE id = ?
    `).bind(
      platform, shop, shopId, triggerType, triggerValue,
      safeJsonStringify(triggerKeywords, '[]'), title, message, relatedItemId,
      relatedProductName, relatedProductUrl, severity, status, priority, approvedBy, id
    ).run()
  } else {
    await env.DB.prepare(`
      INSERT INTO chat_product_advisories
        (platform, shop, shop_id, trigger_type, trigger_value, trigger_keywords,
         title, message, related_item_id, related_product_name, related_product_url,
         severity, status, priority, approved_by, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    `).bind(
      platform, shop, shopId, triggerType, triggerValue,
      safeJsonStringify(triggerKeywords, '[]'), title, message, relatedItemId,
      relatedProductName, relatedProductUrl, severity, status, priority, approvedBy
    ).run()
  }
  const saved = id
    ? await env.DB.prepare('SELECT * FROM chat_product_advisories WHERE id = ? LIMIT 1').bind(id).first()
    : await env.DB.prepare('SELECT * FROM chat_product_advisories ORDER BY id DESC LIMIT 1').first()
  return json({ status: 'ok', advisory: compactProductAdvisoryRow(saved) }, cors)
}

function stripAllowedMarketplaceProductLinks(content) {
  return cleanText(content)
    .replace(/https?:\/\/(?:[^/\s]+\.)?shopee\.(?:vn|co\.[a-z]{2}|com(?:\.[a-z]{2})?)\/product\/[0-9A-Za-z_-]+\/[0-9A-Za-z_-]+[^\s<>"']*/gi, ' ')
    .replace(/https?:\/\/(?:[^/\s]+\.)?shopee\.(?:vn|co\.[a-z]{2}|com(?:\.[a-z]{2})?)\/[^\s<>"']*-i\.[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+[^\s<>"']*/gi, ' ')
    .replace(/https?:\/\/(?:www\.)?lazada\.(?:vn|co\.[a-z]{2}|com(?:\.[a-z]{2})?)\/products\/[^\s<>"']+/gi, ' ')
    .replace(/https?:\/\/(?:www\.)?tiktok\.com\/(?:@[^/\s]+\/)?(?:shop|product)\/[^\s<>"']+/gi, ' ')
}

function stripAllowedMarketplaceOperationalCodes(content) {
  // Mã vận đơn có nhiều số dễ bị regex số điện thoại bắt nhầm, nên chỉ loại các mã có tiền tố vận chuyển rõ ràng.
  return cleanText(content)
    .replace(/\b(?:SPXVN|SPX|LMP|LEX|BEST|JNT|JT|GHTK|GHN|NJVN|SPEVN)[\s:_-]*[A-Z0-9-]{6,}\b/gi, ' ')
}

function assessChatContent(content, settings) {
  const text = cleanText(content)
  if (!text) {
    return {
      allowed: false,
      blocked: true,
      reason: 'Nội dung trống, chưa thể gửi.',
      matched_keywords: [],
      warnings: []
    }
  }
  if (!Number(settings?.moderation_enabled)) {
    return {
      allowed: true,
      blocked: false,
      reason: 'Bộ lọc từ khóa đang tắt.',
      matched_keywords: [],
      warnings: []
    }
  }

  const haystack = normalizeKeywordText(stripAllowedMarketplaceProductLinks(text))
  const matched = []
  for (const keyword of normalizeKeywordList(settings.blocked_keywords || [])) {
    const needle = normalizeKeywordText(keyword)
    if (needle && haystack.includes(needle)) matched.push(keyword)
  }

  if (matched.length) {
    return {
      allowed: false,
      blocked: true,
      reason: `Nội dung có từ khóa bị chặn: ${matched.join(', ')}`,
      matched_keywords: matched,
      warnings: [
        'Tin nhắn chưa được gửi. Hãy sửa nội dung hoặc bỏ từ khóa khỏi danh sách chặn nếu bạn chắc chắn được phép dùng.'
      ]
    }
  }

  return {
    allowed: true,
    blocked: false,
    reason: 'Nội dung qua kiểm duyệt từ khóa.',
    matched_keywords: [],
    warnings: []
  }
}

function keywordViolation(label, detail, action = 'block') {
  return { code: label, label, detail, action, risk_level: 'high', source: 'chat_route_guard' }
}

function patternMatchesText(text, pattern) {
  const raw = cleanText(pattern)
  if (!raw) return false
  const regexBody = raw.startsWith('regex:') ? raw.slice(6) : ''
  const slashMatch = raw.match(/^\/(.+)\/([dgimsuvy]*)$/)
  if (regexBody || slashMatch) {
    try {
      const source = regexBody || slashMatch[1]
      const flags = slashMatch?.[2] || 'iu'
      return new RegExp(source, flags.includes('i') ? flags : `${flags}i`).test(text)
    } catch {
      return false
    }
  }
  const haystack = normalizeKeywordText(text)
  const needle = normalizeKeywordText(raw)
  if (!needle) return false
  // Luật ngắn như "huỷ" không được khớp dính vào từ khác như "chuyển".
  return ` ${haystack} `.includes(` ${needle} `)
}

function assessAiPolicy(content, settings) {
  const text = cleanText(content)
  const guardMode = cleanText(settings?.ai_guard_mode || 'strict').toLowerCase()
  if (!text || guardMode === 'off') {
    return {
      allowed: true,
      blocked: false,
      reason: guardMode === 'off' ? 'Guard AI nâng cao đang tắt.' : '',
      violations: [],
      warnings: [],
      needs_review: 0
    }
  }

  const violations = []
  const warnings = []
  const sanitizedPolicyText = sanitizeAiSupportReplyText(text)
  const policyText = stripAllowedMarketplaceOperationalCodes(stripAllowedMarketplaceProductLinks(sanitizedPolicyText.text))
  const normalized = normalizeKeywordText(policyText)
  const corePolicy = evaluateAiSupportPolicyReply(policyText, {
    customForbiddenPatterns: mergeRequiredChatAiForbiddenPatterns(settings?.ai_forbidden_patterns || []),
    customReviewTriggers: normalizeRuleLineList(settings?.ai_review_triggers || [])
  })
  violations.push(...(corePolicy.violations || []))
  warnings.push(...(corePolicy.warnings || []))

  if (/(?:\+?84|0)(?:[\s.-]*\d){8,10}/i.test(policyText)) {
    violations.push(keywordViolation('phone_number', 'AI có dấu hiệu đưa số điện thoại vào câu trả lời.'))
  }

  const urlMatches = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []
  const allowedUrlFragments = [
    'shopee.vn',
    'shopee.co',
    'lazada.vn',
    'lazada.co',
    'tiktok.com',
    'tiktokshop'
  ]
  const outsideUrls = urlMatches.filter(url => {
    const lower = url.toLowerCase()
    return !allowedUrlFragments.some(fragment => lower.includes(fragment))
  })
  if (outsideUrls.length) {
    violations.push(keywordViolation('external_link', `AI có dấu hiệu đưa link ngoài: ${outsideUrls.slice(0, 3).join(', ')}`))
  }

  const hardTerms = [
    ['outside_payment', ['chuyen khoan', 'stk', 'so tai khoan', 'ngan hang', 'momo', 'thanh toan ngoai']],
    ['outside_channel', ['zalo', 'facebook', 'messenger', 'telegram', 'whatsapp']],
    ['outside_order', ['dat ngoai san', 'mua ngoai san', 'gui rieng shop', 'qua website']]
  ]
  for (const [label, terms] of hardTerms) {
    const term = terms.find(item => normalized.includes(item))
    if (term) violations.push(keywordViolation(label, `AI có dấu hiệu vi phạm chính sách sàn: ${term}.`))
  }

  for (const pattern of mergeRequiredChatAiForbiddenPatterns(settings?.ai_forbidden_patterns || [])) {
    if (patternMatchesText(policyText, pattern)) {
      violations.push(keywordViolation('custom_forbidden_pattern', `Khớp luật chặn cứng: ${pattern}`))
    }
  }

  for (const trigger of normalizeRuleLineList(settings?.ai_review_triggers || [])) {
    if (patternMatchesText(policyText, trigger)) {
      warnings.push(`Cần duyệt lại vì có nội dung nhạy cảm: ${trigger}`)
    }
  }

  const uniqueViolations = []
  const seenViolationKeys = new Set()
  for (const violation of violations) {
    const key = `${violation.code || violation.label || ''}|${violation.detail || violation}`
    if (seenViolationKeys.has(key)) continue
    seenViolationKeys.add(key)
    uniqueViolations.push(violation)
  }
  const uniqueWarnings = [...new Set(warnings)]
  const needsReview = uniqueWarnings.length || uniqueViolations.length ? 1 : 0
  const blocked = guardMode === 'strict' && uniqueViolations.length > 0
  return {
    allowed: !blocked,
    blocked,
    reason: blocked
      ? uniqueViolations.map(item => item.detail).join(' ')
      : (needsReview ? 'Nội dung qua chặn cứng nhưng cần nhân viên duyệt lại.' : 'Nội dung qua guard AI nâng cao.'),
    violations: uniqueViolations,
    warnings: uniqueWarnings,
    needs_review: needsReview
  }
}

function combineChatGuards(keywordGuard, aiGuard) {
  const blocked = !keywordGuard.allowed || !aiGuard.allowed
  return {
    allowed: !blocked,
    blocked,
    reason: blocked
      ? [keywordGuard.allowed ? '' : keywordGuard.reason, aiGuard.allowed ? '' : aiGuard.reason].filter(Boolean).join(' ')
      : (aiGuard.needs_review ? aiGuard.reason : keywordGuard.reason),
    matched_keywords: keywordGuard.matched_keywords || [],
    policy_violations: aiGuard.violations || [],
    warnings: [
      ...(keywordGuard.warnings || []),
      ...(aiGuard.warnings || [])
    ],
    needs_review: Number(aiGuard.needs_review || 0)
  }
}

function chatAiAutoLocked(conversation = {}) {
  return Boolean(cleanText(conversation.ai_auto_locked_at))
}

async function lockChatAiAutoForConversation(env, input = {}) {
  const platform = cleanText(input.platform).toLowerCase()
  const shop = cleanText(input.shop)
  const conversationId = cleanText(input.conversation_id)
  if (!platform || !conversationId) return
  const reason = cleanText(input.reason || 'AI bị chặn bởi rule chính sách sàn.').slice(0, 1000)
  // Khóa tự động theo hội thoại ngay khi có vi phạm, để AI không tự thử lại nhiều lần và tăng rủi ro vi phạm sàn.
  await env.DB.prepare(`
    UPDATE marketplace_chat_conversations
    SET ai_auto_locked_at = COALESCE(NULLIF(ai_auto_locked_at, ''), datetime('now', '+7 hours')),
        ai_auto_lock_reason = ?
    WHERE platform = ?
      AND conversation_id = ?
      AND (? = '' OR shop = ? OR shop_id = ?)
  `).bind(reason, platform, conversationId, shop, shop, shop).run()
}

async function recordChatPolicyViolation(env, input = {}) {
  const guard = input.guard || {}
  const violations = guard.policy_violations || guard.violations || []
  if (!violations.length) return
  await ensureChatTables(env)
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_rule_violations
      (platform, shop, conversation_id, source, provider, content, violations, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
  `).bind(
    cleanText(input.platform),
    cleanText(input.shop),
    cleanText(input.conversation_id),
    cleanText(input.source || 'ai-draft'),
    cleanText(input.provider),
    cleanText(input.content).slice(0, 4000),
    JSON.stringify(violations).slice(0, 4000)
  ).run()
  await lockChatAiAutoForConversation(env, {
    platform: input.platform,
    shop: input.shop,
    conversation_id: input.conversation_id,
    reason: violations.map(item => item.detail || item.label || item.code || item).join(' ').slice(0, 1000)
  }).catch(() => null)
}

async function guardChatReply(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const settings = await getChatSettings(env)
  const content = body.content || body.message || ''
  const sanitized = sanitizeAiSupportReplyText(content)
  const result = combineChatGuards(
    assessChatContent(sanitized.text, settings),
    assessAiPolicy(sanitized.text, settings)
  )
  if (!result.allowed) {
    await recordChatPolicyViolation(env, {
      platform: body.platform,
      shop: body.shop,
      conversation_id: body.conversation_id,
      source: 'guard-preflight',
      provider: cleanText(body.provider || 'preflight'),
      content: sanitized.text,
      guard: result
    })
  }
  return json({
    status: 'ok',
    ...result,
    sanitized_content: sanitized.text,
    sanitized_changed: sanitized.changed,
    moderation_enabled: Number(settings.moderation_enabled),
    keyword_count: settings.blocked_keywords.length
  }, cors)
}

function makeLocalChatDraft(context) {
  const forcedReply = detectShopContactPolicyReply(context.customer_message || context.current_message)
  if (forcedReply) return forcedReply
  const lastCustomer = [...(context.messages || [])].reverse().find(msg => msg.sender_type !== 'shop')
  const customerText = cleanText(context.customer_message || lastCustomer?.content)
  const productHint = cleanText(context.product_context)
  if (customerText || productHint) {
    return [
      'Dạ shop đã nhận được tin nhắn của mình.',
      productHint ? `Về sản phẩm ${productHint}, shop sẽ kiểm tra đúng thông tin tồn kho/giá trước khi xác nhận.` : 'Shop sẽ kiểm tra đúng thông tin sản phẩm và đơn hàng trước khi xác nhận.',
      'Mình cho shop xin thêm chi tiết cần hỗ trợ để shop tư vấn chính xác hơn nhé.'
    ].join(' ')
  }
  return 'Dạ shop đã nhận được tin nhắn của mình. Shop sẽ kiểm tra thông tin và phản hồi lại ngay ạ.'
}

function hasNormalizedTerm(text, terms = []) {
  return terms.some(term => text.includes(term))
}

Object.assign(globalThis, {
  saveProductAdvisory,
  stripAllowedMarketplaceProductLinks,
  assessChatContent,
  assessAiPolicy,
  combineChatGuards,
  chatAiAutoLocked,
  lockChatAiAutoForConversation,
  recordChatPolicyViolation,
  guardChatReply,
  makeLocalChatDraft,
  hasNormalizedTerm
})
