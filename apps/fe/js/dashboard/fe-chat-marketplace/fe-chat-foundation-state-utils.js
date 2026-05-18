// NEO: Frontend chat sàn - nhóm foundation-state-utils. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
const chatState = {
  shops: [],
  conversations: [],
  activeId: null,
  activeConversation: null,
  messages: [],
  context: null,
  settings: null,
  setupData: null,
  setupLoading: false,
  setupLoaded: false,
  setupError: '',
  setupLoadPromise: null,
  activeSideTab: 'orders',
  activeSettingsTab: 'automation',
  keywordQuery: '',
  productQuery: '',
  productModalItems: [],
  productModalProducts: [],
  productModalTotal: 0,
  productModalMatched: 0,
  productModalOffset: 0,
  productModalHasMore: false,
  productModalLoading: false,
  productModalError: '',
  productSearchTimer: null,
  productPanelQuery: '',
  productPanelItems: [],
  productPanelTotal: 0,
  productPanelMatched: 0,
  productPanelLoading: false,
  productPanelError: '',
  productPanelSearchTimer: null,
  productPanelLoadedQuery: '',
  productPanelSyncing: false,
  productPanelSyncStatus: '',
  orderPanelSyncing: false,
  orderPanelSyncStatus: '',
  orderPanelAutoSyncAt: new Map(),
  orderLogisticsById: new Map(),
  orderLogisticsLoadingId: '',
  ruleViolations: [],
  autoReplyLogs: [],
  autoReplyRunning: false,
  shopAutoSettings: [],
  shopAutoSettingsLoading: false,
  ghnAutoOrders: [],
  ghnAutoRunning: false,
  shopeeChatProbeByShop: {},
  knowledgeItems: [],
  knowledgeQuery: '',
  knowledgeLoading: false,
  knowledgeSaveIndex: null,
  advisoryItems: [],
  advisoryQuery: '',
  advisoryLoading: false,
  advisoryEditId: 0,
  advisoryProductQuery: '',
  advisoryProductItems: [],
  advisoryProductLoading: false,
  advisoryProductError: '',
  advisoryProductSearchTimer: null,
  advisorySelectedProduct: null,
  advisoryRelatedProduct: null,
  loaded: false,
  polling: null,
  apiSyncing: false,
  automationSyncing: false,
  autoAutomationEnabled: localStorage.getItem(`shv_chat_auto_automation:${location.origin}`) === '1',
  autoAutomationMinutes: Math.min(Math.max(Number(localStorage.getItem(`shv_chat_auto_automation_minutes:${location.origin}`) || 5) || 5, 1), 60),
  lastAutomationSyncAt: 0,
  lastApiSyncAt: 0,
  lastApiSyncStatus: '',
  guardTimer: null,
  notifiedKeys: new Set(),
  notifyBaselineReady: false,
  notificationStatus: null,
  audioContext: null,
  audioUnlocked: false,
  mobileThreadVisible: false,
  mobileAttachOpen: false,
  pendingMedia: [],
  conversationRequestSeq: 0,
  messageRequestSeq: 0,
  contextRequestSeq: 0,
  conversationAbort: null,
  messageAbort: null,
  contextAbort: null,
  pendingOrderJump: null,
  pendingOrderJumpHandled: false
}

