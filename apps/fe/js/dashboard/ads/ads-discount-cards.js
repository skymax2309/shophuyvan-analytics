function discountQuery(sync = false, overrides = {}) {
  const qs = new URLSearchParams()
  const from = adsEl('filterFrom')?.value || ''
  const to = adsEl('filterTo')?.value || ''
  const shop = overrides.shop !== undefined ? overrides.shop : (adsEl('adsShop')?.value || '')
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (shop) qs.set('shop', shop)
  qs.set('status', 'ongoing')
  qs.set('limit', String(overrides.limit || (shop ? 800 : 2500)))
  qs.set('low_stock', '10')
  qs.set('high_stock', '100')
  qs.set('max_discount_percent', '30')
  if (sync) qs.set('sync', '1')
  return qs.toString()
}

function discountShopeeShopNames() {
  const selectedShop = adsEl('adsShop')?.value || ''
  if (selectedShop) return [selectedShop]
  const rows = [...(adsState.apiShops || []), ...(adsState.data?.api_shops || [])]
  const seen = new Set()
  const shops = []
  rows.forEach(shop => {
    const platform = String(shop.platform || '').toLowerCase()
    if (platform && platform !== 'shopee') return
    const name = adsShopName(shop)
    if (!name || seen.has(name)) return
    seen.add(name)
    shops.push(name)
  })
  return shops.slice(0, 30)
}

function mergeDiscountAnalysisResults(results = []) {
  const okRows = results.filter(item => item && !item.error && Array.isArray(item.rows))
  const errorRows = results.filter(item => item?.error)
  if (!okRows.length) {
    return { error: errorRows.map(item => `${item.shop || 'shop'}: ${item.error}`).join('; ') || 'Không tải được Discount theo shop.' }
  }
  const first = okRows[0]
  const rows = okRows.flatMap(item => item.rows || [])
  const thresholds = first.thresholds || {}
  return {
    ...first,
    filters: { ...(first.filters || {}), shop: '' },
    summary: discountSummaryFromRows(rows, thresholds),
    discount_items: okRows.reduce((sum, item) => sum + Number(item.discount_items || item.rows?.length || 0), 0),
    analysis_items: rows.length,
    rows,
    shop_results: okRows.map(item => ({
      shop: item.filters?.shop || item.rows?.[0]?.shop || '',
      rows: item.rows?.length || 0,
      discount_items: item.discount_items || 0
    })),
    shop_errors: errorRows
  }
}

function discountRecommendationText(code) {
  const labels = {
    reduce_or_end_discount: 'Giảm hoặc kết thúc KM',
    increase_discount_review: 'Có thể tăng giảm giá',
    protect_price_floor: 'Giữ giá sàn',
    check_price_listing_or_ads_target: 'Kiểm tra Ads/giá',
    do_not_increase_discount: 'Không tăng giảm giá',
    monitor: 'Theo dõi'
  }
  return labels[code] || code || 'Theo dõi'
}

function discountRecommendationClass(code) {
  if (code === 'reduce_or_end_discount' || code === 'protect_price_floor' || code === 'check_price_listing_or_ads_target') return 'danger'
  if (code === 'increase_discount_review') return 'watch'
  if (code === 'do_not_increase_discount') return 'neutral'
  return 'good'
}

function discountHints(row = {}) {
  const hints = []
  const stock = Number(row.stock || 0)
  const orders = Number(row.orders || 0)
  const adsSpend = Number(row.ads_spend || 0)
  const roas = Number(row.roas_after_discount || 0)
  if (row.recommendation === 'reduce_or_end_discount') {
    hints.push('Tồn kho thấp: giảm mức khuyến mãi hoặc kết thúc KM để giữ biên lợi nhuận cho các sản phẩm cuối.')
  }
  if (row.recommendation === 'increase_discount_review') {
    hints.push('Tồn kho nhiều và đang có click ADS: có thể thử tăng giảm giá trong giới hạn, nhưng phải giữ giá sàn để không bán lỗ.')
  }
  if (row.recommendation === 'protect_price_floor') {
    hints.push('Biên sau KM thấp: không tăng giảm giá. Cần kiểm tra giá vốn trước khi chạy thêm ADS.')
  }
  if (row.recommendation === 'check_price_listing_or_ads_target') {
    hints.push('Có chi ADS nhưng chưa ra đơn: kiểm tra ảnh, tiêu đề, giá so với đối thủ và đối tượng/từ khóa ADS trước khi giảm giá sâu hơn.')
  }
  if (row.recommendation === 'do_not_increase_discount') {
    hints.push('Mức giảm đã cao: không nên tăng thêm vì dễ làm méo lợi nhuận và rủi ro giảm giá quá sâu.')
  }
  if (!hints.length) hints.push('Theo dõi thêm tồn kho, click ADS, đơn hàng và ROAS trước khi chỉnh giá.')
  if (stock <= 0) hints.push('Tồn kho đang bằng 0: ưu tiên dừng KM hoặc loại khỏi chương trình để tránh bán vượt tồn.')
  if (adsSpend > 0 && orders === 0) hints.push('Chi ADS phát sinh nhưng chưa có đơn: không tự động giảm giá nếu chưa kiểm tra listing.')
  if (roas > 0 && roas < 3) hints.push('ROAS thấp: chỉ tăng giảm giá nếu biên lợi nhuận còn đủ sau phí sàn, ADS và giá vốn.')
  return hints
}

