function adsOptimizationHints(row = {}, campaign = null) {
  const hints = []
  const clicks = Number(row.clicks || 0)
  const roas = Number(row.roas || 0)
  const ctr = Number(row.ctr || 0)
  const cpc = Number(row.cpc || 0)
  const spend = Number(row.ads_spend || 0)
  const orders = Number(row.ads_orders || row.orders || 0)
  const setting = adsCampaignSetting(campaign || {})
  if (roas <= 0 && clicks >= 3) hints.push('Có click nhưng chưa ra đơn: kiểm tra giá, ảnh chính, tiêu đề, voucher và nội dung mô tả trước khi tăng ngân sách.')
  if (row.status === 'danger' || (spend > 0 && roas > 0 && roas < 3)) hints.push('ROAS thấp: nên tạm dừng hoặc giảm ngân sách/bid cho campaign này để tránh đốt tiền.')
  if (ctr > 0 && ctr < 1) hints.push('CTR thấp: thay ảnh chính, tiêu đề hoặc từ khóa vì khách nhìn thấy nhưng ít bấm.')
  if (cpc > 800) hints.push('CPC cao: giảm bid keyword thủ công, loại keyword rộng hoặc tăng ROAS target nếu campaign đang auto bidding.')
  if (clicks >= 20 && orders === 0) hints.push('Click nhiều nhưng không chuyển đổi: tạm dừng ADS sản phẩm này và kiểm tra lại listing/sản phẩm.')
  if (setting.roas_target) hints.push(`Campaign đang đặt ROAS target ${Number(setting.roas_target).toLocaleString('vi-VN')}. Có thể dùng API gợi ý ROI để chỉnh target sát thực tế hơn.`)
  if (!hints.length) hints.push('Campaign đang có tín hiệu ổn: giữ ngân sách, theo dõi CPO/lãi ròng và chỉ tăng khi tồn kho đủ.')
  return hints
}

function adsActionButtons(row = {}, index = 0) {
  if (String(row.platform || '').toLowerCase() === 'lazada') {
    return `
      <div class="ads-row-actions">
        <button type="button" class="ads-action-btn neutral" onclick="openAdsCampaignGuard(${index})">Guard ADS</button>
      </div>
    `
  }
  const campaign = adsCampaignForProduct(row)
  const setting = adsCampaignSetting(campaign || {})
  const status = adsCampaignStatus(setting, campaign || {})
  const toggleLabel = adsCampaignToggleAction(status).nextText
  const tone = row.status === 'danger' ? 'danger' : (row.status === 'watch' ? 'watch' : 'neutral')
  return `
    <div class="ads-row-actions">
      <button type="button" class="ads-action-btn ${tone}" onclick="requestAdsCampaignToggle(${index})">${adsEscape(toggleLabel)}</button>
      <button type="button" class="ads-action-btn primary" onclick="openAdsOptimizeModal(${index})">Tối ưu</button>
      <button type="button" class="ads-action-btn neutral" onclick="openAdsCampaignGuard(${index})">Guard ADS</button>
    </div>
  `
}

function adsBuildCampaignToggleContext(index) {
  const row = adsState.renderedProductRows[Number(index)]
  if (!row) return { error: 'Không tìm thấy dòng ADS cần thao tác.' }
  const campaign = adsCampaignForProduct(row)
  const campaignId = campaign?.campaign_id || row.sku || ''
  const setting = adsCampaignSetting(campaign || {})
  const status = adsCampaignStatus(setting, campaign || {})
  const action = adsCampaignToggleAction(status)
  const route = adsCampaignEditRoute(campaign || {}, setting)
  const shop = campaign?.shop || row.shop || adsEl('adsShop')?.value || ''
  const productName = row.product_name || campaign?.campaign_name || campaignId

  if (!campaign || !/^\d+$/.test(String(campaignId))) {
    return { error: 'Chưa đổi được ADS vì thiếu campaign_id số của Shopee.\n\nCần kiểm tra endpoint: /api/v2/ads/get_product_level_campaign_id_list hoặc /api/v2/ads/get_product_level_campaign_setting_info.' }
  }
  if (!shop) {
    return { error: 'Chưa đổi được ADS vì thiếu tên shop/API shop để ký request Shopee.' }
  }
  if (action.blocked) {
    return { error: `${action.blocked}\n\nCampaign: ${campaignId}` }
  }
  return { row, campaign, campaignId, setting, status, action, route, shop, productName }
}

