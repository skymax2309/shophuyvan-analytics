---
name: shophuyvan-warehouse-core-guard
description: "use when working on shophuyvan chat/cskh, oms, product master, order core, finance/fee core, dashboard, profit, export, shopee/lazada/tiktok marketplace adapters, legacy cleanup, or any task where data may be duplicated or displayed inconsistently across screens. enforces the warehouse core rule: marketplace/import/manual data must enter the central warehouse first, and all ui/modules read normalized data from warehouse rather than patching screens directly."
---

# Shophuyvan Warehouse Core Guard

## Core rule

Thiếu gì thì nhập vào Nhà Kho trước. Màn hình chỉ lấy từ Nhà Kho. Không vá màn hình, không tạo nguồn dữ liệu thứ hai.

## Required pass

1. Đọc `AGENTS.md`, `docs/PROJECT-CURRENT-STATE.md`, `docs/warehouse-core-map.md`, `docs/core-data-map.md`, `docs/shop-order-product-core-plan.md` và docs refactor liên quan trước khi sửa. Nếu `docs/PROJECT-CURRENT-STATE.md` chưa tồn tại, tạo file này trước khi sửa code.
2. Trace runtime bằng `rg` trước khi đụng code: route registration, imports, helper calls, frontend fetches, schema/migrations và docs.
3. Xác định write path vào Warehouse/Core và read path từ Warehouse/Core. Nếu UI/API/export đang tính từ raw hoặc legacy table, chuyển về Core/Warehouse reader phù hợp.
4. Trước khi xoá legacy, kiểm caller/import/route/network/test. Nếu chưa chắc, cắt khỏi runtime và ghi rõ lý do chưa xoá.
Khi đọc các file trên, xác định cụ thể:
- `PROJECT-CURRENT-STATE.md`: phần nào đã chốt không làm lại, phần nào còn mở.
- `warehouse-core-map.md` và `core-data-map.md`: write path và read path đang dùng cho domain đang sửa.
- `shop-order-product-core-plan.md`: migration nào đã xong, migration nào chưa.
- Docs refactor liên quan: caller/import nào còn active, cái nào đã deprecated.
## API Endpoint First Guard

- Shop API phải ưu tiên Open Platform chính thức.
- Thiếu field/endpoint thì phải tra docs trước.
- Không báo thiếu endpoint nếu chưa kiểm.
- Không dùng cost setting, Seller Center, local helper làm nguồn chính cho shop API nếu Open Platform có endpoint.
- Nếu endpoint có nhưng thiếu quyền/token thì ghi `api_permission_missing` hoặc `token_scope_missing`.
- Nếu endpoint không có thì ghi `endpoint_not_available` và docs đã kiểm.
- Báo cáo cuối phải ghi endpoint đã kiểm, endpoint đã dùng, endpoint thiếu quyền/token, endpoint không có và lý do fallback.

## Project State Guard

- Phải đọc `docs/PROJECT-CURRENT-STATE.md` trước khi sửa.
- Phải cập nhật file này sau khi sửa.
- Không làm lại phần đã chốt trong file này.
- Không dựa vào lịch sử chat dài thay cho file trạng thái dự án.

## Worktree / Legacy / Dirty Data Guard

- Trước khi sửa phải chạy `git status` và phân biệt file đã bẩn từ trước với file sẽ sửa trong lượt hiện tại.
- Mỗi lượt sửa Core/Warehouse phải kiểm code legacy liên quan trực tiếp: route registration, imports, frontend fetch, scheduled jobs, local helper, tests và production request.
- Không để route/helper cũ chạy song song với Core mới; nếu route public cũ còn caller chưa dọn được thì giữ wrapper/`410` rõ, không giữ business logic cũ.
- Phân loại file bẩn: Core chuẩn giữ; wrapper/`410` giữ nếu cần; local helper còn dùng giữ; deprecated thì đánh dấu; chỉ xoá khi không còn caller/import/route/network/test.
- Nếu sửa dữ liệu, phải kiểm D1 dirty data trong phạm vi: duplicate, orphan, stale diagnostic, raw/debug/cache/temp table hoặc row quá cũ.
- Phải kiểm Python runner/helper cũ khi task chạm marketplace automation, label, status, report hoặc Seller Center fallback.
- Cập nhật `docs/PROJECT-CURRENT-STATE.md` với cleanup status, file legacy đã xoá/disable, file còn nghi ngờ và lý do chưa xoá.

## Browser Automation Safety Guard

