// ── DASHBOARD MAIN ───────────────────────────────────────────────────
// Requires (globals): API, fmt, fmtShort, fmtFull, pct, profitClass,
//   makeChart, getFilterParams, drpState, selectedShops, buildShopTree,
//   renderShopTags, applyFilter, initDRP, applyPreset,
//   closeAllPickers, closeDRP, closeShopPicker, _justClickedInside

let allProducts    = []
let currentFilters = {}

// ── TABS ─────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"))
  document.getElementById("tab-" + name).classList.add("active")
  document.querySelectorAll(".topbar nav a").forEach((a, i) => {
    a.classList.toggle("active", i === ["dashboard", "top", "cancel", "calc"].indexOf(name))
  })
  if (name === "top") {
    loadTop()
    populateSkuShopFilter()
    loadTopSkuFull()
  }
  if (name === "cancel") loadCancel()
}

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
              <span style="color:#16a34a">${fmtShort(c.actual_amount || 0)}</span>
            </div>
            <div style="font-size:10px;color:#aaa;padding-left:4px">
              ${fmtShort(c.cost_value)}/${c.calc_type === 'per_month' ? 'tháng' : 'đơn'}
              ${c.calc_type === 'per_month'
                ? ` × ${c.months}th${c.note && c.note !== 'toàn bộ' ? ` × ${c.note}` : ''}`
                : ` × ${c.total_orders} đơn`}
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

// ── TOP SKU / PRODUCT / SHOP ─────────────────────────────────────────
async function loadTop() {
  const qs = getFilterParams()
  const [skus, products, shops] = await Promise.all([
    fetch(API + "/api/top-sku"     + qs + (qs ? "&" : "?") + "limit=20").then(r => r.json()),
    fetch(API + "/api/top-product" + qs + (qs ? "&" : "?") + "limit=20").then(r => r.json()),
    fetch(API + "/api/top-shop"    + qs).then(r => r.json()),
  ])

  document.getElementById("topSkuTable").innerHTML = skus.map((r, i) => `
    <tr>
      <td style="color:#aaa">${i + 1}</td>
      <td><code style="font-size:12px">${r.sku}</code></td>
      <td>${Number(r.total_qty).toLocaleString()}</td>
      <td>${fmtShort(r.total_revenue)}</td>
      <td class="${profitClass(r.total_profit)}">${fmtShort(r.total_profit)}</td>
    </tr>`).join("")

  document.getElementById("topProductTable").innerHTML = products.map((r, i) => `
    <tr>
      <td style="color:#aaa">${i + 1}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.product_name}">${r.product_name}</td>
      <td>${Number(r.total_qty).toLocaleString()}</td>
      <td>${fmtShort(r.total_revenue)}</td>
      <td class="${profitClass(r.total_profit)}">${fmtShort(r.total_profit)}</td>
    </tr>`).join("")

  document.getElementById("topShopTable").innerHTML = shops.map(r => `
    <tr>
      <td><span class="badge badge-${r.platform}">${r.platform.toUpperCase()}</span></td>
      <td>${r.shop}</td>
      <td>${Number(r.total_orders).toLocaleString()}</td>
      <td>${fmtShort(r.total_revenue)}</td>
      <td class="${profitClass(r.total_profit)}">${fmtShort(r.total_profit)}</td>
    </tr>`).join("")
}

