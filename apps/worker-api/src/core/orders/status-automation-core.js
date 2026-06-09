const ORDER_STATUS_AUTOMATION_COLUMNS = [
  ['seller_center_detail_id', "TEXT DEFAULT ''"],
  ['seller_center_detail_url', "TEXT DEFAULT ''"],
  ['seller_order_detail_id', "TEXT DEFAULT ''"],
  ['source_url', "TEXT DEFAULT ''"],
  ['raw_detail_url', "TEXT DEFAULT ''"],
  ['detail_url_source', "TEXT DEFAULT ''"],
  ['detail_url_verified_at', "TEXT DEFAULT ''"],
  ['last_status_sync_at', "TEXT DEFAULT ''"],
  ['last_status_sync_status', "TEXT DEFAULT ''"],
  ['last_status_sync_error', "TEXT DEFAULT ''"],
  ['status_source', "TEXT DEFAULT ''"],
  ['status_changed_at', "TEXT DEFAULT ''"],
  ['status_touched_24h', 'INTEGER DEFAULT 0'],
  ['status_changed_count', 'INTEGER DEFAULT 0'],
  ['next_retry_at', "TEXT DEFAULT ''"]
]

export function cleanStatusAutomationText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

async function addColumnIfMissing(env, table, column, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
  const exists = (info.results || []).some(row => cleanStatusAutomationText(row.name) === column)
  if (exists) return
  await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
}

export async function ensureOrderStatusAutomationColumns(env) {
  for (const [column, definition] of ORDER_STATUS_AUTOMATION_COLUMNS) {
    await addColumnIfMissing(env, 'orders_v2', column, definition)
  }
}

export function extractShopeeSellerCenterDetailId(value = '') {
  const text = cleanStatusAutomationText(value)
  if (!text) return ''
  try {
    const url = new URL(text)
    const match = url.pathname.match(/\/portal\/sale\/order\/(\d+)/i)
    return cleanStatusAutomationText(match?.[1] || '')
  } catch {
    const match = text.match(/\/portal\/sale\/order\/(\d+)/i)
    return cleanStatusAutomationText(match?.[1] || '')
  }
}

export function normalizeSellerCenterDetailUrl(value = '') {
  const text = cleanStatusAutomationText(value)
  if (!text) return ''
  const detailId = extractShopeeSellerCenterDetailId(text)
  return detailId ? `https://banhang.shopee.vn/portal/sale/order/${detailId}` : ''
}

export function buildOrderStatusAutomationMeta(row = {}, now = new Date()) {
  const lastSync = cleanStatusAutomationText(row.last_status_sync_at)
  const lastMs = Date.parse(lastSync.includes('T') ? lastSync : lastSync.replace(' ', 'T'))
  const ageMinutes = Number.isFinite(lastMs) ? Math.max(0, Math.round((now.getTime() - lastMs) / 60000)) : null
  return {
    last_status_sync_at: lastSync,
    last_status_sync_status: cleanStatusAutomationText(row.last_status_sync_status),
    last_status_sync_error: cleanStatusAutomationText(row.last_status_sync_error),
    status_source: cleanStatusAutomationText(row.status_source || row.source_detail || row.source_mode),
    status_changed_at: cleanStatusAutomationText(row.status_changed_at),
    status_touched_24h: Number(row.status_touched_24h || 0) || 0,
    status_changed_count: Number(row.status_changed_count || 0) || 0,
    next_retry_at: cleanStatusAutomationText(row.next_retry_at),
    status_sync_age_minutes: ageMinutes,
    status_stale: ageMinutes === null ? true : ageMinutes > 60,
    seller_center_detail_id: cleanStatusAutomationText(row.seller_center_detail_id || row.seller_order_detail_id),
    seller_center_detail_url: cleanStatusAutomationText(row.seller_center_detail_url || row.source_url || row.raw_detail_url),
    detail_url_source: cleanStatusAutomationText(row.detail_url_source),
    detail_url_verified_at: cleanStatusAutomationText(row.detail_url_verified_at)
  }
}
