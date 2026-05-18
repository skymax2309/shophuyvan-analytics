# PROMPT CODEX - TẠO API + WEBHOOK CHO TRANG QUẢN LÝ TMĐT

## Mục tiêu

Dùng prompt này trong repo **Trang Quản Lý TMĐT** để yêu cầu Codex tạo bộ **API + Webhook** cho app **Facebook Ads CRM** kết nối vào.

Hệ thống **Trang Quản Lý TMĐT** sẽ là nguồn dữ liệu gốc cho:

- Sản phẩm
- SKU
- Tồn kho
- Giữ hàng
- Đơn hàng
- Trạng thái đơn hàng

App **Facebook Ads CRM** chỉ kết nối qua API để:

- Lấy sản phẩm
- Xem tồn kho
- Kiểm tra tồn kho
- Giữ hàng
- Tạo đơn
- Theo dõi trạng thái đơn
- Nhận webhook khi sản phẩm/tồn kho/đơn hàng thay đổi

---

# PROMPT GỬI CHO CODEX

Bạn là Senior Backend Engineer, API Architect, QA Engineer và Technical Writer.

Tôi đang có một hệ thống riêng tên là **Trang Quản Lý TMĐT** dùng để quản lý sản phẩm, tồn kho và đơn hàng.

Tôi muốn tạo bộ **External API + Webhook** để một phần mềm khác tên là **Facebook Ads CRM** có thể kết nối vào.

## 1. Mục tiêu chính

Hãy tạo API chính thức cho hệ thống Trang Quản Lý TMĐT để Facebook Ads CRM có thể:

1. Lấy danh sách sản phẩm.
2. Lấy chi tiết sản phẩm.
3. Lấy sản phẩm theo SKU.
4. Kiểm tra tồn kho realtime.
5. Giữ hàng tạm thời khi khách đang chốt đơn.
6. Hủy giữ hàng.
7. Commit giữ hàng để tạo đơn/trừ kho chính thức.
8. Tạo đơn hàng từ Facebook/inbox/comment/chatbot.
9. Lấy trạng thái đơn hàng.
10. Lấy đơn hàng theo mã đơn từ Facebook Ads CRM.
11. Nhận webhook khi sản phẩm, tồn kho hoặc đơn hàng thay đổi.
12. Đảm bảo Trang Quản Lý TMĐT là nguồn dữ liệu gốc cho Product, SKU, Inventory và Order.
13. Không để app Facebook Ads CRM tự trừ tồn kho. Mọi việc giữ hàng, trừ kho, hoàn kho phải do Trang Quản Lý TMĐT xử lý.

## 2. Nguyên tắc kiến trúc

- Trang Quản Lý TMĐT là **Product Master**.
- Trang Quản Lý TMĐT là **Inventory Master**.
- Trang Quản Lý TMĐT là **Order Master**.
- Facebook Ads CRM chỉ là kênh bán/marketing bên ngoài.
- Facebook Ads CRM không được tự trừ tồn kho local.
- Facebook Ads CRM chỉ gửi yêu cầu:
  - check inventory.
  - reserve inventory.
  - cancel reservation.
  - create order.
  - get order status.
- Tồn kho chỉ được thay đổi trong Trang Quản Lý TMĐT.
- Nếu Facebook Ads CRM có cache sản phẩm/tồn kho thì cache đó chỉ là read model, không phải dữ liệu gốc.

## 3. Yêu cầu bảo mật

1. Tất cả API `/api/external/*` phải có xác thực.
2. Hỗ trợ một trong hai cách:
   - `Authorization: Bearer <API_KEY_FOR_FACEBOOK_CRM>`
   - hoặc `X-API-Key: <API_KEY_FOR_FACEBOOK_CRM>`
3. Không hard-code secret.
4. Tạo hoặc cập nhật `.env.example` gồm:

```env
API_KEY_FOR_FACEBOOK_CRM=""
WEBHOOK_SECRET_FOR_FACEBOOK_CRM=""
FACEBOOK_CRM_WEBHOOK_URL=""
```

5. Webhook gửi sang Facebook Ads CRM phải ký bằng HMAC SHA256.
6. Tạo helper ký webhook.
7. Tạo helper verify webhook signature.
8. Webhook header bắt buộc:

