const API = "https://huyvan-worker-api.nghiemchihuy.workers.dev"
let selectedFiles = []

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

loadShops()

// ── Drag & Drop ──────────────────────────────────────────────────────
const dropzone = document.getElementById("dropzone")
const fileInput = document.getElementById("fileInput")

dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag") })
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"))
dropzone.addEventListener("drop", e => {
  e.preventDefault()
  dropzone.classList.remove("drag")
  addFiles([...e.dataTransfer.files])
})
fileInput.addEventListener("change", () => addFiles([...fileInput.files]))

function addFiles(files) {
  files.forEach(f => {
    if (!selectedFiles.find(x => x.name === f.name)) selectedFiles.push(f)
  })
  renderFileList()
}

function removeFile(name) {
  selectedFiles = selectedFiles.filter(f => f.name !== name)
  renderFileList()
}

function renderFileList() {
  const el = document.getElementById("fileList")
  if (!selectedFiles.length) { el.innerHTML = ""; return }

  el.innerHTML = selectedFiles.map(f => `
    <div class="file-item">
      <span class="file-icon">${f.name.endsWith(".pdf") ? "📄" : "📊"}</span>
      <div class="file-info">
        <div class="file-name">${f.name}</div>
        <div class="file-meta">${(f.size / 1024).toFixed(1)} KB</div>
      </div>
      <button class="file-remove" onclick="removeFile('${f.name}')">✕</button>
    </div>
  `).join("")
}

// ── Upload ───────────────────────────────────────────────────────────
async function uploadAll() {
  if (!selectedFiles.length) { alert("Chọn file trước!"); return }

  const btn = document.getElementById("btnUpload")
  const log = document.getElementById("uploadLog")
  btn.disabled = true
  log.classList.add("show")
  log.innerHTML = ""

  const platform = document.getElementById("selPlatform").value
  const type     = document.getElementById("selType").value
  const shop     = document.getElementById("inpShop").value.trim()

  for (const file of selectedFiles) {
    log.innerHTML += `⏳ Đang đọc <b>${file.name}</b>...<br>`

    try {
      let result
      let newName

      // TikTok Excel: parse ở client trước
      if (platform === "tiktok" && (file.name.endsWith(".xlsx") || file.name.endsWith(".csv"))) {
        const tiktokData = await parseTiktokExcelClient(file)
        // Tên Excel: lấy tháng từ sheet Reports
        const month      = tiktokData._month || detectMonthFromName(file.name)
        const cleanShop  = (shop || "SHOP").replace(/\s+/g, "-").toUpperCase()
        newName = `TIKTOK_${cleanShop}_${month}_doanh-thu.xlsx`
        log.innerHTML += `📝 Đổi tên → <b>${newName}</b><br>`
        result = await uploadTiktokJson(new File([file], newName, { type: file.type }), tiktokData, platform, shop, type)
      } else {
        // PDF: extract text → smart rename → parse
        const pdfText    = await extractPdfTextClient(file)
        newName          = smartRename(pdfText, file.name, platform, shop, type)
        const parsedData = autoDetectClient(pdfText, platform)

        log.innerHTML += `📝 Đổi tên → <b>${newName}</b><br>`

        const formData    = new FormData()
        const renamedFile = new File([file], newName, { type: file.type })
        formData.append("file", renamedFile)
        formData.append("platform", platform)
        formData.append("shop", shop)
        formData.append("report_type", type)
        formData.append("parsed_json", JSON.stringify(parsedData))
        formData.append("pdf_text", pdfText)

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30000)
        try {
          const res = await fetch(API + "/api/upload-report", { method: "POST", body: formData, signal: controller.signal })
          result = await res.json()
        } finally {
          clearTimeout(timeout)
        }
      }

      if (result.status === "ok") {
        log.innerHTML += `✅ <b>${file.name}</b> → ${result.r2_key}<br>`
        log.innerHTML += renderParsed(result.parsed)
      } else {
        log.innerHTML += `❌ Lỗi: ${result.error || "Unknown"}<br>`
      }
    } catch(e) {
      log.innerHTML += `❌ ${file.name}: ${e.message}<br>`
    }
  }

  selectedFiles = []
  renderFileList()
  btn.disabled = false
  loadHistory()
}

