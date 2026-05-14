window.useIncomeEscrowOrder = function(orderSn) {
  const input = incomeEl('incomeEscrowOrderSn')
  if (!input) return
  input.value = String(orderSn || '').trim()
  loadIncomeEscrowDetail()
}

window.loadIncomeEscrowList = async function() {
  incomeInitEscrowDates()
  const btn = incomeEl('incomeEscrowLoadBtn')
  const oldText = btn?.textContent || ''
  const dateFrom = incomeEl('incomeEscrowFrom')?.value || ''
  const dateTo = incomeEl('incomeEscrowTo')?.value || ''
  const tbody = incomeEl('incomeEscrowTable')
  const summary = incomeEl('incomeEscrowSummary')
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    incomeState.escrowRows = []
    if (summary) summary.textContent = 'Khoảng ngày không hợp lệ'
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="income-detail-empty income-detail-error">Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.</td></tr>'
    return
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/escrow-list?${incomeEscrowQuery()}`)
    renderIncomeEscrowRows(data)
  } catch (error) {
    incomeState.escrowRows = []
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="income-detail-empty income-detail-error">Không tải được escrow: ${incomeEscape(error.message)}</td></tr>`
    if (summary) summary.textContent = 'Lỗi tải escrow'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải escrow'
    }
  }
}

window.loadIncomeEscrowDetail = async function(orderSnList = '') {
  const btn = incomeEl('incomeEscrowDetailLoadBtn')
  const oldText = btn?.textContent || ''
  const orderSn = String(orderSnList || incomeEl('incomeEscrowOrderSn')?.value || '').trim()
  const tbody = incomeEl('incomeEscrowDetailTable')
  const summary = incomeEl('incomeEscrowDetailSummary')
  if (!orderSn) {
    incomeState.escrowDetailRows = []
    if (summary) summary.textContent = 'Thiếu mã đơn'
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="income-detail-empty income-detail-error">Vui lòng nhập mã đơn Shopee trước khi xem phí.</td></tr>'
    return
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/escrow-detail?${incomeEscrowDetailQuery(orderSn)}`)
    renderIncomeEscrowDetailRows(data)
  } catch (error) {
    incomeState.escrowDetailRows = []
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="income-detail-empty income-detail-error">Không tải được chi tiết escrow: ${incomeEscape(error.message)}</td></tr>`
    if (summary) summary.textContent = 'Lỗi tải chi tiết'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Xem phí'
    }
  }
}

window.loadIncomeFeeDiscounts = async function(resetPage = false) {
  incomeInitFeeDiscountDates()
  const btn = incomeEl('incomeFeeDiscountLoadBtn')
  const oldText = btn?.textContent || ''
  const dateFrom = incomeEl('incomeFeeDiscountFrom')?.value || ''
  const dateTo = incomeEl('incomeFeeDiscountTo')?.value || ''
  const tbody = incomeEl('incomeFeeDiscountTable')
  const summary = incomeEl('incomeFeeDiscountSummary')
  if (resetPage) {
    const pageNo = incomeEl('incomeFeeDiscountPageNo')
    if (pageNo) pageNo.value = '1'
  }
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    incomeState.feeDiscountRows = []
    if (summary) summary.textContent = 'Khoảng ngày không hợp lệ'
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="income-detail-empty income-detail-error">Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.</td></tr>'
    return
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const data = await incomeFetch(`/api/income/shopee/fee-discounts?${incomeFeeDiscountQuery()}`)
    renderIncomeFeeDiscountRows(data)
  } catch (error) {
    incomeState.feeDiscountRows = []
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="income-detail-empty income-detail-error">Không tải được dữ liệu TTLK / giảm Shopee: ${incomeEscape(error.message)}</td></tr>`
    if (summary) summary.textContent = 'Lỗi tải dữ liệu'
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Tải dữ liệu'
    }
  }
}

window.loadIncomePaymentMethods = async function() {
  const btn = incomeEl('incomePaymentMethodBtn')
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang tải...'
  }
  try {
    const shop = incomeEl('incomeShop')?.value || ''
    const qs = shop ? `?shop=${encodeURIComponent(shop)}` : ''
    const data = await incomeFetch(`/api/income/shopee/payment-methods${qs}`)
    renderIncomePaymentMethods(data)
  } catch (error) {
    renderIncomePaymentMethods({ status: 'error', message: error.message, regions: [] })
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Phương thức thanh toán'
    }
  }
}
