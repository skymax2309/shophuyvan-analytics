const adsState = {
  shops: [],
  apiShops: [],
  balances: [],
  affiliate: [],
  topPicks: null,
  discounts: null,
  promotionCore: null,
  data: null,
  lastSync: null,
  loaded: false,
  syncing: false,
  renderedProductRows: [],
  renderedTopPicksRows: [],
  renderedDiscountRows: [],
  renderedPromotionRows: [],
  promotionPrograms: [],
  promotionVouchers: [],
  promotionSelectedRows: new Set(),
  promotionDetail: null,
  promotionPreview: null,
  promotionPreviewItemIndex: null,
  promotionSkuDetail: null,
  promotionTab: 'core',
  reviewRisk: null,
  promotionQueue: [],
  selectedOptimizeRow: null,
  selectedTopPicksRow: null,
  selectedDiscountRow: null,
  discountShopFilter: '',
  pendingCampaignToggle: null,
  guardOverview: null,
  guardLogs: [],
  guardPreview: null,
  guardTab: 'guide',
  autoSyncKeys: new Set(),
  realtimeTimer: null,
  lastAutoSyncAt: 0,
  lastAutoSyncKey: '',
  lastDashboardRefreshAt: 0,
  realtimeIntervalMs: 90000,
  realtimeMinGapMs: 60000,
  // Mặc định trang ADS chỉ đọc cache đã lưu. API sàn chỉ chạy khi người dùng bấm nút kéo/cập nhật để giảm request.
  realtimeEnabled: false
}

const ADS_SUBPAGE_HASH = {
  overview: 'ads-overview',
  guard: 'ads-guard',
  'top-picks': 'ads-top-picks',
  discount: 'ads-discount',
  promotion: 'promotionCorePanel'
}

const ADS_GUARD_TABS = new Set(['guide', 'shops', 'action', 'logs'])

const ADS_PROMOTION_TABS = new Set(['core', 'features', 'update', 'browse', 'detail', 'queue'])

function adsSubpageFromHash() {
  const hash = (window.location.hash || '').replace('#', '')
  if (hash === 'ads-guard' || hash === 'adsGuardPanel') return 'guard'
  if (hash === 'ads-top-picks' || hash === 'topPicksPanel') return 'top-picks'
  if (hash === 'ads-discount' || hash === 'discountPanel') return 'discount'
  if (hash === 'promotionCorePanel' || hash === 'ads-promotion') return 'promotion'
  return 'overview'
}

function updateAdsGuardMiniSummary() {
  const overview = adsState.guardOverview || {}
  const summary = overview.summary || {}
  const selected = adsGuardSelectedCapability()
  const apiCount = adsEl('adsGuardApiCount')
  const manualCount = adsEl('adsGuardManualCount')
  const selectedMode = adsEl('adsGuardSelectedMode')
  const logCount = adsEl('adsGuardLogCount')
  if (apiCount) apiCount.textContent = `API thật: ${Number(summary.api_ready_shops || 0).toLocaleString('vi-VN')} shop`
  if (manualCount) manualCount.textContent = `Shop tham chiếu: ${Number(summary.manual_shops || 0).toLocaleString('vi-VN')}`
  if (selectedMode) {
    selectedMode.textContent = selected
      ? `Shop đang chọn: ${adsPlatformLabel(selected.platform)} · ${selected.ads_transport_label || 'chưa rõ'}`
      : 'Shop đang chọn: chưa rõ'
  }
  if (logCount) logCount.textContent = `Log: ${adsGuardLogs().length.toLocaleString('vi-VN')} dòng gần nhất`
}

function activateAdsGuardTab(tab = 'guide', options = {}) {
  const active = ADS_GUARD_TABS.has(tab) ? tab : 'guide'
  adsState.guardTab = active
  document.querySelectorAll('[data-ads-guard-panel]').forEach(panel => {
    panel.hidden = panel.dataset.adsGuardPanel !== active
  })
  document.querySelectorAll('[data-ads-guard-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.adsGuardTab === active)
  })
  if (options.scroll) adsEl('adsGuardPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

window.showAdsGuardTab = function(tab = 'guide') {
  activateAdsGuardTab(tab, { scroll: false })
}

function activatePromotionTab(tab = 'core') {
  const active = ADS_PROMOTION_TABS.has(tab) ? tab : 'core'
  adsState.promotionTab = active
  document.querySelectorAll('[data-promotion-view]').forEach(panel => {
    panel.hidden = panel.dataset.promotionView !== active
  })
  document.querySelectorAll('[data-promotion-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.promotionTab === active)
  })
  if (active === 'features') renderPromotionFeatureHub()
  if (active === 'update') renderPromotionQuickActions()
}

