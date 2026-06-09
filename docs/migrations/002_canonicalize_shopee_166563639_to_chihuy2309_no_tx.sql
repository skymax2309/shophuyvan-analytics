-- Canonicalize duplicate Shopee shop name.
-- Old synthetic shop: Shopee 166563639
-- Canonical shop: chihuy2309
-- API shop id: 166563639


-- 1) Copy API credentials/metadata from synthetic shop to canonical shop if canonical fields are still empty.
UPDATE shops
SET
  access_token = CASE
    WHEN COALESCE(access_token, '') = '' THEN COALESCE((SELECT access_token FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), access_token)
    ELSE access_token
  END,
  refresh_token = CASE
    WHEN COALESCE(refresh_token, '') = '' THEN COALESCE((SELECT refresh_token FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), refresh_token)
    ELSE refresh_token
  END,
  token_expire_at = CASE
    WHEN COALESCE(token_expire_at, '') = '' THEN COALESCE((SELECT token_expire_at FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), token_expire_at)
    ELSE token_expire_at
  END,
  api_partner_id = CASE
    WHEN COALESCE(api_partner_id, '') = '' THEN COALESCE((SELECT api_partner_id FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), api_partner_id)
    ELSE api_partner_id
  END,
  api_partner_key = CASE
    WHEN COALESCE(api_partner_key, '') = '' THEN COALESCE((SELECT api_partner_key FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), api_partner_key)
    ELSE api_partner_key
  END,
  api_connected_at = CASE
    WHEN COALESCE(api_connected_at, '') = '' THEN COALESCE((SELECT api_connected_at FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), api_connected_at)
    ELSE api_connected_at
  END,
  api_refresh_expire_at = CASE
    WHEN COALESCE(api_refresh_expire_at, '') = '' THEN COALESCE((SELECT api_refresh_expire_at FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), api_refresh_expire_at)
    ELSE api_refresh_expire_at
  END,
  last_api_refresh_at = CASE
    WHEN COALESCE(last_api_refresh_at, '') = '' THEN COALESCE((SELECT last_api_refresh_at FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), last_api_refresh_at)
    ELSE last_api_refresh_at
  END,
  api_user_id = CASE
    WHEN COALESCE(api_user_id, '') = '' THEN COALESCE((SELECT api_user_id FROM shops WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639' AND api_shop_id = '166563639' LIMIT 1), api_user_id)
    ELSE api_user_id
  END
WHERE platform = 'shopee'
  AND shop_name = 'chihuy2309'
  AND api_shop_id = '166563639';

-- 2) Canonicalize shop name across operational/reporting tables.
UPDATE cost_settings SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE platform_reports SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE orders_v2 SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE product_variations SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE order_labels SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE inventory_movements SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE order_fee_details SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE order_analytics SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_order_finance_daily_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

-- 3) Canonicalize marketplace/cache/snapshot tables.
UPDATE marketplace_webhook_events SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_push_sync_queue SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_push_subscriptions SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_chat_conversations SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_chat_messages SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_chat_rule_violations SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_chat_ai_auto_reply_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE chat_knowledge SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE chat_product_advisories SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE chat_conversation_aliases SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_ads_campaign_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_ads_hourly_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_ams_open_campaign_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_ads_guard_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_product_knowledge SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_product_catalog_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_product_shop_limits SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_product_shop_catalog_state SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_product_catalog_daily_history SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_product_action_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_product_reviews SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_review_action_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_returns SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_return_reverse_ledger SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE return_receive_scans SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE return_complaint_cases SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_video_library SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_video_item_links SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_video_dashboard_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_video_detail_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_video_action_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_video_upload_queue SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_affiliate_performance_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_top_picks_collections SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_top_picks_items SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_top_picks_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_top_picks_tracking_tags SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_discounts SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_discount_items SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_discount_actions SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_vouchers SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_promotion_programs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_promotion_items SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_promotion_apply_queue SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE customer_risk_profiles SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE customer_risk_events SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

-- 4) Tables using shop_name instead of shop.
UPDATE jobs SET shop_name = 'chihuy2309' WHERE platform = 'shopee' AND shop_name = 'Shopee 166563639';

-- 5) Shopee-only operation table without platform column.
UPDATE shopee_operation_actions
SET shop = 'chihuy2309'
WHERE shop = 'Shopee 166563639'
  AND api_shop_id = '166563639';

-- 6) Remove duplicate synthetic shop row after preserving credentials above.
DELETE FROM shops
WHERE platform = 'shopee'
  AND shop_name = 'Shopee 166563639'
  AND api_shop_id = '166563639';

