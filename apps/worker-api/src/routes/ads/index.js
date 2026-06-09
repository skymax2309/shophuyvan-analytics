import {
  ensureShopeeAffiliatePerformanceTable,
  ensureShopeeOpenCampaignPerformanceTable,
  createShopeeAutoProductAds,
  editShopeeAutoProductAds,
  editShopeeManualProductAds,
  editShopeeManualProductAdKeywords,
  fetchShopeeCreateProductAdBudgetSuggestion,
  fetchShopeeProductLevelCampaignIdList,
  fetchShopeeProductLevelCampaignSettingInfo,
  fetchShopeeProductRecommendedRoiTarget,
  fetchShopeeAdsBalances,
  fetchShopeeAdsToggleInfo,
  probeShopeeAdsApi,
  syncAdsCampaignSnapshots,
  syncApiOrders,
  syncApiOrderStatuses,
  syncShopeeAffiliatePerformance,
  syncShopeeOpenCampaignPerformance
} from '../api/index.js'
import {
  ADS_GUARD_CONFIRM_PHRASE,
  buildAdsCampaignGuardOverview,
  ensureAdsCampaignGuardTable,
  listAdsCampaignGuardLogs,
  runAdsCampaignGuard
} from '../../core/ads/campaign-guard-core.js'
import { ensureAdsAutomationSchema, runAdsAutomationForSettings } from '../../cron/ads-automation.js'
import { executeAdsAutomationActions } from '../../ads/automation-executor.js'
import { cleanText } from './dashboard-metrics.js'
import { handleAdsExtraRoutes } from './extra-routes.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function adsNowIso() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function ensureAdsAutomationSettingsTable(env) {
  await ensureAdsAutomationSchema(env)
}

function defaultAdsAutomationSettings() {
  return {
    automation_enabled: false,
    emergency_stop: false,
    dry_run_mode: 1,
    max_campaigns_per_run: '10',
    max_budget_increase_pct: '30',
    max_budget_decrease_pct: '30',
    require_admin_confirm_above_pct: '50',
    roas_target: '5.0',
    good_roas: '5.0',
    minimum_roas: '2.5',
    minimum_ads_spend: '50000',
    minimum_stock_for_budget: '30',
    require_cost_for_budget: true,
    require_positive_profit_for_budget: true,
    good_budget_increase_percent: '10',
    max_budget_increase_per_day: '2',
    max_campaign_daily_budget: '300000',
    max_shop_daily_budget: '2000000',
    auto_resume_enabled: true,
    resume_roas_multiplier: '1.3',
    resume_stock_multiplier: '2',
    max_resume_per_day: '2',
    schedules: [
      { id: 'morning', from: '08:00', to: '11:30', enabled: true },
      { id: 'evening', from: '19:00', to: '22:30', enabled: true }
    ]
  }
}

async function loadAdsAutomationSettings(env) {
  await ensureAdsAutomationSettingsTable(env)
  const row = await env.DB.prepare(`
    SELECT setting_json, updated_at, shop_key, auto_enabled, emergency_stop, time_windows,
           dry_run_mode, max_campaigns_per_run, max_budget_increase_pct,
           max_budget_decrease_pct, require_admin_confirm_above_pct
    FROM ads_automation_settings
    WHERE setting_key = ?
  `).bind('default').first()
  const jsonSettings = parseJson(row?.setting_json, {})
  const hasSavedRoasTarget = Object.prototype.hasOwnProperty.call(jsonSettings, 'roas_target')
  const roasTarget = hasSavedRoasTarget
    ? jsonSettings.roas_target
    : (jsonSettings.good_roas || defaultAdsAutomationSettings().roas_target)
  return {
    status: 'ok',
    settings: {
      ...defaultAdsAutomationSettings(),
      ...jsonSettings,
      roas_target: roasTarget,
      shop_key: row?.shop_key || jsonSettings.shop_key || '',
      automation_enabled: row?.auto_enabled !== undefined && row?.auto_enabled !== null ? Number(row.auto_enabled) === 1 : Boolean(jsonSettings.automation_enabled),
      emergency_stop: row?.emergency_stop !== undefined && row?.emergency_stop !== null ? Number(row.emergency_stop) === 1 : Boolean(jsonSettings.emergency_stop),
      time_windows: row?.time_windows || jsonSettings.time_windows || '',
      dry_run_mode: row?.dry_run_mode !== undefined && row?.dry_run_mode !== null ? Number(row.dry_run_mode) : (jsonSettings.dry_run_mode ?? 1),
      max_campaigns_per_run: row?.max_campaigns_per_run ?? jsonSettings.max_campaigns_per_run ?? '10',
      max_budget_increase_pct: row?.max_budget_increase_pct ?? jsonSettings.max_budget_increase_pct ?? jsonSettings.good_budget_increase_percent ?? '30',
      max_budget_decrease_pct: row?.max_budget_decrease_pct ?? jsonSettings.max_budget_decrease_pct ?? jsonSettings.medium_budget_decrease_percent ?? '30',
      require_admin_confirm_above_pct: row?.require_admin_confirm_above_pct ?? jsonSettings.require_admin_confirm_above_pct ?? '50'
    },
    updated_at: row?.updated_at || ''
  }
}

