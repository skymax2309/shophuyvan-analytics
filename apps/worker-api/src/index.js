
import { getFilters, buildWhere }        from './utils/filters.js'
import { getCostSettings, calcProfit }   from './utils/db.js'
import { handleProducts, handleCostSettings, handleVariations } from './routes/products.js'
import { exportOrders, recalcCost, importOrdersV2, getOrders, updateOmsStatus } from './routes/orders.js'
import { dashboard, revenueByDay, profitByDay, uniqueSkus,
         topSku, topProduct, topShop, topPlatform,
         cancelStats, priceCalc, topSkuFull } from './routes/dashboard.js'
import { uploadReport, getReportSummary, getOperationCosts,
         getReports, getReportFile }     from './routes/reports.js'
import { createJob, getJobs, updateJob, deleteJob } from './routes/jobs.js'
import { parseInvoiceAI, saveInvoice, listInvoices, getInvoiceFile,
         updateCostPrices, getSkuMap, getSkuGroups, saveSkuGroup,
         updateGroupPrice, deleteSkuGroup, deleteInvoice } from './routes/invoices.js'
import { handlePurchase } from './routes/purchase.js'
import { handleAuth } from './handlers/auth.js' // Chèn Handler mới
		 
export default {
  // ── Tự động chạy mỗi 24h (Cron Trigger) ─────────────────
  async scheduled(event, env, ctx) {
    try {
      // 1. Lấy dữ liệu từ các bảng cốt lõi (bạn có thể thêm orders, products nếu cần)
      const { results: users } = await env.DB.prepare("SELECT * FROM users").all()
      const { results: shops } = await env.DB.prepare("SELECT * FROM shops").all()
      const { results: jobs } = await env.DB.prepare("SELECT * FROM jobs").all()
      
      // 2. Đóng gói dữ liệu
      const backupData = JSON.stringify({
        timestamp: new Date().toISOString(),
        users,
        shops,
        jobs
      })

      // 3. Đặt tên file theo ngày và lưu vào R2
      const dateStr = new Date().toISOString().split('T')[0]
      const fileName = `backups/db-backup-${dateStr}.json`
      
      await env.STORAGE.put(fileName, backupData)
      console.log(`[CRON] Backup thành công: ${fileName}`)
    } catch (error) {
      console.error("[CRON] Lỗi khi backup D1:", error)
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }

    if (request.method === "OPTIONS")
      return new Response("", { headers: cors })

    if (url.pathname === "/favicon.ico")
      return new Response("", { status: 204 })

    if (url.pathname === "/")
      return new Response("ShopHuyVan Profit API v2")

    // ── Cổng VIP: Xử lý Ủy Quyền Shopee/Lazada ─────────────────
    if (url.pathname.startsWith("/api/auth/") || url.pathname.includes("/callback")) {
      return handleAuth(request, env, url)
    }

    try {
		
	// ── Purchase Orders (Nhập hàng Chính ngạch) ───────────────────
      if (url.pathname === "/api/purchase" || url.pathname.startsWith("/api/purchase/")) {
        return handlePurchase(request, env, cors)
      }

// ── Products ──────────────────────────────────────────────────
      if (url.pathname === "/api/products" || 
          url.pathname === "/api/products/promo-prices" || 
          url.pathname === "/api/products/update-promo-prices" ||
          url.pathname === "/api/products/shopee-import" ||
          url.pathname === "/api/products/group-parent" ||
          url.pathname === "/api/products/ungroup-parent" ||
          url.pathname === "/api/products/bulk-import" ||
          url.pathname === "/api/products/shops-warehouse-list" ||
          url.pathname === "/api/products/update-shop-warehouse")
        return handleProducts(request, env, cors)

      if (url.pathname === "/api/sync-variations/bulk" && request.method === "DELETE")
        return handleVariations(request, env, cors)

      if (url.pathname === "/api/sync-variations" || url.pathname === "/api/sync-variations/edit")
        return handleVariations(request, env, cors)

      if (url.pathname === "/api/products/bulk" && request.method === "DELETE") {
        const { skus } = await request.json()
        if (!skus || !Array.isArray(skus) || skus.length === 0)
          return Response.json({ error: "No SKUs" }, { status: 400, headers: cors })
        // Chia batch 50 SKU mỗi lần để tránh giới hạn bind của D1
        const BATCH = 50
        for (let i = 0; i < skus.length; i += BATCH) {
          const chunk = skus.slice(i, i + BATCH)
          const placeholders = chunk.map(() => '?').join(',')
          await env.DB.prepare(`DELETE FROM products WHERE sku IN (${placeholders})`).bind(...chunk).run()
        }
        return Response.json({ status: "ok", count: skus.length }, { headers: cors })
      }

      if (url.pathname.startsWith("/api/products/") && request.method === "DELETE") {
        const sku = decodeURIComponent(url.pathname.replace("/api/products/", ""))
        await env.DB.prepare(`DELETE FROM products WHERE sku = ?`).bind(sku).run()
        return Response.json({ status: "ok" }, { headers: cors })
      }

      // ── Cost Settings ─────────────────────────────────────────────
      if (url.pathname === "/api/cost-settings")
        return handleCostSettings(request, env, cors)

      // ── Import Orders ─────────────────────────────────────────────
      if (url.pathname === "/api/import-orders-v2")
        return importOrdersV2(request, env, cors)

      // 📥 TỰ ĐỘNG IMPORT — Bot gửi file_key sau khi upload R2 xong
      if (url.pathname === "/api/auto-import-trigger" && request.method === "POST") {
        const body = await request.json()
        const { file_key, shop, platform, report_type } = body

        if (!file_key) return new Response("Missing file_key", { status: 400, headers: cors })

        // Lấy file từ R2
        const object = await env.STORAGE.get(file_key)
        if (!object) return new Response("File not found on R2: " + file_key, { status: 404, headers: cors })

        const ext = file_key.split(".").pop().toLowerCase()

// ── NHÁNH 1: Excel đơn hàng ──────────────────────────────────
        // Bot đã parse Excel + gửi JSON lên /api/import-orders-v2 trực tiếp
        // Ở đây chỉ cần lưu file vào platform_reports để hiện trên trang báo cáo
if (ext === "xlsx" || ext === "xls" || report_type === "orders") {
          const buffer = await object.arrayBuffer()
          const fileName = file_key.split("/").pop()

          const formData = new FormData()
          formData.append("file", new Blob([buffer]), fileName)
          formData.append("platform", platform || "shopee")
          formData.append("shop", shop || "")
          formData.append("report_type", report_type || "income")
          // Nếu bot gửi kèm parsed_json thì forward xuống uploadReport
          if (body.parsed_json) formData.append("parsed_json", body.parsed_json)

          const fakeRequest = new Request(url.origin + "/api/upload-report", {
            method: "POST",
            body: formData
          })
          return uploadReport(fakeRequest, env, cors)
        }

// ── NHÁNH 2: PDF Doanh Thu / Hóa Đơn / ADS ──────────────────
        if (ext === "pdf") {
          const fileName = file_key.split("/").pop()
          const arrayBuffer = await object.arrayBuffer()
          const blob = new Blob([arrayBuffer])

          const formData = new FormData()
          formData.append("file", new File([blob], fileName, { type: "application/pdf" }))
          formData.append("platform", platform || "shopee")
          formData.append("shop", shop || "")
          formData.append("report_type", report_type || "income")

          // Nhận pdf_text từ bot (extract trên máy local)
          const pdfText = body.pdf_text || ""
          if (pdfText.length > 50) {
            formData.append("pdf_text", pdfText)

            // Đọc tháng từ nội dung PDF Lazada nếu có
            const mMonth = pdfText.match(/tháng\s+(\d{1,2})\/(\d{4})/i)
            if (mMonth && (platform === "lazada")) {
              const reportMonthOverride = `${mMonth[2]}-${mMonth[1].padStart(2, "0")}`
              formData.append("report_month_override", reportMonthOverride)
            }
          }

          const fakeRequest = new Request(url.origin + "/api/upload-report", { method: "POST", body: formData })
          return uploadReport(fakeRequest, env, cors)
        }

        return new Response("Unsupported file type: " + ext, { status: 400, headers: cors })
      }

      // ── Dashboard (tổng quan) ─────────────────────────────────────
      if (url.pathname === "/api/dashboard")
        return dashboard(request, env, cors)
      if ((url.pathname === "/api/orders/recalc-cost" || url.pathname === "/api/recalc-cost") && request.method === "POST")
        return recalcCost(request, env, cors)
	if (url.pathname === "/api/update-cost-prices" && request.method === "POST")
        return updateCostPrices(request, env, cors)
	if (url.pathname === "/api/sku-map" && request.method === "GET")
        return getSkuMap(request, env, cors)
	if (url.pathname === "/api/sku-groups" && request.method === "GET")
        return getSkuGroups(request, env, cors)
      if (url.pathname === "/api/sku-groups" && request.method === "POST")
        return saveSkuGroup(request, env, cors)
      if (url.pathname === "/api/sku-groups/update-price" && request.method === "POST")
        return updateGroupPrice(request, env, cors)
      if (url.pathname === "/api/sku-groups/delete" && request.method === "POST")
        return deleteSkuGroup(request, env, cors)
	if (url.pathname === "/api/invoices/delete" && request.method === "POST")
        return deleteInvoice(request, env, cors)
      if (url.pathname === "/api/parse-invoice" && request.method === "POST")
        return parseInvoiceAI(request, env, cors)
      if (url.pathname === "/api/save-invoice" && request.method === "POST")
        return saveInvoice(request, env, cors)
      if (url.pathname === "/api/invoices")
        return listInvoices(request, env, cors)
      if (url.pathname === "/api/invoice-file")
        return getInvoiceFile(request, env, cors)

      // ── Doanh thu theo ngày ───────────────────────────────────────
      if (url.pathname === "/api/revenue-by-day")
        return revenueByDay(request, env, cors)

      // ── Lợi nhuận theo ngày ───────────────────────────────────────
      if (url.pathname === "/api/profit-by-day")
        return profitByDay(request, env, cors)

      // ── Top SKU ───────────────────────────────────────────────────
      if (url.pathname === "/api/top-sku")
        return topSku(request, env, cors)

      if (url.pathname === "/api/top-sku-full")
        return topSkuFull(request, env, cors)
	
	if (url.pathname === "/api/unique-skus")
        return uniqueSkus(request, env, cors)

      // ── Top sản phẩm ──────────────────────────────────────────────
      if (url.pathname === "/api/top-product")
        return topProduct(request, env, cors)

// ── Danh sách Shop (Tự động cập nhật 100%) ─────────────────
      if (url.pathname === "/api/shops" && request.method === "GET") {
        try {
          // Lệnh UNION: Vừa lấy từ danh sách khai báo sẵn, VỪA tự động vét các shop mới phát sinh trong dữ liệu đơn hàng
          const { results } = await env.DB.prepare(`
            SELECT shop_name, platform FROM shops
            UNION
            SELECT DISTINCT shop as shop_name, platform FROM orders_v2 WHERE shop IS NOT NULL AND shop != ''
          `).all()
          return Response.json(results, { headers: cors })
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: cors })
        }
      }

      // ── CỔNG VIP: Dành riêng cho Bot Python lấy Token ─────────────────
      if (url.pathname === "/api/shops/tokens" && request.method === "GET") {
        try {
          // Trả về full thông tin bảo mật (chỉ Bot Python gọi vào đây)
          const { results } = await env.DB.prepare("SELECT shop_name, platform, user_name, api_shop_id, access_token, refresh_token FROM shops").all()
          return Response.json(results, { headers: cors })
        } catch (e) {
          console.error("[API TOKENS] Lỗi:", e.message)
          return Response.json({ error: e.message }, { status: 500, headers: cors })
        }
      }

      // [API ĐỒNG BỘ] Cập nhật danh sách Shop từ Tool Python (Source of Truth)
      if (url.pathname === "/api/shops/sync" && request.method === "POST") {
        try {
          const shops = await request.json()
          console.log(`[API SHOPS SYNC] Bắt đầu đồng bộ ${shops.length} shop từ Tool Python lên Server...`)
          
          let inserted = 0, updated = 0
          for (const s of shops) {
            // Lấy đúng trường user_name từ file Python lên
            const userName = s.user_name || s.ten_shop 
            const shopName = s.ten_shop || userName
            const platform = s.platform || "unknown"

            // Kiểm tra xem user_name đã tồn tại chưa
            const existing = await env.DB.prepare("SELECT id FROM shops WHERE user_name = ?").bind(userName).first()
            if (existing) {
              await env.DB.prepare("UPDATE shops SET shop_name = ?, platform = ? WHERE user_name = ?").bind(shopName, platform, userName).run()
              updated++
            } else {
              await env.DB.prepare("INSERT INTO shops (shop_name, platform, user_name) VALUES (?, ?, ?)").bind(shopName, platform, userName).run()
              inserted++
            }
          }
          console.log(`[API SHOPS SYNC] Hoàn tất: Thêm mới ${inserted}, Cập nhật ${updated} shop.`)
          return Response.json({ status: "ok", inserted, updated, message: "Đồng bộ Server thành công!" }, { headers: cors })
        } catch (e) {
          console.error(`[API SHOPS SYNC] Lỗi: ${e.message}`)
          return Response.json({ error: e.message }, { status: 500, headers: cors })
        }
      }

      // ── Top shop ──────────────────────────────────────────────────
      if (url.pathname === "/api/top-shop")
        return topShop(request, env, cors)

      // ── Top sàn ───────────────────────────────────────────────────
      if (url.pathname === "/api/top-platform")
        return topPlatform(request, env, cors)

      // ── Thống kê hủy / hoàn ──────────────────────────────────────
      if (url.pathname === "/api/cancel-stats")
  return cancelStats(request, env, cors)

      if (url.pathname === "/api/orders" && request.method === "GET")
        return getOrders(request, env, cors)

      if (url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/oms-status") && request.method === "PATCH") {
        const orderId = decodeURIComponent(url.pathname.split("/")[3])
        return updateOmsStatus(request, env, cors, orderId)
      }

      // Cập nhật nhiều đơn cùng lúc
      if (url.pathname === "/api/orders/bulk-oms-status" && request.method === "POST") {
        const { order_ids, oms_status } = await request.json()
        if (!order_ids?.length || !oms_status)
          return Response.json({ error: "Missing data" }, { status: 400, headers: cors })
        const stmts = order_ids.map(id =>
          env.DB.prepare(`UPDATE orders_v2 SET oms_status=?, oms_updated_at=datetime('now','+7 hours') WHERE order_id=?`)
            .bind(oms_status, id)
        )
        await env.DB.batch(stmts)
        return Response.json({ status: "ok", updated: order_ids.length }, { headers: cors })
      }

      // [API MỚI] Xóa hàng loạt đơn hàng lỗi (Dùng cho Tool Python oms_clean_unmapped_orders)
      if (url.pathname === "/api/orders/bulk-delete" && request.method === "POST") {
        try {
          const { order_ids } = await request.json()
          if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
            console.error("[BULK DELETE] Lỗi: Không nhận được danh sách order_ids");
            return Response.json({ error: "Missing order_ids" }, { status: 400, headers: cors })
          }
          
          const BATCH = 50 // Chia nhỏ để không vượt quá giới hạn D1
          for (let i = 0; i < order_ids.length; i += BATCH) {
            const chunk = order_ids.slice(i, i + BATCH)
            const placeholders = chunk.map(() => '?').join(',')
            
            // Xóa items trước, sau đó xóa order gốc (Đảm bảo toàn vẹn dữ liệu)
            await env.DB.prepare(`DELETE FROM order_items WHERE order_id IN (${placeholders})`).bind(...chunk).run()
            await env.DB.prepare(`DELETE FROM orders_v2 WHERE order_id IN (${placeholders})`).bind(...chunk).run()
          }
          
          console.log(`[BULK DELETE] Đã xóa thành công ${order_ids.length} đơn hàng lỗi khỏi Database.`)
          return Response.json({ status: "ok", count: order_ids.length }, { headers: cors })
        } catch (e) {
          console.error(`[BULK DELETE] Lỗi Server: ${e.message}`);
          return Response.json({ error: e.message }, { status: 500, headers: cors })
        }
      }
	  
      // [API DÒ MÌN] Lấy danh sách trạng thái thực tế trong Database để chuẩn hóa
      if (url.pathname === "/api/orders/debug-status" && request.method === "GET") {
        try {
          const { results } = await env.DB.prepare(`
            SELECT DISTINCT platform, order_type, shipping_status 
            FROM orders_v2 
            WHERE oms_status = 'PENDING'
          `).all()
          return Response.json({ total_distinct: results.length, data: results }, { headers: cors })
        } catch (e) {
          return Response.json({ error: e.message }, { headers: cors })
        }
      }

      // [BỌC THÉP] API CHUẨN HÓA TRẠNG THÁI ĐƠN LỊCH SỬ (PHIÊN BẢN VÉT MÁNG THÔNG MINH)
      if (url.pathname === "/api/orders/archive-old" && request.method === "POST") {
        // 1. Xử lý các đơn Đã Hủy / Hoàn Trả (Dựa vào order_type)
        await env.DB.prepare(`UPDATE orders_v2 SET oms_status='RETURN_REFUND' WHERE order_type='return' AND oms_status='PENDING'`).run()
        await env.DB.prepare(`UPDATE orders_v2 SET oms_status='CANCELLED_TRANSIT' WHERE order_type='cancel' AND oms_status='PENDING'`).run()
        
        // 2. Dùng LIKE để dò đúng từ khóa của Shopee/Lazada
        // 2.1 Hoàn thành
        await env.DB.prepare(`UPDATE orders_v2 SET oms_status='COMPLETED' WHERE shipping_status LIKE '%Người mua xác nhận%' AND oms_status='PENDING'`).run()
        // 2.2 Giao cho shipper
        await env.DB.prepare(`UPDATE orders_v2 SET oms_status='HANDED_OVER' WHERE shipping_status LIKE '%Đang giao%' AND oms_status='PENDING'`).run()
        // 2.3 Đã đóng gói
        await env.DB.prepare(`UPDATE orders_v2 SET oms_status='PACKED' WHERE (shipping_status LIKE '%Chờ giao hàng%' OR shipping_status LIKE '%Chờ lấy hàng%') AND oms_status='PENDING'`).run()
        
        // 3. LỆNH VÉT MÁNG: Quét sạch sành sanh các đơn từ hôm qua trở về trước (Dọn luôn đám TikTok rỗng) vào Hoàn thành
        await env.DB.prepare(`UPDATE orders_v2 SET oms_status='COMPLETED' WHERE oms_status='PENDING' AND date(order_date) <= date('now', '-1 day')`).run()
        
        return Response.json({ status: "ok" }, { headers: cors })
      }
	  // [API BẢO TRÌ] ĐỒNG BỘ TÊN SHOP CŨ THÀNH USERNAME MỚI (BẢN VÉT MÁNG)
      if (url.pathname === "/api/fix-shop-names" && request.method === "GET") {
        try {
          // Bác điền các cặp Tên Cũ -> Username Mới vào đây
          const shopMapping = {
            "KHOGIADUNGHUYVAN": "chihuy1984", // Ví dụ, bác sửa lại cho đúng username của shop này nhé
            "shophuyvan.vn": "chihuy2309",             // Ví dụ
            "Huy Vân Store Q.Bình Tân": "phambich2312",        // Ví dụ
            "khogiadungcona": "khogiadungcona"         // Ví dụ
          };

          let updated = 0;
          for (const [oldName, newName] of Object.entries(shopMapping)) {
            if (oldName !== newName) {
                const res = await env.DB.prepare(`UPDATE orders_v2 SET shop = ? WHERE shop = ?`).bind(newName, oldName).run();
                updated += res.meta.changes || 0;
            }
          }
          
          return Response.json({ status: "ok", message: `Quá đã! Đã gộp thành công ${updated} đơn hàng lịch sử về Username!` }, { headers: cors })
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: cors })
        }
      }

      // [BỌC THÉP] API ĐẾM TỔNG SỐ ĐƠN TUYỆT ĐỐI (KHÔNG NHẢY MÚA THEO TRANG)
      if (url.pathname === "/api/orders/badges" && request.method === "GET") {
        try {
          const { results: sCount } = await env.DB.prepare(`SELECT oms_status, COUNT(*) as c FROM orders_v2 GROUP BY oms_status`).all()
          const { results: tCount } = await env.DB.prepare(`SELECT order_type, COUNT(*) as c FROM orders_v2 GROUP BY order_type`).all()
          const { results: pCount } = await env.DB.prepare(`SELECT platform, COUNT(*) as c FROM orders_v2 GROUP BY platform`).all()
          const { results: allCount } = await env.DB.prepare(`SELECT COUNT(*) as c FROM orders_v2`).all()

          const badges = { ALL: allCount[0]?.c || 0 }
          sCount.forEach(r => badges[r.oms_status || 'PENDING'] = r.c)
          tCount.forEach(r => badges[r.order_type || 'normal'] = r.c)
          pCount.forEach(r => badges[r.platform || 'shopee'] = r.c)

          return Response.json(badges, { headers: cors })
        } catch (e) {
          return Response.json({ error: e.message }, { headers: cors })
        }
      }

      if (url.pathname === "/api/export-orders")
        return exportOrders(request, env, cors)

      // ── Máy tính giá bán ─────────────────────────────────────────
      if (url.pathname === "/api/price-calc")
        return priceCalc(request, env, cors)

      if (url.pathname === "/api/upload-report")
        return uploadReport(request, env, cors)

      if (url.pathname === "/api/reports")
        return getReports(request, env, cors)

      if (url.pathname === "/api/report-summary")
        return getReportSummary(request, env, cors)

      if (url.pathname === "/api/operation-costs")
        return getOperationCosts(request, env, cors)

      if (url.pathname.startsWith("/api/reports/") && request.method === "DELETE") {
        const id = url.pathname.replace("/api/reports/", "")
        const { r2_key } = await request.json()
        await env.DB.prepare(`DELETE FROM platform_reports WHERE id = ?`).bind(id).run()
        if (r2_key) await env.STORAGE.delete(r2_key)
        return Response.json({ status: "ok" }, { headers: cors })
      }

      if (url.pathname === "/api/report-file")
        return getReportFile(request, env, cors)
	// ── Jobs (Automation Bot) ─────────────────────────────
      if (url.pathname === "/api/jobs" && request.method === "POST")
        return createJob(request, env, cors)
      
      if (url.pathname === "/api/jobs" && request.method === "GET")
        return getJobs(request, env, cors)
      
      if (url.pathname.startsWith("/api/jobs/") && request.method === "PATCH") {
        const id = url.pathname.split("/")[3]
        return updateJob(request, env, cors, id)
      }

      if (url.pathname.startsWith("/api/jobs/") && request.method === "DELETE") {
        const id = url.pathname.split("/")[3]
        return deleteJob(request, env, cors, id)
      }

      // ── R2 Upload Helper (Bot xin quyền Upload) ──────────
      if (url.pathname === "/api/upload-url" && request.method === "GET") {
        const fileName = url.searchParams.get("file")
        if (!fileName) return new Response("Missing file param", { status: 400, headers: cors })

        // Tạo một token đơn giản để bot có thể upload trong vòng 15 phút
        // Trong SaaS thực tế, bạn có thể dùng JWT hoặc HMAC ở đây
        const uploadUrl = `${url.origin}/api/upload?file=${encodeURIComponent(fileName)}&token=huyvan_secret_2026`

        return Response.json({ uploadUrl }, { headers: cors })
      }

