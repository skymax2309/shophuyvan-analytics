// NEO: Backend worker chat sàn - nhóm knowledge-replies. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function saveChatSettings(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const defaults = defaultChatSettings()
  const settings = {
    moderation_enabled: body.moderation_enabled === false || body.moderation_enabled === 0 ? 0 : 1,
    blocked_keywords: normalizeKeywordList(body.blocked_keywords ?? defaults.blocked_keywords),
    ai_enabled: body.ai_enabled === true || body.ai_enabled === 1 ? 1 : 0,
    ai_provider: cleanText(body.ai_provider || defaults.ai_provider).toLowerCase() || defaults.ai_provider,
    ai_model: cleanText(body.ai_model || defaults.ai_model) || defaults.ai_model,
    ai_tone: cleanText(body.ai_tone || defaults.ai_tone).slice(0, 500),
    ai_rules: mergeRequiredChatAiRules(cleanText(body.ai_rules || defaults.ai_rules).slice(0, 5000)),
    ai_guard_mode: ['strict', 'review', 'off'].includes(cleanText(body.ai_guard_mode || defaults.ai_guard_mode).toLowerCase())
      ? cleanText(body.ai_guard_mode || defaults.ai_guard_mode).toLowerCase()
      : defaults.ai_guard_mode,
    ai_forbidden_patterns: mergeRequiredChatAiForbiddenPatterns(body.ai_forbidden_patterns ?? defaults.ai_forbidden_patterns),
    ai_review_triggers: mergeRequiredChatAiReviewTriggers(body.ai_review_triggers ?? defaults.ai_review_triggers),
    ai_require_review: body.ai_require_review === false || body.ai_require_review === 0 ? 0 : 1,
    ai_auto_reply_mode: normalizeChatAutoReplyMode(body.ai_auto_reply_mode, defaults.ai_auto_reply_mode),
    ai_auto_reply_platforms: normalizeChatAutoReplyPlatforms(body.ai_auto_reply_platforms ?? defaults.ai_auto_reply_platforms),
    ai_auto_reply_shops: normalizeChatAutoReplyShops(body.ai_auto_reply_shops ?? defaults.ai_auto_reply_shops),
    ai_auto_reply_limit: Math.min(Math.max(Number(body.ai_auto_reply_limit || defaults.ai_auto_reply_limit) || defaults.ai_auto_reply_limit, 1), 10),
    ai_auto_reply_hold_seconds: Math.min(Math.max(Number(body.ai_auto_reply_hold_seconds || defaults.ai_auto_reply_hold_seconds) || defaults.ai_auto_reply_hold_seconds, 0), 600),
    ai_auto_reply_max_age_hours: Math.min(Math.max(Number(body.ai_auto_reply_max_age_hours || defaults.ai_auto_reply_max_age_hours) || defaults.ai_auto_reply_max_age_hours, 1), 168),
    ai_auto_reply_handoff_enabled: body.ai_auto_reply_handoff_enabled === false || body.ai_auto_reply_handoff_enabled === 0 ? 0 : 1,
    quick_replies: normalizeQuickReplies(body.quick_replies ?? defaults.quick_replies),
    notify_enabled: body.notify_enabled === false || body.notify_enabled === 0 ? 0 : 1,
    notify_preview_enabled: body.notify_preview_enabled === false || body.notify_preview_enabled === 0 ? 0 : 1,
    notify_sound_enabled: body.notify_sound_enabled === false || body.notify_sound_enabled === 0 ? 0 : 1,
    notify_poll_seconds: Math.min(Math.max(Number(body.notify_poll_seconds || defaults.notify_poll_seconds) || 8, 5), 60)
  }

  await env.DB.prepare(`
    INSERT INTO marketplace_chat_settings
      (id, moderation_enabled, blocked_keywords, ai_enabled, ai_provider, ai_model,
       ai_tone, ai_rules, ai_guard_mode, ai_forbidden_patterns, ai_review_triggers,
       ai_require_review, ai_auto_reply_mode, ai_auto_reply_platforms, ai_auto_reply_shops, ai_auto_reply_limit,
       ai_auto_reply_hold_seconds, ai_auto_reply_max_age_hours, ai_auto_reply_handoff_enabled, quick_replies, notify_enabled, notify_preview_enabled,
       notify_sound_enabled, notify_poll_seconds, updated_at, created_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(id) DO UPDATE SET
      moderation_enabled = excluded.moderation_enabled,
      blocked_keywords = excluded.blocked_keywords,
      ai_enabled = excluded.ai_enabled,
      ai_provider = excluded.ai_provider,
      ai_model = excluded.ai_model,
      ai_tone = excluded.ai_tone,
      ai_rules = excluded.ai_rules,
      ai_guard_mode = excluded.ai_guard_mode,
      ai_forbidden_patterns = excluded.ai_forbidden_patterns,
      ai_review_triggers = excluded.ai_review_triggers,
      ai_require_review = excluded.ai_require_review,
      ai_auto_reply_mode = excluded.ai_auto_reply_mode,
      ai_auto_reply_platforms = excluded.ai_auto_reply_platforms,
      ai_auto_reply_shops = excluded.ai_auto_reply_shops,
      ai_auto_reply_limit = excluded.ai_auto_reply_limit,
      ai_auto_reply_hold_seconds = excluded.ai_auto_reply_hold_seconds,
      ai_auto_reply_max_age_hours = excluded.ai_auto_reply_max_age_hours,
      ai_auto_reply_handoff_enabled = excluded.ai_auto_reply_handoff_enabled,
      quick_replies = excluded.quick_replies,
      notify_enabled = excluded.notify_enabled,
      notify_preview_enabled = excluded.notify_preview_enabled,
      notify_sound_enabled = excluded.notify_sound_enabled,
      notify_poll_seconds = excluded.notify_poll_seconds,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    settings.moderation_enabled,
    JSON.stringify(settings.blocked_keywords),
    settings.ai_enabled,
    settings.ai_provider,
    settings.ai_model,
    settings.ai_tone,
    settings.ai_rules,
    settings.ai_guard_mode,
    settings.ai_forbidden_patterns.join('\n'),
    settings.ai_review_triggers.join('\n'),
    settings.ai_require_review,
    settings.ai_auto_reply_mode,
    safeJsonStringify(settings.ai_auto_reply_platforms, '[]'),
    safeJsonStringify(settings.ai_auto_reply_shops, '[]'),
    settings.ai_auto_reply_limit,
    settings.ai_auto_reply_hold_seconds,
    settings.ai_auto_reply_max_age_hours,
    settings.ai_auto_reply_handoff_enabled,
    safeJsonStringify(settings.quick_replies, '[]'),
    settings.notify_enabled,
    settings.notify_preview_enabled,
    settings.notify_sound_enabled,
    settings.notify_poll_seconds
  ).run()

  return json({ status: 'ok', settings: await getChatSettings(env) }, cors)
}

function normalizeKnowledgeStatus(value, fallback = 'approved') {
  const status = cleanText(value || fallback).toLowerCase()
  return ['draft', 'approved', 'archived'].includes(status) ? status : fallback
}

function chatKnowledgeKeywords(...values) {
  const text = normalizeKeywordText(values.join(' '))
  const stopwords = new Set(['shop', 'khach', 'hang', 'minh', 'nhe', 'nha', 'cho', 'hoi', 'tra', 'loi', 'duoc', 'khong', 'dang', 'can'])
  return [...new Set(text.split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && !stopwords.has(item) && !/^\d{1,2}$/.test(item)))]
    .slice(0, 40)
}

function compactChatKnowledgeRow(row = {}, includeAnswer = true) {
  return {
    id: Number(row.id || 0),
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    category: cleanText(row.category),
    question: limitText(row.question, 700),
    answer: includeAnswer ? limitText(row.answer, 1400) : '',
    status: normalizeKnowledgeStatus(row.status, 'draft'),
    source_type: cleanText(row.source_type),
    source_message_id: cleanText(row.source_message_id),
    priority: Number(row.priority || 0),
    usage_count: Number(row.usage_count || 0),
    last_used_at: cleanText(row.last_used_at),
    expires_at: cleanText(row.expires_at),
    approved_by: cleanText(row.approved_by),
    updated_at: cleanText(row.updated_at || row.created_at),
    created_at: cleanText(row.created_at)
  }
}

function scoreChatKnowledgeRow(row, terms = [], normalizedQuestion = '', platform = '', shopAliases = []) {
  const question = normalizeKeywordText(row.question)
  const answer = normalizeKeywordText(row.answer)
  const category = normalizeKeywordText(row.category)
  const keywords = productArray(row.keywords).map(normalizeKeywordText).join(' ')
  const rowPlatform = cleanText(row.platform).toLowerCase()
  const rowShop = cleanText(row.shop)
  let score = Number(row.priority || 0) * 8
  if (!rowPlatform || rowPlatform === platform) score += 12
  if (!rowShop || shopAliases.includes(rowShop)) score += 18
  if (normalizedQuestion && question.includes(normalizedQuestion)) score += 120
  if (normalizedQuestion && normalizedQuestion.includes(question) && question.length >= 12) score += 90
  for (const term of terms) {
    if (!term) continue
    if (question.includes(term)) score += term.length >= 5 ? 12 : 5
    if (keywords.includes(term)) score += term.length >= 5 ? 10 : 4
    if (category.includes(term)) score += 6
    if (answer.includes(term)) score += term.length >= 5 ? 4 : 1
  }
  score += Math.min(Number(row.usage_count || 0), 20)
  return score
}

async function loadRelevantChatKnowledge(env, context = {}, limit = 5) {
  if (!(await tableExists(env, 'chat_knowledge'))) return []
  const platform = cleanText(context.platform).toLowerCase()
  const shop = cleanText(context.shop || context.conversation?.shop || context.conversation?.shop_id)
  const shopId = cleanText(context.conversation?.shop_id || shop)
  const aliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const shopAliases = aliases.length ? aliases : [shop, shopId].map(cleanText).filter(Boolean)
  const normalizedQuestion = normalizeKeywordText(context.customer_message || '')
  const historyTerms = (context.messages || [])
    .slice(-6)
    .map(msg => msg.sender_type !== 'shop' ? msg.content : '')
    .join(' ')
  const terms = chatKnowledgeKeywords(context.customer_message, historyTerms).slice(0, 24)
  const platformWhere = platform ? '(platform = ? OR platform = ? OR platform = \'\')' : '1 = 1'
  const shopWhere = shopAliases.length ? `(shop IN (${shopAliases.map(() => '?').join(',')}) OR shop = '')` : '1 = 1'
  const params = platform ? [platform, platform.toUpperCase(), ...shopAliases] : [...shopAliases]
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM chat_knowledge
    WHERE status = 'approved'
      AND ${platformWhere}
      AND ${shopWhere}
      AND (expires_at IS NULL OR expires_at = '' OR datetime(expires_at) > datetime('now', '+7 hours'))
    ORDER BY priority DESC, datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT 300
  `).bind(...params).all()
  const scored = (results || [])
    .map(row => ({
      row,
      score: scoreChatKnowledgeRow(row, terms, normalizedQuestion, platform, shopAliases)
    }))
    .filter(item => item.score > 0 || !terms.length)
    .sort((a, b) => b.score - a.score || Number(b.row.priority || 0) - Number(a.row.priority || 0))
    .slice(0, Math.min(Math.max(Number(limit) || 5, 1), 8))
  const rows = scored.map(item => ({
    ...compactChatKnowledgeRow(item.row, true),
    match_score: Number(item.score || 0)
  }))
  if (rows.length) {
    const ids = rows.map(row => row.id).filter(Boolean)
    const placeholders = ids.map(() => '?').join(',')
    env.DB.prepare(`
      UPDATE chat_knowledge
      SET usage_count = COALESCE(usage_count, 0) + 1,
          last_used_at = datetime('now', '+7 hours')
      WHERE id IN (${placeholders})
    `).bind(...ids).run().catch(() => null)
  }
  return rows
}

