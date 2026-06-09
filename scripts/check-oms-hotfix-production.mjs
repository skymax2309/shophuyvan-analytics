import fs from 'node:fs'
import path from 'node:path'

const port = Number(process.env.CODEX_CHROME_PORT || 9333)
const pageUrl = process.env.CODEX_CHECK_URL || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?v=oms-hotfix-20260520c'
const artifactDir = process.env.CODEX_ARTIFACT_DIR || 'E:/shophuyvan-analytics/artifacts/oms-hotfix-20260520'

fs.mkdirSync(artifactDir, { recursive: true })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function getJson(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`)
  return res.json()
}

async function getTab() {
  const tabs = await getJson(`http://127.0.0.1:${port}/json/list`)
  return tabs.find(tab => tab.type === 'page' && /oms-dashboard/.test(tab.url || '')) || tabs.find(tab => tab.type === 'page')
}

async function connect(tab) {
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
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

async function evalValue(send, expression, timeout = 120000) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails))
  return result.result?.value
}

async function waitFor(send, expression, timeout = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ok = await evalValue(send, expression, 5000).catch(() => false)
    if (ok) return true
    await sleep(300)
  }
  throw new Error(`Timeout waiting for ${expression}`)
}

async function screenshot(send, name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = path.join(artifactDir, name)
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return file
}

async function setViewport(send, width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
}

