import { cleanText, newChatId, nowIso } from './message-normalize.js'
import { getChatSettings, getConversationById, listMessagesByConversation, saveChatSettings } from './conversation-core.js'
import { canSendLive, resolveChatCapability } from './capability-core.js'
import { DEFAULT_AI_LEARNING_NOTES, DEFAULT_RESTRICTED_KEYWORDS, normalizeAiSettings, normalizeGeminiKeys, normalizeKeywordList } from './ai-settings-defaults.js'
import { incrementKnowledgeUseCount, listKnowledgeEntries, saveAiSuggestion } from './ai-knowledge-core.js'
import { buildAiReplyContext, formatAiReplyContext } from './ai-context-core.js'
import { applyAgentEvidencePolicy, buildAgentEvidence, buildAgentInstructionBlock, normalizeChatAiAgentConfig } from './ai-agent-evidence-core.js'

const GEMINI_TIMEOUT_MS = 10000

function normalizeKeyword(value = '') {
  return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function restrictedTerms(settings = {}) {
  return normalizeKeywordList([
    ...DEFAULT_RESTRICTED_KEYWORDS,
    ...(Array.isArray(settings.restricted_keywords)
      ? settings.restricted_keywords
      : cleanText(settings.restricted_keywords).split(/[\n,;]/))
  ])
}

function uniqueTerms(items = []) {
  return [...new Set(items.map(item => cleanText(item)).filter(Boolean))]
}

function phoneDigits(value = '') {
  return cleanText(value).replace(/\D/g, '')
}

function hasVietnamPhoneFormat(text = '') {
  const source = cleanText(text)
  const matches = source.match(/(?:\+?\s*84|0084|0)(?:[\s().-]*\d){8,10}/g) || []
  return matches.some(match => {
    const digits = phoneDigits(match)
    if (/^0[1-9]\d{8}$/.test(digits)) return true
    if (/^84[1-9]\d{8}$/.test(digits)) return true
    return /^0084[1-9]\d{8}$/.test(digits)
  })
}

function hasWebsiteFormat(text = '') {
  const source = cleanText(text).toLowerCase()
  if (/(?:https?:\/\/|www\.)[^\s<>()]+/i.test(source)) return true
  const domain = /(?:^|[^a-z0-9_@])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\s*\.\s*)+(?:com\.vn|com|vn|net|org|io|me|shop|store|online|site|xyz|info|biz|co|app|dev|cloud)(?:\s*\/\s*[^\s]*)?)(?=$|[^a-z0-9_-])/i
  return domain.test(source)
}

function restrictedPatternTerms(text = '') {
  const blocked = []
  if (hasVietnamPhoneFormat(text)) blocked.push('định dạng số điện thoại')
  if (hasWebsiteFormat(text)) blocked.push('định dạng website')
  return blocked
}

function isSocialChannel(settings = {}) {
  return ['zalo', 'facebook'].includes(cleanText(settings.channel || settings.channel_id).toLowerCase())
}

export function evaluateRestrictedKeywordPolicy(text = '', settings = {}) {
  if (isSocialChannel(settings)) {
    return {
      allowed: true,
      policy_status: 'allowed',
      blocked_terms: [],
      skipped: true,
      skip_reason: 'social_channel'
    }
  }
  const normalized = normalizeKeyword(text)
  const blocked = uniqueTerms([
    ...restrictedTerms(settings).filter(term => normalized.includes(normalizeKeyword(term))),
    ...restrictedPatternTerms(text)
  ])
  return {
    allowed: blocked.length === 0,
    policy_status: blocked.length ? 'blocked' : 'allowed',
    blocked_terms: blocked
  }
}

export function evaluateAiSuggestionPolicy(text = '', settings = {}) {
  const restricted = evaluateRestrictedKeywordPolicy(text, settings)
  const approvedForAutoSend = restricted.allowed && settings.allow_auto_send === true
  return {
    allowed_to_send: approvedForAutoSend,
    policy_status: restricted.allowed ? (approvedForAutoSend ? 'approved' : 'needs_review') : 'blocked',
    blocked_terms: restricted.blocked_terms,
    mode: settings.allow_auto_send === true ? 'auto_send_guarded' : 'suggest_only'
  }
}

function aiDeliveryMode(env = {}, input = {}) {
  return cleanText(input.ai_mode || input.mode || input.delivery_mode || env.CHAT_AI_MODE || 'suggest_only').toLowerCase()
}

