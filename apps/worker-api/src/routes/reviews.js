import { getShopeeAppFromRow, signHmacHex } from '../utils/shopee-apps.js'
import { getApiShops, callLazadaWithShop } from './api-sync.js'
import { refreshShopeeTokenForShop } from './shops.js'
import {
  createReviewReplyPreview,
  createReviewReplySuggestion,
  loadReviewActionLogs,
  loadReviewCore,
  loadReviewProductCandidates,
  loadReviewProductRisk,
  normalizeLazadaReviewRow,
  normalizeShopeeReviewRow,
  repairReviewCatalogMapping,
  saveReviewRows,
  updateReviewReplyAction
} from '../core/review-core.js'

const SHOPEE_GET_COMMENT_PATH = '/api/v2/product/get_comment'
const LAZADA_REVIEW_HISTORY_PATH = '/review/seller/history/list'
const LAZADA_REVIEW_LIST_PATH = '/review/seller/list/v2'

function json(data, cors, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...cors,
      'Cache-Control': 'no-store'
    }
  })
}

function cleanText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na'].includes(lower)) return ''
  return text
}

function lowerText(value) {
  return cleanText(value).toLowerCase()
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseLimit(value, fallback = 30, max = 100) {
  return Math.max(1, Math.min(Number(value || fallback) || fallback, max))
}

async function readBody(request) {
  if (request.method !== 'POST') return {}
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function pickOptions(url, body = {}) {
  return {
    platform: body.platform || url.searchParams.get('platform'),
    shop: body.shop || url.searchParams.get('shop'),
    limit: body.limit || url.searchParams.get('limit'),
    page_size: body.page_size || body.pageSize || url.searchParams.get('page_size'),
    max_pages: body.max_pages || body.maxPages || url.searchParams.get('max_pages'),
    max_windows: body.max_windows || body.maxWindows || url.searchParams.get('max_windows'),
    shop_limit: body.shop_limit || body.shopLimit || url.searchParams.get('shop_limit'),
    item_limit: body.item_limit || body.itemLimit || url.searchParams.get('item_limit'),
    history_days: body.history_days || body.historyDays || body.days || url.searchParams.get('history_days') || url.searchParams.get('days'),
    window_days: body.window_days || body.windowDays || url.searchParams.get('window_days'),
    cursor: body.cursor || url.searchParams.get('cursor'),
    status: body.status || url.searchParams.get('status'),
    review_id: body.review_id || body.reviewId || url.searchParams.get('review_id'),
    content: body.content || body.reply || body.message || url.searchParams.get('content'),
    action_id: body.action_id || body.actionId || body.id || url.searchParams.get('action_id'),
    action: body.action || url.searchParams.get('action'),
    note: body.note || url.searchParams.get('note')
  }
}

function shopDisplayName(shop = {}) {
  return cleanText(shop.shop_name || shop.user_name || shop.api_shop_id)
}

function shopeeShopUrlBuilder(app, path, accessToken, shopId) {
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

async function fetchShopeeReviewJson(buildUrl, params = {}) {
  const url = await buildUrl(params)
  const res = await fetch(url)
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Shopee API trả phản hồi không phải JSON, HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
  if (data.error) throw new Error(data.message || data.msg || data.error)
  return data
}

function isShopeeInvalidAccessTokenMessage(message) {
  const text = lowerText(message)
  return text.includes('invalid_access_token') ||
    text.includes('invalid access_token') ||
    text.includes('invalid_acceess_token') ||
    text.includes('access_token is invalid')
}

async function callShopeeReviewWithShop(env, shop, params = {}, retry = true) {
  if (!cleanText(shop.api_shop_id)) throw new Error('Shop Shopee chưa có shop_id API.')
  if (!cleanText(shop.access_token)) throw new Error('Shop Shopee chưa có access token API.')
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name || shop.api_shop_id)
  const buildUrl = shopeeShopUrlBuilder(app, SHOPEE_GET_COMMENT_PATH, shop.access_token, shop.api_shop_id)
  try {
    return await fetchShopeeReviewJson(buildUrl, params)
  } catch (error) {
    if (retry && isShopeeInvalidAccessTokenMessage(error?.message) && cleanText(shop.refresh_token) && shop.id) {
      const refreshed = await refreshShopeeTokenForShop(env, shop)
      shop.access_token = refreshed.access_token
      shop.refresh_token = refreshed.refresh_token
      return callShopeeReviewWithShop(env, shop, params, false)
    }
    throw error
  }
}

function normalizeShopeeCommentList(data = {}) {
  const response = data.response || data.data || data
  const list = response.comment_list ||
    response.comments ||
    response.review_list ||
    data.comment_list ||
    data.comments ||
    []
  return Array.isArray(list) ? list : []
}

function shopeeNextCursor(data = {}) {
  const response = data.response || data.data || data
  return cleanText(response.next_cursor || response.cursor || data.next_cursor)
}

function shopeeHasMore(data = {}, nextCursor = '') {
  const response = data.response || data.data || data
  if (response.more !== undefined) return !!response.more
  if (response.has_more !== undefined) return !!response.has_more
  return !!nextCursor
}

function normalizeLazadaReviewIds(data = {}) {
  const root = data.data || data.result || data.response || data
  const idSources = [
    root.review_id_list,
    root.review_ids,
    root.id_list,
    root.ids,
    data.review_id_list,
    data.review_ids
  ]
  const ids = []
  for (const source of idSources) {
    if (!Array.isArray(source)) continue
    for (const value of source) {
      if (typeof value === 'object') ids.push(cleanText(value.id || value.review_id))
      else ids.push(cleanText(value))
    }
  }
  const rowSources = [root.reviews, root.review_list, root.items, root.list, root.data]
  for (const source of rowSources) {
    if (!Array.isArray(source)) continue
    for (const row of source) ids.push(cleanText(row.id || row.review_id))
  }
  return [...new Set(ids.filter(Boolean))]
}

function normalizeLazadaReviewDetails(data = {}) {
  const root = data.data || data.result || data.response || data
  const sources = [
    root.review_list,
    root.reviews,
    root.items,
    root.list,
    root.data,
    data.review_list,
    data.reviews
  ]
  for (const source of sources) {
    if (Array.isArray(source)) return source
  }
  return []
}

function lazadaHasDetailedRows(data = {}) {
  return normalizeLazadaReviewDetails(data).some(row => typeof row === 'object' && (row.review_content || row.ratings || row.product_id || row.item_id))
}

function buildLazadaReviewWindows(options = {}) {
  const historyDays = Math.max(1, Math.min(Number(options.history_days || options.historyDays || options.days || 7) || 7, 84))
  const windowDays = Math.max(1, Math.min(Number(options.window_days || options.windowDays || 7) || 7, 7))
  const maxWindows = Math.max(1, Math.min(Number(options.max_windows || options.maxWindows || Math.ceil(historyDays / windowDays)) || 1, 12))
  const endMs = Date.now()
  const windows = []
  let cursorEnd = endMs
  let remainingDays = historyDays
  for (let index = 0; index < maxWindows && remainingDays > 0; index += 1) {
    const days = Math.min(windowDays, remainingDays)
    const start = cursorEnd - days * 24 * 60 * 60 * 1000
    windows.push({
      index: index + 1,
      start_time: start,
      end_time: cursorEnd,
      start_date: new Date(start).toISOString().slice(0, 10),
      end_date: new Date(cursorEnd).toISOString().slice(0, 10)
    })
    cursorEnd = start - 1000
    remainingDays -= days
  }
  return {
    history_days: historyDays,
    window_days: windowDays,
    max_windows: maxWindows,
    windows
  }
}

async function loadReviewCandidatesForShop(env, platform, shopName, options = {}) {
  const itemLimit = parseLimit(options.item_limit || options.itemLimit, 20, 100)
  return loadReviewProductCandidates(env, {
    platform,
    shop: shopName,
    item_limit: itemLimit
  })
}

function buildProductMap(candidates = []) {
  const map = new Map()
  for (const row of candidates) {
    const key = cleanText(row.platform_item_id)
    if (key) map.set(key, row)
  }
  return map
}

export async function syncShopeeProductReviews(env, options = {}) {
  const shopLimit = parseLimit(options.shop_limit || options.shopLimit, 5, 20)
  const pageSize = parseLimit(options.page_size || options.pageSize || options.limit, 50, 100)
  const maxPages = parseLimit(options.max_pages || options.maxPages, 1, 5)
  const shops = await getApiShops(env, 'shopee', cleanText(options.shop), shopLimit)
  const resultRows = []
  const shopResults = []
  const warnings = []

  for (const shop of shops) {
    const shopName = shopDisplayName(shop)
    const candidates = await loadReviewCandidatesForShop(env, 'shopee', shopName, options)
    const productMap = buildProductMap(candidates)
    let fetched = 0
    let saved = 0
    let inserted = 0
    let updated = 0
    let checkedItems = 0

    if (!candidates.length) {
      warnings.push(`${shopName}: chưa có catalog item để gọi Product.get_comment.`)
      shopResults.push({ shop: shopName, fetched: 0, saved: 0, checked_items: 0, warning: 'missing_catalog_items' })
      continue
    }

    for (const item of candidates) {
      const itemId = cleanText(item.platform_item_id)
      if (!itemId) continue
      checkedItems += 1
      let cursor = cleanText(options.cursor)
      for (let page = 1; page <= maxPages; page += 1) {
        try {
          const params = {
            item_id: itemId,
            page_size: pageSize
          }
          if (cursor) params.cursor = cursor
          const data = await callShopeeReviewWithShop(env, shop, params)
          const comments = normalizeShopeeCommentList(data)
          const normalized = comments.map(comment => {
            const product = productMap.get(cleanText(comment.item_id || itemId)) || item
            return {
              ...normalizeShopeeReviewRow({
                ...comment,
                item_id: comment.item_id || itemId
              }, shop),
              item_sku: cleanText(comment.item_sku || product.item_sku),
              product_name: cleanText(comment.product_name || comment.item_name || product.product_name)
            }
          })
          if (normalized.length) {
            const savedResult = await saveReviewRows(env, normalized)
            saved += savedResult.saved
            inserted += savedResult.inserted
            updated += savedResult.updated
            fetched += normalized.length
            resultRows.push(...normalized)
          }
          cursor = shopeeNextCursor(data)
          if (!comments.length || !shopeeHasMore(data, cursor)) break
        } catch (error) {
          warnings.push(`${shopName} / ${itemId}: ${cleanText(error.message || error)}`)
          break
        }
      }
    }

    shopResults.push({
      shop: shopName,
      api_shop_id: cleanText(shop.api_shop_id),
      checked_items: checkedItems,
      fetched,
      saved,
      inserted,
      updated
    })
  }

  const repair = await repairReviewCatalogMapping(env, {
    platform: 'shopee',
    shop: cleanText(options.shop),
    limit: 1000
  })

  return {
    status: warnings.length && !resultRows.length ? 'warning' : 'ok',
    mode: 'shopee_review_sync',
    platform: 'shopee',
    endpoint: SHOPEE_GET_COMMENT_PATH,
    shops: shopResults,
    fetched: resultRows.length,
    saved: shopResults.reduce((total, row) => total + numberValue(row.saved), 0),
    inserted: shopResults.reduce((total, row) => total + numberValue(row.inserted), 0),
    updated: shopResults.reduce((total, row) => total + numberValue(row.updated), 0),
    repair,
    warnings,
    safety: {
      read_only_sync: true,
      reply_apply_locked: true,
      note: 'Đồng bộ chỉ đọc review và lưu core. Không gửi phản hồi lên Shopee trong bước này.'
    }
  }
}

export async function syncLazadaProductReviews(env, options = {}) {
  const shopLimit = parseLimit(options.shop_limit || options.shopLimit, 5, 20)
  const pageSize = parseLimit(options.page_size || options.pageSize || options.limit, 50, 100)
  const shops = await getApiShops(env, 'lazada', cleanText(options.shop), shopLimit)
  const windowPlan = buildLazadaReviewWindows(options)
  const resultRows = []
  const shopResults = []
  const warnings = []

  for (const shop of shops) {
    const shopName = shopDisplayName(shop)
    const candidates = await loadReviewCandidatesForShop(env, 'lazada', shopName, options)
    const productMap = buildProductMap(candidates)
    const candidateIds = candidates.map(row => cleanText(row.platform_item_id)).filter(Boolean)
    let fetchedIds = 0
    let fetched = 0
    let saved = 0
    let inserted = 0
    let updated = 0
    const ids = new Set()

    for (const window of windowPlan.windows) {
      // Lazada review history yêu cầu item_id, nên batch chạy theo item đã có trong catalog thay vì gửi một mảng chung.
      const historyItemIds = candidateIds.length ? candidateIds : ['']
      for (const itemId of historyItemIds) {
        try {
          const historyParams = {
            page_no: 1,
            current: 1,
            page_size: pageSize,
            pageSize,
            start_time: window.start_time,
            end_time: window.end_time,
            start_date: window.start_date,
            end_date: window.end_date
          }
          if (itemId) {
            historyParams.item_id = itemId
            historyParams.itemId = itemId
            historyParams.product_id = itemId
          }
          const historyData = await callLazadaWithShop(env, shop, LAZADA_REVIEW_HISTORY_PATH, historyParams)
          if (lazadaHasDetailedRows(historyData)) {
            const rows = normalizeLazadaReviewDetails(historyData).map(row => normalizeLazadaReviewRow(row, shop, productMap))
            if (rows.length) {
              const savedResult = await saveReviewRows(env, rows)
              saved += savedResult.saved
              inserted += savedResult.inserted
              updated += savedResult.updated
              fetched += rows.length
              resultRows.push(...rows)
            }
          }
          for (const id of normalizeLazadaReviewIds(historyData)) ids.add(id)
        } catch (error) {
          warnings.push(`${shopName} / ${itemId || 'no-item'} / window ${window.index}: ${cleanText(error.message || error)}`)
        }
      }
    }

    const idList = [...ids]
    fetchedIds = idList.length
    for (let index = 0; index < idList.length; index += 10) {
      const chunk = idList.slice(index, index + 10)
      try {
        const detailData = await callLazadaWithShop(env, shop, LAZADA_REVIEW_LIST_PATH, {
          current: 1,
          page_no: 1,
          page_size: pageSize,
          ids: JSON.stringify(chunk),
          review_ids: JSON.stringify(chunk),
          id_list: JSON.stringify(chunk)
        })
        const rows = normalizeLazadaReviewDetails(detailData).map(row => normalizeLazadaReviewRow(row, shop, productMap))
        if (!rows.length) continue
        const savedResult = await saveReviewRows(env, rows)
        saved += savedResult.saved
        inserted += savedResult.inserted
        updated += savedResult.updated
        fetched += rows.length
        resultRows.push(...rows)
      } catch (error) {
        warnings.push(`${shopName} / detail ${chunk.join(',')}: ${cleanText(error.message || error)}`)
      }
    }

    shopResults.push({
      shop: shopName,
      api_shop_id: cleanText(shop.api_shop_id),
      candidate_items: candidateIds.length,
      fetched_ids: fetchedIds,
      fetched,
      saved,
      inserted,
      updated
    })
  }

  const repair = await repairReviewCatalogMapping(env, {
    platform: 'lazada',
    shop: cleanText(options.shop),
    limit: 1000
  })

  return {
    status: warnings.length && !resultRows.length ? 'warning' : 'ok',
    mode: 'lazada_review_sync',
    platform: 'lazada',
    endpoints: [LAZADA_REVIEW_HISTORY_PATH, LAZADA_REVIEW_LIST_PATH],
    window_plan: windowPlan,
    shops: shopResults,
    fetched: resultRows.length,
    saved: shopResults.reduce((total, row) => total + numberValue(row.saved), 0),
    inserted: shopResults.reduce((total, row) => total + numberValue(row.inserted), 0),
    updated: shopResults.reduce((total, row) => total + numberValue(row.updated), 0),
    repair,
    warnings,
    safety: {
      read_only_sync: true,
      reply_apply_locked: true,
      note: 'Đồng bộ chỉ đọc review và lưu core. Không gửi phản hồi lên Lazada trong bước này.'
    }
  }
}

export async function syncMarketplaceReviews(env, options = {}) {
  const platform = lowerText(options.platform)
  const results = {}
  if (!platform || platform === 'shopee') {
    results.shopee = await syncShopeeProductReviews(env, options)
  }
  if (!platform || platform === 'lazada') {
    results.lazada = await syncLazadaProductReviews(env, options)
  }
  const repair = await repairReviewCatalogMapping(env, {
    platform,
    shop: cleanText(options.shop),
    limit: 1000
  })
  return {
    status: 'ok',
    mode: 'marketplace_review_sync',
    results,
    repair,
    safety: {
      read_only_sync: true,
      reply_apply_locked: true,
      shop_api: 'Shop có API đọc review bằng endpoint sàn rồi lưu vào D1 review_core.',
      shop_no_api: 'Shop không có API chưa gọi sàn; chỉ xem dữ liệu đã cache/import ở phase sau.'
    }
  }
}

export async function handleReviews(request, env, cors) {
  const url = new URL(request.url)
  const body = await readBody(request)
  const options = pickOptions(url, body)

  try {
    if (request.method === 'GET') {
      if (url.pathname === '/api/reviews/product-risk') {
        return json(await loadReviewProductRisk(env, options), cors)
      }
      if (url.pathname === '/api/reviews/actions' || url.pathname === '/api/reviews/action-logs') {
        return json(await loadReviewActionLogs(env, options), cors)
      }
      return json(await loadReviewCore(env, options), cors)
    }

    if (request.method !== 'POST') {
      return json({ error: 'Phương thức không hỗ trợ cho review.' }, cors, 405)
    }

    if (url.pathname === '/api/reviews/sync') {
      return json(await syncMarketplaceReviews(env, options), cors)
    }
    if (url.pathname === '/api/reviews/shopee/sync') {
      return json(await syncShopeeProductReviews(env, options), cors)
    }
    if (url.pathname === '/api/reviews/lazada/sync' || url.pathname === '/api/reviews/lazada/batch-sync') {
      return json(await syncLazadaProductReviews(env, options), cors)
    }
    if (url.pathname === '/api/reviews/repair-mapping') {
      return json(await repairReviewCatalogMapping(env, options), cors)
    }
    if (url.pathname === '/api/reviews/reply-suggest') {
      return json(await createReviewReplySuggestion(env, options), cors)
    }
    if (url.pathname === '/api/reviews/reply-preview') {
      return json(await createReviewReplyPreview(env, options), cors)
    }
    if (url.pathname === '/api/reviews/reply-action') {
      return json(await updateReviewReplyAction(env, options), cors)
    }

    return json({ error: 'Endpoint đánh giá không tồn tại.' }, cors, 404)
  } catch (error) {
    return json({
      status: 'error',
      error: cleanText(error?.message || error),
      mode: 'review_route_error'
    }, cors, 500)
  }
}