function ensureAdsCampaignToggleModal() {
  let modal = adsEl('adsCampaignToggleModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'adsCampaignToggleModal'
  modal.className = 'ads-optimize-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="ads-optimize-dialog">
      <div class="ads-optimize-head">
        <div>
          <b id="adsCampaignToggleTitle">Xác nhận thao tác ADS</b>
          <span id="adsCampaignToggleSub"></span>
        </div>
        <button type="button" onclick="closeAdsCampaignToggleModal()">Đóng</button>
      </div>
      <div id="adsCampaignToggleBody" class="ads-optimize-body"></div>
    </div>
  `
  document.body.appendChild(modal)
  modal.addEventListener('click', event => {
    if (event.target === modal) closeAdsCampaignToggleModal()
  })
  return modal
}

window.requestAdsCampaignToggle = function(index) {
  const context = adsBuildCampaignToggleContext(index)
  if (context.error) {
    alert(context.error)
    return
  }
  adsState.pendingCampaignToggle = context
  const modal = ensureAdsCampaignToggleModal()
  const title = adsEl('adsCampaignToggleTitle')
  const sub = adsEl('adsCampaignToggleSub')
  const body = adsEl('adsCampaignToggleBody')
  if (title) title.textContent = `Xác nhận ${context.action.label} ADS`
  if (sub) sub.textContent = `${context.shop} · Campaign ${context.campaignId} · ${context.route.label}`
  if (body) {
    // Modal này là lớp chặn cuối để tránh bấm nhầm làm thay đổi tiền quảng cáo thật.
    body.innerHTML = `
      <div class="ads-optimize-hints">
        <b>Xác nhận ${adsEscape(context.action.label)} ADS trên Shopee</b>
        <p>Sản phẩm: ${adsEscape(context.productName)}</p>
        <p>Shop: ${adsEscape(context.shop)} · Campaign: ${adsEscape(context.campaignId)}</p>
        <p>Trạng thái API hiện có: ${adsEscape(context.setting.campaign_status || context.status || 'chưa rõ')}</p>
      </div>
      <div class="ads-optimize-setting">
        <b>Endpoint sẽ gọi</b>
        <span>${adsEscape(context.route.shopeeEndpoint)} qua ${adsEscape(context.route.appPath)}</span>
      </div>
      <div id="adsToggleActionResult" class="ads-optimize-api-result">
        Bấm "Gửi lệnh" mới gửi request thật tới Shopee. Thao tác này ảnh hưởng trực tiếp tiền quảng cáo.
      </div>
      <div class="ads-optimize-actions">
        <button type="button" onclick="closeAdsCampaignToggleModal()">Hủy</button>
        <button id="adsToggleConfirmBtn" type="button" onclick="confirmAdsCampaignToggle()">Gửi lệnh</button>
      </div>
    `
  }
  modal.hidden = false
}

window.closeAdsCampaignToggleModal = function() {
  const modal = adsEl('adsCampaignToggleModal')
  if (modal) modal.hidden = true
  adsState.pendingCampaignToggle = null
}

window.confirmAdsCampaignToggle = async function() {
  const context = adsState.pendingCampaignToggle
  if (!context) return
  const { campaignId, action, route, shop } = context
  const resultBox = adsEl('adsToggleActionResult') || adsEl('adsOptimizeApiResult')
  const button = adsEl('adsToggleConfirmBtn')
  if (button) button.disabled = true
  if (resultBox) resultBox.textContent = `Đang gửi lệnh ${action.label} campaign ${campaignId} qua ${route.shopeeEndpoint}...`
  try {
    const result = await adsPost(route.appPath, {
      shop,
      campaign_id: campaignId,
      edit_action: action.editAction,
      apply: true,
      safe_mode: true,
      confirm_apply: route.confirm,
      reference_id: `web_ads_toggle_${Date.now()}_${campaignId}`
    })
    const requestId = result.request_id ? ` Request ID: ${result.request_id}.` : ''
    const message = result.message || result.warning || 'Shopee đã nhận request.'
    if (resultBox) resultBox.textContent = `Đã gửi lệnh ${action.label}: ${message}${requestId}`
    alert(`Đã gửi lệnh ${action.label} ADS cho campaign ${campaignId}.\n${message}${requestId}\n\nMàn hình sẽ kéo lại trạng thái từ Ads API.`)
    await runAdsCampaignSync({
      manual: false,
      body: {
        ...adsRealtimeBody(),
        platform: 'shopee',
        shop,
        campaign_id_list: String(campaignId),
        include_product_campaigns: true,
        include_affiliate: false,
        include_open_campaign: false
      }
    })
    closeAdsCampaignToggleModal()
    await loadAdsDashboard({ skipAutoSync: true })
  } catch (error) {
    if (resultBox) resultBox.textContent = `Không đổi được ADS: ${error.message}`
    alert(`Không đổi được ADS campaign ${campaignId}: ${error.message}\n\nEndpoint đang dùng: ${route.shopeeEndpoint}`)
  } finally {
    if (button) button.disabled = false
  }
}

function ensureAdsOptimizeModal() {
  let modal = adsEl('adsOptimizeModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'adsOptimizeModal'
  modal.className = 'ads-optimize-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="ads-optimize-dialog">
      <div class="ads-optimize-head">
        <div>
          <b id="adsOptimizeTitle">Tối ưu ADS</b>
          <span id="adsOptimizeSub"></span>
        </div>
        <button type="button" onclick="closeAdsOptimizeModal()">Đóng</button>
      </div>
      <div id="adsOptimizeBody" class="ads-optimize-body"></div>
    </div>
  `
  document.body.appendChild(modal)
  modal.addEventListener('click', event => {
    if (event.target === modal) closeAdsOptimizeModal()
  })
  return modal
}

window.openAdsOptimizeModal = function(index) {
  const row = adsState.renderedProductRows[Number(index)]
  if (!row) return
  const campaign = adsCampaignForProduct(row)
  const setting = adsCampaignSetting(campaign || {})
  const itemId = adsCampaignItemId(campaign || {})
  adsState.selectedOptimizeRow = { row, campaign }
  const modal = ensureAdsOptimizeModal()
  const title = adsEl('adsOptimizeTitle')
  const sub = adsEl('adsOptimizeSub')
  const body = adsEl('adsOptimizeBody')
  if (title) title.textContent = row.product_name || row.sku || 'Campaign ADS'
  if (sub) sub.textContent = `${row.shop || ''} · Campaign ${campaign?.campaign_id || row.sku || 'chưa rõ'} · ${adsStatusText(row.status)}`
  if (body) {
    const hints = adsOptimizationHints(row, campaign)
    body.innerHTML = `
      <div class="ads-optimize-kpis">
        <div><span>Chi ADS</span><b>${adsMoney(row.ads_spend)}</b></div>
        <div><span>Click</span><b>${Number(row.clicks || 0).toLocaleString('vi-VN')}</b></div>
        <div><span>CPC</span><b>${adsMoney(row.cpc)}</b></div>
        <div><span>ROAS</span><b>${Number(row.roas || 0).toFixed(2)}</b></div>
        <div><span>ACOS</span><b>${adsPct(row.acos)}</b></div>
        <div><span>Đơn ADS</span><b>${Number(row.ads_orders || row.orders || 0).toLocaleString('vi-VN')}</b></div>
      </div>
      <div class="ads-optimize-hints">
        <b>Hướng xử lý</b>
        ${hints.map(hint => `<p>${adsEscape(hint)}</p>`).join('')}
      </div>
      <div class="ads-optimize-setting">
        <b>Setting API hiện có</b>
        <span>Trạng thái: ${adsEscape(setting.campaign_status || 'chưa rõ')} · Bidding: ${adsEscape(setting.bidding_method || 'chưa rõ')} · Placement: ${adsEscape(setting.campaign_placement || 'chưa rõ')} · ROAS target: ${setting.roas_target ? Number(setting.roas_target).toLocaleString('vi-VN') : 'N/A'}</span>
      </div>
      <div id="adsOptimizeApiResult" class="ads-optimize-api-result">Chưa gọi API gợi ý ROI.</div>
      <div class="ads-optimize-actions">
        <button type="button" onclick="loadAdsRoiTarget(${Number(index)})" ${itemId ? '' : 'disabled'}>Lấy ROI target gợi ý</button>
        <button type="button" onclick="requestAdsCampaignToggle(${Number(index)})">Tắt/Bật ADS</button>
        <button type="button" onclick="openAdsCampaignGuard(${Number(index)})">Mở guard nâng cao</button>
      </div>
    `
  }
  modal.hidden = false
}

window.closeAdsOptimizeModal = function() {
  const modal = adsEl('adsOptimizeModal')
  if (modal) modal.hidden = true
}

window.loadAdsRoiTarget = async function(index) {
  const row = adsState.renderedProductRows[Number(index)]
  const campaign = row ? adsCampaignForProduct(row) : null
  const itemId = adsCampaignItemId(campaign || {})
  const box = adsEl('adsOptimizeApiResult')
  if (!row || !itemId || !box) return
  box.textContent = 'Đang gọi Shopee get_product_recommended_roi_target...'
  try {
    const data = await adsPost('/api/ads/shopee/product-recommended-roi-target', {
      shop: row.shop,
      item_id: itemId,
      reference_id: `roi-${campaign?.campaign_id || row.sku || itemId}-${Date.now()}`
    })
    const res = data.response || {}
    box.innerHTML = `
      <b>ROI target Shopee gợi ý</b>
      <span>Thấp: ${res.lower_bound?.value ?? 'N/A'} · Trung bình: ${res.exact?.value ?? 'N/A'} · Cao: ${res.upper_bound?.value ?? 'N/A'}</span>
    `
  } catch (error) {
    box.textContent = `Không lấy được ROI target: ${error.message}`
  }
}

function renderAdsProducts() {
  const list = adsEl('adsProductList')
  const summary = adsEl('adsProductSummary')
  if (!list) return

  if (!adsHasRealData()) {
    if (summary) summary.textContent = '0 SKU có ADS thật'
    adsState.renderedProductRows = []
    list.innerHTML = '<div class="ads-empty">Chưa có SKU/campaign phát sinh spend thật từ Ads API.</div>'
    return
  }

  const q = (adsEl('adsSearch')?.value || '').trim().toLowerCase()
  const status = adsEl('adsStatus')?.value || ''
  let rows = adsState.data?.product_performance || []
  if (q) {
    rows = rows.filter(row =>
      String(row.sku || '').toLowerCase().includes(q) ||
      String(row.product_name || '').toLowerCase().includes(q) ||
      String(row.shop || '').toLowerCase().includes(q)
    )
  }
  if (status) rows = rows.filter(row => row.status === status)
  if (summary) summary.textContent = `${rows.length.toLocaleString('vi-VN')} SKU/campaign`

  if (!rows.length) {
    adsState.renderedProductRows = []
    list.innerHTML = '<div class="ads-empty">Không có SKU/campaign khớp bộ lọc.</div>'
    return
  }
  adsState.renderedProductRows = rows

  list.innerHTML = `
    <div class="ads-product-table-wrap">
      <table class="ads-product-table">
        <thead>
          <tr>
            <th>Sản phẩm / SKU</th>
            <th>Shop</th>
            <th>Chi ADS</th>
            <th>Click</th>
            <th>CPC</th>
            <th>ROAS</th>
            <th>ACOS</th>
            <th>Review</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => {
            const cls = adsStatusClass(row.status)
            return `
              <tr>
                <td>
                  <b>${adsEscape(row.product_name || row.sku || 'Campaign')}</b>
                  <span>${adsEscape(row.sku || 'SKU chưa rõ')} · ${Number(row.impressions || 0).toLocaleString('vi-VN')} impression</span>
                </td>
                <td>${adsEscape(row.shop || '')}<span>${adsEscape(adsPlatformLabel(row.platform))}</span></td>
                <td><strong>${adsMoney(row.ads_spend)}</strong></td>
                <td>${Number(row.clicks || 0).toLocaleString('vi-VN')}</td>
                <td>${adsMoney(row.cpc)}</td>
                <td><strong>${Number(row.roas || 0).toFixed(2)}</strong></td>
                <td>${adsPct(row.acos)}</td>
                <td>${adsReviewRiskCell(row)}</td>
                <td class="ads-status-actions">
                  <span class="ads-pill ${cls}">${adsEscape(adsStatusText(row.status))}</span>
                  ${adsActionButtons(row, index)}
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderAdsSourceNotice() {
  const box = adsEl('adsSourceNotice')
  const summary = adsEl('adsSourceSummary')
  const data = adsState.data || {}
  const diagnostics = data.diagnostics || {}
  const warnings = adsState.lastSync?.warnings || []
  const balances = Array.isArray(data.ads_balances) ? data.ads_balances : []
  const toggleInfo = Array.isArray(data.ads_toggle_info) ? data.ads_toggle_info : []
  const affiliateRows = Array.isArray(data.affiliate_performance) ? data.affiliate_performance : []
  const affiliateSummary = data.affiliate_summary || {}
  const openCampaignRows = Array.isArray(data.open_campaign_performance) ? data.open_campaign_performance : []
  const openCampaignSummary = data.open_campaign_summary || {}
  const hasData = adsHasRealData()

  if (summary) {
    summary.textContent = hasData
      ? `${Number(diagnostics.campaign_snapshot_count || data.campaigns?.length || 0).toLocaleString('vi-VN')} snapshot · ${Number(diagnostics.running_ads_shop_count || data.shop_performance?.length || 0).toLocaleString('vi-VN')} shop`
      : 'Chưa có snapshot thật'
  }
  if (!box) return

  const syncHtml = adsState.lastSync
    ? `<span>${adsState.lastSync.auto ? 'Auto sync gần nhất' : 'Sync gần nhất'}: gọi ${(adsState.lastSync.shops || []).length.toLocaleString('vi-VN')} shop API, lấy ${Number(adsState.lastSync.fetched_campaigns || 0).toLocaleString('vi-VN')} dòng ADS, lưu ${Number(adsState.lastSync.saved || 0).toLocaleString('vi-VN')} snapshot.</span>`
    : '<span>ADS sẽ tự gọi API realtime khi mở tab và tự cập nhật lại khi tab ADS đang hoạt động. Nút “Kéo ADS realtime” chỉ dùng khi muốn ép chạy ngay.</span>'
  const warningHtml = warnings.length
    ? adsSyncWarningsHtml(8).replace('ads-sync-warnings', 'ads-source-warnings')
    : ''
  const shopHtml = adsState.lastSync?.shops?.length
    ? `<div class="ads-source-shop-grid">${adsState.lastSync.shops.map(shop => `
        <div>
          <b>${adsEscape(shop.shop || 'Shop API')}</b>
          <span>${Number(shop.fetched_campaigns || 0).toLocaleString('vi-VN')} dòng ADS · ${Number(shop.saved || 0).toLocaleString('vi-VN')} snapshot · product ${Number(shop.product_campaign_snapshots || 0).toLocaleString('vi-VN')}</span>
        </div>
      `).join('')}</div>`
    : ''
  const balanceHtml = balances.length
    ? `<div class="ads-balance-grid">${balances.map(item => `
        <div class="${item.ok ? 'ok' : 'error'}">
          <b>${adsEscape(item.shop || 'Shop Shopee')}</b>
          <span>${item.ok ? `Ví ADS realtime: ${adsMoney(item.total_balance)}` : `Không lấy được ví ADS: ${adsEscape(adsHumanizeApiMessage(item.message || item.error || ''))}`}</span>
          <small>${item.ok ? `Snapshot ${adsEscape(adsTime(item.data_timestamp))}` : 'get_total_balance lỗi hoặc shop chưa có quyền ADS'}</small>
        </div>
      `).join('')}</div>`
    : '<div class="ads-balance-empty">Chưa có dữ liệu ví ADS Shopee realtime trong bộ lọc này.</div>'

  const toggleHtml = toggleInfo.length
    ? `<div class="ads-balance-grid">${toggleInfo.map(item => `
        <div class="${item.ok ? 'ok' : 'error'}">
          <b>${adsEscape(item.shop || 'Shop Shopee')}</b>
          ${item.ok
            ? `<div class="ads-toggle-stack">
                ${adsToggleButton(item, 'auto_top_up', 'Tự động nạp tiền')}
                ${adsToggleButton(item, 'campaign_surge', 'Campaign surge')}
              </div>`
            : `<span>Không lấy được trạng thái Ads: ${adsEscape(adsHumanizeApiMessage(item.message || item.error || ''))}</span>`
          }
          <small>${item.ok ? `Shopee get_shop_toggle_info · Chỉ đọc trạng thái · Dữ liệu lúc ${adsEscape(adsTime(item.data_timestamp))}` : 'get_shop_toggle_info lỗi hoặc shop chưa có quyền ADS'}</small>
        </div>
      `).join('')}</div>`
    : '<div class="ads-balance-empty">Chưa có dữ liệu get_shop_toggle_info trong bộ lọc này.</div>'

  const affiliateHtml = affiliateRows.length
    ? `<div class="ads-affiliate-box">
        <b>Shopee Affiliate API</b>
        <span>Doanh thu ${adsMoney(affiliateSummary.sales)} · Hoa hồng dự kiến ${adsMoney(affiliateSummary.est_commission)} · ROI ${Number(affiliateSummary.roi || 0).toFixed(2)} · ${Number(affiliateSummary.affiliates || 0).toLocaleString('vi-VN')} affiliate</span>
      </div>`
    : '<div class="ads-affiliate-box muted">Chưa có snapshot Shopee Affiliate API trong bộ lọc này.</div>'

  const openCampaignHtml = openCampaignRows.length
    ? `<div class="ads-affiliate-box">
        <b>Shopee Open Campaign API</b>
        <span>${Number(openCampaignSummary.products || 0).toLocaleString('vi-VN')} sản phẩm · Doanh thu ${adsMoney(openCampaignSummary.sales)} · Đã bán ${Number(openCampaignSummary.item_sold || 0).toLocaleString('vi-VN')} · Hoa hồng dự kiến ${adsMoney(openCampaignSummary.est_commission)}</span>
      </div>`
    : '<div class="ads-affiliate-box muted">Chưa có snapshot Shopee Open Campaign API trong bộ lọc này.</div>'

  box.innerHTML = `
    <div class="ads-source-line ${hasData ? 'ok' : 'empty'}">
      <b>${hasData ? 'Đang dùng dữ liệu ADS thật' : 'Chưa có dữ liệu ADS thật'}</b>
      <span>Chỉ đọc snapshot ADS thật từ Shopee/Lazada Ads API có spend > 0. Không dùng cost setting, orders_v2.fee_ads, platform_reports hoặc fallback.</span>
      <span>get_total_balance chỉ dùng để hiển thị số dư ví ADS realtime, không dùng làm chi phí/click/impression/campaign.</span>
      ${syncHtml}
    </div>
    ${balanceHtml}
    ${toggleHtml}
    ${affiliateHtml}
    ${openCampaignHtml}
    ${shopHtml}
    ${warningHtml}
  `
}

async function refreshAdsRealtimeIfNeeded(options = {}) {
  if (!adsIsTabActive()) return false
  if (!adsState.realtimeEnabled) return false
  if (!adsCanAutoSync(options.force === true)) return false
  await runAdsCampaignSync({ manual: false })
  await loadAdsDashboard({ skipAutoSync: true })
  return true
}

function startAdsRealtimePolling() {
  if (adsState.realtimeTimer) return
  adsState.realtimeTimer = setInterval(() => {
    refreshAdsRealtimeIfNeeded().catch(error => {
      adsState.lastSync = {
        fetched_campaigns: 0,
        saved: 0,
        warnings: [{ message: error.message }],
        shops: [],
        auto: true,
        synced_at: new Date().toISOString()
      }
      renderAdsSourceNotice()
    })
  }, adsState.realtimeIntervalMs)
}

window.addEventListener('focus', () => {
  refreshAdsRealtimeIfNeeded({ force: true }).catch(() => {})
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshAdsRealtimeIfNeeded({ force: true }).catch(() => {})
})
