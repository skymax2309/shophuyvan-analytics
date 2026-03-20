
import { getFilters, buildWhere }        from './utils/filters.js'
import { getCostSettings, calcProfit }   from './utils/db.js'
import { handleProducts, handleCostSettings } from './routes/products.js'
import { importOrders, exportOrders, recalcCost, importOrdersV2 } from './routes/orders.js'
import { dashboard, revenueByDay, profitByDay, uniqueSkus,
         topSku, topProduct, topShop, topPlatform,
         cancelStats, priceCalc, topSkuFull } from './routes/dashboard.js'
import { uploadReport, getReportSummary, getOperationCosts,
         getReports, getReportFile }     from './routes/reports.js'
import { createJob, getJobs, updateJob, deleteJob } from './routes/jobs.js'
import { parseInvoiceAI, saveInvoice, listInvoices, getInvoiceFile,
         updateCostPrices, getSkuMap, getSkuGroups, saveSkuGroup,
         updateGroupPrice, deleteSkuGroup, deleteInvoice } from './routes/invoices.js'
		 
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
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }

    if (request.method === "OPTIONS")
      return new Response("", { headers: cors })

    if (url.pathname === "/favicon.ico")
      return new Response("", { status: 204 })

    if (url.pathname === "/")
      return new Response("ShopHuyVan Profit API v2")

    try {

      // ── Products ──────────────────────────────────────────────────
      if (url.pathname === "/api/products")
        return handleProducts(request, env, cors)

      if (url.pathname.startsWith("/api/products/") && request.method === "DELETE") {
        const sku = decodeURIComponent(url.pathname.replace("/api/products/", ""))
        await env.DB.prepare(`DELETE FROM products WHERE sku = ?`).bind(sku).run()
        return Response.json({ status: "ok" }, { headers: cors })
      }

      // ── Cost Settings ─────────────────────────────────────────────
      if (url.pathname === "/api/cost-settings")
        return handleCostSettings(request, env, cors)

      // ── Import Orders ─────────────────────────────────────────────
      if (url.pathname === "/api/import-orders")
        return importOrders(request, env, cors)

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
          formData.append("report_type", "orders")

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
          if (body.pdf_text && body.pdf_text.length > 50) {
            formData.append("pdf_text", body.pdf_text)
          }

          const fakeRequest = new Request(url.origin + "/api/upload-report", { method: "POST", body: formData })
          return uploadReport(fakeRequest, env, cors)
        }

        return new Response("Unsupported file type: " + ext, { status: 400, headers: cors })
      }

      // ── Dashboard (tổng quan) ─────────────────────────────────────
      if (url.pathname === "/api/dashboard")
        return dashboard(request, env, cors)
      if (url.pathname === "/api/recalc-cost" && request.method === "POST")
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

      // ── Top shop ──────────────────────────────────────────────────
      if (url.pathname === "/api/top-shop")
        return topShop(request, env, cors)

      // ── Top sàn ───────────────────────────────────────────────────
      if (url.pathname === "/api/top-platform")
        return topPlatform(request, env, cors)

      // ── Thống kê hủy / hoàn ──────────────────────────────────────
      if (url.pathname === "/api/cancel-stats")
  return cancelStats(request, env, cors)

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

      return new Response("Not found", { status: 404, headers: cors })

    } catch (e) {
      return new Response(e.toString(), { status: 500, headers: cors })
    }
  }
}

