export function installDiscountsLazadaPromotionsSyncPrograms(core) {
  const LAZADA_FLEXICOMBO_DETAIL_PATH = core.LAZADA_FLEXICOMBO_DETAIL_PATH
  const LAZADA_FLEXICOMBO_LIST_PATH = core.LAZADA_FLEXICOMBO_LIST_PATH
  const LAZADA_FLEXICOMBO_PRODUCTS_PATH = core.LAZADA_FLEXICOMBO_PRODUCTS_PATH
  const LAZADA_FREE_SHIPPING_DETAIL_PATH = core.LAZADA_FREE_SHIPPING_DETAIL_PATH
  const LAZADA_FREE_SHIPPING_LIST_PATH = core.LAZADA_FREE_SHIPPING_LIST_PATH
  const LAZADA_FREE_SHIPPING_PRODUCTS_PATH = core.LAZADA_FREE_SHIPPING_PRODUCTS_PATH
  const LAZADA_FREE_SHIPPING_REGIONS_PATH = core.LAZADA_FREE_SHIPPING_REGIONS_PATH
  const assertLazadaPromotionSuccess = (...args) => core.assertLazadaPromotionSuccess(...args)
  const callLazadaWithShop = core.callLazadaWithShop
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const firstVoucherValue = (...args) => core.firstVoucherValue(...args)
  const getApiShops = core.getApiShops
  const lazadaApiShopId = (...args) => core.lazadaApiShopId(...args)
  const lazadaPromotionStatus = (...args) => core.lazadaPromotionStatus(...args)
  const lazadaPromotionStatusParam = (...args) => core.lazadaPromotionStatusParam(...args)
  const lazadaShopName = (...args) => core.lazadaShopName(...args)
  const lazadaTimeSeconds = (...args) => core.lazadaTimeSeconds(...args)
  const makePromotionItem = (...args) => core.makePromotionItem(...args)
  const makePromotionProgram = (...args) => core.makePromotionProgram(...args)
  const num = (...args) => core.num(...args)
  const parseJson = (...args) => core.parseJson(...args)
  const safeProgramName = (...args) => core.safeProgramName(...args)
  const savePromotionPrograms = (...args) => core.savePromotionPrograms(...args)

  function lazadaProgramFromRow(shop, module, row, requestId = '', detail = {}) {
    const id = firstVoucherValue(row, 'id')
    const start = lazadaTimeSeconds(firstVoucherValue(row, 'period_start_time', 'periodStartTime', 'start_time', 'startTime'))
    const end = lazadaTimeSeconds(firstVoucherValue(row, 'period_end_time', 'periodEndTime', 'end_time', 'endTime'))
    return makePromotionProgram({
      platform: 'lazada',
      shop,
      module,
      id,
      name: safeProgramName(row, 'promotion_name', 'promotionName', 'name'),
      status: lazadaPromotionStatus(firstVoucherValue(row, 'status'), row),
      startTime: start,
      endTime: end,
      budget: firstVoucherValue(row, 'budget_value', 'budgetValue'),
      usedBudget: firstVoucherValue(row, 'used_budget_value', 'usedBudgetValue', 'order_used_numbers', 'orderUsedNumbers'),
      currency: firstVoucherValue(row, 'currency'),
      itemCount: firstVoucherValue(row, 'item_count', 'total'),
      row,
      detail,
      requestId
    })
  }
  core.lazadaProgramFromRow = lazadaProgramFromRow

  function lazadaProductItems(shop, module, program, rows = [], role = 'selected_product') {
    const items = []
    for (const row of rows || []) {
      const skuValues = Array.isArray(row.sku_ids) ? row.sku_ids : Array.isArray(row.skuIds) ? row.skuIds : [firstVoucherValue(row, 'sku_ids', 'skuIds')]
      for (const skuId of skuValues.filter(value => cleanText(value))) {
        items.push(makePromotionItem({ platform: 'lazada', shop, module, programId: program.program_id, programName: program.program_name, role, row, skuId }))
      }
      if (!skuValues.filter(value => cleanText(value)).length) {
        items.push(makePromotionItem({ platform: 'lazada', shop, module, programId: program.program_id, programName: program.program_name, role, row }))
      }
    }
    return items
  }
  core.lazadaProductItems = lazadaProductItems

  async function fetchLazadaPromotionProducts(env, shop, module, path, program, options = {}) {
    const pageSize = Math.min(Math.max(Number(options.product_page_size || options.productPageSize || 50) || 50, module === 'flexicombo' ? 10 : 1), 100)
    const pageLimit = Math.min(Math.max(Number(options.product_page_limit || options.productPageLimit || 2) || 2, 1), 20)
    const rows = []
    let curPage = 1
    let more = false
    do {
      const pageParams = module === 'free_shipping'
        ? { id: program.program_id, curPage: String(curPage), pageSize: String(pageSize) }
        : { id: program.program_id, cur_page: String(curPage), page_size: String(pageSize) }
      const data = assertLazadaPromotionSuccess(await callLazadaWithShop(env, shop, path, pageParams), path)
      const list = Array.isArray(data?.data?.data_list)
        ? data.data.data_list
        : Array.isArray(data?.data?.dataList)
          ? data.data.dataList
          : []
      rows.push(...list)
      const total = num(data?.data?.total)
      const current = num(data?.data?.current || curPage)
      const responsePageSize = num(data?.data?.page_size || data?.data?.pageSize || pageSize)
      more = total > current * responsePageSize
      curPage++
    } while (more && curPage <= pageLimit)
    return { rows, has_more: more }
  }
  core.fetchLazadaPromotionProducts = fetchLazadaPromotionProducts

  async function syncLazadaPromotionModuleShop(env, shop, module, options = {}) {
    const shopName = lazadaShopName(shop)
    const status = cleanText(options.status || options.promotion_status || 'all').toLowerCase() || 'all'
    const lazadaStatus = lazadaPromotionStatusParam(status)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 100) || 100, module === 'flexicombo' ? 10 : 1), 100)
    const pageLimit = Math.min(Math.max(Number(options.page_limit || options.pageLimit || 3) || 3, 1), 30)
    const includeDetail = String(options.include_detail ?? options.includeDetail ?? '1') !== '0'
    const detailLimit = Math.min(Math.max(Number(options.detail_limit || options.detailLimit || 20) || 20, 0), 200)
    const includeProducts = String(options.include_products ?? options.includeProducts ?? '1') !== '0'
    const resultBase = { shop: shopName, api_shop_id: lazadaApiShopId(shop), platform: 'lazada', module, status }
    if (!shop.access_token) return { ...resultBase, ok: false, error: 'missing_token', programs: [], items: [] }

    const config = {
      free_shipping: {
        listPath: LAZADA_FREE_SHIPPING_LIST_PATH,
        detailPath: LAZADA_FREE_SHIPPING_DETAIL_PATH,
        productsPath: LAZADA_FREE_SHIPPING_PRODUCTS_PATH,
        listParams: pageNo => {
          const params = { curPage: String(pageNo), pageSize: String(pageSize) }
          if (lazadaStatus) params.status = lazadaStatus
          return params
        }
      },
      flexicombo: {
        listPath: LAZADA_FLEXICOMBO_LIST_PATH,
        detailPath: LAZADA_FLEXICOMBO_DETAIL_PATH,
        productsPath: LAZADA_FLEXICOMBO_PRODUCTS_PATH,
        listParams: pageNo => {
          const params = { cur_page: String(pageNo), page_size: String(pageSize) }
          if (lazadaStatus) params.status = lazadaStatus
          return params
        }
      }
    }[module]
    if (!config) return { ...resultBase, ok: false, error: 'unknown_module', programs: [], items: [] }

    try {
      const programs = []
      const items = []
      let pageNo = 1
      let more = false
      do {
        const data = assertLazadaPromotionSuccess(await callLazadaWithShop(env, shop, config.listPath, config.listParams(pageNo)), config.listPath)
        const list = Array.isArray(data?.data?.data_list)
          ? data.data.data_list
          : Array.isArray(data?.data?.dataList)
            ? data.data.dataList
            : []
        programs.push(...list.map(row => lazadaProgramFromRow(shop, module, row, data?.request_id || data?.requestId)).filter(row => row.program_id))
        const total = num(data?.data?.total)
        const current = num(data?.data?.current || pageNo)
        const responsePageSize = num(data?.data?.page_size || data?.data?.pageSize || pageSize)
        more = total > current * responsePageSize
        pageNo++
      } while (more && pageNo <= pageLimit)

      const detailRows = []
      if (includeDetail) {
        for (const program of programs.slice(0, detailLimit)) {
          try {
            const detailData = assertLazadaPromotionSuccess(await callLazadaWithShop(env, shop, config.detailPath, { id: program.program_id }), config.detailPath)
            const detail = lazadaProgramFromRow(shop, module, { ...parseJson(program.raw_data, {}), ...(detailData.data || {}) }, detailData?.request_id || detailData?.requestId, detailData.data || {})
            detailRows.push(detail)
            if (includeProducts && config.productsPath) {
              const products = await fetchLazadaPromotionProducts(env, shop, module, config.productsPath, program, options)
              items.push(...lazadaProductItems(shop, module, program, products.rows, module === 'flexicombo' ? 'combo_product' : 'selected_product'))
              detail.detail_raw_data = compactJson({ detail: detailData.data || {}, selected_products: products.rows, products_has_more: products.has_more })
            }
            if (module === 'flexicombo') {
              const detailRaw = detailData.data || {}
              items.push(...lazadaProductItems(shop, module, program, Array.isArray(detailRaw.sample_skus) ? detailRaw.sample_skus : [], 'sample_sku'))
              items.push(...lazadaProductItems(shop, module, program, Array.isArray(detailRaw.gift_skus) ? detailRaw.gift_skus : [], 'gift_sku'))
            }
          } catch (detailError) {
            detailRows.push({ ...program, detail_raw_data: compactJson({ error: detailError?.message || String(detailError) }) })
          }
        }
      }
      if (module === 'free_shipping' && String(options.include_regions ?? options.includeRegions ?? '1') !== '0') {
        try {
          const regions = assertLazadaPromotionSuccess(await callLazadaWithShop(env, shop, LAZADA_FREE_SHIPPING_REGIONS_PATH, {}), LAZADA_FREE_SHIPPING_REGIONS_PATH)
          if (detailRows[0]) detailRows[0].detail_raw_data = compactJson({ detail: parseJson(detailRows[0].detail_raw_data, {}), regions: regions.data || [] })
        } catch {}
      }

      const merged = new Map(programs.map(row => [row.program_id, row]))
      for (const detail of detailRows) merged.set(detail.program_id, { ...(merged.get(detail.program_id) || {}), ...detail })
      const finalPrograms = [...merged.values()]
      const saved = await savePromotionPrograms(env, finalPrograms, items, { platform: 'lazada', module, status, fullSync: !more })
      return {
        ...resultBase,
        ok: true,
        endpoint: config.listPath,
        detail_endpoint: config.detailPath,
        products_endpoint: config.productsPath,
        pages: pageNo - 1,
        has_more: more,
        total_programs: programs.length,
        detail_count: detailRows.length,
        item_count: items.length,
        programs: finalPrograms,
        items,
        ...saved
      }
    } catch (error) {
      return { ...resultBase, ok: false, error: `${module}_sync_failed`, message: error?.message || String(error), programs: [], items: [] }
    }
  }
  core.syncLazadaPromotionModuleShop = syncLazadaPromotionModuleShop

  async function syncLazadaPromotionPrograms(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const modules = cleanText(options.module || options.modules)
      ? cleanText(options.module || options.modules).split(',').map(item => cleanText(item)).filter(Boolean)
      : ['free_shipping', 'flexicombo']
    const shops = await getApiShops(env, 'lazada', options.shop, shopLimit)
    const results = []
    for (const shop of shops) {
      for (const module of modules) results.push(await syncLazadaPromotionModuleShop(env, shop, module, options))
    }
    const okRows = results.filter(row => row.ok)
    return {
      status: 'ok',
      mode: 'lazada_promotion_program_sync',
      source: 'Lazada Free Shipping/Flexicombo read-only APIs',
      modules,
      shop_count: shops.length,
      ok_count: okRows.length,
      total_programs: okRows.reduce((sum, row) => sum + (row.total_programs || 0), 0),
      detail_count: okRows.reduce((sum, row) => sum + (row.detail_count || 0), 0),
      item_count: okRows.reduce((sum, row) => sum + (row.item_count || 0), 0),
      saved_programs: okRows.reduce((sum, row) => sum + (row.saved_programs || 0), 0),
      saved_items: okRows.reduce((sum, row) => sum + (row.saved_items || 0), 0),
      results
    }
  }
  core.syncLazadaPromotionPrograms = syncLazadaPromotionPrograms
}
