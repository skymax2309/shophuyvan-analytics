import { loadOrderPhase1Workspace, loadOrderPhase2Workspace, MARKETING_CODES, normalizeDraft, normalizeEvent, normalizeFinance, normalizeReturn, normalizeVariation, ORDER_PHASE1_ACTIVE_WHERE, ORDER_PHASE2_CANDIDATE_WHERE, PRODUCT_CODES, safeAll, safeCount, safeFirst, safeNumber } from './foundation-workspaces.js'
import { loadCustomerWorkspace, loadFinanceWorkspace, loadMarketingWorkspace, loadPushWorkspace, loadReturnsWorkspace, loadReviewWorkspace } from './workspace-extra.js'

export async function loadWorkspaces(env, limit) {
  const [orderPhase1, orderPhase2, finance, returns, push, customer, review, marketing] = await Promise.all([
    loadOrderPhase1Workspace(env, limit),
    loadOrderPhase2Workspace(env, limit),
    loadFinanceWorkspace(env, limit),
    loadReturnsWorkspace(env, limit),
    loadPushWorkspace(env, limit),
    loadCustomerWorkspace(env, limit),
    loadReviewWorkspace(env, limit),
    loadMarketingWorkspace(env, limit)
  ])
  return [orderPhase1, orderPhase2, finance, returns, push, customer, review, marketing]
}

export async function loadRecentEvents(env, codes, limit) {
  const placeholders = codes.map(() => '?').join(',')
  const rows = await safeAll(env, `
    SELECT id, platform, shop, shop_id, event_code, order_id, status, message, payload, processed_at
    FROM marketplace_webhook_events
    WHERE event_code IN (${placeholders})
    ORDER BY id DESC
    LIMIT ${limit}
  `, codes)
  return rows.map(normalizeEvent)
}

