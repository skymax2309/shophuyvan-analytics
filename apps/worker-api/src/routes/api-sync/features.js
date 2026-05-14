import { fetchShopeeOpenCampaignAddedProducts, syncApiOrders, syncApiOrderStatuses, syncApiProducts } from '../api-sync.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function parseShopDate(value) {
  const text = cleanText(value)
  if (!text) return null
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text)
  const normalized = hasTimezone ? text : `${text.replace(' ', 'T')}Z`
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : null
}

function minutesUntil(value) {
  const timestamp = parseShopDate(value)
  if (!timestamp) return null
  return Math.round((timestamp - Date.now()) / 60000)
}

function tokenStatus(shop) {
  if (!shop.has_access_token) return { code: 'missing', text: 'Chưa cấp quyền API' }
  const accessMinutes = minutesUntil(shop.token_expire_at)
  const refreshMinutes = minutesUntil(shop.api_refresh_expire_at)
  if (accessMinutes !== null && accessMinutes <= 0) return { code: 'expired', text: 'Access token đã hết hạn' }
  if (refreshMinutes !== null && refreshMinutes <= 0) return { code: 'refresh_expired', text: 'Refresh token đã hết hạn' }
  if (accessMinutes !== null && accessMinutes <= 60) return { code: 'warning', text: `Access token còn khoảng ${accessMinutes} phút` }
  if (refreshMinutes !== null && refreshMinutes <= 24 * 60) return { code: 'warning', text: `Refresh token còn khoảng ${Math.max(1, Math.round(refreshMinutes / 60))} giờ` }
  return { code: 'ok', text: 'Đang hoạt động' }
}

async function safeCount(env, sql) {
  try {
    const row = await env.DB.prepare(sql).first()
    return Number(row?.total || 0)
  } catch {
    return 0
  }
}

async function loadWebhookStatus(env) {
  try {
    const { results: recent } = await env.DB.prepare(`
      SELECT id, platform, shop, shop_id, event_code, order_id, status, verified, message, processed_at
      FROM marketplace_webhook_events
      ORDER BY id DESC
      LIMIT 30
    `).all()
    const { results: summary } = await env.DB.prepare(`
      SELECT platform, status, COUNT(*) AS total
      FROM marketplace_webhook_events
      WHERE processed_at >= datetime('now', '-7 days')
      GROUP BY platform, status
      ORDER BY platform, status
    `).all()
    return { recent: recent || [], summary: summary || [] }
  } catch {
    return { recent: [], summary: [] }
  }
}

