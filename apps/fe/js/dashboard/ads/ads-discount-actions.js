window.openDiscountOptimizeModal = function(index) {
  const row = adsState.renderedDiscountRows[Number(index)]
  if (!row) return
  adsState.selectedDiscountRow = row
  const modal = ensureAdsOptimizeModal()
  const title = adsEl('adsOptimizeTitle')
  const body = adsEl('adsOptimizeBody')
  const original = Number(row.original_price || 0)
  const current = Number(row.promotion_price || 0)
  const currentPercent = Number(row.discount_percent || 0)
  const stockPriceRules = discountDefaultStockPriceRules(row)
  const activeTier = discountStockTier(row, stockPriceRules)
  const preview = discountStockRulePreview(row, stockPriceRules)
  if (title) {
    title.innerHTML = `
      <b>Tùy chỉnh giá KM</b>
      <span>${adsEscape(row.shop || '')} · ${adsEscape(row.discount_name || row.discount_id || '')}</span>
    `
  }
  if (body) {
    body.innerHTML = `
      <div class="ads-optimize-kpis">
        <div><span>Giá gốc</span><b>${adsMoney(original)}</b></div>
        <div><span>Giá KM hiện tại</span><b>${adsMoney(current)}</b></div>
        <div><span>Tồn kho</span><b>${Number(row.stock || 0).toLocaleString('vi-VN')}</b></div>
        <div><span>ADS</span><b>${adsMoney(row.ads_spend)}</b></div>
        <div><span>Đơn</span><b>${Number(row.orders || 0).toLocaleString('vi-VN')}</b></div>
        <div><span>ROAS</span><b>${Number(row.roas_after_discount || 0).toFixed(2)}</b></div>
      </div>
      <div class="ads-optimize-section">
        <div class="ads-step-title"><span>1</span><b>Đặt giá KM theo tồn kho</b></div>
        <p>Nhập số tiền cho từng ngưỡng tồn. Sản phẩm đang tồn ${Number(row.stock || 0).toLocaleString('vi-VN')}, khi tạo lệnh sẽ tự lấy mức "${adsEscape(activeTier.label)}".</p>
        <div class="ads-stock-price-grid">
          <label class="ads-stock-price-card ${activeTier.key === 'low' ? 'active' : ''}">
            <span>Tồn dưới ${DISCOUNT_STOCK_PRICE_LIMITS.low}</span>
            <input id="discountLowStockPriceInput" type="number" min="0" step="1000" value="${stockPriceRules.low || ''}" oninput="refreshDiscountFixedPricePreview()">
            <small>Áp dụng khi hàng gần hết, thường để giữ biên lợi nhuận.</small>
          </label>
          <label class="ads-stock-price-card ${activeTier.key === 'medium' ? 'active' : ''}">
            <span>Tồn từ ${DISCOUNT_STOCK_PRICE_LIMITS.low} đến dưới ${DISCOUNT_STOCK_PRICE_LIMITS.medium}</span>
            <input id="discountMediumStockPriceInput" type="number" min="0" step="1000" value="${stockPriceRules.medium || ''}" oninput="refreshDiscountFixedPricePreview()">
            <small>Áp dụng cho tồn vừa, dùng làm mức giá bán ổn định.</small>
          </label>
          <label class="ads-stock-price-card ${activeTier.key === 'high' ? 'active' : ''}">
            <span>Tồn từ ${DISCOUNT_STOCK_PRICE_LIMITS.medium} trở lên</span>
            <input id="discountHighStockPriceInput" type="number" min="0" step="1000" value="${stockPriceRules.high || ''}" oninput="refreshDiscountFixedPricePreview()">
            <small>Áp dụng khi tồn nhiều, có thể đặt giá xả hàng nhanh hơn.</small>
          </label>
        </div>
        <div id="discountPricePreview" class="ads-fixed-price-preview">${adsEscape(preview.text)}</div>
      </div>
      <div class="ads-optimize-section">
        <div class="ads-step-title"><span>2</span><b>Đối chiếu trước khi áp dụng</b></div>
        <div class="ads-decision-list">
          ${discountHints(row).map(hint => `<p>${adsEscape(hint)}</p>`).join('')}
        </div>
        <p>Lệnh thử chỉ lưu payload để kiểm tra. Nút đẩy thật sẽ hiện hộp xác nhận OK/Cancel rồi gửi update_discount_item với giá đã chọn theo tồn kho hiện tại.</p>
      </div>
      <div id="discountActionResult" class="ads-optimize-result">Chưa tạo lệnh.</div>
      <div class="ads-optimize-actions">
        <button type="button" onclick="runDiscountPriceActionFromModal(false)">Tạo lệnh thử theo tồn kho</button>
        <button type="button" onclick="runDiscountPriceActionFromModal(true)">Đẩy giá lên Shopee</button>
        <button type="button" class="secondary" onclick="runDiscountEndActionFromModal(false)">Preview tắt KM</button>
        <button type="button" class="danger" onclick="runDiscountEndActionFromModal(true)">Tắt KM trên Shopee</button>
      </div>
    `
  }
  modal.hidden = false
  refreshDiscountFixedPricePreview()
}