function hasBlockingContextWarning(context = {}) {
  return (context.warnings || []).some(item => /không đọc được|lỗi|failed|error|timeout|thiếu/i.test(cleanText(item)))
}

export function applyAiDeliveryModePolicy(policy = {}, env = {}, input = {}, aiContext = {}) {
  const mode = aiDeliveryMode(env, input)
  if (mode === 'auto_simple') {
    const simple = aiContext.simple_intent || {}
    const contextReady = simple.simple === true &&
      !aiContext.risk_flags?.length &&
      !hasBlockingContextWarning(aiContext) &&
      ((simple.intent === 'order_status_simple' && aiContext.orders?.length > 0) ||
        (simple.intent === 'product_info_simple' && aiContext.products?.length > 0))
    if (contextReady) return { ...policy, mode: 'auto_simple', delivery_mode: mode, simple_intent: simple.intent }
    if (policy.policy_status === 'blocked') return { ...policy, mode: 'auto_simple', allowed_to_send: false, delivery_mode: mode, simple_intent: simple.intent || 'needs_review' }
    return {
      ...policy,
      mode: 'auto_simple',
      allowed_to_send: false,
      policy_status: 'needs_review',
      delivery_mode: mode,
      simple_intent: simple.intent || 'needs_review',
      context_review_required: true
    }
  }
  if (mode !== 'suggest_only' && mode !== 'dry_run' && mode !== 'draft_only') return policy
  if (policy.policy_status === 'blocked') return { ...policy, mode: 'suggest_only', allowed_to_send: false }
  return {
    ...policy,
    mode: 'suggest_only',
    allowed_to_send: false,
    policy_status: 'needs_review',
    delivery_mode: mode
  }
}

export async function evaluateOutboundMessagePolicy(env, text = '', settingsOverride = null) {
  const current = await getChatSettings(env)
  const settings = settingsOverride ? normalizeAiSettings(current, settingsOverride) : current
  const restricted = evaluateRestrictedKeywordPolicy(text, settings)
  if (restricted.allowed) return { ok: true, ...restricted }
  return {
    ok: false,
    status: 'blocked_by_restricted_keyword',
    error_code: 'restricted_keyword_blocked',
    error_message: `Tin nhắn có từ khóa hạn chế: ${restricted.blocked_terms.slice(0, 3).join(', ')}. Nội dung chưa được gửi.`,
    ...restricted
  }
}

export function aiStatusMessage(status = '') {
  const value = cleanText(status || 'unconfigured')
  if (value === 'active') return 'AI đang hoạt động tốt'
  if (value === 'error') return 'Tất cả key Gemini đang lỗi. Kiểm tra lại key trong Cài đặt.'
  if (value === 'fallback') return 'AI đang dùng câu trả lời mặc định.'
  return 'Chưa nhập API key Gemini. Vào Cài đặt để thêm key.'
}

async function saveAiStatus(env, aiStatus) {
  const status = cleanText(aiStatus || 'unconfigured')
  await saveChatSettings(env, { ai_status: status }).catch(() => null)
  return status
}

function statusFromGeminiResult(gemini = {}) {
  if (gemini.provider === 'gemini') return 'active'
  if (gemini.error_code === 'gemini_key_missing') return 'unconfigured'
  if (cleanText(gemini.error_code).includes('failed') || cleanText(gemini.error_code).includes('error')) return 'error'
  return 'fallback'
}

function envGeminiKeys(env = {}) {
  return normalizeGeminiKeys([
    env.GEMINI_API_KEYS,
    env.GEMINI_API_KEY,
    env.GOOGLE_GEMINI_API_KEY,
    env.GOOGLE_AI_API_KEY
  ].filter(Boolean).join('\n'))
}

function geminiKeys(env = {}, settings = {}) {
  return normalizeGeminiKeys([
    ...normalizeGeminiKeys(settings.gemini_api_keys),
    ...envGeminiKeys(env)
  ])
}

function keyOrder(keys = [], cursor = 0) {
  if (!keys.length) return []
  const start = Math.max(Number(cursor) || 0, 0) % keys.length
  return keys.map((_, offset) => {
    const index = (start + offset) % keys.length
    return { key: keys[index], index }
  })
}

