import {
  recordShopOrderStatusSyncDiagnostic,
  recordShopOrderSyncDiagnostic,
  sanitizeApiSyncError
} from '../../../modules/api-sync/sync-diagnostics.js'

export function installApiSyncCommonHandlers(core) {
  const adsSyncWindow = (...args) => core.adsSyncWindow(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanupLegacyOrderSourceMeta = core.cleanupLegacyOrderSourceMeta
  const collectShopeePackageStatus = core.collectShopeePackageStatus
  const ensureAdsCampaignSnapshotsTable = (...args) => core.ensureAdsCampaignSnapshotsTable(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const importLazadaShop = (...args) => core.importLazadaShop(...args)
  const importShopeeShop = (...args) => core.importShopeeShop(...args)
  const json = (...args) => core.json(...args)
  const mapPlatformStatus = (...args) => core.mapPlatformStatus(...args)
  const mapShopeeStatus = core.mapShopeeStatus
  const normalizeLazadaCarrier = (...args) => core.normalizeLazadaCarrier(...args)
  const normalizeLazadaTracking = (...args) => core.normalizeLazadaTracking(...args)
  const nowBangkokText = core.nowBangkokText
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const probeShopeeAdsShop = (...args) => core.probeShopeeAdsShop(...args)
  const syncLazadaAdsCampaignsShop = (...args) => core.syncLazadaAdsCampaignsShop(...args)
  const syncLazadaProductsShop = (...args) => core.syncLazadaProductsShop(...args)
  const syncLazadaShop = (...args) => core.syncLazadaShop(...args)
  const syncShopeeAdsCampaignsShop = (...args) => core.syncShopeeAdsCampaignsShop(...args)
  const syncShopeeProductsShop = (...args) => core.syncShopeeProductsShop(...args)
  const syncShopeeShop = (...args) => core.syncShopeeShop(...args)

  function shopDisplayName(shop = {}) {
    return cleanText(shop.shop_name || shop.user_name || shop.api_shop_id || '')
  }

  async function runShopSyncStep(env, shop, stage, runner) {
    try {
      const result = await runner()
      const payload = {
        status: Array.isArray(result?.warnings) && result.warnings.length ? 'partial_error' : 'ok',
        platform: cleanText(shop.platform).toLowerCase(),
        ...result
      }
      if (stage === 'orders') await recordShopOrderSyncDiagnostic(env, shop, payload)
      if (stage === 'statuses') await recordShopOrderStatusSyncDiagnostic(env, shop, payload)
      return payload
    } catch (error) {
      const safeError = sanitizeApiSyncError(error)
      const payload = {
        status: 'error',
        platform: cleanText(shop.platform).toLowerCase(),
        shop: shopDisplayName(shop),
        fetched: 0,
        imported_orders: 0,
        imported_items: 0,
        checked: 0,
        updated: 0,
        error: safeError
      }
      if (stage === 'orders') await recordShopOrderSyncDiagnostic(env, shop, payload, error)
      if (stage === 'statuses') await recordShopOrderStatusSyncDiagnostic(env, shop, payload, error)
      return payload
    }
  }

  function summarizeSyncStatus(results) {
    if (results.some(item => item.status === 'ok' || item.status === 'partial_error')) {
      return results.some(item => item.status !== 'ok') ? 'partial_error' : 'ok'
    }
    return results.length ? 'error' : 'no_api_shop'
  }

  async function syncApiProducts(env, cors, options = {}) {
    const platformFilter = cleanText(options.platform || '').toLowerCase()
    const platforms = platformFilter ? [platformFilter] : ['shopee', 'lazada']
    const results = []

    for (const platform of platforms) {
      const shops = await getApiShops(env, platform, options.shop)
      for (const shop of shops) {
        if (platform === 'shopee') results.push(await syncShopeeProductsShop(env, cors, shop, options))
        if (platform === 'lazada') results.push(await syncLazadaProductsShop(env, cors, shop, options))
      }
    }

    return {
      status: 'ok',
      fetched_products: results.reduce((sum, item) => sum + item.fetched_products, 0),
      synced_products: results.reduce((sum, item) => sum + (item.synced_products || 0), 0),
      skipped_out_of_stock: results.reduce((sum, item) => sum + (item.skipped_out_of_stock || 0), 0),
      skipped_zero_stock_variations: results.reduce((sum, item) => sum + (item.skipped_zero_stock_variations || 0), 0),
      saved_product_knowledge: results.reduce((sum, item) => sum + (item.saved_product_knowledge || 0), 0),
      saved_product_catalog_snapshots: results.reduce((sum, item) => sum + (item.saved_product_catalog_snapshots || 0), 0),
      synced_variations: results.reduce((sum, item) => sum + item.synced_variations, 0),
      auto_mapped: results.reduce((sum, item) => sum + item.auto_mapped, 0),
      has_more: results.some(item => item.has_more),
      next_offsets: results
        .filter(item => item.has_more)
        .map(item => ({ shop: item.shop, next_offset: item.next_offset, batch_limit: item.batch_limit })),
      warnings: results.flatMap(item => (item.warnings || []).map(warning => ({ shop: item.shop, ...warning }))),
      shops: results
    }
  }
  core.syncApiProducts = syncApiProducts

  async function syncApiOrders(env, cors, options = {}) {
    const platformFilter = cleanText(options.platform || '').toLowerCase()
    const platforms = platformFilter ? [platformFilter] : ['shopee', 'lazada']
    const shopFilter = cleanText(options.shop || '')
    const requestedLimit = Math.max(1, Math.min(Number(options.limit || 120) || 120, 500))
    const shopeeSafeLimit = shopFilter ? requestedLimit : Math.min(requestedLimit, 80)
    const lazadaSafeLimit = shopFilter ? requestedLimit : Math.min(requestedLimit, 40)
    const shopeeLightImport = !shopFilter || shopeeSafeLimit > 40
    const shopeeFetchTracking = parseBooleanOption(options.fetchTracking ?? options.fetch_tracking, !shopeeLightImport)
    // Khi quét nhiều shop cùng lúc, ưu tiên lấy đơn và trạng thái trước để không vướng giới hạn subrequest.
    const shopeeFetchFees = parseBooleanOption(options.fetchFees ?? options.fetch_fees, !shopeeLightImport)
    const statuses = cleanText(options.statuses || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
    const results = []

    for (const platform of platforms) {
      const shops = await getApiShops(env, platform, options.shop)
      for (const shop of shops) {
        if (platform === 'shopee') {
          results.push(await runShopSyncStep(env, shop, 'orders', () => importShopeeShop(env, cors, shop, {
            days: options.days,
            limit: shopeeSafeLimit,
            shop: shopFilter,
            statuses,
            fetch_tracking: shopeeFetchTracking,
            fetch_fees: shopeeFetchFees
          })))
        }
        if (platform === 'lazada') {
          results.push(await runShopSyncStep(env, shop, 'orders', () => importLazadaShop(env, cors, shop, {
            days: options.days,
            limit: lazadaSafeLimit,
            shop: shopFilter,
            offset: options.offset
          })))
        }
      }
    }

    const source_cleanup = await cleanupLegacyOrderSourceMeta(env, {
      platform: platformFilter,
      shop: shopFilter,
      source_updated_at: nowBangkokText()
    })

    return {
      status: summarizeSyncStatus(results),
      requested_limit: requestedLimit,
      per_shop_limit: {
        shopee: shopeeSafeLimit,
        lazada: lazadaSafeLimit
      },
      shopee_light_import: shopeeLightImport,
      shopee_fetch_fees: shopeeFetchFees,
      fetched: results.reduce((sum, item) => sum + item.fetched, 0),
      imported_orders: results.reduce((sum, item) => sum + item.imported_orders, 0),
      imported_items: results.reduce((sum, item) => sum + item.imported_items, 0),
      saved_fee_details: results.reduce((sum, item) => sum + (item.saved_fee_details || 0), 0),
      source_cleanup,
      order_push: {
        sent: results.reduce((sum, item) => sum + (item.order_push?.sent || 0), 0),
        total: results.reduce((sum, item) => sum + (item.order_push?.total || 0), 0),
        notified: results.reduce((sum, item) => sum + (item.order_push?.notified || 0), 0)
      },
      warnings: results.flatMap(item => (item.warnings || []).map(warning => ({ shop: item.shop, ...warning }))),
      errors: results.filter(item => item.status === 'error').map(item => ({ platform: item.platform, shop: item.shop, error: item.error })),
      shops: results
    }
  }
  core.syncApiOrders = syncApiOrders

  async function syncApiOrderStatuses(env, options = {}) {
    const platformFilter = cleanText(options.platform || '').toLowerCase()
    const onlyOrderId = cleanText(options.orderId || options.order_id || '')
    const limitPerShop = Math.min(Number(options.limitPerShop || options.limit || 250) || 250, 500)
    const offsetRows = Math.max(0, Number(options.offset || 0) || 0)
    const days = Math.max(1, Math.min(Number(options.days || 60) || 60, 120))
    const platforms = platformFilter ? [platformFilter] : ['shopee', 'lazada']
    const results = []

    for (const platform of platforms) {
      const shops = await getApiShops(env, platform, options.shop)
      for (const shop of shops) {
        if (platform === 'lazada') results.push(await runShopSyncStep(env, shop, 'statuses', () => syncLazadaShop(env, shop, limitPerShop, onlyOrderId, offsetRows, days)))
        if (platform === 'shopee') results.push(await runShopSyncStep(env, shop, 'statuses', () => syncShopeeShop(env, shop, limitPerShop, onlyOrderId, offsetRows, days)))
      }
    }

    const source_cleanup = await cleanupLegacyOrderSourceMeta(env, {
      platform: platformFilter,
      shop: cleanText(options.shop || ''),
      source_updated_at: nowBangkokText()
    })

    return {
      status: summarizeSyncStatus(results),
      checked: results.reduce((sum, item) => sum + item.checked, 0),
      updated: results.reduce((sum, item) => sum + item.updated, 0),
      fee_updated: results.reduce((sum, item) => sum + (item.fee_updated || 0), 0),
      saved_fee_details: results.reduce((sum, item) => sum + (item.saved_fee_details || 0), 0),
      source_cleanup,
      order_push: {
        sent: results.reduce((sum, item) => sum + (item.order_push?.sent || 0), 0),
        total: results.reduce((sum, item) => sum + (item.order_push?.total || 0), 0),
        notified: results.reduce((sum, item) => sum + (item.order_push?.notified || 0), 0)
      },
      warnings: results.flatMap(item => (item.warnings || []).map(warning => ({ shop: item.shop, ...warning }))),
      errors: results.filter(item => item.status === 'error').map(item => ({ platform: item.platform, shop: item.shop, error: item.error })),
      shops: results
    }
  }
  core.syncApiOrderStatuses = syncApiOrderStatuses

  async function syncAdsCampaignSnapshots(env, options = {}) {
    const platformFilter = cleanText(options.platform || '').toLowerCase()
    const platforms = platformFilter ? [platformFilter] : ['shopee', 'lazada']
    const window = adsSyncWindow(options)
    const results = []
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 100) || 100, 1), 200)

    await ensureAdsCampaignSnapshotsTable(env)

    for (const platform of platforms) {
      if (!['shopee', 'lazada'].includes(platform)) continue
      const shops = await getApiShops(env, platform, options.shop, shopLimit)
      for (const shop of shops) {
        if (platform === 'shopee') results.push(await syncShopeeAdsCampaignsShop(env, shop, options))
        if (platform === 'lazada') results.push(await syncLazadaAdsCampaignsShop(env, shop, options))
      }
    }

    return {
      status: 'ok',
      window,
      fetched_campaigns: results.reduce((sum, item) => sum + (item.fetched_campaigns || 0), 0),
      saved: results.reduce((sum, item) => sum + (item.saved || 0), 0),
      inserted: results.reduce((sum, item) => sum + (item.inserted || 0), 0),
      updated: results.reduce((sum, item) => sum + (item.updated || 0), 0),
      warnings: results.flatMap(item => (item.warnings || []).map(warning => ({ shop: item.shop, ...warning }))),
      shops: results
    }
  }
  core.syncAdsCampaignSnapshots = syncAdsCampaignSnapshots

  async function probeShopeeAdsApi(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 10) || 10, 1), 50)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const results = []
    for (const shop of shops) {
      results.push(await probeShopeeAdsShop(env, shop, options))
    }
    return {
      status: 'ok',
      mode: 'shopee_ads_api_probe',
      note: 'Endpoint này chỉ probe Ads API thật bằng token shop, không tạo số liệu fallback.',
      shop_count: results.length,
      auth_ok_count: results.filter(item => item.auth_ok).length,
      ads_balance_ok_count: results.filter(item => item.ads_balance_ok).length,
      shop_toggle_info_ok_count: results.filter(item => item.shop_toggle_info_ok).length,
      shop_cpc_hourly_ok_count: results.filter(item => item.shop_cpc_hourly_ok).length,
      campaign_endpoint_ok_count: results.filter(item => item.campaign_endpoint_ok).length,
      shops: results
    }
  }
  core.probeShopeeAdsApi = probeShopeeAdsApi

  async function handleApiStatusSync(request, env, cors) {
    const url = new URL(request.url)
    let body = {}
    if (request.method !== 'GET') {
      try { body = await request.json() } catch {}
    }
    const result = await syncApiOrderStatuses(env, {
      platform: body.platform || url.searchParams.get('platform'),
      shop: body.shop || url.searchParams.get('shop'),
      orderId: body.order_id || body.orderId || url.searchParams.get('order_id'),
      limit: body.limit || url.searchParams.get('limit'),
      offset: body.offset || url.searchParams.get('offset'),
      days: body.days || url.searchParams.get('days')
    })
    return json(result, cors)
  }
  core.handleApiStatusSync = handleApiStatusSync

  async function handleApiOrderSync(request, env, cors) {
    const url = new URL(request.url)
    let body = {}
    if (request.method !== 'GET') {
      try { body = await request.json() } catch {}
    }
    const result = await syncApiOrders(env, cors, {
      platform: body.platform || url.searchParams.get('platform'),
      shop: body.shop || url.searchParams.get('shop'),
      days: body.days || url.searchParams.get('days'),
      limit: body.limit || url.searchParams.get('limit'),
      offset: body.offset || url.searchParams.get('offset'),
      statuses: body.statuses || url.searchParams.get('statuses'),
      fetch_fees: body.fetch_fees ?? body.fetchFees ?? url.searchParams.get('fetch_fees'),
      fetch_tracking: body.fetch_tracking ?? body.fetchTracking ?? url.searchParams.get('fetch_tracking')
    })
    return json(result, cors)
  }
  core.handleApiOrderSync = handleApiOrderSync

  async function handleApiProductSync(request, env, cors) {
    const url = new URL(request.url)
    let body = {}
    if (request.method !== 'GET') {
      try { body = await request.json() } catch {}
    }
    const result = await syncApiProducts(env, cors, {
      platform: body.platform || url.searchParams.get('platform'),
      shop: body.shop || url.searchParams.get('shop'),
      limit: body.limit || url.searchParams.get('limit'),
      offset: body.offset || url.searchParams.get('offset'),
      batchLimit: body.batchLimit || body.batch_limit || url.searchParams.get('batch_limit'),
      includeOutOfStock: body.includeOutOfStock ?? body.include_out_of_stock ?? url.searchParams.get('include_out_of_stock'),
      includeFblStock: body.includeFblStock ?? body.include_fbl_stock ?? url.searchParams.get('include_fbl_stock'),
      includeFblChannelStock: body.includeFblChannelStock ?? body.include_fbl_channel_stock ?? url.searchParams.get('include_fbl_channel_stock'),
      fblLimit: body.fblLimit || body.fbl_limit || url.searchParams.get('fbl_limit'),
      fblChannelLimit: body.fblChannelLimit || body.fbl_channel_limit || url.searchParams.get('fbl_channel_limit'),
      marketplace: body.marketplace || url.searchParams.get('marketplace'),
      sellerId: body.sellerId || body.seller_id || url.searchParams.get('seller_id')
    })
    return json(result, cors)
  }
  core.handleApiProductSync = handleApiProductSync

  const __test__ = {
    mapPlatformStatus,
    mapShopeeStatus,
    collectShopeePackageStatus,
    normalizeLazadaCarrier,
    normalizeLazadaTracking
  }
  core.__test__ = __test__
}
