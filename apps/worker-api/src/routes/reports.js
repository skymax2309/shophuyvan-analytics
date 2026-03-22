// ════════════════════════════════════════════════════════════════════
// UPLOAD REPORT — Lưu PDF/Excel báo cáo sàn vào R2 + parse số liệu
// POST multipart/form-data: file, platform, shop, report_type
// ════════════════════════════════════════════════════════════════════

import { detectReportMonth, extractPdfText, autoDetectAndParse,
         parseTiktokReport } from '../handlers/report-parsers.js'
		 
// ── Parse và lưu phí từng đơn TikTok vào tiktok_order_fees ──────────
async function saveTiktokOrderFees(env, parsedJson, reportMonth) {
  if (!parsedJson || !Array.isArray(parsedJson.order_details)) return
  const rows = parsedJson.order_details
  if (!rows.length) return

  const BATCH = 50
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const stmts = chunk.map(r => env.DB.prepare(`
      INSERT INTO tiktok_order_fees
        (order_id, fee_commission, fee_payment, fee_service,
         fee_affiliate, fee_piship, fee_handling, fee_ads,
         tax_vat, tax_pit, total_fees, settlement, report_month)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET
        fee_commission = excluded.fee_commission,
        fee_payment    = excluded.fee_payment,
        fee_service    = excluded.fee_service,
        fee_affiliate  = excluded.fee_affiliate,
        fee_piship     = excluded.fee_piship,
        fee_handling   = excluded.fee_handling,
        fee_ads        = excluded.fee_ads,
        tax_vat        = excluded.tax_vat,
        tax_pit        = excluded.tax_pit,
        total_fees     = excluded.total_fees,
        settlement     = excluded.settlement,
        report_month   = excluded.report_month
    `).bind(
      r.order_id,
      Math.abs(r.fee_commission  || 0),
      Math.abs(r.fee_payment     || 0),
      Math.abs(r.fee_service     || 0),
      Math.abs(r.fee_affiliate   || 0),
      Math.abs(r.fee_piship      || 0),
      Math.abs(r.fee_handling    || 0),
      Math.abs(r.fee_ads         || 0),
      Math.abs(r.tax_vat         || 0),
      Math.abs(r.tax_pit         || 0),
      Math.abs(r.total_fees      || 0),
      r.settlement || 0,
      reportMonth
    ))
    try { await env.DB.batch(stmts) } catch(e) { console.log('tiktok_order_fees batch error:', e.message) }
  }
}

