CREATE TABLE IF NOT EXISTS flash_auto_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'shopee',
  enabled INTEGER NOT NULL DEFAULT 0,
  auto_submit INTEGER NOT NULL DEFAULT 1,
  max_items INTEGER NOT NULL DEFAULT 50,
  min_stock INTEGER NOT NULL DEFAULT 5,
  active_only INTEGER NOT NULL DEFAULT 1,
  fallback_discount_percent REAL NOT NULL DEFAULT 10,
  min_discount_percent REAL NOT NULL DEFAULT 5,
  timeslot_mode TEXT NOT NULL DEFAULT 'auto',
  timeslot_id INTEGER,
  run_before_minutes INTEGER NOT NULL DEFAULT 30,
  schedule_days TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS flash_auto_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT,
  timeslot_id INTEGER,
  items_submitted INTEGER DEFAULT 0,
  items_confirmed INTEGER DEFAULT 0,
  price_source TEXT,
  live_write_sent INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  message TEXT,
  ran_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_flash_auto_logs_lookup
ON flash_auto_logs(shop_id, ran_at);

INSERT INTO flash_auto_settings (shop_id, platform, enabled, updated_at)
VALUES
  ('chihuy1984', 'shopee', 1, datetime('now', '+7 hours')),
  ('chihuy2309', 'shopee', 1, datetime('now', '+7 hours')),
  ('phambich2312', 'shopee', 1, datetime('now', '+7 hours')),
  ('kinhdoanhonlinegiasoc', 'lazada', 0, datetime('now', '+7 hours'))
ON CONFLICT(shop_id) DO NOTHING;
