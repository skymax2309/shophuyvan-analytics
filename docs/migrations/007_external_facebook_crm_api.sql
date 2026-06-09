-- External API + Webhook cho Facebook Ads CRM.
-- Trang Quản Lý TMĐT vẫn là Product/Inventory/Order Master; CRM chỉ gọi API giữ hàng/tạo đơn.

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
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_sku_status
ON inventory_reservations(sku, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_source_active
ON inventory_reservations(source, source_conversation_id, sku, status);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_idempotency
ON inventory_reservations(idempotency_key);

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
);

CREATE INDEX IF NOT EXISTS idx_api_integration_logs_action_time
ON api_integration_logs(action, created_at);

CREATE INDEX IF NOT EXISTS idx_api_integration_logs_request
ON api_integration_logs(request_id);

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
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_event
ON webhook_delivery_logs(event_type, event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_status
ON webhook_delivery_logs(status, updated_at);

ALTER TABLE orders_v2 ADD COLUMN external_source TEXT DEFAULT '';
ALTER TABLE orders_v2 ADD COLUMN external_source_order_id TEXT DEFAULT '';
ALTER TABLE orders_v2 ADD COLUMN external_source_conversation_id TEXT DEFAULT '';
ALTER TABLE orders_v2 ADD COLUMN external_source_page_id TEXT DEFAULT '';
ALTER TABLE orders_v2 ADD COLUMN external_customer_json TEXT DEFAULT '{}';
ALTER TABLE orders_v2 ADD COLUMN external_shipping_json TEXT DEFAULT '{}';
ALTER TABLE orders_v2 ADD COLUMN external_payment_json TEXT DEFAULT '{}';
ALTER TABLE orders_v2 ADD COLUMN external_order_payload TEXT DEFAULT '{}';
ALTER TABLE orders_v2 ADD COLUMN external_price_warnings TEXT DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_orders_v2_external_source_order
ON orders_v2(external_source, external_source_order_id);

ALTER TABLE order_items ADD COLUMN original_price REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN sale_price REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN current_price REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN price_source TEXT DEFAULT '';
ALTER TABLE order_items ADD COLUMN reservation_id TEXT DEFAULT '';