const FEATURE_CATALOG = [
  {
    id: 'realtime_orders',
    group: 'Đơn hàng',
    name: 'Tự kéo đơn, trạng thái và tracking realtime',
    status: 'ready',
    summary: 'Webhook đã sẵn sàng nhận Shopee Push 30/30 và Lazada push để đánh thức đồng bộ ngay khi sàn đẩy sự kiện; cron 5 phút vẫn chạy dự phòng.',
    next_step: 'Nếu chưa thấy sự kiện mới, kiểm tra Push Log trên sàn và callback URL đang trỏ về OMS.'
  },
  {
    id: 'api_labels',
    group: 'Vận chuyển',
    name: 'Tạo, in và tải tem vận chuyển qua API',
    status: 'ready',
    summary: 'Đã có luồng lấy tem Shopee/Lazada qua API và lưu file vào R2 theo từng mã đơn.',
    next_step: 'Ưu tiên dùng nút tải lại tem API trước, chỉ dùng Chrome khi sàn không trả file hợp lệ.'
  },
  {
    id: 'stock_price_sku',
    group: 'Kho',
    name: 'Đồng bộ tồn kho, giá và SKU nhiều shop',
    status: 'partial',
    summary: 'Đã kéo bài đăng/variation/SKU/tồn kho từ Shopee/Lazada; Shopee push tồn kho/giá sẽ tự kích hoạt đồng bộ lại bài đăng.',
    next_step: 'Chiều đẩy giá/tồn lên sàn cần bổ sung module update API để dùng quyền đã bật.'
  },
  {
    id: 'listing_publish',
    group: 'Sản phẩm',
    name: 'Đăng/sửa sản phẩm, ảnh, video, phân loại, giá, tồn',
    status: 'partial',
    summary: 'Đã có vùng tạo bản nháp đăng đa sàn, lấy bài đăng nguồn, giữ SKU và tạo nội dung khác nhau bằng AI; push video/vi phạm/scheduled publish sẽ được ghi log.',
    next_step: 'Đẩy trực tiếp lên sàn cần bổ sung module publish/update API theo từng sàn.'
  },
  {
    id: 'shopee_media_endpoints',
    group: 'Video',
    name: 'Shopee Media và MediaSpace',
    status: 'module_ready_write_guard',
    summary: 'Đã nối Media public cho Shopee Video và MediaSpace shop-token cho ảnh/video sản phẩm. Upload thật đều đi qua guard backend.',
    next_step: 'Dùng Trung tâm video > Shop / API để xem shop nào đủ Media/MediaSpace; module publish sản phẩm sẽ dùng MediaSpace để gắn ảnh/video.'
  },
  {
    id: 'fee_reconcile',
    group: 'Tài chính',
    name: 'Đối soát phí và lãi thực',
    status: 'module_ready_read',
    summary: 'Đã có khu đối soát riêng: tổng phí, quyết toán, đơn thiếu phí và dòng phí/lãi mới nhất theo shop.',
    next_step: 'Bước tiếp theo là bổ sung Lazada transaction/payout trực tiếp để đối soát sâu hơn phần sàn trả tiền.'
  },
  {
    id: 'returns_claims',
    group: 'Sau bán',
    name: 'Theo dõi hoàn/trả/khiếu nại',
    status: 'module_ready_read',
    summary: 'Đã có khu hoàn/trả riêng: tổng đơn cần theo dõi, hoàn/trả, huỷ, phí hoàn và danh sách đơn mới.',
    next_step: 'Các thao tác phản hồi khiếu nại/dispute thật sẽ tách thành bước xác nhận riêng.'
  },
  {
    id: 'token_alerts',
    group: 'Hệ thống',
    name: 'Cảnh báo shop sắp hết hạn token/API',
    status: 'ready',
    summary: 'Đã đọc hạn access/refresh token từng shop, có thể cảnh báo trên giao diện và tự refresh Shopee theo lịch.',
    next_step: 'Lazada cần gia hạn theo refresh token khi app cho phép.'
  },
  {
    id: 'chat_reviews_performance',
    group: 'CSKH',
    name: 'Chat, đánh giá sản phẩm và hiệu suất shop',
    status: 'module_ready_read',
    summary: 'Đã có khu CSKH riêng: tín hiệu chat, hiệu suất shop 30 ngày, tỷ lệ hoàn/huỷ và dòng chat mới.',
    next_step: 'Gửi tin nhắn hoặc phản hồi đánh giá thật sẽ luôn cần xác nhận trước khi gửi lên sàn.'
  },
  {
    id: 'marketing',
    group: 'Marketing',
    name: 'Voucher, freeship, flash sale, ads/campaign',
    status: 'module_ready_read',
    summary: 'Đã có khu Marketing riêng: tín hiệu khuyến mãi, phí ads đã phát sinh và SKU còn tồn để chuẩn bị campaign.',
    next_step: 'Tạo/sửa voucher, freeship, flash sale hoặc ads thật sẽ có màn xác nhận riêng vì tác động trực tiếp lên shop.'
  },
  {
    id: 'lazada_video_media',
    group: 'Video',
    name: 'Lazada Media Center video',
    status: 'module_ready_write_guard',
    summary: 'Đã nối Media Center API để đọc quota, upload ảnh cover, upload video theo block và tra video_id; dữ liệu lưu về core video chung.',
    next_step: 'Dùng Trung tâm video > Lazada video. Lazada chưa có endpoint analytics/list đồng cấp Shopee nên hiệu quả video vẫn là tham chiếu.'
  },
  {
    id: 'shopee_shop_snapshot',
    group: 'Shop',
    name: 'Shopee Shop profile, kho và chế độ nghỉ',
    status: 'module_ready_read',
    summary: 'Đã nối nhóm endpoint Shopee Shop trong hình ở chế độ đọc-only: thông tin shop, hồ sơ, kho, thông báo, brand reseller, Brand Registry và holiday mode.',
    next_step: 'Mở Trung tâm API > Shop API > Đọc hồ sơ shop. Các lệnh update_profile và set_shop_holiday_mode vẫn khóa preview/xác nhận/log trước khi gọi thật.'
  },
  {
    id: 'shopee_ams_open_campaign_products',
    group: 'Marketing',
    name: 'Shopee AMS Open Campaign products',
    status: 'module_ready_read',
    summary: 'Đã nối endpoint trong hình `get_open_campaign_added_product` để đọc sản phẩm đang nằm trong Open Campaign, trạng thái campaign, commission rate và thời gian khuyến mãi.',
    next_step: 'Dùng action Đọc Open Campaign ở module Marketing. Nếu Shopee báo chưa đồng ý AMS T&C hoặc thiếu quyền Affiliate Marketing Solution Management thì xử lý trên Seller Center trước.'
  }
]

