const CDP_PORT = Number(process.env.CODEX_CHROME_PORT || 9333)
const OMS_URL = process.env.CODEX_OMS_URL || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?v=order-chat-resolver-20260507'
const API_BASE = String(process.env.CODEX_API_BASE || 'https://huyvan-worker-api.nghiemchihuy.workers.dev').trim().replace(/\/$/, '')
const TARGET_ORDER_ID = String(process.env.CODEX_ORDER_ID || '').trim()
const TARGET_PLATFORM = String(process.env.CODEX_ORDER_PLATFORM || '').trim().toLowerCase()
const TARGET_SHOP = String(process.env.CODEX_ORDER_SHOP || '').trim()
const PREFER_CREATED = /^(1|true|yes)$/i.test(String(process.env.CODEX_PREFER_CREATED || '').trim())

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizePlatformLabel(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text.includes('shopee')) return 'shopee'
  if (text.includes('lazada')) return 'lazada'
  if (text.includes('tiktok')) return 'tiktok'
  return text
}

async function fetchJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return response.json()
}

async function createTab(url = 'about:blank') {
  try {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
    if (response.ok) {
      const payload = await response.json()
      return { ...payload, _codexCreated: true }
    }
  } catch {}
  const tabs = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`)
  const fallback = (tabs || []).find(tab => tab.type === 'page' && tab.webSocketDebuggerUrl)
  if (!fallback) throw new Error('Không tìm thấy tab Chrome nào để kiểm tra giao diện thật.')
  return { ...fallback, _codexCreated: false }
}

async function closeTab(tabId) {
  if (!tabId) return
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tabId}`).catch(() => null)
}

async function connect(tabInfo) {
  const ws = new WebSocket(tabInfo.webSocketDebuggerUrl)
  const pending = new Map()
  let callId = 0

  ws.onmessage = event => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result || {})
  }

  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  const send = (method, params = {}) => {
    const id = ++callId
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }

  return { ws, send }
}

async function evalValue(send, expression, timeout = 30000) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluate failed')
  return result.result?.value
}

async function waitUntil(send, expression, timeout = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = await evalValue(send, expression, 5000).catch(() => false)
    if (value) return value
    await sleep(250)
  }
  throw new Error('Điều kiện giao diện không đạt trong thời gian chờ.')
}

async function applyOmsFilters(send) {
  if (!TARGET_PLATFORM && !TARGET_SHOP && !TARGET_ORDER_ID) return
  await evalValue(send, `
    (async () => {
      const setValue = (id, value) => {
        const el = document.getElementById(id)
        if (!el) return
        el.value = value
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      if (${JSON.stringify(TARGET_PLATFORM)}) setValue('f_platform', ${JSON.stringify(TARGET_PLATFORM)})
      if (${JSON.stringify(TARGET_SHOP)}) setValue('f_shop', ${JSON.stringify(TARGET_SHOP)})
      if (${JSON.stringify(TARGET_ORDER_ID)}) {
        const input = document.getElementById('f_search')
        if (input) {
          input.value = ${JSON.stringify(TARGET_ORDER_ID)}
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }
      if (typeof window.loadOrders === 'function') {
        await window.loadOrders(1)
      }
      return true
    })()
  `, 60000)
}

async function resolveOrder(send, item) {
  const body = {
    platform: normalizePlatformLabel(item.platform),
    shop: item.shopName,
    order_id: item.orderId,
    customer_name: item.customerName || ''
  }
  const payload = await evalValue(send, `
    (async () => {
      const response = await fetch(${JSON.stringify(`${API_BASE}/api/chat/resolve-order-conversation`)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(${JSON.stringify(body)})
      })
      const data = await response.json().catch(() => ({}))
      return { ok: response.ok, data }
    })()
  `, 60000)
  return payload
}

