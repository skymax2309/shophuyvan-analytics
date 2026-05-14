# SQL Optimization Report

## Phạm vi

Đợt này tối ưu các query đang ảnh hưởng trực tiếp đến shop API, kéo đơn, realtime/polling, OMS, chat, ADS, review, return, product/SKU và video. Migration an toàn nằm tại `docs/migrations/001_refactor_api_sync_realtime_indexes.sql`.

## Query chính đã tối ưu

- `orders_v2` lọc theo `platform`, `shop`, `order_date`, `oms_status`, `shipping_status` cho OMS, dashboard và batch sync.
- `order_items` join theo `order_id` và tra SKU.
- `shops` tra shop API theo `platform`, `shop_name`, `api_shop_id`, `api_user_id`.
- `marketplace_webhook_events` đọc realtime theo `platform`, `shop`, `order_id`, `event_code`, `processed_at`.
- `marketplace_push_sync_queue` lấy job theo `status`, `run_after` và đối chiếu theo `platform`, `shop`, `order_id`.
- Chat, ADS, review, returns, product/SKU, discounts/promotions/vouchers và video được thêm index theo các filter đang dùng nhiều nhất.

## Index đã thêm

Migration chỉ dùng `CREATE INDEX IF NOT EXISTS`, không drop/copy dữ liệu. Các index lớn nhất có thể tăng dung lượng là nhóm `orders_v2`, `order_items`, `marketplace_chat_messages`, `marketplace_ads_campaign_snapshots`, `marketplace_product_reviews`, `marketplace_video_library` vì đây là các bảng có khả năng tăng dòng theo thời gian.

Không tạo index riêng cho `orders_v2(order_id)` và `marketplace_push_sync_queue(queue_key)` vì schema đã có unique/primary key tương ứng.

## Ghi chú an toàn

- Không có `DROP TABLE`, `DROP COLUMN`, rename table hoặc `CREATE TABLE AS SELECT`.
- Không tạo bảng duplicate dữ liệu đơn/sản phẩm/review/chat/ads/video.
- Các cột diagnostic mới của `shops` được code thêm bằng guard runtime để tránh migration lỗi khi cột đã tồn tại. Migration hiện chỉ thêm index trên cột đã có trong schema dump.
- Đã chạy migration trên production D1 remote bằng `npx wrangler d1 execute huyvan-analytics-db --remote --file=..\..\docs\migrations\001_refactor_api_sync_realtime_indexes.sql`.
- Kết quả D1 remote: xử lý `47` query, thời gian `1204.05ms`, đọc `253644` dòng, ghi `125704` dòng, dung lượng DB sau migrate `212.19MB`, bookmark `00000b7f-0000013a-0000506b-5969d9fb66d304ea730cded30757b3ed`.
- Phần dung lượng tăng đến từ index, không đến từ copy dữ liệu. Nhóm tăng đáng kể nhất dự kiến là `orders_v2`, `order_items`, webhook/push queue, chat messages, ADS snapshots, reviews, returns, product variations và video queue/library.
- Đã chạy lệnh `EXPLAIN QUERY PLAN` trên production D1 cho 3 query ưu tiên bên dưới. Wrangler chỉ trả thống kê tổng hợp `Processed 3 queries` và không in chi tiết từng dòng plan trong output, nên report chưa ghi được plan text cụ thể.

## Query đã chạy EXPLAIN sau migrate

```sql
EXPLAIN QUERY PLAN
SELECT order_id FROM orders_v2
WHERE platform = 'shopee' AND shop = ? AND order_date >= ?
ORDER BY order_date DESC LIMIT 100;

EXPLAIN QUERY PLAN
SELECT order_id FROM orders_v2
WHERE platform = 'shopee' AND shop = ? AND oms_status = ?
ORDER BY oms_updated_at DESC LIMIT 100;

EXPLAIN QUERY PLAN
SELECT * FROM marketplace_push_sync_queue
WHERE status = 'queued' AND run_after <= datetime('now')
ORDER BY priority ASC, run_after ASC LIMIT 10;
```