const browserCheckExpression = `
  (async () => {
    const API = 'https://huyvan-worker-api.nghiemchihuy.workers.dev';
    const today = '2026-05-20';
    const skipLabelLive = ${process.env.CODEX_SKIP_LABEL_LIVE === '1' ? 'true' : 'false'};
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function waitFor(fn, timeout = 60000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try { if (fn()) return true; } catch {}
        await sleep(250);
      }
      throw new Error('browser wait timeout');
    }
    async function getJson(path, options = {}) {
      const res = await fetch(path.startsWith('http') ? path : API + path, options);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || payload.error || 'HTTP ' + res.status);
      return payload;
    }
    async function getOrders(params) {
      const query = new URLSearchParams({ page: '1', limit: '100', ...params });
      return getJson('/api/orders?' + query.toString());
    }
    function rowText(orderId) {
      const row = document.getElementById('row-' + CSS.escape(String(orderId || '')));
      return row?.innerText || '';
    }
    async function loadOrderInTable(order) {
      document.getElementById('f_platform').value = order.platform || '';
      if (typeof window.onPlatformFilterChange === 'function') await window.onPlatformFilterChange(order.platform || '');
      await sleep(700);
      const search = document.getElementById('f_search');
      search.removeAttribute('readonly');
      search.value = order.order_id || '';
      await window.loadOrders(1);
      await waitFor(() => document.getElementById('row-' + CSS.escape(String(order.order_id))), 60000);
    }
    async function openDrawerFor(order) {
      await loadOrderInTable(order);
      const btn = document.querySelector('[data-logistics-detail="' + CSS.escape(String(order.order_id)) + '"]');
      if (!btn) throw new Error('missing logistics button ' + order.order_id);
      btn.click();
      await waitFor(() => document.querySelector('#logisticsOrderDrawer .logistics-detail-panel'), 60000);
      await waitFor(() => {
        const text = document.querySelector('#logisticsOrderDrawer')?.innerText || '';
        return !text.includes('Đang đọc timeline vận chuyển');
      }, 90000).catch(() => true);
      await sleep(1200);
      return document.querySelector('#logisticsOrderDrawer')?.innerText || '';
    }
    function financeState(row) {
      return {
        order_id: row.order_id,
        revenue: row.revenue,
        profit_real: row.profit_real,
        profit_label: row.profit_label || row.fee_breakdown?.totals?.profit_label || '',
        actual_income_available: row.actual_income_available,
        fee_source: row.fee_source || row.fee_breakdown?.taxonomy?.finance_source || '',
        settlement_status: row.settlement_status,
        sync_status: row.sync_completeness_status,
        sync_label: row.sync_completeness_label,
        fee_badge: row.fee_display_badge
      };
    }

    const lazadaOrders = (await getOrders({ platform: 'lazada', shop: 'kinhdoanhonlinegiasoc@gmail.com' })).data || [];
    const lazadaSample = lazadaOrders[0] || null;
    const lazadaFinance = lazadaOrders.slice(0, 20).map(financeState);
    const lazadaFinanceConflict = lazadaFinance.filter(row => row.actual_income_available === false && row.profit_label === 'Lãi thực');
    const lazadaMissingFinanceRows = lazadaFinance.filter(row => row.actual_income_available === false || row.sync_status === 'missing_finance');

    let lazadaDrawerText = '';
    if (lazadaSample) lazadaDrawerText = await openDrawerFor(lazadaSample);
    const lazadaTimelineContradiction = lazadaDrawerText.includes('Đã có timeline vận chuyển') && lazadaDrawerText.includes('Chưa có lịch trình vận chuyển');
    const lazadaInternalTimelineLabeled = !lazadaDrawerText.includes('Đã có timeline vận chuyển') ? lazadaDrawerText.includes('Timeline vận hành nội bộ') : true;
    const lazadaImageStats = (() => {
      const placeholders = [...document.querySelectorAll('.product-img-placeholder')].map(el => {
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height), text: el.textContent.trim() };
      });
      const productCells = [...document.querySelectorAll('.product-cell')].map(el => Math.round(el.getBoundingClientRect().height));
      const rows = [...document.querySelectorAll('#omsTable tr')].map(el => Math.round(el.getBoundingClientRect().height));
      return { placeholders, maxProductCellHeight: Math.max(0, ...productCells), maxRowHeight: Math.max(0, ...rows), rowCount: rows.length };
    })();

    const shopeeOrders = [];
    for (const shop of ['chihuy2309', 'chihuy1984', 'phambich2312']) {
      const rows = ((await getOrders({ platform: 'shopee', shop })).data || []).map(row => ({ ...row, __shop: shop }));
      shopeeOrders.push(...rows);
    }
    const shopeeTrackingSample = shopeeOrders.find(row => String(row.tracking_number || row.tracking_core_tracking_number || '').trim() || Number(row.tracking_events_count || 0) > 0) || shopeeOrders[0] || null;
    let shopeeDrawerText = '';
    let shopeeRowText = '';
    if (shopeeTrackingSample) {
      shopeeDrawerText = await openDrawerFor(shopeeTrackingSample);
      shopeeRowText = rowText(shopeeTrackingSample.order_id);
    }
    const shopeeTrackingConflict = Boolean(shopeeTrackingSample && (
      (String(shopeeTrackingSample.tracking_number || shopeeTrackingSample.tracking_core_tracking_number || '').trim() && shopeeDrawerText.includes('Chưa có tracking'))
      || (String(shopeeTrackingSample.tracking_number || shopeeTrackingSample.tracking_core_tracking_number || '').trim() && shopeeRowText.includes('Thiếu tracking'))
    ));

    const staleSellerCenter = {};
    for (const shop of ['chihuy2309', 'chihuy1984', 'phambich2312']) {
      const rows = shopeeOrders.filter(row => row.__shop === shop).slice(0, 20);
      staleSellerCenter[shop] = {
        checked: rows.length,
        badRows: rows.filter(row => {
          const text = [row.sync_completeness_label, row.sync_completeness_reason, row.last_status_sync_error, row.source_label, row.status_source].join(' ');
          return /Seller Center URL detail|seller_center_detail_url_not_found|api_shop_routed_to_seller_center|Cần đồng bộ Seller Center/i.test(text);
        }).map(row => ({ order_id: row.order_id, sync: row.sync_completeness_label, reason: row.sync_completeness_reason, error: row.last_status_sync_error, source: row.source_label }))
      };
    }
    const eligibleChihuy2309 = await getJson('/api/orders/shopee-seller-detail/eligible?shop=chihuy2309&limit=5').catch(error => ({ error: error.message }));
    const manualSyncChihuy2309 = await getJson('/api/orders/manual-sync/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: 'refresh_status', platform: 'shopee', shop_id: 'chihuy2309', from: today, to: today, dry_run: true, limit: 1 })
    }).catch(error => ({ error: error.message }));

    const labelRows = shopeeOrders.concat(lazadaOrders).filter(row => ['pending_document_generation', 'shopee_pdf_not_ready', 'pending_retry'].includes(String(row.label_status || '').toLowerCase()));
    const labelPending = labelRows.slice(0, 10).map(row => ({
      order_id: row.order_id,
      platform: row.platform,
      shop: row.shop,
      label_status: row.label_status,
      next_retry_at: row.next_retry_at || '',
      last_label_error: row.last_label_error || '',
      sync_label: row.sync_completeness_label
    }));

    const topbarActions = (() => {
      const buttons = [...document.querySelectorAll('button')].map(button => ({ id: button.id || '', text: (button.textContent || '').trim(), onclick: button.getAttribute('onclick') || '' }));
      return {
        hasAutoButton: buttons.some(button => button.onclick.includes('openBotSettings')),
        hasRefreshOnlyButton: buttons.some(button => button.onclick.includes('refreshOrdersView')),
        hasResyncButton: !!document.getElementById('btnResyncPanel'),
        hasManualPull: buttons.some(button => button.onclick.includes('triggerBotScrape')),
        hasManualStatus: buttons.some(button => button.onclick.includes('triggerBotStatus'))
      };
    })();
    window.openBotSettings();
    await waitFor(() => !document.getElementById('botSettingsModal')?.hidden, 30000);
    await waitFor(() => document.querySelectorAll('#botSettingsModal .bot-action-toggle').length >= 5, 60000);
    const actionTypes = ['pull_orders', 'refresh_status', 'sync_detail', 'sync_finance', 'retry_label'];
    const modalText = document.getElementById('botSettingsModal')?.innerText || '';
    const autoModal = {
      visible: !document.getElementById('botSettingsModal')?.hidden,
      title: document.querySelector('#botSettingsModal .modal-title')?.textContent?.trim() || '',
      actionTypes: actionTypes.map(action => ({ action, present: modalText.includes('action_type=' + action) })),
      toggleIds: actionTypes.map(action => {
        const key = action === 'pull_orders' ? 'auto_order_enabled'
          : action === 'refresh_status' ? 'auto_status_enabled'
          : action === 'sync_detail' ? 'auto_detail_enabled'
          : action === 'sync_finance' ? 'auto_finance_enabled'
          : 'auto_label_enabled';
        return { action, exists: !!document.getElementById('bot_' + key), checked: !!document.getElementById('bot_' + key)?.checked };
      }),
      intervalInputs: ['bot_order_min', 'bot_status_min', 'bot_detail_min', 'bot_finance_min', 'bot_label_min'].map(id => ({ id, exists: !!document.getElementById(id), value: document.getElementById(id)?.value || '' })),
      manualActionButtons: [...document.querySelectorAll('#botSettingsModal button')].some(button => (button.getAttribute('onclick') || '').includes('triggerBotScrape') || (button.getAttribute('onclick') || '').includes('triggerBotStatus') || (button.getAttribute('onclick') || '').includes('manual-sync/backfill'))
    };
    const desktopOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;

    return {
      page: location.href,
      moduleVersionLoaded: [...document.scripts].map(s => s.src).filter(Boolean).join('\\n'),
      lazadaFinance,
      lazadaFinanceConflict,
      lazadaMissingFinanceRows,
      lazadaSample: lazadaSample ? lazadaSample.order_id : '',
      lazadaDrawerHasApiTimeline: lazadaDrawerText.includes('Đã có timeline vận chuyển'),
      lazadaDrawerHasNoTimeline: lazadaDrawerText.includes('Chưa có lịch trình vận chuyển'),
      lazadaTimelineContradiction,
      lazadaInternalTimelineLabeled,
      lazadaDrawerSnippet: lazadaDrawerText.slice(0, 900),
      lazadaImageStats,
      shopeeTrackingSample: shopeeTrackingSample ? { order_id: shopeeTrackingSample.order_id, shop: shopeeTrackingSample.__shop, tracking_number: shopeeTrackingSample.tracking_number, tracking_core_tracking_number: shopeeTrackingSample.tracking_core_tracking_number, events: shopeeTrackingSample.tracking_events_count } : null,
      shopeeTrackingConflict,
      shopeeDrawerSnippet: shopeeDrawerText.slice(0, 900),
      shopeeRowSnippet: shopeeRowText.slice(0, 900),
      staleSellerCenter,
      eligibleChihuy2309,
      manualSyncChihuy2309,
      labelPending,
      topbarActions,
      autoModal,
      desktopOverflow
    };
  })()
`

