-- D1 DATA DUPLICATE / BLOAT AUDIT
-- Run with:
-- npx wrangler d1 execute huyvan-analytics-db --remote --file=docs/audits/d1_data_duplicate_audit.sql
-- Or copy query blocks one by one if output is too long.

-- 01. Synthetic marketplace shop names still present in orders.
SELECT 'synthetic_shop_in_orders_v2' AS check_name, platform, shop, COUNT(*) AS total
FROM orders_v2
WHERE shop LIKE 'Shopee %' OR shop LIKE 'Lazada %'
GROUP BY platform, shop
ORDER BY total DESC;

-- 02. Duplicate shop API identities.
SELECT 'duplicate_shops_api_shop_id' AS check_name, platform, api_shop_id, COUNT(*) AS total,
       GROUP_CONCAT(shop_name, ' | ') AS shop_names
FROM shops
WHERE COALESCE(api_shop_id, '') != ''
GROUP BY platform, api_shop_id
HAVING COUNT(*) > 1
ORDER BY total DESC;

-- 03. Duplicate shop names.
SELECT 'duplicate_shop_names' AS check_name, platform, LOWER(TRIM(shop_name)) AS normalized_shop_name,
       COUNT(*) AS total, GROUP_CONCAT(shop_name, ' | ') AS shop_names
FROM shops
GROUP BY platform, LOWER(TRIM(shop_name))
HAVING COUNT(*) > 1
ORDER BY total DESC;

-- 04. Duplicate SKU alias mappings.
SELECT 'duplicate_sku_alias' AS check_name, platform_sku, internal_sku, COUNT(*) AS total
FROM sku_alias
GROUP BY platform_sku, internal_sku
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 05. Platform SKU mapped to multiple internal SKUs.
SELECT 'platform_sku_many_internal_skus' AS check_name, platform_sku,
       COUNT(DISTINCT internal_sku) AS internal_sku_count,
       GROUP_CONCAT(DISTINCT internal_sku) AS internal_skus,
       COUNT(*) AS rows
FROM sku_alias
WHERE COALESCE(platform_sku, '') != ''
GROUP BY platform_sku
HAVING COUNT(DISTINCT internal_sku) > 1
ORDER BY rows DESC
LIMIT 100;

-- 06. Duplicate order item rows by practical identity.
SELECT 'duplicate_order_items_identity' AS check_name, order_id, sku, variation_name, COUNT(*) AS total,
       SUM(COALESCE(qty, 0)) AS qty_total, SUM(COALESCE(revenue_line, 0)) AS revenue_total
FROM order_items
GROUP BY order_id, sku, variation_name
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 07. Orders with no items.
SELECT 'orders_without_items' AS check_name, COUNT(*) AS total
FROM orders_v2 o
LEFT JOIN order_items i ON i.order_id = o.order_id
WHERE i.order_id IS NULL;

-- 08. Items without parent order.
SELECT 'items_without_order' AS check_name, COUNT(*) AS total
FROM order_items i
LEFT JOIN orders_v2 o ON o.order_id = i.order_id
WHERE o.order_id IS NULL;

-- 09. Orders missing analytics row.
SELECT 'orders_missing_order_analytics' AS check_name, COUNT(*) AS total
FROM orders_v2 o
LEFT JOIN order_analytics oa ON oa.order_sn = o.order_id
WHERE oa.order_sn IS NULL;

-- 10. Analytics rows without parent order.
SELECT 'analytics_without_order' AS check_name, COUNT(*) AS total
FROM order_analytics oa
LEFT JOIN orders_v2 o ON o.order_id = oa.order_sn
WHERE o.order_id IS NULL;

-- 11. Fee detail rows without parent order.
SELECT 'fee_details_without_order' AS check_name, COUNT(*) AS total
FROM order_fee_details f
LEFT JOIN orders_v2 o ON o.order_id = f.order_id
WHERE o.order_id IS NULL;