// ── Đặt tên file thông minh dựa vào nội dung PDF ─────────────────────
function smartRename(pdfText, filename, platform, shop, type) {
  const ext       = filename.split(".").pop().toLowerCase()
  const cleanShop = (shop || "SHOP").replace(/\s+/g, "-").toUpperCase()

  // ── Detect tháng từ NỘI DUNG PDF ─────────────────────────────────
  let month = ""

  // Shopee: "tháng 02 năm (year) 2026" hoặc "02/2026"
  const mShopee = pdfText.match(/(\d{2})\/(\d{4})_/) || pdfText.match(/tháng\s+(\d{2}).*?n[aă]m.*?(\d{4})/i)
  if (mShopee) month = `${mShopee[2]}-${mShopee[1]}`

  // TikTok Tax Invoice: "Period : Jan 1, 2026 - Jan 31, 2026"
  if (!month) {
    const mTikPeriod = pdfText.match(/Period\s*:\s*(\w+)\s+\d+,\s*(\d{4})/)
    if (mTikPeriod) {
      const months = {Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",
                      Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"}
      month = `${mTikPeriod[2]}-${months[mTikPeriod[1]] || "01"}`
    }
  }

  // Lazada: "tháng 02/2026 (02/02/2026 - 08/02/2026)"
  if (!month) {
    const mLaz = pdfText.match(/tháng\s+(\d{2})\/(\d{4})/)
    if (mLaz) month = `${mLaz[2]}-${mLaz[1]}`
  }

  // Fallback từ tên file
  if (!month) month = detectMonthFromName(filename)

  // ── Detect loại phí từ NỘI DUNG ──────────────────────────────────
  // Nếu user đã chọn đúng loại, dùng luôn không cần detect
  if (type === "phi-dau-thau") return `${platform.toUpperCase()}_${cleanShop}_${month}_phi-dau-thau.${ext}`

  let feeType = type  // default: income / expense / orders

  if (type === "expense" || type === "income") {
    // Shopee hóa đơn chi phí
    if (pdfText.includes("Phí hoa hồng cố định") && pdfText.includes("PiShip")) {
      feeType = "phi-san"  // Phí sàn tổng hợp
    } else if (pdfText.includes("đấu thầu từ khóa") || pdfText.includes("Paid Ads")) {
      feeType = "phi-dau-thau"
    } else if (pdfText.includes("Phí rút tiền") || pdfText.includes("Withdrawal Fee")) {
      feeType = "phi-rut-tien"
    }
    // TikTok hóa đơn
    else if (pdfText.includes("Tokgistic") || pdfText.includes("Domestic delivery shipping fee")) {
      feeType = "phi-van-chuyen"
    } else if (pdfText.includes("TIKTOK PTE") || pdfText.includes("VNEC")) {
      feeType = "phi-san"
    }
// Lazada hóa đơn (RECESS) — theo tuần
    else if (pdfText.includes("RECESS") || pdfText.includes("VN33W4TIY8")) {
      // Quảng cáo / Trợ hiển thị
      if (pdfText.includes("Trợ Hiển Thị") || pdfText.includes("Sponsored") || pdfText.includes("quảng cáo")) {
        const mWeekAds = pdfText.match(/\((\d{2})\/(\d{2})\/\d{4}\s*-\s*(\d{2})\/(\d{2})\/\d{4}\)/)
                      || pdfText.match(/(\d{2})(\d{2})\d{4}\s*-\s*(\d{2})(\d{2})\d{4}/)
        if (mWeekAds) {
          const startDay = parseInt(mWeekAds[1])
          const weekNum  = startDay <= 7 ? "tuan1" : startDay <= 14 ? "tuan2"
                         : startDay <= 21 ? "tuan3" : "tuan4"
          feeType = `phi-quang-cao-${weekNum}`
        } else {
          feeType = "phi-quang-cao"
        }
      } else {
        // Lấy khoảng thời gian VD: "02/02/2026 - 08/02/2026" → tuan1
        const mWeek = pdfText.match(/\((\d{2})\/(\d{2})\/\d{4}\s*-\s*(\d{2})\/(\d{2})\/\d{4}\)/)
        if (mWeek) {
          const startDay = parseInt(mWeek[1])
          const weekNum  = startDay <= 7 ? "tuan1" : startDay <= 14 ? "tuan2"
                         : startDay <= 21 ? "tuan3" : "tuan4"
          feeType = `phi-san-${weekNum}`
        } else {
          feeType = "phi-san"
        }
      }
    }
	
    // Báo cáo doanh thu Shopee (quyết toán)
    else if (pdfText.includes("Tổng thanh toán đã chuyển") || pdfText.includes("Giá sản phẩm")) {
      feeType = "doanh-thu"
    }
    // Báo cáo doanh thu Lazada
    else if (pdfText.includes("Giá trị sản phẩm") && pdfText.includes("Tổng thanh toán")) {
      feeType = "doanh-thu"
    }
  }

  return `${platform.toUpperCase()}_${cleanShop}_${month}_${feeType}.${ext}`
}

// Detect tháng từ tên file
function detectMonthFromName(filename) {
  const m1 = filename.match(/(\d{4})-(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}`
  const m2 = filename.match(/(\d{4})(\d{2})\d{2}/)
  if (m2) return `${m2[1]}-${m2[2]}`
  const m3 = filename.match(/(\d{4})_(\d{2})/)
  if (m3) return `${m3[1]}-${m3[2]}`
  // TikTok: income_20260308... → 2026-02 (tháng của kỳ báo cáo, lùi 1 tháng)
  const m4 = filename.match(/(\d{4})(\d{2})(\d{2})/)
  if (m4) {
    let y = parseInt(m4[1]), mo = parseInt(m4[2]) - 1
    if (mo < 1) { mo = 12; y-- }
    return `${y}-${String(mo).padStart(2,"0")}`
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`
}

function autoDetectClient(text, platform) {
  // Hóa đơn chi phí Shopee
  if (text.includes("CÔNG TY TNHH SHOPEE") || text.includes("1K26TAC")) {
    return parseShopeeExpenseClient(text)
  }
  // Hóa đơn chi phí TikTok
  if (text.includes("TIKTOK PTE") || text.includes("Tokgistic") || text.includes("VNEC")) {
    return parseTiktokExpenseClient(text)
  }
  // Hóa đơn chi phí Lazada (RECESS)
  if (text.includes("RECESS") || text.includes("VN33W4TIY8")) {
    return parseLazadaExpenseClient(text)
  }
  // Báo cáo doanh thu bình thường
  if (platform === "shopee") return parseShopeeClient(text)
  if (platform === "lazada") return parseLazadaClient(text)
  return {}
}

function parseShopeeExpenseClient(text) {
  const findAmt = (label) => {
    const re = new RegExp(label + "[\\s\\S]{0,100}?([\\d]{1,3}(?:\\.[\\d]{3})+)")
    const m = text.match(re)
    return m ? parseInt(m[1].replace(/\./g,"")) : 0
  }
  const subMatch   = text.match(/Cộng tiền hàng[^:]*[:\s]+([\d\.]+)/)
  const vatMatch   = text.match(/Tiền thuế GTGT[^:]*:\s*([\d]{1,3}(?:\.[\d]{3})+)/)
  const totalMatch = text.match(/Tổng cộng tiền thanh toán[^:]*[:\s]+([\d\.]+)/)

  const sub   = subMatch   ? parseInt(subMatch[1].replace(/\./g,""))   : 0
  const vat   = vatMatch   ? parseInt(vatMatch[1].replace(/\./g,""))   : 0
  const total = totalMatch ? parseInt(totalMatch[1].replace(/\./g,"")) : 0

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0, shipping_net: 0,
    fee_commission:  findAmt("Phí hoa hồng cố định") || findAmt("Phí dịch vụ đấu thầu"),
    fee_payment:     findAmt("Phí xử lý giao dịch"),
    fee_service:     findAmt("Phí dịch vụ "),
    fee_affiliate:   0,
    fee_piship_sfr:  findAmt("Phí dịch vụ PiShip"),
    fee_handling:    findAmt("Phí rút tiền"),
    fee_total: sub, compensation: 0,
    tax_vat: vat, tax_pit: 0, tax_total: vat,
    total_payout: -total,
  }
}

function parseTiktokExpenseClient(text) {
  const parseVND = (s) => {
    if (!s) return 0
    // Số dạng 7.787.451 hoặc 7,787,451
    return parseInt(s.replace(/[,\.]/g,"")) || 0
  }
  const findRow = (label) => {
    const re = new RegExp(label + "[^\\d]*([\\.\\d,]+)[^\\d]*([\\.\\d,]+)[^\\d]*([\\.\\d,]+)")
    const m = text.match(re)
    return m ? parseVND(m[1]) : 0
  }
  const subM   = text.match(/Subtotal \(excluding Tax\)[^\d]*([\d\.,]+\d)/)
  const taxM   = text.match(/Total Tax[^\d]*([\d\.,]+\d)/)
  const totalM = text.match(/Total Amount[^\d]*([\d\.,]+\d)/)

  const sub   = subM   ? parseVND(subM[1])   : 0
  const tax   = taxM   ? parseVND(taxM[1])   : 0
  const total = totalM ? parseVND(totalM[1]) : 0

  const isLogistics = text.includes("Tokgistic") || text.includes("delivery shipping fee")

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: isLogistics ? -sub : 0,
    fee_commission:  isLogistics ? 0 : findRow("TikTok Shop commission fee"),
    fee_payment:     isLogistics ? 0 : findRow("Transaction fee"),
    fee_service:     isLogistics ? 0 : findRow("SFR service fee"),
    fee_affiliate:   0,
    fee_piship_sfr:  isLogistics ? 0 : findRow("SFR service fee"),
    fee_handling:    isLogistics ? 0 : findRow("Order Processing Fee"),
    fee_total: sub, compensation: 0,
    tax_vat: tax, tax_pit: 0, tax_total: tax,
    total_payout: -total,
  }
}