- Profile automation riêng.
- Profile automation chỉ nằm trong `E:\shophuyvan-python-automation\profiles\browser` và phải resolve qua profile map chung.
- Profile map chung phải có `source`; API shop dùng `source=api`, no-API/TikTok local dùng `source=local_browser`.
- Không kill Chrome toàn cục.
- Không dùng profile user.
- Có lock/heartbeat/pause/stop.
- Có cooldown/retry/backoff.
- Có diagnostic UI.
- TikTok không loop.
- Shopee no-API/TikTok local helper không được ảnh hưởng Chrome user.
- Shop API không dùng Chrome/Seller Center fallback nếu Open Platform/Worker API có endpoint hoặc chưa chứng minh thiếu endpoint/quyền.

## Core/Warehouse Guard

- OMS chỉ hiển thị từ Core/read model.
- Không tự map trạng thái ở UI.
- Không tự tính finance ngoài Finance Core.
- Không tự routing source ngoài resolver.
- Shop API không Seller Center fallback.
- Seller Center fallback chỉ dành cho `khogiadungcona`.
- TikTok fallback/local helper chỉ dành cho `0909128999`.
- Order/label automation phải tách `pull_orders`, `refresh_status`, `sync_detail`, `sync_finance`, `retry_label`; mỗi action ghi về Core/Warehouse tương ứng.
- OMS list phải đọc read model/Core nhẹ; raw payload, fee/tracking/chat/detail lớn chỉ lazy-load khi người dùng mở chi tiết.

## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra thật; không được lặp lại:

- **Vá màn hình thay vì nhập Warehouse**: thêm field tính toán vào UI hoặc route riêng thay vì
  ghi vào Core/Warehouse trước → vi phạm Core rule. Trace write path vào Warehouse trước khi
  thêm bất kỳ field nào ra UI.
- **Combo map bị overwrite**: `sync_detail`/`sync_finance`/parser ghi `mapping_status=unmapped`
  đè lên combo map đã lưu → vi phạm Product/Combo Guard. Parser không thấy SKU thì không xoá
  map cũ.
- **Cost bị xoá khi SKU đổi**: parser thấy SKU đổi thì xoá `unit_cost`/`cogs_total` →
  vi phạm. Phải chuyển `needs_review`, giữ cost snapshot, không xoá cost.
- **`show_update_cost_button=true` khi đã có cost**: Core trả nút cập nhật vốn dù đã có
  `unit_cost`/`combo_map`/`cost_snapshot` hợp lệ → vi phạm Product/Combo Guard.
- **Voucher shop lẫn vào phí sàn**: `shop_discount` hoặc seller voucher nằm trong
  `marketplace_fee_total` hoặc label `Phí sàn` → vi phạm Finance taxonomy.
- **Trừ phí/voucher hai lần**: revenue basis là `actual_income` nhưng vẫn trừ thêm phí/voucher
  đã nằm trong settlement → vi phạm Finance taxonomy.
- **API shop dùng Seller Center fallback**: shop Shopee/Lazada API bị route về Seller Center
  hoặc local helper khi Open Platform có endpoint → vi phạm API Endpoint First Guard.
- **Xoá legacy khi còn caller**: xoá route/helper mà chưa `rg` toàn repo kiểm caller →
  vi phạm Cleanup Rules. Phải đủ 8 điều kiện trong `references/cleanup-rules.md` mới được xoá.
- **Route cũ chạy song song Core mới**: giữ business logic cũ thay vì wrapper/410 →
  vi phạm Worktree/Legacy Guard.
- **Báo pass khi chưa có OMS readback**: test script pass nhưng không mở OMS production kiểm
  đúng đơn/tab/field bị lỗi → không được báo pass.
- **Không cập nhật PROJECT-CURRENT-STATE.md**: sửa xong không ghi lại field, source, route,
  deploy version, cleanup status → vi phạm Project State Guard.
## Product / Cost / Combo Guard

- Product/Warehouse Core quản SKU, vốn, combo map, purchase cost, mapping và cost snapshot.
- UI không tự quyết định cost/mapping và không dùng `mapping_status` đơn lẻ để hiện nút vốn.
- Có vốn hợp lệ từ `unit_cost`, `item_cost_total`, `cogs_total`, `product_core`, `combo_map`, `purchase_core`, `manual_map` hoặc `cost_snapshot` thì Core phải trả `show_update_cost_button=false`.
- Chỉ trả `show_update_cost_button=true` khi `cost_status=missing`, toàn bộ cost field là `null` và không có mapping/snapshot hợp lệ.
- Combo map phải persist vào Core/DB; sau khi lưu phải refetch read-model và pass readback sau F5.
- Sync detail/finance/parser không được overwrite `mapping_status` thành `unmapped` khi đã có combo map hợp lệ.
- Parser không thấy SKU thì không xoá map cũ; SKU đổi thật thì chuyển `needs_review`, giữ cost snapshot, không xoá cost.
- Code thừa đi vòng Product/Warehouse Core phải xoá sau khi đã `rg` production/test/docs/job/action caller.
- Nếu caller còn active nhưng đang đi sai Core, sửa caller đọc Product/Warehouse Core trước rồi xoá helper/fallback cũ.

