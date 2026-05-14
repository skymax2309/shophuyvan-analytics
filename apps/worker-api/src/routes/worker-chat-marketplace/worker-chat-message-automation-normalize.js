// NEO: Backend worker chat sàn - nhóm message-automation-normalize. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function normalizeApiChatTimestamp(value) {
  const raw = cleanText(value)
  if (!raw) return ''
  const number = Number(raw)
  if (Number.isFinite(number)) {
    if (number > 1000000000000) return new Date(number).toISOString()
    if (number > 1000000000) return new Date(number * 1000).toISOString()
  }
  return raw
}

function currentVnIsoTimestamp() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(new Date())
  const lookup = type => parts.find(part => part.type === type)?.value || ''
  const year = lookup('year')
  const month = lookup('month')
  const day = lookup('day')
  const hour = lookup('hour')
  const minute = lookup('minute')
  const second = lookup('second')
  if (!year || !month || !day || !hour || !minute || !second) return new Date().toISOString()
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`
}

function lazadaSessionListStartTime(days = 30) {
  const safeDays = Math.max(1, Number(days) || 30)
  // Lazada IM bắt buộc có start_time khi lấy session list; dùng mốc lùi theo mili giây để kéo cửa sổ hội thoại gần đây.
  return String(Date.now() - safeDays * 24 * 60 * 60 * 1000)
}

globalThis.TIKTOK_AUTOMATION_NOISE_EXACT = new Set([
  'shop huy van',
  'tin nhan truoc do',
  'danh sach trong',
  'chon hoi thoai de soan tra loi',
  'nhap tin nhan cua ban tai day',
  'bo loc',
  'tat ca',
  'da chi dinh',
  'chua chi dinh',
  'da chi dinh 8 chua chi dinh',
  'da chia se mot don hang',
  'da chia se mot don hang khach mua tiep',
  'an bo loc',
  'an doan chat da dong',
  'hien thi doan chat da dong',
  'kho van',
  'da giao hang',
  'da giao don hang',
  'tra hang hoan tien',
  'tra hang hoan',
  'voucher',
  'san pham',
  'don hang',
  'xac nhan don hang',
  'chao mung ban su dung tinh nang tro chuyen cua tiktok shop'
])

function parseRawPayloadObject(rawPayload) {
  if (!rawPayload) return {}
  if (typeof rawPayload === 'string') {
    const parsed = safeJsonParse(rawPayload, {})
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }
  if (typeof rawPayload === 'object' && !Array.isArray(rawPayload)) return rawPayload
  return {}
}

function tiktokAutomationRawSource(rawPayload) {
  const root = parseRawPayloadObject(rawPayload)
  const candidates = [
    root?.payload?.raw_payload?.source,
    root?.payload?.source,
    root?.raw_payload?.source,
    root?.message?.raw_payload?.source,
    root?.source
  ]
  for (const value of candidates) {
    const text = cleanText(value).toLowerCase()
    if (text) return text
  }
  return ''
}

function isTikTokMergedUiContent(normalized = '') {
  const text = cleanText(normalized)
  if (!text) return true
  const uiMarkers = [
    'khach gan day',
    'an bo loc',
    'an doan chat da dong',
    'hien thi doan chat da dong',
    'da chi dinh 8 chua chi dinh',
    'cuoc tro chuyen da duoc chi dinh',
    'cuoc tro chuyen chua duoc chi dinh'
  ]
  if (uiMarkers.some(marker => text.includes(marker))) return true
  if (text === 'da chia se mot don hang' || text === 'da chia se mot don hang khach mua tiep') return true
  // TikTok đôi lúc trả innerText của cả khung chat/list, không phải một bubble riêng.
  // Chặn các đoạn có dấu hiệu timeline/hội thoại bị nối để dữ liệu cũ bẩn cũng không hiện lại.
  if (text.includes('shop huy van da bat dau cuoc tro chuyen')) return true
  if (text.includes('da chia se mot don hang') && text.includes('khach mua tiep')) return true
  if (/^(?:[a-z0-9_.-]{3,}\s+)?\d{1,2}\s+\d{2}\s+da chia se mot don hang/.test(text) && text.length > 120) return true
  const conversationStarts = text.match(/\bshop huy van da bat dau cuoc tro chuyen\b/g) || []
  if (conversationStarts.length >= 1 && text.length > 160) return true
  // TikTok hay ghép toàn bộ card đơn + timeline thành một chuỗi dài. Chuỗi này không phải nội dung khách nhắn,
  // nhưng mã đơn sẽ được giữ riêng qua order-signal để panel Đơn hàng vẫn khớp đúng.
  const orderUiMarkers = [
    'da chia se mot don hang',
    'khach mua tiep',
    'id don hang',
    'id theo doi',
    'xac nhan don hang',
    'thong tin kho van',
    'trang thai don hang',
    'don hang lien quan'
  ]
  const orderUiHits = orderUiMarkers.reduce((count, marker) => count + (text.includes(marker) ? 1 : 0), 0)
  if (orderUiHits >= 2 && text.length > 80) return true
  if (text.includes('da chia se mot don hang') && /\b(?:hom qua|hom nay|\d{1,2}\s+\d{2})\b/.test(text) && text.length > 60) return true
  const recentCustomerMarkers = text.match(/\b(hom qua|hom nay)\s+shop huy van\b/g) || []
  return recentCustomerMarkers.length >= 2
}

function isTikTokAutomationNoiseContent(content, options = {}) {
  const text = cleanText(content)
  if (!text) return true
  const lowerText = text.toLowerCase()
  const normalized = normalizeKeywordText(text)
  if (!normalized) return true
  if (isTikTokMergedUiContent(normalized)) return true

  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return true
  if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(text)) return true
  if (/^(hom nay|hom qua)(?: \d{1,2}(?::\d{2}(?::\d{2})?|(?: \d{2}){1,2}))?$/.test(normalized)) return true
  if (/^(thu \w+|chu nhat)(?: \d{1,2}:\d{2}(?::\d{2})?)?$/.test(normalized)) return true
  if (/^thang \d{1,2} \d{1,2}\b/.test(normalized) && normalized.includes('da het thoi gian cho cuoc tro chuyen')) return true
  if (/^thang \d{1,2} \d{1,2}\b.*(xac nhan don hang|da giao don hang|da giao hang|da het thoi gian cho cuoc tro chuyen)/.test(normalized)) return true
  if (/^\d{1,2} \d{2}\s+shop .* da bat dau cuoc tro chuyen/.test(normalized)) return true
  if (/^(hom nay|hom qua)\s+\d{1,2}\s+\d{2}\s+shop .* da bat dau cuoc tro chuyen/.test(normalized)) return true
  if (/^\d{1,2} \d{2}\s+da het thoi gian cho cuoc tro chuyen/.test(normalized)) return true
  if (/^\d{1,2} \d{1,2} \d{2,4}\s+\d{1,2}\s+\d{2}\s+da het thoi gian cho cuoc tro chuyen/.test(normalized)) return true
  if (normalized.includes('da het thoi gian cho cuoc tro chuyen')) return true
  if (normalized.includes('tin nhan truoc do')) return true
  if (/^(thu \w+|chu nhat)\s+.*(xac nhan don hang|da giao don hang|da giao hang|da het thoi gian cho cuoc tro chuyen)/.test(normalized)) return true
  if (/^(da het thoi gian cho cuoc tro chuyen|cuoc tro chuyen chua duoc chi dinh|cuoc tro chuyen da duoc chi dinh|chi dinh cho|shop .* da bat dau cuoc tro chuyen)/.test(normalized)) {
    return true
  }
  if (TIKTOK_AUTOMATION_NOISE_EXACT.has(normalized)) return true
  const orderMetaSignals = [
    /id don hang/,
    /id theo doi/,
    /so dien thoai/,
    /dia chi/,
    /xac nhan don hang/,
    /da giao don hang/,
    /tra hang hoan tien/,
    /kho van/
  ]
  const orderMetaHits = orderMetaSignals.reduce((count, rule) => (rule.test(normalized) ? count + 1 : count), 0)
  if (orderMetaHits >= 2) return true
  if (/thong tin kho van/.test(normalized)) return true
  if (/xem chi tiet/.test(normalized) && /(id don hang|id theo doi|thong tin kho van|trang thai)/.test(normalized)) return true
  if (/^\d{1,2} \d{1,2} \d{4}\s+\d{1,2} \d{2}\s+shop /.test(normalized)) return true
  if (/(chung toi da gui don hang cua ban di|kien hang cua ban dang duoc giao den|don hang cua ban da ky nhan va giao den)/.test(normalized)) return true
  if (/shop huy van/.test(normalized) && /(da gui don hang cua ban di|don hang cua ban da ky nhan va giao den|kien hang cua ban dang duoc giao den)/.test(normalized)) return true

  const senderType = cleanText(options.senderType).toLowerCase()
  const rawSource = tiktokAutomationRawSource(options.rawPayload)
  const fromThreadDom = rawSource.includes('tiktok_thread_dom')
  const fromShop = senderType === 'shop'
  const maybeOrderMeta = fromShop || fromThreadDom
  if (!maybeOrderMeta) return false

  if (/^id\s+don\b.*\d{6,}/.test(lowerText)) return true
  if (/^id\s+theo\b.*\d{6,}/.test(lowerText)) return true
  if (/^(id don hang|id theo doi)\s*[a-z0-9-]{6,}/.test(normalized)) return true
  if (/^(so dien thoai|dia chi)\b/.test(normalized)) return true
  if (/^(don hang \d+\s+san pham(?:\s+voucher)?|don hang \d+)\b/.test(normalized)) return true
  if (/\b\d+\s+mat hang\b/.test(normalized)) return true
  if (/\bxem chi tiet\b/.test(normalized)) return true
  if (/(xac nhan don hang|kho van|da giao don hang|da giao hang|tra hang hoan tien|id don hang|id theo doi|so dien thoai|dia chi)/.test(normalized)) return true
  if (/cam on ban da dat hang hay xac nhan dia chi giao hang cua ban da chinh xac/.test(normalized)) return true
  return false
}

function isAutomationNoiseContent(content, platform = '', options = {}) {
  const text = cleanText(content)
  if (!text) return true
  const normalized = normalizeKeywordText(text)
  if (!normalized) return true
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return true
  if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(text)) return true
  if (platform === 'tiktok') return isTikTokAutomationNoiseContent(text, options)
  return false
}

function tiktokAutomationSourcePriority(message = {}) {
  const source = tiktokAutomationRawSource(message.raw_payload)
  if (source.includes('tiktok_thread_dom')) return 3
  if (source.includes('tiktok_preview_row')) return 1
  return 2
}

function tiktokAutomationMediaMarker(message = {}) {
  const mediaItems = normalizeMediaItems(message.media_items, message.raw_payload)
  for (const item of mediaItems) {
    const marker = cleanText(item?.order_sn || item?.item_id || item?.name || item?.url)
    if (marker) return marker
  }
  return ''
}

function tiktokAutomationMessageFingerprint(message = {}) {
  if (cleanText(message.platform).toLowerCase() !== 'tiktok') return ''
  const conversationId = cleanText(message.conversation_id)
  const senderType = cleanText(message.sender_type).toLowerCase() || 'buyer'
  const contentKey = normalizeKeywordText(message.content)
  const mediaMarker = normalizeKeywordText(tiktokAutomationMediaMarker(message))
  if (!conversationId) return ''
  if (!contentKey && !mediaMarker) return ''
  // TikTok browser fallback thường không có timestamp ổn định cho từng bubble, nên không dùng sent_at để khóa trùng.
  return [
    'tiktok',
    conversationId,
    senderType,
    contentKey || mediaMarker,
    mediaMarker
  ].join('|')
}

function dedupeTikTokAutomationMessages(messages = []) {
  if (!Array.isArray(messages) || !messages.length) return { messages: [], skipped: 0 }
  const threadConversationIds = new Set(
    messages
      .filter(item => tiktokAutomationSourcePriority(item) >= 3)
      .map(item => cleanText(item.conversation_id))
      .filter(Boolean)
  )
  const winners = new Map()
  let skipped = 0
  messages.forEach((message, index) => {
    const conversationId = cleanText(message.conversation_id)
    const sourcePriority = tiktokAutomationSourcePriority(message)
    if (threadConversationIds.has(conversationId) && sourcePriority === 1) {
      skipped += 1
      return
    }
    const fingerprint = tiktokAutomationMessageFingerprint(message)
    if (!fingerprint) {
      winners.set(`fallback|${index}`, { message, index, fingerprint: '' })
      return
    }
    const existing = winners.get(fingerprint)
    if (!existing) {
      winners.set(fingerprint, { message, index, fingerprint })
      return
    }
    if (sourcePriority > tiktokAutomationSourcePriority(existing.message)) {
      winners.set(fingerprint, { message, index, fingerprint })
    }
    skipped += 1
  })
  const dedupedMessages = [...winners.values()]
    .sort((left, right) => {
      const leftTime = Date.parse(cleanText(left.message.sent_at) || '') || 0
      const rightTime = Date.parse(cleanText(right.message.sent_at) || '') || 0
      if (leftTime !== rightTime) return leftTime - rightTime
      return left.index - right.index
    })
    .map(item => item.message)
  return { messages: dedupedMessages, skipped }
}

function chatSqlEpochSeconds(valueExpr) {
  const value = `TRIM(COALESCE(${valueExpr}, ''))`
  return `
    CASE
      WHEN ${value} = '' THEN NULL
      WHEN ${value} GLOB '[0-9][0-9]*' THEN CASE
        WHEN CAST(${value} AS INTEGER) > 1000000000000 THEN CAST(CAST(${value} AS INTEGER) / 1000 AS INTEGER)
        WHEN CAST(${value} AS INTEGER) > 1000000000 THEN CAST(${value} AS INTEGER)
        ELSE CAST(strftime('%s', ${value}) AS INTEGER)
      END
      WHEN ${value} LIKE '%Z' OR ${value} LIKE '%+__:__' OR ${value} LIKE '%-__:__' THEN strftime('%s', ${value})
      WHEN ${value} LIKE '____-__-__ __:__:%' THEN strftime('%s', replace(${value}, ' ', 'T') || '+07:00')
      WHEN ${value} LIKE '____-__-__T%' THEN strftime('%s', ${value} || '+07:00')
      ELSE strftime('%s', ${value})
    END
  `
}

function safeJsonStringify(value, fallback = '[]') {
  try {
    return JSON.stringify(value ?? [])
  } catch {
    return fallback
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const list = Array.isArray(items) ? items : []
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, list.length || 1))
  const output = new Array(list.length)
  let index = 0
  async function worker() {
    while (index < list.length) {
      const current = index++
      output[current] = await mapper(list[current], current)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return output
}

function mediaKindFromMime(mimeType = '', fallback = '') {
  const mime = cleanText(mimeType).toLowerCase()
  const type = cleanText(fallback).toLowerCase()
  if (type.includes('order')) return 'order'
  if (type.includes('product') || type.includes('item')) return 'product'
  if (type.includes('sticker')) return 'image'
  if (mime.startsWith('image/') || type.includes('image') || type.includes('photo')) return 'image'
  if (mime.startsWith('video/') || type.includes('video')) return 'video'
  if (mime.startsWith('audio/') || type.includes('audio')) return 'audio'
  return 'file'
}

Object.assign(globalThis, {
  normalizeApiChatTimestamp,
  currentVnIsoTimestamp,
  lazadaSessionListStartTime,
  parseRawPayloadObject,
  tiktokAutomationRawSource,
  isTikTokMergedUiContent,
  isTikTokAutomationNoiseContent,
  isAutomationNoiseContent,
  tiktokAutomationSourcePriority,
  tiktokAutomationMediaMarker,
  tiktokAutomationMessageFingerprint,
  dedupeTikTokAutomationMessages,
  chatSqlEpochSeconds,
  safeJsonStringify,
  mapWithConcurrency,
  mediaKindFromMime
})
