function scanBridgeJson(payload, cors = {}, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      ...cors,
      'Cache-Control': 'no-store',
      ...(init.headers || {})
    }
  })
}

function routeWriteToken(request, headerName = 'X-Local-Runner-Token') {
  const url = new URL(request.url)
  return String(request.headers.get(headerName) || url.searchParams.get('token') || '').trim()
}

async function hasRouteWriteAccess(request, env, getAdminUserFromRequest, envKey, headerName) {
  const expected = String(env?.[envKey] || '').trim()
  const token = routeWriteToken(request, headerName)
  if (expected && token && token === expected) return true
  if (typeof getAdminUserFromRequest === 'function') {
    return Boolean(await getAdminUserFromRequest(request, env))
  }
  return false
}

async function ensureScanBridgeSessionsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS scan_bridge_sessions (
      session_id TEXT PRIMARY KEY,
      purpose TEXT DEFAULT 'oms_scan',
      status TEXT DEFAULT 'waiting_phone',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      connected_at TEXT DEFAULT '',
      scanned_at TEXT DEFAULT '',
      scan_code TEXT DEFAULT '',
      scan_payload TEXT DEFAULT '',
      result_json TEXT DEFAULT '',
      last_error TEXT DEFAULT ''
    )
  `).run()
}

function buildPhoneScannerUrl(request, sessionId) {
  const origin = request.headers.get('Origin') || 'https://shophuyvan-analytics.nghiemchihuy.workers.dev'
  return `${origin.replace(/\/$/, '')}/pages/scan-qr.html?role=phone&session_id=${encodeURIComponent(sessionId)}`
}

function scanBridgeSessionId() {
  const fallback = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `scan_${globalThis.crypto?.randomUUID?.() || fallback}`.replace(/[^a-zA-Z0-9_-]/g, '')
}

async function loadScanBridgeSession(env, sessionId) {
  const row = await env.DB.prepare(`
    SELECT *
    FROM scan_bridge_sessions
    WHERE session_id = ?
    LIMIT 1
  `).bind(sessionId).first()
  if (!row) return null
  const expired = row.expires_at && Date.parse(row.expires_at) < Date.now()
  let result = null
  try {
    result = row.result_json ? JSON.parse(row.result_json) : null
  } catch {
    result = null
  }
  return {
    ...row,
    expired,
    status: expired && row.status !== 'scanned' ? 'scanner_session_expired' : row.status,
    result
  }
}

async function handleScanBridgeRoutes(request, env, cors, url, handlePackingScanOrder) {
  await ensureScanBridgeSessionsTable(env)

  if (url.pathname === '/api/scan-bridge/session' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const sessionId = scanBridgeSessionId()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await env.DB.prepare(`
      DELETE FROM scan_bridge_sessions
      WHERE expires_at < ?
    `).bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).run().catch(() => null)
    await env.DB.prepare(`
      INSERT INTO scan_bridge_sessions (session_id, purpose, status, expires_at)
      VALUES (?, ?, 'waiting_phone', ?)
    `).bind(sessionId, body.purpose || 'oms_scan', expiresAt).run()
    return scanBridgeJson({
      status: 'ok',
      session_id: sessionId,
      scanner_url: buildPhoneScannerUrl(request, sessionId),
      expires_at: expiresAt
    }, cors)
  }

  const match = url.pathname.match(/^\/api\/scan-bridge\/session\/([^/]+)(?:\/(connect|result))?$/)
  if (!match) return null

  const sessionId = decodeURIComponent(match[1])
  const action = match[2] || 'status'
  const session = await loadScanBridgeSession(env, sessionId)
  if (!session) {
    return scanBridgeJson({ status: 'error', error: 'scanner_session_not_found' }, cors, { status: 404 })
  }
  if (session.expired && action !== 'status') {
    return scanBridgeJson({ status: 'error', error: 'scanner_session_expired', session }, cors, { status: 410 })
  }

  if (action === 'connect' && request.method === 'POST') {
    await env.DB.prepare(`
      UPDATE scan_bridge_sessions
      SET status = CASE WHEN status = 'scanned' THEN status ELSE 'phone_connected' END,
          connected_at = COALESCE(NULLIF(connected_at, ''), CURRENT_TIMESTAMP)
      WHERE session_id = ?
    `).bind(sessionId).run()
    return scanBridgeJson({ status: 'ok', session: await loadScanBridgeSession(env, sessionId) }, cors)
  }

  if (action === 'result' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}))
    const code = String(body.code || body.scan_code || '').trim()
    if (!code) return scanBridgeJson({ status: 'error', error: 'scan_code_missing' }, cors, { status: 400 })

    // Scan bridge chỉ tra cứu đơn/tem/video để PC xác nhận bước sau, không tự gọi giao/hủy/hoàn.
    const lookupRequest = new Request(`${url.origin}/api/cctv/scan-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, source: 'phone_scanner_bridge', session_id: sessionId })
    })
    const lookupResponse = await handlePackingScanOrder(lookupRequest, env, cors)
    const lookup = await lookupResponse.json().catch(() => ({ status: 'error', error: 'scan_lookup_failed' }))
    await env.DB.prepare(`
      UPDATE scan_bridge_sessions
      SET status = 'scanned',
          scanned_at = CURRENT_TIMESTAMP,
          scan_code = ?,
          scan_payload = ?,
          result_json = ?,
          last_error = ?
      WHERE session_id = ?
    `).bind(
      code,
      JSON.stringify({ source: 'phone_scanner_bridge' }).slice(0, 2000),
      JSON.stringify(lookup).slice(0, 20000),
      lookup?.status === 'error' ? String(lookup.error || 'scan_lookup_failed') : '',
      sessionId
    ).run()
    return scanBridgeJson({ status: 'ok', session: await loadScanBridgeSession(env, sessionId) }, cors)
  }

  if (action === 'status' && request.method === 'GET') {
    return scanBridgeJson({ status: 'ok', session }, cors)
  }

  return scanBridgeJson({ status: 'error', error: 'method_not_allowed' }, cors, { status: 405 })
}

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
    exportOrders,
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
    backfillEligibleLabels,
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
    const uploadToken = String(env.SHV_LOCAL_RUNNER_TOKEN || '').trim()
    if (!uploadToken) {
      return Response.json({ error: 'local_runner_upload_token_missing' }, { status: 503, headers: cors })
    }

    // Tạo một token đơn giản để bot có thể upload trong vòng 15 phút
    // Trong SaaS thực tế, bạn có thể dùng JWT hoặc HMAC ở đây
    const uploadUrl = `${url.origin}/api/upload?file=${encodeURIComponent(fileName)}&token=${encodeURIComponent(uploadToken)}`

    return Response.json({ uploadUrl }, { headers: cors })
  }

