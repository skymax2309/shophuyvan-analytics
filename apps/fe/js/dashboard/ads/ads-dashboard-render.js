function adsStatusText(status) {
  if (status === 'good') return 'Đang hiệu quả'
  if (status === 'danger') return 'Kém hiệu quả'
  if (status === 'watch') return 'Cần theo dõi'
  return 'Chưa có ads'
}

function adsStatusClass(status) {
  if (status === 'good') return 'good'
  if (status === 'danger') return 'danger'
  if (status === 'watch') return 'watch'
  return 'neutral'
}

function adsDataHasRealData(data = adsState.data || {}) {
  return Boolean(data.has_real_ads_data && Number(data.summary?.ads_spend || 0) > 0)
}

function adsHasRealData() {
  return adsDataHasRealData()
}

function adsSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function adsFetch(path, options = {}) {
  const retry = Number(options.retry ?? 1)
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      const res = await fetch(API + path)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(adsApiErrorMessage(data, res.status))
      return data
    } catch (error) {
      // Chỉ retry GET cache khi lỗi mạng thoáng qua; không retry POST để tránh gửi lệnh trùng lên sàn.
      const canRetry = attempt < retry && /failed to fetch|networkerror|load failed/i.test(String(error?.message || error))
      if (!canRetry) throw error
      await adsSleep(450 + attempt * 350)
    }
  }
  throw new Error('Không tải được dữ liệu ADS.')
}

async function adsPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(adsApiErrorMessage(data, res.status))
  return data
}

function adsRangeDays(from, to) {
  if (!from || !to) return 0
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.floor((end - start) / 86400000) + 1
}

function adsDateRangeParams() {
  const qs = new URLSearchParams()
  const from = adsEl('filterFrom')?.value || ''
  const to = adsEl('filterTo')?.value || ''
  const platform = adsEl('adsPlatform')?.value || ''
  const shop = adsEl('adsShop')?.value || ''
  const rangeDays = adsRangeDays(from, to)
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (platform) qs.set('platform', platform)
  if (shop) qs.set('shop', shop)
  qs.set('limit', '60')
  // Khoảng tháng có nhiều campaign/snapshot hơn ngày lẻ, nên tăng giới hạn đọc để phân tích không bị cụt dữ liệu.
  qs.set('snapshot_limit', rangeDays > 14 ? '3000' : '1500')
  return qs.toString()
}

function adsSyncBody() {
  const from = adsEl('filterFrom')?.value || ''
  const to = adsEl('filterTo')?.value || ''
  const rangeDays = adsRangeDays(from, to)
  const body = {
    platform: adsEl('adsPlatform')?.value || '',
    shop: adsEl('adsShop')?.value || '',
    days: rangeDays || 7,
    limit: 120,
    shop_limit: 100,
    campaign_list_limit: 5000,
    include_product_campaigns: true
  }
  if (from) body.from = from
  if (to) body.to = to
  return body
}

function adsSyncKey() {
  return adsDateRangeParams() || 'all'
}

function adsIsTabActive() {
  const hash = String(location.hash || '').replace('#', '')
  const tab = adsEl('adsSection') || adsEl('tab-ads')
  return document.body?.dataset?.activeTab === 'ads' || hash === 'ads' || tab?.classList?.contains('active') || tab?.style?.display === 'block'
}

function adsRealtimeBody() {
  return {
    ...adsSyncBody(),
    days: 1,
    limit: 120,
    shop_limit: 100,
    campaign_list_limit: 5000,
    include_product_campaigns: true,
    include_affiliate: false,
    include_open_campaign: false,
    realtime: true
  }
}

function adsMonthSyncBody() {
  const from = adsEl('filterFrom')?.value || ''
  const to = adsEl('filterTo')?.value || ''
  const rangeDays = adsRangeDays(from, to)
  return {
    ...adsSyncBody(),
    from,
    to,
    days: rangeDays || 31,
    limit: 500,
    shop_limit: 100,
    campaign_list_limit: 5000,
    include_product_campaigns: true,
    include_affiliate: false,
    include_open_campaign: false,
    historical_month: true
  }
}

