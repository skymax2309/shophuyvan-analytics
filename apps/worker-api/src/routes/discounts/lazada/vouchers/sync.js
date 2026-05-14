export function installDiscountsLazadaVouchersSync(core) {
  const LAZADA_VOUCHER_DETAIL_PATH = core.LAZADA_VOUCHER_DETAIL_PATH
  const LAZADA_VOUCHER_LIST_PATH = core.LAZADA_VOUCHER_LIST_PATH
  const LAZADA_VOUCHER_PRODUCTS_PATH = core.LAZADA_VOUCHER_PRODUCTS_PATH
  const callLazadaWithShop = core.callLazadaWithShop
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const getApiShops = core.getApiShops
  const inferVoucherStatus = (...args) => core.inferVoucherStatus(...args)
  const num = (...args) => core.num(...args)
  const parseJson = (...args) => core.parseJson(...args)
  const round2 = (...args) => core.round2(...args)
  const saveVouchers = (...args) => core.saveVouchers(...args)

  function firstVoucherValue(row = {}, ...keys) {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return row[key]
    }
    return ''
  }
  core.firstVoucherValue = firstVoucherValue

  function lazadaShopName(shop) {
    return shop.shop_name || shop.user_name || String(shop.api_shop_id || shop.id || '')
  }
  core.lazadaShopName = lazadaShopName

  function lazadaApiShopId(shop) {
    return cleanText(shop.api_shop_id || shop.api_user_id || shop.seller_id || shop.id || lazadaShopName(shop))
  }
  core.lazadaApiShopId = lazadaApiShopId

  function lazadaTimeSeconds(value) {
    const timestamp = Math.round(num(value))
    if (!timestamp) return 0
    return timestamp > 9999999999 ? Math.floor(timestamp / 1000) : timestamp
  }
  core.lazadaTimeSeconds = lazadaTimeSeconds

  function normalizeLazadaVoucherStatus(value, row = {}) {
    const raw = cleanText(value).toUpperCase()
    if (raw === 'NOT_START') return 'upcoming'
    if (raw === 'ONGOING') return 'ongoing'
    if (raw === 'SUSPEND') return 'suspended'
    if (raw === 'FINISH') return 'expired'
    const start = lazadaTimeSeconds(firstVoucherValue(row, 'period_start_time', 'periodStartTime'))
    const end = lazadaTimeSeconds(firstVoucherValue(row, 'period_end_time', 'periodEndTime'))
    return inferVoucherStatus('', 'all', start, end)
  }
  core.normalizeLazadaVoucherStatus = normalizeLazadaVoucherStatus

  function lazadaVoucherStatusParam(value) {
    const status = cleanText(value).toLowerCase()
    if (!status || status === 'all') return ''
    if (['ongoing', 'on_going'].includes(status)) return 'ONGOING'
    if (['upcoming', 'not_start', 'notstart'].includes(status)) return 'NOT_START'
    if (['suspended', 'suspend'].includes(status)) return 'SUSPEND'
    if (['expired', 'finish', 'finished'].includes(status)) return 'FINISH'
    return cleanText(value).toUpperCase()
  }
  core.lazadaVoucherStatusParam = lazadaVoucherStatusParam

  function lazadaVoucherTypes(options = {}) {
    const raw = cleanText(options.voucher_type || options.voucherType || options.type)
    const allowed = new Set(['COLLECTIBLE_VOUCHER', 'CODE_VOUCHER'])
    if (raw) {
      const values = raw.split(',').map(value => cleanText(value).toUpperCase()).filter(value => allowed.has(value))
      if (values.length) return values
    }
    return ['COLLECTIBLE_VOUCHER', 'CODE_VOUCHER']
  }
  core.lazadaVoucherTypes = lazadaVoucherTypes

  function assertLazadaPromotionSuccess(data, path) {
    if (data?.success === false || cleanText(data?.error_code || data?.errorCode)) {
      throw new Error(cleanText(data?.error_msg || data?.errorMsg || data?.message || data?.error_code || data?.errorCode) || `${path} failed`)
    }
    return data
  }
  core.assertLazadaPromotionSuccess = assertLazadaPromotionSuccess

  function lazadaVoucherRow(row, shop, sourceData = {}) {
    const shopName = lazadaShopName(shop)
    const voucherId = cleanText(firstVoucherValue(row, 'id', 'voucher_id', 'voucherId'))
    const productIds = Array.isArray(row.product_ids)
      ? row.product_ids
      : Array.isArray(row.productIds)
        ? row.productIds
        : []
    return {
      platform: 'lazada',
      shop: shopName,
      api_shop_id: lazadaApiShopId(shop),
      voucher_id: voucherId,
      voucher_code: cleanText(firstVoucherValue(row, 'voucher_code', 'voucherCode')),
      voucher_name: cleanText(firstVoucherValue(row, 'voucher_name', 'voucherName', 'name')),
      status: normalizeLazadaVoucherStatus(firstVoucherValue(row, 'status'), row),
      voucher_type: 0,
      reward_type: 0,
      usage_quantity: Math.round(num(firstVoucherValue(row, 'issued', 'limit'))),
      current_usage: Math.round(num(firstVoucherValue(row, 'order_used_budget', 'orderUsedBudget'))),
      start_time: lazadaTimeSeconds(firstVoucherValue(row, 'period_start_time', 'periodStartTime')),
      end_time: lazadaTimeSeconds(firstVoucherValue(row, 'period_end_time', 'periodEndTime')),
      display_start_time: lazadaTimeSeconds(firstVoucherValue(row, 'collect_start', 'collectStart')),
      is_admin: 0,
      voucher_purpose: 0,
      discount_amount: round2(firstVoucherValue(row, 'offering_money_value_off', 'offeringMoneyValueOff')),
      percentage: round2(firstVoucherValue(row, 'offering_percentage_discount_off', 'offeringPercentageDiscountOff')),
      min_basket_price: round2(firstVoucherValue(row, 'criteria_over_money', 'criteriaOverMoney')),
      max_price: round2(firstVoucherValue(row, 'max_discount_offering_money_value', 'maxDiscountOfferingMoneyValue')),
      item_ids_json: compactJson(productIds.map(cleanText).filter(Boolean), 12000),
      raw_data: compactJson(row, 16000),
      detail_raw_data: sourceData.detail_raw_data || '{}',
      request_id: cleanText(sourceData.request_id)
    }
  }
  core.lazadaVoucherRow = lazadaVoucherRow

  function normalizeLazadaVoucherList(data, shop) {
    const list = Array.isArray(data?.data?.data_list)
      ? data.data.data_list
      : Array.isArray(data?.data?.dataList)
        ? data.data.dataList
        : []
    return list.map(row => lazadaVoucherRow(row, shop, { request_id: data?.request_id || data?.requestId })).filter(row => row.voucher_id)
  }
  core.normalizeLazadaVoucherList = normalizeLazadaVoucherList

  function normalizeLazadaVoucherDetail(data, shop, fallback = {}) {
    const row = data?.data && typeof data.data === 'object' ? data.data : {}
    return lazadaVoucherRow({ ...fallback, ...row }, shop, {
      request_id: data?.request_id || data?.requestId,
      detail_raw_data: compactJson(row)
    })
  }
  core.normalizeLazadaVoucherDetail = normalizeLazadaVoucherDetail

  async function fetchLazadaVoucherProducts(env, shop, voucher, options = {}) {
    const pageSize = Math.min(Math.max(Number(options.product_page_size || options.productPageSize || 50) || 50, 1), 100)
    const pageLimit = Math.min(Math.max(Number(options.product_page_limit || options.productPageLimit || 2) || 2, 1), 20)
    const productRows = []
    let curPage = 1
    let more = false
    do {
      const data = assertLazadaPromotionSuccess(await callLazadaWithShop(env, shop, LAZADA_VOUCHER_PRODUCTS_PATH, {
        voucher_type: voucher.raw_voucher_type,
        id: voucher.voucher_id,
        cur_page: String(curPage),
        page_size: String(pageSize)
      }), LAZADA_VOUCHER_PRODUCTS_PATH)
      const list = Array.isArray(data?.data?.data_list)
        ? data.data.data_list
        : Array.isArray(data?.data?.dataList)
          ? data.data.dataList
          : []
      productRows.push(...list)
      const total = num(data?.data?.total)
      const current = num(data?.data?.current || curPage)
      const responsePageSize = num(data?.data?.page_size || data?.data?.pageSize || pageSize)
      more = total > current * responsePageSize
      curPage++
    } while (more && curPage <= pageLimit)
    return {
      rows: productRows,
      has_more: more,
      product_ids: productRows.map(row => cleanText(firstVoucherValue(row, 'product_id', 'productId'))).filter(Boolean)
    }
  }
  core.fetchLazadaVoucherProducts = fetchLazadaVoucherProducts

  async function fetchLazadaVoucherDetail(env, shop, voucher, options = {}) {
    const data = assertLazadaPromotionSuccess(await callLazadaWithShop(env, shop, LAZADA_VOUCHER_DETAIL_PATH, {
      voucher_type: voucher.raw_voucher_type,
      id: voucher.voucher_id
    }), LAZADA_VOUCHER_DETAIL_PATH)
    const detail = normalizeLazadaVoucherDetail(data, shop, voucher.raw_row || {})
    if (String(options.include_products ?? options.includeProducts ?? '1') !== '0') {
      try {
        const products = await fetchLazadaVoucherProducts(env, shop, voucher, options)
        detail.item_ids_json = compactJson(products.product_ids, 12000)
        detail.detail_raw_data = compactJson({ detail: data?.data || {}, selected_products: products.rows, products_has_more: products.has_more })
        detail.product_rows = products.rows.length
        detail.products_has_more = products.has_more
      } catch (error) {
        detail.detail_raw_data = compactJson({ detail: data?.data || {}, product_error: error?.message || String(error) })
        detail.product_error = error?.message || String(error)
      }
    }
    return detail
  }
  core.fetchLazadaVoucherDetail = fetchLazadaVoucherDetail

  async function syncLazadaVoucherShop(env, shop, options = {}) {
    const voucherStatus = cleanText(options.voucher_status || options.status || 'all').toLowerCase() || 'all'
    const lazadaStatus = lazadaVoucherStatusParam(voucherStatus)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 100) || 100, 1), 100)
    const pageLimit = Math.min(Math.max(Number(options.page_limit || options.pageLimit || 3) || 3, 1), 30)
    const includeDetail = String(options.include_detail ?? options.includeDetail ?? '1') !== '0'
    const detailLimit = Math.min(Math.max(Number(options.detail_limit || options.detailLimit || 40) || 40, 0), 300)
    const shopName = lazadaShopName(shop)
    const resultBase = {
      shop: shopName,
      api_shop_id: lazadaApiShopId(shop),
      platform: 'lazada',
      endpoint: LAZADA_VOUCHER_LIST_PATH,
      detail_endpoint: LAZADA_VOUCHER_DETAIL_PATH,
      products_endpoint: LAZADA_VOUCHER_PRODUCTS_PATH,
      voucher_status: voucherStatus
    }
    if (!shop.access_token) {
      return { ...resultBase, ok: false, error: 'missing_token', message: 'Shop chưa có access_token Lazada', vouchers: [], details: [] }
    }

    try {
      const vouchers = []
      const detailTargets = []
      let pages = 0
      let hasMoreAny = false
      for (const voucherType of lazadaVoucherTypes(options)) {
        let curPage = 1
        let more = false
        do {
          const params = {
            voucher_type: voucherType,
            cur_page: String(curPage),
            page_size: String(pageSize)
          }
          if (lazadaStatus) params.status = lazadaStatus
          const data = assertLazadaPromotionSuccess(await callLazadaWithShop(env, shop, LAZADA_VOUCHER_LIST_PATH, params), LAZADA_VOUCHER_LIST_PATH)
          const rows = normalizeLazadaVoucherList(data, shop).map(row => ({
            ...row,
            raw_voucher_type: voucherType,
            raw_row: parseJson(row.raw_data, {})
          }))
          vouchers.push(...rows)
          detailTargets.push(...rows)
          const total = num(data?.data?.total)
          const current = num(data?.data?.current || curPage)
          const responsePageSize = num(data?.data?.page_size || data?.data?.pageSize || pageSize)
          more = total > current * responsePageSize
          hasMoreAny = hasMoreAny || more
          pages++
          curPage++
        } while (more && curPage <= pageLimit)
      }

      const details = []
      if (includeDetail) {
        for (const voucher of detailTargets.slice(0, detailLimit)) {
          try {
            details.push(await fetchLazadaVoucherDetail(env, shop, voucher, options))
          } catch (error) {
            details.push({ ...voucher, detail_error: error?.message || String(error) })
          }
        }
      }

      const saved = await saveVouchers(env, shop, vouchers, details, { platform: 'lazada', status: voucherStatus, fullSync: !hasMoreAny })
      return {
        ...resultBase,
        ok: true,
        pages,
        has_more: hasMoreAny,
        total_vouchers: vouchers.length,
        detail_count: details.length,
        product_rows: details.reduce((sum, detail) => sum + (detail.product_rows || 0), 0),
        vouchers,
        details,
        ...saved
      }
    } catch (error) {
      return { ...resultBase, ok: false, error: 'lazada_voucher_sync_failed', message: error?.message || String(error), vouchers: [], details: [] }
    }
  }
  core.syncLazadaVoucherShop = syncLazadaVoucherShop

  async function syncLazadaVouchers(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'lazada', options.shop, shopLimit)
    const results = []
    for (const shop of shops) results.push(await syncLazadaVoucherShop(env, shop, options))
    const okRows = results.filter(row => row.ok)
    return {
      status: 'ok',
      mode: 'lazada_voucher_sync',
      endpoint: LAZADA_VOUCHER_LIST_PATH,
      detail_endpoint: LAZADA_VOUCHER_DETAIL_PATH,
      products_endpoint: LAZADA_VOUCHER_PRODUCTS_PATH,
      source: 'Lazada Seller Voucher API',
      note: 'Read-only sync. Không tự động tạo/sửa/kích hoạt/tắt voucher Lazada khi sync.',
      shop_count: shops.length,
      ok_count: okRows.length,
      total_vouchers: okRows.reduce((sum, row) => sum + (row.total_vouchers || 0), 0),
      detail_count: okRows.reduce((sum, row) => sum + (row.detail_count || 0), 0),
      product_rows: okRows.reduce((sum, row) => sum + (row.product_rows || 0), 0),
      saved_vouchers: okRows.reduce((sum, row) => sum + (row.saved_vouchers || 0), 0),
      shops: results
    }
  }
  core.syncLazadaVouchers = syncLazadaVouchers
}
