(function () {
  function buildDailyRows(ctx) {
    const profDayRows = Array.isArray(ctx.profDay) ? ctx.profDay : []
    const revenueByDate = new Map((Array.isArray(ctx.revDay) ? ctx.revDay : []).map((row) => [row.d, row]))
    const totalDailyOrders = profDayRows.reduce((sum, row) => sum + Number(row.orders || 0), 0)
    const allocateOperationCost = (orders) => {
      const count = Number(orders || 0)
      if (!ctx.opDisplayTotal) return 0
      if (totalDailyOrders > 0) return ctx.opDisplayTotal * count / totalDailyOrders
      return profDayRows.length ? ctx.opDisplayTotal / profDayRows.length : 0
    }

    const rows = profDayRows.map((row) => {
      const revenueRow = revenueByDate.get(row.d) || {}
      const revenue = Number(row.revenue ?? revenueRow.revenue ?? 0)
      const orders = Number(row.orders ?? revenueRow.orders ?? 0)
      const operationCost = allocateOperationCost(orders)
      const profit = Number(row.profit_real ?? 0) - operationCost
      return {
        d: row.d,
        orders,
        revenue,
        cost_real: Number(row.cost_real ?? 0),
        fee: Number(row.fee ?? 0),
        operation_cost: operationCost,
        profit_real: profit,
        profit_invoice: Number(row.profit_invoice ?? 0) - operationCost,
        margin: revenue > 0 ? profit / revenue * 100 : 0,
      }
    })

    return { rows, allocateOperationCost }
  }

  function renderDailyProfitTable(ctx, rows) {
    const tbody = document.getElementById("dailyProfitTable")
    if (!tbody) return
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:18px;color:#9ca3af">Không có dữ liệu trong khoảng lọc này</td></tr>`
      return
    }

    const totals = rows.reduce((acc, row) => {
      acc.orders += row.orders
      acc.revenue += row.revenue
      acc.cost_real += row.cost_real
      acc.fee += row.fee
      acc.operation_cost += row.operation_cost
      acc.profit_real += row.profit_real
      return acc
    }, { orders: 0, revenue: 0, cost_real: 0, fee: 0, operation_cost: 0, profit_real: 0 })
    const totalMargin = totals.revenue > 0 ? totals.profit_real / totals.revenue * 100 : 0

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td><b>${row.d}</b></td>
        <td style="text-align:right">${row.orders.toLocaleString("vi-VN")}</td>
        <td style="text-align:right">${ctx.fmt(row.revenue)}</td>
        <td style="text-align:right">${ctx.fmt(row.cost_real)}</td>
        <td style="text-align:right">${ctx.fmt(row.fee)}</td>
        <td style="text-align:right">${ctx.fmt(row.operation_cost)}</td>
        <td style="text-align:right" class="${row.profit_real >= 0 ? "profit-pos" : "profit-neg"}">${ctx.fmt(row.profit_real)}</td>
        <td style="text-align:right" class="${row.margin >= 0 ? "profit-pos" : "profit-neg"}">${row.margin.toFixed(1)}%</td>
      </tr>`).join("") + `
      <tr>
        <td><b>Tổng</b></td>
        <td style="text-align:right"><b>${totals.orders.toLocaleString("vi-VN")}</b></td>
        <td style="text-align:right"><b>${ctx.fmt(totals.revenue)}</b></td>
        <td style="text-align:right"><b>${ctx.fmt(totals.cost_real)}</b></td>
        <td style="text-align:right"><b>${ctx.fmt(totals.fee)}</b></td>
        <td style="text-align:right"><b>${ctx.fmt(totals.operation_cost)}</b></td>
        <td style="text-align:right" class="${totals.profit_real >= 0 ? "profit-pos" : "profit-neg"}"><b>${ctx.fmt(totals.profit_real)}</b></td>
        <td style="text-align:right" class="${totalMargin >= 0 ? "profit-pos" : "profit-neg"}"><b>${totalMargin.toFixed(1)}%</b></td>
      </tr>`
  }

  function renderCharts(ctx, rows) {
    const revDay = Array.isArray(ctx.revDay) ? ctx.revDay : []
    const platforms = Array.isArray(ctx.platforms) ? ctx.platforms : []
    const shops = Array.isArray(ctx.shops) ? ctx.shops : []
    const platformColors = { shopee: "#ee4d2d", tiktok: "#010101", lazada: "#0f146d" }

    // Biểu đồ dùng cùng dòng ngày đã phân bổ chi phí vận hành để khớp với bảng dưới.
    ctx.makeChart("chartRevenue", "bar", revDay.map((row) => row.d), [{
      label: "Doanh thu",
      data: revDay.map((row) => row.revenue),
      backgroundColor: "#3b82f620",
      borderColor: "#3b82f6",
      borderWidth: 2,
      fill: true,
      tension: 0.3,
    }], { extra: { plugins: { legend: { display: false } } } })

    ctx.makeChart("chartProfit", "line", rows.map((row) => row.d), [
      { label: "Lãi thực sau vận hành", data: rows.map((row) => row.profit_real), borderColor: "#10b981", backgroundColor: "#10b98115", fill: true, tension: 0.3, borderWidth: 2 },
      { label: "Lãi HĐ sau vận hành", data: rows.map((row) => row.profit_invoice), borderColor: "#8b5cf6", backgroundColor: "transparent", tension: 0.3, borderWidth: 2, borderDash: [4, 3] },
    ], { legend: true })

    ctx.makeChart("chartPlatform", "doughnut", platforms.map((row) => row.platform), [{
      data: platforms.map((row) => row.total_revenue),
      backgroundColor: platforms.map((row) => platformColors[row.platform] || "#888"),
    }], { legend: true })

    ctx.makeChart("chartShop", "bar", shops.map((row) => row.shop), [{
      label: "Doanh thu",
      data: shops.map((row) => row.total_revenue),
      backgroundColor: "#4f46e5",
      borderRadius: 6,
    }], {})

    const fullShopRows = Array.isArray(ctx.allShopRows) ? ctx.allShopRows : []
    const revenueShopRows = Array.isArray(ctx.shopTreeRows) && ctx.shopTreeRows.length ? ctx.shopTreeRows : shops
    // NEO: Merge shop cấu hình với shop có doanh thu để dropdown luôn đủ shop vận hành, kể cả shop tháng này ít đơn hoặc chưa có API.
    ctx.buildShopTree([...fullShopRows, ...revenueShopRows])
  }

  function render(ctx) {
    const { rows } = buildDailyRows(ctx)
    renderDailyProfitTable(ctx, rows)
    renderCharts(ctx, rows)
  }

  window.SHV_KPI_DAILY = { render }
})()
