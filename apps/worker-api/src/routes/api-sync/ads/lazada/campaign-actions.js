export function installApiSyncAdsLazadaCampaignActions(core) {
  const DEFAULT_LAZADA_ADS_BIZ_CODE = core.DEFAULT_LAZADA_ADS_BIZ_CODE
  const LAZADA_ADS_ACCOUNT_LATEST_SIGN_INFO_PATH = core.LAZADA_ADS_ACCOUNT_LATEST_SIGN_INFO_PATH
  const LAZADA_ADS_ACCOUNT_SIGN_INFO_PATH = core.LAZADA_ADS_ACCOUNT_SIGN_INFO_PATH
  const LAZADA_ADS_ADGROUP_PATH = core.LAZADA_ADS_ADGROUP_PATH
  const LAZADA_ADS_CAMPAIGN_PATH = core.LAZADA_ADS_CAMPAIGN_PATH
  const LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH = core.LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH
  const LAZADA_ADS_UPDATE_CAMPAIGN_PATH = core.LAZADA_ADS_UPDATE_CAMPAIGN_PATH
  const adsSyncWindow = (...args) => core.adsSyncWindow(...args)
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const extractAdsRows = (...args) => core.extractAdsRows(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const normalizeAdsCampaignRow = (...args) => core.normalizeAdsCampaignRow(...args)
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const responseHasNextPage = (...args) => core.responseHasNextPage(...args)
  const saveAdsCampaignSnapshots = (...args) => core.saveAdsCampaignSnapshots(...args)

  async function fetchLazadaAdgroupSnapshots(env, shop, campaign, options, from, to, snapshotDate) {
    if (!parseBooleanOption(options.includeAdgroups || options.include_adgroups, false)) return []
    const campaignId = cleanText(campaign.campaign_id)
    if (!campaignId) return []
    const pageSize = Math.min(200, Math.max(1, Number(options.adgroupLimit || 100) || 100))
    const bizCode = cleanText(options.bizCode || options.biz_code || options.lazada_biz_code || DEFAULT_LAZADA_ADS_BIZ_CODE)
    const rows = []
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      const data = await callLazadaWithShop(env, shop, LAZADA_ADS_ADGROUP_PATH, {
        campaignId,
        startDate: from,
        endDate: to,
        pageNo: String(pageNo),
        pageSize: String(pageSize),
        bizCode
      })
      const batch = extractAdsRows(data)
      rows.push(...batch.map(row => normalizeAdsCampaignRow('lazada', shop, row, snapshotDate, campaign)))
      if (!responseHasNextPage(data, batch.length, pageSize)) break
    }
    return rows
  }
  core.fetchLazadaAdgroupSnapshots = fetchLazadaAdgroupSnapshots

  async function syncLazadaAdsCampaignsShop(env, shop, options = {}) {
    const { from, to } = adsSyncWindow(options)
    const snapshotDate = to
    const limit = Math.max(1, Math.min(Number(options.limit || 100) || 100, 500))
    const pageSize = Math.min(200, limit)
    const bizCode = cleanText(env.LAZADA_ADS_BIZ_CODE || options.bizCode || options.biz_code || DEFAULT_LAZADA_ADS_BIZ_CODE)
    const warnings = []
    const snapshots = []

    for (let pageNo = 1; pageNo <= Math.ceil(limit / pageSize) && snapshots.length < limit; pageNo++) {
      try {
        const data = await callLazadaWithShop(env, shop, LAZADA_ADS_CAMPAIGN_PATH, {
          startDate: from,
          endDate: to,
          pageNo: String(pageNo),
          pageSize: String(pageSize),
          bizCode
        })
        const rows = extractAdsRows(data)
        const campaigns = rows.map(row => normalizeAdsCampaignRow('lazada', shop, row, snapshotDate))
        snapshots.push(...campaigns)
        for (const campaign of campaigns) {
          try {
            snapshots.push(...await fetchLazadaAdgroupSnapshots(env, shop, campaign, options, from, to, snapshotDate))
          } catch (error) {
            warnings.push({ campaign_id: campaign.campaign_id, stage: LAZADA_ADS_ADGROUP_PATH, message: error.message })
          }
        }
        if (!responseHasNextPage(data, rows.length, pageSize)) break
      } catch (error) {
        warnings.push({ stage: LAZADA_ADS_CAMPAIGN_PATH, message: error.message })
        break
      }
    }

    const saved = await saveAdsCampaignSnapshots(env, snapshots.slice(0, limit))
    if (!snapshots.length && !warnings.length) {
      warnings.push({
        stage: LAZADA_ADS_CAMPAIGN_PATH,
        message: 'Lazada Ads API trả 0 campaign trong khoảng lọc.'
      })
    }
    return {
      shop: shop.shop_name,
      fetched_campaigns: snapshots.length,
      ...saved,
      warnings
    }
  }
  core.syncLazadaAdsCampaignsShop = syncLazadaAdsCampaignsShop

  function normalizeLazadaAdsBizCode(value) {
    const text = cleanText(value)
    if (!text) return 'sponsoredSearch'
    return text === 'SD' ? 'sponsoredSearch' : text
  }
  core.normalizeLazadaAdsBizCode = normalizeLazadaAdsBizCode

  function lazadaAdsSuccess(data = {}) {
    return String(data?.success ?? '').toLowerCase() === 'true' || data?.success === true || String(data?.code || '') === '0'
  }
  core.lazadaAdsSuccess = lazadaAdsSuccess

  function normalizeLazadaAdsSwitchStatus(value) {
    const text = cleanText(value).toLowerCase()
    if (!text) return ''
    if (['1', 'on', 'online', 'enable', 'enabled', 'start', 'resume'].includes(text)) return '1'
    if (['0', 'off', 'offline', 'disable', 'disabled', 'pause', 'stop'].includes(text)) return '0'
    return text
  }
  core.normalizeLazadaAdsSwitchStatus = normalizeLazadaAdsSwitchStatus

  async function callLazadaAdsAccountInfo(env, options = {}, path, mode) {
    const shopFilter = cleanText(options.shop)
    if (!shopFilter) {
      return {
        status: 'error',
        mode,
        endpoint: path,
        error: 'missing_shop',
        message: 'Thiếu shop để kiểm tra trạng thái tài khoản ADS Lazada.',
        shops: []
      }
    }
    const shops = await getApiShops(env, 'lazada', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode,
        endpoint: path,
        error: 'shop_not_found',
        message: 'Không tìm thấy shop Lazada API phù hợp để kiểm tra ADS.',
        shops: []
      }
    }
    try {
      const data = await callLazadaWithShop(env, shop, path, {})
      return {
        status: lazadaAdsSuccess(data) ? 'ok' : 'error',
        mode,
        endpoint: path,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        analyse_trace_id: cleanText(data?.analyseTraceId),
        error: lazadaAdsSuccess(data) ? '' : 'lazada_ads_account_info_failed',
        message: cleanText(data?.errorMsg || data?.message || ''),
        result: data?.result || null,
        response: data
      }
    } catch (error) {
      return {
        status: 'error',
        mode,
        endpoint: path,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        error: `${mode}_failed`,
        message: error?.message || String(error),
        result: null,
        response: null
      }
    }
  }
  core.callLazadaAdsAccountInfo = callLazadaAdsAccountInfo

  async function fetchLazadaAdsAccountSignInfo(env, options = {}) {
    return callLazadaAdsAccountInfo(env, options, LAZADA_ADS_ACCOUNT_SIGN_INFO_PATH, 'lazada_ads_account_sign_info')
  }
  core.fetchLazadaAdsAccountSignInfo = fetchLazadaAdsAccountSignInfo

  async function fetchLazadaAdsLatestSignInfo(env, options = {}) {
    return callLazadaAdsAccountInfo(env, options, LAZADA_ADS_ACCOUNT_LATEST_SIGN_INFO_PATH, 'lazada_ads_latest_sign_info')
  }
  core.fetchLazadaAdsLatestSignInfo = fetchLazadaAdsLatestSignInfo

  function normalizeLazadaAdsCampaignPayload(options = {}) {
    const campaignId = cleanText(options.campaign_id || options.campaignId)
    const payload = {
      campaignId,
      bizCode: normalizeLazadaAdsBizCode(options.biz_code || options.bizCode)
    }
    const errors = []
    if (!campaignId) errors.push('campaign_id là bắt buộc.')
    const campaignName = cleanText(options.campaign_name || options.campaignName)
    const startDate = cleanText(options.start_date || options.startDate)
    const endDate = cleanText(options.end_date || options.endDate)
    const budgetText = cleanText(options.budget)
    const switchStatus = normalizeLazadaAdsSwitchStatus(options.switch_status || options.switchStatus)
    if (campaignName) payload.campaignName = campaignName
    if (startDate) payload.startDate = startDate
    if (endDate) payload.endDate = endDate
    if (budgetText) payload.dayBudget = budgetText
    if (switchStatus) payload.switchStatus = switchStatus
    if (!campaignName && !startDate && !endDate && !budgetText && !switchStatus) {
      errors.push('Cần ít nhất một trường thay đổi: campaign_name, start_date, end_date, budget hoặc switch_status.')
    }
    return { payload, errors }
  }
  core.normalizeLazadaAdsCampaignPayload = normalizeLazadaAdsCampaignPayload

  async function updateLazadaAdsCampaign(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const apply = parseBooleanOption(options.apply ?? options.apply_now ?? options.applyNow, false)
    const confirmApply = cleanText(options.confirm_apply || options.confirmApply)
    const { payload, errors } = normalizeLazadaAdsCampaignPayload(options)
    if (!shopFilter) errors.push('shop là bắt buộc.')
    if (errors.length) {
      return {
        status: 'error',
        mode: 'lazada_ads_update_campaign',
        dry_run: true,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_CAMPAIGN_PATH,
        errors,
        request_payload: payload
      }
    }
    if (!apply) {
      return {
        status: 'ok',
        mode: 'lazada_ads_update_campaign',
        dry_run: true,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_CAMPAIGN_PATH,
        note: 'Chế độ preview. Gửi apply=true và confirm_apply=UPDATE_LAZADA_ADS_CAMPAIGN để đẩy thật lên Lazada ADS.',
        shop: shopFilter,
        request_payload: payload
      }
    }
    if (confirmApply !== 'UPDATE_LAZADA_ADS_CAMPAIGN') {
      return {
        status: 'error',
        mode: 'lazada_ads_update_campaign',
        dry_run: true,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_CAMPAIGN_PATH,
        errors: ['confirm_apply phải bằng UPDATE_LAZADA_ADS_CAMPAIGN để cho phép đẩy thật.'],
        shop: shopFilter,
        request_payload: payload
      }
    }
    const shops = await getApiShops(env, 'lazada', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'lazada_ads_update_campaign',
        dry_run: false,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_CAMPAIGN_PATH,
        errors: ['Không tìm thấy shop Lazada API phù hợp để đẩy campaign ADS.'],
        shop: shopFilter,
        request_payload: payload
      }
    }
    try {
      // Luồng này chỉ bắn thật khi đã preview trước và người vận hành nhập đúng xác nhận.
      const data = await callLazadaWithShop(env, shop, LAZADA_ADS_UPDATE_CAMPAIGN_PATH, payload)
      return {
        status: lazadaAdsSuccess(data) ? 'ok' : 'error',
        mode: 'lazada_ads_update_campaign',
        dry_run: false,
        applied: true,
        endpoint: LAZADA_ADS_UPDATE_CAMPAIGN_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        analyse_trace_id: cleanText(data?.analyseTraceId),
        warning: cleanText(data?.warning),
        message: cleanText(data?.errorMsg || data?.message),
        response: data?.result ?? data,
        request_payload: payload
      }
    } catch (error) {
      return {
        status: 'error',
        mode: 'lazada_ads_update_campaign',
        dry_run: false,
        applied: true,
        endpoint: LAZADA_ADS_UPDATE_CAMPAIGN_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_payload: payload,
        error: 'lazada_ads_update_campaign_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.updateLazadaAdsCampaign = updateLazadaAdsCampaign

  function normalizeLazadaAdsAdgroupPayload(options = {}) {
    const adgroupId = cleanText(options.adgroup_id || options.adgroupId)
    const switchStatus = normalizeLazadaAdsSwitchStatus(options.switch_status || options.switchStatus)
    const errors = []
    if (!adgroupId) errors.push('adgroup_id là bắt buộc.')
    if (!switchStatus) errors.push('switch_status là bắt buộc với adgroup Lazada.')
    return {
      payload: {
        bizCode: normalizeLazadaAdsBizCode(options.biz_code || options.bizCode),
        adgroupViewDTOList: JSON.stringify([{ adgroupId, switchStatus }])
      },
      errors
    }
  }
  core.normalizeLazadaAdsAdgroupPayload = normalizeLazadaAdsAdgroupPayload

  async function updateLazadaAdsAdgroupBatch(env, options = {}) {
    const shopFilter = cleanText(options.shop)
    const apply = parseBooleanOption(options.apply ?? options.apply_now ?? options.applyNow, false)
    const confirmApply = cleanText(options.confirm_apply || options.confirmApply)
    const { payload, errors } = normalizeLazadaAdsAdgroupPayload(options)
    if (!shopFilter) errors.push('shop là bắt buộc.')
    if (errors.length) {
      return {
        status: 'error',
        mode: 'lazada_ads_update_adgroup_batch',
        dry_run: true,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH,
        errors,
        request_payload: payload
      }
    }
    if (!apply) {
      return {
        status: 'ok',
        mode: 'lazada_ads_update_adgroup_batch',
        dry_run: true,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH,
        note: 'Chế độ preview. Gửi apply=true và confirm_apply=UPDATE_LAZADA_ADS_ADGROUP để đẩy thật lên Lazada ADS.',
        shop: shopFilter,
        request_payload: payload
      }
    }
    if (confirmApply !== 'UPDATE_LAZADA_ADS_ADGROUP') {
      return {
        status: 'error',
        mode: 'lazada_ads_update_adgroup_batch',
        dry_run: true,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH,
        errors: ['confirm_apply phải bằng UPDATE_LAZADA_ADS_ADGROUP để cho phép đẩy thật.'],
        shop: shopFilter,
        request_payload: payload
      }
    }
    const shops = await getApiShops(env, 'lazada', shopFilter, 1)
    const shop = shops[0]
    if (!shop || !shop.api_shop_id) {
      return {
        status: 'error',
        mode: 'lazada_ads_update_adgroup_batch',
        dry_run: false,
        applied: false,
        endpoint: LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH,
        errors: ['Không tìm thấy shop Lazada API phù hợp để đẩy adgroup ADS.'],
        shop: shopFilter,
        request_payload: payload
      }
    }
    try {
      // Adgroup Lazada hiện chỉ cho bật/tắt. Vẫn phải bắt xác nhận rõ để tránh tắt nhầm diện rộng.
      const data = await callLazadaWithShop(env, shop, LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH, payload)
      return {
        status: lazadaAdsSuccess(data) ? 'ok' : 'error',
        mode: 'lazada_ads_update_adgroup_batch',
        dry_run: false,
        applied: true,
        endpoint: LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        analyse_trace_id: cleanText(data?.analyseTraceId),
        warning: cleanText(data?.warning),
        message: cleanText(data?.errorMsg || data?.message),
        response: data?.result ?? data,
        request_payload: payload
      }
    } catch (error) {
      return {
        status: 'error',
        mode: 'lazada_ads_update_adgroup_batch',
        dry_run: false,
        applied: true,
        endpoint: LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_payload: payload,
        error: 'lazada_ads_update_adgroup_batch_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.updateLazadaAdsAdgroupBatch = updateLazadaAdsAdgroupBatch
}
