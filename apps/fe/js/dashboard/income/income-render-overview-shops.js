function markIncomeSection(node, section) {
  if (!node) return
  node.dataset.incomeSection = section
  node.classList.add('income-section-item')
}

function bindIncomeSections() {
  if (incomeState.sectionsBound) return
  const root = incomeEl('tab-income')
  if (!root) return
  markIncomeSection(root.querySelector('.income-help'), 'overview')
  markIncomeSection(incomeEl('incomeKpiGrid'), 'overview')
  markIncomeSection(incomeEl('incomeShopList')?.closest('.income-panel'), 'overview')
  markIncomeSection(incomeEl('incomeDetailTable')?.closest('.income-panel'), 'detail')
  markIncomeSection(incomeEl('incomeFeeDiscountTable')?.closest('.income-panel'), 'fee-discounts')
  markIncomeSection(incomeEl('incomeWalletTable')?.closest('.income-panel'), 'wallet')
  markIncomeSection(incomeEl('incomePayoutTable')?.closest('.income-panel'), 'payout')
  markIncomeSection(incomeEl('incomeBillingTable')?.closest('.income-panel'), 'payout')
  markIncomeSection(incomeEl('incomeReportTable')?.closest('.income-panel'), 'reports')
  markIncomeSection(incomeEl('incomeSourceNotice')?.closest('.income-panel'), 'source')
  root.querySelectorAll('[data-income-section]').forEach(node => node.classList.add('income-section-item'))
  incomeState.sectionsBound = true
}

function applyIncomeSectionVisibility() {
  bindIncomeSections()
  const active = incomeState.activeSection || 'overview'
  document.querySelectorAll('[data-income-nav]').forEach(btn => {
    const selected = btn.dataset.incomeNav === active
    btn.classList.toggle('active', selected)
    btn.setAttribute('aria-selected', selected ? 'true' : 'false')
  })
  document.querySelectorAll('.income-section-item').forEach(node => {
    node.hidden = node.dataset.incomeSection !== active
  })
}

function loadIncomeActiveSection(force = false) {
  const section = incomeState.activeSection || 'overview'
  if (!force && incomeState.sectionLoaded[section]) return
  incomeState.sectionLoaded[section] = true
  // Mỗi mục tự tải dữ liệu của mình để tránh một lần đổi shop kéo hàng loạt API tài chính.
  if (section === 'overview') return loadIncomeOverview()
  if (section === 'detail') return loadIncomeDetail(true)
  if (section === 'escrow') return loadIncomeEscrowList()
  if (section === 'fee-discounts') return loadIncomeFeeDiscounts(true)
  if (section === 'wallet') return loadIncomeWallet(true)
  if (section === 'payout') {
    loadIncomePayout(true)
    return loadIncomeBilling(true)
  }
  if (section === 'lazada') return loadIncomeLazadaTransactions()
  if (section === 'reports') {
    incomeInitReportDates()
    incomeInitStatementDates()
    return
  }
  if (section === 'source') return loadIncomeOverview()
}

window.switchIncomeSection = function(section) {
  incomeState.activeSection = section || 'overview'
  applyIncomeSectionVisibility()
  loadIncomeActiveSection(false)
}

function populateIncomeShopOptions(rows = []) {
  const select = incomeEl('incomeShop')
  if (!select) return
  const selected = select.value
  if (rows.length > incomeState.allShops.length) incomeState.allShops = rows
  const source = incomeState.allShops.length ? incomeState.allShops : rows
  const byName = new Map()
  source.forEach(row => {
    const name = row.shop || row.api_shop_id || ''
    if (name && !byName.has(name)) byName.set(name, row)
  })
  select.innerHTML = '<option value="">Tất cả shop Shopee API</option>' + [...byName.values()].map(row => {
    const name = row.shop || row.api_shop_id || ''
    const label = `${name}${row.api_shop_id ? ` - ${row.api_shop_id}` : ''}`
    return `<option value="${incomeEscape(name)}">${incomeEscape(label)}</option>`
  }).join('')
  if ([...select.options].some(opt => opt.value === selected)) select.value = selected
}