const SHOPEE_PERMISSION_MATRIX = [
  {
    group: 'Media',
    permission: 'Shopee Video Management / Product Management',
    status: 'module_ready_write_guard',
    oms_usage: 'Luồng đăng Shopee Video đã gọi init_video_upload, upload_video_part, complete_video_upload và get_video_upload_result trước khi edit/post video.',
    endpoint_usage: '/api/v2/media/init_video_upload, /api/v2/media/upload_video_part, /api/v2/media/complete_video_upload, /api/v2/media/get_video_upload_result, /api/v2/media/cancel_video_upload, /api/v2/media/upload_image',
    next_step: 'Upload video bán hàng thật vẫn yêu cầu shop có Shopee Video API riêng, token user_id và test quyền OK.'
  },
  {
    group: 'MediaSpace',
    permission: 'Product Management / ERP System',
    status: 'module_ready_write_guard',
    oms_usage: 'Backend đã có route upload ảnh và video sản phẩm bằng shop token, có xác nhận trước khi tạo media thật.',
    endpoint_usage: '/api/v2/media_space/upload_image, /api/v2/media_space/init_video_upload, /api/v2/media_space/upload_video_part, /api/v2/media_space/complete_video_upload, /api/v2/media_space/get_video_upload_result, /api/v2/media_space/cancel_video_upload',
    next_step: 'Nối tiếp vào module tạo/sửa sản phẩm để gắn image_id/video_upload_id sau khi người vận hành duyệt preview.'
  }
]

