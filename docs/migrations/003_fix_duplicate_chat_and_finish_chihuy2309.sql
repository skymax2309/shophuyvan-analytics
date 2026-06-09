-- Finish canonicalizing Shopee 166563639 -> chihuy2309.
-- No BEGIN/COMMIT because Wrangler D1 execute does not allow SQL transaction statements.

-- 1) Preserve API credentials/metadata from synthetic row into canonical row if canonical is missing values.
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

-- 2) Finish core order/report tables. These should not conflict because keys are normally order_id/report ids.
UPDATE orders_v2
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

UPDATE order_fee_details
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

UPDATE order_analytics
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

UPDATE marketplace_order_finance_daily_snapshots
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

UPDATE inventory_movements
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

UPDATE order_labels
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

UPDATE jobs
SET shop_name = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop_name = 'Shopee 166563639';

-- 3) Remove duplicate chat conversations that already exist under canonical shop.
DELETE FROM marketplace_chat_conversations
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639'
  AND EXISTS (
    SELECT 1
    FROM marketplace_chat_conversations canon
    WHERE canon.platform = marketplace_chat_conversations.platform
      AND canon.shop = 'chihuy2309'
      AND canon.conversation_id = marketplace_chat_conversations.conversation_id
  );

-- 4) Move remaining non-duplicate chat conversations.
UPDATE marketplace_chat_conversations
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

-- 5) Remove duplicate chat messages if canonical message already exists.
DELETE FROM marketplace_chat_messages
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639'
  AND EXISTS (
    SELECT 1
    FROM marketplace_chat_messages canon
    WHERE canon.platform = marketplace_chat_messages.platform
      AND canon.shop = 'chihuy2309'
      AND canon.conversation_id = marketplace_chat_messages.conversation_id
      AND COALESCE(canon.message_id, '') = COALESCE(marketplace_chat_messages.message_id, '')
  );

-- 6) Move remaining chat messages.
UPDATE marketplace_chat_messages
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

-- 7) Continue simple shop-name tables.
UPDATE marketplace_webhook_events SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_push_sync_queue SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_push_subscriptions SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_chat_rule_violations SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_chat_ai_auto_reply_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE chat_knowledge SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE chat_product_advisories SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE chat_conversation_aliases SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_ads_campaign_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_ads_hourly_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_ams_open_campaign_snapshots SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_ads_guard_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_product_reviews SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_review_action_logs SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_returns SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE marketplace_return_reverse_ledger SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE return_receive_scans SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE return_complaint_cases SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE customer_risk_profiles SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';
UPDATE customer_risk_events SET shop = 'chihuy2309' WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

-- 8) Shopee-only operation table.
UPDATE shopee_operation_actions
SET shop = 'chihuy2309'
WHERE shop = 'Shopee 166563639'
  AND api_shop_id = '166563639';

-- 9) Delete synthetic shop row after preserving metadata.
DELETE FROM shops
WHERE platform = 'shopee'
  AND shop_name = 'Shopee 166563639'
  AND api_shop_id = '166563639';