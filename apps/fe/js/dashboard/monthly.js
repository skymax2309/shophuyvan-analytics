// Doanh thu năm được chốt theo report_month, không dùng cột ngày lẻ để tránh hiểu nhầm với tab doanh thu ngày.
const MONTHLY_AD_REPORT_TYPES = new Set([
  'phi-dau-thau',
  'ads',
  'ad',
  'ads_fee',
  'marketing',
  'quang-cao'
])

function monthlyNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function monthlyClean(value) {
  return String(value ?? '').trim()
}

function monthlyMoney(value) {
  const rounded = Math.round(monthlyNumber(value))
  if (typeof fmt === 'function') return fmt(rounded)
  return rounded.toLocaleString('vi-VN') + ' đ'
}

function monthlyShort(value) {
  if (typeof fmtShort === 'function') return fmtShort(value)
  const number = monthlyNumber(value)
  if (Math.abs(number) >= 1e9) return `${(number / 1e9).toFixed(1)} tỷ`
  if (Math.abs(number) >= 1e6) return `${(number / 1e6).toFixed(1)} tr`
  if (Math.abs(number) >= 1e3) return `${(number / 1e3).toFixed(0)}k`
  return number.toLocaleString('vi-VN')
}

function monthlyEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

function monthlyPercent(part, total) {
  const base = monthlyNumber(total)
  return base ? `${(monthlyNumber(part) / base * 100).toFixed(1)}%` : '0.0%'
}

function monthlyReportType(row = {}) {
  return monthlyClean(row.report_type || row.type || 'income').toLowerCase()
}

function isMonthlyAdsReport(row = {}) {
  const type = monthlyReportType(row)
  return MONTHLY_AD_REPORT_TYPES.has(type) || type.includes('dau-thau') || type.includes('ads') || type.includes('quảng cáo')
}

function monthlySelectedShopCount() {
  const raw = monthlyClean(document.getElementById('filterShop')?.value)
  return raw ? raw.split(',').map(item => item.trim()).filter(Boolean).length : 0
}

function monthlyEnsureYearRange() {
  const fromInput = document.getElementById('filterFrom')
  const toInput = document.getElementById('filterTo')
  if (!fromInput || !toInput) return new Date().getFullYear()
  const year = Number((fromInput.value || toInput.value || '').slice(0, 4)) || new Date().getFullYear()
  // Tab này là báo cáo năm nên ép range về nguyên năm để không lẫn với báo cáo ngày.
  fromInput.value = `${year}-01-01`
  toInput.value = `${year}-12-31`
  return year
}

function monthlyBuildGroupKey(row = {}) {
  const month = monthlyClean(row.report_month || 'Chưa rõ tháng')
  const platform = monthlyClean(row.platform || 'unknown').toLowerCase()
  const shop = monthlyClean(row.shop || 'Chưa rõ shop')
  return `${month}|${platform}|${shop}`
}

function monthlyEmpty(kpiGrid, tableBody, message) {
  if (kpiGrid) {
    kpiGrid.innerHTML = `<div class="monthly-empty">${monthlyEscape(message)}</div>`
  }
  if (tableBody) {
    tableBody.innerHTML = `<tr><td colspan="11" class="monthly-empty-cell">${monthlyEscape(message)}</td></tr>`
  }
}

function monthlyCard(label, value, sub, tone = '') {
  return `
    <div class="monthly-kpi-card ${tone}">
      <span>${monthlyEscape(label)}</span>
      <strong>${monthlyEscape(value)}</strong>
      <small>${monthlyEscape(sub)}</small>
    </div>
  `
}

