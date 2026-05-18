import { listMarketplacePushSyncQueue } from '../../core/marketplace/push-core.js'
import { loadReviewCore } from '../../core/reviews/core.js'
import { cleanText, formatMoney, formatPercent, MARKETING_CODES, safeAll, safeFirst, safeNumber, workspaceMetric, workspaceRow } from './foundation-workspaces.js'
import { loadRecentEvents } from './module-data.js'

export async function loadFinanceWorkspace(env, limit) {
  const [summary, missing, byShop, recent] = await Promise.all([
    safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(COALESCE(total_fees, 0)) AS total_fees,
             SUM(COALESCE(settlement, 0)) AS settlement
      FROM order_fee_details
    `),
    safeFirst(env, `
      SELECT COUNT(*) AS total
      FROM orders_v2 o
      WHERE LOWER(COALESCE(o.platform, '')) IN ('shopee','lazada')
        AND NOT EXISTS (SELECT 1 FROM order_fee_details f WHERE f.order_id = o.order_id)
    `),
    safeAll(env, `
      SELECT platform, shop, COUNT(*) AS total,
             SUM(COALESCE(total_fees, 0)) AS total_fees,
             SUM(COALESCE(settlement, 0)) AS settlement
      FROM order_fee_details
      GROUP BY platform, shop
      ORDER BY total DESC
      LIMIT 6
    `),
    safeAll(env, `
      SELECT f.order_id, f.platform, f.shop, f.source, f.total_fees, f.settlement,
             f.updated_at, o.revenue, o.profit_real
      FROM order_fee_details f
      LEFT JOIN orders_v2 o ON o.order_id = f.order_id
      ORDER BY f.updated_at DESC, f.order_id DESC
      LIMIT ?
    `, [limit])
  ])

  const rows = recent.map(row => workspaceRow({
    title: `Đơn ${row.order_id}`,
    meta: `${cleanText(row.platform)} · ${cleanText(row.shop)} · ${cleanText(row.source || 'api_fee')}`,
    detail: `Phí ${formatMoney(row.total_fees)} · Quyết toán ${formatMoney(row.settlement)} · Lãi ${formatMoney(row.profit_real)}`,
    status: 'finance',
    time: row.updated_at
  }))

  return {
    id: 'finance_reconcile',
    group: 'Tài chính',
    title: 'Đối soát phí và lãi thực',
    status: 'module_ready',
    summary: 'Gom phí Shopee escrow và phí Lazada đọc được từ đơn/item, đối chiếu với doanh thu để xem lãi thực theo đơn.',
    metrics: [
      workspaceMetric('Đơn có phí API', safeNumber(summary?.total).toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Tổng phí đã đọc', formatMoney(summary?.total_fees), 'warning'),
      workspaceMetric('Tổng quyết toán', formatMoney(summary?.settlement), 'ok'),
      workspaceMetric('Đơn cần rà phí', safeNumber(missing?.total).toLocaleString('vi-VN'), safeNumber(missing?.total) ? 'warning' : 'ok')
    ],
    breakdown: byShop.map(row => workspaceRow({
      title: `${cleanText(row.platform)} · ${cleanText(row.shop)}`,
      detail: `${safeNumber(row.total).toLocaleString('vi-VN')} đơn · Phí ${formatMoney(row.total_fees)} · Quyết toán ${formatMoney(row.settlement)}`,
      status: 'finance'
    })),
    rows,
    actions: [
      { type: 'api', action: 'refresh_finance', label: 'Cập nhật phí/lãi' }
    ]
  }
}

export async function loadReturnsWorkspace(env, limit) {
  const where = `
    order_type IN ('return','cancel')
    OR oms_status IN ('RETURN','CANCELLED')
    OR shipping_status LIKE '%RETURN%'
    OR shipping_status LIKE '%CANCEL%'
    OR shipping_status LIKE '%FAILED%'
  `
  const [summary, byShop, byStatus, recent] = await Promise.all([
    safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN oms_status = 'RETURN' OR order_type = 'return' THEN 1 ELSE 0 END) AS returns,
             SUM(CASE WHEN oms_status = 'CANCELLED' OR order_type = 'cancel' THEN 1 ELSE 0 END) AS cancels,
             SUM(COALESCE(return_fee, 0)) AS return_fee
      FROM orders_v2
      WHERE ${where}
    `),
    safeAll(env, `
      SELECT platform, shop, COUNT(*) AS total,
             SUM(CASE WHEN oms_status = 'RETURN' OR order_type = 'return' THEN 1 ELSE 0 END) AS returns,
             SUM(CASE WHEN oms_status = 'CANCELLED' OR order_type = 'cancel' THEN 1 ELSE 0 END) AS cancels
      FROM orders_v2
      WHERE ${where}
      GROUP BY platform, shop
      ORDER BY total DESC
      LIMIT 6
    `),
    safeAll(env, `
      SELECT COALESCE(NULLIF(shipping_status, ''), NULLIF(oms_status, ''), NULLIF(order_type, ''), 'chưa rõ') AS status,
             COUNT(*) AS total
      FROM orders_v2
      WHERE ${where}
      GROUP BY COALESCE(NULLIF(shipping_status, ''), NULLIF(oms_status, ''), NULLIF(order_type, ''), 'chưa rõ')
      ORDER BY total DESC
      LIMIT 6
    `),
    safeAll(env, `
      SELECT order_id, platform, shop, order_type, shipping_status, oms_status,
             revenue, profit_real, return_fee, order_date, oms_updated_at
      FROM orders_v2
      WHERE ${where}
      ORDER BY COALESCE(oms_updated_at, order_date) DESC, order_id DESC
      LIMIT ?
    `, [limit])
  ])

  return {
    id: 'returns_claims',
    group: 'Sau bán',
    title: 'Theo dõi hoàn/trả/khiếu nại',
    status: 'module_ready',
    summary: 'Gom đơn hoàn, huỷ, giao thất bại và tín hiệu return push để xử lý trước khi mất phí hoặc trễ khiếu nại.',
    metrics: [
      workspaceMetric('Tổng đơn cần theo dõi', safeNumber(summary?.total).toLocaleString('vi-VN'), 'warning'),
      workspaceMetric('Hoàn/trả', safeNumber(summary?.returns).toLocaleString('vi-VN'), 'warning'),
      workspaceMetric('Đã huỷ', safeNumber(summary?.cancels).toLocaleString('vi-VN'), 'warning'),
      workspaceMetric('Phí hoàn đã ghi', formatMoney(summary?.return_fee), 'warning')
    ],
    breakdown: [
      ...byShop.map(row => workspaceRow({
        title: `${cleanText(row.platform)} · ${cleanText(row.shop)}`,
        detail: `${safeNumber(row.total).toLocaleString('vi-VN')} đơn · Hoàn ${safeNumber(row.returns).toLocaleString('vi-VN')} · Huỷ ${safeNumber(row.cancels).toLocaleString('vi-VN')}`,
        status: 'return'
      })),
      ...byStatus.map(row => workspaceRow({
        title: cleanText(row.status),
        detail: `${safeNumber(row.total).toLocaleString('vi-VN')} đơn`,
        status: 'return'
      }))
    ].slice(0, 8),
    rows: recent.map(row => workspaceRow({
      title: `Đơn ${row.order_id}`,
      meta: `${cleanText(row.platform)} · ${cleanText(row.shop)} · ${cleanText(row.order_type || row.oms_status)}`,
      detail: `${cleanText(row.shipping_status || 'chưa có trạng thái')} · Doanh thu ${formatMoney(row.revenue)} · Lãi ${formatMoney(row.profit_real)} · Phí hoàn ${formatMoney(row.return_fee)}`,
      status: cleanText(row.oms_status || row.order_type || 'return'),
      time: row.oms_updated_at || row.order_date
    })),
    actions: [
      { type: 'api', action: 'refresh_returns', label: 'Cập nhật hoàn/trả' }
    ]
  }
}

