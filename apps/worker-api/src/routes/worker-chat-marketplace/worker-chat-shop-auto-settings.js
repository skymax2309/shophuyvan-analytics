// NEO: Backend worker chat sàn - cấu hình AI/GHN theo từng shop, không dùng toggle local-only.
function boolEnvFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(cleanText(value).toLowerCase())
}

function chatAutoShopAliases(row = {}) {
  return [
    row.shop_id,
    row.shop_name,
    row.shop,
    row.api_shop_id,
    row.user_name,
    row.display_name
  ].map(cleanText).filter(Boolean)
}

function normalizeChatApiStatus(value = '') {
  const status = cleanText(value).toLowerCase()
  return ['connected', 'disconnected', 'permission_missing', 'token_expired', 'error'].includes(status)
    ? status
    : 'disconnected'
}

function publicChatAutoSetting(row = {}, shop = {}) {
  const platform = cleanText(row.platform || shop.platform || 'shopee').toLowerCase()
  const shopId = cleanText(row.shop_id || shop.api_shop_id || shop.shop_id)
  const shopName = cleanText(row.shop_name || shop.shop_name || shop.user_name || shop.display_name || shopId)
  const hasChatToken = Boolean(cleanText(shop.chat_access_token || shop.access_token))
  const tokenStatus = cleanText(shop.chat_token_expire_at || shop.token_expire_at)
  return {
    id: Number(row.id || 0),
    platform,
    shop_id: shopId,
    shop_name: shopName,
    ai_auto_reply_enabled: Number(row.ai_auto_reply_enabled || 0) ? 1 : 0,
    ghn_auto_message_enabled: Number(row.ghn_auto_message_enabled || 0) ? 1 : 0,
    chat_api_status: normalizeChatApiStatus(row.chat_api_status || (hasChatToken ? 'connected' : 'disconnected')),
    marketplace_api_status: cleanText(row.marketplace_api_status || (cleanText(shop.access_token) ? 'connected' : 'disconnected')),
    last_chat_sync_at: cleanText(row.last_chat_sync_at),
    last_ai_reply_at: cleanText(row.last_ai_reply_at),
    daily_ai_reply_count: Number(row.daily_ai_reply_count || 0),
    max_ai_reply_per_day: Math.min(Math.max(Number(row.max_ai_reply_per_day || 20) || 20, 1), 500),
    business_hours_enabled: Number(row.business_hours_enabled || 0) ? 1 : 0,
    business_hours_config: safeJsonParse(row.business_hours_config, {}),
    manual_takeover_enabled: Number(row.manual_takeover_enabled ?? 1) ? 1 : 0,
    has_chat_token: hasChatToken ? 1 : 0,
    token_expire_at: tokenStatus,
    updated_at: cleanText(row.updated_at)
  }
}

