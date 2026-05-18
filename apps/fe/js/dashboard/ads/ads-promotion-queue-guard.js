window.runPromotionDeepBatch = async function() {
  activatePromotionTab('update')
  setPromotionUpdateStatus('Đang chạy batch sâu an toàn theo từng shop/module...')
  try {
    const data = await adsPost('/api/discounts/promotion-cache/batch', {
      shop: adsEl('adsShop')?.value || '',
      max_jobs: 4,
      shop_limit: 5
    })
    await loadPromotionCore({ silent: true })
    setPromotionUpdateStatus(`<b>Batch sâu đã chạy ${Number(data.selected_jobs || 0).toLocaleString('vi-VN')} lượt</b><span>Còn ${Number(data.available_jobs || 0).toLocaleString('vi-VN')} job khả dụng. Cron sẽ tiếp tục chạy lát cắt nhỏ để tránh quá quota.</span>`, 'ok')
  } catch (error) {
    setPromotionUpdateStatus(`Batch sâu lỗi: ${adsEscape(error.message)}`, 'error')
  }
}

function promotionQueueModuleLabel(module = '') {
  return typeof promotionModuleLabel === 'function'
    ? promotionModuleLabel(module)
    : (module || 'Chương trình')
}

function promotionQueueActionLabel(action = '') {
  const key = String(action || '').toLowerCase()
  return {
    stock_price_rule: 'Quy tắc giá theo tồn kho',
    preview_only: 'Preview nội bộ',
    apply_discount: 'Đẩy giá thật'
  }[key] || (action || 'Tác vụ')
}

function renderPromotionQueue(rows = []) {
  const box = adsEl('promotionQueueBox')
  if (!box) return
  if (!rows.length) {
    box.innerHTML = '<div class="ads-empty">Chưa có hàng đợi nội bộ promotion.</div>'
    return
  }
  box.innerHTML = rows.map(row => {
    const risk = row.risk_summary || {}
    const warnings = [...(risk.warnings || []), ...(risk.errors || [])].filter(Boolean)
    const sendStatus = String(row.send_status || '').toLowerCase()
    const verifyStatus = String(row.verify_status || '').toLowerCase()
    const canExecute = promotionQueueCanExecute(row)
    const executeLabel = canExecute ? 'Gửi thật lên Shopee' : sendStatus === 'needs_data' ? 'Cần kéo dữ liệu từ Shopee' : 'Chưa hỗ trợ gửi thật'
    return `
      <article class="ads-promotion-detail-card">
        <div class="ads-promotion-row-head">
          <div>
            <b>${adsEscape(promotionQueueModuleLabel(row.module))} · ${adsEscape(promotionQueueActionLabel(row.action))}</b>
            <span>${adsPlatformLabel(row.platform)} · ${adsEscape(row.shop || '')} · ${adsEscape(row.sku || row.item_id || '')}</span>
          </div>
          <div class="ads-promotion-queue-status">
            <code>${adsEscape(row.status || '')}</code>
            <code>${adsEscape(row.send_status || (row.sent_to_platform ? 'sent_to_shopee' : 'draft_local'))}</code>
            <code>${adsEscape(row.verify_status || 'not_verified')}</code>
          </div>
        </div>
        <div class="ads-promotion-detail-grid">
          <span>Queue: ${adsEscape(row.queue_id || '')}</span>
          <span>Client: ${adsEscape(row.client_type || '')}</span>
          <span>Endpoint: ${adsEscape(row.shopee_endpoint || '')}</span>
          <span>Giá mục tiêu: ${adsMoney(risk.target_price || 0)}</span>
          <span>Giá vốn: ${adsMoney(risk.cost_base || 0)}</span>
          <span>Lãi đơn vị: ${adsMoney(risk.unit_margin_after_target || 0)}</span>
          <span>ADS 30 ngày: ${adsMoney(risk.ads_spend_30d || 0)}</span>
          <span>Doanh thu 30 ngày: ${adsMoney(risk.order_revenue_30d || 0)}</span>
          <span>Tạo bởi: ${adsEscape(row.created_by || '-')}</span>
          <span>Lúc: ${adsEscape(row.created_at || '-')}</span>
          <span>Gửi lúc: ${adsEscape(row.sent_at || '-')}</span>
          <span>Verify lúc: ${adsEscape(row.verified_at || '-')}</span>
        </div>
        <div class="ads-promotion-browser-actions">
          <button type="button" class="${canExecute ? '' : 'secondary'}" ${canExecute ? `onclick="executePromotionQueueApply('${adsEscape(row.queue_id || '')}')"` : 'disabled'}>${executeLabel}</button>
        </div>
        ${row.error_message ? `<div class="ads-error">${adsEscape(row.error_code || 'error')}: ${adsEscape(row.error_message)}</div>` : ''}
        ${warnings.length ? `<div class="ads-promotion-warning">${warnings.map(adsEscape).join(' ')}</div>` : '<span>Đủ điều kiện ở mức hàng đợi. Chỉ nút “Gửi thật lên Shopee” mới gọi API sàn và phải verify bằng refetch.</span>'}
      </article>
    `
  }).join('')
}

