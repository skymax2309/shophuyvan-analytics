export function installApiSyncAdsCommonDatesMetrics(core) {
  const cleanText = (...args) => core.cleanText(...args)
  const cleanYmd = (...args) => core.cleanYmd(...args)
  const ymdToBangkokEpoch = (...args) => core.ymdToBangkokEpoch(...args)

  function formatBangkokIso(date) {
    const shifted = new Date(date.getTime() + 7 * 3600 * 1000)
    const pad = n => String(n).padStart(2, '0')
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+07:00`
  }
  core.formatBangkokIso = formatBangkokIso

  function bangkokDateToJsDate(value, endOfDay = false) {
    const epoch = ymdToBangkokEpoch(value, endOfDay)
    return epoch ? new Date(epoch * 1000) : null
  }
  core.bangkokDateToJsDate = bangkokDateToJsDate

  function buildLazadaOrderWindow(options = {}) {
    const days = Math.max(1, Math.min(Number(options.days || 15) || 15, 120))
    const requestedFrom = cleanYmd(options.from || options.date_from || options.dateFrom)
    const requestedTo = cleanYmd(options.to || options.date_to || options.dateTo)
    const now = new Date()
    const defaultFrom = new Date(now.getTime() - days * 86400 * 1000)
    const fromDate = requestedFrom ? bangkokDateToJsDate(requestedFrom, false) : defaultFrom
    const toDate = requestedTo ? bangkokDateToJsDate(requestedTo, true) : now
    return {
      update_after: formatBangkokIso(fromDate || defaultFrom),
      update_before: formatBangkokIso(toDate || now)
    }
  }
  core.buildLazadaOrderWindow = buildLazadaOrderWindow

  function normalizeLazadaDate(value) {
    const text = cleanText(value)
    if (!text) return ''
    return text.slice(0, 19).replace('T', ' ')
  }
  core.normalizeLazadaDate = normalizeLazadaDate

  function toMoney(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? number : 0
  }
  core.toMoney = toMoney

  function formatBangkokDate(date) {
    const shifted = new Date(date.getTime() + 7 * 3600 * 1000)
    const pad = n => String(n).padStart(2, '0')
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
  }
  core.formatBangkokDate = formatBangkokDate

  function parseAdsDate(value, fallbackDate) {
    const text = cleanText(value)
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
    return formatBangkokDate(fallbackDate)
  }
  core.parseAdsDate = parseAdsDate

  function adsSyncWindow(options = {}) {
    const days = Math.max(1, Math.min(Number(options.days || 7) || 7, 90))
    const now = new Date()
    return {
      from: parseAdsDate(options.from || options.from_date, new Date(now.getTime() - (days - 1) * 86400 * 1000)),
      to: parseAdsDate(options.to || options.to_date, now)
    }
  }
  core.adsSyncWindow = adsSyncWindow

  function dateFromYmd(value) {
    const text = cleanText(value)
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  }
  core.dateFromYmd = dateFromYmd

  function ymdFromDate(date) {
    const pad = n => String(n).padStart(2, '0')
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  core.ymdFromDate = ymdFromDate

  function addUtcDays(date, days) {
    return new Date(date.getTime() + Number(days || 0) * 86400 * 1000)
  }
  core.addUtcDays = addUtcDays

  function shopeeAdsDmy(value) {
    const ymd = cleanText(value)
    const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return ymd
    return `${match[3]}-${match[2]}-${match[1]}`
  }
  core.shopeeAdsDmy = shopeeAdsDmy

  function parseShopeeDmy(value, fallback = '') {
    const text = cleanText(value)
    const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/)
    if (!match) return cleanText(fallback)
    return `${match[3]}-${match[2]}-${match[1]}`
  }
  core.parseShopeeDmy = parseShopeeDmy

  function shopeeAmsDate(value) {
    return cleanText(value).replace(/-/g, '').slice(0, 8)
  }
  core.shopeeAmsDate = shopeeAmsDate

  function chunkList(values, size) {
    const chunks = []
    const safeSize = Math.max(1, Number(size || 100) || 100)
    for (let i = 0; i < values.length; i += safeSize) chunks.push(values.slice(i, i + safeSize))
    return chunks
  }
  core.chunkList = chunkList

  function adsDateRangeList(from, to, maxDays = 7) {
    const start = dateFromYmd(from)
    const end = dateFromYmd(to)
    if (!start || !end) return []
    const safeMax = Math.min(Math.max(Number(maxDays || 7) || 7, 1), 31)
    const rows = []
    for (let d = start; d.getTime() <= end.getTime() && rows.length < safeMax; d = addUtcDays(d, 1)) {
      rows.push(ymdFromDate(d))
    }
    return rows
  }
  core.adsDateRangeList = adsDateRangeList

  function adsUnixStart(dateText) {
    const [year, month, day] = String(dateText).split('-').map(Number)
    if (!year || !month || !day) return Math.floor(Date.now() / 1000)
    return Math.floor(Date.UTC(year, month - 1, day, -7, 0, 0) / 1000)
  }
  core.adsUnixStart = adsUnixStart

  function adsUnixEnd(dateText) {
    const [year, month, day] = String(dateText).split('-').map(Number)
    if (!year || !month || !day) return Math.floor(Date.now() / 1000)
    return Math.floor(Date.UTC(year, month - 1, day + 1, -7, 0, -1) / 1000)
  }
  core.adsUnixEnd = adsUnixEnd

  function adsNumber(value) {
    if (value === null || value === undefined || value === '') return 0
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'object') {
      for (const key of ['amount', 'value', 'num', 'number', 'cent', 'cents']) {
        if (Object.prototype.hasOwnProperty.call(value, key)) return adsNumber(value[key])
      }
      return 0
    }
    const text = String(value)
      .replace(/%/g, '')
      .replace(/[,\s₫đĐ$]/g, '')
      .trim()
    const number = Number(text)
    return Number.isFinite(number) ? number : 0
  }
  core.adsNumber = adsNumber

  function adsPercent(value) {
    if (value === null || value === undefined || value === '') return 0
    const text = String(value)
    const number = adsNumber(value)
    if (!number) return 0
    if (text.includes('%')) return number
    return Math.abs(number) <= 1 ? number * 100 : number
  }
  core.adsPercent = adsPercent

  function adsRatio(top, bottom) {
    const t = adsNumber(top)
    const b = adsNumber(bottom)
    return b ? t / b : 0
  }
  core.adsRatio = adsRatio

  function roundAds(value) {
    return Math.round(adsNumber(value) * 100) / 100
  }
  core.roundAds = roundAds

  function lowerKeyMap(source) {
    const map = new Map()
    if (!source || typeof source !== 'object' || Array.isArray(source)) return map
    for (const [key, value] of Object.entries(source)) {
      map.set(key.toLowerCase(), value)
    }
    return map
  }
  core.lowerKeyMap = lowerKeyMap

  function findCaseValue(source, names) {
    const direct = lowerKeyMap(source)
    for (const name of names) {
      const value = direct.get(String(name).toLowerCase())
      if (value !== undefined && value !== null && value !== '') return value
    }
    return undefined
  }
  core.findCaseValue = findCaseValue

  function findNestedValue(source, names, depth = 0) {
    const direct = findCaseValue(source, names)
    if (direct !== undefined) return direct
    if (!source || typeof source !== 'object' || depth > 2) return undefined
    const values = Array.isArray(source) ? source : Object.values(source)
    for (const value of values) {
      if (!value || typeof value !== 'object') continue
      const nested = findNestedValue(value, names, depth + 1)
      if (nested !== undefined) return nested
    }
    return undefined
  }
  core.findNestedValue = findNestedValue

  function firstAdsText(source, names) {
    const value = findNestedValue(source, names)
    return cleanText(value)
  }
  core.firstAdsText = firstAdsText

  function firstAdsMetric(source, names, mode = 'number') {
    const value = findNestedValue(source, names)
    if (mode === 'percent') return adsPercent(value)
    return adsNumber(value)
  }
  core.firstAdsMetric = firstAdsMetric

  function campaignRowScore(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return 0
    const keys = Object.keys(row).join(' ').toLowerCase()
    let score = 0
    if (keys.includes('campaign')) score += 5
    if (keys.includes('impression') || keys.includes('click') || keys.includes('spend')) score += 4
    if (keys.includes('cost') || keys.includes('revenue') || keys.includes('roas') || keys.includes('roi')) score += 3
    if (keys.includes('adgroup') || keys.includes('item') || keys.includes('sku')) score += 1
    return score
  }
  core.campaignRowScore = campaignRowScore

  function collectAdsArrayCandidates(value, candidates = [], depth = 0) {
    if (!value || depth > 6) return candidates
    if (Array.isArray(value)) {
      const objectRows = value.filter(item => item && typeof item === 'object' && !Array.isArray(item))
      if (objectRows.length) {
        const score = objectRows.reduce((sum, row) => sum + campaignRowScore(row), 0)
        if (score > 0) candidates.push({ rows: objectRows, score, length: objectRows.length })
      }
      for (const item of value) collectAdsArrayCandidates(item, candidates, depth + 1)
      return candidates
    }
    if (typeof value === 'object') {
      if (campaignRowScore(value) >= 8) candidates.push({ rows: [value], score: campaignRowScore(value), length: 1 })
      for (const item of Object.values(value)) collectAdsArrayCandidates(item, candidates, depth + 1)
    }
    return candidates
  }
  core.collectAdsArrayCandidates = collectAdsArrayCandidates

  function extractAdsRows(data) {
    const candidates = collectAdsArrayCandidates(data)
    candidates.sort((a, b) => (b.score - a.score) || (b.length - a.length))
    return candidates[0]?.rows || []
  }
  core.extractAdsRows = extractAdsRows

  function responseHasNextPage(data, batchLength, pageSize) {
    const explicit = findNestedValue(data, ['has_next_page', 'hasNextPage', 'hasNext', 'nextPage'])
    if (explicit !== undefined) {
      if (typeof explicit === 'boolean') return explicit
      if (String(explicit).toLowerCase() === 'true') return true
      if (String(explicit).toLowerCase() === 'false') return false
      return Number(explicit) > 0
    }
    const total = adsNumber(findNestedValue(data, ['total', 'totalCount', 'total_count']))
    const pageNo = adsNumber(findNestedValue(data, ['pageNo', 'page_no', 'page']))
    if (total && pageNo && pageSize) return pageNo * pageSize < total
    return batchLength >= pageSize
  }
  core.responseHasNextPage = responseHasNextPage

  function scoreAdsCampaign(row) {
    const spend = adsNumber(row.spend)
    const revenue = adsNumber(row.revenue)
    const roas = adsRatio(revenue, spend)
    const acos = adsRatio(spend, revenue)
    if (!spend) return 'no_ads'
    if (roas < 2 || acos > 0.35) return 'danger'
    if (roas >= 5 && acos <= 0.2) return 'good'
    return 'watch'
  }
  core.scoreAdsCampaign = scoreAdsCampaign

  function normalizeAdsCampaignRow(platform, shop, sourceRow, snapshotDate, fallback = {}) {
    const spend = firstAdsMetric(sourceRow, [
      'spend', 'cost', 'expense', 'charge', 'ad_spend', 'adSpend',
      'totalCost', 'costAmount', 'spent', 'consumption'
    ])
    const revenue = firstAdsMetric(sourceRow, [
      'revenue', 'sales', 'sale', 'gmv', 'directGmv', 'shopGmv',
      'salesRevenue', 'storeRevenue', 'orderAmount', 'itemRevenue'
    ])
    const impressions = firstAdsMetric(sourceRow, [
      'impressions', 'impression', 'pv', 'adPv', 'showCount', 'view', 'views', 'exposure'
    ])
    const clicks = firstAdsMetric(sourceRow, [
      'clicks', 'click', 'uv', 'adClickCnt', 'clickCount'
    ])
    const orders = firstAdsMetric(sourceRow, [
      'orders', 'order', 'orderCnt', 'storeOrder', 'productOrder',
      'conversions', 'conversion', 'unitsSold', 'itemsSold', 'paidOrderCnt'
    ])
    const ctr = firstAdsMetric(sourceRow, ['ctr', 'clickThroughRate'], 'percent') || adsRatio(clicks, impressions) * 100
    const cpc = firstAdsMetric(sourceRow, ['cpc', 'avgCpc', 'averageCpc']) || adsRatio(spend, clicks)
    const cvr = firstAdsMetric(sourceRow, ['cvr', 'conversionRate'], 'percent') || adsRatio(orders, clicks) * 100
    const roas = firstAdsMetric(sourceRow, ['roas', 'roi']) || adsRatio(revenue, spend)
    const acos = firstAdsMetric(sourceRow, ['acos', 'costRevenueRatio'], 'percent') || adsRatio(spend, revenue) * 100
    const campaignId = firstAdsText(sourceRow, [
      'campaign_id', 'campaignId', 'campaignID', 'campaignid'
    ]) || fallback.campaign_id || firstAdsText(sourceRow, ['id', 'solutionId']) || ''

    return {
      platform,
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      campaign_id: campaignId,
      campaign_name: firstAdsText(sourceRow, ['campaign_name', 'campaignName', 'name', 'solutionName']) || fallback.campaign_name || campaignId,
      campaign_type: firstAdsText(sourceRow, ['campaign_type', 'campaignType', 'type', 'solutionType', 'bizCode']) || fallback.campaign_type || '',
      product_sku: firstAdsText(sourceRow, ['seller_sku', 'sellerSku', 'sku', 'product_sku', 'productSku', 'shopSku', 'itemSku']) || fallback.product_sku || '',
      product_name: firstAdsText(sourceRow, ['product_name', 'productName', 'item_name', 'itemName', 'adgroupName']) || fallback.product_name || '',
      spend: roundAds(spend),
      revenue: roundAds(revenue),
      orders: Math.round(orders),
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      ctr: roundAds(ctr),
      cpc: roundAds(cpc),
      cvr: roundAds(cvr),
      roas: roundAds(roas),
      acos: roundAds(acos),
      status: scoreAdsCampaign({ spend, revenue }),
      snapshot_date: snapshotDate,
      raw_data: JSON.stringify(sourceRow).slice(0, 12000)
    }
  }
  core.normalizeAdsCampaignRow = normalizeAdsCampaignRow
}
