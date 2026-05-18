import {
  fetchLazadaAccountTransactions,
  fetchLazadaFinanceTransactions,
  fetchLazadaPayoutStatus,
  fetchShopeeBillingTransactionInfo,
  fetchShopeeEscrowDetail,
  fetchShopeeEscrowList,
  fetchShopeeIncomeDetail,
  fetchShopeeIncomeOverview,
  fetchShopeeIncomeReport,
  fetchShopeeIncomeStatement,
  fetchShopeePaymentMethodList,
  fetchShopeePayoutDetail,
  fetchShopeePayoutInfo,
  fetchShopeeWalletTransactionList,
  generateShopeeIncomeReport,
  generateShopeeIncomeStatement,
  syncLazadaFinanceTransactions
} from '../api/index.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function intBetween(value, min, max, fallback) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function escrowNumberExpr(path) {
  return `COALESCE(ABS(CAST(CASE WHEN json_valid(f.raw_data) THEN json_extract(f.raw_data, '${path}') ELSE 0 END AS REAL)), 0)`
}

async function listShopeeEscrowFeeDiscounts(env, options = {}) {
  const pageSize = intBetween(options.page_size || options.pageSize || options.limit, 10, 200, 50)
  const pageNo = intBetween(options.page_no || options.pageNo || options.page, 1, 10000, 1)
  const filter = cleanText(options.filter || options.adjustment_filter || options.adjustmentFilter || 'has_any')
  const shop = cleanText(options.shop)
  const search = cleanText(options.search)
  const dateFrom = cleanText(options.date_from || options.dateFrom || options.from)
  const dateTo = cleanText(options.date_to || options.dateTo || options.to)
  const offset = (pageNo - 1) * pageSize

  const baseSql = `
    SELECT
      f.order_id,
      COALESCE(NULLIF(f.shop, ''), NULLIF(o.shop, ''), '') AS shop,
      COALESCE(NULLIF(o.order_date, ''), NULLIF(f.updated_at, ''), '') AS order_date,
      COALESCE(o.revenue, ${escrowNumberExpr('$.order_income.buyer_total_amount')}, 0) AS revenue,
      COALESCE(f.total_fees, 0) AS total_fees,
      COALESCE(f.fee_affiliate, 0) AS fee_affiliate,
      COALESCE(f.settlement, ${escrowNumberExpr('$.order_income.escrow_amount')}, 0) AS settlement,
      ${escrowNumberExpr('$.order_income.voucher_from_seller')} AS voucher_from_seller,
      ${escrowNumberExpr('$.order_income.seller_discount')} AS seller_discount,
      ${escrowNumberExpr('$.order_income.voucher_from_shopee')} AS voucher_from_shopee,
      ${escrowNumberExpr('$.order_income.shopee_discount')} AS shopee_discount,
      ${escrowNumberExpr('$.order_income.coins')} AS coins,
      ${escrowNumberExpr('$.buyer_payment_info.shopee_voucher')} AS buyer_shopee_voucher,
      ${escrowNumberExpr('$.buyer_payment_info.shopee_coins_redeemed')} AS buyer_shopee_coins,
      COALESCE(CASE WHEN json_valid(f.raw_data) THEN json_extract(f.raw_data, '$.buyer_user_name') ELSE '' END, '') AS buyer_user_name,
      COALESCE(f.updated_at, '') AS updated_at
    FROM order_fee_details f
    LEFT JOIN orders_v2 o ON o.order_id = f.order_id
    WHERE LOWER(COALESCE(f.platform, '')) = 'shopee'
      AND COALESCE(f.source, '') = 'shopee.payment.get_escrow_detail'
  `

  const conds = ['1=1']
  const params = []
  if (shop) {
    conds.push(`LOWER(TRIM(shop)) = LOWER(TRIM(?))`)
    params.push(shop)
  }
  if (dateFrom) {
    conds.push(`date(order_date) >= ?`)
    params.push(dateFrom)
  }
  if (dateTo) {
    conds.push(`date(order_date) <= ?`)
    params.push(dateTo)
  }
  if (search) {
    conds.push(`(order_id LIKE ? OR shop LIKE ? OR buyer_user_name LIKE ?)`)
    const q = `%${search}%`
    params.push(q, q, q)
  }

  const filterMap = {
    has_affiliate: `fee_affiliate > 0`,
    has_voucher_shopee: `voucher_from_shopee > 0`,
    has_shopee_discount: `shopee_discount > 0`,
    has_coins: `coins > 0`,
    has_shopee_support: `(voucher_from_shopee + shopee_discount + coins) > 0`,
    has_any: `(fee_affiliate > 0 OR voucher_from_shopee > 0 OR shopee_discount > 0 OR coins > 0)`,
    all: `1=1`
  }
  conds.push(filterMap[filter] || filterMap.has_any)

  const where = conds.join(' AND ')
  const wrapped = `SELECT * FROM (${baseSql}) x WHERE ${where}`
  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS row_count,
      SUM(COALESCE(fee_affiliate, 0)) AS fee_affiliate,
      SUM(COALESCE(voucher_from_seller, 0) + COALESCE(seller_discount, 0)) AS voucher_shop,
      SUM(COALESCE(voucher_from_shopee, 0)) AS voucher_from_shopee,
      SUM(COALESCE(shopee_discount, 0)) AS shopee_discount,
      SUM(COALESCE(coins, 0)) AS coins,
      SUM(COALESCE(settlement, 0)) AS settlement,
      SUM(COALESCE(revenue, 0)) AS revenue,
      SUM(CASE WHEN COALESCE(fee_affiliate, 0) > 0 THEN 1 ELSE 0 END) AS affiliate_orders,
      SUM(CASE WHEN COALESCE(voucher_from_shopee, 0) > 0 THEN 1 ELSE 0 END) AS shopee_voucher_orders,
      SUM(CASE WHEN COALESCE(shopee_discount, 0) > 0 THEN 1 ELSE 0 END) AS shopee_discount_orders,
      SUM(CASE WHEN COALESCE(coins, 0) > 0 THEN 1 ELSE 0 END) AS coins_orders
    FROM (${wrapped}) s
  `).bind(...params).first()

  const { results } = await env.DB.prepare(`
    ${wrapped}
    ORDER BY datetime(COALESCE(order_date, updated_at, '1970-01-01 00:00:00')) DESC, order_id DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pageSize, offset).all()

  const rows = (results || []).map(row => ({
    ...row,
    voucher_shop: Number(row.voucher_from_seller || 0) + Number(row.seller_discount || 0),
    shopee_support_total: Number(row.voucher_from_shopee || 0) + Number(row.shopee_discount || 0) + Number(row.coins || 0)
  }))

  return {
    status: 'ok',
    mode: 'shopee_escrow_fee_discounts',
    source: 'order_fee_details.raw_data + order_fee_details.fee_affiliate',
    filter,
    page_no: pageNo,
    page_size: pageSize,
    total: Number(summary?.row_count || 0),
    total_pages: Math.max(1, Math.ceil(Number(summary?.row_count || 0) / pageSize)),
    summary: {
      row_count: Number(summary?.row_count || 0),
      fee_affiliate: Number(summary?.fee_affiliate || 0),
      voucher_shop: Number(summary?.voucher_shop || 0),
      voucher_from_shopee: Number(summary?.voucher_from_shopee || 0),
      shopee_discount: Number(summary?.shopee_discount || 0),
      coins: Number(summary?.coins || 0),
      shopee_support_total: Number(summary?.voucher_from_shopee || 0) + Number(summary?.shopee_discount || 0) + Number(summary?.coins || 0),
      settlement: Number(summary?.settlement || 0),
      revenue: Number(summary?.revenue || 0),
      affiliate_orders: Number(summary?.affiliate_orders || 0),
      shopee_voucher_orders: Number(summary?.shopee_voucher_orders || 0),
      shopee_discount_orders: Number(summary?.shopee_discount_orders || 0),
      coins_orders: Number(summary?.coins_orders || 0)
    },
    rows
  }
}