function promotionQueueCanExecute(row = {}) {
  const platform = String(row.platform || '').toLowerCase()
  const module = String(row.module || '').toLowerCase()
  const status = String(row.status || '').toLowerCase()
  const risk = row.risk_summary || {}
  const errors = Array.isArray(risk.errors) ? risk.errors.filter(Boolean) : []
  const sendStatus = String(row.send_status || '').toLowerCase()
  return platform === 'shopee'
    && ['discount', 'shopee_discount'].includes(module)
    && !row.sent_to_platform
    && (!sendStatus || sendStatus === 'ready_to_send')
    && !['blocked', 'needs_data', 'rejected', 'apply_error'].includes(status)
    && errors.length === 0
}

window.executePromotionQueueApply = async function(queueId) {
  const row = adsState.promotionQueue.find(item => item.queue_id === queueId)
  const box = adsEl('promotionQueueBox')
  if (!row || !box) return
  const risk = row.risk_summary || {}
  const ok = await adsConfirmAction({
    title: 'Xác nhận gửi thật lên Shopee',
    message: 'Lệnh này gọi Shopee Discount API thật bằng marketplace_client. Hàng đợi chỉ chuyển trạng thái khi backend refetch verify thành công.',
    danger: true,
    confirmText: 'Gửi thật lên Shopee',
    details: [
      { label: 'Shop', value: row.shop || '' },
      { label: 'SKU/item', value: row.sku || row.item_id || '' },
      { label: 'Giá sẽ đẩy', value: adsMoney(risk.target_price || 0) },
      { label: 'Queue', value: row.queue_id || '' }
    ]
  })
  if (!ok) return
  box.insertAdjacentHTML('afterbegin', '<div class="ads-empty">Đang gửi thật lên Shopee và chờ refetch verify, vui lòng không bấm lại...</div>')
  try {
    const data = await adsPost('/api/discounts/promotions/apply-queue/execute', {
      queue_id: queueId,
      confirm: PROMOTION_QUEUE_EXECUTE_CONFIRM
    })
    adsState.promotionQueue = [data.queue, ...adsState.promotionQueue.filter(item => item.queue_id !== queueId)].filter(Boolean)
    renderPromotionQueue(adsState.promotionQueue)
  } catch (error) {
    box.insertAdjacentHTML('afterbegin', `<div class="ads-error">Không gửi được giá lên Shopee: ${adsEscape(error.message)}</div>`)
  }
}

window.loadPromotionApplyQueue = async function() {
  activatePromotionTab('queue')
  const box = adsEl('promotionQueueBox')
  if (box) box.innerHTML = '<div class="ads-empty">Đang tải hàng đợi nội bộ promotion...</div>'
  try {
    const data = await adsFetch('/api/discounts/promotions/apply-queue?limit=30')
    adsState.promotionQueue = Array.isArray(data.rows) ? data.rows : []
    renderPromotionQueue(adsState.promotionQueue)
  } catch (error) {
    if (box) box.innerHTML = `<div class="ads-error">Không tải được hàng đợi: ${adsEscape(error.message)}</div>`
  }
}

