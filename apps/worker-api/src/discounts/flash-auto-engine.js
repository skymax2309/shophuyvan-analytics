import {
  addFlashDealItems,
  assertFlashDealLiveWriteAllowed,
  deleteFlashDeal,
  getFlashDealItems,
  getFlashDealItemCriteria,
  getFlashDealTimeSlots
} from '../routes/discounts/flash-deal-endpoints.js'
import { ensureFlashAutoTables, getFlashAutoSetting } from '../routes/discounts/flash-auto-settings.js'

const SHOPEE_FLASH_ITEM_LIMIT_SAFE = 20

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function numberValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function intValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}

function boolValue(value) {
  return Number(value || 0) === 1 || value === true || String(value).toLowerCase() === 'true'
}

async function tableExists(db, table) {
  const safe = cleanText(table)
  if (!/^[a-zA-Z0-9_]+$/.test(safe)) return false
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(safe).first().catch(() => null)
  return Boolean(row)
}

async function tableColumns(db, table) {
  const safe = cleanText(table)
  if (!/^[a-zA-Z0-9_]+$/.test(safe)) return new Set()
  const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all().catch(() => ({ results: [] }))
  return new Set((results || []).map(row => row.name))
}

async function loadShopAuth(db, shopId) {
  const shop = cleanText(shopId)
  if (!shop) return null
  if (await tableExists(db, 'shop_core')) {
    const row = await db.prepare(`
      SELECT access_token,
             COALESCE(platform_shop_id, api_shop_id, shop_id, '') AS platform_shop_id,
             COALESCE(shop_id, shop_name, user_name, '') AS shop_id,
             platform
      FROM shop_core
      WHERE shop_id = ? OR shop_name = ? OR user_name = ? OR platform_shop_id = ?
      LIMIT 1
    `).bind(shop, shop, shop, shop).first().catch(() => null)
    if (row) return row
  }
  const row = await db.prepare(`
    SELECT access_token,
           api_shop_id AS platform_shop_id,
           COALESCE(shop_name, user_name, api_shop_id, '') AS shop_id,
           platform,
           id,
           shop_name,
           user_name,
           api_shop_id,
           api_partner_id,
           api_partner_key,
           refresh_token
    FROM shops
    WHERE platform = 'shopee'
      AND (shop_name = ? OR user_name = ? OR api_shop_id = ?)
    ORDER BY CASE WHEN COALESCE(access_token, '') != '' THEN 0 ELSE 1 END
    LIMIT 1
  `).bind(shop, shop, shop).first().catch(() => null)
  return row || null
}

function normalizeSlots(result = {}) {
  const response = result.response || result.raw_response?.response || result.raw_response || {}
  const list = Array.isArray(response)
    ? response
    : (response.time_slot_list || response.timeslot_list || response.slot_list || response.slots || [])
  const normalized = (Array.isArray(list) ? list : []).map(row => ({
    ...row,
    timeslot_id: cleanText(row.timeslot_id || row.time_slot_id || row.slot_id || row.id),
    start_time: numberValue(row.start_time || row.startTime || row.start),
    end_time: numberValue(row.end_time || row.endTime || row.end)
  })).filter(row => row.timeslot_id)
  if (normalized.length) return normalized
  const singleTimeslot = cleanText(response.timeslot_id || response.time_slot_id || response.slot_id || response.id)
  if (!singleTimeslot) return []
  return [{
    timeslot_id: singleTimeslot,
    start_time: numberValue(response.start_time || response.startTime || response.start),
    end_time: numberValue(response.end_time || response.endTime || response.end)
  }]
}

function chooseTimeslot(setting = {}, slots = []) {
  if (cleanText(setting.timeslot_mode) === 'manual' && cleanText(setting.timeslot_id)) {
    return slots.find(slot => String(slot.timeslot_id) === String(setting.timeslot_id)) || { timeslot_id: setting.timeslot_id }
  }
  const now = Math.floor(Date.now() / 1000)
  return slots
    .filter(slot => !slot.start_time || slot.start_time > now)
    .sort((a, b) => (a.start_time || Number.MAX_SAFE_INTEGER) - (b.start_time || Number.MAX_SAFE_INTEGER))[0]
}

