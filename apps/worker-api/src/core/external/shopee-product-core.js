import { getShopeeProductClient } from '../../features/shopee/api/product.js'
import { listApiCapableShopCredentials } from '../marketplace/shop-capability-core.js'
import {
  cleanExternalText,
  EXTERNAL_ERROR_CODES,
  externalInt,
  externalNumber,
  ExternalApiError
} from './response-core.js'

const DEFAULT_ITEM_STATUSES = ['NORMAL']
const ALLOWED_ITEM_STATUSES = new Set([
  'NORMAL',
  'UNLIST',
  'BANNED',
  'REVIEWING',
  'SELLER_DELETE',
  'SHOPEE_DELETE'
])

function firstText(...values) {
  for (const value of values) {
    const text = cleanExternalText(value)
    if (text) return text
  }
  return ''
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (typeof value === 'boolean') return value
  const normalized = cleanExternalText(value).toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

function uniqueNonEmpty(values = []) {
  return [...new Set((values || []).map(value => cleanExternalText(value)).filter(Boolean))]
}

function normalizeStatuses(url) {
  const raw = [
    ...url.searchParams.getAll('item_status'),
    cleanExternalText(url.searchParams.get('statuses'))
  ]
    .flatMap(value => cleanExternalText(value).split(','))
    .map(value => cleanExternalText(value).toUpperCase())
    .filter(Boolean)
  const statuses = uniqueNonEmpty(raw).filter(value => ALLOWED_ITEM_STATUSES.has(value))
  return statuses.length ? statuses : DEFAULT_ITEM_STATUSES
}

function shopeeDescription(item = {}) {
  const fields = item?.description_info?.extended_description?.field_list || []
  const extended = fields
    .map(field => cleanExternalText(field?.text))
    .filter(Boolean)
    .join('\n')
  return extended || cleanExternalText(item?.description)
}

function shopeeImageUrls(payload = {}) {
  return uniqueNonEmpty(payload?.image_url_list || [])
}

function shopeeVideoInfo(item = {}) {
  return (Array.isArray(item?.video_info) ? item.video_info : [])
    .map(video => ({
      video_url: cleanExternalText(video?.video_url),
      thumbnail_url: cleanExternalText(video?.thumbnail_url),
      duration: externalInt(video?.duration, 0)
    }))
    .filter(video => video.video_url || video.thumbnail_url)
}

function shopeeBrand(item = {}) {
  return {
    brand_id: firstText(item?.brand?.brand_id),
    brand_name: firstText(item?.brand?.original_brand_name, item?.brand?.brand_name, item?.brand_name)
  }
}

function shopeeAttributes(item = {}) {
  return (Array.isArray(item?.attribute_list) ? item.attribute_list : []).map(attribute => ({
    attribute_id: firstText(attribute?.attribute_id),
    name: firstText(attribute?.original_attribute_name, attribute?.attribute_name),
    is_mandatory: Boolean(attribute?.is_mandatory),
    values: (Array.isArray(attribute?.attribute_value_list) ? attribute.attribute_value_list : []).map(value => ({
      value_id: firstText(value?.value_id),
      value_name: firstText(value?.original_value_name, value?.value_name),
      value_unit: cleanExternalText(value?.value_unit)
    }))
  }))
}

function shopeePriceInfo(priceInfo = []) {
  return (Array.isArray(priceInfo) ? priceInfo : []).map(entry => ({
    currency: cleanExternalText(entry?.currency),
    original_price: externalNumber(entry?.original_price, 0),
    current_price: externalNumber(entry?.current_price, 0),
    inflated_original_price: externalNumber(entry?.inflated_price_of_original_price, 0),
    inflated_current_price: externalNumber(entry?.inflated_price_of_current_price, 0),
    sip_item_price: externalNumber(entry?.sip_item_price, 0),
    local_price: externalNumber(entry?.local_price, 0),
    local_promotion_price: externalNumber(entry?.local_promotion_price, 0)
  }))
}

function shopeeModelImage(tiers = [], model = {}) {
  const indexes = Array.isArray(model?.tier_index) ? model.tier_index : []
  for (let index = 0; index < indexes.length; index += 1) {
    const option = tiers?.[index]?.option_list?.[indexes[index]]
    const imageUrl = cleanExternalText(option?.image?.image_url)
    if (imageUrl) return imageUrl
  }
  return ''
}

function shopeeModelName(tiers = [], model = {}) {
  const indexes = Array.isArray(model?.tier_index) ? model.tier_index : []
  const names = []
  for (let index = 0; index < indexes.length; index += 1) {
    const optionName = cleanExternalText(tiers?.[index]?.option_list?.[indexes[index]]?.option)
    if (optionName) names.push(optionName)
  }
  return names.join(' - ') || cleanExternalText(model?.model_name) || 'Mac dinh'
}

function shopeeModelStock(model = {}) {
  return externalNumber(
    model?.stock_info_v2?.summary_info?.total_available_stock ??
    model?.stock_info?.[0]?.normal_stock ??
    model?.normal_stock,
    0
  )
}

function shopeeModels(modelPayload = {}) {
  const tiers = Array.isArray(modelPayload?.tier_variation) ? modelPayload.tier_variation : []
  return (Array.isArray(modelPayload?.model) ? modelPayload.model : []).map(model => ({
    model_id: firstText(model?.model_id),
    model_sku: cleanExternalText(model?.model_sku),
    model_name: shopeeModelName(tiers, model),
    image_url: firstText(
      shopeeModelImage(tiers, model),
      model?.image?.image_url
    ),
    tier_index: Array.isArray(model?.tier_index) ? model.tier_index : [],
    status: cleanExternalText(model?.model_status),
    price_info: shopeePriceInfo(model?.price_info),
    stock_info: {
      total_available_stock: shopeeModelStock(model),
      total_reserved_stock: externalNumber(model?.stock_info_v2?.summary_info?.total_reserved_stock, 0)
    },
    weight: cleanExternalText(model?.weight),
    dimension: {
      package_height: externalInt(model?.dimension?.package_height, 0),
      package_length: externalInt(model?.dimension?.package_length, 0),
      package_width: externalInt(model?.dimension?.package_width, 0)
    }
  }))
}

function shopeePromptAssets(item = {}, models = []) {
  const images = uniqueNonEmpty([
    ...(item.images || []),
    ...(item.promotion_images || []),
    ...models.map(model => model.image_url)
  ])
  const videos = uniqueNonEmpty((item.videos || []).map(video => video.video_url))
  const videoThumbnails = uniqueNonEmpty((item.videos || []).map(video => video.thumbnail_url))
  const attributeTexts = (item.attributes || [])
    .map(attribute => {
      const values = (attribute.values || []).map(value => value.value_name).filter(Boolean).join(', ')
      return [attribute.name, values].filter(Boolean).join(': ')
    })
    .filter(Boolean)
  const modelTexts = (models || [])
    .map(model => [model.model_name, model.model_sku].filter(Boolean).join(' | '))
    .filter(Boolean)
  return {
    all_image_urls: images,
    all_video_urls: videos,
    all_video_thumbnail_urls: videoThumbnails,
    prompt_text: [
      item.item_name,
      item.description,
      ...attributeTexts,
      ...modelTexts
    ].filter(Boolean).join('\n')
  }
}

function wrapShopeeApiError(error, details = {}) {
  const shopee = error?.shopee || {}
  const code = cleanExternalText(shopee.code || details.code)
  const category = cleanExternalText(shopee.category || details.category)
  const message = cleanExternalText(error?.message || shopee.message || 'Shopee API lỗi')
  const status = category === 'permission_error' ? 403 : 502
  throw new ExternalApiError(
    category === 'permission_error' ? EXTERNAL_ERROR_CODES.FORBIDDEN : EXTERNAL_ERROR_CODES.INTERNAL_ERROR,
    message,
    status,
    {
      ...details,
      shopee_code: code,
      shopee_category: category,
      endpoint: cleanExternalText(shopee.endpoint),
      request_id: cleanExternalText(shopee.request_id)
    }
  )
}

export async function resolveShopeeApiShop(env, shopRef) {
  const needle = cleanExternalText(shopRef)
  if (!needle) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.VALIDATION_ERROR, 'Thiếu query shop cho Shopee API', 400)
  }
  const rows = await listApiCapableShopCredentials(env, {
    platform: 'shopee',
    shop: needle,
    maxShops: 20
  })
  const exact = rows.find(row => [row.shop_name, row.user_name, row.api_shop_id]
    .map(value => cleanExternalText(value).toLowerCase())
    .includes(needle.toLowerCase()))
  if (exact) return exact
  if (rows.length === 1) return rows[0]
  if (!rows.length) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.VALIDATION_ERROR,
      'Không tìm thấy shop Shopee API hợp lệ',
      404,
      { shop: needle }
    )
  }
  throw new ExternalApiError(
    EXTERNAL_ERROR_CODES.VALIDATION_ERROR,
    'Shop Shopee bị mơ hồ, cần truyền đúng shop_name hoặc user_name',
    400,
    {
      shop: needle,
      candidates: rows.slice(0, 10).map(row => ({
        shop_name: cleanExternalText(row.shop_name),
        user_name: cleanExternalText(row.user_name),
        api_shop_id: cleanExternalText(row.api_shop_id)
      }))
    }
  )
}

