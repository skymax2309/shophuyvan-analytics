import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profileDir = path.join(repoRoot, '.codex-chrome-profile')
const artifactDir = path.join(repoRoot, 'artifacts')
const screenshotPath = path.join(artifactDir, 'oms-logistics-browser-check.png')
const port = Number(process.env.CODEX_CHROME_PORT || 9333)
const url = process.env.CODEX_CHECK_URL || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?v=logistics-20260504'

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
  throw new Error(`Chrome CDP is not ready on port ${port}`)
}

async function openChromeIfNeeded() {
  const existing = await tryJson(`http://127.0.0.1:${port}/json/list`)
  if (Array.isArray(existing)) return { spawned: null, tabs: existing }
  const chrome = findChrome()
  if (!chrome) throw new Error('Chrome/Edge was not found for browser verification.')
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
  let id = 0
  ws.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result || {})
    }
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
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ok = await evalValue(send, expression, 5000).catch(() => false)
    if (ok) return true
    await sleep(300)
  }
  throw new Error('Browser condition was not reached in time.')
}

async function run() {
  const { spawned, tabs } = await openChromeIfNeeded()
  let connection
  try {
    connection = await connect(tabs[0])
    const { send } = connection
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.navigate', { url })
    await waitUntil(send, `location.href.includes('oms-dashboard')`, 30000)
    await waitUntil(send, `document.readyState === 'complete'`, 30000)
    await waitUntil(send, `typeof window.openShopeeOperations === 'function'`, 45000)
    await evalValue(send, `
      (() => {
        window.__codexCheckErrors = [];
        window.addEventListener('error', e => window.__codexCheckErrors.push(e.message));
        window.addEventListener('unhandledrejection', e => window.__codexCheckErrors.push(String(e.reason && (e.reason.message || e.reason) || e.reason)));
        window.openShopeeOperations();
        return true;
      })()
    `)
    await waitUntil(send, `document.querySelector('#shopeeOpsModal.open')`, 30000)
    await waitUntil(send, `(() => {
      const text = document.getElementById('shopeeOpsContent')?.innerText || '';
      return text && !text.includes('Đang tải dữ liệu vận hành Shopee');
    })()`, 90000)
    await evalValue(send, `window.loadShopeeAddressList()`)
    await waitUntil(send, `(() => {
      const text = document.getElementById('shopeeOpsAddressPanel')?.innerText || '';
      return text.includes('Địa chỉ kho') || text.includes('Không lấy được địa chỉ kho');
    })()`, 60000)

    const state = await evalValue(send, `
      (() => ({
        url: location.href,
        modalVisible: !!document.querySelector('#shopeeOpsModal.open'),
        title: document.querySelector('#shopeeOpsModal .modal-title')?.textContent || '',
        kpis: document.querySelectorAll('#shopeeOpsContent .shopee-ops-kpi').length,
        orderRows: Math.max(0, document.querySelectorAll('#shopeeOpsContent .shopee-ops-table tbody tr').length),
        hasCarrierPanel: (document.getElementById('shopeeOpsContent')?.innerText || '').includes('Hiệu suất đơn vị vận chuyển'),
        hasTrackingText: (document.getElementById('shopeeOpsContent')?.innerText || '').toLowerCase().includes('tracking'),
        hasMassDryRun: (document.getElementById('shopeeOpsModal')?.innerText || '').includes('Dry-run xử lý loạt'),
        hasAddressPanel: !!document.querySelector('#shopeeOpsAddressPanel .shopee-ops-panel, #shopeeOpsAddressPanel .shopee-ops-warnings'),
        addressText: document.getElementById('shopeeOpsAddressPanel')?.innerText?.slice(0, 240) || '',
        errors: window.__codexCheckErrors || []
      }))()
    `)

    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.mkdirSync(artifactDir, { recursive: true })
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))

    const ok = state.modalVisible &&
      state.title.includes('Logistics') &&
      state.kpis >= 6 &&
      state.orderRows > 0 &&
      state.hasCarrierPanel &&
      state.hasTrackingText &&
      state.hasMassDryRun &&
      state.hasAddressPanel &&
      state.errors.length === 0

    console.log(JSON.stringify({
      ok,
      screenshotPath,
      profileDir,
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