async function uploadReport(request, env, cors) {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors })

  const formData    = await request.formData()
  const file        = formData.get("file")
  const platform    = formData.get("platform")    || "unknown"
  const shop        = formData.get("shop")        || ""
  const report_type = formData.get("report_type") || "income"

  if (!file)
    return Response.json({ error: "Thiếu file" }, { status: 400, headers: cors })

  // ── Đọc file bytes ───────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer()
  const bytes       = new Uint8Array(arrayBuffer)
  const fileName    = file.name

  // ── Parse số liệu từ nội dung file TRƯỚC ─────────────────────────
  let parsed = {}
  const ext = fileName.split(".").pop().toLowerCase()

  const parsedJson = formData.get("parsed_json")
  if (parsedJson) {
    parsed = parseTiktokReport(JSON.parse(parsedJson))
  } else if (ext === "pdf") {
    const clientText = formData.get("pdf_text") || ""
    const text = clientText.length > 50 ? clientText : await extractPdfText(bytes)
    console.log("[pdf parse] source:", clientText.length > 50 ? "client pdf.js" : "server regex", "textLen:", text.length, "preview:", text.substring(0, 200))
    parsed = autoDetectAndParse(text, platform, report_type)
  }

  // ── Xác định tháng — ưu tiên: override > nội dung PDF > tên file ──
  const report_month = formData.get("report_month_override")
    || parsed._report_month
    || detectReportMonth(fileName)

  // ── Cấu trúc R2 key ──────────────────────────────────────────────
  const folderType = {
    income:         "Doanh Thu",
    expense:        "Chi Phí",
    orders:         "Đơn Hàng",
    "phi-dau-thau": "Quảng Cáo",
  }[report_type] || "Doanh Thu"

  const platformFolder = {
    shopee: "Shopee",
    tiktok: "TikTok",
    lazada: "Lazada",
  }[platform] || platform

  const r2Key = `${report_month}/${folderType}/${platformFolder}/${fileName}`

  // ── Upload lên R2 ─────────────────────────────────────────────────
  await env.STORAGE.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { platform, shop, report_month, report_type }
  })

  // ── Lưu vào D1 ───────────────────────────────────────────────────
  await env.DB.prepare(`
    INSERT INTO platform_reports
      (platform, shop, report_month, report_type, file_name, r2_key,
       gross_revenue, refund_amount, net_product_revenue,
       platform_subsidy, seller_voucher, co_funded_voucher,
       shipping_net, shipping_return, shipping_failed,
       fee_commission, fee_payment, fee_service,
       fee_affiliate, fee_piship_sfr, fee_handling, fee_ads, fee_total,
       compensation,
       tax_vat, tax_pit, tax_total,
       total_payout, raw_data)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(platform, report_month, file_name) DO UPDATE SET
      r2_key              = excluded.r2_key,
      gross_revenue       = excluded.gross_revenue,
      refund_amount       = excluded.refund_amount,
      net_product_revenue = excluded.net_product_revenue,
      platform_subsidy    = excluded.platform_subsidy,
      seller_voucher      = excluded.seller_voucher,
      co_funded_voucher   = excluded.co_funded_voucher,
      shipping_net        = excluded.shipping_net,
      shipping_return     = excluded.shipping_return,
      shipping_failed     = excluded.shipping_failed,
      fee_commission      = excluded.fee_commission,
      fee_payment         = excluded.fee_payment,
      fee_service         = excluded.fee_service,
      fee_affiliate       = excluded.fee_affiliate,
      fee_piship_sfr      = excluded.fee_piship_sfr,
      fee_handling        = excluded.fee_handling,
      fee_ads             = excluded.fee_ads,
      fee_total           = excluded.fee_total,
      compensation        = excluded.compensation,
      tax_vat             = excluded.tax_vat,
      tax_pit             = excluded.tax_pit,
      tax_total           = excluded.tax_total,
      total_payout        = excluded.total_payout,
      raw_data            = excluded.raw_data
  `).bind(
    platform, shop, report_month, report_type, fileName, r2Key,
    parsed.gross_revenue       || 0,
    parsed.refund_amount       || 0,
    parsed.net_product_revenue || 0,
    parsed.platform_subsidy    || 0,
    parsed.seller_voucher      || 0,
    parsed.co_funded_voucher   || 0,
    parsed.shipping_net        || 0,
    parsed.shipping_return     || 0,
    parsed.shipping_failed     || 0,
    parsed.fee_commission      || 0,
    parsed.fee_payment         || 0,
    parsed.fee_service         || 0,
    parsed.fee_affiliate       || 0,
    parsed.fee_piship_sfr      || 0,
    parsed.fee_handling        || 0,
    parsed.fee_ads             || 0,
    parsed.fee_total           || 0,
    parsed.compensation        || 0,
    parsed.tax_vat             || 0,
    parsed.tax_pit             || 0,
    parsed.tax_total           || 0,
    parsed.total_payout        || 0,
    JSON.stringify(parsed)
  ).run()

  // Nếu là TikTok income và có order_details → lưu phí từng đơn
  if (platform === 'tiktok' && report_type === 'income' && parsedJson) {
    const rawData = JSON.parse(parsedJson)
    await saveTiktokOrderFees(env, rawData, report_month)
  }

  return Response.json({
    status: "ok",
    r2_key: r2Key,
    report_month,
    parsed
  }, { headers: cors })
}

