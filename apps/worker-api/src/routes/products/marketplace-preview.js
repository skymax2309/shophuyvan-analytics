import { ensureInventoryStockColumns } from '../../core/inventory/stock-core.js'
import { listMarketplaceApiIdentityKeys, listMarketplaceShopCapabilities } from '../../core/marketplace/shop-capability-core.js'
import { getProductCatalogSettings, saveProductActionLog } from '../../core/products/catalog-core.js'
import { parseMappedSkuItems } from '../../core/products/sku-identity-core.js'

export function cleanProductText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function productStockNumber(value) {
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

export function productBooleanOption(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (typeof value === 'boolean') return value
  const normalized = cleanProductText(value).toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  return defaultValue
}

export function filterProductPayloadByStock(products = []) {
  const stats = {
    skipped_products: 0,
    skipped_zero_stock_variations: 0
  }
  const filtered = []

  for (const product of Array.isArray(products) ? products : []) {
    const variations = Array.isArray(product?.variations) ? product.variations : []
    const inStockVariations = variations
      .map(variation => ({
        ...variation,
        stock: productStockNumber(variation?.stock)
      }))
      .filter(variation => variation.stock > 0)

    stats.skipped_zero_stock_variations += Math.max(0, variations.length - inStockVariations.length)
    if (!inStockVariations.length) {
      stats.skipped_products += 1
      continue
    }
    filtered.push({ ...product, variations: inStockVariations })
  }

  return { products: filtered, stats }
}

export function filterVariationPayloadByStock(variations = []) {
  const stats = { skipped_zero_stock_variations: 0 }
  const filtered = []

  for (const variation of Array.isArray(variations) ? variations : []) {
    const stock = productStockNumber(variation?.stock)
    if (stock <= 0) {
      stats.skipped_zero_stock_variations += 1
      continue
    }
    filtered.push({ ...variation, stock })
  }

  return { variations: filtered, stats }
}

export function parseProductJson(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function lowerProductText(value) {
  return cleanProductText(value).toLowerCase()
}

export async function getExistingProductRow(env, sku) {
  if (!cleanProductText(sku)) return null
  return env.DB.prepare(`
    SELECT sku, stock, stock_main, stock_sub
    FROM products
    WHERE sku = ?
  `).bind(sku).first()
}

export function hasManualStockDelta(existingRow, payload = {}) {
  const nextStock = {
    stock: payload.stock,
    stock_main: payload.stock_main,
    stock_sub: payload.stock_sub
  }
  const hasStockField = ['stock', 'stock_main', 'stock_sub'].some(key => payload[key] !== undefined)
  if (!hasStockField) return false

  const currentStock = {
    stock: productStockNumber(existingRow?.stock),
    stock_main: productStockNumber(existingRow?.stock_main),
    stock_sub: productStockNumber(existingRow?.stock_sub)
  }

  return ['stock', 'stock_main', 'stock_sub'].some(key => {
    if (nextStock[key] === undefined) return false
    return productStockNumber(nextStock[key]) !== currentStock[key]
  })
}

export async function ensureInventoryMovementTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      platform TEXT,
      shop TEXT,
      sku TEXT NOT NULL,
      warehouse_source TEXT NOT NULL DEFAULT 'main',
      qty_delta INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      order_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements(sku, warehouse_source)`).run()
}

export async function getInventoryMovementAdjustments(env) {
  try {
    await ensureInventoryMovementTables(env)
    const { results } = await env.DB.prepare(`
      SELECT sku, warehouse_source, COALESCE(SUM(qty_delta), 0) AS qty_delta
      FROM inventory_movements
      GROUP BY sku, warehouse_source
    `).all()
    const map = {}
    for (const row of results || []) {
      map[`${row.sku}|${row.warehouse_source || 'main'}`] = Number(row.qty_delta || 0)
    }
    return map
  } catch (error) {
    console.error('[PRODUCT_STOCK_ADJUSTMENTS]', error.message)
    return {}
  }
}

export async function getApiManagedShopKeys(env) {
  try {
    return await listMarketplaceApiIdentityKeys(env)
  } catch (error) {
    console.error('[PRODUCT_API_SHOPS]', error.message)
    return new Set()
  }
}

export function previewActionStatusLabel(actionType, canSendNow) {
  if (canSendNow) return `${actionType}_ready`
  return `${actionType}_preview_only`
}

export async function addProductColumnIfMissing(env, table, definition) {
  const columnName = cleanProductText(definition).split(/\s+/)[0]
  if (!table || !columnName) return
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all().catch(() => ({ results: [] }))
  const exists = (info.results || []).some(row => cleanProductText(row.name).toLowerCase() === columnName.toLowerCase())
  if (!exists) {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run()
  }
}

export async function ensureProductVariationWriteColumns(env) {
  await addProductColumnIfMissing(env, 'product_variations', "model_id TEXT DEFAULT ''")
  await ensureInventoryStockColumns(env)
}

export async function previewMarketplaceWriteAction(env, payload = {}) {
  const platform = cleanProductText(payload.platform).toLowerCase()
  const shop = cleanProductText(payload.shop || payload.user_name)
  const actionType = cleanProductText(payload.action_type || payload.actionType || 'update_price').toLowerCase()
  const settings = await getProductCatalogSettings(env)
  const previewLimit = Math.min(Math.max(Number(settings.price_push_preview_limit || 50) || 50, 1), 200)
  const requestedItems = Array.isArray(payload.items) ? payload.items.slice(0, previewLimit) : []
  if (!platform || !shop) throw new Error('Thiếu sàn hoặc shop để xem trước lệnh ghi dữ liệu')
  if (!requestedItems.length) throw new Error('Chưa có SKU nào để xem trước')

  const platformSkus = [...new Set(requestedItems.map(item => cleanProductText(item.platform_sku || item.sku)).filter(Boolean))]
  if (!platformSkus.length) throw new Error('Thiếu SKU sàn để xem trước')

  const placeholders = platformSkus.map(() => '?').join(',')
  const variationRows = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, platform_sku, internal_sku, mapped_items, price, discount_price, stock
    FROM product_variations
    WHERE platform = ? AND shop = ? AND platform_sku IN (${placeholders})
  `).bind(platform, shop, ...platformSkus).all()

  const skuRows = variationRows.results || []
  const mappedSkuSet = new Set()
  for (const row of skuRows) {
    for (const item of parseMappedSkuItems(row.mapped_items, row.internal_sku)) {
      if (item.sku) mappedSkuSet.add(item.sku)
    }
  }

  const mappedSkuList = [...mappedSkuSet]
  const productMap = new Map()
  if (mappedSkuList.length) {
    const productRows = await env.DB.prepare(`
      SELECT sku, product_name, cost_invoice, cost_real, min_stock, stock, stock_main, stock_sub
      FROM products
      WHERE sku IN (${mappedSkuList.map(() => '?').join(',')})
    `).bind(...mappedSkuList).all()
    for (const row of productRows.results || []) {
      productMap.set(cleanProductText(row.sku), row)
    }
  }

  const variationMap = new Map(skuRows.map(row => [cleanProductText(row.platform_sku), row]))
  const minimumMargin = Math.max(0, Number(settings.minimum_profit_margin_percent || 0) || 0)
  const enforceCostGuard = Number(settings.enforce_cost_price_guard || 0) === 1
  const rows = []

  for (const item of requestedItems) {
    const platformSku = cleanProductText(item.platform_sku || item.sku)
    if (!platformSku) continue
    const variation = variationMap.get(platformSku)
    const mappedItems = parseMappedSkuItems(variation?.mapped_items, variation?.internal_sku)
    const internalSku = cleanProductText(mappedItems[0]?.sku || variation?.internal_sku)
    const internalProduct = productMap.get(internalSku) || {}
    const costBase = Math.max(productStockNumber(internalProduct.cost_real), productStockNumber(internalProduct.cost_invoice))
    const currentPrice = productStockNumber(variation?.discount_price || variation?.price)
    const currentStock = productStockNumber(variation?.stock)
    const proposedPrice = productStockNumber(item.original_price ?? item.price ?? item.proposed_price)
    const proposedStock = productStockNumber(item.stock ?? item.proposed_stock)
    const guardPrice = costBase > 0 ? Math.ceil(costBase * (1 + minimumMargin / 100)) : 0
    const warnings = []

    let canSendNow = false
    if (actionType === 'update_price') {
      if (!Number(settings.marketplace_price_push_enabled || 0)) {
        warnings.push('Công tắc đẩy giá lên sàn đang tắt. Hiện chỉ xem trước, chưa gửi lệnh thật.')
      } else {
        canSendNow = true
      }
      if (enforceCostGuard && guardPrice > 0 && proposedPrice > 0 && proposedPrice < guardPrice) {
        canSendNow = false
        warnings.push(`Giá đề xuất thấp hơn giá bảo vệ ${guardPrice.toLocaleString('vi-VN')}đ.`)
      }
      if (!variation) warnings.push('SKU sàn chưa có trong bảng product_variations nên chưa thể gửi giá thật.')
    } else {
      if (!Number(settings.marketplace_stock_push_enabled || 0)) {
        warnings.push('Công tắc đẩy tồn lên sàn đang tắt. Hiện chỉ xem trước, chưa gửi lệnh thật.')
      } else {
        canSendNow = true
      }
      if (cleanProductText(settings.external_inventory_mode) === 'reference_only') {
        canSendNow = false
        warnings.push(`Kho thật đang tham chiếu ${settings.external_inventory_owner || 'hệ thống ngoài'}, nên chưa cho đẩy tồn thật lên sàn.`)
      }
      if (!variation) warnings.push('SKU sàn chưa có trong bảng product_variations nên chưa thể gửi tồn thật.')
    }

    rows.push({
      platform,
      shop,
      action_type: actionType,
      platform_sku: platformSku,
      platform_item_id: cleanProductText(variation?.platform_item_id),
      internal_sku: internalSku,
      internal_product_name: cleanProductText(internalProduct.product_name),
      current_price: currentPrice,
      proposed_price: proposedPrice,
      current_stock: currentStock,
      proposed_stock: proposedStock,
      cost_base: costBase,
      guard_price: guardPrice,
      status: previewActionStatusLabel(actionType, canSendNow),
      can_send_now: canSendNow ? 1 : 0,
      warnings
    })
  }

  await saveProductActionLog(env, {
    platform,
    shop,
    action_type: actionType,
    action_scope: 'preview',
    action_status: 'preview',
    request_payload: payload,
    preview_payload: {
      total_rows: rows.length,
      ready_rows: rows.filter(row => row.can_send_now).length,
      blocked_rows: rows.filter(row => !row.can_send_now).length
    },
    note: `Xem trước ${actionType} cho ${shop}`
  })

  return {
    status: 'ok',
    settings,
    summary: {
      total_rows: rows.length,
      ready_rows: rows.filter(row => row.can_send_now).length,
      blocked_rows: rows.filter(row => !row.can_send_now).length,
      action_type: actionType
    },
    rows
  }
}