export async function handleIncome(request, env, cors) {
  const url = new URL(request.url)

  if (url.pathname === '/api/income/shopee/overview' || url.pathname === '/api/income/shopee/payment-overview') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeIncomeOverview(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      income_status: body.income_status ?? body.incomeStatus ?? url.searchParams.get('income_status')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/income/shopee/detail' || url.pathname === '/api/income/shopee/payment-detail') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeIncomeDetail(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      income_status: body.income_status ?? body.incomeStatus ?? url.searchParams.get('income_status'),
      date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
      date_to: body.date_to || body.dateTo || url.searchParams.get('date_to'),
      cursor: body.cursor ?? url.searchParams.get('cursor'),
      page_size: body.page_size || body.pageSize || url.searchParams.get('page_size')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/income/shopee/billing-transactions' || url.pathname === '/api/income/shopee/billing-transaction-info') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeBillingTransactionInfo(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      billing_transaction_info_type: body.billing_transaction_info_type ?? body.billingTransactionInfoType ?? url.searchParams.get('billing_transaction_info_type'),
      encrypted_payout_ids: body.encrypted_payout_ids ?? body.encryptedPayoutIds ?? url.searchParams.get('encrypted_payout_ids'),
      cursor: body.cursor ?? url.searchParams.get('cursor'),
      page_size: body.page_size || body.pageSize || url.searchParams.get('page_size')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/income/shopee/payout-info' || url.pathname === '/api/income/shopee/payouts') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeePayoutInfo(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
      date_to: body.date_to || body.dateTo || url.searchParams.get('date_to'),
      payout_time_from: body.payout_time_from || body.payoutTimeFrom || url.searchParams.get('payout_time_from'),
      payout_time_to: body.payout_time_to || body.payoutTimeTo || url.searchParams.get('payout_time_to'),
      cursor: body.cursor ?? url.searchParams.get('cursor'),
      page_size: body.page_size || body.pageSize || url.searchParams.get('page_size')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/payout-detail' || url.pathname === '/api/income/shopee/payout-details') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeePayoutDetail(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
      date_to: body.date_to || body.dateTo || url.searchParams.get('date_to'),
      payout_time_from: body.payout_time_from || body.payoutTimeFrom || url.searchParams.get('payout_time_from'),
      payout_time_to: body.payout_time_to || body.payoutTimeTo || url.searchParams.get('payout_time_to'),
      page_no: body.page_no ?? body.pageNo ?? url.searchParams.get('page_no'),
      page_size: body.page_size || body.pageSize || url.searchParams.get('page_size')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/escrow-list' || url.pathname === '/api/income/shopee/escrows') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeEscrowList(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
      date_to: body.date_to || body.dateTo || url.searchParams.get('date_to'),
      release_time_from: body.release_time_from || body.releaseTimeFrom || url.searchParams.get('release_time_from'),
      release_time_to: body.release_time_to || body.releaseTimeTo || url.searchParams.get('release_time_to'),
      page_no: body.page_no ?? body.pageNo ?? url.searchParams.get('page_no'),
      page_size: body.page_size || body.pageSize || url.searchParams.get('page_size')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/escrow-detail' || url.pathname === '/api/income/shopee/escrow-details') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeEscrowDetail(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      order_sn: body.order_sn || body.orderSn || url.searchParams.get('order_sn'),
      order_sn_list: body.order_sn_list || body.orderSnList || url.searchParams.get('order_sn_list')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/fee-discounts' || url.pathname === '/api/income/shopee/escrow-fee-discounts') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await listShopeeEscrowFeeDiscounts(env, {
      shop: body.shop || url.searchParams.get('shop'),
      date_from: body.date_from || body.dateFrom || body.from || url.searchParams.get('date_from') || url.searchParams.get('from'),
      date_to: body.date_to || body.dateTo || body.to || url.searchParams.get('date_to') || url.searchParams.get('to'),
      search: body.search || url.searchParams.get('search'),
      filter: body.filter || body.adjustment_filter || body.adjustmentFilter || url.searchParams.get('filter') || url.searchParams.get('adjustment_filter'),
      page_no: body.page_no || body.pageNo || body.page || url.searchParams.get('page_no') || url.searchParams.get('page'),
      page_size: body.page_size || body.pageSize || body.limit || url.searchParams.get('page_size') || url.searchParams.get('limit')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/income/shopee/payment-methods' || url.pathname === '/api/income/shopee/payment-method-list') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeePaymentMethodList(env, {
      shop: body.shop || url.searchParams.get('shop')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/wallet-transactions' || url.pathname === '/api/income/shopee/wallet-transaction-list') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeWalletTransactionList(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      page_no: body.page_no ?? body.pageNo ?? url.searchParams.get('page_no'),
      page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
      date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
      date_to: body.date_to || body.dateTo || url.searchParams.get('date_to'),
      create_time_from: body.create_time_from || body.createTimeFrom || url.searchParams.get('create_time_from'),
      create_time_to: body.create_time_to || body.createTimeTo || url.searchParams.get('create_time_to'),
      wallet_type: body.wallet_type || body.walletType || url.searchParams.get('wallet_type'),
      transaction_type: body.transaction_type || body.transactionType || url.searchParams.get('transaction_type'),
      money_flow: body.money_flow || body.moneyFlow || url.searchParams.get('money_flow'),
      transaction_tab_type: body.transaction_tab_type || body.transactionTabType || url.searchParams.get('transaction_tab_type')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/statement' || url.pathname === '/api/income/shopee/income-statement') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeIncomeStatement(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      income_statement_id: body.income_statement_id || body.incomeStatementId || url.searchParams.get('income_statement_id')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/generate-report' || url.pathname === '/api/income/shopee/income-report/generate') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await generateShopeeIncomeReport(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      release_time_from: body.release_time_from || body.releaseTimeFrom || url.searchParams.get('release_time_from'),
      release_time_to: body.release_time_to || body.releaseTimeTo || url.searchParams.get('release_time_to'),
      date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
      date_to: body.date_to || body.dateTo || url.searchParams.get('date_to')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/report' || url.pathname === '/api/income/shopee/income-report') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchShopeeIncomeReport(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      income_report_id: body.income_report_id || body.incomeReportId || url.searchParams.get('income_report_id')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/shopee/generate-statement' || url.pathname === '/api/income/shopee/income-statement/generate') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await generateShopeeIncomeStatement(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      release_time_from: body.release_time_from || body.releaseTimeFrom || url.searchParams.get('release_time_from'),
      release_time_to: body.release_time_to || body.releaseTimeTo || url.searchParams.get('release_time_to'),
      date_from: body.date_from || body.dateFrom || url.searchParams.get('date_from'),
      date_to: body.date_to || body.dateTo || url.searchParams.get('date_to'),
      statement_type: body.statement_type || body.statementType || url.searchParams.get('statement_type')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/lazada/transactions' || url.pathname === '/api/income/lazada/finance-transactions' || url.pathname === '/api/income/lazada/transactions/sync') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const syncRequested = url.pathname.endsWith('/sync') || request.method === 'POST' || ['1', 'true', 'yes'].includes(String(body.sync ?? url.searchParams.get('sync') ?? '').toLowerCase())
    const options = {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      date_from: body.date_from || body.dateFrom || body.from || url.searchParams.get('date_from') || url.searchParams.get('from'),
      date_to: body.date_to || body.dateTo || body.to || url.searchParams.get('date_to') || url.searchParams.get('to'),
      page_size: body.page_size || body.pageSize || body.limit || url.searchParams.get('page_size') || url.searchParams.get('limit'),
      offset: body.offset ?? url.searchParams.get('offset'),
      max_pages: body.max_pages || body.maxPages || url.searchParams.get('max_pages'),
      fee_type: body.fee_type || body.feeType || body.trans_type || body.transType || url.searchParams.get('fee_type') || url.searchParams.get('trans_type')
    }
    const result = syncRequested
      ? await syncLazadaFinanceTransactions(env, options)
      : await fetchLazadaFinanceTransactions(env, options)
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/lazada/payout-status' || url.pathname === '/api/income/lazada/payouts') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchLazadaPayoutStatus(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      date_from: body.date_from || body.dateFrom || body.from || url.searchParams.get('date_from') || url.searchParams.get('from'),
      date_to: body.date_to || body.dateTo || body.to || url.searchParams.get('date_to') || url.searchParams.get('to')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/income/lazada/account-transactions' || url.pathname === '/api/income/lazada/account-transaction-list') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await fetchLazadaAccountTransactions(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      date_from: body.date_from || body.dateFrom || body.from || url.searchParams.get('date_from') || url.searchParams.get('from'),
      date_to: body.date_to || body.dateTo || body.to || url.searchParams.get('date_to') || url.searchParams.get('to'),
      page_size: body.page_size || body.pageSize || body.limit || url.searchParams.get('page_size') || url.searchParams.get('limit'),
      page_num: body.page_num || body.pageNum || url.searchParams.get('page_num'),
      max_pages: body.max_pages || body.maxPages || url.searchParams.get('max_pages'),
      transaction_type: body.transaction_type || body.transactionType || url.searchParams.get('transaction_type'),
      sub_transaction_type: body.sub_transaction_type || body.subTransactionType || url.searchParams.get('sub_transaction_type'),
      transaction_number: body.transaction_number || body.transactionNumber || url.searchParams.get('transaction_number')
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  return json({ error: 'Income endpoint not found' }, cors, 404)
}
