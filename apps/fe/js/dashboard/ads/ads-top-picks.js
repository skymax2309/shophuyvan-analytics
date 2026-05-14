function topPicksQuery(includePayment = false, sync = false) {
  const qs = new URLSearchParams()
  const from = adsEl('filterFrom')?.value || ''
  const to = adsEl('filterTo')?.value || ''
  const shop = adsEl('adsShop')?.value || ''
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (shop) qs.set('shop', shop)
  qs.set('limit', '500')
  qs.set('include_payment_detail', includePayment ? '1' : '0')
  if (sync) qs.set('sync', '1')
  return qs.toString()
}

function topPicksRecommendationText(code) {
  const labels = {
    keep_or_raise_ads_bid: 'Giữ TopPicks / tăng ADS',
    monitor_and_ab_test: 'Theo dõi A/B test',
    replace_top_picks_items: 'Thay sản phẩm TopPicks',
    check_listing_or_tracking: 'Kiểm tra listing / mã theo dõi'
  }
  return labels[code] || code || 'Theo dõi'
}

function topPicksRecommendationClass(code) {
  if (code === 'keep_or_raise_ads_bid') return 'good'
  if (code === 'replace_top_picks_items') return 'danger'
  return 'watch'
}

function topPicksHints(row = {}) {
  const hints = []
  const rate = Number(row.attach_rate || 0)
  const clicks = Number(row.ads_clicks || 0)
  const orders = Number(row.primary_order_count || 0)
  if (row.recommendation === 'replace_top_picks_items') {
    hints.push('Attach rate thấp: thay sản phẩm trong bộ TopPicks bằng SKU liên quan trực tiếp tới sản phẩm đang chạy ADS.')
    hints.push('Ưu tiên SKU có tồn kho ổn, biên lợi nhuận tốt và đang bán kèm thật trong đơn hàng.')
  }
  if (row.recommendation === 'check_listing_or_tracking') {
    hints.push('Có click ADS nhưng chưa thấy đơn chính: kiểm tra tiêu đề, ảnh, giá, voucher và mã theo dõi TopPicks.')
    hints.push('Gắn tracking/voucher riêng cho bộ TopPicks để lần sau đối soát không bị mù nguồn.')
  }
  if (row.recommendation === 'monitor_and_ab_test') {
    hints.push('Attach rate trung bình: chạy A/B 2 bộ TopPicks trong 3-7 ngày rồi giữ bộ có attach rate cao hơn.')
  }
  if (row.recommendation === 'keep_or_raise_ads_bid') {
    hints.push('Bộ TopPicks đang hỗ trợ bán kèm tốt. Có thể giữ cấu hình và ưu tiên ngân sách cho sản phẩm ADS chính.')
  }
  if (!hints.length) hints.push('Theo dõi thêm click, đơn chính và SKU mua kèm trước khi đổi cấu hình.')
  if (clicks > 20 && orders === 0) hints.push('Click nhiều nhưng không có đơn: không tăng ADS, kiểm tra lại giá/ảnh/mô tả trước.')
  if (rate === 0 && orders > 0) hints.push('Có đơn chính nhưng không có mua kèm: sản phẩm trong TopPicks chưa đủ liên quan.')
  return hints
}

function topPicksActionButtons(row = {}, index = 0) {
  const cls = topPicksRecommendationClass(row.recommendation)
  return `
    <div class="ads-row-actions">
      <button type="button" class="ads-action-btn ${cls}" onclick="openTopPicksOptimizeModal(${index})">Tùy chỉnh</button>
    </div>
  `
}

function adsAnalysisCacheNotice(data = {}, fallback = '') {
  const mode = data.cache?.mode || 'cache_only'
  const text = data.cache?.note || fallback || 'Mặc định đọc dữ liệu đã cache; chỉ nút cập nhật cache mới gọi API sàn.'
  const label = mode === 'sync_then_cache' ? 'Vừa cập nhật cache' : 'Đang đọc cache'
  return `<div class="ads-cache-note"><b>${adsEscape(label)}</b><span>${adsEscape(text)}</span></div>`
}

