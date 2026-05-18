import { cleanExternalText } from './response-core.js'

async function tableExists(env, table) {
  const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first()
  return Boolean(row)
}

async function addColumnIfMissing(env, table, column, definition) {
  if (!await tableExists(env, table)) return false
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
  const exists = (info.results || []).some(row => cleanExternalText(row.name).toLowerCase() === column.toLowerCase())
  if (!exists) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  return true
}

export async function ensureExternalApiTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      platform TEXT,
      shop TEXT,
      sku TEXT NOT NULL,
      warehouse_source TEXT NOT NULL DEFAULT 'main',
      qty_delta INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      order_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements(sku, warehouse_source)`).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_code TEXT NOT NULL UNIQUE,
      sku TEXT NOT NULL,
      product_id TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      source TEXT DEFAULT 'facebook_crm',
      source_conversation_id TEXT DEFAULT '',
      source_customer_id TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT NOT NULL,
      note TEXT DEFAULT '',
      cancel_reason TEXT DEFAULT '',
      committed_order_id TEXT DEFAULT '',
      idempotency_key TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_inventory_reservations_sku_status
    ON inventory_reservations(sku, status, expires_at)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_inventory_reservations_source_active
    ON inventory_reservations(source, source_conversation_id, sku, status)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_inventory_reservations_idempotency
    ON inventory_reservations(idempotency_key)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS api_integration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      method TEXT DEFAULT '',
      path TEXT DEFAULT '',
      request_id TEXT DEFAULT '',
      source TEXT DEFAULT '',
      status TEXT DEFAULT '',
      error_code TEXT DEFAULT '',
      message TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_api_integration_logs_action_time
    ON api_integration_logs(action, created_at)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_api_integration_logs_request
    ON api_integration_logs(request_id)
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      target_url TEXT DEFAULT '',
      payload TEXT DEFAULT '{}',
      signature TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      response_status INTEGER DEFAULT 0,
      response_body TEXT DEFAULT '',
      retry_count INTEGER DEFAULT 0,
      last_error TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_event
    ON webhook_delivery_logs(event_type, event_id)
  `).run()
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_status
    ON webhook_delivery_logs(status, updated_at)
  `).run()

  await addColumnIfMissing(env, 'orders_v2', 'external_source', "TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'orders_v2', 'external_source_order_id', "TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'orders_v2', 'external_source_conversation_id', "TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'orders_v2', 'external_source_page_id', "TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'orders_v2', 'external_customer_json', "TEXT DEFAULT '{}'")
  await addColumnIfMissing(env, 'orders_v2', 'external_shipping_json', "TEXT DEFAULT '{}'")
  await addColumnIfMissing(env, 'orders_v2', 'external_payment_json', "TEXT DEFAULT '{}'")
  await addColumnIfMissing(env, 'orders_v2', 'external_order_payload', "TEXT DEFAULT '{}'")
  await addColumnIfMissing(env, 'orders_v2', 'external_price_warnings', "TEXT DEFAULT '[]'")
  await addColumnIfMissing(env, 'orders_v2', 'net_revenue', 'REAL DEFAULT 0')
  await addColumnIfMissing(env, 'orders_v2', 'customer_phone', "TEXT DEFAULT ''")

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_orders_v2_external_source_order
    ON orders_v2(external_source, external_source_order_id)
  `).run()

  await addColumnIfMissing(env, 'order_items', 'original_price', 'REAL DEFAULT 0')
  await addColumnIfMissing(env, 'order_items', 'sale_price', 'REAL DEFAULT 0')
  await addColumnIfMissing(env, 'order_items', 'current_price', 'REAL DEFAULT 0')
  await addColumnIfMissing(env, 'order_items', 'price_source', "TEXT DEFAULT ''")
  await addColumnIfMissing(env, 'order_items', 'reservation_id', "TEXT DEFAULT ''")

  return true
}

export async function expireOldReservations(env, nowIso = new Date().toISOString()) {
  await env.DB.prepare(`
    UPDATE inventory_reservations
    SET status = 'expired',
        updated_at = datetime('now')
    WHERE status = 'active'
      AND expires_at <= ?
  `).bind(nowIso).run()
}

export async function logExternalApiAction(env, entry = {}) {
  const metadata = entry.metadata && typeof entry.metadata === 'object' ? JSON.stringify(entry.metadata) : '{}'
  await env.DB.prepare(`
    INSERT INTO api_integration_logs
      (action, method, path, request_id, source, status, error_code, message, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cleanExternalText(entry.action),
    cleanExternalText(entry.method),
    cleanExternalText(entry.path),
    cleanExternalText(entry.requestId),
    cleanExternalText(entry.source),
    cleanExternalText(entry.status),
    cleanExternalText(entry.errorCode),
    cleanExternalText(entry.message),
    metadata
  ).run()
}
