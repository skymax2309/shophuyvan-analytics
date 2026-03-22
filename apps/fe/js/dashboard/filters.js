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
  const name = document.querySelector(".tab-content.active").id.replace("tab-", "")
  const promises = [loadDashboard()]
  if (name === "top")    promises.push(loadTop())
  if (name === "cancel") promises.push(loadCancel())
  return Promise.all(promises)
}

function resetFilter() {
  // Reset date range picker
  drpState.start     = null
  drpState.end       = null
  drpState.selecting = false
  document.getElementById("filterFrom").value      = ""
  document.getElementById("filterTo").value        = ""
  document.getElementById("drpLabel").textContent  = "Chọn khoảng ngày"
  document.getElementById("drpClear").style.display = "none"
  document.getElementById("drpInput").classList.remove("active")
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
  applyFilter()
}

function setFilterYear() {
  const year = new Date().getFullYear()
  document.getElementById("filterFrom").value = `${year}-01-01`
  document.getElementById("filterTo").value   = `${year}-12-31`
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
