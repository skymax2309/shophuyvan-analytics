import { listMarketplaceShopCapabilities } from '../../core/marketplace-shop-capability-core.js'
import { cleanupLegacyOrderSourceMeta } from '../../core/order-transport-core.js'
import { repairReviewCatalogMapping } from '../../core/review-core.js'
import { fetchShopeeOpenCampaignAddedProducts, syncAdsCampaignSnapshots, syncApiOrders, syncApiOrderStatuses, syncApiProducts, syncLazadaReverseOrders, syncShopeeReturns } from '../api-sync.js'
import { runMarketplacePushSyncQueueBatch } from '../marketplace-webhooks.js'
import { executeShopeeOperation } from '../operations.js'
import { syncLazadaProductReviews, syncMarketplaceReviews } from '../reviews.js'
import { buildApiShopKeySet, cleanText, isApiShopRow, json, ORDER_PHASE2_SHIP_STATUSES, orderPhase2SqlScope, parseLimit, safeAll, safeNumber } from './foundation-workspaces.js'
import { loadModuleData } from './module-data.js'

export function actionOptions(body) {
  const platform = cleanText(body.platform).toLowerCase()
  return {
    platform,
    shop: cleanText(body.shop || body.shop_name),
    days: parseLimit(body.days, platform === 'shopee' ? 30 : 60, 120),
    limit: parseLimit(body.limit, platform === 'lazada' ? 60 : 100, 500),
    page_size: parseLimit(body.page_size || body.pageSize || body.limit, platform === 'lazada' ? 20 : 50, 100),
    max_pages: parseLimit(body.max_pages || body.maxPages, 1, 10),
    shop_limit: parseLimit(body.shop_limit || body.shopLimit, platform ? 20 : 3, 100),
    item_limit: parseLimit(body.item_limit || body.itemLimit, 10, 50),
    offset: 0,
    statuses: cleanText(body.statuses || 'PENDING,READY_TO_SHIP,PROCESSED,SHIPPED,COMPLETED,CANCELLED,IN_CANCEL'),
    includeOutOfStock: body.include_out_of_stock ?? body.includeOutOfStock ?? false
  }
}

export async function previewOrderPhase2Action(env, options = {}) {
  const scope = orderPhase2SqlScope({ ...options, platform: options.platform || 'shopee' })
  const [candidates, capabilities] = await Promise.all([
    safeAll(env, `
      SELECT order_id, platform, shop, source_mode, oms_status, shipping_status,
             tracking_number, shipping_carrier, order_date, oms_updated_at
      FROM orders_v2
      WHERE ${scope.where}
      ORDER BY
        CASE
          WHEN UPPER(COALESCE(shipping_status, '')) IN ('READY_TO_SHIP','PROCESSED','LOGISTICS_PENDING_ARRANGE','LOGISTICS_REQUEST_CREATED') THEN 0
          WHEN UPPER(COALESCE(shipping_status, '')) = 'IN_CANCEL' THEN 1
          WHEN COALESCE(tracking_number, '') = '' THEN 2
          ELSE 3
        END,
        datetime(COALESCE(NULLIF(oms_updated_at, ''), NULLIF(order_date, ''), '1970-01-01')) DESC,
        order_id DESC
      LIMIT ?
    `, [...scope.binds, Math.min(options.limit || 30, 80)]),
    listMarketplaceShopCapabilities(env, { platform: '', limit: 300 })
  ])
  const apiKeys = buildApiShopKeySet(capabilities)
  const apiShopee = candidates.filter(row =>
    cleanText(row.platform).toLowerCase() === 'shopee' && isApiShopRow(row, apiKeys)
  )
  const shipRows = apiShopee.filter(row => ORDER_PHASE2_SHIP_STATUSES.has(cleanText(row.shipping_status).toUpperCase()))
  const cancelRows = apiShopee.filter(row => cleanText(row.shipping_status).toUpperCase() === 'IN_CANCEL')
  const trackingRows = apiShopee.filter(row => !cleanText(row.tracking_number))
  const manualRows = candidates.filter(row => !isApiShopRow(row, apiKeys))
  const previews = []

  if (shipRows[0]?.order_id) {
    previews.push(await executeShopeeOperation(env, {
      action: 'ship_order',
      payload: { order_sn: cleanText(shipRows[0].order_id) }
    }))
  }
  if (shipRows.length) {
    previews.push(await executeShopeeOperation(env, {
      action: 'mass_ship_order',
      payload: {
        order_list: shipRows.slice(0, 10).map(row => ({ order_sn: cleanText(row.order_id) }))
      }
    }))
  }

  return {
    status: 'ok',
    message: shipRows.length
      ? 'Đã tạo preview dry-run phase 2. Chưa gửi thao tác ghi thật lên sàn.'
      : 'Phase 2 đã kiểm tra xong nhưng chưa có đơn Shopee API đủ điều kiện dry-run ship.',
    result: {
      dry_run: true,
      sent_to_shopee: false,
      candidates: {
        total: candidates.length,
        shopee_api: apiShopee.length,
        ship_ready: shipRows.length,
        buyer_cancel_waiting_choice: cancelRows.length,
        missing_tracking: trackingRows.length,
        manual_or_no_api: manualRows.length
      },
      previews,
      locked: [
        'Hủy đơn IN_CANCEL không preview ACCEPT/REJECT hàng loạt; người vận hành phải chọn Đồng ý hủy hoặc Từ chối hủy ở guard OMS.',
        'Lazada phase 2 đang chỉ đọc/đối soát trong Trung tâm API; lệnh ghi Lazada sẽ tách guard riêng khi đủ endpoint và payload chính thức.',
        'Shop không API không chạy API sync/write; xử lý bằng quét trình duyệt, import file hoặc thao tác tay có ghi chú.'
      ]
    }
  }
}

