function promotionModuleLabel(module = '') {
  const key = String(module || '').toLowerCase()
  return {
    discount: 'Giảm giá của Shop',
    voucher: 'Mã giảm giá của shop',
    bundle_deal: 'Mua kèm deal',
    add_on_deal: 'Mua thêm deal',
    shop_flash_sale: 'Flash Sale của Shop',
    free_shipping: 'Miễn phí vận chuyển',
    flexicombo: 'Combo linh hoạt',
    early_bird: 'Giá đặt sớm'
  }[key] || module || 'Module'
}

function promotionSummaryKpi(label, value, note = '') {
  return `<div><span>${adsEscape(label)}</span><b>${Number(value || 0).toLocaleString('vi-VN')}</b><span>${adsEscape(note)}</span></div>`
}

function promotionModuleCards(summary = {}) {
  const rows = [
    ...(summary.shopee_programs?.by_module || []),
    ...(summary.lazada_programs?.by_module || [])
  ]
  if (!rows.length) return '<div class="ads-empty">Chưa có cache chương trình Bundle/Add-On/Flash/Freeship/Flexicombo.</div>'
  return `
    <div class="ads-promotion-module-grid">
      ${rows.map(row => `
        <div class="ads-promotion-module-card">
          <span>${adsPlatformLabel(row.platform)} · ${adsEscape(promotionModuleLabel(row.module))}</span>
          <b>${Number(row.total_programs || 0).toLocaleString('vi-VN')}</b>
          <span>${Number(row.active_programs || 0).toLocaleString('vi-VN')} đang hiệu lực · cập nhật ${adsEscape(row.latest_synced_at || 'chưa rõ')}</span>
        </div>
      `).join('')}
    </div>
  `
}

function renderPromotionRiskRows(rows = []) {
  if (!rows.length) return '<div class="ads-empty">Chưa có SKU vừa có khuyến mãi/giá giảm vừa có dữ liệu ADS trong cache hiện tại.</div>'
  return `
    <div class="ads-promotion-risk-list">
      ${rows.slice(0, 12).map(row => `
        <div class="ads-promotion-risk">
          <div>
            <b>${adsEscape(row.product_name || row.platform_sku || row.internal_sku || 'SKU chưa rõ')}</b>
            <span>${adsPlatformLabel(row.platform)} · ${adsEscape(row.shop || '')} · ${adsEscape(row.platform_sku || row.internal_sku || '')}</span>
          </div>
          <div><span>Giá giảm</span><b>${adsMoney(row.discount_price)}</b><span>Giá gốc ${adsMoney(row.price)}</span></div>
          <div><span>Tồn</span><b>${Number(row.stock || 0).toLocaleString('vi-VN')}</b><span>Ưu tiên kiểm nếu tồn thấp</span></div>
          <div><span>ADS</span><b>${adsMoney(row.ads_spend)}</b><span>${Number(row.ads_campaigns || 0) > 0 ? `${Number(row.ads_campaigns || 0).toLocaleString('vi-VN')} campaign khớp SKU` : 'Chưa khớp SKU ADS'}</span></div>
        </div>
      `).join('')}
    </div>
  `
}

function setPromotionUpdateStatus(html, tone = 'empty') {
  const box = adsEl('promotionUpdateStatus')
  if (!box) return
  const className = tone === 'error' ? 'ads-error' : tone === 'ok' ? 'ads-promotion-preview-card' : 'ads-empty'
  box.innerHTML = `<div class="${className}">${html}</div>`
}

