import { hasShopeeVideoAppConfig, isShopeeVideoPermissionOk, isShopeeVideoTokenLive, parseShopeeVideoAuthDate, shopeeVideoUserId } from '../../core/shops/shopee-video-auth-core.js'
import { refreshShopeeVideoTokenForShop } from '../shops/index.js'
import { shopeeVideoMissingUserMessage, videoShopLabel } from './shared-api-client.js'

export const SHOPEE_VIDEO_LIST_PATH = '/api/v2/video/get_video_list'

export const SHOPEE_VIDEO_DETAIL_PATH = '/api/v2/video/get_video_detail'

export const SHOPEE_VIDEO_OVERVIEW_PATH = '/api/v2/video/get_overview_performance'

export const SHOPEE_VIDEO_TREND_PATH = '/api/v2/video/get_metric_trend'

export const SHOPEE_VIDEO_PERFORMANCE_LIST_PATH = '/api/v2/video/get_video_performance_list'

export const SHOPEE_VIDEO_PRODUCT_PERFORMANCE_LIST_PATH = '/api/v2/video/get_prodcut_performance_list'

export const SHOPEE_VIDEO_USER_DEMOGRAPHICS_PATH = '/api/v2/video/get_user_demographics'

export const SHOPEE_VIDEO_DETAIL_PERFORMANCE_PATH = '/api/v2/video/get_video_detail_performance'

export const SHOPEE_VIDEO_DETAIL_TREND_PATH = '/api/v2/video/get_video_detail_metric_trend'

export const SHOPEE_VIDEO_DETAIL_AUDIENCE_PATH = '/api/v2/video/get_video_detail_audience_distribution'

export const SHOPEE_VIDEO_DETAIL_PRODUCT_PATH = '/api/v2/video/get_video_detail_product_performance'

export const SHOPEE_VIDEO_COVER_LIST_PATH = '/api/v2/video/get_cover_list'

export const SHOPEE_VIDEO_EDIT_PATH = '/api/v2/video/edit_video_info'

export const SHOPEE_VIDEO_DELETE_PATH = '/api/v2/video/delete_video'

export const SHOPEE_VIDEO_POST_PATH = '/api/v2/video/post_video'

export const SHOPEE_MEDIA_INIT_VIDEO_UPLOAD_PATH = '/api/v2/media/init_video_upload'

export const SHOPEE_MEDIA_UPLOAD_VIDEO_PART_PATH = '/api/v2/media/upload_video_part'

export const SHOPEE_MEDIA_COMPLETE_VIDEO_UPLOAD_PATH = '/api/v2/media/complete_video_upload'

export const SHOPEE_MEDIA_GET_VIDEO_UPLOAD_RESULT_PATH = '/api/v2/media/get_video_upload_result'

export const SHOPEE_MEDIA_CANCEL_VIDEO_UPLOAD_PATH = '/api/v2/media/cancel_video_upload'

export const SHOPEE_MEDIA_UPLOAD_IMAGE_PATH = '/api/v2/media/upload_image'

export const SHOPEE_MEDIA_SPACE_INIT_VIDEO_UPLOAD_PATH = '/api/v2/media_space/init_video_upload'

export const SHOPEE_MEDIA_SPACE_UPLOAD_VIDEO_PART_PATH = '/api/v2/media_space/upload_video_part'

export const SHOPEE_MEDIA_SPACE_COMPLETE_VIDEO_UPLOAD_PATH = '/api/v2/media_space/complete_video_upload'

export const SHOPEE_MEDIA_SPACE_GET_VIDEO_UPLOAD_RESULT_PATH = '/api/v2/media_space/get_video_upload_result'

export const SHOPEE_MEDIA_SPACE_CANCEL_VIDEO_UPLOAD_PATH = '/api/v2/media_space/cancel_video_upload'

export const SHOPEE_MEDIA_SPACE_UPLOAD_IMAGE_PATH = '/api/v2/media_space/upload_image'

