// NEO: Backend worker chat sàn - nhóm settings-schema. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
function mergeRequiredChatAiReviewTriggers(value, limit = 160) {
  // Danh sách nhạy cảm phải có lõi cố định để cấu hình cũ trong D1 không làm mất các chủ đề vừa chốt.
  return normalizeRuleLineList([
    ...CHAT_AI_SUPPORT_DEFAULT_REVIEW_TRIGGERS,
    ...(Array.isArray(value) ? value : normalizeRuleLineList(value))
  ], limit)
}

function defaultChatSettings() {
  return {
    moderation_enabled: 1,
    blocked_keywords: [...DEFAULT_CHAT_BLOCKED_KEYWORDS],
    ai_enabled: 0,
    ai_provider: 'gemini',
    ai_model: 'gemini-2.5-flash',
    ai_tone: 'Thân thiện, chuyên nghiệp, không hứa quá dữ liệu đang có',
    ai_rules: mergeRequiredChatAiRules(DEFAULT_CHAT_AI_RULES),
    ai_guard_mode: 'strict',
    ai_forbidden_patterns: DEFAULT_CHAT_AI_FORBIDDEN_PATTERNS,
    ai_review_triggers: DEFAULT_CHAT_AI_REVIEW_TRIGGERS,
    ai_require_review: 0,
    ai_auto_reply_mode: 'off',
    ai_auto_reply_platforms: [...CHAT_AI_AUTO_REPLY_DEFAULT_PLATFORMS],
    ai_auto_reply_shops: [],
    ai_auto_reply_limit: 3,
    ai_auto_reply_hold_seconds: 20,
    ai_auto_reply_max_age_hours: 2,
    ai_auto_reply_handoff_enabled: 1,
    quick_replies: normalizeQuickReplies(DEFAULT_CHAT_QUICK_REPLIES),
    notify_enabled: 1,
    notify_preview_enabled: 1,
    notify_sound_enabled: 1,
    notify_poll_seconds: 5,
    updated_at: ''
  }
}

function normalizeChatAutoReplyMode(value, fallback = 'off') {
  const mode = cleanText(value || fallback).toLowerCase()
  return CHAT_AI_AUTO_REPLY_MODES.has(mode) ? mode : fallback
}

function normalizeChatAutoReplyPlatforms(value) {
  const items = Array.isArray(value)
    ? value
    : cleanText(value).split(/[\n,;|]+/)
  const allowed = new Set(['shopee', 'lazada'])
  const unique = []
  for (const item of items) {
    const platform = cleanText(item).toLowerCase()
    if (!allowed.has(platform) || unique.includes(platform)) continue
    unique.push(platform)
  }
  return unique.length ? unique : [...CHAT_AI_AUTO_REPLY_DEFAULT_PLATFORMS]
}

function normalizeChatAutoReplyShops(value) {
  const items = Array.isArray(value)
    ? value
    : cleanText(value).split(/[\n,;|]+/)
  const unique = []
  for (const item of items) {
    const shop = cleanText(item).toLowerCase()
    if (!shop || unique.includes(shop)) continue
    unique.push(shop)
  }
  return unique.slice(0, 20)
}

function rootBody(body) {
  if (body?.body && (body?.push || body?.result || body?.event_code || body?.processed_at)) {
    return body.body
  }
  return body || {}
}

function isChatTestConversation(value) {
  return /^CHAT_TEST/i.test(cleanText(value))
}

function isChatNotice(value) {
  return cleanText(value).includes('Webhook báo có tin nhắn mới nhưng chưa kèm nội dung')
}

async function addColumnIfMissing(env, table, definition) {
  try {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run()
  } catch (error) {
    const message = cleanText(error?.message).toLowerCase()
    if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
  }
}

async function ensureLazadaChatShopColumns(env) {
  // Lazada dùng 2 app riêng nên chat phải có bộ token riêng, không được ghi đè token order/product cũ.
  await addColumnIfMissing(env, 'shops', "chat_access_token TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'shops', "chat_refresh_token TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'shops', "chat_token_expire_at TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'shops', "chat_api_connected_at TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'shops', "chat_api_refresh_expire_at TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'shops', "chat_last_api_refresh_at TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'shops', "chat_api_redirect_url TEXT DEFAULT ''")
}

async function ensureChatMetaTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()
}

async function loadChatSchemaVersion(env) {
  const row = await env.DB.prepare(`
    SELECT meta_value
    FROM marketplace_chat_meta
    WHERE meta_key = ?
    LIMIT 1
  `).bind(CHAT_SCHEMA_VERSION_KEY).first().catch(() => null)
  return Number(cleanText(row?.meta_value) || 0) || 0
}

async function saveChatSchemaVersion(env, version = CHAT_SCHEMA_VERSION) {
  await ensureChatMetaTable(env)
  await env.DB.prepare(`
    INSERT INTO marketplace_chat_meta (meta_key, meta_value, updated_at)
    VALUES (?, ?, datetime('now', '+7 hours'))
    ON CONFLICT(meta_key) DO UPDATE SET
      meta_value = excluded.meta_value,
      updated_at = excluded.updated_at
  `).bind(CHAT_SCHEMA_VERSION_KEY, String(Number(version || 0))).run()
}

async function ensureProductKnowledgeTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_product_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      platform_item_id TEXT NOT NULL,
      product_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      category_id TEXT DEFAULT '',
      brand_name TEXT DEFAULT '',
      item_sku TEXT DEFAULT '',
      weight TEXT DEFAULT '',
      dimensions TEXT DEFAULT '{}',
      attributes TEXT DEFAULT '[]',
      logistics TEXT DEFAULT '[]',
      variations TEXT DEFAULT '[]',
      promotion_summary TEXT DEFAULT '[]',
      violation_summary TEXT DEFAULT '[]',
      suggested_categories TEXT DEFAULT '[]',
      deboost INTEGER DEFAULT 0,
      raw_listing TEXT DEFAULT '{}',
      source TEXT DEFAULT 'api',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, platform_item_id)
    )
  `).run()

  await addColumnIfMissing(env, 'marketplace_product_knowledge', "shop_id TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "source TEXT DEFAULT 'api'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "promotion_summary TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "violation_summary TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', "suggested_categories TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_product_knowledge', 'deboost INTEGER DEFAULT 0')

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_knowledge_shop
    ON marketplace_product_knowledge(platform, shop, shop_id, updated_at)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_product_knowledge_sku
    ON marketplace_product_knowledge(platform, item_sku)
  `).run()
}

Object.assign(globalThis, {
  mergeRequiredChatAiReviewTriggers,
  defaultChatSettings,
  normalizeChatAutoReplyMode,
  normalizeChatAutoReplyPlatforms,
  normalizeChatAutoReplyShops,
  rootBody,
  isChatTestConversation,
  isChatNotice,
  addColumnIfMissing,
  ensureLazadaChatShopColumns,
  ensureChatMetaTable,
  loadChatSchemaVersion,
  saveChatSchemaVersion,
  ensureProductKnowledgeTables
})
