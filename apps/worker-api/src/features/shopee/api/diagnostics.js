import { listApiCapableShopCredentials } from '../../../core/marketplace/shop-capability-core.js'
import { callShopeeApi } from './baseClient.js'
import { publicShopeeClientConfig, resolveShopeeClientConfig } from './baseClient.js'
import { SHOPEE_ADS_ENDPOINTS } from './adsClient.js'
import { SHOPEE_ADD_ON_DEAL_ENDPOINTS } from './addOnDeal.js'
import { SHOPEE_BUNDLE_DEAL_ENDPOINTS } from './bundleDeal.js'
import { SHOPEE_CHAT_ENDPOINTS } from './chatClient.js'
import { SHOPEE_DISCOUNT_ENDPOINTS } from './discount.js'
import { SHOPEE_FLASH_SALE_ENDPOINTS } from './flashSale.js'
import { SHOPEE_LOGISTICS_ENDPOINTS } from './logistics.js'
import { SHOPEE_ORDER_ENDPOINTS } from './order.js'
import { SHOPEE_PRODUCT_ENDPOINTS } from './product.js'
import { SHOPEE_VOUCHER_ENDPOINTS } from './voucher.js'
import { redactShopeeValue } from '../logs/shopeeLogMask.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: { ...cors, 'Cache-Control': 'no-store' } })
}

