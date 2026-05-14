export function installApiSyncAdsCommonStorage(core) {
  const DEFAULT_SHOPEE_ADS_PATHS = core.DEFAULT_SHOPEE_ADS_PATHS
  const SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH = core.SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH
  const SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH = core.SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH
  const SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH = core.SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH
  const adsUnixEnd = (...args) => core.adsUnixEnd(...args)
  const adsUnixStart = (...args) => core.adsUnixStart(...args)
  const chunkList = (...args) => core.chunkList(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const extractAdsRows = (...args) => core.extractAdsRows(...args)
  const fetchShopeeShopJson = (...args) => core.fetchShopeeShopJson(...args)
  const firstAdsText = (...args) => core.firstAdsText(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const uniqueTexts = (...args) => core.uniqueTexts(...args)

  async function ensureAdsCampaignSnapshotsTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_ads_campaign_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        shop TEXT DEFAULT '',
        campaign_id TEXT DEFAULT '',
        campaign_name TEXT DEFAULT '',
        campaign_type TEXT DEFAULT '',
        product_sku TEXT DEFAULT '',
        product_name TEXT DEFAULT '',
        spend REAL DEFAULT 0,
        revenue REAL DEFAULT 0,
        orders INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        ctr REAL DEFAULT 0,
        cpc REAL DEFAULT 0,
        cvr REAL DEFAULT 0,
        roas REAL DEFAULT 0,
        acos REAL DEFAULT 0,
        status TEXT DEFAULT '',
        snapshot_date TEXT DEFAULT '',
        raw_data TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_ads_campaign_snapshots_lookup
      ON marketplace_ads_campaign_snapshots(platform, shop, snapshot_date)
    `).run()
  }
  core.ensureAdsCampaignSnapshotsTable = ensureAdsCampaignSnapshotsTable

  async function saveAdsCampaignSnapshots(env, snapshots) {
    const rows = (snapshots || []).filter(row => row?.platform && row?.shop && row?.campaign_id && row?.snapshot_date)
    if (!rows.length) return { saved: 0, inserted: 0, updated: 0 }
    await ensureAdsCampaignSnapshotsTable(env)
    let inserted = 0
    let updated = 0

    for (let i = 0; i < rows.length; i += 40) {
      const chunk = rows.slice(i, i + 40)
      const updateResults = await env.DB.batch(chunk.map(row => env.DB.prepare(`
        UPDATE marketplace_ads_campaign_snapshots
        SET campaign_name = ?,
            campaign_type = ?,
            product_name = ?,
            spend = ?,
            revenue = ?,
            orders = ?,
            impressions = ?,
            clicks = ?,
            ctr = ?,
            cpc = ?,
            cvr = ?,
            roas = ?,
            acos = ?,
            status = ?,
            raw_data = ?,
            updated_at = datetime('now', '+7 hours')
        WHERE platform = ?
          AND shop = ?
          AND campaign_id = ?
          AND COALESCE(product_sku, '') = ?
          AND snapshot_date = ?
      `).bind(
        row.campaign_name,
        row.campaign_type,
        row.product_name,
        row.spend,
        row.revenue,
        row.orders,
        row.impressions,
        row.clicks,
        row.ctr,
        row.cpc,
        row.cvr,
        row.roas,
        row.acos,
        row.status,
        row.raw_data,
        row.platform,
        row.shop,
        row.campaign_id,
        row.product_sku || '',
        row.snapshot_date
      )))
      const inserts = []
      updateResults.forEach((result, index) => {
        const changes = Number(result?.meta?.changes || 0)
        if (changes) updated += changes
        else inserts.push(chunk[index])
      })
      if (inserts.length) {
        await env.DB.batch(inserts.map(row => env.DB.prepare(`
          INSERT INTO marketplace_ads_campaign_snapshots (
            platform, shop, campaign_id, campaign_name, campaign_type,
            product_sku, product_name, spend, revenue, orders, impressions,
            clicks, ctr, cpc, cvr, roas, acos, status, snapshot_date, raw_data,
            updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
        `).bind(
          row.platform,
          row.shop,
          row.campaign_id,
          row.campaign_name,
          row.campaign_type,
          row.product_sku || '',
          row.product_name,
          row.spend,
          row.revenue,
          row.orders,
          row.impressions,
          row.clicks,
          row.ctr,
          row.cpc,
          row.cvr,
          row.roas,
          row.acos,
          row.status,
          row.snapshot_date,
          row.raw_data
        )))
        inserted += inserts.length
      }
    }

    return { saved: rows.length, inserted, updated }
  }
  core.saveAdsCampaignSnapshots = saveAdsCampaignSnapshots

  async function ensureAdsHourlySnapshotsTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_ads_hourly_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        shop TEXT DEFAULT '',
        snapshot_date TEXT DEFAULT '',
        hour INTEGER DEFAULT 0,
        spend REAL DEFAULT 0,
        revenue REAL DEFAULT 0,
        orders INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        ctr REAL DEFAULT 0,
        cpc REAL DEFAULT 0,
        cvr REAL DEFAULT 0,
        roas REAL DEFAULT 0,
        raw_data TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_hourly_snapshots_unique
      ON marketplace_ads_hourly_snapshots(platform, shop, snapshot_date, hour)
    `).run()
  }
  core.ensureAdsHourlySnapshotsTable = ensureAdsHourlySnapshotsTable

  async function saveAdsHourlySnapshots(env, rows) {
    const items = (rows || []).filter(row => row?.platform && row?.shop && row?.snapshot_date && row?.hour !== undefined)
    if (!items.length) return { saved_hourly: 0, inserted_hourly: 0, updated_hourly: 0 }
    await ensureAdsHourlySnapshotsTable(env)
    let inserted = 0
    let updated = 0
    for (let i = 0; i < items.length; i += 40) {
      const chunk = items.slice(i, i + 40)
      const updateResults = await env.DB.batch(chunk.map(row => env.DB.prepare(`
        UPDATE marketplace_ads_hourly_snapshots
        SET spend = ?,
            revenue = ?,
            orders = ?,
            impressions = ?,
            clicks = ?,
            ctr = ?,
            cpc = ?,
            cvr = ?,
            roas = ?,
            raw_data = ?,
            updated_at = datetime('now', '+7 hours')
        WHERE platform = ?
          AND shop = ?
          AND snapshot_date = ?
          AND hour = ?
      `).bind(
        row.spend,
        row.revenue,
        row.orders,
        row.impressions,
        row.clicks,
        row.ctr,
        row.cpc,
        row.cvr,
        row.roas,
        row.raw_data,
        row.platform,
        row.shop,
        row.snapshot_date,
        row.hour
      )))
      const inserts = []
      updateResults.forEach((result, index) => {
        const changes = Number(result?.meta?.changes || 0)
        if (changes) updated += changes
        else inserts.push(chunk[index])
      })
      if (inserts.length) {
        await env.DB.batch(inserts.map(row => env.DB.prepare(`
          INSERT INTO marketplace_ads_hourly_snapshots (
            platform, shop, snapshot_date, hour, spend, revenue, orders,
            impressions, clicks, ctr, cpc, cvr, roas, raw_data, updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
        `).bind(
          row.platform,
          row.shop,
          row.snapshot_date,
          row.hour,
          row.spend,
          row.revenue,
          row.orders,
          row.impressions,
          row.clicks,
          row.ctr,
          row.cpc,
          row.cvr,
          row.roas,
          row.raw_data
        )))
        inserted += inserts.length
      }
    }
    return { saved_hourly: items.length, inserted_hourly: inserted, updated_hourly: updated }
  }
  core.saveAdsHourlySnapshots = saveAdsHourlySnapshots

  function normalizeShopeeAdsPath(value) {
    const raw = cleanText(value)
    if (!raw) return ''
    if (raw.startsWith('/')) return raw
    try {
      const parsed = new URL(raw)
      if (parsed.pathname.startsWith('/api/')) return parsed.pathname
    } catch {}
    const apiName = raw.match(/^v(\d+)\.([a-z0-9_]+)\.(.+)$/i)
    if (apiName) return `/api/v${apiName[1]}/${apiName[2]}/${apiName[3].replace(/\./g, '_')}`
    return raw
  }
  core.normalizeShopeeAdsPath = normalizeShopeeAdsPath

  function normalizeShopeeAdsPathConfig(entry) {
    if (!entry) return null
    if (typeof entry === 'string') {
      const path = normalizeShopeeAdsPath(entry)
      return path ? { path, param_style: 'auto', params: {} } : null
    }
    if (typeof entry !== 'object') return null
    const path = normalizeShopeeAdsPath(entry.path || entry.endpoint || entry.api || entry.api_name || entry.apiName || entry.url)
    if (!path) return null
    return {
      path,
      param_style: cleanText(entry.param_style || entry.paramStyle || entry.style || entry.profile || 'auto'),
      params: entry.params && typeof entry.params === 'object' ? entry.params : {},
      label: cleanText(entry.label || entry.name || path)
    }
  }
  core.normalizeShopeeAdsPathConfig = normalizeShopeeAdsPathConfig

  function normalizeShopeeAdsPathConfigs(entries) {
    return (entries || []).map(normalizeShopeeAdsPathConfig).filter(Boolean)
  }
  core.normalizeShopeeAdsPathConfigs = normalizeShopeeAdsPathConfigs

  function parseShopeeAdsPathConfigs(raw) {
    const text = cleanText(raw)
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return normalizeShopeeAdsPathConfigs(parsed)
    } catch (error) {
      console.error('[SHOPEE_ADS] Invalid path JSON:', error.message)
    }
    return normalizeShopeeAdsPathConfigs(text.split(',').map(cleanText).filter(Boolean))
  }
  core.parseShopeeAdsPathConfigs = parseShopeeAdsPathConfigs

  function parseIdList(value) {
    if (!value) return []
    if (Array.isArray(value)) return uniqueTexts(value.map(String))
    const text = cleanText(value)
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return uniqueTexts(parsed.map(String))
      if (parsed && typeof parsed === 'object') return uniqueTexts(Object.values(parsed).flat().map(String))
    } catch {}
    return uniqueTexts(text.split(/[,\s]+/).map(cleanText))
  }
  core.parseIdList = parseIdList

  function configuredShopeeCampaignIds(env, shop, options = {}) {
    const direct = parseIdList(options.campaign_id_list || options.campaignIds || options.campaign_ids)
    if (direct.length) return direct
    const shopKeyValues = [shop.api_shop_id, shop.shop_name, shop.user_name].map(cleanText).filter(Boolean)
    const rawJson = cleanText(options.shopee_campaign_ids_json || env.SHOPEE_ADS_CAMPAIGN_IDS_JSON)
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson)
        if (Array.isArray(parsed)) return parseIdList(parsed)
        if (parsed && typeof parsed === 'object') {
          for (const key of shopKeyValues) {
            const ids = parseIdList(parsed[key])
            if (ids.length) return ids
          }
        }
      } catch (error) {
        console.error('[SHOPEE_ADS] Invalid campaign ids JSON:', error.message)
      }
    }
    return parseIdList(options.shopee_campaign_ids || env.SHOPEE_ADS_CAMPAIGN_IDS)
  }
  core.configuredShopeeCampaignIds = configuredShopeeCampaignIds

  function campaignIdsFromRows(rows) {
    return numericIdList((rows || []).map(row => firstAdsText(row, [
      'campaign_id', 'campaignId', 'campaignID', 'campaignid', 'id'
    ])))
  }
  core.campaignIdsFromRows = campaignIdsFromRows

  function numericIdList(values) {
    return uniqueTexts((values || []).map(cleanText).filter(value => /^\d+$/.test(value)))
  }
  core.numericIdList = numericIdList

  async function knownShopeeCampaignIds(env, shop, limit = 100) {
    await ensureAdsCampaignSnapshotsTable(env)
    const ids = [shop.shop_name, shop.user_name, shop.api_shop_id].map(cleanText).filter(Boolean)
    if (!ids.length) return []
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 5000)
    const marks = ids.map(() => '?').join(',')
    const { results } = await env.DB.prepare(`
      SELECT DISTINCT campaign_id
      FROM marketplace_ads_campaign_snapshots
      WHERE platform = 'shopee'
        AND campaign_id IS NOT NULL AND campaign_id != ''
        AND shop IN (${marks})
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(...ids, safeLimit).all()
    return numericIdList((results || []).map(row => row.campaign_id))
  }
  core.knownShopeeCampaignIds = knownShopeeCampaignIds

  async function discoverShopeeProductCampaignIds(env, shop, options = {}, warnings = []) {
    const totalLimit = Math.min(Math.max(Number(options.campaignListLimit || options.campaign_list_limit || 5000) || 5000, 1), 5000)
    const pageSize = Math.min(Math.max(Number(options.campaignListPageSize || options.campaign_list_page_size || totalLimit) || totalLimit, 1), 5000)
    const adType = cleanText(options.ad_type || options.adType || 'all').toLowerCase()
    const normalizedAdType = new Set(['', 'all', 'auto', 'manual']).has(adType) ? adType : 'all'
    const ids = []

    for (let offset = 0; offset < totalLimit; offset += pageSize) {
      try {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH, {
          ad_type: normalizedAdType,
          offset,
          limit: Math.min(pageSize, totalLimit - offset)
        })
        const response = data?.response || {}
        const rows = Array.isArray(response.campaign_list) ? response.campaign_list : extractAdsRows(data)
        ids.push(...campaignIdsFromRows(rows))
        if (!response.has_next_page || rows.length <= 0) break
      } catch (error) {
        warnings.push({ stage: SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH, message: error.message })
        break
      }
    }

    const uniqueIds = numericIdList(ids).slice(0, totalLimit)
    if (!uniqueIds.length) warnings.push({ stage: SHOPEE_PRODUCT_LEVEL_CAMPAIGN_ID_LIST_PATH, message: 'No product campaign ids returned' })
    return uniqueIds
  }
  core.discoverShopeeProductCampaignIds = discoverShopeeProductCampaignIds

  async function resolveShopeeProductCampaignIds(env, shop, options = {}, warnings = [], stage = SHOPEE_PRODUCT_CAMPAIGN_DAILY_PERFORMANCE_PATH) {
    const configuredIds = configuredShopeeCampaignIds(env, shop, options)
    const configuredNumericIds = numericIdList(configuredIds)
    const campaignLimit = Math.min(Math.max(Number(
      options.campaignListLimit ||
      options.campaign_list_limit ||
      options.product_campaign_limit ||
      options.productCampaignLimit ||
      options.limit ||
      5000
    ) || 5000, 1), 5000)
    if (configuredIds.length && !configuredNumericIds.length) {
      warnings.push({
        stage,
        message: 'campaign_id_list phai la ID so cua Shopee campaign.'
      })
    }

    const knownIds = configuredNumericIds.length ? [] : await knownShopeeCampaignIds(env, shop, campaignLimit)
    let campaignIds = configuredNumericIds.length ? configuredNumericIds : knownIds
    if (!campaignIds.length) {
      campaignIds = await discoverShopeeProductCampaignIds(env, shop, { ...options, campaign_list_limit: campaignLimit }, warnings)
    }

    campaignIds = numericIdList(campaignIds).slice(0, campaignLimit)
    if (!campaignIds.length) {
      warnings.push({
        stage,
        message: 'Endpoint nay bat buoc campaign_id_list, nhung he thong chua lay duoc campaign id tu API/list/config.'
      })
    }
    return campaignIds
  }
  core.resolveShopeeProductCampaignIds = resolveShopeeProductCampaignIds

  function shopeeCampaignInfoTypeList(value = '') {
    const ids = parseIdList(value || '1,2,3,4')
      .filter(id => ['1', '2', '3', '4'].includes(id))
    return (ids.length ? ids : ['1', '2', '3', '4']).join(',')
  }
  core.shopeeCampaignInfoTypeList = shopeeCampaignInfoTypeList

  function normalizeShopeeProductCampaignSettingRows(rows = []) {
    return (rows || []).map(row => {
      const common = row?.common_info || {}
      const autoProducts = Array.isArray(row?.auto_product_ads_info) ? row.auto_product_ads_info : []
      const itemIds = [
        ...(Array.isArray(common.item_id_list) ? common.item_id_list : []),
        ...autoProducts.map(item => item?.item_id)
      ].map(cleanText).filter(Boolean)
      return {
        campaign_id: cleanText(row?.campaign_id || row?.campaignId),
        ad_type: cleanText(common.ad_type),
        ad_name: cleanText(common.ad_name),
        campaign_status: cleanText(common.campaign_status),
        bidding_method: cleanText(common.bidding_method),
        campaign_placement: cleanText(common.campaign_placement),
        campaign_budget: roundAds(common.campaign_budget),
        start_time: Number(common.campaign_duration?.start_time || 0) || null,
        end_time: Number(common.campaign_duration?.end_time || 0) || null,
        item_id_list: uniqueTexts(itemIds),
        enhanced_cpc: typeof row?.manual_bidding_info?.enhanced_cpc === 'boolean'
          ? row.manual_bidding_info.enhanced_cpc
          : null,
        selected_keywords: Array.isArray(row?.manual_bidding_info?.selected_keywords)
          ? row.manual_bidding_info.selected_keywords
          : [],
        discovery_ads_locations: Array.isArray(row?.manual_bidding_info?.discovery_ads_locations)
          ? row.manual_bidding_info.discovery_ads_locations
          : [],
        roas_target: row?.auto_bidding_info?.roas_target === undefined
          ? null
          : roundAds(row.auto_bidding_info.roas_target),
        auto_product_ads_info: autoProducts,
        product_name: cleanText(autoProducts.find(item => cleanText(item?.product_name))?.product_name),
        raw_setting: row
      }
    }).filter(row => /^\d+$/.test(row.campaign_id))
  }
  core.normalizeShopeeProductCampaignSettingRows = normalizeShopeeProductCampaignSettingRows

  async function fetchShopeeProductCampaignSettingsMap(env, shop, campaignIds, options = {}, warnings = []) {
    const ids = numericIdList(campaignIds)
    const map = new Map()
    if (!ids.length) return map
    const infoTypeList = shopeeCampaignInfoTypeList(options.info_type_list || options.infoTypeList)
    for (const chunk of chunkList(ids, 100)) {
      try {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH, {
          info_type_list: infoTypeList,
          campaign_id_list: chunk.join(',')
        })
        const response = data?.response || {}
        const rows = normalizeShopeeProductCampaignSettingRows(
          Array.isArray(response.campaign_list) ? response.campaign_list : extractAdsRows(data)
        )
        rows.forEach(row => map.set(row.campaign_id, row))
      } catch (error) {
        warnings.push({ stage: SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH, message: error.message })
      }
    }
    return map
  }
  core.fetchShopeeProductCampaignSettingsMap = fetchShopeeProductCampaignSettingsMap

  function enrichShopeeCampaignFromSetting(campaign = {}, setting = null) {
    const commonName = cleanText(setting?.ad_name)
    const productName = cleanText(setting?.product_name)
    const itemIds = Array.isArray(setting?.item_id_list) ? setting.item_id_list : []
    const campaignType = uniqueTexts([
      campaign?.ad_type,
      setting?.ad_type,
      setting?.bidding_method,
      campaign?.campaign_placement,
      setting?.campaign_placement,
      setting?.campaign_status
    ]).join(' / ')
    return {
      campaign_name: commonName || cleanText(campaign?.ad_name) || cleanText(campaign?.campaign_id),
      campaign_type: campaignType || uniqueTexts([campaign?.ad_type, campaign?.campaign_placement]).join(' / '),
      product_name: productName || commonName || cleanText(campaign?.ad_name),
      setting_summary: setting ? {
        campaign_status: setting.campaign_status,
        bidding_method: setting.bidding_method,
        campaign_placement: setting.campaign_placement,
        campaign_budget: setting.campaign_budget,
        start_time: setting.start_time,
        end_time: setting.end_time,
        item_id_list: itemIds,
        enhanced_cpc: setting.enhanced_cpc,
        selected_keyword_count: setting.selected_keywords.length,
        discovery_ads_locations: setting.discovery_ads_locations,
        roas_target: setting.roas_target,
        auto_product_ads_info: setting.auto_product_ads_info
      } : null,
      raw_setting: setting?.raw_setting || null
    }
  }
  core.enrichShopeeCampaignFromSetting = enrichShopeeCampaignFromSetting

  function shopeeAdsPaths(env, options = {}) {
    if (Array.isArray(options.shopee_paths) && options.shopee_paths.length) return normalizeShopeeAdsPathConfigs(options.shopee_paths)
    const rawJson = cleanText(env.SHOPEE_ADS_REPORT_PATHS_JSON)
    if (rawJson) {
      const parsed = parseShopeeAdsPathConfigs(rawJson)
      if (parsed.length) return parsed
    }
    const rawList = cleanText(env.SHOPEE_ADS_REPORT_PATHS)
    if (rawList) {
      const parsed = parseShopeeAdsPathConfigs(rawList)
      if (parsed.length) return parsed
    }
    return normalizeShopeeAdsPathConfigs(DEFAULT_SHOPEE_ADS_PATHS)
  }
  core.shopeeAdsPaths = shopeeAdsPaths

  function shopeeAdsParams(endpoint, options, from, to, page, pageSize) {
    const extra = options.shopee_params && typeof options.shopee_params === 'object' ? options.shopee_params : {}
    const endpointParams = endpoint?.params && typeof endpoint.params === 'object' ? endpoint.params : {}
    const style = cleanText(endpoint?.param_style || 'auto').toLowerCase()
    const paging = {
      page_no: page,
      page_size: pageSize,
      offset: (page - 1) * pageSize,
      limit: pageSize
    }
    const dateRange = {
      start_date: from,
      end_date: to,
      startDate: from,
      endDate: to
    }
    const timeRange = {
      time_from: adsUnixStart(from),
      time_to: adsUnixEnd(to),
      start_time: adsUnixStart(from),
      end_time: adsUnixEnd(to)
    }
    const base = { ...paging }
    if (style === 'date_paging' || style === 'date' || style === 'auto') Object.assign(base, dateRange)
    if (style === 'time_paging' || style === 'time' || style === 'auto') Object.assign(base, timeRange)
    return {
      ...base,
      ...endpointParams,
      ...extra
    }
  }
  core.shopeeAdsParams = shopeeAdsParams
}
