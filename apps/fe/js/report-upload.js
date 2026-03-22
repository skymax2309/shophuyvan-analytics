

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
        if (type === "orders") {
          // Đơn hàng TikTok → import vào orders_v2
          const month     = detectMonthFromName(file.name)
          const cleanShop = (shop || "SHOP").replace(/\s+/g, "-").toUpperCase()
          newName = `TIKTOK_${cleanShop}_${month}_donhang.xlsx`
          log.innerHTML += `📝 Đổi tên → <b>${newName}</b><br>`
          const { orders, items } = await parseTiktokOrderExcel(file)
          // Gán shop vào từng order
          orders.forEach(o => o.shop = shop)
          log.innerHTML += `📦 Parse được <b>${orders.length}</b> đơn, <b>${items.length}</b> SKU line...<br>`
          const res = await fetch(API + "/api/import-orders-v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orders, items })
          })
          result = await res.json()
          if (result.status === "ok") {
            log.innerHTML += `✅ Import <b>${result.imported_orders}</b> đơn, <b>${result.imported_items}</b> SKU line<br>`
          } else {
            log.innerHTML += `❌ Lỗi import: ${result.error || "Unknown"}<br>`
          }
          continue
        }
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
  const buf = await file.arrayBuffer()
  const wb  = XLSX.read(buf)

  // ── Parse sheet Reports (tổng hợp tháng) ─────────────────────────
  const ws   = wb.Sheets["Reports"] || wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  const n   = (val) => parseFloat(String(val || "0").replace(/[^0-9.-]/g, "")) || 0
  const abs = (val) => Math.abs(n(val))
  const findExact = (keyword) => {
    for (const r of rows) {
      for (let c = 1; c <= 4; c++) {
        if (String(r[c] || "").trim() === keyword) return n(r[5])
      }
    }
    return 0
  }

  const total_settlement = findExact("Total settlement amount")
  const total_revenue    = findExact("Total Revenue")
  const subtotal_after   = findExact("Subtotal after seller discounts")
  const refund_subtotal  = abs(findExact("Refund subtotal after seller discounts"))
  const actual_shipping     = n(findExact("Actual shipping fee"))
  const platform_ship_disc  = n(findExact("Platform shipping fee discount"))
  const customer_ship_fee   = n(findExact("Customer shipping fee"))
  const actual_return_ship  = n(findExact("Actual return shipping fee"))
  const net_shipping_cost   = abs(actual_shipping + platform_ship_disc + customer_ship_fee + actual_return_ship)
  const transaction_fee    = abs(findExact("Transaction fee"))
  const commission_fee     = abs(findExact("TikTok Shop commission fee"))
  const order_handling_fee = abs(findExact("Order processing fee"))
  const sfr_service_fee    = abs(findExact("SFR service fee"))
  const flash_sale_fee     = abs(findExact("Flash Sale service fee"))
  const affiliate_fee      = abs(findExact("Affiliate Commission"))
  const affiliate_ads_fee  = abs(findExact("Affiliate Shop Ads commission"))
  const total_affiliate    = affiliate_fee + affiliate_ads_fee
  const tax_vat            = abs(findExact("VAT withheld by TikTok Shop"))
  const tax_pit            = abs(findExact("PIT withheld by TikTok Shop"))
  const gmv_tiktok_ads     = abs(findExact("GMV Payment for TikTok Ads"))
  const total_adjustments  = n(findExact("Total adjustments"))
  const fee_total = transaction_fee + commission_fee + order_handling_fee
                  + sfr_service_fee + flash_sale_fee + total_affiliate
  const tax_total = tax_vat + tax_pit

  let _month = ""
  for (const r of rows) {
    if (String(r[1] || "").trim() === "Time period:") {
      const mp = String(r[5] || "").match(/(\d{4})\/(\d{2})/)
      if (mp) _month = `${mp[1]}-${mp[2]}`
      break
    }
  }

  // ── Parse sheet Order details (phí từng đơn) ─────────────────────
  const wsDetail = wb.Sheets["Order details"]
  let order_details = []
  if (wsDetail) {
    const detailRows = XLSX.utils.sheet_to_json(wsDetail, { defval: 0 })
    order_details = detailRows
      .filter(r => {
        const type = String(r['Type '] || r['Type'] || '').trim()
        const oid  = String(r['Order/adjustment ID  '] || r['Order/adjustment ID'] || '').trim()
        return type === 'Order' && oid.length > 5
      })
      .map(r => ({
        order_id:       String(r['Order/adjustment ID  '] || r['Order/adjustment ID'] || '').trim(),
        fee_commission: Math.abs(Number(r['TikTok Shop commission fee'])  || 0),
        fee_payment:    Math.abs(Number(r['Transaction fee'])             || 0),
        fee_service:    Math.abs(Number(r['Order processing fee']) || 0) + Math.abs(Number(r['SFR service fee']) || 0),
        fee_affiliate:  Math.abs(Number(r['Affiliate Commission'])        || 0),
        fee_piship:     Math.abs(Number(r['Actual shipping fee'])         || 0),
        fee_handling:   0,
        fee_ads:        Math.abs(Number(r['GMV Payment for TikTok Ads'])  || 0),
        tax_vat:        Math.abs(Number(r['VAT withheld by TikTok Shop']) || 0),
        tax_pit:        Math.abs(Number(r['PIT withheld by TikTok Shop']) || 0),
        total_fees:     Math.abs(Number(r['Total Fees'])                  || 0),
        settlement:     Number(r['Total settlement amount'])              || 0,
      }))
  }

  return {
    _month,
    order_details,   // <-- gửi kèm lên server
    gross_revenue:       total_revenue,
    refund_amount:       refund_subtotal,
    net_product_revenue: subtotal_after - refund_subtotal,
    platform_subsidy:    0,
    seller_voucher:      0,
    co_funded_voucher:   0,
    shipping_net:        -net_shipping_cost,
    fee_commission:      commission_fee,
    fee_payment:         transaction_fee,
    fee_service:         sfr_service_fee + flash_sale_fee,
    fee_affiliate:       total_affiliate,
    fee_piship_sfr:      sfr_service_fee,
    fee_handling:        order_handling_fee,
    fee_ads:             gmv_tiktok_ads,
    fee_total,
    compensation:        Math.max(0, total_adjustments),
    tax_vat,
    tax_pit,
    tax_total,
    total_payout:        total_settlement,
  }
}

