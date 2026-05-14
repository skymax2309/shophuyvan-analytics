export function installApiSyncShopeeOrdersSync(core) {
  const ORDER_SOURCE_MODES = core.ORDER_SOURCE_MODES
  const cleanCarrier = (...args) => core.cleanCarrier(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const collectShopeePackageStatus = core.collectShopeePackageStatus
  const compactFeeDetail = (...args) => core.compactFeeDetail(...args)
  const fetchShopeeShopJson = core.fetchShopeeShopJson
  const feeDetailToPayload = (...args) => core.feeDetailToPayload(...args)
  const firstPackage = (...args) => core.firstPackage(...args)
  const firstText = (...args) => core.firstText(...args)
  const fromUnixSeconds = (...args) => core.fromUnixSeconds(...args)
  const getCostSettings = core.getCostSettings
  const getRecentOpenOrders = (...args) => core.getRecentOpenOrders(...args)
  const loadSyncedOrderForPush = (...args) => core.loadSyncedOrderForPush(...args)
  const mapShopeeStatus = core.mapShopeeStatus
  const notifyOrderSubscribers = core.notifyOrderSubscribers
  const nowBangkokText = core.nowBangkokText
  const pickFee = (...args) => core.pickFee(...args)
  const pickSignedFee = (...args) => core.pickSignedFee(...args)
  const saveOrderFeeDetails = (...args) => core.saveOrderFeeDetails(...args)
  const updateOrderFinancialsFromFeeDetail = (...args) => core.updateOrderFinancialsFromFeeDetail(...args)
  const updateSyncedOrder = (...args) => core.updateSyncedOrder(...args)
  const updateSyncedOrderBuyerIdentity = (...args) => core.updateSyncedOrderBuyerIdentity(...args)

  function normalizeShopeeFeeDetail(shop, orderSn, data) {
    const response = data?.response || {}
    const income = response.order_income || response.escrow_detail || response || {}
    return compactFeeDetail({
      order_id: cleanText(orderSn),
      platform: 'shopee',
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      source: 'shopee.payment.get_escrow_detail',
      fee_commission: pickFee(income, ['commission_fee', 'fixed_fee', 'seller_commission_fee', 'platform_commission_fee']),
      fee_payment: pickFee(income, ['seller_transaction_fee', 'credit_card_transaction_fee', 'transaction_fee', 'payment_fee', 'seller_payment_fee']),
      fee_service: pickFee(income, ['service_fee', 'seller_service_fee', 'seller_service_charge', 'campaign_service_fee']),
      fee_affiliate: pickFee(income, ['seller_affiliate_commission', 'affiliate_commission', 'affiliate_fee', 'order_ams_commission_fee', 'ams_commission_fee']),
      fee_piship: pickFee(income, ['shipping_seller_protection_fee_amount', 'piship_fee', 'piship_service_fee', 'rsf_seller_protection_fee', 'seller_protection_fee']),
      fee_ads: pickFee(income, ['ads_fee', 'seller_ads_fee', 'marketing_fee']),
      tax_vat: pickFee(income, ['withholding_vat_tax', 'withholding_tax', 'escrow_tax']),
      tax_pit: pickFee(income, ['withholding_pit_tax']),
      settlement: pickSignedFee(income, ['escrow_amount', 'seller_amount', 'seller_income', 'order_income']),
      raw_data: JSON.stringify(response).slice(0, 12000)
    })
  }
  core.normalizeShopeeFeeDetail = normalizeShopeeFeeDetail

  async function fetchShopeeOrderFeeDetail(fetchEscrowDetail, shop, orderSn) {
    if (!orderSn) return null
    const data = await fetchEscrowDetail({ order_sn: orderSn })
    return normalizeShopeeFeeDetail(shop, orderSn, data)
  }
  core.fetchShopeeOrderFeeDetail = fetchShopeeOrderFeeDetail

  function shouldFetchShopeeFee(order) {
    const status = cleanText(order?.order_status).toUpperCase()
    if (!status || status === 'UNPAID') return false
    return [
      'READY_TO_SHIP',
      'PROCESSED',
      'SHIPPED',
      'TO_CONFIRM_RECEIVE',
      'COMPLETED',
      'CANCELLED',
      'IN_CANCEL'
    ].includes(status)
  }
  core.shouldFetchShopeeFee = shouldFetchShopeeFee

  async function getShopeeTrackingNumber(fetchTrackingNumber, orderSn, packageNumber) {
    if (!orderSn || !packageNumber) return ''
    try {
      const data = await fetchTrackingNumber({
        order_sn: orderSn,
        package_number: packageNumber
      })
      return firstText(data.response?.tracking_number)
    } catch (error) {
      console.error(`[API_SYNC_SHOPEE_TRACKING] ${orderSn}: ${error.message}`)
      return ''
    }
  }
  core.getShopeeTrackingNumber = getShopeeTrackingNumber

  async function syncShopeeShop(env, shop, limitPerShop, onlyOrderId, offsetRows = 0, days = 60) {
    if (!shop.api_shop_id) return { shop: shop.shop_name, checked: 0, updated: 0 }
    const orders = await getRecentOpenOrders(env, 'shopee', shop, limitPerShop, onlyOrderId, offsetRows, days)
    if (!orders.length) return { shop: shop.shop_name, checked: 0, updated: 0 }

    const path = '/api/v2/order/get_order_detail'
    const fetchOrderDetail = params => fetchShopeeShopJson(env, shop, path, params)
    const fetchTrackingNumber = params => fetchShopeeShopJson(env, shop, '/api/v2/logistics/get_tracking_number', params)
    const fetchEscrowDetail = params => fetchShopeeShopJson(env, shop, '/api/v2/payment/get_escrow_detail', params)
    let checked = 0
    let updated = 0
    let feeUpdated = 0
    const feeDetails = []
    const pushRows = []
    const warnings = []
    const cfg = await getCostSettings(env)
    const feeRefreshBudget = onlyOrderId ? 1 : Math.min(Math.max(Number(limitPerShop || 0) || 0, 0), 20)

    for (let i = 0; i < orders.length; i += 50) {
      const chunk = orders.slice(i, i + 50)
      try {
        const data = await fetchOrderDetail({
          order_sn_list: chunk.map(o => o.order_id).join(','),
          request_order_status_pending: true,
          response_optional_fields: 'buyer_user_id,buyer_username,recipient_address,shipping_carrier,checkout_shipping_carrier,package_list,cancel_reason,buyer_cancel_reason,cancel_by,pay_time,payment_method,return_request_due_date,payment_info'
        })
        const list = data.response?.order_list || []
        for (const order of list) {
          const pkg = firstPackage(order)
          const carrier = cleanCarrier(firstText(order.shipping_carrier, pkg.shipping_carrier, pkg.logistics_channel_name, order.checkout_shipping_carrier))
          let tracking = firstText(order.tracking_no, order.tracking_number, pkg.tracking_number, pkg.tracking_no)
          if (!tracking) tracking = await getShopeeTrackingNumber(fetchTrackingNumber, order.order_sn, pkg.package_number)
          const mapped = mapShopeeStatus(order.order_status, collectShopeePackageStatus(order, pkg), tracking)
          const changed = await updateSyncedOrder(env, order.order_sn, mapped, carrier, tracking)
          await updateSyncedOrderBuyerIdentity(env, order)
          updated += changed
          if (changed) {
            const pushRow = await loadSyncedOrderForPush(env, order.order_sn, 'changed')
            if (pushRow) pushRows.push(pushRow)
          }
          if (shouldFetchShopeeFee(order) && feeDetails.length < feeRefreshBudget) {
            try {
              const feeDetail = await fetchShopeeOrderFeeDetail(fetchEscrowDetail, shop, order.order_sn)
              if (feeDetail) {
                feeDetails.push(feeDetail)
                feeUpdated += await updateOrderFinancialsFromFeeDetail(env, order.order_sn, feeDetail, cfg)
              }
            } catch (feeError) {
              warnings.push({
                stage: 'payment.get_escrow_detail',
                order_id: order.order_sn,
                message: feeError?.message || String(feeError)
              })
              console.error(`[API_SYNC_SHOPEE_FEE] ${shop.shop_name} ${order.order_sn}: ${feeError.message}`)
            }
          }
          checked++
        }
      } catch (error) {
        warnings.push({
          stage: 'order.get_order_detail',
          order_ids: chunk.map(o => o.order_id).filter(Boolean).slice(0, 50),
          message: error?.message || String(error)
        })
        console.error(`[API_SYNC_SHOPEE] ${shop.shop_name}: ${error.message}`)
      }
    }

    const saved_fee_details = await saveOrderFeeDetails(env, feeDetails)
    let orderPush = { sent: 0, total: 0, notified: 0 }
    if (pushRows.length) {
      // Batch reconcile chạy nền ưu tiên cập nhật dữ liệu đơn trước; chỉ gửi push ngay với lô rất nhỏ để tránh quá quota Worker.
      orderPush = await notifyOrderSubscribers(env, pushRows, { reason: 'changed', deliver_now: pushRows.length <= 5 }).catch(error => ({
        sent: 0,
        total: 0,
        notified: 0,
        error: error?.message || String(error)
      }))
    }
    return { shop: shop.shop_name, checked, updated, fee_updated: feeUpdated, saved_fee_details, order_push: orderPush, warnings }
  }
  core.syncShopeeShop = syncShopeeShop

  async function listShopeeOrderSns(fetchOrderList, options = {}) {
    const now = Math.floor(Date.now() / 1000)
    const days = Math.max(1, Math.min(Number(options.days || 15) || 15, 120))
    const limit = Math.max(1, Math.min(Number(options.limit || 300) || 300, 500))
    const warnings = Array.isArray(options.warnings) ? options.warnings : []
    const statuses = options.statuses?.length
      ? options.statuses
      : ['PENDING', 'READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'IN_CANCEL']
    const orderSns = []
    const seenOrderSns = new Set()
    const absoluteFrom = now - days * 86400
    const windows = []

    // Shopee chỉ cho tối đa 15 ngày mỗi lần gọi get_order_list.
    // Vì vậy phải chia cửa sổ để tránh trường hợp giao diện chọn 30-60 ngày nhưng code âm thầm chỉ kéo 15 ngày.
    for (let windowTo = now; windowTo > absoluteFrom && orderSns.length < limit;) {
      const windowFrom = Math.max(absoluteFrom, windowTo - (15 * 86400 - 1))
      windows.push({ time_from: windowFrom, time_to: windowTo })
      if (windowFrom <= absoluteFrom) break
      windowTo = windowFrom - 1
    }

    for (const window of windows) {
      for (const status of statuses) {
        let cursor = ''
        for (let guard = 0; guard < 20 && orderSns.length < limit; guard++) {
          let data
          try {
            const params = {
              time_range_field: 'update_time',
              time_from: window.time_from,
              time_to: window.time_to,
              page_size: 50,
              cursor,
              request_order_status_pending: status === 'PENDING'
            }
            if (status !== 'PENDING') params.order_status = status
            data = await fetchOrderList(params)
          } catch (error) {
            warnings.push({
              status,
              time_from: window.time_from,
              time_to: window.time_to,
              message: error.message
            })
            console.error(`[API_SYNC_SHOPEE_LIST] status ${status} ${window.time_from}-${window.time_to}: ${error.message}`)
            break
          }
          const list = data.response?.order_list || []
          for (const item of list) {
            const orderSn = firstText(item.order_sn)
            if (orderSn && !seenOrderSns.has(orderSn)) {
              seenOrderSns.add(orderSn)
              orderSns.push(orderSn)
            }
          }
          if (!data.response?.more || orderSns.length >= limit) break
          cursor = data.response?.next_cursor || ''
          if (!cursor) break
        }
      }
    }

    return orderSns.slice(0, limit)
  }
  core.listShopeeOrderSns = listShopeeOrderSns

  async function fetchShopeeOrderDetails(fetchOrderDetail, orderSns) {
    const rows = []
    for (let i = 0; i < orderSns.length; i += 50) {
      const chunk = orderSns.slice(i, i + 50)
      const data = await fetchOrderDetail({
        order_sn_list: chunk.join(','),
        request_order_status_pending: true,
        response_optional_fields: 'buyer_user_id,buyer_username,item_list,recipient_address,total_amount,shipping_carrier,checkout_shipping_carrier,package_list,cancel_reason,buyer_cancel_reason,cancel_by,pay_time,payment_method,return_request_due_date,payment_info'
      })
      rows.push(...(data.response?.order_list || []))
    }
    return rows
  }
  core.fetchShopeeOrderDetails = fetchShopeeOrderDetails

  function normalizeShopeeCarrier(order, pkg) {
    const carrier = cleanCarrier(firstText(order.shipping_carrier, pkg.shipping_carrier, pkg.logistics_channel_name))
    const checkout = firstText(order.checkout_shipping_carrier, pkg.checkout_shipping_carrier)
    if (carrier) return carrier
    if (checkout.toLowerCase() === 'nhanh' || checkout === 'Standard') return 'SPX Express - Nhanh'
    if (checkout.toLowerCase() === 'hỏa tốc' || checkout === 'Instant') return 'SPX Express - Hỏa Tốc'
    if (checkout.toLowerCase() === 'tiết kiệm' || checkout === 'Economy') return 'SPX Express - Tiết Kiệm'
    return checkout || 'SPX Express'
  }
  core.normalizeShopeeCarrier = normalizeShopeeCarrier

  function buildShopeeImportPayload(shop, orders) {
    const payload = {
      source_mode: ORDER_SOURCE_MODES.API_SYNC,
      source_detail: 'Open Platform API Shopee kéo đơn và trạng thái theo thời gian thực.',
      source_updated_at: nowBangkokText(),
      orders: [],
      items: []
    }
    for (const order of orders) {
      if (order.order_status === 'UNPAID') continue
      const pkg = firstPackage(order)
      const tracking = firstText(order._tracking_number, order.tracking_no, order.tracking_number, pkg.tracking_number, pkg.tracking_no)
      const mapped = mapShopeeStatus(order.order_status, collectShopeePackageStatus(order, pkg), tracking)
      const carrier = normalizeShopeeCarrier(order, pkg)
      const itemList = Array.isArray(order.item_list) ? order.item_list : []
      let itemTotal = 0

      for (const item of itemList) {
        const qty = Number(item.model_quantity_purchased || item.quantity || 1) || 1
        const price = Number(item.model_discounted_price || item.model_original_price || item.item_price || 0) || 0
        itemTotal += price * qty
        const image = firstText(item.image_info?.image_url)
        payload.items.push({
          order_id: order.order_sn,
          sku: firstText(item.model_sku, item.item_sku),
          product_name: firstText(item.item_name, 'Sản phẩm Shopee'),
          variation_name: firstText(item.model_name),
          qty,
          revenue_line: price * qty,
          image_url: image && !image.startsWith('http') ? `https://cf.shopee.vn/file/${image}` : image
        })
      }

      const revenue = Number(order.total_amount || 0) || itemTotal
      payload.orders.push({
        order_id: order.order_sn,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        platform: 'shopee',
        buyer_id: firstText(order.buyer_user_id, order.buyer_id),
        buyer_username: firstText(order.buyer_username),
        customer_name: firstText(order.buyer_username, order.recipient_address?.name, 'Khách Shopee'),
        order_date: fromUnixSeconds(order.create_time),
        revenue,
        raw_revenue: revenue,
        shipping_carrier: carrier,
        tracking_number: tracking,
        oms_status: mapped.oms,
        order_type: mapped.type,
        cancel_reason: firstText(order.cancel_reason, order.buyer_cancel_reason, mapped.reason),
        shipping_status: mapped.shipping,
        ...feeDetailToPayload(order._fee_detail)
      })
    }
    return payload
  }
  core.buildShopeeImportPayload = buildShopeeImportPayload
}