export function listingActionLabel(actionType) {
  const key = cleanProductText(actionType).toLowerCase()
  if (key === 'update_item') return 'Sửa bài đăng'
  if (key === 'unlist_item') return 'Ẩn bài đăng'
  if (key === 'delete_item') return 'Xóa bài đăng'
  if (key === 'add_model') return 'Thêm model'
  if (key === 'update_model') return 'Sửa model'
  if (key === 'delete_model') return 'Xóa model'
  return 'Lệnh bài đăng'
}

export function normalizeListingActionType(value) {
  const key = cleanProductText(value).toLowerCase()
  const supported = new Set(['update_item', 'unlist_item', 'delete_item', 'add_model', 'update_model', 'delete_model'])
  return supported.has(key) ? key : 'update_item'
}

export function safeListingNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function exactShopMatch(row = {}, shop = '') {
  const target = lowerProductText(shop)
  if (!target) return false
  return [
    row.shop_name,
    row.shop,
    row.user_name,
    row.api_shop_id
  ].some(value => lowerProductText(value) === target)
}

export function parseListingVariationRows(value) {
  const rows = parseProductJson(value, [])
  return Array.isArray(rows) ? rows : []
}

export function pickListingVariation(variations = [], item = {}) {
  const lookupKeys = [
    cleanProductText(item.model_id),
    cleanProductText(item.platform_sku),
    cleanProductText(item.sku)
  ].filter(Boolean)
  if (!lookupKeys.length) return null
  return variations.find(variation => lookupKeys.some(key => (
    cleanProductText(variation.model_id) === key ||
    cleanProductText(variation.platform_sku) === key ||
    cleanProductText(variation.sku) === key
  ))) || null
}