async function main() {
  const tab = await getTab()
  if (!tab) throw new Error(`No Chrome page target on CDP port ${port}`)
  const { ws, send } = await connect(tab)
  try {
    await send('Page.enable')
    await send('Runtime.enable')
    await setViewport(send, 1366, 900)
    await send('Page.navigate', { url: pageUrl })
    await waitFor(send, `document.readyState === 'complete'`, 60000)
    await waitFor(send, `typeof window.loadOrders === 'function' && typeof window.openBotSettings === 'function'`, 90000)
    await waitFor(send, `document.querySelector('#omsTable')`, 60000)

    const summary = await evalValue(send, browserCheckExpression, 180000)
    const desktopShot = await screenshot(send, 'desktop-1366x900.png')

    const responsive = []
    for (const vp of [
      { name: 'tablet-820x1180.png', width: 820, height: 1180 },
      { name: 'mobile-390x844.png', width: 390, height: 844 }
    ]) {
      await setViewport(send, vp.width, vp.height)
      await send('Page.navigate', { url: `${pageUrl}&vp=${vp.width}` })
      await waitFor(send, `document.readyState === 'complete'`, 60000)
      await waitFor(send, `typeof window.loadOrders === 'function' && document.querySelector('#omsTable')`, 90000)
      await waitFor(send, `document.querySelector('#omsTable tr')`, 90000).catch(() => true)
      const metrics = await evalValue(send, `(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        hasRows: document.querySelectorAll('#omsTable tr').length,
        resyncButtonVisible: !!document.getElementById('btnResyncPanel'),
        manualTopbarVisible: [...document.querySelectorAll('button')].some(button => (button.getAttribute('onclick') || '').includes('triggerBotScrape') || (button.getAttribute('onclick') || '').includes('triggerBotStatus'))
      }))()`)
      const file = await screenshot(send, vp.name)
      responsive.push({ ...vp, ...metrics, screenshot: file })
    }

    const failed = []
    if (summary.lazadaFinanceConflict.length) failed.push('lazada_finance_conflict')
    if (summary.lazadaTimelineContradiction || !summary.lazadaInternalTimelineLabeled) failed.push('lazada_tracking_contradiction')
    if (summary.lazadaImageStats.placeholders.some(item => item.width > 36 || item.height > 36)) failed.push('lazada_placeholder_large')
    if (summary.shopeeTrackingConflict) failed.push('shopee_tracking_conflict')
    if (Object.values(summary.staleSellerCenter).some(item => item.badRows.length)) failed.push('stale_seller_center_visible')
    if (!summary.topbarActions.hasAutoButton || !summary.topbarActions.hasRefreshOnlyButton) failed.push('topbar_auto_or_refresh_missing')
    if (summary.topbarActions.hasResyncButton || summary.topbarActions.hasManualPull || summary.topbarActions.hasManualStatus) failed.push('legacy_manual_topbar_visible')
    if (!summary.autoModal.visible || !summary.autoModal.actionTypes.every(item => item.present) || !summary.autoModal.toggleIds.every(item => item.exists) || !summary.autoModal.intervalInputs.every(item => item.exists) || summary.autoModal.manualActionButtons) failed.push('auto_modal_missing_actions')
    if (summary.desktopOverflow || responsive.some(item => item.overflow)) failed.push('responsive_overflow')
    if (responsive.some(item => item.resyncButtonVisible || item.manualTopbarVisible)) failed.push('responsive_legacy_manual_visible')

    console.log(JSON.stringify({ ok: failed.length === 0, failed, desktopShot, responsive, summary }, null, 2))
    if (failed.length) process.exitCode = 1
  } finally {
    ws.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
