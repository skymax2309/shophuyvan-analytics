// ==========================================
// MODULE: ĐỐI SOÁT DOANH THU THÁNG
// ==========================================

window.loadMonthly = async function() {
  console.log("Loading Monthly Settlement Tab...");
  const kpiGrid = document.getElementById('kpiGridMonthly');
  const tableBody = document.getElementById('tableMonthlySettlement');

  try {
    if (kpiGrid) kpiGrid.innerHTML = '<div class="loading">⏳ Đang tải dữ liệu chốt sổ từ Server...</div>';

    // 1. Lấy dữ liệu từ bảng platform_reports
    const res = await fetch(API + "/api/reports");
    if (!res.ok) throw new Error("Không thể tải báo cáo tháng");
    const reports = await res.json();

    if (!reports || reports.length === 0) {
      if (kpiGrid) kpiGrid.innerHTML = '<div style="padding:20px; color:#64748b; font-weight:600;">Chưa có dữ liệu đối soát nào.</div>';
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af">Chưa có dữ liệu. Vui lòng tải file báo cáo đối soát từ sàn lên hệ thống!</td></tr>';
      return;
    }

    let totalRev = 0;
    let totalProfit = 0;
    let totalFee = 0;
    
    const groupMap = {}; // Dùng để gom nhóm cho Bảng (Tháng + Sàn + Shop)
    const monthMap = {}; // Dùng để gom nhóm cho Biểu đồ (Chỉ theo Tháng)

    // 2. Xử lý & Gom nhóm dữ liệu
    reports.forEach(r => {
      const month = r.report_month || 'N/A';
      const platform = r.platform || 'unknown';
      const shop = r.shop || 'Mặc định';
      
      const rev = parseFloat(r.gross_revenue || r.net_product_revenue || r.revenue || 0);
      const fee = parseFloat(r.fee_total || r.total_fee || 0);
      const ads = parseFloat(r.fee_ads || r.ads_fee || 0);
      const profit = parseFloat(r.total_payout || r.profit || 0);

      totalRev += rev;
      totalProfit += profit;
      totalFee += fee;

      // Gom nhóm cho Bảng Chi tiết
      const groupKey = `${month}_${platform}_${shop}`;
      if (!groupMap[groupKey]) {
        groupMap[groupKey] = { month, platform, shop, rev: 0, fee: 0, ads: 0, profit: 0 };
      }
      groupMap[groupKey].rev += rev;
      groupMap[groupKey].fee += fee;
      groupMap[groupKey].ads += ads;
      groupMap[groupKey].profit += profit;

      // Gom nhóm cho Biểu đồ
      if (!monthMap[month]) monthMap[month] = { rev: 0, profit: 0 };
      monthMap[month].rev += rev;
      monthMap[month].profit += profit;
    });

    // 3. Sắp xếp dữ liệu Bảng (Tháng giảm dần -> Sàn -> Shop)
    const groupedRows = Object.values(groupMap).sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month); 
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      return a.shop.localeCompare(b.shop);
    });

    // 4. Render 3 thẻ KPI
    if (kpiGrid) {
      kpiGrid.innerHTML = `
        <div class="kpi-card" style="background:#f8fafc; border:1px solid #e2e8f0;">
          <div class="kpi-title" style="color:#64748b;">Tổng Doanh Thu Chốt</div>
          <div class="kpi-value" style="color:#2563eb;">${fmt(totalRev)}</div>
        </div>
        <div class="kpi-card" style="background:#fff1f2; border:1px solid #fecdd3;">
          <div class="kpi-title" style="color:#e11d48;">Tổng Phí / Trừ Cấn Trừ</div>
          <div class="kpi-value" style="color:#ef4444;">${fmt(totalFee)}</div>
        </div>
        <div class="kpi-card" style="background:${totalProfit >= 0 ? '#ecfdf5' : '#fef2f2'}; border:1px solid ${totalProfit >= 0 ? '#a7f3d0' : '#fecaca'};">
          <div class="kpi-title" style="color:${totalProfit >= 0 ? '#059669' : '#dc2626'};">Lợi Nhuận Bỏ Túi</div>
          <div class="kpi-value" style="color:${totalProfit >= 0 ? '#10b981' : '#dc2626'};">${fmt(totalProfit)}</div>
        </div>
      `;
    }

    // 5. Render Bảng chi tiết
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
          <td style="text-align:right; font-weight:800; font-size:14px; color:${g.profit >= 0 ? '#10b981' : '#dc2626'};">${fmt(g.profit)}</td>
        </tr>
      `).join('');
    }

    // 6. Render Biểu đồ (Sắp xếp Tháng tăng dần T1 -> T12 để vẽ biểu đồ cho thuận mắt)
    const chartMonths = Object.keys(monthMap).sort();
    const revData = chartMonths.map(m => monthMap[m].rev);
    const profitData = chartMonths.map(m => monthMap[m].profit);

    if (typeof makeChart === 'function') {
      makeChart("chartMonthlyRevenue", "bar", chartMonths, [
        { label: "Doanh thu chốt (đ)", data: revData, backgroundColor: "#3b82f6" }
      ]);
      makeChart("chartMonthlyProfit", "line", chartMonths, [
        { label: "Lợi nhuận thực (đ)", data: profitData, borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true }
      ]);
    }

  } catch (err) {
    console.error("Lỗi loadMonthly:", err);
    if (kpiGrid) kpiGrid.innerHTML = `<div style="color:red; padding:10px;">❌ Lỗi tải dữ liệu: ${err.message}</div>`;
  }
}