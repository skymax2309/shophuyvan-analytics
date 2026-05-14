const INVOICE_SKU_STOP_WORDS = new Set([
  "bang", "boc", "chat", "lieu", "dau", "vao", "kich", "thuoc", "dang",
  "cong", "suat", "hang", "hoa", "don", "san", "pham", "trong", "ngoai",
  "moi", "nhap", "khau", "xuat", "xu", "loai", "nhieu", "khac", "nhau",
  "theo", "tieu", "chuan", "phu", "cho", "cua", "voi", "cac"
])

const SKU_WORD_HINTS = [
  "dui", "den", "phich", "cam", "bom", "hut", "chan", "khong", "dua",
  "hop", "kim", "nano", "keo", "nep", "day", "dien", "trong", "duc",
  "trang", "den", "xanh", "pro", "may", "mieng", "dan", "khoa", "loc"
]

const INVOICE_KEY_TOKEN_GROUPS = [
  ["dui"],
  ["phich"],
  ["bom", "may"],
  ["dua"],
  ["keo", "nano"],
  ["nep", "day"],
  ["mieng", "dan"]
]

function normalizeInvoiceLookupText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/[_/\\|.,;:()[\]{}+=*"'`~!?%–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function expandSkuLookupWords(sku) {
  const normalized = normalizeInvoiceLookupText(sku)
  const compact = normalized.replace(/\s+/g, "")
  const hints = SKU_WORD_HINTS.filter(word => compact.includes(word)).join(" ")
  return `${normalized} ${hints}`.trim()
}

function invoiceLookupTokens(value) {
  return normalizeInvoiceLookupText(value)
    .split(/\s+/)
    .filter(token => token.length > 1 && !INVOICE_SKU_STOP_WORDS.has(token))
}

function invoiceTokenSet(value) {
  return new Set(invoiceLookupTokens(value))
}

function countTokenOverlap(left, right) {
  let count = 0
  for (const token of left) {
    if (right.has(token)) count++
  }
  return count
}

function hasInvoicePhrase(itemTokens, candidateText) {
  const candidate = ` ${normalizeInvoiceLookupText(candidateText)} `
  for (let i = 0; i < itemTokens.length - 1; i++) {
    const a = itemTokens[i]
    const b = itemTokens[i + 1]
    if (a.length < 3 || b.length < 3) continue
    if (candidate.includes(` ${a} ${b} `)) return true
  }
  return false
}

function invoicePriceMatchScore(unitPrice, skuRow) {
  const invoicePrice = Number(unitPrice || 0)
  const costInvoice = Number(skuRow.cost_invoice || 0)
  if (!invoicePrice || !costInvoice) return 0

  const diffRate = Math.abs(invoicePrice - costInvoice) / Math.max(invoicePrice, costInvoice)
  if (diffRate <= 0.03) return 0.22
  if (diffRate <= 0.08) return 0.16
  if (diffRate <= 0.18) return 0.1
  if (diffRate <= 0.35) return 0.04
  return diffRate >= 0.8 ? -0.08 : 0
}

function buildInvoiceSkuMap(rows = []) {
  const exact = {}
  const learned = []
  for (const row of rows || []) {
    const rawName = String(row.invoice_name || "").trim()
    const sku = String(row.sku || "").trim()
    if (!rawName || !sku) continue
    const key = normalizeInvoiceLookupText(rawName)
    if (key) exact[key] = sku
    learned.push({ key, tokens: invoiceTokenSet(rawName), sku })
  }
  return { exact, learned }
}

function findLearnedInvoiceSku(itemName, skuMapIndex) {
  const key = normalizeInvoiceLookupText(itemName)
  if (!key) return ""
  // Map đã học chỉ dùng cho tên hóa đơn khớp chuẩn hóa chính xác.
  // Nếu dùng fuzzy ở đây, các dòng cùng thông số điện áp/kích thước rất dễ lấy nhầm SKU cũ.
  return skuMapIndex.exact[key] || ""
}

