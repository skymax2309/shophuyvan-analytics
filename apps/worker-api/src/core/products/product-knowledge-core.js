function cleanText(value) {
  return String(value ?? '').trim()
}

function limitText(value, limit = 500) {
  return cleanText(value).slice(0, limit)
}

function safeJsonStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

function normalizeImages(product = {}) {
  const raw = [
    product.image_url,
    product.main_image,
    ...(Array.isArray(product.images) ? product.images : []),
    ...(Array.isArray(product.image?.image_url_list) ? product.image.image_url_list : [])
  ]
  return [...new Set(raw.map(cleanText).filter(Boolean))].slice(0, 20)
}

function normalizeVariations(product = {}) {
  return asArray(product.variations || product.models || product.model_list).map((variation, index) => ({
    variation_name: limitText(variation?.variation_name || variation?.model_name || variation?.name || (index ? `Phân loại ${index + 1}` : 'Mặc định'), 160),
    sku: limitText(variation?.sku || variation?.platform_sku || variation?.seller_sku || variation?.model_sku, 160),
    model_id: limitText(variation?.model_id || variation?.platform_variation_id, 160),
    price: Number(variation?.price || variation?.original_price || 0) || 0,
    discount_price: Number(variation?.discount_price || variation?.special_price || variation?.current_price || 0) || 0,
    stock: Number(variation?.stock ?? variation?.quantity ?? variation?.available ?? 0) || 0,
    image_url: cleanText(variation?.image_url || variation?.variation_image || variation?.main_image)
  })).filter(item => item.sku || item.variation_name || item.model_id)
}

function normalizeProductKnowledgeInput(input = {}) {
  const platform = cleanText(input.platform).toLowerCase()
  const shop = cleanText(input.shop)
  const shopId = cleanText(input.shop_id || input.shopId || input.api_shop_id)
  const product = input.product || input
  const itemId = cleanText(product.item_id || product.itemId || product.platform_item_id || product.id)
  if (!platform || !itemId) return null
  const variations = normalizeVariations(product)
  return {
    platform,
    shop,
    shop_id: shopId,
    platform_item_id: itemId,
    product_name: limitText(product.product_name || product.item_name || product.name, 500),
    description: limitText(product.description || product.short_description || product.detail, 30000),
    video_url: limitText(product.video_url || product.video || product.videoUrl, 1000),
    images: normalizeImages(product),
    category_id: limitText(product.category_id || product.primary_category || product.category, 500),
    brand_name: limitText(product.brand_name || product.brand || product.Brand, 500),
    item_sku: limitText(product.item_sku || product.seller_sku || product.SellerSku || variations[0]?.sku, 500),
    weight: limitText(product.weight || product.package_weight, 300),
    dimensions: product.dimensions || product.dimension || product.package_dimension || {},
    attributes: product.attributes || product.attribute_list || {},
    logistics: product.logistics || product.logistic_info || [],
    variations,
    promotion_summary: asArray(product.promotion_summary || product.promotions || product.promotion),
    violation_summary: asArray(product.violation_summary || product.violations || product.violation_list),
    suggested_categories: asArray(product.suggested_categories || product.suggested_category),
    deboost: Number(product.deboost || 0) ? 1 : 0,
    raw_listing: product.raw_listing || product.raw || product,
    source: cleanText(input.source || product.source || 'api') || 'api'
  }
}

