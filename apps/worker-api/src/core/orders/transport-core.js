import { listMarketplaceShopCapabilities } from '../marketplace/shop-capability-core.js'
import { nowBangkokText } from './time-core.js'

function cleanOrderTransportText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export const ORDER_SOURCE_MODES = {
  API_SYNC: 'api_sync',
  BROWSER_SYNC: 'browser_sync',
  IMPORT_FILE_SYNC: 'import_file_sync',
  MANUAL_REFERENCE: 'manual_reference'
}

function orderSourceModeLabel(mode) {
  if (mode === ORDER_SOURCE_MODES.API_SYNC) return 'API đồng bộ'
  if (mode === ORDER_SOURCE_MODES.BROWSER_SYNC) return 'Browser quét có kiểm soát'
  if (mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC) return 'Nhập file chuẩn hóa'
  return 'Tham chiếu tay'
}

function orderSourceModeGuide(mode) {
  // Ghi chú này dùng chung cho UI để phân biệt shop có API thật với shop không có API.
  if (mode === ORDER_SOURCE_MODES.API_SYNC) {
    return 'Đơn được kéo trực tiếp từ Open Platform API. Có thể dùng cho KPI tài chính và đối soát.'
  }
  if (mode === ORDER_SOURCE_MODES.BROWSER_SYNC) {
    return 'Đơn được quét qua Seller Center hoặc browser hỗ trợ. Dùng được cho vận hành, nhưng cần cảnh giác khi đối soát tài chính.'
  }
  if (mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC) {
    return 'Đơn được nhập từ file CSV/XLSX chuẩn hóa. Cần kiểm tra ngày, múi giờ và cột trạng thái trước khi dùng cho báo cáo.'
  }
  return 'Đơn chỉ mang tính tham chiếu tay, không nên dùng làm KPI tài chính quan trọng.'
}

function orderSourceModeRank(mode) {
  if (mode === ORDER_SOURCE_MODES.API_SYNC) return 400
  if (mode === ORDER_SOURCE_MODES.BROWSER_SYNC) return 300
  if (mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC) return 200
  return 100
}

export function normalizeOrderSourceMode(value, fallback = ORDER_SOURCE_MODES.MANUAL_REFERENCE) {
  const text = cleanOrderTransportText(value).toLowerCase()
  if (Object.values(ORDER_SOURCE_MODES).includes(text)) return text
  return fallback
}

function capabilityModeToOrderSource(capabilityMode) {
  const text = cleanOrderTransportText(capabilityMode).toLowerCase()
  if (text === 'api_active') return ORDER_SOURCE_MODES.API_SYNC
  if (text === 'browser_reference') return ORDER_SOURCE_MODES.BROWSER_SYNC
  if (text === 'import_reference') return ORDER_SOURCE_MODES.IMPORT_FILE_SYNC
  return ORDER_SOURCE_MODES.MANUAL_REFERENCE
}

async function addColumnIfMissing(env, table, column, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
  const exists = (info.results || []).some(row => cleanOrderTransportText(row.name).toLowerCase() === column.toLowerCase())
  if (!exists) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
}

export async function ensureOrderTransportColumns(env) {
  await addColumnIfMissing(env, 'orders_v2', 'source_mode', `TEXT DEFAULT '${ORDER_SOURCE_MODES.MANUAL_REFERENCE}'`)
  await addColumnIfMissing(env, 'orders_v2', 'source_detail', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'orders_v2', 'source_updated_at', `TEXT DEFAULT ''`)
}

function cleanupSourceGuide(mode) {
  if (mode === ORDER_SOURCE_MODES.API_SYNC) {
    return 'Tự động chuẩn hóa dữ liệu cũ vì shop hiện đã chạy API. Mục tiêu là không để đơn API còn lẫn nhãn manual hoặc browser cũ.'
  }
  if (mode === ORDER_SOURCE_MODES.BROWSER_SYNC) {
    return 'Tự động chuẩn hóa dữ liệu cũ về browser_sync có kiểm soát để không lẫn với dữ liệu API hoặc tham chiếu tay.'
  }
  if (mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC) {
    return 'Tự động chuẩn hóa dữ liệu cũ về import_file_sync để phân biệt rõ với API và browser.'
  }
  return 'Tự động chuẩn hóa dữ liệu cũ về manual_reference để tách khỏi các luồng đồng bộ chính thức.'
}

function collectCapabilityShopAliases(row = {}) {
  return [...new Set(
    [row.shop_name, row.user_name, row.api_shop_id]
      .map(value => cleanOrderTransportText(value))
      .filter(Boolean)
  )]
}