function discountActionButtons(row = {}, index = 0) {
  const cls = discountRecommendationClass(row.recommendation)
  return `
    <div class="ads-row-actions">
      <button type="button" class="ads-action-btn ${cls}" onclick="openDiscountOptimizeModal(${index})">Tùy chỉnh / đẩy giá</button>
    </div>
  `
}

function renderDiscountCards(rows = []) {
  return `
    <div class="ads-analysis-card-list ads-discount-card-list">
      ${rows.map((row, index) => `
        <article class="ads-analysis-card ${discountRecommendationClass(row.recommendation)}">
          <div class="ads-analysis-card-head">
            <div>
              <b>${adsEscape(row.item_name || row.model_name || row.item_id || '')}</b>
              <span>${adsEscape(discountShopLabel(row))} · ${adsEscape(row.model_name || row.sku || row.item_id || '')}</span>
            </div>
            <span class="ads-pill ${discountRecommendationClass(row.recommendation)}">${adsEscape(discountRecommendationText(row.recommendation))}</span>
          </div>
          <div class="ads-analysis-card-sub">
            <b>${adsEscape(row.discount_name || row.discount_id || '')}</b>
            <span>${adsEscape(row.status || 'ongoing')} · ${adsTime(row.start_time)} - ${adsTime(row.end_time)}</span>
          </div>
          <div class="ads-analysis-metrics">
            <div><span>Giá KM</span><b>${adsMoney(row.promotion_price)}</b><small>Gốc ${adsMoney(row.original_price)} · ${adsPct(row.discount_percent)}</small></div>
            <div><span>Tồn</span><b>${Number(row.stock || 0).toLocaleString('vi-VN')}</b><small>Biên ${adsMoney(row.margin_after_discount)}</small></div>
            <div><span>ADS</span><b>${adsMoney(row.ads_spend)}</b><small>${Number(row.ads_clicks || 0).toLocaleString('vi-VN')} click</small></div>
            <div><span>Đơn</span><b>${Number(row.orders || 0).toLocaleString('vi-VN')}</b><small>${adsMoney(row.revenue)} · ROAS ${Number(row.roas_after_discount || 0).toFixed(2)}</small></div>
          </div>
          <div class="ads-analysis-card-foot">
            <span>API KM ${Number(row.promotion_stock_api || 0).toLocaleString('vi-VN')} · ${Number(row.ads_campaigns || 0).toLocaleString('vi-VN')} campaign</span>
            ${discountActionButtons(row, index)}
          </div>
        </article>
      `).join('')}
    </div>
  `
}

function discountNumberInput(id, fallback = 0) {
  const value = Number(adsEl(id)?.value || fallback || 0)
  return Number.isFinite(value) ? value : Number(fallback || 0)
}

function discountPriceToPercent(originalPrice, targetPrice) {
  const original = Number(originalPrice || 0)
  const target = Number(targetPrice || 0)
  if (!original || !target) return 0
  return Math.max(0, Math.min(95, ((original - target) / original) * 100))
}

function discountRoundMoney(value, fallback = 0) {
  const number = Number(value || fallback || 0)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0
}

const DISCOUNT_SHOPEE_APPLY_CONFIRM = 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_SHOPEE'

const PROMOTION_QUEUE_EXECUTE_CONFIRM = 'APPLY_PROMOTION_QUEUE'

const DISCOUNT_STOCK_PRICE_LIMITS = { low: 10, medium: 100 }

