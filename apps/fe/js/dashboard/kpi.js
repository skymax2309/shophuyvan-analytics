// ── DASHBOARD ────────────────────────────────────────────────────────
async function loadDashboard() {
  const qs = getFilterParams()

  const fromVal    = document.getElementById("filterFrom").value  || ""
  const toVal      = document.getElementById("filterTo").value    || ""
  const platVal    = document.getElementById("filterPlatform")?.value || ""
  const shopVal    = document.getElementById("filterShop")?.value    || ""
  const reportMonth = fromVal ? fromVal.substring(0, 7) : ""

  const rqsParts = []
  if (reportMonth) rqsParts.push("month=" + reportMonth)
  if (platVal)     rqsParts.push("platform=" + platVal)
  if (shopVal)     rqsParts.push("shop=" + encodeURIComponent(shopVal))
  const rqs = rqsParts.length ? "?" + rqsParts.join("&") : ""

  const oqsParts = []
  if (fromVal)  oqsParts.push("from=" + fromVal)
  if (toVal)    oqsParts.push("to="   + toVal)
  if (platVal)  oqsParts.push("platform=" + platVal)
  if (shopVal)  oqsParts.push("shop=" + encodeURIComponent(shopVal))
  const oqs = oqsParts.length ? "?" + oqsParts.join("&") : ""

  const [dash, revDay, profDay, platforms, shops, rptSum, opCosts, cancelStats] = await Promise.all([
    fetch(API + "/api/dashboard"        + qs).then(r => r.json()),
    fetch(API + "/api/revenue-by-day"   + qs).then(r => r.json()),
    fetch(API + "/api/profit-by-day"    + qs).then(r => r.json()),
    fetch(API + "/api/top-platform"     + qs).then(r => r.json()),
    fetch(API + "/api/top-shop"         + qs).then(r => r.json()),
    fetch(API + "/api/report-summary"   + rqs).then(r => r.json()).catch(() => ({})),
    fetch(API + "/api/operation-costs"  + oqs).then(r => r.json())
      .then(d => Array.isArray(d) ? d : (Array.isArray(d.costs) ? d.costs : []))
      .catch(() => []),
    fetch(API + "/api/cancel-stats" + qs).then(r => r.json()).catch(() => []),
  ])

  // ── KPI ────────────────────────────────────────────────────────────
  const totalOrders  = dash.total_orders  || 0
  const cancelOrders = dash.cancel_orders || 0
  const returnOrders = dash.return_orders || 0
  const allOrders    = dash.total_all_orders || totalOrders
  const cancelRate   = allOrders > 0 ? ((cancelOrders + returnOrders) / allOrders * 100).toFixed(1) : 0
const cancelRows = (Array.isArray(cancelStats) ? cancelStats : []).filter(r => r.order_type === "cancel")

  // ── PRE-COMPUTE ─────────────────────────────────────────────────────
  const opTotal = opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0)
  const rev     = dash.total_revenue || 0
  const revBC   = rptSum.total_gross_revenue || 0

  // Tab 1 — fees từ đơn import
  const t1_disc = dash.total_discount_shop  || 0
  const t1_comm = dash.total_platform_fee   || 0
  const t1_svc  = dash.total_service_fee    || 0
  const t1_pay  = dash.total_payment_fee    || 0
  // Tab 1 — fees từ báo cáo
  const t1_aff  = rptSum.total_fee_affiliate || 0
  const t1_ads  = rptSum.total_fee_ads       || 0
  const t1_pish = rptSum.total_fee_piship    || 0
  const t1_fee  = t1_disc + t1_comm + t1_svc + t1_pay + t1_aff + t1_ads + t1_pish

  const t1_tax_flat = rev * 0.015
  const t1_lhd      = rev - (dash.total_cost_invoice || 0) - opTotal - t1_fee
  const t1_tax_ln   = Math.max(0, t1_lhd * 0.17)
  const t1_ltt      = rev - (dash.total_cost_real || 0) - opTotal - t1_fee - t1_tax_flat
  const t1_ltt_hd   = rev - (dash.total_cost_real || 0) - opTotal - t1_fee - t1_tax_ln

  // Tab 2 — fees từ báo cáo
  const t2_refund  = rptSum.total_refund            || 0
  const t2_cofund  = rptSum.total_co_funded_voucher  || 0
  const t2_comm    = rptSum.total_fee_commission     || 0
  const t2_svc     = rptSum.total_fee_service        || 0
  const t2_pay     = rptSum.total_fee_payment        || 0
  const t2_aff     = rptSum.total_fee_affiliate      || 0
  const t2_ads     = rptSum.total_fee_ads            || 0
  const t2_pish    = rptSum.total_fee_piship         || 0
  const t2_fee     = t2_refund + t2_cofund + t2_comm + t2_svc + t2_pay + t2_aff + t2_ads + t2_pish

  const t2_tax_flat = revBC * 0.015
  const t2_lhd      = revBC - (dash.total_cost_invoice || 0) - opTotal - t2_fee
  const t2_tax_ln   = Math.max(0, t2_lhd * 0.17)
  const t2_ltt      = revBC - (dash.total_cost_real || 0) - opTotal - t2_fee - t2_tax_flat
  const t2_ltt_hd   = revBC - (dash.total_cost_real || 0) - opTotal - t2_fee - t2_tax_ln

  // Helpers
  const pc1 = (v) => rev   > 0 ? (v / rev   * 100).toFixed(1) + '%' : '–'
  const pc2 = (v) => revBC > 0 ? (v / revBC * 100).toFixed(1) + '%' : '–'
  const pcc = (a, b) => b > 0  ? (a / b     * 100).toFixed(1) + '%' : '–'

  const _row = (label, val, pctStr = '', color = '#374151') =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:1px 0">
       <span>${label}</span>
       <span style="display:flex;gap:8px;align-items:center">
         ${pctStr ? `<span style="font-size:10px;color:#9ca3af;min-width:38px;text-align:right">${pctStr}</span>` : ''}
         <span style="font-weight:600;color:${color};min-width:85px;text-align:right">${val}</span>
       </span>
     </div>`

  const _rowBold = (label, val, pctStr = '', color = '#374151') =>
    `<div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;border-top:1px dashed rgba(0,0,0,0.12);margin-top:5px;padding-top:5px">
       <span>${label}</span>
       <span style="display:flex;gap:8px;align-items:center">
         ${pctStr ? `<span style="font-size:10px;color:#9ca3af;min-width:38px;text-align:right">${pctStr}</span>` : ''}
         <span style="color:${color};min-width:85px;text-align:right">${val}</span>
       </span>
     </div>`

  const _sec = (label) =>
    `<div style="font-weight:700;color:#6b7280;font-size:10px;margin:7px 0 3px;letter-spacing:.4px">${label}</div>`

  const _card = (color, icon, label, value, sub, detail = '') => `
    <div class="kpi ${color}" ${detail ? `style="cursor:pointer" onclick="this.querySelector('.kd').style.display=this.querySelector('.kd').style.display==='none'?'block':'none'"` : ''}>
      <div class="kpi-icon">${icon}</div>
      <div class="kpi-label">${label}${detail ? ' <span style="font-size:10px;opacity:0.55">▼ chi tiết</span>' : ''}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub}</div>
      ${detail ? `<div class="kd" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:1.85;border-top:1px solid rgba(0,0,0,0.09);padding-top:6px">${detail}</div>` : ''}
    </div>`

  // Cancel detail helpers
  const cancelRowsAll    = Array.isArray(cancelStats) ? cancelStats : []
  const _cancelOrders    = cancelRowsAll.filter(r => r.order_type === 'cancel')
  const _returnOrders    = cancelRowsAll.filter(r => r.order_type === 'return')
  const allOrds          = dash.total_all_orders || 1

  const _cancelDetailBase = () => `
    ${_sec('✗ LÝ DO HỦY ĐƠN:')}
    ${_cancelOrders.length === 0
      ? '<div style="color:#aaa;font-size:10px">Không có đơn hủy</div>'
      : _cancelOrders.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:2px 0">
          <span style="max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151">
            <span style="background:${r.platform==='shopee'?'#ee4d2d':r.platform==='tiktok'?'#333':'#0f146d'};color:white;border-radius:3px;padding:1px 4px;font-size:9px">${(r.platform||'').toUpperCase()}</span>
            ${(r.cancel_reason || 'Không rõ').substring(0, 28)}
          </span>
          <span style="display:flex;gap:8px;flex-shrink:0">
            <span style="color:#9ca3af">${pcc(r.total_orders, allOrds)}</span>
            <span style="font-weight:700;min-width:40px;text-align:right">${r.total_orders} đơn</span>
          </span>
        </div>`).join('')}
    ${_sec('↩ ĐƠN TRẢ HÀNG / HOÀN TIỀN:')}
    ${_returnOrders.length === 0
      ? '<div style="color:#aaa;font-size:10px">Không có đơn hoàn</div>'
      : _returnOrders.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:2px 0">
          <span style="display:flex;gap:6px;align-items:center">
            <span style="background:${r.platform==='shopee'?'#ee4d2d':r.platform==='tiktok'?'#333':'#0f146d'};color:white;border-radius:3px;padding:1px 4px;font-size:9px">${(r.platform||'').toUpperCase()}</span>
            <span>${r.total_orders} đơn</span>
            <span style="color:#9ca3af">(${pcc(r.total_orders, allOrds)})</span>
          </span>
          <span style="font-weight:700;color:#ef4444">${fmt(r.total_revenue || 0)}</span>
        </div>`).join('')}`

  const _opCostDetail = () =>
    opCosts.length === 0
      ? '<div style="color:#aaa">Chưa có chi phí vận hành</div>'
      : opCosts.map(c => `
          <div style="margin-bottom:4px">
            <div style="display:flex;justify-content:space-between;font-weight:600">
              <span>${c.cost_name || c.cost_key}${c.shop ? ` <span style="background:#6b7280;color:white;border-radius:3px;padding:1px 4px;font-size:9px">${c.shop}</span>` : ''}</span>
              <span style="color:#16a34a">${c.actual_amount >= 1000 ? fmtShort(c.actual_amount) : fmt(c.actual_amount || 0)}</span>
            </div>
            <div style="font-size:10px;color:#aaa;padding-left:4px">
              ${fmtShort(c.cost_value)}/${c.calc_type === 'per_month' ? 'tháng' : 'đơn'}
              ${c.calc_type === 'per_month'
                ? ` × ${Number(c.months).toFixed(1)}th${c.note && c.note !== 'toàn bộ' ? ` × ${c.note}` : ''}`
                : ` × ${c.total_orders} đơn = ${fmt(c.actual_amount || 0)}đ`}
            </div>
          </div>`).join('')
      + `<div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #86efac;margin-top:4px;padding-top:4px">
           <span>Tổng vận hành</span><span style="color:#16a34a">${fmtShort(opTotal)}</span>
         </div>`

  document.getElementById("kpiGrid").innerHTML = `

    <!-- TAB BUTTONS -->
    <div style="grid-column:1/-1;display:flex;gap:10px;margin-bottom:8px">
      <button id="tabBtn1" onclick="switchDashTab(1)"
        style="padding:9px 22px;border-radius:9px;border:2px solid #3b82f6;background:#3b82f6;color:white;font-weight:700;cursor:pointer;font-size:13px">
        📦 Theo Đơn Import
      </button>
      <button id="tabBtn2" onclick="switchDashTab(2)"
        style="padding:9px 22px;border-radius:9px;border:2px solid #e5e7eb;background:white;color:#6b7280;font-weight:700;cursor:pointer;font-size:13px">
        📄 Theo Báo Cáo Sàn
      </button>
    </div>

    <!-- ═══════════════════════════════════════════ -->
    <!-- TAB 1: THEO ĐƠN IMPORT                      -->
    <!-- ═══════════════════════════════════════════ -->
    <div id="dashTab1" style="display:contents">

      ${_card('blue','📦','Đơn Thành Công',
        Number(dash.total_orders || 0).toLocaleString(),
        `Tổng ${Number(dash.total_all_orders || 0).toLocaleString()} đơn`
      )}

      ${_card('green','💰','Doanh Thu',
        fmtShort(rev), fmt(rev),
        `<div style="font-size:10px;color:#888;margin-bottom:4px">Tổng tiền người mua thanh toán (đã trừ hủy/hoàn)</div>
         ${_row('📦 DT đơn import', fmt(rev))}
         ${_row('✗ Đơn hủy/hoàn đã loại', `${(dash.total_all_orders||0)-(dash.total_orders||0)} đơn`, '', '#6b7280')}`
      )}

      ${_card('purple','📄','Lãi Hóa Đơn',
        fmtShort(t1_lhd), 'DT − Vốn HĐ − Phí − Vận hành',
        `${_row('Doanh thu', fmt(rev))}
         ${_row('− Vốn hóa đơn', fmt(dash.total_cost_invoice||0), pc1(dash.total_cost_invoice||0), '#ef4444')}
         ${_row('− Chi phí vận hành', fmt(opTotal), pc1(opTotal), '#ef4444')}
         ${_sec('− Phí sàn (từ đơn import):')}
         ${_row('  🏷️ Mã GG của Shop', fmt(t1_disc), pc1(t1_disc), '#ea580c')}
         ${_row('  📌 Phí cố định', fmt(t1_comm), pc1(t1_comm), '#ef4444')}
         ${_row('  🛎️ Phí Dịch Vụ', fmt(t1_svc), pc1(t1_svc), '#ef4444')}
         ${_row('  💳 Phí thanh toán', fmt(t1_pay), pc1(t1_pay), '#ef4444')}
         ${_sec('− Phí sàn (từ báo cáo):')}
         ${_row('  🤝 Tiếp Thị Liên Kết', fmt(t1_aff), pc1(t1_aff), '#ef4444')}
         ${_row('  📢 Phí ADS', fmt(t1_ads), pc1(t1_ads), '#ef4444')}
         ${_row('  🚚 PiShip', fmt(t1_pish), pc1(t1_pish), '#ef4444')}
         ${_rowBold('= Lãi Hóa Đơn', fmt(t1_lhd), pc1(t1_lhd), t1_lhd >= 0 ? '#10b981' : '#ef4444')}`
      )}

      ${_card('teal','🏦','Lãi Thực Tế',
        fmtShort(t1_ltt), 'DT − Vốn Thực − Phí − Thuế 1.5%',
        `${_row('Doanh thu', fmt(rev))}
         ${_row('− Vốn thực tế', fmt(dash.total_cost_real||0), pc1(dash.total_cost_real||0), '#ef4444')}
         ${_row('− Chi phí vận hành', fmt(opTotal), pc1(opTotal), '#ef4444')}
         ${_row('− Tổng phí sàn', fmt(t1_fee), pc1(t1_fee), '#ef4444')}
         ${_row('− Thuế khoán 1.5%', fmt(t1_tax_flat), '1.5%', '#ef4444')}
         ${_rowBold('= Lãi Thực Tế', fmt(t1_ltt), pc1(t1_ltt), t1_ltt >= 0 ? '#10b981' : '#ef4444')}`
      )}

      ${_card('teal','💎','Lãi TT (Thuế LN 17%)',
        fmtShort(t1_ltt_hd), 'DT − Vốn Thực − Phí − Thuế LN 17%',
        `${_row('Doanh thu', fmt(rev))}
         ${_row('− Vốn thực tế', fmt(dash.total_cost_real||0), pc1(dash.total_cost_real||0), '#ef4444')}
         ${_row('− Chi phí vận hành', fmt(opTotal), pc1(opTotal), '#ef4444')}
         ${_row('− Tổng phí sàn', fmt(t1_fee), pc1(t1_fee), '#ef4444')}
         ${_row('− Thuế LN 17%', fmt(t1_tax_ln), pcc(t1_tax_ln, rev), '#ef4444')}
         <div style="font-size:10px;color:#aaa;padding-left:8px">Lãi HĐ ${fmtShort(t1_lhd)} × 17%</div>
         ${_rowBold('= Lãi (sau thuế 17%)', fmt(t1_ltt_hd), pc1(t1_ltt_hd), t1_ltt_hd >= 0 ? '#10b981' : '#ef4444')}`
      )}

      ${_card('orange','📦','Vốn Hóa Đơn',
        fmtShort(dash.total_cost_invoice||0),
        `Thực tế: ${fmtShort(dash.total_cost_real||0)}`
      )}

      ${_card('orange','💵','Vốn Thực Tế',
        fmtShort(dash.total_cost_real||0),
        `HĐ: ${fmtShort(dash.total_cost_invoice||0)}`
      )}

      ${_card('orange','🏪','Tổng Phí Sàn',
        fmtShort(t1_fee), 'Import + Báo cáo',
        `${_sec('🛒 Từ đơn import:')}
         ${_row('🏷️ Mã giảm giá của Shop', fmt(t1_disc), pc1(t1_disc), '#ea580c')}
         ${_row('📌 Phí cố định', fmt(t1_comm), pc1(t1_comm))}
         ${_row('🛎️ Phí Dịch Vụ', fmt(t1_svc), pc1(t1_svc))}
         ${_row('💳 Phí thanh toán', fmt(t1_pay), pc1(t1_pay))}
         ${_sec('📄 Từ File Báo Cáo:')}
         ${_row('🤝 Phí Tiếp Thị Liên Kết', fmt(t1_aff), pc1(t1_aff))}
         ${_row('📢 Phí ADS', fmt(t1_ads), pc1(t1_ads))}
         ${_row('🚚 Phí PiShip', fmt(t1_pish), pc1(t1_pish))}
         ${_rowBold('Tổng phí sàn', fmt(t1_fee), pc1(t1_fee))}`
      )}

      ${_card('red','🧾','Thuế',
        fmtShort(t1_tax_flat), `Thuế LN 17%: ${fmtShort(t1_tax_ln)}`,
        `${_row('Thuế khoán 1.5%', fmt(t1_tax_flat), '1.5%', '#ef4444')}
         <div style="font-size:10px;color:#aaa;padding-left:8px">${fmt(rev)} × 1.5%</div>
         ${_row('Thuế Lợi Nhuận 17%', fmt(t1_tax_ln), pcc(t1_tax_ln, rev), '#ef4444')}
         <div style="font-size:10px;color:#aaa;padding-left:8px">Lãi HĐ ${fmt(t1_lhd)} × 17%</div>
         ${_rowBold('Tổng thuế', fmt(t1_tax_flat + t1_tax_ln), '', '#ef4444')}`
      )}

      ${_card('red','⚠️','Tỷ Lệ Hủy / Hoàn',
        pcc((dash.cancel_orders||0) + (dash.return_orders||0), allOrds),
        `Hủy: ${dash.cancel_orders||0} | Hoàn: ${dash.return_orders||0}`,
        _cancelDetailBase()
      )}

      ${_card('', '🏭', 'Chi Phí Vận Hành',
        fmtShort(opTotal), `Kỳ này: ${opCosts.length} khoản`,
        _opCostDetail()
      )}

    </div><!-- /dashTab1 -->

    <!-- ═══════════════════════════════════════════ -->
    <!-- TAB 2: THEO BÁO CÁO SÀN                     -->
    <!-- ═══════════════════════════════════════════ -->
    <div id="dashTab2" style="display:none">

    ${revBC === 0 ? `
      <div style="padding:50px 24px;text-align:center;color:#9ca3af;background:#f9fafb;border-radius:12px;border:2px dashed #e5e7eb">
        <div style="font-size:36px;margin-bottom:12px">📄</div>
        <div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:8px">Chưa có dữ liệu báo cáo sàn</div>
        <div style="font-size:13px">Upload file báo cáo Shopee để xem thống kê chi tiết theo báo cáo</div>
      </div>
    ` : `
      <div style="display:contents">

      ${_card('blue','📦','Đơn Thành Công',
        Number(dash.total_orders || 0).toLocaleString(),
        'Từ đơn import (cùng kỳ)'
      )}

      ${_card('green','💰','Doanh Thu (Báo Cáo)',
        fmtShort(revBC), fmt(revBC),
        `${_row('Tổng DT báo cáo sàn', fmt(revBC))}
         ${_row('DT đơn import', fmt(rev), '', '#6b7280')}
         ${_row('Chênh lệch', fmt(revBC - rev), '', Math.abs(revBC-rev)<10000?'#10b981':'#f59e0b')}`
      )}

      ${_card('purple','📄','Lãi Hóa Đơn (BC)',
        fmtShort(t2_lhd), 'DT BC − Vốn HĐ − Phí BC − Vận hành',
        `${_row('Doanh thu BC', fmt(revBC))}
         ${_row('− Vốn hóa đơn', fmt(dash.total_cost_invoice||0), pc2(dash.total_cost_invoice||0), '#ef4444')}
         ${_row('− Chi phí vận hành', fmt(opTotal), pc2(opTotal), '#ef4444')}
         ${_sec('− Tổng phí sàn BC:')}
         ${_row('  💸 Số tiền hoàn lại', fmt(t2_refund), pc2(t2_refund), '#ef4444')}
         ${_row('  🎁 Giảm giá & trợ giá', fmt(t2_cofund), pc2(t2_cofund), '#ef4444')}
         ${_row('  📌 Phí cố định', fmt(t2_comm), pc2(t2_comm), '#ef4444')}
         ${_row('  🛎️ Phí Dịch Vụ', fmt(t2_svc), pc2(t2_svc), '#ef4444')}
         ${_row('  💳 Phí thanh toán', fmt(t2_pay), pc2(t2_pay), '#ef4444')}
         ${_row('  🤝 Tiếp Thị Liên Kết', fmt(t2_aff), pc2(t2_aff), '#ef4444')}
         ${_row('  📢 Phí ADS', fmt(t2_ads), pc2(t2_ads), '#ef4444')}
         ${_row('  🚚 PiShip', fmt(t2_pish), pc2(t2_pish), '#ef4444')}
         ${_rowBold('= Lãi Hóa Đơn', fmt(t2_lhd), pc2(t2_lhd), t2_lhd >= 0 ? '#10b981' : '#ef4444')}`
      )}

      ${_card('teal','🏦','Lãi Thực Tế (BC)',
        fmtShort(t2_ltt), 'DT BC − Vốn Thực − Phí − Thuế 1.5%',
        `${_row('Doanh thu BC', fmt(revBC))}
         ${_row('− Vốn thực tế', fmt(dash.total_cost_real||0), pc2(dash.total_cost_real||0), '#ef4444')}
         ${_row('− Chi phí vận hành', fmt(opTotal), pc2(opTotal), '#ef4444')}
         ${_row('− Tổng phí sàn BC', fmt(t2_fee), pc2(t2_fee), '#ef4444')}
         ${_row('− Thuế khoán 1.5%', fmt(t2_tax_flat), '1.5%', '#ef4444')}
         ${_rowBold('= Lãi Thực Tế', fmt(t2_ltt), pc2(t2_ltt), t2_ltt >= 0 ? '#10b981' : '#ef4444')}`
      )}

      ${_card('teal','💎','Lãi TT (Thuế LN 17%) BC',
        fmtShort(t2_ltt_hd), 'DT BC − Vốn Thực − Phí − Thuế 17%',
        `${_row('Doanh thu BC', fmt(revBC))}
         ${_row('− Vốn thực tế', fmt(dash.total_cost_real||0), pc2(dash.total_cost_real||0), '#ef4444')}
         ${_row('− Chi phí vận hành', fmt(opTotal), pc2(opTotal), '#ef4444')}
         ${_row('− Tổng phí sàn BC', fmt(t2_fee), pc2(t2_fee), '#ef4444')}
         ${_row('− Thuế LN 17%', fmt(t2_tax_ln), pcc(t2_tax_ln, revBC), '#ef4444')}
         <div style="font-size:10px;color:#aaa;padding-left:8px">Lãi HĐ ${fmtShort(t2_lhd)} × 17%</div>
         ${_rowBold('= Lãi (sau thuế 17%)', fmt(t2_ltt_hd), pc2(t2_ltt_hd), t2_ltt_hd >= 0 ? '#10b981' : '#ef4444')}`
      )}

      ${_card('orange','📦','Vốn Hóa Đơn',
        fmtShort(dash.total_cost_invoice||0),
        `Thực tế: ${fmtShort(dash.total_cost_real||0)}`
      )}

      ${_card('orange','💵','Vốn Thực Tế',
        fmtShort(dash.total_cost_real||0),
        `HĐ: ${fmtShort(dash.total_cost_invoice||0)}`
      )}

      ${_card('orange','🏪','Tổng Phí Sàn (BC)',
        fmtShort(t2_fee), 'Từ File Báo Cáo',
        `${_row('💸 Số tiền hoàn lại', fmt(t2_refund), pc2(t2_refund))}
         ${_row('🎁 Giảm giá & trợ giá', fmt(t2_cofund), pc2(t2_cofund))}
         ${_row('📌 Phí cố định', fmt(t2_comm), pc2(t2_comm))}
         ${_row('🛎️ Phí Dịch Vụ', fmt(t2_svc), pc2(t2_svc))}
         ${_row('💳 Phí thanh toán', fmt(t2_pay), pc2(t2_pay))}
         ${_row('🤝 Phí Tiếp Thị Liên Kết', fmt(t2_aff), pc2(t2_aff))}
         ${_row('📢 Phí ADS', fmt(t2_ads), pc2(t2_ads))}
         ${_row('🚚 Phí PiShip', fmt(t2_pish), pc2(t2_pish))}
         ${_rowBold('Tổng', fmt(t2_fee), pc2(t2_fee))}`
      )}

      ${_card('red','🧾','Thuế (BC)',
        fmtShort(t2_tax_flat), `Thuế LN 17%: ${fmtShort(t2_tax_ln)}`,
        `${_row('Thuế khoán 1.5%', fmt(t2_tax_flat), '1.5%', '#ef4444')}
         <div style="font-size:10px;color:#aaa;padding-left:8px">${fmt(revBC)} × 1.5%</div>
         ${_row('Thuế Lợi Nhuận 17%', fmt(t2_tax_ln), pcc(t2_tax_ln, revBC), '#ef4444')}
         <div style="font-size:10px;color:#aaa;padding-left:8px">Lãi HĐ ${fmt(t2_lhd)} × 17%</div>
         ${_rowBold('Tổng thuế', fmt(t2_tax_flat + t2_tax_ln), '', '#ef4444')}`
      )}

      ${_card('red','⚠️','Tỷ Lệ Hủy / Hoàn',
        pcc((dash.cancel_orders||0) + (dash.return_orders||0), allOrds),
        `Hủy: ${dash.cancel_orders||0} | Hoàn: ${dash.return_orders||0}`,
       _cancelDetailBase() + `
          ${_sec('📦 PHÍ VẬN CHUYỂN TRẢ HÀNG (BÁO CÁO):')}
          ${_row('🚫 Giao hàng không thành công', fmt(dash.shopee_failed_delivery_fee || 0), pcc(dash.shopee_failed_delivery_fee||0, revBC), '#f59e0b')}
          ${_row('↩ Trả hàng / Hoàn tiền', fmt(dash.shopee_return_fee || 0), pcc(dash.shopee_return_fee||0, revBC), '#ef4444')}
          ${_rowBold('Tổng phí VC trả hàng', fmt((dash.shopee_failed_delivery_fee||0)+(dash.shopee_return_fee||0)), '', '#ef4444')}
        `
      )}

      ${_card('', '🏭', 'Chi Phí Vận Hành',
        fmtShort(opTotal), `Kỳ này: ${opCosts.length} khoản`,
        _opCostDetail()
      )}

      </div>
    `}

    </div><!-- /dashTab2 -->
  `

  // ── CHARTS ─────────────────────────────────────────────────────────
  makeChart("chartRevenue", "bar",
    revDay.map(r => r.d),
    [{
      label: "Doanh thu",
      data: revDay.map(r => r.revenue),
      backgroundColor: "#3b82f620",
      borderColor: "#3b82f6",
      borderWidth: 2, fill: true, tension: 0.3,
    }],
    { extra: { plugins: { legend: { display: false } } } }
  )

  makeChart("chartProfit", "line",
    profDay.map(r => r.d),
    [
      {
        label: "Lãi thực",
        data: profDay.map(r => r.profit_real),
        borderColor: "#10b981", backgroundColor: "#10b98115",
        fill: true, tension: 0.3, borderWidth: 2,
      },
      {
        label: "Lãi HĐ",
        data: profDay.map(r => r.profit_invoice),
        borderColor: "#8b5cf6", backgroundColor: "transparent",
        tension: 0.3, borderWidth: 2, borderDash: [4, 3],
      }
    ],
    { legend: true }
  )

  const platformColors = { shopee: "#ee4d2d", tiktok: "#010101", lazada: "#0f146d" }
  makeChart("chartPlatform", "doughnut",
    platforms.map(r => r.platform),
    [{
      data: platforms.map(r => r.total_revenue),
      backgroundColor: platforms.map(r => platformColors[r.platform] || "#888"),
    }],
    { legend: true }
  )

  makeChart("chartShop", "bar",
    shops.map(r => r.shop),
    [{
      label: "Doanh thu",
      data: shops.map(r => r.total_revenue),
      backgroundColor: "#4f46e5",
      borderRadius: 6,
    }],
    {}
  )

  buildShopTree(shops)
}