function adsCanAutoSync(force = false) {
  if (adsState.syncing) return false
  const data = adsState.data || {}
  if (!Array.isArray(data.api_shops) || !data.api_shops.length) return false
  const key = adsSyncKey()
  const now = Date.now()
  if (force && adsState.lastAutoSyncKey !== key) return true
  if (!adsState.lastAutoSyncAt || adsState.lastAutoSyncKey !== key) return true
  return now - adsState.lastAutoSyncAt >= adsState.realtimeMinGapMs
}

function adsSelectableShops() {
  const data = adsState.data || {}
  const rows = [...(data.api_shops || []), ...(data.ads_shop_status || []), ...(data.shops || [])]
  const platform = (adsEl('adsPlatform')?.value || '').toLowerCase()
  const byKey = new Map()
  for (const shop of rows) {
    const shopPlatform = String(shop.platform || '').toLowerCase()
    if (platform && shopPlatform !== platform) continue
    const name = adsShopName(shop)
    const key = `${shopPlatform}|${shop.api_shop_id || name}`
    if (!byKey.has(key)) byKey.set(key, shop)
  }
  return [...byKey.values()]
}

function adsShopName(shop = {}) {
  return shop.shop_name || shop.shop || shop.user_name || shop.api_shop_id || ''
}

function adsCollapsedWarnings() {
  const rawWarnings = Array.isArray(adsState.lastSync?.warnings) ? adsState.lastSync.warnings : []
  const grouped = new Map()
  rawWarnings.forEach(item => {
    const shop = item?.shop ? `${item.shop}: ` : ''
    const message = adsHumanizeApiMessage(item?.message || item?.error || String(item))
    const key = `${shop}|${message}`
    const current = grouped.get(key) || { shop, message, count: 0, stages: new Set() }
    current.count += 1
    if (item?.stage) current.stages.add(item.stage)
    grouped.set(key, current)
  })
  return [...grouped.values()]
}

function adsSyncWarningsHtml(limit = 4) {
  const warnings = adsCollapsedWarnings()
  if (!warnings.length) return ''
  return `
    <div class="ads-sync-warnings">
      ${warnings.slice(0, limit).map(item => {
        const stageText = item.stages?.size ? ` · ${Array.from(item.stages).slice(0, 2).join(', ')}` : ''
        const repeatText = item.count > 1 ? ` · lặp ${item.count} lần` : ''
        return `<div>${adsEscape(item.shop + item.message + stageText + repeatText)}</div>`
      }).join('')}
      ${warnings.length > limit ? `<div>+${warnings.length - limit} cảnh báo khác</div>` : ''}
    </div>
  `
}

function adsSyncBriefHtml() {
  if (adsState.syncing) {
    return '<div class="ads-sync-brief">Đang gọi Ads API realtime cho các shop có token...</div>'
  }
  const sync = adsState.lastSync
  if (!sync) {
    return '<div class="ads-sync-brief">Màn hình tự cập nhật ADS realtime khi mở tab và lặp lại theo chu kỳ khi tab ADS đang hoạt động.</div>'
  }
  const shopCount = Array.isArray(sync.shops) ? sync.shops.length : 0
  return `
    <div class="ads-sync-brief">
      Đã gọi API ${shopCount.toLocaleString('vi-VN')} shop, lấy ${Number(sync.fetched_campaigns || 0).toLocaleString('vi-VN')} dòng ADS, lưu ${Number(sync.saved || 0).toLocaleString('vi-VN')} snapshot.
    </div>
    ${adsSyncWarningsHtml()}
  `
}

function populateAdsShopOptions() {
  const select = adsEl('adsShop')
  if (!select) return
  const selected = select.value
  const shops = adsSelectableShops()
  const defaultLabel = shops.length ? 'Tất cả shop API' : 'Chưa có shop API'
  select.innerHTML = `<option value="">${defaultLabel}</option>` + shops.map(shop => {
    const name = adsShopName(shop)
    const label = `${adsPlatformLabel(shop.platform)} - ${name}`
    return `<option value="${adsEscape(name)}">${adsEscape(label)}</option>`
  }).join('')
  if ([...select.options].some(opt => opt.value === selected)) select.value = selected
}