function incomeSelectShop(shop) {
  // ID report/statement của Shopee gắn theo từng shop, nên khi kiểm tra phải chọn đúng shop đã tạo ID.
  const name = String(shop || '').trim()
  const select = incomeEl('incomeShop')
  if (!name || !select) return
  if ([...select.options].some(opt => opt.value === name)) select.value = name
}

function renderIncomeKpis(summary = {}, data = {}) {
  const box = incomeEl('incomeKpiGrid')
  if (!box) return
  const items = [
    { label: 'Chờ đơn hoàn tất', value: incomeShort(summary.pending_amount), sub: incomeMoney(summary.pending_amount), hint: 'Pending: tiền của đơn chưa đủ điều kiện ghi nhận hoặc còn chờ hoàn tất.', tone: 'orange' },
    { label: 'Chờ Shopee giải ngân', value: incomeShort(summary.to_release_amount), sub: incomeMoney(summary.to_release_amount), hint: 'To Release: Shopee đã xác nhận nhưng chưa release vào số dư.', tone: 'purple' },
    { label: 'Đã ghi nhận', value: incomeShort(summary.released_amount), sub: incomeMoney(summary.released_amount), hint: 'Released: tiền đã được Shopee release/ghi nhận theo snapshot hiện tại.', tone: 'green' },
    { label: 'Tổng số dư hiện tại', value: incomeShort(summary.total_amount), sub: incomeMoney(summary.total_amount), hint: 'Tổng snapshot = Chờ đơn hoàn tất + Chờ giải ngân + Đã ghi nhận.', tone: 'blue' },
    { label: 'Shop API thành công', value: `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)}`, sub: incomeStatusLabel(data.income_status), hint: 'Số shop gọi Shopee Payment API thành công trong lần tải này.', tone: 'teal' }
  ]
  box.innerHTML = items.map(item => `
    <div class="income-kpi ${item.tone}">
      <div class="income-kpi-label">${incomeEscape(item.label)}</div>
      <div class="income-kpi-value">${incomeEscape(item.value)}</div>
      <div class="income-kpi-sub">${incomeEscape(item.sub)}</div>
      <div class="income-kpi-hint">${incomeEscape(item.hint)}</div>
    </div>
  `).join('')
}

function renderIncomeShops(rows = []) {
  const list = incomeEl('incomeShopList')
  const summary = incomeEl('incomeShopSummary')
  if (!list) return
  const okRows = rows.filter(row => row.ok)
  if (summary) summary.textContent = `${okRows.length.toLocaleString('vi-VN')}/${rows.length.toLocaleString('vi-VN')} shop OK`
  if (!rows.length) {
    list.innerHTML = '<div class="income-empty">Chưa có shop Shopee API để kiểm tra số dư.</div>'
    return
  }
  list.innerHTML = rows.map(row => `
    <div class="income-shop-card ${row.ok ? 'ok' : 'error'}">
      <div class="income-shop-head">
        <b>${incomeEscape(row.shop || 'Shop Shopee')}</b>
        <span>${row.ok ? 'API OK' : 'Lỗi API'}</span>
      </div>
      ${row.ok ? `
        <div class="income-shop-money">
          <div><span>Chờ đơn hoàn tất</span><b>${incomeMoney(row.pending_amount)}</b></div>
          <div><span>Chờ Shopee giải ngân</span><b>${incomeMoney(row.to_release_amount)}</b></div>
          <div><span>Đã ghi nhận</span><b>${incomeMoney(row.released_amount)}</b></div>
        </div>
        <small>${row.latest_payout_date ? `Payout gần nhất: ${incomeEscape(row.latest_payout_date)} · ` : ''}Request ${incomeEscape(row.request_id || '')}</small>
      ` : `
        <p>${incomeEscape(row.message || row.error || 'Không lấy được income overview')}</p>
      `}
    </div>
  `).join('')
}

