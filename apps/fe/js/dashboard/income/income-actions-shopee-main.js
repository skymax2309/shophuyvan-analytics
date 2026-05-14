function renderIncomeSource(data = {}) {
  const box = incomeEl('incomeSourceNotice')
  if (!box) return
  box.innerHTML = `
    <div class="income-source-line ${data.ok_count ? 'ok' : 'empty'}">
      <b>${data.ok_count ? 'Đang dùng dữ liệu Shopee Payment API realtime' : 'Chưa lấy được dữ liệu payment realtime'}</b>
      <span><b>Số dư hiện tại:</b> /api/v2/payment/get_income_overview</span>
      <span><b>Chi tiết thu nhập theo đơn:</b> /api/v2/payment/get_income_detail</span>
      <span><b>Escrow release theo đơn:</b> /api/v2/payment/get_escrow_list</span>
      <span><b>Chi tiết phí theo đơn:</b> /api/v2/payment/get_escrow_detail · /api/v2/payment/get_escrow_detail_batch</span>
      <span><b>Lọc TTLK / giảm Shopee:</b> order_fee_details.fee_affiliate và raw escrow voucher_from_shopee / shopee_discount / coins đã lưu trong D1</span>
      <span><b>Phương thức thanh toán:</b> /api/v2/payment/get_payment_method_list</span>
      <span><b>Giao dịch ví shop local:</b> /api/v2/payment/get_wallet_transaction_list</span>
      <span><b>Payout Cross Border:</b> /api/v2/payment/get_payout_info</span>
      <span><b>Payout detail Cross Border:</b> /api/v2/payment/get_payout_detail</span>
      <span><b>Billing Cross Border:</b> /api/v2/payment/get_billing_transaction_info</span>
      <span><b>Lazada Finance:</b> /finance/transaction/details/get · /finance/transaction/accountTransactions/query · /finance/payout/status/get</span>
      <span><b>Tạo/kiểm tra file report:</b> /api/v2/payment/generate_income_report · /api/v2/payment/get_income_report</span>
      <span><b>Tạo/kiểm tra file statement:</b> /api/v2/payment/generate_income_statement · /api/v2/payment/get_income_statement</span>
      <span>${incomeEscape(data.note || 'Overview là snapshot hiện tại, không phải lịch sử từng ngày. Detail, escrow và wallet dùng để đối soát shop local. Payout/Billing/Payout detail là nhóm Cross Border nên shop local có thể trả rỗng hoặc báo không áp dụng.')}</span>
      <span class="income-source-missing"><b>Không dùng cho doanh thu seller:</b> các endpoint Lazada Wallet Corporate Top-up và LazPay service không phải nguồn số dư doanh thu seller nên chỉ ghi chú, không kéo vào báo cáo tài chính.</span>
    </div>
  `
}

window.loadIncomeOverview = async function() {
  const btn = incomeEl('incomeRefreshBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/overview?${incomeQuery()}`)
    incomeState.data = data
    populateIncomeShopOptions(data.shops || [])
    renderIncomeKpis(data.summary || {}, data)
    renderIncomeShops(data.shops || [])
    renderIncomeSource(data)
    incomeState.loaded = true
  } catch (error) {
    const box = incomeEl('incomeKpiGrid')
    if (box) box.innerHTML = `<div class="income-error">Không tải được số dư doanh thu: ${incomeEscape(error.message)}</div>`
    renderIncomeShops([])
    renderIncomeSource({ ok_count: 0, endpoint: '/api/v2/payment/get_income_overview', note: error.message })
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Làm mới'
    }
  }
}

window.loadIncomeDetail = async function(reset = true) {
  const btn = incomeEl('incomeDetailLoadBtn')
  const moreBtn = incomeEl('incomeDetailMoreBtn')
  const oldText = btn?.textContent || ''
  const cursor = reset ? '' : incomeState.detailCursor
  if (!reset && !cursor) return
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  if (moreBtn) moreBtn.disabled = true
  try {
    const data = await incomeFetch(`/api/income/shopee/detail?${incomeDetailQuery(cursor)}`)
    renderIncomeDetailRows(data, !reset)
  } catch (error) {
    incomeState.detailRows = []
    incomeState.detailCursor = ''
    const tbody = incomeEl('incomeDetailTable')
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="income-detail-empty income-detail-error">Không tải được chi tiết thu nhập: ${incomeEscape(error.message)}</td></tr>`
    const summary = incomeEl('incomeDetailSummary')
    if (summary) summary.textContent = 'Lỗi tải chi tiết'
    if (moreBtn) moreBtn.hidden = true
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải chi tiết'
    }
    if (moreBtn) moreBtn.disabled = false
  }
}

window.loadIncomeBilling = async function(reset = true) {
  const btn = incomeEl('incomeBillingLoadBtn')
  const moreBtn = incomeEl('incomeBillingMoreBtn')
  const oldText = btn?.textContent || ''
  const cursor = reset ? '' : incomeState.billingCursor
  if (!reset && !cursor) return
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  if (moreBtn) moreBtn.disabled = true
  try {
    const data = await incomeFetch(`/api/income/shopee/billing-transactions?${incomeBillingQuery(cursor)}`)
    renderIncomeBillingRows(data, !reset)
  } catch (error) {
    incomeState.billingRows = []
    incomeState.billingCursor = ''
    const tbody = incomeEl('incomeBillingTable')
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="income-detail-empty income-detail-error">Không tải được billing transaction: ${incomeEscape(error.message)}</td></tr>`
    const summary = incomeEl('incomeBillingSummary')
    if (summary) summary.textContent = 'Lỗi tải billing'
    if (moreBtn) moreBtn.hidden = true
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải billing'
    }
    if (moreBtn) moreBtn.disabled = false
  }
}

