import { listMarketplaceShopCapabilities, summarizeMarketplaceCapabilities } from '../marketplace/shop-capability-core.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function num(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function round2(value) {
  return Math.round(num(value) * 100) / 100
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback
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

async function safeFirst(env, sql, params = [], fallback = {}) {
  try {
    return await env.DB.prepare(sql).bind(...params).first() || fallback
  } catch {
    return fallback
  }
}

async function safeAll(env, sql, params = []) {
  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all()
    return results || []
  } catch {
    return []
  }
}

function shopSqlFilter(shop, alias = '') {
  const value = cleanText(shop)
  if (!value) return { sql: '', params: [] }
  const prefix = alias ? `${alias}.` : ''
  return { sql: ` AND ${prefix}shop = ?`, params: [value] }
}

const PROMOTION_ENDPOINT_COVERAGE = [
  {
    platform: 'shopee',
    module: 'Discount',
    read_endpoints: ['/api/v2/discount/get_discount_list', '/api/v2/discount/get_discount'],
    write_endpoints: ['/api/v2/discount/add_discount', '/api/v2/discount/update_discount', '/api/v2/discount/update_discount_item', '/api/v2/discount/end_discount'],
    core_status: 'đã xong',
    safe_status: 'write_live_guarded',
    note: 'Đã có sync read-only và đã mở update_discount_item với quyền admin, hộp xác nhận OK, log và guard dòng gộp phân loại.'
  },
  {
    platform: 'shopee',
    module: 'Voucher',
    read_endpoints: ['/api/v2/voucher/get_voucher_list', '/api/v2/voucher/get_voucher'],
    write_endpoints: ['/api/v2/voucher/add_voucher', '/api/v2/voucher/update_voucher', '/api/v2/voucher/end_voucher', '/api/v2/voucher/delete_voucher'],
    core_status: 'chưa làm',
    safe_status: 'write_live_guarded',
    note: 'Đã có sync read-only và route preview/apply ghi thật qua /api/discounts/shopee/promotion-action với quyền admin, xác nhận và log.'
  },
  {
    platform: 'shopee',
    module: 'Bundle Deal',
    read_endpoints: ['/api/v2/bundle_deal/get_bundle_deal_list', '/api/v2/bundle_deal/get_bundle_deal', '/api/v2/bundle_deal/get_bundle_deal_item'],
    write_endpoints: ['/api/v2/bundle_deal/add_bundle_deal', '/api/v2/bundle_deal/update_bundle_deal', '/api/v2/bundle_deal/end_bundle_deal'],
    core_status: 'chưa làm',
    safe_status: 'write_live_guarded',
    note: 'Đã có sync read-only và route preview/apply ghi thật cho tạo/sửa/xóa/kết thúc bundle.'
  },
  {
    platform: 'shopee',
    module: 'Add-On Deal',
    read_endpoints: ['/api/v2/add_on_deal/get_add_on_deal_list', '/api/v2/add_on_deal/get_add_on_deal', '/api/v2/add_on_deal/get_add_on_deal_main_item', '/api/v2/add_on_deal/get_add_on_deal_sub_item'],
    write_endpoints: ['/api/v2/add_on_deal/add_add_on_deal', '/api/v2/add_on_deal/update_add_on_deal', '/api/v2/add_on_deal/end_add_on_deal'],
    core_status: 'chưa làm',
    safe_status: 'write_live_guarded',
    note: 'Đã có sync read-only và route preview/apply ghi thật; main/sub item dùng action riêng theo endpoint Shopee.'
  },
  {
    platform: 'shopee',
    module: 'ShopFlashSale',
    read_endpoints: ['/api/v2/shop_flash_sale/get_shop_flash_sale_list', '/api/v2/shop_flash_sale/get_shop_flash_sale', '/api/v2/shop_flash_sale/get_shop_flash_sale_items'],
    write_endpoints: ['/api/v2/shop_flash_sale/create_shop_flash_sale', '/api/v2/shop_flash_sale/update_shop_flash_sale', '/api/v2/shop_flash_sale/delete_shop_flash_sale'],
    core_status: 'chưa làm',
    safe_status: 'write_live_guarded',
    note: 'Đã mở preview/apply tạo/sửa/xóa Flash Sale theo giờ qua Shopee API, có xác nhận admin và log payload.'
  },
  {
    platform: 'lazada',
    module: 'Seller Voucher API',
    read_endpoints: ['/promotion/vouchers/get', '/promotion/voucher/get', '/promotion/voucher/products/get'],
    write_endpoints: ['/promotion/voucher/create', '/promotion/voucher/update', '/promotion/voucher/activate', '/promotion/voucher/deactivate'],
    core_status: 'chưa làm',
    safe_status: 'locked',
    note: 'Đã có docs LazOP; chưa nối read-only sync vào D1.'
  },
  {
    platform: 'lazada',
    module: 'Free Shipping API',
    read_endpoints: ['/promotion/freeshippings/get', '/promotion/freeshipping/get', '/promotion/freeshipping/products/get', '/promotion/freeshipping/regions/get'],
    write_endpoints: ['/promotion/freeshipping/create', '/promotion/freeshipping/update', '/promotion/freeshipping/activate', '/promotion/freeshipping/deactivate'],
    core_status: 'chưa làm',
    safe_status: 'locked',
    note: 'Cần preview vùng, delivery option và ngân sách trước khi apply.'
  },
  {
    platform: 'lazada',
    module: 'Flexicombo API',
    read_endpoints: ['/promotion/flexicombo/list', '/promotion/flexicombo/details', '/promotion/flexicombo/products/list'],
    write_endpoints: ['/promotion/flexicombo/create', '/promotion/flexicombo/update', '/promotion/flexicombo/activate', '/promotion/flexicombo/deactivate'],
    core_status: 'chưa làm',
    safe_status: 'locked',
    note: 'Cần map SKU Lazada và mô phỏng combo trước khi apply.'
  },
  {
    platform: 'lazada',
    module: 'Early Bird Price API',
    read_endpoints: [],
    write_endpoints: ['/activity/early/bird/create', '/activity/early/bird/addSkus'],
    core_status: 'chưa làm',
    safe_status: 'locked',
    note: 'Chỉ có thao tác tạo/thêm SKU, chưa mở do tác động giá thật.'
  }
]