export const SHOPEE_MEDIA_SPACE_VIDEO_PART_BYTES = 4 * 1024 * 1024

export const SHOPEE_MEDIA_SPACE_MAX_VIDEO_BYTES = 30 * 1024 * 1024

export const SHOPEE_MEDIA_SPACE_MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const LAZADA_VIDEO_CREATE_PATH = '/media/video/block/create'

export const LAZADA_VIDEO_UPLOAD_BLOCK_PATH = '/media/video/block/upload'

export const LAZADA_VIDEO_COMMIT_PATH = '/media/video/block/commit'

export const LAZADA_VIDEO_GET_PATH = '/media/video/get'

export const LAZADA_VIDEO_QUOTA_PATH = '/media/video/quota/get'

export const LAZADA_VIDEO_REMOVE_PATH = '/media/video/remove'

export const LAZADA_IMAGE_UPLOAD_PATH = '/image/upload'

export const LAZADA_VIDEO_MAX_BYTES = 100 * 1024 * 1024

export const LAZADA_IMAGE_MAX_BYTES = 1 * 1024 * 1024

export const LAZADA_VIDEO_BLOCK_SIZE = 3 * 1024 * 1024

export const SHOPEE_VIDEO_TITLE_MAX_CHARS = 118

export const SHOPEE_VIDEO_MIN_DURATION_SECONDS = 1

export const SHOPEE_VIDEO_MAX_DURATION_SECONDS = 180

export const SHOPEE_VIDEO_REQUIRED_HASHTAG = '#shophuyvan'

export const SHOPEE_VIDEO_TOKEN_REFRESH_SAFETY_MS = 10 * 60 * 1000

export const SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL = 'https://banhang.shopee.vn/creator-center/video-upload/upload'

export const VIDEO_DUPLICATE_MEDIUM_SCORE = 45

export const VIDEO_DETAIL_TREND_METRICS = [
  'Views',
  'Likes',
  'Comments',
  'Shares',
  'PlacedOrders',
  'PlacedSales',
  'ConversionRate'
]

export function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

export function cleanVideoText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na'].includes(lower)) return ''
  return text
}

export function validVideoCoverImageUrl(value) {
  const text = cleanVideoText(value)
  const lower = text.toLowerCase()
  if (!text || lower === '0' || lower === 'false' || lower === 'no') return ''
  if (/^\d+$/.test(text)) return ''
  return /^https?:\/\//i.test(text) ? text : ''
}

export function videoCoverImageUrlForVideo(value, videoUploadId = '') {
  const cover = validVideoCoverImageUrl(value)
  const currentVideoId = cleanVideoText(videoUploadId)
  if (!cover) return ''
  if (!currentVideoId) return cover
  return cover.includes(currentVideoId) ? cover : ''
}

export function validVideoCoverImageUrlsForVideo(rows = [], videoUploadId = '') {
  const seen = new Set()
  const urls = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const cover = videoCoverImageUrlForVideo(row, videoUploadId)
    if (!cover || seen.has(cover)) continue
    seen.add(cover)
    urls.push(cover)
  }
  return urls
}