function parseLazadaExpenseClient(text) {
  text = text.normalize("NFC")
  const findLine = (label) => {
    const re = new RegExp(label + "[ \\t]{1,200}(\\d{1,3}(?:\\.\\d{3})+)")
    const m = text.match(re)
    return m ? parseInt(m[1].replace(/\./g,"")) : 0
  }
  const subM   = text.match(/Cộng tiền hàng[^:]*:\s*([\d]{1,3}(?:\.[\d]{3})+)/)
  const vatM   = text.match(/Tiền thuế GTGT[^:]*:\s*([\d]{1,3}(?:\.[\d]{3})+)/)
  const totalM = text.match(/Tổng cộng tiền hàng[^:]*:\s*([\d]{1,3}(?:\.[\d]{3})+)/)

  const sub   = subM   ? parseInt(subM[1].replace(/\./g,""))   : 0
  const vat   = vatM   ? parseInt(vatM[1].replace(/\./g,""))   : 0
  const total = totalM ? parseInt(totalM[1].replace(/\./g,"")) : 0

  return {
    gross_revenue: 0, refund_amount: 0, net_product_revenue: 0,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net:    0,
    fee_commission:   findLine("Phí Cố Định"),
    fee_payment:      findLine("Phí Vận Chuyển"),
    fee_service: 0, fee_affiliate: 0, fee_piship_sfr: 0,
    fee_handling:     findLine("Phí Xử lý đơn hàng"),
    fee_total: total, compensation: 0,
    tax_vat: vat, tax_pit: 0, tax_total: vat,
    total_payout: -total,
  }
}