function promotionEndpointCoverage() {
  return PROMOTION_ENDPOINT_COVERAGE.map(row => {
    if (row.platform === 'shopee' && row.module === 'Voucher') {
      return {
        ...row,
        core_status: 'đã xong',
        safe_status: 'write_live_guarded',
        note: 'Đã có sync read-only vào marketplace_vouchers và route preview/apply tạo/sửa/xóa/kết thúc voucher thật.'
      }
    }
    if (row.platform === 'lazada' && row.module === 'Seller Voucher API') {
      return {
        ...row,
        core_status: 'đã xong',
        safe_status: 'write_locked',
        note: 'Đã có sync read-only vào marketplace_vouchers; tạo/sửa/kích hoạt/tắt voucher thật vẫn khóa an toàn.'
      }
    }
    if (row.platform === 'shopee' && ['Bundle Deal', 'Add-On Deal', 'ShopFlashSale'].includes(row.module)) {
      return {
        ...row,
        core_status: 'đã xong',
        safe_status: 'write_live_guarded',
        note: 'Đã có sync read-only vào marketplace_promotion_programs/items và route preview/apply ghi thật có xác nhận.'
      }
    }
    if (row.platform === 'lazada' && ['Free Shipping API', 'Flexicombo API'].includes(row.module)) {
      return {
        ...row,
        core_status: 'đã xong',
        safe_status: 'write_locked',
        note: 'Đã có sync read-only vào marketplace_promotion_programs/items; thao tác ghi thật vẫn khóa an toàn.'
      }
    }
    if (row.platform === 'lazada' && row.module === 'Early Bird Price API') {
      return {
        ...row,
        core_status: 'bị khóa an toàn',
        safe_status: 'preview_only_locked',
        note: 'Đã chốt chỉ dựng preview endpoint ghi giá; không mở vận hành apply thật cho tới khi có quy trình duyệt giá riêng.'
      }
    }
    return row
  })
}

function endpointIsDone(row) {
  return cleanText(row.core_status).toLowerCase().includes('xong')
}

function endpointIsPending(row) {
  const status = cleanText(row.core_status).toLowerCase()
  return !endpointIsDone(row) && (status.includes('ch') || status.includes('pending'))
}

function endpointIsLocked(row) {
  return cleanText(row.safe_status).toLowerCase().includes('locked')
}