// Gặp dữ liệu bẩn thì dọn ngay trong core thay vì để Dashboard và Profit tự đoán.
// Shop đã chạy API sẽ được gom toàn bộ đơn cũ về api_sync để không còn lẫn manual/browser cũ.
export async function cleanupLegacyOrderSourceMeta(env, options = {}) {
  await ensureOrderTransportColumns(env)
  const platform = cleanOrderTransportText(options.platform).toLowerCase()
  const shop = cleanOrderTransportText(options.shop)
  const limit = Math.min(Math.max(Number(options.limit || 300) || 300, 1), 500)
  const capabilities = await listMarketplaceShopCapabilities(env, { platform, shop, limit })
  const cleanedAt = cleanOrderTransportText(options.source_updated_at) || nowBangkokText()
  const rows = []
  let normalizedOrders = 0

  for (const capability of capabilities) {
    const desiredMode = capabilityModeToOrderSource(capability.capability_mode)
    const platformKey = cleanOrderTransportText(capability.platform).toLowerCase()
    const aliases = collectCapabilityShopAliases(capability).map(value => value.toLowerCase())
    const shopName = collectCapabilityShopAliases(capability)[0] || ''
    if (!platformKey || !aliases.length) continue

    const aliasPlaceholders = aliases.map(() => '?').join(',')
    const baseBinds = [platformKey, ...aliases]
    const legacyCountSql = desiredMode === ORDER_SOURCE_MODES.API_SYNC
      ? `
        SELECT COUNT(*) AS total
        FROM orders_v2
        WHERE LOWER(COALESCE(platform, '')) = ?
          AND LOWER(TRIM(COALESCE(shop, ''))) IN (${aliasPlaceholders})
          AND (
            LOWER(COALESCE(source_mode, '')) != ?
            OR TRIM(COALESCE(source_detail, '')) = ''
            OR TRIM(COALESCE(source_updated_at, '')) = ''
          )
      `
      : `
        SELECT COUNT(*) AS total
        FROM orders_v2
        WHERE LOWER(COALESCE(platform, '')) = ?
          AND LOWER(TRIM(COALESCE(shop, ''))) IN (${aliasPlaceholders})
          AND (
            LOWER(COALESCE(source_mode, '')) IN ('', ?)
            OR (
              LOWER(COALESCE(source_mode, '')) = ?
              AND (
                TRIM(COALESCE(source_detail, '')) = ''
                OR TRIM(COALESCE(source_updated_at, '')) = ''
              )
            )
          )
      `
    const countBinds = desiredMode === ORDER_SOURCE_MODES.API_SYNC
      ? [...baseBinds, desiredMode]
      : [...baseBinds, ORDER_SOURCE_MODES.MANUAL_REFERENCE, desiredMode]
    const countRow = await env.DB.prepare(legacyCountSql).bind(...countBinds).first()
    const affected = Number(countRow?.total || 0) || 0
    if (!affected) continue

    const detail = cleanupSourceGuide(desiredMode)
    const updateSql = desiredMode === ORDER_SOURCE_MODES.API_SYNC
      ? `
        UPDATE orders_v2
        SET source_mode = ?,
            source_detail = ?,
            source_updated_at = ?
        WHERE LOWER(COALESCE(platform, '')) = ?
          AND LOWER(TRIM(COALESCE(shop, ''))) IN (${aliasPlaceholders})
          AND (
            LOWER(COALESCE(source_mode, '')) != ?
            OR TRIM(COALESCE(source_detail, '')) = ''
            OR TRIM(COALESCE(source_updated_at, '')) = ''
          )
      `
      : `
        UPDATE orders_v2
        SET source_mode = CASE
              WHEN LOWER(COALESCE(source_mode, '')) IN ('', ?) THEN ?
              ELSE source_mode
            END,
            source_detail = CASE
              WHEN TRIM(COALESCE(source_detail, '')) = '' OR LOWER(COALESCE(source_mode, '')) IN ('', ?, ?)
              THEN ?
              ELSE source_detail
            END,
            source_updated_at = CASE
              WHEN TRIM(COALESCE(source_updated_at, '')) = '' OR LOWER(COALESCE(source_mode, '')) IN ('', ?, ?)
              THEN ?
              ELSE source_updated_at
            END
        WHERE LOWER(COALESCE(platform, '')) = ?
          AND LOWER(TRIM(COALESCE(shop, ''))) IN (${aliasPlaceholders})
          AND (
            LOWER(COALESCE(source_mode, '')) IN ('', ?)
            OR (
              LOWER(COALESCE(source_mode, '')) = ?
              AND (
                TRIM(COALESCE(source_detail, '')) = ''
                OR TRIM(COALESCE(source_updated_at, '')) = ''
              )
            )
          )
      `
    const updateBinds = desiredMode === ORDER_SOURCE_MODES.API_SYNC
      ? [desiredMode, detail, cleanedAt, ...baseBinds, desiredMode]
      : [
          ORDER_SOURCE_MODES.MANUAL_REFERENCE,
          desiredMode,
          ORDER_SOURCE_MODES.MANUAL_REFERENCE,
          desiredMode,
          detail,
          ORDER_SOURCE_MODES.MANUAL_REFERENCE,
          desiredMode,
          cleanedAt,
          ...baseBinds,
          ORDER_SOURCE_MODES.MANUAL_REFERENCE,
          desiredMode
        ]
    await env.DB.prepare(updateSql).bind(...updateBinds).run()
    normalizedOrders += affected
    rows.push({
      platform: capability.platform,
      shop: shopName,
      capability_mode: capability.capability_mode,
      source_mode: desiredMode,
      normalized_orders: affected,
      source_detail: detail,
      source_updated_at: cleanedAt
    })
  }

  return {
    status: 'ok',
    normalized_orders: normalizedOrders,
    cleaned_shop_count: rows.length,
    cleaned_at: cleanedAt,
    shops: rows
  }
}

