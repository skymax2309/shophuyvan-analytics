const API = "https://huyvan-worker-api.nghiemchihuy.workers.dev"
let allShopNames = []

// ── Quản lý danh sách Shop ────────────────────────────────────────────
let apiShopsData = [];

async function loadShops() {
  try {
    // 1. Gọi API mới tinh vừa tạo để lấy data trực tiếp từ Database
    const res = await fetch(API + "/api/shops?t=" + new Date().getTime());
    if (res.ok) {
        apiShopsData = await res.json();
        
        // 2. Lọc rác (đề phòng Database cũ còn sót)
        const oldNames = ["Huy Vân Store Q.Bình Tân", "shophuyvan.vn", "KHOGIADUNGHUYVAN", "ShopHuyVan"];
        apiShopsData = apiShopsData.filter(s => !oldNames.includes(s.shop_name));
        
        // 3. Nạp Dropdown Upload & Filter
        const options = '<option value="">-- Chọn shop --</option>' +
                        apiShopsData.map(s => `<option value="${s.shop_name}">${s.shop_name}</option>`).join("");
        document.getElementById("inpShop").innerHTML = options;
        
        const filterShop = document.getElementById('filterShop');
        if (filterShop) filterShop.innerHTML = '<option value="">Tất cả shop</option>' + options;
    }
    // 4. Render lại Checkbox
    onBotPlatformChange();
  } catch(e) {
    console.error("Lỗi tải danh sách shop từ API mới:", e);
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

function onBotTimeModeChange() {
  const mode = document.querySelector('input[name="botTimeMode"]:checked').value
  document.getElementById("botMonthMode").style.display = mode === "month" ? "flex" : "none"
  document.getElementById("botDayMode").style.display   = mode === "day"   ? "flex" : "none"

  // Khi chọn theo ngày, ẩn loại báo cáo chỉ còn Đơn Hàng
  const taskSel = document.getElementById("botTaskType")
  if (mode === "day") {
    taskSel.value = "don_hang"
    taskSel.disabled = true
  } else {
    taskSel.disabled = false
  }
}

function onBotPlatformChange() {
  const platform = document.getElementById("botPlatform").value;
  const taskSel  = document.getElementById("botTaskType");

  // Cập nhật danh sách Checkbox ĐỘNG theo sàn (lấy từ biến API đã tải)
  const el = document.getElementById("botShopCheckboxes");
  const matchingShops = apiShopsData.filter(s => s.platform === platform || platform === 'all');
  
  if (!matchingShops.length) {
    el.innerHTML = '<span style="color:#aaa;font-size:13px">Không có shop nào thuộc sàn này</span>';
  } else {
    el.innerHTML = matchingShops.map(s => `
      <label style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:white;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" value="${s.shop_name}" class="bot-shop-cb" style="cursor:pointer" checked> 
        [${(s.platform || 'shopee').toUpperCase()}] ${s.shop_name}
      </label>
    `).join("");
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

  const timeMode = document.querySelector('input[name="botTimeMode"]:checked').value
  const fromDate = document.getElementById("botFromDate").value
  const toDate   = document.getElementById("botToDate").value

  if (!selectedShops.length) { alert("Chọn ít nhất 1 Shop!"); return }

  if (timeMode === "day") {
    if (!fromDate || !toDate) { alert("Vui lòng chọn Từ ngày và Đến ngày!"); return }
    if (fromDate > toDate)    { alert("Từ ngày không được lớn hơn Đến ngày!"); return }
  } else {
    if (mStart > mEnd) { alert("Tháng bắt đầu không được lớn hơn tháng kết thúc!"); return }
  }

  btn.disabled = true

  try {
    let created = 0

    if (timeMode === "day") {
      // Chế độ theo ngày — 1 lệnh per shop, gửi from_date + to_date
      const d       = new Date(fromDate)
      const month   = d.getMonth() + 1
      const jobYear = d.getFullYear()
      status.innerHTML = `⏳ Đang tạo ${selectedShops.length} lệnh đơn hàng theo ngày...`

      for (const shop of selectedShops) {
        await fetch(API + "/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id:      "admin_huyvan",
            shop_name:    shop,
            platform:     platform,
            month:        month,
            year:         jobYear,
            task_type:    "don_hang",
            scheduled_at: schedule || null,
            from_date:    fromDate,
            to_date:      toDate,
          })
        })
        created++
      }
    } else {
      // Chế độ theo tháng — nhiều lệnh per shop
      const totalJobs = selectedShops.length * (mEnd - mStart + 1)
      status.innerHTML = `⏳ Đang tạo ${totalJobs} lệnh cho ${selectedShops.length} shop...`

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
              scheduled_at: schedule || null,
              from_date:    null,
              to_date:      null,
            })
          })
          created++
        }
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
      if (s === 'pending') return 'color:#ea580c; font-weight:bold;'
      return 'color:#888; font-weight:bold;'
    }
    
    // NÂNG CẤP GIAO DIỆN: Đổi từ Table sang Card co giãn 100% trên Mobile
    el.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${jobs.map(j => `
          <div style="background:#f9f9f9; padding:14px; border-radius:10px; border:1px solid #e0e0e0; display:flex; flex-direction:column; gap:8px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <b style="font-size:14px; color:#333;">${j.shop_name}</b>
              <span style="${getStatusStyle(j.status)}">${j.status.toUpperCase()}</span>
            </div>
            <div style="display:flex; justify-content:space-between; color:#666; font-size:12px; flex-wrap:wrap; gap:5px;">
              <span>🗓️ T${j.month}/${j.year}</span>
              <span>⏰ ${j.scheduled_at ? j.scheduled_at.replace('T', ' ') : 'Chạy ngay'}</span>
            </div>
            <div style="text-align:right; margin-top:4px; border-top:1px dashed #ddd; padding-top:10px;">
              <button onclick="deleteJob(${j.id})" style="color:#ef4444; background:#ffebee; border:none; cursor:pointer; font-size:12px; padding:6px 14px; border-radius:6px; font-weight:bold;">🗑️ Xóa lệnh</button>
            </div>
          </div>
        `).join('')}
      </div>`
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