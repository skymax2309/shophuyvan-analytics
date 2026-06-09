---
name: shophuyvan-order-core-guard
description: >
  Bắt buộc đọc trước khi: 
  (1) sửa bất kỳ field order/date/status/bucket/detail/customer/item trong OMS hoặc Worker, 
  (2) sửa sync_detail, pull_orders, refresh_status, hoặc manual date scan,
  (3) sửa order Core queues hoặc needs-retry/resync logic, 
  (4) sửa route/read-model trả order_status_core, fulfillment_status_core, oms_processing_bucket, marketplace_status,
  (5) sửa UI job payload chọn đơn cho label/finance/tracking/detail action, 
  (6) thêm hoặc đổi filter tab, date_field, hoặc action_type. Trigger kể cả khi task nhỏ như đổi label trạng thái hoặc thêm cột vào danh sách đơn.
---

# Shophuyvan Order Core Guard

## Core Rule

Order Core sở hữu order id, date fields, marketplace status, normalized status, OMS bucket, order detail, customer evidence, item evidence, và source timestamps. UI không tự lọc nghiệp vụ theo tab, không tự tính eligible, không tự map trạng thái.

## Required Read

Trước khi sửa, đọc `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `docs/PROJECT-CURRENT-STATE.md`, `docs/warehouse-core-map.md`, `docs/core-data-map.md`, `docs/marketplace-endpoint-master-checklist.md`, và `docs/marketplace-endpoint-progress.md`.

## Order Core Contract

- Giữ `marketplace_status` là trạng thái sàn/raw platform status. Không gọi API status sai.
- Chuẩn hoá status/bucket vào field Core riêng như `order_status_core`, `fulfillment_status_core`, `display_status_vi`, `terminal_status`, và `oms_processing_bucket`.
- Order Item Core sở hữu item/SKU/product original amount/item amount evidence.
- Customer Core hoặc Order detail Core sở hữu người mua, người nhận, địa chỉ, phone, và detail source.
- Thiếu detail/customer/item phải được ghi source/missing/fail rõ trong Core/read-model.

## Manual Date Scan

- Filter bắt buộc: `platform`, `shop`, `action_type`, `from_date`, `to_date`, `date_field`, `limit`, `dry_run`.
- `date_field` chỉ nhận `created_at`, `updated_at`, `status_updated_at`, hoặc `last_synced_at`.
- `action_type` chỉ nhận `retry_label`, `sync_finance`, `refresh_tracking`, `sync_detail`, hoặc `scan_all_errors`.
- `action_type` cho OMS vận hành cũng phải hỗ trợ `pull_orders` và `refresh_status` khi chạy thủ công qua job/API chuẩn.
- Quét theo ngày lấy toàn bộ đơn trong khoảng ngày từ Order Core rồi kiểm Core tương ứng.
- `manual date scan` không phụ thuộc needs-retry flag hiện tại.
- `scan_all_errors` chỉ dry-run tổng hợp label, finance, tracking, detail; không chạy live trực tiếp.

## Dry-Run And Live Run

- Mọi quét thủ công theo ngày phải dry-run trước.
- Dry-run trả `total_orders_in_date_range`, `eligible_count`, `skipped_count`, per-order `action`, `skip_reason`, `source_core`, `current_status`, và runner/API path.
- Không có dry-run thì không cho live.
- Live chỉ chạy danh sách `order_id` đã chọn từ dry-run result.
- Web tạo job; local runner polling job; Python chạy action; kết quả ghi lại Core; UI không gọi thẳng Python.

## Regression And Report

- Khoá regression cho manual date scan, dry-run contract, live selected-list, UI job payload, và `sync_detail` eligibility.
- Sau khi sửa lỗi OMS/manual action phải mở OMS production, thao tác đúng nút/flow, kiểm job về trạng thái cuối, Core readback và OMS readback. Không được báo pass khi job chỉ `queued` hoặc `running`.
- Nếu `pull_orders`, `refresh_status`, hoặc `sync_detail` cần browser, runner phải mở Chrome visible/headful bằng profile automation chuẩn và log `headless=false`.
- Báo cáo cuối ghi Order Core/read-model field, route/job, job log, Core readback, test, production dry-run, live sample, OMS production result, và xác nhận UI không quét theo tab.

## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra thật; không được lặp lại:

- **UI tự lọc/map trạng thái**: UI tự dịch `marketplace_status` hoặc tự tính bucket thay vì đọc `order_status_core`/`oms_processing_bucket` từ Core → vi phạm. UI chỉ render field Core đã chuẩn hoá.
- **UI tự tính eligible**: UI tự quyết đơn nào hiện ở tab nào dựa trên logic frontend → vi phạm. Eligible phải do Core/route trả về.
- **`scan_all_errors` chạy live**: `scan_all_errors` chỉ được dry-run tổng hợp, không được chạy live trực tiếp. Live phải chạy từng `action_type` riêng với selected list.
- **Live run không có dry-run trước**: chạy `sync_detail`, `retry_label`, `sync_finance`, `refresh_tracking` live mà không có dry-run selected list → vi phạm.
- **`date_field` tự chọn ngoài danh sách**: dùng field ngày không phải `created_at`, `updated_at`, `status_updated_at`, `last_synced_at` → vi phạm contract.
- **`action_type` tự thêm ngoài danh sách**: thêm action_type mới mà không cập nhật contract và guard → vi phạm.
- **Manual date scan phụ thuộc needs-retry flag**: bỏ qua đơn vì `needs_retry=false` hoặc `needs_resync=false` → vi phạm. Manual date scan đọc toàn bộ đơn trong khoảng ngày rồi kiểm Core tương ứng.
- **Báo pass khi job chỉ `queued`/`running`**: không chờ job về trạng thái cuối, không Core readback → không được báo pass.
- **Thiếu detail/customer/item không ghi Core**: bỏ qua lỗi parse mà không ghi `missing`/`fail`/source vào Core → agent sau không biết đơn đó thiếu gì.
- **UI gọi thẳng Python**: UI trigger Python runner trực tiếp thay vì tạo job → vi phạm. Web tạo job, local runner polling, Python chạy action.

## Quick Checklist Trước Khi Commit

- [ ] UI chỉ đọc `order_status_core`, `oms_processing_bucket`, `display_status_vi` từ Core — không tự map `marketplace_status`
- [ ] `date_field` chỉ nhận một trong bốn giá trị contract: `created_at`, `updated_at`, `status_updated_at`, `last_synced_at`
- [ ] `action_type` chỉ nhận giá trị trong contract; nếu thêm mới phải cập nhật contract và guard
- [ ] `scan_all_errors` chỉ dry-run — không có code path live trực tiếp
- [ ] Manual date scan không bỏ đơn vì `needs_retry=false` hoặc `needs_resync=false`
- [ ] Dry-run trả đủ: `total_orders_in_date_range`, `eligible_count`, `skipped_count`, per-order `action`/`skip_reason`/`source_core`/`current_status`/runner path
- [ ] Live chỉ chạy `order_id` từ dry-run selected list — không chạy lại toàn bộ date range
- [ ] Thiếu detail/customer/item đã được ghi source/missing/fail vào Core/read-model
- [ ] UI không gọi thẳng Python — chỉ tạo job
- [ ] Đã mở OMS production, chờ job về trạng thái cuối, kiểm Core readback và OMS readback
