export function installDiscountsCommonRouteHandler(core) {
  const analyzeShopeeDiscounts = (...args) => core.analyzeShopeeDiscounts(...args)
  const createPromotionApplyQueue = (...args) => core.createPromotionApplyQueue(...args)
  const deletePromotionCache = (...args) => core.deletePromotionCache(...args)
  const decidePromotionApplyQueue = (...args) => core.decidePromotionApplyQueue(...args)
  const executePromotionApplyQueue = (...args) => core.executePromotionApplyQueue(...args)
  const executeShopeeDiscountAction = (...args) => core.executeShopeeDiscountAction(...args)
  const executeShopeePromotionAction = (...args) => core.executeShopeePromotionAction(...args)
  const getAdminUserFromRequest = core.getAdminUserFromRequest
  const getPromotionProgramDetail = (...args) => core.getPromotionProgramDetail(...args)
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
  const syncLazadaPromotionPrograms = (...args) => core.syncLazadaPromotionPrograms(...args)
  const syncLazadaVouchers = (...args) => core.syncLazadaVouchers(...args)
  const syncShopeeDiscounts = (...args) => core.syncShopeeDiscounts(...args)
  const syncShopeePromotionPrograms = (...args) => core.syncShopeePromotionPrograms(...args)
  const syncShopeeVouchers = (...args) => core.syncShopeeVouchers(...args)

  async function handleDiscounts(request, env, cors) {
    const url = new URL(request.url)
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

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
        execute: body.execute,
        confirm: body.confirm
      })
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    return json({ error: 'not_found', message: 'Unknown discounts endpoint' }, cors, 404)
  }
  core.handleDiscounts = handleDiscounts
}
