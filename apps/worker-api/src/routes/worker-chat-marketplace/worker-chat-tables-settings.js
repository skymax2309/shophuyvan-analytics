// NEO: Backend worker chat sàn - nhóm tables-settings. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function ensureChatTablesFresh(env) {
  await ensureLazadaChatShopColumns(env)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      conversation_id TEXT NOT NULL,
      buyer_id TEXT DEFAULT '',
      buyer_name TEXT DEFAULT '',
      last_message TEXT DEFAULT '',
      last_message_at TEXT DEFAULT '',
      unread_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      source TEXT DEFAULT 'webhook',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, conversation_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      conversation_id TEXT NOT NULL,
      message_id TEXT DEFAULT '',
      sender_type TEXT DEFAULT '',
      sender_name TEXT DEFAULT '',
      sender_id TEXT DEFAULT '',
      message_type TEXT DEFAULT 'text',
      content TEXT DEFAULT '',
      raw_payload TEXT DEFAULT '',
      sent_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, conversation_id, message_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      moderation_enabled INTEGER DEFAULT 1,
      blocked_keywords TEXT DEFAULT '[]',
      ai_enabled INTEGER DEFAULT 0,
      ai_provider TEXT DEFAULT 'gemini',
      ai_model TEXT DEFAULT 'gemini-2.5-flash',
      ai_tone TEXT DEFAULT '',
      ai_rules TEXT DEFAULT '',
      ai_require_review INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await addColumnIfMissing(env, 'marketplace_chat_settings', 'notify_enabled INTEGER DEFAULT 1')
  await addColumnIfMissing(env, 'marketplace_chat_settings', 'notify_preview_enabled INTEGER DEFAULT 1')
  await addColumnIfMissing(env, 'marketplace_chat_settings', 'notify_sound_enabled INTEGER DEFAULT 1')
  await addColumnIfMissing(env, 'marketplace_chat_settings', 'notify_poll_seconds INTEGER DEFAULT 8')
  await addColumnIfMissing(env, 'marketplace_chat_settings', "ai_guard_mode TEXT DEFAULT 'strict'")
  await addColumnIfMissing(env, 'marketplace_chat_settings', "ai_forbidden_patterns TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_settings', "ai_review_triggers TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_settings', "ai_auto_reply_mode TEXT DEFAULT 'off'")
  await addColumnIfMissing(env, 'marketplace_chat_settings', "ai_auto_reply_platforms TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_chat_settings', "ai_auto_reply_shops TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_chat_settings', 'ai_auto_reply_limit INTEGER DEFAULT 3')
  await addColumnIfMissing(env, 'marketplace_chat_settings', 'ai_auto_reply_hold_seconds INTEGER DEFAULT 20')
  await addColumnIfMissing(env, 'marketplace_chat_settings', 'ai_auto_reply_max_age_hours INTEGER DEFAULT 2')
  await addColumnIfMissing(env, 'marketplace_chat_settings', 'ai_auto_reply_handoff_enabled INTEGER DEFAULT 1')
  await addColumnIfMissing(env, 'marketplace_chat_settings', "quick_replies TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_chat_messages', "media_items TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'marketplace_chat_messages', "delivery_status TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_messages', "platform_response TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_conversations', "canonical_conversation_id TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_conversations', "identity_key TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_conversations', "transport TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_conversations', "scan_mode TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_conversations', "ai_auto_locked_at TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_conversations', "ai_auto_lock_reason TEXT DEFAULT ''")

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_conversation_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      alias_conversation_id TEXT DEFAULT '',
      canonical_conversation_id TEXT DEFAULT '',
      alias_key TEXT DEFAULT '',
      alias_source TEXT DEFAULT '',
      confidence REAL DEFAULT 0,
      reason TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop, alias_conversation_id, canonical_conversation_id)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_chat_conversation_aliases_lookup
    ON chat_conversation_aliases(platform, shop, shop_id, alias_conversation_id, canonical_conversation_id)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_chat_conversations_identity
    ON marketplace_chat_conversations(platform, shop, shop_id, identity_key, canonical_conversation_id)
  `).run()

  await runChatIdentityBackfill(env).catch(() => null)

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_chat_conversations_recent
    ON marketplace_chat_conversations(platform, shop, shop_id, conversation_id, last_message_at, updated_at, id)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_chat_messages_thread
    ON marketplace_chat_messages(platform, conversation_id, shop, shop_id, sent_at, id)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT DEFAULT '',
      auth TEXT DEFAULT '',
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      device_label TEXT DEFAULT '',
      preview_enabled INTEGER DEFAULT 1,
      sound_enabled INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      last_error TEXT DEFAULT '',
      last_sent_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_push_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT DEFAULT 'chat',
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      tag TEXT DEFAULT '',
      url TEXT DEFAULT '',
      dedupe_key TEXT DEFAULT '',
      data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await addColumnIfMissing(env, 'marketplace_push_events', "dedupe_key TEXT DEFAULT ''")

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_push_events_recent
    ON marketplace_push_events(created_at, id)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_push_events_dedupe
    ON marketplace_push_events(dedupe_key, created_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_push_dedupe (
      dedupe_key TEXT PRIMARY KEY,
      event_type TEXT DEFAULT 'chat',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_rule_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      conversation_id TEXT DEFAULT '',
      source TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      content TEXT DEFAULT '',
      violations TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_ai_auto_reply_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      conversation_id TEXT DEFAULT '',
      source_message_id TEXT DEFAULT '',
      source_message_row_id INTEGER DEFAULT 0,
      source_message_at TEXT DEFAULT '',
      mode TEXT DEFAULT '',
      status TEXT DEFAULT '',
      action TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      reply TEXT DEFAULT '',
      guard TEXT DEFAULT '{}',
      send_response TEXT DEFAULT '{}',
      error TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "buyer_id_masked TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "inbound_text_masked TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "final_sent_text TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "ai_confidence REAL DEFAULT 0")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "send_status TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "skipped_reason TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "shopee_message_id TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "shopee_response_code TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "shopee_response_message TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "error_code TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "error_message TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'marketplace_chat_ai_auto_reply_logs', "sent_at TEXT DEFAULT ''")

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_chat_ai_auto_reply_logs_lookup
    ON marketplace_chat_ai_auto_reply_logs(platform, shop, conversation_id, source_message_id, mode, created_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_shop_auto_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id TEXT DEFAULT '',
      shop_name TEXT DEFAULT '',
      platform TEXT DEFAULT 'shopee',
      ai_auto_reply_enabled INTEGER DEFAULT 0,
      ghn_auto_message_enabled INTEGER DEFAULT 0,
      chat_api_status TEXT DEFAULT 'disconnected',
      marketplace_api_status TEXT DEFAULT '',
      last_chat_sync_at TEXT DEFAULT '',
      last_ai_reply_at TEXT DEFAULT '',
      daily_ai_reply_count INTEGER DEFAULT 0,
      max_ai_reply_per_day INTEGER DEFAULT 20,
      business_hours_enabled INTEGER DEFAULT 0,
      business_hours_config TEXT DEFAULT '{}',
      manual_takeover_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop_id, shop_name)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_chat_shop_auto_settings_scope
    ON marketplace_chat_shop_auto_settings(platform, shop_id, shop_name)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketplace_chat_ghn_message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_sn TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      shop_name TEXT DEFAULT '',
      platform TEXT DEFAULT 'shopee',
      carrier TEXT DEFAULT '',
      logistics_channel_id TEXT DEFAULT '',
      package_number TEXT DEFAULT '',
      tracking_number TEXT DEFAULT '',
      message_type TEXT DEFAULT 'ghn_notice',
      message_template_id TEXT DEFAULT '',
      message_text TEXT DEFAULT '',
      send_status TEXT DEFAULT 'pending',
      shopee_message_id TEXT DEFAULT '',
      shopee_response_code TEXT DEFAULT '',
      shopee_response_message TEXT DEFAULT '',
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      raw_response_masked TEXT DEFAULT '{}',
      sent_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', '+7 hours')),
      UNIQUE(platform, shop_id, order_sn, message_type)
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_chat_ghn_message_logs_lookup
    ON marketplace_chat_ghn_message_logs(platform, shop_id, send_status, created_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      category TEXT DEFAULT '',
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      normalized_question TEXT DEFAULT '',
      keywords TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      source_type TEXT DEFAULT '',
      source_message_id TEXT DEFAULT '',
      priority INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT '',
      approved_by TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_chat_knowledge_scope
    ON chat_knowledge(status, platform, shop, updated_at, id)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_chat_knowledge_category
    ON chat_knowledge(status, category, priority, updated_at)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chat_product_advisories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT '',
      shop TEXT DEFAULT '',
      shop_id TEXT DEFAULT '',
      trigger_type TEXT DEFAULT 'keyword',
      trigger_value TEXT NOT NULL,
      trigger_keywords TEXT DEFAULT '[]',
      title TEXT DEFAULT '',
      message TEXT NOT NULL,
      related_item_id TEXT DEFAULT '',
      related_product_name TEXT DEFAULT '',
      related_product_url TEXT DEFAULT '',
      severity TEXT DEFAULT 'required',
      status TEXT DEFAULT 'active',
      priority INTEGER DEFAULT 50,
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT DEFAULT '',
      approved_by TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
      created_at TEXT DEFAULT (datetime('now', '+7 hours'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_chat_product_advisories_scope
    ON chat_product_advisories(status, platform, shop, shop_id, priority, updated_at)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_chat_product_advisories_trigger
    ON chat_product_advisories(status, trigger_type, trigger_value)
  `).run()

  // Chat chỉ cần schema chat cốt lõi; bảng product knowledge sẽ được tự đảm bảo ở luồng sản phẩm.
}

