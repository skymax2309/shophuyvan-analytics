// DateRangePicker — đã đơn giản hóa thành 2 input[type=date] trong HTML

let _justClickedInside = false   // ShopTreePicker.js cần biến này

function initDRP() {}

function closeDRP() {}           // ShopTreePicker.js gọi hàm này

function applyPreset(key) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const fmt = d => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  const shift = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d }

  let from, to
  if      (key === "today")     { from = to = today }
  else if (key === "yesterday") { from = to = shift(-1) }
  else if (key === "thisweek")  {
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1
    from = shift(-dow); to = today
  }
  else if (key === "thismonth") { from = new Date(today.getFullYear(), today.getMonth(), 1); to = today }
  else if (key === "lastmonth") {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    to   = new Date(today.getFullYear(), today.getMonth(), 0)
  }
  else if (key === "last7")  { from = shift(-6); to = today }
  else if (key === "last30") { from = shift(-29); to = today }

  if (from && to) {
    document.getElementById("filterFrom").value = fmt(from)
    document.getElementById("filterTo").value   = fmt(to)
  }
}
