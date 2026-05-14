const orderAnalyticsState = {
  data: null,
  rows: [],
  skuTab: '',
  loading: false
}

function oaEl(id) {
  return document.getElementById(id)
}

function oaEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

function oaMoney(value) {
  const n = Number(value || 0)
  return n.toLocaleString('vi-VN') + 'đ'
}

function oaShort(value) {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' tr'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k'
  return n.toLocaleString('vi-VN')
}

function oaPct(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function oaOrderStatusLabel(value) {
  if (value === 'RETURN_REFUND') return 'Trả hàng / hoàn tiền'
  if (value === 'RETURN') return 'Trả hàng'
  if (value === 'TO_RETURN') return 'Chờ trả hàng'
  // Dùng cùng core trạng thái với chat/OMS để không hiện mã thô RETURN/CANCELLED cho người vận hành.
  return window.SHV_ORDER_STATUS_CORE?.label
    ? window.SHV_ORDER_STATUS_CORE.label(value, '')
    : String(value || '')
}

function oaSourceLabel(source) {
  if (source === 'shopee.payment.get_income_detail') return 'Payment API'
  if (source === 'shopee.payment.get_escrow_detail') return 'Escrow API'
  if (source === 'lazada.finance.transaction.detail.get') return 'Lazada Finance'
  if (source === 'orders_v2_zero_revenue_return_fee') return 'Hoàn/trả suy luận'
  if (source === 'orders_v2_estimate_no_ads') return 'Ước tính'
  return source || 'Chưa rõ'
}

function oaAdsLabel(method) {
  if (method === 'ads_api_product_sku_daily') return 'CPO SKU/ngày'
  if (method === 'ads_api_shop_hourly') return 'CPO shop/giờ'
  if (method === 'ads_api_shop_daily') return 'CPO shop/ngày'
  if (method === 'ads_api_product_day_no_matching_sku') return 'Có Ads nhưng chưa khớp SKU'
  if (method === 'ads_cpo_reallocated_order_not_successful') return 'Đơn lỗi, đã phân bổ lại CPO'
  return 'Không có spend Ads thật'
}

function oaCpoBasisLabel(basis) {
  if (basis === 'sku_daily_orders') return 'Chi phí SKU chia theo đơn SKU'
  if (basis === 'shop_hour_orders') return 'Chi phí shop chia theo đơn trong giờ'
  if (basis === 'shop_day_orders') return 'Chi phí shop chia theo đơn trong ngày'
  if (basis === 'excluded_cancel_return_or_failed') return 'Không nhận CPO do hủy/return/thất bại'
  if (basis === 'product_day_no_matching_sku') return 'Ads sản phẩm chưa khớp SKU'
  return 'Không có Ads thật để chia'
}

function oaAdsStatusLabel(status) {
  if (status === 'loss_pause_ads_review') return 'Lỗ, cần kiểm tra/tạm dừng Ads'
  if (status === 'ads_running_watch_cpo') return 'Có Ads, theo dõi CPO'
  return 'Không có Ads thật'
}

function oaSum(rows, field) {
  return (rows || []).reduce((sum, row) => sum + Number(row?.[field] || 0), 0)
}

function oaImage(row) {
  const url = String(row?.image_url || '').trim()
  const label = String(row?.sku || row?.product_name || 'SKU').slice(0, 3).toUpperCase()
  if (!url) return `<div class="netprofit-thumb empty">${oaEscape(label)}</div>`
  return `<img class="netprofit-thumb" src="${oaEscape(url)}" alt="${oaEscape(row?.product_name || row?.sku || 'Sản phẩm')}" loading="lazy">`
}

function oaLossReasonChips(row) {
  // Gom lý do âm tiền theo từng dòng hàng để xem nhanh phần nào cần sửa: giá vốn, CPO, hoàn tiền hay thiếu nguồn Payment API.
  const chips = []
  if (Number(row.item_net_profit || row.net_profit || 0) < 0) chips.push(`Âm ${oaMoney(row.item_net_profit || row.net_profit)}`)
  if (Number(row.cost_real || 0) <= 0) chips.push('Chưa có giá vốn')
  if (Number(row.cost_real || 0) > Number(row.revenue_line || 0) && Number(row.revenue_line || 0) > 0) chips.push('Giá vốn cao hơn doanh thu')
  if (Number(row.item_ads_cost || 0) > 0) chips.push(`CPO ${oaMoney(row.item_ads_cost)}`)
  if (Number(row.item_refund || 0) > 0) chips.push(`Hoàn tiền ${oaMoney(row.item_refund)}`)
  const warn = String(row.warning || '')
  if (warn.includes('payment_api_missing') || row.actual_income_source === 'orders_v2_estimate_no_ads') chips.push('Ước tính, thiếu Payment API')
  if (warn.includes('zero_revenue_return_inferred')) chips.push('Chỉ trừ phí hoàn/trả')
  if (warn.includes('finance_return_refund')) chips.push('Payment API đã trừ hoàn tiền')
  if (warn.includes('cogs_released_return_refund')) chips.push('Không trừ vốn lần hai')
  if (String(row.ads_allocation_method || '').includes('no_matching_sku')) chips.push('Ads chưa khớp SKU')
  return chips.length ? chips : ['Cần kiểm tra phí và giá vốn']
}

function oaSetStatus(message, tone = '') {
  const el = oaEl('orderAnalyticsStatus')
  if (!el) return
  el.textContent = message
  el.className = `netprofit-status ${tone}`.trim()
}

function oaBuildUrl(options = {}) {
  const params = new URLSearchParams((getFilterParams() || '').replace(/^\?/, ''))
  params.set('limit', options.limit || 120)
  if (options.rebuild) params.set('rebuild', '1')
  if (options.syncPayment) params.set('sync_payment', '1')
  return `${API}/api/order-analytics?${params.toString()}`
}

async function oaFetchJson(options = {}) {
  const res = await fetch(oaBuildUrl(options))
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(data.message || data.error || `HTTP ${res.status}`)
  return data
}

function renderOrderAnalyticsKpis(data) {
  const box = oaEl('orderAnalyticsKpis')
  if (!box) return
  const s = data.summary || {}
  const cards = [
    ['Đơn đối soát', Number(s.total_orders || 0).toLocaleString('vi-VN'), `${Number(s.payment_api_orders || 0)} đơn có Payment API`],
    ['Thực nhận', oaShort(s.actual_income), 'Từ Payment/Escrow hoặc ước tính có nhãn'],
    ['CPO trung bình', oaMoney(s.avg_cpo), `CPO cao nhất ${oaMoney(s.max_cpo)}`],
    ['Ads API phân bổ', oaShort(s.ads_cost_allocated), `${Number(s.ads_allocated_orders || 0)} đơn có spend Ads thật`],
    ['Hoàn tiền', oaShort(s.refund_deduction), `${Number(s.returned_orders || 0)} đơn Returns CLOSED`],
    ['Lãi ròng', oaShort(s.net_profit), `${Number(s.loss_orders || 0)} đơn đang âm`]
  ]
  box.innerHTML = cards.map(([label, value, sub]) => `
    <div class="netprofit-kpi ${label === 'Lãi ròng' && Number(s.net_profit || 0) < 0 ? 'danger' : ''}">
      <span>${oaEscape(label)}</span>
      <strong>${oaEscape(value)}</strong>
      <small>${oaEscape(sub)}</small>
    </div>
  `).join('')
}

function renderOrderAnalyticsLoss(rows) {
  const lossRows = (rows || []).filter(row => Number(row.net_profit || 0) < 0).slice(0, 8)
  const box = oaEl('orderAnalyticsLossBox')
  const summary = oaEl('orderAnalyticsLossSummary')
  if (summary) summary.textContent = `${lossRows.length} đơn hiển thị`
  if (!box) return
  if (!lossRows.length) {
    box.innerHTML = '<div class="netprofit-empty">Không có đơn âm trong bộ lọc hiện tại.</div>'
    return
  }
  box.innerHTML = lossRows.map(row => `
    <div class="netprofit-loss-row">
      <div>
        <b>${oaEscape(row.order_sn)}</b>
        <span>${oaEscape(row.shop)} · CPO ${oaMoney(row.ads_cpo || row.ads_cost_allocated)} · ${oaEscape(row.order_date)}</span>
      </div>
      <strong>${oaMoney(row.net_profit)}</strong>
    </div>
  `).join('')
}

function renderOrderAnalyticsTopSkus(data) {
  const rows = data.top_skus || []
  const lossRows = data.loss_order_items || []
  const box = oaEl('orderAnalyticsTopSku')
  const summary = oaEl('orderAnalyticsTopSkuSummary')
  const lossOrderCount = new Set(lossRows.map(row => row.order_sn).filter(Boolean)).size
  if (summary) summary.textContent = `${rows.length} SKU · ${lossOrderCount} đơn âm`
  if (!box) return
  if (!orderAnalyticsState.skuTab) orderAnalyticsState.skuTab = lossRows.length ? 'loss' : 'sku'
  const active = ['sku', 'loss', 'overview'].includes(orderAnalyticsState.skuTab) ? orderAnalyticsState.skuTab : 'sku'
  const tabs = `
    <div class="netprofit-subtabs" role="tablist" aria-label="Tách chức năng Top SKU">
      <button type="button" class="${active === 'sku' ? 'active' : ''}" onclick="switchOrderAnalyticsSkuTab('sku')">SKU cần xử lý <b>${rows.length}</b></button>
      <button type="button" class="${active === 'loss' ? 'active' : ''}" onclick="switchOrderAnalyticsSkuTab('loss')">Đơn âm tiền <b>${lossOrderCount}</b></button>
      <button type="button" class="${active === 'overview' ? 'active' : ''}" onclick="switchOrderAnalyticsSkuTab('overview')">Tổng quan phí/vốn</button>
    </div>
  `
  const renderSkuRows = () => {
    if (!rows.length) return '<div class="netprofit-empty">Chưa có SKU để phân tích.</div>'
    return rows.slice(0, 12).map(row => `
      <div class="netprofit-sku-row rich">
        ${oaImage(row)}
        <div class="netprofit-row-copy">
          <b>${oaEscape(row.sku)}</b>
          <span>${oaEscape(row.product_name || 'Chưa có tên sản phẩm')}</span>
          <small>${oaEscape(oaAdsStatusLabel(row.ads_status))}</small>
        </div>
        <div class="netprofit-row-metrics">
          <strong class="${Number(row.net_profit || 0) < 0 ? 'danger-text' : ''}">${oaMoney(row.net_profit)}</strong>
          <span>${Number(row.orders || 0)} đơn · ${Number(row.loss_orders || 0)} đơn âm</span>
          <span>DT ${oaMoney(row.revenue)} · Vốn ${oaMoney(row.cost_real)} · CPO ${oaMoney(row.cpo)}</span>
        </div>
      </div>
    `).join('')
  }
  const renderLossRows = () => {
    if (!lossRows.length) return '<div class="netprofit-empty">Không có đơn âm tiền trong bộ lọc hiện tại.</div>'
    return lossRows.slice(0, 30).map(row => `
      <div class="netprofit-loss-item-row">
        ${oaImage(row)}
        <div class="netprofit-row-copy">
          <b>${oaEscape(row.product_name || 'Chưa có tên sản phẩm')}</b>
          <span>${oaEscape(row.sku || 'Chưa có SKU')} · ${oaEscape(row.order_sn || '')}</span>
          <small>${oaEscape(row.shop || '')} · ${oaEscape(row.order_date || '')} · ${oaEscape(oaSourceLabel(row.actual_income_source))}</small>
          <div class="netprofit-chip-list">
            ${oaLossReasonChips(row).map(label => `<em>${oaEscape(label)}</em>`).join('')}
          </div>
        </div>
        <div class="netprofit-row-metrics">
          <strong class="danger-text">${oaMoney(row.item_net_profit || row.net_profit)}</strong>
          <span>SL ${Number(row.qty || 0).toLocaleString('vi-VN')} · DT dòng ${oaMoney(row.revenue_line)}</span>
          <span>Vốn ${oaMoney(row.cost_real)} · CPO ${oaMoney(row.item_ads_cost)} · Hoàn ${oaMoney(row.item_refund)}</span>
          <span>Lãi đơn ${oaMoney(row.net_profit)}</span>
        </div>
      </div>
    `).join('')
  }
  const renderOverview = () => {
    const lossSkuCount = new Set(lossRows.map(row => row.sku).filter(Boolean)).size
    const stats = [
      ['SKU đang phân tích', rows.length.toLocaleString('vi-VN'), 'Top SKU theo lãi ròng thấp nhất'],
      ['SKU có đơn âm', lossSkuCount.toLocaleString('vi-VN'), 'Đếm từ dòng hàng âm tiền'],
      ['Dòng đơn âm', lossRows.length.toLocaleString('vi-VN'), `${lossOrderCount.toLocaleString('vi-VN')} đơn riêng`],
      ['Tổng âm dòng hàng', oaMoney(oaSum(lossRows, 'item_net_profit')), 'Phân bổ theo tỉ lệ doanh thu dòng'],
      ['Giá vốn Top SKU', oaMoney(oaSum(rows, 'cost_real')), 'Đọc từ cost_real nội bộ'],
      ['CPO Top SKU', oaMoney(oaSum(rows, 'ads_cost')), 'Chỉ lấy Ads API thật đã phân bổ']
    ]
    return `
      <div class="netprofit-mini-grid">
        ${stats.map(([label, value, note]) => `
          <div>
            <span>${oaEscape(label)}</span>
            <b>${oaEscape(value)}</b>
            <small>${oaEscape(note)}</small>
          </div>
        `).join('')}
      </div>
      <div class="netprofit-source-note">Dữ liệu âm tiền lấy từ order_analytics và order_items, không dùng cost setting làm số chuẩn nếu đơn đã có Payment/Finance API.</div>
    `
  }
  const body = active === 'loss' ? renderLossRows() : active === 'overview' ? renderOverview() : renderSkuRows()
  box.innerHTML = `${tabs}<div class="netprofit-tab-body">${body}</div>`
}

window.switchOrderAnalyticsSkuTab = function(tab) {
  orderAnalyticsState.skuTab = tab
  if (orderAnalyticsState.data) renderOrderAnalyticsTopSkus(orderAnalyticsState.data)
}

function renderOrderAnalyticsTable(rows) {
  const table = oaEl('orderAnalyticsTable')
  const summary = oaEl('orderAnalyticsTableSummary')
  if (summary) summary.textContent = `${rows.length} dòng`
  if (!table) return
  if (!rows.length) {
    table.innerHTML = '<tr><td colspan="11" class="netprofit-empty">Không có dữ liệu trong bộ lọc.</td></tr>'
    return
  }
  table.innerHTML = rows.map(row => {
    const warn = String(row.warning || '')
    const isLoss = Number(row.net_profit || 0) < 0
    const note = [
      oaAdsLabel(row.ads_allocation_method),
      oaCpoBasisLabel(row.ads_cpo_basis),
      warn.includes('payment_api_missing') ? 'chưa có Payment API' : '',
      warn.includes('return_closed') ? 'đã có hoàn tiền' : '',
      warn.includes('finance_return_refund') ? 'Payment/Escrow đã trừ hoàn' : '',
      warn.includes('cogs_released_return_refund') ? 'không trừ vốn lần hai' : ''
    ].filter(Boolean).join(' · ')
    return `
      <tr class="${isLoss ? 'is-loss' : ''}">
        <td>${oaEscape(row.order_date || '')}</td>
        <td>${oaEscape(row.shop || '')}</td>
        <td><b>${oaEscape(row.order_sn || '')}</b></td>
        <td>${oaEscape(oaSourceLabel(row.actual_income_source))}</td>
        <td style="text-align:right">${oaMoney(row.actual_income)}</td>
        <td style="text-align:right">${oaMoney(row.cost_of_goods)}</td>
        <td style="text-align:right">${oaMoney(row.ads_cpo || row.ads_cost_allocated)}<small>${Number(row.ads_cpo_denominator || 0)} đơn chia</small></td>
        <td style="text-align:right">${oaMoney(row.refund_deduction)}</td>
        <td style="text-align:right"><b>${oaMoney(row.net_profit)}</b><small>${oaPct(row.margin_pct)}</small></td>
        <td>${oaEscape(oaOrderStatusLabel(row.return_status || row.shipping_status || row.oms_status || ''))}</td>
        <td>${oaEscape(note)}</td>
      </tr>
    `
  }).join('')
}

function renderOrderAnalyticsSource(data) {
  const el = oaEl('orderAnalyticsSource')
  if (!el) return
  const src = data.source || {}
  const rebuild = data.rebuild || {}
  const financeCore = data.finance_core || {}
  const financeSummary = financeCore.summary || {}
  // Dòng này giúp vận hành biết bảng lãi đang đọc từ core tài chính, không phải số ước tính rải rác ở từng màn hình.
  const financeCoreText = financeCore.mode
    ? `Order finance core: ${Number(financeSummary.orders || 0).toLocaleString('vi-VN')} đơn, lãi ròng ${oaMoney(financeSummary.net_profit)}, snapshot D1 ${Number(financeSummary.daily_snapshots || 0).toLocaleString('vi-VN')}.`
    : 'Order finance core: chưa có dữ liệu.'
  el.innerHTML = `
    <div><b>Payment:</b> ${oaEscape(src.payment_actual || '')}</div>
    <div><b>Ads/CPO:</b> ${oaEscape(src.ads || '')}</div>
    <div><b>Returns:</b> ${oaEscape(src.returns || '')}</div>
    <div><b>Giá vốn:</b> ${oaEscape(src.cogs || '')}</div>
    <div><b>Core tài chính:</b> ${oaEscape(financeCoreText)}</div>
    <div><b>Lần tính gần nhất:</b> ${rebuild.saved !== undefined ? `${Number(rebuild.saved || 0)} đơn, Ads daily ${Number(rebuild.real_ads_snapshots?.daily || 0)}, hourly ${Number(rebuild.real_ads_snapshots?.hourly || 0)}` : 'đọc từ bảng order_analytics'}</div>
  `
}

function renderOrderAnalytics(data) {
  orderAnalyticsState.data = data
  orderAnalyticsState.rows = data.rows || []
  renderOrderAnalyticsKpis(data)
  renderOrderAnalyticsLoss(orderAnalyticsState.rows)
  renderOrderAnalyticsTopSkus(data)
  renderOrderAnalyticsTable(orderAnalyticsState.rows)
  renderOrderAnalyticsSource(data)
}

window.loadOrderAnalytics = async function(options = {}) {
  if (orderAnalyticsState.loading) return
  orderAnalyticsState.loading = true
  oaSetStatus(options.syncPayment ? 'Đang đồng bộ Payment/Escrow API và tính lại lãi ròng...' : options.rebuild ? 'Đang tính lại bảng lãi ròng và CPO...' : 'Đang tải bảng lãi ròng...')
  try {
    const data = await oaFetchJson(options)
    renderOrderAnalytics(data)
    const s = data.summary || {}
    oaSetStatus(`Đã tải ${Number(s.total_orders || 0)} đơn. Payment API: ${Number(s.payment_api_orders || 0)} đơn. Escrow: ${Number(s.escrow_orders || 0)} đơn. Ads API thật: ${Number(s.ads_allocated_orders || 0)} đơn. CPO TB: ${oaMoney(s.avg_cpo)}.`, 'ok')
  } catch (error) {
    oaSetStatus(`Không tải được lãi ròng: ${error.message}`, 'error')
  } finally {
    orderAnalyticsState.loading = false
  }
}

window.rebuildOrderAnalytics = function() {
  return loadOrderAnalytics({ rebuild: true })
}

window.syncPaymentAndRebuildAnalytics = function() {
  return loadOrderAnalytics({ rebuild: true, syncPayment: true })
}

window.exportOrderAnalyticsCsv = function() {
  const rows = orderAnalyticsState.rows || []
  if (!rows.length) {
    alert('Chưa có dữ liệu để xuất.')
    return
  }
  const header = ['Ngày','Sàn','Shop','Mã đơn','Nguồn tiền','Thực nhận','Giá vốn','CPO Ads API','Hoàn tiền','Lãi ròng','Biên lãi','Trạng thái','Ghi chú']
  const body = rows.map(row => [
    row.order_date,
    row.platform,
    row.shop,
    row.order_sn,
    oaSourceLabel(row.actual_income_source),
    row.actual_income,
    row.cost_of_goods,
    row.ads_cpo || row.ads_cost_allocated,
    row.refund_deduction,
    row.net_profit,
    row.margin_pct,
    oaOrderStatusLabel(row.return_status || row.shipping_status || row.oms_status),
    `${oaAdsLabel(row.ads_allocation_method)} - ${oaCpoBasisLabel(row.ads_cpo_basis)}`
  ])
  const csv = [header, ...body].map(line => line.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'order_analytics_net_profit_cpo.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