async function latestCustomerPrompt(env, messages = [], settings = {}, conversation = {}, aiContext = {}) {
  const transcript = messages.slice(-12).map(item => {
    const speaker = item.sender_type === 'customer' ? 'Khách' : item.sender_type === 'shop' ? 'Shop' : 'Hệ thống'
    return `${speaker}: ${cleanText(item.text)}`
  }).filter(line => !line.endsWith(':')).join('\n')
  const knowledge = cleanText(settings.ai_learning_notes || settings.knowledge_notes || DEFAULT_AI_LEARNING_NOTES)
  const agentConfig = normalizeChatAiAgentConfig(settings)
  const examples = agentConfig.sources.approved_replies === false
    ? []
    : await listKnowledgeEntries(env, {
      channel: conversation?.channel,
      shop_id: conversation?.shop_id,
      limit: 5
    }).catch(() => [])
  for (const entry of examples) {
    await incrementKnowledgeUseCount(env, entry.id).catch(() => null)
  }
  const exampleText = examples.map(item => [
    `Khách: ${cleanText(item.question)}`,
    `Shop: ${cleanText(item.answer)}`,
    '---'
  ].join('\n')).join('\n')
  return [
    'Bạn là trợ lý CSKH cho Shop Huy Vân. Viết câu trả lời tiếng Việt có dấu, ngắn gọn, lịch sự, không dùng emoji nếu không được yêu cầu.',
    'Luôn tuân thủ chính sách Shopee, Lazada, TikTok Shop: không kéo khách ra ngoài sàn, không xin/gửi số điện thoại, Zalo, Facebook, web, QR, tài khoản ngân hàng, không chửi thề, không spam, không hứa chính sách ngoài sàn.',
    knowledge ? `Kiến thức và luật AI phải học:\n${knowledge}` : '',
    exampleText ? `Ví dụ câu trả lời tốt trước đây:\n${exampleText}` : '',
    buildAgentInstructionBlock(settings, conversation),
    'Không ghi các dòng Nguồn, Căn cứ, Rủi ro hoặc giải thích nội bộ trong nội dung trả lời khách; hệ thống sẽ hiển thị phần đó riêng cho nhân viên.',
    formatAiReplyContext(aiContext),
    `Hội thoại gần nhất:\n${transcript || 'Chưa có tin khách.'}`,
    'Chỉ trả về nội dung tin nhắn đề xuất. Nếu thiếu dữ liệu đơn/sản phẩm thì xin mã đơn hoặc nói shop sẽ kiểm tra, không tự bịa.'
  ].filter(Boolean).join('\n\n')
}

async function callGemini(key, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('gemini_timeout'), GEMINI_TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 320 }
      })
    })
  } finally {
    clearTimeout(timeout)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = cleanText(data?.error?.message || data?.message || `Gemini HTTP ${res.status}`)
    const error = new Error(message)
    error.status = res.status
    error.code = cleanText(data?.error?.status || data?.error?.code || 'gemini_request_failed')
    throw error
  }
  return cleanText(data.candidates?.[0]?.content?.parts?.map(part => part.text).join('\n'))
}

function cleanSuggestedReply(text = '') {
  const lines = cleanText(text).split(/\n+/).map(line => cleanText(line)).filter(Boolean)
  const filtered = lines.filter(line => !/^(nguon|nguồn|can cu|căn cứ|du lieu|dữ liệu|rui ro|rủi ro|evidence|source|risk)\s*[:：-]/i.test(line))
  return filtered.join('\n').trim()
}

function fallbackSuggestedReply(latestCustomer = {}) {
  return cleanText(latestCustomer?.text)
    ? `Dạ shop đã nhận thông tin: "${cleanText(latestCustomer.text)}". Shop sẽ kiểm tra dữ liệu đơn/sản phẩm liên quan rồi phản hồi mình ạ.`
    : 'Dạ shop hỗ trợ mình. Mình gửi giúp shop mã đơn hoặc sản phẩm cần kiểm tra để shop phản hồi chính xác hơn ạ.'
}

