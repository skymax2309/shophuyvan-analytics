export async function handleAutomationWorkerRoutes(request, env, ctx, cors, url, deps) {
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
  return null
}
