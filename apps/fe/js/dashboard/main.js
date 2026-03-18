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
	fetch(API + "/api/cancel-stats" + qs).then(r => r.json()).catch(() => []),
      .then(d => Array.isArray(d) ? d : (Array.isArray(d.costs) ? d.costs : []))
      .catch(() => []),
  ])

  // ── KPI ────────────────────────────────────────────────────────────
  const totalOrders  = dash.total_orders  || 0
  const cancelOrders = dash.cancel_orders || 0
  const returnOrders = dash.return_orders || 0
  const allOrders    = dash.total_all_orders || totalOrders
  const cancelRate   = allOrders > 0 ? ((cancelOrders + returnOrders) / allOrders * 100).toFixed(1) : 0
  const cancelRows = (Array.isArray(cancelStats) ? cancelStats : []).filter(r => r.order_type === "cancel")

  document.getElementById("kpiGrid").innerHTML = `
    <div class="kpi blue">
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Đơn thành công</div>
      <div class="kpi-value">${Number(totalOrders).toLocaleString()}</div>
      <div class="kpi-sub">Tổng ${Number(allOrders).toLocaleString()} đơn</div>
    </div>
    <div class="kpi green" style="cursor:pointer" onclick="this.querySelector('.rev-detail').style.display=this.querySelector('.rev-detail').style.display==='none'?'block':'none'">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Doanh thu <span style="font-size:10px;opacity:0.6">▼ chi tiết</span></div>
      <div class="kpi-value">${fmtShort(rptSum.total_gross_revenue || dash.total_revenue)}</div>
      <div class="kpi-sub">${fmt(rptSum.total_gross_revenue || dash.total_revenue)}</div>
      <div class="rev-detail" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:1.8;border-top:1px solid #6ee7b7;padding-top:6px">
        <div style="font-weight:700;color:#888;margin-bottom:4px">📄 Theo báo cáo sàn:</div>
        ${(rptSum.shops || []).map(s => `
          <div style="display:flex;justify-content:space-between;padding-left:8px">
            <span>
              <span style="background:${s.platform === "shopee" ? "#ee4d2d" : s.platform === "tiktok" ? "#333" : "#0f146d"};color:white;border-radius:3px;padding:1px 5px;font-size:10px">
                ${s.platform.toUpperCase()}
              </span> ${s.shop}
            </span>
            <span style="font-weight:600">${fmt(s.gross_revenue)}</span>
          </div>`).join("")}
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px dashed #6ee7b7;margin-top:4px;padding-top:4px">
          <span>Tổng BC sàn</span><span>${fmt(rptSum.total_gross_revenue || 0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px"><span>📦 DT đơn import</span><span>${fmt(dash.total_revenue)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;color:${Math.abs((rptSum.total_gross_revenue || 0) - dash.total_revenue) < 10000 ? "#10b981" : "#f59e0b"}">
          <span>Chênh lệch</span><span>${fmt((rptSum.total_gross_revenue || 0) - dash.total_revenue)}</span>
        </div>
      </div>
    </div>
    <div class="kpi purple" style="cursor:pointer" onclick="this.querySelector('.lhd-detail').style.display=this.querySelector('.lhd-detail').style.display==='none'?'block':'none'">
      <div class="kpi-icon">📄</div>
      <div class="kpi-label">Lãi hóa đơn <span style="font-size:10px;opacity:0.6">▼ chi tiết</span></div>
      <div class="kpi-value ${profitClass(dash.total_profit_invoice)}">${fmtShort(dash.total_profit_invoice)}</div>
      <div class="kpi-sub">Sau phí + vốn HĐ</div>
      <div class="lhd-detail" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:2;border-top:1px solid #c4b5fd;padding-top:6px">
        <div style="font-weight:700;color:#888;margin-bottom:2px">📦 Theo đơn import:</div>
        <div style="display:flex;justify-content:space-between"><span>Doanh thu</span><span>${fmt(dash.total_revenue)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Vốn HĐ</span><span style="color:#ef4444">− ${fmt(dash.total_cost_invoice)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Phí sàn (có HĐ)</span><span style="color:#ef4444">− ${fmt(dash.total_fee - dash.total_fixed_fee)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#aaa;padding-left:8px"><span>↳ Không tính phí vận hành: ${fmt(dash.total_fixed_fee)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #c4b5fd;margin-top:4px;padding-top:4px">
          <span>= Lãi HĐ</span><span>${fmt(dash.total_revenue - dash.total_cost_invoice - (dash.total_fee - dash.total_fixed_fee))}</span>
        </div>
        ${rptSum.total_gross_revenue ? `
        <div style="font-weight:700;color:#888;margin-top:8px;margin-bottom:2px">📄 Theo báo cáo sàn:</div>
        <div style="display:flex;justify-content:space-between"><span>DT báo cáo</span><span>${fmt(rptSum.total_gross_revenue)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Vốn HĐ</span><span style="color:#ef4444">− ${fmt(dash.total_cost_invoice)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Phí BC sàn</span><span style="color:#ef4444">− ${fmt(rptSum.total_fee_report || 0)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px dashed #c4b5fd;margin-top:4px;padding-top:4px;color:#8b5cf6">
          <span>= Lãi HĐ (BC)</span><span>${fmt((rptSum.total_gross_revenue || 0) - dash.total_cost_invoice - (rptSum.total_fee_report || 0))}</span>
        </div>` : ""}
      </div>
    </div>
    <div class="kpi teal" style="cursor:pointer" onclick="this.querySelector('.ltt-detail').style.display=this.querySelector('.ltt-detail').style.display==='none'?'block':'none'">
      <div class="kpi-icon">🏦</div>
      <div class="kpi-label">Lãi thực tế <span style="font-size:10px;opacity:0.6">▼ chi tiết</span></div>
      <div class="kpi-value ${profitClass(dash.total_profit_real)}">${fmtShort(dash.total_profit_real)}</div>
      <div class="kpi-sub">Sau phí + vốn thực</div>
      <div class="ltt-detail" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:2;border-top:1px solid #99f6e4;padding-top:6px">
        <div style="font-weight:700;color:#888;margin-bottom:2px">📦 Theo đơn import:</div>
        <div style="display:flex;justify-content:space-between"><span>Doanh thu</span><span>${fmt(dash.total_revenue)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Vốn thực</span><span style="color:#ef4444">− ${fmt(dash.total_cost_real)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Tổng phí</span><span style="color:#ef4444">− ${fmt(dash.total_fee)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #99f6e4;margin-top:4px;padding-top:4px">
          <span>= Lãi thực</span><span>${fmt(dash.total_profit_real)}</span>
        </div>
        ${rptSum.total_gross_revenue ? `
        <div style="font-weight:700;color:#888;margin-top:8px;margin-bottom:2px">📄 Theo báo cáo sàn:</div>
        <div style="display:flex;justify-content:space-between"><span>DT báo cáo</span><span>${fmt(rptSum.total_gross_revenue)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Vốn thực</span><span style="color:#ef4444">− ${fmt(dash.total_cost_real)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Phí BC sàn</span><span style="color:#ef4444">− ${fmt(rptSum.total_fee_report || 0)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>− Vận hành</span><span style="color:#ef4444">− ${fmt(opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0))}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px dashed #99f6e4;margin-top:4px;padding-top:4px;color:#14b8a6">
          <span>= Lãi thực (BC)</span>
          <span>${fmt((rptSum.total_gross_revenue || 0) - dash.total_cost_real - (rptSum.total_fee_report || 0) - opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0))}</span>
        </div>` : ""}
      </div>
    </div>
    <div class="kpi orange">
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Vốn hóa đơn</div>
      <div class="kpi-value">${fmtShort(dash.total_cost_invoice)}</div>
      <div class="kpi-sub">Vốn thực: <b style="color:#f59e0b">${fmtShort(dash.total_cost_real)}</b></div>
    </div>
    <div class="kpi teal">
      <div class="kpi-icon">💵</div>
      <div class="kpi-label">Vốn thực tế</div>
      <div class="kpi-value">${fmtShort(dash.total_cost_real)}</div>
      <div class="kpi-sub">HĐ: ${fmtShort(dash.total_cost_invoice)}</div>
    </div>
    <div class="kpi orange" style="cursor:pointer" onclick="toggleFeeDetail()" title="Nhấn để xem chi tiết">
      <div class="kpi-icon">🏪</div>
      <div class="kpi-label">Tổng phí sàn <span style="font-size:10px;opacity:0.6">▼ chi tiết</span></div>
      <div class="kpi-value">${fmtShort(dash.total_fee)}</div>
      <div class="kpi-sub" id="feeSubLabel">Commission + Thanh toán + Affiliate + DV + PiShip</div>
      <div id="feeDetail" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:1.9;border-top:1px solid #fde68a;padding-top:6px">
        <div style="font-weight:700;color:#888;margin-bottom:2px">📊 Phí từ đơn hàng (tính toán):</div>
        <div style="display:flex;justify-content:space-between"><span>📌 Hoa hồng sàn (Commission)</span><span>${fmtShort(dash.total_platform_fee)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>💳 Phí thanh toán / giao dịch</span><span>${fmtShort(dash.total_payment_fee)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>🤝 Tiếp thị liên kết (Affiliate)</span><span>${fmtShort(dash.total_affiliate_fee)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>📢 Quảng cáo (Ads)</span><span>${fmtShort(dash.total_ads_fee)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>🚚 PiShip / SFR</span><span>${fmtShort(dash.total_piship_fee)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>🛎️ Phí dịch vụ / xử lý đơn</span><span>${fmtShort(dash.total_service_fee)}</span></div>
        ${rptSum.total_fee_report ? `
        <div style="border-top:1px dashed #fde68a;margin-top:4px;padding-top:4px;font-weight:700;color:#888">📄 Phí từ báo cáo sàn:</div>
        <div style="display:flex;justify-content:space-between"><span>📌 Phí HH Cố Định (BC)</span><span>${fmtFull(rptSum.total_fee_commission || 0)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>💳 Thanh toán (BC)</span><span>${fmtFull(rptSum.total_fee_payment || 0)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>🤝 Affiliate (BC)</span><span>${fmtFull(rptSum.total_fee_affiliate || 0)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>🚚 PiShip/SFR (BC)</span><span>${fmtFull(rptSum.total_fee_piship || 0)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>🛎️ Xử lý đơn (BC)</span><span>${fmtFull(rptSum.total_fee_service || 0)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>📢 Quảng cáo/Đấu thầu (BC)</span><span>${fmtFull(rptSum.total_fee_ads || 0)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px dashed #fde68a;margin-top:2px;padding-top:4px">
          <span>Tổng phí BC sàn</span><span>${fmtFull(rptSum.total_fee_report)}</span>
        </div>
        ` : ""}
      </div>
    </div>
    <div class="kpi red" style="cursor:pointer" onclick="this.querySelector('.tax-detail').style.display=this.querySelector('.tax-detail').style.display==='none'?'block':'none'">
      <div class="kpi-icon">🧾</div>
      <div class="kpi-label">Thuế khoán (1.5%) <span style="font-size:10px;opacity:0.6">▼ chi tiết</span></div>
      <div class="kpi-value">${fmtShort(dash.total_tax_flat)}</div>
      <div class="kpi-sub">Thuế LN: ${fmtShort(dash.total_tax_income)}</div>
      <div class="tax-detail" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:2;border-top:1px solid #fca5a5;padding-top:6px">
        <div style="color:#888;margin-bottom:2px">📌 Thuế khoán 1.5%</div>
        <div>${fmt(dash.total_revenue)} × 1.5%</div>
        <div>= <b>${fmt(dash.total_tax_flat)}</b> ≈ <b>${fmtShort(dash.total_tax_flat)}</b></div>
        <div style="color:#888;margin-top:6px;margin-bottom:2px">📌 Thuế LN 17%</div>
        <div>${fmt(dash.total_tax_income / 0.17)} × 17%</div>
        <div>= <b>${fmt(dash.total_tax_income)}</b> ≈ <b>${fmtShort(dash.total_tax_income)}</b></div>
        <div style="border-top:1px solid #fca5a5;margin-top:6px;padding-top:6px;font-weight:700">
          Tổng thuế: ${fmtShort(dash.total_tax_flat + dash.total_tax_income)}
        </div>
        ${rptSum.total_gross_revenue ? `
        <div style="border-top:1px dashed #fca5a5;margin-top:6px;padding-top:6px;font-weight:700;color:#888">📄 Thuế từ báo cáo sàn:</div>
        <div style="display:flex;justify-content:space-between"><span>Thuế GTGT</span><span>${fmt(rptSum.total_tax_report || 0)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;color:#ef4444">
          <span>Tổng thuế BC</span><span>${fmt(rptSum.total_tax_report || 0)}</span>
        </div>` : ""}
      </div>
    </div>
    <div class="kpi red" style="cursor:pointer" onclick="this.querySelector('.cancel-detail').style.display=this.querySelector('.cancel-detail').style.display==='none'?'block':'none'">
      <div class="kpi-icon">⚠️</div>
      <div class="kpi-label">Tỷ lệ hủy / hoàn <span style="font-size:10px;opacity:0.6">▼ chi tiết</span></div>
      <div class="kpi-value">${cancelRate}%</div>
      <div class="kpi-sub">Hủy: ${cancelOrders} | Hoàn: ${returnOrders}</div>
      <div class="cancel-detail" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:2;border-top:1px solid #fca5a5;padding-top:6px">
        <div style="display:flex;justify-content:space-between">
          <span>✗ Tổng đơn hủy</span>
          <span style="color:#ef4444;font-weight:700">${cancelOrders} đơn (${pct(cancelOrders, allOrders)})</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span>↩ Tổng đơn hoàn</span>
          <span style="color:#f59e0b;font-weight:700">${returnOrders} đơn (${pct(returnOrders, allOrders)})</span>
        </div>
        <div style="border-top:1px dashed #fca5a5;margin-top:4px;padding-top:4px;font-weight:700;color:#888">Lý do hủy phổ biến:</div>
        ${cancelRows.slice(0,5).map(r => `
          <div style="display:flex;justify-content:space-between;font-size:10px">
            <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span style="background:${r.platform==='shopee'?'#ee4d2d':r.platform==='tiktok'?'#333':'#0f146d'};color:white;border-radius:3px;padding:1px 4px;font-size:9px">${r.platform.toUpperCase()}</span>
              ${(r.cancel_reason||'Không rõ').substring(0,30)}
            </span>
            <span style="font-weight:700">${r.total_orders} đơn</span>
          </div>`).join("")}
      </div>
    </div>
    <div class="kpi" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-left:4px solid #22c55e;cursor:pointer" onclick="this.querySelector('.op-detail').style.display=this.querySelector('.op-detail').style.display==='none'?'block':'none'">
      <div class="kpi-icon">🏭</div>
      <div class="kpi-label">Chi phí vận hành <span style="font-size:10px;opacity:0.6">▼ chi tiết</span></div>
      <div class="kpi-value" style="color:#16a34a">${fmtShort(opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0))}</div>
      <div class="kpi-sub">Kỳ này: ${opCosts.length} khoản</div>
      <div class="op-detail" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:1.9;border-top:1px solid #86efac;padding-top:6px">
        ${opCosts.length > 0 ? opCosts.map(c => `
          <div style="margin-bottom:3px">
            <div style="display:flex;justify-content:space-between;font-weight:600">
              <span>${c.cost_name || c.cost_key}${c.shop ? ` <span style="background:#6b7280;color:white;border-radius:3px;padding:1px 4px;font-size:9px">${c.shop}</span>` : ""}</span>
              <span style="color:#16a34a">${fmtShort(c.actual_amount || 0)}</span>
            </div>
            <div style="font-size:10px;color:#aaa;padding-left:4px">
              ${fmtShort(c.cost_value)}/${c.calc_type === "per_month" ? "tháng" : "đơn"}
              ${c.calc_type === "per_month"
                ? ` × ${c.months}th${c.note && c.note !== "toàn bộ" ? ` × ${c.note}` : ""}`
                : ` × ${c.total_orders} đơn`}
            </div>
          </div>`).join("")
        : '<div style="color:#aaa">Chưa có chi phí vận hành</div>'}
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #86efac;margin-top:4px;padding-top:4px">
          <span>Tổng vận hành (kỳ này)</span>
          <span style="color:#16a34a">${fmtShort(opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0))}</span>
        </div>
      </div>
    </div>
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

  document.getElementById("calcResult").style.display     = "block"
  document.getElementById("r_price").textContent          = fmt(res.sell_price)
  document.getElementById("r_cost_real").textContent      = fmt(res.cost_real)
  document.getElementById("r_cost_inv").textContent       = fmt(res.cost_invoice)
  document.getElementById("r_fee").textContent            = fmt(res.total_fee)
  document.getElementById("r_tax_flat").textContent       = fmt(res.tax_flat)
  document.getElementById("r_tax_inc").textContent        = fmt(res.tax_income)
  document.getElementById("r_profit_real").textContent    = fmt(res.profit_real)
  document.getElementById("r_profit_inv").textContent     = fmt(res.profit_invoice)

  const pRow = document.getElementById("r_profit_row")
  pRow.className = "calc-row total " + (res.is_loss ? "loss" : "gain")
  document.getElementById("r_profit_real").className = res.is_loss ? "profit-neg" : "profit-pos"

  const warn = document.getElementById("warnLoss")
  if (res.is_loss) {
    const minP = Math.ceil(res.cost_real + res.total_fee + res.tax_flat + 1000)
    document.getElementById("minPrice").textContent = Number(minP).toLocaleString("vi-VN")
    warn.style.display = "block"
  } else {
    warn.style.display = "none"
  }
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

initDRP()
init()