window.onAdsPlatformChange = function() {
  populateAdsShopOptions()
  loadAdsDashboard()
}

function renderAdsKpis(summary = {}) {
  const box = adsEl('adsKpiGrid')
  if (!box) return

  if (!adsHasRealData()) {
    const reason = adsState.data?.empty_reason || 'Chưa có snapshot ADS thực từ Ads API trong bộ lọc này.'
    box.innerHTML = `
      <div class="ads-real-empty">
        <div>
          <b>Chưa có dữ liệu ADS thật để hiển thị</b>
          <span>${adsEscape(reason)} Shop không có spend ADS thật > 0 sẽ được ẩn khỏi KPI.</span>
          ${adsSyncBriefHtml()}
        </div>
        <button type="button" onclick="syncAdsCampaignSnapshots()">Kéo ADS realtime</button>
      </div>
    `
    return
  }

  const items = [
    { label: 'Tổng chi ADS', value: adsShort(summary.ads_spend), sub: `${adsMoney(summary.ads_spend)} từ Ads API`, tone: 'blue' },
    { label: 'Doanh thu ADS', value: adsShort(summary.revenue), sub: `${Number(summary.orders || 0).toLocaleString('vi-VN')} đơn từ ADS`, tone: 'green' },
    { label: 'ROAS', value: Number(summary.roas || 0).toFixed(2), sub: `ACOS ${adsPct(summary.acos)}`, tone: summary.roas >= 5 ? 'teal' : 'red' },
    { label: 'Clicks', value: adsShort(summary.clicks), sub: `${adsShort(summary.impressions)} impressions · CTR ${adsPct(summary.ctr)}`, tone: 'purple' },
    { label: 'CPC', value: adsMoney(summary.cpc), sub: 'Chi phí thực / click', tone: 'orange' }
  ]
  box.innerHTML = items.map(item => `
    <div class="ads-kpi ${item.tone}">
      <div class="ads-kpi-label">${adsEscape(item.label)}</div>
      <div class="ads-kpi-value">${adsEscape(item.value)}</div>
      <div class="ads-kpi-sub">${adsEscape(item.sub)}</div>
    </div>
  `).join('')
}

function renderAdsDaily() {
  const data = adsState.data?.daily || []
  const summary = adsEl('adsDailySummary')
  const list = adsEl('adsDailyList')
  const chart = adsEl('chartAdsDaily')

  if (!adsHasRealData() || !data.length) {
    if (summary) summary.textContent = 'Chưa có snapshot thật'
    if (chart) chart.style.display = 'none'
    if (typeof makeChart === 'function') {
      makeChart('chartAdsDaily', 'line', [], [{ label: 'Chi ADS', data: [] }], { legend: false })
    }
    if (list) list.innerHTML = '<div class="ads-empty">Chưa có chi phí ADS thật theo ngày trong bộ lọc này.</div>'
    return
  }

  if (summary) summary.textContent = `${data.length.toLocaleString('vi-VN')} ngày có spend`
  if (chart) chart.style.display = ''
  if (typeof makeChart === 'function') {
    makeChart('chartAdsDaily', 'line',
      data.map(row => row.day),
      [
        {
          label: 'Chi ADS',
          data: data.map(row => row.ads_spend),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,.12)',
          tension: 0.35,
          fill: true
        },
        {
          label: 'Doanh thu ADS',
          data: data.map(row => row.revenue),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15,118,110,.08)',
          tension: 0.35
        }
      ],
      { legend: true }
    )
  }

  if (!list) return
  list.innerHTML = data.slice(-6).reverse().map(row => `
    <div class="ads-daily-row">
      <div>
        <b>${adsEscape(row.day || '')}</b>
        <span>${Number(row.clicks || 0).toLocaleString('vi-VN')} click · ${Number(row.impressions || 0).toLocaleString('vi-VN')} impression · ROAS ${Number(row.roas || 0).toFixed(2)}</span>
      </div>
      <strong>${adsMoney(row.ads_spend)}</strong>
    </div>
  `).join('')
}