async function fetchItemIdsByStatus(client, status, limit, offset) {
  try {
    const data = await client.getItemList({
      offset,
      page_size: limit,
      item_status: status
    })
    const response = data?.response || {}
    return {
      items: Array.isArray(response.item) ? response.item : [],
      total: externalInt(response.total_count, 0),
      has_next_page: Boolean(response.has_next_page),
      next_offset: externalInt(response.next_offset, offset)
    }
  } catch (error) {
    wrapShopeeApiError(error, { stage: 'product/get_item_list', item_status: status })
  }
}

async function fetchBaseInfoByIds(client, itemIds) {
  const rows = []
  for (let index = 0; index < itemIds.length; index += 50) {
    const chunk = itemIds.slice(index, index + 50)
    try {
      const data = await client.getItemBaseInfo({
        item_id_list: chunk.join(',')
      })
      rows.push(...(Array.isArray(data?.response?.item_list) ? data.response.item_list : []))
    } catch (error) {
      wrapShopeeApiError(error, { stage: 'product/get_item_base_info', item_ids: chunk })
    }
  }
  return rows
}

async function fetchExtraInfoMap(client, itemIds, enabled) {
  const result = new Map()
  if (!enabled) return result
  for (let index = 0; index < itemIds.length; index += 50) {
    const chunk = itemIds.slice(index, index + 50)
    try {
      const data = await client.getItemExtraInfo({
        item_id_list: chunk.join(',')
      })
      for (const row of data?.response?.item_list || []) {
        result.set(firstText(row?.item_id), row)
      }
    } catch (error) {
      wrapShopeeApiError(error, { stage: 'product/get_item_extra_info', item_ids: chunk })
    }
  }
  return result
}

