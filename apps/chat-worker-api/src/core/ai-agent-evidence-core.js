import { cleanText } from './message-normalize.js'

export const DEFAULT_CHAT_AI_AGENT_CONFIG = {
  mode: 'suggest_only',
  reply_identity: 'Nhân viên Shop Huy Vân, gọi khách là anh/chị, xưng em, trả lời ngắn gọn và không dùng emoji.',
  min_confidence: 'high',
  handoff_policy: 'Khi thiếu dữ liệu sản phẩm, đơn hàng, đổi trả, bảo hành hoặc khách phàn nàn thì chỉ soạn gợi ý và chuyển nhân viên duyệt.',
  evidence_required: true,
  raw_conversation_learning: false,
  auto_send_delay_seconds: 15,
  sources: {
    product_data: true,
    order_data: true,
    shop_policy: true,
    approved_replies: true,
    zalo_notes: true
  }
}

const SOURCE_LABELS = {
  product_data: 'Dữ liệu sản phẩm đã kiểm',
  order_data: 'Dữ liệu đơn hàng đã kiểm',
  shop_policy: 'Chính sách shop',
  approved_replies: 'Câu trả lời đã duyệt',
  zalo_notes: 'Ghi chú riêng cho Zalo'
}

const RISK_LABELS = {
  complaint_or_refund: 'Khách đang khiếu nại, hoàn trả hoặc cần xử lý nhạy cảm',
  context_builder_error: 'Chưa dựng được dữ liệu kiểm chứng cho hội thoại',
  missing_order_context: 'Chưa có dữ liệu đơn hàng đã kiểm',
  missing_product_context: 'Chưa có dữ liệu sản phẩm đã kiểm',
  no_order_match: 'Chưa khớp được đơn hàng với hội thoại',
  no_product_match: 'Chưa khớp được sản phẩm với hội thoại',
  missing_core_context: 'Chưa đủ dữ liệu đơn hoặc sản phẩm đã kiểm',
  off_platform_contact: 'Nội dung có liên hệ hoặc giao dịch ngoài nền tảng',
  unsafe_promise: 'Nội dung có cam kết cần nhân viên kiểm tra',
  core_context_warning: 'Dữ liệu kiểm chứng chưa đầy đủ',
  evidence_required: 'Cấu hình yêu cầu nhân viên xem căn cứ trước khi gửi'
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), min), max)
}

function normalizeChoice(value, choices = [], fallback = '') {
  const normalized = cleanText(value).toLowerCase()
  return choices.includes(normalized) ? normalized : fallback
}

function normalizeBool(value, fallback = true) {
  if (value === true || value === false) return value
  return fallback
}

