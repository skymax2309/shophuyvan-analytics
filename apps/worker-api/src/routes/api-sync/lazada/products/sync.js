export function installApiSyncLazadaProductsSync(core) {
  const LAZADA_FBL_CHANNEL_STOCKS_PATH = core.LAZADA_FBL_CHANNEL_STOCKS_PATH
  const LAZADA_FBL_PLATFORM_PRODUCTS_PATH = core.LAZADA_FBL_PLATFORM_PRODUCTS_PATH
  const LAZADA_FBL_STOCKS_V3_PATH = core.LAZADA_FBL_STOCKS_V3_PATH
  const callLazada = (...args) => core.callLazada(...args)
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const filterInStockProducts = (...args) => core.filterInStockProducts(...args)
  const firstText = (...args) => core.firstText(...args)
  const getLazadaSellerId = (...args) => core.getLazadaSellerId(...args)
  const mergeLazadaStockSources = core.mergeLazadaStockSources
  const normalizeLazadaAdvancedStockSource = core.normalizeLazadaAdvancedStockSource
  const normalizeLazadaFblStockSource = core.normalizeLazadaFblStockSource
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const saveProductCatalogSnapshotsBatch = core.saveProductCatalogSnapshotsBatch
  const saveProductKnowledgeBatch = core.saveProductKnowledgeBatch
  const syncVariationPayload = (...args) => core.syncVariationPayload(...args)
  const toMoney = (...args) => core.toMoney(...args)

  async function listLazadaProducts(accessToken, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 500) || 500, 500))
    const warnings = Array.isArray(options.warnings) ? options.warnings : []
    const rows = []
    let offset = 0

    while (rows.length < limit) {
      const batchLimit = Math.min(50, limit - rows.length)
      let data
      try {
        data = await callLazada('/products/get', accessToken, {
          filter: 'all',
          limit: String(batchLimit),
          offset: String(offset)
        })
      } catch (error) {
        warnings.push({ stage: 'products/get', message: error.message })
        break
      }
      const products = data?.data?.products || []
      rows.push(...products)
      if (products.length < batchLimit) break
      offset += products.length
    }

    return rows.slice(0, limit)
  }
  core.listLazadaProducts = listLazadaProducts

  function buildLazadaProductPayload(shop, productRows) {
    return productRows.map(product => {
      const attrs = product.attributes || {}
      const images = Array.isArray(product.images) ? product.images.map(cleanText).filter(Boolean) : []
      const variations = (product.skus || []).map(sku => {
        const sellerSku = firstText(sku.SellerSku, sku.seller_sku, sku.ShopSku, sku.shop_sku, sku.SkuId, sku.sku_id)
        return {
          variation_name: sellerSku || 'Mac dinh',
          sku: sellerSku || cleanText(product.item_id),
          price: toMoney(sku.price),
          discount_price: toMoney(sku.special_price),
          stock: Number(sku.quantity ?? sku.available ?? 0) || 0,
          variation_image: firstText(sku.Images?.[0], sku.images?.[0], images[0]),
          stock_source: normalizeLazadaAdvancedStockSource(sku)
        }
      }).filter(v => v.sku)

      return {
        item_id: cleanText(product.item_id),
        product_name: firstText(attrs.name, product.name, product.product_name),
        description: firstText(attrs.short_description, attrs.description, product.description),
        video_url: firstText(attrs.video_url, attrs.video, product.video_url),
        images,
        category_id: firstText(product.primary_category, product.category_id),
        brand_name: firstText(attrs.brand, attrs.Brand, product.brand_name),
        item_sku: firstText(product.seller_sku, product.SellerSku),
        weight: firstText(attrs.package_weight, attrs.weight, product.package_weight),
        dimensions: {
          length: firstText(attrs.package_length, product.package_length),
          width: firstText(attrs.package_width, product.package_width),
          height: firstText(attrs.package_height, product.package_height)
        },
        attributes: attrs,
        raw_listing: product,
        variations: variations.length ? variations : [{
          variation_name: 'Mac dinh',
          sku: cleanText(product.item_id),
          price: 0,
          discount_price: 0,
          stock: 0,
          variation_image: images[0] || ''
        }]
      }
    })
  }
  core.buildLazadaProductPayload = buildLazadaProductPayload

  function lazadaMarketplaceCode(env, options = {}) {
    return cleanText(options.marketplace || options.lazada_marketplace || options.lazadaMarketplace || env.LAZADA_MARKETPLACE) || 'LAZADA_VN'
  }
  core.lazadaMarketplaceCode = lazadaMarketplaceCode

  function fblStockKeyValues(row = {}) {
    return [
      row.seller_sku,
      row.platform_sku,
      row.fulfillment_sku,
      row.fulfilment_sku,
      row.sku
    ].map(cleanText).filter(Boolean)
  }
  core.fblStockKeyValues = fblStockKeyValues

  async function fetchLazadaFblPlatformProducts(env, shop, options = {}, warnings = []) {
    const marketplace = lazadaMarketplaceCode(env, options)
    let sellerId = cleanText(options.seller_id || options.sellerId)
    if (!sellerId) {
      try {
        sellerId = await getLazadaSellerId(shop.access_token)
      } catch (error) {
        warnings.push({ stage: LAZADA_FBL_PLATFORM_PRODUCTS_PATH, message: `Không lấy được seller_id Lazada: ${error.message}` })
        return { marketplace, seller_id: '', rows: [] }
      }
    }
    const page = Math.max(1, Number(options.fbl_page || options.fblPage || 1) || 1)
    const perPage = Math.max(1, Math.min(Number(options.fbl_limit || options.fblLimit || 50) || 50, 50))
    try {
      const data = await callLazadaWithShop(env, shop, LAZADA_FBL_PLATFORM_PRODUCTS_PATH, {
        seller_id: sellerId,
        marketplace,
        page: String(page),
        per_page: String(perPage),
        ready_for_inbound: 'true'
      })
      return { marketplace, seller_id: sellerId, rows: Array.isArray(data?.data) ? data.data : [] }
    } catch (error) {
      warnings.push({ stage: LAZADA_FBL_PLATFORM_PRODUCTS_PATH, marketplace, message: error.message })
      return { marketplace, seller_id: sellerId, rows: [] }
    }
  }
  core.fetchLazadaFblPlatformProducts = fetchLazadaFblPlatformProducts

  async function fetchLazadaFblStockRows(env, shop, marketplace, fulfillmentSkus = [], warnings = []) {
    const uniqueSkus = [...new Set(fulfillmentSkus.map(cleanText).filter(Boolean))].slice(0, 50)
    if (!uniqueSkus.length) return []
    try {
      const data = await callLazadaWithShop(env, shop, LAZADA_FBL_STOCKS_V3_PATH, {
        marketplace,
        fulfilment_sku: uniqueSkus.join(',')
      })
      return Array.isArray(data?.data) ? data.data : []
    } catch (error) {
      warnings.push({ stage: LAZADA_FBL_STOCKS_V3_PATH, marketplace, message: error.message })
      return []
    }
  }
  core.fetchLazadaFblStockRows = fetchLazadaFblStockRows

  async function fetchLazadaFblChannelStockMap(env, shop, marketplace, fulfillmentSkus = [], options = {}, warnings = []) {
    const includeChannel = parseBooleanOption(options.include_fbl_channel_stock ?? options.includeFblChannelStock, true)
    if (!includeChannel) return new Map()
    const limit = Math.max(0, Math.min(Number(options.fbl_channel_limit || options.fblChannelLimit || 10) || 10, 50))
    const uniqueSkus = [...new Set(fulfillmentSkus.map(cleanText).filter(Boolean))].slice(0, limit)
    const map = new Map()
    for (const fulfillmentSku of uniqueSkus) {
      try {
        const data = await callLazadaWithShop(env, shop, LAZADA_FBL_CHANNEL_STOCKS_PATH, {
          platform_name: marketplace,
          fulfillment_sku_id: fulfillmentSku
        })
        if (data?.data) map.set(fulfillmentSku, data.data)
      } catch (error) {
        warnings.push({ stage: LAZADA_FBL_CHANNEL_STOCKS_PATH, fulfillment_sku: fulfillmentSku, message: error.message })
      }
    }
    if (fulfillmentSkus.length > uniqueSkus.length) {
      warnings.push({
        stage: LAZADA_FBL_CHANNEL_STOCKS_PATH,
        message: `Chỉ kiểm channel stock ${uniqueSkus.length}/${fulfillmentSkus.length} fulfillment SKU để tránh gọi quá nhiều request.`
      })
    }
    return map
  }
  core.fetchLazadaFblChannelStockMap = fetchLazadaFblChannelStockMap

  async function buildLazadaFblStockMap(env, shop, options = {}, warnings = []) {
    const fblProducts = await fetchLazadaFblPlatformProducts(env, shop, options, warnings)
    const skuRows = []
    for (const product of fblProducts.rows) {
      for (const sku of Array.isArray(product.skus) ? product.skus : []) {
        const row = {
          seller_sku: cleanText(sku.seller_sku),
          platform_sku: cleanText(sku.platform_sku),
          fulfillment_sku: cleanText(sku.fulfillment_sku || sku.fulfilment_sku),
          product_id: cleanText(product.product_id),
          marketplace: cleanText(product.marketplace || fblProducts.marketplace)
        }
        if (row.seller_sku || row.platform_sku || row.fulfillment_sku) skuRows.push(row)
      }
    }

    const fulfillmentSkus = skuRows.map(row => row.fulfillment_sku).filter(Boolean)
    const stockRows = await fetchLazadaFblStockRows(env, shop, fblProducts.marketplace, fulfillmentSkus, warnings)
    const stockByFulfillment = new Map()
    for (const row of stockRows) {
      const key = cleanText(row.fulfilment_sku || row.fulfillment_sku)
      if (key) stockByFulfillment.set(key, row)
    }
    const channelByFulfillment = await fetchLazadaFblChannelStockMap(env, shop, fblProducts.marketplace, fulfillmentSkus, options, warnings)

    const stockMap = new Map()
    let rowsWithStock = 0
    for (const row of skuRows) {
      const stockRow = stockByFulfillment.get(row.fulfillment_sku) || {}
      const channelRow = channelByFulfillment.get(row.fulfillment_sku) || {}
      const stockSource = normalizeLazadaFblStockSource(stockRow, channelRow)
      if (stockSource.fbl_stock || stockSource.channel_stock || stockSource.warehouse_stock) rowsWithStock += 1
      for (const key of fblStockKeyValues(row)) {
        stockMap.set(key.toLowerCase(), { ...row, stock_source: stockSource })
      }
    }

    return {
      marketplace: fblProducts.marketplace,
      seller_id: fblProducts.seller_id,
      platform_products: fblProducts.rows.length,
      sku_rows: skuRows.length,
      stock_rows: stockRows.length,
      channel_rows: channelByFulfillment.size,
      rows_with_stock: rowsWithStock,
      stock_map: stockMap
    }
  }
  core.buildLazadaFblStockMap = buildLazadaFblStockMap

  async function enrichLazadaProductsWithFblStock(env, shop, products, options = {}, warnings = []) {
    const result = await buildLazadaFblStockMap(env, shop, options, warnings)
    let enrichedVariations = 0
    for (const product of products) {
      for (const variation of product.variations || []) {
        const match = fblStockKeyValues(variation)
          .map(key => result.stock_map.get(key.toLowerCase()))
          .find(Boolean)
        if (!match) continue
        // FBL là nguồn tồn nâng cao đọc-only; gộp vào stock_source để UI biết khác seller_quantity thường.
        variation.stock_source = mergeLazadaStockSources(variation.stock_source, match.stock_source)
        variation.stock = Number(variation.stock_source.total_stock || variation.stock || 0) || 0
        enrichedVariations += 1
      }
    }
    return {
      marketplace: result.marketplace,
      seller_id: result.seller_id,
      platform_products: result.platform_products,
      sku_rows: result.sku_rows,
      stock_rows: result.stock_rows,
      channel_rows: result.channel_rows,
      rows_with_stock: result.rows_with_stock,
      enriched_variations: enrichedVariations
    }
  }
  core.enrichLazadaProductsWithFblStock = enrichLazadaProductsWithFblStock

  async function syncLazadaProductsShop(env, cors, shop, options = {}) {
    const warnings = []
    const productRows = await listLazadaProducts(shop.access_token, { ...options, warnings })
    const products = buildLazadaProductPayload(shop, productRows)
    let fblStock = null
    if (parseBooleanOption(options.include_fbl_stock ?? options.includeFblStock, false)) {
      fblStock = await enrichLazadaProductsWithFblStock(env, shop, products, options, warnings)
    }
    const stockFilter = filterInStockProducts(products, options)
    const syncProducts = stockFilter.products
    let knowledgeResult = { saved: 0, skipped: 0 }
    let catalogSnapshotResult = { saved: 0, skipped: 0 }
    if (syncProducts.length) {
      try {
        knowledgeResult = await saveProductKnowledgeBatch(env, {
          platform: 'lazada',
          shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
          shop_id: shop.api_shop_id,
          source: 'api',
          products: syncProducts
        })
      } catch (error) {
        warnings.push({ stage: 'product_knowledge', message: error.message })
      }
      try {
        catalogSnapshotResult = await saveProductCatalogSnapshotsBatch(env, {
          platform: 'lazada',
          shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
          shop_id: shop.api_shop_id,
          source: 'api',
          products: syncProducts
        })
      } catch (error) {
        warnings.push({ stage: 'product_catalog_snapshot', message: error.message })
      }
    }
    const result = syncProducts.length
      ? await syncVariationPayload(env, cors, {
        user_name: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        platform: 'lazada',
        source: 'api',
        target_warehouse: shop.warehouse_source || 'main',
        products: syncProducts
      })
      : { synced: 0, auto_mapped: 0 }

    return {
      shop: shop.shop_name,
      fetched_products: products.length,
      synced_products: syncProducts.length,
      skipped_out_of_stock: stockFilter.skippedOutOfStock,
      skipped_zero_stock_variations: stockFilter.skippedZeroStockVariations,
      saved_product_knowledge: knowledgeResult.saved || 0,
      saved_product_catalog_snapshots: catalogSnapshotResult.saved || 0,
      fbl_stock: fblStock,
      synced_variations: result.synced || 0,
      auto_mapped: result.auto_mapped || 0,
      warnings
    }
  }
  core.syncLazadaProductsShop = syncLazadaProductsShop
}
