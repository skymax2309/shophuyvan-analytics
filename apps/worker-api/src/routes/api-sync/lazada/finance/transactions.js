export function installApiSyncLazadaFinanceTransactions(core) {
  const LAZADA_FINANCE_ACCOUNT_TRANSACTION_PATH = core.LAZADA_FINANCE_ACCOUNT_TRANSACTION_PATH
  const LAZADA_FINANCE_ACCOUNT_TRANSACTION_SOURCE = core.LAZADA_FINANCE_ACCOUNT_TRANSACTION_SOURCE
  const LAZADA_FINANCE_PAYOUT_SOURCE = core.LAZADA_FINANCE_PAYOUT_SOURCE
  const LAZADA_FINANCE_PAYOUT_STATUS_PATH = core.LAZADA_FINANCE_PAYOUT_STATUS_PATH
  const LAZADA_FINANCE_TRANSACTION_DETAIL_PATH = core.LAZADA_FINANCE_TRANSACTION_DETAIL_PATH
  const LAZADA_FINANCE_TRANSACTION_SOURCE = core.LAZADA_FINANCE_TRANSACTION_SOURCE
  const adsNumber = (...args) => core.adsNumber(...args)
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const defaultIncomeDetailRange = (...args) => core.defaultIncomeDetailRange(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getCostSettings = core.getCostSettings
  const roundAds = (...args) => core.roundAds(...args)
  const saveOrderFeeDetails = (...args) => core.saveOrderFeeDetails(...args)
  const updateOrderFinancialsFromFeeDetail = (...args) => core.updateOrderFinancialsFromFeeDetail(...args)

  function lazadaFinanceWindow(options = {}) {
    const defaults = defaultIncomeDetailRange()
    const from = cleanYmd(options.date_from || options.dateFrom || options.from || options.start_time || options.startTime) || defaults.date_from
    const to = cleanYmd(options.date_to || options.dateTo || options.to || options.end_time || options.endTime) || defaults.date_to
    return { from, to }
  }
  core.lazadaFinanceWindow = lazadaFinanceWindow

  function lazadaFinancePageSize(options = {}) {
    return Math.min(Math.max(Number(options.page_size || options.pageSize || options.limit || 100) || 100, 1), 500)
  }
  core.lazadaFinancePageSize = lazadaFinancePageSize

  function lazadaFinanceMaxPages(options = {}) {
    return Math.min(Math.max(Number(options.max_pages || options.maxPages || 1) || 1, 1), 10)
  }
  core.lazadaFinanceMaxPages = lazadaFinanceMaxPages

  function firstFinanceText(source, names) {
    for (const name of names) {
      const text = cleanText(source?.[name])
      if (text) return text
    }
    return ''
  }
  core.firstFinanceText = firstFinanceText

  function lazadaSignedAmount(row = {}) {
    const raw = firstFinanceText(row, ['amount', 'Amount', 'transaction_amount', 'transactionAmount', 'value'])
    const normalized = raw.replace(/[,\s]/g, '')
    const number = Number(normalized)
    return Number.isFinite(number) ? number : 0
  }
  core.lazadaSignedAmount = lazadaSignedAmount

  function findLazadaFinanceRows(value, depth = 0) {
    if (!value || depth > 5) return []
    if (Array.isArray(value)) {
      const looksLikeTransaction = value.some(row => {
        if (!row || typeof row !== 'object') return false
        return firstFinanceText(row, ['amount', 'Amount', 'transaction_type', 'transactionType', 'fee_name', 'feeName', 'order_no', 'orderNo', 'order_id', 'orderId'])
      })
      if (looksLikeTransaction) return value
      for (const item of value) {
        const found = findLazadaFinanceRows(item, depth + 1)
        if (found.length) return found
      }
      return []
    }
    if (typeof value !== 'object') return []
    for (const item of Object.values(value)) {
      const found = findLazadaFinanceRows(item, depth + 1)
      if (found.length) return found
    }
    return []
  }
  core.findLazadaFinanceRows = findLazadaFinanceRows

  function normalizeLazadaFinanceTransaction(row, shop) {
    const orderNo = firstFinanceText(row, ['order_no', 'orderNo', 'order_id', 'orderId', 'Order no', 'Order No'])
    const feeName = firstFinanceText(row, ['fee_name', 'feeName', 'transaction_type', 'transactionType', 'Transaction Type', 'details', 'type', 'Type'])
    const feeType = firstFinanceText(row, ['fee_type', 'feeType', 'trans_type', 'transType', 'transaction_type_id', 'transactionTypeId', 'sub_type', 'subType'])
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'lazada',
      order_no: orderNo,
      order_item_no: firstFinanceText(row, ['order_item_no', 'orderItemNo', 'order_item_id', 'orderItemId', 'Order Item no']),
      transaction_number: firstFinanceText(row, ['transaction_number', 'transactionNumber', 'Transaction Number']),
      transaction_date: firstFinanceText(row, ['transaction_date', 'transactionDate', 'Transaction Date', 'transaction_time', 'transactionTime', 'date']),
      transaction_type: firstFinanceText(row, ['transaction_type', 'transactionType', 'Transaction Type', 'type', 'Type']),
      sub_transaction_type: firstFinanceText(row, ['sub_transaction_type', 'subTransactionType', 'sub_type', 'subType']),
      fee_name: feeName,
      fee_type: feeType,
      amount: roundAds(lazadaSignedAmount(row)),
      paid_status: firstFinanceText(row, ['paid_status', 'paidStatus', 'Paid Status']),
      statement: firstFinanceText(row, ['statement', 'Statement']),
      reference: firstFinanceText(row, ['reference', 'Reference', 'payment_ref_id', 'paymentRefId', 'pmt_reference', 'pmtReference']),
      raw_data: JSON.stringify(row).slice(0, 8000)
    }
  }
  core.normalizeLazadaFinanceTransaction = normalizeLazadaFinanceTransaction

  function normalizeLazadaFinanceTransactions(data, shop, options = {}) {
    const rows = findLazadaFinanceRows(data?.data || data)
      .map(row => normalizeLazadaFinanceTransaction(row, shop))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'lazada',
      ok: true,
      date_from: cleanText(options.date_from),
      date_to: cleanText(options.date_to),
      offset: Number(options.offset || 0),
      limit: Number(options.limit || rows.length || 0),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: '',
      rows,
      raw_response: data?.data || data
    }
  }
  core.normalizeLazadaFinanceTransactions = normalizeLazadaFinanceTransactions

  async function callLazadaFinanceTransactionPage(env, shop, options = {}) {
    const baseParams = {
      start_time: options.date_from,
      end_time: options.date_to,
      limit: options.limit,
      offset: options.offset
    }
    const feeType = cleanText(options.fee_type || options.feeType || options.trans_type || options.transType)
    if (feeType) baseParams.fee_type = feeType
    try {
      return await callLazadaWithShop(env, shop, LAZADA_FINANCE_TRANSACTION_DETAIL_PATH, baseParams)
    } catch (error) {
      const message = cleanText(error?.message || error)
      if (!/parameter|param|missing|required|invalid/i.test(message)) throw error
      const retryParams = {
        startTime: options.date_from,
        endTime: options.date_to,
        limit: options.limit,
        offset: options.offset
      }
      if (feeType) retryParams.transType = feeType
      return await callLazadaWithShop(env, shop, LAZADA_FINANCE_TRANSACTION_DETAIL_PATH, retryParams)
    }
  }
  core.callLazadaFinanceTransactionPage = callLazadaFinanceTransactionPage

  async function fetchLazadaFinanceTransactionsShop(env, shop, options = {}) {
    const window = lazadaFinanceWindow(options)
    const limit = lazadaFinancePageSize(options)
    const maxPages = lazadaFinanceMaxPages(options)
    const startOffset = Math.max(Number(options.offset || 0) || 0, 0)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'lazada',
      ok: false,
      date_from: window.from,
      date_to: window.to,
      offset: startOffset,
      limit,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    try {
      const rows = []
      let requestId = ''
      for (let page = 0; page < maxPages; page++) {
        const offset = startOffset + page * limit
        const data = await callLazadaFinanceTransactionPage(env, shop, {
          ...options,
          date_from: window.from,
          date_to: window.to,
          limit,
          offset
        })
        const normalized = normalizeLazadaFinanceTransactions(data, shop, {
          date_from: window.from,
          date_to: window.to,
          limit,
          offset
        })
        requestId = requestId || normalized.request_id
        rows.push(...normalized.rows)
        if (normalized.rows.length < limit) break
      }
      return {
        ...resultBase,
        ok: true,
        total_rows: rows.length,
        request_id: requestId,
        rows
      }
    } catch (error) {
      return {
        ...resultBase,
        error: 'lazada_finance_transaction_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchLazadaFinanceTransactionsShop = fetchLazadaFinanceTransactionsShop

  function lazadaFeeBucket(row) {
    const feeType = cleanText(row.fee_type)
    const text = `${row.transaction_type || ''} ${row.fee_name || ''}`.toLowerCase()
    if (/rebate|credit|reversal|refund|overcharge/.test(text) && !/undercharge/.test(text)) return ''
    if (feeType === '16' || /commission/.test(text)) return 'fee_commission'
    if (['3', '84'].includes(feeType) || /payment fee|transaction fee/.test(text)) return 'fee_payment'
    if (/affiliate/.test(text)) return 'fee_affiliate'
    if (feeType === '112' || /sponsored|marketing|ads? fee/.test(text)) return 'fee_ads'
    if (['7', '21', '24', '26', '28', '42', '127', '128', '129'].includes(feeType) || /shipping|logistics|delivery|pickup/.test(text)) return 'fee_shipping'
    if (['25', '130', '133'].includes(feeType) || /handling|pick fee|pack fee|fulfillment|fbl/.test(text)) return 'fee_handling'
    if (/service fee|other services/.test(text)) return 'fee_service'
    return ''
  }
  core.lazadaFeeBucket = lazadaFeeBucket

  function buildLazadaFinanceFeeDetails(shop, rows) {
    const grouped = new Map()
    for (const row of rows || []) {
      const orderId = cleanText(row.order_no)
      if (!orderId) continue
      if (!grouped.has(orderId)) {
        grouped.set(orderId, {
          order_id: orderId,
          platform: 'lazada',
          shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
          source: LAZADA_FINANCE_TRANSACTION_SOURCE,
          fee_commission: 0,
          fee_payment: 0,
          fee_service: 0,
          fee_affiliate: 0,
          fee_piship: 0,
          fee_handling: 0,
          fee_ads: 0,
          fee_shipping: 0,
          tax_vat: 0,
          tax_pit: 0,
          total_fees: 0,
          settlement: 0,
          raw_data: []
        })
      }
      const detail = grouped.get(orderId)
      const amount = roundAds(row.amount)
      detail.settlement = roundAds(detail.settlement + amount)
      const bucket = lazadaFeeBucket(row)
      if (bucket) {
        const feeAmount = Math.abs(amount)
        detail[bucket] = roundAds(Number(detail[bucket] || 0) + feeAmount)
        detail.total_fees = roundAds(Number(detail.total_fees || 0) + feeAmount)
      }
      detail.raw_data.push(row)
    }

    const details = []
    for (const detail of grouped.values()) {
      // Chỉ lưu khi có settlement hoặc phí thật từ Finance API; dòng rỗng không được dùng để ghi đè số đang có.
      if (!detail.settlement && !detail.total_fees) continue
      detail.raw_data = JSON.stringify({
        endpoint: LAZADA_FINANCE_TRANSACTION_DETAIL_PATH,
        transactions: detail.raw_data.slice(0, 80)
      }).slice(0, 12000)
      details.push(detail)
    }
    return details
  }
  core.buildLazadaFinanceFeeDetails = buildLazadaFinanceFeeDetails

  async function fetchLazadaFinanceTransactions(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'lazada', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchLazadaFinanceTransactionsShop(env, shop, options))
    const details = rows.flatMap(item => item.rows || [])
    return {
      status: 'ok',
      mode: 'lazada_finance_transaction_detail',
      endpoint: LAZADA_FINANCE_TRANSACTION_DETAIL_PATH,
      note: 'Đọc Lazada Finance transaction detail theo ngày. Shop có API mới gọi endpoint thật; shop không API không được gắn nhãn Finance API.',
      date_from: rows[0]?.date_from || '',
      date_to: rows[0]?.date_to || '',
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      total_rows: details.length,
      warnings: rows.filter(item => !item.ok).map(item => ({ shop: item.shop, stage: LAZADA_FINANCE_TRANSACTION_DETAIL_PATH, message: item.message || item.error })),
      shops: rows,
      details
    }
  }
  core.fetchLazadaFinanceTransactions = fetchLazadaFinanceTransactions

  function lazadaCompactYmd(value) {
    const ymd = cleanYmd(value)
    return ymd ? ymd.replace(/-/g, '') : ''
  }
  core.lazadaCompactYmd = lazadaCompactYmd

  function lazadaAccountPageNo(value) {
    const number = Number(value ?? 1)
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 1
  }
  core.lazadaAccountPageNo = lazadaAccountPageNo

  async function callLazadaFinanceAccountTransactionPage(env, shop, options = {}) {
    const params = {
      page_size: options.page_size,
      start_time: lazadaCompactYmd(options.date_from),
      end_time: lazadaCompactYmd(options.date_to),
      page_num: options.page_num
    }
    const transactionType = cleanText(options.transaction_type || options.transactionType)
    const subTransactionType = cleanText(options.sub_transaction_type || options.subTransactionType)
    const transactionNumber = cleanText(options.transaction_number || options.transactionNumber)
    if (transactionType) params.transaction_type = transactionType
    if (subTransactionType) params.sub_transaction_type = subTransactionType
    if (transactionNumber) params.transaction_number = transactionNumber
    return await callLazadaWithShop(env, shop, LAZADA_FINANCE_ACCOUNT_TRANSACTION_PATH, params, true, 'POST')
  }
  core.callLazadaFinanceAccountTransactionPage = callLazadaFinanceAccountTransactionPage

  async function fetchLazadaAccountTransactionsShop(env, shop, options = {}) {
    const window = lazadaFinanceWindow(options)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 20) || 20, 1), 100)
    const maxPages = lazadaFinanceMaxPages(options)
    const startPage = lazadaAccountPageNo(options.page_num || options.pageNo)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'lazada',
      ok: false,
      date_from: window.from,
      date_to: window.to,
      page_num: startPage,
      page_size: pageSize,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    try {
      const rows = []
      let requestId = ''
      for (let page = 0; page < maxPages; page++) {
        const pageNum = startPage + page
        const data = await callLazadaFinanceAccountTransactionPage(env, shop, {
          ...options,
          date_from: window.from,
          date_to: window.to,
          page_size: pageSize,
          page_num: pageNum
        })
        const normalized = normalizeLazadaFinanceTransactions(data, shop, {
          date_from: window.from,
          date_to: window.to,
          offset: pageNum,
          limit: pageSize
        })
        requestId = requestId || normalized.request_id
        rows.push(...normalized.rows)
        if (normalized.rows.length < pageSize) break
      }
      return {
        ...resultBase,
        ok: true,
        total_rows: rows.length,
        request_id: requestId,
        rows
      }
    } catch (error) {
      return {
        ...resultBase,
        error: 'lazada_account_transaction_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchLazadaAccountTransactionsShop = fetchLazadaAccountTransactionsShop

  async function fetchLazadaAccountTransactions(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'lazada', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchLazadaAccountTransactionsShop(env, shop, options))
    const details = rows.flatMap(item => item.rows || [])
    return {
      status: 'ok',
      mode: 'lazada_finance_account_transactions',
      endpoint: LAZADA_FINANCE_ACCOUNT_TRANSACTION_PATH,
      source: LAZADA_FINANCE_ACCOUNT_TRANSACTION_SOURCE,
      note: 'Doc Lazada account transactions bang Finance API POST, dung cho dong tien tai khoan/vi seller. Shop khong API khong duoc gan nhan Finance API.',
      date_from: rows[0]?.date_from || '',
      date_to: rows[0]?.date_to || '',
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      total_rows: details.length,
      summary: {
        amount: roundAds(details.reduce((sum, item) => sum + adsNumber(item.amount), 0))
      },
      warnings: rows.filter(item => !item.ok).map(item => ({ shop: item.shop, stage: LAZADA_FINANCE_ACCOUNT_TRANSACTION_PATH, message: item.message || item.error })),
      shops: rows,
      details
    }
  }
  core.fetchLazadaAccountTransactions = fetchLazadaAccountTransactions

  async function syncLazadaFinanceTransactions(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'lazada', options.shop, shopLimit)
    const cfg = await getCostSettings(env)
    const results = []
    const warnings = []
    let fetchedTransactions = 0
    let groupedOrders = 0
    let savedFeeDetails = 0
    let feeUpdated = 0

    for (const shop of shops) {
      const result = await fetchLazadaFinanceTransactionsShop(env, shop, options)
      const feeDetails = result.ok ? buildLazadaFinanceFeeDetails(shop, result.rows) : []
      let saved = 0
      let updated = 0
      if (feeDetails.length) {
        saved = await saveOrderFeeDetails(env, feeDetails)
        for (const detail of feeDetails) updated += await updateOrderFinancialsFromFeeDetail(env, detail.order_id, detail, cfg)
      }
      fetchedTransactions += result.rows?.length || 0
      groupedOrders += feeDetails.length
      savedFeeDetails += saved
      feeUpdated += updated
      if (!result.ok) warnings.push({ shop: result.shop, stage: LAZADA_FINANCE_TRANSACTION_DETAIL_PATH, message: result.message || result.error })
      results.push({ ...result, grouped_orders: feeDetails.length, saved_fee_details: saved, fee_updated: updated, rows: undefined })
    }

    return {
      status: 'ok',
      mode: 'lazada_finance_transaction_sync',
      endpoint: LAZADA_FINANCE_TRANSACTION_DETAIL_PATH,
      source: LAZADA_FINANCE_TRANSACTION_SOURCE,
      note: 'Sync Lazada Finance vào order_fee_details để order_finance_core đọc lại. Nếu app thiếu quyền Finance/LazPay, warning sẽ ghi đúng theo shop và không tạo fallback giả.',
      shop_count: results.length,
      ok_count: results.filter(item => item.ok).length,
      fetched_transactions: fetchedTransactions,
      grouped_orders: groupedOrders,
      saved_fee_details: savedFeeDetails,
      fee_updated: feeUpdated,
      warnings,
      shops: results
    }
  }
  core.syncLazadaFinanceTransactions = syncLazadaFinanceTransactions

  function normalizeLazadaPayoutRows(data, shop, options = {}) {
    const rows = findLazadaFinanceRows(data?.data || data)
    return rows.map(row => ({
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'lazada',
      source: LAZADA_FINANCE_PAYOUT_SOURCE,
      statement: firstFinanceText(row, ['statement', 'Statement', 'statement_id', 'statementId']),
      paid_status: firstFinanceText(row, ['paid_status', 'paidStatus', 'payout_status', 'payoutStatus', 'status']),
      amount: roundAds(lazadaSignedAmount(row)),
      date_from: cleanText(options.date_from),
      date_to: cleanText(options.date_to),
      raw_data: JSON.stringify(row).slice(0, 8000)
    }))
  }
  core.normalizeLazadaPayoutRows = normalizeLazadaPayoutRows

  async function fetchLazadaPayoutStatusShop(env, shop, options = {}) {
    const window = lazadaFinanceWindow(options)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'lazada',
      ok: false,
      date_from: window.from,
      date_to: window.to,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    try {
      const data = await callLazadaWithShop(env, shop, LAZADA_FINANCE_PAYOUT_STATUS_PATH, {
        created_after: window.from,
        created_before: window.to
      })
      const rows = normalizeLazadaPayoutRows(data, shop, { date_from: window.from, date_to: window.to })
      return {
        ...resultBase,
        ok: true,
        total_rows: rows.length,
        request_id: cleanText(data?.request_id),
        rows,
        raw_response: data?.data || data
      }
    } catch (error) {
      return {
        ...resultBase,
        error: 'lazada_payout_status_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchLazadaPayoutStatusShop = fetchLazadaPayoutStatusShop

  async function fetchLazadaPayoutStatus(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'lazada', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchLazadaPayoutStatusShop(env, shop, options))
    const payouts = rows.flatMap(item => item.rows || [])
    return {
      status: 'ok',
      mode: 'lazada_finance_payout_status',
      endpoint: LAZADA_FINANCE_PAYOUT_STATUS_PATH,
      note: 'Đọc trạng thái payout Lazada để đối soát kỳ; chưa dùng để chốt thuế nếu thiếu statement chính thức.',
      date_from: rows[0]?.date_from || '',
      date_to: rows[0]?.date_to || '',
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      total_rows: payouts.length,
      warnings: rows.filter(item => !item.ok).map(item => ({ shop: item.shop, stage: LAZADA_FINANCE_PAYOUT_STATUS_PATH, message: item.message || item.error })),
      shops: rows,
      payouts
    }
  }
  core.fetchLazadaPayoutStatus = fetchLazadaPayoutStatus
}
