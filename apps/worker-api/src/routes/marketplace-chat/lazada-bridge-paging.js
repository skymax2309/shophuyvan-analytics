function numberOption(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.floor(number), min), max)
}

function forceHistory(body = {}) {
  return body.force_history === true || body.force_history === 'true' || body.force === true || body.force === 'true'
}

export function lazadaHistoryStartTime(body = {}) {
  const explicit = body.start_time || body.before_time || body.message_start_time
  if (explicit) return String(explicit)
  // Lazada IM dùng start_time như mốc kéo lùi; dùng mốc hiện tại để không bỏ sót tin mới.
  return String(Date.now())
}

function targetSessionId(body = {}, cleanText) {
  return cleanText(body.target_conversation_id || body.platform_conversation_id || body.session_id)
}

function sessionIdOf(row = {}, cleanText) {
  return cleanText(row.session_id || row.conversation_id || row.chat_id || row.id)
}

function messageIdOf(row = {}, cleanText) {
  return cleanText(row.message_id || row.msg_id || row.id || row.request_id)
    || `${cleanText(row.send_time || row.timestamp || row.created_at)}::${cleanText(row.content || row.txt || row.text || row.message)}`
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function callWithRateRetry(callPath, path, params, compactApiError) {
  let result = await callPath(path, params)
  const apiError = compactApiError(result.data)
  if (apiError.error === 'ApiCallLimit') {
    await wait(1200)
    result = await callPath(path, params)
  }
  return result
}

export async function collectLazadaSessionRows({
  body = {},
  callPath,
  firstArray,
  cleanText,
  compactApiError
}) {
  const limit = numberOption(body.limit, 20, 1, 100)
  const pageSize = numberOption(body.page_size, 20, 1, 50)
  const pageCount = numberOption(body.session_page_count || body.page_count, 1, 1, 10)
  const startTime = lazadaHistoryStartTime(body)
  const rows = []
  const seen = new Set()
  const attempts = []
  let syncCursor = ''

  for (let pageNo = 1; pageNo <= pageCount && rows.length < limit; pageNo += 1) {
    const result = await callWithRateRetry(callPath, '/im/session/list', {
      page_no: pageNo,
      page_size: pageSize,
      start_time: startTime
    }, compactApiError)
    const apiError = compactApiError(result.data)
    attempts.push({
      path: '/im/session/list',
      page_no: pageNo,
      http_status: result.status,
      request_id: cleanText(result.data?.request_id),
      ...apiError
    })
    if (!result.ok) {
      if (pageNo === 1) return { ok: false, rows, attempts, status: result.status, data: result.data }
      break
    }
    if (!syncCursor) syncCursor = cleanText(result.data?.data?.next_cursor || result.data?.result?.next_cursor || result.data?.next_cursor)
    const pageRows = firstArray(result.data, [
      ['data', 'session_list'],
      ['data', 'sessions'],
      ['data', 'items'],
      ['result', 'session_list'],
      'session_list',
      'sessions'
    ])
    for (const row of pageRows) {
      const id = sessionIdOf(row, cleanText)
      if (!id || seen.has(id)) continue
      seen.add(id)
      rows.push(row)
      if (rows.length >= limit) break
    }
    if (pageRows.length < pageSize) break
  }

  // Hội thoại đang mở phải được kéo lại dù nó không còn nằm trong trang list mới nhất.
  const target = targetSessionId(body, cleanText)
  if (target && !seen.has(target)) rows.unshift({ session_id: target, conversation_id: target })

  return { ok: true, rows, attempts, syncCursor, listedConversations: rows.length, startTime }
}

export async function collectLazadaMessageRows({
  body = {},
  sessionId,
  isTarget = false,
  callPath,
  firstArray,
  cleanText,
  compactApiError
}) {
  const pageSize = numberOption(body.page_size, 20, 1, 50)
  const requestedPages = body.message_page_count || body.message_pages || body.target_message_page_count
  const defaultPages = isTarget ? 5 : 1
  const pageCount = numberOption(requestedPages, defaultPages, 1, isTarget ? 8 : 2)
  const startTime = lazadaHistoryStartTime(body)
  const rows = []
  const seen = new Set()
  const attempts = []

  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    const result = await callWithRateRetry(callPath, '/im/message/list', {
      session_id: sessionId,
      page_no: pageNo,
      page_size: pageSize,
      start_time: startTime
    }, compactApiError)
    attempts.push({
      path: '/im/message/list',
      session_id: sessionId,
      page_no: pageNo,
      http_status: result.status,
      ...compactApiError(result.data)
    })
    if (!result.ok) break
    const pageRows = firstArray(result.data, [
      ['data', 'message_list'],
      ['data', 'messages'],
      ['data', 'items'],
      ['result', 'message_list'],
      'message_list',
      'messages'
    ])
    for (const row of pageRows) {
      const id = messageIdOf(row, cleanText)
      if (!id || seen.has(id)) continue
      seen.add(id)
      rows.push(row)
    }
    if (pageRows.length < pageSize) break
  }

  return { rows, attempts }
}
