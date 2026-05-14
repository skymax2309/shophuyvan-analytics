// NEO: Backend worker chat sàn - nhóm product-knowledge-query. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function loadProductKnowledgeForChat(env, conversation, messages = [], orderSkus = []) {
  if (!conversation || !(await tableExists(env, 'marketplace_product_knowledge'))) {
    return {
      product_catalog_summary: { total_products: 0, loaded_from_api: false },
      product_catalog_index: [],
      product_catalog: []
    }
  }

  const platform = cleanText(conversation.platform).toLowerCase()
  const shop = cleanText(conversation.shop || conversation.shop_id)
  const shopId = cleanText(conversation.shop_id || conversation.shop)
  const aliases = await resolveProductContextShopAliases(env, platform, shop, shopId)
  const aliasPlaceholders = aliases.length ? aliases.map(() => '?').join(',') : "''"
  const aliasParams = aliases.length ? aliases : []
  const platformParams = [platform, platform]
  const where = `
    (? = '' OR lower(platform) = ?)
    AND (${aliases.length ? `shop IN (${aliasPlaceholders}) OR shop_id IN (${aliasPlaceholders})` : '1 = 1'})
  `

  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS total_products, MAX(updated_at) AS latest_synced_at
    FROM marketplace_product_knowledge
    WHERE ${where}
  `).bind(...platformParams, ...aliasParams, ...aliasParams).first().catch(() => null)

  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, platform_item_id, product_name, description, video_url,
           images, category_id, brand_name, item_sku, weight, dimensions, attributes,
           logistics, variations, source, updated_at, created_at
    FROM marketplace_product_knowledge
    WHERE ${where}
    ORDER BY datetime(COALESCE(NULLIF(updated_at, ''), created_at)) DESC, id DESC
    LIMIT 500
  `).bind(...platformParams, ...aliasParams, ...aliasParams).all()

  const rows = results || []
  const terms = extractProductKnowledgeTerms(conversation, messages, orderSkus)
  const scored = rows.map((row, index) => ({
    row,
    index,
    score: scoreKnowledgeRow(row, terms, orderSkus)
  })).sort((a, b) => b.score - a.score || a.index - b.index)

  const indexRows = scored.slice(0, 80).map(item => compactProductKnowledgeRow(item.row, false))
  // Context mở hội thoại chỉ cần top catalog gọn; tìm sâu dùng /api/chat/products để tránh payload quá lớn.
  const detailRows = scored.slice(0, 8).map(item => compactProductKnowledgeRow(item.row, true))
  const inStockProducts = rows.reduce((sum, row) => {
    const variations = productArray(row.variations)
    return sum + (variations.some(item => Number(item.stock || 0) > 0) ? 1 : 0)
  }, 0)
  const totalVariations = rows.reduce((sum, row) => sum + productArray(row.variations).length, 0)
  const totalProducts = Number(countRow?.total_products || rows.length || 0)

  return {
    product_catalog_summary: {
      loaded_from_api: rows.length > 0,
      total_products: totalProducts,
      scanned_products: rows.length,
      prompt_index_products: indexRows.length,
      prompt_detail_products: detailRows.length,
      total_variations: totalVariations,
      in_stock_products: inStockProducts,
      latest_synced_at: cleanText(countRow?.latest_synced_at),
      shop_aliases: aliases
    },
    product_catalog_index: indexRows,
    product_catalog: detailRows
  }
}

function compactVoucherEvent(row) {
  const payload = safeJsonParse(row.payload, {})
  const body = payload?.body || payload
  return {
    id: Number(row.id || 0),
    platform: cleanText(row.platform),
    shop: cleanText(row.shop),
    event_code: cleanText(row.event_code),
    promotion_id: cleanText(body?.promotion_id || body?.promotionId || body?.voucher_id || body?.voucherId),
    item_id: cleanText(body?.item_id || body?.itemId),
    status: cleanText(row.status),
    message: cleanText(row.message),
    processed_at: cleanText(row.processed_at)
  }
}

Object.assign(globalThis, {
  loadProductKnowledgeForChat,
  compactVoucherEvent
})
