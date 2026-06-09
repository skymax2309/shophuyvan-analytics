import { evaluateAdsCampaigns } from '../ads/evaluation-engine.js'
import { executeAdsAutomationActions, recordAdsAutomationSystemLog } from '../ads/automation-executor.js'
import { ensureAdsCampaignGuardTable } from '../core/ads/campaign-guard-core.js'
import { ensureRealAdsTables } from '../routes/ads/dashboard-metrics.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function numberValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
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

function extractItemIds(row = {}) {
  const raw = parseJson(row.raw_data, {})
  const ids = []
  const visit = value => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value.item_id_list)) ids.push(...value.item_id_list)
    if (value.item_id !== undefined) ids.push(value.item_id)
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') visit(child)
    }
  }
  visit(raw)
  return [...new Set(ids.map(cleanText).filter(Boolean))]
}

function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(',')
}

function nowText() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

async function tableColumnSet(env, table) {
  try {
    const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
    return new Set((results || []).map(row => cleanText(row.name)))
  } catch {
    return new Set()
  }
}

async function addColumnIfMissing(env, table, column, ddl) {
  const columns = await tableColumnSet(env, table)
  if (!columns.has(column)) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run()
}

export async function ensureAdsAutomationSchema(env) {
  await ensureRealAdsTables(env)
  await ensureAdsCampaignGuardTable(env)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ads_automation_settings (
      setting_key TEXT PRIMARY KEY,
      setting_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT ''
    )
  `).run()
  await addColumnIfMissing(env, 'ads_automation_settings', 'shop_key', "shop_key TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'ads_automation_settings', 'auto_enabled', 'auto_enabled INTEGER DEFAULT 0')
  await addColumnIfMissing(env, 'ads_automation_settings', 'emergency_stop', 'emergency_stop INTEGER DEFAULT 0')
  await addColumnIfMissing(env, 'ads_automation_settings', 'time_windows', "time_windows TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'ads_automation_settings', 'dry_run_mode', 'dry_run_mode INTEGER DEFAULT 1')
  await addColumnIfMissing(env, 'ads_automation_settings', 'max_campaigns_per_run', 'max_campaigns_per_run INTEGER DEFAULT 10')
  await addColumnIfMissing(env, 'ads_automation_settings', 'max_budget_increase_pct', 'max_budget_increase_pct REAL DEFAULT 30.0')
  await addColumnIfMissing(env, 'ads_automation_settings', 'max_budget_decrease_pct', 'max_budget_decrease_pct REAL DEFAULT 30.0')
  await addColumnIfMissing(env, 'ads_automation_settings', 'require_admin_confirm_above_pct', 'require_admin_confirm_above_pct REAL DEFAULT 50.0')
}

function normalizeTimeWindows(settings = {}) {
  const explicit = parseJson(settings.time_windows, settings.time_windows)
  if (Array.isArray(explicit) && explicit.length) return explicit
  const schedules = Array.isArray(settings.schedules) ? settings.schedules : []
  return schedules
    .filter(row => row && row.enabled !== false)
    .map(row => {
      const start = cleanText(row.from || '00:00')
      const end = cleanText(row.to || '23:59')
      return {
        days: Array.isArray(row.days) && row.days.length ? row.days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
        start_hour: numberValue(start.slice(0, 2), 0) + numberValue(start.slice(3, 5), 0) / 60,
        end_hour: numberValue(end.slice(0, 2), 23) + numberValue(end.slice(3, 5), 59) / 60
      }
    })
}

function isInsideTimeWindow(settings = {}, now = new Date(Date.now() + 7 * 60 * 60 * 1000)) {
  const windows = normalizeTimeWindows(settings)
  if (!windows.length) return { ok: false, reason: 'outside_time_window' }
  const day = now.getUTCDay()
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60
  const matched = windows.find(row => {
    const days = Array.isArray(row.days) && row.days.length ? row.days.map(Number) : [0, 1, 2, 3, 4, 5, 6]
    return days.includes(day) && numberValue(row.start_hour, 0) <= hour && hour <= numberValue(row.end_hour, 24)
  })
  return matched ? { ok: true, reason: '' } : { ok: false, reason: 'outside_time_window' }
}

function normalizeSettingsRow(row = {}) {
  const json = parseJson(row.setting_json, {})
  return {
    ...json,
    setting_key: cleanText(row.setting_key || json.setting_key || 'default'),
    shop_key: cleanText(row.shop_key || json.shop_key || json.shop || ''),
    automation_enabled: row.auto_enabled !== undefined && row.auto_enabled !== null
      ? Number(row.auto_enabled) === 1
      : Boolean(json.automation_enabled || json.auto_enabled),
    auto_enabled: row.auto_enabled !== undefined && row.auto_enabled !== null
      ? Number(row.auto_enabled) === 1
      : Boolean(json.automation_enabled || json.auto_enabled),
    emergency_stop: row.emergency_stop !== undefined && row.emergency_stop !== null
      ? Number(row.emergency_stop) === 1
      : Boolean(json.emergency_stop),
    time_windows: row.time_windows || json.time_windows || normalizeTimeWindows(json),
    dry_run_mode: row.dry_run_mode !== undefined && row.dry_run_mode !== null ? Number(row.dry_run_mode) === 1 : json.dry_run_mode !== 0,
    max_campaigns_per_run: numberValue(row.max_campaigns_per_run ?? json.max_campaigns_per_run, 10),
    max_budget_increase_pct: numberValue(row.max_budget_increase_pct ?? json.max_budget_increase_pct ?? json.good_budget_increase_percent, 30),
    max_budget_decrease_pct: numberValue(row.max_budget_decrease_pct ?? json.max_budget_decrease_pct ?? json.medium_budget_decrease_percent, 30),
    require_admin_confirm_above_pct: numberValue(row.require_admin_confirm_above_pct ?? json.require_admin_confirm_above_pct, 50)
  }
}

export async function loadEnabledAdsAutomationSettings(env, options = {}) {
  await ensureAdsAutomationSchema(env)
  const { results } = await env.DB.prepare(`
    SELECT setting_key, setting_json, updated_at, shop_key, auto_enabled, emergency_stop,
           time_windows, dry_run_mode, max_campaigns_per_run, max_budget_increase_pct,
           max_budget_decrease_pct, require_admin_confirm_above_pct
    FROM ads_automation_settings
  `).all()
  const rows = (results || []).map(normalizeSettingsRow)
  if (options.include_disabled) return rows
  return rows.filter(row => row.auto_enabled || row.automation_enabled)
}

async function loadCampaignRows(env, settings = {}) {
  const shop = cleanText(settings.shop_key)
  const conds = []
  const params = []
  if (shop) {
    conds.push('LOWER(shop) = LOWER(?)')
    params.push(shop)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(`
    SELECT platform, shop AS shop_key, campaign_id, campaign_name, campaign_type, product_sku,
           product_name, status, raw_data,
           COUNT(DISTINCT snapshot_date) AS metric_days,
           MAX(updated_at) AS last_synced_at,
           SUM(spend) AS spend,
           SUM(revenue) AS revenue,
           AVG(roas) AS roas,
           AVG(acos) AS acos
    FROM marketplace_ads_campaign_snapshots
    ${where}
    GROUP BY platform, shop, campaign_id, COALESCE(product_sku, '')
    ORDER BY spend DESC, last_synced_at DESC
    LIMIT 200
  `).bind(...params).all()
  return results || []
}

async function loadDecisionReadModel(env, settings = {}) {
  const shop = cleanText(settings.shop_key)
  const conds = []
  const params = []
  if (shop) {
    conds.push('LOWER(shop_key) = LOWER(?)')
    params.push(shop)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(`
    SELECT sku_id, platform, shop_key, product_name, image_url, current_stock, current_cost,
           spend, ads_revenue, profit_after_ads, roas, acos, recommendation,
           recommendation_reason, data_status, action_status, last_synced_at
    FROM ads_decision_read_model
    ${where}
    ORDER BY last_synced_at DESC
    LIMIT 1000
  `).bind(...params).all()
  return results || []
}

async function loadProductCoreReadModel(env, campaigns = []) {
  const itemIds = [...new Set(campaigns.flatMap(extractItemIds))].slice(0, 300)
  if (!itemIds.length) return []
  const variations = []
  for (let i = 0; i < itemIds.length; i += 80) {
    const chunk = itemIds.slice(i, i + 80)
    const { results } = await env.DB.prepare(`
      SELECT platform, shop, platform_item_id, platform_sku, internal_sku, product_name,
             stock, warehouse_stock, channel_stock, image_url
      FROM product_variations
      WHERE platform_item_id IN (${placeholders(chunk.length)})
    `).bind(...chunk).all()
    variations.push(...(results || []))
  }
  const skus = [...new Set(variations.flatMap(row => [row.internal_sku, row.platform_sku]).map(cleanText).filter(Boolean))].slice(0, 300)
  const products = []
  for (let i = 0; i < skus.length; i += 80) {
    const chunk = skus.slice(i, i + 80)
    const { results } = await env.DB.prepare(`
      SELECT sku, product_name, cost_real, cost_invoice, stock, stock_main, image_url
      FROM products
      WHERE sku IN (${placeholders(chunk.length)})
    `).bind(...chunk).all()
    products.push(...(results || []))
  }
  const variationByItem = new Map(variations.map(row => [cleanText(row.platform_item_id), row]))
  const productBySku = new Map(products.map(row => [cleanText(row.sku).toLowerCase(), row]))
  const rows = []
  for (const campaign of campaigns) {
    const ids = extractItemIds(campaign)
    const variation = ids.map(id => variationByItem.get(id)).find(Boolean)
    if (!variation) continue
    const sku = cleanText(variation.internal_sku || variation.platform_sku)
    const product = productBySku.get(sku.toLowerCase()) || {}
    const cost = product.cost_real ?? product.cost_invoice
    const stock = variation.warehouse_stock ?? variation.stock ?? product.stock_main ?? product.stock
    rows.push({
      campaign_id: cleanText(campaign.campaign_id),
      sku_id: cleanText(campaign.campaign_id),
      internal_sku: sku,
      platform: cleanText(campaign.platform || variation.platform),
      shop_key: cleanText(campaign.shop_key || variation.shop),
      product_name: cleanText(product.product_name || variation.product_name || campaign.product_name),
      image_url: cleanText(product.image_url || variation.image_url),
      current_stock: stock,
      current_cost: cost,
      profit_after_ads: null
    })
  }
  return rows
}

export async function runAdsAutomationForSettings(env, settings = {}, options = {}) {
  const shopKey = cleanText(settings.shop_key || settings.shop || 'all')
  const summary = {
    shop_key: shopKey,
    campaigns_evaluated: 0,
    actions_executed: 0,
    actions_skipped: 0,
    errors: 0,
    status: 'ok'
  }
  if (settings.emergency_stop) {
    summary.status = 'skipped'
    summary.reason = 'emergency_stop_active'
    await recordAdsAutomationSystemLog(env, {
      shop_key: shopKey,
      status: 'skipped',
      action_type: 'automation_cron_skip',
      user_facing_result: 'Tự động ADS đang tắt khẩn cấp.',
      response_payload: summary
    })
    return { ...summary, evaluations: [], action_results: [] }
  }
  if (!options.ignoreTimeWindow) {
    const windowCheck = isInsideTimeWindow(settings)
    if (!windowCheck.ok) {
      summary.status = 'skipped'
      summary.reason = windowCheck.reason
      await recordAdsAutomationSystemLog(env, {
        shop_key: shopKey,
        status: 'skipped',
        action_type: 'automation_cron_skip',
        user_facing_result: 'Ngoài khung giờ tự động ADS.',
        response_payload: summary
      })
      return { ...summary, evaluations: [], action_results: [] }
    }
  }
  const campaigns = await loadCampaignRows(env, settings)
  const readModel = [
    ...await loadDecisionReadModel(env, settings),
    ...await loadProductCoreReadModel(env, campaigns)
  ]
  const evaluations = evaluateAdsCampaigns({
    shop_key: shopKey,
    settings,
    campaigns,
    read_model: readModel
  })
  const actionResults = await executeAdsAutomationActions(env, evaluations, {
    dry_run_mode: settings.dry_run_mode !== false && settings.dry_run_mode !== 0
  })
  summary.campaigns_evaluated = evaluations.length
  summary.actions_executed = actionResults.filter(row => ['success', 'sàn_chưa_xác_nhận'].includes(row.status)).length
  summary.actions_skipped = actionResults.filter(row => !['success', 'sàn_chưa_xác_nhận'].includes(row.status)).length
  summary.errors = actionResults.filter(row => row.status === 'error').length
  summary.status = settings.dry_run_mode === false || settings.dry_run_mode === 0 ? 'ok' : 'dry_run'
  await recordAdsAutomationSystemLog(env, {
    shop_key: shopKey,
    status: summary.status,
    action_type: 'automation_run_summary',
    user_facing_result: `Đã đánh giá ${summary.campaigns_evaluated} campaign ADS.`,
    response_payload: summary
  })
  return { ...summary, evaluations, action_results: actionResults }
}

export async function runAdsAutomationCron(env, options = {}) {
  await ensureAdsAutomationSchema(env)
  const settingsRows = await loadEnabledAdsAutomationSettings(env)
  const summary = {
    started_at: nowText(),
    shops_processed: 0,
    campaigns_evaluated: 0,
    actions_executed: 0,
    actions_skipped: 0,
    errors: 0,
    shops: []
  }
  for (const settings of settingsRows) {
    summary.shops_processed += 1
    try {
      const result = await runAdsAutomationForSettings(env, settings, options)
      summary.campaigns_evaluated += result.campaigns_evaluated || 0
      summary.actions_executed += result.actions_executed || 0
      summary.actions_skipped += result.actions_skipped || 0
      summary.errors += result.errors || 0
      summary.shops.push({
        shop_key: result.shop_key,
        status: result.status,
        campaigns_evaluated: result.campaigns_evaluated,
        actions_executed: result.actions_executed,
        actions_skipped: result.actions_skipped,
        reason: result.reason || ''
      })
    } catch (error) {
      summary.errors += 1
      summary.shops.push({ shop_key: cleanText(settings.shop_key || 'all'), status: 'error', error: error?.message || String(error) })
    }
  }
  await recordAdsAutomationSystemLog(env, {
    status: summary.errors ? 'error' : 'ok',
    action_type: 'automation_cron_summary',
    user_facing_result: `Cron ADS đã xử lý ${summary.shops_processed} shop.`,
    response_payload: summary
  })
  return summary
}

export const ADS_AUTOMATION_CRON_TEST_ONLY = {
  normalizeTimeWindows,
  isInsideTimeWindow,
  normalizeSettingsRow
}
