export async function handleDashboardWorkerRoutes(request, env, ctx, cors, url, deps) {
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

  if (url.pathname === "/api/dashboard")
    return dashboard(request, env, cors)
  if ((url.pathname === "/api/orders/recalc-cost" || url.pathname === "/api/recalc-cost") && request.method === "POST")
    return recalcCost(request, env, cors)
  if (url.pathname === "/api/orders/cleanup-fee-phase1" && request.method === "POST")
    return cleanupOrderFeePhase1(request, env, cors)
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
    return parseInvoiceLocal(request, env, cors)
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
      const { results: shopRows } = await env.DB.prepare(`
        SELECT shop_name, user_name, api_shop_id, LOWER(TRIM(platform)) AS platform
        FROM shops
        WHERE COALESCE(NULLIF(TRIM(shop_name), ''), NULLIF(TRIM(user_name), ''), NULLIF(TRIM(api_shop_id), '')) IS NOT NULL
      `).all()
      const { results: orderRows } = await env.DB.prepare(`
        SELECT DISTINCT TRIM(shop) AS shop_name, LOWER(TRIM(platform)) AS platform
        FROM orders_v2
        WHERE shop IS NOT NULL AND TRIM(shop) != ''
      `).all()
      // NEO: Bộ lọc shop chỉ hiện tên vận hành thật; dòng kỹ thuật dạng "Shopee 166563639" vẫn giữ token trong DB nhưng không đưa lên UI.
      return Response.json(buildPublicShopRows(shopRows || [], orderRows || []), { headers: cors })
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: cors })
    }
  }

// ── CỔNG VIP: Dành riêng cho Bot Python lấy Token ─────────────────
  if (url.pathname === "/api/shops/tokens" && request.method === "GET") {
    try {
      // Trả về full thông tin bảo mật (chỉ Bot Python gọi vào đây)
      const { results } = await env.DB.prepare(`
        SELECT shop_name, platform, user_name, api_shop_id, api_partner_id, api_partner_key, access_token, refresh_token
        FROM shops
        ORDER BY CASE WHEN shop_name LIKE 'Shopee %' AND user_name = api_shop_id THEN 1 ELSE 0 END, shop_name
      `).all()
      return Response.json(results, { headers: cors })
    } catch (e) {
      console.error("[API TOKENS] Lỗi:", e.message)
      return Response.json({ error: e.message }, { status: 500, headers: cors })
    }
  }

  // 🌟 [API MỚI] GHI NHẬN TOKEN MỚI TỪ LUỒNG AUTO REFRESH PYTHON
  if (url.pathname === "/api/shops/update-tokens" && request.method === "POST") {
    try {
      const { shop_id, access_token, refresh_token, partner_id } = await request.json();
      if (!shop_id || !access_token) return Response.json({ error: "Missing data" }, { status: 400, headers: cors });
      
      // Cập nhật Token mới vào DB, cộng thêm 4 tiếng cho thời gian sống
      await env.DB.prepare(`
        UPDATE shops 
        SET access_token = ?,
            refresh_token = COALESCE(?, refresh_token),
            api_partner_id = COALESCE(?, api_partner_id),
            token_expire_at = datetime('now', '+4 hours'),
            last_api_refresh_at = datetime('now'),
            api_refresh_expire_at = datetime('now', '+30 days')
        WHERE api_shop_id = ? OR user_name = ? OR shop_name = ?
      `).bind(access_token, refresh_token, partner_id ? String(partner_id) : null, String(shop_id), String(shop_id), String(shop_id)).run();
      
      console.log(`[API TOKENS] Đã cất Token mới an toàn vào Két sắt cho Shop ID: ${shop_id}`);
      return Response.json({ status: "ok", message: "Đã lưu Token mới vào CSDL" }, { headers: cors });
    } catch (e) {
      console.error("[API UPDATE TOKENS] Lỗi:", e.message);
      return Response.json({ error: e.message }, { status: 500, headers: cors });
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
        const apiShopId = s.api_shop_id || null
        const apiPartnerId = s.api_partner_id || null

        // Kiểm tra xem user_name đã tồn tại chưa
        const existing = await env.DB.prepare("SELECT id FROM shops WHERE user_name = ?").bind(userName).first()
        if (existing) {
          await env.DB.prepare("UPDATE shops SET shop_name = ?, platform = ?, api_shop_id = COALESCE(?, api_shop_id), api_partner_id = COALESCE(?, api_partner_id) WHERE user_name = ?").bind(shopName, platform, apiShopId, apiPartnerId, userName).run()
          updated++
        } else {
          await env.DB.prepare("INSERT INTO shops (shop_name, platform, user_name, api_shop_id, api_partner_id) VALUES (?, ?, ?, ?, ?)").bind(shopName, platform, userName, apiShopId, apiPartnerId).run()
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
  return null
}
