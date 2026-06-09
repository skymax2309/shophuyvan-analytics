import { editShopeeAutoProductAds, editShopeeManualProductAds } from '../routes/api/index.js'
import { ensureAdsCampaignGuardTable } from '../core/ads/campaign-guard-core.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function nowText() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

function jsonText(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return fallback
  }
}

function actionLabel(action) {
  if (action === 'increase_budget') return 'Tăng ngân sách'
  if (action === 'decrease_budget') return 'Giảm ngân sách'
  if (action === 'pause') return 'Tạm dừng'
  if (action === 'resume') return 'Bật lại'
  return 'Giữ nguyên'
}

function shopeeEditAction(action) {
  if (action === 'pause') return 'pause'
  if (action === 'resume') return 'resume'
  if (action === 'increase_budget' || action === 'decrease_budget') return 'change_budget'
  return ''
}

function capabilityAction(action) {
  if (action === 'pause') return 'pause_campaign'
  if (action === 'resume') return 'resume_campaign'
  if (action === 'increase_budget' || action === 'decrease_budget') return 'change_budget'
  return action
}

function isAutoCampaign(campaign = {}) {
  const type = cleanText(campaign.campaign_type).toLowerCase()
  if (type.includes('manual')) return false
  return type.includes('auto_product') || type.includes('auto product') || type.includes('shopee_auto')
}

function userMessage(item = {}, status = '') {
  const name = cleanText(item.campaign_name || item.sku_id || item.campaign_id || 'campaign')
  const action = actionLabel(item.proposed_action)
  if (status === 'success') return `${action}: ${name}. Sàn đã xác nhận.`
  if (status === 'dry_run') return `${action}: ${name}. Đây là lượt thử nghiệm, chưa gửi sàn.`
  if (status === 'pending_admin_confirm') return `${action}: ${name}. Cần duyệt thủ công vì vượt giới hạn an toàn.`
  if (status === 'platform_not_supported_yet') return `${action}: ${name}. Lazada chưa sẵn sàng tự áp dụng.`
  if (status === 'read_only_platform') return `${action}: ${name}. Kênh này chỉ xem dữ liệu.`
  if (status === 'sàn_chưa_xác_nhận') return `${action}: ${name}. Sàn chưa xác nhận đúng thay đổi.`
  if (status === 'capability_blocked') return `${action}: ${name}. Shop chưa có quyền tự áp dụng.`
  if (status === 'blocked') return `${action}: ${name}. ${item.blocked_reason || 'Bị chặn bởi giới hạn an toàn.'}`
  return `${action}: ${name}. ${item.proposed_reason || 'Không thay đổi.'}`
}

async function hasCapability(env, item = {}) {
  await ensureAdsCampaignGuardTable(env)
  const row = await env.DB.prepare(`
    SELECT allowed, capability_status
    FROM ads_write_capabilities
    WHERE LOWER(platform) = LOWER(?) AND LOWER(shop_key) = LOWER(?) AND action = ?
    LIMIT 1
  `).bind(item.platform, item.shop_key, capabilityAction(item.proposed_action)).first()
  return Number(row?.allowed || 0) === 1
}

