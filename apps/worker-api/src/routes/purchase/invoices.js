// Local purchase invoice parser. It does not call Gemini/OpenAI or marketplace APIs.

const MONEY_RE = /\d{1,3}(?:[.,]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g

function normalizeInvoiceText(text = "") {
  return String(text)
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

function parseVnNumber(value) {
  const raw = String(value || "").replace(/\s/g, "")
  if (!raw) return 0

  let clean = raw
  if (clean.includes(".") && clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".")
  } else if (clean.includes(",")) {
    const parts = clean.split(",")
    clean = parts[1]?.length <= 2 ? `${parts[0].replace(/\./g, "")}.${parts[1]}` : clean.replace(/,/g, "")
  } else if (clean.includes(".")) {
    const parts = clean.split(".")
    clean = parts[parts.length - 1].length === 3 ? clean.replace(/\./g, "") : clean
  }

  const n = Number(clean)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function extractNumbers(line) {
  return [...String(line || "").matchAll(MONEY_RE)]
    .map(m => parseVnNumber(m[0]))
    .filter(n => n > 0)
}

function firstMatch(lines, matcher) {
  for (const line of lines) {
    const m = line.match(matcher)
    if (m) return m
  }
  return null
}

function formatInvoiceDate(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ""
  if (y < 2020 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return ""
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return ""
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function normalizeInvoiceYear(value) {
  const year = Number(value)
  if (!Number.isFinite(year)) return 0
  return year < 100 ? 2000 + year : year
}

function parseInvoiceDate(lines) {
  const headerLines = lines.slice(0, 70)
  const joined = headerLines.join("\n")
  const normalizedJoined = normalizeInvoiceSearchText(joined)

  // Ngày hóa đơn dùng để chia thư mục, lọc tháng và đối soát trùng số HĐ,
  // nên parser ưu tiên vùng header trước khi đọc các ngày giao hàng/thanh toán khác.
  const vnDate = normalizedJoined.match(/ngay(?: date)?\s*(\d{1,2})\s*thang(?: month)?\s*(\d{1,2})\s*nam(?: year)?\s*(\d{2,4})/i)
  if (vnDate) return formatInvoiceDate(normalizeInvoiceYear(vnDate[3]), vnDate[2], vnDate[1])

  const labeledIndex = headerLines.findIndex(line => /ngày|date|invoice date|ngày hóa đơn|ngay hoa don/iu.test(line))
  const labeledText = labeledIndex >= 0 ? headerLines.slice(labeledIndex, labeledIndex + 3).join(" ") : joined
  const dmyDate = labeledText.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/u)
  if (dmyDate) return formatInvoiceDate(normalizeInvoiceYear(dmyDate[3]), dmyDate[2], dmyDate[1])

  const ymdDate = labeledText.match(/\b(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/u)
  if (ymdDate) return formatInvoiceDate(ymdDate[1], ymdDate[2], ymdDate[3])

  const fallbackDmy = joined.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/u)
  if (fallbackDmy) return formatInvoiceDate(fallbackDmy[3], fallbackDmy[2], fallbackDmy[1])

  const fallbackYmd = joined.match(/\b(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/u)
  if (fallbackYmd) return formatInvoiceDate(fallbackYmd[1], fallbackYmd[2], fallbackYmd[3])
  return ""
}

function parseInvoiceNo(lines) {
  for (const line of lines.slice(0, 45)) {
    if (!/Số/iu.test(line)) continue
    if (/Mã CQT|Mã số thuế|Số tài khoản|Số hộ chiếu|Điện thoại|CCCD/iu.test(line)) continue
    const m = line.match(/(?:^|\s)Số\s*(?:\([^)]*\))?\s*[:.]?\s*([A-Z0-9][A-Z0-9./-]{0,40})/iu)
    if (m) return m[1].replace(/[^\w./-]/g, "").trim()
  }
  return ""
}

function parseSupplier(lines) {
  const seller = firstMatch(lines.slice(0, 80), /Đơn vị bán hàng\s*(?:\([^)]*\))?\s*:\s*(.+)$/iu)
  if (seller) return seller[1].trim()

  const firstTaxIndex = lines.findIndex(line => /Mã số thuế/iu.test(line))
  const candidates = lines
    .slice(0, firstTaxIndex > 0 ? firstTaxIndex : 45)
    .filter(line =>
      /CÔNG TY|CONG TY|HỘ KINH DOANH|DOANH NGHIỆP/iu.test(line) &&
      !/HÓA ĐƠN|VAT|BẢN THỂ HIỆN|Ký hiệu|Mã CQT/iu.test(line)
    )
  return candidates[candidates.length - 1]?.trim() || ""
}

function normalizeInvoiceSearchText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanTaxCode(value = "") {
  const code = String(value || "").replace(/\D/g, "")
  return code.length >= 8 && code.length <= 14 ? code : ""
}

function isBuyerTaxContext(normLine = "") {
  return /ma so thue nguoi mua|mst nguoi mua|buyer tax|buyer tax code|customer tax|customer tax code|purchaser tax|tax code buyer|tax code customer/i.test(normLine)
}

function isSellerTaxContext(normLine = "") {
  return /ma so thue nguoi ban|mst nguoi ban|seller tax|seller tax code|tax code seller/i.test(normLine)
}

function isBuyerInfoLine(normLine = "") {
  return /nguoi mua|ben mua|don vi mua|khach hang|buyer|customer|purchaser|ten don vi|company s name|company name/i.test(normLine)
}

function isSellerInfoLine(normLine = "") {
  return /don vi ban|nguoi ban|ben ban|seller|sales company|supplier/i.test(normLine)
}

function taxCodeFromLine(rawLine = "") {
  const normLine = normalizeInvoiceSearchText(rawLine)
  if (!/(ma so thue|mst|tax code|tax no|tax number|taxcode)/i.test(normLine)) return ""
  const direct = rawLine.match(/(?:Mã\s*số\s*thuế|Ma\s*so\s*thue|MST|Tax\s*(?:code|no\.?|number)|Taxcode)\s*(?:\([^)]*\))?\s*[:：.-]?\s*([0-9][0-9 .-]{6,24}[0-9])/iu)
  if (direct) return cleanTaxCode(direct[1])
  const anyCode = rawLine.match(/\b([0-9][0-9 .-]{7,24}[0-9])\b/u)
  return anyCode ? cleanTaxCode(anyCode[1]) : ""
}

function findNearbyTaxCode(lines, startIndex) {
  for (let offset = 1; offset <= 2; offset++) {
    const line = lines[startIndex + offset] || ""
    const m = line.match(/\b([0-9][0-9 .-]{7,24}[0-9])\b/u)
    const code = m ? cleanTaxCode(m[1]) : ""
    if (code) return code
  }
  return ""
}

function lastIndexWhere(values, endIndex, predicate) {
  for (let i = Math.min(endIndex, values.length - 1); i >= 0; i--) {
    if (predicate(values[i])) return i
  }
  return -1
}

function parseBuyerTaxCode(lines) {
  const stop = lines.findIndex(line => /Hình thức thanh toán|STT\s+Tên hàng|Tên hàng hóa/iu.test(line))
  const headerLines = lines.slice(0, stop > 0 ? stop : 90)
  const normalized = headerLines.map(normalizeInvoiceSearchText)
  const candidates = []

  for (let i = 0; i < headerLines.length; i++) {
    const normLine = normalized[i]
    if (!/(ma so thue|mst|tax code|tax no|tax number|taxcode)/i.test(normLine)) continue
    const code = taxCodeFromLine(headerLines[i]) || findNearbyTaxCode(headerLines, i)
    if (!code) continue

    const prevBuyerIndex = lastIndexWhere(normalized, i, isBuyerInfoLine)
    const prevSellerIndex = lastIndexWhere(normalized, i, isSellerInfoLine)
    const nextFew = normalized.slice(i, Math.min(i + 3, normalized.length)).join(" ")
    let score = 0

    // MST người mua là dữ liệu phân loại hóa đơn, nên ưu tiên nhãn buyer/customer
    // và vùng thông tin người mua; không lấy mã người bán nếu chỉ thấy một MST nhà cung cấp.
    if (isBuyerTaxContext(normLine) || isBuyerTaxContext(nextFew)) score += 100
    if (isSellerTaxContext(normLine) || isSellerTaxContext(nextFew)) score -= 100
    if (prevBuyerIndex >= 0 && prevBuyerIndex >= prevSellerIndex) score += 45
    if (prevSellerIndex > prevBuyerIndex) score -= 35
    if (candidates.length) score += 10
    score += Math.min(i, 40) / 10

    candidates.push({ code, score, index: i, line: headerLines[i] })
  }

  if (!candidates.length) return ""
  const buyerSpecific = candidates
    .filter(item => isBuyerTaxContext(normalized[item.index] || ""))
    .sort((a, b) => b.score - a.score)[0]
  if (buyerSpecific?.code) return buyerSpecific.code

  const ranked = [...candidates].sort((a, b) => b.score - a.score)
  if (ranked[0].score >= 25) return ranked[0].code

  if (candidates.length > 1) return candidates[candidates.length - 1].code
  return ""
}

function cleanBuyerName(value = "") {
  return String(value || "")
    .replace(/\s+(?:CCCD|CMND|Căn cước|Căn cước công dân|Hộ chiếu|Passport|Mã số thuế|MST|Tax code|Địa chỉ|Address)\s*(?:người mua|buyer|customer)?\s*[:：].*$/iu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function parseBuyerName(lines) {
  const stop = lines.findIndex(line => /Hình thức thanh toán|STT\s+Tên hàng|Tên hàng hóa/iu.test(line))
  const headerLines = lines.slice(0, stop > 0 ? stop : 90)
  for (let i = 0; i < headerLines.length; i++) {
    const norm = normalizeInvoiceSearchText(headerLines[i])
    if (!/nguoi mua|ben mua|don vi mua|khach hang|buyer|customer|purchaser|ten don vi|company s name|company name/i.test(norm)) continue
    const sameLine = headerLines[i].match(/(?:Người\s*mua(?:\s*hàng)?|Tên\s*người\s*mua|Tên\s*đơn\s*vị|Khách\s*hàng|Buyer|Customer|Company(?:'s)?\s*name)\s*(?:\([^)]*\))?\s*[:：.-]\s*(.+)$/iu)
    const value = cleanBuyerName(sameLine?.[1] || headerLines[i + 1] || "")
    if (value && !/ma so thue|mã số thuế|mst|tax code/i.test(normalizeInvoiceSearchText(value))) {
      return value.slice(0, 180)
    }
  }
  return ""
}

function parseTotalAmount(lines, items) {
  const totalPatterns = /Tổng cộng tiền thanh toán|Total payment|Tổng cộng:|Cộng tiền thanh toán|Giá trị thanh toán/iu
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!totalPatterns.test(line)) continue
    const nums = extractNumbers(line)
    if (nums.length) return nums[nums.length - 1]
  }
  return items.reduce((sum, item) => sum + Number(item.amount_after_vat || item.amount || 0), 0)
}

function shouldSkipTableLine(line) {
  return /^(1\s+2\s+3\s+4|tiep theo|trang\s+\d+|page\s+\d+)/iu.test(line) ||
    /^(STT|No\.|Tên hàng hóa|Đơn vị|Thành tiền|Tiền thuế|Thuế suất|GTGT|Amount|Description|Unit|Quantity|Unit price|tính GTGT|before VAT|amount\)|\(Unit\))/iu.test(line) ||
    /\(Amount|\(VAT|\(Unit\)|\(No\.\)|\(Description\)|Unit price|Quantity|Description/iu.test(line) ||
    /Cần kiểm tra|Tra cứu|Phát hành bởi|Đơn vị cung cấp dịch vụ/iu.test(line)
}

function isTableHeader(line) {
  return /STT/iu.test(line) && /Tên hàng|Description/iu.test(line)
}

function isTableEnd(line) {
  return /^(Tổng hợp|Tổng tiền|Tổng cộng|Số tiền viết bằng chữ|Người mua hàng|Người bán hàng)/iu.test(line)
}

function parseRowLine(line) {
  const m = line.match(/^\s*(\d{1,3})\s+(.+?)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\s+(\d{1,2})\s*%\s+(\d[\d.,]*)(?:\s+(\d[\d.,]*))?\s*$/u)
  if (!m) return null

  const beforeQty = m[2].trim()
  const parts = beforeQty.split(/\s+/)
  if (!parts.length) return null

  const unit = parts.pop() || ""
  const desc = parts.join(" ").trim()
  const qty = parseVnNumber(m[3])
  const unitPrice = parseVnNumber(m[4])
  const amount = parseVnNumber(m[5])
  const vatRate = parseInt(m[6], 10) || 0
  const vatAmount = parseVnNumber(m[7])
  const amountAfterVat = parseVnNumber(m[8]) || (amount + vatAmount)

  if (!qty || !unitPrice || !amount) return null
  return { row_no: Number(m[1]), description: desc, unit, qty, unit_price: unitPrice, amount, vat_rate: vatRate, amount_after_vat: amountAfterVat }
}

function pickCurrentPreamble(pendingLines) {
  const useful = pendingLines.filter(line => line && !shouldSkipTableLine(line) && !isTableEnd(line))
  if (!useful.length) return []

  let start = 0
  for (let i = 0; i < useful.length; i++) {
    if (/mới\s*100%|moi\s*100%|new\s*100%/iu.test(useful[i])) start = i + 1
  }
  const current = useful.slice(start)
  return (current.length ? current : useful).slice(-6)
}

function cleanItemName(name) {
  return String(name || "")
    .replace(/\b(?:Cái|Hộp|Viên|Bộ|Cuộn|Túi|Chiếc)\s*$/iu, "")
    .replace(/\s+/g, " ")
    .replace(/^\d+\s+/, "")
    .trim()
}

function parseInvoiceItems(lines) {
  const items = []
  let inTable = false
  let pending = []

  for (const line of lines) {
    if (!inTable) {
      if (isTableHeader(line)) inTable = true
      continue
    }

    if (isTableEnd(line)) break
    if (shouldSkipTableLine(line)) continue

    const row = parseRowLine(line)
    if (!row) {
      pending.push(line)
      if (pending.length > 14) pending = pending.slice(-14)
      continue
    }

    const preamble = pickCurrentPreamble(pending)
    const name = cleanItemName([...preamble, row.description].filter(Boolean).join(" "))
    pending = []

    if (!name) continue
    items.push({
      name,
      qty: row.qty,
      unit: row.unit,
      unit_price: row.unit_price,
      amount: row.amount,
      vat_rate: row.vat_rate,
      amount_after_vat: row.amount_after_vat
    })
  }

  return items
}

function extractPdfTextFallback(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    const matches = []
    const re = /\(([^)]{1,240})\)/g
    let m
    while ((m = re.exec(text)) !== null) {
      const s = m[1].replace(/\\n/g, "\n").replace(/\\r/g, "").trim()
      if (s.length > 1) matches.push(s)
    }
    return matches.join("\n")
  } catch {
    return ""
  }
}

function parseInvoiceText(text) {
  const normalized = normalizeInvoiceText(text)
  const lines = normalized.split("\n").filter(Boolean)
  const items = parseInvoiceItems(lines)
  const supplier = parseSupplier(lines)
  const buyer = parseBuyerTaxCode(lines)
  const buyer_name = parseBuyerName(lines)
  const invoice_no = parseInvoiceNo(lines)
  const invoice_date = parseInvoiceDate(lines)
  const total_amount = parseTotalAmount(lines, items)

  const warnings = []
  if (!supplier) warnings.push("Không nhận được nhà cung cấp")
  if (!buyer) warnings.push("Không nhận được MST người mua")
  if (!invoice_no) warnings.push("Không nhận được số hóa đơn")
  if (!invoice_date) warnings.push("Không nhận được ngày hóa đơn")
  if (!items.length) warnings.push("Không tách được dòng hàng hóa")

  const confidence =
    (supplier ? 0.15 : 0) +
    (buyer ? 0.15 : 0) +
    (invoice_no ? 0.15 : 0) +
    (invoice_date ? 0.15 : 0) +
    (total_amount ? 0.15 : 0) +
    (items.length ? 0.25 : 0)

  return {
    supplier,
    buyer,
    buyer_name,
    invoice_no,
    invoice_date,
    total_amount,
    items,
    parser: {
      engine: "local-rule",
      confidence: Math.round(Math.min(confidence, 1) * 100) / 100,
      text_length: normalized.length,
      warnings
    }
  }
}

async function parseInvoiceLocal(request, env, cors) {
  const formData = await request.formData()
  const file = formData.get("file")
  let text = formData.get("text") || ""

  if (!file && !text) {
    return Response.json({ error: "No file or text" }, { status: 400, headers: cors })
  }

  let source = "client-text"
  text = normalizeInvoiceText(text)

  if (text.length < 80 && file) {
    const bytes = await file.arrayBuffer()
    text = normalizeInvoiceText(extractPdfTextFallback(bytes))
    source = "worker-pdf-fallback"
  }

  if (text.length < 80) {
    return Response.json({
      error: "Không đọc được text trong PDF. File này có thể là ảnh scan, cần OCR trước khi lưu.",
      parser: { engine: "local-rule", source, text_length: text.length, warnings: ["PDF không có text layer đủ rõ"] }
    }, { status: 422, headers: cors })
  }

  const parsed = parseInvoiceText(text)
  parsed.parser.source = source
  return Response.json(parsed, { headers: cors })
}

async function saveInvoice(request, env, cors) {
  const formData = await request.formData()
  const file = formData.get("file")
  const dataStr = formData.get("data")
  if (!file || !dataStr) return Response.json({ error: "Missing data" }, { status: 400, headers: cors })

  const data = JSON.parse(dataStr)
  const items = Array.isArray(data.items) ? data.items : []
  const buyer = data.buyer || ""
  const bytes = await file.arrayBuffer()
  const r2Key = `invoices/${data.invoice_date || "unknown"}/${data.invoice_no || Date.now()}_${file.name}`

  await env.STORAGE.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/pdf" },
    customMetadata: { supplier: data.supplier || "", invoice_no: data.invoice_no || "" }
  })

  await env.DB.prepare(`
   INSERT INTO purchase_invoices (supplier, buyer, invoice_no, invoice_date, total_amount, item_count, r2_key, items_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(invoice_no) DO UPDATE SET
      total_amount  = excluded.total_amount,
      buyer         = excluded.buyer,
      r2_key        = excluded.r2_key,
      items_json    = excluded.items_json
  `).bind(
    data.supplier || "", buyer, data.invoice_no || "", data.invoice_date || "",
    data.total_amount || 0, items.length, r2Key,
    JSON.stringify(items.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, sku: i.sku })))
  ).run()

  const mapStmts = items
    .filter(i => i.sku && i.name)
    .map(i => env.DB.prepare(`
      INSERT INTO invoice_sku_map (invoice_name, sku)
      VALUES (?, ?)
      ON CONFLICT(invoice_name) DO UPDATE SET sku = excluded.sku
    `).bind(i.name.trim(), i.sku))
  if (mapStmts.length) await env.DB.batch(mapStmts)

  const skuList = items.map(i => i.sku).filter(Boolean)
  let priceChanges = []
  let autoUpdated = 0

  if (skuList.length) {
    const existing = await env.DB.prepare(
      `SELECT sku, cost_invoice FROM products WHERE sku IN (${skuList.map(() => "?").join(",")})`
    ).bind(...skuList).all()

    const existingMap = {}
    for (const p of existing.results || []) existingMap[p.sku] = p.cost_invoice

    const autoStmts = []
    for (const item of items) {
      if (!item.sku) continue
      const oldPrice = existingMap[item.sku]
      if (oldPrice === undefined) continue
      if (!Number(oldPrice || 0)) {
        autoStmts.push(
          env.DB.prepare(`UPDATE products SET cost_invoice = ? WHERE sku = ?`)
            .bind(item.unit_price, item.sku)
        )
        autoUpdated++
      } else if (Number(oldPrice) !== Number(item.unit_price)) {
        priceChanges.push({
          sku: item.sku,
          name: item.name,
          old_price: oldPrice,
          new_price: item.unit_price
        })
      }
    }
    if (autoStmts.length) await env.DB.batch(autoStmts)
  }

  return Response.json({
    status: "ok",
    updated: autoUpdated,
    price_changes: priceChanges
  }, { headers: cors })
}

