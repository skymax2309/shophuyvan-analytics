export function installApiSyncLazadaOrdersSync(core) {
  const ORDER_SOURCE_MODES = core.ORDER_SOURCE_MODES
  const buildLazadaOrderWindow = (...args) => core.buildLazadaOrderWindow(...args)
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const cleanCarrier = (...args) => core.cleanCarrier(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const compactFeeDetail = (...args) => core.compactFeeDetail(...args)
  const feeDetailToPayload = (...args) => core.feeDetailToPayload(...args)
  const firstText = (...args) => core.firstText(...args)
  const importOrdersV2 = core.importOrdersV2
  const mapLazadaTraceStatus = (...args) => core.mapLazadaTraceStatus(...args)
  const mapPlatformStatus = (...args) => core.mapPlatformStatus(...args)
  const normalizeLazadaDate = (...args) => core.normalizeLazadaDate(...args)
  const nowBangkokText = core.nowBangkokText
  const pickFee = (...args) => core.pickFee(...args)
  const preferOrderOrItems = (...args) => core.preferOrderOrItems(...args)
  const saveOrderFeeDetails = (...args) => core.saveOrderFeeDetails(...args)
  const toMoney = (...args) => core.toMoney(...args)
  const uniqueTexts = (...args) => core.uniqueTexts(...args)

  async function listLazadaOrders(env, shop, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 100) || 100, 300))
    const startOffset = Math.max(0, Number(options.offset || 0) || 0)
    const window = buildLazadaOrderWindow(options)
    const warnings = Array.isArray(options.warnings) ? options.warnings : []
    const rows = []
    let offset = startOffset
    let useUpdatedWindow = true

    while (rows.length < limit) {
      const batchLimit = Math.min(100, limit - rows.length)
      let data
      try {
        const params = useUpdatedWindow
          ? {
              update_after: window.update_after,
              update_before: window.update_before,
              sort_by: 'updated_at',
              sort_direction: 'DESC',
              limit: String(batchLimit),
              offset: String(offset)
            }
          : {
              created_after: window.update_after,
              created_before: window.update_before,
              sort_by: 'created_at',
              sort_direction: 'DESC',
              limit: String(batchLimit),
              offset: String(offset)
            }
        data = await callLazadaWithShop(env, shop, '/orders/get', params)
      } catch (error) {
        if (useUpdatedWindow) {
          warnings.push({
            stage: 'orders/get',
            message: `Lazada không nhận update_after/update_before, tự động chuyển sang created_after/created_before: ${error.message}`
          })
          useUpdatedWindow = false
          continue
        }
        warnings.push({ stage: 'orders/get', message: error.message })
        break
      }

      const batch = Array.isArray(data?.data?.orders) ? data.data.orders : []
      rows.push(...batch)
      if (batch.length < batchLimit) break
      offset += batch.length
    }

    return rows.slice(0, limit)
  }
  core.listLazadaOrders = listLazadaOrders

  async function getLazadaSellerIdForShop(env, shop) {
    const data = await callLazadaWithShop(env, shop, '/seller/get')
    return cleanText(data?.data?.seller_id)
  }

  async function getLazadaTraceForShop(env, shop, sellerId, orderId, packageIds) {
    if (!sellerId || !packageIds.length) return null
    return callLazadaWithShop(env, shop, '/logistic/order/trace', {
      seller_id: sellerId,
      order_id: orderId,
      locale: 'vi_VN',
      ofc_package_id_list: JSON.stringify(packageIds)
    })
  }

  function normalizeLazadaCarrier(order, firstItem) {
    return cleanCarrier(firstText(
      order?.shipment_provider,
      order?.shipping_provider,
      order?.shipping_provider_type,
      order?.logistics_provider,
      order?.delivery_provider,
      order?.delivery_type,
      order?.delivery_option,
      firstItem?.shipment_provider,
      firstItem?.shipping_provider,
      firstItem?.shipping_provider_type,
      firstItem?.logistics_provider,
      firstItem?.delivery_provider,
      firstItem?.delivery_type,
      firstItem?.delivery_option
    ))
  }
  core.normalizeLazadaCarrier = normalizeLazadaCarrier

  function normalizeLazadaTracking(order, firstItem) {
    return firstText(
      order?.tracking_number,
      order?.tracking_no,
      order?.tracking_code,
      firstItem?.tracking_code,
      firstItem?.tracking_number,
      firstItem?.tracking_no
    )
  }
  core.normalizeLazadaTracking = normalizeLazadaTracking

  function firstArrayText(value) {
    if (!Array.isArray(value)) return ''
    for (const item of value) {
      const text = cleanText(item)
      if (text) return text
    }
    return ''
  }
  core.firstArrayText = firstArrayText

  function normalizeLazadaItemImage(item) {
    return firstText(
      item?.product_main_image,
      item?.product_image,
      item?.product_picture,
      item?.sku_image,
      item?.item_image,
      item?.image,
      item?.main_image,
      item?.thumbnail,
      item?.pic_url,
      firstArrayText(item?.Images),
      firstArrayText(item?.images),
      firstArrayText(item?.product_images)
    )
  }
  core.normalizeLazadaItemImage = normalizeLazadaItemImage

  function normalizeLazadaFeeDetail(shop, order, items) {
    const orderId = cleanText(order?.order_id)
    if (!orderId) return null
    return compactFeeDetail({
      order_id: orderId,
      platform: 'lazada',
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      source: 'lazada.orders.get+order.items.get',
      fee_commission: preferOrderOrItems(order, items,
        ['commission', 'commission_amount', 'platform_commission', 'fee_commission', 'seller_commission'],
        ['commission', 'commission_amount', 'platform_commission', 'fee_commission', 'seller_commission']
      ),
      fee_payment: preferOrderOrItems(order, items,
        ['payment_fee', 'transaction_fee', 'fee_payment', 'seller_transaction_fee'],
        ['payment_fee', 'transaction_fee', 'fee_payment', 'seller_transaction_fee']
      ),
      fee_service: preferOrderOrItems(order, items,
        ['service_fee', 'fee_service', 'seller_service_fee', 'processing_fee'],
        ['service_fee', 'fee_service', 'seller_service_fee', 'processing_fee']
      ),
      fee_handling: preferOrderOrItems(order, items,
        ['handling_fee', 'lazada_handling_fee', 'package_fee'],
        ['handling_fee', 'lazada_handling_fee', 'package_fee']
      ),
      fee_affiliate: preferOrderOrItems(order, items,
        ['affiliate_fee', 'affiliate_commission', 'fee_affiliate'],
        ['affiliate_fee', 'affiliate_commission', 'fee_affiliate']
      ),
      fee_ads: preferOrderOrItems(order, items,
        ['ads_fee', 'marketing_fee', 'sponsored_fee', 'fee_ads'],
        ['ads_fee', 'marketing_fee', 'sponsored_fee', 'fee_ads']
      ),
      fee_shipping: preferOrderOrItems(order, items,
        ['seller_shipping_fee', 'shipping_fee_seller', 'actual_shipping_fee', 'logistics_fee', 'shipment_fee'],
        ['seller_shipping_fee', 'shipping_fee_seller', 'actual_shipping_fee', 'logistics_fee', 'shipment_fee']
      ),
      tax_vat: preferOrderOrItems(order, items,
        ['vat_amount', 'tax_vat', 'seller_tax'],
        ['vat_amount', 'tax_vat', 'seller_tax']
      ),
      tax_pit: preferOrderOrItems(order, items,
        ['withholding_tax', 'tax_pit', 'pit_amount'],
        ['withholding_tax', 'tax_pit', 'pit_amount']
      ),
      settlement: pickFee(order, ['seller_income', 'seller_amount', 'payout_amount', 'settlement_amount']),
      raw_data: JSON.stringify({ order, sample_items: (items || []).slice(0, 3) }).slice(0, 12000)
    })
  }
  core.normalizeLazadaFeeDetail = normalizeLazadaFeeDetail

  function buildLazadaImportPayload(shop, orderRows, itemRowsByOrder, traceStatusByOrder = new Map()) {
    const payload = {
      source_mode: ORDER_SOURCE_MODES.API_SYNC,
      source_detail: 'Open Platform API Lazada kéo đơn và trạng thái theo thời gian thực.',
      source_updated_at: nowBangkokText(),
      orders: [],
      items: [],
      feeDetails: []
    }

    for (const order of orderRows) {
      const orderId = cleanText(order?.order_id)
      if (!orderId) continue

      const items = itemRowsByOrder.get(orderId) || []
      const feeDetail = normalizeLazadaFeeDetail(shop, order, items)
      if (feeDetail) payload.feeDetails.push(feeDetail)
      const firstItem = items[0] || {}
      const rawStatus = firstText(
        Array.isArray(order?.statuses) ? order.statuses[0] : '',
        firstItem.status,
        firstItem.item_status,
        firstItem.order_item_status,
        'pending'
      ).toLowerCase()
      const carrier = normalizeLazadaCarrier(order, firstItem)
      const tracking = normalizeLazadaTracking(order, firstItem)
      let mapped = mapPlatformStatus('lazada', rawStatus, carrier, tracking)
      const itemStatus = firstText(firstItem.status, firstItem.item_status, firstItem.order_item_status).toLowerCase()
      if (itemStatus) mapped = mapPlatformStatus('lazada', itemStatus, carrier, tracking)
      const traceMapped = traceStatusByOrder.get(orderId)
      if (traceMapped) mapped = traceMapped

      let itemTotal = 0
      for (const item of items) {
        const qty = Number(item.quantity || item.qty || 1) || 1
        const price = toMoney(item.item_price || item.paid_price || item.price || item.unit_price)
        itemTotal += price * qty
        payload.items.push({
          order_id: orderId,
          sku: firstText(item.sku, item.seller_sku, item.shop_sku),
          product_name: firstText(item.name, item.product_name, item.item_name, 'San pham Lazada'),
          variation_name: firstText(item.variation, item.variation_name, item.sku_name),
          qty,
          revenue_line: price * qty,
          image_url: normalizeLazadaItemImage(item)
        })
      }

      const revenue = toMoney(order.price || order.order_total || order.total_amount) || itemTotal
      payload.orders.push({
        order_id: orderId,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        platform: 'lazada',
        customer_name: firstText(order.customer_first_name, order.customer_name, order.address_shipping?.first_name, 'Khach Lazada'),
        order_date: normalizeLazadaDate(order.created_at || order.created_time || order.create_time),
        revenue,
        raw_revenue: revenue,
        shipping_fee: toMoney(order.shipping_fee),
        shipping_carrier: carrier,
        tracking_number: tracking,
        oms_status: mapped.oms,
        order_type: mapped.type,
        cancel_reason: mapped.reason || '',
        shipping_status: mapped.shipping,
        ...feeDetailToPayload(feeDetail)
      })
    }

    return payload
  }
  core.buildLazadaImportPayload = buildLazadaImportPayload

  async function importLazadaShop(env, cors, shop, options = {}) {
    const warnings = []
    const orderRows = await listLazadaOrders(env, shop, { ...options, warnings })
    const itemRowsByOrder = new Map()
    const traceStatusByOrder = new Map()
    let sellerId = ''
    let traced = 0
    const focusedShopSync = !!cleanText(options.shop)
    const traceBudget = focusedShopSync ? Math.min(orderRows.length, 12) : Math.min(orderRows.length, 4)

    for (const order of orderRows) {
      const orderId = cleanText(order?.order_id)
      if (!orderId) continue
      try {
        const data = await callLazadaWithShop(env, shop, '/order/items/get', { order_id: orderId })
        const items = Array.isArray(data?.data) ? data.data : []
        itemRowsByOrder.set(orderId, items)
        const packageIds = uniqueTexts(items.map(item => item.package_id || item.ofc_package_id))
        if (packageIds.length && traced < traceBudget) {
          try {
            if (!sellerId) sellerId = await getLazadaSellerIdForShop(env, shop)
            const traceData = await getLazadaTraceForShop(env, shop, sellerId, orderId, packageIds)
            const traceMapped = mapLazadaTraceStatus(traceData)
            if (traceMapped) traceStatusByOrder.set(orderId, traceMapped)
            traced++
          } catch (traceError) {
            warnings.push({ order_id: orderId, stage: 'logistic/order/trace', message: traceError.message })
          }
        }
      } catch (error) {
        warnings.push({ order_id: orderId, stage: 'order/items/get', message: error.message })
        itemRowsByOrder.set(orderId, [])
      }
    }

    const payload = buildLazadaImportPayload(shop, orderRows, itemRowsByOrder, traceStatusByOrder)
    const saved_fee_details = await saveOrderFeeDetails(env, payload.feeDetails)
    const imported = await importPayload(env, cors, payload)
    return {
      shop: shop.shop_name,
      fetched: orderRows.length,
      imported_orders: imported.imported_orders || 0,
      imported_items: imported.imported_items || 0,
      traced,
      saved_fee_details,
      order_push: imported.order_push || { sent: 0, total: 0, notified: 0 },
      warnings
    }
  }
  core.importLazadaShop = importLazadaShop

  async function importPayload(env, cors, payload) {
    if (!payload.orders.length) return { imported_orders: 0, imported_items: 0, skipped: 0 }
    const request = new Request('https://worker.local/api/import-orders-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const response = await importOrdersV2(request, env, cors)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || JSON.stringify(data))
    return data
  }
  core.importPayload = importPayload
}
