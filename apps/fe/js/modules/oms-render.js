// ==========================================
// MODULE: VẼ GIAO DIỆN BẢNG & PHÂN TRANG (VIEW LAYER)
// ==========================================
import { API } from '../oms-dashboard/oms-api.js';
import { fmt } from '../utils/helpers.js';
import {
  buildPhase1FeeBreakdownHtml,
  buildOrderFinanceTabsHtml,
  feeSourceInfoV2,
  renderFeeRow,
  toMoneyNumber
} from './oms-fee-render.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

// ── 1. SHIPPING STATUS TAGS ──────────────────────────────────────────
export function renderShippingStatus(s) {
  const raw = String(s || '').trim();
  const coreLabel = window.SHV_ORDER_STATUS_CORE?.label?.(raw, '') || '';
  const labelMap = {
    LOGISTICS_PENDING_ARRANGE: 'Chưa xử lý',
    READY_TO_SHIP: 'Chưa xử lý',
    confirmed: 'Chờ xác nhận',
    LOGISTICS_REQUEST_CREATED: 'Đã xử lý',
    PROCESSED: 'Đã xử lý',
    LOGISTICS_PACKAGED: 'Đã đóng gói',
    IN_CANCEL: 'Khách yêu cầu hủy',
    ADVANCE_FULFILMENT: 'Gói sẵn giao nhanh',
    SHIPPING: 'Đang giao',
    SHIPPED: 'Đang giao',
    TO_CONFIRM_RECEIVE: 'Đang giao',
    COMPLETED: 'Đã giao',
    CANCELLED: 'Đã hủy',
    CANCELLED_TRANSIT: 'Đã hủy',
    RETURN: 'Hoàn hàng',
    RETURN_REFUND: 'Hoàn hàng',
    RETURN_COMPLAINT: 'Đang khiếu nại',
    LOGISTICS_IN_RETURN: 'Đang hoàn',
    LOGISTICS_RETURNED_BY_SHIPPER: 'Shipper trả',
    LOGISTICS_RETURN_PACKAGE_RECEIVED: 'Đã nhận hoàn',
    LOGISTICS_LOST: 'Thất lạc',
    FAILED_DELIVERY: 'Giao thất bại',
    FAILED_DELIVERY_ATTEMPT: 'Giao thất bại'
  };
  // Ưu tiên nhãn chi tiết của OMS, fallback về core chung để mã RETURN/CANCELLED/FAILED_DELIVERY luôn đồng bộ.
  const label = labelMap[raw] || coreLabel || raw || 'Chưa rõ';
  const map = {
    'Chờ lấy hàng':  { color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: '📬' },
    'Chờ xác nhận':  { color: '#a78bfa', bg: 'rgba(167,139,250,.12)', icon: '🕐' },
    'Đang giao':      { color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  icon: '🚚' },
    'Đã giao':        { color: '#22c55e', bg: 'rgba(34,197,94,.12)',   icon: '✅' },
    'Đã hủy':         { color: '#ef4444', bg: 'rgba(239,68,68,.12)',   icon: '✗'  },
    'Hoàn hàng':      { color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '↩'  },
    'Đang khiếu nại': { color: '#dc2626', bg: 'rgba(220,38,38,.12)', icon: '!' },
    'Chưa xử lý':      { color: '#a78bfa', bg: 'rgba(167,139,250,.12)', icon: '⏳' },
    'Đã xử lý':        { color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: '✓' },
    'Đã đóng gói':     { color: '#14b8a6', bg: 'rgba(20,184,166,.12)', icon: '📦' },
    'Khách yêu cầu hủy': { color: '#dc2626', bg: 'rgba(220,38,38,.12)', icon: '!' },
    'Gói sẵn giao nhanh': { color: '#0ea5e9', bg: 'rgba(14,165,233,.12)', icon: '⚡' },
    'Đang hoàn':       { color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '↩'  },
    'Shipper trả':     { color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '↩'  },
    'Đã nhận hoàn':    { color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '↩'  },
    'Thất lạc':        { color: '#ef4444', bg: 'rgba(239,68,68,.12)',   icon: '?'  },
    'Giao thất bại':   { color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '!'  },
  }
  const info = map[label] || map[raw] || { color: 'var(--muted)', bg: 'var(--surface2)', icon: '—' }
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${info.bg};color:${info.color};border:1px solid ${info.color}33;white-space:nowrap">${info.icon} ${label}</span>`
}