async function loadDiscountSummary(env, options = {}) {
  if (!await tableExists(env, 'marketplace_discounts')) {
    return { total_promotions: 0, total_items: 0, active_promotions: 0, shops: 0, latest_synced_at: '', by_status: [] }
  }
  const shopFilter = shopSqlFilter(options.shop, 'd')
  const summary = await safeFirst(env, `
    SELECT COUNT(*) AS total_promotions,
           SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('ongoing','upcoming') AND is_current = 1 THEN 1 ELSE 0 END) AS active_promotions,
           COUNT(DISTINCT shop) AS shops,
           MAX(synced_at) AS latest_synced_at
    FROM marketplace_discounts d
    WHERE 1=1 ${shopFilter.sql}
  `, shopFilter.params)
  const itemSummary = await safeFirst(env, `
    SELECT COUNT(*) AS total_items,
           SUM(CASE WHEN COALESCE(promotion_stock, 0) > 0 THEN 1 ELSE 0 END) AS rows_with_promo_stock,
           AVG(CASE WHEN COALESCE(discount_percent, 0) > 0 THEN discount_percent END) AS avg_discount_percent
    FROM marketplace_discount_items d
    WHERE 1=1 ${shopFilter.sql}
  `, shopFilter.params)
  const byStatus = await safeAll(env, `
    SELECT LOWER(COALESCE(status, 'unknown')) AS status, COUNT(*) AS total
    FROM marketplace_discounts d
    WHERE 1=1 ${shopFilter.sql}
    GROUP BY LOWER(COALESCE(status, 'unknown'))
    ORDER BY total DESC
  `, shopFilter.params)
  return {
    total_promotions: num(summary.total_promotions),
    total_items: num(itemSummary.total_items),
    active_promotions: num(summary.active_promotions),
    shops: num(summary.shops),
    latest_synced_at: cleanText(summary.latest_synced_at),
    rows_with_promo_stock: num(itemSummary.rows_with_promo_stock),
    avg_discount_percent: round2(itemSummary.avg_discount_percent),
    by_status: byStatus
  }
}

async function loadVoucherSummary(env, options = {}) {
  if (!await tableExists(env, 'marketplace_vouchers')) {
    return { total_vouchers: 0, active_vouchers: 0, total_usage: 0, item_bound_vouchers: 0, shops: 0, latest_synced_at: '', by_status: [] }
  }
  const shopFilter = shopSqlFilter(options.shop, 'v')
  const platform = cleanText(options.platform).toLowerCase()
  const platformSql = platform ? ' AND LOWER(v.platform) = ?' : ''
  const params = platform ? [platform, ...shopFilter.params] : shopFilter.params
  const summary = await safeFirst(env, `
    SELECT COUNT(*) AS total_vouchers,
           SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('ongoing','upcoming') AND is_current = 1 THEN 1 ELSE 0 END) AS active_vouchers,
           SUM(COALESCE(current_usage, 0)) AS total_usage,
           SUM(CASE WHEN COALESCE(item_ids_json, '[]') NOT IN ('', '[]', '{}') THEN 1 ELSE 0 END) AS item_bound_vouchers,
           COUNT(DISTINCT shop) AS shops,
           MAX(synced_at) AS latest_synced_at
    FROM marketplace_vouchers v
    WHERE 1=1 ${platformSql} ${shopFilter.sql}
  `, params)
  const byStatus = await safeAll(env, `
    SELECT LOWER(COALESCE(status, 'unknown')) AS status, COUNT(*) AS total
    FROM marketplace_vouchers v
    WHERE 1=1 ${platformSql} ${shopFilter.sql}
    GROUP BY LOWER(COALESCE(status, 'unknown'))
    ORDER BY total DESC
  `, params)
  return {
    total_vouchers: num(summary.total_vouchers),
    active_vouchers: num(summary.active_vouchers),
    total_usage: num(summary.total_usage),
    item_bound_vouchers: num(summary.item_bound_vouchers),
    shops: num(summary.shops),
    latest_synced_at: cleanText(summary.latest_synced_at),
    by_status: byStatus
  }
}

