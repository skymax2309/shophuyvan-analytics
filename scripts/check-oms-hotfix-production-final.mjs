import fs from 'node:fs'
import path from 'node:path'

const port = Number(process.env.CODEX_CHROME_PORT || 9355)
const artifactDir = process.env.CODEX_ARTIFACT_DIR || 'E:/shophuyvan-analytics/artifacts/oms-hotfix-20260521-final'
const pageUrl = process.env.CODEX_OMS_URL || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?v=oms-hotfix-20260521-final'

fs.mkdirSync(artifactDir, { recursive: true })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function getJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json()
}

const tabs = await getJson(`http://127.0.0.1:${port}/json/list`)
const tab = tabs.find(item => item.type === 'page' && /oms-dashboard/.test(item.url || '')) || tabs.find(item => item.type === 'page')
if (!tab) throw new Error('Không tìm thấy Chrome tab production OMS.')

const ws = new WebSocket(tab.webSocketDebuggerUrl)
const pending = new Map()
let seq = 0

ws.onmessage = event => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const callback = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) callback.reject(new Error(JSON.stringify(message.error)))
  else callback.resolve(message.result || {})
}

await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

function send(method, params = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

function exceptionToString(details = {}) {
  const description = details.exception?.description || details.text || JSON.stringify(details)
  const stack = (details.stackTrace?.callFrames || [])
    .map(frame => `${frame.functionName || '<anonymous>'}:${frame.lineNumber}:${frame.columnNumber}`)
    .join('\n')
  return `${description}\n${stack}`
}

async function evaluate(expression, timeout = 180000) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  })
  if (result.exceptionDetails) throw new Error(exceptionToString(result.exceptionDetails))
  return result.result?.value
}

async function setViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600
  })
}

async function screenshot(name) {
  const image = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  })
  const file = path.join(artifactDir, name)
  fs.writeFileSync(file, Buffer.from(image.data, 'base64'))
  return file
}

await setViewport(1366, 900)
await send('Page.navigate', { url: pageUrl })
await evaluate(`new Promise(resolve => {
  if (document.readyState === 'complete') resolve(true)
  else window.addEventListener('load', () => resolve(true), { once: true })
})`, 60000)
await sleep(5000)