async function saveAdsAutomationSettings(env, settings = {}) {
  await ensureAdsAutomationSettingsTable(env)
  const next = { ...defaultAdsAutomationSettings(), ...(settings && typeof settings === 'object' ? settings : {}) }
  if (!Object.prototype.hasOwnProperty.call(settings || {}, 'roas_target') && next.good_roas) next.roas_target = next.good_roas
  if (!next.good_roas && next.roas_target) next.good_roas = next.roas_target
  const now = adsNowIso()
  await env.DB.prepare(`
    INSERT INTO ads_automation_settings (
      setting_key, setting_json, updated_at, shop_key, auto_enabled, emergency_stop, time_windows,
      dry_run_mode, max_campaigns_per_run, max_budget_increase_pct, max_budget_decrease_pct,
      require_admin_confirm_above_pct
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_json = excluded.setting_json,
      updated_at = excluded.updated_at,
      shop_key = excluded.shop_key,
      auto_enabled = excluded.auto_enabled,
      emergency_stop = excluded.emergency_stop,
      time_windows = excluded.time_windows,
      dry_run_mode = excluded.dry_run_mode,
      max_campaigns_per_run = excluded.max_campaigns_per_run,
      max_budget_increase_pct = excluded.max_budget_increase_pct,
      max_budget_decrease_pct = excluded.max_budget_decrease_pct,
      require_admin_confirm_above_pct = excluded.require_admin_confirm_above_pct
  `).bind(
    'default',
    JSON.stringify(next),
    now,
    cleanText(next.shop_key || next.shop || ''),
    next.automation_enabled || next.auto_enabled ? 1 : 0,
    next.emergency_stop ? 1 : 0,
    typeof next.time_windows === 'string' ? next.time_windows : JSON.stringify(next.time_windows || []),
    Number(next.dry_run_mode ?? 1) === 0 ? 0 : 1,
    Number(next.max_campaigns_per_run || 10) || 10,
    Number(next.max_budget_increase_pct || next.good_budget_increase_percent || 30) || 30,
    Number(next.max_budget_decrease_pct || next.medium_budget_decrease_percent || 30) || 30,
    Number(next.require_admin_confirm_above_pct || 50) || 50
  ).run()
  return { status: 'ok', settings: next, updated_at: now, message: 'Đã lưu luật tự động ADS.' }
}

function activeWindowOk(settings = {}) {
  const rows = Array.isArray(settings.schedules) ? settings.schedules.filter(row => row && row.enabled !== false) : []
  if (!rows.length) return { ok: false, reason: 'Chưa có khung giờ tự động đang bật.' }
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const matched = rows.find(row => row.from && row.to && row.from < row.to && row.from <= current && current <= row.to)
  return matched ? { ok: true, reason: `Đang trong khung ${matched.from}-${matched.to}.` } : { ok: false, reason: 'Ngoài khung giờ tự động.' }
}

