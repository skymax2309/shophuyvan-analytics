export function installApiSyncAdsShopeeCampaignInputs(core) {
  const adsNumber = (...args) => core.adsNumber(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const roundAds = (...args) => core.roundAds(...args)

  function normalizeShopeeAdKeywordEdits(options = {}) {
    const rawRows = Array.isArray(options.selected_keywords)
      ? options.selected_keywords
      : (Array.isArray(options.selectedKeywords) ? options.selectedKeywords : (Array.isArray(options.keywords) ? options.keywords : []))
    const fallbackAction = cleanText(options.edit_action || options.editAction)
    const allowedActions = new Set(['add', 'delete', 'restore', 'change_bid_price', 'change_match_type'])
    const allowedMatchTypes = new Set(['exact', 'broad'])
    const rows = []
    const errors = []

    rawRows.forEach((row, index) => {
      const item = row && typeof row === 'object' ? row : { keyword: row }
      const keyword = cleanText(item.keyword)
      const editAction = cleanText(item.edit_action || item.editAction || fallbackAction).toLowerCase()
      const matchType = cleanText(item.match_type || item.matchType).toLowerCase()
      const hasBid = item.bid_price_per_click !== undefined || item.bidPricePerClick !== undefined || item.bid_price !== undefined || item.bidPrice !== undefined
      const bidPrice = hasBid ? adsNumber(item.bid_price_per_click ?? item.bidPricePerClick ?? item.bid_price ?? item.bidPrice) : null
      if (!keyword) errors.push(`selected_keywords[${index}].keyword is required`)
      if (!allowedActions.has(editAction)) errors.push(`selected_keywords[${index}].edit_action invalid`)
      if (matchType && !allowedMatchTypes.has(matchType)) errors.push(`selected_keywords[${index}].match_type must be exact or broad`)
      if (editAction === 'change_match_type' && !matchType) errors.push(`selected_keywords[${index}].match_type is required`)
      if (editAction === 'change_bid_price' && (!hasBid || bidPrice <= 0)) errors.push(`selected_keywords[${index}].bid_price_per_click is required`)
      if (hasBid && bidPrice <= 0) errors.push(`selected_keywords[${index}].bid_price_per_click must be greater than 0`)
      const normalized = { keyword, edit_action: editAction }
      if (matchType) normalized.match_type = matchType
      if (hasBid) normalized.bid_price_per_click = roundAds(bidPrice)
      rows.push(normalized)
    })

    if (!rows.length) errors.push('selected_keywords is required')
    return { rows, errors }
  }
  core.normalizeShopeeAdKeywordEdits = normalizeShopeeAdKeywordEdits

  function shopeeAutoProductAdsReferenceId(value = '') {
    const direct = cleanText(value)
    return direct || `auto_product_ads_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }
  core.shopeeAutoProductAdsReferenceId = shopeeAutoProductAdsReferenceId

  function isShopeeDmyDate(value = '') {
    return /^\d{2}-\d{2}-\d{4}$/.test(cleanText(value))
  }
  core.isShopeeDmyDate = isShopeeDmyDate

  function shopeeManualProductAdsReferenceId(value = '') {
    const direct = cleanText(value)
    return direct || `manual_product_ads_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }
  core.shopeeManualProductAdsReferenceId = shopeeManualProductAdsReferenceId

  function normalizeShopeeDiscoveryAdsLocations(value = []) {
    let source = []
    if (Array.isArray(value)) source = value
    else if (value && typeof value === 'object') source = [value]
    else {
      const text = cleanText(value)
      if (text) {
        if (text.startsWith('[') || text.startsWith('{')) {
          try {
            const parsed = JSON.parse(text)
            source = Array.isArray(parsed) ? parsed : [parsed]
          } catch {
            source = []
          }
        } else {
          source = text.split(',').map(item => cleanText(item)).filter(Boolean)
        }
      }
    }

    const allowedLocations = new Set(['daily_discover', 'you_may_also_like'])
    const allowedStatus = new Set(['active', 'inactive'])
    const rows = []
    const errors = []
    source.forEach((raw, index) => {
      const parts = typeof raw === 'string' ? raw.split(':').map(item => cleanText(item)) : []
      const location = cleanText(typeof raw === 'string' ? parts[0] : raw?.location).toLowerCase()
      const status = cleanText(typeof raw === 'string' ? (parts[1] || 'active') : raw?.status).toLowerCase()
      const bidRaw = typeof raw === 'string' ? parts[2] : raw?.bid_price
      const hasBid = bidRaw !== undefined && bidRaw !== null && bidRaw !== ''
      const bidPrice = roundAds(adsNumber(bidRaw))
      if (!allowedLocations.has(location)) errors.push(`discovery_ads_locations[${index}].location invalid`)
      if (!allowedStatus.has(status)) errors.push(`discovery_ads_locations[${index}].status invalid`)
      if (hasBid && bidPrice <= 0) errors.push(`discovery_ads_locations[${index}].bid_price must be greater than 0`)
      if (!location || !status) return
      const row = { location, status }
      if (hasBid) row.bid_price = bidPrice
      rows.push(row)
    })
    return { rows, errors }
  }
  core.normalizeShopeeDiscoveryAdsLocations = normalizeShopeeDiscoveryAdsLocations
}
