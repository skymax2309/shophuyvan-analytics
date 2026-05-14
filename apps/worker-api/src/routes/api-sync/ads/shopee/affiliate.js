export function installApiSyncAdsShopeeAffiliate(core) {
  const SHOPEE_AFFILIATE_PERFORMANCE_PATH = core.SHOPEE_AFFILIATE_PERFORMANCE_PATH
  const SHOPEE_AMS_OPEN_CAMPAIGN_PERFORMANCE_PATH = core.SHOPEE_AMS_OPEN_CAMPAIGN_PERFORMANCE_PATH
  const addUtcDays = (...args) => core.addUtcDays(...args)
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const dateFromYmd = (...args) => core.dateFromYmd(...args)
  const fetchShopeeShopJson = (...args) => core.fetchShopeeShopJson(...args)
  const formatBangkokDate = (...args) => core.formatBangkokDate(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const parseAdsDate = (...args) => core.parseAdsDate(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const shopeeAmsDate = (...args) => core.shopeeAmsDate(...args)
  const ymdFromDate = (...args) => core.ymdFromDate(...args)

  async function ensureShopeeAffiliatePerformanceTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_affiliate_performance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        shop TEXT DEFAULT '',
        affiliate_id TEXT DEFAULT '',
        affiliate_name TEXT DEFAULT '',
        affiliate_username TEXT DEFAULT '',
        sales REAL DEFAULT 0,
        items_sold INTEGER DEFAULT 0,
        orders INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        est_commission REAL DEFAULT 0,
        roi REAL DEFAULT 0,
        total_buyers INTEGER DEFAULT 0,
        new_buyers INTEGER DEFAULT 0,
        period_type TEXT DEFAULT '',
        start_date TEXT DEFAULT '',
        end_date TEXT DEFAULT '',
        fetched_date_range TEXT DEFAULT '',
        raw_data TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_affiliate_performance_lookup
      ON marketplace_affiliate_performance_snapshots(platform, shop, start_date, end_date)
    `).run()
  }
  core.ensureShopeeAffiliatePerformanceTable = ensureShopeeAffiliatePerformanceTable

  function affiliatePeriodWindow(options = {}) {
    const requested = cleanText(options.period_type || options.periodType || options.affiliate_period_type || options.affiliatePeriodType)
    const periodType = ['Day', 'Week', 'Month', 'Last7d', 'Last30d'].includes(requested) ? requested : 'Last7d'
    const now = new Date()
    const yesterday = addUtcDays(dateFromYmd(formatBangkokDate(now)) || now, -1)
    const requestedTo = dateFromYmd(parseAdsDate(options.to || options.to_date, yesterday)) || yesterday
    const safeEnd = requestedTo.getTime() > yesterday.getTime() ? yesterday : requestedTo
    let start = safeEnd
    let end = safeEnd
    if (periodType === 'Last30d') start = addUtcDays(end, -29)
    else if (periodType === 'Last7d') start = addUtcDays(end, -6)
    else if (periodType === 'Day') start = end
    else {
      const requestedFrom = dateFromYmd(parseAdsDate(options.from || options.from_date, safeEnd)) || safeEnd
      start = requestedFrom
    }
    return {
      period_type: periodType,
      start_date: ymdFromDate(start),
      end_date: ymdFromDate(end)
    }
  }
  core.affiliatePeriodWindow = affiliatePeriodWindow

  function normalizeAffiliateRow(shop, row, period, fetchedDateRange) {
    return {
      platform: 'shopee',
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      affiliate_id: cleanText(row?.affiliate_id),
      affiliate_name: cleanText(row?.affiliate_name),
      affiliate_username: cleanText(row?.affiliate_username),
      sales: roundAds(row?.sales),
      items_sold: Math.round(adsNumber(row?.items_sold)),
      orders: Math.round(adsNumber(row?.orders)),
      clicks: Math.round(adsNumber(row?.clicks)),
      est_commission: roundAds(row?.est_commission),
      roi: roundAds(row?.roi),
      total_buyers: Math.round(adsNumber(row?.total_buyers)),
      new_buyers: Math.round(adsNumber(row?.new_buyers)),
      period_type: period.period_type,
      start_date: period.start_date,
      end_date: period.end_date,
      fetched_date_range: cleanText(fetchedDateRange),
      raw_data: JSON.stringify(row || {}).slice(0, 12000)
    }
  }
  core.normalizeAffiliateRow = normalizeAffiliateRow

  async function saveAffiliatePerformanceSnapshots(env, rows) {
    const items = (rows || []).filter(row => row.platform && row.shop && row.affiliate_id && row.start_date && row.end_date)
    if (!items.length) return { saved: 0, inserted: 0, updated: 0 }
    await ensureShopeeAffiliatePerformanceTable(env)
    let inserted = 0
    let updated = 0
    for (let i = 0; i < items.length; i += 40) {
      const chunk = items.slice(i, i + 40)
      const updateResults = await env.DB.batch(chunk.map(row => env.DB.prepare(`
        UPDATE marketplace_affiliate_performance_snapshots
        SET affiliate_name = ?,
            affiliate_username = ?,
            sales = ?,
            items_sold = ?,
            orders = ?,
            clicks = ?,
            est_commission = ?,
            roi = ?,
            total_buyers = ?,
            new_buyers = ?,
            fetched_date_range = ?,
            raw_data = ?,
            updated_at = datetime('now', '+7 hours')
        WHERE platform = ?
          AND shop = ?
          AND affiliate_id = ?
          AND period_type = ?
          AND start_date = ?
          AND end_date = ?
      `).bind(
        row.affiliate_name,
        row.affiliate_username,
        row.sales,
        row.items_sold,
        row.orders,
        row.clicks,
        row.est_commission,
        row.roi,
        row.total_buyers,
        row.new_buyers,
        row.fetched_date_range,
        row.raw_data,
        row.platform,
        row.shop,
        row.affiliate_id,
        row.period_type,
        row.start_date,
        row.end_date
      )))
      const inserts = []
      updateResults.forEach((result, index) => {
        const changes = Number(result?.meta?.changes || 0)
        if (changes) updated += changes
        else inserts.push(chunk[index])
      })
      if (inserts.length) {
        await env.DB.batch(inserts.map(row => env.DB.prepare(`
          INSERT INTO marketplace_affiliate_performance_snapshots (
            platform, shop, affiliate_id, affiliate_name, affiliate_username,
            sales, items_sold, orders, clicks, est_commission, roi,
            total_buyers, new_buyers, period_type, start_date, end_date,
            fetched_date_range, raw_data, updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
        `).bind(
          row.platform,
          row.shop,
          row.affiliate_id,
          row.affiliate_name,
          row.affiliate_username,
          row.sales,
          row.items_sold,
          row.orders,
          row.clicks,
          row.est_commission,
          row.roi,
          row.total_buyers,
          row.new_buyers,
          row.period_type,
          row.start_date,
          row.end_date,
          row.fetched_date_range,
          row.raw_data
        )))
        inserted += inserts.length
      }
    }
    return { saved: items.length, inserted, updated }
  }
  core.saveAffiliatePerformanceSnapshots = saveAffiliatePerformanceSnapshots

  async function syncShopeeAffiliateShop(env, shop, options = {}) {
    if (!shop.api_shop_id) return { shop: shop.shop_name, fetched_affiliates: 0, saved: 0, inserted: 0, updated: 0, warnings: [{ stage: 'ams', message: 'Missing Shopee shop id' }] }
    const period = affiliatePeriodWindow(options)
    const pageSize = Math.min(Math.max(Number(options.pageSize || options.page_size || 20) || 20, 1), 20)
    const maxPages = Math.min(Math.max(Number(options.maxPages || options.max_pages || 5) || 5, 1), 20)
    const rows = []
    const warnings = []

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      try {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_AFFILIATE_PERFORMANCE_PATH, {
          period_type: period.period_type,
          start_date: shopeeAmsDate(period.start_date),
          end_date: shopeeAmsDate(period.end_date),
          page_no: pageNo,
          page_size: pageSize,
          order_type: cleanText(options.order_type || options.orderType || 'ConfirmedOrder'),
          channel: cleanText(options.channel || 'AllChannel'),
          ...(options.affiliate_id ? { affiliate_id: options.affiliate_id } : {})
        })
        const response = data?.response || {}
        const list = Array.isArray(response.list) ? response.list : []
        rows.push(...list.map(row => normalizeAffiliateRow(shop, row, period, response.fetched_date_range)))
        if (!response.has_more || list.length < pageSize) break
      } catch (error) {
        warnings.push({ stage: SHOPEE_AFFILIATE_PERFORMANCE_PATH, message: error.message })
        break
      }
    }

    const saved = await saveAffiliatePerformanceSnapshots(env, rows)
    return {
      shop: shop.shop_name,
      period,
      fetched_affiliates: rows.length,
      ...saved,
      warnings
    }
  }
  core.syncShopeeAffiliateShop = syncShopeeAffiliateShop

  async function syncShopeeAffiliatePerformance(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    await ensureShopeeAffiliatePerformanceTable(env)
    const results = []
    for (const shop of shops) results.push(await syncShopeeAffiliateShop(env, shop, options))
    return {
      status: 'ok',
      mode: 'shopee_ams_affiliate_performance',
      fetched_affiliates: results.reduce((sum, item) => sum + (item.fetched_affiliates || 0), 0),
      saved: results.reduce((sum, item) => sum + (item.saved || 0), 0),
      inserted: results.reduce((sum, item) => sum + (item.inserted || 0), 0),
      updated: results.reduce((sum, item) => sum + (item.updated || 0), 0),
      warnings: results.flatMap(item => (item.warnings || []).map(warning => ({ shop: item.shop, ...warning }))),
      shops: results
    }
  }
  core.syncShopeeAffiliatePerformance = syncShopeeAffiliatePerformance

  async function ensureShopeeOpenCampaignPerformanceTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_ams_open_campaign_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        shop TEXT DEFAULT '',
        item_id TEXT DEFAULT '',
        item_name TEXT DEFAULT '',
        affiliates INTEGER DEFAULT 0,
        sales REAL DEFAULT 0,
        item_sold INTEGER DEFAULT 0,
        est_commission REAL DEFAULT 0,
        period_type TEXT DEFAULT '',
        start_date TEXT DEFAULT '',
        end_date TEXT DEFAULT '',
        fetched_date_range TEXT DEFAULT '',
        raw_data TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_ams_open_campaign_lookup
      ON marketplace_ams_open_campaign_snapshots(platform, shop, start_date, end_date)
    `).run()
  }
  core.ensureShopeeOpenCampaignPerformanceTable = ensureShopeeOpenCampaignPerformanceTable

  function normalizeOpenCampaignRow(shop, row, period, fetchedDateRange) {
    return {
      platform: 'shopee',
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      item_id: cleanText(row?.item_id),
      item_name: cleanText(row?.item_name),
      affiliates: Math.round(adsNumber(row?.affiliates)),
      sales: roundAds(row?.sales),
      item_sold: Math.round(adsNumber(row?.item_sold ?? row?.items_sold)),
      est_commission: roundAds(row?.est_commission),
      period_type: period.period_type,
      start_date: period.start_date,
      end_date: period.end_date,
      fetched_date_range: cleanText(fetchedDateRange),
      raw_data: JSON.stringify(row || {}).slice(0, 12000)
    }
  }
  core.normalizeOpenCampaignRow = normalizeOpenCampaignRow

  async function saveOpenCampaignPerformanceSnapshots(env, rows) {
    const items = (rows || []).filter(row => row.platform && row.shop && row.item_id && row.start_date && row.end_date)
    if (!items.length) return { saved: 0, inserted: 0, updated: 0 }
    await ensureShopeeOpenCampaignPerformanceTable(env)
    let inserted = 0
    let updated = 0
    for (let i = 0; i < items.length; i += 40) {
      const chunk = items.slice(i, i + 40)
      const updateResults = await env.DB.batch(chunk.map(row => env.DB.prepare(`
        UPDATE marketplace_ams_open_campaign_snapshots
        SET item_name = ?,
            affiliates = ?,
            sales = ?,
            item_sold = ?,
            est_commission = ?,
            fetched_date_range = ?,
            raw_data = ?,
            updated_at = datetime('now', '+7 hours')
        WHERE platform = ?
          AND shop = ?
          AND item_id = ?
          AND period_type = ?
          AND start_date = ?
          AND end_date = ?
      `).bind(
        row.item_name,
        row.affiliates,
        row.sales,
        row.item_sold,
        row.est_commission,
        row.fetched_date_range,
        row.raw_data,
        row.platform,
        row.shop,
        row.item_id,
        row.period_type,
        row.start_date,
        row.end_date
      )))
      const inserts = []
      updateResults.forEach((result, index) => {
        const changes = Number(result?.meta?.changes || 0)
        if (changes) updated += changes
        else inserts.push(chunk[index])
      })
      if (inserts.length) {
        await env.DB.batch(inserts.map(row => env.DB.prepare(`
          INSERT INTO marketplace_ams_open_campaign_snapshots (
            platform, shop, item_id, item_name, affiliates, sales, item_sold,
            est_commission, period_type, start_date, end_date, fetched_date_range,
            raw_data, updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
        `).bind(
          row.platform,
          row.shop,
          row.item_id,
          row.item_name,
          row.affiliates,
          row.sales,
          row.item_sold,
          row.est_commission,
          row.period_type,
          row.start_date,
          row.end_date,
          row.fetched_date_range,
          row.raw_data
        )))
        inserted += inserts.length
      }
    }
    return { saved: items.length, inserted, updated }
  }
  core.saveOpenCampaignPerformanceSnapshots = saveOpenCampaignPerformanceSnapshots

  async function syncShopeeOpenCampaignShop(env, shop, options = {}) {
    if (!shop.api_shop_id) return { shop: shop.shop_name, fetched_items: 0, saved: 0, inserted: 0, updated: 0, warnings: [{ stage: 'ams_open_campaign', message: 'Missing Shopee shop id' }] }
    const period = affiliatePeriodWindow(options)
    const pageSize = Math.min(Math.max(Number(options.pageSize || options.page_size || 20) || 20, 1), 20)
    const maxPages = Math.min(Math.max(Number(options.maxPages || options.max_pages || 5) || 5, 1), 20)
    const rows = []
    const warnings = []

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      try {
        const data = await fetchShopeeShopJson(env, shop, SHOPEE_AMS_OPEN_CAMPAIGN_PERFORMANCE_PATH, {
          period_type: period.period_type,
          start_date: shopeeAmsDate(period.start_date),
          end_date: shopeeAmsDate(period.end_date),
          page_no: pageNo,
          page_size: pageSize,
          ...(options.item_id || options.itemId ? { item_id: options.item_id || options.itemId } : {})
        })
        const response = data?.response || {}
        const list = Array.isArray(response.list) ? response.list : []
        rows.push(...list.map(row => normalizeOpenCampaignRow(shop, row, period, response.fetched_date_range)))
        if (!response.has_more || list.length < pageSize) break
      } catch (error) {
        warnings.push({ stage: SHOPEE_AMS_OPEN_CAMPAIGN_PERFORMANCE_PATH, message: error.message })
        break
      }
    }

    const saved = await saveOpenCampaignPerformanceSnapshots(env, rows)
    return {
      shop: shop.shop_name,
      period,
      fetched_items: rows.length,
      ...saved,
      warnings
    }
  }
  core.syncShopeeOpenCampaignShop = syncShopeeOpenCampaignShop

  async function syncShopeeOpenCampaignPerformance(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    await ensureShopeeOpenCampaignPerformanceTable(env)
    const results = []
    for (const shop of shops) results.push(await syncShopeeOpenCampaignShop(env, shop, options))
    return {
      status: 'ok',
      mode: 'shopee_ams_open_campaign_performance',
      fetched_items: results.reduce((sum, item) => sum + (item.fetched_items || 0), 0),
      saved: results.reduce((sum, item) => sum + (item.saved || 0), 0),
      inserted: results.reduce((sum, item) => sum + (item.inserted || 0), 0),
      updated: results.reduce((sum, item) => sum + (item.updated || 0), 0),
      warnings: results.flatMap(item => (item.warnings || []).map(warning => ({ shop: item.shop, ...warning }))),
      shops: results
    }
  }
  core.syncShopeeOpenCampaignPerformance = syncShopeeOpenCampaignPerformance
}