async function loadPromotionProgramSummary(env, options = {}) {
  if (!await tableExists(env, 'marketplace_promotion_programs')) {
    return { total_programs: 0, active_programs: 0, total_items: 0, shops: 0, latest_synced_at: '', by_module: [], by_status: [] }
  }
  const shopFilter = shopSqlFilter(options.shop, 'p')
  const platform = cleanText(options.platform).toLowerCase()
  const platformSql = platform ? ' AND LOWER(p.platform) = ?' : ''
  const params = platform ? [platform, ...shopFilter.params] : shopFilter.params
  const summary = await safeFirst(env, `
    SELECT COUNT(*) AS total_programs,
           SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('ongoing','upcoming','enabled') AND is_current = 1 THEN 1 ELSE 0 END) AS active_programs,
           COUNT(DISTINCT shop) AS shops,
           MAX(synced_at) AS latest_synced_at
    FROM marketplace_promotion_programs p
    WHERE 1=1 ${platformSql} ${shopFilter.sql}
  `, params)
  const itemSummary = await safeFirst(env, `
    SELECT COUNT(*) AS total_items
    FROM marketplace_promotion_items p
    WHERE 1=1 ${platformSql} ${shopFilter.sql}
  `, params)
  const byModule = await safeAll(env, `
    SELECT platform, module,
           COUNT(*) AS total_programs,
           SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('ongoing','upcoming','enabled') AND is_current = 1 THEN 1 ELSE 0 END) AS active_programs,
           MAX(synced_at) AS latest_synced_at
    FROM marketplace_promotion_programs p
    WHERE 1=1 ${platformSql} ${shopFilter.sql}
    GROUP BY platform, module
    ORDER BY platform, module
  `, params)
  const byStatus = await safeAll(env, `
    SELECT platform, module, LOWER(COALESCE(status, 'unknown')) AS status, COUNT(*) AS total
    FROM marketplace_promotion_programs p
    WHERE 1=1 ${platformSql} ${shopFilter.sql}
    GROUP BY platform, module, LOWER(COALESCE(status, 'unknown'))
    ORDER BY platform, module, total DESC
  `, params)
  return {
    total_programs: num(summary.total_programs),
    active_programs: num(summary.active_programs),
    total_items: num(itemSummary.total_items),
    shops: num(summary.shops),
    latest_synced_at: cleanText(summary.latest_synced_at),
    by_module: byModule.map(row => ({
      ...row,
      total_programs: num(row.total_programs),
      active_programs: num(row.active_programs)
    })),
    by_status: byStatus.map(row => ({ ...row, total: num(row.total) }))
  }
}

async function loadPromotionPushSummary(env, options = {}) {
  if (!await tableExists(env, 'marketplace_webhook_events')) return { total: 0, last_seen_at: '', by_event: [] }
  const shopFilter = shopSqlFilter(options.shop)
  const byEvent = await safeAll(env, `
    SELECT event_code, COUNT(*) AS total, MAX(processed_at) AS last_seen_at
    FROM marketplace_webhook_events
    WHERE event_code IN ('item_promotion_push','promotion_update_push')
      ${shopFilter.sql}
    GROUP BY event_code
    ORDER BY total DESC
  `, shopFilter.params)
  return {
    total: byEvent.reduce((sum, row) => sum + num(row.total), 0),
    last_seen_at: byEvent.reduce((latest, row) => cleanText(row.last_seen_at) > latest ? cleanText(row.last_seen_at) : latest, ''),
    by_event: byEvent
  }
}

async function loadVoucherFinanceSummary(env, options = {}) {
  if (!await tableExists(env, 'order_fee_details')) return { orders: 0, seller_voucher: 0, co_funded_voucher: 0, latest_month: '' }
  const filter = cleanText(options.shop) ? ' AND shop = ?' : ''
  const params = cleanText(options.shop) ? [cleanText(options.shop)] : []
  const row = await safeFirst(env, `
    SELECT COUNT(*) AS orders,
           SUM(COALESCE(seller_voucher, 0)) AS seller_voucher,
           SUM(COALESCE(co_funded_voucher, 0)) AS co_funded_voucher,
           MAX(COALESCE(statement_month, substr(updated_at, 1, 7))) AS latest_month
    FROM order_fee_details
    WHERE (COALESCE(seller_voucher, 0) != 0 OR COALESCE(co_funded_voucher, 0) != 0)
      ${filter}
  `, params)
  return {
    orders: num(row.orders),
    seller_voucher: round2(row.seller_voucher),
    co_funded_voucher: round2(row.co_funded_voucher),
    latest_month: cleanText(row.latest_month)
  }
}

