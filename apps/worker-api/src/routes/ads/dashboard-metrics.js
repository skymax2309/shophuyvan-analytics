export function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function safeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function round2(value) {
  return Math.round(safeNumber(value) * 100) / 100
}

export function ratio(a, b) {
  const top = safeNumber(a)
  const bottom = safeNumber(b)
  return bottom ? top / bottom : 0
}

export function buildCampaignWhere(url) {
  const conds = ['COALESCE(spend, 0) > 0']
  const params = []
  const from = cleanText(url.searchParams.get('from'))
  const to = cleanText(url.searchParams.get('to'))
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shop = cleanText(url.searchParams.get('shop'))

  if (from) {
    conds.push('snapshot_date >= ?')
    params.push(from)
  }
  if (to) {
    conds.push('snapshot_date <= ?')
    params.push(to)
  }
  if (platform) {
    conds.push('LOWER(platform) = ?')
    params.push(platform)
  }
  if (shop) {
    conds.push('shop = ?')
    params.push(shop)
  }

  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params }
}

export function scoreAds(row) {
  const ads = safeNumber(row.ads_spend)
  const revenue = safeNumber(row.revenue)
  const profit = safeNumber(row.profit_after_ads)
  const hasProfit = row.profit_after_ads !== undefined && row.profit_after_ads !== null && row.profit_after_ads !== ''
  const roas = ratio(revenue, ads)
  const acos = ratio(ads, revenue)
  if (!ads) return 'no_ads'
  if ((hasProfit && profit <= 0) || roas < 2 || acos > 0.35) return 'danger'
  if (roas >= 5 && (!hasProfit || profit > 0) && acos <= 0.2) return 'good'
  return 'watch'
}

export function enrichMetric(row) {
  const adsSpend = safeNumber(row.ads_spend)
  const revenue = safeNumber(row.revenue)
  const profitAfterAds = safeNumber(row.profit_after_ads)
  const profitBeforeAds = safeNumber(row.profit_before_ads)
  const impressions = safeNumber(row.impressions)
  const clicks = safeNumber(row.clicks)
  const orders = safeNumber(row.orders)
  return {
    ...row,
    orders,
    ads_orders: safeNumber(row.ads_orders),
    qty: safeNumber(row.qty),
    revenue: round2(revenue),
    ads_spend: round2(adsSpend),
    profit_after_ads: round2(profitAfterAds),
    profit_before_ads: round2(profitBeforeAds),
    impressions,
    clicks,
    ctr: round2(row.ctr || ratio(clicks, impressions) * 100),
    cpc: round2(row.cpc || ratio(adsSpend, clicks)),
    cvr: round2(row.cvr || ratio(orders, clicks) * 100),
    roas: round2(ratio(revenue, adsSpend)),
    acos: round2(ratio(adsSpend, revenue) * 100),
    ads_per_order: round2(ratio(adsSpend, orders)),
    profit_margin_after_ads: round2(ratio(profitAfterAds, revenue) * 100),
    status: scoreAds({ ads_spend: adsSpend, revenue, profit_after_ads: row.profit_after_ads })
  }
}

export function emptyAdsMetric(source = 'no_real_campaign_api_data') {
  return enrichMetric({
    orders: 0,
    ads_orders: 0,
    qty: 0,
    revenue: 0,
    ads_spend: 0,
    profit_after_ads: 0,
    profit_before_ads: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cvr: 0,
    source
  })
}

export function enrichCampaignMetric(row) {
  const spend = safeNumber(row.spend ?? row.ads_spend)
  const revenue = safeNumber(row.revenue)
  const clicks = safeNumber(row.clicks)
  const impressions = safeNumber(row.impressions)
  const orders = safeNumber(row.orders)
  return {
    ...row,
    spend: round2(spend),
    ads_spend: round2(spend),
    revenue: round2(revenue),
    orders,
    ads_orders: orders,
    impressions,
    clicks,
    ctr: round2(row.ctr || ratio(clicks, impressions) * 100),
    cpc: round2(row.cpc || ratio(spend, clicks)),
    cvr: round2(row.cvr || ratio(orders, clicks) * 100),
    roas: round2(row.roas || ratio(revenue, spend)),
    acos: round2(row.acos || ratio(spend, revenue) * 100),
    status: row.status || scoreAds({ ads_spend: spend, revenue }),
    source: 'ads_api_campaign_snapshots'
  }
}