function renderFeeTable(platform, d, total) {
  const cfg = {
    tiktok:  { color: "#333",    failed_count: d.tiktok_failed_delivery_count  || 0, failed_fee: d.tiktok_failed_delivery_fee  || 0, free_count: d.tiktok_free_cancel_count  || 0, return_count: d.tiktok_return_count  || 0, return_fee: (d.tiktok_return_count  || 0) * 4620, total_fee: d.total_tiktok_cancel_fee  || 0 },
    shopee:  { color: "#ee4d2d", failed_count: d.shopee_failed_delivery_count  || 0, failed_fee: d.shopee_failed_delivery_fee  || 0, free_count: d.shopee_free_cancel_count  || 0, return_count: d.shopee_return_count  || 0, return_fee: d.shopee_return_fee  || 0, total_fee: d.total_shopee_cancel_fee  || 0 },
    lazada:  { color: "#0f146d", failed_count: d.lazada_failed_delivery_count  || 0, failed_fee: d.lazada_failed_delivery_fee  || 0, free_count: d.lazada_free_cancel_count  || 0, return_count: d.lazada_return_count  || 0, return_fee: d.lazada_return_fee  || 0, total_fee: d.total_lazada_cancel_fee  || 0 },
  }
  const c = cfg[platform]
  const name = platform.charAt(0).toUpperCase() + platform.slice(1)
  return `
    <div style="margin-top:16px;margin-bottom:8px;font-size:12px;font-weight:700;color:#888">
      📋 CHI TIẾT PHÍ BỊ TRỪ —
      <span style="background:${c.color};color:white;border-radius:4px;padding:2px 8px">${name.toUpperCase()}</span>
    </div>
    <div style="background:#fafafa;border-radius:8px;overflow:hidden;border:1px solid #f0f0f0;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:11px;font-weight:700;color:#888;padding:8px 12px;border-bottom:1px solid #f0f0f0;background:#f5f5f5">
        <span>Loại đơn</span><span style="text-align:center">Số đơn</span><span style="text-align:center">Tỉ lệ</span><span style="text-align:right">Phí bị trừ</span>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;border-bottom:1px solid #f0f0f0;align-items:center">
        <div>
          <div style="font-weight:600;color:#16a34a">✅ Hủy không mất phí</div>
          <div style="font-size:11px;color:#888">Khách hủy sớm / hết hàng / tự động hủy</div>
        </div>
        <div style="text-align:center;font-weight:700">${c.free_count}</div>
        <div style="text-align:center;color:#888">${pct(c.free_count, total)}</div>
        <div style="text-align:right;font-weight:700;color:#16a34a">0 đ</div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;border-bottom:1px solid #f0f0f0;align-items:center">
        <div>
          <div style="font-weight:600;color:#f59e0b">⚠️ Giao hàng thất bại</div>
          <div style="font-size:11px;color:#888">Shipper không giao được — sàn thu phí hoàn</div>
        </div>
        <div style="text-align:center;font-weight:700">${c.failed_count}</div>
        <div style="text-align:center;color:#888">${pct(c.failed_count, total)}</div>
        <div style="text-align:right;font-weight:700;color:#f59e0b">${fmt(c.failed_fee)}</div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;border-bottom:1px solid #f0f0f0;align-items:center">
        <div>
          <div style="font-weight:600;color:#ef4444">↩️ Trả hàng / Hoàn tiền</div>
          <div style="font-size:11px;color:#888">Khách trả hàng — sàn thu phí SFR + xử lý</div>
        </div>
        <div style="text-align:center;font-weight:700">${c.return_count}</div>
        <div style="text-align:center;color:#888">${pct(c.return_count, total)}</div>
        <div style="text-align:right;font-weight:700;color:#ef4444">${fmt(c.return_fee)}</div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;background:#fff8f8;align-items:center;font-weight:700">
        <div>Tổng phí ${name} bị trừ</div>
        <div style="text-align:center">${c.failed_count + c.return_count}</div>
        <div style="text-align:center;color:#888">${pct(c.failed_count + c.return_count, total)}</div>
        <div style="text-align:right;color:#ef4444">${fmt(c.total_fee)}</div>
      </div>
    </div>`
}

