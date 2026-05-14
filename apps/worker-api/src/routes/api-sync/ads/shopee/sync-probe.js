export function installApiSyncAdsShopeeSyncProbe(core) {
  const SHOPEE_ADS_BALANCE_PATH = core.SHOPEE_ADS_BALANCE_PATH
  const SHOPEE_ADS_SHOP_TOGGLE_INFO_PATH = core.SHOPEE_ADS_SHOP_TOGGLE_INFO_PATH
  const SHOPEE_ALL_CPC_ADS_DAILY_PERFORMANCE_PATH = core.SHOPEE_ALL_CPC_ADS_DAILY_PERFORMANCE_PATH
  const SHOPEE_ALL_CPC_ADS_HOURLY_PERFORMANCE_PATH = core.SHOPEE_ALL_CPC_ADS_HOURLY_PERFORMANCE_PATH
  const SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH = core.SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH
  const SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH = core.SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH
  const SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH = core.SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH
  const adsDateRangeList = (...args) => core.adsDateRangeList(...args)
  const adsNumber = (...args) => core.adsNumber(...args)
  const adsSyncWindow = (...args) => core.adsSyncWindow(...args)
  const chunkList = (...args) => core.chunkList(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const extractAdsRows = (...args) => core.extractAdsRows(...args)
  const fetchShopeeProductCampaignSettingsMap = (...args) => core.fetchShopeeProductCampaignSettingsMap(...args)
  const fetchShopeeShopJson = (...args) => core.fetchShopeeShopJson(...args)
  const findNestedValue = (...args) => core.findNestedValue(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const hourlyRowsToDailySnapshots = (...args) => core.hourlyRowsToDailySnapshots(...args)
  const normalizeAdsCampaignRow = (...args) => core.normalizeAdsCampaignRow(...args)
  const normalizeShopeeAllCpcDailySnapshots = (...args) => core.normalizeShopeeAllCpcDailySnapshots(...args)
  const normalizeShopeeProductCampaignHourlyPerformance = (...args) => core.normalizeShopeeProductCampaignHourlyPerformance(...args)
  const parseAdsDate = (...args) => core.parseAdsDate(...args)
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const resolveShopeeProductCampaignIds = (...args) => core.resolveShopeeProductCampaignIds(...args)
  const responseHasNextPage = (...args) => core.responseHasNextPage(...args)
  const saveAdsCampaignSnapshots = (...args) => core.saveAdsCampaignSnapshots(...args)
  const saveAdsHourlySnapshots = (...args) => core.saveAdsHourlySnapshots(...args)
  const shopeeAdsDmy = (...args) => core.shopeeAdsDmy(...args)
  const shopeeAdsParams = (...args) => core.shopeeAdsParams(...args)
  const shopeeAdsPaths = (...args) => core.shopeeAdsPaths(...args)

  async function fetchShopeeAllCpcDailySnapshots(env, shop, app, options, from, to, warnings) {
    try {
      const data = await fetchShopeeShopJson(env, shop, SHOPEE_ALL_CPC_ADS_DAILY_PERFORMANCE_PATH, {
        start_date: shopeeAdsDmy(from),
        end_date: shopeeAdsDmy(to)
      })
      return normalizeShopeeAllCpcDailySnapshots(data, shop, to)
    } catch (error) {
      warnings.push({ stage: SHOPEE_ALL_CPC_ADS_DAILY_PERFORMANCE_PATH, message: error.message })
      return []
    }
  }
  core.fetchShopeeAllCpcDailySnapshots = fetchShopeeAllCpcDailySnapshots

  async function fetchShopeeAllCpcHourlySnapshots(env, shop, app, options, from, to, warnings) {
    const requestedDate = cleanText(options.performance_date || options.performanceDate)
    const dates = requestedDate
      ? [parseAdsDate(requestedDate, new Date())]
      : adsDateRangeList(from, to, options.hourlyDays || options.hourly_days || options.days || 7)
    const hourlyRows = []
    for (const date of dates) {
      try {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_ALL_CPC_ADS_HOURLY_PERFORMANCE_PATH, { performance_date: shopeeAdsDmy(date) })
        hourlyRows.push(...normalizeShopeeHourlyRows(data, shop, date))
      } catch (error) {
        warnings.push({ stage: SHOPEE_ALL_CPC_ADS_HOURLY_PERFORMANCE_PATH, message: error.message, date })
      }
    }
    const savedHourly = await saveAdsHourlySnapshots(env, hourlyRows)
    const dailySnapshots = hourlyRowsToDailySnapshots(shop, hourlyRows)
    return { hourlyRows, dailySnapshots, savedHourly }
  }
  core.fetchShopeeAllCpcHourlySnapshots = fetchShopeeAllCpcHourlySnapshots

  async function fetchShopeeProductCampaignHourlySnapshots(env, shop, app, options, from, to, warnings) {
    const campaignIds = await resolveShopeeProductCampaignIds(env, shop, options, warnings, SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH)
    if (!campaignIds.length) {
      return { hourlyRows: [], dailySnapshots: [], savedHourly: { saved_hourly: 0, inserted_hourly: 0, updated_hourly: 0 } }
    }
    const settingsMap = await fetchShopeeProductCampaignSettingsMap(env, shop, campaignIds, options, warnings)

    const requestedDate = cleanText(options.performance_date || options.performanceDate)
    const dates = requestedDate
      ? [parseAdsDate(requestedDate, new Date())]
      : adsDateRangeList(from, to, options.hourlyDays || options.hourly_days || options.days || 7)
    const snapshots = []
    const hourlyRows = []
    for (const date of dates) {
      for (const chunk of chunkList(campaignIds, 100)) {
        try {
          const data = await fetchShopeeShopJson(env, shop, SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH, {
            performance_date: shopeeAdsDmy(date),
            campaign_id_list: chunk.join(',')
          })
          const normalized = normalizeShopeeProductCampaignHourlyPerformance(data, shop, date, settingsMap)
          snapshots.push(...normalized.snapshots)
          hourlyRows.push(...normalized.hourlyRows)
        } catch (error) {
          warnings.push({ stage: SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH, message: error.message, date })
        }
      }
    }
    const savedHourly = parseBooleanOption(options.skip_save_hourly ?? options.skipSaveHourly, false)
      ? { saved_hourly: 0, inserted_hourly: 0, updated_hourly: 0 }
      : await saveAdsHourlySnapshots(env, hourlyRows)
    return { hourlyRows, dailySnapshots: snapshots, savedHourly }
  }
  core.fetchShopeeProductCampaignHourlySnapshots = fetchShopeeProductCampaignHourlySnapshots

  async function fetchShopeeProductCampaignDailySnapshots(env, shop, app, options, from, to, snapshotDate, warnings) {
    const campaignIds = await resolveShopeeProductCampaignIds(env, shop, options, warnings, SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH)
    if (!campaignIds.length) return []
    const settingsMap = await fetchShopeeProductCampaignSettingsMap(env, shop, campaignIds, options, warnings)
    const snapshots = []
    for (const chunk of chunkList(campaignIds, 100)) {
      try {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH, {
          start_date: shopeeAdsDmy(from),
          end_date: shopeeAdsDmy(to),
          campaign_id_list: chunk.join(',')
        })
        snapshots.push(...normalizeShopeeProductCampaignDailySnapshots(data, shop, snapshotDate, settingsMap))
      } catch (error) {
        warnings.push({ stage: SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH, message: error.message })
      }
    }
    return snapshots
  }
  core.fetchShopeeProductCampaignDailySnapshots = fetchShopeeProductCampaignDailySnapshots

  async function syncShopeeAdsCampaignsShop(env, shop, options = {}) {
    if (!shop.api_shop_id) return { shop: shop.shop_name, fetched_campaigns: 0, saved: 0, inserted: 0, updated: 0, warnings: [{ stage: 'ads', message: 'Missing Shopee shop id' }] }
    const { from, to } = adsSyncWindow(options)
    const snapshotDate = to
    const limit = Math.max(1, Math.min(Number(options.limit || 100) || 100, 500))
    const pageSize = Math.min(100, limit)
    const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
    const warnings = []
    const snapshots = []
    const paths = shopeeAdsPaths(env, options)
    let savedHourly = { saved_hourly: 0, inserted_hourly: 0, updated_hourly: 0 }
    const productCampaignDailyOnly = parseBooleanOption(
      options.product_campaign_daily_only ?? options.productCampaignDailyOnly ?? options.force_product_campaign_daily ?? options.forceProductCampaignDaily,
      false
    )
    const productCampaignHourlyOnly = parseBooleanOption(
      options.product_campaign_hourly_only ?? options.productCampaignHourlyOnly ?? options.force_product_campaign_hourly ?? options.forceProductCampaignHourly,
      false
    )
    const allCpcDailyOnly = parseBooleanOption(
      options.all_cpc_daily_only ?? options.allCpcDailyOnly ?? options.force_all_cpc_daily ?? options.forceAllCpcDaily,
      false
    )
    const allCpcHourlyOnly = parseBooleanOption(
      options.all_cpc_hourly_only ?? options.allCpcHourlyOnly ?? options.force_all_cpc_hourly ?? options.forceAllCpcHourly,
      false
    )
    const includeProductCampaigns = parseBooleanOption(
      options.include_product_campaigns ?? options.includeProductCampaigns ?? options.sync_product_campaigns ?? options.syncProductCampaigns,
      true
    )
    const strictShopeeMode = productCampaignDailyOnly || productCampaignHourlyOnly || allCpcDailyOnly || allCpcHourlyOnly
    let shopLevelSnapshotCount = 0
    let productCampaignSnapshotCount = 0

    if (allCpcDailyOnly) {
      const shopLevel = await fetchShopeeAllCpcDailySnapshots(env, shop, app, options, from, to, warnings)
      shopLevelSnapshotCount += shopLevel.length
      snapshots.push(...shopLevel)
    } else if (allCpcHourlyOnly) {
      const hourly = await fetchShopeeAllCpcHourlySnapshots(env, shop, app, options, from, to, warnings)
      savedHourly = hourly.savedHourly
      shopLevelSnapshotCount += hourly.dailySnapshots.length
      snapshots.push(...hourly.dailySnapshots)
    } else if (productCampaignDailyOnly) {
      const productDaily = await fetchShopeeProductCampaignDailySnapshots(env, shop, app, options, from, to, snapshotDate, warnings)
      productCampaignSnapshotCount += productDaily.length
      snapshots.push(...productDaily)
    } else if (productCampaignHourlyOnly) {
      const productHourly = await fetchShopeeProductCampaignHourlySnapshots(env, shop, app, options, from, to, warnings)
      savedHourly = productHourly.savedHourly
      productCampaignSnapshotCount += productHourly.dailySnapshots.length
      snapshots.push(...productHourly.dailySnapshots)
    } else {
      const shopLevel = await fetchShopeeAllCpcDailySnapshots(env, shop, app, options, from, to, warnings)
      shopLevelSnapshotCount += shopLevel.length
      snapshots.push(...shopLevel)
      if (includeProductCampaigns) {
        const productDaily = await fetchShopeeProductCampaignDailySnapshots(env, shop, app, options, from, to, snapshotDate, warnings)
        productCampaignSnapshotCount += productDaily.length
        snapshots.push(...productDaily)
      }
      if (!snapshots.length) {
        const hourly = await fetchShopeeAllCpcHourlySnapshots(env, shop, app, options, from, to, warnings)
        savedHourly = hourly.savedHourly
        shopLevelSnapshotCount += hourly.dailySnapshots.length
        snapshots.push(...hourly.dailySnapshots)
      }
      if (!snapshots.length) {
        const productHourly = await fetchShopeeProductCampaignHourlySnapshots(env, shop, app, options, from, to, warnings)
        savedHourly = productHourly.savedHourly
        productCampaignSnapshotCount += productHourly.dailySnapshots.length
        snapshots.push(...productHourly.dailySnapshots)
        if (!snapshots.length) {
          const productDaily = await fetchShopeeProductCampaignDailySnapshots(env, shop, app, options, from, to, snapshotDate, warnings)
          productCampaignSnapshotCount += productDaily.length
          snapshots.push(...productDaily)
        }
      }
    }

    if (!snapshots.length && !paths.length) {
      return {
        shop: shop.shop_name,
        fetched_campaigns: 0,
        saved: 0,
        inserted: 0,
        updated: 0,
        warnings: [{
          stage: 'shopee_ads_paths',
          message: 'Chưa cấu hình endpoint Shopee Ads API. Không tạo dữ liệu campaign ước tính.'
        }]
      }
    }

    for (const endpoint of snapshots.length || strictShopeeMode ? [] : paths) {
      const path = endpoint.path
      try {
        for (let page = 1; page <= Math.ceil(limit / pageSize) && snapshots.length < limit; page++) {
          const data = await fetchShopeeShopJson(env, shop, path, shopeeAdsParams(endpoint, options, from, to, page, pageSize))
          const rows = extractAdsRows(data)
          snapshots.push(...rows.map(row => normalizeAdsCampaignRow('shopee', shop, row, snapshotDate)))
          if (!responseHasNextPage(data, rows.length, pageSize)) break
        }
        if (snapshots.length) break
        warnings.push({ stage: path, message: 'No campaign rows returned' })
      } catch (error) {
        warnings.push({ stage: path, message: error.message })
      }
    }

    const saved = await saveAdsCampaignSnapshots(env, (strictShopeeMode || includeProductCampaigns) ? snapshots : snapshots.slice(0, limit))
    if (!snapshots.length && !warnings.length) {
      warnings.push({
        stage: 'shopee_ads_campaigns',
        message: 'Shopee Ads API trả 0 campaign trong khoảng lọc.'
      })
    }
    return {
      shop: shop.shop_name,
      fetched_campaigns: snapshots.length,
      shop_level_snapshots: shopLevelSnapshotCount,
      product_campaign_snapshots: productCampaignSnapshotCount,
      include_product_campaigns: includeProductCampaigns,
      mode: allCpcDailyOnly ? 'shopee_all_cpc_ads_daily_performance' : (allCpcHourlyOnly ? 'shopee_all_cpc_ads_hourly_performance' : (productCampaignHourlyOnly ? 'shopee_product_campaign_hourly_performance' : (productCampaignDailyOnly ? 'shopee_product_campaign_daily_performance' : 'shopee_ads_realtime'))),
      ...saved,
      ...savedHourly,
      warnings
    }
  }
  core.syncShopeeAdsCampaignsShop = syncShopeeAdsCampaignsShop

  function summarizeShopeeAdsResponse(data) {
    const response = data?.response || data?.data || data?.result || data || {}
    const rows = extractAdsRows(data)
    const balance = findNestedValue(data, ['total_balance', 'balance', 'ads_balance', 'available_balance'])
    return {
      ok: !data?.error,
      error: cleanText(data?.error),
      message: cleanText(data?.message || data?.warning),
      request_id: cleanText(data?.request_id),
      balance: balance === undefined ? null : adsNumber(balance),
      response_keys: response && typeof response === 'object' && !Array.isArray(response)
        ? Object.keys(response).slice(0, 20)
        : [],
      row_count: rows.length,
      sample_keys: rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).slice(0, 30) : []
    }
  }
  core.summarizeShopeeAdsResponse = summarizeShopeeAdsResponse

  async function probeShopeeAdsShop(env, shop, options = {}) {
    const { from, to } = adsSyncWindow(options)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 20) || 20, 1), 100)
    const endpointLimit = Math.min(Math.max(Number(options.endpoint_limit || options.endpointLimit || 5) || 5, 1), 12)
    const result = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      auth_ok: false,
      ads_balance_ok: false,
      shop_toggle_info_ok: false,
      shop_cpc_hourly_ok: false,
      campaign_endpoint_ok: false,
      probes: []
    }

    if (!shop.api_shop_id) {
      result.probes.push({ stage: 'shop', ok: false, message: 'Missing Shopee shop id' })
      return result
    }

    const probeEndpoint = async (stage, path, params = {}) => {
      try {
        const data = await fetchShopeeShopJson(env, shop, path, params)
        const summary = summarizeShopeeAdsResponse(data)
        result.probes.push({ stage, path, ...summary })
        return { ok: true, data, summary }
      } catch (error) {
        result.probes.push({ stage, path, ok: false, message: error.message })
        return { ok: false, error }
      }
    }

    const auth = await probeEndpoint('auth_shop_info', '/api/v2/shop/get_shop_info')
    result.auth_ok = auth.ok

    const balance = await probeEndpoint('ads_total_balance', SHOPEE_ADS_BALANCE_PATH)
    result.ads_balance_ok = balance.ok

    const toggleInfo = await probeEndpoint('ads_shop_toggle_info', SHOPEE_ADS_SHOP_TOGGLE_INFO_PATH)
    result.shop_toggle_info_ok = toggleInfo.ok

    const hourlyDate = parseAdsDate(options.performance_date || options.performanceDate || to, new Date())
    const hourly = await probeEndpoint('ads_all_cpc_hourly_performance', SHOPEE_ALL_CPC_ADS_HOURLY_PERFORMANCE_PATH, {
      performance_date: shopeeAdsDmy(hourlyDate)
    })
    result.shop_cpc_hourly_ok = hourly.ok && Number(hourly.summary?.row_count || 0) > 0
    if (result.shop_cpc_hourly_ok) result.campaign_endpoint_ok = true

    const productCampaignIds = await probeEndpoint('ads_product_level_campaign_id_list', SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH, {
      ad_type: cleanText(options.ad_type || options.adType || 'all').toLowerCase() || 'all',
      offset: 0,
      limit: Math.min(Math.max(Number(options.campaign_list_limit || options.campaignListLimit || 100) || 100, 1), 5000)
    })
    const productCampaignCount = Array.isArray(productCampaignIds.data?.response?.campaign_list)
      ? productCampaignIds.data.response.campaign_list.length
      : 0
    if (productCampaignIds.ok && productCampaignCount > 0) result.campaign_endpoint_ok = true

    const endpoints = shopeeAdsPaths(env, options).slice(0, endpointLimit)
    for (const endpoint of endpoints) {
      const probe = await probeEndpoint(
        'ads_campaign_probe',
        endpoint.path,
        shopeeAdsParams(endpoint, options, from, to, 1, pageSize)
      )
      if (probe.ok && Number(probe.summary?.row_count || 0) > 0) {
        result.campaign_endpoint_ok = true
        break
      }
    }
    return result
  }
  core.probeShopeeAdsShop = probeShopeeAdsShop

  async function fetchShopeeAdsBalanceShop(env, shop) {
    const result = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      total_balance: null,
      data_timestamp: null,
      request_id: '',
      error: '',
      message: ''
    }
    if (!shop.api_shop_id) {
      result.message = 'Missing Shopee shop id'
      return result
    }

    try {
      const data = await fetchShopeeShopJson(env, shop, SHOPEE_ADS_BALANCE_PATH, {})
      const balance = findNestedValue(data, ['total_balance', 'balance', 'ads_balance', 'available_balance'])
      const dataTimestamp = findNestedValue(data, ['data_timestamp', 'timestamp', 'snapshot_timestamp'])
      result.ok = true
      result.total_balance = balance === undefined ? null : adsNumber(balance)
      result.data_timestamp = dataTimestamp === undefined ? null : Number(dataTimestamp) || null
      result.request_id = cleanText(data?.request_id)
      return result
    } catch (error) {
      result.error = 'ads_balance_failed'
      result.message = error?.message || String(error)
      return result
    }
  }
  core.fetchShopeeAdsBalanceShop = fetchShopeeAdsBalanceShop

  async function fetchShopeeAdsToggleInfoShop(env, shop) {
    const result = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      data_timestamp: null,
      auto_top_up: null,
      campaign_surge: null,
      request_id: '',
      error: '',
      message: ''
    }
    if (!shop.api_shop_id) {
      result.message = 'Missing Shopee shop id'
      return result
    }

    try {
      const data = await fetchShopeeShopJson(env, shop, SHOPEE_ADS_SHOP_TOGGLE_INFO_PATH, {})
      const response = data?.response || {}
      result.ok = true
      result.data_timestamp = Number(response.data_timestamp || data?.data_timestamp || 0) || null
      result.auto_top_up = typeof response.auto_top_up === 'boolean' ? response.auto_top_up : Boolean(response.auto_top_up)
      result.campaign_surge = typeof response.campaign_surge === 'boolean' ? response.campaign_surge : Boolean(response.campaign_surge)
      result.request_id = cleanText(data?.request_id)
      return result
    } catch (error) {
      result.error = 'ads_toggle_info_failed'
      result.message = error?.message || String(error)
      return result
    }
  }
  core.fetchShopeeAdsToggleInfoShop = fetchShopeeAdsToggleInfoShop

  async function fetchShopeeAdsToggleInfo(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeAdsToggleInfoShop(env, shop))
    return {
      status: 'ok',
      mode: 'shopee_ads_shop_toggle_info',
      note: 'Trang thai Ads shop realtime tu /api/v2/ads/get_shop_toggle_info.',
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      shops: rows
    }
  }
  core.fetchShopeeAdsToggleInfo = fetchShopeeAdsToggleInfo
}
