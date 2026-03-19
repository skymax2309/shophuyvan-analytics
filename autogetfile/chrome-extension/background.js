// ══════════════════════════════════════════════════════════════════
// BACKGROUND SERVICE WORKER — ShopHuyVan Auto Report
// ══════════════════════════════════════════════════════════════════

const API = "https://huyvan-worker-api.nghiemchihuy.workers.dev"

// ── Lắng nghe message từ content scripts ─────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "UPLOAD_FILE_URL") {
    handleUploadFromUrl(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }))
    return true // async
  }
  if (msg.type === "UPLOAD_FILE_BLOB") {
    handleUploadBlob(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }))
    return true
  }
  if (msg.type === "OPEN_AND_AUTO") {
    openAndAuto(msg.platform, msg.dateFrom, msg.dateTo).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }))
    return true
  }
  if (msg.type === "STATUS_UPDATE") {
    // Relay trạng thái từ content script ra popup
    chrome.runtime.sendMessage({ type: "STATUS_RELAY", ...msg }).catch(() => {})
    sendResponse({ ok: true })
    return false
  }
})

// ── Intercept file download từ các sàn ───────────────────────────
chrome.downloads.onCreated.addListener(async (item) => {
  const url = item.url || item.finalUrl || ""
  const filename = item.filename || ""

  const isTiktok  = url.includes("seller.tiktok") || url.includes("seller-vn.tiktok") || filename.includes("TikTok")
  const isShopee  = url.includes("seller.shopee") || url.includes("banhang.shopee") || filename.toLowerCase().includes("shopee")
  const isLazada  = url.includes("sellercenter.lazada") || filename.toLowerCase().includes("lazada")

  if (!isTiktok && !isShopee && !isLazada) return

  // Đọc setting có bật auto-intercept không
  const { autoIntercept } = await chrome.storage.local.get("autoIntercept")
  if (!autoIntercept) return

  // Chờ download xong rồi upload
  waitForDownloadAndUpload(item.id, isTiktok ? "tiktok" : isShopee ? "shopee" : "lazada")
})

async function waitForDownloadAndUpload(downloadId, platform) {
  return new Promise((resolve) => {
    const listener = (delta) => {
      if (delta.id !== downloadId) return
      if (delta.state?.current === "complete") {
        chrome.downloads.onChanged.removeListener(listener)
        chrome.downloads.search({ id: downloadId }, async ([item]) => {
          if (!item) return
          try {
            await uploadFromDownloadedFile(item, platform)
            notify(`✅ Đã upload báo cáo ${platform.toUpperCase()} lên ShopHuyVan!`)
          } catch(e) {
            notify(`❌ Upload thất bại: ${e.message}`, true)
          }
          resolve()
        })
      }
    }
    chrome.downloads.onChanged.addListener(listener)
  })
}

async function uploadFromDownloadedFile(item, platform) {
  // Đọc file từ local disk qua FileSystem API (Chrome extension có quyền)
  const response = await fetch(item.url || `file://${item.filename}`)
  const blob     = await response.blob()
  return uploadBlob(blob, item.filename.split("/").pop() || item.filename.split("\\").pop(), platform)
}

async function handleUploadFromUrl({ fileUrl, filename, platform, shop }) {
  const response = await fetch(fileUrl)
  const blob     = await response.blob()
  return uploadBlob(blob, filename, platform, shop)
}

async function handleUploadBlob({ base64, filename, platform, shop }) {
  const byteArr  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const blob     = new Blob([byteArr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  return uploadBlob(blob, filename, platform, shop)
}

async function uploadBlob(blob, filename, platform, shop) {
  const formData = new FormData()
  formData.append("file", blob, filename)
  if (platform) formData.append("platform", platform)
  if (shop)     formData.append("shop", shop)

  const res  = await fetch(API + "/api/upload-report", { method: "POST", body: formData })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return { ok: true, ...data }
}

// ── Tự động mở trang và trigger download ─────────────────────────
async function openAndAuto(platform, dateFrom, dateTo) {
  const urls = {
    tiktok: "https://seller-vn.tiktok.com/finance/settlement/export",
    shopee: "https://banhang.shopee.vn/portal/finance/income/statement",
    lazada: "https://sellercenter.lazada.vn/apps/finance/transaction-history"
  }

  const url = urls[platform]
  if (!url) throw new Error("Platform không hỗ trợ: " + platform)

  // Lưu thông tin để content script biết cần làm gì
  await chrome.storage.local.set({
    pendingAuto: { platform, dateFrom, dateTo, ts: Date.now() }
  })

  // Mở tab mới
  const tab = await chrome.tabs.create({ url, active: true })
  return { ok: true, tabId: tab.id }
}

// ── Alarm: tự động chạy theo lịch ────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "auto-download") return

  const { scheduleEnabled, schedulePlatforms, scheduleDay } = await chrome.storage.local.get([
    "scheduleEnabled", "schedulePlatforms", "scheduleDay"
  ])

  if (!scheduleEnabled) return

  const today     = new Date()
  const dayOfMonth = today.getDate()
  if (scheduleDay && dayOfMonth !== parseInt(scheduleDay)) return

  // Tính khoảng ngày: tháng trước
  const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastDay  = new Date(today.getFullYear(), today.getMonth(), 0)
  const fmt      = d => d.toISOString().slice(0, 10)

  const platforms = schedulePlatforms || ["tiktok", "shopee"]
  for (const plt of platforms) {
    await openAndAuto(plt, fmt(firstDay), fmt(lastDay))
    await new Promise(r => setTimeout(r, 5000)) // chờ 5s giữa các sàn
  }
})

// Tạo alarm kiểm tra mỗi ngày
chrome.alarms.create("auto-download", { periodInMinutes: 60 })

// ── Helper notification ───────────────────────────────────────────
function notify(msg, isError = false) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: "ShopHuyVan Auto Report",
    message: msg,
    priority: isError ? 2 : 1
  })
}