async function recordActionLog(env, item = {}, status, payload = {}) {
  await ensureAdsCampaignGuardTable(env)
  const createdAt = payload.created_at || nowText()
  const result = await env.DB.prepare(`
    INSERT INTO ads_action_logs (
      platform, shop_key, action_type, target_type, campaign_id, adgroup_id, sku_id,
      before_payload, proposed_payload, write_payload, response_payload, readback_payload,
      user_facing_result, status, error_code, error_message, created_by,
      created_at, applied_at, readback_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cleanText(item.platform || 'all'),
    cleanText(item.shop_key || 'all'),
    cleanText(item.proposed_action || 'no_action'),
    'campaign',
    cleanText(item.campaign_id),
    cleanText(item.adgroup_id),
    cleanText(item.sku_id),
    jsonText(payload.before_payload || { value: item.before_value, status: item.metrics?.status }),
    jsonText(payload.proposed_payload || item),
    jsonText(payload.write_payload || {}),
    jsonText(payload.response_payload || {}),
    jsonText(payload.readback_payload || {}),
    cleanText(payload.user_facing_result || userMessage(item, status)),
    cleanText(status),
    cleanText(payload.error_code),
    cleanText(payload.error_message),
    cleanText(payload.created_by || 'automation_cron'),
    createdAt,
    cleanText(payload.applied_at || ''),
    cleanText(payload.readback_at || '')
  ).run()
  return Number(result.meta?.last_row_id || 0)
}

async function updateDecisionReadModel(env, item = {}, status) {
  if (status !== 'success' || !item.sku_id) return
  await env.DB.prepare(`
    UPDATE ads_decision_read_model
    SET action_status = ?, last_synced_at = ?
    WHERE sku_id = ? AND LOWER(platform) = LOWER(?) AND LOWER(shop_key) = LOWER(?)
  `).bind(item.proposed_action, nowText(), item.sku_id, item.platform, item.shop_key).run()
}

async function executeShopee(env, item = {}) {
  const editAction = shopeeEditAction(item.proposed_action)
  const writePayload = {
    shop: item.shop_key,
    campaign_id: item.campaign_id,
    edit_action: editAction,
    budget: ['increase_budget', 'decrease_budget'].includes(item.proposed_action) ? item.after_value : undefined,
    apply: true,
    safe_mode: !['increase_budget', 'decrease_budget'].includes(item.proposed_action),
    confirm_apply: isAutoCampaign(item) ? 'EDIT_SHOPEE_AUTO_PRODUCT_ADS' : 'EDIT_SHOPEE_MANUAL_PRODUCT_ADS'
  }
  const response = isAutoCampaign(item)
    ? await editShopeeAutoProductAds(env, writePayload)
    : await editShopeeManualProductAds(env, writePayload)
  const verified = response?.verified === true || response?.response?.verified === true || response?.verify_result?.verified === true
  const readback = response?.verify_result || response?.response?.verify_result || {}
  const status = verified ? 'success' : 'sàn_chưa_xác_nhận'
  const action_id = await recordActionLog(env, item, status, {
    write_payload: writePayload,
    response_payload: response,
    readback_payload: readback,
    user_facing_result: userMessage(item, status),
    applied_at: nowText(),
    readback_at: nowText(),
    error_code: verified ? '' : 'readback_mismatch',
    error_message: verified ? '' : 'Sàn chưa xác nhận đúng thay đổi sau khi đọc lại.'
  })
  await updateDecisionReadModel(env, item, status)
  return { action_id, status, response, readback }
}

export async function executeAdsAutomationActions(env, evaluations = [], options = {}) {
  const results = []
  const dryRun = Boolean(options.dry_run_mode)
  for (const item of evaluations) {
    if (!item.proposed_action || item.proposed_action === 'no_action') {
      // Không ghi từng dòng giữ nguyên để một lần cron không vượt giới hạn request của Cloudflare.
      results.push({ action_id: null, status: item.blocked_reason ? 'blocked' : 'skipped', item })
      continue
    }
    if (item.requires_admin_confirm) {
      const action_id = await recordActionLog(env, item, 'pending_admin_confirm')
      results.push({ action_id, status: 'pending_admin_confirm', item })
      continue
    }
    if (item.blocked_reason) {
      const action_id = await recordActionLog(env, item, 'blocked', { error_message: item.blocked_reason })
      results.push({ action_id, status: 'blocked', item })
      continue
    }
    if (dryRun) {
      const action_id = await recordActionLog(env, item, 'dry_run')
      results.push({ action_id, status: 'dry_run', item })
      continue
    }
    if (item.platform === 'lazada') {
      const action_id = await recordActionLog(env, item, 'platform_not_supported_yet', {
        error_message: 'Lazada executor chưa sẵn sàng.'
      })
      results.push({ action_id, status: 'platform_not_supported_yet', item })
      continue
    }
    if (item.platform === 'tiktok') {
      const action_id = await recordActionLog(env, item, 'read_only_platform', {
        error_message: 'TikTok ADS hiện chỉ xem dữ liệu.'
      })
      results.push({ action_id, status: 'read_only_platform', item })
      continue
    }
    if (item.platform !== 'shopee') {
      const action_id = await recordActionLog(env, item, 'platform_not_supported_yet')
      results.push({ action_id, status: 'platform_not_supported_yet', item })
      continue
    }
    if (!await hasCapability(env, item)) {
      const action_id = await recordActionLog(env, item, 'capability_blocked')
      results.push({ action_id, status: 'capability_blocked', item })
      continue
    }
    try {
      results.push({ ...await executeShopee(env, item), item })
    } catch (error) {
      const action_id = await recordActionLog(env, item, 'error', {
        error_code: 'automation_executor_failed',
        error_message: error?.message || String(error)
      })
      results.push({ action_id, status: 'error', item, error: error?.message || String(error) })
    }
  }
  return results
}

export async function recordAdsAutomationSystemLog(env, entry = {}) {
  return recordActionLog(env, {
    platform: entry.platform || 'all',
    shop_key: entry.shop_key || 'all',
    proposed_action: entry.action_type || 'automation_run_summary',
    campaign_id: '',
    sku_id: ''
  }, entry.status || 'ok', {
    proposed_payload: entry.proposed_payload || {},
    response_payload: entry.response_payload || {},
    user_facing_result: entry.user_facing_result || '',
    error_message: entry.error_message || '',
    created_by: entry.created_by || 'automation_cron'
  })
}

export const ADS_EXECUTOR_TEST_ONLY = {
  actionLabel,
  capabilityAction,
  shopeeEditAction,
  userMessage
}