const PROMOTION_FEATURE_CATALOG = [
  {
    key: 'shopee_discount',
    label: 'Shopee Discount',
    shortLabel: 'Discount',
    platform: 'shopee',
    kind: 'discount',
    module: 'discount',
    coverageModule: 'Discount',
    status: 'ongoing',
    description: 'Giảm giá trực tiếp theo sản phẩm/SKU, dùng để chỉnh giá KM theo tồn kho và hiệu quả ADS.',
    readStatus: 'Đọc cache Discount, phân tích ADS/tồn và mở danh sách SKU.',
    writeStatus: 'Đã mở đẩy giá thật qua update_discount_item sau hộp xác nhận OK.',
    writeTone: 'write-open',
    primaryAction: 'discount',
    secondaryAction: 'queue'
  },
  {
    key: 'shopee_voucher',
    label: 'Shopee Voucher',
    shortLabel: 'Voucher',
    platform: 'shopee',
    kind: 'vouchers',
    module: '',
    coverageModule: 'Voucher',
    status: 'all',
    description: 'Mã giảm giá của shop hoặc sản phẩm, dùng để xem voucher nào đang gắn SKU và mức dùng.',
    readStatus: 'Đã mở cập nhật danh sách, chi tiết và sản phẩm gắn voucher.',
    writeStatus: 'Khóa tạo/sửa/kết thúc voucher thật.',
    writeTone: 'write-locked',
    syncable: true,
    browsable: true
  },
  {
    key: 'shopee_bundle',
    label: 'Shopee Bundle',
    shortLabel: 'Bundle',
    platform: 'shopee',
    kind: 'programs',
    module: 'bundle_deal',
    coverageModule: 'Bundle Deal',
    status: 'all',
    description: 'Chương trình mua kèm/combo, dùng để kiểm sản phẩm đang bị ghép giá hoặc khuyến mãi kèm.',
    readStatus: 'Đã mở cập nhật chương trình, chi tiết và item trong bundle.',
    writeStatus: 'Khóa ghi thật; mới preview giá/tồn và đưa vào hàng đợi.',
    writeTone: 'write-locked',
    syncable: true,
    browsable: true,
    previewable: true
  },
  {
    key: 'shopee_add_on',
    label: 'Shopee Add-On',
    shortLabel: 'Add-On',
    platform: 'shopee',
    kind: 'programs',
    module: 'add_on_deal',
    coverageModule: 'Add-On Deal',
    status: 'all',
    description: 'Mua thêm deal, gồm main item và sub item; dùng để kiểm sản phẩm phụ đang chạy giá ưu đãi.',
    readStatus: 'Đã mở cập nhật chương trình, main item và sub item.',
    writeStatus: 'Khóa ghi thật vì cần adapter phân biệt main/sub item.',
    writeTone: 'write-locked',
    syncable: true,
    browsable: true,
    previewable: true
  },
  {
    key: 'shopee_flash_sale',
    label: 'Shopee Flash Sale',
    shortLabel: 'Flash Sale',
    platform: 'shopee',
    kind: 'programs',
    module: 'shop_flash_sale',
    coverageModule: 'ShopFlashSale',
    status: 'all',
    description: 'Sale theo khung giờ của shop, dùng để kiểm giá/tồn SKU đang chạy flash sale.',
    readStatus: 'Đã mở cập nhật danh sách, chi tiết và item flash sale.',
    writeStatus: 'Khóa tạo/sửa/xóa flash sale thật; chỉ preview và kiểm rủi ro.',
    writeTone: 'write-locked',
    syncable: true,
    browsable: true,
    previewable: true
  },
  {
    key: 'lazada_voucher',
    label: 'Lazada Voucher',
    shortLabel: 'Voucher',
    platform: 'lazada',
    kind: 'vouchers',
    module: '',
    coverageModule: 'Seller Voucher API',
    status: 'all',
    description: 'Voucher Lazada của shop, dùng để đối soát sản phẩm áp dụng và trạng thái mã.',
    readStatus: 'Đã mở cập nhật voucher, chi tiết và sản phẩm áp dụng.',
    writeStatus: 'Khóa tạo/sửa/kích hoạt/tắt voucher thật.',
    writeTone: 'write-locked',
    syncable: true,
    browsable: true
  },
  {
    key: 'lazada_freeship',
    label: 'Lazada Freeship',
    shortLabel: 'Freeship',
    platform: 'lazada',
    kind: 'programs',
    module: 'free_shipping',
    coverageModule: 'Free Shipping API',
    status: 'all',
    description: 'Chương trình miễn phí vận chuyển, dùng để xem sản phẩm/vùng đang được gắn freeship.',
    readStatus: 'Đã mở cập nhật chương trình và sản phẩm gắn freeship.',
    writeStatus: 'Khóa tạo/sửa/kích hoạt/tắt freeship thật.',
    writeTone: 'write-locked',
    syncable: true,
    browsable: true,
    previewable: true
  },
  {
    key: 'lazada_flexicombo',
    label: 'Lazada Flexicombo',
    shortLabel: 'Flexicombo',
    platform: 'lazada',
    kind: 'programs',
    module: 'flexicombo',
    coverageModule: 'Flexicombo API',
    status: 'all',
    description: 'Combo linh hoạt của Lazada, dùng để kiểm sản phẩm trong combo và điều kiện giảm giá.',
    readStatus: 'Đã mở cập nhật danh sách, chi tiết và sản phẩm combo.',
    writeStatus: 'Khóa tạo/sửa/kích hoạt/tắt combo thật.',
    writeTone: 'write-locked',
    syncable: true,
    browsable: true,
    previewable: true
  },
  {
    key: 'lazada_early_bird',
    label: 'Lazada Early Bird',
    shortLabel: 'Early Bird',
    platform: 'lazada',
    kind: 'write_only',
    module: 'early_bird',
    coverageModule: 'Early Bird Price API',
    status: 'all',
    description: 'Giá đặt sớm của Lazada, là endpoint ghi giá thật nên không có luồng sync read-only riêng.',
    readStatus: 'Chỉ hiển thị trạng thái endpoint trong core.',
    writeStatus: 'Preview-only; chưa mở apply thật.',
    writeTone: 'preview-only',
    lockedOnly: true
  }
]

