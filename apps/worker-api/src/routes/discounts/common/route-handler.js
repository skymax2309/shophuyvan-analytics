export function installDiscountsCommonRouteHandler(core) {
  const analyzeShopeeDiscounts = (...args) => core.analyzeShopeeDiscounts(...args)
  const createPromotionApplyQueue = (...args) => core.createPromotionApplyQueue(...args)
  const deletePromotionCache = (...args) => core.deletePromotionCache(...args)
  const decidePromotionApplyQueue = (...args) => core.decidePromotionApplyQueue(...args)
  const executePromotionApplyQueue = (...args) => core.executePromotionApplyQueue(...args)
  const executeShopeeDiscountAction = (...args) => core.executeShopeeDiscountAction(...args)
  const executeShopeePromotionAction = (...args) => core.executeShopeePromotionAction(...args)
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const fetchShopeeShopJsonGet = (...args) => core.fetchShopeeShopJsonGet(...args)
  const getAdminUserFromRequest = core.getAdminUserFromRequest
  const getApiShops = core.getApiShops
  const getPromotionProgramDetail = (...args) => core.getPromotionProgramDetail(...args)
  const getPromotionModuleReadModel = (...args) => core.getPromotionModuleReadModel(...args)
  const getPromotionSkuDetail = (...args) => core.getPromotionSkuDetail(...args)
  const isPromotionApplyAdmin = (...args) => core.isPromotionApplyAdmin(...args)
  const json = (...args) => core.json(...args)
  const listPromotionApplyQueue = (...args) => core.listPromotionApplyQueue(...args)
  const listPromotionPrograms = (...args) => core.listPromotionPrograms(...args)
  const listPromotionVouchers = (...args) => core.listPromotionVouchers(...args)
  const loadPromotionToolCore = core.loadPromotionToolCore
  const previewPromotionAction = (...args) => core.previewPromotionAction(...args)
  const repairPromotionItemPriceGaps = (...args) => core.repairPromotionItemPriceGaps(...args)
  const runPromotionDeepCacheBatch = (...args) => core.runPromotionDeepCacheBatch(...args)
  const saveDiscountAction = (...args) => core.saveDiscountAction(...args)
  const syncLazadaPromotionPrograms = (...args) => core.syncLazadaPromotionPrograms(...args)
  const syncLazadaVouchers = (...args) => core.syncLazadaVouchers(...args)
  const syncShopeeDiscounts = (...args) => core.syncShopeeDiscounts(...args)
  const syncShopeePromotionPrograms = (...args) => core.syncShopeePromotionPrograms(...args)
  const syncShopeeVouchers = (...args) => core.syncShopeeVouchers(...args)

  const LAZADA_CLEANUP_ENDPOINTS = {
    voucher: { endpoint: '/promotion/voucher/deactivate', detail: '/promotion/voucher/get' },
    lazada_voucher: { endpoint: '/promotion/voucher/deactivate', detail: '/promotion/voucher/get' },
    free_shipping: { endpoint: '/promotion/freeshipping/deactivate', detail: '/promotion/freeshipping/get' },
    flexicombo: { endpoint: '/promotion/flexicombo/deactivate', detail: '/promotion/flexicombo/details' }
  }

  function cleanupModule(value = '') {
    return String(value || '').trim().toLowerCase()
  }

  async function executeLazadaCleanupAction(env, options = {}) {
    const module = cleanupModule(options.module || options.promotion_type)
    const config = LAZADA_CLEANUP_ENDPOINTS[module]
    const shopName = String(options.shop || '').trim()
    const promotionId = String(options.promotion_id || options.program_id || options.id || '').trim()
    if (!config) return { status: 'error', error: 'endpoint_not_available', message: 'Chưa có endpoint Lazada chính thức cho loại chương trình này.' }
    if (!shopName || !promotionId) return { status: 'error', error: 'missing_required_fields', message: 'Thiếu shop hoặc mã chương trình.' }
    if (String(options.confirm || '') !== 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_LAZADA') {
      return { status: 'preview', endpoint: config.endpoint, sent_to_platform: false, message: 'Chưa gửi lên Lazada vì thiếu xác nhận admin hợp lệ.' }
    }
    const shops = await getApiShops(env, 'lazada', shopName, 1)
    const shop = shops?.[0]
    if (!shop) return { status: 'error', error: 'shop_not_found', message: 'Không tìm thấy shop Lazada API tương ứng.' }
    const payload = { id: promotionId }
    const response = await callLazadaWithShop(env, shop, config.endpoint, payload, true, 'POST')
    const readback = await callLazadaWithShop(env, shop, config.detail, payload).catch(error => ({ error: error?.message || String(error) }))
    const statusText = String(readback?.data?.status || readback?.status || readback?.data?.data?.status || '').toLowerCase()
    const verified = ['inactive', 'deactivated', 'disabled', 'ended', 'expired'].some(token => statusText.includes(token))
    const result = {
      status: verified ? 'ok' : 'readback_mismatch',
      platform: 'lazada',
      module,
      action: 'deactivate',
      endpoint: config.endpoint,
      detail_endpoint: config.detail,
      shop: shop.shop_name || shop.user_name || shopName,
      object_id: promotionId,
      payload,
      sent_to_platform: true,
      verified,
      raw_response: response,
      verify_result: { verified, status: statusText, readback },
      message: verified ? 'Lazada đã xác nhận chương trình đã tắt.' : 'Lazada đã nhận request nhưng đọc lại chưa khớp, không được xem là thành công.'
    }
    await saveDiscountAction(env, result)
    return result
  }

  async function handleDiscounts(request, env, cors) {
    try {
    const url = new URL(request.url)
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    async function ensurePromotionAutomationTable() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS promotion_automation_settings (
          setting_key TEXT PRIMARY KEY,
          setting_json TEXT DEFAULT '{}',
          updated_at TEXT DEFAULT ''
        )
      `).run()
    }

    function automationKeyForShop(shop = '') {
      const safeShop = String(shop || '').trim()
      return safeShop ? `flash_auto:${safeShop}` : 'default'
    }

    async function loadPromotionAutomationSettings(shop = '') {
      await ensurePromotionAutomationTable()
      const defaultRow = await env.DB.prepare('SELECT setting_json, updated_at FROM promotion_automation_settings WHERE setting_key = ?').bind('default').first()
      const defaultSettings = defaultRow?.setting_json ? JSON.parse(defaultRow.setting_json) : {}
      if (!String(shop || '').trim()) return { status: 'ok', settings: defaultSettings, updated_at: defaultRow?.updated_at || '' }
      const shopKey = automationKeyForShop(shop)
      const shopRow = await env.DB.prepare('SELECT setting_json, updated_at FROM promotion_automation_settings WHERE setting_key = ?').bind(shopKey).first()
      const shopSettings = shopRow?.setting_json ? JSON.parse(shopRow.setting_json) : {}
      return {
        status: 'ok',
        settings: { cleanup: defaultSettings.cleanup || {}, flash_auto: { ...(shopSettings.flash_auto || {}), shop } },
        updated_at: shopRow?.updated_at || defaultRow?.updated_at || ''
      }
    }

    async function savePromotionAutomationSettings(settings = {}) {
      await ensurePromotionAutomationTable()
      const now = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
      const flashShop = String(settings?.flash_auto?.shop || '').trim()
      if (settings.flash_auto && !flashShop) {
        return { status: 'error', error: 'shop_required', message: 'Chọn shop trước khi lưu luật Flash Sale tự động.' }
      }
      if (settings.flash_auto) {
        await env.DB.prepare(`
          INSERT INTO promotion_automation_settings (setting_key, setting_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(setting_key) DO UPDATE SET setting_json = excluded.setting_json, updated_at = excluded.updated_at
        `).bind(automationKeyForShop(flashShop), JSON.stringify({ flash_auto: settings.flash_auto }), now).run()
      }
      if (settings.cleanup) {
        const current = await loadPromotionAutomationSettings()
        const merged = { ...(current.settings || {}), cleanup: settings.cleanup }
        await env.DB.prepare(`
          INSERT INTO promotion_automation_settings (setting_key, setting_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(setting_key) DO UPDATE SET setting_json = excluded.setting_json, updated_at = excluded.updated_at
        `).bind('default', JSON.stringify(merged || {}), now).run()
      } else if (!settings.flash_auto) {
      await env.DB.prepare(`
        INSERT INTO promotion_automation_settings (setting_key, setting_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_json = excluded.setting_json, updated_at = excluded.updated_at
      `).bind('default', JSON.stringify(settings || {}), now).run()
      }
      const loaded = await loadPromotionAutomationSettings(flashShop)
      return { ...loaded, updated_at: now, message: 'Đã lưu luật khuyến mãi tự động.' }
    }

    if (url.pathname === '/api/discounts/automation/settings') {
      if (request.method === 'GET') return json(await loadPromotionAutomationSettings(url.searchParams.get('shop') || ''), cors)
      if (request.method === 'POST') {
        const result = await savePromotionAutomationSettings(body.settings || body)
        return json(result, cors, result.status === 'error' ? 400 : 200)
      }
      return json({ error: 'Method not allowed' }, cors, 405)
    }

    if (url.pathname === '/api/discounts/automation/run-now') {
      const settings = body.settings || {}
      const saved = await savePromotionAutomationSettings(settings)
      if (saved.status === 'error') return json(saved, cors, 400)
      const shop = String(settings?.flash_auto?.shop || '').trim()
      if (!shop) return json({ status: 'blocked', error: 'shop_required', message: 'Chọn shop trước khi chạy Flash Sale tự động.', live_write_sent: false, readback_ok: false }, cors, 400)
      const enabled = Boolean(settings?.flash_auto?.enabled) && !settings?.flash_auto?.emergency_stop
      return json({
        status: enabled ? 'ok' : 'blocked',
        message: enabled ? 'Đã kiểm tra luật Flash Sale tự động. Chỉ ghi thật khi capability và readback đủ.' : 'Flash Sale tự động đang tắt hoặc đang tắt khẩn cấp.',
        live_write_sent: false,
        readback_ok: true
      }, cors)
    }

    if (url.pathname === '/api/discounts/shopee/flash-sale/time-slots') {
      const shopName = String(url.searchParams.get('shop') || '').trim()
      const startTime = Number(url.searchParams.get('start_time') || 0)
      const endTime = Number(url.searchParams.get('end_time') || 0)
      if (!shopName) return json({ status: 'error', error: 'shop_required', message: 'Chọn shop trước khi kiểm tra khung giờ Flash Sale.' }, cors, 400)
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        return json({ status: 'error', error: 'invalid_time_range', message: 'Khung giờ Flash Sale chưa hợp lệ.' }, cors, 400)
      }
      const shops = await getApiShops(env, 'shopee', shopName, 1)
      const shop = shops?.[0]
      if (!shop) return json({ status: 'error', error: 'shop_not_found', message: 'Không tìm thấy shop Shopee API tương ứng.' }, cors, 404)
      const response = await fetchShopeeShopJsonGet(env, shop, core.SHOPEE_SHOP_FLASH_SALE_TIME_SLOT_PATH, { start_time: startTime, end_time: endTime })
      const slots = Array.isArray(response?.response) ? response.response : []
      return json({
        status: 'ok',
        shop: shop.shop_name || shop.user_name || shopName,
        api_shop_id: String(shop.api_shop_id || ''),
        start_time: startTime,
        end_time: endTime,
        slots,
        slot_count: slots.length
      }, cors)
    }

    if (url.pathname === '/api/discounts/cleanup/action') {
      const execute = body.execute === true || String(body.execute).toLowerCase() === 'true'
      if (execute && !isPromotionApplyAdmin(await getAdminUserFromRequest(request, env))) {
        return json({ status: 'error', error: 'admin_required', message: 'Chỉ tài khoản admin được gửi thao tác dọn chương trình thật lên sàn.' }, cors, 403)
      }
      const platform = String(body.platform || '').trim().toLowerCase()
      const module = String(body.module || body.promotion_type || '').trim().toLowerCase()
      const action = String(body.action || '').trim().toLowerCase()
      const shop = body.shop || ''
      const promotionId = body.promotion_id || body.program_id || body.discount_id || ''
      const statusText = `${body.status || ''} ${body.status_label || ''}`.toLowerCase()
      if (platform === 'shopee' && module === 'shop_flash_sale' && action === 'delete' && /expired|ended|kết thúc/.test(statusText)) {
        return json({ status: 'error', error: 'endpoint_not_supported_for_expired_flash_sale', endpoint: '/api/v2/shop_flash_sale/delete_shop_flash_sale', message: 'Shopee không cho xóa Flash Sale đang chạy hoặc đã kết thúc; chỉ được ẩn khỏi danh sách đang hoạt động.', local_delete: false }, cors, 400)
      }
      let result
      if (platform === 'shopee' && module === 'discount') {
        result = await executeShopeeDiscountAction(env, {
          action: action === 'delete' ? 'delete_discount' : 'end_discount',
          shop,
          payload: { discount_id: promotionId },
          execute,
          confirm: body.confirm
        })
      } else if (platform === 'shopee') {
        result = await executeShopeePromotionAction(env, {
          module,
          action: action === 'delete' ? 'delete' : 'end',
          shop,
          use_cached_payload: true,
          payload: { program_id: promotionId, promotion_id: promotionId },
          execute,
          confirm: body.confirm
        })
      } else if (platform === 'lazada') {
        result = await executeLazadaCleanupAction(env, {
          module,
          action,
          shop,
          promotion_id: promotionId,
          execute,
          confirm: body.confirm
        })
      } else {
        result = { status: 'error', error: 'unsupported_platform', message: 'Sàn này chưa có endpoint dọn chương trình chính thức.' }
      }
      return json({ ...result, local_delete: false }, cors, result.status === 'error' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/promotion-tool-core' || url.pathname === '/api/discounts/core') {
      const result = await loadPromotionToolCore(env, {
        shop: body.shop || url.searchParams.get('shop'),
        limit: body.limit || url.searchParams.get('limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/shopee/sync' || url.pathname === '/api/discounts/sync') {
      const result = await syncShopeeDiscounts(env, {
        shop: body.shop || url.searchParams.get('shop'),
        discount_status: body.discount_status || body.status || url.searchParams.get('discount_status') || url.searchParams.get('status') || 'ongoing',
        include_detail: body.include_detail ?? body.includeDetail ?? url.searchParams.get('include_detail') ?? 1,
        page_limit: body.page_limit || body.pageLimit || url.searchParams.get('page_limit'),
        detail_limit: body.detail_limit || body.detailLimit || url.searchParams.get('detail_limit'),
        shop_limit: body.shop_limit || body.shopLimit || url.searchParams.get('shop_limit'),
        incremental: body.incremental ?? body.delta ?? url.searchParams.get('incremental') ?? url.searchParams.get('delta'),
        update_time_from: body.update_time_from || body.updateTimeFrom || url.searchParams.get('update_time_from'),
        update_time_to: body.update_time_to || body.updateTimeTo || url.searchParams.get('update_time_to')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/shopee/vouchers/sync' || url.pathname === '/api/discounts/vouchers/sync') {
      const result = await syncShopeeVouchers(env, {
        shop: body.shop || url.searchParams.get('shop'),
        voucher_status: body.voucher_status || body.status || url.searchParams.get('voucher_status') || url.searchParams.get('status') || 'ongoing',
        include_detail: body.include_detail ?? body.includeDetail ?? url.searchParams.get('include_detail') ?? 1,
        page_limit: body.page_limit || body.pageLimit || url.searchParams.get('page_limit'),
        page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
        detail_limit: body.detail_limit || body.detailLimit || url.searchParams.get('detail_limit'),
        shop_limit: body.shop_limit || body.shopLimit || url.searchParams.get('shop_limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/lazada/vouchers/sync') {
      const result = await syncLazadaVouchers(env, {
        shop: body.shop || url.searchParams.get('shop'),
        voucher_status: body.voucher_status || body.status || url.searchParams.get('voucher_status') || url.searchParams.get('status') || 'all',
        voucher_type: body.voucher_type || body.voucherType || url.searchParams.get('voucher_type') || url.searchParams.get('voucherType'),
        include_detail: body.include_detail ?? body.includeDetail ?? url.searchParams.get('include_detail') ?? 1,
        include_products: body.include_products ?? body.includeProducts ?? url.searchParams.get('include_products') ?? 1,
        page_limit: body.page_limit || body.pageLimit || url.searchParams.get('page_limit'),
        page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
        detail_limit: body.detail_limit || body.detailLimit || url.searchParams.get('detail_limit'),
        product_page_limit: body.product_page_limit || body.productPageLimit || url.searchParams.get('product_page_limit'),
        product_page_size: body.product_page_size || body.productPageSize || url.searchParams.get('product_page_size'),
        shop_limit: body.shop_limit || body.shopLimit || url.searchParams.get('shop_limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/shopee/promotions/sync') {
      const result = await syncShopeePromotionPrograms(env, {
        shop: body.shop || url.searchParams.get('shop'),
        module: body.module || body.modules || url.searchParams.get('module') || url.searchParams.get('modules'),
        status: body.status || body.promotion_status || url.searchParams.get('status') || url.searchParams.get('promotion_status') || 'all',
        include_detail: body.include_detail ?? body.includeDetail ?? url.searchParams.get('include_detail') ?? 1,
        page_limit: body.page_limit || body.pageLimit || url.searchParams.get('page_limit'),
        page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
        detail_limit: body.detail_limit || body.detailLimit || url.searchParams.get('detail_limit'),
        item_limit: body.item_limit || body.itemLimit || url.searchParams.get('item_limit'),
        shop_limit: body.shop_limit || body.shopLimit || url.searchParams.get('shop_limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/lazada/promotions/sync') {
      const result = await syncLazadaPromotionPrograms(env, {
        shop: body.shop || url.searchParams.get('shop'),
        module: body.module || body.modules || url.searchParams.get('module') || url.searchParams.get('modules'),
        status: body.status || body.promotion_status || url.searchParams.get('status') || url.searchParams.get('promotion_status') || 'all',
        include_detail: body.include_detail ?? body.includeDetail ?? url.searchParams.get('include_detail') ?? 1,
        include_products: body.include_products ?? body.includeProducts ?? url.searchParams.get('include_products') ?? 1,
        include_regions: body.include_regions ?? body.includeRegions ?? url.searchParams.get('include_regions') ?? 1,
        page_limit: body.page_limit || body.pageLimit || url.searchParams.get('page_limit'),
        page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
        detail_limit: body.detail_limit || body.detailLimit || url.searchParams.get('detail_limit'),
        product_page_limit: body.product_page_limit || body.productPageLimit || url.searchParams.get('product_page_limit'),
        product_page_size: body.product_page_size || body.productPageSize || url.searchParams.get('product_page_size'),
        shop_limit: body.shop_limit || body.shopLimit || url.searchParams.get('shop_limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/promotion-cache/batch' || url.pathname === '/api/discounts/promotions/deep-sync') {
      const result = await runPromotionDeepCacheBatch(env, {
        shop: body.shop || url.searchParams.get('shop'),
        task: body.task || body.tasks || url.searchParams.get('task') || url.searchParams.get('tasks'),
        max_jobs: body.max_jobs || body.maxJobs || url.searchParams.get('max_jobs') || url.searchParams.get('maxJobs'),
        shop_limit: body.shop_limit || body.shopLimit || url.searchParams.get('shop_limit') || url.searchParams.get('shopLimit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/promotion-programs') {
      const result = await listPromotionPrograms(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        status: body.status || url.searchParams.get('status') || 'all',
        limit: body.limit || url.searchParams.get('limit'),
        offset: body.offset || url.searchParams.get('offset')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/promotion-module-read-model') {
      const result = await getPromotionModuleReadModel(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        status: body.status || url.searchParams.get('status') || 'all',
        limit: body.limit || url.searchParams.get('limit')
      })
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/promotion-program-detail') {
      const result = await getPromotionProgramDetail(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        program_id: body.program_id || body.programId || url.searchParams.get('program_id') || url.searchParams.get('programId'),
        item_limit: body.item_limit || body.itemLimit || url.searchParams.get('item_limit') || url.searchParams.get('itemLimit')
      })
      return json(result, cors, result.status === 'error' ? 404 : 200)
    }

    if (url.pathname === '/api/discounts/promotion-vouchers') {
      const result = await listPromotionVouchers(env, {
        platform: body.platform || url.searchParams.get('platform'),
        shop: body.shop || url.searchParams.get('shop'),
        status: body.status || url.searchParams.get('status') || 'all',
        limit: body.limit || url.searchParams.get('limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/promotion-sku-detail') {
      const result = await getPromotionSkuDetail(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        program_id: body.program_id || body.programId || url.searchParams.get('program_id') || url.searchParams.get('programId'),
        item_id: body.item_id || body.itemId || url.searchParams.get('item_id') || url.searchParams.get('itemId'),
        model_id: body.model_id || body.modelId || url.searchParams.get('model_id') || url.searchParams.get('modelId'),
        sku_id: body.sku_id || body.skuId || url.searchParams.get('sku_id') || url.searchParams.get('skuId'),
        row: body.row || {},
        target_promotion_price: body.target_promotion_price || body.targetPrice || url.searchParams.get('target_promotion_price') || url.searchParams.get('targetPrice'),
        days: body.days || url.searchParams.get('days')
      })
      return json(result, cors, result.status === 'error' ? 404 : 200)
    }

    if (url.pathname === '/api/discounts/promotion-items/repair-prices' || url.pathname === '/api/discounts/promotions/repair-price-gaps') {
      const result = await repairPromotionItemPriceGaps(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        program_id: body.program_id || body.programId || url.searchParams.get('program_id') || url.searchParams.get('programId'),
        limit: body.limit || url.searchParams.get('limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/promotion-cache/delete') {
      const result = await deletePromotionCache(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        voucher_id: body.voucher_id || body.voucherId || url.searchParams.get('voucher_id') || url.searchParams.get('voucherId'),
        program_id: body.program_id || body.programId || url.searchParams.get('program_id') || url.searchParams.get('programId'),
        confirm: body.confirm || url.searchParams.get('confirm')
      })
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/promotions/preview-action' || url.pathname === '/api/discounts/promotion-action/preview') {
      const result = await previewPromotionAction(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        action: body.action || url.searchParams.get('action'),
        program_id: body.program_id || body.programId || url.searchParams.get('program_id') || url.searchParams.get('programId'),
        item_id: body.item_id || body.itemId || url.searchParams.get('item_id') || url.searchParams.get('itemId'),
        sku_id: body.sku_id || body.skuId || url.searchParams.get('sku_id') || url.searchParams.get('skuId'),
        row: body.row || {},
        payload: body.payload || {},
        price_rules: body.price_rules || body.priceRules || {},
        thresholds: body.thresholds || {}
      })
      return json(result, cors, result.status === 'blocked' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/promotions/queue-apply' || url.pathname === '/api/discounts/promotion-action/queue') {
      const result = await createPromotionApplyQueue(env, request, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        action: body.action || url.searchParams.get('action'),
        program_id: body.program_id || body.programId || url.searchParams.get('program_id') || url.searchParams.get('programId'),
        item_id: body.item_id || body.itemId || url.searchParams.get('item_id') || url.searchParams.get('itemId'),
        model_id: body.model_id || body.modelId || url.searchParams.get('model_id') || url.searchParams.get('modelId'),
        sku_id: body.sku_id || body.skuId || url.searchParams.get('sku_id') || url.searchParams.get('skuId'),
        row: body.row || {},
        payload: body.payload || {},
        price_rules: body.price_rules || body.priceRules || {},
        thresholds: body.thresholds || {},
        minimum_margin_percent: body.minimum_margin_percent || body.minimumMarginPercent || url.searchParams.get('minimum_margin_percent'),
        notes: body.notes || ''
      })
      return json(result, cors, result.status === 'error' ? 403 : 200)
    }

    if (url.pathname === '/api/discounts/promotions/apply-queue') {
      const result = await listPromotionApplyQueue(env, {
        platform: body.platform || url.searchParams.get('platform'),
        module: body.module || url.searchParams.get('module'),
        shop: body.shop || url.searchParams.get('shop'),
        status: body.status || url.searchParams.get('status') || 'all',
        limit: body.limit || url.searchParams.get('limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/promotions/apply-queue/execute') {
      const result = await executePromotionApplyQueue(env, request, {
        queue_id: body.queue_id || body.queueId || url.searchParams.get('queue_id') || url.searchParams.get('queueId'),
        confirm: body.confirm || url.searchParams.get('confirm')
      })
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/promotions/apply-queue/decide') {
      const result = await decidePromotionApplyQueue(env, request, {
        queue_id: body.queue_id || body.queueId || url.searchParams.get('queue_id') || url.searchParams.get('queueId'),
        decision: body.decision || url.searchParams.get('decision'),
        notes: body.notes || ''
      })
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/shopee/analysis' || url.pathname === '/api/discounts/shopee/inventory-analysis') {
      const result = await analyzeShopeeDiscounts(env, {
        shop: body.shop || url.searchParams.get('shop'),
        from: body.from || body.date_from || url.searchParams.get('from') || url.searchParams.get('date_from'),
        to: body.to || body.date_to || url.searchParams.get('to') || url.searchParams.get('date_to'),
        status: body.status || body.discount_status || url.searchParams.get('status') || url.searchParams.get('discount_status') || 'ongoing',
        sync: body.sync ?? url.searchParams.get('sync'),
        low_stock: body.low_stock || body.lowStock || url.searchParams.get('low_stock'),
        high_stock: body.high_stock || body.highStock || url.searchParams.get('high_stock'),
        max_discount_percent: body.max_discount_percent || body.maxDiscountPercent || url.searchParams.get('max_discount_percent'),
        limit: body.limit || url.searchParams.get('limit')
      })
      return json(result, cors)
    }

    if (url.pathname === '/api/discounts/shopee/action') {
      const execute = body.execute === true || String(body.execute).toLowerCase() === 'true'
      if (execute && !isPromotionApplyAdmin(await getAdminUserFromRequest(request, env))) {
        return json({ status: 'error', error: 'admin_required', message: 'Chỉ tài khoản admin được gửi thay đổi giá thật lên Shopee.' }, cors, 403)
      }
      const result = await executeShopeeDiscountAction(env, {
        action: body.action || url.searchParams.get('action'),
        shop: body.shop || url.searchParams.get('shop'),
        payload: body.payload || {},
        clientRule: body.client_rule || body.clientRule || {},
        execute: body.execute,
        confirm: body.confirm
      })
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/shopee/promotion-action') {
      const execute = body.execute === true || String(body.execute).toLowerCase() === 'true'
      if (execute && !isPromotionApplyAdmin(await getAdminUserFromRequest(request, env))) {
        return json({ status: 'error', error: 'admin_required', message: 'Chỉ tài khoản admin được gửi thay đổi khuyến mãi thật lên Shopee.' }, cors, 403)
      }
      const result = await executeShopeePromotionAction(env, {
        module: body.module || url.searchParams.get('module'),
        action: body.action || url.searchParams.get('action'),
        shop: body.shop || url.searchParams.get('shop'),
        payload: body.payload || {},
        use_cached_payload: body.use_cached_payload || body.useCachedPayload || url.searchParams.get('use_cached_payload') || url.searchParams.get('useCachedPayload'),
        execute: body.execute,
        confirm: body.confirm
      })
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    return json({ error: 'not_found', message: 'Unknown discounts endpoint' }, cors, 404)
    } catch (error) {
      return json({
        status: 'error',
        error: 'discounts_route_failed',
        message: 'Chưa tải được dữ liệu khuyến mãi. Vui lòng thử lại sau khi hệ thống đồng bộ xong.',
        detail: String(error?.message || error).slice(0, 300)
      }, cors, 500)
    }
  }
  core.handleDiscounts = handleDiscounts
}