function renderAdsShops() {
  const list = adsEl('adsShopList')
  const summary = adsEl('adsShopSummary')
  const data = adsState.data?.ads_shop_status || adsState.data?.shop_performance || []
  const runningCount = data.filter(row => Number(row.ads_spend || 0) > 0).length
  if (summary) summary.textContent = `${runningCount.toLocaleString('vi-VN')}/${data.length.toLocaleString('vi-VN')} shop có spend`
  if (!list) return

  if (!data.length) {
    list.innerHTML = '<div class="ads-empty">Chưa có shop API ADS trong bộ lọc này.</div>'
    return
  }

  list.innerHTML = data.map(row => `
    <button class="ads-shop-card ads-shop-row-btn ${Number(row.ads_spend || 0) > 0 ? 'running' : 'muted'}" onclick="selectAdsShop('${adsEncoded(adsShopName(row))}','${adsEncoded(row.platform)}')">
      <div class="ads-shop-main">
        <strong>${adsEscape(adsShopName(row) || 'Chưa rõ shop')}</strong>
        <span class="ads-pill ${Number(row.ads_spend || 0) > 0 ? 'good' : 'neutral'}">${Number(row.ads_spend || 0) > 0 ? 'Có ADS' : 'Chưa spend'}</span>
      </div>
      <div class="ads-shop-inline">
        <span>Chi <b>${adsMoney(row.ads_spend)}</b></span>
        <span class="ads-shop-inline-key">Doanh thu <b>${adsMoney(row.revenue)}</b></span>
        <span class="ads-shop-inline-key">ROI <b>${adsShopRoi(row).toFixed(2)}</b></span>
        <span>Click <b>${Number(row.clicks || 0).toLocaleString('vi-VN')}</b></span>
        <span>Campaign <b>${Number(row.product_campaign_count || 0).toLocaleString('vi-VN')}/${Number(row.campaign_snapshot_count || 0).toLocaleString('vi-VN')}</b></span>
        <span>Ví ADS <b>${row.total_balance === null || row.total_balance === undefined ? 'N/A' : adsMoney(row.total_balance)}</b></span>
      </div>
      <div class="ads-shop-note">${Number(row.ads_spend || 0) > 0
        ? `Dữ liệu thật từ Ads API · ROAS ${Number(row.roas || 0).toFixed(2)} · CPC ${adsMoney(row.cpc)}`
        : 'Shop đã kết nối API nhưng chưa có spend/campaign ADS trong khoảng lọc này.'}</div>
    </button>
  `).join('')
}

window.selectAdsShop = function(shop, platform) {
  const decodedShop = decodeURIComponent(shop || '')
  const decodedPlatform = decodeURIComponent(platform || '')
  if (adsEl('adsPlatform')) adsEl('adsPlatform').value = decodedPlatform || ''
  populateAdsShopOptions()
  if (adsEl('adsShop')) adsEl('adsShop').value = decodedShop || ''
  loadAdsDashboard()
}

function adsCampaignForProduct(row = {}) {
  const campaigns = Array.isArray(adsState.data?.campaigns) ? adsState.data.campaigns : []
  const rowPlatform = String(row.platform || '').toLowerCase()
  const rowShop = String(row.shop || '').toLowerCase()
  const rowSku = String(row.sku || '').toLowerCase()
  const rowName = String(row.product_name || '').toLowerCase()
  return campaigns.find(item => {
    const itemPlatform = String(item.platform || '').toLowerCase()
    const itemShop = String(item.shop || '').toLowerCase()
    const campaignId = String(item.campaign_id || '').toLowerCase()
    const productSku = String(item.product_sku || '').toLowerCase()
    const productName = String(item.product_name || item.campaign_name || '').toLowerCase()
    if (rowPlatform && itemPlatform && rowPlatform !== itemPlatform) return false
    if (rowShop && itemShop && rowShop !== itemShop) return false
    return (rowSku && (campaignId === rowSku || productSku === rowSku)) || (rowName && productName === rowName)
  }) || null
}

function adsCampaignRawData(campaign = {}) {
  return adsSafeJson(campaign.raw_data, {})
}

