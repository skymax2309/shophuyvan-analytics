// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

// Lấy filter từ query string: ?from=2026-01-01&to=2026-12-31&platform=tiktok&shop=ShopHuyVan
function getFilters(url) {
  const shops = url.searchParams.getAll("shop").filter(Boolean)
  return {
    from:     url.searchParams.get("from")     || null,
    to:       url.searchParams.get("to")       || null,
    platform: url.searchParams.get("platform") || null,
    shop:     shops.length === 1 ? shops[0] : null,
    shops:    shops,
  }
}

// Build WHERE clause động từ filter
function buildWhere(filters, prefix = "") {
  const conds = [`${prefix}order_type = 'normal'`]
  const params = []

  if (filters.from) {
    conds.push(`date(${prefix}order_date) >= ?`)
    params.push(filters.from)
  }
  if (filters.to) {
    conds.push(`date(${prefix}order_date) <= ?`)
    params.push(filters.to)
  }
  if (filters.platform) {
    conds.push(`${prefix}platform = ?`)
    params.push(filters.platform)
  }
  if (filters.shops && filters.shops.length > 0) {
    const placeholders = filters.shops.map(() => "?").join(",")
    conds.push(`${prefix}shop IN (${placeholders})`)
    filters.shops.forEach(s => params.push(s))
  } else if (filters.shop) {
    conds.push(`${prefix}shop = ?`)
    params.push(filters.shop)
  }

  return { where: "WHERE " + conds.join(" AND "), params }
}

export { getFilters, buildWhere }