const CHAT_NOTIFY_KEYS_KEY = `shv_chat_notified_keys:${location.origin}`
const CHAT_NOTIFY_KEY_LIMIT = 300
const CHAT_AUTOMATION_HELPER_URL = 'http://127.0.0.1:8765'
const CHAT_ADMIN_TOKEN_KEY = 'shv_admin_token'
const CHAT_AUTO_AUTOMATION_KEY = `shv_chat_auto_automation:${location.origin}`
const CHAT_AUTO_AUTOMATION_MINUTES_KEY = `shv_chat_auto_automation_minutes:${location.origin}`
const CHAT_AUTO_AUTOMATION_MIN_MINUTES_KEY = `shv_chat_auto_automation_min_minutes:${location.origin}`
const CHAT_AUTO_AUTOMATION_MAX_MINUTES_KEY = `shv_chat_auto_automation_max_minutes:${location.origin}`
const CHAT_AUTOMATION_RUNTIME_KEY = `shv_automation_runtime_settings:${location.origin}`
const CHAT_ORDER_JUMP_STORAGE_PREFIX = `shv_chat_order_jump:${location.origin}:`
const CHAT_VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh'
const CHAT_TIME_FORMATTER_VN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: CHAT_VIETNAM_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})
const CHAT_CONTEXT_TABS = new Set(['orders', 'products', 'vouchers'])
const CHAT_SETTINGS_TABS = new Set(['automation', 'ai-auto', 'advisories', 'rules', 'knowledge', 'keywords'])
const REQUIRED_CHAT_AI_FORBIDDEN_PATTERNS = [
  'zalo',
  'facebook',
  'messenger',
  'telegram',
  'whatsapp',
  'momo',
  'chuyển khoản',
  'số tài khoản',
  'tài khoản ngân hàng',
  'thanh toán ngoài',
  'đặt cọc',
  'mua ngoài sàn',
  'đặt ngoài sàn',
  'địa chỉ shop',
  'qua lấy trực tiếp',
  'cam kết 100%',
  'chắc chắn dùng được',
  'không bao giờ lỗi',
  'bảo hành đổi mới ngay',
  'hoàn tiền ngay',
  'đổi mới ngay',
  'đánh giá tốt',
  'sửa đánh giá',
  'xóa đánh giá',
  'lách chính sách',
  'đấu dây trực tiếp',
  'nối nguồn',
  'sửa mạch',
  'regex:\\bshopee\\b',
  'regex:\\blazada\\b',
  'regex:\\btik\\s?tok(?:\\s+shop)?\\b',
  'regex:\\bshop\\s*huy\\s*vân\\b',
  'regex:\\bshop\\s*huy\\s*van\\b',
  'regex:\\bshophuyvan\\b',
  'regex:(https?:\\/\\/|www\\.)\\S+',
  'regex:(\\+?84|0)([\\s.-]*\\d){8,10}'
]
const CHAT_SHOP_CONTACT_POLICY_REPLY = 'Dạ shop hỗ trợ mình trực tiếp trên sàn. Mình nhắn giúp shop vấn đề cần hỗ trợ, shop kiểm tra và phản hồi tại đây ạ.'
const REQUIRED_CHAT_AI_RULE_LINES = [
  'AI chỉ được tự gửi khi câu trả lời chắc chắn an toàn theo rule chính sách sàn.',
  'Không viết đúng tên sàn cụ thể trong câu trả lời gửi khách; nếu cần thì gọi chung là "sàn".',
  'Không nhắc số điện thoại, Zalo, Facebook, website riêng, địa chỉ shop, kênh thanh toán ngoài sàn hoặc hướng khách qua lấy trực tiếp.',
  'Không cung cấp giá, khuyến mãi, voucher hoặc phí ship; chỉ hướng khách xem trực tiếp trên sàn.',
  'Không hứa chắc hoàn tiền, đổi trả hoặc bảo hành; chỉ nói shop sẽ kiểm tra theo chính sách của sàn và tình trạng đơn.',
  'Không xin khách sửa, xóa, đổi hoặc để lại đánh giá; chỉ ghi nhận phản hồi và xử lý vấn đề khách báo.',
  'Với sản phẩm điện hoặc cần lắp đặt, không hướng dẫn đấu nối chi tiết; chỉ nhắc đọc hướng dẫn sử dụng gửi kèm và nhờ kỹ thuật viên nếu không chắc.',
  `Nếu khách xin thông tin liên hệ, địa chỉ hoặc kênh ngoài sàn thì chỉ trả lời theo hướng an toàn: "${CHAT_SHOP_CONTACT_POLICY_REPLY}"`
]