function adsCampaignSetting(campaign = {}) {
  return adsCampaignRawData(campaign).setting_summary || {}
}

function adsCampaignRawSetting(campaign = {}) {
  return adsCampaignRawData(campaign).raw_setting || {}
}

function adsCampaignStatus(setting = {}, campaign = {}) {
  const raw = adsCampaignRawSetting(campaign)
  return String(
    setting.campaign_status ||
    raw.common_info?.campaign_status ||
    raw.campaign_status ||
    ''
  ).toLowerCase()
}

function adsCampaignAdType(campaign = {}, setting = {}) {
  const raw = adsCampaignRawSetting(campaign)
  return String(
    raw.common_info?.ad_type ||
    raw.ad_type ||
    setting.ad_type ||
    campaign.campaign_type ||
    ''
  ).toLowerCase()
}

function adsCampaignEditRoute(campaign = {}, setting = {}) {
  const adType = adsCampaignAdType(campaign, setting)
  const autoInfo = Array.isArray(setting.auto_product_ads_info)
    ? setting.auto_product_ads_info
    : (Array.isArray(adsCampaignRawSetting(campaign).auto_product_ads_info) ? adsCampaignRawSetting(campaign).auto_product_ads_info : [])
  // Shopee trả nhiều campaign "manual / auto" vì bidding auto vẫn thuộc manual product ads.
  if (adType.includes('auto_product') || (adType === 'auto' && autoInfo.length)) {
    return {
      route_key: 'shopee_auto',
      appPath: '/api/ads/shopee/auto-product-ads/edit',
      shopeeEndpoint: '/api/v2/ads/edit_auto_product_ads',
      confirm: 'EDIT_SHOPEE_AUTO_PRODUCT_ADS',
      label: 'Auto Product Ads'
    }
  }
  return {
    route_key: 'shopee_manual',
    appPath: '/api/ads/shopee/manual-product-ads/edit',
    shopeeEndpoint: '/api/v2/ads/edit_manual_product_ads',
    confirm: 'EDIT_SHOPEE_MANUAL_PRODUCT_ADS',
    label: 'Manual Product Ads'
  }
}

function adsCampaignToggleAction(status) {
  const key = String(status || '').toLowerCase()
  if (['paused', 'pause'].includes(key)) {
    return { editAction: 'resume', label: 'bật lại', nextText: 'Bật ADS' }
  }
  if (['stopped', 'stop', 'ended', 'closed'].includes(key)) {
    return { editAction: 'start', label: 'bật lại', nextText: 'Bật ADS' }
  }
  if (['deleted', 'delete'].includes(key)) {
    return { editAction: '', label: 'bật lại', nextText: 'Bật ADS', blocked: 'Campaign đã bị xóa nên không thể bật lại bằng API chỉnh campaign.' }
  }
  return { editAction: 'pause', label: 'tạm dừng', nextText: 'Tắt ADS' }
}

function adsCampaignItemId(campaign = {}) {
  const setting = adsCampaignSetting(campaign)
  const ids = Array.isArray(setting.item_id_list) ? setting.item_id_list : []
  return ids[0] || ''
}

function adsReviewRiskRows() {
  return Array.isArray(adsState.reviewRisk?.rows) ? adsState.reviewRisk.rows : []
}

function adsSameRiskText(left, right) {
  const a = String(left || '').trim().toLowerCase()
  const b = String(right || '').trim().toLowerCase()
  if (!a || !b || a === 'sản phẩm chưa rõ' || b === 'sản phẩm chưa rõ') return false
  return a === b
}

function adsFindReviewRisk(row = {}) {
  const campaign = adsCampaignForProduct(row) || {}
  const platform = String(row.platform || campaign.platform || '').trim().toLowerCase()
  const shop = String(row.shop || campaign.shop || '').trim().toLowerCase()
  const itemId = adsCampaignItemId(campaign)
  const sku = row.sku || row.product_sku || campaign.product_sku
  const productName = row.product_name || campaign.product_name || campaign.campaign_name

  // ADS không luôn có item_id, nên ưu tiên item_id nếu có rồi mới dùng SKU/tên sản phẩm đã chuẩn hóa trong review_core.
  return adsReviewRiskRows().find(risk => {
    const riskPlatform = String(risk.platform || '').trim().toLowerCase()
    const riskShop = String(risk.shop || '').trim().toLowerCase()
    if (platform && riskPlatform && platform !== riskPlatform) return false
    if (shop && riskShop && shop !== riskShop) return false
    return adsSameRiskText(itemId, risk.platform_item_id) ||
      adsSameRiskText(sku, risk.item_sku) ||
      adsSameRiskText(productName, risk.product_name)
  }) || null
}

