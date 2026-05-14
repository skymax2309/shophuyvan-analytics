import { getShopeeVideoAppFromRow, isShopeeVideoPermissionOk, shopeeVideoUserId } from '../../core/shopee-video-auth-core.js'
import { buildMarketplaceVideoKey } from '../../core/video-analytics-core.js'
import { getShopeeAppFromRow, signHmacHex } from '../../utils/shopee-apps.js'
import { refreshShopeeTokenForShop, refreshShopeeVideoTokenForShop } from '../shops.js'
import { applyShopeeVideoTokenRefresh, cleanVideoText, numberValue, refreshShopeeVideoTokenIfNeeded } from './shared-base.js'

export function videoUserId(shop = {}) {
  return shopeeVideoUserId(shop)
}

export function videoShopLabel(shop = {}) {
  return cleanVideoText(shop.shop_name || shop.shop || shop.user_name || shop.api_shop_id)
}

export function canUseShopeeVideoApi(shop = {}) {
  return cleanVideoText(shop.platform).toLowerCase() === 'shopee' &&
    Boolean(getShopeeVideoAppFromRow(shop)) &&
    cleanVideoText(shop.video_access_token) &&
    cleanVideoText(videoUserId(shop)) &&
    isShopeeVideoPermissionOk(shop)
}

export function videoStatusLabel(status) {
  const code = Number(status || 0)
  if (code === 200) return 'Bản nháp'
  if (code === 300) return 'Đã đăng'
  if (code === 400) return 'Đã xóa'
  if (code === 500) return 'Đặt lịch'
  if (code === 600) return 'Đặt lịch lỗi'
  return 'Không rõ'
}

export function normalizeOverview(input = {}) {
  const keyMetric = input.key_metric || {}
  const conversion = input.conversion || {}
  const engagement = input.engagement || {}
  return {
    fetched_date_range: cleanVideoText(input.fetched_date_range),
    key_metric: {
      placed_sales: numberValue(keyMetric.placed_sales),
      confirmed_sales: numberValue(keyMetric.confirmed_sales),
      placed_orders: numberValue(keyMetric.placed_orders),
      confirmed_orders: numberValue(keyMetric.confirmed_orders),
      placed_item_sold: numberValue(keyMetric.placed_item_sold),
      confirmed_item_sold: numberValue(keyMetric.confirmed_item_sold),
      total_viewers: numberValue(keyMetric.total_viewers),
      effective_views: numberValue(keyMetric.effective_views),
      avg_view_duration: numberValue(keyMetric.avg_view_duration)
    },
    conversion: {
      placed_buyers: numberValue(conversion.placed_buyers),
      confirmed_buyers: numberValue(conversion.confirmed_buyers),
      total_atc: numberValue(conversion.total_atc),
      ctr: numberValue(conversion.ctr),
      placed_co_rate: numberValue(conversion.placed_co_rate),
      confirmed_co_rate: numberValue(conversion.confirmed_co_rate),
      placed_abs: numberValue(conversion.placed_abs),
      confirmed_abs: numberValue(conversion.confirmed_abs),
      placed_gpm: numberValue(conversion.placed_gpm),
      confirmed_gpm: numberValue(conversion.confirmed_gpm),
      video_with_products: numberValue(conversion.video_with_products),
      placed_revenue_generating_videos: numberValue(conversion.placed_revenue_generating_videos),
      confirmed_revenue_generating_videos: numberValue(conversion.confirmed_revenue_generating_videos)
    },
    engagement: {
      total_views: numberValue(engagement.total_views),
      total_likes: numberValue(engagement.total_likes),
      total_shares: numberValue(engagement.total_shares),
      total_comments: numberValue(engagement.total_comments),
      video_new_followers: numberValue(engagement.video_new_followers)
    }
  }
}

