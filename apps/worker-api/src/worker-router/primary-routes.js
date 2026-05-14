export async function handlePrimaryWorkerRoutes(request, env, ctx, cors, url, deps) {
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

  if (url.pathname === "/api/purchase" || url.pathname.startsWith("/api/purchase/")) {
    return handlePurchase(request, env, cors)
  }
  if (url.pathname === "/api/shops/api-configs" ||
      url.pathname === "/api/shops/shopee-app-config" ||
      url.pathname === "/api/shops/shopee-snapshot" ||
      url.pathname === "/api/shops/shopee-write-guards" ||
      url.pathname === "/api/shops/shopee-video-app-config" ||
      url.pathname === "/api/shops/disconnect-video-api" ||
      url.pathname === "/api/shops/force-refresh-video-token" ||
      url.pathname === "/api/shops/disconnect-api") {
    return handleShopsWarehouse(request, env, cors)
  }

// ── Products ──────────────────────────────────────────────────
  // ── Shops & Warehouse ─────────────────────────────────────────────
  if (url.pathname === "/api/products/shops-warehouse-list" ||
      url.pathname === "/api/products/update-shop-warehouse" ||
      url.pathname === "/api/shops/force-refresh-token") // 🌟 Đã mở đường cho Web ép làm mới Token
    return handleShopsWarehouse(request, env, cors)

// ── Products ──────────────────────────────────────────────────────
  if (url.pathname === "/api/products" ||
url.pathname === "/api/products/promo-prices" ||
url.pathname === "/api/products/update-promo-prices" ||
url.pathname === "/api/products/catalog-settings" ||
url.pathname === "/api/products/catalog-overview" ||
url.pathname === "/api/products/inventory-stock-core" ||
url.pathname === "/api/products/catalog-write-preview" ||
url.pathname === "/api/products/catalog-listing-preview" ||
url.pathname === "/api/products/publish-content-variants" ||
url.pathname === "/api/products/publish-draft-preview" ||
url.pathname === "/api/products/publish-draft" ||
    url.pathname === "/api/products/publish-drafts" ||
      url.pathname === "/api/products/shopee-import" ||
      url.pathname === "/api/products/group-parent" ||
      url.pathname === "/api/products/ungroup-parent" ||
      url.pathname === "/api/products/bulk-import")
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

  if (url.pathname === "/api/orders/sync-api-orders")
    return handleApiOrderSync(request, env, cors)

  if (url.pathname === "/api/orders/sync-api-status")
    return handleApiStatusSync(request, env, cors)

  if (url.pathname === "/api/products/sync-api-products")
    return handleApiProductSync(request, env, cors)

  // Giữ thêm alias /api/features để các màn hình chat hoặc cache frontend cũ không bị 404 khi gọi sync nền.
  if (url.pathname === "/api/advanced/features" || url.pathname === "/api/advanced/actions" || url.pathname === "/api/features" || url.pathname === "/api/actions")
    return handleAdvancedApiFeatures(request, env, cors)

  if (url.pathname === "/api/advanced/modules" || url.pathname === "/api/advanced/modules/actions")
    return handleAdvancedModules(request, env, cors)

  if (url.pathname === "/api/chat" || url.pathname.startsWith("/api/chat/"))
    return handleChat(request, env, cors)

  if (url.pathname === "/api/video" || url.pathname.startsWith("/api/video/"))
    return handleVideo(request, env, cors)

  if (url.pathname === "/api/ads" || url.pathname.startsWith("/api/ads/"))
    return handleAds(request, env, cors)

  if (url.pathname === "/api/income" || url.pathname.startsWith("/api/income/"))
    return handleIncome(request, env, cors)

  if (url.pathname === "/api/order-analytics" || url.pathname.startsWith("/api/order-analytics/"))
    return handleOrderAnalytics(request, env, cors)

  if (url.pathname === "/api/returns" || url.pathname.startsWith("/api/returns/"))
    return handleReturns(request, env, cors)

  if (url.pathname === "/api/reviews" || url.pathname.startsWith("/api/reviews/"))
    return handleReviews(request, env, cors)

  if (url.pathname === "/api/top-picks" || url.pathname.startsWith("/api/top-picks/"))
    return handleTopPicks(request, env, cors)

  if (url.pathname === "/api/discounts" || url.pathname.startsWith("/api/discounts/"))
    return handleDiscounts(request, env, cors)

  if (url.pathname === "/api/operations" || url.pathname.startsWith("/api/operations/"))
    return handleOperations(request, env, cors)

  if (url.pathname === "/api/logistics-watch")
    return handleLogisticsWatch(request, env, cors)

  // 🌟 CỔNG TIẾP NHẬN WEBHOOK TỪ SHOPEE (REALTIME)
  if (url.pathname === "/api/webhooks/shopee")
    return handleShopeeMarketplaceWebhook(request, env, cors, ctx)

  if (url.pathname === "/api/webhooks/lazada")
    return handleLazadaMarketplaceWebhook(request, env, cors, ctx)

  if (url.pathname === "/api/webhooks/events")
    return handleWebhookEventsStatus(request, env, cors)

  if (url.pathname === "/api/webhooks/sync-queue")
    return handleWebhookSyncQueue(request, env, cors)

  // 📥 TỰ ĐỘNG IMPORT — Bot gửi file_key sau khi upload R2 xong
  return null
}
