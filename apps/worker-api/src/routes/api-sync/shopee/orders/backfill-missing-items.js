export function installApiSyncShopeeOrdersBackfillMissingItems(core) {
  const buildShopeeImportPayload = (...args) => core.buildShopeeImportPayload(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const fetchShopeeOrderDetails = (...args) => core.fetchShopeeOrderDetails(...args)
  const fetchShopeeShopJson = (...args) => core.fetchShopeeShopJson(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const importPayload = (...args) => core.importPayload(...args)
  const json = (...args) => core.json(...args)

  function parseBackfillBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue
    if (typeof value === 'boolean') return value
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
    return defaultValue
  }

  function parseBackfillLimit(value) {
    const number = Number(value || 50)
    if (!Number.isFinite(number)) return 50
    return Math.max(1, Math.min(Math.trunc(number), 50))
  }

  function missingItemsWhereClause(revenueOnly = true) {
    return `
      FROM orders_v2 o
      LEFT JOIN order_items i ON i.order_id = o.order_id
      WHERE LOWER(COALESCE(o.platform, '')) = 'shopee'
        AND LOWER(TRIM(COALESCE(o.shop, ''))) = LOWER(TRIM(?))
        AND i.order_id IS NULL
        ${revenueOnly ? 'AND COALESCE(o.revenue, 0) > 0' : ''}
    `
  }

  async function countMissingOrderItems(env, shop, revenueOnly) {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      ${missingItemsWhereClause(revenueOnly)}
    `).bind(shop).first()
    return Number(row?.total || 0)
  }

  async function selectMissingOrderIds(env, shop, limit, revenueOnly) {
    const { results } = await env.DB.prepare(`
      SELECT o.order_id
      ${missingItemsWhereClause(revenueOnly)}
      ORDER BY
        datetime(COALESCE(NULLIF(o.oms_updated_at, ''), NULLIF(o.order_date, ''), '1970-01-01')) DESC,
        o.order_id ASC
      LIMIT ?
    `).bind(shop, limit).all()
    return (results || []).map(row => cleanText(row.order_id)).filter(Boolean)
  }

  async function keepOrderIdsStillMissingItems(env, orderIds) {
    const ids = [...new Set((orderIds || []).map(cleanText).filter(Boolean))]
    if (!ids.length) return new Set()
    const stillMissing = new Set()
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const placeholders = chunk.map(() => '?').join(',')
      const { results } = await env.DB.prepare(`
        SELECT o.order_id
        FROM orders_v2 o
        LEFT JOIN order_items i ON i.order_id = o.order_id
        WHERE o.order_id IN (${placeholders})
          AND i.order_id IS NULL
      `).bind(...chunk).all()
      for (const row of results || []) stillMissing.add(cleanText(row.order_id))
    }
    return stillMissing
  }

  function hasShopeeItemList(order) {
    return Array.isArray(order?.item_list) && order.item_list.length > 0
  }

  async function backfillMissingOrderItems(env, cors, options = {}) {
    const platform = cleanText(options.platform || 'shopee').toLowerCase()
    const shopFilter = cleanText(options.shop)
    const limit = parseBackfillLimit(options.limit)
    const revenueOnly = parseBackfillBoolean(options.revenue_only ?? options.revenueOnly, true)
    const warnings = []

    if (platform !== 'shopee') {
      return json({
        status: 'error',
        mode: 'backfill_missing_order_items',
        platform,
        error: 'Endpoint này hiện chỉ hỗ trợ Shopee.'
      }, cors, 400)
    }
    if (!shopFilter) {
      return json({
        status: 'error',
        mode: 'shopee_backfill_missing_order_items',
        platform,
        error: 'Thiếu tham số shop. Ví dụ: shop=chihuy1984.'
      }, cors, 400)
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const apiShop = shops[0]
    if (!apiShop) {
      return json({
        status: 'error',
        mode: 'shopee_backfill_missing_order_items',
        platform,
        shop: shopFilter,
        error: 'Không tìm thấy shop Shopee có API trong cấu hình hiện có.'
      }, cors, 400)
    }
    if (!cleanText(apiShop.api_shop_id)) {
      return json({
        status: 'error',
        mode: 'shopee_backfill_missing_order_items',
        platform,
        shop: shopFilter,
        error: 'Shop Shopee thiếu api_shop_id nên không thể gọi get_order_detail.'
      }, cors, 400)
    }

    const missingBefore = await countMissingOrderItems(env, shopFilter, revenueOnly)
    const selectedOrderIds = await selectMissingOrderIds(env, shopFilter, limit, revenueOnly)
    let details = []
    let detailsWithItems = []
    let imported = { imported_orders: 0, imported_items: 0 }

    if (selectedOrderIds.length) {
      const fetchOrderDetail = params => fetchShopeeShopJson(env, apiShop, '/api/v2/order/get_order_detail', params)
      details = await fetchShopeeOrderDetails(fetchOrderDetail, selectedOrderIds)
      const stillMissing = await keepOrderIdsStillMissingItems(env, selectedOrderIds)
      detailsWithItems = details.filter(order => {
        const orderId = cleanText(order?.order_sn)
        if (!stillMissing.has(orderId)) return false
        if (hasShopeeItemList(order)) return true
        warnings.push({
          order_id: orderId,
          stage: 'order.get_order_detail',
          message: 'Shopee trả detail nhưng không có item_list, chưa import để tránh tạo item rỗng.'
        })
        return false
      })

      if (detailsWithItems.length) {
        // Backfill chỉ bổ sung item thật cho đơn đã tồn tại trong OMS; không trừ kho và không đẩy realtime lại.
        const payloadShop = { ...apiShop, shop_name: shopFilter }
        const payload = buildShopeeImportPayload(payloadShop, detailsWithItems)
        payload.suppress_push = true
        payload.skip_inventory = true
        payload.source_detail = 'Backfill order_items thiếu bằng Shopee get_order_detail theo danh sách order_id trong DB.'
        imported = await importPayload(env, cors, payload)
      }
    }

    const missingAfter = await countMissingOrderItems(env, shopFilter, revenueOnly)
    return json({
      status: 'ok',
      mode: 'shopee_backfill_missing_order_items',
      platform,
      shop: shopFilter,
      revenue_only: revenueOnly ? 1 : 0,
      limit,
      missing_before: missingBefore,
      selected_orders: selectedOrderIds.length,
      fetched_details: details.length,
      details_with_items: detailsWithItems.length,
      imported_orders: imported.imported_orders || 0,
      imported_items: imported.imported_items || 0,
      missing_after: missingAfter,
      sample_order_ids: selectedOrderIds.slice(0, 10),
      warnings,
      errors: []
    }, cors)
  }
  core.backfillMissingOrderItems = backfillMissingOrderItems

  async function handleBackfillMissingOrderItems(request, env, cors) {
    const url = new URL(request.url)
    let body = {}
    if (request.method !== 'GET') {
      try { body = await request.json() } catch {}
    }
    return backfillMissingOrderItems(env, cors, {
      platform: body.platform || url.searchParams.get('platform'),
      shop: body.shop || url.searchParams.get('shop'),
      limit: body.limit || url.searchParams.get('limit'),
      revenue_only: body.revenue_only ?? body.revenueOnly ?? url.searchParams.get('revenue_only')
    })
  }
  core.handleBackfillMissingOrderItems = handleBackfillMissingOrderItems
}