// ── 2. RENDER MAIN TABLE ─────────────────────────────────────────────
function inferCarrierFromTracking(value) {
  const tracking = String(value || '').trim().toUpperCase()
  if (!tracking) return ''
  if (tracking.startsWith('SPX')) return 'SPX Express'
  if (tracking.startsWith('JNT') || tracking.startsWith('JT')) return 'J&T Express'
  if (tracking.startsWith('LMP') || tracking.startsWith('LEX')) return 'LEX VN'
  if (tracking.startsWith('BEST')) return 'BEST Express'
  if (tracking.startsWith('AHM')) return 'AhaMove'
  return ''
}

function normalizeCarrierName(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const base = raw.replace(/^pickup\s*:\s*/i, '').split(',')[0].trim()
  const lower = base.toLowerCase()
  if (!base || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na', 'chua ro', 'chưa rõ'].includes(lower)) return ''
  if (/[₫đ]/i.test(base) || (/^\d[\d.,\s]*$/.test(base) && !/[a-z]/i.test(base))) return ''

  if (lower.includes('spx') && (lower.includes('trong ngày') || lower.includes('giao trong ngày'))) return 'SPX Express - Trong Ngày'
  if (lower.includes('spx') && (lower.includes('instant') || lower.includes('hỏa tốc') || lower.includes('hoa toc'))) return 'SPX Instant'
  if (lower.includes('spx')) return 'SPX Express'
  if (lower.includes('j&t') || lower.includes('jnt')) return 'J&T Express'
  if (lower.includes('giao hàng nhanh') || lower === 'ghn') return 'Giao Hàng Nhanh'
  if (lower.includes('giao hàng tiết kiệm') || lower === 'ghtk') return 'Giao Hàng Tiết Kiệm'
  if (lower.includes('best')) return 'BEST Express'
  if (lower.includes('ahamove')) return 'AhaMove'
  if (lower.includes('grab')) return 'GrabExpress'
  if (lower.includes('bedelivery')) return 'BeDelivery'
  if (lower.includes('lex') || lower.includes('lazada express')) return 'LEX VN'
  if (lower.includes('ninja')) return 'Ninja Van'
  if (lower.includes('viettel')) return 'Viettel Post'
  if (lower === 'nhanh' || lower === 'standard') return 'SPX Express - Nhanh'
  if (lower.includes('trong ngày')) return 'SPX Express - Trong Ngày'
  if (lower.includes('hỏa tốc') || lower.includes('hoa toc') || lower === 'instant') return 'SPX Instant'
  if (/\d/.test(base)) return ''
  return base
}

function renderCarrierName(o) {
  const carrier = normalizeCarrierName(o.shipping_carrier)
  if (carrier) return carrier

  const inferred = inferCarrierFromTracking(o.tracking_number)
  if (inferred) return inferred

  const platform = String(o.platform || '').toLowerCase()
  const status = String(o.shipping_status || o.oms_status || '').toUpperCase()
  if (platform === 'lazada' && ['PENDING', 'LOGISTICS_PENDING_ARRANGE', 'LOGISTICS_REQUEST_CREATED', 'LOGISTICS_PACKAGED'].includes(status)) {
    return 'Chờ Lazada phân ĐVVC'
  }
  if (['PENDING', 'LOGISTICS_PENDING_ARRANGE', 'READY_TO_SHIP'].includes(status)) {
    return 'Chờ sàn phân ĐVVC'
  }
  return 'Chưa rõ ĐVVC'
}

function renderCustomerRiskBadge(o = {}) {
  const level = String(o.customer_risk_level || '').toLowerCase()
  if (!['medium', 'high'].includes(level)) return ''
  const label = o.customer_risk_label || (level === 'high' ? 'Khách rủi ro cao' : 'Khách hay hoàn/không nhận')
  const reason = o.customer_risk_reason || 'Có lịch sử hoàn/trả hoặc giao không thành công'
  const total = Number(o.customer_risk_total_orders || 0)
  const returned = Number(o.customer_risk_return_count || 0)
  const failed = Number(o.customer_risk_failed_delivery_count || 0)
  const cancelled = Number(o.customer_risk_cancel_count || 0)
  const title = `${label}. ${reason}. Tổng ${total} đơn, hoàn/trả ${returned}, không nhận/giao lỗi ${failed}, hủy ${cancelled}.`
  return `<span class="customer-risk-badge ${level}" title="${escapeHtml(title)}">${level === 'high' ? '!' : '⚠'} ${escapeHtml(label)}</span>`
}

function isReturnLogisticsOrder(o = {}, shippingUpper = '') {
  const text = `${o.order_type || ''} ${o.oms_status || ''} ${shippingUpper || o.shipping_status || ''}`.toUpperCase()
  return text.includes('RETURN') || text.includes('REFUND') || text.includes('FAILED_DELIVERY') || text.includes('TO_RETURN')
}

function renderOrderLogisticsActions(o, shippingUpper) {
  const orderId = escapeHtml(o.order_id || '')
  const isReturn = isReturnLogisticsOrder(o, shippingUpper)
  const isBuyerCancel = shippingUpper === 'IN_CANCEL'
  const received = String(o.return_received_at || '').trim()
  return `
    <div class="order-logistics-actions">
      ${isBuyerCancel ? `<button type="button" class="danger" data-buyer-cancel-decision="ACCEPT" data-order-id="${orderId}">Đồng ý hủy</button>` : ''}
      ${isBuyerCancel ? `<button type="button" data-buyer-cancel-decision="REJECT" data-order-id="${orderId}">Từ chối hủy</button>` : ''}
      <button type="button" data-logistics-detail="${orderId}">Theo dõi</button>
      <button type="button" data-label-check="${orderId}">Tem</button>
      <button type="button" data-packing-video="${orderId}">Video</button>
      ${isReturn && !received ? `<button type="button" class="danger" data-return-camera-scan="${orderId}">Quét hoàn</button>` : ''}
      ${isReturn && !received ? `<button type="button" class="danger" data-return-receive="${orderId}">Nhận hoàn</button>` : ''}
      ${isReturn ? `<button type="button" class="danger" data-return-complaint="${orderId}">Khiếu nại</button>` : ''}
    </div>`
}

export function renderTable(omsCache) {
  if (!document.getElementById('mobile-card-style')) {
    const style = document.createElement('style');
    style.id = 'mobile-card-style';
    style.innerHTML = `
      @media (max-width: 768px) {
        .table-wrap table { min-width: unset !important; width: 100%; display: block; }
        .table-wrap thead { display: none; }
        .table-wrap tbody, .table-wrap tr, .table-wrap td { display: block; width: 100%; }
        .table-wrap tr { background: var(--surface2); margin-bottom: 16px; border-radius: 12px; padding: 12px 16px; border: 1px solid var(--border); position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .table-wrap td { padding: 8px 0 !important; border-bottom: 1px dashed var(--border); display: flex; justify-content: space-between; align-items: center; text-align: right; }
        .table-wrap td:last-child { border-bottom: none; }
        .table-wrap td::before { content: attr(data-label); font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; margin-right: auto; padding-right: 15px; text-align: left; }
        
        .table-wrap td:nth-child(1) { border-bottom: none; position: absolute; top: 12px; left: 12px; width: auto; padding: 0 !important; }
        .table-wrap td:nth-child(1)::before { display: none; }
        .table-wrap td:nth-child(2) { flex-direction: column; align-items: flex-start; margin-top: 25px; text-align: left; }
        .table-wrap td:nth-child(2)::before { display: none; }
        .product-cell { width: 100%; margin-bottom: 8px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 8px; }
        .shop-cell { display: flex; flex-direction: column; align-items: flex-end; }
      }
    `;
    document.head.appendChild(style);
  }

  if (!omsCache.length) {
    document.getElementById('omsTable').innerHTML =
      `<tr><td colspan="9"><div class="empty-state"><div class="icon">🔍</div><p>Không có đơn hàng nào</p></div></td></tr>`
    return
  }

  window.__omsOrdersById = Object.fromEntries(omsCache.map(order => [String(order.order_id || ''), order]))

  document.getElementById('omsTable').innerHTML = omsCache.map(o => {
    const profit   = o.profit_real || 0
    const revenue  = o.revenue || 0
    const realtimeIds = Array.isArray(window.__omsRealtimeUpdatedIds) ? window.__omsRealtimeUpdatedIds : []
    const isRealtimeUpdated = realtimeIds.includes(String(o.order_id)) && (Date.now() - Number(window.__omsRealtimeUpdatedAt || 0) < 30000)

    const pltHtml = {
      shopee:  `<span class="plt-tag plt-shopee">🛍 Shopee</span>`,
      tiktok:  `<span class="plt-tag plt-tiktok">🎵 TikTok</span>`,
      lazada:  `<span class="plt-tag plt-lazada">🛒 Lazada</span>`,
    }[o.platform] || `<span class="plt-tag">${o.platform||'—'}</span>`

    const statusForLabel = (o.oms_status === 'PENDING' || o.oms_status === 'RETURN')
      ? (o.shipping_status || o.oms_status)
      : o.oms_status;
    const statusClass = String(statusForLabel || o.oms_status || 'PENDING').replace(/[^A-Za-z0-9_-]/g, '_');
    const shippingUpper = String(o.shipping_status || '').toUpperCase()
    const logisticsBadges = []
    if (!String(o.tracking_number || '').trim()) logisticsBadges.push({ label: 'Thiếu tracking', cls: 'warning' })
    if (shippingUpper === 'LOGISTICS_PACKAGED') logisticsBadges.push({ label: 'Đã đóng gói', cls: 'warning' })
    if (['FAILED_DELIVERY', 'FAILED_DELIVERY_ATTEMPT'].includes(shippingUpper)) logisticsBadges.push({ label: 'Giao lỗi', cls: 'danger' })
    if (shippingUpper === 'LOGISTICS_RETURNED_BY_SHIPPER') logisticsBadges.push({ label: 'Chờ nhận hoàn', cls: 'danger' })
    else if (shippingUpper === 'LOGISTICS_RETURN_PACKAGE_RECEIVED') logisticsBadges.push({ label: 'Đã nhận hoàn', cls: 'ok' })
    else if (shippingUpper.includes('RETURN')) logisticsBadges.push({ label: 'Hoàn/trả', cls: 'warning' })
    if (String(o.return_complaint_status || '').trim()) logisticsBadges.push({ label: 'Đang khiếu nại', cls: 'danger' })
    const logisticsBadgeHtml = logisticsBadges.length
      ? `<div class="logistics-row-badges">${logisticsBadges.map(badge => `<span class="logistics-row-badge ${badge.cls}">${badge.label}</span>`).join('')}</div>`
      : ''
    const logisticsActionHtml = renderOrderLogisticsActions(o, shippingUpper)

    const omsInfo = {
      // Nhóm 1: Trạng thái cốt lõi
      UNPAID: { icon: '💳', label: 'Chờ Thanh Toán' },
      SHIPPING: { icon: '🚚', label: 'Đang Giao' },
      SHIPPED: { icon: '🚚', label: 'Đang Giao' },
      COMPLETED: { icon: '🏆', label: 'Đã Giao' },
      CANCELLED: { icon: '✗', label: 'Đã Huỷ' },
      CANCELLED_TRANSIT: { icon: '✗', label: 'Huỷ Khi Vận Chuyển' },
      RETURN: { icon: '↩', label: 'Hoàn Hàng' },
      // Nhóm 2: Chờ Xử Lý (Tầng 2)
      LOGISTICS_PENDING_ARRANGE: { icon: '🕐', label: 'Chưa Xử Lý' },
      LOGISTICS_REQUEST_CREATED: { icon: '✅', label: 'Đã Xử Lý' },
      LOGISTICS_PACKAGED: { icon: '📦', label: 'Đã Đóng Gói' },
      ADVANCE_FULFILMENT: { icon: '⚡', label: 'Giao Nhanh' },
      // Nhóm 3: Hoàn (Tầng 2)
      LOGISTICS_IN_RETURN: { icon: '🔙', label: 'Đang Hoàn' },
      LOGISTICS_RETURNED_BY_SHIPPER: { icon: '👤', label: 'Shipper Trả' },
      LOGISTICS_RETURN_PACKAGE_RECEIVED: { icon: '📥', label: 'Đã Nhận Hoàn' },
      LOGISTICS_LOST: { icon: '❓', label: 'Thất Lạc' },
      RETURN_REFUND: { icon: '↩', label: 'Hoàn Tiền' },
      FAILED_DELIVERY: { icon: '⚠', label: 'Giao Thất Bại' },
      FAILED_DELIVERY_ATTEMPT: { icon: '⚠', label: 'Giao Thất Bại' },
      READY_TO_SHIP: { icon: '🕐', label: 'Chưa Xử Lý' },
      PROCESSED: { icon: '✅', label: 'Đã Xử Lý' }
    }[statusForLabel] || { icon: '🏷️', label: statusForLabel || 'CHƯA RÕ' }

    const typeHtml = {
      normal: `<span class="type-normal">✓ Thành công</span>`,
      cancel: `<span class="type-cancel">✗ Hủy</span>`,
      return: `<span class="type-return">↩ Hoàn</span>`,
    }[o.order_type] || `<span>${o.order_type}</span>`

    const items = o.items || []
    const totalQty = items.reduce((s, i) => s + (i.qty || 1), 0)
    
    const itemsHtml = items.map(item => {
      const imgSrc = item.image_url
      const imgHtml = imgSrc
        ? `<img class="product-img" src="${imgSrc}" alt="">`
        : `<div class="product-img-placeholder">📦</div>`
        
      return `
        <div class="product-cell">
          ${imgHtml}
          <div class="product-info">
            <div class="product-name" title="${item.product_name||'—'}">${(item.product_name||'—').substring(0,40)}</div>
            ${item.variation_name ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">Phân loại: ${item.variation_name}</div>` : ''}
            <div class="product-sku" style="margin-top:2px; color:var(--blue); display:flex; align-items:center; gap:5px;">
              ${item.db_sku_check ? item.sku : `<span style="color:var(--red)">${item.sku || 'Chưa Map SKU'}</span>`}
              ${!item.db_sku_check ? `<span onclick="openMapModal('${item.sku || item.variation_name || item.product_name}', '${o.order_id}')" style="background:var(--accent); color:white; padding:1px 6px; border-radius:4px; font-size:10px; cursor:pointer; font-weight:bold; box-shadow: 0 0 5px var(--accent); animation: pulse 1.5s infinite;">➕ Map</span>` : ''}
              ${(item.db_sku_check && (!item.cost_real || item.cost_real <= 0)) ? `<span onclick="openCostModal('${item.sku}')" style="background:var(--orange); color:white; padding:1px 6px; border-radius:4px; font-size:10px; cursor:pointer; font-weight:bold; box-shadow: 0 0 5px var(--orange); animation: pulse 1.5s infinite;">💲 Cập nhật Vốn</span>` : ''}
            </div>
            <div class="product-qty" style="margin-top:2px; font-weight: bold;">× ${item.qty || 1}</div>
          </div>
        </div>`
    }).join('')

    const feeBase = Math.abs(toMoneyNumber(revenue))
    let feeBreakdown = '';
    feeBreakdown += renderFeeRow('Phí cố định:', o.fee_platform, feeBase);
    feeBreakdown += renderFeeRow('Phí thanh toán:', o.fee_payment, feeBase);
    feeBreakdown += renderFeeRow('Phí Affiliate/Freeship:', o.fee_affiliate, feeBase);
    feeBreakdown += renderFeeRow('Phí Quảng cáo:', o.fee_ads, feeBase);
    feeBreakdown += renderFeeRow('Phí Dịch vụ/Thuế:', o.fee_service, feeBase);
    feeBreakdown += renderFeeRow('Phí PiShip:', o.fee_piship, feeBase);
    feeBreakdown += renderFeeRow('Phí Đóng gói:', o.fee_packaging, feeBase);
    feeBreakdown += renderFeeRow('Phí Nhân công:', o.fee_labor, feeBase);
    if (toMoneyNumber(o.return_fee) > 0) feeBreakdown += renderFeeRow('Phí Hoàn/Phạt:', o.return_fee, feeBase, 'color:var(--red);');
    const feeInfo = feeSourceInfoV2(o)
    feeBreakdown = buildPhase1FeeBreakdownHtml(o, feeBase) || feeBreakdown
    const feeDisplayTotal = toMoneyNumber(o.fee_display_total || o.fee)
    const feeDelta = toMoneyNumber(o.fee_display_delta)
    const feeFinanceTabs = buildOrderFinanceTabsHtml(o, feeBase, { feeInfo, feeDisplayTotal, feeDelta })

    const feeHtml = feeDisplayTotal ? `
      <div style="position: relative; margin-top: 6px; display: inline-block; cursor: pointer; text-align: left;" 
           onmouseleave="this.querySelector('.fee-dropdown-box').style.display = 'none'"
           onclick="const box = this.querySelector('.fee-dropdown-box'); box.style.display = box.style.display === 'block' ? 'none' : 'block'">
        <div style="font-size:11px; color:${feeInfo.palette.color}; display:inline-flex; align-items:center; gap:4px; background:${feeInfo.palette.bg}; padding: 3px 8px; border-radius: 6px; border: 1px solid ${feeInfo.palette.border}; font-weight: 600;">
           ${feeInfo.label}: ${fmt(feeDisplayTotal)} <span style="font-size:9px">▼</span>
        </div>
        <div class="fee-dropdown-box oms-fee-panel" style="display: none; position: absolute; top: 100%; right: 0; background: var(--surface2); border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; z-index: 50; width: max-content; min-width: 280px; max-width: min(340px, calc(100vw - 24px)); box-shadow: 0 8px 24px rgba(0,0,0,0.6); font-size: 12px; color: var(--text); margin-top: 5px;" onclick="event.stopPropagation()">
           ${feeFinanceTabs}
           <div style="font-weight:bold; color:var(--muted); margin-bottom: 8px; border-bottom: 1px dashed var(--border); padding-bottom: 6px;">
             BẢNG KÊ PHÍ ĐƠN HÀNG
             <div style="margin-top:5px;display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:999px;font-size:10px;background:${feeInfo.palette.bg};color:${feeInfo.palette.color};border:1px solid ${feeInfo.palette.border};">
               ${feeInfo.label}
             </div>
           </div>
           ${feeInfo.note ? `<div style="margin-bottom:8px;padding:7px 9px;border-radius:7px;background:${feeInfo.palette.bg};border:1px solid ${feeInfo.palette.border};color:${feeInfo.palette.color};line-height:1.4;">${feeInfo.note}</div>` : ''}
           ${Math.abs(feeDelta) >= 1 ? `<div style="margin-bottom:8px;padding:7px 9px;border-radius:7px;background:rgba(248,250,252,.06);border:1px dashed rgba(148,163,184,.25);color:var(--muted);line-height:1.35;">OMS đang hiển thị phí phase 1. Chênh lệch so với dữ liệu cũ trong orders_v2: <b style="color:${feeDelta >= 0 ? 'var(--orange)' : 'var(--green)'}">${feeDelta >= 0 ? '+' : ''}${fmt(feeDelta)}</b>.</div>` : ''}
           <div style="display:grid;grid-template-columns:minmax(116px,1fr) 58px 76px;gap:10px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">
             <span>Loại phí</span><span style="text-align:right">% DT</span><span style="text-align:right">Số tiền</span>
           </div>
           ${feeBreakdown || '<div style="color:var(--muted)">Chưa có dữ liệu chi tiết</div>'}
           <div style="border-top:1px dashed var(--border);margin-top:7px;padding-top:7px;">
             ${renderFeeRow('Tổng phí:', feeDisplayTotal, feeBase, 'font-weight:700;')}
           </div>
        </div>
      </div>
    ` : '';

    return `<tr class="${o.order_type==='cancel'?'':''}${o.order_type==='return'?'':''}${isRealtimeUpdated ? ' realtime-updated-row' : ''}" id="row-${o.order_id}">
      <td data-label="Chọn"><input type="checkbox" class="oms-chk" data-id="${o.order_id}" onchange="onCheck()"></td>
      <td data-label="Mặt hàng">
        ${itemsHtml}
        ${items.length > 1 ? `<div style="font-size:11px; color:var(--accent); font-weight: 600; margin-top: 6px; padding-left: 4px;">Tổng cộng: ${totalQty} sản phẩm</div>` : ''}
      </td>
      <td data-label="Mã đơn hàng">
        <div class="order-id">${o.order_id}<span class="order-id-copy" onclick="copyText('${o.order_id}')">⎘</span></div>
        ${isRealtimeUpdated ? `<div class="realtime-row-badge">Vừa cập nhật realtime</div>` : ''}
        ${o.tracking_number ? `<div style="font-size:10px;color:var(--teal);margin-top:3px;font-family:'IBM Plex Mono',monospace">${o.tracking_number}</div>` : ''}
        ${(o.oms_status !== 'PENDING') ? `
        <div style="margin-top: 6px;">
          <a href="${API}/api/label/${o.order_id}.pdf" target="_blank" style="font-size:10px; color:var(--blue); text-decoration:none; border: 1px solid var(--blue); padding: 2px 6px; border-radius: 4px; display:inline-flex; align-items:center; gap:3px; background: rgba(59,130,246,0.1);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Phiếu in
          </a>
        </div>` : ''}
      </td>
      <td data-label="Sàn">${pltHtml}</td>
      <td data-label="ĐV Vận Chuyển">
        <div style="font-weight: 600; font-size: 13px; color: var(--text);">${renderCarrierName(o)}</div>
      </td>
      <td data-label="Trạng Thái Giao">
        <div class="order-logistics-cell">
          ${renderShippingStatus(o.shipping_status || o.status)}
          ${logisticsBadgeHtml}
          ${logisticsActionHtml}
        </div>
      </td>
      <td data-label="Doanh thu">
        <div class="revenue rev-positive">${fmt(revenue)}</div>
        ${feeHtml}
      </td>
      <td data-label="Lãi thực">
        <div class="revenue ${profit>=0?'s-green':'s-red'}">${fmt(profit)}</div>
        <div style="font-size:10px;color:${o.cost_real > 0 ? 'var(--muted)' : 'var(--red)'};margin-top:2px;font-weight:600;">
           Vốn: ${fmt(o.cost_real || 0)}
        </div>
      </td>
      <td data-label="Shop / KH">
        <div class="shop-cell">
          <button type="button" data-chat-order-open="${o.order_id}" onclick="openOrderChatResolver('${o.order_id}')" style="margin-top:6px;padding:6px 10px;border-radius:8px;border:1px solid rgba(29,78,216,.24);background:rgba(29,78,216,.1);color:#1d4ed8;font-size:11px;font-weight:700;cursor:pointer;">Nhắn khách</button>
          <div class="shop-name" title="${o.shop||'—'}">${o.shop||'—'}</div>
          ${o.customer_name ? `<div class="shop-customer">👤 ${o.customer_name}</div>` : ''}
          ${renderCustomerRiskBadge(o)}
        </div>
      </td>
    </tr>`
  }).join('')
}

// ── 3. RENDER SUMMARY ────────────────────────────────────────────────
export function renderSummary(omsCache, totalOrders) {
  const normals  = omsCache.filter(o => o.order_type === 'normal')
  const cancels  = omsCache.filter(o => o.order_type === 'cancel')
  const returns  = omsCache.filter(o => o.order_type === 'return')
  const totalRev = normals.reduce((s,o) => s+(o.revenue||0), 0)
  const totalPro = normals.reduce((s,o) => s+(o.profit_real||0), 0)

  document.getElementById('summaryBar').innerHTML = `
    <span>Tổng <b>${totalOrders}</b> đơn &nbsp;|&nbsp; Trang này: <b>${omsCache.length}</b></span>
    <span>Doanh thu: <b class="s-blue">${fmt(totalRev)}</b></span>
    <span>Lãi thực: <b class="${totalPro>=0?'s-green':'s-red'}">${fmt(totalPro)}</b></span>
    ${cancels.length ? `<span>✗ Hủy: <b class="s-red">${cancels.length}</b></span>` : ''}
    ${returns.length ? `<span>↩ Hoàn: <b class="s-yellow">${returns.length}</b></span>` : ''}
  `
}

// ── 4. UPDATE BADGES (CALL API) ──────────────────────────────────────
export async function updateBadges(params = '') {
  try {
    const query = params instanceof URLSearchParams
      ? params.toString()
      : String(params || '').replace(/^\?/, '')
    const badges = await fetch(API + '/api/orders/badges' + (query ? `?${query}` : '')).then(r => r.json());
    
    const countByAliases = (aliases, mainStatus = '') => String(aliases || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .reduce((sum, key) => {
        if (mainStatus) {
          const scopedShippingCount = badges[`${mainStatus}:shipping:${key}`];
          if (scopedShippingCount !== undefined) return sum + scopedShippingCount;
          if (key === mainStatus) return sum + (badges[`oms:${key}`] || 0);
          return sum;
        }
        return sum + (badges[`shipping:${key}`] ?? badges[`oms:${key}`] ?? 0);
      }, 0);

    document.querySelectorAll('.sub-badge[data-sub]').forEach(el => {
      const aliases = el.dataset.sub || '';
      const mainStatus = el.dataset.main || '';
      const count = aliases
        ? countByAliases(aliases, mainStatus)
        : (mainStatus ? (badges[`oms:${mainStatus}`] ?? badges[mainStatus] ?? 0) : 0);
      el.textContent = count;
      el.style.display = (aliases || mainStatus) ? 'inline-flex' : 'none';
    });

    const mainCount = key => badges[`oms:${key}`] ?? badges[key] ?? 0;
    const pendingCount = mainCount('PENDING');
    const shippingCount = mainCount('SHIPPING');
    const returnCount = mainCount('RETURN');
    const cancelledCount = mainCount('CANCELLED');

    // Bảng điều phối cuối cùng
    const finalCounts = {
      'ALL': badges['ALL'] || 0,
      'UNPAID': mainCount('UNPAID'),
      'PENDING': pendingCount,
      'SHIPPING': shippingCount,
      'COMPLETED': mainCount('COMPLETED'),
      'CANCELLED': cancelledCount,
      'RETURN': returnCount
    };

    const keys = ['ALL', 'UNPAID', 'PENDING', 'SHIPPING', 'COMPLETED', 'CANCELLED', 'RETURN'];
    keys.forEach(k => {
      const el = document.getElementById('cnt-' + k);
      if (el) el.textContent = finalCounts[k] || 0;
    });
  } catch (e) {
    console.error("Lỗi lấy dữ liệu đếm số tổng:", e);
  }
}

// ── 5. RENDER PAGINATION ─────────────────────────────────────────────
export function renderPagination(currentPage, totalPages, totalOrders) {
  document.getElementById('pagInfo').textContent =
    `Trang ${currentPage} / ${totalPages} — ${totalOrders} đơn`

  let html = `<button class="pag-btn" onclick="loadOrders(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`
  for (let i = 1; i <= totalPages; i++) {
    if (i===1 || i===totalPages || Math.abs(i-currentPage)<=2)
      html += `<button class="pag-btn ${i===currentPage?'active':''}" onclick="loadOrders(${i})">${i}</button>`
    else if (Math.abs(i-currentPage)===3)
      html += `<span style="padding:0 4px;color:var(--muted)">…</span>`
  }
  html += `<button class="pag-btn" onclick="loadOrders(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`
  document.getElementById('pagBtns').innerHTML = html
}
