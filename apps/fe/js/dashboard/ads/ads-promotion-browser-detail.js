function promotionFilterParams() {
  const qs = new URLSearchParams()
  const platform = adsEl('promotionPlatformFilter')?.value || ''
  const module = adsEl('promotionModuleFilter')?.value || ''
  const status = adsEl('promotionStatusFilter')?.value || 'all'
  const shop = adsEl('adsShop')?.value || ''
  if (platform) qs.set('platform', platform)
  if (module) qs.set('module', module)
  if (shop) qs.set('shop', shop)
  if (status) qs.set('status', status)
  qs.set('limit', '80')
  return qs.toString()
}

function promotionStatusLabel(status = '') {
  const key = String(status || '').toLowerCase()
  return {
    ongoing: 'Đang hiệu lực',
    upcoming: 'Sắp chạy',
    expired: 'Đã kết thúc',
    enabled: 'Đang bật',
    disabled: 'Đã tắt',
    suspended: 'Tạm dừng'
  }[key] || status || 'Chưa rõ'
}

function promotionProgramItemCountText(row = {}) {
  const cached = Number(row.cached_items || 0)
  const reported = Number(row.item_count || 0)
  const cachedText = `cache ${cached.toLocaleString('vi-VN')} item/SKU`
  if (reported > 0 && reported !== cached) {
    return `${cachedText} · sàn báo ${reported.toLocaleString('vi-VN')}`
  }
  return cachedText
}

function promotionPlatformStatusText(row = {}) {
  const status = String(row.status || '').toLowerCase()
  if (['ongoing', 'enabled'].includes(status)) return 'Đang bật trên sàn'
  if (['suspended', 'disabled'].includes(status)) return 'Đang tắt / tạm dừng'
  if (status === 'expired') return 'Đã kết thúc'
  if (status === 'upcoming') return 'Sắp chạy'
  return 'Chưa rõ trạng thái'
}

function promotionLiveId(row = {}, kind = 'programs') {
  return [
    kind,
    row.platform || '',
    row.shop || '',
    row.module || 'voucher',
    row.program_id || row.voucher_id || ''
  ].join('|')
}

function promotionLivePayload(row = {}, kind = 'programs') {
  if (kind === 'vouchers') return { voucher_id: row.voucher_id }
  return { program_id: row.program_id }
}

function promotionLiveModule(row = {}, kind = 'programs') {
  return kind === 'vouchers' ? 'voucher' : row.module
}

function promotionSelectionToolbar(kind, rows = []) {
  const count = (adsState.promotionSelectedRows || new Set()).size
  const flashForm = kind === 'programs' && String(adsEl('promotionModuleFilter')?.value || '') === 'shop_flash_sale' ? renderFlashSaleCreateForm() : ''
  return `
    <div class="ads-promotion-live-form">
      <div class="ads-promotion-browser-actions">
        <button type="button" class="secondary" onclick="selectAllPromotionRows('${kind}')">Tích all</button>
        <button type="button" class="secondary" onclick="clearPromotionSelection()">Bỏ chọn</button>
        <button type="button" onclick="runPromotionBulkAction('${kind}', 'end', false)">Kiểm tra payload kết thúc</button>
        <button type="button" onclick="runPromotionBulkAction('${kind}', 'delete', false)">Kiểm tra payload xóa</button>
        <button type="button" class="danger" disabled title="Chỉ mở sau khi diagnostics marketplace_client PASS và có quyền endpoint tương ứng.">Gửi thật bị khóa</button>
      </div>
      <span>Đã chọn ${count.toLocaleString('vi-VN')}/${rows.length.toLocaleString('vi-VN')} dòng. Apply thật yêu cầu admin và xác nhận.</span>
    </div>
    ${flashForm}
  `
}

