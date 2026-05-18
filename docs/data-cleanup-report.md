# Báo cáo chuẩn hóa dữ liệu cũ

Ngày cập nhật: 2026-05-14.

## Đã dọn

- `order_items` đã dọn exact duplicate theo cùng `order_id + sku + product_name + variation_name + image_url`: 540 dòng lặp được gộp.
- Số dòng `order_items` giảm từ 11.900 xuống 11.360, trong khi tổng `qty`, `revenue_line`, `cost_real`, `cost_invoice` được giữ nguyên theo báo cáo hygiene trước đó.
- Webhook có shop rỗng đã được gom về shop hệ thống `__system__` để không lẫn với shop bán hàng thật.

## Không nên xóa tiếp

- Không xóa các dòng `order_items` còn trùng theo SKU nếu khác `revenue_line`, `image_url`, tên sản phẩm hoặc phân loại. Nhóm này có thể là nhiều dòng hàng thật hoặc khác nguồn giá/ảnh.
- Không xóa đơn trong `orders_v2` nếu đơn có `revenue > 0`, kể cả khi thiếu `order_items`. Nhóm này phải backfill item từ API sàn hoặc giữ để đối soát doanh thu.

## Nhóm còn cần repair

- `orders_v2` còn đơn Shopee shop `chihuy1984` đã `COMPLETED`, có revenue, nhưng thiếu `order_items`.
- Endpoint mới: `GET/POST /api/orders/backfill-missing-items`.
- Cách repair: lấy danh sách `order_id` đang thiếu item trực tiếp từ DB, gọi Shopee `/api/v2/order/get_order_detail`, chỉ import detail có `item_list`, rồi ghi qua luồng import `orders_v2/order_items` hiện có.
- Endpoint repair đặt `suppress_push=true` và `skip_inventory=true` để không đẩy realtime lại và không trừ kho cho đơn lịch sử.

## Nguyên tắc an toàn

- Không xóa `orders_v2`.
- Không xóa `order_items` hợp lệ.
- Không insert placeholder cho shop có API.
- Không chạy sync tổng `/api/orders/sync-api-orders` trong endpoint repair.
- Không dùng fallback phí/vốn để thay thế dữ liệu tài chính thật khi endpoint sàn chưa đủ.

## Cập nhật kiểm tra 2026-05-14

- Endpoint repair `GET/POST /api/orders/backfill-missing-items` đã được giữ làm luồng riêng cho đơn cũ thiếu item, không gọi sync tổng theo `update_time`.
- Kết quả production gần nhất với shop Shopee `chihuy1984`: `missing_before=47`, `imported_items=61`, `missing_after=0`.
- Nhóm còn trùng theo SKU nhưng khác `revenue_line` hoặc `image_url` vẫn không xóa tiếp vì có thể là dòng hàng thật khác nguồn giá/ảnh.
- Đơn có `revenue > 0` tiếp tục được giữ để đối soát; nếu thiếu item thì backfill bằng detail API theo đúng `order_id`.
