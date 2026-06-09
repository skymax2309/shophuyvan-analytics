import assert from 'node:assert/strict'
import { evaluateAdsCampaigns, ADS_EVALUATION_TEST_ONLY } from '../apps/worker-api/src/ads/evaluation-engine.js'
import { ADS_EXECUTOR_TEST_ONLY } from '../apps/worker-api/src/ads/automation-executor.js'
import { ADS_AUTOMATION_CRON_TEST_ONLY } from '../apps/worker-api/src/cron/ads-automation.js'

const baseSettings = {
  roas_target: 4,
  roas_min: 2,
  acos_max: 40,
  stock_min: 10,
  max_campaigns_per_run: 3,
  max_budget_increase_pct: 30,
  max_budget_decrease_pct: 30,
  budget_max: 200000,
  require_admin_confirm_above_pct: 50
}

const campaign = overrides => ({
  platform: 'shopee',
  shop_key: 'chihuy1984',
  campaign_id: overrides.campaign_id || '1001',
  campaign_name: overrides.campaign_name || 'Sample ADS',
  campaign_type: overrides.campaign_type || 'manual_product_ads',
  status: overrides.status || 'running',
  raw_data: JSON.stringify({ common_info: { campaign_budget: overrides.budget ?? 100000, campaign_status: overrides.status || 'running' } }),
  metric_days: overrides.metric_days ?? 7,
  spend: overrides.spend ?? 10000,
  revenue: overrides.revenue ?? 60000,
  roas: overrides.roas ?? 6,
  acos: overrides.acos ?? 16,
  product_sku: overrides.sku_id || 'SKU1',
  ...overrides
})

const decision = overrides => ({
  sku_id: overrides.sku_id || 'SKU1',
  platform: 'shopee',
  shop_key: 'chihuy1984',
  current_stock: overrides.current_stock ?? 40,
  current_cost: overrides.current_cost ?? 10000,
  profit_after_ads: overrides.profit_after_ads ?? 20000,
  ...overrides
})

{
  const [row] = evaluateAdsCampaigns({
    settings: baseSettings,
    campaigns: [campaign({})],
    read_model: [decision({})]
  })
  assert.equal(row.classification, 'hiệu_quả')
  assert.equal(row.proposed_action, 'increase_budget')
  assert.equal(row.after_value, 130000)
}

{
  const [row] = evaluateAdsCampaigns({
    settings: baseSettings,
    campaigns: [campaign({ roas: 1, revenue: 1000 })],
    read_model: [decision({ profit_after_ads: -5000 })]
  })
  assert.equal(row.classification, 'không_hiệu_quả')
  assert.equal(row.proposed_action, 'pause')
}

{
  const [row] = evaluateAdsCampaigns({
    settings: baseSettings,
    campaigns: [campaign({ metric_days: 1 })],
    read_model: [decision({})]
  })
  assert.equal(row.classification, 'thiếu_dữ_liệu')
  assert.equal(row.proposed_action, 'no_action')
}

{
  const [row] = evaluateAdsCampaigns({
    settings: { ...baseSettings, auto_resume_enabled: true, resume_roas_multiplier: 1.3, resume_stock_multiplier: 2 },
    campaigns: [campaign({ status: 'paused', roas: 6 })],
    read_model: [decision({ current_stock: 40 })]
  })
  assert.equal(row.proposed_action, 'resume')
}

{
  const [row] = evaluateAdsCampaigns({
    settings: { ...baseSettings, auto_resume_enabled: false },
    campaigns: [campaign({ status: 'paused', roas: 6 })],
    read_model: [decision({ current_stock: 40 })]
  })
  assert.equal(row.proposed_action, 'no_action')
}

{
  const [row] = evaluateAdsCampaigns({
    settings: baseSettings,
    campaigns: [campaign({})],
    read_model: [decision({ current_cost: null })]
  })
  assert.equal(row.proposed_reason, 'Chưa có giá vốn.')
}

{
  const rows = Array.from({ length: 10 }, (_, index) => campaign({ campaign_id: String(2000 + index), sku_id: `SKU${index}`, roas: index + 5 }))
  const decisions = rows.map((row, index) => decision({ sku_id: `SKU${index}` }))
  const result = evaluateAdsCampaigns({ settings: baseSettings, campaigns: rows, read_model: decisions })
  assert.equal(result.filter(row => row.proposed_action !== 'no_action').length, 3)
  assert.equal(result.filter(row => row.blocked_reason === 'giới hạn lần chạy').length, 6)
}

{
  const [row] = evaluateAdsCampaigns({
    settings: { ...baseSettings, budget_max: 110000, max_budget_increase_pct: 80, require_admin_confirm_above_pct: 50 },
    campaigns: [campaign({ budget: 100000 })],
    read_model: [decision({})]
  })
  assert.equal(row.after_value, 110000)
  assert.equal(row.requires_admin_confirm, false)
}

{
  const [row] = evaluateAdsCampaigns({
    settings: { ...baseSettings, max_budget_increase_pct: 60, require_admin_confirm_above_pct: 50 },
    campaigns: [campaign({ budget: 100000 })],
    read_model: [decision({})]
  })
  assert.equal(row.requires_admin_confirm, true)
}

{
  const outside = ADS_AUTOMATION_CRON_TEST_ONLY.isInsideTimeWindow({
    time_windows: [{ days: [1], start_hour: 8, end_hour: 9 }]
  }, new Date(Date.UTC(2026, 4, 26, 10, 0, 0)))
  assert.equal(outside.ok, false)
}

assert.equal(ADS_EXECUTOR_TEST_ONLY.capabilityAction('increase_budget'), 'change_budget')
assert.equal(ADS_EXECUTOR_TEST_ONLY.shopeeEditAction('decrease_budget'), 'change_budget')
assert.equal(ADS_EVALUATION_TEST_ONLY.campaignBudget(campaign({ budget: 123000 })), 123000)

console.log('ADS automation engine tests passed')