// Route nhận file thực tế từ Bot và lưu vào R2
  if (url.pathname === "/api/upload" && request.method === "PUT") {
    const fileName = url.searchParams.get("file")
    if (!(await hasRouteWriteAccess(request, env, getAdminUserFromRequest, 'SHV_LOCAL_RUNNER_TOKEN', 'X-Local-Runner-Token'))) {
      return new Response("Unauthorized", { status: 401, headers: cors })
    }
    
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

  if ((url.pathname === "/api/label/backfill-eligible" || url.pathname === "/api/label/retry-failed") && request.method === "POST") {
    return backfillEligibleLabels(request, env, cors)
  }

  if (url.pathname.startsWith("/api/labels/refresh/") && request.method === "POST") {
    return Response.json({
      error: 'legacy_label_refresh_route_disabled',
      message: 'Route tải tem cũ đã bị cắt khỏi runtime. Dùng POST /api/label/:orderId/refresh nếu cần thao tác tải tem có kiểm soát.'
    }, { status: 410, headers: cors })
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
      if (!(await hasRouteWriteAccess(request, env, getAdminUserFromRequest, 'CCTV_UPLOAD_TOKEN', 'X-CCTV-Upload-Token'))) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors })
      }
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

  if (url.pathname === "/api/scan-bridge/session" || url.pathname.startsWith("/api/scan-bridge/session/")) {
    return handleScanBridgeRoutes(request, env, cors, url, handlePackingScanOrder)
  }

// ── API MỚI: TRẠM MẮT THẦN LÊN MÂY (R2 + D1) ──────────
  // 1. Nhận Video chuẩn MP4 từ PC và lưu vào R2
  if (url.pathname === "/api/cctv/scan-order" && (request.method === "GET" || request.method === "POST")) {
    return handlePackingScanOrder(request, env, cors)
  }

  if (url.pathname === "/api/cctv/upload" && request.method === "POST") {
    try {
      if (!(await hasRouteWriteAccess(request, env, getAdminUserFromRequest, 'CCTV_UPLOAD_TOKEN', 'X-CCTV-Upload-Token'))) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors })
      }
      await ensurePackingVideosTable(env)
      const formData = await request.formData();
      const orderId = formData.get("order_id");
      const videoFile = formData.get("video");

      if (!orderId || !videoFile) {
        return Response.json({ error: "Missing data" }, { status: 400, headers: cors });
      }

      // Trích xuất đuôi file chuẩn do PC gửi lên (MP4)
      const contentType = String(videoFile.type || "").toLowerCase();
      if (!["video/mp4", "video/webm"].includes(contentType)) {
        return Response.json({ error: "invalid_video_mime" }, { status: 415, headers: cors });
      }
      if (Number(videoFile.size || 0) > 250 * 1024 * 1024) {
        return Response.json({ error: "video_too_large" }, { status: 413, headers: cors });
      }
      const ext = contentType === "video/mp4" ? "mp4" : "webm";
      
      const timestamp = Date.now();
      const fileName = `packing_videos/${orderId}_${timestamp}.${ext}`;
      const videoBuffer = await videoFile.arrayBuffer();

      // Lưu vào Kho R2
      await env.STORAGE.put(fileName, videoBuffer, { httpMetadata: { contentType } });

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
