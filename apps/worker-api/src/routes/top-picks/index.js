import { getShopeeAppFromRow, signHmacHex } from '../../utils/shopee-apps.js'
import { getApiShops } from '../api/index.js'
import { analyzeShopeeTopPicksAttachRate, configureTopPicksAnalysisDeps } from './analysis.js'
import { buildShopeeActionResult, shopeeResponseHasBusinessError } from '../../core/shopee/action-result-core.js'
export { analyzeShopeeTopPicksAttachRate }

const SHOPEE_TOP_PICKS_LIST_PATH = '/api/v2/top_picks/get_top_picks_list'
const SHOPEE_TOP_PICKS_MUTATIONS = {
  add: '/api/v2/top_picks/add_top_picks',
  update: '/api/v2/top_picks/update_top_picks',
  delete: '/api/v2/top_picks/delete_top_picks'
}
const TOP_PICKS_CONFIRM_TEXT = 'TOI_HIEU_DAY_LA_THAY_DOI_TOPPICKS_SHOPEE'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na'].includes(lower)) return ''
  return text
}

function compactJson(value, limit = 30000) {
  try {
    return JSON.stringify(value ?? {}).slice(0, limit)
  } catch {
    return '{}'
  }
}

function num(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const number = Number(String(value).replace(/[%,$\s]/g, ''))
  return Number.isFinite(number) ? number : 0
}

function round2(value) {
  return Math.round(num(value) * 100) / 100
}

function dateYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseYmd(value, fallback = '') {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function defaultRange(days = 7) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - Math.max(0, Number(days || 7) - 1))
  return { from: dateYmd(from), to: dateYmd(to) }
}

function hourLabel(hour) {
  const h = Math.max(0, Math.min(23, Number(hour || 0)))
  return `${String(h).padStart(2, '0')}:00-${String((h + 1) % 24).padStart(2, '0')}:00`
}

function lower(value) {
  return cleanText(value).toLowerCase()
}

function sameShopFilterSql(shop, alias = 'shop') {
  const value = cleanText(shop)
  if (!value) return { sql: '', params: [] }
  return { sql: ` AND ${alias} = ?`, params: [value] }
}

