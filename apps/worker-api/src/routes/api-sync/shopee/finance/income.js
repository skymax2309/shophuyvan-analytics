export function installApiSyncShopeeFinanceIncome(core) {
  const SHOPEE_PAYMENT_INCOME_DETAIL_PATH = core.SHOPEE_PAYMENT_INCOME_DETAIL_PATH
  const SHOPEE_PAYMENT_INCOME_OVERVIEW_PATH = core.SHOPEE_PAYMENT_INCOME_OVERVIEW_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const roundAds = (...args) => core.roundAds(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)

  function normalizeShopeeIncomeOverview(data, shop, incomeStatus = '') {
    const response = data?.response || data || {}
    const total = response.total_income || data?.total_income || {}
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      income_status: cleanText(incomeStatus),
      latest_payout_date: cleanText(response.latest_payout_date || data?.latest_payout_date),
      pending_amount: roundAds(total.pending_amount),
      to_release_amount: roundAds(total.to_release_amount),
      released_amount: roundAds(total.released_amount),
      total_amount: roundAds(
        adsNumber(total.pending_amount) +
        adsNumber(total.to_release_amount) +
        adsNumber(total.released_amount)
      ),
      request_id: cleanText(data?.request_id),
      error: '',
      message: '',
      raw_response: response
    }
  }
  core.normalizeShopeeIncomeOverview = normalizeShopeeIncomeOverview

  async function fetchShopeeIncomeOverviewShop(env, shop, options = {}) {
    const incomeStatus = cleanText(options.income_status ?? options.incomeStatus)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      income_status: incomeStatus,
      latest_payout_date: '',
      pending_amount: 0,
      to_release_amount: 0,
      released_amount: 0,
      total_amount: 0,
      request_id: '',
      error: '',
      message: ''
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_INCOME_OVERVIEW_PATH, shop.access_token, shop.api_shop_id)
      const params = {}
      if (incomeStatus !== '') params.income_status = incomeStatus
      const data = await fetchShopeeJson(buildUrl, params)
      return normalizeShopeeIncomeOverview(data, shop, incomeStatus)
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_income_overview_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeIncomeOverviewShop = fetchShopeeIncomeOverviewShop

  async function fetchShopeeIncomeOverview(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeIncomeOverviewShop(env, shop, options))
    const okRows = rows.filter(item => item.ok)
    const summary = {
      pending_amount: roundAds(okRows.reduce((sum, item) => sum + adsNumber(item.pending_amount), 0)),
      to_release_amount: roundAds(okRows.reduce((sum, item) => sum + adsNumber(item.to_release_amount), 0)),
      released_amount: roundAds(okRows.reduce((sum, item) => sum + adsNumber(item.released_amount), 0)),
      total_amount: roundAds(okRows.reduce((sum, item) => sum + adsNumber(item.total_amount), 0))
    }
    return {
      status: 'ok',
      mode: 'shopee_payment_income_overview',
      endpoint: SHOPEE_PAYMENT_INCOME_OVERVIEW_PATH,
      note: 'Số dư/doanh thu thanh toán realtime từ Shopee Payment get_income_overview. Đây không phải dữ liệu lịch sử từng ngày và không lấy từ cost setting.',
      income_status: cleanText(options.income_status ?? options.incomeStatus),
      shop_count: rows.length,
      ok_count: okRows.length,
      summary,
      shops: rows
    }
  }
  core.fetchShopeeIncomeOverview = fetchShopeeIncomeOverview

  function dateYmd(date) {
    // Chuẩn hóa ngày mặc định theo múi giờ Bangkok để bộ lọc "hôm nay/tháng này"
    // không bị lệch 7 giờ khi Worker đang chạy theo UTC.
    const shifted = new Date(date.getTime() + 7 * 3600 * 1000)
    const yyyy = shifted.getUTCFullYear()
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(shifted.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  core.dateYmd = dateYmd

  function cleanYmd(value) {
    const text = cleanText(value)
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
  }
  core.cleanYmd = cleanYmd

  function defaultIncomeDetailRange() {
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - 13)
    return { date_from: dateYmd(from), date_to: dateYmd(to) }
  }
  core.defaultIncomeDetailRange = defaultIncomeDetailRange

  function cleanIncomeStatus(value) {
    const status = cleanText(value)
    return ['0', '1', '2'].includes(status) ? status : '2'
  }
  core.cleanIncomeStatus = cleanIncomeStatus

  function unixToIso(value) {
    const timestamp = Number(value || 0)
    if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
    return new Date(timestamp * 1000).toISOString()
  }
  core.unixToIso = unixToIso

  function normalizeShopeeIncomeDetailRow(item, shop, incomeStatus) {
    const estimated = roundAds(item.estimated_escrow_amount)
    const toRelease = roundAds(item.to_release_amount)
    const released = roundAds(item.released_amount)
    const amount = released || toRelease || estimated
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      income_status: cleanText(incomeStatus),
      order_sn: cleanText(item.order_sn),
      payment_method: cleanText(item.payment_method),
      description: cleanText(item.description),
      status: cleanText(item.status),
      currency: cleanText(item.currency),
      estimated_escrow_amount: estimated,
      to_release_amount: toRelease,
      released_amount: released,
      amount,
      creation_date: Number(item.creation_date || 0) || 0,
      creation_time: unixToIso(item.creation_date),
      estimated_payout_time: Number(item.estimated_payout_time || 0) || 0,
      estimated_payout_at: unixToIso(item.estimated_payout_time),
      actual_payout_time: Number(item.actual_payout_time || 0) || 0,
      actual_payout_at: unixToIso(item.actual_payout_time)
    }
  }
  core.normalizeShopeeIncomeDetailRow = normalizeShopeeIncomeDetailRow

  function normalizeShopeeIncomeDetail(data, shop, options = {}) {
    const response = data?.response || data || {}
    const incomeDetail = response.income_detail_list || data?.income_detail_list || {}
    const list = Array.isArray(incomeDetail.list)
      ? incomeDetail.list
      : Array.isArray(response.list)
        ? response.list
        : []
    const nextPage = incomeDetail.next_page || response.next_page || {}
    const rows = list.map(item => normalizeShopeeIncomeDetailRow(item, shop, options.income_status))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      income_status: cleanText(options.income_status),
      date_from: cleanText(options.date_from),
      date_to: cleanText(options.date_to),
      cursor: cleanText(options.cursor),
      next_cursor: cleanText(nextPage.cursor),
      page_size: Number(nextPage.page_size || options.page_size || rows.length || 0),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: '',
      rows,
      raw_response: response
    }
  }
  core.normalizeShopeeIncomeDetail = normalizeShopeeIncomeDetail

  async function fetchShopeeIncomeDetailShop(env, shop, options = {}) {
    const defaults = defaultIncomeDetailRange()
    const incomeStatus = cleanIncomeStatus(options.income_status ?? options.incomeStatus)
    const dateFrom = cleanYmd(options.date_from || options.dateFrom) || defaults.date_from
    const dateTo = cleanYmd(options.date_to || options.dateTo) || defaults.date_to
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 30) || 30, 1), 100)
    const cursor = cleanText(options.cursor)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      income_status: incomeStatus,
      date_from: dateFrom,
      date_to: dateTo,
      cursor,
      next_cursor: '',
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
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_INCOME_DETAIL_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, {
        date_from: dateFrom,
        date_to: dateTo,
        income_status: incomeStatus,
        cursor,
        page_size: pageSize
      })
      return normalizeShopeeIncomeDetail(data, shop, {
        income_status: incomeStatus,
        date_from: dateFrom,
        date_to: dateTo,
        cursor,
        page_size: pageSize
      })
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_income_detail_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeIncomeDetailShop = fetchShopeeIncomeDetailShop

  async function fetchShopeeIncomeDetail(env, options = {}) {
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeIncomeDetailShop(env, shop, options))
    const okRows = rows.filter(item => item.ok)
    const details = rows.flatMap(item => item.rows || [])
    return {
      status: 'ok',
      mode: 'shopee_payment_income_detail',
      endpoint: SHOPEE_PAYMENT_INCOME_DETAIL_PATH,
      note: 'Chi tiet thu nhap tung don tu Shopee Payment get_income_detail. Released dung date_from/date_to, Pending/To Release la cac ban ghi hien trong trang thai do.',
      income_status: cleanIncomeStatus(options.income_status ?? options.incomeStatus),
      date_from: okRows[0]?.date_from || rows[0]?.date_from || '',
      date_to: okRows[0]?.date_to || rows[0]?.date_to || '',
      shop_count: rows.length,
      ok_count: okRows.length,
      total_rows: details.length,
      next_cursor: rows.length === 1 ? rows[0]?.next_cursor || '' : '',
      summary: {
        estimated_escrow_amount: roundAds(details.reduce((sum, item) => sum + adsNumber(item.estimated_escrow_amount), 0)),
        to_release_amount: roundAds(details.reduce((sum, item) => sum + adsNumber(item.to_release_amount), 0)),
        released_amount: roundAds(details.reduce((sum, item) => sum + adsNumber(item.released_amount), 0)),
        amount: roundAds(details.reduce((sum, item) => sum + adsNumber(item.amount), 0))
      },
      shops: rows,
      details
    }
  }
  core.fetchShopeeIncomeDetail = fetchShopeeIncomeDetail
}