export function isShopLevelAdsSnapshot(row) {
  const campaignId = cleanText(row.campaign_id)
  const campaignType = cleanText(row.campaign_type).toLowerCase()
  return campaignId.startsWith('all_cpc_ads_hourly:') ||
    campaignId.startsWith('all_cpc_ads_daily:') ||
    campaignType.includes('shop_level_cpc_hourly') ||
    campaignType.includes('shop_level_cpc_daily')
}

export function shopLevelSnapshotRank(row) {
  const updatedTime = Date.parse(cleanText(row.updated_at)) || 0
  const campaignId = cleanText(row.campaign_id)
  const campaignType = cleanText(row.campaign_type).toLowerCase()
  const sourceRank = campaignId.startsWith('all_cpc_ads_daily:') || campaignType.includes('shop_level_cpc_daily') ? 2 : 1
  return { updatedTime, sourceRank }
}

export function aggregateCampaignRows(campaigns) {
  const groups = new Map()
  for (const row of campaigns || []) {
    const key = [
      cleanText(row.platform).toLowerCase(),
      cleanText(row.shop).toLowerCase(),
      cleanText(row.snapshot_date)
    ].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const rows = []
  for (const group of groups.values()) {
    const shopLevel = group.filter(isShopLevelAdsSnapshot)
    if (!shopLevel.length) {
      rows.push(...group)
      continue
    }
    shopLevel.sort((a, b) => {
      const rankA = shopLevelSnapshotRank(a)
      const rankB = shopLevelSnapshotRank(b)
      return rankB.updatedTime - rankA.updatedTime || rankB.sourceRank - rankA.sourceRank
    })
    rows.push(shopLevel[0])
  }
  return rows
}

export async function listAdsShops(env) {
  const { results } = await env.DB.prepare(`
    SELECT id, shop_name, platform, user_name, api_shop_id,
           CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 1 ELSE 0 END AS has_access_token,
           token_expire_at, api_connected_at, api_refresh_expire_at
    FROM shops
    ORDER BY platform, shop_name
  `).all()
  return dedupeAdsShops(results || [])
}

export function isGeneratedShopName(shop) {
  const platform = cleanText(shop.platform).toLowerCase()
  const apiShopId = cleanText(shop.api_shop_id)
  const name = cleanText(shop.shop_name).toLowerCase()
  if (!apiShopId || !name) return false
  const prefix = platform === 'lazada' ? 'lazada' : platform === 'shopee' ? 'shopee' : platform
  return name === apiShopId.toLowerCase() || name === `${prefix} ${apiShopId}`.toLowerCase()
}

export function adsShopScore(shop) {
  let score = 0
  if (Number(shop.has_access_token)) score += 20
  if (cleanText(shop.api_shop_id)) score += 10
  if (cleanText(shop.shop_name) && !isGeneratedShopName(shop)) score += 40
  if (cleanText(shop.user_name) && cleanText(shop.user_name) !== cleanText(shop.api_shop_id)) score += 5
  return score
}

export function adsShopKey(shop) {
  const platform = cleanText(shop.platform).toLowerCase()
  const apiShopId = cleanText(shop.api_shop_id)
  if (apiShopId) return `${platform}|${apiShopId}`
  return `${platform}|${cleanText(shop.shop_name || shop.user_name).toLowerCase()}`
}

export function mergeAdsAliases(target, source) {
  const aliases = new Set([...(target.aliases || [])])
  for (const value of [source.shop_name, source.user_name, source.api_shop_id]) {
    const text = cleanText(value)
    if (text) aliases.add(text)
  }
  target.aliases = [...aliases]
  target.duplicate_count = Math.max(Number(target.duplicate_count || 1), target.aliases.length)
  return target
}

export function dedupeAdsShops(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const key = adsShopKey(row)
    const current = { ...row, aliases: [], duplicate_count: 1 }
    mergeAdsAliases(current, row)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, current)
      continue
    }
    const winner = adsShopScore(current) > adsShopScore(existing) ? current : existing
    const loser = winner === current ? existing : current
    mergeAdsAliases(winner, loser)
    map.set(key, winner)
  }
  return [...map.values()]
}

