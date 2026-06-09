{
  const Promo = window.SHV_PROMO
  const { state, el, moduleByKey, toast, userMessage, isVerifiedResult } = Promo
  const stateLabels = ['Chưa có dữ liệu', 'Đang tải', 'Lỗi']

  function currentItems(key = state.activeModule) {
    const mod = moduleByKey(key)
    const rows = state.moduleData[mod.key]?.items || []
    return rows.filter(row => Promo.matchesSearch(row))
  }

  function currentPrograms(key = state.activeModule) {
    const mod = moduleByKey(key)
    const rows = state.moduleData[mod.key]?.programs || []
    return rows.filter(row => Promo.matchesSearch(row))
  }

  async function refreshAll() {
    Promo.render.renderLoading()
    await Promo.api.loadAutomationSettings().catch(() => null)
    await Promo.api.loadDashboard()
    await Promo.api.fetchAllModules()
    Promo.render.renderAll()
  }

  async function loadPromotionModule(key = state.activeModule) {
    state.activeModule = key
    state.view = 'module'
    Promo.render.renderModuleDetail(key)
    await Promo.api.fetchPromotionModule(key)
    Promo.render.renderOverview()
    Promo.render.renderModuleCards()
    Promo.render.renderModuleDetail(key)
  }

  async function syncPromotionModule(key = state.activeModule) {
    const mod = moduleByKey(key)
    toast(`Đang đồng bộ ${mod.name}...`, 'ok')
    const result = await Promo.api.syncPromotionModule(key)
    toast(result.message || `Đã đồng bộ ${mod.name}`, 'ok')
    Promo.render.renderAll()
  }

  async function previewPromotionAction(key, promotionId) {
    const mod = moduleByKey(key)
    const row = currentPrograms(key).find(item => String(item.promotion_id) === String(promotionId))
    if (!row?.shop || mod.platform !== 'shopee') {
      toast(`${mod.name}: chưa thể tự áp dụng trên sàn.`, 'bad')
      return
    }
    const result = await Promo.api.apiPost('/api/discounts/shopee/promotion-action', {
      module: row.promotion_type || mod.module,
      action: 'update',
      shop: row.shop,
      execute: false,
      use_cached_payload: true,
      payload: {
        program_id: promotionId,
        promotion_id: promotionId
      }
    })
    toast(result.message || 'Đã xem trước thao tác, chưa gửi lên sàn.', result.status === 'error' ? 'bad' : 'ok')
  }

  async function applyPromotionProgramWrite(key, promotionId) {
    const row = currentPrograms(key).find(item => String(item.promotion_id) === String(promotionId))
    if (!row) {
      toast('Chưa tìm thấy chương trình cần áp dụng.', 'bad')
      return
    }
    const result = await Promo.api.applyPromotionProgramWrite(row, 'update')
    toast(result.message || 'Sàn đã xác nhận thao tác.', 'ok')
    Promo.render.renderAll()
  }

  async function liveWritePromotionCurrentPrice(key, index) {
    const row = currentItems(key)[Number(index)]
    if (!row) {
      toast('Chưa tìm thấy SKU cần áp dụng.', 'bad')
      return
    }
    const result = await Promo.api.liveWritePromotionCurrentPrice(row)
    toast(result.message || 'Sàn đã xác nhận giá hiện tại.', 'ok')
    Promo.render.renderAll()
  }

  async function lazadaDeactivateProgram(row) {
    const result = await Promo.api.cleanupPromotionAction(row, 'deactivate')
    if (!isVerifiedResult(result)) throw new Error(result.message || 'Lazada chưa xác nhận thao tác.')
    return result
  }

  async function cleanupPromotionAction(action, index) {
    const row = state.cleanup.visibleRows[Number(index)]
    if (!row) {
      toast('Chưa chọn được chương trình cần dọn.', 'bad')
      return
    }
    const result = row.platform === 'lazada' && action === 'deactivate'
      ? await lazadaDeactivateProgram(row)
      : await Promo.api.cleanupPromotionAction(row, action)
    toast(result.message || (result.local_delete === false ? 'Không xóa dữ liệu nội bộ.' : 'Đã ghi nhận thao tác.'), result.verified ? 'ok' : 'bad')
    await window.SHV_PROMO_CLEANUP.showPromotionCleanup()
  }

  function updateSelectedProduct(scheduleId, sku, key, value) {
    state.flashAuto.selectedProducts = state.flashAuto.selectedProducts.map(item => {
      if (item.schedule_id !== scheduleId || window.SHV_PROMO_FLASH.productKey(item) !== sku) return item
      return { ...item, [key]: value }
    })
  }

  async function handlePromoClick(event) {
    const target = event.target.closest('[data-promo-action]')
    if (!target) return
    const action = target.dataset.promoAction
    const key = target.dataset.key || state.activeModule
    try {
      if (action === 'reload') await refreshAll()
      if (action === 'switch-platform-tab') {
        state.activePlatformTab = target.dataset.platform
        Promo.render.renderModuleCards()
      }
      if (action === 'switch-overview-module') {
        state.activeModule = target.dataset.key || state.activeModule
        Promo.render.renderModuleCards()
      }
      if (action === 'open-module') await loadPromotionModule(key)
      if (action === 'reload-module') await loadPromotionModule(key)
      if (action === 'sync-module') await syncPromotionModule(key)
      if (action === 'preview-program') await previewPromotionAction(key, target.dataset.id)
      if (action === 'apply-program') await applyPromotionProgramWrite(key, target.dataset.id)
      if (action === 'apply-price') await liveWritePromotionCurrentPrice(key, target.dataset.index)
      if (action === 'open-sku') Promo.render.openSkuDrawer(currentItems(key)[Number(target.dataset.index)] || {})
      if (action === 'close-drawer') Promo.render.closeSkuDrawer()
      if (action === 'reload-cleanup') await window.SHV_PROMO_CLEANUP.showPromotionCleanup()
    } catch (error) {
      toast(userMessage(error.message), 'bad')
    }
  }

  async function handleFlashClick(event) {
    const target = event.target.closest('[data-flash-action]')
    if (!target) return
    const flash = window.SHV_PROMO_FLASH
    const action = target.dataset.flashAction
    const scheduleId = target.dataset.scheduleId || target.dataset.id
    const items = state.moduleData['shopee-flash']?.items || []
    const source = items.find(item => flash.productKey(item) === target.dataset.productKey) || items[Number(target.dataset.index)] || {}
    try {
      if (action === 'toggle-auto') {
        state.flashAuto.enabled = !state.flashAuto.enabled
        if (state.flashAuto.enabled) state.flashAuto.emergency_stop = false
        flash.refreshFlashSaleView()
      }
      if (action === 'add-schedule') flash.addFlashSchedule()
      if (action === 'toggle-schedule') flash.toggleFlashSchedule(target.dataset.id)
      if (action === 'remove-schedule') flash.removeFlashSchedule(target.dataset.id)
      if (action === 'open-picker') await flash.openProductPicker(target.dataset.id)
      if (action === 'check-timeslot') await flash.checkFlashTimeSlot(target.dataset.id)
      if (action === 'close-picker') {
        flash.closeProductPicker()
        flash.refreshFlashSaleView()
      }
      if (action === 'toggle-product') {
        flash.togglePickerProduct(scheduleId, source, target.checked)
        flash.refreshFlashSaleView()
      }
      if (action === 'edit-product') flash.editFlashProduct(scheduleId, target.dataset.sku)
      if (action === 'apply-edit') flash.applyFlashProductEdit(scheduleId, target.dataset.sku)
      if (action === 'pause-product') flash.pauseFlashProduct(scheduleId, target.dataset.sku)
      if (action === 'remove-product') flash.removeSelectedProduct(scheduleId, target.dataset.sku)
      if (action === 'save') {
        const result = await Promo.api.saveFlashAutoSettings()
        toast(result.message || 'Đã lưu luật Flash Sale tự động.', 'ok')
        flash.refreshFlashSaleView()
      }
      if (action === 'run-now') {
        const MAX_ATTEMPTS = 6
        const DELAY_MS = 4000
        let attempt = 0
        let lastResult = null

        const FlashAuto = window.FlashAuto
        const saveSettings = FlashAuto?.api?.saveSettings || Promo.api.saveFlashAutoSettings
        const runCheck = FlashAuto?.api?.runCheck || Promo.api.runFlashAutoCheck
        const refreshHistoryTab = FlashAuto?.refreshHistoryTab || (() => Promise.resolve())
        const mapMessage = FlashAuto?.userMessage || userMessage

        await saveSettings()
        toast('Đang khởi động Flash Sale tự động...', 'ok')
        refreshHistoryTab()

        const pollLiveWrite = async () => {
          attempt++
          toast(`Lần thử ${attempt}/${MAX_ATTEMPTS} - đang gọi sàn...`, 'ok')
          lastResult = await runCheck()

          const ok = lastResult.live_write_sent === true && lastResult.verified === true
          if (ok) {
            toast('Sàn đã xác nhận live write Flash Sale thành công.', 'ok')
            await refreshHistoryTab()
            flash.refreshFlashSaleView()
            return
          }

          const hardError = /không cho phép|no permission|blocked|invalid|expired|kết thúc/i
            .test(lastResult.message || '')
          if (hardError) {
            toast(mapMessage(lastResult.message) || 'Sàn từ chối, dừng lại.', 'bad')
            await refreshHistoryTab()
            flash.refreshFlashSaleView()
            return
          }

          if (attempt < MAX_ATTEMPTS) {
            setTimeout(() => pollLiveWrite().catch(e => toast(mapMessage(e.message), 'bad')), DELAY_MS)
          } else {
            toast(mapMessage(lastResult?.message) || `Đã thử ${MAX_ATTEMPTS} lần, sàn chưa xác nhận.`, 'bad')
            await refreshHistoryTab()
            flash.refreshFlashSaleView()
          }
        }

        await pollLiveWrite()
      }
      if (action === 'emergency-stop') {
        state.flashAuto.enabled = false
        state.flashAuto.emergency_stop = true
        await Promo.api.saveFlashAutoSettings()
        toast('Đã tắt khẩn cấp Flash Sale tự động.', 'bad')
        flash.refreshFlashSaleView()
      }
    } catch (error) {
      toast(userMessage(error.message), 'bad')
    }
  }

  function handleInput(event) {
    const target = event.target
    if (target.id === 'promotionSearch') {
      if (state.view === 'cleanup') window.SHV_PROMO_CLEANUP.renderCleanup()
      else Promo.render.renderModuleDetail(state.activeModule)
      Promo.render.renderModuleCards()
    }
    if (target.dataset.flashAction === 'filter') window.SHV_PROMO_FLASH.filterProductPicker(target.value, target.dataset.scheduleId)
    if (target.dataset.flashAction === 'price') {
      const source = (state.moduleData['shopee-flash']?.items || []).find(item => window.SHV_PROMO_FLASH.productKey(item) === target.dataset.productKey) || {}
      window.SHV_PROMO_FLASH.updatePickerProductPrice(target.dataset.scheduleId, source, 'flash_price', target.value)
    }
    if (target.dataset.flashAction === 'quantity') {
      const source = (state.moduleData['shopee-flash']?.items || []).find(item => window.SHV_PROMO_FLASH.productKey(item) === target.dataset.productKey) || {}
      window.SHV_PROMO_FLASH.updatePickerProductPrice(target.dataset.scheduleId, source, 'quantity', target.value)
    }
    if (target.dataset.flashAction === 'selected-price') updateSelectedProduct(target.dataset.scheduleId, target.dataset.sku, 'flash_price', target.value)
    if (target.dataset.flashAction === 'selected-quantity') updateSelectedProduct(target.dataset.scheduleId, target.dataset.sku, 'quantity', target.value)
    if (target.dataset.flashAction === 'auto-field') {
      state.flashAuto[target.dataset.key] = target.value
    }
    if (target.dataset.flashAction === 'schedule-field') window.SHV_PROMO_FLASH.updateFlashSchedule(target.dataset.id, target.dataset.key, target.value)
  }

  async function handleChange(event) {
    const target = event.target
    if (['promotionFrom', 'promotionTo', 'promotionStatus'].includes(target.id)) {
      await loadPromotionModule(state.activeModule).catch(error => toast(error.message, 'bad'))
    }
    if (target.id === 'promotionPlatform') {
      const next = Promo.MODULES.find(mod => mod.platform === target.value)
      if (next) await loadPromotionModule(next.key).catch(error => toast(error.message, 'bad'))
      else Promo.render.renderAll()
    }
    if (target.id === 'promotionShop') {
      await refreshAll().catch(error => toast(error.message, 'bad'))
    }
    if (target.dataset.cleanupFilter) {
      const value = target.type === 'checkbox' ? target.checked : target.value
      window.SHV_PROMO_CLEANUP.updateCleanupFilter(target.dataset.cleanupFilter, value)
    }
    if (target.dataset.flashAction === 'cost-guard') {
      state.flashAuto.block_below_cost = target.checked
      window.SHV_PROMO_FLASH.refreshFlashSaleView()
    }
  }

  function wireHeaderButtons() {
    el('promotionRefreshBtn')?.addEventListener('click', () => refreshAll().catch(error => toast(error.message, 'bad')))
    el('promotionSyncBtn')?.addEventListener('click', () => syncPromotionModule(state.activeModule).catch(error => toast(error.message, 'bad')))
  }

  async function initPromotionsPage() {
    Promo.initDates()
    wireHeaderButtons()
    document.addEventListener('click', event => {
      if (event.target.closest('#promotionCleanupBtn')) window.SHV_PROMO_CLEANUP.showPromotionCleanup().catch(error => toast(error.message, 'bad'))
      handlePromoClick(event)
      handleFlashClick(event)
      const cleanupTarget = event.target.closest('[data-cleanup-action]')
      if (cleanupTarget) cleanupPromotionAction(cleanupTarget.dataset.cleanupAction, cleanupTarget.dataset.index).catch(error => toast(error.message, 'bad'))
    })
    document.addEventListener('input', handleInput)
    document.addEventListener('change', event => {
      handleChange(event).catch(error => toast(error.message, 'bad'))
    })
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') Promo.render.closeSkuDrawer()
    })
    await refreshAll()
  }

  Promo.actions = {
    refreshAll,
    loadPromotionModule,
    syncPromotionModule,
    previewPromotionAction,
    applyPromotionProgramWrite,
    liveWritePromotionCurrentPrice,
    cleanupPromotionAction,
    lazadaDeactivateProgram,
    initPromotionsPage
  }

  window.loadPromotionDashboard = refreshAll
  window.loadPromotionModule = loadPromotionModule
  window.syncPromotionModule = syncPromotionModule

  document.addEventListener('DOMContentLoaded', () => {
    initPromotionsPage().catch(error => toast(userMessage(error.message), 'bad'))
  })
}