function normalizeItems(result = {}) {
  const response = result.response || result.raw_response?.response || result.raw_response || {}
  const list = Array.isArray(response)
    ? response
    : (response.item_list || response.items || response.flash_deal_item_list || [])
  return Array.isArray(list) ? list : []
}

function statusUpcomingOrOngoing(row = {}) {
  const text = cleanText(row.status || row.item_status || row.flash_status).toLowerCase()
  if (['upcoming', 'ongoing', 'enable', 'enabled', 'normal'].includes(text)) return true
  const statusNumber = Number(row.status ?? row.item_status ?? row.flash_status)
  return Number.isFinite(statusNumber) && statusNumber === 1
}

async function candidateRowsFromProductVariations(db, setting = {}) {
  const columns = await tableColumns(db, 'product_variations')
  if (!columns.size) return []
  const itemCol = columns.has('platform_item_id') ? 'platform_item_id' : (columns.has('item_id') ? 'item_id' : '')
  if (!itemCol) return []
  const priceExpr = columns.has('price') ? 'v.price' : (columns.has('original_price') ? 'v.original_price' : '0')
  const stockExpr = columns.has('stock') ? 'v.stock' : (columns.has('normal_stock') ? 'v.normal_stock' : '0')
  const salesExpr = columns.has('sales_30d') ? 'v.sales_30d' : (columns.has('sale_count') ? 'v.sale_count' : '0')
  const statusExpr = columns.has('status') ? 'v.status' : (columns.has('item_status') ? 'v.item_status' : "''")
  const modelExpr = columns.has('model_id') ? 'v.model_id' : "''"
  const skuExpr = columns.has('platform_sku') ? 'v.platform_sku' : (columns.has('internal_sku') ? 'v.internal_sku' : "''")
  const nameExpr = columns.has('product_name') ? 'v.product_name' : (columns.has('item_name') ? 'v.item_name' : "''")
  const activeClause = boolValue(setting.active_only) && statusExpr !== "''"
    ? `AND LOWER(COALESCE(${statusExpr}, 'active')) IN ('active','normal','enabled','ongoing')`
    : ''
  const { results } = await db.prepare(`
    SELECT v.${itemCol} AS item_id,
           ${modelExpr} AS model_id,
           ${skuExpr} AS sku,
           ${nameExpr} AS product_name,
           COALESCE(${priceExpr}, 0) AS original_price,
           COALESCE(${stockExpr}, 0) AS stock,
           COALESCE(${salesExpr}, 0) AS sales_30d,
           promo.promotion_price AS promotion_price
    FROM product_variations v
    LEFT JOIN marketplace_discount_items promo
      ON promo.platform = v.platform
     AND promo.shop = v.shop
     AND promo.item_id = v.${itemCol}
     AND LOWER(COALESCE(promo.status, '')) IN ('active','ongoing','enabled')
    WHERE v.platform = ?
      AND v.shop = ?
      AND COALESCE(${stockExpr}, 0) >= ?
      ${activeClause}
    ORDER BY COALESCE(${stockExpr}, 0) DESC,
             CASE WHEN promo.promotion_price IS NOT NULL AND promo.promotion_price > 0 THEN 1 ELSE 0 END DESC,
             COALESCE(${salesExpr}, 0) DESC
    LIMIT ?
  `).bind(cleanText(setting.platform || 'shopee'), cleanText(setting.shop_id), intValue(setting.min_stock, 5), intValue(setting.max_items, 50)).all()
  return results || []
}