function adsReviewRiskCell(row = {}) {
  const risk = adsFindReviewRisk(row)
  if (!risk) return '<span class="ads-review-risk-badge ok">Ổn</span>'
  const adsSpend = Number(risk.ads_spend_14d || 0)
  const spendText = adsSpend > 0 ? `<span>${adsMoney(adsSpend)} / 14 ngày</span>` : ''
  return `
    <div>
      <span class="ads-review-risk-badge">${Number(risk.negative_reviews || 0).toLocaleString('vi-VN')} review xấu</span>
      ${spendText}
    </div>
  `
}

function renderAdsReviewRiskPanel() {
  const box = adsEl('adsReviewRiskPanel')
  const summary = adsEl('adsReviewRiskSummary')
  if (!box) return
  const data = adsState.reviewRisk || {}
  const rows = adsReviewRiskRows()
  const adsRows = rows.filter(row => Number(row.ads_spend_14d || 0) > 0)
  if (summary) {
    summary.textContent = data.status === 'error'
      ? 'Không tải được review_core'
      : `${adsRows.length.toLocaleString('vi-VN')} sản phẩm trùng ADS · ${rows.length.toLocaleString('vi-VN')} sản phẩm có review xấu`
  }
  if (data.status === 'error') {
    box.innerHTML = `<div class="ads-empty">Không tải được review_core: ${adsEscape(data.error || 'lỗi chưa rõ')}</div>`
    return
  }
  if (!rows.length) {
    box.innerHTML = '<div class="ads-empty">Chưa có review xấu trong core để đối chiếu với ADS.</div>'
    return
  }
  const visibleRows = (adsRows.length ? adsRows : rows).slice(0, 6)
  box.innerHTML = visibleRows.map(row => {
    const adsSpend = Number(row.ads_spend_14d || 0)
    const adsChip = adsSpend > 0
      ? `<span class="ads-review-risk-pill ads">ADS 14 ngày: ${adsMoney(adsSpend)}</span>`
      : '<span class="ads-review-risk-pill">Chưa trùng ADS đang chi tiền</span>'
    return `
      <div class="ads-review-risk-item">
        <b title="${adsEscape(row.product_name)}">${adsEscape(row.product_name || 'Sản phẩm chưa rõ')}</b>
        <span>${adsEscape(row.item_sku || row.platform_item_id || 'Chưa rõ SKU')} · ${adsEscape(adsPlatformLabel(row.platform))} / ${adsEscape(row.shop || '')}</span>
        <div class="ads-review-risk-meta">
          <span class="ads-review-risk-pill">${Number(row.negative_reviews || 0).toLocaleString('vi-VN')} review xấu</span>
          <span class="ads-review-risk-pill">${Number(row.need_reply_reviews || 0).toLocaleString('vi-VN')} cần trả lời</span>
          ${adsChip}
        </div>
      </div>
    `
  }).join('')
}

async function loadAdsReviewRisk(options = {}) {
  const qs = new URLSearchParams({ limit: '40', days: '14' })
  const platform = adsEl('adsPlatform')?.value || ''
  const shop = adsEl('adsShop')?.value || ''
  if (platform) qs.set('platform', platform)
  if (shop) qs.set('shop', shop)
  try {
    adsState.reviewRisk = await adsFetch(`/api/reviews/product-risk?${qs.toString()}`)
  } catch (error) {
    adsState.reviewRisk = { status: 'error', rows: [], error: error.message }
    if (!options.silent) alert(`Không tải được review_core: ${error.message}`)
  }
  renderAdsReviewRiskPanel()
}