async function suggestWithGemini(env, messages = [], settings = {}, conversation = {}, aiContext = {}) {
  if (settings.ai_provider !== 'gemini') return { text: '', provider: 'fallback', key_count: geminiKeys(env, settings).length }
  const keys = geminiKeys(env, settings)
  if (!keys.length) return { text: '', provider: 'fallback', key_count: 0, error_code: 'gemini_key_missing' }
  const model = cleanText(settings.ai_model || env.GEMINI_MODEL || 'gemini-2.5-flash')
  const prompt = await latestCustomerPrompt(env, messages, settings, conversation, aiContext)
  let lastError = null
  for (const candidate of keyOrder(keys, settings.gemini_key_cursor)) {
    try {
      const text = await callGemini(candidate.key, model, prompt)
      await saveChatSettings(env, { gemini_key_cursor: candidate.index + 1 }).catch(() => null)
      return { text, provider: 'gemini', key_count: keys.length, key_index: candidate.index }
    } catch (error) {
      lastError = error
    }
  }
  return {
    text: '',
    provider: 'fallback',
    key_count: keys.length,
    error_code: lastError?.code || 'gemini_all_keys_failed',
    error_message: lastError?.message || 'Tất cả API Gemini đều lỗi.'
  }
}

export async function testGeminiConnection(env, settingsInput = {}) {
  const current = await getChatSettings(env)
  const settings = normalizeAiSettings(current, settingsInput)
  const keys = geminiKeys(env, settings)
  if (!keys.length) {
    await saveAiStatus(env, 'unconfigured')
    return {
      ok: false,
      provider: 'gemini',
      key_count: 0,
      error_code: 'gemini_key_missing',
      error_message: 'Chưa lưu API key Gemini. Nhập 1-5 key, mỗi dòng một key.'
    }
  }
  const model = cleanText(settings.ai_model || env.GEMINI_MODEL || 'gemini-2.5-flash')
  let lastError = null
  for (const candidate of keyOrder(keys, settings.gemini_key_cursor)) {
    try {
      await callGemini(candidate.key, model, 'Trả lời đúng một chữ: OK')
      await saveChatSettings(env, {
        gemini_key_cursor: candidate.index + 1,
        ai_provider: 'gemini',
        ai_status: 'active'
      }).catch(() => null)
      return {
        ok: true,
        provider: 'gemini',
        model,
        key_count: keys.length,
        active_key_position: candidate.index + 1
      }
    } catch (error) {
      lastError = error
    }
  }
  await saveAiStatus(env, 'error')
  return {
    ok: false,
    provider: 'gemini',
    model,
    key_count: keys.length,
    error_code: lastError?.code || 'gemini_all_keys_failed',
    error_message: lastError?.message || 'Tất cả API Gemini đều lỗi.'
  }
}

export async function getAiStatus(env) {
  const settings = await getChatSettings(env)
  const keyCount = geminiKeys(env, settings).length
  const status = cleanText(settings.ai_status || (keyCount ? 'fallback' : 'unconfigured'))
  return {
    ok: true,
    ai_status: status,
    ai_status_message: aiStatusMessage(status),
    ai_provider: cleanText(settings.ai_provider || 'gemini'),
    ai_model: cleanText(settings.ai_model || 'gemini-2.5-flash'),
    gemini_key_count: keyCount,
    last_suggestion_at: cleanText(settings.last_suggestion_at)
  }
}