async function pickResolverTarget(send) {
  const rows = await evalValue(send, `
    (() => {
      return [...document.querySelectorAll('#omsTable tr[id^="row-"]')].slice(0, 80).map(row => {
        const orderId = row.id.replace(/^row-/, '')
        const cells = row.querySelectorAll('td')
        const platform = cells[3]?.innerText?.trim() || ''
        const shopName = row.querySelector('.shop-name')?.textContent?.trim() || ''
        const customerName = (row.querySelector('.shop-customer')?.textContent || '').replace(/^👤\\s*/, '').trim()
        return { orderId, platform, shopName, customerName }
      }).filter(item => item.orderId && item.platform && item.shopName)
    })()
  `, 20000)

  if (TARGET_ORDER_ID) {
    const explicit = rows.find(item => item.orderId === TARGET_ORDER_ID) || {
      orderId: TARGET_ORDER_ID,
      platform: TARGET_PLATFORM,
      shopName: TARGET_SHOP,
      customerName: ''
    }
    const resolved = await resolveOrder(send, explicit)
    return { item: explicit, resolver: resolved.data }
  }

  let firstFound = null
  let firstCreated = null
  for (const item of rows) {
    const resolved = await resolveOrder(send, item)
    if (!resolved.ok || !resolved.data?.found || !resolved.data?.conversation?.id) continue
    const pick = { item, resolver: resolved.data }
    if (!firstFound) firstFound = pick
    if (String(resolved.data.match_type || '').toLowerCase() === 'created') {
      firstCreated = pick
      if (PREFER_CREATED) return firstCreated
    }
  }

  return firstCreated || firstFound || null
}

async function run() {
  const version = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`)
  if (!version?.webSocketDebuggerUrl) throw new Error('Chrome CDP chưa sẵn sàng ở port 9333.')

  const tab = await createTab('about:blank')
  let connection = null
  try {
    connection = await connect(tab)
    const { send } = connection
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.navigate', { url: OMS_URL })
    await waitUntil(send, `location.href.includes('oms-dashboard')`, 30000)
    await waitUntil(send, `document.readyState === 'complete'`, 30000)

    await applyOmsFilters(send)
    await waitUntil(send, `document.querySelectorAll('[data-chat-order-open]').length > 0`, 60000)

    const picked = await pickResolverTarget(send)
    if (!picked?.item?.orderId) throw new Error('Không lấy được đơn hàng để kiểm tra nút Nhắn khách.')

    await evalValue(send, `
      (() => {
        const button = document.querySelector('[data-chat-order-open="${picked.item.orderId}"]')
        if (!button) throw new Error('Không tìm thấy nút Nhắn khách của đơn ${picked.item.orderId}.')
        button.click()
        return true
      })()
    `, 15000)

    await waitUntil(send, `location.href.includes('chat-marketplace')`, 30000)
    await waitUntil(send, `document.readyState === 'complete'`, 30000)
    await waitUntil(send, `
      (() => {
        const box = document.getElementById('chatReplyText')
        const guard = document.getElementById('chatReplyGuardStatus')
        const messages = document.getElementById('chatMessages')
        return !!box && !!guard && !!messages && (
          box.value.trim().length > 0
          || /Khớp mềm|Đã tạo hội thoại mới|Chưa tìm thấy hội thoại/i.test(guard.textContent || '')
          || /Chưa tìm thấy hội thoại/i.test(messages.textContent || '')
        )
      })()
    `, 60000)

    const uiState = await evalValue(send, `
      (() => ({
        href: location.href,
        threadTitle: document.querySelector('#chatThreadHeader strong')?.textContent?.trim() || '',
        threadNote: [...document.querySelectorAll('#chatThreadHeader .chat-thread-note')].map(node => node.textContent.trim()).filter(Boolean),
        replyText: document.getElementById('chatReplyText')?.value?.trim() || '',
        replyDisabled: !!document.getElementById('chatReplyText')?.disabled,
        guardStatus: document.getElementById('chatReplyGuardStatus')?.textContent?.trim() || '',
        emptyText: document.getElementById('chatMessages')?.textContent?.trim() || '',
        summary: document.getElementById('chatSummary')?.textContent?.trim() || ''
      }))()
    `, 15000)

    const matchType = String(picked.resolver?.match_type || '').toLowerCase()
    const ok = picked.resolver?.found
      ? Boolean(
        uiState.threadTitle
        && uiState.replyText
        && /Dạ shop đang/i.test(uiState.replyText)
      )
      : /Chưa tìm thấy hội thoại/i.test(uiState.guardStatus || uiState.emptyText || '')

    console.log(JSON.stringify({
      ok,
      orderId: picked.item.orderId,
      resolver: {
        found: Boolean(picked.resolver?.found),
        match_type: matchType,
        warning: picked.resolver?.warning || '',
        conversation_id: picked.resolver?.conversation?.conversation_id || '',
        conversation_internal_id: picked.resolver?.conversation?.id || 0
      },
      uiState
    }, null, 2))

    if (!ok) process.exitCode = 1
  } finally {
    connection?.ws?.close()
    if (tab._codexCreated) await closeTab(tab.id)
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
