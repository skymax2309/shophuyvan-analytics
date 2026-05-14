function normalizeShopList(url) {
  return url.searchParams.getAll('shop')
    .flatMap(value => String(value || '').split(','))
    .map(value => value.trim())
    .filter(Boolean)
}

async function calculateOperationCosts(env, inputUrl) {
  const url = inputUrl instanceof URL ? inputUrl : new URL(inputUrl)
  const from = url.searchParams.get('from') || ''
  const to = url.searchParams.get('to') || ''
  const platform = url.searchParams.get('platform') || ''
  const shopList = normalizeShopList(url)
  const shop = shopList.join(',')

  const rows = await env.DB.prepare(`
    SELECT cost_key, cost_value, cost_name, calc_type, platform, shop
    FROM cost_settings
    WHERE cost_key LIKE 'custom_%'
    ORDER BY cost_name
  `).all()

  // Chi phí theo đơn phải dùng cùng bộ đơn bán hợp lệ với Dashboard để không tính lên đơn hủy/hoàn.
  const orderConds = ["order_type = 'normal'"]
  const orderParams = []
  if (from) { orderConds.push('date(order_date) >= ?'); orderParams.push(from) }
  if (to) { orderConds.push('date(order_date) <= ?'); orderParams.push(to) }
  if (platform) { orderConds.push('platform = ?'); orderParams.push(platform) }
  if (shopList.length === 1) {
    orderConds.push('shop = ?')
    orderParams.push(shopList[0])
  } else if (shopList.length > 1) {
    orderConds.push(`shop IN (${shopList.map(() => '?').join(',')})`)
    shopList.forEach(item => orderParams.push(item))
  }

  const orderRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT order_id) AS total_orders
    FROM orders_v2 WHERE ${orderConds.join(' AND ')}
  `).bind(...orderParams).first()
  const totalOrders = orderRow?.total_orders || 0

  let months = 1
  if (from && to) {
    const d1 = new Date(from)
    const d2 = new Date(to)
    const totalDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1
    months = totalDays / 30
  }

  const allShopCountParams = []
  const allShopCountConds = ["order_type = 'normal'"]
  if (from) { allShopCountConds.push('date(order_date) >= ?'); allShopCountParams.push(from) }
  if (to) { allShopCountConds.push('date(order_date) <= ?'); allShopCountParams.push(to) }
  const allShopCountRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT shop || '|' || platform) AS total FROM orders_v2
    WHERE ${allShopCountConds.join(' AND ')}
  `).bind(...allShopCountParams).first()
  const totalShops = allShopCountRow?.total || 1

  let shopRatio = 1
  if (shopList.length > 0) {
    shopRatio = shopList.length / totalShops
  } else if (platform) {
    const platShopConds = ["order_type = 'normal'", 'platform = ?']
    const platShopParams = [platform]
    if (from) { platShopConds.push('date(order_date) >= ?'); platShopParams.push(from) }
    if (to) { platShopConds.push('date(order_date) <= ?'); platShopParams.push(to) }
    const platShopRow = await env.DB.prepare(`
      SELECT COUNT(DISTINCT shop) AS total FROM orders_v2
      WHERE ${platShopConds.join(' AND ')}
    `).bind(...platShopParams).first()
    const platShops = platShopRow?.total || 1
    shopRatio = platShops / totalShops
  }

  const allOrdConds = ["order_type = 'normal'"]
  const allOrdParams = []
  if (from) { allOrdConds.push('date(order_date) >= ?'); allOrdParams.push(from) }
  if (to) { allOrdConds.push('date(order_date) <= ?'); allOrdParams.push(to) }
  const allOrdRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT order_id) AS total FROM orders_v2
    WHERE ${allOrdConds.join(' AND ')}
  `).bind(...allOrdParams).first()
  const totalOrdersAll = allOrdRow?.total || totalOrders

  const costs = (rows.results || []).map(cost => {
    const costHasShop = cost.shop && cost.shop !== ''
    const costHasPlatform = cost.platform && cost.platform !== ''
    if (costHasPlatform && platform && cost.platform !== platform) return null
    if (costHasShop && shopList.length > 0 && !shopList.includes(cost.shop)) return null

    let actualAmount = 0
    let note = ''

    if (costHasShop) {
      actualAmount = cost.calc_type === 'per_month'
        ? cost.cost_value * months
        : cost.cost_value * totalOrders
      note = 'riêng shop này'
    } else if (cost.calc_type === 'per_month') {
      const baseAmount = cost.cost_value * months
      actualAmount = shop ? Math.round(baseAmount * shopRatio) : baseAmount
      note = shop ? `chia đều ${totalShops} shop` : 'toàn bộ'
    } else {
      const ordersForCalc = shop ? totalOrders : totalOrdersAll
      actualAmount = cost.cost_value * ordersForCalc
      note = shop ? `${totalOrders} đơn shop này` : `${totalOrdersAll} đơn tổng`
    }

    return { ...cost, actual_amount: actualAmount, total_orders: costHasShop ? totalOrders : totalOrdersAll, months, note, shop_ratio: shopRatio }
  }).filter(Boolean)

  return { costs, total_orders: totalOrders, months }
}

export { calculateOperationCosts }
