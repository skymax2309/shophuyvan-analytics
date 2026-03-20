// DateRangePicker — đã đơn giản hóa thành 2 input[type=date] trong HTML

let _justClickedInside = false   // ShopTreePicker.js cần biến này

function initDRP() {}

function closeDRP() {}           // ShopTreePicker.js gọi hàm này

function applyPreset(key) {
  const now = new Date()
  const fmt = d => d.toISOString().slice(0, 10)
  const shift = n => { const d = new Date(now); d.setDate(d.getDate() + n); return d }

  let from, to
  if      (key === "today")     { from = to = now }
  else if (key === "yesterday") { from = to = shift(-1) }
  else if (key === "thisweek")  {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
    from = shift(-dow); to = now
  }
  else if (key === "thismonth") { from = new Date(now.getFullYear(), now.getMonth(), 1); to = now }
  else if (key === "lastmonth") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    to   = new Date(now.getFullYear(), now.getMonth(), 0)
  }
  else if (key === "last7")  { from = shift(-6); to = now }
  else if (key === "last30") { from = shift(-29); to = now }

  if (from && to) {
    document.getElementById("filterFrom").value = fmt(from)
    document.getElementById("filterTo").value   = fmt(to)
  }
}