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
