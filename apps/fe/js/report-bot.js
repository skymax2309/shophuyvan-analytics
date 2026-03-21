const API = "https://huyvan-worker-api.nghiemchihuy.workers.dev"
let allShopNames = []

// ── Quản lý danh sách Shop ────────────────────────────────────────────
async function loadShops() {
  try {
    const shops = await fetch(API + "/api/top-shop").then(r => r.json())
    // Gộp shop từ DB + shop cố định trong config
    const dbShops = shops.map(s => s.shop)
    const allConfigShops = Object.values(SHOP_BY_PLATFORM).flat()
    allShopNames = [...new Set([...dbShops, ...allConfigShops])]

    // Dropdown upload thủ công
    const options = '<option value="">-- Chọn shop --</option>' +
                    allShopNames.map(s => `<option value="${s}">${s}</option>`).join("")
    document.getElementById("inpShop").innerHTML = options

    // Render checkbox bot theo sàn hiện tại
    onBotPlatformChange()
  } catch(e) {
    console.error("Không load được danh sách shop:", e)
    // Fallback: dùng config cố định
    onBotPlatformChange()
  }
}

function renderShopCheckboxes() {
  const el = document.getElementById("botShopCheckboxes")
  if (!allShopNames.length) { el.innerHTML = '<span style="color:#aaa;font-size:13px">Chưa có shop nào</span>'; return }
  el.innerHTML = allShopNames.map(s => `
    <label style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:white;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer;font-size:13px">
      <input type="checkbox" value="${s}" class="bot-shop-cb" style="cursor:pointer"> ${s}
    </label>
  `).join("")
}

function selectAllShops() {
  document.querySelectorAll(".bot-shop-cb").forEach(cb => cb.checked = true)
}

function clearAllShops() {
  document.querySelectorAll(".bot-shop-cb").forEach(cb => cb.checked = false)
}

function getSelectedShops() {
  return [...document.querySelectorAll(".bot-shop-cb:checked")].map(cb => cb.value)
}

// ── Đổi loại báo cáo theo sàn ────────────────────────────────────────
// Cấu hình shop cố định theo từng sàn
const SHOP_BY_PLATFORM = {
  shopee: [
    "Huy Vân Store Q.Bình Tân",
    "shophuyvan.vn",
    "KHOGIADUNGHUYVAN",
  ],
  lazada: [
    "ShopHuyVan",
  ],
  tiktok: [
    "ShopHuyVan",
  ],
}

function onBotPlatformChange() {
  const platform = document.getElementById("botPlatform").value
  const taskSel  = document.getElementById("botTaskType")

  // Cập nhật danh sách shop theo sàn
  const shops = SHOP_BY_PLATFORM[platform] || []
  const el = document.getElementById("botShopCheckboxes")
  if (!shops.length) {
    el.innerHTML = '<span style="color:#aaa;font-size:13px">Không có shop nào</span>'
  } else {
    el.innerHTML = shops.map(s => `
      <label style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:white;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" value="${s}" class="bot-shop-cb" style="cursor:pointer" checked> ${s}
      </label>
    `).join("")
  }

  const options = {
    shopee: [
      { value: "all",       label: "-- Tất cả --" },
      { value: "doanh_thu", label: "Doanh Thu" },
      { value: "hoa_don",   label: "Hóa Đơn & Phí (ADS...)" },
      { value: "don_hang",  label: "Đơn Hàng (XLSX)" },
    ],
    lazada: [
      { value: "all",       label: "-- Tất cả --" },
      { value: "doanh_thu", label: "Doanh Thu (PDF)" },
      { value: "hoa_don",   label: "Hóa Đơn" },
      { value: "don_hang",  label: "Đơn Hàng (CSV)" },
    ],
    tiktok: [
      { value: "all",       label: "-- Tất cả --" },
      { value: "doanh_thu", label: "Doanh Thu (Excel)" },
      { value: "hoa_don",   label: "Hóa Đơn Phí Sàn" },
      { value: "don_hang",  label: "Đơn Hàng" },
    ],
  }

  const opts = options[platform] || options.shopee
  taskSel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join("")
}

