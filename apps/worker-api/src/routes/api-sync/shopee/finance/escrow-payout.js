export function installApiSyncShopeeFinanceEscrowPayout(core) {
  const SHOPEE_PAYMENT_ESCROW_DETAIL_BATCH_PATH = core.SHOPEE_PAYMENT_ESCROW_DETAIL_BATCH_PATH
  const SHOPEE_PAYMENT_ESCROW_DETAIL_PATH = core.SHOPEE_PAYMENT_ESCROW_DETAIL_PATH
  const SHOPEE_PAYMENT_ESCROW_LIST_PATH = core.SHOPEE_PAYMENT_ESCROW_LIST_PATH
  const SHOPEE_PAYMENT_METHOD_LIST_PATH = core.SHOPEE_PAYMENT_METHOD_LIST_PATH
  const SHOPEE_PAYMENT_PAYOUT_DETAIL_PATH = core.SHOPEE_PAYMENT_PAYOUT_DETAIL_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanEpochSeconds = (...args) => core.cleanEpochSeconds(...args)
  const cleanPayoutInfoRange = (...args) => core.cleanPayoutInfoRange(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const compactFeeDetail = (...args) => core.compactFeeDetail(...args)
  const defaultPaymentFifteenDayRange = (...args) => core.defaultPaymentFifteenDayRange(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const fetchShopeeJsonPost = (...args) => core.fetchShopeeJsonPost(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const parseIdList = (...args) => core.parseIdList(...args)
  const pickFee = (...args) => core.pickFee(...args)
  const pickSignedFee = (...args) => core.pickSignedFee(...args)
  const payoutInfoRangeError = (...args) => core.payoutInfoRangeError(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const saveOrderFeeDetails = (...args) => core.saveOrderFeeDetails(...args)
  const signShopeePublicUrl = (...args) => core.signShopeePublicUrl(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const uniqueTexts = (...args) => core.uniqueTexts(...args)
  const unixToIso = (...args) => core.unixToIso(...args)
  const ymdToBangkokEpoch = (...args) => core.ymdToBangkokEpoch(...args)

  function cleanEscrowReleaseRange(options = {}) {
    const defaults = defaultPaymentFifteenDayRange()
    const dateFrom = cleanYmd(options.date_from || options.dateFrom || options.release_date_from || options.releaseDateFrom) || defaults.date_from
    const dateTo = cleanYmd(options.date_to || options.dateTo || options.release_date_to || options.releaseDateTo) || defaults.date_to
    const releaseTimeFrom = dateFrom
      ? ymdToBangkokEpoch(dateFrom, false)
      : cleanEpochSeconds(options.release_time_from ?? options.releaseTimeFrom)
    const releaseTimeTo = dateTo
      ? ymdToBangkokEpoch(dateTo, true)
      : cleanEpochSeconds(options.release_time_to ?? options.releaseTimeTo)
    return {
      date_from: dateFrom,
      date_to: dateTo,
      release_time_from: releaseTimeFrom,
      release_time_to: releaseTimeTo
    }
  }
  core.cleanEscrowReleaseRange = cleanEscrowReleaseRange

  function escrowReleaseRangeError(range) {
    if (!range.release_time_from || !range.release_time_to) return 'Missing release_time_from or release_time_to'
    if (range.release_time_from > range.release_time_to) return 'release_time_from must be less than or equal to release_time_to'
    if (range.release_time_to - range.release_time_from > 15 * 86400 - 1) {
      return 'Shopee escrow release date range cannot exceed 15 days'
    }
    return ''
  }
  core.escrowReleaseRangeError = escrowReleaseRangeError

  function normalizeShopeeEscrowListRow(item, shop) {
    const releaseTime = Number(item.escrow_release_time || item.release_time || 0) || 0
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      order_sn: cleanText(item.order_sn),
      payout_amount: roundAds(item.payout_amount || item.escrow_amount),
      escrow_release_time: releaseTime,
      escrow_release_at: unixToIso(releaseTime)
    }
  }
  core.normalizeShopeeEscrowListRow = normalizeShopeeEscrowListRow

  function normalizeShopeeEscrowList(data, shop, options = {}) {
    const response = data?.response || data || {}
    const list = Array.isArray(response.escrow_list)
      ? response.escrow_list
      : Array.isArray(data?.escrow_list)
        ? data.escrow_list
        : []
    const rows = list.map(item => normalizeShopeeEscrowListRow(item, shop))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      date_from: cleanText(options.date_from),
      date_to: cleanText(options.date_to),
      release_time_from: cleanEpochSeconds(options.release_time_from),
      release_time_to: cleanEpochSeconds(options.release_time_to),
      release_time_from_at: unixToIso(options.release_time_from),
      release_time_to_at: unixToIso(options.release_time_to),
      page_no: Number(options.page_no || 1),
      page_size: Number(options.page_size || rows.length || 0),
      more: Boolean(response.more || data?.more),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      rows,
      raw_response: response
    }
  }
  core.normalizeShopeeEscrowList = normalizeShopeeEscrowList

  async function fetchShopeeEscrowListShop(env, shop, options = {}) {
    const range = cleanEscrowReleaseRange(options)
    const rangeError = escrowReleaseRangeError(range)
    const pageNo = Math.min(Math.max(Number(options.page_no || options.pageNo || 1) || 1, 1), 10000)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 40) || 40, 1), 100)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      date_from: range.date_from,
      date_to: range.date_to,
      release_time_from: range.release_time_from,
      release_time_to: range.release_time_to,
      page_no: pageNo,
      page_size: pageSize,
      more: false,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    if (rangeError) return { ...resultBase, error: 'invalid_escrow_release_range', message: rangeError }
    if (!shop.api_shop_id) return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_ESCROW_LIST_PATH, shop.access_token, shop.api_shop_id)
      const body = {
        release_time_from: range.release_time_from,
        release_time_to: range.release_time_to,
        page_size: pageSize,
        page_no: pageNo
      }
      const data = await fetchShopeeJsonPost(buildUrl, {}, body)
      return normalizeShopeeEscrowList(data, shop, { ...range, page_no: pageNo, page_size: pageSize })
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_escrow_list_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeEscrowListShop = fetchShopeeEscrowListShop

  async function fetchShopeeEscrowList(env, options = {}) {
    const range = cleanEscrowReleaseRange(options)
    const rangeError = escrowReleaseRangeError(range)
    const pageNo = Math.min(Math.max(Number(options.page_no || options.pageNo || 1) || 1, 1), 10000)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 40) || 40, 1), 100)
    if (rangeError) {
      return {
        status: 'error',
        mode: 'shopee_payment_escrow_list',
        endpoint: SHOPEE_PAYMENT_ESCROW_LIST_PATH,
        error: 'invalid_escrow_release_range',
        message: rangeError,
        date_from: range.date_from,
        date_to: range.date_to,
        page_no: pageNo,
        page_size: pageSize,
        shop_count: 0,
        ok_count: 0,
        total_rows: 0,
        shops: [],
        escrows: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeEscrowListShop(env, shop, { ...options, ...range, page_no: pageNo, page_size: pageSize }))
    const escrows = rows.flatMap(item => item.rows || [])
    return {
      status: 'ok',
      mode: 'shopee_payment_escrow_list',
      endpoint: SHOPEE_PAYMENT_ESCROW_LIST_PATH,
      note: 'Danh sách đơn đã release tiền từ Shopee Payment get_escrow_list. Đây là nguồn đối soát payout theo thời gian release, không lấy từ cost setting.',
      date_from: range.date_from,
      date_to: range.date_to,
      release_time_from: range.release_time_from,
      release_time_to: range.release_time_to,
      page_no: pageNo,
      page_size: pageSize,
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      total_rows: escrows.length,
      more: rows.length === 1 ? Boolean(rows[0]?.more) : false,
      summary: {
        payout_amount: roundAds(escrows.reduce((sum, item) => sum + adsNumber(item.payout_amount), 0))
      },
      shops: rows,
      escrows
    }
  }
  core.fetchShopeeEscrowList = fetchShopeeEscrowList

  function normalizeShopeeEscrowDetailRow(entry, shop) {
    const detail = entry?.escrow_detail || entry || {}
    const income = detail.order_income || {}
    const buyerPayment = detail.buyer_payment_info || income.buyer_payment_info || {}
    const items = Array.isArray(income.items) ? income.items : []
    const orderSn = cleanText(detail.order_sn || entry?.order_sn)
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      order_sn: orderSn,
      ok: !cleanText(entry?.fail_error),
      fail_error: cleanText(entry?.fail_error),
      fail_message: cleanText(entry?.fail_message),
      buyer_user_name: cleanText(detail.buyer_user_name),
      return_order_sn_list: Array.isArray(detail.return_order_sn_list) ? detail.return_order_sn_list.map(cleanText).filter(Boolean) : [],
      payment_method: cleanText(income.buyer_payment_method || buyerPayment.buyer_payment_method),
      escrow_amount: roundAds(income.escrow_amount),
      buyer_total_amount: roundAds(income.buyer_total_amount || buyerPayment.buyer_total_amount),
      commission_fee: roundAds(income.commission_fee),
      service_fee: roundAds(income.service_fee),
      seller_transaction_fee: roundAds(income.seller_transaction_fee || income.credit_card_transaction_fee),
      actual_shipping_fee: roundAds(income.actual_shipping_fee),
      final_shipping_fee: roundAds(income.final_shipping_fee),
      shopee_shipping_rebate: roundAds(income.shopee_shipping_rebate),
      voucher_from_seller: roundAds(income.voucher_from_seller),
      voucher_from_shopee: roundAds(income.voucher_from_shopee),
      seller_discount: roundAds(income.seller_discount || income.order_seller_discount),
      shopee_discount: roundAds(income.shopee_discount || income.original_shopee_discount),
      coins: roundAds(income.coins),
      item_count: items.length,
      sku_list: uniqueTexts(items.flatMap(item => [cleanText(item.item_sku), cleanText(item.model_sku)]).filter(Boolean)).slice(0, 20),
      raw_data: JSON.stringify(detail).slice(0, 12000)
    }
  }
  core.normalizeShopeeEscrowDetailRow = normalizeShopeeEscrowDetailRow

  function normalizeShopeeEscrowDetail(data, shop, orderSnList = []) {
    const response = data?.response || data || {}
    const sourceList = Array.isArray(response)
      ? response
      : Array.isArray(response.escrow_detail_list)
        ? response.escrow_detail_list
        : Array.isArray(data?.escrow_detail_list)
          ? data.escrow_detail_list
          : [response]
    const rows = sourceList.map(item => normalizeShopeeEscrowDetailRow(item, shop))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      order_sn_list: orderSnList,
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      rows,
      raw_response: response
    }
  }
  core.normalizeShopeeEscrowDetail = normalizeShopeeEscrowDetail

  function parseEscrowDetailRaw(row) {
    try {
      return JSON.parse(row?.raw_data || '{}')
    } catch {
      return {}
    }
  }

  function buildShopeeEscrowFeeDetail(row) {
    if (!row?.ok || !cleanText(row.order_sn)) return null
    const raw = parseEscrowDetailRaw(row)
    const income = raw.order_income || raw.escrow_detail?.order_income || raw || {}
    return compactFeeDetail({
      order_id: cleanText(row.order_sn),
      platform: 'shopee',
      shop: cleanText(row.shop),
      source: 'shopee.payment.get_escrow_detail',
      fee_commission: pickFee(income, ['commission_fee', 'fixed_fee', 'seller_commission_fee', 'platform_commission_fee']),
      fee_payment: pickFee(income, ['seller_transaction_fee', 'credit_card_transaction_fee', 'transaction_fee', 'payment_fee', 'seller_payment_fee']),
      fee_service: pickFee(income, ['service_fee', 'seller_service_fee', 'seller_service_charge', 'campaign_service_fee']),
      fee_affiliate: pickFee(income, ['seller_affiliate_commission', 'affiliate_commission', 'affiliate_fee', 'order_ams_commission_fee', 'ams_commission_fee']),
      fee_piship: pickFee(income, ['shipping_seller_protection_fee_amount', 'piship_fee', 'piship_service_fee', 'rsf_seller_protection_fee', 'seller_protection_fee']),
      fee_ads: pickFee(income, ['ads_fee', 'seller_ads_fee', 'marketing_fee']),
      tax_vat: pickFee(income, ['withholding_vat_tax', 'withholding_tax', 'escrow_tax']),
      tax_pit: pickFee(income, ['withholding_pit_tax']),
      settlement: pickSignedFee(income, ['escrow_amount', 'seller_amount', 'seller_income', 'order_income']),
      raw_data: row.raw_data || JSON.stringify(raw).slice(0, 12000)
    })
  }
  core.buildShopeeEscrowFeeDetail = buildShopeeEscrowFeeDetail

  async function fetchShopeeEscrowDetailShop(env, shop, orderSnList = []) {
    const safeOrderSnList = uniqueTexts((orderSnList || []).map(cleanText)).slice(0, 50)
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      order_sn_list: safeOrderSnList,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    if (!safeOrderSnList.length) return { ...resultBase, error: 'missing_order_sn', message: 'Missing order_sn or order_sn_list' }
    if (!shop.api_shop_id) return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      if (safeOrderSnList.length === 1) {
        const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_ESCROW_DETAIL_PATH, shop.access_token, shop.api_shop_id)
        const data = await fetchShopeeJson(buildUrl, { order_sn: safeOrderSnList[0] })
        return normalizeShopeeEscrowDetail(data, shop, safeOrderSnList)
      }
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_ESCROW_DETAIL_BATCH_PATH, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJsonPost(buildUrl, {}, { order_sn_list: safeOrderSnList })
      return normalizeShopeeEscrowDetail(data, shop, safeOrderSnList)
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_escrow_detail_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeeEscrowDetailShop = fetchShopeeEscrowDetailShop

  async function fetchShopeeEscrowDetail(env, options = {}) {
    const orderSnList = parseIdList(options.order_sn_list || options.orderSnList || options.order_sn || options.orderSn).slice(0, 50)
    const shouldSaveDetails = ['1', 'true', 'yes'].includes(cleanText(options.save_details ?? options.saveDetails).toLowerCase())
    if (!orderSnList.length) {
      return {
        status: 'error',
        mode: 'shopee_payment_escrow_detail',
        endpoint: SHOPEE_PAYMENT_ESCROW_DETAIL_BATCH_PATH,
        error: 'missing_order_sn',
        message: 'Missing order_sn or order_sn_list',
        shop_count: 0,
        ok_count: 0,
        total_rows: 0,
        shops: [],
        details: []
      }
    }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 1) || 1, 1), 50)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) rows.push(await fetchShopeeEscrowDetailShop(env, shop, orderSnList))
    const details = rows.flatMap(item => item.rows || [])
    let savedFeeDetails = 0
    if (shouldSaveDetails) {
      const feeDetails = details.map(buildShopeeEscrowFeeDetail).filter(Boolean)
      savedFeeDetails = await saveOrderFeeDetails(env, feeDetails)
    }
    return {
      status: 'ok',
      mode: 'shopee_payment_escrow_detail',
      endpoint: orderSnList.length === 1 ? SHOPEE_PAYMENT_ESCROW_DETAIL_PATH : SHOPEE_PAYMENT_ESCROW_DETAIL_BATCH_PATH,
      note: 'Chi tiet escrow tu Shopee Payment get_escrow_detail/get_escrow_detail_batch, dung de doi soat phi, tien thuc nhan va SKU theo tung don.',
      order_sn_list: orderSnList,
      save_details: shouldSaveDetails,
      saved_fee_details: savedFeeDetails,
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      total_rows: details.length,
      summary: {
        escrow_amount: roundAds(details.reduce((sum, item) => sum + adsNumber(item.escrow_amount), 0)),
        commission_fee: roundAds(details.reduce((sum, item) => sum + adsNumber(item.commission_fee), 0)),
        service_fee: roundAds(details.reduce((sum, item) => sum + adsNumber(item.service_fee), 0)),
        seller_transaction_fee: roundAds(details.reduce((sum, item) => sum + adsNumber(item.seller_transaction_fee), 0))
      },
      shops: rows,
      details
    }
  }
  core.fetchShopeeEscrowDetail = fetchShopeeEscrowDetail

  function normalizeShopeePaymentMethodList(data) {
    const response = Array.isArray(data?.response)
      ? data.response
      : Array.isArray(data?.payment_method_list)
        ? data.payment_method_list
        : []
    return response.map(row => ({
      region: cleanText(row.region),
      payment_method: Array.isArray(row.payment_method) ? row.payment_method.map(cleanText).filter(Boolean) : []
    }))
  }
  core.normalizeShopeePaymentMethodList = normalizeShopeePaymentMethodList

  async function fetchShopeePaymentMethodList(env, options = {}) {
    try {
      const shops = await getApiShops(env, 'shopee', options.shop, 1)
      const app = getShopeeAppFromRow(env, shops[0] || {}, shops[0]?.api_partner_id || options.shop || '')
      const buildUrl = signShopeePublicUrl(app, SHOPEE_PAYMENT_METHOD_LIST_PATH)
      const data = await fetchShopeeJson(buildUrl, {})
      const regions = normalizeShopeePaymentMethodList(data)
      return {
        status: 'ok',
        mode: 'shopee_payment_method_list',
        endpoint: SHOPEE_PAYMENT_METHOD_LIST_PATH,
        note: 'Danh sach phuong thuc thanh toan public cua Shopee Payment, dung de doi chieu payment_method trong income/escrow.',
        request_id: cleanText(data?.request_id),
        total_regions: regions.length,
        total_methods: regions.reduce((sum, row) => sum + row.payment_method.length, 0),
        regions
      }
    } catch (error) {
      return {
        status: 'error',
        mode: 'shopee_payment_method_list',
        endpoint: SHOPEE_PAYMENT_METHOD_LIST_PATH,
        error: 'shopee_payment_method_list_failed',
        message: error?.message || String(error),
        regions: []
      }
    }
  }
  core.fetchShopeePaymentMethodList = fetchShopeePaymentMethodList

  function normalizeShopeePayoutDetailRow(item, shop) {
    const payoutInfo = item?.payout_info || item || {}
    const escrowList = Array.isArray(item?.escrow_list) ? item.escrow_list : []
    const offlineAdjustments = Array.isArray(item?.offline_adjustment_list) ? item.offline_adjustment_list : []
    const payoutTime = Number(payoutInfo.payout_time || 0) || 0
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      from_currency: cleanText(payoutInfo.from_currency),
      payout_currency: cleanText(payoutInfo.payout_currency),
      from_amount: roundAds(payoutInfo.from_amount),
      payout_amount: roundAds(payoutInfo.payout_amount),
      exchange_rate: cleanText(payoutInfo.exchange_rate),
      payout_time: payoutTime,
      payout_at: unixToIso(payoutTime),
      pay_service: cleanText(payoutInfo.pay_service),
      payee_id: cleanText(payoutInfo.payee_id),
      escrow_count: escrowList.length,
      escrow_amount: roundAds(escrowList.reduce((sum, row) => sum + adsNumber(row.escrow_amount), 0)),
      offline_adjustment_count: offlineAdjustments.length,
      offline_adjustment_amount: roundAds(offlineAdjustments.reduce((sum, row) => sum + adsNumber(row.adjustment_amount), 0)),
      raw_data: JSON.stringify(item).slice(0, 12000)
    }
  }
  core.normalizeShopeePayoutDetailRow = normalizeShopeePayoutDetailRow

  function normalizeShopeePayoutDetail(data, shop, options = {}) {
    const response = data?.response || data || {}
    const list = Array.isArray(response.payout_list)
      ? response.payout_list
      : Array.isArray(data?.payout_list)
        ? data.payout_list
        : []
    const rows = list.map(item => normalizeShopeePayoutDetailRow(item, shop))
    return {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      platform: 'shopee',
      ok: true,
      date_from: cleanText(options.date_from),
      date_to: cleanText(options.date_to),
      payout_time_from: cleanEpochSeconds(options.payout_time_from),
      payout_time_to: cleanEpochSeconds(options.payout_time_to),
      page_no: Number(options.page_no || 1),
      page_size: Number(options.page_size || rows.length || 0),
      more: Boolean(response.more || data?.more),
      total_rows: rows.length,
      request_id: cleanText(data?.request_id),
      error: '',
      message: cleanText(data?.message || data?.msg),
      rows,
      raw_response: response
    }
  }
  core.normalizeShopeePayoutDetail = normalizeShopeePayoutDetail

  async function fetchShopeePayoutDetailShop(env, shop, options = {}) {
    const range = cleanPayoutInfoRange(options)
    const rangeError = payoutInfoRangeError(range)
    const pageNo = Math.min(Math.max(Number(options.page_no || options.pageNo || 1) || 1, 1), 10000)
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
      page_no: pageNo,
      page_size: pageSize,
      more: false,
      total_rows: 0,
      request_id: '',
      error: '',
      message: '',
      rows: []
    }
    if (rangeError) return { ...resultBase, error: 'invalid_payout_detail_range', message: rangeError }
    if (!shop.api_shop_id) return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, SHOPEE_PAYMENT_PAYOUT_DETAIL_PATH, shop.access_token, shop.api_shop_id)
      const body = {
        payout_time_from: range.payout_time_from,
        payout_time_to: range.payout_time_to,
        page_size: pageSize,
        page_no: pageNo
      }
      const data = await fetchShopeeJsonPost(buildUrl, {}, body)
      return normalizeShopeePayoutDetail(data, shop, { ...range, page_no: pageNo, page_size: pageSize })
    } catch (error) {
      return {
        ...resultBase,
        error: 'shopee_payout_detail_failed',
        message: error?.message || String(error)
      }
    }
  }
  core.fetchShopeePayoutDetailShop = fetchShopeePayoutDetailShop

  async function fetchShopeePayoutDetail(env, options = {}) {
    const range = cleanPayoutInfoRange(options)
    const rangeError = payoutInfoRangeError(range)
    const pageNo = Math.min(Math.max(Number(options.page_no || options.pageNo || 1) || 1, 1), 10000)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 10) || 10, 1), 100)
    if (rangeError) {
      return {
        status: 'error',
        mode: 'shopee_payment_payout_detail',
        endpoint: SHOPEE_PAYMENT_PAYOUT_DETAIL_PATH,
        error: 'invalid_payout_detail_range',
        message: rangeError,
        date_from: range.date_from,
        date_to: range.date_to,
        page_no: pageNo,
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
    for (const shop of shops) rows.push(await fetchShopeePayoutDetailShop(env, shop, { ...options, ...range, page_no: pageNo, page_size: pageSize }))
    const payouts = rows.flatMap(item => item.rows || [])
    return {
      status: 'ok',
      mode: 'shopee_payment_payout_detail',
      endpoint: SHOPEE_PAYMENT_PAYOUT_DETAIL_PATH,
      note: 'Payout detail Cross Border tu Shopee Payment get_payout_detail, gom payout, escrow_list va offline_adjustment_list theo ky payout.',
      date_from: range.date_from,
      date_to: range.date_to,
      payout_time_from: range.payout_time_from,
      payout_time_to: range.payout_time_to,
      page_no: pageNo,
      page_size: pageSize,
      shop_count: rows.length,
      ok_count: rows.filter(item => item.ok).length,
      total_rows: payouts.length,
      more: rows.length === 1 ? Boolean(rows[0]?.more) : false,
      summary: {
        payout_amount: roundAds(payouts.reduce((sum, item) => sum + adsNumber(item.payout_amount), 0)),
        escrow_amount: roundAds(payouts.reduce((sum, item) => sum + adsNumber(item.escrow_amount), 0)),
        offline_adjustment_amount: roundAds(payouts.reduce((sum, item) => sum + adsNumber(item.offline_adjustment_amount), 0))
      },
      shops: rows,
      payouts
    }
  }
  core.fetchShopeePayoutDetail = fetchShopeePayoutDetail
}
