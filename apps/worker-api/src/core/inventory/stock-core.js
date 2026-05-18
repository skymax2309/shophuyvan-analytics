import {
  buildSkuMappingProfile,
  cleanSkuIdentityText,
  resolveSimpleSkuMapping
} from '../products/sku-identity-core.js'

function stockNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function productInternalStock(row = {}) {
  const main = stockNumber(row.stock_main)
  const sub = stockNumber(row.stock_sub)
  if (main || sub) return main + sub
  return stockNumber(row.stock)
}

function cleanText(value) {
  return cleanSkuIdentityText(value)
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function tableExists(env, table) {
  const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first()
  return Boolean(row)
}

async function ensureColumn(env, table, column, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
  const exists = (info.results || []).some(row => cleanText(row.name).toLowerCase() === column.toLowerCase())
  if (!exists) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
}

export async function ensureInventoryStockColumns(env) {
  if (!await tableExists(env, 'product_variations')) return false
  await ensureColumn(env, 'product_variations', 'stock_source_json', "TEXT DEFAULT '{}'")
  await ensureColumn(env, 'product_variations', 'warehouse_stock', 'REAL DEFAULT 0')
  await ensureColumn(env, 'product_variations', 'channel_stock', 'REAL DEFAULT 0')
  await ensureColumn(env, 'product_variations', 'fbl_stock', 'REAL DEFAULT 0')
  await ensureColumn(env, 'product_variations', 'stock_source_detail', "TEXT DEFAULT ''")
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_product_variations_lazada_stock
    ON product_variations(platform, shop, stock_source_detail)
  `).run()
  return true
}

function sumStockList(list, keys = ['quantity', 'available', 'sellable_quantity', 'stock', 'available_stock']) {
  if (!Array.isArray(list)) return 0
  return list.reduce((sum, item) => {
    for (const key of keys) {
      const value = stockNumber(item?.[key])
      if (value) return sum + value
    }
    return sum
  }, 0)
}

function stockSourceLabel(source = {}) {
  const parts = []
  if (stockNumber(source.warehouse_stock)) parts.push('multiWarehouse')
  if (stockNumber(source.channel_stock)) parts.push('channel')
  if (stockNumber(source.fbl_stock)) parts.push('FBL')
  return parts.join('+') || 'seller_quantity'
}

function nestedStockAvailable(stocks = {}, names = ['sellable']) {
  for (const name of names) {
    const node = stocks?.[name]
    const value = stockNumber(node?.available ?? node?.available_stock ?? node?.quantity)
    if (value) return value
  }
  return 0
}

function normalizeFblStoreStocks(row = {}) {
  const storeStocks = Array.isArray(row.store_stocks)
    ? row.store_stocks
    : (Array.isArray(row.storeStocks) ? row.storeStocks : [])
  return storeStocks.map(store => ({
    store_code: cleanText(store.store_code || store.storeCode || store.warehouse_code || store.warehouseCode),
    sellable_available: nestedStockAvailable(store.stocks || {}, ['sellable']),
    pending_available: nestedStockAvailable(store.stocks || {}, ['pending']),
    unsellable_available: nestedStockAvailable(store.stocks || {}, ['unsellable', 'damagedUnsellable', 'expiredUnsellable']),
    raw: store
  }))
}

function normalizeFblChannelStocks(row = {}) {
  const warehouseRows = Array.isArray(row.stocks) ? row.stocks : []
  const channelRows = []
  for (const warehouse of warehouseRows) {
    for (const channel of Array.isArray(warehouse.channel_stocks) ? warehouse.channel_stocks : []) {
      channelRows.push({
        warehouse_code: cleanText(warehouse.warehouse_code || warehouse.warehouseCode),
        channel: cleanText(channel.channel),
        quantity: stockNumber(channel.quantity),
        raw: channel
      })
    }
  }
  return channelRows
}

export function normalizeLazadaAdvancedStockSource(sku = {}) {
  const multiWarehouse = []
    .concat(Array.isArray(sku.multiWarehouseInventories) ? sku.multiWarehouseInventories : [])
    .concat(Array.isArray(sku.multi_warehouse_inventories) ? sku.multi_warehouse_inventories : [])
    .concat(Array.isArray(sku.multiWarehouseInventory) ? sku.multiWarehouseInventory : [])
    .concat(Array.isArray(sku.multi_warehouse_inventory) ? sku.multi_warehouse_inventory : [])
  const channelInventories = []
    .concat(Array.isArray(sku.channelInventories) ? sku.channelInventories : [])
    .concat(Array.isArray(sku.channel_inventories) ? sku.channel_inventories : [])
    .concat(Array.isArray(sku.channelInventory) ? sku.channelInventory : [])
    .concat(Array.isArray(sku.channel_inventory) ? sku.channel_inventory : [])
  const fblStock = stockNumber(
    sku.fbl_stock ?? sku.fblStock ?? sku.fbl_quantity ?? sku.fblQuantity ??
    sku.fbl_sellable_stock ?? sku.fblSellableStock ?? sku.fblAvailableQuantity
  )
  const warehouseStock = sumStockList(multiWarehouse)
  const channelStock = sumStockList(channelInventories)
  const sellerStock = stockNumber(sku.quantity ?? sku.available ?? sku.stock)
  const source = {
    seller_stock: sellerStock,
    warehouse_stock: warehouseStock,
    channel_stock: channelStock,
    fbl_stock: fblStock,
    total_stock: channelStock || warehouseStock || fblStock || sellerStock,
    multi_warehouse: multiWarehouse,
    channel_inventories: channelInventories
  }
  return {
    ...source,
    source_detail: stockSourceLabel(source)
  }
}

export function normalizeLazadaFblStockSource(stockRow = {}, channelRow = {}) {
  const warehouseRows = normalizeFblStoreStocks(stockRow)
  const channelRows = normalizeFblChannelStocks(channelRow)
  const fblStock = warehouseRows.reduce((sum, row) => sum + stockNumber(row.sellable_available), 0)
  const channelStock = channelRows.reduce((sum, row) => sum + stockNumber(row.quantity), 0)
  const source = {
    seller_stock: 0,
    warehouse_stock: fblStock,
    channel_stock: channelStock,
    fbl_stock: fblStock,
    total_stock: channelStock || fblStock,
    multi_warehouse: warehouseRows,
    channel_inventories: channelRows,
    fbl_stock_row: stockRow || {},
    fbl_channel_row: channelRow || {}
  }
  return {
    ...source,
    source_detail: stockSourceLabel(source)
  }
}

export function mergeLazadaStockSources(base = {}, extra = {}) {
  const sellerStock = stockNumber(base.seller_stock ?? base.total_stock)
  const source = {
    ...base,
    ...extra,
    seller_stock: sellerStock,
    warehouse_stock: stockNumber(extra.warehouse_stock) || stockNumber(base.warehouse_stock),
    channel_stock: stockNumber(extra.channel_stock) || stockNumber(base.channel_stock),
    fbl_stock: stockNumber(extra.fbl_stock) || stockNumber(base.fbl_stock),
    multi_warehouse: Array.isArray(extra.multi_warehouse) && extra.multi_warehouse.length ? extra.multi_warehouse : (base.multi_warehouse || []),
    channel_inventories: Array.isArray(extra.channel_inventories) && extra.channel_inventories.length ? extra.channel_inventories : (base.channel_inventories || [])
  }
  source.total_stock = source.channel_stock || source.warehouse_stock || source.fbl_stock || sellerStock
  source.source_detail = stockSourceLabel(source)
  return source
}

/**
 * Ước lượng số lượng combo tối đa có thể bán dựa trên tồn nội bộ hiện có.
 * Cách tính này chỉ để tham chiếu vận hành, không dùng làm lệnh đẩy tồn thật.
 */
function estimateComplexMappingStock(profile, productMap) {
  if (!profile || !Array.isArray(profile.items) || !profile.items.length) {
    return {
      estimated_available_stock: 0,
      missing_components: [],
      component_rows: []
    }
  }

  const missingComponents = []
  const componentRows = []
  let estimatedAvailableStock = Number.POSITIVE_INFINITY

  for (const item of profile.items) {
    const sku = cleanSkuIdentityText(item.sku)
    const qty = Math.max(1, stockNumber(item.qty) || 1)
    const product = productMap.get(sku)
    const internalStock = stockNumber(product?.internal_stock)
    const possibleBundles = Math.floor(internalStock / qty)
    if (!product) missingComponents.push(sku)
    componentRows.push({
      sku,
      qty,
      internal_stock: internalStock,
      product_name: cleanSkuIdentityText(product?.product_name)
    })
    estimatedAvailableStock = Math.min(estimatedAvailableStock, possibleBundles)
  }

  return {
    estimated_available_stock: Number.isFinite(estimatedAvailableStock) ? estimatedAvailableStock : 0,
    missing_components: missingComponents,
    component_rows: componentRows
  }
}

export async function listInventoryDiscrepancies(env, options = {}) {
  await ensureInventoryStockColumns(env).catch(() => false)
  const limit = Math.min(Math.max(Number(options.limit || 12) || 12, 1), 100)
  const productRows = await env.DB.prepare(`
    SELECT sku, product_name, stock, stock_main, stock_sub, min_stock
    FROM products
    ORDER BY sku
  `).all()
  const variationRows = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, platform_sku, internal_sku, mapped_items, stock, map_status
    FROM product_variations
    WHERE COALESCE(map_status, '') = 'MAPPED'
  `).all()

  const productMap = new Map()
  for (const row of productRows.results || []) {
    const sku = cleanSkuIdentityText(row.sku)
    if (!sku) continue
    productMap.set(sku, {
      sku,
      product_name: cleanSkuIdentityText(row.product_name),
      min_stock: stockNumber(row.min_stock),
      internal_stock: productInternalStock(row),
      marketplace_stock: 0,
      comparable_listing_count: 0,
      comparable: false,
      shops: new Set(),
      platforms: new Set()
    })
  }

  let comparableSkus = 0
  let skippedComplexMappings = 0
  let missingMappingRows = 0
  const complexRows = []

  for (const row of variationRows.results || []) {
    const mappingProfile = buildSkuMappingProfile(row)
    if (mappingProfile.reason === 'missing_mapping') {
      missingMappingRows += 1
    }
    if (!mappingProfile.comparable && mappingProfile.items.length) {
      const estimated = estimateComplexMappingStock(mappingProfile, productMap)
      skippedComplexMappings += 1
      complexRows.push({
        platform: cleanSkuIdentityText(row.platform),
        shop: cleanSkuIdentityText(row.shop),
        platform_item_id: cleanSkuIdentityText(row.platform_item_id),
        platform_sku: cleanSkuIdentityText(row.platform_sku),
        internal_sku: cleanSkuIdentityText(row.internal_sku),
        reason: mappingProfile.reason,
        reason_label: mappingProfile.reason_label,
        marketplace_stock: stockNumber(row.stock),
        estimated_available_stock: estimated.estimated_available_stock,
        missing_components: estimated.missing_components,
        component_rows: estimated.component_rows
      })
    }
    const resolved = resolveSimpleSkuMapping(row)
    if (!resolved.comparable) {
      continue
    }
    const sku = cleanSkuIdentityText(resolved.sku)
    if (!sku) continue
    const current = productMap.get(sku) || {
      sku,
      product_name: '',
      min_stock: 0,
      internal_stock: 0,
      marketplace_stock: 0,
      comparable_listing_count: 0,
      comparable: false,
      shops: new Set(),
      platforms: new Set()
    }
    current.marketplace_stock += stockNumber(row.stock)
    current.comparable_listing_count += 1
    current.comparable = true
    current.shops.add(cleanSkuIdentityText(row.shop))
    current.platforms.add(cleanSkuIdentityText(row.platform))
    productMap.set(sku, current)
  }

  const rows = []
  let mismatchSkus = 0
  let lowStockSkus = 0
  let totalInternalStock = 0
  let totalMarketplaceStock = 0

  for (const entry of productMap.values()) {
    totalInternalStock += entry.internal_stock
    if (!entry.comparable) continue
    comparableSkus += 1
    totalMarketplaceStock += entry.marketplace_stock
    const diff = entry.internal_stock - entry.marketplace_stock
    const isMismatch = diff !== 0
    const isLowStock = entry.internal_stock <= entry.min_stock
    if (isMismatch) mismatchSkus += 1
    if (isLowStock) lowStockSkus += 1

    rows.push({
      sku: entry.sku,
      product_name: entry.product_name,
      internal_stock: entry.internal_stock,
      marketplace_stock: entry.marketplace_stock,
      diff,
      comparable_listing_count: entry.comparable_listing_count,
      shops: [...entry.shops].filter(Boolean),
      platforms: [...entry.platforms].filter(Boolean),
      min_stock: entry.min_stock,
      low_stock: isLowStock,
      mismatch: isMismatch
    })
  }

  rows.sort((left, right) => {
    const diffCompare = Math.abs(right.diff) - Math.abs(left.diff)
    if (diffCompare !== 0) return diffCompare
    return left.sku.localeCompare(right.sku)
  })
  complexRows.sort((left, right) => {
    const missingCompare = (right.missing_components?.length || 0) - (left.missing_components?.length || 0)
    if (missingCompare !== 0) return missingCompare
    const stockCompare = Math.abs(right.marketplace_stock - right.estimated_available_stock) - Math.abs(left.marketplace_stock - left.estimated_available_stock)
    if (stockCompare !== 0) return stockCompare
    return String(left.platform_sku || '').localeCompare(String(right.platform_sku || ''))
  })

  return {
    summary: {
      total_internal_skus: productMap.size,
      comparable_skus: comparableSkus,
      mismatch_skus: mismatchSkus,
      low_stock_skus: lowStockSkus,
      skipped_complex_mappings: skippedComplexMappings,
      missing_mapping_rows: missingMappingRows,
      complex_mapping_rows: complexRows.length,
      total_internal_stock: totalInternalStock,
      total_marketplace_stock: totalMarketplaceStock
    },
    mismatches: rows.filter(item => item.mismatch).slice(0, limit),
    low_stock_rows: rows.filter(item => item.low_stock).slice(0, limit),
    complex_rows: complexRows.slice(0, limit)
  }
}