export function listingPreviewSummaryRows(rows = []) {
  return {
    total_rows: rows.length,
    ready_rows: rows.filter(row => row.can_send_now).length,
    blocked_rows: rows.filter(row => !row.can_send_now).length
  }
}

export async function previewMarketplaceListingAction(env, payload = {}) {
  const platform = cleanProductText(payload.platform).toLowerCase()
  const shop = cleanProductText(payload.shop || payload.user_name)
  const actionType = normalizeListingActionType(payload.action_type || payload.actionType)
  const previewLimit = 50
  const requestedItems = Array.isArray(payload.items) ? payload.items.slice(0, previewLimit) : []
  if (!platform || !shop) throw new Error('Thiếu sàn hoặc shop để xem trước lệnh bài đăng/model')
  if (!requestedItems.length) throw new Error('Chưa có dữ liệu bài đăng/model để xem trước')

  const capabilityRows = await listMarketplaceShopCapabilities(env, { platform, limit: 300 })
  const capability = capabilityRows.find(row => exactShopMatch(row, shop)) || null
  const isModelAction = actionType.includes('model')
  const hasApi = capability?.capability_mode === 'api_active'
  const supportsAction = isModelAction
    ? Number(capability?.supports_model_write_api || 0) === 1
    : Number(capability?.supports_listing_write_api || 0) === 1

  const itemIds = [...new Set(requestedItems.map(item => cleanProductText(item.platform_item_id || item.item_id || item.itemId)).filter(Boolean))]
  const knowledgeMap = new Map()
  const snapshotMap = new Map()

  if (itemIds.length) {
    const placeholders = itemIds.map(() => '?').join(',')
    const [{ results: knowledgeRows }, { results: snapshotRows }] = await Promise.all([
      env.DB.prepare(`
        SELECT platform_item_id, product_name, category_id, weight, images, attributes, variations,
               suggested_categories, violation_summary, promotion_summary, deboost
        FROM marketplace_product_knowledge
        WHERE platform = ? AND shop = ? AND platform_item_id IN (${placeholders})
      `).bind(platform, shop, ...itemIds).all(),
      env.DB.prepare(`
        SELECT platform_item_id, item_status, price_min, price_max, discount_price_min, discount_price_max,
               total_marketplace_stock, variation_count
        FROM marketplace_product_catalog_snapshots
        WHERE platform = ? AND shop = ? AND platform_item_id IN (${placeholders})
      `).bind(platform, shop, ...itemIds).all()
    ])
    for (const row of knowledgeRows || []) knowledgeMap.set(cleanProductText(row.platform_item_id), row)
    for (const row of snapshotRows || []) snapshotMap.set(cleanProductText(row.platform_item_id), row)
  }

  const rows = requestedItems.map(item => {
    const itemId = cleanProductText(item.platform_item_id || item.item_id || item.itemId)
    const knowledge = knowledgeMap.get(itemId) || {}
    const snapshot = snapshotMap.get(itemId) || {}
    const variations = parseListingVariationRows(knowledge.variations)
    const matchedVariation = pickListingVariation(variations, item)
    const warnings = []

    if (!capability) {
      warnings.push('Chưa tìm thấy shop trong capability core. Hãy vào mục Kết nối & Đồng bộ để kiểm tra lại shop.')
    } else if (!hasApi) {
      warnings.push(capability.operator_guide || 'Shop này chưa có API hoạt động nên chỉ được tham chiếu tay.')
    } else if (!supportsAction) {
      warnings.push('Sàn này chưa bật thao tác bài đăng/model trong capability core.')
    }

    if (!itemId && actionType !== 'add_model') {
      warnings.push('Thiếu item_id nên chưa thể xác định đúng bài đăng cần thao tác.')
    }
    if (!Object.keys(knowledge).length && actionType !== 'add_model') {
      warnings.push('Bài đăng chưa có trong snapshot knowledge. Cần đồng bộ catalog thật trước khi sửa/xóa.')
    }
    if (actionType === 'update_item' && !cleanProductText(item.title || item.category_id || item.brand_name)) {
      warnings.push('Lệnh sửa bài đăng nên có ít nhất một trường thay đổi như tên, ngành hàng hoặc thương hiệu.')
    }
    if (actionType === 'add_model') {
      if (!itemId) warnings.push('Thiếu item_id của bài đăng gốc để thêm model.')
      if (!cleanProductText(item.model_name || item.variation_name)) warnings.push('Thiếu tên model mới.')
      if (!cleanProductText(item.platform_sku || item.sku)) warnings.push('Thiếu SKU sàn của model mới.')
      if (safeListingNumber(item.price) <= 0) warnings.push('Thiếu giá của model mới.')
      if (safeListingNumber(item.stock) < 0) warnings.push('Tồn model mới không hợp lệ.')
    }
    if (isModelAction && actionType !== 'add_model' && !matchedVariation) {
      warnings.push('Không tìm thấy model hiện tại theo model_id hoặc SKU sàn trong snapshot đã đồng bộ.')
    }

    warnings.push('Luồng này hiện mới dừng ở mức preview/guard. Chưa mở gửi thật để tránh sửa bài đăng hàng loạt khi chưa kiểm soát token và payload.')

    return {
      platform,
      shop,
      action_type: actionType,
      action_label: listingActionLabel(actionType),
      capability_mode: cleanProductText(capability?.capability_mode || 'manual_reference'),
      capability_badge: cleanProductText(capability?.capability_badge || 'Tham chiếu tay'),
      operator_guide: cleanProductText(capability?.operator_guide),
      platform_item_id: itemId,
      product_name: cleanProductText(knowledge.product_name),
      current_status: cleanProductText(snapshot.item_status),
      current_category_id: cleanProductText(knowledge.category_id),
      current_weight: cleanProductText(knowledge.weight),
      current_variation_count: safeListingNumber(snapshot.variation_count || variations.length),
      current_price_min: safeListingNumber(snapshot.discount_price_min || snapshot.price_min),
      current_price_max: safeListingNumber(snapshot.discount_price_max || snapshot.price_max),
      current_marketplace_stock: safeListingNumber(snapshot.total_marketplace_stock),
      current_model_id: cleanProductText(matchedVariation?.model_id || item.model_id),
      current_platform_sku: cleanProductText(matchedVariation?.platform_sku || matchedVariation?.sku || item.platform_sku || item.sku),
      current_model_name: cleanProductText(matchedVariation?.variation_name || matchedVariation?.name),
      proposed_title: cleanProductText(item.title),
      proposed_category_id: cleanProductText(item.category_id),
      proposed_brand_name: cleanProductText(item.brand_name),
      proposed_model_name: cleanProductText(item.model_name || item.variation_name),
      proposed_platform_sku: cleanProductText(item.platform_sku || item.sku),
      proposed_price: safeListingNumber(item.price),
      proposed_stock: safeListingNumber(item.stock),
      suggested_categories: parseProductJson(knowledge.suggested_categories, []),
      violation_summary: parseProductJson(knowledge.violation_summary, []),
      promotion_summary: parseProductJson(knowledge.promotion_summary, []),
      deboost: Number(knowledge.deboost || 0) ? 1 : 0,
      can_send_now: 0,
      status: previewActionStatusLabel(actionType, false),
      warnings
    }
  })

  const previewSummary = listingPreviewSummaryRows(rows)
  await saveProductActionLog(env, {
    platform,
    shop,
    action_type: actionType,
    action_scope: 'listing_preview',
    action_status: 'preview',
    request_payload: payload,
    preview_payload: previewSummary,
    note: `Xem trước ${listingActionLabel(actionType).toLowerCase()} cho ${shop}`
  })

  return {
    status: 'ok',
    summary: {
      ...previewSummary,
      action_type: actionType,
      action_label: listingActionLabel(actionType)
    },
    capability: capability ? {
      capability_mode: capability.capability_mode,
      capability_badge: capability.capability_badge,
      operator_guide: capability.operator_guide,
      supports_listing_write_api: Number(capability.supports_listing_write_api || 0) === 1,
      supports_model_write_api: Number(capability.supports_model_write_api || 0) === 1
    } : null,
    rows
  }
}
