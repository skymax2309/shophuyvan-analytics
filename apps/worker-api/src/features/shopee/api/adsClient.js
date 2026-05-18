import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_ADS_ENDPOINTS = {
  totalBalance: '/api/v2/ads/get_total_balance',
  shopToggleInfo: '/api/v2/ads/get_shop_toggle_info',
  allCpcDailyPerformance: '/api/v2/ads/get_all_cpc_ads_daily_performance',
  allCpcHourlyPerformance: '/api/v2/ads/get_all_cpc_ads_hourly_performance',
  campaignIdList: '/api/v2/ads/get_product_level_campaign_id_list',
  campaignSettingInfo: '/api/v2/ads/get_product_level_campaign_setting_info',
  editManualProductAds: '/api/v2/ads/edit_manual_product_ads',
  editManualProductAdKeywords: '/api/v2/ads/edit_manual_product_ad_keywords',
  createManualProductAds: '/api/v2/ads/create_manual_product_ads',
  recommendedItemList: '/api/v2/ads/get_recommended_item_list'
}

export function getShopeeAdsClient(env, options = {}) {
  const base = { env, clientType: 'ads_client', ...options }
  return {
    totalBalance: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADS_ENDPOINTS.totalBalance, params }),
    shopToggleInfo: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADS_ENDPOINTS.shopToggleInfo, params }),
    allCpcDailyPerformance: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADS_ENDPOINTS.allCpcDailyPerformance, params }),
    allCpcHourlyPerformance: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADS_ENDPOINTS.allCpcHourlyPerformance, params }),
    campaignIdList: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADS_ENDPOINTS.campaignIdList, params }),
    campaignSettingInfo: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADS_ENDPOINTS.campaignSettingInfo, params }),
    editManualProductAds: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADS_ENDPOINTS.editManualProductAds, method: 'POST', body })
  }
}