export async function loadPushWorkspace(env, limit) {
  const queue = await listMarketplacePushSyncQueue(env, { limit })
  const rows = (queue.rows || []).map(row => workspaceRow({
    title: `${cleanText(row.event_code || row.action_taken || 'push')} #${row.id}`,
    meta: `${cleanText(row.platform)} · ${cleanText(row.shop || row.shop_id || 'chưa rõ shop')}`,
    detail: `${cleanText(row.action_taken || 'log')} · đơn ${cleanText(row.order_id || 'không có')} · thử ${safeNumber(row.attempts).toLocaleString('vi-VN')} lần${row.last_error ? ` · lỗi: ${cleanText(row.last_error)}` : ''}`,
    status: cleanText(row.status || 'queued'),
    time: cleanText(row.updated_at || row.created_at)
  }))
  const summary = queue.summary || {}
  const pending = safeNumber(summary.queued) + safeNumber(summary.processing)
  const failed = safeNumber(summary.failed)

  return {
    id: 'push_incremental',
    group: 'Realtime',
    title: 'Hàng đợi push incremental',
    status: failed ? 'warning' : 'module_ready',
    summary: 'Webhook Shopee/Lazada được chuẩn hóa vào queue nội bộ để OMS retry sync đơn, hoàn/trả, label, sản phẩm hoặc chat mà không làm callback bị chậm.',
    metrics: [
      workspaceMetric('Đang chờ', pending.toLocaleString('vi-VN'), pending ? 'warning' : 'ok'),
      workspaceMetric('Đã xử lý', safeNumber(summary.done).toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Lỗi cần retry', failed.toLocaleString('vi-VN'), failed ? 'warning' : 'ok'),
      workspaceMetric('Chỉ ghi log', safeNumber(summary.log_only).toLocaleString('vi-VN'), 'ok')
    ],
    breakdown: rows.slice(0, 6),
    rows,
    actions: [
      { type: 'api', action: 'drain_push_queue', label: 'Chạy hàng đợi push' }
    ]
  }
}

export async function loadCustomerWorkspace(env, limit) {
  const [chatSummary, recentChats, performance] = await Promise.all([
    safeFirst(env, `
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_events
      FROM marketplace_webhook_events
      WHERE event_code = 'webchat_push'
    `),
    loadRecentEvents(env, ['webchat_push'], limit),
    safeAll(env, `
      SELECT platform, shop,
             COUNT(*) AS orders,
             SUM(COALESCE(revenue, 0)) AS revenue,
             SUM(COALESCE(profit_real, 0)) AS profit,
             SUM(CASE WHEN oms_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN oms_status IN ('RETURN','CANCELLED') OR order_type IN ('return','cancel') THEN 1 ELSE 0 END) AS problem_orders
      FROM orders_v2
      WHERE COALESCE(order_date, '') >= datetime('now', '-30 days')
      GROUP BY platform, shop
      ORDER BY orders DESC
      LIMIT 8
    `)
  ])

  const totalOrders = performance.reduce((sum, row) => sum + safeNumber(row.orders), 0)
  const totalProblem = performance.reduce((sum, row) => sum + safeNumber(row.problem_orders), 0)
  const problemRate = totalOrders ? (totalProblem * 100 / totalOrders) : 0

  return {
    id: 'chat_reviews',
    group: 'CSKH',
    title: 'Chat, đánh giá và hiệu suất shop',
    status: 'module_ready_read',
    summary: 'Theo dõi tín hiệu chat và hiệu suất từng shop từ dữ liệu đơn để ưu tiên trả lời, xử lý shop có tỷ lệ vấn đề cao.',
    metrics: [
      workspaceMetric('Tín hiệu chat', safeNumber(chatSummary?.total).toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Shop có đơn 30 ngày', performance.length.toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Đơn 30 ngày', totalOrders.toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Tỷ lệ vấn đề', formatPercent(problemRate), problemRate > 10 ? 'warning' : 'ok')
    ],
    breakdown: performance.map(row => {
      const orders = safeNumber(row.orders)
      const completedRate = orders ? safeNumber(row.completed) * 100 / orders : 0
      const problem = orders ? safeNumber(row.problem_orders) * 100 / orders : 0
      return workspaceRow({
        title: `${cleanText(row.platform)} · ${cleanText(row.shop)}`,
        detail: `${orders.toLocaleString('vi-VN')} đơn · Hoàn tất ${formatPercent(completedRate)} · Vấn đề ${formatPercent(problem)} · Lãi ${formatMoney(row.profit)}`,
        status: problem > 10 ? 'warning' : 'ok'
      })
    }),
    rows: recentChats.map(row => workspaceRow(row)),
    actions: [
      { type: 'api', action: 'refresh_customer_care', label: 'Làm mới CSKH/hiệu suất' }
    ]
  }
}

export async function loadReviewWorkspace(env, limit) {
  const core = await loadReviewCore(env, { limit })
  const summary = core.summary || {}
  const attentionRows = (core.attention || []).map(row => workspaceRow({
    title: `${safeNumber(row.rating_overall).toLocaleString('vi-VN')} sao · ${cleanText(row.product_name || row.platform_item_id || row.review_id || 'Đánh giá')}`,
    meta: `${cleanText(row.platform)} · ${cleanText(row.shop)}${row.order_id ? ` · đơn ${cleanText(row.order_id)}` : ''}`,
    detail: `${cleanText(row.review_text || 'Review không có nội dung chữ')}${row.has_reply ? ' · đã có phản hồi' : (row.can_reply ? ' · chưa trả lời' : ' · không mở trả lời')}`,
    status: row.is_negative ? 'warning' : (row.can_reply && !row.has_reply ? 'partial' : 'ok'),
    time: cleanText(row.reviewed_at || row.updated_at)
  }))
  const byShop = (core.by_shop || []).map(row => workspaceRow({
    title: `${cleanText(row.platform)} · ${cleanText(row.shop)}`,
    detail: `${safeNumber(row.total_reviews).toLocaleString('vi-VN')} review · xấu ${safeNumber(row.negative_reviews).toLocaleString('vi-VN')} · cần trả lời ${safeNumber(row.need_reply_reviews).toLocaleString('vi-VN')}`,
    status: safeNumber(row.negative_reviews) || safeNumber(row.need_reply_reviews) ? 'warning' : 'ok',
    time: cleanText(row.last_synced_at)
  }))
  const adsRisk = (core.ads_risk || []).slice(0, 4).map(row => workspaceRow({
    title: `${cleanText(row.product_name || row.platform_item_id || 'SKU có review xấu')} · ${safeNumber(row.rating_overall).toLocaleString('vi-VN')} sao`,
    meta: `${cleanText(row.platform)} · ${cleanText(row.shop)} · ${cleanText(row.campaign_name || row.campaign_id || 'campaign')}`,
    detail: `Review xấu đang trùng dữ liệu ADS có chi tiêu ${formatMoney(row.spend)} trong 14 ngày gần đây.`,
    status: 'warning',
    time: cleanText(row.snapshot_date)
  }))
  const catalogGapRows = (core.catalog_gap_samples || []).slice(0, 3).map(row => workspaceRow({
    title: `${cleanText(row.product_name || row.platform_item_id || row.review_id || 'Review thiếu map')} · ${cleanText(row.platform_item_id || '-')}`,
    meta: `${cleanText(row.platform)} · ${cleanText(row.shop)}`,
    detail: `Review đang thiếu SKU/tên chuẩn từ catalog. SKU hiện tại: ${cleanText(row.item_sku || 'trống')}.`,
    status: 'partial',
    time: cleanText(row.reviewed_at || row.updated_at)
  }))

  return {
    id: 'review_core',
    group: 'CSKH',
    title: 'Đánh giá sản phẩm',
    status: safeNumber(summary.total_reviews) ? 'module_ready_read' : 'module_ready_prepare',
    summary: 'Đọc review Shopee/Lazada vào core chung, lọc đánh giá xấu, review chưa trả lời, repair mapping từ catalog và cảnh báo sản phẩm có review xấu đang trùng dữ liệu ADS.',
    metrics: [
      workspaceMetric('Tổng review', safeNumber(summary.total_reviews).toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Review xấu', safeNumber(summary.negative_reviews).toLocaleString('vi-VN'), safeNumber(summary.negative_reviews) ? 'warning' : 'ok'),
      workspaceMetric('Cần trả lời', safeNumber(summary.need_reply_reviews).toLocaleString('vi-VN'), safeNumber(summary.need_reply_reviews) ? 'warning' : 'ok'),
      workspaceMetric('Trùng ADS', safeNumber(summary.ads_risk_reviews).toLocaleString('vi-VN'), safeNumber(summary.ads_risk_reviews) ? 'warning' : 'ok'),
      workspaceMetric('Thiếu map catalog', safeNumber(summary.catalog_gap_reviews).toLocaleString('vi-VN'), safeNumber(summary.catalog_gap_reviews) ? 'warning' : 'ok')
    ],
    breakdown: [...adsRisk, ...catalogGapRows, ...byShop].slice(0, 8),
    rows: attentionRows,
    actions: [
      { type: 'api', action: 'sync_marketplace_reviews', label: 'Cập nhật đánh giá API' },
      { type: 'api', action: 'sync_lazada_review_batch', platform: 'lazada', label: 'Batch Lazada 28 ngày an toàn' },
      { type: 'api', action: 'repair_review_catalog_mapping', label: 'Sửa mapping review' }
    ]
  }
}

export async function loadMarketingWorkspace(env, limit) {
  const [eventSummary, recentMarketing, adFee, candidates] = await Promise.all([
    safeFirst(env, `
      SELECT COUNT(*) AS total
      FROM marketplace_webhook_events
      WHERE event_code IN ('item_promotion_push','promotion_update_push')
    `),
    loadRecentEvents(env, MARKETING_CODES, limit),
    safeFirst(env, `
      SELECT COUNT(*) AS orders, SUM(COALESCE(fee_ads, 0)) AS ads_fee
      FROM order_fee_details
      WHERE COALESCE(fee_ads, 0) > 0
    `),
    safeAll(env, `
      SELECT platform, shop, product_name, platform_sku, internal_sku,
             COALESCE(discount_price, price, 0) AS price, COALESCE(stock, 0) AS stock, map_status, updated_at
      FROM product_variations
      WHERE COALESCE(stock, 0) > 0
      ORDER BY COALESCE(stock, 0) DESC, updated_at DESC
      LIMIT ?
    `, [limit])
  ])

  return {
    id: 'marketing',
    group: 'Marketing',
    title: 'Voucher, freeship, flash sale, ads/campaign',
    status: 'module_ready_read',
    summary: 'Đọc tín hiệu khuyến mãi, phí ads đã phát sinh và gợi ý SKU còn tồn để chuẩn bị voucher/flash sale trước khi bấm tạo chiến dịch thật.',
    metrics: [
      workspaceMetric('Tín hiệu marketing', safeNumber(eventSummary?.total).toLocaleString('vi-VN'), 'ok'),
      workspaceMetric('Đơn có phí ads', safeNumber(adFee?.orders).toLocaleString('vi-VN'), 'warning'),
      workspaceMetric('Tổng phí ads', formatMoney(adFee?.ads_fee), 'warning'),
      workspaceMetric('SKU gợi ý', candidates.length.toLocaleString('vi-VN'), 'ok')
    ],
    breakdown: candidates.map(row => workspaceRow({
      title: cleanText(row.product_name || row.platform_sku || row.internal_sku),
      meta: `${cleanText(row.platform)} · ${cleanText(row.shop)}`,
      detail: `${cleanText(row.platform_sku || row.internal_sku || 'SKU chưa rõ')} · Tồn ${safeNumber(row.stock).toLocaleString('vi-VN')} · Giá ${formatMoney(row.price)} · ${cleanText(row.map_status || 'chưa map')}`,
      status: cleanText(row.map_status) === 'MAPPED' ? 'ok' : 'warning',
      time: row.updated_at
    })),
    rows: recentMarketing.map(row => workspaceRow(row)),
    actions: [
      { type: 'api', action: 'refresh_marketing', label: 'Làm mới marketing' }
    ]
  }
}