async function loadCancel() {
  const qs = getFilterParams()
  const [dash, stats] = await Promise.all([
    fetch(API + "/api/dashboard"    + qs).then(r => r.json()),
    fetch(API + "/api/cancel-stats" + qs).then(r => r.json()),
  ])

  const total      = dash.total_all_orders || 1
  const cancelRows = stats.filter(r => r.order_type === "cancel")
  const returnRows = stats.filter(r => r.order_type === "return")
  const totalCancel = cancelRows.reduce((s, r) => s + r.total_orders, 0)
  const totalReturn = returnRows.reduce((s, r) => s + r.total_orders, 0)

  const byPlatform = {}
  stats.forEach(r => {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = { cancel: 0, return: 0 }
    if (r.order_type === "cancel") byPlatform[r.platform].cancel += r.total_orders
    if (r.order_type === "return") byPlatform[r.platform].return += r.total_orders
  })

  const plts = Object.keys(byPlatform)
  makeChart("chartCancel", "bar", plts, [
    {
      label: "Đơn hủy",
      data: plts.map(p => byPlatform[p].cancel),
      backgroundColor: "#ef444480", borderColor: "#ef4444", borderWidth: 2, borderRadius: 6,
    },
    {
      label: "Đơn hoàn",
      data: plts.map(p => byPlatform[p].return),
      backgroundColor: "#f59e0b80", borderColor: "#f59e0b", borderWidth: 2, borderRadius: 6,
    }
  ], {
    legend: true,
    extra: { plugins: { legend: { display: true } }, scales: { y: { ticks: { stepSize: 1 } } } }
  })

  document.getElementById("cancelStats").innerHTML = `
    <div style="padding:20px">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px">📊 Thống kê hủy / hoàn</div>
      <div class="stat-row">
        <div>
          <div style="font-weight:600">Tổng đơn hủy</div>
          <div class="stat-bar" style="width:${Math.min(100, totalCancel / total * 100 * 5)}%;background:linear-gradient(90deg,#ef4444,#fca5a5)"></div>
        </div>
        <div style="font-weight:700;color:#ef4444">${totalCancel} đơn (${pct(totalCancel, total)})</div>
      </div>
      <div class="stat-row">
        <div>
          <div style="font-weight:600">Tổng đơn hoàn</div>
          <div class="stat-bar" style="width:${Math.min(100, totalReturn / total * 100 * 5)}%;background:linear-gradient(90deg,#f59e0b,#fde68a)"></div>
        </div>
        <div style="font-weight:700;color:#f59e0b">${totalReturn} đơn (${pct(totalReturn, total)})</div>
      </div>
      <div class="stat-row">
        <div style="font-weight:600">💸 Tổng phí bị trừ (hủy + hoàn)</div>
        <div style="font-weight:700;color:#ef4444">${fmt(dash.total_return_fee)}</div>
      </div>
      ${renderFeeTable('tiktok', dash, total)}
      ${renderFeeTable('shopee', dash, total)}
      ${renderFeeTable('lazada', dash, total)}
      <div style="margin-top:16px;font-size:12px;font-weight:700;color:#888;margin-bottom:8px">LÝ DO HỦY PHỔ BIẾN</div>
      ${cancelRows.slice(0, 5).map(r => `
        <div class="stat-row">
          <div style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${r.cancel_reason || "Không rõ"}">
            <span class="badge badge-${r.platform}" style="margin-right:4px">${r.platform}</span>
            ${(r.cancel_reason || "Không rõ").substring(0, 40)}${(r.cancel_reason || "").length > 40 ? "..." : ""}
          </div>
          <div style="font-weight:600">${r.total_orders} đơn</div>
        </div>`).join("")}
    </div>`
}

// ── TOP SKU FULL ──────────────────────────────────────────────────────
let _allSkuShops = []  // cache danh sách shop cho filter

async function populateSkuShopFilter() {
  // Load danh sách shop từ API 1 lần
  if (_allSkuShops.length > 0) return
  try {
    const shops = await fetch(API + "/api/top-shop").then(r => r.json())
    _allSkuShops = shops
    const sel = document.getElementById("skuFilterShop")
    // Group theo shop name
    const uniqueShops = [...new Map(shops.map(s => [s.shop, s])).values()]
    uniqueShops.forEach(s => {
      const opt = document.createElement("option")
      opt.value = s.shop
      opt.textContent = `[${s.platform.toUpperCase()}] ${s.shop}`
      sel.appendChild(opt)
    })
  } catch(e) { console.warn("Không load được shop filter", e) }
}