const PROMOTION_QUICK_FEATURES = Object.fromEntries(
  PROMOTION_FEATURE_CATALOG
    .filter(feature => feature.syncable)
    .map(feature => [feature.key, feature])
)

function setPromotionSelectValue(id, value) {
  const select = adsEl(id)
  if (!select) return
  select.value = value
}

function applyPromotionQuickFeature(feature) {
  setPromotionSelectValue('promotionListKind', feature.kind)
  setPromotionSelectValue('promotionPlatformFilter', feature.platform)
  setPromotionSelectValue('promotionModuleFilter', feature.module)
  setPromotionSelectValue('promotionStatusFilter', feature.status)
}

function promotionFeatureCoverage(feature = {}) {
  const coverage = Array.isArray(adsState.promotionCore?.endpoint_coverage)
    ? adsState.promotionCore.endpoint_coverage
    : []
  return coverage.find(row => String(row.platform || '').toLowerCase() === feature.platform
    && String(row.module || '').toLowerCase() === String(feature.coverageModule || '').toLowerCase()) || {}
}

function promotionFeatureTags(feature = {}, coverage = {}) {
  const writeBadge = feature.writeBadge
    || (feature.writeTone === 'write-open' ? 'Ghi thật: đã mở' : feature.writeTone === 'preview-only' ? 'Preview-only' : 'Ghi thật: khóa')
  const tags = [
    { text: adsPlatformLabel(feature.platform), cls: 'read-only' },
    { text: coverage.core_status || 'đã nối UI', cls: 'read-only' },
    { text: writeBadge, cls: feature.writeTone || 'write-locked' }
  ]
  return tags.map(tag => `<code class="${adsEscape(tag.cls)}">${adsEscape(tag.text)}</code>`).join('')
}

