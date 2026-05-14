/**
 * Chuẩn hóa định danh SKU để các core khác dùng chung một cách đọc map SKU.
 */
export function cleanSkuIdentityText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function skuQtyNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 1
}

/**
 * Gom các dòng map SKU trùng nhau về một chỗ để tránh một SKU nội bộ
 * bị lặp nhiều lần chỉ vì dữ liệu đầu vào bị tách thành nhiều object nhỏ.
 */
function mergeMappedSkuItems(items = []) {
  const merged = new Map()
  for (const item of items) {
    const sku = cleanSkuIdentityText(item?.sku || item?.internal_sku)
    if (!sku) continue
    const current = merged.get(sku) || { sku, qty: 0 }
    current.qty += skuQtyNumber(item?.qty)
    merged.set(sku, current)
  }
  return [...merged.values()]
}

export function parseMappedSkuItems(value, fallbackSku = '') {
  let parsed = []
  if (typeof value === 'string' && value.trim()) {
    try {
      parsed = JSON.parse(value)
    } catch {
      parsed = []
    }
  } else if (Array.isArray(value)) {
    parsed = value
  }

  if (Array.isArray(parsed) && parsed.length) return mergeMappedSkuItems(parsed)

  const sku = cleanSkuIdentityText(fallbackSku)
  return sku ? [{ sku, qty: 1 }] : []
}

export function skuMappingReasonLabel(reason = '') {
  switch (cleanSkuIdentityText(reason)) {
    case 'direct_mapping':
      return 'Map thẳng 1 SKU = 1 SKU'
    case 'multi_component':
      return 'Map nhiều SKU nội bộ cho một SKU sàn'
    case 'bundle_quantity':
      return 'Map combo có số lượng lớn hơn 1'
    case 'missing_mapping':
    default:
      return 'Chưa có mapping SKU'
  }
}

/**
 * Trả về hồ sơ mapping đầy đủ để mọi màn hình đều đọc cùng một logic:
 * map thẳng, combo theo số lượng hoặc nhiều SKU thành phần.
 */
export function buildSkuMappingProfile(row = {}) {
  const fallbackSku = cleanSkuIdentityText(row.internal_sku)
  const items = parseMappedSkuItems(row.mapped_items, fallbackSku)
  const profile = {
    comparable: false,
    reason: 'missing_mapping',
    reason_label: skuMappingReasonLabel('missing_mapping'),
    items,
    component_count: items.length,
    unique_sku_count: items.length,
    total_units: items.reduce((sum, item) => sum + skuQtyNumber(item.qty), 0),
    primary_sku: '',
    primary_qty: 0
  }

  if (!items.length) return profile

  if (items.length === 1) {
    profile.primary_sku = cleanSkuIdentityText(items[0]?.sku)
    profile.primary_qty = skuQtyNumber(items[0]?.qty)
    if (profile.primary_qty === 1) {
      profile.comparable = true
      profile.reason = 'direct_mapping'
      profile.reason_label = skuMappingReasonLabel('direct_mapping')
      return profile
    }
    profile.reason = 'bundle_quantity'
    profile.reason_label = skuMappingReasonLabel('bundle_quantity')
    return profile
  }

  profile.primary_sku = cleanSkuIdentityText(items[0]?.sku)
  profile.primary_qty = skuQtyNumber(items[0]?.qty)
  profile.reason = 'multi_component'
  profile.reason_label = skuMappingReasonLabel('multi_component')
  return profile
}

/**
 * Chỉ coi là có thể so sánh tồn kho khi mapping là 1 SKU nội bộ duy nhất, số lượng 1.
 * Những mapping combo/nhiều SKU sẽ được giữ riêng để tránh so sánh sai.
 */
export function resolveSimpleSkuMapping(row = {}) {
  const profile = buildSkuMappingProfile(row)
  if (!profile.comparable) {
    return {
      comparable: false,
      reason: profile.reason,
      reason_label: profile.reason_label,
      items: profile.items
    }
  }
  return {
    comparable: true,
    reason: 'direct_mapping',
    reason_label: skuMappingReasonLabel('direct_mapping'),
    sku: profile.primary_sku,
    qty: 1,
    items: profile.items
  }
}
