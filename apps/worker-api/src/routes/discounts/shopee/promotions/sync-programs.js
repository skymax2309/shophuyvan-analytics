export function installDiscountsShopeePromotionsSyncPrograms(core) {
  const SHOPEE_ADD_ON_DEAL_DETAIL_PATH = core.SHOPEE_ADD_ON_DEAL_DETAIL_PATH
  const SHOPEE_ADD_ON_DEAL_LIST_PATH = core.SHOPEE_ADD_ON_DEAL_LIST_PATH
  const SHOPEE_ADD_ON_DEAL_MAIN_ITEMS_PATH = core.SHOPEE_ADD_ON_DEAL_MAIN_ITEMS_PATH
  const SHOPEE_ADD_ON_DEAL_SUB_ITEMS_PATH = core.SHOPEE_ADD_ON_DEAL_SUB_ITEMS_PATH
  const SHOPEE_BUNDLE_DEAL_DETAIL_PATH = core.SHOPEE_BUNDLE_DEAL_DETAIL_PATH
  const SHOPEE_BUNDLE_DEAL_ITEMS_PATH = core.SHOPEE_BUNDLE_DEAL_ITEMS_PATH
  const SHOPEE_BUNDLE_DEAL_LIST_PATH = core.SHOPEE_BUNDLE_DEAL_LIST_PATH
  const SHOPEE_SHOP_FLASH_SALE_DETAIL_PATH = core.SHOPEE_SHOP_FLASH_SALE_DETAIL_PATH
  const SHOPEE_SHOP_FLASH_SALE_ITEMS_PATH = core.SHOPEE_SHOP_FLASH_SALE_ITEMS_PATH
  const SHOPEE_SHOP_FLASH_SALE_LIST_PATH = core.SHOPEE_SHOP_FLASH_SALE_LIST_PATH
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const fetchShopeeJsonGet = (...args) => core.fetchShopeeJsonGet(...args)
  const firstVoucherValue = (...args) => core.firstVoucherValue(...args)
  const getApiShops = core.getApiShops
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const makePromotionItem = (...args) => core.makePromotionItem(...args)
  const makePromotionProgram = (...args) => core.makePromotionProgram(...args)
  const num = (...args) => core.num(...args)
  const parseJson = (...args) => core.parseJson(...args)
  const promotionStatusFromTime = (...args) => core.promotionStatusFromTime(...args)
  const savePromotionPrograms = (...args) => core.savePromotionPrograms(...args)
  const shopeeFlashSaleType = (...args) => core.shopeeFlashSaleType(...args)
  const shopeeFlashTypeStatus = (...args) => core.shopeeFlashTypeStatus(...args)
  const shopeePromotionStatus = (...args) => core.shopeePromotionStatus(...args)
  const shopeeTimeStatus = (...args) => core.shopeeTimeStatus(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const voucherShopName = (...args) => core.voucherShopName(...args)

  function shopeePromotionProgramFromRow(shop, module, row, idKey, nameKey, requestId = '', detail = {}) {
    const start = Math.round(num(firstVoucherValue(row, 'start_time')))
    const end = Math.round(num(firstVoucherValue(row, 'end_time')))
    const id = firstVoucherValue(row, idKey)
    const name = firstVoucherValue(row, nameKey, 'name')
    const itemCount = firstVoucherValue(row, 'item_count', 'enabled_item_count', 'total_count')
    return makePromotionProgram({
      platform: 'shopee',
      shop,
      module,
      id,
      name,
      status: module === 'shop_flash_sale'
        ? shopeeFlashTypeStatus(row.type, start, end)
        : promotionStatusFromTime('', start, end),
      startTime: start,
      endTime: end,
      itemCount,
      row,
      detail,
      requestId
    })
  }
  core.shopeePromotionProgramFromRow = shopeePromotionProgramFromRow

  function normalizeShopeeBundleList(data, shop) {
    const list = Array.isArray(data?.response?.bundle_deal_list) ? data.response.bundle_deal_list : []
    return list.map(row => shopeePromotionProgramFromRow(shop, 'bundle_deal', row, 'bundle_deal_id', 'name', data?.request_id)).filter(row => row.program_id)
  }
  core.normalizeShopeeBundleList = normalizeShopeeBundleList

  function normalizeShopeeBundleDetail(data, shop, fallback = {}) {
    const row = data?.response || {}
    return shopeePromotionProgramFromRow(shop, 'bundle_deal', { ...fallback, ...row }, 'bundle_deal_id', 'name', data?.request_id, row)
  }
  core.normalizeShopeeBundleDetail = normalizeShopeeBundleDetail

  function normalizeShopeeBundleItems(data, shop, program) {
    const list = Array.isArray(data?.response?.item_list) ? data.response.item_list : []
    return list.map(row => makePromotionItem({
      platform: 'shopee',
      shop,
      module: 'bundle_deal',
      programId: program.program_id,
      programName: program.program_name,
      role: 'bundle_item',
      row,
      status: num(row.status) === 1 ? 'enabled' : 'disabled'
    }))
  }
  core.normalizeShopeeBundleItems = normalizeShopeeBundleItems

  function normalizeShopeeAddOnList(data, shop) {
    const list = Array.isArray(data?.response?.add_on_deal_list) ? data.response.add_on_deal_list : []
    return list.map(row => shopeePromotionProgramFromRow(shop, 'add_on_deal', row, 'add_on_deal_id', 'add_on_deal_name', data?.request_id)).filter(row => row.program_id)
  }
  core.normalizeShopeeAddOnList = normalizeShopeeAddOnList

  function normalizeShopeeAddOnDetail(data, shop, fallback = {}) {
    const row = data?.response || {}
    return shopeePromotionProgramFromRow(shop, 'add_on_deal', { ...fallback, ...row }, 'add_on_deal_id', 'add_on_deal_name', data?.request_id, row)
  }
  core.normalizeShopeeAddOnDetail = normalizeShopeeAddOnDetail

  function normalizeShopeeAddOnItems(data, shop, program, role, listKey) {
    const list = Array.isArray(data?.response?.[listKey]) ? data.response[listKey] : []
    return list.map(row => makePromotionItem({
      platform: 'shopee',
      shop,
      module: 'add_on_deal',
      programId: program.program_id,
      programName: program.program_name,
      role,
      row,
      status: num(row.status) === 1 ? 'enabled' : (num(row.status) === 2 ? 'disabled' : cleanText(row.status))
    }))
  }
  core.normalizeShopeeAddOnItems = normalizeShopeeAddOnItems

  function normalizeShopeeFlashList(data, shop) {
    const list = Array.isArray(data?.response?.flash_sale_list) ? data.response.flash_sale_list : []
    return list.map(row => shopeePromotionProgramFromRow(shop, 'shop_flash_sale', row, 'flash_sale_id', 'flash_sale_id', data?.request_id)).filter(row => row.program_id)
  }
  core.normalizeShopeeFlashList = normalizeShopeeFlashList

  function normalizeShopeeFlashDetail(data, shop, fallback = {}) {
    const row = data?.response || {}
    return shopeePromotionProgramFromRow(shop, 'shop_flash_sale', { ...fallback, ...row }, 'flash_sale_id', 'flash_sale_id', data?.request_id, row)
  }
  core.normalizeShopeeFlashDetail = normalizeShopeeFlashDetail

  function normalizeShopeeFlashItems(data, shop, program) {
    const response = data?.response || {}
    const modelRows = Array.isArray(response.models) ? response.models.map(row => makePromotionItem({
      platform: 'shopee',
      shop,
      module: 'shop_flash_sale',
      programId: program.program_id,
      programName: program.program_name,
      role: 'model',
      row,
      status: cleanText(row.status),
      originalPrice: row.original_price,
      promotionPrice: row.input_promotion_price || row.promotion_price_with_tax,
      campaignStock: row.campaign_stock,
      purchaseLimit: row.purchase_limit
    })) : []
    const itemRows = Array.isArray(response.item_info) ? response.item_info.map(row => makePromotionItem({
      platform: 'shopee',
      shop,
      module: 'shop_flash_sale',
      programId: program.program_id,
      programName: program.program_name,
      role: 'item',
      row,
      status: cleanText(row.item_status || row.status),
      originalPrice: row.original_price,
      promotionPrice: row.input_promotion_price || row.promotion_price_with_tax,
      campaignStock: row.campaign_stock,
      purchaseLimit: row.purchase_limit
    })) : []
    return [...modelRows, ...itemRows]
  }
  core.normalizeShopeeFlashItems = normalizeShopeeFlashItems

  async function syncShopeePromotionModuleShop(env, shop, module, options = {}) {
    const shopName = voucherShopName(shop)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 100) || 100, 1), module === 'bundle_deal' ? 1000 : 100)
    const pageLimit = Math.min(Math.max(Number(options.page_limit || options.pageLimit || 3) || 3, 1), 30)
    const includeDetail = String(options.include_detail ?? options.includeDetail ?? '1') !== '0'
    const detailLimit = Math.min(Math.max(Number(options.detail_limit || options.detailLimit || 20) || 20, 0), 200)
    const itemLimit = Math.min(Math.max(Number(options.item_limit || options.itemLimit || 20) || 20, 0), 200)
    const status = cleanText(options.status || options.promotion_status || 'all').toLowerCase() || 'all'
    const resultBase = { shop: shopName, api_shop_id: String(shop.api_shop_id || ''), platform: 'shopee', module, status }
    if (!shop.access_token || !shop.api_shop_id) return { ...resultBase, ok: false, error: 'missing_token_or_shop_id', programs: [], items: [] }

    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shopName)
      const listConfig = {
        bundle_deal: {
          path: SHOPEE_BUNDLE_DEAL_LIST_PATH,
          detailPath: SHOPEE_BUNDLE_DEAL_DETAIL_PATH,
          itemPath: SHOPEE_BUNDLE_DEAL_ITEMS_PATH,
          listParams: pageNo => ({ page_no: pageNo, page_size: pageSize, time_status: shopeeTimeStatus(status) }),
          normalizeList: normalizeShopeeBundleList,
          normalizeDetail: normalizeShopeeBundleDetail,
          detailParams: row => ({ bundle_deal_id: row.program_id }),
          itemCalls: row => [{ path: SHOPEE_BUNDLE_DEAL_ITEMS_PATH, params: { bundle_deal_id: row.program_id }, normalize: data => normalizeShopeeBundleItems(data, shop, row) }]
        },
        add_on_deal: {
          path: SHOPEE_ADD_ON_DEAL_LIST_PATH,
          detailPath: SHOPEE_ADD_ON_DEAL_DETAIL_PATH,
          listParams: pageNo => ({ page_no: pageNo, page_size: pageSize, promotion_status: shopeePromotionStatus(status) }),
          normalizeList: normalizeShopeeAddOnList,
          normalizeDetail: normalizeShopeeAddOnDetail,
          detailParams: row => ({ add_on_deal_id: row.program_id }),
          itemCalls: row => [
            { path: SHOPEE_ADD_ON_DEAL_MAIN_ITEMS_PATH, params: { add_on_deal_id: row.program_id }, normalize: data => normalizeShopeeAddOnItems(data, shop, row, 'main_item', 'main_item_list') },
            { path: SHOPEE_ADD_ON_DEAL_SUB_ITEMS_PATH, params: { add_on_deal_id: row.program_id }, normalize: data => normalizeShopeeAddOnItems(data, shop, row, 'sub_item', 'sub_item_list') }
          ]
        },
        shop_flash_sale: {
          path: SHOPEE_SHOP_FLASH_SALE_LIST_PATH,
          detailPath: SHOPEE_SHOP_FLASH_SALE_DETAIL_PATH,
          listParams: pageNo => ({ offset: (pageNo - 1) * pageSize, limit: pageSize, type: shopeeFlashSaleType(status) }),
          normalizeList: normalizeShopeeFlashList,
          normalizeDetail: normalizeShopeeFlashDetail,
          detailParams: row => ({ flash_sale_id: row.program_id }),
          itemCalls: row => [{ path: SHOPEE_SHOP_FLASH_SALE_ITEMS_PATH, params: { flash_sale_id: row.program_id, offset: 0, limit: Math.min(itemLimit || 100, 100) }, normalize: data => normalizeShopeeFlashItems(data, shop, row) }]
        }
      }[module]
      if (!listConfig) return { ...resultBase, ok: false, error: 'unknown_module', programs: [], items: [] }

      const buildListUrl = signShopeeUrl(app, listConfig.path, shop.access_token, shop.api_shop_id)
      const programs = []
      const items = []
      let pageNo = 1
      let more = false
      do {
        const data = await fetchShopeeJsonGet(buildListUrl, listConfig.listParams(pageNo))
        const rows = listConfig.normalizeList(data, shop)
        programs.push(...rows)
        const responseTotal = num(data?.response?.total_count)
        more = Boolean(data?.response?.more) || (module === 'shop_flash_sale' && responseTotal > pageNo * pageSize)
        pageNo++
      } while (more && pageNo <= pageLimit)

      const detailRows = []
      if (includeDetail) {
        for (const program of programs.slice(0, detailLimit)) {
          try {
            const buildDetailUrl = signShopeeUrl(app, listConfig.detailPath, shop.access_token, shop.api_shop_id)
            const detailData = await fetchShopeeJsonGet(buildDetailUrl, listConfig.detailParams(program))
            const detail = listConfig.normalizeDetail(detailData, shop, parseJson(program.raw_data, {}))
            detailRows.push(detail)
            for (const call of listConfig.itemCalls(program).slice(0, itemLimit ? 3 : 0)) {
              try {
                const buildItemUrl = signShopeeUrl(app, call.path, shop.access_token, shop.api_shop_id)
                const itemData = await fetchShopeeJsonGet(buildItemUrl, call.params)
                items.push(...call.normalize(itemData))
              } catch (itemError) {
                items.push(makePromotionItem({ platform: 'shopee', shop, module, programId: program.program_id, programName: program.program_name, role: 'item_error', row: { error: itemError?.message || String(itemError) }, itemId: `error_${program.program_id}` }))
              }
            }
          } catch (detailError) {
            detailRows.push({ ...program, detail_raw_data: compactJson({ error: detailError?.message || String(detailError) }) })
          }
        }
      }
      const merged = new Map(programs.map(row => [row.program_id, row]))
      for (const detail of detailRows) merged.set(detail.program_id, { ...(merged.get(detail.program_id) || {}), ...detail })
      const finalPrograms = [...merged.values()]
      const saved = await savePromotionPrograms(env, finalPrograms, items, { platform: 'shopee', module, status, fullSync: !more })
      return {
        ...resultBase,
        ok: true,
        endpoint: listConfig.path,
        detail_endpoint: listConfig.detailPath,
        pages: pageNo - 1,
        has_more: more,
        total_programs: programs.length,
        detail_count: detailRows.length,
        item_count: items.filter(item => item.item_role !== 'item_error').length,
        item_errors: items.filter(item => item.item_role === 'item_error').length,
        programs: finalPrograms,
        items,
        ...saved
      }
    } catch (error) {
      return { ...resultBase, ok: false, error: `${module}_sync_failed`, message: error?.message || String(error), programs: [], items: [] }
    }
  }
  core.syncShopeePromotionModuleShop = syncShopeePromotionModuleShop

  async function syncShopeePromotionPrograms(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const modules = cleanText(options.module || options.modules)
      ? cleanText(options.module || options.modules).split(',').map(item => cleanText(item)).filter(Boolean)
      : ['bundle_deal', 'add_on_deal', 'shop_flash_sale']
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const results = []
    for (const shop of shops) {
      for (const module of modules) results.push(await syncShopeePromotionModuleShop(env, shop, module, options))
    }
    const okRows = results.filter(row => row.ok)
    return {
      status: 'ok',
      mode: 'shopee_promotion_program_sync',
      source: 'Shopee Bundle/Add-On/ShopFlashSale read-only APIs',
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
  core.syncShopeePromotionPrograms = syncShopeePromotionPrograms
}
