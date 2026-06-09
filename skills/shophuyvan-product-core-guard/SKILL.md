# ShopHuyVan Product Core Guard
---
name: shophuyvan-product-core-guard
description: >
  Bắt buộc đọc trước khi: 
  (1) sửa Product Master, SKU, variation mapping, combo, stock, cost, price, product image, marketplace listing trong OMS hoặc Worker, 
  (2) sửa route/read-model trả product/SKU/combo/stock/price/cost, 
  (3) sửa sync sản phẩm từ Marketplace API hoặc Seller Center,
  (4) sửa ADS, Dashboard, Profit, Export, CRM khi đọc product data, 
  (5) xoá hoặc migrate legacy product mapping logic. Trigger kể cả khi task nhỏ như đổi label giá hoặc thêm cột tồn kho.
------

Use this skill before editing Product Master, SKU, variation mapping, combo, stock, cost, price, product image, marketplace listing, or product read-model flows in `E:\shophuyvan-analytics`.

## Rules

- Product/Warehouse Core is the source of truth for product, SKU, variation, combo, stock, price, cost, and marketplace mapping.
- UI only renders Product Core read-model fields. Do not compute business totals in the UI when the value belongs in Product Core.
- For combo SKUs, compute price/cost/stock from component SKUs in Product Core. A combo linked from two products must expose the sum of component prices instead of showing missing price.
- `0` is a real value when the source returns `0`; `null` means missing data. Do not copy another field to hide missing price/cost/stock.
- Marketplace API/Seller Center data must be written into Product/Warehouse Core first, then read by Product Master, OMS, ADS, Dashboard, Profit, Export, and CRM.
- Do not keep parallel legacy product mapping logic. If an active caller still uses the old path, move that caller to Product Core before deleting the old path.

## Required Reads

- `AGENTS.md`
- `docs/PROJECT-CURRENT-STATE.md`
- `docs/warehouse-core-map.md`
- `docs/core-data-map.md`
- `docs/shop-order-product-core-plan.md`

## Verification

- Run syntax/tests for changed product files.
- Open the real Product Master UI with profile `E:\codex-chrome-profiles\shophuyvan-test`.
- Verify mobile, tablet, and desktop layouts when UI changes.
- For combo fixes, verify Product Core/read-model returns the combo price and the Product Master row no longer shows `Chưa có giá`.
- Update `docs/PROJECT-CURRENT-STATE.md` with fields, sources, route/file, tests, deploy version, and remaining cleanup.

## Anti-patterns Hay Tái Hiện

Những lỗi dưới đây đã xảy ra thật; không được lặp lại:

- **Combo hiện `Chưa có giá`**: không tổng hợp price/cost/stock từ component SKU trong Product Core → vi phạm. Combo phải expose tổng component, không để missing.
- **Copy field để lấp giá thiếu**: dùng `cost` thay `price` hoặc ngược lại khi field thiếu → vi phạm. `null` là thiếu dữ liệu; không được copy field khác để che.
- **`0` bị coi là thiếu**: thay `0` bằng `null` hoặc bỏ qua giá/tồn = 0 → vi phạm. `0` là dữ liệu thật khi source trả `0`.
- **UI tự tính business total**: UI tự cộng giá combo, tự tính tồn, tự tính cost thay vì đọc từ Product Core read-model → vi phạm.
- **Xoá legacy path khi còn caller active**: xoá mapping cũ trước khi move caller sang Product Core → vi phạm. Phải move caller trước, xoá sau.
- **Marketplace data không qua Core**: parser/API ghi thẳng vào UI state hoặc local variable mà không ghi Product/Warehouse Core trước → vi phạm.
- **Báo pass khi Product Master UI vẫn sai**: chạy test script pass nhưng không mở Product Master production kiểm đúng SKU/combo bị lỗi → không được báo pass.
- **Không kiểm responsive**: sửa UI product mà không kiểm mobile/tablet/desktop → vi phạm Verification contract.

## Quick Checklist Trước Khi Commit

- [ ] Combo SKU trả đúng tổng price/cost/stock từ component — không còn `Chưa có giá`
- [ ] `0` không bị đổi thành `null` hoặc bị bỏ qua ở bất kỳ price/cost/stock field nào
- [ ] UI không tự tính business total — chỉ render field từ Product Core read-model
- [ ] Marketplace data đã ghi vào Product/Warehouse Core trước khi UI đọc
- [ ] Legacy mapping path: nếu có caller active, đã move caller sang Product Core trước khi xoá path cũ
- [ ] Syntax/test cho file product đã sửa đã pass
- [ ] Đã mở Product Master UI với Chrome profile `E:\codex-chrome-profiles\shophuyvan-test`, kiểm đúng SKU/combo bị lỗi
- [ ] Đã kiểm mobile, tablet, desktop nếu có thay đổi UI
- [ ] `docs/PROJECT-CURRENT-STATE.md` đã cập nhật fields, sources, route/file, tests, deploy version

## Product Core Contract

- Product Core sở hữu `sku`, `product_name`, `variation_name`, `price`, `cost`, `stock`,
  `combo_components`, `marketplace_listing_id`, `listing_status`, `product_image_url`,
  `last_synced_at`, `sync_status`, `sync_source`, và `raw_payload`.
- Combo SKU phải có `combo_components[]` với đủ `component_sku`, `quantity`, `unit_price`, `unit_cost`.
- `listing_status` là trạng thái sàn raw. Chuẩn hoá vào field riêng như `display_status_vi`.
- Thiếu price/cost/stock phải ghi `sync_status=missing` và `sync_source` rõ trong Core — không được để trống im lặng.

## Product Sync Queue

- Đưa sản phẩm vào sync queue khi `sync_status` là `missing`, `stale`, `failed`, hoặc `fallback_only`.
- Đưa combo vào sync queue khi bất kỳ `combo_components[]` nào thiếu `unit_price` hoặc `unit_cost`.
- Đưa sản phẩm vào sync queue khi `last_synced_at` cũ hơn `status_updated_at` của listing.
- Không bỏ qua sản phẩm đã `inactive`/`delisted` nếu OMS/Finance/ADS còn đọc SKU đó.

## Bulk Sync And Rebuild

- Rebuild Product Core theo khoảng ngày hoặc SKU list phải dry-run trước.
- Dry-run trả `total_skus`, `eligible`, `skipped`, per-SKU `action`/`skip_reason`/`sync_source`.
- Live chỉ chạy SKU list từ dry-run selected list.
- Không rebuild toàn bộ catalog live mà không có dry-run và sampling trước.