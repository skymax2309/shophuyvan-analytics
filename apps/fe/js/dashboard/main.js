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
