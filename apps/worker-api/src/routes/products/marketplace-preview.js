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

const PROMOTION_WRITE_ENDPOINT_ALLOWLIST = {
  shopee: {
    discount: {
      module: 'promotion',
      action: 'update_discount_item',
      endpoint: '/api/v2/discount/update_discount_item',
      allowed: true,
      requires_admin_confirm: true,
      dry_run_required: true,
      readback_required: true
    },
    discounts: {
      module: 'promotion',
      action: 'update_discount_item',
      endpoint: '/api/v2/discount/update_discount_item',
      allowed: true,
      requires_admin_confirm: true,
      dry_run_required: true,
      readback_required: true
    },
    shopee_discount: {
      module: 'promotion',
      action: 'update_discount_item',
      endpoint: '/api/v2/discount/update_discount_item',
      allowed: true,
      requires_admin_confirm: true,
      dry_run_required: true,
      readback_required: true
    },
    product_discount: {
      module: 'promotion',
      action: 'update_discount_item',
      endpoint: '/api/v2/discount/update_discount_item',
      allowed: true,
      requires_admin_confirm: true,
      dry_run_required: true,
      readback_required: true
    }
  },
  lazada: {
    special_price: {
      module: 'product',
      action: 'update_special_price',
      endpoint: '/product/price_quantity/update',
      allowed: true,
      requires_admin_confirm: true,
      dry_run_required: true,
      readback_required: true
    },
    product_special_price: {
      module: 'product',
      action: 'update_special_price',
      endpoint: '/product/price_quantity/update',
      allowed: true,
      requires_admin_confirm: true,
      dry_run_required: true,
      readback_required: true
    }
  }
}

export function promotionWriteEndpointRule(platform, module) {
  const key = cleanProductText(platform).toLowerCase()
  const moduleKey = cleanProductText(module || 'discount').toLowerCase()
  return PROMOTION_WRITE_ENDPOINT_ALLOWLIST[key]?.[moduleKey] || null
}

function promotionPreviewEndpoint(platform, module) {
  const key = cleanProductText(platform).toLowerCase()
  const moduleKey = cleanProductText(module).toLowerCase()
  const rule = promotionWriteEndpointRule(key, moduleKey)
  if (rule?.allowed) return rule.endpoint
  return ''
}

function promotionMapKeys(row = {}) {
  return [
    row.sku,
    row.sku_id,
    row.model_id,
    row.item_id,
    row.platform_sku,
    row.platform_item_id
  ].map(lowerProductText).filter(Boolean)
}

function promotionModelNameKey(itemId, modelName) {
  const itemKey = lowerProductText(itemId)
  const nameKey = lowerProductText(modelName)
  return itemKey && nameKey ? `item_model_name:${itemKey}:${nameKey}` : ''
}

function lookupPromotionPreviewItem(promotionMap, platformSku, variation = {}) {
  const skuKey = lowerProductText(platformSku)
  if (skuKey && promotionMap.has(skuKey)) return promotionMap.get(skuKey)
  const modelKey = lowerProductText(variation?.model_id)
  if (modelKey && promotionMap.has(modelKey)) return promotionMap.get(modelKey)
  const modelNameKey = promotionModelNameKey(variation?.platform_item_id, variation?.variation_name)
  if (modelNameKey && promotionMap.has(modelNameKey)) return promotionMap.get(modelNameKey)
  // Không fallback theo item_id khi có SKU/model vì một item Shopee có nhiều phân loại dùng chung item_id.
  if (!skuKey && !modelKey) {
    const itemKey = lowerProductText(variation?.platform_item_id)
    if (itemKey && promotionMap.has(itemKey)) return promotionMap.get(itemKey)
  }
  return null
}