async function recordAdsAutomationLog(env, entry = {}) {
  await ensureAdsCampaignGuardTable(env)
  await env.DB.prepare(`
    INSERT INTO ads_action_logs (
      platform, shop_key, action_type, target_type, campaign_id,
      proposed_payload, response_payload, user_facing_result,
      status, error_message, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.platform || 'all',
    entry.shop || 'all',
    entry.action_type || 'automation_check',
    entry.target_type || 'shop',
    entry.campaign_id || '',
    JSON.stringify(entry.proposed_payload || {}),
    JSON.stringify(entry.response_payload || {}),
    entry.user_facing_result || '',
    entry.status || 'ok',
    entry.error_message || '',
    'ads_auto_rule',
    adsNowIso()
  ).run()
}

async function runAdsAutomationNow(env, options = {}) {
  const saved = await saveAdsAutomationSettings(env, {
    ...(options.settings || {}),
    shop_key: options.shop || options.settings?.shop_key || options.settings?.shop || ''
  })
  const settings = saved.settings
  if (settings.emergency_stop || !settings.automation_enabled) {
    const message = settings.emergency_stop ? 'Tự động ADS đang tắt khẩn cấp.' : 'Tự động ADS đang tắt, chỉ lưu luật và theo dõi.'
    const blockedResult = { status: 'blocked', message, readback_ok: true, live_write_sent: false }
    await recordAdsAutomationLog(env, {
      platform: options.platform || 'all',
      shop: options.shop || 'all',
      action_type: 'automation_check',
      proposed_payload: settings,
      response_payload: blockedResult,
      user_facing_result: message,
      status: 'blocked',
      error_message: message
    })
    return blockedResult
  }
  const automationResult = await runAdsAutomationForSettings(env, settings, { ignoreTimeWindow: true })
  const { evaluations, action_results, ...publicAutomationResult } = automationResult
  return {
    status: automationResult.status === 'dry_run' ? 'ok' : automationResult.status,
    message: `Đã đánh giá ${automationResult.campaigns_evaluated || 0} campaign ADS, ${automationResult.actions_executed || 0} thao tác gửi sàn/readback, ${automationResult.actions_skipped || 0} thao tác giữ nguyên hoặc chờ.`,
    readback_ok: automationResult.errors === 0,
    live_write_sent: (automationResult.actions_executed || 0) > 0 && Number(settings.dry_run_mode) === 0,
    ...publicAutomationResult
  }
  const windowCheck = activeWindowOk(settings)
  let status = 'ok'
  let message = 'Đã kiểm tra luật tự động ADS. Chưa có thao tác cần gửi lên sàn trong lượt này.'
  if (settings.emergency_stop || !settings.automation_enabled) {
    status = 'blocked'
    message = settings.emergency_stop ? 'Tự động ADS đang tắt khẩn cấp.' : 'Tự động ADS đang tắt, chỉ lưu luật và theo dõi.'
  } else if (!windowCheck.ok) {
    status = 'blocked'
    message = windowCheck.reason
  }
  const result = {
    status,
    message,
    readback_ok: true,
    live_write_sent: false,
    safety: {
      max_budget_increase_per_day: settings.max_budget_increase_per_day,
      max_resume_per_day: settings.max_resume_per_day,
      max_campaign_daily_budget: settings.max_campaign_daily_budget,
      max_shop_daily_budget: settings.max_shop_daily_budget
    }
  }
  await recordAdsAutomationLog(env, {
    platform: options.platform || 'all',
    shop: options.shop || 'all',
    action_type: 'automation_check',
    proposed_payload: settings,
    response_payload: result,
    user_facing_result: message,
    status: status === 'ok' ? 'ok' : 'blocked',
    error_message: status === 'ok' ? '' : message
  })
  return result
}

function publicAdsLogRow(row = {}) {
  return {
    action_id: row.action_id,
    platform: row.platform,
    shop_key: row.shop_key,
    action_type: row.action_type,
    target_type: row.target_type,
    campaign_id: row.campaign_id,
    adgroup_id: row.adgroup_id,
    sku_id: row.sku_id,
    user_facing_result: row.user_facing_result,
    status: row.status,
    error_message: row.error_message,
    created_by: row.created_by,
    created_at: row.created_at,
    applied_at: row.applied_at,
    readback_at: row.readback_at
  }
}

async function listAutomationLogs(env, url) {
  await ensureAdsCampaignGuardTable(env)
  const filter = cleanText(url.searchParams.get('filter_type')).toLowerCase()
  const from = cleanText(url.searchParams.get('from_date'))
  const to = cleanText(url.searchParams.get('to_date'))
  const page = Math.max(Number(url.searchParams.get('page') || 1) || 1, 1)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30) || 30, 1), 100)
  const offset = (page - 1) * limit
  const conds = []
  const params = []
  if (filter === 'auto') conds.push("created_by = 'automation_cron'")
  if (filter === 'manual') conds.push("created_by <> 'automation_cron'")
  if (filter === 'pending') conds.push("status = 'pending_admin_confirm'")
  if (filter === 'error') conds.push("status IN ('error', 'sàn_chưa_xác_nhận', 'capability_blocked')")
  if (from) {
    conds.push('date(created_at) >= date(?)')
    params.push(from)
  }
  if (to) {
    conds.push('date(created_at) <= date(?)')
    params.push(to)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(`
    SELECT action_id, platform, shop_key, action_type, target_type, campaign_id, adgroup_id, sku_id,
           user_facing_result, status, error_message, created_by, created_at, applied_at, readback_at
    FROM ads_action_logs
    ${where}
    ORDER BY action_id DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all()
  return { status: 'ok', page, limit, rows: (results || []).map(publicAdsLogRow) }
}

async function lastAutomationRunSummary(env) {
  await ensureAdsCampaignGuardTable(env)
  const row = await env.DB.prepare(`
    SELECT action_id, platform, shop_key, action_type, user_facing_result, status,
           response_payload, created_by, created_at
    FROM ads_action_logs
    WHERE action_type IN ('automation_run_summary', 'automation_cron_summary')
    ORDER BY action_id DESC
    LIMIT 1
  `).first()
  const payload = parseJson(row?.response_payload, {})
  return {
    status: 'ok',
    last_run: row ? {
      action_id: row.action_id,
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at,
      user_facing_result: row.user_facing_result,
      shops_processed: payload.shops_processed || payload.shops?.length || 0,
      campaigns_evaluated: payload.campaigns_evaluated || 0,
      actions_executed: payload.actions_executed || 0,
      actions_skipped: payload.actions_skipped || 0,
      errors: payload.errors || 0
    } : null
  }
}

async function listPendingConfirms(env) {
  await ensureAdsCampaignGuardTable(env)
  const { results } = await env.DB.prepare(`
    SELECT action_id, platform, shop_key, action_type, target_type, campaign_id, adgroup_id, sku_id,
           user_facing_result, status, error_message, created_by, created_at, applied_at, readback_at
    FROM ads_action_logs
    WHERE status = 'pending_admin_confirm'
    ORDER BY action_id DESC
    LIMIT 100
  `).all()
  return { status: 'ok', rows: (results || []).map(publicAdsLogRow) }
}

async function confirmAutomationAction(env, body = {}) {
  await ensureAdsCampaignGuardTable(env)
  const actionId = Number(body.action_id || body.actionId || 0)
  const decision = cleanText(body.decision).toLowerCase()
  if (!actionId || !['approve', 'reject'].includes(decision)) {
    return { status: 'error', message: 'Thiếu thao tác hoặc quyết định duyệt.' }
  }
  const row = await env.DB.prepare('SELECT * FROM ads_action_logs WHERE action_id = ?').bind(actionId).first()
  if (!row || row.status !== 'pending_admin_confirm') {
    return { status: 'error', message: 'Không tìm thấy thao tác đang chờ duyệt.' }
  }
  if (decision === 'reject') {
    await env.DB.prepare(`
      UPDATE ads_action_logs
      SET status = 'rejected_by_admin', error_message = ?, readback_at = ?
      WHERE action_id = ?
    `).bind('Người vận hành đã từ chối thao tác tự động.', adsNowIso(), actionId).run()
    return { status: 'ok', message: 'Đã từ chối thao tác.', action_id: actionId }
  }
  const proposed = parseJson(row.proposed_payload, {})
  proposed.requires_admin_confirm = false
  const results = await executeAdsAutomationActions(env, [proposed], { dry_run_mode: false })
  await env.DB.prepare(`
    UPDATE ads_action_logs
    SET status = 'approved_by_admin', readback_at = ?
    WHERE action_id = ?
  `).bind(adsNowIso(), actionId).run()
  return { status: 'ok', message: 'Đã duyệt và gửi thao tác.', action_id: actionId, result: results[0] ? publicAdsLogRow({ ...row, status: results[0].status }) : null }
}

export async function handleAds(request, env, cors) {
  const url = new URL(request.url)
  if (url.pathname === '/api/ads/automation/settings') {
    if (request.method === 'GET') return json(await loadAdsAutomationSettings(env), cors)
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await saveAdsAutomationSettings(env, body.settings || body), cors)
    }
    return json({ error: 'Method not allowed' }, cors, 405)
  }

  if (url.pathname === '/api/ads/automation/run-now') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
    const body = await request.json().catch(() => ({}))
    return json(await runAdsAutomationNow(env, body), cors)
  }

  if (url.pathname === '/api/ads/automation/emergency-stop') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
    const body = await request.json().catch(() => ({}))
    const saved = await saveAdsAutomationSettings(env, { ...(body.settings || {}), automation_enabled: false, emergency_stop: true })
    const message = 'Đã tắt khẩn cấp toàn bộ tự động ADS.'
    await recordAdsAutomationLog(env, {
      action_type: 'automation_emergency_stop',
      proposed_payload: saved.settings,
      response_payload: { status: 'ok', message },
      user_facing_result: message,
      status: 'ok'
    })
    return json({ ...saved, message }, cors)
  }

  if (url.pathname === '/api/ads/automation/pending-confirms') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, cors, 405)
    return json(await listPendingConfirms(env), cors)
  }

  if (url.pathname === '/api/ads/automation/confirm-action') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, cors, 405)
    const body = await request.json().catch(() => ({}))
    return json(await confirmAutomationAction(env, body), cors)
  }

  if (url.pathname === '/api/ads/automation/last-run-summary') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, cors, 405)
    return json(await lastAutomationRunSummary(env), cors)
  }

  if (url.pathname === '/api/ads/automation/logs') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, cors, 405)
    return json(await listAutomationLogs(env, url), cors)
  }

  if (url.pathname === '/api/ads/sync-campaigns') {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, cors, 405)
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch {}
    }
    const options = {
      platform: body.platform || url.searchParams.get('platform'),
      shop: body.shop || url.searchParams.get('shop'),
      from: body.from || body.from_date || url.searchParams.get('from'),
      to: body.to || body.to_date || url.searchParams.get('to'),
      days: body.days || url.searchParams.get('days'),
      limit: body.limit || url.searchParams.get('limit'),
      shopLimit: body.shopLimit || body.shop_limit || url.searchParams.get('shop_limit'),
      campaignListLimit: body.campaignListLimit || body.campaign_list_limit || url.searchParams.get('campaign_list_limit'),
      campaignListPageSize: body.campaignListPageSize || body.campaign_list_page_size || url.searchParams.get('campaign_list_page_size'),
      include_product_campaigns: body.include_product_campaigns ?? body.includeProductCampaigns ?? url.searchParams.get('include_product_campaigns'),
      includeAdgroups: body.includeAdgroups ?? body.include_adgroups ?? url.searchParams.get('include_adgroups'),
      bizCode: body.bizCode || body.biz_code || url.searchParams.get('biz_code'),
      campaign_id_list: body.campaign_id_list || body.campaignIds || body.campaign_ids || url.searchParams.get('campaign_id_list'),
      period_type: body.period_type || body.periodType || url.searchParams.get('period_type'),
      order_type: body.order_type || body.orderType || url.searchParams.get('order_type'),
      channel: body.channel || url.searchParams.get('channel'),
      performance_date: body.performance_date || body.performanceDate || url.searchParams.get('performance_date'),
      hourly_days: body.hourly_days || body.hourlyDays || url.searchParams.get('hourly_days'),
      all_cpc_daily_only: body.all_cpc_daily_only ?? body.allCpcDailyOnly ?? body.force_all_cpc_daily ?? body.forceAllCpcDaily ?? url.searchParams.get('all_cpc_daily_only'),
      all_cpc_hourly_only: body.all_cpc_hourly_only ?? body.allCpcHourlyOnly ?? body.force_all_cpc_hourly ?? body.forceAllCpcHourly ?? url.searchParams.get('all_cpc_hourly_only'),
      product_campaign_hourly_only: body.product_campaign_hourly_only ?? body.productCampaignHourlyOnly ?? body.force_product_campaign_hourly ?? body.forceProductCampaignHourly ?? url.searchParams.get('product_campaign_hourly_only'),
      shopee_paths: body.shopee_paths,
      shopee_params: body.shopee_params
    }
    const syncFeeDetails = request.method === 'POST' && (
      body.sync_fee_details === true ||
      body.syncFeeDetails === true ||
      url.searchParams.get('sync_fee_details') === '1'
    )
    const orderFeeSync = syncFeeDetails
      ? {
          orders: await syncApiOrders(env, cors, {
            platform: options.platform,
            shop: options.shop,
            days: Math.max(Number(options.days || 15) || 15, 15),
            limit: Math.min(Number(options.limit || 80) || 80, 120),
            statuses: 'READY_TO_SHIP,PROCESSED,SHIPPED,TO_CONFIRM_RECEIVE,COMPLETED,CANCELLED,IN_CANCEL'
          }),
          statuses: await syncApiOrderStatuses(env, {
            platform: options.platform,
            shop: options.shop,
            days: Math.max(Number(options.days || 30) || 30, 30),
            limit: Math.min(Number(options.limit || 150) || 150, 300)
          })
        }
      : null
    const result = await syncAdsCampaignSnapshots(env, options)
    const includeAffiliate = body.include_affiliate !== false && url.searchParams.get('include_affiliate') !== '0'
    const affiliateSync = includeAffiliate && (!options.platform || options.platform === 'shopee')
      ? await syncShopeeAffiliatePerformance(env, options).catch(error => ({
          status: 'error',
          error: error?.message || String(error),
          warnings: [{ stage: '/api/v2/ams/get_affiliate_performance', message: error?.message || String(error) }]
        }))
      : null
    const includeOpenCampaign = (body.include_open_campaign === true || body.includeOpenCampaign === true || url.searchParams.get('include_open_campaign') === '1')
      && (!options.platform || options.platform === 'shopee')
    const openCampaignSync = includeOpenCampaign
      ? await syncShopeeOpenCampaignPerformance(env, options).catch(error => ({
          status: 'error',
          error: error?.message || String(error),
          warnings: [{ stage: '/api/v2/ams/get_open_campaign_performance', message: error?.message || String(error) }]
        }))
      : null
    const syncJobId = `ads_sync_${Date.now()}`
    return json({
      ...result,
      job_id: result.job_id || syncJobId,
      scanned_count: Number(result.fetched_campaigns || 0),
      created_count: Number(result.created || 0),
      updated_count: Number(result.saved || 0),
      unchanged_count: Math.max(0, Number(result.fetched_campaigns || 0) - Number(result.saved || 0)),
      empty_count: Number(result.empty_count || 0),
      failed_count: Array.isArray(result.warnings) ? result.warnings.length : 0,
      last_error: Array.isArray(result.warnings) && result.warnings[0] ? (result.warnings[0].message || result.warnings[0].error || '') : '',
      core_readback_ok: Number(result.saved || 0) >= 0,
      order_fee_sync: orderFeeSync,
      affiliate_sync: affiliateSync,
      open_campaign_sync: openCampaignSync
    }, cors)
  }

  return handleAdsExtraRoutes(request, env, cors)
}
