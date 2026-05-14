window.loadIncomeLazadaTransactions = async function() {
  incomeInitLazadaDates()
  const btn = incomeEl('incomeLazadaDetailLoadBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const data = await incomeFetch(`/api/income/lazada/transactions?${incomeLazadaQuery()}`)
    renderIncomeLazadaRows(data, 'detail')
  } catch (error) {
    renderIncomeLazadaRows({ status: 'error', message: error.message, details: [] }, 'detail')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải transaction detail'
    }
  }
}

window.loadIncomeLazadaAccountTransactions = async function() {
  incomeInitLazadaDates()
  const btn = incomeEl('incomeLazadaAccountLoadBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const data = await incomeFetch(`/api/income/lazada/account-transactions?${incomeLazadaQuery()}`)
    renderIncomeLazadaRows(data, 'account')
  } catch (error) {
    renderIncomeLazadaRows({ status: 'error', message: error.message, details: [] }, 'account')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải account transactions'
    }
  }
}

window.loadIncomeLazadaPayoutStatus = async function() {
  incomeInitLazadaDates()
  const btn = incomeEl('incomeLazadaPayoutLoadBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const data = await incomeFetch(`/api/income/lazada/payout-status?${incomeLazadaQuery()}`)
    renderIncomeLazadaRows(data, 'payout')
  } catch (error) {
    renderIncomeLazadaRows({ status: 'error', message: error.message, payouts: [] }, 'payout')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải payout status'
    }
  }
}

window.loadIncomeStatement = async function() {
  const btn = incomeEl('incomeStatementLoadBtn')
  const statementId = String(incomeEl('incomeStatementId')?.value || '').trim()
  const tbody = incomeEl('incomeStatementTable')
  const summary = incomeEl('incomeStatementSummary')
  if (!statementId) {
    incomeState.statementRows = []
    if (summary) summary.textContent = 'Thiếu income_statement_id'
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="income-detail-empty income-detail-error">Vui lòng nhập income_statement_id trước khi kiểm tra.</td></tr>'
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang kiểm tra...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/statement?${incomeStatementQuery()}`)
    renderIncomeStatementRows(data)
  } catch (error) {
    incomeState.statementRows = []
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="income-detail-empty income-detail-error">Không kiểm tra được income statement: ${incomeEscape(error.message)}</td></tr>`
    if (summary) summary.textContent = 'Lỗi kiểm tra statement'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Kiểm tra statement'
    }
  }
}

window.useIncomeStatementId = function(id, shop = '') {
  const input = incomeEl('incomeStatementId')
  if (!input) return
  input.value = String(id || '').trim()
  incomeSelectShop(shop)
  loadIncomeStatement()
}

window.useIncomeReportId = function(id, shop = '') {
  const input = incomeEl('incomeReportId')
  if (!input) return
  input.value = String(id || '').trim()
  incomeSelectShop(shop)
  loadIncomeReport()
}

window.useIncomePayoutId = function(id) {
  const input = incomeEl('incomeBillingPayoutIds')
  const type = incomeEl('incomeBillingType')
  if (!input) return
  input.value = String(id || '').trim()
  if (type) type.value = '2'
  loadIncomeBilling(true)
}

window.generateIncomeReport = async function() {
  incomeInitReportDates()
  const btn = incomeEl('incomeReportGenerateBtn')
  const tbody = incomeEl('incomeReportTable')
  const summary = incomeEl('incomeReportSummary')
  const dateFrom = incomeEl('incomeReportFrom')?.value || ''
  const dateTo = incomeEl('incomeReportTo')?.value || ''
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    incomeState.reportRows = []
    if (summary) summary.textContent = 'Khoảng ngày không hợp lệ'
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="income-detail-empty income-detail-error">Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.</td></tr>'
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tạo...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/generate-report?${incomeReportQuery()}`)
    renderIncomeReportRows(data)
    const firstId = (data.reports || []).find(row => row.ok && (row.income_report_id || row.report_id))
    if (firstId) {
      const input = incomeEl('incomeReportId')
      if (input) input.value = firstId.income_report_id || firstId.report_id
    }
  } catch (error) {
    incomeState.reportRows = []
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="income-detail-empty income-detail-error">Không tạo được income report: ${incomeEscape(error.message)}</td></tr>`
    if (summary) summary.textContent = 'Lỗi tạo report'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tạo report'
    }
  }
}

