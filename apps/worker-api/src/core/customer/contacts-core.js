const CP1252_REVERSE = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f]
])

function repairMojibakeText(value) {
  const text = String(value ?? '')
  if (!/(?:\u00c3|\u00c4|\u00c5|\u00c6|\u00c2|\u00cc|\u00e1\u00ba|\u00e1\u00bb)/.test(text)) return text
  try {
    const bytes = new Uint8Array([...text].map(character => {
      const code = character.codePointAt(0)
      if (code <= 255) return code
      if (CP1252_REVERSE.has(code)) return CP1252_REVERSE.get(code)
      throw new Error('unsupported_mojibake_character')
    }))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return text
  }
}

function cleanText(value) {
  return repairMojibakeText(value).replace(/\u00a0/g, ' ').trim()
}

function hasMaskedMarketplaceText(value) {
  return cleanText(value).includes('*')
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text && !hasMaskedMarketplaceText(text)) return text
  }
  return ''
}

function parseJsonSafe(value, fallback = {}) {
  if (value && typeof value === 'object') return value
  const text = cleanText(value)
  if (!text) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function digitsOnly(value) {
  return cleanText(value).replace(/[^\d]/g, '')
}

export function normalizeVietnamPhone(value) {
  if (hasMaskedMarketplaceText(value)) return ''
  const digits = digitsOnly(value)
  if (!digits) return ''
  if (digits.startsWith('840') && digits.length >= 11) return `0${digits.slice(3)}`
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`
  return digits
}

function phoneLast4(value) {
  const normalized = normalizeVietnamPhone(value)
  return normalized ? normalized.slice(-4) : ''
}

function contactKey(payload = {}) {
  const platform = cleanText(payload.platform).toLowerCase()
  const shop = cleanText(payload.shop).toLowerCase()
  const phone = normalizeVietnamPhone(payload.phone || payload.customer_phone)
  if (phone) return `${platform}|${shop}|phone:${phone}`
  const name = firstText(payload.recipient_name, payload.customer_name, payload.buyer_username).toLowerCase()
  const address = cleanText(payload.address_text || payload.shipping_address).toLowerCase()
  const order = cleanText(payload.source_order_id || payload.order_id)
  return `${platform}|${shop}|${name || 'unknown'}|${address || order}`
}

function contactOrderId(row = {}) {
  return firstText(row.source_order_id, row.last_order_id)
}

function contactOrderKey(contactKey, orderId) {
  return `${contactKey}\u0001${orderId}`
}

function normalizeContactPayload(payload = {}) {
  const phone = firstText(payload.phone, payload.customer_phone)
  const now = new Date().toISOString()
  return {
    contact_key: cleanText(payload.contact_key) || contactKey(payload),
    platform: cleanText(payload.platform).toLowerCase(),
    shop: cleanText(payload.shop),
    source: cleanText(payload.source),
    source_detail: cleanText(payload.source_detail),
    source_order_id: firstText(payload.source_order_id, payload.order_id),
    customer_name: firstText(payload.customer_name, payload.recipient_name, payload.buyer_username),
    buyer_username: cleanText(payload.buyer_username),
    buyer_id: cleanText(payload.buyer_id),
    recipient_name: firstText(payload.recipient_name, payload.customer_name),
    phone,
    phone_normalized: normalizeVietnamPhone(phone),
    phone_last4: phoneLast4(phone),
    address_text: firstText(payload.address_text, payload.shipping_address),
    province: cleanText(payload.province),
    district: cleanText(payload.district),
    ward: cleanText(payload.ward),
    country: cleanText(payload.country || 'VN'),
    payment_method: cleanText(payload.payment_method),
    last_order_id: firstText(payload.last_order_id, payload.source_order_id, payload.order_id),
    total_revenue: Number(payload.total_revenue ?? payload.revenue ?? 0) || 0,
    consent_status: cleanText(payload.consent_status || 'unknown'),
    contact_status: cleanText(payload.contact_status || 'not_contacted'),
    facebook_audience_status: cleanText(payload.facebook_audience_status || 'not_exported'),
    zalo_status: cleanText(payload.zalo_status || 'not_connected'),
    first_seen_at: cleanText(payload.first_seen_at || payload.order_date || now),
    last_seen_at: cleanText(payload.last_seen_at || payload.order_date || now),
    raw_payload: typeof payload.raw_payload === 'string'
      ? payload.raw_payload.slice(0, 12000)
      : JSON.stringify(payload.raw_payload || payload).slice(0, 12000)
  }
}

export async function ensureCustomerContactTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_customer_contacts (
      contact_key TEXT PRIMARY KEY,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      source TEXT DEFAULT '',
      source_detail TEXT DEFAULT '',
      source_order_id TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      buyer_username TEXT DEFAULT '',
      buyer_id TEXT DEFAULT '',
      recipient_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      phone_normalized TEXT DEFAULT '',
      phone_last4 TEXT DEFAULT '',
      address_text TEXT DEFAULT '',
      province TEXT DEFAULT '',
      district TEXT DEFAULT '',
      ward TEXT DEFAULT '',
      country TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      last_order_id TEXT DEFAULT '',
      order_count INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      consent_status TEXT DEFAULT 'unknown',
      contact_status TEXT DEFAULT 'not_contacted',
      facebook_audience_status TEXT DEFAULT 'not_exported',
      zalo_status TEXT DEFAULT 'not_connected',
      first_seen_at TEXT DEFAULT '',
      last_seen_at TEXT DEFAULT '',
      last_synced_at TEXT DEFAULT '',
      raw_payload TEXT DEFAULT '{}'
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_customer_contact_orders (
      contact_key TEXT NOT NULL,
      source_order_id TEXT NOT NULL,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      first_seen_at TEXT DEFAULT '',
      last_seen_at TEXT DEFAULT '',
      revenue REAL DEFAULT 0,
      raw_payload TEXT DEFAULT '{}',
      PRIMARY KEY (contact_key, source_order_id)
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_marketplace_contacts_scope ON marketplace_customer_contacts(platform, shop, last_seen_at DESC)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_marketplace_contacts_phone ON marketplace_customer_contacts(phone_normalized)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_marketplace_contacts_source_order ON marketplace_customer_contacts(source_order_id)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_marketplace_contact_orders_scope ON marketplace_customer_contact_orders(platform, shop, last_seen_at DESC)`).run()
  await env.DB.prepare(`
    INSERT OR IGNORE INTO marketplace_customer_contact_orders (
      contact_key, source_order_id, platform, shop, first_seen_at, last_seen_at, revenue, raw_payload
    )
    SELECT
      contact_key,
      COALESCE(NULLIF(source_order_id, ''), NULLIF(last_order_id, '')),
      platform,
      shop,
      first_seen_at,
      last_seen_at,
      total_revenue,
      raw_payload
    FROM marketplace_customer_contacts
    WHERE COALESCE(NULLIF(source_order_id, ''), NULLIF(last_order_id, '')) IS NOT NULL
  `).run()
}