window.refreshDiscountFixedPricePreview = function() {
  const row = adsState.selectedDiscountRow || {}
  const previewBox = adsEl('discountPricePreview')
  if (!previewBox) return
  const priceRules = discountReadStockPriceRules(row)
  const preview = discountStockRulePreview(row, priceRules)
  previewBox.className = `ads-fixed-price-preview ${preview.warnings.length ? 'warning' : 'ok'}`
  previewBox.innerHTML = `
    <b>${adsEscape(preview.text)}</b>
    ${preview.warnings.length ? `<span>${preview.warnings.map(adsEscape).join(' ')}</span>` : '<span>Đã chọn đúng mức giá theo tồn kho hiện tại.</span>'}
  `
}

window.runDiscountPriceActionFromModal = async function(execute = false) {
  const row = adsState.selectedDiscountRow
  const box = adsEl('discountActionResult')
  if (!row || !box) return
  const priceRules = discountReadStockPriceRules(row)
  const preview = discountStockRulePreview(row, priceRules)
  if (!preview.target) {
    box.textContent = `Chưa tạo lệnh: cần nhập giá KM cho mức ${preview.tier.label}.`
    return
  }
  if (preview.warnings.some(item => item.includes('cao hơn giá gốc'))) {
    box.textContent = `Chưa tạo lệnh: ${preview.warnings.join(' ')}`
    return
  }
  if (execute && Number(row.model_count || 0) > 0 && !row.model_id) {
    box.textContent = 'Chưa áp dụng thật: dòng này đang gộp theo sản phẩm/phân loại, cần kéo chi tiết từng model để tránh sai giá.'
    return
  }
  if (execute) {
    const ok = await adsConfirmAction({
      title: 'Xác nhận đẩy giá khuyến mãi',
      message: 'Lệnh này gọi Shopee Discount API thật và chỉ báo thành công sau khi refetch verify đúng model/SKU.',
      danger: true,
      confirmText: 'Đẩy giá lên Shopee',
      details: [
        { label: 'Shop', value: row.shop || '' },
        { label: 'Sản phẩm', value: row.item_name || row.model_name || row.item_id || '' },
        { label: 'Giá sẽ đẩy', value: adsMoney(preview.target) },
        { label: 'Endpoint', value: '/api/v2/discount/update_discount_item' }
      ]
    })
    if (!ok) {
      box.textContent = 'Đã hủy đẩy giá lên Shopee. Chưa có thay đổi nào được gửi.'
      return
    }
  }
  box.textContent = execute ? 'Đang gửi lệnh thay đổi giá lên Shopee...' : 'Đang tạo lệnh thử...'
  try {
    // Rule tồn kho được gửi kèm request để lưu vết, còn payload gửi Shopee phải giữ đúng schema API.
    const payloadWithRule = discountActionPayload(row, preview.target, {
      mode: 'stock_threshold_price_rule',
      stock: Number(row.stock || 0),
      stock_tier: preview.tier.key,
      stock_tier_label: preview.tier.label,
      stock_thresholds: {
        low_lt: DISCOUNT_STOCK_PRICE_LIMITS.low,
        medium_lt: DISCOUNT_STOCK_PRICE_LIMITS.medium
      },
      stock_price_rules: {
        low_stock_price: priceRules.low,
        medium_stock_price: priceRules.medium,
        high_stock_price: priceRules.high
      },
      selected_rule_price: preview.target
    })
    const payload = discountShopeePayload(payloadWithRule)
    const result = await adsPost('/api/discounts/shopee/action', {
      action: 'update_discount_item',
      shop: row.shop,
      payload,
      client_rule: payloadWithRule._internal_rule,
      execute: Boolean(execute),
      confirm: execute ? DISCOUNT_SHOPEE_APPLY_CONFIRM : ''
    })
    adsSetApiResult(box, result, {
      action: 'update_discount_item',
      title: execute ? 'Kết quả đẩy giá Discount' : 'Preview payload Discount'
    })
  } catch (error) {
    adsSetApiResult(box, { status: 'error', action: 'update_discount_item', object_id: row.discount_id, shop: row.shop, message: error.message }, { title: 'Không tạo được lệnh' })
  }
}

