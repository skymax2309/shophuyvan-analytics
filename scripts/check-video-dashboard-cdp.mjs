import fs from 'node:fs/promises'
import path from 'node:path'

const DEBUG_BASE = 'http://127.0.0.1:9333'
const API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, '.browser-profiles', 'video-dashboard-check')
const TARGET_URL = `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/dashboard_video.html?verify=video-dashboard-20260506&t=${Date.now()}`
const LOGIN_URL = 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/login.html'

const VERIFY_USERNAME = process.env.SHV_VERIFY_USERNAME || ''
const VERIFY_PASSWORD = process.env.SHV_VERIFY_PASSWORD || ''

if (!VERIFY_USERNAME || !VERIFY_PASSWORD) {
  throw new Error('Thiếu SHV_VERIFY_USERNAME hoặc SHV_VERIFY_PASSWORD để đăng nhập kiểm tra.')
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const pending = new Map()
    let seq = 0

    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = ++seq
          ws.send(JSON.stringify({ id, method, params }))
          return new Promise((res, rej) => pending.set(id, { res, rej, method }))
        },
        close() {
          ws.close()
        }
      })
    })

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (!msg.id || !pending.has(msg.id)) return
      const item = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) item.rej(new Error(`${item.method}: ${msg.error.message}`))
      else item.res(msg.result)
    })

    ws.addEventListener('error', reject)
  })
}

async function loginForVerification() {
  const response = await fetch(`${API_BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: VERIFY_USERNAME,
      password: VERIFY_PASSWORD
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.ok || !data?.token || !data?.user) {
    throw new Error(data?.error || 'Không lấy được phiên đăng nhập kiểm tra.')
  }
  return data
}

async function openCheckTab(url) {
  const response = await fetch(`${DEBUG_BASE}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`Không mở được tab debug mới. HTTP ${response.status}`)
  return response.json()
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true
  })
  return result.result.value
}

async function capture(cdp, fileName) {
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true
  })
  const filePath = path.join(OUT_DIR, fileName)
  await fs.writeFile(filePath, Buffer.from(screenshot.data, 'base64'))
  return filePath
}

function summaryExpression() {
  return `(() => {
    const text = (selector) => {
      const node = document.querySelector(selector)
      return node ? (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim() : ''
    }
    const count = (selector) => document.querySelectorAll(selector).length
    return {
      title: document.title,
      url: location.href,
      isLogin: location.pathname.includes('/pages/login.html') || location.pathname.includes('/pages/login'),
      selectedShop: document.querySelector('#videoShopSelect')?.value || '',
      statusText: text('#videoStatusBox'),
      capabilityCards: count('#videoCapabilityRows .video-capability-card'),
      overviewCards: count('#videoOverviewGrid .video-kpi-card'),
      topVideoCards: count('#videoTopList .video-top-card'),
      topProductCards: count('#videoTopProductList .video-item-card'),
      libraryCards: count('#videoLibraryList .video-library-card'),
      warningCount: count('#videoWarningsList .video-warning-item'),
      activeTab: document.querySelector('[data-video-tab].active')?.dataset.videoTab || '',
      bodyWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }
  })()`
}

await fs.mkdir(OUT_DIR, { recursive: true })
const loginData = await loginForVerification()

const tab = await openCheckTab(LOGIN_URL)
const cdp = await connect(tab.webSocketDebuggerUrl)

await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
await cdp.send('Network.enable')
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

// Gắn phiên đăng nhập vào localStorage ngay trên origin thật để auth-guard cho qua.
await wait(2500)
await cdp.send('Runtime.evaluate', {
  expression: `
    localStorage.setItem('shv_admin_token', ${JSON.stringify(loginData.token)});
    localStorage.setItem('shv_admin_user', ${JSON.stringify(JSON.stringify(loginData.user))});
    location.href = ${JSON.stringify(TARGET_URL)};
    true;
  `,
  returnByValue: true
})

// Kiểm tra desktop.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false
})
await wait(5000)
let desktopSummary = await evaluate(cdp, summaryExpression())
if (desktopSummary.isLogin) {
  throw new Error('Trang video vẫn bị chuyển về login dù đã gắn phiên kiểm tra.')
}

await cdp.send('Runtime.evaluate', {
  expression: `document.querySelector('#videoSyncBtn')?.click(); true;`,
  returnByValue: true
})
await wait(5000)
desktopSummary = await evaluate(cdp, summaryExpression())

await cdp.send('Runtime.evaluate', {
  expression: `document.querySelector('[data-action="select-video"]')?.click(); true;`,
  returnByValue: true
})
await wait(1500)
const desktopDetail = await evaluate(cdp, `(() => {
  const text = (selector) => {
    const node = document.querySelector(selector)
    return node ? (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim() : ''
  }
  return {
    detailText: text('#videoDetailWrap').slice(0, 800),
    editPanelText: text('#videoEditPanel').slice(0, 800),
    uploadPanelText: text('#videoUploadPanel').slice(0, 800)
  }
})()`)
const desktopScreenshot = await capture(cdp, 'video-dashboard-desktop.png')

// Kiểm tra tab kho video đóng gói.
await cdp.send('Runtime.evaluate', {
  expression: `document.querySelector('[data-video-tab="packing"]')?.click(); true;`,
  returnByValue: true
})
await wait(600)
await cdp.send('Runtime.evaluate', {
  expression: `document.querySelector('#packingSearchBtn')?.click(); true;`,
  returnByValue: true
})
await wait(2500)
const packingSummary = await evaluate(cdp, `(() => {
  const text = (selector) => {
    const node = document.querySelector(selector)
    return node ? (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim() : ''
  }
  return {
    activeTab: document.querySelector('[data-video-tab].active')?.dataset.videoTab || '',
    packingCards: document.querySelectorAll('#packingVideoList .video-packing-card').length,
    packingText: text('#packingVideoList').slice(0, 1200)
  }
})()`)
const packingScreenshot = await capture(cdp, 'video-dashboard-packing.png')

// Kiểm tra mobile-first.
await cdp.send('Runtime.evaluate', {
  expression: `document.querySelector('[data-video-tab="center"]')?.click(); true;`,
  returnByValue: true
})
await wait(400)
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
})
await cdp.send('Page.navigate', { url: TARGET_URL })
await wait(4500)
const mobileSummary = await evaluate(cdp, summaryExpression())
const mobileScreenshot = await capture(cdp, 'video-dashboard-mobile.png')

const summary = {
  targetUrl: TARGET_URL,
  desktopSummary,
  desktopDetail,
  packingSummary,
  mobileSummary,
  desktopScreenshot,
  packingScreenshot,
  mobileScreenshot
}

const summaryPath = path.join(OUT_DIR, 'summary.json')
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
cdp.close()

console.log(JSON.stringify({ summaryPath, ...summary }, null, 2))
