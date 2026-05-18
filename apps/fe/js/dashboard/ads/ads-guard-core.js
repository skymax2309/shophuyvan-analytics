function adsGuardSupportsApi(platform = '') {
  return ['shopee', 'lazada'].includes(String(platform || '').toLowerCase())
}

function adsGuardCapabilities() {
  return Array.isArray(adsState.guardOverview?.capabilities) ? adsState.guardOverview.capabilities : []
}

function adsGuardLogs() {
  return Array.isArray(adsState.guardOverview?.logs)
    ? adsState.guardOverview.logs
    : (Array.isArray(adsState.guardLogs) ? adsState.guardLogs : [])
}

function adsGuardSelectedCapability() {
  const select = adsEl('adsGuardShop')
  const value = select?.value || ''
  return adsGuardCapabilities().find(item => item.shop === value) || null
}

function adsGuardFilteredCapabilities() {
  const platform = String(adsState.guardPlatform || '').toLowerCase()
  const rows = adsGuardCapabilities()
  return platform ? rows.filter(item => item.platform === platform) : rows
}

function adsGuardInferPlatform() {
  return adsGuardSelectedCapability()?.platform || ''
}

function ensureAdsGuardPlatformSplit() {
  const panel = document.querySelector('[data-ads-guard-panel="action"]')
  const form = panel?.querySelector('.ads-guard-form')
  if (!panel || !form || adsEl('adsGuardPlatformSplit')) return
  form.insertAdjacentHTML('beforebegin', `
    <div class="ads-guard-platform-split" id="adsGuardPlatformSplit">
      <button type="button" data-ads-guard-platform="shopee" onclick="selectAdsGuardPlatform('shopee')">
        <b>Preview Shopee Ads</b><span>Manual/Product/Keyword route riêng</span>
      </button>
      <button type="button" data-ads-guard-platform="lazada" onclick="selectAdsGuardPlatform('lazada')">
        <b>Preview Lazada Ads</b><span>Campaign/Adgroup route riêng</span>
      </button>
    </div>
  `)
}

function renderAdsGuardPlatformSplit() {
  ensureAdsGuardPlatformSplit()
  document.querySelectorAll('[data-ads-guard-platform]').forEach(button => {
    button.classList.toggle('active', button.dataset.adsGuardPlatform === adsState.guardPlatform)
  })
}

function ensureAdsGuardEntityPicker() {
  const input = adsEl('adsGuardEntityId')
  const field = input?.closest('.ads-guard-field')
  if (!input || !field || adsEl('adsGuardEntitySelect')) return
  input.insertAdjacentHTML('beforebegin', `
    <div class="ads-guard-entity-picker">
      <input id="adsGuardCampaignSearch" type="search" placeholder="Tìm campaign/adgroup từ cache ADS" oninput="onAdsGuardCampaignSearchChanged()">
      <select id="adsGuardEntitySelect" onchange="onAdsGuardEntitySelected()">
        <option value="">Chọn campaign/adgroup từ ADS của shop</option>
      </select>
      <label class="ads-guard-manual-toggle">
        <input type="checkbox" id="adsGuardManualEntityToggle" onchange="toggleAdsGuardManualEntity(this.checked)">
        <span>Nhập tay nâng cao</span>
      </label>
    </div>
  `)
  input.hidden = !adsState.guardManualEntity
}

function adsGuardEntityLabel(row = {}) {
  const metric = [
    row.status || 'chưa rõ trạng thái',
    row.budget ? `ngân sách ${adsMoney(row.budget)}` : '',
    row.spend ? `chi ${adsMoney(row.spend)}` : '',
    row.revenue ? `DT ${adsMoney(row.revenue)}` : '',
    row.roas ? `ROAS ${Number(row.roas || 0).toFixed(2)}` : ''
  ].filter(Boolean).join(' · ')
  const adgroup = row.adgroup_id ? ` / Adgroup ${row.adgroup_id}${row.adgroup_name ? ` - ${row.adgroup_name}` : ''}` : ''
  return `${row.campaign_id} - ${row.campaign_name || row.product_name || 'Campaign'}${adgroup} · ${metric}`
}