window.runDiscountEndActionFromModal = async function(execute = false) {
  const row = adsState.selectedDiscountRow
  const box = adsEl('discountActionResult')
  if (!row || !box) return
  if (execute) {
    const ok = await adsConfirmAction({
      title: 'Xác nhận kết thúc Discount',
      message: 'Lệnh này gọi end_discount thật trên Shopee, sau đó refetch lại để verify trạng thái.',
      danger: true,
      confirmText: 'Kết thúc trên Shopee',
      details: [
        { label: 'Shop', value: row.shop || '' },
        { label: 'Chương trình', value: row.discount_name || row.discount_id || '' },
        { label: 'Endpoint', value: '/api/v2/discount/end_discount' }
      ]
    })
    if (!ok) {
      box.textContent = 'Đã hủy tắt KM trên Shopee.'
      return
    }
  }
  box.textContent = execute ? 'Đang gửi lệnh kết thúc KM...' : 'Đang tạo lệnh thử kết thúc KM...'
  try {
    const result = await adsPost('/api/discounts/shopee/action', {
      action: 'end_discount',
      shop: row.shop,
      payload: { discount_id: Number(row.discount_id || 0) || row.discount_id },
      execute: Boolean(execute),
      confirm: execute ? DISCOUNT_SHOPEE_APPLY_CONFIRM : ''
    })
    adsSetApiResult(box, result, {
      action: 'end_discount',
      title: execute ? 'Kết quả kết thúc Discount' : 'Kiểm tra payload kết thúc Discount'
    })
  } catch (error) {
    adsSetApiResult(box, { status: 'error', action: 'end_discount', object_id: row.discount_id, shop: row.shop, message: error.message }, { title: 'Không tạo được lệnh' })
  }
}

function discountShopKey(row = {}) {
  return row.shop || row.api_shop_id || ''
}

function discountShopLabel(row = {}) {
  return row.shop || row.api_shop_id || 'Chưa rõ shop'
}

function ensureDiscountFilters() {
  const shopSelect = adsEl('discountShopFilter')
  const stockSelect = adsEl('discountStockFilter')
  const revenueSelect = adsEl('discountRevenueFilter')
  const currentStock = stockSelect?.value || ''
  const currentRevenue = revenueSelect?.value || ''
  if (stockSelect) {
    stockSelect.innerHTML = `
      <option value="">Tất cả tồn kho</option>
      <option value="low">Sắp hết hàng</option>
      <option value="high">Tồn nhiều</option>
      <option value="zero">Tồn bằng 0</option>
    `
    stockSelect.value = currentStock
  }
  if (revenueSelect) {
    revenueSelect.innerHTML = `
      <option value="">Tất cả doanh thu</option>
      <option value="has_revenue">Có doanh thu</option>
      <option value="no_revenue">Chưa có doanh thu</option>
      <option value="high_revenue">Doanh thu cao</option>
    `
    revenueSelect.value = currentRevenue
  }
  if (shopSelect) shopSelect.setAttribute('aria-label', 'Lọc shop Discount')
  if (stockSelect) stockSelect.setAttribute('aria-label', 'Lọc tồn kho')
  if (revenueSelect) revenueSelect.setAttribute('aria-label', 'Lọc doanh thu')
  if (revenueSelect && !adsEl('discountEffectFilter')) {
    revenueSelect.insertAdjacentHTML('afterend', `
      <select id="discountEffectFilter" class="ads-discount-mini-filter" onchange="onDiscountFilterChanged()" aria-label="Lọc hiệu quả">
        <option value="">Tất cả hiệu quả</option>
        <option value="effective">Đang hiệu quả</option>
        <option value="needs_action">Cần xử lý</option>
        <option value="poor">Kém hiệu quả</option>
        <option value="no_click">Chưa có click ADS</option>
      </select>
      <select id="discountStatusFilter" class="ads-discount-mini-filter" onchange="onDiscountFilterChanged()" aria-label="Lọc trạng thái chương trình">
        <option value="">Tất cả trạng thái</option>
        <option value="ongoing">Đang chạy</option>
        <option value="upcoming">Sắp chạy</option>
        <option value="expired">Đã kết thúc</option>
      </select>
    `)
  }
}

