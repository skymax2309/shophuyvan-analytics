// ── DASHBOARD MAIN ───────────────────────────────────────────────────
// Requires (globals): API, fmt, fmtShort, fmtFull, pct, profitClass,
//   makeChart, getFilterParams, drpState, selectedShops, buildShopTree,
//   renderShopTags, applyFilter, initDRP, applyPreset,
//   closeAllPickers, closeDRP, closeShopPicker, _justClickedInside

let allProducts    = []
let currentFilters = {}

// ── TABS ─────────────────────────────────────────────────────────────
window.showTab = function(name) {
  if (name === "ads") {
    // ADS đã tách thành trang riêng để phần quảng cáo có luồng bảo trì độc lập với dashboard doanh thu.
    window.location.href = 'ads.html'
    return
  }
  if (name === "promotion") {
    window.location.href = 'promotions.html'
    return
  }
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"))
  const targetTab = document.getElementById("tab-" + name);
  if (targetTab) targetTab.classList.add("active");
  document.body.dataset.activeTab = name;
  const filterBar = document.querySelector(".filter-bar");
  if (filterBar) filterBar.hidden = name === "chat" || name === "income";
  
  // Highlight menu tương ứng trên Sidebar
  document.querySelectorAll(".sidebar-nav a").forEach(a => {
    a.classList.remove("active");
    if (a.getAttribute('onclick') && a.getAttribute('onclick').includes(name)) {
      a.classList.add("active");
    }
  });

  // Điều hướng tải dữ liệu theo Tab
  if (name === "daily") {
    if (typeof loadDaily === 'function') loadDaily();
  } else if (name === "monthly") {
    if (typeof loadMonthly === 'function') loadMonthly();
  } else if (name === "income") {
    if (typeof loadIncome === 'function') loadIncome();
  } else if (name === "netprofit") {
    if (typeof loadOrderAnalytics === 'function') loadOrderAnalytics();
  } else if (name === "top") {
    if(typeof loadTop === 'function') loadTop();
    if(typeof populateSkuShopFilter === 'function') populateSkuShopFilter();
    if(typeof loadTopSkuFull === 'function') loadTopSkuFull();
  } else if (name === "cancel") {
    if(typeof loadCancel === 'function') loadCancel();
  } else if (name === "chat") {
    if(typeof loadChat === 'function') loadChat();
  }
}





// ── EXPORT ───────────────────────────────────────────────────────────
async function exportData() {
  const qs     = getFilterParams()
  const result = await fetch(API + "/api/export-orders" + qs).then(r => r.json())
  const orders = Array.isArray(result) ? result : (Array.isArray(result.data) ? result.data : [])
  const csvCell = value => `"${String(value ?? "").replace(/"/g, "\"\"")}"`
  const rows   = [
    [
      "Ngày","Sàn","Shop","Mã đơn","SKU","Tên SP","SL",
      "Giá niêm yết","Giảm giá của shop","Tổng doanh thu báo cáo","Tiền sản phẩm sau KM shop","Phí vận chuyển người mua trả","Người mua thanh toán","Sàn tài trợ / Voucher sàn",
      "Phí sàn","Thuế / Khấu trừ","Phí ngoài sàn / Ads","Tổng khấu trừ",
      "Giá vốn","Thực nhận ví / Settlement","Profit basis","Lãi tạm tính / Lãi thực","Trạng thái lãi","Basis %","Loại đơn","Nguồn Finance","Độ tin cậy","Cập nhật nguồn"
    ],
    ...orders.map(o => [
      o.order_date, o.platform, o.shop, o.order_id, o.sku, o.product_name,
      o.qty,
      o.original_price ?? o.raw_revenue ?? o.revenue,
      o.shop_discount ?? 0,
      o.gross_revenue ?? o.revenue,
      o.product_revenue_after_shop_discount ?? 0,
      o.buyer_shipping_paid ?? 0,
      o.buyer_paid ?? o.revenue,
      o.platform_voucher ?? 0,
      o.marketplace_fee_total ?? o.fee_platform ?? 0,
      o.tax_deduction ?? 0,
      o.ops_ads_fee ?? o.fee_ads ?? 0,
      o.deduction_total ?? o.fee,
      o.cost_real,
      o.actual_income_available === false || o.actual_income_available === 0 ? "" : (o.actual_income_settlement || o.actual_income),
      o.profit_basis || o.actual_income,
      o.profit_real,
      o.profit_status || (o.finance_confidence === "estimated" ? "estimated" : "actual_income_confirmed"),
      o.percent_basis_label || "Người mua thanh toán",
      o.order_type,
      o.finance_source,
      o.finance_confidence,
      o.source_updated_at || ""
    ])
  ]
  const csv  = rows.map(r => r.map(csvCell).join(",")).join("\n")
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
window.init = async function() {
  if (typeof applyPreset === 'function') applyPreset("today");
  if (typeof setActiveDatePreset === 'function') setActiveDatePreset("today");
  const monthSelector = document.getElementById("monthSelector");
  if (monthSelector) monthSelector.value = "";
  const initialTab = (window.location.hash || '').replace('#', '').trim();
  // Giữ tương thích link cũ bằng cách chuyển sang các trang đã tách riêng.
  if (initialTab === 'chat') {
    window.location.href = 'chat-cskh.html'
    return
  }
  if (initialTab === 'ads') {
    window.location.href = 'ads.html'
    return
  }
  if (initialTab === 'promotion') {
    window.location.href = 'promotions.html'
    return
  }
  if (initialTab && document.getElementById("tab-" + initialTab)) {
    showTab(initialTab);
    return;
  }
  if (typeof loadProducts === 'function') {
    await loadProducts().catch(error => console.warn('[MAIN] Không tải được sản phẩm cho máy tính:', error?.message || error));
  }
  
  // Mặc định khởi động vào Tab Doanh thu Ngày
  if (typeof loadDaily === 'function') {
    await loadDaily();
  } else if (typeof loadDashboard === 'function') {
    await loadDashboard(); // Fallback dùng tạm hàm cũ nếu chưa đổi tên
  }
}

// ── ĐIỀU HƯỚNG DỮ LIỆU NGÀY ──
window.loadDaily = async function() {
  console.log("Loading Daily Tab...");
  // Gọi lại các logic render biểu đồ Ngày của bạn (đang nằm trong kpi.js)
  if (typeof loadDashboard === 'function') await loadDashboard();
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