function normalizeSearchText(value = '') {
  return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function uniqueCleanList(items = []) {
  return [...new Set(items.map(item => cleanText(item)).filter(Boolean))]
}

function friendlyRiskLabel(value = '') {
  const key = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_')
  return RISK_LABELS[key] || cleanText(value).replace(/[_-]+/g, ' ')
}

function latestCustomerText(messages = []) {
  const latest = [...messages].reverse().find(item => item?.sender_type === 'customer')
  return cleanText(latest?.text)
}

function hasOrderIntent(text = '', aiContext = {}) {
  const intent = cleanText(aiContext.simple_intent?.intent || aiContext.simple_intent)
  if (intent.includes('order')) return true
  return /(^|[^a-z0-9])(don|ma don|van chuyen|giao hang|ship|tracking|trang thai don|hoa don)([^a-z0-9]|$)/i.test(normalizeSearchText(text))
}

function hasProductIntent(text = '', aiContext = {}) {
  const intent = cleanText(aiContext.simple_intent?.intent || aiContext.simple_intent)
  if (intent.includes('product')) return true
  return /(^|[^a-z0-9])(san pham|sku|ma hang|con hang|gia|mau|size|kich thuoc|ton kho)([^a-z0-9]|$)/i.test(normalizeSearchText(text))
}

function sourceLabelsFromConfig(config = {}, channel = '') {
  const sources = config.sources || {}
  return Object.entries(SOURCE_LABELS)
    .filter(([key]) => sources[key] !== false)
    .filter(([key]) => key !== 'zalo_notes' || normalizeSearchText(channel) === 'zalo')
    .map(([, label]) => label)
}

export function normalizeChatAiAgentConfig(settings = {}) {
  const stored = settings.chat_ai_agent_config || {}
  const sourceSettings = stored.sources || {}
  return {
    ...DEFAULT_CHAT_AI_AGENT_CONFIG,
    ...stored,
    mode: normalizeChoice(stored.mode || settings.ai_mode, ['suggest_only', 'reviewed_auto_ready', 'auto_send_guarded'], DEFAULT_CHAT_AI_AGENT_CONFIG.mode),
    reply_identity: cleanText(stored.reply_identity || DEFAULT_CHAT_AI_AGENT_CONFIG.reply_identity),
    min_confidence: normalizeChoice(stored.min_confidence, ['high', 'very_high'], DEFAULT_CHAT_AI_AGENT_CONFIG.min_confidence),
    handoff_policy: cleanText(stored.handoff_policy || DEFAULT_CHAT_AI_AGENT_CONFIG.handoff_policy),
    evidence_required: normalizeBool(stored.evidence_required, true),
    raw_conversation_learning: false,
    auto_send_delay_seconds: clampNumber(stored.auto_send_delay_seconds, 10, 60, DEFAULT_CHAT_AI_AGENT_CONFIG.auto_send_delay_seconds),
    sources: {
      product_data: normalizeBool(sourceSettings.product_data, true),
      order_data: normalizeBool(sourceSettings.order_data, true),
      shop_policy: normalizeBool(sourceSettings.shop_policy, true),
      approved_replies: normalizeBool(sourceSettings.approved_replies, true),
      zalo_notes: normalizeBool(sourceSettings.zalo_notes, true)
    }
  }
}

export function buildAgentInstructionBlock(settings = {}, conversation = {}) {
  const config = normalizeChatAiAgentConfig(settings)
  const sourceLabels = sourceLabelsFromConfig(config, conversation?.channel)
  return [
    'Cấu hình AI CSKH đang dùng:',
    `- Chế độ: ${config.mode === 'auto_send_guarded' ? 'chỉ được tự gửi sau khi đủ căn cứ và có quyền gửi thật' : 'chỉ soạn gợi ý để nhân viên duyệt'}.`,
    `- Cách xưng hô: ${config.reply_identity}`,
    `- Độ chắc chắn tối thiểu: ${config.min_confidence === 'very_high' ? 'rất cao' : 'cao'}.`,
    `- Nguồn được phép dùng: ${sourceLabels.join(', ') || 'chưa bật nguồn kiểm chứng'}.`,
    `- Bắt buộc xem căn cứ trước khi dùng gợi ý: ${config.evidence_required ? 'có' : 'không'}.`,
    `- Khi không đủ dữ liệu: ${config.handoff_policy}`,
    '- Không tự học từ hội thoại thô khi nhân viên chưa duyệt.'
  ].filter(Boolean).join('\n')
}

export function buildAgentEvidence(input = {}) {
  const aiContext = input.aiContext || {}
  const conversation = input.conversation || {}
  const messages = input.messages || []
  const config = normalizeChatAiAgentConfig(input.settings || {})
  const channel = cleanText(conversation.channel || input.channel)
  const text = latestCustomerText(messages)
  const orderCount = aiContext.orders?.length || 0
  const productCount = aiContext.products?.length || 0
  const warnings = Array.isArray(aiContext.warnings) ? aiContext.warnings : []
  const contextRiskFlags = Array.isArray(aiContext.risk_flags) ? aiContext.risk_flags : []
  const sourceLabels = sourceLabelsFromConfig(config, channel)
  const missingContext = []
  const riskLabels = []
  const evidenceLines = []

  if (config.sources.order_data !== false) {
    evidenceLines.push(orderCount ? `${orderCount} đơn hàng đã khớp` : 'Chưa có đơn hàng đã khớp')
    if (hasOrderIntent(text, aiContext) && !orderCount) missingContext.push('Thiếu dữ liệu đơn hàng đã kiểm')
  }
  if (config.sources.product_data !== false) {
    evidenceLines.push(productCount ? `${productCount} sản phẩm đã khớp` : 'Chưa có sản phẩm đã khớp')
    if (hasProductIntent(text, aiContext) && !productCount) missingContext.push('Thiếu dữ liệu sản phẩm đã kiểm')
  }
  if (config.sources.shop_policy !== false) evidenceLines.push('Đã áp dụng chính sách shop')
  if (config.sources.approved_replies !== false) evidenceLines.push('Ưu tiên câu trả lời đã duyệt')
  if (normalizeSearchText(channel) === 'zalo' && config.sources.zalo_notes !== false) evidenceLines.push('Đã áp dụng ghi chú riêng cho Zalo')

  contextRiskFlags.forEach(flag => riskLabels.push(friendlyRiskLabel(flag)))
  if (warnings.length) riskLabels.push(RISK_LABELS.core_context_warning)
  if (missingContext.length) riskLabels.push(...missingContext)
  if (config.evidence_required) riskLabels.push(RISK_LABELS.evidence_required)

  const hardRisk = contextRiskFlags.length > 0 || warnings.length > 0 || missingContext.length > 0
  const handoffRequired = hardRisk || config.evidence_required === true || config.mode !== 'auto_send_guarded'
  const handoffReason = hardRisk
    ? uniqueCleanList([...missingContext, ...contextRiskFlags.map(friendlyRiskLabel), friendlyRiskLabel(warnings[0])]).slice(0, 2).join('; ')
    : config.evidence_required
      ? 'Cấu hình yêu cầu nhân viên đọc căn cứ trước khi gửi.'
      : config.mode !== 'auto_send_guarded'
        ? 'Chế độ hiện tại yêu cầu nhân viên duyệt trước khi gửi.'
        : ''

  return {
    agent_mode: config.mode,
    agent_min_confidence: config.min_confidence,
    agent_evidence_required: config.evidence_required,
    agent_raw_learning_disabled: config.raw_conversation_learning === false,
    agent_auto_send_delay_seconds: config.auto_send_delay_seconds,
    agent_source_labels: uniqueCleanList(sourceLabels),
    agent_evidence_lines: uniqueCleanList(evidenceLines),
    agent_missing_context: uniqueCleanList(missingContext),
    agent_risk_labels: uniqueCleanList(riskLabels).slice(0, 6),
    agent_handoff_required: handoffRequired,
    agent_handoff_reason: cleanText(handoffReason),
    agent_review_badge: handoffRequired ? 'Cần nhân viên duyệt' : 'Đủ căn cứ để soạn nháp'
  }
}

export function applyAgentEvidencePolicy(policy = {}, evidence = {}) {
  if (!evidence.agent_handoff_required) return policy
  return {
    ...policy,
    allowed_to_send: false,
    policy_status: policy.policy_status === 'blocked' ? 'blocked' : 'needs_review',
    context_review_required: true,
    agent_handoff_required: true,
    agent_handoff_reason: evidence.agent_handoff_reason
  }
}