async function candidateRowsFromCatalog(db, setting = {}) {
  if (!(await tableExists(db, 'marketplace_product_catalog_snapshots'))) return []
  const activeClause = boolValue(setting.active_only)
    ? "AND LOWER(COALESCE(c.item_status, 'normal')) IN ('normal','active','enabled')"
    : ''
  const { results } = await db.prepare(`
    SELECT c.platform_item_id AS item_id,
           '' AS model_id,
           c.item_sku AS sku,
           c.product_name AS product_name,
           COALESCE(c.price_min, 0) AS original_price,
           COALESCE(c.total_marketplace_stock, 0) AS stock,
           COALESCE(c.sale_count, 0) AS sales_30d,
           CASE WHEN COALESCE(promo.promotion_price, 0) > 0 THEN promo.promotion_price ELSE c.discount_price_min END AS promotion_price
    FROM marketplace_product_catalog_snapshots c
    LEFT JOIN marketplace_discount_items promo
      ON promo.platform = c.platform
     AND promo.shop = c.shop
     AND promo.item_id = c.platform_item_id
     AND LOWER(COALESCE(promo.status, '')) IN ('active','ongoing','enabled')
    WHERE c.platform = ?
      AND c.shop = ?
      AND COALESCE(c.total_marketplace_stock, 0) >= ?
      ${activeClause}
    ORDER BY COALESCE(c.total_marketplace_stock, 0) DESC,
             CASE WHEN COALESCE(promo.promotion_price, c.discount_price_min, 0) > 0 THEN 1 ELSE 0 END DESC,
             COALESCE(c.sale_count, 0) DESC
    LIMIT ?
  `).bind(cleanText(setting.platform || 'shopee'), cleanText(setting.shop_id), intValue(setting.min_stock, 5), intValue(setting.max_items, 50)).all()
  return results || []
}

async function loadCandidateProducts(db, setting = {}) {
  let rows = []
  if (await tableExists(db, 'product_variations')) {
    rows = await candidateRowsFromProductVariations(db, setting)
  }
  if (!rows.length) rows = await candidateRowsFromCatalog(db, setting)
  return rows
}

function buildFlashItems(rows = [], setting = {}) {
  const fallbackPct = numberValue(setting.fallback_discount_percent, 10) / 100
  const minPct = numberValue(setting.min_discount_percent, 5) / 100
  let promotionCount = 0
  let fallbackCount = 0
  const items = []
  for (const row of rows) {
    const original = numberValue(row.original_price)
    if (!(original > 0)) continue
    const promo = numberValue(row.promotion_price)
    const flashPrice = promo > 0 ? promo : Math.round(original * (1 - fallbackPct))
    const discount = (original - flashPrice) / original
    if (!(flashPrice > 0) || discount < minPct) continue
    if (promo > 0) promotionCount += 1
    else fallbackCount += 1
    items.push({
      item_id: cleanText(row.item_id),
      model_id: cleanText(row.model_id),
      sku: cleanText(row.sku),
      product_name: cleanText(row.product_name),
      stock: Math.max(1, Math.floor(numberValue(row.stock))),
      original_price: original,
      flash_sale_price: flashPrice,
      price_source: promo > 0 ? 'promotion_core' : 'fallback_discount'
    })
  }
  const safeMaxItems = Math.max(1, Math.min(intValue(setting.max_items, 50), SHOPEE_FLASH_ITEM_LIMIT_SAFE))
  return {
    items: items.slice(0, safeMaxItems),
    price_source: promotionCount && fallbackCount ? 'mixed' : promotionCount ? 'promotion_core' : 'fallback_discount'
  }
}

function normalizeCriteriaRows(result = {}) {
  const response = result.response || result.raw_response?.response || result.raw_response || {}
  const rows = response.criteria || response.item_criteria || response.criteria_list || []
  return Array.isArray(rows) ? rows : []
}

function ratioFromPercent(value, fallback = 0) {
  const raw = numberValue(value, fallback)
  if (!Number.isFinite(raw) || raw < 0) return fallback
  if (raw > 1) return raw / 100
  return raw
}

function deriveCriteriaLimit(criteriaRows = []) {
  const rows = Array.isArray(criteriaRows) ? criteriaRows : []
  const minPromoStockList = rows.map((row) => intValue(row.min_promo_stock, -1)).filter((v) => v > 0)
  const maxPromoStockList = rows.map((row) => intValue(row.max_promo_stock, -1)).filter((v) => v > 0)
  const minDiscountList = rows.map((row) => ratioFromPercent(row.min_discount, -1)).filter((v) => v >= 0)
  const maxDiscountList = rows.map((row) => ratioFromPercent(row.max_discount, -1)).filter((v) => v >= 0)
  return {
    min_promo_stock: minPromoStockList.length ? Math.max(...minPromoStockList) : -1,
    max_promo_stock: maxPromoStockList.length ? Math.min(...maxPromoStockList) : -1,
    min_discount: minDiscountList.length ? Math.max(...minDiscountList) : -1,
    max_discount: maxDiscountList.length ? Math.min(...maxDiscountList) : -1
  }
}