async function loadAdsOverlapSummary(env, options = {}) {
  if (!await tableExists(env, 'marketplace_ads_campaign_snapshots')) return { campaigns: 0, spend: 0, revenue: 0, sku_rows: [] }
  const shop = cleanText(options.shop)
  const shopFilter = shop ? ' AND a.shop = ?' : ''
  const summaryParams = shop ? [shop] : []
  const summary = await safeFirst(env, `
    SELECT COUNT(*) AS campaigns,
           SUM(COALESCE(spend, 0)) AS spend,
           SUM(COALESCE(revenue, 0)) AS revenue
    FROM marketplace_ads_campaign_snapshots a
    WHERE (COALESCE(spend, 0) > 0 OR COALESCE(clicks, 0) > 0)
      ${shopFilter}
  `, summaryParams)
  const unmatched = await safeFirst(env, `
    SELECT COUNT(*) AS campaigns,
           SUM(COALESCE(spend, 0)) AS spend
    FROM marketplace_ads_campaign_snapshots a
    WHERE (COALESCE(spend, 0) > 0 OR COALESCE(clicks, 0) > 0)
      AND TRIM(COALESCE(a.product_sku, '')) = ''
      ${shopFilter}
  `, summaryParams)
  const rowParams = shop ? [shop, shop] : []
  const skuRows = await safeAll(env, `
    SELECT v.platform, v.shop, v.product_name, v.platform_sku, v.internal_sku,
           COALESCE(v.discount_price, 0) AS discount_price,
           COALESCE(v.price, 0) AS price,
           COALESCE(v.stock, 0) AS stock,
           COUNT(a.campaign_id) AS ads_campaigns,
           SUM(COALESCE(a.spend, 0)) AS ads_spend,
           CASE WHEN COUNT(a.campaign_id) > 0 THEN 'matched_sku' ELSE 'unmatched_or_no_sku' END AS ads_match_status
    FROM product_variations v
    LEFT JOIN marketplace_ads_campaign_snapshots a
      ON TRIM(COALESCE(a.product_sku, '')) != ''
     AND (
       LOWER(TRIM(COALESCE(a.product_sku, ''))) = LOWER(TRIM(COALESCE(v.platform_sku, '')))
       OR LOWER(TRIM(COALESCE(a.product_sku, ''))) = LOWER(TRIM(COALESCE(v.internal_sku, '')))
     )
     AND a.shop = v.shop
     ${shop ? ' AND a.shop = ?' : ''}
    WHERE COALESCE(v.discount_price, 0) > 0
      ${shop ? ' AND v.shop = ?' : ''}
    GROUP BY v.platform, v.shop, v.product_name, v.platform_sku, v.internal_sku, v.discount_price, v.price, v.stock
    HAVING ads_campaigns > 0 OR stock > 0
    ORDER BY ads_spend DESC, stock DESC
    LIMIT ?
  `, [...rowParams, Math.min(Math.max(Number(options.limit || 20) || 20, 1), 100)])
  return {
    campaigns: num(summary.campaigns),
    spend: round2(summary.spend),
    revenue: round2(summary.revenue),
    unmatched_campaigns: num(unmatched.campaigns),
    unmatched_spend: round2(unmatched.spend),
    sku_rows: skuRows.map(row => ({
      ...row,
      discount_price: round2(row.discount_price),
      price: round2(row.price),
      stock: num(row.stock),
      ads_campaigns: num(row.ads_campaigns),
      ads_spend: round2(row.ads_spend),
      ads_match_status: cleanText(row.ads_match_status)
    }))
  }
}

async function loadPromotionKnowledgeSummary(env, options = {}) {
  if (!await tableExists(env, 'marketplace_product_knowledge')) return { listings: 0, affected_listings: 0, examples: [] }
  const shopFilter = cleanText(options.shop) ? ' AND shop = ?' : ''
  const params = cleanText(options.shop) ? [cleanText(options.shop)] : []
  const rows = await safeAll(env, `
    SELECT platform, shop, item_id, product_name, promotion_summary, updated_at
    FROM marketplace_product_knowledge
    WHERE COALESCE(promotion_summary, '') NOT IN ('', '[]')
      ${shopFilter}
    ORDER BY updated_at DESC
    LIMIT ?
  `, [...params, Math.min(Math.max(Number(options.limit || 20) || 20, 1), 100)])
  return {
    affected_listings: rows.length,
    examples: rows.map(row => ({
      platform: row.platform,
      shop: row.shop,
      item_id: row.item_id,
      product_name: row.product_name,
      promotion_count: Array.isArray(parseJson(row.promotion_summary, [])) ? parseJson(row.promotion_summary, []).length : 0,
      updated_at: row.updated_at
    }))
  }
}