export async function upsertMarketplaceCustomerContact(env, payload = {}) {
  await ensureCustomerContactTables(env)
  const row = normalizeContactPayload(payload)
  const validation = validateMarketplaceCustomerContact(row)
  if (validation) return validation
  const orderId = contactOrderId(row)
  const existingOrder = orderId
    ? await env.DB.prepare(`
      SELECT 1
      FROM marketplace_customer_contact_orders
      WHERE contact_key = ? AND source_order_id = ?
      LIMIT 1
    `).bind(row.contact_key, orderId).first()
    : null
  await env.DB.batch(buildMarketplaceContactStatements(env, row, Boolean(orderId && !existingOrder)))
  return { status: 'ok', contact_key: row.contact_key, platform: row.platform, shop: row.shop }
}

function validateMarketplaceCustomerContact(row) {
  const hasFullIdentity = Boolean(row.customer_name || row.buyer_username || row.buyer_id)
  const source = cleanText(row.source).toLowerCase()
  const isChatSource = source.includes('chat_message')
  const hasFullContact = isChatSource
    ? Boolean(row.phone_normalized || row.address_text)
    : Boolean(row.phone_normalized && row.address_text)
  if (!row.platform || !row.shop || !hasFullIdentity || !hasFullContact) {
    return { status: 'skipped', reason: 'missing_contact_identity' }
  }
  return null
}

