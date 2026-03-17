
// ════════════════════════════════════════════════════════════════════
// PARSE INVOICE bằng Claude AI
// ════════════════════════════════════════════════════════════════════

import { getCostSettings } from '../utils/db.js'

async function parseInvoiceAI(request, env, cors) {
  const formData = await request.formData()
  const file = formData.get("file")
  if (!file) return Response.json({ error: "No file" }, { status: 400, headers: cors })

  const bytes = await file.arrayBuffer()
  const base64 = (() => {
    const arr = new Uint8Array(bytes)
    let binary = ""
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i])
    return btoa(binary)
  })()

  const prompt = `Đây là hóa đơn mua hàng. Hãy trích xuất thông tin và trả về JSON duy nhất (không có text khác):
{
  "supplier": "tên nhà cung cấp",
  "buyer": "mã số thuế người mua hàng (Tax code của người mua, chỉ lấy dãy số liền, ví dụ: 079084002835 hoặc 0101243150)",
  "invoice_no": "số hóa đơn",
  "invoice_date": "ngày hóa đơn dạng YYYY-MM-DD",
  "total_amount": số tiền tổng thanh toán (số nguyên),
  "items": [
    {
      "name": "tên sản phẩm",
      "qty": số lượng (số nguyên),
      "unit": "đơn vị tính",
      "unit_price": đơn giá trước thuế (số nguyên),
      "amount": thành tiền trước thuế (số nguyên),
      "vat_rate": phần trăm thuế (số nguyên, vd: 8),
      "amount_after_vat": thành tiền sau thuế (số nguyên)
    }
  ]
}
Chỉ trả về JSON, không giải thích thêm.`

  // Rotation nhiều API key — thử lần lượt đến khi thành công
  const geminiKeys = [
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY_4,
    env.GEMINI_API_KEY_5,
  ].filter(Boolean) // bỏ qua key chưa set

  if (!geminiKeys.length) {
    return Response.json({ error: "Chưa cấu hình GEMINI_API_KEY" }, { status: 500, headers: cors })
  }

  let text = "{}"
  let lastError = ""

  for (const key of geminiKeys) {
    try {
      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: "application/pdf", data: base64 } },
                { text: prompt }
              ]
            }]
          })
        }
      )
      const aiData = await aiRes.json()

      // Kiểm tra lỗi quota/rate limit
      if (aiData.error) {
        const code = aiData.error.code || 0
        const msg  = aiData.error.message || ""
        if (code === 429 || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
          lastError = `429: ${msg}`
          continue
        }
        // Lỗi khác — trả về chi tiết để debug
        return Response.json({ error: msg, code, raw: aiData }, { status: 500, headers: cors })
      }

      text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
      break // thành công, thoát vòng lặp

    } catch(e) {
      lastError = e.message
      continue
    }
  }

  if (text === "{}") {
    return Response.json({ error: "Tất cả API key đều hết quota: " + lastError }, { status: 429, headers: cors })
  }
  try {
    const clean = text.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(clean)
    return Response.json(parsed, { headers: cors })
  } catch(e) {
    return Response.json({ error: "AI parse failed", raw: text }, { status: 500, headers: cors })
  }
}

async function saveInvoice(request, env, cors) {
  const formData = await request.formData()
  const file = formData.get("file")
  const dataStr = formData.get("data")
  if (!file || !dataStr) return Response.json({ error: "Missing data" }, { status: 400, headers: cors })

  const data = JSON.parse(dataStr)
  // Lấy buyer từ data (AI parse ra)
  const buyer = data.buyer || ""
  const bytes = await file.arrayBuffer()
  const r2Key = `invoices/${data.invoice_date || "unknown"}/${data.invoice_no || Date.now()}_${file.name}`

  // Lưu file lên R2
  await env.STORAGE.put(r2Key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { supplier: data.supplier || "", invoice_no: data.invoice_no || "" }
  })

  // Lưu vào DB
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
    data.total_amount || 0, data.items.length, r2Key,
    JSON.stringify(data.items.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, sku: i.sku })))
  ).run()
  
  // Lưu mapping tên SP hóa đơn → SKU để lần sau tự nhận
  const mapStmts = data.items
    .filter(i => i.sku && i.name)
    .map(i => env.DB.prepare(`
      INSERT INTO invoice_sku_map (invoice_name, sku)
      VALUES (?, ?)
      ON CONFLICT(invoice_name) DO UPDATE SET sku = excluded.sku
    `).bind(i.name.trim(), i.sku))
  if (mapStmts.length) await env.DB.batch(mapStmts)

  // Lấy giá vốn hiện tại để so sánh
  const skuList = data.items.map(i => i.sku).filter(Boolean)
  let priceChanges = []
  let autoUpdated = 0

  if (skuList.length) {
    const existing = await env.DB.prepare(
      `SELECT sku, cost_invoice FROM products WHERE sku IN (${skuList.map(()=>"?").join(",")})`
    ).bind(...skuList).all()

    const existingMap = {}
    for (const p of existing.results) existingMap[p.sku] = p.cost_invoice

    const autoStmts = []
    for (const item of data.items) {
      if (!item.sku) continue
      const oldPrice = existingMap[item.sku]
      if (oldPrice === undefined) {
        // SKU chưa có giá → cập nhật luôn
        autoStmts.push(
          env.DB.prepare(`UPDATE products SET cost_invoice = ? WHERE sku = ?`)
            .bind(item.unit_price, item.sku)
        )
        autoUpdated++
      } else if (oldPrice !== item.unit_price) {
        // Giá thay đổi → báo để xác nhận
        priceChanges.push({
          sku: item.sku,
          name: item.name,
          old_price: oldPrice,
          new_price: item.unit_price
        })
      }
      // Giá không đổi → bỏ qua
    }
    if (autoStmts.length) await env.DB.batch(autoStmts)
  }

  return Response.json({
    status: "ok",
    updated: autoUpdated,
    price_changes: priceChanges  // danh sách SKU có giá thay đổi
  }, { headers: cors })
}

async function listInvoices(request, env, cors) {
  const rows = await env.DB.prepare(`
    SELECT * FROM purchase_invoices ORDER BY invoice_date DESC LIMIT 100
  `).all()
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
  if (!group_name || !skus?.length)
    return Response.json({ error: "Missing data" }, { status: 400, headers: cors })
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

function parseTiktokExcel(text) { return {} }

export { parseInvoiceAI, saveInvoice, listInvoices, getInvoiceFile,
         updateCostPrices, getSkuMap, getSkuGroups, saveSkuGroup,
         updateGroupPrice, deleteSkuGroup, deleteInvoice }