function applyCriteriaToItems(items = [], criteriaLimit = {}, setting = {}) {
  const result = []
  let adjusted = 0
  let skipped = 0
  const defaultStockCap = Math.max(1, intValue(setting.min_stock, 5))
  const minPromoStock = intValue(criteriaLimit.min_promo_stock, -1)
  const maxPromoStock = intValue(criteriaLimit.max_promo_stock, -1)
  const minDiscount = numberValue(criteriaLimit.min_discount, -1)
  const maxDiscount = numberValue(criteriaLimit.max_discount, -1)
  for (const item of (Array.isArray(items) ? items : [])) {
    const original = numberValue(item.original_price)
    if (!(original > 0)) {
      skipped += 1
      continue
    }
    const next = { ...item }
    const safeStockCap = maxPromoStock > 0 ? Math.min(maxPromoStock, defaultStockCap) : defaultStockCap
    const nextStock = Math.max(1, Math.min(intValue(next.stock, 1), safeStockCap))
    if (nextStock !== intValue(next.stock, 1)) adjusted += 1
    next.stock = nextStock

    let discount = (original - numberValue(next.flash_sale_price)) / original
    if (minDiscount > 0 && discount < minDiscount) {
      const normalizedPrice = Math.max(1, Math.floor(original * (1 - minDiscount)))
      if (normalizedPrice !== intValue(next.flash_sale_price)) adjusted += 1
      next.flash_sale_price = normalizedPrice
      discount = (original - numberValue(next.flash_sale_price)) / original
    }
    if (maxDiscount > 0 && discount > maxDiscount) {
      const normalizedPrice = Math.max(1, Math.ceil(original * (1 - maxDiscount)))
      if (normalizedPrice !== intValue(next.flash_sale_price)) adjusted += 1
      next.flash_sale_price = normalizedPrice
      discount = (original - numberValue(next.flash_sale_price)) / original
    }

    if (minPromoStock > 0 && next.stock < minPromoStock) {
      skipped += 1
      continue
    }
    if (!(next.flash_sale_price > 0) || !(discount > 0)) {
      skipped += 1
      continue
    }
    result.push(next)
  }
  return {
    items: result,
    adjusted,
    skipped
  }
}

async function writeLog(db, result = {}) {
  await ensureFlashAutoTables({ DB: db })
  await db.prepare(`
    INSERT INTO flash_auto_logs
      (shop_id, timeslot_id, items_submitted, items_confirmed, price_source,
       live_write_sent, verified, message, ran_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
  `).bind(
    cleanText(result.shop_id),
    result.timeslot_id ? intValue(result.timeslot_id) : null,
    intValue(result.items_submitted),
    intValue(result.items_confirmed),
    cleanText(result.price_source),
    result.live_write_sent ? 1 : 0,
    result.verified ? 1 : 0,
    cleanText(result.message)
  ).run()
}

async function finish(db, result = {}) {
  const finalResult = {
    live_write_sent: Boolean(result.live_write_sent),
    verified: Boolean(result.verified),
    timeslot_id: result.timeslot_id || null,
    items_submitted: intValue(result.items_submitted),
    items_confirmed: intValue(result.items_confirmed),
    price_source: cleanText(result.price_source),
    message: cleanText(result.message || 'Đã ghi nhận lượt chạy Flash Sale.'),
    skipped: Boolean(result.skipped)
  }
  await writeLog(db, { ...result, ...finalResult })
  return finalResult
}