function renderPromotionDetailEmpty(message = 'Chọn một chương trình ở tab Danh sách để xem chi tiết, giá và SKU áp dụng.') {
  const detailBox = adsEl('promotionDetailBox')
  const skuDetailBox = adsEl('promotionSkuDetailBox')
  const previewBox = adsEl('promotionPreviewBox')
  if (detailBox) detailBox.innerHTML = `<div class="ads-empty">${adsEscape(message)}</div>`
  if (skuDetailBox) skuDetailBox.innerHTML = '<div class="ads-empty">Chi tiết SKU sẽ hiện ở đây sau khi chọn một dòng chương trình.</div>'
  if (previewBox) previewBox.innerHTML = '<div class="ads-empty">Preview giá theo tồn kho sẽ hiện ở đây sau khi chọn SKU.</div>'
}

function renderPromotionBrowserRows(kind = 'programs') {
  const box = adsEl('promotionListBox')
  if (!box) return
  if (kind === 'vouchers') {
    const rows = adsState.promotionVouchers || []
    if (!rows.length) {
      box.innerHTML = '<div class="ads-empty">Chưa có voucher theo bộ lọc hiện tại.</div>'
      return
    }
    box.innerHTML = promotionSelectionToolbar('vouchers', rows) + rows.map((row, index) => `
      <article class="ads-promotion-row">
        <div class="ads-promotion-row-head">
          <div class="ads-promotion-row-select">
            <input type="checkbox" ${adsState.promotionSelectedRows?.has(promotionLiveId(row, 'vouchers')) ? 'checked' : ''} onchange="togglePromotionSelected('vouchers', ${index}, this.checked)" aria-label="Chọn voucher">
            <div>
            <b>${adsEscape(row.voucher_name || row.voucher_code || row.voucher_id)}</b>
            <span>${adsPlatformLabel(row.platform)} · ${adsEscape(row.shop || '')} · ${adsEscape(promotionStatusLabel(row.status))}</span>
            </div>
          </div>
          <div class="ads-promotion-browser-actions">
            <button type="button" class="ads-action-btn" onclick="openPromotionVoucherDetail(${index})">Chi tiết</button>
            <button type="button" class="ads-action-btn secondary" onclick="runPromotionRowAction('vouchers', ${index}, 'end', false)">${adsEscape(promotionPlatformStatusText(row))}</button>
            <button type="button" class="ads-action-btn danger" onclick="runPromotionRowAction('vouchers', ${index}, 'delete', false)">Kiểm tra payload xóa</button>
            <button type="button" class="ads-action-btn secondary" onclick="deletePromotionCacheEntry('vouchers', ${index})">Xóa cache</button>
          </div>
        </div>
        <span>Giảm ${adsMoney(row.discount_amount)} · ${Number(row.percentage || 0).toLocaleString('vi-VN')}% · dùng ${Number(row.current_usage || 0).toLocaleString('vi-VN')}/${Number(row.usage_quantity || 0).toLocaleString('vi-VN')}</span>
      </article>
    `).join('')
    return
  }

  const rows = adsState.promotionPrograms || []
  if (!rows.length) {
    const emptyText = '<div class="ads-empty">Chưa có chương trình theo bộ lọc hiện tại.</div>'
    // Flash Sale cần tạo theo giờ ngay cả khi cache chưa có chương trình cũ để chọn/xóa.
    box.innerHTML = String(adsEl('promotionModuleFilter')?.value || '') === 'shop_flash_sale'
      ? promotionSelectionToolbar('programs', []) + emptyText
      : emptyText
    return
  }
  box.innerHTML = promotionSelectionToolbar('programs', rows) + rows.map((row, index) => `
    <article class="ads-promotion-row">
      <div class="ads-promotion-row-head">
        <div class="ads-promotion-row-select">
          <input type="checkbox" ${adsState.promotionSelectedRows?.has(promotionLiveId(row, 'programs')) ? 'checked' : ''} onchange="togglePromotionSelected('programs', ${index}, this.checked)" aria-label="Chọn chương trình">
          <div>
          <b>${adsEscape(row.program_name || row.program_id)}</b>
          <span>${adsPlatformLabel(row.platform)} · ${adsEscape(promotionModuleLabel(row.module))} · ${adsEscape(row.shop || '')}</span>
          </div>
        </div>
        <div class="ads-promotion-browser-actions">
          <button type="button" class="ads-action-btn" onclick="openPromotionProgramDetail(${index})">Mở chi tiết</button>
          <button type="button" class="ads-action-btn secondary" onclick="runPromotionRowAction('programs', ${index}, 'end', false)">${adsEscape(promotionPlatformStatusText(row))}</button>
          <button type="button" class="ads-action-btn danger" onclick="runPromotionRowAction('programs', ${index}, 'delete', false)">Kiểm tra payload xóa</button>
          <button type="button" class="ads-action-btn secondary" onclick="deletePromotionCacheEntry('programs', ${index})">Xóa cache</button>
        </div>
      </div>
      <span>${adsEscape(promotionStatusLabel(row.status))} · ${adsTime(row.start_time)} - ${adsTime(row.end_time)} · ${promotionProgramItemCountText(row)}</span>
    </article>
  `).join('')
}