function discountSummaryFromRows(rows = [], thresholds = {}) {
  const lowStock = Number(thresholds.lowStock || 10)
  const highStock = Number(thresholds.highStock || 100)
  return rows.reduce((acc, row) => {
    acc.items += 1
    acc.ads_spend += Number(row.ads_spend || 0)
    acc.ads_clicks += Number(row.ads_clicks || 0)
    acc.orders += Number(row.orders || 0)
    acc.revenue += Number(row.revenue || 0)
    if (row.recommendation === 'reduce_or_end_discount') acc.reduce_or_end += 1
    if (row.recommendation === 'increase_discount_review') acc.increase_review += 1
    if (row.recommendation === 'protect_price_floor') acc.protect_floor += 1
    if (Number(row.stock || 0) <= lowStock) acc.low_stock += 1
    if (Number(row.stock || 0) >= highStock) acc.high_stock += 1
    return acc
  }, {
    items: 0,
    ads_spend: 0,
    ads_clicks: 0,
    orders: 0,
    revenue: 0,
    reduce_or_end: 0,
    increase_review: 0,
    protect_floor: 0,
    low_stock: 0,
    high_stock: 0
  })
}

function syncDiscountShopFilter(rows = []) {
  const select = adsEl('discountShopFilter')
  if (!select) return ''
  const shops = new Map()
  rows.forEach(row => {
    const key = discountShopKey(row)
    if (!key) return
    const label = discountShopLabel(row)
    const count = (shops.get(key)?.count || 0) + 1
    shops.set(key, { key, label, count })
  })
  const current = adsState.discountShopFilter || select.value || ''
  const options = Array.from(shops.values()).sort((a, b) => a.label.localeCompare(b.label, 'vi'))
  select.innerHTML = `
    <option value="">Tất cả shop Discount (${rows.length.toLocaleString('vi-VN')} dòng)</option>
    ${options.map(shop => `<option value="${adsEscape(shop.key)}">${adsEscape(shop.label)} · ${shop.count.toLocaleString('vi-VN')} dòng</option>`).join('')}
  `
  select.disabled = options.length === 0
  select.value = shops.has(current) ? current : ''
  adsState.discountShopFilter = select.value
  return select.value
}

window.onDiscountShopFilterChanged = function() {
  adsState.discountShopFilter = adsEl('discountShopFilter')?.value || ''
  renderDiscountAnalysis()
}

function discountFilterRows(rows = [], thresholds = {}) {
  const stockFilter = String(adsEl('discountStockFilter')?.value || '')
  const revenueFilter = String(adsEl('discountRevenueFilter')?.value || '')
  const effectFilter = String(adsEl('discountEffectFilter')?.value || '')
  const statusFilter = String(adsEl('discountStatusFilter')?.value || '').toLowerCase()
  const lowStock = Number(thresholds.lowStock || 10)
  const highStock = Number(thresholds.highStock || 100)
  return rows.filter(row => {
    const stock = Number(row.stock || 0)
    const revenue = Number(row.revenue || 0)
    const clicks = Number(row.ads_clicks || 0)
    const roas = Number(row.roas_after_discount || 0)
    const recommendation = String(row.recommendation || '')
    const status = String(row.status || '').toLowerCase()
    if (stockFilter === 'low' && stock > lowStock) return false
    if (stockFilter === 'high' && stock < highStock) return false
    if (stockFilter === 'zero' && stock > 0) return false
    if (revenueFilter === 'has_revenue' && revenue <= 0) return false
    if (revenueFilter === 'no_revenue' && revenue > 0) return false
    if (revenueFilter === 'high_revenue' && revenue < 1000000) return false
    if (effectFilter === 'effective' && !(roas >= 3 && revenue > 0)) return false
    if (effectFilter === 'needs_action' && !['reduce_or_end_discount', 'protect_price_floor', 'check_price_listing_or_ads_target'].includes(recommendation)) return false
    if (effectFilter === 'poor' && !(clicks > 0 && (roas < 1 || revenue <= 0))) return false
    if (effectFilter === 'no_click' && clicks > 0) return false
    if (statusFilter && !status.includes(statusFilter)) return false
    return true
  })
}