async function loadPromotionPreviewMap(env, platform, shop, variationRows = []) {
  if (platform !== 'shopee' || !shop || !variationRows.length) return new Map()
  const skuValues = [...new Set(variationRows.map(row => cleanProductText(row.platform_sku)).filter(Boolean))]
  const itemValues = [...new Set(variationRows.map(row => cleanProductText(row.platform_item_id)).filter(Boolean))]
  const modelValues = [...new Set(variationRows.map(row => cleanProductText(row.model_id)).filter(Boolean))]
  const makeOrs = (fieldGroups = []) => {
    const ors = []
    const params = []
    for (const [field, values] of fieldGroups) {
      const cleanValues = values.slice(0, 200)
      if (!cleanValues.length) continue
      ors.push(`${field} IN (${cleanValues.map(() => '?').join(',')})`)
      params.push(...cleanValues)
    }
    return { ors, params }
  }

  const promotionFilter = makeOrs([
    ['sku', skuValues],
    ['item_id', itemValues],
    ['model_id', modelValues],
    ['sku_id', modelValues]
  ])
  const discountFilter = makeOrs([
    ['item_id', itemValues],
    ['model_id', modelValues],
    ["CAST(json_extract(raw_data, '$.model.model_sku') AS TEXT)", skuValues],
    ["CAST(json_extract(raw_data, '$.item.item_sku') AS TEXT)", skuValues]
  ])
  if (!promotionFilter.ors.length && !discountFilter.ors.length) return new Map()
  for (const definition of [
    "write_status TEXT DEFAULT ''",
    "promotion_sync_status TEXT DEFAULT ''",
    "last_write_at TEXT DEFAULT ''",
    "last_readback_at TEXT DEFAULT ''",
    "write_source TEXT DEFAULT ''",
    "readback_source TEXT DEFAULT ''",
    "raw_write_payload TEXT DEFAULT '{}'",
    "raw_readback_payload TEXT DEFAULT '{}'"
  ]) {
    await addProductColumnIfMissing(env, 'marketplace_discount_items', definition).catch(() => {})
  }

  const discountRows = discountFilter.ors.length
    ? await env.DB.prepare(`
      SELECT
        platform,
        shop,
        api_shop_id,
        'discount' AS module,
        discount_id AS program_id,
        discount_name AS program_name,
        item_id,
        model_id,
        model_id AS sku_id,
        COALESCE(
          NULLIF(CAST(json_extract(raw_data, '$.model.model_sku') AS TEXT), ''),
          NULLIF(CAST(json_extract(raw_data, '$.item.item_sku') AS TEXT), ''),
          model_name
        ) AS sku,
        item_name,
        model_name,
        status,
        original_price,
        promotion_price,
        promotion_stock AS stock,
        promotion_stock AS campaign_stock,
        write_status,
        promotion_sync_status,
        last_write_at,
        last_readback_at,
        write_source,
        readback_source,
        raw_write_payload,
        raw_readback_payload,
        synced_at,
        updated_at,
        'marketplace_discount_items' AS mapping_source
      FROM marketplace_discount_items
      WHERE LOWER(platform) = ? AND shop = ?
        AND (${discountFilter.ors.join(' OR ')})
      ORDER BY updated_at DESC
      LIMIT 500
    `).bind(platform, shop, ...discountFilter.params).all().catch(() => ({ results: [] }))
    : { results: [] }

  const promotionRows = promotionFilter.ors.length
    ? await env.DB.prepare(`
    SELECT platform, shop, api_shop_id, module, program_id, program_name,
           item_id, model_id, sku_id, sku, item_name, model_name, status,
           original_price, promotion_price, stock, campaign_stock,
           '' AS write_status,
           '' AS promotion_sync_status,
           '' AS last_write_at,
           '' AS last_readback_at,
           '' AS write_source,
           '' AS readback_source,
           '{}' AS raw_write_payload,
           '{}' AS raw_readback_payload,
           updated_at,
           synced_at,
           'marketplace_promotion_items' AS mapping_source
    FROM marketplace_promotion_items
    WHERE LOWER(platform) = ? AND shop = ?
      AND (${promotionFilter.ors.join(' OR ')})
    ORDER BY CASE
        WHEN LOWER(module) IN ('discount', 'discounts', 'shopee_discount', 'product_discount') THEN 0
        WHEN LOWER(module) = 'bundle_deal' THEN 1
        ELSE 2
      END,
      updated_at DESC
    LIMIT 500
  `).bind(platform, shop, ...promotionFilter.params).all().catch(() => ({ results: [] }))
    : { results: [] }

  const map = new Map()
  for (const row of [...(discountRows.results || []), ...(promotionRows.results || [])]) {
    for (const key of promotionMapKeys(row)) {
      if (!map.has(key)) map.set(key, row)
    }
    const modelNameKey = promotionModelNameKey(row.item_id, row.model_name)
    if (modelNameKey && !map.has(modelNameKey)) map.set(modelNameKey, row)
  }
  return map
}

