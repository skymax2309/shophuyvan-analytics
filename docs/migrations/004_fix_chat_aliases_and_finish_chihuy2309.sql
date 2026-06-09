-- Continue canonicalizing Shopee 166563639 -> chihuy2309.
-- Fix duplicate chat_conversation_aliases first.
-- No BEGIN/COMMIT because Wrangler D1 execute does not allow SQL transaction statements.

-- 1) Delete duplicate aliases that already exist under canonical shop.
DELETE FROM chat_conversation_aliases
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639'
  AND EXISTS (
    SELECT 1
    FROM chat_conversation_aliases canon
    WHERE canon.platform = chat_conversation_aliases.platform
      AND canon.shop = 'chihuy2309'
      AND COALESCE(canon.alias_conversation_id, '') = COALESCE(chat_conversation_aliases.alias_conversation_id, '')
      AND COALESCE(canon.canonical_conversation_id, '') = COALESCE(chat_conversation_aliases.canonical_conversation_id, '')
  );

-- 2) Move remaining aliases.
UPDATE chat_conversation_aliases
SET shop = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop = 'Shopee 166563639';

-- 3) Continue remaining marketplace/cache/snapshot tables.
UPDATE marketplace_ads_campaign_snapshots
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_ads_hourly_snapshots
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_ams_open_campaign_snapshots
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_ads_guard_logs
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_product_reviews
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_review_action_logs
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_returns
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE marketplace_return_reverse_ledger
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE return_receive_scans
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE return_complaint_cases
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE customer_risk_profiles
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE customer_risk_events
SET shop = 'chihuy2309'
WHERE platform = 'shopee' AND shop = 'Shopee 166563639';

UPDATE shopee_operation_actions
SET shop = 'chihuy2309'
WHERE shop = 'Shopee 166563639'
  AND api_shop_id = '166563639';

-- 4) Finish core tables again, idempotent if previous migration already updated them.
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

UPDATE jobs
SET shop_name = 'chihuy2309'
WHERE platform = 'shopee'
  AND shop_name = 'Shopee 166563639';

-- 5) Delete synthetic shop row at the end.
DELETE FROM shops
WHERE platform = 'shopee'
  AND shop_name = 'Shopee 166563639'
  AND api_shop_id = '166563639';