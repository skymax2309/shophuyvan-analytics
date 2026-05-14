export function installDiscountsCommonPromotionCacheBatch(core) {
  const filterList = (...args) => core.filterList(...args)
  const getApiShops = core.getApiShops
  const lazadaShopName = (...args) => core.lazadaShopName(...args)
  const limitNumber = (...args) => core.limitNumber(...args)
  const syncLazadaPromotionPrograms = (...args) => core.syncLazadaPromotionPrograms(...args)
  const syncLazadaVouchers = (...args) => core.syncLazadaVouchers(...args)
  const syncShopeePromotionPrograms = (...args) => core.syncShopeePromotionPrograms(...args)
  const syncShopeeVouchers = (...args) => core.syncShopeeVouchers(...args)
  const voucherShopName = (...args) => core.voucherShopName(...args)

  async function runPromotionDeepCacheBatch(env, options = {}) {
    const maxJobs = limitNumber(options.max_jobs || options.maxJobs, 3, 1, 8)
    const taskFilter = new Set(filterList(options.task || options.tasks))
    const jobs = []
    const shopeeShops = await getApiShops(env, 'shopee', options.shop, limitNumber(options.shop_limit || options.shopLimit, 10, 1, 50))
    const lazadaShops = await getApiShops(env, 'lazada', options.shop, limitNumber(options.shop_limit || options.shopLimit, 10, 1, 50))

    const pushJob = (task, platform, shop, runner) => {
      if (taskFilter.size && !taskFilter.has(task)) return
      jobs.push({ task, platform, shop: platform === 'lazada' ? lazadaShopName(shop) : voucherShopName(shop), runner })
    }
    for (const shop of shopeeShops) {
      pushJob('shopee_vouchers', 'shopee', shop, () => syncShopeeVouchers(env, { shop: voucherShopName(shop), status: 'all', include_detail: 0, page_limit: 10, page_size: 100, shop_limit: 1 }))
      pushJob('shopee_bundle', 'shopee', shop, () => syncShopeePromotionPrograms(env, { shop: voucherShopName(shop), module: 'bundle_deal', status: 'all', include_detail: 1, page_limit: 3, page_size: 100, detail_limit: 10, item_limit: 10, shop_limit: 1 }))
      pushJob('shopee_add_on', 'shopee', shop, () => syncShopeePromotionPrograms(env, { shop: voucherShopName(shop), module: 'add_on_deal', status: 'all', include_detail: 1, page_limit: 2, page_size: 100, detail_limit: 8, item_limit: 8, shop_limit: 1 }))
      pushJob('shopee_flash', 'shopee', shop, () => syncShopeePromotionPrograms(env, { shop: voucherShopName(shop), module: 'shop_flash_sale', status: 'all', include_detail: 1, page_limit: 2, page_size: 50, detail_limit: 8, item_limit: 20, shop_limit: 1 }))
    }
    for (const shop of lazadaShops) {
      pushJob('lazada_vouchers', 'lazada', shop, () => syncLazadaVouchers(env, { shop: lazadaShopName(shop), status: 'all', include_detail: 1, include_products: 1, page_limit: 3, detail_limit: 10, product_page_limit: 1, shop_limit: 1 }))
      pushJob('lazada_free_shipping', 'lazada', shop, () => syncLazadaPromotionPrograms(env, { shop: lazadaShopName(shop), module: 'free_shipping', status: 'all', include_detail: 1, include_products: 1, page_limit: 3, detail_limit: 10, product_page_limit: 1, shop_limit: 1 }))
      pushJob('lazada_flexicombo', 'lazada', shop, () => syncLazadaPromotionPrograms(env, { shop: lazadaShopName(shop), module: 'flexicombo', status: 'all', include_detail: 1, include_products: 1, page_limit: 3, detail_limit: 10, product_page_limit: 1, shop_limit: 1 }))
    }

    const selected = jobs.slice(0, maxJobs)
    const results = []
    for (const job of selected) {
      try {
        results.push({ task: job.task, platform: job.platform, shop: job.shop, result: await job.runner() })
      } catch (error) {
        results.push({ task: job.task, platform: job.platform, shop: job.shop, status: 'error', error: error?.message || String(error) })
      }
    }
    return {
      status: 'ok',
      mode: 'promotion_deep_cache_batch',
      selected_jobs: selected.length,
      available_jobs: jobs.length,
      max_jobs: maxJobs,
      note: 'Batch chạy từng shop/module để tránh quá giới hạn subrequest của Worker. Không có thao tác ghi thật lên sàn.',
      results
    }
  }
  core.runPromotionDeepCacheBatch = runPromotionDeepCacheBatch
}
