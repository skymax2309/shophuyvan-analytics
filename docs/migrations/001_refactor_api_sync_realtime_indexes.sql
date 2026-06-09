-- Migration an toàn cho luồng API sync đơn hàng và realtime.
-- Không drop bảng/cột, không copy dữ liệu lớn; chỉ thêm index trên cột đã có trong schema hiện tại.

CREATE INDEX IF NOT EXISTS idx_orders_v2_platform_shop_order_date
ON orders_v2(platform, shop, order_date);

CREATE INDEX IF NOT EXISTS idx_orders_v2_platform_shop_oms_status
ON orders_v2(platform, shop, oms_status);

CREATE INDEX IF NOT EXISTS idx_orders_v2_platform_shop_shipping_status
ON orders_v2(platform, shop, shipping_status);

CREATE INDEX IF NOT EXISTS idx_orders_v2_oms_updated_at
ON orders_v2(oms_updated_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_sku
ON order_items(sku);

CREATE INDEX IF NOT EXISTS idx_shops_platform_shop_name
ON shops(platform, shop_name);

CREATE INDEX IF NOT EXISTS idx_shops_platform_api_shop_id
ON shops(platform, api_shop_id);

CREATE INDEX IF NOT EXISTS idx_shops_platform_api_user_id
ON shops(platform, api_user_id);

CREATE INDEX IF NOT EXISTS idx_shops_api_connected_at
ON shops(api_connected_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_platform_shop_order
ON marketplace_webhook_events(platform, shop, order_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_platform_shop_event
ON marketplace_webhook_events(platform, shop, event_code);

CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_events_processed_at
ON marketplace_webhook_events(processed_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_push_sync_queue_status_run_after
ON marketplace_push_sync_queue(status, run_after);

CREATE INDEX IF NOT EXISTS idx_marketplace_push_sync_queue_platform_shop_order
ON marketplace_push_sync_queue(platform, shop, order_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_chat_conversations_platform_shop_conversation
ON marketplace_chat_conversations(platform, shop, conversation_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_chat_conversations_platform_shop_last_message
ON marketplace_chat_conversations(platform, shop, last_message_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_chat_messages_platform_shop_conversation_sent
ON marketplace_chat_messages(platform, shop, conversation_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_chat_messages_message_id
ON marketplace_chat_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_ads_campaign_snapshots_platform_shop_date
ON marketplace_ads_campaign_snapshots(platform, shop, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_marketplace_ads_campaign_snapshots_campaign_date
ON marketplace_ads_campaign_snapshots(platform, shop, campaign_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_marketplace_ads_hourly_snapshots_platform_shop_date_hour
ON marketplace_ads_hourly_snapshots(platform, shop, snapshot_date, hour);

CREATE INDEX IF NOT EXISTS idx_marketplace_product_reviews_platform_shop_review
ON marketplace_product_reviews(platform, shop, review_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_product_reviews_platform_shop_reviewed
ON marketplace_product_reviews(platform, shop, reviewed_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_product_reviews_platform_shop_synced
ON marketplace_product_reviews(platform, shop, synced_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_returns_platform_shop_order_sn
ON marketplace_returns(platform, shop, order_sn);

CREATE INDEX IF NOT EXISTS idx_marketplace_returns_platform_shop_status
ON marketplace_returns(platform, shop, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_return_reverse_ledger_platform_shop_order
ON marketplace_return_reverse_ledger(platform, shop, order_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_return_reverse_ledger_platform_shop_reverse_status
ON marketplace_return_reverse_ledger(platform, shop, reverse_status);

CREATE INDEX IF NOT EXISTS idx_products_shop_id
ON products(shop_id);

CREATE INDEX IF NOT EXISTS idx_products_parent_sku
ON products(parent_sku);

CREATE INDEX IF NOT EXISTS idx_product_variations_platform_shop_item
ON product_variations(platform, shop, platform_item_id);

CREATE INDEX IF NOT EXISTS idx_product_variations_platform_sku
ON product_variations(platform_sku);

CREATE INDEX IF NOT EXISTS idx_product_variations_internal_sku
ON product_variations(internal_sku);

CREATE INDEX IF NOT EXISTS idx_marketplace_discounts_platform_shop_api_shop
ON marketplace_discounts(platform, shop, api_shop_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_discounts_discount_id
ON marketplace_discounts(discount_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_discounts_synced_status
ON marketplace_discounts(synced_at, updated_at, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_vouchers_platform_shop_api_shop
ON marketplace_vouchers(platform, shop, api_shop_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_vouchers_voucher_id
ON marketplace_vouchers(voucher_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_vouchers_synced_status
ON marketplace_vouchers(synced_at, updated_at, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_promotion_programs_platform_shop_api_shop
ON marketplace_promotion_programs(platform, shop, api_shop_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_promotion_programs_program_id
ON marketplace_promotion_programs(program_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_promotion_programs_synced_status
ON marketplace_promotion_programs(synced_at, updated_at, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_video_library_platform_shop_video
ON marketplace_video_library(platform, shop, video_key);

CREATE INDEX IF NOT EXISTS idx_marketplace_video_upload_queue_platform_shop_status
ON marketplace_video_upload_queue(platform, shop, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_video_upload_queue_status_scheduled
ON marketplace_video_upload_queue(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_video_dashboard_snapshots_platform_shop_period_end
ON marketplace_video_dashboard_snapshots(platform, shop, period_type, end_date);