window.repairPromotionPriceGaps = async function() {
  activatePromotionTab('update')
  setPromotionUpdateStatus('Đang làm sạch giá 0đ và map tồn từ product_variations...')
  try {
    const data = await adsPost('/api/discounts/promotion-items/repair-prices', {
      platform: adsEl('promotionPlatformFilter')?.value || '',
      module: adsEl('promotionModuleFilter')?.value || '',
      shop: adsEl('adsShop')?.value || '',
      limit: 120
    })
    setPromotionUpdateStatus(`<b>Làm sạch cache promotion xong</b><span>Quét ${Number(data.scanned || 0).toLocaleString('vi-VN')} dòng · map được ${Number(data.matched || 0).toLocaleString('vi-VN')} · cập nhật ${Number(data.updated || 0).toLocaleString('vi-VN')} · còn thiếu ${Number(data.missed || 0).toLocaleString('vi-VN')}.</span><span>Chỉ sửa cache D1 nội bộ, không gửi giá/tồn lên sàn.</span>`, 'ok')
    await loadPromotionCore({ silent: true })
  } catch (error) {
    setPromotionUpdateStatus(`Làm sạch giá 0đ lỗi: ${adsEscape(error.message)}`, 'error')
  }
}

window.queuePromotionApply = async function(index) {
  activatePromotionTab('queue')
  const item = adsState.promotionDetail?.items?.[Number(index)]
  const box = adsEl('promotionQueueBox')
  if (!item || !box) return
  if (!adsState.promotionPreview || adsState.promotionPreviewItemIndex !== Number(index)) {
    const preview = await previewPromotionStockRule(index)
    if (!preview) return
  }
  box.innerHTML = '<div class="ads-empty">Đang đưa preview vào hàng đợi duyệt admin...</div>'
  try {
    const data = await adsPost('/api/discounts/promotions/queue-apply', {
      platform: item.platform,
      module: item.module,
      shop: item.shop,
      action: 'stock_price_rule',
      program_id: item.program_id,
      item_id: item.item_id,
      model_id: item.model_id,
      sku_id: item.sku_id,
      row: item,
      price_rules: {
        low_stock_price: Number(adsEl('promotionLowStockPriceInput')?.value || 0),
        medium_stock_price: Number(adsEl('promotionMediumStockPriceInput')?.value || 0),
        high_stock_price: Number(adsEl('promotionHighStockPriceInput')?.value || 0)
      },
      thresholds: {
        low_lt: 10,
        medium_lt: 100,
        max_discount_percent: Number(adsEl('promotionMaxDiscountPercentInput')?.value || 30)
      },
      minimum_margin_percent: 5,
      notes: 'Tạo từ UI Khuyến mãi sàn.'
    })
    adsState.promotionQueue = [data.queue, ...adsState.promotionQueue.filter(row => row.queue_id !== data.queue?.queue_id)].filter(Boolean)
    renderPromotionQueue(adsState.promotionQueue)
  } catch (error) {
    box.innerHTML = `<div class="ads-error">Không đưa được vào hàng đợi: ${adsEscape(error.message)}</div>`
  }
}

function renderAdsReports() {
  renderAdsSourceNotice()
}

function renderAdsSetup() {
  renderAdsSourceNotice()
}

window.previewAdsCampaignGuard = async function() {
  activateAdsGuardTab('action')
  const box = adsEl('adsGuardResult')
  if (box) {
    box.className = 'ads-guard-result loading'
    box.textContent = 'Đang dựng preview guard từ payload hiện tại...'
  }
  try {
    const result = await adsPost('/api/ads/campaign-guard/preview', adsGuardBuildRequestBody(false))
    adsState.guardPreview = result
    renderAdsGuardResult(result)
    await loadAdsGuardOverview()
    activateAdsGuardTab('action')
  } catch (error) {
    adsState.guardPreview = {
      status: 'error',
      mode: 'preview',
      platform: adsGuardInferPlatform(),
      shop: adsEl('adsGuardShop')?.value || '',
      message: error.message,
      request_payload: adsGuardBuildRequestBody(false),
      errors: [error.message]
    }
    renderAdsGuardResult(adsState.guardPreview)
    activateAdsGuardTab('action')
  }
}

