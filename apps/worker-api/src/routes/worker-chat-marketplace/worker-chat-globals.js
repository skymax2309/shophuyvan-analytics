// NEO: Backend worker chat sàn - nhóm globals. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
import { getShopeeAppFromRow, getShopeeAppFromRowForClient, signHmacHex } from '../../utils/shopee-apps.js'
import { requireAdminPermission } from '../admin/index.js'
import {
  getOrderStatusValue,
  orderKindLabel as coreOrderKindLabel,
  orderStatusKind,
  orderStatusLabel as coreOrderStatusLabel
} from '../../core/orders/status-core.js'
import {
  CHAT_TRANSPORT_API,
  CHAT_TRANSPORT_BROWSER,
  CHAT_TRANSPORT_OFF,
  buildChatCapabilityMatrix,
  chatTransportGuide,
  resolveChatTransportForShop
} from '../../core/chat/transport-core.js'
import {
  CHAT_ORDER_MATCH_HARD,
  CHAT_ORDER_MATCH_SOFT,
  chatOrderMatchMeta,
  chatOrderMatchStateLabel,
  chatOrderSyncStale,
  resolveChatOrderSyncCapability
} from '../../core/chat/order-context-core.js'
import {
  CHAT_CONVERSATION_MATCH_HARD,
  CHAT_CONVERSATION_MATCH_NONE,
  CHAT_CONVERSATION_MATCH_SOFT,
  buildOrderChatPrefill,
  buildOrderChatSearchQuery,
  normalizeOrderResolverPhone,
  orderConversationMatchMeta,
  scoreSoftOrderConversationMatch
} from '../../core/chat/order-resolver-core.js'
import {
  chatIdentityKey,
  isAutomationConversationId,
  isGenericChatBuyerName,
  isWeakChatConversationIdentity,
  shouldAliasConversation
} from '../../core/chat/identity-core.js'
import { resolveChatScanPolicy } from '../../core/chat/scan-policy-core.js'
import {
  CHAT_AI_SUPPORT_CONTACT_POLICY_REPLY,
  CHAT_AI_SUPPORT_DEFAULT_BLOCKED_KEYWORDS,
  CHAT_AI_SUPPORT_DEFAULT_FORBIDDEN_PATTERNS,
  CHAT_AI_SUPPORT_DEFAULT_REVIEW_TRIGGERS,
  CHAT_AI_SUPPORT_DEFAULT_RULE_LINES,
  CHAT_AI_SUPPORT_PAYMENT_POLICY_REPLY,
  CHAT_AI_SUPPORT_SYSTEM_PROMPT,
  evaluateAiSupportPolicyReply,
  sanitizeAiSupportReplyText
} from '../../core/chat/ai-support-policy-core.js'

Object.assign(globalThis, {
  getShopeeAppFromRow,
  getShopeeAppFromRowForClient,
  signHmacHex,
  requireAdminPermission,
  getOrderStatusValue,
  coreOrderKindLabel,
  orderStatusKind,
  coreOrderStatusLabel,
  CHAT_TRANSPORT_API,
  CHAT_TRANSPORT_BROWSER,
  CHAT_TRANSPORT_OFF,
  buildChatCapabilityMatrix,
  chatTransportGuide,
  resolveChatTransportForShop,
  CHAT_ORDER_MATCH_HARD,
  CHAT_ORDER_MATCH_SOFT,
  chatOrderMatchMeta,
  chatOrderMatchStateLabel,
  chatOrderSyncStale,
  resolveChatOrderSyncCapability,
  CHAT_CONVERSATION_MATCH_HARD,
  CHAT_CONVERSATION_MATCH_NONE,
  CHAT_CONVERSATION_MATCH_SOFT,
  buildOrderChatPrefill,
  buildOrderChatSearchQuery,
  normalizeOrderResolverPhone,
  orderConversationMatchMeta,
  scoreSoftOrderConversationMatch,
  chatIdentityKey,
  isAutomationConversationId,
  isGenericChatBuyerName,
  isWeakChatConversationIdentity,
  shouldAliasConversation,
  resolveChatScanPolicy,
  CHAT_AI_SUPPORT_CONTACT_POLICY_REPLY,
  CHAT_AI_SUPPORT_DEFAULT_BLOCKED_KEYWORDS,
  CHAT_AI_SUPPORT_DEFAULT_FORBIDDEN_PATTERNS,
  CHAT_AI_SUPPORT_DEFAULT_REVIEW_TRIGGERS,
  CHAT_AI_SUPPORT_DEFAULT_RULE_LINES,
  CHAT_AI_SUPPORT_PAYMENT_POLICY_REPLY,
  CHAT_AI_SUPPORT_SYSTEM_PROMPT,
  evaluateAiSupportPolicyReply,
  sanitizeAiSupportReplyText
})