function monthlyBuildRows(reports = [], options = {}) {
  const groups = new Map()
  let totalStandaloneAds = 0

  for (const row of reports) {
    const key = monthlyBuildGroupKey(row)
    if (!groups.has(key)) {
      groups.set(key, {
        month: monthlyClean(row.report_month || 'Chưa rõ tháng'),
        platform: monthlyClean(row.platform || 'unknown'),
        shop: monthlyClean(row.shop || 'Chưa rõ shop'),
        revenue: 0,
        payout: 0,
        fee: 0,
        ads: 0,
        standaloneAds: 0,
        refund: 0,
        tax: 0
      })
    }

    const group = groups.get(key)
    const reportType = monthlyReportType(row)
    const isIncome = reportType === 'income' || !reportType
    const isAds = isMonthlyAdsReport(row)

    if (isIncome) {
      const feeAds = Math.abs(monthlyNumber(row.fee_ads || row.ads_fee))
      group.revenue += monthlyNumber(row.gross_revenue || row.net_product_revenue || row.revenue)
      group.payout += monthlyNumber(row.total_payout || row.profit)
      group.fee += Math.max(0, monthlyNumber(row.fee_total || row.total_fee) - feeAds)
      group.ads += feeAds
      group.refund += Math.abs(monthlyNumber(row.refund_amount))
      group.tax += Math.abs(monthlyNumber(row.tax_total))
    } else if (isAds) {
      const adsCost = Math.abs(monthlyNumber(row.fee_total || row.total_fee || row.fee_ads || row.ads_fee))
      group.ads += adsCost
      group.standaloneAds += adsCost
      totalStandaloneAds += adsCost
    }
  }

  const rows = [...groups.values()].filter(row => row.revenue || row.payout || row.fee || row.ads || row.refund || row.tax)
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const totalPayout = rows.reduce((sum, row) => sum + row.payout, 0)
  const totalFee = rows.reduce((sum, row) => sum + row.fee, 0)
  const totalAds = rows.reduce((sum, row) => sum + row.ads, 0)
  const totalRefund = rows.reduce((sum, row) => sum + row.refund, 0)
  const totalTaxReport = rows.reduce((sum, row) => sum + row.tax, 0)
  const costReal = monthlyNumber(options.costReal)
  const opTotal = monthlyNumber(options.opTotal)
  const taxFlat = totalRevenue * 0.015

  for (const row of rows) {
    const ratio = totalRevenue > 0 ? row.revenue / totalRevenue : (rows.length ? 1 / rows.length : 0)
    row.costAllocated = costReal * ratio
    row.operationAllocated = opTotal * ratio
    row.taxFlat = taxFlat * ratio
    row.netProfit = row.payout - row.standaloneAds - row.costAllocated - row.operationAllocated - row.taxFlat
  }

  return {
    rows: rows.sort((a, b) => b.month.localeCompare(a.month) || a.platform.localeCompare(b.platform) || a.shop.localeCompare(b.shop)),
    summary: {
      totalRevenue,
      totalPayout,
      totalFee,
      totalAds,
      totalStandaloneAds,
      totalRefund,
      totalTaxReport,
      costReal,
      opTotal,
      taxFlat,
      netProfit: totalPayout - totalStandaloneAds - costReal - opTotal - taxFlat
    }
  }
}

function renderMonthlyKpis(kpiGrid, summary, meta) {
  if (!kpiGrid) return
  const selectedShopText = meta.selectedShopCount ? `Đã chọn ${meta.selectedShopCount} shop` : 'Tất cả shop'
  kpiGrid.innerHTML = `
    <div class="monthly-kpi-grid">
      ${monthlyCard('Doanh thu chốt năm', monthlyMoney(summary.totalRevenue), `${meta.yearLabel} · ${selectedShopText}`, 'blue')}
      ${monthlyCard('Tiền sàn thanh toán', monthlyMoney(summary.totalPayout), 'Tổng total_payout từ file đối soát', 'green')}
      ${monthlyCard('Khấu trừ sàn', monthlyMoney(summary.totalFee), `Không gồm ADS · ${monthlyPercent(summary.totalFee, summary.totalRevenue)}`, 'orange')}
      ${monthlyCard('Chi phí ADS', monthlyMoney(summary.totalAds), `Trong income + file phí đấu thầu`, 'red')}
      ${monthlyCard('Hoàn / refund', monthlyMoney(summary.totalRefund), 'Số tiền hoàn trong file sàn', 'amber')}
      ${monthlyCard('Vốn + vận hành + thuế', monthlyMoney(summary.costReal + summary.opTotal + summary.taxFlat), `Vốn ${monthlyShort(summary.costReal)} · VH ${monthlyShort(summary.opTotal)} · Thuế ${monthlyShort(summary.taxFlat)}`, 'slate')}
      ${monthlyCard('Lãi bỏ túi năm', monthlyMoney(summary.netProfit), 'Payout - ADS riêng - vốn - vận hành - thuế 1.5%', summary.netProfit >= 0 ? 'green' : 'red')}
    </div>
  `
}