async function loadTopSkuFull() {
  const platform = document.getElementById("skuFilterPlatform").value
  const shop     = document.getElementById("skuFilterShop").value
  const sort     = document.getElementById("skuFilterSort").value
  const search   = document.getElementById("skuFilterSearch").value.trim().toLowerCase()

  // Dùng filter ngày từ filter bar chính
  const from = document.getElementById("filterFrom").value
  const to   = document.getElementById("filterTo").value

  const parts = []
  if (from)     parts.push("from="     + from)
  if (to)       parts.push("to="       + to)
  if (platform) parts.push("platform=" + platform)
  if (shop)     parts.push("shop="     + encodeURIComponent(shop))
  if (sort)     parts.push("sort="     + sort)
  const qs = parts.length ? "?" + parts.join("&") : ""

  document.getElementById("topSkuFullTable").innerHTML =
    `<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">⏳ Đang tải...</td></tr>`

  try {
    let data = await fetch(API + "/api/top-sku-full" + qs).then(r => r.json())

    // Filter search phía client
    if (search) {
      data = data.filter(s =>
        (s.sku          || "").toLowerCase().includes(search) ||
        (s.product_name || "").toLowerCase().includes(search)
      )
    }

    document.getElementById("skuFilterCount").textContent =
      `Tìm thấy ${data.length} SKU`

    const totalQty = data.reduce((s, r) => s + (r.total_qty || 0), 0)
    const totalRev = data.reduce((s, r) => s + (r.total_revenue || 0), 0)
    document.getElementById("skuTotalSummary").textContent =
      `Tổng: ${Number(totalQty).toLocaleString()} sản phẩm | ${fmt(totalRev)} doanh thu`

    if (data.length === 0) {
      document.getElementById("topSkuFullTable").innerHTML =
        `<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">Không có dữ liệu</td></tr>`
      return
    }

    document.getElementById("topSkuFullTable").innerHTML = data.map((r, i) => {
      const pctProfit = r.total_revenue > 0
        ? ((r.total_profit / r.total_revenue) * 100).toFixed(1)
        : 0
      const profitColor = r.total_profit >= 0 ? "#10b981" : "#ef4444"
      // Platforms badge
      const plts = (r.platforms || "").split(",").filter(Boolean)
      const pltBadges = plts.map(p => {
        const bg = p === "shopee" ? "#ee4d2d" : p === "tiktok" ? "#333" : "#0f146d"
        return `<span style="background:${bg};color:white;border-radius:3px;padding:1px 5px;font-size:10px;margin-right:2px">${p.toUpperCase()}</span>`
      }).join("")

      return `<tr style="${(r.total_profit||0)<0?'background:#fff1f2':''}">
        <td style="text-align:center;color:#9ca3af;font-size:12px">${i+1}</td>
        <td style="font-family:monospace;font-size:12px;font-weight:600">${r.sku||"—"}</td>
        <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.product_name||""}">${(r.product_name||"—").substring(0,40)}${(r.product_name||"").length>40?"...":""}</td>
        <td style="text-align:center">${pltBadges}</td>
        <td style="text-align:center;font-weight:700;font-size:15px">${Number(r.total_qty||0).toLocaleString()}</td>
        <td style="text-align:center;color:#6b7280">${Number(r.total_orders||0).toLocaleString()}</td>
        <td style="text-align:right;color:#3b82f6;font-weight:600">${fmt(r.total_revenue)}</td>
        <td style="text-align:right;font-weight:700;color:${profitColor}">${fmt(r.total_profit)}</td>
        <td style="text-align:right;color:${profitColor}">${pctProfit}%</td>
      </tr>`
    }).join("")
  } catch(e) {
    document.getElementById("topSkuFullTable").innerHTML =
      `<tr><td colspan="9" style="text-align:center;padding:20px;color:#ef4444">❌ Lỗi: ${e.message}</td></tr>`
  }
}

// ── PRICE CALCULATOR ─────────────────────────────────────────────────
async function loadProducts() {
  const data = await fetch(API + "/api/products").then(r => r.json())
  allProducts = data
  const sel = document.getElementById("calcSku")
  data.forEach(p => {
    const opt = document.createElement("option")
    opt.value       = p.sku
    opt.textContent = p.sku
    sel.appendChild(opt)
  })
}

function onSkuChange() {
  const sku = document.getElementById("calcSku").value
  const p   = allProducts.find(x => x.sku === sku)
  if (p) {
    document.getElementById("calcInfo").innerHTML =
      `<b>${p.product_name || sku}</b> &nbsp;|&nbsp; Vốn thực: <b>${fmt(p.cost_real)}</b> &nbsp;|&nbsp; Vốn HĐ: <b>${fmt(p.cost_invoice)}</b>`
  } else {
    document.getElementById("calcInfo").innerHTML = ""
  }
}