```http
X-Webhook-Event: inventory.updated
X-Webhook-Id: evt_001
X-Webhook-Timestamp: 2026-05-15T00:00:00.000Z
X-Webhook-Signature: sha256=<hmac_signature>
```

9. Signature:

```text
HMAC_SHA256(WEBHOOK_SECRET_FOR_FACEBOOK_CRM, rawBody)
```

10. API lỗi phải trả JSON chuẩn, không trả lỗi thô.
11. Ghi log cho các hành động quan trọng.
12. Không ghi API key/token ra log.
13. Thêm cơ chế idempotency cho API tạo đơn và giữ hàng nếu có thể.

## 4. Chuẩn response API

Tất cả API thành công trả dạng:

```json
{
  "success": true,
  "data": {},
  "message": "OK"
}
```

API có phân trang trả dạng:

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

API lỗi trả dạng:

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

## 5. Mã lỗi cần có

Tạo error code rõ ràng:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `PRODUCT_NOT_FOUND`
- `SKU_NOT_FOUND`
- `INSUFFICIENT_STOCK`
- `RESERVATION_NOT_FOUND`
- `RESERVATION_EXPIRED`
- `RESERVATION_CANCELLED`
- `RESERVATION_ALREADY_COMMITTED`
- `ORDER_NOT_FOUND`
- `DUPLICATE_SOURCE_ORDER`
- `WEBHOOK_SEND_FAILED`
- `INTERNAL_ERROR`

## 6. Yêu cầu database/model

Nếu hệ thống đã có bảng sản phẩm, tồn kho, đơn hàng thì tái sử dụng.

Nếu thiếu, hãy bổ sung migration/model cần thiết.

Cần đảm bảo có hoặc tạo các bảng/model chính:

1. Product
2. ProductVariant nếu có biến thể.
3. Inventory
4. InventoryReservation
5. Order
6. OrderItem
7. ApiIntegrationLog
8. WebhookDeliveryLog

### InventoryReservation

Cần có các trường:

- id
- reservationCode
- sku
- productId
- quantity
- source
- sourceConversationId
- sourceCustomerId
- status: active, cancelled, committed, expired
- expiresAt
- createdAt
- updatedAt

### WebhookDeliveryLog

Cần có các trường:

- id
- eventType
- eventId
- targetUrl
- payload
- signature
- status: pending, success, failed
- responseStatus
- responseBody
- retryCount
- lastError
- createdAt
- updatedAt

### ApiIntegrationLog

Cần có các trường:

- id
- action
- method
- path
- requestId
- source
- status
- errorCode
- message
- metadata
- createdAt

## 7. API cần tạo

### 7.1. Lấy danh sách sản phẩm

```http
GET /api/external/products
```

Query hỗ trợ:

- page
- limit
- search
- category
- status
- updatedSince
- includeInventory=true/false

Response mẫu:

