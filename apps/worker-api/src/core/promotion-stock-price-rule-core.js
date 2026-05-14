function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function num(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(String(value).replace(/[%,$\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function roundMoney(value, fallback = 0) {
  const n = num(value) || num(fallback)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

function priceToPercent(originalPrice, targetPrice) {
  const original = num(originalPrice)
  const target = num(targetPrice)
  if (!original || !target || target >= original) return 0
  return Math.round((1 - target / original) * 10000) / 100
}

export const DEFAULT_PROMOTION_STOCK_THRESHOLDS = {
  low_lt: 10,
  medium_lt: 100,
  max_discount_percent: 30
}

export function normalizePromotionStockPriceRules(row = {}, rules = {}) {
  const current = roundMoney(row.promotion_price || row.discount_price || row.price || row.original_price)
  return {
    low_stock_price: roundMoney(rules.low_stock_price ?? rules.low ?? current, current),
    medium_stock_price: roundMoney(rules.medium_stock_price ?? rules.medium ?? current, current),
    high_stock_price: roundMoney(rules.high_stock_price ?? rules.high ?? current, current)
  }
}

export function promotionStockTier(row = {}, thresholds = {}) {
  const lowLt = Math.max(1, Math.round(num(thresholds.low_lt ?? thresholds.low ?? DEFAULT_PROMOTION_STOCK_THRESHOLDS.low_lt)))
  const mediumLt = Math.max(lowLt + 1, Math.round(num(thresholds.medium_lt ?? thresholds.medium ?? DEFAULT_PROMOTION_STOCK_THRESHOLDS.medium_lt)))
  const stock = Math.max(0, Math.round(num(row.stock ?? row.normal_stock ?? row.campaign_stock)))
  if (stock < lowLt) return { key: 'low', label: `Tồn dưới ${lowLt}`, stock, low_lt: lowLt, medium_lt: mediumLt }
  if (stock < mediumLt) return { key: 'medium', label: `Tồn từ ${lowLt} đến dưới ${mediumLt}`, stock, low_lt: lowLt, medium_lt: mediumLt }
  return { key: 'high', label: `Tồn từ ${mediumLt} trở lên`, stock, low_lt: lowLt, medium_lt: mediumLt }
}

function targetPriceForTier(tier, rules) {
  if (tier.key === 'low') return rules.low_stock_price
  if (tier.key === 'medium') return rules.medium_stock_price
  return rules.high_stock_price
}

function buildShopeeDiscountItemPayload(row = {}, targetPrice = 0) {
  const item = {
    item_id: num(row.item_id) || cleanText(row.item_id),
    item_promotion_price: targetPrice,
    promotion_price: targetPrice
  }
  if (cleanText(row.model_id)) {
    item.model_list = [{
      model_id: num(row.model_id) || cleanText(row.model_id),
      model_promotion_price: targetPrice,
      promotion_price: targetPrice
    }]
  }
  return {
    discount_id: num(row.discount_id || row.program_id) || cleanText(row.discount_id || row.program_id),
    item_list: [item]
  }
}

function buildGenericPromotionPayload(row = {}, targetPrice = 0) {
  return {
    platform: cleanText(row.platform),
    module: cleanText(row.module || 'promotion'),
    program_id: cleanText(row.program_id || row.discount_id || row.voucher_id),
    item_id: cleanText(row.item_id),
    model_id: cleanText(row.model_id),
    sku_id: cleanText(row.sku_id),
    target_promotion_price: targetPrice
  }
}

export function buildPromotionStockPricePreview(row = {}, options = {}) {
  const thresholds = {
    ...DEFAULT_PROMOTION_STOCK_THRESHOLDS,
    ...(options.thresholds || {})
  }
  const rules = normalizePromotionStockPriceRules(row, options.price_rules || options.rules || {})
  const tier = promotionStockTier(row, thresholds)
  const targetPrice = targetPriceForTier(tier, rules)
  const originalPrice = num(row.original_price || row.price)
  const currentPrice = num(row.promotion_price || row.discount_price)
  const maxDiscountPercent = num(thresholds.max_discount_percent || DEFAULT_PROMOTION_STOCK_THRESHOLDS.max_discount_percent)
  const discountPercent = priceToPercent(originalPrice, targetPrice)
  const warnings = []
  const errors = []

  if (!targetPrice) errors.push('Chưa có giá khuyến mãi mục tiêu.')
  if (originalPrice && targetPrice > originalPrice) errors.push('Giá khuyến mãi không được cao hơn giá gốc.')
  if (currentPrice && targetPrice === currentPrice) warnings.push('Giá mục tiêu đang bằng giá khuyến mãi hiện tại.')
  if (maxDiscountPercent && discountPercent > maxDiscountPercent) warnings.push(`Mức giảm ${discountPercent}% vượt ngưỡng ${maxDiscountPercent}%.`)
  if (tier.stock <= 0) warnings.push('Tồn kho đang bằng 0, ưu tiên khóa hoặc loại khỏi chương trình thay vì giảm giá thêm.')

  const platform = cleanText(row.platform).toLowerCase()
  const module = cleanText(row.module || 'discount').toLowerCase()
  const canBuildShopeeDiscount = platform === 'shopee' && ['discount', 'shopee_discount'].includes(module)
  const payload = canBuildShopeeDiscount
    ? buildShopeeDiscountItemPayload(row, targetPrice)
    : buildGenericPromotionPayload(row, targetPrice)

  return {
    status: errors.length ? 'blocked' : 'ok',
    mode: 'promotion_stock_price_rule_preview',
    platform: platform || 'unknown',
    module: module || 'promotion',
    shop: cleanText(row.shop),
    program_id: cleanText(row.program_id || row.discount_id || row.voucher_id),
    item_id: cleanText(row.item_id),
    model_id: cleanText(row.model_id),
    stock: tier.stock,
    tier,
    price_rules: rules,
    thresholds,
    original_price: originalPrice,
    current_promotion_price: currentPrice,
    target_promotion_price: targetPrice,
    equivalent_discount_percent: discountPercent,
    payload,
    warnings,
    errors,
    apply_supported: canBuildShopeeDiscount,
    apply_locked: true,
    sent_to_platform: false,
    note: canBuildShopeeDiscount
      ? 'Đã dựng payload Shopee Discount theo rule tồn kho, nhưng apply thật vẫn đi qua guard riêng.'
      : 'Module này mới có preview nội bộ, chưa mở apply thật lên sàn.'
  }
}
