export function installApiSyncShopeeFinancePayoutInfo(core) {
  const SHOPEE_PAYMENT_GENERATE_INCOME_REPORT_PATH = core.SHOPEE_PAYMENT_GENERATE_INCOME_REPORT_PATH
  const SHOPEE_PAYMENT_GENERATE_INCOME_STATEMENT_PATH = core.SHOPEE_PAYMENT_GENERATE_INCOME_STATEMENT_PATH
  const SHOPEE_PAYMENT_INCOME_REPORT_PATH = core.SHOPEE_PAYMENT_INCOME_REPORT_PATH
  const SHOPEE_PAYMENT_INCOME_STATEMENT_PATH = core.SHOPEE_PAYMENT_INCOME_STATEMENT_PATH
  const SHOPEE_PAYMENT_PAYOUT_INFO_PATH = core.SHOPEE_PAYMENT_PAYOUT_INFO_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const dateYmd = (...args) => core.dateYmd(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const roundAds = (...args) => core.roundAds(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const unixToIso = (...args) => core.unixToIso(...args)

  function defaultPaymentFifteenDayRange() {
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - 14)
    return { date_from: dateYmd(from), date_to: dateYmd(to) }
  }
  core.defaultPaymentFifteenDayRange = defaultPaymentFifteenDayRange

  function cleanPayoutInfoRange(options = {}) {
    const defaults = defaultPaymentFifteenDayRange()
    const dateFrom = cleanYmd(options.date_from || options.dateFrom || options.payout_date_from || options.payoutDateFrom) || defaults.date_from
    const dateTo = cleanYmd(options.date_to || options.dateTo || options.payout_date_to || options.payoutDateTo) || defaults.date_to
    const payoutTimeFrom = dateFrom
      ? ymdToBangkokEpoch(dateFrom, false)
      : cleanEpochSeconds(options.payout_time_from ?? options.payoutTimeFrom)
    const payoutTimeTo = dateTo
      ? ymdToBangkokEpoch(dateTo, true)
      : cleanEpochSeconds(options.payout_time_to ?? options.payoutTimeTo)
    return {
      date_from: dateFrom,
      date_to: dateTo,
      payout_time_from: payoutTimeFrom,
      payout_time_to: payoutTimeTo
    }
  }
  core.cleanPayoutInfoRange = cleanPayoutInfoRange

  function payoutInfoRangeError(range) {
    if (!range.payout_time_from || !range.payout_time_to) return 'Missing payout_time_from or payout_time_to'
    if (range.payout_time_from > range.payout_time_to) return 'payout_time_from must be less than or equal to payout_time_to'
    if (range.payout_time_to - range.payout_time_from > 15 * 86400 - 1) {
      return 'Shopee payout info date range cannot exceed 15 days'
    }
    return ''
  }
  core.payoutInfoRangeError = payoutInfoRangeError

  function normalizeShopeePayoutInfoRow(item, shop) {
    const payoutTime = Number(item.payout_time || 0) || 0
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      from_currency: cleanText(item.from_currency),
      payout_currency: cleanText(item.payout_currency),
      from_amount: roundAds(item.from_amount),
      payout_amount: roundAds(item.payout_amount),
      exchange_rate: cleanText(item.exchange_rate),
      payout_time: payoutTime,
      payout_at: unixToIso(payoutTime),
      pay_service: cleanText(item.pay_service),
      payee_id: cleanText(item.payee_id),
      encrypted_payout_id: cleanText(item.encrypted_payout_id)
    }
  }
  core.normalizeShopeePayoutInfoRow = normalizeShopeePayoutInfoRow

  function normalizeShopeePayoutInfo(data, shop, options = {}) {
    const response = data?.response || data || {}
    const list = Array.isArray(response.payout_list)
      ? response.payout_list
      : Array.isArray(data?.payout_list)
        ? data.payout_list
        : []
    const rows = list.map(item => normalizeShopeePayoutInfoRow(item, shop))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      date_from: cleanText(options.date_from),
      date_to: cleanText(options.date_to),
      payout_time_from: cleanEpochSeconds(options.payout_time_from),
      payout_time_to: cleanEpochSeconds(options.payout_time_to),
      payout_time_from_at: unixToIso(options.payout_time_from),
      payout_time_to_at: unixToIso(options.payout_time_to),
      cursor: cleanText(options.cursor),
      next_cursor: cleanText(response.next_cursor || data?.next_cursor),
      more: Boolean(response.more || data?.more),
      page_size: Number(options.page_size || rows.length || 0),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      rows,
      raw_response: response
    }
  }
  core.normalizeShopeePayoutInfo = normalizeShopeePayoutInfo

  async function fetchShopeePayoutInfoShop(env, shop, options = {}) {
    const range = cleanPayoutInfoRange(options)
    const rangeError = payoutInfoRangeError(range)
    const cursor = cleanText(options.cursor)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 10) || 10, 1), 100)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      date_from: range.date_from,
      date_to: range.date_to,
      payout_time_from: range.payout_time_from,
      payout_time_to: range.payout_time_to,
      payout_time_from_at: unixToIso(range.payout_time_from),
      payout_time_to_at: unixToIso(range.payout_time_to),
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
    if (rangeError) {
      return { ...resultBase, error: 'invalid_payout_info_range', message: rangeError }
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_PAYOUT_INFO_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, {
        payout_time_from: range.payout_time_from,
        payout_time_to: range.payout_time_to,
        page_size: pageSize,
        cursor
      })
      return normalizeShopeePayoutInfo(data, shop, {
        ...range,
        cursor,
        page_size: pageSize
      })
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_payout_info_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeePayoutInfoShop = fetchShopeePayoutInfoShop

  async function fetchShopeePayoutInfo(env, options = {}) {
    const range = cleanPayoutInfoRange(options)
    const rangeError = payoutInfoRangeError(range)
    const cursor = cleanText(options.cursor)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 10) || 10, 1), 100)
    if (rangeError) {
      return {
        status: 'error',
        mode: 'shopee_payment_payout_info',
        endpoint: SHOPEE_PAYMENT_PAYOUT_INFO_PATH,
        error: 'invalid_payout_info_range',
        message: rangeError,
        date_from: range.date_from,
        date_to: range.date_to,
        payout_time_from: range.payout_time_from,
        payout_time_to: range.payout_time_to,
        cursor,
        page_size: pageSize,
        shop_count: 0,
        ok_count: 0,
        total_rows: 0,
        shops: [],
        payouts: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) {
      rows.push(await fetchShopeePayoutInfoShop(env, shop, {
        ...options,
        ...range,
        cursor,
        page_size: pageSize
      }))
    }
    const okRows = rows.filter(item => item.ok)
    const payouts = rows.flatMap(item => item.rows || [])
    const positive = payouts.filter(item => adsNumber(item.payout_amount) > 0)
    const negative = payouts.filter(item => adsNumber(item.payout_amount) < 0)
    return {
      status: 'ok',
      mode: 'shopee_payment_payout_info',
      endpoint: SHOPEE_PAYMENT_PAYOUT_INFO_PATH,
      note: 'Payout info tu Shopee Payment get_payout_info. API nay Shopee ghi chi ap dung cho Cross Border seller va gioi han toi da 15 ngay.',
      date_from: range.date_from,
      date_to: range.date_to,
      payout_time_from: range.payout_time_from,
      payout_time_to: range.payout_time_to,
      payout_time_from_at: unixToIso(range.payout_time_from),
      payout_time_to_at: unixToIso(range.payout_time_to),
      cursor,
      page_size: pageSize,
      shop_count: rows.length,
      ok_count: okRows.length,
      total_rows: payouts.length,
      next_cursor: rows.length === 1 ? rows[0]?.next_cursor || '' : '',
      more: rows.length === 1 ? Boolean(rows[0]?.more) : false,
      summary: {
        from_amount: roundAds(payouts.reduce((sum, item) => sum + adsNumber(item.from_amount), 0)),
        payout_amount: roundAds(payouts.reduce((sum, item) => sum + adsNumber(item.payout_amount), 0)),
        positive_amount: roundAds(positive.reduce((sum, item) => sum + adsNumber(item.payout_amount), 0)),
        negative_amount: roundAds(negative.reduce((sum, item) => sum + adsNumber(item.payout_amount), 0)),
        positive_count: positive.length,
        negative_count: negative.length
      },
      shops: rows,
      payouts
    }
  }
  core.fetchShopeePayoutInfo = fetchShopeePayoutInfo
}