async function listInvoices(request, env, cors) {
  const url = new URL(request.url)
  const all = url.searchParams.get("all") === "1"
  const rows = await env.DB.prepare(
    all
      ? `SELECT * FROM purchase_invoices ORDER BY invoice_date DESC`
      : `SELECT * FROM purchase_invoices ORDER BY invoice_date DESC LIMIT 100`
  ).all()
  return Response.json(rows.results, { headers: cors })
}

async function getInvoiceFile(request, env, cors) {
  const key = new URL(request.url).searchParams.get("key")
  if (!key) return new Response("Missing key", { status: 400, headers: cors })
  const obj = await env.STORAGE.get(key)
  if (!obj) return new Response("Not found", { status: 404, headers: cors })
  return new Response(obj.body, {
    headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${key.split("/").pop()}"` }
  })
}

async function updateCostPrices(request, env, cors) {
  const items = await request.json()
  if (!items?.length) return Response.json({ updated: 0 }, { headers: cors })
  const stmts = items.map(item =>
    env.DB.prepare(`UPDATE products SET cost_invoice = ? WHERE sku = ?`)
      .bind(item.new_price, item.sku)
  )
  await env.DB.batch(stmts)
  return Response.json({ status: "ok", updated: items.length }, { headers: cors })
}

async function getSkuMap(request, env, cors) {
  const rows = await env.DB.prepare(`SELECT invoice_name, sku FROM invoice_sku_map`).all()
  return Response.json(rows.results, { headers: cors })
}