export async function detectOrderSourceModeForShop(env, platform, shopName, hintedMode = '') {
  const hinted = cleanOrderTransportText(hintedMode)
  if (hinted) return normalizeOrderSourceMode(hinted)

  const rows = await listMarketplaceShopCapabilities(env, {
    platform: cleanOrderTransportText(platform).toLowerCase(),
    shop: cleanOrderTransportText(shopName),
    limit: 20
  })
  const needle = cleanOrderTransportText(shopName).toLowerCase()
  const matched = rows.find(row => {
    const names = [row.shop_name, row.user_name, row.api_shop_id]
      .map(value => cleanOrderTransportText(value).toLowerCase())
      .filter(Boolean)
    return needle && names.includes(needle)
  }) || rows[0]

  if (!matched) return ORDER_SOURCE_MODES.BROWSER_SYNC
  return capabilityModeToOrderSource(matched.capability_mode)
}

export async function resolveOrderSourceMeta(env, payload = {}, orders = []) {
  const hintedMode = cleanOrderTransportText(payload.source_mode || payload.sourceMode)
  const hintedDetail = cleanOrderTransportText(payload.source_detail || payload.sourceDetail)
  const updatedAt = cleanOrderTransportText(payload.source_updated_at || payload.sourceUpdatedAt) || nowBangkokText()

  const firstOrder = orders[0] || {}
  const platform = cleanOrderTransportText(firstOrder.platform || payload.platform).toLowerCase()
  const shop = cleanOrderTransportText(firstOrder.shop || payload.shop)
  const sourceMode = await detectOrderSourceModeForShop(env, platform, shop, hintedMode)

  return {
    source_mode: sourceMode,
    source_detail: hintedDetail || orderSourceModeGuide(sourceMode),
    source_updated_at: updatedAt
  }
}