function engineErrorMessage(error) {
  const mapped = error?.shopee || {}
  const text = cleanText(mapped.message || error?.message || 'Shopee chua xac nhan thao tac Flash Sale.')
  if (mapped.category === 'permission_error') return 'api_permission_missing: Shop chua duoc cap quyen Flash Sale tren san'
  if (mapped.category === 'auth_expired') return 'token_scope_missing: Token da het han hoac thieu quyen Flash Sale'
  if (mapped.code === 'flash_sale_item_limit_reached') return text
  if (mapped.code === 'all_items_already_exist') return 'Tat ca SKU/model da ton tai trong Flash Sale nay.'
  if (mapped.code === 'no_items_added') {
    const failedRows = Array.isArray(mapped.failed_items) ? mapped.failed_items : []
    if (!failedRows.length) return text
    const grouped = new Map()
    for (const row of failedRows) {
      const code = cleanText(row.error || row.err_code || row.code || 'unknown')
      const reason = cleanText(row.message || row.err_msg || row.fail_reason || '')
      const key = `${code}|${reason}`
      grouped.set(key, (grouped.get(key) || 0) + 1)
    }
    const summary = Array.from(grouped.entries())
      .slice(0, 3)
      .map(([key, count]) => {
        const [code, reason] = key.split('|')
        if (reason) return `${reason} (${code}) x${count}`
        return `${code} x${count}`
      })
      .join('; ')
    return `Shopee tu choi toan bo SKU/model: ${summary}`
  }
  if (isMaxItemLimitError(error)) {
    const safeLimit = Math.max(1, intValue(mapped.safe_limit_units, SHOPEE_FLASH_ITEM_LIMIT_SAFE))
    return `Shopee da dat gioi han so SKU/model cho Flash Sale nay (safe_limit=${safeLimit}).`
  }
  return text
}

function isMaxItemLimitError(error) {
  const mapped = cleanText(error?.shopee?.message || '')
  const text = cleanText(error?.message || '')
  const haystack = `${mapped} ${text}`.toLowerCase()
  return haystack.includes('max number of item limit') || haystack.includes('item limit per promotion')
}

function unitKey(row = {}) {
  const itemId = cleanText(row?.item_id || row?.platform_item_id)
  const modelId = cleanText(row?.model_id)
  if (!itemId) return ''
  return `${itemId}#${modelId}`
}

function batchSignature(items = []) {
  return (Array.isArray(items) ? items : []).map((row) => unitKey(row)).filter(Boolean).join('|')
}

function buildProbeBatches(items = [], size = 0) {
  const rows = Array.isArray(items) ? items : []
  const takeSize = Math.max(0, Math.min(intValue(size, 0), rows.length))
  if (!rows.length || takeSize <= 0) return []
  const maxStart = Math.max(0, rows.length - takeSize)
  const starts = [0]
  if (maxStart > 0) {
    starts.push(maxStart)
    starts.push(Math.floor(maxStart / 2))
    starts.push(Math.floor(maxStart / 3))
    starts.push(Math.floor((maxStart * 2) / 3))
  }
  const uniqueStarts = Array.from(new Set(starts.filter((start) => start >= 0 && start <= maxStart)))
  const result = []
  const seen = new Set()
  for (const start of uniqueStarts) {
    const candidate = rows.slice(start, start + takeSize)
    const signature = batchSignature(candidate)
    if (!signature || seen.has(signature)) continue
    seen.add(signature)
    result.push(candidate)
  }
  return result
}