export function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function exactDateText(value) {
  const text = cleanVideoText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function exactPeriodType(value) {
  const text = cleanVideoText(value)
  const allow = new Set(['Day', 'Week', 'Month', 'Last7d', 'Last15d', 'Last30d'])
  return allow.has(text) ? text : 'Last7d'
}

export function todayYmd() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

export function defaultEndDate() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export function compactJson(value, limit = 120000) {
  try {
    const text = JSON.stringify(value ?? {})
    return text.length > limit ? text.slice(0, limit) : text
  } catch {
    return '{}'
  }
}

export function parseJsonText(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function shopeeVideoMediaEndpointFlow() {
  return [
    { step: 'init', module: 'Media', path: SHOPEE_MEDIA_INIT_VIDEO_UPLOAD_PATH, purpose: 'Khởi tạo upload Shopee Video bằng business=3, scene=1.' },
    { step: 'part', module: 'Media', path: SHOPEE_MEDIA_UPLOAD_VIDEO_PART_PATH, purpose: 'Tải từng phần video theo part_size Shopee trả về.' },
    { step: 'complete', module: 'Media', path: SHOPEE_MEDIA_COMPLETE_VIDEO_UPLOAD_PATH, purpose: 'Báo hoàn tất upload để Shopee xử lý video.' },
    { step: 'result', module: 'Media', path: SHOPEE_MEDIA_GET_VIDEO_UPLOAD_RESULT_PATH, purpose: 'Lấy video_upload_id trước khi sửa thông tin và đăng video.' },
    { step: 'cancel', module: 'Media', path: SHOPEE_MEDIA_CANCEL_VIDEO_UPLOAD_PATH, purpose: 'Hủy phiên upload nếu cần dọn lỗi.' },
    { step: 'image', module: 'Media', path: SHOPEE_MEDIA_UPLOAD_IMAGE_PATH, purpose: 'Upload ảnh cho nghiệp vụ Returns/khác khi cần image_id.' }
  ]
}

export function shopeeMediaSpaceEndpointFlow() {
  return [
    { step: 'image', module: 'MediaSpace', path: SHOPEE_MEDIA_SPACE_UPLOAD_IMAGE_PATH, purpose: 'Upload ảnh sản phẩm/mô tả để lấy image_id/image_url.' },
    { step: 'init', module: 'MediaSpace', path: SHOPEE_MEDIA_SPACE_INIT_VIDEO_UPLOAD_PATH, purpose: 'Khởi tạo upload video sản phẩm bằng file_md5 và file_size.' },
    { step: 'part', module: 'MediaSpace', path: SHOPEE_MEDIA_SPACE_UPLOAD_VIDEO_PART_PATH, purpose: 'Tải video sản phẩm theo từng block 4MB.' },
    { step: 'complete', module: 'MediaSpace', path: SHOPEE_MEDIA_SPACE_COMPLETE_VIDEO_UPLOAD_PATH, purpose: 'Chốt danh sách part đã tải lên.' },
    { step: 'result', module: 'MediaSpace', path: SHOPEE_MEDIA_SPACE_GET_VIDEO_UPLOAD_RESULT_PATH, purpose: 'Lấy trạng thái/video_info để gắn vào tạo hoặc sửa sản phẩm.' },
    { step: 'cancel', module: 'MediaSpace', path: SHOPEE_MEDIA_SPACE_CANCEL_VIDEO_UPLOAD_PATH, purpose: 'Hủy phiên upload MediaSpace khi upload lỗi.' }
  ]
}

export function shopeeMainApiReady(row = {}) {
  return Boolean(cleanVideoText(row.api_shop_id) && (cleanVideoText(row.access_token) || cleanVideoText(row.refresh_token) || Number(row.has_access_token) === 1 || Number(row.has_refresh_token) === 1))
}

export function shopeeMediaCapabilityFields(row = {}, videoReady = false) {
  const mediaSpaceReady = shopeeMainApiReady(row)
  return {
    supports_shopee_media_api: videoReady ? 1 : 0,
    supports_shopee_media_space_api: mediaSpaceReady ? 1 : 0,
    shopee_media_endpoint_family: 'Media',
    shopee_media_space_endpoint_family: 'MediaSpace',
    shopee_media_operator_guide: videoReady
      ? 'Shopee Video dùng endpoint Media public: init/upload part/complete/result, sau đó mới gọi Video API để sửa thông tin và đăng.'
      : 'Shopee Media cho Shopee Video chỉ chạy khi shop đã có Video API riêng và test quyền OK.',
    shopee_media_space_operator_guide: mediaSpaceReady
      ? 'MediaSpace shop-token đã sẵn sàng cho ảnh/video sản phẩm. Lệnh upload thật có route riêng và guard xác nhận.'
      : 'MediaSpace cần shop Shopee API chính còn token hoặc refresh token để ký theo shop_id.'
  }
}

export function shopeeVideoTokenRefreshDue(row = {}) {
  if (cleanVideoText(row.platform).toLowerCase() !== 'shopee') return false
  if (!hasShopeeVideoAppConfig(row) || !cleanVideoText(row.video_refresh_token)) return false
  if (!cleanVideoText(row.video_api_user_id || row.video_api_shop_id)) return false
  const expiresAt = parseShopeeVideoAuthDate(row.video_token_expire_at)
  return !cleanVideoText(row.video_access_token) ||
    !Number.isFinite(expiresAt) ||
    expiresAt - Date.now() <= SHOPEE_VIDEO_TOKEN_REFRESH_SAFETY_MS
}

export function applyShopeeVideoTokenRefresh(row = {}, refreshed = {}) {
  const expireSeconds = Number(refreshed.expireSeconds || refreshed.expire_seconds || 14400)
  row.video_access_token = cleanVideoText(refreshed.video_access_token || refreshed.access_token || row.video_access_token)
  row.video_refresh_token = cleanVideoText(refreshed.video_refresh_token || refreshed.refresh_token || row.video_refresh_token)
  row.video_api_user_id = cleanVideoText(refreshed.video_api_user_id || row.video_api_user_id)
  row.video_api_shop_id = cleanVideoText(refreshed.video_api_shop_id || row.video_api_shop_id)
  row.video_token_expire_at = cleanVideoText(refreshed.video_token_expire_at) || new Date(Date.now() + expireSeconds * 1000).toISOString()
  row.video_last_api_refresh_at = cleanVideoText(refreshed.video_last_api_refresh_at) || new Date().toISOString()
  return row
}

export async function refreshShopeeVideoTokenIfNeeded(env, row = {}, options = {}) {
  if (!shopeeVideoTokenRefreshDue(row)) return { refreshed: false, row }
  try {
    const refreshed = await refreshShopeeVideoTokenForShop(env, row)
    applyShopeeVideoTokenRefresh(row, refreshed)
    return { refreshed: true, row, result: refreshed }
  } catch (error) {
    const message = cleanVideoText(error?.message) || 'Không làm mới được token Shopee Video.'
    row.video_auto_refresh_error = message
    if (options.throwOnError) throw new Error(`Không làm mới được token Shopee Video: ${message}`)
    return { refreshed: false, row, error: message }
  }
}

export async function refreshShopeeVideoCapabilityRows(env, rows = []) {
  const results = []
  for (const row of rows || []) {
    if (!shopeeVideoTokenRefreshDue(row)) continue
    const refreshed = await refreshShopeeVideoTokenIfNeeded(env, row)
    results.push({
      shop: videoShopLabel(row),
      status: refreshed.error ? 'error' : 'ok',
      message: refreshed.error || 'Đã làm mới token Shopee Video.',
      expire_at: cleanVideoText(row.video_token_expire_at)
    })
  }
  return results
}

export function normalizeVideoCapability(row = {}) {
  const platform = cleanVideoText(row.platform).toLowerCase()
  const hasVideoApp = platform === 'shopee' && hasShopeeVideoAppConfig(row)
  const hasVideoToken = platform === 'shopee' && isShopeeVideoTokenLive(row)
  const hasVideoUserId = Boolean(shopeeVideoUserId(row))
  const permissionOk = isShopeeVideoPermissionOk(row)
  const refreshError = cleanVideoText(row.video_auto_refresh_error)
  if (platform === 'shopee' && hasVideoApp && hasVideoToken && hasVideoUserId && permissionOk) {
    return {
      ...row,
      video_sync_mode: 'api_live',
      video_ready: 1,
      ...shopeeMediaCapabilityFields(row, true),
      video_operator_guide: 'Shop đã có Shopee Video API riêng, token còn hạn và đã test quyền OK. Có thể đồng bộ, tải, sửa, xóa video qua API video.'
    }
  }
  if (platform === 'shopee' && hasVideoApp && hasVideoToken && hasVideoUserId) {
    return {
      ...row,
      video_sync_mode: 'api_needs_permission_test',
      video_ready: 0,
      ...shopeeMediaCapabilityFields(row, false),
      video_operator_guide: cleanVideoText(row.video_permission_message) || 'Shopee Video API đã kết nối token nhưng chưa test quyền thành công. Bấm Test quyền video trước khi đồng bộ thật.'
    }
  }
  if (platform === 'shopee' && hasVideoApp && hasVideoToken && !hasVideoUserId) {
    return {
      ...row,
      video_sync_mode: 'api_missing_user_id',
      video_ready: 0,
      ...shopeeMediaCapabilityFields(row, false),
      video_operator_guide: cleanVideoText(row.video_permission_message) || shopeeVideoMissingUserMessage(row)
    }
  }
  if (platform === 'shopee' && hasVideoApp) {
    return {
      ...row,
      video_sync_mode: 'api_needs_auth',
      video_ready: 0,
      ...shopeeMediaCapabilityFields(row, false),
      video_operator_guide: refreshError
        ? `Đã lưu app Shopee Video nhưng tự làm mới token lỗi: ${refreshError}. Hãy bấm Gia hạn Shopee Video lại.`
        : 'Đã lưu app Shopee Video riêng nhưng chưa có token video còn hạn. Hãy bấm Kết nối/Gia hạn Shopee Video bằng tài khoản có quyền video.'
    }
  }
  if (platform === 'shopee') {
    return {
      ...row,
      video_sync_mode: 'api_missing_app',
      video_ready: 0,
      ...shopeeMediaCapabilityFields(row, false),
      video_operator_guide: 'Shop Shopee chưa lưu Partner ID/Key riêng cho Shopee Video. Cấu hình app video trước, sau đó kết nối và test quyền.'
    }
  }
  if (platform === 'lazada') {
    const tokenLive = Number(row.access_token_live) === 1 || (cleanVideoText(row.access_token) && !cleanVideoText(row.token_expire_at))
    if (cleanVideoText(row.capability_mode) === 'api_active' || tokenLive) {
      return {
        ...row,
        video_sync_mode: 'lazada_media_api',
        video_ready: 1,
        video_operator_guide: 'Shop Lazada có Media Center API: đọc quota, upload ảnh cover, upload video theo block, tra video_id và lưu vào core video. Lazada chưa có endpoint analytics/list đồng cấp Shopee nên hiệu quả video chỉ là dữ liệu tham chiếu.'
      }
    }
    if (cleanVideoText(row.capability_mode) === 'api_needs_auth' || Number(row.has_any_api_config) === 1) {
      return {
        ...row,
        video_sync_mode: 'lazada_needs_auth',
        video_ready: 0,
        video_operator_guide: 'Shop Lazada đã có cấu hình API nhưng token chưa sẵn sàng. Cần kết nối hoặc gia hạn Lazada API trước khi upload/tra video Media Center.'
      }
    }
    return {
      ...row,
      video_sync_mode: 'manual_reference',
      video_ready: 0,
      video_operator_guide: 'Shop Lazada chưa có API. Chỉ dùng dữ liệu tham chiếu hoặc thao tác tay trên Seller Center, không gắn nhãn upload video API.'
    }
  }
  if (platform === 'tiktok') {
    return {
      ...row,
      video_sync_mode: 'browser_reference',
      video_ready: 0,
      video_operator_guide: 'TikTok hiện chưa có core video sản phẩm trong OMS. Nếu cần, đi luồng browser hỗ trợ hoặc thao tác tay có log.'
    }
  }
  return {
    ...row,
    video_sync_mode: 'manual_reference',
    video_ready: 0,
    video_operator_guide: 'Shop này chưa có luồng video API. Chỉ dùng tham chiếu tay và ghi chú vận hành.'
  }
}
