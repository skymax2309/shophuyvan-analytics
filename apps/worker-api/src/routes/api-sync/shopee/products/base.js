export function installApiSyncShopeeProductsBase(core) {
  const buildShopeeImportPayload = (...args) => core.buildShopeeImportPayload(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const fetchShopeeShopJson = core.fetchShopeeShopJson
  const fetchShopeeOrderDetails = (...args) => core.fetchShopeeOrderDetails(...args)
  const fetchShopeeOrderFeeDetail = (...args) => core.fetchShopeeOrderFeeDetail(...args)
  const firstPackage = (...args) => core.firstPackage(...args)
  const firstText = (...args) => core.firstText(...args)
  const getShopeeTrackingNumber = (...args) => core.getShopeeTrackingNumber(...args)
  const handleVariations = core.handleVariations
  const importPayload = (...args) => core.importPayload(...args)
  const listShopeeOrderSns = (...args) => core.listShopeeOrderSns(...args)
  const saveOrderFeeDetails = (...args) => core.saveOrderFeeDetails(...args)
  const shouldFetchShopeeFee = (...args) => core.shouldFetchShopeeFee(...args)

  async function importShopeeShop(env, cors, shop, options = {}) {
    if (!shop.api_shop_id) return { shop: shop.shop_name, fetched: 0, imported_orders: 0, imported_items: 0 }
    const fetchOrderList = params => fetchShopeeShopJson(env, shop, '/api/v2/order/get_order_list', params)
    const fetchOrderDetail = params => fetchShopeeShopJson(env, shop, '/api/v2/order/get_order_detail', params)
    const fetchTrackingNumber = params => fetchShopeeShopJson(env, shop, '/api/v2/logistics/get_tracking_number', params)
    const fetchEscrowDetail = params => fetchShopeeShopJson(env, shop, '/api/v2/payment/get_escrow_detail', params)
    const warnings = []
    const orderSns = await listShopeeOrderSns(fetchOrderList, { ...options, warnings })
    const details = await fetchShopeeOrderDetails(fetchOrderDetail, orderSns)
    const feeDetails = []
    const fetchTracking = parseBooleanOption(options.fetchTracking ?? options.fetch_tracking, true)
    const fetchFees = parseBooleanOption(options.fetchFees ?? options.fetch_fees, true)
    const focusedShopSync = !!cleanText(options.shop)
    const feeRefreshBudget = fetchFees
      ? (focusedShopSync ? Math.min(details.length, 30) : Math.min(details.length, 10))
      : 0

    for (const order of details) {
      const pkg = firstPackage(order)
      let tracking = firstText(order.tracking_no, order.tracking_number, pkg.tracking_number, pkg.tracking_no)
      if (!tracking && fetchTracking) tracking = await getShopeeTrackingNumber(fetchTrackingNumber, order.order_sn, pkg.package_number)
      order._tracking_number = tracking
      if (fetchFees && feeDetails.length < feeRefreshBudget && shouldFetchShopeeFee(order)) {
        try {
          const feeDetail = await fetchShopeeOrderFeeDetail(fetchEscrowDetail, shop, order.order_sn)
          if (feeDetail) {
            order._fee_detail = feeDetail
            feeDetails.push(feeDetail)
          }
        } catch (error) {
          warnings.push({ order_id: order.order_sn, stage: 'payment/get_escrow_detail', message: error.message })
        }
      }
    }

    const saved_fee_details = await saveOrderFeeDetails(env, feeDetails)
    const payload = buildShopeeImportPayload(shop, details)
    const imported = await importPayload(env, cors, payload)
    return {
      shop: shop.shop_name,
      fetched: orderSns.length,
      imported_orders: imported.imported_orders || 0,
      imported_items: imported.imported_items || 0,
      saved_fee_details,
      order_push: imported.order_push || { sent: 0, total: 0, notified: 0 },
      warnings
    }
  }
  core.importShopeeShop = importShopeeShop

  async function syncVariationPayload(env, cors, payload) {
    const request = new Request('https://worker.local/api/sync-variations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const response = await handleVariations(request, env, cors)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || JSON.stringify(data))
    return data
  }
  core.syncVariationPayload = syncVariationPayload

  function parseBooleanOption(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue
    if (typeof value === 'boolean') return value
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
    return defaultValue
  }
  core.parseBooleanOption = parseBooleanOption

  function filterInStockProducts(products, options = {}) {
    const includeOutOfStock = parseBooleanOption(options.includeOutOfStock, false)
    if (includeOutOfStock) {
      return {
        products,
        skippedOutOfStock: 0,
        skippedZeroStockVariations: 0
      }
    }

    let skippedOutOfStock = 0
    let skippedZeroStockVariations = 0
    const filtered = []

    for (const product of products) {
      const variations = Array.isArray(product.variations) ? product.variations : []
      const inStockVariations = variations.filter(variation => Number(variation.stock || 0) > 0)
      skippedZeroStockVariations += Math.max(0, variations.length - inStockVariations.length)

      if (!inStockVariations.length) {
        skippedOutOfStock++
        continue
      }

      filtered.push({ ...product, variations: inStockVariations })
    }

    return {
      products: filtered,
      skippedOutOfStock,
      skippedZeroStockVariations
    }
  }
  core.filterInStockProducts = filterInStockProducts

  async function listShopeeItemIds(buildListUrl, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 40) || 40, 50))
    const warnings = Array.isArray(options.warnings) ? options.warnings : []
    const ids = []
    let offset = Math.max(Number(options.offset || 0) || 0, 0)
    let hasMore = false

    while (ids.length < limit) {
      const pageSize = Math.min(50, limit - ids.length)
      let data
      try {
        data = await fetchShopeeJson(buildListUrl, {
          offset,
          page_size: pageSize,
          item_status: 'NORMAL'
        })
      } catch (error) {
        warnings.push({ stage: 'product/get_item_list', message: error.message })
        break
      }
      const items = data.response?.item || []
      for (const item of items) {
        const itemId = firstText(item.item_id)
        if (itemId) ids.push(itemId)
      }
      hasMore = Boolean(data.response?.has_next_page)
      if (!hasMore || items.length < pageSize) break
      offset += items.length
    }

    return {
      ids: [...new Set(ids)].slice(0, limit),
      next_offset: offset,
      has_more: hasMore
    }
  }
  core.listShopeeItemIds = listShopeeItemIds
}