function renderCalcResult(res) {
  const price    = res.sell_price || 0
  const pctOf    = v => price > 0 ? ((v / price) * 100).toFixed(1) + "%" : "—"
  const profitPct = price > 0 ? ((res.profit_real / price) * 100).toFixed(1) : 0
  const isLoss   = res.is_loss || res.profit_real < 0

  document.getElementById("calcResult").style.display = "block"
  document.getElementById("r_price").textContent       = fmt(price)

  const profitEl = document.getElementById("r_profit_real")
  profitEl.textContent  = fmt(res.profit_real)
  profitEl.style.color  = isLoss ? "#ef4444" : "#10b981"
  document.getElementById("r_profit_pct").textContent  = `${profitPct}% trên giá bán`
  document.getElementById("r_profit_inv").textContent  = fmt(res.profit_invoice)

  // Breakdown chi tiết
  const rows = [
    { label: "💰 Giá bán",                  val: price,            pct: "100%",          color: "#2563eb", bold: true },
    { label: "📦 Vốn thực tế",              val: -res.cost_real,   pct: pctOf(res.cost_real),    color: "#7c3aed" },
    { label: "📄 Vốn hóa đơn",              val: -res.cost_invoice,pct: pctOf(res.cost_invoice), color: "#8b5cf6", sub: true },
    { label: "🏪 Hoa hồng sàn (Commission)",val: -(res.fee_platform||0), pct: pctOf(res.fee_platform||0), color: "#f59e0b" },
    { label: "💳 Phí thanh toán (TT)",       val: -(res.fee_payment||0),  pct: pctOf(res.fee_payment||0),  color: "#f59e0b" },
    { label: "🤝 Affiliate",                 val: -(res.fee_affiliate||0),pct: pctOf(res.fee_affiliate||0),color: "#f59e0b" },
    { label: "📢 Quảng cáo (Ads)",           val: -(res.fee_ads||0),      pct: pctOf(res.fee_ads||0),      color: "#f59e0b" },
    { label: "🚚 PiShip / SFR",              val: -(res.fee_piship||0),   pct: pctOf(res.fee_piship||0),   color: "#f59e0b" },
    { label: "🧾 Thuế khoán (1.5%)",         val: -(res.tax_flat||0),     pct: pctOf(res.tax_flat||0),     color: "#ef4444" },
    { label: "📑 Thuế LN (17% Lãi HĐ)",     val: -(res.tax_income||0),   pct: pctOf(res.tax_income||0),   color: "#ef4444" },
  ]

  const totalFeeAmt = (res.fee_platform||0)+(res.fee_payment||0)+(res.fee_affiliate||0)+(res.fee_ads||0)+(res.fee_piship||0)
  rows.splice(7, 0, {
    label: "  └ Tổng phí sàn",
    val: -totalFeeAmt,
    pct: pctOf(totalFeeAmt),
    color: "#d97706", sub: true, bold: false
  })

  document.getElementById("calcBreakdown").innerHTML = rows.map(r => {
    const absVal = Math.abs(r.val)
    const barPct = price > 0 ? Math.min((absVal / price) * 100, 100) : 0
    const barColor = r.val > 0 ? "#3b82f6" : (r.color || "#f59e0b")
    return `
      <div style="padding:7px 0;border-bottom:1px solid #f3f4f6;${r.sub ? 'padding-left:16px;opacity:0.85' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;color:#374151;${r.bold ? 'font-weight:700' : ''}">${r.label}</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:11px;color:#9ca3af;min-width:40px;text-align:right">${r.pct}</span>
            <span style="font-size:13px;font-weight:600;color:${r.color};min-width:90px;text-align:right">${r.val >= 0 ? '' : '− '}${fmt(absVal)}</span>
          </div>
        </div>
        <div style="height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:2px;transition:width 0.3s"></div>
        </div>
      </div>`
  }).join("") + `
    <div style="padding:10px 0;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #e5e7eb;margin-top:4px">
      <span style="font-size:13px;font-weight:700;color:#374151">✅ Lãi thực (bỏ túi)</span>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:11px;color:#9ca3af">${profitPct}%</span>
        <span style="font-size:15px;font-weight:800;color:${isLoss ? '#ef4444' : '#10b981'}">${fmt(res.profit_real)}</span>
      </div>
    </div>`

  const warn = document.getElementById("warnLoss")
  if (isLoss) {
    const minP = Math.ceil((res.cost_real + totalFeeAmt + (res.tax_flat||0)) / 0.97)
    document.getElementById("minPrice").textContent = Number(minP).toLocaleString("vi-VN")
    warn.style.display = "block"
  } else {
    warn.style.display = "none"
  }
}

async function runCalc() {
  const sku      = document.getElementById("calcSku").value
  const platform = document.getElementById("calcPlatform").value
  const price    = parseFloat(document.getElementById("calcPrice").value)
  if (!sku || !price) { alert("Chọn SKU và nhập giá!"); return }

  const res = await fetch(API + "/api/price-calc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku, sell_price: price, platform })
  }).then(r => r.json())

  renderCalcResult(res)
}