async function fetchModelMap(client, items = []) {
  const result = new Map()
  for (const item of items) {
    const itemId = firstText(item?.item_id)
    if (!itemId || !item?.has_model) continue
    try {
      const data = await client.getModelList({ item_id: itemId })
      result.set(itemId, data?.response || {})
    } catch (error) {
      wrapShopeeApiError(error, { stage: 'product/get_model_list', item_id: itemId })
    }
  }
  return result
}

function normalizeFullItem(item = {}, modelPayload = {}, extra = {}) {
  const images = shopeeImageUrls(item?.image || {})
  const promotionImages = shopeeImageUrls(item?.promotion_image || {})
  const videos = shopeeVideoInfo(item)
  const models = shopeeModels(modelPayload)
  const normalized = {
    item_id: firstText(item?.item_id),
    item_status: cleanExternalText(item?.item_status),
    item_name: cleanExternalText(item?.item_name),
    description: shopeeDescription(item),
    item_sku: cleanExternalText(item?.item_sku),
    category_id: firstText(item?.category_id),
    brand: shopeeBrand(item),
    attributes: shopeeAttributes(item),
    images,
    promotion_images: promotionImages,
    videos,
    size_chart: cleanExternalText(item?.size_chart),
    size_chart_id: firstText(item?.size_chart_id),
    has_model: Boolean(item?.has_model),
    weight: cleanExternalText(item?.weight),
    dimension: {
      package_length: externalInt(item?.dimension?.package_length, 0),
      package_width: externalInt(item?.dimension?.package_width, 0),
      package_height: externalInt(item?.dimension?.package_height, 0)
    },
    price_info: shopeePriceInfo(item?.price_info),
    models,
    metrics: {
      sale: externalInt(extra?.sale, 0),
      views: externalInt(extra?.views, 0),
      likes: externalInt(extra?.likes, 0),
      rating_star: externalNumber(extra?.rating_star, 0),
      comment_count: externalInt(extra?.comment_count, 0)
    },
    updated_at: externalInt(item?.update_time, 0),
    created_at: externalInt(item?.create_time, 0)
  }
  return {
    ...normalized,
    prompt_assets: shopeePromptAssets(normalized, models)
  }
}