function promotionFeatureActions(feature = {}, options = {}) {
  const mode = options.mode || 'hub'
  const buttons = []
  if (feature.primaryAction === 'discount') {
    buttons.push('<button type="button" onclick="openShopeeDiscountApplyPanel()">Mở Discount & đẩy giá</button>')
  }
  if (feature.syncable) {
    buttons.push(`<button type="button" onclick="syncPromotionQuickFeature('${adsEscape(feature.key)}')">Cập nhật cache</button>`)
  }
  if (feature.browsable) {
    buttons.push(`<button type="button" class="secondary" onclick="openPromotionFeatureList('${adsEscape(feature.key)}')">Xem danh sách</button>`)
  }
  if (feature.previewable && mode !== 'quick') {
    buttons.push(`<button type="button" class="secondary" onclick="openPromotionFeatureList('${adsEscape(feature.key)}')">Chọn SKU / preview</button>`)
  }
  if (feature.secondaryAction === 'queue' && mode !== 'quick') {
    buttons.push('<button type="button" class="secondary" onclick="showPromotionTab(\'queue\')">Hàng đợi duyệt</button>')
  }
  if (!buttons.length) {
    buttons.push('<button type="button" class="secondary" onclick="showPromotionTab(\'core\')">Xem trạng thái endpoint</button>')
  }
  return `<div class="ads-promotion-browser-actions">${buttons.join('')}</div>`
}

function renderPromotionFeatureCard(feature = {}, options = {}) {
  const coverage = promotionFeatureCoverage(feature)
  const locked = feature.lockedOnly ? ' locked' : ''
  return `
    <article class="ads-promotion-feature-card${locked}">
      <div class="ads-promotion-feature-head">
        <b>${adsEscape(feature.label)}</b>
        <small>${adsEscape(feature.shortLabel || feature.label)}</small>
      </div>
      <span>${adsEscape(feature.description)}</span>
      <div class="ads-promotion-feature-tags">${promotionFeatureTags(feature, coverage)}</div>
      <small>${adsEscape(feature.readStatus)}</small>
      <small>${adsEscape(feature.writeStatus)}</small>
      ${promotionFeatureActions(feature, options)}
    </article>
  `
}

function renderPromotionFeatureHub() {
  const box = adsEl('promotionFeatureGrid')
  if (!box) return
  box.innerHTML = PROMOTION_FEATURE_CATALOG.map(feature => renderPromotionFeatureCard(feature, { mode: 'hub' })).join('')
}

function renderPromotionQuickActions() {
  const box = adsEl('promotionQuickActions')
  if (!box) return
  const featureCards = PROMOTION_FEATURE_CATALOG.map(feature => renderPromotionFeatureCard(feature, { mode: 'quick' })).join('')
  const utilityCards = `
    <article class="ads-promotion-quick-card">
      <b>Toàn bộ read-only</b>
      <span>Chạy lần lượt các module đã nối để làm mới core khuyến mãi.</span>
      <button type="button" onclick="syncPromotionCoreCache()">Cập nhật toàn bộ</button>
      <small>Nên dùng khi vừa thêm shop API hoặc cần snapshot mới.</small>
    </article>
    <article class="ads-promotion-quick-card">
      <b>Kiểm tra dữ liệu</b>
      <span>Batch sâu, làm sạch giá 0đ và mở hàng đợi duyệt giá trước khi áp thật.</span>
      <div class="ads-promotion-browser-actions">
        <button type="button" class="secondary" onclick="runPromotionDeepBatch()">Batch sâu</button>
        <button type="button" class="secondary" onclick="repairPromotionPriceGaps()">Làm sạch giá 0đ</button>
        <button type="button" class="secondary" onclick="showPromotionTab('queue')">Hàng đợi duyệt</button>
      </div>
      <small>Các bước này phục vụ kiểm tra, không tự ghi thay đổi lên sàn.</small>
    </article>
  `
  box.innerHTML = featureCards + utilityCards
}

window.showPromotionFeatureHub = function() {
  showAdsSubpage('promotion')
  activatePromotionTab('features')
  renderPromotionFeatureHub()
}

