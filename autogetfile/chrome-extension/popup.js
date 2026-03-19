// ══════════════════════════════════════════════════════════════════
// POPUP JS — ShopHuyVan Auto Report
// ══════════════════════════════════════════════════════════════════

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Set default date: tháng trước
  const today    = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastDay  = new Date(today.getFullYear(), today.getMonth(), 0)
  document.getElementById("dateFrom").value = fmt(firstDay)
  document.getElementById("dateTo").value   = fmt(lastDay)

  // Gắn event cho platform buttons
  document.querySelectorAll(".plt-btn").forEach(btn => {
    btn.addEventListener("click", () => togglePlatform(btn))
  })

  // Gắn event cho settings toggles
  const autoInterceptEl = document.getElementById("autoIntercept")
  const scheduleEl      = document.getElementById("scheduleEnabled")
  const scheduleDayEl   = document.getElementById("scheduleDay")
  if (autoInterceptEl) autoInterceptEl.addEventListener("change", () => saveSetting("autoIntercept", autoInterceptEl.checked))
  if (scheduleEl)      scheduleEl.addEventListener("change",      () => saveSetting("scheduleEnabled", scheduleEl.checked))
  if (scheduleDayEl)   scheduleDayEl.addEventListener("change",   () => saveSetting("scheduleDay", scheduleDayEl.value))

  // Gắn event cho nút Run
  const runBtn = document.getElementById("runBtn")
  if (runBtn) runBtn.addEventListener("click", runAuto)

  // Load settings đã lưu
  const s = await chrome.storage.local.get([
    "autoIntercept", "scheduleEnabled", "scheduleDay", "schedulePlatforms"
  ])
  if (s.autoIntercept)    document.getElementById("autoIntercept").checked    = true
  if (s.scheduleEnabled)  {
    document.getElementById("scheduleEnabled").checked = true
    document.getElementById("scheduleOptions").style.display = "flex"
  }
  if (s.scheduleDay)      document.getElementById("scheduleDay").value = s.scheduleDay
  if (s.schedulePlatforms) {
    document.querySelectorAll(".plt-btn").forEach(btn => {
      btn.classList.toggle("active", s.schedulePlatforms.includes(btn.dataset.platform))
    })
  }

  // Lắng nghe trạng thái từ background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "STATUS_RELAY") {
      addLog(msg.platform?.toUpperCase() || "INFO", msg.msg, msg.isError)
    }
  })
})

// ── Toggle platform ───────────────────────────────────────────────
function togglePlatform(btn) {
  btn.classList.toggle("active")
  // Lưu danh sách platforms
  const active = [...document.querySelectorAll(".plt-btn.active")].map(b => b.dataset.platform)
  chrome.storage.local.set({ schedulePlatforms: active })
}

// ── Run auto ──────────────────────────────────────────────────────
async function runAuto() {
  const platforms = [...document.querySelectorAll(".plt-btn.active")].map(b => b.dataset.platform)
  if (!platforms.length) {
    addLog("WARN", "Chưa chọn sàn nào!", true)
    return
  }

  const dateFrom = document.getElementById("dateFrom").value
  const dateTo   = document.getElementById("dateTo").value
  if (!dateFrom || !dateTo) {
    addLog("WARN", "Vui lòng chọn khoảng ngày!", true)
    return
  }

  const btn = document.getElementById("runBtn")
  btn.disabled    = true
  btn.textContent = "⏳ Đang chạy..."

  clearLog()
  addLog("START", `Bắt đầu tải ${platforms.length} sàn: ${dateFrom} → ${dateTo}`)

  for (const platform of platforms) {
    addLog(platform.toUpperCase(), `Đang mở trang ${platform}...`)
    try {
      const res = await chrome.runtime.sendMessage({
        type: "OPEN_AND_AUTO", platform, dateFrom, dateTo
      })
      if (res?.ok) {
        addLog(platform.toUpperCase(), `✅ Đã mở tab ${platform}, đang tự động...`)
      } else {
        addLog(platform.toUpperCase(), `❌ ${res?.error || "Lỗi không xác định"}`, true)
      }
    } catch(e) {
      addLog(platform.toUpperCase(), `❌ ${e.message}`, true)
    }

    // Chờ 8s giữa các sàn
    if (platforms.indexOf(platform) < platforms.length - 1) {
      await sleep(8000)
    }
  }

  btn.disabled    = false
  btn.textContent = "🚀 Bắt đầu tải tự động"
  addLog("DONE", "Hoàn tất! Kiểm tra hệ thống ShopHuyVan để xem kết quả.", false)
}

// ── Settings ──────────────────────────────────────────────────────
async function saveSetting(key, value) {
  await chrome.storage.local.set({ [key]: value })
  if (key === "scheduleEnabled") {
    document.getElementById("scheduleOptions").style.display = value ? "flex" : "none"
  }
}

// ── Log helpers ───────────────────────────────────────────────────
function addLog(badge, msg, isError = false) {
  const area = document.getElementById("logArea")
  const isSuccess = msg.includes("✅") || msg.includes("XONG")
  const cls  = isError ? "error" : isSuccess ? "success" : ""
  const time = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  const div  = document.createElement("div")
  div.className = `log-item ${cls}`
  div.innerHTML = `<span class="badge">${badge}</span><span class="msg">${msg} <span style="color:#9ca3af;font-size:10px">${time}</span></span>`
  area.appendChild(div)
  area.scrollTop = area.scrollHeight

  // Highlight dòng đang chạy (xóa highlight cũ)
  area.querySelectorAll(".log-item.running").forEach(el => el.classList.remove("running"))
  if (!isError && !isSuccess) div.classList.add("running")
}

function clearLog() {
  document.getElementById("logArea").innerHTML = ""
}

// ── Utils ─────────────────────────────────────────────────────────
function fmt(d) { return d.toISOString().slice(0, 10) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
