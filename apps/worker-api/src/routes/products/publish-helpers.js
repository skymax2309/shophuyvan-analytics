import { parseMappedSkuItems } from '../../core/sku-identity-core.js'
import { cleanProductText } from './marketplace-preview.js'

export async function ensurePublishDraftTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS product_publish_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      source_variation_ids TEXT,
      target_platforms TEXT,
      status TEXT DEFAULT 'draft',
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
}

export function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

export function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function asCleanArray(value) {
  const raw = parseJsonValue(value, value)
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\n,|]+/)
  return [...new Set(list.map(cleanProductText).filter(Boolean).filter(v => !['undefined', 'null'].includes(v.toLowerCase())))]
}

export function firstCleanProductText(...values) {
  for (const value of values) {
    const text = cleanProductText(value)
    if (text) return text
  }
  return ''
}

export function asPublishObject(value, fallback = {}) {
  const raw = parseJsonValue(value, value)
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : fallback
}

export function asPublishArray(value) {
  const raw = parseJsonValue(value, value)
  if (Array.isArray(raw)) return raw.filter(item => item !== null && item !== undefined && item !== '')
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([, itemValue]) => itemValue !== null && itemValue !== undefined && itemValue !== '')
      .map(([name, itemValue]) => ({ name, value: itemValue }))
  }
  return String(raw || '')
    .split(/\n+/)
    .map(line => cleanProductText(line))
    .filter(Boolean)
    .map(line => {
      const [name, ...valueParts] = line.split(':')
      return valueParts.length
        ? { name: cleanProductText(name), value: cleanProductText(valueParts.join(':')) }
        : { name: line, value: '' }
    })
}

export function publishArrayCount(value) {
  return asPublishArray(value).filter(item => {
    if (item && typeof item === 'object') {
      return Object.values(item).some(field => cleanProductText(field))
    }
    return cleanProductText(item)
  }).length
}

export function firstPublishArray(...values) {
  for (const value of values) {
    const list = asPublishArray(value)
    if (publishArrayCount(list) > 0) return list
  }
  return []
}

export function publishPositiveNumber(...values) {
  for (const value of values) {
    const number = asNumber(value)
    if (number > 0) return number
  }
  return 0
}

export function normalizePublishDimensions(...values) {
  for (const value of values) {
    const raw = asPublishObject(value, null)
    if (!raw) continue
    const length = publishPositiveNumber(raw.length, raw.package_length, raw.length_cm, raw.l)
    const width = publishPositiveNumber(raw.width, raw.package_width, raw.width_cm, raw.w)
    const height = publishPositiveNumber(raw.height, raw.package_height, raw.height_cm, raw.h)
    if (length || width || height) return { length_cm: length, width_cm: width, height_cm: height }
  }
  return { length_cm: 0, width_cm: 0, height_cm: 0 }
}

export async function productRouteTableExists(env, tableName) {
  const row = await env.DB.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).bind(tableName).first()
  return Boolean(row?.name)
}