// ── Hàm ra lệnh cho Bot ───────────────────────────────────────────────
async function createAutomationJob() {
  const selectedShops = getSelectedShops()
  const platform = document.getElementById("botPlatform").value
  const mStart   = parseInt(document.getElementById("botMonthStart").value)
  const mEnd     = parseInt(document.getElementById("botMonthEnd").value)
  const year     = document.getElementById("botYear").value
  const schedule = document.getElementById("botSchedule").value
  const taskType = document.getElementById("botTaskType").value
  const btn      = document.getElementById("btnCreateJob")
  const status   = document.getElementById("botStatusLog")

  if (!selectedShops.length) { alert("Chọn ít nhất 1 Shop!"); return }
  if (mStart > mEnd) { alert("Tháng bắt đầu không được lớn hơn tháng kết thúc!"); return }

  btn.disabled = true
  const totalJobs = selectedShops.length * (mEnd - mStart + 1)
  status.innerHTML = `⏳ Đang tạo ${totalJobs} lệnh cho ${selectedShops.length} shop...`

  try {
    let created = 0
    for (const shop of selectedShops) {
      for (let m = mStart; m <= mEnd; m++) {
        await fetch(API + "/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id:      "admin_huyvan",
            shop_name:    shop,
            platform:     platform,
            month:        m,
            year:         parseInt(year),
            task_type:    taskType,
            scheduled_at: schedule || null
          })
        })
        created++
      }
    }

    status.innerHTML = `✅ Đã tạo <b>${created}</b> lệnh cho <b>${selectedShops.length}</b> shop trên sàn <b>${platform.toUpperCase()}</b>!`
    showToast(`Đã lên lịch ${created} lệnh!`)
    loadJobProgress()
  } catch (e) {
    status.innerHTML = "❌ Lỗi: " + e.message
  } finally {
    btn.disabled = false
  }
}


function showToast(msg) {
  const t = document.createElement("div")
  t.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1a1a2e;color:white;padding:12px 20px;border-radius:8px;font-size:14px;z-index:999"
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2500)
}

async function loadJobProgress() {
  const el = document.getElementById("jobProgressList")
  try {
    const res = await fetch(API + "/api/jobs?mode=monitor")
    const jobs = await res.json()
    if (!jobs.length) {
      el.innerHTML = '<div style="text-align:center; padding:10px;">Chưa có lệnh nào được tạo.</div>'
      return
    }
    const getStatusStyle = (s) => {
      if (s === 'completed') return 'color:#16a34a; font-weight:bold;'
      if (s === 'pending') return 'color:#ea580c;'
      return 'color:#888;'
    }
    el.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <tr style="border-bottom:1px solid #eee; text-align:left; color:#888;">
          <th style="padding:8px 0;">Shop</th><th>Kỳ báo cáo</th>
          <th>Hẹn giờ</th><th>Trạng thái</th><th></th>
        </tr>
        ${jobs.map(j => `
          <tr style="border-bottom:1px solid #f9f9f9;">
            <td style="padding:10px 0;"><b>${j.shop_name}</b></td>
            <td>T${j.month}/${j.year}</td>
            <td>${j.scheduled_at ? j.scheduled_at.replace('T', ' ') : 'Chạy ngay'}</td>
            <td style="${getStatusStyle(j.status)}">${j.status.toUpperCase()}</td>
            <td>${j.status === 'pending' ? `<button onclick="deleteJob(${j.id})" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:12px">🗑️ Xóa</button>` : ''}</td>
          </tr>`).join('')}
      </table>`
  } catch (e) {
    el.innerHTML = "❌ Không thể tải trạng thái bot."
  }
}

async function deleteJob(id) {
  if (!confirm("Xóa lệnh này?")) return
  try {
    const res = await fetch(API + "/api/jobs/" + id, { method: "DELETE" })
    const data = await res.json()
    if (data.status === "ok") loadJobProgress()
    else alert("Lỗi xóa: " + (data.error || "unknown"))
  } catch(e) { alert("Lỗi: " + e.message) }
}

setInterval(loadJobProgress, 30000)
loadJobProgress()

loadShops()

loadShops()