export async function listLazadaAdvancedInventory(env, options = {}) {
  const ready = await ensureInventoryStockColumns(env).catch(() => false)
  if (!ready) {
    return {
      summary: {
        lazada_variations: 0,
        advanced_stock_rows: 0,
        warehouse_rows: 0,
        channel_rows: 0,
        fbl_rows: 0
      },
      rows: [],
      note: 'Chưa có bảng product_variations để đọc tồn Lazada nâng cao.'
    }
  }

  const limit = Math.min(Math.max(Number(options.limit || 40) || 40, 1), 200)
  const { results } = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, model_id, product_name, variation_name, platform_sku,
           internal_sku, stock, warehouse_stock, channel_stock, fbl_stock, stock_source_detail,
           stock_source_json, map_status, updated_at
    FROM product_variations
    WHERE LOWER(COALESCE(platform, '')) = 'lazada'
    ORDER BY updated_at DESC, product_name, platform_sku
    LIMIT ?
  `).bind(limit).all()

  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS lazada_variations,
           SUM(CASE WHEN COALESCE(stock_source_detail, '') NOT IN ('', 'seller_quantity') THEN 1 ELSE 0 END) AS advanced_stock_rows,
           SUM(CASE WHEN COALESCE(warehouse_stock, 0) > 0 THEN 1 ELSE 0 END) AS warehouse_rows,
           SUM(CASE WHEN COALESCE(channel_stock, 0) > 0 THEN 1 ELSE 0 END) AS channel_rows,
           SUM(CASE WHEN COALESCE(fbl_stock, 0) > 0 THEN 1 ELSE 0 END) AS fbl_rows
    FROM product_variations
    WHERE LOWER(COALESCE(platform, '')) = 'lazada'
  `).first()

  const rows = (results || []).map(row => {
    const source = parseJson(row.stock_source_json, {})
    return {
      ...row,
      stock: stockNumber(row.stock),
      warehouse_stock: stockNumber(row.warehouse_stock),
      channel_stock: stockNumber(row.channel_stock),
      fbl_stock: stockNumber(row.fbl_stock),
      total_advanced_stock: stockNumber(row.channel_stock) || stockNumber(row.warehouse_stock) || stockNumber(row.fbl_stock) || stockNumber(row.stock),
      source_counts: {
        multi_warehouse: Array.isArray(source.multi_warehouse) ? source.multi_warehouse.length : 0,
        channel_inventories: Array.isArray(source.channel_inventories) ? source.channel_inventories.length : 0
      }
    }
  })

  return {
    summary: {
      lazada_variations: stockNumber(countRow?.lazada_variations),
      advanced_stock_rows: stockNumber(countRow?.advanced_stock_rows),
      warehouse_rows: stockNumber(countRow?.warehouse_rows),
      channel_rows: stockNumber(countRow?.channel_rows),
      fbl_rows: stockNumber(countRow?.fbl_rows)
    },
    rows,
    note: 'Lazada nâng cao đọc seller quantity, multiWarehouseInventories, channelInventories và FBL stock nếu API trả về; dữ liệu này chỉ là nguồn đọc/snapshot, không tự đẩy tồn thật.'
  }
}
