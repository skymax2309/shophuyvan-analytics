export function installApiSyncShopeeProductsSync(core) {
  const SHOPEE_PRODUCT_BASE_INFO_PATH = core.SHOPEE_PRODUCT_BASE_INFO_PATH
  const SHOPEE_PRODUCT_EXTRA_INFO_PATH = core.SHOPEE_PRODUCT_EXTRA_INFO_PATH
  const SHOPEE_PRODUCT_ITEM_LIMIT_PATH = core.SHOPEE_PRODUCT_ITEM_LIMIT_PATH
  const SHOPEE_PRODUCT_ITEM_LIST_PATH = core.SHOPEE_PRODUCT_ITEM_LIST_PATH
  const SHOPEE_PRODUCT_ITEM_PROMOTION_PATH = core.SHOPEE_PRODUCT_ITEM_PROMOTION_PATH
  const SHOPEE_PRODUCT_ITEM_VIOLATION_INFO_PATH = core.SHOPEE_PRODUCT_ITEM_VIOLATION_INFO_PATH
  const SHOPEE_PRODUCT_MODEL_LIST_PATH = core.SHOPEE_PRODUCT_MODEL_LIST_PATH
  const SHOPEE_PRODUCT_SEARCH_PATH = core.SHOPEE_PRODUCT_SEARCH_PATH
  const cleanText = (...args) => core.cleanText(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const fetchShopeeJsonPost = (...args) => core.fetchShopeeJsonPost(...args)
  const filterInStockProducts = (...args) => core.filterInStockProducts(...args)
  const firstText = (...args) => core.firstText(...args)
  const getProductCatalogSettings = core.getProductCatalogSettings
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const listShopeeItemIds = (...args) => core.listShopeeItemIds(...args)
  const saveProductCatalogSnapshotsBatch = core.saveProductCatalogSnapshotsBatch
  const saveProductCatalogState = core.saveProductCatalogState
  const saveProductKnowledgeBatch = core.saveProductKnowledgeBatch
  const saveProductShopLimit = core.saveProductShopLimit
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const syncVariationPayload = (...args) => core.syncVariationPayload(...args)

  async function fetchShopeeSearchCounts(buildSearchUrl, warnings = []) {
    const statuses = ['NORMAL', 'UNLIST', 'BANNED', 'REVIEWING']
    const counts = {}
    for (const status of statuses) {
      try {
        const data = await fetchShopeeJson(buildSearchUrl, {
          page_size: 1,
          offset: 0,
          item_status: status
        })
        counts[status] = Number(data?.response?.total_count || 0)
      } catch (error) {
        warnings.push({ stage: `product/search_item:${status}`, message: error.message })
      }
    }
    counts.total = statuses.reduce((sum, status) => sum + Number(counts[status] || 0), 0)
    return counts
  }
  core.fetchShopeeSearchCounts = fetchShopeeSearchCounts

  async function fetchShopeeItemExtraInfoMap(buildExtraUrl, itemIds, warnings = []) {
    const infoMap = new Map()
    const ids = [...new Set((itemIds || []).map(item => firstText(item)).filter(Boolean))]
    for (let index = 0; index < ids.length; index += 50) {
      const chunk = ids.slice(index, index + 50)
      try {
        const data = await fetchShopeeJson(buildExtraUrl, { item_id_list: chunk.join(',') })
        const rows = Array.isArray(data?.response?.item_list) ? data.response.item_list : []
        for (const row of rows) infoMap.set(firstText(row?.item_id), row)
      } catch (error) {
        warnings.push({ stage: 'product/get_item_extra_info', message: error.message })
      }
    }
    return infoMap
  }
  core.fetchShopeeItemExtraInfoMap = fetchShopeeItemExtraInfoMap

  function shopeePromotionStageRank(value) {
    const staging = cleanText(value).toLowerCase()
    if (staging === 'ongoing') return 3
    if (staging === 'upcoming') return 2
    return 1
  }
  core.shopeePromotionStageRank = shopeePromotionStageRank

  function normalizeShopeePromotionEntry(promotion = {}) {
    const priceList = Array.isArray(promotion?.promotion_price_info) ? promotion.promotion_price_info : []
    return {
      promotion_type: cleanText(promotion?.promotion_type),
      promotion_id: cleanText(promotion?.promotion_id),
      model_id: cleanText(promotion?.model_id),
      start_time: Number(promotion?.start_time || 0) || 0,
      end_time: Number(promotion?.end_time || 0) || 0,
      promotion_price: Number(priceList?.[0]?.promotion_price ?? promotion?.promotion_price ?? 0) || 0,
      promotion_staging: cleanText(promotion?.promotion_staging),
      total_reserved_stock: Number(
        promotion?.promotion_stock_info_v2?.summary_info?.total_reserved_stock ??
        promotion?.promotion_stock_info_v2?.total_reserved_stock ??
        0
      ) || 0
    }
  }
  core.normalizeShopeePromotionEntry = normalizeShopeePromotionEntry

  function mergeShopeePromotionChoice(current, candidate) {
    if (!current) return candidate
    const stageCompare = shopeePromotionStageRank(candidate.promotion_staging) - shopeePromotionStageRank(current.promotion_staging)
    if (stageCompare !== 0) return stageCompare > 0 ? candidate : current
    const endCompare = Number(candidate.end_time || 0) - Number(current.end_time || 0)
    if (endCompare !== 0) return endCompare > 0 ? candidate : current
    return current
  }
  core.mergeShopeePromotionChoice = mergeShopeePromotionChoice

  async function fetchShopeeItemPromotionMap(buildPromotionUrl, itemIds, warnings = []) {
    const promotionMap = new Map()
    const ids = [...new Set((itemIds || []).map(item => firstText(item)).filter(Boolean))]
    for (let index = 0; index < ids.length; index += 50) {
      const chunk = ids.slice(index, index + 50)
      try {
        const data = await fetchShopeeJson(buildPromotionUrl, { item_id_list: chunk.join(',') })
        const successList = Array.isArray(data?.response?.success_list) ? data.response.success_list : []
        const failureList = Array.isArray(data?.response?.failure_list) ? data.response.failure_list : []
        for (const failure of failureList) {
          warnings.push({
            item_id: cleanText(failure?.item_id),
            stage: 'product/get_item_promotion',
            message: cleanText(failure?.failed_reason || 'Shopee không trả dữ liệu khuyến mãi cho item này')
          })
        }
        for (const row of successList) {
          const itemId = cleanText(row?.item_id)
          if (!itemId) continue
          const promotions = (Array.isArray(row?.promotion) ? row.promotion : [])
            .map(normalizeShopeePromotionEntry)
            .filter(item => item.promotion_id || item.promotion_type || item.model_id)
          const modelMap = new Map()
          for (const promotion of promotions) {
            const key = promotion.model_id || ''
            modelMap.set(key, mergeShopeePromotionChoice(modelMap.get(key), promotion))
          }
          promotionMap.set(itemId, {
            summary: promotions,
            model_map: modelMap,
            default_promotion: modelMap.get('') || null,
            raw: row
          })
        }
      } catch (error) {
        warnings.push({ stage: 'product/get_item_promotion', message: error.message })
      }
    }
    return promotionMap
  }
  core.fetchShopeeItemPromotionMap = fetchShopeeItemPromotionMap

  function normalizeShopeeViolationEntry(detail = {}, sourceScope = 'status') {
    return {
      source_scope: cleanText(sourceScope),
      violation_type: cleanText(detail?.violation_type),
      violation_reason: cleanText(detail?.violation_reason),
      suggestion: cleanText(detail?.suggestion),
      fix_deadline_time: Number(detail?.fix_deadline_time || 0) || 0,
      update_time: Number(detail?.update_time || 0) || 0
    }
  }
  core.normalizeShopeeViolationEntry = normalizeShopeeViolationEntry

  function collectShopeeSuggestedCategories(details = []) {
    const dedupe = new Map()
    for (const detail of details) {
      const categories = Array.isArray(detail?.suggested_category) ? detail.suggested_category : []
      for (const category of categories) {
        const id = cleanText(category?.category_id)
        const name = cleanText(category?.category_name)
        const key = `${id}|${name}`
        if (!key.replace(/\|/g, '')) continue
        dedupe.set(key, {
          category_id: id,
          category_name: name
        })
      }
    }
    return [...dedupe.values()]
  }
  core.collectShopeeSuggestedCategories = collectShopeeSuggestedCategories

  async function fetchShopeeViolationResponse(buildViolationUrl, itemIdList) {
    const getParams = { item_id_list: itemIdList.join(',') }
    try {
      return await fetchShopeeJson(buildViolationUrl, getParams)
    } catch (error) {
      return fetchShopeeJsonPost(buildViolationUrl, {}, {
        item_id_list: itemIdList.map(item => Number(item) || item)
      })
    }
  }
  core.fetchShopeeViolationResponse = fetchShopeeViolationResponse

  async function fetchShopeeItemViolationMap(buildViolationUrl, itemIds, warnings = []) {
    const violationMap = new Map()
    const ids = [...new Set((itemIds || []).map(item => firstText(item)).filter(Boolean))]
    for (let index = 0; index < ids.length; index += 50) {
      const chunk = ids.slice(index, index + 50)
      try {
        const data = await fetchShopeeViolationResponse(buildViolationUrl, chunk)
        const itemList = Array.isArray(data?.response?.item_list) ? data.response.item_list : []
        for (const item of itemList) {
          const itemId = cleanText(item?.item_id)
          if (!itemId) continue
          if (cleanText(item?.fail_error) || cleanText(item?.fail_message)) {
            warnings.push({
              item_id: itemId,
              stage: 'product/get_item_violation_info',
              message: cleanText(item?.fail_message || item?.fail_error)
            })
            continue
          }
          const statusDetails = Array.isArray(item?.item_status_details) ? item.item_status_details : []
          const deboostDetails = Array.isArray(item?.deboost_details) ? item.deboost_details : []
          violationMap.set(itemId, {
            summary: [
              ...statusDetails.map(detail => normalizeShopeeViolationEntry(detail, 'status')),
              ...deboostDetails.map(detail => normalizeShopeeViolationEntry(detail, 'deboost'))
            ],
            suggested_categories: collectShopeeSuggestedCategories(deboostDetails),
            deboost: item?.deboost ? 1 : 0,
            raw: item
          })
        }
      } catch (error) {
        warnings.push({ stage: 'product/get_item_violation_info', message: error.message })
      }
    }
    return violationMap
  }
  core.fetchShopeeItemViolationMap = fetchShopeeItemViolationMap

  function normalizeShopeeItemLimit(data = {}) {
    const response = data?.response || {}
    return {
      price_min: Number(response?.price_limit?.min_limit || 0) || 0,
      price_max: Number(response?.price_limit?.max_limit || 0) || 0,
      stock_min: Number(response?.stock_limit?.min_limit || 0) || 0,
      stock_max: Number(response?.stock_limit?.max_limit || 0) || 0,
      item_count_max: Number(response?.item_count_limit?.max_limit || 0) || 0,
      item_name_max: Number(response?.item_name_length_limit?.max_limit || 0) || 0,
      item_description_max: Number(response?.item_description_length_limit?.max_limit || 0) || 0,
      size_chart_mandatory: Boolean(response?.size_chart_limit?.size_chart_mandatory),
      dimension_mandatory: Boolean(response?.dimension_limit?.dimension_mandatory),
      weight_mandatory: Boolean(response?.weight_limit?.weight_mandatory),
      raw: response
    }
  }
  core.normalizeShopeeItemLimit = normalizeShopeeItemLimit

  function shopeeDescription(item) {
    const fields = item?.description_info?.extended_description?.field_list || []
    const text = fields.map(field => cleanText(field?.text)).filter(Boolean).join('\n')
    return text || cleanText(item?.description)
  }
  core.shopeeDescription = shopeeDescription

  function shopeeImages(item) {
    const image = item?.image || {}
    const urls = Array.isArray(image.image_url_list) ? image.image_url_list : []
    if (urls.length) return urls.map(cleanText).filter(Boolean)
    return (image.image_id_list || []).map(id => `https://cf.shopee.vn/file/${id}`).filter(Boolean)
  }
  core.shopeeImages = shopeeImages

  function shopeeBrandName(item) {
    return firstText(
      item?.brand?.original_brand_name,
      item?.brand?.brand_name,
      item?.brand_name
    )
  }
  core.shopeeBrandName = shopeeBrandName

  function shopeeModelStock(model) {
    return Number(
      model?.stock_info_v2?.summary_info?.total_available_stock ??
      model?.stock_info?.[0]?.normal_stock ??
      model?.normal_stock ??
      0
    ) || 0
  }
  core.shopeeModelStock = shopeeModelStock

  function shopeeModelImage(tiers, model) {
    const indexes = Array.isArray(model?.tier_index) ? model.tier_index : []
    for (let i = 0; i < indexes.length; i++) {
      const option = tiers?.[i]?.option_list?.[indexes[i]]
      const image = cleanText(option?.image?.image_url)
      if (image) return image
    }
    return ''
  }
  core.shopeeModelImage = shopeeModelImage

  function shopeeModelName(tiers, model) {
    const indexes = Array.isArray(model?.tier_index) ? model.tier_index : []
    const names = []
    for (let i = 0; i < indexes.length; i++) {
      const option = cleanText(tiers?.[i]?.option_list?.[indexes[i]]?.option)
      if (option) names.push(option)
    }
    return names.join(' - ') || cleanText(model?.model_name) || 'Mac dinh'
  }
  core.shopeeModelName = shopeeModelName

  async function syncShopeeProductsShop(env, cors, shop, options = {}) {
    if (!shop.api_shop_id) return { shop: shop.shop_name, fetched_products: 0, synced_variations: 0, auto_mapped: 0, warnings: [] }
    const warnings = []
    const catalogSettings = await getProductCatalogSettings(env)
    const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
    const buildSearchUrl = signShopeeUrl(app, SHOPEE_PRODUCT_SEARCH_PATH, shop.access_token, shop.api_shop_id)
    const buildListUrl = signShopeeUrl(app, SHOPEE_PRODUCT_ITEM_LIST_PATH, shop.access_token, shop.api_shop_id)
    const buildBaseUrl = signShopeeUrl(app, SHOPEE_PRODUCT_BASE_INFO_PATH, shop.access_token, shop.api_shop_id)
    const buildModelUrl = signShopeeUrl(app, SHOPEE_PRODUCT_MODEL_LIST_PATH, shop.access_token, shop.api_shop_id)
    const buildExtraUrl = signShopeeUrl(app, SHOPEE_PRODUCT_EXTRA_INFO_PATH, shop.access_token, shop.api_shop_id)
    const buildItemLimitUrl = signShopeeUrl(app, SHOPEE_PRODUCT_ITEM_LIMIT_PATH, shop.access_token, shop.api_shop_id)
    const buildPromotionUrl = signShopeeUrl(app, SHOPEE_PRODUCT_ITEM_PROMOTION_PATH, shop.access_token, shop.api_shop_id)
    const buildViolationUrl = signShopeeUrl(app, SHOPEE_PRODUCT_ITEM_VIOLATION_INFO_PATH, shop.access_token, shop.api_shop_id)
    const requestedLimit = Math.max(1, Math.min(Number(options.limit || 40) || 40, 500))
    const safeRunLimit = Math.min(requestedLimit, Math.max(1, Math.min(Number(options.batchLimit || options.batch_limit || 40) || 40, 40)))
    const catalogStateCounts = await fetchShopeeSearchCounts(buildSearchUrl, warnings)
    try {
      await saveProductCatalogState(env, {
        platform: 'shopee',
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        shop_id: shop.api_shop_id,
        counts: catalogStateCounts
      })
    } catch (error) {
      warnings.push({ stage: 'product_catalog_state', message: error.message })
    }

    try {
      const itemLimitData = await fetchShopeeJson(buildItemLimitUrl, {})
      await saveProductShopLimit(env, {
        platform: 'shopee',
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        shop_id: shop.api_shop_id,
        category_id: '',
        limits: normalizeShopeeItemLimit(itemLimitData)
      })
    } catch (error) {
      warnings.push({ stage: 'product/get_item_limit', message: error.message })
    }

    const itemPage = await listShopeeItemIds(buildListUrl, {
      ...options,
      limit: safeRunLimit,
      offset: options.offset || 0,
      warnings
    })
    const itemIds = itemPage.ids
    const products = []
    const extraInfoMap = Number(catalogSettings.sync_extra_metrics_enabled || 0) === 1
      ? await fetchShopeeItemExtraInfoMap(buildExtraUrl, itemIds, warnings)
      : new Map()
    const promotionMap = await fetchShopeeItemPromotionMap(buildPromotionUrl, itemIds, warnings)
    const violationMap = await fetchShopeeItemViolationMap(buildViolationUrl, itemIds, warnings)

    for (let i = 0; i < itemIds.length; i += 50) {
      const chunk = itemIds.slice(i, i + 50)
      let baseData
      try {
        baseData = await fetchShopeeJson(buildBaseUrl, { item_id_list: chunk.join(',') })
      } catch (error) {
        warnings.push({ stage: 'product/get_item_base_info', message: error.message })
        continue
      }
      const baseItems = baseData.response?.item_list || []
      for (const item of baseItems) {
        const itemId = cleanText(item.item_id)
        const images = shopeeImages(item)
        const extraInfo = extraInfoMap.get(itemId) || null
        const promotionInfo = promotionMap.get(itemId) || { summary: [], model_map: new Map(), default_promotion: null, raw: null }
        const violationInfo = violationMap.get(itemId) || { summary: [], suggested_categories: [], deboost: 0, raw: null }
        const product = {
          item_id: itemId,
          product_name: cleanText(item.item_name),
          description: shopeeDescription(item),
          video_url: cleanText(item.video_info?.[0]?.video_url),
          images,
          category_id: cleanText(item.category_id),
          brand_name: shopeeBrandName(item),
          item_sku: cleanText(item.item_sku),
          item_status: cleanText(item.item_status || 'NORMAL'),
          weight: cleanText(item.weight),
          dimensions: item.dimension || item.package_dimension || null,
          attributes: Array.isArray(item.attribute_list) ? item.attribute_list : [],
          logistics: Array.isArray(item.logistic_info) ? item.logistic_info : [],
          promotion_summary: promotionInfo.summary,
          violation_summary: violationInfo.summary,
          suggested_categories: violationInfo.suggested_categories,
          deboost: violationInfo.deboost,
          extra_metrics: extraInfo ? {
            sale: Number(extraInfo.sale || 0) || 0,
            views: Number(extraInfo.views || 0) || 0,
            likes: Number(extraInfo.likes || 0) || 0,
            rating_star: Number(extraInfo.rating_star || 0) || 0,
            comment_count: Number(extraInfo.comment_count || 0) || 0
          } : {},
          raw_listing: {
            base_item: item,
            extra_info: extraInfo,
            promotion_info: promotionInfo.raw,
            violation_info: violationInfo.raw
          },
          variations: []
        }

        try {
          const modelData = await fetchShopeeJson(buildModelUrl, { item_id: itemId })
          const tiers = modelData.response?.tier_variation || []
          const models = modelData.response?.model || []
          for (const model of models) {
            const modelId = cleanText(model?.model_id)
            const modelPromotion = promotionInfo.model_map.get(modelId) || promotionInfo.default_promotion || null
            const price = Number(model?.price_info?.[0]?.original_price ?? model?.price_info?.[0]?.current_price ?? 0) || 0
            const currentPrice = Number(model?.price_info?.[0]?.current_price ?? 0) || 0
            product.variations.push({
              variation_name: shopeeModelName(tiers, model),
              sku: cleanText(model.model_sku) || `${itemId}_${model.model_id || product.variations.length + 1}`,
              model_id: modelId,
              price,
              discount_price: currentPrice && currentPrice !== price ? currentPrice : 0,
              stock: shopeeModelStock(model),
              variation_image: shopeeModelImage(tiers, model),
              promotion_type: cleanText(modelPromotion?.promotion_type),
              promotion_id: cleanText(modelPromotion?.promotion_id),
              promotion_staging: cleanText(modelPromotion?.promotion_staging),
              promotion_price: Number(modelPromotion?.promotion_price || 0) || 0,
              promotion_start_time: Number(modelPromotion?.start_time || 0) || 0,
              promotion_end_time: Number(modelPromotion?.end_time || 0) || 0,
              promotion_reserved_stock: Number(modelPromotion?.total_reserved_stock || 0) || 0
            })
          }
        } catch (error) {
          warnings.push({ item_id: itemId, stage: 'product/get_model_list', message: error.message })
        }

        if (!product.variations.length) {
          const defaultPromotion = promotionInfo.default_promotion || null
          product.variations.push({
            variation_name: 'Mac dinh',
            sku: cleanText(item.item_sku) || itemId,
            model_id: '',
            price: Number(item?.price_info?.[0]?.original_price ?? item?.price_info?.[0]?.current_price ?? 0) || 0,
            discount_price: 0,
            stock: Number(item?.stock_info_v2?.summary_info?.total_available_stock ?? 0) || 0,
            variation_image: '',
            promotion_type: cleanText(defaultPromotion?.promotion_type),
            promotion_id: cleanText(defaultPromotion?.promotion_id),
            promotion_staging: cleanText(defaultPromotion?.promotion_staging),
            promotion_price: Number(defaultPromotion?.promotion_price || 0) || 0,
            promotion_start_time: Number(defaultPromotion?.start_time || 0) || 0,
            promotion_end_time: Number(defaultPromotion?.end_time || 0) || 0,
            promotion_reserved_stock: Number(defaultPromotion?.total_reserved_stock || 0) || 0
          })
        }
        products.push(product)
      }
    }

    const stockFilter = filterInStockProducts(products, options)
    const syncProducts = stockFilter.products
    let knowledgeResult = { saved: 0, skipped: 0 }
    let catalogSnapshotResult = { saved: 0, skipped: 0 }
    if (syncProducts.length) {
      try {
        knowledgeResult = await saveProductKnowledgeBatch(env, {
          platform: 'shopee',
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
          platform: 'shopee',
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
        platform: 'shopee',
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
      synced_variations: result.synced || 0,
      auto_mapped: result.auto_mapped || 0,
      next_offset: itemPage.next_offset,
      has_more: itemPage.has_more,
      batch_limit: safeRunLimit,
      catalog_state: catalogStateCounts,
      warnings
    }
  }
  core.syncShopeeProductsShop = syncShopeeProductsShop
}