function scoreInvoiceSku(itemName, skuRow, unitPrice = 0) {
  const itemTokensList = invoiceLookupTokens(itemName)
  const itemTokens = new Set(itemTokensList)
  if (!itemTokens.size) return 0

  // Tên trên hóa đơn thường rất dài, nên chấm điểm theo phần giao nhau mạnh nhất
  // giữa tên hóa đơn, SKU nội bộ và tên sản phẩm thay vì bắt buộc khớp nguyên câu.
  const skuText = expandSkuLookupWords(skuRow.sku || "")
  const mainText = `${skuText} ${skuRow.product_name || ""}`
  const mainTokens = invoiceTokenSet(mainText)
  const descTokens = invoiceTokenSet(skuRow.description || "")
  if (!mainTokens.size && !descTokens.size) return 0

  const mainOverlap = countTokenOverlap(itemTokens, mainTokens)
  const descOverlap = countTokenOverlap(itemTokens, descTokens)
  const mainCoverage = mainOverlap / Math.max(1, Math.min(itemTokens.size, mainTokens.size || itemTokens.size))
  const itemCoverage = mainOverlap / itemTokens.size
  const descCoverage = descOverlap / itemTokens.size

  let score = mainCoverage * 0.55 + itemCoverage * 0.18 + descCoverage * 0.16
  if (hasInvoicePhrase(itemTokensList, mainText)) score += 0.14

  for (const group of INVOICE_KEY_TOKEN_GROUPS) {
    const itemHasKey = group.some(token => itemTokens.has(token))
    if (!itemHasKey) continue
    const candidateHasKey = group.some(token => mainTokens.has(token))
    score += candidateHasKey ? 0.14 : -0.22
  }

  const itemText = normalizeInvoiceLookupText(itemName)
  const productText = normalizeInvoiceLookupText(skuRow.product_name || "")
  const skuTextNormalized = normalizeInvoiceLookupText(skuRow.sku || "")
  if (skuTextNormalized && itemText.includes(skuTextNormalized)) score += 0.35
  if (productText && productText.length > 10 && (itemText.includes(productText) || productText.includes(itemText))) score += 0.25

  const codeBonusTokens = [...mainTokens].filter(token => /\d/.test(token) && itemTokens.has(token)).slice(0, 4)
  score += codeBonusTokens.length * 0.04
  score += invoicePriceMatchScore(unitPrice, skuRow)

  const sku = String(skuRow.sku || "")
  const candidateName = normalizeInvoiceLookupText(`${skuRow.sku || ""} ${skuRow.product_name || ""}`)
  if (/^SP_\d+$/i.test(sku)) score -= 0.08
  if (/\bcombo\b/i.test(candidateName) && !itemTokens.has("combo")) score -= 0.02
  if (Number(skuRow.stock || 0) > 0) score += 0.03
  else score -= 0.16
  if (Number(skuRow.cost_invoice || 0) > 0) score += 0.04

  return Math.max(0, score)
}

function shouldAutoSelectInvoiceSku(scored) {
  const best = scored[0]
  if (!best) return false
  const secondScore = scored[1]?.score || 0
  return best.score >= 0.48 || (best.score >= 0.32 && best.score - secondScore >= 0.04)
}

function invoiceSkuOption(row, selectedSku = "", prefix = "") {
  const sku = escapeInvoiceHtml(row.s.sku || "")
  const name = escapeInvoiceHtml(row.s.product_name || "Chưa có tên sản phẩm")
  const score = Math.round(Math.min(row.score || 0, 1) * 100)
  const selected = row.s.sku === selectedSku ? "selected" : ""
  const scoreText = row.score ? ` (${score}%)` : ""
  return `<option value="${sku}" ${selected}>${prefix}${sku} — ${name}${scoreText}</option>`
}