async function getReportSummary(request, env, cors) {
  const url2 = new URL(request.url)
  const month    = url2.searchParams.get("month")    || ""
  const platform = url2.searchParams.get("platform") || ""
  const shop     = url2.searchParams.get("shop")     || ""

  const baseParams = []
  const baseConds  = []
  if (month)    { baseConds.push("report_month = ?"); baseParams.push(month) }
  if (platform) { baseConds.push("platform = ?");     baseParams.push(platform) }
  if (shop) {
    const shopList = shop.split(",").map(s => s.trim()).filter(Boolean)
    if (shopList.length === 1) {
      baseConds.push("shop = ?")
      baseParams.push(shopList[0])
    } else {
      baseConds.push(`shop IN (${shopList.map(() => "?").join(",")})`)
      shopList.forEach(s => baseParams.push(s))
    }
  }

  const baseWhere = baseConds.length ? "AND " + baseConds.join(" AND ") : ""

  // Tổng hợp doanh thu — chỉ từ income
  const row = await env.DB.prepare(`
    SELECT
      SUM(gross_revenue)          AS total_gross_revenue,
      SUM(refund_amount)          AS total_refund,
      SUM(co_funded_voucher)      AS total_co_funded_voucher,
      SUM(fee_commission)         AS total_fee_commission,
      SUM(fee_payment)            AS total_fee_payment,
      SUM(fee_affiliate)          AS total_fee_affiliate,
      SUM(fee_piship_sfr)         AS total_fee_piship,
      SUM(fee_service)            AS total_fee_service,
      SUM(fee_handling)           AS total_fee_handling,
      SUM(COALESCE(fee_ads,0))    AS total_fee_ads_income,
      SUM(fee_total)              AS total_fee_report,
      SUM(tax_total)              AS total_tax_report,
      SUM(total_payout)                  AS total_payout,
      SUM(COALESCE(shipping_net,0))      AS total_shipping_net,
      SUM(COALESCE(shipping_return, 0))  AS total_shipping_return,
      SUM(COALESCE(shipping_failed, 0))  AS total_shipping_failed
    FROM platform_reports
    WHERE report_type = 'income' ${baseWhere}
  `).bind(...baseParams).first()

// Chỉ lấy fee_total từ đúng file phi-dau-thau
  const adsRow = await env.DB.prepare(`
    SELECT SUM(COALESCE(fee_total,0)) AS total_fee_dau_thau
    FROM platform_reports
    WHERE report_type = 'phi-dau-thau' ${baseWhere}
  `).bind(...baseParams).first()

  const total_fee_ads = (row?.total_fee_ads_income || 0)
    + (adsRow?.total_fee_dau_thau || 0)

 // Chi tiết theo từng shop
  const shops = await env.DB.prepare(`
    SELECT
      shop, platform,
      SUM(gross_revenue)  AS gross_revenue,
      SUM(fee_total)      AS fee_total,
      SUM(tax_total)      AS tax_total,
      SUM(total_payout)   AS total_payout
    FROM platform_reports
    WHERE report_type = 'income' ${baseWhere}
    GROUP BY shop, platform
    ORDER BY gross_revenue DESC
  `).bind(...baseParams).all()

  
  return Response.json({
    ...row,
    total_fee_ads,
    total_shipping_failed: row?.total_shipping_failed || 0,
    total_return_shipping:  row?.total_shipping_return  || 0,
    shops: shops.results || []
}, { headers: cors })
}