window.applyAdsCampaignGuard = async function() {
  const preview = adsState.guardPreview
  if (!preview) {
    adsShowToast('Hãy bấm preview trước để kiểm tra payload ADS guard.', 'error')
    return
  }
  const body = adsGuardBuildRequestBody(true)
  const button = adsEl('adsGuardApplyBtn')
  const oldText = button?.textContent || ''
  if (button) {
    button.disabled = true
    button.textContent = 'Đang đẩy thật...'
  }
  try {
    const result = await adsPost('/api/ads/campaign-guard/apply', body)
    adsState.guardPreview = result
    renderAdsGuardResult(result)
    await loadAdsGuardOverview()
    activateAdsGuardTab(result.status === 'ok' ? 'logs' : 'action')
  } catch (error) {
    adsState.guardPreview = {
      status: 'error',
      mode: 'apply',
      platform: adsGuardInferPlatform(),
      shop: adsEl('adsGuardShop')?.value || '',
      message: error.message,
      request_payload: body,
      errors: [error.message]
    }
    renderAdsGuardResult(adsState.guardPreview)
    activateAdsGuardTab('action')
  } finally {
    if (button) {
      button.disabled = false
      button.textContent = oldText || 'Đẩy thật'
    }
  }
}

window.openAdsCampaignGuard = function(index, options = {}) {
  const row = adsState.renderedProductRows[Number(index)]
  if (!row) return
  showAdsSubpage('guard')
  activateAdsGuardTab('action')
  const capability = adsGuardCapabilities().find(item => item.shop === row.shop && item.platform === row.platform)
  if (!capability) {
    adsShowToast('Chưa nạp được capability ADS của shop này. Hãy làm mới ADS rồi thử lại.', 'error')
    return
  }
  const campaign = adsCampaignForProduct(row)
  const route = row.platform === 'shopee' ? adsCampaignEditRoute(campaign || {}, adsCampaignSetting(campaign || {})) : null
  const entityId = campaign?.campaign_id || row.ads_campaign_id || row.sku || ''
  const nextAction = options.toggleAction || ''
  adsEl('adsGuardShop').value = capability.shop
  onAdsGuardShopChanged()
  if (row.platform === 'shopee') {
    adsEl('adsGuardScope').value = options.scope || 'campaign'
    onAdsGuardScopeChanged()
    if (route?.route_key) {
      adsEl('adsGuardRoute').value = route.route_key
      onAdsGuardRouteChanged()
    }
    if (nextAction && adsEl('adsGuardAction')) adsEl('adsGuardAction').value = nextAction
  } else if (row.platform === 'lazada') {
    adsEl('adsGuardScope').value = options.scope || 'campaign'
    onAdsGuardScopeChanged()
    if (adsEl('adsGuardAction')) adsEl('adsGuardAction').value = 'toggle_status'
  }
  if (adsEl('adsGuardEntityId')) adsEl('adsGuardEntityId').value = entityId
  if (adsEl('adsGuardBudget')) adsEl('adsGuardBudget').value = ''
  if (adsEl('adsGuardRoasTarget')) adsEl('adsGuardRoasTarget').value = ''
  if (adsEl('adsGuardConfirmText')) adsEl('adsGuardConfirmText').value = ''
  adsState.guardPreview = null
  renderAdsGuardResult(null)
  adsGuardScrollIntoView()
  if (options.autoPreview) previewAdsCampaignGuard()
}

window.requestAdsCampaignToggle = function(index) {
  const row = adsState.renderedProductRows[Number(index)]
  if (!row) return
  const campaign = adsCampaignForProduct(row)
  const setting = adsCampaignSetting(campaign || {})
  const status = adsCampaignStatus(setting, campaign || {})
  const action = adsCampaignToggleAction(status)
  openAdsCampaignGuard(index, {
    scope: 'campaign',
    toggleAction: action.editAction || 'pause',
    autoPreview: true
  })
}

window.renderAdsProducts = renderAdsProducts
