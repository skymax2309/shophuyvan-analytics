const CDP_PORT = Number(process.env.CODEX_CHROME_PORT || 9333)
const CHAT_URL = process.env.CODEX_CHAT_URL || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/chat-marketplace.html?v=tiktok-dedupe-verify-20260508'
const TARGET_BUYER = String(process.env.CODEX_TIKTOK_BUYER || 't_thzy2').trim()
const TARGET_PLATFORM = String(process.env.CODEX_TIKTOK_PLATFORM || 'tiktok').trim().toLowerCase()
const SCREENSHOT_PATH = process.env.CODEX_TIKTOK_SCREENSHOT || 'E:/shophuyvan-analytics/tmp-tiktok-dedupe-verify-final.png'

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
  throw new Error(`Điều kiện giao diện không đạt trong thời gian chờ: ${expression}`)
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
    await send('Network.enable')
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    })

    await send('Page.navigate', { url: CHAT_URL })
    await waitUntil(send, `document.readyState === 'complete'`, 30000)
    await waitUntil(send, `!!window.loadChatConversations && !!document.getElementById('chatConversationList')`, 30000)
    await evalValue(send, `(() => {
      const platform = document.getElementById('chatPlatform')
      const search = document.getElementById('chatSearch')
      if (platform) {
        platform.value = ${JSON.stringify(TARGET_PLATFORM)}
        platform.dispatchEvent(new Event('change', { bubbles: true }))
      }
      if (search) {
        search.value = ${JSON.stringify(TARGET_BUYER)}
        search.dispatchEvent(new Event('input', { bubbles: true }))
        search.dispatchEvent(new Event('change', { bubbles: true }))
      }
      return true
    })()`, 10000)
    await evalValue(send, `window.loadChatConversations({ silent: false, skipApiSync: true, reloadActive: true }).then(() => true)`, 60000)
    await waitUntil(send, `document.querySelectorAll('#chatConversationList .chat-conversation').length > 0`, 30000)

    const listDump = await evalValue(send, `(() => {
      const items = [...document.querySelectorAll('#chatConversationList .chat-conversation')].map(node => ({
        text: (node.innerText || '').trim(),
        onclick: node.getAttribute('onclick') || ''
      }))
      return items
    })()`, 20000)
    const target = (Array.isArray(listDump) ? listDump : []).find(item => item.text.toLowerCase().includes(TARGET_BUYER.toLowerCase()) && item.text.toLowerCase().includes(TARGET_PLATFORM)) || null

    if (!target?.onclick) {
      throw new Error(`Không tìm thấy hội thoại ${TARGET_BUYER} trên danh sách chat. Top hiện tại: ${JSON.stringify((listDump || []).slice(0, 12))}`)
    }

    const idMatch = String(target.onclick).match(/openChatConversation\((\d+)\)/)
    if (!idMatch) throw new Error(`Không đọc được id hội thoại từ onclick: ${target.onclick}`)

    await evalValue(send, `window.openChatConversation(${Number(idMatch[1])}, { silent: false }).then(() => true)`, 60000)
    await waitUntil(send, `(() => (document.querySelector('#chatThreadHeader strong')?.textContent || '').toLowerCase().includes(${JSON.stringify(TARGET_BUYER.toLowerCase())}))()`, 30000)
    await sleep(1200)

    const state = await evalValue(send, `(() => {
      const previewButton = [...document.querySelectorAll('#chatConversationList .chat-conversation')].find(node => {
        const text = (node.innerText || '').toLowerCase()
        return text.includes(${JSON.stringify(TARGET_BUYER.toLowerCase())}) && text.includes(${JSON.stringify(TARGET_PLATFORM)})
      })
      const previewText = previewButton ? previewButton.innerText.trim() : ''
      const entryNodes = [...document.querySelectorAll('#chatMessages .chat-message')]
      const entries = entryNodes.map(node => {
        const role = node.classList.contains('self') ? 'shop' : 'buyer'
        const text = (node.innerText || '').replace(/\\s+/g, ' ').trim()
        return { role, text }
      }).filter(item => item.text)
      const counts = new Map()
      entries.forEach(item => {
        const key = item.role + '|' + item.text
        counts.set(key, (counts.get(key) || 0) + 1)
      })
      const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }))
      return {
        title: document.querySelector('#chatThreadHeader strong')?.textContent?.trim() || '',
        previewText,
        entryCount: entries.length,
        entries,
        duplicates,
        fullText: document.getElementById('chatMessages')?.innerText?.trim() || ''
      }
    })()`, 20000)

    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })
    const fs = await import('node:fs/promises')
    await fs.writeFile(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'))

    console.log(JSON.stringify({
      ok: true,
      screenshot: SCREENSHOT_PATH,
      target,
      state
    }, null, 2))
  } finally {
    try {
      connection?.ws?.close()
    } catch {}
    if (tab?._codexCreated) await closeTab(tab.id)
  }
}

run().catch(error => {
  console.error(error?.stack || String(error))
  process.exit(1)
})
