---
name: shophuyvan-finance-core-guard
description: >
  Bắt buộc đọc trước khi: 
  (1) sửa bất kỳ field tài chính/phí/settlement trong OMS hoặc Worker,
  (2) viết hoặc đọc finance parser/API/Seller Center, 
  (3) sửa sync_finance, resync queue,cost-setting fallback, 
  (4) sửa route/read-model trả buyer payment, marketplace fee,estimated/actual income, settlement status, 
  (5) sửa Profit/Dashboard/Export finance reads.
  Trigger kể cả khi task có vẻ nhỏ như đổi label hoặc thêm field hiển thị.
---

# Shophuyvan Finance Core Guard

## Core Rule

Tài chính, phí, settlement, nguồn dữ liệu, confidence, cost-setting fallback, và actual/estimated income thuộc Finance Core. Parser/API/Seller Center ghi bằng chứng vào Core. UI và route chỉ đọc read-model đã chuẩn hoá.

## Required Read

Trước khi sửa, đọc `AGENTS.md`, `shophuyvan-core-first-guard`, `shophuyvan-warehouse-core-guard`, `shophuyvan-automation-guard`, `docs/PROJECT-CURRENT-STATE.md`, `docs/warehouse-core-map.md`, `docs/core-data-map.md`, `docs/marketplace-endpoint-master-checklist.md`, và `docs/marketplace-endpoint-progress.md`.

## Finance Core Contract

- Finance Core sở hữu `finance_needs_resync`, `finance_sync_status`, `finance_source`, `finance_confidence`, `settlement_status`, `actual_income`, `estimated_income`, `settlement_total`, `last_finance_synced_at`, `next_finance_retry_at`, `last_finance_error`, `fee_lines`, payment breakdown, seller breakdown, và `raw_payload`.
- `0` là dữ liệu thật khi source trả `0`. `null` là thiếu dữ liệu hoặc chưa chốt.
- Cost setting chỉ là fallback có source/confidence/status rõ. Cost setting không được thay dữ liệu sàn, không được render thành phí sàn, không được che mất field đã quét.
- Settlement pending chỉ làm `actual_income=null`. Settlement pending không được ẩn payment method, buyer-paid fields, product amount fields, fee lines, hoặc seller/payment breakdown đã quét.

## TikTok Seller Center Finance

- `finance_source` dùng nguồn thật đã quét, ví dụ `tiktok_seller_center_detail` hoặc `tiktok_seller_center_finance_transaction`.
- `product_after_discount` giữ đúng số đã quét từ TikTok Seller Center.
- `estimated_income` giữ thực nhận dự kiến hoặc basis tạm tính theo parser/Core.
- `actual_income` chỉ có giá trị khi settlement đã chốt.
- `fee_lines` phải giữ từng dòng phí đã quét; SFR/service fee là một fee line, không phải toàn bộ phí sàn và không phải `actual_income`.
- Không copy field khác để lấp dữ liệu thiếu.

## TikTok Finance Lock

- TikTok Seller Center là nguồn chuẩn cho doanh thu, phí sàn, thuế, SFR và settlement pending/confirmed.
- `ADS ngoài ví` và `PiShip` không thuộc phí sàn TikTok; khi Seller Center không trả dòng ngoài ví thì Finance Core lấy từ Cost Setting để trừ lợi nhuận.
- `ADS ngoài ví` và `PiShip` Cost Setting chỉ nằm trong nhóm `Phí vận hành / Cost setting` và tab `Lợi nhuận`; không được cộng vào `platform_deduction_total`, `total_deductions`, `marketplace_fee_total`, `tax_total` hoặc label `Tổng khấu trừ`.
- `tiktok_sfr_fee/sfr_service_fee` đã quét từ Seller Center vẫn là fee line sàn; không được nâng thành `actual_income` và không được dùng để che `PiShip` Cost Setting.
- Regression bắt buộc phải khóa các field: `estimated_income`, `actual_income=null` khi pending, `ads_fee_total`, `piship_fee`, `ops_cost_setting_total`, `platform_deduction_total`, `profit_real_display`.

## Resync Queue

