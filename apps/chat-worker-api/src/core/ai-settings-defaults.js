import { DEFAULT_CHAT_AI_AGENT_CONFIG, normalizeChatAiAgentConfig } from './ai-agent-evidence-core.js'

export const DEFAULT_RESTRICTED_KEYWORDS = [
  'shopee',
  'lazada',
  'tiktok',
  'zalo',
  'facebook',
  'web',
  'website',
  'sdt',
  'số điện thoại',
  'điện thoại',
  'hotline',
  'zalo.me',
  'messenger',
  'inbox facebook',
  'chuyển khoản',
  'stk',
  'tài khoản ngân hàng',
  'mua ngoài sàn',
  'giao dịch ngoài sàn',
  'đặt ngoài sàn',
  'link ngoài',
  'địt',
  'đụ',
  'đm',
  'dm',
  'vcl',
  'vl',
  'lồn',
  'cặc',
  'đéo',
  'mẹ mày',
  'con mẹ',
  'fuck',
  'shit'
]

export const DEFAULT_RESTRICTED_PATTERNS = [
  'định dạng số điện thoại',
  'định dạng website'
]

export const DEFAULT_AI_LEARNING_NOTES = [
  'Luật chung cho AI CSKH Shop Huy Vân:',
  '- Chỉ trả lời bằng tiếng Việt có dấu, lịch sự, ngắn gọn, không chửi thề, không đe dọa, không ép khách đánh giá hoặc hủy đơn.',
  '- Không kéo khách ra ngoài sàn, không xin hoặc gửi số điện thoại, Zalo, Facebook, website, QR, tài khoản ngân hàng, link mua ngoài sàn.',
  '- Không hứa hoàn tiền, đổi trả, bảo hành, voucher, giảm giá hoặc bồi thường ngoài chính sách hiển thị trên sàn và dữ liệu đơn hàng.',
  '- Không tự bịa tồn kho, giá, thời gian giao, trạng thái vận chuyển. Nếu thiếu dữ liệu thì xin mã đơn hoặc chuyển nhân viên kiểm tra.',
  '- Không quảng bá hàng cấm, hàng giả, hàng xâm phạm sở hữu trí tuệ, nội dung sai sự thật, spam hoặc nội dung người lớn/nhạy cảm.',
  '- Khi khách hỏi khiếu nại, hoàn trả, hủy đơn, đánh giá xấu hoặc yêu cầu ngoài sàn: AI chỉ soạn nháp để nhân viên duyệt.',
  '',
  'Shopee Chat: được hỗ trợ hỏi sản phẩm và cập nhật đơn hàng; cấm từ ngữ phản cảm, spam, giao dịch ngoài Shopee và yêu cầu người mua hủy đơn.',
  'Lazada: đơn, thanh toán, trả hàng và nội dung giao tiếp phải theo nền tảng; không dùng nội dung xúc phạm, sai sự thật, lừa dối, vi phạm pháp luật hoặc quyền riêng tư.',
  'TikTok Shop: cấm quấy rối, đe dọa, thao túng đánh giá, spam, kéo khách ra ngoài nền tảng, xử lý giao dịch/hoàn tiền ngoài TikTok Shop, nội dung sai sự thật hoặc hàng cấm.'
].join('\n')

export const DEFAULT_AI_SETTINGS = {
  ai_mode: 'suggest_only',
  ai_provider: 'gemini',
  ai_status: 'unconfigured',
  ai_model: 'gemini-2.5-flash',
  ai_learning_notes: DEFAULT_AI_LEARNING_NOTES,
  restricted_keywords: DEFAULT_RESTRICTED_KEYWORDS,
  gemini_api_keys: [],
  gemini_key_cursor: 0,
  poll_seconds: 12,
  poll_interval_seconds: 15,
  browser_helper_poll_seconds: 45,
  automation_browser_preset: 'compact',
  automation_browser_width: 620,
  automation_browser_height: 480,
  automation_browser_left: 0,
  automation_browser_top: 0,
  automation_browser_hidden: false,
  sync_limit: 30,
  force_history: false,
  allow_auto_send: false,
  chat_ai_agent_config: DEFAULT_CHAT_AI_AGENT_CONFIG,
  enabled_channels: ['shopee', 'lazada', 'tiktok', 'facebook', 'zalo', 'internal']
}

export function normalizeKeywordList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\n,;]/)
  return [...new Set(list.map(item => String(item || '').trim()).filter(Boolean))]
}

export function normalizeGeminiKeys(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\n,; ]/)
  return [...new Set(list.map(item => String(item || '').trim()).filter(Boolean))]
    .filter(item => item.length >= 20)
    .slice(0, 5)
}

function appendGeminiKeys(current = [], incoming = []) {
  return normalizeGeminiKeys([
    ...normalizeGeminiKeys(current),
    ...normalizeGeminiKeys(incoming)
  ])
}