window.loadPromotionBrowserList = async function() {
  activatePromotionTab('browse')
  const box = adsEl('promotionListBox')
  const kind = adsEl('promotionListKind')?.value || 'programs'
  if (box) box.innerHTML = '<div class="ads-empty">Đang tải danh sách khuyến mãi từ cache...</div>'
  clearPromotionDetail()
  try {
    if (kind === 'vouchers') {
      const data = await adsFetch(`/api/discounts/promotion-vouchers?${promotionFilterParams()}`)
      adsState.promotionVouchers = Array.isArray(data.rows) ? data.rows : []
      adsState.promotionPrograms = []
      renderPromotionBrowserRows('vouchers')
    } else {
      const data = await adsFetch(`/api/discounts/promotion-programs?${promotionFilterParams()}`)
      adsState.promotionPrograms = Array.isArray(data.rows) ? data.rows : []
      adsState.promotionVouchers = []
      renderPromotionBrowserRows('programs')
    }
  } catch (error) {
    if (box) box.innerHTML = `<div class="ads-error">Không tải được danh sách khuyến mãi: ${adsEscape(error.message)}</div>`
  }
}

window.clearPromotionDetail = function() {
  adsState.promotionDetail = null
  adsState.promotionPreview = null
  adsState.promotionPreviewItemIndex = null
  adsState.promotionSkuDetail = null
  renderPromotionDetailEmpty()
}

function promotionRowsForKind(kind = 'programs') {
  return kind === 'vouchers' ? (adsState.promotionVouchers || []) : (adsState.promotionPrograms || [])
}

window.togglePromotionSelected = function(kind, index, checked) {
  if (!adsState.promotionSelectedRows) adsState.promotionSelectedRows = new Set()
  const row = promotionRowsForKind(kind)[Number(index)]
  if (!row) return
  const key = promotionLiveId(row, kind)
  if (checked) adsState.promotionSelectedRows.add(key)
  else adsState.promotionSelectedRows.delete(key)
  renderPromotionBrowserRows(kind)
}

window.selectAllPromotionRows = function(kind) {
  if (!adsState.promotionSelectedRows) adsState.promotionSelectedRows = new Set()
  promotionRowsForKind(kind).forEach(row => adsState.promotionSelectedRows.add(promotionLiveId(row, kind)))
  renderPromotionBrowserRows(kind)
}

window.clearPromotionSelection = function() {
  adsState.promotionSelectedRows = new Set()
  renderPromotionBrowserRows(adsEl('promotionListKind')?.value === 'vouchers' ? 'vouchers' : 'programs')
}

async function postShopeePromotionLive(row, kind, action, execute, payloadOverride = null) {
  const payload = payloadOverride || promotionLivePayload(row, kind)
  return adsPost('/api/discounts/shopee/promotion-action', {
    module: promotionLiveModule(row, kind),
    action,
    shop: row.shop || adsEl('adsShop')?.value || '',
    payload,
    execute,
    confirm: execute ? DISCOUNT_SHOPEE_APPLY_CONFIRM : ''
  })
}