function promotionSelectedCacheJobs() {
  const kind = adsEl('promotionListKind')?.value || 'programs'
  const platform = String(adsEl('promotionPlatformFilter')?.value || '').toLowerCase()
  const module = String(adsEl('promotionModuleFilter')?.value || '').toLowerCase()
  const status = adsEl('promotionStatusFilter')?.value || 'all'
  const shop = adsEl('adsShop')?.value || ''
  const jobs = []
  const shopLimit = shop ? 1 : 5

  if (kind === 'vouchers') {
    if (!platform || platform === 'shopee') {
      jobs.push({
        label: 'Shopee Voucher',
        run: () => adsPost('/api/discounts/shopee/vouchers/sync', { shop, status, include_detail: 1, page_limit: 3, page_size: 100, detail_limit: 10, shop_limit: shopLimit })
      })
    }
    if (!platform || platform === 'lazada') {
      jobs.push({
        label: 'Lazada Voucher',
        run: () => adsPost('/api/discounts/lazada/vouchers/sync', { shop, status, include_detail: 1, include_products: 1, page_limit: 2, detail_limit: 10, product_page_limit: 1, shop_limit: shopLimit })
      })
    }
    return jobs
  }

  const shopeeModules = ['bundle_deal', 'add_on_deal', 'shop_flash_sale']
  const lazadaModules = ['free_shipping', 'flexicombo']
  const shouldRun = (currentPlatform, currentModule) => (!platform || platform === currentPlatform) && (!module || module === currentModule)
  for (const currentModule of shopeeModules) {
    if (!shouldRun('shopee', currentModule)) continue
    jobs.push({
      label: `Shopee ${promotionModuleLabel(currentModule)}`,
      run: () => adsPost('/api/discounts/shopee/promotions/sync', { shop, module: currentModule, status, include_detail: 1, page_limit: 1, page_size: currentModule === 'shop_flash_sale' ? 50 : 100, detail_limit: 8, item_limit: currentModule === 'shop_flash_sale' ? 20 : 8, shop_limit: shopLimit })
    })
  }
  for (const currentModule of lazadaModules) {
    if (!shouldRun('lazada', currentModule)) continue
    jobs.push({
      label: `Lazada ${promotionModuleLabel(currentModule)}`,
      run: () => adsPost('/api/discounts/lazada/promotions/sync', { shop, module: currentModule, status, include_detail: 1, include_products: 1, page_limit: 1, detail_limit: 8, product_page_limit: 1, shop_limit: shopLimit })
    })
  }
  return jobs
}

function promotionSyncResultLine(result = {}) {
  if (result.error || result.status === 'error') return adsEscape(result.message || result.error || 'Lỗi không rõ')
  const total = Number(result.total_vouchers ?? result.total_programs ?? result.saved_vouchers ?? result.saved_programs ?? 0)
  const items = Number(result.item_count ?? result.saved_items ?? result.detail_count ?? 0)
  return `OK · chương trình/voucher ${total.toLocaleString('vi-VN')} · item/detail ${items.toLocaleString('vi-VN')}`
}

