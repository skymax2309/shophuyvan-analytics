import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactDir = path.join(repoRoot, 'artifacts', 'chat-core')
const port = Number(process.env.CODEX_CHROME_PORT || 9333)
const targetUrl = process.env.CODEX_CHAT_CORE_URL || 'http://127.0.0.1:8789/pages/chat-cskh.html'
const profileDir = process.env.CODEX_CHROME_PROFILE || 'E:/codex-chrome-profiles/shophuyvan-test'
const skipSend = process.env.CODEX_CHAT_SKIP_SEND === '1'

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function tryJson(url, init) {
  try {
    const res = await fetch(url, init)
    if (res.ok) return res.json()
  } catch {}
  return null
}

function findChrome() {
  return chromeCandidates.find(file => fs.existsSync(file))
}

async function waitForCdp() {
  for (let i = 0; i < 80; i++) {
    const tabs = await tryJson(`http://127.0.0.1:${port}/json/list`)
    if (Array.isArray(tabs)) return tabs
    await sleep(250)
  }
  throw new Error(`Chrome CDP chưa sẵn sàng ở port ${port}`)
}

async function openChromeIfNeeded() {
  const tabs = await tryJson(`http://127.0.0.1:${port}/json/list`)
  if (Array.isArray(tabs)) return { spawned: null }
  const chrome = findChrome()
  if (!chrome) throw new Error('Không tìm thấy Chrome/Edge để kiểm giao diện.')
  fs.mkdirSync(profileDir, { recursive: true })
  const child = spawn(chrome, [
    `--remote-debugging-port=${port}`,
    `--remote-allow-origins=*`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1366,900',
    '--disable-background-timer-throttling',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore', detached: false })
  await waitForCdp()
  return { spawned: child }
}

async function createTab(url) {
  const created = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (created.ok) return created.json()
  const tabs = await tryJson(`http://127.0.0.1:${port}/json/list`)
  const tab = tabs?.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
  if (!tab) throw new Error('Không tạo được tab kiểm chat.')
  return tab
}

async function connect(tab) {
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  const pending = new Map()
  const notifications = []
  let id = 0
  ws.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result || {})
      return
    }
    notifications.push(message)
  }
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  return {
    ws,
    notifications,
    send(method, params = {}) {
      const callId = ++id
      ws.send(JSON.stringify({ id: callId, method, params }))
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }))
    }
  }
}

async function evalValue(send, expression, timeout = 30000) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
  return result.result?.value
}

async function waitUntil(send, expression, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await evalValue(send, expression, 5000).catch(() => false)
    if (value) return value
    await sleep(250)
  }
  throw new Error(`Timeout chờ điều kiện: ${expression}`)
}

async function capture(send, name) {
  fs.mkdirSync(artifactDir, { recursive: true })
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = path.join(artifactDir, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return file
}

function targetForNavigation() {
  const url = new URL(targetUrl)
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return `${url.origin}/__codex_prime?next=${encodeURIComponent(targetUrl)}`
  }
  return targetUrl
}

function expectsRealtimeOnline() {
  const url = new URL(targetUrl)
  return url.hostname !== '127.0.0.1' && url.hostname !== 'localhost'
}

