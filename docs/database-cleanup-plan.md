# Database Cleanup Plan

## Bảng nhiều JSON/raw data

- `marketplace_webhook_events.payload`: giữ ngắn hạn để debug push, nên archive theo tháng sau khi event đã xử lý.
- `marketplace_push_sync_queue.payload/result`: giữ hàng đợi gần nhất, archive job `done` cũ sau 30-60 ngày.
- `marketplace_ads_campaign_snapshots.raw_data` và `marketplace_ads_hourly_snapshots.raw_data`: giữ snapshot gần để đối soát, archive theo tháng/quý.
- `marketplace_product_reviews.raw_data/media_payload`: giữ review gốc, archive review cũ đã phản hồi nếu dung lượng tăng.
- `marketplace_returns.items_json/images_json/buyer_videos_json/raw_data`: cần giữ cho khiếu nại, nhưng nên archive theo trạng thái đã đóng.
- `marketplace_return_reverse_ledger.detail_json/history_json/raw_data`: giữ cho đối soát hoàn tiền, archive theo kỳ đóng sổ.
- `marketplace_video_library.raw_data` và `marketplace_video_upload_queue.result_payload`: archive theo vòng đời video/job.
- `marketplace_discounts`, `marketplace_vouchers`, `marketplace_promotion_programs`, `marketplace_promotion_items`: có `raw_data/detail_raw_data`, nên giữ snapshot active và archive chương trình hết hạn.

## Cột tiền dạng REAL nên chuyển phase 2

Các bảng đang dùng `REAL` cho tiền gồm `orders_v2`, `order_items`, `order_fee_details`, `marketplace_ads_*`, `marketplace_returns`, `marketplace_return_reverse_ledger`, `product_variations`, `marketplace_discounts`, `marketplace_vouchers`, `marketplace_promotion_*`, `order_analytics`. Phase 2 nên thêm cột INTEGER VND mới, backfill theo batch nhỏ, đối chiếu sai số rồi mới chuyển code đọc nguồn mới.

## Bảng nghi temp/backup

- `order_items_backup_20260509_hygiene`: backup hygiene, chưa xoá vì cần kiểm chứng không còn dùng để rollback dữ liệu SKU/order item.
- File/schema dump và backup R2 do cron tạo không bị xoá trong phase này.

## Không làm trong phase này

- Không copy bảng lớn sang bảng mới.
- Không drop bảng backup/temp khi chưa có đối chiếu production.
- Không xóa raw payload khi chưa có chính sách archive và công cụ khôi phục.

## Phase 2 đề xuất

1. Đếm dung lượng và số dòng theo bảng trên D1 production.
2. Chốt TTL archive theo nhóm: webhook/queue 30-60 ngày, ADS/video theo tháng, returns/finance theo kỳ đóng sổ.
3. Tạo script archive đọc theo cursor, ghi R2 dạng nén, sau đó mới xóa batch nhỏ khỏi D1.
4. Chuẩn hóa tiền sang INTEGER VND bằng cột mới và job backfill kiểm soát.