function chatClampAutomationMinute(value, fallback = 5) {
  return Math.min(Math.max(Number(value || fallback) || fallback, 1), 120)
}

function chatNormalizeAutomationRange(minValue, maxValue) {
  const oldMinutes = chatClampAutomationMinute(localStorage.getItem(CHAT_AUTO_AUTOMATION_MINUTES_KEY), 5)
  let min = chatClampAutomationMinute(minValue, oldMinutes)
  let max = chatClampAutomationMinute(maxValue, Math.max(min, oldMinutes))
  if (max < min) [min, max] = [max, min]
  return { min, max }
}

const chatInitialAutomationRange = chatNormalizeAutomationRange(
  localStorage.getItem(CHAT_AUTO_AUTOMATION_MIN_MINUTES_KEY),
  localStorage.getItem(CHAT_AUTO_AUTOMATION_MAX_MINUTES_KEY)
)
chatState.autoAutomationMinMinutes = chatInitialAutomationRange.min
chatState.autoAutomationMaxMinutes = chatInitialAutomationRange.max
chatState.nextAutomationSyncAt = 0

function chatDefaultAutomationRuntimeSettings() {
  return {
    browser_width: 220,
    browser_height: 420,
    browser_left: 0,
    browser_top: 0,
    browser_minimized: false,
    expand_browser_viewport: false
  }
}

function chatClampAutomationNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), min), max)
}

function chatReadAutomationRuntimeSettings() {
  const defaults = chatDefaultAutomationRuntimeSettings()
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_AUTOMATION_RUNTIME_KEY) || '{}')
    return {
      browser_width: chatClampAutomationNumber(saved.browser_width, defaults.browser_width, 200, 1800),
      browser_height: chatClampAutomationNumber(saved.browser_height, defaults.browser_height, 300, 1200),
      browser_left: chatClampAutomationNumber(saved.browser_left, defaults.browser_left, 0, 4000),
      browser_top: chatClampAutomationNumber(saved.browser_top, defaults.browser_top, 0, 2400),
      browser_minimized: Boolean(saved.browser_minimized),
      expand_browser_viewport: Boolean(saved.expand_browser_viewport)
    }
  } catch {
    return defaults
  }
}

function chatWriteAutomationRuntimeSettings(settings = {}) {
  const defaults = chatDefaultAutomationRuntimeSettings()
  const next = {
    browser_width: chatClampAutomationNumber(settings.browser_width, defaults.browser_width, 200, 1800),
    browser_height: chatClampAutomationNumber(settings.browser_height, defaults.browser_height, 300, 1200),
    browser_left: chatClampAutomationNumber(settings.browser_left, defaults.browser_left, 0, 4000),
    browser_top: chatClampAutomationNumber(settings.browser_top, defaults.browser_top, 0, 2400),
    browser_minimized: Boolean(settings.browser_minimized),
    expand_browser_viewport: Boolean(settings.expand_browser_viewport)
  }
  localStorage.setItem(CHAT_AUTOMATION_RUNTIME_KEY, JSON.stringify(next))
  return next
}

function chatAutomationRuntimePayload() {
  // Cấu hình Chrome đi cùng mọi request helper để sau này chỉnh kích thước chỉ sửa một nơi trên web.
  return chatReadAutomationRuntimeSettings()
}

function chatReadNotifiedKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_NOTIFY_KEYS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function chatWriteNotifiedKeys() {
  try {
    const keys = [...chatState.notifiedKeys].slice(-CHAT_NOTIFY_KEY_LIMIT)
    chatState.notifiedKeys = new Set(keys)
    localStorage.setItem(CHAT_NOTIFY_KEYS_KEY, JSON.stringify(keys))
  } catch {}
}

