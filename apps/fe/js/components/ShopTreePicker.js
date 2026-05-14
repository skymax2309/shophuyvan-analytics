// ── SHOP TREE PICKER ─────────────────────────────────────────────────
// Requires: applyFilter() from dashboard/filters.js (global)

let shopTreeData = []   // [{ platform, shops: [shopName] }]
let selectedShops = {}  // { "shopee::ShopA": true }
let platformOpen  = {}  // { shopee: true }

const PLAT_ICONS = {
  shopee: { bg: "#ee4d2d", icon: "🛍" },
  tiktok: { bg: "#010101", icon: "📱" },
  lazada: { bg: "#0f146d", icon: "🛒" },
}

function normalizeShopTreeRow(row) {
  // NEO: Cây shop phải đọc được cả nguồn doanh thu (`shop`) và nguồn cấu hình (`shop_name/user_name`) để không làm mất shop chưa API.
  if (!row || typeof row !== "object") return null
  const platform = String(row.platform || row.marketplace || "other").trim().toLowerCase() || "other"
  const shop = String(row.shop || row.shop_name || row.user_name || row.display_name || row.api_shop_id || "").trim()
  if (!shop) return null
  return { platform, shop }
}

function buildShopTree(shops) {
  const map = {}
  ;(Array.isArray(shops) ? shops : []).forEach(s => {
    const row = normalizeShopTreeRow(s)
    if (!row) return
    const p = row.platform || "other"
    if (!map[p]) map[p] = []
    if (!map[p].includes(row.shop)) map[p].push(row.shop)
  })
  const platformOrder = { shopee: 1, lazada: 2, tiktok: 3 }
  shopTreeData = Object.keys(map)
    .sort((a, b) => (platformOrder[a] || 99) - (platformOrder[b] || 99) || a.localeCompare(b))
    .map(p => ({ platform: p, shops: map[p].filter(Boolean).sort((a, b) => a.localeCompare(b)) }))
  shopTreeData.forEach(({ platform: p, shops }) => {
    if (platformOpen[p] === undefined) {
      platformOpen[p] = shops.some(s => selectedShops[p + "::" + s])
    }
  })
  renderShopPanel()
}

function toggleShopPicker() {
  const panel = document.getElementById("shopPickerPanel")
  const input = document.getElementById("shopPickerInput")
  const isOpen = panel.classList.contains("open")
  closeDRP()
  if (!isOpen) { panel.classList.add("open"); input.classList.add("active") }
  else { closeShopPicker() }
}

function closeShopPicker() {
  document.getElementById("shopPickerPanel").classList.remove("open")
  document.getElementById("shopPickerInput").classList.remove("active")
}

function closeAllPickers() {
  closeDRP()
  closeShopPicker()
}

function togglePlatformOpen(p) {
  platformOpen[p] = !platformOpen[p]
  renderShopPanel()
}

function togglePlatform(p, e) {
  e.stopPropagation()
  const shops = shopTreeData.find(x => x.platform === p)?.shops || []
  const allSel = shops.every(s => selectedShops[p + "::" + s])
  shops.forEach(s => {
    if (allSel) delete selectedShops[p + "::" + s]
    else selectedShops[p + "::" + s] = true
  })
  renderShopPanel()
  renderShopTags()
  syncShopFilter()
}

function toggleShop(p, shop, e) {
  _justClickedInside = true
  e.stopPropagation()
  const key = p + "::" + shop
  if (selectedShops[key]) delete selectedShops[key]
  else selectedShops[key] = true
  renderShopPanel()
  renderShopTags()
  syncShopFilter()
}