async function getOperationCosts(request, env, cors) {
  const url3   = new URL(request.url)
  const from   = url3.searchParams.get("from")     || ""
  const to     = url3.searchParams.get("to")       || ""
  const platform = url3.searchParams.get("platform") || ""
  const shop   = url3.searchParams.get("shop")     || ""

  const rows = await env.DB.prepare(`
    SELECT cost_key, cost_value, cost_name, calc_type, platform, shop
    FROM cost_settings
    WHERE cost_key LIKE 'custom_%'
    ORDER BY cost_name
  `).all()

  // Đếm số đơn thành công trong kỳ lọc (để tính per_order)
  const orderConds = ["order_type = 'normal'"]
  const orderParams = []
  if (from)     { orderConds.push("order_date >= ?"); orderParams.push(from) }
  if (to)       { orderConds.push("order_date <= ?"); orderParams.push(to) }
  if (platform) { orderConds.push("platform = ?");   orderParams.push(platform) }
  if (shop)     { orderConds.push("shop = ?");        orderParams.push(shop) }

  const orderRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT order_id) AS total_orders
    FROM orders_v2 WHERE ${orderConds.join(" AND ")}
  `).bind(...orderParams).first()
  const totalOrders = orderRow?.total_orders || 0

  // Tính số tháng trong kỳ
  let months = 1
  if (from && to) {
    const d1 = new Date(from), d2 = new Date(to)
    const diff = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1
    months = Math.max(1, diff)
  }

  // Đếm số shop duy nhất trong kỳ (để chia đều chi phí chung)
  let shopRatio = 1  // mặc định 100% nếu không filter shop
  let totalShops = 1
  if (shop) {
    const allShopConds = ["order_type = 'normal'"]
    const allShopParams = []
    if (from)     { allShopConds.push("order_date >= ?"); allShopParams.push(from) }
    if (to)       { allShopConds.push("order_date <= ?"); allShopParams.push(to) }
    if (platform) { allShopConds.push("platform = ?");   allShopParams.push(platform) }

    const allShopRow = await env.DB.prepare(`
      SELECT COUNT(DISTINCT shop) AS total FROM orders_v2 WHERE order_type = 'normal'
    `).first()

    totalShops = allShopRow?.total || 1
    shopRatio  = 1 / totalShops
  }

  // Đếm tổng đơn TẤT CẢ shop (để tính per_order ratio)
  let totalOrdersAll = totalOrders
  if (shop) {
    const allOrdConds = ["order_type = 'normal'"]
    const allOrdParams = []
    if (from)     { allOrdConds.push("order_date >= ?"); allOrdParams.push(from) }
    if (to)       { allOrdConds.push("order_date <= ?"); allOrdParams.push(to) }
    if (platform) { allOrdConds.push("platform = ?");   allOrdParams.push(platform) }
    const allOrdRow = await env.DB.prepare(`
     SELECT COUNT(DISTINCT order_id) AS total FROM orders_v2 WHERE ${allOrdConds.join(" AND ")}
    `).bind(...allOrdParams).first()
    totalOrdersAll = allOrdRow?.total || 0
  }

  const costs = (rows.results || []).map(c => {
    // Chi phí gán riêng cho shop/sàn cụ thể → chỉ hiện khi đúng filter
    const costHasShop     = c.shop     && c.shop !== ""
    const costHasPlatform = c.platform && c.platform !== ""
    if (costHasPlatform && platform && c.platform !== platform) return null
    if (costHasShop     && shop     && c.shop     !== shop)     return null

    let actualAmount = 0
    let note = ""

    if (costHasShop) {
      // Chi phí gán cho shop cụ thể → tính 100%
      actualAmount = c.calc_type === "per_month"
        ? c.cost_value * months
        : c.cost_value * totalOrders
      note = "riêng shop này"
    } else {
      // Chi phí chung → phân bổ theo tỷ lệ doanh thu (per_month) hoặc số đơn (per_order)
      if (c.calc_type === "per_month") {
        const baseAmount = c.cost_value * months
        actualAmount = shop ? Math.round(baseAmount * shopRatio) : baseAmount
        note = shop
          ? `chia đều ${totalShops} shop`
          : "toàn bộ"
      } else {
        actualAmount = c.cost_value * (shop ? totalOrders : totalOrdersAll)
        note = shop ? `${totalOrders} đơn shop này` : `${totalOrdersAll} đơn tổng`
      }
    }

    return { ...c, actual_amount: actualAmount, total_orders: costHasShop ? totalOrders : totalOrdersAll, months, note, shop_ratio: shopRatio }
  }).filter(Boolean)

  return Response.json({ costs, total_orders: totalOrders, months }, { headers: cors })
}

function fmtNum(n) { return Number(n||0).toLocaleString("vi-VN") }

// ════════════════════════════════════════════════════════════════════
// GET REPORTS — Lấy danh sách báo cáo + số liệu đã parse
// ════════════════════════════════════════════════════════════════════
async function getReports(request, env, cors) {
  const url   = new URL(request.url)
  const month = url.searchParams.get("month") || null
  const platform = url.searchParams.get("platform") || null

  const conds  = ["1=1"]
  const params = []
  if (month)    { conds.push("report_month = ?"); params.push(month) }
  if (platform) { conds.push("platform = ?");     params.push(platform) }

  const rows = await env.DB.prepare(`
    SELECT * FROM platform_reports
    WHERE ${conds.join(" AND ")}
    ORDER BY report_month DESC, platform, report_type
  `).bind(...params).all()

  return Response.json(rows.results, { headers: cors })
}


// ════════════════════════════════════════════════════════════════════
// GET REPORT FILE — Tải file gốc từ R2
// ════════════════════════════════════════════════════════════════════
async function getReportFile(request, env, cors) {
  const url = new URL(request.url)
  const key = url.searchParams.get("key")
  if (!key) return new Response("Missing key", { status: 400, headers: cors })

  const obj = await env.STORAGE.get(key)
  if (!obj) return new Response("File not found", { status: 404, headers: cors })

  const headers = {
    ...cors,
    "Content-Type":        obj.httpMetadata?.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${key.split("/").pop()}"`,
  }
  return new Response(obj.body, { headers })
}

export { uploadReport, getReportSummary, getOperationCosts,
         getReports, getReportFile }