window.runPromotionRowAction = async function(kind, index, action, execute) {
  const row = promotionRowsForKind(kind)[Number(index)]
  if (!row) return
  if (execute) {
    const ok = await adsConfirmShopeeAction({
      danger: ['delete', 'end'].includes(String(action || '').toLowerCase()),
      action,
      shop: row.shop || '',
      objectId: row.program_id || row.voucher_id || '',
      module: promotionLiveModule(row, kind) || ''
    })
    if (!ok) return
  }
  try {
    const data = await postShopeePromotionLive(row, kind, action, execute)
    const box = adsEl('promotionPreviewBox') || adsEl('promotionUpdateStatus')
    adsSetApiResult(box, data, { action, title: execute ? 'Kết quả thao tác Shopee' : 'Preview payload Shopee' })
    if (execute && adsActionOk(data)) await loadPromotionBrowserList()
  } catch (error) {
    adsShowToast(`Không thao tác được khuyến mãi Shopee: ${error.message}`, 'error')
  }
}

window.runPromotionBulkAction = async function(kind, action, execute) {
  const rows = promotionRowsForKind(kind).filter(row => adsState.promotionSelectedRows?.has(promotionLiveId(row, kind)))
  if (!rows.length) {
    adsShowToast('Chưa chọn dòng khuyến mãi nào.', 'error')
    return
  }
  if (execute) {
    const ok = await adsConfirmShopeeAction({
      title: 'Xác nhận thao tác hàng loạt',
      message: 'Mỗi dòng sẽ gọi Shopee thật và refetch verify riêng. Dòng nào Shopee từ chối sẽ báo lỗi riêng.',
      danger: ['delete', 'end'].includes(String(action || '').toLowerCase()),
      confirmText: 'Gửi hàng loạt',
      action,
      count: rows.length.toLocaleString('vi-VN'),
      module: kind
    })
    if (!ok) return
  }
  const results = []
  for (const row of rows) {
    try {
      results.push(await postShopeePromotionLive(row, kind, action, execute))
    } catch (error) {
      results.push({ status: 'error', error: error.message, row })
    }
  }
  const failed = results.filter(item => item.status === 'error' || item.verified === false || item.response?.error).length
  const box = adsEl('promotionPreviewBox') || adsEl('promotionUpdateStatus')
  if (box) {
    box.innerHTML = `<div class="ads-api-panel ${failed ? 'failed' : 'verified'}"><b>${execute ? 'Kết quả gửi Shopee' : 'Preview payload'}</b><p>${adsEscape(action)} ${results.length} dòng. Lỗi/chưa verify: ${failed}.</p></div>`
  }
  adsShowToast(`${execute ? 'Kết quả gửi' : 'Preview'} ${action}: ${failed} lỗi/chưa verify`, failed ? 'error' : 'ok')
  if (execute && !failed) await loadPromotionBrowserList()
}

window.showPromotionPlatformLock = function(kind, index) {
  const row = kind === 'vouchers'
    ? adsState.promotionVouchers?.[Number(index)]
    : adsState.promotionPrograms?.[Number(index)]
  if (!row) return
  const label = kind === 'vouchers'
    ? 'Mã giảm giá của shop'
    : promotionModuleLabel(row.module)
  adsShowToast(`${label}: trạng thái hiện tại ${promotionPlatformStatusText(row)}. Chỉ thao tác khi endpoint ghi thật có verify.`, 'info')
}

window.deletePromotionCacheEntry = async function(kind, index) {
  const row = kind === 'vouchers'
    ? adsState.promotionVouchers?.[Number(index)]
    : adsState.promotionPrograms?.[Number(index)]
  if (!row) return
  const targetName = row.voucher_name || row.voucher_code || row.voucher_id || row.program_name || row.program_id
  const ok = await adsConfirmShopeeAction({
    title: 'Xác nhận xóa cache nội bộ',
    message: 'Chỉ xóa dữ liệu cache D1 nội bộ để tải lại mới, không gửi lệnh xóa lên Shopee.',
    confirmText: 'Xóa cache',
    danger: false,
    objectId: targetName,
    shop: row.shop || ''
  })
  if (!ok) return
  try {
    await adsPost('/api/discounts/promotion-cache/delete', {
      platform: row.platform,
      module: row.module,
      shop: row.shop,
      voucher_id: kind === 'vouchers' ? row.voucher_id : '',
      program_id: kind === 'programs' ? row.program_id : '',
      confirm: 'DELETE_CACHE_ONLY'
    })
    clearPromotionDetail()
    await loadPromotionBrowserList()
    if (typeof loadPromotionCore === 'function') await loadPromotionCore({ silent: true })
  } catch (error) {
    adsShowToast(`Không xóa được cache khuyến mãi: ${error.message}`, 'error')
  }
}