export function normalizeTrendRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      data_period: cleanVideoText(row.data_period),
      placed_sales: numberValue(row.placed_sales),
      confirmed_sales: numberValue(row.confirmed_sales),
      placed_orders: numberValue(row.placed_orders),
      confirmed_orders: numberValue(row.confirmed_orders),
      placed_item_sold: numberValue(row.placed_item_sold),
      confirmed_item_sold: numberValue(row.confirmed_item_sold),
      total_viewers: numberValue(row.total_viewers),
      effective_views: numberValue(row.effective_views),
      avg_view_duration: numberValue(row.avg_view_duration),
      placed_buyers: numberValue(row.placed_buyers),
      confirmed_buyers: numberValue(row.confirmed_buyers),
      total_atc: numberValue(row.total_atc),
      ctr: numberValue(row.ctr),
      placed_co_rate: numberValue(row.placed_co_rate),
      confirmed_co_rate: numberValue(row.confirmed_co_rate),
      placed_abs: numberValue(row.placed_abs),
      confirmed_abs: numberValue(row.confirmed_abs),
      placed_gpm: numberValue(row.placed_gpm),
      confirmed_gpm: numberValue(row.confirmed_gpm),
      video_with_products: numberValue(row.video_with_products),
      placed_revenue_generating_videos: numberValue(row.placed_revenue_generating_videos),
      confirmed_revenue_generating_videos: numberValue(row.confirmed_revenue_generating_videos),
      total_views: numberValue(row.total_views),
      total_likes: numberValue(row.total_likes),
      total_shares: numberValue(row.total_shares),
      total_comments: numberValue(row.total_comments),
      video_new_followers: numberValue(row.video_new_followers)
    }))
    .filter(row => row.data_period)
}

export function flattenMapEntries(map = {}, limit = 20) {
  return Object.entries(map || {})
    .map(([label, value]) => ({ label: cleanVideoText(label), value: numberValue(value) }))
    .filter(item => item.label)
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
}

export function normalizeAudience(input = {}) {
  return {
    age: flattenMapEntries(input.age, 12),
    gender: flattenMapEntries(input.gender, 12),
    identity: flattenMapEntries(input.identity, 12),
    activity: flattenMapEntries(input.activity, 24),
    location: flattenMapEntries(input.location, 20),
    content: flattenMapEntries(input.content, 20),
    shopping: flattenMapEntries(input.shopping, 20)
  }
}

export function normalizeVideoListRows(rows = [], listType = 'post') {
  const sourceRows = Array.isArray(rows) ? rows : (rows && typeof rows === 'object' ? [rows] : [])
  return sourceRows.map(row => ({
    ...row,
    list_type: listType,
    status_label: videoStatusLabel(row.status)
  }))
}

export function uniqueTextList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanVideoText).filter(Boolean))]
}

export function chunkVideoIds(values = [], size = 5) {
  const chunks = []
  const finalSize = Math.max(1, numberValue(size) || 5)
  for (let index = 0; index < values.length; index += finalSize) {
    chunks.push(values.slice(index, index + finalSize))
  }
  return chunks
}

export function normalizeTopVideoRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    video_key: buildMarketplaceVideoKey(row),
    video_upload_id: cleanVideoText(row.video_upload_id),
    post_id: cleanVideoText(row.post_id),
    caption: cleanVideoText(row.caption),
    cover_image_url: cleanVideoText(row.cover_image_url),
    video_url: cleanVideoText(row.video_url),
    status: numberValue(row.status),
    status_label: videoStatusLabel(row.status),
    duration: numberValue(row.duration),
    views: numberValue(row.views),
    likes: numberValue(row.likes),
    comments: numberValue(row.comments),
    shares: numberValue(row.shares),
    avg_views_duration: numberValue(row.avg_views_duration),
    completion_rate: numberValue(row.completion_rate),
    placed_orders: numberValue(row.placed_orders),
    confirmed_orders: numberValue(row.confirmed_orders),
    placed_sales: numberValue(row.placed_sales),
    confirmed_sales: numberValue(row.confirmed_sales),
    placed_item_sold: numberValue(row.placed_item_sold),
    confirmed_item_sold: numberValue(row.confirmed_item_sold),
    fetched_date_range: cleanVideoText(row.fetched_date_range)
  }))
}

