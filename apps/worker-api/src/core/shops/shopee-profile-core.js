export const SHOPEE_SHOP_READ_ENDPOINTS = [
  {
    id: 'shop_info',
    label: 'Thông tin shop',
    path: '/api/v2/shop/get_shop_info',
    source: 'get_shop_info'
  },
  {
    id: 'profile',
    label: 'Hồ sơ shop',
    path: '/api/v2/shop/get_profile',
    source: 'get_profile'
  },
  {
    id: 'warehouse_detail',
    label: 'Kho hàng',
    path: '/api/v2/shop/get_warehouse_detail',
    source: 'get_warehouse_detail'
  },
  {
    id: 'notification',
    label: 'Thông báo shop',
    path: '/api/v2/shop/get_shop_notification',
    source: 'get_shop_notification'
  },
  {
    id: 'authorised_reseller_brand',
    label: 'Brand reseller',
    path: '/api/v2/shop/get_authorised_reseller_brand',
    source: 'get_authorised_reseller_brand'
  },
  {
    id: 'br_shop_onboarding',
    label: 'Onboarding Brand Registry',
    path: '/api/v2/shop/get_br_shop_onboarding_info',
    source: 'get_br_shop_onboarding_info'
  },
  {
    id: 'holiday_mode',
    label: 'Chế độ nghỉ',
    path: '/api/v2/shop/get_shop_holiday_mode',
    source: 'get_shop_holiday_mode'
  }
]

export const SHOPEE_SHOP_WRITE_ENDPOINTS = [
  {
    id: 'update_profile',
    label: 'Cập nhật hồ sơ shop',
    path: '/api/v2/shop/update_profile',
    source: 'update_profile',
    guard: 'preview_admin_confirm_log'
  },
  {
    id: 'set_holiday_mode',
    label: 'Bật/tắt chế độ nghỉ',
    path: '/api/v2/shop/set_shop_holiday_mode',
    source: 'set_shop_holiday_mode',
    guard: 'preview_admin_confirm_log'
  }
]

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function firstText(source, keys) {
  if (!source || typeof source !== 'object') return ''
  for (const key of keys) {
    const value = cleanText(source[key])
    if (value) return value
  }
  return ''
}

function countValue(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function summarizeShopeeShopEndpoint(endpoint, data = {}) {
  const payload = data.response || data
  const result = payload.response || payload.data || payload.result || payload
  if (endpoint.id === 'shop_info') {
    return firstText(result, ['shop_name', 'shopName', 'shop_description', 'description']) || 'Đã đọc thông tin shop.'
  }
  if (endpoint.id === 'profile') {
    return firstText(result, ['shop_name', 'shopName', 'description', 'shop_description']) || 'Đã đọc hồ sơ shop.'
  }
  if (endpoint.id === 'warehouse_detail') {
    const total = countValue(result.warehouse_list || result.warehouses || result.warehouse)
    return total ? `${total.toLocaleString('vi-VN')} kho/nguồn giao hàng` : 'Đã đọc cấu hình kho.'
  }
  if (endpoint.id === 'notification') {
    const total = countValue(result.notification_list || result.notifications || result)
    return total ? `${total.toLocaleString('vi-VN')} nhóm thông báo` : 'Đã đọc cấu hình thông báo.'
  }
  if (endpoint.id === 'authorised_reseller_brand') {
    const total = countValue(result.brand_list || result.brands || result.authorised_reseller_brand_list)
    return total ? `${total.toLocaleString('vi-VN')} brand được ủy quyền` : 'Không thấy brand được trả về hoặc shop không thuộc nhóm này.'
  }
  if (endpoint.id === 'br_shop_onboarding') {
    return firstText(result, ['status', 'onboarding_status', 'shop_status']) || 'Đã đọc trạng thái Brand Registry.'
  }
  if (endpoint.id === 'holiday_mode') {
    const raw = result.holiday_mode ?? result.is_holiday_mode ?? result.enable_holiday_mode
    if (raw === true || raw === 1 || raw === 'true') return 'Đang bật chế độ nghỉ.'
    if (raw === false || raw === 0 || raw === 'false') return 'Đang tắt chế độ nghỉ.'
    return 'Đã đọc trạng thái chế độ nghỉ.'
  }
  return 'Đã đọc dữ liệu từ Shopee.'
}

export function normalizeShopeeShopSnapshot({ shop, rows = [], warnings = [] }) {
  const success = rows.filter(row => row.status === 'ok').length
  const failed = rows.filter(row => row.status !== 'ok').length
  return {
    status: failed ? 'partial_error' : 'ok',
    platform: 'shopee',
    shop: cleanText(shop?.shop_name || shop?.user_name || shop?.api_shop_id),
    api_shop_id: cleanText(shop?.api_shop_id),
    fetched_at: new Date().toISOString(),
    mode: 'read_only_snapshot',
    source_note: 'Đọc trực tiếp từ Shopee Shop API; hai endpoint ghi vẫn khóa preview/xác nhận trước khi gọi thật.',
    success,
    failed,
    endpoints: rows,
    write_guards: SHOPEE_SHOP_WRITE_ENDPOINTS,
    warnings
  }
}
