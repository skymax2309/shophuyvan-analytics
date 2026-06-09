# Báo cáo làm sạch D1 - 2026-05-09

## Phạm vi đã kiểm tra

- `orders_v2`, `order_items`, `order_analytics`, `order_fee_details`
- `products`, `product_variations`, `sku_mapping`
- `purchase_invoices`, `invoice_sku_map`, `purchase_orders`
- `marketplace_chat_conversations`, `marketplace_chat_messages`
- `marketplace_video_library`, `marketplace_video_item_links`, `packing_videos`
- `marketplace_returns`, `marketplace_return_reverse_ledger`, `return_receive_scans`

## Dữ liệu đã làm sạch thật

- Bảng `order_items` có 540 dòng lặp theo cùng `order_id + sku + product_name + variation_name + image_url`.
- Đã gộp các dòng lặp này bằng cách cộng `qty`, `revenue_line`, `cost_real`, `cost_invoice`.
- Số dòng giảm từ `11.900` xuống `11.360`.
- Tổng số lượng, doanh thu, giá vốn thực và giá vốn hóa đơn giữ nguyên:
  - `qty`: `16.837`
  - `revenue_line`: `702.300.601`
  - `cost_real`: `286.918.676`
  - `cost_invoice`: `197.002.624,138`
- Sau cleanup, số nhóm trùng cùng khóa item còn `0`.
- Backup trước cleanup đang giữ tại `order_items_backup_20260509_hygiene` để rollback nếu phát hiện lệch UI hoặc báo cáo.

## Code đã chặn tái phát sinh

- Luồng import `orders_v2 + order_items` đã gộp item sau khi map SKU và tính giá vốn.
- Quy tắc gộp: cùng `đơn + SKU + tên sản phẩm + phân loại + ảnh` thì cộng số lượng, doanh thu và giá vốn.
- Mục tiêu là D1 chỉ lưu một dòng vận hành cho mỗi SKU trong đơn, thay vì nhiều dòng lặp khó đọc.

## Bảng đã kiểm tra và đang sạch

- `orders_v2`: `9.654` đơn, không trùng `order_id`.
- `products`: `313` SKU, không trùng `sku`.
- `product_variations`: `1.588` dòng, không trùng khóa `platform + shop + item + model + platform_sku`.
- `order_fee_details`: `464` dòng, không trùng `order_id`.
- `purchase_invoices`: `45` hóa đơn, không trùng `invoice_no`.
- `invoice_sku_map`: `133` dòng map, không trùng `invoice_name`.
- `marketplace_chat_conversations`: `295` hội thoại, không trùng khóa hội thoại.
- `marketplace_chat_messages`: `877` tin nhắn, không trùng khóa tin nhắn.
- `marketplace_video_library`: `66` video, không trùng khóa video.
- `marketplace_video_item_links`: `58` liên kết video - sản phẩm, không trùng khóa liên kết.
- `packing_videos`: `2` video đóng gói, không trùng `order_id + video_url`.
- `marketplace_returns`, `marketplace_return_reverse_ledger`, `return_receive_scans`: hiện chưa có dòng dữ liệu.

## Rủi ro còn lại

- `sku_mapping` vẫn là schema cũ chỉ có `platform_sku` và `internal_sku`, chưa có `platform/shop`. Bảng hiện đang rỗng nên chưa làm sai dữ liệu, nhưng nếu dùng lại sẽ dễ map nhầm giữa shop hoặc giữa sàn.
- `purchase_orders` có nhiều dòng cùng `ma_van_don`; đây là dữ liệu nhiều sản phẩm trong cùng vận đơn, không được xem là trùng nếu `ma_hang/ten_san_pham` khác nhau.
- Có `145` đơn mà tổng `order_items.revenue_line` lớn hơn `orders_v2.revenue` theo ngưỡng cảnh báo. Nhóm này chưa cleanup vì có thể do `orders_v2.revenue` là tiền sau giảm/phí, còn item là giá hàng gốc. Cần audit theo từng nguồn sàn trước khi sửa.

## Bước tiếp theo

- Nếu muốn sạch tuyệt đối sau khi xác nhận UI ổn, xóa bảng backup `order_items_backup_20260509_hygiene`.
- Nên nâng schema `sku_mapping` hoặc bỏ dùng bảng này, chuyển toàn bộ map SKU qua `product_variations` có đủ `platform + shop`.
- Nên thêm màn hình/endpoint audit D1 dạng dry-run để mỗi lần import lớn có thể tự báo bảng nào đang phát sinh trùng.
