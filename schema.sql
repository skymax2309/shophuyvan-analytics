-- Bảng lưu thông tin file để xuất ra khi cần
CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT,
    platform TEXT,
    r2_key TEXT,
    import_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu đơn hàng để tính lợi nhuận
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    platform TEXT,
    status TEXT, -- success, cancel, refund
    revenue REAL,
    sku TEXT,
    qty INTEGER,
    import_id INTEGER,
    FOREIGN KEY(import_id) REFERENCES imports(id)
);