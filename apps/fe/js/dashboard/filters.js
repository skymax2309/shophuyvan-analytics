// ── FILTER MANAGEMENT ────────────────────────────────────────────────
// Requires: drpState, selectedShops (globals from components)
//           loadDashboard, loadTop, loadCancel (globals from dashboard/main.js)
//           API (global from utils/api.js)

function getFilterParams() {
  const p    = new URLSearchParams()
  const from = document.getElementById("filterFrom").value
  const to   = document.getElementById("filterTo").value
  const plt  = document.getElementById("filterPlatform").value
  const shop = document.getElementById("filterShop").value
  if (from) p.set("from", from)
  if (to)   p.set("to", to)
  if (plt)  p.set("platform", plt)
  if (shop) {
    shop.split(",").forEach(s => p.append("shop", s.trim()))
  }
  return p.toString() ? "?" + p.toString() : ""
}

function applyFilter() {
  const activeTab = document.querySelector(".tab-content.active")
  const name = activeTab?.id?.replace("tab-", "") || "daily"
  const promises = []
  const pushLoader = (loader) => {
    if (typeof loader === "function") promises.push(loader())
  }

  // Khi đổi bộ lọc, chỉ tải lại đúng tab đang mở để tránh request thừa và tránh số tháng bị giữ cache cũ.
  if (name === "monthly") {
    pushLoader(window.loadMonthly)
  } else if (name === "income") {
    pushLoader(window.loadIncome)
  } else {
    pushLoader(name === "daily" ? (window.loadDaily || window.loadDashboard) : window.loadDashboard)
    if (name === "top") pushLoader(window.loadTop)
    if (name === "cancel") pushLoader(window.loadCancel)
    if (name === "netprofit") pushLoader(window.loadOrderAnalytics)
  }

  return Promise.all(promises)
}

function setActiveDatePreset(key = "") {
  document.querySelectorAll("[data-date-preset]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.datePreset === key)
  })
}

function markManualDateRange() {
  // Khi người dùng tự sửa ngày, bỏ trạng thái chọn nhanh/tháng để tránh hiểu nhầm là vẫn đang lọc cả tháng.
  setActiveDatePreset("")
  const monthSelector = document.getElementById("monthSelector")
  if (monthSelector) monthSelector.value = ""
}

function initManualDateFilterHandlers() {
  ;["filterFrom", "filterTo"].forEach(id => {
    const input = document.getElementById(id)
    if (input && !input.dataset.manualFilterBound) {
      input.dataset.manualFilterBound = "1"
      input.addEventListener("change", markManualDateRange)
    }
  })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initManualDateFilterHandlers)
} else {
  initManualDateFilterHandlers()
}

function setQuickDateRange(key) {
  if (typeof applyPreset === "function") applyPreset(key)
  setActiveDatePreset(key)
  const monthSelector = document.getElementById("monthSelector")
  if (monthSelector) monthSelector.value = ""
  return applyFilter()
}

function resetFilter() {
  // Reset date range picker
  if (typeof drpState !== "undefined") {
    drpState.start     = null
    drpState.end       = null
    drpState.selecting = false
  }
  if (typeof applyPreset === "function") applyPreset("today")
  setActiveDatePreset("today")
  const monthSelector = document.getElementById("monthSelector")
  if (monthSelector) monthSelector.value = ""
  const drpLabel = document.getElementById("drpLabel")
  const drpClear = document.getElementById("drpClear")
  const drpInput = document.getElementById("drpInput")
  if (drpLabel) drpLabel.textContent = "Chọn khoảng ngày"
  if (drpClear) drpClear.style.display = "none"
  if (drpInput) drpInput.classList.remove("active")
  document.querySelectorAll(".drp-preset").forEach(e => e.classList.remove("active"))
  // Reset shop picker
  selectedShops = {}
  document.getElementById("filterPlatform").value = ""
  document.getElementById("filterShop").value     = ""
  renderShopTags()
  applyFilter()
}

function setFilterMonth() {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
  document.getElementById("filterFrom").value = `${year}-${month}-01`
  document.getElementById("filterTo").value   = `${year}-${month}-${lastDay}`
  setActiveDatePreset("")
  applyFilter()
}

// Hàm mới xử lý khi chọn tháng từ Menu Dropdown
function onMonthSelectChange(select) {
  const val = select.value;
  if (!val) return;
  const now = new Date();
  let targetMonth = now.getMonth(); // Mặc định là tháng hiện tại
  let targetYear = now.getFullYear();

  if (val === "current") {
      targetMonth = now.getMonth();
  } else if (val) {
      targetMonth = parseInt(val) - 1; // JS đếm tháng từ 0-11
  }

  const monthStr = String(targetMonth + 1).padStart(2, "0");
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();

  document.getElementById("filterFrom").value = `${targetYear}-${monthStr}-01`;
  document.getElementById("filterTo").value   = `${targetYear}-${monthStr}-${lastDay}`;
  setActiveDatePreset("");
  applyFilter(); // Kích hoạt tự động lọc dữ liệu
}

function setFilterYear() {
  const year = new Date().getFullYear()
  document.getElementById("filterFrom").value = `${year}-01-01`
  document.getElementById("filterTo").value   = `${year}-12-31`
  setActiveDatePreset("")
  const monthSelector = document.getElementById("monthSelector")
  if (monthSelector) monthSelector.value = ""
  applyFilter()
}

async function recalcCost() {
  if (!confirm("Cập nhật lại giá vốn cho tất cả đơn hàng?")) return
  const btn = event.target
  btn.disabled    = true
  btn.textContent = "⏳ Đang cập nhật..."
  try {
    const res  = await fetch(API + "/api/recalc-cost", { method: "POST" })
    const data = await res.json()
    alert(`✅ Đã cập nhật ${data.updated_v2 || data.updated} đơn hàng!`)
    loadDashboard()
  } catch (e) {
    alert("Lỗi: " + e.message)
  } finally {
    btn.disabled    = false
    btn.textContent = "🔄 Cập nhật vốn"
  }
}
