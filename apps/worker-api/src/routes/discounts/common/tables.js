export function installDiscountsCommonTables(core) {
  const addColumnIfMissing = (...args) => core.addColumnIfMissing(...args)

  async function ensureShopeeDiscountTables(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_discounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL DEFAULT 'shopee',
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        discount_id TEXT DEFAULT '',
        discount_name TEXT DEFAULT '',
        status TEXT DEFAULT '',
        source INTEGER DEFAULT 0,
        start_time INTEGER DEFAULT 0,
        end_time INTEGER DEFAULT 0,
        is_current INTEGER DEFAULT 1,
        item_count INTEGER DEFAULT 0,
        raw_data TEXT DEFAULT '{}',
        detail_raw_data TEXT DEFAULT '{}',
        request_id TEXT DEFAULT '',
        synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_discounts_unique
      ON marketplace_discounts(platform, api_shop_id, discount_id)
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_discounts_lookup
      ON marketplace_discounts(platform, shop, status, is_current, start_time, end_time)
    `).run()

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_discount_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL DEFAULT 'shopee',
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        discount_id TEXT DEFAULT '',
        discount_name TEXT DEFAULT '',
        status TEXT DEFAULT '',
        item_id TEXT DEFAULT '',
        item_name TEXT DEFAULT '',
        model_id TEXT DEFAULT '',
        model_name TEXT DEFAULT '',
        normal_stock INTEGER DEFAULT 0,
        promotion_stock INTEGER DEFAULT 0,
        original_price REAL DEFAULT 0,
        promotion_price REAL DEFAULT 0,
        discount_percent REAL DEFAULT 0,
        purchase_limit INTEGER DEFAULT 0,
        raw_data TEXT DEFAULT '{}',
        synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_discount_items_unique
      ON marketplace_discount_items(platform, api_shop_id, discount_id, item_id, model_id)
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_discount_items_lookup
      ON marketplace_discount_items(platform, shop, item_id, status)
    `).run()

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_discount_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL DEFAULT 'shopee',
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        action TEXT DEFAULT '',
        payload TEXT DEFAULT '{}',
        dry_run INTEGER DEFAULT 1,
        sent_to_shopee INTEGER DEFAULT 0,
        response TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_discount_actions_lookup
      ON marketplace_discount_actions(platform, shop, action, created_at)
    `).run()

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL DEFAULT 'shopee',
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        voucher_id TEXT DEFAULT '',
        voucher_code TEXT DEFAULT '',
        voucher_name TEXT DEFAULT '',
        status TEXT DEFAULT '',
        voucher_type INTEGER DEFAULT 0,
        reward_type INTEGER DEFAULT 0,
        usage_quantity INTEGER DEFAULT 0,
        current_usage INTEGER DEFAULT 0,
        start_time INTEGER DEFAULT 0,
        end_time INTEGER DEFAULT 0,
        display_start_time INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        voucher_purpose INTEGER DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        percentage REAL DEFAULT 0,
        min_basket_price REAL DEFAULT 0,
        max_price REAL DEFAULT 0,
        item_ids_json TEXT DEFAULT '[]',
        is_current INTEGER DEFAULT 1,
        raw_data TEXT DEFAULT '{}',
        detail_raw_data TEXT DEFAULT '{}',
        request_id TEXT DEFAULT '',
        synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_vouchers_unique
      ON marketplace_vouchers(platform, api_shop_id, voucher_id)
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_vouchers_lookup
      ON marketplace_vouchers(platform, shop, status, is_current, start_time, end_time)
    `).run()

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_promotion_programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        module TEXT DEFAULT '',
        program_id TEXT DEFAULT '',
        program_name TEXT DEFAULT '',
        status TEXT DEFAULT '',
        start_time INTEGER DEFAULT 0,
        end_time INTEGER DEFAULT 0,
        budget REAL DEFAULT 0,
        used_budget REAL DEFAULT 0,
        currency TEXT DEFAULT '',
        item_count INTEGER DEFAULT 0,
        is_current INTEGER DEFAULT 1,
        raw_data TEXT DEFAULT '{}',
        detail_raw_data TEXT DEFAULT '{}',
        request_id TEXT DEFAULT '',
        synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_promotion_programs_unique
      ON marketplace_promotion_programs(platform, api_shop_id, module, program_id)
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_promotion_programs_lookup
      ON marketplace_promotion_programs(platform, module, shop, status, is_current, start_time, end_time)
    `).run()

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_promotion_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        module TEXT DEFAULT '',
        program_id TEXT DEFAULT '',
        program_name TEXT DEFAULT '',
        item_role TEXT DEFAULT '',
        item_id TEXT DEFAULT '',
        model_id TEXT DEFAULT '',
        sku_id TEXT DEFAULT '',
        sku TEXT DEFAULT '',
        item_name TEXT DEFAULT '',
        model_name TEXT DEFAULT '',
        status TEXT DEFAULT '',
        original_price REAL DEFAULT 0,
        promotion_price REAL DEFAULT 0,
        stock INTEGER DEFAULT 0,
        campaign_stock INTEGER DEFAULT 0,
        purchase_limit INTEGER DEFAULT 0,
        raw_data TEXT DEFAULT '{}',
        synced_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_promotion_items_unique
      ON marketplace_promotion_items(platform, api_shop_id, module, program_id, item_role, item_id, model_id, sku_id)
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_promotion_items_lookup
      ON marketplace_promotion_items(platform, module, shop, item_id, sku_id, status)
    `).run()
    await addColumnIfMissing(env, 'marketplace_promotion_items', "price_source TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_items', "enrichment_status TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_items', "enrichment_warnings TEXT DEFAULT '[]'")

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_promotion_apply_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_id TEXT UNIQUE NOT NULL,
        platform TEXT NOT NULL,
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        module TEXT DEFAULT '',
        action TEXT DEFAULT '',
        program_id TEXT DEFAULT '',
        item_id TEXT DEFAULT '',
        model_id TEXT DEFAULT '',
        sku_id TEXT DEFAULT '',
        sku TEXT DEFAULT '',
        status TEXT DEFAULT 'queued',
        action_type TEXT DEFAULT '',
        target_type TEXT DEFAULT '',
        client_type TEXT DEFAULT '',
        shopee_endpoint TEXT DEFAULT '',
        validation_status TEXT DEFAULT '',
        send_status TEXT DEFAULT 'draft_local',
        verify_status TEXT DEFAULT 'not_verified',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        raw_response_masked TEXT DEFAULT '{}',
        payload TEXT DEFAULT '{}',
        preview_response TEXT DEFAULT '{}',
        risk_summary TEXT DEFAULT '{}',
        rollback_payload TEXT DEFAULT '{}',
        apply_locked INTEGER DEFAULT 1,
        sent_to_platform INTEGER DEFAULT 0,
        created_by TEXT DEFAULT '',
        created_role TEXT DEFAULT '',
        approved_by TEXT DEFAULT '',
        applied_by TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        response TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now', '+7 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
        applied_at TEXT DEFAULT '',
        sent_at TEXT DEFAULT '',
        verified_at TEXT DEFAULT ''
      )
    `).run()
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "action_type TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "target_type TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "client_type TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "shopee_endpoint TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "validation_status TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "send_status TEXT DEFAULT 'draft_local'")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "verify_status TEXT DEFAULT 'not_verified'")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "error_code TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "error_message TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "raw_response_masked TEXT DEFAULT '{}'")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "sent_at TEXT DEFAULT ''")
    await addColumnIfMissing(env, 'marketplace_promotion_apply_queue', "verified_at TEXT DEFAULT ''")
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_promotion_apply_queue_lookup
      ON marketplace_promotion_apply_queue(platform, shop, module, status, created_at)
    `).run()
  }
  core.ensureShopeeDiscountTables = ensureShopeeDiscountTables
}