## Mandatory architecture

Marketplace API / import / browser helper / nhập tay
→ Warehouse Core / Nhà Kho Chuẩn
→ Chat / OMS / Product / Dashboard / Profit / Export / CRM

## What UI is allowed to do

UI chỉ render field đã normalize và gọi endpoint đọc chuẩn. UI không tự gọi API sàn, không tự map trạng thái đơn, không tự tính phí/lãi, không tự đoán tên shop.

## Finance taxonomy checklist

Khi đụng OMS/Profit/Dashboard/Export/Finance, bắt buộc kiểm:

- `shop_discount`, voucher shop, seller discount không được lẫn vào `marketplace_fee_total`.
- Nếu revenue basis là `buyer_paid` / `Người mua thanh toán`, profit không được trừ voucher shop lần hai.
- Nếu revenue basis là `actual_income` / settlement, profit không được trừ lại phí/voucher đã nằm trong settlement.
- Nhãn `Phí sàn` chỉ chứa khoản sàn thu; nếu gom nhiều nhóm thì dùng `Tổng khấu trừ`.
- Card/popup/table/export không được để voucher shop nằm dưới `Phí sàn`.
- Popup phí OMS phải click-to-open/pinned, không hover-only.
- Mỗi dòng phí/khấu trừ phải có số tiền và `%` với basis rõ ràng.
- Re-render OMS list phải giữ popup đang mở nếu order còn trên màn hình, và đóng nếu order biến mất.

## What adapters are allowed to do

Marketplace adapter chỉ gọi API sàn, normalize, rồi ghi vào Warehouse. Adapter không trả dữ liệu trực tiếp cho UI.

## Required reference files

- `references/warehouse-contract.md`
- `references/marketplace-adapter-contract.md`
- `references/cleanup-rules.md`
- `references/verification-checklist.md`

## Quick Checklist Trước Khi Báo Pass

### Core/Warehouse
- [ ] Đã đọc `docs/PROJECT-CURRENT-STATE.md` trước khi sửa
- [ ] Write path vào Warehouse/Core đã xác định — không vá màn hình trực tiếp
- [ ] UI chỉ render field đã normalize từ Core/read-model
- [ ] Không có nguồn dữ liệu thứ hai song song Core

### API Endpoint
- [ ] Shop API đi Open Platform trước — không dùng Seller Center fallback nếu endpoint có
- [ ] Endpoint thiếu quyền ghi `api_permission_missing`, endpoint không có ghi `endpoint_not_available`
- [ ] Báo cáo ghi rõ endpoint đã kiểm / đã dùng / thiếu quyền / không có

### Product/Combo/Cost
- [ ] Combo map không bị overwrite bởi sync/parser
- [ ] SKU đổi → `needs_review` + giữ cost snapshot, không xoá cost
- [ ] `show_update_cost_button` chỉ `true` khi `cost_status=missing` và toàn bộ cost field `null`

### Finance
- [ ] `shop_discount`/voucher shop không lẫn vào `marketplace_fee_total`
- [ ] Không trừ phí/voucher hai lần khi revenue basis là `actual_income`
- [ ] Label `Phí sàn` chỉ chứa khoản sàn thu; nếu gom nhiều nhóm dùng `Tổng khấu trừ`

### Legacy/Cleanup
- [ ] Đã `rg` toàn repo kiểm caller trước khi xoá bất kỳ route/helper nào
- [ ] Route public cũ còn caller → giữ wrapper/410, không giữ business logic cũ
- [ ] File legacy xoá/disable đã ghi vào `docs/PROJECT-CURRENT-STATE.md`

### Verification
- [ ] `npm test`, `node --check`, `git diff --check`, scan mojibake đã pass
- [ ] Đã mở OMS production, kiểm đúng đơn/tab/field bị lỗi — không chỉ chạy test script
- [ ] `docs/PROJECT-CURRENT-STATE.md` đã cập nhật fields, sources, route/file, deploy version, cleanup status