export function normalizePublishShopDetails(value) {
  const raw = parseJsonValue(value, value)
  const list = Array.isArray(raw) ? raw : []
  const normalized = []
  for (const item of list) {
    if (item && typeof item === 'object') {
      const platform = cleanProductText(item.platform || item.source_platform || item.target_platform).toLowerCase()
      const shop = cleanProductText(item.shop || item.shop_name || item.source_shop || item.target_shop)
      if (platform && shop) normalized.push({ platform, shop })
      continue
    }
    const text = cleanProductText(item)
    if (!text) continue
    const [platform, ...shopParts] = text.includes('|') ? text.split('|') : text.split(':')
    const shop = cleanProductText(shopParts.join(text.includes('|') ? '|' : ':') || text)
    const platformText = shopParts.length ? cleanProductText(platform).toLowerCase() : ''
    if (shop) normalized.push({ platform: platformText, shop })
  }
  const seen = new Set()
  return normalized.filter(item => {
    const key = `${item.platform}|${item.shop}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizePublishListingDetails(value) {
  const raw = parseJsonValue(value, value)
  const list = Array.isArray(raw) ? raw : []
  const normalized = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const platform = cleanProductText(item.platform || item.source_platform).toLowerCase()
    const shop = cleanProductText(item.shop || item.shop_name || item.source_shop)
    const itemId = cleanProductText(item.item_id || item.source_item_id)
    const title = cleanProductText(item.title)
    if (platform && shop && (itemId || title)) {
      normalized.push({ platform, shop, item_id: itemId, title })
    }
  }
  const seen = new Set()
  return normalized.filter(item => {
    const key = `${item.platform}|${item.shop}|${item.item_id || item.title}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizePublishShopNames(value) {
  const raw = parseJsonValue(value, value)
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\n,]+/)
  return [...new Set(list.map(item => {
    if (item && typeof item === 'object') return cleanProductText(item.shop || item.shop_name || '')
    return cleanProductText(item)
  }).filter(Boolean))]
}

export function hasPhoneLikeText(value) {
  return /(0|\+84)[0-9\s.\-]{8,12}/.test(String(value || ''))
}

export async function fetchPublishRows(env, ids) {
  const placeholders = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, platform_item_id, product_name, variation_name,
           platform_sku, internal_sku, mapped_items, image_url, price,
           discount_price, stock, map_status
    FROM product_variations
    WHERE id IN (${placeholders})
    ORDER BY product_name, variation_name
  `).bind(...ids).all()
  return results || []
}

export async function fetchDraftConfigMap(env, rows) {
  const keys = [...new Set(rows
    .map(row => `draft_${cleanProductText(row.platform || 'shopee')}_${cleanProductText(row.platform_item_id)}`)
    .filter(key => !key.endsWith('_')))]
  if (!keys.length) return {}

  const placeholders = keys.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT key, value FROM app_config WHERE key IN (${placeholders})
  `).bind(...keys).all()

  const map = {}
  for (const row of results || []) {
    map[row.key] = parseJsonValue(row.value, {})
  }
  return map
}

export async function fetchProductMap(env, rows) {
  const skus = new Set()
  for (const row of rows) {
    if (cleanProductText(row.internal_sku)) skus.add(cleanProductText(row.internal_sku))
    for (const item of parseMappedSkuItems(row.mapped_items, row.internal_sku)) {
      if (item.sku) skus.add(item.sku)
    }
  }
  const list = [...skus]
  if (!list.length) return {}

  const placeholders = list.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT sku, product_name, description, video_url, images, image_url,
           cost_invoice, cost_real, stock, stock_main, stock_sub,
           parent_sku, is_parent
    FROM products
    WHERE sku IN (${placeholders})
  `).bind(...list).all()

  const map = {}
  for (const row of results || []) map[cleanProductText(row.sku)] = row
  return map
}

export async function fetchPublishKnowledgeMap(env, rows) {
  const itemIds = [...new Set(rows.map(row => cleanProductText(row.platform_item_id)).filter(Boolean))]
  if (!itemIds.length || !(await productRouteTableExists(env, 'marketplace_product_knowledge'))) return {}

  const placeholders = itemIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, shop_id, platform_item_id, product_name, description, video_url,
           images, category_id, brand_name, item_sku, weight, dimensions, attributes,
           logistics, variations, promotion_summary, violation_summary, suggested_categories,
           deboost, raw_listing, source, updated_at
    FROM marketplace_product_knowledge
    WHERE platform_item_id IN (${placeholders})
  `).bind(...itemIds).all()

  const exact = new Map()
  const platformItem = new Map()
  const itemOnly = new Map()
  for (const row of results || []) {
    const platform = cleanProductText(row.platform).toLowerCase()
    const shop = cleanProductText(row.shop)
    const itemId = cleanProductText(row.platform_item_id)
    if (!itemId) continue
    if (platform && shop) exact.set(`${platform}|${shop}|${itemId}`, row)
    if (platform) platformItem.set(`${platform}|${itemId}`, row)
    if (!itemOnly.has(itemId)) itemOnly.set(itemId, row)
  }
  return { exact, platformItem, itemOnly }
}

export function getPublishKnowledgeForGroup(knowledgeMap, group) {
  const platform = cleanProductText(group.source_platform).toLowerCase()
  const shop = cleanProductText(group.source_shop)
  const itemId = cleanProductText(group.source_item_id)
  return knowledgeMap?.exact?.get(`${platform}|${shop}|${itemId}`)
    || knowledgeMap?.platformItem?.get(`${platform}|${itemId}`)
    || knowledgeMap?.itemOnly?.get(itemId)
    || {}
}