window.loadIncomeReport = async function() {
  const btn = incomeEl('incomeReportLoadBtn')
  const reportId = String(incomeEl('incomeReportId')?.value || '').trim()
  const tbody = incomeEl('incomeReportCheckTable')
  const summary = incomeEl('incomeReportCheckSummary')
  if (!reportId) {
    incomeState.reportCheckRows = []
    if (summary) summary.textContent = 'Thiếu income_report_id'
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="income-detail-empty income-detail-error">Vui lòng nhập income_report_id trước khi kiểm tra.</td></tr>'
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang kiểm tra...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/report?${incomeReportCheckQuery()}`)
    renderIncomeReportCheckRows(data)
  } catch (error) {
    incomeState.reportCheckRows = []
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="income-detail-empty income-detail-error">Không kiểm tra được income report: ${incomeEscape(error.message)}</td></tr>`
    if (summary) summary.textContent = 'Lỗi kiểm tra report'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Kiểm tra report'
    }
  }
}

window.generateIncomeStatement = async function() {
  incomeInitStatementDates()
  const btn = incomeEl('incomeStatementGenerateBtn')
  const tbody = incomeEl('incomeStatementGenerateTable')
  const summary = incomeEl('incomeStatementGenerateSummary')
  const dateFrom = incomeEl('incomeStatementFrom')?.value || ''
  const dateTo = incomeEl('incomeStatementTo')?.value || ''
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    incomeState.statementGenerateRows = []
    if (summary) summary.textContent = 'Khoảng ngày không hợp lệ'
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="income-detail-empty income-detail-error">Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.</td></tr>'
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tạo...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/generate-statement?${incomeStatementGenerateQuery()}`)
    renderIncomeStatementGenerateRows(data)
    const firstId = (data.statements || []).find(row => row.ok && (row.income_statement_id || row.statement_id))
    if (firstId) {
      const input = incomeEl('incomeStatementId')
      if (input) input.value = firstId.income_statement_id || firstId.statement_id
    }
  } catch (error) {
    incomeState.statementGenerateRows = []
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="income-detail-empty income-detail-error">Không tạo được income statement: ${incomeEscape(error.message)}</td></tr>`
    if (summary) summary.textContent = 'Lỗi tạo statement'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tạo statement'
    }
  }
}

window.loadIncomeForShop = function() {
  incomeState.sectionLoaded = {}
  loadIncomeActiveSection(true)
  if (String(incomeEl('incomeReportId')?.value || '').trim()) loadIncomeReport()
  if (String(incomeEl('incomeStatementId')?.value || '').trim()) loadIncomeStatement()
}

window.refreshIncomeAll = function() {
  incomeInitDetailDates()
  incomeInitWalletDates()
  incomeInitPayoutDates()
  incomeInitEscrowDates()
  incomeInitFeeDiscountDates()
  incomeInitLazadaDates()
  incomeInitReportDates()
  incomeInitStatementDates()
  incomeState.sectionLoaded = {}
  loadIncomeActiveSection(true)
}

window.loadIncome = function() {
  bindIncomeSections()
  applyIncomeSectionVisibility()
  incomeInitDetailDates()
  incomeInitWalletDates()
  incomeInitPayoutDates()
  incomeInitEscrowDates()
  incomeInitFeeDiscountDates()
  incomeInitLazadaDates()
  incomeInitReportDates()
  incomeInitStatementDates()
  loadIncomeActiveSection(true)
}