function discountFixedPricePreview(row = {}, targetPrice = 0, floorPrice = 0) {
  const original = Number(row.original_price || 0)
  const current = Number(row.promotion_price || 0)
  const target = discountRoundMoney(targetPrice, current)
  const percent = discountPriceToPercent(original, target)
  const floor = discountRoundMoney(floorPrice)
  const warnings = []
  if (!target) warnings.push('Chưa nhập giá KM cố định.')
  if (floor && target && target < floor) warnings.push(`Giá đang thấp hơn giá sàn ${adsMoney(floor)}.`)
  if (original && target > original) warnings.push('Giá KM không được cao hơn giá gốc.')
  if (current && target === current) warnings.push('Giá đang bằng giá KM hiện tại, lệnh gửi lên sẽ không thay đổi giá.')
  return {
    target,
    percent,
    warnings,
    text: target
      ? `Sẽ đặt giá KM cố định ${adsMoney(target)}. Mức giảm tương ứng ${percent.toFixed(1)}% so với giá gốc.`
      : 'Nhập số tiền muốn đặt làm giá khuyến mại.'
  }
}

function discountDefaultStockPriceRules(row = {}) {
  const current = discountRoundMoney(row.promotion_price || row.original_price || 0)
  return { low: current, medium: current, high: current }
}

function discountReadStockPriceRules(row = {}) {
  const defaults = discountDefaultStockPriceRules(row)
  return {
    low: discountRoundMoney(discountNumberInput('discountLowStockPriceInput', defaults.low), defaults.low),
    medium: discountRoundMoney(discountNumberInput('discountMediumStockPriceInput', defaults.medium), defaults.medium),
    high: discountRoundMoney(discountNumberInput('discountHighStockPriceInput', defaults.high), defaults.high)
  }
}

function discountStockTier(row = {}, priceRules = {}) {
  const stock = Number(row.stock || 0)
  if (stock < DISCOUNT_STOCK_PRICE_LIMITS.low) {
    return { key: 'low', label: `Tồn dưới ${DISCOUNT_STOCK_PRICE_LIMITS.low}`, price: Number(priceRules.low || 0) }
  }
  if (stock < DISCOUNT_STOCK_PRICE_LIMITS.medium) {
    return { key: 'medium', label: `Tồn từ ${DISCOUNT_STOCK_PRICE_LIMITS.low} đến dưới ${DISCOUNT_STOCK_PRICE_LIMITS.medium}`, price: Number(priceRules.medium || 0) }
  }
  return { key: 'high', label: `Tồn từ ${DISCOUNT_STOCK_PRICE_LIMITS.medium} trở lên`, price: Number(priceRules.high || 0) }
}

function discountStockRulePreview(row = {}, priceRules = {}) {
  const tier = discountStockTier(row, priceRules)
  const preview = discountFixedPricePreview(row, tier.price, 0)
  const stock = Number(row.stock || 0).toLocaleString('vi-VN')
  return {
    ...preview,
    tier,
    text: preview.target
      ? `Tồn hiện tại ${stock} thuộc mức "${tier.label}", sẽ đặt giá KM ${adsMoney(preview.target)}. Mức giảm tương ứng ${preview.percent.toFixed(1)}% so với giá gốc.`
      : `Nhập giá KM cho mức "${tier.label}" để tạo lệnh.`
  }
}

function discountShopeePayload(payload = {}) {
  const cleanPayload = { ...payload }
  // Chỉ gửi các field Shopee hỗ trợ; rule tồn kho được gửi riêng để hệ thống lưu vết.
  delete cleanPayload._internal_rule
  return cleanPayload
}

function discountActionPayload(row = {}, targetPrice = 0, internalRule = {}) {
  const item = {
    item_id: Number(row.item_id || 0) || row.item_id,
    item_promotion_price: Number(targetPrice || 0),
    promotion_price: Number(targetPrice || 0)
  }
  if (row.model_id) {
    item.model_list = [{
      model_id: Number(row.model_id || 0) || row.model_id,
      model_promotion_price: Number(targetPrice || 0),
      promotion_price: Number(targetPrice || 0)
    }]
  }
  return {
    discount_id: Number(row.discount_id || 0) || row.discount_id,
    item_list: [item],
    _internal_rule: {
      // Giá KM được lưu theo số tiền cố định để tránh nhầm lẫn khi thao tác với phần trăm.
      mode: 'fixed_discount_price_rule',
      item_name: row.item_name || '',
      sku: row.sku || '',
      current_promotion_price: Number(row.promotion_price || 0),
      target_promotion_price: Number(targetPrice || 0),
      equivalent_discount_percent: discountPriceToPercent(row.original_price, targetPrice),
      ...internalRule
    }
  }
}
