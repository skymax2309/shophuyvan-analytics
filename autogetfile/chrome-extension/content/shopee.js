// ══════════════════════════════════════════════════════════════════
// CONTENT SCRIPT — Shopee Seller (banhang.shopee.vn)
// Luồng: Chọn ngày → Click Download (trigger export) 
//        → Chờ 3 phút → Click icon 3 gạch → Tải về
// ══════════════════════════════════════════════════════════════════

;(async () => {
  const platform = "shopee"

  const { pendingAuto } = await chrome.storage.local.get("pendingAuto")
  if (!pendingAuto || pendingAuto.platform !== platform) return
  if (Date.now() - pendingAuto.ts > 10 * 60 * 1000) {
    await chrome.storage.local.remove("pendingAuto")
    return
  }

  status("🔍 Shopee: Đã vào trang, đang chờ load...")
  await waitForPageLoad()
  status("⏳ [1/5] Trang đã load, chờ render xong...")
  await sleep(5000)

  const path = window.location.pathname
  status("📍 [2/5] Đang ở: " + path)

  if (path.includes("income/statement")) {
    await handleIncomeStatement(pendingAuto)
  } else {
    status("🔀 [2/5] Chuyển đến trang báo cáo thu nhập...")
    await sleep(1000)
    window.location.href = "https://banhang.shopee.vn/portal/finance/income/statement"
  }
})()

// ── BƯỚC 1: Chọn ngày + Click Download trong bảng ────────────────
async function handleIncomeStatement(task) {
  status("📅 [3/5] Bắt đầu xử lý trang báo cáo...")

  try {
    status("🔍 [3/5] Đang tìm nút Download trong bảng... (chờ 3s)")
    await sleep(3000)

    const downloadLinks = findElementsByText("Download")
    status("📊 [3/5] Tìm thấy " + downloadLinks.length + " nút Download")

    if (!downloadLinks.length) {
      status("❌ [3/5] Không thấy nút Download — trang có thể chưa load xong, thử lại sau 5s...", true)
      await sleep(5000)
      const retry = findElementsByText("Download")
      if (!retry.length) {
        status("❌ Vẫn không thấy nút Download. Dừng lại.", true)
        await chrome.storage.local.remove("pendingAuto")
        return
      }
    }

    status("🖱️ [4/5] Click Download báo cáo mới nhất...")
    await sleep(1000)
    downloadLinks[0].click()
    await sleep(3000)

    status("⏳ [4/5] Shopee đang xử lý file... Chờ 3 phút (đừng đóng tab!)")

    // Đếm ngược 3 phút, log mỗi 30s
    for (let i = 6; i > 0; i--) {
      await sleep(30000)
      status("⏳ [4/5] Còn " + (i * 30) + " giây...")
    }

    status("🖱️ [5/5] Mở panel báo cáo gần nhất...")
    await clickDownloadFromPanel()

  } catch(e) {
    status("❌ Lỗi tại bước xử lý: " + e.message, true)
    await chrome.storage.local.remove("pendingAuto")
  }
}

// ── BƯỚC 2: Sau 3 phút → Click icon 3 gạch → Tải về ─────────────
async function clickDownloadFromPanel() {
  status("📋 [5/5] Đang tìm icon 3 gạch để mở panel...")
  await sleep(2000)

  const iconBtn = findIconThreeLines()
  if (!iconBtn) {
    status("❌ [5/5] Không tìm thấy icon 3 gạch — hãy tự click icon đó và bấm Tải về.", true)
    await chrome.storage.local.remove("pendingAuto")
    return
  }

  status("🖱️ [5/5] Click icon 3 gạch...")
  iconBtn.click()
  await sleep(3000)

  status("🔍 [5/5] Tìm nút Tải về trong panel...")
  let taiVeBtns = findElementsByText("Tải về")
  status("📊 [5/5] Tìm thấy " + taiVeBtns.length + " nút Tải về")

  if (!taiVeBtns.length) {
    status("⏳ [5/5] Chưa thấy nút Tải về — chờ thêm 60 giây...")
    await sleep(60000)
    iconBtn.click()
    await sleep(3000)
    taiVeBtns = findElementsByText("Tải về")
    if (!taiVeBtns.length) {
      status("❌ [5/5] Vẫn chưa có nút Tải về. Shopee có thể chưa xử lý xong — hãy tự tải.", true)
      await chrome.storage.local.remove("pendingAuto")
      return
    }
  }

  status("🖱️ [5/5] Click Tải về...")
  await sleep(1000)
  taiVeBtns[0].click()
  await sleep(2000)
  await chrome.storage.local.remove("pendingAuto")
  status("✅ XONG! File đang được tải về máy.")
}

// ── Set date range ────────────────────────────────────────────────
async function setDateRange(from, to) {
  // Tìm dropdown chọn ngày (có text dạng "Tuần: ...")
  const dateDropdown = document.querySelector('[class*="date-picker"], [class*="datepicker"], [class*="period"]')
    || findElementsByText("Tuần:")[0]
    || findElementsByText("Tháng:")[0]

  if (dateDropdown) {
    dateDropdown.click()
    await sleep(1000)

    // Thử tìm input date
    const inputs = document.querySelectorAll('input[type="date"], input[placeholder*="ngày"], input[placeholder*="date"]')
    if (inputs.length >= 2) {
      await simulateInput(inputs[0], from)
      await simulateInput(inputs[1], to)
      await sleep(500)

      // Click nút áp dụng
      const applyBtn = findElementsByText("Áp dụng")[0] || findElementsByText("Apply")[0]
      if (applyBtn) applyBtn.click()
    }
  }
}

// ── Tìm icon 3 gạch ──────────────────────────────────────────────
function findIconThreeLines() {
  // Shopee dùng SVG icon hoặc button có class riêng
  const candidates = [
    ...document.querySelectorAll('button, div[role="button"], span[role="button"]')
  ]

  for (const el of candidates) {
    const cls = (el.className || "").toString()
    // Tìm phần tử có chứa SVG lines hoặc class liên quan
    if (cls.includes("report") || cls.includes("history") || cls.includes("list")) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.width < 60 && rect.height < 60) return el
    }
    // Tìm theo vị trí: góc trên phải, nhỏ
    const rect = el.getBoundingClientRect()
    if (
      rect.right > window.innerWidth * 0.85 &&
      rect.top < 300 &&
      rect.width > 0 && rect.width < 50 &&
      el.querySelectorAll('line, rect, path').length >= 2
    ) return el
  }

  // Fallback: tìm element có title hoặc aria-label liên quan
  return document.querySelector('[title*="report"], [aria-label*="report"], [title*="báo cáo"]')
}

// ── Utilities ─────────────────────────────────────────────────────
function findElementsByText(text) {
  const results = []
  for (const el of document.querySelectorAll('a, button, span, div')) {
    if (el.textContent.trim() === text) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) results.push(el)
    }
  }
  return results
}

async function simulateInput(el, value) {
  el.focus()
  el.value = value
  el.dispatchEvent(new Event("input",  { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  await sleep(300)
}

async function waitForPageLoad() {
  return new Promise(resolve => {
    if (document.readyState === "complete") return resolve()
    window.addEventListener("load", resolve, { once: true })
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function status(msg, isError = false) {
  console.log("[ShopHuyVan]", msg)
  chrome.runtime.sendMessage({ type: "STATUS_UPDATE", platform: "shopee", msg, isError })
}