export async function runModuleAction(action, env, cors, body) {
  const options = actionOptions(body)
  if (options.platform && !['shopee', 'lazada'].includes(options.platform)) {
    return { error: 'Sàn không hợp lệ. Vui lòng chọn Shopee hoặc Lazada.', status: 400 }
  }

  if (action === 'refresh_orders') {
    const result = await syncApiOrders(env, cors, options)
    return { status: 'ok', message: 'Đã kéo đơn mới qua API.', result }
  }

  if (action === 'refresh_order_phase1') {
    const focusedRefresh = Boolean(options.platform || options.shop)
    const orders = await syncApiOrders(env, cors, {
      ...options,
      days: Math.max(options.days || 15, focusedRefresh ? 30 : 15),
      limit: focusedRefresh ? Math.min(options.limit || 120, 180) : Math.min(options.limit || 80, 100),
      statuses: options.statuses || 'READY_TO_SHIP,PROCESSED,SHIPPED,COMPLETED,CANCELLED,IN_CANCEL',
      fetch_tracking: true,
      fetch_fees: focusedRefresh
    })
    const statuses = await syncApiOrderStatuses(env, {
      ...options,
      days: Math.max(options.days || 30, focusedRefresh ? 60 : 30),
      limit: focusedRefresh ? Math.min(options.limit || 160, 250) : Math.min(options.limit || 100, 160)
    })
    return {
      status: 'ok',
      message: focusedRefresh
        ? 'Đã làm mới order phase 1 cho shop/sàn đang chọn.'
        : 'Đã làm mới order phase 1 chế độ nhẹ cho các shop API.',
      result: {
        orders,
        statuses,
        note: 'Phase 1 chỉ đồng bộ dữ liệu và cập nhật trạng thái. Các lệnh ghi thật vẫn cần guard/xác nhận riêng.'
      }
    }
  }

  if (action === 'preview_order_phase2') {
    return await previewOrderPhase2Action(env, options)
  }

  if (action === 'refresh_products') {
    const result = await syncApiProducts(env, cors, options)
    return { status: 'ok', message: 'Đã làm mới bài đăng, giá, tồn và SKU từ shop API.', result }
  }

  if (action === 'refresh_finance') {
    const result = await syncApiOrderStatuses(env, { ...options, days: Math.max(options.days, 60) })
    return { status: 'ok', message: 'Đã cập nhật trạng thái, phí và lãi thực cho đơn API gần đây.', result }
  }

  if (action === 'refresh_returns') {
      const focusedRefresh = Boolean(options.platform || options.shop)
      const includeStatusRefresh = focusedRefresh && ['1', 'true', 'yes', 'on'].includes(String(
        options.include_status_refresh ?? options.includeStatusRefresh ?? ''
      ).trim().toLowerCase())
      const sourceCleanup = await cleanupLegacyOrderSourceMeta(env, {
        platform: options.platform,
        shop: options.shop
      })
      // Đồng bộ trạng thái đơn đã có action riêng. Action hoàn/trả chỉ gọi thêm khi người vận hành bật cờ rõ ràng.
      // Cách này tránh một request vừa quét trạng thái, vừa quét reverse/return làm Worker vượt giới hạn subrequest.
      const statuses = includeStatusRefresh
        ? await syncApiOrderStatuses(env, { ...options, days: Math.max(options.days, 90) })
        : {
            status: 'skipped',
            mode: 'order_status_guard_skip',
            note: focusedRefresh
              ? 'Đã bỏ qua cập nhật trạng thái đơn trong action hoàn/trả. Nếu cần quét sâu trạng thái trước, dùng action riêng hoặc bật include_status_refresh.'
              : 'Đã bỏ qua cập nhật trạng thái đơn ở chế độ rộng để dành quota cho đồng bộ hoàn/trả.'
          }
      const shouldSyncShopee = !options.platform || options.platform === 'shopee'
      const shouldSyncLazada = !options.platform || options.platform === 'lazada'
      const returns = shouldSyncShopee
        ? await syncShopeeReturns(env, {
            ...options,
            shopLimit: options.shopLimit || options.shop_limit || (focusedRefresh ? 80 : 30),
            page_size: focusedRefresh ? Math.min(options.limit || 40, 80) : Math.min(options.limit || 20, 30),
            hours: options.hours || (focusedRefresh ? 48 : 24),
            include_detail: focusedRefresh,
            max_pages: focusedRefresh ? 3 : 1,
            time_field: options.time_field || 'update_time'
          })
      : {
          status: 'skipped',
          mode: 'shopee_returns_sync',
          note: 'Đã bỏ qua Shopee vì đang lọc theo sàn khác.'
        }
      const lazadaReverse = shouldSyncLazada
        ? await syncLazadaReverseOrders(env, {
            ...options,
            shopLimit: options.shopLimit || options.shop_limit || (focusedRefresh ? 80 : 30),
            page_size: focusedRefresh ? Math.min(options.limit || 40, 80) : Math.min(options.limit || 20, 30),
            max_pages: focusedRefresh ? 3 : 1,
            include_detail: focusedRefresh,
            include_history: focusedRefresh,
            history_pages: focusedRefresh ? 2 : 1
          })
      : {
          status: 'skipped',
          mode: 'lazada_reverse_sync',
          note: 'Đã bỏ qua Lazada vì đang lọc theo sàn khác.'
        }
    return {
      status: 'ok',
      message: focusedRefresh
        ? 'Đã dọn nguồn đơn cũ và cập nhật hoàn/trả sâu cho shop hoặc sàn đang chọn.'
        : 'Đã dọn nguồn đơn cũ và chạy đồng bộ hoàn/trả chế độ nhẹ để tránh quá tải subrequest.',
      result: {
        source_cleanup: sourceCleanup,
        statuses,
        returns,
        lazada_reverse: lazadaReverse,
        light_mode: !focusedRefresh
      }
    }
  }

  if (action === 'refresh_customer_care') {
    const orders = await syncApiOrders(env, cors, {
      ...options,
      days: Math.max(options.days, 30),
      limit: Math.min(options.limit || 80, 120)
    })
    const statuses = await syncApiOrderStatuses(env, {
      ...options,
      days: Math.max(options.days, 30),
      limit: Math.min(options.limit || 120, 250)
    })
    return { status: 'ok', message: 'Đã làm mới dữ liệu CSKH và hiệu suất shop.', result: { orders, statuses } }
  }

  if (action === 'sync_marketplace_reviews') {
    const focusedRefresh = Boolean(options.platform || options.shop)
    const result = await syncMarketplaceReviews(env, {
      ...options,
      days: Math.min(Math.max(options.days || 7, 1), 7),
      shop_limit: focusedRefresh ? Math.min(options.shop_limit || 1, 5) : Math.min(options.shop_limit || 3, 3),
      item_limit: focusedRefresh ? Math.min(options.item_limit || 20, 30) : Math.min(options.item_limit || 10, 10),
      max_pages: Math.min(options.max_pages || 1, 2),
      page_size: Math.min(options.page_size || 50, 100)
    })
    return {
      status: 'ok',
      message: 'Đã cập nhật đánh giá sản phẩm ở chế độ đọc-only; phản hồi thật lên sàn vẫn khóa preview/log.',
      result
    }
  }

  if (action === 'sync_lazada_review_batch') {
    const result = await syncLazadaProductReviews(env, {
      ...options,
      platform: 'lazada',
      history_days: Math.min(Math.max(options.history_days || 28, 7), 56),
      window_days: 7,
      max_windows: Math.min(Math.max(options.max_windows || 4, 1), 8),
      shop_limit: Math.min(options.shop_limit || 2, 4),
      item_limit: Math.min(options.item_limit || 8, 12),
      max_pages: Math.min(options.max_pages || 2, 3),
      subrequest_budget: Math.min(options.subrequest_budget || 32, 45)
    })
    const repair = await repairReviewCatalogMapping(env, {
      platform: 'lazada',
      shop: cleanText(options.shop),
      limit: 400
    })
    return {
      status: 'ok',
      message: result.shops?.some(shop => shop.budget_truncated)
        ? 'Đã chạy batch Lazada an toàn theo ngân sách subrequest; cần bấm lại để quét tiếp các item còn lại.'
        : 'Đã chạy batch Lazada review nhiều cửa sổ 7 ngày và repair mapping an toàn.',
      result: {
        batch: result,
        repair_mapping: repair
      }
    }
  }

  if (action === 'repair_review_catalog_mapping') {
    const result = await repairReviewCatalogMapping(env, {
      platform: options.platform,
      shop: cleanText(options.shop),
      limit: Math.min(options.limit || 600, 1500)
    })
    return {
      status: 'ok',
      message: result.updated
        ? `Đã sửa mapping ${safeNumber(result.updated).toLocaleString('vi-VN')} review từ product catalog.`
        : 'Đã chạy repair mapping review; các dòng còn thiếu sẽ chờ đồng bộ bài đăng/catalog phù hợp.',
      result
    }
  }

  if (action === 'refresh_marketing') {
    const products = await syncApiProducts(env, cors, {
      ...options,
      includeOutOfStock: false,
      limit: Math.min(options.limit || 80, 120)
    })
    const ads = await syncAdsCampaignSnapshots(env, {
      ...options,
      days: Math.max(options.days || 7, 7),
      limit: Math.min(options.limit || 80, 150)
    })
    return { status: 'ok', message: 'Đã làm mới marketing, SKU, tồn kho và campaign ADS.', result: { products, ads } }
  }

  if (action === 'read_open_campaign_products') {
    const result = await fetchShopeeOpenCampaignAddedProducts(env, {
      ...options,
      platform: 'shopee',
      page_size: Math.min(options.page_size || options.limit || 20, 100),
      shop_limit: Math.min(options.shop_limit || 3, 10)
    })
    const hasPermissionError = result.shops?.some(row => row.status === 'error')
    return {
      status: hasPermissionError ? 'partial_error' : 'ok',
      message: hasPermissionError
        ? 'Đã gọi Shopee AMS Open Campaign; một số shop thiếu quyền hoặc chưa đồng ý AMS T&C.'
        : 'Đã đọc sản phẩm Shopee Open Campaign.',
      result
    }
  }

  if (action === 'drain_push_queue') {
    const result = await runMarketplacePushSyncQueueBatch(env, cors, {
      max_jobs: Math.min(options.limit || 3, 10),
      include_failed: body.include_failed === true || body.includeFailed === true
    })
    return { status: 'ok', message: 'Đã chạy hàng đợi push incremental.', result }
  }

  return { error: 'Module chưa hỗ trợ thao tác này.', status: 400 }
}

export async function handleAdvancedModules(request, env, cors) {
  if (request.method === 'GET') {
    const url = new URL(request.url)
    const limit = parseLimit(url.searchParams.get('limit'), 8, 30)
    return json(await loadModuleData(env, limit), cors)
  }

  if (request.method !== 'POST') {
    return json({ error: 'Phương thức không được hỗ trợ.' }, cors, 405)
  }

  let body = {}
  try { body = await request.json() } catch {}
  const action = cleanText(body.action).toLowerCase()
  const result = await runModuleAction(action, env, cors, body)
  if (result.error) return json({ error: result.error }, cors, result.status || 400)
  return json(result, cors)
}