function signShopeeUrl(app, path, accessToken, shopId) {
  return async function(params = {}) {
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

async function fetchShopeeJson(buildUrl, params = {}) {
  const url = await buildUrl(params)
  const res = await fetch(url)
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Shopee API returned non-JSON, HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
  if (data.error) throw new Error(data.message || data.msg || data.error)
  return data
}

async function fetchShopeeJsonPost(buildUrl, body = {}) {
  const url = await buildUrl({})
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Shopee API returned non-JSON, HTTP ${res.status}`)
  }
  if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
  if (data.error) throw new Error(data.message || data.msg || data.error)
  return data
}

export async function ensureShopeeTopPicksTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_top_picks_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'shopee',
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      top_picks_id TEXT DEFAULT '',
      name TEXT DEFAULT '',
      is_activated INTEGER DEFAULT 0,
      is_current INTEGER DEFAULT 1,
      item_count INTEGER DEFAULT 0,
      item_ids_json TEXT DEFAULT '[]',
      raw_data TEXT DEFAULT '{}',
      request_id TEXT DEFAULT '',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_top_picks_collection_unique
    ON marketplace_top_picks_collections(platform, api_shop_id, top_picks_id)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_top_picks_collection_shop
    ON marketplace_top_picks_collections(platform, shop, is_activated, is_current)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_top_picks_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'shopee',
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      top_picks_id TEXT DEFAULT '',
      item_id TEXT DEFAULT '',
      item_name TEXT DEFAULT '',
      current_price REAL DEFAULT 0,
      inflated_price_of_current_price REAL DEFAULT 0,
      sales REAL DEFAULT 0,
      raw_data TEXT DEFAULT '{}',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_top_picks_item_unique
    ON marketplace_top_picks_items(platform, api_shop_id, top_picks_id, item_id)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_top_picks_item_lookup
    ON marketplace_top_picks_items(platform, api_shop_id, item_id)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_top_picks_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'shopee',
      shop TEXT DEFAULT '',
      api_shop_id TEXT DEFAULT '',
      snapshot_date TEXT DEFAULT '',
      top_picks_id TEXT DEFAULT '',
      name TEXT DEFAULT '',
      is_activated INTEGER DEFAULT 0,
      item_count INTEGER DEFAULT 0,
      item_ids_json TEXT DEFAULT '[]',
      raw_data TEXT DEFAULT '{}',
      request_id TEXT DEFAULT '',
      synced_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_top_picks_snapshot_unique
    ON marketplace_top_picks_snapshots(platform, api_shop_id, snapshot_date, top_picks_id)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_top_picks_snapshot_range
    ON marketplace_top_picks_snapshots(platform, shop, snapshot_date, is_activated)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_top_picks_tracking_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'shopee',
      shop TEXT DEFAULT '',
      top_picks_id TEXT DEFAULT '',
      tracking_code TEXT DEFAULT '',
      voucher_code TEXT DEFAULT '',
      note TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_top_picks_tracking_unique
    ON marketplace_top_picks_tracking_tags(platform, shop, top_picks_id)
  `).run()
}

function normalizeTopPickCollections(data, shop) {
  const response = data?.response || {}
  const list = Array.isArray(response.collection_list) ? response.collection_list : []
  const shopName = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
  return list.map(collection => {
    const itemList = Array.isArray(collection.item_list) ? collection.item_list : []
    const items = itemList.map(item => ({
      platform: 'shopee',
      shop: shopName,
      api_shop_id: String(shop.api_shop_id || ''),
      top_picks_id: cleanText(collection.top_picks_id),
      item_id: cleanText(item.item_id),
      item_name: cleanText(item.item_name),
      current_price: round2(item.current_price),
      inflated_price_of_current_price: round2(item.inflated_price_of_current_price),
      sales: round2(item.sales),
      raw_data: compactJson(item, 12000)
    })).filter(item => item.top_picks_id && item.item_id)
    return {
      platform: 'shopee',
      shop: shopName,
      api_shop_id: String(shop.api_shop_id || ''),
      top_picks_id: cleanText(collection.top_picks_id),
      name: cleanText(collection.name),
      is_activated: collection.is_activated ? 1 : 0,
      item_count: items.length,
      item_ids: items.map(item => item.item_id),
      item_ids_json: compactJson(items.map(item => item.item_id), 4000),
      raw_data: compactJson(collection),
      request_id: cleanText(data?.request_id),
      items
    }
  }).filter(row => row.top_picks_id)
}

async function saveTopPicksCollections(env, shop, collections, snapshotDate = dateYmd(new Date())) {
  await ensureShopeeTopPicksTables(env)
  const shopName = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
  const apiShopId = String(shop.api_shop_id || '')
  await env.DB.prepare(`
    UPDATE marketplace_top_picks_collections
    SET is_current = 0,
        updated_at = datetime('now', '+7 hours')
    WHERE platform = 'shopee' AND api_shop_id = ?
  `).bind(apiShopId).run()

  let savedCollections = 0
  let savedItems = 0
  for (const row of collections || []) {
    await env.DB.prepare(`
      INSERT INTO marketplace_top_picks_collections (
        platform, shop, api_shop_id, top_picks_id, name, is_activated,
        is_current, item_count, item_ids_json, raw_data, request_id, synced_at, updated_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
      ON CONFLICT(platform, api_shop_id, top_picks_id) DO UPDATE SET
        shop = excluded.shop,
        name = excluded.name,
        is_activated = excluded.is_activated,
        is_current = 1,
        item_count = excluded.item_count,
        item_ids_json = excluded.item_ids_json,
        raw_data = excluded.raw_data,
        request_id = excluded.request_id,
        synced_at = datetime('now', '+7 hours'),
        updated_at = datetime('now', '+7 hours')
    `).bind(
      row.platform,
      row.shop,
      row.api_shop_id,
      row.top_picks_id,
      row.name,
      row.is_activated,
      1,
      row.item_count,
      row.item_ids_json,
      row.raw_data,
      row.request_id
    ).run()

    await env.DB.prepare(`
      INSERT INTO marketplace_top_picks_snapshots (
        platform, shop, api_shop_id, snapshot_date, top_picks_id, name,
        is_activated, item_count, item_ids_json, raw_data, request_id, synced_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
      ON CONFLICT(platform, api_shop_id, snapshot_date, top_picks_id) DO UPDATE SET
        shop = excluded.shop,
        name = excluded.name,
        is_activated = excluded.is_activated,
        item_count = excluded.item_count,
        item_ids_json = excluded.item_ids_json,
        raw_data = excluded.raw_data,
        request_id = excluded.request_id,
        synced_at = datetime('now', '+7 hours')
    `).bind(
      row.platform,
      row.shop,
      row.api_shop_id,
      snapshotDate,
      row.top_picks_id,
      row.name,
      row.is_activated,
      row.item_count,
      row.item_ids_json,
      row.raw_data,
      row.request_id
    ).run()

    await env.DB.prepare(`
      DELETE FROM marketplace_top_picks_items
      WHERE platform = 'shopee' AND api_shop_id = ? AND top_picks_id = ?
    `).bind(apiShopId, row.top_picks_id).run()

    if (row.items.length) {
      await env.DB.batch(row.items.map(item => env.DB.prepare(`
        INSERT INTO marketplace_top_picks_items (
          platform, shop, api_shop_id, top_picks_id, item_id, item_name,
          current_price, inflated_price_of_current_price, sales, raw_data, synced_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
        ON CONFLICT(platform, api_shop_id, top_picks_id, item_id) DO UPDATE SET
          shop = excluded.shop,
          item_name = excluded.item_name,
          current_price = excluded.current_price,
          inflated_price_of_current_price = excluded.inflated_price_of_current_price,
          sales = excluded.sales,
          raw_data = excluded.raw_data,
          synced_at = datetime('now', '+7 hours')
      `).bind(
        item.platform,
        item.shop,
        item.api_shop_id,
        item.top_picks_id,
        item.item_id,
        item.item_name,
        item.current_price,
        item.inflated_price_of_current_price,
        item.sales,
        item.raw_data
      )))
    }
    savedCollections += 1
    savedItems += row.items.length
  }

  return { shop: shopName, api_shop_id: apiShopId, saved_collections: savedCollections, saved_items: savedItems }
}

async function fetchShopeeTopPicksListShop(env, shop) {
  const base = {
    shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
    api_shop_id: String(shop.api_shop_id || ''),
    platform: 'shopee',
    ok: false,
    endpoint: SHOPEE_TOP_PICKS_LIST_PATH,
    total_collections: 0,
    active_collections: 0,
    total_items: 0,
    request_id: '',
    collections: [],
    error: '',
    message: ''
  }
  if (!shop.api_shop_id) return { ...base, error: 'missing_shop_id', message: 'Missing Shopee shop id' }

  try {
    const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
    const buildUrl = signShopeeUrl(app, SHOPEE_TOP_PICKS_LIST_PATH, shop.access_token, shop.api_shop_id)
    const data = await fetchShopeeJson(buildUrl)
    const collections = normalizeTopPickCollections(data, shop)
    return {
      ...base,
      ok: true,
      request_id: cleanText(data?.request_id),
      total_collections: collections.length,
      active_collections: collections.filter(row => row.is_activated).length,
      total_items: collections.reduce((sum, row) => sum + Number(row.item_count || 0), 0),
      collections
    }
  } catch (error) {
    return { ...base, error: 'shopee_top_picks_list_failed', message: error?.message || String(error) }
  }
}

export async function syncShopeeTopPicks(env, options = {}) {
  const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
  const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
  const snapshotDate = parseYmd(options.snapshot_date || options.snapshotDate, dateYmd(new Date()))
  const results = []
  let savedCollections = 0
  let savedItems = 0

  for (const shop of shops) {
    const result = await fetchShopeeTopPicksListShop(env, shop)
    if (result.ok) {
      const saved = await saveTopPicksCollections(env, shop, result.collections, snapshotDate)
      result.saved_collections = saved.saved_collections
      result.saved_items = saved.saved_items
      savedCollections += saved.saved_collections
      savedItems += saved.saved_items
    }
    results.push(result)
  }

  const okRows = results.filter(row => row.ok)
  return {
    status: 'ok',
    mode: 'shopee_top_picks_sync',
    endpoint: SHOPEE_TOP_PICKS_LIST_PATH,
    source: 'Shopee TopPicks get_top_picks_list',
    note: 'TopPicks API khong co doanh thu truc tiep; endpoint nay chi luu collection/item that de doi soat voi Ads va orders.',
    snapshot_date: snapshotDate,
    shop_count: results.length,
    ok_count: okRows.length,
    total_collections: okRows.reduce((sum, row) => sum + Number(row.total_collections || 0), 0),
    active_collections: okRows.reduce((sum, row) => sum + Number(row.active_collections || 0), 0),
    total_items: okRows.reduce((sum, row) => sum + Number(row.total_items || 0), 0),
    saved_collections: savedCollections,
    saved_items: savedItems,
    shops: results
  }
}

configureTopPicksAnalysisDeps({ ensureShopeeTopPicksTables, syncShopeeTopPicks })

async function listTopPickTracking(env, options = {}) {
  await ensureShopeeTopPicksTables(env)
  const shopFilter = sameShopFilterSql(options.shop, 'c.shop')
  const { results } = await env.DB.prepare(`
    SELECT c.shop, c.top_picks_id, c.name, c.is_activated, c.item_count,
           COALESCE(t.tracking_code, '') AS tracking_code,
           COALESCE(t.voucher_code, '') AS voucher_code,
           COALESCE(t.note, '') AS note
    FROM marketplace_top_picks_collections c
    LEFT JOIN marketplace_top_picks_tracking_tags t
      ON t.platform = c.platform
     AND t.shop = c.shop
     AND t.top_picks_id = c.top_picks_id
    WHERE c.platform = 'shopee'
      AND c.is_current = 1
      ${shopFilter.sql}
    ORDER BY c.shop, c.is_activated DESC, c.name
  `).bind(...shopFilter.params).all()
  return {
    status: 'ok',
    mode: 'top_picks_tracking_tags',
    rows: results || []
  }
}

async function saveTopPickTracking(env, options = {}) {
  await ensureShopeeTopPicksTables(env)
  const shop = cleanText(options.shop)
  const topPicksId = cleanText(options.top_picks_id || options.topPicksId)
  if (!shop || !topPicksId) {
    return { status: 'error', error: 'missing_required_fields', message: 'shop and top_picks_id are required' }
  }
  await env.DB.prepare(`
    INSERT INTO marketplace_top_picks_tracking_tags (
      platform, shop, top_picks_id, tracking_code, voucher_code, note, updated_at, created_at
    )
    VALUES ('shopee',?,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop, top_picks_id) DO UPDATE SET
      tracking_code = excluded.tracking_code,
      voucher_code = excluded.voucher_code,
      note = excluded.note,
      updated_at = datetime('now', '+7 hours')
  `).bind(
    shop,
    topPicksId,
    cleanText(options.tracking_code || options.trackingCode),
    cleanText(options.voucher_code || options.voucherCode),
    cleanText(options.note)
  ).run()
  return { status: 'ok', mode: 'top_picks_tracking_tags_saved', shop, top_picks_id: topPicksId }
}

function normalizeTopPicksPayload(action, payload = {}) {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {}
  const topPicksId = cleanText(data.top_picks_id || data.topPicksId)
  if (topPicksId) data.top_picks_id = Number(topPicksId) || topPicksId
  if (Array.isArray(data.item_id_list)) data.item_id_list = data.item_id_list.map(item => Number(item) || item).filter(Boolean)
  if (Array.isArray(data.itemIds)) data.item_id_list = data.itemIds.map(item => Number(item) || item).filter(Boolean)
  if (action === 'delete') {
    return { top_picks_id: data.top_picks_id }
  }
  if (data.is_activated !== undefined) data.is_activated = Boolean(data.is_activated)
  if (data.name !== undefined) data.name = cleanText(data.name)
  return data
}

function topPicksValidationErrors(action, payload = {}) {
  const errors = []
  if (['update', 'delete'].includes(action) && !cleanText(payload.top_picks_id)) errors.push('top_picks_id is required')
  if (['add', 'update'].includes(action) && payload.item_id_list !== undefined && !Array.isArray(payload.item_id_list)) errors.push('item_id_list must be an array')
  if (action === 'add' && !cleanText(payload.name)) errors.push('name is required')
  return errors
}

function verifyTopPicksMutation(action, payload = {}, collections = []) {
  const id = cleanText(payload.top_picks_id)
  const row = collections.find(item => cleanText(item.top_picks_id) === id)
  if (action === 'delete') {
    return { verified: !row, object_id: id, reason: row ? 'top_picks_still_exists_after_refetch' : '' }
  }
  const targetIds = new Set((payload.item_id_list || []).map(item => cleanText(item)).filter(Boolean))
  const currentIds = new Set((row?.item_ids || []).map(item => cleanText(item)).filter(Boolean))
  const missing = [...targetIds].filter(item => !currentIds.has(item))
  const activatedMatches = payload.is_activated === undefined || Boolean(row?.is_activated) === Boolean(payload.is_activated)
  return {
    verified: Boolean(row) && missing.length === 0 && activatedMatches,
    object_id: cleanText(row?.top_picks_id || id),
    missing_item_ids: missing,
    activated_matches: activatedMatches,
    refetched_item_ids: row?.item_ids || [],
    refetched_name: row?.name || ''
  }
}

async function executeShopeeTopPicksAction(env, options = {}) {
  const action = cleanText(options.action).toLowerCase()
  const endpoint = SHOPEE_TOP_PICKS_MUTATIONS[action]
  const shopFilter = cleanText(options.shop)
  const payload = normalizeTopPicksPayload(action, options.payload || {})
  const dryRun = !(options.execute === true || String(options.execute).toLowerCase() === 'true')
  const confirmed = cleanText(options.confirm) === TOP_PICKS_CONFIRM_TEXT
  const base = {
    mode: 'shopee_top_picks_action',
    action,
    endpoint,
    shop: shopFilter,
    object_id: cleanText(payload.top_picks_id)
  }
  if (!endpoint) return { ...base, status: 'error', error: 'invalid_action', allowed_actions: Object.keys(SHOPEE_TOP_PICKS_MUTATIONS) }
  const errors = topPicksValidationErrors(action, payload)
  if (!shopFilter) errors.push('shop is required')
  if (errors.length) {
    return buildShopeeActionResult({ ...base, ok: false, status: 'error', payload, message: errors.join('; '), verify_result: { validation_errors: errors } })
  }
  if (dryRun || !confirmed) {
    return buildShopeeActionResult({
      ...base,
      ok: false,
      status: 'preview',
      payload,
      dry_run: true,
      sent_to_shopee: false,
      message: dryRun ? 'Preview payload TopPicks Shopee. Chưa gọi mutation.' : 'Chưa gửi lên Shopee vì thiếu xác nhận hợp lệ.',
      verify_result: { confirmation_required: dryRun ? '' : TOP_PICKS_CONFIRM_TEXT }
    })
  }

  const shops = await getApiShops(env, 'shopee', shopFilter, 1)
  const shop = shops[0]
  if (!shop || !shop.api_shop_id) {
    return buildShopeeActionResult({ ...base, ok: false, status: 'error', payload, raw_error: { error: 'shop_not_found', message: 'Không tìm thấy shop Shopee API tương ứng.' } })
  }
  const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
  const buildUrl = signShopeeUrl(app, endpoint, shop.access_token, shop.api_shop_id)
  try {
    const response = await fetchShopeeJsonPost(buildUrl, payload)
    if (shopeeResponseHasBusinessError(response)) {
      return buildShopeeActionResult({
        ...base,
        ok: false,
        status: 'error',
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        shop_id: String(shop.api_shop_id || ''),
        payload,
        sent_to_shopee: true,
        raw_response: response,
        message: 'Shopee từ chối thao tác TopPicks. Xem raw_response.'
      })
    }
    const refetch = await fetchShopeeTopPicksListShop(env, shop)
    if (refetch.ok) await saveTopPicksCollections(env, shop, refetch.collections, dateYmd(new Date()))
    const verifyResult = verifyTopPicksMutation(action, payload, refetch.collections || [])
    return buildShopeeActionResult({
      ...base,
      object_id: verifyResult.object_id || base.object_id,
      ok: true,
      status: verifyResult.verified ? 'ok' : 'error',
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      shop_id: String(shop.api_shop_id || ''),
      payload,
      sent_to_shopee: true,
      raw_response: response,
      verified: verifyResult.verified,
      verify_result: { ...verifyResult, refetch_request_id: refetch.request_id, refetch_endpoint: SHOPEE_TOP_PICKS_LIST_PATH },
      message: verifyResult.verified
        ? 'Đã gọi Shopee TopPicks API thật và refetch xác nhận thay đổi.'
        : 'Shopee đã nhận request nhưng refetch TopPicks chưa xác nhận thay đổi, không xem là thành công.'
    })
  } catch (error) {
    return buildShopeeActionResult({
      ...base,
      ok: false,
      status: 'error',
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      shop_id: String(shop.api_shop_id || ''),
      payload,
      raw_error: { message: error?.message || String(error) },
      sent_to_shopee: true
    })
  }
}

export async function handleTopPicks(request, env, cors) {
  const url = new URL(request.url)

  if (url.pathname === '/api/top-picks/shopee/sync' || url.pathname === '/api/top-picks/sync') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await syncShopeeTopPicks(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      snapshot_date: body.snapshot_date || body.snapshotDate || url.searchParams.get('snapshot_date')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/top-picks/shopee/analysis' || url.pathname === '/api/top-picks/shopee/attach-rate') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const result = await analyzeShopeeTopPicksAttachRate(env, {
      shop: body.shop || url.searchParams.get('shop'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      from: body.from || body.from_date || url.searchParams.get('from'),
      to: body.to || body.to_date || url.searchParams.get('to'),
      days: body.days || url.searchParams.get('days'),
      limit: body.limit || url.searchParams.get('limit'),
      sync: body.sync ?? body.sync_first ?? url.searchParams.get('sync'),
      include_payment_detail: body.include_payment_detail ?? body.includePaymentDetail ?? url.searchParams.get('include_payment_detail')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/top-picks/shopee/action') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    try { body = await request.json() } catch {}
    const result = await executeShopeeTopPicksAction(env, {
      action: body.action || url.searchParams.get('action'),
      shop: body.shop || url.searchParams.get('shop'),
      payload: body.payload || {},
      execute: body.execute,
      confirm: body.confirm
    })
    return json(result, cors, result.status === 'error' ? 400 : 200)
  }

  if (url.pathname === '/api/top-picks/tracking') {
    if (request.method === 'GET') {
      const result = await listTopPickTracking(env, { shop: url.searchParams.get('shop') })
      return json(result, cors)
    }
    if (request.method === 'POST') {
      let body = {}
      try { body = await request.json() } catch {}
      const result = await saveTopPickTracking(env, body)
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }
    return json({ error: 'Method not allowed' }, cors, 405)
  }

  return json({ error: 'TopPicks endpoint not found' }, cors, 404)
}
