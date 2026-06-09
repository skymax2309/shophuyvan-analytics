const DEFAULT_SHOPS = [
  { shop_id: 'chihuy1984', platform: 'shopee', enabled: 1 },
  { shop_id: 'chihuy2309', platform: 'shopee', enabled: 1 },
  { shop_id: 'phambich2312', platform: 'shopee', enabled: 1 },
  { shop_id: 'kinhdoanhonlinegiasoc', platform: 'lazada', enabled: 0 }
]

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function intValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}

function realValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function jsonText(value, fallback = '[]') {
  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return value
    } catch {
      return fallback
    }
  }
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

function normalizeShopIds(input = []) {
  if (!Array.isArray(input)) return []
  const list = []
  for (const item of input) {
    const shopId = cleanText(
      typeof item === 'string'
        ? item
        : (item?.shop_id || item?.shop || item?.id || item?.value)
    )
    if (shopId) list.push(shopId)
  }
  return Array.from(new Set(list))
}

export async function ensureFlashAutoTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS flash_auto_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'shopee',
      enabled INTEGER NOT NULL DEFAULT 0,
      auto_submit INTEGER NOT NULL DEFAULT 1,
      max_items INTEGER NOT NULL DEFAULT 50,
      min_stock INTEGER NOT NULL DEFAULT 5,
      active_only INTEGER NOT NULL DEFAULT 1,
      fallback_discount_percent REAL NOT NULL DEFAULT 10,
      min_discount_percent REAL NOT NULL DEFAULT 5,
      timeslot_mode TEXT NOT NULL DEFAULT 'auto',
      timeslot_id INTEGER,
      run_before_minutes INTEGER NOT NULL DEFAULT 30,
      schedule_days TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
      updated_at TEXT
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS flash_auto_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id TEXT,
      timeslot_id INTEGER,
      items_submitted INTEGER DEFAULT 0,
      items_confirmed INTEGER DEFAULT 0,
      price_source TEXT,
      live_write_sent INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      message TEXT,
      ran_at TEXT
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_flash_auto_logs_lookup
    ON flash_auto_logs(shop_id, ran_at)
  `).run()

  for (const row of DEFAULT_SHOPS) {
    await env.DB.prepare(`
      INSERT INTO flash_auto_settings
        (shop_id, platform, enabled, updated_at)
      VALUES (?, ?, ?, datetime('now', '+7 hours'))
      ON CONFLICT(shop_id) DO NOTHING
    `).bind(row.shop_id, row.platform, row.enabled).run()
  }
}

export function normalizeFlashAutoSetting(input = {}) {
  return {
    shop_id: cleanText(input.shop_id || input.shop || input.id),
    platform: cleanText(input.platform || 'shopee').toLowerCase() || 'shopee',
    enabled: intValue(input.enabled, 0) ? 1 : 0,
    auto_submit: input.auto_submit === undefined ? 1 : (intValue(input.auto_submit, 1) ? 1 : 0),
    max_items: Math.min(Math.max(intValue(input.max_items, 50), 1), 200),
    min_stock: Math.max(intValue(input.min_stock, 5), 0),
    active_only: input.active_only === undefined ? 1 : (intValue(input.active_only, 1) ? 1 : 0),
    fallback_discount_percent: Math.min(Math.max(realValue(input.fallback_discount_percent, 10), 0), 90),
    min_discount_percent: Math.min(Math.max(realValue(input.min_discount_percent, 5), 0), 90),
    timeslot_mode: cleanText(input.timeslot_mode || 'auto') === 'manual' ? 'manual' : 'auto',
    timeslot_id: cleanText(input.timeslot_id) ? intValue(input.timeslot_id, 0) : null,
    run_before_minutes: Math.min(Math.max(intValue(input.run_before_minutes, 30), 0), 1440),
    schedule_days: jsonText(input.schedule_days || ['mon', 'tue', 'wed', 'thu', 'fri'])
  }
}

export async function getFlashAutoSetting(env, shopId) {
  await ensureFlashAutoTables(env)
  const shop = cleanText(shopId)
  if (!shop) return null
  return env.DB.prepare(`
    SELECT *
    FROM flash_auto_settings
    WHERE shop_id = ?
    LIMIT 1
  `).bind(shop).first()
}

export async function upsertFlashAutoSetting(env, input = {}) {
  await ensureFlashAutoTables(env)
  const row = normalizeFlashAutoSetting(input)
  if (!row.shop_id) return { status: 'error', message: 'Chọn shop trước khi lưu cài đặt.' }
  await env.DB.prepare(`
    INSERT INTO flash_auto_settings
      (shop_id, platform, enabled, auto_submit, max_items, min_stock, active_only,
       fallback_discount_percent, min_discount_percent, timeslot_mode, timeslot_id,
       run_before_minutes, schedule_days, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
    ON CONFLICT(shop_id) DO UPDATE SET
      platform = excluded.platform,
      enabled = excluded.enabled,
      auto_submit = excluded.auto_submit,
      max_items = excluded.max_items,
      min_stock = excluded.min_stock,
      active_only = excluded.active_only,
      fallback_discount_percent = excluded.fallback_discount_percent,
      min_discount_percent = excluded.min_discount_percent,
      timeslot_mode = excluded.timeslot_mode,
      timeslot_id = excluded.timeslot_id,
      run_before_minutes = excluded.run_before_minutes,
      schedule_days = excluded.schedule_days,
      updated_at = excluded.updated_at
  `).bind(
    row.shop_id,
    row.platform,
    row.enabled,
    row.auto_submit,
    row.max_items,
    row.min_stock,
    row.active_only,
    row.fallback_discount_percent,
    row.min_discount_percent,
    row.timeslot_mode,
    row.timeslot_id,
    row.run_before_minutes,
    row.schedule_days
  ).run()
  return { status: 'ok', message: 'Đã lưu cài đặt Flash Sale tự động.', setting: await getFlashAutoSetting(env, row.shop_id) }
}

export async function upsertFlashAutoSettingsBatch(env, payload = {}) {
  const template = (payload && typeof payload.template === 'object') ? payload.template : {}
  const shopIds = normalizeShopIds(payload.shop_ids || payload.selected_shops || payload.shops)
  if (!shopIds.length) {
    return {
      status: 'error',
      message: 'Chon it nhat mot shop truoc khi luu cai dat hang loat.'
    }
  }
  if (shopIds.length > 100) {
    return {
      status: 'error',
      message: 'Toi da 100 shop cho moi lan luu cai dat hang loat.'
    }
  }

  const settled = await Promise.allSettled(
    shopIds.map(async (shopId) => {
      const saved = await upsertFlashAutoSetting(env, { ...template, shop_id: shopId })
      return {
        shop_id: shopId,
        status: saved?.status === 'ok' ? 'ok' : 'error',
        message: cleanText(saved?.message),
        setting: saved?.setting || null
      }
    })
  )

  const results = settled.map((entry, index) => {
    const shopId = shopIds[index]
    if (entry.status === 'fulfilled') return entry.value
    return {
      shop_id: shopId,
      status: 'error',
      message: cleanText(entry.reason?.message || 'Khong the luu cai dat cho shop nay.'),
      setting: null
    }
  })
  const success = results.filter((item) => item.status === 'ok').length
  return {
    status: 'ok',
    message: 'Da luu cai dat cho ' + success + '/' + results.length + ' shop.',
    results,
    summary: {
      total: results.length,
      success,
      failed: results.length - success
    }
  }
}

async function listShopCore(env) {
  const { results } = await env.DB.prepare(`
    SELECT shop_name, user_name, platform, api_shop_id,
           CASE WHEN COALESCE(access_token, '') != '' THEN 1 ELSE 0 END AS has_access_token
    FROM shops
    WHERE COALESCE(shop_name, user_name, api_shop_id, '') != ''
    ORDER BY platform, shop_name, user_name
  `).all().catch(() => ({ results: [] }))
  return results || []
}

export async function listFlashAutoSettings(env) {
  await ensureFlashAutoTables(env)
  const [{ results: settings }, shops] = await Promise.all([
    env.DB.prepare('SELECT * FROM flash_auto_settings ORDER BY platform, shop_id').all(),
    listShopCore(env)
  ])
  const shopMap = new Map()
  for (const shop of shops) {
    for (const key of [shop.shop_name, shop.user_name, shop.api_shop_id].map(cleanText).filter(Boolean)) {
      shopMap.set(key.toLowerCase(), shop)
    }
  }
  return (settings || []).map(row => {
    const shop = shopMap.get(cleanText(row.shop_id).toLowerCase()) || {}
    return {
      ...row,
      shop_name: cleanText(shop.shop_name || row.shop_id),
      user_name: cleanText(shop.user_name || row.shop_id),
      api_shop_id: cleanText(shop.api_shop_id),
      has_access_token: Number(shop.has_access_token || 0)
    }
  })
}

export async function listFlashAutoLogs(env, options = {}) {
  await ensureFlashAutoTables(env)
  const limit = Math.min(Math.max(intValue(options.limit, 20), 1), 100)
  const shop = cleanText(options.shop)
  const where = shop ? 'WHERE shop_id = ?' : ''
  const query = `
    SELECT *
    FROM flash_auto_logs
    ${where}
    ORDER BY ran_at DESC, id DESC
    LIMIT ?
  `
  const stmt = env.DB.prepare(query)
  const bound = shop ? stmt.bind(shop, limit) : stmt.bind(limit)
  const { results } = await bound.all()
  return results || []
}

export function installDiscountsFlashAutoSettings(core) {
  const oldHandleDiscounts = core.handleDiscounts
  const getAdminUserFromRequest = core.getAdminUserFromRequest
  const isPromotionApplyAdmin = typeof core.isPromotionApplyAdmin === 'function'
    ? (...args) => core.isPromotionApplyAdmin(...args)
    : (user) => user?.role === 'admin'
  const json = (...args) => core.json(...args)

  core.handleDiscounts = async function handleFlashAutoSettings(request, env, cors) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    if (url.pathname === '/api/discounts/flash-auto/settings') {
      if (request.method === 'GET') {
        const row = await getFlashAutoSetting(env, url.searchParams.get('shop'))
        return json({ status: row ? 'ok' : 'missing', setting: row }, cors, row ? 200 : 404)
      }
      if (request.method === 'POST') {
        const user = await getAdminUserFromRequest(request, env)
        if (!isPromotionApplyAdmin(user)) {
          return json({ status: 'error', error: 'admin_required', message: 'Chi tai khoan admin duoc thay doi cai dat Flash Sale.' }, cors, 403)
        }
        const body = await request.json().catch(() => ({}))
        return json(await upsertFlashAutoSetting(env, body.setting || body), cors)
      }
      return json({ status: 'error', message: 'Phương thức không hỗ trợ.' }, cors, 405)
    }

    if (url.pathname === '/api/discounts/flash-auto/settings/batch') {
      if (request.method !== 'POST') return json({ status: 'error', message: 'Phuong thuc khong ho tro.' }, cors, 405)
      const user = await getAdminUserFromRequest(request, env)
      if (!isPromotionApplyAdmin(user)) {
        return json({ status: 'error', error: 'admin_required', message: 'Chi tai khoan admin duoc thay doi cai dat Flash Sale hang loat.' }, cors, 403)
      }
      const body = await request.json().catch(() => ({}))
      const result = await upsertFlashAutoSettingsBatch(env, body)
      return json(result, cors, result.status === 'error' ? 400 : 200)
    }

    if (url.pathname === '/api/discounts/flash-auto/settings/all') {
      return json({ status: 'ok', settings: await listFlashAutoSettings(env) }, cors)
    }

    if (url.pathname === '/api/discounts/flash-auto/logs') {
      return json({
        status: 'ok',
        logs: await listFlashAutoLogs(env, {
          shop: url.searchParams.get('shop'),
          limit: url.searchParams.get('limit')
        })
      }, cors)
    }

    return oldHandleDiscounts(request, env, cors)
  }
}