export function normalizeTopProductRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    shop_id: cleanVideoText(row.shop_id),
    item_id: cleanVideoText(row.item_id),
    item_name: cleanVideoText(row.item_name),
    item_cover_image_url: cleanVideoText(row.item_cover_image_url),
    item_description: cleanVideoText(row.item_description),
    placed_orders: numberValue(row.placed_orders),
    confirmed_orders: numberValue(row.confirmed_orders),
    placed_sales: numberValue(row.placed_sales),
    confirmed_sales: numberValue(row.confirmed_sales),
    placed_unique_buyers: numberValue(row.placed_unique_buyers),
    confirmed_unique_buyers: numberValue(row.confirmed_unique_buyers),
    fetched_date_range: cleanVideoText(row.fetched_date_range)
  }))
}

export function buildVideoInsights(topVideoRows = []) {
  return {
    video_view_no_order_rows: topVideoRows
      .filter(row => numberValue(row.views) > 0 && numberValue(row.placed_orders) <= 0)
      .sort((left, right) => numberValue(right.views) - numberValue(left.views))
      .slice(0, 12),
    video_boost_rows: topVideoRows
      .filter(row => numberValue(row.placed_sales) > 0 || numberValue(row.placed_orders) > 0)
      .sort((left, right) => {
        const salesDiff = numberValue(right.placed_sales) - numberValue(left.placed_sales)
        if (salesDiff !== 0) return salesDiff
        return numberValue(right.placed_orders) - numberValue(left.placed_orders)
      })
      .slice(0, 12)
  }
}

export function shopeeVideoIdentityWarning(shop = {}) {
  if (!getShopeeVideoAppFromRow(shop)) return 'Shop chưa lưu Partner ID/Key riêng cho Shopee Video.'
  if (!cleanVideoText(shop.video_access_token)) return 'Shop chưa có access token riêng cho Shopee Video. Hãy bấm Kết nối/Gia hạn video trước.'
  if (!cleanVideoText(videoUserId(shop))) return shopeeVideoMissingUserMessage(shop)
  if (!isShopeeVideoPermissionOk(shop)) return cleanVideoText(shop.video_permission_message) || 'Shopee Video API chưa test quyền OK. Hãy bấm Test quyền video trước khi đồng bộ thật.'
  return ''
}

export function shopeeVideoMissingUserMessage(shop = {}) {
  const subjectType = cleanVideoText(shop.video_auth_subject_type).toLowerCase()
  const rawUserId = cleanVideoText(shop.video_api_user_id)
  const shopId = cleanVideoText(shop.video_api_shop_id || shop.api_shop_id)
  if (subjectType === 'shop' || (rawUserId && shopId && rawUserId === shopId)) {
    return 'Token hiện tại là shop token nên Shopee Video User API không nhận access_token này. Hãy bấm Kết nối/Gia hạn video lại bằng luồng trả user_id, rồi mới Test quyền video.'
  }
  return 'Shop chưa có user_id Shopee Video. Hãy kết nối Shopee Video bằng tài khoản có quyền video/user rồi test lại.'
}

export function isInvalidTokenMessage(message) {
  const text = cleanVideoText(message).toLowerCase()
  return text.includes('invalid_acceess_token') || text.includes('invalid_access_token') || text.includes('invalid access_token')
}