async function checkViewport(send, viewport) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    mobile: viewport.mobile
  })
  await send('Page.navigate', { url: targetForNavigation() })
  await waitUntil(send, `document.readyState === 'complete'`, 20000)
  await waitUntil(send, `!!document.querySelector('.chat-app')`, 20000)
  await waitUntil(send, `document.querySelectorAll('.conversation-item').length > 0`, 25000)

  const firstState = await evalValue(send, `
    (() => ({
      title: document.title,
      hasNewShell: !!document.querySelector('.chat-shell .chat-sidebar .conversation-list'),
      hasOldShell: !!document.querySelector('#chatMarketplaceApp, .chat-marketplace-page, [data-open-conversation]'),
      conversationCount: document.querySelectorAll('.conversation-item').length,
      text: document.body.innerText,
      overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 2,
      width: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    }))()
  `)
  if (!firstState.hasNewShell || firstState.hasOldShell) throw new Error('Trang vẫn còn shell chat cũ hoặc chưa load shell mới.')
  if (firstState.overflowX) throw new Error(`Layout tràn ngang ở ${viewport.name}: ${firstState.scrollWidth}/${firstState.width}`)

  await evalValue(send, `document.querySelector('.conversation-item')?.click(); true`)
  await waitUntil(send, `document.getElementById('chatApp')?.classList.contains('thread-open')`, 15000)
  await waitUntil(send, `!!document.getElementById('chatInput')`, 15000)
  if (expectsRealtimeOnline()) {
    await waitUntil(send, `document.getElementById('realtimeBanner')?.hasAttribute('hidden')`, 15000)
  }

  const inputState = await evalValue(send, `
    (() => ({
      threadOpen: document.getElementById('chatApp')?.classList.contains('thread-open'),
      disabled: document.getElementById('chatInput')?.disabled,
      hasDetail: !!document.querySelector('.detail-tabs'),
      realtimeBannerHidden: document.getElementById('realtimeBanner')?.hasAttribute('hidden') || false,
      text: document.body.innerText
    }))()
  `)
  if (!inputState.threadOpen) throw new Error(`Không mở thread ở ${viewport.name}.`)
  if (!inputState.hasDetail) throw new Error(`Thiếu panel chi tiết ở ${viewport.name}.`)

  const inputDisabled = Boolean(inputState.disabled)
  let sendCheck = { skipped: inputDisabled || skipSend }
  if (!inputDisabled && !skipSend) {
    const text = `Kiểm tra UI mới ${viewport.name} ${Date.now()}`
    await evalValue(send, `
      (() => {
        const input = document.getElementById('chatInput');
        input.value = ${JSON.stringify(text)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-action="send-message"]').click();
        return true;
      })()
    `)
    sendCheck = await waitUntil(send, `
      (() => {
        const match = [...document.querySelectorAll('.message-row.shop')].find(item => item.textContent.includes(${JSON.stringify(text)}));
        return match ? {
          found: true,
          statusText: match.querySelector('.message-status')?.innerText || '',
          hasRetry: !!match.querySelector('[data-action="retry-message"]')
        } : false;
      })()
    `, 3000)
  }

  await evalValue(send, `document.querySelector('[data-action="toggle-detail"]')?.click(); true`)
  await waitUntil(send, `document.getElementById('chatApp')?.classList.contains('detail-open')`, 5000)
  await evalValue(send, `document.querySelector('[data-detail-tab="sync"]')?.click(); true`)
  const detailState = await evalValue(send, `
    (() => ({
      detailOpen: document.getElementById('chatApp')?.classList.contains('detail-open'),
      hasSyncTab: document.querySelector('.detail-body')?.innerText.includes('Sync ngay') || false,
      visibleText: document.body.innerText.slice(0, 1200),
      overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 2
    }))()
  `)
  if (detailState.overflowX) throw new Error(`Layout tràn ngang sau khi mở chi tiết ở ${viewport.name}.`)

  const screenshot = await capture(send, `chat-operational-${viewport.name}`)
  return {
    viewport: viewport.name,
    shell: firstState,
    input: inputState,
    send: sendCheck,
    detail: detailState,
    screenshot
  }
}

const { spawned } = await openChromeIfNeeded()
const tab = await createTab('about:blank')
const { ws, send, notifications } = await connect(tab)
await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Network.enable')

const results = []
for (const viewport of [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: true },
  { name: 'desktop', width: 1366, height: 900, mobile: false }
]) {
  results.push(await checkViewport(send, viewport))
}

const consoleErrors = notifications
  .filter(item => item.method === 'Runtime.exceptionThrown' || item.method === 'Log.entryAdded' && item.params?.entry?.level === 'error')
  .map(item => item.params?.exceptionDetails?.text || item.params?.entry?.text || item.method)
const httpErrors = notifications
  .filter(item => item.method === 'Network.responseReceived' && item.params?.response?.status >= 400)
  .map(item => ({ status: item.params.response.status, url: item.params.response.url }))

ws.close()
if (spawned) spawned.kill()

console.log(JSON.stringify({
  ok: true,
  targetUrl,
  profile: profileDir,
  consoleErrors,
  httpErrors,
  results
}, null, 2))