function renderShopPanel() {
  const panel = document.getElementById("shopPickerPanel")
  const wasOpen = panel.classList.contains("open")
  panel.innerHTML = shopTreeData.map(({ platform: p, shops }) => {
    const cfg     = PLAT_ICONS[p] || { bg: "#888", icon: "🏪" }
    const selCount = shops.filter(s => selectedShops[p + "::" + s]).length
    const allSel   = selCount === shops.length && shops.length > 0
    const someSel  = selCount > 0 && selCount < shops.length
    const cbClass   = allSel ? "spt-cb checked" : someSel ? "spt-cb indeterminate" : "spt-cb"
    const cbContent = allSel ? "✓" : someSel ? "−" : ""
    const isOpen   = platformOpen[p]
    return `
      <div class="spt-platform" onclick="togglePlatformOpen('${p}')">
        <span class="spt-toggle ${isOpen ? "open" : ""}">▶</span>
        <span class="spt-icon" style="background:${cfg.bg};color:white">${cfg.icon}</span>
        <span class="spt-plat-name">${p.charAt(0).toUpperCase() + p.slice(1)}</span>
        <span class="${cbClass}" onclick="togglePlatform('${p}', event)">${cbContent}</span>
      </div>
      <div class="spt-shops ${isOpen ? "open" : ""}">
        ${shops.map(shop => {
          const key  = p + "::" + shop
          const isSel = !!selectedShops[key]
          return `
            <div class="spt-shop ${isSel ? "selected" : ""}" onclick="toggleShop('${p}', '${shop.replace(/'/g, "\\'")}', event)">
              <span class="spt-shop-name">${shop}</span>
              <span class="spt-shop-cb ${isSel ? "checked" : ""}">${isSel ? "✓" : ""}</span>
            </div>`
        }).join("")}
      </div>`
  }).join("")
  if (wasOpen) panel.classList.add("open")
}

function renderShopTags() {
  const input      = document.getElementById("shopPickerInput")
  const panelWasOpen = document.getElementById("shopPickerPanel").classList.contains("open")
  const keys       = Object.keys(selectedShops)

  input.innerHTML = ""

  if (keys.length === 0) {
    const ph = document.createElement("span")
    ph.id        = "shopPickerPlaceholder"
    ph.className = "shop-picker-placeholder"
    ph.textContent = "Tất cả shop"
    input.appendChild(ph)
  } else if (keys.length === 1) {
    const k = keys[0]
    const shop = k.split("::")[1]
    const tag = document.createElement("span")
    tag.className = "shop-tag"
    tag.innerHTML = `<span>${shop}</span><span class="tag-x" onclick="removeShopTag('${k}', event)">×</span>`
    input.appendChild(tag)
  } else {
    const platforms = [...new Set(keys.map(k => k.split("::")[0]))]
    const tag = document.createElement("span")
    tag.className = "shop-tag shop-tag-count"
    // Khi chọn nhiều shop, gom thành một nhãn đếm để thanh lọc không bị rối trên mobile.
    tag.textContent = `Đã chọn ${keys.length} shop${platforms.length === 1 ? ` · ${platforms[0]}` : ''}`
    input.appendChild(tag)
  }

  const clr     = document.createElement("span")
  clr.id        = "shopPickerClear"
  clr.className = "shop-picker-clear"
  clr.textContent = "×"
  clr.style.display = keys.length > 0 ? "" : "none"
  clr.onclick   = e => clearShopPicker(e)
  input.appendChild(clr)

  if (panelWasOpen) {
    document.getElementById("shopPickerPanel").classList.add("open")
    input.classList.add("active")
  }
}

function removeShopTag(key, e) {
  e.stopPropagation()
  delete selectedShops[key]
  renderShopPanel()
  renderShopTags()
  syncShopFilter()
}

function clearShopPicker(e) {
  e.stopPropagation()
  selectedShops = {}
  renderShopPanel()
  renderShopTags()
  syncShopFilter()
}

function syncShopFilter() {
  const keys = Object.keys(selectedShops)
  if (keys.length === 0) {
    document.getElementById("filterPlatform").value = ""
    document.getElementById("filterShop").value     = ""
  } else {
    const platforms = [...new Set(keys.map(k => k.split("::")[0]))]
    document.getElementById("filterPlatform").value = platforms.length === 1 ? platforms[0] : ""
    const shops = keys.map(k => k.split("::")[1])
    document.getElementById("filterShop").value = shops.join(",")
  }
  const panel   = document.getElementById("shopPickerPanel")
  const wasOpen = panel && panel.classList.contains("open")
  applyFilter().then(() => {
    if (wasOpen) {
      panel.classList.add("open")
      document.getElementById("shopPickerInput").classList.add("active")
    }
  })
}
