---
name: shophuyvan-label-tracking-core-guard
description: >
  Bắt buộc đọc trước khi: 
  (1) sửa bất kỳ field label/PDF/chứng từ trong OMS hoặc Worker,
  (2) sửa retry_label, label_retry_queue, hoặc logic tải/tải lại tem, 
  (3) sửa tracking number,carrier, events[], refresh_tracking, tracking_resync_queue, 
  (4) sửa route/read-model trả label_status, tracking_sync_status, label_file_path, hoặc timeline giao vận, 
  (5) sửa Python runner liên quan đến tem hoặc vận đơn. Trigger kể cả khi task nhỏ như đổi label hiển thị hoặc thêm field timeline.
---

# Shophuyvan Label Tracking Core Guard

## Core Rule

Tem, PDF, và chứng từ thuộc Label Core. Mã vận đơn, carrier, timeline, và event giao vận thuộc Tracking Core. Python chỉ là runner/parser; kết quả cuối phải ghi Core rồi OMS đọc lại từ read-model. UI chỉ render field Core và chỉ gửi job.

## Required Read

Trước khi sửa, đọc `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `docs/PROJECT-CURRENT-STATE.md`, `docs/warehouse-core-map.md`, `docs/core-data-map.md`, `docs/marketplace-endpoint-master-checklist.md`, và `docs/marketplace-endpoint-progress.md`.

## Label Core Contract

- Label Core sở hữu `label_needs_retry`, `label_status`, `label_reason`, `label_error`, `label_file_path`, `retry_count`, `max_retry`, `next_label_retry_at`, `last_label_synced_at`, `label_source`, và `raw_payload`.
- Đưa đơn vào `label_retry_queue` khi `label_status` là `pending_retry`, `document_generating`, `not_ready`, `missing_file`, hoặc `failed`.
- Đưa đơn vào `label_retry_queue` khi `label_file_path=null` và Tracking Core có `tracking_number` thật.
- `label_valid=true` chỉ khi file tem hợp lệ theo extension/mime/storage metadata. File `.html` hoặc diagnostic/placeholder không phải tem PDF hợp lệ và không được render “Đã tải tem”.
- `retry_label` chỉ tải hoặc tải lại chứng từ/tem. Cấm gọi ship, arrange, confirm, cancel.
- Shop API đi endpoint chứng từ chính thức trước. Shop no-API/TikTok dùng runner được map qua Automation Guard.

## Tracking Core Contract

- Tracking Core sở hữu `tracking_needs_resync`, `tracking_sync_status`, `tracking_number`, `carrier`, `events[]`, `last_tracking_synced_at`, `next_tracking_retry_at`, `last_tracking_error`, và `raw_payload`.
- Đưa đơn vào `tracking_resync_queue` khi `tracking_sync_status` là `missing`, `stale`, hoặc `failed`.
- Đưa đơn vào `tracking_resync_queue` khi đơn cần vận chuyển nhưng `tracking_number=null`.
- Đưa đơn vào `tracking_resync_queue` khi `events[]` rỗng trong lúc `tracking_number` có giá trị thật.
- Đưa đơn vào `tracking_resync_queue` khi `last_tracking_synced_at` cũ hơn `status_updated_at`.

## Manual Date Scan

- `retry_label` đọc Order Core, Label Core, và Tracking Core; chỉ eligible đơn có `tracking_number` thật và thiếu file tem hoặc label status lỗi.
- `refresh_tracking` đọc Order Core và Tracking Core; eligible đơn thiếu tracking, timeline rỗng, stale, hoặc failed.
- Quét theo khoảng ngày phải dry-run trước, trả total, eligible, skipped, per-order action, skip_reason, source_core, current_status, và runner/API path.
- Live run chỉ nhận `order_id` từ dry-run selected list.

## Regression And Report

- Khoá regression cho label retry queue, tracking resync queue, manual date scan, dry-run, live selected-list, và UI job payload.
- Sau khi sửa lỗi label/tracking OMS phải mở OMS production, kiểm đúng đơn/màn hình/timeline/row action bị lỗi, Core readback và OMS readback. Không được báo pass khi production UI còn hiện “Đã tải tem”, “Có mã vận đơn”, hoặc “Đã đóng gói” giả.
- Nếu `retry_label` hoặc `refresh_tracking` cần Seller Center/browser, runner phải mở Chrome visible/headful bằng profile automation chuẩn và log `headless=false`.
- Báo cáo cuối ghi route/job đã dùng, runner/API path, Core readback, OMS production result, hành động bị chặn, và xác nhận không gọi ship/arrange/confirm/cancel.

## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra thật; không được lặp lại:

- **File `.html` hoặc placeholder render thành "Đã tải tem"**: chỉ file hợp lệ theo extension/mime/storage mới được render label hợp lệ. Bất kỳ file diagnostic/placeholder nào phải bị treat là `label_valid=false`.
- **`retry_label` gọi ship/arrange/confirm/cancel**: retry_label chỉ được tải hoặc tải lại chứng từ. Cấm tuyệt đối gọi các action thay đổi trạng thái đơn.
- **Báo "Có mã vận đơn" khi `tracking_number=null`**: UI không được suy diễn tracking từ field khác; nếu Core trả `null` thì hiện thiếu.
- **Live run không qua dry-run**: chạy `retry_label` hoặc `refresh_tracking` live trực tiếp mà không có dry-run selected list → vi phạm quy trình.
- **`events[]` rỗng không đưa vào resync queue**: đơn có `tracking_number` thật nhưng `events[]` rỗng phải vào `tracking_resync_queue`, không được bỏ qua.
- **Shop no-API dùng endpoint chính thức**: shop no-API và TikTok phải đi runner qua Automation Guard, không được gọi thẳng endpoint API chứng từ.
- **Báo pass khi UI production vẫn sai**: test script pass nhưng không mở OMS production kiểm đúng đơn/tab → không được báo pass.
- **`last_tracking_synced_at` cũ hơn `status_updated_at` nhưng không resync**: stale tracking phải vào queue, không được bỏ qua vì đơn đã terminal.

## Quick Checklist Trước Khi Commit

- [ ] `label_valid=true` chỉ khi file hợp lệ theo extension/mime/storage — không phải `.html` hoặc placeholder
- [ ] `retry_label` không gọi ship/arrange/confirm/cancel ở bất kỳ code path nào
- [ ] Đơn có `tracking_number` thật + `events[]` rỗng đã được đưa vào `tracking_resync_queue`
- [ ] Đơn có `tracking_number=null` + cần vận chuyển đã được đưa vào `tracking_resync_queue`
- [ ] `last_tracking_synced_at` cũ hơn `status_updated_at` → đã vào resync queue
- [ ] Live run chỉ nhận `order_id` từ dry-run selected list
- [ ] Shop no-API/TikTok đi runner qua Automation Guard, không gọi thẳng endpoint API
- [ ] Đã mở OMS production, kiểm đúng đơn/tab label hoặc timeline bị lỗi — không chỉ chạy test script
- [ ] Không có "Đã tải tem", "Có mã vận đơn", "Đã đóng gói" giả trên UI production
