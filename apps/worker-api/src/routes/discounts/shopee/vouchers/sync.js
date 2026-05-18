export function installDiscountsShopeeVouchersSync(core) {
  const SHOPEE_VOUCHER_DETAIL_PATH = core.SHOPEE_VOUCHER_DETAIL_PATH
  const SHOPEE_VOUCHER_LIST_PATH = core.SHOPEE_VOUCHER_LIST_PATH
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const fetchShopeeJsonGet = (...args) => core.fetchShopeeJsonGet(...args)
  const getApiShops = core.getApiShops
  const getShopeeAppFromRowForClient = core.getShopeeAppFromRowForClient || core.getShopeeAppFromRow
  const num = (...args) => core.num(...args)
  const round2 = (...args) => core.round2(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)

  function marketplaceRuntimeAuth(env, shop) {
    return {
      accessToken: cleanText(env?.SHOPEE_MARKETPLACE_ACCESS_TOKEN) || cleanText(shop.access_token),
      shopId: cleanText(env?.SHOPEE_MARKETPLACE_SHOP_ID) || cleanText(shop.api_shop_id)
    }
  }

  function normalizeVoucherStatus(value) {
    const status = cleanText(value).toLowerCase()
    return ['all', 'upcoming', 'ongoing', 'expired'].includes(status) ? status : 'ongoing'
  }
  core.normalizeVoucherStatus = normalizeVoucherStatus

  function inferVoucherStatus(rawStatus, requestedStatus, startTime, endTime) {
    const status = cleanText(rawStatus).toLowerCase()
    if (status && status !== 'all') return status
    const requestStatus = normalizeVoucherStatus(requestedStatus)
    if (requestStatus !== 'all') return requestStatus
    const now = Math.floor(Date.now() / 1000)
    const start = Math.round(num(startTime))
    const end = Math.round(num(endTime))
    if (end > 0 && end < now) return 'expired'
    if (start > now) return 'upcoming'
    if (start > 0 || end > 0) return 'ongoing'
    return 'all'
  }
  core.inferVoucherStatus = inferVoucherStatus

  function voucherShopName(shop) {
    return shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
  }
  core.voucherShopName = voucherShopName

  function voucherItemIds(response = {}) {
    if (Array.isArray(response.item_id_list)) return response.item_id_list.map(cleanText).filter(Boolean)
    if (Array.isArray(response.item_list)) {
      return response.item_list.map(item => cleanText(item?.item_id || item)).filter(Boolean)
    }
    return [...extractItemIdsDeep(response)].filter(Boolean)
  }
  core.voucherItemIds = voucherItemIds

  function normalizeVoucherList(data, shop, status) {
    const list = Array.isArray(data?.response?.voucher_list) ? data.response.voucher_list : []
    const shopName = voucherShopName(shop)
    const requestedStatus = normalizeVoucherStatus(status)
    return list.map(row => ({
      platform: 'shopee',
      shop: shopName,
      api_shop_id: String(shop.api_shop_id || ''),
      voucher_id: cleanText(row.voucher_id),
      voucher_code: cleanText(row.voucher_code),
      voucher_name: cleanText(row.voucher_name),
      status: inferVoucherStatus(row.status, requestedStatus, row.start_time, row.end_time),
      voucher_type: Math.round(num(row.voucher_type)),
      reward_type: Math.round(num(row.reward_type)),
      usage_quantity: Math.round(num(row.usage_quantity)),
      current_usage: Math.round(num(row.current_usage)),
      start_time: Math.round(num(row.start_time)),
      end_time: Math.round(num(row.end_time)),
      display_start_time: Math.round(num(row.display_start_time)),
      is_admin: row.is_admin ? 1 : 0,
      voucher_purpose: Math.round(num(row.voucher_purpose)),
      discount_amount: round2(row.discount_amount),
      percentage: round2(row.percentage),
      min_basket_price: 0,
      max_price: 0,
      item_ids_json: '[]',
      raw_data: compactJson(row, 12000),
      detail_raw_data: '{}',
      request_id: cleanText(data?.request_id)
    })).filter(row => row.voucher_id)
  }
  core.normalizeVoucherList = normalizeVoucherList

  function normalizeVoucherDetail(data, shop, voucherId, status) {
    const response = data?.response || {}
    const shopName = voucherShopName(shop)
    const requestedStatus = normalizeVoucherStatus(status)
    const itemIds = voucherItemIds(response)
    return {
      platform: 'shopee',
      shop: shopName,
      api_shop_id: String(shop.api_shop_id || ''),
      voucher_id: cleanText(response.voucher_id || voucherId),
      voucher_code: cleanText(response.voucher_code),
      voucher_name: cleanText(response.voucher_name),
      status: inferVoucherStatus(response.status, requestedStatus, response.start_time, response.end_time),
      voucher_type: Math.round(num(response.voucher_type)),
      reward_type: Math.round(num(response.reward_type)),
      usage_quantity: Math.round(num(response.usage_quantity)),
      current_usage: Math.round(num(response.current_usage)),
      start_time: Math.round(num(response.start_time)),
      end_time: Math.round(num(response.end_time)),
      display_start_time: Math.round(num(response.display_start_time)),
      is_admin: response.is_admin ? 1 : 0,
      voucher_purpose: Math.round(num(response.voucher_purpose)),
      discount_amount: round2(response.discount_amount),
      percentage: round2(response.percentage),
      min_basket_price: round2(response.min_basket_price),
      max_price: round2(response.max_price),
      item_ids_json: compactJson(itemIds, 12000),
      raw_data: '{}',
      detail_raw_data: compactJson(response),
      request_id: cleanText(data?.request_id)
    }
  }
  core.normalizeVoucherDetail = normalizeVoucherDetail

  async function saveVouchers(env, shop, vouchers, details = [], options = {}) {
    await ensureShopeeDiscountTables(env)
    const apiShopId = String(shop.api_shop_id || '')
    const platform = cleanText(options.platform || vouchers?.[0]?.platform || details?.[0]?.platform || 'shopee').toLowerCase() || 'shopee'
    const statusScope = cleanText(options.status || options.voucher_status || 'ongoing').toLowerCase() || 'ongoing'
    const fullSync = options.fullSync !== false
    if (fullSync) {
      // Chỉ đánh dấu cũ trong phạm vi status đang sync để cache voucher khác trạng thái không bị mất hiệu lực sai.
      const scopeSql = statusScope && statusScope !== 'all' ? ' AND LOWER(status) = ?' : ''
      const params = statusScope && statusScope !== 'all' ? [platform, apiShopId, statusScope] : [platform, apiShopId]
      await env.DB.prepare(`
        UPDATE marketplace_vouchers
        SET is_current = 0,
            updated_at = datetime('now', '+7 hours')
        WHERE platform = ? AND api_shop_id = ? ${scopeSql}
      `).bind(...params).run()
    }

    let savedVouchers = 0
    const rows = [...(vouchers || []), ...(details || [])].filter(row => row?.voucher_id)
    for (const row of rows) {
      await env.DB.prepare(`
        INSERT INTO marketplace_vouchers (
          platform, shop, api_shop_id, voucher_id, voucher_code, voucher_name, status,
          voucher_type, reward_type, usage_quantity, current_usage, start_time, end_time,
          display_start_time, is_admin, voucher_purpose, discount_amount, percentage,
          min_basket_price, max_price, item_ids_json, is_current, raw_data, detail_raw_data,
          request_id, synced_at, updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
        ON CONFLICT(platform, api_shop_id, voucher_id) DO UPDATE SET
          shop = excluded.shop,
          voucher_code = COALESCE(NULLIF(excluded.voucher_code, ''), marketplace_vouchers.voucher_code),
          voucher_name = COALESCE(NULLIF(excluded.voucher_name, ''), marketplace_vouchers.voucher_name),
          status = COALESCE(NULLIF(excluded.status, ''), marketplace_vouchers.status),
          voucher_type = CASE WHEN excluded.voucher_type > 0 THEN excluded.voucher_type ELSE marketplace_vouchers.voucher_type END,
          reward_type = CASE WHEN excluded.reward_type > 0 THEN excluded.reward_type ELSE marketplace_vouchers.reward_type END,
          usage_quantity = CASE WHEN excluded.usage_quantity > 0 THEN excluded.usage_quantity ELSE marketplace_vouchers.usage_quantity END,
          current_usage = excluded.current_usage,
          start_time = CASE WHEN excluded.start_time > 0 THEN excluded.start_time ELSE marketplace_vouchers.start_time END,
          end_time = CASE WHEN excluded.end_time > 0 THEN excluded.end_time ELSE marketplace_vouchers.end_time END,
          display_start_time = CASE WHEN excluded.display_start_time > 0 THEN excluded.display_start_time ELSE marketplace_vouchers.display_start_time END,
          is_admin = excluded.is_admin,
          voucher_purpose = CASE WHEN excluded.voucher_purpose > 0 THEN excluded.voucher_purpose ELSE marketplace_vouchers.voucher_purpose END,
          discount_amount = CASE WHEN excluded.discount_amount > 0 THEN excluded.discount_amount ELSE marketplace_vouchers.discount_amount END,
          percentage = CASE WHEN excluded.percentage > 0 THEN excluded.percentage ELSE marketplace_vouchers.percentage END,
          min_basket_price = CASE WHEN excluded.min_basket_price > 0 THEN excluded.min_basket_price ELSE marketplace_vouchers.min_basket_price END,
          max_price = CASE WHEN excluded.max_price > 0 THEN excluded.max_price ELSE marketplace_vouchers.max_price END,
          item_ids_json = CASE WHEN excluded.item_ids_json != '[]' THEN excluded.item_ids_json ELSE marketplace_vouchers.item_ids_json END,
          is_current = 1,
          raw_data = CASE WHEN excluded.raw_data != '{}' THEN excluded.raw_data ELSE marketplace_vouchers.raw_data END,
          detail_raw_data = CASE WHEN excluded.detail_raw_data != '{}' THEN excluded.detail_raw_data ELSE marketplace_vouchers.detail_raw_data END,
          request_id = COALESCE(NULLIF(excluded.request_id, ''), marketplace_vouchers.request_id),
          synced_at = excluded.synced_at,
          updated_at = excluded.updated_at
      `).bind(
        row.platform, row.shop, row.api_shop_id, row.voucher_id, row.voucher_code,
        row.voucher_name, row.status, row.voucher_type, row.reward_type,
        row.usage_quantity, row.current_usage, row.start_time, row.end_time,
        row.display_start_time, row.is_admin, row.voucher_purpose, row.discount_amount,
        row.percentage, row.min_basket_price, row.max_price, row.item_ids_json,
        row.raw_data, row.detail_raw_data, row.request_id
      ).run()
      savedVouchers++
    }
    return { saved_vouchers: savedVouchers }
  }
  core.saveVouchers = saveVouchers

  async function fetchVoucherDetail(env, shop, voucherId, status) {
    const runtimeAuth = marketplaceRuntimeAuth(env, shop)
    const app = getShopeeAppFromRowForClient(env, shop, 'marketplace_client', shop.api_partner_id || voucherShopName(shop))
    const buildUrl = signShopeeUrl(app, SHOPEE_VOUCHER_DETAIL_PATH, runtimeAuth.accessToken, runtimeAuth.shopId)
    const data = await fetchShopeeJsonGet(buildUrl, { voucher_id: voucherId })
    return normalizeVoucherDetail(data, shop, voucherId, status)
  }
  core.fetchVoucherDetail = fetchVoucherDetail

  async function syncShopeeVoucherShop(env, shop, options = {}) {
    const voucherStatus = normalizeVoucherStatus(options.voucher_status || options.status || 'ongoing')
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 100) || 100, 1), 100)
    const pageLimit = Math.min(Math.max(Number(options.page_limit || options.pageLimit || 5) || 5, 1), 30)
    const includeDetail = String(options.include_detail ?? options.includeDetail ?? '1') !== '0'
    const detailLimit = Math.min(Math.max(Number(options.detail_limit || options.detailLimit || 120) || 120, 0), 500)
    const shopName = voucherShopName(shop)
    const resultBase = {
      shop: shopName,
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      endpoint: SHOPEE_VOUCHER_LIST_PATH,
      detail_endpoint: SHOPEE_VOUCHER_DETAIL_PATH,
      voucher_status: voucherStatus
    }
    const runtimeAuth = marketplaceRuntimeAuth(env, shop)
    if (!runtimeAuth.accessToken || !runtimeAuth.shopId) {
      return { ...resultBase, ok: false, error: 'missing_token_or_shop_id', message: 'Shop chưa có access_token hoặc api_shop_id', vouchers: [], details: [] }
    }

    try {
      const app = getShopeeAppFromRowForClient(env, shop, 'marketplace_client', shop.api_partner_id || shopName)
      const buildUrl = signShopeeUrl(app, SHOPEE_VOUCHER_LIST_PATH, runtimeAuth.accessToken, runtimeAuth.shopId)
      const vouchers = []
      const details = []
      let pageNo = 1
      let more = false
      do {
        const data = await fetchShopeeJsonGet(buildUrl, {
          status: voucherStatus,
          page_no: pageNo,
          page_size: pageSize
        })
        vouchers.push(...normalizeVoucherList(data, shop, voucherStatus))
        more = Boolean(data?.response?.more)
        pageNo++
      } while (more && pageNo <= pageLimit)

      if (includeDetail) {
        for (const voucher of vouchers.slice(0, detailLimit)) {
          try {
            details.push(await fetchVoucherDetail(env, shop, voucher.voucher_id, voucher.status || voucherStatus))
          } catch (error) {
            details.push({ ...voucher, detail_error: error?.message || String(error) })
          }
        }
      }

      const saved = await saveVouchers(env, shop, vouchers, details, { status: voucherStatus, fullSync: !more })
      return {
        ...resultBase,
        ok: true,
        pages: pageNo - 1,
        has_more: more,
        total_vouchers: vouchers.length,
        detail_count: details.length,
        vouchers,
        details,
        ...saved
      }
    } catch (error) {
      return { ...resultBase, ok: false, error: 'shopee_voucher_sync_failed', message: error?.message || String(error), vouchers: [], details: [] }
    }
  }
  core.syncShopeeVoucherShop = syncShopeeVoucherShop

  async function syncShopeeVouchers(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const results = []
    for (const shop of shops) results.push(await syncShopeeVoucherShop(env, shop, options))
    const okRows = results.filter(row => row.ok)
    return {
      status: 'ok',
      mode: 'shopee_voucher_sync',
      endpoint: SHOPEE_VOUCHER_LIST_PATH,
      detail_endpoint: SHOPEE_VOUCHER_DETAIL_PATH,
      source: 'Shopee Voucher get_voucher_list/get_voucher',
      note: 'Read-only sync. Không tự động tạo/sửa/xóa/kết thúc voucher khi sync.',
      shop_count: shops.length,
      ok_count: okRows.length,
      total_vouchers: okRows.reduce((sum, row) => sum + (row.total_vouchers || 0), 0),
      detail_count: okRows.reduce((sum, row) => sum + (row.detail_count || 0), 0),
      saved_vouchers: okRows.reduce((sum, row) => sum + (row.saved_vouchers || 0), 0),
      shops: results
    }
  }
  core.syncShopeeVouchers = syncShopeeVouchers
}
