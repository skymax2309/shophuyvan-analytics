import {
  ensureShopeeAffiliatePerformanceTable,
  ensureShopeeOpenCampaignPerformanceTable,
  createShopeeAutoProductAds,
  editShopeeAutoProductAds,
  editShopeeManualProductAds,
  editShopeeManualProductAdKeywords,
  fetchShopeeCreateProductAdBudgetSuggestion,
  fetchShopeeProductLevelCampaignIdList,
  fetchShopeeProductLevelCampaignSettingInfo,
  fetchShopeeProductRecommendedRoiTarget,
  fetchShopeeAdsBalances,
  fetchShopeeAdsToggleInfo,
  probeShopeeAdsApi,
  syncAdsCampaignSnapshots,
  syncApiOrders,
  syncApiOrderStatuses,
  syncShopeeAffiliatePerformance,
  syncShopeeOpenCampaignPerformance
} from '../api-sync.js'
import {
  ADS_GUARD_CONFIRM_PHRASE,
  buildAdsCampaignGuardOverview,
  listAdsCampaignGuardLogs,
  runAdsCampaignGuard
} from '../../core/ads-campaign-guard-core.js'
import { cleanText } from './dashboard-metrics.js'
import { handleAdsExtraRoutes } from './extra-routes.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

export async function handleAds(request, env, cors) {
  const url = new URL(request.url)

  if (url.pathname === '/api/ads/sync-campaigns') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const options = {
      platform: body.platform || url.searchParams.get('platform'),
      shop: body.shop || url.searchParams.get('shop'),
      from: body.from || body.from_date || url.searchParams.get('from'),
      to: body.to || body.to_date || url.searchParams.get('to'),
      days: body.days || url.searchParams.get('days'),
      limit: body.limit || url.searchParams.get('limit'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      campaignListLimit: body.campaignListLimit || body.campaign_list_limit || url.searchParams.get('campaign_list_limit'),
      campaignListPageSize: body.campaignListPageSize || body.campaign_list_page_size || url.searchParams.get('campaign_list_page_size'),
      include_product_campaigns: body.include_product_campaigns ?? body.includeProductCampaigns ?? url.searchParams.get('include_product_campaigns'),
      includeAdgroups: body.includeAdgroups ?? body.include_adgroups ?? url.searchParams.get('include_adgroups'),
      bizCode: body.bizCode || body.biz_code || url.searchParams.get('biz_code'),
      campaign_id_list: body.campaign_id_list || body.campaignIds || body.campaign_ids || url.searchParams.get('campaign_id_list'),
      period_type: body.period_type || body.periodType || url.searchParams.get('period_type'),
      order_type: body.order_type || body.orderType || url.searchParams.get('order_type'),
      channel: body.channel || url.searchParams.get('channel'),
      performance_date: body.performance_date || body.performanceDate || url.searchParams.get('performance_date'),
      hourly_days: body.hourly_days || body.hourlyDays || url.searchParams.get('hourly_days'),
      all_cpc_daily_only: body.all_cpc_daily_only ?? body.allCpcDailyOnly ?? body.force_all_cpc_daily ?? body.forceAllCpcDaily ?? url.searchParams.get('all_cpc_daily_only'),
      all_cpc_hourly_only: body.all_cpc_hourly_only ?? body.allCpcHourlyOnly ?? body.force_all_cpc_hourly ?? body.forceAllCpcHourly ?? url.searchParams.get('all_cpc_hourly_only'),
      product_campaign_hourly_only: body.product_campaign_hourly_only ?? body.productCampaignHourlyOnly ?? body.force_product_campaign_hourly ?? body.forceProductCampaignHourly ?? url.searchParams.get('product_campaign_hourly_only'),
      shopee_paths: body.shopee_paths,
      shopee_params: body.shopee_params
    }
    const syncFeeDetails = request.method === 'POST' && (
      body.sync_fee_details === true ||
      body.syncFeeDetails === true ||
      url.searchParams.get('sync_fee_details') === '1'
    )
    const orderFeeSync = syncFeeDetails
      ? {
          orders: await syncApiOrders(env, cors, {
            platform: options.platform,
            shop: options.shop,
            days: Math.max(Number(options.days || 15) || 15, 15),
            limit: Math.min(Number(options.limit || 80) || 80, 120),
            statuses: 'READY_TO_SHIP,PROCESSED,SHIPPED,TO_CONFIRM_RECEIVE,COMPLETED,CANCELLED,IN_CANCEL'
          }),
          statuses: await syncApiOrderStatuses(env, {
            platform: options.platform,
            shop: options.shop,
            days: Math.max(Number(options.days || 30) || 30, 30),
            limit: Math.min(Number(options.limit || 150) || 150, 300)
          })
        }
      : null
    const result = await syncAdsCampaignSnapshots(env, options)
    const includeAffiliate = body.include_affiliate !== false && url.searchParams.get('include_affiliate') !== '0'
    const affiliateSync = includeAffiliate && (!options.platform || options.platform === 'shopee')
      ? await syncShopeeAffiliatePerformance(env, options).catch(error => ({
          status: 'error',
          error: error?.message || String(error),
          warnings: [{ stage: '/api/v2/ams/get_affiliate_performance', message: error?.message || String(error) }]
        }))
      : null
    const includeOpenCampaign = (body.include_open_campaign === true || body.includeOpenCampaign === true || url.searchParams.get('include_open_campaign') === '1')
      && (!options.platform || options.platform === 'shopee')
    const openCampaignSync = includeOpenCampaign
      ? await syncShopeeOpenCampaignPerformance(env, options).catch(error => ({
          status: 'error',
          error: error?.message || String(error),
          warnings: [{ stage: '/api/v2/ams/get_open_campaign_performance', message: error?.message || String(error) }]
        }))
      : null
    return json({ ...result, order_fee_sync: orderFeeSync, affiliate_sync: affiliateSync, open_campaign_sync: openCampaignSync }, cors)
  }

  return handleAdsExtraRoutes(request, env, cors)
}