async function ensureChatTables(env, options = {}) {
  const force = options.force === true
  const freshEnough = chatSchemaReadyPromise
    && chatSchemaReadyAt
    && (Date.now() - chatSchemaReadyAt) < CHAT_SCHEMA_CACHE_MS
  if (!force && freshEnough) return chatSchemaReadyPromise
  if (!force && chatSchemaReadyPromise && !chatSchemaReadyAt) return chatSchemaReadyPromise

  chatSchemaReadyPromise = (async () => {
    try {
      const storedVersion = force ? 0 : await loadChatSchemaVersion(env)
      // Khi schema đã được đóng dấu version trên D1 thì lượt cold start sau chỉ cần check nhẹ,
      // tránh để các request F5 đầu phiên cứ lặp lại nhiều ALTER/index/backfill nặng.
      if (!force && storedVersion >= CHAT_SCHEMA_VERSION) {
        chatSchemaReadyAt = Date.now()
        return
      }
      await ensureChatTablesFresh(env)
      await saveChatSchemaVersion(env, CHAT_SCHEMA_VERSION).catch(() => null)
      chatSchemaReadyAt = Date.now()
    } catch (error) {
      chatSchemaReadyPromise = null
      chatSchemaReadyAt = 0
      throw error
    }
  })()
  return chatSchemaReadyPromise
}

