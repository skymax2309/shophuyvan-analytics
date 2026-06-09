function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function numberValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundMoney(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.round(number) : 0
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function settingNumber(settings, keys, fallback) {
  for (const key of keys) {
    const value = nullableNumber(settings?.[key])
    if (value !== null) return value
  }
  return fallback
}

function isPausedStatus(value) {
  const text = cleanText(value).toLowerCase()
  return ['paused', 'pause', 'inactive', 'disabled', 'offline', '0'].includes(text)
}

function isRunningStatus(value) {
  const text = cleanText(value).toLowerCase()
  return ['ongoing', 'running', 'active', 'enabled', 'online', 'live', '1', 'good', 'watch', 'danger'].includes(text)
}

function rawValue(row = {}, keys = []) {
  const raw = parseJson(row.raw_data || row.raw_payload, {})
  const stack = [row, raw]
  while (stack.length) {
    const current = stack.shift()
    if (!current || typeof current !== 'object') continue
    for (const key of keys) {
      if (current[key] !== undefined && current[key] !== null && cleanText(current[key]) !== '') return current[key]
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') stack.push(value)
    }
  }
  return ''
}

function campaignBudget(row = {}) {
  return numberValue(rawValue(row, ['daily_budget', 'campaign_budget', 'budget', 'total_budget']) || row.daily_budget || row.budget, 0)
}

function campaignStatus(row = {}) {
  return cleanText(rawValue(row, ['campaign_status', 'status']) || row.status)
}

function normalizeSettings(settings = {}) {
  const maxIncrease = settingNumber(settings, ['max_budget_increase_pct', 'good_budget_increase_percent'], 30)
  const maxDecrease = settingNumber(settings, ['max_budget_decrease_pct', 'medium_budget_decrease_percent'], 30)
  return {
    ...settings,
    roas_target: settingNumber(settings, ['roas_target', 'good_roas'], 4),
    roas_min: settingNumber(settings, ['roas_min', 'minimum_roas'], 2),
    acos_max: settingNumber(settings, ['acos_max', 'high_acos'], 40),
    stock_min: settingNumber(settings, ['stock_min', 'minimum_stock_for_budget', 'low_stock'], 10),
    auto_resume_enabled: settings.auto_resume_enabled !== false && settings.auto_resume_enabled !== 'false' && settings.auto_resume_enabled !== 0 && settings.auto_resume_enabled !== '0',
    resume_roas_multiplier: Math.max(1, settingNumber(settings, ['resume_roas_multiplier'], 1.3)),
    resume_stock_multiplier: Math.max(1, settingNumber(settings, ['resume_stock_multiplier'], 2)),
    budget_max: settingNumber(settings, ['budget_max', 'max_campaign_daily_budget'], 200000),
    max_campaigns_per_run: Math.max(1, Math.round(settingNumber(settings, ['max_campaigns_per_run'], 10))),
    max_resume_per_day: Math.max(0, Math.round(settingNumber(settings, ['max_resume_per_day'], 2))),
    max_budget_increase_pct: Math.max(0, maxIncrease),
    max_budget_decrease_pct: Math.max(0, maxDecrease),
    require_admin_confirm_above_pct: Math.max(0, settingNumber(settings, ['require_admin_confirm_above_pct'], 50)),
    emergency_stop: Boolean(settings.emergency_stop)
  }
}

function mapDecisionRows(readModel = []) {
  const map = new Map()
  for (const row of readModel) {
    for (const key of [row.sku_id, row.internal_sku, row.seller_sku, row.campaign_id].map(cleanText).filter(Boolean)) {
      map.set(key.toLowerCase(), row)
    }
  }
  return map
}

function pickDecision(row = {}, decisionMap) {
  const keys = [
    row.sku_id,
    row.product_sku,
    row.seller_sku,
    row.internal_sku,
    row.campaign_id,
    rawValue(row, ['sku_id', 'seller_sku', 'internal_sku', 'product_sku'])
  ].map(cleanText).filter(Boolean)
  for (const key of keys) {
    const found = decisionMap.get(key.toLowerCase())
    if (found) return found
  }
  return {}
}

function buildBudgetAction(row, settings, direction) {
  const before = campaignBudget(row)
  const pct = direction === 'increase' ? settings.max_budget_increase_pct : settings.max_budget_decrease_pct
  const multiplier = direction === 'increase' ? 1 + pct / 100 : 1 - pct / 100
  const rawAfter = before > 0 ? before * multiplier : 0
  const capped = direction === 'increase' ? Math.min(rawAfter, settings.budget_max) : Math.max(rawAfter, 0)
  return {
    before_value: roundMoney(before),
    after_value: roundMoney(capped),
    change_pct: before > 0 ? Math.abs((capped - before) / before) * 100 : 0
  }
}

function baseResult(row = {}, decision = {}) {
  return {
    platform: cleanText(row.platform).toLowerCase(),
    shop_key: cleanText(row.shop_key || row.shop),
    campaign_id: cleanText(row.campaign_id),
    campaign_name: cleanText(row.campaign_name || decision.product_name || row.product_name),
    campaign_type: cleanText(row.campaign_type),
    adgroup_id: cleanText(row.adgroup_id),
    sku_id: cleanText(decision.sku_id || row.sku_id || row.product_sku || row.campaign_id),
    classification: 'thiếu_dữ_liệu',
    proposed_action: 'no_action',
    proposed_reason: 'Chưa đủ dữ liệu để tự động thay đổi.',
    before_value: campaignBudget(row),
    after_value: campaignBudget(row),
    requires_admin_confirm: false,
    blocked_reason: null,
    metrics: {
      roas: numberValue(row.roas ?? decision.roas, 0),
      acos: numberValue(row.acos ?? decision.acos, 0),
      spend: numberValue(row.spend ?? decision.spend, 0),
      ads_revenue: numberValue(row.revenue ?? row.ads_revenue ?? decision.ads_revenue, 0),
      metric_days: numberValue(row.metric_days, 0),
      profit_after_ads: nullableNumber(decision.profit_after_ads),
      current_cost: nullableNumber(decision.current_cost),
      current_stock: nullableNumber(decision.current_stock ?? decision.available_stock),
      status: campaignStatus(row),
      budget: campaignBudget(row)
    }
  }
}

function classifyCampaign(row = {}, decision = {}, normalizedSettings = {}) {
  const result = baseResult(row, decision)
  const m = result.metrics
  if (normalizedSettings.emergency_stop) {
    result.classification = 'thiếu_dữ_liệu'
    result.proposed_reason = 'Tự động ADS đang tắt khẩn cấp.'
    return result
  }
  if (m.current_cost === null) {
    result.proposed_reason = 'Chưa có giá vốn.'
    return result
  }
  if (m.current_stock !== null && m.current_stock < normalizedSettings.stock_min) {
    result.classification = 'không_hiệu_quả'
    result.proposed_action = isPausedStatus(m.status) ? 'no_action' : 'pause'
    result.proposed_reason = 'Tồn kho thấp.'
    result.after_value = 'paused'
    return result
  }
  if (m.roas < normalizedSettings.roas_min && m.profit_after_ads !== null && m.profit_after_ads < 0) {
    result.classification = 'không_hiệu_quả'
    result.proposed_action = isPausedStatus(m.status) ? 'no_action' : 'pause'
    result.proposed_reason = 'ROAS thấp và lãi sau ADS âm.'
    result.after_value = 'paused'
    return result
  }
  if (m.acos > normalizedSettings.acos_max && m.budget > 0 && m.spend >= m.budget) {
    const budget = buildBudgetAction(row, normalizedSettings, 'decrease')
    result.classification = 'không_hiệu_quả'
    result.proposed_action = budget.after_value > 0 ? 'decrease_budget' : 'pause'
    result.proposed_reason = 'ACOS cao và chi ADS đã vượt ngân sách ngày.'
    result.before_value = budget.before_value
    result.after_value = budget.after_value
    result.requires_admin_confirm = budget.change_pct > normalizedSettings.require_admin_confirm_above_pct
    return result
  }
  const resumeRoasTarget = normalizedSettings.roas_target * normalizedSettings.resume_roas_multiplier
  const resumeStockTarget = normalizedSettings.stock_min * normalizedSettings.resume_stock_multiplier
  if (normalizedSettings.auto_resume_enabled && isPausedStatus(m.status) && m.roas > resumeRoasTarget && (m.current_stock === null || m.current_stock >= resumeStockTarget)) {
    result.classification = 'hiệu_quả'
    result.proposed_action = 'resume'
    result.proposed_reason = 'Campaign đang tạm dừng nhưng ROAS 7 ngày tốt và tồn kho đủ.'
    result.after_value = 'running'
    return result
  }
  if (m.metric_days < 3) {
    result.classification = 'thiếu_dữ_liệu'
    result.proposed_reason = 'Chưa đủ dữ liệu 3 ngày.'
    return result
  }
  if (m.roas > resumeRoasTarget && (m.current_stock === null || m.current_stock >= resumeStockTarget)) {
    if (!isRunningStatus(m.status) && !normalizedSettings.auto_resume_enabled) {
      result.classification = 'hiệu_quả'
      result.proposed_action = 'no_action'
      result.proposed_reason = 'Campaign đủ điều kiện nhưng tự bật lại đang tắt.'
      return result
    }
    const budget = buildBudgetAction(row, normalizedSettings, 'increase')
    result.classification = 'hiệu_quả'
    result.proposed_action = isRunningStatus(m.status) ? 'increase_budget' : 'resume'
    result.proposed_reason = 'ROAS vượt mục tiêu và tồn kho đủ.'
    result.before_value = budget.before_value
    result.after_value = result.proposed_action === 'increase_budget' ? budget.after_value : 'running'
    result.requires_admin_confirm = budget.change_pct > normalizedSettings.require_admin_confirm_above_pct
    return result
  }
  if (m.roas >= normalizedSettings.roas_target * 0.8 && m.roas <= normalizedSettings.roas_target * 1.3) {
    result.classification = 'trung_bình'
    result.proposed_reason = 'ROAS đang trong vùng theo dõi.'
    return result
  }
  result.classification = 'thiếu_dữ_liệu'
  result.proposed_reason = 'Chưa đủ điều kiện để tự động thay đổi.'
  return result
}

function applyRunLimit(results = [], settings = {}) {
  const actionable = results
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item.proposed_action && entry.item.proposed_action !== 'no_action')
    .sort((a, b) => {
      const profitA = a.item.metrics.profit_after_ads ?? 0
      const profitB = b.item.metrics.profit_after_ads ?? 0
      if (profitA !== profitB) return profitA - profitB
      return (a.item.metrics.roas || 0) - (b.item.metrics.roas || 0)
    })
  const allowed = new Set(actionable.slice(0, settings.max_campaigns_per_run).map(entry => entry.index))
  let resumeCount = 0
  return results.map((item, index) => {
    if (item.proposed_action === 'no_action') return item
    if (allowed.has(index) && item.proposed_action === 'resume') {
      resumeCount += 1
      if (resumeCount > settings.max_resume_per_day) {
        return {
          ...item,
          proposed_action: 'no_action',
          proposed_reason: 'Giữ nguyên vì đã chạm giới hạn bật lại campaign trong ngày.',
          blocked_reason: 'giới hạn bật lại'
        }
      }
    }
    if (allowed.has(index)) return item
    return {
      ...item,
      proposed_action: 'no_action',
      proposed_reason: 'Giữ nguyên vì đã chạm giới hạn số campaign thay đổi trong một lần chạy.',
      blocked_reason: 'giới hạn lần chạy'
    }
  })
}

export function evaluateAdsCampaigns(input = {}) {
  const settings = normalizeSettings(input.settings || {})
  const decisionMap = mapDecisionRows(input.read_model || [])
  const rows = Array.isArray(input.campaigns) ? input.campaigns : []
  const results = rows.map(row => classifyCampaign(row, pickDecision(row, decisionMap), settings))
  return applyRunLimit(results, settings)
}

export const ADS_EVALUATION_TEST_ONLY = {
  normalizeSettings,
  classifyCampaign,
  applyRunLimit,
  campaignBudget
}