export async function loadPromotionToolCore(env, options = {}) {
  const [capabilities, discountSummary, shopeeVoucherSummary, lazadaVoucherSummary, shopeeProgramSummary, lazadaProgramSummary, pushSummary, voucherFinance, adsOverlap, knowledgeSummary] = await Promise.all([
    listMarketplaceShopCapabilities(env, { limit: 500 }).catch(() => []),
    loadDiscountSummary(env, options),
    loadVoucherSummary(env, { ...options, platform: 'shopee' }),
    loadVoucherSummary(env, { ...options, platform: 'lazada' }),
    loadPromotionProgramSummary(env, { ...options, platform: 'shopee' }),
    loadPromotionProgramSummary(env, { ...options, platform: 'lazada' }),
    loadPromotionPushSummary(env, options),
    loadVoucherFinanceSummary(env, options),
    loadAdsOverlapSummary(env, options),
    loadPromotionKnowledgeSummary(env, options)
  ])
  const endpointCoverage = promotionEndpointCoverage()
  const endpointSummary = endpointCoverage.reduce((acc, row) => {
    acc.total_modules += 1
    if (endpointIsDone(row)) acc.done += 1
    if (endpointIsPending(row)) acc.pending += 1
    if (endpointIsLocked(row)) acc.locked += 1
    if (row.platform === 'shopee') acc.shopee += 1
    if (row.platform === 'lazada') acc.lazada += 1
    return acc
  }, { total_modules: 0, done: 0, pending: 0, locked: 0, shopee: 0, lazada: 0 })

  return {
    status: 'ok',
    mode: 'promotion_tool_core',
    source: [
      'marketplace_discounts / marketplace_discount_items',
      'marketplace_vouchers',
      'marketplace_promotion_programs / marketplace_promotion_items',
      'marketplace_webhook_events promotion push',
      'marketplace_ads_campaign_snapshots',
      'order_fee_details voucher fields',
      'marketplace_product_knowledge promotion_summary'
    ],
    summary: {
      endpoints: endpointSummary,
      capability: summarizeMarketplaceCapabilities(capabilities),
      discounts: discountSummary,
      shopee_vouchers: shopeeVoucherSummary,
      lazada_vouchers: lazadaVoucherSummary,
      shopee_programs: shopeeProgramSummary,
      lazada_programs: lazadaProgramSummary,
      promotion_push: pushSummary,
      voucher_finance: voucherFinance,
      ads_overlap: {
        campaigns: adsOverlap.campaigns,
        spend: adsOverlap.spend,
        revenue: adsOverlap.revenue,
        overlap_rows: adsOverlap.sku_rows.length,
        unmatched_campaigns: adsOverlap.unmatched_campaigns,
        unmatched_spend: adsOverlap.unmatched_spend
      },
      product_knowledge: {
        affected_listings: knowledgeSummary.affected_listings
      }
    },
    endpoint_coverage: endpointCoverage,
    ads_overlap_rows: adsOverlap.sku_rows,
    promotion_knowledge_examples: knowledgeSummary.examples,
    shop_api: 'Shop có API: Shopee Discount/Voucher/Bundle/Add-On/Flash Sale đã có preview/apply ghi thật có quyền admin, xác nhận và log; Lazada promotion hiện đọc cache/read-only.',
    shop_no_api: 'Shop không có API: chỉ dùng dữ liệu tham chiếu từ đơn/report/import/browser có kiểm soát, không gắn nhãn tạo voucher hoặc combo bằng Open Platform.',
    safety: 'Core này đọc và tổng hợp; các lệnh Shopee ghi thật đi qua preview, quyền admin, xác nhận và log request/response.',
    next_step: 'Tiếp theo là dựng form payload riêng thân thiện hơn cho từng module để giảm phải nhập JSON khi tạo mới Voucher/Bundle/Add-On/Flash.'
  }
}
