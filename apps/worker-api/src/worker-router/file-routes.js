export async function handleFileWorkerRoutes(request, env, ctx, cors, url, deps) {
  const {
    handlePurchase,
    handleShopsWarehouse,
    handleProducts,
    handleVariations,
    handleCostSettings,
    importOrdersV2,
    handleApiOrderSync,
    handleApiStatusSync,
    handleApiProductSync,
    handleAdvancedApiFeatures,
    handleAdvancedModules,
    handleChat,
    handleVideo,
    handleAds,
    handleIncome,
    handleOrderAnalytics,
    handleReturns,
    handleReviews,
    handleTopPicks,
    handleDiscounts,
    handleOperations,
    handleLogisticsWatch,
    handleShopeeMarketplaceWebhook,
    handleLazadaMarketplaceWebhook,
    handleWebhookEventsStatus,
    handleWebhookSyncQueue,
    syncApiOrders,
    syncApiOrderStatuses,
    syncAdsCampaignSnapshots,
    syncLazadaReverseOrders,
    syncShopeeReturns,
    dashboard,
    revenueByDay,
    profitByDay,
    uniqueSkus,
    topSku,
    topSkuFull,
    topProduct,
    topShop,
    topPlatform,
    cancelStats,
    priceCalc,
    getCostSettings,
    calcProfit,
    getFilters,
    buildWhere,
    getApiShops,
    buildPublicShopRows,
    recalcCost,
    cleanupOrderFeePhase1,
    updateCostPrices,
    getSkuMap,
    getSkuGroups,
    saveSkuGroup,
    updateGroupPrice,
    deleteSkuGroup,
    deleteInvoice,
    parseInvoiceLocal,
    saveInvoice,
    listInvoices,
    getInvoiceFile,
    getOrders,
    getOrderFilterOptions,
    getOrderChanges,
    normalizeOrderWorkflowStatuses,
    handleBuyerCancellationDecision,
    updateOmsStatus,
    normalizeOmsStatusPair,
    handleCustomerRisk,
    uploadReport,
    getReports,
    getReportSummary,
    getOperationCosts,
    getReportFile,
    createJob,
    getJobs,
    updateJob,
    deleteJob,
    handleBotSettings,
    getLabelStatus,
    refreshOrderLabel,
    getOrderLabel,
    recordLabelFile,
    getAdminUserFromRequest,
    cleanText,
    ensurePackingVideosTable,
    ensureOrderLabelsReadTable,
    handlePackingScanOrder,
    isValidLabelObject,
    ACTIVE_PENDING_OPERATIONAL_STATUSES,
    ACTIVE_PENDING_ORDER_WINDOW_DAYS,
    isStaleOperationalPendingOrder,
    orderStatusParent,
    orderTypeFromStatus
  } = deps

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

  if (url.pathname === "/api/bot/settings" && (request.method === "GET" || request.method === "POST")) {
    return handleBotSettings(request, env, cors)
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
    await env.STORAGE.put(fileName, fileData, { httpMetadata: { contentType: request.headers.get("Content-Type") || "application/octet-stream" } })
    if (fileName?.toLowerCase().startsWith("labels/")) {
      await recordLabelFile(env, {
        storageKey: fileName,
        contentType: request.headers.get("Content-Type") || "",
        source: "bot-upload",
        sizeBytes: fileData.byteLength
      }).catch(error => console.error("[LABEL_UPLOAD_RECORD]", error.message))
    }
    
    return new Response("OK", { headers: cors })
  }

  // ── API MỚI: XEM VÀ TẢI LẠI PHIẾU IN (LABELS) ──────────
  if (url.pathname === "/api/labels/status" && request.method === "GET") {
    return getLabelStatus(request, env, cors)
  }

  if (url.pathname.startsWith("/api/label/") && url.pathname.endsWith("/refresh") && request.method === "POST") {
    const orderId = decodeURIComponent(url.pathname.replace("/api/label/", "").replace(/\/refresh$/, ""))
    return refreshOrderLabel(request, env, cors, orderId)
  }

  if (url.pathname.startsWith("/api/label/") && request.method === "GET") {
    return getOrderLabel(request, env, cors)
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
    if (fileName.toLowerCase().endsWith(".webm")) cType = "video/webm"
    if (fileName.toLowerCase().endsWith(".mp4")) cType = "video/mp4"

    const headers = {
      ...cors,
      "Content-Type": object.httpMetadata?.contentType || cType,
      "Cache-Control": "public, max-age=31536000" // Lưu cache ảnh 1 năm cho mượt
    }
    return new Response(object.body, { headers })
  }
	  
// ── BẢNG TỌA ĐỘ TRẠM PC (HẦM TUNNEL) ──────────
  if (url.pathname === "/api/cctv-config") {
    if (request.method === "POST") {
      const body = await request.json();
      const tunnelUrl = body.ngrok_url || body.url; 
      if (!tunnelUrl) return Response.json({ error: "Missing url" }, { status: 400, headers: cors });
      // Ghi tọa độ PC vào Database
      await env.DB.prepare(`INSERT INTO app_config (key, value) VALUES ('cctv_url', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(tunnelUrl).run();
      return Response.json({ status: "ok" }, { headers: cors });
    }
    if (request.method === "GET") {
      // Trả tọa độ cho iPhone/iPad
      const config = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'cctv_url'").first();
      return Response.json({ url: config?.value || null }, { headers: cors });
    }
  }

// ── API MỚI: TRẠM MẮT THẦN LÊN MÂY (R2 + D1) ──────────
  // 1. Nhận Video chuẩn MP4 từ PC và lưu vào R2
  if (url.pathname === "/api/cctv/scan-order" && (request.method === "GET" || request.method === "POST")) {
    return handlePackingScanOrder(request, env, cors)
  }

  if (url.pathname === "/api/cctv/upload" && request.method === "POST") {
    try {
      await ensurePackingVideosTable(env)
      const formData = await request.formData();
      const orderId = formData.get("order_id");
      const videoFile = formData.get("video");

      if (!orderId || !videoFile) {
        return Response.json({ error: "Missing data" }, { status: 400, headers: cors });
      }

      // Trích xuất đuôi file chuẩn do PC gửi lên (MP4)
      const originalName = videoFile.name || "video.mp4";
      const ext = originalName.split('.').pop();
      
      const timestamp = Date.now();
      const fileName = `packing_videos/${orderId}_${timestamp}.${ext}`;
      const videoBuffer = await videoFile.arrayBuffer();

      // Lưu vào Kho R2
      await env.STORAGE.put(fileName, videoBuffer);

      // Ghi sổ Video D1
      await env.DB.prepare(`
        INSERT INTO packing_videos (order_id, video_url) 
        VALUES (?, ?)
      `).bind(orderId, fileName).run();

      // [QUAN TRỌNG]: Tự động chuyển trạng thái đơn hàng thành "ĐÃ ĐÓNG GÓI" (Chuẩn 2 tầng)
      await env.DB.prepare(`
        UPDATE orders_v2 
        SET oms_status = 'PENDING', shipping_status = 'LOGISTICS_PACKAGED', oms_updated_at = datetime('now', '+7 hours') 
        WHERE order_id = ?
      `).bind(orderId).run();

      return Response.json({ status: "ok", fileName }, { headers: cors });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: cors });
    }
  }

  // 2. Tra cứu Video theo Mã Vận Đơn
  if (url.pathname === "/api/cctv/videos" && request.method === "GET") {
    try {
      await ensurePackingVideosTable(env)
      await ensureOrderLabelsReadTable(env)
      const search = url.searchParams.get("search") || "";
      let query = `
        SELECT pv.*, o.platform, o.shop, o.oms_status, o.shipping_status, o.tracking_number,
               ol.storage_key AS label_storage_key, ol.error AS label_error
        FROM packing_videos pv
        LEFT JOIN orders_v2 o ON o.order_id = pv.order_id
        LEFT JOIN order_labels ol ON ol.order_id = pv.order_id
        ORDER BY datetime(pv.created_at) DESC, pv.id DESC
        LIMIT 50
      `;
      let params = [];

      if (search) {
        query = `
          SELECT pv.*, o.platform, o.shop, o.oms_status, o.shipping_status, o.tracking_number,
                 ol.storage_key AS label_storage_key, ol.error AS label_error
          FROM packing_videos pv
          LEFT JOIN orders_v2 o ON o.order_id = pv.order_id
          LEFT JOIN order_labels ol ON ol.order_id = pv.order_id
          WHERE pv.order_id LIKE ?
             OR o.tracking_number LIKE ?
          ORDER BY datetime(pv.created_at) DESC, pv.id DESC
          LIMIT 50
        `;
        params = [`%${search}%`, `%${search}%`];
      }

      const { results } = await env.DB.prepare(query).bind(...params).all();
      return Response.json(results, { headers: cors });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: cors });
    }
  }
  return null
}
