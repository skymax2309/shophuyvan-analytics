-- Giảm D1 rows read cho OMS/capability diagnostics. Chỉ thêm index, không xoá hoặc mutate dữ liệu đơn thật.
CREATE INDEX IF NOT EXISTS idx_orders_v2_platform_shop_source_updated
ON orders_v2(platform, shop, source_updated_at);

CREATE INDEX IF NOT EXISTS idx_orders_v2_platform_shop_status_sync
ON orders_v2(platform, shop, last_status_sync_at, last_status_sync_status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_orders_v2_platform_shop_status_source
ON orders_v2(platform, shop, status_source);

CREATE INDEX IF NOT EXISTS idx_order_labels_order_error_refresh
ON order_labels(order_id, error, refreshed_at);

CREATE INDEX IF NOT EXISTS idx_jobs_status_schedule_created
ON jobs(status, scheduled_at, created_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_event_platform_shop_id
ON marketplace_webhook_events(event_code, platform, shop, id);

CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_platform_shop_event_id
ON marketplace_webhook_events(platform, shop, event_code, id);

CREATE INDEX IF NOT EXISTS idx_marketplace_chat_messages_thread_sender_time
ON marketplace_chat_messages(platform, conversation_id, shop, sender_type, sent_at, id);
