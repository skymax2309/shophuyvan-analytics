// ── ADMIN MAIN ───────────────────────────────────────────────────────
// Requires (globals): loadCombos, loadOrders, loadInvoices, loadSkus

// ── TABS ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"))
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"))
  document.getElementById("tab-" + name).classList.add("active")
  document.querySelectorAll(".tab-btn").forEach((btn, i) => {
    if (["sku", "combo", "orders", "invoice"][i] === name) btn.classList.add("active")
  })
  if (name === "combo")   loadCombos()
  if (name === "orders")  { populateOrderShops(); loadOrders(1) }
  if (name === "invoice") loadInvoices()
}

// ── TOAST ─────────────────────────────────────────────────────────────
function showToast(msg, isErr = false) {
  const t = document.getElementById("toast")
  t.textContent = msg
  t.style.background = isErr ? "#dc2626" : "#16a34a"
  t.classList.add("show")
  setTimeout(() => t.classList.remove("show"), 2500)
}

// ── INIT ─────────────────────────────────────────────────────────────
loadSkus()
addComboRow() // Mặc định 1 dòng combo