function bangkokDmy(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${map.day}-${map.month}-${map.year}`
}

function summarizeDiagnosticError(error) {
  return {
    pass: false,
    http_status: error?.shopee?.http_status || 0,
    error_category: error?.shopee?.category || 'shopee_api_error',
    error_code: error?.shopee?.code || '',
    message: error?.shopee?.message || error?.message || String(error),
    request_id: error?.shopee?.request_id || '',
    raw_response_masked: redactShopeeValue(error?.shopee?.raw_response || {})
  }
}

async function runProbe(env, base, probe) {
  const started = Date.now()
  try {
    const params = typeof probe.params === 'function' ? await probe.params() : (probe.params || {})
    const body = typeof probe.body === 'function' ? await probe.body() : (probe.body || {})
    if (params?.__skip_message || body?.__skip_message) {
      return {
        name: probe.name,
        client_type: probe.client_type,
        endpoint: probe.endpoint,
        method: probe.method || 'GET',
        pass: false,
        skipped: true,
        http_status: 0,
        duration_ms: Date.now() - started,
        message: params.__skip_message || body.__skip_message
      }
    }
    const result = await callShopeeApi(env, {
      ...base,
      clientType: probe.client_type,
      path: probe.endpoint,
      method: probe.method || 'GET',
      params,
      body
    })
    return {
      name: probe.name,
      client_type: probe.client_type,
      endpoint: probe.endpoint,
      method: probe.method || 'GET',
      pass: true,
      http_status: result.http_status,
      request_id: result.request_id,
      duration_ms: Date.now() - started,
      response_keys: Object.keys(result.response || {}).slice(0, 30),
      raw_response_masked: result.raw_response
    }
  } catch (error) {
    return {
      name: probe.name,
      client_type: probe.client_type,
      endpoint: probe.endpoint,
      method: probe.method || 'GET',
      duration_ms: Date.now() - started,
      ...summarizeDiagnosticError(error)
    }
  }
}

async function firstItemId(env, base) {
  const result = await callShopeeApi(env, {
    ...base,
    clientType: 'marketplace_client',
    path: SHOPEE_PRODUCT_ENDPOINTS.item_list,
    params: { item_status: 'NORMAL', offset: 0, page_size: 1 }
  })
  const item = result.response?.item?.[0] || result.response?.item_list?.[0] || {}
  return cleanText(item.item_id)
}

async function firstOrderDiagnosticContext(env, base, orderSn = '') {
  const safeOrderSn = cleanText(orderSn)
  if (safeOrderSn) {
    const detail = await callShopeeApi(env, {
      ...base,
      clientType: 'marketplace_client',
      path: SHOPEE_ORDER_ENDPOINTS.orderDetail,
      params: {
        order_sn_list: safeOrderSn,
        response_optional_fields: 'buyer_user_id,buyer_username,shipping_carrier,checkout_shipping_carrier,package_list'
      }
    })
    const order = detail.response?.order_list?.[0] || {}
    return {
      order_sn: safeOrderSn,
      package_number: cleanText(order.package_list?.[0]?.package_number),
      shipping_carrier: cleanText(order.shipping_carrier || order.checkout_shipping_carrier || order.package_list?.[0]?.shipping_carrier)
    }
  }
  const now = Math.floor(Date.now() / 1000)
  const list = await callShopeeApi(env, {
    ...base,
    clientType: 'marketplace_client',
    path: SHOPEE_ORDER_ENDPOINTS.orderList,
    params: {
      time_range_field: 'update_time',
      time_from: now - 3 * 24 * 60 * 60,
      time_to: now,
      page_size: 1
    }
  })
  const order = list.response?.order_list?.[0] || {}
  return { order_sn: cleanText(order.order_sn), package_number: '' }
}

function buildProbes(options = {}) {
  const itemId = cleanText(options.item_id || options.itemId)
  const orderSn = cleanText(options.order_sn || options.orderSn)
  const today = bangkokDmy()
  const probes = [
    { name: 'Marketplace shop profile', client_type: 'marketplace_client', endpoint: SHOPEE_PRODUCT_ENDPOINTS.shop_info },
    { name: 'Product item list', client_type: 'marketplace_client', endpoint: SHOPEE_PRODUCT_ENDPOINTS.item_list, params: { item_status: 'NORMAL', offset: 0, page_size: 1 } },
    { name: 'Product model list', client_type: 'marketplace_client', endpoint: SHOPEE_PRODUCT_ENDPOINTS.model_list, params: async () => ({ item_id: itemId || await firstItemId(options.env, options.base) }) },
    { name: 'Order list', client_type: 'marketplace_client', endpoint: SHOPEE_ORDER_ENDPOINTS.orderList, params: () => {
      const now = Math.floor(Date.now() / 1000)
      return { time_range_field: 'update_time', time_from: now - 3 * 24 * 60 * 60, time_to: now, page_size: 1 }
    } },
    { name: 'Order detail', client_type: 'marketplace_client', endpoint: SHOPEE_ORDER_ENDPOINTS.orderDetail, params: async () => {
      const ctx = await firstOrderDiagnosticContext(options.env, options.base, orderSn)
      if (!ctx.order_sn) return { __skip_message: 'Không có order_sn gần đây để test get_order_detail. Nhập order_sn test nếu cần kiểm sâu.' }
      return { order_sn_list: ctx.order_sn, response_optional_fields: 'buyer_user_id,buyer_username,shipping_carrier,checkout_shipping_carrier,package_list' }
    } },
    { name: 'Logistics channel list', client_type: 'marketplace_client', endpoint: SHOPEE_LOGISTICS_ENDPOINTS.channelList },
    { name: 'Logistics tracking number', client_type: 'marketplace_client', endpoint: SHOPEE_LOGISTICS_ENDPOINTS.trackingNumber, params: async () => {
      const ctx = await firstOrderDiagnosticContext(options.env, options.base, orderSn)
      if (!ctx.order_sn) return { __skip_message: 'Không có order_sn để test get_tracking_number.' }
      const params = { order_sn: ctx.order_sn }
      if (ctx.package_number) params.package_number = ctx.package_number
      return params
    } },
    { name: 'Discount list', client_type: 'marketplace_client', endpoint: SHOPEE_DISCOUNT_ENDPOINTS.list, params: { discount_status: 'ongoing', page_no: 1, page_size: 10 } },
    { name: 'Voucher list', client_type: 'marketplace_client', endpoint: SHOPEE_VOUCHER_ENDPOINTS.list, params: { status: 'ongoing', page_no: 1, page_size: 10 } },
    { name: 'Bundle list', client_type: 'marketplace_client', endpoint: SHOPEE_BUNDLE_DEAL_ENDPOINTS.list, params: { page_no: 1, page_size: 10, time_status: 1 } },
    { name: 'Add-On list', client_type: 'marketplace_client', endpoint: SHOPEE_ADD_ON_DEAL_ENDPOINTS.list, params: { page_no: 1, page_size: 10, promotion_status: 'ongoing' } },
    { name: 'Flash Sale list', client_type: 'marketplace_client', endpoint: SHOPEE_FLASH_SALE_ENDPOINTS.list, params: { offset: 0, limit: 10, type: 1 } },
    { name: 'Ads balance', client_type: 'ads_client', endpoint: SHOPEE_ADS_ENDPOINTS.totalBalance },
    { name: 'Ads shop toggle', client_type: 'ads_client', endpoint: SHOPEE_ADS_ENDPOINTS.shopToggleInfo },
    { name: 'Ads hourly performance', client_type: 'ads_client', endpoint: SHOPEE_ADS_ENDPOINTS.allCpcHourlyPerformance, params: { performance_date: today } },
    { name: 'Chat conversation list', client_type: 'chat_client', endpoint: SHOPEE_CHAT_ENDPOINTS.conversationList, params: { direction: 'latest', type: 'all', page_size: 1 } },
    { name: 'Chat unread count', client_type: 'chat_client', endpoint: SHOPEE_CHAT_ENDPOINTS.unreadConversationCount },
    { name: 'Chat send dry-run guard', client_type: 'chat_client', endpoint: SHOPEE_CHAT_ENDPOINTS.sendMessage, method: 'POST', body: { __skip_message: 'Diagnostics không gửi tin thật. Route probe Chat legacy trên Worker chính đã tắt; kiểm Chat mới qua shophuyvan-chat-api.' } }
  ]
  return probes
}

function redirectDomainCheck(env) {
  const workerDomain = 'nghiemchihuy.workers.dev'
  const rows = [
    { client_type: 'ads_client', redirect_url: cleanText(env.SHOPEE_ADS_REDIRECT_URL) },
    { client_type: 'marketplace_client', redirect_url: cleanText(env.SHOPEE_MARKETPLACE_REDIRECT_URL || env.SHOPEE_REDIRECT) },
    { client_type: 'chat_client', redirect_url: cleanText(env.SHOPEE_CHAT_REDIRECT_URL || env.SHOPEE_MARKETPLACE_REDIRECT_URL || env.SHOPEE_REDIRECT) }
  ]
  return rows.map(row => ({
    ...row,
    pass: row.redirect_url ? row.redirect_url.includes(workerDomain) : false,
    expected_domain_hint: workerDomain,
    message: row.redirect_url
      ? (row.redirect_url.includes(workerDomain) ? 'Redirect URL đang nằm trên domain Worker.' : 'Redirect URL khác domain Worker đang dùng.')
      : 'Chưa cấu hình redirect URL riêng cho client này.'
  }))
}

function sensitiveDataImpact() {
  return [
    { feature: 'order_detail', impact: 'Có thể thiếu dữ liệu người mua/địa chỉ nếu app không có Sensitive Data.' },
    { feature: 'finance', impact: 'Payment/escrow vẫn cần quyền finance tương ứng; không được fallback phí sàn để làm báo cáo thuế.' },
    { feature: 'roas_from_orders', impact: 'Nếu ROAS tự tính từ đơn hàng thì phải ghi rõ nguồn đơn/Payment; không được coi là Ads reporting live.' },
    { feature: 'ads_reporting', impact: 'Nếu ROAS nằm trong response Ads API thì có thể hiển thị là Shopee Ads API live.' },
    { feature: 'chat_customer_data', impact: 'SellerChat cần quyền Customer Service/Chat; nếu app không có quyền thì không tự nhắn GHN hoặc AI auto-reply.' }
  ]
}

export async function runShopeeDiagnostics(env, options = {}) {
  const shopFilter = cleanText(options.shop)
  const shops = await listApiCapableShopCredentials(env, { platform: 'shopee', shop: shopFilter, maxShops: 1 })
  const shopRow = shops[0] || {}
  const base = { shopRow }
  const adsConfig = resolveShopeeClientConfig(env, { clientType: 'ads_client', shopRow })
  const marketplaceConfig = resolveShopeeClientConfig(env, { clientType: 'marketplace_client', shopRow })
  const chatConfig = resolveShopeeClientConfig(env, { clientType: 'chat_client', shopRow })
  const probes = buildProbes({ ...options, env, base })
  const results = []
  for (const probe of probes) results.push(await runProbe(env, base, probe))

  return {
    status: 'ok',
    mode: 'shopee_real_api_diagnostics',
    generated_at: new Date().toISOString(),
    environment: {
      shopee_env: cleanText(env.SHOPEE_ENV || 'live'),
      ip_whitelist_note: 'IP Address Whitelist đang Disabled nên không phải nguyên nhân nếu Shopee không bắt whitelist riêng cho app.',
      api_access_log_hint: 'Vào Shopee Console > API Access Log để đối chiếu request_id trong bảng diagnostics.'
    },
    selected_shop: {
      found: shops.length ? 1 : 0,
      shop: cleanText(shopRow.shop_name || shopRow.user_name || shopRow.api_shop_id),
      api_shop_id: cleanText(shopRow.api_shop_id),
      has_access_token: shopRow.has_access_token ? 1 : 0,
      has_refresh_token: shopRow.has_refresh_token ? 1 : 0,
      token_status: cleanText(shopRow.token_status),
      refresh_token_status: cleanText(shopRow.refresh_token_status),
      api_partner_id: cleanText(shopRow.api_partner_id),
      config_warning: adsConfig.usingLegacyDbConfig || marketplaceConfig.usingLegacyDbConfig || chatConfig.usingLegacyDbConfig
        ? 'Đang còn dùng cấu hình DB/SHOPEE_PARTNER_ID kiểu cũ cho ít nhất một client; chưa chứng minh được app Ads, Marketplace và Chat đã tách riêng.'
        : ''
    },
    ads_app: publicShopeeClientConfig(adsConfig),
    marketplace_app: publicShopeeClientConfig(marketplaceConfig),
    chat_app: publicShopeeClientConfig(chatConfig),
    redirect_url_checks: redirectDomainCheck(env),
    sensitive_data_impact: sensitiveDataImpact(),
    tests: results,
    summary: {
      pass_count: results.filter(row => row.pass).length,
      fail_count: results.filter(row => !row.pass).length,
      ads_pass: results.filter(row => row.client_type === 'ads_client' && row.pass).length,
      marketplace_pass: results.filter(row => row.client_type === 'marketplace_client' && row.pass).length,
      chat_pass: results.filter(row => row.client_type === 'chat_client' && row.pass).length
    }
  }
}

export async function handleShopeeDiagnostics(request, env, cors, getAdminUserFromRequest) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  const user = typeof getAdminUserFromRequest === 'function' ? await getAdminUserFromRequest(request, env) : null
  if (user?.role !== 'admin') {
    return json({ status: 'error', error: 'admin_required', message: 'Chỉ admin được chạy diagnostics Shopee vì route này kiểm tra token/quyền thật.' }, cors, 403)
  }
  const url = new URL(request.url)
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
  const result = await runShopeeDiagnostics(env, {
    shop: body.shop || url.searchParams.get('shop'),
    item_id: body.item_id || body.itemId || url.searchParams.get('item_id') || url.searchParams.get('itemId'),
    order_sn: body.order_sn || body.orderSn || url.searchParams.get('order_sn') || url.searchParams.get('orderSn')
  })
  return json(result, cors)
}