export async function runFlashAuto(shopId, db, env, options = {}) {
  const forceSubmit = boolValue(options.force_submit ?? options.forceSubmit)
  await ensureFlashAutoTables({ DB: db })
  const setting = await getFlashAutoSetting({ DB: db }, shopId)
  if (!setting) return finish(db, { shop_id: shopId, skipped: true, message: 'Chưa có cài đặt Flash Sale cho shop này.' })
  if (!boolValue(setting.enabled)) return finish(db, { shop_id: shopId, skipped: true, message: 'Flash Sale tự động đang tắt.' })
  if (cleanText(setting.platform) !== 'shopee') return finish(db, { shop_id: shopId, skipped: true, message: 'Shop này chưa hỗ trợ Flash Sale tự động qua API.' })

  const shop = await loadShopAuth(db, setting.shop_id)
  if (!shop?.access_token || !shop?.platform_shop_id) {
    return finish(db, { shop_id: setting.shop_id, live_write_sent: false, message: 'Shop chưa kết nối API' })
  }

  let selectedSlot
  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const slotResult = await getFlashDealTimeSlots(env, shop.platform_shop_id, shop.access_token, {
      start_time: nowSec + 60,
      end_time: nowSec + (30 * 24 * 60 * 60)
    }, shop)
    const slots = normalizeSlots(slotResult)
    selectedSlot = chooseTimeslot(setting, slots)
  } catch (error) {
    return finish(db, { shop_id: setting.shop_id, live_write_sent: false, message: engineErrorMessage(error) })
  }
  if (!selectedSlot?.timeslot_id) {
    return finish(db, { shop_id: setting.shop_id, live_write_sent: false, message: 'Không có khung giờ Flash' })
  }

  const rows = await loadCandidateProducts(db, setting)
  const { items: builtItems, price_source: priceSource } = buildFlashItems(rows, setting)
  if (!builtItems.length) {
    return finish(db, {
      shop_id: setting.shop_id,
      timeslot_id: selectedSlot.timeslot_id,
      live_write_sent: false,
      price_source: priceSource,
      message: 'Không có SP đủ điều kiện'
    })
  }

  let items = builtItems
  let criteriaAdjusted = 0
  let criteriaSkipped = 0
  let criteriaApplied = false
  try {
    const criteriaResult = await getFlashDealItemCriteria(env, shop.platform_shop_id, shop.access_token, {}, shop)
    const criteriaRows = normalizeCriteriaRows(criteriaResult)
    if (criteriaRows.length) {
      const criteriaLimit = deriveCriteriaLimit(criteriaRows)
      const criteriaOutput = applyCriteriaToItems(items, criteriaLimit, setting)
      items = criteriaOutput.items
      criteriaAdjusted = criteriaOutput.adjusted
      criteriaSkipped = criteriaOutput.skipped
      criteriaApplied = true
    }
  } catch {
    // Keep built candidates when criteria endpoint is temporarily unavailable.
  }
  if (!items.length) {
    return finish(db, {
      shop_id: setting.shop_id,
      timeslot_id: selectedSlot.timeslot_id,
      live_write_sent: false,
      price_source: priceSource,
      message: 'KhÃ´ng cÃ²n SKU/model náº±m trong ngÆ°á»¡ng tiÃªu chÃ­ Flash Sale cá»§a Shopee.'
    })
  }

  if (!boolValue(setting.auto_submit) && !forceSubmit) {
    return finish(db, {
      shop_id: setting.shop_id,
      timeslot_id: selectedSlot.timeslot_id,
      items_submitted: items.length,
      price_source: priceSource,
      live_write_sent: false,
      message: 'Đã chuẩn bị danh sách, chưa tự submit lên sàn.'
    })
  }

  const guard = assertFlashDealLiveWriteAllowed(env)
  if (guard) {
    return finish(db, {
      shop_id: setting.shop_id,
      timeslot_id: selectedSlot.timeslot_id,
      items_submitted: items.length,
      price_source: priceSource,
      live_write_sent: false,
      message: guard.message || 'Hệ thống đang chặn live-write Flash Sale.'
    })
  }

  try {
    let submitItems = items
    let addResult
    let limitedByPlatform = false
    let partialSubmitMode = false
    try {
      addResult = await addFlashDealItems(env, shop.platform_shop_id, shop.access_token, selectedSlot.timeslot_id, submitItems, shop)
    } catch (firstError) {
      const maxLimitError = isMaxItemLimitError(firstError)
      const safeLimit = Math.max(1, intValue(firstError?.shopee?.safe_limit_units, SHOPEE_FLASH_ITEM_LIMIT_SAFE))
      const probeSizes = Array.from(new Set([safeLimit, 15, 10, 5, 3, 2, 1])).filter((size) => size < submitItems.length)
      let recovered = false
      for (const size of probeSizes) {
        const probeBatches = buildProbeBatches(submitItems, size)
        for (const candidate of probeBatches) {
          try {
            addResult = await addFlashDealItems(env, shop.platform_shop_id, shop.access_token, selectedSlot.timeslot_id, candidate, shop)
            submitItems = candidate
            partialSubmitMode = true
            if (maxLimitError) limitedByPlatform = true
            recovered = true
            break
          } catch {
            // Continue probing with alternative batches.
          }
        }
        if (recovered) break
      }
      if (!recovered) {
        const singleProbeLimit = submitItems.length
        for (let idx = 0; idx < singleProbeLimit; idx += 1) {
          const candidate = [submitItems[idx]]
          try {
            addResult = await addFlashDealItems(env, shop.platform_shop_id, shop.access_token, selectedSlot.timeslot_id, candidate, shop)
            submitItems = candidate
            partialSubmitMode = true
            if (maxLimitError) limitedByPlatform = true
            recovered = true
            break
          } catch {
            // Continue probing next single SKU.
          }
        }
      }
      if (!recovered) throw firstError
    }
    const flashSaleId = cleanText(addResult?.flash_sale_id || addResult?.response?.flash_sale_id || addResult?.raw_response?.response?.flash_sale_id)
    const acceptedUnits = intValue(addResult?.accepted_units, submitItems.length)
    const failedUnits = intValue(addResult?.failed_units, 0)
    let confirmedItems = []
    let verified = false
    let readbackFailed = false
    if (flashSaleId) {
      try {
        const readback = await getFlashDealItems(env, shop.platform_shop_id, shop.access_token, flashSaleId, shop)
        confirmedItems = normalizeItems(readback)
        verified = confirmedItems.some(statusUpcomingOrOngoing) || confirmedItems.length > 0
      } catch {
        readbackFailed = true
      }
    }
    const baseMessage = verified ? 'San da xac nhan Flash Sale.' : 'San da nhan request nhung chua xac nhan Flash Sale.'
    const suffix = []
    if (failedUnits > 0) suffix.push(`Co ${failedUnits} SKU/model bi san tu choi khi them Flash Sale.`)
    if (limitedByPlatform) suffix.push('Da tu gioi han 20 SKU theo gioi han so luong item cua san.')
    if (partialSubmitMode) suffix.push('Da bo qua SKU khong dat dieu kien de tranh fail toan bo dot chay.')
    if (criteriaApplied && criteriaAdjusted > 0) suffix.push(`Da canh stock/gia theo tieu chi san cho ${criteriaAdjusted} SKU/model.`)
    if (criteriaApplied && criteriaSkipped > 0) suffix.push(`Da bo qua ${criteriaSkipped} SKU/model khong dat nguong criteria cua san.`)
    if (readbackFailed) suffix.push('Da gui len san nhung readback tam thoi chua lay duoc.')
    const message = suffix.length ? (baseMessage + ' ' + suffix.join(' ')) : baseMessage
    return finish(db, {
      shop_id: setting.shop_id,
      timeslot_id: selectedSlot.timeslot_id,
      items_submitted: acceptedUnits,
      items_confirmed: confirmedItems.length,
      price_source: priceSource,
      live_write_sent: true,
      verified,
      message
    })
  } catch (error) {
    let message = engineErrorMessage(error)
    const mapped = error?.shopee || {}
    if (boolValue(mapped.created_new_flash_sale) && cleanText(mapped.flash_sale_id)) {
      try {
        await deleteFlashDeal(env, shop.platform_shop_id, shop.access_token, mapped.flash_sale_id, shop)
        message = `${message}. Da tu dong xoa chuong trinh Flash Sale moi tao bi rong de tranh tao rac tren san.`
      } catch (cleanupError) {
        message = `${message}. Canh bao: khong xoa duoc chuong trinh moi tao (${engineErrorMessage(cleanupError)}).`
      }
    }
    return finish(db, {
      shop_id: setting.shop_id,
      timeslot_id: selectedSlot.timeslot_id,
      items_submitted: items.length,
      price_source: priceSource,
      live_write_sent: false,
      message
    })
  }
}
