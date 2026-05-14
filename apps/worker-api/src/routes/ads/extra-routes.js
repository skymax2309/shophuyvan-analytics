import {
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
import { handleAdsDashboard } from './dashboard.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

export async function handleAdsExtraRoutes(request, env, cors) {
  const url = new URL(request.url)
  if (url.pathname === '/api/ads/campaign-guard/overview' || url.pathname === '/api/ads/guard/overview') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, cors, 405)
        const result = await buildAdsCampaignGuardOverview(env, {
          platform: url.searchParams.get('platform'),
          shop: url.searchParams.get('shop'),
          limit: url.searchParams.get('limit'),
          logLimit: url.searchParams.get('log_limit')
        })
        return json({ ...result, confirm_phrase: ADS_GUARD_CONFIRM_PHRASE }, cors)
      }
    
      if (url.pathname === '/api/ads/campaign-guard/logs' || url.pathname === '/api/ads/guard/logs') {
        if (request.method !== 'GET') return json({ error: 'Method not allowed' }, cors, 405)
        const logs = await listAdsCampaignGuardLogs(env, {
          platform: url.searchParams.get('platform'),
          shop: url.searchParams.get('shop'),
          limit: url.searchParams.get('limit')
        })
        return json({ status: 'ok', logs }, cors)
      }
    
      if (url.pathname === '/api/ads/campaign-guard/preview' || url.pathname === '/api/ads/guard/preview') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        try { body = await request.json() } catch {}
        const result = await runAdsCampaignGuard(env, { ...body, mode: 'preview' })
        return json({ ...result, confirm_phrase: ADS_GUARD_CONFIRM_PHRASE }, cors)
      }
    
      if (url.pathname === '/api/ads/campaign-guard/apply' || url.pathname === '/api/ads/guard/apply') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        try { body = await request.json() } catch {}
        const result = await runAdsCampaignGuard(env, { ...body, mode: 'apply' })
        return json({ ...result, confirm_phrase: ADS_GUARD_CONFIRM_PHRASE }, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/sync') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await syncAdsCampaignSnapshots(env, {
          platform: 'shopee',
          shop: body.shop || url.searchParams.get('shop'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          days: body.days || url.searchParams.get('days'),
          limit: body.limit || url.searchParams.get('limit'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          campaign_id_list: body.campaign_id_list || body.campaignIds || body.campaign_ids || url.searchParams.get('campaign_id_list'),
          performance_date: body.performance_date || body.performanceDate || url.searchParams.get('performance_date'),
          hourly_days: body.hourly_days || body.hourlyDays || url.searchParams.get('hourly_days'),
          all_cpc_daily_only: body.all_cpc_daily_only ?? body.allCpcDailyOnly ?? body.force_all_cpc_daily ?? body.forceAllCpcDaily ?? url.searchParams.get('all_cpc_daily_only'),
          all_cpc_hourly_only: body.all_cpc_hourly_only ?? body.allCpcHourlyOnly ?? body.force_all_cpc_hourly ?? body.forceAllCpcHourly ?? url.searchParams.get('all_cpc_hourly_only'),
          product_campaign_hourly_only: body.product_campaign_hourly_only ?? body.productCampaignHourlyOnly ?? body.force_product_campaign_hourly ?? body.forceProductCampaignHourly ?? url.searchParams.get('product_campaign_hourly_only'),
          shopee_paths: body.shopee_paths,
          shopee_params: body.shopee_params
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/hourly/sync') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await syncAdsCampaignSnapshots(env, {
          platform: 'shopee',
          shop: body.shop || url.searchParams.get('shop'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          days: body.days || url.searchParams.get('days'),
          limit: body.limit || url.searchParams.get('limit'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          performance_date: body.performance_date || body.performanceDate || url.searchParams.get('performance_date'),
          hourly_days: body.hourly_days || body.hourlyDays || url.searchParams.get('hourly_days'),
          all_cpc_hourly_only: true
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/daily/sync' || url.pathname === '/api/ads/shopee/all-cpc-daily/sync') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await syncAdsCampaignSnapshots(env, {
          platform: 'shopee',
          shop: body.shop || url.searchParams.get('shop'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          days: body.days || url.searchParams.get('days'),
          limit: body.limit || url.searchParams.get('limit'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          all_cpc_daily_only: true
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/product-performance/sync') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await syncAdsCampaignSnapshots(env, {
          platform: 'shopee',
          shop: body.shop || url.searchParams.get('shop'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          days: body.days || url.searchParams.get('days'),
          limit: body.limit || url.searchParams.get('limit'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          campaign_id_list: body.campaign_id_list || body.campaignIds || body.campaign_ids || url.searchParams.get('campaign_id_list'),
          campaign_list_limit: body.campaign_list_limit || body.campaignListLimit || url.searchParams.get('campaign_list_limit'),
          ad_type: body.ad_type || body.adType || url.searchParams.get('ad_type'),
          product_campaign_daily_only: true
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/product-hourly/sync' || url.pathname === '/api/ads/shopee/product-campaign-hourly/sync') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await syncAdsCampaignSnapshots(env, {
          platform: 'shopee',
          shop: body.shop || url.searchParams.get('shop'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          days: body.days || url.searchParams.get('days'),
          limit: body.limit || url.searchParams.get('limit'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          campaign_id_list: body.campaign_id_list || body.campaignIds || body.campaign_ids || url.searchParams.get('campaign_id_list'),
          campaign_list_limit: body.campaign_list_limit || body.campaignListLimit || url.searchParams.get('campaign_list_limit'),
          ad_type: body.ad_type || body.adType || url.searchParams.get('ad_type'),
          performance_date: body.performance_date || body.performanceDate || url.searchParams.get('performance_date'),
          hourly_days: body.hourly_days || body.hourlyDays || url.searchParams.get('hourly_days'),
          product_campaign_hourly_only: true
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/product-level-campaign-id-list' || url.pathname === '/api/ads/shopee/product-campaign-ids') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await fetchShopeeProductLevelCampaignIdList(env, {
          shop: body.shop || url.searchParams.get('shop'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          ad_type: body.ad_type || body.adType || url.searchParams.get('ad_type'),
          offset: body.offset || url.searchParams.get('offset'),
          limit: body.limit || url.searchParams.get('limit'),
          page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
          campaign_list_limit: body.campaign_list_limit || body.campaignListLimit || url.searchParams.get('campaign_list_limit')
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/product-level-campaign-setting-info' || url.pathname === '/api/ads/shopee/product-campaign-settings') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await fetchShopeeProductLevelCampaignSettingInfo(env, {
          shop: body.shop || url.searchParams.get('shop'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          campaign_id_list: body.campaign_id_list || body.campaignIds || body.campaign_ids || url.searchParams.get('campaign_id_list'),
          campaign_list_limit: body.campaign_list_limit || body.campaignListLimit || url.searchParams.get('campaign_list_limit'),
          limit: body.limit || url.searchParams.get('limit'),
          ad_type: body.ad_type || body.adType || url.searchParams.get('ad_type'),
          info_type_list: body.info_type_list || body.infoTypeList || url.searchParams.get('info_type_list')
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/product-recommended-roi-target' || url.pathname === '/api/ads/shopee/recommended-roi-target') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await fetchShopeeProductRecommendedRoiTarget(env, {
          shop: body.shop || url.searchParams.get('shop'),
          item_id: body.item_id || body.itemId || url.searchParams.get('item_id'),
          reference_id: body.reference_id || body.referenceId || url.searchParams.get('reference_id')
        })
        return json(result, cors, result.status === 'error' ? 400 : 200)
      }
    
      if (url.pathname === '/api/ads/shopee/create-product-ad-budget-suggestion' || url.pathname === '/api/ads/shopee/product-ad-budget-suggestion') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        // Gọi API gợi ý ngân sách tạo product ads theo đúng rule tham số của Shopee.
        const result = await fetchShopeeCreateProductAdBudgetSuggestion(env, {
          shop: body.shop || url.searchParams.get('shop'),
          reference_id: body.reference_id || body.referenceId || url.searchParams.get('reference_id'),
          product_selection: body.product_selection || body.productSelection || url.searchParams.get('product_selection'),
          campaign_placement: body.campaign_placement || body.campaignPlacement || body.product_placement || body.productPlacement || url.searchParams.get('campaign_placement') || url.searchParams.get('product_placement'),
          bidding_method: body.bidding_method || body.biddingMethod || url.searchParams.get('bidding_method'),
          enhanced_cpc: body.enhanced_cpc ?? body.enhancedCpc ?? url.searchParams.get('enhanced_cpc'),
          discovery_ads_location_names: body.discovery_ads_location_names || body.discoveryAdsLocationNames || url.searchParams.get('discovery_ads_location_names'),
          roas_target: body.roas_target ?? body.roasTarget ?? url.searchParams.get('roas_target'),
          item_id: body.item_id || body.itemId || url.searchParams.get('item_id')
        })
        return json(result, cors, result.status === 'error' ? 400 : 200)
      }
    
      if (url.pathname === '/api/ads/shopee/manual-product-ad-keywords/edit' || url.pathname === '/api/ads/shopee/edit-manual-product-ad-keywords') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        try { body = await request.json() } catch {}
        const result = await editShopeeManualProductAdKeywords(env, {
          shop: body.shop || url.searchParams.get('shop'),
          campaign_id: body.campaign_id || body.campaignId || url.searchParams.get('campaign_id'),
          reference_id: body.reference_id || body.referenceId || url.searchParams.get('reference_id'),
          selected_keywords: body.selected_keywords || body.selectedKeywords || body.keywords,
          edit_action: body.edit_action || body.editAction || url.searchParams.get('edit_action'),
          apply: body.apply ?? body.apply_now ?? body.applyNow ?? url.searchParams.get('apply'),
          confirm_apply: body.confirm_apply || body.confirmApply || url.searchParams.get('confirm_apply')
        })
        return json(result, cors, result.status === 'error' ? 400 : 200)
      }
    
      if (url.pathname === '/api/ads/shopee/auto-product-ads/create' || url.pathname === '/api/ads/shopee/create-auto-product-ads') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        try { body = await request.json() } catch {}
        // Route tạo Auto Product Ads: mặc định dry-run, chỉ apply thật khi có confirm.
        const result = await createShopeeAutoProductAds(env, {
          shop: body.shop || url.searchParams.get('shop'),
          reference_id: body.reference_id || body.referenceId || url.searchParams.get('reference_id'),
          budget: body.budget ?? url.searchParams.get('budget'),
          start_date: body.start_date || body.startDate || url.searchParams.get('start_date'),
          end_date: body.end_date || body.endDate || url.searchParams.get('end_date'),
          apply: body.apply ?? body.apply_now ?? body.applyNow ?? url.searchParams.get('apply'),
          confirm_apply: body.confirm_apply || body.confirmApply || url.searchParams.get('confirm_apply')
        })
        return json(result, cors, result.status === 'error' ? 400 : 200)
      }
    
      if (url.pathname === '/api/ads/shopee/auto-product-ads/edit' || url.pathname === '/api/ads/shopee/edit-auto-product-ads') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        try { body = await request.json() } catch {}
        // Route chỉnh Auto Product Ads: mặc định dry-run, chỉ apply thật khi có confirm.
        const result = await editShopeeAutoProductAds(env, {
          shop: body.shop || url.searchParams.get('shop'),
          campaign_id: body.campaign_id || body.campaignId || url.searchParams.get('campaign_id'),
          reference_id: body.reference_id || body.referenceId || url.searchParams.get('reference_id'),
          edit_action: body.edit_action || body.editAction || url.searchParams.get('edit_action'),
          budget: body.budget ?? url.searchParams.get('budget'),
          start_date: body.start_date || body.startDate || url.searchParams.get('start_date'),
          end_date: body.end_date || body.endDate || url.searchParams.get('end_date'),
          apply: body.apply ?? body.apply_now ?? body.applyNow ?? url.searchParams.get('apply'),
          confirm_apply: body.confirm_apply || body.confirmApply || url.searchParams.get('confirm_apply')
        })
        return json(result, cors, result.status === 'error' ? 400 : 200)
      }
    
      if (url.pathname === '/api/ads/shopee/manual-product-ads/edit' || url.pathname === '/api/ads/shopee/edit-manual-product-ads') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        try { body = await request.json() } catch {}
        // Route chỉnh Manual Product Ads: mặc định dry-run, chỉ apply thật khi xác nhận rõ.
        const result = await editShopeeManualProductAds(env, {
          shop: body.shop || url.searchParams.get('shop'),
          campaign_id: body.campaign_id || body.campaignId || url.searchParams.get('campaign_id'),
          reference_id: body.reference_id || body.referenceId || url.searchParams.get('reference_id'),
          edit_action: body.edit_action || body.editAction || url.searchParams.get('edit_action'),
          budget: body.budget ?? url.searchParams.get('budget'),
          start_date: body.start_date || body.startDate || url.searchParams.get('start_date'),
          end_date: body.end_date || body.endDate || url.searchParams.get('end_date'),
          roas_target: body.roas_target ?? body.roasTarget ?? url.searchParams.get('roas_target'),
          enhanced_cpc: body.enhanced_cpc ?? body.enhancedCpc ?? url.searchParams.get('enhanced_cpc'),
          smart_creative_setting: body.smart_creative_setting || body.smartCreativeSetting || url.searchParams.get('smart_creative_setting'),
          discovery_ads_locations: body.discovery_ads_locations || body.discoveryAdsLocations,
          safe_mode: body.safe_mode ?? body.safeMode ?? url.searchParams.get('safe_mode'),
          apply: body.apply ?? body.apply_now ?? body.applyNow ?? url.searchParams.get('apply'),
          confirm_apply: body.confirm_apply || body.confirmApply || url.searchParams.get('confirm_apply')
        })
        return json(result, cors, result.status === 'error' ? 400 : 200)
      }
    
      if (url.pathname === '/api/ads/shopee/affiliate/sync') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await syncShopeeAffiliatePerformance(env, {
          shop: body.shop || url.searchParams.get('shop'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          period_type: body.period_type || body.periodType || url.searchParams.get('period_type'),
          order_type: body.order_type || body.orderType || url.searchParams.get('order_type'),
          channel: body.channel || url.searchParams.get('channel'),
          affiliate_id: body.affiliate_id || body.affiliateId || url.searchParams.get('affiliate_id')
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/open-campaign/sync' || url.pathname === '/api/ads/shopee/ams/open-campaign/sync') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await syncShopeeOpenCampaignPerformance(env, {
          shop: body.shop || url.searchParams.get('shop'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          period_type: body.period_type || body.periodType || url.searchParams.get('period_type'),
          pageSize: body.pageSize || body.page_size || url.searchParams.get('page_size'),
          maxPages: body.maxPages || body.max_pages || url.searchParams.get('max_pages'),
          item_id: body.item_id || body.itemId || url.searchParams.get('item_id')
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/probe') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await probeShopeeAdsApi(env, {
          shop: body.shop || url.searchParams.get('shop'),
          days: body.days || url.searchParams.get('days'),
          from: body.from || body.from_date || url.searchParams.get('from'),
          to: body.to || body.to_date || url.searchParams.get('to'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
          endpointLimit: body.endpointLimit || body.endpoint_limit || url.searchParams.get('endpoint_limit'),
          pageSize: body.pageSize || body.page_size || url.searchParams.get('page_size'),
          shopee_paths: body.shopee_paths,
          shopee_params: body.shopee_params
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/balance') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await fetchShopeeAdsBalances(env, {
          shop: body.shop || url.searchParams.get('shop'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit')
        })
        return json(result, cors)
      }
    
      if (url.pathname === '/api/ads/shopee/toggle-info') {
        if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
        let body = {}
        if (request.method === 'POST') {
          try { body = await request.json() } catch {}
        }
        const result = await fetchShopeeAdsToggleInfo(env, {
          shop: body.shop || url.searchParams.get('shop'),
          shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit')
        })
        return json(result, cors)
      }
    
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, cors, 405)
  return handleAdsDashboard(request, env, cors)
}