function pickDirectApprovedKnowledgeReply(context = {}) {
  const normalizedQuestion = normalizeKeywordText(context.customer_message || '')
  if (!normalizedQuestion || normalizedQuestion.length < 4) return null
  const items = Array.isArray(context.knowledge_context) ? context.knowledge_context : []
  for (const item of items) {
    const answer = cleanText(item.answer)
    const sampleQuestion = normalizeKeywordText(item.question)
    if (!answer || !sampleQuestion) continue
    const score = Number(item.match_score || 0)
    const sameQuestion = sampleQuestion === normalizedQuestion
    const containsSample = sampleQuestion.length >= 10 && normalizedQuestion.includes(sampleQuestion)
    const sampleContainsQuestion = normalizedQuestion.length >= 10 && sampleQuestion.includes(normalizedQuestion)
    // Mẫu đã duyệt chỉ được gửi thẳng khi câu hỏi khớp mạnh, tránh dùng nhầm mẫu gần giống.
    if (sameQuestion || containsSample || sampleContainsQuestion || score >= 120) {
      return {
        id: item.id,
        category: item.category,
        question: item.question,
        answer,
        match_score: score,
        direct_reason: sameQuestion ? 'exact_question' : 'strong_knowledge_match'
      }
    }
  }
  return null
}

