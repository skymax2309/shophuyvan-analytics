const SHOP_SYNC_COLUMNS = [
  ['last_order_sync_at', "TEXT DEFAULT ''"],
  ['last_order_sync_status', "TEXT DEFAULT ''"],
  ['last_order_sync_error', "TEXT DEFAULT ''"],
  ['last_order_status_sync_at', "TEXT DEFAULT ''"],
  ['last_order_status_sync_status', "TEXT DEFAULT ''"],
  ['last_order_status_sync_error', "TEXT DEFAULT ''"],
  ['last_webhook_event_at', "TEXT DEFAULT ''"],
  ['last_webhook_event_status', "TEXT DEFAULT ''"],
  ['last_webhook_event_error', "TEXT DEFAULT ''"]
]

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function sanitizeApiSyncError(error) {
  const text = cleanText(error?.message || error)
  if (!text) return ''
  return text
    .replace(/(access_token=)[^&\s]+/gi, '$1***')
    .replace(/(refresh_token=)[^&\s]+/gi, '$1***')
    .replace(/("access_token"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("refresh_token"\s*:\s*")[^"]+/gi, '$1***')
    .slice(0, 500)
}

async function addColumnIfMissing(env, table, column, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
  }
}

export async function ensureShopSyncDiagnosticsColumns(env) {
  for (const [column, definition] of SHOP_SYNC_COLUMNS) {
    await addColumnIfMissing(env, 'shops', column, definition)
  }
}

function syncStatusFromResult(result = {}, error = null) {
  if (error) return 'error'
  const warnings = Array.isArray(result.warnings) ? result.warnings : []
  if (warnings.length) return 'partial_error'
  return 'ok'
}

function syncErrorFromResult(result = {}, error = null) {
  if (error) return sanitizeApiSyncError(error)
  const warning = Array.isArray(result.warnings) ? result.warnings.find(item => item?.message || item?.error) : null
  return sanitizeApiSyncError(warning?.message || warning?.error || '')
}

function shopIdentity(shop = {}) {
  return {
    id: shop.id,
    platform: cleanText(shop.platform).toLowerCase(),
    shop: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id),
    apiShopId: cleanText(shop.api_shop_id)
  }
}

async function updateShopDiagnostics(env, shop, fields) {
  await ensureShopSyncDiagnosticsColumns(env)
  const identity = shopIdentity(shop)
  const assignments = Object.keys(fields).map(key => `${key} = ?`).join(', ')
  const values = Object.values(fields)
  if (identity.id) {
    await env.DB.prepare(`UPDATE shops SET ${assignments} WHERE id = ?`).bind(...values, identity.id).run()
    return
  }
  await env.DB.prepare(`
    UPDATE shops
    SET ${assignments}
    WHERE LOWER(COALESCE(platform, '')) = ?
      AND (
        COALESCE(api_shop_id, '') = ?
        OR COALESCE(shop_name, '') = ?
        OR COALESCE(user_name, '') = ?
      )
  `).bind(...values, identity.platform, identity.apiShopId, identity.shop, identity.shop).run()
}

export async function recordShopOrderSyncDiagnostic(env, shop, result = {}, error = null) {
  const status = syncStatusFromResult(result, error)
  const lastError = syncErrorFromResult(result, error)
  await updateShopDiagnostics(env, shop, {
    last_order_sync_at: new Date().toISOString(),
    last_order_sync_status: status,
    last_order_sync_error: lastError
  })
  if (status !== 'ok') {
    console.warn('[API_SYNC_ORDER_DIAGNOSTIC]', {
      platform: shopIdentity(shop).platform,
      shop: shopIdentity(shop).shop,
      status,
      message: lastError
    })
  }
}

export async function recordShopOrderStatusSyncDiagnostic(env, shop, result = {}, error = null) {
  const status = syncStatusFromResult(result, error)
  const lastError = syncErrorFromResult(result, error)
  await updateShopDiagnostics(env, shop, {
    last_order_status_sync_at: new Date().toISOString(),
    last_order_status_sync_status: status,
    last_order_status_sync_error: lastError
  })
  if (status !== 'ok') {
    console.warn('[API_SYNC_STATUS_DIAGNOSTIC]', {
      platform: shopIdentity(shop).platform,
      shop: shopIdentity(shop).shop,
      status,
      message: lastError
    })
  }
}

export async function recordShopWebhookDiagnostic(env, event = {}, error = null) {
  const status = error ? 'error' : cleanText(event.status || 'ok')
  await updateShopDiagnostics(env, {
    platform: event.platform,
    shop_name: event.shop,
    user_name: event.shop,
    api_shop_id: event.shop_id
  }, {
    last_webhook_event_at: new Date().toISOString(),
    last_webhook_event_status: status,
    last_webhook_event_error: sanitizeApiSyncError(error || event.error || '')
  })
}

