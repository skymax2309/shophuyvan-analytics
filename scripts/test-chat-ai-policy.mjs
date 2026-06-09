import assert from 'node:assert/strict'
import { DEFAULT_RESTRICTED_KEYWORDS, normalizeAiSettings, normalizeGeminiKeys } from '../apps/chat-worker-api/src/core/ai-settings-defaults.js'
import { applyAgentEvidencePolicy, buildAgentEvidence, normalizeChatAiAgentConfig } from '../apps/chat-worker-api/src/core/ai-agent-evidence-core.js'
import { applyAiDeliveryModePolicy, evaluateAiSuggestionPolicy, evaluateRestrictedKeywordPolicy } from '../apps/chat-worker-api/src/core/ai-policy-core.js'
import { backendAutoReplyGuardState } from '../apps/chat-worker-api/src/core/sync-core.js'

const settings = normalizeAiSettings({}, {
  restricted_keywords: DEFAULT_RESTRICTED_KEYWORDS,
  gemini_api_keys_input: [
    'AIzaSyA111111111111111111111111111111111',
    'AIzaSyB222222222222222222222222222222222',
    'AIzaSyC333333333333333333333333333333333',
    'AIzaSyD444444444444444444444444444444444',
    'AIzaSyE555555555555555555555555555555555',
    'AIzaSyF666666666666666666666666666666666'
  ].join('\n')
})

assert.equal(normalizeGeminiKeys(settings.gemini_api_keys).length, 5)
assert.equal(evaluateRestrictedKeywordPolicy('Mình nhắn qua zalo nhé', settings).allowed, false)
assert.equal(evaluateRestrictedKeywordPolicy('Cho shop xin sdt để hỗ trợ', settings).allowed, false)
assert.equal(evaluateRestrictedKeywordPolicy('0909128999 shophuyvan.vn', settings).allowed, false)
assert.equal(evaluateRestrictedKeywordPolicy('Mình gửi số 0909128999 qua Zalo nhé', { ...settings, channel: 'zalo' }).allowed, true)
assert.equal(evaluateRestrictedKeywordPolicy('Nhắn Messenger hoặc Facebook cho shop', { ...settings, channel: 'facebook' }).allowed, true)
assert.equal(evaluateRestrictedKeywordPolicy('Số của shop là 090 912 8999', settings).blocked_terms.includes('định dạng số điện thoại'), true)
assert.equal(evaluateRestrictedKeywordPolicy('Xem thêm tại https://shophuyvan.vn', settings).blocked_terms.includes('định dạng website'), true)
assert.equal(evaluateRestrictedKeywordPolicy('Mã đơn 260525BY4BCTM7, tổng 90.000đ', settings).allowed, true)
assert.equal(evaluateRestrictedKeywordPolicy('Dạ shop kiểm tra đơn và phản hồi mình ngay ạ.', settings).allowed, true)
assert.equal(evaluateAiSuggestionPolicy('Dạ shop kiểm tra đơn và phản hồi mình ngay ạ.', { ...settings, allow_auto_send: true }).policy_status, 'approved')
assert.equal(evaluateAiSuggestionPolicy('Dạ mình nhắn zalo nhé', { ...settings, allow_auto_send: true }).policy_status, 'blocked')
assert.equal(evaluateAiSuggestionPolicy('Dạ mình nhắn Zalo nhé', { ...settings, allow_auto_send: true, channel: 'zalo' }).policy_status, 'approved')
const suggestOnlyPolicy = applyAiDeliveryModePolicy(
  evaluateAiSuggestionPolicy('Dạ shop kiểm tra đơn và phản hồi mình ngay ạ.', { ...settings, allow_auto_send: true }),
  { CHAT_AI_MODE: 'suggest_only' },
  {}
)
assert.equal(suggestOnlyPolicy.policy_status, 'needs_review')
assert.equal(suggestOnlyPolicy.allowed_to_send, false)
assert.equal(suggestOnlyPolicy.mode, 'suggest_only')
const autoSimplePolicy = applyAiDeliveryModePolicy(
  evaluateAiSuggestionPolicy('Dạ đơn của mình đang giao ạ.', { ...settings, allow_auto_send: true }),
  { CHAT_AI_MODE: 'auto_simple' },
  {},
  {
    orders: [{ order_id: '260525BY4BCTM7' }],
    products: [],
    warnings: [],
    risk_flags: [],
    simple_intent: { intent: 'order_status_simple', simple: true }
  }
)
assert.equal(autoSimplePolicy.policy_status, 'approved')
assert.equal(autoSimplePolicy.allowed_to_send, true)
assert.equal(autoSimplePolicy.mode, 'auto_simple')
const autoSimpleWarningPolicy = applyAiDeliveryModePolicy(
  evaluateAiSuggestionPolicy('Dạ shop sẽ kiểm tra thêm ạ.', { ...settings, allow_auto_send: true }),
  { CHAT_AI_MODE: 'auto_simple' },
  {},
  {
    orders: [{ order_id: '260525BY4BCTM7' }],
    products: [],
    warnings: ['Không đọc được dữ liệu sản phẩm'],
    risk_flags: [],
    simple_intent: { intent: 'order_status_simple', simple: true }
  }
)
assert.equal(autoSimpleWarningPolicy.policy_status, 'needs_review')
assert.equal(autoSimpleWarningPolicy.allowed_to_send, false)
assert.equal(normalizeAiSettings(settings, { ai_model: 'gemini-2.5-flash' }).gemini_api_keys.length, 5)