async function listChatKnowledge(request, env, cors) {
  await ensureChatTables(env)
  const url = new URL(request.url)
  const status = normalizeKnowledgeStatus(url.searchParams.get('status') || 'approved', 'approved')
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shop = cleanText(url.searchParams.get('shop'))
  const query = normalizeKeywordText(url.searchParams.get('q') || '')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 40) || 40, 5), 120)
  const params = [status]
  const where = ['status = ?']
  if (platform) {
    where.push('(platform = ? OR platform = ? OR platform = \'\')')
    params.push(platform, platform.toUpperCase())
  }
  if (shop) {
    where.push('(shop = ? OR shop = \'\')')
    params.push(shop)
  }
  if (query) {
    where.push('(normalized_question LIKE ? OR keywords LIKE ? OR category LIKE ? OR answer LIKE ?)')
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
  }
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM chat_knowledge
    WHERE ${where.join(' AND ')}
    ORDER BY priority DESC, datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT ?
  `).bind(...params, limit).all()
  return json({
    status: 'ok',
    knowledge: (results || []).map(row => compactChatKnowledgeRow(row, true))
  }, cors)
}

Object.assign(globalThis, {
  saveChatSettings,
  normalizeKnowledgeStatus,
  chatKnowledgeKeywords,
  compactChatKnowledgeRow,
  scoreChatKnowledgeRow,
  loadRelevantChatKnowledge,
  pickDirectApprovedKnowledgeReply,
  listChatKnowledge
})