export function shopeeUserUrlBuilder(app, path, accessToken, userId) {
  return async function buildUrl(params = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const baseString = `${app.partnerId}${path}${timestamp}${accessToken}${userId}`
    const sign = await signHmacHex(app.partnerKey, baseString)
    const url = new URL(`https://partner.shopeemobile.com${path}`)
    url.searchParams.set('partner_id', app.partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('user_id', String(userId))
    url.searchParams.set('sign', sign)
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}

export function shopeePublicUrlBuilder(app, path) {
  return async function buildUrl(params = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const baseString = `${app.partnerId}${path}${timestamp}`
    const sign = await signHmacHex(app.partnerKey, baseString)
    const url = new URL(`https://partner.shopeemobile.com${path}`)
    url.searchParams.set('partner_id', app.partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('sign', sign)
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}

export function shopeeShopUrlBuilder(app, path, accessToken, shopId) {
  return async function buildUrl(params = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const baseString = `${app.partnerId}${path}${timestamp}${accessToken}${shopId}`
    const sign = await signHmacHex(app.partnerKey, baseString)
    const url = new URL(`https://partner.shopeemobile.com${path}`)
    url.searchParams.set('partner_id', app.partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('shop_id', String(shopId))
    url.searchParams.set('sign', sign)
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    return url.toString()
  }
}

export async function fetchShopeeJson(buildUrl, params = {}, options = {}) {
  const url = await buildUrl(params)
  const init = options.init || {}
  const res = await fetch(url, init)
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Shopee API trả phản hồi không phải JSON, HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
  if (data.error && !options.allowApiError) throw new Error(data.message || data.msg || data.error)
  return data
}

export async function callShopeeVideoGet(env, shop, path, params = {}, retry = true) {
  await refreshShopeeVideoTokenIfNeeded(env, shop, { throwOnError: true })
  const userId = videoUserId(shop)
  const videoApp = getShopeeVideoAppFromRow(shop)
  if (!videoApp) throw new Error('Shop chưa lưu Partner ID/Key riêng cho Shopee Video.')
  if (!cleanVideoText(shop.video_access_token)) throw new Error('Shop chưa có access token riêng cho Shopee Video.')
  if (!userId) throw new Error(shopeeVideoMissingUserMessage(shop))
  const buildVideoUrl = shopeeUserUrlBuilder(videoApp, path, shop.video_access_token, userId)
  try {
    return await fetchShopeeJson(buildVideoUrl, params)
  } catch (error) {
    if (retry && isInvalidTokenMessage(error?.message) && cleanVideoText(shop.video_refresh_token) && shop.id) {
      const refreshed = await refreshShopeeVideoTokenForShop(env, shop)
      applyShopeeVideoTokenRefresh(shop, refreshed)
      return callShopeeVideoGet(env, shop, path, params, false)
    }
    throw error
  }
}

export async function callShopeeVideoPost(env, shop, path, body = {}, retry = true) {
  await refreshShopeeVideoTokenIfNeeded(env, shop, { throwOnError: true })
  const userId = videoUserId(shop)
  const videoApp = getShopeeVideoAppFromRow(shop)
  if (!videoApp) throw new Error('Shop chưa lưu Partner ID/Key riêng cho Shopee Video.')
  if (!cleanVideoText(shop.video_access_token)) throw new Error('Shop chưa có access token riêng cho Shopee Video.')
  if (!userId) throw new Error(shopeeVideoMissingUserMessage(shop))
  const buildVideoUrl = shopeeUserUrlBuilder(videoApp, path, shop.video_access_token, userId)
  try {
    return await fetchShopeeJson(buildVideoUrl, {}, {
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      }
    })
  } catch (error) {
    if (retry && isInvalidTokenMessage(error?.message) && cleanVideoText(shop.video_refresh_token) && shop.id) {
      const refreshed = await refreshShopeeVideoTokenForShop(env, shop)
      applyShopeeVideoTokenRefresh(shop, refreshed)
      return callShopeeVideoPost(env, shop, path, body, false)
    }
    throw error
  }
}

export async function callShopeeVideoPostRaw(env, shop, path, body = {}, retry = true) {
  await refreshShopeeVideoTokenIfNeeded(env, shop, { throwOnError: true })
  const userId = videoUserId(shop)
  const videoApp = getShopeeVideoAppFromRow(shop)
  if (!videoApp) throw new Error('Shop chưa lưu Partner ID/Key riêng cho Shopee Video.')
  if (!cleanVideoText(shop.video_access_token)) throw new Error('Shop chưa có access token riêng cho Shopee Video.')
  if (!userId) throw new Error(shopeeVideoMissingUserMessage(shop))
  const buildVideoUrl = shopeeUserUrlBuilder(videoApp, path, shop.video_access_token, userId)
  try {
    return await fetchShopeeJson(buildVideoUrl, {}, {
      allowApiError: true,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      }
    })
  } catch (error) {
    if (retry && isInvalidTokenMessage(error?.message) && cleanVideoText(shop.video_refresh_token) && shop.id) {
      const refreshed = await refreshShopeeVideoTokenForShop(env, shop)
      applyShopeeVideoTokenRefresh(shop, refreshed)
      return callShopeeVideoPostRaw(env, shop, path, body, false)
    }
    throw error
  }
}

export async function callShopeePublicPost(app, path, body) {
  const buildUrl = shopeePublicUrlBuilder(app, path)
  return fetchShopeeJson(buildUrl, {}, {
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }
  })
}

export async function callShopeePublicForm(app, path, params = {}, formData) {
  const buildUrl = shopeePublicUrlBuilder(app, path)
  return fetchShopeeJson(buildUrl, params, {
    init: {
      method: 'POST',
      body: formData
    }
  })
}

export async function callShopeeMediaSpaceGet(env, shop, path, params = {}, retry = true) {
  if (!cleanVideoText(shop.api_shop_id)) throw new Error('Shop Shopee chưa có shop_id API chính để gọi MediaSpace.')
  if (!cleanVideoText(shop.access_token)) throw new Error('Shop Shopee chưa có access token API chính để gọi MediaSpace.')
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  const buildUrl = shopeeShopUrlBuilder(app, path, shop.access_token, shop.api_shop_id)
  try {
    return await fetchShopeeJson(buildUrl, params)
  } catch (error) {
    if (retry && isInvalidTokenMessage(error?.message) && cleanVideoText(shop.refresh_token) && shop.id) {
      const refreshed = await refreshShopeeTokenForShop(env, shop)
      shop.access_token = refreshed.access_token
      shop.refresh_token = refreshed.refresh_token
      return callShopeeMediaSpaceGet(env, shop, path, params, false)
    }
    throw error
  }
}

export async function callShopeeMediaSpacePost(env, shop, path, body = {}, retry = true) {
  if (!cleanVideoText(shop.api_shop_id)) throw new Error('Shop Shopee chưa có shop_id API chính để gọi MediaSpace.')
  if (!cleanVideoText(shop.access_token)) throw new Error('Shop Shopee chưa có access token API chính để gọi MediaSpace.')
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  const buildUrl = shopeeShopUrlBuilder(app, path, shop.access_token, shop.api_shop_id)
  try {
    return await fetchShopeeJson(buildUrl, {}, {
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      }
    })
  } catch (error) {
    if (retry && isInvalidTokenMessage(error?.message) && cleanVideoText(shop.refresh_token) && shop.id) {
      const refreshed = await refreshShopeeTokenForShop(env, shop)
      shop.access_token = refreshed.access_token
      shop.refresh_token = refreshed.refresh_token
      return callShopeeMediaSpacePost(env, shop, path, body, false)
    }
    throw error
  }
}

export async function callShopeeMediaSpaceForm(env, shop, path, params = {}, formData, retry = true) {
  if (!cleanVideoText(shop.api_shop_id)) throw new Error('Shop Shopee chưa có shop_id API chính để gọi MediaSpace.')
  if (!cleanVideoText(shop.access_token)) throw new Error('Shop Shopee chưa có access token API chính để gọi MediaSpace.')
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  const buildUrl = shopeeShopUrlBuilder(app, path, shop.access_token, shop.api_shop_id)
  try {
    return await fetchShopeeJson(buildUrl, params, {
      init: {
        method: 'POST',
        body: formData
      }
    })
  } catch (error) {
    if (retry && isInvalidTokenMessage(error?.message) && cleanVideoText(shop.refresh_token) && shop.id) {
      const refreshed = await refreshShopeeTokenForShop(env, shop)
      shop.access_token = refreshed.access_token
      shop.refresh_token = refreshed.refresh_token
      return callShopeeMediaSpaceForm(env, shop, path, params, formData, false)
    }
    throw error
  }
}