const LAZADA_PERMISSION_MATRIX = [
  {
    group: 'Order Information',
    permission: 'GetOrders, GetOrderItems, GetDocument',
    status: 'ready',
    oms_usage: 'Kéo đơn, đọc item, lưu phí có trong đơn và tải tem vận chuyển.',
    endpoint_usage: '/orders/get, /order/items/get, /order/document/get',
    next_step: 'Đã đủ để dùng cho luồng đơn hàng và tem API hiện tại.'
  },
  {
    group: 'Order Fulfillment',
    permission: 'SetStatusToPackedByMarketplace, SetStatusToReadyToShip, SetInvoiceNumber, SetStatusToCanceled',
    status: 'partial',
    oms_usage: 'Đọc trạng thái và tem đã dùng được; thao tác đổi trạng thái lên sàn cần màn xác nhận riêng.',
    endpoint_usage: 'Chưa bật thao tác ghi tự động để tránh ảnh hưởng đơn thật.',
    next_step: 'Nên làm nút xác nhận theo từng đơn/lô trước khi gọi API fulfillment.'
  },
  {
    group: 'Logistics',
    permission: 'GetShipmentProviders và dữ liệu logistics liên quan',
    status: 'ready',
    oms_usage: 'Đọc đơn vị vận chuyển, mã vận đơn và trace để cập nhật giao hàng.',
    endpoint_usage: '/logistic/order/trace',
    next_step: 'Đã dùng trong luồng cập nhật trạng thái/tracking Lazada.'
  },
  {
    group: 'Product Information',
    permission: 'GetProducts, GetQcStatus, GetResponse, GetProductItem',
    status: 'ready',
    oms_usage: 'Đồng bộ bài đăng, SKU, phân loại, giá, tồn, ảnh, mô tả và video nguồn.',
    endpoint_usage: '/products/get',
    next_step: 'Đã dùng cho phần nguồn bài đăng và đồng bộ SKU/bài đăng.'
  },
  {
    group: 'Product Management',
    permission: 'CreateProduct, UpdateProduct, RemoveProduct, UploadImage, MigrateImage, SetImages',
    status: 'needs_module',
    oms_usage: 'OMS đã có bản nháp đăng đa sàn và AI viết lại nội dung; chưa gọi API ghi sản phẩm lên Lazada.',
    endpoint_usage: 'Chưa gọi API tạo/sửa/xóa sản phẩm trực tiếp.',
    next_step: 'Cần thêm module publish/update có preview và xác nhận trước khi đẩy sản phẩm thật.'
  },
  {
    group: 'Media Center API',
    permission: 'GetVideoQuota, GetVideo, InitCreateVideo, UploadVideoBlock, CompleteCreateVideo, RemoveVideo, UploadImage',
    status: 'module_ready_write_guard',
    oms_usage: 'Trung tâm video đã đọc quota, upload ảnh cover, upload video theo block và tra video_id; lệnh xóa bị khóa bằng chuỗi xác nhận.',
    endpoint_usage: '/media/video/quota/get, /media/video/get, /media/video/block/create, /media/video/block/upload, /media/video/block/commit, /media/video/remove, /image/upload',
    next_step: 'Chưa có analytics/list Lazada Video trong tài liệu đã rà, nên chưa tính hiệu quả video như Shopee.'
  },
  {
    group: 'Price Stock Management',
    permission: 'UpdatePriceQuantity',
    status: 'needs_module',
    oms_usage: 'OMS đã đọc giá/tồn và map SKU; chiều đẩy giá/tồn lên sàn chưa bật.',
    endpoint_usage: 'Chưa gọi UpdatePriceQuantity.',
    next_step: 'Cần thêm màn chọn SKU, kho nguồn và xác nhận để đẩy giá/tồn hàng loạt.'
  },
  {
    group: 'Finance',
    permission: 'GetTransactionDetails, GetPayoutStatus',
    status: 'partial',
    oms_usage: 'Hiện đang đối soát phí Lazada từ dữ liệu order/item; chưa dùng transaction/payout sâu.',
    endpoint_usage: 'Chưa gọi Finance endpoint trực tiếp.',
    next_step: 'Cần thêm module Finance Lazada để lấy transaction và payout thay vì chỉ suy luận từ đơn.'
  },
  {
    group: 'Reverse Order Management',
    permission: 'Quản lý return orders',
    status: 'partial',
    oms_usage: 'OMS đang nhận diện hoàn/hủy từ trạng thái đơn và logistics.',
    endpoint_usage: 'Chưa gọi API hoàn/trả/khiếu nại chi tiết.',
    next_step: 'Cần thêm module đọc return/refund/dispute để phân biệt lý do và phí hoàn.'
  },
  {
    group: 'Promotion Tools',
    permission: 'Creating and Updating Promotion Rules in Seller Center',
    status: 'needs_module',
    oms_usage: 'Chưa tạo/sửa voucher, freeship hoặc flash sale bằng API.',
    endpoint_usage: 'Chưa gọi Promotion Tools endpoint.',
    next_step: 'Nên bắt đầu bằng màn đọc danh sách khuyến mãi, sau đó mới thêm nút tạo/sửa.'
  },
  {
    group: 'Sponsor Solution',
    permission: 'CreateCampaign, UpdateCampaign',
    status: 'needs_module',
    oms_usage: 'Chưa quản lý ads/campaign Lazada trong OMS.',
    endpoint_usage: 'Chưa gọi Sponsor Solution endpoint.',
    next_step: 'Cần module riêng cho ngân sách, campaign và cảnh báo để tránh chỉnh nhầm quảng cáo thật.'
  },
  {
    group: 'Seller Information',
    permission: 'GetSeller API',
    status: 'ready',
    oms_usage: 'Đọc seller_id để định danh shop khi gọi trace và đồng bộ.',
    endpoint_usage: '/seller/get',
    next_step: 'Đã dùng để gắn dữ liệu Lazada đúng shop.'
  },
  {
    group: 'Seller Profile / Seller Information',
    permission: 'SellerUpdate, UserUpdate, share seller information',
    status: 'needs_module',
    oms_usage: 'Chưa sửa hồ sơ shop hoặc thông tin seller từ OMS.',
    endpoint_usage: 'Chưa gọi endpoint cập nhật seller.',
    next_step: 'Không nên tự động cập nhật hồ sơ shop; chỉ làm khi có màn xác nhận riêng.'
  }
]