function renderIncomeDetailRows(data = {}, append = false) {
  const tbody = incomeEl('incomeDetailTable')
  const summary = incomeEl('incomeDetailSummary')
  const moreBtn = incomeEl('incomeDetailMoreBtn')
  if (!tbody) return
  const rows = data.details || []
  incomeState.detailRows = append ? [...incomeState.detailRows, ...rows] : rows
  incomeState.detailCursor = data.next_cursor || ''
  if (moreBtn) {
    moreBtn.hidden = !incomeState.detailCursor
    moreBtn.textContent = incomeState.detailCursor ? 'Tải trang tiếp' : 'Hết dữ liệu'
  }
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  const statusText = incomeStatusLabel(data.income_status)
  const visibleAmount = incomeState.detailRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const sumText = ` · Tổng dòng đang xem ${incomeMoney(visibleAmount)}`
  if (summary) summary.textContent = `${statusText} · ${incomeState.detailRows.length} dòng · ${okText}${sumText}`

  if (!incomeState.detailRows.length) {
    const errors = (data.shops || []).filter(row => !row.ok).map(row => `${row.shop}: ${row.message || row.error}`).join(' | ')
    tbody.innerHTML = `<tr><td colspan="8" class="income-detail-empty">${incomeEscape(errors || 'Chưa có chi tiết thu nhập trong bộ lọc này.')}</td></tr>`
    return
  }

  tbody.innerHTML = incomeState.detailRows.map(row => {
    const time = row.actual_payout_at || row.estimated_payout_at || row.creation_time || ''
    return `
      <tr>
        <td>${incomeEscape(row.shop)}</td>
        <td><b>${incomeEscape(row.order_sn || '-')}</b></td>
        <td>${incomeEscape(row.payment_method || row.description || '-')}</td>
        <td>${incomeEscape(row.status || incomeStatusLabel(row.income_status))}</td>
        <td>${incomeMoney(row.estimated_escrow_amount)}</td>
        <td>${incomeMoney(row.to_release_amount)}</td>
        <td>${incomeMoney(row.released_amount)}</td>
        <td>${incomeEscape(incomeFormatTime(time))}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeBillingRows(data = {}, append = false) {
  const tbody = incomeEl('incomeBillingTable')
  const summary = incomeEl('incomeBillingSummary')
  const moreBtn = incomeEl('incomeBillingMoreBtn')
  if (!tbody) return
  const rows = data.transactions || []
  incomeState.billingRows = append ? [...incomeState.billingRows, ...rows] : rows
  incomeState.billingCursor = data.next_cursor || ''
  if (moreBtn) {
    moreBtn.hidden = !incomeState.billingCursor
    moreBtn.textContent = incomeState.billingCursor ? 'Tải trang tiếp' : 'Hết dữ liệu'
  }
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  const typeText = String(data.billing_transaction_info_type || '1') === '2' ? 'Đã ghi nhận' : 'Chờ Shopee giải ngân'
  const visibleAmount = incomeState.billingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  if (summary) summary.textContent = `${typeText} · ${incomeState.billingRows.length} dòng · ${okText} · Tổng ${incomeMoney(visibleAmount)}`

  if (!incomeState.billingRows.length) {
    const errors = (data.shops || []).filter(row => !row.ok).map(row => `${row.shop}: ${incomeReadableMessage(row.message || row.error)}`).join(' | ')
    tbody.innerHTML = `<tr><td colspan="8" class="income-detail-empty">${incomeEscape(errors || 'Chưa có billing transaction trong bộ lọc này.')}</td></tr>`
    return
  }

  tbody.innerHTML = incomeState.billingRows.map(row => `
    <tr>
      <td>${incomeEscape(row.shop)}</td>
      <td><b>${incomeEscape(row.order_sn || '-')}</b></td>
      <td>${incomeEscape(row.cost_header || '-')}</td>
      <td>${incomeEscape(row.scenario || '-')}</td>
      <td>${incomeEscape(row.billing_transaction_type || '-')}</td>
      <td>${incomeEscape(row.billing_transaction_status || '-')}</td>
      <td class="${Number(row.amount || 0) < 0 ? 'profit-neg' : 'profit-pos'}">${incomeMoney(row.amount)}</td>
      <td>${incomeEscape(row.remark || row.level || '-')}</td>
    </tr>
  `).join('')
}

function renderIncomePayoutRows(data = {}, append = false) {
  const tbody = incomeEl('incomePayoutTable')
  const summary = incomeEl('incomePayoutSummary')
  const moreBtn = incomeEl('incomePayoutMoreBtn')
  if (!tbody) return
  const rows = data.payouts || []
  incomeState.payoutRows = append ? [...incomeState.payoutRows, ...rows] : rows
  incomeState.payoutCursor = data.next_cursor || ''
  if (moreBtn) {
    moreBtn.hidden = !incomeState.payoutCursor
    moreBtn.textContent = incomeState.payoutCursor ? 'Tải trang tiếp' : 'Hết dữ liệu'
  }
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  const visibleAmount = incomeState.payoutRows.reduce((sum, row) => sum + Number(row.payout_amount || 0), 0)
  if (summary) summary.textContent = `${incomeState.payoutRows.length} payout · ${okText} · Tổng ${incomeMoney(visibleAmount)}`

  if (!incomeState.payoutRows.length) {
    const errors = (data.shops || []).filter(row => !row.ok).map(row => `${row.shop}: ${incomeReadableMessage(row.message || row.error)}`).join(' | ')
    tbody.innerHTML = `<tr><td colspan="9" class="income-detail-empty">${incomeEscape(errors || 'Chưa có payout trong bộ lọc này.')}</td></tr>`
    return
  }

  tbody.innerHTML = incomeState.payoutRows.map(row => {
    const amount = Number(row.payout_amount || 0)
    const id = String(row.encrypted_payout_id || '').replace(/[^\w-]/g, '')
    const action = id
      ? `<button type="button" class="income-mini-btn" onclick="useIncomePayoutId(${incomeInlineString(id)})">Dùng ID billing</button>`
      : '-'
    return `
      <tr>
        <td>${incomeEscape(row.shop || '-')}</td>
        <td>${incomeEscape(incomeFormatTime(row.payout_at || ''))}</td>
        <td>${incomeMoney(row.from_amount)}<br><small>${incomeEscape(row.from_currency || '-')}</small></td>
        <td class="${amount < 0 ? 'profit-neg' : 'profit-pos'}">${incomeMoney(row.payout_amount)}<br><small>${incomeEscape(row.payout_currency || '-')}</small></td>
        <td>${incomeEscape(row.exchange_rate || '-')}</td>
        <td>${incomeEscape(row.pay_service || '-')}</td>
        <td>${incomeEscape(row.payee_id || '-')}</td>
        <td><b>${incomeEscape(row.encrypted_payout_id || '-')}</b></td>
        <td>${action}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeWalletRows(data = {}, append = false) {
  const tbody = incomeEl('incomeWalletTable')
  const summary = incomeEl('incomeWalletSummary')
  const moreBtn = incomeEl('incomeWalletMoreBtn')
  if (!tbody) return
  const rows = data.transactions || []
  incomeState.walletRows = append ? [...incomeState.walletRows, ...rows] : rows
  incomeState.walletPageNo = Number(data.page_no || 0) > 0 ? Number(data.page_no || 0) : 1
  incomeState.walletMore = Boolean(data.more)
  if (moreBtn) {
    moreBtn.hidden = !incomeState.walletMore
    moreBtn.textContent = incomeState.walletMore ? 'Tải trang tiếp' : 'Hết dữ liệu'
  }
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  const totalAmount = incomeState.walletRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  if (summary) {
    summary.textContent = `${incomeState.walletRows.length} dòng · ${okText} · Tổng ${incomeMoney(totalAmount)}`
  }

  if (!incomeState.walletRows.length) {
    const errors = (data.shops || []).filter(row => !row.ok).map(row => `${row.shop}: ${row.message || row.error}`).join(' | ')
    tbody.innerHTML = `<tr><td colspan="9" class="income-detail-empty">${incomeEscape(errors || 'Chưa có giao dịch ví trong bộ lọc này.')}</td></tr>`
    return
  }

  tbody.innerHTML = incomeState.walletRows.map(row => {
    const amount = Number(row.amount || 0)
    const flow = row.money_flow || (amount >= 0 ? 'MONEY_IN' : 'MONEY_OUT')
    const orderText = [row.order_sn, row.refund_sn].filter(Boolean).join(' / ') || '-'
    const description = row.description || row.reason || row.buyer_name || '-'
    return `
      <tr>
        <td>${incomeEscape(row.shop || '-')}</td>
        <td>${incomeEscape(incomeFormatTime(row.create_at || ''))}</td>
        <td><span class="income-flow-pill ${flow === 'MONEY_OUT' ? 'out' : 'in'}">${incomeEscape(flow === 'MONEY_OUT' ? 'Tiền ra' : 'Tiền vào')}</span></td>
        <td>${incomeEscape(incomeWalletTabLabel(row.transaction_tab_type))}</td>
        <td>${incomeEscape(row.transaction_type || '-')}</td>
        <td class="${amount < 0 ? 'profit-neg' : 'profit-pos'}">${incomeMoney(row.amount)}</td>
        <td>${incomeMoney(row.current_balance)}</td>
        <td><b>${incomeEscape(orderText)}</b><br><small>${incomeEscape(description)}</small></td>
        <td>${incomeEscape(row.status || '-')}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeEscrowRows(data = {}) {
  const tbody = incomeEl('incomeEscrowTable')
  const summary = incomeEl('incomeEscrowSummary')
  if (!tbody) return
  const rows = data.escrows || []
  incomeState.escrowRows = rows
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.payout_amount || 0), 0)
  if (summary) summary.textContent = `${rows.length} dòng · ${okText} · Tổng ${incomeMoney(totalAmount)}`

  if (!rows.length) {
    const errors = (data.shops || []).filter(row => !row.ok).map(row => `${row.shop}: ${incomeReadableMessage(row.message || row.error)}`).join(' | ')
    tbody.innerHTML = `<tr><td colspan="5" class="income-detail-empty">${incomeEscape(errors || 'Chưa có escrow trong bộ lọc này.')}</td></tr>`
    return
  }

  tbody.innerHTML = rows.map(row => {
    const orderSn = String(row.order_sn || '').replace(/[^\w-]/g, '')
    const action = orderSn
      ? `<button type="button" class="income-mini-btn" onclick="useIncomeEscrowOrder(${incomeInlineString(orderSn)})">Xem phí</button>`
      : '-'
    return `
      <tr>
        <td>${incomeEscape(row.shop || '-')}</td>
        <td><b>${incomeEscape(row.order_sn || '-')}</b></td>
        <td>${incomeMoney(row.payout_amount)}</td>
        <td>${incomeEscape(incomeFormatTime(row.escrow_release_at || ''))}</td>
        <td>${action}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeEscrowDetailRows(data = {}) {
  const tbody = incomeEl('incomeEscrowDetailTable')
  const summary = incomeEl('incomeEscrowDetailSummary')
  if (!tbody) return
  const rows = data.details || []
  incomeState.escrowDetailRows = rows
  const okText = `${Number(data.ok_count || 0)}/${Number(data.shop_count || 0)} shop OK`
  if (summary) summary.textContent = `${rows.length} dòng · ${okText} · Thực nhận ${incomeMoney(data.summary?.escrow_amount || 0)}`

  if (!rows.length) {
    const errors = (data.shops || []).filter(row => !row.ok).map(row => `${row.shop}: ${incomeReadableMessage(row.message || row.error)}`).join(' | ')
    tbody.innerHTML = `<tr><td colspan="9" class="income-detail-empty">${incomeEscape(errors || data.message || 'Chưa có chi tiết escrow.')}</td></tr>`
    return
  }

  tbody.innerHTML = rows.map(row => {
    const shipping = Number(row.final_shipping_fee || 0) || Number(row.actual_shipping_fee || 0) || 0
    const discounts = Number(row.voucher_from_seller || 0) + Number(row.voucher_from_shopee || 0) + Number(row.seller_discount || 0) + Number(row.shopee_discount || 0) + Number(row.coins || 0)
    return `
      <tr class="${row.ok === false ? 'income-row-error' : ''}">
        <td>${incomeEscape(row.shop || '-')}</td>
        <td><b>${incomeEscape(row.order_sn || '-')}</b><br><small>${incomeEscape(row.buyer_user_name || '')}</small></td>
        <td class="profit-pos">${incomeMoney(row.escrow_amount)}</td>
        <td>${incomeMoney(row.commission_fee)}</td>
        <td>${incomeMoney(row.service_fee)}</td>
        <td>${incomeMoney(row.seller_transaction_fee)}</td>
        <td>${incomeMoney(shipping)}<br><small>Rebate ${incomeMoney(row.shopee_shipping_rebate)}</small></td>
        <td>${incomeMoney(discounts)}</td>
        <td>${incomeEscape((row.sku_list || []).join(', ') || '-')}</td>
      </tr>
    `
  }).join('')
}

function renderIncomeFeeDiscountRows(data = {}) {
  const tbody = incomeEl('incomeFeeDiscountTable')
  const summary = incomeEl('incomeFeeDiscountSummary')
  if (!tbody) return
  const rows = data.rows || []
  incomeState.feeDiscountRows = rows
  const sum = data.summary || {}
  const pageText = `Trang ${Number(data.page_no || 1).toLocaleString('vi-VN')}/${Number(data.total_pages || 1).toLocaleString('vi-VN')}`
  if (summary) {
    summary.textContent = `${Number(data.total || 0).toLocaleString('vi-VN')} đơn · TTLK ${incomeMoney(sum.fee_affiliate)} · Giảm Shopee ${incomeMoney(sum.shopee_support_total)} · ${pageText}`
  }

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="income-detail-empty">Không có đơn khớp bộ lọc TTLK / giảm Shopee.</td></tr>'
    return
  }

  tbody.innerHTML = rows.map(row => {
    const affiliate = Number(row.fee_affiliate || 0)
    const shopeeSupport = Number(row.shopee_support_total || 0)
    return `
      <tr>
        <td><b>${incomeEscape(row.order_id || '-')}</b></td>
        <td>${incomeEscape(row.shop || '-')}<br><small>${incomeEscape(row.buyer_user_name || '')}</small></td>
        <td>${incomeEscape(incomeFormatTime(row.order_date || row.updated_at || ''))}</td>
        <td>${incomeMoney(row.revenue)}</td>
        <td class="${affiliate > 0 ? 'profit-neg' : ''}">${incomeMoney(affiliate)}</td>
        <td>${incomeMoney(row.voucher_shop)}</td>
        <td class="${Number(row.voucher_from_shopee || 0) > 0 ? 'profit-pos' : ''}">${incomeMoney(row.voucher_from_shopee)}</td>
        <td class="${Number(row.shopee_discount || 0) > 0 ? 'profit-pos' : ''}">${incomeMoney(row.shopee_discount)}</td>
        <td class="${Number(row.coins || 0) > 0 ? 'profit-pos' : ''}">${incomeMoney(row.coins)}</td>
        <td><b>${incomeMoney(row.settlement)}</b><br><small>Shopee hỗ trợ ${incomeMoney(shopeeSupport)}</small></td>
      </tr>
    `
  }).join('')
}