async function getSkuGroups(request, env, cors) {
  const rows = await env.DB.prepare(`SELECT * FROM sku_groups ORDER BY group_name`).all()
  return Response.json(rows.results, { headers: cors })
}

async function saveSkuGroup(request, env, cors) {
  const { group_name, skus } = await request.json()
  if (!group_name || !skus?.length) {
    return Response.json({ error: "Missing data" }, { status: 400, headers: cors })
  }
  await env.DB.prepare(`
    INSERT INTO sku_groups (group_name, skus) VALUES (?, ?)
    ON CONFLICT(group_name) DO UPDATE SET skus = excluded.skus
  `).bind(group_name, JSON.stringify(skus)).run()
  return Response.json({ status: "ok" }, { headers: cors })
}

async function updateGroupPrice(request, env, cors) {
  const { group_name, cost_invoice, cost_real } = await request.json()
  if (!group_name) return Response.json({ error: "Missing group_name" }, { status: 400, headers: cors })
  const row = await env.DB.prepare(`SELECT skus FROM sku_groups WHERE group_name = ?`).bind(group_name).first()
  if (!row) return Response.json({ error: "Group not found" }, { status: 404, headers: cors })
  const skus = JSON.parse(row.skus || "[]")
  if (!skus.length) return Response.json({ status: "ok", updated: 0 }, { headers: cors })
  const stmts = skus.map(sku =>
    env.DB.prepare(`UPDATE products SET cost_invoice = ?, cost_real = ? WHERE sku = ?`)
      .bind(cost_invoice, cost_real, sku)
  )
  await env.DB.batch(stmts)
  return Response.json({ status: "ok", updated: skus.length }, { headers: cors })
}

async function deleteSkuGroup(request, env, cors) {
  const { group_name } = await request.json()
  await env.DB.prepare(`DELETE FROM sku_groups WHERE group_name = ?`).bind(group_name).run()
  return Response.json({ status: "ok" }, { headers: cors })
}

async function deleteInvoice(request, env, cors) {
  const { id, r2_key } = await request.json()
  if (!id) return Response.json({ error: "Missing id" }, { status: 400, headers: cors })
  await env.DB.prepare(`DELETE FROM purchase_invoices WHERE id = ?`).bind(id).run()
  if (r2_key) await env.STORAGE.delete(r2_key)
  return Response.json({ status: "ok" }, { headers: cors })
}

export { parseInvoiceLocal, parseInvoiceText, saveInvoice, listInvoices, getInvoiceFile,
         updateCostPrices, getSkuMap, getSkuGroups, saveSkuGroup,
         updateGroupPrice, deleteSkuGroup, deleteInvoice }