export async function suggestChatReply(env, input = {}) {
  const conversationId = cleanText(input.conversation_id)
  const settings = await getChatSettings(env)
  const conversation = conversationId ? await getConversationById(env, conversationId) : null
  const capability = resolveChatCapability(env, conversation || input)
  const messages = conversationId ? await listMessagesByConversation(env, conversationId, { limit: 20 }) : []
  const latestCustomer = [...messages].reverse().find(item => item.sender_type === 'customer')
  const aiContext = await buildAiReplyContext(env, {
    conversation: conversation || input,
    messages,
    input
  }).catch(error => ({
    source: 'chat_core_plus_worker_core',
    orders: [],
    products: [],
    order_codes: [],
    product_queries: [],
    warnings: [cleanText(error?.message || error || 'Không dựng được ngữ cảnh Core cho AI.')],
    risk_flags: ['context_builder_error']
  }))
  const agentEvidence = buildAgentEvidence({
    settings,
    aiContext,
    conversation: conversation || input,
    messages,
    channel: conversation?.channel || input.channel
  })
  const gemini = await suggestWithGemini(env, messages, settings, conversation || input, aiContext).catch(error => ({
    text: '',
    provider: 'fallback',
    error_code: error?.code || 'gemini_exception',
    error_message: error?.message || String(error)
  }))
  const aiStatus = await saveAiStatus(env, statusFromGeminiResult(gemini))
  const rawBase = gemini.text || (latestCustomer?.text
    ? `Dạ shop đã nhận thông tin: "${latestCustomer.text}". Shop sẽ kiểm tra dữ liệu đơn/sản phẩm liên quan rồi phản hồi mình ạ.`
    : 'Dạ shop hỗ trợ mình. Mình gửi giúp shop mã đơn hoặc sản phẩm cần kiểm tra để shop phản hồi chính xác hơn ạ.')
  const base = cleanSuggestedReply(rawBase) || fallbackSuggestedReply(latestCustomer)
  const basePolicy = applyAiDeliveryModePolicy(evaluateAiSuggestionPolicy(base, {
    ...settings,
    channel: conversation?.channel || input.channel
  }), env, { ...input, ai_mode: agentEvidence.agent_mode || settings.ai_mode }, aiContext)
  const contextPolicy = aiContext.risk_flags?.length
    ? {
      ...basePolicy,
      allowed_to_send: false,
      policy_status: basePolicy.policy_status === 'blocked' ? 'blocked' : 'needs_review',
      context_review_required: true,
      context_risk_flags: aiContext.risk_flags
    }
    : basePolicy
  const policy = applyAgentEvidencePolicy(contextPolicy, agentEvidence)
  const canSendByCapability = canSendLive(capability)
  const suggestion = await saveAiSuggestion(env, {
    id: newChatId('ai'),
    conversation_id: conversationId,
    message_id: cleanText(latestCustomer?.id),
    suggested_text: base,
    prompt_context: {
      mode: policy.mode,
      source: gemini.provider === 'gemini' ? 'gemini_generate_content' : 'chat_core_fallback',
      message_count: messages.length,
      product_master_required: true,
      order_context_required: true,
      shop_chat_mode: capability.shop_chat_mode,
      send_capability: capability.send_capability,
      sync_capability: capability.sync_capability,
      blocked_terms: policy.blocked_terms,
      delivery_mode: policy.delivery_mode || policy.mode,
      simple_intent: aiContext.simple_intent || {},
      gemini_key_count: gemini.key_count || 0,
      core_context_source: aiContext.source,
      order_context_count: aiContext.orders?.length || 0,
      product_context_count: aiContext.products?.length || 0,
      order_codes: aiContext.order_codes || [],
      product_queries: aiContext.product_queries || [],
      core_context_warnings: aiContext.warnings || [],
      context_risk_flags: aiContext.risk_flags || [],
      ...agentEvidence
    },
    policy_status: policy.policy_status,
    final_state: 'draft',
    created_at: nowIso(),
    updated_at: nowIso()
  })
  await saveChatSettings(env, { last_suggestion_at: nowIso() }).catch(() => null)
  const autoSend = policy.policy_status === 'approved' && policy.allowed_to_send && canSendByCapability
  const autoSendReason = autoSend
    ? 'Đủ điều kiện. Chỉ gửi sau khi giao diện hiển thị đếm ngược và nhân viên không hủy.'
    : policy.policy_status === 'blocked'
      ? 'AI đã chặn nội dung, cần nhân viên xử lý.'
      : policy.agent_handoff_reason || policy.context_review_required
        ? 'Cần nhân viên duyệt căn cứ trước khi gửi.'
        : !canSendByCapability
          ? 'Hội thoại chưa có quyền gửi thật từ hệ thống.'
          : 'Chưa đủ điều kiện tự gửi.'
  return {
    ok: true,
    suggestion,
    ai_status: aiStatus,
    ai_status_message: aiStatusMessage(aiStatus),
    policy: {
      ...policy,
      auto_send_allowed_by_capability: canSendByCapability
    },
    capability,
    provider: gemini.provider || 'fallback',
    gemini: {
      key_count: gemini.key_count || 0,
      error_code: gemini.error_code || '',
      error_message: gemini.error_message || ''
    },
    core_context: {
      source: aiContext.source,
      order_count: aiContext.orders?.length || 0,
      product_count: aiContext.products?.length || 0,
      warnings: aiContext.warnings || [],
      risk_flags: aiContext.risk_flags || [],
      simple_intent: aiContext.simple_intent || {}
    },
    agent_evidence: agentEvidence,
    auto_send_readiness: {
      eligible: autoSend,
      suggestion_id: suggestion.id,
      delay_seconds: Math.min(Math.max(Number(agentEvidence.agent_auto_send_delay_seconds || 15) || 15, 10), 60),
      requires_visible_countdown: true,
      cancel_on_customer_message: true,
      reason: autoSendReason
    },
    auto_send: autoSend
  }
}