function renderTopPicksCards(rows = []) {
  return `
    <div class="ads-analysis-card-list ads-top-picks-card-list">
      ${rows.map((row, index) => `
        <article class="ads-analysis-card ${topPicksRecommendationClass(row.recommendation)}">
          <div class="ads-analysis-card-head">
            <div>
              <b>${adsEscape(row.ads_product_name || row.ads_campaign_name || '')}</b>
              <span>${adsEscape(row.shop || '')} · ${adsEscape(row.date || '')} ${adsEscape(row.hour_label || '')}</span>
            </div>
            <span class="ads-pill ${topPicksRecommendationClass(row.recommendation)}">${adsEscape(topPicksRecommendationText(row.recommendation))}</span>
          </div>
          <div class="ads-analysis-card-sub">
            <b>TopPicks: ${adsEscape(row.top_picks_name || row.top_picks_id || '')}</b>
            <span>${adsEscape(row.tracking_code || row.voucher_code || 'Chưa gắn mã theo dõi')}</span>
          </div>
          <div class="ads-analysis-metrics">
            <div><span>Attach</span><b>${adsPct(row.attach_rate)}</b><small>${Number(row.attach_order_count || 0).toLocaleString('vi-VN')}/${Number(row.primary_order_count || 0).toLocaleString('vi-VN')} đơn</small></div>
            <div><span>Chi ADS</span><b>${adsMoney(row.ads_spend)}</b><small>${Number(row.ads_clicks || 0).toLocaleString('vi-VN')} click</small></div>
            <div><span>DT kèm</span><b>${adsMoney(row.attach_revenue)}</b><small>${(row.attach_skus || []).length.toLocaleString('vi-VN')} SKU</small></div>
          </div>
          <div class="ads-analysis-card-foot">
            <span>${(row.attach_skus || []).slice(0, 2).map(item => adsEscape(item.sku || item.product_name || '')).join(' · ') || 'Chưa có SKU mua kèm'}</span>
            ${topPicksActionButtons(row, index)}
          </div>
        </article>
      `).join('')}
    </div>
  `
}

window.openTopPicksOptimizeModal = function(index) {
  const row = adsState.renderedTopPicksRows[Number(index)]
  if (!row) return
  adsState.selectedTopPicksRow = row
  const modal = ensureAdsOptimizeModal()
  const title = adsEl('adsOptimizeTitle')
  const body = adsEl('adsOptimizeBody')
  if (title) {
    title.innerHTML = `
      <b>TopPicks: ${adsEscape(row.top_picks_name || row.top_picks_id || '')}</b>
      <span>${adsEscape(row.shop || '')} · ADS: ${adsEscape(row.ads_product_name || row.ads_campaign_name || '')}</span>
    `
  }
  if (body) {
    body.innerHTML = `
      <div class="ads-optimize-kpis">
        <div><span>Attach rate</span><b>${adsPct(row.attach_rate)}</b></div>
        <div><span>Đơn chính</span><b>${Number(row.primary_order_count || 0).toLocaleString('vi-VN')}</b></div>
        <div><span>Đơn mua kèm</span><b>${Number(row.attach_order_count || 0).toLocaleString('vi-VN')}</b></div>
        <div><span>Click ADS</span><b>${Number(row.ads_clicks || 0).toLocaleString('vi-VN')}</b></div>
        <div><span>Doanh thu kèm</span><b>${adsMoney(row.attach_revenue)}</b></div>
      </div>
      <div class="ads-optimize-hints">
        <b>Phải làm gì</b>
        ${topPicksHints(row).map(hint => `<p>${adsEscape(hint)}</p>`).join('')}
      </div>
      <div class="ads-optimize-hints">
        <b>Gắn mã theo dõi nội bộ</b>
        <p>TopPicks API không trả attribution trực tiếp. Gắn mã tracking/voucher giúp đối soát đơn mua kèm chính xác hơn.</p>
        <div class="ads-mini-form">
          <label>Mã tracking <input id="topPicksTrackingInput" value="${adsEscape(row.tracking_code || '')}" placeholder="VD: TP_COMBO_01"></label>
          <label>Voucher/mã nhóm <input id="topPicksVoucherInput" value="${adsEscape(row.voucher_code || '')}" placeholder="VD: TP_K64"></label>
          <label>Ghi chú <input id="topPicksNoteInput" value="" placeholder="Lý do đổi bộ TopPicks"></label>
        </div>
      </div>
      <div id="topPicksActionResult" class="ads-optimize-result">Chưa lưu thay đổi.</div>
      <div class="ads-optimize-actions">
        <button type="button" onclick="saveTopPicksTrackingFromModal()">Lưu mã theo dõi</button>
        <button type="button" onclick="alert('Thao tác thay sản phẩm TopPicks cần endpoint add/update TopPicks chính thức của Shopee. Hiện hệ thống đang đọc get_top_picks_list và lưu tracking nội bộ, chưa gửi thay đổi bộ TopPicks lên sàn để tránh thao tác giả.')">Thay bộ TopPicks</button>
      </div>
    `
  }
  modal.hidden = false
}