function chatSimpleHash(value) {
  let hash = 0
  const input = String(value ?? '').trim()
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  return Math.abs(hash).toString(36)
}

function chatKeyPart(value, fallback = '_') {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return text || fallback
}

chatReadNotifiedKeys().forEach(key => chatState.notifiedKeys.add(key))

function chatEl(id) {
  return document.getElementById(id)
}

function chatClearOrderJumpParam(key) {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('jump') !== key) return
    url.searchParams.delete('jump')
    const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash || ''}`
    window.history.replaceState({}, '', next)
  } catch {}
}

function chatConsumePendingOrderJump() {
  try {
    const url = new URL(window.location.href)
    const key = String(url.searchParams.get('jump') || '').trim()
    if (!key || !key.startsWith(CHAT_ORDER_JUMP_STORAGE_PREFIX)) return null
    const raw = localStorage.getItem(key)
    localStorage.removeItem(key)
    chatClearOrderJumpParam(key)
    if (!raw) return null
    const payload = JSON.parse(raw)
    const createdAt = Number(payload?.created_at || 0)
    if (createdAt && Date.now() - createdAt > 10 * 60 * 1000) return null
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

function chatEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

function chatNormalizeDisplayText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function chatErrorMessage(error, fallback = 'Không rõ lỗi') {
  if (!error) return fallback
  if (typeof error === 'string') {
    return chatHumanAutomationError(error) || error || fallback
  }
  const direct = error.message || error.error || error.detail || error.reason || error.statusText
  if (direct) return chatHumanAutomationError(String(direct)) || String(direct)
  try {
    const serialized = JSON.stringify(error)
    if (!serialized || serialized === '{}') return fallback
    return chatHumanAutomationError(serialized) || serialized.slice(0, 500)
  } catch {
    return fallback
  }
}

function chatPlatformLabel(platform) {
  const key = String(platform || '').toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  return platform || 'Sàn'
}

function chatHumanAutomationError(message = '') {
  const text = String(message || '').trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  if (lower.includes('reply_editor_not_found') || lower.includes('editor_not_found')) {
    return 'Không tìm thấy ô nhập trả lời trên trang chat. Hãy mở đúng hội thoại rồi gửi lại.'
  }
  if (lower.includes('target_not_found')) {
    return 'Không tìm thấy khách trong danh sách chat hiện tại để gửi automation.'
  }
  if (
    lower.includes('playwright')
    || lower.includes('page.handlejavascriptdialog')
    || lower.includes('dialog_onhandle')
    || lower.includes('targetclosederror')
    || lower.includes('crconnection')
  ) {
    return 'Trình duyệt automation bị popup hoặc đổi trạng thái khi gửi. Hãy chạy lại sau khi tab chat ổn định.'
  }
  const firstLine = text.split(/\r?\n/).map(item => item.trim()).find(Boolean) || text
  return firstLine.slice(0, 320)
}

function chatSyncResultReason(item = {}) {
  const explicit = chatErrorMessage(item.reason || item.last_error?.message || item.last_error?.error || '', '')
  if (explicit) return explicit
  const status = String(item.status || '').toLowerCase()
  if (status === 'no_messages') return 'đã kiểm tra, chưa có tin nhắn mới'
  if (status === 'no_conversation') return 'chưa có hội thoại mới từ API'
  if (status === 'permission_required') return 'shop có API nhưng app chưa có quyền IM/chat'
  if (status === 'unsupported') return 'chưa có endpoint IM hợp lệ'
  if (status === 'skipped') return 'shop chưa đủ token/API'
  if (status === 'ok') return `${Number(item.pulled_messages || 0).toLocaleString('vi-VN')} tin`
  return item.status || 'chưa có dữ liệu mới'
}

function chatSyncResultIsHardError(item = {}) {
  const status = String(item.status || '').toLowerCase()
  return status === 'error' || status === 'permission_required' || Boolean(item.last_error?.error || item.last_error?.message)
}