export async function listExternalShopeeFullProducts(env, url) {
  const shop = await resolveShopeeApiShop(env, url.searchParams.get('shop'))
  const statuses = normalizeStatuses(url)
  if (statuses.length !== 1) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.VALIDATION_ERROR,
      'API hiện chỉ hỗ trợ 1 item_status mỗi request để giữ phân trang ổn định',
      400,
      { statuses }
    )
  }
  const itemStatus = statuses[0]
  const limit = Math.min(Math.max(externalInt(url.searchParams.get('limit'), 20), 1), 100)
  const offset = Math.max(externalInt(url.searchParams.get('offset'), 0), 0)
  const includeMetrics = parseBoolean(url.searchParams.get('include_metrics'), true)
  const client = getShopeeProductClient(env, { shopRow: shop })
  const listPage = await fetchItemIdsByStatus(client, itemStatus, limit, offset)
  const itemIds = uniqueNonEmpty((listPage.items || []).map(row => row.item_id))
  const baseRows = await fetchBaseInfoByIds(client, itemIds)
  const extraInfoMap = await fetchExtraInfoMap(client, itemIds, includeMetrics)
  const modelMap = await fetchModelMap(client, baseRows)
  const items = baseRows.map(row => normalizeFullItem(
    row,
    modelMap.get(firstText(row?.item_id)) || {},
    extraInfoMap.get(firstText(row?.item_id)) || {}
  ))
  return {
    shop: {
      platform: 'shopee',
      shop_name: cleanExternalText(shop.shop_name),
      user_name: cleanExternalText(shop.user_name),
      api_shop_id: cleanExternalText(shop.api_shop_id)
    },
    item_status: itemStatus,
    items,
    pagination: {
      offset,
      limit,
      total: listPage.total,
      returned: items.length,
      has_next_page: Boolean(listPage.has_next_page),
      next_offset: listPage.has_next_page ? listPage.next_offset : null
    }
  }
}

export async function getExternalShopeeFullProductByItemId(env, shopRef, itemId, options = {}) {
  const shop = await resolveShopeeApiShop(env, shopRef)
  const includeMetrics = parseBoolean(options.include_metrics, true)
  const client = getShopeeProductClient(env, { shopRow: shop })
  const cleanItemId = firstText(itemId)
  if (!cleanItemId) {
    throw new ExternalApiError(EXTERNAL_ERROR_CODES.VALIDATION_ERROR, 'Thiếu item_id Shopee', 400)
  }
  const [baseRows, extraInfoMap] = await Promise.all([
    fetchBaseInfoByIds(client, [cleanItemId]),
    fetchExtraInfoMap(client, [cleanItemId], includeMetrics)
  ])
  const baseRow = baseRows.find(row => firstText(row?.item_id) === cleanItemId)
  if (!baseRow) {
    throw new ExternalApiError(
      EXTERNAL_ERROR_CODES.PRODUCT_NOT_FOUND,
      'Không tìm thấy item Shopee',
      404,
      { shop: cleanExternalText(shop.user_name || shop.shop_name), item_id: cleanItemId }
    )
  }
  const modelMap = await fetchModelMap(client, [baseRow])
  return {
    shop: {
      platform: 'shopee',
      shop_name: cleanExternalText(shop.shop_name),
      user_name: cleanExternalText(shop.user_name),
      api_shop_id: cleanExternalText(shop.api_shop_id)
    },
    item: normalizeFullItem(
      baseRow,
      modelMap.get(cleanItemId) || {},
      extraInfoMap.get(cleanItemId) || {}
    )
  }
}
