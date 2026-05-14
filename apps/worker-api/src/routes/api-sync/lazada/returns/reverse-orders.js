export function installApiSyncLazadaReturnsReverseOrders(core) {
  const adsNumber = (...args) => core.adsNumber(...args)
  const applyReturnLedgerRowsToOrders = (...args) => core.applyReturnLedgerRowsToOrders(...args)
  const buildLazadaReverseLedgerRows = core.buildLazadaReverseLedgerRows
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const ensureReturnReverseLedgerTable = core.ensureReturnReverseLedgerTable
  const getApiShops = (...args) => core.getApiShops(...args)
  const normalizeBangkokDate = core.normalizeBangkokDate
  const parseBooleanOption = (...args) => core.parseBooleanOption(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const saveReturnReverseLedgerRows = core.saveReturnReverseLedgerRows
  const uniqueTexts = (...args) => core.uniqueTexts(...args)
  const ymdToBangkokMs = core.ymdToBangkokMs

  function splitCsvTexts(value) {
    if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)
    return cleanText(value).split(',').map(cleanText).filter(Boolean)
  }
  core.splitCsvTexts = splitCsvTexts

  function lazadaReverseSyncWindow(options = {}) {
    const fromYmd = cleanYmd(options.from || options.date_from || options.dateFrom)
    const toYmd = cleanYmd(options.to || options.date_to || options.dateTo)
    const days = Math.max(1, Math.min(Number(options.days || 30) || 30, 120))
    const now = new Date()
    const defaultFrom = new Date(now.getTime() - days * 86400 * 1000)
    return {
      from_ms: fromYmd ? ymdToBangkokMs(fromYmd, false) : defaultFrom.getTime(),
      to_ms: toYmd ? ymdToBangkokMs(toYmd, true) : now.getTime(),
      from_date: fromYmd || normalizeBangkokDate(defaultFrom),
      to_date: toYmd || normalizeBangkokDate(now)
    }
  }
  core.lazadaReverseSyncWindow = lazadaReverseSyncWindow

  function normalizeLazadaReverseListResponse(data, shop, options = {}) {
    const result = data?.result || data?.data?.result || data?.data || {}
    const items = Array.isArray(result.items)
      ? result.items
      : Array.isArray(result.moduleList)
        ? result.moduleList
        : Array.isArray(result.reverseOrderList)
          ? result.reverseOrderList
          : []
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'lazada',
      ok: true,
      page_no: Number(result.page_no || result.pageNo || options.page_no || 1) || 1,
      page_size: Number(result.page_size || result.pageSize || options.page_size || items.length) || items.length,
      total: Number(result.total || 0) || 0,
      request_id: cleanText(data?.request_id),
      message: cleanText(data?.message),
      items
    }
  }
  core.normalizeLazadaReverseListResponse = normalizeLazadaReverseListResponse

  async function fetchLazadaReverseOrdersShop(env, shop, options = {}) {
    const window = lazadaReverseSyncWindow(options)
    const pageNo = Math.max(1, Number(options.page_no || options.pageNo || 1) || 1)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 50) || 50, 1), 100)
    const params = {
      page_no: pageNo,
      page_size: pageSize,
      ReverseOrderLineModifiedTimeRangeStart: String(window.from_ms),
      ReverseOrderLineModifiedTimeRangeEnd: String(window.to_ms)
    }
    const reverseStatuses = splitCsvTexts(options.reverse_status_list || options.reverseStatusList)
    if (reverseStatuses.length) params.reverse_status_list = JSON.stringify(reverseStatuses)
    const requestTypes = splitCsvTexts(options.request_type_list || options.requestTypeList)
    if (requestTypes.length) params.request_type_list = JSON.stringify(requestTypes)
    if (cleanText(options.trade_order_id)) params.trade_order_id = cleanText(options.trade_order_id)
    if (cleanText(options.reverse_order_id)) params.reverse_order_id = cleanText(options.reverse_order_id)
    if (cleanText(options.return_to_type)) params.return_to_type = cleanText(options.return_to_type)
    if (options.dispute_in_progress !== undefined && options.dispute_in_progress !== null && options.dispute_in_progress !== '') {
      params.dispute_in_progress = String(options.dispute_in_progress)
    }

    try {
      const data = await callLazadaWithShop(env, shop, '/reverse/getreverseordersforseller', params)
      return normalizeLazadaReverseListResponse(data, shop, { page_no: pageNo, page_size: pageSize, ...window })
    } catch (error) {
      return {
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        platform: 'lazada',
        ok: false,
        page_no: pageNo,
        page_size: pageSize,
        total: 0,
        request_id: '',
        error: 'lazada_reverse_list_failed',
        message: error?.message || String(error),
        items: []
      }
    }
  }
  core.fetchLazadaReverseOrdersShop = fetchLazadaReverseOrdersShop

  function extractLazadaReverseDetail(data) {
    return data?.data || data?.result?.data || data?.result || {}
  }
  core.extractLazadaReverseDetail = extractLazadaReverseDetail

  async function fetchLazadaReverseDetailShop(env, shop, reverseOrderId) {
    if (!cleanText(reverseOrderId)) return { ok: false, error: 'missing_reverse_order_id', message: 'Thiếu reverse_order_id', detail: null }
    try {
      const data = await callLazadaWithShop(env, shop, '/order/reverse/return/detail/list', {
        reverse_order_id: cleanText(reverseOrderId)
      })
      return {
        ok: true,
        detail: extractLazadaReverseDetail(data),
        request_id: cleanText(data?.request_id),
        message: cleanText(data?.message)
      }
    } catch (error) {
      return { ok: false, error: 'lazada_reverse_detail_failed', message: error?.message || String(error), detail: null }
    }
  }
  core.fetchLazadaReverseDetailShop = fetchLazadaReverseDetailShop

  function extractLazadaReverseHistory(data) {
    const payload = data?.data || data?.result?.data || data?.result || {}
    const list = Array.isArray(payload.list) ? payload.list : []
    const pageInfo = payload.page_info || payload.pagination || {}
    return {
      list,
      page_size: Number(pageInfo.page_size || pageInfo.pageSize || 0) || 0,
      page_no: Number(pageInfo.current_page_number || pageInfo.currentPageNo || payload.page_number || 1) || 1,
      total: Number(pageInfo.total || 0) || list.length
    }
  }
  core.extractLazadaReverseHistory = extractLazadaReverseHistory

  async function fetchLazadaReverseHistoryShop(env, shop, reverseOrderLineId, options = {}) {
    if (!cleanText(reverseOrderLineId)) return { ok: false, error: 'missing_reverse_order_line_id', message: 'Thiếu reverse_order_line_id', list: [] }
    const pageNo = Math.max(1, Number(options.page_number || options.pageNo || 1) || 1)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 20) || 20, 1), 100)
    try {
      const data = await callLazadaWithShop(env, shop, '/order/reverse/return/history/list', {
        reverse_order_line_id: cleanText(reverseOrderLineId),
        page_number: pageNo,
        page_size: pageSize
      })
      return { ok: true, ...extractLazadaReverseHistory(data) }
    } catch (error) {
      return { ok: false, error: 'lazada_reverse_history_failed', message: error?.message || String(error), list: [] }
    }
  }
  core.fetchLazadaReverseHistoryShop = fetchLazadaReverseHistoryShop

  async function fetchLazadaReverseHistoryAllPages(env, shop, reverseOrderLineId, maxPages = 3) {
    const rows = []
    let pageNo = 1
    while (pageNo <= maxPages) {
      const result = await fetchLazadaReverseHistoryShop(env, shop, reverseOrderLineId, {
        page_number: pageNo,
        page_size: 20
      })
      if (!result.ok) return result
      rows.push(...(result.list || []))
      if (!result.total || rows.length >= result.total || !(result.list || []).length) break
      pageNo += 1
    }
    return { ok: true, list: rows }
  }
  core.fetchLazadaReverseHistoryAllPages = fetchLazadaReverseHistoryAllPages

  async function fetchLazadaFblReverseShop(env, shop, salesOrderNumber) {
    if (!cleanText(salesOrderNumber)) return { ok: false, error: 'missing_sales_order_number', message: 'Thiếu sales_order_number', data: null }
    try {
      const data = await callLazadaWithShop(env, shop, '/fbl/reverse_order/get', {
        sales_order_number: cleanText(salesOrderNumber)
      })
      return {
        ok: true,
        data: data?.data || data?.result?.data || data?.result || null,
        request_id: cleanText(data?.request_id),
        message: cleanText(data?.message)
      }
    } catch (error) {
      return { ok: false, error: 'lazada_fbl_reverse_failed', message: error?.message || String(error), data: null }
    }
  }
  core.fetchLazadaFblReverseShop = fetchLazadaFblReverseShop

  async function syncLazadaReverseOrders(env, options = {}) {
    await ensureReturnReverseLedgerTable(env)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 50) || 50, 1), 100)
    const maxPages = Math.min(Math.max(Number(options.max_pages || options.maxPages || 4) || 4, 1), 10)
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 100) || 100, 1), 200)
    const includeFbl = parseBooleanOption(options.include_fbl ?? options.includeFbl, false)
    const includeDetail = parseBooleanOption(options.include_detail ?? options.includeDetail, true)
    const includeHistory = parseBooleanOption(options.include_history ?? options.includeHistory, true)
    const historyPages = Math.min(Math.max(Number(options.history_pages || options.historyPages || 3) || 3, 1), 5)
    const shops = await getApiShops(env, 'lazada', options.shop, shopLimit)
    const window = lazadaReverseSyncWindow(options)
    const warnings = []
    const shopResults = []
    let totalReverseRows = 0
    let totalLedgerRows = 0
    let totalLedgerSaved = 0
    let totalOrdersUpdated = 0
    let totalClosedLedgerRows = 0
    let totalEffectiveRefundAmount = 0
    let totalHistoryRows = 0

    for (const shop of shops) {
      const reverseRows = []
      const reverseDetails = new Map()
      const reverseHistories = new Map()
      const reverseFblRows = new Map()
      let pageNo = Math.max(1, Number(options.page_no || options.pageNo || 1) || 1)
      let pages = 0
      let total = 0
      let listOk = true

      while (pages < maxPages) {
        const listResult = await fetchLazadaReverseOrdersShop(env, shop, {
          ...options,
          ...window,
          page_no: pageNo,
          page_size: pageSize
        })
        pages += 1
        if (!listResult.ok) {
          warnings.push({ shop: listResult.shop, endpoint: '/reverse/getreverseordersforseller', error: listResult.error, message: listResult.message })
          shopResults.push({ ...listResult, pages, saved: 0, ledger_saved: 0 })
          listOk = false
          break
        }
        total = Number(listResult.total || total || 0)
        reverseRows.push(...(listResult.items || []))
        if (!listResult.total || reverseRows.length >= listResult.total || !(listResult.items || []).length) break
        pageNo += 1
      }
      if (!listOk) continue

      const reverseIds = uniqueTexts(reverseRows.map(row => row.reverse_order_id))
      if (includeDetail) {
        for (const reverseId of reverseIds) {
          const detailResult = await fetchLazadaReverseDetailShop(env, shop, reverseId)
          if (detailResult.ok && detailResult.detail) {
            reverseDetails.set(reverseId, detailResult.detail)
          } else {
            warnings.push({ shop: shop.shop_name, reverse_id: reverseId, endpoint: '/order/reverse/return/detail/list', error: detailResult.error, message: detailResult.message })
          }
        }
      }

      const lineIds = uniqueTexts(reverseRows.flatMap(row => (row.reverse_order_lines || []).map(line => line.reverse_order_line_id)))
      if (includeHistory) {
        for (const reverseLineId of lineIds) {
          const historyResult = await fetchLazadaReverseHistoryAllPages(env, shop, reverseLineId, historyPages)
          if (historyResult.ok) {
            reverseHistories.set(reverseLineId, historyResult.list || [])
            totalHistoryRows += (historyResult.list || []).length
          } else {
            warnings.push({ shop: shop.shop_name, reverse_line_id: reverseLineId, endpoint: '/order/reverse/return/history/list', error: historyResult.error, message: historyResult.message })
          }
        }
      }

      if (includeFbl) {
        const tradeOrderIds = uniqueTexts(reverseRows.map(row => row.trade_order_id))
        for (const tradeOrderId of tradeOrderIds) {
          const fblResult = await fetchLazadaFblReverseShop(env, shop, tradeOrderId)
          if (fblResult.ok && fblResult.data) reverseFblRows.set(tradeOrderId, fblResult.data)
        }
      }

      const ledgerRows = buildLazadaReverseLedgerRows({
        shop,
        reverseRows,
        reverseDetails,
        reverseHistories,
        reverseFblRows
      })
      const ledgerSaved = await saveReturnReverseLedgerRows(env, ledgerRows)
      const ordersUpdated = await applyReturnLedgerRowsToOrders(env, ledgerRows)
      const closedLedgerRows = ledgerRows.filter(row => Number(row.is_finance_closed || 0) === 1)
      totalReverseRows += reverseRows.length
      totalLedgerRows += ledgerRows.length
      totalLedgerSaved += ledgerSaved
      totalOrdersUpdated += ordersUpdated
      totalClosedLedgerRows += closedLedgerRows.length
      totalEffectiveRefundAmount += closedLedgerRows.reduce((sum, row) => sum + adsNumber(row.effective_refund_amount), 0)
      shopResults.push({
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        platform: 'lazada',
        ok: true,
        pages,
        total,
        reverse_rows: reverseRows.length,
        ledger_saved: ledgerSaved,
        orders_updated: ordersUpdated,
        detail_checked: includeDetail ? reverseIds.length : 0,
        history_checked: includeHistory ? lineIds.length : 0
      })
    }

    return {
      status: 'ok',
      mode: 'lazada_reverse_sync',
      endpoint: '/reverse/getreverseordersforseller',
      note: 'Sync reverse/return Lazada vào ledger dùng chung để Dashboard và Profit không chỉ suy từ order status.',
      from: window.from_date,
      to: window.to_date,
      shop_count: shops.length,
      ok_count: shopResults.filter(item => item.ok).length,
      fetched_returns: totalReverseRows,
      ledger_rows: totalLedgerRows,
      ledger_saved: totalLedgerSaved,
      orders_updated: totalOrdersUpdated,
      closed_returns: totalClosedLedgerRows,
      refund_amount: roundAds(totalEffectiveRefundAmount),
      history_rows: totalHistoryRows,
      light_mode: !includeDetail || !includeHistory,
      warnings,
      shops: shopResults
    }
  }
  core.syncLazadaReverseOrders = syncLazadaReverseOrders
}
