// ── ADMIN MAIN ───────────────────────────────────────────────────────
// Requires (globals): loadCombos, loadOrders, loadInvoices, loadSkus

// ── TABS ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"))
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"))
  
  const tabPane = document.getElementById("tab-" + name);
  if (tabPane) tabPane.classList.add("active");
  
  // Cách mới: Tự động tìm đúng nút được bấm dựa vào thuộc tính onclick, không cần đếm thứ tự nữa
  document.querySelectorAll(".tab-btn").forEach(btn => {
    const onClickAttr = btn.getAttribute("onclick") || "";
    if (onClickAttr.includes(`'${name}'`) || onClickAttr.includes(`"${name}"`)) {
      btn.classList.add("active");
    }
  });
  
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
if (typeof loadSkus === 'function') {
  loadSkus();
}

if (typeof addComboRow === 'function') {
  addComboRow(); // Mặc định 1 dòng combo (chỉ chạy ở trang có load script combo)
}
