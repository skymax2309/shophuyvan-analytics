const API = "https://huyvan-worker-api.nghiemchihuy.workers.dev"
const LOCAL_HELPER = "http://127.0.0.1:8765"

const PLATFORM_LABELS = {
  shopee: "Shopee",
  lazada: "Lazada",
  tiktok: "TikTok",
  all: "Tất cả sàn",
}

let apiShopsData = []

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function normalizePlatform(value) {
  return String(value || "").trim().toLowerCase()
}

function getShopName(shop) {
  return String(shop?.shop_name || shop?.user_name || "").trim()
}

function isGeneratedShopName(shop) {
  const platform = normalizePlatform(shop?.platform || "shopee")
  const name = getShopName(shop)
  if (!platform || !name) return false

  if (platform === "shopee") return /^shopee\s+\d+$/i.test(name)
  if (platform === "lazada") return /^lazada\s+\d+$/i.test(name)
  if (platform === "tiktok") return /^tiktok\s+\d+$/i.test(name)
  return new RegExp(`^${platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\d+$`, "i").test(name)
}

function dedupeVisibleShops(shops) {
  const platformsWithNamedShop = new Set(
    shops
      .filter(shop => !isGeneratedShopName(shop))
      .map(shop => normalizePlatform(shop.platform || "shopee"))
  )
  const seen = new Set()

  return shops.filter(shop => {
    const platform = normalizePlatform(shop.platform || "shopee")
    const name = getShopName(shop)
    if (!name) return false

    if (isGeneratedShopName(shop) && platformsWithNamedShop.has(platform)) return false

    const key = `${platform}|${name}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getPlatformLabel(platform) {
  return PLATFORM_LABELS[normalizePlatform(platform)] || String(platform || "").toUpperCase()
}

function getShopsByPlatform(platform, includeAll = false) {
  const normalized = normalizePlatform(platform)
  return apiShopsData
    .filter(shop => {
      const shopPlatform = normalizePlatform(shop.platform || "shopee")
      return includeAll && !normalized ? true : shopPlatform === normalized
    })
    .sort((a, b) => String(a.shop_name || "").localeCompare(String(b.shop_name || ""), "vi"))
}

function setActivePlatformButtons(group, platform) {
  const normalized = normalizePlatform(platform)
  document.querySelectorAll(`[data-platform-group="${group}"]`).forEach(btn => {
    btn.classList.toggle("is-active", normalizePlatform(btn.dataset.platform) === normalized)
  })
}

function fillShopSelect(selectId, platform, placeholder, includeAllOption = false) {
  const select = document.getElementById(selectId)
  if (!select) return

  const current = select.value
  const shops = getShopsByPlatform(platform, includeAllOption)
  const firstOption = `<option value="">${placeholder}</option>`
  select.innerHTML = firstOption + shops.map(shop => {
    const platformLabel = getPlatformLabel(shop.platform || platform)
    const name = escapeHtml(shop.shop_name || shop.user_name || "")
    return `<option value="${name}">[${platformLabel}] ${name}</option>`
  }).join("")

  if ([...select.options].some(option => option.value === current)) select.value = current
}

function refreshUploadShopSelect() {
  const platform = document.getElementById("selPlatform")?.value || "shopee"
  fillShopSelect("inpShop", platform, "-- Chọn shop --")
  setActivePlatformButtons("upload", platform)
}

function refreshHistoryShopSelect() {
  const platform = document.getElementById("filterPlatform")?.value || ""
  fillShopSelect("filterShop", platform, "Tất cả shop", true)
  setActivePlatformButtons("history", platform || "all")
}

function setUploadPlatform(platform) {
  const select = document.getElementById("selPlatform")
  if (select) select.value = normalizePlatform(platform)
  refreshUploadShopSelect()
}

function setHistoryPlatform(platform) {
  const value = normalizePlatform(platform)
  const select = document.getElementById("filterPlatform")
  if (select) select.value = value === "all" ? "" : value
  refreshHistoryShopSelect()
  if (typeof loadHistory === "function") loadHistory()
}

function setBotPlatform(platform) {
  const select = document.getElementById("botPlatform")
  if (select) select.value = normalizePlatform(platform)
  onBotPlatformChange()
}

async function loadShops() {
  try {
    const res = await fetch(API + "/api/shops?t=" + Date.now())
    if (!res.ok) throw new Error("Không tải được danh sách shop")

    const oldNames = ["Huy Vân Store Q.Bình Tân", "shophuyvan.vn", "KHOGIADUNGHUYVAN", "ShopHuyVan"]
    const normalizedShops = (await res.json())
      .filter(shop => shop && !oldNames.includes(shop.shop_name))
      .map(shop => ({
        ...shop,
        platform: normalizePlatform(shop.platform || "shopee"),
      }))
    apiShopsData = dedupeVisibleShops(normalizedShops)

    refreshUploadShopSelect()
    refreshHistoryShopSelect()
    onBotPlatformChange()
  } catch (error) {
    console.error("Lỗi tải danh sách shop:", error)
    const botShopBox = document.getElementById("botShopCheckboxes")
    if (botShopBox) botShopBox.innerHTML = '<span class="muted-text">Không tải được danh sách shop.</span>'
  }
}

function selectAllShops() {
  document.querySelectorAll(".bot-shop-cb").forEach(cb => { cb.checked = true })
}

function clearAllShops() {
  document.querySelectorAll(".bot-shop-cb").forEach(cb => { cb.checked = false })
}

function getSelectedShops() {
  return [...document.querySelectorAll("#botShopCheckboxes input[type='checkbox']:checked")]
    .map(cb => cb.value)
    .filter(Boolean)
}

function onBotTimeModeChange() {
  const mode = document.querySelector('input[name="botTimeMode"]:checked')?.value || "month"
  const monthMode = document.getElementById("botMonthMode")
  const dayMode = document.getElementById("botDayMode")
  if (monthMode) monthMode.style.display = mode === "month" ? "flex" : "none"
  if (dayMode) dayMode.style.display = mode === "day" ? "flex" : "none"

  const taskSel = document.getElementById("botTaskType")
  if (!taskSel) return
  if (mode === "day") {
    taskSel.value = "don_hang"
    taskSel.disabled = true
  } else {
    taskSel.disabled = false
  }
}

function renderBotShopCheckboxes(platform) {
  const el = document.getElementById("botShopCheckboxes")
  if (!el) return

  const shops = getShopsByPlatform(platform)
  if (!shops.length) {
    el.innerHTML = '<span class="muted-text">Không có shop thuộc sàn này.</span>'
    return
  }

  el.innerHTML = shops.map(shop => {
    const name = escapeHtml(shop.shop_name || shop.user_name || "")
    const platformLabel = getPlatformLabel(shop.platform)
    return `
      <label class="shop-check">
        <input type="checkbox" value="${name}" class="bot-shop-cb" checked>
        <span class="shop-check-platform">${platformLabel}</span>
        <span>${name}</span>
      </label>`
  }).join("")
}

function updateBotTaskOptions(platform) {
  const taskSel = document.getElementById("botTaskType")
  if (!taskSel) return

  const optionsByPlatform = {
    shopee: [
      { value: "all", label: "Tất cả báo cáo" },
      { value: "doanh_thu", label: "Doanh thu" },
      { value: "hoa_don", label: "Quảng cáo & phí" },
      { value: "don_hang", label: "Đơn hàng" },
    ],
    lazada: [
      { value: "all", label: "Tất cả báo cáo" },
      { value: "doanh_thu", label: "Doanh thu PDF" },
      { value: "hoa_don", label: "Hóa đơn" },
      { value: "don_hang", label: "Đơn hàng CSV" },
    ],
    tiktok: [
      { value: "all", label: "Tất cả báo cáo" },
      { value: "doanh_thu", label: "Doanh thu Excel" },
      { value: "hoa_don", label: "Hóa đơn phí sàn" },
      { value: "don_hang", label: "Đơn hàng" },
    ],
  }

  const current = taskSel.value
  const options = optionsByPlatform[normalizePlatform(platform)] || optionsByPlatform.shopee
  taskSel.innerHTML = options.map(item => `<option value="${item.value}">${item.label}</option>`).join("")
  if (options.some(item => item.value === current)) taskSel.value = current
  onBotTimeModeChange()
}

function onBotPlatformChange() {
  const platform = document.getElementById("botPlatform")?.value || "shopee"
  setActivePlatformButtons("bot", platform)
  renderBotShopCheckboxes(platform)
  updateBotTaskOptions(platform)
}

function readAutomationPayload(shop, month, year, taskType, timeMode, fromDate, toDate, schedule) {
  return {
    source: "report-upload-web",
    run_mode: "browser_bot_required",
    worker: "auto-ecom-data-center",
    note: "Tải báo cáo Seller Center cần bot local/Chrome thật nhận lệnh từ /api/jobs.",
    shop,
    time_mode: timeMode,
    month,
    year,
    task_type: taskType,
    from_date: fromDate || null,
    to_date: toDate || null,
    scheduled_at: schedule || null,
  }
}

async function triggerLocalReportBot(jobIds = [], options = {}) {
  const body = {
    reason: "report-upload",
    job_ids: jobIds.map(String).filter(Boolean),
    max_jobs: Math.max(20, jobIds.length || 20),
  }
  if (options.watch) {
    // Lệnh hẹn giờ phải bật worker nền để máy local tự quét job đến hạn, không chờ người dùng bấm lại.
    body.watch = true
    body.poll_interval = options.pollInterval || 60
  }

  const res = await fetch(LOCAL_HELPER + "/report-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.message || data.error || "Không gọi được bot local")
  return data
}

async function runReportBotNow(jobId = null) {
  const status = document.getElementById("botStatusLog")
  if (status) status.innerHTML = "Đang gọi bot local để chạy lệnh tải báo cáo..."
  try {
    if (jobId) {
      await fetch(API + "/api/jobs/" + Number(jobId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "pending",
          log_text: "Đã đưa lệnh về hàng chờ để chạy lại bằng bot local.",
        }),
      })
    }
    const data = await triggerLocalReportBot(jobId ? [jobId] : [])
    const message = data.started
      ? `Đã bật bot tải báo cáo. PID: ${data.report_worker_pid || "-"}`
      : `Bot tải báo cáo đang chạy sẵn. PID: ${data.report_worker_pid || "-"}`
    if (status) status.innerHTML = `<div class="automation-result ok">${escapeHtml(message)}</div>`
    showToast(message)
    setTimeout(loadJobProgress, 1500)
  } catch (error) {
    const message = "Chưa gọi được bot local. Hãy mở Auto OMS Python/local helper rồi bấm lại."
    if (status) status.innerHTML = `<div class="automation-result error">${escapeHtml(message)} ${escapeHtml(error.message)}</div>`
  }
}

async function createAutomationJob() {
  const selectedShops = getSelectedShops()
  const platform = document.getElementById("botPlatform")?.value || "shopee"
  const mStart = parseInt(document.getElementById("botMonthStart")?.value || "1", 10)
  const mEnd = parseInt(document.getElementById("botMonthEnd")?.value || "1", 10)
  const year = parseInt(document.getElementById("botYear")?.value || String(new Date().getFullYear()), 10)
  const schedule = document.getElementById("botSchedule")?.value || ""
  const taskType = document.getElementById("botTaskType")?.value || "all"
  const btn = document.getElementById("btnCreateJob")
  const status = document.getElementById("botStatusLog")
  const timeMode = document.querySelector('input[name="botTimeMode"]:checked')?.value || "month"
  const fromDate = document.getElementById("botFromDate")?.value || ""
  const toDate = document.getElementById("botToDate")?.value || ""

  if (!selectedShops.length) {
    alert("Chọn ít nhất 1 shop.")
    return
  }

  if (timeMode === "day") {
    if (!fromDate || !toDate) {
      alert("Vui lòng chọn từ ngày và đến ngày.")
      return
    }
    if (fromDate > toDate) {
      alert("Từ ngày không được lớn hơn đến ngày.")
      return
    }
  } else if (mStart > mEnd) {
    alert("Tháng bắt đầu không được lớn hơn tháng kết thúc.")
    return
  }

  if (btn) btn.disabled = true
  if (status) status.innerHTML = "Đang tạo lệnh cho bot trình duyệt..."

  try {
    let created = 0
    const jobs = []
    const createdJobIds = []

    if (timeMode === "day") {
      const date = new Date(fromDate)
      const month = date.getMonth() + 1
      const jobYear = date.getFullYear()
      for (const shop of selectedShops) {
        jobs.push({ shop, month, year: jobYear, taskType: "don_hang", fromDate, toDate })
      }
    } else {
      for (const shop of selectedShops) {
        for (let month = mStart; month <= mEnd; month++) {
          jobs.push({ shop, month, year, taskType, fromDate: null, toDate: null })
        }
      }
    }

    for (const job of jobs) {
      const payload = readAutomationPayload(
        job.shop,
        job.month,
        job.year,
        job.taskType,
        timeMode,
        job.fromDate,
        job.toDate,
        schedule
      )

      const res = await fetch(API + "/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "admin_huyvan",
          shop_name: job.shop,
          platform,
          month: job.month,
          year: job.year,
          task_type: job.taskType,
          scheduled_at: schedule || null,
          from_date: job.fromDate,
          to_date: job.toDate,
          payload: JSON.stringify(payload),
        }),
      })
      const data = await res.json()
      if (data.status !== "ok") throw new Error(data.error || "Không tạo được lệnh")
      created++
      if (data.id) createdJobIds.push(data.id)
    }

    let helperMessage = ""
    try {
      const helper = schedule
        ? await triggerLocalReportBot([], { watch: true, pollInterval: 60 })
        : await triggerLocalReportBot(createdJobIds)
      if (schedule) {
        helperMessage = helper.started
          ? ` Bot local đã bật chế độ canh lịch, PID ${helper.report_worker_pid || "-"}.`
          : ` Bot local đang canh lịch sẵn, PID ${helper.report_worker_pid || "-"}.`
      } else {
        helperMessage = helper.started
          ? ` Bot local đã nhận lệnh, PID ${helper.report_worker_pid || "-"}.`
          : ` Bot local đang chạy sẵn, PID ${helper.report_worker_pid || "-"}.`
      }
    } catch (error) {
      helperMessage = schedule
        ? " Chưa bật được bot canh lịch; mở Auto OMS Python/local helper rồi bấm tạo lịch lại."
        : " Chưa gọi được bot local; mở Auto OMS Python/local helper rồi bấm Chạy bot ngay."
    }

    if (status) {
      status.innerHTML = `
        <div class="automation-result ok">
          Đã tạo <b>${created}</b> lệnh cho bot trình duyệt.
          ${escapeHtml(helperMessage)}
        </div>`
    }
    showToast(`Đã tạo ${created} lệnh bot`)
    loadJobProgress()
  } catch (error) {
    if (status) status.innerHTML = `<div class="automation-result error">Lỗi tạo lệnh: ${escapeHtml(error.message)}</div>`
  } finally {
    if (btn) btn.disabled = false
  }
}

function showToast(msg) {
  const t = document.createElement("div")
  t.className = "toast"
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2500)
}

function parseJobPayload(payload) {
  if (!payload) return {}
  if (typeof payload === "object") return payload
  try { return JSON.parse(payload) } catch { return {} }
}

function statusLabel(status) {
  const value = String(status || "pending").toLowerCase()
  const labels = {
    pending: "Đang chờ bot",
    running: "Đang chạy",
    processing: "Đang xử lý",
    completed: "Hoàn tất",
    failed: "Lỗi",
  }
  return labels[value] || value.toUpperCase()
}

function statusClass(status) {
  const value = String(status || "pending").toLowerCase()
  if (value === "completed") return "completed"
  if (value === "failed") return "failed"
  if (value === "running" || value === "processing") return "running"
  return "pending"
}

async function loadJobProgress() {
  const el = document.getElementById("jobProgressList")
  if (!el) return

  try {
    const res = await fetch(API + "/api/jobs?mode=monitor&t=" + Date.now())
    const jobs = await res.json()
    if (!jobs.length) {
      el.innerHTML = '<div class="empty-state">Chưa có lệnh bot nào.</div>'
      return
    }

    el.innerHTML = `
      <div class="job-list">
        ${jobs.map(job => {
          const payload = parseJobPayload(job.payload)
          const mode = payload.run_mode === "browser_bot_required" ? "Bot trình duyệt" : "Lệnh hệ thống"
          const scheduled = job.scheduled_at ? String(job.scheduled_at).replace("T", " ") : "Chạy ngay khi bot quét"
          const dateRange = job.from_date && job.to_date
            ? `${escapeHtml(job.from_date)} → ${escapeHtml(job.to_date)}`
            : `T${escapeHtml(job.month)}/${escapeHtml(job.year)}`
          const jobStatus = String(job.status || "pending").toLowerCase()
          const canRunNow = jobStatus === "pending" || jobStatus === "failed"
          const runLabel = jobStatus === "failed" ? "Chạy lại" : "Chạy bot ngay"
          return `
            <div class="job-card">
              <div class="job-card-head">
                <div>
                  <b>${escapeHtml(job.shop_name)}</b>
                  <span>${getPlatformLabel(job.platform)} · ${escapeHtml(job.task_type || "all")}</span>
                </div>
                <span class="job-status ${statusClass(job.status)}">${statusLabel(job.status)}</span>
              </div>
              <div class="job-meta">
                <span>${dateRange}</span>
                <span>${escapeHtml(scheduled)}</span>
                <span>${escapeHtml(mode)}</span>
              </div>
              ${job.log_text ? `<div class="job-log">${escapeHtml(job.log_text)}</div>` : ""}
              <div class="job-actions">
                ${canRunNow ? `<button onclick="runReportBotNow(${Number(job.id)})" class="btn-link">${runLabel}</button>` : ""}
                <button onclick="deleteJob(${Number(job.id)})" class="btn-link-danger">Xóa lệnh</button>
              </div>
            </div>`
        }).join("")}
      </div>`
  } catch (error) {
    el.innerHTML = '<div class="automation-result error">Không thể tải trạng thái bot.</div>'
  }
}

async function deleteJob(id) {
  if (!confirm("Xóa lệnh này?")) return
  try {
    const res = await fetch(API + "/api/jobs/" + id, { method: "DELETE" })
    const data = await res.json()
    if (data.status === "ok") loadJobProgress()
    else alert("Lỗi xóa: " + (data.error || "unknown"))
  } catch (error) {
    alert("Lỗi: " + error.message)
  }
}

function initReportAutomationUi() {
  const currentYear = String(new Date().getFullYear())
  const yearSelect = document.getElementById("botYear")
  if (yearSelect && [...yearSelect.options].some(option => option.value === currentYear)) {
    yearSelect.value = currentYear
  }

  document.getElementById("selPlatform")?.addEventListener("change", refreshUploadShopSelect)
  document.getElementById("filterPlatform")?.addEventListener("change", refreshHistoryShopSelect)
  document.getElementById("botPlatform")?.addEventListener("change", onBotPlatformChange)

  setActivePlatformButtons("upload", document.getElementById("selPlatform")?.value || "shopee")
  setActivePlatformButtons("history", document.getElementById("filterPlatform")?.value || "all")
  setActivePlatformButtons("bot", document.getElementById("botPlatform")?.value || "shopee")
}

window.reportApiShops = () => apiShopsData

initReportAutomationUi()
setInterval(loadJobProgress, 30000)
loadJobProgress()
loadShops()
