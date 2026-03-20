// ── DATE RANGE PICKER ────────────────────────────────────────────────
// Requires: applyFilter() from dashboard/filters.js (global)

const drpState = { start: null, end: null, selecting: false, hovered: null }
let drpMonth1, drpMonth2
let _justClickedInside = false

const MONTHS_VI = ["Th 1","Th 2","Th 3","Th 4","Th 5","Th 6","Th 7","Th 8","Th 9","Th 10","Th 11","Th 12"]
const DOWS      = ["T2","T3","T4","T5","T6","T7","CN"]

function initDRP() {
  const now = new Date()
  drpMonth1 = { year: now.getFullYear(), month: now.getMonth() }
  drpMonth2 = { year: now.getFullYear(), month: now.getMonth() + 1 }
  if (drpMonth2.month > 11) { drpMonth2.month = 0; drpMonth2.year++ }
  renderDRP()
}

function toggleDRP() {
  const panel = document.getElementById("drpPanel")
  const input = document.getElementById("drpInput")
  const isOpen = panel.classList.contains("open")
  closeAllPickers()
  if (!isOpen) { panel.classList.add("open"); input.classList.add("active"); renderDRP() }
}

function closeDRP() {
  document.getElementById("drpPanel").classList.remove("open")
  document.getElementById("drpInput").classList.remove("active")
}

function renderDRP() {
  renderCal("drpCal1", drpMonth1, true)
  renderCal("drpCal2", drpMonth2, false)
}

function renderCal(elId, { year, month }, isLeft) {
  const el = document.getElementById(elId)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  let startDow = firstDay.getDay(); if (startDow === 0) startDow = 7

  const prevBtn = isLeft
    ? `<button class="drp-nav" onclick="drpNavMonth(-1)">‹</button>
       <button class="drp-nav" onclick="drpNavMonth(-12)" style="font-size:11px">«</button>`
    : `<button class="drp-nav" style="visibility:hidden">‹</button>`
  const nextBtn = !isLeft
    ? `<button class="drp-nav" onclick="drpNavMonth(1)">›</button>
       <button class="drp-nav" onclick="drpNavMonth(12)" style="font-size:11px">»</button>`
    : `<button class="drp-nav" style="visibility:hidden">›</button>`

  let html = `
    <div class="drp-cal-header">
      <div style="display:flex;gap:2px">${prevBtn}</div>
      <div class="drp-cal-title">${MONTHS_VI[month]} ${year}</div>
      <div style="display:flex;gap:2px">${nextBtn}</div>
    </div>
    <div class="drp-grid">
      ${DOWS.map(d => `<div class="drp-dow">${d}</div>`).join("")}
      ${Array(startDow - 1).fill('<div class="drp-day other-month"></div>').join("")}`

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d)
    const ts = date.getTime()
    let cls = "drp-day"
    if (date.getTime() === today.getTime()) cls += " today"
    const s = drpState.start, e = drpState.end, h = drpState.hovered
    const rangeEnd = e || (drpState.selecting && h ? h : null)
    const lo = s && rangeEnd ? Math.min(s, rangeEnd) : null
    const hi = s && rangeEnd ? Math.max(s, rangeEnd) : null
    if (s && ts === s) cls += " range-start"
    if (e && ts === e) cls += " range-end"
    if (lo && hi && ts > lo && ts < hi) cls += " in-range"
    html += `<div class="${cls}" onclick="drpClickDay(${ts}, event)" onmouseenter="drpHover(${ts})">${d}</div>`
  }
  html += "</div>"
  el.innerHTML = html
}

function drpNavMonth(delta) {
  let m = drpMonth1.month + delta, y = drpMonth1.year
  while (m > 11) { m -= 12; y++ }
  while (m < 0)  { m += 12; y-- }
  drpMonth1 = { year: y, month: m }
  let m2 = m + 1, y2 = y
  if (m2 > 11) { m2 = 0; y2++ }
  drpMonth2 = { year: y2, month: m2 }
  renderDRP()
}

function drpHover(ts) {
  if (drpState.selecting) { drpState.hovered = ts; renderDRP() }
}

function drpClickDay(ts, event) {
  _justClickedInside = true
  event.stopPropagation()
  event.preventDefault()

  // Nếu chưa có start hoặc đã có cả start+end => bắt đầu chọn mới
  if (!drpState.start || (drpState.start && drpState.end)) {
    drpState.start = ts
    drpState.end = null
    drpState.selecting = true
    drpState.hovered = null
  } else {
    // Nếu đã có start mà chưa có end => gán end (không đóng picker)
    const lo = Math.min(drpState.start, ts)
    const hi = Math.max(drpState.start, ts)
    drpState.start = lo
    drpState.end = hi
    drpState.selecting = false
    drpState.hovered = null
    commitDRP()
    // Không gọi closeDRP() ở đây để người dùng có thể kiểm tra/điều chỉnh
  }

  renderDRP()
}


function commitDRP() {
  const fmtISO = ts => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  const fmtVi = ts => {
    const d = new Date(ts)
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  }
  document.getElementById("filterFrom").value = fmtISO(drpState.start)
  document.getElementById("filterTo").value   = drpState.end ? fmtISO(drpState.end) : fmtISO(drpState.start)
  const label = drpState.end && drpState.end !== drpState.start
    ? `${fmtVi(drpState.start)} → ${fmtVi(drpState.end)}`
    : fmtVi(drpState.start)
  document.getElementById("drpLabel").textContent = label
  document.getElementById("drpClear").style.display = "inline"
  document.querySelectorAll(".drp-preset").forEach(e => e.classList.remove("active"))
}

function applyDRP() {
  // Nếu chưa có start thì không làm gì
  if (!drpState.start) return
  // Nếu chưa có end thì set end = start (để luôn có to)
  if (!drpState.end) drpState.end = drpState.start
  commitDRP()
  closeDRP()
  // Gọi filter để load lại dashboard
  if (typeof applyFilter === "function") applyFilter()
}


function clearDRP(e) {
  e.stopPropagation()
  drpState.start = null; drpState.end = null; drpState.selecting = false
  document.getElementById("filterFrom").value = ""
  document.getElementById("filterTo").value   = ""
  document.getElementById("drpLabel").textContent = "Chọn khoảng ngày"
  document.getElementById("drpClear").style.display = "none"
  document.querySelectorAll(".drp-preset").forEach(e => e.classList.remove("active"))
}

function applyPreset(key, evt) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  let s, e
  const d = n => { const x = new Date(now); x.setDate(x.getDate() + n); return x.getTime() }
  if      (key === "today")     { s = e = now.getTime() }
  else if (key === "yesterday") { s = e = d(-1) }
  else if (key === "thisweek")  {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
    s = d(-dow); e = now.getTime()
  }
  else if (key === "thismonth") { s = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); e = now.getTime() }
  else if (key === "lastmonth") {
    const fm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lm = new Date(now.getFullYear(), now.getMonth(), 0)
    s = fm.getTime(); e = lm.getTime()
  }
  else if (key === "last7")  { s = d(-6); e = now.getTime() }
  else if (key === "last30") { s = d(-29); e = now.getTime() }

  drpState.start = s; drpState.end = e; drpState.selecting = false
  document.querySelectorAll(".drp-preset").forEach(el => el.classList.remove("active"))
  if (evt && evt.currentTarget) evt.currentTarget.classList.add("active")
  commitDRP()
  closeDRP()
  if (typeof applyFilter === "function") applyFilter()
}

