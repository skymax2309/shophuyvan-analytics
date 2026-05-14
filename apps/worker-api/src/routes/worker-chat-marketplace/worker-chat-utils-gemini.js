// NEO: Backend worker chat sàn - nhóm utils-gemini. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
globalThis.LAZADA_DEFAULT_APP_KEY = '135731'

globalThis.LAZADA_DEFAULT_SECRET = 'UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK'

globalThis.CHAT_SCHEMA_VERSION = 6

globalThis.CHAT_SCHEMA_VERSION_KEY = 'chat_schema_version'

globalThis.CHAT_SCHEMA_CACHE_MS = 15 * 60 * 1000

globalThis.CHAT_TABLE_EXISTS_CACHE_MS = 10 * 60 * 1000

globalThis.CHAT_IDENTITY_BACKFILL_CACHE_MS = 6 * 60 * 60 * 1000

globalThis.chatSchemaReadyPromise = null

globalThis.chatSchemaReadyAt = 0

globalThis.chatIdentityBackfillPromise = null

globalThis.chatIdentityBackfillAt = 0

globalThis.chatTableExistsCache = new Map()

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'message', 'value', 'body']) {
      const nested = cleanText(value[key])
      if (nested) return nested
    }
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value).replace(/\u00a0/g, ' ').trim()
}

function errorMessage(error, fallback = 'Không rõ lỗi') {
  if (!error) return fallback
  if (typeof error === 'string') return cleanText(error) || fallback
  const direct = cleanText(error.message || error.error || error.detail || error.reason || error.statusText)
  if (direct) return direct
  try {
    const serialized = JSON.stringify(error)
    return cleanText(serialized).slice(0, 500) || fallback
  } catch {
    return fallback
  }
}

function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text || '')
  } catch {
    return fallback
  }
}

function valueAt(source, path) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return ''
    return current[key]
  }, source)
}

function firstText(source, paths) {
  for (const path of paths) {
    const value = Array.isArray(path) ? valueAt(source, path) : source?.[path]
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function simpleHash(text) {
  let hash = 0
  const input = cleanText(text)
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function stripJsonFence(text) {
  return cleanText(text).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

function limitText(value, limit = 2000) {
  const text = cleanText(value)
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function normalizeKeywordText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKeywordList(value) {
  const source = Array.isArray(value)
    ? value
    : cleanText(value).split(/[\n,;]/)
  const seen = new Set()
  const items = []
  for (const raw of source) {
    const text = cleanText(raw)
    const key = normalizeKeywordText(text)
    if (!key || key.length < 3 || seen.has(key)) continue
    seen.add(key)
    items.push(text)
  }
  return items.slice(0, 300)
}

function normalizeRuleLineList(value, limit = 120) {
  const source = Array.isArray(value)
    ? value
    : cleanText(value).split(/[\n;]/)
  const seen = new Set()
  const items = []
  for (const raw of source) {
    const text = cleanText(raw).slice(0, 300)
    const key = text.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    items.push(text)
  }
  return items.slice(0, limit)
}

function mergeRequiredChatAiRules(value, limit = 120) {
  // Luật chặn thông tin liên hệ của shop phải luôn hiện trong cấu hình để đội vận hành nhìn đúng nguồn chuẩn.
  return normalizeRuleLineList([
    ...REQUIRED_CHAT_AI_RULE_LINES,
    ...(Array.isArray(value) ? value : normalizeRuleLineList(value, limit))
  ], limit).join('\n')
}

globalThis.DEFAULT_CHAT_QUICK_REPLIES = [
  'Dạ shop đang kiểm tra và phản hồi ngay ạ.',
  'Dạ shop ghi nhận thông tin và sẽ kiểm tra lại trên sàn trước khi chốt giúp mình ạ.',
  'Dạ sản phẩm này shop sẽ đối chiếu lại thông tin sản phẩm và đơn hàng rồi phản hồi mình sớm nhất ạ.'
]

globalThis.CHAT_SHOP_CONTACT_POLICY_REPLY = CHAT_AI_SUPPORT_CONTACT_POLICY_REPLY

globalThis.REQUIRED_CHAT_AI_RULE_LINES = [
  ...CHAT_AI_SUPPORT_DEFAULT_RULE_LINES
]

function normalizeQuickReplies(value, limit = 80) {
  let source = value
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value, null)
    source = Array.isArray(parsed) ? parsed : value.split(/\n{2,}|\n/)
  }
  if (!Array.isArray(source)) source = []
  const seen = new Set()
  const items = []
  for (const raw of source) {
    const content = cleanText(typeof raw === 'object' ? (raw.content || raw.text || raw.message || raw.value) : raw).slice(0, 1200)
    if (!content) continue
    const key = normalizeKeywordText(content)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const title = cleanText(typeof raw === 'object' ? raw.title : '').slice(0, 80)
      || content.split('\n')[0].slice(0, 80)
    items.push({ title, content })
  }
  return items.slice(0, limit)
}

function getGeminiChatKeys(env) {
  return [...new Set([
    env.GEMINI_CHAT_API_KEY,
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY_4,
    env.GEMINI_API_KEY_5
  ].filter(Boolean))]
}

globalThis.geminiChatKeyCursor = 0

globalThis.GEMINI_CHAT_KEY_TIMEOUT_MS = 6500

globalThis.GEMINI_CHAT_MAX_ATTEMPTS = 3

function rotateGeminiChatKeys(keys = []) {
  if (!Array.isArray(keys) || !keys.length) return []
  const start = ((geminiChatKeyCursor % keys.length) + keys.length) % keys.length
  return keys.slice(start).concat(keys.slice(0, start))
}

function advanceGeminiChatKeyCursor(keys = [], offset = 1) {
  if (!Array.isArray(keys) || !keys.length) return
  geminiChatKeyCursor = (((geminiChatKeyCursor + Number(offset || 1)) % keys.length) + keys.length) % keys.length
}

async function requestGeminiGenerateContent(key, model, payload, timeoutMs = GEMINI_CHAT_KEY_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    try { controller.abort('gemini_timeout') } catch { controller.abort() }
  }, Math.max(1500, Number(timeoutMs) || GEMINI_CHAT_KEY_TIMEOUT_MS))
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok && !data?.error, data, status: response.status }
  } catch (error) {
    const timeout = controller.signal?.aborted && controller.signal?.reason === 'gemini_timeout'
    return {
      ok: false,
      error: timeout ? new Error('gemini_key_timeout') : error,
      isTimeout: timeout
    }
  } finally {
    clearTimeout(timer)
  }
}