function renderMonthlyTable(tableBody, rows) {
  if (!tableBody) return
  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="11" class="monthly-empty-cell">Chưa có dữ liệu theo tháng/năm hiện tại.</td></tr>'
    return
  }
  tableBody.innerHTML = rows.map(row => `
    <tr>
      <td><b>${monthlyEscape(row.month)}</b></td>
      <td>
        <div class="monthly-platform">${monthlyEscape(row.platform || 'unknown')}</div>
        <div class="monthly-shop">${monthlyEscape(row.shop || 'Chưa rõ shop')}</div>
      </td>
      <td class="num"><b>${monthlyMoney(row.revenue)}</b></td>
      <td class="num">${monthlyMoney(row.payout)}</td>
      <td class="num danger">${monthlyMoney(row.fee)}</td>
      <td class="num danger">${monthlyMoney(row.ads)}</td>
      <td class="num danger">${monthlyMoney(row.refund)}</td>
      <td class="num">${monthlyMoney(row.costAllocated)}</td>
      <td class="num">${monthlyMoney(row.operationAllocated)}</td>
      <td class="num">${monthlyMoney(row.taxFlat)}</td>
      <td class="num ${row.netProfit >= 0 ? 'profit-pos' : 'profit-neg'}"><b>${monthlyMoney(row.netProfit)}</b></td>
    </tr>
  `).join('')
}

function renderMonthlyCharts(rows) {
  const monthMap = new Map()
  for (const row of rows) {
    if (!monthMap.has(row.month)) {
      monthMap.set(row.month, { revenue: 0, payout: 0, fee: 0, ads: 0, netProfit: 0 })
    }
    const item = monthMap.get(row.month)
    item.revenue += row.revenue
    item.payout += row.payout
    item.fee += row.fee
    item.ads += row.ads
    item.netProfit += row.netProfit
  }
  const months = [...monthMap.keys()].sort()
  if (typeof makeChart !== 'function') return
  makeChart('chartMonthlyRevenue', 'bar', months, [
    { label: 'Doanh thu chốt', data: months.map(month => monthMap.get(month).revenue), backgroundColor: '#2563eb' },
    { label: 'Khấu trừ + ADS', data: months.map(month => monthMap.get(month).fee + monthMap.get(month).ads), backgroundColor: '#ef4444' }
  ], { legend: true })
  makeChart('chartMonthlyProfit', 'line', months, [
    { label: 'Lãi bỏ túi', data: months.map(month => monthMap.get(month).netProfit), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.12)', fill: true, tension: 0.3 },
    { label: 'Tiền sàn thanh toán', data: months.map(month => monthMap.get(month).payout), borderColor: '#6366f1', backgroundColor: 'transparent', fill: false, tension: 0.3 }
  ], { legend: true })
}

window.loadMonthly = async function() {
  const kpiGrid = document.getElementById('kpiGridMonthly')
  const tableBody = document.getElementById('tableMonthlySettlement')
  const year = monthlyEnsureYearRange()

  try {
    if (kpiGrid) kpiGrid.innerHTML = '<div class="loading">Đang tải doanh thu năm theo tháng...</div>'
    const qs = typeof getFilterParams === 'function' ? getFilterParams() : ''
    const [reports, dash, opData] = await Promise.all([
      fetch(API + '/api/reports' + qs).then(r => r.json()).catch(() => []),
      fetch(API + '/api/dashboard' + qs).then(r => r.json()).catch(() => ({})),
      fetch(API + '/api/operation-costs' + qs).then(r => r.json()).catch(() => [])
    ])

    if (!Array.isArray(reports) || !reports.length) {
      monthlyEmpty(kpiGrid, tableBody, 'Chưa có dữ liệu đối soát theo năm/tháng này. Hãy tải file đối soát hoặc chọn lại năm/shop.')
      return
    }

    const opCosts = Array.isArray(opData) ? opData : (Array.isArray(opData?.costs) ? opData.costs : [])
    const data = monthlyBuildRows(reports, {
      costReal: dash.total_cost_real || 0,
      opTotal: opCosts.reduce((sum, row) => sum + monthlyNumber(row.actual_amount), 0)
    })

    renderMonthlyKpis(kpiGrid, data.summary, {
      yearLabel: `${year}`,
      selectedShopCount: monthlySelectedShopCount()
    })
    renderMonthlyTable(tableBody, data.rows)
    renderMonthlyCharts(data.rows)
  } catch (err) {
    console.error('Lỗi loadMonthly:', err)
    if (kpiGrid) kpiGrid.innerHTML = `<div class="monthly-empty error">Lỗi tải doanh thu năm: ${monthlyEscape(err.message)}</div>`
  }
}
