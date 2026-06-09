function cleanText(value) {
  return String(value ?? '').trim()
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function valueAt(source, path) {
  const keys = Array.isArray(path) ? path : [path]
  let value = source
  for (const key of keys) value = value?.[key]
  return value
}

function firstText(source, paths = []) {
  for (const path of paths) {
    const text = cleanText(valueAt(source, path))
    if (text) return text
  }
  return ''
}

function firstObject(source, paths = []) {
  for (const path of paths) {
    const value = valueAt(source, path)
    if (isObject(value)) return value
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(value)
        if (isObject(parsed)) return parsed
      } catch {
        // Shopee đôi khi trả content dạng chuỗi không phải JSON; bỏ qua để lấy fallback text khác.
      }
    }
  }
  return null
}

function firstArray(source, paths = []) {
  for (const path of paths) {
    const value = valueAt(source, path)
    if (Array.isArray(value)) return value
  }
  return []
}

function normalizeTimestamp(value) {
  const text = cleanText(value)
  if (!text) return ''
  const number = Number(text)
  if (Number.isFinite(number) && number > 0) {
    const ms = number > 1e17
      ? Math.floor(number / 1e6)
      : (number > 1e14 ? Math.floor(number / 1e3) : (number > 1e11 ? number : number * 1000))
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function rawTimestamp(row = {}) {
  return firstText(row, [
    'last_message_timestamp',
    'latest_message_timestamp',
    'last_message_time',
    'updated_timestamp',
    'updated_at',
    'created_timestamp',
    'created_at',
    'timestamp',
    'send_time'
  ])
}

export function shopeeConversationId(row = {}) {
  return firstText(row, ['conversation_id', 'conversationId', 'conversationid', 'chat_id', 'session_id'])
}

function isNumericOnly(value) {
  return /^\d+$/.test(cleanText(value))
}

function sameValue(left, right) {
  return cleanText(left).toLowerCase() === cleanText(right).toLowerCase()
}

function isShopValue(value, base = {}) {
  const text = cleanText(value)
  return Boolean(text && [base.shop, base.shop_id, base.api_shop_id].some(item => sameValue(text, item)))
}

function usableName(name, id, base = {}) {
  const text = cleanText(name)
  if (!text || isShopValue(text, base)) return ''
  if (id && sameValue(text, id)) return ''
  if (isNumericOnly(text)) return ''
  return text
}

const CUSTOMER_PAIRS = [
  ['buyer_id', 'buyer_name'],
  ['customer_id', 'customer_name'],
  ['oppside_user_id', 'oppside_user_name'],
  ['opposite_user_id', 'opposite_user_name'],
  ['user_id', 'user_name'],
  ['to_id', 'to_name'],
  ['to_user_id', 'to_user_name'],
  ['recipient_id', 'recipient_name'],
  ['receiver_id', 'receiver_name'],
  ['from_id', 'from_name'],
  ['from_user_id', 'from_user_name'],
  ['sender_id', 'sender_name'],
  [['buyer', 'id'], ['buyer', 'name']],
  [['user', 'id'], ['user', 'name']],
  [['receiver', 'id'], ['receiver', 'name']],
  [['recipient', 'id'], ['recipient', 'name']],
  [['sender', 'id'], ['sender', 'name']]
]

function inferCustomer(row = {}, base = {}) {
  let fallbackId = ''
  for (const [idPath, namePath] of CUSTOMER_PAIRS) {
    const id = firstText(row, [idPath])
    const name = usableName(firstText(row, [namePath]), id, base)
    if (id && !isShopValue(id, base)) fallbackId = fallbackId || id
    if (id && name) return { id, name }
  }
  const looseName = usableName(firstText(row, [
    'display_name',
    'title',
    'nickname',
    'username',
    'name',
    ['profile', 'nickname'],
    ['profile', 'display_name']
  ]), fallbackId, base)
  return { id: fallbackId, name: looseName }
}

function contentObject(row = {}) {
  return firstObject(row, [
    'content',
    'message_content',
    'msg_content',
    ['message', 'content'],
    ['last_message', 'content'],
    'latest_message_content',
    'last_message_content'
  ]) || {}
}

function textFromContent(row = {}) {
  const content = contentObject(row)
  if (typeof row.content === 'string') return cleanText(row.content)
  return firstText(content, ['text', 'message', 'content', 'description', 'value', 'title']) ||
    firstText(row, [
      'text',
      'message',
      'message_text',
      'content_text',
      'last_message_text',
      'latest_message_content',
      'last_message_content',
      'summary',
      ['last_message', 'text'],
      ['last_message', 'message'],
      ['message', 'text'],
      ['message', 'message']
    ])
}

export function messageText(row = {}) {
  const text = textFromContent(row)
  if (text) return text
  const content = contentObject(row)
  const type = firstText(row, ['message_type', 'msg_type', 'type', 'latest_message_type', ['message', 'type']]).toLowerCase()
  const keys = new Set([...Object.keys(content || {}), ...Object.keys(row || {})].map(item => item.toLowerCase()))
  if (keys.has('order_sn') || content.order_sn || row.order_sn) return `[Đơn hàng] ${cleanText(content.order_sn || row.order_sn)}`.trim()
  if (keys.has('item_id') || keys.has('product_id') || content.item_id || row.item_id) return `[Sản phẩm] ${cleanText(content.item_id || row.item_id || content.product_id || row.product_id)}`.trim()
  if (type.includes('emoji')) return '[Emoji]'
  if (type.includes('image') || keys.has('image_url') || keys.has('url')) return '[Hình ảnh]'
  if (type.includes('video') || keys.has('video_url') || keys.has('thumb_url')) return '[Video]'
  if (type.includes('sticker') || keys.has('sticker_id')) return '[Sticker]'
  if (type.includes('offer')) return '[Ưu đãi]'
  if (type.includes('voucher')) return '[Voucher]'
  if (type) return `Đã gửi ${type}`
  return ''
}

function attachmentFromContent(row = {}) {
  const content = contentObject(row)
  const url = firstText(content, ['url', 'image_url', 'video_url', 'thumb_url']) ||
    firstText(row, ['url', 'image_url', 'video_url', 'thumb_url'])
  if (!url) return []
  const type = firstText(row, ['message_type', 'msg_type', 'type']).toLowerCase().includes('video') || content.video_url
    ? 'video'
    : 'image'
  return [{ id: firstText(row, ['message_id', 'msg_id', 'id']) || url, type, url, thumbnail_url: cleanText(content.thumb_url || row.thumb_url), source: 'shopee_sellerchat_bridge' }]
}

function orderIdFromContent(row = {}) {
  const content = contentObject(row)
  return firstText(content, ['order_sn', 'order_id', 'platform_order_id']) ||
    firstText(row, ['order_sn', 'order_id', 'platform_order_id', ['source_content', 'order_sn'], ['source_content', 'order_id']])
}

function productIdsFromContent(row = {}) {
  const content = contentObject(row)
  const ids = [
    firstText(content, ['item_id', 'product_id', 'platform_item_id']),
    firstText(row, ['item_id', 'product_id', 'platform_item_id', ['source_content', 'item_id'], ['source_content', 'product_id']])
  ].filter(Boolean)
  return [...new Set(ids.map(item => cleanText(item)).filter(Boolean))]
}

export function normalizeShopeeConversation(row = {}, base = {}, syncCursor = '') {
  const conversationId = shopeeConversationId(row)
  const customer = inferCustomer(row, base)
  const timestamp = rawTimestamp(row)
  const lastMessage = messageText(row)
  return {
    id: `shopee_${base.shop_id || 'shop'}_${conversationId || customer.id}`,
    channel: 'shopee',
    platform: 'shopee',
    shop: base.shop,
    shop_id: base.shop_id,
    shop_display_name: base.shop,
    shop_name_source: 'shop_core',
    conversation_id: conversationId,
    platform_conversation_id: conversationId,
    buyer_id: customer.id,
    customer_id: customer.id,
    buyer_name: customer.name,
    customer_name: customer.name,
    last_message: lastMessage,
    last_message_text: lastMessage,
    last_message_at: normalizeTimestamp(timestamp),
    last_message_timestamp: timestamp,
    sync_cursor: syncCursor,
    messages: []
  }
}

function senderType(row = {}, fallback = {}) {
  const fromShopId = firstText(row, ['from_shop_id', ['sender', 'shop_id'], 'shop_id'])
  const raw = firstText(row, ['sender_type', 'from_type', ['sender', 'type']]).toLowerCase()
  if (raw.includes('seller') || raw.includes('shop')) return 'shop'
  if (raw.includes('buyer') || raw.includes('customer') || raw.includes('user')) return 'customer'
  if (fromShopId && sameValue(fromShopId, fallback.shop_id)) return 'shop'
  return 'customer'
}

export function normalizeShopeeMessage(row = {}, fallback = {}) {
  const messageId = firstText(row, ['message_id', 'msg_id', 'id', 'request_id'])
  const type = senderType(row, fallback)
  const fromId = firstText(row, ['from_id', 'from_user_id', ['sender', 'id']])
  const toId = firstText(row, ['to_id', 'to_user_id', ['receiver', 'id']])
  const customerId = type === 'customer' ? (fromId || fallback.buyer_id) : (toId || fallback.buyer_id)
  const senderName = type === 'shop'
    ? cleanText(fallback.shop)
    : usableName(firstText(row, ['from_user_name', 'from_name', 'sender_name', ['sender', 'name'], 'buyer_name', 'to_user_name', 'to_name']), customerId, fallback)
  const timestamp = firstText(row, ['created_timestamp', 'created_at', 'timestamp', 'sent_at', 'send_time'])
  const text = messageText(row)
  const orderId = orderIdFromContent(row)
  const productIds = productIdsFromContent(row)
  return {
    channel: 'shopee',
    platform: 'shopee',
    shop: fallback.shop,
    shop_id: fallback.shop_id,
    conversation_id: fallback.conversation_id,
    platform_conversation_id: fallback.conversation_id,
    buyer_id: customerId,
    customer_id: customerId,
    message_id: messageId,
    platform_message_id: messageId,
    sender_type: type,
    sender_name: senderName || (type === 'shop' ? 'Shop' : ''),
    message_type: firstText(row, ['message_type', 'msg_type', 'type']) || 'text',
    content: text,
    text,
    order_id: orderId,
    order_sn: orderId,
    product_ids: productIds,
    media_items: attachmentFromContent(row),
    attachments: attachmentFromContent(row),
    sent_at: normalizeTimestamp(timestamp),
    created_at: normalizeTimestamp(timestamp),
    source: 'shopee_sellerchat_bridge'
  }
}

export function extractConversationRows(data = {}) {
  return firstArray(data, [
    ['response', 'conversation_list'],
    ['response', 'conversations'],
    'conversation_list',
    'conversations',
    ['data', 'conversation_list'],
    ['data', 'conversations']
  ])
}

export function extractMessageRows(data = {}) {
  return firstArray(data, [
    ['response', 'message_list'],
    ['response', 'messages'],
    'message_list',
    'messages',
    ['data', 'message_list'],
    ['data', 'messages']
  ])
}

export function extractOneConversationRow(data = {}) {
  return firstObject(data, [
    ['response', 'conversation'],
    ['response', 'conversation_info'],
    ['response', 'conversation_detail'],
    'conversation',
    'conversation_info',
    ['data', 'conversation'],
    ['data', 'conversation_info'],
    'response',
    'data'
  ])
}

export function mergeConversationRows(rows = [], preferred = null) {
  const merged = []
  const seen = new Set()
  for (const row of [preferred, ...rows].filter(Boolean)) {
    const id = shopeeConversationId(row)
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    merged.push(row)
  }
  return merged
}

function sampleKeys(value) {
  return isObject(value) ? Object.keys(value).slice(0, 40) : []
}

function sampleNameFields(row = {}) {
  return {
    conversation_id: shopeeConversationId(row),
    buyer_id: firstText(row, ['buyer_id', 'customer_id', 'to_id', 'from_id', 'oppside_user_id', 'user_id']),
    buyer_name: firstText(row, ['buyer_name', 'customer_name', 'to_name', 'from_name', 'from_user_name', 'to_user_name', 'user_name', 'nickname', 'title', 'display_name'])
  }
}

export function buildShopeeChatDiagnostic(input = {}) {
  const firstRow = input.rawRows?.[0] || {}
  const firstMessageRow = input.messageRows?.[0] || {}
  const pageResult = input.messageData?.response?.page_result || input.messageData?.page_result || {}
  return {
    endpoint_note: 'diagnostic_sanitized_no_token_cookie',
    conversation_list_keys: sampleKeys(input.listData?.response || input.listData || {}),
    conversation_row_keys: sampleKeys(firstRow),
    conversation_name_preview: sampleNameFields(firstRow),
    target_one_conversation_status: input.oneConversationStatus || 0,
    target_one_conversation_keys: sampleKeys(input.oneConversationRow || {}),
    target_one_conversation_name_preview: sampleNameFields(input.oneConversationRow || {}),
    message_response_keys: sampleKeys(input.messageData?.response || input.messageData || {}),
    message_page_result_keys: sampleKeys(pageResult),
    message_page_result_preview: {
      has_next_page: pageResult.has_next_page ?? pageResult.has_more ?? pageResult.more ?? null,
      next_offset: firstText(pageResult, ['next_offset', 'offset', 'next_cursor', 'cursor', 'next_page_token']),
      total_count: pageResult.total_count ?? pageResult.total ?? null
    },
    message_row_keys: sampleKeys(firstMessageRow),
    message_content_keys: sampleKeys(contentObject(firstMessageRow)),
    message_text_preview: messageText(firstMessageRow).slice(0, 120),
    message_rows_count: input.messageRows?.length || 0
  }
}
