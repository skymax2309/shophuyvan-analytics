{
  const Promo = window.SHV_PROMO
  const { state, esc, text, money, numText, todayText, activeShop, toast, emptyState } = Promo

  function normalizeProduct(row = {}, scheduleId = '') {
    const sku = String(row.seller_sku || row.sku_id || row.model_id || row.item_id || '').trim()
    return {
      schedule_id: scheduleId,
      shop: row.shop || activeShop(),
      api_shop_id: row.api_shop_id || '',
      sku,
      item_id: row.item_id || '',
      model_id: row.model_id || '',
      product_name: row.product_name || row.promotion_name || 'Sản phẩm',
      seller_sku: row.seller_sku || row.sku_id || sku,
      original_price: row.original_price ?? null,
      flash_price: row.flash_price ?? row.promotion_price ?? '',
      quantity: row.quantity ?? row.stock ?? '',
      stock: row.stock ?? null,
      status: row.flash_status || row.flash_rule_status || 'Chờ chạy theo luật'
    }
  }

  function productKey(row = {}) {
    return [
      row.shop || activeShop(),
      row.item_id || '',
      row.model_id || '',
      row.sku || row.seller_sku || row.sku_id || ''
    ].map(value => String(value ?? '').trim()).join('|')
  }

  function scheduleLabel(schedule = {}) {
    return `${schedule.date || '-'} · ${schedule.from || '--:--'}-${schedule.to || '--:--'}`
  }

  function selectedForSchedule(scheduleId) {
    return state.flashAuto.selectedProducts.filter(item => item.schedule_id === scheduleId)
  }

  function addFlashSchedule() {
    state.flashAuto.schedules.push({ id: `flash_${Date.now()}`, date: todayText(), from: '20:00', to: '22:00', enabled: true })
    refreshFlashSaleView()
  }

  function updateFlashSchedule(id, key, value) {
    state.flashAuto.schedules = state.flashAuto.schedules.map(item => item.id === id ? { ...item, [key]: value } : item)
  }

  function toggleFlashSchedule(id) {
    state.flashAuto.schedules = state.flashAuto.schedules.map(item => item.id === id ? { ...item, enabled: item.enabled === false } : item)
    refreshFlashSaleView()
  }

  function removeFlashSchedule(id) {
    state.flashAuto.schedules = state.flashAuto.schedules.filter(item => item.id !== id)
    state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.filter(item => item.schedule_id !== id)
    if (state.flashAuto.productPickerScheduleId === id) closeProductPicker()
    refreshFlashSaleView()
  }

  async function openProductPicker(scheduleId) {
    if (!state.moduleData['shopee-flash']?.items?.length) {
      await Promo.api.fetchPromotionModule('shopee-flash').catch(error => toast(error.message, 'bad'))
    }
    state.flashAuto.productPickerOpen = true
    state.flashAuto.productPickerScheduleId = scheduleId
    refreshFlashSaleView()
  }

  function closeProductPicker() {
    state.flashAuto.productPickerOpen = false
    state.flashAuto.productPickerScheduleId = null
  }

  function renderPickerItems(items, scheduleId, alreadySelected, query = '') {
    const q = String(query || '').toLowerCase().trim()
    const rows = items.filter(item => {
      if (!q) return true
      return [item.product_name, item.seller_sku, item.sku_id, item.item_id, item.model_id].some(value => String(value ?? '').toLowerCase().includes(q))
    })
    if (!rows.length) return emptyState('Chưa tìm thấy sản phẩm', 'Đổi từ khóa tìm kiếm hoặc đồng bộ Shopee Flash Sale trước.')
    return rows.map(row => {
      const key = productKey(row)
      const selected = alreadySelected.has(key)
      const saved = state.flashAuto.selectedProducts.find(item => item.schedule_id === scheduleId && productKey(item) === key) || normalizeProduct(row, scheduleId)
      return `
        <label class="promo-picker-row">
          <input type="checkbox" ${selected ? 'checked' : ''} data-flash-action="toggle-product" data-schedule-id="${esc(scheduleId)}" data-product-key="${esc(key)}">
          <span>
            <b>${esc(text(row.product_name, 'Sản phẩm'))}</b>
            <small>${esc(text(row.seller_sku || row.sku_id || row.item_id))}</small>
          </span>
          <em>${money(row.original_price)}</em>
          <input type="number" min="0" step="1000" value="${esc(saved.flash_price)}" data-flash-action="price" data-schedule-id="${esc(scheduleId)}" data-product-key="${esc(key)}" aria-label="Giá Flash Sale">
          <input type="number" min="0" step="1" value="${esc(saved.quantity)}" data-flash-action="quantity" data-schedule-id="${esc(scheduleId)}" data-product-key="${esc(key)}" aria-label="Số lượng">
        </label>
      `
    }).join('')
  }

  function renderProductPicker(scheduleId) {
    if (!state.flashAuto.productPickerOpen || state.flashAuto.productPickerScheduleId !== scheduleId) return ''
    const items = state.moduleData['shopee-flash']?.items || []
    const body = state.moduleData['shopee-flash']
      ? renderPickerItems(items, scheduleId, new Set(selectedForSchedule(scheduleId).map(productKey)))
      : '<div class="promo-state empty"><b>Đang tải sản phẩm...</b><span>Danh sách sẽ hiện ngay bên dưới khung giờ sau khi dữ liệu sàn tải xong.</span></div>'
    const alreadySelected = new Set(selectedForSchedule(scheduleId).map(productKey))
    return `
      <div class="promo-product-picker" data-schedule-id="${esc(scheduleId)}">
        <div class="promo-picker-head">
          <div>
            <b>Chọn sản phẩm Flash Sale</b>
            <span>Chọn SKU, nhập giá và số lượng ngay trong dòng.</span>
          </div>
          <button class="promo-icon-btn" type="button" data-flash-action="close-picker" aria-label="Đóng">×</button>
        </div>
        <input class="promo-picker-search" type="search" autocomplete="off" aria-label="Tìm sản phẩm hoặc SKU" data-flash-action="filter" data-schedule-id="${esc(scheduleId)}">
        <div class="promo-picker-list">${body || renderPickerItems(items, scheduleId, alreadySelected)}</div>
      </div>
    `
  }

  async function checkFlashTimeSlot(scheduleId) {
    const schedule = state.flashAuto.schedules.find(item => item.id === scheduleId)
    if (!schedule) return
    const data = await Promo.api.fetchFlashSaleTimeSlots(schedule)
    const slots = Array.isArray(data.slots) ? data.slots : []
    const start = Number(data.start_time || 0)
    const end = Number(data.end_time || 0)
    const exact = slots.find(slot => Number(slot.start_time) === start && Number(slot.end_time) === end) || slots[0]
    state.flashAuto.schedules = state.flashAuto.schedules.map(item => {
      if (item.id !== scheduleId) return item
      return {
        ...item,
        timeslot_id: exact?.timeslot_id || '',
        platform_start_time: exact?.start_time || '',
        platform_end_time: exact?.end_time || '',
        slot_status: exact?.timeslot_id ? 'Đã khớp khung giờ sàn' : 'Chưa có khung giờ sàn phù hợp',
        slot_options: slots
      }
    })
    refreshFlashSaleView()
  }

  function filterProductPicker(query, scheduleId) {
    const host = document.querySelector(`.promo-product-picker[data-schedule-id="${CSS.escape(scheduleId)}"] .promo-picker-list`)
    if (!host) return
    const items = state.moduleData['shopee-flash']?.items || []
    const alreadySelected = new Set(selectedForSchedule(scheduleId).map(productKey))
    host.innerHTML = renderPickerItems(items, scheduleId, alreadySelected, query)
  }

  function togglePickerProduct(scheduleId, sourceRow, checked) {
    const key = productKey(sourceRow)
    if (!key) return
    if (!checked) {
      state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.filter(item => !(item.schedule_id === scheduleId && productKey(item) === key))
      return
    }
    const exists = state.flashAuto.selectedProducts.some(item => item.schedule_id === scheduleId && productKey(item) === key)
    if (!exists) state.flashAuto.selectedProducts.push(normalizeProduct(sourceRow, scheduleId))
  }

  function updatePickerProductPrice(scheduleId, sourceRow, key, value) {
    togglePickerProduct(scheduleId, sourceRow, true)
    const productId = productKey(sourceRow)
    state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.map(item => {
      if (item.schedule_id !== scheduleId || productKey(item) !== productId) return item
      return { ...item, [key]: value }
    })
  }

  function removeSelectedProduct(scheduleId, sku) {
    state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.filter(item => !(item.schedule_id === scheduleId && productKey(item) === sku))
    refreshFlashSaleView()
  }

  function editFlashProduct(scheduleId, sku) {
    state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.map(item => item.schedule_id === scheduleId && productKey(item) === sku ? { ...item, editing: true } : item)
    refreshFlashSaleView()
  }

  function applyFlashProductEdit(scheduleId, sku) {
    state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.map(item => item.schedule_id === scheduleId && productKey(item) === sku ? { ...item, editing: false, status: 'Đã cập nhật trong luật' } : item)
    refreshFlashSaleView()
  }

  function pauseFlashProduct(scheduleId, sku) {
    state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.map(item => item.schedule_id === scheduleId && productKey(item) === sku ? { ...item, status: 'Tạm dừng trong luật' } : item)
    refreshFlashSaleView()
  }

  function renderSelectedGroup(schedule) {
    const rows = selectedForSchedule(schedule.id)
    if (!rows.length) return '<p class="promo-note">Chưa chọn sản phẩm cho khung giờ này.</p>'
    return `
      <div class="promo-selected-group">
        <div class="promo-selected-title"><b>${esc(scheduleLabel(schedule))}</b><span>${numText(rows.length)} sản phẩm</span></div>
        ${rows.map(row => {
          const sku = productKey(row)
          return `
            <article class="promo-selected-product">
              <div>
                <b>${esc(text(row.product_name, 'Sản phẩm'))}</b>
                <span>${esc(text(row.seller_sku || sku))}</span>
              </div>
              <span>Giá gốc <b>${money(row.original_price)}</b></span>
              <label>Giá Flash Sale <input type="number" min="0" step="1000" value="${esc(row.flash_price)}" data-flash-action="selected-price" data-schedule-id="${esc(schedule.id)}" data-sku="${esc(sku)}"></label>
              <label>Số lượng <input type="number" min="0" step="1" value="${esc(row.quantity)}" data-flash-action="selected-quantity" data-schedule-id="${esc(schedule.id)}" data-sku="${esc(sku)}"></label>
              <em class="promo-pill ${row.status === 'Tạm dừng trong luật' ? 'watch' : 'neutral'}">${esc(text(row.status, 'Chờ lưu luật'))}</em>
              <div class="promo-row-actions compact">
                ${row.editing ? `<button class="promo-btn primary" type="button" data-flash-action="apply-edit" data-schedule-id="${esc(schedule.id)}" data-sku="${esc(sku)}">Lưu dòng</button>` : `<button class="promo-btn secondary" type="button" data-flash-action="edit-product" data-schedule-id="${esc(schedule.id)}" data-sku="${esc(sku)}">Sửa</button>`}
                <button class="promo-btn warning" type="button" data-flash-action="pause-product" data-schedule-id="${esc(schedule.id)}" data-sku="${esc(sku)}">Tạm dừng</button>
                <button class="promo-btn danger" type="button" data-flash-action="remove-product" data-schedule-id="${esc(schedule.id)}" data-sku="${esc(sku)}">Xóa khỏi Flash Sale</button>
              </div>
            </article>
          `
        }).join('')}
      </div>
    `
  }

  function renderSchedule(schedule) {
    const shopSelected = Boolean(activeShop())
    const slotTone = schedule.timeslot_id ? 'good' : schedule.slot_status ? 'watch' : 'neutral'
    return `
      <article class="promo-flash-schedule" data-schedule-id="${esc(schedule.id)}">
        <div class="promo-schedule-fields">
          <label>Ngày <input type="date" value="${esc(schedule.date || todayText())}" data-flash-action="schedule-field" data-key="date" data-id="${esc(schedule.id)}"></label>
          <label>Từ giờ <input type="time" value="${esc(schedule.from || '20:00')}" data-flash-action="schedule-field" data-key="from" data-id="${esc(schedule.id)}"></label>
          <label>Đến giờ <input type="time" value="${esc(schedule.to || '22:00')}" data-flash-action="schedule-field" data-key="to" data-id="${esc(schedule.id)}"></label>
          <button class="promo-switch ${schedule.enabled === false ? '' : 'on'}" type="button" data-flash-action="toggle-schedule" data-id="${esc(schedule.id)}"><i></i><b>${schedule.enabled === false ? 'Tắt' : 'Bật'}</b></button>
          <button class="promo-btn danger" type="button" data-flash-action="remove-schedule" data-id="${esc(schedule.id)}">Xóa</button>
        </div>
        <div class="promo-schedule-meta">
          <span class="promo-pill ${slotTone}">${esc(schedule.timeslot_id ? `Khung giờ sàn #${schedule.timeslot_id}` : schedule.slot_status || 'Chưa kiểm khung giờ sàn')}</span>
          <button class="promo-btn secondary" type="button" data-flash-action="check-timeslot" data-id="${esc(schedule.id)}" ${shopSelected ? '' : 'disabled'}>Kiểm tra khung giờ sàn</button>
          <button class="promo-btn secondary" type="button" data-flash-action="open-picker" data-id="${esc(schedule.id)}" ${shopSelected ? '' : 'disabled'}>+ Thêm sản phẩm</button>
        </div>
        ${renderProductPicker(schedule.id)}
        ${renderSelectedGroup(schedule)}
      </article>
    `
  }

  function renderFlashAutomation() {
    const flash = state.flashAuto
    const shop = activeShop()
    const shopBlock = shop ? '' : `
      <div class="promo-state warning">
        <b>Chọn shop trước khi set Flash Sale</b>
        <span>Mỗi shop có item/model/SKU và khung giờ sàn riêng. Luật Flash Sale không chạy cho "Tất cả shop".</span>
      </div>
    `
    return `
      <section class="promo-panel promo-flash-auto">
        <div class="promo-panel-title">
          <div>
            <b>Luật tự động Flash Sale</b>
            <span>${shop ? `Luật đang set cho shop ${esc(shop)}.` : 'Chọn shop ở bộ lọc phía trên trước khi set luật.'}</span>
          </div>
          <span class="promo-pill ${flash.enabled && !flash.emergency_stop ? 'good' : flash.emergency_stop ? 'bad' : 'neutral'}">${flash.emergency_stop ? 'Tắt khẩn cấp' : flash.enabled ? 'Đang bật' : 'Đang tắt'}</span>
        </div>
        ${shopBlock}
        <div class="promo-flash-controls">
          <button class="promo-switch ${flash.enabled ? 'on' : ''}" type="button" data-flash-action="toggle-auto" ${shop ? '' : 'disabled'}><i></i><b>${flash.enabled ? 'Bật' : 'Tắt'}</b></button>
          <label>Tồn tối thiểu <input type="number" min="0" step="1" value="${esc(flash.min_stock)}" data-flash-action="auto-field" data-key="min_stock"></label>
          <label class="promo-check"><input type="checkbox" ${flash.block_below_cost ? 'checked' : ''} data-flash-action="cost-guard"> Chặn giá dưới vốn</label>
          <button class="promo-btn secondary" type="button" data-flash-action="add-schedule" ${shop ? '' : 'disabled'}>Thêm khung giờ</button>
          <button class="promo-btn primary" type="button" data-flash-action="save" ${shop ? '' : 'disabled'}>Lưu luật</button>
          <button class="promo-btn secondary" type="button" data-flash-action="run-now" ${shop ? '' : 'disabled'}>Chạy ngay</button>
          <button class="promo-btn danger" type="button" data-flash-action="emergency-stop" ${shop ? '' : 'disabled'}>Tắt khẩn cấp</button>
        </div>
        <div class="promo-flash-schedules">
          ${flash.schedules.map(renderSchedule).join('')}
        </div>
        <div class="promo-flash-log">
          <b>Nhật ký Flash Sale tự động</b>
          <span>${state.lastSync?.module === 'shopee-flash' ? esc(state.lastSync.message) : 'Chưa có lượt chạy mới trong phiên này.'}</span>
        </div>
      </section>
    `
  }

  function refreshFlashSaleView() {
    if (state.activeModule === 'shopee-flash' && Promo.render) {
      const scrollY = window.scrollY
      Promo.render.renderModuleDetail('shopee-flash')
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0 }))
    }
  }

  window.SHV_PROMO_FLASH = {
    addFlashSchedule,
    updateFlashSchedule,
    toggleFlashSchedule,
    removeFlashSchedule,
    openProductPicker,
    closeProductPicker,
    renderProductPicker,
    renderPickerItems,
    filterProductPicker,
    checkFlashTimeSlot,
    togglePickerProduct,
    updatePickerProductPrice,
    removeSelectedProduct,
    editFlashProduct,
    applyFlashProductEdit,
    pauseFlashProduct,
    renderFlashAutomation,
    refreshFlashSaleView,
    productKey
  }
}
