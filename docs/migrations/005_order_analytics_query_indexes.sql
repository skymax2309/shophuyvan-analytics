-- Optimize finance/profit dashboard filters by platform + shop + date.
-- This supports queries like:
-- WHERE platform = ? AND shop = ? AND order_date >= ? AND order_date < ?

CREATE INDEX IF NOT EXISTS idx_order_analytics_platform_shop_order_date
ON order_analytics(platform, shop, order_date);