-- 12. Duplicate ads campaign snapshots.
SELECT 'duplicate_ads_campaign_snapshots' AS check_name, platform, shop, campaign_id, product_sku, snapshot_date, COUNT(*) AS total
FROM marketplace_ads_campaign_snapshots
GROUP BY platform, shop, campaign_id, product_sku, snapshot_date
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 13. Duplicate ads hourly snapshots.
SELECT 'duplicate_ads_hourly_snapshots' AS check_name, platform, shop, snapshot_date, hour, COUNT(*) AS total
FROM marketplace_ads_hourly_snapshots
GROUP BY platform, shop, snapshot_date, hour
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 14. Duplicate webhook events by likely identity.
SELECT 'duplicate_webhook_events_identity' AS check_name, platform, shop, event_code, order_id, entity_id, COUNT(*) AS total
FROM marketplace_webhook_events
GROUP BY platform, shop, event_code, order_id, entity_id
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 15. Push queue status distribution and old rows.
SELECT 'push_queue_status' AS check_name, status, COUNT(*) AS total,
       MIN(created_at) AS oldest_created_at, MAX(created_at) AS newest_created_at
FROM marketplace_push_sync_queue
GROUP BY status
ORDER BY total DESC;

-- 16. Webhook status distribution.
SELECT 'webhook_status' AS check_name, status, COUNT(*) AS total,
       MIN(processed_at) AS oldest_processed_at, MAX(processed_at) AS newest_processed_at
FROM marketplace_webhook_events
GROUP BY status
ORDER BY total DESC;

-- 17. Chat conversations duplicated by canonical id/name after shop canonicalization.
SELECT 'duplicate_chat_conversations' AS check_name, platform, shop, conversation_id, COUNT(*) AS total
FROM marketplace_chat_conversations
GROUP BY platform, shop, conversation_id
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 18. Chat messages duplicated by message id.
SELECT 'duplicate_chat_messages' AS check_name, platform, shop, conversation_id, message_id, COUNT(*) AS total
FROM marketplace_chat_messages
WHERE COALESCE(message_id, '') != ''
GROUP BY platform, shop, conversation_id, message_id
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 19. Video item link duplicates by practical identity.
SELECT 'duplicate_video_item_links' AS check_name, platform, shop, video_key, item_id, COUNT(*) AS total
FROM marketplace_video_item_links
GROUP BY platform, shop, video_key, item_id
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 100;

-- 20. Raw/payload heavy table row counts.
SELECT 'table_count_orders_v2' AS check_name, COUNT(*) AS total FROM orders_v2;
SELECT 'table_count_order_items' AS check_name, COUNT(*) AS total FROM order_items;
SELECT 'table_count_order_analytics' AS check_name, COUNT(*) AS total FROM order_analytics;
SELECT 'table_count_marketplace_webhook_events' AS check_name, COUNT(*) AS total FROM marketplace_webhook_events;
SELECT 'table_count_marketplace_push_sync_queue' AS check_name, COUNT(*) AS total FROM marketplace_push_sync_queue;
SELECT 'table_count_marketplace_chat_messages' AS check_name, COUNT(*) AS total FROM marketplace_chat_messages;
SELECT 'table_count_marketplace_ads_campaign_snapshots' AS check_name, COUNT(*) AS total FROM marketplace_ads_campaign_snapshots;
SELECT 'table_count_marketplace_ads_hourly_snapshots' AS check_name, COUNT(*) AS total FROM marketplace_ads_hourly_snapshots;
SELECT 'table_count_marketplace_product_reviews' AS check_name, COUNT(*) AS total FROM marketplace_product_reviews;
SELECT 'table_count_marketplace_returns' AS check_name, COUNT(*) AS total FROM marketplace_returns;
SELECT 'table_count_marketplace_video_library' AS check_name, COUNT(*) AS total FROM marketplace_video_library;

-- 21. Backup table still in production schema.
SELECT 'backup_order_items_20260509_exists' AS check_name, COUNT(*) AS total
FROM order_items_backup_20260509_hygiene;
