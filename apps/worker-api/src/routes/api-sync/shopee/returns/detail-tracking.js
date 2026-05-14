export function installApiSyncShopeeReturnsDetailTracking(core) {
  const SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH = core.SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH
  const SHOPEE_RETURNS_GET_RETURN_LIST_PATH = core.SHOPEE_RETURNS_GET_RETURN_LIST_PATH
  const SHOPEE_RETURNS_GET_REVERSE_TRACKING_INFO_PATH = core.SHOPEE_RETURNS_GET_REVERSE_TRACKING_INFO_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanEpochSeconds = (...args) => core.cleanEpochSeconds(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const dateYmd = (...args) => core.dateYmd(...args)
  const ensureShopeeReturnsTable = (...args) => core.ensureShopeeReturnsTable(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const firstText = (...args) => core.firstText(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const roundAds = (...args) => core.roundAds(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const unixToIso = (...args) => core.unixToIso(...args)
  const ymdToBangkokEpoch = (...args) => core.ymdToBangkokEpoch(...args)

  function normalizeShopeeReturnDetail(data, shop) {
    const response = data?.response || data || {}
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      detail: normalizeShopeeReturnRow(response, shop, true)
    }
  }
  core.normalizeShopeeReturnDetail = normalizeShopeeReturnDetail

  async function fetchShopeeReturnDetailShop(env, shop, returnSn) {
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      return_sn: returnSn,
      request_id: '',
      error: '',
      message: '',
      detail: null
    }
    if (!returnSn) return { ...resultBase, error: 'missing_return_sn', message: 'Missing return_sn' }
    if (!shop.api_shop_id) return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, { return_sn: returnSn })
      return normalizeShopeeReturnDetail(data, shop)
    } catch (error) {
      return { ...resultBase, error: 'shopee_return_detail_failed', message: error?.message || String(error) }
    }
  }
  core.fetchShopeeReturnDetailShop = fetchShopeeReturnDetailShop

  async function fetchShopeeReturnDetail(env, options = {}) {
    const returnSn = cleanText(options.return_sn || options.returnSn)
    if (!returnSn) {
      return { status: 'error', mode: 'shopee_returns_get_return_detail', endpoint: SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH, error: 'missing_return_sn', message: 'Missing return_sn', shops: [], detail: null }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) {
      const row = await fetchShopeeReturnDetailShop(env, shop, returnSn)
      rows.push(row)
      if (row.ok && !options.scan_all_shops && !options.scanAllShops) break
    }
    const okRows = rows.filter(item => item.ok)
    return {
      status: 'ok',
      mode: 'shopee_returns_get_return_detail',
      endpoint: SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH,
      return_sn: returnSn,
      shop_count: rows.length,
      ok_count: okRows.length,
      shops: rows,
      detail: okRows[0]?.detail || null
    }
  }
  core.fetchShopeeReturnDetail = fetchShopeeReturnDetail

  function normalizeShopeeReverseTracking(data, shop, returnSn) {
    const response = data?.response || data || {}
    const trackingInfo = Array.isArray(response.tracking_info) ? response.tracking_info : []
    const postReturnInfo = Array.isArray(response.post_return_logistics_tracking_info) ? response.post_return_logistics_tracking_info : []
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      return_sn: cleanText(response.return_sn || returnSn),
      return_refund_request_type: response.return_refund_request_type ?? '',
      validation_type: cleanText(response.validation_type),
      reverse_logistics_status: cleanText(response.reverse_logistics_status),
      reverse_logistics_update_time: Number(response.reverse_logistics_update_time || 0) || 0,
      reverse_logistics_update_time_at: unixToIso(response.reverse_logistics_update_time),
      estimated_delivery_date_min: Number(response.estimated_delivery_date_min || 0) || 0,
      estimated_delivery_date_max: Number(response.estimated_delivery_date_max || 0) || 0,
      tracking_number: cleanText(response.tracking_number),
      tracking_info: trackingInfo,
      post_return_logistics_tracking_info: postReturnInfo,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      raw: response
    }
  }
  core.normalizeShopeeReverseTracking = normalizeShopeeReverseTracking

  async function fetchShopeeReverseTrackingInfoShop(env, shop, returnSn) {
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      return_sn: returnSn,
      request_id: '',
      error: '',
      message: '',
      tracking: null
    }
    if (!returnSn) return { ...resultBase, error: 'missing_return_sn', message: 'Missing return_sn' }
    if (!shop.api_shop_id) return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_RETURNS_GET_REVERSE_TRACKING_INFO_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, { return_sn: returnSn })
      const tracking = normalizeShopeeReverseTracking(data, shop, returnSn)
      return { ...tracking, tracking }
    } catch (error) {
      return { ...resultBase, error: 'shopee_reverse_tracking_failed', message: error?.message || String(error) }
    }
  }
  core.fetchShopeeReverseTrackingInfoShop = fetchShopeeReverseTrackingInfoShop

  async function fetchShopeeReverseTrackingInfo(env, options = {}) {
    const returnSn = cleanText(options.return_sn || options.returnSn)
    if (!returnSn) {
      return { status: 'error', mode: 'shopee_returns_get_reverse_tracking_info', endpoint: SHOPEE_RETURNS_GET_REVERSE_TRACKING_INFO_PATH, error: 'missing_return_sn', message: 'Missing return_sn', shops: [], tracking: null }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) {
      const row = await fetchShopeeReverseTrackingInfoShop(env, shop, returnSn)
      rows.push(row)
      if (row.ok && !options.scan_all_shops && !options.scanAllShops) break
    }
    const okRows = rows.filter(item => item.ok)
    return {
      status: 'ok',
      mode: 'shopee_returns_get_reverse_tracking_info',
      endpoint: SHOPEE_RETURNS_GET_REVERSE_TRACKING_INFO_PATH,
      return_sn: returnSn,
      shop_count: rows.length,
      ok_count: okRows.length,
      shops: rows,
      tracking: okRows[0]?.tracking || null
    }
  }
  core.fetchShopeeReverseTrackingInfo = fetchShopeeReverseTrackingInfo
}
