{
  const Promo = window.SHV_PROMO
  const { state, API_BASE, moduleByKey, filters, userMessage, isVerifiedResult, activeShop } = Promo

  async function apiGet(path) {
    const response = await fetch(API_BASE + path)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(userMessage(data.message || data.error || `Không tải được dữ liệu (${response.status})`))
    return data
  }

  async function apiPost(path, bodyData = {}) {
    let response
    try {
      response = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      })
    } catch (error) {
      throw new Error('Chưa kết nối được hệ thống khuyến mãi. Vui lòng thử lại sau vài giây.')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(userMessage(data.message || data.error || `Thao tác chưa chạy được (${response.status})`))
    return data
  }

  function moduleReadPath(mod, statusOverride = '') {
    const current = filters()
    const params = new URLSearchParams()
    params.set('platform', mod.platform)
    params.set('module', mod.module)
    params.set('status', statusOverride || current.status || 'not_expired')
    params.set('limit', '120')
    if (current.shop) params.set('shop', current.shop)
    return `/api/discounts/promotion-module-read-model?${params.toString()}`
  }

  async function loadDashboard() {
    const current = filters()
    const params = new URLSearchParams()
    params.set('limit', '80')
    if (current.shop) params.set('shop', current.shop)
    state.core = await apiGet(`/api/discounts/core?${params.toString()}`)
    Promo.setLastUpdated()
    return state.core
  }

  async function fetchPromotionModule(key = state.activeModule, statusOverride = '') {
    const mod = moduleByKey(key)
    const data = await apiGet(moduleReadPath(mod, statusOverride))
    state.moduleData[mod.key] = data
    if (mod.key === 'shopee-flash' && !data.items?.length) {
      await hydrateFlashPickerCandidates()
    }
    return data
  }

  async function hydrateFlashPickerCandidates() {
    const discountMod = moduleByKey('shopee-discount')
    const source = state.moduleData['shopee-discount']?.items?.length
      ? state.moduleData['shopee-discount']
      : await apiGet(moduleReadPath(discountMod))
    const candidates = (source.items || []).map(row => ({
      ...row,
      promotion_type: 'shop_flash_sale',
      flash_picker_candidate: true,
      candidate_source: 'promotion_core_shopee_discount_items'
    }))
    // Dùng ứng viên từ Promotion Core để người vận hành chọn SKU, không ghi lên sàn nếu backend chưa verify.
    state.moduleData['shopee-flash'] = {
      ...(state.moduleData['shopee-flash'] || {}),
      items: candidates,
      flash_picker_candidates: true
    }
  }

  async function fetchAllModules() {
    const modules = await Promise.all(Promo.MODULES.map(mod => fetchPromotionModule(mod.key).catch(error => ({ key: mod.key, error: error.message }))))
    return modules
  }

  function syncPath(mod) {
    if (mod.kind === 'discount') return '/api/discounts/shopee/sync'
    if (mod.kind === 'voucher') return mod.platform === 'lazada' ? '/api/discounts/lazada/vouchers/sync' : '/api/discounts/shopee/vouchers/sync'
    return mod.platform === 'lazada' ? '/api/discounts/lazada/promotions/sync' : '/api/discounts/shopee/promotions/sync'
  }

  async function syncPromotionModule(key = state.activeModule) {
    const mod = moduleByKey(key)
    const current = filters()
    const syncStatus = current.status === 'not_expired' ? 'ongoing' : current.status
    const result = await apiPost(syncPath(mod), {
      shop: current.shop,
      module: mod.module,
      status: syncStatus,
      include_detail: 0,
      include_products: 0,
      include_regions: 0,
      page_limit: 1,
      detail_limit: 0,
      item_limit: 0,
      product_page_limit: 0,
      product_page_size: 0,
      shop_limit: current.shop ? 1 : 1,
      incremental: 1
    })
    state.lastSync = { module: mod.key, at: new Date().toISOString(), message: result.message || `Đã đồng bộ ${mod.name}` }
    await loadDashboard().catch(() => null)
    await fetchPromotionModule(mod.key)
    return result
  }

  async function loadAutomationSettings() {
    const shop = filters().shop || state.flashAuto.shop || ''
    const params = new URLSearchParams()
    if (shop) params.set('shop', shop)
    const data = await apiGet(`/api/discounts/automation/settings${params.toString() ? `?${params.toString()}` : ''}`)
    const settings = data.settings || {}
    if (settings.flash_auto) {
      const savedProducts = settings.flash_auto.selectedProducts || settings.flash_auto.products || []
      state.flashAuto = {
        ...state.flashAuto,
        ...settings.flash_auto,
        shop: settings.flash_auto.shop || shop || '',
        schedules: Array.isArray(settings.flash_auto.schedules) && settings.flash_auto.schedules.length ? settings.flash_auto.schedules : state.flashAuto.schedules,
        selectedProducts: Array.isArray(savedProducts) ? savedProducts : [],
        productPickerOpen: false,
        productPickerScheduleId: null
      }
    }
    if (settings.cleanup) state.cleanup = { ...state.cleanup, ...settings.cleanup }
    return data
  }

  function promotionAutomationPayload() {
    const shop = activeShop()
    return {
      flash_auto: {
        ...state.flashAuto,
        shop,
        schedules: [...state.flashAuto.schedules],
        selectedProducts: [...state.flashAuto.selectedProducts],
        productPickerOpen: false,
        productPickerScheduleId: null
      },
      cleanup: { ...state.cleanup }
    }
  }

  async function saveFlashAutoSettings() {
    if (!activeShop()) throw new Error('Chọn shop trước khi lưu luật Flash Sale để tránh áp dụng nhầm sản phẩm giữa các shop.')
    const data = await apiPost('/api/discounts/automation/settings', { settings: promotionAutomationPayload() })
    await loadAutomationSettings().catch(() => null)
    return data
  }

  async function runFlashAutoCheck() {
    if (!activeShop()) throw new Error('Chọn shop trước khi chạy Flash Sale tự động.')
    const data = await apiPost('/api/discounts/automation/run-now', { settings: promotionAutomationPayload() })
    await loadAutomationSettings().catch(() => null)
    return data
  }

  function programPayload(row = {}) {
    return {
      platform: row.platform || '',
      module: row.promotion_type || row.module || '',
      shop: row.shop || '',
      promotion_id: row.promotion_id || row.program_id || row.discount_id || row.voucher_id || '',
      program_id: row.program_id || row.promotion_id || '',
      status: row.status || '',
      status_label: row.status_label || ''
    }
  }

  async function applyPromotionProgramWrite(row, action = 'update') {
    const payload = programPayload(row)
    if (payload.platform !== 'shopee' || !payload.shop || !payload.promotion_id) {
      throw new Error('Chương trình này chưa đủ điều kiện ghi tự động.')
    }
    const result = await apiPost('/api/discounts/shopee/promotion-action', {
      module: payload.module,
      action,
      shop: payload.shop,
      execute: true,
      confirm: 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_SHOPEE',
      use_cached_payload: true,
      payload: {
        program_id: payload.promotion_id,
        promotion_id: payload.promotion_id
      }
    })
    if (!isVerifiedResult(result)) throw new Error(result.message || 'Sàn chưa xác nhận thay đổi, không xem là thành công.')
    await fetchPromotionModule(state.activeModule)
    return result
  }

  async function liveWritePromotionCurrentPrice(row = {}) {
    const price = Number(row.promotion_price)
    if (!row.shop || !row.promotion_id || !row.item_id || !Number.isFinite(price) || price <= 0) {
      throw new Error('Dòng này chưa đủ dữ liệu để áp dụng tự động.')
    }
    const item = { item_id: Number(row.item_id) }
    if (row.model_id) item.model_list = [{ model_id: Number(row.model_id), model_promotion_price: price }]
    else item.item_promotion_price = price
    const result = await apiPost('/api/discounts/shopee/action', {
      shop: row.shop,
      action: 'update_discount_item',
      execute: true,
      confirm: 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_SHOPEE',
      payload: {
        discount_id: Number(row.promotion_id),
        item_list: [item]
      }
    })
    if (!isVerifiedResult(result)) throw new Error(result.message || 'Sàn chưa xác nhận thay đổi, không xem là thành công.')
    await fetchPromotionModule('shopee-discount')
    return result
  }

  async function cleanupPromotionAction(row = {}, action = 'hide') {
    const payload = programPayload(row)
    if (action === 'hide' || action === 'restore') {
      return { status: 'local_only', verified: false, local_delete: false, message: 'Chỉ ẩn khỏi danh sách vận hành, không xóa lịch sử dữ liệu.' }
    }
    const confirmValue = payload.platform === 'lazada' ? 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_LAZADA' : 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_SHOPEE'
    const result = await apiPost('/api/discounts/cleanup/action', {
      ...payload,
      action,
      execute: true,
      confirm: confirmValue
    })
    if (!isVerifiedResult(result)) throw new Error(result.message || 'Sàn chưa xác nhận thao tác, không xem là thành công.')
    await fetchPromotionModule(state.activeModule).catch(() => null)
    return result
  }

  async function fetchSkuDetail(row = {}) {
    const mod = moduleByKey(state.activeModule)
    const params = new URLSearchParams()
    params.set('platform', mod.platform)
    params.set('module', mod.module)
    if (row.shop) params.set('shop', row.shop)
    if (row.promotion_id) params.set('program_id', row.promotion_id)
    if (row.item_id) params.set('item_id', row.item_id)
    if (row.model_id) params.set('model_id', row.model_id)
    if (row.sku_id) params.set('sku_id', row.sku_id)
    params.set('days', '14')
    return apiGet(`/api/discounts/promotion-sku-detail?${params.toString()}`)
  }

  function scheduleUnix(schedule = {}) {
    if (!schedule.date || !schedule.from || !schedule.to) return {}
    const start = Math.floor(new Date(`${schedule.date}T${schedule.from}`).getTime() / 1000)
    const end = Math.floor(new Date(`${schedule.date}T${schedule.to}`).getTime() / 1000)
    return Number.isFinite(start) && Number.isFinite(end) ? { start_time: start, end_time: end } : {}
  }

  async function fetchFlashSaleTimeSlots(schedule = {}) {
    const shop = activeShop()
    if (!shop) throw new Error('Chọn shop trước khi kiểm tra khung giờ Flash Sale.')
    const range = scheduleUnix(schedule)
    if (!range.start_time || !range.end_time || range.end_time <= range.start_time) throw new Error('Khung giờ chưa hợp lệ.')
    const params = new URLSearchParams({ shop, start_time: String(range.start_time), end_time: String(range.end_time) })
    return apiGet(`/api/discounts/shopee/flash-sale/time-slots?${params.toString()}`)
  }

  Promo.api = {
    apiGet,
    apiPost,
    loadDashboard,
    fetchPromotionModule,
    fetchAllModules,
    syncPromotionModule,
    loadAutomationSettings,
    saveFlashAutoSettings,
    runFlashAutoCheck,
    promotionAutomationPayload,
    fetchFlashSaleTimeSlots,
    applyPromotionProgramWrite,
    liveWritePromotionCurrentPrice,
    cleanupPromotionAction,
    fetchSkuDetail
  }
}