window.openPromotionVoucherDetail = function(index) {
  activatePromotionTab('detail')
  const row = adsState.promotionVouchers[Number(index)]
  const detailBox = adsEl('promotionDetailBox')
  const skuDetailBox = adsEl('promotionSkuDetailBox')
  const previewBox = adsEl('promotionPreviewBox')
  if (!row || !detailBox) return
  adsState.promotionDetail = { voucher: row, items: [] }
  if (skuDetailBox) skuDetailBox.innerHTML = '<div class="ads-empty">Voucher không có chi tiết SKU kiểu chương trình. Hãy xem mã, mức giảm và phạm vi áp dụng ở thẻ trên.</div>'
  if (previewBox) previewBox.innerHTML = ''
  const itemIds = Array.isArray(row.item_ids) ? row.item_ids : []
  detailBox.innerHTML = `
    <article class="ads-promotion-detail-card">
      <b>${adsEscape(row.voucher_name || row.voucher_code || row.voucher_id)}</b>
      <span>${adsPlatformLabel(row.platform)} · ${adsEscape(row.shop || '')} · ${adsEscape(promotionStatusLabel(row.status))}</span>
      <div class="ads-promotion-detail-grid">
        <span>Mã: ${adsEscape(row.voucher_code || '-')}</span>
        <span>Giảm: ${adsMoney(row.discount_amount)} / ${Number(row.percentage || 0).toLocaleString('vi-VN')}%</span>
        <span>Đơn tối thiểu: ${adsMoney(row.min_basket_price)}</span>
        <span>SKU áp dụng: ${itemIds.length.toLocaleString('vi-VN')}</span>
      </div>
    </article>
  `
}

window.openPromotionProgramDetail = async function(index) {
  activatePromotionTab('detail')
  const row = adsState.promotionPrograms[Number(index)]
  const detailBox = adsEl('promotionDetailBox')
  const skuDetailBox = adsEl('promotionSkuDetailBox')
  const previewBox = adsEl('promotionPreviewBox')
  if (!row || !detailBox) return
  if (skuDetailBox) skuDetailBox.innerHTML = ''
  if (previewBox) previewBox.innerHTML = ''
  detailBox.innerHTML = '<div class="ads-empty">Đang tải chi tiết chương trình...</div>'
  try {
    const qs = new URLSearchParams({
      platform: row.platform || '',
      module: row.module || '',
      shop: row.shop || '',
      program_id: row.program_id || '',
      item_limit: '120'
    })
    const data = await adsFetch(`/api/discounts/promotion-program-detail?${qs.toString()}`)
    adsState.promotionDetail = data
    const items = Array.isArray(data.items) ? data.items : []
    detailBox.innerHTML = `
      <article class="ads-promotion-detail-card">
        <b>${adsEscape(data.program?.program_name || data.program?.program_id || '')}</b>
        <span>${adsPlatformLabel(data.program?.platform)} · ${adsEscape(promotionModuleLabel(data.program?.module))} · ${adsEscape(data.program?.shop || '')}</span>
        <div class="ads-promotion-detail-grid">
          <span>Trạng thái: ${adsEscape(promotionStatusLabel(data.program?.status))}</span>
          <span>Thời gian: ${adsTime(data.program?.start_time)} - ${adsTime(data.program?.end_time)}</span>
          <span>Ngân sách: ${adsMoney(data.program?.budget || 0)}</span>
          <span>Item cache: ${items.length.toLocaleString('vi-VN')}${Number(data.program?.item_count || 0) && Number(data.program?.item_count || 0) !== items.length ? ` · sàn báo ${Number(data.program?.item_count || 0).toLocaleString('vi-VN')}` : ''}</span>
        </div>
      </article>
      ${items.length ? items.slice(0, 40).map((item, itemIndex) => `
        <article class="ads-promotion-row">
          <div class="ads-promotion-row-head">
            <div>
              <b>${adsEscape(item.item_name || item.sku || item.item_id || item.sku_id || 'SKU chưa rõ')}</b>
              <span>${adsEscape(item.item_role || 'item')} · ${adsEscape(item.sku || item.sku_id || '')} · ${adsEscape(item.status || '')}</span>
            </div>
            <div class="ads-promotion-browser-actions">
              <button type="button" class="ads-action-btn" onclick="openPromotionSkuDetail(${itemIndex})">Chi tiết SKU</button>
              <button type="button" class="ads-action-btn" onclick="openPromotionStockRulePreview(${itemIndex})">Preview giá theo tồn</button>
            </div>
          </div>
          <span>Giá KM ${adsMoney(item.promotion_price)} · giá gốc ${adsMoney(item.original_price)} · tồn ${Number(item.stock || item.campaign_stock || 0).toLocaleString('vi-VN')}</span>
        </article>
      `).join('') : '<div class="ads-empty">Chương trình này chưa có item/SKU trong cache.</div>'}
    `
  } catch (error) {
    detailBox.innerHTML = `<div class="ads-error">Không tải được chi tiết: ${adsEscape(error.message)}</div>`
  }
}