async function extractPdfTextClient(file) {
  const buf      = await file.arrayBuffer()
  const pdf      = await pdfjsLib.getDocument({ data: buf }).promise
  const texts    = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    texts.push(content.items.map(t => t.str).join(" "))
  }
  return texts.join("\n")
}

// Parse báo cáo Shopee từ text
function parseShopeeClient(text) {
  const findNum = (label) => {
    // Tìm số gần nhất sau label (có thể có dấu phẩy, chấm)
    const re = new RegExp(label.replace(/[()]/g, "\\$&") + "[\\s\\S]{0,80}?([\\d,]+)")
    const m  = text.match(re)
    if (!m) return 0
    return parseInt(m[1].replace(/[,.]/g, "")) || 0
  }

  const gross_revenue    = findNum("Giá sản phẩm")
  const refund_amount    = findNum("Số tiền hoàn lại")
  const platform_subsidy = findNum("Sản phẩm được trợ giá từ Shopee")
  const co_funded_voucher= findNum("Mã ưu đãi Đồng Tài Trợ do Người Bán chịu")
  const fee_commission   = findNum("Phí cố định")
  const fee_service      = findNum("Phí Dịch Vụ")
  const fee_payment      = findNum("Phí thanh toán")
  const fee_affiliate    = findNum("Phí hoa hồng Tiếp thị liên kết")
  const fee_piship_sfr   = findNum("Phí dịch vụ PiShip")
  const fee_total        = fee_commission + fee_service + fee_payment + fee_affiliate + fee_piship_sfr
  const tax_vat          = findNum("Thuế GTGT")
  const tax_pit          = findNum("Thuế TNCN")
  const tax_total        = tax_vat + tax_pit
  const total_payout     = findNum("Tổng thanh toán đã chuyển")
  const net_product_revenue = gross_revenue - refund_amount + platform_subsidy - co_funded_voucher

  return {
    gross_revenue, refund_amount, net_product_revenue,
    platform_subsidy, seller_voucher: 0, co_funded_voucher,
    shipping_net: 0,
    fee_commission, fee_payment, fee_service,
    fee_affiliate, fee_piship_sfr, fee_handling: 0, fee_total,
    compensation: 0,
    tax_vat, tax_pit, tax_total,
    total_payout,
  }
}

