// ==========================================
// MODULE: VẼ GIAO DIỆN BẢNG & PHÂN TRANG (VIEW LAYER)
// ==========================================
import { API } from '../oms-dashboard/oms-api.js';
import { fmt } from '../utils/helpers.js';
import {
  buildOrderFinanceTabsHtml,
  feeSourceInfoV2,
  isOmsFeePopupOpen,
  syncOmsFeePopupAfterRender,
  toMoneyNumber
} from './oms-fee-render.js?v=oms-hotfix-20260521c';

const OMS_BADGES_STORAGE_KEY = 'oms_last_good_badges'

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
export function renderShippingStatus(order = {}) {
  const resolved = window.SHV_ORDER_STATUS_CORE?.resolve?.(order) || {
    label: order.display_status_vi || 'Lỗi / cần kiểm tra',
    tone: 'bad',
    icon: '!'
  }
  const palette = {
    wait: { color: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
    ready: { color: '#14b8a6', bg: 'rgba(20,184,166,.12)' },
    ship: { color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
    ok: { color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
    bad: { color: '#ef4444', bg: 'rgba(239,68,68,.12)' }
  }
  const info = palette[resolved.tone] || palette.bad
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${info.bg};color:${info.color};border:1px solid ${info.color}33;white-space:nowrap">${escapeHtml(resolved.icon)} ${escapeHtml(resolved.label)}</span>`
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
  const carrier = normalizeCarrierName(o.shipping_carrier || o.tracking_core_logistics_provider)
  if (carrier) return carrier

  const inferred = inferCarrierFromTracking(o.tracking_number)
  if (inferred) return inferred

  const platform = String(o.platform || '').toLowerCase()
  const fulfillment = String(o.fulfillment_status_core || '').toUpperCase()
  if (platform === 'lazada' && ['PENDING', 'LOGISTICS_PENDING_ARRANGE', 'LOGISTICS_REQUEST_CREATED', 'LOGISTICS_PACKAGED'].includes(fulfillment)) {
    return 'Chờ Lazada phân ĐVVC'
  }
  if (['PENDING', 'LOGISTICS_PENDING_ARRANGE', 'READY_TO_SHIP'].includes(fulfillment)) {
    return 'Chờ sàn phân ĐVVC'
  }
  return 'Chưa rõ ĐVVC'
}

function shortStatusSource(value) {
  const source = String(value || '').trim().toLowerCase()
  if (!source) return 'Chưa có nguồn'
  if (source.includes('api')) return 'API'
  if (source.includes('seller_center')) return 'Seller Center'
  if (source.includes('browser')) return 'Browser'
  if (source.includes('import')) return 'Import'
  return value
}

function formatSyncTime(value) {
  const text = String(value || '').trim()
  if (!text) return 'Chưa chạy'
  return text.replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16)
}

function formatDiagnosticStatus(value) {
  const status = String(value || '').trim()
  if (!status) return 'Chưa có'
  const labels = {
    ok: 'OK',
    success: 'OK',
    error: 'Lỗi',
    skipped: 'Bỏ qua',
    running: 'Đang chạy',
    pending: 'Đang chờ'
  }
  return labels[status.toLowerCase()] || status
}

function isApiOrderSource(o = {}) {
  const text = String([o.source_label, o.status_source, o.source_priority, o.raw_source?.source_mode].filter(Boolean).join('|')).toLowerCase()
  return text.includes('api') || text.includes('open_platform') || o.source_priority === 'official_api_first'
}

function shortStatusDiagnosticError(error, o = {}) {
  const raw = String(error || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  const isApiSource = isApiOrderSource(o)
  if (isApiSource && (lower.includes('seller_center_detail_url_not_found') || lower.includes('seller_center'))) {
    return ''
  }
  if (lower.includes('seller_center_detail_url_not_found')) return 'Không tìm thấy link Seller Center'
  if (lower.includes('source_mismatch') || String(o.source_mismatch || '').trim()) return 'Đang kiểm endpoint API chính thức'
  if (raw.length > 72) return 'Có lỗi đồng bộ, xem chi tiết kỹ thuật'
  return raw
}

function shortLabelDiagnosticError(error) {
  const raw = String(error || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (lower.includes('pending_document_generation') || lower.includes('shopee_pdf_not_ready') || lower.includes('package should print first')) {
    return 'Chưa có file tem, sẽ thử lại'
  }
  if (lower.includes('pending_retry') || lower.includes('lazada_batch_requeued') || lower.includes('subrequest') || lower.includes('too many')) {
    return 'Batch quá lớn, sẽ tự chia nhỏ'
  }
  if (raw.length > 72) return 'Không tải được tem, xem chi tiết'
  return raw
}

function renderStatusAutomationMeta(o = {}) {
  const source = shortStatusSource(o.source_label || o.status_source || o.source_detail || o.source_mode)
  const last = formatSyncTime(o.last_status_sync_at || o.source_updated_at || o.updated_at)
  const status = formatDiagnosticStatus(o.last_status_sync_status)
  const error = String(o.last_status_sync_error || '').trim()
  const publicError = shortStatusDiagnosticError(error, o)
  const stale = o.status_stale === true || (!o.last_status_sync_at && !o.terminal_status)
  const detailUrl = String(o.seller_center_detail_url || '').trim()
  const detailStatus = detailUrl
    ? `Đã verify${o.detail_url_verified_at ? ` ${formatSyncTime(o.detail_url_verified_at)}` : ''}`
    : (!isApiOrderSource(o) && o.detail_url_source === 'seller_center_detail_url_not_found' ? 'Không tìm thấy URL detail' : '')
  const retry = String(o.next_retry_at || '').trim()
  return `
    <div class="order-status-automation${publicError ? ' has-error' : stale ? ' is-stale' : ''}">
      <span>Nguồn: ${escapeHtml(source)}</span>
      <span>Cập nhật: ${escapeHtml(last)}</span>
      <span>Kết quả: ${escapeHtml(status)}</span>
      ${detailStatus ? `<span>Detail: ${escapeHtml(detailStatus)}</span>` : ''}
      ${retry ? `<span>Retry: ${escapeHtml(formatSyncTime(retry))}</span>` : ''}
      ${publicError ? `<span title="${escapeHtml(error)}">Lỗi: ${escapeHtml(publicError)}</span>` : stale ? `<span>Cần đồng bộ</span>` : ''}
      ${detailUrl ? `<a href="${escapeHtml(detailUrl)}" target="_blank" rel="noopener">Detail</a>` : ''}
    </div>
  `
}

function renderStatusAutomationMetaV2(o = {}) {
  const source = shortStatusSource(o.source_label || o.status_source || o.source_detail || o.source_mode)
  const last = formatSyncTime(o.last_status_sync_at || o.source_updated_at || o.updated_at)
  const completeness = o.order_sync_completeness || {}
  const completenessLabel = String(o.sync_completeness_label || completeness.label || '').trim()
  const completenessStatus = String(o.sync_completeness_status || completeness.status || '').trim()
  const completenessReason = String(o.sync_completeness_reason || completeness.reason || '').trim()
  const completenessTone = String(o.sync_completeness_tone || completeness.tone || '').trim()
  const status = completenessLabel || formatDiagnosticStatus(o.last_status_sync_status)
  const error = String(o.last_status_sync_error || '').trim()
  const publicError = shortStatusDiagnosticError(error, o)
  const stale = o.status_stale === true || (!o.last_status_sync_at && !o.terminal_status)
  const needsAttention = publicError || completenessStatus === 'error' || completenessTone === 'bad'
  const pendingAttention = !needsAttention && (
    ['needs_sync', 'missing_tracking', 'missing_finance', 'pending_settlement', 'seller_center_detail_missing', 'manual_required', 'api_permission_missing', 'missing_label'].includes(completenessStatus)
    || completenessTone === 'warn'
  )
  const detailUrl = String(o.seller_center_detail_url || '').trim()
  const detailStatus = detailUrl
    ? `Đã verify${o.detail_url_verified_at ? ` ${formatSyncTime(o.detail_url_verified_at)}` : ''}`
    : (!isApiOrderSource(o) && o.detail_url_source === 'seller_center_detail_url_not_found' ? 'Không tìm thấy URL detail' : '')
  const retry = String(o.next_retry_at || '').trim()
  const reason = completenessReason.length > 72 ? `${completenessReason.slice(0, 72)}...` : completenessReason
  return `
    <div class="order-status-automation${needsAttention ? ' has-error' : pendingAttention || (!completenessLabel && stale) ? ' is-stale' : ''}">
      <span>Nguồn: ${escapeHtml(source)}</span>
      <span>Cập nhật: ${escapeHtml(last)}</span>
      <span>Kết quả: ${escapeHtml(status)}</span>
      ${detailStatus ? `<span>Detail: ${escapeHtml(detailStatus)}</span>` : ''}
      ${retry ? `<span>Retry: ${escapeHtml(formatSyncTime(retry))}</span>` : ''}
      ${reason ? `<span title="${escapeHtml(completenessReason)}">${escapeHtml(reason)}</span>` : ''}
      ${publicError ? `<span title="${escapeHtml(error)}">Lỗi: ${escapeHtml(publicError)}</span>` : (!completenessLabel && stale ? `<span>Cần đồng bộ</span>` : '')}
      ${detailUrl ? `<a href="${escapeHtml(detailUrl)}" target="_blank" rel="noopener">Detail</a>` : ''}
    </div>
  `
}

function renderFinanceSyncBadge(o = {}) {
  const status = String(o.finance_sync_status || '').trim().toLowerCase()
  const badgeSource = String(o.finance_badge_source || o.finance_source || '').toLowerCase()
  if (badgeSource.includes('tiktok_seller_center')) {
    return '<span class="logistics-row-badge ok">TikTok Seller Center</span>'
  }
  if (!status || status === 'complete') {
    return ''
  }
  const detail = String(o.finance_missing_reason || o.last_finance_error || '').trim()
  const title = detail ? ` title="${escapeHtml(detail)}"` : ''
  if (status === 'fallback_only') return `<span class="logistics-row-badge warning"${title}>Cần cập nhật tài chính</span>`
  if (status.includes('pending')) return `<span class="logistics-row-badge warning"${title}>Chờ settlement</span>`
  return `<span class="logistics-row-badge danger"${title}>Thiếu tài chính</span>`
}

function renderLabelStateMeta(o = {}) {
  const status = String(o.label_status || '').trim()
  if (!status) return ''
  const labels = {
    eligible: 'Đang chờ tải tem',
    downloaded: 'Đã tải tem',
    missing_file: 'Chờ Tem In',
    missing: 'Chưa có tem hợp lệ',
    error: 'Lỗi tải tem',
    pending_document_generation: 'Đang tạo chứng từ in',
    pending_retry: 'Chờ thử lại',
    manual_required: 'Cần tải thủ công',
    not_supported: 'Chưa hỗ trợ tem',
    not_ready: 'Chưa đủ điều kiện'
  }
  const cls = status === 'downloaded' ? 'ok' : ['eligible', 'pending_document_generation', 'pending_retry'].includes(status) ? 'pending' : status === 'error' || status === 'manual_required' ? 'bad' : 'muted'
  const last = String(o.last_label_download_at || '').trim()
  const error = String(o.last_label_error || '').trim()
  const publicError = shortLabelDiagnosticError(error)
  const title = [o.label_reason || '', last ? `Cập nhật tem: ${formatSyncTime(last)}` : '', error ? `Lỗi tem: ${error}` : ''].filter(Boolean).join(' · ')
  return `<div class="order-label-state ${cls}" title="${escapeHtml(title)}"><span>${escapeHtml(labels[status] || status)}</span>${last ? `<span>${escapeHtml(formatSyncTime(last))}</span>` : ''}${publicError ? `<span>Lỗi: ${escapeHtml(publicError)}</span>` : ''}</div>`
}

function hasTrackingSignal(o = {}) {
  return Boolean(
    String(o.tracking_number || o.tracking_core_tracking_number || '').trim()
    || Number(o.tracking_events_count || 0) > 0
  )
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
  const core = String(o.order_status_core || '').toUpperCase()
  const fulfillment = String(o.fulfillment_status_core || shippingUpper || '').toUpperCase()
  return o.order_type === 'return' || core === 'RETURN' || core === 'FAILED_DELIVERY' || fulfillment.includes('RETURN') || fulfillment.includes('FAILED_DELIVERY')
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
    syncOmsFeePopupAfterRender()
    return
  }

  window.__omsOrdersById = Object.fromEntries(omsCache.map(order => [String(order.order_id || ''), order]))

  document.getElementById('omsTable').innerHTML = omsCache.map(o => {
    const profit   = o.profit_real || 0
    const revenue  = o.revenue || 0
    const profitLabel = String(o.profit_label || o.fee_breakdown?.totals?.profit_label || (o.actual_income_available === false ? 'Lãi tạm tính' : 'Lãi thực')).trim()
    const realtimeIds = Array.isArray(window.__omsRealtimeUpdatedIds) ? window.__omsRealtimeUpdatedIds : []
    const isRealtimeUpdated = realtimeIds.includes(String(o.order_id)) && (Date.now() - Number(window.__omsRealtimeUpdatedAt || 0) < 30000)

    const pltHtml = {
      shopee:  `<span class="plt-tag plt-shopee">🛍 Shopee</span>`,
      tiktok:  `<span class="plt-tag plt-tiktok">🎵 TikTok</span>`,
      lazada:  `<span class="plt-tag plt-lazada">🛒 Lazada</span>`,
    }[o.platform] || `<span class="plt-tag">${o.platform||'—'}</span>`

    const shippingUpper = String(o.fulfillment_status_core || '').toUpperCase()
    const logisticsBadges = []
    if (!hasTrackingSignal(o)) logisticsBadges.push({ label: 'Thiếu tracking', cls: 'warning' })
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
        : `<div class="product-img-placeholder">Ảnh</div>`
      const mappingStatus = String(item.mapping_status || '').toLowerCase()
      const hasCoreMapping = ['mapped', 'combo_mapped'].includes(mappingStatus)
      const showMapButton = item.show_update_mapping_button === true
      const showCostButton = item.show_update_cost_button === true
      const mapContext = {
        platform: o.platform || '',
        shop: o.shop || o.shop_id || '',
        order_id: o.order_id || '',
        item_id: item.id || '',
        platform_sku: item.sku || item.variation_name || item.product_name || '',
        product_name: item.product_name || '',
        variation_name: item.variation_name || '',
        qty: item.qty || 1
      }
      const mapContextEncoded = encodeURIComponent(JSON.stringify(mapContext))
      const costSkuEncoded = encodeURIComponent(item.sku || '')
        
      return `
        <div class="product-cell">
          ${imgHtml}
          <div class="product-info">
            <div class="product-name" title="${item.product_name||'—'}">${(item.product_name||'—').substring(0,40)}</div>
            ${item.variation_name ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">Phân loại: ${item.variation_name}</div>` : ''}
            <div class="product-sku" style="margin-top:2px; color:var(--blue); display:flex; align-items:center; gap:5px;">
              ${hasCoreMapping ? (item.sku || item.platform_sku || '') : `<span style="color:var(--red)">${item.sku || 'Chưa Map SKU'}</span>`}
              ${showMapButton ? `<span onclick="openMapModal(JSON.parse(decodeURIComponent('${mapContextEncoded}')))" style="background:var(--accent); color:white; padding:1px 6px; border-radius:4px; font-size:10px; cursor:pointer; font-weight:bold; box-shadow: 0 0 5px var(--accent); animation: pulse 1.5s infinite;">➕ Map</span>` : ''}
              ${showCostButton ? `<span onclick="openCostModal(decodeURIComponent('${costSkuEncoded}'))" style="background:var(--orange); color:white; padding:1px 6px; border-radius:4px; font-size:10px; cursor:pointer; font-weight:bold; box-shadow: 0 0 5px var(--orange); animation: pulse 1.5s infinite;">💲 Cập nhật Vốn</span>` : ''}
            </div>
            <div class="product-qty" style="margin-top:2px; font-weight: bold;">× ${item.qty || 1}</div>
          </div>
        </div>`
    }).join('')

    const feeInfo = feeSourceInfoV2(o)
    const feeBase = Math.abs(toMoneyNumber(revenue))
    const feeDisplayTotal = toMoneyNumber(o.fee_display_total || o.fee)
    const feeDelta = toMoneyNumber(o.fee_display_delta)
    const feeFinanceTabs = buildOrderFinanceTabsHtml(o, feeBase, { feeInfo, feeDisplayTotal, feeDelta })
    const feeOrderId = String(o.order_id || '')
    const feeOrderIdAttr = escapeHtml(feeOrderId)
    const feeOrderIdJs = escapeHtml(JSON.stringify(feeOrderId))
    const feePanelOpen = isOmsFeePopupOpen(feeOrderId)
    const hasFinancePanelData = !!o.fee_breakdown || o.actual_income_available === false || ['lazada', 'tiktok'].includes(String(o.platform || '').toLowerCase())
    const financeSyncBadge = renderFinanceSyncBadge(o)

    const feeHtml = (feeDisplayTotal || hasFinancePanelData) ? `
      <div class="oms-fee-trigger${feePanelOpen ? ' is-open' : ''}" data-oms-fee-order="${feeOrderIdAttr}">
        <button type="button"
          class="oms-fee-badge"
          aria-expanded="${feePanelOpen ? 'true' : 'false'}"
          style="--fee-badge-color:${feeInfo.palette.color};--fee-badge-bg:${feeInfo.palette.bg};--fee-badge-border:${feeInfo.palette.border};"
          onclick="window.toggleOmsFeePopup(${feeOrderIdJs}, event)">
          <span>${feeInfo.label}: ${fmt(feeDisplayTotal)}</span>
          <span class="oms-fee-badge-caret">${feePanelOpen ? '▲' : '▼'}</span>
        </button>
        <div class="fee-dropdown-box oms-fee-panel" data-oms-fee-panel="${feeOrderIdAttr}" style="display:${feePanelOpen ? 'block' : 'none'};" onclick="event.stopPropagation()">
           ${feeFinanceTabs}
        </div>
        ${financeSyncBadge ? `<div class="logistics-row-badges">${financeSyncBadge}</div>` : ''}
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
        ${renderStatusAutomationMetaV2(o)}
        ${o.tracking_number ? `<div style="font-size:10px;color:var(--teal);margin-top:3px;font-family:'IBM Plex Mono',monospace">${o.tracking_number}</div>` : ''}
        ${(o.label_valid === true && o.label_status === 'downloaded' && (o.shipping_label_url || o.label_file_path)) ? `
        <div style="margin-top: 6px;">
          <a href="${escapeHtml(o.shipping_label_url || `${API}/api/label/${o.order_id}.pdf`)}" target="_blank" style="font-size:10px; color:var(--blue); text-decoration:none; border: 1px solid var(--blue); padding: 2px 6px; border-radius: 4px; display:inline-flex; align-items:center; gap:3px; background: rgba(59,130,246,0.1);">
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
          ${renderShippingStatus(o)}
          ${logisticsBadgeHtml}
          ${renderLabelStateMeta(o)}
          ${logisticsActionHtml}
        </div>
      </td>
      <td data-label="Doanh thu">
        <div class="revenue rev-positive">${fmt(revenue)}</div>
        ${feeHtml}
      </td>
      <td data-label="${escapeHtml(profitLabel)}">
        <div class="revenue ${profit>=0?'s-green':'s-red'}">${fmt(profit)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;font-weight:700;">${escapeHtml(profitLabel)}</div>
        <div style="font-size:10px;color:${o.cost_real > 0 ? 'var(--muted)' : 'var(--red)'};margin-top:2px;font-weight:600;">
           Vốn: ${fmt(o.cost_real || 0)}
        </div>
      </td>
      <td data-label="Shop / KH">
        <div class="shop-cell">
          <button type="button" class="oms-chat-open-btn" data-open-customer-chat="${escapeHtml(o.order_id || '')}" title="Mở Chat/CSKH mới theo đơn hàng">Nhắn khách</button>
          <div class="shop-name" title="${o.shop||'—'}">${o.shop||'—'}</div>
          ${o.customer_name ? `<div class="shop-customer">👤 ${o.customer_name}</div>` : ''}
          ${renderCustomerRiskBadge(o)}
        </div>
      </td>
    </tr>`
  }).join('')
  syncOmsFeePopupAfterRender()
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
    <span>Lãi trang: <b class="${totalPro>=0?'s-green':'s-red'}">${fmt(totalPro)}</b></span>
    ${cancels.length ? `<span>✗ Hủy: <b class="s-red">${cancels.length}</b></span>` : ''}
    ${returns.length ? `<span>↩ Hoàn: <b class="s-yellow">${returns.length}</b></span>` : ''}
  `
}

function readCachedBadges() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(OMS_BADGES_STORAGE_KEY)
      if (!raw) continue
      const payload = JSON.parse(raw)
      if (payload?.badges && typeof payload.badges === 'object') return payload.badges
    } catch {}
  }
  return null
}

function rememberBadges(badges) {
  if (!badges || typeof badges !== 'object') return
  const payload = JSON.stringify({ badges, cachedAt: new Date().toISOString() })
  for (const storage of [sessionStorage, localStorage]) {
    try {
      storage.setItem(OMS_BADGES_STORAGE_KEY, payload)
    } catch {}
  }
}

function applyBadges(badges = {}) {
  const countByAliases = (aliases, mainStatus = '') => String(aliases || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .reduce((sum, key) => {
      if (mainStatus) {
        const scopedShippingCount = badges[`${mainStatus}:shipping:${key}`]
        if (scopedShippingCount !== undefined) return sum + scopedShippingCount
        if (key === mainStatus) return sum + (badges[`oms:${key}`] || 0)
        return sum
      }
      return sum + (badges[`shipping:${key}`] ?? badges[`oms:${key}`] ?? 0)
    }, 0)

  document.querySelectorAll('.sub-badge[data-sub]').forEach(el => {
    const aliases = el.dataset.sub || ''
    const mainStatus = el.dataset.main || ''
    const count = aliases
      ? countByAliases(aliases, mainStatus)
      : (mainStatus ? (badges[`oms:${mainStatus}`] ?? badges[mainStatus] ?? 0) : 0)
    el.textContent = count
    el.style.display = (aliases || mainStatus) ? 'inline-flex' : 'none'
  })

  const mainCount = key => badges[`oms:${key}`] ?? badges[key] ?? 0
  const finalCounts = {
    'ALL': badges['ALL'] || 0,
    'UNPAID': mainCount('UNPAID'),
    'PENDING': mainCount('PENDING'),
    'SHIPPING': mainCount('SHIPPING'),
    'COMPLETED': mainCount('COMPLETED'),
    'CANCELLED': mainCount('CANCELLED'),
    'RETURN': mainCount('RETURN')
  }

  const keys = ['ALL', 'UNPAID', 'PENDING', 'SHIPPING', 'COMPLETED', 'CANCELLED', 'RETURN']
  keys.forEach(k => {
    const el = document.getElementById('cnt-' + k)
    if (el) el.textContent = finalCounts[k] || 0
  })
}

export function renderCachedBadgesIfAny() {
  const cached = readCachedBadges()
  if (cached) applyBadges(cached)
}

// ── 4. UPDATE BADGES (CALL API) ──────────────────────────────────────
export async function updateBadges(params = '') {
  try {
    const query = params instanceof URLSearchParams
      ? params.toString()
      : String(params || '').replace(/^\?/, '')
    const badges = await fetch(API + '/api/orders/badges' + (query ? `?${query}` : '')).then(r => r.json());
    
    applyBadges(badges)
    rememberBadges(badges)
  } catch (e) {
    console.error("Lỗi lấy dữ liệu đếm số tổng:", e);
    renderCachedBadgesIfAny()
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
