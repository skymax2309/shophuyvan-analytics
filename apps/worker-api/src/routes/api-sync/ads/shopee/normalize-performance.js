export function installApiSyncAdsShopeeNormalizePerformance(core) {
  const SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH = core.SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const adsPercent = (...args) => core.adsPercent(...args)
  const adsRatio = (...args) => core.adsRatio(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const enrichShopeeCampaignFromSetting = (...args) => core.enrichShopeeCampaignFromSetting(...args)
  const normalizeAdsCampaignRow = (...args) => core.normalizeAdsCampaignRow(...args)
  const parseShopeeDmy = (...args) => core.parseShopeeDmy(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const uniqueTexts = (...args) => core.uniqueTexts(...args)

  function normalizeShopeeProductCampaignDailySnapshots(data, shop, fallbackDate, settingsMap = new Map()) {
    const responseRows = Array.isArray(data?.response) ? data.response : (data?.response ? [data.response] : [])
    const snapshots = []
    for (const response of responseRows) {
      const campaigns = Array.isArray(response?.campaign_list) ? response.campaign_list : []
      for (const campaign of campaigns) {
        const campaignId = cleanText(campaign?.campaign_id)
        if (!campaignId) continue
        const enriched = enrichShopeeCampaignFromSetting(campaign, settingsMap.get(campaignId))
        const campaignName = enriched.campaign_name || campaignId
        const campaignType = enriched.campaign_type
        const metrics = Array.isArray(campaign?.metrics_list) ? campaign.metrics_list : []
        for (const metric of metrics) {
          const snapshotDate = parseShopeeDmy(metric?.date, fallbackDate)
          const sourceRow = {
            campaign_id: campaignId,
            campaign_name: campaignName,
            campaign_type: campaignType,
            product_name: enriched.product_name,
            spend: metric?.expense,
            revenue: metric?.broad_gmv ?? metric?.direct_gmv,
            orders: metric?.broad_order ?? metric?.direct_order,
            impressions: metric?.impression,
            clicks: metric?.clicks,
            ctr: metric?.ctr,
            cvr: metric?.cr ?? metric?.direct_cr,
            roas: metric?.broad_roi ?? metric?.direct_roi,
            acos: metric?.broad_cir ?? metric?.direct_cir,
            raw_metric: metric,
            setting_summary: enriched.setting_summary,
            raw_setting: enriched.raw_setting
          }
          snapshots.push(normalizeAdsCampaignRow('shopee', shop, sourceRow, snapshotDate, {
            campaign_id: campaignId,
            campaign_name: campaignName,
            campaign_type: campaignType,
            product_name: enriched.product_name
          }))
        }
      }
    }
    return snapshots
  }
  core.normalizeShopeeProductCampaignDailySnapshots = normalizeShopeeProductCampaignDailySnapshots

  function normalizeShopeeAllCpcDailySnapshots(data, shop, fallbackDate) {
    const rows = Array.isArray(data?.response) ? data.response : []
    return rows.map(row => {
      const snapshotDate = parseShopeeDmy(row?.date, fallbackDate)
      const campaignId = `all_cpc_ads_daily:${snapshotDate}`
      const sourceRow = {
        campaign_id: campaignId,
        campaign_name: 'All CPC Ads daily performance',
        campaign_type: 'shop_level_cpc_daily',
        spend: row?.expense,
        revenue: row?.broad_gmv ?? row?.direct_gmv,
        orders: row?.broad_order ?? row?.direct_order,
        impressions: row?.impression,
        clicks: row?.clicks,
        ctr: row?.ctr,
        cvr: row?.broad_conversions ?? row?.direct_conversions,
        roas: row?.broad_roas ?? row?.direct_roas,
        acos: adsRatio(row?.expense, row?.broad_gmv ?? row?.direct_gmv) * 100,
        raw_metric: row
      }
      return normalizeAdsCampaignRow('shopee', shop, sourceRow, snapshotDate, {
        campaign_id: campaignId,
        campaign_name: 'All CPC Ads daily performance',
        campaign_type: 'shop_level_cpc_daily'
      })
    })
  }
  core.normalizeShopeeAllCpcDailySnapshots = normalizeShopeeAllCpcDailySnapshots

  function normalizeShopeeProductCampaignHourlyPerformance(data, shop, fallbackDate, settingsMap = new Map()) {
    const responseRows = Array.isArray(data?.response) ? data.response : (data?.response ? [data.response] : [])
    const campaignDaily = new Map()
    const hourly = new Map()
    const shopName = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')

    const addTotals = (item, metric, campaignId, campaignName, campaignType) => {
      const spend = adsNumber(metric?.expense)
      const revenue = adsNumber(metric?.broad_gmv ?? metric?.direct_gmv)
      const orders = adsNumber(metric?.broad_order ?? metric?.direct_order)
      const impressions = adsNumber(metric?.impression)
      const clicks = adsNumber(metric?.clicks)
      item.spend += spend
      item.revenue += revenue
      item.orders += orders
      item.impressions += impressions
      item.clicks += clicks
      item.rows.push({
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_type: campaignType,
        hour: metric?.hour,
        spend,
        revenue,
        orders,
        impressions,
        clicks,
        raw_metric: metric
      })
    }

    for (const response of responseRows) {
      const campaigns = Array.isArray(response?.campaign_list) ? response.campaign_list : []
      for (const campaign of campaigns) {
        const campaignId = cleanText(campaign?.campaign_id)
        if (!campaignId) continue
        const enriched = enrichShopeeCampaignFromSetting(campaign, settingsMap.get(campaignId))
        const campaignName = enriched.campaign_name || campaignId
        const campaignType = uniqueTexts([enriched.campaign_type, 'product_campaign_hourly']).join(' / ')
        const productName = enriched.product_name
        const metrics = Array.isArray(campaign?.metrics_list) ? campaign.metrics_list : []
        for (const metric of metrics) {
          const snapshotDate = parseShopeeDmy(metric?.date, fallbackDate)
          if (!snapshotDate) continue
          const hour = Math.max(0, Math.min(Math.round(adsNumber(metric?.hour)), 23))
          const campaignKey = `${campaignId}|${snapshotDate}`
          if (!campaignDaily.has(campaignKey)) {
            campaignDaily.set(campaignKey, {
              campaignId,
              campaignName,
              campaignType,
              productName,
              settingSummary: enriched.setting_summary,
              rawSetting: enriched.raw_setting,
              snapshotDate,
              spend: 0,
              revenue: 0,
              orders: 0,
              impressions: 0,
              clicks: 0,
              rows: []
            })
          }
          addTotals(campaignDaily.get(campaignKey), metric, campaignId, campaignName, campaignType)

          const hourKey = `${snapshotDate}|${hour}`
          if (!hourly.has(hourKey)) {
            hourly.set(hourKey, {
              platform: 'shopee',
              shop: shopName,
              snapshot_date: snapshotDate,
              hour,
              spend: 0,
              revenue: 0,
              orders: 0,
              impressions: 0,
              clicks: 0,
              rows: []
            })
          }
          addTotals(hourly.get(hourKey), metric, campaignId, campaignName, campaignType)
        }
      }
    }

    const snapshots = [...campaignDaily.values()].map(item => normalizeAdsCampaignRow('shopee', shop, {
      campaign_id: item.campaignId,
      campaign_name: item.campaignName,
      campaign_type: item.campaignType,
      product_name: item.productName || item.campaignName,
      spend: item.spend,
      revenue: item.revenue,
      orders: item.orders,
      impressions: item.impressions,
      clicks: item.clicks,
      ctr: adsRatio(item.clicks, item.impressions) * 100,
      cpc: adsRatio(item.spend, item.clicks),
      cvr: adsRatio(item.orders, item.clicks) * 100,
      roas: adsRatio(item.revenue, item.spend),
      acos: adsRatio(item.spend, item.revenue) * 100,
      raw_hourly: item.rows,
      setting_summary: item.settingSummary,
      raw_setting: item.rawSetting
    }, item.snapshotDate, {
      campaign_id: item.campaignId,
      campaign_name: item.campaignName,
      campaign_type: item.campaignType,
      product_name: item.productName || item.campaignName
    }))

    const hourlyRows = [...hourly.values()].map(item => ({
      platform: 'shopee',
      shop: item.shop,
      snapshot_date: item.snapshot_date,
      hour: item.hour,
      spend: roundAds(item.spend),
      revenue: roundAds(item.revenue),
      orders: Math.round(item.orders),
      impressions: Math.round(item.impressions),
      clicks: Math.round(item.clicks),
      ctr: roundAds(adsRatio(item.clicks, item.impressions) * 100),
      cpc: roundAds(adsRatio(item.spend, item.clicks)),
      cvr: roundAds(adsRatio(item.orders, item.clicks) * 100),
      roas: roundAds(adsRatio(item.revenue, item.spend)),
      raw_data: JSON.stringify({
        source: SHOPEE_PRODUCT_CAMPAIGN_HOURLY_PERFORMANCE_PATH,
        campaign_count: uniqueTexts(item.rows.map(row => row.campaign_id)).length,
        rows: item.rows
      }).slice(0, 12000)
    }))

    return { snapshots, hourlyRows }
  }
  core.normalizeShopeeProductCampaignHourlyPerformance = normalizeShopeeProductCampaignHourlyPerformance

  function normalizeShopeeHourlyRows(data, shop, fallbackDate) {
    const rows = Array.isArray(data?.response) ? data.response : []
    return rows.map(row => {
      const date = parseShopeeDmy(row?.date, fallbackDate)
      const spend = adsNumber(row?.expense)
      const revenue = adsNumber(row?.broad_gmv ?? row?.direct_gmv)
      const orders = adsNumber(row?.broad_order ?? row?.direct_order)
      const impressions = adsNumber(row?.impression)
      const clicks = adsNumber(row?.clicks)
      const ctr = adsPercent(row?.ctr) || adsRatio(clicks, impressions) * 100
      const cpc = adsNumber(row?.cpc ?? row?.cost_per_click) || adsRatio(spend, clicks)
      const cvr = adsPercent(row?.broad_conversions ?? row?.direct_conversions) || adsRatio(orders, clicks) * 100
      const roas = adsNumber(row?.broad_roas ?? row?.direct_roas) || adsRatio(revenue, spend)
      return {
        platform: 'shopee',
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        snapshot_date: date,
        hour: Math.max(0, Math.min(Math.round(adsNumber(row?.hour)), 23)),
        spend: roundAds(spend),
        revenue: roundAds(revenue),
        orders: Math.round(orders),
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        ctr: roundAds(ctr),
        cpc: roundAds(cpc),
        cvr: roundAds(cvr),
        roas: roundAds(roas),
        raw_data: JSON.stringify(row || {}).slice(0, 12000)
      }
    })
  }
  core.normalizeShopeeHourlyRows = normalizeShopeeHourlyRows

  function hourlyRowsToDailySnapshots(shop, hourlyRows) {
    const byDate = new Map()
    for (const row of hourlyRows || []) {
      const date = cleanText(row.snapshot_date)
      if (!date) continue
      if (!byDate.has(date)) {
        byDate.set(date, {
          spend: 0,
          revenue: 0,
          orders: 0,
          impressions: 0,
          clicks: 0,
          rows: []
        })
      }
      const item = byDate.get(date)
      item.spend += adsNumber(row.spend)
      item.revenue += adsNumber(row.revenue)
      item.orders += adsNumber(row.orders)
      item.impressions += adsNumber(row.impressions)
      item.clicks += adsNumber(row.clicks)
      item.rows.push(row)
    }
    return [...byDate.entries()].map(([date, item]) => normalizeAdsCampaignRow('shopee', shop, {
      campaign_id: `all_cpc_ads_hourly:${date}`,
      campaign_name: 'All CPC Ads hourly performance',
      campaign_type: 'shop_level_cpc_hourly',
      spend: item.spend,
      revenue: item.revenue,
      orders: item.orders,
      impressions: item.impressions,
      clicks: item.clicks,
      ctr: adsRatio(item.clicks, item.impressions) * 100,
      cpc: adsRatio(item.spend, item.clicks),
      cvr: adsRatio(item.orders, item.clicks) * 100,
      roas: adsRatio(item.revenue, item.spend),
      raw_hourly: item.rows
    }, date, {
      campaign_id: `all_cpc_ads_hourly:${date}`,
      campaign_name: 'All CPC Ads hourly performance',
      campaign_type: 'shop_level_cpc_hourly'
    }))
  }
  core.hourlyRowsToDailySnapshots = hourlyRowsToDailySnapshots
}
