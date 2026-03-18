// ── cost-settings.js ─────────────────────────────────────────────────
const API = "https://huyvan-worker-api.nghiemchihuy.workers.dev"

// ── Phí sàn cố định (% và per đơn) ──
const FIELDS = [
  { id: "shopee_platform_fee",        type: "pct"   },
  { id: "shopee_payment_fee",         type: "pct"   },
  { id: "shopee_ads",                 type: "pct"   },
  { id: "shopee_affiliate",           type: "pct"   },
  { id: "shopee_service_fee",         type: "fixed" },
  { id: "shopee_piship",              type: "fixed" },
  { id: "shopee_return_fee",          type: "fixed" },
  { id: "shopee_failed_delivery_fee", type: "fixed" },
  { id: "tiktok_commission",          type: "pct"   },
  { id: "tiktok_transaction_fee",     type: "pct"   },
  { id: "tiktok_affiliate",           type: "pct"   },
  { id: "tiktok_ads",                 type: "pct"   },
  { id: "tiktok_sfr",                 type: "fixed" },
  { id: "tiktok_handling_fee",        type: "fixed" },
  { id: "tiktok_return_fee",          type: "fixed" },
  { id: "tiktok_failed_delivery_fee", type: "fixed" },
  { id: "lazada_commission",          type: "pct"   },
  { id: "lazada_handling_fee",        type: "pct"   },
  { id: "lazada_vat",                 type: "pct"   },
  { id: "lazada_pit",                 type: "pct"   },
  { id: "lazada_shipping_diff",       type: "pct"   },
  { id: "lazada_ads",                 type: "pct"   },
]

// ── Chi phí cố định tùy chỉnh ──
let fixedCosts = []
let fcIdCounter = 0

function addFixedCostRow(data = {}) {
  fcIdCounter++
  const id = "fc_" + fcIdCounter
  fixedCosts.push({ id, ...data })
  renderFixedCosts()
}

function removeFixedCostRow(id) {
  fixedCosts = fixedCosts.filter(r => r.id !== id)
  renderFixedCosts()
}

function renderFixedCosts() {
  const container = document.getElementById("fixedCostRows")
  const empty     = document.getElementById("fixedCostEmpty")

  if (fixedCosts.length === 0) {
    container.innerHTML = ""
    empty.style.display = "block"
    return
  }
  empty.style.display = "none"

  container.innerHTML = fixedCosts.map(r => `
    <div class="fixed-cost-row" id="row_${r.id}">
      <input type="text"   id="${r.id}_name"      placeholder="VD: Phí đóng gói" value="${r.name || ''}">
      <input type="number" id="${r.id}_amount"    placeholder="0" step="100" min="0" value="${r.amount || ''}">
      <select id="${r.id}_calc_type">
        <option value="per_order" ${(r.calc_type||'per_order')==='per_order'?'selected':''}>Theo đơn</option>
        <option value="per_month" ${r.calc_type==='per_month'?'selected':''}>Theo tháng</option>
      </select>
      <select id="${r.id}_platform">
        <option value=""       ${!r.platform?'selected':''}>Tất cả sàn</option>
        <option value="shopee" ${r.platform==='shopee'?'selected':''}>Shopee</option>
        <option value="tiktok" ${r.platform==='tiktok'?'selected':''}>TikTok</option>
        <option value="lazada" ${r.platform==='lazada'?'selected':''}>Lazada</option>
      </select>
      <input type="text" id="${r.id}_shop" placeholder="Tất cả shop" value="${r.shop || ''}">
      <button onclick="removeFixedCostRow('${r.id}')"
        style="background:#ef4444;color:white;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px">✕</button>
    </div>
  `).join("")
}

function readFixedCosts() {
  return fixedCosts.map(r => ({
    cost_key:   "custom_" + r.id,
    cost_value: parseFloat(document.getElementById(r.id + "_amount")?.value) || 0,
    cost_type:  "fixed",
    cost_name:  document.getElementById(r.id + "_name")?.value?.trim() || "",
    calc_type:  document.getElementById(r.id + "_calc_type")?.value || "per_order",
    platform:   document.getElementById(r.id + "_platform")?.value || "",
    shop:       document.getElementById(r.id + "_shop")?.value?.trim() || "",
  }))
}

async function loadSettings() {
  try {
    const data = await fetch(API + "/api/cost-settings").then(r => r.json())

    // Load phí sàn vào input
    for (const row of data) {
      const el = document.getElementById(row.cost_key)
      if (el) el.value = row.cost_value
    }

    // Load chi phí cố định tùy chỉnh
    const customs = data.filter(r => r.cost_key.startsWith("custom_"))
    fixedCosts = []
    for (const r of customs) {
      fcIdCounter++
      const id = "fc_" + fcIdCounter
      fixedCosts.push({
        id,
        name:      r.cost_name  || "",
        amount:    r.cost_value || 0,
        calc_type: r.calc_type  || "per_order",
        platform:  r.platform   || "",
        shop:      r.shop       || "",
      })
    }
    renderFixedCosts()
  } catch(e) {
    console.error("Không load được cài đặt:", e)
  }
}

async function saveSettings() {
  const btn = document.getElementById("btnSave")
  btn.disabled = true
  btn.textContent = "Đang lưu..."

  const platformItems = FIELDS.map(f => ({
    cost_key:   f.id,
    cost_value: parseFloat(document.getElementById(f.id)?.value) || 0,
    cost_type:  f.type,
    cost_name:  "",
    calc_type:  "per_order",
    platform:   "",
    shop:       "",
  }))

  const customItems = readFixedCosts()
  const allItems    = [...platformItems, ...customItems]

  try {
    await fetch(API + "/api/cost-settings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(allItems)
    })
    showToast()
  } catch(e) {
    alert("Lỗi khi lưu: " + e.message)
  }

  btn.disabled = false
  btn.innerHTML = "💾 Lưu Cài Đặt"
}

async function saveFixedCosts() {
  const items = readFixedCosts()
  try {
    await fetch(API + "/api/cost-settings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(items)
    })
    showToast()
  } catch(e) {
    alert("Lỗi khi lưu: " + e.message)
  }
}

function showToast() {
  const t = document.getElementById("toast")
  t.classList.add("show")
  setTimeout(() => t.classList.remove("show"), 2500)
}

loadSettings()