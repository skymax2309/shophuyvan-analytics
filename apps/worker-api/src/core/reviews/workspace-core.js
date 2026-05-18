export function createReviewWorkspaceCore(ctx) {
  const {
    ensureReviewCoreTables,
    lowerText,
    cleanText,
    safeAll,
    safeFirst,
    buildReviewCatalogMaps,
    buildReviewKnowledgeMaps,
    pickReviewCatalogMatch,
    pickReviewKnowledgeMatch,
    isUnknownReviewProductName,
    numberValue,
    listReviewCatalogGaps,
    countReviewCatalogMappingGaps,
    normalizeReviewProductRiskOutput,
    reviewWhere,
    normalizeReviewOutput
  } = ctx;

  async function repairReviewCatalogMapping(env, options = {}) {
    await ensureReviewCoreTables(env)
    const limit = Math.max(1, Math.min(Number(options.limit || 300) || 300, 2000))
    const platform = lowerText(options.platform)
    const shop = cleanText(options.shop)
    const candidateFilters = [
      "COALESCE(platform_item_id, '') != ''",
      "(COALESCE(item_sku, '') = '' OR COALESCE(product_name, '') = '' OR LOWER(COALESCE(product_name, '')) = 'sản phẩm chưa rõ' OR COALESCE(shop_id, '') = '')"
    ]
    const candidateParams = []
    if (platform) {
      candidateFilters.push('LOWER(platform) = ?')
      candidateParams.push(platform)
    }
    if (shop) {
      candidateFilters.push('shop = ?')
      candidateParams.push(shop)
    }
    const reviewRows = await safeAll(env, `
      SELECT id, platform, shop, shop_id, review_id, platform_item_id, model_id, item_sku, product_name, reviewed_at, updated_at
      FROM marketplace_product_reviews
      WHERE ${candidateFilters.join(' AND ')}
      ORDER BY COALESCE(NULLIF(reviewed_at, ''), updated_at) DESC, id DESC
      LIMIT ?
    `, [...candidateParams, limit])
  
    if (!reviewRows.length) {
      return {
        status: 'ok',
        mode: 'review_catalog_repair',
        scanned: 0,
        matched: 0,
        updated: 0,
        remaining: 0,
        catalog_rows: 0,
        unresolved: [],
        match_modes: {},
        note: 'Không còn review nào thiếu SKU/tên/shop_id để repair từ catalog.'
      }
    }
  
    const catalogFilters = ["COALESCE(platform_item_id, '') != ''"]
    const catalogParams = []
    if (platform) {
      catalogFilters.push('LOWER(platform) = ?')
      catalogParams.push(platform)
    }
    if (shop) {
      catalogFilters.push('shop = ?')
      catalogParams.push(shop)
    }
    const catalogRows = await safeAll(env, `
      SELECT LOWER(platform) AS platform, shop, shop_id, platform_item_id, item_sku, product_name, updated_at
      FROM marketplace_product_catalog_snapshots
      WHERE ${catalogFilters.join(' AND ')}
    `, catalogParams)
    const knowledgeRows = await safeAll(env, `
      SELECT LOWER(platform) AS platform, shop, shop_id, platform_item_id, item_sku, product_name, variations, updated_at
      FROM marketplace_product_knowledge
      WHERE ${catalogFilters.join(' AND ')}
    `, catalogParams)
    const maps = buildReviewCatalogMaps(catalogRows)
    const knowledgeMaps = buildReviewKnowledgeMaps(knowledgeRows)
    const matchModes = {
      exact_shop_item: 0,
      shop_id_item: 0,
      unique_item: 0,
      knowledge_model: 0,
      knowledge_single_sku: 0
    }
    const updateStatements = []
    let matched = 0
  
    // Repair chỉ bù field còn thiếu hoặc placeholder, không ghi đè dữ liệu review đang có.
    for (const row of reviewRows) {
      const { match: catalogMatch, match_mode: catalogMode } = pickReviewCatalogMatch(row, maps)
      const { match: knowledgeMatch, match_mode: knowledgeMode } = pickReviewKnowledgeMatch(row, knowledgeMaps)
      if (!catalogMatch && !knowledgeMatch) continue
      matched += 1
      const matchMode = knowledgeMode || catalogMode
      if (matchModes[matchMode] !== undefined) matchModes[matchMode] += 1
      const nextShopId = cleanText(row.shop_id || catalogMatch?.shop_id || knowledgeMatch?.shop_id)
      const nextSku = cleanText(row.item_sku || knowledgeMatch?.item_sku || catalogMatch?.item_sku)
      const nextProductName = isUnknownReviewProductName(row.product_name)
        ? cleanText(catalogMatch?.product_name || knowledgeMatch?.product_name)
        : cleanText(row.product_name)
      const hasChanges = nextShopId !== cleanText(row.shop_id) ||
        nextSku !== cleanText(row.item_sku) ||
        nextProductName !== cleanText(row.product_name)
      if (!hasChanges) continue
      updateStatements.push(env.DB.prepare(`
        UPDATE marketplace_product_reviews
        SET shop_id = ?,
            item_sku = ?,
            product_name = ?,
            updated_at = datetime('now', '+7 hours')
        WHERE id = ?
      `).bind(
        nextShopId,
        nextSku,
        nextProductName,
        row.id
      ))
    }
  
    let updated = 0
    for (let index = 0; index < updateStatements.length; index += 40) {
      const results = await env.DB.batch(updateStatements.slice(index, index + 40))
      for (const result of results || []) updated += numberValue(result?.meta?.changes)
    }
  
    const unresolvedRows = await listReviewCatalogGaps(env, {
      platform,
      shop,
      limit: 10
    })
  
    return {
      status: 'ok',
      mode: 'review_catalog_repair',
      scanned: reviewRows.length,
      matched,
      updated,
      remaining: await countReviewCatalogMappingGaps(env, { platform, shop }),
      catalog_rows: catalogRows.length,
      knowledge_rows: knowledgeRows.length,
      unresolved: unresolvedRows.map(row => ({
        platform: row.platform,
        shop: row.shop,
        review_id: row.review_id,
        platform_item_id: row.platform_item_id,
        item_sku: row.item_sku,
        product_name: row.product_name,
        reviewed_at: row.reviewed_at || row.updated_at
      })),
      match_modes: matchModes,
      note: updated
        ? 'Đã bù SKU/tên/shop_id từ product catalog và listing knowledge cho review đang thiếu dữ liệu.'
        : 'Đã chạy repair nhưng chưa có catalog binding phù hợp; cần đồng bộ bài đăng cho các item còn thiếu.'
    }
  }
  
  async function loadReviewProductRisk(env, options = {}) {
    await ensureReviewCoreTables(env)
    const limit = Math.max(1, Math.min(Number(options.limit || 20) || 20, 100))
    const adsDays = Math.max(1, Math.min(Number(options.days || options.ads_days || 14) || 14, 90))
    const platform = lowerText(options.platform)
    const shop = cleanText(options.shop)
    const filters = ['r.is_negative = 1']
    const params = []
    if (platform) {
      filters.push('LOWER(r.platform) = ?')
      params.push(platform)
    }
    if (shop) {
      filters.push('r.shop = ?')
      params.push(shop)
    }
  
    // Review Shopee thường chỉ có item_id, nên gom qua catalog trước rồi mới so với ADS theo SKU/tên.
    const rows = await safeAll(env, `
      WITH catalog_by_item AS (
        SELECT LOWER(platform) AS platform, shop, platform_item_id,
               MAX(COALESCE(NULLIF(item_sku, ''), '')) AS item_sku,
               MAX(COALESCE(NULLIF(product_name, ''), '')) AS product_name
        FROM marketplace_product_catalog_snapshots
        WHERE COALESCE(platform_item_id, '') != ''
        GROUP BY LOWER(platform), shop, platform_item_id
      ),
      review_base AS (
        SELECT LOWER(r.platform) AS platform,
               r.shop,
               COALESCE(NULLIF(r.shop_id, ''), '') AS shop_id,
               COALESCE(NULLIF(r.platform_item_id, ''), NULLIF(p.platform_item_id, ''), '') AS platform_item_id,
               COALESCE(NULLIF(r.item_sku, ''), NULLIF(p.item_sku, ''), '') AS item_sku,
               COALESCE(NULLIF(r.product_name, ''), NULLIF(p.product_name, ''), 'Sản phẩm chưa rõ') AS product_name,
               r.review_id,
               r.can_reply,
               r.has_reply,
               r.rating_overall,
               r.review_text,
               COALESCE(NULLIF(r.reviewed_at, ''), r.updated_at) AS reviewed_at
        FROM marketplace_product_reviews r
        LEFT JOIN catalog_by_item p
          ON p.platform = LOWER(r.platform)
         AND p.shop = r.shop
         AND p.platform_item_id = r.platform_item_id
        WHERE ${filters.join(' AND ')}
      ),
      risk_groups AS (
        SELECT platform,
               shop,
               MAX(shop_id) AS shop_id,
               platform_item_id,
               item_sku,
               product_name,
               COUNT(DISTINCT review_id) AS negative_reviews,
               COUNT(DISTINCT CASE WHEN can_reply = 1 AND has_reply = 0 THEN review_id END) AS need_reply_reviews,
               MIN(CASE WHEN rating_overall > 0 THEN rating_overall END) AS min_rating,
               AVG(CASE WHEN rating_overall > 0 THEN rating_overall END) AS avg_rating,
               MAX(reviewed_at) AS latest_reviewed_at,
               MAX(CASE WHEN COALESCE(review_text, '') != '' THEN review_text ELSE '' END) AS sample_review_text
        FROM review_base
        GROUP BY platform, shop, platform_item_id, item_sku, product_name
      )
      SELECT g.*,
             COALESCE((
               SELECT SUM(a.spend)
               FROM marketplace_ads_campaign_snapshots a
               WHERE LOWER(a.platform) = g.platform
                 AND a.shop = g.shop
                 AND COALESCE(a.spend, 0) > 0
                 AND date(COALESCE(NULLIF(a.snapshot_date, ''), '1970-01-01')) >= date('now', '+7 hours', '-${adsDays} days')
                 AND (
                   (COALESCE(g.item_sku, '') != '' AND a.product_sku = g.item_sku)
                   OR (COALESCE(g.product_name, '') != '' AND a.product_name = g.product_name)
                 )
             ), 0) AS ads_spend_14d,
             COALESCE((
               SELECT SUM(a.revenue)
               FROM marketplace_ads_campaign_snapshots a
               WHERE LOWER(a.platform) = g.platform
                 AND a.shop = g.shop
                 AND COALESCE(a.spend, 0) > 0
                 AND date(COALESCE(NULLIF(a.snapshot_date, ''), '1970-01-01')) >= date('now', '+7 hours', '-${adsDays} days')
                 AND (
                   (COALESCE(g.item_sku, '') != '' AND a.product_sku = g.item_sku)
                   OR (COALESCE(g.product_name, '') != '' AND a.product_name = g.product_name)
                 )
             ), 0) AS ads_revenue_14d,
             COALESCE((
               SELECT COUNT(DISTINCT a.campaign_id)
               FROM marketplace_ads_campaign_snapshots a
               WHERE LOWER(a.platform) = g.platform
                 AND a.shop = g.shop
                 AND COALESCE(a.spend, 0) > 0
                 AND date(COALESCE(NULLIF(a.snapshot_date, ''), '1970-01-01')) >= date('now', '+7 hours', '-${adsDays} days')
                 AND (
                   (COALESCE(g.item_sku, '') != '' AND a.product_sku = g.item_sku)
                   OR (COALESCE(g.product_name, '') != '' AND a.product_name = g.product_name)
                 )
             ), 0) AS ads_campaigns,
             COALESCE((
               SELECT MAX(a.snapshot_date)
               FROM marketplace_ads_campaign_snapshots a
               WHERE LOWER(a.platform) = g.platform
                 AND a.shop = g.shop
                 AND COALESCE(a.spend, 0) > 0
                 AND date(COALESCE(NULLIF(a.snapshot_date, ''), '1970-01-01')) >= date('now', '+7 hours', '-${adsDays} days')
                 AND (
                   (COALESCE(g.item_sku, '') != '' AND a.product_sku = g.item_sku)
                   OR (COALESCE(g.product_name, '') != '' AND a.product_name = g.product_name)
                 )
             ), '') AS latest_ads_snapshot_date
      FROM risk_groups g
      ORDER BY ads_spend_14d DESC, negative_reviews DESC, latest_reviewed_at DESC
      LIMIT ?
    `, [...params, limit])
  
    const normalizedRows = rows.map(normalizeReviewProductRiskOutput)
    const summary = normalizedRows.reduce((accumulator, row) => {
      accumulator.returned_products += 1
      accumulator.negative_reviews += row.negative_reviews
      accumulator.need_reply_reviews += row.need_reply_reviews
      accumulator.ads_spend_14d += row.ads_spend_14d
      accumulator.ads_revenue_14d += row.ads_revenue_14d
      if (row.has_ads_risk) accumulator.ads_risk_products += 1
      return accumulator
    }, {
      returned_products: 0,
      negative_reviews: 0,
      need_reply_reviews: 0,
      ads_risk_products: 0,
      ads_spend_14d: 0,
      ads_revenue_14d: 0,
      ads_days: adsDays
    })
  
    return {
      status: 'ok',
      mode: 'review_product_risk_core',
      summary,
      rows: normalizedRows,
      shop_api: 'Shop có API: review được đọc từ Shopee/Lazada API, sau đó core map qua catalog để cảnh báo sản phẩm/SKU có đánh giá xấu.',
      shop_no_api: 'Shop không có API: chưa tự đọc review; chỉ hiển thị nếu đã có cache/import review thủ công ở bảng core.',
      next_step: 'Bước sau là mở hàng đợi duyệt trả lời review thật, có preview payload và log trước khi gửi lên sàn.'
    }
  }
  
  async function loadReviewCore(env, options = {}) {
    await ensureReviewCoreTables(env)
    const limit = Math.max(1, Math.min(Number(options.limit || 20) || 20, 100))
    const { where, params } = reviewWhere(options)
    const catalogGapCountPromise = countReviewCatalogMappingGaps(env, options)
    const catalogGapSamplesPromise = listReviewCatalogGaps(env, {
      ...options,
      limit: Math.min(limit, 5)
    })
    const summary = await safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN is_negative = 1 THEN 1 ELSE 0 END) AS negative,
             SUM(CASE WHEN can_reply = 1 AND has_reply = 0 THEN 1 ELSE 0 END) AS need_reply,
             SUM(CASE WHEN has_media = 1 THEN 1 ELSE 0 END) AS with_media,
             MAX(synced_at) AS last_synced_at
      FROM marketplace_product_reviews
      ${where}
    `, params)
    const byShop = await safeAll(env, `
      SELECT platform, shop, COUNT(*) AS total,
             SUM(CASE WHEN is_negative = 1 THEN 1 ELSE 0 END) AS negative,
             SUM(CASE WHEN can_reply = 1 AND has_reply = 0 THEN 1 ELSE 0 END) AS need_reply,
             MAX(synced_at) AS last_synced_at
      FROM marketplace_product_reviews
      ${where}
      GROUP BY platform, shop
      ORDER BY negative DESC, need_reply DESC, total DESC
      LIMIT 10
    `, params)
    const recent = await safeAll(env, `
      SELECT *
      FROM marketplace_product_reviews
      ${where}
      ORDER BY COALESCE(NULLIF(reviewed_at, ''), updated_at) DESC, id DESC
      LIMIT ?
    `, [...params, limit])
    const attention = await safeAll(env, `
      SELECT *
      FROM marketplace_product_reviews
      ${where ? `${where} AND` : 'WHERE'} (is_negative = 1 OR (can_reply = 1 AND has_reply = 0))
      ORDER BY is_negative DESC, can_reply DESC, COALESCE(NULLIF(reviewed_at, ''), updated_at) DESC
      LIMIT ?
    `, [...params, limit])
    const productRisk = await loadReviewProductRisk(env, {
      limit,
      platform: options.platform,
      shop: options.shop
    })
    const [catalogGapCount, catalogGapSamples] = await Promise.all([
      catalogGapCountPromise,
      catalogGapSamplesPromise
    ])
    const adsRisk = productRisk.rows.filter(row => row.has_ads_risk).slice(0, limit)
  
    return {
      status: 'ok',
      mode: 'review_core',
      summary: {
        total_reviews: numberValue(summary?.total),
        negative_reviews: numberValue(summary?.negative),
        need_reply_reviews: numberValue(summary?.need_reply),
        with_media_reviews: numberValue(summary?.with_media),
        ads_risk_reviews: numberValue(productRisk.summary?.ads_risk_products),
        catalog_gap_reviews: catalogGapCount,
        last_synced_at: cleanText(summary?.last_synced_at)
      },
      by_shop: byShop.map(row => ({
        platform: lowerText(row.platform),
        shop: cleanText(row.shop),
        total_reviews: numberValue(row.total),
        negative_reviews: numberValue(row.negative),
        need_reply_reviews: numberValue(row.need_reply),
        last_synced_at: cleanText(row.last_synced_at)
      })),
      attention: attention.map(normalizeReviewOutput),
      recent: recent.map(normalizeReviewOutput),
      ads_risk: adsRisk.map(row => ({
        platform: row.platform,
        shop: row.shop,
        review_id: '',
        platform_item_id: row.platform_item_id,
        item_sku: row.item_sku,
        product_name: row.product_name,
        rating_overall: row.min_rating,
        review_text: row.sample_review_text,
        campaign_id: '',
        campaign_name: `${row.ads_campaigns} campaign ADS`,
        spend: row.ads_spend_14d,
        revenue: row.ads_revenue_14d,
        snapshot_date: row.latest_ads_snapshot_date
      })),
      product_risk_summary: productRisk.summary,
      catalog_gap_samples: catalogGapSamples,
      shop_api: 'Shop có API: đọc review Shopee/Lazada vào bảng core, lọc đánh giá xấu/chưa trả lời; reply thật vẫn khóa bằng preview/log.',
      shop_no_api: 'Shop không có API: chưa gọi sàn, dùng rating/comment_count từ catalog đã cache hoặc nhập file đánh giá thủ công ở phase sau.',
      safety: {
        read_only_sync: true,
        reply_apply_locked: true,
        live_reply_requires: ['preview_payload', 'admin_role', 'manual_confirm', 'result_log']
      },
      next_step: 'Mở quy trình duyệt reply thật theo từng review, có preview payload, quyền admin và log kết quả trước khi gửi lên sàn.'
    }
  }

  return {
    repairReviewCatalogMapping,
    loadReviewProductRisk,
    loadReviewCore
  };
}