window.saveTopPicksTrackingFromModal = async function() {
  const row = adsState.selectedTopPicksRow
  const box = adsEl('topPicksActionResult')
  if (!row || !box) return
  box.textContent = 'Đang lưu mã theo dõi...'
  try {
    const result = await adsPost('/api/top-picks/tracking', {
      shop: row.shop,
      top_picks_id: row.top_picks_id,
      tracking_code: adsEl('topPicksTrackingInput')?.value || '',
      voucher_code: adsEl('topPicksVoucherInput')?.value || '',
      note: adsEl('topPicksNoteInput')?.value || ''
    })
    box.textContent = result.status === 'error'
      ? `Không lưu được: ${result.message || result.error || 'unknown'}`
      : 'Đã lưu mã theo dõi nội bộ. Bấm phân tích lại để cập nhật bảng.'
  } catch (error) {
    box.textContent = `Không lưu được: ${error.message}`
  }
}

function renderTopPicksAnalysis() {
  const box = adsEl('topPicksAnalysisBox')
  const summaryEl = adsEl('topPicksSummary')
  if (!box) return
  const data = adsState.topPicks
  if (!data) {
    if (summaryEl) summaryEl.textContent = 'Chưa phân tích'
    adsState.renderedTopPicksRows = []
    box.innerHTML = '<div class="ads-empty">Bấm phân tích để đối soát TopPicks với ADS, đơn hàng và Payment API.</div>'
    return
  }
  if (data.error) {
    if (summaryEl) summaryEl.textContent = 'Lỗi phân tích'
    adsState.renderedTopPicksRows = []
    box.innerHTML = `<div class="ads-error">Không phân tích được TopPicks: ${adsEscape(data.error)}</div>`
    return
  }
  const rows = Array.isArray(data.rows) ? data.rows : []
  const summary = data.summary || {}
  if (summaryEl) {
    summaryEl.textContent = `${Number(data.top_picks?.active_collections || 0).toLocaleString('vi-VN')} bộ đang bật · ${rows.length.toLocaleString('vi-VN')} dòng`
  }
  const payment = data.payment_detail || {}
  const warningHtml = payment.warnings?.length
    ? `<div class="ads-top-picks-warning">${payment.warnings.map(item => adsEscape(item.message || item.error || String(item))).join('<br>')}</div>`
    : ''
  const cacheNotice = adsAnalysisCacheNotice(data, 'TopPicks đang phân tích từ snapshot đã lưu; nút cập nhật cache mới gọi Shopee get_top_picks_list.')
  const kpis = `
    <div class="ads-top-picks-kpis">
      <div><span>Attach rate</span><b>${adsPct(summary.attach_rate)}</b></div>
      <div><span>Doanh thu bán kèm</span><b>${adsMoney(summary.attach_revenue)}</b></div>
      <div><span>Click ADS</span><b>${Number(summary.ads_clicks || 0).toLocaleString('vi-VN')}</b></div>
      <div><span>Payment xác nhận</span><b>${Number(payment.confirmed_order_sns || 0).toLocaleString('vi-VN')} đơn</b></div>
    </div>
  `
  if (!rows.length) {
    adsState.renderedTopPicksRows = []
    box.innerHTML = `
      ${cacheNotice}
      ${kpis}
      <div class="ads-empty">Chưa có dòng TopPicks khớp sản phẩm ADS trong bộ lọc này. Hãy bấm "Cập nhật cache TopPicks" sau khi shop đã bật TopPicks.</div>
      ${warningHtml}
    `
    return
  }
  const visibleRows = rows.slice(0, 30)
  adsState.renderedTopPicksRows = visibleRows
  box.innerHTML = `
    ${cacheNotice}
    ${kpis}
    ${renderTopPicksCards(visibleRows)}
    <div class="ads-product-table-wrap ads-analysis-table-wrap">
      <table class="ads-product-table ads-top-picks-table">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>ADS</th>
            <th>TopPicks</th>
            <th>Attach</th>
            <th>SKU mua kèm</th>
            <th>Gợi ý / thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map((row, index) => `
            <tr>
              <td><b>${adsEscape(row.date || '')}</b><span>${adsEscape(row.hour_label || '')}</span></td>
              <td><b>${adsEscape(row.ads_product_name || row.ads_campaign_name || '')}</b><span>${adsEscape(row.ads_product_sku || row.ads_campaign_id || '')} · ${adsMoney(row.ads_spend)} · ${Number(row.ads_clicks || 0).toLocaleString('vi-VN')} click</span></td>
              <td><b>${adsEscape(row.top_picks_name || row.top_picks_id || '')}</b><span>${adsEscape(row.tracking_code || row.voucher_code || 'Chưa gắn mã theo dõi')}</span></td>
              <td><strong>${adsPct(row.attach_rate)}</strong><span>${Number(row.attach_order_count || 0).toLocaleString('vi-VN')}/${Number(row.primary_order_count || 0).toLocaleString('vi-VN')} đơn</span></td>
              <td>${(row.attach_skus || []).slice(0, 3).map(item => `<b>${adsEscape(item.sku || item.product_name || '')}</b>`).join('<br>') || '<span>Chưa có</span>'}</td>
              <td class="ads-status-actions">
                <span class="ads-pill ${topPicksRecommendationClass(row.recommendation)}">${adsEscape(topPicksRecommendationText(row.recommendation))}</span>
                ${topPicksActionButtons(row, index)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${warningHtml}
  `
}

window.loadTopPicksAnalysis = async function(options = {}) {
  const box = adsEl('topPicksAnalysisBox')
  const includePayment = options.includePayment !== false
  const sync = options.sync === true
  if (box) box.innerHTML = '<div class="ads-empty">Đang phân tích TopPicks từ cache nội bộ...</div>'
  try {
    adsState.topPicks = await adsFetch(`/api/top-picks/shopee/analysis?${topPicksQuery(includePayment, sync)}`)
  } catch (error) {
    adsState.topPicks = { error: error.message }
  }
  renderTopPicksAnalysis()
}

window.syncTopPicksAndAnalyze = async function() {
  const box = adsEl('topPicksAnalysisBox')
  if (box) box.innerHTML = '<div class="ads-empty">Đang cập nhật cache TopPicks từ Shopee API rồi phân tích lại...</div>'
  try {
    await adsPost('/api/top-picks/shopee/sync', {
      shop: adsEl('adsShop')?.value || '',
      shop_limit: 100
    })
  } catch (error) {
    adsState.topPicks = { error: error.message }
    renderTopPicksAnalysis()
    return
  }
  await loadTopPicksAnalysis({ includePayment: true })
}