window.onDiscountFilterChanged = function() {
  adsState.discountShopFilter = adsEl('discountShopFilter')?.value || ''
  renderDiscountAnalysis()
}

function renderDiscountAnalysis() {
  ensureDiscountFilters()
  const box = adsEl('discountAnalysisBox')
  const summaryEl = adsEl('discountSummary')
  if (!box) return
  const data = adsState.discounts
  if (!data) {
    if (summaryEl) summaryEl.textContent = 'Chưa phân tích'
    adsState.renderedDiscountRows = []
    box.innerHTML = '<div class="ads-empty">Bấm phân tích để đối soát chương trình giảm giá với ADS, tồn kho và đơn hàng.</div>'
    return
  }
  if (data.error) {
    if (summaryEl) summaryEl.textContent = 'Lỗi phân tích'
    adsState.renderedDiscountRows = []
    box.innerHTML = `<div class="ads-error">Không phân tích được Discount: ${adsEscape(data.error)}</div>`
    return
  }

  const rows = Array.isArray(data.rows) ? data.rows : []
  const thresholds = data.thresholds || {}
  const selectedShop = syncDiscountShopFilter(rows)
  const shopRows = selectedShop ? rows.filter(row => discountShopKey(row) === selectedShop) : rows
  const filteredRows = discountFilterRows(shopRows, thresholds)
  const summary = discountSummaryFromRows(filteredRows, thresholds)
  const loadedCount = rows.length.toLocaleString('vi-VN')
  const filterLabel = selectedShop ? ` · shop ${discountShopLabel(shopRows[0] || { shop: selectedShop })}` : ''
  if (summaryEl) {
    summaryEl.textContent = `${Number(summary.items || 0).toLocaleString('vi-VN')}/${loadedCount} dòng KM${filterLabel} · ${Number(summary.reduce_or_end || 0).toLocaleString('vi-VN')} cần giảm/dừng`
  }
  const cacheNotice = adsAnalysisCacheNotice(data, 'Discount đang phân tích từ cache marketplace_discounts/marketplace_discount_items; nút cập nhật cache mới gọi Shopee API.')
  const kpis = `
    <div class="ads-discount-kpis">
      <div><span>Sản phẩm KM</span><b>${Number(summary.items || 0).toLocaleString('vi-VN')}</b></div>
      <div><span>Chi ADS khớp KM</span><b>${adsMoney(summary.ads_spend)}</b></div>
      <div><span>Doanh thu khớp KM</span><b>${adsMoney(summary.revenue)}</b></div>
      <div><span>Sắp hết hàng</span><b>${Number(summary.low_stock || 0).toLocaleString('vi-VN')}</b></div>
      <div><span>Tồn nhiều</span><b>${Number(summary.high_stock || 0).toLocaleString('vi-VN')}</b></div>
    </div>
  `
  if (!rows.length) {
    adsState.renderedDiscountRows = []
    box.innerHTML = `
      ${cacheNotice}
      ${kpis}
      <div class="ads-empty">Chưa có chương trình giảm giá Shopee đang chạy trong cache của bộ lọc này. Bấm "Đồng bộ Discount từ Shopee API" để kéo dữ liệu read-only mới.</div>
    `
    return
  }
  if (!filteredRows.length) {
    adsState.renderedDiscountRows = []
    box.innerHTML = `
      ${cacheNotice}
      ${kpis}
      <div class="ads-empty">Shop đang lọc chưa có dòng Discount trong cache đã tải. Chọn shop khác hoặc bấm "Đồng bộ Discount từ Shopee API" để kéo dữ liệu read-only mới nhất.</div>
    `
    return
  }
  const visibleRows = filteredRows
  adsState.renderedDiscountRows = visibleRows
  box.innerHTML = `
    ${cacheNotice}
    ${kpis}
    <div class="ads-discount-note">
      Đã đọc ${loadedCount} dòng KM từ cache. Đang hiển thị ${visibleRows.length.toLocaleString('vi-VN')} dòng${filterLabel}. Bộ lọc đang xét shop, tồn kho và doanh thu. Ngưỡng đang dùng: tồn thấp ≤ ${Number(thresholds.lowStock || 10).toLocaleString('vi-VN')}, tồn nhiều ≥ ${Number(thresholds.highStock || 100).toLocaleString('vi-VN')}, giảm tối đa ${adsPct(thresholds.maxDiscountPercent || 30)}.
    </div>
    ${renderDiscountCards(visibleRows)}
    <div class="ads-product-table-wrap ads-analysis-table-wrap">
      <table class="ads-product-table ads-discount-table">
        <thead>
          <tr>
            <th>Sản phẩm</th>
            <th>Shop</th>
            <th>Chương trình</th>
            <th>Giá KM</th>
            <th>Tồn kho</th>
            <th>ADS</th>
            <th>Đơn</th>
            <th>Gợi ý / thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map((row, index) => `
            <tr>
              <td>
                <b>${adsEscape(row.item_name || row.model_name || row.item_id || '')}</b>
                <span>${adsEscape(row.model_name || row.sku || row.item_id || '')}</span>
                <span class="ads-shop-inline-pill">Shop: ${adsEscape(discountShopLabel(row))}</span>
              </td>
              <td class="ads-discount-shop-cell">
                <b>${adsEscape(discountShopLabel(row))}</b>
                <span>${adsEscape(row.api_shop_id || '')}</span>
              </td>
              <td>
                <b>${adsEscape(row.discount_name || row.discount_id || '')}</b>
                <span>${adsEscape(row.status || 'ongoing')} · ${adsTime(row.start_time)} - ${adsTime(row.end_time)}</span>
              </td>
              <td>
                <b>${adsMoney(row.promotion_price)}</b>
                <span>Gốc ${adsMoney(row.original_price)} · Giảm ${adsPct(row.discount_percent)}</span>
              </td>
              <td>
                <b>${Number(row.stock || 0).toLocaleString('vi-VN')}</b>
                <span>API KM ${Number(row.promotion_stock_api || 0).toLocaleString('vi-VN')} · biên ${adsMoney(row.margin_after_discount)}</span>
              </td>
              <td>
                <b>${adsMoney(row.ads_spend)}</b>
                <span>${Number(row.ads_clicks || 0).toLocaleString('vi-VN')} click · ${Number(row.ads_campaigns || 0).toLocaleString('vi-VN')} campaign</span>
              </td>
              <td>
                <b>${Number(row.orders || 0).toLocaleString('vi-VN')} đơn</b>
                <span>${adsMoney(row.revenue)} · ROAS ${Number(row.roas_after_discount || 0).toFixed(2)}</span>
              </td>
              <td class="ads-status-actions">
                <span class="ads-pill ${discountRecommendationClass(row.recommendation)}">${adsEscape(discountRecommendationText(row.recommendation))}</span>
                ${discountActionButtons(row, index)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

window.loadDiscountAnalysis = async function(options = {}) {
  const box = adsEl('discountAnalysisBox')
  const sync = options.sync === true
  if (box && !options.silent) box.innerHTML = '<div class="ads-empty">Đang phân tích Discount từ cache nội bộ...</div>'
  try {
    const shops = discountShopeeShopNames()
    const shop = shops.length === 1 ? shops[0] : undefined
    // Phân tích mặc định chỉ đọc cache một request cho toàn bộ shop; nút cập nhật cache mới gọi API sàn.
    adsState.discounts = await adsFetch(`/api/discounts/shopee/analysis?${discountQuery(sync, { shop, limit: shop ? 800 : 2500 })}`)
  } catch (error) {
    adsState.discounts = { error: error.message }
  }
  renderDiscountAnalysis()
}

window.syncDiscountsAndAnalyze = async function() {
  const box = adsEl('discountAnalysisBox')
  if (box) box.innerHTML = '<div class="ads-empty">Đang cập nhật cache Discount bằng dữ liệu thay đổi từ Shopee API...</div>'
  try {
    const discountShop = adsEl('discountShopFilter')?.value || ''
    await adsPost('/api/discounts/shopee/sync', {
      // Nếu người dùng đang lọc shop ở khối Discount thì ưu tiên đồng bộ đúng shop đó.
      shop: discountShop || adsEl('adsShop')?.value || '',
      discount_status: 'ongoing',
      include_detail: 1,
      incremental: true,
      shop_limit: 100,
      detail_limit: 200
    })
  } catch (error) {
    adsState.discounts = { error: error.message }
    renderDiscountAnalysis()
    return
  }
  await loadDiscountAnalysis()
}