export async function loadModuleData(env, limit = 8) {
  const [
    apiShopCount,
    shopeeApiShopCount,
    orderPhase1Count,
    orderPhase2Count,
    feeCount,
    returnCount,
    draftCount,
    variationCount,
    unmappedCount,
    webchatCount,
    reviewSummary,
    marketingCount,
    productPushCount,
    lazadaVideoCount,
    pushQueuePendingCount,
    recentWebchat,
    recentMarketing,
    recentProductPush,
    recentDrafts,
    recentVariations,
    recentReturns,
    recentFinance
  ] = await Promise.all([
    safeCount(env, `
      SELECT COUNT(*) AS total
      FROM (
        SELECT LOWER(COALESCE(platform, '')) AS platform_key,
               COALESCE(NULLIF(api_shop_id, ''), NULLIF(shop_name, ''), NULLIF(user_name, ''), id) AS shop_key
        FROM shops
        WHERE LOWER(COALESCE(platform, '')) IN ('shopee','lazada')
          AND access_token IS NOT NULL
          AND access_token != ''
        GROUP BY platform_key, shop_key
      )
    `),
    safeCount(env, `
      SELECT COUNT(*) AS total
      FROM shops
      WHERE LOWER(COALESCE(platform, '')) = 'shopee'
        AND access_token IS NOT NULL
        AND access_token != ''
        AND api_shop_id IS NOT NULL
        AND api_shop_id != ''
    `),
    safeCount(env, `
      SELECT COUNT(*) AS total
      FROM orders_v2
      WHERE LOWER(COALESCE(platform, '')) IN ('shopee','lazada')
        AND ${ORDER_PHASE1_ACTIVE_WHERE}
    `),
    safeCount(env, `
      SELECT COUNT(*) AS total
      FROM orders_v2
      WHERE LOWER(COALESCE(platform, '')) IN ('shopee','lazada')
        AND ${ORDER_PHASE2_CANDIDATE_WHERE}
    `),
    safeCount(env, `SELECT COUNT(*) AS total FROM order_fee_details`),
    safeCount(env, `SELECT COUNT(*) AS total FROM orders_v2 WHERE order_type IN ('return','cancel') OR oms_status IN ('RETURN','CANCELLED')`),
    safeCount(env, `SELECT COUNT(*) AS total FROM product_publish_drafts`),
    safeCount(env, `SELECT COUNT(*) AS total FROM product_variations`),
    safeCount(env, `SELECT COUNT(*) AS total FROM product_variations WHERE COALESCE(map_status, '') != 'MAPPED'`),
    safeCount(env, `SELECT COUNT(*) AS total FROM marketplace_webhook_events WHERE event_code = 'webchat_push'`),
    safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN is_negative = 1 THEN 1 ELSE 0 END) AS negative,
             SUM(CASE WHEN can_reply = 1 AND has_reply = 0 THEN 1 ELSE 0 END) AS need_reply,
             SUM(CASE WHEN COALESCE(platform_item_id, '') != '' AND (
               COALESCE(item_sku, '') = '' OR
               COALESCE(product_name, '') = '' OR
               LOWER(COALESCE(product_name, '')) = 'sản phẩm chưa rõ' OR
               COALESCE(shop_id, '') = ''
             ) THEN 1 ELSE 0 END) AS catalog_gap_reviews
      FROM marketplace_product_reviews
    `),
    safeCount(env, `SELECT COUNT(*) AS total FROM marketplace_webhook_events WHERE event_code IN ('item_promotion_push','promotion_update_push')`),
    safeCount(env, `SELECT COUNT(*) AS total FROM marketplace_webhook_events WHERE event_code IN ('${PRODUCT_CODES.join("','")}')`),
    safeCount(env, `SELECT COUNT(*) AS total FROM marketplace_video_library WHERE platform = 'lazada'`),
    safeCount(env, `SELECT COUNT(*) AS total FROM marketplace_push_sync_queue WHERE status IN ('queued','processing','failed')`),
    loadRecentEvents(env, ['webchat_push'], limit),
    loadRecentEvents(env, MARKETING_CODES, limit),
    loadRecentEvents(env, PRODUCT_CODES, limit),
    safeAll(env, `
      SELECT id, title, status, target_platforms, created_at, updated_at
      FROM product_publish_drafts
      ORDER BY id DESC
      LIMIT ${limit}
    `).then(rows => rows.map(normalizeDraft)),
    safeAll(env, `
      SELECT id, platform, shop, product_name, variation_name, platform_sku, internal_sku, price, discount_price, stock, map_status, updated_at
      FROM product_variations
      ORDER BY updated_at DESC, id DESC
      LIMIT ${limit}
    `).then(rows => rows.map(normalizeVariation)),
    safeAll(env, `
      SELECT order_id, platform, shop, order_type, shipping_status, oms_status, revenue, profit_real, return_fee, order_date, oms_updated_at
      FROM orders_v2
      WHERE order_type IN ('return','cancel') OR oms_status IN ('RETURN','CANCELLED')
      ORDER BY COALESCE(oms_updated_at, order_date) DESC, order_id DESC
      LIMIT ${limit}
    `).then(rows => rows.map(normalizeReturn)),
    safeAll(env, `
      SELECT f.order_id, f.platform, f.shop, f.source, f.total_fees, f.settlement, f.updated_at, o.revenue, o.profit_real
      FROM order_fee_details f
      LEFT JOIN orders_v2 o ON o.order_id = f.order_id
      ORDER BY f.updated_at DESC, f.order_id DESC
      LIMIT ${limit}
    `).then(rows => rows.map(normalizeFinance))
  ])

  const workspaces = await loadWorkspaces(env, limit)

  const modules = [
    {
      id: 'product_publish',
      group: 'Sản phẩm',
      title: 'Đăng/sửa sản phẩm trực tiếp',
      status: 'module_ready_prepare',
      count: draftCount,
      count_label: 'bản nháp',
      summary: 'Đã có luồng tạo bản nháp đa sàn, giữ nguyên SKU gốc, dùng AI để viết tiêu đề và mô tả khác nhau trước khi đăng.',
      next_step: 'Mở khu đăng sản phẩm để chọn nguồn bài đăng, shop đích, kiểm tra ảnh/video/phân loại rồi mới đẩy lên sàn.',
      actions: [
        { type: 'link', label: 'Mở khu đăng sản phẩm', href: 'admin-products.html#publish' },
        { type: 'api', action: 'refresh_products', label: 'Làm mới bài đăng nguồn' }
      ]
    },
    {
      id: 'stock_price_push',
      group: 'Kho và giá',
      title: 'Đồng bộ tồn kho, giá, SKU nhiều shop',
      status: 'module_ready',
      count: variationCount,
      count_label: 'phân loại',
      summary: 'OMS đã đọc bài đăng, phân loại, giá, tồn và map SKU theo từng shop API. Shopee Push giá/tồn cũng được ghi nhận để kích hoạt làm mới.',
      next_step: unmappedCount > 0
        ? `Còn ${unmappedCount.toLocaleString('vi-VN')} phân loại chưa map SKU, nên xử lý trước khi đẩy tồn hàng loạt.`
        : 'Các phân loại hiện đã đủ dữ liệu để đối chiếu trước khi đẩy tồn/giá lên sàn.',
      actions: [
        { type: 'api', action: 'refresh_products', label: 'Đồng bộ giá/tồn mới' }
      ]
    },
    {
      id: 'order_phase1',
      group: 'Đơn hàng',
      title: 'Order API phase 1',
      status: 'module_ready_read',
      count: orderPhase1Count,
      count_label: 'đơn cần theo dõi',
      summary: 'Phase 1 gom đơn Shopee/Lazada cần thao tác vào một khu: khách yêu cầu hủy, đã đóng gói, thiếu tracking, hoàn/trả và phân biệt rõ shop có API với shop không API.',
      next_step: 'Bấm làm mới order phase 1 để kéo đơn/trạng thái mới; thao tác ghi thật như xác nhận hủy vẫn đi qua guard riêng trên OMS.',
      actions: [
        { type: 'api', action: 'refresh_order_phase1', label: 'Làm mới order phase 1' },
        { type: 'link', label: 'Xem khu order phase 1', href: '#api-workspace-order_phase1' }
      ]
    },
    {
      id: 'order_phase2',
      group: 'Đơn hàng',
      title: 'Order API phase 2',
      status: 'module_ready_write_guard',
      count: orderPhase2Count,
      count_label: 'đơn cần guard',
      summary: 'Phase 2 chuẩn bị thao tác an toàn: dry-run ship_order/mass_ship_order cho Shopee, giữ hủy đơn ở guard chọn hướng và tách Lazada/shop không API khỏi luồng ghi thật.',
      next_step: 'Bấm preview dry-run phase 2 để tạo payload nháp và log an toàn; hệ thống không gửi lệnh ghi thật nếu thiếu execute=true và chuỗi xác nhận riêng.',
      actions: [
        { type: 'api', action: 'preview_order_phase2', label: 'Preview dry-run phase 2' },
        { type: 'link', label: 'Xem khu order phase 2', href: '#api-workspace-order_phase2' }
      ]
    },
    {
      id: 'finance_reconcile',
      group: 'Tài chính',
      title: 'Đối soát phí/lãi thực',
      status: 'module_ready',
      count: feeCount,
      count_label: 'đơn có phí',
      summary: 'Khi cập nhật trạng thái API, hệ thống lấy phí Shopee/Lazada có sẵn, lưu bảng đối soát và tính lại lãi thực.',
      next_step: 'Dùng nút cập nhật phí để kéo lại đơn gần đây, sau đó kiểm tra phần lãi thực trong dashboard.',
      actions: [
        { type: 'api', action: 'refresh_finance', label: 'Cập nhật phí/lãi' }
      ]
    },
    {
      id: 'returns_claims',
      group: 'Sau bán',
      title: 'Hoàn/trả/khiếu nại',
      status: 'module_ready',
      count: returnCount,
      count_label: 'đơn hoàn/hủy',
      summary: 'Webhook Shopee return_updates_push và trạng thái đơn API được gom về một khu để theo dõi hoàn, hủy và khiếu nại.',
      next_step: 'Cập nhật hoàn/trả để lấy lại trạng thái mới nhất trước khi xử lý khiếu nại hoặc đối soát phí hoàn.',
      actions: [
        { type: 'api', action: 'refresh_returns', label: 'Cập nhật hoàn/trả' }
      ]
    },
    {
      id: 'chat_reviews',
      group: 'CSKH',
      title: 'Chat, đánh giá, hiệu suất shop',
      status: 'module_ready_read',
      count: webchatCount,
      count_label: 'tín hiệu chat',
      summary: 'Shopee Webchat Push đã được ghi log vào OMS và OMS đã có bảng hiệu suất shop 30 ngày để ưu tiên CSKH.',
      next_step: 'Dùng khu CSKH bên dưới để xem shop nào có tỷ lệ hoàn/huỷ cao; thao tác gửi tin vẫn cần xác nhận riêng.',
      actions: [
        { type: 'api', action: 'refresh_customer_care', label: 'Làm mới CSKH/hiệu suất' },
        { type: 'link', label: 'Xem tín hiệu chat', href: '#api-module-signals' }
      ]
    },
    {
      id: 'review_core',
      group: 'CSKH',
      title: 'Đánh giá sản phẩm',
      status: safeNumber(reviewSummary?.total) ? 'module_ready_read' : 'module_ready_prepare',
      count: safeNumber(reviewSummary?.total),
      count_label: 'review',
      summary: 'Review Shopee/Lazada được đọc về core chung để lọc đánh giá xấu, repair mapping từ catalog và cảnh báo sản phẩm đang có rủi ro ADS.',
      next_step: safeNumber(reviewSummary?.catalog_gap_reviews)
        ? `Còn ${safeNumber(reviewSummary?.catalog_gap_reviews).toLocaleString('vi-VN')} review thiếu map SKU/tên; chạy nút sửa mapping review hoặc đồng bộ bài đăng cho shop còn thiếu catalog.`
        : (safeNumber(reviewSummary?.need_reply) || safeNumber(reviewSummary?.negative)
          ? `Cần xử lý ${safeNumber(reviewSummary?.need_reply).toLocaleString('vi-VN')} review chưa trả lời và ${safeNumber(reviewSummary?.negative).toLocaleString('vi-VN')} review xấu; reply thật vẫn khóa preview/log.`
          : 'Bấm cập nhật đánh giá API để kéo dữ liệu mới; nếu Lazada cần phủ sâu hơn thì chạy batch 28 ngày.'),
      actions: [
        { type: 'api', action: 'sync_marketplace_reviews', label: 'Cập nhật đánh giá API' },
        { type: 'api', action: 'sync_lazada_review_batch', platform: 'lazada', label: 'Batch Lazada 28 ngày an toàn' },
        { type: 'api', action: 'repair_review_catalog_mapping', label: 'Sửa mapping review' }
      ]
    },
    {
      id: 'marketing',
      group: 'Marketing',
      title: 'Voucher, freeship, flash sale, ads/campaign',
      status: 'module_ready_read',
      count: marketingCount,
      count_label: 'tín hiệu marketing',
      summary: 'Các push khuyến mãi, phí ads và SKU còn tồn được gom lại để chuẩn bị voucher, freeship, flash sale hoặc ads.',
      next_step: 'Dùng khu Marketing bên dưới để chọn SKU ứng viên; tạo/sửa chiến dịch thật sẽ tách thành bước xác nhận.',
      actions: [
        { type: 'api', action: 'refresh_marketing', label: 'Làm mới marketing' },
        { type: 'api', action: 'read_open_campaign_products', platform: 'shopee', label: 'Đọc Open Campaign' },
        { type: 'link', label: 'Xem tín hiệu marketing', href: '#api-module-signals' }
      ]
    },
    {
      id: 'shopee_shop_snapshot',
      group: 'Shop',
      title: 'Shopee Shop profile, kho và chế độ nghỉ',
      status: 'module_ready_read',
      count: shopeeApiShopCount,
      count_label: 'shop Shopee API',
      summary: 'Đã nối các endpoint Shop trong hình ở chế độ đọc-only để đối chiếu hồ sơ shop, kho, thông báo, brand và holiday mode.',
      next_step: 'Trong Trung tâm API, mở từng thẻ Shopee và bấm Đọc hồ sơ shop; update_profile và set_shop_holiday_mode vẫn khóa vì là lệnh ghi thật.',
      actions: [
        { type: 'link', label: 'Xem Shop API', href: '#api-shop-list' }
      ]
    },
    {
      id: 'shopee_media_endpoints',
      group: 'Video',
      title: 'Shopee Media và MediaSpace',
      status: 'module_ready_write_guard',
      count: shopeeApiShopCount,
      count_label: 'shop Shopee API',
      summary: 'Đã nối Media public cho Shopee Video và MediaSpace shop-token cho ảnh/video sản phẩm; upload thật bị khóa bằng route guard.',
      next_step: 'Mở Trung tâm video > Shop / API để kiểm Media của từng shop. Module tạo/sửa sản phẩm sẽ dùng MediaSpace khi có preview payload riêng.',
      actions: [
        { type: 'link', label: 'Mở Shop / API video', href: 'dashboard_video.html?view=shop' }
      ]
    },
    {
      id: 'lazada_video_media',
      group: 'Video',
      title: 'Lazada Media Center video',
      status: 'module_ready_write_guard',
      count: lazadaVideoCount,
      count_label: 'video Lazada',
      summary: 'Đã nối Media Center API để đọc quota, upload ảnh cover, upload video theo block và tra video_id; dữ liệu lưu về core video chung.',
      next_step: 'Dùng Trung tâm video > Lazada video. Xóa video là lệnh thật nên API backend bắt buộc chuỗi xác nhận riêng.',
      actions: [
        { type: 'link', label: 'Mở Lazada video', href: 'dashboard_video.html?view=lazada' }
      ]
    },
    {
      id: 'product_events',
      group: 'Sàn',
      title: 'Cảnh báo bài đăng, video, vi phạm',
      status: 'module_ready_read',
      count: productPushCount,
      count_label: 'tín hiệu bài đăng',
      summary: 'Các push về giá, tồn, video, vi phạm và đăng lịch lỗi đã được phân loại để shop biết bài nào cần xử lý.',
      next_step: 'Khi có sự kiện mới, mở tín hiệu gần đây để biết shop, mã bài đăng và hành động cần làm.',
      actions: [
        { type: 'link', label: 'Xem tín hiệu bài đăng', href: '#api-module-signals' }
      ]
    }
  ]

  const signals = [
    ...recentWebchat,
    ...recentMarketing,
    ...recentProductPush,
    ...recentReturns,
    ...recentFinance,
    ...recentDrafts,
    ...recentVariations
  ]
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    .slice(0, 30)

  return {
    status: 'ok',
    counters: {
      api_shops: apiShopCount,
      fee_details: feeCount,
      returns: returnCount,
      publish_drafts: draftCount,
      product_variations: variationCount,
      unmapped_variations: unmappedCount,
      webchat_events: webchatCount,
      reviews: safeNumber(reviewSummary?.total),
      review_negative: safeNumber(reviewSummary?.negative),
      review_need_reply: safeNumber(reviewSummary?.need_reply),
      review_catalog_gap: safeNumber(reviewSummary?.catalog_gap_reviews),
      marketing_events: marketingCount,
      product_events: productPushCount,
      lazada_video_media: lazadaVideoCount,
      shopee_media_endpoints: shopeeApiShopCount,
      shopee_shop_snapshot: shopeeApiShopCount,
      order_phase1: orderPhase1Count,
      order_phase2: orderPhase2Count,
      push_queue_pending: pushQueuePendingCount
    },
    modules,
    workspaces,
    recent: {
      webchat: recentWebchat,
      marketing: recentMarketing,
      product_events: recentProductPush,
      drafts: recentDrafts,
      stock_price: recentVariations,
      returns: recentReturns,
      finance: recentFinance
    },
    signals
  }
}