async function calcByTargetProfit() {
  const sku      = document.getElementById("calcSku").value
  const platform = document.getElementById("calcPlatform").value
  const targetPct = parseFloat(document.getElementById("calcTargetPct").value) || 20
  if (!sku) { alert("Chọn SKU trước!"); return }

  // Tính giá bán hợp lý bằng binary search
  // profit_real = price - cost_real - total_fee - tax_flat - tax_income
  // target: profit_real / price = targetPct / 100
  // Tìm price sao cho profit_real/price ≈ targetPct/100

  let lo = 1000, hi = 50000000, bestPrice = lo
  for (let i = 0; i < 40; i++) {
    const mid = Math.round((lo + hi) / 2)
    const res = await fetch(API + "/api/price-calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, sell_price: mid, platform })
    }).then(r => r.json())

    const actualPct = mid > 0 ? (res.profit_real / mid) * 100 : 0
    if (actualPct < targetPct) lo = mid + 1
    else { bestPrice = mid; hi = mid - 1 }
  }

  // Làm tròn đẹp lên bội số 1000
  bestPrice = Math.ceil(bestPrice / 1000) * 1000

  document.getElementById("autoCalcResult").innerHTML =
    `→ Giá bán hợp lý: <span style="font-size:16px;color:#7c3aed;font-weight:800">${Number(bestPrice).toLocaleString("vi-VN")}đ</span>`

  // Tự điền vào ô giá và chạy tính
  document.getElementById("calcPrice").value = bestPrice
  const finalRes = await fetch(API + "/api/price-calc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku, sell_price: bestPrice, platform })
  }).then(r => r.json())
  renderCalcResult(finalRes)
}

function clearAutoCalc() {
  document.getElementById("autoCalcResult").innerHTML = ""
}

// ── EXPORT ───────────────────────────────────────────────────────────
async function exportData() {
  const qs     = getFilterParams()
  const orders = await fetch(API + "/api/export-orders" + qs).then(r => r.json())
  const rows   = [
    ["Ngày","Sàn","Shop","Mã đơn","SKU","Tên SP","SL","Doanh thu","Vốn thực","Phí","Lãi thực","Loại đơn"],
    ...orders.map(o => [
      o.order_date, o.platform, o.shop, o.order_id, o.sku, o.product_name,
      o.qty, o.revenue, o.cost_real, o.fee, o.profit_real, o.order_type
    ])
  ]
  const csv  = rows.map(r => r.join(",")).join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const a    = document.createElement("a")
  a.href     = URL.createObjectURL(blob)
  a.download = "shophuyvan_export.csv"
  a.click()
}

function toggleFeeDetail() {
  const d = document.getElementById("feeDetail")
  if (d) d.style.display = d.style.display === "none" ? "block" : "none"
}

// ── CLOSE PICKERS ON OUTSIDE CLICK ──────────────────────────────────
document.addEventListener("click", e => {
  if (_justClickedInside) { _justClickedInside = false; return }
  const drpPanel = document.getElementById("drpPanel")
  const drpInput = document.getElementById("drpInput")
  const shopWrap = document.getElementById("shopPickerWrap")
  const drpOpen  = drpPanel && drpPanel.classList.contains("open")
  if (drpOpen && !drpPanel.contains(e.target) && !drpInput.contains(e.target)) closeDRP()
  if (shopWrap && !shopWrap.contains(e.target)) {
    const panel = document.getElementById("shopPickerPanel")
    if (panel && panel.classList.contains("open")) closeShopPicker()
  }
})

// ── INIT ─────────────────────────────────────────────────────────────
async function init() {
  applyPreset("thismonth")
  await loadDashboard()
  await loadProducts()
}

window.switchDashTab = (n) => {
  const t1 = document.getElementById('dashTab1')
  const t2 = document.getElementById('dashTab2')
  const b1 = document.getElementById('tabBtn1')
  const b2 = document.getElementById('tabBtn2')
  if (!t1 || !t2) return
  const onStyle  = 'padding:8px 20px;border-radius:8px;border:2px solid #3b82f6;background:#3b82f6;color:white;font-weight:700;cursor:pointer;font-size:13px'
  const offStyle = 'padding:8px 20px;border-radius:8px;border:2px solid #e5e7eb;background:white;color:#6b7280;font-weight:700;cursor:pointer;font-size:13px'
  if (n === 1) {
    t1.style.display = 'contents'; t2.style.display = 'none'
    b1.style.cssText = onStyle;    b2.style.cssText = offStyle
  } else {
    t1.style.display = 'none';     t2.style.display = 'contents'
    b2.style.cssText = onStyle;    b1.style.cssText = offStyle
  }
}

initDRP()
init()