export async function ensureRealAdsTables(env) {
  // ADS Core giữ bảng chuẩn để UI chỉ đọc kết quả đã gom, không tự tính nghiệp vụ.
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop_key TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      campaign_name TEXT DEFAULT '',
      campaign_type TEXT DEFAULT '',
      status TEXT DEFAULT '',
      budget REAL DEFAULT 0,
      daily_budget REAL DEFAULT 0,
      roas_target REAL,
      start_time TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      source TEXT DEFAULT '',
      last_synced_at TEXT DEFAULT '',
      raw_payload TEXT DEFAULT '{}',
      UNIQUE(platform, shop_key, campaign_id)
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_adgroups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop_key TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      adgroup_id TEXT NOT NULL,
      adgroup_name TEXT DEFAULT '',
      status TEXT DEFAULT '',
      budget REAL DEFAULT 0,
      bid_price REAL DEFAULT 0,
      roas_target REAL,
      source TEXT DEFAULT '',
      last_synced_at TEXT DEFAULT '',
      raw_payload TEXT DEFAULT '{}',
      UNIQUE(platform, shop_key, campaign_id, adgroup_id)
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_product_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop_key TEXT NOT NULL,
      campaign_id TEXT DEFAULT '',
      adgroup_id TEXT DEFAULT '',
      item_id TEXT DEFAULT '',
      model_id TEXT DEFAULT '',
      sku_id TEXT DEFAULT '',
      seller_sku TEXT DEFAULT '',
      internal_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      source TEXT DEFAULT '',
      match_status TEXT DEFAULT '',
      UNIQUE(platform, shop_key, campaign_id, adgroup_id, item_id, model_id, seller_sku)
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      platform TEXT NOT NULL,
      shop_key TEXT NOT NULL,
      campaign_id TEXT DEFAULT '',
      adgroup_id TEXT DEFAULT '',
      sku_id TEXT DEFAULT '',
      spend REAL DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      orders INTEGER DEFAULT 0,
      ads_revenue REAL DEFAULT 0,
      ctr REAL DEFAULT 0,
      cpc REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      acos REAL DEFAULT 0,
      source TEXT DEFAULT '',
      last_synced_at TEXT DEFAULT '',
      UNIQUE(date, platform, shop_key, campaign_id, adgroup_id, sku_id)
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_decision_read_model (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id TEXT NOT NULL,
      platform TEXT DEFAULT '',
      shop_key TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      current_stock REAL,
      current_cost REAL,
      spend REAL DEFAULT 0,
      ads_revenue REAL DEFAULT 0,
      profit_after_ads REAL,
      roas REAL DEFAULT 0,
      acos REAL DEFAULT 0,
      recommendation TEXT DEFAULT '',
      recommendation_reason TEXT DEFAULT '',
      data_status TEXT DEFAULT '',
      action_status TEXT DEFAULT '',
      last_synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(sku_id, platform, shop_key)
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_write_capabilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop_key TEXT NOT NULL,
      action TEXT NOT NULL,
      endpoint TEXT DEFAULT '',
      allowed INTEGER DEFAULT 0,
      requires_admin_confirm INTEGER DEFAULT 1,
      requires_preview INTEGER DEFAULT 1,
      requires_readback INTEGER DEFAULT 1,
      capability_status TEXT DEFAULT '',
      last_verified_at TEXT DEFAULT '',
      UNIQUE(platform, shop_key, action)
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_action_logs (
      action_id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop_key TEXT NOT NULL,
      action_type TEXT DEFAULT '',
      target_type TEXT DEFAULT '',
      campaign_id TEXT DEFAULT '',
      adgroup_id TEXT DEFAULT '',
      sku_id TEXT DEFAULT '',
      before_payload TEXT DEFAULT '{}',
      proposed_payload TEXT DEFAULT '{}',
      write_payload TEXT DEFAULT '{}',
      response_payload TEXT DEFAULT '{}',
      readback_payload TEXT DEFAULT '{}',
      user_facing_result TEXT DEFAULT '',
      status TEXT DEFAULT '',
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      applied_at TEXT DEFAULT '',
      readback_at TEXT DEFAULT ''
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_ads_campaign_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      campaign_id TEXT DEFAULT '',
      campaign_name TEXT DEFAULT '',
      campaign_type TEXT DEFAULT '',
      product_sku TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      spend REAL DEFAULT 0,
      revenue REAL DEFAULT 0,
      orders INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      ctr REAL DEFAULT 0,
      cpc REAL DEFAULT 0,
      cvr REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      acos REAL DEFAULT 0,
      status TEXT DEFAULT '',
      snapshot_date TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ads_campaign_snapshots_lookup
    ON marketplace_ads_campaign_snapshots(platform, shop, snapshot_date)
  `).run()
}

export async function loadCampaignSnapshots(env, url) {
  const filter = buildCampaignWhere(url)
  const safeLimit = Math.min(Math.max(Number(url.searchParams.get('snapshot_limit') || 1000) || 1000, 100), 3000)
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_ads_campaign_snapshots
    ${filter.where}
    ORDER BY snapshot_date DESC, updated_at DESC, spend DESC
    LIMIT ${safeLimit}
  `).bind(...filter.params).all()

  const seen = new Set()
  const rows = []
  for (const row of results || []) {
    const key = [
      cleanText(row.platform).toLowerCase(),
      cleanText(row.shop),
      cleanText(row.snapshot_date),
      cleanText(row.campaign_id),
      cleanText(row.product_sku),
      cleanText(row.product_name)
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const metric = enrichCampaignMetric(row)
    if (safeNumber(metric.ads_spend) <= 0) continue
    rows.push(metric)
  }
  return rows
}

export function summarizeCampaignRows(campaigns) {
  if (!campaigns.length) return emptyAdsMetric()
  const base = campaigns.reduce((acc, row) => {
    acc.orders += safeNumber(row.orders)
    acc.ads_orders += safeNumber(row.orders)
    acc.revenue += safeNumber(row.revenue)
    acc.ads_spend += safeNumber(row.ads_spend ?? row.spend)
    acc.impressions += safeNumber(row.impressions)
    acc.clicks += safeNumber(row.clicks)
    return acc
  }, {
    orders: 0,
    ads_orders: 0,
    revenue: 0,
    ads_spend: 0,
    impressions: 0,
    clicks: 0
  })

  return {
    ...enrichMetric(base),
    campaigns: campaigns.length,
    source: 'ads_api_campaign_snapshots'
  }
}

export function campaignDailyRows(campaigns) {
  if (!campaigns.length) return []
  const map = new Map()
  for (const row of campaigns) {
    const day = cleanText(row.snapshot_date)
    if (!day) continue
    if (!map.has(day)) {
      map.set(day, {
        day,
        orders: 0,
        ads_orders: 0,
        revenue: 0,
        ads_spend: 0,
        impressions: 0,
        clicks: 0
      })
    }
    const item = map.get(day)
    item.orders += safeNumber(row.orders)
    item.ads_orders += safeNumber(row.orders)
    item.revenue += safeNumber(row.revenue)
    item.ads_spend += safeNumber(row.ads_spend ?? row.spend)
    item.impressions += safeNumber(row.impressions)
    item.clicks += safeNumber(row.clicks)
  }
  return [...map.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(row => ({ ...enrichMetric(row), source: 'ads_api_campaign_snapshots' }))
}

export function campaignShopRows(campaigns) {
  if (!campaigns.length) return []
  const map = new Map()
  for (const row of campaigns) {
    const platform = cleanText(row.platform).toLowerCase()
    const shop = cleanText(row.shop)
    const key = `${platform}|${shop}`
    if (!map.has(key)) {
      map.set(key, {
        platform,
        shop,
        orders: 0,
        ads_orders: 0,
        revenue: 0,
        ads_spend: 0,
        impressions: 0,
        clicks: 0
      })
    }
    const item = map.get(key)
    item.orders += safeNumber(row.orders)
    item.ads_orders += safeNumber(row.orders)
    item.revenue += safeNumber(row.revenue)
    item.ads_spend += safeNumber(row.ads_spend ?? row.spend)
    item.impressions += safeNumber(row.impressions)
    item.clicks += safeNumber(row.clicks)
  }
  return [...map.values()]
    .map(row => ({ ...enrichMetric(row), source: 'ads_api_campaign_snapshots' }))
    .sort((a, b) => safeNumber(b.ads_spend) - safeNumber(a.ads_spend))
}

export function campaignProductRows(campaigns, limit) {
  const campaignProducts = campaigns.filter(row => {
    const campaignType = cleanText(row.campaign_type).toLowerCase()
    const campaignId = cleanText(row.campaign_id)
    if (campaignType.startsWith('shop_level') || campaignId.startsWith('all_cpc_ads_')) return false
    return cleanText(row.product_sku) ||
      cleanText(row.product_name) ||
      cleanText(row.campaign_name) ||
      campaignId
  })
  if (!campaignProducts.length) return []
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 5), 100)
  const map = new Map()
  for (const row of campaignProducts) {
    const platform = cleanText(row.platform).toLowerCase()
    const shop = cleanText(row.shop)
    const sku = cleanText(row.product_sku) || cleanText(row.campaign_id)
    const productName = cleanText(row.product_name) || cleanText(row.campaign_name) || sku
    const key = `${platform}|${shop}|${sku}|${productName}`
    if (!map.has(key)) {
      map.set(key, {
        platform,
        shop,
        sku,
        campaign_id: cleanText(row.campaign_id),
        campaign_name: cleanText(row.campaign_name),
        product_sku: cleanText(row.product_sku),
        product_name: productName,
        raw_data: cleanText(row.raw_data),
        qty: 0,
        orders: 0,
        ads_orders: 0,
        revenue: 0,
        ads_spend: 0,
        impressions: 0,
        clicks: 0
      })
    }
    const item = map.get(key)
    item.orders += safeNumber(row.orders)
    item.ads_orders += safeNumber(row.orders)
    item.revenue += safeNumber(row.revenue)
    item.ads_spend += safeNumber(row.ads_spend ?? row.spend)
    item.impressions += safeNumber(row.impressions)
    item.clicks += safeNumber(row.clicks)
  }
  return [...map.values()]
    .map(row => ({ ...enrichMetric(row), source: 'ads_api_campaign_snapshots' }))
    .sort((a, b) => safeNumber(b.ads_spend) - safeNumber(a.ads_spend))
    .slice(0, safeLimit)
}

export function adsShopDisplayName(shop) {
  return cleanText(shop?.shop_name || shop?.shop || shop?.user_name || shop?.api_shop_id)
}

export function adsStatusKey(platform, value) {
  return `${cleanText(platform).toLowerCase()}|${cleanText(value).toLowerCase()}`
}

export function putAdsAliases(map, shop, row) {
  const platform = cleanText(row?.platform || shop?.platform).toLowerCase()
  for (const value of [
    row?.shop,
    row?.shop_name,
    row?.user_name,
    row?.api_shop_id,
    shop?.shop,
    shop?.shop_name,
    shop?.user_name,
    shop?.api_shop_id,
    ...(shop?.aliases || [])
  ]) {
    const text = cleanText(value)
    if (platform && text) map.set(adsStatusKey(platform, text), row)
  }
}

export function campaignSnapshotType(row) {
  const type = cleanText(row.campaign_type).toLowerCase()
  const id = cleanText(row.campaign_id).toLowerCase()
  if (type.startsWith('shop_level') || id.startsWith('all_cpc_ads_')) return 'shop_level'
  return 'product_campaign'
}

export function buildAdsShopStatusRows(apiShops, shopPerformance, campaigns, balances, toggleInfo) {
  const perfMap = new Map()
  for (const row of shopPerformance || []) putAdsAliases(perfMap, row, row)

  const balanceMap = new Map()
  for (const row of balances || []) putAdsAliases(balanceMap, row, row)

  const toggleMap = new Map()
  for (const row of toggleInfo || []) putAdsAliases(toggleMap, row, row)

  const countMap = new Map()
  for (const row of campaigns || []) {
    const platform = cleanText(row.platform).toLowerCase()
    const shop = cleanText(row.shop)
    if (!platform || !shop) continue
    const key = adsStatusKey(platform, shop)
    if (!countMap.has(key)) countMap.set(key, { campaign_snapshot_count: 0, product_campaign_count: 0, shop_level_count: 0 })
    const item = countMap.get(key)
    item.campaign_snapshot_count += 1
    if (campaignSnapshotType(row) === 'shop_level') item.shop_level_count += 1
    else item.product_campaign_count += 1
  }

  const rows = []
  const seen = new Set()
  for (const shop of apiShops || []) {
    const platform = cleanText(shop.platform).toLowerCase()
    const name = adsShopDisplayName(shop)
    if (!platform || !name) continue
    const keys = [shop.shop_name, shop.user_name, shop.api_shop_id, ...(shop.aliases || [])]
      .map(value => adsStatusKey(platform, value))
    const perf = keys.map(key => perfMap.get(key)).find(Boolean) || {}
    const balance = keys.map(key => balanceMap.get(key)).find(Boolean) || {}
    const toggle = keys.map(key => toggleMap.get(key)).find(Boolean) || {}
    const counts = keys.map(key => countMap.get(key)).find(Boolean) || {}
    const row = {
      id: shop.id || '',
      platform,
      shop: name,
      shop_name: name,
      user_name: cleanText(shop.user_name),
      api_shop_id: cleanText(shop.api_shop_id),
      has_access_token: Number(shop.has_access_token) ? 1 : 0,
      connected: Number(shop.has_access_token) ? 1 : 0,
      ads_spend: safeNumber(perf.ads_spend),
      revenue: safeNumber(perf.revenue),
      orders: safeNumber(perf.orders),
      impressions: safeNumber(perf.impressions),
      clicks: safeNumber(perf.clicks),
      cpc: safeNumber(perf.cpc),
      ctr: safeNumber(perf.ctr),
      roas: safeNumber(perf.roas),
      acos: safeNumber(perf.acos),
      campaign_snapshot_count: safeNumber(counts.campaign_snapshot_count),
      product_campaign_count: safeNumber(counts.product_campaign_count),
      shop_level_count: safeNumber(counts.shop_level_count),
      balance_ok: Boolean(balance.ok),
      total_balance: balance.total_balance === undefined ? null : safeNumber(balance.total_balance),
      toggle_ok: Boolean(toggle.ok),
      auto_top_up: toggle.auto_top_up ?? null,
      campaign_surge: toggle.campaign_surge ?? null,
      state: safeNumber(perf.ads_spend) > 0 ? 'running' : 'connected_no_spend'
    }
    rows.push(enrichMetric(row))
    seen.add(adsStatusKey(platform, name))
  }

  for (const perf of shopPerformance || []) {
    const platform = cleanText(perf.platform).toLowerCase()
    const name = cleanText(perf.shop)
    const key = adsStatusKey(platform, name)
    if (!platform || !name || seen.has(key)) continue
    const row = {
      ...perf,
      shop_name: name,
      api_shop_id: '',
      connected: 0,
      campaign_snapshot_count: 0,
      product_campaign_count: 0,
      shop_level_count: 0,
      state: safeNumber(perf.ads_spend) > 0 ? 'running' : 'unknown'
    }
    rows.push(enrichMetric(row))
  }

  return rows.sort((a, b) => {
    const spendDiff = safeNumber(b.ads_spend) - safeNumber(a.ads_spend)
    if (spendDiff) return spendDiff
    return cleanText(a.shop).localeCompare(cleanText(b.shop))
  })
}

export async function loadAffiliateSnapshots(env, url) {
  await ensureShopeeAffiliatePerformanceTable(env)
  const conds = ["platform = 'shopee'"]
  const params = []
  const from = cleanText(url.searchParams.get('from'))
  const to = cleanText(url.searchParams.get('to'))
  const shop = cleanText(url.searchParams.get('shop'))
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  if (platform && platform !== 'shopee') return []
  if (from) {
    conds.push('end_date >= ?')
    params.push(from)
  }
  if (to) {
    conds.push('start_date <= ?')
    params.push(to)
  }
  if (shop) {
    conds.push('shop = ?')
    params.push(shop)
  }
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_affiliate_performance_snapshots
    WHERE ${conds.join(' AND ')}
    ORDER BY end_date DESC, updated_at DESC, sales DESC
    LIMIT 200
  `).bind(...params).all()
  return (results || []).map(row => ({
    ...row,
    sales: round2(row.sales),
    est_commission: round2(row.est_commission),
    roi: round2(row.roi),
    items_sold: safeNumber(row.items_sold),
    orders: safeNumber(row.orders),
    clicks: safeNumber(row.clicks),
    total_buyers: safeNumber(row.total_buyers),
    new_buyers: safeNumber(row.new_buyers)
  }))
}

export function summarizeAffiliateRows(rows) {
  const base = (rows || []).reduce((acc, row) => {
    acc.sales += safeNumber(row.sales)
    acc.est_commission += safeNumber(row.est_commission)
    acc.orders += safeNumber(row.orders)
    acc.clicks += safeNumber(row.clicks)
    acc.items_sold += safeNumber(row.items_sold)
    return acc
  }, { sales: 0, est_commission: 0, orders: 0, clicks: 0, items_sold: 0 })
  return {
    ...base,
    sales: round2(base.sales),
    est_commission: round2(base.est_commission),
    roi: round2(ratio(base.sales, base.est_commission)),
    affiliates: (rows || []).length
  }
}

export async function loadOpenCampaignSnapshots(env, url) {
  await ensureShopeeOpenCampaignPerformanceTable(env)
  const conds = ["platform = 'shopee'"]
  const params = []
  const from = cleanText(url.searchParams.get('from'))
  const to = cleanText(url.searchParams.get('to'))
  const shop = cleanText(url.searchParams.get('shop'))
  const platform = cleanText(url.searchParams.get('platform')).toLowerCase()
  if (platform && platform !== 'shopee') return []
  if (from) {
    conds.push('end_date >= ?')
    params.push(from)
  }
  if (to) {
    conds.push('start_date <= ?')
    params.push(to)
  }
  if (shop) {
    conds.push('shop = ?')
    params.push(shop)
  }
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_ams_open_campaign_snapshots
    WHERE ${conds.join(' AND ')}
    ORDER BY end_date DESC, updated_at DESC, sales DESC
    LIMIT 200
  `).bind(...params).all()
  return (results || []).map(row => ({
    ...row,
    affiliates: safeNumber(row.affiliates),
    sales: round2(row.sales),
    item_sold: safeNumber(row.item_sold),
    est_commission: round2(row.est_commission)
  }))
}

export function summarizeOpenCampaignRows(rows) {
  const base = (rows || []).reduce((acc, row) => {
    acc.sales += safeNumber(row.sales)
    acc.est_commission += safeNumber(row.est_commission)
    acc.item_sold += safeNumber(row.item_sold)
    acc.affiliates += safeNumber(row.affiliates)
    return acc
  }, { sales: 0, est_commission: 0, item_sold: 0, affiliates: 0 })
  return {
    ...base,
    sales: round2(base.sales),
    est_commission: round2(base.est_commission),
    products: (rows || []).length
  }
}