async function addColumnIfMissing(env, tableName, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`).run()
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('duplicate column name')) throw error
  }
}

export async function ensureProductKnowledgeTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      platform_item_id TEXT NOT NULL,
      product_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      category_id TEXT DEFAULT '',
      brand_name TEXT DEFAULT '',
      item_sku TEXT DEFAULT '',
      weight TEXT DEFAULT '',
      dimensions TEXT DEFAULT '{}',
      attributes TEXT DEFAULT '[]',
      logistics TEXT DEFAULT '[]',
      variations TEXT DEFAULT '[]',
      promotion_summary TEXT DEFAULT '[]',
      violation_summary TEXT DEFAULT '[]',
      suggested_categories TEXT DEFAULT '[]',
      deboost INTEGER DEFAULT 0,
      raw_listing TEXT DEFAULT '{}',
      source TEXT DEFAULT 'api',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, platform_item_id)
    )
  `).run()

  await addColumnIfMissing(env, 'marketplace_product_knowledge', "shop_id TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "source TEXT DEFAULT 'api'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "promotion_summary TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "violation_summary TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "suggested_categories TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', 'deboost INTEGER DEFAULT 0')

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_knowledge_shop
    ON marketplace_product_knowledge(platform, shop, shop_id, updated_at)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_knowledge_sku
    ON marketplace_product_knowledge(platform, item_sku)
  `).run()
}

export async function saveProductKnowledgeBatch(env, input = {}) {
  await ensureProductKnowledgeTables(env)
  const products = Array.isArray(input.products) ? input.products : []
  const statements = []
  let skipped = 0

  for (const product of products) {
    const row = normalizeProductKnowledgeInput({ ...input, product })
    if (!row) {
      skipped += 1
      continue
    }
    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_product_knowledge
        (platform, shop, shop_id, platform_item_id, product_name, description, video_url,
         images, category_id, brand_name, item_sku, weight, dimensions, attributes,
         logistics, variations, promotion_summary, violation_summary, suggested_categories, deboost,
         raw_listing, source, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
      ON CONFLICT(platform, shop, platform_item_id) DO UPDATE SET
        shop_id = CASE WHEN excluded.shop_id != '' THEN excluded.shop_id ELSE marketplace_product_knowledge.shop_id END,
        product_name = CASE WHEN excluded.product_name != '' THEN excluded.product_name ELSE marketplace_product_knowledge.product_name END,
        description = CASE WHEN excluded.description != '' THEN excluded.description ELSE marketplace_product_knowledge.description END,
        video_url = CASE WHEN excluded.video_url != '' THEN excluded.video_url ELSE marketplace_product_knowledge.video_url END,
        images = CASE WHEN excluded.images != '[]' THEN excluded.images ELSE marketplace_product_knowledge.images END,
        category_id = CASE WHEN excluded.category_id != '' THEN excluded.category_id ELSE marketplace_product_knowledge.category_id END,
        brand_name = CASE WHEN excluded.brand_name != '' THEN excluded.brand_name ELSE marketplace_product_knowledge.brand_name END,
        item_sku = CASE WHEN excluded.item_sku != '' THEN excluded.item_sku ELSE marketplace_product_knowledge.item_sku END,
        weight = CASE WHEN excluded.weight != '' THEN excluded.weight ELSE marketplace_product_knowledge.weight END,
        dimensions = CASE WHEN excluded.dimensions != '{}' THEN excluded.dimensions ELSE marketplace_product_knowledge.dimensions END,
        attributes = CASE WHEN excluded.attributes != '{}' AND excluded.attributes != '[]' THEN excluded.attributes ELSE marketplace_product_knowledge.attributes END,
        logistics = CASE WHEN excluded.logistics != '[]' THEN excluded.logistics ELSE marketplace_product_knowledge.logistics END,
        variations = CASE WHEN excluded.variations != '[]' THEN excluded.variations ELSE marketplace_product_knowledge.variations END,
        promotion_summary = excluded.promotion_summary,
        violation_summary = excluded.violation_summary,
        suggested_categories = excluded.suggested_categories,
        deboost = excluded.deboost,
        raw_listing = CASE WHEN excluded.raw_listing != '{}' THEN excluded.raw_listing ELSE marketplace_product_knowledge.raw_listing END,
        source = excluded.source,
        updated_at = datetime('now', '+7 hours')
    `).bind(
      row.platform,
      row.shop,
      row.shop_id,
      row.platform_item_id,
      row.product_name,
      row.description,
      row.video_url,
      safeJsonStringify(row.images, '[]'),
      row.category_id,
      row.brand_name,
      row.item_sku,
      row.weight,
      safeJsonStringify(row.dimensions, '{}'),
      safeJsonStringify(row.attributes, '{}'),
      safeJsonStringify(row.logistics, '[]'),
      safeJsonStringify(row.variations, '[]'),
      safeJsonStringify(row.promotion_summary, '[]'),
      safeJsonStringify(row.violation_summary, '[]'),
      safeJsonStringify(row.suggested_categories, '[]'),
      row.deboost,
      limitText(safeJsonStringify(row.raw_listing, '{}'), 120000),
      row.source
    ))
  }

  for (let index = 0; index < statements.length; index += 50) {
    await env.DB.batch(statements.slice(index, index + 50))
  }
  return { saved: statements.length, skipped, source: 'product_knowledge_core' }
}
