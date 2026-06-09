# External API + Webhook cho Facebook Ads CRM

## 1. Tổng quan

Trang Quản Lý TMĐT là nguồn dữ liệu gốc cho Product, SKU, Inventory và Order. Facebook Ads CRM chỉ là kênh bán bên ngoài, được phép đọc sản phẩm/tồn kho, giữ hàng, hủy giữ hàng, tạo đơn và đọc trạng thái đơn qua `/api/external/*`. CRM không được tự trừ tồn kho local.

Base URL production:

```text
https://huyvan-worker-api.nghiemchihuy.workers.dev
```

## 2. Authentication

Mọi endpoint `/api/external/*` bắt buộc gửi một trong hai header:

```http
Authorization: Bearer <API_KEY_FOR_FACEBOOK_CRM>
```

hoặc:

```http
X-API-Key: <API_KEY_FOR_FACEBOOK_CRM>
```

Không đưa API key vào query string và không ghi API key vào log.

## 3. Chuẩn response

Thành công:

```json
{
  "success": true,
  "data": {},
  "message": "OK"
}
```

Phân trang:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

Lỗi:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Không đủ tồn kho",
    "details": {}
  }
}
```

## 4. Danh sách API

| API | Mục đích |
| --- | --- |
| `GET /api/external/products` | Lấy danh sách sản phẩm |
| `GET /api/external/products/:id` | Lấy chi tiết sản phẩm và biến thể |
| `GET /api/external/products/sku/:sku` | Lấy sản phẩm theo SKU |
| `GET /api/external/products/sku/:sku/price` | Lấy giá mới nhất theo SKU |
| `GET /api/external/shopee/products/full` | Lấy nội dung + ảnh + video + model trực tiếp từ Shopee Open Platform |
| `GET /api/external/shopee/products/full/:itemId` | Lấy chi tiết đầy đủ một item Shopee theo `item_id` |
| `POST /api/external/inventory/check` | Kiểm tra tồn kho realtime |
| `POST /api/external/inventory/reserve` | Giữ hàng tạm thời |
| `POST /api/external/inventory/reservations/:reservationId/cancel` | Hủy giữ hàng |
| `POST /api/external/inventory/reservations/:reservationId/commit` | Commit giữ hàng và trừ tồn |
| `POST /api/external/orders/from-facebook` | Tạo đơn từ Facebook Ads CRM |
| `GET /api/external/orders/:orderId` | Lấy trạng thái/chi tiết đơn |
| `GET /api/external/orders/source/:sourceOrderId` | Lấy đơn theo mã của CRM |
| `POST /api/external/webhook/test` | Gửi webhook thử |
| `GET /api/external/webhook/deliveries` | Xem log gửi webhook gần nhất |

## 5. Product API

### GET `/api/external/products`

Query hỗ trợ: `page`, `limit`, `search`, `category`, `status`, `updatedSince`, `includeInventory`.

Response trả đủ giá:

```json
{
  "success": true,
  "data": [
    {
      "id": "40TACKE8X60MMK243",
      "platform": "shopee",
      "shopName": "chihuy1984",
      "sku": "40TACKE8X60MMK243",
      "name": "40 Tắc Kê 8mm x 60mm",
      "costPrice": 42000,
      "originalPrice": 139000,
      "salePrice": 90000,
      "currentPrice": 90000,
      "discountAmount": 49000,
      "discountPercent": 35.25,
      "currency": "VND",
      "stock": 211,
      "availableStock": 211,
      "reservedStock": 0,
      "priceUpdatedAt": "2026-05-15T00:00:00.000Z",
      "updatedAt": "2026-05-15T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

Note 2026-06-04:

- `GET /api/external/products` now returns Product Core content fields: `description`, `imageUrl`, `images[]`, `promptAssets.allImageUrls`, `promptAssets.promptText`.
- `GET /api/external/products/:id` returns Product Core detail with the same content fields and `variants[]`.
- `GET /api/external/products/sku/:sku` returns Product Core product data with `description`, `imageUrl`, `images[]`, and `promptAssets`.

### GET `/api/external/products/sku/:sku/price`

Facebook Ads CRM nên gọi API này trước khi tư vấn khách hoặc tạo đơn.

```json
{
  "success": true,
  "data": {
    "sku": "40TACKE8X60MMK243",
    "productId": "40TACKE8X60MMK243",
    "variantId": "40TACKE8X60MMK243",
    "name": "40 Tắc Kê 8mm x 60mm",
    "costPrice": 42000,
    "originalPrice": 139000,
    "salePrice": 90000,
    "currentPrice": 90000,
    "discountAmount": 49000,
    "discountPercent": 35.25,
    "currency": "VND",
    "priceUpdatedAt": "2026-05-15T00:00:00.000Z"
  }
}
```

### GET `/api/external/shopee/products/full`

API này dùng trực tiếp Shopee Open Platform cho các shop Shopee đã kết nối API trong hệ thống.

Query:

- `shop` bắt buộc: `chihuy1984`, `chihuy2309`, `phambich2312`
- `limit` tùy chọn: `1..100`, mặc định `20`
- `offset` tùy chọn: phân trang Shopee, mặc định `0`
- `item_status` tùy chọn: mặc định `NORMAL`
- `include_metrics` tùy chọn: mặc định `true`

Response trả sẵn:

- `item_name`
- `description`
- `images`
- `promotion_images`
- `videos`
- `models`
- `attributes`
- `brand`
- `price_info`
- `metrics`
- `prompt_assets.all_image_urls`
- `prompt_assets.prompt_text`

Ví dụ:

```bash
curl -H "Authorization: Bearer <API_KEY_FOR_FACEBOOK_CRM>" \
  "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/external/shopee/products/full?shop=chihuy1984&limit=20&item_status=NORMAL"
```

### GET `/api/external/shopee/products/full/:itemId`

Lấy chi tiết đầy đủ 1 item Shopee theo `item_id`.

Ví dụ:

```bash
curl -H "Authorization: Bearer <API_KEY_FOR_FACEBOOK_CRM>" \
  "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/external/shopee/products/full/24066761868?shop=chihuy1984"
```

## 6. Inventory API

### POST `/api/external/inventory/check`

```json
{
  "sku": "SP001",
  "quantity": 2
}
```

### POST `/api/external/inventory/reserve`

Nên gửi `Idempotency-Key` để chống retry tạo nhiều phiếu giữ hàng. Nếu không có key, hệ thống vẫn chống trùng theo `source + sourceConversationId + sku + active reservation`.

```json
{
  "sku": "SP001",
  "quantity": 2,
  "source": "facebook_crm",
  "sourceConversationId": "conv_001",
  "sourceCustomerId": "cus_001",
  "expiresInMinutes": 30,
  "note": "Khách đang chốt đơn từ inbox Facebook"
}
```

### POST `/api/external/inventory/reservations/:reservationId/cancel`

```json
{
  "reason": "Khách không xác nhận đơn"
}
```

### POST `/api/external/inventory/reservations/:reservationId/commit`

```json
{
  "orderId": "DHFB260515ABC123"
}
```

## 7. Order API

### POST `/api/external/orders/from-facebook`

`sourceOrderId` là idempotency key chính. Nếu CRM gửi lại cùng `sourceOrderId`, hệ thống trả về đơn đã tạo trước đó, không tạo đơn mới.

```json
{
  "source": "facebook_crm",
  "sourceOrderId": "fbcrm_order_001",
  "sourceConversationId": "conv_001",
  "sourcePageId": "page_001",
  "customer": {
    "name": "Nguyễn Văn A",
    "phone": "0900000000",
    "facebookId": "fb_123",
    "address": "Hà Nội"
  },
  "items": [
    {
      "sku": "SP001",
      "quantity": 2,
      "price": 90000,
      "originalPrice": 139000,
      "salePrice": 90000,
      "currentPrice": 90000,
      "reservationId": "1"
    }
  ],
  "shipping": {
    "address": "Hà Nội",
    "province": "Hà Nội",
    "district": "Cầu Giấy",
    "ward": "Dịch Vọng",
    "shippingFee": 30000
  },
  "payment": {
    "method": "cod",
    "status": "unpaid"
  },
  "note": "Đơn tạo từ inbox Facebook"
}
```

Hệ thống luôn kiểm tra lại `currentPrice` trong Product Master. Nếu giá CRM gửi đã cũ, đơn dùng giá hiện tại và trả `warnings`.

## 8. Webhook gửi sang Facebook Ads CRM

URL nhận webhook lấy từ `FACEBOOK_CRM_WEBHOOK_URL`.

Events:

```text
product.created
product.updated
product.price_updated
product.inactive
inventory.updated
inventory.low_stock
order.created
order.status_changed
order.cancelled
order.completed
order.returned
```

Header bắt buộc:

```http
X-Webhook-Event: inventory.updated
X-Webhook-Id: evt_001
X-Webhook-Timestamp: 2026-05-15T00:00:00.000Z
X-Webhook-Signature: sha256=<hmac_signature>
```

Signature:

```text
HMAC_SHA256(WEBHOOK_SECRET_FOR_FACEBOOK_CRM, rawBody)
```

Ví dụ verify Node.js:

```js
import crypto from 'node:crypto'

function verify(rawBody, headerSignature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSignature))
}
```

Webhook retry tối đa 3 lần. Kết quả ghi ở `webhook_delivery_logs` và xem nhanh qua `GET /api/external/webhook/deliveries`.

## 9. Biến môi trường

Trang Quản Lý TMĐT:

```env
API_KEY_FOR_FACEBOOK_CRM=""
WEBHOOK_SECRET_FOR_FACEBOOK_CRM=""
FACEBOOK_CRM_WEBHOOK_URL=""
```

Facebook Ads CRM:

```env
ECOMMERCE_API_BASE_URL="https://huyvan-worker-api.nghiemchihuy.workers.dev"
ECOMMERCE_API_KEY=""
ECOMMERCE_WEBHOOK_SECRET=""
MOCK_ECOMMERCE_API="false"
```

## 10. Curl test nhanh

```bash
BASE="https://huyvan-worker-api.nghiemchihuy.workers.dev"
KEY="<API_KEY_FOR_FACEBOOK_CRM>"

curl -H "Authorization: Bearer $KEY" "$BASE/api/external/products?limit=5"

curl -X POST "$BASE/api/external/inventory/check" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sku":"SP001","quantity":2}'

curl -X POST "$BASE/api/external/inventory/reserve" \
  -H "Authorization: Bearer $KEY" \
  -H "Idempotency-Key: conv_001_SP001" \
  -H "Content-Type: application/json" \
  -d '{"sku":"SP001","quantity":2,"source":"facebook_crm","sourceConversationId":"conv_001","sourceCustomerId":"cus_001","expiresInMinutes":30}'
```

## 11. Postman

Import file `docs/facebook-crm-postman-collection.json`, sau đó tạo environment:

```text
baseUrl=https://huyvan-worker-api.nghiemchihuy.workers.dev
apiKey=<API_KEY_FOR_FACEBOOK_CRM>
sku=<SKU_TEST>
reservationId=<RESERVATION_ID>
orderId=<ORDER_ID>
sourceOrderId=<SOURCE_ORDER_ID>
```

## 12. Mã lỗi

```text
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
PRODUCT_NOT_FOUND
SKU_NOT_FOUND
INSUFFICIENT_STOCK
RESERVATION_NOT_FOUND
RESERVATION_EXPIRED
RESERVATION_CANCELLED
RESERVATION_ALREADY_COMMITTED
ORDER_NOT_FOUND
DUPLICATE_SOURCE_ORDER
WEBHOOK_SEND_FAILED
INTERNAL_ERROR
```

## 13. Lưu ý vận hành

- `products` và `product_variations` là nguồn đọc sản phẩm/giá/tồn.
- `inventory_reservations` chỉ giữ phần tồn đang chờ khách chốt, không phải kho riêng.
- `orders_v2` và `order_items` là nguồn đơn hàng chính.
- API tạo đơn dùng giá hiện tại trong Product Master, không để CRM tự quyết định giá cuối.
- Không test `commit` hoặc `orders/from-facebook` trên production bằng SKU thật nếu chưa chốt quy trình hoàn kho/test data.
