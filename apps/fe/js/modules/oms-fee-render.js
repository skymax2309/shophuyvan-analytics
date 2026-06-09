import { fmt } from '../utils/helpers.js';

export const toMoneyNumber = value => {
  const raw = value && typeof value === 'object' && 'value' in value ? value.value : value
  const n = Number(raw ?? 0)
  return Number.isFinite(n) ? n : 0
}

const toNullableMoneyNumber = value => {
  const raw = value && typeof value === 'object' && 'value' in value ? value.value : value
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const firstNullableMoney = (...values) => {
  for (const value of values) {
    const n = toNullableMoneyNumber(value)
    if (n !== null) return n
  }
  return null
}

const fmtFeeRate = (amount, revenueBase) => {
  const fee = Math.abs(toMoneyNumber(amount))
  const base = Math.abs(toMoneyNumber(revenueBase))
  if (!base || !fee) return fee ? '—' : '0%'
  const rate = (fee / base) * 100
  return `${rate.toLocaleString('vi-VN', { minimumFractionDigits: rate < 1 ? 2 : 1, maximumFractionDigits: 2 })}%`
}

export const renderFeeRow = (label, amount, revenueBase, extraStyle = '') => {
  const fee = toMoneyNumber(amount)
  return `
    <div class="fee-detail-row" style="display:grid;grid-template-columns:minmax(116px,1fr) 58px 76px;gap:10px;align-items:center;${extraStyle}">
      <span>${label}</span>
      <span style="text-align:right;color:var(--muted);font-variant-numeric:tabular-nums">${fmtFeeRate(fee, revenueBase)}</span>
      <b style="text-align:right;font-variant-numeric:tabular-nums">${fmt(fee)}</b>
    </div>`
}

const feeSourceInfo = order => {
  const source = String(order?.fee_source || '').trim()
  const isReal = Number(order?.fee_is_real || 0) === 1 || /api|get_escrow|order\.items|report|fee_details/i.test(source)
  if (isReal) {
    const label = source.includes('get_escrow_detail')
      ? 'Phí thật từ Shopee Payment API'
      : source.includes('lazada')
        ? 'Phí thật từ Lazada API'
        : 'Phí thật từ dữ liệu API/báo cáo'
    return { isReal: true, label, source }
  }
  return {
    isReal: false,
    label: 'Tạm tính từ cấu hình',
    source: source || 'Chưa có dòng phí API'
  }
}

export const feeSourceInfoV2 = order => {
  const breakdown = order?.fee_breakdown
  if (breakdown?.badge_text) {
    const tone = String(breakdown.badge_tone || 'estimate').trim()
    const palette = tone === 'api'
      ? { color: 'var(--green)', bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.25)' }
      : tone === 'mixed'
        ? { color: 'var(--teal)', bg: 'rgba(20,184,166,.12)', border: 'rgba(20,184,166,.25)' }
        : { color: 'var(--orange)', bg: 'rgba(249,115,22,.12)', border: 'rgba(249,115,22,.25)' }
    return {
      isReal: tone === 'api',
      label: breakdown.badge_text,
      note: String(breakdown.note || '').trim(),
      source: String(order?.fee_source || '').trim(),
      palette
    }
  }

  const fallback = feeSourceInfo(order)
  return {
    ...fallback,
    note: fallback.note || '',
    palette: fallback.palette || { color: fallback.isReal ? 'var(--green)' : 'var(--orange)', bg: fallback.isReal ? 'rgba(34,197,94,.12)' : 'rgba(249,115,22,.12)', border: fallback.isReal ? 'rgba(34,197,94,.25)' : 'rgba(249,115,22,.25)' }
  }
}

const renderFeeGroup = (group, revenueBase) => {
  if (!group?.rows?.length) return ''
  const rowsHtml = group.rows.map(row => renderFeeRow(row.label, row.amount, revenueBase)).join('')
  return `
    <div style="margin-bottom:8px;padding:8px 9px;border-radius:8px;border:1px dashed var(--border);background:rgba(255,255,255,.02);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <b style="font-size:11px;color:var(--text)">${group.label}</b>
        <span style="font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums">${fmt(group.total || 0)}</span>
      </div>
      ${rowsHtml}
    </div>
  `
}

const renderFeeComparisonRow = (row, revenueBase) => {
  const hasAmount = row?.amount !== null && row?.amount !== undefined && row?.amount !== ''
  const amount = hasAmount ? toMoneyNumber(row.amount) : null
  const source = String(row?.source || '').trim()
  const palette = source === 'api'
    ? { text: 'API', color: 'var(--green)', bg: 'rgba(34,197,94,.12)' }
    : source === 'order'
      ? { text: 'Đơn hàng', color: 'var(--teal)', bg: 'rgba(20,184,166,.12)' }
      : { text: 'Chưa có', color: 'var(--orange)', bg: 'rgba(249,115,22,.12)' }
  return `
    <div style="padding:5px 0;border-top:1px dashed rgba(148,163,184,.16);">
      <div class="fee-detail-row" style="display:grid;grid-template-columns:minmax(126px,1fr) 64px 78px;gap:10px;align-items:center;">
        <span>
          ${row.label || 'Đối soát API'}
          <small style="margin-left:5px;padding:1px 5px;border-radius:999px;color:${palette.color};background:${palette.bg};font-size:10px;">${palette.text}</small>
        </span>
        <span style="text-align:right;color:var(--muted);font-variant-numeric:tabular-nums">${hasAmount ? fmtFeeRate(amount, revenueBase) : '—'}</span>
        <b style="text-align:right;font-variant-numeric:tabular-nums">${hasAmount ? fmt(amount) : 'Chưa có'}</b>
      </div>
      ${row.note ? `<div style="margin-top:2px;font-size:10px;color:var(--muted);line-height:1.35;">${row.note}</div>` : ''}
    </div>`
}

export const buildLegacyFeeBreakdownHtml = (order, revenueBase) => {
  let html = ''
  html += renderFeeRow('Phí cố định:', order.fee_platform, revenueBase)
  html += renderFeeRow('Phí thanh toán:', order.fee_payment, revenueBase)
  html += renderFeeRow('Phí Affiliate/Freeship:', order.fee_affiliate, revenueBase)
  html += renderFeeRow('Phí Quảng cáo:', order.fee_ads, revenueBase)
  html += renderFeeRow('Phí Dịch vụ/Thuế:', order.fee_service, revenueBase)
  html += renderFeeRow('Phí PiShip:', order.fee_piship, revenueBase)
  html += renderFeeRow('Phí Đóng gói:', order.fee_packaging, revenueBase)
  html += renderFeeRow('Phí Nhân công:', order.fee_labor, revenueBase)
  if (toMoneyNumber(order.return_fee) > 0) {
    html += renderFeeRow('Phí Hoàn/Phạt:', order.return_fee, revenueBase, 'color:var(--red);')
  }
  return html
}

export const buildPhase1FeeBreakdownHtml = (order, revenueBase) => {
  const breakdown = order?.fee_breakdown
  const groups = Array.isArray(breakdown?.groups) ? breakdown.groups : []
  const sections = groups.map(group => renderFeeGroup(group, revenueBase)).filter(Boolean).join('')
  const comparisons = Array.isArray(breakdown?.comparisons) ? breakdown.comparisons : []
  const comparisonRows = comparisons.map(row => renderFeeComparisonRow(row, revenueBase)).filter(Boolean).join('')
  if (!sections && !comparisonRows) return ''

  const totals = breakdown?.totals || {}
  const summaryRows = [
    ['Phí sàn từ API', totals.api_fee],
    ['Thuế/khấu trừ từ API', totals.api_tax],
    ['Chi phí nội bộ', totals.internal],
    ['Ước tính còn thiếu', totals.estimate]
  ]
    .filter(([, amount]) => toMoneyNumber(amount) > 0)
    .map(([label, amount]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;">
        <span>${label}</span>
        <b style="font-variant-numeric:tabular-nums">${fmt(amount)}</b>
      </div>
    `)
    .join('')

  return `
    ${summaryRows ? `
      <div style="margin-bottom:8px;padding:8px 9px;border-radius:8px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.18);">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Tổng hợp nguồn phí</div>
        ${summaryRows}
      </div>
    ` : ''}
    ${comparisonRows ? `
      <div style="margin-bottom:8px;padding:8px 9px;border-radius:8px;border:1px solid rgba(20,184,166,.28);background:rgba(20,184,166,.08);">
        <div style="font-size:11px;color:var(--teal);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Đối soát giảm giá / TTLK / ADS</div>
        <div style="font-size:10px;color:var(--muted);line-height:1.35;margin-bottom:4px;">Hiển thị để so sánh nguồn API; không cộng trùng vào tổng phí nếu khoản đã nằm trong doanh thu hoặc phí sàn.</div>
        ${comparisonRows}
      </div>
    ` : ''}
    ${sections}
  `
}

const escapeFeeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch])

const getOmsFeePopupState = () => {
  if (typeof window === 'undefined') return { open: false, orderId: '' }
  if (!window.__SHV_OMS_FEE_POPUP_STATE) {
    window.__SHV_OMS_FEE_POPUP_STATE = { open: false, orderId: '' }
  }
  return window.__SHV_OMS_FEE_POPUP_STATE
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const escapeCssValue = value => {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return String(value || '').replace(/["\\]/g, '\\$&')
}

export const isOmsFeePopupOpen = orderId => {
  const state = getOmsFeePopupState()
  return Boolean(state.open && state.orderId === String(orderId || ''))
}

export const closeOmsFeePopup = () => {
  if (typeof document === 'undefined') return
  const state = getOmsFeePopupState()
  document.querySelectorAll('[data-oms-fee-panel]').forEach(panel => {
    panel.style.display = 'none'
  })
  document.querySelectorAll('[data-oms-fee-order]').forEach(trigger => {
    trigger.classList.remove('is-open')
  })
  state.open = false
  state.orderId = ''
}

export const syncOmsFeePopupAfterRender = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const state = getOmsFeePopupState()
  if (!state.open || !state.orderId) return
  // Khi bảng đang re-render, DOM tạm thời chưa có order nên không đóng popup vội.
  if (window.__SHV_OMS_FEE_RENDERING) return
  const trigger = document.querySelector(`[data-oms-fee-order="${escapeCssValue(state.orderId)}"]`)
  const panel = document.querySelector(`[data-oms-fee-panel="${escapeCssValue(state.orderId)}"]`)
  if (!trigger || !panel) {
    closeOmsFeePopup()
    return
  }

  document.querySelectorAll('[data-oms-fee-panel]').forEach(item => {
    if (item !== panel) item.style.display = 'none'
  })
  document.querySelectorAll('[data-oms-fee-order]').forEach(item => {
    item.classList.toggle('is-open', item === trigger)
  })

  panel.style.display = 'block'
  const triggerRect = trigger.getBoundingClientRect()
  const panelWidth = Math.min(Math.max(panel.offsetWidth || 320, 280), Math.max(280, window.innerWidth - 16))
  const panelHeight = Math.min(panel.offsetHeight || 360, Math.max(240, window.innerHeight - 16))
  const left = clamp(triggerRect.right - panelWidth, 8, Math.max(8, window.innerWidth - panelWidth - 8))
  const belowTop = triggerRect.bottom + 8
  const aboveTop = triggerRect.top - panelHeight - 8
  const top = belowTop + panelHeight <= window.innerHeight - 8
    ? belowTop
    : clamp(aboveTop, 8, Math.max(8, window.innerHeight - panelHeight - 8))

  panel.style.position = 'fixed'
  panel.style.left = `${Math.round(left)}px`
  panel.style.top = `${Math.round(top)}px`
  panel.style.right = 'auto'
  panel.style.maxWidth = 'calc(100vw - 16px)'
  panel.style.maxHeight = 'calc(100vh - 16px)'
}

export const toggleOmsFeePopup = (orderId, event) => {
  event?.stopPropagation?.()
  const state = getOmsFeePopupState()
  const id = String(orderId || '')
  if (state.open && state.orderId === id) {
    closeOmsFeePopup()
    return
  }
  state.open = true
  state.orderId = id
  requestAnimationFrame(syncOmsFeePopupAfterRender)
}

const feeGroupByKey = (order, key) => {
  const groups = Array.isArray(order?.fee_breakdown?.groups) ? order.fee_breakdown.groups : []
  return groups.find(group => String(group?.key || '') === key) || { rows: [], total: 0 }
}

const feeComparisonByCode = (order, code) => {
  const rows = Array.isArray(order?.fee_breakdown?.comparisons) ? order.fee_breakdown.comparisons : []
  return rows.find(row => String(row?.code || '') === code) || null
}

const feeComparisonAmount = (order, code, fallback = 0) => {
  const row = feeComparisonByCode(order, code)
  return row?.amount !== null && row?.amount !== undefined ? toMoneyNumber(row.amount) : toMoneyNumber(fallback)
}

const feePanelRow = (label, value, options = {}) => {
  const hasValue = value !== null && value !== undefined && value !== ''
  const amount = hasValue ? toMoneyNumber(value) : null
  const signed = options.sign === 'negative' && amount !== null ? -Math.abs(amount) : amount
  const showPercent = Boolean(options.basis || options.showPercent)
  const percentText = amount === null
    ? '—'
    : options.basis
      ? fmtFeeRate(amount, options.basis)
      : (options.percentText || '—')
  const cls = ['oms-finance-row']
  if (options.indent) cls.push('is-child')
  if (options.total) cls.push('is-total')
  if (options.tone) cls.push(`tone-${options.tone}`)
  return `
    <div class="${cls.join(' ')}">
      <span>${escapeFeeHtml(label)}${options.source ? `<small>${escapeFeeHtml(options.source)}</small>` : ''}</span>
      ${showPercent ? `<em>${percentText}</em>` : '<em></em>'}
      <b>${amount === null ? 'Chưa có dữ liệu' : fmt(signed)}</b>
    </div>
  `
}

const feePanelTextRow = (label, value, options = {}) => `
  <div class="oms-finance-row ${options.total ? 'is-total' : ''}">
    <span>${escapeFeeHtml(label)}</span>
    <em></em>
    <b>${escapeFeeHtml(value || 'Chưa có dữ liệu')}</b>
  </div>
`

const isExplicitFalse = value => value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false'

const estimatedIncomeSourceLabel = source => {
  const value = String(source || '').toLowerCase()
  if (value.includes('tiktok_seller_center_finance_transaction')) return 'Nguồn: TikTok Seller Center giao dịch quyết toán'
  if (value.includes('tiktok_estimated_fee')) return 'Nguồn: TikTok Seller Center đã quét, chờ settlement xác nhận'
  if (value.includes('cost_setting')) return 'Nguồn: cost setting / estimate'
  if (value.includes('lazada_finance_api')) return 'Nguồn: thiếu Lazada Finance API'
  if (value.includes('orders_v2')) return 'Nguồn: orders_v2 estimate'
  return 'Nguồn: estimate'
}

const renderRowsFromGroup = (group, options = {}) => {
  const rows = Array.isArray(group?.rows) ? group.rows : []
  if (!rows.length) return '<div class="oms-finance-empty">Chưa có dữ liệu.</div>'
  return rows.map(row => feePanelRow(row.label, row.amount, {
    sign: options.sign || 'negative',
    source: row.source ? String(row.source).toUpperCase() : '',
    indent: true,
    tone: options.tone,
    basis: options.basis,
    showPercent: true
  })).join('')
}

const renderGroupSummaryRows = (order, basis) => {
  const totals = order?.fee_breakdown?.totals || {}
  return [
    ['Điều chỉnh doanh thu không thuộc Phí sàn', totals.discounts],
    ['Phí sàn từ API', totals.api_fee],
    ['Thuế/khấu trừ từ API', totals.api_tax],
    ['Chi phí nội bộ', totals.internal],
    ['Ước tính còn thiếu', totals.estimate]
  ]
    .filter(([, amount]) => toMoneyNumber(amount) > 0)
    .map(([label, amount]) => feePanelRow(label, amount, { sign: 'negative', basis, showPercent: true }))
    .join('') || '<div class="oms-finance-empty">Chưa có dữ liệu tổng hợp.</div>'
}

const renderComparisonRows = (order, basis) => {
  const rows = Array.isArray(order?.fee_breakdown?.comparisons) ? order.fee_breakdown.comparisons : []
  if (!rows.length) return '<div class="oms-finance-empty">Chưa có dòng đối soát API.</div>'
  return rows.map(row => `
    <div class="oms-finance-source-row">
      <div>
        <b>${escapeFeeHtml(row.label || 'Đối soát')}</b>
        ${row.note ? `<span>${escapeFeeHtml(row.note)}</span>` : ''}
      </div>
      <em>${row.amount === null || row.amount === undefined ? '—' : fmtFeeRate(row.amount, basis)}</em>
      <strong>${row.amount === null || row.amount === undefined ? 'Chưa có' : fmt(row.amount)}</strong>
      <small>${escapeFeeHtml(String(row.source || '').toUpperCase() || 'N/A')}</small>
    </div>
  `).join('')
}

if (typeof window !== 'undefined' && !window.switchOmsFinanceTab) {
  window.switchOmsFinanceTab = (button, tab) => {
    const panel = button?.closest?.('.oms-fee-panel')
    if (!panel) return
    panel.querySelectorAll('[data-oms-finance-tab]').forEach(item => {
      item.classList.toggle('active', item.dataset.omsFinanceTab === tab)
    })
    panel.querySelectorAll('[data-oms-finance-panel]').forEach(item => {
      item.classList.toggle('active', item.dataset.omsFinancePanel === tab)
    })
  }
}

if (typeof window !== 'undefined' && !window.__SHV_OMS_FEE_POPUP_EVENTS) {
  window.__SHV_OMS_FEE_POPUP_EVENTS = true
  window.toggleOmsFeePopup = toggleOmsFeePopup
  window.closeOmsFeePopup = closeOmsFeePopup
  window.syncOmsFeePopupAfterRender = syncOmsFeePopupAfterRender
  document.addEventListener('click', event => {
    const target = event.target
    if (target?.closest?.('[data-oms-fee-order]') || target?.closest?.('[data-oms-fee-panel]')) return
    closeOmsFeePopup()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOmsFeePopup()
  })
  window.addEventListener('resize', syncOmsFeePopupAfterRender)
  window.addEventListener('scroll', syncOmsFeePopupAfterRender, true)
}

export const buildOrderFinanceTabsHtml = (order, revenueBase, options = {}) => {
  const breakdown = order?.fee_breakdown || {}
  const totals = breakdown.totals || {}
  const taxonomy = breakdown.taxonomy || {}
  const taxonomyFields = taxonomy.fields || {}
  const fieldAmount = key => firstNullableMoney(
    taxonomyFields[key],
    taxonomyFields[key]?.value,
    order?.[key],
    totals?.[key],
    taxonomy?.[key]
  )
  const technicalFinanceSource = String(order.fee_source || order.source_detail || taxonomy.finance_source || order.finance_source || '').trim()
  const isTiktokSellerCenterFinance = /tiktok_seller_center/i.test(technicalFinanceSource)
  const discountGroup = feeGroupByKey(order, 'discounts')
  const settlementGroup = feeGroupByKey(order, 'settlement_deduction')
  const apiFeeGroup = feeGroupByKey(order, 'api_fee')
  const apiTaxGroup = feeGroupByKey(order, 'api_tax')
  const internalGroup = feeGroupByKey(order, 'internal')
  const estimateGroupRaw = feeGroupByKey(order, 'estimate')
  const estimateGroup = isTiktokSellerCenterFinance ? { ...estimateGroupRaw, rows: [] } : estimateGroupRaw
  const shopDiscount = feeComparisonAmount(order, 'discount_shop', toMoneyNumber(order.discount_shop) + toMoneyNumber(order.discount_combo))
  const platformDiscount = toMoneyNumber(order.platform_voucher_total ?? totals.platform_voucher_total ?? order.discount_shopee)
  const platformFundedVoucher = toMoneyNumber(order.platform_funded_voucher_amount ?? totals.platform_funded_voucher_amount)
  const sellerCofundedVoucher = toMoneyNumber(order.seller_cofunded_voucher_amount ?? totals.seller_cofunded_voucher_amount)
  const buyerShippingPaid = fieldAmount('buyer_shipping_paid')
  const productAfterShopDiscount = fieldAmount('product_revenue_after_shop_discount') ?? toMoneyNumber(revenueBase)
  const buyerTotalPaid = toMoneyNumber(order.buyer_total_paid ?? totals.buyer_total_paid ?? revenueBase - platformDiscount)
  const productOriginal = fieldAmount('product_original_amount')
  const feeDisplayTotal = toMoneyNumber(options.feeDisplayTotal ?? order.fee_display_total ?? order.fee)
  const actualIncomeFlag = order.actual_income_available ?? totals.actual_income_available ?? breakdown.taxonomy?.actual_income_available
  const actualIncomeAvailable = !isExplicitFalse(actualIncomeFlag)
  const settlementAmount = firstNullableMoney(order.actual_income_settlement, totals.actual_income_settlement, order.fee_detail_settlement)
  const estimatedIncome = firstNullableMoney(order.estimated_income, totals.estimated_income, taxonomy.estimated_income)
  const estimatedSource = order.estimated_income_source ?? totals.estimated_income_source ?? breakdown.taxonomy?.estimated_income_source
  const estimatedSourceText = estimatedIncomeSourceLabel(estimatedSource)
  const netReceived = actualIncomeAvailable
    ? (settlementAmount ?? firstNullableMoney(order.actual_income, totals.actual_income) ?? (toMoneyNumber(revenueBase) - feeDisplayTotal))
    : 0
  const profitBasis = toMoneyNumber(order.profit_basis ?? totals.profit_basis ?? breakdown.taxonomy?.profit_basis ?? (actualIncomeAvailable ? netReceived : productAfterShopDiscount))
  const estimatedIncomeDisplay = estimatedIncome ?? profitBasis
  const profitLabel = actualIncomeAvailable ? 'Lãi thực' : 'Lãi tạm tính'
  const profitReal = toMoneyNumber(order.profit_real)
  const feeInfo = options.feeInfo || feeSourceInfoV2(order)
  const feeDelta = toMoneyNumber(options.feeDelta)
  const totalTax = toMoneyNumber(totals.api_tax) || toMoneyNumber(order.tax_flat) + toMoneyNumber(order.tax_income)
  const adsFee = toMoneyNumber(order.ads_fee_total ?? totals.ads_fee_total ?? order.fee_ads)
  const pishipFee = toMoneyNumber(order.piship_fee ?? totals.piship_fee ?? order.fee_piship)
  const sfrServiceFee = toMoneyNumber(order.sfr_service_fee ?? totals.sfr_service_fee ?? breakdown.taxonomy?.sfr_service_fee)
  const platformDeductionTotal = toMoneyNumber(order.platform_deduction_total ?? totals.platform_deduction_total ?? breakdown.taxonomy?.platform_deduction_total ?? feeDisplayTotal)
  const pishipLabel = isTiktokSellerCenterFinance
    ? 'PiShip'
    : (order.piship_fee_source_type === 'api' || totals.piship_fee_source_type === 'api'
      ? 'PiShip từ API Shopee'
      : 'PiShip / Cost setting')
  const opsOther = isTiktokSellerCenterFinance ? 0 : Math.max(0, toMoneyNumber(order.ops_cost_setting_total ?? totals.ops_cost_setting_total) - pishipFee)
  const percentBasisLabel = totals.percent_basis_label || 'Người mua thanh toán'

  return `
    <div class="oms-fee-panel-head">
      <div>
        <span>Bảng kê đơn hàng</span>
        <b>${escapeFeeHtml(order.order_id || '')}</b>
      </div>
      <small style="background:${feeInfo.palette.bg};color:${feeInfo.palette.color};border-color:${feeInfo.palette.border};">${escapeFeeHtml(feeInfo.label)}</small>
    </div>
    ${feeInfo.note ? `<div class="oms-fee-note" style="background:${feeInfo.palette.bg};border-color:${feeInfo.palette.border};color:${feeInfo.palette.color};">${escapeFeeHtml(feeInfo.note)}</div>` : ''}
    ${Math.abs(feeDelta) >= 1 ? `<div class="oms-fee-note muted">Chênh lệch so với dữ liệu cũ trong orders_v2: <b>${feeDelta >= 0 ? '+' : ''}${fmt(feeDelta)}</b>.</div>` : ''}
    <div class="oms-fee-note muted">% tính trên ${escapeFeeHtml(percentBasisLabel)}. Giảm giá shop tự cài chỉ dùng để giải thích giá, không nằm trong Tổng khấu trừ.</div>
    ${isTiktokSellerCenterFinance ? `<div class="oms-fee-note muted">Nguồn doanh thu TikTok: <b>TikTok Seller Center</b>. ${actualIncomeAvailable ? 'Thực nhận ví: <b>Đã có dữ liệu confirmed</b>.' : `Thực nhận dự kiến: <b>${fmt(estimatedIncomeDisplay)}</b>. ${escapeFeeHtml(estimatedSourceText)}. Sẽ cập nhật lại khi quét được settlement thật từ TikTok.`}</div>` : ''}
    <div class="oms-finance-tabs" role="tablist" aria-label="Nhóm số liệu đơn hàng">
      <button type="button" class="active" data-oms-finance-tab="customer" onclick="event.stopPropagation();switchOmsFinanceTab(this,'customer')">Khách thanh toán</button>
      <button type="button" data-oms-finance-tab="platform" onclick="event.stopPropagation();switchOmsFinanceTab(this,'platform')">Sàn thanh toán</button>
      <button type="button" data-oms-finance-tab="profit" onclick="event.stopPropagation();switchOmsFinanceTab(this,'profit')">Lợi nhuận</button>
      <button type="button" data-oms-finance-tab="source" onclick="event.stopPropagation();switchOmsFinanceTab(this,'source')">Nguồn API</button>
    </div>
    <div class="oms-finance-panels">
      <section class="oms-finance-panel active" data-oms-finance-panel="customer">
        ${feePanelTextRow('Phương thức thanh toán', order.payment_method || order.payment_channel || 'Chưa có dữ liệu')}
        ${feePanelRow('Tiền sản phẩm sau KM shop', productAfterShopDiscount, { tone: 'positive', basis: revenueBase, showPercent: true })}
        ${feePanelRow('Giá sản phẩm ban đầu', productOriginal, { indent: true, basis: revenueBase, showPercent: true })}
        ${feePanelRow('Giảm giá shop tự cài', shopDiscount, { sign: 'negative', indent: true, basis: revenueBase, showPercent: true })}
        ${feePanelRow('Phí vận chuyển người mua trả', buyerShippingPaid, { tone: 'positive', basis: revenueBase, showPercent: true })}
        ${feePanelRow('Tổng doanh thu báo cáo', revenueBase, { total: true, tone: 'positive', basis: revenueBase, showPercent: true })}
        ${feePanelRow('Shopee Voucher / voucher sàn', platformDiscount, { sign: 'negative', basis: revenueBase, showPercent: true })}
        ${feePanelRow('Người mua thanh toán', buyerTotalPaid, { total: true, tone: 'positive', basis: revenueBase, showPercent: true })}
      </section>
      <section class="oms-finance-panel" data-oms-finance-panel="platform">
        ${feePanelRow(isTiktokSellerCenterFinance && !actualIncomeAvailable ? 'Doanh thu ước tính' : 'Tổng doanh thu báo cáo', revenueBase, { tone: 'positive', basis: revenueBase, showPercent: true })}
        ${sellerCofundedVoucher > 0 ? feePanelRow('Voucher đồng tài trợ người bán chịu', sellerCofundedVoucher, { sign: 'negative', basis: revenueBase, showPercent: true }) : ''}
        ${platformFundedVoucher > 0 ? feePanelRow('Voucher phần sàn tài trợ', platformFundedVoucher, { basis: revenueBase, showPercent: true, source: 'Không trừ shop' }) : ''}
        ${settlementGroup.rows?.length ? `<div class="oms-finance-section-title">Khấu trừ settlement</div>${renderRowsFromGroup(settlementGroup, { sign: 'negative', basis: revenueBase })}` : ''}
        ${apiFeeGroup.rows?.length ? `<div class="oms-finance-section-title">${escapeFeeHtml(apiFeeGroup.label || (isTiktokSellerCenterFinance ? 'Phí sàn từ TikTok Seller Center' : 'Phí sàn từ API'))}</div>${renderRowsFromGroup(apiFeeGroup, { sign: 'negative', basis: revenueBase })}` : ''}
        ${apiTaxGroup.rows?.length ? `<div class="oms-finance-section-title">${escapeFeeHtml(apiTaxGroup.label || (isTiktokSellerCenterFinance ? 'Thuế/khấu trừ từ TikTok Seller Center' : 'Thuế/khấu trừ'))}</div>${renderRowsFromGroup(apiTaxGroup, { sign: 'negative', basis: revenueBase })}` : ''}
        ${estimateGroup.rows?.length ? `<div class="oms-finance-section-title">Ước tính còn thiếu</div>${renderRowsFromGroup(estimateGroup, { sign: 'negative', tone: 'warning', basis: revenueBase })}` : ''}
        ${isTiktokSellerCenterFinance && !actualIncomeAvailable && platformDeductionTotal > 0 ? feePanelRow('Tổng phí ước tính', platformDeductionTotal, { sign: 'negative', tone: 'warning', basis: revenueBase, showPercent: true }) : ''}
        ${sfrServiceFee > 0 ? feePanelRow('Phí SFR', sfrServiceFee, { sign: 'negative', basis: revenueBase, showPercent: true }) : ''}
        ${actualIncomeAvailable
          ? feePanelRow('Thực nhận về ví', netReceived, { total: true, tone: netReceived >= 0 ? 'positive' : 'negative', basis: revenueBase, showPercent: true })
          : `${feePanelRow(isTiktokSellerCenterFinance ? 'Tổng số tiền quyết toán / thực nhận dự kiến' : 'Thực nhận tạm tính', estimatedIncomeDisplay, { total: true, tone: estimatedIncomeDisplay >= 0 ? 'positive' : 'warning', basis: revenueBase, showPercent: true })}${feePanelTextRow('Nguồn ước tính', estimatedSourceText)}`}
      </section>
      <section class="oms-finance-panel" data-oms-finance-panel="profit">
        ${actualIncomeAvailable
          ? feePanelRow('Thực nhận ví', netReceived, { tone: 'positive', basis: revenueBase, showPercent: true })
          : `${feePanelRow(isTiktokSellerCenterFinance ? 'Thực nhận dự kiến' : 'Thực nhận tạm tính', estimatedIncomeDisplay, { tone: 'positive', basis: revenueBase, showPercent: true })}${feePanelTextRow('Nguồn', estimatedSourceText)}`}
        ${feePanelRow('Giá vốn', order.cost_real || 0, { sign: 'negative', basis: profitBasis || revenueBase, showPercent: true })}
        ${feePanelRow('ADS ngoài ví', adsFee, { sign: 'negative', basis: profitBasis || revenueBase, showPercent: true })}
        ${feePanelRow(pishipLabel, pishipFee, { sign: 'negative', basis: profitBasis || revenueBase, showPercent: true })}
        ${opsOther > 0 ? feePanelRow('Phí vận hành khác', opsOther, { sign: 'negative', basis: profitBasis || revenueBase, showPercent: true }) : ''}
        ${feePanelRow(profitLabel, profitReal, { total: true, tone: profitReal >= 0 ? 'positive' : 'negative', basis: profitBasis || revenueBase, showPercent: true })}
      </section>
      <section class="oms-finance-panel" data-oms-finance-panel="source">
        ${isTiktokSellerCenterFinance ? `
          ${feePanelTextRow('Nguồn dữ liệu', 'TikTok Seller Center detail')}
          ${feePanelTextRow('Trạng thái settlement', actualIncomeAvailable ? 'Đã có Thực nhận ví' : 'Pending settlement / chưa có Thực nhận ví')}
          ${actualIncomeAvailable
            ? feePanelTextRow('Thực nhận ví', 'Confirmed từ settlement')
            : `${feePanelRow('Tổng số tiền quyết toán / thực nhận dự kiến', estimatedIncomeDisplay, { total: true, tone: 'warning', basis: revenueBase, showPercent: true })}${feePanelTextRow('Nguồn ước tính', estimatedSourceText)}${feePanelTextRow('Ghi chú', 'Sẽ cập nhật lại khi quét được settlement thật từ TikTok')}`}
        ` : ''}
        ${renderGroupSummaryRows(order, revenueBase)}
        <div class="oms-finance-section-title">Đối soát API</div>
        ${renderComparisonRows(order, revenueBase)}
      </section>
    </div>
  `
}
