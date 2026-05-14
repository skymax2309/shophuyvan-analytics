(function () {
  const toNumber = (value) => Number(value || 0)
  const viCount = (value) => toNumber(value).toLocaleString("vi-VN")

  function makeHelpers(ctx) {
    const fmt = ctx.fmt
    const fmtShort = ctx.fmtShort
    const pct = (value, base) => base > 0 ? (value / base * 100).toFixed(1) + "%" : "-"
    const pcOrder = (value) => pct(value, ctx.rev)
    const pcReport = (value) => pct(value, ctx.revBC)

    const section = (label) =>
      `<div style="font-weight:700;color:#6b7280;font-size:10px;margin:7px 0 3px">${label}</div>`

    const row = (label, value, percent = "", color = "#374151") =>
      `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:1px 0">
        <span>${label}</span>
        <span style="display:flex;gap:8px;align-items:center">
          ${percent ? `<span style="font-size:10px;color:#9ca3af;min-width:38px;text-align:right">${percent}</span>` : ""}
          <span style="font-weight:600;color:${color};min-width:85px;text-align:right">${value}</span>
        </span>
      </div>`

    const rowBold = (label, value, percent = "", color = "#374151") =>
      `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-weight:700;border-top:1px dashed rgba(0,0,0,.12);margin-top:5px;padding-top:5px">
        <span>${label}</span>
        <span style="display:flex;gap:8px;align-items:center">
          ${percent ? `<span style="font-size:10px;color:#9ca3af;min-width:38px;text-align:right">${percent}</span>` : ""}
          <span style="color:${color};min-width:85px;text-align:right">${value}</span>
        </span>
      </div>`

    const card = (color, icon, label, value, sub, detail = "") =>
      `<div class="kpi ${color}" ${detail ? `style="cursor:pointer" onclick="this.querySelector('.kd').style.display=this.querySelector('.kd').style.display==='none'?'block':'none'"` : ""}>
        <div class="kpi-icon">${icon}</div>
        <div class="kpi-label">${label}${detail ? ' <span style="font-size:10px;opacity:.55">▼ chi tiết</span>' : ""}</div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-sub">${sub}</div>
        ${detail ? `<div class="kd" style="display:none;margin-top:8px;font-size:11px;text-align:left;line-height:1.85;border-top:1px solid rgba(0,0,0,.09);padding-top:6px">${detail}</div>` : ""}
      </div>`

    return { fmt, fmtShort, pct, pcOrder, pcReport, section, row, rowBold, card }
  }

  function shopBreakdown(ctx, type, h) {
    const shops = Array.isArray(ctx.dash.shop_breakdown) ? ctx.dash.shop_breakdown : []
    if (!shops.length) return ""
    return `${h.section("Chi tiết theo shop")}
      ${shops.map((shop) => {
        const valid = toNumber(shop.shop_success_orders ?? shop.shop_orders)
        const total = toNumber(shop.shop_total_orders ?? shop.shop_orders)
        const cancel = toNumber(shop.shop_cancel_orders)
        const returned = toNumber(shop.shop_return_orders)
        const shipping = toNumber(shop.shop_shipping_orders)
        const orderText = total && total !== valid
          ? `${viCount(valid)} hợp lệ / ${viCount(total)} tổng`
          : `${viCount(valid)} đơn`
        const notes = []
        if (shipping) notes.push(`đang giao ${viCount(shipping)}`)
        if (cancel || returned) notes.push(`hủy ${viCount(cancel)} · hoàn ${viCount(returned)}`)
        return `<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;font-size:11px;padding:3px 0;border-bottom:1px dashed rgba(0,0,0,.05)">
          <span title="${shop.shop || ""}" style="font-weight:600;color:#374151;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${shop.shop || "Chưa rõ"}</span>
          ${type === "orders"
            ? `<span style="font-weight:700;color:#3b82f6;text-align:right">${orderText}${notes.length ? `<span style="display:block;color:#6b7280;font-size:10px">${notes.join(" · ")}</span>` : ""}</span>`
            : `<span style="font-weight:700;color:#10b981;text-align:right">${h.fmt(shop.shop_revenue || 0)}</span>`}
        </div>`
      }).join("")}`
  }

  function reportShopBreakdown(ctx, h) {
    const shops = Array.isArray(ctx.rptSum?.shops) ? ctx.rptSum.shops : []
    if (!shops.length) return ""
    return `${h.section("Chi tiết theo shop báo cáo")}
      ${shops.map((shop) => {
        const revenue = toNumber(shop.net_product_revenue || shop.gross_revenue)
        const refund = toNumber(shop.refund_amount)
        const sub = refund ? `<span style="display:block;color:#ef4444;font-size:10px">Hoàn/hủy ${h.fmt(refund)}</span>` : ""
        return `<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;font-size:11px;padding:3px 0;border-bottom:1px dashed rgba(0,0,0,.05)">
          <span title="${shop.shop || ""}" style="font-weight:600;color:#374151;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${shop.shop || "Chưa rõ"}</span>
          <span style="font-weight:700;color:#10b981;text-align:right">${h.fmt(revenue)}${sub}</span>
        </div>`
      }).join("")}`
  }

  function cancelDetail(ctx, h) {
    const rows = Array.isArray(ctx.cancelStats) ? ctx.cancelStats : []
    const cancels = rows.filter((row) => row.order_type === "cancel")
    const returns = rows.filter((row) => row.order_type === "return")
    const allOrders = ctx.allOrders || 1
    const reasonText = (row) => row.cancel_reason_vi || row.cancel_reason_label || row.cancel_reason || "Không rõ lý do"
    const platformBadge = (row) =>
      `<span style="background:${row.platform === "shopee" ? "#ee4d2d" : row.platform === "tiktok" ? "#111827" : "#0f146d"};color:white;border-radius:3px;padding:1px 4px;font-size:9px">${String(row.platform || "").toUpperCase()}</span>`

    return `${h.section("Lý do hủy đơn")}
      ${cancels.length ? cancels.map((row) => `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px;padding:2px 0">
          <span style="display:flex;gap:5px;align-items:center;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${platformBadge(row)} ${reasonText(row)}</span>
          <span style="font-weight:700">${viCount(row.total_orders)} đơn</span>
        </div>`).join("") : '<div style="color:#aaa;font-size:10px">Không có đơn hủy</div>'}
      ${h.section("Đơn trả hàng / hoàn tiền")}
      ${returns.length ? returns.map((row) => `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px;padding:2px 0">
          <span>${platformBadge(row)} ${viCount(row.total_orders)} đơn (${h.pct(row.total_orders, allOrders)})</span>
          <span style="font-weight:700;color:#ef4444">${h.fmt(row.total_revenue || 0)}</span>
        </div>`).join("") : '<div style="color:#aaa;font-size:10px">Không có đơn hoàn</div>'}`
  }

  function operationCostDetail(ctx, h) {
    const costs = Array.isArray(ctx.opCosts) ? ctx.opCosts : []
    if (!costs.length) return '<div style="color:#aaa">Chưa có chi phí vận hành</div>'
    return costs.map((cost) => `
      <div style="margin-bottom:4px">
        <div style="display:flex;justify-content:space-between;gap:10px;font-weight:600">
          <span>${cost.cost_name || cost.cost_key}${cost.shop ? ` <span style="background:#6b7280;color:white;border-radius:3px;padding:1px 4px;font-size:9px">${cost.shop}</span>` : ""}</span>
          <span style="color:#16a34a">${cost.actual_amount >= 1000 ? h.fmtShort(cost.actual_amount) : h.fmt(cost.actual_amount || 0)}</span>
        </div>
        <div style="font-size:10px;color:#6b7280;padding-left:4px">
          ${h.fmtShort(cost.cost_value)}/${cost.calc_type === "per_month" ? "tháng" : "đơn"}
          ${cost.calc_type === "per_month"
            ? ` × ${Number(cost.months || 0).toFixed(1)} tháng${cost.note && cost.note !== "toàn bộ" ? ` × ${cost.note}` : ""}`
            : ` × ${viCount(cost.total_orders)} đơn = ${h.fmt(cost.actual_amount || 0)}đ`}
        </div>
      </div>`).join("") +
      `${ctx.opPackagingTotal ? `<div style="font-size:10px;color:#b45309;margin-top:4px">Phí đóng gói ${h.fmtShort(ctx.opPackagingTotal)} đã chuyển sang Tổng phí để không trừ hai lần.</div>` : ""}
       ${h.rowBold("Tổng cost setting", h.fmtShort(ctx.opDisplayTotal), "", "#16a34a")}`
  }

  function tabButtons() {
    return `<div style="grid-column:1/-1;display:flex;gap:10px;margin-bottom:8px">
      <button id="tabBtn1" onclick="switchDashTab(1)" style="padding:9px 22px;border-radius:9px;border:2px solid #3b82f6;background:#3b82f6;color:white;font-weight:700;cursor:pointer;font-size:13px">📦 Theo Đơn Import</button>
      <button id="tabBtn2" onclick="switchDashTab(2)" style="padding:9px 22px;border-radius:9px;border:2px solid #e5e7eb;background:white;color:#6b7280;font-weight:700;cursor:pointer;font-size:13px">📄 Theo Báo Cáo Sàn</button>
    </div>`
  }

  function feeRows(ctx, h, mode) {
    const pc = mode === "report" ? h.pcReport : h.pcOrder
    const rows = mode === "report"
      ? [
          ["Giảm giá & trợ giá", ctx.t2_cofund], ["Phí cố định", ctx.t2_comm],
          ["Phí dịch vụ", ctx.t2_svc], ["Phí thanh toán", ctx.t2_pay], ["Tiếp thị liên kết", ctx.t2_aff],
          ["Phí ADS", ctx.t2_ads], ["PiShip", ctx.t2_pish],
        ]
      : [
          ["Voucher của shop", ctx.t1_disc], ["Voucher từ sàn/Shopee", ctx.t1_disc_shopee], ["Combo / khuyến mại khác", ctx.t1_disc_combo],
          ["Phí cố định / hoa hồng", ctx.t1_comm], ["Phí dịch vụ", ctx.t1_svc], ["Phí thanh toán", ctx.t1_pay],
          ["Tiếp thị liên kết", ctx.t1_aff], ["Phí ADS", ctx.t1_ads], ["PiShip", ctx.t1_pish],
          ["Xử lý / fulfillment", ctx.t1_handling], ["Vận chuyển / logistics", ctx.t1_shipping],
          ["Thuế VAT sàn khấu trừ", ctx.t1_fee_tax_vat], ["Thuế PIT sàn khấu trừ", ctx.t1_fee_tax_pit],
        ]
    const packaging = ctx.opPackagingTotal ? h.row("Đóng gói từ cost setting", h.fmt(ctx.opPackagingTotal), pc(ctx.opPackagingTotal), "#b45309") : ""
    return rows.map(([label, value]) => h.row(label, h.fmt(value), pc(value))).join("") + packaging
  }

  function tab1(ctx, h) {
    const excluded = Math.max(0, ctx.allOrders - ctx.totalOrders)
    return `<div id="dashTab1" style="display:contents">
      ${h.card("blue", "📦", "Đơn bán hợp lệ", viCount(ctx.totalOrders),
        `Tổng ${viCount(ctx.allOrders)} đơn · Hủy ${viCount(ctx.cancelOrders)} · Hoàn ${viCount(ctx.returnOrders)}`,
        shopBreakdown(ctx, "orders", h))}
      ${h.card("green", "💰", "Doanh Thu", h.fmtShort(ctx.rev), h.fmt(ctx.rev),
        `${h.row("DT đơn import", h.fmt(ctx.rev))}${h.row("Đơn hủy/hoàn đã loại", `${viCount(excluded)} đơn`, "", "#6b7280")}${shopBreakdown(ctx, "revenue", h)}`)}
      ${h.card("purple", "📄", "Lãi Hóa Đơn", h.fmtShort(ctx.t1_lhd), "DT − Vốn HĐ − Phí − Vận hành",
        `${h.row("Doanh thu", h.fmt(ctx.rev))}${h.row("− Vốn hóa đơn", h.fmt(ctx.dash.total_cost_invoice || 0), h.pcOrder(ctx.dash.total_cost_invoice || 0), "#ef4444")}${h.row("− Chi phí vận hành", h.fmt(ctx.opTotal), h.pcOrder(ctx.opTotal), "#ef4444")}${h.row("− Tổng phí sàn", h.fmt(ctx.t1_fee), h.pcOrder(ctx.t1_fee), "#ef4444")}${h.rowBold("= Lãi Hóa Đơn", h.fmt(ctx.t1_lhd), h.pcOrder(ctx.t1_lhd), ctx.t1_lhd >= 0 ? "#10b981" : "#ef4444")}`)}
      ${h.card("teal", "🏦", "Lãi Thực Tế", h.fmtShort(ctx.t1_ltt), "DT − Vốn thực − Phí − Thuế 1.5%",
        `${h.row("Doanh thu", h.fmt(ctx.rev))}${h.row("− Vốn thực tế", h.fmt(ctx.dash.total_cost_real || 0), h.pcOrder(ctx.dash.total_cost_real || 0), "#ef4444")}${h.row("− Chi phí vận hành", h.fmt(ctx.opTotal), h.pcOrder(ctx.opTotal), "#ef4444")}${h.row("− Tổng phí sàn", h.fmt(ctx.t1_fee), h.pcOrder(ctx.t1_fee), "#ef4444")}${h.row("− Thuế khoán 1.5%", h.fmt(ctx.t1_tax_flat), "1.5%", "#ef4444")}${h.rowBold("= Lãi Thực Tế", h.fmt(ctx.t1_ltt), h.pcOrder(ctx.t1_ltt), ctx.t1_ltt >= 0 ? "#10b981" : "#ef4444")}`)}
      ${h.card("teal", "💎", "Lãi TT (Thuế LN 17%)", h.fmtShort(ctx.t1_ltt_hd), "DT − Vốn thực − Phí − Thuế LN 17%",
        `${h.row("Doanh thu", h.fmt(ctx.rev))}${h.row("− Vốn thực tế", h.fmt(ctx.dash.total_cost_real || 0), h.pcOrder(ctx.dash.total_cost_real || 0), "#ef4444")}${h.row("− Tổng phí sàn", h.fmt(ctx.t1_fee), h.pcOrder(ctx.t1_fee), "#ef4444")}${h.row("− Thuế LN 17%", h.fmt(ctx.t1_tax_ln), h.pct(ctx.t1_tax_ln, ctx.rev), "#ef4444")}${h.rowBold("= Lãi sau thuế 17%", h.fmt(ctx.t1_ltt_hd), h.pcOrder(ctx.t1_ltt_hd), ctx.t1_ltt_hd >= 0 ? "#10b981" : "#ef4444")}`)}
      ${h.card("orange", "📦", "Vốn Hóa Đơn", h.fmtShort(ctx.dash.total_cost_invoice || 0), `Thực tế: ${h.fmtShort(ctx.dash.total_cost_real || 0)}`)}
      ${h.card("orange", "💵", "Vốn Thực Tế", h.fmtShort(ctx.dash.total_cost_real || 0), `HĐ: ${h.fmtShort(ctx.dash.total_cost_invoice || 0)}`)}
      ${h.card("orange", "🏪", "Tổng Phí Sàn", h.fmtShort(ctx.t1_fee), ctx.t1_fee_using_fallback ? `Đã tách ${h.fmtShort(ctx.t1_fee_detail)} · còn thiếu ${h.fmtShort(ctx.t1_fee_unbucketed)}` : ctx.t1_fee_source_note,
        `${h.section("Phí đã tách")}${feeRows(ctx, h, "order")}${ctx.t1_fixed_from_order ? h.row("Đóng gói/labor từ đơn", h.fmt(ctx.t1_fixed_from_order), h.pcOrder(ctx.t1_fixed_from_order)) : ""}${h.section("Nguồn dữ liệu")}${h.row("Dòng đã có chi tiết phí", `${ctx.t1_fee_detail_orders}/${ctx.t1_fee_scope_orders || ctx.t1_fee_detail_orders} đơn`)}${ctx.dash.total_ads_snapshot_rows ? h.row("Dòng ADS snapshot", `${ctx.dash.total_ads_snapshot_rows} dòng`) : ""}${ctx.t1_fee_using_fallback ? h.row("Phí còn thiếu bucket", h.fmt(ctx.t1_fee_unbucketed), h.pcOrder(ctx.t1_fee_unbucketed), "#b45309") : ""}${h.rowBold("Tổng phí sàn", h.fmt(ctx.t1_fee), h.pcOrder(ctx.t1_fee))}`)}
      ${h.card("red", "🧾", "Thuế", h.fmtShort(ctx.t1_tax_flat), `Thuế LN 17%: ${h.fmtShort(ctx.t1_tax_ln)}`,
        `${h.row("Thuế khoán 1.5%", h.fmt(ctx.t1_tax_flat), "1.5%", "#ef4444")}${h.row("Thuế lợi nhuận 17%", h.fmt(ctx.t1_tax_ln), h.pct(ctx.t1_tax_ln, ctx.rev), "#ef4444")}${h.rowBold("Tổng thuế", h.fmt(ctx.t1_tax_flat + ctx.t1_tax_ln), "", "#ef4444")}`)}
      ${h.card("red", "⚠️", "Tỷ Lệ Hủy / Hoàn", h.pct(ctx.cancelOrders + ctx.returnOrders, ctx.allOrders), `Hủy: ${ctx.cancelOrders || 0} | Hoàn: ${ctx.returnOrders || 0}`, cancelDetail(ctx, h))}
      ${h.card("", "🏭", "Chi Phí Vận Hành", h.fmtShort(ctx.opDisplayTotal), ctx.opPackagingTotal ? `Đã chuyển đóng gói ${h.fmtShort(ctx.opPackagingTotal)} sang Tổng phí` : `Kỳ này: ${(ctx.opCosts || []).length} khoản`, operationCostDetail(ctx, h))}
    </div>`
  }

  function tab2(ctx, h) {
    if (!ctx.revBC) {
      return `<div id="dashTab2" style="display:none"><div style="padding:50px 24px;text-align:center;color:#9ca3af;background:#f9fafb;border-radius:12px;border:2px dashed #e5e7eb"><div style="font-size:36px;margin-bottom:12px">📄</div><div style="font-size:16px;font-weight:700;color:#374151;margin-bottom:8px">Chưa có dữ liệu báo cáo sàn</div><div style="font-size:13px">Upload file báo cáo sàn để xem thống kê chi tiết.</div></div></div>`
    }
    return `<div id="dashTab2" style="display:none"><div style="display:contents">
      ${h.card("blue", "📦", "Đơn bán hợp lệ", viCount(ctx.totalOrders), `Tổng ${viCount(ctx.allOrders)} đơn · Hủy ${viCount(ctx.cancelOrders)} · Hoàn ${viCount(ctx.returnOrders)}${ctx.shippingOrders ? ` · đang giao ${viCount(ctx.shippingOrders)}` : ""}`, shopBreakdown(ctx, "orders", h))}
      ${h.card("green", "💰", "Doanh Thu (Báo Cáo)", h.fmtShort(ctx.revBC), h.fmt(ctx.revBC), `${h.row("DT báo cáo ròng", h.fmt(ctx.revBC))}${h.row("DT báo cáo gốc", h.fmt(ctx.revBCGross || ctx.revBC), "", "#6b7280")}${h.row("Hoàn/hủy đã trừ", h.fmt(ctx.t2_refund || 0), "", "#ef4444")}${h.row("DT đơn import", h.fmt(ctx.rev), "", "#6b7280")}${h.row("Chênh lệch", h.fmt(ctx.revBC - ctx.rev), "", Math.abs(ctx.revBC - ctx.rev) < 10000 ? "#10b981" : "#f59e0b")}${reportShopBreakdown(ctx, h)}`)}
      ${h.card("purple", "📄", "Lãi Hóa Đơn (BC)", h.fmtShort(ctx.t2_lhd), "DT BC − Vốn HĐ − Phí BC − Vận hành",
        `${h.row("Doanh thu BC", h.fmt(ctx.revBC))}${h.row("− Vốn hóa đơn", h.fmt(ctx.dash.total_cost_invoice || 0), h.pcReport(ctx.dash.total_cost_invoice || 0), "#ef4444")}${h.row("− Chi phí vận hành", h.fmt(ctx.opTotal), h.pcReport(ctx.opTotal), "#ef4444")}${h.row("− Tổng phí sàn BC", h.fmt(ctx.t2_fee), h.pcReport(ctx.t2_fee), "#ef4444")}${h.rowBold("= Lãi Hóa Đơn", h.fmt(ctx.t2_lhd), h.pcReport(ctx.t2_lhd), ctx.t2_lhd >= 0 ? "#10b981" : "#ef4444")}`)}
      ${h.card("teal", "🏦", "Lãi Thực Tế (BC)", h.fmtShort(ctx.t2_ltt), "DT BC − Vốn thực − Phí − Thuế 1.5%",
        `${h.row("Doanh thu BC", h.fmt(ctx.revBC))}${h.row("− Vốn thực tế", h.fmt(ctx.dash.total_cost_real || 0), h.pcReport(ctx.dash.total_cost_real || 0), "#ef4444")}${h.row("− Chi phí vận hành", h.fmt(ctx.opTotal), h.pcReport(ctx.opTotal), "#ef4444")}${h.row("− Tổng phí sàn BC", h.fmt(ctx.t2_fee), h.pcReport(ctx.t2_fee), "#ef4444")}${h.row("− Thuế khoán 1.5%", h.fmt(ctx.t2_tax_flat), "1.5%", "#ef4444")}${h.rowBold("= Lãi Thực Tế", h.fmt(ctx.t2_ltt), h.pcReport(ctx.t2_ltt), ctx.t2_ltt >= 0 ? "#10b981" : "#ef4444")}`)}
      ${h.card("teal", "💎", "Lãi TT (Thuế LN 17%) BC", h.fmtShort(ctx.t2_ltt_hd), "DT BC − Vốn thực − Phí − Thuế 17%", `${h.row("Doanh thu BC", h.fmt(ctx.revBC))}${h.row("− Tổng phí sàn BC", h.fmt(ctx.t2_fee), h.pcReport(ctx.t2_fee), "#ef4444")}${h.row("− Thuế LN 17%", h.fmt(ctx.t2_tax_ln), h.pct(ctx.t2_tax_ln, ctx.revBC), "#ef4444")}${h.rowBold("= Lãi sau thuế 17%", h.fmt(ctx.t2_ltt_hd), h.pcReport(ctx.t2_ltt_hd), ctx.t2_ltt_hd >= 0 ? "#10b981" : "#ef4444")}`)}
      ${h.card("orange", "📦", "Vốn Hóa Đơn", h.fmtShort(ctx.dash.total_cost_invoice || 0), `Thực tế: ${h.fmtShort(ctx.dash.total_cost_real || 0)}`)}
      ${h.card("orange", "💵", "Vốn Thực Tế", h.fmtShort(ctx.dash.total_cost_real || 0), `HĐ: ${h.fmtShort(ctx.dash.total_cost_invoice || 0)}`)}
      ${h.card("orange", "🏪", "Tổng Phí Sàn (BC)", h.fmtShort(ctx.t2_fee), "Từ file báo cáo và cost setting", `${feeRows(ctx, h, "report")}${h.rowBold("Tổng", h.fmt(ctx.t2_fee), h.pcReport(ctx.t2_fee))}`)}
      ${h.card("red", "🧾", "Thuế (BC)", h.fmtShort(ctx.t2_tax_flat), `Thuế LN 17%: ${h.fmtShort(ctx.t2_tax_ln)}`, `${h.row("Thuế khoán 1.5%", h.fmt(ctx.t2_tax_flat), "1.5%", "#ef4444")}${h.row("Thuế lợi nhuận 17%", h.fmt(ctx.t2_tax_ln), h.pct(ctx.t2_tax_ln, ctx.revBC), "#ef4444")}${h.rowBold("Tổng thuế", h.fmt(ctx.t2_tax_flat + ctx.t2_tax_ln), "", "#ef4444")}`)}
      ${h.card("red", "⚠️", "Tỷ Lệ Hủy / Hoàn", h.pct(ctx.cancelOrders + ctx.returnOrders, ctx.allOrders), `Hủy: ${ctx.cancelOrders || 0} | Hoàn: ${ctx.returnOrders || 0}`, cancelDetail(ctx, h))}
      ${h.card("", "🏭", "Chi Phí Vận Hành", h.fmtShort(ctx.opDisplayTotal), ctx.opPackagingTotal ? `Đã chuyển đóng gói ${h.fmtShort(ctx.opPackagingTotal)} sang Tổng phí` : `Kỳ này: ${(ctx.opCosts || []).length} khoản`, operationCostDetail(ctx, h))}
    </div></div>`
  }

  function render(ctx) {
    const grid = document.getElementById("kpiGrid")
    if (!grid) return
    const helpers = makeHelpers(ctx)
    grid.innerHTML = `${tabButtons()}${tab1(ctx, helpers)}${tab2(ctx, helpers)}`
  }

  window.SHV_KPI_CARDS = { render }
})()