export function normalizeAiSettings(current = {}, incoming = {}) {
  const hasGeminiKeyInput = Object.prototype.hasOwnProperty.call(incoming, 'gemini_api_keys_input')
  const hasGeminiKeyReplacement = Object.prototype.hasOwnProperty.call(incoming, 'gemini_api_keys')
  const hasAllowAutoSend = Object.prototype.hasOwnProperty.call(incoming, 'allow_auto_send')
  const inputGeminiKeys = normalizeGeminiKeys(incoming.gemini_api_keys_input)
  const nextGeminiKeys = hasGeminiKeyInput
    ? (inputGeminiKeys.length ? appendGeminiKeys(current.gemini_api_keys, inputGeminiKeys) : normalizeGeminiKeys(current.gemini_api_keys))
    : hasGeminiKeyReplacement
      ? normalizeGeminiKeys(incoming.gemini_api_keys)
      : normalizeGeminiKeys(current.gemini_api_keys)
  const chatAiAgentConfig = normalizeChatAiAgentConfig({
    ai_mode: incoming.ai_mode ?? current.ai_mode ?? DEFAULT_AI_SETTINGS.ai_mode,
    chat_ai_agent_config: incoming.chat_ai_agent_config ?? current.chat_ai_agent_config ?? DEFAULT_CHAT_AI_AGENT_CONFIG
  })
  const requestedAutoSend = hasAllowAutoSend ? incoming.allow_auto_send === true : current.allow_auto_send === true
  const allowAutoSend = chatAiAgentConfig.mode === 'auto_send_guarded' && requestedAutoSend
  return {
    ...current,
    ...incoming,
    ai_mode: allowAutoSend ? 'auto_send_guarded' : 'suggest_only',
    ai_provider: String(incoming.ai_provider ?? current.ai_provider ?? DEFAULT_AI_SETTINGS.ai_provider).trim() || DEFAULT_AI_SETTINGS.ai_provider,
    ai_status: String(incoming.ai_status ?? current.ai_status ?? DEFAULT_AI_SETTINGS.ai_status).trim() || DEFAULT_AI_SETTINGS.ai_status,
    ai_model: String(incoming.ai_model ?? current.ai_model ?? DEFAULT_AI_SETTINGS.ai_model).trim() || DEFAULT_AI_SETTINGS.ai_model,
    ai_learning_notes: String(incoming.ai_learning_notes ?? current.ai_learning_notes ?? DEFAULT_AI_LEARNING_NOTES).trim() || DEFAULT_AI_LEARNING_NOTES,
    restricted_keywords: normalizeKeywordList(incoming.restricted_keywords ?? current.restricted_keywords ?? DEFAULT_RESTRICTED_KEYWORDS),
    gemini_api_keys: nextGeminiKeys,
    gemini_api_keys_input: undefined,
    gemini_api_key_count: undefined,
    gemini_api_keys_saved: undefined,
    gemini_key_cursor: Math.max(Number(incoming.gemini_key_cursor ?? current.gemini_key_cursor ?? 0) || 0, 0),
    poll_seconds: Math.min(Math.max(Number(incoming.poll_seconds ?? current.poll_seconds ?? DEFAULT_AI_SETTINGS.poll_seconds) || 12, 5), 120),
    poll_interval_seconds: Math.min(Math.max(Number(incoming.poll_interval_seconds ?? current.poll_interval_seconds ?? DEFAULT_AI_SETTINGS.poll_interval_seconds) || 15, 10), 120),
    browser_helper_poll_seconds: Math.min(Math.max(Number(incoming.browser_helper_poll_seconds ?? current.browser_helper_poll_seconds ?? DEFAULT_AI_SETTINGS.browser_helper_poll_seconds) || 45, 30), 300),
    automation_browser_preset: ['compact', 'top_left', 'top_right', 'desktop', 'custom'].includes(String(incoming.automation_browser_preset ?? current.automation_browser_preset ?? DEFAULT_AI_SETTINGS.automation_browser_preset).trim())
      ? String(incoming.automation_browser_preset ?? current.automation_browser_preset ?? DEFAULT_AI_SETTINGS.automation_browser_preset).trim()
      : DEFAULT_AI_SETTINGS.automation_browser_preset,
    automation_browser_width: Math.min(Math.max(Number(incoming.automation_browser_width ?? current.automation_browser_width ?? DEFAULT_AI_SETTINGS.automation_browser_width) || 620, 300), 1600),
    automation_browser_height: Math.min(Math.max(Number(incoming.automation_browser_height ?? current.automation_browser_height ?? DEFAULT_AI_SETTINGS.automation_browser_height) || 480, 320), 1000),
    automation_browser_left: Math.min(Math.max(Number(incoming.automation_browser_left ?? current.automation_browser_left ?? DEFAULT_AI_SETTINGS.automation_browser_left) || 0, 0), 2400),
    automation_browser_top: Math.min(Math.max(Number(incoming.automation_browser_top ?? current.automation_browser_top ?? DEFAULT_AI_SETTINGS.automation_browser_top) || 0, 0), 1400),
    automation_browser_hidden: false,
    sync_limit: Math.min(Math.max(Number(incoming.sync_limit ?? current.sync_limit ?? DEFAULT_AI_SETTINGS.sync_limit) || 30, 10), 50),
    force_history: incoming.force_history === true,
    allow_auto_send: allowAutoSend,
    chat_ai_agent_config: chatAiAgentConfig
  }
}

export function publicChatSettings(settings = {}) {
  const keyCount = normalizeGeminiKeys(settings.gemini_api_keys).length
  const { gemini_api_keys: _keys, gemini_api_keys_input: _input, ...safe } = settings
  return {
    ...safe,
    gemini_api_key_count: keyCount,
    gemini_api_keys_saved: keyCount > 0,
    restricted_keywords_public: normalizeKeywordList(settings.restricted_keywords),
    restricted_patterns_public: DEFAULT_RESTRICTED_PATTERNS
  }
}
