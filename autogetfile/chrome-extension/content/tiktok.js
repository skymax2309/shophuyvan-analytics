// ══════════════════════════════════════════════════════════════════
// CONTENT SCRIPT — TikTok Seller Center
// Tự động detect trang báo cáo và trigger download
// ══════════════════════════════════════════════════════════════════

;(async () => {
  const platform = "tiktok"

  // Kiểm tra có pending auto task không
  const { pendingAuto } = await chrome.storage.local.get("pendingAuto")
  if (!pendingAuto || pendingAuto.platform !== platform) return
  if (Date.now() - pendingAuto.ts > 5 * 60 * 1000) {
    // Quá 5 phút → bỏ qua
    await chrome.storage.local.remove("pendingAuto")
    return
  }

  status("🔍 Đang tìm trang báo cáo TikTok...")

  // Chờ trang load xong
  await waitForPageLoad()
  await sleep(2000)

  const path = window.location.pathname

  // ── Trang Settlement / Finance ────────────────────────────────
  if (path.includes("settlement") || path.includes("finance")) {
    await handleSettlementPage(pendingAuto)
  }
  // ── Trang Orders ──────────────────────────────────────────────
  else if (path.includes("order")) {
    await handleOrderPage(pendingAuto)
  }
  else {
    // Điều hướng đến trang đúng
    window.location.href = "https://seller-vn.tiktok.com/finance/settlement/export"
  }
})()

async function handleSettlementPage(task) {
  status("📅 Đang set khoảng ngày...")
  await sleep(3000)

  try {
    // Tìm nút Export / Xuất
    const exportBtn = await waitForElement([
      'button[class*="export"]',
      'button[class*="Export"]',
      '[data-testid*="export"]',
      'button:contains("Export")',
      'button:contains("Xuất")',
      'button:contains("Download")',
    ])

    if (exportBtn) {
      exportBtn.click()
      status("⬇️ Đã click Export, đang chờ file...")
      await sleep(3000)

      // Sau khi download xong, intercept trong background.js
      // Xóa pending task
      await chrome.storage.local.remove("pendingAuto")
      status("✅ TikTok: Đã trigger download!")
    } else {
      status("⚠️ Không tìm thấy nút Export. Vui lòng export thủ công.", true)
    }
  } catch(e) {
    status("❌ Lỗi: " + e.message, true)
  }
}

async function handleOrderPage(task) {
  status("📋 Đang xử lý trang đơn hàng TikTok...")
  await sleep(3000)

  try {
    // Set date range nếu có input
    if (task.dateFrom && task.dateTo) {
      await setDateRange(task.dateFrom, task.dateTo)
      await sleep(1500)
    }

    // Tìm nút Export
    const exportBtn = await waitForElement([
      '[class*="export-btn"]',
      'button[class*="download"]',
      'span:contains("Export orders")',
    ])

    if (exportBtn) {
      exportBtn.click()
      await sleep(2000)
      await chrome.storage.local.remove("pendingAuto")
      status("✅ TikTok Orders: Đã trigger download!")
    }
  } catch(e) {
    status("❌ Lỗi: " + e.message, true)
  }
}

async function setDateRange(from, to) {
  // Tìm date picker và set giá trị
  const inputs = document.querySelectorAll('input[type="text"][class*="date"], input[placeholder*="date"], input[placeholder*="Date"]')
  if (inputs.length >= 2) {
    await simulateInput(inputs[0], from)
    await simulateInput(inputs[1], to)
  }
}

// ── Utilities ─────────────────────────────────────────────────────
async function waitForElement(selectors, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      try {
        // Hỗ trợ :contains()
        if (sel.includes(":contains(")) {
          const text  = sel.match(/:contains\("(.+?)"\)/)?.[1]
          const tag   = sel.split(":contains")[0] || "*"
          const found = [...document.querySelectorAll(tag)].find(el =>
            el.textContent.trim().includes(text)
          )
          if (found) return found
        } else {
          const el = document.querySelector(sel)
          if (el) return el
        }
      } catch {}
    }
    await sleep(500)
  }
  return null
}

async function waitForPageLoad() {
  return new Promise(resolve => {
    if (document.readyState === "complete") return resolve()
    window.addEventListener("load", resolve, { once: true })
  })
}

async function simulateInput(el, value) {
  el.focus()
  el.value = value
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  await sleep(300)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function status(msg, isError = false) {
  chrome.runtime.sendMessage({ type: "STATUS_UPDATE", platform: "tiktok", msg, isError })
}
