export function installApiSyncShopeeFinanceTransactionsWallet(core) {
  const SHOPEE_PAYMENT_BILLING_TRANSACTION_INFO_PATH = core.SHOPEE_PAYMENT_BILLING_TRANSACTION_INFO_PATH
  const SHOPEE_PAYMENT_WALLET_TRANSACTION_LIST_PATH = core.SHOPEE_PAYMENT_WALLET_TRANSACTION_LIST_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanEpochSeconds = (...args) => core.cleanEpochSeconds(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const fetchShopeeJsonPost = (...args) => core.fetchShopeeJsonPost(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const roundAds = (...args) => core.roundAds(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const unixToIso = (...args) => core.unixToIso(...args)
  const ymdToBangkokEpoch = (...args) => core.ymdToBangkokEpoch(...args)

  function cleanBillingTransactionInfoType(value) {
    const type = String(value ?? '').trim()
    return type === '2' ? 2 : 1
  }
  core.cleanBillingTransactionInfoType = cleanBillingTransactionInfoType

  function cleanEncryptedPayoutIds(value) {
    const source = Array.isArray(value)
      ? value
      : cleanText(value).split(/[\n,;]+/)
    return [...new Set(source.map(cleanText).filter(Boolean))].slice(0, 100)
  }
  core.cleanEncryptedPayoutIds = cleanEncryptedPayoutIds

  function normalizeShopeeBillingTransactionRow(item, shop, infoType) {
    const amount = roundAds(item.amount)
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      billing_transaction_info_type: Number(infoType || 1),
      amount,
      currency: cleanText(item.currency),
      order_sn: cleanText(item.order_sn),
      cost_header: cleanText(item.cost_header),
      scenario: cleanText(item.scenario),
      remark: cleanText(item.remark),
      level: cleanText(item.level),
      billing_transaction_type: cleanText(item.billing_transaction_type),
      billing_transaction_status: cleanText(item.billing_transaction_status)
    }
  }
  core.normalizeShopeeBillingTransactionRow = normalizeShopeeBillingTransactionRow

  function normalizeShopeeBillingTransactionInfo(data, shop, options = {}) {
    const response = data?.response || data || {}
    const list = Array.isArray(response.transactions)
      ? response.transactions
      : Array.isArray(data?.transactions)
        ? data.transactions
        : []
    const rows = list.map(item => normalizeShopeeBillingTransactionRow(item, shop, options.billing_transaction_info_type))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      billing_transaction_info_type: Number(options.billing_transaction_info_type || 1),
      encrypted_payout_ids: cleanEncryptedPayoutIds(options.encrypted_payout_ids),
      cursor: cleanText(options.cursor),
      next_cursor: cleanText(response.next_cursor || data?.next_cursor),
      more: Boolean(response.more || data?.more),
      page_size: Number(options.page_size || rows.length || 0),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: '',
      rows,
      raw_response: response
    }
  }
  core.normalizeShopeeBillingTransactionInfo = normalizeShopeeBillingTransactionInfo

  async function fetchShopeeBillingTransactionInfoShop(env, shop, options = {}) {
    const infoType = cleanBillingTransactionInfoType(options.billing_transaction_info_type ?? options.billingTransactionInfoType)
    const encryptedPayoutIds = cleanEncryptedPayoutIds(options.encrypted_payout_ids ?? options.encryptedPayoutIds)
    const cursor = cleanText(options.cursor)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 100) || 100, 1), 100)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      billing_transaction_info_type: infoType,
      encrypted_payout_ids: encryptedPayoutIds,
      cursor,
      next_cursor: '',
      more: false,
      page_size: pageSize,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_BILLING_TRANSACTION_INFO_PATH, shop.access_token, shop.api_shop_id)
      const body = {
        billing_transaction_info_type: infoType,
        encrypted_payout_ids: encryptedPayoutIds,
        cursor,
        page_size: pageSize
      }
      const data = await fetchShopeeJsonPost(buildUrl, {}, body)
      return normalizeShopeeBillingTransactionInfo(data, shop, {
        billing_transaction_info_type: infoType,
        encrypted_payout_ids: encryptedPayoutIds,
        cursor,
        page_size: pageSize
      })
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_billing_transaction_info_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeBillingTransactionInfoShop = fetchShopeeBillingTransactionInfoShop

  async function fetchShopeeBillingTransactionInfo(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeBillingTransactionInfoShop(env, shop, options))
    const okRows = rows.filter(item => item.ok)
    const transactions = rows.flatMap(item => item.rows || [])
    const positive = transactions.filter(item => adsNumber(item.amount) > 0)
    const negative = transactions.filter(item => adsNumber(item.amount) < 0)
    return {
      status: 'ok',
      mode: 'shopee_payment_billing_transaction_info',
      endpoint: SHOPEE_PAYMENT_BILLING_TRANSACTION_INFO_PATH,
      note: 'Billing transaction tu Shopee Payment get_billing_transaction_info. API nay Shopee ghi chi ap dung cho Cross Border seller.',
      billing_transaction_info_type: cleanBillingTransactionInfoType(options.billing_transaction_info_type ?? options.billingTransactionInfoType),
      encrypted_payout_ids: cleanEncryptedPayoutIds(options.encrypted_payout_ids ?? options.encryptedPayoutIds),
      shop_count: rows.length,
      ok_count: okRows.length,
      total_rows: transactions.length,
      next_cursor: rows.length === 1 ? rows[0]?.next_cursor || '' : '',
      more: rows.length === 1 ? Boolean(rows[0]?.more) : false,
      summary: {
        amount: roundAds(transactions.reduce((sum, item) => sum + adsNumber(item.amount), 0)),
        positive_amount: roundAds(positive.reduce((sum, item) => sum + adsNumber(item.amount), 0)),
        negative_amount: roundAds(negative.reduce((sum, item) => sum + adsNumber(item.amount), 0)),
        positive_count: positive.length,
        negative_count: negative.length
      },
      shops: rows,
      transactions
    }
  }
  core.fetchShopeeBillingTransactionInfo = fetchShopeeBillingTransactionInfo

  function cleanWalletTransactionRange(options = {}) {
    const dateFrom = cleanYmd(options.date_from || options.dateFrom || options.create_date_from || options.createDateFrom)
    const dateTo = cleanYmd(options.date_to || options.dateTo || options.create_date_to || options.createDateTo)
    const createTimeFrom = dateFrom
      ? ymdToBangkokEpoch(dateFrom, false)
      : cleanEpochSeconds(options.create_time_from ?? options.createTimeFrom)
    const createTimeTo = dateTo
      ? ymdToBangkokEpoch(dateTo, true)
      : cleanEpochSeconds(options.create_time_to ?? options.createTimeTo)
    return {
      date_from: dateFrom,
      date_to: dateTo,
      create_time_from: createTimeFrom,
      create_time_to: createTimeTo
    }
  }
  core.cleanWalletTransactionRange = cleanWalletTransactionRange

  function walletTransactionRangeError(range) {
    if (!range.create_time_from || !range.create_time_to) return ''
    if (range.create_time_from > range.create_time_to) return 'create_time_from must be less than or equal to create_time_to'
    if (range.create_time_to - range.create_time_from > 15 * 86400 - 1) {
      return 'Shopee wallet transaction date range cannot exceed 15 days'
    }
    return ''
  }
  core.walletTransactionRangeError = walletTransactionRangeError

  function cleanWalletMoneyFlow(value) {
    const text = cleanText(value).toUpperCase()
    return ['MONEY_IN', 'MONEY_OUT'].includes(text) ? text : ''
  }
  core.cleanWalletMoneyFlow = cleanWalletMoneyFlow

  function cleanWalletPageNo(value) {
    const number = Number(value ?? 0)
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
  }
  core.cleanWalletPageNo = cleanWalletPageNo

  function normalizeShopeeWalletTransactionRow(item, shop) {
    const amount = roundAds(item.amount)
    const createTime = Number(item.create_time || 0) || 0
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      status: cleanText(item.status),
      transaction_type: cleanText(item.transaction_type),
      amount,
      current_balance: roundAds(item.current_balance),
      create_time: createTime,
      create_at: unixToIso(createTime),
      order_sn: cleanText(item.order_sn),
      refund_sn: cleanText(item.refund_sn),
      withdrawal_type: cleanText(item.withdrawal_type),
      transaction_fee: roundAds(item.transaction_fee),
      description: cleanText(item.description),
      buyer_name: cleanText(item.buyer_name),
      pay_order_list: Array.isArray(item.pay_order_list) ? item.pay_order_list : [],
      withdrawal_id: cleanText(item.withdrawal_id),
      reason: cleanText(item.reason),
      root_withdrawal_id: cleanText(item.root_withdrawal_id),
      transaction_tab_type: cleanText(item.transaction_tab_type),
      money_flow: cleanText(item.money_flow),
      outlet_shop_name: cleanText(item.outlet_shop_name)
    }
  }
  core.normalizeShopeeWalletTransactionRow = normalizeShopeeWalletTransactionRow

  function normalizeShopeeWalletTransactionList(data, shop, options = {}) {
    const response = data?.response || data || {}
    const list = Array.isArray(response.transaction_list)
      ? response.transaction_list
      : Array.isArray(data?.transaction_list)
        ? data.transaction_list
        : []
    const rows = list.map(item => normalizeShopeeWalletTransactionRow(item, shop))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      page_no: cleanWalletPageNo(options.page_no ?? options.pageNo),
      page_size: Number(options.page_size || rows.length || 0),
      create_time_from: cleanEpochSeconds(options.create_time_from),
      create_time_to: cleanEpochSeconds(options.create_time_to),
      create_time_from_at: unixToIso(options.create_time_from),
      create_time_to_at: unixToIso(options.create_time_to),
      more: Boolean(response.more || data?.more),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      rows,
      raw_response: response
    }
  }
  core.normalizeShopeeWalletTransactionList = normalizeShopeeWalletTransactionList

  async function fetchShopeeWalletTransactionListShop(env, shop, options = {}) {
    const range = cleanWalletTransactionRange(options)
    const rangeError = walletTransactionRangeError(range)
    const pageNo = cleanWalletPageNo(options.page_no ?? options.pageNo)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 40) || 40, 1), 100)
    const walletType = cleanText(options.wallet_type ?? options.walletType)
    const transactionType = cleanText(options.transaction_type ?? options.transactionType)
    const moneyFlow = cleanWalletMoneyFlow(options.money_flow ?? options.moneyFlow)
    const transactionTabType = cleanText(options.transaction_tab_type ?? options.transactionTabType)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      page_no: pageNo,
      page_size: pageSize,
      create_time_from: range.create_time_from,
      create_time_to: range.create_time_to,
      create_time_from_at: unixToIso(range.create_time_from),
      create_time_to_at: unixToIso(range.create_time_to),
      more: false,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    if (rangeError) {
      return { ...resultBase, error: 'invalid_wallet_transaction_range', message: rangeError }
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_WALLET_TRANSACTION_LIST_PATH, shop.access_token, shop.api_shop_id)
      const params = {
        page_no: pageNo,
        page_size: pageSize
      }
      if (range.create_time_from) params.create_time_from = range.create_time_from
      if (range.create_time_to) params.create_time_to = range.create_time_to
      if (walletType) params.wallet_type = walletType
      if (transactionType) params.transaction_type = transactionType
      if (moneyFlow) params.money_flow = moneyFlow
      if (transactionTabType) params.transaction_tab_type = transactionTabType
      const data = await fetchShopeeJson(buildUrl, params)
      return normalizeShopeeWalletTransactionList(data, shop, {
        page_no: pageNo,
        page_size: pageSize,
        create_time_from: range.create_time_from,
        create_time_to: range.create_time_to
      })
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_wallet_transaction_list_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeWalletTransactionListShop = fetchShopeeWalletTransactionListShop

  async function fetchShopeeWalletTransactionList(env, options = {}) {
    const range = cleanWalletTransactionRange(options)
    const rangeError = walletTransactionRangeError(range)
    const pageNo = cleanWalletPageNo(options.page_no ?? options.pageNo)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 40) || 40, 1), 100)
    if (rangeError) {
      return {
        status: 'error',
        mode: 'shopee_payment_wallet_transaction_list',
        endpoint: SHOPEE_PAYMENT_WALLET_TRANSACTION_LIST_PATH,
        error: 'invalid_wallet_transaction_range',
        message: rangeError,
        page_no: pageNo,
        page_size: pageSize,
        create_time_from: range.create_time_from,
        create_time_to: range.create_time_to,
        shop_count: 0,
        ok_count: 0,
        total_rows: 0,
        shops: [],
        transactions: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) {
      rows.push(await fetchShopeeWalletTransactionListShop(env, shop, {
        ...options,
        ...range,
        page_no: pageNo,
        page_size: pageSize
      }))
    }
    const okRows = rows.filter(item => item.ok)
    const transactions = rows.flatMap(item => item.rows || [])
    const moneyIn = transactions.filter(item => item.money_flow === 'MONEY_IN' || adsNumber(item.amount) > 0)
    const moneyOut = transactions.filter(item => item.money_flow === 'MONEY_OUT' || adsNumber(item.amount) < 0)
    return {
      status: 'ok',
      mode: 'shopee_payment_wallet_transaction_list',
      endpoint: SHOPEE_PAYMENT_WALLET_TRANSACTION_LIST_PATH,
      note: 'Giao dich vi Shopee Payment get_wallet_transaction_list. API Shopee ghi chi ap dung cho local shops.',
      page_no: pageNo,
      page_size: pageSize,
      create_time_from: range.create_time_from,
      create_time_to: range.create_time_to,
      create_time_from_at: unixToIso(range.create_time_from),
      create_time_to_at: unixToIso(range.create_time_to),
      shop_count: rows.length,
      ok_count: okRows.length,
      total_rows: transactions.length,
      more: rows.length === 1 ? Boolean(rows[0]?.more) : false,
      summary: {
        amount: roundAds(transactions.reduce((sum, item) => sum + adsNumber(item.amount), 0)),
        money_in_amount: roundAds(moneyIn.reduce((sum, item) => sum + adsNumber(item.amount), 0)),
        money_out_amount: roundAds(moneyOut.reduce((sum, item) => sum + adsNumber(item.amount), 0)),
        money_in_count: moneyIn.length,
        money_out_count: moneyOut.length
      },
      shops: rows,
      transactions
    }
  }
  core.fetchShopeeWalletTransactionList = fetchShopeeWalletTransactionList
}