globalThis.DEFAULT_CHAT_BLOCKED_KEYWORDS = [...CHAT_AI_SUPPORT_DEFAULT_BLOCKED_KEYWORDS]

globalThis.DEFAULT_CHAT_AI_RULES = CHAT_AI_SUPPORT_DEFAULT_RULE_LINES.join('\n')

globalThis.REQUIRED_CHAT_AI_FORBIDDEN_PATTERNS = [...CHAT_AI_SUPPORT_DEFAULT_FORBIDDEN_PATTERNS]

globalThis.DEFAULT_CHAT_AI_FORBIDDEN_PATTERNS = REQUIRED_CHAT_AI_FORBIDDEN_PATTERNS.join('\n')

function mergeRequiredChatAiForbiddenPatterns(value, limit = 200) {
  // Luật cứng luôn được chèn lại để AI không vô tình nhắc tên sàn hoặc thương hiệu shop.
  return normalizeRuleLineList([
    ...REQUIRED_CHAT_AI_FORBIDDEN_PATTERNS,
    ...(Array.isArray(value) ? value : normalizeRuleLineList(value))
  ], limit)
}

globalThis.DEFAULT_CHAT_AI_REVIEW_TRIGGERS = CHAT_AI_SUPPORT_DEFAULT_REVIEW_TRIGGERS.join('\n')

globalThis.CHAT_AI_AUTO_REPLY_HOLD_REPLY = 'Dạ shop đã nhận thông tin của mình. Trường hợp này cần nhân viên kiểm tra kỹ theo dữ liệu đơn và chính sách của sàn, shop sẽ phản hồi lại mình tại đây sau khi kiểm tra ạ.'

globalThis.CHAT_AI_AUTO_REPLY_MODES = new Set(['off', 'dry_run', 'live'])

globalThis.CHAT_AI_AUTO_REPLY_DEFAULT_PLATFORMS = ['shopee']

Object.assign(globalThis, {
  json,
  cleanText,
  errorMessage,
  safeJsonParse,
  valueAt,
  firstText,
  simpleHash,
  stripJsonFence,
  limitText,
  normalizeKeywordText,
  normalizeKeywordList,
  normalizeRuleLineList,
  mergeRequiredChatAiRules,
  normalizeQuickReplies,
  getGeminiChatKeys,
  rotateGeminiChatKeys,
  advanceGeminiChatKeyCursor,
  requestGeminiGenerateContent,
  mergeRequiredChatAiForbiddenPatterns
})
