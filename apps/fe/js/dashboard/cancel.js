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