import { ensureChatCoreTables } from './conversation-core.js'
import { cleanText, normalizeChatMessage, safeJsonParse } from './message-normalize.js'

const DEFAULT_CORE_API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const CORE_TIMEOUT_MS = 3500
const CONTACT_CHANNELS = new Set(['shopee', 'lazada', 'tiktok', 'facebook', 'zalo'])
const PHONE_PATTERN = /(?:\+?84|0)(?:[\s().-]*\d){8,10}/
const ADDRESS_PATTERN = /\b(đường|duong|phường|phuong|xã|xa|quận|quan|huyện|huyen|tỉnh|tinh|thành phố|thanh pho|tp|ấp|ap|thôn|thon|ngõ|ngo|hẻm|hem|số nhà|so nha|khu phố|khu pho|thị trấn|thi tran)\b/iu
const CONTACT_LABEL_PATTERN = /(?:sđt|sdt|phone|địa\s*chỉ|dia\s*chi|address|dc|tên|ten|người\s*nhận|nguoi\s*nhan|họ\s*tên|ho\s*ten)/iu
const NAME_LABEL_PATTERN = /(?:tên|ten|người\s*nhận|nguoi\s*nhan|họ\s*tên|ho\s*ten)\s*[:：-]/iu
const PROMO_NOISE_PATTERN = /(?:ưu\s*đãi|uu\s*dai|khuyến\s*mãi|khuyen\s*mai|quà\s*tặng|qua\s*tang|giảm\s*giá|giam\s*gia|deal|voucher|store\s*detailing|chương\s*trình|chuong\s*trinh|dịch\s*vụ|dich\s*vu|sửa\s*chữa|sua\s*chua|mobile|hotline|thay\s*màn\s*hình|thay\s*man\s*hinh|ép\s*kính|ep\s*kinh|thay\s*pin)/iu
const ZALO_BUSINESS_BROADCAST_PATTERN = /(?:công\s*ty|cong\s*ty|chi\s*nhánh|chi\s*nhanh|thời\s*gian\s*làm\s*việc|thoi\s*gian\s*lam\s*viec|quý\s*khách|quy\s*khach|phục\s*vụ|phuc\s*vu)/iu

function coreApiBase(env = {}) {
  return cleanText(env.SHOP_CORE_API_BASE || env.CORE_API_BASE || env.SHOPHUYVAN_CORE_API_BASE || DEFAULT_CORE_API_BASE).replace(/\/+$/, '')
}

function bridgeSecret(env = {}) {
  return cleanText(env.CUSTOMER_CONTACT_BRIDGE_SECRET || env.SHOPEE_CHAT_BRIDGE_SECRET || env.LAZADA_CHAT_BRIDGE_SECRET)
}

function hasCustomerContactSignal(message = {}) {
  const text = cleanText(message.text || message.content || message.message)
  const hasPhone = PHONE_PATTERN.test(text)
  const hasAddress = ADDRESS_PATTERN.test(text)
  if (message.channel === 'zalo' && ZALO_BUSINESS_BROADCAST_PATTERN.test(text)) return false
  if (message.channel === 'zalo' && hasAddress && !NAME_LABEL_PATTERN.test(text) && !senderNameAppearsInText(message, text)) return false
  if (hasPhone && !hasAddress && text.length > 80 && !CONTACT_LABEL_PATTERN.test(text)) return false
  if (text.length > 350 && !CONTACT_LABEL_PATTERN.test(text)) return false
  if (text.length > 80 && PROMO_NOISE_PATTERN.test(text) && !CONTACT_LABEL_PATTERN.test(text)) return false
  return hasPhone || hasAddress
}

function searchTokens(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4)
}

function senderNameAppearsInText(message = {}, text = '') {
  const haystack = ` ${searchTokens(text).join(' ')} `
  return searchTokens(message.sender_name).some(token => haystack.includes(` ${token} `))
}

export function shouldForwardCustomerContactMessage(input = {}) {
  const message = normalizeChatMessage(input)
  if (message.sender_type !== 'customer') return false
  if (!CONTACT_CHANNELS.has(message.channel)) return false
  return hasCustomerContactSignal(message)
}

export function buildCustomerContactEvent(input = {}) {
  const message = normalizeChatMessage(input)
  return {
    channel: message.channel,
    platform: message.channel,
    shop_id: message.shop_id,
    conversation_id: message.conversation_id,
    customer_id: message.customer_id,
    sender_name: message.sender_name,
    text: message.text,
    order_id: message.order_id,
    platform_message_id: message.platform_message_id,
    message_id: message.id,
    sent_at: message.created_at,
    source: message.source || 'chat_core'
  }
}

