import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profileDir = path.join(repoRoot, '.codex-chrome-profile')
const artifactDir = path.join(repoRoot, 'artifacts')
const screenshotPath = path.join(artifactDir, 'order-analytics-browser-check.png')
const port = Number(process.env.CODEX_CHROME_PORT || 9333)
const url = process.env.CODEX_CHECK_URL || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/profit-dashboard.html?v=order-analytics-cpo-20260504#netprofit'
const from = process.env.CODEX_CHECK_FROM || '2026-05-03'
const to = process.env.CODEX_CHECK_TO || '2026-05-04'

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
]

function findChrome() {
  return chromeCandidates.find(file => fs.existsSync(file))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function tryJson(target) {
  try {
    const response = await fetch(target)
    if (response.ok) return await response.json()
  } catch {}
  return null
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
  const existing = await tryJson(`http://127.0.0.1:${port}/json/list`)
  if (Array.isArray(existing)) return { spawned: null, tabs: existing }
  const chrome = findChrome()
  if (!chrome) throw new Error('Không tìm thấy Chrome/Edge để kiểm tra giao diện thật.')
  fs.mkdirSync(profileDir, { recursive: true })
  const child = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--profile-directory=CodexCheck',
    '--window-size=1440,1000',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    'about:blank'
  ], { stdio: 'ignore', detached: false })
  const tabs = await waitForCdp()
  return { spawned: child, tabs }
}

async function connect(tabInfo) {
  const ws = new WebSocket(tabInfo.webSocketDebuggerUrl)
  const pending = new Map()
  const events = []
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
    if (message.method) events.push(message)
  }
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  const send = (method, params = {}) => {
    const callId = ++id
    ws.send(JSON.stringify({ id: callId, method, params }))
    return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }))
  }
  return { ws, send, events }
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
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ok = await evalValue(send, expression, 5000).catch(() => false)
    if (ok) return true
    await sleep(300)
  }
  throw new Error('Điều kiện giao diện không đạt trong thời gian chờ.')
}

async function run() {
  const { spawned, tabs } = await openChromeIfNeeded()
  let connection
  try {
    const tabInfo = tabs[0]
    connection = await connect(tabInfo)
    const { send } = connection
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.navigate', { url })
    await waitUntil(send, `location.href.includes('profit-dashboard')`, 30000)
    await waitUntil(send, `document.readyState === 'complete'`, 30000)
    await waitUntil(send, `typeof window.loadOrderAnalytics === 'function' && !!document.getElementById('tab-netprofit')`, 30000)
    await waitUntil(send, `(() => {
      const text = document.getElementById('orderAnalyticsStatus')?.textContent || '';
      return text && !text.startsWith('Đang ');
    })()`, 60000).catch(() => {})

    await evalValue(send, `
      (() => {
        window.__codexCheckErrors = [];
        window.addEventListener('error', e => window.__codexCheckErrors.push(e.message));
        window.addEventListener('unhandledrejection', e => window.__codexCheckErrors.push(String(e.reason && (e.reason.message || e.reason) || e.reason)));
        document.getElementById('filterFrom').value = ${JSON.stringify(from)};
        document.getElementById('filterTo').value = ${JSON.stringify(to)};
        window.showTab('netprofit');
        document.querySelector('.netprofit-actions .strong')?.click();
        return true;
      })()
    `)

    const started = Date.now()
    let state = null
    while (Date.now() - started < 130000) {
      state = await evalValue(send, `
        (() => ({
          active: !!document.querySelector('#tab-netprofit.active'),
          status: document.getElementById('orderAnalyticsStatus')?.textContent || '',
          kpis: document.querySelectorAll('#orderAnalyticsKpis .netprofit-kpi').length,
          rows: document.querySelectorAll('#orderAnalyticsTable tr').length,
          firstRow: document.querySelector('#orderAnalyticsTable tr')?.innerText || '',
          source: document.getElementById('orderAnalyticsSource')?.innerText || '',
          errors: window.__codexCheckErrors || []
        }))()
      `, 10000)
      if (/^Đã tải/.test(state.status) || /^Da tai/.test(state.status) || /Không tải được/.test(state.status)) break
      await sleep(2000)
    }

    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.mkdirSync(artifactDir, { recursive: true })
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))

    const ok = !!state?.active && Number(state?.kpis || 0) >= 6 && Number(state?.rows || 0) > 0 && /^Đã tải/.test(state?.status || '') && /CPO/.test(state?.status || '')
    console.log(JSON.stringify({
      ok,
      url,
      profileDir,
      screenshotPath,
      ...state
    }, null, 2))
    if (!ok) process.exitCode = 1
  } finally {
    connection?.ws?.close()
    spawned?.kill()
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