window.loadIncomePayout = async function(reset = true) {
  incomeInitPayoutDates()
  const btn = incomeEl('incomePayoutLoadBtn')
  const moreBtn = incomeEl('incomePayoutMoreBtn')
  const oldText = btn?.textContent || ''
  const cursor = reset ? '' : incomeState.payoutCursor
  const dateFrom = incomeEl('incomePayoutFrom')?.value || ''
  const dateTo = incomeEl('incomePayoutTo')?.value || ''
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    incomeState.payoutRows = []
    incomeState.payoutCursor = ''
    const tbody = incomeEl('incomePayoutTable')
    const summary = incomeEl('incomePayoutSummary')
    if (summary) summary.textContent = 'Khoảng ngày không hợp lệ'
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="income-detail-empty income-detail-error">Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.</td></tr>'
    if (moreBtn) moreBtn.hidden = true
    return
  }
  if (!reset && !cursor) return
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  if (moreBtn) moreBtn.disabled = true
  try {
    const data = await incomeFetch(`/api/income/shopee/payout-info?${incomePayoutQuery(cursor)}`)
    renderIncomePayoutRows(data, !reset)
  } catch (error) {
    incomeState.payoutRows = []
    incomeState.payoutCursor = ''
    const tbody = incomeEl('incomePayoutTable')
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="income-detail-empty income-detail-error">Không tải được payout CB: ${incomeEscape(error.message)}</td></tr>`
    const summary = incomeEl('incomePayoutSummary')
    if (summary) summary.textContent = 'Lỗi tải payout'
    if (moreBtn) moreBtn.hidden = true
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải payout'
    }
    if (moreBtn) moreBtn.disabled = false
  }
}

window.loadIncomePayoutDetail = async function() {
  incomeInitPayoutDates()
  const btn = incomeEl('incomePayoutDetailLoadBtn')
  const oldText = btn?.textContent || ''
  const dateFrom = incomeEl('incomePayoutFrom')?.value || ''
  const dateTo = incomeEl('incomePayoutTo')?.value || ''
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    const tbody = incomeEl('incomePayoutTable')
    const summary = incomeEl('incomePayoutSummary')
    if (summary) summary.textContent = 'Khoảng ngày không hợp lệ'
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="income-detail-empty income-detail-error">Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.</td></tr>'
    return
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const qs = new URLSearchParams(incomePayoutQuery(''))
    qs.set('page_no', '1')
    const data = await incomeFetch(`/api/income/shopee/payout-detail?${qs}`)
    renderIncomePayoutRows(data, false)
  } catch (error) {
    incomeState.payoutRows = []
    const tbody = incomeEl('incomePayoutTable')
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="income-detail-empty income-detail-error">Không tải được payout detail CB: ${incomeEscape(error.message)}</td></tr>`
    const summary = incomeEl('incomePayoutSummary')
    if (summary) summary.textContent = 'Lỗi tải payout detail'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải payout detail'
    }
  }
}

window.loadIncomeWallet = async function(reset = true) {
  incomeInitWalletDates()
  const btn = incomeEl('incomeWalletLoadBtn')
  const moreBtn = incomeEl('incomeWalletMoreBtn')
  const oldText = btn?.textContent || ''
  const dateFrom = incomeEl('incomeWalletFrom')?.value || ''
  const dateTo = incomeEl('incomeWalletTo')?.value || ''
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    incomeState.walletRows = []
    incomeState.walletMore = false
    const tbody = incomeEl('incomeWalletTable')
    const summary = incomeEl('incomeWalletSummary')
    if (summary) summary.textContent = 'Khoảng ngày không hợp lệ'
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="income-detail-empty income-detail-error">Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.</td></tr>'
    if (moreBtn) moreBtn.hidden = true
    return
  }
  const nextPage = reset ? 1 : incomeState.walletPageNo + 1
  if (!reset && !incomeState.walletMore) return
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  if (moreBtn) moreBtn.disabled = true
  try {
    const data = await incomeFetch(`/api/income/shopee/wallet-transactions?${incomeWalletQuery(nextPage)}`)
    renderIncomeWalletRows(data, !reset)
  } catch (error) {
    incomeState.walletRows = []
    incomeState.walletMore = false
    const tbody = incomeEl('incomeWalletTable')
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="income-detail-empty income-detail-error">Không tải được giao dịch ví: ${incomeEscape(error.message)}</td></tr>`
    const summary = incomeEl('incomeWalletSummary')
    if (summary) summary.textContent = 'Lỗi tải giao dịch ví'
    if (moreBtn) moreBtn.hidden = true
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải giao dịch ví'
    }
    if (moreBtn) moreBtn.disabled = false
  }
}