export function buildLazadaPromotionCorePreview(platform, shop, variation = {}, proposedPrice = 0, options = {}) {
  const endpointRule = promotionWriteEndpointRule(platform, 'special_price')
  const endpoint = endpointRule?.allowed ? endpointRule.endpoint : ''
  const sellerSku = cleanProductText(variation.platform_sku)
  const currentPromotionPrice = productStockNumber(variation.discount_price)
  const guardPrice = productStockNumber(options.guard_price)
  const enforceCostGuard = Boolean(options.enforce_cost_guard)
  const blockReasons = []
  if (!sellerSku) blockReasons.push('missing_seller_sku')
  if (!endpointRule?.allowed || !endpoint) blockReasons.push('promotion_write_endpoint_not_allowlisted')
  if (!proposedPrice) blockReasons.push('proposed_price_invalid')
  if (enforceCostGuard && guardPrice > 0 && proposedPrice > 0 && proposedPrice < guardPrice) blockReasons.push('below_cost_guard')
  const uniqueBlockReasons = [...new Set(blockReasons)]
  const noChange = !uniqueBlockReasons.length && currentPromotionPrice > 0 && Math.abs(currentPromotionPrice - proposedPrice) <= 0.01
  const status = uniqueBlockReasons.length ? 'blocked' : (noChange ? 'no_change' : 'ready')
  const preview = {
    source: 'Promotion Core',
    write_path: 'Product Master UI -> Promotion Core -> Lazada Open Platform adapter -> Core readback',
    platform,
    shop,
    shop_key: shop,
    promotion_type: 'special_price',
    seller_sku: sellerSku,
    sku_id: cleanProductText(variation.model_id),
    item_id: cleanProductText(variation.platform_item_id),
    model_id: cleanProductText(variation.model_id),
    internal_sku: cleanProductText(options.internal_sku || variation.internal_sku),
    original_price: productStockNumber(variation.price),
    current_promotion_price: currentPromotionPrice,
    proposed_promotion_price: proposedPrice,
    target_promotion_price: proposedPrice,
    endpoint,
    mapping_source: 'product_variations',
    readback_source: endpoint ? 'lazada_open_platform:/products/get' : '',
    endpoint_rule: endpointRule || null,
    status,
    block_reason: uniqueBlockReasons[0] || '',
    block_reasons: uniqueBlockReasons,
    sync_status: sellerSku ? 'resolved_from_product_core' : 'missing_seller_sku',
    apply_supported: status === 'ready',
    readback_required: true,
    warnings: uniqueBlockReasons
  }
  if (preview.apply_supported) {
    preview.live_action = {
      route: '/api/products/lazada-promo-action',
      action: 'update_special_price',
      confirm: 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_LAZADA',
      payload: {
        seller_sku: sellerSku,
        special_price: proposedPrice,
        sku_id: preview.sku_id,
        item_id: preview.item_id
      }
    }
  }
  return preview
}