export async function forwardCustomerContactFromChatMessage(env, input = {}) {
  if (env?.CUSTOMER_CONTACT_INGEST_DISABLED === 'true') return { ok: true, status: 'disabled' }
  if (!shouldForwardCustomerContactMessage(input)) return { ok: true, status: 'skipped', reason: 'no_contact_signal' }
  const secret = bridgeSecret(env)
  if (!secret) return { ok: false, status: 'skipped', reason: 'bridge_secret_missing' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('customer_contact_timeout'), CORE_TIMEOUT_MS)
  try {
    const fetcher = env.CORE_FETCH || fetch
    const response = await fetcher(`${coreApiBase(env)}/api/customers/marketplace/chat-ingest`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Chat-Bridge-Secret': secret
      },
      body: JSON.stringify({ event: buildCustomerContactEvent(input) }),
      cf: { cacheTtl: 0, cacheEverything: false }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.status === 'error') {
      return {
        ok: false,
        status: 'failed',
        error_code: cleanText(data.error || data.error_code || `core_http_${response.status}`)
      }
    }
    return { ok: true, status: 'forwarded', data }
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      error_code: error?.name === 'AbortError' ? 'customer_contact_timeout' : 'customer_contact_fetch_failed'
    }
  } finally {
    clearTimeout(timeout)
  }
}

function backfillWhere(filters = {}) {
  const clauses = [
    "m.sender_type = 'customer'",
    "m.status != 'deleted'",
    "m.channel IN ('shopee', 'lazada', 'tiktok', 'facebook', 'zalo')"
  ]
  const binds = []
  const channel = cleanText(filters.channel || filters.platform).toLowerCase()
  const shopId = cleanText(filters.shop_id || filters.shop)
  if (CONTACT_CHANNELS.has(channel)) {
    clauses.push('m.channel = ?')
    binds.push(channel)
  }
  if (shopId) {
    clauses.push('m.shop_id = ?')
    binds.push(shopId)
  }
  clauses.push("(m.text LIKE '%0%' OR m.text LIKE '%84%' OR LOWER(m.text) LIKE '%duong%' OR LOWER(m.text) LIKE '%phuong%' OR m.text LIKE '%đường%' OR m.text LIKE '%phường%')")
  return { sql: clauses.join(' AND '), binds }
}

export async function backfillCustomerContactsFromChat(env, options = {}) {
  await ensureChatCoreTables(env)
  if (!env?.DB) return { ok: false, error_code: 'chat_db_not_configured' }
  const limit = Math.min(Math.max(Number(options.limit || 200) || 200, 1), 500)
  const where = backfillWhere(options)
  const rows = await env.DB.prepare(`
    SELECT
      m.id, m.channel, m.shop_id, m.conversation_id, m.customer_id, m.sender_type, m.sender_name,
      m.text, m.attachments, m.status, m.platform_message_id, m.order_id, m.created_at, m.updated_at, m.source,
      c.customer_name AS conversation_customer_name,
      c.customer_id AS conversation_customer_id
    FROM chat_messages m
    LEFT JOIN chat_conversations c ON c.id = m.conversation_id
    WHERE ${where.sql}
    ORDER BY datetime(COALESCE(m.created_at, m.updated_at, '1970-01-01')) DESC, m.id DESC
    LIMIT ?
  `).bind(...where.binds, limit).all()
  let matched = 0
  let forwarded = 0
  let failed = 0
  let skipped = 0
  for (const row of rows.results || []) {
    const message = normalizeChatMessage({
      ...row,
      sender_name: row.sender_name || row.conversation_customer_name,
      customer_id: row.customer_id || row.conversation_customer_id,
      attachments: safeJsonParse(row.attachments, [])
    })
    if (!shouldForwardCustomerContactMessage(message)) {
      skipped += 1
      continue
    }
    matched += 1
    const result = await forwardCustomerContactFromChatMessage(env, message)
    if (result.ok && result.status === 'forwarded') forwarded += 1
    else if (result.status === 'skipped') skipped += 1
    else failed += 1
  }
  return {
    ok: failed === 0,
    scanned_messages: rows.results?.length || 0,
    matched,
    forwarded,
    skipped,
    failed
  }
}