export async function buildOrderTransportSummary(env, options = {}) {
  await ensureOrderTransportColumns(env)
  const platform = cleanOrderTransportText(options.platform).toLowerCase()
  const capabilities = await listMarketplaceShopCapabilities(env, {
    platform,
    shop: options.shop,
    limit: options.limit || 200
  })

  const binds = []
  const conds = ['1=1']
  if (platform) {
    conds.push(`LOWER(COALESCE(platform, '')) = ?`)
    binds.push(platform)
  }
  if (cleanOrderTransportText(options.shop)) {
    conds.push(`LOWER(TRIM(COALESCE(shop, ''))) = ?`)
    binds.push(cleanOrderTransportText(options.shop).toLowerCase())
  }

  const orderRows = await env.DB.prepare(`
    SELECT LOWER(COALESCE(platform, '')) AS platform,
           TRIM(COALESCE(shop, '')) AS shop,
           COALESCE(source_mode, '${ORDER_SOURCE_MODES.MANUAL_REFERENCE}') AS source_mode,
           MAX(COALESCE(NULLIF(source_updated_at, ''), NULLIF(oms_updated_at, ''), order_date, created_at)) AS last_sync_at,
           COUNT(*) AS total_orders
    FROM orders_v2
    WHERE ${conds.join(' AND ')}
    GROUP BY LOWER(COALESCE(platform, '')), TRIM(COALESCE(shop, '')), COALESCE(source_mode, '${ORDER_SOURCE_MODES.MANUAL_REFERENCE}')
  `).bind(...binds).all()

  const orderMap = new Map()
  for (const row of orderRows.results || []) {
    const key = `${cleanOrderTransportText(row.platform)}|${cleanOrderTransportText(row.shop).toLowerCase()}`
    if (!orderMap.has(key)) orderMap.set(key, [])
    orderMap.get(key).push(row)
  }

  const summaryMap = new Map()

  for (const row of capabilities) {
    const platformKey = cleanOrderTransportText(row.platform).toLowerCase()
    const shopName = cleanOrderTransportText(row.shop_name || row.user_name || row.api_shop_id)
    if (!shopName) continue
    const key = `${platformKey}|${shopName.toLowerCase()}`
    summaryMap.set(key, {
      platform: row.platform,
      shop: shopName,
      capability_mode: row.capability_mode,
      api_connected: row.capability_mode === 'api_active',
      api_capability_label: row.capability_label || ''
    })
  }

  // Gộp thêm các shop đang có đơn trong D1 để không làm mất shop không API.
  for (const row of orderRows.results || []) {
    const platformKey = cleanOrderTransportText(row.platform).toLowerCase()
    const shopName = cleanOrderTransportText(row.shop)
    if (!shopName) continue
    const key = `${platformKey}|${shopName.toLowerCase()}`
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        platform: row.platform,
        shop: shopName,
        capability_mode: row.source_mode === ORDER_SOURCE_MODES.IMPORT_FILE_SYNC
          ? 'import_reference'
          : row.source_mode === ORDER_SOURCE_MODES.BROWSER_SYNC
            ? 'browser_reference'
            : 'manual_reference',
        api_connected: false,
        api_capability_label: ''
      })
    }
  }

  return [...summaryMap.values()].map(row => {
    const key = `${cleanOrderTransportText(row.platform)}|${cleanOrderTransportText(row.shop).toLowerCase()}`
    const items = orderMap.get(key) || []
    const modeSummary = new Map()
    for (const item of items) {
      const mode = normalizeOrderSourceMode(item.source_mode)
      const current = modeSummary.get(mode)
      if (!current) {
        modeSummary.set(mode, {
          source_mode: mode,
          last_sync_at: item.last_sync_at || '',
          total_orders: Number(item.total_orders || 0) || 0
        })
        continue
      }
      current.total_orders += Number(item.total_orders || 0) || 0
      if (String(item.last_sync_at || '').localeCompare(String(current.last_sync_at || '')) > 0) {
        current.last_sync_at = item.last_sync_at || ''
      }
    }

    const preferredMode = row.api_connected
      ? (modeSummary.has(ORDER_SOURCE_MODES.API_SYNC) ? ORDER_SOURCE_MODES.API_SYNC : capabilityModeToOrderSource(row.capability_mode))
      : [...modeSummary.values()]
          .sort((a, b) =>
            orderSourceModeRank(b.source_mode) - orderSourceModeRank(a.source_mode)
            || String(b.last_sync_at || '').localeCompare(String(a.last_sync_at || ''))
          )[0]?.source_mode || capabilityModeToOrderSource(row.capability_mode)
    const selected = modeSummary.get(preferredMode) || null
    const totalOrders = [...modeSummary.values()].reduce((sum, item) => sum + Number(item.total_orders || 0), 0)
    return {
      platform: row.platform,
      shop: row.shop,
      capability_mode: row.capability_mode,
      api_connected: !!row.api_connected,
      api_capability_label: row.api_capability_label,
      order_source_mode: preferredMode,
      order_source_mode_label: orderSourceModeLabel(preferredMode),
      order_source_guide: orderSourceModeGuide(preferredMode),
      last_sync_at: selected?.last_sync_at || '',
      total_orders: totalOrders,
      mode_breakdown: [...modeSummary.values()].sort((a, b) =>
        orderSourceModeRank(b.source_mode) - orderSourceModeRank(a.source_mode)
        || String(b.last_sync_at || '').localeCompare(String(a.last_sync_at || ''))
      )
    }
  }).sort((a, b) =>
    String(a.platform || '').localeCompare(String(b.platform || ''))
    || String(a.shop || '').localeCompare(String(b.shop || ''))
  )
}