export function buildPromotionLivePayload(preview = {}) {
  const toShopeeId = value => {
    const text = cleanProductText(value)
    if (/^\d+$/.test(text)) {
      const number = Number(text)
      if (Number.isSafeInteger(number)) return number
    }
    return text
  }
  const discountId = toShopeeId(preview.discount_id || preview.promotion_id)
  const itemId = toShopeeId(preview.item_id)
  const modelId = toShopeeId(preview.model_id)
  const price = productStockNumber(preview.proposed_promotion_price || preview.target_promotion_price)
  const item = { item_id: itemId }
  if (modelId) {
    item.model_list = [{
      model_id: modelId,
      model_promotion_price: price,
      promotion_price: price
    }]
  } else {
    item.item_promotion_price = price
    item.promotion_price = price
  }
  return {
    discount_id: discountId,
    item_list: [item]
  }
}

export function buildPromotionCorePreview(platform, shop, variation = {}, promotionItem = null, proposedPrice = 0, options = {}) {
  const warnings = []
  const module = cleanProductText(promotionItem?.module || 'discount').toLowerCase()
  const endpoint = promotionPreviewEndpoint(platform, module)
  {
    const endpointRule = promotionWriteEndpointRule(platform, module)
    const isDiscountModule = ['discount', 'discounts', 'shopee_discount', 'product_discount'].includes(module)
    const discountId = cleanProductText(promotionItem?.program_id || promotionItem?.discount_id)
    const itemId = cleanProductText(promotionItem?.item_id || variation.platform_item_id)
    const modelId = cleanProductText(promotionItem?.model_id || variation.model_id)
    const currentPromotionPrice = productStockNumber(promotionItem?.promotion_price || variation.discount_price)
    const guardPrice = productStockNumber(options.guard_price)
    const enforceCostGuard = Boolean(options.enforce_cost_guard)
    const blockReasons = []
    if (!promotionItem) blockReasons.push('missing_discount_mapping')
    if (promotionItem && !isDiscountModule) blockReasons.push('bundle_deal_not_discount_item')
    if (!endpointRule?.allowed || !endpoint) blockReasons.push('promotion_write_endpoint_not_allowlisted')
    if (!discountId || !itemId || (cleanProductText(variation.model_id) && !modelId)) blockReasons.push('missing_discount_mapping')
    if (!proposedPrice) blockReasons.push('proposed_price_invalid')
    if (promotionItem && ['ended', 'expired', 'end', 'inactive'].includes(cleanProductText(promotionItem.status).toLowerCase())) blockReasons.push('no_active_discount_for_sku')
    if (enforceCostGuard && guardPrice > 0 && proposedPrice > 0 && proposedPrice < guardPrice) blockReasons.push('below_cost_guard')
    for (const reason of [...new Set(blockReasons)]) warnings.push(reason)
    const noChange = !blockReasons.length && currentPromotionPrice > 0 && Math.abs(currentPromotionPrice - proposedPrice) <= 0.01
    const status = blockReasons.length ? 'blocked' : (noChange ? 'no_change' : 'ready')
    const preview = {
      source: 'Promotion Core',
      write_path: 'Product Master UI -> Promotion Core -> Shopee Open Platform adapter -> Core readback',
      platform,
      shop,
      shop_key: shop,
      promotion_type: module,
      discount_id: discountId,
      promotion_id: discountId,
      item_id: itemId,
      model_id: modelId,
      seller_sku: cleanProductText(promotionItem?.sku || variation.platform_sku),
      internal_sku: cleanProductText(options.internal_sku || variation.internal_sku),
      original_price: productStockNumber(promotionItem?.original_price || variation.price),
      current_promotion_price: currentPromotionPrice,
      proposed_promotion_price: proposedPrice,
      target_promotion_price: proposedPrice,
      endpoint,
      mapping_source: cleanProductText(promotionItem?.mapping_source) || (promotionItem ? 'Promotion Core cache' : ''),
      readback_source: endpoint ? 'shopee_open_platform:/api/v2/discount/get_discount' : '',
      endpoint_rule: endpointRule || null,
      status,
      block_reason: blockReasons[0] || '',
      block_reasons: [...new Set(blockReasons)],
      sync_status: promotionItem ? 'resolved_from_core_cache' : 'missing_discount_mapping',
      write_status: cleanProductText(promotionItem?.write_status),
      promotion_sync_status: cleanProductText(promotionItem?.promotion_sync_status),
      last_write_at: cleanProductText(promotionItem?.last_write_at),
      last_readback_at: cleanProductText(promotionItem?.last_readback_at),
      last_synced_at: cleanProductText(promotionItem?.synced_at || promotionItem?.updated_at),
      apply_supported: status === 'ready',
      readback_required: true,
      warnings
    }
    if (preview.apply_supported) {
      preview.live_action = {
        route: '/api/discounts/shopee/action',
        action: 'update_discount_item',
        confirm: 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_SHOPEE',
        payload: buildPromotionLivePayload(preview)
      }
    }
    return preview
  }
  if (!promotionItem) warnings.push('Chưa resolve được discount_id/item_id/model_id trong Promotion Core. Cần đồng bộ khuyến mại từ sàn trước khi ghi thật.')
  if (!endpoint) warnings.push('Module khuyến mại này chưa có endpoint ghi chính thức trong allowlist Core.')
  if (!cleanProductText(promotionItem?.program_id)) warnings.push('Thiếu discount_id/program_id.')
  if (!cleanProductText(promotionItem?.item_id || variation.platform_item_id)) warnings.push('Thiếu item_id.')
  if (!cleanProductText(promotionItem?.model_id || variation.model_id) && cleanProductText(variation.model_id)) warnings.push('Thiếu model_id trong cache khuyến mại.')
  if (!proposedPrice) warnings.push('Thiếu giá khuyến mại mới.')
  const currentPromotionPrice = productStockNumber(promotionItem?.promotion_price || variation.discount_price)
  return {
    source: 'Promotion Core',
    write_path: 'Product Master UI -> Promotion Core -> Shopee Open Platform adapter -> Core readback',
    platform,
    shop,
    promotion_type: module,
    discount_id: cleanProductText(promotionItem?.program_id),
    promotion_id: cleanProductText(promotionItem?.program_id),
    item_id: cleanProductText(promotionItem?.item_id || variation.platform_item_id),
    model_id: cleanProductText(promotionItem?.model_id || variation.model_id),
    seller_sku: cleanProductText(promotionItem?.sku || variation.platform_sku),
    original_price: productStockNumber(promotionItem?.original_price || variation.price),
    current_promotion_price: currentPromotionPrice,
    target_promotion_price: proposedPrice,
    endpoint,
    sync_status: promotionItem ? 'resolved_from_core_cache' : 'missing_promotion_cache',
    last_synced_at: cleanProductText(promotionItem?.synced_at || promotionItem?.updated_at),
    apply_supported: Boolean(promotionItem && endpoint && proposedPrice > 0),
    readback_required: true,
    warnings
  }
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

  await ensureProductVariationWriteColumns(env)
  const placeholders = platformSkus.map(() => '?').join(',')
  const variationRows = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, model_id, variation_name, platform_sku, internal_sku, mapped_items, price, discount_price, stock
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
  const promotionMap = await loadPromotionPreviewMap(env, platform, shop, skuRows)
  const minimumMargin = Math.max(0, Number(settings.minimum_profit_margin_percent || 0) || 0)
  const enforceCostGuard = Number(settings.enforce_cost_price_guard || 0) === 1
  const rows = []

  for (const item of requestedItems) {
    const platformSku = cleanProductText(item.platform_sku || item.sku)
    if (!platformSku) continue
    const variation = variationMap.get(platformSku)
    const promotionItem = lookupPromotionPreviewItem(promotionMap, platformSku, variation)
    const mappedItems = parseMappedSkuItems(variation?.mapped_items, variation?.internal_sku)
    const internalSku = cleanProductText(mappedItems[0]?.sku || variation?.internal_sku)
    const internalProduct = productMap.get(internalSku) || {}
    const costBase = Math.max(productStockNumber(internalProduct.cost_real), productStockNumber(internalProduct.cost_invoice))
    const currentPrice = productStockNumber(variation?.discount_price || variation?.price)
    const currentStock = productStockNumber(variation?.stock)
    const proposedPrice = productStockNumber(item.original_price ?? item.price ?? item.proposed_price)
    const proposedStock = actionType === 'update_stock' ? productStockNumber(item.stock ?? item.proposed_stock) : undefined
    const guardPrice = costBase > 0 ? Math.ceil(costBase * (1 + minimumMargin / 100)) : 0
    const warnings = []

    let canSendNow = false
    if (actionType === 'update_price') {
      const promotionCore = platform === 'shopee'
        ? buildPromotionCorePreview(platform, shop, variation || {}, promotionItem, proposedPrice, {
          internal_sku: internalSku,
          guard_price: guardPrice,
          enforce_cost_guard: enforceCostGuard
        })
        : (platform === 'lazada'
          ? buildLazadaPromotionCorePreview(platform, shop, variation || {}, proposedPrice, {
            internal_sku: internalSku,
            guard_price: guardPrice,
            enforce_cost_guard: enforceCostGuard
          })
          : null)
      if (!Number(settings.marketplace_price_push_enabled || 0)) {
        warnings.push('Công tắc đẩy giá lên sàn đang tắt. Hiện chỉ xem trước, chưa gửi lệnh thật.')
      } else {
        canSendNow = true
      }
      if (promotionCore) {
        warnings.push(...promotionCore.warnings)
        canSendNow = Boolean(promotionCore.apply_supported)
      }
      if (enforceCostGuard && guardPrice > 0 && proposedPrice > 0 && proposedPrice < guardPrice) {
        canSendNow = false
        warnings.push(`Giá đề xuất thấp hơn giá bảo vệ ${guardPrice.toLocaleString('vi-VN')}đ.`)
      }
      if (!variation) warnings.push('SKU sàn chưa có trong bảng product_variations nên chưa thể gửi giá thật.')
      item.promotion_core = promotionCore
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
      model_id: cleanProductText(variation?.model_id),
      internal_sku: internalSku,
      internal_product_name: cleanProductText(internalProduct.product_name),
      current_price: currentPrice,
      proposed_price: proposedPrice,
      current_stock: currentStock,
      proposed_stock: proposedStock,
      cost_base: costBase,
      guard_price: guardPrice,
      status: actionType === 'update_price' && item.promotion_core?.status ? item.promotion_core.status : previewActionStatusLabel(actionType, canSendNow),
      block_reason: actionType === 'update_price' ? cleanProductText(item.promotion_core?.block_reason) : '',
      block_reasons: actionType === 'update_price' ? (item.promotion_core?.block_reasons || []) : [],
      can_send_now: canSendNow ? 1 : 0,
      promotion_core: item.promotion_core,
      warnings: [...new Set(warnings.filter(Boolean))]
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
      blocked_rows: rows.filter(row => row.status === 'blocked').length,
      no_change_rows: rows.filter(row => row.status === 'no_change').length
    },
    note: `Xem trước ${actionType} cho ${shop}`
  })

  return {
    status: 'ok',
    settings,
    summary: {
      total_rows: rows.length,
      ready_rows: rows.filter(row => row.can_send_now).length,
      blocked_rows: rows.filter(row => row.status === 'blocked').length,
      no_change_rows: rows.filter(row => row.status === 'no_change').length,
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