export function buildPublishItems(rows) {
  return rows.map(row => ({
      id: row.id,
      source_platform: row.platform,
      source_shop: row.shop,
      source_item_id: row.platform_item_id,
      product_name: row.product_name,
      variation_name: row.variation_name,
      platform_sku: row.platform_sku,
      internal_sku: row.internal_sku,
      mapped_items: row.mapped_items,
      image_url: row.image_url,
      price: row.price,
      discount_price: row.discount_price,
      stock: row.stock,
      map_status: row.map_status
  }))
}

export function makeListingGroupKey(row) {
  const platform = cleanProductText(row.platform || 'unknown')
  const shop = cleanProductText(row.shop || 'unknown')
  const itemId = cleanProductText(row.platform_item_id || row.product_name || row.id)
  return `${platform}|${shop}|${itemId}`
}

export function buildPublishListings(rows, draftMap, productMap, knowledgeMap = {}, overrides = {}) {
  const groups = new Map()
  for (const row of rows) {
    const key = makeListingGroupKey(row)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        source_platform: cleanProductText(row.platform || ''),
        source_shop: cleanProductText(row.shop || ''),
        source_item_id: cleanProductText(row.platform_item_id || ''),
        title: cleanProductText(row.product_name || ''),
        variations: []
      })
    }
    groups.get(key).variations.push(row)
  }

  const overrideImages = asCleanArray(overrides.images)
  const listings = []
  for (const group of groups.values()) {
    const draftKey = `draft_${group.source_platform || 'shopee'}_${group.source_item_id}`
    const draft = draftMap[draftKey] || {}
    const knowledge = getPublishKnowledgeForGroup(knowledgeMap, group)
    const rawListing = asPublishObject(knowledge.raw_listing, {})
    const relatedProducts = group.variations
      .flatMap(row => parseMappedSkuItems(row.mapped_items, row.internal_sku).map(item => productMap[item.sku]).filter(Boolean))
    const firstProductWithText = relatedProducts.find(item => cleanProductText(item?.description)) || {}
    const firstProductWithVideo = relatedProducts.find(item => cleanProductText(item?.video_url)) || {}

    const sourceImages = [
      ...asCleanArray(draft.images),
      ...asCleanArray(knowledge.images),
      ...asCleanArray(rawListing.images),
      ...group.variations.map(row => row.image_url),
      ...relatedProducts.flatMap(product => asCleanArray(product?.images)),
      ...relatedProducts.map(product => product?.image_url)
    ]
    const images = overrideImages.length ? overrideImages : asCleanArray(sourceImages)
    const description = firstCleanProductText(overrides.description, draft.description, knowledge.description, rawListing.description, firstProductWithText.description)
    const videoUrl = firstCleanProductText(overrides.video_url, draft.video_url, knowledge.video_url, rawListing.video_url, firstProductWithVideo.video_url)
    const title = firstCleanProductText(overrides.title, draft.title, draft.product_name, knowledge.product_name, group.title)
    const sourceCategory = firstCleanProductText(draft.category_name, draft.category_id, knowledge.category_id, rawListing.category_id)
    const categoryName = firstCleanProductText(overrides.category_name, sourceCategory)
    const brandName = firstCleanProductText(overrides.brand_name, draft.brand_name, knowledge.brand_name, rawListing.brand_name, 'No Brand')
    const attributes = firstPublishArray(overrides.attributes, draft.attributes, knowledge.attributes, rawListing.attributes, rawListing.attribute_list)
    const logistics = firstPublishArray(draft.logistics, knowledge.logistics, rawListing.logistics, rawListing.logistic_info)
    const sourceDimensions = normalizePublishDimensions(draft.dimensions, knowledge.dimensions, rawListing.dimensions, rawListing.dimension, rawListing.package_dimension)
    const logisticsWeightKg = publishPositiveNumber(overrides.weight_kg, draft.weight, knowledge.weight, rawListing.weight)
    const lengthCm = publishPositiveNumber(overrides.length_cm, sourceDimensions.length_cm)
    const widthCm = publishPositiveNumber(overrides.width_cm, sourceDimensions.width_cm)
    const heightCm = publishPositiveNumber(overrides.height_cm, sourceDimensions.height_cm)

    const variations = group.variations.map(row => {
      const components = parseMappedSkuItems(row.mapped_items, row.internal_sku)
      const internal = productMap[cleanProductText(row.internal_sku)] || productMap[components[0]?.sku] || {}
      return {
        id: row.id,
        name: cleanProductText(row.variation_name || 'Mặc định'),
        platform_sku: cleanProductText(row.platform_sku),
        internal_sku: cleanProductText(row.internal_sku),
        mapped_items: components,
        image_url: cleanProductText(row.image_url || internal.image_url),
        price: asNumber(row.price),
        discount_price: asNumber(row.discount_price),
        stock: asNumber(row.stock),
        cost_invoice: asNumber(internal.cost_invoice),
        cost_real: asNumber(internal.cost_real),
        map_status: cleanProductText(row.map_status)
      }
    })

    const prices = variations.map(item => item.discount_price || item.price).filter(Boolean)
    const totalStock = variations.reduce((sum, item) => sum + asNumber(item.stock), 0)
    const warnings = []
    if (!description) warnings.push('Thiếu mô tả bài đăng')
    if (!images.length) warnings.push('Thiếu ảnh bài đăng')
    if (images.length > 0 && images.length < 3) warnings.push('Ảnh bài đăng còn ít, nên bổ sung thêm ảnh thật trước khi gửi sàn')
    if (!videoUrl) warnings.push('Chưa có video bài đăng')
    if (!categoryName) warnings.push('Chưa chọn ngành hàng')
    if (!publishArrayCount(attributes)) warnings.push('Thiếu thuộc tính ngành hàng')
    if (!logisticsWeightKg) warnings.push('Thiếu khối lượng đóng gói')
    if (!lengthCm || !widthCm || !heightCm) warnings.push('Thiếu kích thước đóng gói dài/rộng/cao')
    if (hasPhoneLikeText(`${title} ${description}`)) warnings.push('Có thể chứa số điện thoại trong tên/mô tả')

    listings.push({
      source_platform: group.source_platform,
      source_shop: group.source_shop,
      source_item_id: group.source_item_id,
      title,
      description,
      video_url: videoUrl,
      images,
      category: {
        source_category: sourceCategory,
        source_category_id: firstCleanProductText(draft.category_id, knowledge.category_id, rawListing.category_id),
        target_category: categoryName
      },
      brand: brandName,
      attributes,
      logistics: {
        weight_kg: logisticsWeightKg,
        length_cm: lengthCm,
        width_cm: widthCm,
        height_cm: heightCm,
        source_logistics: logistics
      },
      pricing: {
        currency: 'VND',
        min_price: prices.length ? Math.min(...prices) : 0,
        max_price: prices.length ? Math.max(...prices) : 0
      },
      stock: {
        total: totalStock,
        source: 'oms/api-or-browser-sync'
      },
      variations,
      media_status: {
        image_count: images.length,
        has_video: Boolean(videoUrl),
        video_url: videoUrl
      },
      source_snapshot: {
        has_app_config_draft: Object.keys(draft).length > 0,
        has_product_knowledge: Object.keys(knowledge).length > 0,
        knowledge_updated_at: cleanProductText(knowledge.updated_at),
        source: firstCleanProductText(knowledge.source, 'app_config_or_products')
      },
      completeness: {
        has_title: Boolean(title),
        has_description: Boolean(description),
        image_count: images.length,
        has_video: Boolean(videoUrl),
        has_category: Boolean(categoryName),
        has_brand: Boolean(brandName),
        attributes_count: publishArrayCount(attributes),
        has_weight: Boolean(logisticsWeightKg),
        has_dimensions: Boolean(lengthCm && widthCm && heightCm)
      },
      validation: {
        ready_to_publish: warnings.length === 0,
        warnings
      }
    })
  }
  return listings
}

export function clampPublishText(value, maxLength) {
  const text = cleanProductText(value)
  if (!maxLength || text.length <= maxLength) return text
  return text.slice(0, Math.max(0, maxLength - 3)).trim() + '...'
}

export function getGeminiPublishKeys(env) {
  return [
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY_4,
    env.GEMINI_API_KEY_5
  ].filter(Boolean)
}