function renderPromotionCore() {
  const box = adsEl('promotionCoreBox')
  const summaryEl = adsEl('promotionCoreSummary')
  const data = adsState.promotionCore
  if (!box) return
  if (!data) {
    if (summaryEl) summaryEl.textContent = 'Chưa tải core'
    box.innerHTML = '<div class="ads-empty">Bấm tải core khuyến mãi để xem cache đa sàn.</div>'
    return
  }
  if (data.error) {
    if (summaryEl) summaryEl.textContent = 'Lỗi core'
    box.innerHTML = `<div class="ads-error">Không tải được core khuyến mãi: ${adsEscape(data.error)}</div>`
    return
  }
  const summary = data.summary || {}
  const endpoints = summary.endpoints || {}
  const shopeePrograms = summary.shopee_programs || {}
  const lazadaPrograms = summary.lazada_programs || {}
  const adsOverlapSummary = summary.ads_overlap || {}
  if (summaryEl) {
    summaryEl.textContent = `${Number(endpoints.done || 0).toLocaleString('vi-VN')}/${Number(endpoints.total_modules || 0).toLocaleString('vi-VN')} module đã nối · ${Number(endpoints.locked || 0).toLocaleString('vi-VN')} module khóa ghi thật`
  }
  const riskRows = Array.isArray(data.ads_overlap_rows) ? data.ads_overlap_rows : []
  adsState.renderedPromotionRows = riskRows
  renderPromotionFeatureHub()
  renderPromotionQuickActions()
  box.innerHTML = `
    <div class="ads-promotion-kpis">
      ${promotionSummaryKpi('Shopee Voucher', summary.shopee_vouchers?.total_vouchers, `${Number(summary.shopee_vouchers?.active_vouchers || 0).toLocaleString('vi-VN')} còn hiệu lực`)}
      ${promotionSummaryKpi('Lazada Voucher', summary.lazada_vouchers?.total_vouchers, `${Number(summary.lazada_vouchers?.active_vouchers || 0).toLocaleString('vi-VN')} còn hiệu lực`)}
      ${promotionSummaryKpi('Shopee Bundle/Add-On/Flash', shopeePrograms.total_programs, `${Number(shopeePrograms.total_items || 0).toLocaleString('vi-VN')} dòng SKU/item`)}
      ${promotionSummaryKpi('Lazada Freeship/Flexicombo', lazadaPrograms.total_programs, `${Number(lazadaPrograms.total_items || 0).toLocaleString('vi-VN')} dòng SKU/item`)}
    </div>
    ${promotionModuleCards(summary)}
    <div class="ads-discount-note">Core này đọc từ cache D1: discount, voucher, promotion programs, ADS snapshot và tồn sản phẩm. Các nút cập nhật chỉ gọi endpoint read-only, không gửi lệnh tạo/sửa/tắt chương trình thật. ${Number(adsOverlapSummary.unmatched_campaigns || 0) > 0 ? `Hiện còn ${Number(adsOverlapSummary.unmatched_campaigns || 0).toLocaleString('vi-VN')} campaign ADS chưa map được SKU, tổng spend ${adsMoney(adsOverlapSummary.unmatched_spend || 0)}.` : 'Phần ADS trong core này chỉ tính campaign khớp SKU, không dàn cùng một số tiền cho mọi dòng.'}</div>
    <div class="ads-panel-title" style="margin-top:12px"><span>SKU đang có giá giảm và ADS</span><small>${riskRows.length.toLocaleString('vi-VN')} dòng từ core</small></div>
    ${renderPromotionRiskRows(riskRows)}
  `
}

window.loadPromotionCore = async function(options = {}) {
  const box = adsEl('promotionCoreBox')
  if (!options.silent) activatePromotionTab('core')
  if (box && !options.silent) box.innerHTML = '<div class="ads-empty">Đang tải core khuyến mãi từ cache D1...</div>'
  try {
    // UI chỉ đọc core tổng hợp; các API sàn thật chỉ chạy khi người dùng bấm cập nhật cache read-only.
    adsState.promotionCore = await adsFetch('/api/discounts/promotion-tool-core?limit=12')
  } catch (error) {
    adsState.promotionCore = { error: error.message }
  }
  renderPromotionCore()
}

