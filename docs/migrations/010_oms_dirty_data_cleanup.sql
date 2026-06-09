-- 2026-05-20: OMS dirty data cleanup guard.
-- Chỉ dùng để ghi lại schema/cleanup đã áp dụng trên production D1; không xóa đơn hoặc dữ liệu thanh toán thật.

CREATE TABLE IF NOT EXISTS cleanup_order_items_dirty_placeholder_backup_20260520 AS
SELECT *
FROM order_items
WHERE 0;

CREATE TABLE IF NOT EXISTS order_return_refund_markers (
  order_id TEXT NOT NULL,
  marker_kind TEXT NOT NULL DEFAULT 'return_refund_marker',
  marker_label TEXT DEFAULT 'Có yêu cầu trả hàng/hoàn tiền',
  platform TEXT DEFAULT '',
  shop TEXT DEFAULT '',
  source TEXT DEFAULT '',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(order_id, marker_kind)
);

ALTER TABLE products ADD COLUMN hidden_from_mapping INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN sku_type TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN user_confirmed INTEGER DEFAULT 0;

UPDATE products
SET hidden_from_mapping = 1,
    sku_type = CASE WHEN COALESCE(sku_type, '') = '' THEN 'placeholder' ELSE sku_type END
WHERE UPPER(COALESCE(sku, '')) LIKE 'SP\_%' ESCAPE '\'
  AND COALESCE(user_confirmed, 0) = 0;