// Route nhận file thực tế từ Bot và lưu vào R2
      if (url.pathname === "/api/upload" && request.method === "PUT") {
        const fileName = url.searchParams.get("file")
        const token = url.searchParams.get("token")

        if (token !== "huyvan_secret_2026") return new Response("Unauthorized", { status: 401 })
        
        const fileData = await request.arrayBuffer()
        await env.STORAGE.put(fileName, fileData)
        
        return new Response("OK", { headers: cors })
      }

      // ── API MỚI: XEM VÀ TẢI LẠI PHIẾU IN (LABELS) ──────────
      if (url.pathname.startsWith("/api/label/") && request.method === "GET") {
        const orderId = url.pathname.replace("/api/label/", "").replace(".pdf", "");
        const fileName = `labels/${orderId}.pdf`;
        const object = await env.STORAGE.get(fileName);
        
        if (!object) {
          return new Response("<h2 style='font-family:sans-serif; text-align:center; color:#ef4444; margin-top:50px;'>Phiếu in chưa được tải lên hoặc đơn hàng chưa được xử lý!</h2>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", ...cors } });
        }
        
        const headers = new Headers(cors);
        headers.set("Content-Type", "application/pdf");
        headers.set("Content-Disposition", `inline; filename="${orderId}.pdf"`); 
        
        return new Response(object.body, { headers });
      }

      // ── API MỚI: Trả về file ảnh để Frontend hiển thị ──────────
      if (url.pathname.startsWith("/api/file/") && request.method === "GET") {
        const fileName = decodeURIComponent(url.pathname.replace("/api/file/", ""))
        if (!fileName) return new Response("Missing file name", { status: 400, headers: cors })

        const object = await env.STORAGE.get(fileName)
        if (!object) return new Response("File not found", { status: 404, headers: cors })

        // Đoán Content-Type từ đuôi file
        let cType = "image/jpeg"
        if (fileName.toLowerCase().endsWith(".png")) cType = "image/png"
        if (fileName.toLowerCase().endsWith(".webp")) cType = "image/webp"

        const headers = {
          ...cors,
          "Content-Type": object.httpMetadata?.contentType || cType,
          "Cache-Control": "public, max-age=31536000" // Lưu cache ảnh 1 năm cho mượt
        }
        return new Response(object.body, { headers })
      }

      return new Response("Not found", { status: 404, headers: cors })

    } catch (e) {
      return new Response(e.toString(), { status: 500, headers: cors })
    }
  }
}

