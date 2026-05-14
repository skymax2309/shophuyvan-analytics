import { fetchShopeeAdsBalances, fetchShopeeAdsToggleInfo } from '../api-sync.js'
import {
  aggregateCampaignRows,
  buildAdsShopStatusRows,
  campaignDailyRows,
  campaignProductRows,
  campaignShopRows,
  campaignSnapshotType,
  cleanText,
  ensureRealAdsTables,
  listAdsShops,
  loadAffiliateSnapshots,
  loadCampaignSnapshots,
  loadOpenCampaignSnapshots,
  safeNumber,
  summarizeAffiliateRows,
  summarizeCampaignRows,
  summarizeOpenCampaignRows
} from './dashboard-metrics.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

export async function handleAdsDashboard(request, env, cors) {
  const url = new URL(request.url)
      await ensureRealAdsTables(env)
    
      const limit = url.searchParams.get('limit') || 40
      const requestFilter = {
        from: cleanText(url.searchParams.get('from')),
        to: cleanText(url.searchParams.get('to')),
        platform: cleanText(url.searchParams.get('platform')).toLowerCase(),
        shop: cleanText(url.searchParams.get('shop'))
      }
    
      const balancePromise = requestFilter.platform && requestFilter.platform !== 'shopee'
        ? Promise.resolve({ shops: [], ok_count: 0, total_balance: 0 })
        : fetchShopeeAdsBalances(env, {
            shop: requestFilter.shop,
            shopLimit: 100
          }).catch(error => ({
            shops: [],
            ok_count: 0,
            total_balance: 0,
            error: error?.message || String(error)
          }))
    
      const toggleInfoPromise = requestFilter.platform && requestFilter.platform !== 'shopee'
        ? Promise.resolve({ shops: [], ok_count: 0 })
        : fetchShopeeAdsToggleInfo(env, {
            shop: requestFilter.shop,
            shopLimit: 100
          }).catch(error => ({
            shops: [],
            ok_count: 0,
            error: error?.message || String(error)
          }))
    
      const [
        shops,
        campaignSnapshots,
        shopeeBalances,
        shopeeToggleInfo,
        affiliatePerformance,
        openCampaignPerformance
      ] = await Promise.all([
        listAdsShops(env),
        loadCampaignSnapshots(env, url),
        balancePromise,
        toggleInfoPromise,
        loadAffiliateSnapshots(env, url).catch(error => {
          console.error('[ADS_AFFILIATE] load failed:', error.message)
          return []
        }),
        loadOpenCampaignSnapshots(env, url).catch(error => {
          console.error('[ADS_OPEN_CAMPAIGN] load failed:', error.message)
          return []
        })
      ])
    
      const shopLookup = new Map()
      for (const shop of shops) {
        for (const name of [shop.shop_name, shop.user_name, shop.api_shop_id, ...(shop.aliases || [])].map(cleanText).filter(Boolean)) {
          shopLookup.set(`${cleanText(shop.platform).toLowerCase()}|${name.toLowerCase()}`, shop)
        }
      }
      const canonicalCampaignSnapshots = campaignSnapshots.map(row => {
        const key = `${cleanText(row.platform).toLowerCase()}|${cleanText(row.shop).toLowerCase()}`
        const matched = shopLookup.get(key)
        return matched ? { ...row, shop: matched.shop_name || row.shop } : row
      })
      const aggregateSnapshots = aggregateCampaignRows(canonicalCampaignSnapshots)
    
      const summary = summarizeCampaignRows(aggregateSnapshots)
      const daily = campaignDailyRows(aggregateSnapshots)
      const shopPerformance = campaignShopRows(aggregateSnapshots)
      const productPerformance = campaignProductRows(canonicalCampaignSnapshots, limit)
      const runningShops = shopPerformance.map(row => {
        const key = `${cleanText(row.platform).toLowerCase()}|${cleanText(row.shop).toLowerCase()}`
        const matched = shopLookup.get(key)
        return matched || {
          id: '',
          shop_name: row.shop,
          platform: row.platform,
          user_name: row.shop,
          api_shop_id: '',
          has_access_token: 1
        }
      })
      const platformMatches = shop => !requestFilter.platform || cleanText(shop.platform).toLowerCase() === requestFilter.platform
      const shopMatches = shop => {
        if (!requestFilter.shop) return true
        const needle = requestFilter.shop.toLowerCase()
        return [shop.shop_name, shop.user_name, shop.api_shop_id, ...(shop.aliases || [])]
          .map(value => cleanText(value).toLowerCase())
          .some(value => value === needle)
      }
      const apiShops = shops.filter(shop => Number(shop.has_access_token) && platformMatches(shop) && shopMatches(shop))
      const shopStatusRows = buildAdsShopStatusRows(
        apiShops,
        shopPerformance,
        canonicalCampaignSnapshots,
        shopeeBalances.shops || [],
        shopeeToggleInfo.shops || []
      )
      const hasRealAdsData = aggregateSnapshots.length > 0 && safeNumber(summary.ads_spend) > 0
      const affiliateSummary = summarizeAffiliateRows(affiliatePerformance)
      const openCampaignSummary = summarizeOpenCampaignRows(openCampaignPerformance)
    
      return json({
        status: 'ok',
        has_real_ads_data: hasRealAdsData,
        mode: 'strict_campaign_api_only',
        empty_reason: hasRealAdsData
          ? ''
          : 'Chưa có snapshot campaign ADS thực từ Ads API trong khoảng lọc. Dashboard không dùng cost setting, orders_v2.fee_ads hoặc report fallback để dựng số liệu.',
        source: {
          realtime_campaign_api: campaignSnapshots.length ? 'marketplace_ads_campaign_snapshots' : 'Chưa có snapshot campaign thực từ Ads API',
          realtime_order_fee_api: 'Không dùng order_fee_details.fee_ads để dựng dashboard ADS',
          reports: 'Không dùng platform_reports để dựng dashboard ADS realtime',
          cost_settings: 'Tuyệt đối không dùng cost setting/orders_v2.fee_ads để tính KPI ADS'
        },
        filters: {
          from: requestFilter.from,
          to: requestFilter.to,
          platform: requestFilter.platform,
          shop: requestFilter.shop
        },
        shops: shopStatusRows,
        running_shops: runningShops,
        api_shops: apiShops,
        ads_shop_status: shopStatusRows,
        diagnostics: {
          api_shop_count: apiShops.length,
          running_ads_shop_count: runningShops.length,
          connected_ads_shop_count: shopStatusRows.length,
          campaign_snapshot_count: aggregateSnapshots.length,
          raw_campaign_snapshot_count: canonicalCampaignSnapshots.length,
          product_campaign_snapshot_count: canonicalCampaignSnapshots.filter(row => campaignSnapshotType(row) === 'product_campaign').length,
          shop_level_snapshot_count: canonicalCampaignSnapshots.filter(row => campaignSnapshotType(row) === 'shop_level').length,
          shopee_ads_balance_ok_count: Number(shopeeBalances.ok_count || 0),
          shopee_ads_balance_total: safeNumber(shopeeBalances.total_balance),
          shopee_ads_toggle_ok_count: Number(shopeeToggleInfo.ok_count || 0),
          affiliate_snapshot_count: affiliatePerformance.length,
          open_campaign_snapshot_count: openCampaignPerformance.length,
          strict_note: 'KPI chỉ cộng snapshot Ads API có spend > 0; danh sách shop vẫn hiện toàn bộ shop API theo bộ lọc để thấy shop nào chưa phát sinh campaign/spend.'
        },
        ads_balances: shopeeBalances.shops || [],
        ads_toggle_info: shopeeToggleInfo.shops || [],
        affiliate_summary: affiliateSummary,
        affiliate_performance: affiliatePerformance.slice(0, 80),
        open_campaign_summary: openCampaignSummary,
        open_campaign_performance: openCampaignPerformance.slice(0, 80),
        summary,
        daily,
        shop_performance: shopPerformance,
        product_performance: productPerformance,
        reports: [],
        marketing_signals: [],
        campaigns: canonicalCampaignSnapshots.slice(0, 120)
      }, cors)
}
