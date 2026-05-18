async function runAdsCampaignSync(options = {}) {
  const manual = options.manual !== false
  if (adsState.syncing) return adsState.lastSync
  const btn = adsEl(options.buttonId || 'adsCampaignSyncBtn')
  const oldText = btn?.textContent || ''
  if (btn && manual) {
    btn.disabled = true
    btn.textContent = options.loadingText || 'Đang kéo...'
  }
  adsState.syncing = true
  renderAdsKpis(adsState.data?.summary || {})
  renderAdsSourceNotice()
  try {
    const body = options.body || (manual ? adsSyncBody() : adsRealtimeBody())
    const result = await adsPost('/api/ads/sync-campaigns', body)
    adsState.lastSync = { ...result, auto: !manual, synced_at: new Date().toISOString() }
    if (!manual) {
      adsState.lastAutoSyncAt = Date.now()
      adsState.lastAutoSyncKey = adsSyncKey()
    }
    return result
  } catch (error) {
    if (!manual) {
      adsState.lastAutoSyncAt = Date.now()
      adsState.lastAutoSyncKey = adsSyncKey()
    }
    adsState.lastSync = {
      fetched_campaigns: 0,
      saved: 0,
      warnings: [{ message: error.message }],
      shops: [],
      auto: !manual,
      synced_at: new Date().toISOString()
    }
    return adsState.lastSync
  } finally {
    adsState.syncing = false
    if (btn && manual) {
      btn.disabled = false
      btn.textContent = oldText || 'Kéo ADS theo khoảng lọc'
    }
    renderAdsKpis(adsState.data?.summary || {})
    renderAdsSourceNotice()
  }
}

async function maybeAutoSyncAds(data, options = {}) {
  if (!Array.isArray(data?.api_shops) || !data.api_shops.length) return false
  if (!adsState.realtimeEnabled || options.forceAutoSync !== true) return false
  if (!adsCanAutoSync(options.forceAutoSync === true)) return false
  await runAdsCampaignSync({ manual: false })
  return true
}

window.syncAdsCampaignSnapshots = async function() {
  const rangeDays = adsRangeDays(adsEl('filterFrom')?.value || '', adsEl('filterTo')?.value || '')
  if (rangeDays > 31) {
    adsShowToast('Khoảng kéo ADS dài hơn 31 ngày. Hãy kéo theo từng tháng để tránh thiếu dữ liệu hoặc timeout.', 'error')
    return
  }
  await runAdsCampaignSync()
  await loadAdsDashboard({ skipAutoSync: true })
}

window.syncAdsSelectedMonthSnapshots = async function() {
  const status = adsEl('adsMonthSyncStatus')
  const select = adsEl('adsMonthSelect')
  const selectedMonth = select?.value || ''
  const from = adsEl('filterFrom')?.value || ''
  const to = adsEl('filterTo')?.value || ''
  if (!selectedMonth) {
    adsShowToast('Chọn tháng ADS cần kéo trước khi gọi API.', 'error')
    return
  }
  if (!from || !to || from.slice(0, 7) !== selectedMonth || to.slice(0, 7) !== selectedMonth) {
    adsShowToast('Khoảng ngày chưa khớp với tháng đang chọn. Hãy chọn lại tháng rồi bấm kéo ADS.', 'error')
    return
  }
  if (status) status.textContent = `Đang kéo ADS tháng ${selectedMonth} từ Ads API thật...`
  const result = await runAdsCampaignSync({
    buttonId: 'adsMonthSyncBtn',
    loadingText: 'Đang kéo ADS tháng...',
    body: adsMonthSyncBody()
  })
  const fetched = Number(result?.fetched_campaigns || 0)
  const saved = Number(result?.saved || 0)
  const warnings = Array.isArray(result?.warnings) ? result.warnings.length : 0
  if (status) {
    const warningText = warnings ? ` · ${warnings} cảnh báo` : ''
    status.innerHTML = `<strong>Đã kéo ADS tháng ${adsEscape(selectedMonth)}:</strong> ${fetched.toLocaleString('vi-VN')} snapshot, lưu ${saved.toLocaleString('vi-VN')} dòng${warningText}.`
  }
  await loadAdsDashboard({ skipAutoSync: true })
}

window.loadAdsDashboard = async function(options = {}) {
  showAdsSubpage(adsSubpageFromHash(), { updateHash: false })
  const btn = adsEl('adsRefreshBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const qs = adsDateRangeParams()
    let data = await adsFetch(`/api/ads/dashboard?${qs}`)
    adsState.data = data
    adsState.shops = data.shops || []
    adsState.apiShops = data.api_shops || []
    adsState.balances = data.ads_balances || []
    adsState.affiliate = data.affiliate_performance || []
    populateAdsShopOptions()
    if (!options.skipAutoSync && await maybeAutoSyncAds(data, options)) {
      data = await adsFetch(`/api/ads/dashboard?${qs}`)
      adsState.data = data
      adsState.shops = data.shops || []
      adsState.apiShops = data.api_shops || []
      adsState.balances = data.ads_balances || []
      adsState.affiliate = data.affiliate_performance || []
      populateAdsShopOptions()
    }
    await loadAdsReviewRisk({ silent: true })
    renderAdsKpis(data.summary || {})
    renderAdsDaily()
    renderAdsShops()
    renderAdsProducts()
    renderAdsReviewRiskPanel()
    renderAdsSourceNotice()
    if (adsState.discounts) loadDiscountAnalysis({ silent: true })
    if (adsState.promotionCore || !options.skipPromotionCore) loadPromotionCore({ silent: true })
    await loadAdsGuardOverview()
    adsState.loaded = true
    adsState.lastDashboardRefreshAt = Date.now()
  } catch (error) {
    const box = adsEl('adsKpiGrid')
    if (box) box.innerHTML = `<div class="ads-error">Không tải được ADS: ${adsEscape(error.message)}</div>`
    adsState.data = { has_real_ads_data: false, empty_reason: error.message, diagnostics: {} }
    renderAdsDaily()
    renderAdsShops()
    renderAdsProducts()
    renderAdsReviewRiskPanel()
    renderAdsSourceNotice()
    await loadAdsGuardOverview()
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Làm mới'
    }
  }
}

window.loadAds = function() {
  showAdsSubpage(adsSubpageFromHash(), { updateHash: false })
  loadAdsDashboard({ skipAutoSync: true })
}
