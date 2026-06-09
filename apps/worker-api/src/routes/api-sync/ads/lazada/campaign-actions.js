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
    const emptyReason = !snapshots.length && !warnings.length
      ? 'Lazada Ads API trả 0 campaign trong khoảng lọc.'
      : ''
    return {
      shop: shop.shop_name,
      fetched_campaigns: snapshots.length,
      ...saved,
      empty_count: emptyReason ? 1 : 0,
      empty_reason: emptyReason,
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

  function firstLazadaAdsValue(row = {}, keys = []) {
    for (const key of keys) {
      const value = row?.[key]
      if (value !== undefined && value !== null && cleanText(value) !== '') return value
    }
    return ''
  }

  function normalizeLazadaAdsNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
  }

  function lazadaAdsRowId(row = {}, keys = []) {
    return cleanText(firstLazadaAdsValue(row, keys))
  }

  function lazadaAdsSwitchMatches(expected, actual) {
    const expectedStatus = normalizeLazadaAdsSwitchStatus(expected)
    const actualStatus = normalizeLazadaAdsSwitchStatus(actual)
    if (!expectedStatus) return true
    return actualStatus === expectedStatus
  }

  async function verifyLazadaAdsCampaignReadback(env, shop, payload = {}) {
    const campaignId = cleanText(payload.campaignId || payload.campaign_id)
    if (!campaignId) return { verified: false, reason: 'missing_campaign_id_for_readback' }
    const data = await callLazadaWithShop(env, shop, LAZADA_ADS_CAMPAIGN_PATH, {
      campaignId,
      pageNo: '1',
      pageSize: '50',
      bizCode: normalizeLazadaAdsBizCode(payload.bizCode || payload.biz_code)
    })
    const rows = extractAdsRows(data)
    const row = rows.find(item => lazadaAdsRowId(item, ['campaignId', 'campaign_id', 'id']) === campaignId)
    if (!row) {
      return {
        verified: false,
        reason: 'campaign_not_found_after_readback',
        campaign_id: campaignId,
        request_id: cleanText(data?.request_id || data?.requestId || data?.analyseTraceId)
      }
    }
    const checks = []
    if (payload.dayBudget !== undefined && payload.dayBudget !== null && cleanText(payload.dayBudget) !== '') {
      const expected = normalizeLazadaAdsNumber(payload.dayBudget)
      const actual = normalizeLazadaAdsNumber(firstLazadaAdsValue(row, ['dayBudget', 'dailyBudget', 'budget']))
      checks.push({ field: 'budget', expected, actual, ok: Math.abs(actual - expected) <= 0.01 })
    }
    if (payload.switchStatus !== undefined && cleanText(payload.switchStatus) !== '') {
      const actual = firstLazadaAdsValue(row, ['switchStatus', 'status', 'onlineStatus'])
      checks.push({ field: 'status', expected: normalizeLazadaAdsSwitchStatus(payload.switchStatus), actual: normalizeLazadaAdsSwitchStatus(actual), ok: lazadaAdsSwitchMatches(payload.switchStatus, actual) })
    }
    const failed = checks.filter(item => !item.ok)
    return {
      verified: checks.length ? failed.length === 0 : true,
      reason: failed.length ? 'readback_mismatch' : '',
      campaign_id: campaignId,
      request_id: cleanText(data?.request_id || data?.requestId || data?.analyseTraceId),
      checks,
      failed_checks: failed,
      setting: row
    }
  }
  core.verifyLazadaAdsCampaignReadback = verifyLazadaAdsCampaignReadback

  async function verifyLazadaAdsAdgroupReadback(env, shop, payload = {}, campaignId = '') {
    const adgroupId = cleanText(payload.adgroup_id || payload.adgroupId)
    const parentCampaignId = cleanText(campaignId || payload.campaignId || payload.campaign_id)
    if (!adgroupId) return { verified: false, reason: 'missing_adgroup_id_for_readback' }
    if (!parentCampaignId) return { verified: false, reason: 'missing_campaign_id_for_adgroup_readback', adgroup_id: adgroupId }
    const data = await callLazadaWithShop(env, shop, LAZADA_ADS_ADGROUP_PATH, {
      campaignId: parentCampaignId,
      adgroupId,
      pageNo: '1',
      pageSize: '50',
      bizCode: normalizeLazadaAdsBizCode(payload.bizCode || payload.biz_code)
    })
    const rows = extractAdsRows(data)
    const row = rows.find(item => lazadaAdsRowId(item, ['adgroupId', 'adgroup_id', 'id']) === adgroupId)
    if (!row) {
      return {
        verified: false,
        reason: 'adgroup_not_found_after_readback',
        campaign_id: parentCampaignId,
        adgroup_id: adgroupId,
        request_id: cleanText(data?.request_id || data?.requestId || data?.analyseTraceId)
      }
    }
    const actual = firstLazadaAdsValue(row, ['switchStatus', 'status', 'onlineStatus'])
    const check = { field: 'status', expected: normalizeLazadaAdsSwitchStatus(payload.switchStatus), actual: normalizeLazadaAdsSwitchStatus(actual), ok: lazadaAdsSwitchMatches(payload.switchStatus, actual) }
    return {
      verified: check.ok,
      reason: check.ok ? '' : 'readback_mismatch',
      campaign_id: parentCampaignId,
      adgroup_id: adgroupId,
      request_id: cleanText(data?.request_id || data?.requestId || data?.analyseTraceId),
      checks: [check],
      failed_checks: check.ok ? [] : [check],
      setting: row
    }
  }
  core.verifyLazadaAdsAdgroupReadback = verifyLazadaAdsAdgroupReadback

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
      const apiOk = lazadaAdsSuccess(data)
      const verifyResult = apiOk
        ? await verifyLazadaAdsCampaignReadback(env, shop, payload)
        : { verified: false, reason: 'api_write_failed' }
      return {
        status: apiOk && verifyResult.verified ? 'ok' : 'error',
        mode: 'lazada_ads_update_campaign',
        dry_run: false,
        applied: true,
        verified: verifyResult.verified,
        verify_result: verifyResult,
        endpoint: LAZADA_ADS_UPDATE_CAMPAIGN_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        analyse_trace_id: cleanText(data?.analyseTraceId),
        warning: cleanText(data?.warning),
        message: apiOk && verifyResult.verified
          ? 'Lazada đã xác nhận thay đổi campaign ADS.'
          : cleanText(data?.errorMsg || data?.message || verifyResult.reason || 'Lazada chưa xác nhận thay đổi campaign ADS.'),
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

  function safeLazadaAdgroupPayload(payload = {}) {
    try {
      const rows = JSON.parse(payload.adgroupViewDTOList || '[]')
      return Array.isArray(rows) && rows[0] ? rows[0] : {}
    } catch {
      return {}
    }
  }
  core.safeLazadaAdgroupPayload = safeLazadaAdgroupPayload

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
      const apiOk = lazadaAdsSuccess(data)
      const firstAdgroup = safeLazadaAdgroupPayload(payload)
      const verifyResult = apiOk
        ? await verifyLazadaAdsAdgroupReadback(env, shop, firstAdgroup, options.campaign_id || options.campaignId)
        : { verified: false, reason: 'api_write_failed' }
      return {
        status: apiOk && verifyResult.verified ? 'ok' : 'error',
        mode: 'lazada_ads_update_adgroup_batch',
        dry_run: false,
        applied: true,
        verified: verifyResult.verified,
        verify_result: verifyResult,
        endpoint: LAZADA_ADS_UPDATE_ADGROUP_BATCH_PATH,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        request_id: cleanText(data?.request_id),
        analyse_trace_id: cleanText(data?.analyseTraceId),
        warning: cleanText(data?.warning),
        message: apiOk && verifyResult.verified
          ? 'Lazada đã xác nhận thay đổi nhóm quảng cáo.'
          : cleanText(data?.errorMsg || data?.message || verifyResult.reason || 'Lazada chưa xác nhận thay đổi nhóm quảng cáo.'),
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