const twoSavedKeys = normalizeAiSettings({}, {
  gemini_api_keys: [
    'AIzaSySaved11111111111111111111111111111',
    'AIzaSySaved22222222222222222222222222222'
  ]
})
const appendedKeys = normalizeAiSettings(twoSavedKeys, {
  gemini_api_keys_input: 'AIzaSyNew333333333333333333333333333333'
})
assert.deepEqual(appendedKeys.gemini_api_keys, [
  'AIzaSySaved11111111111111111111111111111',
  'AIzaSySaved22222222222222222222222222222',
  'AIzaSyNew333333333333333333333333333333'
])
assert.equal(normalizeAiSettings(twoSavedKeys, { gemini_api_keys_input: '' }).gemini_api_keys.length, 2)
assert.equal(normalizeAiSettings(twoSavedKeys, { gemini_api_keys: [] }).gemini_api_keys.length, 0)
const staleAutoSendSettings = normalizeAiSettings(
  { allow_auto_send: true, ai_mode: 'auto_send_guarded' },
  { chat_ai_agent_config: { mode: 'suggest_only' } }
)
assert.equal(staleAutoSendSettings.allow_auto_send, false)
assert.equal(staleAutoSendSettings.ai_mode, 'suggest_only')
const guardedAutoSendSettings = normalizeAiSettings({}, {
  allow_auto_send: true,
  ai_mode: 'auto_send_guarded',
  chat_ai_agent_config: { mode: 'auto_send_guarded', evidence_required: false }
})
assert.equal(guardedAutoSendSettings.allow_auto_send, true)
assert.equal(guardedAutoSendSettings.ai_mode, 'auto_send_guarded')

const agentConfig = normalizeChatAiAgentConfig({
  chat_ai_agent_config: {
    mode: 'reviewed_auto_ready',
    min_confidence: 'very_high',
    raw_conversation_learning: true,
    sources: { product_data: false }
  }
})
assert.equal(agentConfig.mode, 'reviewed_auto_ready')
assert.equal(agentConfig.raw_conversation_learning, false)
assert.equal(agentConfig.sources.product_data, false)
assert.equal(normalizeAiSettings({}, { chat_ai_agent_config: agentConfig }).chat_ai_agent_config.raw_conversation_learning, false)

const riskyEvidence = buildAgentEvidence({
  settings: { chat_ai_agent_config: agentConfig },
  conversation: { channel: 'zalo' },
  messages: [{ sender_type: 'customer', text: 'Shop cho em hoàn tiền đơn này' }],
  aiContext: {
    orders: [],
    products: [],
    warnings: [],
    risk_flags: ['complaint_or_refund'],
    simple_intent: { intent: 'order_status_simple', simple: false }
  }
})
assert.equal(riskyEvidence.agent_handoff_required, true)
assert.equal(riskyEvidence.agent_raw_learning_disabled, true)
assert.equal(riskyEvidence.agent_risk_labels.some(item => item.includes('khiếu nại')), true)

const blockedByEvidence = applyAgentEvidencePolicy(
  { policy_status: 'approved', allowed_to_send: true, mode: 'auto_simple' },
  riskyEvidence
)
assert.equal(blockedByEvidence.policy_status, 'needs_review')
assert.equal(blockedByEvidence.allowed_to_send, false)
assert.equal(blockedByEvidence.context_review_required, true)

assert.deepEqual(backendAutoReplyGuardState({}, { allow_auto_send: false }), {
  enabled: false,
  reason: 'auto_send_disabled'
})
assert.deepEqual(backendAutoReplyGuardState({}, {
  allow_auto_send: true,
  ai_mode: 'auto_send_guarded',
  chat_ai_agent_config: { mode: 'auto_send_guarded' }
}), {
  enabled: false,
  reason: 'auto_send_requires_ui_countdown'
})
assert.deepEqual(backendAutoReplyGuardState({ CHAT_AI_BACKEND_AUTO_SEND: 'enabled' }, {
  allow_auto_send: true,
  ai_mode: 'auto_send_guarded',
  chat_ai_agent_config: { mode: 'auto_send_guarded' }
}), {
  enabled: true,
  reason: 'backend_auto_send_explicitly_enabled'
})

console.log('chat AI policy guard passed')
