import { extractConversationRows, messageText, shopeeConversationId } from './shopee-chat-normalize.js'

function cleanText(value) {
  return String(value ?? '').trim()
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

function compactApiError(data = {}) {
  return {
    error: cleanText(data.error || data.error_code),
    message: cleanText(data.message || data.error_message || data.debug_message),
    request_id: cleanText(data.request_id || data.response?.request_id)
  }
}

function conversationListNextOffset(data = {}) {
  return firstText(data, [
    ['response', 'page_result', 'next_offset'],
    ['response', 'page_result', 'offset'],
    ['response', 'page_result', 'next_cursor'],
    ['response', 'page_result', 'cursor'],
    ['response', 'page_result', 'next_page_token'],
    ['response', 'next_offset'],
    ['response', 'offset'],
    ['response', 'next_cursor'],
    ['response', 'cursor'],
    'next_offset',
    'offset',
    'next_cursor',
    'cursor'
  ])
}

function conversationListHasExplicitMoreFlag(data = {}) {
  const value = data?.response?.page_result?.has_next_page ??
    data?.response?.page_result?.has_more ??
    data?.response?.page_result?.more ??
    data?.response?.has_next_page ??
    data?.response?.has_more ??
    data?.response?.more
  return value !== undefined && value !== null && cleanText(value) !== ''
}

function conversationListHasMore(data = {}) {
  const value = data?.response?.page_result?.has_next_page ??
    data?.response?.page_result?.has_more ??
    data?.response?.page_result?.more ??
    data?.response?.has_next_page ??
    data?.response?.has_more ??
    data?.response?.more
  return value === true || value === 1 || value === '1' || cleanText(value).toLowerCase() === 'true'
}

function sampleRow(row = {}) {
  return {
    conversation_id: shopeeConversationId(row),
    to_id: firstText(row, ['to_id', 'buyer_id', 'customer_id', 'oppside_user_id', 'opposite_user_id']),
    to_name: firstText(row, ['to_name', 'buyer_name', 'customer_name', 'oppside_user_name', 'opposite_user_name']),
    latest_message_type: firstText(row, ['latest_message_type', 'last_message_type', 'message_type']),
    latest_message_text: messageText(row).slice(0, 120),
    last_message_timestamp: firstText(row, ['last_message_timestamp', 'latest_message_timestamp', 'last_message_time', 'updated_timestamp'])
  }
}

function nameMatched(row = {}, names = []) {
  const haystack = [
    firstText(row, ['to_name', 'buyer_name', 'customer_name', 'oppside_user_name', 'opposite_user_name', 'from_name', 'from_user_name']),
    messageText(row)
  ].join(' ').toLowerCase()
  return names.filter(name => haystack.includes(cleanText(name).toLowerCase()))
}

export async function fetchShopeeConversationListPages({ callShopeeChatApi, shop, params = {}, pageSize = 50, limit = 50, maxPages = 3 }) {
  const rows = []
  const attempts = []
  const seen = new Set()
  let offset = cleanText(params.offset)
  let lastData = null
  for (let page = 0; page < Math.max(1, maxPages); page += 1) {
    const requestParams = { ...params, page_size: pageSize }
    if (offset) requestParams.offset = offset
    const result = await callShopeeChatApi(shop, '/api/v2/sellerchat/get_conversation_list', { params: requestParams })
    attempts.push({ path: '/api/v2/sellerchat/get_conversation_list', page: page + 1, params: requestParams, http_status: result.status, ...compactApiError(result.data) })
    if (!result.ok) break
    lastData = result.data
    const pageRows = extractConversationRows(result.data)
    for (const row of pageRows) {
      const key = shopeeConversationId(row) || JSON.stringify(sampleRow(row))
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      rows.push(row)
      if (rows.length >= limit) break
    }
    if (rows.length >= limit) break
    const nextOffset = conversationListNextOffset(result.data)
    if (!nextOffset || nextOffset === offset) break
    if (conversationListHasExplicitMoreFlag(result.data) && !conversationListHasMore(result.data)) break
    offset = nextOffset
  }
  return { rows, attempts, lastData }
}

export async function probeShopeeConversationListVariants({ callShopeeChatApi, shop, pageSize = 20, names = [] }) {
  const variants = [
    { label: 'page_size_only', params: {} },
    { label: 'latest_all', params: { direction: 'latest', type: 'all' } },
    { label: 'older_all', params: { direction: 'older', type: 'all' } },
    { label: 'latest_unread', params: { direction: 'latest', type: 'unread' } },
    { label: 'latest_unanswered', params: { direction: 'latest', type: 'unanswered' } },
    { label: 'latest_unreplied', params: { direction: 'latest', type: 'unreplied' } }
  ]
  const probeNames = Array.isArray(names) ? names.map(cleanText).filter(Boolean).slice(0, 20) : []
  const result = []
  for (const variant of variants) {
    // Probe chỉ đọc danh sách hội thoại, không ghi Core và không gọi gửi tin.
    const listed = await fetchShopeeConversationListPages({
      callShopeeChatApi,
      shop,
      params: variant.params,
      pageSize,
      limit: Math.max(pageSize, 20),
      maxPages: 2
    })
    const matches = []
    for (const row of listed.rows) {
      const hitNames = nameMatched(row, probeNames)
      if (hitNames.length) matches.push({ ...sampleRow(row), matched_names: hitNames })
    }
    result.push({
      label: variant.label,
      params: variant.params,
      row_count: listed.rows.length,
      first_rows: listed.rows.slice(0, 8).map(sampleRow),
      matches,
      attempts: listed.attempts.map(item => ({ ...item, params: item.params }))
    })
  }
  return result
}
