// ══════════════════════════════════════════════════════════════════
// CONTENT SCRIPT — Lazada Seller Center
// ══════════════════════════════════════════════════════════════════

;(async () => {
  const platform = "lazada"

  const { pendingAuto } = await chrome.storage.local.get("pendingAuto")
  if (!pendingAuto || pendingAuto.platform !== platform) return
  if (Date.now() - pendingAuto.ts > 5 * 60 * 1000) {
    await chrome.storage.local.remove("pendingAuto")
    return
  }

  status("🔍 Đang xử lý trang Lazada Seller Center...")
  await waitForPageLoad()
  await sleep(3000)

  const path = window.location.pathname

  if (path.includes("transaction") || path.includes("finance")) {
    await handleTransactionPage(pendingAuto)
  } else if (path.includes("order")) {
    await handleOrderPage(pendingAuto)
  } else {
    window.location.href = "https://sellercenter.lazada.vn/apps/finance/transaction-history"
  }
})()

async function handleTransactionPage(task) {
  status("💰 Trang giao dịch Lazada — đang tìm nút Export...")
  await sleep(3000)

  try {
    if (task.dateFrom && task.dateTo) {
      await setLazadaDate(task.dateFrom, task.dateTo)
      await sleep(1500)
    }

    const exportBtn = await waitForElement([
      'button[class*="export"]',
      'a[class*="export"]',
      'span:contains("Export")',
      'button:contains("Download")',
      '[class*="download"]:not(script)',
    ])

    if (exportBtn) {
      exportBtn.click()
      await sleep(2000)
      await chrome.storage.local.remove("pendingAuto")
      status("✅ Lazada: Đã trigger download!")
    } else {
      status("⚠️ Không tìm thấy nút Export Lazada.", true)
    }
  } catch(e) {
    status("❌ Lỗi Lazada: " + e.message, true)
  }
}

async function handleOrderPage(task) {
  status("📋 Trang đơn hàng Lazada...")
  await sleep(3000)

  try {
    const exportBtn = await waitForElement([
      'button:contains("Export Order")',
      'a:contains("Export")',
      '[class*="ic-download"]',
    ])

    if (exportBtn) {
      exportBtn.click()
      await sleep(1500)
      await chrome.storage.local.remove("pendingAuto")
      status("✅ Lazada Orders: Đã trigger download!")
    }
  } catch(e) {
    status("❌ Lỗi: " + e.message, true)
  }
}

async function setLazadaDate(from, to) {
  const inputs = document.querySelectorAll('input[placeholder*="date"], input[class*="date-input"], .date-range input')
  if (inputs.length >= 2) {
    await simulateInput(inputs[0], from)
    await simulateInput(inputs[1], to)
    await sleep(500)
    const searchBtn = document.querySelector('button[class*="search"], button:contains("Search")')
    if (searchBtn) searchBtn.click()
  }
}

async function waitForElement(selectors, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      try {
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
  el.dispatchEvent(new Event("input",  { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  await sleep(300)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function status(msg, isError = false) {
  chrome.runtime.sendMessage({ type: "STATUS_UPDATE", platform: "lazada", msg, isError })
}
