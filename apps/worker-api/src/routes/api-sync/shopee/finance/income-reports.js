export function installApiSyncShopeeFinanceIncomeReports(core) {
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

  function cleanIncomeStatementId(value) {
    const id = cleanText(value)
    return /^\d+$/.test(id) ? id : ''
  }
  core.cleanIncomeStatementId = cleanIncomeStatementId

  function cleanIncomeReportId(value) {
    const id = cleanText(value)
    return /^\d+$/.test(id) ? id : ''
  }
  core.cleanIncomeReportId = cleanIncomeReportId

  function incomeStatementStatusText(value) {
    const status = Number(value)
    if (status === 0) return 'Invalid'
    if (status === 1) return 'Processing'
    if (status === 2) return 'Downloadable'
    if (status === 3) return 'Downloaded'
    if (status === 4) return 'Failed'
    return 'Unknown'
  }
  core.incomeStatementStatusText = incomeStatementStatusText

  function shopeeTimestampToIso(value) {
    const timestamp = Number(value || 0)
    if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
    const ms = timestamp > 1e12 ? timestamp : timestamp * 1000
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  core.shopeeTimestampToIso = shopeeTimestampToIso

  function ymdToBangkokEpoch(value, endOfDay = false) {
    const ymd = cleanYmd(value)
    if (!ymd) return 0
    const suffix = endOfDay ? 'T23:59:59+07:00' : 'T00:00:00+07:00'
    const ms = Date.parse(`${ymd}${suffix}`)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
  }
  core.ymdToBangkokEpoch = ymdToBangkokEpoch

  function cleanEpochSeconds(value) {
    const text = cleanText(value)
    if (!text) return 0
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return ymdToBangkokEpoch(text)
    const number = Number(text)
    if (!Number.isFinite(number) || number <= 0) return 0
    return Math.floor(number > 1e12 ? number / 1000 : number)
  }
  core.cleanEpochSeconds = cleanEpochSeconds

  function cleanIncomeReportRange(options = {}) {
    const dateFrom = cleanYmd(options.date_from || options.dateFrom || options.release_date_from || options.releaseDateFrom)
    const dateTo = cleanYmd(options.date_to || options.dateTo || options.release_date_to || options.releaseDateTo)
    const from = dateFrom
      ? ymdToBangkokEpoch(dateFrom, false)
      : cleanEpochSeconds(options.release_time_from ?? options.releaseTimeFrom)
    const to = dateTo
      ? ymdToBangkokEpoch(dateTo, true)
      : cleanEpochSeconds(options.release_time_to ?? options.releaseTimeTo)
    return { release_time_from: from, release_time_to: to, date_from: dateFrom, date_to: dateTo }
  }
  core.cleanIncomeReportRange = cleanIncomeReportRange

  function cleanIncomeStatementType(value) {
    const type = String(value ?? '').trim()
    return type === '2' ? 2 : 1
  }
  core.cleanIncomeStatementType = cleanIncomeStatementType

  function ymdParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanText(value))
    if (!match) return null
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  }
  core.ymdParts = ymdParts

  function ymdWeekday(value) {
    const parts = ymdParts(value)
    if (!parts) return -1
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  }
  core.ymdWeekday = ymdWeekday

  function ymdLastDay(value) {
    const parts = ymdParts(value)
    if (!parts) return 0
    return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
  }
  core.ymdLastDay = ymdLastDay

  function cleanIncomeStatementGenerationRange(options = {}) {
    const range = cleanIncomeReportRange(options)
    return {
      ...range,
      statement_type: cleanIncomeStatementType(options.statement_type ?? options.statementType)
    }
  }
  core.cleanIncomeStatementGenerationRange = cleanIncomeStatementGenerationRange

  function incomeStatementGenerationRangeError(range) {
    if (!range.release_time_from || !range.release_time_to || range.release_time_from > range.release_time_to) {
      return 'release_time_from and release_time_to are required and from must be <= to'
    }
    if (range.date_from && range.date_to && range.statement_type === 1) {
      if (ymdWeekday(range.date_from) !== 1 || ymdWeekday(range.date_to) !== 0) {
        return 'Weekly income statement requires Monday start date and Sunday end date'
      }
    }
    if (range.date_from && range.date_to && range.statement_type === 2) {
      const from = ymdParts(range.date_from)
      const to = ymdParts(range.date_to)
      if (!from || !to || from.day !== 1 || to.day !== ymdLastDay(range.date_to)) {
        return 'Monthly income statement requires first day start date and last day end date'
      }
    }
    return ''
  }
  core.incomeStatementGenerationRangeError = incomeStatementGenerationRangeError

  function normalizeShopeeIncomeReportGeneration(data, shop, range) {
    const response = data?.response || data || {}
    const id = cleanText(response.id || data?.id)
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      report_id: id,
      income_report_id: id,
      release_time_from: Number(range.release_time_from || 0),
      release_time_to: Number(range.release_time_to || 0),
      release_time_from_at: unixToIso(range.release_time_from),
      release_time_to_at: unixToIso(range.release_time_to),
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.msg || data?.message),
      raw_response: response
    }
  }
  core.normalizeShopeeIncomeReportGeneration = normalizeShopeeIncomeReportGeneration

  async function generateShopeeIncomeReportShop(env, shop, options = {}) {
    const range = cleanIncomeReportRange(options)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      report_id: '',
      income_report_id: '',
      release_time_from: range.release_time_from,
      release_time_to: range.release_time_to,
      release_time_from_at: unixToIso(range.release_time_from),
      release_time_to_at: unixToIso(range.release_time_to),
      request_id: '',
      error: '',
      message: ''
    }
    if (!range.release_time_from || !range.release_time_to || range.release_time_from > range.release_time_to) {
      return {
        ...resultBase,
        error: 'invalid_release_time_range',
        message: 'release_time_from and release_time_to are required and from must be <= to'
      }
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_GENERATE_INCOME_REPORT_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, {
        release_time_from: range.release_time_from,
        release_time_to: range.release_time_to
      })
      return normalizeShopeeIncomeReportGeneration(data, shop, range)
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_generate_income_report_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.generateShopeeIncomeReportShop = generateShopeeIncomeReportShop

  async function generateShopeeIncomeReport(env, options = {}) {
    const range = cleanIncomeReportRange(options)
    if (!range.release_time_from || !range.release_time_to || range.release_time_from > range.release_time_to) {
      return {
        status: 'error',
        mode: 'shopee_payment_generate_income_report',
        endpoint: SHOPEE_PAYMENT_GENERATE_INCOME_REPORT_PATH,
        error: 'invalid_release_time_range',
        message: 'release_time_from and release_time_to are required and from must be <= to',
        release_time_from: range.release_time_from,
        release_time_to: range.release_time_to,
        shop_count: 0,
        ok_count: 0,
        reports: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await generateShopeeIncomeReportShop(env, shop, { ...options, ...range }))
    const okRows = rows.filter(item => item.ok)
    return {
      status: 'ok',
      mode: 'shopee_payment_generate_income_report',
      endpoint: SHOPEE_PAYMENT_GENERATE_INCOME_REPORT_PATH,
      note: 'Tao file income report tu Shopee Payment generate_income_report. Shopee tra income report id; get_income_statement co the yeu cau income_statement_id rieng.',
      release_time_from: range.release_time_from,
      release_time_to: range.release_time_to,
      release_time_from_at: unixToIso(range.release_time_from),
      release_time_to_at: unixToIso(range.release_time_to),
      shop_count: rows.length,
      ok_count: okRows.length,
      reports: rows
    }
  }
  core.generateShopeeIncomeReport = generateShopeeIncomeReport

  function normalizeShopeeIncomeStatementGeneration(data, shop, range) {
    const response = data?.response || data || {}
    const id = cleanText(response.id || data?.id)
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      statement_id: id,
      income_statement_id: id,
      statement_type: Number(range.statement_type || 1),
      release_time_from: Number(range.release_time_from || 0),
      release_time_to: Number(range.release_time_to || 0),
      release_time_from_at: unixToIso(range.release_time_from),
      release_time_to_at: unixToIso(range.release_time_to),
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      raw_response: response
    }
  }
  core.normalizeShopeeIncomeStatementGeneration = normalizeShopeeIncomeStatementGeneration

  async function generateShopeeIncomeStatementShop(env, shop, options = {}) {
    const range = cleanIncomeStatementGenerationRange(options)
    const rangeError = incomeStatementGenerationRangeError(range)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      statement_id: '',
      income_statement_id: '',
      statement_type: range.statement_type,
      release_time_from: range.release_time_from,
      release_time_to: range.release_time_to,
      release_time_from_at: unixToIso(range.release_time_from),
      release_time_to_at: unixToIso(range.release_time_to),
      request_id: '',
      error: '',
      message: ''
    }
    if (rangeError) {
      return { ...resultBase, error: 'invalid_income_statement_range', message: rangeError }
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_GENERATE_INCOME_STATEMENT_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, {
        release_time_from: range.release_time_from,
        release_time_to: range.release_time_to,
        statement_type: range.statement_type
      })
      return normalizeShopeeIncomeStatementGeneration(data, shop, range)
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_generate_income_statement_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.generateShopeeIncomeStatementShop = generateShopeeIncomeStatementShop

  async function generateShopeeIncomeStatement(env, options = {}) {
    const range = cleanIncomeStatementGenerationRange(options)
    const rangeError = incomeStatementGenerationRangeError(range)
    if (rangeError) {
      return {
        status: 'error',
        mode: 'shopee_payment_generate_income_statement',
        endpoint: SHOPEE_PAYMENT_GENERATE_INCOME_STATEMENT_PATH,
        error: 'invalid_income_statement_range',
        message: rangeError,
        statement_type: range.statement_type,
        release_time_from: range.release_time_from,
        release_time_to: range.release_time_to,
        shop_count: 0,
        ok_count: 0,
        statements: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await generateShopeeIncomeStatementShop(env, shop, { ...options, ...range }))
    const okRows = rows.filter(item => item.ok)
    return {
      status: 'ok',
      mode: 'shopee_payment_generate_income_statement',
      endpoint: SHOPEE_PAYMENT_GENERATE_INCOME_STATEMENT_PATH,
      note: 'Tao income statement tu Shopee Payment generate_income_statement. ID tra ve dung de kiem tra trang thai va link bang get_income_statement.',
      statement_type: range.statement_type,
      release_time_from: range.release_time_from,
      release_time_to: range.release_time_to,
      release_time_from_at: unixToIso(range.release_time_from),
      release_time_to_at: unixToIso(range.release_time_to),
      shop_count: rows.length,
      ok_count: okRows.length,
      statements: rows
    }
  }
  core.generateShopeeIncomeStatement = generateShopeeIncomeStatement

  function normalizeShopeeIncomeStatement(data, shop, incomeStatementId) {
    const response = data?.response || data || {}
    const status = Number(response.status ?? -1)
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      income_statement_id: cleanText(response.id || incomeStatementId),
      file_name: cleanText(response.file_name),
      status,
      status_label: incomeStatementStatusText(status),
      generated_time: Number(response.generated_time || 0) || 0,
      generated_at: shopeeTimestampToIso(response.generated_time),
      file_link: cleanText(response.file_link),
      downloadable: status === 2 || status === 3 || Boolean(response.file_link),
      request_id: cleanText(data?.request_id),
      error: '',
      message: '',
      raw_response: response
    }
  }
  core.normalizeShopeeIncomeStatement = normalizeShopeeIncomeStatement

  function normalizeShopeeIncomeReport(data, shop, incomeReportId) {
    const response = data?.response || data || {}
    const status = Number(response.status ?? -1)
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      income_report_id: cleanText(response.id || incomeReportId),
      file_name: cleanText(response.file_name),
      status,
      status_label: incomeStatementStatusText(status),
      generated_time: Number(response.generated_time || 0) || 0,
      generated_at: shopeeTimestampToIso(response.generated_time),
      file_link: cleanText(response.file_link),
      downloadable: status === 2 || status === 3 || Boolean(response.file_link),
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      raw_response: response
    }
  }
  core.normalizeShopeeIncomeReport = normalizeShopeeIncomeReport

  async function fetchShopeeIncomeStatementShop(env, shop, options = {}) {
    const incomeStatementId = cleanIncomeStatementId(options.income_statement_id ?? options.incomeStatementId)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      income_statement_id: incomeStatementId,
      file_name: '',
      status: -1,
      status_label: 'Unknown',
      generated_time: 0,
      generated_at: '',
      file_link: '',
      downloadable: false,
      request_id: '',
      error: '',
      message: ''
    }
    if (!incomeStatementId) {
      return { ...resultBase, error: 'missing_income_statement_id', message: 'Missing income_statement_id' }
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_INCOME_STATEMENT_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, { income_statement_id: incomeStatementId })
      return normalizeShopeeIncomeStatement(data, shop, incomeStatementId)
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_income_statement_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeIncomeStatementShop = fetchShopeeIncomeStatementShop

  async function fetchShopeeIncomeReportShop(env, shop, options = {}) {
    const incomeReportId = cleanIncomeReportId(options.income_report_id ?? options.incomeReportId)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      income_report_id: incomeReportId,
      file_name: '',
      status: -1,
      status_label: 'Unknown',
      generated_time: 0,
      generated_at: '',
      file_link: '',
      downloadable: false,
      request_id: '',
      error: '',
      message: ''
    }
    if (!incomeReportId) {
      return { ...resultBase, error: 'missing_income_report_id', message: 'Missing income_report_id' }
    }
    if (!shop.api_shop_id) {
      return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_INCOME_REPORT_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, { income_report_id: incomeReportId })
      return normalizeShopeeIncomeReport(data, shop, incomeReportId)
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_income_report_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeIncomeReportShop = fetchShopeeIncomeReportShop

  async function fetchShopeeIncomeStatement(env, options = {}) {
    const incomeStatementId = cleanIncomeStatementId(options.income_statement_id ?? options.incomeStatementId)
    if (!incomeStatementId) {
      return {
        status: 'error',
        mode: 'shopee_payment_income_statement',
        endpoint: SHOPEE_PAYMENT_INCOME_STATEMENT_PATH,
        error: 'missing_income_statement_id',
        message: 'Missing income_statement_id',
        income_statement_id: '',
        shop_count: 0,
        ok_count: 0,
        downloadable_count: 0,
        statements: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeIncomeStatementShop(env, shop, { ...options, income_statement_id: incomeStatementId }))
    const okRows = rows.filter(item => item.ok)
    return {
      status: 'ok',
      mode: 'shopee_payment_income_statement',
      endpoint: SHOPEE_PAYMENT_INCOME_STATEMENT_PATH,
      note: 'Kiem tra trang thai file income statement tu Shopee Payment get_income_statement. Can income_statement_id tra ve tu generate_income_statement.',
      income_statement_id: incomeStatementId,
      shop_count: rows.length,
      ok_count: okRows.length,
      downloadable_count: okRows.filter(item => item.downloadable).length,
      statements: rows
    }
  }
  core.fetchShopeeIncomeStatement = fetchShopeeIncomeStatement

  async function fetchShopeeIncomeReport(env, options = {}) {
    const incomeReportId = cleanIncomeReportId(options.income_report_id ?? options.incomeReportId)
    if (!incomeReportId) {
      return {
        status: 'error',
        mode: 'shopee_payment_income_report',
        endpoint: SHOPEE_PAYMENT_INCOME_REPORT_PATH,
        error: 'missing_income_report_id',
        message: 'Missing income_report_id',
        income_report_id: '',
        shop_count: 0,
        ok_count: 0,
        downloadable_count: 0,
        reports: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeIncomeReportShop(env, shop, { ...options, income_report_id: incomeReportId }))
    const okRows = rows.filter(item => item.ok)
    return {
      status: 'ok',
      mode: 'shopee_payment_income_report',
      endpoint: SHOPEE_PAYMENT_INCOME_REPORT_PATH,
      note: 'Kiem tra trang thai file income report tu Shopee Payment get_income_report. Can income_report_id tra ve tu generate_income_report.',
      income_report_id: incomeReportId,
      shop_count: rows.length,
      ok_count: okRows.length,
      downloadable_count: okRows.filter(item => item.downloadable).length,
      reports: rows
    }
  }
  core.fetchShopeeIncomeReport = fetchShopeeIncomeReport
}
