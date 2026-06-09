export function installApiSyncLazadaProductsSync(core) {
  const LAZADA_FBL_CHANNEL_STOCKS_PATH = core.LAZADA_FBL_CHANNEL_STOCKS_PATH
  const LAZADA_FBL_PLATFORM_PRODUCTS_PATH = core.LAZADA_FBL_PLATFORM_PRODUCTS_PATH
  const LAZADA_FBL_STOCKS_V3_PATH = core.LAZADA_FBL_STOCKS_V3_PATH
  const callLazada = (...args) => core.callLazada(...args)
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const filterInStockProducts = (...args) => core.filterInStockProducts(...args)
  const firstText = (...args) => core.firstText(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getLazadaSellerId = (...args) => core.getLazadaSellerId(...args)
  const mergeLazadaStockSources = core.mergeLazadaStockSources
  const normalizeLazadaAdvancedStockSource = core.normalizeLazadaAdvancedStockSource
  const normalizeLazadaFblStockSource = core.normalizeLazadaFblStockSource
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const saveProductCatalogSnapshotsBatch = core.saveProductCatalogSnapshotsBatch
  const saveProductKnowledgeBatch = core.saveProductKnowledgeBatch
  const syncVariationPayload = (...args) => core.syncVariationPayload(...args)
  const signLazada = (...args) => core.signLazada(...args)
  const toMoney = (...args) => core.toMoney(...args)
  const saveProductActionLog = (...args) => core.saveProductActionLog?.(...args)

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
          model_id: firstText(sku.SkuId, sku.sku_id),
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

  function lazadaPriceNumber(value) {
    const number = Number(String(value ?? '').replace(/[^\d.]/g, ''))
    return Number.isFinite(number) ? number : 0
  }

  function lazadaSkuText(...values) {
    return firstText(...values).trim()
  }

  function lazadaXmlEscape(value) {
    return cleanText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  function buildLazadaPriceQuantityPayload(items = []) {
    const skus = items.map(item => (
      `<Sku>${item.item_id ? `<ItemId>${lazadaXmlEscape(item.item_id)}</ItemId>` : ''}${item.sku_id ? `<SkuId>${lazadaXmlEscape(item.sku_id)}</SkuId>` : `<SellerSku>${lazadaXmlEscape(item.seller_sku)}</SellerSku>`}${item.price ? `<Price>${lazadaPriceNumber(item.price)}</Price>` : ''}<SalePrice>${lazadaPriceNumber(item.sale_price || item.special_price)}</SalePrice></Sku>`
    )).join('')
    return `<Request><Product><Skus>${skus}</Skus></Product></Request>`
  }
  core.buildLazadaPriceQuantityPayload = buildLazadaPriceQuantityPayload

  async function postLazadaPriceQuantityForm(shop, payload) {
    const signed = await signLazada('/product/price_quantity/update', shop.access_token, { payload })
    const res = await fetch('https://api.lazada.vn/rest/product/price_quantity/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams(signed)
    })
    const data = await res.json()
    if (data.code && data.code !== '0') {
      throw new Error(JSON.stringify({
        code: data.code,
        message: data.message,
        detail: data.detail || data.data || null,
        request_id: data.request_id
      }))
    }
    return data
  }
  core.postLazadaPriceQuantityForm = postLazadaPriceQuantityForm

  async function findLazadaSkuReadback(env, shop, sellerSku, options = {}) {
    const target = cleanText(sellerSku).toLowerCase()
    const maxRows = Math.max(50, Math.min(Number(options.maxRows || 500) || 500, 1000))
    let offset = 0
    while (offset < maxRows) {
      const data = await callLazadaWithShop(env, shop, '/products/get', {
        filter: 'all',
        limit: '50',
        offset: String(offset)
      })
      const products = data?.data?.products || []
      for (const product of products) {
        for (const sku of product.skus || []) {
          const keys = [
            sku.SellerSku,
            sku.seller_sku,
            sku.ShopSku,
            sku.shop_sku,
            sku.SkuId,
            sku.sku_id
          ].map(value => cleanText(value).toLowerCase()).filter(Boolean)
          if (!keys.includes(target)) continue
          return {
            product,
            sku,
            seller_sku: lazadaSkuText(sku.SellerSku, sku.seller_sku, sku.ShopSku, sku.shop_sku, sellerSku),
            sku_id: lazadaSkuText(sku.SkuId, sku.sku_id),
            item_id: lazadaSkuText(product.item_id),
            price: toMoney(sku.price),
            special_price: toMoney(sku.special_price),
            quantity: Number(sku.quantity ?? sku.available ?? 0) || 0
          }
        }
      }
      if (products.length < 50) break
      offset += products.length
    }
    return null
  }
  core.findLazadaSkuReadback = findLazadaSkuReadback

  async function writebackLazadaSpecialPrice(env, shopName, readback, proposedPrice) {
    const sellerSku = lazadaSkuText(readback?.seller_sku)
    if (!sellerSku) return { updated: 0, readback: null }
    const price = lazadaPriceNumber(readback?.special_price || proposedPrice)
    const result = await env.DB.prepare(`
      UPDATE product_variations
      SET discount_price = ?,
          price = CASE WHEN ? > 0 THEN ? ELSE price END,
          model_id = CASE WHEN ? != '' THEN ? ELSE model_id END,
          platform_item_id = CASE WHEN ? != '' THEN ? ELSE platform_item_id END,
          updated_at = datetime('now')
      WHERE platform = 'lazada' AND shop = ? AND platform_sku = ?
    `).bind(
      price,
      lazadaPriceNumber(readback?.price),
      lazadaPriceNumber(readback?.price),
      lazadaSkuText(readback?.sku_id),
      lazadaSkuText(readback?.sku_id),
      lazadaSkuText(readback?.item_id),
      lazadaSkuText(readback?.item_id),
      shopName,
      sellerSku
    ).run()
    const row = await env.DB.prepare(`
      SELECT platform_sku, platform_item_id, model_id, price, discount_price, updated_at
      FROM product_variations
      WHERE platform = 'lazada' AND shop = ? AND platform_sku = ?
    `).bind(shopName, sellerSku).first().catch(() => null)
    return { updated: Number(result?.meta?.changes || 0), readback: row }
  }
  core.writebackLazadaSpecialPrice = writebackLazadaSpecialPrice

  async function executeLazadaPromoAction(env, options = {}) {
    const shopName = cleanText(options.shop || options.user_name)
    const action = cleanText(options.action || options.action_type || 'update_special_price')
    const confirm = cleanText(options.confirm)
    const payload = options.payload || {}
    const sellerSku = lazadaSkuText(payload.seller_sku || payload.platform_sku || payload.sku)
    const specialPrice = lazadaPriceNumber(payload.special_price || payload.price || payload.proposed_price)
    const dryRun = options.dry_run === true || options.dry_run === 1 || cleanText(options.dry_run).toLowerCase() === 'true'
    if (action !== 'update_special_price') throw new Error('Lệnh Lazada promotion không được hỗ trợ.')
    if (!shopName || !sellerSku || specialPrice <= 0) throw new Error('Thiếu shop, SellerSku hoặc giá KM Lazada.')
    const shops = await getApiShops(env, 'lazada', shopName, 1)
    const shop = shops[0]
    if (!shop) throw new Error('Không tìm thấy shop Lazada API trong Shop Core.')
    const resolvedShop = shop.shop_name || shop.user_name || shopName
    const beforeReadback = await findLazadaSkuReadback(env, shop, sellerSku)
    const requestPayload = buildLazadaPriceQuantityPayload([{
      seller_sku: sellerSku,
      sku_id: lazadaSkuText(payload.sku_id || beforeReadback?.sku_id),
      item_id: lazadaSkuText(payload.item_id || beforeReadback?.item_id),
      price: lazadaPriceNumber(beforeReadback?.price),
      sale_price: specialPrice,
      special_price: specialPrice
    }])
    if (dryRun) {
      return {
        status: 'dry_run',
        platform: 'lazada',
        shop: resolvedShop,
        endpoint: '/product/price_quantity/update',
        seller_sku: sellerSku,
        special_price: specialPrice,
        request_payload: requestPayload,
        before_readback: beforeReadback
      }
    }
    if (confirm !== 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_LAZADA') {
      throw new Error('Thiếu xác nhận admin để ghi giá KM Lazada thật.')
    }
    if (String(env.LAZADA_PRICE_LIVE_WRITE_ENABLED || '').toLowerCase() !== 'true') {
      throw new Error('LAZADA_PRICE_LIVE_WRITE_ENABLED chưa bật, chưa được ghi giá Lazada thật.')
    }

    const apiResponse = await postLazadaPriceQuantityForm(shop, requestPayload)
    const readback = await findLazadaSkuReadback(env, shop, sellerSku)
    const readbackPrice = lazadaPriceNumber(readback?.special_price)
    const verified = Boolean(readback && Math.abs(readbackPrice - specialPrice) <= 0.01)
    const coreWriteback = await writebackLazadaSpecialPrice(env, resolvedShop, readback || { seller_sku: sellerSku, special_price: specialPrice }, specialPrice)
    await saveProductActionLog(env, {
      platform: 'lazada',
      shop: resolvedShop,
      action_type: 'update_price',
      action_scope: 'live_write',
      action_status: verified ? 'success' : 'readback_mismatch',
      request_payload: { action, payload: { seller_sku: sellerSku, special_price: specialPrice } },
      preview_payload: { endpoint: '/product/price_quantity/update' },
      response_payload: { api_response: apiResponse, readback, core_writeback: coreWriteback },
      note: verified ? 'Ghi giá KM Lazada thành công và đã readback Core.' : 'Đã gọi Lazada nhưng readback chưa khớp giá KM.'
    })
    return {
      status: verified ? 'success' : 'readback_mismatch',
      platform: 'lazada',
      shop: resolvedShop,
      endpoint: '/product/price_quantity/update',
      seller_sku: sellerSku,
      proposed_special_price: specialPrice,
      verified,
      api_response: apiResponse,
      readback,
      core_writeback: coreWriteback
    }
  }
  core.executeLazadaPromoAction = executeLazadaPromoAction
}
