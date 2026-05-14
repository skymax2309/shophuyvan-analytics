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

function adsGuardInferPlatform() {
  return adsGuardSelectedCapability()?.platform || ''
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
  const rows = adsGuardCapabilities()
  select.innerHTML = rows.map(item => {
    const meta = `${adsPlatformLabel(item.platform)} · ${item.ads_transport_label}`
    return `<option value="${adsEscape(item.shop)}">${adsEscape(item.shop)} — ${adsEscape(meta)}</option>`
  }).join('')
  if (rows.some(item => item.shop === current)) select.value = current
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
}

window.onAdsGuardShopChanged = function() {
  populateAdsGuardScopeOptions()
  populateAdsGuardRouteOptions()
  populateAdsGuardActionOptions()
  adsGuardFieldVisibility()
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
}

window.onAdsGuardRouteChanged = function() {
  populateAdsGuardActionOptions()
  adsGuardFieldVisibility()
}

window.onAdsGuardActionChanged = function() {
  adsGuardFieldVisibility()
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
  alert(`Chưa thể ${nextText.toLowerCase()} "${labels[field] || field}" trực tiếp từ website.\n\nShopee Open API trong hệ thống hiện chỉ có endpoint đọc /api/v2/ads/get_shop_toggle_info. Chưa có endpoint ghi trạng thái thật cho shop ${shopId}, nên hệ thống không giả lập bật/tắt để tránh sai dữ liệu.\n\nNếu Shopee cấp endpoint ghi tương ứng, mình sẽ nối nút này để đổi thật và refresh lại trạng thái ngay.`)
}
