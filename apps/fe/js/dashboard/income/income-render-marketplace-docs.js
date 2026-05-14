function renderIncomePaymentMethods(data = {}) {
  const list = incomeEl('incomePaymentMethodList')
  const summary = incomeEl('incomePaymentMethodSummary')
  if (!list) return
  const rows = data.regions || []
  incomeState.paymentMethodRows = rows
  if (summary) summary.textContent = `${Number(data.total_regions || rows.length)} vùng · ${Number(data.total_methods || 0)} phương thức`
  if (!rows.length) {
    list.innerHTML = `<div class="income-empty">${incomeEscape(data.message || 'Chưa có danh sách phương thức thanh toán.')}</div>`
    return
  }
  list.innerHTML = rows.map(row => `
    <div class="income-method-card">
      <b>${incomeEscape(row.region || '-')}</b>
      <span>${incomeEscape((row.payment_method || []).slice(0, 18).join(', ') || '-')}</span>
    </div>
  `).join('')
}

function renderIncomeLazadaRows(data = {}, mode = '') {
  const tbody = incomeEl('incomeLazadaTable')
  const summary = incomeEl('incomeLazadaSummary')
  if (!tbody) return
  const rows = data.details || data.payouts || []
  incomeState.lazadaRows = rows
  incomeState.lazadaMode = mode || data.mode || ''
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const label = mode === 'account' ? 'Account transactions' : mode === 'payout' ? 'Payout status' : 'Transaction detail'
  if (summary) summary.textContent = `${label} · ${rows.length} dòng · ${okText} · Tổng ${incomeMoney(totalAmount)}`

  if (!rows.length) {
    const errors = (data.warnings || data.shops || []).filter(row => row.message || row.error).map(row => `${row.shop || '-'}: ${incomeReadableMessage(row.message || row.error)}`).join(' | ')
    tbody.innerHTML = `<tr><td colspan="8" class="income-detail-empty">${incomeEscape(errors || data.message || 'Chưa có dữ liệu Lazada Finance trong bộ lọc này.')}</td></tr>`
    return
  }

  tbody.innerHTML = rows.map(row => {
    const amount = Number(row.amount || 0)
    const ref = [row.paid_status, row.reference, row.statement].filter(Boolean).join(' · ') || '-'
    return `
      <tr>
        <td>${incomeEscape(row.shop || '-')}</td>
        <td>${incomeEscape(incomeFormatTime(row.transaction_date || ''))}</td>
        <td>${incomeEscape(row.transaction_number || '-')}</td>
        <td><b>${incomeEscape(row.order_no || '-')}</b><br><small>${incomeEscape(row.order_item_no || '')}</small></td>
        <td>${incomeEscape(row.transaction_type || row.fee_name || '-')}</td>
        <td>${incomeEscape(row.sub_transaction_type || row.fee_type || '-')}</td>
        <td class="${amount < 0 ? 'profit-neg' : 'profit-pos'}">${incomeMoney(amount)}</td>
        <td>${incomeEscape(ref)}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeStatementRows(data = {}) {
  const tbody = incomeEl('incomeStatementTable')
  const summary = incomeEl('incomeStatementSummary')
  if (!tbody) return
  const rows = data.statements || []
  incomeState.statementRows = rows
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  if (summary) {
    summary.textContent = data.income_statement_id
      ? `ID ${data.income_statement_id} · ${rows.length} shop · ${okText} · ${Number(data.downloadable_count || 0)} file tải được`
      : 'Nhập ID để kiểm tra'
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="income-detail-empty">${incomeEscape(data.message || 'Chưa có kết quả sao kê thu nhập.')}</td></tr>`
    return
  }

  tbody.innerHTML = rows.map(row => {
    const statusText = row.status_label || incomeStatementStatusLabel(row.status)
    const link = row.file_link
      ? `<a class="income-file-link" href="${incomeEscape(row.file_link)}" target="_blank" rel="noopener">Mở file</a>`
      : '-'
    const requestText = row.ok ? (row.request_id || '-') : (row.message || row.error || '-')
    return `
      <tr class="${row.ok ? '' : 'income-row-error'}">
        <td>${incomeEscape(row.shop || '-')}</td>
        <td><b>${incomeEscape(row.income_statement_id || data.income_statement_id || '-')}</b></td>
        <td>${incomeEscape(row.file_name || '-')}</td>
        <td>${incomeEscape(statusText)}</td>
        <td>${incomeEscape(incomeFormatTime(row.generated_at || ''))}</td>
        <td>${link}</td>
        <td>${incomeEscape(requestText)}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeReportRows(data = {}) {
  const tbody = incomeEl('incomeReportTable')
  const summary = incomeEl('incomeReportSummary')
  if (!tbody) return
  const rows = data.reports || []
  incomeState.reportRows = rows
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  if (summary) summary.textContent = `${rows.length} shop · ${okText}`

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="income-detail-empty">${incomeEscape(data.message || 'Chưa có kết quả tạo income report.')}</td></tr>`
    return
  }

  tbody.innerHTML = rows.map(row => {
    const reportId = row.income_report_id || row.report_id || ''
    const safeReportId = String(reportId || '').replace(/[^\d]/g, '')
    const range = `${incomeFormatTime(row.release_time_from_at)} - ${incomeFormatTime(row.release_time_to_at)}`
    const result = row.ok ? 'Đã tạo ID báo cáo' : (row.message || row.error || 'Không tạo được báo cáo')
    const action = safeReportId
      ? `<button type="button" class="income-mini-btn" onclick="useIncomeReportId(${incomeInlineString(safeReportId)}, ${incomeInlineString(row.shop || '')})">Kiểm tra báo cáo</button>`
      : '-'
    return `
      <tr class="${row.ok ? '' : 'income-row-error'}">
        <td>${incomeEscape(row.shop || '-')}</td>
        <td>${incomeEscape(range)}</td>
        <td><b>${incomeEscape(reportId || '-')}</b></td>
        <td>${incomeEscape(result)}</td>
        <td>${incomeEscape(row.request_id || '-')}</td>
        <td>${action}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeReportCheckRows(data = {}) {
  const tbody = incomeEl('incomeReportCheckTable')
  const summary = incomeEl('incomeReportCheckSummary')
  if (!tbody) return
  const rows = data.reports || []
  incomeState.reportCheckRows = rows
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  if (summary) {
    summary.textContent = data.income_report_id
      ? `ID ${data.income_report_id} · ${rows.length} shop · ${okText} · ${Number(data.downloadable_count || 0)} file tải được`
      : 'Nhập ID để kiểm tra'
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="income-detail-empty">${incomeEscape(data.message || 'Chưa có kết quả báo cáo thu nhập.')}</td></tr>`
    return
  }

  tbody.innerHTML = rows.map(row => {
    const statusText = row.status_label || incomeStatementStatusLabel(row.status)
    const link = row.file_link
      ? `<a class="income-file-link" href="${incomeEscape(row.file_link)}" target="_blank" rel="noopener">Mở file</a>`
      : '-'
    const requestText = row.ok ? (row.request_id || '-') : (row.message || row.error || '-')
    return `
      <tr class="${row.ok ? '' : 'income-row-error'}">
        <td>${incomeEscape(row.shop || '-')}</td>
        <td><b>${incomeEscape(row.income_report_id || data.income_report_id || '-')}</b></td>
        <td>${incomeEscape(row.file_name || '-')}</td>
        <td>${incomeEscape(statusText)}</td>
        <td>${incomeEscape(incomeFormatTime(row.generated_at || ''))}</td>
        <td>${link}</td>
        <td>${incomeEscape(requestText)}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeStatementGenerateRows(data = {}) {
  const tbody = incomeEl('incomeStatementGenerateTable')
  const summary = incomeEl('incomeStatementGenerateSummary')
  if (!tbody) return
  const rows = data.statements || []
  incomeState.statementGenerateRows = rows
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  if (summary) summary.textContent = `${incomeStatementTypeLabel(data.statement_type)} · ${rows.length} shop · ${okText}`

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="income-detail-empty">${incomeEscape(data.message || 'Chưa có kết quả tạo sao kê thu nhập.')}</td></tr>`
    return
  }

  tbody.innerHTML = rows.map(row => {
    const statementId = row.income_statement_id || row.statement_id || ''
    const safeStatementId = String(statementId || '').replace(/[^\d]/g, '')
    const range = `${incomeFormatTime(row.release_time_from_at)} - ${incomeFormatTime(row.release_time_to_at)}`
    const result = row.ok ? 'Đã tạo ID sao kê' : (row.message || row.error || 'Không tạo được sao kê')
    const action = safeStatementId
      ? `<button type="button" class="income-mini-btn" onclick="useIncomeStatementId(${incomeInlineString(safeStatementId)}, ${incomeInlineString(row.shop || '')})">Kiểm tra sao kê</button>`
      : '-'
    return `
      <tr class="${row.ok ? '' : 'income-row-error'}">
        <td>${incomeEscape(row.shop || '-')}</td>
        <td>${incomeEscape(incomeStatementTypeLabel(row.statement_type))}</td>
        <td>${incomeEscape(range)}</td>
        <td><b>${incomeEscape(statementId || '-')}</b></td>
        <td>${incomeEscape(result)}</td>
        <td>${incomeEscape(row.request_id || '-')}</td>
        <td>${action}</td>
      </tr>
    `
  }).join('')
}
