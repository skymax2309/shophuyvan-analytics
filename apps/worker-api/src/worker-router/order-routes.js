async function responseJsonSafe(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

const OMS_BADGE_CACHE_TTL_MS = 30 * 1000
const omsBadgeCache = new Map()

function readOmsBadgeCache(key) {
  const cached = omsBadgeCache.get(key)
  if (!cached || cached.expiresAt <= Date.now()) {
    omsBadgeCache.delete(key)
    return null
  }
  return { ...cached.badges }
}

function writeOmsBadgeCache(key, badges = {}) {
  omsBadgeCache.set(key, {
    expiresAt: Date.now() + OMS_BADGE_CACHE_TTL_MS,
    badges: { ...badges }
  })
}

function localRequest(path, init = {}) {
  return new Request(`https://worker.local${path}`, init)
}

async function autoRefreshMissingLabelsForPacked(orderIds, env, cors, deps) {
  const summary = {
    checked: 0,
    downloaded: 0,
    eligible: 0,
    manual_required: 0,
    not_ready: 0,
    not_supported: 0,
    error: 0,
    auto_refresh_disabled: false,
    reason: 'Tự tải tem read-only cho đơn đủ điều kiện; shop không hỗ trợ được ghi manual_required.',
    errors: []
  }
  const orderList = [...new Set((orderIds || []).map(id => String(id || '').trim()).filter(Boolean))].slice(0, 50)

  for (const orderId of orderList) {
    summary.checked += 1
    const statusResponse = await deps.getLabelStatus(
      localRequest(`/api/labels/status?order_id=${encodeURIComponent(orderId)}`),
      env,
      cors
    )
    const status = await responseJsonSafe(statusResponse)
    const labelStatus = String(status?.label_status || (status?.has_label ? 'downloaded' : '') || '').trim()
    if (labelStatus && Object.prototype.hasOwnProperty.call(summary, labelStatus)) {
      summary[labelStatus] += 1
      if (labelStatus === 'eligible' && deps.refreshOrderLabel) {
        const refreshResponse = await deps.refreshOrderLabel(
          localRequest(`/api/label/${encodeURIComponent(orderId)}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger: 'bulk_oms_status' })
          }),
          env,
          cors,
          orderId
        )
        const refreshPayload = await responseJsonSafe(refreshResponse)
        if (refreshResponse.ok && refreshPayload.status === 'ok') summary.downloaded += 1
        else {
          summary.error += 1
          summary.errors.push({ order_id: orderId, mode: status?.refresh_mode || 'unknown', error: refreshPayload.error || refreshPayload.message || `HTTP ${refreshResponse.status}` })
        }
      }
    } else if (status?.error && status.error !== 'not_found') {
      summary.error += 1
      summary.errors.push({ order_id: orderId, mode: status?.refresh_mode || 'unknown', error: status?.error || 'missing_platform_shop' })
    } else {
      summary.not_ready += 1
    }
  }

  summary.jobs = []
  return summary
}

export async function handleOrderWorkerRoutes(request, env, ctx, cors, url, deps) {
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

  if (url.pathname === "/api/orders" && request.method === "GET")
    return getOrders(request, env, cors)

  if (url.pathname.startsWith("/api/customer-risk"))
    return handleCustomerRisk(request, env, cors)

  if (url.pathname.startsWith("/api/customers/marketplace"))
    return handleCustomerRisk(request, env, cors)

  if (url.pathname === "/api/orders/filter-options" && request.method === "GET")
    return getOrderFilterOptions(request, env, cors)

  if (url.pathname === "/api/orders/changes" && request.method === "GET")
    return getOrderChanges(request, env, cors)

  if (url.pathname === "/api/orders/normalize-workflow-status" && request.method === "POST")
    return normalizeOrderWorkflowStatuses(request, env, cors)

  if (url.pathname === "/api/orders/buyer-cancellation/decide" && request.method === "POST") {
    const body = await request.json().catch(() => ({}))
    const result = await handleBuyerCancellationDecision(env, body)
    const status = result.status === 'error' ? 400 : (result.status === 'blocked' ? 409 : 200)
    return Response.json(result, { status, headers: cors })
  }

  if (url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/oms-status") && request.method === "PATCH") {
    const orderId = decodeURIComponent(url.pathname.split("/")[3])
    return updateOmsStatus(request, env, cors, orderId, ctx)
  }

  // Cập nhật nhiều đơn cùng lúc (HỖ TRỢ 2 TẦNG TRẠNG THÁI)
  if (url.pathname === "/api/orders/bulk-oms-status" && request.method === "POST") {
    const { order_ids, oms_status, shipping_status } = await request.json()
    const normalizedStatus = normalizeOmsStatusPair(oms_status, shipping_status)
    if (!order_ids?.length || !normalizedStatus.oms)
      return Response.json({ error: "Missing data" }, { status: 400, headers: cors })
    // Cập nhật order_type cùng lúc để tab hủy/hoàn và Dashboard đọc chung một nguồn trạng thái.
    const normalizedOrderType = orderTypeFromStatus({
      oms_status: normalizedStatus.oms,
      shipping_status: normalizedStatus.shipping
    }, 'normal')

    let stmts = [];
    if (normalizedStatus.shipping) {
        stmts = order_ids.map(id =>
          env.DB.prepare(`UPDATE orders_v2 SET oms_status=?, shipping_status=?, order_type=?, oms_updated_at=datetime('now','+7 hours') WHERE order_id=?`)
            .bind(normalizedStatus.oms, normalizedStatus.shipping, normalizedOrderType, id)
        )
    } else {
        stmts = order_ids.map(id =>
          env.DB.prepare(`UPDATE orders_v2 SET oms_status=?, order_type=?, oms_updated_at=datetime('now','+7 hours') WHERE order_id=?`)
            .bind(normalizedStatus.oms, normalizedOrderType, id)
        )
    }
    await env.DB.batch(stmts)
    let label_autofill = null
    if (String(normalizedStatus.shipping || '').toUpperCase() === 'LOGISTICS_PACKAGED') {
      // Đơn đã đóng gói phải có tem thật; nếu thiếu thì ưu tiên API, shop không API được đưa vào job Radar hiện có.
      label_autofill = await autoRefreshMissingLabelsForPacked(order_ids, env, cors, {
        getLabelStatus,
        refreshOrderLabel
      }).catch(error => ({ checked: order_ids.length, errors: [{ error: error.message || String(error) }] }))
    }
    return Response.json({ status: "ok", updated: order_ids.length, label_autofill }, { headers: cors })
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

// [BỌC THÉP] API CHUẨN HÓA TRẠNG THÁI ĐƠN LỊCH SỬ (CHUẨN 2 TẦNG MỚI NHẤT)
  if (url.pathname === "/api/orders/archive-old" && request.method === "POST") {
    return Response.json({
      error: 'legacy_order_archive_old_disabled',
      message: 'Route chuẩn hóa lịch sử cũ đã bị cắt khỏi runtime. Dùng /api/orders/normalize-workflow-status để chuẩn hóa theo Order Core.'
    }, { status: 410, headers: cors })
  }
	  // [API BẢO TRÌ] ĐỒNG BỘ TÊN SHOP CŨ THÀNH USERNAME MỚI (BẢN VÉT MÁNG)
  if (url.pathname === "/api/fix-shop-names" && request.method === "GET") {
    return Response.json({
      error: 'legacy_fix_shop_names_disabled',
      message: 'Route sửa shop hard-code cũ đã bị cắt khỏi runtime. Shop display phải đi qua Shop Warehouse/Core.'
    }, { status: 410, headers: cors })
  }

  // [BỌC THÉP] API ĐẾM TỔNG SỐ ĐƠN TUYỆT ĐỐI (KHÔNG NHẢY MÚA THEO TRANG)
  if (url.pathname === "/api/orders/badges" && request.method === "GET") {
    try {
      const badgeCacheKey = url.searchParams.toString()
      if (url.searchParams.get('fresh') !== '1') {
        const cachedBadges = readOmsBadgeCache(badgeCacheKey)
        if (cachedBadges) return Response.json(cachedBadges, {
          headers: { ...cors, 'X-OMS-Cache': 'hit', 'X-OMS-Data-Source': 'orders_badge_ttl_cache' }
        })
      }
      // Badge phải nhận cùng bộ lọc thời gian/shop/search với bảng để người vận hành không thấy lệch số lượng.
      const badgeConds = ['1=1']
      const badgeParams = []
      const from = cleanText(url.searchParams.get('from'))
      const to = cleanText(url.searchParams.get('to'))
      const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
      const shop = cleanText(url.searchParams.get('shop'))
      const search = cleanText(url.searchParams.get('search'))
      if (from) { badgeConds.push(`date(order_date) >= ?`); badgeParams.push(from) }
      if (to) { badgeConds.push(`date(order_date) <= ?`); badgeParams.push(to) }
      if (platform) { badgeConds.push(`LOWER(platform) = ?`); badgeParams.push(platform) }
      if (shop) { badgeConds.push(`LOWER(TRIM(shop)) = LOWER(TRIM(?))`); badgeParams.push(shop) }
      if (search) {
        badgeConds.push(`(order_id LIKE ? OR shop LIKE ? OR customer_name LIKE ? OR tracking_number LIKE ?)`)
        const q = `%${search}%`
        badgeParams.push(q, q, q, q)
      }
      const badgeWhere = badgeConds.join(' AND ')

      const { results: sCount } = await env.DB.prepare(`SELECT oms_status, COUNT(*) as c FROM orders_v2 WHERE ${badgeWhere} GROUP BY oms_status`).bind(...badgeParams).all()
      const { results: shipCount } = await env.DB.prepare(`SELECT oms_status, shipping_status, COUNT(*) as c FROM orders_v2 WHERE ${badgeWhere} GROUP BY oms_status, shipping_status`).bind(...badgeParams).all()
      const { results: tCount } = await env.DB.prepare(`SELECT order_type, COUNT(*) as c FROM orders_v2 WHERE ${badgeWhere} GROUP BY order_type`).bind(...badgeParams).all()
      const { results: pCount } = await env.DB.prepare(`SELECT platform, COUNT(*) as c FROM orders_v2 WHERE ${badgeWhere} GROUP BY platform`).bind(...badgeParams).all()
      const { results: allCount } = await env.DB.prepare(`SELECT COUNT(*) as c FROM orders_v2 WHERE ${badgeWhere}`).bind(...badgeParams).all()
      const { results: statusRows } = await env.DB.prepare(`
        SELECT o.order_id, o.order_date, o.created_at, o.order_type, o.oms_status, o.shipping_status,
               o.platform, o.shop, o.tracking_number,
               '' AS logistics_status, '' AS delivery_status,
               o.cancel_reason,
               CASE WHEN LOWER(COALESCE(o.platform, '')) = 'shopee'
                 AND EXISTS (
                   SELECT 1 FROM shops s
                   WHERE LOWER(COALESCE(s.platform, '')) = 'shopee'
                     AND COALESCE(s.access_token, '') != ''
                     AND (s.shop_name = o.shop OR s.user_name = o.shop OR CAST(s.api_shop_id AS TEXT) = o.shop)
                   LIMIT 1
                 )
                 THEN 1 ELSE 0 END AS shopee_api_shop,
               COALESCE((SELECT otc.tracking_number FROM order_tracking_core otc WHERE otc.order_id = o.order_id AND COALESCE(otc.tracking_number, '') != '' LIMIT 1), '') AS tracking_core_tracking_number,
               COALESCE((SELECT ol.storage_key FROM order_labels ol WHERE ol.order_id = o.order_id ORDER BY ol.refreshed_at DESC LIMIT 1), '') AS label_file_path,
               COALESCE((SELECT ol.error FROM order_labels ol WHERE ol.order_id = o.order_id ORDER BY ol.refreshed_at DESC LIMIT 1), '') AS label_error
        FROM orders_v2 o
        WHERE ${badgeWhere}
      `).bind(...badgeParams).all()

      const badges = { ALL: allCount[0]?.c || 0 }
      sCount.forEach(r => {
        const key = r.oms_status || 'PENDING'
        badges[key] = r.c
        badges[`oms:${key}`] = r.c
      })
      shipCount.forEach(r => {
        const oms = r.oms_status || 'PENDING'
        const key = r.shipping_status || 'UNKNOWN'
        badges[`${oms}:shipping:${key}`] = r.c
        if (oms === 'PENDING') badges[`shipping:${key}`] = r.c
      })
      tCount.forEach(r => badges[r.order_type || 'normal'] = r.c)
      pCount.forEach(r => badges[r.platform || 'shopee'] = r.c)
      const mainBadgeStatuses = ['UNPAID', 'PENDING', 'SHIPPING', 'COMPLETED', 'CANCELLED', 'RETURN']
      const coreMainCounts = Object.fromEntries(mainBadgeStatuses.map(key => [key, 0]))
      const scopedShippingCounts = {}
      const coreTypeCounts = { normal: 0, cancel: 0, return: 0 }
      const seenOrders = new Set()
      const shouldHideStalePending = !from && !to && !search
      ;(statusRows || []).forEach(row => {
        const orderId = String(row.order_id || '').trim()
        if (!orderId || seenOrders.has(orderId)) return
        seenOrders.add(orderId)
        if (shouldHideStalePending && isStaleOperationalPendingOrder(row)) return
        const type = orderTypeFromStatus(row, row.order_type || 'normal')
        coreTypeCounts[type] = (coreTypeCounts[type] || 0) + 1

        // Badge OMS dùng cùng cách gom cha/con với API danh sách đơn để tab con không lệch với "Tổng đơn".
        const parentStatuses = new Set()
        if (type === 'cancel') parentStatuses.add('CANCELLED')
        if (type === 'return') parentStatuses.add('RETURN')
        ;[row.oms_status, row.shipping_status].forEach(value => {
          const parent = orderStatusParent(value)
          if (mainBadgeStatuses.includes(parent)) parentStatuses.add(parent)
        })
        if (!parentStatuses.size) parentStatuses.add('PENDING')

        const labelError = String(row.label_error || '').trim().toLowerCase()
        const hasTracking = Boolean(String(row.tracking_number || row.tracking_core_tracking_number || '').trim())
        const hasLabelFile = Boolean(String(row.label_file_path || '').trim())
          && ![
            'pending_document_generation',
            'shopee_pdf_not_ready',
            'pending_retry',
            'manual_required',
            'label_download_blocked',
            'tiktok_label_not_saved_before_packed',
            'not_found'
          ].includes(labelError)
        const isShopeeApiPending = Number(row.shopee_api_shop || 0) === 1 && parentStatuses.has('PENDING')
        let shippingKey = row.shipping_status || 'UNKNOWN'
        if (isShopeeApiPending) {
          if (hasTracking && !hasLabelFile) shippingKey = 'WAITING_LABEL'
          else if (!hasTracking) shippingKey = 'READY_TO_SHIP'
          else if (hasTracking && hasLabelFile) shippingKey = 'PROCESSED'
        }
        parentStatuses.forEach(parent => {
          coreMainCounts[parent] = (coreMainCounts[parent] || 0) + 1
          const scopedKey = `${parent}:shipping:${shippingKey}`
          scopedShippingCounts[scopedKey] = (scopedShippingCounts[scopedKey] || 0) + 1
        })
      })
      mainBadgeStatuses.forEach(key => {
        badges[key] = coreMainCounts[key] || 0
        badges[`oms:${key}`] = coreMainCounts[key] || 0
      })
      Object.assign(badges, scopedShippingCounts)
      ;(shipCount || []).forEach(r => {
        const oms = r.oms_status || 'PENDING'
        const key = r.shipping_status || 'UNKNOWN'
        if (oms !== 'PENDING') return
        const scopedKey = `PENDING:shipping:${key}`
        const count = scopedShippingCounts[scopedKey] || 0
        badges[scopedKey] = count
        badges[`shipping:${key}`] = count
      })
      ACTIVE_PENDING_OPERATIONAL_STATUSES.forEach(key => {
        const scopedKey = `PENDING:shipping:${key}`
        const count = scopedShippingCounts[scopedKey] || 0
        badges[scopedKey] = count
        badges[`shipping:${key}`] = count
      })
      ;['WAITING_LABEL'].forEach(key => {
        const scopedKey = `PENDING:shipping:${key}`
        const count = scopedShippingCounts[scopedKey] || 0
        badges[scopedKey] = count
        badges[`shipping:${key}`] = count
      })
      badges.pending_active_window_days = ACTIVE_PENDING_ORDER_WINDOW_DAYS
      // Badge hủy/hoàn dùng core chung để OMS không hiện 0 khi DB chỉ có RETURN/CANCELLED ở cột trạng thái sàn.
      badges.normal = coreTypeCounts.normal
      badges.cancel = coreTypeCounts.cancel
      badges.return = coreTypeCounts.return
      badges.CANCELLED = coreTypeCounts.cancel
      badges.RETURN = coreTypeCounts.return
      badges['oms:CANCELLED'] = coreTypeCounts.cancel
      badges['oms:RETURN'] = coreTypeCounts.return
      try {
        const complaint = await env.DB.prepare(`
          SELECT COUNT(DISTINCT order_id) AS c
          FROM return_complaint_cases
          WHERE COALESCE(complaint_status, '') NOT IN ('', 'closed', 'resolved', 'cancelled')
        `).first()
        badges['RETURN:shipping:RETURN_COMPLAINT'] = Number(complaint?.c || 0)
        badges['shipping:RETURN_COMPLAINT'] = Number(complaint?.c || 0)
      } catch {}

      writeOmsBadgeCache(badgeCacheKey, badges)
      return Response.json(badges, { headers: { ...cors, 'X-OMS-Cache': 'miss', 'X-OMS-Data-Source': 'orders_v2_badge_queries' } })
    } catch (e) {
      return Response.json({ error: e.message }, { headers: cors })
    }
  }
  return null
}