window.showPromotionTab = function(tab = 'core') {
  activatePromotionTab(tab)
}

window.showAdsSubpage = function(view = 'overview', options = {}) {
  const active = ADS_SUBPAGE_HASH[view] ? view : 'overview'
  document.querySelectorAll('[data-ads-view]').forEach(panel => {
    panel.classList.toggle('ads-view-hidden', panel.dataset.adsView !== active)
  })
  document.querySelectorAll('[data-ads-subpage]').forEach(button => {
    button.classList.toggle('active', button.dataset.adsSubpage === active)
  })
  if (options.updateHash !== false) {
    const nextHash = ADS_SUBPAGE_HASH[active]
    if (nextHash && window.location.hash.replace('#', '') !== nextHash) {
      history.replaceState(null, '', `#${nextHash}`)
    }
  }
  if (active === 'promotion' && !adsState.promotionCore) loadPromotionCore({ silent: true })
  if (active === 'promotion') activatePromotionTab(adsState.promotionTab || 'core')
  if (active === 'top-picks' && !adsState.topPicks) renderTopPicksAnalysis()
  if (active === 'discount' && !adsState.discounts) renderDiscountAnalysis()
  if (active === 'guard') activateAdsGuardTab(adsState.guardTab || 'guide')
}

window.addEventListener('hashchange', () => {
  showAdsSubpage(adsSubpageFromHash(), { updateHash: false })
})

function adsEl(id) {
  return document.getElementById(id)
}

function adsEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

function adsEncoded(value) {
  return encodeURIComponent(String(value ?? ''))
}

function adsPlatformLabel(platform) {
  const key = String(platform || '').toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  return platform || 'Sàn'
}

function adsMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ'
}

function adsShort(value) {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' tr'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k'
  return n.toLocaleString('vi-VN')
}

function adsPct(value) {
  return Number(value || 0).toFixed(1) + '%'
}

function adsShopRoi(row = {}) {
  // ROI của shop ưu tiên field riêng từ API; hiện tại fallback về ROAS để thống nhất tỷ lệ doanh thu/chi ADS.
  const explicitRoi = Number(row.roi)
  if (Number.isFinite(explicitRoi) && explicitRoi > 0) return explicitRoi
  return Number(row.roas || 0)
}

function adsSafeJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function adsApiErrorMessage(data = {}, status = 0) {
  // Gom lỗi API về một chuỗi dễ đọc để người thao tác biết thiếu quyền, sai endpoint hay lỗi payload.
  const errors = Array.isArray(data.errors) ? data.errors.filter(Boolean).join('; ') : ''
  return errors || data.message || data.error || `Lỗi ${status}`
}

function adsHumanizeApiMessage(message = '') {
  const text = String(message || '').trim()
  const lower = text.toLowerCase()
  if (!text) return 'Chưa rõ lỗi API.'
  if (lower.includes('invalid_access_token') || lower.includes('invalid access_token')) {
    return 'Token API ADS không còn hợp lệ hoặc shop chưa được cấp quyền ADS. Hãy kết nối lại API và kiểm tra quyền quảng cáo.'
  }
  if (lower.includes('access token is invalid') || lower.includes('access token is expired') || lower.includes('invalid or expired')) {
    return 'Token API sàn đã hết hạn hoặc không còn hợp lệ. Hãy làm mới kết nối API trước khi kéo ADS.'
  }
  return text
}

function adsTime(value) {
  const n = Number(value || 0)
  if (!n) return 'chưa rõ thời điểm'
  return new Date(n * 1000).toLocaleString('vi-VN')
}

function adsOnOff(value) {
  return value ? 'Bật' : 'Tắt'
}
