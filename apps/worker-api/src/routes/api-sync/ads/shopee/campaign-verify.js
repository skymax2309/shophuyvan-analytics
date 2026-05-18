function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function roundAds(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function firstSettingValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && cleanText(value) !== '') return value
  }
  return ''
}

function normalizeSettingRows(data = {}) {
  const rows = Array.isArray(data?.response?.campaign_list) ? data.response.campaign_list : []
  return rows.map(row => {
    const common = row?.common_info || {}
    return {
      campaign_id: cleanText(row?.campaign_id),
      campaign_status: cleanText(common.campaign_status),
      campaign_budget: roundAds(common.campaign_budget),
      roas_target: row?.auto_bidding_info?.roas_target === undefined ? null : roundAds(row.auto_bidding_info.roas_target),
      raw_setting: row
    }
  }).filter(row => row.campaign_id)
}

function statusMatches(action, status) {
  const value = cleanText(status).toLowerCase()
  const active = new Set(['ongoing', 'running', 'active', 'enabled', 'online', 'live', '1'])
  const paused = new Set(['paused', 'pause', 'inactive', 'disabled', 'offline', '0'])
  const stopped = new Set(['stopped', 'stop', 'ended', 'finished', 'deleted', 'closed'])
  if (['start', 'resume'].includes(action)) return active.has(value)
  if (action === 'pause') return paused.has(value)
  if (['stop', 'delete'].includes(action)) return stopped.has(value)
  return true
}

export async function verifyShopeeProductAdsEdit({ core, env, shop, payload = {} }) {
  const path = core.SHOPEE_PRODUCT_LEVEL_CAMPAIGN_SETTING_INFO_PATH
  const fetchShopeeShopJson = (...args) => core.fetchShopeeShopJson(...args)
  const campaignId = cleanText(payload.campaign_id)
  if (!campaignId) return { verified: false, reason: 'missing_campaign_id_for_refetch' }
  const data = await fetchShopeeShopJson(env, shop, path, {
    info_type_list: '1,2,3,4',
    campaign_id_list: campaignId
  })
  const rows = normalizeSettingRows(data)
  const row = rows.find(item => item.campaign_id === campaignId)
  if (!row) {
    return {
      verified: false,
      reason: 'campaign_not_found_after_refetch',
      endpoint: path,
      request_id: cleanText(data?.request_id),
      campaign_id: campaignId
    }
  }

  const action = cleanText(payload.edit_action).toLowerCase()
  const checks = []
  if (['start', 'resume', 'pause', 'stop', 'delete'].includes(action)) {
    checks.push({ field: 'campaign_status', expected_action: action, actual: row.campaign_status, ok: statusMatches(action, row.campaign_status) })
  }
  if (action === 'change_budget') {
    const expected = roundAds(payload.budget)
    checks.push({ field: 'campaign_budget', expected, actual: row.campaign_budget, ok: Math.abs(row.campaign_budget - expected) <= 0.01 })
  }
  if (action === 'change_roas_target') {
    const expected = roundAds(payload.roas_target)
    checks.push({ field: 'roas_target', expected, actual: row.roas_target, ok: Math.abs(roundAds(row.roas_target) - expected) <= 0.01 })
  }
  const failed = checks.filter(item => !item.ok)
  return {
    verified: checks.length ? failed.length === 0 : true,
    endpoint: path,
    request_id: cleanText(data?.request_id),
    campaign_id: campaignId,
    checks,
    failed_checks: failed,
    setting: {
      campaign_status: row.campaign_status,
      campaign_budget: row.campaign_budget,
      roas_target: row.roas_target,
      name: cleanText(firstSettingValue(row.raw_setting?.common_info || {}, ['ad_name']))
    }
  }
}
