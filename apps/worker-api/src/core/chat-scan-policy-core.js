import { CHAT_TRANSPORT_API, CHAT_TRANSPORT_BROWSER } from './chat-transport-core.js'
import { isWeakChatConversationIdentity } from './chat-identity-core.js'

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\u00a0/g, ' ').trim()
}

export function resolveChatScanPolicy(target = {}, options = {}) {
  const transport = cleanText(target.transport || options.transport).toLowerCase()
  if (transport === CHAT_TRANSPORT_API) {
    return {
      mode: 'api_direct',
      open_deep: false,
      max_threads: 0,
      reason_code: 'api_direct',
      note: 'Shop API lấy tin bằng endpoint chính thức, không mở Chrome.'
    }
  }

  const forceDeep = options.force_deep === true || options.forceDeep === true || cleanText(target.scan_mode) === 'browser_thread_detail'
  const weakIdentity = isWeakChatConversationIdentity(target)
  if (transport === CHAT_TRANSPORT_BROWSER && (forceDeep || weakIdentity)) {
    return {
      mode: 'browser_thread_detail',
      open_deep: true,
      max_threads: Math.max(1, Number(options.limit || target.limit || 3) || 3),
      reason_code: forceDeep ? 'force_deep' : 'weak_identity',
      note: 'Chrome cần mở sâu hội thoại để xác minh khách/tin mới và chống tách trùng.'
    }
  }

  return {
    mode: 'browser_inbox_summary',
    open_deep: false,
    max_threads: 0,
    reason_code: 'summary_first',
    note: 'Chrome chỉ quét danh sách ngoài trước để tiết kiệm tài nguyên.'
  }
}

export function shouldOpenDeepChatScan(target = {}, options = {}) {
  return resolveChatScanPolicy(target, options).open_deep
}
