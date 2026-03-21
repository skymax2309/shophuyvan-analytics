// ── TOP SKU / PRODUCT / SHOP ─────────────────────────────────────────
async function loadTop() {
  const qs = getFilterParams()
  const [skus, products, shops] = await Promise.all([
    fetch(API + "/api/top-sku"     + qs + (qs ? "&" : "?") + "limit=20").then(r => r.json()),
    fetch(API + "/api/top-product" + qs + (qs ? "&" : "?") + "limit=20").then(r => r.json()),
    fetch(API + "/api/top-shop"    + qs).then(r => r.json()),
  ])

  document.getElementById("topSkuTable").innerHTML = skus.map((r, i) => `
    <tr>
      <td style="color:#aaa">${i + 1}</td>
      <td><code style="font-size:12px">${r.sku}</code></td>
      <td>${Number(r.total_qty).toLocaleString()}</td>
      <td>${fmtShort(r.total_revenue)}</td>
      <td class="${profitClass(r.total_profit)}">${fmtShort(r.total_profit)}</td>
    </tr>`).join("")

  document.getElementById("topProductTable").innerHTML = products.map((r, i) => `
    <tr>
      <td style="color:#aaa">${i + 1}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.product_name}">${r.product_name}</td>
      <td>${Number(r.total_qty).toLocaleString()}</td>
      <td>${fmtShort(r.total_revenue)}</td>
      <td class="${profitClass(r.total_profit)}">${fmtShort(r.total_profit)}</td>
    </tr>`).join("")

  document.getElementById("topShopTable").innerHTML = shops.map(r => `
    <tr>
      <td><span class="badge badge-${r.platform}">${r.platform.toUpperCase()}</span></td>
      <td>${r.shop}</td>
      <td>${Number(r.total_orders).toLocaleString()}</td>
      <td>${fmtShort(r.total_revenue)}</td>
      <td class="${profitClass(r.total_profit)}">${fmtShort(r.total_profit)}</td>
    </tr>`).join("")
}



// ── TOP SKU FULL ──────────────────────────────────────────────────────
let _allSkuShops = []  // cache danh sách shop cho filter

async function populateSkuShopFilter() {
  // Load danh sách shop từ API 1 lần
  if (_allSkuShops.length > 0) return
  try {
    const shops = await fetch(API + "/api/top-shop").then(r => r.json())
    _allSkuShops = shops
    const sel = document.getElementById("skuFilterShop")
    // Group theo shop name
    const uniqueShops = [...new Map(shops.map(s => [s.shop, s])).values()]
    uniqueShops.forEach(s => {
      const opt = document.createElement("option")
      opt.value = s.shop
      opt.textContent = `[${s.platform.toUpperCase()}] ${s.shop}`
      sel.appendChild(opt)
    })
  } catch(e) { console.warn("Không load được shop filter", e) }
}

async function loadTopSkuFull() {
  const platform = document.getElementById("skuFilterPlatform").value
  const shop     = document.getElementById("skuFilterShop").value
  const sort     = document.getElementById("skuFilterSort").value
  const search   = document.getElementById("skuFilterSearch").value.trim().toLowerCase()

  // Dùng filter ngày từ filter bar chính
  const from = document.getElementById("filterFrom").value
  const to   = document.getElementById("filterTo").value

  const parts = []
  if (from)     parts.push("from="     + from)
  if (to)       parts.push("to="       + to)
  if (platform) parts.push("platform=" + platform)
  if (shop)     parts.push("shop="     + encodeURIComponent(shop))
  if (sort)     parts.push("sort="     + sort)
  const qs = parts.length ? "?" + parts.join("&") : ""

  document.getElementById("topSkuFullTable").innerHTML =
    `<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">⏳ Đang tải...</td></tr>`

  try {
    let data = await fetch(API + "/api/top-sku-full" + qs).then(r => r.json())

    // Filter search phía client
    if (search) {
      data = data.filter(s =>
        (s.sku          || "").toLowerCase().includes(search) ||
        (s.product_name || "").toLowerCase().includes(search)
      )
    }

    document.getElementById("skuFilterCount").textContent =
      `Tìm thấy ${data.length} SKU`

    const totalQty = data.reduce((s, r) => s + (r.total_qty || 0), 0)
    const totalRev = data.reduce((s, r) => s + (r.total_revenue || 0), 0)
    document.getElementById("skuTotalSummary").textContent =
      `Tổng: ${Number(totalQty).toLocaleString()} sản phẩm | ${fmt(totalRev)} doanh thu`

    if (data.length === 0) {
      document.getElementById("topSkuFullTable").innerHTML =
        `<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">Không có dữ liệu</td></tr>`
      return
    }

    document.getElementById("topSkuFullTable").innerHTML = data.map((r, i) => {
      const pctProfit = r.total_revenue > 0
        ? ((r.total_profit / r.total_revenue) * 100).toFixed(1)
        : 0
      const profitColor = r.total_profit >= 0 ? "#10b981" : "#ef4444"
      // Platforms badge
      const plts = (r.platforms || "").split(",").filter(Boolean)
      const pltBadges = plts.map(p => {
        const bg = p === "shopee" ? "#ee4d2d" : p === "tiktok" ? "#333" : "#0f146d"
        return `<span style="background:${bg};color:white;border-radius:3px;padding:1px 5px;font-size:10px;margin-right:2px">${p.toUpperCase()}</span>`
      }).join("")

      return `<tr style="${(r.total_profit||0)<0?'background:#fff1f2':''}">
        <td style="text-align:center;color:#9ca3af;font-size:12px">${i+1}</td>
        <td style="font-family:monospace;font-size:12px;font-weight:600">${r.sku||"—"}</td>
        <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.product_name||""}">${(r.product_name||"—").substring(0,40)}${(r.product_name||"").length>40?"...":""}</td>
        <td style="text-align:center">${pltBadges}</td>
        <td style="text-align:center;font-weight:700;font-size:15px">${Number(r.total_qty||0).toLocaleString()}</td>
        <td style="text-align:center;color:#6b7280">${Number(r.total_orders||0).toLocaleString()}</td>
        <td style="text-align:right;color:#3b82f6;font-weight:600">${fmt(r.total_revenue)}</td>
        <td style="text-align:right;font-weight:700;color:${profitColor}">${fmt(r.total_profit)}</td>
        <td style="text-align:right;color:${profitColor}">${pctProfit}%</td>
      </tr>`
    }).join("")
  } catch(e) {
    document.getElementById("topSkuFullTable").innerHTML =
      `<tr><td colspan="9" style="text-align:center;padding:20px;color:#ef4444">❌ Lỗi: ${e.message}</td></tr>`
  }
}

