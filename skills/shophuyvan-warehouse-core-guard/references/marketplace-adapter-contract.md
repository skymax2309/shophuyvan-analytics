# Marketplace Adapter Contract

Không xây hệ Shopee riêng. Xây Warehouse đa sàn. Shopee chỉ là adapter production đầu tiên.

Mỗi sàn chỉ được implement adapter theo contract:

- syncShopProfile(platform, shopId)
- syncProducts(platform, shopId)
- syncOrders(platform, shopId)
- syncFinance(platform, shopId)
- syncChat(platform, shopId)
- sendChatMessage(platform, shopId, conversationId, payload)

Adapter phải:

1. Gọi API sàn hoặc nguồn được phép.
2. Normalize dữ liệu.
3. Ghi vào Warehouse.
4. Trả trạng thái thật.

Adapter không được:

1. Trả dữ liệu trực tiếp cho UI.
2. Fake success.
3. Tạo bảng riêng cho từng màn hình.
4. Hardcode logic chỉ dùng được cho một sàn ở tầng Warehouse.

Shopee là adapter production đầu tiên.

Lazada/TikTok nếu chưa đủ endpoint/quyền thì phải có capability rõ:

- not_configured
- missing_endpoint
- missing_permission
- manual_import
- browser_helper
- disabled

Không fake success.
