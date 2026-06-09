CREATE UNIQUE INDEX IF NOT EXISTS ux_shops_platform_api_shop_id
ON shops(platform, api_shop_id)
WHERE api_shop_id IS NOT NULL AND api_shop_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_shops_platform_shop_name
ON shops(platform, shop_name)
WHERE shop_name IS NOT NULL AND shop_name != '';