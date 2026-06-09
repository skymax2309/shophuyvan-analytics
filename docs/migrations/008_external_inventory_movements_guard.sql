-- Bổ sung ledger tồn kho cho đơn tạo từ External API nếu database chưa có bảng này.

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
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_order
ON inventory_movements(order_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku
ON inventory_movements(sku, warehouse_source);