// Parse báo cáo Lazada từ text
function parseLazadaClient(text) {
  const findNum = (label) => {
    const re = new RegExp(label.replace(/[()]/g, "\\$&") + "[\\s\\S]{0,100}?([\\d,\\.]+)")
    const m  = text.match(re)
    if (!m) return 0
    return parseFloat(m[1].replace(/,/g, "")) || 0
  }

  const gross_revenue  = findNum("Giá trị sản phẩm")
  const fee_commission = findNum("Phí cố định")
  const fee_handling   = findNum("Phí xử lý đơn hàng")
  const shipping_net   = findNum("Điều chỉnh phí vận chuyển chênh lệch")
  const compensation   = findNum("Bồi thường đơn hàng thất lạc")
  const tax_vat        = findNum("Thuế GTGT nhà bán hàng")
  const tax_pit        = findNum("Thuế TNCN nhà bán hàng")
  const fee_total      = fee_commission + fee_handling
  const tax_total      = tax_vat + tax_pit
  const total_payout   = findNum("Tổng thanh toán")

  return {
    gross_revenue, refund_amount: 0,
    net_product_revenue: gross_revenue,
    platform_subsidy: 0, seller_voucher: 0, co_funded_voucher: 0,
    shipping_net: -shipping_net,
    fee_commission, fee_payment: 0, fee_service: 0,
    fee_affiliate: 0, fee_piship_sfr: 0, fee_handling, fee_total,
    compensation,
    tax_vat, tax_pit, tax_total,
    total_payout,
  }
}

// Parse TikTok Excel ở client
async function parseTiktokExcelClient(file) {
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf)
  const ws   = wb.Sheets["Reports"] || wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Lấy value ở cột F (index 5), abs nếu cần
  const n    = (val) => parseFloat(String(val || "0").replace(/[^0-9.-]/g, "")) || 0
  const abs  = (val) => Math.abs(n(val))

  // Tìm exact label ở cột B/C/D/E, value ở cột F
  const findExact = (keyword) => {
    for (const r of rows) {
      for (let c = 1; c <= 4; c++) {
        if (String(r[c] || "").trim() === keyword) return n(r[5])
      }
    }
    return 0
  }

  // Đọc từng dòng theo đúng label
  const total_settlement   = findExact("Total settlement amount")
  const total_revenue      = findExact("Total Revenue")
  const subtotal_after     = findExact("Subtotal after seller discounts")
  const refund_subtotal    = abs(findExact("Refund subtotal after seller discounts"))
  const transaction_fee    = abs(findExact("Transaction fee"))
  const commission_fee     = abs(findExact("TikTok Shop commission fee"))
  const seller_shipping    = abs(findExact("Seller shipping fee"))
  const affiliate_fee      = abs(findExact("Affiliate Commission"))
  const sfr_service_fee    = abs(findExact("SFR service fee"))
  const order_handling_fee = abs(findExact("Order processing fee"))
  const tax_vat            = abs(findExact("VAT withheld by TikTok Shop"))
  const tax_pit            = abs(findExact("PIT withheld by TikTok Shop"))
  const total_adjustments  = n(findExact("Total adjustments"))

  const fee_total = transaction_fee + commission_fee + seller_shipping
                  + affiliate_fee + sfr_service_fee + order_handling_fee
  const tax_total = tax_vat + tax_pit
  
     // Lấy tháng từ "Time period: 2026/02/01-2026/02/28"
     let _month = ""
     for (const r of rows) {
       const label = String(r[1] || "").trim()
       if (label === "Time period:") {
         const mp = String(r[5] || "").match(/(\d{4})\/(\d{2})/)
         if (mp) _month = `${mp[1]}-${mp[2]}`
         break
       }
     }
   
return {
    _month,
    gross_revenue:       total_revenue,
    refund_amount:       refund_subtotal,
    net_product_revenue: subtotal_after - refund_subtotal,
    platform_subsidy:    0,
    seller_voucher:      0,
    co_funded_voucher:   0,
    shipping_net:        -seller_shipping,
    fee_commission:      commission_fee,
    fee_payment:         transaction_fee,
    fee_service:         sfr_service_fee,
    fee_affiliate:       affiliate_fee,
    fee_piship_sfr:      sfr_service_fee,
    fee_handling:        order_handling_fee,
    fee_total,
    compensation:        Math.max(0, total_adjustments),
    tax_vat,
    tax_pit,
    tax_total,
    total_payout:        total_settlement,
  }
}

