import { buildSkuMappingProfile } from './sku-identity-core.js'

function compactText(value) {
  return String(value ?? '').trim()
}

function numberValue(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function parseJsonRow(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function hasMeaningfulWeight(value) {
  const text = compactText(value)
  if (!text) return false
  const number = Number(String(text).replace(/[^\d.]/g, ''))
  return Number.isFinite(number) && number > 0
}

function hasMeaningfulAttributes(value) {
  if (Array.isArray(value)) return value.filter(Boolean).length > 0
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  return false
}

function normalizeSuggestedCategories(value) {
  const rows = parseJsonRow(value, [])
  if (!Array.isArray(rows)) return []
  return rows.map(row => ({
    category_id: compactText(row?.category_id),
    category_name: compactText(row?.category_name || row?.display_name || row?.name)
  })).filter(row => row.category_id || row.category_name)
}

function normalizeViolationSummary(value) {
  const rows = parseJsonRow(value, [])
  if (!Array.isArray(rows)) return []
  return rows.map(row => ({
    source_scope: compactText(row?.source_scope || row?.scope || row?.source || 'status'),
    violation_type: compactText(row?.violation_type),
    violation_reason: compactText(row?.violation_reason),
    suggestion: compactText(row?.suggestion)
  })).filter(row => row.violation_type || row.violation_reason || row.suggestion)
}

function normalizePromotionSummary(value) {
  const rows = parseJsonRow(value, [])
  if (!Array.isArray(rows)) return []
  return rows.map(row => ({
    promotion_type: compactText(row?.promotion_type),
    promotion_id: compactText(row?.promotion_id),
    promotion_staging: compactText(row?.promotion_staging),
    model_id: compactText(row?.model_id)
  })).filter(row => row.promotion_type || row.promotion_id || row.model_id)
}

function isWrongCategoryWarning(violationRows = [], suggestedCategories = []) {
  if (suggestedCategories.length) return true
  return violationRows.some(row => {
    const reason = compactText(row.violation_reason).toLowerCase()
    const suggestion = compactText(row.suggestion).toLowerCase()
    return reason.includes('wrong category')
      || reason.includes('ngành')
      || suggestion.includes('suggested_category')
      || suggestion.includes('category')
  })
}

/**
 * Audit hiện tại ưu tiên đọc dữ liệu đã có trong D1 để giảm request:
 * ảnh, cân nặng, thuộc tính, ngành hàng, khuyến mãi và cảnh báo vi phạm.
 */
export function buildCatalogAudit(knowledgeRows = [], snapshotMap = new Map(), limit = 12) {
  const rows = []
  const counters = {
    missing_image_listings: 0,
    missing_weight_listings: 0,
    missing_attribute_listings: 0,
    missing_category_listings: 0,
    risky_status_listings: 0,
    promotion_affected_listings: 0,
    violation_warning_listings: 0,
    wrong_category_listings: 0,
    deboost_listings: 0
  }

  for (const row of knowledgeRows || []) {
    const warnings = []
    const images = parseJsonRow(row.images, [])
    const attributes = parseJsonRow(row.attributes, [])
    const promotionSummary = normalizePromotionSummary(row.promotion_summary)
    const violationSummary = normalizeViolationSummary(row.violation_summary)
    const suggestedCategories = normalizeSuggestedCategories(row.suggested_categories)
    const snapshot = snapshotMap.get(`${compactText(row.platform)}|${compactText(row.shop)}|${compactText(row.platform_item_id)}`) || {}
    const itemStatus = compactText(snapshot.item_status || '')
    const deboost = Number(row.deboost || 0) === 1

    if (!Array.isArray(images) || !images.filter(Boolean).length) {
      counters.missing_image_listings += 1
      warnings.push('Thiếu ảnh bài đăng')
    }
    if (!hasMeaningfulWeight(row.weight)) {
      counters.missing_weight_listings += 1
      warnings.push('Thiếu cân nặng')
    }
    if (!hasMeaningfulAttributes(attributes)) {
      counters.missing_attribute_listings += 1
      warnings.push('Thiếu thuộc tính')
    }
    if (!compactText(row.category_id)) {
      counters.missing_category_listings += 1
      warnings.push('Thiếu ngành hàng')
    }
    if (promotionSummary.length) {
      counters.promotion_affected_listings += 1
      warnings.push(`Đang có ${promotionSummary.length} khuyến mãi tác động lên giá sàn`)
    }
    if (violationSummary.length) {
      counters.violation_warning_listings += 1
      warnings.push(`Shopee đang cảnh báo ${violationSummary.length} lỗi vi phạm`)
    }
    if (deboost) {
      counters.deboost_listings += 1
      warnings.push('Bài đăng đang bị giảm hiển thị trên sàn')
    }
    if (isWrongCategoryWarning(violationSummary, suggestedCategories)) {
      counters.wrong_category_listings += 1
      const suggestedLabel = suggestedCategories
        .map(item => item.category_name || item.category_id)
        .filter(Boolean)
        .slice(0, 2)
        .join(', ')
      warnings.push(suggestedLabel
        ? `Shopee gợi ý đổi ngành hàng: ${suggestedLabel}`
        : 'Shopee nghi bài đăng đang sai ngành hàng')
    }
    if (itemStatus && itemStatus !== 'NORMAL') {
      counters.risky_status_listings += 1
      warnings.push(`Trạng thái bài đăng: ${itemStatus}`)
    }
    if (!warnings.length) continue

    rows.push({
      platform: compactText(row.platform),
      shop: compactText(row.shop),
      platform_item_id: compactText(row.platform_item_id),
      product_name: compactText(row.product_name),
      item_sku: compactText(row.item_sku),
      item_status: itemStatus || 'NORMAL',
      warnings
    })
  }

  rows.sort((left, right) => right.warnings.length - left.warnings.length || left.product_name.localeCompare(right.product_name))
  return {
    summary: {
      audited_listings: knowledgeRows.length,
      ...counters
    },
    rows: rows.slice(0, limit)
  }
}

/**
 * Nhóm cảnh báo SKU tập trung vào các lỗi dễ làm sai tồn:
 * chưa map, SKU sàn rác và một SKU nội bộ bị gắn nhiều SKU sàn trong cùng shop.
 */
export async function listSkuWarnings(env, limit = 12) {
  const [variationRows, duplicateRows] = await Promise.all([
    env.DB.prepare(`
      SELECT platform, shop, platform_item_id, platform_sku, internal_sku, mapped_items, map_status
      FROM product_variations
    `).all(),
    env.DB.prepare(`
      SELECT platform, shop, internal_sku, COUNT(*) AS total
      FROM product_variations
      WHERE COALESCE(internal_sku, '') != ''
      GROUP BY platform, shop, internal_sku
      HAVING COUNT(*) > 1
      ORDER BY total DESC, internal_sku
      LIMIT ?
    `).bind(Math.max(limit, 1)).all()
  ])

  let unmappedCount = 0
  let garbageCount = 0
  let complexMappingCount = 0
  const garbageRows = []

  for (const row of variationRows.results || []) {
    const mapStatus = compactText(row.map_status)
    const platformSku = compactText(row.platform_sku)
    const mappingProfile = buildSkuMappingProfile(row)
    if (mapStatus !== 'MAPPED') unmappedCount += 1
    if (!platformSku || ['undefined', 'null', '-'].includes(platformSku.toLowerCase())) {
      garbageCount += 1
      if (garbageRows.length < limit) {
        garbageRows.push({
          platform: compactText(row.platform),
          shop: compactText(row.shop),
          platform_item_id: compactText(row.platform_item_id),
          platform_sku: platformSku || '(trống)',
          reason: 'SKU sàn rỗng hoặc rác'
        })
      }
    }
    if (!mappingProfile.comparable && mappingProfile.items.length) {
      complexMappingCount += 1
    }
  }

  return {
    summary: {
      unmapped_skus: unmappedCount,
      garbage_skus: garbageCount,
      duplicate_internal_skus: (duplicateRows.results || []).length,
      complex_mapping_skus: complexMappingCount
    },
    duplicate_rows: (duplicateRows.results || []).map(row => ({
      platform: compactText(row.platform),
      shop: compactText(row.shop),
      internal_sku: compactText(row.internal_sku),
      total: numberValue(row.total)
    })),
    garbage_rows: garbageRows
  }
}
