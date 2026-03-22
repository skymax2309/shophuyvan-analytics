// ── History ──────────────────────────────────────────────────────────
// Shop theo sàn cho filter
// Lấy danh sách shop động từ DB theo platform
async function onFilterPlatformChange() {
  const platform = document.getElementById("filterPlatform").value
  const shopSel  = document.getElementById("filterShop")
  shopSel.innerHTML = '<option value="">Tất cả shop</option>'

  try {
    const params = new URLSearchParams()
    if (platform) params.set("platform", platform)
    const rows = await fetch(API + "/api/reports?" + params.toString()).then(r => r.json())
    const shops = [...new Set(rows.map(r => r.shop).filter(Boolean))].sort()
    shopSel.innerHTML = '<option value="">Tất cả shop</option>'
      + shops.map(s => `<option value="${s}">${s}</option>`).join("")
  } catch(e) {
    console.error("Không load được shop:", e)
  }

  loadHistory()
}

async function loadHistory() {
  const month    = document.getElementById("filterMonth").value
  const platform = document.getElementById("filterPlatform").value
  const shop     = document.getElementById("filterShop")?.value || ""
  const params = new URLSearchParams()
  if (platform) params.set("platform", platform)
  if (shop)     params.set("shop", shop)
  if (month)    params.set("month", month)
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