async function uploadTiktokJson(file, tiktokData, platform, shop, type) {
  // Gửi file + parsed JSON lên Worker
  const formData = new FormData()
  formData.append("file", file)
  formData.append("platform", platform)
  formData.append("shop", shop)
  formData.append("report_type", type)
  formData.append("parsed_json", JSON.stringify(tiktokData))

  const res = await fetch(API + "/api/upload-report", { method: "POST", body: formData })
  return res.json()
}

function renderParsed(p) {
  if (!p || !Object.keys(p).length) return ""
  const fmt = n => Math.abs(Math.round(n)).toLocaleString("vi-VN")
  return `
    <div style="margin:6px 0 10px 20px;font-size:12px;color:#555;background:#f9fafb;padding:10px;border-radius:6px">
      💰 Doanh thu: <b>${fmt(p.gross_revenue)}</b>đ &nbsp;|&nbsp;
      💸 Phí: <b>${fmt(p.fee_total)}</b>đ &nbsp;|&nbsp;
      🧾 Thuế: <b>${fmt(p.tax_total)}</b>đ &nbsp;|&nbsp;
      ✅ Về túi: <b>${fmt(p.total_payout)}</b>đ
    </div>`
}

// ── History ──────────────────────────────────────────────────────────
// Shop theo sàn cho filter
const HISTORY_SHOPS = {
  shopee: ["Huy Vân Store Q.Bình Tân", "shophuyvan.vn", "KHOGIADUNGHUYVAN"],
  lazada: ["ShopHuyVan"],
  tiktok: ["ShopHuyVan"],
}

function onFilterPlatformChange() {
  const platform = document.getElementById("filterPlatform").value
  const shopSel  = document.getElementById("filterShop")
  const shops    = HISTORY_SHOPS[platform] || []
  shopSel.innerHTML = '<option value="">Tất cả shop</option>'
    + shops.map(s => `<option value="${s}">${s}</option>`).join("")
  loadHistory()
}
  const month    = document.getElementById("filterMonth").value
const platform = document.getElementById("filterPlatform").value
  const shop     = document.getElementById("filterShop")?.value || ""
  const params = new URLSearchParams()
  if (platform) params.set("platform", platform)
  if (shop)     params.set("shop", shop)
  const url = API + "/api/reports" + (params.toString() ? "?" + params.toString() : "")
  const rows  = await fetch(url).then(r => r.json())

  // Populate month filter
  const months = [...new Set(rows.map(r => r.report_month))].sort().reverse()
  const sel    = document.getElementById("filterMonth")
  const cur    = sel.value
  sel.innerHTML = '<option value="">Tất cả tháng</option>'
                + months.map(m => `<option value="${m}" ${m===cur?"selected":""}>${m}</option>`).join("")

  const el = document.getElementById("historyList")
  if (!rows.length) {
    el.innerHTML = '<div style="text-align:center;color:#aaa;padding:30px">Chưa có báo cáo nào</div>'
    return
  }

  const typeLabel = { income: "Doanh Thu", expense: "Chi Phí", orders: "Đơn Hàng", "phi-dau-thau": "Quảng Cáo" }
  const fmt = n => Math.abs(Math.round(n || 0)).toLocaleString("vi-VN")

