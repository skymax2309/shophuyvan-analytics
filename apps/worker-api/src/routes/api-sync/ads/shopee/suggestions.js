export function installApiSyncAdsShopeeSuggestions(core) {
  const SHOPEE_CREATE_PRODUCT_AD_BUDGET_SUGGESTION_PATH = core.SHOPEE_CREATE_PRODUCT_AD_BUDGET_SUGGESTION_PATH
  const SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH = core.SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH
  const SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH = core.SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH
  const SHOPEE_PRODUCT_RECOMMENDED_ROI_TARGET_PATH = core.SHOPEE_PRODUCT_RECOMMENDED_ROI_TARGET_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const chunkList = (...args) => core.chunkList(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const extractAdsRows = (...args) => core.extractAdsRows(...args)
  const fetchShopeeShopJson = (...args) => core.fetchShopeeShopJson(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const numericIdList = (...args) => core.numericIdList(...args)
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const parseIdList = (...args) => core.parseIdList(...args)
  const resolveShopeeProductCampaignIds = (...args) => core.resolveShopeeProductCampaignIds(...args)
  const normalizeShopeeProductCampaignSettingRows = (...args) => core.normalizeShopeeProductCampaignSettingRows(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const shopeeCampaignInfoTypeList = (...args) => core.shopeeCampaignInfoTypeList(...args)

  function shopeeKeywordReferenceId(value = '') {
    const direct = cleanText(value)
    if (direct) return direct
    const random = Math.random().toString(36).slice(2, 10)
    return `manual_kw_${Date.now()}_${random}`
  }
  core.shopeeKeywordReferenceId = shopeeKeywordReferenceId

  function shopeeRecommendationReferenceId(value = '') {
    const direct = cleanText(value)
    if (direct) return direct
    const random = Math.random().toString(36).slice(2, 10)
    return `roi_target_${Date.now()}_${random}`
  }
  core.shopeeRecommendationReferenceId = shopeeRecommendationReferenceId

  function shopeeBudgetSuggestionReferenceId(value = '') {
    const direct = cleanText(value)
    if (direct) return direct
    const random = Math.random().toString(36).slice(2, 10)
    return `budget_suggestion_${Date.now()}_${random}`
  }
  core.shopeeBudgetSuggestionReferenceId = shopeeBudgetSuggestionReferenceId

  function normalizeDiscoveryAdsLocationNames(value) {
    const source = Array.isArray(value)
      ? value
      : cleanText(value).split(',')
    const allowed = new Set(['daily_discover', 'you_may_also_like'])
    const list = []
    for (const item of source || []) {
      const name = cleanText(item).toLowerCase()
      if (!name || !allowed.has(name) || list.includes(name)) continue
      list.push(name)
    }
    return list
  }
  core.normalizeDiscoveryAdsLocationNames = normalizeDiscoveryAdsLocationNames

  function normalizeShopeeCreateProductAdBudgetSuggestionPayload(options = {}) {
    const referenceId = shopeeBudgetSuggestionReferenceId(options.reference_id || options.referenceId)
    const productSelection = cleanText(options.product_selection || options.productSelection).toLowerCase()
    const campaignPlacement = cleanText(options.campaign_placement || options.campaignPlacement || options.product_placement || options.productPlacement).toLowerCase()
    const biddingMethod = cleanText(options.bidding_method || options.biddingMethod).toLowerCase()
    const enhancedCpcRaw = options.enhanced_cpc ?? options.enhancedCpc
    const enhancedCpc = enhancedCpcRaw === undefined || enhancedCpcRaw === null || enhancedCpcRaw === ''
      ? ''
      : (parseBooleanOption(enhancedCpcRaw, false) ? 'true' : 'false')
    const discoveryNames = normalizeDiscoveryAdsLocationNames(options.discovery_ads_location_names || options.discoveryAdsLocationNames)
    const roasTargetRaw = options.roas_target ?? options.roasTarget
    const roasTarget = roasTargetRaw === undefined || roasTargetRaw === null || roasTargetRaw === ''
      ? null
      : roundAds(adsNumber(roasTargetRaw))
    const itemId = cleanText(options.item_id || options.itemId)
    const errors = []
    const allowedSelection = new Set(['auto', 'manual'])
    const allowedPlacement = new Set(['search', 'discovery', 'all'])
    const allowedBidding = new Set(['auto', 'manual'])

    // Kiểm tra đầu vào sát tài liệu Shopee để tránh gọi API sai tham số.
    if (!allowedSelection.has(productSelection)) errors.push('product_selection must be auto or manual')
    if (!allowedPlacement.has(campaignPlacement)) errors.push('campaign_placement must be search, discovery or all')
    if (!allowedBidding.has(biddingMethod)) errors.push('bidding_method must be auto or manual')
    if (productSelection === 'manual' && biddingMethod === 'manual' && !enhancedCpc) {
      errors.push('enhanced_cpc is required when product_selection=manual and bidding_method=manual')
    }
    if (productSelection === 'manual' && biddingMethod === 'manual' && ['all', 'discovery'].includes(campaignPlacement) && !discoveryNames.length) {
      errors.push('discovery_ads_location_names is required for manual selection + manual bidding + placement all/discovery')
    }
    if (productSelection === 'manual' && !/^\d+$/.test(itemId)) {
      errors.push('item_id must be a Shopee numeric item id when product_selection=manual')
    }

    const payload = {
      reference_id: referenceId,
      product_selection: productSelection,
      campaign_placement: campaignPlacement,
      bidding_method: biddingMethod
    }
    if (enhancedCpc) payload.enhanced_cpc = enhancedCpc
    if (discoveryNames.length) payload.discovery_ads_location_names = discoveryNames.join(',')
    if (roasTarget !== null) payload.roas_target = roasTarget
    if (itemId) payload.item_id = itemId
    return { payload, errors }
  }
  core.normalizeShopeeCreateProductAdBudgetSuggestionPayload = normalizeShopeeCreateProductAdBudgetSuggestionPayload

  async function fetchShopeeCreateProductAdBudgetSuggestion(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const { payload, errors } = normalizeShopeeCreateProductAdBudgetSuggestionPayload(options)
    if (!shopFilter) errors.push('shop is required')
    if (errors.length) {
      return {
        status: 'error',
        mode: 'shopee_create_product_ad_budget_suggestion',
        endpoint: SHOPEE_CREATE_PRODUCT_AD_BUDGET_SUGGESTION_PATH,
        errors,
        shop: shopFilter,
        request_payload: payload
      }
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'shopee_create_product_ad_budget_suggestion',
        endpoint: SHOPEE_CREATE_PRODUCT_AD_BUDGET_SUGGESTION_PATH,
        errors: ['No Shopee API shop found for the provided shop filter'],
        shop: shopFilter,
        request_payload: payload
      }
    }

    try {
      const data = await fetchShopeeShopJson(env, shop, SHOPEE_CREATE_PRODUCT_AD_BUDGET_SUGGESTION_PATH, payload)
      const response = data?.response || {}
      const budget = response?.budget && typeof response.budget === 'object' ? response.budget : {}
      return {
        status: 'ok',
        mode: 'shopee_create_product_ad_budget_suggestion',
        endpoint: SHOPEE_CREATE_PRODUCT_AD_BUDGET_SUGGESTION_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        warning: cleanText(data?.warning),
        message: cleanText(data?.message),
        request_payload: payload,
        budget: {
          recommended_budget: roundAds(budget.recommended_budget),
          min_budget: roundAds(budget.min_budget),
          max_budget: roundAds(budget.max_budget)
        },
        response
      }
    } catch (error) {
      return {
        status: 'error',
        mode: 'shopee_create_product_ad_budget_suggestion',
        endpoint: SHOPEE_CREATE_PRODUCT_AD_BUDGET_SUGGESTION_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_payload: payload,
        error: 'shopee_create_product_ad_budget_suggestion_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeCreateProductAdBudgetSuggestion = fetchShopeeCreateProductAdBudgetSuggestion

  function normalizeShopeeRoiTargetBound(bound) {
    if (!bound || typeof bound !== 'object') return null
    return {
      value: roundAds(bound.value),
      percentile: Math.round(adsNumber(bound.percentile))
    }
  }
  core.normalizeShopeeRoiTargetBound = normalizeShopeeRoiTargetBound

  async function fetchShopeeProductRecommendedRoiTarget(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const itemId = cleanText(options.item_id || options.itemId)
    const referenceId = shopeeRecommendationReferenceId(options.reference_id || options.referenceId)
    const errors = []
    if (!shopFilter) errors.push('shop is required')
    if (!/^\d+$/.test(itemId)) errors.push('item_id must be a Shopee numeric item id')
    if (errors.length) {
      return {
        status: 'error',
        mode: 'shopee_product_recommended_roi_target',
        errors,
        endpoint: SHOPEE_PRODUCT_RECOMMENDED_ROI_TARGET_PATH,
        shop: shopFilter,
        item_id: itemId,
        reference_id: referenceId
      }
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'shopee_product_recommended_roi_target',
        errors: ['No Shopee API shop found for the provided shop filter'],
        endpoint: SHOPEE_PRODUCT_RECOMMENDED_ROI_TARGET_PATH,
        shop: shopFilter,
        item_id: itemId,
        reference_id: referenceId
      }
    }

    const data = await fetchShopeeShopJson(env, shop, SHOPEE_PRODUCT_RECOMMENDED_ROI_TARGET_PATH, {
      reference_id: referenceId,
      item_id: itemId
    })
    const response = data?.response || {}
    return {
      status: 'ok',
      mode: 'shopee_product_recommended_roi_target',
      endpoint: SHOPEE_PRODUCT_RECOMMENDED_ROI_TARGET_PATH,
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      item_id: itemId,
      reference_id: referenceId,
      request_id: cleanText(data?.request_id),
      warning: cleanText(data?.warning),
      lower_bound: normalizeShopeeRoiTargetBound(response.lower_bound),
      exact: normalizeShopeeRoiTargetBound(response.exact),
      upper_bound: normalizeShopeeRoiTargetBound(response.upper_bound),
      response
    }
  }
  core.fetchShopeeProductRecommendedRoiTarget = fetchShopeeProductRecommendedRoiTarget

  function normalizeShopeeProductLevelCampaignRows(rows = []) {
    return (rows || []).map(row => ({
      campaign_id: cleanText(row?.campaign_id || row?.campaignId || row?.id),
      ad_type: cleanText(row?.ad_type || row?.adType || row?.type)
    })).filter(row => /^\d+$/.test(row.campaign_id))
  }
  core.normalizeShopeeProductLevelCampaignRows = normalizeShopeeProductLevelCampaignRows

  async function fetchShopeeProductLevelCampaignIdListShop(env, shop, options = {}) {
    const result = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      endpoint: SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH,
      ad_type: 'all',
      offset: 0,
      limit: 0,
      request_ids: [],
      request_id: '',
      region: '',
      shop_id: '',
      campaign_ids: [],
      campaigns: [],
      campaign_list: [],
      has_next_page: false,
      error: '',
      message: ''
    }
    if (!shop.api_shop_id) {
      result.message = 'Missing Shopee shop id'
      return result
    }

    const startOffset = Math.max(Number(options.offset || 0) || 0, 0)
    const totalLimit = Math.min(Math.max(Number(options.limit || options.campaignListLimit || options.campaign_list_limit || 5000) || 5000, 1), 5000)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || totalLimit) || totalLimit, 1), 5000)
    const rawAdType = cleanText(options.ad_type || options.adType || 'all').toLowerCase()
    const adType = new Set(['', 'all', 'auto', 'manual']).has(rawAdType) ? rawAdType : 'all'
    result.ad_type = adType || 'all'
    result.offset = startOffset
    result.limit = totalLimit

    try {
      const campaigns = []
      let hasNext = false

      for (let offset = startOffset; offset < startOffset + totalLimit; offset += pageSize) {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH, {
          ad_type: adType,
          offset,
          limit: Math.min(pageSize, startOffset + totalLimit - offset)
        })
        const response = data?.response || {}
        const rows = normalizeShopeeProductLevelCampaignRows(
          Array.isArray(response.campaign_list) ? response.campaign_list : extractAdsRows(data)
        )
        result.request_ids.push(cleanText(data?.request_id))
        // Lưu metadata chuẩn từ Shopee để payload OMS bám sát response docs.
        if (!result.request_id) result.request_id = cleanText(data?.request_id)
        if (!result.shop_id) result.shop_id = cleanText(response.shop_id)
        if (!result.region) result.region = cleanText(response.region)
        campaigns.push(...rows)
        hasNext = Boolean(response.has_next_page)
        if (!hasNext || rows.length <= 0) break
      }

      result.ok = true
      result.campaigns = campaigns
      result.campaign_list = campaigns
      result.campaign_ids = numericIdList(campaigns.map(row => row.campaign_id))
      result.has_next_page = hasNext
      return result
    } catch (error) {
      result.error = 'product_level_campaign_id_list_failed'
      result.message = error?.message || String(error)
      return result
    }
  }
  core.fetchShopeeProductLevelCampaignIdListShop = fetchShopeeProductLevelCampaignIdListShop

  async function fetchShopeeProductLevelCampaignIdList(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeProductLevelCampaignIdListShop(env, shop, options))
    const campaignIds = numericIdList(rows.flatMap(item => item.campaign_ids || []))
    return {
      status: 'ok',
      mode: 'shopee_product_level_campaign_id_list',
      endpoint: SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH,
      note: 'Danh sach product campaign id realtime tu Shopee Ads API; dung lam campaign_id_list cho product campaign daily/hourly performance.',
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      campaign_count: campaignIds.length,
      campaign_ids: campaignIds,
      shops: rows
    }
  }
  core.fetchShopeeProductLevelCampaignIdList = fetchShopeeProductLevelCampaignIdList

  async function fetchShopeeProductLevelCampaignSettingInfoShop(env, shop, options = {}) {
    const result = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      endpoint: SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH,
      info_type_list: shopeeCampaignInfoTypeList(options.info_type_list || options.infoTypeList),
      campaign_ids: [],
      setting_count: 0,
      request_ids: [],
      settings: [],
      error: '',
      message: ''
    }
    if (!shop.api_shop_id) {
      result.message = 'Missing Shopee shop id'
      return result
    }

    try {
      const warnings = []
      let campaignIds = numericIdList(parseIdList(options.campaign_id_list || options.campaignIds || options.campaign_ids))
      if (!campaignIds.length) {
        campaignIds = await resolveShopeeProductCampaignIds(env, shop, {
          ...options,
          limit: options.limit || options.campaignListLimit || options.campaign_list_limit || 100
        }, warnings, SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH)
      }
      result.campaign_ids = campaignIds
      if (!campaignIds.length) {
        result.error = 'missing_campaign_ids'
        result.message = warnings.map(item => item.message).filter(Boolean).join('; ') || 'No product campaign ids found'
        return result
      }

      const settings = []
      for (const chunk of chunkList(campaignIds, 100)) {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH, {
          info_type_list: result.info_type_list,
          campaign_id_list: chunk.join(',')
        })
        const response = data?.response || {}
        result.request_ids.push(cleanText(data?.request_id))
        settings.push(...normalizeShopeeProductCampaignSettingRows(
          Array.isArray(response.campaign_list) ? response.campaign_list : extractAdsRows(data)
        ))
      }

      result.ok = true
      result.settings = settings
      result.setting_count = settings.length
      return result
    } catch (error) {
      result.error = 'product_level_campaign_setting_info_failed'
      result.message = error?.message || String(error)
      return result
    }
  }
  core.fetchShopeeProductLevelCampaignSettingInfoShop = fetchShopeeProductLevelCampaignSettingInfoShop

  async function fetchShopeeProductLevelCampaignSettingInfo(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeProductLevelCampaignSettingInfoShop(env, shop, options))
    return {
      status: 'ok',
      mode: 'shopee_product_level_campaign_setting_info',
      endpoint: SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH,
      note: 'Campaign setting info realtime tu Shopee Ads API: status, budget, bidding, keyword, item/product info.',
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      setting_count: rows.reduce((sum, item) => sum + Number(item.setting_count || 0), 0),
      shops: rows
    }
  }
  core.fetchShopeeProductLevelCampaignSettingInfo = fetchShopeeProductLevelCampaignSettingInfo
}