- Đưa đơn vào `finance_resync_queue` khi `finance_needs_resync=true`.
- Đưa đơn vào queue khi `finance_sync_status` là `missing`, `fallback_only`, `estimated_from_cost_setting`, `pending_settlement`, `pending_return_settlement`, hoặc `failed`.
- Đưa đơn vào queue khi `finance_source=cost_setting_fallback`.
- Đưa đơn terminal vào queue khi finance chưa settled hoặc `last_finance_synced_at` cũ hơn `status_updated_at`.

## Manual Date Scan

- `sync_finance` đọc Order Core và Finance Core.
- Eligible gồm đơn thiếu tài chính, cost-setting fallback, pending settlement, pending return settlement, failed, và terminal chưa quét lại settlement.
- Không bỏ qua đơn đã giao, hoàn thành, huỷ, hoàn hàng chỉ vì trạng thái terminal.
- Quét theo khoảng ngày phải dry-run trước và live chỉ chạy `order_id` từ dry-run selected list.

## Regression And Report

- Khoá regression cho TikTok breakdown, settlement pending, cost-setting exclusion, finance resync queue, terminal finance, manual date scan, dry-run, live selected-list, và UI job payload.
- Sau khi sửa lỗi finance OMS phải mở OMS production, kiểm đúng đơn/tab tài chính bị lỗi, Core readback và OMS readback. Không được báo pass nếu UI vẫn mất field đã quét, chỉ hiện một dòng phí, hoặc render cost setting thay dữ liệu sàn.
- Nếu `sync_finance` cần Seller Center/browser, runner phải mở Chrome visible/headful bằng profile automation chuẩn và log `headless=false`.
- Báo cáo cuối ghi parser/Core/read-model/UI đã sửa, source thật, Core readback, route/job, test, production dry-run, live sample, OMS production result, và xác nhận không chạy Payment live batch.

  ## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra thật; không được lặp lại:

- **Copy field để lấp dữ liệu**: dùng `sfr_service_fee` thay `actual_income`, hoặc dùng `estimated_income` thay field đã quét → vi phạm. Field thiếu phải để `null`, không được copy field khác vào.
- **Cost setting che dữ liệu sàn**: render cost setting vào nhóm phí sàn hoặc `platform_deduction_total` → vi phạm. Cost setting chỉ nằm trong nhóm `Phí vận hành / Cost setting`.
- **Settlement pending xoá field**: ẩn `payment_method`, `buyer_paid`, `product_amount`, `fee_lines` khi `settlement_status=pending` → vi phạm. Pending chỉ làm `actual_income=null`.
- **`0` bị coi là thiếu dữ liệu**: thay `0` bằng `null` hoặc bỏ qua → vi phạm. `0` là dữ liệu thật khi source trả `0`.
- **Render một dòng phí duy nhất**: gộp tất cả phí thành một số hoặc chỉ hiện SFR thay vì từng `fee_lines` → vi phạm.
- **Báo pass khi UI mất field**: chạy test pass nhưng không mở OMS production kiểm tab tài chính thật → không được báo pass.
- **Live batch chạy không qua dry-run**: `sync_finance` live chạy không qua `dry-run selected list` → vi phạm quy trình.
- **ADS ngoài ví / PiShip cộng vào phí sàn**: cộng hai khoản cost setting này vào `platform_deduction_total` hoặc `total_deductions` → vi phạm TikTok Finance Lock.

## Quick Checklist Trước Khi Commit

- [ ] `actual_income=null` khi settlement pending, không ẩn field khác
- [ ] `0` không bị đổi thành `null` hoặc bị bỏ qua
- [ ] `fee_lines` đủ từng dòng đã quét, không gộp
- [ ] Cost setting không xuất hiện trong nhóm phí sàn hoặc `platform_deduction_total`
- [ ] ADS ngoài ví và PiShip không cộng vào `total_deductions`/`marketplace_fee_total`
- [ ] `finance_source` dùng nguồn thật, không phải `cost_setting_fallback` khi đã có dữ liệu sàn
- [ ] Đã mở OMS production, kiểm tab tài chính đúng đơn bị lỗi (không chỉ chạy test script)
- [ ] `sync_finance` live chỉ chạy `order_id` từ dry-run selected list
- [ ] Không chạy Payment live batch