async function loadShops(env) {
  const { results } = await env.DB.prepare(`
    SELECT id, shop_name, user_name, platform, api_shop_id, api_partner_id,
           token_expire_at, api_refresh_expire_at, api_connected_at, last_api_refresh_at,
           CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 1 ELSE 0 END AS has_access_token,
           CASE WHEN refresh_token IS NOT NULL AND refresh_token != '' THEN 1 ELSE 0 END AS has_refresh_token,
           CASE WHEN api_partner_key IS NOT NULL AND api_partner_key != '' THEN 1 ELSE 0 END AS has_partner_key
      FROM shops
      WHERE LOWER(COALESCE(platform, '')) IN ('shopee', 'lazada')
      ORDER BY platform, shop_name
  `).all()

  const byIdentity = new Map()
  for (const shop of results || []) {
    const platform = cleanText(shop.platform).toLowerCase()
    const identity = shop.api_shop_id ? `${platform}:${shop.api_shop_id}` : `${platform}:${shop.shop_name || shop.user_name || shop.id}`
    const existing = byIdentity.get(identity)
    const generatedName = platform === 'shopee' && /^Shopee\s+\d+$/i.test(cleanText(shop.shop_name))
    const currentNamed = shop.shop_name && !generatedName
    if (!existing || currentNamed) byIdentity.set(identity, shop)
  }

  return [...byIdentity.values()].map(shop => ({
    ...shop,
    display_name: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id || `Shop ${shop.id}`),
    platform: cleanText(shop.platform).toLowerCase(),
    token_status: tokenStatus(shop),
    access_expires_in_minutes: minutesUntil(shop.token_expire_at),
    refresh_expires_in_minutes: minutesUntil(shop.api_refresh_expire_at)
  }))
}

function actionOptions(action, body) {
  const platform = cleanText(body.platform).toLowerCase()
  const shop = cleanText(body.shop || body.shop_name)
  return {
    platform,
    shop,
    days: body.days || (platform === 'lazada' ? 60 : 15),
    limit: body.limit || (platform === 'lazada' ? 40 : 80),
    offset: body.offset || 0,
    statuses: body.statuses || 'READY_TO_SHIP,PROCESSED,SHIPPED,COMPLETED,CANCELLED,IN_CANCEL',
    includeOutOfStock: body.include_out_of_stock ?? body.includeOutOfStock ?? false
  }
}

export async function handleAdvancedApiFeatures(request, env, cors) {
  if (request.method === 'GET') {
    const [shops, webhooks, labelCount, feeCount, draftCount] = await Promise.all([
      loadShops(env),
      loadWebhookStatus(env),
      safeCount(env, `SELECT COUNT(*) AS total FROM order_labels WHERE error = '' OR error IS NULL`),
      safeCount(env, `SELECT COUNT(*) AS total FROM order_fee_details`),
      safeCount(env, `SELECT COUNT(*) AS total FROM product_publish_drafts`)
    ])

    return json({
      status: 'ok',
      features: FEATURE_CATALOG,
      shops,
      counters: {
        api_shops: shops.filter(shop => shop.has_access_token).length,
        token_warnings: shops.filter(shop => ['warning', 'expired', 'refresh_expired'].includes(shop.token_status.code)).length,
        labels_ready: labelCount,
        fee_details: feeCount,
        publish_drafts: draftCount
      },
      webhooks,
      permission_matrix: {
        shopee: SHOPEE_PERMISSION_MATRIX,
        lazada: LAZADA_PERMISSION_MATRIX
      },
      callback_urls: {
        shopee: 'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/webhooks/shopee',
        lazada: 'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/webhooks/lazada'
      }
    }, cors)
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, cors, 405)
  }

  let body = {}
  try { body = await request.json() } catch {}
  const action = cleanText(body.action).toLowerCase()
  const options = actionOptions(action, body)
  if (!options.platform || !['shopee', 'lazada'].includes(options.platform)) {
    return json({ error: 'Vui lòng chọn sàn Shopee hoặc Lazada.' }, cors, 400)
  }

  if (action === 'sync_orders') {
    return json(await syncApiOrders(env, cors, options), cors)
  }
  if (action === 'sync_status') {
    return json(await syncApiOrderStatuses(env, options), cors)
  }
  if (action === 'sync_products') {
    return json(await syncApiProducts(env, cors, options), cors)
  }
  if (action === 'read_open_campaign_products') {
    if (options.platform !== 'shopee') return json({ error: 'Open Campaign trong ảnh là endpoint Shopee AMS.' }, cors, 400)
    return json(await fetchShopeeOpenCampaignAddedProducts(env, {
      ...options,
      page_size: Math.min(Number(body.page_size || body.pageSize || body.limit || 20), 100),
      shop_limit: Math.min(Number(body.shop_limit || body.shopLimit || 3), 20),
      sort_by: body.sort_by || body.sortBy,
      search_type: body.search_type || body.searchType,
      search_content: body.search_content || body.searchContent
    }), cors)
  }
  if (action === 'sync_all') {
    const orders = await syncApiOrders(env, cors, options)
    const statuses = await syncApiOrderStatuses(env, options)
    const products = await syncApiProducts(env, cors, options)
    return json({ status: 'ok', orders, statuses, products }, cors)
  }

  return json({ error: 'Chưa hỗ trợ thao tác này.' }, cors, 400)
}
