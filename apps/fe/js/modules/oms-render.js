// ==========================================
// MODULE: VẼ GIAO DIỆN BẢNG & PHÂN TRANG (VIEW LAYER)
// ==========================================
import { API } from '../oms-api.js';
import { fmt, fmtDate } from '../utils/helpers.js';

// ── 1. SHIPPING STATUS TAGS ──────────────────────────────────────────
export function renderShippingStatus(s) {
  const map = {
    'Chờ lấy hàng':  { color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: '📬' },
    'Chờ xác nhận':  { color: '#a78bfa', bg: 'rgba(167,139,250,.12)', icon: '🕐' },
    'Đang giao':      { color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  icon: '🚚' },
    'Đã giao':        { color: '#22c55e', bg: 'rgba(34,197,94,.12)',   icon: '✅' },
    'Đã hủy':         { color: '#ef4444', bg: 'rgba(239,68,68,.12)',   icon: '✗'  },
    'Hoàn hàng':      { color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '↩'  },
  }
  const info = map[s] || { color: 'var(--muted)', bg: 'var(--surface2)', icon: '—' }
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${info.bg};color:${info.color};border:1px solid ${info.color}33;white-space:nowrap">${info.icon} ${s||'Chưa rõ'}</span>`
}

// ── 2. RENDER MAIN TABLE ─────────────────────────────────────────────
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
      `<tr><td colspan="10"><div class="empty-state"><div class="icon">🔍</div><p>Không có đơn hàng nào</p></div></td></tr>`
    return
  }

  document.getElementById('omsTable').innerHTML = omsCache.map(o => {
    const profit   = o.profit_real || 0
    const revenue  = o.revenue || 0

    const pltHtml = {
      shopee:  `<span class="plt-tag plt-shopee">🛍 Shopee</span>`,
      tiktok:  `<span class="plt-tag plt-tiktok">🎵 TikTok</span>`,
      lazada:  `<span class="plt-tag plt-lazada">🛒 Lazada</span>`,
    }[o.platform] || `<span class="plt-tag">${o.platform||'—'}</span>`

    const omsInfo = {
      PENDING:           { icon: '🕐', label: 'Chờ xác nhận' },
      CONFIRMED:         { icon: '✅', label: 'Đã xác nhận' },
      PACKING:           { icon: '🗂️', label: 'Đang đóng gói' },
      PACKED:            { icon: '📦', label: 'Đã đóng gói' },
      HANDED_OVER:       { icon: '🚚', label: 'Giao shipper' },
      COMPLETED:         { icon: '🏆', label: 'Hoàn thành' },
      CANCELLED_TRANSIT: { icon: '✗',  label: 'Hủy vận chuyển' },
      FAILED_DELIVERY:   { icon: '⚠️', label: 'Giao thất bại' },
      RETURN_REFUND:     { icon: '↩',  label: 'Trả hàng' },
    }[o.oms_status] || { icon: '🕐', label: o.oms_status || 'PENDING' }

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

    let feeBreakdown = '';
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí cố định:</span> <b>${fmt(o.fee_platform)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí thanh toán:</span> <b>${fmt(o.fee_payment)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Affiliate/Freeship:</span> <b>${fmt(o.fee_affiliate)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Quảng cáo:</span> <b>${fmt(o.fee_ads)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Dịch vụ:</span> <b>${fmt(o.fee_service)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí PiShip:</span> <b>${fmt(o.fee_piship)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Đóng gói:</span> <b>${fmt(o.fee_packaging)}</b></div>`;
    feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px"><span>Phí Nhân công:</span> <b>${fmt(o.fee_labor)}</b></div>`;
    if (o.return_fee > 0) feeBreakdown += `<div style="display:flex;justify-content:space-between;gap:15px;color:var(--red)"><span>Phí Hoàn/Phạt:</span> <b>${fmt(o.return_fee)}</b></div>`;

    const feeHtml = o.fee ? `
      <div style="position: relative; margin-top: 6px; display: inline-block; cursor: pointer; text-align: left;" 
           onmouseleave="this.querySelector('.fee-dropdown-box').style.display = 'none'"
           onclick="const box = this.querySelector('.fee-dropdown-box'); box.style.display = box.style.display === 'block' ? 'none' : 'block'">
        <div style="font-size:11px; color:var(--orange); display:inline-flex; align-items:center; gap:4px; background: rgba(249,115,22,0.1); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(249,115,22,0.2); font-weight: 600;">
           Tổng Phí: ${fmt(o.fee)} <span style="font-size:9px">▼</span>
        </div>
        <div class="fee-dropdown-box" style="display: none; position: absolute; top: 100%; right: 0; background: var(--surface2); border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; z-index: 50; width: max-content; box-shadow: 0 8px 24px rgba(0,0,0,0.6); font-size: 12px; color: var(--text); margin-top: 5px;">
           <div style="font-weight:bold; color:var(--muted); margin-bottom: 8px; border-bottom: 1px dashed var(--border); padding-bottom: 6px;">BẢNG KÊ CHI TIẾT PHÍ SÀN</div>
           ${feeBreakdown || '<div style="color:var(--muted)">Chưa có dữ liệu chi tiết</div>'}
        </div>
      </div>
    ` : '';

    return `<tr class="${o.order_type==='cancel'?'':''}${o.order_type==='return'?'':''}" id="row-${o.order_id}">
      <td data-label="Chọn"><input type="checkbox" class="oms-chk" data-id="${o.order_id}" onchange="onCheck()"></td>
      <td data-label="Mặt hàng">
        ${itemsHtml}
        ${items.length > 1 ? `<div style="font-size:11px; color:var(--accent); font-weight: 600; margin-top: 6px; padding-left: 4px;">Tổng cộng: ${totalQty} sản phẩm</div>` : ''}
      </td>
      <td data-label="Mã đơn hàng">
        <div class="order-id">${o.order_id}<span class="order-id-copy" onclick="copyText('${o.order_id}')">⎘</span></div>
        ${o.tracking_number ? `<div style="font-size:10px;color:var(--teal);margin-top:3px;font-family:'IBM Plex Mono',monospace">${o.tracking_number}</div>` : ''}
        
        ${(o.oms_status !== 'PENDING') ? `
        <div style="margin-top: 6px;">
          <a href="${API}/api/label/${o.order_id}.pdf" target="_blank" style="font-size:10px; color:var(--blue); text-decoration:none; border: 1px solid var(--blue); padding: 2px 6px; border-radius: 4px; display:inline-flex; align-items:center; gap:3px; background: rgba(59,130,246,0.1);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Phiếu in
          </a>
        </div>` : ''}
      </td>
      <td data-label="Sàn">${pltHtml}</td>
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
      <td data-label="Sàn vận chuyển">
        <div style="font-weight: 600; font-size: 13px; color: var(--text); margin-bottom: 5px;">${o.shipping_carrier || 'Chưa rõ ĐVVC'}</div>
        ${renderShippingStatus(o.shipping_status || o.status)}
      </td>
      <td data-label="Kho (OMS)">
        <span class="oms-tag oms-${o.oms_status||'PENDING'}">
          <span class="dot"></span>${omsInfo.label}
        </span>
      </td>
      <td data-label="Loại">${typeHtml}</td>
      <td data-label="Thời gian">
        <div class="time-main">${fmtDate(o.order_date)}</div>
        <div class="time-cell" style="margin-top:2px">${o.order_date||'—'}</div>
      </td>
      <td data-label="Shop / KH">
        <div class="shop-cell">
          <div class="shop-name" title="${o.shop||'—'}">${o.shop||'—'}</div>
          ${o.customer_name ? `<div class="shop-customer">👤 ${o.customer_name}</div>` : ''}
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
export async function updateBadges() {
  try {
    const badges = await fetch(API + '/api/orders/badges').then(r => r.json());
    const keys = [
      'ALL', 'PENDING', 'CONFIRMED', 'PACKING', 'PACKED', 'HANDED_OVER', 'COMPLETED',
      'CANCELLED_TRANSIT', 'FAILED_DELIVERY', 'RETURN_REFUND',
      'normal', 'cancel', 'return', 'shopee', 'tiktok', 'lazada'
    ];
    keys.forEach(k => {
      const el = document.getElementById('cnt-' + k);
      if (el) el.textContent = badges[k] || 0;
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