function buildMarketplaceContactStatements(env, row, shouldAppendOrder = false) {
  const orderId = contactOrderId(row)
  const statements = [
    env.DB.prepare(`
    INSERT INTO marketplace_customer_contacts (
      contact_key, platform, shop, source, source_detail, source_order_id,
      customer_name, buyer_username, buyer_id, recipient_name,
      phone, phone_normalized, phone_last4, address_text, province, district, ward, country,
      payment_method, last_order_id, order_count, total_revenue,
      consent_status, contact_status, facebook_audience_status, zalo_status,
      first_seen_at, last_seen_at, last_synced_at, raw_payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), ?)
    ON CONFLICT(contact_key) DO UPDATE SET
      source = CASE WHEN excluded.last_seen_at >= last_seen_at THEN excluded.source ELSE source END,
      source_detail = CASE WHEN excluded.last_seen_at >= last_seen_at THEN excluded.source_detail ELSE source_detail END,
      source_order_id = CASE WHEN excluded.last_seen_at >= last_seen_at THEN excluded.source_order_id ELSE source_order_id END,
      customer_name = CASE WHEN excluded.customer_name != '' THEN excluded.customer_name ELSE customer_name END,
      buyer_username = CASE WHEN excluded.buyer_username != '' THEN excluded.buyer_username ELSE buyer_username END,
      buyer_id = CASE WHEN excluded.buyer_id != '' THEN excluded.buyer_id ELSE buyer_id END,
      recipient_name = CASE WHEN excluded.recipient_name != '' THEN excluded.recipient_name ELSE recipient_name END,
      phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE phone END,
      phone_normalized = CASE WHEN excluded.phone_normalized != '' THEN excluded.phone_normalized ELSE phone_normalized END,
      phone_last4 = CASE WHEN excluded.phone_last4 != '' THEN excluded.phone_last4 ELSE phone_last4 END,
      address_text = CASE WHEN excluded.address_text != '' THEN excluded.address_text ELSE address_text END,
      province = CASE WHEN excluded.province != '' THEN excluded.province ELSE province END,
      district = CASE WHEN excluded.district != '' THEN excluded.district ELSE district END,
      ward = CASE WHEN excluded.ward != '' THEN excluded.ward ELSE ward END,
      country = CASE WHEN excluded.country != '' THEN excluded.country ELSE country END,
      payment_method = CASE WHEN excluded.payment_method != '' THEN excluded.payment_method ELSE payment_method END,
      last_order_id = CASE WHEN excluded.last_seen_at >= last_seen_at THEN excluded.last_order_id ELSE last_order_id END,
      order_count = CASE WHEN ? THEN COALESCE(order_count, 0) + 1 ELSE order_count END,
      total_revenue = CASE WHEN ? THEN COALESCE(total_revenue, 0) + excluded.total_revenue ELSE total_revenue END,
      first_seen_at = CASE
        WHEN first_seen_at = '' THEN excluded.first_seen_at
        WHEN excluded.first_seen_at != '' AND excluded.first_seen_at < first_seen_at THEN excluded.first_seen_at
        ELSE first_seen_at
      END,
      last_seen_at = CASE WHEN excluded.last_seen_at > last_seen_at THEN excluded.last_seen_at ELSE last_seen_at END,
      last_synced_at = excluded.last_synced_at,
      raw_payload = CASE WHEN excluded.last_seen_at >= last_seen_at THEN excluded.raw_payload ELSE raw_payload END
  `).bind(
    row.contact_key,
    row.platform,
    row.shop,
    row.source,
    row.source_detail,
    row.source_order_id,
    row.customer_name,
    row.buyer_username,
    row.buyer_id,
    row.recipient_name,
    row.phone,
    row.phone_normalized,
    row.phone_last4,
    row.address_text,
    row.province,
    row.district,
    row.ward,
    row.country,
    row.payment_method,
    row.last_order_id,
    orderId ? 1 : 0,
    row.total_revenue,
    row.consent_status,
    row.contact_status,
    row.facebook_audience_status,
    row.zalo_status,
    row.first_seen_at,
    row.last_seen_at,
    row.raw_payload,
    shouldAppendOrder ? 1 : 0,
    shouldAppendOrder ? 1 : 0
  )
  ]
  if (orderId) {
    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_customer_contact_orders (
        contact_key, source_order_id, platform, shop, first_seen_at, last_seen_at, revenue, raw_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(contact_key, source_order_id) DO UPDATE SET
        last_seen_at = CASE WHEN excluded.last_seen_at > last_seen_at THEN excluded.last_seen_at ELSE last_seen_at END,
        revenue = CASE WHEN excluded.revenue != 0 THEN excluded.revenue ELSE revenue END,
        raw_payload = CASE WHEN excluded.last_seen_at >= last_seen_at THEN excluded.raw_payload ELSE raw_payload END
    `).bind(
      row.contact_key,
      orderId,
      row.platform,
      row.shop,
      row.first_seen_at,
      row.last_seen_at,
      row.total_revenue,
      row.raw_payload
    ))
  }
  return statements
}

async function loadExistingContactOrderKeys(env, pairs = []) {
  const existing = new Set()
  const uniquePairs = []
  const seen = new Set()
  for (const pair of pairs) {
    const key = contactOrderKey(pair.contact_key, pair.source_order_id)
    if (seen.has(key)) continue
    seen.add(key)
    uniquePairs.push(pair)
  }
  for (let i = 0; i < uniquePairs.length; i += 40) {
    const chunk = uniquePairs.slice(i, i + 40)
    const clauses = chunk.map(() => '(contact_key = ? AND source_order_id = ?)')
    const binds = chunk.flatMap(pair => [pair.contact_key, pair.source_order_id])
    const rows = await env.DB.prepare(`
      SELECT contact_key, source_order_id
      FROM marketplace_customer_contact_orders
      WHERE ${clauses.join(' OR ')}
    `).bind(...binds).all()
    for (const row of rows.results || []) {
      existing.add(contactOrderKey(row.contact_key, row.source_order_id))
    }
  }
  return existing
}

function addressTextFromLazada(order = {}) {
  const address = order.address_shipping || order.AddressShipping || {}
  return [
    address.address1,
    address.address2,
    address.address3,
    address.address4,
    address.address5,
    address.city,
    address.post_code,
    address.country
  ].map(cleanText).filter(Boolean).join(', ')
}

export function marketplaceContactFromLazadaOrder(shop = {}, order = {}) {
  const address = order.address_shipping || order.AddressShipping || {}
  const shopName = firstText(shop.shop_name, shop.user_name, shop.api_shop_id)
  const name = firstText(order.customer_first_name, order.customer_name, address.first_name, address.name)
  const phone = firstText(address.phone, address.Phone, address.phone2, address.Phone2)
  return normalizeContactPayload({
    platform: 'lazada',
    shop: shopName,
    source: 'lazada_open_platform:/orders/get',
    source_detail: 'GetOrders/GetOrder address_shipping',
    source_order_id: cleanText(order.order_id),
    customer_name: name || 'Khách Lazada',
    recipient_name: name,
    phone,
    address_text: addressTextFromLazada(order),
    province: firstText(address.address4, address.state, address.region),
    district: firstText(address.address3, address.city),
    ward: firstText(address.address2),
    country: firstText(address.country, 'VN'),
    payment_method: firstText(order.payment_method, order.payment_type),
    order_date: firstText(order.created_at, order.created_time, order.create_time),
    revenue: Number(order.price || order.order_total || order.total_amount || 0) || 0,
    raw_payload: { order }
  })
}

const CHAT_ADDRESS_KEYWORDS = /\b(đường|duong|phường|phuong|xã|xa|quận|quan|huyện|huyen|tỉnh|tinh|thành phố|thanh pho|tp|ấp|ap|thôn|thon|ngõ|ngo|hẻm|hem|số nhà|so nha|khu phố|khu pho|thị trấn|thi tran)\b/iu
const CHAT_PHONE_PATTERN = /(?:\+?84|0)(?:[\s().-]*\d){8,10}/g
const CHAT_CONTACT_LABELS = /(?:sđt|sdt|phone|địa\s*chỉ|dia\s*chi|address|dc|tên|ten|người\s*nhận|nguoi\s*nhan|họ\s*tên|ho\s*ten)/iu
const CHAT_PROMO_NOISE = /(?:ưu\s*đãi|uu\s*dai|khuyến\s*mãi|khuyen\s*mai|quà\s*tặng|qua\s*tang|giảm\s*giá|giam\s*gia|deal|voucher|store\s*detailing|chương\s*trình|chuong\s*trinh|dịch\s*vụ|dich\s*vu|sửa\s*chữa|sua\s*chua|mobile|hotline|thay\s*màn\s*hình|thay\s*man\s*hinh|ép\s*kính|ep\s*kinh|thay\s*pin)/iu

function normalizeChatLine(value) {
  return cleanText(value)
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, '')
}

export function extractVietnamPhoneFromChatText(value) {
  const text = cleanText(value)
  if (!text || hasMaskedMarketplaceText(text)) return ''
  const matches = text.match(CHAT_PHONE_PATTERN) || []
  for (const match of matches) {
    const phone = normalizeVietnamPhone(match)
    if (/^0[2-9]\d{8,9}$/.test(phone)) return phone
  }
  return ''
}

function extractAddressFromChatText(value, phone = '') {
  const text = cleanText(value)
  if (!text || hasMaskedMarketplaceText(text)) return ''
  const candidates = []
  if (phone) {
    const phoneDigits = digitsOnly(phone)
    const phoneMatch = text.match(CHAT_PHONE_PATTERN)?.find(item => normalizeVietnamPhone(item) === phone || normalizeVietnamPhone(item) === phoneDigits)
    const index = phoneMatch ? text.indexOf(phoneMatch) : -1
    if (index >= 0) candidates.push(text.slice(index + phoneMatch.length))
  }
  candidates.push(...text.split(/\n|[|;]/))
  for (const raw of candidates) {
    const line = cleanText(raw)
    const candidate = normalizeChatLine(line
      .replace(CHAT_PHONE_PATTERN, ' ')
      .replace(/(?:sđt|sdt|điện\s*thoại|dien\s*thoai|phone)\s*[:：-]?\s*/giu, ' ')
      .replace(/(?:tên|ten|người\s*nhận|nguoi\s*nhan|họ\s*tên|ho\s*ten)\s*[:：-]?\s*[^\n,|;]{2,80}/giu, ' ')
      .replace(/^(địa\s*chỉ|dia\s*chi|address|dc)\s*[:：-]?\s*/iu, ''))
    if (candidate.length > 260 && !CHAT_CONTACT_LABELS.test(line)) continue
    if (candidate.length >= 12 && CHAT_ADDRESS_KEYWORDS.test(candidate)) return candidate.slice(0, 260)
  }
  return ''
}

function extractNameFromChatText(value) {
  const text = cleanText(value)
  const match = text.match(/(?:tên|ten|người\s*nhận|nguoi\s*nhan|họ\s*tên|ho\s*ten)\s*[:：-]\s*([^\n,|;]{2,80})/iu)
  return normalizeChatLine(match?.[1])
}

function isLikelyChatCustomerContactEvent(event = {}, contact = {}) {
  const text = cleanText(event.text || event.content || event.message)
  if (!text) return Boolean(contact.phone_normalized || contact.address_text)
  if (contact.phone_normalized && !contact.address_text && text.length > 80 && !CHAT_CONTACT_LABELS.test(text)) return false
  if (text.length > 350 && !CHAT_CONTACT_LABELS.test(text)) return false
  if (text.length > 80 && CHAT_PROMO_NOISE.test(text) && !CHAT_CONTACT_LABELS.test(text)) return false
  return Boolean(contact.phone_normalized || contact.address_text)
}

export function marketplaceContactFromChatEvent(event = {}) {
  const channel = cleanText(event.channel || event.platform).toLowerCase()
  const phone = firstText(event.phone, event.customer_phone) || extractVietnamPhoneFromChatText(event.text || event.content || event.message)
  const address = firstText(event.address_text, event.shipping_address) || extractAddressFromChatText(event.text || event.content || event.message, phone)
  const shop = firstText(event.shop, event.shop_id)
  const buyerId = firstText(event.buyer_id, event.customer_id)
  const chatContactKey = channel && shop && buyerId && phone
    ? `${channel}|${shop.toLowerCase()}|buyer:${buyerId.toLowerCase()}|phone:${phone}`
    : ''
  const customerName = firstText(
    event.recipient_name,
    event.customer_name,
    event.sender_name,
    event.buyer_username,
    extractNameFromChatText(event.text || event.content || event.message)
  )
  return normalizeContactPayload({
    contact_key: chatContactKey,
    platform: channel,
    shop,
    source: `chat_message:${channel || 'unknown'}`,
    source_detail: firstText(event.source_detail, `Chat/CSKH ${channel || 'unknown'} message extraction`),
    source_order_id: firstText(event.order_id, event.source_order_id),
    customer_name: customerName,
    recipient_name: customerName,
    buyer_username: cleanText(event.buyer_username),
    buyer_id: buyerId,
    phone,
    address_text: address,
    order_date: firstText(event.sent_at, event.created_at, event.last_seen_at),
    consent_status: 'unknown',
    contact_status: 'not_contacted',
    raw_payload: {
      channel,
      shop,
      conversation_id: cleanText(event.conversation_id),
      platform_message_id: cleanText(event.platform_message_id || event.message_id),
      customer_id: cleanText(event.customer_id || event.buyer_id),
      sender_name: cleanText(event.sender_name),
      order_id: cleanText(event.order_id),
      text: cleanText(event.text || event.content || event.message).slice(0, 1200),
      source: cleanText(event.source)
    }
  })
}

export async function upsertMarketplaceCustomerContactFromChat(env, event = {}) {
  const contact = marketplaceContactFromChatEvent(event)
  if (!isLikelyChatCustomerContactEvent(event, contact)) {
    return { status: 'skipped', reason: 'chat_contact_signal_not_safe' }
  }
  return upsertMarketplaceCustomerContact(env, contact)
}

function contactFromOrderCore(row = {}) {
  const raw = parseJsonSafe(row.fee_raw_data, {})
  const detail = raw.tiktok_seller_center_detail || {}
  const lazadaOrder = raw.order || {}
  const trackingRaw = parseJsonSafe(row.tracking_raw_data, {})
  if (cleanText(row.platform).toLowerCase() === 'lazada' && Object.keys(lazadaOrder).length) {
    return marketplaceContactFromLazadaOrder({ shop_name: row.shop }, lazadaOrder)
  }
  return normalizeContactPayload({
    platform: row.platform,
    shop: row.shop,
    source: firstText(row.fee_source, detail.source, 'orders_v2'),
    source_detail: cleanText(row.source_detail),
    source_order_id: row.order_id,
    customer_name: firstText(row.customer_name, detail.customer_name),
    buyer_username: firstText(row.buyer_username, detail.buyer_username),
    buyer_id: firstText(row.buyer_id, detail.buyer_id),
    recipient_name: firstText(detail.recipient_name, row.customer_name),
    phone: firstText(row.customer_phone, detail.customer_phone),
    address_text: firstText(detail.shipping_address, trackingRaw.shipping_address),
    payment_method: firstText(row.payment_method, detail.payment_method, raw.payment_method),
    order_date: row.order_date,
    revenue: Number(row.revenue || 0) || 0,
    raw_payload: {
      order_id: row.order_id,
      source: firstText(row.fee_source, 'orders_v2'),
      tiktok_seller_center_detail: detail,
      tracking_raw_data: trackingRaw
    }
  })
}

export async function syncCustomerContactsFromOrders(env, options = {}) {
  await ensureCustomerContactTables(env)
  const clauses = ['LOWER(COALESCE(o.platform, \'\')) IN (\'tiktok\', \'lazada\')']
  const binds = []
  const platform = cleanText(options.platform).toLowerCase()
  const shop = cleanText(options.shop)
  if (['tiktok', 'lazada'].includes(platform)) {
    clauses.push('LOWER(COALESCE(o.platform, \'\')) = ?')
    binds.push(platform)
  }
  if (shop) {
    clauses.push('LOWER(TRIM(COALESCE(o.shop, \'\'))) = LOWER(TRIM(?))')
    binds.push(shop)
  }
  const limit = Math.min(Math.max(Number(options.limit || 150) || 150, 1), 150)
  const rows = await env.DB.prepare(`
    SELECT
      o.order_id, o.platform, o.shop, o.order_date, o.revenue, o.customer_name,
      o.customer_phone, o.buyer_id, o.buyer_username, o.payment_method, o.source_detail,
      f.source AS fee_source, f.raw_data AS fee_raw_data,
      otc.raw_data AS tracking_raw_data
    FROM orders_v2 o
    LEFT JOIN order_fee_details f ON f.order_id = o.order_id
    LEFT JOIN order_tracking_core otc ON otc.order_id = o.order_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE
        WHEN COALESCE(o.customer_phone, '') != ''
          AND COALESCE(otc.raw_data, '') LIKE '%"shipping_address":"%'
          AND COALESCE(otc.raw_data, '') NOT LIKE '%"shipping_address":""%'
          AND COALESCE(otc.raw_data, '') NOT LIKE '%*%'
        THEN 0
        ELSE 1
      END,
      datetime(COALESCE(o.source_updated_at, o.oms_updated_at, o.order_date, '1970-01-01')) DESC
    LIMIT ?
  `).bind(...binds, limit).all()
  let upserted = 0
  let skipped = 0
  const contacts = []
  for (const row of rows.results || []) {
    const contact = contactFromOrderCore(row)
    const validation = validateMarketplaceCustomerContact(contact)
    if (validation) {
      skipped += 1
      continue
    }
    contacts.push(contact)
  }
  const orderPairs = contacts
    .map(contact => ({ contact_key: contact.contact_key, source_order_id: contactOrderId(contact) }))
    .filter(pair => pair.source_order_id)
  const existingOrderKeys = await loadExistingContactOrderKeys(env, orderPairs)
  const statements = []
  for (const contact of contacts) {
    const orderId = contactOrderId(contact)
    const shouldAppendOrder = Boolean(orderId && !existingOrderKeys.has(contactOrderKey(contact.contact_key, orderId)))
    statements.push(...buildMarketplaceContactStatements(env, contact, shouldAppendOrder))
    upserted += 1
  }
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50))
  }
  return { status: 'ok', scanned_orders: rows.results?.length || 0, upserted, skipped }
}

export async function listMarketplaceCustomerContacts(env, options = {}) {
  await ensureCustomerContactTables(env)
  const clauses = ['1=1']
  const binds = []
  const platform = cleanText(options.platform).toLowerCase()
  const shop = cleanText(options.shop)
  const search = cleanText(options.search)
  const limit = Math.min(Math.max(Number(options.limit || 100) || 100, 1), 500)
  if (platform) {
    clauses.push('platform = ?')
    binds.push(platform)
  }
  if (shop) {
    clauses.push('LOWER(TRIM(shop)) = LOWER(TRIM(?))')
    binds.push(shop)
  }
  if (search) {
    clauses.push('(customer_name LIKE ? OR recipient_name LIKE ? OR buyer_username LIKE ? OR buyer_id LIKE ? OR phone LIKE ? OR phone_normalized LIKE ? OR address_text LIKE ? OR last_order_id LIKE ? OR source_order_id LIKE ?)')
    const q = `%${search}%`
    binds.push(q, q, q, q, q, q, q, q, q)
  }
  const rows = await env.DB.prepare(`
    SELECT
      contact_key, platform, shop, source, source_detail, source_order_id,
      customer_name, buyer_username, buyer_id, recipient_name,
      phone, phone_normalized, phone_last4,
      address_text, province, district, ward, country,
      payment_method, last_order_id, order_count, total_revenue,
      consent_status, contact_status, facebook_audience_status, zalo_status,
      first_seen_at, last_seen_at, last_synced_at
    FROM marketplace_customer_contacts
    WHERE ${clauses.join(' AND ')}
    ORDER BY datetime(COALESCE(last_seen_at, '1970-01-01')) DESC
    LIMIT ?
  `).bind(...binds, limit).all()
  return { status: 'ok', data: rows.results || [], total: rows.results?.length || 0 }
}

export async function summarizeMarketplaceCustomerContacts(env, options = {}) {
  await ensureCustomerContactTables(env)
  const platform = cleanText(options.platform).toLowerCase()
  const shop = cleanText(options.shop)
  const clauses = ['1=1']
  const binds = []
  if (platform) {
    clauses.push('platform = ?')
    binds.push(platform)
  }
  if (shop) {
    clauses.push('LOWER(TRIM(shop)) = LOWER(TRIM(?))')
    binds.push(shop)
  }
  const row = await env.DB.prepare(`
    SELECT
      COUNT(1) AS total,
      SUM(CASE WHEN platform = 'shopee' THEN 1 ELSE 0 END) AS shopee_total,
      SUM(CASE WHEN platform = 'tiktok' THEN 1 ELSE 0 END) AS tiktok_total,
      SUM(CASE WHEN platform = 'lazada' THEN 1 ELSE 0 END) AS lazada_total,
      SUM(CASE WHEN platform = 'facebook' THEN 1 ELSE 0 END) AS facebook_total,
      SUM(CASE WHEN platform = 'zalo' THEN 1 ELSE 0 END) AS zalo_total,
      SUM(CASE WHEN phone_normalized != '' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN address_text != '' THEN 1 ELSE 0 END) AS with_address
    FROM marketplace_customer_contacts
    WHERE ${clauses.join(' AND ')}
  `).bind(...binds).first()
  return {
    status: 'ok',
    total: Number(row?.total || 0),
    shopee_total: Number(row?.shopee_total || 0),
    tiktok_total: Number(row?.tiktok_total || 0),
    lazada_total: Number(row?.lazada_total || 0),
    facebook_total: Number(row?.facebook_total || 0),
    zalo_total: Number(row?.zalo_total || 0),
    with_phone: Number(row?.with_phone || 0),
    with_address: Number(row?.with_address || 0)
  }
}
