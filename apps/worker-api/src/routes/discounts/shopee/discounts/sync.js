export function installDiscountsShopeeDiscountsSync(core) {
  const SHOPEE_DISCOUNT_DETAIL_PATH = core.SHOPEE_DISCOUNT_DETAIL_PATH
  const SHOPEE_DISCOUNT_LIST_PATH = core.SHOPEE_DISCOUNT_LIST_PATH
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const fetchShopeeJsonGet = (...args) => core.fetchShopeeJsonGet(...args)
  const getApiShops = core.getApiShops
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const num = (...args) => core.num(...args)
  const round2 = (...args) => core.round2(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)

  function normalizeDiscountList(data, shop) {
    const list = Array.isArray(data?.response?.discount_list) ? data.response.discount_list : []
    const shopName = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
    return list.map(row => ({
      platform: 'shopee',
      shop: shopName,
      api_shop_id: String(shop.api_shop_id || ''),
      discount_id: cleanText(row.discount_id),
      discount_name: cleanText(row.discount_name),
      status: cleanText(row.status).toLowerCase(),
      source: Math.round(num(row.source)),
      start_time: Math.round(num(row.start_time)),
      end_time: Math.round(num(row.end_time)),
      item_count: 0,
      raw_data: compactJson(row, 12000),
      request_id: cleanText(data?.request_id)
    })).filter(row => row.discount_id)
  }
  core.normalizeDiscountList = normalizeDiscountList

  function discountPercent(originalPrice, promotionPrice) {
    const original = num(originalPrice)
    const promo = num(promotionPrice)
    if (!original || !promo || promo >= original) return 0
    return round2((1 - promo / original) * 100)
  }
  core.discountPercent = discountPercent

  function normalizeDiscountDetail(data, shop, discountId) {
    const response = data?.response || {}
    const shopName = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
    const itemList = Array.isArray(response.item_list) ? response.item_list : []
    const rows = []
    for (const item of itemList) {
      const base = {
        platform: 'shopee',
        shop: shopName,
        api_shop_id: String(shop.api_shop_id || ''),
        discount_id: cleanText(response.discount_id || discountId),
        discount_name: cleanText(response.discount_name),
        status: cleanText(response.status).toLowerCase(),
        item_id: cleanText(item.item_id),
        item_name: cleanText(item.item_name),
        purchase_limit: Math.round(num(item.purchase_limit))
      }
      const models = Array.isArray(item.model_list) ? item.model_list : []
      if (models.length) {
        for (const model of models) {
          const original = round2(model.model_local_price || model.model_original_price)
          const promo = round2(model.model_local_promotion_price || model.model_promotion_price)
          rows.push({
            ...base,
            model_id: cleanText(model.model_id),
            model_name: cleanText(model.model_name),
            normal_stock: Math.round(num(model.model_normal_stock)),
            promotion_stock: Math.round(num(model.model_promotion_stock)),
            original_price: original,
            promotion_price: promo,
            discount_percent: discountPercent(original, promo),
            raw_data: compactJson({ item, model }, 18000)
          })
        }
      } else {
        const original = round2(item.item_local_price || item.item_original_price)
        const promo = round2(item.item_local_promotion_price || item.item_promotion_price)
        rows.push({
          ...base,
          model_id: '',
          model_name: '',
          normal_stock: Math.round(num(item.normal_stock)),
          promotion_stock: Math.round(num(item.item_promotion_stock)),
          original_price: original,
          promotion_price: promo,
          discount_percent: discountPercent(original, promo),
          raw_data: compactJson(item, 18000)
        })
      }
    }
    return {
      discount: {
        platform: 'shopee',
        shop: shopName,
        api_shop_id: String(shop.api_shop_id || ''),
        discount_id: cleanText(response.discount_id || discountId),
        discount_name: cleanText(response.discount_name),
        status: cleanText(response.status).toLowerCase(),
        start_time: Math.round(num(response.start_time)),
        end_time: Math.round(num(response.end_time)),
        item_count: rows.length,
        detail_raw_data: compactJson(response),
        request_id: cleanText(data?.request_id)
      },
      items: rows,
      more: Boolean(response.more)
    }
  }
  core.normalizeDiscountDetail = normalizeDiscountDetail

  async function saveDiscounts(env, shop, discounts, details = [], options = {}) {
    await ensureShopeeDiscountTables(env)
    const apiShopId = String(shop.api_shop_id || discounts?.[0]?.api_shop_id || details?.[0]?.api_shop_id || '')
    const fullSync = options.fullSync !== false
    if (fullSync) {
      await env.DB.prepare(`
        UPDATE marketplace_discounts
        SET is_current = 0,
            updated_at = datetime('now', '+7 hours')
        WHERE platform = 'shopee' AND api_shop_id = ?
      `).bind(apiShopId).run()
    }

    let savedDiscounts = 0
    let savedItems = 0
    for (const row of discounts || []) {
      await env.DB.prepare(`
        INSERT INTO marketplace_discounts (
          platform, shop, api_shop_id, discount_id, discount_name, status, source,
          start_time, end_time, is_current, item_count, raw_data, detail_raw_data,
          request_id, synced_at, updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
        ON CONFLICT(platform, api_shop_id, discount_id) DO UPDATE SET
          shop = excluded.shop,
          discount_name = excluded.discount_name,
          status = excluded.status,
          source = excluded.source,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          is_current = 1,
          item_count = CASE WHEN excluded.item_count > 0 THEN excluded.item_count ELSE marketplace_discounts.item_count END,
          raw_data = excluded.raw_data,
          request_id = excluded.request_id,
          synced_at = excluded.synced_at,
          updated_at = excluded.updated_at
      `).bind(
        row.platform, row.shop, row.api_shop_id, row.discount_id, row.discount_name,
        row.status, row.source, row.start_time, row.end_time, row.item_count,
        row.raw_data, row.detail_raw_data || '{}', row.request_id
      ).run()
      savedDiscounts++
    }

    for (const detail of details || []) {
      const d = detail.discount || {}
      if (d.discount_id) {
        await env.DB.prepare(`
          UPDATE marketplace_discounts
          SET discount_name = COALESCE(NULLIF(?, ''), discount_name),
              status = COALESCE(NULLIF(?, ''), status),
              start_time = CASE WHEN ? > 0 THEN ? ELSE start_time END,
              end_time = CASE WHEN ? > 0 THEN ? ELSE end_time END,
              item_count = ?,
              detail_raw_data = ?,
              request_id = COALESCE(NULLIF(?, ''), request_id),
              updated_at = datetime('now', '+7 hours')
          WHERE platform = 'shopee' AND api_shop_id = ? AND discount_id = ?
        `).bind(
          d.discount_name, d.status, d.start_time, d.start_time, d.end_time, d.end_time,
          detail.items.length, d.detail_raw_data || '{}', d.request_id,
          d.api_shop_id, d.discount_id
        ).run()
      }
      for (const item of detail.items || []) {
        await env.DB.prepare(`
          INSERT INTO marketplace_discount_items (
            platform, shop, api_shop_id, discount_id, discount_name, status,
            item_id, item_name, model_id, model_name, normal_stock, promotion_stock,
            original_price, promotion_price, discount_percent, purchase_limit,
            raw_data, synced_at, updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
          ON CONFLICT(platform, api_shop_id, discount_id, item_id, model_id) DO UPDATE SET
            shop = excluded.shop,
            discount_name = excluded.discount_name,
            status = excluded.status,
            item_name = excluded.item_name,
            model_name = excluded.model_name,
            normal_stock = excluded.normal_stock,
            promotion_stock = excluded.promotion_stock,
            original_price = excluded.original_price,
            promotion_price = excluded.promotion_price,
            discount_percent = excluded.discount_percent,
            purchase_limit = excluded.purchase_limit,
            raw_data = excluded.raw_data,
            synced_at = excluded.synced_at,
            updated_at = excluded.updated_at
        `).bind(
          item.platform, item.shop, item.api_shop_id, item.discount_id, item.discount_name,
          item.status, item.item_id, item.item_name, item.model_id, item.model_name,
          item.normal_stock, item.promotion_stock, item.original_price, item.promotion_price,
          item.discount_percent, item.purchase_limit, item.raw_data
        ).run()
        savedItems++
      }
    }
    return { saved_discounts: savedDiscounts, saved_items: savedItems }
  }
  core.saveDiscounts = saveDiscounts

  async function latestDiscountSyncUnix(env, shop) {
    await ensureShopeeDiscountTables(env)
    const apiShopId = String(shop.api_shop_id || '')
    const row = await env.DB.prepare(`
      SELECT
        MAX(synced_at) AS latest_synced_at,
        CAST(strftime('%s', MAX(synced_at), '-7 hours') AS INTEGER) AS latest_unix
      FROM marketplace_discounts
      WHERE platform = 'shopee' AND api_shop_id = ?
    `).bind(apiShopId).first()
    const latestUnix = Number(row?.latest_unix || 0)
    return {
      latest_synced_at: row?.latest_synced_at || '',
      // Trừ thêm 1 ngày để tránh lệch múi giờ hoặc Shopee trả dữ liệu cập nhật trễ.
      update_time_from: latestUnix ? Math.max(0, latestUnix - 86400) : 0
    }
  }
  core.latestDiscountSyncUnix = latestDiscountSyncUnix

  async function fetchDiscountDetailPages(env, shop, discountId, pageLimit = 10, pageSize = 50) {
    const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
    const buildUrl = signShopeeUrl(app, SHOPEE_DISCOUNT_DETAIL_PATH, shop.access_token, shop.api_shop_id)
    const detailRows = []
    let mergedDiscount = null
    let pageNo = 1
    let more = false
    do {
      const data = await fetchShopeeJsonGet(buildUrl, {
        discount_id: discountId,
        page_no: pageNo,
        page_size: pageSize
      })
      const detail = normalizeDiscountDetail(data, shop, discountId)
      mergedDiscount = detail.discount
      detailRows.push(...detail.items)
      more = detail.more
      pageNo++
    } while (more && pageNo <= pageLimit)
    return { discount: mergedDiscount || {}, items: detailRows, pages: pageNo - 1, has_more: more }
  }
  core.fetchDiscountDetailPages = fetchDiscountDetailPages

  async function syncShopeeDiscountShop(env, shop, options = {}) {
    const discountStatus = cleanText(options.discount_status || options.status || 'ongoing').toLowerCase() || 'ongoing'
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 100) || 100, 1), 100)
    const pageLimit = Math.min(Math.max(Number(options.page_limit || options.pageLimit || 5) || 5, 1), 30)
    const includeDetail = String(options.include_detail ?? options.includeDetail ?? '1') !== '0'
    const detailLimit = Math.min(Math.max(Number(options.detail_limit || options.detailLimit || 80) || 80, 0), 500)
    const detailPageLimit = Math.min(Math.max(Number(options.detail_page_limit || options.detailPageLimit || 10) || 10, 1), 30)
    const incremental = ['1', 'true', 'yes'].includes(String(options.incremental || options.delta || '').toLowerCase())
    const shopName = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
    const cacheCursor = incremental && !options.update_time_from
      ? await latestDiscountSyncUnix(env, shop)
      : { latest_synced_at: '', update_time_from: 0 }
    const resultBase = {
      shop: shopName,
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      endpoint: SHOPEE_DISCOUNT_LIST_PATH,
      discount_status: discountStatus,
      cache_mode: incremental ? 'incremental' : 'full',
      latest_synced_at: cacheCursor.latest_synced_at || ''
    }
    if (!shop.access_token || !shop.api_shop_id) {
      return { ...resultBase, ok: false, error: 'missing_token_or_shop_id', message: 'Shop chưa có access_token hoặc api_shop_id', discounts: [], details: [] }
    }

    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shopName)
      const buildUrl = signShopeeUrl(app, SHOPEE_DISCOUNT_LIST_PATH, shop.access_token, shop.api_shop_id)
      const discounts = []
      const details = []
      let pageNo = 1
      let more = false
      do {
        const params = {
          discount_status: discountStatus,
          page_no: pageNo,
          page_size: pageSize
        }
        const updateTimeFrom = Number(options.update_time_from || cacheCursor.update_time_from || 0)
        const updateTimeTo = Number(options.update_time_to || Math.floor(Date.now() / 1000))
        // Sync incremental chỉ kéo discount có thay đổi sau lần cache gần nhất để giảm request và không ghi đè cache cũ.
        if (incremental && updateTimeFrom > 0) params.update_time_from = updateTimeFrom
        if (incremental && updateTimeFrom > 0) params.update_time_to = updateTimeTo
        const data = await fetchShopeeJsonGet(buildUrl, params)
        discounts.push(...normalizeDiscountList(data, shop))
        more = Boolean(data?.response?.more)
        pageNo++
      } while (more && pageNo <= pageLimit)

      if (includeDetail) {
        for (const discount of discounts.slice(0, detailLimit)) {
          try {
            const detail = await fetchDiscountDetailPages(env, shop, discount.discount_id, detailPageLimit, 50)
            details.push(detail)
          } catch (error) {
            details.push({ discount: { ...discount }, items: [], error: error?.message || String(error) })
          }
        }
      }

      const saved = await saveDiscounts(env, shop, discounts, details, { fullSync: !incremental })
      return {
        ...resultBase,
        ok: true,
        update_time_from: incremental ? Number(options.update_time_from || cacheCursor.update_time_from || 0) : 0,
        update_time_to: incremental ? Number(options.update_time_to || Math.floor(Date.now() / 1000)) : 0,
        pages: pageNo - 1,
        has_more: more,
        total_discounts: discounts.length,
        total_items: details.reduce((sum, detail) => sum + (detail.items?.length || 0), 0),
        discounts,
        details,
        ...saved
      }
    } catch (error) {
      return { ...resultBase, ok: false, error: 'shopee_discount_sync_failed', message: error?.message || String(error), discounts: [], details: [] }
    }
  }
  core.syncShopeeDiscountShop = syncShopeeDiscountShop

  async function syncShopeeDiscounts(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const results = []
    for (const shop of shops) results.push(await syncShopeeDiscountShop(env, shop, options))
    const okRows = results.filter(row => row.ok)
    return {
      status: 'ok',
      mode: 'shopee_discount_sync',
      cache_mode: ['1', 'true', 'yes'].includes(String(options.incremental || options.delta || '').toLowerCase()) ? 'incremental' : 'full',
      endpoint: SHOPEE_DISCOUNT_LIST_PATH,
      detail_endpoint: SHOPEE_DISCOUNT_DETAIL_PATH,
      source: 'Shopee Discount get_discount_list/get_discount',
      note: 'Read-only sync. Khong tu dong tao/sua/dung giam gia khi sync.',
      shop_count: shops.length,
      ok_count: okRows.length,
      total_discounts: okRows.reduce((sum, row) => sum + (row.total_discounts || 0), 0),
      total_items: okRows.reduce((sum, row) => sum + (row.total_items || 0), 0),
      saved_discounts: okRows.reduce((sum, row) => sum + (row.saved_discounts || 0), 0),
      saved_items: okRows.reduce((sum, row) => sum + (row.saved_items || 0), 0),
      incremental_shops: okRows.filter(row => row.cache_mode === 'incremental').length,
      shops: results
    }
  }
  core.syncShopeeDiscounts = syncShopeeDiscounts
}