function promotionItemQuery(item = {}) {
  const qs = new URLSearchParams({
    platform: item.platform || '',
    module: item.module || '',
    shop: item.shop || '',
    program_id: item.program_id || '',
    item_id: item.item_id || '',
    model_id: item.model_id || '',
    sku_id: item.sku_id || '',
    days: '30'
  })
  return qs.toString()
}

function renderPromotionSkuDetail(data = {}) {
  const box = adsEl('promotionSkuDetailBox')
  if (!box) return
  if (data.status === 'error') {
    box.innerHTML = `<div class="ads-error">${adsEscape(data.message || data.error || 'Không tải được chi tiết SKU.')}</div>`
    return
  }
  const item = data.promotion_item || {}
  const inventory = data.inventory || {}
  const ads = data.ads || {}
  const orders = data.orders || {}
  const profit = data.profit_check || {}
  const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : []
  box.innerHTML = `
    <article class="ads-promotion-detail-card">
      <b>Chi tiết SKU: ${adsEscape(item.item_name || item.sku || item.item_id || 'SKU chưa rõ')}</b>
      <span>${adsPlatformLabel(item.platform)} · ${adsEscape(promotionModuleLabel(item.module))} · ${adsEscape(item.shop || '')}</span>
      <div class="ads-promotion-detail-grid">
        <span>SKU sàn: ${adsEscape(item.sku || inventory.platform_sku || '-')}</span>
        <span>SKU nội bộ: ${adsEscape(inventory.internal_sku || '-')}</span>
        <span>Tồn sàn: ${Number(item.stock || inventory.stock || 0).toLocaleString('vi-VN')}</span>
        <span>Nguồn giá: ${adsEscape(item.price_source || data.source?.inventory || '-')}</span>
        <span>Giá gốc: ${adsMoney(item.original_price || inventory.price || 0)}</span>
        <span>Giá KM: ${adsMoney(item.promotion_price || inventory.discount_price || 0)}</span>
        <span>Giá vốn: ${adsMoney(profit.cost_base || data.product_cost?.cost_real || data.product_cost?.cost_invoice || 0)}</span>
        <span>Lãi đơn vị sau giá mục tiêu: ${adsMoney(profit.unit_margin_after_target || 0)}</span>
        <span>ADS 30 ngày: ${adsMoney(ads.spend || 0)} · ${Number(ads.clicks || 0).toLocaleString('vi-VN')} click</span>
        <span>Doanh thu ADS 30 ngày: ${adsMoney(ads.revenue || 0)}</span>
        <span>Đơn SKU 30 ngày: ${Number(orders.orders || 0).toLocaleString('vi-VN')} đơn · ${adsMoney(orders.revenue || 0)}</span>
        <span>Lãi sau ADS 30 ngày: ${adsMoney(profit.net_after_ads_30d || 0)}</span>
      </div>
      ${warnings.length ? `<div class="ads-promotion-warning">${warnings.map(adsEscape).join(' ')}</div>` : '<span>Dữ liệu SKU đủ để dựng preview nội bộ. Vẫn cần duyệt admin trước khi apply thật.</span>'}
    </article>
  `
}