el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;padding:8px 12px;background:#f8f9fa;border-radius:8px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;font-weight:600">
        <input type="checkbox" id="checkAll" onchange="toggleAllReports(this.checked)"> Chọn tất cả
      </label>
      <span style="color:#e0e0e0">|</span>
      <span id="selectedCount" style="font-size:12px;color:#6b7280">Chưa chọn file nào</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button onclick="bulkDownload()" style="font-size:12px;padding:5px 12px;border:1px solid #4f46e5;border-radius:6px;cursor:pointer;color:#4f46e5;background:white">⬇️ Tải đã chọn</button>
        <button onclick="bulkDelete()" style="font-size:12px;padding:5px 12px;border:1px solid #ef4444;border-radius:6px;cursor:pointer;color:#ef4444;background:white">🗑️ Xóa đã chọn</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:32px 80px 90px 100px 1fr auto;gap:12px;font-size:11px;font-weight:700;color:#888;padding:0 14px;margin-bottom:6px">
      <span></span><span>Sàn</span><span>Tháng</span><span>Loại</span><span>File / Doanh thu → Về túi</span><span>Tải</span>
    </div>
    ${rows.map(r => `
    <div class="history-item" style="display:grid;grid-template-columns:32px 80px 90px 100px 1fr auto;gap:12px;align-items:center">
      <input type="checkbox" class="report-cb" value="${r.id}" data-r2="${r.r2_key}" data-file="${r.file_name}" onchange="updateSelectedCount()">
      <span><span class="platform-tag tag-${r.platform}">${r.platform.toUpperCase()}</span></span>
      <span style="font-size:12px">${r.report_month}</span>
      <span style="font-size:12px">${typeLabel[r.report_type] || r.report_type}</span>
      <div>
        <div style="font-weight:600;font-size:12px">${r.file_name}</div>
        <div style="font-size:11px;color:#888;line-height:1.8">
          DT: <b>${fmt(r.gross_revenue)}</b>đ → 💰 <b style="color:#16a34a">${fmt(r.total_payout)}</b>đ
          &nbsp;|&nbsp; Thuế: ${fmt(r.tax_total)}đ
        </div>
        <div style="font-size:11px;color:#888">
          📌 HH: ${fmt(r.fee_commission)}đ
          &nbsp;| 💳 TT: ${fmt(r.fee_payment)}đ
          &nbsp;| 🤝 Affiliate: ${fmt(r.fee_affiliate)}đ
          ${r.fee_service > 0 ? `&nbsp;| 🚚 SFR/PiShip: ${fmt(r.fee_service)}đ` : ""}
          ${r.fee_handling > 0 ? `&nbsp;| 📦 Xử lý ĐH: ${fmt(r.fee_handling)}đ` : ""}
          ${r.compensation > 0 ? `&nbsp;| 🎁 Bồi thường: +${fmt(r.compensation)}đ` : ""}
          &nbsp;| <b>Tổng phí: ${fmt(r.fee_total)}đ</b>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <a href="${API}/api/report-file?key=${encodeURIComponent(r.r2_key)}"
           style="color:#4f46e5;font-size:12px;text-decoration:none" target="_blank">⬇️ Tải</a>
        ${r.platform === 'tiktok' && r.report_type === 'income' ? `
        <button onclick='exportPDF(${JSON.stringify(r)})' style="color:#16a34a;background:none;border:none;cursor:pointer;font-size:12px">📄 PDF</button>` : ""}
        <button onclick="deleteReport(${r.id}, '${r.r2_key}')"
           style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:12px">🗑️ Xóa</button>
      </div>
    </div>`).join("")}
  `
}

async function deleteReport(id, r2Key) {
  if (!confirm("Xóa báo cáo này?")) return
  try {
    const res = await fetch(API + "/api/reports/" + id, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r2_key: r2Key })
    })
    const data = await res.json()
    if (data.status === "ok") loadHistory()
    else alert("Lỗi xóa: " + (data.error || "unknown"))
  } catch(e) {
    alert("Lỗi: " + e.message)
  }
}

async function exportPDF(r) {
  const { jsPDF } = window.jspdf
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const fontUrl = "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf"
  const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer())
  const fontBase64 = (() => {
    const bytes = new Uint8Array(fontBytes)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  })()
  doc.addFileToVFS("Roboto.ttf", fontBase64)
  doc.addFont("Roboto.ttf", "Roboto", "normal")
  doc.setFont("Roboto", "normal")

  const fmt = n => {
    const abs = Math.abs(Math.round(n || 0))
    const sign = (n || 0) < 0 ? "-" : ""
    return sign + abs.toLocaleString("vi-VN") + "đ"
  }
  const L = 15, W = 180

  doc.setFontSize(14)
  doc.text("BÁO CÁO DOANH THU TIKTOK", 105, 15, { align: "center" })
  doc.setFontSize(9)
  doc.text(`Shop: ${r.shop}   |   Tháng: ${r.report_month}   |   Tiền tệ: VND   |   Múi giờ: UTC+7`, 105, 22, { align: "center" })
  doc.line(L, 25, L + W, 25)

  const items = [
    [0, "Tổng quyết toán",                    r.total_payout,                              true],
    [1, "Doanh thu bán hàng",                  r.gross_revenue,                             false],
    [2, "Doanh thu sau chiết khấu",             r.net_product_revenue + r.refund_amount,     false],
    [2, "Hàng trả lại",                         -r.refund_amount,                            false],
    [1, "Tổng phí",                             -r.fee_total,                                false],
    [2, "Phí thanh toán",                       -r.fee_payment,                              false],
    [2, "Phí hoa hồng",                         -r.fee_commission,                           false],
    [2, "Phí vận chuyển",                        r.shipping_net,                              false],
    [2, "Phí Affiliate",                         -r.fee_affiliate,                            false],
    [2, "Phí dịch vụ SFR",                       -r.fee_service,                              false],
    [2, "Phí xử lý đơn hàng",                    -r.fee_handling,                             false],
    [2, "Thuế GTGT (TikTok khấu trừ)",           -r.tax_vat,                                 false],
    [2, "Thuế TNCN (TikTok khấu trừ)",           -r.tax_pit,                                 false],
    [1, "Tổng điều chỉnh",                       -(r.compensation || 0),                      false],
    [2, "Chi phí quảng cáo TikTok Ads",          -(r.compensation || 0),                      false],
  ]

  let y = 33
  items.forEach(([level, label, val, bold]) => {
    if (val === 0) return
    doc.setFontSize(bold ? 10 : 9)
    doc.text(label, L + level * 5, y)
    doc.text(fmt(val), L + W, y, { align: "right" })
    y += 6
    if (y > 270) { doc.addPage(); y = 20 }
  })

  doc.line(L, y, L + W, y)
  y += 5
  doc.setFontSize(8)
  doc.text(`Xuất bản: ${new Date().toLocaleDateString("vi-VN")}`, L, y)
  doc.save(`TIKTOK_${r.shop}_${r.report_month}_doanh-thu.pdf`)
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
          <th style="padding:8px 0;">Shop</th>
          <th>Kỳ báo cáo</th>
          <th>Hẹn giờ</th>
          <th>Trạng thái</th>
          <th></th>
        </tr>
        ${jobs.map(j => `
          <tr style="border-bottom:1px solid #f9f9f9;">
            <td style="padding:10px 0;"><b>${j.shop_name}</b></td>
            <td>T${j.month}/${j.year}</td>
            <td>${j.scheduled_at ? j.scheduled_at.replace('T', ' ') : 'Chạy ngay'}</td>
            <td style="${getStatusStyle(j.status)}">${j.status.toUpperCase()}</td>
            <td>${j.status === 'pending' ? `<button onclick="deleteJob(${j.id})" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:12px">🗑️ Xóa</button>` : ''}</td>
          </tr>
        `).join('')}
      </table>
    `
  } catch (e) {
    el.innerHTML = "❌ Không thể tải trạng thái bot."
  }
}