async function getChatSettings(env) {
  await ensureChatTables(env)
  const defaults = defaultChatSettings()
  const row = await env.DB.prepare(`
    SELECT * FROM marketplace_chat_settings WHERE id = 1 LIMIT 1
  `).first()
  if (!row) return defaults
  const quickReplies = normalizeQuickReplies(safeJsonParse(row.quick_replies, defaults.quick_replies))
  return {
    ...defaults,
    moderation_enabled: Number(row.moderation_enabled ?? defaults.moderation_enabled) ? 1 : 0,
    blocked_keywords: normalizeKeywordList(safeJsonParse(row.blocked_keywords, defaults.blocked_keywords)),
    ai_enabled: Number(row.ai_enabled ?? defaults.ai_enabled) ? 1 : 0,
    ai_provider: cleanText(row.ai_provider || defaults.ai_provider) || defaults.ai_provider,
    ai_model: cleanText(row.ai_model || defaults.ai_model) || defaults.ai_model,
    ai_tone: cleanText(row.ai_tone || defaults.ai_tone),
    ai_rules: mergeRequiredChatAiRules(row.ai_rules || defaults.ai_rules),
    ai_guard_mode: ['strict', 'review', 'off'].includes(cleanText(row.ai_guard_mode || defaults.ai_guard_mode).toLowerCase())
      ? cleanText(row.ai_guard_mode || defaults.ai_guard_mode).toLowerCase()
      : defaults.ai_guard_mode,
    ai_forbidden_patterns: mergeRequiredChatAiForbiddenPatterns(row.ai_forbidden_patterns || defaults.ai_forbidden_patterns),
    ai_review_triggers: mergeRequiredChatAiReviewTriggers(row.ai_review_triggers || defaults.ai_review_triggers),
    ai_require_review: Number(row.ai_require_review ?? defaults.ai_require_review) ? 1 : 0,
    ai_auto_reply_mode: normalizeChatAutoReplyMode(row.ai_auto_reply_mode, defaults.ai_auto_reply_mode),
    ai_auto_reply_platforms: normalizeChatAutoReplyPlatforms(safeJsonParse(row.ai_auto_reply_platforms, row.ai_auto_reply_platforms || defaults.ai_auto_reply_platforms)),
    ai_auto_reply_shops: normalizeChatAutoReplyShops(safeJsonParse(row.ai_auto_reply_shops, row.ai_auto_reply_shops || defaults.ai_auto_reply_shops)),
    ai_auto_reply_limit: Math.min(Math.max(Number(row.ai_auto_reply_limit || defaults.ai_auto_reply_limit) || defaults.ai_auto_reply_limit, 1), 10),
    ai_auto_reply_hold_seconds: Math.min(Math.max(Number(row.ai_auto_reply_hold_seconds || defaults.ai_auto_reply_hold_seconds) || defaults.ai_auto_reply_hold_seconds, 0), 600),
    ai_auto_reply_max_age_hours: Math.min(Math.max(Number(row.ai_auto_reply_max_age_hours || defaults.ai_auto_reply_max_age_hours) || defaults.ai_auto_reply_max_age_hours, 1), 168),
    ai_auto_reply_handoff_enabled: Number(row.ai_auto_reply_handoff_enabled ?? defaults.ai_auto_reply_handoff_enabled) ? 1 : 0,
    quick_replies: quickReplies.length ? quickReplies : defaults.quick_replies,
    notify_enabled: Number(row.notify_enabled ?? defaults.notify_enabled) ? 1 : 0,
    notify_preview_enabled: Number(row.notify_preview_enabled ?? defaults.notify_preview_enabled) ? 1 : 0,
    notify_sound_enabled: Number(row.notify_sound_enabled ?? defaults.notify_sound_enabled) ? 1 : 0,
    notify_poll_seconds: Math.min(Math.max(Number(row.notify_poll_seconds || defaults.notify_poll_seconds) || 8, 5), 60),
    updated_at: cleanText(row.updated_at)
  }
}

Object.assign(globalThis, {
  ensureChatTablesFresh,
  ensureChatTables,
  getChatSettings
})