```json
{
  "success": true,
  "data": [
    {
      "id": "prod_001",
      "sku": "SP001",
      "name": "Bột thông cống Yuhao",
      "category": "Hàng gia dụng",
      "description": "Mô tả sản phẩm",
      "price": 99000,
      "costPrice": 42000,
      "imageUrl": "https://...",
      "status": "active",
      "stock": 100,
      "availableStock": 90,
      "reservedStock": 10,
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

### 7.2. Lấy chi tiết sản phẩm

```http
GET /api/external/products/:id
```

### 7.3. Lấy sản phẩm theo SKU

```http
GET /api/external/products/sku/:sku
```

### 7.4. Kiểm tra tồn kho realtime

```http
POST /api/external/inventory/check
```

Body:

```json
{
  "sku": "SP001",
  "quantity": 2
}
```

Response:

```json
{
  "success": true,
  "data": {
    "sku": "SP001",
    "requestedQuantity": 2,
    "stock": 100,
    "reservedStock": 10,
    "availableStock": 90,
    "canSell": true,
    "message": "Còn đủ hàng"
  }
}
```

### 7.5. Giữ hàng tạm thời

```http
POST /api/external/inventory/reserve
```

Body:

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

Response:

```json
{
  "success": true,
  "data": {
    "reservationId": "res_001",
    "reservationCode": "RSV-000001",
    "sku": "SP001",
    "quantity": 2,
    "status": "active",
    "expiresAt": "2026-05-15T00:30:00.000Z"
  }
}
```

### 7.6. Hủy giữ hàng

```http
POST /api/external/inventory/reservations/:reservationId/cancel
```

Body:

```json
{
  "reason": "Khách không xác nhận đơn"
}
```

### 7.7. Commit giữ hàng và trừ tồn kho

```http
POST /api/external/inventory/reservations/:reservationId/commit
```

Body:

```json
{
  "orderId": "ord_001"
}
```

### 7.8. Tạo đơn từ Facebook CRM

```http
POST /api/external/orders/from-facebook
```

Body:

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
      "price": 99000,
      "reservationId": "res_001"
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

Response:

```json
{
  "success": true,
  "data": {
    "orderId": "ord_001",
    "orderCode": "DH000001",
    "status": "new",
    "totalAmount": 198000,
    "shippingFee": 30000,
    "grandTotal": 228000,
    "inventoryStatus": "committed"
  }
}
```

Yêu cầu quan trọng:

- `sourceOrderId` phải idempotent.
- Nếu Facebook CRM gửi lại cùng `sourceOrderId`, không tạo đơn trùng.
- Trả về đơn đã tạo trước đó.

### 7.9. Lấy trạng thái đơn

```http
GET /api/external/orders/:orderId
```

### 7.10. Lấy đơn theo sourceOrderId

```http
GET /api/external/orders/source/:sourceOrderId
```

### 7.11. Test webhook

```http
POST /api/external/webhook/test
```

Mục đích: test gửi webhook thử sang Facebook Ads CRM.

## 8. Webhook cần gửi sang Facebook Ads CRM

Trang Quản Lý TMĐT phải gửi webhook sang URL:

```env
FACEBOOK_CRM_WEBHOOK_URL
```

### 8.1. product.created

Khi có sản phẩm mới.

### 8.2. product.updated

Khi sản phẩm thay đổi tên, giá, mô tả, trạng thái, ảnh.

### 8.3. product.inactive

Khi sản phẩm ngừng bán.

### 8.4. inventory.updated

Khi tồn kho thay đổi.

Payload:

```json
{
  "event": "inventory.updated",
  "eventId": "evt_001",
  "createdAt": "2026-05-15T00:00:00.000Z",
  "data": {
    "sku": "SP001",
    "productId": "prod_001",
    "stock": 100,
    "availableStock": 90,
    "reservedStock": 10,
    "updatedAt": "2026-05-15T00:00:00.000Z"
  }
}
```

### 8.5. inventory.low_stock

Khi sản phẩm sắp hết hàng.

### 8.6. order.created

Khi đơn hàng được tạo.

### 8.7. order.status_changed

Khi đơn đổi trạng thái.

Payload:

```json
{
  "event": "order.status_changed",
  "eventId": "evt_002",
  "createdAt": "2026-05-15T00:00:00.000Z",
  "data": {
    "orderId": "ord_001",
    "orderCode": "DH000001",
    "sourceOrderId": "fbcrm_order_001",
    "oldStatus": "new",
    "newStatus": "shipping",
    "trackingCode": "GHN123456",
    "updatedAt": "2026-05-15T00:00:00.000Z"
  }
}
```

### 8.8. order.cancelled

Khi đơn bị hủy.

### 8.9. order.completed

Khi đơn thành công.

### 8.10. order.returned

Khi đơn hoàn.

## 9. Yêu cầu webhook delivery

1. Khi có event, gửi POST tới `FACEBOOK_CRM_WEBHOOK_URL`.
2. Body gửi đi là JSON raw body.
3. Header gồm:
   - `X-Webhook-Event`
   - `X-Webhook-Id`
   - `X-Webhook-Timestamp`
   - `X-Webhook-Signature`
4. Nếu gửi thành công, ghi `WebhookDeliveryLog.status = success`.
5. Nếu gửi thất bại, ghi `WebhookDeliveryLog.status = failed`.
6. Có retry tối đa 3 lần.
7. Không làm crash luồng chính nếu webhook fail.
8. Nếu project có queue/job background thì dùng queue.
9. Nếu project chưa có queue, tạo service retry đơn giản hoặc ghi log để admin retry manual.
10. Tạo API hoặc màn hình admin xem webhook delivery log nếu phù hợp.

## 10. Idempotency và chống trùng

Cần xử lý chống trùng cho:

1. `POST /api/external/orders/from-facebook`
   - Dựa vào `sourceOrderId`.
   - Nếu đã tồn tại, trả về đơn cũ.

2. `POST /api/external/inventory/reserve`
   - Nếu request có `sourceConversationId + sku + active reservation` thì cân nhắc trả reservation hiện có hoặc tạo mới tùy logic.
   - Không để giữ hàng trùng quá nhiều do request retry.

3. Webhook event
   - Mỗi event có `eventId`.
   - Ghi log eventId để tiện trace.

## 11. Logging

Ghi log cho:

- check inventory.
- reserve inventory.
- cancel reservation.
- commit reservation.
- create order from Facebook.
- get order status.
- update order status.
- send webhook.
- webhook failed.
- webhook retry.
- unauthorized API request.

Không log secret/token.

## 12. Documentation cần tạo

Tạo file:

```text
docs/facebook-crm-api.md
```

Nội dung gồm:

1. Tổng quan.
2. Authentication.
3. Base URL.
4. Danh sách API.
5. Request/response mẫu từng API.
6. Danh sách webhook events.
7. Payload mẫu webhook.
8. Cách ký webhook.
9. Cách verify signature.
10. Danh sách biến môi trường.
11. Cách test bằng curl.
12. Cách test bằng Postman.
13. Mã lỗi.
14. Lưu ý idempotency.
15. Những lỗi thường gặp.

Nếu có thể, tạo thêm:

```text
docs/facebook-crm-openapi.json
```

hoặc

```text
openapi/facebook-crm-api.yaml
```

để mô tả API theo chuẩn OpenAPI 3.0.

Nếu có thể, tạo thêm Postman collection:

```text
docs/facebook-crm-postman-collection.json
```

## 13. Testing

Hãy viết test hoặc tạo manual test script cho:

1. API bị từ chối nếu thiếu API key.
2. API bị từ chối nếu API key sai.
3. Lấy danh sách sản phẩm.
4. Lấy chi tiết sản phẩm.
5. Lấy sản phẩm theo SKU.
6. Check inventory đủ hàng.
7. Check inventory hết hàng.
8. Reserve inventory thành công.
9. Reserve inventory khi không đủ hàng.
10. Cancel reservation.
11. Commit reservation.
12. Commit reservation đã expired.
13. Tạo đơn từ Facebook thành công.
14. Tạo đơn khi SKU không tồn tại.
15. Tạo đơn khi không đủ tồn kho.
16. Tạo đơn trùng `sourceOrderId` không sinh đơn mới.
17. Gửi webhook `inventory.updated`.
18. Gửi webhook `order.status_changed`.
19. Verify webhook signature.
20. Webhook fail thì ghi log và retry.

## 14. Lệnh kiểm tra

Sau khi code, hãy tự chạy các lệnh phù hợp với project hiện tại, ví dụ:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Nếu project không có script nào, hãy:

1. Không tự bịa kết quả.
2. Tạo script nếu phù hợp.
3. Hoặc ghi rõ script chưa tồn tại và hướng dẫn thêm.

Nếu có lỗi, hãy tự sửa và chạy lại.

## 15. Kết quả cuối cần báo cáo bằng tiếng Việt

Sau khi hoàn thành, hãy báo cáo:

1. Đã tạo những API nào.
2. Đã tạo webhook nào.
3. File đã tạo/sửa.
4. Model/database đã bổ sung.
5. Biến môi trường cần cấu hình.
6. Lệnh đã chạy.
7. Kết quả test/build.
8. Cách test API bằng curl/Postman.
9. Cách lấy tài liệu API để gửi lại cho ChatGPT.
10. Những phần cần tôi cung cấp thêm nếu muốn kết nối thật với Facebook Ads CRM.

---

# DANH SÁCH API CẦN LƯU LẠI

Sau khi Codex làm xong, bạn lưu lại danh sách này.

## 1. Lấy danh sách sản phẩm

```http
GET /api/external/products
```

## 2. Lấy chi tiết sản phẩm

```http
GET /api/external/products/:id
```

## 3. Lấy sản phẩm theo SKU

```http
GET /api/external/products/sku/:sku
```

## 4. Kiểm tra tồn kho

```http
POST /api/external/inventory/check
```

Body:

```json
{
  "sku": "SP001",
  "quantity": 2
}
```

## 5. Giữ hàng

```http
POST /api/external/inventory/reserve
```

Body:

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

## 6. Hủy giữ hàng

```http
POST /api/external/inventory/reservations/:reservationId/cancel
```

Body:

```json
{
  "reason": "Khách không xác nhận đơn"
}
```

## 7. Commit giữ hàng và trừ kho

```http
POST /api/external/inventory/reservations/:reservationId/commit
```

Body:

```json
{
  "orderId": "ord_001"
}
```

## 8. Tạo đơn từ Facebook CRM

```http
POST /api/external/orders/from-facebook
```

## 9. Lấy trạng thái đơn hàng

```http
GET /api/external/orders/:orderId
```

## 10. Lấy đơn theo sourceOrderId

```http
GET /api/external/orders/source/:sourceOrderId
```

## 11. Test webhook

```http
POST /api/external/webhook/test
```

---

# DANH SÁCH WEBHOOK CẦN LƯU LẠI

## 1. product.created

Sản phẩm mới.

## 2. product.updated

Sản phẩm được cập nhật.

## 3. product.inactive

Sản phẩm ngừng bán.

## 4. inventory.updated

Tồn kho thay đổi.

## 5. inventory.low_stock

Sản phẩm sắp hết hàng.

## 6. order.created

Đơn hàng mới.

## 7. order.status_changed

Đơn hàng đổi trạng thái.

## 8. order.cancelled

Đơn bị hủy.

## 9. order.completed

Đơn thành công.

## 10. order.returned

Đơn hoàn.

---

# BIẾN MÔI TRƯỜNG BÊN TRANG QUẢN LÝ TMĐT

```env
API_KEY_FOR_FACEBOOK_CRM=""
WEBHOOK_SECRET_FOR_FACEBOOK_CRM=""
FACEBOOK_CRM_WEBHOOK_URL=""
```

# BIẾN MÔI TRƯỜNG BÊN FACEBOOK ADS CRM SAU NÀY

```env
ECOMMERCE_API_BASE_URL=""
ECOMMERCE_API_KEY=""
ECOMMERCE_WEBHOOK_SECRET=""
MOCK_ECOMMERCE_API="false"
```

---

# MẪU THÔNG TIN GỬI LẠI CHO CHATGPT SAU KHI CODEX LÀM XONG

Copy mẫu này và điền thông tin thật:

```text
Đây là API bên Trang Quản Lý TMĐT của mình:

