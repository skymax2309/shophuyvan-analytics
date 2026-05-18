import { listInventoryDiscrepancies, listLazadaAdvancedInventory } from '../inventory/stock-core.js'
import { cleanSkuIdentityText } from './sku-identity-core.js'
import { buildCatalogAudit, listSkuWarnings } from './catalog-audit-core.js'
import {
  listMarketplaceShopCapabilities,
  summarizeMarketplaceCapabilities
} from '../marketplace/shop-capability-core.js'
import { ensureProductKnowledgeTables } from '../../routes/marketplace-chat/index.js'

const PRODUCT_CATALOG_SETTINGS_KEY = 'product_catalog_runtime_settings'

const DEFAULT_PRODUCT_CATALOG_SETTINGS = {
  external_inventory_owner: 'ShipXanh',
  external_inventory_mode: 'reference_only',
  manual_internal_stock_edit_enabled: 0,
  marketplace_stock_push_enabled: 0,
  marketplace_price_push_enabled: 0,
  sync_extra_metrics_enabled: 1,
  sync_full_listing_enabled: 1,
  minimum_profit_margin_percent: 10,
  enforce_cost_price_guard: 1,
  price_push_preview_limit: 50,
  stock_push_guard_note: 'Kho thật đang tham chiếu từ ShipXanh nên công tắc sửa tồn và đẩy tồn lên sàn mặc định bị khóa cho đến khi kích hoạt.',
  updated_at: ''
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function jsonText(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

function parseJsonText(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function compactText(value) {
  return cleanSkuIdentityText(value)
}

export async function ensureProductCatalogTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_catalog_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      platform_item_id TEXT NOT NULL,
      item_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      brand_name TEXT DEFAULT '',
      category_id TEXT DEFAULT '',
      item_status TEXT DEFAULT '',
      price_min REAL DEFAULT 0,
      price_max REAL DEFAULT 0,
      discount_price_min REAL DEFAULT 0,
      discount_price_max REAL DEFAULT 0,
      variation_count INTEGER DEFAULT 0,
      total_marketplace_stock INTEGER DEFAULT 0,
      sale_count INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      rating_star REAL DEFAULT 0,
      has_video INTEGER DEFAULT 0,
      image_count INTEGER DEFAULT 0,
      source TEXT DEFAULT 'api',
      raw_metrics TEXT DEFAULT '{}',
      snapshot_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, platform_item_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_catalog_shop
    ON marketplace_product_catalog_snapshots(platform, shop, updated_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_shop_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      category_id TEXT DEFAULT '',
      price_min REAL DEFAULT 0,
      price_max REAL DEFAULT 0,
      stock_min REAL DEFAULT 0,
      stock_max REAL DEFAULT 0,
      item_count_max REAL DEFAULT 0,
      item_name_max REAL DEFAULT 0,
      item_description_max REAL DEFAULT 0,
      size_chart_mandatory INTEGER DEFAULT 0,
      dimension_mandatory INTEGER DEFAULT 0,
      weight_mandatory INTEGER DEFAULT 0,
      raw_limits TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, shop_id, category_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_shop_limits_shop
    ON marketplace_product_shop_limits(platform, shop, updated_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_shop_catalog_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      normal_count INTEGER DEFAULT 0,
      unlist_count INTEGER DEFAULT 0,
      banned_count INTEGER DEFAULT 0,
      reviewing_count INTEGER DEFAULT 0,
      deleted_count INTEGER DEFAULT 0,
      total_count INTEGER DEFAULT 0,
      raw_counts TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, shop_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_shop_catalog_state_shop
    ON marketplace_product_shop_catalog_state(platform, shop, updated_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_catalog_daily_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      platform_item_id TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      item_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      item_status TEXT DEFAULT '',
      price_min REAL DEFAULT 0,
      price_max REAL DEFAULT 0,
      discount_price_min REAL DEFAULT 0,
      discount_price_max REAL DEFAULT 0,
      total_marketplace_stock INTEGER DEFAULT 0,
      variation_count INTEGER DEFAULT 0,
      source TEXT DEFAULT 'api',
      raw_metrics TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, shop_id, platform_item_id, snapshot_date)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_catalog_daily_history_shop
    ON marketplace_product_catalog_daily_history(platform, shop, snapshot_date)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      action_type TEXT DEFAULT '',
      action_scope TEXT DEFAULT '',
      action_status TEXT DEFAULT 'preview',
      request_payload TEXT DEFAULT '{}',
      preview_payload TEXT DEFAULT '{}',
      result_payload TEXT DEFAULT '{}',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_action_logs_shop
    ON marketplace_product_action_logs(platform, shop, action_type, created_at)
  `).run()
}

export async function getProductCatalogSettings(env) {
  await ensureProductCatalogTables(env)
  const row = await env.DB.prepare(`
    SELECT value
    FROM app_config
    WHERE key = ?
  `).bind(PRODUCT_CATALOG_SETTINGS_KEY).first()
  const parsed = parseJsonText(row?.value, {})
  return {
    ...DEFAULT_PRODUCT_CATALOG_SETTINGS,
    ...(parsed && typeof parsed === 'object' ? parsed : {})
  }
}

export async function saveProductCatalogSettings(env, patch = {}) {
  const current = await getProductCatalogSettings(env)
  const next = {
    ...current,
    ...patch,
    manual_internal_stock_edit_enabled: Number(patch.manual_internal_stock_edit_enabled ?? current.manual_internal_stock_edit_enabled) ? 1 : 0,
    marketplace_stock_push_enabled: Number(patch.marketplace_stock_push_enabled ?? current.marketplace_stock_push_enabled) ? 1 : 0,
    marketplace_price_push_enabled: Number(patch.marketplace_price_push_enabled ?? current.marketplace_price_push_enabled) ? 1 : 0,
    sync_extra_metrics_enabled: Number(patch.sync_extra_metrics_enabled ?? current.sync_extra_metrics_enabled) ? 1 : 0,
    sync_full_listing_enabled: Number(patch.sync_full_listing_enabled ?? current.sync_full_listing_enabled) ? 1 : 0,
    enforce_cost_price_guard: Number(patch.enforce_cost_price_guard ?? current.enforce_cost_price_guard) ? 1 : 0,
    minimum_profit_margin_percent: Math.max(0, Number(patch.minimum_profit_margin_percent ?? current.minimum_profit_margin_percent) || 0),
    price_push_preview_limit: Math.min(Math.max(Number(patch.price_push_preview_limit ?? current.price_push_preview_limit) || 50, 1), 200),
    updated_at: new Date().toISOString()
  }

  await env.DB.prepare(`
    INSERT INTO app_config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).bind(PRODUCT_CATALOG_SETTINGS_KEY, jsonText(next)).run()

  return next
}

function metricsFromProduct(product = {}) {
  const metrics = product.extra_metrics && typeof product.extra_metrics === 'object'
    ? product.extra_metrics
    : {}
  return {
    sale_count: numberValue(metrics.sale),
    view_count: numberValue(metrics.views),
    like_count: numberValue(metrics.likes),
    comment_count: numberValue(metrics.comment_count),
    rating_star: numberValue(metrics.rating_star)
  }
}

function itemStatusText(product = {}) {
  return compactText(product.item_status || product.status || product.raw_listing?.item_status || 'NORMAL') || 'NORMAL'
}

function priceRange(variations = []) {
  const priceList = variations.map(item => numberValue(item.price)).filter(value => value > 0)
  const discountList = variations.map(item => numberValue(item.discount_price)).filter(value => value > 0)
  return {
    price_min: priceList.length ? Math.min(...priceList) : 0,
    price_max: priceList.length ? Math.max(...priceList) : 0,
    discount_price_min: discountList.length ? Math.min(...discountList) : 0,
    discount_price_max: discountList.length ? Math.max(...discountList) : 0
  }
}

/**
 * Lưu lịch sử theo ngày để sau này chỉ cần đọc D1 là biết giá/tồn đã thay đổi ra sao,
 * không phải gọi lại API cũ của từng ngày.
 */
async function saveProductCatalogHistoryBatch(env, input = {}) {
  const platform = compactText(input.platform).toLowerCase()
  const shop = compactText(input.shop)
  const shopId = compactText(input.shop_id || input.shopId || input.api_shop_id)
  const source = compactText(input.source || 'api') || 'api'
  const products = Array.isArray(input.products) ? input.products : []
  const stmts = []

  for (const product of products) {
    const platformItemId = compactText(product.item_id || product.platform_item_id)
    if (!platform || !shop || !platformItemId) continue
    const variations = Array.isArray(product.variations) ? product.variations : []
    const totals = priceRange(variations)
    stmts.push(env.DB.prepare(`
      INSERT INTO marketplace_product_catalog_daily_history
        (platform, shop, shop_id, platform_item_id, snapshot_date, item_sku, product_name, item_status,
         price_min, price_max, discount_price_min, discount_price_max, total_marketplace_stock, variation_count,
         source, raw_metrics, updated_at, created_at)
      VALUES (?, ?, ?, ?, date('now', '+7 hours'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
      ON CONFLICT(platform, shop, shop_id, platform_item_id, snapshot_date) DO UPDATE SET
        item_sku = excluded.item_sku,
        product_name = excluded.product_name,
        item_status = excluded.item_status,
        price_min = excluded.price_min,
        price_max = excluded.price_max,
        discount_price_min = excluded.discount_price_min,
        discount_price_max = excluded.discount_price_max,
        total_marketplace_stock = excluded.total_marketplace_stock,
        variation_count = excluded.variation_count,
        source = excluded.source,
        raw_metrics = excluded.raw_metrics,
        updated_at = datetime('now', '+7 hours')
    `).bind(
      platform,
      shop,
      shopId,
      platformItemId,
      compactText(product.item_sku),
      compactText(product.product_name),
      itemStatusText(product),
      totals.price_min,
      totals.price_max,
      totals.discount_price_min,
      totals.discount_price_max,
      variations.reduce((sum, item) => sum + numberValue(item.stock), 0),
      variations.length,
      source,
      jsonText({
        extra_metrics: product.extra_metrics || {},
        sale_count: numberValue(product.extra_metrics?.sale),
        image_count: Array.isArray(product.images) ? product.images.filter(Boolean).length : 0
      })
    ))
  }

  for (let index = 0; index < stmts.length; index += 50) {
    await env.DB.batch(stmts.slice(index, index + 50))
  }

  return { saved: stmts.length }
}

export async function saveProductCatalogSnapshotsBatch(env, input = {}) {
  await ensureProductCatalogTables(env)
  const platform = compactText(input.platform).toLowerCase()
  const shop = compactText(input.shop)
  const shopId = compactText(input.shop_id || input.shopId || input.api_shop_id)
  const source = compactText(input.source || 'api') || 'api'
  const products = Array.isArray(input.products) ? input.products : []
  const stmts = []
  let skipped = 0

  for (const product of products) {
    const platformItemId = compactText(product.item_id || product.platform_item_id)
    if (!platform || !shop || !platformItemId) {
      skipped += 1
      continue
    }
    const variations = Array.isArray(product.variations) ? product.variations : []
    const totals = priceRange(variations)
    const metrics = metricsFromProduct(product)
    stmts.push(env.DB.prepare(`
      INSERT INTO marketplace_product_catalog_snapshots
        (platform, shop, shop_id, platform_item_id, item_sku, product_name, brand_name, category_id, item_status,
         price_min, price_max, discount_price_min, discount_price_max, variation_count, total_marketplace_stock,
         sale_count, view_count, like_count, comment_count, rating_star, has_video, image_count, source,
         raw_metrics, snapshot_at, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'),
              datetime('now', '+7 hours'), datetime('now', '+7 hours'))
      ON CONFLICT(platform, shop, platform_item_id) DO UPDATE SET
        shop_id = excluded.shop_id,
        item_sku = excluded.item_sku,
        product_name = excluded.product_name,
        brand_name = excluded.brand_name,
        category_id = excluded.category_id,
        item_status = excluded.item_status,
        price_min = excluded.price_min,
        price_max = excluded.price_max,
        discount_price_min = excluded.discount_price_min,
        discount_price_max = excluded.discount_price_max,
        variation_count = excluded.variation_count,
        total_marketplace_stock = excluded.total_marketplace_stock,
        sale_count = excluded.sale_count,
        view_count = excluded.view_count,
        like_count = excluded.like_count,
        comment_count = excluded.comment_count,
        rating_star = excluded.rating_star,
        has_video = excluded.has_video,
        image_count = excluded.image_count,
        source = excluded.source,
        raw_metrics = excluded.raw_metrics,
        snapshot_at = datetime('now', '+7 hours'),
        updated_at = datetime('now', '+7 hours')
    `).bind(
      platform,
      shop,
      shopId,
      platformItemId,
      compactText(product.item_sku),
      compactText(product.product_name),
      compactText(product.brand_name),
      compactText(product.category_id),
      itemStatusText(product),
      totals.price_min,
      totals.price_max,
      totals.discount_price_min,
      totals.discount_price_max,
      variations.length,
      variations.reduce((sum, item) => sum + numberValue(item.stock), 0),
      metrics.sale_count,
      metrics.view_count,
      metrics.like_count,
      metrics.comment_count,
      metrics.rating_star,
      compactText(product.video_url) ? 1 : 0,
      Array.isArray(product.images) ? product.images.filter(Boolean).length : 0,
      source,
      jsonText({
        extra_metrics: product.extra_metrics || {},
        attributes_count: Array.isArray(product.attributes) ? product.attributes.length : 0,
        logistics_count: Array.isArray(product.logistics) ? product.logistics.length : 0
      })
    ))
  }

  for (let index = 0; index < stmts.length; index += 50) {
    await env.DB.batch(stmts.slice(index, index + 50))
  }

  if (stmts.length) {
    await saveProductCatalogHistoryBatch(env, input)
  }

  return { saved: stmts.length, skipped }
}

export async function saveProductCatalogState(env, input = {}) {
  await ensureProductCatalogTables(env)
  const counts = input.counts && typeof input.counts === 'object' ? input.counts : {}
  await env.DB.prepare(`
    INSERT INTO marketplace_product_shop_catalog_state
      (platform, shop, shop_id, normal_count, unlist_count, banned_count, reviewing_count, deleted_count, total_count,
       raw_counts, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, shop_id) DO UPDATE SET
      normal_count = excluded.normal_count,
      unlist_count = excluded.unlist_count,
      banned_count = excluded.banned_count,
      reviewing_count = excluded.reviewing_count,
      deleted_count = excluded.deleted_count,
      total_count = excluded.total_count,
      raw_counts = excluded.raw_counts,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    compactText(input.platform).toLowerCase(),
    compactText(input.shop),
    compactText(input.shop_id || input.shopId || input.api_shop_id),
    numberValue(counts.NORMAL),
    numberValue(counts.UNLIST),
    numberValue(counts.BANNED),
    numberValue(counts.REVIEWING),
    numberValue(counts.DELETED || counts.SELLER_DELETE || counts.SHOPEE_DELETE),
    numberValue(counts.total),
    jsonText(counts)
  ).run()
  return { saved: 1 }
}

export async function saveProductShopLimit(env, input = {}) {
  await ensureProductCatalogTables(env)
  const limits = input.limits && typeof input.limits === 'object' ? input.limits : {}
  await env.DB.prepare(`
    INSERT INTO marketplace_product_shop_limits
      (platform, shop, shop_id, category_id, price_min, price_max, stock_min, stock_max, item_count_max,
       item_name_max, item_description_max, size_chart_mandatory, dimension_mandatory, weight_mandatory,
       raw_limits, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, shop_id, category_id) DO UPDATE SET
      price_min = excluded.price_min,
      price_max = excluded.price_max,
      stock_min = excluded.stock_min,
      stock_max = excluded.stock_max,
      item_count_max = excluded.item_count_max,
      item_name_max = excluded.item_name_max,
      item_description_max = excluded.item_description_max,
      size_chart_mandatory = excluded.size_chart_mandatory,
      dimension_mandatory = excluded.dimension_mandatory,
      weight_mandatory = excluded.weight_mandatory,
      raw_limits = excluded.raw_limits,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    compactText(input.platform).toLowerCase(),
    compactText(input.shop),
    compactText(input.shop_id || input.shopId || input.api_shop_id),
    compactText(input.category_id),
    numberValue(limits.price_min),
    numberValue(limits.price_max),
    numberValue(limits.stock_min),
    numberValue(limits.stock_max),
    numberValue(limits.item_count_max),
    numberValue(limits.item_name_max),
    numberValue(limits.item_description_max),
    limits.size_chart_mandatory ? 1 : 0,
    limits.dimension_mandatory ? 1 : 0,
    limits.weight_mandatory ? 1 : 0,
    jsonText(limits)
  ).run()
  return { saved: 1 }
}

export async function saveProductActionLog(env, input = {}) {
  await ensureProductCatalogTables(env)
  await env.DB.prepare(`
    INSERT INTO marketplace_product_action_logs
      (platform, shop, shop_id, action_type, action_scope, action_status,
       request_payload, preview_payload, result_payload, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
  `).bind(
    compactText(input.platform).toLowerCase(),
    compactText(input.shop),
    compactText(input.shop_id || input.shopId || input.api_shop_id),
    compactText(input.action_type),
    compactText(input.action_scope),
    compactText(input.action_status || 'preview'),
    jsonText(input.request_payload || {}),
    jsonText(input.preview_payload || {}),
    jsonText(input.result_payload || {}),
    compactText(input.note)
  ).run()
  return { saved: 1 }
}

async function listCatalogHistorySummary(env, limit = 10) {
  const { results } = await env.DB.prepare(`
    SELECT snapshot_date,
           COUNT(*) AS listing_count,
           COALESCE(SUM(total_marketplace_stock), 0) AS marketplace_stock,
           COALESCE(SUM(price_min), 0) AS total_price_min
    FROM marketplace_product_catalog_daily_history
    GROUP BY snapshot_date
    ORDER BY snapshot_date DESC
    LIMIT ?
  `).bind(Math.max(limit, 1)).all()
  return (results || []).map(row => ({
    snapshot_date: compactText(row.snapshot_date),
    listing_count: numberValue(row.listing_count),
    marketplace_stock: numberValue(row.marketplace_stock),
    total_price_min: numberValue(row.total_price_min)
  }))
}

function findShopScopedRow(map, capability = {}) {
  const platform = compactText(capability.platform).toLowerCase()
  const names = [
    compactText(capability.shop_name),
    compactText(capability.user_name),
    compactText(capability.shop)
  ].filter(Boolean)
  const shopId = compactText(capability.api_shop_id || capability.shop_id)
  const candidates = []
  for (const name of names) {
    if (shopId) candidates.push(`${platform}|${name}|${shopId}`)
    candidates.push(`${platform}|${name}|`)
  }
  if (shopId) {
    candidates.push(`${platform}|${shopId}|${shopId}`)
    candidates.push(`${platform}|${shopId}|`)
  }
  for (const key of candidates) {
    if (map.has(key)) return map.get(key)
  }
  return {}
}

export async function getProductCatalogOverview(env, options = {}) {
  await ensureProductCatalogTables(env)
  await ensureProductKnowledgeTables(env)
  const settings = await getProductCatalogSettings(env)
  const limit = Math.min(Math.max(Number(options.limit || 12) || 12, 1), 100)
  const [
    { results: snapshotRows },
    { results: stateRows },
    { results: limitRows },
    { results: knowledgeRows },
    capabilities
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT platform, shop, shop_id, COUNT(*) AS item_count, COALESCE(SUM(variation_count), 0) AS variation_count,
             COALESCE(SUM(total_marketplace_stock), 0) AS marketplace_stock, MAX(updated_at) AS last_synced_at
      FROM marketplace_product_catalog_snapshots
      GROUP BY platform, shop, shop_id
      ORDER BY last_synced_at DESC
    `).all(),
    env.DB.prepare(`
      SELECT platform, shop, shop_id, normal_count, unlist_count, banned_count, reviewing_count, deleted_count,
             total_count, updated_at
      FROM marketplace_product_shop_catalog_state
    `).all(),
    env.DB.prepare(`
      SELECT platform, shop, shop_id, category_id, price_min, price_max, stock_min, stock_max, item_count_max,
             item_name_max, item_description_max, size_chart_mandatory, dimension_mandatory, weight_mandatory,
             updated_at
      FROM marketplace_product_shop_limits
      WHERE category_id = ''
    `).all(),
    env.DB.prepare(`
      SELECT platform, shop, platform_item_id, product_name, item_sku, category_id, weight, images, attributes,
             promotion_summary, violation_summary, suggested_categories, deboost
      FROM marketplace_product_knowledge
      ORDER BY updated_at DESC
    `).all(),
    listMarketplaceShopCapabilities(env, { limit: 300 })
  ])

  const stateMap = new Map((stateRows || []).map(row => [`${row.platform}|${row.shop}|${row.shop_id}`, row]))
  const limitMap = new Map((limitRows || []).map(row => [`${row.platform}|${row.shop}|${row.shop_id}`, row]))
  const snapshotMap = new Map((snapshotRows || []).map(row => [`${row.platform}|${row.shop}|${row.shop_id}`, row]))
  const snapshotStatusMap = new Map()
  const { results: snapshotStatusRows } = await env.DB.prepare(`
    SELECT platform, shop, platform_item_id, item_status
    FROM marketplace_product_catalog_snapshots
  `).all()
  for (const row of snapshotStatusRows || []) {
    snapshotStatusMap.set(`${compactText(row.platform)}|${compactText(row.shop)}|${compactText(row.platform_item_id)}`, row)
  }
  const [discrepancies, lazadaAdvancedInventory] = await Promise.all([
    listInventoryDiscrepancies(env, { limit }),
    listLazadaAdvancedInventory(env, { limit })
  ])
  const capabilitySummary = summarizeMarketplaceCapabilities(capabilities)
  const audit = buildCatalogAudit(knowledgeRows || [], snapshotStatusMap, limit)
  const skuWarnings = await listSkuWarnings(env, limit)
  const history = await listCatalogHistorySummary(env, 10)

  const shops = capabilities.map(capability => {
    const snapshot = findShopScopedRow(snapshotMap, capability)
    const state = findShopScopedRow(stateMap, capability)
    const limits = findShopScopedRow(limitMap, capability)
    return {
      platform: compactText(capability.platform),
      shop: compactText(capability.shop_name || capability.user_name || snapshot.shop),
      shop_id: compactText(capability.api_shop_id || snapshot.shop_id),
      api_products: numberValue(snapshot.item_count),
      api_variations: numberValue(snapshot.variation_count),
      marketplace_stock: numberValue(snapshot.marketplace_stock),
      last_synced_at: snapshot.last_synced_at || '',
      capability_mode: capability.capability_mode,
      capability_badge: capability.capability_badge,
      product_sync_mode: capability.product_sync_mode,
      operator_guide: capability.operator_guide,
      supports_product_sync: Number(capability.supports_product_sync || 0) === 1,
      supports_manual_reference: Number(capability.supports_manual_reference || 0) === 1,
      supports_browser_reference: Number(capability.supports_browser_reference || 0) === 1,
      supports_write_preview: Number(capability.supports_write_preview || 0) === 1,
      supports_listing_write_api: Number(capability.supports_listing_write_api || 0) === 1,
      supports_model_write_api: Number(capability.supports_model_write_api || 0) === 1,
      supports_boost_api: Number(capability.supports_boost_api || 0) === 1,
      supports_comment_api: Number(capability.supports_comment_api || 0) === 1,
      supports_violation_api: Number(capability.supports_violation_api || 0) === 1,
      supports_category_recommend_api: Number(capability.supports_category_recommend_api || 0) === 1,
      supports_attribute_recommend_api: Number(capability.supports_attribute_recommend_api || 0) === 1,
      status_counts: {
        normal: numberValue(state.normal_count),
        unlist: numberValue(state.unlist_count),
        banned: numberValue(state.banned_count),
        reviewing: numberValue(state.reviewing_count),
        deleted: numberValue(state.deleted_count),
        total: numberValue(state.total_count)
      },
      write_limits: {
        price_min: numberValue(limits.price_min),
        price_max: numberValue(limits.price_max),
        stock_min: numberValue(limits.stock_min),
        stock_max: numberValue(limits.stock_max),
        item_count_max: numberValue(limits.item_count_max),
        item_name_max: numberValue(limits.item_name_max),
        item_description_max: numberValue(limits.item_description_max),
        size_chart_mandatory: Number(limits.size_chart_mandatory || 0) === 1,
        dimension_mandatory: Number(limits.dimension_mandatory || 0) === 1,
        weight_mandatory: Number(limits.weight_mandatory || 0) === 1
      }
    }
  })

  const summary = shops.reduce((accumulator, row) => {
    accumulator.api_products += row.api_products
    accumulator.api_variations += row.api_variations
    accumulator.marketplace_stock += row.marketplace_stock
    accumulator.status_normal += row.status_counts.normal
    accumulator.status_unlist += row.status_counts.unlist
    accumulator.status_banned += row.status_counts.banned
    accumulator.status_reviewing += row.status_counts.reviewing
    accumulator.status_deleted += row.status_counts.deleted
    accumulator.status_total += row.status_counts.total
    return accumulator
  }, {
    api_products: 0,
    api_variations: 0,
    marketplace_stock: 0,
    status_normal: 0,
    status_unlist: 0,
    status_banned: 0,
    status_reviewing: 0,
    status_deleted: 0,
    status_total: 0
  })

  return {
    status: 'ok',
    settings,
    summary: {
      ...summary,
      shop_count: shops.length,
      ...capabilitySummary,
      ...discrepancies.summary
    },
    shops,
    discrepancies: discrepancies.mismatches,
    low_stock_rows: discrepancies.low_stock_rows,
    lazada_advanced_inventory: lazadaAdvancedInventory,
    audit,
    sku_warnings: {
      ...skuWarnings,
      complex_rows: discrepancies.complex_rows
    },
    history
  }
}
