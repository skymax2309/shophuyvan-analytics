import { fmt } from '../utils/helpers.js';

export const toMoneyNumber = value => {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
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
