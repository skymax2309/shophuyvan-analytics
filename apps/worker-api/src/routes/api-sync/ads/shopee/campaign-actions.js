import { buildShopeeActionResult, shopeeResponseHasBusinessError } from '../../../../core/shopee/action-result-core.js'
import { assertShopeeLiveWriteAllowed } from '../../../../features/shopee/api/baseClient.js'
import { verifyShopeeProductAdsEdit } from './campaign-verify.js'

export function installApiSyncAdsShopeeCampaignActions(core) {
  const SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH = core.SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH
  const SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH = core.SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH
  const SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH = core.SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH
  const SHOPEE_EDIT_MANUAL_PRODUCT_AD_KEYWORDS_PATH = core.SHOPEE_EDIT_MANUAL_PRODUCT_AD_KEYWORDS_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const fetchShopeeAdsBalanceShop = (...args) => core.fetchShopeeAdsBalanceShop(...args)
  const fetchShopeeShopJsonPost = (...args) => core.fetchShopeeShopJsonPost(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const isShopeeDmyDate = (...args) => core.isShopeeDmyDate(...args)
  const normalizeShopeeAdKeywordEdits = (...args) => core.normalizeShopeeAdKeywordEdits(...args)
  const normalizeShopeeDiscoveryAdsLocations = (...args) => core.normalizeShopeeDiscoveryAdsLocations(...args)
  const shopeeAutoProductAdsReferenceId = (...args) => core.shopeeAutoProductAdsReferenceId(...args)
  const shopeeKeywordReferenceId = (...args) => core.shopeeKeywordReferenceId(...args)
  const shopeeManualProductAdsReferenceId = (...args) => core.shopeeManualProductAdsReferenceId(...args)

  function normalizeShopeeManualProductAdsEditPayload(options = {}) {
    const referenceId = shopeeManualProductAdsReferenceId(options.reference_id || options.referenceId)
    const campaignId = cleanText(options.campaign_id || options.campaignId)
    const editAction = cleanText(options.edit_action || options.editAction).toLowerCase()
    const budgetRaw = options.budget
    const budgetProvided = budgetRaw !== undefined && budgetRaw !== null && budgetRaw !== ''
    const budget = budgetProvided ? roundAds(adsNumber(budgetRaw)) : null
    const startDate = cleanText(options.start_date || options.startDate)
    const endDate = cleanText(options.end_date || options.endDate)
    const roasTargetRaw = options.roas_target ?? options.roasTarget
    const roasTargetProvided = roasTargetRaw !== undefined && roasTargetRaw !== null && roasTargetRaw !== ''
    const roasTarget = roasTargetProvided ? roundAds(adsNumber(roasTargetRaw)) : null
    const smartCreativeSetting = cleanText(options.smart_creative_setting || options.smartCreativeSetting || '').toLowerCase()
    const enhancedCpcRaw = options.enhanced_cpc ?? options.enhancedCpc
    const enhancedCpcProvided = enhancedCpcRaw !== undefined && enhancedCpcRaw !== null && enhancedCpcRaw !== ''
    const enhancedCpc = enhancedCpcProvided ? parseBooleanOption(enhancedCpcRaw, false) : null
    const { rows: discoveryAdsLocations, errors: locationErrors } = normalizeShopeeDiscoveryAdsLocations(options.discovery_ads_locations || options.discoveryAdsLocations)
    const allowedActions = new Set([
      'start',
      'pause',
      'resume',
      'stop',
      'delete',
      'change_budget',
      'change_duration',
      'change_smart_creative',
      'change_location',
      'change_enhanced_cpc',
      'change_roas_target'
    ])
    const errors = [...locationErrors]

    // Chuẩn hóa payload chỉnh Manual Product Ads sát tài liệu Shopee để tránh đẩy sai lệnh.
    if (!/^\d+$/.test(campaignId)) errors.push('campaign_id must be a Shopee numeric campaign id')
    if (!allowedActions.has(editAction)) {
      errors.push('edit_action invalid. Allowed: start, pause, resume, stop, delete, change_budget, change_duration, change_smart_creative, change_location, change_enhanced_cpc, change_roas_target')
    }
    if (editAction === 'change_budget' && (!budgetProvided || budget <= 0)) {
      errors.push('budget is required and must be greater than 0 for change_budget')
    }
    if (editAction === 'change_duration') {
      if (!isShopeeDmyDate(startDate)) errors.push('start_date must be DD-MM-YYYY for change_duration')
      if (endDate && !isShopeeDmyDate(endDate)) errors.push('end_date must be DD-MM-YYYY when provided')
    } else if (endDate && !isShopeeDmyDate(endDate)) {
      errors.push('end_date must be DD-MM-YYYY when provided')
    }
    if (editAction === 'change_smart_creative' && !['default', 'on', 'off'].includes(smartCreativeSetting)) {
      errors.push('smart_creative_setting must be default, on or off for change_smart_creative')
    }
    if (editAction === 'change_location' && !discoveryAdsLocations.length) {
      errors.push('discovery_ads_locations is required for change_location')
    }
    if (editAction === 'change_enhanced_cpc' && !enhancedCpcProvided) {
      errors.push('enhanced_cpc is required for change_enhanced_cpc')
    }
    if (editAction === 'change_roas_target' && (!roasTargetProvided || roasTarget < 0)) {
      errors.push('roas_target is required and must be >= 0 for change_roas_target')
    }

    const payload = {
      reference_id: referenceId,
      campaign_id: /^\d+$/.test(campaignId) ? Number(campaignId) : campaignId,
      edit_action: editAction
    }
    if (budgetProvided) payload.budget = budget
    if (startDate) payload.start_date = startDate
    if (endDate) payload.end_date = endDate
    if (roasTargetProvided) payload.roas_target = roasTarget
    if (discoveryAdsLocations.length) payload.discovery_ads_locations = discoveryAdsLocations
    if (enhancedCpcProvided) payload.enhanced_cpc = enhancedCpc
    if (smartCreativeSetting) payload.smart_creative_setting = smartCreativeSetting
    return { payload, errors }
  }
  core.normalizeShopeeManualProductAdsEditPayload = normalizeShopeeManualProductAdsEditPayload

  function normalizeShopeeAutoProductAdsCreatePayload(options = {}) {
    const referenceId = shopeeAutoProductAdsReferenceId(options.reference_id || options.referenceId)
    const budgetInput = options.budget
    const budget = budgetInput === undefined || budgetInput === null || budgetInput === ''
      ? null
      : roundAds(adsNumber(budgetInput))
    const startDate = cleanText(options.start_date || options.startDate)
    const endDate = cleanText(options.end_date || options.endDate)
    const errors = []

    // Chuẩn hóa payload tạo Auto Product Ads trước khi gọi API Shopee thật.
    if (!Number.isFinite(Number(budget)) || Number(budget) <= 0) errors.push('budget is required and must be greater than 0')
    if (!isShopeeDmyDate(startDate)) errors.push('start_date must be DD-MM-YYYY')
    if (endDate && !isShopeeDmyDate(endDate)) errors.push('end_date must be DD-MM-YYYY when provided')

    const payload = {
      reference_id: referenceId,
      budget: budget === null ? budgetInput : budget,
      start_date: startDate
    }
    if (endDate) payload.end_date = endDate
    return { payload, errors }
  }
  core.normalizeShopeeAutoProductAdsCreatePayload = normalizeShopeeAutoProductAdsCreatePayload

  async function createShopeeAutoProductAds(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const apply = parseBooleanOption(options.apply ?? options.apply_now ?? options.applyNow, false)
    const confirmApply = cleanText(options.confirm_apply || options.confirmApply)
    const { payload, errors } = normalizeShopeeAutoProductAdsCreatePayload(options)
    const deprecationNote = 'Shopee đánh dấu endpoint này "coming offline soon". Nên chuẩn bị phương án chuyển sang endpoint thay thế khi Shopee công bố.'

    if (!shopFilter) errors.push('shop is required')
    if (errors.length) {
      return {
        status: 'error',
        mode: 'shopee_create_auto_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        errors,
        request_payload: payload
      }
    }

    if (!apply) {
      return {
        status: 'ok',
        mode: 'shopee_create_auto_product_ads',
        dry_run: true,
        applied: false,
        note: 'Dry-run only. Send apply=true và confirm_apply=CREATE_SHOPEE_AUTO_PRODUCT_ADS để tạo chiến dịch thật trên Shopee.',
        endpoint: SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        shop: shopFilter,
        request_payload: payload
      }
    }

    if (confirmApply !== 'CREATE_SHOPEE_AUTO_PRODUCT_ADS') {
      return {
        status: 'error',
        mode: 'shopee_create_auto_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        errors: ['confirm_apply must equal CREATE_SHOPEE_AUTO_PRODUCT_ADS to apply changes to Shopee Ads'],
        shop: shopFilter,
        request_payload: payload
      }
    }

    const liveWriteGuard = assertShopeeLiveWriteAllowed(env, 'ads_client')
    if (liveWriteGuard) {
      return {
        status: 'error',
        mode: 'shopee_create_auto_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        error: liveWriteGuard.error,
        errors: [liveWriteGuard.message],
        shop: shopFilter,
        request_payload: payload
      }
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'shopee_create_auto_product_ads',
        dry_run: false,
        applied: false,
        endpoint: SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        errors: ['No Shopee API shop found for the provided shop filter'],
        shop: shopFilter,
        request_payload: payload
      }
    }

    try {
      // Chỉ tạo campaign thật khi đã có apply=true và confirm_apply hợp lệ.
      const data = await fetchShopeeShopJsonPost(env, shop, SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH, {}, payload)
      return {
        status: 'ok',
        mode: 'shopee_create_auto_product_ads',
        dry_run: false,
        applied: true,
        endpoint: SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        warning: cleanText(data?.warning),
        message: cleanText(data?.message),
        response: data?.response || []
      }
    } catch (error) {
      return {
        status: 'error',
        mode: 'shopee_create_auto_product_ads',
        dry_run: false,
        applied: true,
        endpoint: SHOPEE_CREATE_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_payload: payload,
        error: 'shopee_create_auto_product_ads_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.createShopeeAutoProductAds = createShopeeAutoProductAds

  function normalizeShopeeAutoProductAdsEditPayload(options = {}) {
    const referenceId = shopeeAutoProductAdsReferenceId(options.reference_id || options.referenceId)
    const campaignId = cleanText(options.campaign_id || options.campaignId)
    const editAction = cleanText(options.edit_action || options.editAction).toLowerCase()
    const budgetInput = options.budget
    const budget = budgetInput === undefined || budgetInput === null || budgetInput === ''
      ? null
      : roundAds(adsNumber(budgetInput))
    const startDate = cleanText(options.start_date || options.startDate)
    const endDate = cleanText(options.end_date || options.endDate)
    const allowedActions = new Set(['start', 'pause', 'resume', 'stop', 'change_budget', 'change_duration'])
    const errors = []

    // Chuẩn hóa và kiểm tra dữ liệu trước khi gọi Shopee để tránh gửi sai cấu hình ADS.
    if (!/^\d+$/.test(campaignId)) errors.push('campaign_id must be a Shopee numeric campaign id')
    if (!allowedActions.has(editAction)) errors.push('edit_action invalid. Allowed: start, pause, resume, stop, change_budget, change_duration')
    if (editAction === 'change_budget' && (!Number.isFinite(Number(budget)) || Number(budget) <= 0)) {
      errors.push('budget is required and must be greater than 0 for change_budget')
    }
    if (editAction === 'change_duration') {
      if (!isShopeeDmyDate(startDate)) errors.push('start_date must be DD-MM-YYYY for change_duration')
      if (!isShopeeDmyDate(endDate)) errors.push('end_date must be DD-MM-YYYY for change_duration')
    }

    const payload = {
      reference_id: referenceId,
      campaign_id: /^\d+$/.test(campaignId) ? Number(campaignId) : campaignId,
      edit_action: editAction
    }
    if (budget !== null) payload.budget = budget
    if (startDate) payload.start_date = startDate
    if (endDate) payload.end_date = endDate
    return { payload, errors }
  }
  core.normalizeShopeeAutoProductAdsEditPayload = normalizeShopeeAutoProductAdsEditPayload

  async function editShopeeAutoProductAds(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const apply = parseBooleanOption(options.apply ?? options.apply_now ?? options.applyNow, false)
    const confirmApply = cleanText(options.confirm_apply || options.confirmApply)
    const { payload, errors } = normalizeShopeeAutoProductAdsEditPayload(options)
    const deprecationNote = 'Shopee đánh dấu endpoint này "coming offline soon". Nên chuẩn bị phương án chuyển sang endpoint thay thế khi Shopee công bố.'

    if (!shopFilter) errors.push('shop is required')
    if (errors.length) {
      return {
        status: 'error',
        mode: 'shopee_edit_auto_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        errors,
        request_payload: payload
      }
    }

    if (!apply) {
      return {
        status: 'ok',
        mode: 'shopee_edit_auto_product_ads',
        dry_run: true,
        applied: false,
        note: 'Dry-run only. Send apply=true và confirm_apply=EDIT_SHOPEE_AUTO_PRODUCT_ADS để đẩy thật lên Shopee.',
        endpoint: SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        shop: shopFilter,
        request_payload: payload
      }
    }

    if (confirmApply !== 'EDIT_SHOPEE_AUTO_PRODUCT_ADS') {
      return {
        status: 'error',
        mode: 'shopee_edit_auto_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        errors: ['confirm_apply must equal EDIT_SHOPEE_AUTO_PRODUCT_ADS to apply changes to Shopee Ads'],
        shop: shopFilter,
        request_payload: payload
      }
    }

    const liveWriteGuard = assertShopeeLiveWriteAllowed(env, 'ads_client')
    if (liveWriteGuard) {
      return {
        status: 'error',
        mode: 'shopee_edit_auto_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        error: liveWriteGuard.error,
        errors: [liveWriteGuard.message],
        shop: shopFilter,
        request_payload: payload
      }
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'shopee_edit_auto_product_ads',
        dry_run: false,
        applied: false,
        endpoint: SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        errors: ['No Shopee API shop found for the provided shop filter'],
        shop: shopFilter,
        request_payload: payload
      }
    }

    try {
      // Chỉ đẩy thật lên Shopee khi đã có apply=true và confirm_apply hợp lệ.
      const data = await fetchShopeeShopJsonPost(env, shop, SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH, {}, payload)
      return {
        status: 'ok',
        mode: 'shopee_edit_auto_product_ads',
        dry_run: false,
        applied: true,
        endpoint: SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        warning: cleanText(data?.warning),
        message: cleanText(data?.message),
        response: data?.response || []
      }
    } catch (error) {
      return {
        status: 'error',
        mode: 'shopee_edit_auto_product_ads',
        dry_run: false,
        applied: true,
        endpoint: SHOPEE_EDIT_AUTO_PRODUCT_ADS_PATH,
        deprecation_note: deprecationNote,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_payload: payload,
        error: 'shopee_edit_auto_product_ads_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.editShopeeAutoProductAds = editShopeeAutoProductAds

  async function editShopeeManualProductAds(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const apply = parseBooleanOption(options.apply ?? options.apply_now ?? options.applyNow, false)
    const confirmApply = cleanText(options.confirm_apply || options.confirmApply)
    const safeMode = parseBooleanOption(options.safe_mode ?? options.safeMode, true)
    const { payload, errors } = normalizeShopeeManualProductAdsEditPayload(options)
    const safeApplyActions = new Set(['start', 'pause', 'resume', 'stop'])
    const blockedDangerousActions = new Set(['delete'])

    if (!shopFilter) errors.push('shop is required')
    if (errors.length) {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
        errors,
        request_payload: payload
      }
    }

    if (!apply) {
      return {
        status: 'ok',
        mode: 'shopee_edit_manual_product_ads',
        dry_run: true,
        applied: false,
        note: 'Dry-run only. Send apply=true và confirm_apply=EDIT_SHOPEE_MANUAL_PRODUCT_ADS để đẩy thật lên Shopee.',
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
        shop: shopFilter,
        safe_mode: safeMode,
        request_payload: payload
      }
    }

    if (confirmApply !== 'EDIT_SHOPEE_MANUAL_PRODUCT_ADS') {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
        errors: ['confirm_apply must equal EDIT_SHOPEE_MANUAL_PRODUCT_ADS to apply changes to Shopee Ads'],
        shop: shopFilter,
        safe_mode: safeMode,
        request_payload: payload
      }
    }

    const liveWriteGuard = assertShopeeLiveWriteAllowed(env, 'ads_client')
    if (liveWriteGuard) {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ads',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
        error: liveWriteGuard.error,
        message: liveWriteGuard.message,
        client_type: 'ads_client',
        shop: shopFilter,
        safe_mode: safeMode,
        request_payload: payload
      }
    }

    // Chế độ an toàn mặc định: chỉ cho thao tác trạng thái cơ bản để tránh chỉnh nhầm hoặc xoá campaign.
    if (safeMode) {
      if (blockedDangerousActions.has(payload.edit_action)) {
        return {
          status: 'error',
          mode: 'shopee_edit_manual_product_ads',
          dry_run: true,
          applied: false,
          endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
          errors: ['safe_mode is enabled: edit_action=delete is blocked'],
          shop: shopFilter,
          safe_mode: true,
          request_payload: payload
        }
      }
      if (!safeApplyActions.has(payload.edit_action)) {
        return {
          status: 'error',
          mode: 'shopee_edit_manual_product_ads',
          dry_run: true,
          applied: false,
          endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
          errors: ['safe_mode is enabled: only start, pause, resume, stop are allowed when apply=true. Set safe_mode=false if you really need advanced edit actions.'],
          shop: shopFilter,
          safe_mode: true,
          request_payload: payload
        }
      }
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ads',
        dry_run: false,
        applied: false,
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
        errors: ['No Shopee API shop found for the provided shop filter'],
        shop: shopFilter,
        safe_mode: safeMode,
        request_payload: payload
      }
    }

    try {
      // Chỉ đẩy dữ liệu thật khi đã bật apply và xác nhận đúng cụm confirm_apply.
      const data = await fetchShopeeShopJsonPost(env, shop, SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH, {}, payload)
      const shopName = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
      if (shopeeResponseHasBusinessError(data)) {
        return buildShopeeActionResult({
          ok: false,
          status: 'error',
          mode: 'shopee_edit_manual_product_ads',
          action: payload.edit_action,
          endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
          shop: shopName,
          shop_id: String(shop.api_shop_id || ''),
          object_id: cleanText(payload.campaign_id),
          payload,
          raw_response: data,
          sent_to_shopee: true,
          message: 'Shopee từ chối thao tác ADS. Xem raw_response để lấy error/request_id.'
        })
      }
      const verifyResult = await verifyShopeeProductAdsEdit({ core, env, shop, payload })
      return buildShopeeActionResult({
        ok: true,
        status: verifyResult.verified ? 'ok' : 'error',
        mode: 'shopee_edit_manual_product_ads',
        action: payload.edit_action,
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
        shop: shopName,
        shop_id: String(shop.api_shop_id || ''),
        object_id: cleanText(payload.campaign_id),
        payload,
        safe_mode: safeMode,
        raw_response: data,
        sent_to_shopee: true,
        verified: verifyResult.verified,
        verify_result: verifyResult,
        message: verifyResult.verified
          ? 'Đã gọi Shopee Ads API thật và refetch xác nhận campaign đã đổi.'
          : 'Shopee đã nhận request nhưng refetch campaign chưa đúng trạng thái mong muốn, không xem là thành công.'
      })
    } catch (error) {
      return buildShopeeActionResult({
        ok: false,
        status: 'error',
        mode: 'shopee_edit_manual_product_ads',
        action: payload.edit_action,
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_ADS_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        shop_id: String(shop.api_shop_id || ''),
        object_id: cleanText(payload.campaign_id),
        payload,
        safe_mode: safeMode,
        raw_error: error?.shopee || { message: error?.message || String(error) },
        sent_to_shopee: true
      })
    }
  }
  core.editShopeeManualProductAds = editShopeeManualProductAds

  async function editShopeeManualProductAdKeywords(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const campaignId = cleanText(options.campaign_id || options.campaignId)
    const referenceId = shopeeKeywordReferenceId(options.reference_id || options.referenceId)
    const apply = parseBooleanOption(options.apply ?? options.apply_now ?? options.applyNow, false)
    const confirmApply = cleanText(options.confirm_apply || options.confirmApply)
    const { rows: selectedKeywords, errors } = normalizeShopeeAdKeywordEdits(options)

    if (!shopFilter) errors.push('shop is required')
    if (!/^\d+$/.test(campaignId)) errors.push('campaign_id must be a Shopee numeric campaign id')

    const requestPayload = {
      reference_id: referenceId,
      campaign_id: /^\d+$/.test(campaignId) ? Number(campaignId) : campaignId,
      selected_keywords: selectedKeywords
    }

    if (errors.length) {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ad_keywords',
        dry_run: true,
        applied: false,
        errors,
        request_payload: requestPayload
      }
    }

    if (!apply) {
      return {
        status: 'ok',
        mode: 'shopee_edit_manual_product_ad_keywords',
        dry_run: true,
        applied: false,
        note: 'Dry-run only. No request was sent to Shopee. Send apply=true and confirm_apply=EDIT_SHOPEE_AD_KEYWORDS to apply.',
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_AD_KEYWORDS_PATH,
        shop: shopFilter,
        request_payload: requestPayload
      }
    }

    if (confirmApply !== 'EDIT_SHOPEE_AD_KEYWORDS') {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ad_keywords',
        dry_run: true,
        applied: false,
        errors: ['confirm_apply must equal EDIT_SHOPEE_AD_KEYWORDS to apply changes to Shopee Ads'],
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_AD_KEYWORDS_PATH,
        shop: shopFilter,
        request_payload: requestPayload
      }
    }

    const liveWriteGuard = assertShopeeLiveWriteAllowed(env, 'ads_client')
    if (liveWriteGuard) {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ad_keywords',
        dry_run: true,
        applied: false,
        endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_AD_KEYWORDS_PATH,
        error: liveWriteGuard.error,
        message: liveWriteGuard.message,
        client_type: 'ads_client',
        shop: shopFilter,
        request_payload: requestPayload
      }
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'shopee_edit_manual_product_ad_keywords',
        dry_run: false,
        applied: false,
        errors: ['No Shopee API shop found for the provided shop filter'],
        shop: shopFilter,
        request_payload: requestPayload
      }
    }

    const data = await fetchShopeeShopJsonPost(env, shop, SHOPEE_EDIT_MANUAL_PRODUCT_AD_KEYWORDS_PATH, {}, requestPayload)
    return {
      status: 'ok',
      mode: 'shopee_edit_manual_product_ad_keywords',
      dry_run: false,
      applied: true,
      endpoint: SHOPEE_EDIT_MANUAL_PRODUCT_AD_KEYWORDS_PATH,
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      request_id: cleanText(data?.request_id),
      warning: cleanText(data?.warning),
      response: data?.response || [],
      failed_edits: (Array.isArray(data?.response) ? data.response : []).flatMap(row => Array.isArray(row?.failed_edits) ? row.failed_edits : [])
    }
  }
  core.editShopeeManualProductAdKeywords = editShopeeManualProductAdKeywords

  async function fetchShopeeAdsBalances(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const balances = []
    for (const shop of shops) balances.push(await fetchShopeeAdsBalanceShop(env, shop))
    return {
      status: 'ok',
      mode: 'shopee_ads_realtime_balance',
      note: 'Số dư ví ADS realtime từ /api/v2/ads/get_total_balance; không phải chi phí/click/impression/campaign.',
      shop_count: balances.length,
      ok_count: balances.filter(item => item.ok).length,
      total_balance: roundAds(balances.reduce((sum, item) => sum + adsNumber(item.total_balance), 0)),
      shops: balances
    }
  }
  core.fetchShopeeAdsBalances = fetchShopeeAdsBalances
}