function renderAdsGuardCampaignCatalog() {
  ensureAdsGuardEntityPicker()
  const select = adsEl('adsGuardEntitySelect')
  const search = adsEl('adsGuardCampaignSearch')
  if (!select) return
  const rows = Array.isArray(adsState.guardCampaignCatalog?.rows) ? adsState.guardCampaignCatalog.rows : []
  const query = String(adsState.guardCampaignSearch || '').toLowerCase()
  const scope = adsEl('adsGuardScope')?.value || 'campaign'
  const filtered = rows.filter(row => {
    const haystack = [
      row.campaign_id,
      row.campaign_name,
      row.adgroup_id,
      row.adgroup_name,
      row.product_sku,
      row.product_name,
      row.status,
      row.campaign_type
    ].join(' ').toLowerCase()
    if (query && !haystack.includes(query)) return false
    if (scope === 'adgroup' && row.platform === 'lazada' && !row.adgroup_id) return false
    return true
  }).slice(0, 200)
  const current = adsEl('adsGuardEntityId')?.value || ''
  select.innerHTML = filtered.length
    ? '<option value="">Chọn campaign/adgroup từ ADS của shop</option>' + filtered.map((row, index) => {
        const value = scope === 'adgroup' && row.adgroup_id ? row.adgroup_id : row.campaign_id
        return `<option value="${adsEscape(value)}" data-index="${index}">${adsEscape(adsGuardEntityLabel(row))}</option>`
      }).join('')
    : `<option value="">${adsEscape(adsState.guardCampaignCatalog?.empty_state || 'Chưa có campaign trong cache ADS của shop')}</option>`
  if (filtered.some(row => (scope === 'adgroup' && row.adgroup_id ? row.adgroup_id : row.campaign_id) === current)) select.value = current
  if (search && search.value !== adsState.guardCampaignSearch) search.value = adsState.guardCampaignSearch
}

async function loadAdsGuardCampaignCatalog() {
  const capability = adsGuardSelectedCapability()
  const platform = capability?.platform || ''
  const shop = capability?.shop || ''
  if (!platform || !shop || !adsGuardSupportsApi(platform)) {
    adsState.guardCampaignCatalog = { rows: [], empty_state: 'Chọn shop Shopee/Lazada có ADS API để tải campaign.' }
    renderAdsGuardCampaignCatalog()
    return
  }
  adsState.guardCampaignCatalog = { rows: [], empty_state: 'Đang tải campaign/adgroup từ cache ADS...' }
  renderAdsGuardCampaignCatalog()
  try {
    adsState.guardCampaignCatalog = await adsFetch(`/api/ads/campaign-guard/campaigns?platform=${encodeURIComponent(platform)}&shop=${encodeURIComponent(shop)}&limit=250`)
  } catch (error) {
    adsState.guardCampaignCatalog = { rows: [], empty_state: error.message || 'Không tải được campaign ADS.' }
  }
  renderAdsGuardCampaignCatalog()
}

function adsGuardRouteOptions(platform = '', scope = '') {
  const key = String(platform || '').toLowerCase()
  if (key === 'shopee' && scope === 'campaign') {
    return [
      { value: 'shopee_manual', label: 'Shopee Manual Product Ads' },
      { value: 'shopee_auto', label: 'Shopee Auto Product Ads' }
    ]
  }
  if (key === 'lazada' && scope === 'campaign') {
    return [{ value: 'lazada_campaign', label: 'Lazada Campaign' }]
  }
  if (key === 'lazada' && scope === 'adgroup') {
    return [{ value: 'lazada_adgroup', label: 'Lazada Adgroup' }]
  }
  if (key === 'shopee' && scope === 'keyword') {
    return [{ value: 'shopee_keyword', label: 'Shopee Từ khóa quảng cáo' }]
  }
  return []
}

function adsGuardActionOptions(platform = '', scope = '', routeKey = '') {
  const key = String(platform || '').toLowerCase()
  if (key === 'shopee' && scope === 'campaign' && routeKey === 'shopee_auto') {
    return [
      { value: 'pause', label: 'Tạm dừng campaign' },
      { value: 'resume', label: 'Bật lại campaign' },
      { value: 'stop', label: 'Dừng campaign' },
      { value: 'change_budget', label: 'Đổi ngân sách' },
      { value: 'change_duration', label: 'Đổi thời gian chạy' }
    ]
  }
  if (key === 'shopee' && scope === 'campaign') {
    return [
      { value: 'pause', label: 'Tạm dừng campaign' },
      { value: 'resume', label: 'Bật lại campaign' },
      { value: 'stop', label: 'Dừng campaign' },
      { value: 'change_budget', label: 'Đổi ngân sách' },
      { value: 'change_roas_target', label: 'Đổi ROAS target' },
      { value: 'change_enhanced_cpc', label: 'Đổi Enhanced CPC' }
    ]
  }
  if (key === 'shopee' && scope === 'keyword') {
    return [{ value: 'keyword_update', label: 'Sửa danh sách từ khóa' }]
  }
  if (key === 'lazada' && scope === 'campaign') {
    return [
      { value: 'toggle_status', label: 'Bật/Tắt campaign' },
      { value: 'change_budget', label: 'Đổi ngân sách ngày' },
      { value: 'update_campaign_info', label: 'Đổi tên hoặc thời gian campaign' }
    ]
  }
  if (key === 'lazada' && scope === 'adgroup') {
    return [{ value: 'toggle_status', label: 'Bật/Tắt adgroup' }]
  }
  return []
}

