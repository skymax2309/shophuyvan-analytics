export function installApiSyncCommonShopAuth(core) {
  const LAZADA_APP_KEY = core.LAZADA_APP_KEY
  const LAZADA_SECRET = core.LAZADA_SECRET
  const SHOPEE_AMS_OPEN_CAMPAIGN_ADDED_PRODUCT_PATH = core.SHOPEE_AMS_OPEN_CAMPAIGN_ADDED_PRODUCT_PATH
  const cleanCarrier = (...args) => core.cleanCarrier(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const firstText = (...args) => core.firstText(...args)
  const getCostSettings = core.getCostSettings
  const getShopeeAppFromRowForClient = core.getShopeeAppFromRowForClient || core.getShopeeAppFromRow
  const listApiCapableShopCredentials = core.listApiCapableShopCredentials
  const loadSyncedOrderForPush = (...args) => core.loadSyncedOrderForPush(...args)
  const mapLazadaTraceStatus = (...args) => core.mapLazadaTraceStatus(...args)
  const mapPlatformStatus = (...args) => core.mapPlatformStatus(...args)
  const normalizeLazadaFeeDetail = (...args) => core.normalizeLazadaFeeDetail(...args)
  const normalizeShopeeOpenCampaignProduct = (...args) => core.normalizeShopeeOpenCampaignProduct(...args)
  const notifyOrderSubscribers = core.notifyOrderSubscribers
  const refreshLazadaTokenForShop = core.refreshLazadaTokenForShop
  const refreshShopeeTokenForShop = core.refreshShopeeTokenForShop
  const saveOrderFeeDetails = (...args) => core.saveOrderFeeDetails(...args)
  const signHmacHex = core.signHmacHex
  const uniqueTexts = (...args) => core.uniqueTexts(...args)
  const updateOrderFinancialsFromFeeDetail = (...args) => core.updateOrderFinancialsFromFeeDetail(...args)
  const updateSyncedOrder = (...args) => core.updateSyncedOrder(...args)

  async function getApiShops(env, platform, shopFilter = '', maxShops = 20) {
    return listApiCapableShopCredentials(env, {
      platform,
      shop: shopFilter,
      maxShops
    })
  }
  core.getApiShops = getApiShops

  async function getRecentOpenOrders(env, platform, shop, limitPerShop, onlyOrderId = '', offsetRows = 0, days = 60) {
    const ids = [shop.shop_name, shop.user_name, shop.api_shop_id].map(value => cleanText(value).toLowerCase()).filter(Boolean)
    const marks = ids.map(() => '?').join(',')
    const params = [cleanText(platform).toLowerCase(), ...ids]
    const windowDays = Math.max(1, Math.min(Number(days || 60) || 60, 120))
    const pendingOmsStatuses = ['PENDING', 'SHIPPING', 'SHIPPED', 'RETURN']
    const pendingShippingStatuses = [
      'LOGISTICS_PENDING_ARRANGE',
      'LOGISTICS_REQUEST_CREATED',
      'LOGISTICS_PACKAGED',
      'IN_CANCEL',
      'SHIPPED',
      'TO_CONFIRM_RECEIVE',
      'FAILED_DELIVERY_ATTEMPT',
      'TO_RETURN',
      'RETURN',
      'RETURN_REFUND',
      'LOGISTICS_IN_RETURN',
      'LOGISTICS_RETURNED_BY_SHIPPER',
      'LOGISTICS_RETURN_PACKAGE_RECEIVED',
      'LOGISTICS_LOST'
    ]
    let extra = ''
    if (onlyOrderId) {
      extra = 'AND order_id = ?'
      params.push(onlyOrderId)
    } else {
      // Quét lại theo thời điểm OMS cập nhật gần nhất thay vì chỉ nhìn ngày tạo đơn.
      // Cách này giữ được các đơn đang giao, chuẩn bị hoàn hoặc vừa đổi trạng thái.
      extra = `
        AND datetime(COALESCE(NULLIF(oms_updated_at, ''), order_date)) >= datetime('now', '+7 hours', ?)
        AND (
          COALESCE(oms_status, '') IN (${pendingOmsStatuses.map(() => '?').join(',')})
          OR COALESCE(shipping_status, '') IN (${pendingShippingStatuses.map(() => '?').join(',')})
        )
      `
      params.push(`-${windowDays} days`)
      params.push(...pendingOmsStatuses, ...pendingShippingStatuses)
    }
    const offset = Math.max(0, Number(offsetRows || 0) || 0)
    params.push(limitPerShop, offset)

    const { results } = await env.DB.prepare(`
      SELECT order_id, shipping_status, shipping_carrier, tracking_number
      FROM orders_v2
      WHERE LOWER(COALESCE(platform, '')) = ?
        AND LOWER(TRIM(COALESCE(shop, ''))) IN (${marks || "''"})
        ${extra}
      ORDER BY
        CASE
          WHEN shipping_status IN ('LOGISTICS_PACKAGED', 'LOGISTICS_REQUEST_CREATED') THEN 0
          WHEN shipping_status IN ('SHIPPED', 'TO_CONFIRM_RECEIVE') THEN 1
          WHEN oms_status IN ('SHIPPING', 'SHIPPED') THEN 2
          WHEN oms_status = 'RETURN' THEN 3
          ELSE 4
        END,
        datetime(COALESCE(NULLIF(oms_updated_at, ''), order_date)) DESC
      LIMIT ? OFFSET ?
    `).bind(...params).all()
    return results || []
  }
  core.getRecentOpenOrders = getRecentOpenOrders

  async function signLazada(path, accessToken, params = {}) {
    const base = {
      app_key: LAZADA_APP_KEY,
      timestamp: String(Date.now()),
      sign_method: 'sha256',
      access_token: accessToken,
      ...params
    }
    const signString = path + Object.keys(base).sort().map(key => `${key}${base[key]}`).join('')
    const sign = (await signHmacHex(LAZADA_SECRET, signString)).toUpperCase()
    return { ...base, sign }
  }
  core.signLazada = signLazada

  async function callLazada(path, accessToken, params = {}, method = 'GET') {
    const finalParams = await signLazada(path, accessToken, params)
    const httpMethod = String(method || 'GET').toUpperCase()
    const url = `https://api.lazada.vn/rest${path}`
    const res = httpMethod === 'POST'
      ? await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json;charset=utf-8' },
          body: JSON.stringify(finalParams)
        })
      : await fetch(`${url}?${new URLSearchParams(finalParams)}`)
    const data = await res.json()
    if (data.code && data.code !== '0') throw new Error(data.message || data.code)
    return data
  }
  core.callLazada = callLazada

  async function getLazadaSellerId(accessToken) {
    const data = await callLazada('/seller/get', accessToken)
    return cleanText(data?.data?.seller_id)
  }
  core.getLazadaSellerId = getLazadaSellerId

  async function getLazadaTrace(accessToken, sellerId, orderId, packageIds) {
    if (!sellerId || !packageIds.length) return null
    return callLazada('/logistic/order/trace', accessToken, {
      seller_id: sellerId,
      order_id: orderId,
      locale: 'vi_VN',
      ofc_package_id_list: JSON.stringify(packageIds)
    })
  }
  core.getLazadaTrace = getLazadaTrace

  async function syncLazadaShop(env, shop, limitPerShop, onlyOrderId, offsetRows = 0, days = 60) {
    const orders = await getRecentOpenOrders(env, 'lazada', shop, limitPerShop, onlyOrderId, offsetRows, days)
    let checked = 0
    let updated = 0
    let feeUpdated = 0
    let sellerId = ''
    const feeDetails = []
    const pushRows = []
    const warnings = []
    const cfg = await getCostSettings(env)

    for (const order of orders) {
      try {
        if (!sellerId) {
          const sellerData = await callLazadaWithShop(env, shop, '/seller/get')
          sellerId = cleanText(sellerData?.data?.seller_id)
        }
        const data = await callLazadaWithShop(env, shop, '/order/items/get', { order_id: order.order_id })
        const items = Array.isArray(data.data) ? data.data : []
        const first = items[0] || {}
        const rawStatus = first.status || first.item_status || first.order_item_status || ''
        const carrier = cleanCarrier(first.shipment_provider || first.shipping_provider || first.logistics_provider)
        const tracking = firstText(first.tracking_code, first.tracking_number, first.tracking_no)
        let mapped = mapPlatformStatus('lazada', rawStatus, carrier, tracking)
        const packageIds = uniqueTexts(items.map(item => item.package_id || item.ofc_package_id))
        const shouldTrace = packageIds.length && (
          carrier ||
          tracking ||
          ['LOGISTICS_PACKAGED', 'LOGISTICS_REQUEST_CREATED', 'SHIPPED'].includes(mapped.shipping)
        )
        if (shouldTrace) {
          try {
            const traceData = await callLazadaWithShop(env, shop, '/logistic/order/trace', {
              seller_id: sellerId,
              order_id: order.order_id,
              locale: 'vi_VN',
              ofc_package_id_list: JSON.stringify(packageIds)
            })
            const traceMapped = mapLazadaTraceStatus(traceData)
            if (traceMapped) mapped = traceMapped
          } catch (traceError) {
            warnings.push({
              stage: 'logistic.order.trace',
              order_id: order.order_id,
              message: traceError?.message || String(traceError)
            })
            console.error(`[API_SYNC_LAZADA_TRACE] ${shop.shop_name} ${order.order_id}: ${traceError.message}`)
          }
        }
        const changed = await updateSyncedOrder(env, order.order_id, mapped, carrier, tracking)
        updated += changed
        if (changed) {
          const pushRow = await loadSyncedOrderForPush(env, order.order_id, 'changed')
          if (pushRow) pushRows.push(pushRow)
        }
        const feeDetail = normalizeLazadaFeeDetail(shop, { order_id: order.order_id }, items)
        if (feeDetail) {
          feeDetails.push(feeDetail)
          feeUpdated += await updateOrderFinancialsFromFeeDetail(env, order.order_id, feeDetail, cfg)
        }
        checked++
      } catch (error) {
        warnings.push({
          stage: 'order.items.get',
          order_id: order.order_id,
          message: error?.message || String(error)
        })
        console.error(`[API_SYNC_LAZADA] ${shop.shop_name} ${order.order_id}: ${error.message}`)
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
  core.syncLazadaShop = syncLazadaShop

  function signShopeeUrl(app, path, accessToken, shopId) {
    return async function(params = {}) {
      const timestamp = Math.floor(Date.now() / 1000)
      const baseString = `${app.partnerId}${path}${timestamp}${accessToken}${shopId}`
      const sign = await signHmacHex(app.partnerKey, baseString)
      const url = new URL(`https://partner.shopeemobile.com${path}`)
      url.searchParams.set('partner_id', app.partnerId)
      url.searchParams.set('timestamp', String(timestamp))
      url.searchParams.set('access_token', accessToken)
      url.searchParams.set('shop_id', String(shopId))
      url.searchParams.set('sign', sign)
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
      return url.toString()
    }
  }
  core.signShopeeUrl = signShopeeUrl

  function signShopeePublicUrl(app, path) {
    return async function(params = {}) {
      const timestamp = Math.floor(Date.now() / 1000)
      const baseString = `${app.partnerId}${path}${timestamp}`
      const sign = await signHmacHex(app.partnerKey, baseString)
      const url = new URL(`https://partner.shopeemobile.com${path}`)
      url.searchParams.set('partner_id', app.partnerId)
      url.searchParams.set('timestamp', String(timestamp))
      url.searchParams.set('sign', sign)
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
      return url.toString()
    }
  }
  core.signShopeePublicUrl = signShopeePublicUrl

  function shopeeClientTypeForPath(path = '') {
    return cleanText(path).startsWith('/api/v2/ads/') ? 'ads_client' : 'marketplace_client'
  }
  core.shopeeClientTypeForPath = shopeeClientTypeForPath

  async function fetchShopeeJson(buildUrl, params) {
    const url = await buildUrl(params)
    const res = await fetch(url)
    const text = await res.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Shopee API trả phản hồi không phải JSON, HTTP ${res.status}`)
    }
    if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
    if (data.error) throw new Error(data.message || data.msg || data.error)
    return data
  }
  core.fetchShopeeJson = fetchShopeeJson

  async function fetchShopeeJsonPost(buildUrl, params, body) {
    const url = await buildUrl(params)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    })
    const text = await res.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Shopee API trả phản hồi không phải JSON, HTTP ${res.status}`)
    }
    if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
    if (data.error) throw new Error(data.message || data.msg || data.error)
    return data
  }
  core.fetchShopeeJsonPost = fetchShopeeJsonPost

  function isShopeeInvalidAccessTokenMessage(message) {
    const text = cleanText(message).toLowerCase()
    return text.includes('invalid_access_token') ||
      text.includes('invalid access_token') ||
      text.includes('invalid_acceess_token')
  }
  core.isShopeeInvalidAccessTokenMessage = isShopeeInvalidAccessTokenMessage

  function isLazadaInvalidAccessTokenMessage(message) {
    const text = cleanText(message).toLowerCase()
    return text.includes('access token is invalid') ||
      text.includes('access token is expired') ||
      text.includes('invalid or expired')
  }
  core.isLazadaInvalidAccessTokenMessage = isLazadaInvalidAccessTokenMessage

  function friendlyAdsTokenMessage(platform, shop, message, retried = false) {
    const name = cleanText(shop?.shop_name || shop?.user_name || shop?.api_shop_id || '')
    const suffix = retried
      ? ' Hệ thống đã thử làm mới token một lần nhưng vẫn chưa gọi được API.'
      : ''
    if (platform === 'shopee') {
      return `Token ADS Shopee của shop ${name || 'chưa rõ'} không còn hợp lệ hoặc shop chưa được cấp quyền ADS.${suffix}`
    }
    if (platform === 'lazada') {
      return `Token ADS Lazada của shop ${name || 'chưa rõ'} không còn hợp lệ hoặc quyền Sponsored Solutions chưa sẵn sàng.${suffix}`
    }
    return cleanText(message)
  }
  core.friendlyAdsTokenMessage = friendlyAdsTokenMessage

  function shopeeClientRuntimeAuth(env, shop, path) {
    const clientType = shopeeClientTypeForPath(path)
    const envPrefix = clientType === 'ads_client' ? 'SHOPEE_ADS' : 'SHOPEE_MARKETPLACE'
    const accessToken = cleanText(env?.[`${envPrefix}_ACCESS_TOKEN`]) || cleanText(shop.access_token)
    const refreshToken = cleanText(env?.[`${envPrefix}_REFRESH_TOKEN`]) || cleanText(shop.refresh_token)
    const shopId = cleanText(env?.[`${envPrefix}_SHOP_ID`]) || cleanText(shop.api_shop_id)
    return { clientType, accessToken, refreshToken, shopId }
  }

  async function fetchShopeeShopJson(env, shop, path, params = {}, retry = true) {
    const runtimeAuth = shopeeClientRuntimeAuth(env, shop, path)
    const app = getShopeeAppFromRowForClient(env, shop, runtimeAuth.clientType, shop.api_partner_id || shop.shop_name || shop.user_name)
    const buildUrl = signShopeeUrl(app, path, runtimeAuth.accessToken, runtimeAuth.shopId)
    try {
      return await fetchShopeeJson(buildUrl, params)
    } catch (error) {
      if (
        retry &&
        isShopeeInvalidAccessTokenMessage(error?.message) &&
        runtimeAuth.refreshToken &&
        runtimeAuth.shopId &&
        shop.id
      ) {
        try {
          const refreshed = await refreshShopeeTokenForShop(env, shop)
          shop.access_token = refreshed.access_token
          shop.refresh_token = refreshed.refresh_token
          return await fetchShopeeShopJson(env, shop, path, params, false)
        } catch (refreshError) {
          throw new Error(friendlyAdsTokenMessage('shopee', shop, refreshError?.message || error?.message, true))
        }
      }
      if (isShopeeInvalidAccessTokenMessage(error?.message)) {
        throw new Error(friendlyAdsTokenMessage('shopee', shop, error?.message, false))
      }
      throw error
    }
  }
  core.fetchShopeeShopJson = fetchShopeeShopJson

  async function fetchShopeeShopJsonPost(env, shop, path, params = {}, body = {}, retry = true) {
    const runtimeAuth = shopeeClientRuntimeAuth(env, shop, path)
    const app = getShopeeAppFromRowForClient(env, shop, runtimeAuth.clientType, shop.api_partner_id || shop.shop_name || shop.user_name)
    const buildUrl = signShopeeUrl(app, path, runtimeAuth.accessToken, runtimeAuth.shopId)
    try {
      return await fetchShopeeJsonPost(buildUrl, params, body)
    } catch (error) {
      if (
        retry &&
        isShopeeInvalidAccessTokenMessage(error?.message) &&
        runtimeAuth.refreshToken &&
        runtimeAuth.shopId &&
        shop.id
      ) {
        try {
          const refreshed = await refreshShopeeTokenForShop(env, shop)
          shop.access_token = refreshed.access_token
          shop.refresh_token = refreshed.refresh_token
          return await fetchShopeeShopJsonPost(env, shop, path, params, body, false)
        } catch (refreshError) {
          throw new Error(friendlyAdsTokenMessage('shopee', shop, refreshError?.message || error?.message, true))
        }
      }
      if (isShopeeInvalidAccessTokenMessage(error?.message)) {
        throw new Error(friendlyAdsTokenMessage('shopee', shop, error?.message, false))
      }
      throw error
    }
  }
  core.fetchShopeeShopJsonPost = fetchShopeeShopJsonPost

  async function fetchShopeeOpenCampaignAddedProducts(env, options = {}) {
    const pageSize = Math.max(1, Math.min(Number(options.page_size || options.pageSize || options.limit || 20), 100))
    const shopLimit = Math.max(1, Math.min(Number(options.shop_limit || options.shopLimit || 3), 20))
    const cursor = cleanText(options.cursor)
    const sortBy = cleanText(options.sort_by || options.sortBy)
    const searchType = cleanText(options.search_type || options.searchType)
    const searchContent = cleanText(options.search_content || options.searchContent)
    const shops = await getApiShops(env, 'shopee', cleanText(options.shop), shopLimit)
    const rows = []
    const results = []

    for (const shop of shops) {
      const params = { page_size: pageSize }
      if (cursor) params.cursor = cursor
      if (sortBy) params.sort_by = sortBy
      if (searchType) params.search_type = searchType
      if (searchContent) params.search_content = searchContent
      try {
        /**
         * AMS Open Campaign là dữ liệu đọc-only để xem SKU nào đang nằm trong chiến dịch affiliate.
         * Chưa tự sửa commission hoặc campaign vì thao tác đó ảnh hưởng chi phí marketing thật.
         */
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_AMS_OPEN_CAMPAIGN_ADDED_PRODUCT_PATH, params)
        const response = data.response || {}
        const itemList = Array.isArray(response.item_list) ? response.item_list : []
        const normalized = itemList.map(item => normalizeShopeeOpenCampaignProduct(item, shop))
        rows.push(...normalized)
        results.push({
          status: 'ok',
          shop: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id),
          total_count: Number(response.total_count || itemList.length || 0),
          fetched: normalized.length,
          has_more: Boolean(response.has_more),
          cursor: cleanText(response.cursor),
          request_id: cleanText(data.request_id)
        })
      } catch (error) {
        results.push({
          status: 'error',
          shop: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id),
          message: error?.message || String(error)
        })
      }
    }

    return {
      status: results.some(row => row.status === 'ok') ? 'ok' : 'partial_error',
      mode: 'shopee_ams_open_campaign_read_only',
      endpoint: SHOPEE_AMS_OPEN_CAMPAIGN_ADDED_PRODUCT_PATH,
      permission: 'Affiliate Marketing Solution Management',
      page_size: pageSize,
      fetched_products: rows.length,
      rows,
      shops: results
    }
  }
  core.fetchShopeeOpenCampaignAddedProducts = fetchShopeeOpenCampaignAddedProducts

  async function callLazadaWithShop(env, shop, path, params = {}, retry = true, method = 'GET') {
    try {
      return await callLazada(path, shop.access_token, params, method)
    } catch (error) {
      if (
        retry &&
        isLazadaInvalidAccessTokenMessage(error?.message) &&
        cleanText(shop.refresh_token) &&
        shop.id
      ) {
        try {
          const refreshed = await refreshLazadaTokenForShop(env, shop)
          shop.access_token = refreshed.access_token
          shop.refresh_token = refreshed.refresh_token
          return await callLazadaWithShop(env, shop, path, params, false, method)
        } catch (refreshError) {
          throw new Error(friendlyAdsTokenMessage('lazada', shop, refreshError?.message || error?.message, true))
        }
      }
      if (isLazadaInvalidAccessTokenMessage(error?.message)) {
        throw new Error(friendlyAdsTokenMessage('lazada', shop, error?.message, false))
      }
      throw error
    }
  }
  core.callLazadaWithShop = callLazadaWithShop
}
