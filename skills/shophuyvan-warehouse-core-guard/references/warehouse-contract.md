# Warehouse Contract

Warehouse Core là nguồn dữ liệu chuẩn duy nhất.

## Shelves

### Shop Warehouse

Lưu thông tin shop, tên shop, capability, API/manual mode.

Field tối thiểu:

- platform
- shop_id
- platform_shop_id
- shop_display_name
- shop_name_source
- api_status
- shop_chat_mode
- send_capability
- sync_capability
- product_sync_capability
- order_sync_capability
- finance_sync_capability
- source
- confidence
- updated_at

### Product Warehouse

Nguồn chuẩn là Product Master:

- products
- product_variations
- product catalog snapshot nếu có

Không tạo product riêng cho Chat.

### Order Warehouse

Nguồn chuẩn:

- orders_v2
- order_items
- order status normalizer

Không để Chat/OMS tự map trạng thái riêng.

### Finance Warehouse

Nguồn chuẩn:

- order_fee_details
- normalized fee breakdown
- Finance Core nếu có

Frontend không tự cộng trừ phí/lãi.

### Chat Link Warehouse

Chat Worker chỉ giữ:

- conversation
- message
- chat sync state
- attachment metadata

Chat không giữ bản order/product/shop riêng.