const browserResult = await evaluate(String.raw`
(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function waitFor(fn, timeout = 60000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        if (fn()) return true
      } catch {}
      await sleep(200)
    }
    throw new Error('wait timeout')
  }
  function hasAny(text, needles) {
    return needles.some(needle => String(text || '').toLowerCase().includes(String(needle).toLowerCase()))
  }
  await waitFor(() => document.getElementById('omsTable'), 60000)
  const mod = await import('/js/modules/oms-render.js?v=oms-hotfix-20260521c')
  async function fetchOrder(id, platform) {
    const query = new URLSearchParams({ page: '1', limit: '20', search: String(id) })
    if (platform) query.set('platform', platform)
    const payload = await fetch('https://huyvan-worker-api.nghiemchihuy.workers.dev/api/orders?' + query.toString(), { cache: 'no-store' }).then(response => response.json())
    const rows = payload.data || []
    const row = rows.find(item => String(item.order_id) === String(id)) || rows[0]
    if (!row) throw new Error('missing api row ' + id)
    return row
  }
  async function renderOne(id, platform) {
    const row = await fetchOrder(id, platform)
    window.__SHV_OMS_FEE_RENDERING = false
    mod.renderTable([row])
    await sleep(500)
    const rowElement = document.getElementById('row-' + String(id))
    if (!rowElement) {
      return {
        api: row,
        rowText: '',
        panelText: '',
        panelDisplay: '',
        renderError: 'renderer did not create row ' + id,
        orderIdFromApi: row.order_id,
        tableHtml: document.getElementById('omsTable')?.innerHTML?.slice(0, 700) || ''
      }
    }
    const trigger = document.querySelector('[data-oms-fee-order="' + CSS.escape(String(id)) + '"]')
    if (trigger) {
      trigger.click()
      await sleep(700)
    }
    const panel = document.querySelector('[data-oms-fee-panel="' + CSS.escape(String(id)) + '"]')
    return {
      api: row,
      rowText: rowElement.innerText || '',
      panelText: panel?.innerText || '',
      panelDisplay: panel ? getComputedStyle(panel).display : ''
    }
  }

  const tx = await renderOne('584123080227784403', 'tiktok')
  const legacy = await renderOne('584117718394898329', 'tiktok')
  const shopee = await renderOne('260520VPM23704', 'shopee')
  mod.renderTable([tx.api, legacy.api, shopee.api])
  await sleep(500)

  if (typeof window.openBotSettings === 'function') window.openBotSettings()
  await waitFor(() => !document.getElementById('botSettingsModal')?.hidden, 30000)
  const modalText = document.getElementById('botSettingsModal')?.innerText || ''
  const actions = ['pull_orders', 'refresh_status', 'sync_detail', 'sync_finance', 'retry_label']
  const resources = [...performance.getEntriesByType('resource')]
    .map(entry => entry.name)
    .filter(name => /oms-(render|fee-render|modals|main)|oms-dashboard-inline/.test(name))
  const costNeedles = [
    'cost setting',
    'Shop chưa có API phí sàn',
    'ESTIMATE',
    'Ước tính hoa hồng',
    'Ước tính phí thanh toán',
    'Ước tính phí Affiliate',
    'Ước tính phí dịch vụ'
  ]

  return {
    url: location.href,
    resources,
    tiktokTransaction: {
      renderError: tx.renderError || '',
      orderIdFromApi: tx.orderIdFromApi || tx.api?.order_id || '',
      tableHtml: tx.tableHtml || '',
      hasSellerCenterBadge: hasAny(tx.panelText + tx.rowText, ['TikTok Seller Center', 'Khấu trừ TikTok đã quét']),
      hasCostSettingRowsOrWarning: hasAny(tx.panelText, costNeedles),
      hasSettlement67755: hasAny(tx.panelText, ['67.755', '67755']),
      hasActual1620: hasAny(tx.panelText, ['Thực nhận về ví 1.620', 'Thực nhận ví 1.620']),
      hasOriginalMissing: hasAny(tx.panelText, ['Giá sản phẩm ban đầu']) && hasAny(tx.panelText, ['Chưa có dữ liệu']),
      hasBuyerShipZero: hasAny(tx.panelText, ['Phí vận chuyển người mua trả']) && hasAny(tx.panelText, ['0đ']),
      rowHasUpdateCost: tx.rowText.includes('Cập nhật Vốn'),
      snippet: tx.panelText.slice(0, 900)
    },
    tiktokLegacy1620: {
      renderError: legacy.renderError || '',
      orderIdFromApi: legacy.orderIdFromApi || legacy.api?.order_id || '',
      tableHtml: legacy.tableHtml || '',
      hasSellerCenterBadge: hasAny(legacy.panelText + legacy.rowText, ['TikTok Seller Center', 'Khấu trừ TikTok đã quét']),
      hasCostSettingRowsOrWarning: hasAny(legacy.panelText, costNeedles),
      hasActual1620: hasAny(legacy.panelText, ['Thực nhận về ví 1.620', 'Thực nhận ví 1.620']),
      hasSfr1620: hasAny(legacy.panelText, ['SFR', 'dịch vụ', 'service']) && hasAny(legacy.panelText, ['1.620', '1620']),
      rowHasUpdateCost: legacy.rowText.includes('Cập nhật Vốn'),
      snippet: legacy.panelText.slice(0, 900)
    },
    shopeeRegression: {
      renderError: shopee.renderError || '',
      orderIdFromApi: shopee.orderIdFromApi || shopee.api?.order_id || '',
      tableHtml: shopee.tableHtml || '',
      rowVisible: shopee.rowText.includes('260520VPM23704'),
      has70030: shopee.panelText.includes('70.030') || String(shopee.api.actual_income).includes('70030'),
      has99000: shopee.panelText.includes('99.000') || String(shopee.api.product_revenue_after_shop_discount).includes('99000'),
      snippet: (shopee.panelText || shopee.rowText).slice(0, 700)
    },
    costButtons: {
      tx: tx.rowText.includes('Cập nhật Vốn'),
      legacy: legacy.rowText.includes('Cập nhật Vốn'),
      shopee: shopee.rowText.includes('Cập nhật Vốn')
    },
    autoModal: Object.fromEntries(actions.map(action => [action, modalText.includes('action_type=' + action) || modalText.includes(action)])),
    desktopOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
  }
})()
`, 180000)

const desktopShot = await screenshot('desktop-1366x900.png')
await setViewport(820, 1180)
await sleep(1200)
const tablet = {
  overflow: await evaluate('document.documentElement.scrollWidth > window.innerWidth + 2'),
  scrollWidth: await evaluate('document.documentElement.scrollWidth'),
  innerWidth: await evaluate('window.innerWidth')
}
const tabletShot = await screenshot('tablet-820x1180.png')
await setViewport(390, 844)
await sleep(1200)
const mobile = {
  overflow: await evaluate('document.documentElement.scrollWidth > window.innerWidth + 2'),
  scrollWidth: await evaluate('document.documentElement.scrollWidth'),
  innerWidth: await evaluate('window.innerWidth')
}
const mobileShot = await screenshot('mobile-390x844.png')
ws.close()

console.log(JSON.stringify({
  browserResult,
  screenshots: { desktopShot, tabletShot, mobileShot },
  responsive: { tablet, mobile }
}, null, 2))