function adsGuardScopeOptions(platform = '') {
  const key = String(platform || '').toLowerCase()
  if (key === 'shopee') {
    return [
      { value: 'campaign', label: 'Campaign Shopee' },
      { value: 'keyword', label: 'Từ khóa Shopee' }
    ]
  }
  if (key === 'lazada') {
    return [
      { value: 'campaign', label: 'Campaign Lazada' },
      { value: 'adgroup', label: 'Adgroup Lazada' }
    ]
  }
  return []
}

function adsGuardParseKeywordsInput() {
  const text = adsEl('adsGuardKeywords')?.value || ''
  if (!text.trim()) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function adsGuardBuildRequestBody(apply = false) {
  const platform = adsGuardInferPlatform()
  const shop = adsEl('adsGuardShop')?.value || ''
  const scope = adsEl('adsGuardScope')?.value || 'campaign'
  const routeKey = adsEl('adsGuardRoute')?.value || ''
  const action = adsEl('adsGuardAction')?.value || ''
  return {
    platform,
    shop,
    scope,
    route_key: routeKey,
    action,
    entity_id: adsEl('adsGuardEntityId')?.value || '',
    budget: adsEl('adsGuardBudget')?.value || '',
    roas_target: adsEl('adsGuardRoasTarget')?.value || '',
    status_value: adsEl('adsGuardStatusValue')?.value || '',
    enhanced_cpc: adsEl('adsGuardEnhancedCpc')?.checked ? 1 : 0,
    campaign_name: adsEl('adsGuardCampaignName')?.value || '',
    start_date: adsEl('adsGuardStartDate')?.value || '',
    end_date: adsEl('adsGuardEndDate')?.value || '',
    biz_code: adsEl('adsGuardBizCode')?.value || '',
    selected_keywords: adsGuardParseKeywordsInput(),
    confirm_text: apply ? (adsEl('adsGuardConfirmText')?.value || '') : ''
  }
}

function adsGuardScrollIntoView() {
  adsEl('adsGuardPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function adsGuardFieldVisibility() {
  const platform = adsGuardInferPlatform()
  const scope = adsEl('adsGuardScope')?.value || 'campaign'
  const routeKey = adsEl('adsGuardRoute')?.value || ''
  const action = adsEl('adsGuardAction')?.value || ''
  const showBudget = action === 'change_budget'
  const showRoas = platform === 'shopee' && action === 'change_roas_target'
  const showStatus = platform === 'lazada' && action === 'toggle_status'
  const showDates = action === 'change_duration' || action === 'update_campaign_info'
  const showName = platform === 'lazada' && action === 'update_campaign_info'
  const showKeywords = scope === 'keyword'
  const showEnhanced = platform === 'shopee' && action === 'change_enhanced_cpc'

  const fields = [
    ['adsGuardBudgetWrap', showBudget],
    ['adsGuardRoasWrap', showRoas],
    ['adsGuardStatusWrap', showStatus],
    ['adsGuardDateWrap', showDates],
    ['adsGuardCampaignNameWrap', showName],
    ['adsGuardKeywordsWrap', showKeywords],
    ['adsGuardEnhancedWrap', showEnhanced]
  ]
  fields.forEach(([id, visible]) => {
    const node = adsEl(id)
    if (node) node.hidden = !visible
  })

  const routeWrap = adsEl('adsGuardRouteWrap')
  if (routeWrap) routeWrap.hidden = !adsGuardRouteOptions(platform, scope).length

  const bizWrap = adsEl('adsGuardBizCodeWrap')
  if (bizWrap) bizWrap.hidden = platform !== 'lazada'
}

function populateAdsGuardRouteOptions() {
  const select = adsEl('adsGuardRoute')
  if (!select) return
  const platform = adsGuardInferPlatform()
  const scope = adsEl('adsGuardScope')?.value || 'campaign'
  const options = adsGuardRouteOptions(platform, scope)
  const current = select.value
  select.innerHTML = options.length
    ? options.map(item => `<option value="${adsEscape(item.value)}">${adsEscape(item.label)}</option>`).join('')
    : '<option value="">Không có route ghi phù hợp</option>'
  if (options.some(item => item.value === current)) select.value = current
}

function populateAdsGuardActionOptions() {
  const select = adsEl('adsGuardAction')
  if (!select) return
  const platform = adsGuardInferPlatform()
  const scope = adsEl('adsGuardScope')?.value || 'campaign'
  const routeKey = adsEl('adsGuardRoute')?.value || ''
  const options = adsGuardActionOptions(platform, scope, routeKey)
  const current = select.value
  select.innerHTML = options.length
    ? options.map(item => `<option value="${adsEscape(item.value)}">${adsEscape(item.label)}</option>`).join('')
    : '<option value="">Chưa có thao tác ghi an toàn</option>'
  if (options.some(item => item.value === current)) select.value = current
}

function populateAdsGuardScopeOptions(forceScope = '') {
  const select = adsEl('adsGuardScope')
  if (!select) return
  const platform = adsGuardInferPlatform()
  const options = adsGuardScopeOptions(platform)
  const current = forceScope || select.value
  select.innerHTML = options.length
    ? options.map(item => `<option value="${adsEscape(item.value)}">${adsEscape(item.label)}</option>`).join('')
    : '<option value="">Shop này chưa có ADS API</option>'
  if (options.some(item => item.value === current)) select.value = current
}

function populateAdsGuardShopOptions() {
  const select = adsEl('adsGuardShop')
  if (!select) return
  const current = select.value
  const rows = adsGuardFilteredCapabilities()
  select.innerHTML = rows.map(item => {
    const meta = `${adsPlatformLabel(item.platform)} · ${item.ads_transport_label}`
    return `<option value="${adsEscape(item.shop)}">${adsEscape(item.shop)} — ${adsEscape(meta)}</option>`
  }).join('')
  if (rows.some(item => item.shop === current)) select.value = current
  else if (rows.length) select.value = rows[0].shop
}

function renderAdsGuardLogs() {
  const box = adsEl('adsGuardLogs')
  if (!box) return
  const rows = adsGuardLogs()
  if (!rows.length) {
    box.innerHTML = '<div class="ads-empty">Chưa có log guard ADS. Khi preview hoặc apply, hệ thống sẽ lưu request_id và payload tại đây.</div>'
    return
  }
  box.innerHTML = rows.map(row => {
    const payload = row.request_payload || {}
    const response = row.response_payload || {}
    return `
      <div class="ads-guard-log-item">
        <div class="ads-guard-log-head">
          <b>${adsEscape(adsPlatformLabel(row.platform))} · ${adsEscape(row.shop || 'Shop chưa rõ')}</b>
          <span>${adsEscape(row.mode || 'preview')} · ${adsEscape(row.action_scope || '')} · ${adsEscape(row.action_name || '')}</span>
        </div>
        <div class="ads-guard-log-meta">
          <span>ID: ${adsEscape(row.entity_id || '-')}</span>
          <span>Route: ${adsEscape(row.route_key || '-')}</span>
          <span>Request ID: ${adsEscape(row.request_id || '-')}</span>
          <span>Lúc: ${adsEscape(row.created_at || '-')}</span>
        </div>
        <div class="ads-guard-log-body">
          <span>Payload: ${adsEscape(JSON.stringify(payload).slice(0, 240) || '{}')}</span>
          <span>Kết quả: ${adsEscape(response.message || row.error_message || row.status || '')}</span>
        </div>
      </div>
    `
  }).join('')
}

function renderAdsGuardResult(result = null) {
  const box = adsEl('adsGuardResult')
  if (!box) return
  if (!result) {
    box.innerHTML = '<div class="ads-empty">Chọn shop, nhập campaign/adgroup rồi bấm preview để xem payload trước khi chạm vào tiền quảng cáo thật.</div>'
    return
  }
  const capability = result.capability || {}
  const errors = Array.isArray(result.errors) ? result.errors : []
  const requestPayload = result.request_payload || {}
  const messageLines = [
    result.message || '',
    result.warning || '',
    result.lazada_sign?.warning || ''
  ].filter(Boolean)
  const tone = result.status === 'ok'
    ? 'ok'
    : result.status === 'blocked'
      ? 'warn'
      : 'error'
  box.className = `ads-guard-result ${tone}`
  box.innerHTML = `
    <div class="ads-guard-result-head">
      <b>${adsEscape(result.mode === 'apply' ? 'Kết quả đẩy thật' : 'Kết quả preview guard')}</b>
      <span>${adsEscape(adsPlatformLabel(result.platform))} · ${adsEscape(result.shop || '')} · ${adsEscape(result.scope_label || result.scope || '')}</span>
    </div>
    <div class="ads-guard-result-grid">
      <span>Transport: ${adsEscape(capability.ads_transport_label || '')}</span>
      <span>Route: ${adsEscape(result.route_key || '-')}</span>
      <span>Endpoint: ${adsEscape(result.endpoint || '-')}</span>
      <span>Request ID: ${adsEscape(result.request_id || '-')}</span>
      <span>Entity: ${adsEscape(result.entity_id || '-')}</span>
      <span>Cho apply: ${result.can_apply ? 'Có' : 'Không'}</span>
    </div>
    <div class="ads-guard-result-note">${adsEscape(messageLines.join(' | ') || 'Chưa có ghi chú thêm.')}</div>
    ${errors.length ? `<div class="ads-guard-result-errors">${errors.map(adsEscape).join('<br>')}</div>` : ''}
    <pre>${adsEscape(JSON.stringify(requestPayload, null, 2))}</pre>
  `
}

function renderAdsGuardCapabilities() {
  const summaryBox = adsEl('adsGuardSummary')
  const listBox = adsEl('adsGuardCapabilityList')
  const overview = adsState.guardOverview || {}
  const summary = overview.summary || {}
  if (summaryBox) {
    summaryBox.textContent = `${Number(summary.api_ready_shops || 0).toLocaleString('vi-VN')} shop API · ${Number(summary.manual_shops || 0).toLocaleString('vi-VN')} shop tham chiếu · ${Number(summary.tiktok_reference_shops || 0).toLocaleString('vi-VN')} shop TikTok fallback`
  }
  if (!listBox) return
  const rows = adsGuardCapabilities()
  if (!rows.length) {
    listBox.innerHTML = '<div class="ads-empty">Chưa có capability ADS để hiển thị.</div>'
    return
  }
  listBox.innerHTML = rows.map(item => `
    <div class="ads-guard-capability-card ${item.supports_ads_guard_apply ? 'api-ready' : 'fallback'}">
      <div class="ads-guard-capability-head">
        <b>${adsEscape(item.shop)}</b>
        <span>${adsEscape(item.capability_badge || item.ads_transport_label)}</span>
      </div>
      <div class="ads-guard-capability-meta">
        <span>${adsEscape(adsPlatformLabel(item.platform))}</span>
        <span>${adsEscape(item.ads_transport_label)}</span>
      </div>
      <p>${adsEscape(item.ads_transport_guide || '')}</p>
    </div>
  `).join('')
}

function renderAdsGuardPanel() {
  if (!adsState.guardPlatform) {
    const firstApi = adsGuardCapabilities().find(item => ['shopee', 'lazada'].includes(item.platform))
    adsState.guardPlatform = firstApi?.platform || 'shopee'
  }
  renderAdsGuardPlatformSplit()
  ensureAdsGuardEntityPicker()
  populateAdsGuardShopOptions()
  if (!adsEl('adsGuardShop')?.value && adsGuardCapabilities().length) {
    adsEl('adsGuardShop').value = adsGuardCapabilities()[0].shop
  }
  populateAdsGuardScopeOptions()
  populateAdsGuardRouteOptions()
  populateAdsGuardActionOptions()
  adsGuardFieldVisibility()
  renderAdsGuardCapabilities()
  renderAdsGuardLogs()
  renderAdsGuardResult(adsState.guardPreview)
  updateAdsGuardMiniSummary()
  activateAdsGuardTab(adsState.guardTab || 'guide')
  const capability = adsGuardSelectedCapability()
  const applyBtn = adsEl('adsGuardApplyBtn')
  if (applyBtn) applyBtn.disabled = !capability || !capability.supports_ads_guard_apply
  renderAdsGuardCampaignCatalog()
}

async function loadAdsGuardOverview() {
  try {
    const data = await adsFetch('/api/ads/campaign-guard/overview')
    adsState.guardOverview = data
    adsState.guardLogs = data.logs || []
  } catch (error) {
    adsState.guardOverview = {
      summary: { total_shops: 0, api_ready_shops: 0, manual_shops: 0, tiktok_reference_shops: 0 },
      capabilities: [],
      logs: [],
      error: error.message
    }
    adsState.guardLogs = []
  }
  renderAdsGuardPanel()
  loadAdsGuardCampaignCatalog()
}

window.onAdsGuardShopChanged = function() {
  populateAdsGuardScopeOptions()
  populateAdsGuardRouteOptions()
  populateAdsGuardActionOptions()
  adsGuardFieldVisibility()
  loadAdsGuardCampaignCatalog()
  const capability = adsGuardSelectedCapability()
  const applyBtn = adsEl('adsGuardApplyBtn')
  if (applyBtn) applyBtn.disabled = !capability || !capability.supports_ads_guard_apply
  updateAdsGuardMiniSummary()
  renderAdsGuardResult(adsState.guardPreview)
}

window.onAdsGuardScopeChanged = function() {
  populateAdsGuardRouteOptions()
  populateAdsGuardActionOptions()
  adsGuardFieldVisibility()
  renderAdsGuardCampaignCatalog()
}

window.onAdsGuardRouteChanged = function() {
  populateAdsGuardActionOptions()
  adsGuardFieldVisibility()
}

window.onAdsGuardActionChanged = function() {
  adsGuardFieldVisibility()
}

window.selectAdsGuardPlatform = function(platform) {
  adsState.guardPlatform = String(platform || '').toLowerCase()
  adsState.guardPreview = null
  adsState.guardCampaignSearch = ''
  renderAdsGuardPanel()
  loadAdsGuardCampaignCatalog()
}

window.onAdsGuardCampaignSearchChanged = function() {
  adsState.guardCampaignSearch = adsEl('adsGuardCampaignSearch')?.value || ''
  renderAdsGuardCampaignCatalog()
}

window.onAdsGuardEntitySelected = function() {
  const select = adsEl('adsGuardEntitySelect')
  const input = adsEl('adsGuardEntityId')
  if (!select || !input || !select.value) return
  const rows = Array.isArray(adsState.guardCampaignCatalog?.rows) ? adsState.guardCampaignCatalog.rows : []
  const scope = adsEl('adsGuardScope')?.value || 'campaign'
  const selected = rows.find(row => (scope === 'adgroup' && row.adgroup_id ? row.adgroup_id : row.campaign_id) === select.value)
  input.value = select.value
  if (selected?.budget && adsEl('adsGuardBudget')) adsEl('adsGuardBudget').value = Math.round(Number(selected.budget || 0)) || ''
  if (selected?.status && adsEl('adsGuardStatusValue')) {
    const status = String(selected.status || '').toLowerCase()
    adsEl('adsGuardStatusValue').value = ['0', 'off', 'offline', 'paused', 'pause', 'closed', 'disabled'].includes(status) ? '0' : '1'
  }
}

window.toggleAdsGuardManualEntity = function(enabled) {
  adsState.guardManualEntity = Boolean(enabled)
  const input = adsEl('adsGuardEntityId')
  if (input) input.hidden = !adsState.guardManualEntity
}

function adsToggleButton(item = {}, field, label) {
  const enabled = Boolean(item[field])
  const shop = item.shop || item.shop_name || item.api_shop_id || ''
  const shopId = item.api_shop_id || shop
  return `
    <div class="ads-toggle-row">
      <span>${adsEscape(label)}</span>
      <button
        type="button"
        class="ads-toggle-switch ${enabled ? 'on' : 'off'}"
        onclick="requestAdsShopToggle('${adsEncoded(shopId)}','${adsEncoded(field)}',${enabled ? 'false' : 'true'})"
        title="Bấm để đổi trạng thái nếu Shopee cấp endpoint ghi"
      >
        <i></i><b>${enabled ? 'Bật' : 'Tắt'}</b>
      </button>
    </div>
  `
}

window.requestAdsShopToggle = async function(encodedShopId, encodedField, nextValue) {
  const shopId = decodeURIComponent(encodedShopId || '')
  const field = decodeURIComponent(encodedField || '')
  const labels = {
    auto_top_up: 'Tự động nạp tiền',
    campaign_surge: 'Campaign surge'
  }
  const nextText = nextValue ? 'Bật' : 'Tắt'
  adsShowToast(`Chưa thể ${nextText.toLowerCase()} "${labels[field] || field}" trực tiếp từ website. API hiện chỉ đọc /api/v2/ads/get_shop_toggle_info cho shop ${shopId}.`, 'error')
}