// Tự động làm mới mỗi 30 giây để theo dõi bot
setInterval(loadJobProgress, 30000)
loadJobProgress()

async function deleteJob(id) {
  if (!confirm("Xóa lệnh này?")) return
  try {
    const res = await fetch(API + "/api/jobs/" + id, { method: "DELETE" })
    const data = await res.json()
    if (data.status === "ok") loadJobProgress()
    else alert("Lỗi xóa: " + (data.error || "unknown"))
  } catch(e) {
    alert("Lỗi: " + e.message)
  }
}

function toggleAllReports(checked) {
  document.querySelectorAll(".report-cb").forEach(cb => cb.checked = checked)
  updateSelectedCount()
}

function updateSelectedCount() {
  const n = document.querySelectorAll(".report-cb:checked").length
  const total = document.querySelectorAll(".report-cb").length
  document.getElementById("selectedCount").textContent =
    n === 0 ? "Chưa chọn file nào" : `Đã chọn ${n}/${total} file`
  const checkAll = document.getElementById("checkAll")
  if (checkAll) checkAll.indeterminate = n > 0 && n < total
}

async function bulkDelete() {
  const checked = [...document.querySelectorAll(".report-cb:checked")]
  if (!checked.length) { alert("Chưa chọn file nào!"); return }
  if (!confirm(`Xóa ${checked.length} báo cáo đã chọn?`)) return

  let ok = 0
  for (const cb of checked) {
    try {
      const res = await fetch(API + "/api/reports/" + cb.value, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ r2_key: cb.dataset.r2 })
      })
      const data = await res.json()
      if (data.status === "ok") ok++
    } catch(e) {}
  }
  showToast(`Đã xóa ${ok}/${checked.length} báo cáo`)
  loadHistory()
}

async function bulkDownload() {
  const checked = [...document.querySelectorAll(".report-cb:checked")]
  if (!checked.length) { alert("Chưa chọn file nào!"); return }

  showToast(`Đang tải ${checked.length} file...`)
  for (const cb of checked) {
    const url = `${API}/api/report-file?key=${encodeURIComponent(cb.dataset.r2)}`
    const a = document.createElement("a")
    a.href = url
    a.download = cb.dataset.file
    a.target = "_blank"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    await new Promise(r => setTimeout(r, 800)) // delay nhỏ tránh block
  }
}

loadHistory()