window.openPromotionSkuDetail = async function(index) {
  activatePromotionTab('detail')
  const item = adsState.promotionDetail?.items?.[Number(index)]
  const box = adsEl('promotionSkuDetailBox')
  if (!item || !box) return
  box.innerHTML = '<div class="ads-empty">Đang tải chi tiết SKU, ADS, tồn và doanh thu...</div>'
  try {
    const data = await adsFetch(`/api/discounts/promotion-sku-detail?${promotionItemQuery(item)}`)
    adsState.promotionSkuDetail = data
    renderPromotionSkuDetail(data)
  } catch (error) {
    box.innerHTML = `<div class="ads-error">Không tải được chi tiết SKU: ${adsEscape(error.message)}</div>`
  }
}

window.openPromotionStockRulePreview = function(index) {
  activatePromotionTab('detail')
  const item = adsState.promotionDetail?.items?.[Number(index)]
  const previewBox = adsEl('promotionPreviewBox')
  if (!item || !previewBox) return
  adsState.promotionPreviewItemIndex = Number(index)
  const current = Number(item.promotion_price || item.original_price || 0)
  previewBox.innerHTML = `
    <article class="ads-promotion-preview-card">
      <b>Preview rule giá theo tồn kho</b>
      <span>${adsEscape(item.item_name || item.sku || item.item_id || '')}</span>
      <div class="ads-promotion-detail-grid">
        <label>Tồn thấp
          <input id="promotionLowStockPriceInput" type="number" min="0" step="1000" value="${current}">
        </label>
        <label>Tồn vừa
          <input id="promotionMediumStockPriceInput" type="number" min="0" step="1000" value="${current}">
        </label>
        <label>Tồn nhiều
          <input id="promotionHighStockPriceInput" type="number" min="0" step="1000" value="${current}">
        </label>
        <label>Giảm tối đa %
          <input id="promotionMaxDiscountPercentInput" type="number" min="0" step="1" value="30">
        </label>
      </div>
      <div class="ads-promotion-browser-actions">
        <button type="button" onclick="previewPromotionStockRule(${Number(index)})">Dựng payload preview</button>
        <button type="button" class="secondary" onclick="queuePromotionApply(${Number(index)})">Đưa vào hàng đợi duyệt</button>
      </div>
      <div id="promotionPreviewResult" class="ads-discount-note">Preview chỉ dựng payload và cảnh báo, chưa gửi lên sàn.</div>
    </article>
  `
}

window.previewPromotionStockRule = async function(index) {
  const item = adsState.promotionDetail?.items?.[Number(index)]
  const resultBox = adsEl('promotionPreviewResult')
  if (!item || !resultBox) return null
  resultBox.textContent = 'Đang dựng payload preview...'
  try {
    const data = await adsPost('/api/discounts/promotions/preview-action', {
      platform: item.platform,
      module: item.module,
      shop: item.shop,
      action: 'stock_price_rule',
      program_id: item.program_id,
      item_id: item.item_id,
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
      }
    })
    adsState.promotionPreview = data
    const warnings = [...(data.warnings || []), ...(data.errors || [])]
    resultBox.innerHTML = `
      <b>${data.apply_locked ? 'Đã khóa apply thật' : 'Có thể apply'}</b>
      <span>Giá mục tiêu ${adsMoney(data.stock_price_rule?.target_promotion_price || 0)} · mức ${adsEscape(data.stock_price_rule?.tier?.label || '')}</span>
      ${warnings.length ? `<span>${warnings.map(adsEscape).join(' ')}</span>` : '<span>Payload preview hợp lệ ở mức kiểm tra nội bộ.</span>'}
      <pre>${adsEscape(JSON.stringify(data.payload || {}, null, 2))}</pre>
      <div class="ads-promotion-browser-actions">
        <button type="button" class="secondary" onclick="queuePromotionApply(${Number(index)})">Đưa vào hàng đợi duyệt</button>
      </div>
    `
    return data
  } catch (error) {
    resultBox.innerHTML = `<span>Không dựng được preview: ${adsEscape(error.message)}</span>`
    return null
  }
}
