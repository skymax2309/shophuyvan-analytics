// ── INVOICE MANAGER ──────────────────────────────────────────────────
// Requires: API, fmt, showToast, allSkus (sku-manager.js)

var invFile   = null
var invParsed = []
var _allInvoices = []
var _pdfJsLoading = null

function setInvLog(html) {
  const log = document.getElementById("inv-log")
  if (log) log.innerHTML = html
}

function escapeInvoiceHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib
  if (!_pdfJsLoading) {
    _pdfJsLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js"
        resolve(window.pdfjsLib)
      }
      script.onerror = () => reject(new Error("Không tải được thư viện đọc PDF"))
      document.head.appendChild(script)
    })
  }
  return _pdfJsLoading
}

function groupPdfTextLines(items) {
  const rows = items
    .filter(it => String(it.str || "").trim())
    .map(it => ({ text: String(it.str || "").trim(), x: it.transform[4], y: Math.round(it.transform[5] * 2) / 2 }))
    .sort((a, b) => Math.abs(b.y - a.y) > 1 ? b.y - a.y : a.x - b.x)

  const lines = []
  for (const row of rows) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - row.y) <= 2.5) {
      last.parts.push(row)
    } else {
      lines.push({ y: row.y, parts: [row] })
    }
  }
  return lines
    .map(line => line.parts.sort((a, b) => a.x - b.x).map(p => p.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

async function extractInvoicePdfText(file) {
  const pdfjs = await ensurePdfJs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages = []

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    setInvLog(`Đang đọc nội dung PDF... trang ${pageNo}/${pdf.numPages}`)
    const page = await pdf.getPage(pageNo)
    const content = await page.getTextContent()
    pages.push(groupPdfTextLines(content.items).join("\n"))
  }

  return pages.join("\n")
}

function handleInvFile(file) {
  if (!file) return
  invFile = file
  document.getElementById("inv-filename").textContent  = "📄 " + file.name
  document.getElementById("inv-dropzone").style.borderColor = "#4f46e5"
}

function renderInvoiceParserWarnings(warnings = []) {
  if (!warnings.length) return ""
  const notes = warnings.filter(w => /MST người mua/i.test(w))
  const checks = warnings.filter(w => !/MST người mua/i.test(w))
  return [
    checks.length
      ? `<br><span style="color:#b45309">Cần kiểm tra: ${escapeInvoiceHtml(checks.join(", "))}</span>`
      : "",
    notes.length
      ? `<br><span style="color:#64748b">Ghi chú: ${escapeInvoiceHtml(notes.join(", "))}. Vẫn có thể lưu nếu các dòng hàng và SKU đã đúng.</span>`
      : ""
  ].join("")
}

async function uploadInvoice() {
  if (!invFile) { alert("Chọn file PDF trước!"); return }
  const btn = document.getElementById("inv-btn")
  btn.disabled    = true
  btn.textContent = "⏳ Đang phân tích..."
  setInvLog("Đang đọc nội dung PDF trong trình duyệt...")

  try {
    const invoiceText = await extractInvoicePdfText(invFile)
    if (!invoiceText || invoiceText.trim().length < 80) {
      setInvLog("❌ PDF này không có lớp chữ đủ rõ. Hãy xuất hóa đơn PDF điện tử gốc, không dùng ảnh scan.")
      return
    }

    const formData = new FormData()
    formData.append("file", invFile)
    formData.append("text", invoiceText)
    const res  = await fetch(API + "/api/parse-invoice", { method: "POST", body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Không đọc được hóa đơn")
    if (!data.items || !data.items.length) {
      setInvLog("❌ Không tìm thấy sản phẩm trong hóa đơn!")
      return
    }
    invParsed     = data
    const warnings = renderInvoiceParserWarnings(data.parser?.warnings || [])
    const buyerTaxCode = data.buyer ? escapeInvoiceHtml(data.buyer) : "chưa nhận được"
    const buyerName = data.buyer_name ? ` | Người mua: <b>${escapeInvoiceHtml(data.buyer_name)}</b>` : ""
    const duplicateCount = parsedInvoiceDuplicateCount(data.invoice_no)
    const duplicateNote = duplicateCount
      ? ` | <span style="color:#b45309;font-weight:700">Số HĐ đã có ${duplicateCount} bản</span>`
      : ""
    setInvLog(`✅ Tìm thấy <b>${data.items.length}</b> sản phẩm | Nhà CC: <b>${escapeInvoiceHtml(data.supplier || "?")}</b> | Số HĐ: <b>${escapeInvoiceHtml(data.invoice_no || "?")}</b> | Ngày: <b>${escapeInvoiceHtml(data.invoice_date || "?")}</b> | MST người mua: <b>${buyerTaxCode}</b>${buyerName}${duplicateNote} | Parser nội bộ: <b>${Math.round((data.parser?.confidence || 0) * 100)}%</b>${warnings}`)
    renderInvConfirm(data)
  } catch (e) {
    setInvLog("❌ Lỗi: " + e.message)
  } finally {
    btn.disabled    = false
    btn.textContent = "Đọc hóa đơn"
  }
}