window.syncPromotionCoreCache = async function() {
  activatePromotionTab('update')
  setPromotionUpdateStatus('Đang cập nhật toàn bộ cache khuyến mãi read-only theo từng module để tránh quá quota request...')
  const jobs = [
    () => adsPost('/api/discounts/shopee/vouchers/sync', { status: 'all', include_detail: 0, page_limit: 10, page_size: 100, shop_limit: 5 }),
    () => adsPost('/api/discounts/shopee/promotions/sync', { module: 'bundle_deal', status: 'all', include_detail: 1, page_limit: 1, page_size: 100, detail_limit: 5, item_limit: 5, shop_limit: 5 }),
    () => adsPost('/api/discounts/shopee/promotions/sync', { module: 'add_on_deal', status: 'all', include_detail: 1, page_limit: 1, page_size: 100, detail_limit: 5, item_limit: 5, shop_limit: 5 }),
    () => adsPost('/api/discounts/shopee/promotions/sync', { module: 'shop_flash_sale', status: 'all', include_detail: 1, page_limit: 1, page_size: 50, detail_limit: 5, item_limit: 5, shop_limit: 5 }),
    () => adsPost('/api/discounts/lazada/vouchers/sync', { status: 'all', include_detail: 1, include_products: 1, page_limit: 1, detail_limit: 5, product_page_limit: 1, shop_limit: 5 }),
    () => adsPost('/api/discounts/lazada/promotions/sync', { status: 'all', include_detail: 1, include_products: 1, page_limit: 1, detail_limit: 5, product_page_limit: 1, shop_limit: 5 })
  ]
  const results = []
  for (const job of jobs) {
    try {
      results.push(await job())
    } catch (error) {
      results.push({ status: 'error', error: error.message })
    }
  }
  await loadPromotionCore({ silent: true })
  const errors = results.filter(row => row.status === 'error' || row.error)
  const okCount = results.length - errors.length
  const lines = results.map((row, index) => `<span>${index + 1}. ${promotionSyncResultLine(row)}</span>`).join('')
  setPromotionUpdateStatus(`<b>Cập nhật toàn bộ xong: ${okCount.toLocaleString('vi-VN')}/${results.length.toLocaleString('vi-VN')} lượt OK.</b>${errors.length ? `<span>Có ${errors.length.toLocaleString('vi-VN')} lượt lỗi, dữ liệu đã tải được vẫn giữ trong core.</span>` : '<span>Không có lỗi trong lượt cập nhật này.</span>'}${lines}`, errors.length ? 'error' : 'ok')
}

window.syncPromotionSelectedCache = async function() {
  activatePromotionTab('update')
  const jobs = promotionSelectedCacheJobs()
  if (!jobs.length) {
    setPromotionUpdateStatus('Bộ lọc hiện tại không khớp endpoint read-only nào. Chọn lại sàn/module hoặc đổi nguồn Voucher/Chương trình.', 'error')
    return
  }
  setPromotionUpdateStatus(`Đang chạy ${jobs.length.toLocaleString('vi-VN')} lượt cập nhật theo bộ lọc hiện tại...`)
  const results = []
  for (const job of jobs) {
    try {
      results.push({ label: job.label, ...(await job.run()) })
    } catch (error) {
      results.push({ label: job.label, status: 'error', error: error.message })
    }
  }
  await loadPromotionCore({ silent: true })
  const errors = results.filter(row => row.status === 'error' || row.error)
  const lines = results.map(row => `<span>${adsEscape(row.label)}: ${promotionSyncResultLine(row)}</span>`).join('')
  setPromotionUpdateStatus(`<b>Cập nhật theo bộ lọc xong.</b>${lines}`, errors.length ? 'error' : 'ok')
}

window.syncPromotionQuickFeature = async function(key) {
  const feature = PROMOTION_QUICK_FEATURES[key]
  activatePromotionTab('update')
  if (!feature) {
    setPromotionUpdateStatus('Chưa tìm thấy nút cập nhật nhanh tương ứng. Chọn lại tính năng hoặc dùng bộ lọc thủ công.', 'error')
    return
  }
  // Nút nhanh chỉ đổi bộ lọc về đúng module đã được kiểm soát rồi chạy luồng cập nhật cache read-only.
  applyPromotionQuickFeature(feature)
  setPromotionUpdateStatus(`Đang chuẩn bị cập nhật nhanh ${adsEscape(feature.label)} bằng endpoint read-only...`)
  await window.syncPromotionSelectedCache()
}

window.openShopeeDiscountApplyPanel = async function() {
  showAdsSubpage('discount')
  const box = adsEl('discountAnalysisBox')
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' })
  await loadDiscountAnalysis({ silent: !box })
}

window.openPromotionFeatureList = async function(key) {
  const feature = PROMOTION_FEATURE_CATALOG.find(item => item.key === key)
  if (!feature) return
  if (feature.primaryAction === 'discount') {
    await window.openShopeeDiscountApplyPanel()
    return
  }
  if (!feature.browsable) {
    showPromotionFeatureHub()
    return
  }
  showAdsSubpage('promotion')
  applyPromotionQuickFeature(feature)
  await loadPromotionBrowserList()
}
