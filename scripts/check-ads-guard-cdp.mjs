import fs from 'node:fs/promises'
import path from 'node:path'

const DEBUG_BASE = 'http://127.0.0.1:9333'
const API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const WEB_BASE = 'https://shophuyvan-analytics.nghiemchihuy.workers.dev'
const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, '.browser-profiles', 'ads-guard-check')
const LOGIN_URL = `${WEB_BASE}/pages/login.html`
const TARGET_URL = `${WEB_BASE}/pages/ads.html?verify=ads-guard-${Date.now()}`

const VERIFY_USERNAME = process.env.SHV_VERIFY_USERNAME || ''
const VERIFY_PASSWORD = process.env.SHV_VERIFY_PASSWORD || ''

if (!VERIFY_USERNAME || !VERIFY_PASSWORD) {
  throw new Error('Thiếu SHV_VERIFY_USERNAME hoặc SHV_VERIFY_PASSWORD để đăng nhập kiểm tra ADS.')
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `${url} lỗi HTTP ${res.status}`)
  return data
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

    ws.addEventListener('message', event => {
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

async function openCheckTab(url) {
  const response = await fetch(`${DEBUG_BASE}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`Không mở được tab debug mới. HTTP ${response.status}`)
  return response.json()
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
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

async function waitFor(cdp, expression, timeoutMs = 15000, intervalMs = 350) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await evaluate(cdp, expression)
    if (ok) return true
    await wait(intervalMs)
  }
  throw new Error(`Hết thời gian chờ điều kiện: ${expression}`)
}

function summaryExpression() {
  return `(() => {
    const text = (selector) => {
      const node = document.querySelector(selector)
      return node ? (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim() : ''
    }
    const value = (selector) => document.querySelector(selector)?.value || ''
    return {
      title: document.title,
      url: location.href,
      isLogin: location.pathname.includes('/pages/login.html'),
      capabilityCards: document.querySelectorAll('#adsGuardCapabilityList .ads-guard-capability-card').length,
      logItems: document.querySelectorAll('#adsGuardLogs .ads-guard-log-item').length,
      productRows: document.querySelectorAll('#adsProductTable tbody tr').length,
      shopCards: document.querySelectorAll('#adsShopList .ads-shop-card').length,
      selectedShop: value('#adsGuardShop'),
      selectedScope: value('#adsGuardScope'),
      selectedRoute: value('#adsGuardRoute'),
      selectedAction: value('#adsGuardAction'),
      entityId: value('#adsGuardEntityId'),
      resultText: text('#adsGuardResult'),
      summaryText: text('#adsGuardSummary'),
      bodyWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }
  })()`
}

async function loginForVerification() {
  return fetchJson(`${API_BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: VERIFY_USERNAME,
      password: VERIFY_PASSWORD
    })
  })
}

await fs.mkdir(OUT_DIR, { recursive: true })

const loginData = await loginForVerification()
const tab = await openCheckTab(LOGIN_URL)
const cdp = await connect(tab.webSocketDebuggerUrl)

await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
await cdp.send('Network.enable')
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

// Gắn phiên đăng nhập thật vào origin web trước khi vào trang ADS.
await wait(1500)
await cdp.send('Runtime.evaluate', {
  expression: `
    localStorage.setItem('shv_admin_token', ${JSON.stringify(loginData.token)});
    localStorage.setItem('shv_admin_user', ${JSON.stringify(JSON.stringify(loginData.user))});
    location.href = ${JSON.stringify(TARGET_URL)};
    true;
  `,
  returnByValue: true
})

// Kiểm tra desktop trước để xác minh luồng guard trên trang thật.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false
})

await waitFor(cdp, `(() => !!window.previewAdsCampaignGuard && !!document.querySelector('#adsGuardPanel'))()`)
await waitFor(cdp, `(() => document.querySelectorAll('#adsGuardCapabilityList .ads-guard-capability-card').length >= 3)()`, 20000)
await waitFor(cdp, `(() => document.querySelectorAll('#adsShopList .ads-shop-card').length >= 1)()`, 20000)

const baseSummary = await evaluate(cdp, summaryExpression())
if (baseSummary.isLogin) {
  throw new Error('Trang ADS vẫn bị chuyển về login dù đã gắn phiên kiểm tra.')
}

// Bấm nút Tắt/Bật ADS ngay trên SKU Shopee để xác minh hệ thống chuyển sang guard thay vì gọi trực tiếp.
await evaluate(cdp, `(() => {
  const button = [...document.querySelectorAll('button')]
    .find((node) => /Tắt ADS|Bật ADS/.test((node.innerText || node.textContent || '').trim()))
  if (!button) return false
  button.click()
  return true
})()`)
await wait(1800)
const shopeeToggleSummary = await evaluate(cdp, summaryExpression())

// Preview shop không có API để chắc chắn nhánh fallback trả về hướng dẫn tiếng Việt.
await evaluate(cdp, `(() => {
  const shop = document.querySelector('#adsGuardShop')
  shop.value = 'phambich2312'
  window.onAdsGuardShopChanged?.()
  const entity = document.querySelector('#adsGuardEntityId')
  entity.value = '164309930'
  return true
})()`)
await evaluate(cdp, 'window.previewAdsCampaignGuard()')
await wait(1200)
const manualFallbackSummary = await evaluate(cdp, summaryExpression())

// Preview Lazada campaign để xác minh payload budget/status và log request sign info.
await evaluate(cdp, `(() => {
  document.querySelector('#adsGuardShop').value = 'kinhdoanhonlinegiasoc@gmail.com'
  window.onAdsGuardShopChanged?.()
  document.querySelector('#adsGuardScope').value = 'campaign'
  window.onAdsGuardScopeChanged?.()
  document.querySelector('#adsGuardRoute').value = 'lazada_campaign'
  window.onAdsGuardRouteChanged?.()
  document.querySelector('#adsGuardAction').value = 'change_budget'
  window.onAdsGuardActionChanged?.()
  document.querySelector('#adsGuardEntityId').value = '123456789'
  document.querySelector('#adsGuardBudget').value = '250000'
  document.querySelector('#adsGuardStatusValue').value = '1'
  document.querySelector('#adsGuardBizCode').value = 'sponsoredSearch'
  return true
})()`)
await evaluate(cdp, 'window.previewAdsCampaignGuard()')
await wait(1800)
const lazadaPreviewSummary = await evaluate(cdp, summaryExpression())

const desktopScreenshot = await capture(cdp, 'ads-guard-desktop.png')

// Kiểm tra mobile-first sau cùng để chắc chắn panel mới không tràn ngang.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
})
await cdp.send('Page.navigate', { url: TARGET_URL })
await waitFor(cdp, `(() => !!window.previewAdsCampaignGuard && !!document.querySelector('#adsGuardPanel'))()`, 20000)
await waitFor(cdp, `(() => document.querySelectorAll('#adsGuardCapabilityList .ads-guard-capability-card').length >= 3)()`, 20000)
const mobileSummary = await evaluate(cdp, summaryExpression())
const mobileScreenshot = await capture(cdp, 'ads-guard-mobile.png')

const summary = {
  targetUrl: TARGET_URL,
  baseSummary,
  shopeeToggleSummary,
  manualFallbackSummary,
  lazadaPreviewSummary,
  mobileSummary,
  desktopScreenshot,
  mobileScreenshot
}

const summaryPath = path.join(OUT_DIR, 'summary.json')
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8')

cdp.close()

console.log(JSON.stringify({ summaryPath, ...summary }, null, 2))