async function upsertDefaultChatShopAutoSetting(env, shop = {}) {
  const platform = cleanText(shop.platform || 'shopee').toLowerCase()
  const shopId = cleanText(shop.api_shop_id || shop.shop_id)
  const shopName = cleanText(shop.shop_name || shop.user_name || shop.display_name || shopId)
  if (!platform || (!shopId && !shopName)) return null
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_shop_auto_settings
      (platform, shop_id, shop_name, ai_auto_reply_enabled, ghn_auto_message_enabled, chat_api_status,
       marketplace_api_status, manual_takeover_enabled, updated_at, created_at)
    VALUES (?, ?, ?, 0, 0, ?, ?, 1, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop_id, shop_name) DO NOTHING
  `).bind(
    platform,
    shopId,
    shopName,
    cleanText(shop.chat_access_token || shop.access_token) ? 'connected' : 'disconnected',
    cleanText(shop.access_token) ? 'connected' : 'disconnected'
  ).run()
  return loadChatShopAutoSetting(env, platform, shopName, shopId)
}

async function loadChatShopAutoSetting(env, platform, shopName = '', shopId = '') {
  await ensureChatTables(env)
  const aliases = [...new Set([shopName, shopId].map(cleanText).filter(Boolean))]
  if (!aliases.length) return null
  const normalizedPlatform = cleanText(platform || 'shopee').toLowerCase()
  const placeholders = aliases.map(() => '?').join(', ')
  const row = await env.DB.prepare(`
    SELECT *
    FROM marketplace_chat_shop_auto_settings
    WHERE lower(platform) = ?
      AND (shop_id IN (${placeholders}) OR shop_name IN (${placeholders}))
    ORDER BY id DESC
    LIMIT 1
  `).bind(normalizedPlatform, ...aliases, ...aliases).first().catch(() => null)
  return row ? publicChatAutoSetting(row) : null
}

async function listChatShopAutoSettings(request, env, cors) {
  await ensureChatTables(env)
  const url = new URL(request.url)
  const platformFilter = cleanText(url.searchParams.get('platform')).toLowerCase()
  const shopFilter = cleanText(url.searchParams.get('shop'))
  const where = []
  const params = []
  if (platformFilter) {
    where.push('lower(platform) = ?')
    params.push(platformFilter)
  }
  if (shopFilter) {
    where.push('(shop_name = ? OR user_name = ? OR api_shop_id = ?)')
    params.push(shopFilter, shopFilter, shopFilter)
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { results: shops } = await env.DB.prepare(`
    SELECT platform, shop_name, user_name, api_shop_id, access_token, chat_access_token,
           token_expire_at, chat_token_expire_at
    FROM shops
    ${sqlWhere}
    ORDER BY platform, COALESCE(shop_name, user_name, api_shop_id)
    LIMIT 120
  `).bind(...params).all().catch(() => ({ results: [] }))
  const rows = []
  for (const shop of shops || []) {
    const setting = await upsertDefaultChatShopAutoSetting(env, shop)
    rows.push(publicChatAutoSetting(setting || {}, shop))
  }
  return json({
    status: 'ok',
    global_ai_auto_reply_enabled: boolEnvFlag(env.SHOPEE_AI_AUTO_REPLY_GLOBAL_ENABLED) ? 1 : 0,
    global_ghn_auto_message_enabled: boolEnvFlag(env.SHOPEE_AUTO_CHAT_GHN_ENABLED) ? 1 : 0,
    rows
  }, cors)
}

async function updateChatShopAutoSetting(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const platform = cleanText(body.platform || 'shopee').toLowerCase()
  const shopId = cleanText(body.shop_id || body.api_shop_id)
  const shopName = cleanText(body.shop_name || body.shop || body.user_name || shopId)
  if (!platform || (!shopId && !shopName)) {
    return json({ status: 'error', error: 'missing_shop', message: 'Thiếu shop để lưu cấu hình tự động chat.' }, cors, 400)
  }
  const current = await loadChatShopAutoSetting(env, platform, shopName, shopId)
  const next = {
    ai: body.ai_auto_reply_enabled === undefined ? Number(current?.ai_auto_reply_enabled || 0) : (body.ai_auto_reply_enabled ? 1 : 0),
    ghn: body.ghn_auto_message_enabled === undefined ? Number(current?.ghn_auto_message_enabled || 0) : (body.ghn_auto_message_enabled ? 1 : 0),
    chatStatus: normalizeChatApiStatus(body.chat_api_status || current?.chat_api_status),
    marketplaceStatus: cleanText(body.marketplace_api_status || current?.marketplace_api_status || ''),
    maxDaily: Math.min(Math.max(Number(body.max_ai_reply_per_day || current?.max_ai_reply_per_day || 20) || 20, 1), 500),
    manualTakeover: body.manual_takeover_enabled === undefined ? Number(current?.manual_takeover_enabled ?? 1) : (body.manual_takeover_enabled ? 1 : 0)
  }
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_shop_auto_settings
      (platform, shop_id, shop_name, ai_auto_reply_enabled, ghn_auto_message_enabled, chat_api_status,
       marketplace_api_status, max_ai_reply_per_day, manual_takeover_enabled, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours'))
    ON CONFLICT(platform, shop_id, shop_name) DO UPDATE SET
      ai_auto_reply_enabled = excluded.ai_auto_reply_enabled,
      ghn_auto_message_enabled = excluded.ghn_auto_message_enabled,
      chat_api_status = excluded.chat_api_status,
      marketplace_api_status = excluded.marketplace_api_status,
      max_ai_reply_per_day = excluded.max_ai_reply_per_day,
      manual_takeover_enabled = excluded.manual_takeover_enabled,
      updated_at = excluded.updated_at
  `).bind(platform, shopId, shopName, next.ai, next.ghn, next.chatStatus, next.marketplaceStatus, next.maxDaily, next.manualTakeover).run()
  const saved = await loadChatShopAutoSetting(env, platform, shopName, shopId)
  return json({ status: 'ok', row: saved }, cors)
}

async function chatAutoReplyShopGate(env, candidate = {}, mode = 'dry_run') {
  const platform = cleanText(candidate.platform || 'shopee').toLowerCase()
  const setting = await loadChatShopAutoSetting(env, platform, candidate.shop, candidate.shop_id)
  if (mode === 'live' && !boolEnvFlag(env.SHOPEE_AI_AUTO_REPLY_GLOBAL_ENABLED)) {
    return { allowed: false, skipped_reason: 'global_ai_disabled', setting }
  }
  if (!setting?.ai_auto_reply_enabled) return { allowed: false, skipped_reason: 'shop_ai_disabled', setting }
  if (setting.chat_api_status !== 'connected') return { allowed: false, skipped_reason: 'chat_permission_missing', setting }
  if (Number(setting.daily_ai_reply_count || 0) >= Number(setting.max_ai_reply_per_day || 20)) {
    return { allowed: false, skipped_reason: 'daily_limit_reached', setting }
  }
  return { allowed: true, skipped_reason: '', setting }
}

async function bumpChatShopAiReplyCounter(env, candidate = {}) {
  const platform = cleanText(candidate.platform || 'shopee').toLowerCase()
  const setting = await loadChatShopAutoSetting(env, platform, candidate.shop, candidate.shop_id)
  if (!setting) return
  await env.DB.prepare(`
    UPDATE marketplace_chat_shop_auto_settings
    SET daily_ai_reply_count = COALESCE(daily_ai_reply_count, 0) + 1,
        last_ai_reply_at = datetime('now', '+7 hours'),
        updated_at = datetime('now', '+7 hours')
    WHERE id = ?
  `).bind(setting.id).run()
}

Object.assign(globalThis, {
  boolEnvFlag,
  chatAutoShopAliases,
  normalizeChatApiStatus,
  publicChatAutoSetting,
  loadChatShopAutoSetting,
  listChatShopAutoSettings,
  updateChatShopAutoSetting,
  chatAutoReplyShopGate,
  bumpChatShopAiReplyCounter
})
