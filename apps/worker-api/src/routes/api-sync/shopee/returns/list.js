export function installApiSyncShopeeReturnsList(core) {
  const SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH = core.SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH
  const SHOPEE_RETURNS_GET_RETURN_LIST_PATH = core.SHOPEE_RETURNS_GET_RETURN_LIST_PATH
  const SHOPEE_RETURNS_GET_REVERSE_TRACKING_INFO_PATH = core.SHOPEE_RETURNS_GET_REVERSE_TRACKING_INFO_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanEpochSeconds = (...args) => core.cleanEpochSeconds(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const dateYmd = (...args) => core.dateYmd(...args)
  const ensureShopeeReturnsTable = (...args) => core.ensureShopeeReturnsTable(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const firstText = (...args) => core.firstText(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const roundAds = (...args) => core.roundAds(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const unixToIso = (...args) => core.unixToIso(...args)
  const ymdToBangkokEpoch = (...args) => core.ymdToBangkokEpoch(...args)

  function defaultReturnsFifteenDayRange() {
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - 14)
    return { date_from: dateYmd(from), date_to: dateYmd(to) }
  }
  core.defaultReturnsFifteenDayRange = defaultReturnsFifteenDayRange

  function cleanReturnPageNo(value) {
    const number = Number(value ?? 1)
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 1
  }
  core.cleanReturnPageNo = cleanReturnPageNo

  function cleanReturnListRange(options = {}) {
    const defaults = defaultReturnsFifteenDayRange()
    const timeField = cleanText(options.time_field || options.timeField || 'update_time').toLowerCase() === 'create_time'
      ? 'create_time'
      : 'update_time'
    const dateFrom = cleanYmd(options.date_from || options.dateFrom) || defaults.date_from
    const dateTo = cleanYmd(options.date_to || options.dateTo) || defaults.date_to
    const createTimeFrom = cleanEpochSeconds(options.create_time_from ?? options.createTimeFrom)
    const createTimeTo = cleanEpochSeconds(options.create_time_to ?? options.createTimeTo)
    const updateTimeFrom = cleanEpochSeconds(options.update_time_from ?? options.updateTimeFrom)
    const updateTimeTo = cleanEpochSeconds(options.update_time_to ?? options.updateTimeTo)
    const hasExplicitCreate = Boolean(createTimeFrom || createTimeTo)
    const hasExplicitUpdate = Boolean(updateTimeFrom || updateTimeTo)
    return {
      time_field: timeField,
      date_from: dateFrom,
      date_to: dateTo,
      create_time_from: hasExplicitCreate ? createTimeFrom : (timeField === 'create_time' ? ymdToBangkokEpoch(dateFrom, false) : 0),
      create_time_to: hasExplicitCreate ? createTimeTo : (timeField === 'create_time' ? ymdToBangkokEpoch(dateTo, true) : 0),
      update_time_from: hasExplicitUpdate ? updateTimeFrom : (timeField === 'update_time' ? ymdToBangkokEpoch(dateFrom, false) : 0),
      update_time_to: hasExplicitUpdate ? updateTimeTo : (timeField === 'update_time' ? ymdToBangkokEpoch(dateTo, true) : 0)
    }
  }
  core.cleanReturnListRange = cleanReturnListRange

  function returnsRangeError(range) {
    const pairs = [
      ['create_time', range.create_time_from, range.create_time_to],
      ['update_time', range.update_time_from, range.update_time_to]
    ]
    for (const [label, from, to] of pairs) {
      if (!from && !to) continue
      if (!from || !to) return `Missing ${label}_from or ${label}_to`
      if (from > to) return `${label}_from must be less than or equal to ${label}_to`
      if (to - from > 15 * 86400 - 1) return `Shopee Returns ${label} range cannot exceed 15 days`
    }
    if (range.create_time_from && range.update_time_from && range.update_time_from < range.create_time_from) {
      return 'Shopee Returns requires update_time_from to be greater than or equal to create_time_from'
    }
    return ''
  }
  core.returnsRangeError = returnsRangeError

  function normalizeShopeeReturnItem(item = {}) {
    return {
      item_id: String(item.item_id || ''),
      model_id: String(item.model_id || ''),
      name: cleanText(item.name),
      model_sku: cleanText(item.model_sku || item.variation_sku),
      item_sku: cleanText(item.item_sku),
      variation_sku: cleanText(item.variation_sku),
      seller_sku: cleanText(item.seller_sku),
      amount: Number(item.amount || 0) || 0,
      item_price: roundAds(item.item_price),
      refund_amount: roundAds(item.refund_amount),
      images: Array.isArray(item.images) ? item.images.filter(Boolean) : []
    }
  }
  core.normalizeShopeeReturnItem = normalizeShopeeReturnItem

  function normalizeShopeeReturnRow(item = {}, shop, detail = false) {
    const createTime = Number(item.create_time || 0) || 0
    const updateTime = Number(item.update_time || 0) || 0
    const dueDate = Number(item.due_date || 0) || 0
    const rawItems = Array.isArray(item.item)
      ? item.item
      : Array.isArray(item.item_list)
        ? item.item_list
        : Array.isArray(item.return_item)
          ? item.return_item
          : []
    const items = rawItems.map(normalizeShopeeReturnItem)
    const buyerVideos = Array.isArray(item.buyer_videos) ? item.buyer_videos.map(video => ({
      thumbnail_url: cleanText(video?.thumbnail_url),
      video_url: cleanText(video?.video_url)
    })) : []
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      return_sn: cleanText(item.return_sn),
      order_sn: cleanText(item.order_sn),
      status: cleanText(item.status),
      reason: cleanText(item.reason),
      text_reason: cleanText(item.text_reason),
      reassessed_request_reason: cleanText(item.reassessed_request_reason),
      refund_amount: roundAds(item.refund_amount),
      amount_before_discount: roundAds(item.amount_before_discount),
      currency: cleanText(item.currency),
      create_time: createTime,
      create_time_at: unixToIso(createTime),
      update_time: updateTime,
      update_time_at: unixToIso(updateTime),
      due_date: dueDate,
      due_date_at: unixToIso(dueDate),
      tracking_number: cleanText(item.tracking_number),
      needs_logistics: Boolean(item.needs_logistics),
      negotiation_status: cleanText(item.negotiation_status || item.negotiation?.negotiation_status),
      seller_proof_status: cleanText(item.seller_proof_status || item.seller_proof?.seller_proof_status),
      seller_compensation_status: cleanText(item.seller_compensation_status || item.seller_compensation?.seller_compensation_status),
      return_refund_type: cleanText(item.return_refund_type),
      return_solution: item.return_solution ?? '',
      return_refund_request_type: item.return_refund_request_type ?? '',
      validation_type: cleanText(item.validation_type),
      logistics_status: cleanText(item.logistics_status),
      reverse_logistic_status: cleanText(item.reverse_logistic_status || item.reverse_logistics_status),
      is_seller_arrange: Boolean(item.is_seller_arrange),
      is_shipping_proof_mandatory: Boolean(item.is_shipping_proof_mandatory),
      has_uploaded_shipping_proof: Boolean(item.has_uploaded_shipping_proof),
      images: Array.isArray(item.image) ? item.image.filter(Boolean) : [],
      buyer_videos: buyerVideos,
      items,
      item_count: items.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      raw: detail ? item : undefined
    }
  }
  core.normalizeShopeeReturnRow = normalizeShopeeReturnRow

  function isClosedReturnStatus(status) {
    return cleanText(status).toUpperCase() === 'CLOSED'
  }
  core.isClosedReturnStatus = isClosedReturnStatus

  async function saveShopeeReturns(env, returns = []) {
    const rows = (returns || []).filter(row => row?.return_sn)
    if (!rows.length) return 0
    await ensureShopeeReturnsTable(env)
    let saved = 0
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50)
      await env.DB.batch(chunk.map(row => env.DB.prepare(`
        INSERT INTO marketplace_returns (
          return_sn, platform, shop, api_shop_id, order_sn, status,
          reason, text_reason, reassessed_request_reason, refund_amount,
          amount_before_discount, currency, create_time, create_time_at,
          update_time, update_time_at, due_date, due_date_at, tracking_number,
          needs_logistics, negotiation_status, seller_proof_status,
          seller_compensation_status, return_refund_type, return_solution,
          return_refund_request_type, validation_type, logistics_status,
          reverse_logistic_status, item_count, items_json, images_json,
          buyer_videos_json, raw_data, synced_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
        ON CONFLICT(return_sn) DO UPDATE SET
          platform = excluded.platform,
          shop = excluded.shop,
          api_shop_id = excluded.api_shop_id,
          order_sn = excluded.order_sn,
          status = excluded.status,
          reason = excluded.reason,
          text_reason = excluded.text_reason,
          reassessed_request_reason = excluded.reassessed_request_reason,
          refund_amount = excluded.refund_amount,
          amount_before_discount = excluded.amount_before_discount,
          currency = excluded.currency,
          create_time = excluded.create_time,
          create_time_at = excluded.create_time_at,
          update_time = excluded.update_time,
          update_time_at = excluded.update_time_at,
          due_date = excluded.due_date,
          due_date_at = excluded.due_date_at,
          tracking_number = excluded.tracking_number,
          needs_logistics = excluded.needs_logistics,
          negotiation_status = excluded.negotiation_status,
          seller_proof_status = excluded.seller_proof_status,
          seller_compensation_status = excluded.seller_compensation_status,
          return_refund_type = excluded.return_refund_type,
          return_solution = excluded.return_solution,
          return_refund_request_type = excluded.return_refund_request_type,
          validation_type = excluded.validation_type,
          logistics_status = excluded.logistics_status,
          reverse_logistic_status = excluded.reverse_logistic_status,
          item_count = excluded.item_count,
          items_json = excluded.items_json,
          images_json = excluded.images_json,
          buyer_videos_json = excluded.buyer_videos_json,
          raw_data = excluded.raw_data,
          synced_at = excluded.synced_at
      `).bind(
        row.return_sn || '',
        'shopee',
        row.shop || '',
        row.api_shop_id || '',
        row.order_sn || '',
        row.status || '',
        row.reason || '',
        row.text_reason || '',
        row.reassessed_request_reason || '',
        roundAds(row.refund_amount),
        roundAds(row.amount_before_discount),
        row.currency || '',
        Number(row.create_time || 0) || 0,
        row.create_time_at || '',
        Number(row.update_time || 0) || 0,
        row.update_time_at || '',
        Number(row.due_date || 0) || 0,
        row.due_date_at || '',
        row.tracking_number || '',
        row.needs_logistics ? 1 : 0,
        row.negotiation_status || '',
        row.seller_proof_status || '',
        row.seller_compensation_status || '',
        row.return_refund_type || '',
        String(row.return_solution ?? ''),
        String(row.return_refund_request_type ?? ''),
        row.validation_type || '',
        row.logistics_status || '',
        row.reverse_logistic_status || '',
        Number(row.item_count || 0) || 0,
        compactJson(row.items || []),
        compactJson(row.images || []),
        compactJson(row.buyer_videos || []),
        compactJson(row.raw || row || {}, '{}')
      )))
      saved += chunk.length
    }
    return saved
  }
  core.saveShopeeReturns = saveShopeeReturns

  function foldMarketplaceReturnText(...values) {
    return values
      .map(value => cleanText(value))
      .filter(Boolean)
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, match => match === 'Đ' ? 'D' : 'd')
      .toUpperCase()
  }
  core.foldMarketplaceReturnText = foldMarketplaceReturnText

  function returnWorkflowFromLedgerRow(row = {}) {
    const text = foldMarketplaceReturnText(
      row.normalized_status,
      row.reverse_status,
      row.line_status,
      row.logistics_status,
      row.reverse_logistics_status,
      row.request_type,
      row.reason_text,
      row.reason_code
    )
    if (!text) return null
    if (/RETURN_CANCELED|RETURN_CANCELLED|CANCELLED|CANCELED|CANCEL|VOID|ABORT|REVOKE/.test(text) && !/REFUND/.test(text)) return null

    const reason = firstText(row.reason_text, row.reason_code, row.reverse_status, row.line_status)
    if (Number(row.seller_dispute || 0) === 1 || /DISPUTE|NEGOTIATION|ESCALAT|APPEAL|PROOF|JUDG/.test(text)) {
      return { shipping: 'RETURN_COMPLAINT', priority: 90, reason }
    }
    if (/LOST|THAT LAC/.test(text)) return { shipping: 'LOGISTICS_LOST', priority: 80, reason }
    if (/FAILED_DELIVERY|DELIVERY_FAILED|GIAO KHONG THANH CONG/.test(text)) return { shipping: 'FAILED_DELIVERY', priority: 75, reason }
    if (/SELLER_RECEIVED|PACKAGE_RECEIVED|RECEIVED|DELIVERED|SIGNED|RETURNED_BY_SHIPPER|RETURN_SUCCESS|ARRIVED/.test(text)) {
      return { shipping: 'LOGISTICS_RETURNED_BY_SHIPPER', priority: 70, reason }
    }
    if (/IN_RETURN|TO_RETURN|RETURNING|PICK_UP|PICKUP|PICKED|IN_TRANSIT|SHIPPING|SHIP|DELIVERY|RTM|RTP/.test(text)) {
      return { shipping: 'LOGISTICS_IN_RETURN', priority: 60, reason }
    }
    if (/CLOSED|COMPLETE|COMPLETED|FINISH|FINISHED|SUCCESS|APPROVED|REFUND_SUCCESS/.test(text)) {
      return { shipping: 'RETURN_REFUND', priority: 50, reason }
    }
    if (/RETURN|REFUND|REQUEST|WAIT|PENDING|PROCESS|OPEN/.test(text)) {
      return { shipping: 'RETURN_REFUND', priority: 40, reason }
    }
    return { shipping: 'RETURN', priority: 30, reason }
  }
  core.returnWorkflowFromLedgerRow = returnWorkflowFromLedgerRow

  async function ensureReturnStatusOrderColumns(env) {
    const columns = [
      ['return_received_at', `TEXT DEFAULT ''`],
      ['source_mode', `TEXT DEFAULT ''`],
      ['source_detail', `TEXT DEFAULT ''`],
      ['source_updated_at', `TEXT DEFAULT ''`]
    ]
    for (const [name, definition] of columns) {
      try {
        await env.DB.prepare(`ALTER TABLE orders_v2 ADD COLUMN ${name} ${definition}`).run()
      } catch (error) {
        const message = String(error?.message || '').toLowerCase()
        if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
      }
    }
  }
  core.ensureReturnStatusOrderColumns = ensureReturnStatusOrderColumns

  async function applyReturnLedgerRowsToOrders(env, ledgerRows = []) {
    // API Returns/Reverse là nguồn trạng thái hiện tại của sàn, nhưng "đã nhận hoàn" vẫn do kho quét mã xác nhận.
    await ensureReturnStatusOrderColumns(env)
    const byOrder = new Map()
    for (const row of ledgerRows || []) {
      const orderId = cleanText(row.order_id)
      if (!orderId) continue
      const workflow = returnWorkflowFromLedgerRow(row)
      if (!workflow) continue
      const existing = byOrder.get(orderId)
      if (existing && existing.priority >= workflow.priority) continue
      byOrder.set(orderId, {
        order_id: orderId,
        platform: cleanText(row.platform),
        shop: cleanText(row.shop),
        shipping_status: workflow.shipping,
        priority: workflow.priority,
        tracking_number: cleanText(row.tracking_number),
        reason: cleanText(workflow.reason),
        source_detail: cleanText(row.source_detail || 'marketplace return/reverse sync')
      })
    }

    const updates = [...byOrder.values()]
    if (!updates.length) return 0
    let updated = 0
    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50)
      await env.DB.batch(chunk.map(row => env.DB.prepare(`
        UPDATE orders_v2
        SET oms_status = 'RETURN',
            order_type = 'return',
            shipping_status = CASE
              WHEN COALESCE(return_received_at, '') != '' OR shipping_status = 'LOGISTICS_RETURN_PACKAGE_RECEIVED'
                THEN 'LOGISTICS_RETURN_PACKAGE_RECEIVED'
              ELSE ?
            END,
            tracking_number = CASE WHEN ? != '' THEN ? ELSE tracking_number END,
            cancel_reason = CASE WHEN ? != '' THEN ? ELSE cancel_reason END,
            source_mode = 'api_sync',
            source_detail = ?,
            source_updated_at = datetime('now', '+7 hours'),
            oms_updated_at = datetime('now', '+7 hours')
        WHERE order_id = ?
      `).bind(
        row.shipping_status,
        row.tracking_number,
        row.tracking_number,
        row.reason,
        row.reason,
        row.source_detail,
        row.order_id
      )))
      updated += chunk.length
    }
    return updated
  }
  core.applyReturnLedgerRowsToOrders = applyReturnLedgerRowsToOrders

  function normalizeShopeeReturnList(data, shop, options = {}) {
    const response = data?.response || data || {}
    const list = Array.isArray(response.return)
      ? response.return
      : Array.isArray(response.return_list)
        ? response.return_list
        : Array.isArray(data?.return)
          ? data.return
          : []
    const rows = list.map(item => normalizeShopeeReturnRow(item, shop))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      page_no: cleanReturnPageNo(options.page_no ?? options.pageNo),
      page_size: Number(options.page_size || rows.length || 0),
      create_time_from: cleanEpochSeconds(options.create_time_from),
      create_time_to: cleanEpochSeconds(options.create_time_to),
      update_time_from: cleanEpochSeconds(options.update_time_from),
      update_time_to: cleanEpochSeconds(options.update_time_to),
      create_time_from_at: unixToIso(options.create_time_from),
      create_time_to_at: unixToIso(options.create_time_to),
      update_time_from_at: unixToIso(options.update_time_from),
      update_time_to_at: unixToIso(options.update_time_to),
      more: Boolean(response.more || data?.more),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      rows
    }
  }
  core.normalizeShopeeReturnList = normalizeShopeeReturnList

  async function fetchShopeeReturnListShop(env, shop, options = {}) {
    const range = cleanReturnListRange(options)
    const rangeError = returnsRangeError(range)
    const pageNo = cleanReturnPageNo(options.page_no ?? options.pageNo)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 40) || 40, 1), 100)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      page_no: pageNo,
      page_size: pageSize,
      ...range,
      more: false,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    if (rangeError) return { ...resultBase, error: 'invalid_returns_range', message: rangeError }
    if (!shop.api_shop_id) return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }

    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_RETURNS_GET_RETURN_LIST_PATH, shop.access_token, shop.api_shop_id)
      const params = { page_no: pageNo, page_size: pageSize }
      if (range.create_time_from) params.create_time_from = range.create_time_from
      if (range.create_time_to) params.create_time_to = range.create_time_to
      if (range.update_time_from) params.update_time_from = range.update_time_from
      if (range.update_time_to) params.update_time_to = range.update_time_to
      for (const key of ['status', 'negotiation_status', 'seller_proof_status', 'seller_compensation_status']) {
        const value = cleanText(options[key])
        if (value) params[key] = value
      }
      const data = await fetchShopeeJson(buildUrl, params)
      return normalizeShopeeReturnList(data, shop, {
        page_no: pageNo,
        page_size: pageSize,
        ...range
      })
    } catch (error) {
      return { ...resultBase, error: 'shopee_return_list_failed', message: error?.message || String(error) }
    }
  }
  core.fetchShopeeReturnListShop = fetchShopeeReturnListShop

  async function fetchShopeeReturnList(env, options = {}) {
    const range = cleanReturnListRange(options)
    const rangeError = returnsRangeError(range)
    const pageNo = cleanReturnPageNo(options.page_no ?? options.pageNo)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 40) || 40, 1), 100)
    if (rangeError) {
      return {
        status: 'error',
        mode: 'shopee_returns_get_return_list',
        endpoint: SHOPEE_RETURNS_GET_RETURN_LIST_PATH,
        error: 'invalid_returns_range',
        message: rangeError,
        page_no: pageNo,
        page_size: pageSize,
        ...range,
        shop_count: 0,
        ok_count: 0,
        total_rows: 0,
        shops: [],
        returns: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) {
      rows.push(await fetchShopeeReturnListShop(env, shop, {
        ...options,
        ...range,
        page_no: pageNo,
        page_size: pageSize
      }))
    }
    const okRows = rows.filter(item => item.ok)
    const returns = rows.flatMap(item => item.rows || [])
    return {
      status: 'ok',
      mode: 'shopee_returns_get_return_list',
      endpoint: SHOPEE_RETURNS_GET_RETURN_LIST_PATH,
      note: 'Danh sach tra hang/hoan tien realtime tu Shopee Returns get_return_list. Mac dinh doc theo update_time 15 ngay gan nhat.',
      page_no: pageNo,
      page_size: pageSize,
      ...range,
      create_time_from_at: unixToIso(range.create_time_from),
      create_time_to_at: unixToIso(range.create_time_to),
      update_time_from_at: unixToIso(range.update_time_from),
      update_time_to_at: unixToIso(range.update_time_to),
      shop_count: rows.length,
      ok_count: okRows.length,
      total_rows: returns.length,
      more: rows.length === 1 ? Boolean(rows[0]?.more) : false,
      summary: {
        refund_amount: roundAds(returns.reduce((sum, item) => sum + adsNumber(item.refund_amount), 0)),
        return_count: returns.length,
        needs_logistics_count: returns.filter(item => item.needs_logistics).length,
        pending_seller_count: returns.filter(item => {
          const text = `${item.status} ${item.negotiation_status} ${item.seller_proof_status} ${item.seller_compensation_status}`.toUpperCase()
          return text.includes('PENDING') || text.includes('REQUESTED') || text.includes('PROCESSING')
        }).length
      },
      shops: rows,
      returns
    }
  }
  core.fetchShopeeReturnList = fetchShopeeReturnList
}
