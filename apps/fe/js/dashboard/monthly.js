// ==========================================
// MODULE: ĐỐI SOÁT DOANH THU THÁNG
// ==========================================

window.loadMonthly = async function() {
  console.log("Loading Monthly Settlement Tab...");
  const kpiGrid = document.getElementById('kpiGridMonthly');
  const tableBody = document.getElementById('tableMonthlySettlement');

  try {
    if (kpiGrid) kpiGrid.innerHTML = '<div class="loading">⏳ Đang tải dữ liệu chốt sổ và vận hành...</div>';

    // Lấy query filter (Từ thanh chọn ngày/tháng/shop)
    const qs = typeof getFilterParams === 'function' ? getFilterParams() : "";

    // 1. Lấy song song 3 luồng: Báo cáo sàn, Dashboard (lấy Vốn), OpCosts (Lấy vận hành)
    const [reports, dash, opData] = await Promise.all([
      fetch(API + "/api/reports" + qs).then(r => r.json()).catch(() => []),
      fetch(API + "/api/dashboard" + qs).then(r => r.json()).catch(() => ({})),
      fetch(API + "/api/operation-costs" + qs).then(r => r.json()).catch(() => [])
    ]);

    if (!reports || reports.length === 0) {
      if (kpiGrid) kpiGrid.innerHTML = '<div style="padding:20px; color:#64748b; font-weight:600;">Chưa có dữ liệu đối soát nào trong thời gian này.</div>';
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af">Chưa có dữ liệu. Vui lòng tải file báo cáo đối soát từ sàn lên hệ thống!</td></tr>';
      return;
    }

    // 2. Kế thừa logic tính Chi phí vận hành & Vốn (Y hệt kpi.js)
    const opCosts = Array.isArray(opData) ? opData : (Array.isArray(opData?.costs) ? opData.costs : []);
    const opTotal = opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0);
    const costReal = dash.total_cost_real || 0; // Tổng Vốn thực tế

    let totalRev = 0;
    let totalPayout = 0; // Tiền mặt sàn trả về
    let totalFee = 0;
    
    const groupMap = {}; 
    const monthMap = {}; 

    // 3. Xử lý & Gom nhóm dữ liệu báo cáo
    reports.forEach(r => {
      const month = r.report_month || 'N/A';
      const platform = r.platform || 'unknown';
      const shop = r.shop || 'Mặc định';
      
      const rev = parseFloat(r.gross_revenue || r.net_product_revenue || r.revenue || 0);
      const fee = parseFloat(r.fee_total || r.total_fee || 0);
      const ads = parseFloat(r.fee_ads || r.ads_fee || 0);
      const payout = parseFloat(r.total_payout || r.profit || 0); // Lãi gộp sàn trả

      totalRev += rev;
      totalPayout += payout;
      totalFee += fee;

      // Gom nhóm cho Bảng Chi tiết
      const groupKey = `${month}_${platform}_${shop}`;
      if (!groupMap[groupKey]) {
        groupMap[groupKey] = { month, platform, shop, rev: 0, fee: 0, ads: 0, payout: 0 };
      }
      groupMap[groupKey].rev += rev;
      groupMap[groupKey].fee += fee;
      groupMap[groupKey].ads += ads;
      groupMap[groupKey].payout += payout;

      // Gom nhóm cho Biểu đồ
      if (!monthMap[month]) monthMap[month] = { rev: 0, payout: 0 };
      monthMap[month].rev += rev;
      monthMap[month].payout += payout;
    });

    // 4. Áp dụng Công thức Lãi Thực Tế Đích Thực (Net Profit)
    const taxFlat = totalRev * 0.015; // Thuế khoán 1.5%
    const finalNetProfit = totalPayout - costReal - opTotal - taxFlat;

    const groupedRows = Object.values(groupMap).sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month); 
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      return a.shop.localeCompare(b.shop);
    });

    // 5. Render 3 thẻ KPI (Đã gộp chi phí đầy đủ)
    if (kpiGrid) {
      kpiGrid.innerHTML = `
        <div class="kpi-card" style="background:#f8fafc; border:1px solid #e2e8f0; position:relative;">
          <div class="kpi-title" style="color:#64748b;">Tổng Doanh Thu Chốt</div>
          <div class="kpi-value" style="color:#2563eb;">${fmt(totalRev)}</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:6px;">Tổng tiền sàn ghi nhận</div>
        </div>
        
        <div class="kpi-card" style="background:#fff1f2; border:1px solid #fecdd3;">
          <div class="kpi-title" style="color:#e11d48;">Tổng Chi Phí & Vốn Gốc</div>
          <div class="kpi-value" style="color:#ef4444; font-size:18px; margin-top:2px;">
            ${fmt(totalFee + costReal + opTotal + taxFlat)}
          </div>
          <div style="font-size:11px; color:#ef4444; margin-top:6px; line-height:1.5;">
            Phí sàn: <b>${typeof fmtShort==='function'?fmtShort(totalFee):fmt(totalFee)}</b> | Vốn: <b>${typeof fmtShort==='function'?fmtShort(costReal):fmt(costReal)}</b><br>
            Vận hành: <b>${typeof fmtShort==='function'?fmtShort(opTotal):fmt(opTotal)}</b> | Thuế: <b>${typeof fmtShort==='function'?fmtShort(taxFlat):fmt(taxFlat)}</b>
          </div>
        </div>

        <div class="kpi-card" style="background:${finalNetProfit >= 0 ? '#ecfdf5' : '#fef2f2'}; border:1px solid ${finalNetProfit >= 0 ? '#a7f3d0' : '#fecaca'};">
          <div class="kpi-title" style="color:${finalNetProfit >= 0 ? '#059669' : '#dc2626'};">Lợi Nhuận Bỏ Túi (Cất Két)</div>
          <div class="kpi-value" style="color:${finalNetProfit >= 0 ? '#10b981' : '#dc2626'};">${fmt(finalNetProfit)}</div>
          <div style="font-size:11px; color:${finalNetProfit >= 0 ? '#059669' : '#dc2626'}; margin-top:6px;">
            (Đã trừ sạch Vốn, Phí, Thuế và Lương/MB)
          </div>
        </div>
      `;
    }

    // 6. Render Bảng (Cột Lãi thực hiển thị tiền Payout sàn trả để dễ đối soát)
    if (tableBody) {
      tableBody.innerHTML = groupedRows.map(g => `
        <tr style="border-bottom:1px solid #f1f5f9;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <td style="font-weight:800; color:#1e293b; padding:12px 10px;">${g.month}</td>
          <td>
            <div style="text-transform:capitalize; color:#2563eb; font-weight:700;">${g.platform}</div>
            <div style="font-size:11px; color:#64748b; font-weight:600; margin-top:2px;">🏬 ${g.shop}</div>
          </td>
          <td style="text-align:right; font-weight:700;">${fmt(g.rev)}</td>
          <td style="text-align:right; color:#ef4444; font-weight:600;">${fmt(g.fee)}</td>
          <td style="text-align:right; color:#f59e0b; font-weight:600;">${fmt(g.ads)}</td>
          <td style="text-align:right; font-weight:800; font-size:14px; color:${g.payout >= 0 ? '#10b981' : '#dc2626'};" title="Tiền sàn trả về ví">${fmt(g.payout)}</td>
        </tr>
      `).join('');
    }

    // 7. Render Biểu đồ
    const chartMonths = Object.keys(monthMap).sort();
    const revData = chartMonths.map(m => monthMap[m].rev);
    const payoutData = chartMonths.map(m => monthMap[m].payout);

    if (typeof makeChart === 'function') {
      makeChart("chartMonthlyRevenue", "bar", chartMonths, [
        { label: "Doanh thu chốt (đ)", data: revData, backgroundColor: "#3b82f6" }
      ]);
      makeChart("chartMonthlyProfit", "line", chartMonths, [
        { label: "Tiền thực nhận từ sàn (đ)", data: payoutData, borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true }
      ]);
    }

  } catch (err) {
    console.error("Lỗi loadMonthly:", err);
    if (kpiGrid) kpiGrid.innerHTML = `<div style="color:red; padding:10px;">❌ Lỗi tải dữ liệu: ${err.message}</div>`;
  }
}