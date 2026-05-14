const CDP_PORT = Number(process.env.CODEX_CHROME_PORT || 9333)
const OMS_URL = process.env.CODEX_OMS_URL || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?v=fee-phase1-check-20260507'
const TARGET_PLATFORM = String(process.env.CODEX_ORDER_PLATFORM || '').trim().toLowerCase()
const TARGET_SHOP = String(process.env.CODEX_ORDER_SHOP || '').trim()
const TARGET_ORDER_ID = String(process.env.CODEX_ORDER_ID || '').trim()

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  if (!fallback) throw new Error('Không tìm thấy tab Chrome nào để kiểm tra popup phí thật.')
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
  throw new Error('Điều kiện giao diện OMS không đạt trong thời gian chờ.')
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

    await evalValue(send, `
      (async () => {
        const setValue = (id, value) => {
          if (!value) return
          const el = document.getElementById(id)
          if (!el) return
          el.value = value
          el.dispatchEvent(new Event('change', { bubbles: true }))
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        setValue('f_platform', ${JSON.stringify(TARGET_PLATFORM)})
        setValue('f_shop', ${JSON.stringify(TARGET_SHOP)})
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

    await waitUntil(send, `document.querySelectorAll('#omsTable tr[id^="row-"]').length > 0`, 60000)

    const result = await evalValue(send, `
      (() => {
        const row = ${JSON.stringify(TARGET_ORDER_ID)}
          ? document.querySelector('#omsTable tr[id="row-' + ${JSON.stringify(TARGET_ORDER_ID)} + '"]')
          : document.querySelector('#omsTable tr[id^="row-"]')
        if (!row) return null
        const feeNode = [...row.querySelectorAll('div')].find(node => /Phí API|Phí cost setting|Phí tạm tính/i.test(node.textContent || ''))
        const feeWrap = feeNode?.parentElement || null
        feeWrap?.click()
        const dropdown = feeWrap?.querySelector('.fee-dropdown-box')
        return {
          orderId: row.id.replace(/^row-/, ''),
          shop: row.querySelector('.shop-name')?.textContent?.trim() || '',
          customer: row.querySelector('.shop-customer')?.textContent?.trim() || '',
          badge: feeNode?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          dropdownText: dropdown?.innerText?.replace(/\\s+/g, ' ').trim() || '',
          rowText: row.innerText.replace(/\\s+/g, ' ').trim()
        }
      })()
    `, 30000)

    console.log(JSON.stringify(result, null, 2))
    if (!result?.badge || !result?.dropdownText) process.exitCode = 1
  } finally {
    connection?.ws?.close()
    if (tab._codexCreated) await closeTab(tab.id)
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