Base URL:
https://...

Auth:
Bearer token hoặc API key: ...

Danh sách API:
1. GET /api/external/products
2. GET /api/external/products/:id
3. GET /api/external/products/sku/:sku
4. POST /api/external/inventory/check
5. POST /api/external/inventory/reserve
6. POST /api/external/inventory/reservations/:reservationId/cancel
7. POST /api/external/inventory/reservations/:reservationId/commit
8. POST /api/external/orders/from-facebook
9. GET /api/external/orders/:orderId
10. GET /api/external/orders/source/:sourceOrderId
11. POST /api/external/webhook/test

Webhook sẽ gửi sang Facebook Ads CRM:
1. product.created
2. product.updated
3. product.inactive
4. inventory.updated
5. inventory.low_stock
6. order.created
7. order.status_changed
8. order.cancelled
9. order.completed
10. order.returned

Webhook signature:
HMAC SHA256 raw body bằng ECOMMERCE_WEBHOOK_SECRET.

File tài liệu API:
docs/facebook-crm-api.md

OpenAPI/Postman nếu có:
...

Ghi chú thêm:
...
```

---

# CHECKLIST NGHIỆM THU

Trước khi xem là hoàn thành, cần kiểm tra:

- [ ] API lấy sản phẩm chạy được.
- [ ] API lấy tồn kho chạy được.
- [ ] API giữ hàng chạy được.
- [ ] API hủy giữ hàng chạy được.
- [ ] API commit giữ hàng chạy được.
- [ ] API tạo đơn từ Facebook CRM chạy được.
- [ ] Tạo đơn trùng sourceOrderId không bị nhân đôi.
- [ ] API thiếu key bị chặn.
- [ ] Webhook có HMAC signature.
- [ ] Webhook inventory.updated gửi được.
- [ ] Webhook order.status_changed gửi được.
- [ ] Webhook fail có log.
- [ ] Có tài liệu docs/facebook-crm-api.md.
- [ ] Có .env.example.
- [ ] Không hard-code secret.
- [ ] Test/lint/build pass hoặc có ghi chú lỗi rõ ràng.