async function parseTiktokOrderExcel(file) {
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf)
  const ws   = wb.Sheets["OrderSKUList"]
  if (!ws) return { orders: [], items: [] }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" })
  // Bỏ dòng 2 (mô tả cột)
  const dataRows = rows.filter(r => String(r["Order ID"] || "").length > 5
                                 && String(r["Order ID"] || "") !== "Platform unique order ID.")

  const ordersMap = {}
  const items     = []

  for (const r of dataRows) {
    const order_id     = String(r["Order ID"] || "").trim()
    const status       = String(r["Order Status"] || "").trim()
    const cancelType   = String(r["Cancelation/Return Type"] || "").trim()
    const cancel_reason= String(r["Cancel Reason"] || "").trim()
    const sku          = String(r["Seller SKU"] || "").trim()
    const product_name = String(r["Product Name"] || "").trim()
    const qty          = parseInt(r["Quantity"]) || 1
    const revenue_line = parseFloat(r["SKU Subtotal After Discount"]) || 0
    const order_amount = parseFloat(r["Order Amount"]) || 0

    // Xác định order_type
    let order_type = "normal"
    if (cancelType.toLowerCase().includes("return") || status.toLowerCase().includes("hoàn")) {
      order_type = "return"
    } else if (status.toLowerCase().includes("hủy") || status.toLowerCase().includes("cancel")) {
      order_type = "cancel"
    }

    // Lấy ngày: ưu tiên Paid Time, fallback Created Time
    const rawDate = String(r["Paid Time"] || r["Created Time"] || "").trim()
    // Format: "31/01/2026 23:43:31" → "2026-01-31"
    let order_date = ""
    const dm = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (dm) order_date = `${dm[3]}-${dm[2]}-${dm[1]}`

    // Gom order
    if (!ordersMap[order_id]) {
      ordersMap[order_id] = {
        order_id, platform: "tiktok", shop: "",
        order_date, order_type,
        revenue: order_amount, raw_revenue: order_amount,
        cancel_reason, return_fee: 0,
        shipped: 0, discount_shop: 0, discount_shopee: 0,
        discount_combo: 0, shipping_return_fee: 0,
      }
    }

    items.push({ order_id, sku, product_name, qty, revenue_line })
  }

  return { orders: Object.values(ordersMap), items }
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

