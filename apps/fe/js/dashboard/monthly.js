// ==========================================
// MODULE: ĐỐI SOÁT DOANH THU THÁNG
// ==========================================

window.loadMonthly = async function() {
  console.log("Loading Monthly Settlement Tab...");
  const kpiGrid = document.getElementById('kpiGridMonthly');
  const tableBody = document.getElementById('tableMonthlySettlement');

  try {
    if (kpiGrid) kpiGrid.innerHTML = '<div class="loading">⏳ Đang tải dữ liệu chốt sổ từ Server...</div>';

    // 1. Lấy dữ liệu từ bảng platform_reports (Nơi lưu file đối soát Excel)
    const res = await fetch(API + "/api/reports");
    if (!res.ok) throw new Error("Không thể tải báo cáo tháng");
    const reports = await res.json();
	console.log("👉 DỮ LIỆU 1 DÒNG TỪ DB:", reports[0]);

    if (!reports || reports.length === 0) {
      if (kpiGrid) kpiGrid.innerHTML = '<div style="padding:20px; color:#64748b; font-weight:600;">Chưa có dữ liệu đối soát nào.</div>';
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af">Chưa có dữ liệu. Vui lòng tải file báo cáo đối soát từ sàn lên hệ thống!</td></tr>';
      return;
    }

    let totalRev = 0;
    let totalProfit = 0;
    let totalFee = 0;
    const tableRows = [];
    const monthMap = {}; // Dùng để gom nhóm vẽ biểu đồ

    // 2. Xử lý và tính toán dữ liệu
    reports.forEach(r => {
      // Hỗ trợ linh hoạt tên cột từ nhiều tool parse khác nhau
      const month = r.report_month || 'N/A';
      const platform = r.platform || 'unknown';
      const rev = parseFloat(r.revenue || r.total_revenue || 0);
      const fee = parseFloat(r.platform_fee || r.total_fee || r.fees || 0);
      const ads = parseFloat(r.ads_fee || r.marketing_fee || 0);
      const profit = parseFloat(r.profit || r.net_income || r.profit_real || 0);

      totalRev += rev;
      totalProfit += profit;
      totalFee += fee;

      // Chuẩn bị code HTML cho Bảng chi tiết
      tableRows.push(`
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="font-weight:800; color:#1e293b; padding:12px 10px;">${month}</td>
          <td style="text-transform:capitalize; color:#2563eb; font-weight:600;">${platform}</td>
          <td style="text-align:right; font-weight:700;">${fmt(rev)}</td>
          <td style="text-align:right; color:#ef4444; font-weight:600;">${fmt(fee)}</td>
          <td style="text-align:right; color:#f59e0b; font-weight:600;">${fmt(ads)}</td>
          <td style="text-align:right; font-weight:800; font-size:14px; color:${profit >= 0 ? '#10b981' : '#dc2626'};">${fmt(profit)}</td>
        </tr>
      `);

      // Gom số liệu theo tháng để vẽ Biểu đồ
      if (!monthMap[month]) monthMap[month] = { rev: 0, profit: 0 };
      monthMap[month].rev += rev;
      monthMap[month].profit += profit;
    });

    // 3. Render 3 thẻ KPI
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

    // 4. Render Bảng chi tiết
    if (tableBody) tableBody.innerHTML = tableRows.join('');

    // 5. Render 2 Biểu đồ (Sử dụng hàm makeChart có sẵn của bạn)
    const sortedMonths = Object.keys(monthMap).sort();
    const labels = sortedMonths;
    const revData = sortedMonths.map(m => monthMap[m].rev);
    const profitData = sortedMonths.map(m => monthMap[m].profit);

    if (typeof makeChart === 'function') {
      makeChart("chartMonthlyRevenue", "bar", labels, [
        { label: "Doanh thu chốt (đ)", data: revData, backgroundColor: "#3b82f6" }
      ]);
      makeChart("chartMonthlyProfit", "line", labels, [
        { label: "Lợi nhuận thực (đ)", data: profitData, borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true }
      ]);
    }

  } catch (err) {
    console.error("Lỗi loadMonthly:", err);
    if (kpiGrid) kpiGrid.innerHTML = `<div style="color:red; padding:10px;">❌ Lỗi tải dữ liệu: ${err.message}</div>`;
  }
}